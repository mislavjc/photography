# Photography Portfolio

A personal photography portfolio built with Next.js in a Turborepo monorepo.

## Structure

```
apps/
  web/          # Next.js photography portfolio app
packages/
  eslint-config/       # Shared ESLint configuration
  typescript-config/   # Shared TypeScript configuration
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build all packages
pnpm build

# Run linting
pnpm lint

# Run type checking
pnpm typecheck
```

## Environment Variables

Copy the example environment file in `apps/web`:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Required variables:

- `R2_PUBLIC_URL` - Public URL for Cloudflare R2 storage
- `NEXT_PUBLIC_R2_URL` - Public R2 URL for client-side usage

## Deploy on Vercel

The easiest way to deploy is using the [Vercel Platform](https://vercel.com).
