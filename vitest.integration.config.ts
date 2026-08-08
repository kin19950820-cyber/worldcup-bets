import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Separate from vitest.config.ts on purpose: these tests hit a real Postgres
// database (via SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY) and must
// never run as part of the default `npm test` unit suite.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
