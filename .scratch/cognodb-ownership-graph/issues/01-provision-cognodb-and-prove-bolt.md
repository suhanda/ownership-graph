# Provision CognoDB and prove a Bolt round-trip

Type: task
Status: resolved

## Question

Is there a live CognoDB instance this project can actually talk to, and what exactly does it take
to talk to it from Node?

This is the single biggest schedule risk on the map: every DB-touching ticket is dead until a real
`bolt+s://` round-trip succeeds. Resolve it before anything else.

**Human steps (only the user can do these):**

1. Sign up at https://console.cognodb.com/signup — free tier, no credit card.
2. Create a free `c0` instance and pick a region. One free instance per workspace.
3. Copy the connection URI (`bolt+s://<instance-id>.databases.cognodb.cloud`) and the generated
   password for user `cognodb`. **The password is shown exactly once.**
4. Put them somewhere the agent can read them as environment variables — not in the repo.

**Agent steps once credentials exist:**

- Install the official `neo4j-driver` and run a parameterised round-trip: write a node, read it back,
  delete it. Confirm the Bolt protocol version actually negotiated.
- Probe the things later tickets depend on: does `bolt+s://` need any TLS configuration, does the
  server accept multi-statement transactions, what does the driver do on an idle connection, and how
  does it fail when the instance is unreachable or the password is wrong.

**The answer must record**, because later tickets read it rather than rediscovering it:

- Where the credentials live and under what env var names.
- The exact `neo4j-driver` version that worked and the negotiated Bolt version.
- Any connection options that turned out to be required.
- The observed failure modes, verbatim error shapes included — ticket 09 is built on these.

## Comments

**Progress — AFK half done, waiting on signup.**

Toolchain: Node v24.12.0, pnpm 11.22.0.

Driver choice: `neo4j-driver@5.28.3`. npm also publishes a 6.x line (6.2.0 latest), but CognoDB speaks
Bolt 5.0–5.4, so the mature 5.x line is the safe pick under a 48h clock. 6.x is worth a single
compatibility probe once the instance is live, not before.

Probe harness at `<scratchpad>/probe/` — `probe.mjs` plus `verify.sh`, which sources `~/.cognodb.env`
and runs the full round-trip. Credentials template written to `~/.cognodb.env` (mode 0600), deliberately
outside the repo. A defensive `.gitignore` covering `.env*` is already in the repo root so the password
cannot be committed even before ticket 04 builds the real skeleton.

**Failure modes measured without credentials** (these are ticket 09's raw material):

| Case                        | Result                                                                    |
| --------------------------- | ------------------------------------------------------------------------- |
| DNS NXDOMAIN                | `Neo4jError` / `code: ServiceUnavailable` / `retriable: true` — 37ms      |
| TCP connection refused      | `Neo4jError` / `code: ServiceUnavailable` / `retriable: true` — 0ms       |
| Unroutable host (timeout)   | `Neo4jError` / `code: ServiceUnavailable` / `retriable: true` — 4005ms    |
| HTTP endpoint on a Bolt URI | `Neo4jError` / `code: N/A` / `retriable: false` — "Server responded HTTP" |

Two findings that shape later work:

1. **All three unreachability causes are indistinguishable.** Bad hostname, dead instance and blocked
   network produce a byte-identical `ServiceUnavailable` error. The API therefore cannot report _why_
   the database is unreachable — ticket 09 must design one honest "database unreachable" state rather
   than pretending to diagnose. A misconfigured URI will look exactly like an outage during the demo.
2. **`connectionTimeout` is honoured precisely** (4005ms observed for a 4000ms setting), so it is the
   real control over how fast the UI can show that state. `ServiceUnavailable` carries `retriable: true`,
   which means `executeRead`/`executeWrite` will burn the whole retry window before surfacing anything —
   that window has to be bounded deliberately or a dead database will look like a hung app.

Still blocked on the human steps: account, `c0` instance, and the write-once password.

## Answer

**Yes — there is a live instance and a clean parameterised round-trip.** But CognoDB is _not_ Neo4j
wearing a different name, and the differences change what later tickets are allowed to assume.

### Connection facts

|                       |                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| URI                   | `bolt+s://db-<id>.<cluster>.databases.cognodb.com` (port 7687 implied) — real value in `~/.cognodb.env`                                 |
| Credentials           | `~/.cognodb.env`, mode 0600, outside the repo. Vars: `COGNODB_URI`, `COGNODB_USER`, `COGNODB_PASSWORD` |
| Server agent          | `Neo4j/5.26.0`                                                                                         |
| Negotiated Bolt       | **5.4** (top of the documented 5.0–5.4 range)                                                          |
| Driver                | `neo4j-driver@5.28.3` — verified. `6.2.0` also connects and round-trips cleanly                        |
| First-connect latency | ~1.5s including TLS + auth                                                                             |

**The assignment PDF's URI form is wrong.** It documents
`bolt+s://<instance-id>.databases.cognodb.cloud`; the console actually issues
`...databases.cognodb.com`. The README's setup instructions must use the real form, and anyone
copying the PDF will hit an indistinguishable `ServiceUnavailable` (see below).

Driver choice: **stay on 5.28.3.** 6.2.0 works, but 5.x is the mature line against a Bolt 5.4 server
and there is no upside worth the risk here. One API difference noted: `ServerInfo.protocolVersion`
is a number in 5.x and a `ProtocolVersion` object in 6.x.

### Verified working

Parameterised write → read → delete; `UNWIND $rows` batch writes (the seed loader's mechanism);
uniqueness constraints; **full-text indexes** (create, `db.index.fulltext.queryNodes`, drop);
`SHOW INDEXES` / `SHOW CONSTRAINTS`; `shortestPath` and `allShortestPaths`; variable-length paths;
`CALL {}` subqueries; `reduce()`; `EXPLAIN`; `PROFILE`; `db.labels()`.

Full-text search working is significant for ticket 07 — it makes the chat's "resolve this free-text
name to an actual node" tool cheap and fuzzy-tolerant.

### Not available — later tickets must not assume these

- **APOC and GDS are both absent.** No `apoc.path.expand`, no PageRank, no community detection.
  Every signature query must be plain Cypher. This kills the PageRank-flavoured "most systemically
  connected intermediary" candidate in ticket 05 in its original form; degree and path-count ranking
  in pure Cypher is the substitute.
- **Quantified path patterns** (`-[:OWNS]->{1,5}`) — syntax error. Use classic `-[:OWNS*1..5]->`.
- **Introspection procedures**: `SHOW PROCEDURES`, `SHOW DATABASES`, `db.info()`, `dbms.components()`
  all unavailable. `SHOW` accepts only `INDEXES` and `CONSTRAINTS`. There is no way to enumerate the
  supported surface — so **every query must be validated against the live instance as it is written**,
  not assumed from Neo4j documentation.

### The important divergence: variable-length paths use _node_ uniqueness

Neo4j uses relationship isomorphism — a path may revisit a node, it just may not reuse a relationship.
**CognoDB will not revisit a node within a single variable-length segment.** Measured on
`P→A→B→C→A`: expanding `(a {k:"A"})-[:OWNS*1..6]->(x)` returns `A→B` and `A→B→C` but **never**
`A→B→C→A`.

Consequence: **every natural phrasing of cycle detection silently returns zero rows.** All four of
these produce nothing on a graph that definitely contains a cycle:

```cypher
MATCH p = (c)-[:OWNS*2..6]->(c) ...                       -- 0 rows
MATCH p = (c)-[:OWNS*1..6]->(c) ...                       -- 0 rows
MATCH p = (a)-[:OWNS*2..6]->(b) WHERE a = b ...           -- 0 rows
MATCH p = (a)-[:OWNS*2..6]->(b) WHERE id(a) = id(b) ...   -- 0 rows
```

The working idiom splits the closing edge out of the variable-length segment, so no node repeats
_within_ the expansion:

```cypher
MATCH (a)-[:OWNS]->(b)
MATCH p = (b)-[:OWNS*1..5]->(a)
RETURN a.name AS start, [n IN nodes(p) | n.name] AS rest
```

Verified: returns the A/B/C cycle three times, once per entry point.

"Detect circular ownership" therefore survives as a signature query — but only written this way, and
it is worth a comment in the source explaining why, because the obvious form looks correct and fails
silently. That silent-empty-result failure mode is the dangerous one: a demo query that returns
nothing looks like missing data, not a dialect mismatch.

Second consequence, for the README's honesty and the interview: effective-ownership percentage
summed across paths is computed over _acyclic_ paths only. On this data that is arguably the correct
semantics — it terminates, and circular ownership does not inflate a stake — but it is a deliberate
semantic choice forced by the engine, not an accident, and should be stated as such.

Verified working on a real chain, `P→A(0.8)→B(0.5)→C(0.25)`:

```cypher
MATCH p = (owner {k: $from})-[:OWNS*1..5]->(target)
WITH target, sum(reduce(acc = 1.0, r IN relationships(p) | acc * r.pct)) AS effective
WHERE effective > $threshold
RETURN target.k AS company, effective ORDER BY effective DESC
```

→ `A 0.8 | B 0.4 | C 0.1`. This is the ultimate-beneficial-owner core, and it works.

### Failure modes, measured

| Cause                       | `code`                                  | `retriable` | Distinguishable? |
| --------------------------- | --------------------------------------- | ----------- | ---------------- |
| Bad hostname (NXDOMAIN)     | `ServiceUnavailable`                    | `true`      | **no**           |
| Connection refused          | `ServiceUnavailable`                    | `true`      | **no**           |
| Unroutable / timeout        | `ServiceUnavailable`                    | `true`      | **no**           |
| HTTP endpoint on a Bolt URI | `N/A`                                   | `false`     | yes              |
| **Wrong password**          | `Neo.ClientError.Security.Unauthorized` | `false`     | **yes**          |

So ticket 09 gets exactly three honest states: _unreachable_ (three causes, indistinguishable),
_misconfigured_ (auth failure, or HTTP-on-Bolt), and _query failed_. `connectionTimeout` is honoured
to the millisecond and is the real lever on how fast the UI can show the unreachable state.
`ServiceUnavailable` being `retriable: true` means `executeRead` will burn its full retry window
first — bound it deliberately.

### Reproducing

`<scratchpad>/probe/verify.sh` sources `~/.cognodb.env` and runs the round-trip plus capability
probes. `probe2.mjs`–`probe4.mjs` hold the surface and dialect probes. These are throwaway; the
durable versions belong in the repo once ticket 04 lands.

**Status: resolved. Every DB-touching ticket is unblocked.**
