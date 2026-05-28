# QC Report - BOM Schema Validation

Date: 2026-05-26

## Scope

QC validation for the first BOM schema and submission BOM API.

## Result

Passed.

## Evidence

Commands:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run qc:api
npm.cmd run qc:ui
```

Results:

- Lint: passed.
- Build: passed, including `/api/submissions/[id]/bom`.
- API regression: 125 passed, 0 failed.
- UI E2E: 26 passed, 0 failed.

## BOM-Specific Coverage

API regression included:

- `BOM-001` unauthenticated BOM access is blocked.
- `BOM-002` Engineer can materialize own BOM.
- `BOM-003` BOM header status is Draft.
- `BOM-004` BOM contains expected child lines.
- `BOM-005` BOM preserves child quantity.
- `BOM-006` BOM exposes parent part number.
- `BOM-007` Manager can read materialized BOM.
- `BOM-008` BOM read returns existing lines.
- `BOM-009` Engineer cannot read another engineer's BOM.

## QC Note

This validates the data foundation only. Automatic BOM creation on every assembly upload, BOM diff, and Where-used remain open Sprint 3 tasks.
