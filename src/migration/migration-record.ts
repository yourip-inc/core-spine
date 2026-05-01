/**
 * Migration Record — types and canonical checksum.
 *
 * Story: T1-S1-D-01 through D-03.
 * Patent claims: CS-11 (migration record with checksum), CS-22 (payout verification
 * inputs), CS-23 (migration replay branching at recomputation time).
 *
 * The migration_checksum is sha-256 over the canonical JSON of the seven
 * Claim CS-11 fields plus challenge_id. The computation is the AUTHORITY for the
 * system — the DB plpgsql version is a secondary audit helper only (see
 * migrations/007_challenge_migrations_reconstruction.sql).
 *
 * Fields included in the checksum (in lex-sorted key order):
 *   affected_event_ids, approver_id, challenge_id, effective_at_utc_ms,
 *   migration_reason, new_ruleset_version, prior_ruleset_version
 *
 * Fields EXCLUDED from the checksum (D-02 spec):
 *   migration_checksum itself (chicken-and-egg)
 *   created_at_utc_ms (not part of Claim CS-11; bookkeeping only)
 *   migration_id (bookkeeping)
 */

import { canonicalBytes, type CanonicalValue } from "../canonical/canonical-json.js";
import { sha256 } from "@noble/hashes/sha256";

/** Seven Claim CS-11 fields plus challenge_id; migration_id and created_at_utc_ms live alongside. */
export interface MigrationRecordCore {
  challengeId: string;
  priorRulesetVersion: string;
  newRulesetVersion: string;
  migrationReason: string;
  approverId: string;
  effectiveAtUtcMs: bigint;
  affectedEventIds: readonly string[];
}

export interface MigrationRecord extends MigrationRecordCore {
  migrationId: string;
  migrationChecksum: string;   // 64-char lowercase hex
  createdAtUtcMs: bigint;
}

/**
 * Compute migration_checksum from the core fields.
 * PATENT-CRITICAL: identical core inputs → byte-identical checksum across
 * processes, OSes, and deployments. Any drift breaks Claim CS-22 replay.
 *
 * Sorting rules:
 *   - affected_event_ids is sorted lex before hashing (caller-supplied order
 *     is not semantically meaningful).
 *   - All object keys are sorted by canonicalBytes (canonical-json module).
 */
export function computeMigrationChecksum(core: MigrationRecordCore): string {
  // Sort affected_event_ids deterministically.
  const sortedEvents = [...core.affectedEventIds].sort();

  const canonical: CanonicalValue = {
    affected_event_ids: sortedEvents,
    approver_id: core.approverId,
    challenge_id: core.challengeId,
    effective_at_utc_ms: core.effectiveAtUtcMs,     // BigInt — canonical-json serializes as decimal digits
    migration_reason: core.migrationReason,
    new_ruleset_version: core.newRulesetVersion,
    prior_ruleset_version: core.priorRulesetVersion,
  };

  const bytes = canonicalBytes(canonical);
  const digest = sha256(bytes);
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * Recompute checksum from a stored row's fields and compare to its stored
 * migration_checksum. Returns true iff the row is untampered.
 *
 * Used by replay pre-check and by integration tests that want to exercise
 * the tamper-detection path (manual UPDATE → verify returns false).
 */
export function verifyMigrationChecksum(row: MigrationRecord): boolean {
  const expected = computeMigrationChecksum({
    challengeId: row.challengeId,
    priorRulesetVersion: row.priorRulesetVersion,
    newRulesetVersion: row.newRulesetVersion,
    migrationReason: row.migrationReason,
    approverId: row.approverId,
    effectiveAtUtcMs: row.effectiveAtUtcMs,
    affectedEventIds: row.affectedEventIds,
  });
  return expected === row.migrationChecksum;
}
