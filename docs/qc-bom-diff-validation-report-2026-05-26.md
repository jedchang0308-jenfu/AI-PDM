# QC Report - BOM Diff Validation

Date: 2026-05-26

## Scope

QC validation for BOM diff API/UI based on `docs/qa-bom-diff-validation-plan-2026-05-26.md`.

## Result

Passed.

## Evidence

Commands executed:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run qc:api
npm.cmd run qc:ui
npm.cmd run qc:file-hashes
```

Observed results:

- Lint: passed.
- Build: passed.
- API regression: 145 passed, 0 failed.
- UI E2E: 26 passed, 0 failed.
- File hash verification: 1178 checked, 1178 ok, 0 missing, 0 unreadable, 0 size mismatch, 0 hash mismatch.

## BOM Diff Coverage

API regression included and passed:

- `BOMDIFF-001` unauthenticated BOM diff returns 401.
- `BOMDIFF-002` default previous BOM diff returns 200.
- `BOMDIFF-003` default diff uses base revision A.
- `BOMDIFF-004` default diff uses target revision B.
- `BOMDIFF-005` default diff changed count.
- `BOMDIFF-006` default diff added count.
- `BOMDIFF-007` default diff removed count.
- `BOMDIFF-008` default diff unchanged count.
- `BOMDIFF-009` changed line preserves before and after quantity.
- `BOMDIFF-010` explicit base BOM diff returns 200.
- `BOMDIFF-011` explicit base comparison is marked explicit.
- `BOMDIFF-012` Engineer cannot diff another Engineer BOM.
- `BOMDIFF-013` BOM diff without previous BOM returns 404.

## QC Notes

- Local Next.js dev server was started for API/UI validation and stopped after the run.
- UI E2E remains a broad dashboard regression; BOM diff UI rendering is supported by the route/build check and the Dashboard fetch/render implementation.
