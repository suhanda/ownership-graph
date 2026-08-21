# Screenshots and the screen recording

Type: task
Status: open
Blocked by: 13, 14

## Question

Produce the visual deliverables. Both are **mandatory** in the assignment.

- **Screenshots** of the hero answer, the hidden link, and an error state — dropped into the README's
  placeholders.
- **Screen recording.** Lead with "who really owns Meridian Civic Infrastructure?" → Konstantin Belov
  at 76.5% four layers up → then the hidden link to Harbour Line → then the sanctions angle. Show the
  database-unreachable state deliberately, using a local run pointed at a hostname that does not
  resolve (no simulation code ships for this).

Before recording:
- **The chat has never run against the live model.** Add `ANTHROPIC_API_KEY` and confirm
  "Who owns Meridian Civic Infrastructure?" produces `find_entity` → `trace_beneficial_owners` →
  narration naming Belov at 76.5%.
- Watch what sustained click-to-expand does in a dense part of the graph — the one thing the UI ticket
  left untested.
- Decide whether `.scratch/` ships with the repo or is stripped.

**Done when** the recording exists and the README's screenshot placeholders are filled.
