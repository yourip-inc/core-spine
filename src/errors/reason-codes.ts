/**
 * Core Spine reason codes.
 *
 * Engineering PRD §6.6 (Starter Reason-Code Catalog): "Reason codes are stable,
 * enumerated strings. Adding a new reason code is an event that must be recorded;
 * renaming a reason code is prohibited."
 *
 * Adding codes here requires a PR with PCO sign-off per T1-S1-G-02.
 */
export const REASON_CODES = {
  // Rating Service
  RATING_SIG_INVALID:          "RATING_SIG_INVALID",
  RATER_ROLE_NOT_ALLOWED:      "RATER_ROLE_NOT_ALLOWED",
  RUBRIC_VERSION_MISMATCH:     "RUBRIC_VERSION_MISMATCH",
  RATING_SCHEMA_DRIFT:         "RATING_SCHEMA_DRIFT",
  DUPLICATE_RATER_DOWNWEIGHT:  "DUPLICATE_RATER_DOWNWEIGHT",
  COORDINATION_BURST_CAPPED:   "COORDINATION_BURST_CAPPED",

  // Score Aggregator
  CONFIDENCE_LOWER_BOUND_FAIL: "CONFIDENCE_LOWER_BOUND_FAIL",

  // Monetization / Payout
  RIGHTS_HOLD:                 "RIGHTS_HOLD",
  AD_EVENT_PARTIAL:            "AD_EVENT_PARTIAL",
  ESCROW_PENDING:              "ESCROW_PENDING",
  PAYOUT_RULESET_MISMATCH:     "PAYOUT_RULESET_MISMATCH",

  // Idempotency
  IDEMPOTENCY_REPLAY:          "IDEMPOTENCY_REPLAY",

  // --- WS-1A additions (Sprint 1) ---
  // Rubric validation failures. New codes added in Sprint 1 per WS-1A acceptance.
  RUBRIC_WEIGHT_SUM_INVALID:   "RUBRIC_WEIGHT_SUM_INVALID",    // T1-S1-A-02
  RUBRIC_VERSION_UNRESOLVABLE: "RUBRIC_VERSION_UNRESOLVABLE",  // T1-S1-A-04
  RUBRIC_CRITERION_UNKNOWN:    "RUBRIC_CRITERION_UNKNOWN",     // T1-S1-A-05
  RUBRIC_CRITERION_MISSING:    "RUBRIC_CRITERION_MISSING",     // T1-S1-A-05

  // --- WS-1B additions (Sprint 1) ---
  // Scoring / effective vote mass / stability / winner gate.
  EFFECTIVE_VOTE_MASS_ZERO_RATERS: "EFFECTIVE_VOTE_MASS_ZERO_RATERS", // T1-S1-B-02
  STABILITY_SCORE_BELOW_THRESHOLD: "STABILITY_SCORE_BELOW_THRESHOLD", // T1-S1-B-04
  SCORE_BELOW_THRESHOLD:           "SCORE_BELOW_THRESHOLD",           // T1-S1-B-04

  // --- WS-1C additions (Sprint 1) ---
  // Rater event weights / engagement signals.
  RATER_WEIGHT_DEFAULTED:          "RATER_WEIGHT_DEFAULTED",          // T1-S1-C-04

  // --- WS-1D additions (Sprint 1) ---
  // Migration record / Claim 11.
  MIGRATION_PRIOR_EQUALS_NEW:      "MIGRATION_PRIOR_EQUALS_NEW",      // T1-S1-D-03
  MIGRATION_CHECKSUM_INVALID:      "MIGRATION_CHECKSUM_INVALID",      // T1-S1-D-02
  MIGRATION_CLIENT_CHECKSUM_REJECTED: "MIGRATION_CLIENT_CHECKSUM_REJECTED", // T1-S1-D-03
  MIGRATION_REASON_EMPTY:          "MIGRATION_REASON_EMPTY",          // T1-S1-D-03
  CHALLENGE_ID_UNRESOLVABLE:       "CHALLENGE_ID_UNRESOLVABLE",       // T1-S1-D-03

  // --- T2 Sprint 1 — WS-2A additions (Grom Profiles, claim 14) ---
  // Adding codes here requires a PR with PCO sign-off per T1-S1-G-02.
  GUARDIAN_PAYLOAD_INVALID:        "GUARDIAN_PAYLOAD_INVALID",        // T2-S1-A-01
  // GUARDIAN_DUPLICATE_CONTACT — PCO-pending; lands in follow-up
  // commit on this branch after the next PCO sync. See PR #4 description.
} as const;

export type ReasonCode = typeof REASON_CODES[keyof typeof REASON_CODES];
