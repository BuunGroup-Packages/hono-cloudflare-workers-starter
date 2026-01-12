import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { csrf } from "hono/csrf";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "./types/bindings";
import { auth, apiKeys } from "./routes";
import {
  createPostSchema,
  updatePostSchema,
  listPostsQuerySchema,
} from "./schemas";
import {
  errorHandler,
  notFoundHandler,
  rateLimiter,
  combinedAuth,
  auditLogger,
} from "./middleware";

const app = new Hono<AppEnv>();

/**
 * Request ID Middleware
 * Adds unique ID to each request for tracing
 */
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

/**
 * Global Middleware Stack
 */
app.use("*", logger());

// Security headers with API-optimized settings
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: "DENY",
    xContentTypeOptions: "nosniff",
    referrerPolicy: "strict-origin-when-cross-origin",
  })
);

// CORS configuration
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      // Allow specific origins in production
      const allowedOrigins = [
        "https://example.com",
        "https://app.example.com",
      ];

      // Allow localhost in development
      if (origin?.includes("localhost") || origin?.includes("127.0.0.1")) {
        return origin;
      }

      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    exposeHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
  })
);

// CSRF protection for state-changing requests
app.use(
  "/api/*",
  csrf({
    origin: (origin, c) => {
      // Skip CSRF for API key authenticated requests
      if (c.req.header("X-API-Key")) {
        return true;
      }

      // Validate origin for browser requests
      const allowedOrigins = [
        "https://example.com",
        "https://app.example.com",
      ];

      if (origin?.includes("localhost") || origin?.includes("127.0.0.1")) {
        return true;
      }

      return allowedOrigins.includes(origin);
    },
  })
);

// Apply rate limiting to all API routes
app.use("/api/*", rateLimiter());

/**
 * Health Check Endpoint
 * Public - no authentication required
 */
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    requestId: c.get("requestId"),
  });
});

/**
 * Auth Routes (Public)
 */
app.route("/api/auth", auth);

/**
 * Posts Routes
 * - GET endpoints are public
 * - POST/PUT/DELETE require authentication
 */

// GET /api/posts - Public
app.get("/api/posts", zValidator("query", listPostsQuerySchema), async (c) => {
  const { page, limit, published } = c.req.valid("query");
  const offset = (page - 1) * limit;

  let query = "SELECT * FROM posts";
  const params: (string | number)[] = [];

  if (published !== undefined) {
    query += " WHERE published = ?";
    params.push(published === "true" ? 1 : 0);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ posts: results, page, limit });
});

// GET /api/posts/:id - Public
app.get("/api/posts/:id", async (c) => {
  const id = c.req.param("id");

  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?")
    .bind(id)
    .first();

  if (!post) {
    throw new HTTPException(404, { message: "Post not found" });
  }

  return c.json(post);
});

// POST /api/posts - Protected
app.post(
  "/api/posts",
  combinedAuth(),
  auditLogger({ resource: "posts", action: "create" }),
  zValidator("json", createPostSchema),
  async (c) => {
    const data = c.req.valid("json");
    const id = crypto.randomUUID();

    await c.env.DB.prepare(
      "INSERT INTO posts (id, title, body, published) VALUES (?, ?, ?, ?)"
    )
      .bind(id, data.title, data.body, data.published ? 1 : 0)
      .run();

    return c.json({ id, ...data }, 201);
  }
);

// PUT /api/posts/:id - Protected
app.put(
  "/api/posts/:id",
  combinedAuth(),
  auditLogger({ resource: "posts", action: "update" }),
  zValidator("json", updatePostSchema),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const existing = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?")
      .bind(id)
      .first();

    if (!existing) {
      throw new HTTPException(404, { message: "Post not found" });
    }

    await c.env.DB.prepare(
      `UPDATE posts SET title = ?, body = ?, published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(
        data.title ?? existing.title,
        data.body ?? existing.body,
        data.published !== undefined
          ? data.published
            ? 1
            : 0
          : existing.published,
        id
      )
      .run();

    return c.json({ id, ...data });
  }
);

// DELETE /api/posts/:id - Protected
app.delete(
  "/api/posts/:id",
  combinedAuth(),
  auditLogger({ resource: "posts", action: "delete" }),
  async (c) => {
    const id = c.req.param("id");

    const result = await c.env.DB.prepare("DELETE FROM posts WHERE id = ?")
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      throw new HTTPException(404, { message: "Post not found" });
    }

    return c.json({ deleted: true });
  }
);

/**
 * API Keys management (requires auth - handled internally)
 */
app.route("/api/api-keys", apiKeys);

/**
 * Error Handling
 */
app.onError(errorHandler);
app.notFound(notFoundHandler);

export default app;
