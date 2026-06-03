# QA Validation Plan: BOM Workbench Release Gate And Resubmit

Scope: BOM workbench release gate coverage, single pending review rule, and rejected draft resubmission.

## Validation Scope

- Verify release approval blocks missing child items.
- Verify release approval blocks child submissions in `Pending`, `Rejected`, and `Obsolete`.
- Verify release approval blocks a child revision that is not the latest `Released` revision.
- Verify the gate response includes actionable issue details: issue code, child status, or latest released revision where applicable.
- Verify the same parent item and revision cannot have two simultaneous `PendingReview` BOM drafts.
- Verify a `Rejected` draft can be edited in place and resubmitted.
- Verify resubmission preserves review history and increments `review_attempt`.
- Verify a resubmitted draft can be approved when its child references pass release gate.

## User-Critical Flow

1. Engineer creates or revises a BOM draft.
2. Engineer submits the draft for manager review.
3. Manager approval runs release gate before creating a Released Snapshot.
4. Invalid children are blocked with clear issue details.
5. Manager can reject a draft; Engineer can edit the same draft and resubmit without losing rejection history.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Pending child becomes released BOM | Gate only checks item existence | Manufacturing may consume unreleased child | Pending child approval attempt | High | Expect HTTP 409 and `child_not_released` with `Pending` |
| Rejected child becomes released BOM | Gate ignores child status | Rejected design enters formal BOM | Rejected child approval attempt | High | Expect HTTP 409 and `child_not_released` with `Rejected` |
| Obsolete child becomes released BOM | Gate does not block old status | Procurement may buy obsolete part | Obsolete child approval attempt | High | Expect HTTP 409 and `child_not_released` with `Obsolete` |
| Old released revision passes | Gate checks only released status | BOM freezes an outdated child revision | Rev A / Rev B released fixture | High | Expect `child_outdated_revision` and latest revision `B` |
| Two pending reviews conflict silently | Unique index error leaks | RD cannot understand why submit failed | Two drafts same parent/revision | Medium | Expect `BOM_PENDING_REVIEW_EXISTS` |
| Rejected draft cannot be reused | Mutable-state rules too strict | Engineer must clone or rebuild BOM | Rejected save + resubmit | Medium | Assert PATCH succeeds after reject |
| Review history lost on resubmit | Resubmit overwrites prior review | Audit and manager context weak | Review row count and attempt query | High | Assert two review rows and `review_attempt = 2` |

## Test Cases

- `TC-BOM-GATE-001`: Engineer and manager login succeed.
- `TC-BOM-GATE-002`: Missing child item blocks manager approval.
- `TC-BOM-GATE-003`: Pending child submission blocks manager approval.
- `TC-BOM-GATE-004`: Rejected child submission blocks manager approval.
- `TC-BOM-GATE-005`: Obsolete child submission blocks manager approval.
- `TC-BOM-GATE-006`: Rev A child blocks when Rev B is the latest Released revision.
- `TC-BOM-GATE-007`: Second PendingReview for same parent item and revision returns `BOM_PENDING_REVIEW_EXISTS`.
- `TC-BOM-GATE-008`: Manager rejects review and draft becomes `Rejected`.
- `TC-BOM-GATE-009`: Rejected draft can be saved in place and resubmitted.
- `TC-BOM-GATE-010`: Resubmission increments `review_attempt` and preserves rejected review history.
- `TC-BOM-GATE-011`: Manager approves resubmitted draft after gate passes.
- `TC-BOM-GATE-012`: TypeScript, lint, build, and diff whitespace checks pass.

## Data Requirements

- Demo Engineer and Manager accounts.
- Running local Next server with `PDM_BASE_URL`.
- SQLite database initialized from `db/schema.sql`.
- Temporary submissions for child states: `Pending`, `Rejected`, `Obsolete`, `Released Rev A`, `Released Rev B`.
- Temporary parent assembly submissions with CAD references feeding BOM draft creation.

## Pass Criteria

- `npm.cmd run qc:bom-workbench-release-gate-resubmit` passes with zero failed checks.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0.
- `git diff --check` exits 0 or reports CRLF warnings only.
- Dev server test port is cleaned up after validation.

## Evidence To Collect

- QC script JSON result with total/pass/fail counts.
- HTTP 409 release gate responses for missing, Pending, Rejected, Obsolete, and outdated child revision.
- HTTP 400 `BOM_PENDING_REVIEW_EXISTS` response.
- Rejected draft save and resubmit evidence.
- DB evidence for `review_attempt = 2` and preserved rejected review row.
- Successful approval response after resubmission.
