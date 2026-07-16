# Recipe: a virtual waiting room

## 1. Problem

When a sale opens, the arrival rate dwarfs both the seat count and the system's safe
throughput. Letting everyone hit the reservation path at once means contention, timeouts,
and a bad experience even for those who will not get a seat. You need to admit buyers at a
rate the system can actually serve, and give the rest an honest "you are in line."

## 2. Concept

A queue in front of checkout. A buyer first joins a virtual queue for the event and gets a
token with a position. A controlled number are `admitted` at a time; only an admitted
token may proceed to reserve. This is the graceful-degradation valve: under a stampede the
queue absorbs the pressure and the reservation path only ever sees admitted, throttled
traffic. It also makes the wait visible, which is kinder than a spinner that may never
resolve.

## 3. Implementation

`backends/go/internal/usecase/queue.go`. Joining assigns the next position; admission
flips `waiting → admitted` once the position is within the admit batch:

```go
func (s *QueueService) decorate(t *domain.QueueToken) *domain.QueueToken {
    if t.Status == domain.QueueWaiting && t.Position < s.admitBatch {
        t.Status = domain.QueueAdmitted
        t.AdmittedAt = &now
    }
    return t
}
// ReservationService enforces the gate:
if !s.admission.IsAdmitted(ctx, userID, sector.EventID) { return nil, domain.ErrNotAdmitted }
```

Endpoints: `POST /events/{id}/queue` (join, rate-limited — see the rate-limiting recipe)
and `GET /events/{id}/queue/status` (poll position/admission). Reserving without an
admitted token is `403 not_admitted`. The frontend shows the position throughout the flow
(`frontend/src/routes/EventPage.tsx`).

## 4. How to see it working

```bash
# reserving before joining the queue is refused
curl -sk -o /dev/null -w "%{http_code}\n" -XPOST https://localhost/api/reservations \
  -H "Authorization: Bearer $T" -H 'Idempotency-Key: x' -d '{"sector_id":"'$SECTOR'","quantity":1}'  # 403

# join, then reserve succeeds
curl -sk -XPOST https://localhost/api/events/$EVENT/queue -H "Authorization: Bearer $T"  # {"status":"admitted","position":0,...}
```

In the browser the waiting room shows "You are #1 in line — admitted" before revealing
the seat picker.

## 5. Trade-offs

- **This admission is a simplified stand-in.** A fixed batch size admits instantly in the
  demo (one buyer is always position 0). A real waiting room raises the admission
  watermark over time as capacity frees up — a background process, not a constant — and
  would use a Redis sorted set for position rather than a per-event counter.
- **The gate must be enforced server-side.** The frontend showing "admitted" is UX; the
  `403 not_admitted` in the reservation use case is the actual control. Never trust the
  client to have waited its turn.
- **A queue trades throughput for fairness and stability.** You are deliberately not
  serving everyone at once. That is the point under a stampede, but it is overhead you do
  not want on a quiet event — which is why admission is generous by default.
