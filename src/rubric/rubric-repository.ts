/**
 * Rubric persistence layer. One transactional create, one by-version lookup.
 * No UPDATE paths — rubrics are append-only after publish.
 */

import type { PoolClient } from "pg";
import type { Rubric, RubricCriterion } from "./rubric-types.js";

export interface RubricRepository {
  create(client: PoolClient, input: {
    rubricVersion: string;
    name: string;
    description?: string;
    createdAtUtcMs: bigint;
    criteria: Array<Omit<RubricCriterion, "criterionKey"> & { criterionKey: string }>;
  }): Promise<{ rubricId: string }>;

  markPublished(client: PoolClient, rubricId: string, params: {
    publishedAtUtcMs: bigint;
    canonicalJsonSha256: string;
  }): Promise<void>;

  findByVersion(client: PoolClient, rubricVersion: string): Promise<Rubric | null>;
}

export class PgRubricRepository implements RubricRepository {
  async create(client: PoolClient, input: {
    rubricVersion: string;
    name: string;
    description?: string;
    createdAtUtcMs: bigint;
    criteria: RubricCriterion[];
  }): Promise<{ rubricId: string }> {
    const { rows } = await client.query<{ rubric_id: string }>(
      `INSERT INTO rubrics (rubric_version, name, description, created_at_utc_ms)
       VALUES ($1, $2, $3, $4)
       RETURNING rubric_id`,
      [input.rubricVersion, input.name, input.description ?? null, input.createdAtUtcMs.toString()],
    );
    const rubricId = rows[0]!.rubric_id;

    // Batch-insert criteria. The deferred constraint trigger checks the
    // weight sum at COMMIT, so this loop doesn't need to be ordered.
    for (const c of input.criteria) {
      await client.query(
        `INSERT INTO rubric_criteria
           (rubric_id, criterion_key, display_name, weight_bp, scale_min_bp, scale_max_bp, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [rubricId, c.criterionKey, c.displayName, c.weightBp, c.scaleMinBp, c.scaleMaxBp, c.sortOrder],
      );
    }

    return { rubricId };
  }

  async markPublished(client: PoolClient, rubricId: string, params: {
    publishedAtUtcMs: bigint;
    canonicalJsonSha256: string;
  }): Promise<void> {
    await client.query(
      `UPDATE rubrics
          SET published_at_utc_ms = $2,
              canonical_json_sha256 = $3
        WHERE rubric_id = $1
          AND published_at_utc_ms IS NULL`,
      [rubricId, params.publishedAtUtcMs.toString(), params.canonicalJsonSha256],
    );
  }

  async findByVersion(client: PoolClient, rubricVersion: string): Promise<Rubric | null> {
    const { rows: rubricRows } = await client.query<{
      rubric_id: string;
      rubric_version: string;
      name: string;
      description: string | null;
      created_at_utc_ms: string;
      published_at_utc_ms: string | null;
      canonical_json_sha256: string | null;
    }>(
      `SELECT rubric_id, rubric_version, name, description,
              created_at_utc_ms, published_at_utc_ms, canonical_json_sha256
         FROM rubrics
        WHERE rubric_version = $1`,
      [rubricVersion],
    );
    if (rubricRows.length === 0) return null;
    const r = rubricRows[0]!;

    const { rows: critRows } = await client.query<{
      criterion_key: string;
      display_name: string;
      weight_bp: number;
      scale_min_bp: number;
      scale_max_bp: number;
      sort_order: number;
    }>(
      `SELECT criterion_key, display_name, weight_bp, scale_min_bp, scale_max_bp, sort_order
         FROM rubric_criteria
        WHERE rubric_id = $1
        ORDER BY sort_order ASC`,
      [r.rubric_id],
    );

    const result: Rubric = {
      rubricId: r.rubric_id,
      rubricVersion: r.rubric_version,
      name: r.name,
      createdAtUtcMs: BigInt(r.created_at_utc_ms),
      criteria: critRows.map((c) => ({
        criterionKey: c.criterion_key,
        displayName: c.display_name,
        weightBp: c.weight_bp,
        scaleMinBp: c.scale_min_bp,
        scaleMaxBp: c.scale_max_bp,
        sortOrder: c.sort_order,
      })),
    };
    if (r.description !== null) result.description = r.description;
    if (r.published_at_utc_ms !== null) result.publishedAtUtcMs = BigInt(r.published_at_utc_ms);
    if (r.canonical_json_sha256 !== null) result.canonicalJsonSha256 = r.canonical_json_sha256;
    return result;
  }
}
