import amamo from "../dist/index.js";

export default amamo({
  experimental: {
    cypress: true,
    mocha: true,
    playwright: true,
    regexp: true,
    sonarjs: true,
    storybook: true,
    testingLibrary: true,
  },
});
