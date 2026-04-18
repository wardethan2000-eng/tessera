# @familytree/api

Fastify REST API for FamilyTree. Handles authentication, domain routes, and media presigned-URL generation.

---

## Overview

| Item            | Value                        |
|-----------------|------------------------------|
| Runtime         | Node.js ≥ 22                 |
| Framework       | Fastify 5                    |
| Auth            | Better Auth 1.x              |
| Default port    | `4000`                       |
| Auth base path  | `/api/auth/*`                |

---

## Local development

```bash
# From the repo root
pnpm dev:api
```

Or from this directory:

```bash
pnpm dev        # tsx watch — restarts on file changes
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in values before starting:

```bash
cp .env.example .env
```

| Variable            | Default                         | Description                                      |
|---------------------|---------------------------------|--------------------------------------------------|
| `HOST`              | `0.0.0.0`                       | Interface to bind to                             |
| `PORT`              | `4000`                          | Port to listen on                                |
| `DATABASE_URL`      | —                               | Postgres connection string                       |
| `MINIO_ENDPOINT`    | —                               | MinIO hostname or IP                             |
| `MINIO_PORT`        | `9000`                          | MinIO API port                                   |
| `MINIO_ACCESS_KEY`  | —                               | MinIO access key                                 |
| `MINIO_SECRET_KEY`  | —                               | MinIO secret key                                 |
| `BETTER_AUTH_SECRET`| —                               | Random secret for signing tokens (≥ 32 chars)   |
| `API_BASE_URL`      | `http://localhost:3001`         | Public URL of this API (used by Better Auth)     |
| `TRUSTED_ORIGINS`   | `http://localhost:3000`         | Comma-separated list of allowed CORS origins     |
| `SMTP_HOST`         | `localhost`                     | SMTP server hostname                             |
| `SMTP_PORT`         | `1025`                          | SMTP server port (1025 = Mailpit)                |
| `SMTP_FROM`         | `noreply@familytree.local`      | From address for auth emails                     |

Generate a strong `BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 32
```

---

## Authentication

Auth routes are handled by Better Auth at `/api/auth/*`. The handler intercepts requests at the `onRequest` hook before Fastify parses the body, which is required so Better Auth can read the raw request stream.

Supported auth methods:
- **Email + password** — `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`
- **Magic-link** — `POST /api/auth/sign-in/magic-link` (sends an email with a one-time link)
- **Sign out** — `POST /api/auth/sign-out`
- **Session** — `GET /api/auth/get-session`

In development, outbound emails are captured by Mailpit (default: `http://<data-vm>:8025`).

---

## Project structure

```
src/
├── app.ts          Fastify app factory (CORS + auth handler)
├── server.ts       Entry point — binds to HOST:PORT
└── lib/
    ├── auth.ts     Better Auth server instance
    └── db.ts       Drizzle database singleton
```

---

## Build

```bash
pnpm build          # compile TypeScript to dist/
pnpm start          # run compiled output
pnpm typecheck      # type-check without emitting
pnpm lint           # ESLint
```
