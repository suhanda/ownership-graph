# Write the README and record the demo

Type: task
Status: open
Blocked by: 13

## Question

Produce the submission package.

The assignment names these explicitly, and a hosted link and recording are **mandatory**.

Work:
- **README**: the use case; a **"Why a graph database?"** section; the Mermaid data-model diagram from
  ticket 02; setup and run instructions including how to create the CognoDB instance (use the real
  `.databases.cognodb.com` URI form — the assignment PDF documents a hostname that is wrong); the main
  queries explained; screenshots.
- The why-graph argument writes itself from the query set: a recursive CTE with percentage arithmetic,
  plus cycle detection, plus shortest path. Decide how much SQL to show before it stops being
  persuasive — and mention the two constraints that shaped the implementation: Cypher cannot
  parameterise a variable-length bound or a label, and CognoDB expands paths with node uniqueness.
- **Screenshots** of the hero answer, the hidden link, and an error state.
- **Screen recording**: lead with "who really owns Meridian Civic Infrastructure?" → Konstantin Belov
  at 76.5% four layers up → then the hidden link to Harbour Line → then the sanctions angle. Show the
  database-unreachable state deliberately, using a local run pointed at a bad hostname.
- Decide whether `.scratch/` (this map and its tickets) ships with the repo or is stripped.
- Repo visibility, and access for Wexa if private.

**Done when** the repo, the live link and the recording are ready to email to hr@wexa.ai with the
subject line "CognoDB Assignment 2 – <Your Name>".
