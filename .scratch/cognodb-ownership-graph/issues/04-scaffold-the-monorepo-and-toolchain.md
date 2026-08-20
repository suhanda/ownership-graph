# Scaffold the monorepo and toolchain

Type: task
Status: resolved

## Question

What is the repository skeleton, and does it build and run end to end while empty?

Nothing here is a hard decision — it is the ground every implementation ticket stands on, and doing it
now means no later ticket is blocked on plumbing. The assignment grades "clear project structure and a
codebase you would be comfortable walking us through line by line".

Work to do:

- `git init`, a `.gitignore` that covers `.env*`, and the GitHub repo created.
- A pnpm workspace: `apps/api` (NestJS), `apps/web` (Next.js App Router), `packages/shared` for the
  Zod schemas and inferred types that both sides import.
- TypeScript strict everywhere, no `any`. Consistent lint and format config.
- `.env.example` at the root documenting every variable — CognoDB URI, user, password, Anthropic API
  key — with real values loaded only from the environment.
- A trivial vertical slice that proves the wiring: web calls one API route, API returns a typed
  payload validated by a shared Zod schema.

**The answer must record** the final directory layout, the env var names, and the commands to run each
app in development, so later tickets do not have to rediscover them.

## Answer

**The skeleton exists, builds, typechecks and has been run end to end against the live database.**
Committed as `7243c72`.

### Layout

```
package.json            pnpm workspace root — dev / build / typecheck / format
pnpm-workspace.yaml
tsconfig.base.json      strictness only; module strategy is per-workspace on purpose
.env.example            every variable documented, no real values
.gitignore              .env* ignored (verified with git check-ignore before the first commit)
CONTEXT.md              domain glossary
README.md               scaffold stub; the full write-up is a later deliverable
apps/api/               NestJS — CognoDbService, Zod-validated env, /health
apps/web/               Next.js App Router — RSC page reading /health
packages/shared/        Zod schemas + inferred types for both sides
```

### Commands

```bash
pnpm install
pnpm --filter @ownership/shared build   # required once before the apps typecheck
pnpm dev                                # API :3101, web :3000
pnpm typecheck                          # all three workspaces
```

### Environment variables

`COGNODB_URI`, `COGNODB_USER`, `COGNODB_PASSWORD`, `ANTHROPIC_API_KEY`, `PORT`, `CORS_ORIGIN`,
`NEXT_PUBLIC_API_URL`. Validated by Zod in `apps/api/src/config/env.ts`, which throws a readable
list of problems at boot rather than failing later with `undefined`. Real values live in a
git-ignored `.env`, sourced from `~/.cognodb.env` outside the repo.

### The vertical slice, verified

A Next.js **Server Component** calls the NestJS `/health` endpoint, which pings CognoDB through the
driver. The response is validated against the shared `healthSchema` on the way out of the API *and*
on the way in to the web app, so a drifting contract fails loudly at the boundary.

Rendered output with the database up:

> Database **reachable** · Server Neo4j/5.26.0 · Bolt 5.4 · Latency 1 ms

And with the API stopped:

> Cannot reach the API at http://localhost:3101

That proves the whole chain in both directions: workspace resolution, shared schemas, Nest DI, driver
lifecycle, env loading, CORS, and the failure path.

### Five decisions worth recording

1. **TypeScript pinned to 5.9.3, not 7.0.2.** TS 7's native compiler does not support
   `emitDecoratorMetadata`, which NestJS dependency injection is built on. Not worth discovering
   mid-build on a 48-hour clock.
2. **`packages/shared` ships CommonJS.** NestJS needs CJS plus decorators; Next.js consumes it fine
   through `transpilePackages`. `tsconfig.base.json` therefore carries strictness only — module and
   resolution settings are set per workspace, never inherited.
3. **`ValidationPipe` removed.** It requires `class-validator`, a different validation paradigm from
   the Zod schemas already at the boundary. Running both would mean two sources of truth for one
   contract. Its absence crashed the API on first boot, which is how it was caught.
4. **`loadDotenv()` runs before anything reads `process.env`.** Nest's `ConfigModule` initialises
   after `main.ts` validates the environment, so `.env` files were being ignored — the API only
   worked because the shell happened to have the variables. Now loaded explicitly first.
5. **The API defaults to port 3101, not 3001.** Port 3001 on this machine is held by an unrelated
   long-running service. It was left alone; only our own process was ever stopped. A first probe of
   `:3001/health` returned someone else's JSON, which is a good reminder that a health check passing
   is not proof that *your* service is the one answering.

### Not done — needs your say-so

**The GitHub repository has not been created.** `gh` is authenticated as `suhanda`, so it is one
command away, but creating and pushing a repo is outward-facing and is your call — including whether
it is public or private, and whether `.scratch/` (this wayfinder map and its tickets) ships with it or
is stripped before submission.

**Status: resolved.**
