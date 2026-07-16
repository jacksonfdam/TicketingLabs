// The sales-open stampede. Far more concurrent buyers than there are VIP seats, all
// racing for the same 100-seat sector at once. The invariant under test is the one the
// whole domain exists to protect: no overselling. Exactly 100 reservations may succeed;
// every other attempt must get a clean 409, never a 5xx and never a 101st seat.
//
// It targets the backend directly (not the gateway) so the edge rate-limiter does not
// mask the backend's own concurrency control — this measures the lock + atomic decrement,
// which is the interesting part and the one that differs across the seven backends.
//
//   docker run --rm --network ticketing-labs_default -v "$PWD/infra/load":/s grafana/k6 \
//     run /s/reserve-stampede.js
//
// Override with -e TARGET=..., -e ITERS=..., -e VUS=..., -e SECTOR=...

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const created = new Counter('reservations_created');
const exhausted = new Counter('reservations_exhausted');
const other = new Counter('reservations_other');

const BASE = __ENV.TARGET || 'http://backend:8080';
const EVENT = __ENV.EVENT || '11111111-1111-1111-1111-111111111111';
const SECTOR = __ENV.SECTOR || '33333333-3333-3333-3333-333333333333'; // Camarote VIP, 100 seats
const SEATS = Number(__ENV.SEATS || 100);

export const options = {
  scenarios: {
    stampede: {
      executor: 'shared-iterations',
      vus: Number(__ENV.VUS || 50),
      iterations: Number(__ENV.ITERS || 400),
      maxDuration: '120s',
    },
  },
  thresholds: {
    // The headline invariant: successful holds never exceed the available seats.
    reservations_created: [`count<=${SEATS}`],
    // The backend must never fail; over-contention is a 409, not a 500.
    'checks{kind:no5xx}': ['rate==1.0'],
  },
};

export function setup() {
  const login = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: 'buyer@ticketing.local', password: 'password123' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = login.json('access_token');
  // Join the queue once so the buyer is admitted for the whole run.
  http.post(`${BASE}/events/${EVENT}/queue`, null, { headers: { Authorization: `Bearer ${token}` } });
  return { token };
}

export default function (data) {
  const res = http.post(
    `${BASE}/reservations`,
    JSON.stringify({ sector_id: SECTOR, quantity: 1 }),
    {
      headers: {
        Authorization: `Bearer ${data.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `k6-${__VU}-${__ITER}`, // unique per attempt
      },
    },
  );

  if (res.status === 201) created.add(1);
  else if (res.status === 409) exhausted.add(1);
  else other.add(1);

  check(res, { 'no 5xx': (r) => r.status < 500 }, { kind: 'no5xx' });
}
