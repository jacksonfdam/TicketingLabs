import * as jwt from 'jsonwebtoken';

import { Errors } from '../domain/errors';
import { Role } from '../domain/models';
import { Clock, IdGenerator, TokenService } from '../usecase/ports';

// consume must be atomic: returns the owner and removes the token in one step (GETDEL).
export interface RefreshStore {
  save(jti: string, userId: string, ttlSeconds: number): Promise<void>;
  consume(jti: string): Promise<string | null>;
}

// Short-lived access JWTs plus opaque, rotating refresh tokens. Rotating one revokes
// it, so a stolen-and-replayed refresh token fails.
export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly accessTtlSeconds: number,
    private readonly refreshTtlSeconds: number,
    private readonly store: RefreshStore,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  issueAccess(userId: string, role: Role): { token: string; expiresIn: number } {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const token = jwt.sign({ sub: userId, role, iat: now, exp: now + this.accessTtlSeconds }, this.secret, {
      algorithm: 'HS256',
    });
    return { token, expiresIn: this.accessTtlSeconds };
  }

  async issueRefresh(userId: string): Promise<string> {
    const jti = this.ids.newId();
    await this.store.save(jti, userId, this.refreshTtlSeconds);
    return jti;
  }

  async rotate(refreshToken: string): Promise<string> {
    const userId = await this.store.consume(refreshToken);
    if (!userId) throw Errors.InvalidToken;
    return userId;
  }

  parseAccess(token: string): { userId: string; role: Role } {
    let claims: jwt.JwtPayload;
    try {
      claims = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch {
      throw Errors.InvalidToken;
    }
    const sub = claims.sub;
    if (!sub || typeof sub !== 'string') throw Errors.InvalidToken;
    return { userId: sub, role: (claims.role as Role) ?? Role.Customer };
  }
}
