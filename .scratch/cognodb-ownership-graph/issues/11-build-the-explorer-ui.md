# Build the explorer UI

Type: task
Status: resolved
Blocked by: 10

## Question

Build the three-column explorer on shadcn/ui and ECharts, to the design resolved in ticket 08.

Work:
- The shell: left rail (entity search + the six questions), graph canvas, right chat rail, findings
  panel beneath the canvas.
- ECharts `graph` series with **`layout: 'none'`** and coordinates computed from ownership depth —
  ultimate owner at the top, subject at the bottom. A force layout scrambles the one thing the user
  is reading. Colour by investigative role, shape by label, per the validated `--chart-1..5` tokens.
- Loading state that narrates the traversal layer by layer — the hero query is ~1,020 ms warm and
  ~1,986 ms cold, and ticket 08 decided to show that rather than hide it.
- Empty and error states as designed, including the retry button plus backing-off poll from ticket 09.
- Show hub size on shared nodes ("shared by 81") so link strength is judgeable.
- **Wire theme toggling.** shadcn drives dark mode from a `.dark` class, not `prefers-color-scheme`,
  so this needs `next-themes` or equivalent — and the ECharts instance must re-read its colours when
  the theme changes, since it caches them at render time.
- Keep `'use client'` at the leaves; the shell and data fetching stay server components.

Open, to settle while building: how the layered layout behaves for `watchlistControl`'s 120 results,
and what click-to-expand does once a user roams off the planted scenario into the wider graph.

**Done when** a non-technical person can run all six questions from the UI against real data, and the
loading, empty and error states are all reachable.

## Answer

**Built and running against the live graph.** Committed as `f38daad`.

### First paint is already an answer

The hero query runs in the Server Component, so the page a reviewer lands on arrives with the finding
already rendered — no spinner, no empty graph. Verified in the server-rendered HTML: the title, the
findings table, **Konstantin Belov at 76.5%**, the sanctioned badge, the case context, the connection
chip and all six questions are present before any JavaScript executes.

### Layout is computed, never force-directed

Ownership has direction and depth and that is the entire point of the picture, so positions are
calculated and ECharts runs with `layout: 'none'`. Each question owns the shape that suits it:

| Question | Layout |
|---|---|
| Beneficial owners, watchlist control | `layered` — subject at the bottom, each layer of owners stacked above |
| Hidden link | `bridged` — the two subjects at the edges, whatever connects them down the middle |
| Circular ownership | `ring` — the shape *is* the finding |
| Nominee, neighbourhood | `radial` — one node centred, its relationships around it |

`layered` ranks by walking *up* the ownership edges and keeps the deepest rank, so a node reachable
by two chains sits above both rather than jumping to whichever path arrived first.

### States

- **Loading** narrates the traversal layer by layer ("Layer 2 · Cyprus"), because ticket 06 measured
  the hero at ~1.3 s warm and ~2 s cold. The wait becomes evidence of work rather than dead air.
- **Empty** says what the absence *means* — an ownership chain that never reaches a person is a
  finding, not a failure.
- **Error** does not pretend to diagnose, per ticket 09, and retries on a timer that doubles up to a
  30 s cap so a forgotten tab cannot hammer a struggling instance.

### Roaming beyond the planted scenario

Two ways out of the demo case, which is the open question ticket 10 left: the search box resolves any
entity by full-text and runs beneficial ownership against it, and clicking any node expands its
neighbourhood with a "back to …" affordance. So the app is a general tool that happens to open on a
good example, not a hard-coded demo.

### Theme

`next-themes` drives shadcn's `.dark` class (system / light / dark, cycled from the header). The chart
**re-reads its CSS tokens on every paint** rather than keeping the colours ECharts captured on first
render — otherwise switching theme leaves a light-theme graph on a dark ground.

### The chat panel is already wired

Built against the `chatEventSchema` SSE contract, so ticket 12 only has to ship the endpoint. Until it
exists the panel degrades honestly: a 404 produces *"The chat service is not available yet. The
questions on the left work without it."* — no dead composer, no broken-looking demo.

### Bundle

ECharts is ~1,156 KB raw / **302 KB gzipped even tree-shaken** to `GraphChart` + `CanvasRenderer`
alone — confirmed by grepping the chunk, which contains no Sunburst, Sankey, Bar or Geo code. It is
therefore **dynamically imported with `ssr: false`**, so it loads after first paint rather than
blocking it.

| | gzipped |
|---|---|
| Initial page payload | **319 KB** |
| ECharts, deferred | 302 KB |

### Degradation, verified

With the API stopped and the page reloaded: HTTP 200 in 8 ms, the shell renders, the chip reads
*"database unreachable"*, the empty state explains itself, and **no stack trace reaches the HTML**.

### Left open

How the layered layout copes when a user expands repeatedly into a dense part of the 3,607-node graph.
`neighbours` is capped at 40 and `watchlistControl` at 22 nodes, so nothing arrives too big to draw —
but sustained roaming is untested. Worth a look during the recording rehearsal.

**Status: resolved.**
