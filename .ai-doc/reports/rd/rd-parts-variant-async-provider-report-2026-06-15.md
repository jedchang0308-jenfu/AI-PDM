# RD Report: Parts Variant Async Provider Conversion

Date: 2026-06-15
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CJ

## Scope

- Converted `src/app/api/parts/[partNumber]/variant/route.ts` PUT from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral part variant upsert SQL and audit write.
- Extended `src/lib/numbering-async.ts` with `upsertPartVariantAttributesAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for part variant SQL.

## Implementation Notes

- Preserved route parameter behavior through `decodeURIComponent(partNumber)`.
- Preserved request field aliases:
  - camelCase fields such as `materialCode`;
  - snake_case fields such as `material_code`.
- Preserved route response shape: `{ part }`.
- Preserved missing part behavior: invalid part numbers return `400` with the repository error message.
- Preserved audit action `numbering.part_variant.upsert`.
- Kept update and readback on the same async client inside the Postgres transaction path.
- Kept this slice within SQLite fallback/runtime provider-neutral repository boundaries. No provider pointer was changed.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/parts/[partNumber]/variant/route.ts`.
- Direct `@/lib/db` API route count decreased from 23 to 22.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 249/249.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3039` with isolated `PDM_DATA_DIR=tmp-runtime-3cj-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture root `ROOT-RUNTIME-3CJ`;
  - inserted fixture part `PN-RUNTIME-3CJ`;
  - inserted primary manufacturing drawing `DRW-RUNTIME-3CJ`;
  - admin demo login returned a valid session cookie;
  - PUT `/api/parts/PN-RUNTIME-3CJ/variant` inserted variant attributes;
  - second PUT `/api/parts/PN-RUNTIME-3CJ/variant` updated variant attributes through snake_case aliases;
  - verified response part number, primary drawing, material code, material label, color code, and surface treatment;
  - PUT `/api/parts/PN-RUNTIME-3CJ-MISSING/variant` returned `400` with `PART_NUMBER_NOT_FOUND`;
  - verified two `numbering.part_variant.upsert` audit rows were written, including the update payload;
  - temporary server, logs, pid file, and temporary data directory were cleaned up.

## Boundary

- Runtime smoke used an isolated temporary SQLite database and did not mutate local `data/ai-pdm.sqlite`.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3CJ is complete for parts variant async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice. Per PM batch-control correction, work stops after 3CJ and does not automatically continue into Phase 3CK.
