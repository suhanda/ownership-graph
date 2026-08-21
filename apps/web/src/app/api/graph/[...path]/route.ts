import { NextResponse } from 'next/server';
import { sessionValid, upstreamHeaders, UPSTREAM } from '@/lib/upstream';

/**
 * Same-origin proxy for the graph API.
 *
 * The browser used to call Render directly, which meant the API had to be publicly reachable and
 * CORS had to be configured for the Vercel domain. Routing through here instead keeps the shared
 * secret server-side, removes CORS entirely, and means one session cookie protects everything.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (!(await sessionValid())) {
    return NextResponse.json(
      { kind: 'unauthorised', message: 'Session expired.' },
      { status: 401 },
    );
  }

  const { path } = await params;
  const search = new URL(request.url).search;
  const target = `${UPSTREAM}/graph/${path.map(encodeURIComponent).join('/')}${search}`;

  try {
    const upstream = await fetch(target, { headers: upstreamHeaders(), cache: 'no-store' });
    const body = await upstream.text();

    // The API has no 404s of its own — an unknown id returns 200 with an empty array. So a 404 here
    // means the request never reached a route, which in practice means API_URL is wrong.
    if (upstream.status === 404) {
      return NextResponse.json(
        {
          kind: 'database_misconfigured',
          message: 'The API could not be reached at its configured address. Check API_URL.',
        },
        { status: 502 },
      );
    }
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        ...(upstream.headers.get('retry-after')
          ? { 'retry-after': upstream.headers.get('retry-after') as string }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      { kind: 'database_unreachable', message: 'Cannot reach the service.', retryAfter: 5 },
      { status: 503 },
    );
  }
}
