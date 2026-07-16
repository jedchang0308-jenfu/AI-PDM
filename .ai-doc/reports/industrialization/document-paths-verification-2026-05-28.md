# Document Paths Verification - 2026-05-28

2026-06-09 update: this report is historical. The current active documentation map is `.ai-doc/documentation_map.md`, and PM-dev project documents now live under `.ai-doc/`.

## Scope

- DEV-IND-011: reorganize RD/QA/QC documents, validation plans, runbooks, and report path documentation.

## RD Changes

- Added source-controlled document boundaries, later superseded by:
  - `.ai-doc/reports/rd/`
  - `.ai-doc/reports/qa/`
  - `.ai-doc/qc/`
  - `.ai-doc/qa/`
  - `.ai-doc/runbooks/`
- Added `.ai-doc/archived/report-path-index.md` to preserve the former compatibility map.
- Updated `scripts/qa-sync-dev-task-evidence.mjs` so it prefers `.ai-doc/dev_task.md` and falls back to legacy `dev_task.md` / `PDM_dev_task.md`.
- Updated `scripts/qc-production-readiness-test.mjs` so production readiness reporting also prefers `.ai-doc/dev_task.md`, preserves the legacy fallbacks, parses the current P0/P1 task tables, and now also includes the Industrialization Task Overview when present.
- Added `scripts/qc-doc-paths-test.mjs` and `npm.cmd run qc:doc-paths`.

## QA Validation Plan

- Verify every new document boundary exists and has a README.
- Verify old path compatibility is documented.
- Verify evidence sync uses the current `.ai-doc/dev_task.md` task filename.
- Verify production readiness reporting uses the current task filename and reports open blockers instead of failing on removed legacy filenames.
- Verify report generators still respect configured report roots.
- Verify `qa:dev-task:sync` can run without modifying source files.

## QC Evidence

- `npm.cmd run qc:doc-paths`
  - PASS: 20 checks.
- `npm.cmd run qa:dev-task:sync`
  - PASS: default task file is `.ai-doc/dev_task.md`.
  - Result remains `readyToApply=false` because external evidence is still open.
- `npm.cmd run qc:production-readiness:report`
  - PASS in allow-open mode: report used `.ai-doc/dev_task.md`, tracked the P0/P1 tables plus Industrialization Task Overview when present, and reported 5 blockers including `DEV-IND-007`.
- `npm.cmd run field-test:preflight -- --profile all`
  - PASS: 19 checks, 1 administrator warning for COM registration context.
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

PASS. DEV-IND-011 is complete. Existing generated evidence remains under ignored `data/` roots. As of 2026-06-09, source-controlled PM-dev documents are centralized under `.ai-doc/`.
