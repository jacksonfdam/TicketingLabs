<?php

// The contract, as one controller of thin actions: parse, call a use case, shape the
// response. No business logic here. Routes are mounted at the root (no /api prefix)
// because the gateway strips /api before forwarding.

declare(strict_types=1);

namespace App\Controller;

use App\Domain\Errors;
use App\Support\Authenticator;
use App\Support\Dto;
use App\UseCase\AuthService;
use App\UseCase\EventService;
use App\UseCase\OrderService;
use App\UseCase\PaymentService;
use App\UseCase\QueueService;
use App\UseCase\ReservationService;
use App\Adapter\RedisAdapter;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

final class ApiController extends AbstractController
{
    public function __construct(
        private AuthService $auth,
        private EventService $events,
        private QueueService $queue,
        private ReservationService $reservations,
        private OrderService $orders,
        private PaymentService $payments,
        private Authenticator $authenticator,
        private Connection $db,
        private RedisAdapter $redis,
        private string $webhookSecret,
    ) {}

    private function body(Request $r): array
    {
        $data = json_decode($r->getContent() ?: '{}', true);
        return is_array($data) ? $data : [];
    }

    // --- system ---
    #[Route('/health', methods: ['GET'])]
    public function health(): JsonResponse
    {
        return $this->json(['status' => 'ok']);
    }

    #[Route('/ready', methods: ['GET'])]
    public function ready(): JsonResponse
    {
        $checks = ['postgres' => 'ok', 'redis' => 'ok'];
        try { $this->db->executeQuery('SELECT 1'); } catch (\Throwable) { $checks['postgres'] = 'down'; }
        if (! $this->redis->ping()) { $checks['redis'] = 'down'; }
        $ok = ! in_array('down', $checks, true);
        return $this->json(['status' => $ok ? 'ok' : 'degraded', 'checks' => $checks], $ok ? 200 : 503);
    }

    // --- auth ---
    #[Route('/auth/login', methods: ['POST'])]
    public function login(Request $r): JsonResponse
    {
        $b = $this->body($r);
        return $this->json(Dto::tokenPair($this->auth->login((string) ($b['email'] ?? ''), (string) ($b['password'] ?? ''))));
    }

    #[Route('/auth/refresh', methods: ['POST'])]
    public function refresh(Request $r): JsonResponse
    {
        $b = $this->body($r);
        return $this->json(Dto::tokenPair($this->auth->refresh((string) ($b['refresh_token'] ?? ''))));
    }

    // --- events ---
    #[Route('/events', methods: ['GET'])]
    public function listEvents(Request $r): JsonResponse
    {
        $page = $this->events->list((string) $r->query->get('cursor', ''), (int) $r->query->get('limit', 20));
        $resp = $this->json(Dto::eventPage($page['events'], $page['nextCursor']));
        $resp->headers->set('Cache-Control', 'public, max-age=30');
        return $resp;
    }

    #[Route('/events/{id}', methods: ['GET'])]
    public function getEvent(Request $r, string $id): Response
    {
        $detail = $this->events->get($id);
        $etag = 'W/"'.substr(hash('sha256', $detail['event']['id'].$detail['event']['status']
            .implode('', array_map(fn ($s) => $s['id'].$s['available_inventory'], $detail['sectors']))), 0, 16).'"';
        if ($r->headers->get('If-None-Match') === $etag) {
            return new Response('', 304, ['ETag' => $etag]);
        }
        $resp = $this->json(Dto::eventDetail($detail['event'], $detail['sectors']));
        $resp->headers->set('ETag', $etag);
        $resp->headers->set('Cache-Control', 'public, max-age=5');
        return $resp;
    }

    // --- queue ---
    #[Route('/events/{id}/queue', methods: ['POST'])]
    public function joinQueue(Request $r, string $id): JsonResponse
    {
        return $this->json(Dto::queueToken($this->queue->join($this->authenticator->userId($r), $id)), 201);
    }

    #[Route('/events/{id}/queue/status', methods: ['GET'])]
    public function queueStatus(Request $r, string $id): JsonResponse
    {
        return $this->json(Dto::queueToken($this->queue->status($this->authenticator->userId($r), $id)));
    }

    // --- reservations ---
    #[Route('/reservations', methods: ['POST'])]
    public function createReservation(Request $r): JsonResponse
    {
        $idemKey = (string) $r->headers->get('Idempotency-Key', '');
        if ($idemKey === '') throw Errors::validation();
        $b = $this->body($r);
        $result = $this->reservations->create($this->authenticator->userId($r), (string) ($b['sector_id'] ?? ''), (int) ($b['quantity'] ?? 0), $idemKey);
        // 201 for a fresh hold, 200 for an idempotent replay. The contract distinguishes.
        return $this->json(Dto::reservation($result['reservation']), $result['replayed'] ? 200 : 201);
    }

    #[Route('/reservations/{id}', methods: ['DELETE'])]
    public function releaseReservation(Request $r, string $id): Response
    {
        $this->reservations->release($this->authenticator->userId($r), $id);
        return new Response('', 204);
    }

    // --- orders ---
    #[Route('/orders', methods: ['POST'])]
    public function createOrder(Request $r): JsonResponse
    {
        $idemKey = (string) $r->headers->get('Idempotency-Key', '');
        if ($idemKey === '') throw Errors::validation();
        $b = $this->body($r);
        return $this->json(Dto::order($this->orders->create($this->authenticator->userId($r), (string) ($b['reservation_id'] ?? ''), $idemKey)), 202);
    }

    #[Route('/orders/{id}', methods: ['GET'])]
    public function getOrder(Request $r, string $id): JsonResponse
    {
        $this->authenticator->userId($r); // require auth
        return $this->json(Dto::order($this->orders->get($id)));
    }

    // --- webhook (public; authenticated by HMAC signature) ---
    #[Route('/webhooks/payment', methods: ['POST'])]
    public function webhook(Request $r): JsonResponse
    {
        $raw = $r->getContent();
        $want = hash_hmac('sha256', $raw, $this->webhookSecret);
        if (! hash_equals($want, (string) $r->headers->get('X-Signature', ''))) {
            throw Errors::invalidToken();
        }
        $data = json_decode($raw, true);
        if (! is_array($data)) throw Errors::validation();
        $this->payments->handleWebhook($data['provider_ref'] ?? '', $data['order_id'] ?? '', ($data['status'] ?? '') === 'succeeded');
        return $this->json(['status' => 'ok']);
    }
}
