# Build the graph read layer and endpoints

Type: task
Status: open

## Question

Implement `GraphService` over the query library, and expose it as HTTP.

Every decision this needs is made. `graph.port.ts` defines the interface, `graph/queries.ts` holds the
eight parameterised queries, `packages/shared` holds the param schemas and the `GraphPayload` shape.

Work:
- Implement each port method: run the query through `CognoDbService.read`, map records to `rows`, and
  project `nodes(p)`/`relationships(p)` into a `GraphPayload` where the answer is drawable.
- Normalise node identity to `coalesce(id, code)` — Jurisdiction is keyed on `code` and everything
  else on `id`. Ticket 05 caught a null id here; do not reintroduce it.
- Validate every request with the shared Zod param schemas at the controller boundary, and every
  response against `graphPayloadSchema` before it leaves.
- REST endpoints, one per signature query, plus `resolveEntity` and `neighbourhood`.
- Convert Neo4j `Integer` values to JS numbers at the mapping layer — never let them reach JSON.

**Done when** every endpoint returns correct data against the seeded graph, empty results come back
as 200 with an empty array, and a dead database produces the 503 shape from ticket 09.
