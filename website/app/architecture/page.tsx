import Link from 'next/link';
import type { Metadata } from 'next';
import { Markdown } from '@/components/Markdown';
import { doc } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Architecture · Ticketing Labs',
  description: 'The system architecture and the domain model, rendered from the repository docs.',
};

const TABS = [
  { rel: 'docs/architecture.md', fallback: 'Architecture', label: 'System architecture' },
  { rel: 'docs/domain-model.md', fallback: 'Domain model', label: 'Domain model' },
  { rel: 'docs/client-architecture.md', fallback: 'Client architecture', label: 'Client architecture' },
];

export default function ArchitecturePage() {
  const docs = TABS.map((t) => ({ ...t, ...doc(t.rel, t.fallback) }));
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">Architecture</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">How the pieces connect</h1>
      <nav className="mt-6 flex flex-wrap gap-2">
        {docs.map((d) => (
          <a
            key={d.rel}
            href={`#${d.slug}`}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)] no-underline hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            {d.label}
          </a>
        ))}
      </nav>

      {docs.map((d) => (
        <section key={d.rel} id={d.slug} className="mt-14 scroll-mt-20 border-t border-[var(--line)] pt-8">
          <Markdown>{d.body}</Markdown>
        </section>
      ))}

      <p className="mt-14 text-sm text-[var(--muted)]">
        See also the <Link href="/decisions">decision records</Link> for why the structure is what it is.
      </p>
    </div>
  );
}
