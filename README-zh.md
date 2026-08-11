# @amamo/oxlint-config

[English](./README.md) | 简体中文 | [规则查询器](https://jikkai.github.io/oxlint-config/)

## 项目简介

`@amamo/oxlint-config` 是一套有明确取舍、可组合的 Oxlint 预设，并附带一个注重写入安全的
Oxc 初始化器。默认导出用于构造 `OxlintConfig`；需要自行组合时，也可以导入工厂内部使用的
稳定配置片段。

```ts
import amamo from "@amamo/oxlint-config";

export default amamo();
```

这个包负责配置代码检查。Oxfmt 仍然是独立的格式化工具；可选初始化器可以安装两种工具并准备
项目，同时不会替换已有的 lint 配置。

## 功能与设计取舍

- 常规场景只需一个工厂函数，同时保留具名稳定片段供手动组合。
- 默认启用 Oxlint 原生的 Base、TypeScript、Import 和 Promise 能力。
- React、Next.js、Vue、Tailwind CSS、Node、Jest、Vitest、JSDoc 与 React Perf 均显式启用。
- 可通过 `oxlint-tsgolint` 选择类型感知检查。
- 可选择七个兼容 ESLint 的 JavaScript 插件适配器。
- 初始化器会检测依赖与配置特征、预览变更、保留冲突，并只在校验后写入。
- 双语[规则查询器](https://jikkai.github.io/oxlint-config/)可查看实际生成的预设、作用域、
  严重级别、选项、schema 和官方规则链接。

> [!WARNING]
> 这是一套个人化且有明确偏好的配置。升级时请审阅变更；如果其中的取舍不适合你的项目，
> 请覆盖相应规则或 fork 本配置。原生预设规则除了已发布的包版本之外没有单独的稳定性承诺，
> JavaScript 插件适配器则明确处于 Alpha 阶段。

## 要求与兼容性

| 要求                 | 支持范围          | 说明                                                   |
| -------------------- | ----------------- | ------------------------------------------------------ |
| Node.js              | `>=22.18`         | 由本包的 `engines` 字段约束。                          |
| `oxlint`             | `>=1.56.0 <2.0.0` | 必需 peer dependency，也是原生插件的来源。             |
| `oxfmt`              | `>=0.1.0 <1.0.0`  | 必需 peer dependency，供初始化器生成的格式化流程使用。 |
| `oxlint-tailwindcss` | `^1.7.1`          | 可选；仅在配置 `tailwindcss` 时需要。                  |
| `oxlint-tsgolint`    | `^7.0.2001`       | 可选；只在启用 `typeAware` 时需要。                    |

当初始化器能够安全识别唯一包管理器时，它支持 pnpm、npm、Yarn 和 Bun 项目。本仓库开发使用
pnpm `11.18.0`。

关于上游行为和语法支持范围，请查阅官方
[Oxlint 文档](https://oxc.rs/docs/guide/usage/linter.html)和
[Oxfmt 文档](https://oxc.rs/docs/guide/usage/formatter.html)。

## 快速初始化

在项目根目录运行初始化器：

```sh
pnpm dlx @amamo/oxlint-config init
```

交互流程会依次展示检测到的 manifest、稳定生态、实验包、包管理器、计划写入的文件、安装命令、
提示和冲突，最后才询问是否确认。评估已有项目时建议先 dry run：

```sh
pnpm dlx @amamo/oxlint-config init --dry-run --yes
```

非交互环境必须传入 `--yes`。初始化器只在设置阶段进行检测；`amamo()` 本身不会在运行时自动
检测框架。

## 手动安装

安装本包以及必需的 Oxlint、Oxfmt peer：

```sh
# pnpm
pnpm add --save-dev @amamo/oxlint-config oxlint oxfmt

# npm
npm install --save-dev @amamo/oxlint-config oxlint oxfmt

# Yarn
yarn add --dev @amamo/oxlint-config oxlint oxfmt

# Bun
bun add --dev @amamo/oxlint-config oxlint oxfmt
```

在项目根目录创建 `oxlint.config.ts`：

```ts
import amamo from "@amamo/oxlint-config";

export default amamo();
```

框架和测试预设需要显式选择：

```ts
import amamo from "@amamo/oxlint-config";

export default amamo({
  nextjs: true,
  node: true,
  reactPerf: true,
  test: ["jest", "vitest"],
});
```

## 推荐的 package scripts

初始化器只添加缺失的 script key，并保留已有值：

```json
{
  "scripts": {
    "lint": "oxlint .",
    "lint:fix": "oxlint --fix .",
    "format": "oxfmt .",
    "format:check": "oxfmt --check ."
  }
}
```

CI 中可用 `lint` 输出诊断，用 `format:check` 在不改文件的前提下校验格式。`lint:fix` 会应用
Oxlint 支持的修复，`format` 则独立运行 Oxfmt。

## 默认行为

`amamo()` 始终以 Base 开始，并在没有显式关闭时启用 TypeScript、Imports 和 Promise。其他集成
均为选择启用；React 与 Next.js 的依赖关系如下。

| 预设或模式                   | 默认值             | 选择行为                                                 |
| ---------------------------- | ------------------ | -------------------------------------------------------- |
| Base                         | 始终启用           | 启用 `eslint`、`oxc`、`unicorn` 原生插件及分类严重级别。 |
| TypeScript                   | 启用               | 使用 `typescript: false` 关闭。                          |
| Imports                      | 启用               | 使用 `imports: false` 关闭。                             |
| Promise                      | 启用               | 使用 `promise: false` 关闭。                             |
| React                        | 关闭               | 使用 `react: true` 启用；默认同时启用 JSX A11y。         |
| Next.js                      | 关闭               | 使用 `nextjs: true` 启用；同时选择 React 与 JSX A11y。   |
| JSX A11y                     | 跟随 React/Next.js | 显式设置 `jsxA11y` 可覆盖推导值。                        |
| Vue、Node、JSDoc、React Perf | 关闭               | 分别通过同名布尔选项启用。                               |
| Tailwind CSS                 | 关闭               | 通过 `tailwindcss` 传入 Tailwind CSS v4 入口文件。       |
| Jest、Vitest                 | 关闭               | 通过 `test` 选择一个或两个；重复值会被忽略。             |
| 类型感知模式                 | 关闭               | 安装 `oxlint-tsgolint` 后设置 `typeAware: true`。        |
| 实验适配器                   | 关闭               | 每个适配器都需要安装并显式选择。                         |

预设顺序是确定的：Base、默认原生片段、React 相关片段、Vue、Tailwind CSS、Node、JSDoc、测试、
实验适配器、`options.rules`，最后是任意额外 override。

## 选项参考

默认导出接收 `IAmamoOptions`，随后可传入任意数量的 `OxlintConfig` override：

```ts
function amamo(options?: IAmamoOptions, ...overrides: OxlintConfig[]): OxlintConfig;
```

| 选项           | 类型                                                             | 默认值             | 作用                                         |
| -------------- | ---------------------------------------------------------------- | ------------------ | -------------------------------------------- |
| `experimental` | `IExperimentalOptions`                                           | `{}`               | 选择已经安装的 Alpha JavaScript 插件适配器。 |
| `ignores`      | `string[]`                                                       | `undefined`        | 设置根级 `ignorePatterns`。                  |
| `imports`      | `boolean`                                                        | `true`             | 选择原生 Import 插件片段。                   |
| `jsdoc`        | `boolean`                                                        | `false`            | 为脚本文件选择 JSDoc 片段。                  |
| `jsxA11y`      | `boolean`                                                        | React/Next.js 状态 | 选择或抑制 JSX 无障碍规则。                  |
| `nextjs`       | `boolean`                                                        | `false`            | 选择 Next.js，并隐式选择 React。             |
| `node`         | `boolean`                                                        | `false`            | 为脚本文件选择 Node 规则与 Node 环境。       |
| `promise`      | `boolean`                                                        | `true`             | 为脚本文件选择 Promise 规则。                |
| `react`        | `boolean`                                                        | `false`            | 选择 React 规则，并隐式选择 JSX A11y。       |
| `reactPerf`    | `boolean`                                                        | `false`            | 选择明确的 React 分配性能警告。              |
| `rules`        | `OxlintConfig["rules"]`                                          | `undefined`        | 在所选预设之后加入根级规则配置。             |
| `tailwindcss`  | `ITailwindcssOptions`                                            | `undefined`        | 以显式 v4 入口启用 `oxlint-tailwindcss`。    |
| `test`         | `"jest" \| "vitest" \| readonly ("jest" \| "vitest")[] \| false` | `false`            | 选择一个或两个测试运行器片段。               |
| `typeAware`    | `boolean`                                                        | `false`            | 设置根级 `options.typeAware`。               |
| `typescript`   | `boolean`                                                        | `true`             | 选择 TypeScript 片段。                       |
| `vue`          | `boolean`                                                        | `false`            | 选择 Vue script block 规则。                 |

`IExperimentalOptions` 有七个可选布尔 key，默认全部关闭：`cypress`、`mocha`、`playwright`、
`regexp`、`sonarjs`、`storybook` 和 `testingLibrary`。

## 规则、覆盖与忽略

普通的根级改动可放在 `rules` 中：

```ts
import amamo from "@amamo/oxlint-config";

export default amamo({
  rules: {
    eqeqeq: "error",
    "typescript/consistent-type-imports": "off",
  },
});
```

其后的每个参数都是最后应用的任意 `OxlintConfig`。可用它设置 settings、environment、global、
插件配置，或组合第三方 config 对象：

```ts
import amamo from "@amamo/oxlint-config";

export default amamo(
  { rules: { "no-console": "warn" } },
  {
    rules: { "no-console": "off" },
    settings: { react: { linkComponents: [{ name: "Link", linkAttribute: "to" }] } },
  },
);
```

需要针对文件调整时，传入带有明确 `files` 作用域的 Oxlint override：

```ts
import amamo from "@amamo/oxlint-config";

export default amamo(
  {},
  {
    overrides: [
      {
        files: ["scripts/**/*.ts"],
        rules: { "no-console": "off" },
      },
    ],
  },
);
```

项目级忽略项放在第一个参数中：

```ts
export default amamo({ ignores: ["dist/**", "coverage/**", "generated/**"] });
```

完整的 `OxlintConfig` 能力请参考官方
[Oxlint 配置指南](https://oxc.rs/docs/guide/usage/linter/config.html)。

## 具名稳定导出

具名导出就是 `amamo()` 内部使用的配置片段。需要手动组合时可直接导入；大多数项目使用默认工厂
会更简单。

| 导出         | 作用域与显式行为                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `base`       | 原生 `eslint`、`oxc`、`unicorn`；`correctness` 为 error，`perf` 与 `suspicious` 为 warning，其余分类关闭。     |
| `typescript` | TypeScript 文件；要求单独声明 type-only import，并拒绝重复 import，但允许从同一模块另写一条 type-only import。 |
| `imports`    | 启用原生 `import` 插件。                                                                                       |
| `promise`    | 脚本文件；`catch-or-return` 和 `no-return-wrap` 为 error。                                                     |
| `react`      | JSX/TSX；Hooks 规则，其中依赖完整性为 warning。                                                                |
| `reactPerf`  | JSX/TSX；对作为 prop 传入的新 JSX、array、function 和 object 发出 warning。                                    |
| `nextjs`     | JSX/TSX；async client component 与 duplicate head 为 error，HTML link 为 warning。                             |
| `jsxA11y`    | JSX/TSX；检查 alt text、ARIA props/roles 与 anchor 有效性。                                                    |
| `vue`        | `*.vue`；Vue 环境，以及 duplicate key、computed side effect、`defineProps` 校验规则。                          |
| `node`       | 脚本文件；Node 环境、exports assignment error 与 path concatenation warning。                                  |
| `jsdoc`      | 脚本文件；对无效 JSDoc tag name 发出 warning。                                                                 |
| `jest`       | 测试文件；Jest 环境、focused-test error、disabled-test 与 missing-expect warning。                             |
| `vitest`     | 测试文件；Vitest 环境、focused-test error、disabled-test 与 missing-expect warning。                           |

```ts
import { base, node, typescript } from "@amamo/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({ extends: [base, typescript, node] });
```

## 生态预设

### React

`react: true` 会对 `**/*.{jsx,tsx}` 应用 Hooks 规则，并在没有显式设置 `jsxA11y: false` 时
启用 JSX A11y。

### Next.js

`nextjs: true` 先选择 React，再选择 Next.js，同时推导启用 JSX A11y。它不会检查运行时环境；
最终以选项或初始化器生成的配置为准。

### Vue

`vue: true` 为 `*.vue` 的脚本内容选择 Oxlint 原生 Vue 插件并启用 Vue 环境。它不会添加针对
模板的 JavaScript 插件规则。

### Tailwind CSS

安装可选插件，并传入导入 Tailwind CSS v4 的 CSS 文件：

```sh
pnpm add --save-dev oxlint-tailwindcss
```

```ts
import amamo from "@amamo/oxlint-config";

export default amamo({
  tailwindcss: { entryPoint: "src/index.css" },
});
```

在 monorepo 中，`entryPoint` 也接受有序的 `{ files, use }` 映射。该预设启用一组核心规则；
严重级别可通过 `rules` 调整。不支持 Tailwind CSS v3，详情参见
[oxlint-tailwindcss 配置指南](https://oxlint-tailwindcss.pages.dev/setup)。它通过 Oxlint 的
JavaScript 插件 API 运行，因此该上游 API 仍处于 Alpha 阶段。

### Node

`node: true` 会把 Node 环境和 Node 规则应用到 JavaScript 与 TypeScript 脚本文件 pattern，
其中包括 ESM 与 CommonJS 扩展名。

### Jest

使用 `test: "jest"`，可在 `*.test.*`、`*.spec.*` 与 `__tests__` 脚本文件中启用 Jest
global 和规则。

### Vitest

使用 `test: "vitest"`，可启用对应的 Vitest 环境以及 focused/disabled/expect 检查。通过
`test: ["jest", "vitest"]` 可以同时选择两个运行器。

### JSDoc

`jsdoc: true` 会启用原生 JSDoc 插件，并在脚本文件上开启 tag name 校验 warning。

### React Perf

`reactPerf: true` 会对 JSX/TSX prop 启用四条与分配相关的 warning。它与 `react` 相互独立；
项目如果还需要 React Hooks 规则，应同时启用 React 预设。

```ts
export default amamo({
  jsdoc: true,
  nextjs: true,
  node: true,
  reactPerf: true,
  test: ["jest", "vitest"],
  vue: true,
});
```

## 类型感知检查

在已测试 peer 范围内安装可选引擎：

```sh
pnpm add --save-dev oxlint-tsgolint
```

然后启用根级 Oxlint 选项：

```ts
import amamo from "@amamo/oxlint-config";

export default amamo({ typeAware: true });
```

该选项设置 `options.typeAware: true`，不会额外加入一个导出的预设片段。请保持 TypeScript
启用，并通过 `rules` 或额外 override 配置需要增加的类型感知规则。类型感知检查需要
`oxlint-tsgolint`；上游 TypeScript 兼容性、支持的规则、诊断与性能说明请查看官方
[类型感知检查指南](https://oxc.rs/docs/guide/usage/linter/type-aware.html)。

## 实验性 JavaScript 插件

Oxlint 兼容 ESLint 的 JavaScript 插件 API 处于 Alpha 阶段。这些适配器都需要选择启用，
其 peer dependency 均为可选，而且本包不承诺相关行为或兼容性遵循 SemVer。只安装你实际
启用的包。

| 选项             | 包                              | 已测试 peer 范围 | 限定作用域的规则                                                              |
| ---------------- | ------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `cypress`        | `eslint-plugin-cypress`         | `^6.4.3`         | Cypress 文件中的 `cypress/no-assigning-return-values`，级别为 error。         |
| `mocha`          | `eslint-plugin-mocha`           | `^12.0.1`        | 测试文件中的 `mocha/no-exclusive-tests`，级别为 warning。                     |
| `playwright`     | `eslint-plugin-playwright`      | `^2.11.0`        | 测试文件中的 `playwright/no-focused-test`，级别为 error。                     |
| `regexp`         | `eslint-plugin-regexp`          | `^3.1.1`         | 脚本文件中的 `regexp/no-dupe-characters-character-class`，级别为 error。      |
| `sonarjs`        | `eslint-plugin-sonarjs`         | `^4.2.0`         | 脚本文件中的 `sonarjs/no-all-duplicated-branches`，级别为 error。             |
| `storybook`      | `eslint-plugin-storybook`       | `^10.5.5`        | stories 与 `.storybook` 文件中的 `storybook/default-exports`，级别为 error。  |
| `testingLibrary` | `eslint-plugin-testing-library` | `^7.16.2`        | 测试文件中的 `testing-library/no-global-regexp-flag-in-query`，级别为 error。 |

例如：

```sh
pnpm add --save-dev eslint-plugin-playwright eslint-plugin-testing-library
```

```ts
import amamo from "@amamo/oxlint-config";

export default amamo({
  experimental: {
    playwright: true,
    testingLibrary: true,
  },
});
```

初始化器会检测已经安装的实验包，但默认保持所有适配器关闭，`--yes` 同样如此；交互用户必须
主动选择。当前上游 API 支持范围与限制请查看官方
[Oxlint JavaScript 插件指南](https://oxc.rs/docs/guide/usage/linter/js-plugins)。

## 初始化器检测与写入安全

### 检测方式

初始化器读取根 manifest，以及普通 package.json 或 pnpm workspace 中的 manifest。它根据
依赖和少量配置特征推导项目选项：

- TypeScript：存在 `typescript` 依赖、根级 `tsconfig.json` 或根级 `tsconfig.*.json`。
- React、Next.js、Vue、Jest、Vitest：存在对应 package dependency。
- Tailwind CSS：项目中只有一个导入 `"tailwindcss"` 的 CSS 文件。多个或缺失的 v4 入口会被
  报告，并留给用户手动配置。
- Node：根 `engines.node` 字段，或已知服务端包（`express`、`fastify`、`hono`、`koa`、
  `@nestjs/core`）。仅有 `@types/node` 不会启用 Node 规则。
- Storybook：存在 `storybook`、`eslint-plugin-storybook` 或 `@storybook/` 下的包；其他
  实验适配器根据各自准确的插件包判断。
- 包管理器：调用时的 user agent，或者唯一且无歧义的 lockfile。

这些检测只发生在初始化阶段。检测到多个包管理器 lockfile、缺少根 `package.json`，或者需要
安装但无法安全识别包管理器时，命令会停止。

### 命令参数

| 参数           | 行为                                             |
| -------------- | ------------------------------------------------ |
| `--dry-run`    | 输出检测结果和完整计划；不开始安装，也不写文件。 |
| `--no-install` | 不启动包管理器，只写入已确认且安全的计划。       |
| `--yes`        | 在非交互环境接受检测到的稳定选项和安全默认值。   |

命令只接受 `init`、`--dry-run`、`--no-install` 和 `--yes`。未知参数、重复参数或带值的布尔
参数都会被拒绝并显示 usage。

### 生成与更新的文件

| 目标                      | 行为                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `oxlint.config.ts`        | 仅当 `.oxlintrc.json`、`.oxlintrc.jsonc`、`oxlint.config.ts`、`oxlint.config.mts` 全部不存在时创建。 |
| `package.json`            | 只添加缺失的 `lint`、`lint:fix`、`format`、`format:check` script。                                   |
| `.vscode/settings.json`   | 只在能够安全合并时，依次添加 Oxfmt 与 Oxlint save action。                                           |
| `.vscode/extensions.json` | 添加 `oxc.oxc-vscode` 推荐项，不移除已有内容。                                                       |
| 开发依赖                  | 安装本包、Oxlint、Oxfmt，以及仅被选择的可选引擎或适配器。                                            |

如果已有 lint config，初始化器会保留它，并输出一段组合示例。JSONC 修改会尽可能保留注释和
已有值；不兼容值会作为冲突报告，而不是被覆盖。

### 冲突与写入安全

初始化计划会在执行前完整构建。安装失败时，不会写入计划内的文件。写入前，初始化器会验证每个
目标唯一、位于项目物理根目录内且不是符号链接。它会记录已有内容、再次校验 hash 和原本缺失的
目标，通过排他方式创建临时文件，保留已有 mode，并只在最终检查通过后 rename。并发或不安全
变更会终止操作，其余路径保持未写入。

安装结束后，初始化器会重新读取包管理器对 `package.json` 的修改，因此新增依赖得以保留；
新出现冲突的 script 仍由用户拥有并会被报告。对已经受管的结果再次运行时，不会计划重复修改。

## VS Code 保存格式化与安全修复

安装官方 [Oxc VS Code 扩展](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode)。
初始化器会推荐该扩展，并在有序 save-action 对象中先写入 Oxfmt，再写入 Oxlint 安全修复：

```json
{
  "editor.formatOnSave": false,
  "editor.codeActionsOnSave": {
    "source.format.oxc": "always",
    "source.fixAll.oxc": "always"
  }
}
```

这样保存时会先通过 Oxfmt 格式化，再应用 Oxlint fix。如果两个 key 已经以相反顺序存在，初始化器
会报告冲突，并保持文件逐字节不变。编辑器的类型感知行为跟随根 Oxlint 配置；详情参见官方
[编辑器设置指南](https://oxc.rs/docs/guide/usage/linter/editors.html)。

## Oxfmt 与 Prettier 的边界

本包导出 lint 配置，而不是 formatter preset。初始化器会安装 Oxfmt、添加 `format` script，
其他格式化行为均使用 Oxfmt 自身默认值。只有项目需要 formatter 专属定制时才创建 Oxfmt 配置；
详见官方 [Oxfmt 配置参考](https://oxc.rs/docs/guide/usage/formatter/config.html)。

Oxfmt 与 Prettier 是相互独立的 formatter。除非明确划分职责，否则不要让两者在保存或 CI 时处理
同一批文件。本包不会禁用 Prettier、迁移其配置、模拟 Prettier plugin，也不会向 Oxlint 添加
格式化规则。迁移已有项目时请使用官方
[Prettier 迁移指南](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier.html)。

## Svelte 与 Astro script block 限制

Oxlint 可以检查 Svelte 与 Astro script block 内的 JavaScript 和 TypeScript。本包不会选择
Svelte 或 Astro 专用预设，不会增加 template 规则，也不承诺检查 markup 与 style。Oxfmt 支持
格式化 Svelte；本包不对 Astro 格式化能力作出声明。

为框架文件采用本配置前，请通过官方
[Oxlint 指南](https://oxc.rs/docs/guide/usage/linter.html)确认当前上游支持情况。

## 规则查询器

静态[规则查询器](https://jikkai.github.io/oxlint-config/)从构建后的包、已安装 Oxlint 的 schema
与规则清单、受控 `--print-config` profile，以及本包的实验 fixture 生成。它不会执行上传的配置
或用户配置。

查询器提供：

- Default 与 All Stable 配置控制，包括依赖关系和 Alpha 标记。
- Enabled 与 All 规则视图；All 会在活跃规则应用之外加入未启用的原生规则清单。
- 搜索，以及 plugin、preset、severity、state、scope 过滤器。
- Rules、Presets、Scopes 和生成的 Config 四个视图。
- 规则严重级别、来源 preset/plugin、作用域、选项、原生 schema、外部插件描述与官方文档链接。
- 中英文界面、可分享 URL 状态、浏览器历史恢复，以及桌面/移动端布局。

构建快照具有确定性，包含 package 与 Oxlint 版本，但不包含生成时间戳。

## 兼容性与稳定性策略

- 包兼容性范围以 `package.json` 发布的 Node engine 和 peer range 为准。
- 原生预设行为跟随准确的包版本。每次升级都应审阅规则变更；这里不声明额外的稳定规则 SemVer
  策略。
- JavaScript 插件适配器与 Oxlint JS plugin API 均为 Alpha。适配器兼容性只针对上表中的
  peer range 测试。
- Tailwind CSS lint 只支持 v4，并依赖 `oxlint-tailwindcss` 与 Oxlint 的 Alpha JS plugin API。
- 类型感知模式依赖 `oxlint-tsgolint` 及其上游 TypeScript 兼容性。
- 初始化器会保留冲突，不会进行破坏性猜测；在已有仓库批准写入前仍应检查每项计划。

## 常见问题

### `amamo()` 会自动检测项目框架吗？

不会。框架与测试运行器都是显式工厂选项。只有一次性的初始化器会检查依赖和配置文件，用于提出
默认选择。

### 可以覆盖任意规则或加入其他 Oxlint 配置吗？

可以。根级规则使用 `options.rules`；任意配置或文件作用域组合使用额外的 `OxlintConfig` 参数。
额外 override 最后应用。

### Jest 和 Vitest 可以同时启用吗？

可以，使用 `test: ["jest", "vitest"]`。重复值会被去重；同时启用时固定先应用 Jest，再应用
Vitest。

### 为什么选择 React 或 Next.js 后 JSX A11y 也启用了？

React 会推导出 `jsxA11y: true`，Next.js 又会推导 React。显式设置 `jsxA11y: false` 即可关闭
这项依赖。

### 这个包会格式化代码吗？

不会。它负责配置 Oxlint。推荐流程和 VS Code save action 会单独安装并调用 Oxfmt。

### 初始化器会覆盖已有配置或 script 吗？

不会。它保留已识别的 lint config、输出组合示例、只添加缺失的 script key，并报告冲突值。
目标不安全或发生并发修改时会中止写入。

### 为什么实验规则不可用？

请在已测试范围内安装对应的可选 peer，并启用相应 `experimental` key。这些适配器不会默认启用。

## 本地开发与验证

安装依赖并构建根包：

```sh
pnpm install
pnpm build
```

运行仓库完整的包验证入口：

```sh
pnpm check
```

`pnpm check` 会先运行 `check:static`，再运行源码测试。`check:static` 依次用 Oxfmt 检查格式、
用 Oxlint 检查代码、用 TypeScript 检查类型；`pnpm test` 则运行 `src` 下的 Vitest 测试。

文档命令与包验证分开：

```sh
pnpm docs:build
pnpm docs:dev
```

`docs:build` 会构建包和静态站点。

`.github/workflows/docs.yml` 会部署同一仓库中成功 `Release` workflow 的准确 commit。显式手动
触发会部署 `github.sha`，也就是操作人所选 ref 解析到的 commit。仓库管理员需要在
**Settings → Pages** 中将 **Source** 一次性设为 **GitHub Actions**；workflow 不会修改该设置。

## 许可证

[MIT](./LICENSE) © 白熱
