/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import amamo from "../config.js";

const experimentalFixtures = [
  {
    adapter: "cypress",
    diagnostic: "cypress(no-assigning-return-values)",
    invalid: "cypress/invalid.cy.ts",
    rule: "cypress/no-assigning-return-values",
    severity: "deny",
    valid: "cypress/valid.cy.ts",
  },
  {
    adapter: "mocha",
    diagnostic: "mocha(no-exclusive-tests)",
    invalid: "mocha/invalid.spec.ts",
    rule: "mocha/no-exclusive-tests",
    severity: "warn",
    valid: "mocha/valid.spec.ts",
  },
  {
    adapter: "playwright",
    diagnostic: "playwright(no-focused-test)",
    invalid: "playwright/invalid.spec.ts",
    rule: "playwright/no-focused-test",
    severity: "deny",
    valid: "playwright/valid.spec.ts",
  },
  {
    adapter: "regexp",
    diagnostic: "regexp(no-dupe-characters-character-class)",
    invalid: "regexp/invalid.ts",
    rule: "regexp/no-dupe-characters-character-class",
    severity: "deny",
    valid: "regexp/valid.ts",
  },
  {
    adapter: "sonarjs",
    diagnostic: "sonarjs(no-all-duplicated-branches)",
    invalid: "sonarjs/invalid.ts",
    rule: "sonarjs/no-all-duplicated-branches",
    severity: "deny",
    valid: "sonarjs/valid.ts",
  },
  {
    adapter: "storybook",
    diagnostic: "storybook(default-exports)",
    invalid: "storybook/invalid.stories.js",
    rule: "storybook/default-exports",
    severity: "deny",
    valid: "storybook/valid.stories.js",
  },
  {
    adapter: "testing-library",
    diagnostic: "testing-library(no-global-regexp-flag-in-query)",
    invalid: "testing-library/invalid.spec.ts",
    rule: "testing-library/no-global-regexp-flag-in-query",
    severity: "deny",
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
    ({ diagnostic, invalid, rule, severity, valid }) => {
      const config = "fixtures/experimental.config.mjs";
      const invalidFile = `fixtures/experimental/${invalid}`;
      const validFile = `fixtures/experimental/${valid}`;
      const printed = runOxlint("--config", config, "--print-config", invalidFile);

      expect(printed.status).toBe(0);
      expect(printed.stdout).toContain(`"${rule}": "${severity}"`);

      const invalidResult = runOxlint(
        "--config",
        config,
        "--deny-warnings",
        "--format",
        "json",
        invalidFile,
      );

      expect(invalidResult.status).toBe(1);
      expect(invalidResult.stdout).toContain(`"code": "${diagnostic}"`);

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
