<?php

// Platform: clock, ids, password hashing, JWT, plus factories for the Phalcon DB
// adapter and the Redis client (used by the manual composition root in Bootstrap).

declare(strict_types=1);

namespace App\Platform;

use App\Adapter\RedisAdapter;
use App\Domain\Errors;
use App\Domain\Role;
use App\UseCase\Clock;
use App\UseCase\IdGenerator;
use App\UseCase\PasswordHasher;
use App\UseCase\TokenService;
use DateTimeImmutable;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Phalcon\Db\Adapter\Pdo\Postgresql;
use Predis\Client as Predis;

final class SystemClock implements Clock
{
    public function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }
}

final class UuidGenerator implements IdGenerator
{
    public function newId(): string
    {
        $d = random_bytes(16);
        $d[6] = chr((ord($d[6]) & 0x0f) | 0x40); // version 4
        $d[8] = chr((ord($d[8]) & 0x3f) | 0x80); // variant
        $hex = bin2hex($d);
        return sprintf('%s-%s-%s-%s-%s', substr($hex, 0, 8), substr($hex, 8, 4), substr($hex, 12, 4), substr($hex, 16, 4), substr($hex, 20, 12));
    }
}

// bcrypt so the identical seeded hash authenticates against every backend in the lab.
final class BcryptHasher implements PasswordHasher
{
    public function verify(string $hash, string $plaintext): bool
    {
        return password_verify($plaintext, $hash);
    }
}

final class JwtTokenService implements TokenService
{
    public function __construct(
        private string $secret,
        private int $accessTtl,
        private int $refreshTtl,
        private RedisAdapter $store,
        private IdGenerator $ids,
        private Clock $clock,
    ) {}

    public function issueAccess(string $userId, Role $role): array
    {
        $now = $this->clock->now()->getTimestamp();
        $token = JWT::encode(['sub' => $userId, 'role' => $role->value, 'iat' => $now, 'exp' => $now + $this->accessTtl], $this->secret, 'HS256');
        return ['token' => $token, 'expiresIn' => $this->accessTtl];
    }

    public function issueRefresh(string $userId): string
    {
        $jti = $this->ids->newId();
        $this->store->saveRefresh($jti, $userId, $this->refreshTtl);
        return $jti;
    }

    public function rotate(string $refreshToken): string
    {
        $userId = $this->store->consumeRefresh($refreshToken);
        if ($userId === null) {
            throw Errors::invalidToken();
        }
        return $userId;
    }

    public function parseAccess(string $token): array
    {
        try {
            $claims = JWT::decode($token, new Key($this->secret, 'HS256'));
        } catch (\Throwable) {
            throw Errors::invalidToken();
        }
        if (! isset($claims->sub) || ! is_string($claims->sub)) {
            throw Errors::invalidToken();
        }
        return ['userId' => $claims->sub, 'role' => Role::tryFrom($claims->role ?? 'customer') ?? Role::Customer];
    }
}

final class DbFactory
{
    public static function fromEnv(): Postgresql
    {
        return new Postgresql([
            'host' => getenv('DB_HOST') ?: 'localhost',
            'port' => (int) (getenv('DB_PORT') ?: 5432),
            'dbname' => getenv('DB_NAME') ?: 'ticketing',
            'username' => getenv('DB_USER') ?: 'ticketing_app',
            'password' => getenv('DB_PASS') ?: 'app_local_dev_only',
        ]);
    }
}

final class RedisFactory
{
    public static function fromEnv(): Predis
    {
        $p = parse_url(getenv('REDIS_URL') ?: 'redis://localhost:6379');
        return new Predis('tcp://'.($p['host'] ?? 'localhost').':'.($p['port'] ?? 6379));
    }
}
