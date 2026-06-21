import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { createSessionToken } from '@/lib/auth-utils';

// Helper for timing-safe string comparison
function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  
  if (aBuf.length !== bBuf.length) {
    // Perform dummy timingSafeEqual comparison with same length to prevent timing leaks
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    
    const AUTH_USER = process.env.AUTH_USER;
    const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
    const AUTH_SECRET = process.env.AUTH_SECRET;
    
    if (!AUTH_USER || !AUTH_PASSWORD || !AUTH_SECRET) {
      console.error('Authentication configuration missing in environment variables.');
      return NextResponse.json(
        { error: 'Server authentication is not configured.' },
        { status: 500 }
      );
    }
    
    // Validate inputs exist
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Timing-safe comparison of credentials
    const isUserValid = timingSafeCompare(username, AUTH_USER);
    const isPassValid = timingSafeCompare(password, AUTH_PASSWORD);
    
    if (!isUserValid || !isPassValid) {
      // Return a generic error without revealing which field was incorrect
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Generate signed session token valid for 60 days
    const maxAgeSeconds = 60 * 24 * 60 * 60; // 60 days
    const maxAgeMs = maxAgeSeconds * 1000;
    const token = await createSessionToken(username, AUTH_SECRET, maxAgeMs);
    
    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set('putup_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: maxAgeSeconds,
      path: '/',
    });
    
    return NextResponse.json({ success: true, redirect: '/' });
  } catch (error) {
    console.error('Error handling login API:', error);
    return NextResponse.json(
      { error: 'An unexpected login error occurred.' },
      { status: 500 }
    );
  }
}
