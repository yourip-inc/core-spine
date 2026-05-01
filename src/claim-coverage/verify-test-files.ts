/**
 * Verifies that registry-listed `test_files` paths actually back the claim
 * they are cited for.
 *
 * Audit §4.3 remediation. Before this module existed, both the yellow-legacy
 * branch and the implemented-fallback branch in `generate-report.ts` trusted
 * the registry's `test_files` list without any check. That let:
 *
 *   1. Phantom paths render as coverage (7 legacy claims list
 *      `tests/legacy/*.test.ts` paths that do not exist on disk).
 *   2. Files that exist but contain only differently-named tests render as
 *      coverage (4 implemented claims — 13A, 13B, 19, 23 — have registry
 *      entries pointing at files whose `test_claim_N_*` names do not match
 *      the registry's claim ID).
 *
 * A verified file must (a) exist and (b) contain at least one
 * `test_claim_${claimId}_*` name. This module reports on both conditions
 * without deciding what the caller does about a failure — the caller owns
 * the downgrade policy.
 */

import { stat, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export type VerifyReason = "ok" | "not_on_disk" | "no_matching_claim_name";

export interface VerifyEntry {
  /** The path as cited in the registry (relative). Rendered back verbatim. */
  file: string;
  reason: VerifyReason;
}

export interface VerifyResult {
  /** One entry per input path, in the same order the caller supplied. */
  entries: VerifyEntry[];
  /** Convenience subsets — computed once so callers don't re-walk `entries`. */
  okFiles: string[];
  failures: VerifyEntry[];
}

/**
 * Verify every path in `testFiles` against a claim ID.
 *
 * Paths are resolved relative to `projectRoot`. Absolute paths are used
 * as-is (an escape hatch for tests; registry paths are always relative).
 *
 * Only `test_claim_${claimId}_*` names count as a match. The regex matches
 * the token boundary both sides so `test_claim_13_` does not satisfy a
 * lookup for claim `"1"` and vice-versa. `13A` correctly rejects `13` and
 * `13B`.
 *
 * This function does NOT call vitest, does NOT execute tests, and does NOT
 * check that the named test passes at runtime. Pass/fail overlay is already
 * handled separately in `generate-report.ts` via `.vitest-results.json`;
 * this module is a static precondition for that overlay to be meaningful.
 */
export async function verifyTestFiles(
  claimId: string,
  testFiles: readonly string[],
  projectRoot: string,
): Promise<VerifyResult> {
  const matcher = buildClaimNameRegex(claimId);
  const entries: VerifyEntry[] = [];

  for (const file of testFiles) {
    const resolved = isAbsolute(file) ? file : join(projectRoot, file);

    // 1. Existence check. ENOENT / permission errors / "not a regular file"
    // all collapse to `not_on_disk` — the registry citation is unusable
    // either way.
    const st = await stat(resolved).catch(() => null);
    if (!st || !st.isFile()) {
      entries.push({ file, reason: "not_on_disk" });
      continue;
    }

    // 2. Content check. Read the file and look for a matching test name.
    // Read cost is bounded: test files in this repo are < 10 KB each; if
    // that ever stops being true the regex can stream against a read
    // stream instead.
    let source: string;
    try {
      source = await readFile(resolved, "utf8");
    } catch {
      // Readable by stat, unreadable by read — treat as not_on_disk rather
      // than inventing a third reason. The on-disk concept is "usable
      // evidence", not "inode exists".
      entries.push({ file, reason: "not_on_disk" });
      continue;
    }

    if (matcher.test(source)) {
      entries.push({ file, reason: "ok" });
    } else {
      entries.push({ file, reason: "no_matching_claim_name" });
    }
  }

  const okFiles = entries.filter((e) => e.reason === "ok").map((e) => e.file);
  const failures = entries.filter((e) => e.reason !== "ok");

  return { entries, okFiles, failures };
}

/**
 * Build a regex that matches a `test_claim_${claimId}_` token in source.
 *
 * Claim IDs are alphanumeric (`1`, `13A`, `20A`) and must not regex-escape;
 * asserting that here keeps a future registry change from introducing a
 * regex injection.
 */
function buildClaimNameRegex(claimId: string): RegExp {
  if (!/^CS-\d+[A-Z]?$/.test(claimId)) {
    throw new Error(
      `verifyTestFiles: invalid claim ID ${JSON.stringify(claimId)}; ` +
      `expected CS- prefix followed by digits optionally followed by a single uppercase letter.`,
    );
  }
  // Bounded by word boundary on the left (so `foo_test_claim_1_` does not
  // match a lookup for "1"), and an explicit underscore+letter on the right
  // (mirroring the CLAIM_NAME_RE in discover.ts).
  const testNameId = claimId.replace("-", "_");
  return new RegExp(`\\btest_claim_${testNameId}_[a-z][a-z0-9_]*\\b`);
}
