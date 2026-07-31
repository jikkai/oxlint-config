import { describe, expect, it } from "vitest";

import amamo from "../config.js";
import { jest, jsxA11y, nextjs, react, vitest } from "../presets.js";

describe("amamo", () => {
  it("uses base, TypeScript, imports, and promise by default", () => {
    const config = amamo();
    expect(config.extends).toHaveLength(4);
  });

  it("allows each optional native fragment to be disabled", () => {
    const config = amamo({ imports: false, promise: false, typescript: false });
    expect(config.extends).toHaveLength(1);
  });

  it("maps public root options to Oxlint root keys", () => {
    const config = amamo({ ignores: ["dist/**"], typeAware: true });
    expect(config.ignorePatterns).toEqual(["dist/**"]);
    expect(config.options).toEqual({ typeAware: true });
  });

  it("places user rules before arbitrary overrides", () => {
    const override = { rules: { eqeqeq: "off" as const } };
    const config = amamo({ rules: { eqeqeq: "error" } }, override);
    expect(config.extends?.at(-2)?.rules?.eqeqeq).toBe("error");
    expect(config.extends?.at(-1)).toBe(override);
  });

  it("is deterministic and does not mutate inputs", () => {
    const options = { ignores: ["coverage/**"] };
    const before = structuredClone(options);
    expect(amamo(options)).toEqual(amamo(options));
    expect(options).toEqual(before);
  });

  it("makes Next.js imply React and accessibility", () => {
    const names = amamo({ nextjs: true }).extends;
    expect(names).toEqual(expect.arrayContaining([nextjs, react, jsxA11y]));
  });

  it("makes React imply accessibility", () => {
    const configs = amamo({ react: true }).extends;
    expect(configs).toEqual(expect.arrayContaining([react, jsxA11y]));
  });

  it("lets explicit jsxA11y false override React and Next defaults", () => {
    const configs = amamo({ jsxA11y: false, nextjs: true }).extends;
    expect(configs).toContain(react);
    expect(configs).toContain(nextjs);
    expect(configs).not.toContain(jsxA11y);
  });

  it("allows Jest and Vitest together in declaration order", () => {
    const configs = amamo({ test: ["jest", "vitest"] }).extends;
    expect(configs).toEqual(expect.arrayContaining([jest, vitest]));
    expect(configs?.indexOf(jest)).toBeLessThan(configs?.indexOf(vitest) ?? -1);
  });

  it("deduplicates repeated test presets", () => {
    const configs = amamo({ test: ["jest", "jest", "vitest", "vitest"] }).extends ?? [];
    expect(configs.filter((config) => config === jest)).toHaveLength(1);
    expect(configs.filter((config) => config === vitest)).toHaveLength(1);
  });
});
