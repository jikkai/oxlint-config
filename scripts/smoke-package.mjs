import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function isWithin(parent, candidate) {
  const relativePath = relative(parent, candidate);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${String(result.status)}\n${result.stderr}`,
    );
  }

  return result.stdout;
}

let validatedRoot;
let validatedTarball;

try {
  const temporaryBase = resolve(tmpdir());
  const createdRoot = await mkdtemp(join(temporaryBase, "amamo-oxlint-config-"));
  assert.equal(isWithin(temporaryBase, createdRoot), true, "mkdtemp escaped the temp directory");
  validatedRoot = createdRoot;

  const packDirectory = join(validatedRoot, "pack");
  const projectDirectory = join(validatedRoot, "project");
  await Promise.all([
    mkdir(packDirectory, { recursive: true }),
    mkdir(projectDirectory, { recursive: true }),
  ]);

  const packOutput = run(
    npmCommand,
    ["pack", "--json", "--pack-destination", packDirectory],
    packageRoot,
  );
  const packResults = JSON.parse(packOutput);
  assert.equal(Array.isArray(packResults), true, "npm pack did not return a JSON array");
  assert.equal(packResults.length, 1, "npm pack must return exactly one result");

  const packResult = packResults[0];
  assert.equal(typeof packResult?.filename, "string", "npm pack result is missing filename");
  const tarball = resolve(packDirectory, packResult.filename);
  assert.equal(isWithin(packDirectory, tarball), true, "npm pack tarball escaped pack directory");
  assert.equal((await stat(tarball)).isFile(), true, "npm pack did not create a tarball");
  validatedTarball = tarball;

  assert.equal(Array.isArray(packResult.files), true, "npm pack result is missing file entries");
  const entries = packResult.files.map((file) => file.path);
  for (const required of [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/cli.js",
    "README.md",
    "LICENSE",
    "package.json",
  ]) {
    assert.equal(entries.includes(required), true, `tarball is missing ${required}`);
  }
  for (const entry of entries) {
    assert.equal(
      ["src/", "fixtures/", "docs/", "coverage/"].some((prefix) => entry.startsWith(prefix)),
      false,
      `tarball contains forbidden path ${entry}`,
    );
    assert.equal(
      entry.split("/").some((part) => part === "tests" || part === "__tests__"),
      false,
      `tarball contains ${entry}`,
    );
    assert.equal(
      /(^|\/)[^/]*\.(?:spec|test)\.[^/]+$/.test(entry),
      false,
      `tarball contains test file ${entry}`,
    );
  }

  await writeFile(
    join(projectDirectory, "package.json"),
    `${JSON.stringify({ name: "amamo-package-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  run(
    npmCommand,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      validatedTarball,
    ],
    projectDirectory,
  );

  run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import amamo from "@amamo/oxlint-config"; if (!Array.isArray(amamo().extends)) throw new Error("amamo().extends must be an array");',
    ],
    projectDirectory,
  );

  const initArgs = [
    "exec",
    "--offline",
    "--",
    "amamo-oxlint-config",
    "init",
    "--yes",
    "--no-install",
  ];
  run(npmCommand, initArgs, projectDirectory);

  const packageManifest = JSON.parse(
    await readFile(join(projectDirectory, "package.json"), "utf8"),
  );
  assert.deepEqual(packageManifest.scripts, {
    format: "oxfmt .",
    "format:check": "oxfmt --check .",
    lint: "oxlint .",
    "lint:fix": "oxlint --fix .",
  });

  const managedPaths = [
    "package.json",
    "oxlint.config.ts",
    ".vscode/settings.json",
    ".vscode/extensions.json",
  ];
  const before = await Promise.all(
    managedPaths.map((path) => readFile(join(projectDirectory, path))),
  );
  for (const content of before) assert.notEqual(content.length, 0);

  run(npmCommand, initArgs, projectDirectory);
  const after = await Promise.all(
    managedPaths.map((path) => readFile(join(projectDirectory, path))),
  );
  assert.deepEqual(after, before, "initializer changed managed files on the second run");

  console.log("Package smoke test passed.");
} finally {
  if (validatedTarball !== undefined) await rm(validatedTarball, { force: true });
  if (validatedRoot !== undefined) await rm(validatedRoot, { force: true, recursive: true });
}
