// HTTP client for the fake payment gateway, with a hard timeout so a hanging provider
// cannot hang the worker. Retry/backoff lives in the worker; circuit breaker is Phase 4.

import { PaymentGateway } from '../usecase/ports';

export class PaymentGatewayClient implements PaymentGateway {
  constructor(private readonly baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async charge(orderId: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${this.baseUrl}/charges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`payment gateway returned ${res.status}`);
      const body = (await res.json()) as { provider_ref: string };
      return body.provider_ref;
    } finally {
      clearTimeout(timer);
    }
  }
}
