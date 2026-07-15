import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';

import { DomainError, Errors } from '../domain/errors';

const STATUS: Record<string, number> = {
  [Errors.BadRequest.code]: 400,
  [Errors.InvalidCredentials.code]: 401,
  [Errors.InvalidToken.code]: 401,
  [Errors.Forbidden.code]: 403,
  [Errors.NotAdmitted.code]: 403,
  [Errors.NotFound.code]: 404,
  [Errors.Validation.code]: 422,
  [Errors.InventoryExhausted.code]: 409,
  [Errors.Conflict.code]: 409,
  [Errors.ReservationState.code]: 409,
  [Errors.RateLimited.code]: 429,
  [Errors.LockUnavailable.code]: 429,
  [Errors.Internal.code]: 500,
};

// One filter to rule the error shape. Domain errors map to their status and the
// standard envelope. NestJS's own HttpExceptions (malformed body, unknown route)
// collapse to the shared 400. Anything unrecognised becomes a generic 500. Internal
// detail never reaches the client.
@Catch()
export class EnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req as Request & { requestId?: string }).requestId ?? '';

    let err: DomainError;
    if (exception instanceof DomainError) {
      err = exception;
    } else if (exception instanceof HttpException) {
      // A framework-level rejection (bad JSON body, 404 route, 405) is a malformed
      // request as far as our contract is concerned: the shared 400.
      const status = exception.getStatus();
      err = status === 404 ? Errors.NotFound : Errors.BadRequest;
    } else {
      err = Errors.Internal;
    }

    const status = STATUS[err.code] ?? 500;
    res.setHeader('X-Request-Id', requestId);
    res.status(status).json({
      error: { code: err.code, message: err.publicMessage, request_id: requestId },
    });
  }
}
