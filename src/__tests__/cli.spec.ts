import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunCommand } from "../initializer.js";
import { isDirectExecution, parseCliArgs, runCli } from "../cli.js";

const usage = "Usage: amamo-oxlint-config init [--dry-run] [--no-install] [--yes]";
const projectRoots: string[] = [];

async function createProject(files: Record<string, string>): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "amamo-cli-"));
  projectRoots.push(rootDir);

  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(rootDir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  return rootDir;
}

function captureOutput(): { output: PassThrough; text: () => string } {
  const output = new PassThrough();
  let captured = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    captured += chunk;
  });
  return { output, text: () => captured };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    projectRoots.splice(0).map((rootDir) => rm(rootDir, { force: true, recursive: true })),
  );
});

describe("parseCliArgs", () => {
  it.each([
    ["init", ["init"], { dryRun: false, noInstall: false, yes: false }],
    ["dry run", ["init", "--dry-run"], { dryRun: true, noInstall: false, yes: false }],
    ["no install", ["init", "--no-install"], { dryRun: false, noInstall: true, yes: false }],
    ["yes", ["init", "--yes"], { dryRun: false, noInstall: false, yes: true }],
    [
      "all flags",
      ["init", "--dry-run", "--no-install", "--yes"],
      { dryRun: true, noInstall: true, yes: true },
    ],
  ])("accepts %s", (_label, args, expected) => {
    expect(parseCliArgs(args)).toEqual(expected);
  });

  it.each([
    { args: [] },
    { args: ["other"] },
    { args: ["init", "extra"] },
    { args: ["init", "--unknown"] },
    { args: ["init", "--force"] },
    { args: ["init", "--yes=true"] },
    { args: ["init", "--yes", "true"] },
    { args: ["init", "--yes", "--yes"] },
    { args: ["init", "--dry-run", "--dry-run"] },
    { args: ["init", "--no-install", "--no-install"] },
  ])("rejects $args with usage", ({ args }) => {
    expect(() => parseCliArgs(args)).toThrow(usage);
  });
});

describe("isDirectExecution", () => {
  it("matches a real executable reached through a directory symlink", async () => {
    const rootDir = await createProject({ "target/cli.js": "" });
    const target = join(rootDir, "target", "cli.js");
    const linkedDirectory = join(rootDir, "linked");
    await symlink(
      join(rootDir, "target"),
      linkedDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(
      isDirectExecution(
        pathToFileURL(await realpath(target)).href,
        join(linkedDirectory, "cli.js"),
      ),
    ).toBe(true);
  });

  it("returns false for missing and nonexistent argv1", async () => {
    const rootDir = await createProject({});

    expect(isDirectExecution(import.meta.url, undefined)).toBe(false);
    expect(isDirectExecution(import.meta.url, join(rootDir, "missing.js"))).toBe(false);
  });
});

describe("runCli non-interactive policy", () => {
  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])("requires --yes when inputIsTTY=%s and outputIsTTY=%s", async (inputIsTTY, outputIsTTY) => {
    const rootDir = await createProject({});
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>();

    const exitCode = await runCli(["init"], {
      cwd: rootDir,
      env: {},
      input: Readable.from([]),
      inputIsTTY,
      output,
      outputIsTTY,
      runCommand,
    });

    expect(exitCode).toBe(2);
    expect(text()).toBe("Non-interactive use requires --yes.\n");
    expect(runCommand).not.toHaveBeenCalled();
    expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(false);
  });

  it("accepts detected stable choices while keeping opt-in choices disabled with --yes", async () => {
    const rootDir = await createProject({
      "package.json": json({
        dependencies: {
          "eslint-plugin-cypress": "*",
          "eslint-plugin-mocha": "*",
          "eslint-plugin-playwright": "*",
          "eslint-plugin-regexp": "*",
          "eslint-plugin-sonarjs": "*",
          "eslint-plugin-storybook": "*",
          "eslint-plugin-testing-library": "*",
          express: "*",
          jest: "*",
          next: "*",
          react: "*",
          typescript: "*",
          vitest: "*",
          vue: "*",
        },
      }),
    });
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>();

    const exitCode = await runCli(["init", "--yes", "--no-install"], {
      cwd: rootDir,
      env: {},
      input: Readable.from([]),
      inputIsTTY: false,
      output,
      outputIsTTY: false,
      runCommand,
    });

    expect(exitCode).toBe(0);
    expect(text()).not.toContain("? [");
    expect(runCommand).not.toHaveBeenCalled();
    expect(await readFile(join(rootDir, "oxlint.config.ts"), "utf8"))
      .toBe(`import amamo from '@amamo/oxlint-config'

export default amamo({
  nextjs: true,
  node: true,
  react: true,
  test: ['jest', 'vitest'],
  typescript: true,
  vue: true,
})
`);
  });

  it("rejects multiple package-manager lockfiles before planning", async () => {
    const rootDir = await createProject({
      "package-lock.json": "{}\n",
      "package.json": "{}\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>();

    const exitCode = await runCli(["init", "--yes", "--no-install"], {
      cwd: rootDir,
      env: {},
      input: Readable.from([]),
      inputIsTTY: false,
      output,
      outputIsTTY: false,
      runCommand,
    });

    expect(exitCode).toBe(2);
    expect(text()).toContain("Multiple package managers detected: pnpm, npm.");
    expect(runCommand).not.toHaveBeenCalled();
    expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(false);
  });

  it("rejects multiple lockfiles even when a recognized user agent selects a manager", async () => {
    const rootDir = await createProject({
      "package-lock.json": "{}\n",
      "package.json": "{}\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>();

    const exitCode = await runCli(["init", "--yes", "--no-install"], {
      cwd: rootDir,
      env: { npm_config_user_agent: "pnpm/11.18.0 node/v22.18.0" },
      input: Readable.from([]),
      inputIsTTY: false,
      output,
      outputIsTTY: false,
      runCommand,
    });

    expect(exitCode).toBe(2);
    expect(text()).toContain("Multiple package managers detected: pnpm, npm.");
    expect(runCommand).not.toHaveBeenCalled();
    expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(false);
  });

  it("rejects a missing root package.json", async () => {
    const rootDir = await createProject({});
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>();

    const exitCode = await runCli(["init", "--yes", "--no-install"], {
      cwd: rootDir,
      env: {},
      input: Readable.from([]),
      inputIsTTY: false,
      output,
      outputIsTTY: false,
      runCommand,
    });

    expect(exitCode).toBe(2);
    expect(text()).toContain("Missing root package.json.");
    expect(runCommand).not.toHaveBeenCalled();
    expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(false);
  });

  it("requires a safely detected package manager before installation", async () => {
    const rootDir = await createProject({ "package.json": "{}\n" });
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>();

    const exitCode = await runCli(["init", "--yes"], {
      cwd: rootDir,
      env: {},
      input: Readable.from([]),
      inputIsTTY: false,
      output,
      outputIsTTY: false,
      runCommand,
    });

    expect(exitCode).toBe(2);
    expect(text()).toContain("No package manager could be safely detected.");
    expect(runCommand).not.toHaveBeenCalled();
    expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(false);
  });

  it.each([
    ["no install", "--no-install", true],
    ["dry run", "--dry-run", false],
  ])("allows no manager for %s", async (_label, flag, writes) => {
    const rootDir = await createProject({ "package.json": "{}\n" });
    const { output } = captureOutput();
    const runCommand = vi.fn<RunCommand>();

    const exitCode = await runCli(["init", "--yes", flag], {
      cwd: rootDir,
      env: {},
      input: Readable.from([]),
      inputIsTTY: false,
      output,
      outputIsTTY: false,
      runCommand,
    });

    expect(exitCode).toBe(0);
    expect(runCommand).not.toHaveBeenCalled();
    expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(writes);
  });
});

describe("runCli interactive flow", () => {
  it("offers the detected Tailwind CSS entry point and preserves an explicit rejection", async () => {
    const rootDir = await createProject({
      "package.json": "{}\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "src/index.css": '@import "tailwindcss";\n',
    });
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>();
    const input = Readable.from([["", "", "", "", "", "n", "", "", "", ""].join("\n") + "\n"]);

    const exitCode = await runCli(["init", "--dry-run"], {
      cwd: rootDir,
      env: {},
      input,
      inputIsTTY: true,
      output,
      outputIsTTY: true,
      runCommand,
    });

    expect(exitCode).toBe(0);
    expect(text()).toContain("Tailwind CSS: detected");
    expect(text()).toContain("Tailwind CSS entry point: src/index.css");
    expect(text()).toContain("Use Tailwind CSS entry point src/index.css? [Y/n]");
    expect(text()).not.toContain("tailwindcss: { entryPoint:");
    expect(text()).not.toContain("oxlint-tailwindcss");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("shows detection and the complete plan before applying confirmed choices", async () => {
    const rootDir = await createProject({
      ".vscode/settings.json": json({ "editor.formatOnSave": true }),
      "oxlint.config.ts": "export default { rules: {} }\n",
      "package.json": json({
        dependencies: {
          "eslint-plugin-cypress": "*",
          "eslint-plugin-storybook": "*",
          express: "*",
          jest: "*",
          next: "*",
          react: "*",
          typescript: "*",
          vitest: "*",
          vue: "*",
        },
        scripts: { lint: "eslint ." },
        workspaces: ["packages/*"],
      }),
      "packages/broken/package.json": "not json\n",
      "packages/web/package.json": "{}\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>(async () => undefined);
    const input = Readable.from([
      ["maybe", "", "y", "n", "y", "", "", "n", "y", "", "n", "y", "", "y"].join("\n") + "\n",
    ]);

    const exitCode = await runCli(["init"], {
      cwd: rootDir,
      env: {},
      input,
      inputIsTTY: true,
      output,
      outputIsTTY: true,
      runCommand,
    });

    expect(exitCode).toBe(0);
    expect(runCommand).toHaveBeenCalledWith(
      "pnpm",
      [
        "add",
        "--save-dev",
        "@amamo/oxlint-config",
        "oxlint",
        "oxfmt",
        "oxlint-tsgolint",
        "eslint-plugin-cypress",
      ],
      await realpath(rootDir),
    );
    expect(await readFile(join(rootDir, "oxlint.config.ts"), "utf8")).toBe(
      "export default { rules: {} }\n",
    );

    const printed = text();
    expect(printed).toContain(`Project root: ${rootDir}`);
    expect(printed).toContain(join(rootDir, "package.json"));
    expect(printed).toContain(join(rootDir, "packages/web/package.json"));
    expect(printed).toContain("Stable features:");
    expect(printed).toContain("Detected experimental packages:");
    expect(printed).toContain("eslint-plugin-cypress");
    expect(printed).toContain("eslint-plugin-storybook");
    expect(printed).toContain("Warnings:");
    expect(printed).toContain("packages/broken/package.json");
    expect(printed).toContain("Package manager: pnpm");
    expect(printed).toContain("Please answer yes or no.");
    expect(printed).toContain("Planned files:");
    expect(printed).toContain("Install: pnpm add --save-dev");
    expect(printed).toContain("Notices:");
    expect(printed).toContain("Lint config snippet:");
    expect(printed).toContain("experimental: { cypress: true }");
    expect(printed).toContain("typeAware: true");
    expect(printed.indexOf("Conflicts:")).toBeLessThan(
      printed.indexOf("Apply these changes? [y/N]"),
    );

    const packageManifest = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
    expect(packageManifest.scripts).toEqual({
      format: "oxfmt .",
      "format:check": "oxfmt --check .",
      lint: "eslint .",
      "lint:fix": "oxlint --fix .",
    });
  });

  it.each([
    ["no", `${"\n".repeat(9)}n\n`],
    ["EOF", "\n".repeat(9)],
  ])(
    "cancels at the final confirmation on %s without running or writing",
    async (_label, input) => {
      const originalPackage = "{}\n";
      const rootDir = await createProject({
        "package.json": originalPackage,
        "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      });
      const { output } = captureOutput();
      const runCommand = vi.fn<RunCommand>();

      const exitCode = await runCli(["init"], {
        cwd: rootDir,
        env: {},
        input: Readable.from([input]),
        inputIsTTY: true,
        output,
        outputIsTTY: true,
        runCommand,
      });

      expect(exitCode).toBe(0);
      expect(runCommand).not.toHaveBeenCalled();
      expect(await readFile(join(rootDir, "package.json"), "utf8")).toBe(originalPackage);
      expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(false);
    },
  );

  it("displays a dry-run plan without final confirmation or writes", async () => {
    const rootDir = await createProject({ "package.json": "{}\n" });
    const { output, text } = captureOutput();
    const runCommand = vi.fn<RunCommand>();

    const exitCode = await runCli(["init", "--dry-run"], {
      cwd: rootDir,
      env: {},
      input: Readable.from(["\n".repeat(9)]),
      inputIsTTY: true,
      output,
      outputIsTTY: true,
      runCommand,
    });

    expect(exitCode).toBe(0);
    expect(text()).toContain("Planned files:");
    expect(text()).not.toContain("Apply these changes?");
    expect(runCommand).not.toHaveBeenCalled();
    expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(false);
  });

  it("prints execution errors and returns 1 without writing", async () => {
    const rootDir = await createProject({
      "package.json": "{}\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    const { output, text } = captureOutput();
    const runCommand: RunCommand = async () => {
      throw new Error("offline");
    };

    const exitCode = await runCli(["init", "--yes"], {
      cwd: rootDir,
      env: {},
      input: Readable.from([]),
      inputIsTTY: false,
      output,
      outputIsTTY: false,
      runCommand,
    });

    expect(exitCode).toBe(1);
    expect(text()).toContain("Installation failed: offline.");
    expect(text()).toContain("Retry with: pnpm add --save-dev");
    expect(await exists(join(rootDir, "oxlint.config.ts"))).toBe(false);
  });

  it("prints successful execution results and only notices added after planning", async () => {
    const rootDir = await createProject({
      "oxlint.config.ts": "export default {}\n",
      "package.json": json({ name: "fixture" }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    const { output, text } = captureOutput();
    const runCommand: RunCommand = async (_command, _args, cwd) => {
      const manifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
      manifest.scripts = { lint: "custom lint" };
      await writeFile(join(cwd, "package.json"), json(manifest));
    };

    const exitCode = await runCli(["init", "--yes"], {
      cwd: rootDir,
      env: {},
      input: Readable.from([]),
      inputIsTTY: false,
      output,
      outputIsTTY: false,
      runCommand,
    });

    expect(exitCode).toBe(0);
    const printed = text();
    expect(printed).toContain("Installed: yes");
    expect(printed).toContain("Written files:\n  package.json");
    expect(printed).toContain("Execution notices:\n  package.json:/scripts/lint");
    expect(printed.split("Preserved existing lint config: oxlint.config.ts")).toHaveLength(2);
  });
});
