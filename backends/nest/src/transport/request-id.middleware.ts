import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Ensures every request has an X-Request-Id, honouring one injected by the gateway and
// generating one otherwise. Stashed on the request and echoed on the response so a
// single id follows the request through logs, traces, and error bodies.
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const id = (req.headers['x-request-id'] as string) || uuidv4();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
