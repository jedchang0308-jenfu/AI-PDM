# QC Report - BOM Current Regression Validation

Date: 2026-05-26

## Scope

QC re-validation for the currently completed BOM schema and BOM auto-draft scope.

Referenced validation plans:

- `docs/qa-bom-schema-validation-plan-2026-05-26.md`
- `docs/qa-bom-auto-draft-validation-plan-2026-05-26.md`

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
- API regression: 130 passed, 0 failed.
- UI E2E: 26 passed, 0 failed.
- File hash verification: 1163 checked, 1163 ok, 0 missing, 0 unreadable, 0 size mismatch, 0 hash mismatch.

## BOM Evidence

API regression included and passed:

- `BOM-001` unauthenticated BOM returns 401.
- `BOM-002` Engineer can materialize own BOM.
- `BOM-003` BOM header is Draft.
- `BOM-004` BOM contains two lines.
- `BOM-005` BOM preserves child quantity.
- `BOM-006` BOM exposes parent part number.
- `BOM-007` Manager can read materialized BOM.
- `BOM-008` BOM read returns existing lines.
- `BOM-009` Engineer cannot read other Engineer BOM.
- `BOM-010` submission auto creates BOM draft from references.
- `BOM-011` auto BOM contains one line.
- `BOM-012` auto BOM preserves uploaded reference quantity.
- `BOM-013` submission detail exposes auto BOM.

## QC Notes

- No source code was changed during this QC run.
- Local Next.js dev server was started for API/UI validation and stopped after the run.
- `PDM_dev_task.md` still shows `BOM diff API/UI` and `Where-used API/UI` as not completed, so they were not treated as validation targets in this run.
