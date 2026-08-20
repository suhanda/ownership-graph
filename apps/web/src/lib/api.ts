import {
  apiErrorSchema,
  graphPayloadSchema,
  healthSchema,
  type ApiError,
  type GraphPayload,
  type Health,
} from '@ownership/shared';
import { z } from 'zod';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';

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
    const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
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

export const api = {
  health: () => call('/health', healthSchema),

  beneficialOwners: (companyId: string, maxDepth = 5) =>
    call(
      `/graph/companies/${encodeURIComponent(companyId)}/owners${qs({ maxDepth })}`,
      queryResultSchema,
    ),

  hiddenLink: (fromId: string, toId: string, maxDepth = 6) =>
    call(`/graph/links${qs({ fromId, toId, maxDepth })}`, queryResultSchema),

  cycles: (maxDepth = 6) => call(`/graph/cycles${qs({ maxDepth })}`, queryResultSchema),

  watchlist: (limit = 20) => call(`/graph/watchlist${qs({ limit })}`, queryResultSchema),

  nominee: (personId: string) =>
    call(`/graph/people/${encodeURIComponent(personId)}/nominee`, queryResultSchema),

  sharedRegistration: (companyId: string, limit = 8) =>
    call(
      `/graph/companies/${encodeURIComponent(companyId)}/shared-registration${qs({ limit })}`,
      queryResultSchema,
    ),

  neighbours: (id: string, limit = 40) =>
    call(`/graph/nodes/${encodeURIComponent(id)}/neighbours${qs({ limit })}`, queryResultSchema),

  entities: (term: string, limit = 8) =>
    call(`/graph/entities${qs({ term, limit })}`, z.array(z.record(z.string(), z.unknown()))),
};

export type { ApiError, GraphPayload, Health };
