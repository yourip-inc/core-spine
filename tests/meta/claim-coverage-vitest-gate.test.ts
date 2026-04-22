/**
 * Meta-test for the CLAIM_COVERAGE_REQUIRE_RESULTS gate (audit §4.4).
 *
 * Four scenarios:
 *   1. requireVitestResults=true + results file absent → throws
 *   2. requireVitestResults=true + results file older than registry → throws
 *   3. requireVitestResults=true + results file present and fresh → passes
 *   4. requireVitestResults=false (or unset) + results file absent → no throw
 *      (preserves current greedy-green behavior for local dev)
 *
 * Each scenario uses `requireVitestResults` passed explicitly through the
 * function signature rather than mutating `process.env`. Env-var handling
 * is covered by its own small test at the bottom.
 *
 * Lives in tests/meta/ so the `test_claim_coverage_*` naming does not
 * collide with patent-claim tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generateReport,
  VitestResultsRequiredError,
} from "../../src/claim-coverage/generate-report.js";

describe("claim-coverage vitest-results gate: requireVitestResults=true", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "claim-coverage-gate-"));
    await mkdir(join(projectRoot, "tests"), { recursive: true });
    // A minimal registry so generateReport can get past the registry-read step.
    await writeFile(join(projectRoot, "tests", "claim_registry.yaml"), `
claims:
  - id: "1"
    title: "Test claim"
    status: placeholder
    test_files: []
`);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("test_claim_coverage_require_results_throws_when_file_absent", async () => {
    // No .vitest-results.json anywhere.
    await expect(
      generateReport({
        generatedAtUtcMs: 0n,
        projectRoot,
        requireVitestResults: true,
      }),
    ).rejects.toThrow(VitestResultsRequiredError);

    // Also check the error message mentions the flag name so a CI log
    // reader can immediately grep for it.
    await expect(
      generateReport({
        generatedAtUtcMs: 0n,
        projectRoot,
        requireVitestResults: true,
      }),
    ).rejects.toThrow(/CLAIM_COVERAGE_REQUIRE_RESULTS=1/);
  });

  it("test_claim_coverage_require_results_throws_when_file_older_than_registry", async () => {
    // Write a stale results file (mtime set to 1 hour ago), then touch
    // the registry so its mtime is now.
    const resultsPath = join(projectRoot, ".vitest-results.json");
    await writeFile(resultsPath, `{"testResults":[]}`);

    // Set results file mtime to an hour in the past.
    const hourAgo = new Date(Date.now() - 3600 * 1000);
    await utimes(resultsPath, hourAgo, hourAgo);

    // Ensure registry mtime is now (re-write to bump mtime).
    await writeFile(join(projectRoot, "tests", "claim_registry.yaml"), `
claims:
  - id: "1"
    title: "Test claim"
    status: placeholder
    test_files: []
`);

    await expect(
      generateReport({
        generatedAtUtcMs: 0n,
        projectRoot,
        requireVitestResults: true,
      }),
    ).rejects.toThrow(VitestResultsRequiredError);

    await expect(
      generateReport({
        generatedAtUtcMs: 0n,
        projectRoot,
        requireVitestResults: true,
      }),
    ).rejects.toThrow(/older than the claim registry/);
  });

  it("test_claim_coverage_require_results_passes_when_file_present_and_fresh", async () => {
    // Write a valid (empty) results file AFTER the registry so its mtime is newer.
    // Small sleep to ensure mtime ordering on second-resolution filesystems.
    await new Promise((r) => setTimeout(r, 1100));
    const resultsPath = join(projectRoot, ".vitest-results.json");
    await writeFile(resultsPath, `{"testResults":[]}`);

    const report = await generateReport({
      generatedAtUtcMs: 0n,
      projectRoot,
      requireVitestResults: true,
    });

    // Just verify we got past the gate and returned a real report object.
    expect(report.summary.total).toBe(1);
  });
});

describe("claim-coverage vitest-results gate: requireVitestResults=false", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "claim-coverage-gate-off-"));
    await mkdir(join(projectRoot, "tests"), { recursive: true });
    await writeFile(join(projectRoot, "tests", "claim_registry.yaml"), `
claims:
  - id: "1"
    title: "Test claim"
    status: placeholder
    test_files: []
`);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("test_claim_coverage_require_results_ignores_when_flag_not_set", async () => {
    // No results file, flag off (and the env var is not set in this process).
    // Must not throw — preserves the current greedy-green local-dev behavior.
    const report = await generateReport({
      generatedAtUtcMs: 0n,
      projectRoot,
      requireVitestResults: false,
    });

    expect(report.summary.total).toBe(1);
  });
});

describe("claim-coverage vitest-results gate: env-var fallback", () => {
  // When the opts flag is not provided, the gate falls back to the env var.
  let projectRoot: string;
  let savedEnv: string | undefined;

  beforeEach(async () => {
    savedEnv = process.env.CLAIM_COVERAGE_REQUIRE_RESULTS;
    projectRoot = await mkdtemp(join(tmpdir(), "claim-coverage-gate-env-"));
    await mkdir(join(projectRoot, "tests"), { recursive: true });
    await writeFile(join(projectRoot, "tests", "claim_registry.yaml"), `
claims:
  - id: "1"
    title: "Test claim"
    status: placeholder
    test_files: []
`);
  });

  afterEach(async () => {
    if (savedEnv === undefined) delete process.env.CLAIM_COVERAGE_REQUIRE_RESULTS;
    else process.env.CLAIM_COVERAGE_REQUIRE_RESULTS = savedEnv;
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("test_claim_coverage_require_results_env_var_enables_gate", async () => {
    process.env.CLAIM_COVERAGE_REQUIRE_RESULTS = "1";

    // No explicit requireVitestResults in opts → falls back to env var.
    await expect(
      generateReport({
        generatedAtUtcMs: 0n,
        projectRoot,
      }),
    ).rejects.toThrow(VitestResultsRequiredError);
  });

  it("test_claim_coverage_require_results_env_var_other_values_do_not_enable_gate", async () => {
    // The fallback checks strict equality with "1". Any other value keeps
    // the gate off. This guards against accidental enablement from e.g.
    // CLAIM_COVERAGE_REQUIRE_RESULTS=true or ="false".
    for (const v of ["true", "false", "0", "yes", ""]) {
      process.env.CLAIM_COVERAGE_REQUIRE_RESULTS = v;
      const report = await generateReport({
        generatedAtUtcMs: 0n,
        projectRoot,
      });
      expect(report.summary.total).toBe(1);
    }
  });
});
