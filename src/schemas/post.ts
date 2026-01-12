import { z } from "zod";

/**
 * Post Validation Schemas
 *
 * Zod schemas for validating post data with automatic TypeScript type inference.
 */

export const createPostSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  body: z.string().min(1, "Body is required"),
  published: z.boolean().default(false),
});

export const updatePostSchema = createPostSchema.partial();

export const listPostsQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  published: z.enum(["true", "false"]).optional(),
});

// Infer TypeScript types from schemas for reuse
export type CreatePost = z.infer<typeof createPostSchema>;
export type UpdatePost = z.infer<typeof updatePostSchema>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
