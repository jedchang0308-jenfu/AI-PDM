# RD Report: Preflight Lock Async Provider Conversion

Date: 2026-06-12

## Scope

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: Phase 3BS, preflight-lock active item lock lookup async provider conversion.
- Converted `POST /api/submissions/preflight-lock` away from direct synchronous `@/lib/db` access.
- Added provider-neutral async item lock repository coverage for active lock lookup by part number or drawing number.

## Implementation

- Added `src/lib/repositories/item-lock-async-repository.ts`.
  - `EXPIRE_ASYNC_ITEM_LOCKS_SQL` releases expired locks before lookup.
  - `SELECT_ASYNC_ACTIVE_ITEM_LOCK_BY_IDENTIFIERS_SQL` finds active unreleased locks by case-insensitive part number or drawing number.
  - The lookup returns the current lock metadata plus item, submitter, and locker display fields expected by the existing route response.
- Added `src/lib/item-locks-async.ts`.
  - Exposes `findActiveItemLockForSubmissionIdentifiersAsync(...)` through `getAsyncDatabaseClient()`.
- Updated `src/app/api/submissions/preflight-lock/route.ts`.
  - Uses `findActiveItemLockForSubmissionIdentifiersAsync(...)`.
  - Keeps the existing Engineer/Admin authorization and response envelope.
- Updated `scripts/qc-access-control-async-repository.mjs`.
  - Added route/source checks to reject sync DB imports and sync lock helper use.
  - Added SQLite semantic proof for active lookup by part number, active lookup by drawing number, and expired lock release timestamp update.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 228/228.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## Runtime Smoke

- Started a temporary Next dev server at `http://127.0.0.1:3022` and stopped it after the smoke.
- Logged in as `engineer@example.com` with the local demo password.
- Selected submission `SUB-20260612-3D550288`.
- Used the existing checkout API to create a temporary active lock for smoke setup:
  - lock id: `ec97a83d-a844-4a89-8f6c-ea98cfb87d81`
  - part number: `P-BOMXLS-PARENT-40081818`
  - drawing number: `BOMXLS-PARENT-40081818`
- Verified `POST /api/submissions/preflight-lock` by drawing number returned `locked=true` and `lockedByCurrentUser=true`.
- Verified `POST /api/submissions/preflight-lock` by part number returned `locked=true` and `lockedByCurrentUser=true`.
- Verified a missing drawing number returned `locked=false`.
- Released the temporary checkout lock through the existing checkout DELETE endpoint.
- Cleaned up the temporary server, PID file, and logs.

## Boundary

- No Supabase connector calls were made.
- No migration was applied.
- No Supabase project or branch was created.
- No live Postgres validation was performed.
- No provider pointer, production cutover, or rollback operation was changed.
- The checkout create/release route still uses the sync DB helper and was used only as runtime smoke setup/cleanup for this phase.
