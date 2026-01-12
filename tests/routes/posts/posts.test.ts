/**
 * Posts API Tests
 */

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../../../src/index";
import { headers, getAuthToken } from "../../helpers/auth";

type PostsListResponse = { posts: unknown[]; page: number; limit: number };
type PostResponse = { id: string; title: string; body: string; published: boolean };

describe("Posts - Public", () => {
  it("GET /api/posts returns list without authentication", async () => {
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

  it("GET /api/posts/:id returns 404 for unknown post", async () => {
    const res = await app.request("/api/posts/unknown-id-12345", {}, env);
    expect(res.status).toBe(404);
  });
});

describe("Posts - Protected", () => {
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

  it("POST /api/posts creates post with authentication", async () => {
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
    const data = (await res.json()) as PostResponse;
    expect(data.title).toBe("Test Post");
    expect(data.id).toBeDefined();
  });
});
