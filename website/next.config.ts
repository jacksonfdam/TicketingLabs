import type { NextConfig } from 'next';

// The site reads the repo's markdown at build time and renders static pages, so it needs
// nothing at runtime. Docs and recipes live one directory up (repo root); on Vercel set the
// project root directory to `website` and the full repo is still cloned for the build.
//
// For GitHub Pages, the CI sets STATIC_EXPORT=true (emit a static `out/`) and
// NEXT_PUBLIC_BASE_PATH=/<repo> (serve under the project subpath). Both are unset for Vercel,
// where the site serves from the domain root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd() + '/..',
  ...(process.env.STATIC_EXPORT === 'true' ? { output: 'export', images: { unoptimized: true } } : {}),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
