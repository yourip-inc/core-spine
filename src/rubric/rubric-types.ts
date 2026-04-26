/**
 * Rubric domain types.
 * Shapes in this file are the source of truth for WS-1A. Downstream tracks
 * (T5 scoring, T6 rubric widget) consume the same rubric_version and
 * criterion_key values; changing any field name here is a contract change.
 */

export interface RubricCriterion {
  criterionKey: string;       // e.g., "technical_execution" — stable, [a-z][a-z0-9_]{1,63}
  displayName: string;
  weightBp: number;           // basis points (0..10000); per-rubric sum = 10000
  scaleMinBp: number;         // default 0
  scaleMaxBp: number;         // default 10000
  sortOrder: number;          // stable ordering for UI
}

export interface Rubric {
  rubricId: string;           // UUID
  rubricVersion: string;      // e.g., "rubric_1.0"
  name: string;
  description?: string;
  createdAtUtcMs: bigint;
  publishedAtUtcMs?: bigint;  // set at publish; once set, rubric is immutable
  canonicalJsonSha256?: string; // hex; computed at publish time
  criteria: RubricCriterion[];
}

export interface NewRubricInput {
  rubricVersion: string;
  name: string;
  description?: string;
  criteria: Array<Omit<RubricCriterion, "sortOrder"> & { sortOrder?: number }>;
  publish: boolean;  // if true, publish atomically with creation
}
