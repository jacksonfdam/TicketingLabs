// Package broker is the RabbitMQ adapter. It carries payment work off the request
// path so POST /orders can answer 202 immediately and a worker settles payment later.
package broker

import (
	"context"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Broker struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func Connect(url string) (*Broker, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, err
	}
	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	return &Broker{conn: conn, ch: ch}, nil
}

func (b *Broker) Close() {
	if b.ch != nil {
		_ = b.ch.Close()
	}
	if b.conn != nil {
		_ = b.conn.Close()
	}
}

func (b *Broker) declare(topic string) error {
	_, err := b.ch.QueueDeclare(topic, true, false, false, false, nil)
	return err
}

// Publish sends a durable message to the queue named by topic.
func (b *Broker) Publish(ctx context.Context, topic string, payload []byte) error {
	if err := b.declare(topic); err != nil {
		return err
	}
	return b.ch.PublishWithContext(ctx, "", topic, false, false, amqp.Publishing{
		ContentType:  "application/json",
		DeliveryMode: amqp.Persistent,
		Body:         payload,
	})
}

// Consume runs handler for each message on topic. The handler owns its own retry and
// timeout policy; this loop simply acks on success and drops (does not requeue) on
// failure so a poison message cannot hot-loop the worker. A real system would route
// failures to a dead-letter queue; that is a later refinement.
func (b *Broker) Consume(ctx context.Context, topic string, handler func(context.Context, []byte) error) error {
	if err := b.declare(topic); err != nil {
		return err
	}
	if err := b.ch.Qos(16, 0, false); err != nil {
		return err
	}
	msgs, err := b.ch.Consume(topic, "", false, false, false, false, nil)
	if err != nil {
		return err
	}
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-msgs:
				if !ok {
					return
				}
				if err := handler(ctx, msg.Body); err != nil {
					_ = msg.Nack(false, false)
					continue
				}
				_ = msg.Ack(false)
			}
		}
	}()
	return nil
}
