# RD Report: Numbering Export Jobs Async Provider Conversion

Date: 2026-06-12
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CB

## Scope

- Converted `src/app/api/numbering/export-jobs/route.ts` GET and POST from synchronous `@/lib/db` access to async provider access.
- Converted `src/app/api/numbering/export-jobs/[jobId]/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral export payload SQL, export job insert/list/get SQL, and export audit write.
- Extended `src/lib/numbering-async.ts` with `createNumberingExportJobAsync(...)`, `getNumberingExportJobAsync(...)`, and `listNumberingExportJobsAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for export payload, job insert/list/get, and audit SQL.

## Implementation Notes

- Preserved export modes: `no_audit`, `last_change_summary`, and `full_change_summary`.
- Preserved completed-on-create behavior.
- Preserved payload shape:
  - `exportMode`;
  - `generatedAt`;
  - `roots`;
  - `parts`;
  - `drawings`;
  - `auditSummary` for non-`no_audit` modes.
- Preserved list limit clamping to 1..100 with fallback 20.
- SQL uses named parameters and avoids SQLite-only `datetime(...)` or `rowid` behavior.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for the two numbering export-job routes.
- `npm.cmd run qc:access-control-async-repository` passed 241/241.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3031` passed:
  - admin demo login returned `303 See Other` with a session cookie;
  - POST `/api/numbering/export-jobs` returned `201 Created` for `last_change_summary`;
  - GET `/api/numbering/export-jobs?limit=5` returned `200 OK` and included the created job;
  - GET `/api/numbering/export-jobs/{jobId}` returned `200 OK` with `status: "completed"` and `auditSummary`;
  - temporary server, cookie, header, body, pid, and log files were cleaned up.

## Boundary

- Runtime smoke created one local SQLite export job and one append-only audit row.
- The temporary export job row was deleted after smoke.
- The local audit row remains because `AUDIT_LOG_APPEND_ONLY` prevents deletion by design; this is local development database evidence, not production data.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3CB is complete for numbering export-job list/create/detail async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
