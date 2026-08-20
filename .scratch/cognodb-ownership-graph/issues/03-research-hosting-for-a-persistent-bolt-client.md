# Research hosting for a persistent Bolt client

Type: research
Status: open

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
