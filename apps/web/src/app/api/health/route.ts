import { NextResponse } from 'next/server';
import { sessionValid, upstreamHeaders, UPSTREAM } from '@/lib/upstream';

/** Exists so a client-side health check has somewhere to go; the server calls the API directly. */
export async function GET(): Promise<Response> {
  if (!(await sessionValid())) {
    return NextResponse.json(
      { kind: 'unauthorised', message: 'Session expired.' },
      { status: 401 },
    );
  }
  try {
    const upstream = await fetch(`${UPSTREAM}/health`, {
      headers: upstreamHeaders(),
      cache: 'no-store',
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { api: 'ok', database: 'unreachable', detail: 'Cannot reach the service.' },
      { status: 200 },
    );
  }
}
