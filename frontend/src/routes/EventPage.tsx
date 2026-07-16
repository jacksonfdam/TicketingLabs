import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCreateOrder,
  useCreateReservation,
  useEvent,
  useJoinQueue,
  useQueueStatus,
} from '../api/hooks';
import { Countdown } from '../ui/Countdown';

type Reservation = { id: string; sector_id: string; quantity: number; expires_at: string };

export default function EventPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: detail, isLoading } = useEvent(id);

  const [joined, setJoined] = useState(false);
  const [joinPosition, setJoinPosition] = useState<number | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);

  const join = useJoinQueue();
  const queue = useQueueStatus(id, joined && !reservation);
  const reserve = useCreateReservation();
  const order = useCreateOrder();

  const token = queue.data;
  const admitted = token?.status === 'admitted';
  // Position from the live poll, falling back to the join response so it shows at once.
  const position = token?.position ?? joinPosition;

  if (isLoading) return <div className="skeleton-card" style={{ height: 200 }} />;
  if (!detail) return <p className="error">Event not found.</p>;

  async function checkout() {
    if (!reservation) return;
    const o = await order.mutateAsync(reservation.id);
    navigate(`/orders/${o.id}`);
  }

  return (
    <div>
      <h1>{detail.name}</h1>
      <p className="muted">{detail.venue}</p>

      {/* Waiting room. The queue position stays visible for the whole flow, from the
          moment you join through admission — under a real stampede you would watch it
          count down; in this demo admission is immediate. */}
      {!joined ? (
        <section className="card">
          <h2>Waiting room</h2>
          <button className="primary" disabled={join.isPending} onClick={async () => {
            const t = await join.mutateAsync(id);
            setJoinPosition((t as { position: number }).position);
            setJoined(true);
          }}>
            {join.isPending ? 'Joining…' : 'Join the queue'}
          </button>
        </section>
      ) : (
        <section className={admitted ? 'card' : 'card held'}>
          <h2>Waiting room</h2>
          <p>
            You are <strong>#{position !== null ? position + 1 : '…'}</strong> in line
            {admitted ? ' — admitted. Choose your seat below.' : '.'}
          </p>
          {!admitted && <p className="muted">Waiting for admission…</p>}
        </section>
      )}

      {/* Sector selection + reservation (only once admitted) */}
      {admitted && !reservation && (
        <section>
          <h2>Choose a sector</h2>
          <ul className="sector-list">
            {detail.sectors.map((s) => (
              <li key={s.id} className="card sector">
                <div>
                  <strong>{s.name}</strong>
                  <span className="muted"> {(s.price_cents / 100).toFixed(2)} {s.currency}</span>
                </div>
                <span className="muted">{s.available_inventory} left</span>
                <button
                  className="primary"
                  disabled={reserve.isPending || s.available_inventory < 1}
                  onClick={async () => {
                    const r = await reserve.mutateAsync({ sectorId: s.id, quantity: 1 });
                    setReservation(r as Reservation);
                  }}
                >
                  Reserve 1
                </button>
              </li>
            ))}
          </ul>
          {reserve.isError && <p className="error">{(reserve.error as Error).message}</p>}
        </section>
      )}

      {/* Reservation held: countdown + checkout */}
      {reservation && (
        <section className="card held">
          <h2>Reservation held</h2>
          <p>
            Expires in <Countdown expiresAt={reservation.expires_at} onExpire={() => setReservation(null)} />.
            Complete checkout before it runs out.
          </p>
          <button className="primary" disabled={order.isPending} onClick={checkout}>
            {order.isPending ? 'Placing order…' : 'Checkout'}
          </button>
        </section>
      )}
    </div>
  );
}
