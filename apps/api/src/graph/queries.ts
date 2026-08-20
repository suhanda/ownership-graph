/**
 * The signature query library. Every query is fully parameterised — Cypher text is never built by
 * concatenation, anywhere in this codebase.
 *
 * Two constraints from the live instance shape these (see .scratch/.../01 and 02):
 *
 * 1. Cypher cannot parameterise a variable-length bound or a label. So the upper bound is fixed in
 *    the text at the engine ceiling of 6 and narrowed at runtime with `WHERE length(p) <= $maxDepth`.
 * 2. CognoDB expands variable-length paths with *node* uniqueness, not relationship uniqueness. A
 *    path may not revisit a node, so `(c)-[*]->(c)` silently returns zero rows. Cycle detection
 *    matches the closing edge separately.
 */

export const MAX_DEPTH_CEILING = 6;

export interface GraphQuery {
  readonly name: string;
  readonly question: string;
  readonly cypher: string;
}

export const beneficialOwners: GraphQuery = {
  name: 'beneficialOwners',
  question: 'Who really owns this company?',
  cypher: `
MATCH p = (owner)-[:OWNS*1..6]->(target:Company {id: $companyId})
WHERE (owner:Person OR owner:Company) AND length(p) <= $maxDepth
WITH owner,
     sum(reduce(acc = 1.0, r IN relationships(p) | acc * r.pct)) AS effectivePct,
     min(length(p)) AS shortestChain,
     count(p) AS chains
WHERE effectivePct >= $minPct
RETURN owner.id AS id, owner.name AS name, labels(owner)[0] AS kind,
       round(effectivePct * 10000) / 100 AS effectivePct, shortestChain, chains
ORDER BY effectivePct DESC`,
};

export const ownershipCycles: GraphQuery = {
  name: 'ownershipCycles',
  question: 'Does this structure own itself?',
  cypher: `
MATCH (a:Company)-[:OWNS]->(b:Company)
MATCH p = (b)-[:OWNS*1..6]->(a)
WHERE length(p) <= $maxDepth
WITH a, [n IN nodes(p) | n.id] AS ids, [n IN nodes(p) | n.name] AS ring, length(p) + 1 AS ringLength
WHERE all(x IN ids WHERE a.id <= x)
RETURN a.name AS entry, ring, ringLength
ORDER BY ringLength, entry`,
};

export const hiddenLink: GraphQuery = {
  name: 'hiddenLink',
  question: 'How are these two connected?',
  // REGISTERED_IN and CITIZEN_OF are excluded on purpose: they are Hubs, and a shortest path is
  // happy to route through one, returning a true but worthless "every BVI company is connected".
  cypher: `
MATCH (a {id: $fromId}), (b {id: $toId})
MATCH p = shortestPath((a)-[:OWNS|OFFICER_OF|REGISTERED_AT|ADMINISTERED_BY|NOMINEE_FOR|BASED_AT|RESIDES_AT*..6]-(b))
WHERE length(p) <= $maxDepth
RETURN [n IN nodes(p) | coalesce(n.name, n.line1)] AS path,
       [n IN nodes(p) | labels(n)[0]] AS kinds,
       [n IN nodes(p) | coalesce(n.id, n.code)] AS ids,
       [r IN relationships(p) | type(r)] AS via,
       length(p) AS hops`,
};

export const watchlistControl: GraphQuery = {
  name: 'watchlistControl',
  question: 'What does this sanctioned party control?',
  cypher: `
MATCH (w:Watchlist {name: $watchlistName})<-[:LISTED_ON]-(listed)
MATCH p = (listed)-[:OWNS*1..6]->(c:Company)
WHERE length(p) <= $maxDepth
WITH listed, c,
     sum(reduce(acc = 1.0, r IN relationships(p) | acc * r.pct)) AS effectivePct,
     min(length(p)) AS depth
WHERE effectivePct >= $minPct
RETURN listed.id AS listedId, listed.name AS listedParty, c.id AS companyId, c.name AS company,
       round(effectivePct * 10000) / 100 AS effectivePct, depth
ORDER BY effectivePct DESC`,
};

export const nomineeUnmasking: GraphQuery = {
  name: 'nomineeUnmasking',
  question: 'Who is this nominee really acting for?',
  cypher: `
MATCH (nom:Person {id: $personId})-[:NOMINEE_FOR]->(principal)
OPTIONAL MATCH (nom)-[o:OFFICER_OF]->(c:Company)
RETURN nom.id AS nomineeId, nom.name AS nominee,
       principal.id AS principalId, principal.name AS actuallyActingFor,
       collect(DISTINCT {companyId: c.id, company: c.name, role: o.role}) AS officerAt`,
};

export const sharedRegistration: GraphQuery = {
  name: 'sharedRegistration',
  question: 'Who else uses this address or agent?',
  cypher: `
MATCH (a:Company {id: $companyId})
OPTIONAL MATCH (a)-[:REGISTERED_AT]->(addr:Address)<-[:REGISTERED_AT]-(byAddress:Company)
  WHERE byAddress <> a
OPTIONAL MATCH (a)-[:ADMINISTERED_BY]->(i:Intermediary)<-[:ADMINISTERED_BY]-(byAgent:Company)
  WHERE byAgent <> a
RETURN addr.line1 AS address, collect(DISTINCT byAddress.name)[0..$limit] AS alsoAtAddress,
       i.name AS agent, collect(DISTINCT byAgent.name)[0..$limit] AS alsoWithAgent`,
};

export const resolveEntity: GraphQuery = {
  name: 'resolveEntity',
  question: 'Which entity does this name mean?',
  cypher: `
CALL db.index.fulltext.queryNodes('entity_search', $term) YIELD node, score
RETURN coalesce(node.id, node.code) AS id, node.name AS name, labels(node)[0] AS kind,
       round(score * 100) / 100 AS score
ORDER BY score DESC LIMIT $limit`,
};

export const neighbourhood: GraphQuery = {
  name: 'neighbourhood',
  question: 'What is directly connected to this node?',
  // identity is coalesce(id, code): Jurisdiction is keyed on `code`, everything else on `id`
  cypher: `
MATCH (n {id: $id})-[r]-(m)
RETURN type(r) AS rel, startNode(r).id = $id AS outgoing,
       coalesce(m.id, m.code) AS id, coalesce(m.name, m.line1) AS name,
       labels(m)[0] AS kind, r.pct AS pct
LIMIT $limit`,
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
