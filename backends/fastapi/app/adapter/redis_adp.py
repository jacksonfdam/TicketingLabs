"""Redis adapter: distributed lock, rate limiter, refresh-token store. Same designs as
the Go backend's redisadp package, expressed with redis.asyncio.
"""
from __future__ import annotations

import asyncio
import secrets
from datetime import timedelta

from redis.asyncio import Redis

# Delete the lock only if we still own it (value matches), so a late release cannot
# free a lock a different holder has since acquired.
_RELEASE_LUA = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
else
    return 0
end
"""


class _LockHandle:
    def __init__(self, redis: Redis, key: str, token: str):
        self._redis = redis
        self._key = key
        self._token = token

    async def release(self) -> None:
        try:
            await self._redis.eval(_RELEASE_LUA, 1, self._key, self._token)
        except Exception:  # noqa: BLE001 - releasing best-effort; the lock TTL is a backstop
            pass


class RedisAdapter:
    def __init__(self, redis: Redis):
        self._redis = redis
        self._lock_ttl = timedelta(seconds=15)
        self._poll = 0.02

    async def acquire(self, key: str, wait: timedelta):
        token = secrets.token_hex(16)
        full = f"lock:{key}"
        loop = asyncio.get_event_loop()
        deadline = loop.time() + wait.total_seconds()
        while True:
            ok = await self._redis.set(full, token, nx=True, px=int(self._lock_ttl.total_seconds() * 1000))
            if ok:
                return _LockHandle(self._redis, full, token)
            if loop.time() >= deadline:
                return None
            await asyncio.sleep(self._poll)

    async def allow(self, key: str, limit: int, window: timedelta) -> bool:
        full = f"ratelimit:{key}"
        count = await self._redis.incr(full)
        if count == 1:
            await self._redis.expire(full, int(window.total_seconds()))
        return count <= limit

    # RefreshStore
    async def save(self, jti: str, user_id: str, ttl: timedelta) -> None:
        await self._redis.set(f"refresh:{jti}", user_id, ex=int(ttl.total_seconds()))

    async def consume(self, jti: str) -> str | None:
        value = await self._redis.getdel(f"refresh:{jti}")
        if value is None:
            return None
        return value.decode() if isinstance(value, bytes) else value
