import {
  apiErrorSchema,
  graphPayloadSchema,
  healthSchema,
  type ApiError,
  type GraphPayload,
  type Health,
} from '@ownership/shared';
import { z } from 'zod';

const onServer = typeof window === 'undefined';

/**
 * Where a request goes depends on who is making it.
 *
 * On the server (the RSC page) it goes straight to the API with the shared secret — no reason to
 * make a round trip through our own proxy. In the browser it goes to a same-origin route handler,
 * so the secret stays server-side, the session cookie is sent automatically, and there is no CORS.
 *
 * Neither of these env vars carries a NEXT_PUBLIC_ prefix, so neither is inlined into the bundle.
 */
const base = (): string =>
  onServer ? `${process.env.API_URL ?? 'http://localhost:3101'}/graph` : '/api/graph';

const authHeaders = (): Record<string, string> => {
  if (!onServer) return {};
  const secret = process.env.API_SHARED_SECRET;
  return secret ? { 'x-api-secret': secret } : {};
};

const queryResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  graph: graphPayloadSchema.optional(),
});
export type QueryResult = z.infer<typeof queryResultSchema>;

/** Discriminated so callers must handle failure; the UI never renders a half-loaded answer. */
export type Fetched<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const UNREACHABLE: ApiError = {
  kind: 'database_unreachable',
  message:
    'Cannot reach the service. It may be starting up, or your connection may be down. Retrying shortly.',
  retryAfter: 5,
};

async function call<T>(path: string, schema: z.ZodType<T>): Promise<Fetched<T>> {
  try {
    const response = await fetch(`${base()}${path}`, { cache: 'no-store', headers: authHeaders() });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      return { ok: false, error: parsed.success ? parsed.data : UNREACHABLE };
    }
    return { ok: true, data: schema.parse(body) };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

const qs = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

/** /health sits outside /graph, so it needs its own base. */
async function callAbsolute<T>(path: string, schema: z.ZodType<T>): Promise<Fetched<T>> {
  const root = onServer ? (process.env.API_URL ?? 'http://localhost:3101') : '/api';
  try {
    const response = await fetch(`${root}${path}`, { cache: 'no-store', headers: authHeaders() });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body);
      return { ok: false, error: parsed.success ? parsed.data : UNREACHABLE };
    }
    return { ok: true, data: schema.parse(body) };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

export const api = {
  health: () => callAbsolute('/health', healthSchema),

  beneficialOwners: (companyId: string, maxDepth = 5) =>
    call(
      `/companies/${encodeURIComponent(companyId)}/owners${qs({ maxDepth })}`,
      queryResultSchema,
    ),

  hiddenLink: (fromId: string, toId: string, maxDepth = 6) =>
    call(`/links${qs({ fromId, toId, maxDepth })}`, queryResultSchema),

  cycles: (maxDepth = 6) => call(`/cycles${qs({ maxDepth })}`, queryResultSchema),

  watchlist: (limit = 20) => call(`/watchlist${qs({ limit })}`, queryResultSchema),

  nominee: (personId: string) =>
    call(`/people/${encodeURIComponent(personId)}/nominee`, queryResultSchema),

  sharedRegistration: (companyId: string, limit = 8) =>
    call(
      `/companies/${encodeURIComponent(companyId)}/shared-registration${qs({ limit })}`,
      queryResultSchema,
    ),

  neighbours: (id: string, limit = 40) =>
    call(`/nodes/${encodeURIComponent(id)}/neighbours${qs({ limit })}`, queryResultSchema),

  entities: (term: string, limit = 8) =>
    call(`/entities${qs({ term, limit })}`, z.array(z.record(z.string(), z.unknown()))),
};

export type { ApiError, GraphPayload, Health };
