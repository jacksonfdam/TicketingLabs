import Link from 'next/link';
import type { Metadata } from 'next';
import { adrs } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Decisions · Ticketing Labs',
  description: 'Architecture decision records: the structural choices behind the project and why they were made.',
};

export default function DecisionsPage() {
  const all = adrs();
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">Decisions</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Why it is built this way</h1>
      <p className="mt-4 max-w-2xl text-lg text-[#d7dbe4]">
        Architecture decision records. Short, dated notes on the structural choices: the context, the decision,
        and what it costs.
      </p>

      <ol className="mt-10 space-y-3">
        {all.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/decisions/${a.slug}`}
              className="block rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 no-underline transition-colors hover:border-[var(--accent)]"
            >
              <span className="text-lg font-bold text-[var(--text)]">{a.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
