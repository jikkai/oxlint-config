/// <reference types="node" />

import type { FileHandle } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  glob,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { IAmamoOptions, IExperimentalOptions } from "./config.js";
import type { IJsoncMergeResult, JsoncOperation } from "./jsonc.js";
import { experimentalPackages } from "./experimental.js";
import { createVSCodeInitializationPlan } from "./initializer/vscode.js";
import { createZedInitializationPlan } from "./initializer/zed.js";
import { applyJsoncOperations } from "./jsonc.js";

export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

export interface IDetectedFeatures {
  experimental: Record<keyof IExperimentalOptions, boolean>;
  jest: boolean;
  nextjs: boolean;
  node: boolean;
  react: boolean;
  tailwindcss?: string;
  typescript: boolean;
  vitest: boolean;
  vue: boolean;
}

export interface IProjectDetection {
  features: IDetectedFeatures;
  manifestPaths: string[];
  packageManager?: PackageManager;
  packageManagerConflicts: PackageManager[];
  rootDir: string;
  warnings: string[];
}

export interface IInitializationChoices {
  experimental: Record<keyof IExperimentalOptions, boolean>;
  jsdoc: boolean;
  nextjs: boolean;
  node: boolean;
  react: boolean;
  reactPerf: boolean;
  tailwindcss?: string;
  test: readonly ("jest" | "vitest")[];
  typeAware: boolean;
  typescript: boolean;
  vue: boolean;
}

export interface IFileChange {
  content: string;
  existed: boolean;
  originalHash?: string;
  path: string;
}

export interface IInitializationPlan {
  choices: IInitializationChoices;
  conflicts: string[];
  files: IFileChange[];
  install: { args: string[]; command: string; display: string };
  lintConfigSnippet?: string;
  notices: string[];
  rootDir: string;
}

export type RunCommand = (command: string, args: readonly string[], cwd: string) => Promise<void>;

export interface IExecutionOptions {
  dryRun: boolean;
  noInstall: boolean;
}

export interface IExecutionResult {
  installed: boolean;
  notices: string[];
  written: string[];
}

type JsonObject = Record<string, unknown>;

interface IReadFileState {
  content: string;
  existed: boolean;
  originalHash?: string;
}

const packageManagers = [
  ["pnpm", "pnpm-lock.yaml"],
  ["npm", "package-lock.json"],
  ["yarn", "yarn.lock"],
  ["bun", "bun.lock"],
] as const satisfies readonly (readonly [PackageManager, string])[];

const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const experimentalKeys = Object.keys(experimentalPackages) as Array<keyof IExperimentalOptions>;

const lintConfigPaths = [
  ".oxlintrc.json",
  ".oxlintrc.jsonc",
  "oxlint.config.ts",
  "oxlint.config.mts",
] as const;

const scriptOperations = [
  { kind: "setIfMissing", path: ["scripts", "lint"], value: "oxlint ." },
  { kind: "setIfMissing", path: ["scripts", "lint:fix"], value: "oxlint --fix ." },
  { kind: "setIfMissing", path: ["scripts", "format"], value: "oxfmt ." },
  { kind: "setIfMissing", path: ["scripts", "format:check"], value: "oxfmt --check ." },
] as const satisfies readonly JsoncOperation[];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readManifest(path: string, warnings: string[]): Promise<JsonObject | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isJsonObject(parsed)) {
      warnings.push(`Skipped non-object manifest: ${path}`);
      return undefined;
    }
    return parsed;
  } catch (error) {
    warnings.push(`Skipped unreadable manifest ${path}: ${errorMessage(error)}`);
    return undefined;
  }
}

function packageJsonWorkspacePatterns(manifest: JsonObject | undefined): string[] {
  const workspaces = manifest?.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces.filter((value): value is string => typeof value === "string");
  }
  if (!isJsonObject(workspaces) || !Array.isArray(workspaces.packages)) return [];
  return workspaces.packages.filter((value): value is string => typeof value === "string");
}

// ponytail: supports pnpm's packages list; add a YAML parser only when real workspaces require richer YAML.
function pnpmWorkspacePatterns(source: string, warnings: string[]): string[] {
  const patterns: string[] = [];
  let packagesIndent = -1;

  for (const line of source.split(/\r?\n/)) {
    if (packagesIndent === -1) {
      const packagesMatch = /^packages\s*:(.*)$/.exec(line);
      if (!packagesMatch) continue;

      const suffix = packagesMatch[1]?.replace(/#.*$/, "").trim();
      if (suffix) {
        warnings.push(`Skipped unsupported pnpm packages value: ${suffix}`);
        break;
      }
      packagesIndent = 0;
      continue;
    }

    const indentation = line.search(/\S/);
    if (indentation === -1 || /^\s*#/.test(line)) continue;
    if (indentation <= packagesIndent) break;

    const item = /^\s*-\s*(?:"([^"]*)"|'([^']*)'|([^#]*?))\s*(?:#.*)?$/.exec(line);
    const quoted = item?.[1] !== undefined || item?.[2] !== undefined;
    const pattern = (item?.[1] ?? item?.[2] ?? item?.[3])?.trim();
    if (
      !pattern ||
      pattern.includes("${") ||
      (!quoted &&
        (pattern.startsWith("*") ||
          pattern.startsWith("!") ||
          pattern.startsWith("&") ||
          pattern.startsWith("[") ||
          pattern.startsWith("{")))
    ) {
      warnings.push(`Skipped unsupported pnpm workspace entry: ${line.trim()}`);
      continue;
    }
    patterns.push(pattern);
  }

  return patterns;
}

async function readPnpmWorkspacePatterns(rootDir: string, warnings: string[]): Promise<string[]> {
  const path = join(rootDir, "pnpm-workspace.yaml");
  try {
    return pnpmWorkspacePatterns(await readFile(path, "utf8"), warnings);
  } catch (error) {
    if (isJsonObject(error) && error.code === "ENOENT") return [];
    warnings.push(`Skipped unreadable pnpm workspace ${path}: ${errorMessage(error)}`);
    return [];
  }
}

async function expandWorkspacePatterns(
  rootDir: string,
  patterns: readonly string[],
  warnings: string[],
): Promise<string[]> {
  const manifestPaths = new Set<string>();

  for (const pattern of patterns) {
    const manifestPattern = `${pattern.replace(/\/+$/, "")}/package.json`;
    try {
      for await (const match of glob(manifestPattern, { cwd: rootDir })) {
        manifestPaths.add(resolve(rootDir, match));
      }
    } catch (error) {
      warnings.push(`Skipped invalid workspace glob ${pattern}: ${errorMessage(error)}`);
    }
  }

  return [...manifestPaths].sort();
}

function addDependencies(manifest: JsonObject, dependencies: Set<string>): void {
  for (const section of dependencySections) {
    const values = manifest[section];
    if (!isJsonObject(values)) continue;
    for (const dependency of Object.keys(values)) dependencies.add(dependency);
  }
}

async function hasRootTypeScriptConfig(rootDir: string): Promise<boolean> {
  for await (const path of glob("tsconfig*.json", { cwd: rootDir })) {
    if (path === "tsconfig.json" || /^tsconfig\..+\.json$/.test(path)) return true;
  }
  return false;
}

async function detectTailwindcssEntryPoint(
  rootDir: string,
  dependencies: Set<string>,
  warnings: string[],
): Promise<string | undefined> {
  const candidates: string[] = [];

  try {
    for await (const path of glob("**/*.css", {
      cwd: rootDir,
      exclude: [
        "**/.git/**",
        "**/.next/**",
        "**/build/**",
        "**/coverage/**",
        "**/dist/**",
        "**/node_modules/**",
      ],
    })) {
      try {
        const source = (await readFile(join(rootDir, path), "utf8")).replace(
          /\/\*[\s\S]*?(?:\*\/|$)/g,
          "",
        );
        if (/^\s*@import\s+(?:url\(\s*)?["']tailwindcss["']/m.test(source)) candidates.push(path);
      } catch (error) {
        warnings.push(`Skipped unreadable stylesheet ${path}: ${errorMessage(error)}`);
      }
    }
  } catch (error) {
    warnings.push(`Skipped Tailwind CSS entry-point detection: ${errorMessage(error)}`);
    return undefined;
  }

  const sortedCandidates = candidates.toSorted();
  if (sortedCandidates.length === 1) return sortedCandidates[0];
  if (sortedCandidates.length > 1) {
    warnings.push(
      `Multiple Tailwind CSS entry points detected: ${sortedCandidates.join(", ")}. Configure tailwindcss.entryPoint manually.`,
    );
  } else if (dependencies.has("tailwindcss")) {
    warnings.push(
      'Detected tailwindcss but no CSS file importing "tailwindcss". Configure tailwindcss.entryPoint manually.',
    );
  }
  return undefined;
}

async function existingPackageManagers(rootDir: string): Promise<PackageManager[]> {
  const found: PackageManager[] = [];
  for (const [packageManager, lockfile] of packageManagers) {
    try {
      await access(join(rootDir, lockfile));
      found.push(packageManager);
    } catch {
      // A missing lockfile is the ordinary case.
    }
  }
  return found;
}

function packageManagerFromUserAgent(userAgent: string | undefined): PackageManager | undefined {
  return packageManagers.find(([packageManager]) =>
    userAgent?.startsWith(`${packageManager}/`),
  )?.[0];
}

export async function detectProject(
  rootDir: string,
  userAgent?: string,
): Promise<IProjectDetection> {
  const resolvedRootDir = resolve(rootDir);
  const warnings: string[] = [];
  const rootManifestPath = join(resolvedRootDir, "package.json");
  const rootManifest = await readManifest(rootManifestPath, warnings);
  const workspacePatterns = [
    ...packageJsonWorkspacePatterns(rootManifest),
    ...(await readPnpmWorkspacePatterns(resolvedRootDir, warnings)),
  ];
  const workspaceManifestPaths = await expandWorkspacePatterns(
    resolvedRootDir,
    workspacePatterns,
    warnings,
  );
  const manifestPaths: string[] = [];
  const dependencies = new Set<string>();

  if (rootManifest) {
    manifestPaths.push(rootManifestPath);
    addDependencies(rootManifest, dependencies);
  }
  for (const path of workspaceManifestPaths) {
    if (path === rootManifestPath) continue;
    const manifest = await readManifest(path, warnings);
    if (!manifest) continue;
    manifestPaths.push(path);
    addDependencies(manifest, dependencies);
  }

  const experimental = Object.fromEntries(
    Object.entries(experimentalPackages).map(([key, packageName]) => [
      key,
      dependencies.has(packageName),
    ]),
  ) as Record<keyof IExperimentalOptions, boolean>;
  experimental.storybook ||=
    dependencies.has("storybook") ||
    [...dependencies].some((name) => name.startsWith("@storybook/"));

  const userAgentPackageManager = packageManagerFromUserAgent(userAgent);
  const lockfilePackageManagers = await existingPackageManagers(resolvedRootDir);
  const packageManager =
    userAgentPackageManager ??
    (lockfilePackageManagers.length === 1 ? lockfilePackageManagers[0] : undefined);
  const packageManagerConflicts = lockfilePackageManagers.length > 1 ? lockfilePackageManagers : [];
  const rootEngines = rootManifest?.engines;
  const tailwindcss = await detectTailwindcssEntryPoint(resolvedRootDir, dependencies, warnings);

  return {
    features: {
      experimental,
      jest: dependencies.has("jest") || dependencies.has("@jest/globals"),
      nextjs: dependencies.has("next"),
      node:
        (isJsonObject(rootEngines) && typeof rootEngines.node === "string") ||
        ["express", "fastify", "hono", "koa", "@nestjs/core"].some((name) =>
          dependencies.has(name),
        ),
      react: dependencies.has("react"),
      ...(tailwindcss ? { tailwindcss } : {}),
      typescript:
        dependencies.has("typescript") || (await hasRootTypeScriptConfig(resolvedRootDir)),
      vitest: dependencies.has("vitest"),
      vue: dependencies.has("vue"),
    },
    manifestPaths,
    ...(packageManager === undefined ? {} : { packageManager }),
    packageManagerConflicts,
    rootDir: resolvedRootDir,
    warnings,
  };
}

function disabledExperimentalChoices(): Record<keyof IExperimentalOptions, boolean> {
  return Object.fromEntries(experimentalKeys.map((key) => [key, false])) as Record<
    keyof IExperimentalOptions,
    boolean
  >;
}

export function defaultChoices(detection: IProjectDetection): IInitializationChoices {
  const test: Array<"jest" | "vitest"> = [];
  if (detection.features.jest) test.push("jest");
  if (detection.features.vitest) test.push("vitest");

  return {
    experimental: disabledExperimentalChoices(),
    jsdoc: false,
    nextjs: detection.features.nextjs,
    node: detection.features.node,
    react: detection.features.react || detection.features.nextjs,
    reactPerf: false,
    ...(detection.features.tailwindcss ? { tailwindcss: detection.features.tailwindcss } : {}),
    test,
    typeAware: false,
    typescript: detection.features.typescript,
    vue: detection.features.vue,
  };
}

function initializationOptions(choices: IInitializationChoices): IAmamoOptions {
  const experimental = Object.fromEntries(
    experimentalKeys.filter((key) => choices.experimental[key]).map((key) => [key, true]),
  ) as IExperimentalOptions;
  const enabledExperimental = Object.keys(experimental).length > 0;
  const onlyTest = choices.test[0];

  return {
    ...(enabledExperimental ? { experimental } : {}),
    ...(choices.jsdoc ? { jsdoc: true } : {}),
    ...(choices.nextjs ? { nextjs: true } : {}),
    ...(choices.node ? { node: true } : {}),
    ...(choices.react ? { react: true } : {}),
    ...(choices.reactPerf ? { reactPerf: true } : {}),
    ...(choices.tailwindcss ? { tailwindcss: { entryPoint: choices.tailwindcss } } : {}),
    ...(choices.test.length === 1 && onlyTest
      ? { test: onlyTest }
      : choices.test.length > 1
        ? { test: choices.test }
        : {}),
    ...(choices.typeAware ? { typeAware: true } : {}),
    typescript: choices.typescript,
    ...(choices.vue ? { vue: true } : {}),
  };
}

function quote(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function renderLintOptions(choices: IInitializationChoices): string {
  const options = initializationOptions(choices);
  const lines: string[] = [];

  if (options.experimental) {
    const entries = experimentalKeys
      .filter((key) => options.experimental?.[key] === true)
      .map((key) => `${key}: true`);
    if (entries.length > 0) lines.push(`  experimental: { ${entries.join(", ")} },`);
  }
  if (options.jsdoc) lines.push("  jsdoc: true,");
  if (options.nextjs) lines.push("  nextjs: true,");
  if (options.node) lines.push("  node: true,");
  if (options.react) lines.push("  react: true,");
  if (options.reactPerf) lines.push("  reactPerf: true,");
  if (choices.tailwindcss) {
    lines.push(`  tailwindcss: { entryPoint: ${quote(choices.tailwindcss)} },`);
  }
  if (options.test) {
    const value =
      typeof options.test === "string"
        ? quote(options.test)
        : `[${options.test.map(quote).join(", ")}]`;
    lines.push(`  test: ${value},`);
  }
  if (options.typeAware) lines.push("  typeAware: true,");
  lines.push(`  typescript: ${options.typescript === true ? "true" : "false"},`);
  if (options.vue) lines.push("  vue: true,");

  return lines.join("\n");
}

function renderLintConfig(choices: IInitializationChoices): string {
  return `import amamo from '@amamo/oxlint-config'

export default amamo({
${renderLintOptions(choices)}
})
`;
}

function renderLintConfigSnippet(choices: IInitializationChoices): string {
  return `import amamo from '@amamo/oxlint-config'

const existingConfig = {
  // Paste the value exported by your existing config here.
}

export default amamo({
${renderLintOptions(choices)}
}, existingConfig)
`;
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isJsonObject(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return isJsonObject(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

async function readOptionalFile(path: string, fallback: string): Promise<IReadFileState> {
  try {
    const content = await readFile(path, "utf8");
    return { content, existed: true, originalHash: hash(content) };
  } catch (error) {
    if (isJsonObject(error) && error.code === "ENOENT") {
      return { content: fallback, existed: false };
    }
    throw error;
  }
}

function collectJsoncPlan(
  rootDir: string,
  relativePath: string,
  original: IReadFileState,
  result: IJsoncMergeResult,
  files: IFileChange[],
  conflicts: string[],
  notices: string[],
): void {
  conflicts.push(...result.conflicts.map((conflict) => `${relativePath}:${conflict}`));
  notices.push(...result.errors.map((error) => `${relativePath}: ${error}`));
  if (!result.changed) return;
  files.push({
    content: result.content,
    existed: original.existed,
    ...(original.originalHash === undefined ? {} : { originalHash: original.originalHash }),
    path: join(rootDir, relativePath),
  });
}

function installPackages(choices: IInitializationChoices): string[] {
  const packages = ["@amamo/oxlint-config", "oxlint", "oxfmt"];
  if (choices.tailwindcss) packages.push("oxlint-tailwindcss");
  if (choices.typeAware) packages.push("oxlint-tsgolint");
  for (const key of experimentalKeys) {
    if (choices.experimental[key]) packages.push(experimentalPackages[key]);
  }
  return packages;
}

async function createInstallPlan(
  detection: IProjectDetection,
  choices: IInitializationChoices,
): Promise<IInitializationPlan["install"]> {
  const packageManager = detection.packageManager;
  if (!packageManager) return { args: [], command: "", display: "" };

  const packages = installPackages(choices);
  let args: string[];
  switch (packageManager) {
    case "pnpm":
      args = [
        "add",
        "--save-dev",
        ...((await pathExists(join(detection.rootDir, "pnpm-workspace.yaml")))
          ? ["--workspace-root"]
          : []),
        ...packages,
      ];
      break;
    case "npm":
      args = ["install", "--save-dev", ...packages];
      break;
    case "yarn":
    case "bun":
      args = ["add", "--dev", ...packages];
      break;
  }

  return {
    args,
    command: packageManager,
    display: `${packageManager} ${args.join(" ")}`,
  };
}

export async function createInitializationPlan(
  detection: IProjectDetection,
  choices: IInitializationChoices,
): Promise<IInitializationPlan> {
  const rootDir = detection.rootDir;
  const files: IFileChange[] = [];
  const conflicts: string[] = [];
  const notices = [...detection.warnings];
  const lintConfig = renderLintConfig(choices);
  let existingLintConfig: string | undefined;

  for (const relativePath of lintConfigPaths) {
    if (await pathExists(join(rootDir, relativePath))) {
      existingLintConfig = relativePath;
      break;
    }
  }

  if (existingLintConfig) {
    notices.push(`Preserved existing lint config: ${existingLintConfig}`);
  } else {
    files.push({ content: lintConfig, existed: false, path: join(rootDir, "oxlint.config.ts") });
  }

  const packagePath = join(rootDir, "package.json");
  const packageFile = await readOptionalFile(packagePath, "{}\n");
  if (!packageFile.existed) {
    notices.push("package.json is missing; scripts were not planned");
  } else {
    collectJsoncPlan(
      rootDir,
      "package.json",
      packageFile,
      applyJsoncOperations(packageFile.content, scriptOperations),
      files,
      conflicts,
      notices,
    );
  }

  const editorPlans = await Promise.all([
    createVSCodeInitializationPlan(rootDir),
    createZedInitializationPlan(rootDir),
  ]);
  for (const editorPlan of editorPlans) {
    conflicts.push(...editorPlan.conflicts);
    files.push(...editorPlan.files);
    notices.push(...editorPlan.notices);
  }

  return {
    choices,
    conflicts,
    files,
    install: await createInstallPlan(detection, choices),
    ...(existingLintConfig === undefined
      ? {}
      : { lintConfigSnippet: renderLintConfigSnippet(choices) }),
    notices,
    rootDir,
  };
}

export const defaultRunCommand: RunCommand = (command, args, cwd) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        rejectPromise(new Error(`${command} exited with signal ${signal}`));
      } else if (code !== 0) {
        rejectPromise(new Error(`${command} exited with code ${String(code)}`));
      } else {
        resolvePromise();
      }
    });
  });

export async function executeInitialization(
  plan: IInitializationPlan,
  options: IExecutionOptions,
  runCommand: RunCommand = defaultRunCommand,
): Promise<IExecutionResult> {
  const rootDirInput = plan.rootDir;
  const install = { ...plan.install, args: [...plan.install.args] };
  const notices = [...plan.notices];
  const plannedFiles = plan.files.map((file) => ({ ...file }));

  if (options.dryRun) {
    return { installed: false, notices, written: [] };
  }

  const rootDir = resolve(rootDirInput);
  const rootPrefix = `${rootDir}${sep}`;
  const normalizedTargets = new Set<string>();
  for (const file of plannedFiles) {
    const normalizedTarget = resolve(file.path);
    if (
      file.path !== normalizedTarget ||
      normalizedTarget === rootDir ||
      !normalizedTarget.startsWith(rootPrefix) ||
      normalizedTargets.has(normalizedTarget)
    ) {
      throw new Error(`Invalid initialization target: ${file.path}`);
    }
    normalizedTargets.add(normalizedTarget);
  }

  const physicalRoot = await realpath(rootDir);
  const physicalRootMetadata = await stat(physicalRoot);
  const assertRootIdentity = async (): Promise<void> => {
    try {
      const currentPhysicalRoot = await realpath(rootDir);
      const currentRootMetadata = await stat(rootDir);
      if (
        currentPhysicalRoot === physicalRoot &&
        currentRootMetadata.dev === physicalRootMetadata.dev &&
        currentRootMetadata.ino === physicalRootMetadata.ino
      ) {
        return;
      }
    } catch (error) {
      throw new Error(`Initialization root changed during execution: ${rootDir}`, {
        cause: error,
      });
    }
    throw new Error(`Initialization root changed during execution: ${rootDir}`);
  };
  const assertPhysicalContainment = async (targetPath: string): Promise<void> => {
    await assertRootIdentity();
    let candidate = dirname(targetPath);
    while (true) {
      try {
        const physicalParent = await realpath(candidate);
        const fromRoot = relative(physicalRoot, physicalParent);
        if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
          throw new Error(`Initialization target escapes the physical root: ${targetPath}`);
        }
        return;
      } catch (error) {
        if (!isMissingPathError(error)) throw error;
        const parent = dirname(candidate);
        if (parent === candidate) {
          throw new Error(`Cannot resolve a safe parent for initialization target: ${targetPath}`);
        }
        candidate = parent;
      }
    }
  };

  for (const file of plannedFiles) {
    await assertPhysicalContainment(file.path);
    try {
      if ((await lstat(file.path)).isSymbolicLink()) {
        throw new Error(`Initialization target must not be a symbolic link: ${file.path}`);
      }
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
  }

  let installed = false;
  await assertRootIdentity();
  if (!options.noInstall) {
    try {
      await runCommand(install.command, install.args, physicalRoot);
    } catch (error) {
      throw new Error(
        `Installation failed: ${errorMessage(error)}. Retry with: ${install.display}`,
        { cause: error },
      );
    }
    await assertRootIdentity();
    installed = true;
  }

  const packagePath = join(rootDir, "package.json");
  const expectedHashes = new Map<string, string | null>();
  const modes = new Map<string, number>();
  for (const file of plannedFiles) {
    if (file.path === packagePath) continue;
    await assertPhysicalContainment(file.path);

    if (file.existed) {
      if (file.originalHash === undefined) {
        throw new Error(`Cannot verify existing target without its original hash: ${file.path}`);
      }
      let currentContent: string;
      try {
        const [content, metadata] = await Promise.all([
          readFile(file.path, "utf8"),
          lstat(file.path),
        ]);
        if (metadata.isSymbolicLink()) {
          throw new Error(`Initialization target must not be a symbolic link: ${file.path}`);
        }
        currentContent = content;
        modes.set(file.path, metadata.mode & 0o7777);
      } catch (error) {
        throw new Error(`Cannot verify target ${file.path}: ${errorMessage(error)}`, {
          cause: error,
        });
      }
      if (hash(currentContent) !== file.originalHash) {
        throw new Error(`Concurrent change detected for target: ${file.path}`);
      }
      expectedHashes.set(file.path, file.originalHash);
      continue;
    }

    let appeared = true;
    try {
      await lstat(file.path);
    } catch (error) {
      if (isMissingPathError(error)) appeared = false;
      else throw error;
    }
    if (appeared) {
      throw new Error(`Concurrent target appeared after planning: ${file.path}`);
    }
    expectedHashes.set(file.path, null);
  }

  const packageChange = plannedFiles.find((file) => file.path === packagePath);
  let files = plannedFiles;
  if (packageChange !== undefined) {
    await assertPhysicalContainment(packagePath);
    let packageSource: string;
    try {
      const [content, metadata] = await Promise.all([
        readFile(packagePath, "utf8"),
        lstat(packagePath),
      ]);
      if (metadata.isSymbolicLink()) {
        throw new Error(`Initialization target must not be a symbolic link: ${packagePath}`);
      }
      packageSource = content;
      modes.set(packagePath, metadata.mode & 0o7777);
    } catch (error) {
      throw new Error(`Cannot refresh package.json: ${errorMessage(error)}`, { cause: error });
    }

    const packageResult = applyJsoncOperations(packageSource, scriptOperations);
    if (packageResult.errors.length > 0) {
      throw new Error(`Cannot refresh package.json: ${packageResult.errors.join("; ")}`);
    }
    expectedHashes.set(packagePath, hash(packageSource));
    notices.push(...packageResult.conflicts.map((conflict) => `package.json:${conflict}`));
    files = plannedFiles.flatMap((file) => {
      if (file !== packageChange) return [file];
      return packageResult.changed ? [{ ...file, content: packageResult.content }] : [];
    });
  }

  const written: string[] = [];
  for (const [index, file] of files.entries()) {
    let temporaryPath = "";
    let handle: FileHandle | undefined;
    let ownsTemporaryFile = false;

    try {
      await assertPhysicalContainment(file.path);
      await mkdir(dirname(file.path), { recursive: true });
      await assertPhysicalContainment(file.path);
      temporaryPath = join(dirname(file.path), `.${basename(file.path)}.${randomUUID()}.tmp`);
      await assertPhysicalContainment(file.path);
      handle = await open(temporaryPath, "wx", modes.get(file.path) ?? 0o666);
      ownsTemporaryFile = true;
      await handle.writeFile(file.content, "utf8");
      await handle.close();
      handle = undefined;
      const mode = modes.get(file.path);
      if (mode !== undefined) await chmod(temporaryPath, mode);

      await assertPhysicalContainment(file.path);
      const expectedHash = expectedHashes.get(file.path);
      if (expectedHash === undefined) {
        throw new Error(`Missing expected target state: ${file.path}`);
      }
      if (expectedHash === null) {
        let appeared = true;
        try {
          await lstat(file.path);
        } catch (recheckError) {
          if (isMissingPathError(recheckError)) appeared = false;
          else throw recheckError;
        }
        if (appeared) {
          throw new Error(`Concurrent target appeared before rename: ${file.path}`);
        }
      } else {
        let currentContent: string;
        try {
          const [content, metadata] = await Promise.all([
            readFile(file.path, "utf8"),
            lstat(file.path),
          ]);
          if (metadata.isSymbolicLink()) {
            throw new Error(`Initialization target must not be a symbolic link: ${file.path}`);
          }
          currentContent = content;
        } catch (recheckError) {
          throw new Error(`Cannot recheck target ${file.path}: ${errorMessage(recheckError)}`, {
            cause: recheckError,
          });
        }
        if (hash(currentContent) !== expectedHash) {
          throw new Error(`Concurrent change detected before rename: ${file.path}`);
        }
      }
      // ponytail: realpath and content checks are not a portable compare-and-rename; add platform locking only if this final race matters.
      await rename(temporaryPath, file.path);
      ownsTemporaryFile = false;
      written.push(file.path);
    } catch (error) {
      if (handle !== undefined) {
        try {
          await handle.close();
        } catch {
          // The original write error remains the useful failure.
        }
      }
      let cleanupFailure = "";
      if (ownsTemporaryFile) {
        try {
          await unlink(temporaryPath);
        } catch (cleanupError) {
          if (!isMissingPathError(cleanupError)) {
            cleanupFailure = ` Cleanup failed for ${temporaryPath}: ${errorMessage(cleanupError)}.`;
          }
        }
      }
      const remainingPaths = files.slice(index + 1).map((remaining) => remaining.path);
      throw new Error(
        `Failed to write ${file.path}: ${errorMessage(error)}. Remaining unwritten paths: ${remainingPaths.length === 0 ? "none" : remainingPaths.join(", ")}.${cleanupFailure}`,
        { cause: error },
      );
    }
  }

  return { installed, notices, written };
}
