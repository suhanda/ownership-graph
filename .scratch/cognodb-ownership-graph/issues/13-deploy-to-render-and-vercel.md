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

## Comments

**Repository published — the rest needs your accounts.**

<https://github.com/suhanda/ownership-graph> · **private** · 17 commits on `main`.

Private was chosen as the reversible direction: private → public is one command, whereas nothing
un-indexes a repo that was briefly public. Flip it with
`gh repo edit suhanda/ownership-graph --visibility public`, or add Wexa as a collaborator if it stays
private (the assignment asks for access either way).

### A leak caught before the first push

`render.yaml`, `docs/hosting.md` and ticket 01 had picked up the **live instance hostname and its
resolved IP** while recording the region finding. Not a credential — the password was never
committed — but no reason to publish the endpoint of an instance that has to stay reachable through
review, and a hostname plus a running instance is a free target.

Redacted in the working tree, then removed from **all 17 commits** with `filter-branch`, backup refs
deleted and the reflog expired. Verified with `git grep` across every commit: the string exists in no
blob in the repository. Doing this before the first push made it cheap; after publishing it would
have been unfixable.

`.env` was never committed, and is confirmed absent from the remote.

### Deployment order matters — there is a circular dependency

Each service needs the other's URL, so do it in this order:

1. **Render** → New → Blueprint → pick this repo. `render.yaml` defines the service; set the four
   `sync: false` secrets in the dashboard: `COGNODB_URI`, `COGNODB_PASSWORD`, `ANTHROPIC_API_KEY`,
   and `CORS_ORIGIN` (put `http://localhost:3000` for now). Note the assigned `*.onrender.com` URL.
2. **Vercel** → import the repo, **Root Directory `apps/web`**. `vercel.json` handles the monorepo
   build. Set `NEXT_PUBLIC_API_URL` to the Render URL. Deploy, note the production domain.
3. **Back to Render** → set `CORS_ORIGIN` to the Vercel domain. This redeploys the API.
4. **Keep-warm** → set the repository variable `API_URL` to the Render URL so
   `.github/workflows/keep-warm.yml` runs, and point UptimeRobot's free tier at the same `/health`.
   The workflow alone is not enough: GitHub's scheduler slips past the 15-minute sleep window.

Neither the Render nor the Vercel CLI is installed here, and both require interactive login, so none
of this can be driven from this session.

### Before it counts as done

- All six questions work from the public URL.
- The chat answers — **this path has never run**; it needs `ANTHROPIC_API_KEY` set on Render.
- Check the first query after a deploy: co-locating the API in `virginia` should drop the ~240 ms
  floor to near-zero, and it is worth confirming that actually happened.
