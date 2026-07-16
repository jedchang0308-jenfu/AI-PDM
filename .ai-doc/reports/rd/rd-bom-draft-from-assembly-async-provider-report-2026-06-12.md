# RD Report: BOM Draft From Assembly Async Provider Slice

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration

## Scope

Convert `/api/bom/drafts/from-assembly` away from direct synchronous `@/lib/db` draft creation and submission lookup, while preserving the existing CAD assembly reference draft-creation behavior.

## Changes

- Added `AsyncBomWorkbenchRepository.createDraftFromAssembly(...)`.
- Added provider-neutral SQL for assembly reference lookup and workbench draft insertion.
- Reused existing async workbench SQL for active-draft deactivation, child item lookup, draft line insertion, edit event insertion, and audit insertion.
- Ported the existing assembly-reference merge behavior into the async repository: references are grouped by child part number and revision, and duplicate quantities are summed.
- Added `createBomWorkbenchDraftFromAssemblyAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/drafts/from-assembly` to use async submission and draft-creation helpers.
- Extended `qc:access-control-async-repository` with route wiring checks and an in-memory SQLite semantic create-from-assembly gate.

## Behavioral Notes

- Auth remains `requireAuthAsync(...)`.
- Permission check remains `canReadBomDraft(...)` after async submission lookup.
- Existing behavior is preserved: draft name default remains `Assembly Draft YYYY-MM-DD`, source remains `cad_reference`, `setActive` still deactivates other Draft/Rejected active drafts for the same parent item/revision, lines point to matching child items when present, and creation writes `create_from_assembly` plus `BomWorkbenchDraftCreated` audit evidence.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 185/185.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:bom-workbench-foundation` passed 27/27 against temporary `next dev` at `127.0.0.1:3010`.
- Temporary 3010 listener was stopped after validation.

## Boundary

This slice only covers BOM draft creation from CAD assembly references. It does not migrate BOM review approve, SolidWorks XLS import, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, or storage follow-up.
