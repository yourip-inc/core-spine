/**
 * Claim-coverage generator meta-tests.
 *
 * These tests verify the generator itself, not any patent claim. They use
 * regular it("should ...") naming because tests/meta/ is NOT in the
 * patent-adjacent lint scope.
 */

import { describe, it, expect } from "vitest";
import { parseClaimRegistry } from "../../src/claim-coverage/yaml-parse.js";
import { claimSortKey } from "../../src/claim-coverage/discover.js";
import { renderMarkdown, renderHtml } from "../../src/claim-coverage/render.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY_PATH = join(PROJECT_ROOT, "tests", "claim_registry.yaml");

describe("claim registry parser", () => {
  it("parses the shipping registry and contains 26 entries", async () => {
    const src = await readFile(REGISTRY_PATH, "utf8");
    const reg = parseClaimRegistry(src);
    expect(reg.claims.length).toBe(26);
  });

  it("has entries for all 23 main claims plus 13A, 13B, 20A", async () => {
    const src = await readFile(REGISTRY_PATH, "utf8");
    const reg = parseClaimRegistry(src);
    const ids = reg.claims.map((c) => c.id);
    for (let n = 1; n <= 23; n++) {
      expect(ids).toContain(String(n));
    }
    expect(ids).toContain("13A");
    expect(ids).toContain("13B");
    expect(ids).toContain("20A");
  });

  it("has six legacy entries matching F-04 (claims 6, 7, 8, 9, 16, 18)", async () => {
    const src = await readFile(REGISTRY_PATH, "utf8");
    const reg = parseClaimRegistry(src);
    const legacy = reg.claims.filter((c) => c.status === "legacy").map((c) => c.id).sort();
    expect(legacy).toEqual(["16", "18", "6", "7", "8", "9"].sort());
  });

  it("every legacy claim declares a rename_target and rename_story", async () => {
    const src = await readFile(REGISTRY_PATH, "utf8");
    const reg = parseClaimRegistry(src);
    for (const c of reg.claims.filter((x) => x.status === "legacy")) {
      expect(c.renameTarget).toBeTruthy();
      expect(c.renameStory).toBe("T1-S1-F-04");
    }
  });

  it("rejects an invalid status value", () => {
    const bad = `claims:\n  - id: "1"\n    title: "X"\n    status: banana\n    test_files: []\n`;
    expect(() => parseClaimRegistry(bad)).toThrow(/invalid status/);
  });

  it("rejects duplicate claim ids", () => {
    const bad = `claims:
  - id: "1"
    title: "X"
    status: placeholder
    test_files: []
  - id: "1"
    title: "Y"
    status: placeholder
    test_files: []
`;
    expect(() => parseClaimRegistry(bad)).toThrow(/duplicate claim id/);
  });
});

describe("claim sort key", () => {
  it("orders numeric claims naturally", () => {
    const ids = ["13", "2", "1", "21", "3"];
    ids.sort((a, b) => claimSortKey(a) - claimSortKey(b));
    expect(ids).toEqual(["1", "2", "3", "13", "21"]);
  });

  it("places sub-lettered claims immediately after their parent numeric claim", () => {
    const ids = ["14", "13B", "13", "13A", "20A", "20", "21"];
    ids.sort((a, b) => claimSortKey(a) - claimSortKey(b));
    expect(ids).toEqual(["13", "13A", "13B", "14", "20", "20A", "21"]);
  });
});

describe("report renderers", () => {
  it("renderMarkdown produces deterministic output for frozen timestamp", () => {
    const fakeReport = {
      generatedAtUtcMs: 0n,
      summary: { total: 1, green: 1, redFailing: 0, redMissing: 0, yellowLegacy: 0 },
      rows: [
        {
          claim: {
            id: "1",
            title: "Core Spine integrated service surface",
            status: "implemented" as const,
            testFiles: ["tests/unit/canonical-json.test.ts"],
          },
          coverage: {
            kind: "green" as const,
            tests: ["tests/unit/canonical-json.test.ts"],
            passingCount: 3,
          },
        },
      ],
    };
    const a = renderMarkdown(fakeReport);
    const b = renderMarkdown(fakeReport);
    expect(a).toBe(b);
    expect(a).toContain("# Claim Coverage Report");
    expect(a).toContain("🟢 implemented (3 tests)");
    expect(a).toContain("| 1 | Core Spine integrated service surface |");
  });

  it("renderHtml escapes HTML special characters in claim titles", () => {
    const evil = {
      generatedAtUtcMs: 0n,
      summary: { total: 1, green: 0, redFailing: 0, redMissing: 1, yellowLegacy: 0 },
      rows: [
        {
          claim: {
            id: "99",
            title: "<script>alert('xss')</script>",
            status: "placeholder" as const,
            testFiles: [],
          },
          coverage: { kind: "red_missing" as const },
        },
      ],
    };
    const html = renderHtml(evil);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
