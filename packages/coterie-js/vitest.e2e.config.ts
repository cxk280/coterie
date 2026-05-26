import { defineConfig } from "vitest/config";

// Real-agent end-to-end suite. Run with `npm run test:e2e` on a machine where
// `claude` and `codex` are installed and signed in — it drives the real
// `coterie chat` and spends subscription calls. Slow and nondeterministic by
// nature, so it gets generous timeouts and runs one turn at a time.
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
