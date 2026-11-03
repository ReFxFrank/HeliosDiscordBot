import type { NextConfig } from 'next';
import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

// Content-Security-Policy tuned to what the app actually loads: same-origin
// assets, Discord CDN avatars, and inline styles (the dashboard uses many
// style={{}} props + Tailwind). 'unsafe-inline' on script is a pragmatic
// concession — Next injects inline hydration scripts and we have no nonce
// pipeline yet; tightening to nonce-based CSP is tracked as a follow-up. The
// hardened directives (frame-ancestors/object-src/base-uri/form-action) carry
// the real clickjacking/injection protection and cost nothing in function.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: https://cdn.discordapp.com https://*.discordapp.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages are shipped as TypeScript source, so Next must transpile them.
  transpilePackages: ['@refx/shared', '@refx/database', '@refx/jobs'],
  // We lint the repo with our own flat ESLint config (`pnpm lint`), so skip
  // Next's separate build-time lint pass.
  eslint: { ignoreDuringBuilds: true },
  // Security headers set at the app layer so they apply behind any edge proxy
  // (the production nginx doesn't add them; browsers ignore HSTS over plain
  // http, so local dev is unaffected).
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Content-Security-Policy', value: CSP },
        // Redundant with frame-ancestors but covers older browsers.
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    },
  ],
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
