# QA Validation Plan - PDM Numbering Approval Workflow

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: numbering approval requests, approval decisions, released same-drawing variant approval, and missing-MA override confirmation.

## Validation Scope

- Verify `approval_requests` and `approval_decisions` exist for numbering actions.
- Verify approval request/decision repository functions are exported.
- Verify `/api/numbering/approval-requests` and `/api/numbering/approval-decisions` are registered in build output.
- Verify released same-drawing variant cannot be linked directly and must go through approval.
- Verify approved same-drawing variant requests can apply the link and variant metadata.
- Verify DVT and Release missing-MA gate uses action codes that can be approved.

## User Critical Flows

- RD requests approval for adding a new part number to an already released MA drawing.
- Manager/Admin approves or rejects the request.
- Approved request applies the same-drawing variant link; pending request remains not usable.
- RD requests DVT missing-MA override and Release missing-MA confirmation as explicit approval actions.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Released same-drawing variant bypasses review | Direct link API does not check release status | Released drawing control is broken | QC source/static test | High | Direct link throws `SAME_DRAWING_VARIANT_APPROVAL_REQUIRED` |
| Approval request not persisted | Missing approval tables | No audit trail for manager decisions | Schema/write QC | High | `approval_requests` and `approval_decisions` |
| Manager approval does not apply request | Decision writes only status | RD still needs manual re-entry | Repository static test | Medium | Approved same-drawing variant applies link |
| Missing-MA release confirmation not traceable | Gate action code missing | Release override cannot be audited | Repository static test | High | `release_missing_ma_confirm` action code |
| Engineer approves own exception | Route allows Engineer decision | Control bypass | Route source/build check | High | Decision route requires `R&D Manager` or `Admin` |

## Test Cases

- `NUM-SCHEMA table exists approval_requests`.
- `NUM-SCHEMA table exists approval_decisions`.
- `NUM-SCHEMA approval request saved`.
- `NUM-SCHEMA approval decision saved`.
- `NUM-REPO requests numbering approvals`.
- `NUM-REPO decides numbering approvals`.
- `NUM-REPO applies approved same-drawing variant`.
- `NUM-REPO blocks released same-drawing variant without approval`.
- `NUM-REPO evaluates approved missing-MA override`.
- `NUM-API approval request route calls workflow`.
- `NUM-API approval decision route calls workflow`.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 62/62 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes:
  - `/api/numbering/approval-requests`
  - `/api/numbering/approval-decisions`

## Evidence Collection

- Targeted QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
