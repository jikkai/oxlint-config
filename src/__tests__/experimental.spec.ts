/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import amamo from "../config.js";

const experimentalFixtures = [
  {
    adapter: "cypress",
    diagnostics: [
      { code: "cypress(no-assigning-return-values)", severity: "error" },
      { code: "cypress(no-unnecessary-assertions)", severity: "warning" },
    ],
    invalid: "cypress/invalid.cy.ts",
    valid: "cypress/valid.cy.ts",
  },
  {
    adapter: "mocha",
    diagnostics: [{ code: "mocha(no-exclusive-tests)", severity: "warning" }],
    invalid: "mocha/invalid.spec.ts",
    valid: "mocha/valid.spec.ts",
  },
  {
    adapter: "playwright",
    diagnostics: [{ code: "playwright(no-focused-test)", severity: "error" }],
    invalid: "playwright/invalid.spec.ts",
    valid: "playwright/valid.spec.ts",
  },
  {
    adapter: "regexp",
    diagnostics: [{ code: "regexp(no-dupe-characters-character-class)", severity: "error" }],
    invalid: "regexp/invalid.ts",
    valid: "regexp/valid.ts",
  },
  {
    adapter: "sonarjs",
    diagnostics: [{ code: "sonarjs(no-all-duplicated-branches)", severity: "error" }],
    invalid: "sonarjs/invalid.ts",
    valid: "sonarjs/valid.ts",
  },
  {
    adapter: "storybook",
    diagnostics: [{ code: "storybook(default-exports)", severity: "error" }],
    invalid: "storybook/invalid.stories.js",
    valid: "storybook/valid.stories.js",
  },
  {
    adapter: "testing-library",
    diagnostics: [{ code: "testing-library(no-global-regexp-flag-in-query)", severity: "error" }],
    invalid: "testing-library/invalid.spec.ts",
    valid: "testing-library/valid.spec.ts",
  },
] as const;

function runOxlint(...args: string[]) {
  return spawnSync("oxlint", args, { encoding: "utf8" });
}

describe("experimental JS-plugin adapters", () => {
  it("does not load JS plugins by default", () => {
    expect(amamo().extends?.flatMap((config) => config.jsPlugins ?? [])).toEqual([]);
  });

  it("loads one selected JS plugin", () => {
    const config = amamo({ experimental: { cypress: true } });

    expect(config.extends?.flatMap((item) => item.jsPlugins ?? [])).toEqual([
      { name: "cypress", specifier: "eslint-plugin-cypress" },
    ]);
  });

  it("loads only selected JS plugins", () => {
    const config = amamo({ experimental: { cypress: true, sonarjs: true } });

    expect(config.extends?.flatMap((item) => item.jsPlugins ?? [])).toEqual([
      { name: "cypress", specifier: "eslint-plugin-cypress" },
      { name: "sonarjs", specifier: "eslint-plugin-sonarjs" },
    ]);
  });

  it("keeps selected JS plugins in declaration order", () => {
    const config = amamo({ experimental: { mocha: true, playwright: true } });

    expect(config.extends?.flatMap((item) => item.jsPlugins ?? [])).toEqual([
      { name: "mocha", specifier: "eslint-plugin-mocha" },
      { name: "playwright", specifier: "eslint-plugin-playwright" },
    ]);
  });

  it("maps every option to its package", () => {
    const config = amamo({
      experimental: {
        cypress: true,
        mocha: true,
        playwright: true,
        regexp: true,
        sonarjs: true,
        storybook: true,
        testingLibrary: true,
      },
    });

    expect(config.extends?.flatMap((item) => item.jsPlugins ?? [])).toEqual([
      { name: "cypress", specifier: "eslint-plugin-cypress" },
      { name: "mocha", specifier: "eslint-plugin-mocha" },
      { name: "playwright", specifier: "eslint-plugin-playwright" },
      { name: "regexp", specifier: "eslint-plugin-regexp" },
      { name: "sonarjs", specifier: "eslint-plugin-sonarjs" },
      { name: "storybook", specifier: "eslint-plugin-storybook" },
      { name: "testing-library", specifier: "eslint-plugin-testing-library" },
    ]);
  });

  it.each(experimentalFixtures)(
    "$adapter loads its real plugin and enforces its fixture rule",
    ({ diagnostics, invalid, valid }) => {
      const config = "fixtures/experimental.config.mjs";
      const invalidFile = `fixtures/experimental/${invalid}`;
      const validFile = `fixtures/experimental/${valid}`;
      const invalidResult = runOxlint(
        "--config",
        config,
        "--deny-warnings",
        "--format",
        "json",
        invalidFile,
      );

      expect(invalidResult.status).toBe(1);
      const output = JSON.parse(invalidResult.stdout) as { diagnostics: unknown[] };
      for (const diagnostic of diagnostics) {
        expect(output.diagnostics).toContainEqual(expect.objectContaining(diagnostic));
      }

      const validResult = runOxlint(
        "--config",
        config,
        "--deny-warnings",
        "--format",
        "json",
        validFile,
      );

      expect(validResult.status).toBe(0);
    },
  );
});
