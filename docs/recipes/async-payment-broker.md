# Recipe: asynchronous payment via a message broker

## 1. Problem

Charging a payment provider is slow (network, their processing) and flaky (they have bad
days). If `POST /orders` waits for the charge to complete, every checkout holds a request
open for seconds, the frontend spins, and a provider hiccup becomes a user-facing error.
Payment should not block the buyer's request.

## 2. Concept

Accept the order synchronously, do the payment asynchronously. `POST /orders` writes a
`pending` order, drops a message on a broker, and returns `202 Accepted` immediately. A
separate worker consumes the message and talks to the provider; the result arrives later
via a signed webhook that flips the order to `paid` or `failed`. The client polls
`GET /orders/{id}`. This decouples the buyer's latency from the provider's, and lets the
worker apply retry/backoff and a circuit breaker without the buyer ever seeing it.

## 3. Implementation

`backends/go/internal/usecase/order.go` — create the order, publish, return:

```go
if err := s.orders.Create(ctx, order); err != nil { /* idempotent replay */ }
payload, _ := json.Marshal(PaymentRequested{OrderID: order.ID})
s.publisher.Publish(ctx, TopicPaymentRequested, payload) // a failed publish is recoverable
return order, nil // handler responds 202
```

The worker (`cmd/server/main.go`, `paymentWorker`) consumes `payment.requested`, calls
the gateway with retry + backoff + jitter (behind the circuit breaker), and the webhook
(`PaymentService.HandleWebhook`) settles the order and confirms the reservation. RabbitMQ
is the broker (`internal/adapter/broker`); every backend runs its worker the same way (a
goroutine in Go/Node/Python, a separate worker container for the PHP backends).

## 4. How to see it working

```bash
# create an order -> 202 immediately; poll until it settles to paid
O=$(curl -sk -XPOST https://localhost/api/orders -H "Authorization: Bearer $T" \
     -H 'Idempotency-Key: demo' -d "{\"reservation_id\":\"$R\"}" | jq -r .id)   # returns fast
until [ "$(curl -sk https://localhost/api/orders/$O -H "Authorization: Bearer $T" | jq -r .status)" = paid ]; do sleep 1; done
```

Watched live across every backend: `POST /orders` is instant, status goes `pending →
paid` a moment later once the worker charges and the signed webhook lands. Flip the fake
gateway to `fail` and the order stays `pending` — graceful degradation, no lost order
(see the circuit-breaker recipe).

## 5. Trade-offs

- **Eventual consistency is now the client's problem.** The order is not `paid` when the
  request returns; the UI must poll (or subscribe). That is the price of not blocking.
- **At-least-once delivery means idempotency is mandatory.** The broker can redeliver, so
  the webhook is idempotent by `provider_ref` and payment processing checks the order is
  still `pending`. Without that, a redelivered message double-charges.
- **A dropped message needs reconciliation.** The worker drops poison messages rather
  than hot-loop; a production system pairs that with a dead-letter queue and a sweep that
  re-drives stuck `pending` orders. This lab notes it rather than building it.
