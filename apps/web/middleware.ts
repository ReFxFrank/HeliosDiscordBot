import { NextResponse, type NextRequest } from 'next/server';

/**
 * Forward the request pathname as a header so server components (the guild
 * layout) can read the current route without a client boundary. Used to hard-
 * block config pages for modules the owner has globally disabled.
 */
export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/servers/:path*'],
};
