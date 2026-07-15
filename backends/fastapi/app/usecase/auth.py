from __future__ import annotations

from dataclasses import dataclass

from app.domain import errors
from app.domain.models import Role
from app.usecase.ports import PasswordHasher, TokenService, UserRepository


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int


class AuthService:
    def __init__(self, users: UserRepository, hasher: PasswordHasher, tokens: TokenService):
        self._users = users
        self._hasher = hasher
        self._tokens = tokens

    async def login(self, email: str, password: str) -> TokenPair:
        user = await self._users.find_by_email(email)
        # Same error whether the email is unknown or the password is wrong. Telling an
        # attacker which emails exist is a free gift we decline to give.
        if user is None or not self._hasher.verify(user.password_hash, password):
            raise errors.INVALID_CREDENTIALS
        return await self._issue(user.id, user.role)

    async def refresh(self, refresh_token: str) -> TokenPair:
        user_id = await self._tokens.rotate(refresh_token)  # raises on reuse/expiry
        user = await self._users.find_by_id(user_id)
        if user is None:
            raise errors.INVALID_TOKEN
        return await self._issue(user.id, user.role)

    async def _issue(self, user_id: str, role: Role) -> TokenPair:
        access, expires_in = self._tokens.issue_access(user_id, role)
        refresh = await self._tokens.issue_refresh(user_id)
        return TokenPair(access_token=access, refresh_token=refresh, expires_in=expires_in)
