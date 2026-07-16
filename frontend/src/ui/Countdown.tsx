import { useEffect, useState } from 'react';

// Ticks down to a reservation's expires_at. When it hits zero the hold is gone and the
// sweeper will have returned the stock; the parent uses onExpire to reset the flow.
export function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const target = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      const r = target - Date.now();
      setRemaining(r);
      if (r <= 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 250);
    return () => clearInterval(t);
  }, [target, onExpire]);

  const secs = Math.max(0, Math.floor(remaining / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return <span className={secs < 15 ? 'countdown urgent' : 'countdown'}>{mm}:{ss}</span>;
}
