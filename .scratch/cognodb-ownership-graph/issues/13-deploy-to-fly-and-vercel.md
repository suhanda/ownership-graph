# Deploy to Fly and Vercel

Type: task
Status: open
Blocked by: 11, 12

## Question

Get the app live at a URL a reviewer can click, per the decision in ticket 03.

Work:
- **API → Fly.io**: one machine, 512 MB shared CPU, `auto_stop_machines = "off"` and
  `auto_start_machines = false` so the connection pool never goes cold. Region near the CognoDB
  instance, or the measured ~240 ms query floor grows. Secrets via `fly secrets set`.
- **Web → Vercel**: `NEXT_PUBLIC_API_URL` pointing at the Fly URL in Production. **Environment
  variable changes only apply to new deployments** — editing a variable does nothing until you
  redeploy. This will bite exactly once if forgotten.
- `CORS_ORIGIN` on the API must carry the Vercel production domain.
- Point Fly's health check at `/health`, but note it performs a real `getServerInfo()` round-trip; if
  that proves too heavy, add a cheaper liveness route and keep `/health` for the UI.
- Verify the deployed app against the live seeded graph, not just locally.

**Done when** the public URL loads, all six questions work from it, and the chat answers.
