/**
 * GET /auth/me
 *
 * Get current authenticated user info.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../../types/bindings";
import { jwtAuth } from "../../middleware/jwt-auth";

const me = new Hono<AppEnv>();

me.get("/", jwtAuth(), async (c) => {
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

export { me };
