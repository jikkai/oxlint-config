import type { OxlintConfig } from "oxlint";
import { defineConfig } from "oxlint";
import type { ITailwindcssOptions } from "./presets.js";
import { selectExperimental } from "./experimental.js";
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
} from "./presets.js";

export interface IExperimentalOptions {
  cypress?: boolean;
  mocha?: boolean;
  playwright?: boolean;
  regexp?: boolean;
  sonarjs?: boolean;
  storybook?: boolean;
  testingLibrary?: boolean;
}

export interface IAmamoOptions {
  experimental?: IExperimentalOptions;
  ignores?: string[];
  imports?: boolean;
  jsdoc?: boolean;
  jsxA11y?: boolean;
  nextjs?: boolean;
  node?: boolean;
  promise?: boolean;
  react?: boolean;
  reactPerf?: boolean;
  rules?: OxlintConfig["rules"];
  tailwindcss?: ITailwindcssOptions;
  test?: "jest" | "vitest" | readonly ("jest" | "vitest")[] | false;
  typeAware?: boolean;
  typescript?: boolean;
  vue?: boolean;
}

export default function amamo(
  options: IAmamoOptions = {},
  ...overrides: OxlintConfig[]
): OxlintConfig {
  const selected: OxlintConfig[] = [base];

  if (options.typescript ?? true) selected.push(typescript);
  if (options.imports ?? true) selected.push(imports);
  if (options.promise ?? true) selected.push(promise);

  const useReact = options.nextjs === true || options.react === true;
  const useA11y = options.jsxA11y ?? useReact;
  const tests =
    options.test === false || options.test === undefined
      ? []
      : typeof options.test === "string"
        ? [options.test]
        : options.test;

  const selectedTests = new Set(tests);

  if (useReact) selected.push(react);
  if (options.reactPerf === true) selected.push(reactPerf);
  if (options.nextjs === true) selected.push(nextjs);
  if (useA11y) selected.push(jsxA11y);
  if (options.vue === true) selected.push(vue);
  if (options.tailwindcss) selected.push(tailwindcss(options.tailwindcss));
  if (options.node === true) selected.push(node);
  if (options.jsdoc === true) selected.push(jsdoc);
  if (selectedTests.has("jest")) selected.push(jest);
  if (selectedTests.has("vitest")) selected.push(vitest);
  selected.push(...selectExperimental(options.experimental));
  if (options.rules) selected.push(defineConfig({ rules: options.rules }));

  return defineConfig({
    extends: [...selected, ...overrides],
    ...(options.ignores ? { ignorePatterns: options.ignores } : {}),
    ...(options.typeAware ? { options: { typeAware: true } } : {}),
    ...(options.tailwindcss ? { settings: { tailwindcss: options.tailwindcss } } : {}),
  });
}
