# QC Supabase Runtime Smoke Report Template

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-dev / QC execution evidence template
Status: Template only; GATE-B execution not performed

## 1. Approval Record

Use this section only after explicit PM approval.

| Field | Value |
|---|---|
| Approval source | `<PM approval message / issue / ticket>` |
| Approval timestamp | `<YYYY-MM-DD HH:mm TZ>` |
| Approved target | `AI_PDM_STAGING` |
| Approved scope | Staging runtime smoke only |
| Approval statement | `I approve DEV-SUPABASE-DB-001-GATE-B staging runtime smoke against AI_PDM_STAGING only, with non-production smoke data, server-side credentials, rollback proof, cleanup proof, and no production cutover.` |

## 2. Target Identity Evidence

| Evidence | Result |
|---|---|
| `PDM_SUPABASE_TARGET_NAME` | `AI_PDM_STAGING` |
| Target guard command | `npm.cmd run db:postgres:guard -- --phase compare` |
| Target guard result | `<pass/fail, with secret values redacted>` |
| Target identity receipt | `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md` |
| Target Postgres major version | `<version / not captured>` |
| Migration history command | `supabase migration list` |
| Migration history result | `<pass/fail/exception path, with project ref and secrets redacted>` |
| Schema/RLS compare command | `npm.cmd run db:postgres:compare:schema-rls -- --no-write` |
| Schema/RLS compare result | `<pass/fail>` |

Stop if target identity is unknown, points to `ProJED`, points to `ProJED_TEST`, points to production, or requires committing credentials.

## 3. Redacted Runtime Environment

Record only environment variable names and configured/missing status. Do not record values.

| Env name | Expected | Observed |
|---|---|---|
| `PDM_RUNTIME_SMOKE_APPROVED` | `true` | `<configured/missing>` |
| `PDM_SUPABASE_TARGET_NAME` | `AI_PDM_STAGING` | `<configured/missing>` |
| `PDM_DB_PROVIDER` | `postgres` for approved smoke process only | `<configured/missing>` |
| `PDM_POSTGRES_URL` | server-side only | `<configured/missing>` |
| `PDM_POSTGRES_SHADOW_URL` | server-side only | `<configured/missing>` |
| `PDM_POSTGRES_POOLER_MODE` | `<direct/session/transaction>` | `<configured/missing>` |

Secret values redacted: `<yes/no>`

## 4. Auth Session Evidence

Use the approved auth/session boundary before execution:

- [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md)
- `npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary`

Record only cookie names and configured/missing status. Do not record cookie values, `set-cookie` values, passwords, bearer tokens, or auth secrets.

| Evidence | Expected | Result |
|---|---|---|
| Login method | `POST /api/auth/login` or PM-approved equivalent app session | `<method/status>` |
| Session cookie name | `pdm_session` | `<set/missing; no value>` |
| `/api/auth/me` | Authenticated test user with `Admin` or approved equivalent role | `<status/role>` |
| Required permissions | `settings.admin_matrix`, `numbering.duplicate_check`, `numbering.create`, `numbering.search`, `numbering.draft.obsolete` | `<confirmed/blocked>` |
| Logout | `POST /api/auth/logout` clears app session | `<status/cleared>` |

## 5. Preflight And Command Evidence

| Command | Expected | Result |
|---|---|---|
| `npm.cmd run qc:supabase-runtime-gate-b-local-suite` | pass before approval execution; no live target command included | `<pass/fail>` |
| `npm.cmd run qc:supabase-runtime-smoke-preflight` | `ready` after approval and credentials | `<pass/fail>` |
| `npm.cmd run qc:supabase-secret-boundary` | pass | `<pass/fail>` |
| `npm.cmd run qc:supabase-runtime-migrations` | pass | `<pass/fail>` |
| `npm.cmd run qc:db-provider-postgres` | pass with live probe intentionally configured | `<pass/fail>` |
| `rg -n "@/lib/db" src/app/api --glob route.ts` | no matches | `<pass/fail>` |

## 6. Smoke API Matrix

Use the approved matrix before execution:

- [.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md)
- `npm.cmd run qc:supabase-runtime-smoke-api-matrix`

| Step | Command or API | Expected evidence | Status | Notes |
|---|---|---|---|---|
| `db_provider_connection` | `npm.cmd run qc:db-provider-postgres` | Provider connects to `AI_PDM_STAGING`; env values redacted. | `<pending/pass/fail>` | `<notes>` |
| `schema_rls_compare` | `npm.cmd run db:postgres:compare:schema-rls -- --no-write` | Schema/RLS-only compare passes. | `<pending/pass/fail>` | `<notes>` |
| `read_path_admin_matrix` | `GET /api/numbering/admin/matrix` | Status and compact response shape recorded. | `<pending/pass/fail>` | `<notes>` |
| `read_path_rule_simulator` | `POST /api/numbering/rule-simulator` | Status and compact response shape recorded. | `<pending/pass/fail>` | `<notes>` |
| `pre_write_duplicate_guard` | `POST /api/numbering/duplicate-check` | Duplicate-check status and compact response shape recorded before write. | `<pending/pass/fail>` | `<notes>` |
| `write_path_numbering_smoke_record` | `POST /api/numbering/records` | Smoke record created with unique prefix, owner, and expiry. | `<pending/pass/fail>` | `<notes>` |
| `readback_created_record` | `GET /api/numbering/roots/<rootCode>` | Created smoke record can be read back through app API. | `<pending/pass/fail>` | `<notes>` |
| `cleanup_smoke_record` | `POST /api/numbering/records/<rootCode>/obsolete` | Created smoke record obsoleted, removed by approved DB cleanup, or explicitly listed as retained with owner and expiry. | `<pending/pass/fail>` | `<notes>` |
| `rollback_sqlite_mode` | `npm.cmd run qc:supabase-runtime-rollback-readiness` and `npm.cmd run qc:db-provider-contract` | Runtime returns to SQLite/unset mode and local provider contract passes. | `<pending/pass/fail>` | `<notes>` |

## 7. Smoke Data Ledger

Only non-production smoke records are allowed.

| Field | Value |
|---|---|
| Smoke prefix | `<unique smoke prefix>` |
| Owner | `<owner>` |
| Expiry | `<YYYY-MM-DD HH:mm TZ>` |
| Created IDs | `<IDs or none>` |
| Cleanup command/API | `<command/API>` |
| Cleanup result | `<removed/retained with owner/fail>` |
| Remaining known residue | `<none/list with owner and reason>` |

Not allowed: production customer data, CAD files, release packages, handoff packages, field-test artifacts, QC artifacts, file blobs, browser-side direct Supabase Data API access to base tables, or production cutover.

## 8. Rollback Verification

| Command | Expected | Result |
|---|---|---|
| `Remove-Item Env:\PDM_DB_PROVIDER -ErrorAction SilentlyContinue` | Postgres provider env removed | `<done/not done>` |
| `Remove-Item Env:\PDM_POSTGRES_URL -ErrorAction SilentlyContinue` | Runtime URL removed from process | `<done/not done>` |
| `npm.cmd run qc:supabase-runtime-rollback-readiness` | pass | `<pass/fail>` |
| `npm.cmd run qc:db-provider-contract` | pass in SQLite/unset mode | `<pass/fail>` |
| `npm.cmd run qc:supabase-secret-boundary` | pass | `<pass/fail>` |

Rollback proof must be captured before any provider pointer change is treated as successful.

## 9. Advisor And Residual Risk

| Item | Result |
|---|---|
| Supabase advisor check | `<pass/fail/not run with reason>` |
| RLS or exposed-table P0/P1 blocker | `<none/list>` |
| Data API / GraphQL table exposure used | `<no/yes with approval reference>` |
| Postgres 14 finding | `<none/list with PM decision>` |
| Migration-history exception used | `<no/yes with ADR reference>` |
| Residual risks | `<none/list>` |
| Follow-up owner | `<owner>` |

## 10. Final Disposition

Choose one:

- `pass`: staging runtime smoke passed, cleanup proof captured, rollback proof captured.
- `fail`: staging runtime smoke failed; rollback and cleanup status recorded.
- `blocked`: execution stopped before smoke due to approval, target, credential, migration-history, rollback, cleanup, or security blocker.

Final result: `<pass/fail/blocked>`

This report does not approve production cutover, production data migration, Supabase project creation, branch creation, cost-incurring actions, or repository secret commits.
