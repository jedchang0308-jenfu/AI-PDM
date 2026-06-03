# QA Validation Plan: BOM Workbench Review Release

Scope: BOM workbench review submission, manager approval/rejection, release snapshot creation, old snapshot obsolescence, and release gate blocking.

## Validation Scope

- Verify submitting a BOM draft for review requires a non-empty change reason.
- Verify Engineer can submit a draft review.
- Verify Engineer cannot approve a BOM review.
- Verify R&D Manager can approve a pending review.
- Verify approved draft becomes `Released`.
- Verify approval creates a release snapshot.
- Verify approving a later release obsoletes the prior release snapshot.
- Verify R&D Manager can reject a pending review and draft becomes `Rejected`.
- Verify release gate blocks missing child items before approval.
- Verify review submitted, approved, and rejected actions write audit logs.

## User-Critical Flow

1. Engineer prepares a BOM draft and submits it with a change reason.
2. R&D Manager approves the review after release gate passes.
3. System freezes the released BOM as a snapshot.
4. A later approved snapshot obsoletes the prior snapshot for the same parent item/revision.
5. R&D Manager can reject a review and return the draft to the engineer.
6. Release gate blocks BOMs that reference missing children before they become formal manufacturing/procurement data.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Review submitted without reason | Missing request validation | Manager lacks change context | Empty reason request | High | Expect `BOM_REVIEW_CHANGE_REASON_REQUIRED` |
| Engineer can approve | Role guard missing | Self-approval weakens control | Engineer approve request | High | Expect HTTP 403 |
| Approval does not freeze snapshot | Missing snapshot insert | Manufacturing/procurement cannot rely on fixed released BOM | Snapshot query | High | Assert approved draft is `Released` and snapshot exists |
| Prior release remains current | Old snapshot not obsoleted | Users may consume conflicting released BOMs | Second release scenario | High | Assert prior snapshot has `obsolete_at` |
| Rejected review leaves draft pending | Rejection transition incomplete | Engineer cannot revise draft cleanly | Reject review scenario | Medium | Assert draft status `Rejected` |
| Missing child passes release gate | Gate does not resolve child item | Released BOM contains unusable child | Missing child fixture | High | Expect HTTP 409 and `missing_child_item` issue |
| Audit trail missing | Review actions skip audit | Approval accountability weak | Audit query | High | Assert submitted/approved/rejected audit actions |

## Test Cases

- `TC-BOM-REL-001`: Engineer and manager login succeed.
- `TC-BOM-REL-002`: Create released child fixture and parent assembly fixture.
- `TC-BOM-REL-003`: Create first draft and verify empty review reason is rejected.
- `TC-BOM-REL-004`: Engineer submits review with reason.
- `TC-BOM-REL-005`: Engineer approval attempt is forbidden.
- `TC-BOM-REL-006`: Manager approves review and draft becomes `Released`.
- `TC-BOM-REL-007`: Create second draft, save changed quantity, submit and approve.
- `TC-BOM-REL-008`: Prior release snapshot becomes obsolete after second approval.
- `TC-BOM-REL-009`: Create and submit a draft, then manager rejects it.
- `TC-BOM-REL-010`: Create missing-child draft, submit, and verify approval is blocked by release gate.
- `TC-BOM-REL-011`: Audit logs exist for submit, approve, and reject.
- `TC-BOM-REL-012`: TypeScript, lint, build, and diff whitespace checks pass.

## Data Requirements

- Demo Engineer and Manager accounts.
- Running local Next server with `PDM_BASE_URL`.
- SQLite database initialized from `db/schema.sql`.
- Temporary child part submission manually marked `Released`.
- Temporary parent assembly submission with assembly reference to the child.

## Pass Criteria

- `npm.cmd run qc:bom-workbench-review-release` passes with zero failed checks.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0 or build TypeScript phase completes.
- `npm.cmd run lint` exits 0.
- `cmd /c npm run build` exits 0 and includes review routes.
- `git diff --check` exits 0 or reports CRLF warnings only.
- Dev server test port is cleaned up after validation.

## Evidence To Collect

- QC script JSON result including total/pass/fail counts.
- HTTP 400 for missing change reason.
- HTTP 403 for Engineer approval.
- Approved review response with released draft.
- Snapshot obsolescence DB evidence.
- Rejected review response with rejected draft.
- Release gate HTTP 409 response and issue code.
- Audit actions: `BomWorkbenchReviewSubmitted`, `BomWorkbenchReviewApproved`, `BomWorkbenchReviewRejected`.
