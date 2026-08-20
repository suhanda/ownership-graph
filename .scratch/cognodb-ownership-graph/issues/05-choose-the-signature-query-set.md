# Choose the signature query set

Type: grilling
Status: resolved
Blocked by: 02

## Question

Which six-to-eight questions does this application answer?

This ticket is load-bearing in three directions at once: the queries are what the assignment grades,
they become the LLM's tool set, and they define which structures the seed generator must plant. Pick
them before writing either.

Every candidate query gets held against four tests:

- Does a **non-technical person** immediately understand what it asks and why it matters?
- Is it genuinely **multi-hop** — and is at least one of them 3+ hops, not just 2?
- Would a **relational schema** find it awkward? At least one must be honestly awkward: recursive
  traversal of unbounded depth, cycle detection, or shortest path between two entities.
- Does its **result render well** in a node-link chart, or is it a number in a box?

Strong candidates from the domain, to be argued over rather than accepted:

- Trace the ultimate beneficial owner of a company through N layers of holding structures, multiplying
  the ownership percentage along each path and summing across paths.
- Detect circular ownership — company A owns B owns C owns A.
- Find the hidden link between two entities that appear unrelated: shortest path through any
  relationship type.
- Given a sanctioned or flagged person, find every company they control at any depth.
- Find companies sharing an officer, address or intermediary with a flagged entity.
- Rank the most systemically connected intermediaries by how many distinct ownership chains route through them.

Also settle: what each query takes as parameters (these become the tool schemas), what it returns
(nodes and edges for the chart, or a table, or both), and what the sensible depth limit is on a
0.5 vCPU instance.

**The answer must record** the final list with, for each: the plain-English question, the parameters,
the return shape, and which of the four tests it earns its place on.

## Answer

**Six signature queries plus two supporting primitives.** All eight were executed against the live
instance on a fixture built so the Hub problem is real — twelve companies, every one registered in the
BVI — rather than a fixture that flatters the queries.

The library lives at `<scratchpad>/probe/queries.mjs` as named exports carrying `question`, `params`
and `cypher`. It ports into `apps/api` verbatim once ticket 04 lands, and it is the direct source of
the chat tool set in ticket 07 and the planted patterns in ticket 06.

### The set

| #   | Query                | Question a person asks                     | Tests it earns its place on                                                                                         |
| --- | -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `beneficialOwners`   | **Who really owns this company?** _(hero)_ | legible · 5 hops · recursive + arithmetic rollup · renders as a chain                                               |
| 2   | `ownershipCycles`    | Does this structure own itself?            | legible · multi-hop · **hardest in SQL** · renders as a literal loop                                                |
| 3   | `hiddenLink`         | How are these two connected?               | **most legible** · multi-hop · shortest-path is miserable in SQL · best visual                                      |
| 4   | `watchlistControl`   | What does this sanctioned party control?   | legible · 5 hops · recursive + rollup · fans out well                                                               |
| 5   | `nomineeUnmasking`   | Who is this nominee really acting for?     | legible · multi-hop · justifies the word "beneficial"                                                               |
| 6   | `sharedRegistration` | Who else uses this address or agent?       | legible · 2 hops · _weak_ on SQL-awkwardness — earns its place as the click-through that makes the graph explorable |
| —   | `resolveEntity`      | Which entity does this name mean?          | supporting: full-text lookup, the chat's first call                                                                 |
| —   | `neighbourhood`      | What is directly connected here?           | supporting: chart expand-on-click                                                                                   |

Hero is `beneficialOwners`. The app opens on it and the recording leads with it.

### Verified results

| Query                     | Result                                                                             | Time  |
| ------------------------- | ---------------------------------------------------------------------------------- | ----- |
| `beneficialOwners(C5)`    | 5 owners up the chain: 50% → 30% → 21% → 16.8% → Viktor Anand at 15.12% via 5 hops | 240ms |
| `ownershipCycles`         | The 5-company ring, **once**                                                       | 297ms |
| `hiddenLink(C11, C12)`    | Shared address **and** shared agent, 2 hops each. **Zero jurisdiction paths.**     | 237ms |
| `watchlistControl`        | 5 companies, 90% → 15.12%, with depth                                              | 237ms |
| `nomineeUnmasking(P3)`    | Clara Voss acts for Viktor Anand, fronts Bidder Beta                               | 241ms |
| `sharedRegistration(C11)` | Address and agent co-registrants                                                   | 306ms |
| `resolveEntity("Bidder")` | Both bidders, scored 1.87                                                          | 318ms |
| `neighbourhood(C11)`      | 4 typed neighbours with direction and pct                                          | 256ms |

Note the ~240ms floor on a fifteen-node graph — that is round-trip latency to a burstable free-tier
instance, not query cost. Every UI interaction pays it, so the loading states in ticket 08 are not
optional decoration, and ticket 06 should re-measure once the graph is realistically sized.

### The hub allowlist is proven, not assumed

Ticket 02 predicted that an unconstrained `shortestPath` would route through Hubs. On this fixture all
twelve companies share the BVI, so an unconstrained query would have returned jurisdiction paths as
"findings". With the allowlist:

```cypher
MATCH p = shortestPath((a)-[:OWNS|OFFICER_OF|REGISTERED_AT|ADMINISTERED_BY|NOMINEE_FOR|BASED_AT|RESIDES_AT*..6]-(b))
```

it returned exactly the two meaningful links and nothing else. `REGISTERED_IN` and `CITIZEN_OF` are
excluded from link-finding and retained for filtering.

### Cypher cannot be parameterised everywhere — and that is the no-concatenation trap

Measured on the live instance:

| Construct                                | Parameterisable?      |
| ---------------------------------------- | --------------------- |
| `-[:OWNS*1..$maxDepth]->`                | **No** — syntax error |
| `MATCH (n:$label)`                       | **No** — syntax error |
| `LIMIT $n` / `SKIP $n` / `[0..$n]`       | Yes                   |
| `n[$key]` dynamic property               | Yes                   |
| `all(x IN rels WHERE type(x) IN $types)` | Yes                   |

A variable depth control in the UI is the obvious way to end up building Cypher with string
concatenation — which the assignment explicitly forbids. The resolution used throughout: **fix the
upper bound in the query text at the engine ceiling of 6, then narrow at runtime with a parameter.**

```cypher
MATCH p = (owner)-[:OWNS*1..6]->(target:Company {id: $companyId})
WHERE length(p) <= $maxDepth
```

Every query in the library follows this. It is worth a README paragraph and it is very likely an
interview question.

### Two defects the validation caught

1. **Cycles were reported once per rotation.** A five-company ring came back five times, once per
   entry point — identical data, and it would have looked like five findings in the UI. Fixed by
   keeping only the rotation whose entry node holds the lowest id:
   `WHERE all(x IN ids WHERE a.id <= x)`. Now one ring, one row.
2. **`neighbourhood` returned a null id for jurisdictions**, because `Jurisdiction` is keyed on `code`
   while everything else uses `id`. Any click-to-expand on a jurisdiction node would have failed.
   Fixed with `coalesce(m.id, m.code)`. Ticket 08 should treat a node's identity as that coalesce,
   not as `id`.

### Depth

Ceiling fixed at **6** in query text; runtime default **5**, exposed as `$maxDepth`. `minPct` defaults
to 0.01 so trivial slivers do not clutter the hero result. Both are parameters, both are tunable from
the UI without touching Cypher.

**Status: resolved.** Unblocks the seed generator, the chat tool set and the UI prototype.
