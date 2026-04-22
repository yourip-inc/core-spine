/**
 * Custom ESLint rule: reject FILMER references outside the alias-normalization layer.
 *
 * Story: T1-S1-E-02.
 * Claim: 10 (vocabulary alignment — VIDEOGRAPHER canonical).
 *
 * Allowed paths (FILMER can appear here):
 *   - src/submission/contributor-role.ts (the alias layer itself)
 *   - Any test file (tests need to exercise the alias)
 *   - docs/ (documentation can discuss the deprecation)
 *
 * Anywhere else → error. The error message points to the alias layer.
 */

"use strict";

const ALIAS_LAYER_RE = /[/\\]submission[/\\]contributor-role\.ts$/i;
const TEST_FILE_RE = /\.test\.(ts|tsx|js|jsx)$/i;
const DOCS_PATH_RE = /[/\\]docs[/\\]/i;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject FILMER references outside the contributor-role alias layer (Claim 10, T1-S1-E-02).",
    },
    messages: {
      filmerOutsideAlias:
        "FILMER is deprecated; use VIDEOGRAPHER. The only module permitted to reference FILMER is " +
        "src/submission/contributor-role.ts (the alias-normalization layer). See " +
        "docs/vocabulary-deprecations.md.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (ALIAS_LAYER_RE.test(filename)) return {};
    if (TEST_FILE_RE.test(filename)) return {};
    if (DOCS_PATH_RE.test(filename)) return {};

    function reportIfFilmer(node, value) {
      if (typeof value !== "string") return;
      // Whole-token match only — avoid false positives on words like "FILMERS"
      // or "MYFILMER".
      if (!/\bFILMER\b/.test(value)) return;
      context.report({ node, messageId: "filmerOutsideAlias" });
    }

    return {
      Literal(node) {
        reportIfFilmer(node, node.value);
      },
      TemplateElement(node) {
        reportIfFilmer(node, node.value.cooked);
      },
      Identifier(node) {
        if (node.name === "FILMER") {
          context.report({ node, messageId: "filmerOutsideAlias" });
        }
      },
    };
  },
};
