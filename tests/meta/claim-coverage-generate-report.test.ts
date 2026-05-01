/**
 * Meta-test for claim-coverage fallback-branch verification.
 *
 * Audit §4.3 remediation. Covers two layers:
 *
 *   1. `verifyTestFiles` (pure unit) — each `(claimId, file)` pair resolves
 *      to exactly one of {ok, not_on_disk, no_matching_claim_name}.
 *
 *   2. Integration through `generateReport` — the yellow-legacy and
 *      implemented-fallback branches downgrade to red_missing when
 *      verification fails, and green stays green when it passes.
 *
 * The integration tests spin up a minimal project tree with a synthetic
 * registry so we don't depend on the repo's actual claim_registry.yaml.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyTestFiles } from "../../src/claim-coverage/verify-test-files.js";
import { generateReport } from "../../src/claim-coverage/generate-report.js";

describe("verifyTestFiles", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "claim-coverage-verify-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("test_claim_coverage_verify_ok_when_file_has_matching_name", async () => {
    await mkdir(join(projectRoot, "tests"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "a.test.ts"),
      `it("test_claim_CS_3_effective_vote_mass_rounds_half_even", () => {});\n`,
      "utf8",
    );

    const result = await verifyTestFiles("CS-3", ["tests/a.test.ts"], projectRoot);

    expect(result.entries).toEqual([{ file: "tests/a.test.ts", reason: "ok" }]);
    expect(result.okFiles).toEqual(["tests/a.test.ts"]);
    expect(result.failures).toEqual([]);
  });

  it("test_claim_coverage_verify_not_on_disk_when_file_missing", async () => {
    const result = await verifyTestFiles("CS-3", ["tests/missing.test.ts"], projectRoot);

    expect(result.entries).toEqual([
      { file: "tests/missing.test.ts", reason: "not_on_disk" },
    ]);
    expect(result.okFiles).toEqual([]);
    expect(result.failures).toHaveLength(1);
  });

  it("test_claim_coverage_verify_no_matching_name_when_file_has_other_claim_tests", async () => {
    // File exists, contains a test_claim_CS_14_ name, but we're asking about
    // claim 13A. This is exactly the real-repo case for 13A / 13B.
    await mkdir(join(projectRoot, "tests"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "canonical-json.test.ts"),
      `it("test_claim_CS_14_rubric_lock", () => {});\n` +
      `it("test_claim_CS_1_something_else", () => {});\n`,
      "utf8",
    );

    const result = await verifyTestFiles(
      "CS-13A",
      ["tests/canonical-json.test.ts"],
      projectRoot,
    );

    expect(result.entries[0]?.reason).toBe("no_matching_claim_name");
  });

  it("test_claim_coverage_verify_distinguishes_13_from_13A", async () => {
    // Critical: a file with test_claim_CS_13_ must NOT satisfy a lookup for
    // claim 13A, and vice versa. The regex uses \\b boundaries on both
    // sides for this reason.
    await mkdir(join(projectRoot, "tests"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "thirteen.test.ts"),
      `it("test_claim_CS_13_parent", () => {});\n`,
      "utf8",
    );

    const forThirteen = await verifyTestFiles("CS-13", ["tests/thirteen.test.ts"], projectRoot);
    expect(forThirteen.entries[0]?.reason).toBe("ok");

    const forThirteenA = await verifyTestFiles("CS-13A", ["tests/thirteen.test.ts"], projectRoot);
    expect(forThirteenA.entries[0]?.reason).toBe("no_matching_claim_name");
  });

  it("test_claim_coverage_verify_rejects_invalid_claim_id", async () => {
    // Injection guard. A future registry with a malformed ID should fail
    // loudly rather than silently build a weird regex.
    await expect(
      verifyTestFiles("3; DROP TABLE", [], projectRoot),
    ).rejects.toThrow(/invalid claim ID/);
  });

  it("test_claim_coverage_verify_returns_entries_in_input_order", async () => {
    await mkdir(join(projectRoot, "tests"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "a.test.ts"),
      `it("test_claim_CS_3_a", () => {});\n`,
      "utf8",
    );
    await writeFile(
      join(projectRoot, "tests", "b.test.ts"),
      `it("test_claim_CS_3_b", () => {});\n`,
      "utf8",
    );

    const result = await verifyTestFiles(
      "CS-3",
      ["tests/b.test.ts", "tests/missing.test.ts", "tests/a.test.ts"],
      projectRoot,
    );

    expect(result.entries.map((e) => e.file)).toEqual([
      "tests/b.test.ts",
      "tests/missing.test.ts",
      "tests/a.test.ts",
    ]);
  });
});

describe("generateReport: fallback-branch verification", () => {
  // For these tests we build a minimal synthetic project: a tests/ dir, a
  // claim_registry.yaml, and the generator's imports. parseClaimRegistry is
  // reused from the real module so the YAML shape stays authoritative.

  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "claim-coverage-report-"));
    await mkdir(join(projectRoot, "tests"), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function writeRegistry(yaml: string): Promise<void> {
    await writeFile(join(projectRoot, "tests", "claim_registry.yaml"), yaml, "utf8");
  }

  it("test_claim_coverage_report_downgrades_implemented_when_testfile_missing", async () => {
    await writeRegistry(`
claims:
  - id: "CS-13A"
    title: "Winner-axis: score threshold"
    status: implemented
    test_files:
      - tests/unit/canonical-json.test.ts
`);
    // Intentionally do NOT create the file.

    const report = await generateReport({ generatedAtUtcMs: 0n, projectRoot });
    const row = report.rows.find((r) => r.claim.id === "CS-13A");

    expect(row?.coverage.kind).toBe("red_missing");
    expect(
      row?.coverage.kind === "red_missing" ? row.coverage.diagnostics : undefined,
    ).toContain("tests/unit/canonical-json.test.ts: listed in registry but not on disk");
  });

  it("test_claim_coverage_report_downgrades_implemented_when_testfile_has_no_matching_name", async () => {
    await writeRegistry(`
claims:
  - id: "CS-13A"
    title: "Winner-axis: score threshold"
    status: implemented
    test_files:
      - tests/unit/canonical-json.test.ts
`);
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "unit", "canonical-json.test.ts"),
      `it("test_claim_CS_14_rubric_lock", () => {});\n`,
      "utf8",
    );

    const report = await generateReport({ generatedAtUtcMs: 0n, projectRoot });
    const row = report.rows.find((r) => r.claim.id === "CS-13A");

    expect(row?.coverage.kind).toBe("red_missing");
    expect(
      row?.coverage.kind === "red_missing" ? row.coverage.diagnostics?.[0] : undefined,
    ).toMatch(/contains no matching test_claim_N_ name/);
  });

  it("test_claim_coverage_report_downgrades_legacy_when_all_testfiles_missing", async () => {
    await writeRegistry(`
claims:
  - id: "CS-6"
    title: "Challenge-window enforcement"
    status: legacy
    rename_target: test_claim_CS_6_challenge_window_enforced
    test_files:
      - tests/legacy/reel-diversity.test.ts
`);

    const report = await generateReport({ generatedAtUtcMs: 0n, projectRoot });
    const row = report.rows.find((r) => r.claim.id === "CS-6");

    expect(row?.coverage.kind).toBe("red_missing");
  });

  it("test_claim_coverage_report_keeps_yellow_legacy_when_some_paths_ok", async () => {
    // Mixed case modeled on Claim 21 in the real registry — one real path,
    // one phantom path. Legacy branch keeps yellow with diagnostics.
    //
    // Subtle: the real file's content must contain `test_claim_CS_21_*` in a
    // form that `verify-test-files.ts` (loose \b-bounded token regex) will
    // find, but that `discover.ts` (strict it/test/describe() call regex)
    // will NOT. Otherwise discovery promotes the claim to the green branch
    // before the legacy fallback ever runs, and this test fails with
    // 'green' instead of 'yellow_legacy'. A bare comment is the simplest
    // construction that satisfies both requirements.
    await writeRegistry(`
claims:
  - id: "CS-21"
    title: "Audit bundle signature"
    status: legacy
    rename_target: test_claim_CS_21_audit_bundle_signature
    test_files:
      - tests/unit/canonical-json.test.ts
      - tests/legacy/event-chain-integrity.test.ts
`);
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "unit", "canonical-json.test.ts"),
      `// test_claim_CS_21_bundle_hash_verifies — covered by a real test once the audit bundle module lands\n`,
      "utf8",
    );

    const report = await generateReport({ generatedAtUtcMs: 0n, projectRoot });
    const row = report.rows.find((r) => r.claim.id === "CS-21");

    expect(row?.coverage.kind).toBe("yellow_legacy");
    if (row?.coverage.kind === "yellow_legacy") {
      expect(row.coverage.tests).toEqual(["tests/unit/canonical-json.test.ts"]);
      expect(row.coverage.diagnostics?.[0]).toMatch(/not on disk/);
    }
  });

  it("test_claim_coverage_report_keeps_green_when_file_exists_and_has_matching_name", async () => {
    await writeRegistry(`
claims:
  - id: "CS-13A"
    title: "Winner-axis: score threshold"
    status: implemented
    test_files:
      - tests/unit/winner-gate.test.ts
`);
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "unit", "winner-gate.test.ts"),
      `it("test_claim_CS_13A_score_threshold_blocks_below_cutoff", () => {});\n`,
      "utf8",
    );

    const report = await generateReport({ generatedAtUtcMs: 0n, projectRoot });
    const row = report.rows.find((r) => r.claim.id === "CS-13A");

    expect(row?.coverage.kind).toBe("green");
  });
});
