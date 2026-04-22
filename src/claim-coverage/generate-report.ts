/**
 * Claim-coverage report generator entry point.
 *
 * Story T1-S1-F-02.
 *
 * Usage:
 *   tsx src/claim-coverage/generate-report.ts
 *
 * Emits two files to ./coverage-report/:
 *   - claim-coverage.md
 *   - claim-coverage.html
 *
 * Inputs:
 *   - tests/claim_registry.yaml (the source of truth for claim tracking)
 *   - Test discovery via regex scan of tests/**\/*.test.ts
 *   - Optional vitest pass/fail info via ./.vitest-results.json if present.
 *     When absent, the generator assumes tests pass (greedy-green) UNLESS
 *     CLAIM_COVERAGE_REQUIRE_RESULTS=1 is set, in which case a missing or
 *     stale results file is a fatal error (audit §4.4).
 *
 * Audit §4.3 remediation (2026-04-22): the two fallback branches — yellow-
 * legacy and implemented-fallback — now call `verifyTestFiles` against the
 * registry's `test_files` list. A missing file or a file that contains no
 * `test_claim_${id}_*` name downgrades the row. See `verify-test-files.ts`.
 *
 * Audit §4.4 remediation (follow-up): when CLAIM_COVERAGE_REQUIRE_RESULTS=1
 * the generator refuses to produce a report with a missing or stale
 * .vitest-results.json. "Stale" = older than the registry file's mtime.
 * CI should set this env var unconditionally; local development leaves it
 * unset to preserve the current greedy-green behavior when iterating.
 */

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseClaimRegistry } from "./yaml-parse.js";
import { discoverTests, claimSortKey } from "./discover.js";
import { renderMarkdown, renderHtml } from "./render.js";
import { verifyTestFiles, type VerifyEntry } from "./verify-test-files.js";
import type {
  CoverageReport,
  CoverageReportRow,
  CoverageResult,
} from "./types.js";

/**
 * Thrown when CLAIM_COVERAGE_REQUIRE_RESULTS=1 and the vitest-results file
 * is missing or older than the registry. Exposed so meta-tests can match
 * on the error type rather than scraping the message string.
 */
export class VitestResultsRequiredError extends Error {
  public readonly code = "VITEST_RESULTS_REQUIRED";
  constructor(message: string) {
    super(message);
    this.name = "VitestResultsRequiredError";
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "..", "..");
const OUT_DIR = join(PROJECT_ROOT, "coverage-report");

interface VitestResult {
  testResults: Array<{
    status?: string; // "passed" | "failed"
    assertionResults?: Array<{
      status: "passed" | "failed" | "skipped";
      fullName?: string;
      title?: string;
    }>;
  }>;
}

export async function generateReport(opts: {
  generatedAtUtcMs: bigint;
  projectRoot?: string;
  /** When true, a missing or stale .vitest-results.json is a fatal error.
   *  When false/undefined, current greedy-green-on-absent behavior.
   *  When undefined, falls back to CLAIM_COVERAGE_REQUIRE_RESULTS=1 env var.
   *  Passing explicitly here is preferred for testing; the env var is how
   *  CI turns it on in real runs. */
  requireVitestResults?: boolean;
}): Promise<CoverageReport> {
  const projectRoot = opts.projectRoot ?? PROJECT_ROOT;
  const registryPath = join(projectRoot, "tests", "claim_registry.yaml");
  const testsRoot = join(projectRoot, "tests");
  const vitestResultsPath = join(projectRoot, ".vitest-results.json");

  const requireResults = opts.requireVitestResults
    ?? (process.env.CLAIM_COVERAGE_REQUIRE_RESULTS === "1");

  // §4.4 precondition check. Runs BEFORE any other work so a CI failure
  // surfaces immediately instead of after a minute of walking tests.
  if (requireResults) {
    await assertVitestResultsFresh(vitestResultsPath, registryPath);
  }

  const registrySource = await readFile(registryPath, "utf8");
  const registry = parseClaimRegistry(registrySource);

  const discovered = await discoverTests(testsRoot, projectRoot);
  const byClaim = new Map<string, typeof discovered>();
  for (const d of discovered) {
    const list = byClaim.get(d.claimId) ?? [];
    list.push(d);
    byClaim.set(d.claimId, list);
  }

  // Parse vitest results if present; map test NAME → pass/fail.
  const testStatus = await loadVitestStatuses(vitestResultsPath);

  const rows: CoverageReportRow[] = [];
  for (const claim of registry.claims) {
    const newStyleTests = byClaim.get(claim.id) ?? [];

    // GREEN — we have at least one test_claim_N_* test AND all are passing.
    if (newStyleTests.length > 0) {
      const failing = newStyleTests.filter((t) =>
        testStatus.size > 0 && testStatus.get(t.testName) === "failed",
      );
      if (failing.length > 0) {
        rows.push({
          claim,
          coverage: {
            kind: "red_failing",
            tests: newStyleTests.map((t) => t.file),
            failingCount: failing.length,
          } as CoverageResult,
        });
      } else {
        rows.push({
          claim,
          coverage: {
            kind: "green",
            tests: unique(newStyleTests.map((t) => t.file)),
            passingCount: newStyleTests.length,
          } as CoverageResult,
        });
      }
      continue;
    }

    // YELLOW — registry says legacy; use the listed test_files as coverage,
    // but only the ones that actually exist and contain a matching claim name.
    if (claim.status === "legacy") {
      const verified = await verifyTestFiles(claim.id, claim.testFiles, projectRoot);
      if (verified.okFiles.length > 0) {
        const coverage: CoverageResult = {
          kind: "yellow_legacy",
          tests: verified.okFiles,
          ...(claim.renameTarget !== undefined ? { renameTarget: claim.renameTarget } : {}),
          ...(verified.failures.length > 0
            ? { diagnostics: verified.failures.map(formatDiagnostic) }
            : {}),
        };
        rows.push({ claim, coverage });
      } else {
        rows.push({
          claim,
          coverage: {
            kind: "red_missing",
            diagnostics: verified.failures.map(formatDiagnostic),
          } as CoverageResult,
        });
      }
      continue;
    }

    // IMPLEMENTED in registry but no discovered test_claim_N_* names —
    // fall back to listed files if any, but only after verification.
    if (claim.status === "implemented" && claim.testFiles.length > 0) {
      const verified = await verifyTestFiles(claim.id, claim.testFiles, projectRoot);
      if (verified.failures.length === 0) {
        rows.push({
          claim,
          coverage: {
            kind: "green",
            tests: verified.okFiles,
            passingCount: verified.okFiles.length,
          } as CoverageResult,
        });
      } else {
        // Any failure in the fallback list downgrades to red_missing. This
        // is stricter than the legacy branch on purpose: an "implemented"
        // claim asserting coverage cannot have a half-broken citation.
        rows.push({
          claim,
          coverage: {
            kind: "red_missing",
            diagnostics: verified.failures.map(formatDiagnostic),
          } as CoverageResult,
        });
      }
      continue;
    }

    // RED_MISSING — placeholder, or nothing to show.
    rows.push({ claim, coverage: { kind: "red_missing" } });
  }

  // Sort rows by claim ID for deterministic output.
  rows.sort((a, b) => claimSortKey(a.claim.id) - claimSortKey(b.claim.id));

  // Summary counts
  const summary = {
    total: rows.length,
    green: rows.filter((r) => r.coverage.kind === "green").length,
    redFailing: rows.filter((r) => r.coverage.kind === "red_failing").length,
    redMissing: rows.filter((r) => r.coverage.kind === "red_missing").length,
    yellowLegacy: rows.filter((r) => r.coverage.kind === "yellow_legacy").length,
  };

  return {
    generatedAtUtcMs: opts.generatedAtUtcMs,
    rows,
    summary,
  };
}

function formatDiagnostic(v: VerifyEntry): string {
  switch (v.reason) {
    case "not_on_disk":
      return `${v.file}: listed in registry but not on disk`;
    case "no_matching_claim_name":
      return `${v.file}: exists but contains no matching test_claim_N_ name`;
    case "ok":
      // Should never reach formatDiagnostic; included for exhaustiveness.
      return `${v.file}: ok`;
  }
}

async function loadVitestStatuses(
  vitestResultsPath: string,
): Promise<Map<string, "passed" | "failed">> {
  const out = new Map<string, "passed" | "failed">();
  try {
    const raw = await readFile(vitestResultsPath, "utf8");
    const json = JSON.parse(raw) as VitestResult;
    for (const r of json.testResults ?? []) {
      for (const a of r.assertionResults ?? []) {
        const name = a.title ?? a.fullName;
        if (!name) continue;
        if (a.status === "passed" || a.status === "failed") {
          out.set(name, a.status);
        }
      }
    }
  } catch {
    // File absent or malformed — greedy-green assumption.
    //
    // When CLAIM_COVERAGE_REQUIRE_RESULTS=1 is set, `generateReport` calls
    // `assertVitestResultsFresh` BEFORE reaching this function, so the
    // absent-file case is already a hard error by the time we get here.
    // This catch handles the "env flag not set, file not there" local-dev
    // case only.
  }
  return out;
}

/**
 * §4.4 gate. Throws `VitestResultsRequiredError` if:
 *   1. The vitest-results file is missing.
 *   2. The file exists but its mtime is strictly older than the registry's
 *      mtime (i.e., someone edited the registry after the last test run).
 *
 * Using mtime comparison rather than content hashing because content
 * hashing would require a way to relate a results snapshot to a registry
 * snapshot; mtime is coarser but cheap and covers the "stale results left
 * over" case the audit flagged.
 *
 * Rationale for strict-less-than on the mtime: file systems with
 * second-resolution mtime (ext3, some network mounts) will report the
 * same mtime for a registry and a results file both written within the
 * same second. `<=` would trip on that; `<` is forgiving of the common
 * case without letting genuine stale-results slip through — if the
 * registry changed a second before the test run finished, the results
 * file will be timestamped AT LEAST that same second, so its mtime is
 * not strictly less.
 */
async function assertVitestResultsFresh(
  vitestResultsPath: string,
  registryPath: string,
): Promise<void> {
  const resultsStat = await stat(vitestResultsPath).catch(() => null);
  if (!resultsStat || !resultsStat.isFile()) {
    throw new VitestResultsRequiredError(
      `CLAIM_COVERAGE_REQUIRE_RESULTS=1 but .vitest-results.json is missing at ${vitestResultsPath}. ` +
      `CI must run vitest with --reporter=json --outputFile=.vitest-results.json before generating the claim-coverage report.`,
    );
  }

  const registryStat = await stat(registryPath).catch(() => null);
  if (!registryStat) {
    // The registry was already read successfully by the caller, so stat
    // failing here would be a race or permission change. Treat as fatal.
    throw new VitestResultsRequiredError(
      `CLAIM_COVERAGE_REQUIRE_RESULTS=1 but could not stat registry at ${registryPath}.`,
    );
  }

  if (resultsStat.mtimeMs < registryStat.mtimeMs) {
    throw new VitestResultsRequiredError(
      `CLAIM_COVERAGE_REQUIRE_RESULTS=1 and .vitest-results.json (mtime ${new Date(resultsStat.mtimeMs).toISOString()}) ` +
      `is older than the claim registry (mtime ${new Date(registryStat.mtimeMs).toISOString()}). ` +
      `The results file was likely left over from a prior test run and does not reflect the current registry. ` +
      `Re-run the test suite before generating the coverage report.`,
    );
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

async function main(): Promise<void> {
  // Frozen timestamp = 0 when building deterministically (e.g., in a reproducibility test).
  // In CI, we stamp with the real clock for the header only.
  const generatedAtUtcMs = process.env.CLAIM_COVERAGE_FROZEN_TS
    ? BigInt(process.env.CLAIM_COVERAGE_FROZEN_TS)
    : BigInt(Date.now());

  const report = await generateReport({ generatedAtUtcMs });
  const md = renderMarkdown(report);
  const html = renderHtml(report);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "claim-coverage.md"), md, "utf8");
  await writeFile(join(OUT_DIR, "claim-coverage.html"), html, "utf8");

  console.log(
    `[claim-coverage] ${report.summary.green} green / ${report.summary.yellowLegacy} yellow / ` +
    `${report.summary.redFailing + report.summary.redMissing} red / ${report.summary.total} total`,
  );

  // Exit non-zero if any claim is red_failing — green / yellow / red_missing are
  // informational (placeholders are expected in Sprint 1). Failing tests are not.
  if (report.summary.redFailing > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    if (err instanceof VitestResultsRequiredError) {
      // Clean, single-line error message — stack trace isn't useful for a
      // precondition failure that only surfaces when the env var is set.
      console.error(`[claim-coverage] ${err.message}`);
    } else {
      console.error("[claim-coverage] failed:", err);
    }
    process.exit(1);
  });
}
