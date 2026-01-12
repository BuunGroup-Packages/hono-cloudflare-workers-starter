import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/bindings";

/**
 * Rate Limiting Configuration
 *
 * Cloudflare Rate Limiting API supports periods of 10 or 60 seconds only.
 * For more granular control, use Durable Objects.
 */
export const RATE_LIMIT_CONFIG = {
  // Default limits
  anonymous: { limit: 60, period: 60 }, // 60 requests per minute
  authenticated: { limit: 1000, period: 60 }, // 1000 requests per minute

  // Endpoint-specific limits
  auth: { limit: 5, period: 60 }, // 5 auth attempts per minute
  write: { limit: 30, period: 60 }, // 30 writes per minute
};

/**
 * Rate Limit Response Headers
 */
interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
}

/**
 * Rate Limiter Middleware using Cloudflare Rate Limiting API
 *
 * Uses the built-in Rate Limiting binding for efficient edge-side limiting.
 * Falls back to allowing requests if rate limiting is not configured.
 *
 * Usage:
 *   app.use('/api/*', rateLimiter())
 *   app.use('/api/auth/*', rateLimiter({ limit: 5, period: 60 }))
 */
export function rateLimiter(options?: { limit?: number; period?: 10 | 60 }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    // Get client identifier (IP or user ID if authenticated)
    const clientId = c.get("userId") || c.req.header("CF-Connecting-IP") || "anonymous";
    const isAuthenticated = !!c.get("userId");

    // Determine rate limit based on authentication status
    const config = isAuthenticated
      ? RATE_LIMIT_CONFIG.authenticated
      : RATE_LIMIT_CONFIG.anonymous;

    const limit = options?.limit ?? config.limit;
    const period = options?.period ?? config.period;

    // Check if Rate Limiting binding is available
    const rateLimiter = c.env.RATE_LIMITER;

    if (!rateLimiter) {
      // Rate limiting not configured - allow request but log warning
      console.warn("Rate limiting not configured - RATE_LIMITER binding missing");
      await next();
      return;
    }

    try {
      // Create a unique key for this client + endpoint
      const key = `${clientId}:${c.req.path}`;

      // Use Cloudflare Rate Limiting API
      const { success } = await rateLimiter.limit({ key });

      if (!success) {
        throw new HTTPException(429, {
          message: "Too many requests. Please try again later.",
        });
      }

      // Add rate limit headers (approximate - actual values require custom tracking)
      c.header("X-RateLimit-Limit", limit.toString());
      c.header("X-RateLimit-Period", `${period}s`);

      await next();
    } catch (error) {
      if (error instanceof HTTPException) throw error;

      // Rate limiter error - allow request but log
      console.error("Rate limiter error:", error);
      await next();
    }
  });
}

/**
 * Sliding Window Rate Limiter using KV Storage
 *
 * Alternative implementation for more granular control.
 * Uses KV for distributed state with sliding window algorithm.
 */
export function kvRateLimiter(options: {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
}) {
  const { limit, windowMs, keyPrefix = "ratelimit" } = options;

  return createMiddleware<AppEnv>(async (c, next) => {
    const kv = c.env.RATE_LIMIT_KV;

    if (!kv) {
      console.warn("KV rate limiting not configured");
      await next();
      return;
    }

    const clientId = c.get("userId") || c.req.header("CF-Connecting-IP") || "anonymous";
    const key = `${keyPrefix}:${clientId}:${c.req.path}`;

    const now = Date.now();
    const windowStart = now - windowMs;

    // Get current window data
    const data = await kv.get(key, "json") as { timestamps: number[] } | null;
    const timestamps = data?.timestamps?.filter((t) => t > windowStart) || [];

    if (timestamps.length >= limit) {
      const resetTime = Math.ceil((timestamps[0] + windowMs - now) / 1000);

      c.header("X-RateLimit-Limit", limit.toString());
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", resetTime.toString());
      c.header("Retry-After", resetTime.toString());

      throw new HTTPException(429, {
        message: "Too many requests. Please try again later.",
      });
    }

    // Add current request
    timestamps.push(now);

    // Store updated timestamps (fire and forget)
    c.executionCtx.waitUntil(
      kv.put(key, JSON.stringify({ timestamps }), {
        expirationTtl: Math.ceil(windowMs / 1000) + 60,
      })
    );

    c.header("X-RateLimit-Limit", limit.toString());
    c.header("X-RateLimit-Remaining", (limit - timestamps.length).toString());
    c.header("X-RateLimit-Reset", Math.ceil(windowMs / 1000).toString());

    await next();
  });
}

/**
 * Strict rate limiter for sensitive endpoints (auth, password reset, etc.)
 */
export function strictRateLimiter() {
  return rateLimiter({
    limit: RATE_LIMIT_CONFIG.auth.limit,
    period: RATE_LIMIT_CONFIG.auth.period as 10 | 60,
  });
}

/**
 * Write rate limiter for mutation endpoints
 */
export function writeRateLimiter() {
  return rateLimiter({
    limit: RATE_LIMIT_CONFIG.write.limit,
    period: RATE_LIMIT_CONFIG.write.period as 10 | 60,
  });
}
