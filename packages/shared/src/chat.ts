import { z } from 'zod';
import { graphPayloadSchema } from './graph';

/**
 * The eight tools Claude may call. The model never writes Cypher — it picks a tool and fills typed
 * parameters, and the API runs a hand-written parameterised query. That is how the assignment's
 * "no string-concatenated Cypher" rule is enforced structurally rather than by convention.
 *
 * Names are verbs a person would recognise, so the model can choose correctly from the name and
 * description alone without being shown the graph schema.
 */
export const toolNameSchema = z.enum([
  'find_entity',
  'trace_beneficial_owners',
  'find_hidden_link',
  'find_ownership_cycles',
  'list_watchlist_control',
  'unmask_nominee',
  'find_shared_registration',
  'expand_neighbours',
  'run_cypher',
  'draw_on_canvas',
]);
export type ToolName = z.infer<typeof toolNameSchema>;

/**
 * Server-sent events for one chat turn. The chart repaints the moment a `tool_result` carrying a
 * graph arrives — before the narration has finished streaming — which is what hides the ~1s query.
 */
export const chatEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tool_call'),
    name: toolNameSchema,
    /** Echoed back so the transcript can show what the model actually asked for. */
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('tool_result'),
    name: toolNameSchema,
    /** One line for the transcript, e.g. "4 owners". */
    summary: z.string(),
    /** Present when the result is renderable as a subgraph; the chart repaints on arrival. */
    graph: graphPayloadSchema.optional(),
    /** Tabular rows for the findings panel. */
    rows: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
  z.object({ type: z.literal('text_delta'), text: z.string() }),
  z.object({
    type: z.literal('suggestions'),
    /** Sent when no tool matched, so a dead end becomes navigation. */
    questions: z.array(z.string()),
  }),
  z.object({
    type: z.literal('error'),
    kind: z.enum([
      'database_unreachable',
      'budget_exhausted',
      'rate_limited',
      'no_tool_matched',
      'internal',
    ]),
    message: z.string(),
  }),
  z.object({ type: z.literal('done'), stopReason: z.string().nullable() }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(500),
  /** Prior turns, so "now show me who owns that" resolves. Trimmed server-side. */
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .max(20)
    .default([]),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Advertised when the chat is unavailable, so the UI can degrade to the preset questions. */
export const chatStatusSchema = z.object({
  available: z.boolean(),
  reason: z.enum(['ok', 'budget_exhausted', 'not_configured']),
  presetQuestions: z.array(z.string()),
});
export type ChatStatus = z.infer<typeof chatStatusSchema>;
