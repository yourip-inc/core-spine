/**
 * Meta-test for the no-filmer-outside-alias ESLint rule.
 *
 * Story: T1-S1-E-02 ("CI lint rule rejects new FILMER references outside alias layer").
 *
 * Validates:
 *   - Rule module loads (regex not malformed).
 *   - FILMER references in arbitrary source files are reported.
 *   - FILMER references in the alias-layer file are allowed.
 *   - FILMER references in test files are allowed.
 *   - FILMER references in docs/ paths are allowed.
 */

import { describe, it, expect } from "vitest";
import { RuleTester } from "eslint";
import rule from "../../eslint-rules/no-filmer-outside-alias.js";

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("no-filmer-outside-alias ESLint rule", () => {
  it("module loads without a regex syntax error", () => {
    expect(typeof rule).toBe("object");
    expect(rule.meta.type).toBe("problem");
  });

  it("flags FILMER string literals in arbitrary source files", () => {
    expect(() => ruleTester.run("no-filmer-outside-alias", rule as never, {
      valid: [],
      invalid: [
        {
          filename: "src/challenge/challenge-service.ts",
          code: `const role = "FILMER";`,
          errors: [{ messageId: "filmerOutsideAlias" }],
        },
      ],
    })).not.toThrow();
  });

  it("flags FILMER identifiers in arbitrary source files", () => {
    expect(() => ruleTester.run("no-filmer-outside-alias", rule as never, {
      valid: [],
      invalid: [
        {
          filename: "src/rating/rating-service.ts",
          code: `const FILMER = "x"; console.log(FILMER);`,
          // The const declaration Identifier + the reference Identifier both trip.
          errors: [
            { messageId: "filmerOutsideAlias" },
            { messageId: "filmerOutsideAlias" },
          ],
        },
      ],
    })).not.toThrow();
  });

  it("flags FILMER in template strings", () => {
    expect(() => ruleTester.run("no-filmer-outside-alias", rule as never, {
      valid: [],
      invalid: [
        {
          filename: "src/foo/bar.ts",
          code: "const x = `role is FILMER`;",
          errors: [{ messageId: "filmerOutsideAlias" }],
        },
      ],
    })).not.toThrow();
  });

  it("permits FILMER inside the alias-normalization layer", () => {
    expect(() => ruleTester.run("no-filmer-outside-alias", rule as never, {
      valid: [
        {
          filename: "src/submission/contributor-role.ts",
          code: `const map = { FILMER: "VIDEOGRAPHER" };`,
        },
      ],
      invalid: [],
    })).not.toThrow();
  });

  it("permits FILMER inside test files", () => {
    expect(() => ruleTester.run("no-filmer-outside-alias", rule as never, {
      valid: [
        {
          filename: "tests/unit/submission/contributor-role.test.ts",
          code: `expect(normalize("FILMER").role).toBe("VIDEOGRAPHER");`,
        },
      ],
      invalid: [],
    })).not.toThrow();
  });

  it("permits FILMER inside docs/ paths", () => {
    expect(() => ruleTester.run("no-filmer-outside-alias", rule as never, {
      valid: [
        {
          filename: "docs/vocabulary-deprecations.md.ts",
          code: `const note = "FILMER is deprecated";`,
        },
      ],
      invalid: [],
    })).not.toThrow();
  });

  it("does not flag unrelated identifiers that happen to contain FILMER as a substring", () => {
    // Whole-word boundary: MYFILMER, FILMERS, etc. should not trip.
    expect(() => ruleTester.run("no-filmer-outside-alias", rule as never, {
      valid: [
        {
          filename: "src/foo/bar.ts",
          code: `const FILMERS_BAD = "no"; /* should not match */`,
        },
      ],
      invalid: [],
    })).not.toThrow();
  });
});
