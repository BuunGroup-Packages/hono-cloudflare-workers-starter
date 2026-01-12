import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../src/index";

// Type definitions
type LoginResponse = { accessToken: string };
type PostResponse = {
  id: string;
  title: string;
  body: string;
  published: boolean;
};
type PostsListResponse = { posts: unknown[]; page: number; limit: number };
type ErrorResponse = { error: string };

// Common headers
const headers = {
  "Content-Type": "application/json",
  Origin: "http://localhost",
};

// Helper to get auth token
async function getAuthToken(): Promise<string> {
  const email = `protected-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

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

describe("Protected Posts - Read (Public)", () => {
  it("GET /api/posts is accessible without authentication", async () => {
    const res = await app.request("/api/posts", { method: "GET" }, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as PostsListResponse;
    expect(data).toHaveProperty("posts");
  });
});

describe("Protected Posts - Write (Requires Auth)", () => {
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

  it("POST /api/posts succeeds with valid token", async () => {
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
          title: "Authorized Post",
          body: "This should succeed",
          published: true,
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as PostResponse;
    expect(data.title).toBe("Authorized Post");
  });

  it("PUT /api/posts/:id requires authentication", async () => {
    const accessToken = await getAuthToken();

    // Create a post first
    const createRes = await app.request(
      "/api/posts",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: "Post to Update",
          body: "Original content",
        }),
      },
      env
    );

    const post = (await createRes.json()) as PostResponse;

    // Try to update without auth
    const res = await app.request(
      `/api/posts/${post.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ title: "Updated Title" }),
      },
      env
    );

    expect(res.status).toBe(401);
  });

  it("DELETE /api/posts/:id requires authentication", async () => {
    const accessToken = await getAuthToken();

    // Create a post first
    const createRes = await app.request(
      "/api/posts",
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: "Post to Delete",
          body: "Will try to delete without auth",
        }),
      },
      env
    );

    const post = (await createRes.json()) as PostResponse;

    // Try to delete without auth
    const res = await app.request(
      `/api/posts/${post.id}`,
      { method: "DELETE", headers },
      env
    );

    expect(res.status).toBe(401);
  });
});

describe("Security Headers", () => {
  it("Responses include security headers", async () => {
    const res = await app.request("/health", { method: "GET" }, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});

describe("Error Responses", () => {
  it("Returns 404 for unknown routes", async () => {
    const res = await app.request("/unknown/route", { method: "GET" }, env);
    expect(res.status).toBe(404);

    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe("Not found");
  });

  it("Returns 401 for missing auth on protected routes", async () => {
    const res = await app.request(
      "/api/auth/me",
      { method: "GET", headers },
      env
    );
    expect(res.status).toBe(401);
  });

  it("Returns 400 for validation errors", async () => {
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
          title: "", // Invalid: empty
          body: "Content",
        }),
      },
      env
    );

    expect(res.status).toBe(400);
  });
});
