# RD Report - Add-in Checkout Lock Preflight

## Scope

完成 `P0 Add-in 送審前查詢圖號/料號是否被預約`。

## Changes

- Added `POST /api/submissions/preflight-lock`.
- Added `findActiveItemLockForSubmissionIdentifiers()` in `src/lib/db.ts`.
- Added Add-in DTOs for lock preflight response.
- Updated `sw-addin/Services/ApiClient.cs` so submission calls checkout lock preflight before file validation and multipart upload.
- Updated API regression with owner and competing engineer preflight cases.
- Updated Add-in source QC to require the new route and Add-in preflight call.

## Behavior

- Engineers/Admins can query active checkout reservation by `drawing_number` and/or `part_number`.
- The Add-in allows submission when no active lock exists or the active lock belongs to the current user.
- The Add-in blocks submission before upload when the active lock belongs to another user.
- Unauthorized preflight requests return 401.

## Verification Summary

- `npm run qc:sw-addin-source`: PASS, 63 passed / 0 failed
- `node_modules\\.bin\\tsc.cmd --noEmit`: PASS
- `PDM_BASE_URL=http://127.0.0.1:3001 npm run qc:api`: PASS, 391 passed / 0 failed
- `npm run qc:sw-addin-build`: PASS, Release DLL built
- `npm run lint`: PASS
- `npm run build`: PASS
