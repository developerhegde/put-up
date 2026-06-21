import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAndDecodeSession, createSessionToken } from './lib/auth-utils';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Retrieve session cookie and secret
  const sessionCookie = request.cookies.get('putup_session');
  const secret = process.env.AUTH_SECRET;
  
  if (!secret) {
    console.error('AUTH_SECRET environment variable is missing.');
    return NextResponse.json({ error: 'Internal Server Error (Authentication Configuration)' }, { status: 500 });
  }
  
  let sessionPayload = null;
  if (sessionCookie?.value) {
    sessionPayload = await verifyAndDecodeSession(sessionCookie.value, secret);
  }
  
  const isLoggedIn = !!sessionPayload;
  
  // 1. Handle Login Routes: redirect logged-in users to home
  if (pathname === '/login' || pathname === '/api/login') {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }
  
  // 2. Protect All Other Routes: redirect/reject if not logged in
  if (!isLoggedIn) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // 3. User is Logged In: allow request and refresh session cookie (sliding session)
  const response = NextResponse.next();
  if (sessionPayload) {
    const maxAgeSeconds = 60 * 24 * 60 * 60; // 60 days
    const maxAgeMs = maxAgeSeconds * 1000;
    const refreshedToken = await createSessionToken(sessionPayload.user, secret, maxAgeMs);
    
    response.cookies.set('putup_session', refreshedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeSeconds,
      path: '/',
    });
  }
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static assets
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
