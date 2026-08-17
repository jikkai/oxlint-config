import type { ParseError } from "jsonc-parser";
import { parse } from "jsonc-parser";
import type { JsoncOperation } from "../jsonc.js";
import type { IEditorInitializationPlan } from "./editor.js";
import { createEditorInitializationPlan } from "./editor.js";

type JsonObject = Record<string, unknown>;

const settingsOperations = [
  { kind: "setIfMissing", path: ["editor.formatOnSave"], value: false },
  {
    before: "source.fixAll.oxc",
    kind: "setIfMissing",
    path: ["editor.codeActionsOnSave", "source.format.oxc"],
    value: "always",
  },
  {
    kind: "setIfMissing",
    path: ["editor.codeActionsOnSave", "source.fixAll.oxc"],
    value: "always",
  },
] as const satisfies readonly JsoncOperation[];

const extensionOperations = [
  { kind: "setIfMissing", path: ["recommendations"], value: [] },
  { kind: "appendUnique", path: ["recommendations"], value: "oxc.oxc-vscode" },
] as const satisfies readonly JsoncOperation[];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function saveActionOrderConflict(source: string): string | undefined {
  const errors: ParseError[] = [];
  const parsed: unknown = parse(source, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0 || !isJsonObject(parsed)) return undefined;
  const actions = parsed["editor.codeActionsOnSave"];
  if (!isJsonObject(actions)) return undefined;

  const keys = Object.keys(actions);
  const formatIndex = keys.indexOf("source.format.oxc");
  const fixIndex = keys.indexOf("source.fixAll.oxc");
  return formatIndex !== -1 && fixIndex !== -1 && formatIndex > fixIndex
    ? "source.format.oxc must precede source.fixAll.oxc"
    : undefined;
}

export function createVSCodeInitializationPlan(
  rootDir: string,
): Promise<IEditorInitializationPlan> {
  return createEditorInitializationPlan(rootDir, [
    {
      conflict: saveActionOrderConflict,
      operations: settingsOperations,
      path: ".vscode/settings.json",
    },
    { operations: extensionOperations, path: ".vscode/extensions.json" },
  ]);
}
