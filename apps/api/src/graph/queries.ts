/**
 * The signature query library.
 *
 * Every query is fully parameterised. The static fragments below are composed into query text at
 * module load, from constants in this file only — **no value derived from a request ever enters
 * Cypher text**; every user-supplied value travels as a `$parameter`. That is the distinction the
 * assignment's "no string-concatenated Cypher" rule is about.
 *
 * Three constraints from the live instance shape these (see the wayfinder map):
 *
 * 1. Cypher cannot parameterise a variable-length bound or a label. Upper bounds are therefore fixed
 *    in the text at the engine ceiling of 6 and narrowed at runtime with `WHERE length(p) <= $maxDepth`.
 * 2. CognoDB expands variable-length paths with *node* uniqueness, not relationship uniqueness, so
 *    `(c)-[*]->(c)` silently returns zero rows. Cycle detection matches the closing edge separately.
 * 3. A drawable answer returns its rows **and** its subgraph in one round trip. Splitting them costs
 *    ~900ms on the burstable free tier, and running the two in parallel barely helps because a
 *    0.5 vCPU instance serialises them anyway (measured: 2,215ms split, 1,980ms parallel, 1,306ms
 *    combined).
 */

export const MAX_DEPTH_CEILING = 6;

/** Node identity is `coalesce(id, code)`: Jurisdiction is keyed on `code`, everything else on `id`. */
const NODE_ID = 'coalesce(x.id, x.code)';

/** Collapses collected paths into distinct nodes and relationships. */
const COLLECT_SUBGRAPH = `
UNWIND paths AS __p1 UNWIND nodes(__p1) AS __n
WITH paths, collect(DISTINCT __n) AS ns
UNWIND paths AS __p2 UNWIND relationships(__p2) AS __r
WITH ns, collect(DISTINCT __r) AS rs`;

/** Decorates each node with the properties the chart needs, then emits the ECharts-ready shape. */
const PROJECT_SUBGRAPH = `
UNWIND ns AS x
OPTIONAL MATCH (x)-[:REGISTERED_IN]->(jx:Jurisdiction)
OPTIONAL MATCH (x)-[:LISTED_ON]->(w:Watchlist)
WITH rs, collect({ id: ${NODE_ID}, kind: labels(x)[0], label: coalesce(x.name, x.line1),
                   legalForm: x.legalForm, jurisdictionCode: jx.code,
                   secrecyScore: jx.secrecyScore, watchlisted: w IS NOT NULL }) AS nodes
RETURN nodes, [y IN rs | { source: coalesce(startNode(y).id, startNode(y).code),
                           target: coalesce(endNode(y).id, endNode(y).code),
                           type: type(y), pct: y.pct }] AS links`;

/** Same as PROJECT_SUBGRAPH but carries an already-built `rows` list through. */
const PROJECT_WITH_ROWS = PROJECT_SUBGRAPH.replace(
  'WITH rs, collect({',
  'WITH rows, rs, collect({',
).replace('RETURN nodes,', 'RETURN rows, nodes,');

export interface GraphQuery {
  readonly name: string;
  readonly question: string;
  readonly cypher: string;
  /** True when the query returns `nodes` and `links` alongside `rows`. */
  readonly drawable: boolean;
}

export const beneficialOwners: GraphQuery = {
  name: 'beneficialOwners',
  question: 'Who really owns this company?',
  drawable: true,
  cypher: `
MATCH p = (owner)-[:OWNS*1..6]->(target:Company {id: $companyId})
WHERE (owner:Person OR owner:Company) AND length(p) <= $maxDepth
WITH collect(p) AS paths
UNWIND paths AS po
WITH paths, head(nodes(po)) AS o,
     reduce(acc = 1.0, r IN relationships(po) | acc * r.pct) AS pct, length(po) AS hops
WITH paths, o, sum(pct) AS eff, min(hops) AS shortestChain, count(*) AS chains
WHERE eff >= $minPct
WITH paths, collect({ id: o.id, name: o.name, kind: labels(o)[0],
                      effectivePct: round(eff * 10000) / 100,
                      shortestChain: shortestChain, chains: chains }) AS rows
${COLLECT_SUBGRAPH.replace('WITH paths,', 'WITH rows, paths,').replace('WITH ns,', 'WITH rows, ns,')}
${PROJECT_WITH_ROWS}`,
};

export const watchlistControl: GraphQuery = {
  name: 'watchlistControl',
  question: 'What does this sanctioned party control?',
  drawable: true,
  cypher: `
MATCH (w:Watchlist {name: $watchlistName})<-[:LISTED_ON]-(listed)
MATCH p = (listed)-[:OWNS*1..6]->(c:Company)
WHERE length(p) <= $maxDepth
// The cap is applied to the paths, not just the rows: capping rows alone left the subgraph
// collecting every path, which produced 173 nodes for 25 rows and an unreadable chart.
//
// ORDER BY before the cap is not cosmetic. Without it, which paths survive depends on execution
// order, so two runs against byte-identical data returned 19 and 20 companies — enough to make a
// screenshot disagree with a recording. Shortest chains first is also the better answer: a
// two-hop holding is more directly controlled than a six-hop one.
WITH p ORDER BY length(p), last(nodes(p)).id
WITH collect(p)[0..$limit] AS paths
UNWIND paths AS po
WITH paths, head(nodes(po)) AS listed, last(nodes(po)) AS c,
     reduce(acc = 1.0, r IN relationships(po) | acc * r.pct) AS pct, length(po) AS hops
WITH paths, listed, c, sum(pct) AS eff, min(hops) AS depth
WHERE eff >= $minPct
WITH paths, collect({ listedId: listed.id, listedParty: listed.name, companyId: c.id,
                      company: c.name, effectivePct: round(eff * 10000) / 100, depth: depth }) AS rows
${COLLECT_SUBGRAPH.replace('WITH paths,', 'WITH rows, paths,').replace('WITH ns,', 'WITH rows, ns,')}
${PROJECT_WITH_ROWS}`,
};

export const hiddenLink: GraphQuery = {
  name: 'hiddenLink',
  question: 'How are these two connected?',
  drawable: true,
  // REGISTERED_IN and CITIZEN_OF are excluded on purpose: they are Hubs, and shortestPath will
  // happily route through one and return a true but worthless "both are BVI companies".
  cypher: `
MATCH (a {id: $fromId}), (b {id: $toId})
MATCH p = shortestPath((a)-[:OWNS|OFFICER_OF|REGISTERED_AT|ADMINISTERED_BY|NOMINEE_FOR|BASED_AT|RESIDES_AT*..6]-(b))
WHERE length(p) <= $maxDepth
WITH collect(p) AS paths
UNWIND paths AS po
WITH paths, collect({ path: [n IN nodes(po) | coalesce(n.name, n.line1)],
                      kinds: [n IN nodes(po) | labels(n)[0]],
                      ids: [n IN nodes(po) | coalesce(n.id, n.code)],
                      via: [r IN relationships(po) | type(r)],
                      hops: length(po) }) AS rows
${COLLECT_SUBGRAPH.replace('WITH paths,', 'WITH rows, paths,').replace('WITH ns,', 'WITH rows, ns,')}
${PROJECT_WITH_ROWS}`,
};

export const ownershipCycles: GraphQuery = {
  name: 'ownershipCycles',
  question: 'Does this structure own itself?',
  drawable: true,
  cypher: `
MATCH (a:Company)-[closing:OWNS]->(b:Company)
MATCH pth = (b)-[:OWNS*1..6]->(a)
WHERE length(pth) <= $maxDepth
WITH a, closing, pth, [n IN nodes(pth) | n.id] AS ids
WHERE all(q IN ids WHERE a.id <= q)
WITH collect(pth) AS paths, collect({ entry: a.name,
       ring: [n IN nodes(pth) | n.name], ringLength: length(pth) + 1 }) AS rows
${COLLECT_SUBGRAPH.replace('WITH paths,', 'WITH rows, paths,').replace('WITH ns,', 'WITH rows, ns,')}
${PROJECT_WITH_ROWS}`,
};

export const nomineeUnmasking: GraphQuery = {
  name: 'nomineeUnmasking',
  question: 'Who is this nominee really acting for?',
  drawable: true,
  cypher: `
MATCH pth = (nom:Person {id: $personId})-[:NOMINEE_FOR|OFFICER_OF]->()
WITH collect(pth) AS paths
UNWIND paths AS po
WITH paths, head(nodes(po)) AS nom, last(nodes(po)) AS other, type(relationships(po)[0]) AS rel
WITH paths, collect({ nomineeId: nom.id, nominee: nom.name, relation: rel,
                      otherId: other.id, other: other.name }) AS rows
${COLLECT_SUBGRAPH.replace('WITH paths,', 'WITH rows, paths,').replace('WITH ns,', 'WITH rows, ns,')}
${PROJECT_WITH_ROWS}`,
};

export const neighbourhood: GraphQuery = {
  name: 'neighbourhood',
  question: 'What is directly connected to this node?',
  drawable: true,
  cypher: `
MATCH pth = (n {id: $id})-[]-()
WITH collect(pth)[0..$limit] AS paths
UNWIND paths AS po
WITH paths, relationships(po)[0] AS r, last(nodes(po)) AS m
WITH paths, collect({ rel: type(r), outgoing: startNode(r).id = $id,
                      id: coalesce(m.id, m.code), name: coalesce(m.name, m.line1),
                      kind: labels(m)[0], pct: r.pct }) AS rows
${COLLECT_SUBGRAPH.replace('WITH paths,', 'WITH rows, paths,').replace('WITH ns,', 'WITH rows, ns,')}
${PROJECT_WITH_ROWS}`,
};

/** Rows only — ticket 05 decided this reads as a table, not a subgraph. */
export const sharedRegistration: GraphQuery = {
  name: 'sharedRegistration',
  question: 'Who else uses this address or agent?',
  drawable: false,
  cypher: `
MATCH (a:Company {id: $companyId})
OPTIONAL MATCH (a)-[:REGISTERED_AT]->(addr:Address)<-[:REGISTERED_AT]-(byAddress:Company)
  WHERE byAddress <> a
OPTIONAL MATCH (a)-[:ADMINISTERED_BY]->(i:Intermediary)<-[:ADMINISTERED_BY]-(byAgent:Company)
  WHERE byAgent <> a
RETURN addr.line1 AS address, count(DISTINCT byAddress) AS addressShareCount,
       collect(DISTINCT byAddress.name)[0..$limit] AS alsoAtAddress,
       i.name AS agent, count(DISTINCT byAgent) AS agentShareCount,
       collect(DISTINCT byAgent.name)[0..$limit] AS alsoWithAgent`,
};

/** Rows only — this is a lookup, not an answer. */
export const resolveEntity: GraphQuery = {
  name: 'resolveEntity',
  question: 'Which entity does this name mean?',
  drawable: false,
  cypher: `
CALL db.index.fulltext.queryNodes('entity_search', $term) YIELD node, score
RETURN coalesce(node.id, node.code) AS id, node.name AS name, labels(node)[0] AS kind,
       round(score * 100) / 100 AS score
ORDER BY score DESC LIMIT $limit`,
};

export const QUERIES = {
  beneficialOwners,
  ownershipCycles,
  hiddenLink,
  watchlistControl,
  nomineeUnmasking,
  sharedRegistration,
  resolveEntity,
  neighbourhood,
} as const;

export type QueryName = keyof typeof QUERIES;
