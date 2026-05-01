/**
 * Test discovery for claim-coverage report.
 *
 * Walks the tests/ tree, reads each *.test.ts file, and extracts names of
 * `it("test_claim_N_...", ...)` / `test("test_claim_N_...", ...)` /
 * `describe("test_claim_N_...", ...)` calls.
 *
 * We do NOT use a full TS parser here — a simple regex over the source file
 * is sufficient and keeps this tool dep-free. False positives (commented-out
 * tests, string constants named like tests) are tolerated because they only
 * produce green status on non-existent tests, and vitest will catch those
 * when it runs.
 *
 * The report generator separately runs vitest to determine pass/fail. This
 * module only answers the question "which test_claim_N_ names exist and where".
 *
 * Audit §4.1 remediation (2026-04-22): the walker skips paths whose
 * project-relative location starts with a configured exclusion prefix.
 * Default: ["tests/meta"]. This prevents the regex from matching synthetic
 * source-string fixtures used by the ESLint meta-tests.
 *
 * Audit §4.2 remediation (follow-up): `describe` is now in the call-name
 * alternation. The repo uses `describe("test_claim_N_...")` as a block-
 * grouping convention in ~8 files where the previous regex left
 * `test_claim_N_` names invisible to discovery. Widening the alternation
 * only matters AFTER §4.1 lands — without the meta-directory exclusion,
 * the widened regex also matches `describe(...)` calls inside RuleTester
 * fixture strings, increasing false positives. PR ordering: 4.1+4.3 first,
 * then this change.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, relative, sep } from "node:path";

const TEST_NAME_RE = /\b(?:it|test|describe)(?:\.skip|\.only)?\s*\(\s*["']([^"']+)["']/g;
const CLAIM_NAME_RE = /^test_claim_(CS_\d+[A-Z]?)_[a-z][a-z0-9_]*$/;

/** Default exclusion list. Kept alongside the walker so it is discoverable
 *  to anyone grepping for why a test file is being skipped. */
export const DEFAULT_DISCOVER_EXCLUSIONS: readonly string[] = ["tests/meta"];

export interface DiscoveredTest {
  claimId: string;       // "1", "13A", etc.
  testName: string;      // full test_claim_N_...
  file: string;          // relative path from project root
}

export interface DiscoverOptions {
  /** Paths (relative to `projectRoot`) whose subtrees are skipped. Stored
   *  with forward slashes regardless of host OS. Defaults to
   *  DEFAULT_DISCOVER_EXCLUSIONS. */
  exclusions?: readonly string[];
}

export async function discoverTests(
  testsRoot: string,
  projectRoot: string,
  options: DiscoverOptions = {},
): Promise<DiscoveredTest[]> {
  const exclusions = (options.exclusions ?? DEFAULT_DISCOVER_EXCLUSIONS)
    .map(normalizeForwardSlashes);

  const out: DiscoveredTest[] = [];
  await walk(testsRoot, projectRoot, exclusions, async (file) => {
    if (!/\.test\.(ts|tsx|js|jsx)$/.test(file)) return;
    const source = await readFile(file, "utf8");
    const relPath = normalizeForwardSlashes(relative(projectRoot, file));
    TEST_NAME_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEST_NAME_RE.exec(source)) !== null) {
      const name = m[1]!;
      const claimMatch = name.match(CLAIM_NAME_RE);
      if (!claimMatch) continue;
      out.push({
        claimId: claimMatch[1]!.replace("_", "-"),
        testName: name,
        file: relPath,
      });
    }
  });

  // Sort for determinism (F-02 AC: "Report generation deterministic and reproducible").
  out.sort((a, b) => {
    if (a.claimId !== b.claimId) return claimSortKey(a.claimId) - claimSortKey(b.claimId);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.testName.localeCompare(b.testName);
  });
  return out;
}

/**
 * Sort key that orders "1" < "13" < "13A" < "13B" < "14" < "20" < "20A" < "21".
 */
export function claimSortKey(id: string): number {
  const m = id.match(/^CS-(\d+)([A-Z]?)$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = Number(m[1]);
  const letter = m[2] ? m[2].charCodeAt(0) - 0x40 : 0; // A=1, B=2, 0 if none
  return n * 100 + letter;
}

async function walk(
  root: string,
  projectRoot: string,
  exclusions: readonly string[],
  visit: (f: string) => Promise<void>,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    const full = join(root, name);
    const st = await stat(full).catch(() => null);
    if (!st) continue;

    // Normalize to a forward-slash project-relative path for comparison.
    // This is the form exclusions are authored in.
    const relFromProject = normalizeForwardSlashes(relative(projectRoot, full));
    if (isExcluded(relFromProject, exclusions)) continue;

    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".git") continue;
      await walk(full, projectRoot, exclusions, visit);
    } else if (st.isFile() && extname(full) !== ".snap") {
      await visit(full);
    }
  }
}

/**
 * A path is excluded if it is exactly an exclusion entry OR is under one
 * (i.e. the exclusion is a directory prefix). Prefix match is checked with
 * a trailing `/` so that `tests/meta` excludes `tests/meta/foo.test.ts` but
 * does NOT exclude `tests/meta-integration/foo.test.ts`.
 */
export function isExcluded(relPath: string, exclusions: readonly string[]): boolean {
  for (const ex of exclusions) {
    if (relPath === ex) return true;
    if (relPath.startsWith(ex + "/")) return true;
  }
  return false;
}

function normalizeForwardSlashes(p: string): string {
  // On POSIX `sep === "/"` so this is a no-op. On Windows CI this matters.
  return sep === "/" ? p : p.split(sep).join("/");
}
