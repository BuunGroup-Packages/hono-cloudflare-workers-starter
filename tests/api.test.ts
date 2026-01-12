import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import app from "../src/index";

// Type definitions for API responses
type HealthResponse = { status: string; timestamp: string; requestId: string };
type PostsListResponse = { posts: unknown[]; page: number; limit: number };
type ErrorResponse = { error: string };
type LoginResponse = { accessToken: string };

// Common headers for requests (bypass CSRF with Origin)
const headers = {
  "Content-Type": "application/json",
  Origin: "http://localhost",
};

// Helper to get auth token
async function getAuthToken(): Promise<string> {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  await app.request(
    "/api/auth/register",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: "SecurePass123" }),
    },
    env
  );

  const loginRes = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: "SecurePass123" }),
    },
    env
  );

  const data = (await loginRes.json()) as LoginResponse;
  return data.accessToken;
}

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

describe("Posts API - Public", () => {
  it("GET /api/posts returns 200 without authentication", async () => {
    const res = await app.request("/api/posts", {}, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as PostsListResponse;
    expect(data).toHaveProperty("posts");
    expect(data).toHaveProperty("page");
    expect(data).toHaveProperty("limit");
  });

  it("GET /api/posts supports pagination", async () => {
    const res = await app.request("/api/posts?page=1&limit=5", {}, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as PostsListResponse;
    expect(data.page).toBe(1);
    expect(data.limit).toBe(5);
  });

  it("GET /api/posts/unknown returns 404", async () => {
    const res = await app.request("/api/posts/unknown-id-12345", {}, env);
    expect(res.status).toBe(404);
  });
});

describe("Posts API - Protected", () => {
  it("POST /api/posts requires authentication", async () => {
    const res = await app.request(
      "/api/posts",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Unauthorized Post",
          body: "This should fail",
        }),
      },
      env
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/posts creates a post with authentication", async () => {
    const accessToken = await getAuthToken();

    const res = await app.request(
      "/api/posts",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: "Test Post",
          body: "Test content for the post body",
          published: true,
        }),
      },
      env
    );

    expect(res.status).toBe(201);
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
