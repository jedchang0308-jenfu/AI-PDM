# RD Report: Parts Cost Resolution Async Provider Conversion

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CM

## Scope

- Converted `src/app/api/parts/[partNumber]/cost-resolution/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral approved cost profile lookup and standard cost lookup SQL.
- Extended `src/lib/numbering-async.ts` with `resolvePartCostAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for cost resolution SQL.

## Implementation Notes

- Preserved route parameter behavior through `decodeURIComponent(partNumber)`.
- Preserved query behavior for `quantity`, optional `costType`, and optional `asOf`.
- Preserved response shape: `{ resolution }`.
- Preserved invalid or missing data behavior through repository error messages.
- Preserved cost visibility redaction for users without part cost amount visibility.
- Preserved standard cost behavior when `costType` is omitted:
  - find active `part_standard_costs` row;
  - resolve the approved linked profile;
  - select the matching tier for the requested quantity;
  - calculate extended cost as `unitCost * quantity + setupCost`.
- Preserved typed profile behavior when `costType` is provided:
  - find approved profile for the requested cost type;
  - validate effective date range;
  - select the matching tier for the requested quantity.
- Kept this slice within SQLite fallback/runtime provider-neutral repository boundaries. No provider pointer was changed.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/parts/[partNumber]/cost-resolution/route.ts`.
- Direct `@/lib/db` API route count decreased from 20 to 19.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 252/252.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3042` with isolated `PDM_DATA_DIR=tmp-runtime-3cm-data` passed:
  - initialized a temporary SQLite database;
  - inserted fixture root `ROOT-RUNTIME-3CM`;
  - inserted fixture part `PN-RUNTIME-3CM`;
  - inserted primary manufacturing drawing `DRW-RUNTIME-3CM`;
  - inserted approved standard purchase cost profile and active standard cost;
  - inserted approved typed `in_house` cost profile;
  - admin demo login returned a valid session cookie;
  - GET `/api/parts/PN-RUNTIME-3CM/cost-resolution?quantity=3` returned `200`;
  - verified standard cost profile, selected tier, `unitCost=66.6`, `setupCost=4`, and `extendedCost=203.8`;
  - GET `/api/parts/PN-RUNTIME-3CM/cost-resolution?costType=in_house&quantity=5` returned `200`;
  - verified typed cost profile, selected tier, `unitCost=12.5`, `setupCost=30`, and `extendedCost=92.5`;
  - GET with `costType=in_house&quantity=1` returned `400` with `NO_PART_COST_TIER_FOR_QUANTITY`;
  - GET for missing part returned `400` with `PART_NUMBER_NOT_FOUND`;
  - temporary server, logs, pid file, port listener, and temporary data directory were cleaned up.

## Boundary

- Runtime smoke used an isolated temporary SQLite database and did not mutate local `data/ai-pdm.sqlite`.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.
- Full lint/build was intentionally skipped for this slice per the 2026-06-15 PM batch-control correction; targeted typecheck, exact route scan, QC syntax, targeted QC, and runtime smoke were used instead.

## Result

Phase 3CM is complete for parts cost resolution async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice. Per PM batch-control correction, work stops after 3CM and does not automatically continue into the next route group.
