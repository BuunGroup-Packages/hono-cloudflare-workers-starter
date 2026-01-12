/**
 * POST /auth/refresh
 *
 * Exchange refresh token for new access token (with rotation).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { verify } from "hono/jwt";

import type { AppEnv } from "../../types/bindings";
import { refreshSchema } from "../../schemas/auth";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../../middleware/jwt-auth";
import { strictRateLimiter } from "../../middleware/rate-limiter";
import { createAuditLogger, AUDIT_ACTIONS } from "../../middleware/audit-logger";

const refresh = new Hono<AppEnv>();

refresh.post(
  "/",
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

export { refresh };
