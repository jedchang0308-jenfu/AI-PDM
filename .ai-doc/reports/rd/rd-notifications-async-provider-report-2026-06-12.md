# RD Report: Notifications Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts `/api/notifications` from the synchronous `@/lib/db` notification read path to the provider-neutral async database contract.

The route remains a read endpoint except for the existing authentication/session behavior. It preserves the storage-evidence dashboard alert that is appended for Admin and R&D Manager users.

## Changes

- Added `src/lib/repositories/notification-async-repository.ts`.
- Added `src/lib/notifications-async.ts`.
- Rewired `src/app/api/notifications/route.ts` to call `listNotificationsAsync(...)` and `summarizeNotifications(...)` without importing `@/lib/db`.
- Added provider-neutral SQL constants for release failures, pending reviews, failed Google Drive uploads, missing release packages, and active locks.
- Kept the existing response contract: `{ notifications, summary }`.
- Kept role scoping for engineer users through bound SQL parameters.
- Replaced SQLite-only `datetime('now')` usage with a caller-provided timestamp parameter.

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- Static checks for async notification repository exports and route wiring.
- Static checks that the notification route no longer imports `@/lib/db`.
- SQL extraction checks for notification repository constants.
- SQLite semantic fixture checks for release failure, pending review, upload failure, missing package, and active lock notifications.
- Engineer scope enforcement checks.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 194/194.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3013` passed: manager login returned 200, `/api/notifications` returned 200, response included `summary` and `notifications`.
- Temporary port 3013 listener was stopped after verification.

## Boundary

This phase does not convert handoff, procurement, supplier/share/sandbox, submission legacy BOM routes, numbering repositories, parts/cost/attachments, AI/chat routes, or remaining sync repositories.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
