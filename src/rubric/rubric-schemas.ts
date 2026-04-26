/**
 * Wire-format validation schemas for Rubric endpoints.
 *
 * Tight by design: unknown fields are rejected (strict mode), strings are
 * bounded, numbers are integer-only and range-checked. This is the first line
 * of defense for canonical-JSON invariants — anything that gets past these
 * schemas is safe to hand to the canonical-json serializer.
 */

import { z } from "zod";

const criterionKeyRe = /^[a-z][a-z0-9_]{1,63}$/;
const rubricVersionRe = /^rubric_[0-9]+\.[0-9]+(\.[0-9]+)?$/;

export const CriterionInputSchema = z.object({
  criterion_key: z.string().regex(criterionKeyRe, "must match ^[a-z][a-z0-9_]{1,63}$"),
  display_name: z.string().min(1).max(200),
  weight_bp: z.number().int().min(0).max(10000),
  scale_min_bp: z.number().int().min(0).max(10000).default(0),
  scale_max_bp: z.number().int().min(1).max(10000).default(10000),
  sort_order: z.number().int().min(0).max(1000).optional(),
}).strict();

export const CreateRubricSchema = z.object({
  rubric_version: z.string().regex(rubricVersionRe, "must match ^rubric_N.N(.N)?$"),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  criteria: z.array(CriterionInputSchema).min(1).max(64),
  publish: z.boolean().default(false),
}).strict();

export type CreateRubricRequest = z.infer<typeof CreateRubricSchema>;
