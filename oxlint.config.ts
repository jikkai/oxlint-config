import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    nursery: "off",
    pedantic: "off",
    perf: "warn",
    restriction: "off",
    style: "off",
    suspicious: "warn",
  },
  env: { node: true },
  ignorePatterns: ["coverage/**", "dist/**", "fixtures/**"],
  plugins: ["eslint", "oxc", "unicorn", "typescript", "import", "promise", "node", "vitest"],
  rules: {
    "vitest/no-conditional-expect": "off",
    "vitest/require-mock-type-parameters": "off",
  },
  overrides: [
    {
      env: { vitest: true },
      files: [
        "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
        "**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
      ],
    },
  ],
});
