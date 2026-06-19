# RD Report: BOM Draft Diff Async Provider Slice

Date: 2026-06-12
Task: DEV-SUPABASE-DB-001
Scope: Convert `/api/bom/drafts/[draftId]/diff` away from sync `@/lib/db` access and into the provider-neutral async database path.

## Changes

- Added `getDraftDiff` to `AsyncBomWorkbenchRepository`.
- Added provider-neutral SQL for latest release snapshot lookup.
- Moved BOM workbench line comparison behavior into the async repository path for draft diff reads.
- Added `getBomWorkbenchDraftDiffAsync` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/drafts/[draftId]/diff` to use async auth, async submission lookup, async BOM draft lookup, and async draft diff lookup.
- Expanded `qc:access-control-async-repository` with diff route static wiring checks and a SQLite semantic baseline snapshot gate.

## Behavioral Notes

- The route remains read-only.
- The diff still compares the current draft against the latest non-self release snapshot for the same parent item.
- The diff summary preserves added, removed, changed, and unchanged counts.
- Changed fields still include revision, quantity, hierarchy, and sequence.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs`: passed.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run qc:access-control-async-repository`: passed 173/173.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:bom-workbench-review-release`: passed 25/25 against temporary `next dev` on `127.0.0.1:3004`.
- `npm.cmd run qc:bom-workbench-review-ui`: passed 32/32 against temporary `next dev` on `127.0.0.1:3004`; this gate verifies draft diff API base snapshot, added/changed lines, quantity and hierarchy fields, and rendered diff table.
- `npm.cmd run build`: passed with the existing Turbopack NFT tracing warning.

## Boundary

This slice only migrates the draft diff read route. It does not migrate draft tree save, draft creation from assembly/XLS, submit-review, pending reviews, approve/reject, release export, other sync repositories, live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, rollback evidence, or storage live provider gates.
