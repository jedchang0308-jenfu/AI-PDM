# RD Report: BOM Review Reject Async Provider Slice

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration

## Scope

Convert `/api/bom/reviews/[reviewId]/reject` away from direct synchronous `@/lib/db` reads/writes and onto the provider-neutral async DB path.

## Changes

- Added `AsyncBomWorkbenchRepository.getReviewById(...)`.
- Added `AsyncBomWorkbenchRepository.rejectReview(...)`.
- Added `SELECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL`, `REJECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL`, and `REJECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL`.
- Added `getBomWorkbenchReviewByIdAsync(...)` and `rejectBomWorkbenchReviewAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/reviews/[reviewId]/reject` to use async review, draft, submission, and reject helpers.
- Extended `qc:access-control-async-repository` with static route wiring checks and an in-memory SQLite semantic reject gate.

## Behavioral Notes

- Role guard remains `requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Permission check remains `canReadSubmission(...)` after async review/draft/submission lookup.
- Reject behavior preserves the existing sync semantics: non-pending reviews fail with `BOM_REVIEW_NOT_PENDING`, the draft becomes `Rejected`, the review records reviewer / decision reason / reviewed timestamp, and both edit event and audit log are written.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 179/179.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:bom-workbench-review-release` passed 25/25 against temporary `next dev` at `127.0.0.1:3007`.
- Temporary 3007 listener was stopped after validation.

## Boundary

This slice only covers the BOM review reject route. It does not migrate BOM review approve, draft create/save/from-assembly/import-xls/submit-review, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, or storage follow-up.
