<?php

// Platform: clock, ids, password hashing, JWT, plus factories for the DBAL connection
// and the Redis client (wired in config/services.yaml).

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
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Tools\DsnParser;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Predis\Client as Predis;
use Symfony\Component\Uid\Uuid;

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
        return Uuid::v4()->toRfc4122();
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
        $token = JWT::encode(
            ['sub' => $userId, 'role' => $role->value, 'iat' => $now, 'exp' => $now + $this->accessTtl],
            $this->secret, 'HS256',
        );
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

// Factories referenced from config/services.yaml.
final class DbFactory
{
    public static function create(string $url): Connection
    {
        // DBAL 4 removed automatic 'url' parsing; DsnParser turns the URL into params.
        $params = (new DsnParser(['postgresql' => 'pdo_pgsql', 'postgres' => 'pdo_pgsql']))->parse($url);
        return DriverManager::getConnection($params);
    }
}

final class RedisFactory
{
    public static function create(string $url): Predis
    {
        $p = parse_url($url);
        return new Predis('tcp://'.($p['host'] ?? 'localhost').':'.($p['port'] ?? 6379));
    }
}
