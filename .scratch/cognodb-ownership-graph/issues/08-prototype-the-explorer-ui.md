# Prototype the explorer UI

Type: prototype
Status: resolved
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

## Answer

Prototype built on **real seeded data** and reacted to; the component layer is now
**shadcn/ui**, on the user's instruction. Committed as `f43e235`.

**Prototype:** https://claude.ai/code/artifact/124093de-9c50-4a1c-a5ba-a33cc03c7ccc
Source in `<scratchpad>/proto/` — hand-rolled CSS, since it predates the shadcn decision.
It stays useful as the visual reference; it is not the implementation.

### The shell

Three columns: a 264px left rail (entity search plus the six signature questions), the graph
canvas centre, a 372px chat rail right. A findings panel sits under the canvas holding the tabular
answer — effective percentages, or the enumerated hidden-link paths. Top bar carries the case
context and a live connection chip.

### Decided interactions

**Position encodes ownership depth.** The single most consequential call. A force layout scrambles
precisely what the user is reading — ownership has direction and depth, so the ultimate owner is
pinned at the top, the subject at the bottom, one row per layer. "Four layers up" becomes literally
visible. ECharts `layout: 'none'` with computed coordinates, not `'force'`. The hidden-link view uses
the same principle: the two subjects at the edges, the shared connectors down the middle.

**Chat and chart share one screen; the chat drives the chart.** A tool result repaints the canvas and
updates the findings panel rather than opening a separate view. Chat shows its tool calls inline
(`beneficial_owners { companyId: "C-SCN-01", maxDepth: 5 }`) — this demonstrates the architecture to
an evaluator and makes the "no string-concatenated Cypher" design visible in the demo itself.

**The one-second wait became the feature.** Ticket 06 measured the hero query at ~1,020 ms warm and
~1,986 ms cold. Instead of a spinner, the loading state narrates the traversal layer by layer —
"Layer 2 · Cyprus", "Layer 3 · Liechtenstein". It converts a measured latency problem into the thing
that makes the product feel like it is doing real work. This resolves the open fog item; no query
optimisation is needed.

**Hub size is shown on the link.** The shared-address path carries a "shared by 81" tag, because
`PO Box 3151` now hosts 81 companies. A viewer can therefore tell that the address is weak evidence
while the shared *director* is strong — answering the question ticket 06 raised.

**The empty state is a finding.** Asking who owns `Kestrel Capital SA` returns nothing, because it
sits inside the ownership cycle and never reaches a natural person. The empty state says exactly that
and offers the cycle view, rather than reading as a failure.

**The error state does not pretend to diagnose.** Per ticket 01, the driver cannot distinguish a bad
hostname from a paused instance, so the copy says so plainly rather than guessing.

### Colour and type

**Colour encodes investigative role; shape encodes the label.** Person is blue, shared infrastructure
(address and agent) ochre, watchlist red, Company a neutral ink, and Jurisdiction deliberately grey and
recessive because it is a Hub. Six shapes carry the exact kind, so identity is never colour-alone.

The categorical palette was **validated, not eyeballed** — `#2073B8 / #B5720C / #B01F33` passes the
lightness band, chroma floor, CVD separation, normal-vision floor and contrast checks across **all**
pairs in both themes. Earlier candidates failed and were discarded: a teal read as grey and collided
with blue; green sat 3.2 ΔE from red under deuteranopia; purple sat 3.4 ΔE from blue. Lifting the red
for dark mode collided it with the ochre, so the same hue is kept and its sub-3:1 contrast is relieved
by every node carrying a visible text label.

**Archivo** for UI and headings, **IBM Plex Mono** reserved for identifiers, jurisdiction codes and
percentages where tabular figures matter. Both self-hosted through `next/font` — 18 woff2 files
emitted at build, so there is no Google Fonts dependency in the shipped app.

### shadcn/ui — the component layer

Verified working against **Next 16.3.1 / React 19.2.8 / Tailwind 4.3.3**; the docs say nothing about
this combination, so it was tested rather than assumed. Notes for whoever builds on it:

- Init is `shadcn@4.18.0 init -b radix -p nova`. The CLI has changed — there is no `--base-color`
  any more; `--base` selects the primitive library (radix/base/aria) and `--preset` the style.
- The palette lives in `apps/web/src/app/globals.css` as shadcn tokens. Node categories are
  `--chart-1..5`.
- **`--accent` in shadcn is a hover surface, not a brand hue.** The brand hue is `--primary`. Getting
  this backwards would repaint every hover state in teal.
- **shadcn's dark mode is a `.dark` class, not `prefers-color-scheme`.** The prototype used the media
  query; the real app needs `next-themes` or equivalent to toggle the class. Not yet wired.
- Adopting Tailwind removed the hand-rolled custom properties the health page used, so that page was
  rebuilt on `Card`/`Badge`/`Separator`. Verified still rendering live data: *Connected · Neo4j/5.26.0
  · Bolt 5.4*.

### Open, deliberately

The three questions put to the user — whether chat deserves permanent width, whether tool calls are
clutter for a non-technical viewer, and whether the typography is too austere — were not answered
individually; the direction was accepted and shadcn added. Treat the three-column shell as provisional
and revisit if it feels cramped once real components replace the prototype's CSS.

**Status: resolved.**
