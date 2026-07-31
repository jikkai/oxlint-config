import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  IRuleApplication,
  IRuleInventoryItem,
  IRuleSnapshot,
  RuleSeverity,
} from "../src/lib/rule-types.ts";

export interface INormalizedRuleSetting {
  options: unknown[];
  severity: RuleSeverity;
}

export interface INormalizedOverride {
  rules: Record<string, INormalizedRuleSetting>;
  scopes: string[];
}

export interface INormalizedPrintConfig {
  options: Record<string, unknown>;
  overrides: INormalizedOverride[];
  plugins: string[];
  rules: Record<string, INormalizedRuleSetting>;
}

const stablePresetNames = [
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
] as const;

const experimentalPresetNames = [
  "cypress",
  "mocha",
  "playwright",
  "regexp",
  "sonarjs",
  "storybook",
  "testingLibrary",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sorted<T>(values: T[], compare?: (left: T, right: T) => number): T[] {
  return (
    values as T[] & {
      toSorted: (compare?: (left: T, right: T) => number) => T[];
    }
  ).toSorted(compare);
}

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    sorted(Object.entries(record), ([left], [right]) => compareCodeUnits(left, right)),
  );
}

export function sortDeterministically(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeterministically);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    sorted(Object.entries(value), ([left], [right]) => compareCodeUnits(left, right)).map(
      ([key, child]) => [key, sortDeterministically(child)],
    ),
  );
}

export async function settleAllOrThrow<T>(promises: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(promises);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

export function selectExperimentalPreset(
  preset: string,
  select: (options: Record<string, boolean>) => unknown[],
): unknown {
  const selected = select({ [preset]: true });
  if (selected.length !== 1) {
    throw new Error(`Experimental selector must return exactly one ${preset} adapter`);
  }
  return selected[0];
}

export function normalizeRuleSetting(value: unknown): INormalizedRuleSetting {
  const parts = Array.isArray(value) ? value : [value];
  const rawSeverity = parts[0];
  const severity = (() => {
    if (rawSeverity === "error" || rawSeverity === "deny" || rawSeverity === 2) return "deny";
    if (rawSeverity === "warn" || rawSeverity === 1) return "warn";
    if (rawSeverity === "off" || rawSeverity === "allow" || rawSeverity === 0) return "allow";
    throw new Error(`Unknown rule severity: ${JSON.stringify(rawSeverity)}`);
  })();
  const options = parts.length === 2 && Array.isArray(parts[1]) ? parts[1] : parts.slice(1);

  return { options, severity };
}

export function normalizePluginName(plugin: string): string {
  if (plugin === "core" || plugin === "eslint") return "eslint";
  if (plugin === "jsx_a11y") return "jsx-a11y";
  if (plugin === "react_perf") return "react-perf";
  return plugin;
}

export function normalizeRuleIdentifier(identifier: string): { plugin: string; rule: string } {
  const slash = identifier.indexOf("/");
  if (slash === -1) return { plugin: "eslint", rule: identifier };

  const plugin = normalizePluginName(identifier.slice(0, slash));
  return { plugin, rule: `${plugin}/${identifier.slice(slash + 1)}` };
}

export function createNativeDocsUrl(identifier: string): string {
  const { plugin, rule } = normalizeRuleIdentifier(identifier);
  const pluginSlug =
    plugin === "jsx-a11y" ? "jsx_a11y" : plugin === "react-perf" ? "react_perf" : plugin;
  const ruleName = rule.includes("/") ? rule.slice(rule.indexOf("/") + 1) : rule;
  return `https://oxc.rs/docs/guide/usage/linter/rules/${pluginSlug}/${ruleName}.html`;
}

function normalizeRuleMap(value: Record<string, unknown>): Record<string, INormalizedRuleSetting> {
  const rules: Record<string, INormalizedRuleSetting> = {};
  for (const [identifier, setting] of Object.entries(value)) {
    const { rule } = normalizeRuleIdentifier(identifier);
    rules[rule] = normalizeRuleSetting(setting);
  }
  return sortRecord(rules);
}

export function parsePrintConfig(output: string, label: string): INormalizedPrintConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed ${label} --print-config output: invalid JSON (${detail})`, {
      cause: error,
    });
  }

  if (!isRecord(parsed) || !isRecord(parsed.rules)) {
    throw new Error(`Malformed ${label} --print-config output: expected a rules object`);
  }
  if (
    parsed.plugins !== undefined &&
    (!Array.isArray(parsed.plugins) || !parsed.plugins.every((item) => typeof item === "string"))
  ) {
    throw new Error(`Malformed ${label} --print-config output: expected plugins to be strings`);
  }
  if (parsed.overrides !== undefined && !Array.isArray(parsed.overrides)) {
    throw new Error(`Malformed ${label} --print-config output: expected overrides to be an array`);
  }
  if (parsed.options !== undefined && !isRecord(parsed.options)) {
    throw new Error(`Malformed ${label} --print-config output: expected options to be an object`);
  }

  const overrides = (parsed.overrides ?? []).map((override, index) => {
    if (
      !isRecord(override) ||
      !Array.isArray(override.files) ||
      !override.files.every((item) => typeof item === "string") ||
      !isRecord(override.rules)
    ) {
      throw new Error(
        `Malformed ${label} --print-config output: override ${index} needs string files and a rules object`,
      );
    }
    return {
      rules: normalizeRuleMap(override.rules),
      scopes: sorted(override.files, compareCodeUnits),
    };
  });

  return {
    options: parsed.options ?? {},
    overrides,
    plugins: sorted((parsed.plugins ?? []).map(normalizePluginName), compareCodeUnits),
    rules: normalizeRuleMap(parsed.rules),
  };
}

export function extractRuleSchema(schema: unknown): {
  inventory: IRuleInventoryItem[];
  schemaDefinitions: Record<string, unknown>;
} {
  const definitions =
    isRecord(schema) && isRecord(schema.definitions) ? schema.definitions : undefined;
  const dummyRuleMap =
    definitions && isRecord(definitions.DummyRuleMap) ? definitions.DummyRuleMap : undefined;
  const properties =
    dummyRuleMap && isRecord(dummyRuleMap.properties) ? dummyRuleMap.properties : undefined;
  if (!definitions || !properties) {
    throw new Error(
      "Malformed Oxlint schema: expected definitions.DummyRuleMap.properties to be an object",
    );
  }

  const inventory = sorted(
    Object.entries(properties).map(([identifier, configurationSchema]) => {
      const { plugin, rule } = normalizeRuleIdentifier(identifier);
      return {
        configurationSchema,
        docsUrl: createNativeDocsUrl(rule),
        plugin,
        rule,
      };
    }),
    (left, right) => compareCodeUnits(left.rule, right.rule),
  );

  return {
    inventory,
    schemaDefinitions: sortDeterministically(definitions) as Record<string, unknown>,
  };
}

function settingsEqual(
  left: INormalizedRuleSetting | undefined,
  right: INormalizedRuleSetting,
): boolean {
  return (
    left !== undefined &&
    JSON.stringify(sortDeterministically(left)) === JSON.stringify(sortDeterministically(right))
  );
}

function scopeKey(scopes: string[]): string {
  return JSON.stringify(scopes);
}

export function diffProfiles(
  base: INormalizedPrintConfig,
  profile: INormalizedPrintConfig,
): Pick<INormalizedPrintConfig, "overrides" | "rules"> {
  const rules = Object.fromEntries(
    Object.entries(profile.rules).filter(
      ([rule, setting]) => !settingsEqual(base.rules[rule], setting),
    ),
  );
  const baseOverrides = new Map(
    base.overrides.map((override) => [scopeKey(override.scopes), override]),
  );
  const overrides = profile.overrides.flatMap((override) => {
    const baseOverride = baseOverrides.get(scopeKey(override.scopes));
    const changedRules = Object.fromEntries(
      Object.entries(override.rules).filter(
        ([rule, setting]) => !settingsEqual(baseOverride?.rules[rule], setting),
      ),
    );
    return Object.keys(changedRules).length === 0
      ? []
      : [{ rules: sortRecord(changedRules), scopes: override.scopes }];
  });

  return { overrides, rules: sortRecord(rules) };
}

export function verifyStableProfileUnion(
  base: INormalizedPrintConfig,
  contributions: Pick<INormalizedPrintConfig, "overrides" | "rules">[],
  aggregate: INormalizedPrintConfig,
): void {
  const rules = { ...base.rules };
  for (const contribution of contributions) Object.assign(rules, contribution.rules);
  const union = {
    overrides: [
      ...base.overrides,
      ...contributions.flatMap((contribution) => contribution.overrides),
    ],
    rules: sortRecord(rules),
  };
  const expected = { overrides: aggregate.overrides, rules: aggregate.rules };
  if (
    JSON.stringify(sortDeterministically(union)) !== JSON.stringify(sortDeterministically(expected))
  ) {
    throw new Error(
      "Stable aggregate rules and overrides differ from the controlled profile union",
    );
  }
}

function applicationsForContribution(
  preset: string,
  contribution: Pick<INormalizedPrintConfig, "overrides" | "rules">,
): IRuleApplication[] {
  const applications: IRuleApplication[] = [];
  for (const [rule, setting] of Object.entries(contribution.rules)) {
    const { plugin } = normalizeRuleIdentifier(rule);
    applications.push({
      docsUrl: createNativeDocsUrl(rule),
      external: false,
      options: setting.options,
      plugin,
      preset,
      rule,
      scopes: [],
      severity: setting.severity,
    });
  }
  for (const override of contribution.overrides) {
    for (const [rule, setting] of Object.entries(override.rules)) {
      const { plugin } = normalizeRuleIdentifier(rule);
      applications.push({
        docsUrl: createNativeDocsUrl(rule),
        external: false,
        options: setting.options,
        plugin,
        preset,
        rule,
        scopes: override.scopes,
        severity: setting.severity,
      });
    }
  }

  return sorted(
    applications,
    (left, right) =>
      compareCodeUnits(left.rule, right.rule) ||
      Number(left.scopes.length > 0) - Number(right.scopes.length > 0) ||
      compareCodeUnits(scopeKey(left.scopes), scopeKey(right.scopes)) ||
      compareCodeUnits(left.severity, right.severity) ||
      compareCodeUnits(JSON.stringify(left.options), JSON.stringify(right.options)),
  );
}

function assertValidTemporaryRoot(root: string, temporaryBase: string): void {
  if (
    dirname(root) !== temporaryBase ||
    !basename(root).startsWith("amamo-oxlint-rules-") ||
    !root.startsWith(`${temporaryBase}${sep}`)
  ) {
    throw new Error(`Refusing to clean an unvalidated temporary path: ${root}`);
  }
}

export async function generateRuleSnapshot(): Promise<IRuleSnapshot> {
  const require = createRequire(import.meta.url);
  const scriptPath = fileURLToPath(import.meta.url);
  const docsRoot = resolve(dirname(scriptPath), "..");
  const repositoryRoot = resolve(docsRoot, "..");
  const packageEntryUrl = pathToFileURL(resolve(repositoryRoot, "dist/index.js")).href;
  const experimentalEntryUrl = pathToFileURL(resolve(repositoryRoot, "dist/experimental.js")).href;
  const oxlintPackagePath = require.resolve("oxlint/package.json");
  const oxlintRoot = dirname(oxlintPackagePath);
  const [packageText, oxlintPackageText, schemaText] = await Promise.all([
    readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    readFile(oxlintPackagePath, "utf8"),
    readFile(resolve(oxlintRoot, "configuration_schema.json"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText) as unknown;
  const oxlintPackageJson = JSON.parse(oxlintPackageText) as unknown;
  const schema = JSON.parse(schemaText) as unknown;
  if (!isRecord(packageJson) || typeof packageJson.version !== "string") {
    throw new Error("Malformed package.json: expected a version string");
  }
  if (
    !isRecord(oxlintPackageJson) ||
    typeof oxlintPackageJson.version !== "string" ||
    !isRecord(oxlintPackageJson.bin) ||
    typeof oxlintPackageJson.bin.oxlint !== "string"
  ) {
    throw new Error("Malformed oxlint/package.json: expected version and bin.oxlint strings");
  }
  const oxlintBin = resolve(oxlintRoot, oxlintPackageJson.bin.oxlint);
  const { inventory, schemaDefinitions } = extractRuleSchema(schema);
  const temporaryBase = await realpath(tmpdir());
  const temporaryRoot = await mkdtemp(join(temporaryBase, "amamo-oxlint-rules-"));
  assertValidTemporaryRoot(temporaryRoot, temporaryBase);

  try {
    const placeholderPath = resolve(temporaryRoot, "placeholder.js");
    await writeFile(placeholderPath, "");

    const runPrintConfig = (configPath: string, label: string) =>
      new Promise<INormalizedPrintConfig>((resolvePrint, rejectPrint) => {
        const child = spawn(
          process.execPath,
          [oxlintBin, "--config", configPath, "--print-config", placeholderPath],
          { shell: false, stdio: ["ignore", "pipe", "pipe"] },
        );
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        child.on("error", (error) => {
          rejectPrint(new Error(`Failed to run Oxlint for ${label}: ${error.message}`));
        });
        child.on("close", (code) => {
          if (code !== 0) {
            rejectPrint(
              new Error(`Oxlint ${label} --print-config exited with ${code}: ${stderr.trim()}`),
            );
            return;
          }
          try {
            resolvePrint(parsePrintConfig(stdout, label));
          } catch (error) {
            rejectPrint(error);
          }
        });
      });

    const profiles = new Map<string, INormalizedPrintConfig>(
      await settleAllOrThrow(
        stablePresetNames.map(async (preset) => {
          const configPath = resolve(temporaryRoot, `${preset}.config.mjs`);
          const importedNames = preset === "base" ? "base" : `base, ${preset}`;
          const extendedNames = preset === "base" ? "base" : `base, ${preset}`;
          await writeFile(
            configPath,
            `import { ${importedNames} } from ${JSON.stringify(packageEntryUrl)};\n\nexport default { plugins: [], extends: [${extendedNames}] };\n`,
          );
          return [preset, await runPrintConfig(configPath, `${preset} profile`)] as const;
        }),
      ),
    );

    const typeAwareConfigPath = resolve(temporaryRoot, "typeAware.config.mjs");
    await writeFile(
      typeAwareConfigPath,
      `import { base } from ${JSON.stringify(packageEntryUrl)};\n\nexport default { plugins: [], extends: [base], options: { typeAware: true } };\n`,
    );
    const typeAwareProfile = await runPrintConfig(typeAwareConfigPath, "typeAware profile");
    const baseProfile = profiles.get("base");
    if (!baseProfile) throw new Error("Controlled Base profile was not generated");

    for (const [preset, profile] of profiles) {
      if (preset !== "typescript" && profile.plugins.includes("typescript")) {
        throw new Error(`Controlled ${preset} profile inherited an implicit TypeScript plugin`);
      }
    }
    const typeAwareContribution = diffProfiles(baseProfile, typeAwareProfile);
    if (
      typeAwareProfile.options.typeAware !== true ||
      Object.keys(typeAwareContribution.rules).length !== 0 ||
      typeAwareContribution.overrides.length !== 0
    ) {
      throw new Error(
        "Type-aware mode must change options.typeAware without changing rules or overrides",
      );
    }

    const contributions = stablePresetNames.slice(1).map((preset) => {
      const profile = profiles.get(preset);
      if (!profile) throw new Error(`Controlled ${preset} profile was not generated`);
      return [preset, diffProfiles(baseProfile, profile)] as const;
    });
    const stableAggregate = await runPrintConfig(
      resolve(repositoryRoot, "fixtures/stable.config.mjs"),
      "stable aggregate",
    );
    verifyStableProfileUnion(
      baseProfile,
      contributions.map(([, contribution]) => contribution),
      stableAggregate,
    );

    const presets: Record<string, IRuleApplication[]> = {
      base: applicationsForContribution("base", baseProfile),
      typeAware: [],
    };
    for (const [preset, contribution] of contributions) {
      presets[preset] = applicationsForContribution(preset, contribution);
    }

    const experimentalPrint = await runPrintConfig(
      resolve(repositoryRoot, "fixtures/experimental.config.mjs"),
      "experimental aggregate",
    );
    const experimentalModule = (await import(experimentalEntryUrl)) as {
      experimentalPackages: Readonly<Record<string, string>>;
      selectExperimental: (options: Record<string, boolean>) => unknown[];
    };
    if (
      Reflect.ownKeys(experimentalModule.experimentalPackages).length !==
        experimentalPresetNames.length ||
      experimentalPresetNames.some(
        (preset) => typeof experimentalModule.experimentalPackages[preset] !== "string",
      )
    ) {
      throw new Error("Experimental package map does not match the seven configured presets");
    }
    const selectedExperimental = Object.fromEntries(
      experimentalPresetNames.map((preset) => [
        preset,
        selectExperimentalPreset(preset, experimentalModule.selectExperimental),
      ]),
    );

    const experimentalApplications = await settleAllOrThrow(
      experimentalPresetNames.map(async (preset) => {
        const selected = selectedExperimental[preset];
        const packageSpecifier = experimentalModule.experimentalPackages[preset];
        if (
          !isRecord(selected) ||
          !Array.isArray(selected.jsPlugins) ||
          !isRecord(selected.jsPlugins[0])
        ) {
          throw new Error(`Malformed ${preset} experimental adapter: expected jsPlugins metadata`);
        }
        const pluginName = selected.jsPlugins[0].name;
        if (typeof pluginName !== "string" || typeof packageSpecifier !== "string") {
          throw new Error(
            `Malformed ${preset} experimental adapter: expected plugin name and package`,
          );
        }
        const configuredRules = Array.isArray(selected.overrides)
          ? selected.overrides.flatMap((override) =>
              isRecord(override) && isRecord(override.rules) ? Object.keys(override.rules) : [],
            )
          : [];
        if (configuredRules.length !== 1 || !configuredRules[0]?.startsWith(`${pluginName}/`)) {
          throw new Error(`Malformed ${preset} experimental adapter: expected one prefixed rule`);
        }
        const { plugin: pluginLabel, rule } = normalizeRuleIdentifier(configuredRules[0]);
        const matches = experimentalPrint.overrides.flatMap((override) => {
          const setting = override.rules[rule];
          return setting ? [{ scopes: override.scopes, setting }] : [];
        });
        if (matches.length !== 1) {
          throw new Error(`Experimental aggregate did not contain exactly one ${rule} application`);
        }

        const pluginModule = (await import(packageSpecifier)) as Record<string, unknown>;
        const plugin = isRecord(pluginModule.default) ? pluginModule.default : pluginModule;
        const pluginRules = isRecord(plugin.rules) ? plugin.rules : undefined;
        const ruleName = configuredRules[0].slice(configuredRules[0].indexOf("/") + 1);
        const ruleModule =
          pluginRules && isRecord(pluginRules[ruleName]) ? pluginRules[ruleName] : undefined;
        const meta = ruleModule && isRecord(ruleModule.meta) ? ruleModule.meta : undefined;
        const docs = meta && isRecord(meta.docs) ? meta.docs : undefined;
        const description =
          docs && typeof docs.description === "string" ? docs.description : undefined;
        const docsUrl = docs && typeof docs.url === "string" ? docs.url : "";
        const { scopes, setting } = matches[0];
        return [
          preset,
          {
            ...(description ? { description } : {}),
            docsUrl,
            external: true,
            options: setting.options,
            plugin: pluginLabel,
            preset,
            rule,
            scopes,
            severity: setting.severity,
          },
        ] as const;
      }),
    );
    for (const [preset, application] of experimentalApplications) {
      presets[preset] = [application];
    }

    return sortDeterministically({
      inventory,
      oxlintVersion: oxlintPackageJson.version,
      packageVersion: packageJson.version,
      presets,
      schemaDefinitions,
    }) as IRuleSnapshot;
  } finally {
    assertValidTemporaryRoot(temporaryRoot, temporaryBase);
    await rm(temporaryRoot, { recursive: true });
  }
}

export function serializeRuleSnapshot(snapshot: IRuleSnapshot): string {
  return `${JSON.stringify(sortDeterministically(snapshot), null, 2)}\n`;
}

export async function writeRuleSnapshot(): Promise<void> {
  const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const generatedRoot = resolve(docsRoot, ".generated");
  await mkdir(generatedRoot, { recursive: true });
  await writeFile(
    resolve(generatedRoot, "rules.json"),
    serializeRuleSnapshot(await generateRuleSnapshot()),
  );
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  try {
    await writeRuleSnapshot();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
