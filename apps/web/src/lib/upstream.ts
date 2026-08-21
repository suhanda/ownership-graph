import { cookies } from 'next/headers';
import { normaliseBaseUrl } from './base-url';
import { SESSION_COOKIE, verifySession } from './session';

/** The real API. Server-only: never exposed with a NEXT_PUBLIC_ prefix, so it stays out of the bundle. */
export const UPSTREAM = normaliseBaseUrl(process.env.API_URL, 'http://localhost:3101');

/** Sent to the API by the proxy. The browser never sees it. */
export function upstreamHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const secret = process.env.API_SHARED_SECRET;
  return { ...extra, ...(secret ? { 'x-api-secret': secret } : {}) };
}

/**
 * Proxies check the session themselves rather than relying on the middleware: a fetch that has lost
 * its session should get a 401 it can handle, not a redirect to an HTML login page.
 */
export async function sessionValid(): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  const jar = await cookies();
  return verifySession(password, jar.get(SESSION_COOKIE)?.value);
}
