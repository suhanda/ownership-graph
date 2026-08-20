import { healthSchema, type Health } from '@ownership/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';

/**
 * Every response is validated against the shared schema at the boundary, so a drifting API
 * contract fails loudly here rather than rendering as `undefined` three components deep.
 */
export async function fetchHealth(): Promise<Health | { error: string }> {
  try {
    const response = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    if (!response.ok) return { error: `API responded ${response.status}` };
    return healthSchema.parse(await response.json());
  } catch {
    return { error: `Cannot reach the API at ${API_URL}` };
  }
}
