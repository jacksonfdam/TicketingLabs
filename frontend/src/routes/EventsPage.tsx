import { Link } from 'react-router-dom';
import { useEvents } from '../api/hooks';

export default function EventsPage() {
  const { data, isLoading, error } = useEvents();

  if (isLoading) {
    return (
      <div>
        <h1>Events</h1>
        <div className="skeleton-list">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton-card" />)}
        </div>
      </div>
    );
  }
  if (error) return <p className="error">Could not load events.</p>;

  return (
    <div>
      <h1>Events</h1>
      <ul className="event-list">
        {data?.data.map((e) => (
          <li key={e.id}>
            <Link className="card event" to={`/events/${e.id}`}>
              <strong>{e.name}</strong>
              <span className="muted">{e.venue}</span>
              <span className={`badge badge-${e.status}`}>{e.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
