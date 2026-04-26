# Patent Counsel Sync — Process Document

**Owner:** Patent Conformance Officer (PCO)
**Story:** T1-S1-G-01
**Scope:** T1 Sprint 1 and ongoing through Sprint 2.

## 1. Weekly sync cadence

- **Frequency:** Every Thursday, 30 minutes.
- **Attendees:** PCO, Patent Counsel Liaison, plus invited engineering lead when a workstream-blocking ambiguity is on the agenda.
- **Agenda template:**
  1. Ambiguity log review — any new entries since last sync.
  2. Resolved-last-week retrospective — counsel sign-offs recorded.
  3. Upcoming workstream preview — identify likely interpretation points.
  4. PR queue spot-check — any PRs waiting on counsel input.
- **Notes:** Published in shared drive under `patent/counsel-sync-notes/YYYY-MM-DD.md` by EOD Thursday.

## 2. Claim-ambiguity escalation SLA

| Phase | SLA | Owner |
|---|---|---|
| Engineer discovers ambiguity | — | Engineer |
| Engineer raises to PCO | Within **1 business day** of discovery | Engineer |
| PCO triages (blocking vs non-blocking) | Same day of receipt | PCO |
| PCO raises to counsel (if blocking) | **Same business day** as triage | PCO |
| PCO raises to counsel (if non-blocking) | Within **3 business days** | PCO |
| Counsel initial response | Target: 2 business days | Counsel liaison |
| Resolution committed to traceability doc | Within 1 business day of counsel sign-off | PCO |

**"Blocking"** = the ambiguity prevents an open story from being merged without guessing at interpretation. Everything else is non-blocking.

## 3. How to raise an ambiguity

1. **Engineer:** File an issue on the internal tracker with label `patent-ambiguity`, subject `[Claim N] <one-line summary>`. Body must include:
   - Claim number(s) affected.
   - Story ID (if any) being blocked.
   - The specific interpretation question, framed as A-or-B.
   - What the engineer would do if forced to decide today, and why.
   - Code/doc references (file path, commit SHA if applicable).
2. **Engineer:** Tag the PCO.
3. **PCO:** Within 1 business day, triage as blocking / non-blocking and update the ambiguity log in `docs/patent/claim-traceability.md`.

## 4. Ambiguity log

Lives in `docs/patent/claim-traceability.md` under the "Ambiguity log" section. Every entry has:

| Field | Example |
|---|---|
| Log ID | `AMB-T1-001` |
| Raised date | `2026-04-15` |
| Raised by | `@engineer-handle` |
| Claim(s) | 3, 17 |
| Story | `T1-S1-B-04` |
| Status | `open` / `resolved` / `deferred` |
| Summary | One-sentence framing |
| Resolution | Counsel sign-off text |
| Counsel sign-off date | `2026-04-17` |
| Commit reference | `core-spine@a1b2c3d` |

## 5. When counsel is out of reach

If counsel liaison is unavailable for more than 3 business days on a blocking ambiguity:
1. PCO writes the best-defensible interpretation into the traceability doc with status `deferred (counsel unavailable)`.
2. The engineering team implements against that interpretation.
3. The ambiguity moves to the next counsel sync for retroactive confirmation or correction.
4. If counsel later overturns the interpretation, the corrective PR carries the label `patent-retro-correction` and is expedited through review.

## 6. Sprint exit

Every sprint's exit review (see T1-S1-G-04) must verify:
- All ambiguity entries from the sprint are either `resolved` or explicitly `deferred` with owner and target sprint.
- The traceability doc gate claims are either green or documented as a miss (see exit memo template).

## First sync reference

The first sync of T1 Sprint 1 should be held in week 1 of the sprint. Recorded in `patent/counsel-sync-notes/<date>.md` with attendees list and the initial Sprint 1 claim-priority table.
