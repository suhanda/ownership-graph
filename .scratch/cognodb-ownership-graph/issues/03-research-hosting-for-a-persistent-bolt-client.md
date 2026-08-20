# Research hosting for a persistent Bolt client

Type: research
Status: resolved

## Question

Which container host should the NestJS API run on, and what does deploying there actually require?

The hosting split is already decided — Next.js on Vercel, NestJS on a long-running container so the
driver keeps one healthy pool. This ticket narrows the container host and surfaces the gotchas before
they cost a night.

Check against primary sources (current docs, not memory):

- **Railway vs Render vs Fly.io**: does a genuinely free or trivially cheap tier still exist, and what
  are its limits? Cold starts, idle sleeping, monthly hours, memory ceiling.
- **Outbound TCP on port 7687 to `bolt+s://`** — confirm each candidate permits it. This is the
  disqualifying question; a host that only allows outbound HTTP is useless here.
- **Idle sleeping vs a live connection pool.** If the host sleeps the container, what happens to the
  Bolt pool on wake, and does the first request after a sleep fail? This directly shapes ticket 09
  and the screen recording.
- **Vercel side**: environment variable handling, and the CORS configuration needed for the browser to
  reach the API on a different origin.
- Whether either side needs a health-check endpoint to stay warm.

**The answer must record** the chosen host with the reason, the required config, and any limit that
will bite during the demo. Write it up as a markdown asset in the repo and link it here.

## Answer

**Fly.io for the API, Vercel for the web app.** Full write-up with sources: [`docs/hosting.md`](../../../docs/hosting.md).

### The measurement that sized it

The built API sits at **~100 MB RSS**, flat at idle and after 20 queries. So 256 MB would work; 512 MB
is chosen because it costs $1.30/month more and removes any OOM risk during the review window.

### The comparison

| Host | Cost | Always-on? | Outbound :7687 | Verdict |
|---|---|---|---|---|
| **Fly.io** | **$3.32/mo** (512 MB) | Yes, explicitly | Unrestricted by default | **Chosen** |
| Railway Hobby | $5/mo | Yes | Unrestricted once GitHub-verified | Viable, pricier |
| Railway Free | $1 credit/mo | No — credit gone in ~a week | **Restricted on Limited Trial** | Rejected |
| Render Free | Free, 750 hrs/mo | **No — 15 min idle → ~60 s wake** | Allowed | Fallback only |

### The two findings that decided it

1. **Render Free spins down after 15 minutes and takes about a minute to wake.** For a submission where
   UX is explicitly graded, the reviewer's first impression would be a 60-second loading page followed
   by a ~2 s cold query — the worst moment of the demo, placed first. Disqualifying.
2. **Railway documents that Limited Trial accounts have "restricted outbound network access and only a
   limited set of ports."** Port 7687 is exactly what such a restriction blocks, and it would only
   surface after deploying. GitHub verification lifts it, but this is a trap worth avoiding entirely.

Fly wins on the disqualifying question: its network policies are **opt-in deny** — *"once you create a
rule for a direction, the default for that direction becomes deny all"* — so with no rules configured,
outbound TCP to 7687 works untouched. And autostop is explicitly disableable
(`auto_stop_machines = "off"`, `auto_start_machines = false`), so the connection pool never goes cold.

### The free path, if paying is unacceptable

Render Free's allowance is **750 instance-hours/month** and a month is ~744 hours — so one free service
can run continuously if an external pinger hits `/health` every 10 minutes. Two caveats: the quota covers
exactly **one** free service across the whole workspace, and Render reserves the right to suspend a free
service that *"initiates an uncommonly high volume of traffic."* Documented as a fallback, not chosen.
Overriding this decision is a one-line change to the deploy target.

### Configuration gotchas recorded for the deploy ticket

- **Vercel environment variable changes only apply to new deployments.** Editing a variable does nothing
  until a redeploy. This will bite exactly once, at the worst moment, if not known in advance.
- Pin the Fly region near the CognoDB instance, or the measured ~240 ms query floor grows.
- `CORS_ORIGIN` must carry the Vercel production domain; `main.ts` already splits on commas so preview
  domains can be added.
- Fly's health check can point at `/health`, but that route performs a real `getServerInfo()` round-trip
  — if it ever becomes load-bearing, add a cheaper liveness route and keep `/health` for the UI.

**Status: resolved.** Unblocks the database-unreachable behaviour ticket.
