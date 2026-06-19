# RD Report: Submission BOM Async Provider Conversion

Date: 2026-06-12
Task: DEV-SUPABASE-DB-001 Supabase DB runtime migration
Phase: 3BV submission BOM route async provider conversion

## Scope

- Converted submission BOM API routes from synchronous `@/lib/db` helpers to async provider helpers:
  - `src/app/api/submissions/[id]/bom/route.ts`
  - `src/app/api/submissions/[id]/bom/export/route.ts`
  - `src/app/api/submissions/[id]/bom/diff/route.ts`
- Added `src/lib/repositories/bom-async-repository.ts`.
- Added `src/lib/bom-async.ts`.
- Extended `scripts/qc-access-control-async-repository.mjs` with static and SQLite semantic coverage for submission BOM detail, materialize, previous BOM lookup, and route sync-DB regression checks.

## Implementation Notes

- `AsyncBomRepository` now exposes:
  - `getBomBySubmissionId`
  - `materializeBomDraftFromReferences`
  - `findPreviousBomSubmissionId`
  - `getBomDiffBetweenSubmissions`
- Provider-neutral SQL avoids SQLite-only `datetime(...)` and `rowid` ordering.
- BOM materialization uses async `execute(...)` calls and writes `BomDraftMaterialized` through `AsyncAuditRepository`.
- The route behavior remains the same at the API boundary: auth guard, `canReadSubmission`, BOM export CSV/XLS, explicit and previous BOM diff, and no-BOM error handling are preserved.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact BOM route scan found no sync DB/helper match:
  - `NO_SUBMISSION_BOM_SYNC_DB_MATCHES`
- `npm.cmd run qc:access-control-async-repository` passed 233/233.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through:
  - `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`

## Runtime Smoke

- Temporary `next dev` on `http://127.0.0.1:3025` was started and cleaned up.
- `npm.cmd run qc:bom-productized` passed 23/23 against the temporary server.
- API-only BOM smoke passed 8/8:
  - Engineer and manager login.
  - Created BOM revision A and B submissions.
  - `GET /api/submissions/{id}/bom` returned target BOM lines.
  - `GET /api/submissions/{id}/bom/export?format=csv` returned CSV containing BOM child data.
  - `GET /api/submissions/{id}/bom/diff?baseSubmissionId={baseId}` returned added/removed/changed/unchanged counts of 1 each.
  - `GET /api/submissions/{id}/bom/diff?...&format=csv` returned a changed child row.
- `npm.cmd run qc:bom-diff-productized` was also attempted. Its API checks passed through `BDIFF-008`, but the script then failed in the UI section waiting for a visible text locator while the matching metadata span was hidden. This is recorded as a UI locator issue outside the API provider conversion boundary.

## Boundary

- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3BV is complete for the submission BOM API async provider conversion. The remaining direct route `@/lib/db` imports are outside this slice.
