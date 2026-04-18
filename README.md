# FamilyTree

A private family archive — a living memorial where a family records who its people were, what they made, and how they were connected. Built as a self-hosted web application with a pnpm monorepo.

See [SPEC.md](./SPEC.md) for the full product vision.

---

## Monorepo layout

```
familytree/
├── apps/
│   ├── api/          Fastify REST API (auth, domain routes)
│   └── web/          Next.js frontend
├── packages/
│   ├── database/     Drizzle schema, migrations, Postgres client factory
│   └── typescript-config/  Shared tsconfig presets
├── infra/
│   └── compose/      Docker Compose files for self-hosted data services
├── drizzle/          Generated SQL migrations
├── drizzle.config.ts Drizzle-kit configuration
└── pnpm-workspace.yaml
```

---

## Tech stack

| Layer        | Technology                        |
|--------------|-----------------------------------|
| Frontend     | Next.js 16, React 19, Tailwind 4  |
| API          | Fastify 5, TypeScript             |
| Auth         | Better Auth (email + magic-link)  |
| Database     | Postgres 17, Drizzle ORM          |
| Media        | MinIO (S3-compatible)             |
| Dev email    | Mailpit                           |
| Runtime      | Node.js ≥ 22, pnpm 10            |

---

## Prerequisites

- **Node.js ≥ 22** (`node --version`)
- **pnpm ≥ 10** (`npm i -g pnpm`)
- A running Postgres instance (see [Infrastructure](#infrastructure))
- A running MinIO instance (see [Infrastructure](#infrastructure))

---

## Quick start (local development)

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Copy root environment file and fill in values
cp .env.example .env

# 3. Copy the API environment file and fill in values
cp apps/api/.env.example apps/api/.env

# 4. Copy the web environment file and fill in values
cp apps/web/.env.example apps/web/.env

# 5. Apply the database schema
pnpm db:push          # push schema directly (dev only)
# or apply the versioned migration:
# pnpm db:migrate

# 6. Start both services in parallel
pnpm dev
```

| Service    | Default URL                 |
|------------|-----------------------------|
| Web        | http://localhost:3000       |
| API        | http://localhost:4000       |
| Mailpit UI | http://<data-vm>:8025       |
| MinIO UI   | http://<data-vm>:9001       |

Individual service commands:

```bash
pnpm dev:api     # API only
pnpm dev:web     # web only
```

---

## Infrastructure

The self-hosted layout uses two VMs:

| VM           | Purpose                              | Default IP       |
|--------------|--------------------------------------|------------------|
| `familytree-app`  | Next.js frontend + Fastify API  | 192.168.68.110   |
| `familytree-data` | Postgres, MinIO, Mailpit        | 192.168.68.111   |

### Bring up data services

On the **data VM**, copy the compose env file, fill in secrets, and start the stack:

```bash
cd infra/compose
cp data.env.example .env
# Edit .env — change passwords before exposing to any network
docker compose -f data.compose.yaml --env-file .env up -d
```

Services started:

| Service    | Port(s)        | Purpose                   |
|------------|----------------|---------------------------|
| Postgres   | 5432           | Primary database          |
| MinIO API  | 9000           | Media object storage      |
| MinIO UI   | 9001           | Browser admin console     |
| Mailpit    | 1025 (SMTP)    | Catches outbound email    |
|            | 8025 (HTTP)    | Email inbox UI            |

See [`infra/compose/README.md`](./infra/compose/README.md) for full details.

### Apply database migrations

From the **repo root** (pointing `DATABASE_URL` at the data VM):

```bash
pnpm db:migrate   # apply versioned migrations
# or (dev only, will prompt before destructive changes)
pnpm db:push
```

---

## Environment variables

| File                   | Used by           | Description                        |
|------------------------|-------------------|------------------------------------|
| `.env.example`         | Drizzle CLI       | `DATABASE_URL` for migration tools |
| `apps/api/.env.example`| Fastify API       | All runtime API vars               |
| `apps/web/.env.example`| Next.js web       | Public frontend vars               |
| `infra/compose/data.env.example` | Docker Compose | Data service credentials  |

---

## Database

Schema and migrations live in `packages/database`. See [`packages/database/README.md`](./packages/database/README.md).

```bash
pnpm db:generate   # generate a new migration after schema changes
pnpm db:push       # push schema directly to DB (dev only)
pnpm db:studio     # open Drizzle Studio (browser DB explorer)
```

---

## Authentication

Authentication is handled by [Better Auth](https://better-auth.com) running inside the Fastify API:

- **Email + password** sign-up and sign-in
- **Magic-link** sign-in (passwordless, delivered via email)
- Auth routes are mounted at `/api/auth/*` on the API
- The web client consumes auth via `apps/web/src/lib/auth-client.ts`

In local development, magic-link emails are caught by Mailpit (no real email sent).

---

## Scripts reference

Run from the **repo root** unless noted.

| Command              | Description                                        |
|----------------------|----------------------------------------------------|
| `pnpm dev`           | Start API + web in parallel (watch mode)           |
| `pnpm dev:api`       | Start API only                                     |
| `pnpm dev:web`       | Start web only                                     |
| `pnpm build`         | Production build (database → api → web)            |
| `pnpm typecheck`     | Type-check all packages (builds database types first) |
| `pnpm lint`          | Lint all packages                                  |
| `pnpm db:generate`   | Generate a new Drizzle migration                   |
| `pnpm db:push`       | Push schema to DB without a migration file (dev)   |
| `pnpm db:studio`     | Open Drizzle Studio                                |

---

## Project status

Phase 1 (Keepsake MVP) is under active development. See [SPEC.md](./SPEC.md) for the full roadmap.
