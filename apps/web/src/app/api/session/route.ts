import { NextResponse } from 'next/server';
import { SESSION_COOKIE, signSession } from '@/lib/session';

/**
 * Exchanges the shared password for a signed session cookie. The password is compared server-side
 * and never reaches the browser bundle.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.json({ ok: true });

  const body: unknown = await request.json().catch(() => null);
  const provided = (body as { password?: unknown } | null)?.password;

  if (typeof provided !== 'string' || provided !== password) {
    // A deliberate pause: without it, this endpoint is a fast oracle for guessing the password.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ ok: false, error: 'That password is not right.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await signSession(password), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 3600,
  });
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
