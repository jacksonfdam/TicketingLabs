<?php

// The contract, as routes. Handlers are thin closures: parse, call a use case, shape
// the response. No business logic here. A larger app would use invokable controllers;
// closures keep this backend compact and the delegation obvious. Routes are mounted at
// the root (apiPrefix '') because the gateway strips /api before forwarding.

declare(strict_types=1);

use App\Adapter\RedisAdapter;
use App\Domain\Errors;
use App\Http\Dto;
use App\Http\Middleware\BearerAuth;
use App\UseCase\AuthService;
use App\UseCase\EventService;
use App\UseCase\OrderService;
use App\UseCase\PaymentService;
use App\UseCase\QueueService;
use App\UseCase\ReservationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// --- system ---
Route::get('/health', fn () => response()->json(['status' => 'ok']));

Route::get('/ready', function () {
    $checks = ['postgres' => 'ok', 'redis' => 'ok'];
    try { DB::selectOne('SELECT 1'); } catch (\Throwable) { $checks['postgres'] = 'down'; }
    if (! app(RedisAdapter::class)->ping()) { $checks['redis'] = 'down'; }
    $ok = ! in_array('down', $checks, true);
    return response()->json(['status' => $ok ? 'ok' : 'degraded', 'checks' => $checks], $ok ? 200 : 503);
});

// --- auth ---
Route::post('/auth/login', function (Request $r) {
    $body = $r->json()->all();
    // Cast defensively: fuzzed bodies send nulls and numbers where strings are typed.
    return response()->json(Dto::tokenPair(app(AuthService::class)->login((string) ($body['email'] ?? ''), (string) ($body['password'] ?? ''))), 200);
});

Route::post('/auth/refresh', function (Request $r) {
    return response()->json(Dto::tokenPair(app(AuthService::class)->refresh((string) $r->json('refresh_token', ''))), 200);
});

// --- events ---
Route::get('/events', function (Request $r) {
    $limit = (int) ($r->query('limit', 20));
    $page = app(EventService::class)->list((string) $r->query('cursor', ''), $limit);
    return response()->json(Dto::eventPage($page['events'], $page['nextCursor']))
        ->header('Cache-Control', 'public, max-age=30');
});

Route::get('/events/{id}', function (Request $r, string $id) {
    $detail = app(EventService::class)->get($id);
    $etag = 'W/"'.substr(hash('sha256', $detail['event']['id'].$detail['event']['status']
        .implode('', array_map(fn ($s) => $s['id'].$s['available_inventory'], $detail['sectors']))), 0, 16).'"';
    if ($r->headers->get('If-None-Match') === $etag) {
        return response('', 304)->header('ETag', $etag);
    }
    return response()->json(Dto::eventDetail($detail['event'], $detail['sectors']))
        ->header('ETag', $etag)->header('Cache-Control', 'public, max-age=5');
});

// --- webhook (public; authenticated by HMAC signature) ---
Route::post('/webhooks/payment', function (Request $r) {
    $raw = $r->getContent();
    $want = hash_hmac('sha256', $raw, (string) config('ticketing.payment_webhook_secret'));
    if (! hash_equals($want, (string) $r->headers->get('X-Signature', ''))) {
        throw Errors::invalidToken();
    }
    $data = json_decode($raw, true);
    if (! is_array($data)) {
        throw Errors::validation();
    }
    app(PaymentService::class)->handleWebhook($data['provider_ref'] ?? '', $data['order_id'] ?? '', ($data['status'] ?? '') === 'succeeded');
    return response()->json(['status' => 'ok']);
});

// --- authenticated ---
Route::middleware(BearerAuth::class)->group(function () {
    Route::post('/events/{id}/queue', function (Request $r, string $id) {
        return response()->json(Dto::queueToken(app(QueueService::class)->join($r->attributes->get('user_id'), $id)), 201);
    });

    Route::get('/events/{id}/queue/status', function (Request $r, string $id) {
        return response()->json(Dto::queueToken(app(QueueService::class)->status($r->attributes->get('user_id'), $id)));
    });

    Route::post('/reservations', function (Request $r) {
        $idemKey = (string) $r->headers->get('Idempotency-Key', '');
        if ($idemKey === '') throw Errors::validation();
        $body = $r->json()->all();
        $result = app(ReservationService::class)->create($r->attributes->get('user_id'), (string) ($body['sector_id'] ?? ''), (int) ($body['quantity'] ?? 0), $idemKey);
        // 201 for a fresh hold, 200 for an idempotent replay. The contract distinguishes.
        return response()->json(Dto::reservation($result['reservation']), $result['replayed'] ? 200 : 201);
    });

    Route::delete('/reservations/{id}', function (Request $r, string $id) {
        app(ReservationService::class)->release($r->attributes->get('user_id'), $id);
        return response('', 204);
    });

    Route::post('/orders', function (Request $r) {
        $idemKey = (string) $r->headers->get('Idempotency-Key', '');
        if ($idemKey === '') throw Errors::validation();
        $order = app(OrderService::class)->create($r->attributes->get('user_id'), (string) $r->json('reservation_id', ''), $idemKey);
        return response()->json(Dto::order($order), 202);
    });

    Route::get('/orders/{id}', function (Request $r, string $id) {
        return response()->json(Dto::order(app(OrderService::class)->get($id)));
    });
});
