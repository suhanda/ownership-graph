# Write the README

Type: task
Status: resolved

## Question

Write the README the assignment asks for.

Split out from the original combined ticket: the prose, the "Why a graph database?" argument, the data
model diagram, the setup instructions and the query explanations need no deployment. Only the hosted
link and the screenshots do, and those are placeholders until ticket 13 lands.

The assignment names these explicitly:
- the use case, and a **"Why a graph database?"** section
- a data model diagram
- setup and run instructions, **including how to create the CognoDB instance** — using the real
  `.databases.cognodb.com` URI form, since the assignment PDF documents a hostname that is wrong
- the main queries explained
- screenshots of the UI

Worth including beyond the checklist, because they are the parts a reviewer cannot get from the code
at a glance: the three CognoDB dialect divergences found by probing, and the two places Cypher cannot
be parameterised and how string concatenation was avoided anyway.

**Done when** a reader who has never seen the repo can create their own instance, seed it, run it, and
understands why this problem wanted a graph.

## Answer

**Written.** Committed as `74b7940`. 271 lines at `README.md`.

Covers everything the assignment names: the use case with the scandal laid out as an ownership tree,
**"Why a graph database?"** with the recursive CTE it replaces shown in full, the Mermaid data-model
diagram, the query table, setup including CognoDB instance creation, and deployment. Screenshots and
the demo link are explicit placeholders for ticket 15.

Two things included beyond the checklist, because a reviewer cannot get them from skimming the code:
the three CognoDB dialect divergences found by probing (node-uniqueness paths, unparameterisable
bounds and labels, no APOC/GDS), and the two measured findings — hub nodes poisoning shortest-path,
and one-round-trip queries beating parallel ones on a burstable instance.

The why-graph section names its own weak case: *"which companies share this address?"* is a plain
self-join and a graph adds nothing. Claiming every query is a graph win would be easy to disbelieve;
conceding one makes the other three credible.

### Verified rather than asserted

Every path the README links to exists, every command it tells a reader to run exists, and the counts
it quotes were checked against the live database: Company 2,011 · Person 1,202 · Address 347 ·
15,350 relationships — all matching.

### Two bugs writing the setup section exposed

1. **A fresh clone could not run `pnpm seed` or `pnpm dev` at all.** Both apps compile against
   `@ownership/shared`'s build output, and nothing built it first — `pnpm install` leaves no `dist`,
   so the very first command in the README failed with ten TypeScript errors. This is what a reviewer
   would have hit within sixty seconds of cloning. The root scripts now build shared first.
2. **The seed's self-verification was broken by ticket 10.** Rewriting the queries to return
   `{rows, nodes, links}` left the verifier reading fields straight off the record, so it threw
   *"This record has no field with key 'id'"* and exited non-zero *after* successfully loading the
   graph. It was never re-run after that rewrite. Rewritten for the combined shape.

Both were found by doing the thing the README describes rather than trusting that it still worked —
which is the argument for writing setup instructions by executing them.

Verified from a clean state: `rm -rf` both dists, then `pnpm seed` loads 3,607 nodes and passes all
seven planted-pattern checks with exit 0.

**Status: resolved.**
