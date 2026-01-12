<div align="center">

![Buun Group](https://buungroup.com/og-image.png)

# Hono + Cloudflare Workers Starter

Production-ready REST API with JWT auth, API keys, RBAC, rate limiting, and audit logging.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://typescriptlang.org)
[![Hono](https://img.shields.io/badge/Hono-4.7-orange?logo=hono)](https://hono.dev)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Tutorial Part 1](https://buungroup.com/blog/hono-rest-api-cloudflare-workers-tutorial-2026) · [Tutorial Part 2](https://buungroup.com/blog/hono-api-security-tutorial-2026) · [Buun Group](https://buungroup.com)

</div>

---

## Features

- **JWT Authentication** - Access/refresh tokens with rotation
- **API Key Auth** - Stripe-style keys with scopes
- **RBAC** - Role-based access control (admin/editor/viewer)
- **Rate Limiting** - Per-user and per-endpoint limits
- **Audit Logging** - Non-blocking with `waitUntil`
- **Security Headers** - HSTS, CSP, XSS protection
- **Zod Validation** - Type-safe request validation

## Quick Start

```bash
git clone https://github.com/BuunGroup-Packages/hono-cloudflare-workers-starter.git
cd hono-cloudflare-workers-starter
npm install
npm run db:migrate:local
npm run dev
```

Server runs at **http://localhost:5138**

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get tokens |
| POST | `/api/auth/refresh` | Refresh tokens |
| GET | `/api/posts` | List posts |
| GET | `/api/posts/:id` | Get post |

### Protected (JWT or API Key)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/logout` | Revoke tokens |
| GET | `/api/auth/me` | Current user |
| PUT | `/api/auth/password` | Change password |
| POST | `/api/posts` | Create post |
| PUT | `/api/posts/:id` | Update post |
| DELETE | `/api/posts/:id` | Delete post |
| GET | `/api/api-keys` | List API keys |
| POST | `/api/api-keys` | Create API key |
| DELETE | `/api/api-keys/:id` | Revoke API key |

## Authentication

### JWT Tokens

```bash
# Register
curl -X POST http://localhost:5138/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123"}'

# Login
curl -X POST http://localhost:5138/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123"}'

# Use token
curl http://localhost:5138/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

### API Keys

```bash
# Create API key (requires JWT auth)
curl -X POST http://localhost:5138/api/api-keys \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My App","scopes":["posts:read","posts:create"]}'

# Use API key
curl http://localhost:5138/api/posts \
  -H "X-API-Key: sk_live_..."
```

## Project Structure

```
src/
├── index.ts              # App entry with middleware
├── routes/
│   ├── auth.ts           # Authentication routes
│   ├── posts.ts          # CRUD routes
│   └── api-keys.ts       # API key management
├── middleware/
│   ├── jwt-auth.ts       # JWT authentication
│   ├── api-key-auth.ts   # API key authentication
│   ├── rate-limiter.ts   # Rate limiting
│   ├── rbac.ts           # Role-based access
│   ├── audit-logger.ts   # Audit logging
│   └── error-handler.ts  # Error handling
├── schemas/              # Zod validation
└── types/bindings.ts     # TypeScript types

migrations/
├── 0001_create_posts.sql
└── 0002_create_auth_tables.sql
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run test` | Run tests |
| `npm run typecheck` | Type check |
| `npm run db:migrate:local` | Apply all local migrations |
| `npm run db:migrate:remote` | Apply all remote migrations |
| `npm run secret:jwt` | Set JWT secret |
| `npm run deploy` | Deploy to Cloudflare |

## Deploy to Production

```bash
# Login to Cloudflare
wrangler login

# Create D1 database
npm run db:create
# Copy database_id to wrangler.toml

# Set JWT secret
npm run secret:jwt
# Enter a secure random string (32+ chars)

# Apply migrations
npm run db:migrate:remote

# Deploy
npm run deploy
```

## Security Features

### JWT Token Rotation

- 15-minute access tokens
- 7-day refresh tokens with family tracking
- Automatic invalidation on token reuse (prevents replay attacks)

### Password Hashing

- PBKDF2 with SHA-256 (100k iterations)
- Per-user random salt
- Constant-time comparison

### API Key Security

- SHA-256 hashing (high-entropy keys don't need slow hashing)
- Stripe-style prefixes (`sk_live_`, `sk_test_`)
- Scope-based permissions

### Rate Limiting

- Configurable per-endpoint limits
- Cloudflare Rate Limiting API or KV fallback
- Stricter limits for auth endpoints (5/min)

## Tutorials

This starter accompanies:
- **Part 1**: [Build a REST API with Hono](https://buungroup.com/blog/hono-rest-api-cloudflare-workers-tutorial-2026)
- **Part 2**: [Secure Your Hono API](https://buungroup.com/blog/hono-api-security-tutorial-2026)

## License

MIT © [Buun Group](https://buungroup.com)
