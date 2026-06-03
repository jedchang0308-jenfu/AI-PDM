# QA Validation Plan - PDM Numbering Import Staging

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: legacy numbering master import staging, conflict report, and admin confirmation into formal master records.

## Validation Scope

- Verify `import_batches` and `import_staging_rows` exist.
- Verify staging rows preserve raw import data.
- Verify staging rows classify valid, need-info, and conflict states.
- Verify conflict detection covers existing root/part/drawing records and duplicates inside the import file.
- Verify admin confirmation converts valid rows into official `part_roots`, `part_numbers`, `drawing_numbers`, and links.
- Verify API routes are registered:
  - `/api/numbering/import-batches`
  - `/api/numbering/import-batches/[batchId]`
  - `/api/numbering/import-batches/[batchId]/confirm`

## User Critical Flows

- RD/Admin uploads legacy master rows into staging.
- System returns row-level check status and issues before official import.
- Admin reviews the staging report and confirms valid rows.
- Valid rows are migrated into formal master tables; conflict/need-info rows stay in staging evidence.
- Confirmed batch records summary and audit evidence.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Import overwrites existing master | Missing duplicate checks | Existing controlled numbers are corrupted | QC source/static check | High | `ROOT_EXISTS`, `PART_EXISTS`, `DRAWING_EXISTS` conflicts |
| Duplicate row in file becomes duplicate master | No in-file duplicate detection | SQLite constraint failure during confirm | QC source/static check | High | `DUPLICATE_PART_IN_FILE` / `DUPLICATE_DRAWING_IN_FILE` |
| Non-admin can confirm import | Weak route role check | Unauthorized master mutation | Route source check | High | Confirm route requires `Admin` |
| Raw evidence lost | Import only writes normalized records | Audit cannot reconstruct source | Schema/QC check | Medium | `import_staging_rows.raw_json` |
| Valid row does not link part/drawing | Confirm omits relationship | Imported master is incomplete | Code review/build check | Medium | Confirm creates `drawing_part_links` when both part and drawing exist |

## Test Cases

- `NUM-SCHEMA table exists import_batches`.
- `NUM-SCHEMA table exists import_staging_rows`.
- `NUM-SCHEMA import batch saved`.
- `NUM-SCHEMA import staging row saved`.
- `NUM-REPO creates numbering import batches`.
- `NUM-REPO confirms numbering import batches`.
- `NUM-REPO import detects conflicts before confirm`.
- `NUM-REPO db.ts re-exports import batch workflow`.
- `NUM-API import batch route creates staging batches`.
- `NUM-API import batch detail route reads staging report`.
- `NUM-API import batch confirm route requires admin and confirms`.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 105/105 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes all import-batch routes.

## Evidence Collection

- Targeted QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
- Source checks for conflict detection and confirm workflow.
