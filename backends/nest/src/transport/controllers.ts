import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { Errors } from '../domain/errors';
import { AuthService } from '../usecase/auth.service';
import { EventDetail, EventService } from '../usecase/events.service';
import { OrderService } from '../usecase/order.service';
import { PaymentService } from '../usecase/payment.service';
import { QueueService } from '../usecase/queue.service';
import { ReservationService } from '../usecase/reservation.service';
import { TOKENS } from '../usecase/ports';
import { AuthGuard } from './auth.guard';
import * as dto from './dto';

const userId = (req: Request) => (req as Request & { userId: string }).userId;

@Controller('auth')
export class AuthController {
  constructor(@Inject(TOKENS.AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { email?: string; password?: string }) {
    return dto.tokenPairDto(await this.auth.login(body?.email ?? '', body?.password ?? ''));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: { refresh_token?: string }) {
    return dto.tokenPairDto(await this.auth.refresh(body?.refresh_token ?? ''));
  }
}

@Controller('events')
export class EventsController {
  constructor(@Inject(TOKENS.EventService) private readonly events: EventService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  async list(@Query('cursor') cursor = '', @Query('limit') limit = '20') {
    const n = parseInt(limit, 10);
    const { events, nextCursor } = await this.events.list(cursor, Number.isFinite(n) ? n : 20);
    return dto.eventPageDto(events, nextCursor);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Headers('if-none-match') ifNoneMatch: string | undefined, @Res() res: Response) {
    const detail = await this.events.get(id);
    const etag = weakEtag(detail);
    if (ifNoneMatch === etag) {
      res.setHeader('ETag', etag).status(304).end();
      return;
    }
    res.setHeader('ETag', etag).setHeader('Cache-Control', 'public, max-age=5').json(dto.eventDetailDto(detail));
  }
}

@Controller('events/:id/queue')
@UseGuards(AuthGuard)
export class QueueController {
  constructor(@Inject(TOKENS.QueueService) private readonly queue: QueueService) {}

  @Post()
  @HttpCode(201)
  async join(@Param('id') eventId: string, @Req() req: Request) {
    return dto.queueTokenDto(await this.queue.join(userId(req), eventId));
  }

  @Get('status')
  async status(@Param('id') eventId: string, @Req() req: Request) {
    return dto.queueTokenDto(await this.queue.status(userId(req), eventId));
  }
}

@Controller('reservations')
@UseGuards(AuthGuard)
export class ReservationsController {
  constructor(@Inject(TOKENS.ReservationService) private readonly reservations: ReservationService) {}

  @Post()
  async create(
    @Body() body: { sector_id?: string; quantity?: number },
    @Headers('idempotency-key') idemKey: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!idemKey) throw Errors.Validation;
    const result = await this.reservations.create(userId(req), body?.sector_id ?? '', body?.quantity ?? 0, idemKey);
    // 201 for a fresh hold, 200 for an idempotent replay. The contract distinguishes.
    res.status(result.replayed ? 200 : 201).json(dto.reservationDto(result.reservation));
  }

  @Delete(':id')
  @HttpCode(204)
  async release(@Param('id') id: string, @Req() req: Request) {
    await this.reservations.release(userId(req), id);
  }
}

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(@Inject(TOKENS.OrderService) private readonly orders: OrderService) {}

  @Post()
  @HttpCode(202)
  async create(
    @Body() body: { reservation_id?: string },
    @Headers('idempotency-key') idemKey: string | undefined,
    @Req() req: Request,
  ) {
    if (!idemKey) throw Errors.Validation;
    return dto.orderDto(await this.orders.create(userId(req), body?.reservation_id ?? '', idemKey));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return dto.orderDto(await this.orders.get(id));
  }
}

@Controller('webhooks')
export class WebhookController {
  constructor(
    @Inject(TOKENS.PaymentService) private readonly payments: PaymentService,
    @Inject(TOKENS.Config) private readonly config: { paymentWebhookSecret: string },
  ) {}

  @Post('payment')
  @HttpCode(200)
  async payment(@Req() req: Request, @Headers('x-signature') signature: string | undefined) {
    const raw: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from('');
    // Verify the HMAC before trusting a byte of the payload. An unsigned webhook is an
    // unauthenticated stranger telling us an order was paid.
    if (!validSignature(this.config.paymentWebhookSecret, signature ?? '', raw)) {
      throw Errors.InvalidToken;
    }
    let data: { provider_ref?: string; order_id?: string; status?: string };
    try {
      data = JSON.parse(raw.toString('utf8'));
    } catch {
      throw Errors.Validation;
    }
    await this.payments.handleWebhook(data.provider_ref ?? '', data.order_id ?? '', data.status === 'succeeded');
    return { status: 'ok' };
  }
}

@Controller()
export class SystemController {
  constructor(
    @Inject(TOKENS.Config) private readonly config: unknown,
    @Inject('READINESS') private readonly readiness: () => Promise<Record<string, string>>,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    const checks = await this.readiness();
    const ok = Object.values(checks).every((v) => v === 'ok');
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
  }
}

function weakEtag(d: EventDetail): string {
  const h = createHash('sha256');
  h.update(`${d.event.id}:${d.event.status}`);
  for (const s of d.sectors) h.update(`|${s.id}:${s.availableInventory}`);
  return `W/"${h.digest('hex').slice(0, 16)}"`;
}

function validSignature(secret: string, signature: string, body: Buffer): boolean {
  const want = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
