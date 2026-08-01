import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  IFileChange,
  IInitializationChoices,
  IInitializationPlan,
  IProjectDetection,
  RunCommand,
} from "../initializer.js";
import {
  createInitializationPlan,
  defaultChoices,
  detectProject,
  executeInitialization,
} from "../initializer.js";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const projectRoots: string[] = [];

async function createProject(files: Record<string, string>): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "amamo-initializer-"));
  projectRoots.push(rootDir);

  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(rootDir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  return rootDir;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function snapshotProject(
  rootDir: string,
  relativeDir = "",
): Promise<Array<{ content: string; modified: number; path: string }>> {
  const entries = await readdir(join(rootDir, relativeDir), { withFileTypes: true });
  const snapshot: Array<{ content: string; modified: number; path: string }> = [];

  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      snapshot.push(...(await snapshotProject(rootDir, relativePath)));
      continue;
    }

    const path = join(rootDir, relativePath);
    const [content, metadata] = await Promise.all([readFile(path), stat(path)]);
    snapshot.push({
      content: content.toString("base64"),
      modified: metadata.mtimeMs,
      path: relativePath,
    });
  }

  return snapshot;
}

function plannedFile(plan: IInitializationPlan, relativePath: string): IFileChange {
  const path = join(plan.rootDir, relativePath);
  const file = plan.files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`Missing planned file: ${relativePath}`);
  return file;
}

async function writePlanFiles(plan: IInitializationPlan): Promise<void> {
  const rootPrefix = `${plan.rootDir}${sep}`;
  for (const file of plan.files) {
    if (!file.path.startsWith(rootPrefix)) {
      throw new Error(`Refusing to write outside test project: ${file.path}`);
    }
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content);
  }
}

afterEach(async () => {
  await Promise.all(
    projectRoots.splice(0).map((rootDir) => rm(rootDir, { force: true, recursive: true })),
  );
});

describe("detectProject", () => {
  it("unions all dependency sections and detects every stable and experimental feature read-only", async () => {
    const rootDir = await createProject({
      "package.json": json({
        dependencies: {
          "eslint-plugin-cypress": "*",
          react: "*",
        },
        devDependencies: {
          "eslint-plugin-mocha": "*",
          "@jest/globals": "*",
          tailwindcss: "*",
          typescript: "*",
        },
        engines: { node: ">=22" },
        optionalDependencies: {
          "eslint-plugin-sonarjs": "*",
          "eslint-plugin-storybook": "*",
          "eslint-plugin-testing-library": "*",
          vitest: "*",
        },
        peerDependencies: {
          "eslint-plugin-playwright": "*",
          "eslint-plugin-regexp": "*",
          next: "*",
          vue: "*",
        },
      }),
      "src/index.css": '@import "tailwindcss";\n',
    });
    const before = await snapshotProject(rootDir);

    const detection = await detectProject(rootDir);

    expect(detection.features).toEqual({
      experimental: {
        cypress: true,
        mocha: true,
        playwright: true,
        regexp: true,
        sonarjs: true,
        storybook: true,
        testingLibrary: true,
      },
      jest: true,
      nextjs: true,
      node: true,
      react: true,
      tailwindcss: "src/index.css",
      typescript: true,
      vitest: true,
      vue: true,
    });
    expect(detection.manifestPaths).toEqual([join(rootDir, "package.json")]);
    expect(detection.warnings).toEqual([]);
    expect(await snapshotProject(rootDir)).toEqual(before);
  });

  it("ignores non-statement Tailwind imports and detects a single-quoted v4 entry point", async () => {
    const rootDir = await createProject({
      "package.json": json({ devDependencies: { tailwindcss: "*" } }),
      "src/commented.css": '/* @import "tailwindcss"; */\n',
      "src/content.css": `.demo::before { content: '@import "tailwindcss"'; }\n`,
      "src/index.css": "@import 'tailwindcss';\n",
    });

    const detection = await detectProject(rootDir);

    expect(detection.features.tailwindcss).toBe("src/index.css");
    expect(detection.warnings).toEqual([]);
  });

  it("does not guess between multiple Tailwind CSS entry points", async () => {
    const rootDir = await createProject({
      "apps/admin/index.css": '@import "tailwindcss";\n',
      "apps/web/index.css": '@import "tailwindcss";\n',
      "package.json": json({ devDependencies: { tailwindcss: "*" } }),
    });

    const detection = await detectProject(rootDir);

    expect(detection.features.tailwindcss).toBeUndefined();
    expect(detection.warnings).toEqual([
      "Multiple Tailwind CSS entry points detected: apps/admin/index.css, apps/web/index.css. Configure tailwindcss.entryPoint manually.",
    ]);
  });

  it("reports a Tailwind CSS dependency without a v4 entry point", async () => {
    const rootDir = await createProject({
      "package.json": json({ devDependencies: { tailwindcss: "*" } }),
    });

    const detection = await detectProject(rootDir);

    expect(detection.features.tailwindcss).toBeUndefined();
    expect(detection.warnings).toEqual([
      'Detected tailwindcss but no CSS file importing "tailwindcss". Configure tailwindcss.entryPoint manually.',
    ]);
  });

  it.each([
    ["workspace strings", ["packages/*"]],
    ["a packages array", { packages: ["packages/*"] }],
  ])("expands package.json %s", async (_label, workspaces) => {
    const rootDir = await createProject({
      "package.json": json({ workspaces }),
      "packages/web/package.json": json({ dependencies: { react: "*" } }),
    });

    const detection = await detectProject(rootDir);

    expect(detection.manifestPaths).toEqual([
      join(rootDir, "package.json"),
      join(rootDir, "packages/web/package.json"),
    ]);
    expect(detection.features.react).toBe(true);
  });

  it("expands ordinary pnpm package globs and skips each unsupported YAML entry", async () => {
    const rootDir = await createProject({
      "apps/web/package.json": json({ dependencies: { react: "*" } }),
      "ignored/alias/package.json": json({ dependencies: { vue: "*" } }),
      "ignored/flow/package.json": json({ dependencies: { vue: "*" } }),
      "ignored/interpolation/package.json": json({ dependencies: { vue: "*" } }),
      "ignored/tag/package.json": json({ dependencies: { vue: "*" } }),
      "package.json": json({}),
      "packages/api/package.json": json({ dependencies: { express: "*" } }),
      "pnpm-workspace.yaml": `packages:
  - "apps/*" # quoted with a trailing comment
  - 'packages/*'
  - *ignored/alias
  - !include ignored/tag
  - [ignored/flow]
  - \${ignored/interpolation}
`,
    });

    const detection = await detectProject(rootDir);

    expect(detection.manifestPaths).toEqual([
      join(rootDir, "package.json"),
      join(rootDir, "apps/web/package.json"),
      join(rootDir, "packages/api/package.json"),
    ]);
    expect(detection.features.react).toBe(true);
    expect(detection.features.node).toBe(true);
    expect(detection.features.vue).toBe(false);
    expect(detection.warnings).toHaveLength(4);
  });

  it("accepts quoted indicator-leading globs while skipping unquoted aliases, tags, and interpolation", async () => {
    const rootDir = await createProject({
      "!fixtures/deep/example/package.json": json({ dependencies: { vue: "*" } }),
      "groups/example/package.json": json({ dependencies: { react: "*" } }),
      "package.json": json({}),
      "pnpm-workspace.yaml": `packages:
  - "*/*"
  - '!fixtures/**'
  - *alias
  - !tag
  - "\${unsupported}"
`,
    });

    const detection = await detectProject(rootDir);

    expect(detection.manifestPaths).toEqual([
      join(rootDir, "package.json"),
      join(rootDir, "!fixtures/deep/example/package.json"),
      join(rootDir, "groups/example/package.json"),
    ]);
    expect(detection.features.react).toBe(true);
    expect(detection.features.vue).toBe(true);
    expect(detection.warnings).toHaveLength(3);
  });

  it("ignores nested packages keys and continues to the top-level packages block", async () => {
    const rootDir = await createProject({
      "package.json": json({}),
      "packages/web/package.json": json({ dependencies: { react: "*" } }),
      "pnpm-workspace.yaml": `catalog:
  packages:
    react: ^19
packages:
  - packages/*
`,
    });

    const detection = await detectProject(rootDir);

    expect(detection.manifestPaths).toEqual([
      join(rootDir, "package.json"),
      join(rootDir, "packages/web/package.json"),
    ]);
    expect(detection.features.react).toBe(true);
    expect(detection.warnings).toEqual([]);
  });

  it("warns instead of expanding a flow-style pnpm packages array", async () => {
    const rootDir = await createProject({
      "apps/web/package.json": json({ dependencies: { react: "*" } }),
      "package.json": json({}),
      "pnpm-workspace.yaml": "packages: [apps/*]\n",
    });

    const detection = await detectProject(rootDir);

    expect(detection.manifestPaths).toEqual([join(rootDir, "package.json")]);
    expect(detection.warnings).toHaveLength(1);
  });

  it.each(["tsconfig.json", "tsconfig.app.json"])(
    "detects TypeScript from root %s but not Node from @types/node",
    async (configPath) => {
      const rootDir = await createProject({
        [configPath]: "{}\n",
        "package.json": json({ devDependencies: { "@types/node": "*" } }),
      });

      const detection = await detectProject(rootDir);

      expect(detection.features.typescript).toBe(true);
      expect(detection.features.node).toBe(false);
    },
  );

  it.each(["express", "fastify", "hono", "koa", "@nestjs/core"])(
    "detects Node from %s",
    async (dependency) => {
      const rootDir = await createProject({
        "package.json": json({ dependencies: { [dependency]: "*" } }),
      });

      expect((await detectProject(rootDir)).features.node).toBe(true);
    },
  );

  it.each(["storybook", "@storybook/react", "@storybook/vue3"])(
    "detects Storybook from %s",
    async (dependency) => {
      const rootDir = await createProject({
        "package.json": json({ dependencies: { [dependency]: "*" } }),
      });

      expect((await detectProject(rootDir)).features.experimental.storybook).toBe(true);
    },
  );

  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
  ] as const)("selects %s as %s", async (lockfile, packageManager) => {
    const rootDir = await createProject({
      [lockfile]: "",
      "package.json": json({}),
    });

    const detection = await detectProject(rootDir);

    expect(detection.packageManager).toBe(packageManager);
    expect(detection.packageManagerConflicts).toEqual([]);
  });

  it("reports multiple lockfiles in deterministic order without choosing", async () => {
    const rootDir = await createProject({
      "bun.lock": "",
      "package-lock.json": "",
      "package.json": json({}),
      "pnpm-lock.yaml": "",
      "yarn.lock": "",
    });

    const detection = await detectProject(rootDir);

    expect(detection.packageManager).toBeUndefined();
    expect(detection.packageManagerConflicts).toEqual(["pnpm", "npm", "yarn", "bun"]);
  });

  it.each(["pnpm", "npm", "yarn", "bun"] as const)(
    "selects a recognized %s user agent while reporting conflicting lockfiles",
    async (packageManager) => {
      const rootDir = await createProject({
        "package-lock.json": "",
        "package.json": json({}),
        "pnpm-lock.yaml": "",
      });

      const detection = await detectProject(rootDir, `${packageManager}/1.0.0 node/v22`);

      expect(detection.packageManager).toBe(packageManager);
      expect(detection.packageManagerConflicts).toEqual(["pnpm", "npm"]);
    },
  );
});

describe("defaultChoices", () => {
  it("enables detected stable ecosystems while keeping opt-ins and experiments safe", async () => {
    const rootDir = await createProject({ "package.json": json({}) });
    const detection: IProjectDetection = {
      features: {
        experimental: {
          cypress: true,
          mocha: true,
          playwright: true,
          regexp: true,
          sonarjs: true,
          storybook: true,
          testingLibrary: true,
        },
        jest: true,
        nextjs: true,
        node: true,
        react: false,
        tailwindcss: "src/index.css",
        typescript: true,
        vitest: true,
        vue: true,
      },
      manifestPaths: [join(rootDir, "package.json")],
      packageManager: "npm",
      packageManagerConflicts: [],
      rootDir,
      warnings: [],
    };

    expect(defaultChoices(detection)).toEqual({
      experimental: {
        cypress: false,
        mocha: false,
        playwright: false,
        regexp: false,
        sonarjs: false,
        storybook: false,
        testingLibrary: false,
      },
      jsdoc: false,
      nextjs: true,
      node: true,
      react: true,
      reactPerf: false,
      tailwindcss: "src/index.css",
      test: ["jest", "vitest"],
      typeAware: false,
      typescript: true,
      vue: true,
    });
  });
});

describe("createInitializationPlan", () => {
  it("plans deterministic config, scripts, editor files, and ordered pnpm dependencies read-only", async () => {
    const rootDir = await createProject({
      ".vscode/extensions.json": json({ recommendations: ["existing.extension"] }),
      ".vscode/settings.json": json({
        "editor.codeActionsOnSave": { "source.fixAll.oxc": "always" },
      }),
      "package.json": json({
        dependencies: {
          jest: "*",
          next: "*",
          react: "*",
          tailwindcss: "*",
          typescript: "*",
          vitest: "*",
          vue: "*",
        },
      }),
      "pnpm-lock.yaml": "",
      "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
      "src/index.css": '@import "tailwindcss";\n',
    });
    const detection = await detectProject(rootDir);
    const detectedChoices = defaultChoices(detection);
    const choices: IInitializationChoices = {
      ...detectedChoices,
      experimental: {
        ...detectedChoices.experimental,
        cypress: true,
        playwright: true,
      },
      jsdoc: true,
      node: true,
      reactPerf: true,
      typeAware: true,
    };
    const before = await snapshotProject(rootDir);

    const plan = await createInitializationPlan(detection, choices);

    expect(plannedFile(plan, "oxlint.config.ts")).toMatchObject({
      content: `import amamo from '@amamo/oxlint-config'

export default amamo({
  experimental: { cypress: true, playwright: true },
  jsdoc: true,
  nextjs: true,
  node: true,
  react: true,
  reactPerf: true,
  tailwindcss: { entryPoint: 'src/index.css' },
  test: ['jest', 'vitest'],
  typeAware: true,
  typescript: true,
  vue: true,
})
`,
      existed: false,
      path: join(rootDir, "oxlint.config.ts"),
    });

    const packageChange = plannedFile(plan, "package.json");
    expect(JSON.parse(packageChange.content).scripts).toEqual({
      format: "oxfmt .",
      "format:check": "oxfmt --check .",
      lint: "oxlint .",
      "lint:fix": "oxlint --fix .",
    });
    expect(packageChange.existed).toBe(true);
    expect(packageChange.originalHash).toMatch(/^[a-f\d]{64}$/);

    const settings = JSON.parse(plannedFile(plan, ".vscode/settings.json").content);
    expect(settings["editor.formatOnSave"]).toBe(false);
    expect(Object.keys(settings["editor.codeActionsOnSave"])).toEqual([
      "source.format.oxc",
      "source.fixAll.oxc",
    ]);
    expect(JSON.parse(plannedFile(plan, ".vscode/extensions.json").content)).toEqual({
      recommendations: ["existing.extension", "oxc.oxc-vscode"],
    });
    expect(plan.install).toEqual({
      args: [
        "add",
        "--save-dev",
        "--workspace-root",
        "@amamo/oxlint-config",
        "oxlint",
        "oxfmt",
        "oxlint-tailwindcss",
        "oxlint-tsgolint",
        "eslint-plugin-cypress",
        "eslint-plugin-playwright",
      ],
      command: "pnpm",
      display:
        "pnpm add --save-dev --workspace-root @amamo/oxlint-config oxlint oxfmt oxlint-tailwindcss oxlint-tsgolint eslint-plugin-cypress eslint-plugin-playwright",
    });
    expect(await snapshotProject(rootDir)).toEqual(before);
  });

  it("always emits TypeScript false and a scalar for one test runner without factory-default keys", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ devDependencies: { jest: "*" } }),
    });
    const detection = await detectProject(rootDir);

    const plan = await createInitializationPlan(detection, defaultChoices(detection));

    const content = plannedFile(plan, "oxlint.config.ts").content;
    expect(content).toBe(`import amamo from '@amamo/oxlint-config'

export default amamo({
  test: 'jest',
  typescript: false,
})
`);
    expect(content).not.toContain("imports:");
    expect(content).not.toContain("promise:");
  });

  it.each([".oxlintrc.json", ".oxlintrc.jsonc", "oxlint.config.ts", "oxlint.config.mts"])(
    "preserves existing %s and returns a composition snippet",
    async (configPath) => {
      const rootDir = await createProject({
        [configPath]: "existing config\n",
        "package.json": json({
          devDependencies: { react: "*", typescript: "*", vitest: "*" },
        }),
      });
      const detection = await detectProject(rootDir);

      const plan = await createInitializationPlan(detection, defaultChoices(detection));

      expect(plan.files.some((file) => file.path === join(rootDir, "oxlint.config.ts"))).toBe(
        false,
      );
      expect(plan.lintConfigSnippet?.match(/export default/g)).toHaveLength(1);
      expect(plan.lintConfigSnippet).toBe(`import amamo from '@amamo/oxlint-config'

const existingConfig = {
  // Paste the value exported by your existing config here.
}

export default amamo({
  react: true,
  test: 'vitest',
  typescript: true,
}, existingConfig)
`);
      expect(await readFile(join(rootDir, configPath), "utf8")).toBe("existing config\n");
    },
  );

  it("preserves conflicting scripts while planning only missing scripts", async () => {
    const rootDir = await createProject({
      "package.json": json({ scripts: { format: "custom format", lint: "custom lint" } }),
    });
    const detection = await detectProject(rootDir);

    const plan = await createInitializationPlan(detection, defaultChoices(detection));

    expect(JSON.parse(plannedFile(plan, "package.json").content).scripts).toEqual({
      format: "custom format",
      "format:check": "oxfmt --check .",
      lint: "custom lint",
      "lint:fix": "oxlint --fix .",
    });
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/scripts/lint"),
        expect.stringContaining("/scripts/format"),
      ]),
    );
  });

  it("reports reverse save-action order and leaves the settings file byte-identical", async () => {
    const settingsSource = `{
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "always",
    "source.format.oxc": "always"
  }
}
`;
    const rootDir = await createProject({
      ".vscode/settings.json": settingsSource,
      "package.json": json({}),
    });
    const detection = await detectProject(rootDir);

    const plan = await createInitializationPlan(detection, defaultChoices(detection));

    expect(plan.files.some((file) => file.path === join(rootDir, ".vscode/settings.json"))).toBe(
      false,
    );
    expect(plan.conflicts).toEqual([expect.stringContaining("source.format.oxc")]);
    expect(await readFile(join(rootDir, ".vscode/settings.json"), "utf8")).toBe(settingsSource);
  });

  it.each([
    [
      "pnpm workspace",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "pnpm",
      ["add", "--save-dev", "--workspace-root"],
    ],
    ["pnpm project", "pnpm-lock.yaml", undefined, "pnpm", ["add", "--save-dev"]],
    ["npm project", "package-lock.json", undefined, "npm", ["install", "--save-dev"]],
    ["yarn project", "yarn.lock", undefined, "yarn", ["add", "--dev"]],
    ["bun project", "bun.lock", undefined, "bun", ["add", "--dev"]],
  ] as const)(
    "builds the %s install command",
    async (_label, lockfile, workspaceFile, command, prefix) => {
      const files: Record<string, string> = {
        [lockfile]: "",
        "package.json": json({}),
      };
      if (workspaceFile) files[workspaceFile] = "packages:\n  - packages/*\n";
      const rootDir = await createProject(files);
      const detection = await detectProject(rootDir);

      const plan = await createInitializationPlan(detection, defaultChoices(detection));

      expect(plan.install.command).toBe(command);
      expect(plan.install.args).toEqual([...prefix, "@amamo/oxlint-config", "oxlint", "oxfmt"]);
      expect(plan.install.display).toBe(`${command} ${plan.install.args.join(" ")}`);
    },
  );

  it("produces no second file changes after materializing the first plan in its temp project", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ devDependencies: { react: "*", vitest: "*" } }),
    });
    const firstDetection = await detectProject(rootDir);
    const firstChoices = defaultChoices(firstDetection);
    const firstPlan = await createInitializationPlan(firstDetection, firstChoices);

    await writePlanFiles(firstPlan);

    const secondDetection = await detectProject(rootDir);
    const secondChoices = defaultChoices(secondDetection);
    const secondPlan = await createInitializationPlan(secondDetection, secondChoices);

    expect(secondChoices).toEqual(firstChoices);
    expect(secondPlan.files).toEqual([]);
  });
});

describe("executeInitialization", () => {
  it("dry-run starts no subprocess and writes no file", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({}),
    });
    const detection = await detectProject(rootDir);
    const plan = await createInitializationPlan(detection, defaultChoices(detection));
    const before = await snapshotProject(rootDir);
    const runCommand: RunCommand = async () => {
      throw new Error("dry-run started a subprocess");
    };

    const result = await executeInitialization(
      plan,
      { dryRun: true, noInstall: false },
      runCommand,
    );

    expect(result).toEqual({ installed: false, notices: plan.notices, written: [] });
    expect(await snapshotProject(rootDir)).toEqual(before);
  });

  it.each(["outside", "root", "noncanonical", "duplicate"] as const)(
    "rejects a %s target before installation or writes",
    async (kind) => {
      const outerDir = await createProject({
        "project/package-lock.json": "",
        "project/package.json": json({ name: "fixture" }),
      });
      const rootDir = join(outerDir, "project");
      const detection = await detectProject(rootDir);
      const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
      const safePath = join(rootDir, "safe.txt");
      const targetPath =
        kind === "outside"
          ? join(outerDir, "outside.txt")
          : kind === "root"
            ? rootDir
            : kind === "noncanonical"
              ? `${rootDir}${sep}nested${sep}..${sep}safe.txt`
              : safePath;
      const files: IFileChange[] = [{ content: "first\n", existed: false, path: targetPath }];
      if (kind === "duplicate") {
        files.push({ content: "second\n", existed: false, path: safePath });
      }
      const plan: IInitializationPlan = { ...basePlan, files };
      const before = await snapshotProject(outerDir);
      let commandStarted = false;
      const runCommand: RunCommand = async () => {
        commandStarted = true;
      };

      await expect(
        executeInitialization(plan, { dryRun: false, noInstall: false }, runCommand),
      ).rejects.toThrow(targetPath);
      expect(commandStarted).toBe(false);
      expect(await snapshotProject(outerDir)).toEqual(before);
    },
  );

  it("rejects a target whose existing parent symlink escapes the physical root", async () => {
    const outerDir = await createProject({
      "outside/sentinel.txt": "outside\n",
      "project/package-lock.json": "",
      "project/package.json": json({ name: "fixture" }),
    });
    const rootDir = join(outerDir, "project");
    const outsideDir = join(outerDir, "outside");
    const linkPath = join(rootDir, "linked");
    await symlink(outsideDir, linkPath, process.platform === "win32" ? "junction" : "dir");
    const targetPath = join(linkPath, "escaped.txt");
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [{ content: "escaped\n", existed: false, path: targetPath }],
    };
    let commandStarted = false;
    const runCommand: RunCommand = async () => {
      commandStarted = true;
    };

    await expect(
      executeInitialization(plan, { dryRun: false, noInstall: false }, runCommand),
    ).rejects.toThrow(targetPath);
    expect(commandStarted).toBe(false);
    expect(await readFile(join(outsideDir, "sentinel.txt"), "utf8")).toBe("outside\n");
    await expect(access(join(outsideDir, "escaped.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("runs installation from the canonical physical root", async () => {
    const outerDir = await createProject({
      "project/package-lock.json": "",
      "project/package.json": json({ name: "fixture" }),
    });
    const physicalProject = join(outerDir, "project");
    const linkedProject = join(outerDir, "linked-project");
    await symlink(
      physicalProject,
      linkedProject,
      process.platform === "win32" ? "junction" : "dir",
    );
    const detection = await detectProject(linkedProject);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const plan: IInitializationPlan = { ...basePlan, files: [] };
    let commandCwd = "";
    const runCommand: RunCommand = async (_command, _args, cwd) => {
      commandCwd = cwd;
    };

    await executeInitialization(plan, { dryRun: false, noInstall: false }, runCommand);

    expect(commandCwd).toBe(await realpath(physicalProject));
  });

  it("rejects a replaced root before reading or writing planned targets", async () => {
    const outerDir = await createProject({
      "project/package-lock.json": "",
      "project/package.json": json({ name: "fixture" }),
    });
    const rootDir = join(outerDir, "project");
    const backupDir = join(outerDir, "project-backup");
    const safePath = join(rootDir, "safe.txt");
    const packagePath = join(rootDir, "package.json");
    const replacementPackage = json({ name: "replacement" });
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const packageChange = plannedFile(basePlan, "package.json");
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [{ content: "must not be written\n", existed: false, path: safePath }, packageChange],
    };
    const runCommand: RunCommand = async () => {
      renameSync(rootDir, backupDir);
      await mkdir(rootDir);
      await writeFile(packagePath, replacementPackage);
    };

    await expect(
      executeInitialization(plan, { dryRun: false, noInstall: false }, runCommand),
    ).rejects.toThrow("Initialization root changed during execution");
    expect(await readFile(packagePath, "utf8")).toBe(replacementPackage);
    await expect(access(safePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rechecks physical containment after a target parent is replaced by a symlink", async () => {
    const outerDir = await createProject({
      "outside/sentinel.txt": "outside\n",
      "project/package-lock.json": "",
      "project/package.json": json({ name: "fixture" }),
    });
    const rootDir = join(outerDir, "project");
    const outsideDir = join(outerDir, "outside");
    const safeDir = join(rootDir, "safe");
    await mkdir(safeDir);
    const targetPath = join(safeDir, "escaped.txt");
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [{ content: "escaped\n", existed: false, path: targetPath }],
    };
    const uuid = "00000000-0000-4000-8000-000000000008";
    vi.mocked(randomUUID).mockImplementationOnce(() => {
      rmdirSync(safeDir);
      symlinkSync(outsideDir, safeDir, process.platform === "win32" ? "junction" : "dir");
      return uuid;
    });

    await expect(executeInitialization(plan, { dryRun: false, noInstall: true })).rejects.toThrow(
      targetPath,
    );
    expect(await readFile(join(outsideDir, "sentinel.txt"), "utf8")).toBe("outside\n");
    await expect(access(join(outsideDir, "escaped.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not create deep parents through a symlink introduced at UUID generation", async () => {
    const outerDir = await createProject({
      "outside/sentinel.txt": "outside\n",
      "project/package-lock.json": "",
      "project/package.json": json({ name: "fixture" }),
      "project/safe/sentinel.txt": "safe\n",
    });
    const rootDir = join(outerDir, "project");
    const outsideDir = join(outerDir, "outside");
    const safeDir = join(rootDir, "safe");
    const backupDir = join(rootDir, "safe-backup");
    const targetPath = join(safeDir, "deep", "nested", "target.txt");
    const uuid = "00000000-0000-4000-8000-000000000009";
    const outsideDeepDir = join(outsideDir, "deep", "nested");
    const outsideTarget = join(outsideDeepDir, "target.txt");
    const outsideTemp = join(outsideDeepDir, `.target.txt.${uuid}.tmp`);
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [{ content: "escaped\n", existed: false, path: targetPath }],
    };
    vi.mocked(randomUUID).mockImplementationOnce(() => {
      renameSync(safeDir, backupDir);
      symlinkSync(outsideDir, safeDir, process.platform === "win32" ? "junction" : "dir");
      return uuid;
    });

    await expect(executeInitialization(plan, { dryRun: false, noInstall: true })).rejects.toThrow(
      targetPath,
    );
    await expect(access(outsideDeepDir)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(outsideTarget)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(outsideTemp)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a same-path root replacement introduced during no-install writes", async () => {
    const outerDir = await createProject({
      "project/package-lock.json": "",
      "project/package.json": json({ name: "fixture" }),
      "project/sentinel.txt": "original root\n",
    });
    const rootDir = join(outerDir, "project");
    const backupDir = join(outerDir, "project-backup");
    const targetPath = join(rootDir, "target.txt");
    const uuid = "00000000-0000-4000-8000-000000000010";
    const temporaryPath = join(rootDir, `.target.txt.${uuid}.tmp`);
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [{ content: "must not be written\n", existed: false, path: targetPath }],
    };
    vi.mocked(randomUUID).mockImplementationOnce(() => {
      renameSync(rootDir, backupDir);
      mkdirSync(rootDir);
      return uuid;
    });

    await expect(executeInitialization(plan, { dryRun: false, noInstall: true })).rejects.toThrow(
      "Initialization root changed during execution",
    );
    await expect(access(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(backupDir, "sentinel.txt"), "utf8")).toBe("original root\n");
  });

  it("no-install writes safe files but starts no subprocess", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const plan = await createInitializationPlan(detection, defaultChoices(detection));
    const runCommand: RunCommand = async () => {
      throw new Error("no-install started a subprocess");
    };

    const result = await executeInitialization(
      plan,
      { dryRun: false, noInstall: true },
      runCommand,
    );

    expect(result).toEqual({
      installed: false,
      notices: plan.notices,
      written: plan.files.map((file) => file.path),
    });
    for (const file of plan.files) {
      expect(await readFile(file.path, "utf8")).toBe(file.content);
    }
  });

  it("uses a synchronous snapshot when the command mutates the caller-owned plan", async () => {
    const outerDir = await createProject({
      "project/package-lock.json": "",
      "project/package.json": json({ name: "fixture" }),
    });
    const rootDir = join(outerDir, "project");
    const outsidePath = join(outerDir, "outside.txt");
    const safePath = join(rootDir, "safe.txt");
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [{ content: "snapshot content\n", existed: false, path: safePath }],
      notices: ["snapshot notice"],
    };
    const runCommand: RunCommand = async () => {
      plan.rootDir = outerDir;
      plan.install.args.push("mutated");
      plan.notices.push("mutated notice");
      plan.files[0]!.path = outsidePath;
      plan.files[0]!.content = "mutated content\n";
    };

    const result = await executeInitialization(
      plan,
      { dryRun: false, noInstall: false },
      runCommand,
    );

    expect(await readFile(safePath, "utf8")).toBe("snapshot content\n");
    await expect(access(outsidePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.notices).toEqual(["snapshot notice"]);
    expect(result.written).toEqual([safePath]);
  });

  it("installation rejection writes nothing and includes the retry command", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const plan = await createInitializationPlan(detection, defaultChoices(detection));
    const before = await snapshotProject(rootDir);
    const runCommand: RunCommand = async () => {
      throw new Error("registry unavailable");
    };

    await expect(
      executeInitialization(plan, { dryRun: false, noInstall: false }, runCommand),
    ).rejects.toThrow(plan.install.display);
    expect(await snapshotProject(rootDir)).toEqual(before);
  });

  it("default spawn resolves zero and rejects nonzero exits and spawn errors", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [],
      install: {
        args: ["-e", "process.exit(0)"],
        command: process.execPath,
        display: "node zero",
      },
    };

    await expect(
      executeInitialization(plan, { dryRun: false, noInstall: false }),
    ).resolves.toMatchObject({ installed: true, written: [] });

    plan.install = {
      args: ["-e", "process.exit(7)"],
      command: process.execPath,
      display: "node nonzero",
    };
    await expect(executeInitialization(plan, { dryRun: false, noInstall: false })).rejects.toThrow(
      "node nonzero",
    );

    plan.install = {
      args: [],
      command: join(rootDir, "missing-command"),
      display: "missing command",
    };
    await expect(executeInitialization(plan, { dryRun: false, noInstall: false })).rejects.toThrow(
      "missing command",
    );

    if (process.platform !== "win32") {
      plan.install = {
        args: ["-e", 'process.kill(process.pid, "SIGTERM")'],
        command: process.execPath,
        display: "node signal",
      };
      await expect(
        executeInitialization(plan, { dryRun: false, noInstall: false }),
      ).rejects.toThrow("signal SIGTERM");
    }
  });

  it("preserves package-manager changes and reports new script conflicts", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const plan = await createInitializationPlan(detection, defaultChoices(detection));
    const runCommand: RunCommand = async (command, args, cwd) => {
      expect([command, ...args]).toEqual([
        "npm",
        "install",
        "--save-dev",
        "@amamo/oxlint-config",
        "oxlint",
        "oxfmt",
      ]);
      const manifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
      manifest.devDependencies = { "package-manager-added": "1.0.0" };
      manifest.scripts = { lint: "custom lint" };
      await writeFile(join(cwd, "package.json"), json(manifest));
    };

    const result = await executeInitialization(
      plan,
      { dryRun: false, noInstall: false },
      runCommand,
    );
    const manifest = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));

    expect(result.installed).toBe(true);
    expect(manifest.devDependencies).toEqual({ "package-manager-added": "1.0.0" });
    expect(manifest.scripts).toEqual({
      format: "oxfmt .",
      "format:check": "oxfmt --check .",
      lint: "custom lint",
      "lint:fix": "oxlint --fix .",
    });
    expect(result.notices).toContain("package.json:/scripts/lint");
  });

  it("rejects a concurrently changed pre-existing target before the first write", async () => {
    const rootDir = await createProject({
      ".vscode/settings.json": json({ "editor.formatOnSave": true }),
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const plan = await createInitializationPlan(detection, defaultChoices(detection));
    const settingsPath = join(rootDir, ".vscode/settings.json");
    await writeFile(settingsPath, json({ user: "concurrent edit" }));
    const before = await snapshotProject(rootDir);

    await expect(executeInitialization(plan, { dryRun: false, noInstall: true })).rejects.toThrow(
      settingsPath,
    );
    expect(await snapshotProject(rootDir)).toEqual(before);
  });

  it("preserves a later target changed after the full preflight and cleans its temp", async () => {
    const settingsSource = json({ "editor.formatOnSave": true });
    const concurrentSource = json({ user: "concurrent edit" });
    const rootDir = await createProject({
      ".vscode/settings.json": settingsSource,
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const configChange = plannedFile(basePlan, "oxlint.config.ts");
    const settingsChange = plannedFile(basePlan, ".vscode/settings.json");
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [configChange, settingsChange],
    };
    const configUuid = "00000000-0000-4000-8000-000000000001";
    const settingsUuid = "00000000-0000-4000-8000-000000000002";
    const settingsPath = join(rootDir, ".vscode/settings.json");
    vi.mocked(randomUUID)
      .mockImplementationOnce(() => {
        writeFileSync(settingsPath, concurrentSource);
        return configUuid;
      })
      .mockReturnValueOnce(settingsUuid);
    const settingsTemp = join(
      dirname(settingsPath),
      `.${basename(settingsPath)}.${settingsUuid}.tmp`,
    );
    let message = "";

    try {
      await executeInitialization(plan, { dryRun: false, noInstall: true });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(settingsPath);
    expect(await readFile(settingsPath, "utf8")).toBe(concurrentSource);
    expect(await readFile(join(rootDir, "oxlint.config.ts"), "utf8")).toBe(configChange.content);
    await expect(access(settingsTemp)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves package.json changed after its install-boundary refresh", async () => {
    const packageSource = json({ name: "fixture" });
    const concurrentSource = json({ name: "concurrent edit" });
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": packageSource,
    });
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const configChange = plannedFile(basePlan, "oxlint.config.ts");
    const packageChange = plannedFile(basePlan, "package.json");
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [configChange, packageChange],
    };
    const configUuid = "00000000-0000-4000-8000-000000000003";
    const packageUuid = "00000000-0000-4000-8000-000000000004";
    const packagePath = join(rootDir, "package.json");
    vi.mocked(randomUUID)
      .mockImplementationOnce(() => {
        writeFileSync(packagePath, concurrentSource);
        return configUuid;
      })
      .mockReturnValueOnce(packageUuid);
    const packageTemp = join(rootDir, `.package.json.${packageUuid}.tmp`);
    let message = "";

    try {
      await executeInitialization(plan, { dryRun: false, noInstall: true });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(packagePath);
    expect(await readFile(packagePath, "utf8")).toBe(concurrentSource);
    await expect(access(packageTemp)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("checks a later missing-at-plan target before the first write", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const plan = await createInitializationPlan(detection, defaultChoices(detection));
    const extensionsPath = join(rootDir, ".vscode/extensions.json");
    await mkdir(dirname(extensionsPath), { recursive: true });
    await writeFile(extensionsPath, "concurrent extensions\n");
    const before = await snapshotProject(rootDir);

    await expect(executeInitialization(plan, { dryRun: false, noInstall: true })).rejects.toThrow(
      extensionsPath,
    );
    expect(await snapshotProject(rootDir)).toEqual(before);
    await expect(access(join(rootDir, "oxlint.config.ts"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("atomically renames each target without replacing open handles", async () => {
    const settingsSource = json({ "editor.formatOnSave": true });
    const extensionsSource = json({ recommendations: ["existing.extension"] });
    const rootDir = await createProject({
      ".vscode/extensions.json": extensionsSource,
      ".vscode/settings.json": settingsSource,
      "package-lock.json": "",
      "package.json": json({}),
    });
    const settingsPath = join(rootDir, ".vscode/settings.json");
    const extensionsPath = join(rootDir, ".vscode/extensions.json");
    const [settingsHandle, extensionsHandle] = await Promise.all([
      open(settingsPath, "r"),
      open(extensionsPath, "r"),
    ]);

    try {
      const detection = await detectProject(rootDir);
      const plan = await createInitializationPlan(detection, defaultChoices(detection));

      await executeInitialization(plan, { dryRun: false, noInstall: true });

      expect(await settingsHandle.readFile("utf8")).toBe(settingsSource);
      expect(await extensionsHandle.readFile("utf8")).toBe(extensionsSource);
      expect(
        (await readdir(join(rootDir, ".vscode"))).filter((name) => name.endsWith(".tmp")),
      ).toEqual([]);
    } finally {
      await Promise.all([settingsHandle.close(), extensionsHandle.close()]);
    }
  });

  it.skipIf(process.platform === "win32")("preserves complete POSIX permission modes", async () => {
    const rootDir = await createProject({
      ".vscode/extensions.json": json({ recommendations: ["existing.extension"] }),
      ".vscode/settings.json": json({ "editor.formatOnSave": true }),
      "package-lock.json": "",
      "package.json": json({}),
    });
    const settingsPath = join(rootDir, ".vscode/settings.json");
    const extensionsPath = join(rootDir, ".vscode/extensions.json");
    const settingsMode = 0o4755;
    const extensionsMode = 0o2750;
    await Promise.all([chmod(settingsPath, settingsMode), chmod(extensionsPath, extensionsMode)]);
    expect((await stat(settingsPath)).mode & 0o7777).toBe(settingsMode);
    expect((await stat(extensionsPath)).mode & 0o7777).toBe(extensionsMode);
    const detection = await detectProject(rootDir);
    const plan = await createInitializationPlan(detection, defaultChoices(detection));

    await executeInitialization(plan, { dryRun: false, noInstall: true });

    expect((await stat(settingsPath)).mode & 0o7777).toBe(settingsMode);
    expect((await stat(extensionsPath)).mode & 0o7777).toBe(extensionsMode);
  });

  it("uses wx without truncating a colliding same-directory temp file", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const configChange = plannedFile(basePlan, "oxlint.config.ts");
    const plan: IInitializationPlan = { ...basePlan, files: [configChange] };
    const uuid = "00000000-0000-4000-8000-000000000005";
    vi.mocked(randomUUID).mockReturnValueOnce(uuid);
    const configPath = join(rootDir, "oxlint.config.ts");
    const temporaryPath = join(rootDir, `.oxlint.config.ts.${uuid}.tmp`);
    await writeFile(temporaryPath, "user-owned temp\n");

    let message = "";
    try {
      await executeInitialization(plan, { dryRun: false, noInstall: true });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(configPath);
    expect(message).toContain("Remaining unwritten paths: none");
    expect(await readFile(temporaryPath, "utf8")).toBe("user-owned temp\n");
    await expect(access(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("cleans an owned temp and reports only paths remaining after the failed target", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const detection = await detectProject(rootDir);
    const basePlan = await createInitializationPlan(detection, defaultChoices(detection));
    const failedPath = join(rootDir, "dir");
    const firstPath = join(failedPath, "child.txt");
    const remainingPath = join(rootDir, "remaining.txt");
    const plan: IInitializationPlan = {
      ...basePlan,
      files: [
        { content: "first\n", existed: false, path: firstPath },
        { content: "failed\n", existed: false, path: failedPath },
        { content: "remaining\n", existed: false, path: remainingPath },
      ],
    };
    const firstUuid = "00000000-0000-4000-8000-000000000006";
    const failedUuid = "00000000-0000-4000-8000-000000000007";
    vi.mocked(randomUUID).mockReturnValueOnce(firstUuid).mockReturnValueOnce(failedUuid);
    const failedTemp = join(rootDir, `.dir.${failedUuid}.tmp`);
    const runCommand: RunCommand = async (_command, _args, cwd) => {
      await writeFile(
        join(cwd, "package.json"),
        json({ devDependencies: { "package-manager-added": "1.0.0" }, name: "fixture" }),
      );
    };

    let message = "";
    try {
      await executeInitialization(plan, { dryRun: false, noInstall: false }, runCommand);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain(`Failed to write ${failedPath}`);
    expect(message).toContain(`Remaining unwritten paths: ${remainingPath}`);
    expect(message).not.toContain(`Remaining unwritten paths: ${failedPath}`);
    expect(await readFile(firstPath, "utf8")).toBe("first\n");
    expect(
      JSON.parse(await readFile(join(rootDir, "package.json"), "utf8")).devDependencies,
    ).toEqual({ "package-manager-added": "1.0.0" });
    await expect(readFile(remainingPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(failedTemp)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(rootDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("is idempotent when a fresh second plan is executed", async () => {
    const rootDir = await createProject({
      "package-lock.json": "",
      "package.json": json({ name: "fixture" }),
    });
    const firstDetection = await detectProject(rootDir);
    const choices = defaultChoices(firstDetection);
    const firstPlan = await createInitializationPlan(firstDetection, choices);
    await executeInitialization(firstPlan, { dryRun: false, noInstall: true });
    const beforeSecondExecution = await snapshotProject(rootDir);
    const secondDetection = await detectProject(rootDir);
    const secondPlan = await createInitializationPlan(secondDetection, choices);

    const result = await executeInitialization(secondPlan, {
      dryRun: false,
      noInstall: true,
    });

    expect(result.written).toEqual([]);
    expect(await snapshotProject(rootDir)).toEqual(beforeSecondExecution);
  });
});
