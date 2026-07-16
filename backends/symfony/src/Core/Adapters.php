<?php

// Concrete adapters implementing the ports. Postgres via Doctrine DBAL, Redis via
// predis, RabbitMQ via php-amqplib, the payment gateway via Symfony HttpClient. The
// star is DbalSectorRepository::decrementInventory: one conditional UPDATE that makes
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
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;
use Predis\Client as Predis;
use Symfony\Component\HttpClient\HttpClient;

function is_uuid(string $s): bool
{
    // Lenient shape check (8-4-4-4-12 hex): accepts the lab's tidy seed ids that a
    // strict RFC 4122 validator would reject, and only rejects genuine garbage.
    return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $s);
}

final class DbalUserRepository implements UserRepository
{
    public function __construct(private Connection $db) {}
    public function findByEmail(string $email): ?array
    {
        return $this->db->fetchAssociative('SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?', [$email]) ?: null;
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return $this->db->fetchAssociative('SELECT id, email, password_hash, role, created_at FROM users WHERE id = ?::uuid', [$id]) ?: null;
    }
}

final class DbalEventRepository implements EventRepository
{
    private const COLS = 'id, name, venue, starts_at, sales_open_at, status';
    public function __construct(private Connection $db) {}
    public function list(string $cursor, int $limit): array
    {
        if ($cursor === '') {
            $rows = $this->db->fetchAllAssociative('SELECT '.self::COLS.' FROM events ORDER BY id LIMIT ?', [$limit + 1]);
        } else {
            if (! is_uuid($cursor)) throw Errors::badRequest();
            $rows = $this->db->fetchAllAssociative('SELECT '.self::COLS.' FROM events WHERE id > ?::uuid ORDER BY id LIMIT ?', [$cursor, $limit + 1]);
        }
        $next = '';
        if (count($rows) > $limit) {
            $next = $rows[$limit - 1]['id'];
            $rows = array_slice($rows, 0, $limit);
        }
        return ['events' => $rows, 'nextCursor' => $next];
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return $this->db->fetchAssociative('SELECT '.self::COLS.' FROM events WHERE id = ?::uuid', [$id]) ?: null;
    }
}

final class DbalSectorRepository implements SectorRepository
{
    private const COLS = 'id, event_id, name, price_cents, currency, total_inventory, available_inventory';
    public function __construct(private Connection $db) {}
    public function listByEvent(string $eventId): array
    {
        if (! is_uuid($eventId)) return [];
        return $this->db->fetchAllAssociative('SELECT '.self::COLS.' FROM sectors WHERE event_id = ?::uuid ORDER BY name', [$eventId]);
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return $this->db->fetchAssociative('SELECT '.self::COLS.' FROM sectors WHERE id = ?::uuid', [$id]) ?: null;
    }
    public function decrementInventory(string $sectorId, int $qty): bool
    {
        $affected = $this->db->executeStatement(
            'UPDATE sectors SET available_inventory = available_inventory - ? WHERE id = ?::uuid AND available_inventory >= ?',
            [$qty, $sectorId, $qty],
        );
        return $affected === 1;
    }
    public function incrementInventory(string $sectorId, int $qty): void
    {
        $this->db->executeStatement('UPDATE sectors SET available_inventory = available_inventory + ? WHERE id = ?::uuid', [$qty, $sectorId]);
    }
}

final class DbalQueueRepository implements QueueRepository
{
    public function __construct(private Connection $db) {}
    public function upsert(array $t): void
    {
        $admittedAt = $t['admitted_at'] instanceof DateTimeImmutable ? $t['admitted_at']->format('Y-m-d H:i:sP') : $t['admitted_at'];
        $this->db->executeStatement(
            'INSERT INTO queue_tokens (id, user_id, event_id, position, status, admitted_at)
             VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?)
             ON CONFLICT (user_id, event_id) DO UPDATE SET status = EXCLUDED.status, admitted_at = EXCLUDED.admitted_at',
            [$t['id'], $t['user_id'], $t['event_id'], $t['position'], $t['status'], $admittedAt],
        );
    }
    public function find(string $userId, string $eventId): ?array
    {
        if (! is_uuid($userId) || ! is_uuid($eventId)) return null;
        return $this->db->fetchAssociative('SELECT id, user_id, event_id, position, status, admitted_at FROM queue_tokens WHERE user_id = ?::uuid AND event_id = ?::uuid', [$userId, $eventId]) ?: null;
    }
    public function nextPosition(string $eventId): int
    {
        return (int) $this->db->fetchOne('SELECT COALESCE(MAX(position)+1, 0) FROM queue_tokens WHERE event_id = ?::uuid', [$eventId]);
    }
}

final class DbalReservationRepository implements ReservationRepository
{
    private const COLS = 'id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at';
    public function __construct(private Connection $db) {}
    public function create(array $r): void
    {
        try {
            $this->db->executeStatement(
                'INSERT INTO reservations (id, user_id, sector_id, quantity, status, expires_at, idempotency_key, created_at)
                 VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?, ?)',
                [$r['id'], $r['user_id'], $r['sector_id'], $r['quantity'], $r['status'],
                    $r['expires_at']->format('Y-m-d H:i:sP'), $r['idempotency_key'], $r['created_at']->format('Y-m-d H:i:sP')],
            );
        } catch (UniqueConstraintViolationException) {
            throw Errors::conflict();
        }
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return $this->db->fetchAssociative('SELECT '.self::COLS.' FROM reservations WHERE id = ?::uuid', [$id]) ?: null;
    }
    public function findByIdempotencyKey(string $userId, string $key): ?array
    {
        return $this->db->fetchAssociative('SELECT '.self::COLS.' FROM reservations WHERE user_id = ?::uuid AND idempotency_key = ?', [$userId, $key]) ?: null;
    }
    public function updateStatus(string $id, string $status): void
    {
        $this->db->executeStatement('UPDATE reservations SET status = ? WHERE id = ?::uuid', [$status, $id]);
    }
    public function findExpired(DateTimeImmutable $now, int $limit): array
    {
        return $this->db->fetchAllAssociative(
            'SELECT '.self::COLS." FROM reservations WHERE status = 'held' AND expires_at < ? LIMIT ?",
            [$now->format('Y-m-d H:i:sP'), $limit],
        );
    }
}

final class DbalOrderRepository implements OrderRepository
{
    private const COLS = 'id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at';
    public function __construct(private Connection $db) {}
    public function create(array $o): void
    {
        try {
            $this->db->executeStatement(
                'INSERT INTO orders (id, reservation_id, user_id, amount_cents, status, idempotency_key, created_at)
                 VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, now())',
                [$o['id'], $o['reservation_id'], $o['user_id'], $o['amount_cents'], $o['status'], $o['idempotency_key']],
            );
        } catch (UniqueConstraintViolationException) {
            throw Errors::conflict();
        }
    }
    public function findById(string $id): ?array
    {
        if (! is_uuid($id)) return null;
        return $this->db->fetchAssociative('SELECT '.self::COLS.' FROM orders WHERE id = ?::uuid', [$id]) ?: null;
    }
    public function findByReservationId(string $reservationId): ?array
    {
        return $this->db->fetchAssociative('SELECT '.self::COLS.' FROM orders WHERE reservation_id = ?::uuid', [$reservationId]) ?: null;
    }
    public function findByIdempotencyKey(string $userId, string $key): ?array
    {
        return $this->db->fetchAssociative('SELECT '.self::COLS.' FROM orders WHERE user_id = ?::uuid AND idempotency_key = ?', [$userId, $key]) ?: null;
    }
    public function updateStatus(string $id, string $status): void
    {
        $this->db->executeStatement('UPDATE orders SET status = ? WHERE id = ?::uuid', [$status, $id]);
    }
}

final class DbalPaymentRepository implements PaymentRepository
{
    public function __construct(private Connection $db) {}
    public function upsert(array $p): void
    {
        $this->db->executeStatement(
            'INSERT INTO payments (id, order_id, provider_ref, status, attempts)
             VALUES (?::uuid, ?::uuid, ?, ?, ?)
             ON CONFLICT (provider_ref) DO UPDATE SET status = EXCLUDED.status, attempts = payments.attempts + 1',
            [$p['id'], $p['order_id'], $p['provider_ref'], $p['status'], $p['attempts']],
        );
    }
    public function findByOrderId(string $orderId): ?array
    {
        return $this->db->fetchAssociative('SELECT id, order_id, provider_ref, status, attempts FROM payments WHERE order_id = ?::uuid LIMIT 1', [$orderId]) ?: null;
    }
}

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
            if ($this->redis->set($full, $token, 'PX', 15000, 'NX') !== null) {
                return function () use ($full, $token): void {
                    try { $this->redis->eval(self::RELEASE_LUA, 1, $full, $token); } catch (\Throwable) {}
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
        try { return (string) $this->redis->ping() !== ''; } catch (\Throwable) { return false; }
    }
}

final class Broker implements Publisher
{
    public function __construct(private string $url) {}

    private function connect(): AMQPStreamConnection
    {
        $p = parse_url($this->url);
        return new AMQPStreamConnection(
            $p['host'] ?? 'localhost', $p['port'] ?? 5672,
            urldecode($p['user'] ?? 'guest'), urldecode($p['pass'] ?? 'guest'),
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

    public function consume(string $topic, callable $handler): void
    {
        $conn = $this->connect();
        $ch = $conn->channel();
        $ch->queue_declare($topic, false, true, false, false);
        $ch->basic_qos(0, 16, false);
        $ch->basic_consume($topic, '', false, false, false, false, function (AMQPMessage $msg) use ($handler) {
            try { $handler($msg->getBody()); $msg->ack(); } catch (\Throwable) { $msg->nack(false); }
        });
        while ($ch->is_consuming()) {
            $ch->wait();
        }
    }
}

final class HttpPaymentGateway implements PaymentGateway
{
    public function __construct(private string $baseUrl) {}

    public function charge(string $orderId): string
    {
        $client = HttpClient::create(['timeout' => 4]);
        $resp = $client->request('POST', rtrim($this->baseUrl, '/').'/charges', [
            'json' => ['order_id' => $orderId],
        ]);
        if ($resp->getStatusCode() >= 300) {
            throw new \RuntimeException('payment gateway returned '.$resp->getStatusCode());
        }
        return $resp->toArray()['provider_ref'];
    }
}
