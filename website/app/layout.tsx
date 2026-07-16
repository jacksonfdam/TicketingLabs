import type { Metadata } from 'next';
import Link from 'next/link';
import 'highlight.js/styles/github-dark.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ticketing Labs: one flash-sale system, seven backends',
  description:
    'An open teaching lab: the same flash-sale ticketing system implemented in seven backend frameworks behind one OpenAPI contract, one gateway, and one frontend. Built to demonstrate concurrency, resilience, observability, and scale.',
};

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/build', label: 'The build' },
  { href: '/architecture', label: 'Architecture' },
  { href: '/backends', label: 'Backends' },
  { href: '/recipes', label: 'Recipes' },
  { href: '/decisions', label: 'Decisions' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 text-sm">
            <Link href="/" className="font-extrabold tracking-tight text-[var(--text)] no-underline">
              Ticketing<span className="text-[var(--accent)]">Labs</span>
            </Link>
            <span className="flex-1" />
            {NAV.slice(1).map((n) => (
              <Link key={n.href} href={n.href} className="text-[var(--muted)] hover:text-[var(--text)]">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-5 py-10 text-sm text-[var(--muted)]">
          An open teaching lab. MIT-licensed. One contract, seven backends, no overselling.
        </footer>
      </body>
    </html>
  );
}
