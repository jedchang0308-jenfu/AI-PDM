# QA Validation Plan - PDM Numbering Main Drawing Restore

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: `MainDrawingInvalid` part-number recovery after manager/admin approval.

## Validation Scope

- Verify `MainDrawingInvalid` restore requests use a dedicated approval action.
- Verify restore request requires an already invalidated part number.
- Verify optional replacement drawing must be same root, MA purpose, and active.
- Verify pending restore approval does not restore the part number.
- Verify approval decision applies restore only after approval.
- Verify restore keeps the root invalid when other part numbers under the same root still need recovery.
- Verify API/build exposes the restore request path through `/api/numbering/approval-requests`.

## User Critical Flows

- RD receives a main-drawing invalidation warning and revises affected documents.
- RD requests `main_drawing_restore` approval with the affected part number and, when needed, a replacement MA drawing.
- Manager/Admin reviews impact context in the approval request and approves or rejects.
- After approval, the part number becomes usable again and the approved replacement MA drawing becomes the primary manufacturing link.
- If sibling part numbers under the same root remain invalid, the root stays `MainDrawingInvalid` until all are restored.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Pending request restores part number | Request path mutates part status | RD can use unapproved affected data | Source/QC static test | High | Restore is applied only in `applyApprovedNumberingRequest` |
| Restore can target non-invalid part | Missing source-status validation | Normal records can be changed by exception path | QC source test | High | `MAIN_DRAWING_RESTORE_REQUIRES_INVALID_PART` |
| Replacement drawing is from another root | Missing root validation | Main root conflict and wrong drawing-to-part relationship | QC source test | High | `MAIN_DRAWING_RESTORE_REQUIRES_SAME_ROOT_MA_DRAWING` |
| Replacement drawing is obsolete | Missing status validation | Restored part points to invalid MA drawing | QC source test | High | `MAIN_DRAWING_RESTORE_REQUIRES_ACTIVE_MA_DRAWING` |
| Root becomes active while sibling parts remain invalid | Restore updates root unconditionally | Root-level status hides unresolved impact | Code review and QC evidence | Medium | Root restores only when no sibling `MainDrawingInvalid` part remains |
| Restore is not auditable | Missing audit event | Manager cannot trace exception | QC source test | Medium | `numbering.main_drawing.restore` audit event |

## Test Cases

- `NUM-REPO requests main drawing restore approvals`.
- `NUM-REPO validates restore source status`.
- `NUM-REPO validates restore replacement MA drawing`.
- `NUM-REPO applies approved main drawing restore`.
- `NUM-REPO db.ts re-exports main drawing restore approval`.
- `NUM-API approval request route calls main drawing restore workflow`.
- Existing approval decision route remains present in build output.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 68/68 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes:
  - `/api/numbering/approval-requests`
  - `/api/numbering/approval-decisions`

## Evidence Collection

- Targeted QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
- Repository source references for restore validation and audit action.
