import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Markdown } from '@/components/Markdown';
import { BACKENDS, backendReadme } from '@/lib/content';

export function generateStaticParams() {
  return BACKENDS.map((name) => ({ name }));
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  if (!(BACKENDS as readonly string[]).includes(name)) return {};
  return { title: `${backendReadme(name).title} · Ticketing Labs`, description: `The ${name} backend implementation.` };
}

export default async function BackendPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!(BACKENDS as readonly string[]).includes(name)) notFound();
  const d = backendReadme(name);
  return (
    <div>
      <Link href="/backends" className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)]">
        ← All backends
      </Link>
      <div className="mt-6">
        <Markdown>{d.body}</Markdown>
      </div>
    </div>
  );
}
