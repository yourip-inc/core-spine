<!--
  Drop-in entry for docs/patent/claim-traceability.md.
  Two parts:
    1. A new row appended to the "Ambiguity log" table (§ line ~78 in current doc).
    2. A "Detail: AMB-T1-004" subsection appended AFTER the table, before "Change log."
  The detail block is unusual for this log — every existing entry fits in the
  row — but the scope of this ambiguity (registry-wide renumbering) does not
  compress to a single cell without losing the evidence counsel will need.
-->

## Row to append to the Ambiguity log table

| AMB-T1-004 | 2026-04-22 | PCO (audit-initiated) | Registry-wide; demonstrable on 1, 2, 14, 15 | **open (blocking)** | Two claim-numbering systems are in simultaneous use across the repo: the Jira Sprint 1 CSVs and `test_claim_N_*` symbols in the code use one numbering; `claim_registry.yaml`, `claim-traceability.md`, and `sprint-1-exit-memo.md` use another. The same integer refers to different patent claims depending on which artifact is read. Which numbering is canonical for Core Spine — (A) the filed non-provisional as-numbered, or (B) the numbering currently embedded in the Jira sprint plan and test symbols? | *(pending counsel sign-off — see Detail block below)* | *(pending)* | `<pending>` |

---

## Detail: AMB-T1-004 — Claim-numbering reconciliation

**Raised by:** PCO, following the T1 Patent-Conformance Audit dated 2026-04-22 (§3, CRITICAL).
**Raised date:** 2026-04-22.
**Status:** `open (blocking)` — blocks PCO signature on `sprint-1-exit-memo.md §8` per `counsel-sync.md §6` sprint-exit checklist.
**Escalation:** Blocking per `counsel-sync.md §2` — PCO to raise to counsel same business day.

### The interpretation question

Two numbering systems for the patent claims are in parallel use in this repository with no declared source of truth between them. The same claim number refers to different underlying patent claims depending on which artifact is consulted:

| Claim # | `claim_registry.yaml` title (System A) | Jira CSV / test-code usage (System B) |
|---|---|---|
| 1 | Core Spine integrated service surface | Challenge lifecycle (8 Jira stories under claim-1 label) |
| 2 | Submission registry with cryptographic hashes | Engagement-signal bounded weights (17 `test_claim_2_*` tests in `bounded-weight.test.ts`, `signal-ingestion.test.ts`) |
| 14 | Canonical hashing, integer-only payloads, rubric lock | Stability score + effective-vote-mass column migration (Jira claim-14 stories) |
| 15 | Append-only event store integrity | Rubric tables + `POST /v1/rubrics` (WS-1A-01, WS-1A-03 Jira claim-15 label) |

Additional evidence: `tests/unit/scoring/signal-ingestion.test.ts` header comment reads *"Claims: 2 (engagement signals), 19 (per-challenge scoping)"* — a third divergent reading of Claim 2 embedded in the test source itself.

### Why it is blocking

Under the current claim-coverage harness behavior (`src/claim-coverage/generate-report.ts`), Claim 2 would render **GREEN** with 17 discovered tests. The exit memo classifies Claim 2 as **RED** (a documented gate miss). Those two outputs are generated from the same repository by two artifacts that are supposed to agree. Counsel cannot rely on either document as evidence of what was delivered against which patent claim until the numbering is reconciled.

More broadly: of the six claims the exit memo marks green, only Claims 3, 10, and 11 align cleanly across the registry, the Jira CSV, and the test code. The remaining three gate-green claims (1, 14, 19) and two of the three gate-red claims (2, 15) have conceptual mismatches of varying severity.

### PCO recommendation (per `counsel-sync.md §3` "what you would do if forced to decide today")

Adopt **Option A**: the numbering used in the **filed non-provisional as-numbered** is canonical. Rationale:

1. Any prosecution correspondence, office actions, or continuations will reference the non-provisional's numbering. An internal system of record that disagrees with the filing forces perpetual translation and creates a risk of a filing-level error under time pressure.
2. `claim_registry.yaml` and `claim-traceability.md` already track Option A; the divergence is fixable by relabeling code and Jira artifacts, which are internal.
3. The Jira sprint plan's numbering appears to derive from an earlier draft or a provisional's numbering; it has no downstream audience outside the engineering team.

### Out-of-scope (to avoid scope creep on this entry)

- Whether Jira label history needs to be preserved as a forensic record. PCO view: no — the CSV pack is the authoritative planning artifact and will be regenerated against canonical numbering.
- Whether the T1 track-numbering alignment (addressed in `YouRip_AlignmentReport.md`) needs a parallel ambiguity entry. PCO view: no — that document already reconciles track numbers and is internally consistent.

### Resolution plan (pending counsel confirmation of Option A)

Tracked separately because the work is mechanical once the decision is signed:

1. Rename every `test_claim_N_*` symbol in files using non-canonical numbering.
2. Update each test-file header comment to cite the canonical claim number.
3. Rewrite every `claim-N` label in `YouRip_T1_Sprint1_Epics.csv`, `YouRip_T1_Sprint1_Stories.csv`, and the consolidated/enriched variants.
4. Update `claim_registry.yaml` entries that were authored against a draft number, if any are identified during relabel.
5. Re-run `npm run claim-coverage:report` and confirm the "6 of 9 green" assertion reproduces — or, if it does not, amend the exit memo before signature.
6. Retro counsel sync on the corrected matrix: whatever was previously approved on the basis of Claim 2 / Claim 15 coverage does not in fact have the coverage those approvals implied, and needs to be walked again.

### Counsel sign-off

- [ ] Counsel confirms Option A (filed non-provisional as-numbered is canonical).
- [ ] Counsel confirms retro review will be scheduled on the relabeled matrix before Sprint 2 opens.
- [ ] PCO records sign-off date and commit SHA in the Ambiguity log row above.

**Counsel sign-off date:** *(pending)*
**Commit reference:** `<pending>`
