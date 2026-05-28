# QA Validation Plan - Add-in Checkout Lock Preflight

## User Risk

Engineer may submit CAD changes from SolidWorks while another user has the same item checked out. That breaks the lightweight checkout workflow and can create parallel edits that should have been blocked.

## FMEA

| ID | Failure Mode | Impact | Validation |
| --- | --- | --- | --- |
| ADDINLOCK-FMEA-001 | Add-in uploads without checking active locks | Checkout reservation is bypassed | Source QC must prove `CheckItemLock` runs before file upload |
| ADDINLOCK-FMEA-002 | API cannot find lock by part number | Same item can be submitted by another user | API regression must query by `part_number` |
| ADDINLOCK-FMEA-003 | Owner is blocked by own reservation | Legitimate reserved work is blocked | API regression must return `lockedByCurrentUser=true` for owner |
| ADDINLOCK-FMEA-004 | Other engineer is treated as owner | Reservation is bypassed | API regression must return `lockedByCurrentUser=false` and expose owner |
| ADDINLOCK-FMEA-005 | Unauthenticated preflight leaks lock info | Internal reservation metadata leaks | API regression must return 401 |
| ADDINLOCK-FMEA-006 | C# DTO or API client fails to compile | Field Add-in cannot deploy | Release build must pass |

## QC Cases

| Case | Priority | Expected Result |
| --- | --- | --- |
| CHECKOUT-010 | P0 | Unauthenticated lock preflight returns 401. |
| CHECKOUT-011 | P0 | Lock owner preflight returns 200. |
| CHECKOUT-012 | P0 | Lock owner gets `lockedByCurrentUser=true`. |
| CHECKOUT-013 | P0 | Other engineer lock preflight returns 200. |
| CHECKOUT-014 | P0 | Other engineer sees `locked=true`. |
| CHECKOUT-015 | P0 | Other engineer gets `lockedByCurrentUser=false`. |
| CHECKOUT-016 | P0 | Other engineer response exposes active owner. |
| SW-SRC | P0 | Add-in source QC verifies preflight route and client call before upload. |
| BUILD | P0 | Add-in Release build succeeds. |
| REG | P0 | TypeScript, lint, and production build pass. |

## Required Commands

- `npm run qc:sw-addin-source`
- `node_modules\\.bin\\tsc.cmd --noEmit`
- `PDM_BASE_URL=http://127.0.0.1:3001 npm run qc:api`
- `npm run qc:sw-addin-build`
- `npm run lint`
- `npm run build`

## Exit Criteria

- All required commands pass.
- `PDM_dev_task.md` marks `P0 Add-in 送審前查詢圖號/料號是否被預約` complete.
