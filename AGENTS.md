# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a **pnpm monorepo** (Turborepo) for a personal photo archive web app. Key packages:

- `apps/web` — Next.js 16 app (main product, port 3000)
- `apps/cli` — Photo processing CLI (offline tooling, not needed at runtime)
- `apps/search-worker` — Cloudflare Worker for semantic search (deployed remotely)
- `packages/eslint-config`, `packages/typescript-config` — Shared configs

### Standard commands

See `README.md` "Getting Started" section. Quick reference:

| Task | Command |
|---|---|
| Dev server | `PORTLESS=0 pnpm --filter web dev` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |

### Non-obvious caveats

- **`portless` in `pnpm dev`**: The root `dev` script uses `portless` to assign a `.localhost` URL. In cloud/CI environments, bypass it with `PORTLESS=0 pnpm --filter web dev` or run `pnpm --filter web dev` directly.
- **Native dependency builds**: After `pnpm install`, you may need `pnpm rebuild esbuild sharp unrs-resolver workerd` if the install warning says build scripts were ignored.
- **No local database**: The app fetches a JSON manifest from a remote Cloudflare R2 bucket. Without valid `R2_PUBLIC_URL` / `NEXT_PUBLIC_R2_URL` in `apps/web/.env.local`, the app runs but shows no photos. Copy `.env.example` to `.env.local` and fill in values if available.
- **Pre-existing lint/typecheck issues**: The repo has formatting errors in test files (lint) and strict-null issues in `apps/search-worker` (typecheck). These are pre-existing and do not block development or testing.
- **Map page requires Mapbox token**: Set `NEXT_PUBLIC_MAPBOX_TOKEN` in `apps/web/.env.local` to enable the map view.
- **Husky commit-msg hook**: Uses commitlint with conventional commits. Commit messages must follow the `type(scope): message` format.
