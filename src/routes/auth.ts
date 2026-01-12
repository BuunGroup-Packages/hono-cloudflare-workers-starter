/**
 * Auth Routes
 *
 * Handles user authentication: registration, login, logout, token refresh.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { verify } from "hono/jwt";

import type { AppEnv } from "../types/bindings";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
} from "../schemas/auth";
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
 * POST /auth/register
 * Create a new user account
 */
auth.post(
  "/register",
  strictRateLimiter(),
  zValidator("json", registerSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const audit = createAuditLogger(c);

    // Check for existing user
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

    // Create user
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await c.env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)"
    )
      .bind(id, email, passwordHash, "user")
      .run();

    audit.log(AUDIT_ACTIONS.USER_CREATE, "users", id, { email, role: "user" });

    return c.json({ id, email, message: "User created successfully" }, 201);
  }
);

/**
 * POST /auth/login
 * Authenticate user and return JWT tokens
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

    // Check account status
    if (!user.is_active) {
      audit.log(AUDIT_ACTIONS.LOGIN_FAILED, "auth", user.id as string, {
        email,
        reason: "account_disabled",
      });
      throw new HTTPException(403, { message: "Account is disabled" });
    }

    // Verify password
    const isValid = await verifyPassword(
      password,
      user.password_hash as string
    );

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

    const familyId = crypto.randomUUID();
    const refreshToken = await generateRefreshToken(
      user.id as string,
      familyId,
      secret
    );

    // Store refresh token
    const refreshTokenHash = await hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

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
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  }
);

/**
 * POST /auth/refresh
 * Exchange refresh token for new access token (with rotation)
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

    // Verify token
    let payload;
    try {
      payload = await verify(refreshToken, secret, "HS256");
    } catch {
      throw new HTTPException(401, { message: "Invalid refresh token" });
    }

    if ((payload as { type?: string }).type !== "refresh") {
      throw new HTTPException(401, { message: "Invalid token type" });
    }

    // Find token in database
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
      // Possible token reuse attack - revoke entire family
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

    // Revoke old token
    await c.env.DB.prepare(
      "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?"
    )
      .bind(storedToken.id)
      .run();

    // Generate new tokens (rotation)
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

    // Store new token
    const newTokenHash = await hashToken(newRefreshToken);
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

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

    audit.log(
      AUDIT_ACTIONS.TOKEN_REFRESH,
      "auth",
      storedToken.user_id as string
    );

    return c.json({
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      expiresIn: 900,
    });
  }
);

/**
 * POST /auth/logout
 * Revoke all refresh tokens for user
 */
auth.post("/logout", jwtAuth(), async (c) => {
  const userId = c.get("userId");
  const audit = createAuditLogger(c);

  await c.env.DB.prepare(
    "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL"
  )
    .bind(userId)
    .run();

  audit.log(AUDIT_ACTIONS.LOGOUT, "auth", userId);

  return c.json({ message: "Logged out successfully" });
});

/**
 * GET /auth/me
 * Get current authenticated user info
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
 * PUT /auth/password
 * Change user password
 */
auth.put(
  "/password",
  jwtAuth(),
  zValidator("json", changePasswordSchema),
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
      throw new HTTPException(401, {
        message: "Current password is incorrect",
      });
    }

    // Update password
    const newHash = await hashPassword(newPassword);

    await c.env.DB.prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
    )
      .bind(newHash, userId)
      .run();

    // Revoke all tokens (force re-login)
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
