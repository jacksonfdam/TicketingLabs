import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Markdown } from '@/components/Markdown';
import { adr, adrSlugs } from '@/lib/content';

export function generateStaticParams() {
  return adrSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!adrSlugs().includes(slug)) return {};
  return { title: `${adr(slug).title} · Ticketing Labs`, description: adr(slug).title };
}

export default async function DecisionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!adrSlugs().includes(slug)) notFound();
  const d = adr(slug);
  return (
    <div>
      <Link href="/decisions" className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)]">
        ← All decisions
      </Link>
      <div className="mt-6">
        <Markdown>{d.body}</Markdown>
      </div>
    </div>
  );
}
