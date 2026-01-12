# API Documentation

Base URL: `http://localhost:5138` (development) or `https://your-worker.workers.dev` (production)

> **Tip:** Add `| jq` to curl commands for formatted JSON output. Install jq: `brew install jq` or `apt install jq`

## Authentication

This API supports two authentication methods:

1. **JWT Bearer Token** - For user sessions (browser apps, mobile apps)
2. **API Key** - For server-to-server integration

Include in requests:
```bash
# JWT Token
-H "Authorization: Bearer <access_token>"

# OR API Key
-H "X-API-Key: sk_live_..."
```

---

## Health Check

### GET /health

Check if the API is running.

**Request:**
```bash
curl -s http://localhost:5138/health | jq
```

**Response:** `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2026-01-12T10:30:00.000Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Auth Endpoints

### POST /api/auth/register

Create a new user account.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Valid email address |
| `password` | string | Yes | Min 8 chars, 1 uppercase, 1 lowercase, 1 number |

**Request:**
```bash
curl -s -X POST http://localhost:5138/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123"}' | jq
```

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "message": "User created successfully"
}
```

---

### POST /api/auth/login

Authenticate and receive JWT tokens.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User email |
| `password` | string | Yes | User password |

**Request:**
```bash
curl -s -X POST http://localhost:5138/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123"}' | jq
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "role": "user"
  }
}
```

---

### POST /api/auth/refresh

Exchange refresh token for new tokens.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshToken` | string | Yes | Valid refresh token |

**Request:**
```bash
curl -s -X POST http://localhost:5138/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"eyJhbGciOiJIUzI1NiIs..."}' | jq
```

**Response:** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

---

### POST /api/auth/logout (Protected)

Revoke all refresh tokens for the user.

**Request:**
```bash
curl -s -X POST http://localhost:5138/api/auth/logout \
  -H "Authorization: Bearer <access_token>" | jq
```

**Response:** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

---

### GET /api/auth/me (Protected)

Get current user info.

**Request:**
```bash
curl -s http://localhost:5138/api/auth/me \
  -H "Authorization: Bearer <access_token>" | jq
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "role": "user",
  "created_at": "2026-01-12 10:30:00"
}
```

---

### PUT /api/auth/password (Protected)

Change user password.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `currentPassword` | string | Yes | Current password |
| `newPassword` | string | Yes | New password (same requirements as register) |

**Request:**
```bash
curl -s -X PUT http://localhost:5138/api/auth/password \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"SecurePass123","newPassword":"NewSecurePass456"}' | jq
```

**Response:** `200 OK`
```json
{
  "message": "Password updated successfully"
}
```

---

## API Keys

### GET /api/api-keys (Protected)

List user's API keys.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (1-100) |

**Request:**
```bash
curl -s http://localhost:5138/api/api-keys \
  -H "Authorization: Bearer <access_token>" | jq
```

**Response:** `200 OK`
```json
{
  "apiKeys": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "keyPrefix": "sk_live_",
      "name": "Production App",
      "scopes": ["posts:read", "posts:create"],
      "rate_limit": 1000,
      "last_used_at": "2026-01-12 10:30:00",
      "created_at": "2026-01-12 10:00:00"
    }
  ],
  "page": 1,
  "limit": 20
}
```

---

### POST /api/api-keys (Protected)

Create a new API key.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Key name (1-100 chars) |
| `scopes` | string[] | No | Permissions (default: `["posts:read"]`) |
| `expiresInDays` | number | No | Expiration in days (1-365) |

**Available Scopes:**
- `posts:read` - Read posts
- `posts:create` - Create posts
- `posts:update` - Update posts
- `posts:delete` - Delete posts

**Request:**
```bash
curl -s -X POST http://localhost:5138/api/api-keys \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My App","scopes":["posts:read","posts:create"]}' | jq
```

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "key": "sk_live_abc123...",
  "keyPrefix": "sk_live_",
  "name": "My App",
  "scopes": ["posts:read", "posts:create"],
  "expiresAt": null,
  "message": "Store this API key securely. You will not be able to see it again."
}
```

> **Important:** The full API key is only shown once. Store it securely!

---

### DELETE /api/api-keys/:id (Protected)

Revoke an API key.

**Request:**
```bash
curl -s -X DELETE http://localhost:5138/api/api-keys/YOUR_KEY_ID \
  -H "Authorization: Bearer <access_token>" | jq
```

**Response:** `200 OK`
```json
{
  "message": "API key revoked",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Posts

### GET /api/posts (Public)

List all posts with pagination.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (positive integer) |
| `limit` | number | 10 | Items per page (1-100) |
| `published` | string | - | Filter by published status: `"true"` or `"false"` |

**Request:**
```bash
curl -s http://localhost:5138/api/posts | jq
```

**Response:** `200 OK`
```json
{
  "posts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Hello World",
      "body": "My first post content",
      "published": 1,
      "created_at": "2026-01-12 10:30:00",
      "updated_at": "2026-01-12 10:30:00"
    }
  ],
  "page": 1,
  "limit": 10
}
```

---

### GET /api/posts/:id (Public)

Get a single post by ID.

**Request:**
```bash
curl -s http://localhost:5138/api/posts/YOUR_POST_ID | jq
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Hello World",
  "body": "My first post content",
  "published": 1,
  "created_at": "2026-01-12 10:30:00",
  "updated_at": "2026-01-12 10:30:00"
}
```

---

### POST /api/posts (Protected)

Create a new post. Requires authentication.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Post title (1-200 characters) |
| `body` | string | Yes | Post content (min 1 character) |
| `published` | boolean | No | Published status (default: false) |

**Request:**
```bash
curl -s -X POST http://localhost:5138/api/posts \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello World","body":"My first post content","published":true}' | jq
```

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Hello World",
  "body": "My first post content",
  "published": true
}
```

---

### PUT /api/posts/:id (Protected)

Update an existing post. Requires authentication.

**Request:**
```bash
curl -s -X PUT http://localhost:5138/api/posts/YOUR_POST_ID \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title","published":false}' | jq
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Updated Title",
  "published": false
}
```

---

### DELETE /api/posts/:id (Protected)

Delete a post. Requires authentication.

**Request:**
```bash
curl -s -X DELETE http://localhost:5138/api/posts/YOUR_POST_ID \
  -H "Authorization: Bearer <access_token>" | jq
```

**Response:** `200 OK`
```json
{
  "deleted": true
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request (validation error) |
| `401` | Unauthorized (missing/invalid auth) |
| `403` | Forbidden (insufficient permissions) |
| `404` | Not Found |
| `409` | Conflict (e.g., email already exists) |
| `429` | Too Many Requests (rate limited) |
| `500` | Internal Server Error |
| `503` | Database Error |

### Rate Limit Headers

Rate-limited responses include these headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 60
Retry-After: 30
```

---

## Quick Test (Full Flow)

```bash
# 1. Register a user
curl -s -X POST http://localhost:5138/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123"}' | jq

# 2. Login and save token
TOKEN=$(curl -s -X POST http://localhost:5138/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123"}' | jq -r '.accessToken')

# 3. Create a post (authenticated)
curl -s -X POST http://localhost:5138/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"My Post","body":"Hello world!","published":true}' | jq

# 4. Create an API key
curl -s -X POST http://localhost:5138/api/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"CLI App","scopes":["posts:read"]}' | jq

# 5. Use API key to read posts
curl -s http://localhost:5138/api/posts \
  -H "X-API-Key: sk_live_..." | jq
```
