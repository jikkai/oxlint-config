# @amamo/oxlint-config

Opinionated Oxlint presets and a safe Oxc initializer.

## Install

Install the preset, Oxlint, and Oxfmt as development dependencies:

```sh
pnpm add --save-dev @amamo/oxlint-config oxlint oxfmt
```

## Configuration

Create `oxlint.config.ts`:

```ts
import amamo from "@amamo/oxlint-config";

export default amamo();
```

TypeScript, import, and promise rules are enabled by default. Framework and test presets are
explicit:

```ts
import amamo from "@amamo/oxlint-config";

export default amamo(
  {
    nextjs: true,
    node: true,
    react: true,
    test: ["jest", "vitest"],
    vue: true,
  },
  {
    rules: {
      eqeqeq: "error",
    },
  },
);
```

Extra config objects are applied last. You can also import the same stable fragments used by the
factory:

```ts
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
  typescript,
  vitest,
  vue,
} from "@amamo/oxlint-config";
```

### Type-aware linting

Install the optional type-aware engine and opt in explicitly:

```sh
pnpm add --save-dev oxlint-tsgolint
```

```ts
import amamo from "@amamo/oxlint-config";

export default amamo({ typeAware: true });
```

## Initializer

Run the initializer from the project root:

```sh
pnpm dlx @amamo/oxlint-config init
```

Available flags:

- `--dry-run` prints the plan without installing packages or writing files.
- `--no-install` writes the approved plan without running a package manager.
- `--yes` accepts detected features and safe defaults for non-interactive use.

The initializer detects the project and package manager, builds every edit in memory, reports
conflicts before writing, and writes managed files atomically. It preserves an existing Oxlint
config instead of overwriting it, merges JSONC conservatively, and can be run repeatedly without
changing already-managed bytes.

## VS Code

Install the official `oxc.oxc-vscode` extension. The initializer recommends it and writes Oxfmt
before Oxlint's safe fixes in the ordered save-actions object:

```json
{
  "editor.formatOnSave": false,
  "editor.codeActionsOnSave": {
    "source.format.oxc": "always",
    "source.fixAll.oxc": "always"
  }
}
```

## Oxfmt

This package uses Oxfmt's official defaults and does not export an empty formatter preset. Create
an Oxfmt config only when you need to customize formatting; see the
[official Oxfmt configuration documentation](https://oxc.rs/docs/guide/usage/formatter/config.html).

## Experimental JavaScript plugins

Oxlint's JavaScript plugin API is Alpha. These adapters are opt-in, and this package does not
promise semver stability for their behavior or compatibility.

| Option           | Package                         | Tested peer range |
| ---------------- | ------------------------------- | ----------------- |
| `cypress`        | `eslint-plugin-cypress`         | `^6.4.3`          |
| `mocha`          | `eslint-plugin-mocha`           | `^12.0.1`         |
| `playwright`     | `eslint-plugin-playwright`      | `^2.11.0`         |
| `regexp`         | `eslint-plugin-regexp`          | `^3.1.1`          |
| `sonarjs`        | `eslint-plugin-sonarjs`         | `^4.2.0`          |
| `storybook`      | `eslint-plugin-storybook`       | `^10.5.5`         |
| `testingLibrary` | `eslint-plugin-testing-library` | `^7.16.2`         |

Enable only the adapters you use:

```ts
import amamo from "@amamo/oxlint-config";

export default amamo({
  experimental: {
    playwright: true,
    testingLibrary: true,
  },
});
```

## Svelte and Astro

Oxlint can lint JavaScript and TypeScript in Svelte and Astro script blocks. Oxfmt supports
formatting Svelte files. This package makes no claim about Astro formatting or framework-specific
template rules.

## Verify locally

```sh
pnpm check
```

The aggregate check runs the following commands in order:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm pack:check
pnpm smoke:package
```

The `pretest` lifecycle builds the package before Vitest runs.
