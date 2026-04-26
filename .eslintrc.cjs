"use strict";

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    // F-01: enforce test_claim_N_ convention in patent-adjacent packages.
    // Loaded via `eslint --rulesdir eslint-rules` in package.json lint script.
    "claim-test-naming": "error",
    // E-02: reject new FILMER references outside the alias-normalization layer.
    "no-filmer-outside-alias": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
  env: { node: true, es2022: true },
  ignorePatterns: ["dist", "node_modules", "coverage"],
  overrides: [
    {
      files: ["tests/**/*.ts"],
      env: { node: true },
    },
  ],
};
