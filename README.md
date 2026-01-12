# Hono + Cloudflare Workers Starter

Production-ready REST API starter with Hono, TypeScript, Zod validation, and D1 database.

## Quick Start

```bash
# Install dependencies
npm install

# Apply database migrations
npm run db:migrate:local

# Start dev server
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

This starter accompanies: [Build a REST API with Hono on Cloudflare Workers](https://buungroup.com/blog/hono-rest-api-cloudflare-workers-tutorial-2026)

## License

MIT
