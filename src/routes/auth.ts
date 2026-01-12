import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../types/bindings";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  jwtAuth,
} from "../middleware/jwt-auth";
import { strictRateLimiter } from "../middleware/rate-limiter";
import { createAuditLogger, AUDIT_ACTIONS } from "../middleware/audit-logger";

const auth = new Hono<AppEnv>();

/**
 * Validation Schemas
 */
const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * Hash password using Web Crypto API
 * Uses PBKDF2 with SHA-256 for password hashing
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  // Combine salt and hash
  const combined = new Uint8Array(salt.length + new Uint8Array(hash).length);
  combined.set(salt);
  combined.set(new Uint8Array(hash), salt.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify password against stored hash
 */
async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  try {
    const combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const originalHash = combined.slice(16);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const hash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

    const newHash = new Uint8Array(hash);

    // Constant-time comparison
    if (newHash.length !== originalHash.length) return false;
    let result = 0;
    for (let i = 0; i < newHash.length; i++) {
      result |= newHash[i] ^ originalHash[i];
    }
    return result === 0;
  } catch {
    return false;
  }
}

/**
 * POST /auth/register - Create new user account
 */
auth.post(
  "/register",
  strictRateLimiter(),
  zValidator("json", registerSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const audit = createAuditLogger(c);

    // Check if user already exists
    const existing = await c.env.DB.prepare(
      "SELECT id FROM users WHERE email = ?"
    )
      .bind(email)
      .first();

    if (existing) {
      throw new HTTPException(409, {
        message: "User with this email already exists",
      });
    }

    // Hash password and create user
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await c.env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)"
    )
      .bind(id, email, passwordHash, "user")
      .run();

    audit.log(AUDIT_ACTIONS.USER_CREATE, "users", id, {
      email,
      role: "user",
    });

    return c.json({ id, email, message: "User created successfully" }, 201);
  }
);

/**
 * POST /auth/login - Authenticate user and return tokens
 */
auth.post(
  "/login",
  strictRateLimiter(),
  zValidator("json", loginSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const audit = createAuditLogger(c);

    // Find user
    const user = await c.env.DB.prepare(
      "SELECT id, email, password_hash, role, is_active FROM users WHERE email = ?"
    )
      .bind(email)
      .first();

    if (!user) {
      audit.log(AUDIT_ACTIONS.LOGIN_FAILED, "auth", undefined, {
        email,
        reason: "user_not_found",
      });
      throw new HTTPException(401, { message: "Invalid credentials" });
    }

    // Check if user is active
    if (!user.is_active) {
      audit.log(AUDIT_ACTIONS.LOGIN_FAILED, "auth", user.id as string, {
        email,
        reason: "account_disabled",
      });
      throw new HTTPException(403, { message: "Account is disabled" });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash as string);

    if (!isValid) {
      audit.log(AUDIT_ACTIONS.LOGIN_FAILED, "auth", user.id as string, {
        email,
        reason: "invalid_password",
      });
      throw new HTTPException(401, { message: "Invalid credentials" });
    }

    // Generate tokens
    const secret = c.env.JWT_SECRET;
    if (!secret) {
      throw new HTTPException(500, { message: "Server configuration error" });
    }

    const accessToken = await generateAccessToken(
      {
        id: user.id as string,
        email: user.email as string,
        role: user.role as string,
      },
      secret
    );

    // Create refresh token with family ID
    const familyId = crypto.randomUUID();
    const refreshToken = await generateRefreshToken(
      user.id as string,
      familyId,
      secret
    );

    // Store refresh token hash
    const refreshTokenHash = await hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await c.env.DB.prepare(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(crypto.randomUUID(), user.id, refreshTokenHash, familyId, expiresAt)
      .run();

    audit.log(AUDIT_ACTIONS.LOGIN, "auth", user.id as string, { email });

    return c.json({
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: 900, // 15 minutes
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  }
);

/**
 * POST /auth/refresh - Exchange refresh token for new access token
 */
auth.post(
  "/refresh",
  strictRateLimiter(),
  zValidator("json", refreshSchema),
  async (c) => {
    const { refreshToken } = c.req.valid("json");
    const audit = createAuditLogger(c);

    const secret = c.env.JWT_SECRET;
    if (!secret) {
      throw new HTTPException(500, { message: "Server configuration error" });
    }

    // Verify and decode refresh token
    const { verify } = await import("hono/jwt");
    let payload;

    try {
      payload = await verify(refreshToken, secret, "HS256");
    } catch {
      throw new HTTPException(401, { message: "Invalid refresh token" });
    }

    if ((payload as { type?: string }).type !== "refresh") {
      throw new HTTPException(401, { message: "Invalid token type" });
    }

    // Find refresh token in database
    const tokenHash = await hashToken(refreshToken);
    const storedToken = await c.env.DB.prepare(
      `
      SELECT rt.*, u.email, u.role, u.is_active
      FROM refresh_tokens rt
      JOIN users u ON rt.user_id = u.id
      WHERE rt.token_hash = ?
        AND rt.revoked_at IS NULL
        AND rt.expires_at > datetime('now')
    `
    )
      .bind(tokenHash)
      .first();

    if (!storedToken) {
      // Token not found or revoked - possible token reuse attack
      // Revoke all tokens in this family
      if (payload.family) {
        await c.env.DB.prepare(
          "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE family_id = ?"
        )
          .bind(payload.family)
          .run();

        audit.log(AUDIT_ACTIONS.TOKEN_REFRESH, "auth", payload.sub as string, {
          reason: "token_reuse_detected",
          family_id: payload.family,
        });
      }

      throw new HTTPException(401, {
        message: "Invalid or revoked refresh token",
      });
    }

    if (!storedToken.is_active) {
      throw new HTTPException(403, { message: "Account is disabled" });
    }

    // Revoke old refresh token
    await c.env.DB.prepare(
      "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?"
    )
      .bind(storedToken.id)
      .run();

    // Generate new tokens with same family ID (rotation)
    const accessToken = await generateAccessToken(
      {
        id: storedToken.user_id as string,
        email: storedToken.email as string,
        role: storedToken.role as string,
      },
      secret
    );

    const newRefreshToken = await generateRefreshToken(
      storedToken.user_id as string,
      storedToken.family_id as string,
      secret
    );

    // Store new refresh token
    const newTokenHash = await hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await c.env.DB.prepare(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(
        crypto.randomUUID(),
        storedToken.user_id,
        newTokenHash,
        storedToken.family_id,
        expiresAt
      )
      .run();

    audit.log(AUDIT_ACTIONS.TOKEN_REFRESH, "auth", storedToken.user_id as string);

    return c.json({
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      expiresIn: 900,
    });
  }
);

/**
 * POST /auth/logout - Revoke refresh token family
 */
auth.post("/logout", jwtAuth(), async (c) => {
  const userId = c.get("userId");
  const audit = createAuditLogger(c);

  // Revoke all refresh tokens for this user
  await c.env.DB.prepare(
    "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL"
  )
    .bind(userId)
    .run();

  audit.log(AUDIT_ACTIONS.LOGOUT, "auth", userId);

  return c.json({ message: "Logged out successfully" });
});

/**
 * GET /auth/me - Get current user info
 */
auth.get("/me", jwtAuth(), async (c) => {
  const userId = c.get("userId");

  const user = await c.env.DB.prepare(
    "SELECT id, email, role, created_at FROM users WHERE id = ?"
  )
    .bind(userId)
    .first();

  if (!user) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json(user);
});

/**
 * PUT /auth/password - Change password
 */
auth.put(
  "/password",
  jwtAuth(),
  zValidator(
    "json",
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z
        .string()
        .min(8)
        .regex(/[A-Z]/)
        .regex(/[a-z]/)
        .regex(/[0-9]/),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const { currentPassword, newPassword } = c.req.valid("json");
    const audit = createAuditLogger(c);

    const user = await c.env.DB.prepare(
      "SELECT password_hash FROM users WHERE id = ?"
    )
      .bind(userId)
      .first();

    if (!user) {
      throw new HTTPException(404, { message: "User not found" });
    }

    // Verify current password
    const isValid = await verifyPassword(
      currentPassword,
      user.password_hash as string
    );

    if (!isValid) {
      throw new HTTPException(401, { message: "Current password is incorrect" });
    }

    // Update password
    const newHash = await hashPassword(newPassword);

    await c.env.DB.prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
    )
      .bind(newHash, userId)
      .run();

    // Revoke all refresh tokens (force re-login)
    await c.env.DB.prepare(
      "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ?"
    )
      .bind(userId)
      .run();

    audit.log(AUDIT_ACTIONS.PASSWORD_CHANGE, "auth", userId);

    return c.json({ message: "Password updated successfully" });
  }
);

export { auth };
