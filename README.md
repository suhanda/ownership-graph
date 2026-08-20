# Ownership Graph

Trace who really owns a company, through every layer of holding companies, trusts and nominees.

Built on **CognoDB** (openCypher over Bolt), a **NestJS** API and a **Next.js** front end.

> This README is a scaffold stub. The full write-up — the use case, "Why a graph database?", the data
> model diagram, the queries explained and screenshots — is written once the app is complete.

## Domain vocabulary

See [`CONTEXT.md`](./CONTEXT.md). The terms there are used consistently in code, UI copy and queries.

## Prerequisites

- Node 20+ and pnpm
- A free CognoDB `c0` instance from https://console.cognodb.com/signup

## Setup

```bash
pnpm install
cp .env.example .env      # then fill in COGNODB_URI and COGNODB_PASSWORD
pnpm --filter @ownership/shared build
```

The CognoDB console issues a URI of the form `bolt+s://<instance-id>.<region>.databases.cognodb.com`.
The password is shown exactly once when the instance is created.

Secrets are read from the environment only. `.env` is git-ignored and must never be committed.

## Run

```bash
pnpm dev        # API on :3101, web on :3000
```

Open http://localhost:3000. The page reports the live database connection, so a misconfigured
instance is visible immediately rather than at the first query.

## Layout

```
apps/api        NestJS — CognoDB driver, parameterised Cypher, chat
apps/web        Next.js App Router — graph explorer and chat UI
packages/shared Zod schemas and inferred types shared across the boundary
```
