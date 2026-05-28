# RD Report - BOM Export

Date: 2026-05-27

## Scope

Implemented P2 BOM export for existing Engineering BOM data.

## Implementation

- Added `GET /api/submissions/[id]/bom/export`.
- Added `format=csv` export with UTF-8 BOM and `text/csv; charset=utf-8`.
- Added `format=xls` export using Excel-compatible SpreadsheetML XML and `application/vnd.ms-excel`.
- Export rows include submission ID, parent part metadata, BOM status/source, line number, child part, child revision, quantity, and source filename.
- Reused submission read permission checks, so Engineer scope and Manager scope remain consistent with existing BOM APIs.
- Added Dashboard BOM export actions for CSV and Excel when a BOM exists.
- Added API regression tests `BOMEXPORT-001` through `BOMEXPORT-010`.

## Validation

Final QC passed on 2026-05-27:

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api` with `236 passed / 0 failed`
- `npm.cmd run qc:ui` with `26 passed / 0 failed`
- `npm.cmd run qc:file-hashes` with `1403 checked / 1403 ok`

See `docs/qc-bom-export-validation-report-2026-05-27.md`.
