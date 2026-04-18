# @familytree/web

Next.js frontend for FamilyTree. Renders the family archive UI and communicates with the Fastify API for all data and auth operations.

---

## Overview

| Item            | Value                        |
|-----------------|------------------------------|
| Framework       | Next.js 16 (App Router)      |
| Language        | TypeScript, React 19         |
| Styling         | Tailwind CSS 4               |
| Auth client     | Better Auth React client     |
| Default port    | `3000`                       |

---

## Local development

```bash
# From the repo root
pnpm dev:web
```

Or from this directory:

```bash
pnpm dev
```

The app is available at http://localhost:3000.

> The API must also be running (default: http://localhost:4000). Use `pnpm dev` from the repo root to start both in parallel.

---

## Environment variables

Copy `.env.example` to `.env.local` and update values:

```bash
cp .env.example .env.local
```

| Variable                | Default                   | Description                             |
|-------------------------|---------------------------|-----------------------------------------|
| `NEXT_PUBLIC_API_URL`   | `http://localhost:4000`   | Public URL of the Fastify API           |

`NEXT_PUBLIC_` prefix is required — Next.js only exposes variables with this prefix to the browser bundle.

---

## Authentication

Auth state is managed by the Better Auth React client (`src/lib/auth-client.ts`). Use the exported hooks and helpers:

```ts
import { signIn, signUp, signOut, useSession } from "@/lib/auth-client";

// Magic-link sign-in
await signIn.magicLink({ email: "user@example.com" });

// Email + password sign-in
await signIn.email({ email, password });

// Current session (React hook)
const { data: session } = useSession();
```

All auth requests are proxied to `NEXT_PUBLIC_API_URL/api/auth/*`.

---

## Project structure

```
src/
├── app/            Next.js App Router pages and layouts
└── lib/
    └── auth-client.ts  Better Auth React client (hooks + helpers)
```

---

## Build

```bash
pnpm build          # production Next.js build
pnpm start          # serve production build
pnpm typecheck      # type-check without emitting
pnpm lint           # ESLint (next lint)
```
