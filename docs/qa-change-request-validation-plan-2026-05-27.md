# QA Validation Plan - P2 ECR / ECO / ECN

Date: 2026-05-27

## Scope

Validate a lightweight ECR/ECO/ECN workflow focused on fast engineering change tracking without introducing a heavy PLM phase-gate process.

## User Angle

1. Engineer can create ECR and ECN records directly from a submission.
2. R&D Manager can create ECO records when review requires implementation control.
3. Team can list all ECR/ECO/ECN records linked to the submission.
4. Engineer cannot approve change records.
5. Manager/Admin can approve, reject, or close open change records.
6. Decided change records retain decision metadata and cannot be decided again.

## RD FMEA

| Risk | Failure Mode | Control |
| --- | --- | --- |
| Process bloat | Feature becomes full ECO workflow too early | Single lightweight `change_requests` table and submission-scoped API |
| Missing traceability | Change decision not tied to actor/submission | `requested_by`, `decided_by`, timestamps, and audit logs |
| Unauthorized decision | Engineer approves own change | Decision route restricted to Manager/Admin |
| Scope leak | Engineer reads other Engineer's changes | Existing `canReadSubmission` guard on list/create/decision routes |
| Duplicate decision | Approved/rejected changes can be reopened by accident | Only `open` changes can be decided |

## QC Cases

- `CHANGE-001` unauthenticated change list returns 401.
- `CHANGE-002` empty change title returns 400.
- `CHANGE-003` Engineer creates ECR.
- `CHANGE-004` Created ECR is open.
- `CHANGE-005` Created ECR keeps kind.
- `CHANGE-006` Manager creates ECO.
- `CHANGE-007` Created ECO keeps kind.
- `CHANGE-008` Engineer creates ECN.
- `CHANGE-009` Created ECN keeps kind.
- `CHANGE-010` Engineer lists own changes.
- `CHANGE-011` List includes ECR, ECO, and ECN.
- `CHANGE-012` Engineer cannot approve change request.
- `CHANGE-013` Manager approves ECR.
- `CHANGE-014` Approved ECR status is approved.
- `CHANGE-015` Approved ECR has decision metadata.
- `CHANGE-016` Decided change cannot be decided again.
- `CHANGE-017` Engineer cannot list other Engineer changes.

## Acceptance

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes and includes change request routes.
- `npm.cmd run qc:api` passes all `CHANGE-*` cases.
- `npm.cmd run qc:ui` passes existing regression.
- `npm.cmd run qc:file-hashes` reports no missing/unreadable/hash mismatch issues.
