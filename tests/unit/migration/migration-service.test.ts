/**
 * Migration service unit tests.
 *
 * Story: T1-S1-D-02, T1-S1-D-03.
 * Claims: CS-11.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  MigrationRecordService,
  InMemoryAuditEventSink,
} from "../../../src/migration/migration-service.js";
import type { MigrationRecordRepository } from "../../../src/migration/migration-repository.js";
import type {
  MigrationRecord,
  MigrationRecordCore,
} from "../../../src/migration/migration-record.js";
import { computeMigrationChecksum } from "../../../src/migration/migration-record.js";
import { REASON_CODES } from "../../../src/errors/reason-codes.js";

class InMemoryRepo implements MigrationRecordRepository {
  rows: MigrationRecord[] = [];
  async insert(
    _client: unknown,
    input: MigrationRecordCore & { migrationChecksum: string; createdAtUtcMs: bigint },
  ): Promise<MigrationRecord> {
    const row: MigrationRecord = {
      ...input,
      migrationId: `mig-${this.rows.length}`,
      affectedEventIds: [...input.affectedEventIds],
    };
    this.rows.push(row);
    return row;
  }
  async findById(_client: unknown, migrationId: string) {
    return this.rows.find((r) => r.migrationId === migrationId) ?? null;
  }
  async listByChallenge(_client: unknown, challengeId: string, opts: { asOfUtcMs?: bigint } = {}) {
    let list = this.rows.filter((r) => r.challengeId === challengeId);
    if (opts.asOfUtcMs !== undefined) {
      const cutoff = opts.asOfUtcMs;
      list = list.filter((r) => r.effectiveAtUtcMs <= cutoff);
    }
    return [...list].sort((a, b) => {
      if (a.effectiveAtUtcMs !== b.effectiveAtUtcMs) {
        return a.effectiveAtUtcMs < b.effectiveAtUtcMs ? -1 : 1;
      }
      return a.migrationId.localeCompare(b.migrationId);
    });
  }
}

const fakePool = {
  connect: async () => ({
    query: async () => ({ rows: [] }),
    release: () => {},
  }),
} as never;

const fakeClock = { nowUtcMs: () => 1_700_000_000_000n };

const validCore: MigrationRecordCore = {
  challengeId: "11111111-1111-1111-1111-111111111111",
  priorRulesetVersion: "ruleset_1.0",
  newRulesetVersion: "ruleset_1.1",
  migrationReason: "Typo fix in scoring weight",
  approverId: "22222222-2222-2222-2222-222222222222",
  effectiveAtUtcMs: 1_700_000_100_000n,
  affectedEventIds: ["ev-1", "ev-2"],
};

describe("MigrationRecordService.create", () => {
  let repo: InMemoryRepo;
  let sink: InMemoryAuditEventSink;
  let svc: MigrationRecordService;

  beforeEach(() => {
    repo = new InMemoryRepo();
    sink = new InMemoryAuditEventSink();
    svc = new MigrationRecordService(fakePool, repo, fakeClock, sink);
  });

  it("test_claim_CS_11_service_computes_checksum_server_side", async () => {
    const row = await svc.create(validCore);
    expect(row.migrationChecksum).toBe(computeMigrationChecksum(validCore));
    expect(row.migrationChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(row.createdAtUtcMs).toBe(1_700_000_000_000n);
  });

  it("test_claim_CS_11_service_rejects_client_supplied_checksum", async () => {
    await expect(
      svc.create(validCore, { clientSuppliedChecksum: "a".repeat(64) }),
    ).rejects.toMatchObject({
      reasonCode: REASON_CODES.MIGRATION_CLIENT_CHECKSUM_REJECTED,
    });
  });

  it("test_claim_CS_11_service_accepts_null_client_checksum_as_if_absent", async () => {
    // `null` should be treated as "client didn't supply one" so the zod path
    // (which sends `undefined` when absent) and a defensive caller (which
    // sends `null`) behave the same.
    const row = await svc.create(validCore, { clientSuppliedChecksum: null });
    expect(row.migrationChecksum).toBe(computeMigrationChecksum(validCore));
  });

  it("test_claim_CS_11_service_rejects_prior_equals_new_ruleset_version", async () => {
    await expect(
      svc.create({ ...validCore, priorRulesetVersion: "ruleset_X", newRulesetVersion: "ruleset_X" }),
    ).rejects.toMatchObject({
      reasonCode: REASON_CODES.MIGRATION_PRIOR_EQUALS_NEW,
    });
  });

  it("test_claim_CS_11_service_rejects_empty_migration_reason", async () => {
    await expect(
      svc.create({ ...validCore, migrationReason: "   " }),
    ).rejects.toThrow(/migration_reason must be non-empty/);
  });

  it("test_claim_CS_11_service_emits_audit_event_on_success", async () => {
    const row = await svc.create(validCore);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      type: "challenge.migration.created",
      migrationId: row.migrationId,
      challengeId: validCore.challengeId,
      priorRulesetVersion: "ruleset_1.0",
      newRulesetVersion: "ruleset_1.1",
      effectiveAtUtcMs: 1_700_000_100_000n,
    });
  });

  it("test_claim_CS_11_service_does_not_emit_audit_event_on_validation_failure", async () => {
    await expect(
      svc.create({ ...validCore, priorRulesetVersion: "x", newRulesetVersion: "x" }),
    ).rejects.toBeDefined();
    expect(sink.events).toHaveLength(0);
  });
});

describe("MigrationRecordService.verify", () => {
  let repo: InMemoryRepo;
  let svc: MigrationRecordService;

  beforeEach(() => {
    repo = new InMemoryRepo();
    svc = new MigrationRecordService(
      fakePool,
      repo,
      fakeClock,
      new InMemoryAuditEventSink(),
    );
  });

  it("test_claim_CS_11_verify_returns_true_for_untampered_row", async () => {
    const row = await svc.create(validCore);
    expect(await svc.verify(row.migrationId)).toBe(true);
  });

  it("test_claim_CS_11_verify_returns_false_for_unknown_id", async () => {
    expect(await svc.verify("nonexistent-id")).toBe(false);
  });

  it("test_claim_CS_11_verify_returns_false_after_simulated_tampering", async () => {
    const row = await svc.create(validCore);
    // Simulate a rogue DBA mutating a field in place via direct SQL.
    const stored = repo.rows.find((r) => r.migrationId === row.migrationId)!;
    stored.migrationReason = "altered post-insert";
    expect(await svc.verify(row.migrationId)).toBe(false);
  });
});

describe("MigrationRecordService.listByChallenge", () => {
  it("test_claim_CS_23_listByChallenge_returns_migrations_in_effective_order_for_replay", async () => {
    const repo = new InMemoryRepo();
    const svc = new MigrationRecordService(
      fakePool,
      repo,
      fakeClock,
      new InMemoryAuditEventSink(),
    );
    // Insert out of order; listByChallenge should sort by effective_at_utc_ms.
    await svc.create({ ...validCore, effectiveAtUtcMs: 1_700_000_300_000n, newRulesetVersion: "ruleset_1.3" });
    await svc.create({ ...validCore, effectiveAtUtcMs: 1_700_000_100_000n, newRulesetVersion: "ruleset_1.1" });
    await svc.create({ ...validCore, effectiveAtUtcMs: 1_700_000_200_000n, newRulesetVersion: "ruleset_1.2" });

    const list = await svc.listByChallenge(validCore.challengeId);
    expect(list.map((r) => r.effectiveAtUtcMs)).toEqual([
      1_700_000_100_000n,
      1_700_000_200_000n,
      1_700_000_300_000n,
    ]);
  });

  it("test_claim_CS_23_listByChallenge_asOfUtcMs_filters_out_future_migrations_for_replay_branching", async () => {
    // This is the Claim 23 branching semantic: when replaying an event at
    // time T, we only apply migrations whose effective_at_utc_ms <= T.
    const repo = new InMemoryRepo();
    const svc = new MigrationRecordService(
      fakePool,
      repo,
      fakeClock,
      new InMemoryAuditEventSink(),
    );
    await svc.create({ ...validCore, effectiveAtUtcMs: 1_700_000_100_000n, newRulesetVersion: "ruleset_1.1" });
    await svc.create({ ...validCore, effectiveAtUtcMs: 1_700_000_200_000n, newRulesetVersion: "ruleset_1.2" });
    await svc.create({ ...validCore, effectiveAtUtcMs: 1_700_000_300_000n, newRulesetVersion: "ruleset_1.3" });

    const list = await svc.listByChallenge(validCore.challengeId, {
      asOfUtcMs: 1_700_000_200_000n,
    });
    // Includes 100k and 200k (inclusive); excludes 300k.
    expect(list.map((r) => r.effectiveAtUtcMs)).toEqual([
      1_700_000_100_000n,
      1_700_000_200_000n,
    ]);
  });
});
