# Build the graph read layer and endpoints

Type: task
Status: resolved

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

## Answer

**Eight endpoints, all returning correct data against the seeded graph.** Committed as `555b6e1`.

| Endpoint | Warm | rows / nodes / links |
|---|---|---|
| `GET /graph/companies/:id/owners` | 1,253 ms | 4 / 5 / 4 |
| `GET /graph/links?fromId=&toId=` | 1,358 ms | 3 / 7 / 8 |
| `GET /graph/watchlist` | 497 ms | 20 / 22 / 20 |
| `GET /graph/cycles` | 477 ms | 1 / 4 / 3 |
| `GET /graph/companies/:id/shared-registration` | 479 ms | 1 / — |
| `GET /graph/nodes/:id/neighbours` | 252 ms | 6 / 7 / 6 |
| `GET /graph/people/:id/nominee` | 237 ms | 4 / 5 / 4 |
| `GET /graph/entities?term=` | 253 ms | 3 / — |

The hero answer is correct end to end: Cobalt 100% (1 hop) → Halcyon 90% (2) → Thornbury 76.5% (3) →
**Konstantin Belov 76.5% at 4 hops**, with a 5-node / 4-link subgraph attached.

### The change that mattered: one round trip, not two

The queries originally returned rows only, so a drawable answer needed a second query for its
subgraph. Measured against the live instance:

| Approach | Hero query |
|---|---|
| Two queries, sequential | 2,215 ms |
| Two queries, `Promise.all` | 1,980 ms |
| **One combined query** | **1,306 ms** |

Parallelism barely helped, which is itself the finding: **a 0.5 vCPU burstable instance serialises
concurrent queries anyway**, so concurrency is not a lever here. The query library was rewritten so
each drawable query returns `rows`, `nodes` and `links` together. That keeps the hero at ~1.3 s —
slightly above ticket 06's rows-only 1,020 ms, but it now returns everything the chart needs, versus
2,215 ms for doing both.

Static Cypher fragments are composed from module constants to avoid duplicating the projection six
times. **No value derived from a request ever enters query text** — every user-supplied value travels
as a `$parameter`. That distinction is written into the file header, because a reviewer skimming for
string concatenation will see composition and should immediately see why it is not the same thing.

### Three defects caught by running it

1. **Five of eight endpoints 500'd on `null`.** Cypher returns `null` for a property a node does not
   have, and Zod's `.optional()` rejects `null` — it accepts *absent*, not *null*. `cycles` passed only
   because every node in a cycle happened to have every field populated, which is exactly the kind of
   coincidence that makes a bug survive a quick smoke test. The shared schemas now use a `nullish`
   helper that accepts both and normalises to `undefined`, so absent keys simply vanish from the JSON.
2. **`watchlistControl` drew 173 nodes for 25 rows.** The `[0..$limit]` capped the rows while the
   subgraph still collected every path. The cap now applies to the collected *paths*, so rows and the
   drawn graph always agree — and it got faster too, 1,317 ms → 497 ms.
3. **A clever `coerce()` helper built `.extend()` shapes dynamically** in the controller. Replaced by
   putting `z.coerce.number()` in the shared schemas, so one schema serves HTTP query strings *and*
   the Claude tool definitions, and the controller reads plainly.

`toPlain()` converts driver `Integer` and temporal values before anything reaches `res.json()` —
otherwise a `{low, high}` pair serialises into nonsense.

### The error contract holds end to end

Verified through a real graph endpoint against a hostname that does not resolve:

```
GET /graph/companies/C-SCN-01/owners   → 503 in 0.53s
Retry-After: 5
{ "kind": "database_unreachable", "message": "The database is unreachable. The instance may be
  paused, or the connection details may be wrong — the driver reports these identically…" }
stack trace in body: false      database errors logged server-side: 1
```

And the other two shapes: `maxDepth=99` → **400** `invalid_request` with the field named; an unknown
company id → **200** with an empty array, because no owners is a finding, not an error.

**Status: resolved.** Unblocks the UI and the chat endpoint, which can now run in parallel.
