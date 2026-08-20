# Define database-unreachable behaviour

Type: grilling
Status: open
Blocked by: 01, 03, 04

## Question

What does the whole system do when CognoDB is not there?

The assignment names "graceful error handling when the database is unreachable" as an explicit
engineering requirement, so this gets designed rather than discovered. Ticket 01 will have recorded the
real failure shapes and ticket 03 the host's sleep behaviour — build on those rather than guessing.

Decisions to settle across three layers:

- **Driver.** Connection pool sizing against the 200-connection cap, connection timeout, acquisition
  timeout, and retry policy. Does the app fail fast or hang? A burstable instance under load and a
  genuinely dead instance must not look the same to the user.
- **API.** Does NestJS verify connectivity at boot and refuse to start, or start degraded and report
  unhealthy? Which HTTP status distinguishes "database unreachable" from "query failed" from "no
  results"? Is there a health endpoint, and does the host use it?
- **UI.** What does a person see — a toast, a full-page state, a persistent banner? Does the chat behave
  differently from the graph view when the backend is down? Is there a retry affordance, and does it
  poll or wait for a click?
- **Chat mid-conversation.** A tool call failing on a dead database is a distinct case from the API being
  unreachable before the request. Both need defined behaviour.
- **What gets logged**, and how a stack trace is kept off the user's screen while staying findable.

**The answer must record** the decided behaviour per layer, and a way to demonstrate it deliberately —
the screen recording is stronger if it shows the failure state on purpose.
