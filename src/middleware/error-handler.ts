import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Global Error Handler
 *
 * Handles all errors thrown in route handlers and middleware.
 * Returns consistent JSON error responses.
 */
export function errorHandler(err: Error, c: Context) {
  console.error(`[Error] ${err.message}`, err.stack);

  // Handle Hono HTTP exceptions
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  // Handle Zod validation errors
  if (err.name === "ZodError") {
    return c.json(
      {
        error: "Validation failed",
        details: (err as unknown as { issues: unknown[] }).issues,
      },
      400
    );
  }

  // Handle D1 database errors
  if (err.message?.includes("D1")) {
    return c.json({ error: "Database error" }, 503);
  }

  // Generic error - don't leak details in production
  return c.json({ error: "Internal server error" }, 500);
}

/**
 * Not Found Handler
 *
 * Returns a 404 response for unmatched routes.
 */
export function notFoundHandler(c: Context) {
  return c.json({ error: "Not found", path: c.req.path }, 404);
}
