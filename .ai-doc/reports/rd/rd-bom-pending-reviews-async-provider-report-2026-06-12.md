# RD Report: BOM Pending Reviews Async Provider Slice

Date: 2026-06-12
Task: DEV-SUPABASE-DB-001
Scope: Convert `/api/bom/reviews/pending` away from sync `@/lib/db` access and into the provider-neutral async database path.

## Changes

- Added `listPendingReviews` to `AsyncBomWorkbenchRepository`.
- Added provider-neutral SQL for pending BOM workbench review lookup.
- Reused the async draft diff path so each pending review still includes its diff payload.
- Added `listPendingBomWorkbenchReviewsAsync` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/reviews/pending` to use the async helper and remove sync `@/lib/db` import.
- Expanded `qc:access-control-async-repository` with pending review route static wiring checks and a SQLite semantic gate for review metadata and diff baseline joins.

## Behavioral Notes

- The route remains manager/admin-only through `requireRoleAsync`.
- Pending reviews are limited to rows where both the review request and the draft are `PendingReview`.
- Sorting is provider-neutral: `submitted_at DESC, id DESC`.
- Review responses still include submitter display name, parent item/drawing metadata, draft metadata, and diff payload.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs`: passed.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run qc:access-control-async-repository`: passed 175/175.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run build`: passed with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:bom-workbench-review-ui`: passed 32/32 against temporary `next dev` on `127.0.0.1:3005`; this gate verifies the pending review API includes the seeded review and renders the review diff UI.

## Boundary

This slice only migrates the pending review read route. It does not migrate review approve/reject, draft tree save, draft creation from assembly/XLS, submit-review, release export, other sync repositories, live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, rollback evidence, or storage live provider gates.
