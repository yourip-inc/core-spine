/**
 * Custom ESLint rule: test_claim_N_* naming convention for patent-adjacent packages.
 *
 * Story: T1-S1-F-01
 * Patent conformance SOW: docs/patent-conformance-sow.md (to author in T1-S1-G-03)
 *
 * Flags any vitest `describe(...)` or `it(...)` / `test(...)` call whose first
 * argument is a string literal that does not begin with `test_claim_{N}_` when
 * the test file sits inside a patent-adjacent package.
 *
 * Patent-adjacent = any file whose path contains one of:
 *   /canonical/  /rubric/  /rating/  /challenge/  /scoring/  /payout/  /audit/  /replay/  /migration/  /submission/
 *
 * This rule is custom (not published) and lives under `eslint-rules/`. See
 * .eslintrc.cjs for how it's loaded.
 */

"use strict";

// Patent-adjacent = the test file's path OR filename contains one of the domain
// keywords (canonical, rubric, rating, challenge, scoring, payout, audit, replay,
// migration, submission). We check both because tests may be organized flat
// (tests/unit/rubric-service.test.ts) or nested (tests/unit/scoring/decimal4.test.ts).
// NOTE: the `-` in the char classes is at the END (literal hyphen, not a range).
const PATENT_ADJACENT_RE =
  /[/\\.-](canonical|rubric|rating|challenge|scoring|payout|audit|replay|migration|submission)[/\\.-]/i;
const CLAIM_NAME_RE = /^test_claim_(CS_\d+[A-Z]?)_[a-z][a-z0-9_]*$/;

const SOW_LINK = "See docs/patent-conformance-sow.md#test-naming";

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce test_claim_{N}_* naming for tests in patent-adjacent packages.",
    },
    messages: {
      badName:
        "Test name '{{name}}' must match test_claim_{N}_<description> in patent-adjacent packages (found in {{path}}). " +
        SOW_LINK,
      nonStringArg:
        "Test name in patent-adjacent packages must be a string literal so the test_claim_N_ convention can be linted. " +
        SOW_LINK,
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    // Only enforce inside patent-adjacent packages/files.
    if (!PATENT_ADJACENT_RE.test(filename)) return {};
    // Only enforce on test files.
    if (!/\.test\.(ts|tsx|js|jsx)$/.test(filename)) return {};

    function check(node, calleeName) {
      const arg = node.arguments[0];
      if (!arg) return;
      if (arg.type !== "Literal" || typeof arg.value !== "string") {
        context.report({ node: arg, messageId: "nonStringArg" });
        return;
      }
      // `describe` blocks are group names; allow them freely so files can have
      // a module-level describe(). Only `it`/`test` must match the convention.
      if (calleeName === "describe") return;
      if (!CLAIM_NAME_RE.test(arg.value)) {
        context.report({
          node: arg,
          messageId: "badName",
          data: { name: arg.value, path: filename },
        });
      }
    }

    return {
      CallExpression(node) {
        const c = node.callee;
        if (c.type === "Identifier" && ["it", "test", "describe"].includes(c.name)) {
          check(node, c.name);
        } else if (
          c.type === "MemberExpression" &&
          c.object.type === "Identifier" &&
          c.object.name === "it" &&
          c.property.type === "Identifier" &&
          (c.property.name === "skip" || c.property.name === "only")
        ) {
          // it.skip(...) / it.only(...)
          check(node, "it");
        }
      },
    };
  },
};
