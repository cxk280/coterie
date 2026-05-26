import { configDefaults, defineConfig } from "vitest/config";

// Default suite: fast, offline, deterministic — this is what `npm test` and the
// CI PR gate run. The real-agent E2E tests under tests/e2e/ spend subscription
// calls and are nondeterministic, so they're excluded here and run only via
// `npm run test:e2e` (see vitest.e2e.config.ts).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
});
