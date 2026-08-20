# Specify the seed generator

Type: task
Status: resolved
Blocked by: 02, 05

## Question

What data does the seed script generate, and how does it guarantee the demo queries find something interesting?

The generator is the difference between a demo that lands and one that returns empty results on stage.
Synthetic structure with realistic vocabularies is already the chosen strategy; this ticket makes it concrete.

Decisions to settle:

- **Scale.** How many companies, people, stakes and officer roles? It must be big enough to look real in
  the chart and small enough to load and query on 256 MB with 1 GB of disk.
- **Planted patterns.** Every signature query from ticket 05 needs a guaranteed hit. Enumerate them
  explicitly: the deep shell chain of known depth, the ownership cycle, the two entities whose only
  connection is a three-hop path through a shared intermediary, the flagged person controlling a known
  number of companies. These are the demo script, decided here.
- **Realism.** Which real jurisdiction list, which registry-style legal-form suffixes, which name sources.
  Percentages that sum plausibly. Dates that respect causality — no company incorporated after a stake in it.
- **Determinism.** A fixed seed so the graph is identical on every run, so the README screenshots and the
  screen recording stay accurate and a reviewer running the script sees exactly what you demoed.
- **Idempotency.** Does the script wipe and rebuild, or merge? What happens when it is run twice.
- **Loading.** Batched parameterised writes via the driver — never string-built Cypher, and never one
  transaction per node against a burstable instance. Which constraints and indexes get created first.

**The answer must record** the target counts, the exact planted patterns with the entity names a demo
can type in, and the load strategy.

## Answer

**Written, run against the live instance, and self-verifying.** Committed as `e4beb97`.
`pnpm seed` builds the API and loads the graph in ~130 seconds.

### Scale — loaded and confirmed

| Label | Count |
|---|---|
| Company | 2,011 |
| Person | 1,202 |
| Address | 347 |
| Jurisdiction | 26 |
| Intermediary | 18 |
| Watchlist | 3 |
| **Total nodes** | **3,607** |
| **Total relationships** | **15,350** |

Comfortably inside the free tier's 256 MB / 1 GB, and dense enough that the chart looks like a real
registry rather than a toy.

### The scandal — what the recording will show

Two companies bid on the **Northgate Transit Extension**. They look unrelated: different onshore
addresses, different directors, ordinary UK `Ltd`s.

```
Konstantin Belov  (OFAC SDN, RUSSIA-EO14024)
  └─100%→ Thornbury Family Foundation (LI)
      └─85%→ Halcyon Capital Partners Ltd (CY)
          ├─90%→ Cobalt Estuary Holdings Ltd (VG) ─100%→ Meridian Civic Infrastructure Ltd  = 76.5%, 4 hops
          └─60%→ Orinoco Asset Management SA (PA)
                  └─70%→ Sable Quay Investments Ltd (VG) ─100%→ Harbour Line Construction Ltd = 35.7%, 5 hops
```

Cobalt and Sable share a registered address (`PO Box 3151, Road Town`), a registered agent
(`Tortola Corporate Services`) **and** a director (`Clara Voss`) — who is herself a `:NOMINEE_FOR`
Belov. Three independent hidden links, none of them through a Hub.

Verified numbers match the design exactly: **76.5% at 4 hops** and **35.7% at 5 hops**. The deeper
chain sits exactly at the default `maxDepth` of 5, which makes the depth control demonstrable.

### How the patterns are guaranteed

- **Determinism.** Seeded `mulberry32`; `Math.random()` is never used. Same graph on every run, so
  screenshots and the recording stay accurate for anyone who re-runs the script.
- **Layered DAG.** Every company gets a tier, and owners only ever come from a strictly higher tier.
  That makes accidental cycles impossible, so the single planted ring is the only one in the graph —
  confirmed at load: `1 ring(s)`.
- **Causality.** Higher tiers are incorporated earlier, and a stake's `since` date is never before
  the later of the two companies' incorporation dates.
- **Realism.** 26 real jurisdictions with indicative secrecy scores, jurisdiction-correct legal forms
  (`B.V.`, `S.a r.l.`, `Pte Ltd`, `PT`, `IBC`), and seven real mass-registration addresses. Offshore
  companies cluster at those addresses; onshore ones do not.
- **Idempotency.** The script **replaces** the database contents — batched `DETACH DELETE`, then
  constraints and the full-text index, then batched `UNWIND` writes of 500 rows. Running it twice
  gives the same graph. This is stated in the script output before it deletes anything.

### The loader verifies itself

Before exiting, the seed runs the **production queries** — not copies — against the planted data:

```
PASS  beneficial owner of bidder A   Konstantin Belov at 76.5% via 4 hops
PASS  beneficial owner of bidder B   Konstantin Belov at 35.7% via 5 hops
PASS  hidden link between bidders    3 path(s), shortest 4 hops via OWNS → REGISTERED_AT → REGISTERED_AT → OWNS
PASS  ownership cycle                1 ring(s)
PASS  watchlist control              120 controlled companies
PASS  nominee unmasking              Clara Voss acts for Konstantin Belov
PASS  full-text entity resolution    5 matches for "Meridian"
```

A non-zero exit if any check fails, because a seed that leaves the demo empty is worse than a seed
that refuses to finish. Note the hidden-link check also asserts that **no** returned path routes
through `REGISTERED_IN` or `CITIZEN_OF` — the Hub guard from ticket 02 is now enforced by the seed,
not just intended.

### Performance at real volume — this changes the UI

Three runs each, warm:

| Query | Rows | Time |
|---|---|---|
| `beneficialOwners` depth 5 | 5 | **~1,020 ms** (1,986 ms cold) |
| `hiddenLink` | 3 | **~1,120 ms** |
| `hiddenLink`, two unrelated companies | 1 | ~930 ms |
| `watchlistControl` | 120 | ~475 ms |
| `ownershipCycles` | 1 | ~480 ms |
| `sharedRegistration` | 1 | ~285 ms |
| `neighbourhood` / `resolveEntity` / `nomineeUnmasking` | — | ~240 ms |

**The hero query takes a full second, and nearly two seconds cold.** On a 0.5 vCPU burstable
instance that is expected, but it means ticket 08 cannot treat loading states as decoration — the
opening interaction of the demo is a one-second wait. Worth designing something deliberate for it
(skeleton subgraph, progressive reveal) rather than a spinner.

`watchlistControl` returning **120 companies** is also a UI input: that is too many nodes to dump
into a force layout at once.

### Two notes for later tickets

1. **A model extension.** The two bidders carry a `bidOn` property naming the contract. There is no
   Contract node — the tender is external context, not a graph insight — but the property lets the UI
   show why these two companies are being compared without narration. Only those two nodes have it.
2. **The mass-registration address is itself becoming a Hub.** `PO Box 3151, Road Town` now hosts
   **81** companies. That is realistic, and it is exactly the Hub concept from `CONTEXT.md` — but it
   means "shared address" is weaker evidence than "shared address, agent *and* director". Ticket 08
   should show how many entities a shared node hosts, so a viewer can judge the strength of a link
   rather than treating all hidden links as equal.

**Status: resolved.**
