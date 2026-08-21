/**
 * Guards for model-generated Cypher.
 *
 * **CognoDB does not enforce read-only sessions.** A session opened with
 * `defaultAccessMode: READ` was measured executing `CREATE`, `DELETE` and `SET` without complaint,
 * so the usual "the driver protects you" assumption is false here and cannot be relied on.
 *
 * The boundary is therefore two checks that this code owns:
 *
 * 1. `guardCypher` — a text pass. Cheap, and it produces a useful message rather than an error.
 * 2. `planWrites` — the real one. The query is `EXPLAIN`ed first and the planner's operator tree is
 *    inspected for write operators. That reflects what the engine will actually do rather than what
 *    the text looks like, so it is not defeated by whitespace, casing or clever string tricks.
 *
 * A query runs only if both pass.
 */

/** Clause keywords that mutate. Matched as whole words so `SETTLEMENT` or `n.created` do not trip. */
const MUTATING = [
  'CREATE',
  'MERGE',
  'DELETE',
  'DETACH',
  'SET',
  'REMOVE',
  'DROP',
  'FOREACH',
  'LOAD CSV',
  'START',
  'GRANT',
  'REVOKE',
  'DENY',
  'ALTER',
  'RENAME',
  'TERMINATE',
];

/** Procedures that are read-only but expensive, administrative, or a data-exfiltration route. */
const BLOCKED_CALLS = ['dbms.', 'db.awaitIndex', 'db.createLabel', 'apoc.', 'gds.'];

export const MAX_GENERATED_ROWS = 50;

export interface GuardResult {
  ok: boolean;
  reason?: string;
  /** The query actually sent, which may carry an appended LIMIT. */
  cypher?: string;
}

/** Strips string literals and comments so keywords inside them cannot trigger a false positive. */
function scrub(cypher: string): string {
  return cypher
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

export function guardCypher(raw: string): GuardResult {
  const cypher = raw.trim().replace(/;\s*$/, '');
  if (!cypher) return { ok: false, reason: 'The query was empty.' };
  if (cypher.length > 2_000) return { ok: false, reason: 'That query is too long to run.' };

  const scrubbed = scrub(cypher);

  // One statement only: a trailing statement is the classic way to smuggle a second query past a
  // check that only inspects the first.
  if (scrubbed.includes(';')) {
    return { ok: false, reason: 'Only one statement can be run at a time.' };
  }

  const upper = scrubbed.toUpperCase();
  for (const keyword of MUTATING) {
    const pattern = new RegExp(`(^|[^A-Z_.])${keyword.replace(' ', '\\s+')}([^A-Z_]|$)`);
    if (pattern.test(upper)) {
      return {
        ok: false,
        reason: `This is a read-only explorer, so \`${keyword}\` is not available. Ask for the data instead and it can be shown.`,
      };
    }
  }

  for (const call of BLOCKED_CALLS) {
    if (scrubbed.toLowerCase().includes(call.toLowerCase())) {
      return { ok: false, reason: `\`${call}\` procedures are not available on this database.` };
    }
  }

  // An unbounded RETURN can pull the whole graph through the API and into a chat message.
  const limited = /\bLIMIT\s+\d+\s*$/i.test(scrubbed)
    ? cypher
    : `${cypher}\nLIMIT ${MAX_GENERATED_ROWS}`;

  return { ok: true, cypher: limited };
}

/**
 * Operator name prefixes that mutate. Write operators in the planner are named after their action,
 * which makes this reliable — and it must be prefix-matched, because read operators like
 * `NodeIndexSeek` contain substrings that a looser match would trip over.
 */
const WRITE_OPERATORS = [
  'Create',
  'Merge',
  'Delete',
  'DetachDelete',
  'Set',
  'Remove',
  'Foreach',
  'Drop',
  'LoadCSV',
  'Constraint',
  'AlterUser',
  'CreateUser',
];

export interface PlanNode {
  operatorType?: string;
  children?: PlanNode[];
}

/** Flattens the planner tree to operator names. */
export function planOperators(plan: PlanNode | null | undefined): string[] {
  if (!plan) return [];
  const out: string[] = [];
  const walk = (node: PlanNode) => {
    if (node.operatorType) out.push(node.operatorType);
    for (const child of node.children ?? []) walk(child);
  };
  walk(plan);
  return out;
}

/**
 * Returns the write operators the planner intends to run. Empty means the query only reads.
 * An empty plan is treated as suspicious rather than safe — if the planner told us nothing, we have
 * no evidence the query is read-only.
 */
export function planWrites(operators: string[]): string[] {
  return operators.filter((op) => WRITE_OPERATORS.some((w) => op.startsWith(w)));
}
