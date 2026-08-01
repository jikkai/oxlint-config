#!/usr/bin/env node

/// <reference types="node" />

import type { Interface } from "node:readline/promises";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type {
  IInitializationChoices,
  IExecutionResult,
  IInitializationPlan,
  IProjectDetection,
  RunCommand,
} from "./initializer.js";
import { experimentalPackages } from "./experimental.js";
import {
  createInitializationPlan,
  defaultChoices,
  defaultRunCommand,
  detectProject,
  executeInitialization,
} from "./initializer.js";

export interface ICliOptions {
  dryRun: boolean;
  noInstall: boolean;
  yes: boolean;
}

export interface ICliContext {
  cwd: string;
  env: Readonly<NodeJS.ProcessEnv>;
  input: NodeJS.ReadableStream;
  inputIsTTY: boolean;
  output: NodeJS.WritableStream;
  outputIsTTY: boolean;
  runCommand: RunCommand;
}

const usage = "Usage: amamo-oxlint-config init [--dry-run] [--no-install] [--yes]";

export function parseCliArgs(args: readonly string[]): ICliOptions {
  try {
    const { positionals, tokens, values } = parseArgs({
      allowPositionals: true,
      args,
      options: {
        "dry-run": { type: "boolean" },
        "no-install": { type: "boolean" },
        yes: { type: "boolean" },
      },
      strict: true,
      tokens: true,
    });

    if (positionals.length !== 1 || positionals[0] !== "init") throw new Error(usage);
    const optionNames = new Set<string>();
    for (const token of tokens) {
      if (token.kind !== "option") continue;
      if (optionNames.has(token.name)) throw new Error(usage);
      optionNames.add(token.name);
    }

    return {
      dryRun: values["dry-run"] ?? false,
      noInstall: values["no-install"] ?? false,
      yes: values.yes ?? false,
    };
  } catch (error) {
    if (error instanceof Error && error.message === usage) throw error;
    throw new Error(usage, { cause: error });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeLine(output: NodeJS.WritableStream, message: string): void {
  output.write(`${message}\n`);
}

function defaultContext(): ICliContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    input: process.stdin,
    inputIsTTY: process.stdin.isTTY === true,
    output: process.stdout,
    outputIsTTY: process.stdout.isTTY === true,
    runCommand: defaultRunCommand,
  };
}

async function askYesNo(
  lines: AsyncIterator<string>,
  output: NodeJS.WritableStream,
  question: string,
  defaultChoice: boolean,
): Promise<boolean | undefined> {
  while (true) {
    output.write(`${question} ${defaultChoice ? "[Y/n]" : "[y/N]"} `);
    const line = await lines.next();
    if (line.done === true) return undefined;

    switch (line.value.trim().toLowerCase()) {
      case "":
        return defaultChoice;
      case "y":
      case "yes":
        return true;
      case "n":
      case "no":
        return false;
      default:
        writeLine(output, "Please answer yes or no.");
    }
  }
}

function showDetection(detection: IProjectDetection, output: NodeJS.WritableStream): void {
  writeLine(output, `Project root: ${detection.rootDir}`);
  writeLine(output, "Manifests:");
  for (const path of detection.manifestPaths) writeLine(output, `  ${path}`);

  writeLine(output, "Stable features:");
  const features = [
    ["TypeScript", detection.features.typescript],
    ["React", detection.features.react],
    ["Next.js", detection.features.nextjs],
    ["Vue", detection.features.vue],
    ["Tailwind CSS", detection.features.tailwindcss !== undefined],
    ["Node", detection.features.node],
    ["Jest", detection.features.jest],
    ["Vitest", detection.features.vitest],
  ] as const;
  for (const [name, detected] of features) {
    writeLine(output, `  ${name}: ${detected ? "detected" : "not detected"}`);
  }
  if (detection.features.tailwindcss) {
    writeLine(output, `  Tailwind CSS entry point: ${detection.features.tailwindcss}`);
  }

  writeLine(output, "Detected experimental packages:");
  const detectedExperimental = Object.entries(detection.features.experimental).filter(
    ([, detected]) => detected,
  );
  if (detectedExperimental.length === 0) writeLine(output, "  (none)");
  for (const [key] of detectedExperimental) {
    writeLine(output, `  ${experimentalPackages[key as keyof typeof experimentalPackages]}`);
  }

  writeLine(output, "Warnings:");
  if (detection.warnings.length === 0) writeLine(output, "  (none)");
  for (const warning of detection.warnings) writeLine(output, `  ${warning}`);
  writeLine(output, `Package manager: ${detection.packageManager ?? "not detected"}`);
}

async function collectChoices(
  detection: IProjectDetection,
  lines: AsyncIterator<string>,
  output: NodeJS.WritableStream,
): Promise<IInitializationChoices | undefined> {
  const choices = defaultChoices(detection);
  const typescript = await askYesNo(lines, output, "Use TypeScript?", choices.typescript);
  if (typescript === undefined) return undefined;
  choices.typescript = typescript;

  if (typescript) {
    const typeAware = await askYesNo(
      lines,
      output,
      "Enable type-aware linting?",
      choices.typeAware,
    );
    if (typeAware === undefined) return undefined;
    choices.typeAware = typeAware;
  }

  const react = await askYesNo(lines, output, "Use React?", choices.react);
  if (react === undefined) return undefined;
  choices.react = react;

  const reactPerf = await askYesNo(
    lines,
    output,
    "Enable React performance rules?",
    choices.reactPerf,
  );
  if (reactPerf === undefined) return undefined;
  choices.reactPerf = reactPerf;

  const nextjs = await askYesNo(lines, output, "Use Next.js?", choices.nextjs);
  if (nextjs === undefined) return undefined;
  choices.nextjs = nextjs;

  const vue = await askYesNo(lines, output, "Use Vue?", choices.vue);
  if (vue === undefined) return undefined;
  choices.vue = vue;

  if (choices.tailwindcss) {
    const tailwindcss = await askYesNo(
      lines,
      output,
      `Use Tailwind CSS entry point ${choices.tailwindcss}?`,
      true,
    );
    if (tailwindcss === undefined) return undefined;
    if (!tailwindcss) delete choices.tailwindcss;
  }

  const node = await askYesNo(lines, output, "Use Node rules?", choices.node);
  if (node === undefined) return undefined;
  choices.node = node;

  const jsdoc = await askYesNo(lines, output, "Enable JSDoc rules?", choices.jsdoc);
  if (jsdoc === undefined) return undefined;
  choices.jsdoc = jsdoc;

  const tests: Array<"jest" | "vitest"> = [];
  const jest = await askYesNo(lines, output, "Use Jest?", choices.test.includes("jest"));
  if (jest === undefined) return undefined;
  if (jest) tests.push("jest");

  const vitest = await askYesNo(lines, output, "Use Vitest?", choices.test.includes("vitest"));
  if (vitest === undefined) return undefined;
  if (vitest) tests.push("vitest");
  choices.test = tests;

  for (const [key, detected] of Object.entries(detection.features.experimental)) {
    if (!detected) continue;
    const experimentalKey = key as keyof typeof experimentalPackages;
    const enabled = await askYesNo(
      lines,
      output,
      `Enable experimental ${experimentalPackages[experimentalKey]}?`,
      false,
    );
    if (enabled === undefined) return undefined;
    choices.experimental[experimentalKey] = enabled;
  }

  return choices;
}

function showPlan(
  plan: IInitializationPlan,
  options: ICliOptions,
  output: NodeJS.WritableStream,
): void {
  writeLine(output, "Planned files:");
  if (plan.files.length === 0) writeLine(output, "  (none)");
  for (const file of plan.files) {
    writeLine(
      output,
      `  ${file.existed ? "update" : "create"}: ${relative(plan.rootDir, file.path)}`,
    );
  }

  if (options.noInstall) {
    writeLine(output, "Install: skipped (--no-install).");
  } else if (plan.install.display) {
    writeLine(output, `Install: ${plan.install.display}`);
  } else {
    writeLine(output, "Install: no package manager detected (dry run).");
  }

  writeLine(output, "Notices:");
  if (plan.notices.length === 0) writeLine(output, "  (none)");
  for (const notice of plan.notices) writeLine(output, `  ${notice}`);
  if (plan.lintConfigSnippet) {
    writeLine(output, "Lint config snippet:");
    writeLine(output, plan.lintConfigSnippet);
  }

  writeLine(output, "Conflicts:");
  if (plan.conflicts.length === 0) writeLine(output, "  (none)");
  for (const conflict of plan.conflicts) writeLine(output, `  ${conflict}`);
}

function showExecutionResult(
  plan: IInitializationPlan,
  result: IExecutionResult,
  output: NodeJS.WritableStream,
): void {
  writeLine(output, `Installed: ${result.installed ? "yes" : "no"}`);
  writeLine(output, "Written files:");
  if (result.written.length === 0) writeLine(output, "  (none)");
  for (const path of result.written) writeLine(output, `  ${relative(plan.rootDir, path)}`);

  const executionNotices = result.notices.slice(plan.notices.length);
  writeLine(output, "Execution notices:");
  if (executionNotices.length === 0) writeLine(output, "  (none)");
  for (const notice of executionNotices) writeLine(output, `  ${notice}`);
}

export async function runCli(
  args: readonly string[],
  context: Partial<ICliContext> = {},
): Promise<number> {
  const cliContext: ICliContext = { ...defaultContext(), ...context };
  let options: ICliOptions;

  try {
    options = parseCliArgs(args);
  } catch (error) {
    writeLine(cliContext.output, errorMessage(error));
    return 2;
  }

  if (!options.yes && (!cliContext.inputIsTTY || !cliContext.outputIsTTY)) {
    writeLine(cliContext.output, "Non-interactive use requires --yes.");
    return 2;
  }

  let detection;
  try {
    detection = await detectProject(cliContext.cwd, cliContext.env.npm_config_user_agent);
  } catch (error) {
    writeLine(cliContext.output, errorMessage(error));
    return 2;
  }

  if (!detection.manifestPaths.includes(join(detection.rootDir, "package.json"))) {
    writeLine(cliContext.output, "Missing root package.json.");
    return 2;
  }
  if (detection.packageManagerConflicts.length > 0) {
    writeLine(
      cliContext.output,
      `Multiple package managers detected: ${detection.packageManagerConflicts.join(", ")}.`,
    );
    return 2;
  }
  if (!detection.packageManager && !options.noInstall && !options.dryRun) {
    writeLine(cliContext.output, "No package manager could be safely detected.");
    return 2;
  }

  showDetection(detection, cliContext.output);
  let plan: IInitializationPlan;
  let reader: Interface | undefined;
  try {
    let choices: IInitializationChoices | undefined;
    let lines: AsyncIterator<string> | undefined;
    if (options.yes) {
      choices = defaultChoices(detection);
    } else {
      reader = createInterface({
        input: cliContext.input,
        output: cliContext.output,
        terminal: false,
      });
      lines = reader[Symbol.asyncIterator]();
      choices = await collectChoices(detection, lines, cliContext.output);
      if (choices === undefined) return 0;
    }

    plan = await createInitializationPlan(detection, choices);
    showPlan(plan, options, cliContext.output);
    if (!options.yes && !options.dryRun && lines !== undefined) {
      const confirmed = await askYesNo(lines, cliContext.output, "Apply these changes?", false);
      if (confirmed !== true) return 0;
    }
  } catch (error) {
    writeLine(cliContext.output, errorMessage(error));
    return 1;
  } finally {
    reader?.close();
  }

  try {
    const result = await executeInitialization(
      plan,
      { dryRun: options.dryRun, noInstall: options.noInstall },
      cliContext.runCommand,
    );
    showExecutionResult(plan, result, cliContext.output);
    return 0;
  } catch (error) {
    writeLine(cliContext.output, errorMessage(error));
    return 1;
  }
}

export function isDirectExecution(moduleUrl: string, argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  process.exitCode = await runCli(process.argv.slice(2));
}
