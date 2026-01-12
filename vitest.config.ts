import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Enable D1 for tests with an in-memory database
          d1Databases: {
            DB: "test-db",
          },
          // Provide test bindings
          bindings: {
            JWT_SECRET: "test-jwt-secret-for-testing-only-32chars",
          },
        },
        // Use single worker to avoid isolation issues with waitUntil
        singleWorker: true,
        // Disable isolated storage to work around waitUntil issues
        // See: https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#isolated-storage
        isolatedStorage: false,
      },
    },
  },
});
