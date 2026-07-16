<?php

// Phalcon Micro front controller: the contract as thin route closures, plus request-id
// and a single error-envelope path. Phalcon Micro is close to the metal, so the wiring
// is explicit here — the deliberate contrast with the heavier frameworks.

declare(strict_types=1);

use App\Bootstrap;
use App\Domain\DomainException;
use App\Domain\Errors;
use App\Http\Dto;
use Phalcon\Di\FactoryDefault;
use Phalcon\Mvc\Micro;

require __DIR__ . '/../vendor/autoload.php';

$svc = Bootstrap::build();
$app = new Micro(new FactoryDefault());
$request = $app->request;

$requestId = $request->getHeader('X-Request-Id') ?: bin2hex(random_bytes(8));

// Set the response to a JSON envelope and return it. $data === null means no body.
$json = function (?array $data, int $status) use ($app, $requestId) {
    $r = $app->response;
    $r->setStatusCode($status);
    $r->setHeader('X-Request-Id', $requestId);
    $r->setContentType('application/json', 'UTF-8');
    if ($data !== null) {
        $r->setContent(json_encode($data));
    }
    return $r;
};

$body = fn (): array => (array) ($request->getJsonRawBody(true) ?: []);

$userId = function () use ($request, $svc): string {
    $h = (string) $request->getHeader('Authorization');
    if (! str_starts_with($h, 'Bearer ')) {
        throw Errors::invalidToken();
    }
    return $svc->tokens->parseAccess(substr($h, 7))['userId'];
};

// --- system ---
$app->get('/health', fn () => $json(['status' => 'ok'], 200));
$app->get('/ready', function () use ($json, $svc) {
    $checks = ['postgres' => 'ok', 'redis' => 'ok'];
    try { $svc->db->fetchOne('SELECT 1'); } catch (\Throwable) { $checks['postgres'] = 'down'; }
    if (! $svc->redis->ping()) { $checks['redis'] = 'down'; }
    $ok = ! in_array('down', $checks, true);
    return $json(['status' => $ok ? 'ok' : 'degraded', 'checks' => $checks], $ok ? 200 : 503);
});

// --- auth ---
$app->post('/auth/login', function () use ($json, $body, $svc) {
    $b = $body();
    return $json(Dto::tokenPair($svc->auth->login((string) ($b['email'] ?? ''), (string) ($b['password'] ?? ''))), 200);
});
$app->post('/auth/refresh', function () use ($json, $body, $svc) {
    $b = $body();
    return $json(Dto::tokenPair($svc->auth->refresh((string) ($b['refresh_token'] ?? ''))), 200);
});

// --- events ---
$app->get('/events', function () use ($json, $request, $svc) {
    $page = $svc->events->list((string) $request->getQuery('cursor', null, ''), (int) $request->getQuery('limit', null, 20));
    $resp = $json(Dto::eventPage($page['events'], $page['nextCursor']), 200);
    $resp->setHeader('Cache-Control', 'public, max-age=30');
    return $resp;
});
$app->get('/events/{id}', function ($id) use ($json, $request, $svc) {
    $detail = $svc->events->get((string) $id);
    $etag = 'W/"' . substr(hash('sha256', $detail['event']['id'] . $detail['event']['status']
        . implode('', array_map(fn ($s) => $s['id'] . $s['available_inventory'], $detail['sectors']))), 0, 16) . '"';
    if ($request->getHeader('If-None-Match') === $etag) {
        $r = $json(null, 304);
        $r->setHeader('ETag', $etag);
        return $r;
    }
    $resp = $json(Dto::eventDetail($detail['event'], $detail['sectors']), 200);
    $resp->setHeader('ETag', $etag);
    $resp->setHeader('Cache-Control', 'public, max-age=5');
    return $resp;
});

// --- queue ---
$app->post('/events/{id}/queue', function ($id) use ($json, $userId, $svc) {
    return $json(Dto::queueToken($svc->queue->join($userId(), (string) $id)), 201);
});
$app->get('/events/{id}/queue/status', function ($id) use ($json, $userId, $svc) {
    return $json(Dto::queueToken($svc->queue->status($userId(), (string) $id)), 200);
});

// --- reservations ---
$app->post('/reservations', function () use ($json, $body, $request, $userId, $svc) {
    $idemKey = (string) $request->getHeader('Idempotency-Key');
    if ($idemKey === '') throw Errors::validation();
    $b = $body();
    $result = $svc->reservations->create($userId(), (string) ($b['sector_id'] ?? ''), (int) ($b['quantity'] ?? 0), $idemKey);
    return $json(Dto::reservation($result['reservation']), $result['replayed'] ? 200 : 201);
});
$app->delete('/reservations/{id}', function ($id) use ($json, $userId, $svc) {
    $svc->reservations->release($userId(), (string) $id);
    return $json(null, 204);
});

// --- orders ---
$app->post('/orders', function () use ($json, $body, $request, $userId, $svc) {
    $idemKey = (string) $request->getHeader('Idempotency-Key');
    if ($idemKey === '') throw Errors::validation();
    $b = $body();
    return $json(Dto::order($svc->orders->create($userId(), (string) ($b['reservation_id'] ?? ''), $idemKey)), 202);
});
$app->get('/orders/{id}', function ($id) use ($json, $userId, $svc) {
    $userId(); // require auth
    return $json(Dto::order($svc->orders->get((string) $id)), 200);
});

// --- webhook (public; authenticated by HMAC signature) ---
$app->post('/webhooks/payment', function () use ($json, $request, $svc) {
    $raw = $request->getRawBody();
    $want = hash_hmac('sha256', $raw, $svc->webhookSecret);
    if (! hash_equals($want, (string) $request->getHeader('X-Signature'))) {
        throw Errors::invalidToken();
    }
    $data = json_decode($raw, true);
    if (! is_array($data)) throw Errors::validation();
    $svc->payments->handleWebhook($data['provider_ref'] ?? '', $data['order_id'] ?? '', ($data['status'] ?? '') === 'succeeded');
    return $json(['status' => 'ok'], 200);
});

$app->notFound(function () {
    throw Errors::notFound();
});

// One error path for the whole app: the standard envelope, every time.
try {
    $app->handle(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
} catch (DomainException $e) {
    $json(['error' => ['code' => $e->errorCode, 'message' => $e->publicMessage, 'request_id' => $requestId]], Errors::STATUS[$e->errorCode] ?? 500);
} catch (\Throwable $e) {
    $json(['error' => ['code' => 'internal_error', 'message' => 'Something went wrong on our end', 'request_id' => $requestId]], 500);
}

// Micro auto-sends a Response returned from a handler; only the error paths above
// (thrown out of handle()) still need an explicit send.
if (! $app->response->isSent()) {
    $app->response->send();
}
