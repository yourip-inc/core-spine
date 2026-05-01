/**
 * Rubric Service.
 *
 * Stories:
 *   T1-S1-A-01  Create tables (see migrations/001_rubrics.sql)
 *   T1-S1-A-02  Enforce weight sum = 10000
 *   T1-S1-A-03  POST /v1/rubrics and GET /v1/rubrics/{rubric_version}
 *
 * Claims: CS-1, CS-14, CS-21.
 */

import type { Pool } from "pg";
import { canonicalBytes } from "../canonical/canonical-json.js";
import { sha256 } from "@noble/hashes/sha256";
import { badRequest, conflict } from "../errors/domain-error.js";
import { REASON_CODES } from "../errors/reason-codes.js";
import type { CreateRubricRequest } from "./rubric-schemas.js";
import type { Rubric, RubricCriterion } from "./rubric-types.js";
import type { RubricRepository } from "./rubric-repository.js";

export interface Clock {
  nowUtcMs(): bigint;
}

export class RubricService {
  constructor(
    private readonly pool: Pool,
    private readonly repo: RubricRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Create (and optionally publish atomically) a new rubric.
   * Enforces weight sum = 10000 at the application layer with a clean reason code,
   * before the DB trigger fires as a backstop.
   */
  async create(req: CreateRubricRequest): Promise<Rubric> {
    const sum = req.criteria.reduce((acc, c) => acc + c.weight_bp, 0);
    if (sum !== 10000) {
      throw badRequest(
        REASON_CODES.RUBRIC_WEIGHT_SUM_INVALID,
        `rubric criteria weight_bp sum is ${sum}, must be exactly 10000 (T1-S1-A-02)`,
        { weight_sum_bp: sum, expected_bp: 10000 },
      );
    }

    // Normalize criteria: assign sort_order if not provided (preserve input order).
    const normalizedCriteria: RubricCriterion[] = req.criteria.map((c, i) => ({
      criterionKey: c.criterion_key,
      displayName: c.display_name,
      weightBp: c.weight_bp,
      scaleMinBp: c.scale_min_bp,
      scaleMaxBp: c.scale_max_bp,
      sortOrder: c.sort_order ?? i,
    }));

    // Reject duplicate criterion_keys at the app layer with a precise error.
    const keys = new Set<string>();
    for (const c of normalizedCriteria) {
      if (keys.has(c.criterionKey)) {
        throw badRequest(
          REASON_CODES.RATING_SCHEMA_DRIFT,
          `duplicate criterion_key: ${c.criterionKey}`,
          { criterion_key: c.criterionKey },
        );
      }
      keys.add(c.criterionKey);
    }

    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      let rubricId: string;
      try {
        const res = await this.repo.create(client, {
          rubricVersion: req.rubric_version,
          name: req.name,
          ...(req.description !== undefined ? { description: req.description } : {}),
          createdAtUtcMs: this.clock.nowUtcMs(),
          criteria: normalizedCriteria,
        });
        rubricId = res.rubricId;
      } catch (err: unknown) {
        if (isPgError(err) && err.code === "23505") {
          // unique_violation on rubric_version
          throw conflict(
            REASON_CODES.RUBRIC_VERSION_UNRESOLVABLE,
            `rubric_version already exists: ${req.rubric_version}`,
            { rubric_version: req.rubric_version },
          );
        }
        throw err;
      }

      // Publish path: compute canonical hash, set published_at + hash, COMMIT.
      // Non-publish path: just COMMIT as draft.
      if (req.publish) {
        const draft = await this.repo.findByVersion(client, req.rubric_version);
        if (!draft) throw new Error("internal: rubric disappeared mid-transaction");
        const hash = computeRubricHash(draft);
        await this.repo.markPublished(client, rubricId, {
          publishedAtUtcMs: this.clock.nowUtcMs(),
          canonicalJsonSha256: hash,
        });
      }

      await client.query("COMMIT");
      committed = true;
    } finally {
      if (!committed) {
        // Either an error was thrown, or we never reached COMMIT. Roll back
        // idempotently — swallow secondary errors since we're already in a
        // failure path and the primary error will propagate.
        await client.query("ROLLBACK").catch(() => { /* secondary; ignore */ });
      }
      client.release();
    }

    // Re-read with a fresh connection for a clean read-your-write
    return this.getByVersionOrThrow(req.rubric_version);
  }

  async getByVersion(rubricVersion: string): Promise<Rubric | null> {
    const client = await this.pool.connect();
    try {
      return await this.repo.findByVersion(client, rubricVersion);
    } finally {
      client.release();
    }
  }

  async getByVersionOrThrow(rubricVersion: string): Promise<Rubric> {
    const r = await this.getByVersion(rubricVersion);
    if (!r) {
      throw badRequest(
        REASON_CODES.RUBRIC_VERSION_UNRESOLVABLE,
        `rubric_version not found: ${rubricVersion}`,
        { rubric_version: rubricVersion },
      );
    }
    return r;
  }
}

/**
 * Compute the canonical hash of a rubric definition.
 * This is the hash that gets locked into the challenge at rubric-lock time
 * and against which every rating event's rubric_version is verified.
 *
 * Note: the hash does NOT include rubric_id, created_at_utc_ms, or
 * published_at_utc_ms — those are bookkeeping fields. The hash is over
 * the SCHEMA, so two rubrics with the same logical schema but different
 * creation timestamps produce the same hash.
 */
export function computeRubricHash(r: Rubric): string {
  const canonical = {
    rubric_version: r.rubricVersion,
    name: r.name,
    ...(r.description !== undefined ? { description: r.description } : {}),
    criteria: [...r.criteria]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        criterion_key: c.criterionKey,
        display_name: c.displayName,
        weight_bp: c.weightBp,
        scale_min_bp: c.scaleMinBp,
        scale_max_bp: c.scaleMaxBp,
        sort_order: c.sortOrder,
      })),
  };
  const bytes = canonicalBytes(canonical);
  const digest = sha256(bytes);
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

interface PgError { code?: string }
function isPgError(e: unknown): e is PgError {
  return typeof e === "object" && e !== null && "code" in e;
}
