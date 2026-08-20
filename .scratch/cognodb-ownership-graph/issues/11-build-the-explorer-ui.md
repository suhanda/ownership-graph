# Build the explorer UI

Type: task
Status: claimed
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
