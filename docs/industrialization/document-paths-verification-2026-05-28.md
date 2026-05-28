# Document Paths Verification - 2026-05-28

## Scope

- DEV-IND-011: reorganize RD/QA/QC documents, validation plans, runbooks, and report path documentation.

## RD Changes

- Added source-controlled document boundaries:
  - `docs/reports/rd/`
  - `docs/reports/qa/`
  - `docs/reports/qc/`
  - `docs/validation-plans/`
  - `docs/runbooks/`
- Added `docs/report-path-index.md` to map legacy root-level `docs/rd-*`, `docs/qa-*`, and `docs/qc-*` files to the new directories.
- Updated `scripts/qa-sync-dev-task-evidence.mjs` so it prefers `dev_task.md` and falls back to `PDM_dev_task.md`.
- Added `scripts/qc-doc-paths-test.mjs` and `npm.cmd run qc:doc-paths`.

## QA Validation Plan

- Verify every new document boundary exists and has a README.
- Verify old path compatibility is documented.
- Verify evidence sync uses the current task filename.
- Verify report generators still respect configured report roots.
- Verify `qa:dev-task:sync` can run without modifying source files.

## QC Evidence

- `npm.cmd run qc:doc-paths`
  - PASS: 18 checks.
- `npm.cmd run qa:dev-task:sync`
  - PASS: default task file is `dev_task.md`.
  - Result remains `readyToApply=false` because external evidence is still open.
- `PDM_REPORT_DIR=data/dev-ind-011-report-route npm.cmd run sw-addin:report:new`
  - PASS: generated `report.json` and `report.md` under the configured report root.
- `PDM_REPORT_DIR=data/dev-ind-011-report-route npm.cmd run document-manager:report:new`
  - PASS: generated `report.json` and `report.md` under the configured report root.
- `PDM_REPORT_DIR=data/dev-ind-011-report-route npm.cmd run backup:restore-drill-report:new`
  - PASS: generated `report.json` and `report.md` under the configured report root.
- `npm.cmd run qc:dev-task-evidence-sync`
  - PASS: 11 checks.
- `npm.cmd run lint`
  - PASS.

## Result

PASS. DEV-IND-011 is complete. Existing generated evidence remains under ignored `data/` roots; the new `docs/` directories are for source-controlled reports, validation plans, indexes, and runbooks.
