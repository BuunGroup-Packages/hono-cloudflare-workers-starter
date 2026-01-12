import { env } from "cloudflare:test";
import { beforeAll } from "vitest";

// Create tables before running tests
beforeAll(async () => {
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, published INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);"
  );
});
