import { z } from 'zod';

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
  legalForm: z.string().optional(),
  jurisdictionCode: z.string().optional(),
  secrecyScore: z.number().optional(),
  watchlisted: z.boolean().optional(),
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
  pct: z.number().min(0).max(1).optional(),
  role: z.string().optional(),
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
