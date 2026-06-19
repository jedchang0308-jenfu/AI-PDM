# RD Report: Numbering Root Detail Async Provider Conversion

Date: 2026-06-14
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CE

## Scope

- Converted `src/app/api/numbering/roots/[rootCode]/route.ts` GET from synchronous numbering repository access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral SQL and mapping for root detail, part numbers, drawing numbers, drawing-part links, same-drawing variants, warning events, and numbering audit trail.
- Extended `src/lib/numbering-async.ts` with `getNumberingRootDetailAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for root detail SQL.

## Implementation Notes

- Preserved the route response shape:
  - `root`;
  - `partNumbers`;
  - `drawingNumbers`;
  - `links`;
  - `variants`;
  - `warnings`;
  - `auditTrail`;
  - `summary`.
- Preserved root lookup by decoded `rootCode`.
- Preserved `404` behavior for missing numbering roots.
- Summary counts are derived from provider-loaded child collections.
- Warning lookup scopes to root, part, and drawing entities.
- Audit trail remains numbering-action scoped and filters by root, part, or drawing tokens in parsed audit detail.
- SQL uses named parameters and avoids direct synchronous database access from the route.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/numbering/roots/[rootCode]/route.ts`.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 244/244.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3034` with isolated `PDM_DATA_DIR=tmp-runtime-3ce-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture root `ROOT-RUNTIME-3CE`;
  - inserted one part, one primary manufacturing drawing, one drawing-part link, one same-drawing variant, one warning, and one numbering audit row;
  - admin login through `POST /api/auth/login` returned user `user-admin-demo`;
  - GET `/api/numbering/roots/ROOT-RUNTIME-3CE` returned `200 OK`;
  - verified `summary.partCount: 1`;
  - verified `summary.drawingCount: 1`;
  - verified `summary.primaryManufacturingCount: 1`;
  - verified one link, one variant, one warning, and one audit trail entry;
  - temporary server, logs, pid file, and temporary data directory were cleaned up.

## Boundary

- Runtime smoke used an isolated temporary SQLite database and did not mutate local `data/ai-pdm.sqlite`.
- No local persistent audit rows were created by this slice.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3CE is complete for numbering root detail async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
