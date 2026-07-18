import Link from 'next/link';
import type { Metadata } from 'next';
import { BACKENDS } from '@/lib/content';

export const metadata: Metadata = {
  title: 'Backends · Ticketing Labs',
  description: 'The same flash-sale system implemented in seven backend frameworks, all passing the same contract tests.',
};

const META: Record<string, { name: string; lang: string; blurb: string }> = {
  go: { name: 'Go', lang: 'Go', blurb: 'The reference implementation. Standard library plus a thin router, hexagonal to the core.' },
  fastapi: { name: 'FastAPI', lang: 'Python', blurb: 'Async Python, type-hinted end to end, with asyncpg talking to Postgres.' },
  nest: { name: 'NestJS', lang: 'TypeScript', blurb: 'Opinionated modules and dependency injection, the Angular of the backend.' },
  express: { name: 'Express', lang: 'TypeScript', blurb: 'Minimal and unopinionated, so the hexagonal structure has to be deliberate.' },
  laravel: { name: 'Laravel', lang: 'PHP', blurb: 'Batteries-included PHP running on FrankenPHP, the service layer kept framework-free.' },
  symfony: { name: 'Symfony', lang: 'PHP', blurb: 'Components and explicit wiring, the enterprise end of PHP.' },
  phalcon: { name: 'Phalcon', lang: 'PHP (C extension)', blurb: 'A framework compiled as a C extension, for when PHP needs to be fast.' },
};

export default function BackendsPage() {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent)]">Backends</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Seven implementations, one contract</h1>
      <p className="mt-4 max-w-2xl text-lg text-[#d7dbe4]">
        Each backend is written to feel native to its framework, and each passes the same sixteen contract tests.
        The frontend cannot tell them apart, and neither, from the outside, can you.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {BACKENDS.map((b) => {
          const m = META[b];
          return (
            <Link
              key={b}
              href={`/backends/${b}`}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 no-underline transition-colors hover:border-[var(--accent)]"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-[var(--text)]">{m.name}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-2)]">{m.lang}</span>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{m.blurb}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
