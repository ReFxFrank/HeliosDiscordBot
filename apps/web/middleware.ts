import { NextResponse, type NextRequest } from 'next/server';

/**
 * Two jobs:
 *
 * 1. Wiki subdomain: requests to wiki.<domain> serve the docs — `/` becomes
 *    `/docs`, `/moderation` becomes `/docs/moderation` — so wiki.solari.gg
 *    works like wiki.mee6.xyz while the same pages stay reachable on the main
 *    domain under /docs. (Point the wiki DNS record at the same origin.)
 *
 * 2. Forward the pathname as a header so server components (the guild layout)
 *    can read the current route — used to hard-block config pages for modules
 *    the owner has globally disabled.
 */
export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;

  if (
    host.startsWith('wiki.') &&
    !pathname.startsWith('/docs') &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/_next')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? '/docs' : `/docs${pathname}`;
    return NextResponse.rewrite(url);
  }

  const headers = new Headers(request.headers);
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next internals and static files (favicon, images, …).
  matcher: ['/((?!_next/|.*\\..*).*)'],
};
