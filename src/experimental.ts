import type { OxlintConfig } from "oxlint";
import { defineConfig } from "oxlint";
import type { IExperimentalOptions } from "./config.js";
import { scriptFiles, testFiles } from "./presets.js";

const experimentalKeys = [
  "cypress",
  "mocha",
  "playwright",
  "regexp",
  "sonarjs",
  "storybook",
  "testingLibrary",
] as const satisfies readonly (keyof IExperimentalOptions)[];

const adapters = {
  cypress: defineConfig({
    jsPlugins: [{ name: "cypress", specifier: "eslint-plugin-cypress" }],
    overrides: [
      {
        files: ["**/cypress/**/*.{js,jsx,ts,tsx}", "**/*.cy.{js,jsx,ts,tsx}"],
        globals: { cy: "readonly" },
        rules: { "cypress/no-assigning-return-values": "error" },
      },
    ],
  }),
  mocha: defineConfig({
    jsPlugins: [{ name: "mocha", specifier: "eslint-plugin-mocha" }],
    overrides: [
      {
        env: { mocha: true },
        files: testFiles,
        rules: { "mocha/no-exclusive-tests": "warn" },
      },
    ],
  }),
  playwright: defineConfig({
    jsPlugins: [{ name: "playwright", specifier: "eslint-plugin-playwright" }],
    overrides: [{ files: testFiles, rules: { "playwright/no-focused-test": "error" } }],
  }),
  regexp: defineConfig({
    jsPlugins: [{ name: "regexp", specifier: "eslint-plugin-regexp" }],
    overrides: [
      {
        files: scriptFiles,
        rules: { "regexp/no-dupe-characters-character-class": "error" },
      },
    ],
  }),
  sonarjs: defineConfig({
    jsPlugins: [{ name: "sonarjs", specifier: "eslint-plugin-sonarjs" }],
    overrides: [
      {
        files: scriptFiles,
        rules: { "sonarjs/no-all-duplicated-branches": "error" },
      },
    ],
  }),
  storybook: defineConfig({
    jsPlugins: [{ name: "storybook", specifier: "eslint-plugin-storybook" }],
    overrides: [
      {
        files: [
          "**/*.stories.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
          "**/*.story.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
          "**/.storybook/**/*.{js,mjs,cjs,ts,mts,cts}",
        ],
        rules: { "storybook/default-exports": "error" },
      },
    ],
  }),
  testingLibrary: defineConfig({
    jsPlugins: [{ name: "testing-library", specifier: "eslint-plugin-testing-library" }],
    overrides: [
      {
        files: testFiles,
        rules: { "testing-library/no-global-regexp-flag-in-query": "error" },
      },
    ],
  }),
} satisfies Record<keyof IExperimentalOptions, OxlintConfig>;

export const experimentalPackages = Object.fromEntries(
  experimentalKeys.map((key) => [key, adapters[key].jsPlugins?.[0]?.specifier]),
) as Readonly<Record<keyof IExperimentalOptions, string>>;

export function selectExperimental(options: IExperimentalOptions = {}): OxlintConfig[] {
  return experimentalKeys.filter((key) => options[key] === true).map((key) => adapters[key]);
}
