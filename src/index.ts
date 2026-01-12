import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import type { AppEnv } from "./types/bindings";
import { posts } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware";

const app = new Hono<AppEnv>();

// Global middleware
app.use("*", logger());
app.use("*", secureHeaders());
app.use(
  "/api/*",
  cors({
    origin: ["https://example.com"], // Update with your domain
    credentials: true,
  })
);

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// Mount routes
app.route("/api/posts", posts);

// Error handling
app.onError(errorHandler);
app.notFound(notFoundHandler);

export default app;
