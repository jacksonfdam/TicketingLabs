import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Markdown } from '@/components/Markdown';
import { recipe, recipeSlugs } from '@/lib/content';

export function generateStaticParams() {
  return recipeSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!recipeSlugs().includes(slug)) return {};
  return { title: `${recipe(slug).title} · Ticketing Labs`, description: `Recipe: ${recipe(slug).title}.` };
}

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!recipeSlugs().includes(slug)) notFound();
  const d = recipe(slug);
  return (
    <div>
      <Link href="/recipes" className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--text)]">
        ← All recipes
      </Link>
      <div className="mt-6">
        <Markdown>{d.body}</Markdown>
      </div>
    </div>
  );
}
