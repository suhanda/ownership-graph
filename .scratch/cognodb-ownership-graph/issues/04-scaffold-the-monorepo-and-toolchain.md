# Scaffold the monorepo and toolchain

Type: task
Status: claimed

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
