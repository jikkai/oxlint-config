import amamo from "../dist/index.js";

export default amamo({
  imports: true,
  jsdoc: true,
  jsxA11y: true,
  nextjs: true,
  node: true,
  promise: true,
  react: true,
  reactPerf: true,
  tailwindcss: { entryPoint: "fixtures/stable/tailwindcss/styles.css" },
  test: ["jest", "vitest"],
  typeAware: true,
  typescript: true,
  vue: true,
});
