import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

/**
 * Next's `proxy` convention, renamed from `middleware` in Next 16. Not to be confused with the API
 * proxy route handlers under `app/api/` — this one gates pages, those forward requests upstream.
 *
 * Gates every page behind the shared password. The login page and the session endpoint are exempt
 * for obvious reasons; `/api/*` route handlers check the session themselves, because a redirect to HTML is
 * the wrong answer to a fetch.
 *
 * With APP_PASSWORD unset the gate is off entirely, so local development needs no setup.
 */
export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const authenticated = await verifySession(password, request.cookies.get(SESSION_COOKIE)?.value);
  if (authenticated) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only. `/api/*` is excluded on purpose: those routes enforce the session themselves and
  // answer with 401, because redirecting a fetch to an HTML login page gives the caller a parse
  // error instead of something it can act on.
  matcher: ['/((?!login|api/|_next/static|_next/image|favicon.ico).*)'],
};
