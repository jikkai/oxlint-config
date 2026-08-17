/// <reference types="node" />

import type { FormattingOptions, Node, ParseError } from "jsonc-parser";
import { applyEdits, findNodeAtLocation, getNodeValue, modify, parseTree } from "jsonc-parser";
import { isDeepStrictEqual } from "node:util";

export type JsoncOperation =
  | { kind: "appendUnique"; path: readonly string[]; value: unknown }
  | { before?: string; kind: "setIfMissing"; path: readonly string[]; value: unknown };

export interface IJsoncMergeResult {
  changed: boolean;
  conflicts: string[];
  content: string;
  errors: string[];
}

const parseOptions = { allowTrailingComma: true, disallowComments: false } as const;
const invalidJsonValue = Symbol("invalidJsonValue");

function canonicalizeJsonValue(
  value: unknown,
  ancestors: Set<object>,
): unknown | typeof invalidJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return invalidJsonValue;
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") return invalidJsonValue;

  try {
    if (ancestors.has(value)) return invalidJsonValue;
    if (!Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return invalidJsonValue;
    }

    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (Reflect.ownKeys(value).length !== value.length + 1) return invalidJsonValue;

        const result: unknown[] = [];
        for (let index = 0; index < value.length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor?.enumerable || !("value" in descriptor)) return invalidJsonValue;

          const item = canonicalizeJsonValue(descriptor.value, ancestors);
          if (item === invalidJsonValue) return invalidJsonValue;
          result.push(item);
        }
        return result;
      }

      const entries: Array<[string, unknown]> = [];
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string") return invalidJsonValue;

        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) return invalidJsonValue;

        const item = canonicalizeJsonValue(descriptor.value, ancestors);
        if (item === invalidJsonValue) return invalidJsonValue;
        entries.push([key, item]);
      }
      return Object.fromEntries(entries);
    } finally {
      ancestors.delete(value);
    }
  } catch {
    return invalidJsonValue;
  }
}

function getLineIndent(source: string, offset: number): string | undefined {
  const lineStart =
    Math.max(source.lastIndexOf("\n", offset - 1), source.lastIndexOf("\r", offset - 1)) + 1;
  const indentation = source.slice(lineStart, offset);
  return /^[ \t]*$/.test(indentation) ? indentation : undefined;
}

function getObjectIndent(source: string, node: Node): string | undefined {
  const indentation = getLineIndent(source, node.offset);
  if (indentation !== undefined) return indentation;
  return node.parent?.type === "property" ? getLineIndent(source, node.parent.offset) : undefined;
}

function findIndentation(source: string, root: Node): string | undefined {
  const nodes = [root];

  while (nodes.length > 0) {
    const node = nodes.pop();
    if (!node) break;
    if (node.type === "property" && node.parent?.type === "object") {
      const propertyIndent = getLineIndent(source, node.offset);
      const parentIndent = getObjectIndent(source, node.parent);
      if (
        propertyIndent !== undefined &&
        parentIndent !== undefined &&
        propertyIndent.startsWith(parentIndent)
      ) {
        const indentation = propertyIndent.slice(parentIndent.length);
        if (/^(?: +|\t+)$/.test(indentation)) return indentation;
      }
    }

    const children = node.children ?? [];
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index];
      if (child) nodes.push(child);
    }
  }
  return undefined;
}

function getFormattingOptions(source: string, root: Node | undefined): FormattingOptions {
  const eol = source.match(/\r\n|\n|\r/)?.[0] ?? "\n";
  const indentation = (root && findIndentation(source, root)) ?? "  ";

  return {
    eol,
    insertSpaces: !indentation.includes("\t"),
    tabSize: indentation.length,
  };
}

function findPathNode(root: Node | undefined, path: readonly string[]): Node | null | undefined {
  let node = root;

  for (const segment of path) {
    if (node?.type !== "object") return null;
    node = findNodeAtLocation(node, [segment]);
    if (node === undefined) return undefined;
  }

  return node;
}

function parseErrorMessages(errors: readonly ParseError[]): string[] {
  return errors.map(({ error, offset }) => `JSONC parse error ${error} at offset ${offset}`);
}

function toJsonPointer(path: readonly string[]): string {
  if (path.length === 0) return "";
  return `/${path.map((segment) => segment.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

export function applyJsoncOperations(
  source: string,
  operations: readonly JsoncOperation[],
): IJsoncMergeResult {
  const parseErrors: ParseError[] = [];
  let root: Node | undefined;
  try {
    root = parseTree(source, parseErrors, parseOptions);
  } catch (error) {
    // ponytail: preserve extreme no-op documents; use an iterative parser if they need edits.
    if (operations.length === 0 && error instanceof RangeError) {
      return { changed: false, conflicts: [], content: source, errors: [] };
    }
    return {
      changed: false,
      conflicts: [],
      content: source,
      errors: [`JSONC parse error: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  if (parseErrors.length > 0) {
    return {
      changed: false,
      conflicts: [],
      content: source,
      errors: parseErrorMessages(parseErrors),
    };
  }
  if (operations.length === 0) {
    return { changed: false, conflicts: [], content: source, errors: [] };
  }

  const canonicalValues: unknown[] = [];
  const valueErrors: string[] = [];
  for (const operation of operations) {
    const value = canonicalizeJsonValue(operation.value, new Set());
    canonicalValues.push(value);
    if (value === invalidJsonValue) {
      valueErrors.push(`Invalid JSON value at ${toJsonPointer(operation.path)}`);
    }
  }
  if (valueErrors.length > 0) {
    return { changed: false, conflicts: [], content: source, errors: valueErrors };
  }

  const conflicts: string[] = [];
  const formattingOptions = getFormattingOptions(source, root);
  let content = source;

  for (const [index, operation] of operations.entries()) {
    const node = findPathNode(root, operation.path);
    const operationValue = canonicalValues[index];
    let edits;

    if (operation.kind === "setIfMissing") {
      if (node === null) {
        conflicts.push(toJsonPointer(operation.path));
        continue;
      }
      if (node !== undefined) {
        const existing = canonicalizeJsonValue(getNodeValue(node), new Set());
        if (!isDeepStrictEqual(existing, operationValue)) {
          conflicts.push(toJsonPointer(operation.path));
        }
        continue;
      }

      const before = operation.before;
      edits = modify(
        content,
        [...operation.path],
        operationValue,
        before === undefined
          ? { formattingOptions }
          : {
              formattingOptions,
              getInsertionIndex: (properties) => {
                const index = properties.indexOf(before);
                return index === -1 ? properties.length : index;
              },
            },
      );
    } else {
      if (node?.type !== "array") {
        conflicts.push(toJsonPointer(operation.path));
        continue;
      }
      const existing = canonicalizeJsonValue(getNodeValue(node), new Set());
      if (
        Array.isArray(existing) &&
        existing.some((item) => isDeepStrictEqual(item, operationValue))
      ) {
        continue;
      }

      edits = modify(content, [...operation.path, -1], operationValue, { formattingOptions });
    }

    content = applyEdits(content, edits);
    const nextParseErrors: ParseError[] = [];
    root = parseTree(content, nextParseErrors, parseOptions);
    if (nextParseErrors.length > 0) {
      return {
        changed: false,
        conflicts,
        content: source,
        errors: parseErrorMessages(nextParseErrors),
      };
    }
  }

  return { changed: content !== source, conflicts, content, errors: [] };
}
