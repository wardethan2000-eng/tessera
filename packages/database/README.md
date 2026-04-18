# @familytree/database

Drizzle ORM schema, SQL migrations, and the Postgres client factory for FamilyTree. All other packages that need database access import from here.

---

## Overview

| Item          | Value                                |
|---------------|--------------------------------------|
| ORM           | Drizzle ORM 0.44+                    |
| Driver        | `pg` (node-postgres)                 |
| Database      | Postgres 17                          |
| Migrations    | `drizzle/` directory at repo root    |

---

## Schema

All tables are defined in `src/schema.ts`.

### Auth tables (managed by Better Auth)

These tables are created and maintained by [Better Auth](https://better-auth.com). Their primary keys are `text` (Better Auth generates its own nanoid-style IDs — not UUIDs).

| Table           | Purpose                                       |
|-----------------|-----------------------------------------------|
| `users`         | Registered user accounts                      |
| `sessions`      | Active login sessions                         |
| `accounts`      | Auth provider/credential records per user     |
| `verifications` | One-time tokens (magic-link, email verify)    |

### Domain tables

Domain-owned tables use `uuid` primary keys with `defaultRandom()`. All user foreign keys reference `users.id` as `text`.

| Table              | Purpose                                            |
|--------------------|----------------------------------------------------|
| `trees`            | A family archive tree (one per family)             |
| `tree_memberships` | Users belonging to a tree with a role              |
| `people`           | Person nodes in the tree                           |
| `relationships`    | Typed connections between people                   |
| `media`            | Media objects stored in MinIO (portraits, photos)  |
| `memories`         | Stories and photographs attached to a person       |
| `memory_media`     | Many-to-many join of memories and media            |
| `invitations`      | Email invitations to join a tree                   |
| `archive_exports`  | Export jobs (ZIP + offline HTML viewer)            |

### Enums

| Enum                  | Values                                               |
|-----------------------|------------------------------------------------------|
| `membership_role`     | `founder`, `steward`, `contributor`, `viewer`        |
| `relationship_type`   | `parent_child`, `sibling`, `spouse`                  |
| `memory_kind`         | `story`, `photo`                                     |
| `invitation_status`   | `pending`, `accepted`, `expired`, `revoked`          |
| `export_status`       | `queued`, `running`, `completed`, `failed`           |

---

## Client factory

`src/client.ts` exports `createDb(connectionString)`, which creates a `pg` Pool and returns a typed Drizzle instance:

```ts
import { createDb } from "@familytree/database";

const db = createDb(process.env.DATABASE_URL!);
```

The returned `db` value is fully typed against all schema tables.

---

## Migration workflow

Migrations are generated with Drizzle Kit and stored in `drizzle/` at the repo root.

### Generate a new migration

After modifying `src/schema.ts`:

```bash
# From repo root
pnpm db:generate
```

This creates a new SQL file in `drizzle/`.

### Apply migrations

```bash
# Apply all pending migrations (uses DATABASE_URL from .env)
pnpm db:migrate

# Push schema directly without migration files (dev only — skips migration history)
pnpm db:push
```

Both commands read `DATABASE_URL` from the root `.env` file.

### Drizzle Studio

```bash
pnpm db:studio
```

Opens a browser-based database explorer connected to `DATABASE_URL`.

---

## Build

This package must be built before any other package can import its types:

```bash
pnpm build      # compile TypeScript to dist/ (required for project references)
pnpm typecheck  # type-check without emitting
pnpm lint       # ESLint
```

The root `pnpm build` and `pnpm typecheck` scripts handle this ordering automatically.

---

## Notes on Better Auth ID types

Better Auth generates its own string IDs (nanoid-style) for `users`, `sessions`, `accounts`, and `verifications`. These tables use `text` primary keys. **Do not change these to `uuid` or `serial`** — the auth adapter will break.

Domain tables (`trees`, `people`, etc.) use `uuid` PKs and text FK columns when referencing `users.id`.
