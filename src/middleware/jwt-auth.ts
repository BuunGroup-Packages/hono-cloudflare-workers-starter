import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/bindings";

/**
 * JWT Configuration
 *
 * Access tokens: Short-lived (15 minutes) for API requests
 * Refresh tokens: Long-lived (7 days) with rotation for security
 */
export const JWT_CONFIG = {
  accessTokenExpiry: 15 * 60, // 15 minutes in seconds
  refreshTokenExpiry: 7 * 24 * 60 * 60, // 7 days in seconds
  algorithm: "HS256" as const,
};

/**
 * JWT Payload interface
 */
export interface JWTPayload {
  sub: string; // User ID
  email: string;
  role: string;
  type: "access" | "refresh";
  iat: number;
  exp: number;
  [key: string]: unknown; // Index signature for Hono JWT compatibility
}

/**
 * Generate access token for authenticated user
 */
export async function generateAccessToken(
  user: { id: string; email: string; role: string },
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    type: "access",
    iat: now,
    exp: now + JWT_CONFIG.accessTokenExpiry,
  };

  return sign(payload, secret, JWT_CONFIG.algorithm);
}

/**
 * Generate refresh token with family ID for rotation tracking
 */
export async function generateRefreshToken(
  userId: string,
  familyId: string,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    family: familyId,
    type: "refresh",
    iat: now,
    exp: now + JWT_CONFIG.refreshTokenExpiry,
  };

  return sign(payload, secret, JWT_CONFIG.algorithm);
}

/**
 * Hash a token for secure storage using SHA-256
 * Note: JWT refresh tokens have high entropy, so SHA-256 is sufficient
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * JWT Authentication Middleware
 *
 * Validates access tokens and attaches user info to context.
 * Usage: app.use('/protected/*', jwtAuth())
 */
export function jwtAuth() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      throw new HTTPException(401, {
        message: "Missing or invalid Authorization header",
      });
    }

    const token = authHeader.slice(7);
    const secret = c.env.JWT_SECRET;

    if (!secret) {
      console.error("JWT_SECRET not configured");
      throw new HTTPException(500, { message: "Server configuration error" });
    }

    try {
      const payload = (await verify(
        token,
        secret,
        JWT_CONFIG.algorithm
      )) as unknown as JWTPayload;

      // Ensure it's an access token
      if (payload.type !== "access") {
        throw new HTTPException(401, { message: "Invalid token type" });
      }

      // Attach user info to context
      c.set("userId", payload.sub);
      c.set("userEmail", payload.email);
      c.set("userRole", payload.role);

      await next();
    } catch (error) {
      if (error instanceof HTTPException) throw error;

      throw new HTTPException(401, {
        message: "Invalid or expired token",
      });
    }
  });
}

/**
 * Optional JWT Authentication Middleware
 *
 * Like jwtAuth but doesn't fail if no token provided.
 * Useful for endpoints that support both authenticated and anonymous access.
 */
export function optionalJwtAuth() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      // No token - continue as anonymous
      await next();
      return;
    }

    const token = authHeader.slice(7);
    const secret = c.env.JWT_SECRET;

    if (!secret) {
      await next();
      return;
    }

    try {
      const payload = (await verify(
        token,
        secret,
        JWT_CONFIG.algorithm
      )) as unknown as JWTPayload;

      if (payload.type === "access") {
        c.set("userId", payload.sub);
        c.set("userEmail", payload.email);
        c.set("userRole", payload.role);
      }
    } catch {
      // Invalid token - continue as anonymous
    }

    await next();
  });
}
