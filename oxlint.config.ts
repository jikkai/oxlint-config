import { defineConfig } from "oxlint";

import { tailwindcss } from "./src/presets.ts";

const tailwindcssConfig = tailwindcss({ entryPoint: "docs/src/index.css" });

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
  jsPlugins: tailwindcssConfig.jsPlugins,
  plugins: ["eslint", "oxc", "unicorn", "typescript", "import", "promise", "node", "vitest"],
  rules: {
    "vitest/no-conditional-expect": "off",
    "vitest/require-mock-type-parameters": "off",
  },
  settings: tailwindcssConfig.settings,
  overrides: [
    {
      files: ["docs/src/**/*.{js,jsx,ts,tsx}"],
      rules: {
        ...tailwindcssConfig.rules,
        "tailwindcss/no-unknown-classes": [
          "error",
          { allowlist: ["rule-filters"], ignorePrefixes: ["group/", "peer/"] },
        ],
      },
    },
    {
      env: { vitest: true },
      files: [
        "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
        "**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
      ],
    },
  ],
});
