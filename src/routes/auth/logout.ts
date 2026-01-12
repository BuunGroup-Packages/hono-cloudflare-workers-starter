/**
 * POST /auth/logout
 *
 * Revoke all refresh tokens for user.
 */

import { Hono } from "hono";

import type { AppEnv } from "../../types/bindings";
import { jwtAuth } from "../../middleware/jwt-auth";
import { createAuditLogger, AUDIT_ACTIONS } from "../../middleware/audit-logger";

const logout = new Hono<AppEnv>();

logout.post("/", jwtAuth(), async (c) => {
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

export { logout };
