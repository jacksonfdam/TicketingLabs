<?php

// In-process implementations of the ports for unit testing, with no database. PHP is
// single-threaded, so these tests are sequential; the true concurrency proof for this
// backend is the atomic conditional UPDATE exercised by the Phase 5 load test against
// real Postgres. The sequential tests still pin the use-case logic (exhaustion,
// idempotency, release, sweep).

declare(strict_types=1);

namespace App\Testing;

use App\Domain\Errors;
use App\UseCase\AdmissionChecker;
use App\UseCase\Clock;
use App\UseCase\IdGenerator;
use App\UseCase\Locker;
use App\UseCase\RateLimiter;
use App\UseCase\ReservationRepository;
use App\UseCase\SectorRepository;
use DateTimeImmutable;

final class Store
{
    public array $sectors = [];
    public array $reservations = [];
    public array $resByIdem = [];
}

final class MemSectorRepository implements SectorRepository
{
    public function __construct(private Store $s) {}
    public function listByEvent(string $eventId): array { return array_values(array_filter($this->s->sectors, fn ($x) => $x['event_id'] === $eventId)); }
    public function findById(string $id): ?array { return $this->s->sectors[$id] ?? null; }
    public function decrementInventory(string $sectorId, int $qty): bool
    {
        if (! isset($this->s->sectors[$sectorId]) || $this->s->sectors[$sectorId]['available_inventory'] < $qty) return false;
        $this->s->sectors[$sectorId]['available_inventory'] -= $qty;
        return true;
    }
    public function incrementInventory(string $sectorId, int $qty): void
    {
        if (isset($this->s->sectors[$sectorId])) $this->s->sectors[$sectorId]['available_inventory'] += $qty;
    }
}

final class MemReservationRepository implements ReservationRepository
{
    public function __construct(private Store $s) {}
    public function create(array $r): void
    {
        $key = $r['user_id'].'|'.$r['idempotency_key'];
        if (isset($this->s->resByIdem[$key])) throw Errors::conflict();
        $this->s->reservations[$r['id']] = $r;
        $this->s->resByIdem[$key] = $r['id'];
    }
    public function findById(string $id): ?array { return $this->s->reservations[$id] ?? null; }
    public function findByIdempotencyKey(string $userId, string $key): ?array
    {
        $id = $this->s->resByIdem[$userId.'|'.$key] ?? null;
        return $id === null ? null : $this->s->reservations[$id];
    }
    public function updateStatus(string $id, string $status): void
    {
        if (isset($this->s->reservations[$id])) $this->s->reservations[$id]['status'] = $status;
    }
    public function findExpired(DateTimeImmutable $now, int $limit): array
    {
        $out = [];
        foreach ($this->s->reservations as $r) {
            if ($r['status'] === 'held' && $r['expires_at'] < $now) $out[] = $r;
            if (count($out) >= $limit) break;
        }
        return $out;
    }
}

final class NoopLocker implements Locker
{
    // Single-threaded: no real contention, so a no-op release is correct here.
    public function acquire(string $key, int $waitMs): ?\Closure { return function (): void {}; }
}

final class AllowAllRateLimiter implements RateLimiter
{
    public function allow(string $key, int $limit, int $windowSeconds): bool { return true; }
}

final class AlwaysAdmit implements AdmissionChecker
{
    public function isAdmitted(string $userId, string $eventId): bool { return true; }
}

final class NeverAdmit implements AdmissionChecker
{
    public function isAdmitted(string $userId, string $eventId): bool { return false; }
}

final class FixedClock implements Clock
{
    public function __construct(public DateTimeImmutable $t) {}
    public function now(): DateTimeImmutable { return $this->t; }
}

final class SeqIds implements IdGenerator
{
    private int $n = 0;
    public function newId(): string { return 'id-'.(++$this->n); }
}
