# FamilyTree

A private family archive application built as a monorepo with separate web and API services.

## Workspace

- `apps/web` — Next.js frontend
- `apps/api` — Fastify API
- `packages/typescript-config` — shared TypeScript configuration
- `infra/compose` — self-hosting compose files for foundational services

## Local development

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Start the app and API:
   ```bash
   pnpm dev
   ```

The web app runs on port `3000` and the API runs on port `4000` by default.

## Infrastructure

The initial self-hosted layout assumes:

- **App VM** — Next.js frontend and Fastify API
- **Data VM** — Postgres and MinIO

Use the compose file in `infra/compose/data.compose.yaml` to bring up the data services on the data VM.
