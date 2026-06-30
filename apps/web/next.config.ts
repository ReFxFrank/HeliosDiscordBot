import type { NextConfig } from 'next';
import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TypeScript source, so Next must transpile them.
  transpilePackages: ['@helios/shared', '@helios/database', '@helios/jobs'],
  // We lint the repo with our own flat ESLint config (`pnpm lint`), so skip
  // Next's separate build-time lint pass.
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    // In a pnpm monorepo, Next bundles Prisma (it's re-exported by a transpiled
    // workspace package); this plugin copies the native query engine next to the
    // server bundle so it's found at runtime.
    if (isServer) {
      config.plugins = config.plugins ?? [];
      config.plugins.push(new PrismaPlugin());
    }
    return config;
  },
};

export default nextConfig;
