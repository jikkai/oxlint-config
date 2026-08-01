import { defineConfig } from "oxlint";

export interface ITailwindcssEntryPoint {
  files: string | readonly string[];
  use: string;
}

export interface ITailwindcssClassDetectionOptions {
  attributes?: readonly string[];
  callees?: readonly string[];
  tags?: readonly string[];
  variablePatterns?: readonly string[];
}

export interface ITailwindcssOptions extends ITailwindcssClassDetectionOptions {
  debug?: boolean;
  entryPoint: string | readonly ITailwindcssEntryPoint[];
  exclude?: ITailwindcssClassDetectionOptions;
  rootFontSize?: number;
  timeout?: number;
}

export const scriptFiles = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];
export const typescriptFiles = ["**/*.{ts,tsx,mts,cts}"];
export const jsxFiles = ["**/*.{jsx,tsx}"];
export const testFiles = [
  "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
];

export const base = defineConfig({
  categories: {
    correctness: "error",
    nursery: "off",
    pedantic: "off",
    perf: "warn",
    restriction: "off",
    style: "off",
    suspicious: "warn",
  },
  plugins: ["eslint", "oxc", "unicorn"],
});

export const typescript = defineConfig({
  plugins: ["typescript"],
  overrides: [
    {
      files: typescriptFiles,
      rules: {
        "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
        "typescript/consistent-type-imports": [
          "error",
          {
            fixStyle: "separate-type-imports",
            prefer: "type-imports",
          },
        ],
      },
    },
  ],
});

export const imports = defineConfig({ plugins: ["import"] });

export const promise = defineConfig({
  plugins: ["promise"],
  overrides: [
    {
      files: scriptFiles,
      rules: {
        "promise/catch-or-return": "error",
        "promise/no-return-wrap": "error",
      },
    },
  ],
});

export const react = defineConfig({
  plugins: ["react"],
  overrides: [
    {
      files: jsxFiles,
      rules: {
        "react/exhaustive-deps": "warn",
        "react/rules-of-hooks": "error",
      },
    },
  ],
});

export const reactPerf = defineConfig({
  plugins: ["react-perf"],
  overrides: [
    {
      files: jsxFiles,
      rules: {
        "react-perf/jsx-no-jsx-as-prop": "warn",
        "react-perf/jsx-no-new-array-as-prop": "warn",
        "react-perf/jsx-no-new-function-as-prop": "warn",
        "react-perf/jsx-no-new-object-as-prop": "warn",
      },
    },
  ],
});

export const nextjs = defineConfig({
  plugins: ["nextjs"],
  overrides: [
    {
      files: jsxFiles,
      rules: {
        "nextjs/no-async-client-component": "error",
        "nextjs/no-duplicate-head": "error",
        "nextjs/no-html-link-for-pages": "warn",
      },
    },
  ],
});

export const jsxA11y = defineConfig({
  plugins: ["jsx-a11y"],
  overrides: [
    {
      files: jsxFiles,
      rules: {
        "jsx-a11y/alt-text": "error",
        "jsx-a11y/anchor-is-valid": "warn",
        "jsx-a11y/aria-props": "error",
        "jsx-a11y/aria-role": "error",
      },
    },
  ],
});

export const vue = defineConfig({
  plugins: ["vue"],
  overrides: [
    {
      env: { vue: true },
      files: ["**/*.vue"],
      rules: {
        "vue/no-dupe-keys": "error",
        "vue/no-side-effects-in-computed-properties": "error",
        "vue/valid-define-props": "error",
      },
    },
  ],
});

export function tailwindcss(options: ITailwindcssOptions) {
  return defineConfig({
    jsPlugins: ["oxlint-tailwindcss"],
    rules: {
      "tailwindcss/no-conflicting-classes": "error",
      "tailwindcss/no-deprecated-classes": "error",
      "tailwindcss/no-duplicate-classes": "warn",
      "tailwindcss/no-unknown-classes": "error",
      "tailwindcss/enforce-canonical": "warn",
      "tailwindcss/no-unnecessary-arbitrary-value": "warn",
      "tailwindcss/enforce-sort-order": "warn",
      "tailwindcss/consistent-variant-order": "warn",
      "tailwindcss/enforce-consistent-important-position": "warn",
      "tailwindcss/no-unnecessary-whitespace": "warn",
    },
    settings: { tailwindcss: options },
  });
}

export const node = defineConfig({
  plugins: ["node"],
  overrides: [
    {
      env: { node: true },
      files: scriptFiles,
      rules: {
        "node/no-exports-assign": "error",
        "node/no-path-concat": "warn",
      },
    },
  ],
});

export const jsdoc = defineConfig({
  plugins: ["jsdoc"],
  overrides: [
    {
      files: scriptFiles,
      rules: { "jsdoc/check-tag-names": "warn" },
    },
  ],
});

export const jest = defineConfig({
  plugins: ["jest"],
  overrides: [
    {
      env: { jest: true },
      files: testFiles,
      rules: {
        "jest/expect-expect": "warn",
        "jest/no-disabled-tests": "warn",
        "jest/no-focused-tests": "error",
      },
    },
  ],
});

export const vitest = defineConfig({
  plugins: ["vitest"],
  overrides: [
    {
      env: { vitest: true },
      files: testFiles,
      rules: {
        "vitest/expect-expect": "warn",
        "vitest/no-disabled-tests": "warn",
        "vitest/no-focused-tests": "error",
      },
    },
  ],
});
