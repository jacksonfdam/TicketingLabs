import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { Errors } from '../domain/errors';
import { TOKENS, TokenService } from '../usecase/ports';

// Validates the bearer access token and puts the user id on the request. Absent or
// invalid token means 401 (via the domain error), full stop.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(TOKENS.TokenService) private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { userId?: string }>();
    const auth = req.headers['authorization'] ?? '';
    if (!auth.startsWith('Bearer ')) throw Errors.InvalidToken;
    const { userId } = this.tokens.parseAccess(auth.slice('Bearer '.length));
    req.userId = userId;
    return true;
  }
}
