/**
 * Migration record checksum unit tests.
 *
 * Story: T1-S1-D-02.
 * Patent Claim CS-11 (migration record with checksum).
 */

import { describe, it, expect } from "vitest";
import {
  computeMigrationChecksum,
  verifyMigrationChecksum,
  type MigrationRecord,
  type MigrationRecordCore,
} from "../../../src/migration/migration-record.js";

const baseCore: MigrationRecordCore = {
  challengeId: "11111111-1111-1111-1111-111111111111",
  priorRulesetVersion: "ruleset_1.0",
  newRulesetVersion: "ruleset_1.1",
  migrationReason: "Typo fix in scoring weight",
  approverId: "22222222-2222-2222-2222-222222222222",
  effectiveAtUtcMs: 1_700_000_000_000n,
  affectedEventIds: ["ev-b", "ev-a", "ev-c"],
};

function withStored(core: MigrationRecordCore): MigrationRecord {
  return {
    ...core,
    migrationId: "33333333-3333-3333-3333-333333333333",
    migrationChecksum: computeMigrationChecksum(core),
    createdAtUtcMs: 1_700_000_000_500n,
  };
}

describe("computeMigrationChecksum", () => {
  it("test_claim_CS_11_migration_record_has_seven_fields_in_checksum", () => {
    // The checksum should change if any of the seven Claim-11 fields change.
    // This is a property guard — exercise each field.
    const ref = computeMigrationChecksum(baseCore);
    const mutations: Array<[string, MigrationRecordCore]> = [
      ["challengeId",        { ...baseCore, challengeId: "44444444-4444-4444-4444-444444444444" }],
      ["priorRulesetVersion", { ...baseCore, priorRulesetVersion: "ruleset_0.9" }],
      ["newRulesetVersion",   { ...baseCore, newRulesetVersion: "ruleset_1.2" }],
      ["migrationReason",     { ...baseCore, migrationReason: "Different reason" }],
      ["approverId",          { ...baseCore, approverId: "55555555-5555-5555-5555-555555555555" }],
      ["effectiveAtUtcMs",    { ...baseCore, effectiveAtUtcMs: 1_700_000_000_001n }],
      ["affectedEventIds",    { ...baseCore, affectedEventIds: ["ev-a", "ev-b", "ev-d"] }],
    ];
    for (const [label, mutated] of mutations) {
      expect(computeMigrationChecksum(mutated), `${label} should affect checksum`).not.toBe(ref);
    }
  });

  it("test_claim_CS_11_migration_checksum_is_deterministic_across_repeated_calls", () => {
    const a = computeMigrationChecksum(baseCore);
    const b = computeMigrationChecksum(baseCore);
    const c = computeMigrationChecksum(baseCore);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("test_claim_CS_11_migration_checksum_is_independent_of_affected_event_ids_order", () => {
    const forward  = computeMigrationChecksum({ ...baseCore, affectedEventIds: ["ev-a", "ev-b", "ev-c"] });
    const reverse  = computeMigrationChecksum({ ...baseCore, affectedEventIds: ["ev-c", "ev-b", "ev-a"] });
    const shuffled = computeMigrationChecksum({ ...baseCore, affectedEventIds: ["ev-b", "ev-c", "ev-a"] });
    expect(forward).toBe(reverse);
    expect(reverse).toBe(shuffled);
  });

  it("test_claim_CS_11_migration_checksum_excludes_created_at_and_migration_id", () => {
    // Two records with identical Claim-11 cores but different IDs / timestamps
    // must hash identically.
    const a = withStored(baseCore);
    const b: MigrationRecord = {
      ...baseCore,
      migrationId: "99999999-9999-9999-9999-999999999999",
      migrationChecksum: computeMigrationChecksum(baseCore),
      createdAtUtcMs: 9_999_999_999_999n,
    };
    expect(a.migrationChecksum).toBe(b.migrationChecksum);
  });

  it("test_claim_CS_11_migration_checksum_handles_empty_affected_event_ids", () => {
    const empty = { ...baseCore, affectedEventIds: [] };
    const sum = computeMigrationChecksum(empty);
    expect(sum).toMatch(/^[0-9a-f]{64}$/);
    expect(sum).not.toBe(computeMigrationChecksum(baseCore));
  });
});

describe("verifyMigrationChecksum", () => {
  it("test_claim_CS_11_verify_returns_true_for_untampered_row", () => {
    const row = withStored(baseCore);
    expect(verifyMigrationChecksum(row)).toBe(true);
  });

  it("test_claim_CS_11_checksum_detects_tampering", () => {
    const row = withStored(baseCore);
    // Simulate a rogue UPDATE: mutate migrationReason but keep the original
    // checksum. Verification must return false.
    const tampered: MigrationRecord = { ...row, migrationReason: "altered post-insert" };
    expect(verifyMigrationChecksum(tampered)).toBe(false);
  });

  it("test_claim_CS_11_checksum_detects_tampering_on_effective_at", () => {
    const row = withStored(baseCore);
    const tampered: MigrationRecord = {
      ...row,
      effectiveAtUtcMs: row.effectiveAtUtcMs + 1n,
    };
    expect(verifyMigrationChecksum(tampered)).toBe(false);
  });

  it("test_claim_CS_11_checksum_detects_tampering_on_affected_event_ids", () => {
    const row = withStored(baseCore);
    const tampered: MigrationRecord = {
      ...row,
      affectedEventIds: [...row.affectedEventIds, "ev-sneaky"],
    };
    expect(verifyMigrationChecksum(tampered)).toBe(false);
  });
});
