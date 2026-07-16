<?php

// Use cases. Plain PHP classes that import nothing from Laravel; the framework wires
// them in CoreServiceProvider. The reservation flow is the star: idempotency guard,
// distributed lock, atomic conditional decrement, TTL hold. It mirrors every other
// backend line for line.

declare(strict_types=1);

namespace App\UseCase;

use App\Domain\Errors;
use App\Domain\DomainException;
use App\Domain\OrderStatus;
use App\Domain\PaymentStatus;
use App\Domain\QueueStatus;
use App\Domain\ReservationStatus;
use App\Domain\Role;
use DateTimeImmutable;

const TOPIC_PAYMENT_REQUESTED = 'payment.requested';

final class AuthService
{
    public function __construct(
        private UserRepository $users,
        private PasswordHasher $hasher,
        private TokenService $tokens,
    ) {}

    /** @return array{access_token:string,refresh_token:string,expires_in:int} */
    public function login(string $email, string $password): array
    {
        $user = $this->users->findByEmail($email);
        // Same error whether the email is unknown or the password is wrong.
        if ($user === null || ! $this->hasher->verify($user['password_hash'], $password)) {
            throw Errors::invalidCredentials();
        }
        return $this->issue($user['id'], Role::from($user['role']));
    }

    public function refresh(string $refreshToken): array
    {
        $userId = $this->tokens->rotate($refreshToken); // throws on reuse/expiry
        $user = $this->users->findById($userId);
        if ($user === null) {
            throw Errors::invalidToken();
        }
        return $this->issue($user['id'], Role::from($user['role']));
    }

    private function issue(string $userId, Role $role): array
    {
        $access = $this->tokens->issueAccess($userId, $role);
        $refresh = $this->tokens->issueRefresh($userId);
        return ['access_token' => $access['token'], 'refresh_token' => $refresh, 'expires_in' => $access['expiresIn']];
    }
}

final class EventService
{
    public function __construct(
        private EventRepository $events,
        private SectorRepository $sectors,
    ) {}

    public function list(string $cursor, int $limit): array
    {
        if ($limit <= 0 || $limit > 100) {
            $limit = 20;
        }
        return $this->events->list($cursor, $limit);
    }

    /** @return array{event:array, sectors:array} */
    public function get(string $id): array
    {
        $event = $this->events->findById($id);
        if ($event === null) {
            throw Errors::notFound();
        }
        return ['event' => $event, 'sectors' => $this->sectors->listByEvent($id)];
    }
}

final class QueueService implements AdmissionChecker
{
    public function __construct(
        private QueueRepository $queue,
        private EventRepository $events,
        private RateLimiter $limiter,
        private Clock $clock,
        private IdGenerator $ids,
        private int $admitBatch,
    ) {
        if ($this->admitBatch <= 0) {
            $this->admitBatch = 50;
        }
    }

    public function join(string $userId, string $eventId): array
    {
        if ($this->events->findById($eventId) === null) {
            throw Errors::notFound();
        }
        if (! $this->limiter->allow("queue_join:{$userId}:{$eventId}", 5, 60)) {
            throw Errors::rateLimited();
        }
        $existing = $this->queue->find($userId, $eventId);
        if ($existing !== null) {
            return $this->decorate($existing);
        }
        $token = [
            'id' => $this->ids->newId(),
            'user_id' => $userId,
            'event_id' => $eventId,
            'position' => $this->queue->nextPosition($eventId),
            'status' => QueueStatus::Waiting->value,
            'admitted_at' => null,
        ];
        $this->queue->upsert($token);
        return $this->decorate($token);
    }

    public function status(string $userId, string $eventId): array
    {
        $token = $this->queue->find($userId, $eventId);
        if ($token === null) {
            throw Errors::notFound();
        }
        return $this->decorate($token);
    }

    public function isAdmitted(string $userId, string $eventId): bool
    {
        $token = $this->queue->find($userId, $eventId);
        if ($token === null) {
            return false;
        }
        return $this->decorate($token)['status'] === QueueStatus::Admitted->value;
    }

    private function decorate(array $token): array
    {
        if ($token['status'] === QueueStatus::Waiting->value && (int) $token['position'] < $this->admitBatch) {
            $token['status'] = QueueStatus::Admitted->value;
            $token['admitted_at'] = $this->clock->now();
            $this->queue->upsert($token);
        }
        return $token;
    }
}

final class ReservationService
{
    private int $lockWaitMs = 3000;

    public function __construct(
        private ReservationRepository $reservations,
        private SectorRepository $sectors,
        private Locker $locker,
        private AdmissionChecker $admission,
        private Clock $clock,
        private IdGenerator $ids,
        private int $ttlSeconds,
    ) {
        if ($this->ttlSeconds <= 0) {
            $this->ttlSeconds = 120;
        }
    }

    /** @return array{reservation:array, replayed:bool} */
    public function create(string $userId, string $sectorId, int $qty, string $idemKey): array
    {
        if ($qty < 1 || $qty > 8 || $idemKey === '') {
            throw Errors::validation();
        }

        // (1) Idempotency fast path.
        $prior = $this->reservations->findByIdempotencyKey($userId, $idemKey);
        if ($prior !== null) {
            return ['reservation' => $prior, 'replayed' => true];
        }

        $sector = $this->sectors->findById($sectorId);
        if ($sector === null) {
            throw Errors::notFound();
        }

        // (2) Checkout gate: no admitted queue token for this event, no entry.
        if (! $this->admission->isAdmitted($userId, $sector['event_id'])) {
            throw Errors::notAdmitted();
        }

        // (3) Distributed lock: contention management, not the correctness guarantee.
        $release = $this->locker->acquire("sector:{$sectorId}", $this->lockWaitMs);
        if ($release === null) {
            throw Errors::lockUnavailable();
        }
        try {
            $raced = $this->reservations->findByIdempotencyKey($userId, $idemKey);
            if ($raced !== null) {
                return ['reservation' => $raced, 'replayed' => true];
            }

            // (4) Atomic conditional decrement: the real anti-overselling guarantee.
            if (! $this->sectors->decrementInventory($sectorId, $qty)) {
                throw Errors::inventoryExhausted();
            }

            // (5) TTL hold.
            $now = $this->clock->now();
            $reservation = [
                'id' => $this->ids->newId(),
                'user_id' => $userId,
                'sector_id' => $sectorId,
                'quantity' => $qty,
                'status' => ReservationStatus::Held->value,
                'expires_at' => $now->modify("+{$this->ttlSeconds} seconds"),
                'idempotency_key' => $idemKey,
                'created_at' => $now,
            ];
            try {
                $this->reservations->create($reservation);
            } catch (DomainException $e) {
                $this->sectors->incrementInventory($sectorId, $qty); // give the stock back
                if ($e->errorCode === 'conflict') {
                    $winner = $this->reservations->findByIdempotencyKey($userId, $idemKey);
                    if ($winner !== null) {
                        return ['reservation' => $winner, 'replayed' => true];
                    }
                }
                throw Errors::internal();
            }
            return ['reservation' => $reservation, 'replayed' => false];
        } finally {
            $release();
        }
    }

    public function release(string $userId, string $reservationId): void
    {
        $res = $this->reservations->findById($reservationId);
        if ($res === null || $res['user_id'] !== $userId) {
            throw Errors::notFound(); // do not confirm existence to a non-owner
        }
        if ($res['status'] !== ReservationStatus::Held->value) {
            return; // idempotent no-op, still 204
        }
        $this->reservations->updateStatus($res['id'], ReservationStatus::Released->value);
        $this->sectors->incrementInventory($res['sector_id'], (int) $res['quantity']);
    }

    public function sweepExpired(int $limit): int
    {
        $expired = $this->reservations->findExpired($this->clock->now(), $limit);
        $swept = 0;
        foreach ($expired as $r) {
            $this->reservations->updateStatus($r['id'], ReservationStatus::Expired->value);
            $this->sectors->incrementInventory($r['sector_id'], (int) $r['quantity']);
            $swept++;
        }
        return $swept;
    }

    public function get(string $id): array
    {
        $res = $this->reservations->findById($id);
        if ($res === null) {
            throw Errors::notFound();
        }
        return $res;
    }
}

final class OrderService
{
    public function __construct(
        private OrderRepository $orders,
        private ReservationRepository $reservations,
        private SectorRepository $sectors,
        private Publisher $publisher,
        private IdGenerator $ids,
    ) {}

    public function create(string $userId, string $reservationId, string $idemKey): array
    {
        if ($idemKey === '') {
            throw Errors::validation();
        }
        $prior = $this->orders->findByIdempotencyKey($userId, $idemKey);
        if ($prior !== null) {
            return $prior;
        }

        $res = $this->reservations->findById($reservationId);
        if ($res === null || $res['user_id'] !== $userId) {
            throw Errors::notFound();
        }
        if ($res['status'] !== ReservationStatus::Held->value) {
            throw Errors::reservationState();
        }
        $existing = $this->orders->findByReservationId($reservationId);
        if ($existing !== null) {
            return $existing;
        }
        $sector = $this->sectors->findById($res['sector_id']);
        if ($sector === null) {
            throw Errors::internal();
        }

        $order = [
            'id' => $this->ids->newId(),
            'reservation_id' => $reservationId,
            'user_id' => $userId,
            'amount_cents' => (int) $sector['price_cents'] * (int) $res['quantity'],
            'status' => OrderStatus::Pending->value,
            'idempotency_key' => $idemKey,
        ];
        try {
            $this->orders->create($order);
        } catch (DomainException) {
            $winner = $this->orders->findByIdempotencyKey($userId, $idemKey);
            if ($winner !== null) {
                return $winner;
            }
            throw Errors::internal();
        }
        // Re-read so the response carries the DB-populated created_at (a required field).
        $saved = $this->orders->findById($order['id']) ?? $order;

        try {
            $this->publisher->publish(TOPIC_PAYMENT_REQUESTED, json_encode(['order_id' => $order['id']]));
        } catch (\Throwable) {
            // order is pending; a failed publish is recoverable by reconciliation
        }
        return $saved;
    }

    public function get(string $id): array
    {
        $order = $this->orders->findById($id);
        if ($order === null) {
            throw Errors::notFound();
        }
        return $order;
    }
}

final class PaymentService
{
    public function __construct(
        private OrderRepository $orders,
        private ReservationRepository $reservations,
        private PaymentRepository $payments,
        private PaymentGateway $gateway,
        private IdGenerator $ids,
    ) {}

    public function processPaymentRequest(string $orderId): void
    {
        $order = $this->orders->findById($orderId);
        if ($order === null) {
            throw Errors::notFound();
        }
        if ($order['status'] !== OrderStatus::Pending->value) {
            return; // already settled; duplicate message
        }
        $providerRef = $this->gateway->charge($orderId); // may throw; worker retries
        $this->payments->upsert([
            'id' => $this->ids->newId(),
            'order_id' => $orderId,
            'provider_ref' => $providerRef,
            'status' => PaymentStatus::Pending->value,
            'attempts' => 1,
        ]);
    }

    public function handleWebhook(string $providerRef, string $orderId, bool $succeeded): void
    {
        $order = $this->orders->findById($orderId);
        if ($order === null) {
            throw Errors::notFound();
        }
        $this->payments->upsert([
            'id' => $this->ids->newId(),
            'order_id' => $orderId,
            'provider_ref' => $providerRef,
            'status' => ($succeeded ? PaymentStatus::Succeeded : PaymentStatus::Failed)->value,
            'attempts' => 0,
        ]);

        if ($order['status'] !== OrderStatus::Pending->value) {
            return; // already settled
        }
        if ($succeeded) {
            $this->orders->updateStatus($orderId, OrderStatus::Paid->value);
            // The one place the two state machines touch: a paid order confirms its hold.
            $this->reservations->updateStatus($order['reservation_id'], ReservationStatus::Confirmed->value);
        } else {
            $this->orders->updateStatus($orderId, OrderStatus::Failed->value);
        }
    }
}
