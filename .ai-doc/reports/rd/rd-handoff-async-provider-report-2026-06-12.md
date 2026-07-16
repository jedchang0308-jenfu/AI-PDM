# RD Report: Handoff Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts manufacturing handoff read endpoints from the synchronous `@/lib/db` `listManufacturingHandoffEntries(...)` path to provider-neutral async database access.

Covered routes:

- `/api/handoff`
- `/api/handoff/export`
- `/api/integrations/procurement/releases`

## Changes

- Added `src/lib/repositories/handoff-async-repository.ts`.
- Added `src/lib/handoff-async.ts`.
- Rewired handoff JSON, handoff CSV export, and procurement release integration routes to call `listManufacturingHandoffEntriesAsync(...)`.
- Preserved existing role and user scoping:
  - `/api/handoff` and `/api/handoff/export` use `requireAuthAsync(...)` and `scopedSubmittedBy(...)`.
  - `/api/integrations/procurement/releases` uses `requireRoleAsync(...)` for R&D Manager / Admin.
- Preserved latest Released submission per item behavior.
- Preserved response contracts for handoff JSON, handoff CSV, and procurement release JSON.

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- Static checks for `AsyncHandoffRepository`, SQL constants, and helper wiring.
- Static checks that handoff/procurement release routes use `@/lib/handoff-async` and do not import `@/lib/db`.
- SQLite semantic checks proving:
  - Latest Released submission per item is selected.
  - Superseded older Released rows are excluded.
  - `submittedBy` scope is enforced.
  - `limit` is honored.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 199/199.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3014` passed:
  - manager login returned 200.
  - `/api/handoff` returned 200 with `count` and `entries`.
  - `/api/handoff/export` returned 200 with CSV content type and quoted CSV header.
  - `/api/integrations/procurement/releases?limit=5` returned 200 with `integration=procurement`, `schema_version=1`, and `entries`.
- Temporary port 3014 listener was stopped after verification.

## Boundary

This phase does not convert procurement sync-run write/decision routes, supplier response/share/sandbox routes, submission legacy BOM routes, numbering repositories, parts/cost/attachments, AI/chat routes, or remaining sync repositories.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
