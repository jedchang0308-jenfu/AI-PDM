# RD Report: BOM Review Approve Async Provider Slice

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration

## Scope

Convert `/api/bom/reviews/[reviewId]/approve` away from direct synchronous `@/lib/db` reads/writes and onto the provider-neutral async DB path, while preserving the existing release gate and release snapshot lifecycle behavior.

## Changes

- Added `AsyncBomWorkbenchRepository.approveReview(...)`.
- Added async `BomReleaseGateError` and provider-neutral SQL for release gate submission lookup, latest released child revision lookup, prior active release snapshot obsoletion, prior released draft obsoletion, release snapshot insertion, draft release, and review approval.
- Ported release gate behavior into the async repository: missing child item, missing child revision, child not released, and child outdated revision still block approval with `BOM_RELEASE_GATE_BLOCKED`.
- Added `approveBomWorkbenchReviewAsync(...)` in `src/lib/bom-workbench-async.ts`.
- Updated `/api/bom/reviews/[reviewId]/approve` to use async review, draft, submission, and approval helpers.
- Extended `qc:access-control-async-repository` with route wiring checks and an in-memory SQLite semantic approval / release gate.

## Behavioral Notes

- Role guard remains `requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Permission check remains `canReadSubmission(...)` after async review/draft/submission lookup.
- Existing approval behavior is preserved: non-pending review/draft state fails closed, release gate failures return 409 with issue details, successful approval creates a new active release snapshot, marks previous snapshots and released drafts obsolete, marks the current draft `Released`, marks the review `Approved`, and writes both `approve_release` edit event and `BomWorkbenchReviewApproved` audit evidence.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 187/187.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:bom-workbench-review-release` passed 25/25 against temporary `next dev` at `127.0.0.1:3011`.
- `npm.cmd run qc:bom-workbench-release-gate-resubmit` passed 43/43 against temporary `next dev` at `127.0.0.1:3011`.
- Temporary 3011 listener was stopped after validation.

## Boundary

This slice only covers the BOM review approve route. It does not migrate SolidWorks XLS import, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, live Supabase staging/prod validation, advisor/RLS review, real Postgres-mode API regression, production cutover, rollback evidence, or storage follow-up.
