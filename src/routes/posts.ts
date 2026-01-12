import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/bindings";
import {
  createPostSchema,
  updatePostSchema,
  listPostsQuerySchema,
} from "../schemas";

const posts = new Hono<AppEnv>();

/**
 * GET /posts - List all posts with pagination
 */
posts.get("/", zValidator("query", listPostsQuerySchema), async (c) => {
  const { page, limit, published } = c.req.valid("query");
  const offset = (page - 1) * limit;

  let query = "SELECT * FROM posts";
  const params: (string | number)[] = [];

  if (published !== undefined) {
    query += " WHERE published = ?";
    params.push(published === "true" ? 1 : 0);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ posts: results, page, limit });
});

/**
 * GET /posts/:id - Get single post by ID
 */
posts.get("/:id", async (c) => {
  const id = c.req.param("id");

  const post = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?")
    .bind(id)
    .first();

  if (!post) {
    throw new HTTPException(404, { message: "Post not found" });
  }

  return c.json(post);
});

/**
 * POST /posts - Create new post
 */
posts.post("/", zValidator("json", createPostSchema), async (c) => {
  const data = c.req.valid("json");
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO posts (id, title, body, published) VALUES (?, ?, ?, ?)"
  )
    .bind(id, data.title, data.body, data.published ? 1 : 0)
    .run();

  return c.json({ id, ...data }, 201);
});

/**
 * PUT /posts/:id - Update existing post
 */
posts.put("/:id", zValidator("json", updatePostSchema), async (c) => {
  const id = c.req.param("id");
  const data = c.req.valid("json");

  const existing = await c.env.DB.prepare("SELECT * FROM posts WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    throw new HTTPException(404, { message: "Post not found" });
  }

  await c.env.DB.prepare(
    `
    UPDATE posts
    SET title = ?, body = ?, published = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  )
    .bind(
      data.title ?? existing.title,
      data.body ?? existing.body,
      data.published !== undefined
        ? data.published
          ? 1
          : 0
        : existing.published,
      id
    )
    .run();

  return c.json({ id, ...data });
});

/**
 * DELETE /posts/:id - Delete post
 */
posts.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await c.env.DB.prepare("DELETE FROM posts WHERE id = ?")
    .bind(id)
    .run();

  if (result.meta.changes === 0) {
    throw new HTTPException(404, { message: "Post not found" });
  }

  return c.json({ deleted: true });
});

export { posts };
