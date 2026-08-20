import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
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
export function buildTools(graph: GraphService, emit: (event: ChatEvent) => void) {
  const send = (
    name: ToolName,
    summary: string,
    extra: { rows?: Rows; graph?: GraphPayload },
  ): string => {
    emit({ type: 'tool_result', name, summary, ...extra });
    return summary;
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

Resolve names to ids with find_entity before calling any tool that needs one. If a name is ambiguous, \
ask which entity the user meant rather than choosing for them.

When you report a chain of ownership, say how many layers it runs through, what the effective \
percentage is, and which jurisdictions it passes through — that is usually the point.

When a connection runs through something shared, say how many other entities share it. An address used \
by hundreds of companies is weak evidence; a director shared by exactly two is strong.

If a question cannot be answered with your tools, say so plainly in one sentence and name what you can \
answer instead. Do not answer from general knowledge and do not speculate.

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
