/// <reference types="node" />

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { JsoncOperation } from "../jsonc.js";
import { applyJsoncOperations } from "../jsonc.js";

interface IEditorFileChange {
  content: string;
  existed: boolean;
  originalHash?: string;
  path: string;
}

export interface IEditorInitializationPlan {
  conflicts: string[];
  files: IEditorFileChange[];
  notices: string[];
}

interface IEditorJsoncTarget {
  conflict?: (source: string) => string | undefined;
  operations: readonly JsoncOperation[];
  path: string;
}

interface IReadFileState {
  content: string;
  existed: boolean;
  originalHash?: string;
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readOptionalFile(path: string): Promise<IReadFileState> {
  try {
    const content = await readFile(path, "utf8");
    return { content, existed: true, originalHash: hash(content) };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return { content: "{}\n", existed: false };
    }
    throw error;
  }
}

export async function createEditorInitializationPlan(
  rootDir: string,
  targets: readonly IEditorJsoncTarget[],
): Promise<IEditorInitializationPlan> {
  const conflicts: string[] = [];
  const files: IEditorFileChange[] = [];
  const notices: string[] = [];

  const targetPlans = await Promise.all(
    targets.map(async (target) => {
      const original = await readOptionalFile(join(rootDir, target.path));
      const conflict = original.existed ? target.conflict?.(original.content) : undefined;
      if (conflict) {
        return {
          conflicts: [`${target.path}: ${conflict}; existing bytes preserved`],
          files: [],
          notices: [],
        };
      }

      const result = applyJsoncOperations(original.content, target.operations);
      return {
        conflicts: result.conflicts.map((item) => `${target.path}:${item}`),
        files: result.changed
          ? [
              {
                content: result.content,
                existed: original.existed,
                ...(original.originalHash === undefined
                  ? {}
                  : { originalHash: original.originalHash }),
                path: join(rootDir, target.path),
              },
            ]
          : [],
        notices: result.errors.map((error) => `${target.path}: ${error}`),
      };
    }),
  );
  for (const targetPlan of targetPlans) {
    conflicts.push(...targetPlan.conflicts);
    files.push(...targetPlan.files);
    notices.push(...targetPlan.notices);
  }

  return { conflicts, files, notices };
}
