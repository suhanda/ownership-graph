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

Locked during charting, before any ticket existed:

- **Use case** — beneficial ownership networks, chosen over music-sample lineage, OSS dependency blast radius and career mobility, for the strongest "SQL would be awkward" argument and the clearest read for a non-technical evaluator.
- **Chat architecture** — tool-calling over curated parameterised queries, not text-to-Cypher.
- **Hosting split** — Next.js on Vercel, NestJS on a long-running container host.
- **Seed strategy** — realistic synthetic with deliberately planted patterns.

## Not yet specified

- **Implementation slices.** Once the model, query set and UI are locked, how the build splits into
  vertical slices (graph read layer → API endpoints → UI → chat) and in what order. Too coarse to slice now.
- **ECharts specifics.** Layout algorithm, node categories and sizing, whether ownership percentage rides
  on the edge label, the node-count ceiling before the force layout gets unusable, and the interaction
  model (click-to-expand vs focus-subgraph). Waits on the UI prototype.
- **How a chat answer meets the chart.** Does a tool result highlight a path in the existing graph, replace
  the graph, or open a side panel? Genuinely undecided and it shapes both components. Waits on the UI prototype.
- **Whether the hero query's ~1s latency needs attacking.** Measured, not guessed: `beneficialOwners`
  is ~1,020 ms warm and ~1,986 ms cold at real volume. Options range from designing for it (progressive
  reveal) through caching the hero subgraph to restructuring the query. Which is right depends on what
  the UI prototype decides the opening interaction is — so it waits on ticket 08 rather than being
  optimised blind.
- **The "Why a graph database?" argument.** The query set is settled, so the shape is now clear — the
  comparison is a recursive CTE with percentage arithmetic, plus cycle detection, plus shortest path.
  What is still unwritten is the actual relational schema to show alongside it and how much SQL to
  include before it stops being persuasive. Graduates when the README is drafted.
- **Submission package.** Screenshots, how the data-model diagram gets rendered, the screen-recording
  script and length, repo visibility and how Wexa gets access — plus whether `.scratch/` (this map and
  its tickets) ships with the repo or is stripped first. Waits on a running hosted app.
- **Whether the app writes.** Everything so far is read-only exploration; a "record a new ownership stake"
  flow might strengthen it or might just burn clock. Undecided.

## Out of scope

- **Authentication and multi-tenancy.** No requirement in the assignment, and it would eat clock that the
  hosted demo and recording need.
- **Real ICIJ Offshore Leaks ingestion.** Ruled out while charting: large, messy, needs attribution
  handling, and it cannot guarantee a clean demo path exists inside 48 hours. Realistic synthetic with
  planted patterns wins on control.
- **Text-to-Cypher generation, and the tools-plus-generation hybrid.** Ruled out while charting in favour of
  tool-calling over curated parameterised queries — deterministic on stage, and it satisfies the
  no-concatenation rule outright.
- **NestJS on serverless.** Ruled out: Bolt is a stateful long-lived TCP connection and serverless would
  thrash the driver's pool.
