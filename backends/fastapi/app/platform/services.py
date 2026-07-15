"""Small concrete implementations of the low-level ports: clock, ids, password hashing."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import bcrypt


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class UUIDGenerator:
    def new_id(self) -> str:
        return str(uuid.uuid4())


class BcryptHasher:
    """Verifies passwords against bcrypt hashes. bcrypt is used rather than argon2 so
    the identical seeded hash authenticates against every backend in the lab.
    """

    def verify(self, hashed: str, plaintext: str) -> bool:
        try:
            return bcrypt.checkpw(plaintext.encode(), hashed.encode())
        except (ValueError, TypeError):
            return False
