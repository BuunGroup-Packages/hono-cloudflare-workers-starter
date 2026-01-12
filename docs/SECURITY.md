# Security Architecture

This document describes the security measures implemented in this Hono API.

## Table of Contents

- [Authentication](#authentication)
  - [JWT Tokens](#jwt-tokens)
  - [API Keys](#api-keys)
- [Password Security](#password-security)
- [Rate Limiting](#rate-limiting)
- [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
- [Audit Logging](#audit-logging)
- [Security Best Practices](#security-best-practices)

---

## Authentication

The API supports two authentication methods:

### JWT Tokens

Used for user sessions (browser apps, mobile apps).

**Token Types:**

| Type | Expiry | Purpose |
|------|--------|---------|
| Access Token | 15 minutes | API request authentication |
| Refresh Token | 7 days | Obtain new access tokens |

**Token Flow:**

```
1. User logs in with email/password
2. Server returns access token + refresh token
3. Client uses access token for API requests
4. When access token expires, use refresh token to get new pair
5. Logout revokes all refresh tokens
```

**Refresh Token Rotation:**

Refresh tokens are rotated on each use:
- Old token is revoked immediately
- New token is issued with same family ID
- If a revoked token is reused, entire token family is invalidated
- This detects and mitigates token theft attacks

**Implementation:** `src/middleware/jwt-auth.ts`

```typescript
// Configuration
const JWT_CONFIG = {
  accessTokenExpiry: 15 * 60,        // 15 minutes
  refreshTokenExpiry: 7 * 24 * 60 * 60, // 7 days
  algorithm: "HS256",
};

// Usage in routes
app.use('/api/protected/*', jwtAuth());
```

### API Keys

Used for server-to-server integration and programmatic access.

**Key Format (Stripe-style):**

| Prefix | Type | Environment |
|--------|------|-------------|
| `sk_live_` | Secret | Production |
| `sk_test_` | Secret | Development |
| `pk_live_` | Public | Production |

**Features:**
- Keys are hashed with SHA-256 before storage
- Only the key prefix is stored for display
- Keys can have scoped permissions
- Optional expiration dates
- Usage tracking (last_used_at)

**Implementation:** `src/middleware/api-key-auth.ts`

```typescript
// Generate a new key
const { key, prefix } = await generateApiKey("secret", true);
// Result: sk_live_abc123...

// Protect routes with API key
app.use('/api/external/*', apiKeyAuth());

// Require specific scopes
app.use('/api/posts/*', apiKeyAuth({ scopes: ['posts:read'] }));
```

**Combined Authentication:**

Accept either JWT or API key:

```typescript
import { combinedAuth } from './middleware/api-key-auth';

app.use('/api/*', combinedAuth());
```

---

## Password Security

Passwords are hashed using **PBKDF2** with SHA-256.

**Configuration:**

| Parameter | Value |
|-----------|-------|
| Algorithm | PBKDF2-SHA256 |
| Iterations | 100,000 |
| Salt Length | 16 bytes |
| Hash Length | 256 bits |

**Implementation:** `src/lib/password.ts`

```typescript
// Hash a password
const hash = await hashPassword("user_password");

// Verify a password
const isValid = await verifyPassword("user_password", storedHash);
```

**Security Features:**
- Random salt per password
- Constant-time comparison to prevent timing attacks
- Web Crypto API for Cloudflare Workers compatibility

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

---

## Rate Limiting

Protects against brute force and DoS attacks.

**Default Limits:**

| Type | Requests | Period |
|------|----------|--------|
| Anonymous | 60 | 1 minute |
| Authenticated | 1,000 | 1 minute |
| Auth endpoints | 5 | 1 minute |
| Write operations | 30 | 1 minute |

**Implementation:** `src/middleware/rate-limiter.ts`

```typescript
// Standard rate limiting
app.use('/api/*', rateLimiter());

// Strict limiting for auth
app.use('/api/auth/*', strictRateLimiter());

// Custom limits
app.use('/api/uploads/*', rateLimiter({ limit: 10, period: 60 }));
```

**Response Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 60
Retry-After: 30  (when limited)
```

**Cloudflare Integration:**

The rate limiter uses the Cloudflare Rate Limiting API when available:

```toml
# wrangler.toml
[[unsafe.bindings]]
name = "RATE_LIMITER"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 100, period = 60 }
```

---

## Role-Based Access Control (RBAC)

Hierarchical role system with inherited permissions.

**Role Hierarchy:**

```
admin
  |- editor
      |- viewer
          |- user
```

Higher roles inherit all permissions from lower roles.

**Implementation:** `src/middleware/rbac.ts`

```typescript
// Require specific role
app.use('/admin/*', requireRole('admin'));

// Accept multiple roles
app.use('/posts/*', requireRole(['admin', 'editor']));

// Check permissions
app.post('/posts', requirePermission('posts:create'));

// Resource ownership
app.put('/users/:id', resourceOwner('id'));

// Conditional by method
app.use('/posts/:id', conditionalPermission({
  GET: 'posts:read',
  PUT: 'posts:update',
  DELETE: 'posts:delete',
}));
```

**Available Scopes:**

| Scope | Description |
|-------|-------------|
| `posts:read` | Read posts |
| `posts:create` | Create posts |
| `posts:update` | Update posts |
| `posts:delete` | Delete posts |

---

## Audit Logging

Comprehensive logging for security-sensitive operations.

**Logged Actions:**

| Category | Actions |
|----------|---------|
| Auth | `login`, `logout`, `login_failed`, `token_refresh`, `password_change` |
| CRUD | `create`, `read`, `update`, `delete` |
| Admin | `user_create`, `user_update`, `user_delete`, `role_change`, `api_key_create`, `api_key_revoke` |

**Log Entry Fields:**

```typescript
interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}
```

**Implementation:** `src/middleware/audit-logger.ts`

```typescript
// Automatic logging middleware
app.use('/admin/*', auditLogger({ resource: 'admin' }));

// Manual logging in handlers
const audit = createAuditLogger(c);
audit.log(AUDIT_ACTIONS.USER_CREATE, 'users', userId, { email });
```

**Sensitive Data Redaction:**

The following fields are automatically redacted in logs:
- `password`, `password_hash`
- `token`, `refresh_token`, `api_key`
- `secret`, `authorization`

**Query Audit Logs:**

```typescript
const logs = await queryAuditLogs(c, {
  userId: 'user-123',
  resource: 'posts',
  action: 'delete',
  startDate: '2025-01-01',
  limit: 100,
});
```

---

## Security Best Practices

### Environment Variables

**Required Secrets:**

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) |

**Generate secure secrets:**

```bash
openssl rand -base64 32
```

### Headers

The API sets appropriate security headers:

- `X-Request-ID` - Unique request identifier for tracing

### Error Handling

- Generic error messages for authentication failures
- No stack traces in production
- Consistent error response format

### Database Security

- Parameterized queries (no SQL injection)
- Password hashes never returned in responses
- API keys hashed before storage

---

## Security Checklist

**Before Production:**

- [ ] Set strong `JWT_SECRET` in production
- [ ] Enable Cloudflare Rate Limiting binding
- [ ] Review and configure rate limits
- [ ] Enable audit logging for sensitive endpoints
- [ ] Set up log monitoring/alerting
- [ ] Configure CORS appropriately
- [ ] Enable HTTPS only

**Ongoing:**

- [ ] Rotate JWT secrets periodically
- [ ] Review audit logs for suspicious activity
- [ ] Monitor rate limit violations
- [ ] Update dependencies regularly
- [ ] Review and revoke unused API keys

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/password.ts` | Password hashing (PBKDF2) |
| `src/schemas/auth.ts` | Input validation schemas |
| `src/middleware/jwt-auth.ts` | JWT token authentication |
| `src/middleware/api-key-auth.ts` | API key authentication |
| `src/middleware/rate-limiter.ts` | Rate limiting |
| `src/middleware/rbac.ts` | Role-based access control |
| `src/middleware/audit-logger.ts` | Audit logging |
| `src/routes/auth.ts` | Authentication endpoints |
