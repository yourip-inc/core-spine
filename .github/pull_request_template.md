<!--
PR template. Story: T1-S1-G-02.
Every PR that touches patent-adjacent paths MUST fill in the "Claim citation"
section below. PCO review is required for patent-adjacent changes (see
CODEOWNERS).
-->

## Summary

<!-- One-to-three sentences. What does this PR change, and why? -->

## Claim citation (required for patent-adjacent PRs)

<!--
Patent-adjacent paths include: src/canonical, src/rubric, src/rating,
src/challenge, src/scoring, src/migration, src/submission, src/errors/reason-codes.ts,
migrations/, tests/unit/ mirrors of the above, openapi/, docs/patent/.

If NONE of these paths are touched, write "Not applicable — non-patent-adjacent change."
and skip the rest of this section.

Otherwise fill in:
-->

- **Claim(s) implemented or affected:** <!-- e.g. 3, 14 -->
- **Story ID:** <!-- e.g. T1-S1-B-02 -->
- **Test(s) added/updated:** <!-- list test file paths and `test_claim_N_*` names -->
- **Traceability doc entry updated?** [ ] Yes (required before merge if patent-adjacent)

### Interpretation notes
<!--
If this PR resolves an ambiguity from the claim-ambiguity log, cite:
  - Ambiguity log ID (e.g. AMB-T1-001)
  - Counsel sign-off commit / date
If this PR introduces a NEW interpretation choice that hasn't gone through
counsel, raise it at the next sync BEFORE merging. Note the next sync date
in this section.
-->

## Testing

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run lint` (includes `claim-test-naming` + `no-filmer-outside-alias`)
- [ ] `npm run claim-coverage:report` — no previously-green claim turned red

## Documentation

- [ ] Reason codes added/changed? Reason-code catalog in `src/errors/reason-codes.ts` updated and PCO-reviewed (see T1-S1-G-02 checklist).
- [ ] OpenAPI schema changed? `openapi/core-spine.yaml` updated.
- [ ] SMR or API-contract section changed? `docs/scoring-model-requirements.md` updated.

## Hotfix exception

<!--
If this is an emergency hotfix and normal PCO review cannot be obtained in time,
check the box and describe. The fix must be followed by a retro-PR within 2
business days documenting the claim interpretation with counsel sign-off.

Hotfix policy is defined in docs/patent/counsel-sync.md §5.
-->
- [ ] Emergency hotfix (PCO review will follow within 2 business days)
  - Emergency justification:
  - Retro-PR target date:
