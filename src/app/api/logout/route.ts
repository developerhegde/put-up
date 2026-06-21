import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete('putup_session');
  
  // Redirect to login page
  return NextResponse.redirect(new URL('/login', req.url));
}

// Support GET requests as well for easy link-based logouts if preferred
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete('putup_session');
  
  return NextResponse.redirect(new URL('/login', req.url));
}
