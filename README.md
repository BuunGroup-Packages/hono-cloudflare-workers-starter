<div align="center">

![Buun Group](https://buungroup.com/og-image.png)

# Hono + Cloudflare Workers Starter

Production-ready REST API starter with Hono, TypeScript, Zod validation, and D1 database.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://typescriptlang.org)
[![Hono](https://img.shields.io/badge/Hono-4.7-orange?logo=hono)](https://hono.dev)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Tutorial](https://buungroup.com/blog/hono-rest-api-cloudflare-workers-tutorial-2026) · [Buun Group](https://buungroup.com)

</div>

---

## Quick Start

```bash
git clone https://github.com/BuunGroup-Packages/hono-cloudflare-workers-starter.git
cd hono-cloudflare-workers-starter
npm install
npm run db:migrate:local
npm run dev
```

Server runs at **http://localhost:5138**

> No Cloudflare account needed for local development!

## Test the API

```bash
# Health check
curl -s http://localhost:5138/health | jq

# Create a post
curl -s -X POST http://localhost:5138/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","body":"World","published":true}' | jq

# List posts
curl -s http://localhost:5138/api/posts | jq
```

See [docs/API.md](docs/API.md) for full API documentation.

## Project Structure

```
src/
├── index.ts           # App entry
├── routes/posts.ts    # CRUD handlers
├── schemas/post.ts    # Zod validation
├── middleware/        # Error handling
└── types/bindings.ts  # TypeScript types
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run test` | Run tests |
| `npm run typecheck` | Type check |
| `npm run db:migrate:local` | Apply local migrations |
| `npm run deploy` | Deploy to Cloudflare |

## Deploy to Production

```bash
# Login to Cloudflare
wrangler login

# Create D1 database
npm run db:create
# Copy database_id to wrangler.toml

# Apply migrations
npm run db:migrate:remote

# Deploy
npm run deploy
```

## Tutorial

This starter accompanies: **[Build a REST API with Hono on Cloudflare Workers](https://buungroup.com/blog/hono-rest-api-cloudflare-workers-tutorial-2026)**

## License

MIT © [Buun Group](https://buungroup.com)
