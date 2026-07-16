# RD Report: BOM Submit Review Async Provider Slice

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration

## Scope

Convert `/api/bom/drafts/[draftId]/submit-review` away from direct synchronous `@/lib/db` reads/writes and onto the provider-neutral async DB path.

## Changes

- Added `AsyncBomWorkbenchRepository.submitReview(...)`.
- Added `SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL`.
- Added `SUBMIT_ASYNC_BOM_WORKBENCH_DRAFT_REVIEW_SQL`.
- Added `INSERT_ASYNC_BOM_WORKBENCH_REVIEW_SQL`.
- Added `submitBomWorkbenchDraftReviewAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/drafts/[draftId]/submit-review` to use async draft, submission, and submit-review helpers.
- Extended `qc:access-control-async-repository` with static route wiring checks and an in-memory SQLite semantic submit-review gate.

## Behavioral Notes

- Auth remains `requireAuthAsync(...)`.
- Permission check remains `canReadBomDraft(...)` after async draft/submission lookup.
- Existing behavior is preserved: immutable drafts fail, blank change reason returns `BOM_REVIEW_CHANGE_REASON_REQUIRED`, existing same parent/revision pending review returns `BOM_PENDING_REVIEW_EXISTS`, successful submission increments `review_attempt`, creates a pending review request, writes an edit event, and writes `BomWorkbenchReviewSubmitted` audit evidence.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 181/181.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:bom-workbench-review-release` passed 25/25 against temporary `next dev` at `127.0.0.1:3008`.
- Temporary 3008 listener was stopped after validation.

## Boundary

This slice only covers the BOM draft submit-review route. It does not migrate BOM review approve, draft create/save/from-assembly/import-xls, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, or storage follow-up.
