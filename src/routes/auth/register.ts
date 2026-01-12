/**
 * POST /auth/register
 *
 * Create a new user account.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../../types/bindings";
import { hashPassword } from "../../lib/password";
import { registerSchema } from "../../schemas/auth";
import { strictRateLimiter } from "../../middleware/rate-limiter";
import { createAuditLogger, AUDIT_ACTIONS } from "../../middleware/audit-logger";

const register = new Hono<AppEnv>();

register.post(
  "/",
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

export { register };
