# QA Validation Plan - PDM Numbering Approval Batches

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: numbering approval batch creation, same-action batch decision, rejected-item resubmission, and batch API routes.

## Validation Scope

- Verify `approval_batches` and `approval_batch_items` exist.
- Verify batch items keep the original request and status history.
- Verify batch creation accepts only pending requests and same action code.
- Verify manager/admin can decide pending items in a batch.
- Verify rejected or `needs_info` items can be resubmitted while the original batch is preserved.
- Verify resubmission creates new approval requests only for rejected/needs-info targets and marks old items as `resubmitted`.
- Verify API routes are registered:
  - `/api/numbering/approval-batches`
  - `/api/numbering/approval-batches/[batchId]`

## User Critical Flows

- RD groups same-project or same-action approval requests into one review batch.
- Manager/Admin approves, rejects, or requests more information for all pending batch targets or a selected subset.
- If only some items are rejected, RD revises those items and resubmits only rejected/needs-info items.
- Original batch history remains visible for traceability.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Mixed actions in one batch | Missing action validation | Reviewer approves unrelated controls together | QC source/static check | High | Batch rejects mixed action requests unless action is explicit and matching |
| Non-pending requests added | Missing request status validation | Already resolved request gets re-reviewed | QC source/static check | High | Batch creation requires `pending` requests |
| Rejected history is overwritten | Resubmission mutates old item | Audit trail is lost | QC source/static check | High | Old item becomes `resubmitted`; new item points to old item |
| Resubmit creates requests for approved items | Broad target selection | Approved items re-enter review | QC source/static check | Medium | Resubmission filters only `rejected` and `needs_info` |
| Engineers can approve batch | Weak route role check | Segregation of duties fails | Route source check | High | Batch decision requires `R&D Manager` or `Admin` |

## Test Cases

- `NUM-SCHEMA table exists approval_batches`.
- `NUM-SCHEMA table exists approval_batch_items`.
- `NUM-SCHEMA approval batch saved`.
- `NUM-SCHEMA approval batch item saved`.
- `NUM-REPO creates numbering approval batches`.
- `NUM-REPO decides numbering approval batches`.
- `NUM-REPO resubmits rejected batch items only`.
- `NUM-REPO db.ts re-exports approval batch workflow`.
- `NUM-API approval batch route creates batches`.
- `NUM-API approval batch detail route decides and resubmits`.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 82/82 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes both approval-batch routes.

## Evidence Collection

- Targeted QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
- Source checks for batch create/decision/resubmit functions.
