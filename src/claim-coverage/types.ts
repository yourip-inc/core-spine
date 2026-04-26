export type ClaimStatus = "implemented" | "placeholder" | "legacy";

export interface ClaimEntry {
  id: string;              // "1", "13A", "20A", etc.
  title: string;
  status: ClaimStatus;
  testFiles: string[];
  blockedBy?: string;
  renameTarget?: string;
  renameStory?: string;
}

export interface ClaimRegistry {
  claims: ClaimEntry[];
}

/**
 * Status of a claim after matching registry against discovered tests.
 *
 * The `diagnostics` field (audit §4.3) is present when the result kind was
 * reached via the registry-testFiles fallback path AND verification of
 * those files produced failures. The renderer surfaces diagnostics as
 * human-readable messages so counsel can see why a claim was downgraded
 * without re-running the harness.
 */
export type CoverageResult =
  | { kind: "green"; tests: string[]; passingCount: number }
  | { kind: "red_failing"; tests: string[]; failingCount: number }
  | { kind: "red_missing"; diagnostics?: string[] }
  | {
      kind: "yellow_legacy";
      tests: string[];
      renameTarget?: string;
      diagnostics?: string[];
    };

export interface CoverageReportRow {
  claim: ClaimEntry;
  coverage: CoverageResult;
}

export interface CoverageReport {
  generatedAtUtcMs: bigint;
  rows: CoverageReportRow[];
  summary: {
    total: number;
    green: number;
    redFailing: number;
    redMissing: number;
    yellowLegacy: number;
  };
}
