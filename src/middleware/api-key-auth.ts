import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/bindings";

/**
 * API Key Configuration
 *
 * Keys follow Stripe-style format: prefix_randomchars
 * - sk_live_ : Production secret keys
 * - sk_test_ : Test/development keys
 * - pk_live_ : Public keys (if needed)
 */
export const API_KEY_PREFIX = {
  secretLive: "sk_live_",
  secretTest: "sk_test_",
  publicLive: "pk_live_",
};

/**
 * Generate a new API key with Stripe-style prefix
 */
export async function generateApiKey(
  type: "secret" | "public" = "secret",
  isLive: boolean = true
): Promise<{ key: string; prefix: string }> {
  const prefix =
    type === "secret"
      ? isLive
        ? API_KEY_PREFIX.secretLive
        : API_KEY_PREFIX.secretTest
      : API_KEY_PREFIX.publicLive;

  // Generate 32 bytes of random data
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);

  // Convert to URL-safe base64
  const randomPart = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return {
    key: `${prefix}${randomPart}`,
    prefix: prefix,
  };
}

/**
 * Hash an API key for secure storage using SHA-256
 * Note: API keys have high entropy (256 bits), so fast hashing is secure
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract prefix from API key for database lookup
 */
export function extractKeyPrefix(key: string): string | null {
  for (const prefix of Object.values(API_KEY_PREFIX)) {
    if (key.startsWith(prefix)) {
      return prefix;
    }
  }
  return null;
}

/**
 * API Key Scope definition
 */
export interface ApiKeyScope {
  resource: string;
  actions: string[];
}

/**
 * API Key Authentication Middleware
 *
 * Validates API keys from X-API-Key header.
 * Usage: app.use('/api/*', apiKeyAuth())
 *
 * Optional: Pass required scopes to restrict access
 * Usage: app.use('/api/posts/*', apiKeyAuth({ scopes: ['posts:read', 'posts:write'] }))
 */
export function apiKeyAuth(options?: { scopes?: string[] }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const apiKey = c.req.header("X-API-Key");

    if (!apiKey) {
      throw new HTTPException(401, {
        message: "Missing X-API-Key header",
      });
    }

    const prefix = extractKeyPrefix(apiKey);
    if (!prefix) {
      throw new HTTPException(401, {
        message: "Invalid API key format",
      });
    }

    // Hash the key and look up in database
    const keyHash = await hashApiKey(apiKey);

    const keyRecord = await c.env.DB.prepare(
      `
      SELECT ak.*, u.id as user_id, u.email, u.role, u.is_active
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = ?
        AND ak.revoked_at IS NULL
        AND (ak.expires_at IS NULL OR ak.expires_at > datetime('now'))
    `
    )
      .bind(keyHash)
      .first();

    if (!keyRecord) {
      throw new HTTPException(401, {
        message: "Invalid or expired API key",
      });
    }

    // Check if user is active
    if (!keyRecord.is_active) {
      throw new HTTPException(403, {
        message: "User account is disabled",
      });
    }

    // Check scopes if required
    if (options?.scopes && options.scopes.length > 0) {
      const keyScopes: string[] = JSON.parse(
        (keyRecord.scopes as string) || "[]"
      );
      const hasAllScopes = options.scopes.every((scope) =>
        keyScopes.includes(scope)
      );

      if (!hasAllScopes) {
        throw new HTTPException(403, {
          message: "Insufficient API key permissions",
        });
      }
    }

    // Update last used timestamp (fire and forget)
    const updatePromise = c.env.DB.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?")
      .bind(keyRecord.id)
      .run();

    try {
      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil(updatePromise);
      } else {
        // In test environment, fire and forget
        updatePromise.catch(() => {});
      }
    } catch {
      // ExecutionContext not available
      updatePromise.catch(() => {});
    }

    // Attach user info to context
    c.set("userId", keyRecord.user_id as string);
    c.set("userEmail", keyRecord.email as string);
    c.set("userRole", keyRecord.role as string);
    c.set("apiKeyId", keyRecord.id as string);
    c.set("apiKeyScopes", JSON.parse((keyRecord.scopes as string) || "[]"));

    await next();
  });
}

/**
 * Combined Authentication Middleware
 *
 * Accepts either JWT Bearer token OR API key.
 * Tries JWT first, falls back to API key.
 */
export function combinedAuth() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const apiKey = c.req.header("X-API-Key");

    if (authHeader?.startsWith("Bearer ")) {
      // Import and use JWT auth
      const { jwtAuth } = await import("./jwt-auth");
      const jwtMiddleware = jwtAuth();
      return jwtMiddleware(c, next);
    }

    if (apiKey) {
      const apiKeyMiddleware = apiKeyAuth();
      return apiKeyMiddleware(c, next);
    }

    throw new HTTPException(401, {
      message: "Authentication required. Provide Bearer token or X-API-Key",
    });
  });
}
