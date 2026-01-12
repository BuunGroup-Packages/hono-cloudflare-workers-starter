import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../types/bindings";
import { jwtAuth } from "../middleware/jwt-auth";
import { requireRole } from "../middleware/rbac";
import { generateApiKey, hashApiKey } from "../middleware/api-key-auth";
import { createAuditLogger, AUDIT_ACTIONS } from "../middleware/audit-logger";

const apiKeys = new Hono<AppEnv>();

/**
 * All API key routes require JWT authentication
 */
apiKeys.use("*", jwtAuth());

/**
 * Validation Schemas
 */
const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  scopes: z
    .array(z.string())
    .default(["posts:read"])
    .describe("API key permissions"),
  expiresInDays: z.number().min(1).max(365).optional(),
});

const listApiKeysSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * GET /api-keys - List user's API keys
 */
apiKeys.get("/", zValidator("query", listApiKeysSchema), async (c) => {
  const userId = c.get("userId");
  const { page, limit } = c.req.valid("query");
  const offset = (page - 1) * limit;

  const { results } = await c.env.DB.prepare(
    `
    SELECT id, key_prefix, name, scopes, rate_limit, last_used_at, expires_at, created_at
    FROM api_keys
    WHERE user_id = ? AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `
  )
    .bind(userId, limit, offset)
    .all();

  // Parse scopes JSON for each key
  const keys = (results || []).map((key) => ({
    ...key,
    scopes: JSON.parse((key.scopes as string) || "[]"),
  }));

  return c.json({ apiKeys: keys, page, limit });
});

/**
 * POST /api-keys - Create new API key
 *
 * Returns the full key only once. Store it securely!
 */
apiKeys.post("/", zValidator("json", createApiKeySchema), async (c) => {
  const userId = c.get("userId");
  const { name, scopes, expiresInDays } = c.req.valid("json");
  const audit = createAuditLogger(c);

  // Generate new API key
  const { key, prefix } = await generateApiKey("secret", true);
  const keyHash = await hashApiKey(key);
  const id = crypto.randomUUID();

  // Calculate expiry
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await c.env.DB.prepare(
    `
    INSERT INTO api_keys (id, user_id, key_prefix, key_hash, name, scopes, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  )
    .bind(id, userId, prefix, keyHash, name, JSON.stringify(scopes), expiresAt)
    .run();

  audit.log(AUDIT_ACTIONS.API_KEY_CREATE, "api_keys", id, {
    name,
    scopes,
  });

  return c.json(
    {
      id,
      key, // Full key - only shown once!
      keyPrefix: prefix,
      name,
      scopes,
      expiresAt,
      message:
        "Store this API key securely. You will not be able to see it again.",
    },
    201
  );
});

/**
 * GET /api-keys/:id - Get API key details
 */
apiKeys.get("/:id", async (c) => {
  const userId = c.get("userId");
  const userRole = c.get("userRole");
  const keyId = c.req.param("id");

  let query = `
    SELECT id, user_id, key_prefix, name, scopes, rate_limit, last_used_at, expires_at, created_at
    FROM api_keys
    WHERE id = ? AND revoked_at IS NULL
  `;

  // Non-admins can only see their own keys
  if (userRole !== "admin") {
    query += " AND user_id = ?";
  }

  const key = await c.env.DB.prepare(query)
    .bind(...(userRole === "admin" ? [keyId] : [keyId, userId]))
    .first();

  if (!key) {
    throw new HTTPException(404, { message: "API key not found" });
  }

  return c.json({
    ...key,
    scopes: JSON.parse((key.scopes as string) || "[]"),
  });
});

/**
 * PUT /api-keys/:id - Update API key
 */
apiKeys.put(
  "/:id",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100).optional(),
      scopes: z.array(z.string()).optional(),
      rateLimit: z.number().min(1).max(10000).optional(),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const userRole = c.get("userRole");
    const keyId = c.req.param("id");
    const data = c.req.valid("json");
    const audit = createAuditLogger(c);

    // Check ownership
    const existing = await c.env.DB.prepare(
      "SELECT user_id FROM api_keys WHERE id = ? AND revoked_at IS NULL"
    )
      .bind(keyId)
      .first();

    if (!existing) {
      throw new HTTPException(404, { message: "API key not found" });
    }

    if (existing.user_id !== userId && userRole !== "admin") {
      throw new HTTPException(403, {
        message: "You can only update your own API keys",
      });
    }

    // Build update query
    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (data.name) {
      updates.push("name = ?");
      params.push(data.name);
    }

    if (data.scopes) {
      updates.push("scopes = ?");
      params.push(JSON.stringify(data.scopes));
    }

    if (data.rateLimit) {
      updates.push("rate_limit = ?");
      params.push(data.rateLimit);
    }

    if (updates.length === 0) {
      throw new HTTPException(400, { message: "No fields to update" });
    }

    params.push(keyId);

    await c.env.DB.prepare(
      `UPDATE api_keys SET ${updates.join(", ")} WHERE id = ?`
    )
      .bind(...params)
      .run();

    audit.log(AUDIT_ACTIONS.API_KEY_CREATE, "api_keys", keyId, data);

    return c.json({ message: "API key updated", id: keyId });
  }
);

/**
 * DELETE /api-keys/:id - Revoke API key
 */
apiKeys.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const userRole = c.get("userRole");
  const keyId = c.req.param("id");
  const audit = createAuditLogger(c);

  // Check ownership
  const existing = await c.env.DB.prepare(
    "SELECT user_id FROM api_keys WHERE id = ? AND revoked_at IS NULL"
  )
    .bind(keyId)
    .first();

  if (!existing) {
    throw new HTTPException(404, { message: "API key not found" });
  }

  if (existing.user_id !== userId && userRole !== "admin") {
    throw new HTTPException(403, {
      message: "You can only revoke your own API keys",
    });
  }

  // Soft delete (revoke)
  await c.env.DB.prepare(
    "UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?"
  )
    .bind(keyId)
    .run();

  audit.log(AUDIT_ACTIONS.API_KEY_REVOKE, "api_keys", keyId);

  return c.json({ message: "API key revoked", id: keyId });
});

/**
 * Admin Routes
 */

/**
 * GET /api-keys/admin/all - List all API keys (admin only)
 */
apiKeys.get("/admin/all", requireRole("admin"), async (c) => {
  const { results } = await c.env.DB.prepare(
    `
    SELECT ak.id, ak.key_prefix, ak.name, ak.scopes, ak.last_used_at, ak.created_at,
           u.email as user_email
    FROM api_keys ak
    JOIN users u ON ak.user_id = u.id
    WHERE ak.revoked_at IS NULL
    ORDER BY ak.created_at DESC
    LIMIT 100
  `
  ).all();

  const keys = (results || []).map((key) => ({
    ...key,
    scopes: JSON.parse((key.scopes as string) || "[]"),
  }));

  return c.json({ apiKeys: keys });
});

export { apiKeys };
