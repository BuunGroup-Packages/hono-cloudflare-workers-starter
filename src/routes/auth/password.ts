/**
 * PUT /auth/password
 *
 * Change user password.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../../types/bindings";
import { hashPassword, verifyPassword } from "../../lib/password";
import { changePasswordSchema } from "../../schemas/auth";
import { jwtAuth } from "../../middleware/jwt-auth";
import { createAuditLogger, AUDIT_ACTIONS } from "../../middleware/audit-logger";

const password = new Hono<AppEnv>();

password.put(
  "/",
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

export { password };
