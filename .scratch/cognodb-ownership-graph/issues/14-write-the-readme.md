# Write the README

Type: task
Status: claimed

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
