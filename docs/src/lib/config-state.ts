export type PresetKey =
  | "base"
  | "typescript"
  | "imports"
  | "promise"
  | "react"
  | "reactPerf"
  | "nextjs"
  | "jsxA11y"
  | "vue"
  | "node"
  | "jsdoc"
  | "jest"
  | "vitest"
  | "typeAware"
  | "cypress"
  | "mocha"
  | "playwright"
  | "regexp"
  | "sonarjs"
  | "storybook"
  | "testingLibrary";

export interface IConfigState {
  base: boolean;
  cypress: boolean;
  imports: boolean;
  jest: boolean;
  jsdoc: boolean;
  jsxA11y: "auto" | "on" | "off";
  mocha: boolean;
  nextjs: boolean;
  node: boolean;
  playwright: boolean;
  promise: boolean;
  react: boolean;
  reactPerf: boolean;
  regexp: boolean;
  sonarjs: boolean;
  storybook: boolean;
  testingLibrary: boolean;
  typeAware: boolean;
  typescript: boolean;
  vitest: boolean;
  vue: boolean;
}

export const presetKeys: readonly PresetKey[] = [
  "base",
  "typescript",
  "imports",
  "promise",
  "react",
  "reactPerf",
  "nextjs",
  "jsxA11y",
  "vue",
  "node",
  "jsdoc",
  "jest",
  "vitest",
  "typeAware",
  "cypress",
  "mocha",
  "playwright",
  "regexp",
  "sonarjs",
  "storybook",
  "testingLibrary",
];

const experimentalPackages: Readonly<Partial<Record<PresetKey, string>>> = {
  cypress: "eslint-plugin-cypress",
  mocha: "eslint-plugin-mocha",
  playwright: "eslint-plugin-playwright",
  regexp: "eslint-plugin-regexp",
  sonarjs: "eslint-plugin-sonarjs",
  storybook: "eslint-plugin-storybook",
  testingLibrary: "eslint-plugin-testing-library",
};

export const defaultConfigState: IConfigState = {
  base: true,
  cypress: false,
  imports: true,
  jest: false,
  jsdoc: false,
  jsxA11y: "auto",
  mocha: false,
  nextjs: false,
  node: false,
  playwright: false,
  promise: true,
  react: false,
  reactPerf: false,
  regexp: false,
  sonarjs: false,
  storybook: false,
  testingLibrary: false,
  typeAware: false,
  typescript: true,
  vitest: false,
  vue: false,
};

export function allStableConfigState(): IConfigState {
  return {
    ...defaultConfigState,
    jest: true,
    jsdoc: true,
    nextjs: true,
    node: true,
    react: true,
    reactPerf: true,
    vitest: true,
    vue: true,
  };
}

export function setPreset(state: IConfigState, key: PresetKey, enabled: boolean): IConfigState {
  if (key === "base" || (key === "react" && !enabled && state.nextjs)) return state;
  if (key === "jsxA11y") return { ...state, jsxA11y: enabled ? "on" : "off" };
  return { ...state, [key]: enabled };
}

export function isPresetEnabled(state: IConfigState, key: PresetKey): boolean {
  if (key === "base") return true;
  if (key === "react") return state.react || state.nextjs;
  if (key === "jsxA11y") {
    return state.jsxA11y === "on" || (state.jsxA11y === "auto" && (state.react || state.nextjs));
  }
  return state[key];
}

export function activePresetKeys(state: IConfigState): PresetKey[] {
  return presetKeys.filter((key) => isPresetEnabled(state, key));
}

export function renderConfigSnippet(state: IConfigState): string {
  const lines: string[] = [];

  if (!state.typescript) lines.push("  typescript: false,");
  if (!state.imports) lines.push("  imports: false,");
  if (!state.promise) lines.push("  promise: false,");
  if (state.react && !state.nextjs) lines.push("  react: true,");
  if (state.reactPerf) lines.push("  reactPerf: true,");
  if (state.nextjs) lines.push("  nextjs: true,");
  if (state.jsxA11y !== "auto") lines.push(`  jsxA11y: ${state.jsxA11y === "on"},`);
  if (state.vue) lines.push("  vue: true,");
  if (state.node) lines.push("  node: true,");
  if (state.jsdoc) lines.push("  jsdoc: true,");

  const tests = [state.jest && "jest", state.vitest && "vitest"].filter(Boolean);
  if (tests.length === 1) lines.push(`  test: ${JSON.stringify(tests[0])},`);
  if (tests.length === 2) {
    lines.push(`  test: [${tests.map((test) => JSON.stringify(test)).join(", ")}],`);
  }
  if (state.typeAware) lines.push("  typeAware: true,");

  const experimental = presetKeys.filter(
    (key) => experimentalPackages[key] !== undefined && isPresetEnabled(state, key),
  );
  if (experimental.length > 0) {
    lines.push("  experimental: {");
    lines.push(...experimental.map((key) => `    ${key}: true,`));
    lines.push("  },");
  }

  return lines.length === 0 ? "amamo()" : ["amamo({", ...lines, "})"].join("\n");
}

export function requiredPackages(state: IConfigState): string[] {
  const packages = state.typeAware ? ["oxlint-tsgolint"] : [];
  for (const key of presetKeys) {
    const packageName = experimentalPackages[key];
    if (packageName && isPresetEnabled(state, key)) packages.push(packageName);
  }
  return packages;
}
