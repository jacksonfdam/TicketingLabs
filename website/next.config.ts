import type { NextConfig } from 'next';

// The site reads the repo's markdown at build time and renders static pages, so it needs
// nothing at runtime. Docs and recipes live one directory up (repo root); on Vercel set
// the project root directory to `website` and the full repo is still cloned for the build.
const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd() + '/..',
};

export default nextConfig;
