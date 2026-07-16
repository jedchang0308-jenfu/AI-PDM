# RD Report: Numbering Duplicate Check Async Provider Conversion

Date: 2026-06-12
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3BX

## Scope

- Converted `src/app/api/numbering/duplicate-check/route.ts` from synchronous `@/lib/db` access to async provider access.
- Added `src/lib/repositories/numbering-async-repository.ts` for duplicate check SQL and event/audit writes.
- Added `src/lib/numbering-async.ts` as the runtime async provider facade.
- Updated `scripts/qc-access-control-async-repository.mjs` with static and SQLite semantic coverage.

## Implementation Notes

- Preserved duplicate check behavior:
  - exact root, part, and drawing number matches are blockers;
  - core name and part name similarity still use the 70 threshold;
  - sorted matches still order by score descending, then display code;
  - warning events, duplicate check events, and audit logs are still written.
- SQL uses named parameters and avoids SQLite-only `datetime(...)` or `rowid` behavior.
- SQLite executes the async duplicate-check write sequence sequentially because the current SQLite async client intentionally rejects async transaction callbacks. Postgres uses the async transaction path.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/numbering/duplicate-check/route.ts`.
- `npm.cmd run qc:access-control-async-repository` passed 237/237.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3027` passed 3/3:
  - engineer login;
  - empty duplicate-check request returns 400;
  - valid duplicate-check request returns `{ blocked, warningsOnly, matches, warningEventId }`.

## Boundary

- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3BX is complete for the numbering duplicate-check route async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
