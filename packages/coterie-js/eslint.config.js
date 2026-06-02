// Flat config (ESLint 9). `npm run lint` runs `eslint src`.
//
// Pragmatic for a CLI orchestrator: the recommended JS + TypeScript rule sets,
// minus the rules that fight this codebase's deliberate shape —
//  - `no-explicit-any`: graph/config wiring crosses untyped LangGraph + YAML
//    boundaries, so `any` is used on purpose at those seams.
//  - `no-console`: this IS a terminal app; stdout/stderr is the product.
// `no-unused-vars` stays on (as a typescript-eslint rule) — it catches real
// dead code and typo'd identifiers.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // Allow intentional `_`-prefixed unused args/vars (conventional throwaways).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
