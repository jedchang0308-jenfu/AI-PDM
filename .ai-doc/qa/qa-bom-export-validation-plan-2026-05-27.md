# QA Validation Plan - BOM Export

Date: 2026-05-27

## Scope

Validate P2 BOM export for an existing Engineering BOM. The feature must let authorized users download BOM rows from a submission detail page in Excel-friendly CSV and Excel-compatible XML formats.

## User View

- Engineer can open their own submission and export its BOM.
- Manager can export BOM data from visible team submissions.
- Unauthorized users and out-of-scope Engineers cannot export another user's BOM.
- Exported rows include enough context for manufacturing or ERP preparation: parent part, revision, drawing, line number, child part, child revision, quantity, source filename, and BOM status/source.

## RD FMEA

| Risk | Failure mode | Validation |
| --- | --- | --- |
| Permission leak | Engineer exports another Engineer's BOM | API regression expects 403 |
| Missing auth | Anonymous export succeeds | API regression expects 401 |
| Empty/invalid export | Missing BOM exports an empty file as success | API regression expects 404 |
| Excel usability | CSV opens with broken encoding | CSV must include UTF-8 BOM and `text/csv` |
| Traceability loss | Export lacks parent/submission/source fields | API regression checks key columns and source filename |
| Format ambiguity | Excel option is not distinguishable from CSV | API regression checks `.xls` filename and Excel content type |

## Validation Commands

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- `npm.cmd run qc:ui`
- `npm.cmd run qc:file-hashes`

## Acceptance

- All validation commands pass.
- `BOMEXPORT-001` through `BOMEXPORT-010` pass in `scripts/qc-api-test.mjs`.
- Dashboard shows BOM export controls only when a BOM exists.
- `PDM_dev_task.md` marks `P2 BOM 匯出 Excel / CSV` complete only after QC pass.
