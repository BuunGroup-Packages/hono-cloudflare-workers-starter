/**
 * Health Check & General Integration Tests
 */

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../../src/index";

type HealthResponse = { status: string; timestamp: string; requestId: string };
type ErrorResponse = { error: string };

describe("Health Check", () => {
  it("GET /health returns 200", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as HealthResponse;
    expect(data.status).toBe("ok");
    expect(data.timestamp).toBeDefined();
    expect(data.requestId).toBeDefined();
  });
});

describe("Not Found Handler", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/unknown-route", {}, env);
    expect(res.status).toBe(404);

    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Not found");
  });
});
