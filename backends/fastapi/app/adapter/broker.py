"""RabbitMQ adapter via aio-pika. Carries payment work off the request path so
POST /orders can answer 202 immediately.
"""
from __future__ import annotations

from typing import Awaitable, Callable

import aio_pika


class Broker:
    def __init__(self, connection: aio_pika.abc.AbstractRobustConnection, channel: aio_pika.abc.AbstractChannel):
        self._conn = connection
        self._channel = channel

    @classmethod
    async def connect(cls, url: str) -> "Broker":
        conn = await aio_pika.connect_robust(url)
        channel = await conn.channel()
        await channel.set_qos(prefetch_count=16)
        return cls(conn, channel)

    async def close(self) -> None:
        await self._conn.close()

    async def publish(self, topic: str, payload: bytes) -> None:
        await self._channel.declare_queue(topic, durable=True)
        await self._channel.default_exchange.publish(
            aio_pika.Message(body=payload, delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
            routing_key=topic,
        )

    async def consume(self, topic: str, handler: Callable[[bytes], Awaitable[None]]) -> None:
        """Runs handler for each message. The handler owns retry/timeout policy; a
        message whose handler raises is dropped (not requeued) so a poison message
        cannot hot-loop the worker. Dead-lettering is a Phase 4 refinement.
        """
        queue = await self._channel.declare_queue(topic, durable=True)

        async def on_message(message: aio_pika.abc.AbstractIncomingMessage) -> None:
            try:
                await handler(message.body)
                await message.ack()
            except Exception:  # noqa: BLE001 - drop poison messages rather than requeue-loop
                await message.nack(requeue=False)

        await queue.consume(on_message)
