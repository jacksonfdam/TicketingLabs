<?php

// Concrete adapters implementing the ports. Postgres via the query builder, Redis via
// predis, RabbitMQ via php-amqplib, the payment gateway via the HTTP client. The star
// is PgSectorRepository::decrementInventory: one conditional UPDATE that makes
// overselling impossible at the database.

declare(strict_types=1);

namespace App\Adapter;

use App\Domain\Errors;
use App\UseCase\EventRepository;
use App\UseCase\Locker;
use App\UseCase\OrderRepository;
use App\UseCase\PaymentGateway;
use App\UseCase\PaymentRepository;
use App\UseCase\Publisher;
use App\UseCase\QueueRepository;
use App\UseCase\RateLimiter;
use App\UseCase\ReservationRepository;
use App\UseCase\SectorRepository;
use App\UseCase\UserRepository;
use DateTimeImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;
use Predis\Client as Predis;

// Lenient UUID shape check (8-4-4-4-12 hex). Deliberately not a strict RFC 4122 check,
// which would reject the lab's tidy seed ids like 1111...1111 that Postgres accepts.
function is_uuid(string $s): bool
{
    return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $s);
}

function row_or_null(?object $row): ?array
{
    return $row === null ? null : (array) $row;
}

final class PgUserRepository implements UserRepository
{
    public function findByEmail(string $email): ?array
    {
        return row_or_null(DB::selectOne('SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?', [$email]));
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return row_or_null(DB::selectOne('SELECT id, email, password_hash, role, created_at FROM users WHERE id = ?::uuid', [$id]));
    }
}

final class PgEventRepository implements EventRepository
{
    private const COLS = 'id, name, venue, starts_at, sales_open_at, status';

    public function list(string $cursor, int $limit): array
    {
        if ($cursor === '') {
            $rows = DB::select('SELECT '.self::COLS.' FROM events ORDER BY id LIMIT ?', [$limit + 1]);
        } else {
            if (! is_uuid($cursor)) throw Errors::badRequest(); // malformed cursor -> 400, not 500
            $rows = DB::select('SELECT '.self::COLS.' FROM events WHERE id > ?::uuid ORDER BY id LIMIT ?', [$cursor, $limit + 1]);
        }
        $events = array_map(fn ($r) => (array) $r, $rows);
        $nextCursor = '';
        if (count($events) > $limit) {
            $nextCursor = $events[$limit - 1]['id'];
            $events = array_slice($events, 0, $limit);
        }
        return ['events' => $events, 'nextCursor' => $nextCursor];
    }

    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return row_or_null(DB::selectOne('SELECT '.self::COLS.' FROM events WHERE id = ?::uuid', [$id]));
    }
}

final class PgSectorRepository implements SectorRepository
{
    private const COLS = 'id, event_id, name, price_cents, currency, total_inventory, available_inventory';

    public function listByEvent(string $eventId): array
    {
        if (! is_uuid($eventId)) return [];
        return array_map(fn ($r) => (array) $r, DB::select('SELECT '.self::COLS.' FROM sectors WHERE event_id = ?::uuid ORDER BY name', [$eventId]));
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return row_or_null(DB::selectOne('SELECT '.self::COLS.' FROM sectors WHERE id = ?::uuid', [$id]));
    }
    public function decrementInventory(string $sectorId, int $qty): bool
    {
        // The anti-overselling primitive. Affected-row count tells us if it matched.
        $affected = DB::update('UPDATE sectors SET available_inventory = available_inventory - ? WHERE id = ?::uuid AND available_inventory >= ?', [$qty, $sectorId, $qty]);
        return $affected === 1;
    }
    public function incrementInventory(string $sectorId, int $qty): void
    {
        DB::update('UPDATE sectors SET available_inventory = available_inventory + ? WHERE id = ?::uuid', [$qty, $sectorId]);
    }
}

final class PgQueueRepository implements QueueRepository
{
    public function upsert(array $t): void
    {
        $admittedAt = $t['admitted_at'] instanceof DateTimeImmutable ? $t['admitted_at']->format('Y-m-d H:i:sP') : $t['admitted_at'];
        DB::statement(
            'INSERT INTO queue_tokens (id, user_id, event_id, position, status, admitted_at)
             VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?)
             ON CONFLICT (user_id, event_id) DO UPDATE SET status = EXCLUDED.status, admitted_at = EXCLUDED.admitted_at',
            [$t['id'], $t['user_id'], $t['event_id'], $t['position'], $t['status'], $admittedAt],
        );
    }
    public function find(string $userId, string $eventId): ?array
    {
        if (! is_uuid($userId) || ! is_uuid($eventId)) return null;
        return row_or_null(DB::selectOne('SELECT id, user_id, event_id, position, status, admitted_at FROM queue_tokens WHERE user_id = ?::uuid AND event_id = ?::uuid', [$userId, $eventId]));
    }
    public function nextPosition(string $eventId): int
    {
        $row = DB::selectOne('SELECT COALESCE(MAX(position)+1, 0) AS pos FROM queue_tokens WHERE event_id = ?::uuid', [$eventId]);
        return (int) $row->pos;
    }
}

final class PgReservationRepository implements ReservationRepository
{
    private const COLS = 'id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at';

    public function create(array $r): void
    {
        try {
            DB::insert(
                'INSERT INTO reservations (id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at)
                 VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?, ?)',
                [$r['id'], $r['user_id'], $r['sector_id'], $r['quantity'], $r['status'],
                    $r['expires_at']->format('Y-m-d H:i:sP'), $r['idempotency_key'], $r['created_at']->format('Y-m-d H:i:sP')],
            );
        } catch (QueryException $e) {
            if ($e->getCode() === '23505') throw Errors::conflict();
            throw $e;
        }
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return row_or_null(DB::selectOne('SELECT '.self::COLS.' FROM reservations WHERE id = ?::uuid', [$id]));
    }
    public function findByIdempotencyKey(string $userId, string $key): ?array
    {
        return row_or_null(DB::selectOne('SELECT '.self::COLS.' FROM reservations WHERE user_id = ?::uuid AND idempotency_key = ?', [$userId, $key]));
    }
    public function updateStatus(string $id, string $status): void
    {
        DB::update('UPDATE reservations SET status = ? WHERE id = ?::uuid', [$status, $id]);
    }
    public function findExpired(DateTimeImmutable $now, int $limit): array
    {
        return array_map(fn ($r) => (array) $r, DB::select(
            'SELECT '.self::COLS." FROM reservations WHERE status = 'held' AND expires_at < ? LIMIT ?",
            [$now->format('Y-m-d H:i:sP'), $limit],
        ));
    }
}

final class PgOrderRepository implements OrderRepository
{
    private const COLS = 'id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at';

    public function create(array $o): void
    {
        try {
            DB::insert(
                'INSERT INTO orders (id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at)
                 VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, now())',
                [$o['id'], $o['reservation_id'], $o['user_id'], $o['amount_cents'], $o['status'], $o['idempotency_key']],
            );
        } catch (QueryException $e) {
            if ($e->getCode() === '23505') throw Errors::conflict();
            throw $e;
        }
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return row_or_null(DB::selectOne('SELECT '.self::COLS.' FROM orders WHERE id = ?::uuid', [$id]));
    }
    public function findByReservationId(string $reservationId): ?array
    {
        return row_or_null(DB::selectOne('SELECT '.self::COLS.' FROM orders WHERE reservation_id = ?::uuid', [$reservationId]));
    }
    public function findByIdempotencyKey(string $userId, string $key): ?array
    {
        return row_or_null(DB::selectOne('SELECT '.self::COLS.' FROM orders WHERE user_id = ?::uuid AND idempotency_key = ?', [$userId, $key]));
    }
    public function updateStatus(string $id, string $status): void
    {
        DB::update('UPDATE orders SET status = ? WHERE id = ?::uuid', [$status, $id]);
    }
}

final class PgPaymentRepository implements PaymentRepository
{
    public function upsert(array $p): void
    {
        DB::statement(
            'INSERT INTO payments (id, order_id, provider_ref, status, attempts)
             VALUES (?::uuid, ?::uuid, ?, ?, ?)
             ON CONFLICT (provider_ref) DO UPDATE SET status = EXCLUDED.status, attempts = payments.attempts + 1',
            [$p['id'], $p['order_id'], $p['provider_ref'], $p['status'], $p['attempts']],
        );
    }
    public function findByOrderId(string $orderId): ?array
    {
        return row_or_null(DB::selectOne('SELECT id, order_id, provider_ref, status, attempts FROM payments WHERE order_id = ?::uuid LIMIT 1', [$orderId]));
    }
}

// --- Redis: distributed lock, rate limiter, refresh-token store ---

final class RedisAdapter implements Locker, RateLimiter
{
    private const RELEASE_LUA = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

    public function __construct(private Predis $redis) {}

    public function acquire(string $key, int $waitMs): ?\Closure
    {
        $token = bin2hex(random_bytes(16));
        $full = "lock:{$key}";
        $deadline = (int) (microtime(true) * 1000) + $waitMs;
        while (true) {
            $ok = $this->redis->set($full, $token, 'PX', 15000, 'NX');
            if ($ok !== null) {
                return function () use ($full, $token): void {
                    try { $this->redis->eval(self::RELEASE_LUA, 1, $full, $token); } catch (\Throwable) { /* TTL is the backstop */ }
                };
            }
            if ((int) (microtime(true) * 1000) >= $deadline) return null;
            usleep(20000);
        }
    }

    public function allow(string $key, int $limit, int $windowSeconds): bool
    {
        $full = "ratelimit:{$key}";
        $count = (int) $this->redis->incr($full);
        if ($count === 1) $this->redis->expire($full, $windowSeconds);
        return $count <= $limit;
    }

    public function saveRefresh(string $jti, string $userId, int $ttlSeconds): void
    {
        $this->redis->set("refresh:{$jti}", $userId, 'EX', $ttlSeconds);
    }
    public function consumeRefresh(string $jti): ?string
    {
        $v = $this->redis->executeRaw(['GETDEL', "refresh:{$jti}"]);
        return $v === false || $v === null ? null : (string) $v;
    }

    public function ping(): bool
    {
        try {
            return (string) $this->redis->ping() !== '';
        } catch (\Throwable) {
            return false;
        }
    }
}

// --- RabbitMQ ---

final class Broker implements Publisher
{
    public function __construct(private string $url) {}

    private function connect(): AMQPStreamConnection
    {
        $p = parse_url($this->url);
        return new AMQPStreamConnection(
            $p['host'] ?? 'localhost',
            $p['port'] ?? 5672,
            urldecode($p['user'] ?? 'guest'),
            urldecode($p['pass'] ?? 'guest'),
            isset($p['path']) && $p['path'] !== '/' ? ltrim($p['path'], '/') : '/',
        );
    }

    public function publish(string $topic, string $payload): void
    {
        $conn = $this->connect();
        $ch = $conn->channel();
        $ch->queue_declare($topic, false, true, false, false);
        $ch->basic_publish(new AMQPMessage($payload, ['delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT]), '', $topic);
        $ch->close();
        $conn->close();
    }

    // Used by the worker command. Blocks, dispatching each message to $handler. A
    // handler that throws nacks without requeue so a poison message cannot hot-loop.
    public function consume(string $topic, callable $handler): void
    {
        $conn = $this->connect();
        $ch = $conn->channel();
        $ch->queue_declare($topic, false, true, false, false);
        $ch->basic_qos(0, 16, false);
        $ch->basic_consume($topic, '', false, false, false, false, function (AMQPMessage $msg) use ($handler) {
            try {
                $handler($msg->getBody());
                $msg->ack();
            } catch (\Throwable) {
                $msg->nack(false);
            }
        });
        while ($ch->is_consuming()) {
            $ch->wait();
        }
    }
}

// --- Payment gateway HTTP client ---

final class HttpPaymentGateway implements PaymentGateway
{
    public function __construct(private string $baseUrl) {}

    public function charge(string $orderId): string
    {
        $resp = Http::timeout(4)->post(rtrim($this->baseUrl, '/').'/charges', ['order_id' => $orderId]);
        $resp->throw();
        return $resp->json('provider_ref');
    }
}
