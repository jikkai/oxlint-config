import type { ParseError } from "jsonc-parser";
import { parse } from "jsonc-parser";
import type { JsoncOperation } from "../jsonc.js";
import type { IEditorInitializationPlan } from "./editor.js";
import { createEditorInitializationPlan } from "./editor.js";

type JsonObject = Record<string, unknown>;

const formatAndFixLanguages = [
  "JavaScript",
  "JSX",
  "TypeScript",
  "TSX",
  "Vue.js",
  "Svelte",
] as const;

const formatOnlyLanguages = [
  "CSS",
  "GraphQL",
  "Handlebars",
  "HTML",
  "JSON",
  "JSON5",
  "JSONC",
  "Less",
  "Markdown",
  "MDX",
  "SCSS",
  "TOML",
  "YAML",
] as const;

const formatAction = { language_server: { name: "oxfmt" } };
const fixAction = { code_action: "source.fixAll.oxc" };
const settingsOperations: readonly JsoncOperation[] = [
  {
    kind: "setIfMissing",
    path: ["auto_install_extensions", "oxc"],
    value: true,
  },
  {
    kind: "setIfMissing",
    path: ["lsp", "oxlint", "initialization_options", "settings", "fixKind"],
    value: "safe_fix",
  },
  ...formatAndFixLanguages.flatMap((language) => [
    {
      kind: "setIfMissing" as const,
      path: ["languages", language, "format_on_save"],
      value: "on",
    },
    {
      kind: "setIfMissing" as const,
      path: ["languages", language, "formatter"],
      value: [formatAction, fixAction],
    },
  ]),
  ...formatOnlyLanguages.flatMap((language) => [
    {
      kind: "setIfMissing" as const,
      path: ["languages", language, "format_on_save"],
      value: "on",
    },
    {
      kind: "setIfMissing" as const,
      path: ["languages", language, "formatter"],
      value: [formatAction],
    },
  ]),
  {
    kind: "setIfMissing",
    path: ["languages", "Astro", "format_on_save"],
    value: "on",
  },
  {
    kind: "setIfMissing",
    path: ["languages", "Astro", "formatter"],
    value: [fixAction],
  },
];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function settingsConflict(source: string): string | undefined {
  const errors: ParseError[] = [];
  const parsed: unknown = parse(source, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isJsonObject(parsed)) return undefined;

  const lsp = parsed.lsp;
  const oxlint = isJsonObject(lsp) ? lsp.oxlint : undefined;
  const initializationOptions = isJsonObject(oxlint) ? oxlint.initialization_options : undefined;
  const settings = isJsonObject(initializationOptions) ? initializationOptions.settings : undefined;
  const fixKind = isJsonObject(settings) ? settings.fixKind : undefined;
  if (fixKind !== undefined && fixKind !== "safe_fix") {
    return "lsp.oxlint fixKind must be safe_fix";
  }

  const languages = parsed.languages;
  if (!isJsonObject(languages)) return undefined;
  for (const [language, value] of Object.entries(languages)) {
    if (!isJsonObject(value) || !Array.isArray(value.formatter)) continue;

    const formatIndex = value.formatter.findIndex((formatter) => {
      if (!isJsonObject(formatter) || !isJsonObject(formatter.language_server)) return false;
      return formatter.language_server.name === "oxfmt";
    });
    const fixIndex = value.formatter.findIndex(
      (formatter) => isJsonObject(formatter) && formatter.code_action === "source.fixAll.oxc",
    );
    if (formatIndex !== -1 && fixIndex !== -1 && formatIndex > fixIndex) {
      return `${language} must run Oxfmt before Oxlint fixes`;
    }
  }

  return undefined;
}

export function createZedInitializationPlan(rootDir: string): Promise<IEditorInitializationPlan> {
  return createEditorInitializationPlan(rootDir, [
    { conflict: settingsConflict, operations: settingsOperations, path: ".zed/settings.json" },
  ]);
}
