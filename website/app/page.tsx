import Link from 'next/link';

const STATS = [
  { n: '7', label: 'backends, one contract' },
  { n: '16', label: 'contract tests, identical for all' },
  { n: '100/100', label: 'seats sold under load, 0 over-sold' },
  { n: '14', label: 'recipes explaining the how' },
];

const CARDS = [
  { href: '/build', title: 'The build, step by step', body: 'The chronological story: contract first, then a reference backend, then six more, a frontend, resilience, observability, scale.' },
  { href: '/architecture', title: 'Architecture', body: 'One contract as the source of truth, a gateway the frontend is blind behind, and the same hexagonal shape inside every backend.' },
  { href: '/backends', title: 'Seven backends', body: 'Go, FastAPI, NestJS, Express, Laravel, Symfony, Phalcon. Same behaviour, idiomatic in each.' },
  { href: '/recipes', title: 'Recipes', body: 'Idempotency, distributed locks, no-overselling, async payment, JWT rotation, mTLS, caching, tracing. Each points at real code.' },
  { href: '/decisions', title: 'Decisions (ADRs)', body: 'Why the contract is one file, why the domain sits behind a service layer, why backends switch with one line.' },
];

export default function Home() {
  return (
    <div>
      <section className="py-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">Open teaching lab</p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          One flash-sale ticketing system,<br />
          <span className="text-[var(--muted)]">seven backends behind one contract.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-[#d7dbe4]">
          A concert goes on sale: far more buyers than tickets, all arriving at the same second. That one
          scenario forces everything worth teaching: stock contention, distributed locks, idempotency, a
          virtual queue, asynchronous payment, circuit breakers, and a load test whose entire job is to try to
          make you oversell. Here it is, built seven times, proven not to.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/build" className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white no-underline hover:opacity-90">
            Start the tour →
          </Link>
          <Link href="/recipes" className="rounded-lg border border-[var(--line)] px-4 py-2 font-semibold text-[var(--text)] no-underline hover:border-[var(--accent)]">
            Jump to the recipes
          </Link>
        </div>
      </section>

      <section className="my-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="text-2xl font-extrabold text-[var(--accent-2)]">{s.n}</div>
            <div className="mt-1 text-sm text-[var(--muted)]">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="my-12">
        <h2 className="text-xl font-bold">The premise, in three rules</h2>
        <ol className="mt-4 space-y-3">
          <li className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <strong>One contract.</strong> A single OpenAPI spec is the source of truth. Every backend implements
            it exactly; the frontend generates its client from it.
          </li>
          <li className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <strong>The frontend is blind to the backend.</strong> It talks to one gateway. Switching the active
            backend is one line of config, and the frontend never changes. There is no <code>if backend == …</code> anywhere.
          </li>
          <li className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <strong>Frameworks only do delivery.</strong> Business rules live in a framework-free service layer, so
            the framework becomes a swappable detail.
          </li>
        </ol>
      </section>

      <section className="my-12 grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 no-underline transition-colors hover:border-[var(--accent)]"
          >
            <div className="text-lg font-bold text-[var(--text)]">{c.title}</div>
            <p className="mt-2 text-sm text-[var(--muted)]">{c.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
