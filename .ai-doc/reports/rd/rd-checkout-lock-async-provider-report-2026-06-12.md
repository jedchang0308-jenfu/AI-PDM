# RD Report: Checkout Lock Async Provider Conversion

Date: 2026-06-12

## Scope

- Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.
- Phase: Phase 3BT, checkout lock create/release route async provider conversion.
- Converted `POST /api/submissions/[id]/checkout` and `DELETE /api/submissions/[id]/checkout` away from direct synchronous `@/lib/db` access.
- Preserved Engineer/Admin authorization, submission read permission checks, same-user lock reuse, other-user lock conflict, admin force release, release=false behavior, and checkout audit actions.

## Implementation

- Updated `src/lib/repositories/item-lock-async-repository.ts`.
  - Added provider-neutral SQL for submission item lookup, active item lock lookup by item id, item lock insert, and item lock release.
  - Added `createItemLock(...)` with stale-lock expiry, same-user reuse, active-lock conflict, new lock insert, and `CheckoutLockCreated` audit.
  - Added `releaseItemLock(...)` with active-lock lookup, owner/admin authorization, release update, and `CheckoutLockReleased` audit.
- Updated `src/lib/item-locks-async.ts`.
  - Added `createItemLockAsync(...)` and `releaseItemLockAsync(...)`.
- Updated `src/app/api/submissions/[id]/checkout/route.ts`.
  - Uses `getSubmissionAsync(...)`, `createItemLockAsync(...)`, and `releaseItemLockAsync(...)`.
  - No longer imports synchronous `@/lib/db`.
- Updated `scripts/qc-access-control-async-repository.mjs`.
  - Static gate now rejects sync DB/helper usage in checkout route.
  - SQLite semantic proof now covers checkout lock create, release, and audit writes.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact checkout route scan found no sync DB/helper match.
- `npm.cmd run qc:access-control-async-repository` passed 229/229.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.

## Runtime Smoke

- Started a temporary Next dev server at `http://127.0.0.1:3023` and stopped it after the smoke.
- Logged in as `engineer@example.com` with the local demo password.
- Selected unlocked submission `SUB-20260612-3D550288`.
- `POST /api/submissions/SUB-20260612-3D550288/checkout` created lock `7197b44e-8da3-429e-9e3f-5056413f1c38` with `reused=false`.
- Repeating the POST reused the same current-user lock with `reused=true`.
- `POST /api/submissions/preflight-lock` saw the checkout lock and returned `locked=true`.
- `DELETE /api/submissions/SUB-20260612-3D550288/checkout` released the lock with `released=true`.
- A second DELETE returned `released=false`.
- Cleaned up the temporary server, PID file, and logs.

## Boundary

- No Supabase connector calls were made.
- No migration was applied.
- No Supabase project or branch was created.
- No live Postgres validation was performed.
- No provider pointer, production cutover, or rollback operation was changed.
