import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import {
  beneficialOwnersParams,
  hiddenLinkParams,
  neighbourhoodParams,
  nomineeUnmaskingParams,
  ownershipCyclesParams,
  resolveEntityParams,
  sharedRegistrationParams,
  watchlistControlParams,
  type ChatEvent,
  type GraphPayload,
  type ToolName,
} from '@ownership/shared';
import type { GraphService, Rows } from '../graph/graph.port';
import { guardCypher, MAX_GENERATED_ROWS } from './cypher-guard';

/**
 * Claude's entire capability surface. Each tool wraps one hand-written parameterised query from
 * `graph/queries.ts`; the model chooses a tool and fills typed arguments, and never sees or writes
 * Cypher. That is how the assignment's "no string-concatenated Cypher" rule is enforced
 * structurally rather than by convention.
 *
 * Descriptions are written for the model — they say *when* to reach for a tool, because the model
 * picks from the name and description alone and is never shown the graph schema.
 *
 * `emit` is the side channel to the SSE stream: the string a tool returns goes to Claude, while the
 * graph payload and rows go straight to the browser so the chart repaints before narration starts.
 */
/** Capped: tool results are replayed on every later turn, so unbounded rows compound. */
const MAX_ROWS_TO_MODEL = 12;

/** Ceiling on a single drawn subgraph. Beyond this the force layout is a hairball, not a diagram. */
const DRAW_NODE_CEILING = 150;

export function buildTools(graph: GraphService, emit: (event: ChatEvent) => void) {
  /**
   * The returned string is the model's *only* view of the result — the graph payload and the full
   * rows go straight to the browser and never reach it. Returning just a count ("1 ring(s)") left
   * the model narrating findings it could not see, so it produced vague answers that named nothing.
   *
   * Rows are capped because they are re-sent on every subsequent turn of the conversation.
   */
  const send = (
    name: ToolName,
    summary: string,
    extra: { rows?: Rows; graph?: GraphPayload },
  ): string => {
    emit({ type: 'tool_result', name, summary, ...extra });
    const rows = extra.rows ?? [];
    if (rows.length === 0)
      return `${summary}. No results — report this as a finding, not an error.`;
    const shown = rows.slice(0, MAX_ROWS_TO_MODEL);
    const omitted = rows.length - shown.length;
    return [
      summary,
      JSON.stringify(shown),
      omitted > 0 ? `(${omitted} further rows omitted; say so if it matters)` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  return [
    betaZodTool({
      name: 'find_entity',
      description:
        'Look up a company, person or corporate service provider by name or partial name. Call this ' +
        'first whenever the user names something in plain language, to turn that name into an id. ' +
        'Returns ranked matches; if several are plausible, ask the user which they meant.',
      inputSchema: resolveEntityParams,
      run: async (args) => {
        const rows = await graph.resolveEntity(args);
        return send('find_entity', `${rows.length} match(es)`, { rows });
      },
    }),

    betaZodTool({
      name: 'trace_beneficial_owners',
      description:
        'Find who ultimately owns a company, following ownership up through holding companies, trusts ' +
        'and foundations and multiplying the stake percentage along each chain. Use for "who really ' +
        'owns X", "who is behind X", "who controls X". Needs a company id from find_entity.',
      inputSchema: beneficialOwnersParams,
      run: async (args) => {
        const r = await graph.beneficialOwners(args);
        return send('trace_beneficial_owners', `${r.rows.length} owner(s)`, r);
      },
    }),

    betaZodTool({
      name: 'find_hidden_link',
      description:
        'Find the shortest connection between two entities that appear unrelated — through shared ' +
        'ownership, officers, registered addresses or corporate agents. Use for "are these two ' +
        'related", "how is X connected to Y". Needs two ids from find_entity.',
      inputSchema: hiddenLinkParams,
      run: async (args) => {
        const r = await graph.hiddenLink(args);
        return send('find_hidden_link', `${r.rows.length} path(s)`, r);
      },
    }),

    betaZodTool({
      name: 'find_ownership_cycles',
      description:
        'Find groups of companies that own each other in a closed loop, so ownership never reaches a ' +
        'natural person. Use for "circular ownership", "does this own itself", "any loops". Takes no ' +
        'entity — it searches the whole graph.',
      inputSchema: ownershipCyclesParams,
      run: async (args) => {
        const r = await graph.ownershipCycles(args);
        return send('find_ownership_cycles', `${r.rows.length} ring(s)`, r);
      },
    }),

    betaZodTool({
      name: 'list_watchlist_control',
      description:
        'List every company controlled at any depth by someone on a sanctions watchlist, with the ' +
        'effective percentage and how many layers away it sits. Use for "who is sanctioned here", ' +
        '"what does a sanctioned person control".',
      inputSchema: watchlistControlParams,
      run: async (args) => {
        const r = await graph.watchlistControl(args);
        return send('list_watchlist_control', `${r.rows.length} company/companies`, r);
      },
    }),

    betaZodTool({
      name: 'unmask_nominee',
      description:
        'Reveal who a nominee is really acting for, and which companies they front as an officer. A ' +
        'nominee holds a stake or a role in their own name on behalf of someone else. Needs a person id.',
      inputSchema: nomineeUnmaskingParams,
      run: async (args) => {
        const r = await graph.nomineeUnmasking(args);
        return send('unmask_nominee', r.rows.length ? 'nominee resolved' : 'not a nominee', r);
      },
    }),

    betaZodTool({
      name: 'find_shared_registration',
      description:
        'List other companies registered at the same address, or administered by the same corporate ' +
        'agent, as a given company. Always report how many entities share it — an address used by ' +
        'hundreds is weak evidence, one shared by two is strong.',
      inputSchema: sharedRegistrationParams,
      run: async (args) => {
        const r = await graph.sharedRegistration(args);
        return send('find_shared_registration', `${r.rows.length} row(s)`, r);
      },
    }),

    betaZodTool({
      name: 'suggest_followups',
      description:
        'Offer the user two or three next questions, as clickable suggestions. Call this once at the ' +
        'end of every answer. Base them on what is currently on the canvas and what you just found — ' +
        'a good suggestion names a specific entity and asks something this graph can actually answer.',
      inputSchema: z.object({
        questions: z
          .array(z.string().min(8).max(90))
          .min(2)
          .max(3)
          .describe('Short questions in the user voice, each naming a real entity.'),
      }),
      run: (args) => {
        emit({ type: 'suggestions', questions: args.questions });
        return 'Suggestions shown to the user. Do not repeat them in your reply.';
      },
    }),

    betaZodTool({
      name: 'draw_on_canvas',
      description:
        'Draw a set of entities on the graph canvas beside this conversation, showing how they ' +
        'connect. Use when the user asks to see, draw, visualise, map or EXPAND something. Pass the ' +
        'ids you already have from an earlier tool result or from the <canvas> block. Set ' +
        'includeNeighbours to grow the picture outward. The canvas replaces whatever is shown, so ' +
        'to add, include the existing ids too.',
      inputSchema: z.object({
        ids: z
          .array(z.string().min(1))
          .min(1)
          .max(200)
          .describe('Entity ids to draw. Every relationship between them is drawn automatically.'),
        title: z.string().min(1).describe('A short caption for what is being shown.'),
        includeNeighbours: z
          .boolean()
          .optional()
          .describe(
            'Also draw everything one step around those ids. Use this for "expand" requests instead ' +
              'of calling expand_neighbours once per node.',
          ),
      }),
      run: async (args) => {
        const result = args.includeNeighbours
          ? await graph.neighbourhoodOf(args.ids, DRAW_NODE_CEILING)
          : await graph.inducedSubgraph(args.ids);
        const drawn = result.graph?.nodes.length ?? 0;
        emit({ type: 'tool_result', name: 'draw_on_canvas', summary: args.title, ...result });
        if (drawn === 0) {
          return 'None of those ids exist. Resolve names with find_entity first, then draw.';
        }
        const missing = args.ids.length - drawn;
        return [
          `Drawn on the canvas: ${drawn} entities, ${result.graph?.links.length ?? 0} connections.`,
          missing > 0 ? `${missing} id(s) were not found and were skipped.` : '',
          'Tell the user what to look at in the diagram rather than listing it again.',
        ]
          .filter(Boolean)
          .join(' ');
      },
    }),

    betaZodTool({
      name: 'run_cypher',
      description:
        'Run a read-only Cypher query against the graph, for questions the other tools do not cover — ' +
        'aggregates, rankings, filters, "how many", "which jurisdiction has the most". Prefer a ' +
        'specific tool when one fits: they are tested and they draw a diagram, this returns a table. ' +
        'Read-only; writes are refused. Always include a LIMIT.',
      inputSchema: z.object({
        cypher: z
          .string()
          .min(1)
          .max(2000)
          .describe('A single read-only Cypher statement, no semicolon.'),
        purpose: z
          .string()
          .min(1)
          .describe('One short line on what this answers, shown to the user.'),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe('Values for $parameters in the query. Prefer these over inlining user input.'),
      }),
      run: async (args) => {
        const guard = guardCypher(args.cypher);
        if (!guard.ok || !guard.cypher) {
          emit({ type: 'tool_result', name: 'run_cypher', summary: 'refused', rows: [] });
          return `Refused: ${guard.reason} Rewrite it as a read-only query, or use a specific tool.`;
        }
        try {
          const rows = await graph.runReadOnly(guard.cypher, args.params ?? {});
          emit({ type: 'tool_result', name: 'run_cypher', summary: args.purpose, rows });
          if (rows.length === 0) return `${args.purpose}: no rows. Report that as a finding.`;
          const shown = rows.slice(0, MAX_ROWS_TO_MODEL);
          return [
            `${args.purpose}: ${rows.length} row(s)${rows.length >= MAX_GENERATED_ROWS ? ' (capped)' : ''}`,
            JSON.stringify(shown),
          ].join('\n');
        } catch (error) {
          const detail = (error as { cause?: Error }).cause?.message ?? 'the query failed';
          emit({ type: 'tool_result', name: 'run_cypher', summary: 'failed', rows: [] });
          return `That query did not run (${detail}). Check it against the schema, or use a specific tool.`;
        }
      },
    }),

    betaZodTool({
      name: 'expand_neighbours',
      description:
        'List everything directly connected to one entity, with relationship types and direction. Use ' +
        'to explore outward from a node when no more specific tool fits.',
      inputSchema: neighbourhoodParams,
      run: async (args) => {
        const r = await graph.neighbourhood(args);
        return send('expand_neighbours', `${r.rows.length} neighbour(s)`, r);
      },
    }),
  ];
}

/**
 * Deliberately short. The model does not need the graph schema — the tool descriptions carry
 * everything it can do, and a schema dump would only tempt it to reason about Cypher it cannot write.
 * Kept byte-stable so it stays at the front of the prompt cache.
 */
export const SYSTEM_PROMPT = `You help people investigate who really owns companies, using a graph of \
corporate ownership: companies, people, shareholdings, officer roles, nominees, registered addresses, \
corporate agents, jurisdictions and sanctions watchlists.

Answer only from tool results. Never guess an ownership percentage, a name or a relationship.

There is a graph canvas beside this conversation, and you can both read it and draw on it.

Each question arrives with a <canvas> block listing what is currently drawn, with each entity's id.
Use it to answer questions about what the user is looking at, and to resolve references like "this
one", "the sanctioned one" or "the company on the right" without asking them to repeat an id.

Most tools draw their own result automatically. When the user asks to see, draw, visualise, map or
expand something — or when a diagram would explain better than prose — call draw_on_canvas. It
replaces the canvas, so to *add* to what is shown, pass the existing ids from the <canvas> block too.

To expand what is on screen, call draw_on_canvas once with those ids and includeNeighbours: true.
Never call expand_neighbours repeatedly to build a picture — one call per node is slow, repaints the
chart each time, and will not give you the union.

Never say you cannot draw, and never suggest an external diagramming tool.

The graph schema, for run_cypher:
  (:Person {id, name, bornYear})
  (:Company {id, name, legalForm, incorporatedOn, status})
  (:Jurisdiction {code, name, secrecyScore})   (:Address {id, line1, city, countryCode})
  (:Intermediary {id, name, type})             (:Watchlist {id, name, authority})
  (owner)-[:OWNS {pct, since}]->(:Company)     (:Person)-[:OFFICER_OF {role, from}]->(:Company)
  (:Person)-[:NOMINEE_FOR {since}]->(party)    (:Company)-[:REGISTERED_IN]->(:Jurisdiction)
  (:Company)-[:REGISTERED_AT]->(:Address)      (:Person)-[:RESIDES_AT]->(:Address)
  (:Company)-[:ADMINISTERED_BY]->(:Intermediary)  (:Intermediary)-[:BASED_AT]->(:Address)
  (:Person)-[:CITIZEN_OF]->(:Jurisdiction)     (party)-[:LISTED_ON {since, program}]->(:Watchlist)

This database is not Neo4j and differs in three ways that matter when writing Cypher:
  - No APOC and no GDS. Plain Cypher only.
  - Variable-length paths use node uniqueness, so (c)-[:OWNS*2..6]->(c) returns nothing at all.
    To find a cycle, match the closing edge separately:
    MATCH (a:Company)-[:OWNS]->(b:Company) MATCH p = (b)-[:OWNS*1..6]->(a)
  - A variable-length bound cannot be a parameter. Write *1..6 literally and filter with
    WHERE length(p) <= $maxDepth.

Resolve names to ids with find_entity before calling any tool that needs one. If a name is ambiguous, \
ask which entity the user meant rather than choosing for them.

When you report a chain of ownership, say how many layers it runs through, what the effective \
percentage is, and which jurisdictions it passes through — that is usually the point.

When a connection runs through something shared, say how many other entities share it. An address used \
by hundreds of companies is weak evidence; a director shared by exactly two is strong.

If a question cannot be answered with your tools, say so plainly in one sentence and name what you can \
answer instead. Do not answer from general knowledge and do not speculate.

End every answer by calling suggest_followups with two or three next questions, drawn from what is on \
the canvas and what you just found. Name specific entities — "Who else uses PO Box 3151, Road Town?" \
is useful, "Tell me more" is not. They are shown as buttons, so do not list them in your reply too.

Be concise — two or three sentences unless asked for more.`;

/** Shown when no tool matched, so a dead end becomes navigation. */
export const PRESET_QUESTIONS = [
  'Who really owns Meridian Civic Infrastructure?',
  'How is Meridian connected to Harbour Line Construction?',
  'Which companies own each other in a loop?',
  'What does Konstantin Belov control?',
  'Who is Clara Voss acting for?',
  'Who else is registered at PO Box 3151, Road Town?',
];
