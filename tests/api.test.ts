import { describe, it, expect } from "vitest";
import { env, SELF } from "cloudflare:test";
import app from "../src/index";

// Type definitions for API responses
type HealthResponse = { status: string };
type PostsListResponse = { posts: unknown[]; page: number; limit: number };
type PostResponse = {
  id: string;
  title: string;
  body: string;
  published: boolean;
};
type ErrorResponse = { error: string };

describe("Health Check", () => {
  it("GET /health returns 200", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as HealthResponse;
    expect(data).toEqual({ status: "ok" });
  });
});

describe("Posts API", () => {
  it("GET /api/posts returns 200", async () => {
    const res = await app.request("/api/posts", {}, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as PostsListResponse;
    expect(data).toHaveProperty("posts");
    expect(data).toHaveProperty("page");
    expect(data).toHaveProperty("limit");
  });

  it("POST /api/posts creates a post", async () => {
    const res = await app.request(
      "/api/posts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Post",
          body: "Test content for the post body",
          published: true,
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const data = (await res.json()) as PostResponse;
    expect(data.title).toBe("Test Post");
    expect(data.id).toBeDefined();
  });

  it("POST /api/posts validates required fields", async () => {
    const res = await app.request(
      "/api/posts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "", // Invalid: empty
          body: "Content",
        }),
      },
      env
    );

    expect(res.status).toBe(400);
  });

  it("GET /api/posts/unknown returns 404", async () => {
    const res = await app.request("/api/posts/unknown-id-12345", {}, env);
    expect(res.status).toBe(404);
  });

  it("GET /api/posts supports pagination", async () => {
    const res = await app.request("/api/posts?page=1&limit=5", {}, env);
    expect(res.status).toBe(200);

    const data = (await res.json()) as PostsListResponse;
    expect(data.page).toBe(1);
    expect(data.limit).toBe(5);
  });

  it("GET /api/posts supports filtering by published", async () => {
    const res = await app.request("/api/posts?published=true", {}, env);
    expect(res.status).toBe(200);
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
