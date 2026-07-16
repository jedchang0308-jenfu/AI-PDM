# QA Validation Plan: BOM Workbench Released Snapshot Export

Scope: Released BOM Snapshot CSV and XLSX export API.

## Validation Scope

- Verify Released Snapshot export is served from `bom_release_snapshots`, not mutable draft state.
- Verify CSV export returns UTF-8 CSV with the fixed first-version columns.
- Verify XLSX export returns a real OOXML zip workbook with worksheet XML, not CSV or SpreadsheetML mislabeled as `.xlsx`.
- Verify export filenames follow `BOM_{part_number}_Rev{revision}_{YYYYMMDD}.csv` and `.xlsx`.
- Verify unsupported formats are rejected.
- Verify missing snapshot IDs return 404.
- Verify existing review/release flow still creates a snapshot ID usable by the export API.

## User-Critical Flow

1. Engineer creates a BOM draft from an assembly.
2. Engineer submits the BOM draft for review.
3. R&D Manager approves and the system creates a Released Snapshot.
4. Authorized user downloads the Released BOM as CSV or XLSX with a predictable filename.
5. Manufacturing/procurement can consume the exported file without accessing Draft data.

## FMEA

| Failure Mode | Cause | User Impact | Detection | Priority | Countermeasure / Test |
|---|---|---|---|---|---|
| Export reads mutable draft | API uses draft ID after release | Export can drift after review | Snapshot fixture and release export route | High | Export by snapshot ID only |
| XLSX is not valid XLSX | CSV or XML mislabeled | Excel import/open failure | Check ZIP signatures and workbook parts | High | Assert `PK` header, EOCD, worksheet XML |
| Filename not fixed | Ad hoc naming | Manufacturing/procurement cannot trace file | Header check | Medium | Assert `BOM_{part}_Rev{rev}_{YYYYMMDD}` |
| Missing rows or columns | Row mapper incomplete | Procurement loses quantity/source fields | CSV/XLSX content check | High | Assert fixed columns and child values |
| Unsupported format accepted | Loose format parser | Confusing downloads | `format=xls` request | Low | Expect HTTP 400 |
| Missing snapshot leaks generic error | Route lookup incomplete | Poor supportability | Missing ID request | Low | Expect HTTP 404 |

## Test Cases

- `TC-BOM-EXPORT-001`: Engineer and manager login succeed.
- `TC-BOM-EXPORT-002`: Create released child and parent assembly fixture.
- `TC-BOM-EXPORT-003`: Create workbench draft, submit, approve, and capture `snapshotId`.
- `TC-BOM-EXPORT-004`: CSV export returns HTTP 200, `text/csv`, fixed filename, fixed columns, child part and quantity.
- `TC-BOM-EXPORT-005`: XLSX export returns HTTP 200, OOXML content type, fixed filename, ZIP signatures, workbook parts, parent and child values.
- `TC-BOM-EXPORT-006`: Unsupported `format=xls` returns `BOM_EXPORT_FORMAT_UNSUPPORTED`.
- `TC-BOM-EXPORT-007`: Missing snapshot ID returns HTTP 404.
- `TC-BOM-EXPORT-008`: TypeScript, lint, build, and diff whitespace checks pass.

## Data Requirements

- Demo Engineer and Manager accounts.
- Running local Next server with `PDM_BASE_URL`.
- SQLite database initialized from `db/schema.sql`.
- Temporary child part submission marked `Released`.
- Temporary parent assembly submission with CAD reference quantity `3`.

## Pass Criteria

- `npm.cmd run qc:bom-workbench-release-export` passes with zero failed checks.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` exits 0.
- `npm.cmd run lint` exits 0.
- `cmd /c npm.cmd run build` exits 0 and includes `/api/bom/releases/[releaseId]/export`.
- `git diff --check` exits 0 or reports CRLF warnings only.
- Dev server test port is cleaned up after validation.

## Evidence To Collect

- QC script JSON result with total/pass/fail counts.
- CSV response headers and content excerpt.
- XLSX response headers, ZIP header, EOCD signature, workbook entries, and BOM values.
- Unsupported format HTTP 400 response.
- Missing snapshot HTTP 404 response.
