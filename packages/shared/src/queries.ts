import { z } from 'zod';

/**
 * Parameter schemas for the six signature queries. These are the single source of truth:
 * the API validates against them, and ticket 07 converts them to Claude tool definitions.
 *
 * `maxDepth` is capped at 6 because the variable-length bound is fixed at `*1..6` in the Cypher
 * text — Cypher cannot parameterise that bound, so it is narrowed at runtime with
 * `WHERE length(p) <= $maxDepth` rather than by building query strings.
 */
export const MAX_DEPTH_CEILING = 6;
// coerce, because these schemas serve HTTP query strings as well as the chat tool definitions.
const maxDepth = z.coerce.number().int().min(1).max(MAX_DEPTH_CEILING).default(5);
const minPct = z.coerce.number().min(0).max(1).default(0.01);
const entityId = z.string().min(1);

export const beneficialOwnersParams = z.object({ companyId: entityId, maxDepth, minPct });
export const ownershipCyclesParams = z.object({ maxDepth });
export const hiddenLinkParams = z.object({ fromId: entityId, toId: entityId, maxDepth });
export const watchlistControlParams = z.object({
  watchlistName: z.string().min(1).default('OFAC SDN'),
  maxDepth,
  minPct,
  /** Caps the collected paths, so rows and the drawn subgraph always agree. */
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const nomineeUnmaskingParams = z.object({ personId: entityId });
export const sharedRegistrationParams = z.object({
  companyId: entityId,
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export const resolveEntityParams = z.object({
  term: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});
export const neighbourhoodParams = z.object({
  id: entityId,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type BeneficialOwnersParams = z.infer<typeof beneficialOwnersParams>;
export type OwnershipCyclesParams = z.infer<typeof ownershipCyclesParams>;
export type HiddenLinkParams = z.infer<typeof hiddenLinkParams>;
export type WatchlistControlParams = z.infer<typeof watchlistControlParams>;
export type NomineeUnmaskingParams = z.infer<typeof nomineeUnmaskingParams>;
export type SharedRegistrationParams = z.infer<typeof sharedRegistrationParams>;
export type ResolveEntityParams = z.infer<typeof resolveEntityParams>;
export type NeighbourhoodParams = z.infer<typeof neighbourhoodParams>;
