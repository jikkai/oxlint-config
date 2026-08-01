import type { IConfigState, PresetKey } from "./config-state";
import type { IRuleFilters, IRuleRow, RuleView } from "./rules";
import { defaultConfigState, presetKeys, setPreset } from "./config-state";
import { buildScopeSummaries, ruleRowId } from "./rules";

export type ExplorerLanguage = "en" | "zh";
export type ExplorerTab = "rules" | "presets" | "scopes" | "config";

export interface IExplorerState {
  config: IConfigState;
  filters: IRuleFilters;
  lang: ExplorerLanguage;
  selectedRule?: string;
  tab: ExplorerTab;
  view: RuleView;
}

const presetTokenByKey: Readonly<Partial<Record<PresetKey, string>>> = {
  cypress: "cypress",
  imports: "imports",
  jest: "jest",
  jsdoc: "jsdoc",
  jsxA11y: "jsx-a11y",
  mocha: "mocha",
  nextjs: "nextjs",
  node: "node",
  playwright: "playwright",
  promise: "promise",
  react: "react",
  reactPerf: "react-perf",
  regexp: "regexp",
  sonarjs: "sonarjs",
  storybook: "storybook",
  tailwindcss: "tailwindcss",
  testingLibrary: "testing-library",
  typeAware: "type-aware",
  typescript: "typescript",
  vitest: "vitest",
  vue: "vue",
};

const presetKeyByToken = new Map(
  Object.entries(presetTokenByKey).map(([key, token]) => [token, key as PresetKey]),
);

export const defaultExplorerState: IExplorerState = {
  config: defaultConfigState,
  filters: {},
  lang: "en",
  selectedRule: undefined,
  tab: "rules",
  view: "enabled",
};

function freshDefaultExplorerState(): IExplorerState {
  return {
    ...defaultExplorerState,
    config: { ...defaultConfigState },
    filters: {},
  };
}

function getSingle(params: URLSearchParams, key: string): string | undefined {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] : undefined;
}

function hasValidEncoding(search: string): boolean {
  try {
    for (const part of search.replace(/^\?/, "").split("&")) {
      decodeURIComponent(part.replace(/\+/g, " "));
    }
    return true;
  } catch {
    return false;
  }
}

function parseConfigState(value: string): IConfigState {
  let state: IConfigState = {
    ...defaultConfigState,
    imports: false,
    promise: false,
    typescript: false,
  };

  for (const token of new Set(value.split(",").filter(Boolean))) {
    if (token === "-jsx-a11y") {
      state = setPreset(state, "jsxA11y", false);
      continue;
    }
    const key = presetKeyByToken.get(token);
    if (key) state = setPreset(state, key, true);
  }
  return state;
}

function configTokens(state: IConfigState): string[] {
  const tokens: string[] = [];
  for (const key of presetKeys) {
    if (key === "base") continue;
    if (key === "jsxA11y") {
      if (state.jsxA11y === "on") tokens.push("jsx-a11y");
      if (state.jsxA11y === "off") tokens.push("-jsx-a11y");
      continue;
    }
    const token = presetTokenByKey[key];
    if (token && state[key]) tokens.push(token);
  }
  return tokens;
}

function isDefaultConfig(state: IConfigState): boolean {
  return presetKeys.every((key) => key === "base" || state[key] === defaultConfigState[key]);
}

export function parseExplorerState(search: string): IExplorerState {
  if (!hasValidEncoding(search)) return freshDefaultExplorerState();

  const state = freshDefaultExplorerState();
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  const lang = getSingle(params, "lang");
  const tab = getSingle(params, "tab");
  const view = getSingle(params, "view");
  const severity = getSingle(params, "severity");
  const ruleState = getSingle(params, "state");

  if (lang === "zh" || lang === "en") state.lang = lang;
  if (tab === "rules" || tab === "presets" || tab === "scopes" || tab === "config") {
    state.tab = tab;
  }
  if (view === "enabled" || view === "all") state.view = view;

  if (params.getAll("presets").length === 1) {
    state.config = parseConfigState(params.get("presets") ?? "");
  }

  const query = getSingle(params, "q");
  const plugin = getSingle(params, "plugin");
  const preset = getSingle(params, "preset");
  const scope = getSingle(params, "scope");
  if (query) state.filters.query = query;
  if (plugin) state.filters.plugin = plugin;
  if (preset) state.filters.preset = preset;
  if (scope) state.filters.scope = scope;
  if (severity === "allow" || severity === "warn" || severity === "deny") {
    state.filters.severity = severity;
  }
  if (ruleState === "enabled" || ruleState === "disabled") state.filters.state = ruleState;

  const selectedRule = getSingle(params, "rule");
  if (selectedRule) state.selectedRule = selectedRule;
  return state;
}

export function serializeExplorerState(state: IExplorerState): string {
  const params = new URLSearchParams();
  if (state.lang !== "en") params.set("lang", state.lang);
  if (state.tab !== "rules") params.set("tab", state.tab);
  if (!isDefaultConfig(state.config)) params.set("presets", configTokens(state.config).join(","));
  if (state.view !== "enabled") params.set("view", state.view);
  if (state.filters.query) params.set("q", state.filters.query);
  if (state.filters.plugin) params.set("plugin", state.filters.plugin);
  if (state.filters.preset) params.set("preset", state.filters.preset);
  if (state.filters.severity) params.set("severity", state.filters.severity);
  if (state.filters.state) params.set("state", state.filters.state);
  if (state.filters.scope) params.set("scope", state.filters.scope);
  if (state.selectedRule) params.set("rule", state.selectedRule);
  return params.toString();
}

export function normalizeExplorerState(
  state: IExplorerState,
  rows: readonly IRuleRow[],
): IExplorerState {
  const plugins = new Set(rows.map((row) => row.plugin));
  const presets = new Set(rows.flatMap((row) => (row.preset ? [row.preset] : [])));
  const scopes = new Set(buildScopeSummaries(rows).map((summary) => summary.id));
  const ruleIds = new Set(rows.map(ruleRowId));
  const states = new Set(rows.map((row) => (row.enabled ? "enabled" : "disabled")));
  const filters = { ...state.filters };

  if (filters.plugin && !plugins.has(filters.plugin)) delete filters.plugin;
  if (filters.preset && !presets.has(filters.preset)) delete filters.preset;
  if (filters.scope && !scopes.has(filters.scope)) delete filters.scope;
  if (filters.state && !states.has(filters.state)) delete filters.state;

  return {
    ...state,
    filters,
    selectedRule:
      state.selectedRule && ruleIds.has(state.selectedRule) ? state.selectedRule : undefined,
  };
}
