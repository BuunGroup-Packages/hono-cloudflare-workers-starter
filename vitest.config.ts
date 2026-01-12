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
        },
      },
    },
  },
});
