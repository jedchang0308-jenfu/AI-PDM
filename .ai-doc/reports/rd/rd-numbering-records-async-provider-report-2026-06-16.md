# RD Report - Numbering Records Async Provider Migration

Date: 2026-06-16
Phase: 3CP
Task: `DEV-SUPABASE-DB-001`

## Scope

Converted the numbering records mutation route slice from direct sync `@/lib/db` access to async provider-backed repository access.

Routes covered:

- `src/app/api/numbering/records/route.ts`
- `src/app/api/numbering/records/[rootCode]/route.ts`
- `src/app/api/numbering/records/[rootCode]/obsolete/route.ts`

## Changes

- Added async numbering record lifecycle methods to `AsyncNumberingRepository`:
  - `createNumberingRecord`
  - `updateDraftNumberingRecord`
  - `obsoleteDraftNumberingRecord`
- Added provider-neutral SQL constants for numbering sequence allocation, root/part/drawing insertion, drawing-part linking, draft update, obsolete transition, and audit insert reuse.
- Exposed async runtime helpers:
  - `createNumberingRecordAsync`
  - `updateDraftNumberingRecordAsync`
  - `obsoleteDraftNumberingRecordAsync`
- Updated three API routes to use async helpers and async permission guards.
- Extended `scripts/qc-access-control-async-repository.mjs` so the numbering async provider gate covers numbering records routes.

## Preserved Behavior

- Response shape for create/update/obsolete routes.
- Permission actions:
  - `numbering.create`
  - `numbering.draft.update`
  - `numbering.draft.obsolete`
- Numbering sequence format:
  - root code: `0001`
  - part number: `P-<root>-<sequence>`
  - drawing number: `D-<root>-<purpose><sequence>`
- Draft mutability rules: only `Draft` and `NeedInfo` are mutable.
- Existing error status mapping for required fields, not found, not draft, and uniqueness failures.
- Audit actions:
  - `numbering.create`
  - `numbering.draft.update`
  - `numbering.draft.obsolete`

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route sync DB scan passed:
  - `src/app/api/numbering/records/route.ts`: `dbImport=False`, `syncCall=False`
  - `src/app/api/numbering/records/[rootCode]/route.ts`: `dbImport=False`, `syncCall=False`
  - `src/app/api/numbering/records/[rootCode]/obsolete/route.ts`: `dbImport=False`, `syncCall=False`
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed: 253/253.
- Runtime smoke with isolated `PDM_DATA_DIR` passed: 17/17.
  - Created root `0001`, part `P-0001-001`, drawing `D-0001-MA1`.
  - Updated root, part, and drawing purpose description.
  - Missing obsolete reason returned `400` with `reason is required`.
  - Obsolete transitioned root, part, and drawing to `Obsolete`.
  - Update after obsolete returned `409` with `NUMBERING_ROOT_NOT_DRAFT`.
  - Audit rows recorded create/update/obsolete exactly once.
  - Primary MA drawing link existed.
  - Isolated temp data cleanup proof: `cleanupExists=False`.
- `npm.cmd run qc:doc-paths` passed: 23/23.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed; existing Turbopack NFT trace warning remains unrelated to this slice.
- `git diff --check` found no whitespace errors; only existing LF/CRLF warnings were reported.

## Direct DB Route Count

- Before slice: 15
- After slice: 12

## Stop Point

Per PM-dev operating rule, this slice stops here. Recommended next slice: numbering approval workflow.
