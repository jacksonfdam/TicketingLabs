import { Link, useParams } from 'react-router-dom';
import { useOrder } from '../api/hooks';

const LABELS: Record<string, string> = {
  pending: 'Payment processing…',
  paid: 'Paid — you are going!',
  failed: 'Payment failed.',
  refunded: 'Refunded.',
};

export default function OrderPage() {
  const { id = '' } = useParams();
  const { data: order, isLoading } = useOrder(id);

  if (isLoading || !order) return <div className="skeleton-card" style={{ height: 160 }} />;

  return (
    <div>
      <h1>Order</h1>
      <section className={`card order order-${order.status}`}>
        <p className="amount">{(order.amount_cents / 100).toFixed(2)}</p>
        <p className={`status status-${order.status}`}>
          {order.status === 'pending' && <span className="spinner" />} {LABELS[order.status] ?? order.status}
        </p>
        {order.status === 'pending' && <p className="muted">This page polls until payment settles.</p>}
      </section>
      <p><Link to="/">Back to events</Link></p>
    </div>
  );
}
