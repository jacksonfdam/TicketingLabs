import Link from 'next/link';
import type { Metadata } from 'next';
import { recipes } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Recipes · Ticketing Labs',
  description: 'Short explanations of the concepts behind the system and its three mobile clients, each pointing at the real code that implements it.',
};

// Curated order that follows the build story; any recipe not listed falls to the end.
const ORDER = [
  'reservation-idempotency-go',
  'distributed-lock-redis',
  'no-overselling-under-load',
  'horizontal-scale-no-oversell',
  'virtual-queue',
  'async-payment-broker',
  'jwt-refresh-rotation',
  'rate-limiting',
  'http-caching-etag',
  'resilience-circuit-breaker-go',
  'distributed-tracing-go',
  'observability-red-metrics',
  'mtls-gateway-backend',
  'security-layers',
  'expose-with-a-tunnel',
  // Client recipes — the same concept across all three mobile apps.
  'client-injected-base-url',
  'client-explicit-async-state',
  'client-defensive-deserialization',
  'client-idempotency-and-payment',
  'client-codegen-from-contract',
  'client-token-refresh-rotation',
  'client-component-previews',
  'client-atomic-design',
  'client-list-performance',
  'client-server-state-cache',
  'client-certificate-pinning',
];

function firstParagraph(md: string): string {
  const body = md.replace(/^#.*$/m, '').trim();
  for (const block of body.split(/\n\s*\n/)) {
    const line = block.trim();
    if (line && !line.startsWith('#') && !line.startsWith('```') && !line.startsWith('|') && !line.startsWith('>')) {
      return line.replace(/\s+/g, ' ').replace(/[*_`]/g, '').slice(0, 180);
    }
  }
  return '';
}

export default function RecipesPage() {
  const all = recipes();
  const sorted = [...all].sort((a, b) => {
    const ia = ORDER.indexOf(a.slug);
    const ib = ORDER.indexOf(b.slug);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">Recipes</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">How each piece works</h1>
      <p className="mt-4 max-w-2xl text-lg text-[#d7dbe4]">
        One concept per recipe. Each explains the problem, the approach, and the trade-offs, and links to the
        real code that does it. The backend recipes come first; the <code>client-</code> ones then take a single
        concept across all three mobile apps side by side.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {sorted.map((r, i) => (
          <Link
            key={r.slug}
            href={`/recipes/${r.slug}`}
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 no-underline transition-colors hover:border-[var(--accent)]"
          >
            <div className="text-xs font-semibold tabular-nums text-[var(--muted)]">{String(i + 1).padStart(2, '0')}</div>
            <div className="mt-1 text-lg font-bold text-[var(--text)]">{r.title}</div>
            <p className="mt-2 text-sm text-[var(--muted)]">{firstParagraph(r.body)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
