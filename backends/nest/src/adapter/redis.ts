// Redis adapter: distributed lock, rate limiter, refresh-token store. Same designs as
// the Go and FastAPI backends, expressed with ioredis.

import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';

import { LockHandle, Locker, RateLimiter } from '../usecase/ports';
import { RefreshStore } from '../platform/token';

// Delete the lock only if we still own it, so a late release cannot free a lock a
// different holder has since acquired.
const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end`;

const LOCK_TTL_MS = 15_000;
const POLL_MS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RedisAdapter implements Locker, RateLimiter, RefreshStore {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, waitMs: number): Promise<LockHandle | null> {
    const token = randomBytes(16).toString('hex');
    const full = `lock:${key}`;
    const deadline = Date.now() + waitMs;
    for (;;) {
      const ok = await this.redis.set(full, token, 'PX', LOCK_TTL_MS, 'NX');
      if (ok) {
        return {
          release: async () => {
            try {
              await this.redis.eval(RELEASE_LUA, 1, full, token);
            } catch {
              // best effort; the lock TTL is the backstop
            }
          },
        };
      }
      if (Date.now() >= deadline) return null;
      await sleep(POLL_MS);
    }
  }

  async allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const full = `ratelimit:${key}`;
    const count = await this.redis.incr(full);
    if (count === 1) await this.redis.expire(full, windowSeconds);
    return count <= limit;
  }

  // RefreshStore
  async save(jti: string, userId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`refresh:${jti}`, userId, 'EX', ttlSeconds);
  }
  async consume(jti: string): Promise<string | null> {
    return this.redis.getdel(`refresh:${jti}`);
  }
}
