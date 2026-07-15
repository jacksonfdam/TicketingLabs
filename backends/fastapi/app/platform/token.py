from __future__ import annotations

from datetime import timedelta
from typing import Protocol

import jwt

from app.domain import errors
from app.domain.models import Role
from app.usecase.ports import Clock, IDGenerator


class RefreshStore(Protocol):
    async def save(self, jti: str, user_id: str, ttl: timedelta) -> None: ...
    # Atomic: returns the owner and removes the token in one step (Redis GETDEL).
    async def consume(self, jti: str) -> str | None: ...


class TokenService:
    """Short-lived access JWTs plus opaque, rotating refresh tokens. Access tokens are
    stateless HS256 JWTs; refresh tokens are server-side handles that are revoked on
    use, so a stolen-and-replayed refresh token fails. Same design as the Go backend.
    """

    def __init__(
        self,
        secret: str,
        access_ttl: timedelta,
        refresh_ttl: timedelta,
        store: RefreshStore,
        ids: IDGenerator,
        clock: Clock,
    ):
        self._secret = secret
        self._access_ttl = access_ttl
        self._refresh_ttl = refresh_ttl
        self._store = store
        self._ids = ids
        self._clock = clock

    def issue_access(self, user_id: str, role: Role) -> tuple[str, int]:
        now = self._clock.now()
        payload = {
            "sub": user_id,
            "role": role.value,
            "iat": int(now.timestamp()),
            "exp": int((now + self._access_ttl).timestamp()),
        }
        token = jwt.encode(payload, self._secret, algorithm="HS256")
        return token, int(self._access_ttl.total_seconds())

    async def issue_refresh(self, user_id: str) -> str:
        jti = self._ids.new_id()
        await self._store.save(jti, user_id, self._refresh_ttl)
        return jti

    async def rotate(self, refresh_token: str) -> str:
        user_id = await self._store.consume(refresh_token)
        if user_id is None:
            raise errors.INVALID_TOKEN  # unknown, expired, or already spent
        return user_id

    def parse_access(self, token: str) -> tuple[str, Role]:
        try:
            claims = jwt.decode(token, self._secret, algorithms=["HS256"])
        except jwt.PyJWTError as exc:
            raise errors.INVALID_TOKEN from exc
        sub = claims.get("sub")
        if not sub:
            raise errors.INVALID_TOKEN
        return sub, Role(claims.get("role", Role.CUSTOMER.value))
