import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated coverage report (gitignored): its bundled JS trips
    // unused-eslint-disable warnings when linting after `npm run test:coverage`.
    "coverage/**",
  ]),
  {
    rules: {
      // Promoted back to errors once the ChatProvider decomposition removed the
      // last violations (the effects now live in useChatSync /
      // useAdkStreamEvents). The single remaining exception is the deliberate
      // per-session reset in useAdkStreamEvents, silenced inline with a reason.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      // Debug traces must go through lib/logger, which is dev-gated and drops
      // out of the production bundle. warn/error stay allowed: they are
      // legitimate diagnostics in production too.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // The logger itself is the one place where console.log IS the implementation.
    files: ["lib/logger.ts"],
    rules: { "no-console": "off" },
  },
]);

export default eslintConfig;
