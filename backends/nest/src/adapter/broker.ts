// RabbitMQ adapter via amqplib. Carries payment work off the request path so
// POST /orders can answer 202 immediately.

import * as amqp from 'amqplib';

import { Publisher } from '../usecase/ports';

// The type amqplib's connect() resolves to differs across versions (Connection vs
// ChannelModel), so infer it rather than name it and risk a version mismatch.
type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>>;

export class Broker implements Publisher {
  private constructor(
    private readonly conn: AmqpConnection,
    private readonly channel: amqp.Channel,
  ) {}

  static async connect(url: string): Promise<Broker> {
    const conn = await amqp.connect(url);
    const channel = await conn.createChannel();
    await channel.prefetch(16);
    return new Broker(conn, channel);
  }

  async close(): Promise<void> {
    await this.channel.close();
    await this.conn.close();
  }

  async publish(topic: string, payload: Buffer): Promise<void> {
    await this.channel.assertQueue(topic, { durable: true });
    this.channel.sendToQueue(topic, payload, { persistent: true });
  }

  // Runs handler for each message. The handler owns retry/timeout policy; a message
  // whose handler throws is dropped (not requeued) so a poison message cannot hot-loop
  // the worker. Dead-lettering is a Phase 4 refinement.
  async consume(topic: string, handler: (body: Buffer) => Promise<void>): Promise<void> {
    await this.channel.assertQueue(topic, { durable: true });
    await this.channel.consume(topic, async (msg) => {
      if (!msg) return;
      try {
        await handler(msg.content);
        this.channel.ack(msg);
      } catch {
        this.channel.nack(msg, false, false);
      }
    });
  }
}
