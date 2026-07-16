# RD Report: BOM Draft Save Async Provider Slice

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration

## Scope

Convert `/api/bom/drafts/[draftId]` GET/PATCH away from direct synchronous `@/lib/db` reads/writes and onto the provider-neutral async DB path.

## Changes

- Added `AsyncBomWorkbenchRepository.saveDraftTree(...)`.
- Added provider-neutral SQL for child item lookup, draft line deletion, draft line insert, and draft summary update after save.
- Ported the existing draft tree normalization behavior into the async repository, including duplicate id detection, missing parent detection, cycle/depth checks, sibling item merge, and deterministic tree ordering.
- Added `saveBomWorkbenchDraftTreeAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/drafts/[draftId]` GET/PATCH to use async draft, submission, and save helpers.
- Extended `qc:access-control-async-repository` with route wiring checks and an in-memory SQLite semantic save-tree gate.

## Behavioral Notes

- Auth remains `requireAuthAsync(...)`.
- Permission check remains `canReadBomDraft(...)` after async draft/submission lookup.
- Existing behavior is preserved: only Draft / Rejected drafts are mutable; invalid tree inputs throw the same BOM tree errors; save replaces the draft tree lines, marks source as `manual`, updates line count, writes `save_tree`, and writes `BomWorkbenchDraftSaved` audit evidence.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 183/183.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:bom-workbench-review-release` passed 25/25 against temporary `next dev` at `127.0.0.1:3009`.
- Temporary 3009 listener was stopped after validation.

## Boundary

This slice only covers BOM draft detail read and manual tree save. It does not migrate BOM review approve, draft create/from-assembly/import-xls, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, or storage follow-up.
