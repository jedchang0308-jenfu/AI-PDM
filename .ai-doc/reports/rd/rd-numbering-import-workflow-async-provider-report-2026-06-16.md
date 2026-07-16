# RD Report: Numbering Import Workflow Async Provider

Date: 2026-06-16
Phase: 3CR
DEV: `DEV-SUPABASE-DB-001`
Slice: Numbering import workflow

## Scope

Converted the numbering import workflow API routes from direct sync `@/lib/db` access to the async provider path.

Routes converted:

- `src/app/api/numbering/import-batches/route.ts`
- `src/app/api/numbering/import-batches/[batchId]/route.ts`
- `src/app/api/numbering/import-batches/[batchId]/confirm/route.ts`

Implementation touched:

- `src/lib/repositories/numbering-async-repository.ts`
- `src/lib/numbering-async.ts`
- `scripts/qc-access-control-async-repository.mjs`

## Behavior Preserved

- Page/action permission behavior now uses async permission guards.
- Import batch list/detail response shape remains unchanged.
- Staging preserves `valid`, `need_info`, and `conflict` row classification.
- Confirm preserves valid-row promotion into root, part, drawing, primary drawing-part link, staging `legacy_keep`, and import audit behavior.
- Error mapping remains unchanged:
  - missing detail returns 404 `Import batch not found`
  - missing confirm target returns 404 through `IMPORT_BATCH_NOT_FOUND`
  - no valid rows returns 409 through `NO_VALID`
  - already confirmed returns 400 through `IMPORT_BATCH_ALREADY_CONFIRMED`

## Runtime Smoke

Temporary server:

- `next dev --hostname 127.0.0.1 --port 3035`
- isolated `PDM_DATA_DIR=output/runtime-numbering-import-1781587636411/data`
- cleanup proof: `cleanupExists=false`

HTTP coverage:

- `POST /api/auth/login` as `admin@example.com`: 200 with session cookie
- `POST /api/numbering/import-batches`: 201
- `GET /api/numbering/import-batches?limit=5`: 200 and included staged batch
- `GET /api/numbering/import-batches/{batchId}`: 200 with 3 staging rows
- `GET /api/numbering/import-batches/missing-batch`: 404
- `POST /api/numbering/import-batches/{batchId}/confirm`: 200
- repeated `POST /api/numbering/import-batches/{batchId}/confirm`: 400 with `IMPORT_BATCH_ALREADY_CONFIRMED`

Smoke batch:

- Batch ID: `1962311d-de8b-4893-9411-b71860afa9fd`
- Summary after stage: `total=3`, `valid=1`, `needInfo=1`, `conflict=1`
- Summary after confirm: `createdRoots=1`, `createdParts=1`, `createdDrawings=1`
- DB proof:
  - root `QCI87636411` created
  - part `PN-QCI-87636411-001` created
  - drawing `DRW-QCI-87636411-MA1` created
  - `primary_manufacturing` drawing-part link created
  - `numbering.import_batch.stage` and `numbering.import_batch.confirm` audit rows written
  - staging statuses after confirm: `legacy_keep=1`, `need_info=1`, `conflict=1`

## Verification

- `npx.cmd tsc --noEmit`: PASS
- exact sync DB route scan: PASS, direct `@/lib/db` API route count reduced from 8 to 5
- `node --check scripts/qc-access-control-async-repository.mjs`: PASS
- `npm.cmd run qc:access-control-async-repository`: PASS, 253/253
- runtime smoke with isolated `PDM_DATA_DIR`: PASS, cleanupExists=false
- `npm.cmd run qc:doc-paths`: PASS, 23/23
- `npm.cmd run lint`: PASS
- `npm.cmd run build`: PASS
- `git diff --check`: PASS; only existing LF/CRLF warnings were emitted

Build note: Turbopack still reports the existing NFT trace warning through `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`; this is unrelated to the numbering import workflow slice.

## Stop Point

This slice stops at direct `@/lib/db` API route count **5**.

Remaining direct routes are the final numbering admin / simulator / analysis group:

- `src/app/api/numbering/admin/matrix/route.ts`
- `src/app/api/numbering/dvt-candidates/route.ts`
- `src/app/api/numbering/impact-analysis/route.ts`
- `src/app/api/numbering/rule-simulator/route.ts`
- `src/app/api/numbering/variants/route.ts`
