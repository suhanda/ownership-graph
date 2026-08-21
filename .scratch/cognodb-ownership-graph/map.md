# Map: CognoDB Beneficial Ownership Graph Explorer

Label: wayfinder:map

## Destination

A submitted Wexa AI take-home: a GitHub repo containing a NestJS + Next.js beneficial-ownership
graph explorer running live against a CognoDB instance — seed script, parameterised Cypher library,
LLM chat, ECharts graph view, README (why-graph + data-model diagram + screenshots), hosted demo URL
and a screen recording — ready to email to hr@wexa.ai.

Done means: the link works, the recording exists, and every part of the code is defensible line by line
in the follow-up interview.

## Notes

**This map carries execution.** Wayfinder's "plan, don't do" default is overridden for this effort —
the 48-hour clock and the mandatory hosted demo mean build tickets live on the map alongside decision
tickets. Decisions still come first; implementation graduates out of the fog once the model, query set
and UI are locked.

**Domain.** Corporate beneficial ownership: companies, natural persons, ownership stakes, officer roles,
jurisdictions, addresses. The interesting questions are transitive — who _ultimately_ owns this, through
how many layers, and what hidden link connects two entities that look unrelated.

**Stack (locked by the user).**

- API: NestJS, `neo4j-driver` over `bolt+s://`, long-running process so the connection pool survives.
- Web: Next.js App Router, TypeScript strict, ECharts `graph` series for the node-link view.
- Chat: Anthropic Claude, tool-calling over a curated set of parameterised Cypher queries.
- Monorepo, shared Zod schemas at the API boundary.

**Assignment constraints — non-negotiable, check every ticket against these.**

- Parameterised queries via the official driver. **No string-concatenated Cypher, anywhere.**
- Connection URI and password from environment variables, never committed.
- Graceful, visible error handling when the database is unreachable.
- At least one multi-hop (2+) traversal and at least one query a relational DB would find awkward.
- Free `c0` instance: burstable 0.5 vCPU, 256 MB RAM, 1 GB disk, 200 connections. Size the dataset to that.
- Design effort is explicitly part of the evaluation.
- README must contain a "Why a graph database?" section and a data-model diagram.

**CognoDB is not Neo4j — never assume Neo4j behaviour.** It reports `Neo4j/5.26.0` and speaks Bolt 5.4
so the official driver works, but the Cypher surface is a reimplementation. Measured in
[Provision CognoDB and prove a Bolt round-trip](issues/01-provision-cognodb-and-prove-bolt.md):

- No APOC, no GDS. Plain Cypher only.
- No `SHOW PROCEDURES`, `SHOW DATABASES`, `db.info()`, `dbms.components()`. **The supported surface
  cannot be enumerated**, so every query must be run against the live instance as it is written.
  Do not trust Neo4j documentation as evidence that something works here.
- No quantified path patterns (`->{1,5}`). Use `-[:REL*1..5]->`.
- **Variable-length paths use node uniqueness, not relationship uniqueness.** A path may not revisit a
  node. Cycle queries written as `(c)-[*]->(c)` return zero rows rather than erroring — the failure is
  silent and reads as missing data. Split the closing edge out of the variable-length segment instead.

**The glossary is `CONTEXT.md` at the repo root.** Use its terms exactly — _Stake_, _Ownership chain_,
_Effective ownership_, _Beneficial owner_ vs _Registered owner_, _Nominee_, _Hidden link_, _Hub_ — in code,
UI copy, chat tool names and the README, so one vocabulary runs through the whole submission.

**Skills every session should consult.**

- `/grilling` and `/domain-modeling` — the default for any decision ticket.
- `/prototype` — for the UI ticket.
- `/claude-api` — **mandatory** before writing any Claude integration code; do not work from memory.
- `/frontend-design` or `/impeccable` — for the UI pass, since design is graded.
- `/research` — for third-party facts (CognoDB behaviour, hosting tiers).

**Component layer is shadcn/ui** (`apps/web/src/components/ui`), on the user's instruction. Add
components with `pnpm dlx shadcn@4.18.0 add <name>` rather than hand-rolling. Design tokens live in
`apps/web/src/app/globals.css`; node-category colours are `--chart-1..5` and are **validated** — do not
substitute colours without re-running the dataviz validator. Note `--accent` is a hover surface, not the
brand hue; `--primary` is the brand hue.

**Model capabilities are not uniform.** Adaptive thinking and `output_config.effort` are 4.6-and-later
features and are *rejected* by Haiku 4.5 / Sonnet 4.5 — sending them is a 400 on every request, not a
degradation. `modelFeatures()` in `chat.service.ts` gates them; extend it before changing `ANTHROPIC_MODEL`.

**CognoDB does not enforce read-only sessions.** A `defaultAccessMode: READ` session was measured
executing `CREATE`, `DELETE` and `SET`. Never treat the access mode as a boundary on this database;
model-generated Cypher is gated by `EXPLAIN` plan inspection in `graph.service.ts`.

**The chat may only reach `apps/api/src/graph/graph.port.ts`.** That interface is the whole surface —
it is what makes "the model never writes Cypher" structural rather than conventional. Do not give the
chat layer the driver or a raw-query escape hatch.

**Standing preferences.** Global `CLAUDE.md` applies: TypeScript strict with no `any`, Zod validation at
every I/O edge, RSC-first, `'use client'` pushed to the leaves, named exports except for pages/layouts,
semantic commits.

## Decisions so far

<!-- one line per resolved ticket -->

- [Provision CognoDB and prove a Bolt round-trip](issues/01-provision-cognodb-and-prove-bolt.md) — live instance confirmed at Bolt 5.4 on `neo4j-driver@5.28.3`; parameterised round-trip, full-text indexes, `shortestPath` and `reduce()` over variable-length paths all work. But **CognoDB is not Neo4j**: no APOC, no GDS, no introspection procedures, and variable-length paths use node uniqueness, so the obvious cycle-detection phrasings silently return zero rows.
- [Design the ownership graph model](issues/02-design-the-ownership-graph-model.md) — six labels (Person, Company, Jurisdiction, Address, Intermediary, Watchlist) and ten relationship types; percentage rides on `:OWNS`, legal form is a property, one `:OFFICER_OF` carries a role. Glossary in `CONTEXT.md`, Mermaid diagram in the ticket. All eight signature patterns verified live — **and hub nodes were found to poison the hidden-link query**, so link-finding must constrain relationship types.
- [Choose the signature query set](issues/05-choose-the-signature-query-set.md) — six queries (beneficial owners _(hero)_, ownership cycles, hidden link, watchlist control, nominee unmasking, shared registration) plus `resolveEntity` and `neighbourhood` primitives, all verified live. The hub allowlist is proven. **Variable-length bounds and labels cannot be parameterised**, so bounds are fixed at 6 in text and narrowed via `WHERE length(p) <= $maxDepth` — this is how the no-concatenation rule is honoured.
- [Scaffold the monorepo and toolchain](issues/04-scaffold-the-monorepo-and-toolchain.md) — pnpm workspace with `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared` (Zod). Vertical slice verified live: RSC → NestJS → CognoDB reports Bolt 5.4. TypeScript pinned to **5.9.3** (TS 7 breaks NestJS decorators), shared package ships CommonJS, API on **port 3101**. GitHub repo deliberately not created — outward-facing, needs the user's call.
- [Specify the seed generator](issues/06-specify-the-seed-generator.md) — 3,607 nodes / 15,350 relationships from a fixed seed, layered DAG so the only cycle is the planted one. The scandal: two Northgate Transit Extension bidders tracing to sanctioned **Konstantin Belov** at 76.5% (4 hops) and 35.7% (5 hops), their parents sharing an address, agent and director. Loader self-verifies with the production queries. **The hero query takes ~1s warm, ~2s cold.**
- [Prototype the explorer UI](issues/08-prototype-the-explorer-ui.md) — three-column shell (questions · graph · chat); **position encodes ownership depth**, not a force layout; the ~1s hero latency is narrated layer-by-layer rather than spinner-ed; hub size shown so link strength is judgeable. Palette validated across all pairs in both themes. Component layer is **shadcn/ui**, verified on Next 16 / React 19 / Tailwind 4. [Prototype](https://claude.ai/code/artifact/124093de-9c50-4a1c-a5ba-a33cc03c7ccc)
- [Design the chat tool set and Claude contract](issues/07-design-the-chat-tool-set-and-claude-contract.md) — eight tools over the signature queries, written as code in `packages/shared/src/chat.ts` and `apps/api/src/chat/tools.ts`. **`claude-haiku-4-5`** (cheapest; amended from Opus 5 on the user's call), streaming via the SDK **Tool Runner** (`betaZodTool` + `toolRunner`). The chart repaints on `tool_result`, before narration. Public-demo ceiling: per-IP limit, 6 tool turns, daily budget with graceful degradation to preset questions.
- [Research hosting for a persistent Bolt client](issues/03-research-hosting-for-a-persistent-bolt-client.md) — **superseded: API on Render free, web on Vercel, $0** (user's call). The research stands: Render Free spins down after 15 min with a ~60 s wake, so a keep-warm ping is load-bearing; 750 instance-hours are per *workspace* and cover exactly one always-on service. Fly remains the fallback if the free tier bites. Write-up in [`docs/hosting.md`](../../docs/hosting.md).
- [Define database-unreachable behaviour](issues/09-define-database-unreachable-behaviour.md) — three honest states (`database_unreachable` 503, `database_misconfigured` 500, `query_failed` 500); "no results" is a 200, not an error. API **starts degraded, never crash-loops** — verified staying up against a dead host. `session.run` not `executeRead`, because `retriable: true` would hide a dead database behind a retry window. UI gets a retry button plus a backing-off poll.
- [Build the graph read layer and endpoints](issues/10-build-the-graph-read-layer-and-endpoints.md) — eight endpoints live against the seeded graph; hero returns Belov at 76.5%, 4 hops. **Each drawable query returns rows and subgraph in one round trip** (1,306 ms combined vs 2,215 ms split; parallelism doesn't help because 0.5 vCPU serialises). Caught: Zod `.optional()` rejects Cypher's `null`, which 500'd five endpoints.
- [Build the explorer UI](issues/11-build-the-explorer-ui.md) — three-column shell live against real data; first paint is server-rendered and already shows Belov at 76.5%. Positions computed from ownership depth (four layouts, no force). Loading narrates the traversal, error state retries with backoff, theme toggle re-reads chart tokens. ECharts dynamically imported — 302 KB gz deferred, initial payload 319 KB gz.
- [Build the chat endpoint](issues/12-build-the-chat-endpoint.md) — `POST /chat` SSE over the SDK Tool Runner; `max_iterations` is the tool-turn guard, so no hand-rolled loop. Rate limit and daily budget verified directly. **The live model path is untested — no API key on this machine.**
- [Write the README](issues/14-write-the-readme.md) — use case, why-a-graph with the recursive CTE it replaces, model diagram, query table, setup, deployment. Every path, command and count verified against reality. **Exposed two bugs**: a fresh clone could not run `pnpm seed` at all, and the seed's self-verification had been silently broken by the ticket-10 query rewrite.

Locked during charting, before any ticket existed:

- **Use case** — beneficial ownership networks, chosen over music-sample lineage, OSS dependency blast radius and career mobility, for the strongest "SQL would be awkward" argument and the clearest read for a non-technical evaluator.
- **Chat architecture** — tool-calling over curated parameterised queries, not text-to-Cypher.
- **Hosting split** — Next.js on Vercel, NestJS on a long-running container host.
- **Seed strategy** — realistic synthetic with deliberately planted patterns.

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

- **Sustained roaming.** Click-to-expand is built and every answer is capped (neighbours at 40,
  watchlist at 22), so nothing arrives too big to draw. Untested: what the layered layout looks like
  after a user expands repeatedly into a dense part of the 3,607-node graph. Worth checking during the
  recording rehearsal rather than pre-solving.
- **Whether the app writes.** Everything so far is read-only exploration. A "record a new ownership
  stake" flow might strengthen the submission or might just burn clock. Still undecided, and it stays
  out of the implementation tickets until it isn't.
- **How much SQL the "Why a graph database?" section should show** before it stops being persuasive.
  Carried inside the README ticket.

## Out of scope

- **Authentication and multi-tenancy.** No requirement in the assignment, and it would eat clock that the
  hosted demo and recording need.
- **Real ICIJ Offshore Leaks ingestion.** Ruled out while charting: large, messy, needs attribution
  handling, and it cannot guarantee a clean demo path exists inside 48 hours. Realistic synthetic with
  planted patterns wins on control.
- ~~**Text-to-Cypher generation.**~~ **Brought back into scope** on the user's instruction: the chat now
  has a ninth `run_cypher` tool for questions a fixed set cannot anticipate. The eight curated tools
  remain the preferred path. Guarded by a text pass *and* an `EXPLAIN` plan inspection — necessary
  because **CognoDB does not enforce read-only sessions**, which was measured, not assumed.
- **NestJS on serverless.** Ruled out: Bolt is a stateful long-lived TCP connection and serverless would
  thrash the driver's pool.
