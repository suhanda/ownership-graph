# Hosting a persistent Bolt client

Research for the ownership-graph API. Checked against vendor documentation in August 2026.

## The constraint

Bolt is a **stateful, long-lived TCP connection**. The `neo4j-driver` holds a connection pool that is
expensive to establish (~1.5s including TLS and auth, measured) and cheap to reuse. Two consequences:

1. **Serverless is wrong for this API.** Each cold invocation would rebuild the pool, and concurrent
   invocations would multiply connections against CognoDB's 200-connection cap.
2. **A host that sleeps idle containers is nearly as bad**, because the demo link will be clicked at an
   unpredictable time, days after submission.

Measured footprint of the built API: **~100 MB RSS** at idle and after 20 queries — flat, no growth.
So 256 MB is workable and 512 MB is comfortable.

## Candidates

| Host | Cost | Always-on? | Outbound TCP :7687 | Verdict |
|---|---|---|---|---|
| **Fly.io** | $2.02/mo (256 MB), **$3.32/mo (512 MB)** shared CPU | Yes, explicitly | Unrestricted by default | **Chosen** |
| Railway Hobby | $5/mo, includes $5 usage | Yes | Unrestricted once GitHub-verified | Viable, pricier |
| Railway Free | $1 credit/mo, 0.5 GB / 1 vCPU | No — credit exhausts in days | **Restricted on Limited Trial** | Rejected |
| Render Free | Free, 750 instance-hours/mo | **No — 15 min idle → ~60s cold wake** | Allowed (only 25/465/587 blocked) | Fallback only |

### Why not Render Free

Free web services *"spin down after 15 minutes without receiving any inbound traffic"* and the next
request takes *"about one minute"* while Render shows a loading page. For a submission where design and
UX are explicitly graded, a reviewer's first impression would be a 60-second wait followed by a ~2s cold
query. That is the single worst moment of the demo, placed first.

There is a workaround: the free allowance is **750 instance-hours per month**, and a month is ~744
hours — so one free service can run 24/7 if something pings it. An external uptime pinger every 10
minutes keeps it warm within quota. Two caveats: the quota covers exactly **one** free service across
the whole workspace, and Render reserves the right to suspend a free service that *"initiates an
uncommonly high volume of traffic over the public internet"*.

This is the genuinely-free path if paying is unacceptable. It is a fallback, not the recommendation.

### Why not Railway

Railway's Free plan gives **$1 of credit per month, with no roll-over**. A 0.5 GB always-on container
consumes roughly $5/month of credit, so a free deployment stops after about a week — and the assignment
asks that the demo stay live until Wexa have reviewed it.

More importantly, Railway documents that **Limited Trial accounts have "restricted outbound network
access and only a limited set of ports"**; full access requires GitHub verification. Port 7687 is
exactly the kind of port such a restriction blocks, and discovering it after deploying would cost hours.
Railway Hobby at $5/month is a perfectly good option — it is simply more expensive than Fly for the same
job.

### Why Fly.io

- **Cheapest genuinely always-on option**: $3.32/month for 512 MB shared-CPU, or $2.02 for 256 MB.
- **Egress is unrestricted by default.** Fly network policies are opt-in: *"Once you create a rule for a
  direction, the default for that direction becomes deny all."* With no rules configured, outbound TCP
  to port 7687 works without configuration.
- **Autostop is explicitly disableable.** Setting `auto_stop_machines = "off"` and
  `auto_start_machines = false` makes machines *"run continuously"* — no idle sleep, so the connection
  pool stays healthy and there is no cold wake.

## Decision

- **API (NestJS)** → Fly.io, one machine, **512 MB shared CPU**, autostop off, primary region nearest
  the CognoDB instance.
- **Web (Next.js)** → Vercel.

512 MB rather than 256 MB: the measured 100 MB leaves plenty of headroom either way, but 512 MB costs
$1.30/month more and removes any risk of an OOM kill during the review window. That is the right trade
for a submission that must stay up.

## Configuration notes

**Fly** — set secrets with `fly secrets set COGNODB_URI=… COGNODB_PASSWORD=… ANTHROPIC_API_KEY=…`;
they are injected as environment variables, which is what `config/env.ts` already reads. Pin the app
region close to CognoDB (`db-<id>.<cluster>.…`) to keep the ~240 ms query floor from growing.

**Vercel** — environment variables are scoped per environment (Production / Preview / Development) and
capped at 64 KB total. The gotcha worth remembering: **changes only apply to new deployments** — editing
a variable does not affect the running deployment until you redeploy. `NEXT_PUBLIC_API_URL` must point
at the Fly URL in Production.

**CORS** — the browser calls the API on a different origin, so `CORS_ORIGIN` on the API must list the
Vercel production domain. `main.ts` already splits it on commas, so preview domains can be added.

**Health check** — `/health` already exists and reports database reachability. Point Fly's health check
at it, but note it performs a real `getServerInfo()` round-trip; if that ever becomes load-bearing,
give Fly a cheaper liveness route and keep `/health` for the UI.

## Sources

- [Render — free tier](https://render.com/docs/free)
- [Railway — plans](https://docs.railway.com/reference/pricing/plans) and [free trial](https://docs.railway.com/reference/pricing/free-trial)
- [Fly.io — pricing](https://fly.io/docs/about/pricing/), [autostop/autostart](https://fly.io/docs/launch/autostop-autostart/), [network policies](https://fly.io/docs/machines/guides-examples/network-policies/)
- [Vercel — environment variables](https://vercel.com/docs/environment-variables)
