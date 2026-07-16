<?php

// Unit tests for the reservation use case. No database, no framework boot. Sequential
// (PHP is single-threaded); they pin exhaustion, idempotency, release, and sweep logic.
// The concurrency/overselling proof for this backend is the load test.

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Domain\DomainException;
use App\Testing\AlwaysAdmit;
use App\Testing\FixedClock;
use App\Testing\MemReservationRepository;
use App\Testing\MemSectorRepository;
use App\Testing\NeverAdmit;
use App\Testing\NoopLocker;
use App\Testing\SeqIds;
use App\Testing\Store;
use App\UseCase\ReservationService;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class ReservationTest extends TestCase
{
    private function fixture(int $available, $admission = null): array
    {
        $store = new Store();
        $store->sectors['sec'] = [
            'id' => 'sec', 'event_id' => 'evt', 'name' => 'Pista', 'price_cents' => 100,
            'currency' => 'BRL', 'total_inventory' => $available, 'available_inventory' => $available,
        ];
        $svc = new ReservationService(
            new MemReservationRepository($store), new MemSectorRepository($store), new NoopLocker(),
            $admission ?? new AlwaysAdmit(), new FixedClock(new DateTimeImmutable('2026-01-01T00:00:00Z')), new SeqIds(), 60,
        );
        return [$store, $svc];
    }

    public function test_stock_never_goes_negative(): void
    {
        [$store, $svc] = $this->fixture(100);
        $success = 0;
        $exhausted = 0;
        for ($i = 0; $i < 150; $i++) {
            try {
                $svc->create("user-{$i}", 'sec', 1, "key-{$i}");
                $success++;
            } catch (DomainException $e) {
                if ($e->errorCode === 'inventory_exhausted') $exhausted++;
                else throw $e;
            }
        }
        $this->assertSame(100, $success);
        $this->assertSame(50, $exhausted);
        $this->assertSame(0, $store->sectors['sec']['available_inventory']);
    }

    public function test_idempotent_replay(): void
    {
        [$store, $svc] = $this->fixture(50);
        $first = $svc->create('u', 'sec', 2, 'k');
        $second = $svc->create('u', 'sec', 2, 'k');
        $this->assertSame($first['reservation']['id'], $second['reservation']['id']);
        $this->assertTrue($second['replayed']);
        $this->assertSame(48, $store->sectors['sec']['available_inventory']);
    }

    public function test_requires_admission(): void
    {
        [, $svc] = $this->fixture(10, new NeverAdmit());
        $this->expectException(DomainException::class);
        $svc->create('u', 'sec', 1, 'k');
    }

    public function test_release_returns_stock_and_is_idempotent(): void
    {
        [$store, $svc] = $this->fixture(10);
        $r = $svc->create('u', 'sec', 3, 'k');
        $svc->release('u', $r['reservation']['id']);
        $svc->release('u', $r['reservation']['id']);
        $this->assertSame(10, $store->sectors['sec']['available_inventory']);
    }

    public function test_sweeper_expires_held(): void
    {
        $store = new Store();
        $store->sectors['sec'] = [
            'id' => 'sec', 'event_id' => 'evt', 'name' => 'Pista', 'price_cents' => 100,
            'currency' => 'BRL', 'total_inventory' => 10, 'available_inventory' => 10,
        ];
        $clock = new FixedClock(new DateTimeImmutable('2026-01-01T00:00:00Z'));
        $svc = new ReservationService(
            new MemReservationRepository($store), new MemSectorRepository($store), new NoopLocker(),
            new AlwaysAdmit(), $clock, new SeqIds(), 60,
        );
        $svc->create('u', 'sec', 4, 'k');
        $clock->t = new DateTimeImmutable('2026-01-01T00:05:00Z');
        $this->assertSame(1, $svc->sweepExpired(100));
        $this->assertSame(10, $store->sectors['sec']['available_inventory']);
    }
}
