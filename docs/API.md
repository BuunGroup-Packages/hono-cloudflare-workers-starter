# API Documentation

Base URL: `http://localhost:5138` (development) or `https://your-worker.workers.dev` (production)

> **Tip:** Add `| jq` to curl commands for formatted JSON output. Install jq: `brew install jq` or `apt install jq`

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
  "status": "ok"
}
```

---

## Posts

### GET /api/posts

List all posts with pagination.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number (positive integer) |
| `limit` | number | 10 | Items per page (1-100) |
| `published` | string | - | Filter by published status: `"true"` or `"false"` |

**Request:**
```bash
# List all posts
curl -s http://localhost:5138/api/posts | jq

# With pagination
curl -s "http://localhost:5138/api/posts?page=1&limit=5" | jq

# Filter published only
curl -s "http://localhost:5138/api/posts?published=true" | jq
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

### GET /api/posts/:id

Get a single post by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Post UUID |

**Request:**
```bash
curl -s http://localhost:5138/api/posts/550e8400-e29b-41d4-a716-446655440000 | jq
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

**Error Response:** `404 Not Found`
```json
{
  "error": "Post not found"
}
```

---

### POST /api/posts

Create a new post.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Post title (1-200 characters) |
| `body` | string | Yes | Post content (min 1 character) |
| `published` | boolean | No | Published status (default: false) |

**Request:**
```bash
curl -s -X POST http://localhost:5138/api/posts \
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

**Validation Error:** `400 Bad Request`
```json
{
  "error": "Validation failed",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "Title is required",
      "path": ["title"]
    }
  ]
}
```

---

### PUT /api/posts/:id

Update an existing post. All fields are optional (partial update).

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Post UUID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Post title (1-200 characters) |
| `body` | string | No | Post content (min 1 character) |
| `published` | boolean | No | Published status |

**Request:**
```bash
curl -s -X PUT http://localhost:5138/api/posts/YOUR_POST_ID \
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

**Error Response:** `404 Not Found`
```json
{
  "error": "Post not found"
}
```

---

### DELETE /api/posts/:id

Delete a post.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Post UUID |

**Request:**
```bash
curl -s -X DELETE http://localhost:5138/api/posts/YOUR_POST_ID | jq
```

**Response:** `200 OK`
```json
{
  "deleted": true
}
```

**Error Response:** `404 Not Found`
```json
{
  "error": "Post not found"
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
| `404` | Not Found |
| `500` | Internal Server Error |
| `503` | Database Error |

---

## Quick Test (Copy & Paste)

```bash
# 1. Create a post
curl -s -X POST http://localhost:5138/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Post","body":"Test content","published":true}' | jq

# 2. List all posts (copy the ID from step 1)
curl -s http://localhost:5138/api/posts | jq

# 3. Get single post (replace YOUR_ID)
curl -s http://localhost:5138/api/posts/YOUR_ID | jq

# 4. Update post
curl -s -X PUT http://localhost:5138/api/posts/YOUR_ID \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title"}' | jq

# 5. Delete post
curl -s -X DELETE http://localhost:5138/api/posts/YOUR_ID | jq
```
