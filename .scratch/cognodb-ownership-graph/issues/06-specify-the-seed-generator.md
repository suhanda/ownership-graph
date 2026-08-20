# Specify the seed generator

Type: task
Status: claimed
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
