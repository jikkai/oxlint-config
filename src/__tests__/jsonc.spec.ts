import { describe, expect, it } from "vitest";
import { applyJsoncOperations } from "../jsonc.js";

describe("applyJsoncOperations", () => {
  it("preserves comments and unknown keys while inserting ordered save actions", () => {
    const source =
      '{\r\n\t// Keep this comment.\r\n\t"editor.codeActionsOnSave": {\r\n\t\t"source.fixAll.oxc": "always"\r\n\t},\r\n\t"unknown": true\r\n}\r\n';
    const expected =
      '{\r\n\t// Keep this comment.\r\n\t"editor.codeActionsOnSave": {\r\n\t\t"source.format.oxc": "always",\r\n\t\t"source.fixAll.oxc": "always"\r\n\t},\r\n\t"unknown": true\r\n}\r\n';

    expect(
      applyJsoncOperations(source, [
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
      ]),
    ).toEqual({ changed: true, conflicts: [], content: expected, errors: [] });
  });

  it("appends one extension without duplicating an existing entry", () => {
    const source = `{
  "recommendations": [
    "existing.extension",
  ],
}
`;
    const expected = `{
  "recommendations": [
    "existing.extension",
    "new.extension",
  ],
}
`;

    expect(
      applyJsoncOperations(source, [
        {
          kind: "appendUnique",
          path: ["recommendations"],
          value: "existing.extension",
        },
        {
          kind: "appendUnique",
          path: ["recommendations"],
          value: "new.extension",
        },
      ]),
    ).toEqual({ changed: true, conflicts: [], content: expected, errors: [] });
  });

  it("keeps conflicting existing values and reports their JSON pointers", () => {
    const source = `{
  "scripts": {
    "lint": "custom"
  },
  "recommendations": "custom"
}
`;

    expect(
      applyJsoncOperations(source, [
        {
          kind: "setIfMissing",
          path: ["scripts", "lint"],
          value: "oxlint .",
        },
        {
          kind: "appendUnique",
          path: ["recommendations"],
          value: "new.extension",
        },
      ]),
    ).toEqual({
      changed: false,
      conflicts: ["/scripts/lint", "/recommendations"],
      content: source,
      errors: [],
    });
  });

  it.each([
    ["scalar", '{"a":1}\n'],
    ["array", '{"a":[]}\n'],
  ])("reports a blocked %s parent as a conflict", (_label, source) => {
    expect(
      applyJsoncOperations(source, [{ kind: "setIfMissing", path: ["a", "b"], value: 2 }]),
    ).toEqual({ changed: false, conflicts: ["/a/b"], content: source, errors: [] });
  });

  it("creates the remaining object path after an earlier missing segment", () => {
    const result = applyJsoncOperations('{"a":1}\n', [
      { kind: "setIfMissing", path: ["missing", "child"], value: 2 },
    ]);

    expect(result.changed).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.content).toContain('"child": 2');
    expect(result.errors).toEqual([]);
  });

  it("reads __proto__ as an own JSON key", () => {
    const source = '{"__proto__":1}\n';

    expect(
      applyJsoncOperations(source, [{ kind: "setIfMissing", path: ["__proto__"], value: 1 }]),
    ).toEqual({ changed: false, conflicts: [], content: source, errors: [] });
    expect(
      applyJsoncOperations(source, [{ kind: "setIfMissing", path: ["__proto__"], value: 2 }]),
    ).toEqual({
      changed: false,
      conflicts: ["/__proto__"],
      content: source,
      errors: [],
    });
  });

  it("ignores fake properties in comments when deriving indentation", () => {
    const source = `{
  /*
      "fake": true
  */
  "existing": true
}
`;
    const expected = `{
  /*
      "fake": true
  */
  "existing": true,
  "added": true
}
`;

    expect(
      applyJsoncOperations(source, [{ kind: "setIfMissing", path: ["added"], value: true }]),
    ).toEqual({ changed: true, conflicts: [], content: expected, errors: [] });
  });

  it("derives relative indentation when appending to a root array", () => {
    const source = `[
  {
    "existing": true
  }
]
`;
    const expected = `[
  {
    "existing": true
  },
  {
    "added": true
  }
]
`;

    expect(
      applyJsoncOperations(source, [{ kind: "appendUnique", path: [], value: { added: true } }]),
    ).toEqual({ changed: true, conflicts: [], content: expected, errors: [] });
  });

  it("skips nested properties whose parent indentation is unknown", () => {
    const source = `{"nested": {
    "child": true
  },
  "root": true
}
`;
    const expected = `{"nested": {
    "child": true
  },
  "root": true,
  "added": true
}
`;

    expect(
      applyJsoncOperations(source, [{ kind: "setIfMissing", path: ["added"], value: true }]),
    ).toEqual({ changed: true, conflicts: [], content: expected, errors: [] });
  });

  it("handles deeply nested syntax without overflowing the call stack", () => {
    const source = `${"[".repeat(5_000)}0${"]".repeat(5_000)}`;

    expect(applyJsoncOperations(source, [])).toEqual({
      changed: false,
      conflicts: [],
      content: source,
      errors: [],
    });
  });

  it("returns the original bytes when JSONC is invalid", () => {
    const source = '{\r\n  "broken": true,\r\n';
    const emptyResult = applyJsoncOperations(source, []);
    const result = applyJsoncOperations(source, [
      { kind: "setIfMissing", path: ["safe"], value: true },
    ]);

    expect(emptyResult.changed).toBe(false);
    expect(emptyResult.content).toBe(source);
    expect(emptyResult.errors).not.toHaveLength(0);
    expect(result.changed).toBe(false);
    expect(result.conflicts).toEqual([]);
    expect(result.content).toBe(source);
    expect(result.errors).not.toHaveLength(0);
  });

  it("is byte-idempotent on a second application", () => {
    const operations = [
      { kind: "setIfMissing", path: ["enabled"], value: true },
      { kind: "appendUnique", path: ["items"], value: "one" },
    ] as const;
    const first = applyJsoncOperations('{\n  "items": []\n}\n', operations);
    const second = applyJsoncOperations(first.content, operations);

    expect(first.changed).toBe(true);
    expect(first.errors).toEqual([]);
    expect(second).toEqual({
      changed: false,
      conflicts: [],
      content: first.content,
      errors: [],
    });
  });

  it("canonicalizes stable JSON values before writing and comparing", () => {
    const object = Object.assign(Object.create(null) as Record<string, unknown>, {
      values: [-0],
    });
    const operations = [
      { kind: "setIfMissing", path: ["number"], value: -0 },
      { kind: "setIfMissing", path: ["object"], value: object },
    ] as const;
    const first = applyJsoncOperations("{}\n", operations);
    const second = applyJsoncOperations(first.content, operations);

    expect(first.changed).toBe(true);
    expect(first.conflicts).toEqual([]);
    expect(first.content).toContain('"number": 0');
    expect(first.content).toContain("[\n      0\n    ]");
    expect(first.errors).toEqual([]);
    expect(second).toEqual({
      changed: false,
      conflicts: [],
      content: first.content,
      errors: [],
    });
  });

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  it.each([
    ["undefined", undefined],
    ["a nested function", { nested: () => true }],
    ["a nested symbol", { nested: Symbol("invalid") }],
    ["a nested non-finite number", { nested: Number.NaN }],
    ["a cycle", cyclic],
    ["a date", new Date(0)],
    ["a map", new Map()],
    ["a set", new Set()],
    ["a typed array", new Uint8Array([1])],
    ["a sparse array", Array(1)],
    ["a custom-prototype object", Object.create({})],
  ])("rejects %s before editing", (_label, value) => {
    const source = "{}\n";
    const result = applyJsoncOperations(source, [
      { kind: "setIfMissing", path: ["safe"], value: true },
      { kind: "setIfMissing", path: ["invalid"], value },
    ]);

    expect(result.changed).toBe(false);
    expect(result.conflicts).toEqual([]);
    expect(result.content).toBe(source);
    expect(result.errors).toHaveLength(1);
  });
});
