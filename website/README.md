# Website

The project's documentation site. It explains the system in the order it was built and
renders the repository's own markdown (recipes, decision records, architecture and domain
docs, backend readmes) at build time, so the site never drifts from the source.

Built with Next.js (App Router, fully static), Tailwind, react-markdown, and Mermaid.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build    # static export to .next, all pages prerendered
npm start        # serve the production build
```

Content is read from the repository root at build time via `lib/content.ts`, which resolves
one directory up from `website/`. Run builds with the repository checked out.

## Deploy

Hosted on Vercel. Set the project's Root Directory to `website`; the framework preset
(Next.js) supplies the build and output settings. No environment variables are required.
