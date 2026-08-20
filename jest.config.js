/** @type {import("jest").Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true,
  setupFiles: ["<rootDir>/tests/setup/env.ts"],
  testTimeout: 30000,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/docs/**",
    "!src/server.ts",
  ],
  coverageDirectory: "test-report/coverage",
  coverageReporters: ["text", "text-summary", "json-summary", "lcov", "json"],
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/", "/tests/"],
};
