# Deploy to Render and Vercel

Type: task
Status: claimed
Blocked by: 11, 12

## Question

Get the app live at a URL a reviewer can click.

Hosting was re-decided after the original research: **API on Render's free tier, web on Vercel**, at
$0. See the "Superseded" section of ticket 03 for the numbers and the two accepted risks.

Work:
- **API → Render**, free instance (0.1 CPU / 512 MB). Secrets set in the Render dashboard.
- **Keep-warm is load-bearing**, not a nicety: a free service spins down after 15 minutes idle and
  takes ~60 s to wake. Something must hit `/health` every ~10 minutes or the reviewer waits a minute.
- **Web → Vercel**, with `NEXT_PUBLIC_API_URL` pointing at the Render URL. **Environment variable
  changes only apply to new deployments** — editing one does nothing until a redeploy.
- `CORS_ORIGIN` on the API must carry the Vercel production domain.
- The API is a pnpm workspace member that depends on `@ownership/shared`, so the build has to run from
  the repo root, not from `apps/api`.
- Verify the deployed app against the live seeded graph, not just locally.

**Done when** the public URL loads, all six questions work from it, and the chat answers.
