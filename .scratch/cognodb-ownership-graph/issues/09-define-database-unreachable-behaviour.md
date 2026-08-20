# Define database-unreachable behaviour

Type: grilling
Status: resolved
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

## Answer

Three honest states, defined across all three layers and **verified against a genuinely dead
database** rather than reasoned about.

### The three states — and why there are only three

| State | HTTP | Driver signal | Cause knowable? |
|---|---|---|---|
| `database_unreachable` | **503** + `Retry-After: 5` | `ServiceUnavailable` | **No.** Bad hostname, refused connection and timeout are byte-identical (ticket 01). |
| `database_misconfigured` | **500** | `Neo.ClientError.Security.Unauthorized`, or `N/A` (HTTP on a Bolt port) | Yes |
| `query_failed` | **500** | any other `Neo.*` code | Yes |

`invalid_request` (400) and `not_found` (404) complete the shape. **"No results" is deliberately not
an error** — an empty owner list is a finding, and returns 200 with an empty array.

The API does not pretend to diagnose unreachability. The user-facing copy says so outright: *"the
driver reports these identically, so we cannot tell you which."* Honest beats plausible.

Classification verified against errors generated live:

```
bad hostname          ServiceUnavailable                    -> database_unreachable    PASS
connection refused    ServiceUnavailable                    -> database_unreachable    PASS
wrong password        Neo.ClientError.Security.Unauthorized -> database_misconfigured  PASS
cypher syntax error   Neo.ClientError.Statement.SyntaxError -> query_failed            PASS
```

### Driver

- `connectionTimeout: 5_000` — measured cold connect is ~1.5s, so 5s is generous without making a
  dead database feel like a hung app. Ticket 01 confirmed this is honoured to the millisecond, which
  makes it the real lever on how fast the UI can show the failure.
- `connectionAcquisitionTimeout: 6_000`, `maxConnectionPoolSize: 20` — CognoDB's free tier caps at
  200 connections; one Fly machine with 20 leaves ample headroom and is more than a burstable
  0.5 vCPU instance can usefully serve at once.
- **`session.run`, not `executeRead`.** `ServiceUnavailable` carries `retriable: true`, so
  `executeRead` would burn its entire retry window before surfacing anything — converting a dead
  database into an app that merely appears hung. Failing fast and letting the UI own the retry is
  more honest and more responsive. `maxTransactionRetryTime` is dropped to 3s so this cannot
  silently stretch if that ever changes.

### API — starts degraded, never crash-loops

**No connectivity check at boot.** A container that refuses to start crash-loops on Fly, and the
reviewer sees Fly's error page instead of the error state that was carefully designed in ticket 08 —
turning a transient database blip into a submission that looks broken.

Verified by running the built API against a hostname that does not resolve:

```
API stayed up:  YES — still listening
GET /health  →  200 in 474 ms
{ "api": "ok", "database": "unreachable",
  "detail": "The database is unreachable. The instance may be paused, or the connection
             details may be wrong — the driver reports these identically…" }
```

A `DatabaseExceptionFilter` is the single place a driver failure becomes an HTTP response. The stack
trace goes to the server log via `Logger.error`; the caller receives a sentence and nothing else.

### UI — manual retry plus a backing-off poll

A visible **Try again** button, and behind it a quiet poll backing off from 5s toward 30s. The demo
heals itself if the instance wakes mid-recording, but the user is never stuck waiting on a poll they
cannot see, and a forgotten open tab cannot hammer a struggling instance. Chat degrades separately
from the graph: a tool call failing mid-conversation emits a `database_unreachable` chat event
(ticket 07) rather than replacing the whole screen.

### One defect this ticket caught

The health endpoint had grown **its own copy** of the failure message, separate from the shared
`API_ERROR_MESSAGE` — so the health endpoint and the error responses would have drifted into telling
users different stories about the same failure. `classify()` now reads the shared copy. This is
precisely the drift `packages/shared` exists to prevent, and it appeared within one ticket of that
file being created.

### Demonstrating it

For the recording, run locally with `COGNODB_URI` pointing at a hostname that does not resolve. That
exercises the genuine `ServiceUnavailable` path — the exact code a reviewer would hit — with **zero
simulation code in the repo**. Nothing ships that exists only for the demo.

**Status: resolved.** All nine charted tickets are done; implementation graduates from the fog below.
