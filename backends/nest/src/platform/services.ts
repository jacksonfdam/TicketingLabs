// Small concrete implementations of the low-level ports: clock, ids, password hashing.
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { Clock, IdGenerator, PasswordHasher } from '../usecase/ports';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class UuidGenerator implements IdGenerator {
  newId(): string {
    return uuidv4();
  }
}

// bcrypt is used rather than argon2 so the identical seeded hash authenticates against
// every backend in the lab. bcryptjs verifies the $2a$ hashes in the seed.
export class BcryptHasher implements PasswordHasher {
  verify(hash: string, plaintext: string): boolean {
    try {
      return bcrypt.compareSync(plaintext, hash);
    } catch {
      return false;
    }
  }
}
