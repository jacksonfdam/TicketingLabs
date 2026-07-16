<?php

// Ports: the interfaces the use cases depend on. Concrete adapters implement them and
// are bound in CoreServiceProvider. The domain depends on these, never on Eloquent or a
// driver. Entities are passed as associative arrays keyed by their snake_case columns.

declare(strict_types=1);

namespace App\UseCase;

use App\Domain\Role;
use DateTimeImmutable;

interface UserRepository
{
    public function findByEmail(string $email): ?array;
    public function findById(string $id): ?array;
}

interface EventRepository
{
    /** @return array{events: array<int,array>, nextCursor: string} */
    public function list(string $cursor, int $limit): array;
    public function findById(string $id): ?array;
}

interface SectorRepository
{
    public function listByEvent(string $eventId): array;
    public function findById(string $id): ?array;
    // Returns true only if enough remained. This conditional UPDATE is the real
    // guarantee against overselling; the distributed lock is belt and braces.
    public function decrementInventory(string $sectorId, int $qty): bool;
    public function incrementInventory(string $sectorId, int $qty): void;
}

interface QueueRepository
{
    public function upsert(array $token): void;
    public function find(string $userId, string $eventId): ?array;
    public function nextPosition(string $eventId): int;
}

interface ReservationRepository
{
    public function create(array $reservation): void; // throws Errors::conflict on unique violation
    public function findById(string $id): ?array;
    public function findByIdempotencyKey(string $userId, string $key): ?array;
    public function updateStatus(string $id, string $status): void;
    public function findExpired(DateTimeImmutable $now, int $limit): array;
}

interface OrderRepository
{
    public function create(array $order): void;
    public function findById(string $id): ?array;
    public function findByReservationId(string $reservationId): ?array;
    public function findByIdempotencyKey(string $userId, string $key): ?array;
    public function updateStatus(string $id, string $status): void;
}

interface PaymentRepository
{
    public function upsert(array $payment): void; // idempotent by provider_ref
    public function findByOrderId(string $orderId): ?array;
}

interface Locker
{
    // Returns a release callable, or null if the lock could not be taken within waitMs.
    public function acquire(string $key, int $waitMs): ?\Closure;
}

interface Publisher
{
    public function publish(string $topic, string $payload): void;
}

interface RateLimiter
{
    public function allow(string $key, int $limit, int $windowSeconds): bool;
}

interface Clock
{
    public function now(): DateTimeImmutable;
}

interface IdGenerator
{
    public function newId(): string;
}

interface PasswordHasher
{
    public function verify(string $hash, string $plaintext): bool;
}

interface TokenService
{
    /** @return array{token: string, expiresIn: int} */
    public function issueAccess(string $userId, Role $role): array;
    public function issueRefresh(string $userId): string;
    public function rotate(string $refreshToken): string; // returns userId; throws on reuse
    /** @return array{userId: string, role: Role} */
    public function parseAccess(string $token): array;
}

interface PaymentGateway
{
    public function charge(string $orderId): string; // returns provider_ref
}

interface AdmissionChecker
{
    public function isAdmitted(string $userId, string $eventId): bool;
}
