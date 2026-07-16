import fs from 'node:fs';
import path from 'node:path';

// The repo root is one level up from the website directory. All content is read from the
// real files at build time, so the site never drifts from the source.
const REPO = path.resolve(process.cwd(), '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

function firstHeading(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

export type Doc = { slug: string; title: string; body: string };

// --- Recipes (docs/recipes/*.md, minus the index and template) ---

const RECIPE_DIR = 'docs/recipes';
const RECIPE_SKIP = new Set(['README.md', 'TEMPLATE.md']);

export function recipeSlugs(): string[] {
  return fs
    .readdirSync(path.join(REPO, RECIPE_DIR))
    .filter((f) => f.endsWith('.md') && !RECIPE_SKIP.has(f))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

export function recipe(slug: string): Doc {
  const body = read(`${RECIPE_DIR}/${slug}.md`);
  return { slug, title: firstHeading(body, slug).replace(/^Recipe:\s*/i, ''), body };
}

export function recipes(): Doc[] {
  return recipeSlugs().map(recipe);
}

// --- ADRs (docs/adr/0001-*.md ...) ---

export function adrSlugs(): string[] {
  return fs
    .readdirSync(path.join(REPO, 'docs/adr'))
    .filter((f) => /^\d{4}.*\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

export function adr(slug: string): Doc {
  const body = read(`docs/adr/${slug}.md`);
  return { slug, title: firstHeading(body, slug), body };
}

export function adrs(): Doc[] {
  return adrSlugs().map(adr);
}

// --- Standalone docs ---

export function doc(rel: string, fallbackTitle: string): Doc {
  const body = read(rel);
  return { slug: rel, title: firstHeading(body, fallbackTitle), body };
}

// --- Backends ---

export const BACKENDS = ['go', 'fastapi', 'nest', 'express', 'laravel', 'symfony', 'phalcon'] as const;

export function backendReadme(name: string): Doc {
  const body = read(`backends/${name}/README.md`);
  return { slug: name, title: firstHeading(body, name), body };
}
