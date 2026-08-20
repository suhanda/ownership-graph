# Prototype the explorer UI

Type: prototype
Status: claimed
Blocked by: 02, 05

## Question

What does the application look like, and how do the chat and the graph relate to each other?

Design effort is explicitly graded, and this is the ticket that decides whether the submission reads as
a polished product or a wired-up API. Use `/prototype` to build something cheap and concrete to react
to, rather than deciding in the abstract.

Questions the prototype has to answer:

- **The shell.** One screen with the graph dominant and chat in a panel, or separate views? Does the
  chart or the conversation own the primary space?
- **The entry point.** What does a non-technical person see on first load, before they have asked
  anything? An empty graph is a terrible first impression; a pre-loaded interesting subgraph and some
  suggested questions may be the whole answer to the empty state.
- **The chat-to-chart connection.** When a tool returns a path, does the chart highlight it inside the
  existing view, replace the view, or animate to it? This is the interaction that makes the demo feel
  designed, and it is currently the largest open question on the map.
- **The node.** What does a company look like versus a person versus an intermediary? What is on a node
  when you click it, and where does that detail live — inline, side panel, or drawer?
- **States.** Loading while a multi-hop query runs on a burstable instance, empty when a query finds
  nothing, and error when the database is unreachable. The assignment names all three.
- **Typography, spacing and palette.** Consult `/frontend-design` or `/impeccable`.

**The answer must record** the chosen layout with the prototype linked as an asset, and the decided
interaction model for chat-to-chart.
