import { NextResponse } from 'next/server';
import { sessionValid, upstreamHeaders, UPSTREAM } from '@/lib/upstream';

/** Streaming must not be buffered, so the upstream body is piped through untouched. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!(await sessionValid())) {
    return NextResponse.json(
      { kind: 'unauthorised', message: 'Session expired.' },
      { status: 401 },
    );
  }

  const body = await request.text();
  try {
    const upstream = await fetch(`${UPSTREAM}/chat`, {
      method: 'POST',
      headers: upstreamHeaders({ 'content-type': 'application/json' }),
      body,
    });
    if (!upstream.ok || !upstream.body) {
      return new Response(await upstream.text(), { status: upstream.status });
    }
    return new Response(upstream.body, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  } catch {
    return NextResponse.json(
      { kind: 'internal', message: 'Chat is unreachable.' },
      { status: 502 },
    );
  }
}

export async function GET(): Promise<Response> {
  if (!(await sessionValid())) {
    return NextResponse.json({ available: false, reason: 'not_configured', presetQuestions: [] });
  }
  try {
    const upstream = await fetch(`${UPSTREAM}/chat/status`, {
      headers: upstreamHeaders(),
      cache: 'no-store',
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return NextResponse.json({ available: false, reason: 'not_configured', presetQuestions: [] });
  }
}
