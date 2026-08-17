/// <reference types="node" />

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  base,
  imports,
  jest,
  jsdoc,
  jsxA11y,
  nextjs,
  node,
  promise,
  react,
  reactPerf,
  tailwindcss,
  typescript,
  vitest,
  vue,
} from "../presets.js";

interface IPrintedOverride {
  env?: Record<string, boolean>;
  rules?: Record<string, unknown>;
}

interface IPrintedConfig {
  overrides?: IPrintedOverride[];
  plugins?: string[];
  rules?: Record<string, unknown>;
}

interface IStableFixture {
  diagnostic: string;
  env?: string;
  invalid: string;
  name: string;
  plugin?: string;
  printConfig?: boolean;
  rule: string;
  valid: string;
}

const stableFixtures: readonly IStableFixture[] = [
  {
    diagnostic: "eslint(no-unused-vars)",
    invalid: "javascript/invalid.js",
    name: "JavaScript",
    rule: "no-unused-vars",
    valid: "javascript/valid.js",
  },
  {
    diagnostic: "typescript(consistent-type-imports)",
    invalid: "typescript/invalid.ts",
    name: "TypeScript",
    plugin: "typescript",
    rule: "typescript/consistent-type-imports",
    valid: "typescript/valid.ts",
  },
  {
    diagnostic: "react-hooks(rules-of-hooks)",
    invalid: "react/invalid.jsx",
    name: "React",
    plugin: "react",
    rule: "react/rules-of-hooks",
    valid: "react/valid.jsx",
  },
  {
    diagnostic: "next(no-async-client-component)",
    invalid: "nextjs/invalid.tsx",
    name: "Next.js",
    plugin: "nextjs",
    rule: "nextjs/no-async-client-component",
    valid: "nextjs/valid.tsx",
  },
  {
    diagnostic: "vue(no-dupe-keys)",
    env: "vue",
    invalid: "vue/invalid.vue",
    name: "Vue",
    plugin: "vue",
    rule: "vue/no-dupe-keys",
    valid: "vue/valid.vue",
  },
  {
    diagnostic: "node(no-exports-assign)",
    env: "node",
    invalid: "node/invalid.cjs",
    name: "Node",
    plugin: "node",
    rule: "node/no-exports-assign",
    valid: "node/valid.cjs",
  },
  {
    diagnostic: "jest(no-focused-tests)",
    env: "jest",
    invalid: "jest/invalid.spec.ts",
    name: "Jest",
    plugin: "jest",
    rule: "jest/no-focused-tests",
    valid: "jest/valid.spec.ts",
  },
  {
    diagnostic: "vitest(no-focused-tests)",
    env: "vitest",
    invalid: "vitest/invalid.spec.ts",
    name: "Vitest",
    plugin: "vitest",
    rule: "vitest/no-focused-tests",
    valid: "vitest/valid.spec.ts",
  },
  {
    diagnostic: "tailwindcss(no-unknown-classes)",
    invalid: "tailwindcss/invalid.ts",
    name: "Tailwind CSS",
    printConfig: false,
    rule: "tailwindcss/no-unknown-classes",
    valid: "tailwindcss/valid.ts",
  },
];

function runOxlint(...args: string[]) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) throw new Error("Cannot run Oxlint: npm_execpath is unavailable");

  return spawnSync(process.execPath, [npmExecPath, "exec", "oxlint", ...args], {
    encoding: "utf8",
  });
}

describe("stable defaults", () => {
  it("sets the balanced categories and explicit core plugins", () => {
    expect(base.categories).toEqual({
      correctness: "error",
      nursery: "off",
      pedantic: "off",
      perf: "warn",
      restriction: "off",
      style: "off",
      suspicious: "warn",
    });
    expect(base.plugins).toEqual(["eslint", "oxc", "unicorn"]);
  });

  it("keeps each default capability in a separate native fragment", () => {
    expect(typescript.plugins).toEqual(["typescript"]);
    expect(imports.plugins).toEqual(["import"]);
    expect(promise.plugins).toEqual(["promise"]);
  });

  it("scopes every ecosystem rule set to its matching files", () => {
    const presets = [react, reactPerf, nextjs, jsxA11y, vue, node, jsdoc, jest, vitest];

    for (const preset of presets) {
      expect("rules" in preset).toBe(false);
      expect(preset.overrides).toHaveLength(1);
      expect(preset.overrides?.[0]?.files).toBeDefined();
      expect(preset.overrides?.[0]?.rules).toBeDefined();
    }

    expect(react.overrides?.[0]?.files).toEqual(["**/*.{jsx,tsx}"]);
    expect(reactPerf.overrides?.[0]?.files).toEqual(["**/*.{jsx,tsx}"]);
    expect(nextjs.overrides?.[0]?.files).toEqual(["**/*.{jsx,tsx}"]);
    expect(jsxA11y.overrides?.[0]?.files).toEqual(["**/*.{jsx,tsx}"]);
    expect(vue.overrides?.[0]?.files).toEqual(["**/*.vue"]);
    expect(node.overrides?.[0]?.files).toEqual(["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"]);
    expect(jsdoc.overrides?.[0]?.files).toEqual(["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"]);
    expect(jest.overrides?.[0]?.files).toEqual([
      "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
      "**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
    ]);
    expect(vitest.overrides?.[0]?.files).toEqual([
      "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
      "**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
    ]);
  });

  it("registers the expected plugin for every ecosystem preset", () => {
    expect(react.plugins).toEqual(["react"]);
    expect(reactPerf.plugins).toEqual(["react-perf"]);
    expect(nextjs.plugins).toEqual(["nextjs"]);
    expect(jsxA11y.plugins).toEqual(["jsx-a11y"]);
    expect(vue.plugins).toEqual(["vue"]);
    expect(node.plugins).toEqual(["node"]);
    expect(jsdoc.plugins).toEqual(["jsdoc"]);
    expect(jest.plugins).toEqual(["jest"]);
    expect(vitest.plugins).toEqual(["vitest"]);
  });

  it("creates a Tailwind CSS plugin preset with its explicit entry point", () => {
    const preset = tailwindcss({ entryPoint: "src/index.css" });

    expect(preset.jsPlugins).toEqual(["oxlint-tailwindcss"]);
    expect(preset.settings).toEqual({
      tailwindcss: { entryPoint: "src/index.css" },
    });
  });

  it.each(stableFixtures)(
    "$name exposes and enforces its real native fixture rule",
    ({ diagnostic, env, invalid, plugin, printConfig = true, rule, valid }) => {
      const config = "fixtures/stable.config.mjs";
      const invalidFile = `fixtures/stable/${invalid}`;
      const validFile = `fixtures/stable/${valid}`;
      if (printConfig) {
        const printed = runOxlint("--config", config, "--print-config", invalidFile);

        expect(printed.status).toBe(0);
        if (printed.status !== 0) throw new Error(printed.stderr);

        const printedConfig = JSON.parse(printed.stdout) as IPrintedConfig;
        const ruleValues = [
          printedConfig.rules?.[rule],
          ...(printedConfig.overrides?.map((override) => override.rules?.[rule]) ?? []),
        ].map((value) => (Array.isArray(value) ? value[0] : value));
        expect(ruleValues).toContain("deny");
        if (plugin !== undefined) expect(printedConfig.plugins).toContain(plugin);
        if (env !== undefined) {
          expect(printedConfig.overrides).toEqual(
            expect.arrayContaining([expect.objectContaining({ env: { [env]: true } })]),
          );
        }
      }

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
