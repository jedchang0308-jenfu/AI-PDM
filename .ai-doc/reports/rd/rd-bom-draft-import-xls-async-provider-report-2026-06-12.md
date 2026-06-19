# RD Report: BOM Draft Import XLS Async Provider Slice

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration

## Scope

Convert `/api/bom/drafts/import-xls` away from direct synchronous `@/lib/db` submission lookup and SolidWorks XLS import writes, while preserving the existing text-based SolidWorks BOM import behavior.

## Changes

- Added `AsyncBomWorkbenchRepository.createDraftFromSolidWorksXls(...)`.
- Added async `BomXlsImportError`.
- Added provider-neutral SQL for import profile select/update/insert, import job select/insert, file asset insert, draft insert, draft line insert, edit event insert, and audit log insert.
- Ported SolidWorks BOM import parsing into the async repository path for tab-delimited / CSV, Excel HTML, and SpreadsheetML text exports.
- Preserved original file repository write behavior and `file_assets` metadata creation.
- Added `createBomWorkbenchDraftFromSolidWorksXlsAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/drafts/import-xls` to use async submission and import helpers.
- Extended `qc:access-control-async-repository` with route wiring checks and an in-memory SQLite semantic import gate.

## Behavioral Notes

- Auth remains `requireAuthAsync(...)`.
- Permission check remains `canReadBomDraft(...)` after async submission lookup.
- Existing behavior is preserved: empty files and binary OLE `.xls` are rejected with explicit `BomXlsImportError` codes, duplicate part/revision rows are merged, import profile/job metadata is stored, the original file is written to the repository, `solidworks_xls` source priority remains 20, the imported draft can become active, and both `import_solidworks_xls` edit event and `BomWorkbenchDraftImported` audit evidence are written.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 189/189.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:bom-workbench-solidworks-xls-import` passed 34/34 against temporary `next dev` at `127.0.0.1:3012`.
- Temporary 3012 listener was stopped after validation.
- `rg -n '@/lib/db|from "@/lib/db"' src/app/api/bom` returned no matches after this slice.

## Boundary

This slice only covers the BOM draft SolidWorks XLS import route and removes the last direct `@/lib/db` import under `src/app/api/bom`. It does not migrate numbering, release package/share/supplier/sandbox, attachment, AI, remaining non-BOM sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, or storage follow-up.
