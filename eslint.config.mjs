import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sianjabLocal from "./scripts/eslint-plugin-sianjab-local.js";

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
  ]),
  // Penjaga pola draft localStorage (bug 2026-10: draft menimpa data server).
  // Lihat scripts/eslint-plugin-sianjab-local.js untuk detail rule.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "sianjab-local": sianjabLocal,
    },
    rules: {
      "sianjab-local/no-localstorage-draft-without-server-guard": "error",
      "sianjab-local/no-localstorage-draft-write-without-timestamp": "error",
    },
  },
]);

export default eslintConfig;
