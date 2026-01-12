/**
 * Cloudflare Workers Bindings Type Definitions
 *
 * Define all your D1 databases, KV namespaces, R2 buckets,
 * Rate Limiting bindings, and environment variables here.
 */

export type Bindings = {
  /** D1 Database binding */
  DB: D1Database;

  /** JWT secret for token signing */
  JWT_SECRET: string;

  /** Rate Limiting API binding (optional) */
  RATE_LIMITER?: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };

  /** KV namespace for rate limiting fallback (optional) */
  RATE_LIMIT_KV?: KVNamespace;

  // Add other bindings as needed:
  // R2_BUCKET: R2Bucket;
  // QUEUE: Queue;
};

export type Variables = {
  /** Request ID for tracing */
  requestId: string;

  /** Authenticated user ID */
  userId?: string;

  /** Authenticated user email */
  userEmail?: string;

  /** Authenticated user role */
  userRole?: string;

  /** API key ID if authenticated via API key */
  apiKeyId?: string;

  /** API key scopes if authenticated via API key */
  apiKeyScopes?: string[];
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
