/**
 * POST /auth/login
 *
 * Authenticate user and return JWT tokens.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../../types/bindings";
import { verifyPassword } from "../../lib/password";
import { loginSchema } from "../../schemas/auth";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../../middleware/jwt-auth";
import { strictRateLimiter } from "../../middleware/rate-limiter";
import { createAuditLogger, AUDIT_ACTIONS } from "../../middleware/audit-logger";

const login = new Hono<AppEnv>();

login.post(
  "/",
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

export { login };
