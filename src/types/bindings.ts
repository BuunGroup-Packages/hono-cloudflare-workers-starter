/**
 * Cloudflare Workers Bindings Type Definitions
 *
 * Define all your D1 databases, KV namespaces, R2 buckets,
 * and environment variables here for full TypeScript support.
 */

export type Bindings = {
  /** D1 Database binding */
  DB: D1Database;

  // Add other bindings as needed:
  // KV: KVNamespace;
  // BUCKET: R2Bucket;
  // API_KEY: string;
};

export type Variables = {
  /** Request ID for tracing */
  requestId: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
