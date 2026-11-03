import { NextResponse, type NextRequest } from 'next/server';

/**
 * Forward the pathname as a header so server components (the guild layout)
 * can read the current route — used to hard-block config pages for modules
 * the owner has globally disabled.
 */
export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except Next internals and static files (favicon, images, …).
  matcher: ['/((?!_next/|.*\\..*).*)'],
};
