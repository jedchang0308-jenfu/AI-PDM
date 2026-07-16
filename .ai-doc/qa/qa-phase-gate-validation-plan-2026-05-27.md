# QA Validation Plan - P2 PLM Phase Gate

Date: 2026-05-27

## Scope

Validate a submission-scoped phase-gate workflow that adds release readiness gates only when explicitly enabled. This keeps the default PDM flow efficient while supporting stricter PLM-style gates for selected submissions.

## User Angle

1. Existing fast approval flow remains unchanged when phase gates are not enabled.
2. Manager/Admin can enable default Concept, Design, Verification, and Release gates on a submission.
3. Engineer can read phase-gate status but cannot initialize or decide gates.
4. Open required gates block approval/release.
5. Manager/Admin can complete or waive required gates.
6. Once all required gates are completed or waived, normal approval/release can proceed.

## RD FMEA

| Risk | Failure Mode | Control |
| --- | --- | --- |
| Process overhead | Phase gates slow every submission | Gates are opt-in; no checks means no approval block |
| Release escape | Gated submission releases with open gates | Approval route checks required open phase gates |
| Unauthorized gate decision | Engineer closes gate without review | Initialize/decision routes require Manager/Admin |
| Missing traceability | Gate decisions lack actor/comment/time | Decision metadata and audit logs are stored |
| Re-decision ambiguity | Completed/waived gate is changed again | Only `open` gate checks can be decided |

## QC Cases

- `PHASE-001` unauthenticated phase gate list returns 401.
- `PHASE-002` Engineer cannot initialize phase gates.
- `PHASE-003` Manager initializes phase gates.
- `PHASE-004` Default phase gate count is 4.
- `PHASE-005` Phase gates start with four open required checks.
- `PHASE-006` Open required phase gates block approval.
- `PHASE-007` Engineer cannot decide phase gate.
- Phase decision cases for concept, design, verification, and release return 200.
- `PHASE-008` Phase gate list after decisions returns 200.
- `PHASE-009` No required phase gates remain open.
- `PHASE-010` Phase gate summary is ready.
- `PHASE-011` Decided phase gate cannot be decided again.
- `PHASE-012` Completed phase gates allow approval.
- `PHASE-013` Completed phase gates release submission.

## Acceptance

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes and includes phase-gate routes.
- `npm.cmd run qc:api` passes all `PHASE-*` cases.
- `npm.cmd run qc:ui` passes existing regression.
- `npm.cmd run qc:file-hashes` reports no missing/unreadable/hash mismatch issues.
