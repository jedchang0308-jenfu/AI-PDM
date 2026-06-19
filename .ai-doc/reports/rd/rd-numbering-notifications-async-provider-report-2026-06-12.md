# RD Report: Numbering Notifications Async Provider Conversion

Date: 2026-06-12
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CA

## Scope

- Converted `src/app/api/numbering/notifications/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Converted `src/app/api/numbering/notifications/[notificationId]/read/route.ts` POST from synchronous `@/lib/db` access to async provider access.
- Converted `src/app/api/numbering/notifications/[notificationId]/handled/route.ts` POST from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral notification list, notification lookup, and notification state update SQL.
- Extended `src/lib/numbering-async.ts` with `listNumberingNotificationsAsync(...)` and `updateNumberingNotificationStateAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for notification list and state update SQL.

## Implementation Notes

- Preserved read filters: `all`, `read`, and `unread`.
- Preserved handled filters: `all`, `handled`, and `unhandled`.
- Preserved admin unrestricted access and non-admin access through recipient id, creator id, recipient role, role scope, and active delegation.
- Preserved notification state behavior:
  - read marking sets `read_at` only when currently empty;
  - handled marking sets `handled_at` only when currently empty;
  - handled marking updates `handled_by`;
  - non-dismissible notifications still reject handled updates.
- SQL uses named parameters and avoids SQLite-only `datetime(...)` or `rowid` behavior.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for the three numbering notification routes.
- `npm.cmd run qc:access-control-async-repository` passed 240/240.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3030` passed:
  - admin demo login returned `303 See Other` with a session cookie;
  - GET `/api/numbering/notifications?read=unread&handled=unhandled` returned `200 OK` and found the temporary notification fixture;
  - POST `/api/numbering/notifications/notification-runtime-async-3030/read` returned `200 OK` with `readAt`;
  - POST `/api/numbering/notifications/notification-runtime-async-3030/handled` returned `200 OK` with `handledAt`;
  - temporary notification row, server, cookie, header, body, pid, and log files were cleaned up.

## Boundary

- Runtime smoke used a temporary local SQLite notification row only; no production data was touched.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3CA is complete for numbering notification list/read/handled async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
