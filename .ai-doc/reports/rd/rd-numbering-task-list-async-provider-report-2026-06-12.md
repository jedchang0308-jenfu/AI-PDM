# RD Report: Numbering Task List Async Provider Conversion

Date: 2026-06-12
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3BZ

## Scope

- Converted `src/app/api/numbering/tasks/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral task list SQL, role assignment lookup, role scope lookup, and active delegation lookup.
- Extended `src/lib/numbering-async.ts` with `listNumberingTasksAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for task list role scope and delegation SQL.

## Implementation Notes

- Preserved route behavior for `status=open`, `handled`, `cancelled`, and `all`.
- Preserved admin behavior as unrestricted list access.
- Preserved non-admin access rules:
  - direct assignment to the user;
  - tasks created by the user;
  - assigned role membership;
  - role scope rules for project code and action code;
  - active manager delegation rules.
- Preserved delegated review marker behavior by adding the delegated marker during async mapping when access is granted through an active delegation.
- SQL uses named parameters and avoids SQLite-only `datetime(...)` or `rowid` behavior.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for `src/app/api/numbering/tasks/route.ts`.
- `npm.cmd run qc:access-control-async-repository` passed 239/239.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3029` passed:
  - admin demo login returned `303 See Other` with a session cookie;
  - GET `/api/numbering/tasks?status=open` returned `200 OK`;
  - response included `generatedAt` and `tasks` JSON fields;
  - temporary server, cookie, header, body, pid, and log files were cleaned up.

## Boundary

- Runtime smoke did not insert a task fixture because the local `data/ai-pdm.sqlite` file in this workspace does not currently contain the numbering task tables; task row behavior is covered by the in-memory SQLite semantic QC fixture instead.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3BZ is complete for the numbering task list route async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
