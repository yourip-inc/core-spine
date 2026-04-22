/**
 * Meta-test for the claim-test-naming ESLint rule.
 *
 * This test directly require()s the rule module and exercises it against
 * synthetic code samples. If the rule's regex is malformed the require
 * itself throws — which is how I caught a regex bug that slipped through
 * earlier sessions (the rule "worked" because it crashed silently during
 * load and ESLint skipped it; real lint output looked clean).
 *
 * Lives in tests/meta/ (outside the patent-adjacent lint scope) so these
 * tests can use normal it("should ...") naming.
 */

import { describe, it, expect } from "vitest";
import { RuleTester } from "eslint";
import rule from "../../eslint-rules/claim-test-naming.js";

// RuleTester from eslint 8 — works with both CJS and the legacy config shape.
const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

describe("claim-test-naming ESLint rule", () => {
  it("module loads without a regex syntax error", () => {
    // If the regex were malformed the require at the top would throw.
    // Arriving here means the module parsed.
    expect(typeof rule).toBe("object");
    expect(rule.meta.type).toBe("problem");
  });

  it("accepts conformant test names in patent-adjacent packages", () => {
    expect(() => ruleTester.run("claim-test-naming", rule as never, {
      valid: [
        {
          filename: "tests/unit/scoring/decimal4.test.ts",
          code: `it("test_claim_3_effective_vote_mass", () => {});`,
        },
        {
          filename: "src/rubric/rubric-service.test.ts",
          code: `it("test_claim_14_rubric_immutable", () => {});`,
        },
        {
          filename: "tests/unit/migration/migration-record.test.ts",
          code: `it("test_claim_11_checksum_is_stable", () => {});`,
        },
        {
          // `describe` blocks are group names — allowed unconstrained.
          filename: "src/scoring/foo.test.ts",
          code: `describe("some group", () => { it("test_claim_1_ok", () => {}); });`,
        },
      ],
      invalid: [],
    })).not.toThrow();
  });

  it("rejects non-conformant test names in patent-adjacent packages", () => {
    expect(() => ruleTester.run("claim-test-naming", rule as never, {
      valid: [],
      invalid: [
        {
          filename: "src/scoring/decimal4.test.ts",
          code: `it("should add two decimals", () => {});`,
          errors: [{ messageId: "badName" }],
        },
        {
          filename: "tests/unit/migration/foo.test.ts",
          code: `test("checksum works", () => {});`,
          errors: [{ messageId: "badName" }],
        },
      ],
    })).not.toThrow();
  });

  it("leaves non-patent-adjacent packages alone", () => {
    expect(() => ruleTester.run("claim-test-naming", rule as never, {
      valid: [
        {
          filename: "tests/meta/claim-coverage.test.ts",
          code: `it("should do the thing", () => {});`,
        },
        {
          filename: "src/db/migrate.ts.test.ts",
          code: `it("runs migrations", () => {});`,
        },
      ],
      invalid: [],
    })).not.toThrow();
  });
});
