# RD Report: Numbering Monthly Audit Reports Async Provider Conversion

Date: 2026-06-12
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CC

## Scope

- Converted `src/app/api/numbering/monthly-audit-reports/route.ts` GET and POST from synchronous `@/lib/db` access to async provider access.
- Converted `src/app/api/numbering/monthly-audit-reports/[reportId]/route.ts` GET from synchronous `@/lib/db` access to async provider access.
- Extended `src/lib/repositories/numbering-async-repository.ts` with provider-neutral monthly audit count SQL, per-department report page generation, report insert/list/get SQL, and audit write.
- Extended `src/lib/numbering-async.ts` with `generateMonthlyNumberingAuditReportAsync(...)`, `getMonthlyNumberingAuditReportAsync(...)`, and `listMonthlyNumberingAuditReportsAsync(...)`.
- Updated `scripts/qc-access-control-async-repository.mjs` with static checks and SQLite semantic coverage for monthly report counts, role-specific open task and approval rule counts, project buckets, report insert/list/get, and audit SQL.

## Implementation Notes

- Preserved report type `numbering_master`.
- Preserved manual generation mode and generated-by attribution.
- Preserved list limit clamping to 1..100 with fallback 20.
- Preserved detail query payload shape with `counts`, `projectBuckets`, and `departments`.
- SQL uses named parameters and avoids SQLite-only `datetime(...)` or `rowid` behavior.
- SQLite uses sequential writes for the generate flow because the shared SQLite async client intentionally rejects async callbacks inside synchronous SQLite transactions; Postgres keeps transaction-backed behavior through the async provider.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for the two numbering monthly audit report routes.
- `npm.cmd run qc:access-control-async-repository` passed 242/242.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Runtime smoke on temporary `next dev` `http://127.0.0.1:3032` passed:
  - admin demo login returned `303 See Other` with a session cookie;
  - POST `/api/numbering/monthly-audit-reports` returned `201 Created` for report month `2026-06`;
  - GET `/api/numbering/monthly-audit-reports?reportMonth=2026-06&limit=5` returned `200 OK` and included report `8ceb8240-ed59-4e8a-a40d-7aac58fa75cb`;
  - GET `/api/numbering/monthly-audit-reports/8ceb8240-ed59-4e8a-a40d-7aac58fa75cb` returned `200 OK` with `status: "completed"`, `reportType: "numbering_master"`, and `query.counts`;
  - temporary server and files were cleaned up.
- `npm.cmd run qc:doc-paths` passed 23/23.
- Final direct `@/lib/db` API route mentions after this slice: 29.

## Boundary

- Runtime smoke created one local SQLite monthly audit report row and two append-only audit rows.
- The temporary monthly audit report row was deleted after smoke.
- Local audit rows `91094a84-b0bf-4e90-96e3-977c80c41eeb` and `54090252-90dd-4bb3-8e12-8152b5b6d18c` remain because `AUDIT_LOG_APPEND_ONLY` prevents audit deletion by design; this is local development database evidence, not production data.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3CC is complete for numbering monthly audit report list/create/detail async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice.
