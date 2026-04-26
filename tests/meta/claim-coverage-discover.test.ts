/**
 * Meta-test for the claim-coverage discover walker.
 *
 * Audit §4.1 remediation. Verifies that:
 *   1. Default exclusions skip `tests/meta/`, so ESLint RuleTester fixture
 *      strings are not credited as real patent-claim tests.
 *   2. The exclusion list is configurable.
 *   3. Exclusions are not over-broad — `tests/unit/...` and
 *      `tests/meta-integration/...` are still walked.
 *
 * Lives in tests/meta/ (outside the patent-adjacent lint scope) so these
 * tests can use normal it("should ...") naming. The test names use the
 * `test_claim_coverage_*` prefix so that if this file were ever walked by
 * discover.ts (it shouldn't — that's what we're testing), the discovery
 * regex would NOT credit them as coverage for any numbered patent claim.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverTests, isExcluded } from "../../src/claim-coverage/discover.js";

describe("claim-coverage discover: exclusion", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "claim-coverage-discover-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("test_claim_coverage_discover_excludes_tests_meta_directory", async () => {
    // Arrange: a tests/ tree with a real unit test AND a meta-test whose
    // body contains a synthetic fixture string matching the claim regex.
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });
    await mkdir(join(projectRoot, "tests", "meta"), { recursive: true });

    await writeFile(
      join(projectRoot, "tests", "unit", "real.test.ts"),
      `it("test_claim_1_real_test", () => {});\n`,
      "utf8",
    );
    await writeFile(
      join(projectRoot, "tests", "meta", "rule-fixture.test.ts"),
      // This string IS a literal fixture — mirrors what RuleTester does.
      `const fixture = { code: \`it("test_claim_1_fixture_masquerading_as_test", () => {});\` };\n`,
      "utf8",
    );

    // Act
    const discovered = await discoverTests(
      join(projectRoot, "tests"),
      projectRoot,
    );

    // Assert: only the real test surfaces.
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.testName).toBe("test_claim_1_real_test");
    expect(discovered[0]?.file).toBe("tests/unit/real.test.ts");
  });

  it("test_claim_coverage_discover_excludes_configured_paths", async () => {
    await mkdir(join(projectRoot, "tests", "fixtures"), { recursive: true });
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });

    await writeFile(
      join(projectRoot, "tests", "fixtures", "sample.test.ts"),
      `it("test_claim_3_fixture_data", () => {});\n`,
      "utf8",
    );
    await writeFile(
      join(projectRoot, "tests", "unit", "real.test.ts"),
      `it("test_claim_3_real_test", () => {});\n`,
      "utf8",
    );

    const discovered = await discoverTests(
      join(projectRoot, "tests"),
      projectRoot,
      { exclusions: ["tests/fixtures"] },
    );

    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.file).toBe("tests/unit/real.test.ts");
  });

  it("test_claim_coverage_discover_includes_tests_unit_directory", async () => {
    // Regression guard: default exclusion ["tests/meta"] must NOT match
    // "tests/unit" or any other sibling.
    await mkdir(join(projectRoot, "tests", "unit", "scoring"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "unit", "scoring", "a.test.ts"),
      `it("test_claim_3_included", () => {});\n`,
      "utf8",
    );

    const discovered = await discoverTests(
      join(projectRoot, "tests"),
      projectRoot,
    );

    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.testName).toBe("test_claim_3_included");
  });

  it("test_claim_coverage_discover_does_not_over_exclude_meta_prefix", async () => {
    // Regression guard: "tests/meta" must not also exclude
    // "tests/meta-integration/...". This is the bug that would slip in if
    // someone replaced `startsWith(ex + "/")` with `startsWith(ex)`.
    await mkdir(join(projectRoot, "tests", "meta-integration"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "meta-integration", "b.test.ts"),
      `it("test_claim_10_not_excluded", () => {});\n`,
      "utf8",
    );

    const discovered = await discoverTests(
      join(projectRoot, "tests"),
      projectRoot,
    );

    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.file).toBe("tests/meta-integration/b.test.ts");
  });
});

describe("claim-coverage discover: isExcluded unit", () => {
  // Pure unit check of the prefix-matching helper. Kept separate from the
  // filesystem tests above so the helper logic is easy to reason about.
  it("test_claim_coverage_is_excluded_matches_exact_and_subpaths", () => {
    const ex = ["tests/meta"];
    expect(isExcluded("tests/meta", ex)).toBe(true);
    expect(isExcluded("tests/meta/foo.test.ts", ex)).toBe(true);
    expect(isExcluded("tests/meta/sub/bar.test.ts", ex)).toBe(true);
  });

  it("test_claim_coverage_is_excluded_rejects_sibling_prefix", () => {
    const ex = ["tests/meta"];
    expect(isExcluded("tests/meta-integration/foo.test.ts", ex)).toBe(false);
    expect(isExcluded("tests/metadata.test.ts", ex)).toBe(false);
    expect(isExcluded("tests/unit/foo.test.ts", ex)).toBe(false);
  });
});

// §4.2 — describe() discovery
describe("claim-coverage discover: describe() names", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "claim-coverage-describe-"));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("test_claim_coverage_discover_finds_claim_names_on_describe_blocks", async () => {
    // This is the pattern used in ~8 real test files — the claim name is
    // the describe header and the it() calls inside are behavior descriptions.
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "unit", "a.test.ts"),
      `describe("test_claim_19_rater_weights_scoped_to_challenge", () => {
         it("restores vote mass on per-challenge axis", () => {});
       });`,
      "utf8",
    );

    const discovered = await discoverTests(
      join(projectRoot, "tests"),
      projectRoot,
    );

    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.testName).toBe("test_claim_19_rater_weights_scoped_to_challenge");
    expect(discovered[0]?.claimId).toBe("19");
  });

  it("test_claim_coverage_discover_finds_claim_names_on_describe_only_and_describe_skip", async () => {
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "unit", "a.test.ts"),
      `describe.only("test_claim_14_only_focus", () => {});
       describe.skip("test_claim_14_skip_focus", () => {});`,
      "utf8",
    );

    const discovered = await discoverTests(
      join(projectRoot, "tests"),
      projectRoot,
    );

    const names = discovered.map((d) => d.testName).sort();
    expect(names).toEqual([
      "test_claim_14_only_focus",
      "test_claim_14_skip_focus",
    ]);
  });

  it("test_claim_coverage_discover_finds_both_describe_and_it_names_in_same_file", async () => {
    // Mixed file: one claim-named describe wrapping it() behavior tests,
    // plus a sibling it() that is itself a claim test. Both should surface.
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "unit", "a.test.ts"),
      `describe("test_claim_3_effective_vote_mass_rounds_half_even", () => {
         it("at midpoint, rounds to even", () => {});
       });
       it("test_claim_3_effective_vote_mass_monotonic", () => {});`,
      "utf8",
    );

    const discovered = await discoverTests(
      join(projectRoot, "tests"),
      projectRoot,
    );

    const names = discovered.map((d) => d.testName).sort();
    expect(names).toEqual([
      "test_claim_3_effective_vote_mass_monotonic",
      "test_claim_3_effective_vote_mass_rounds_half_even",
    ]);
  });

  it("test_claim_coverage_discover_does_not_credit_describe_text_that_is_not_a_claim_name", async () => {
    // Group-name describes are the majority case in the repo (53 of 87).
    // The claim-name filter (CLAIM_NAME_RE) must reject them cleanly.
    await mkdir(join(projectRoot, "tests", "unit"), { recursive: true });
    await writeFile(
      join(projectRoot, "tests", "unit", "a.test.ts"),
      `describe("ScoreAggregator WS-1C wiring", () => {
         describe("patent AC boundary cases", () => {
           it("test_claim_3_real_test", () => {});
         });
       });`,
      "utf8",
    );

    const discovered = await discoverTests(
      join(projectRoot, "tests"),
      projectRoot,
    );

    // Only the real claim-named it() surfaces. The two group-name describes
    // are matched by the TEST_NAME_RE alternation but filtered out by
    // CLAIM_NAME_RE's stricter shape.
    expect(discovered).toHaveLength(1);
    expect(discovered[0]?.testName).toBe("test_claim_3_real_test");
  });
});
