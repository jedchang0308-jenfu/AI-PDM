# RD Report: BOM Active Draft Async Provider Slice

Date: 2026-06-12
Task: DEV-SUPABASE-DB-001
Scope: Convert `/api/bom/drafts/[draftId]/active` away from sync `@/lib/db` access and into the provider-neutral async database path.

## Changes

- Added `setActiveDraft` to `AsyncBomWorkbenchRepository`.
- Added provider-neutral SQL constants for active draft switching, BOM edit event insertion, and audit log insertion.
- Added `setBomWorkbenchActiveDraftAsync` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/drafts/[draftId]/active` to use async auth, async submission lookup, async BOM draft lookup, and async active draft mutation.
- Expanded `qc:access-control-async-repository` with a static route wiring check and an in-memory SQLite semantic gate for active draft switching.

## Behavioral Notes

- Draft mutability remains limited to `Draft` and `Rejected`.
- Activating a draft deactivates other active mutable drafts for the same parent item and revision.
- The mutation still writes the expected `bom_edit_events` and `audit_logs` evidence.
- SQLite uses the async repository directly for the operation because `SQLiteAsyncDatabaseClient` intentionally rejects async transaction callbacks. Postgres uses the async transaction path.

## Verification

- `npm.cmd run qc:access-control-async-repository`: passed 171/171.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:bom-workbench-foundation`: passed 27/27 against temporary `next dev` on `127.0.0.1:3003`.
- `npm.cmd run qc:bom-workbench-tree-rules`: passed 22/22 against temporary `next dev` on `127.0.0.1:3003`.
- `npm.cmd run qc:bom-workbench-review-release`: passed 25/25 against temporary `next dev` on `127.0.0.1:3003`.
- `npm.cmd run build`: passed with the existing Turbopack NFT tracing warning.

## Boundary

This is a narrow provider-neutral runtime slice. It does not complete the full Supabase DB runtime migration. Remaining work still includes other BOM draft create/save/diff/review/release/export paths, other sync repositories/routes, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, and storage follow-up gates.
