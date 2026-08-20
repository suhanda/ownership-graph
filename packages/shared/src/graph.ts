import { z } from 'zod';

/**
 * Cypher returns `null` for a property a node does not have, and Zod's `.optional()` rejects null.
 * Accept both and normalise to `undefined`, so the client type stays clean and absent keys simply
 * disappear from the JSON.
 */
const nullish = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((value): z.infer<T> | undefined => value ?? undefined);

/**
 * The vocabulary here is the one in CONTEXT.md at the repo root. Node kinds mirror the six
 * labels in the graph model exactly, and double as ECharts categories in the web app.
 */
export const nodeKindSchema = z.enum([
  'Person',
  'Company',
  'Jurisdiction',
  'Address',
  'Intermediary',
  'Watchlist',
]);
export type NodeKind = z.infer<typeof nodeKindSchema>;

/**
 * A node's identity is `coalesce(n.id, n.code)` — Jurisdiction is keyed on `code`, every other
 * label on `id`. The API normalises that difference away so the client only ever sees `id`.
 */
export const graphNodeSchema = z.object({
  id: z.string().min(1),
  kind: nodeKindSchema,
  label: z.string(),
  legalForm: nullish(z.string()),
  jurisdictionCode: nullish(z.string()),
  secrecyScore: nullish(z.number()),
  watchlisted: nullish(z.boolean()),
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const relationshipTypeSchema = z.enum([
  'OWNS',
  'OFFICER_OF',
  'NOMINEE_FOR',
  'REGISTERED_IN',
  'REGISTERED_AT',
  'RESIDES_AT',
  'ADMINISTERED_BY',
  'BASED_AT',
  'CITIZEN_OF',
  'LISTED_ON',
]);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

/** A Stake is the only link carrying a percentage — see CONTEXT.md. */
export const graphLinkSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: relationshipTypeSchema,
  pct: nullish(z.number().min(0).max(1)),
  role: nullish(z.string()),
});
export type GraphLink = z.infer<typeof graphLinkSchema>;

/** What every graph-shaped endpoint returns, and what the ECharts graph series consumes. */
export const graphPayloadSchema = z.object({
  nodes: z.array(graphNodeSchema),
  links: z.array(graphLinkSchema),
});
export type GraphPayload = z.infer<typeof graphPayloadSchema>;

export const healthSchema = z.object({
  api: z.literal('ok'),
  database: z.enum(['reachable', 'unreachable', 'misconfigured']),
  boltProtocol: z.string().optional(),
  serverAgent: z.string().optional(),
  latencyMs: z.number().optional(),
  detail: z.string().optional(),
});
export type Health = z.infer<typeof healthSchema>;
