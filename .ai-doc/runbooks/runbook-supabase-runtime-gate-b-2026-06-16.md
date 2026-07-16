# Runbook Supabase Runtime GATE-B

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-dev / controlled execution runbook
Status: Runbook only; execution not approved or performed

## 1. Purpose

This runbook defines the exact sequence for the approved staging Postgres runtime smoke against `AI_PDM_STAGING`.

It does not approve execution. Do not run any live command in this runbook until PM has approved the GATE-B approval statement and server-side staging credentials are available.

## 2. Required Inputs

| Input | Required value |
|---|---|
| PM approval | Explicit approval for `DEV-SUPABASE-DB-001-GATE-B` |
| Target | `AI_PDM_STAGING` only |
| Runtime credential | Server-side `PDM_POSTGRES_URL`, stored outside repository files |
| Compare credential | Server-side `PDM_POSTGRES_SHADOW_URL`, stored outside repository files |
| Smoke data | Non-production smoke records only |
| Report template | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md` |
| Auth/session boundary | `.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md` |
| Cleanup owner | Named before execution |
| Rollback owner | Named before execution |

## 3. Pre-Approval Local Verification

These commands are allowed before approval. They must not connect to Supabase, switch providers, or mutate data.

```powershell
npm.cmd run qc:supabase-runtime-gate-b-local-suite
```

The local suite is defined here:

- `.ai-doc/qa/qa-supabase-runtime-gate-b-local-suite-2026-06-16.md`

It expands to:

```powershell
npm.cmd run qc:doc-paths
npm.cmd run qc:supabase-secret-boundary
npm.cmd run qc:supabase-runtime-migrations
npm.cmd run qc:supabase-migration-history-policy
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:supabase-data-parity-policy
npm.cmd run qc:supabase-runtime-local-readiness
npm.cmd run qc:supabase-runtime-approval-package
npm.cmd run qc:supabase-runtime-smoke-report-template
npm.cmd run qc:supabase-runtime-gate-b-runbook
npm.cmd run qc:supabase-runtime-smoke-api-matrix
npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary
npm.cmd run qc:supabase-runtime-gate-plan
npm.cmd run qc:supabase-current-change-impact
npm.cmd run qc:supabase-target-identity-receipt
npm.cmd run qc:supabase-runtime-smoke-preflight
rg -n "@/lib/db" src/app/api --glob route.ts
```

Expected current result before approval:

- `qc:supabase-runtime-smoke-preflight` returns `blocked_expected` with no hazards.
- Direct route scan returns no matches.
- No live Postgres URL, service role key, database password, or secret value is printed or committed.
- Current-change audit confirms Data API / GraphQL exposure, RLS, server-side credential, Postgres 14, and production workflow implications.
- Migration mirror QC runs with `PDM_SUPABASE_SKIP_MIGRATION_LIST=true`; target-linked `supabase migration list` remains approval-gated in section 5.

## 4. Approval Gate

Proceed only after PM approves this exact statement or an equivalent explicit written approval:

```text
I approve DEV-SUPABASE-DB-001-GATE-B staging runtime smoke against AI_PDM_STAGING only, with non-production smoke data, server-side credentials, rollback proof, cleanup proof, and no production cutover.
```

No-go if approval is missing, ambiguous, scoped to production, or omits cleanup / rollback proof.

## 5. Live Target Setup

Set environment variables only in the approved smoke process. Do not write secrets into repository files.

```powershell
$env:PDM_RUNTIME_SMOKE_APPROVED = "true"
$env:PDM_SUPABASE_TARGET_NAME = "AI_PDM_STAGING"
$env:PDM_POSTGRES_SHADOW_URL = "<server-side staging maintenance url>"
```

Run the approval-gated target checks:

```powershell
npm.cmd run qc:supabase-runtime-smoke-preflight
npm.cmd run db:postgres:guard -- --phase compare
supabase migration list
npm.cmd run db:postgres:compare:schema-rls -- --no-write
npm.cmd run qc:supabase-secret-boundary
npm.cmd run qc:supabase-runtime-migrations
```

Record the results in the runtime smoke report template.
Complete the target identity receipt template before runtime API smoke:

- `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md`
- `npm.cmd run qc:supabase-target-identity-receipt`

Record the Target Postgres major version before any runtime smoke call.

Stop if:

- Target identity is not `AI_PDM_STAGING`.
- Target points to `ProJED`, `ProJED_TEST`, production, or an unknown project.
- `supabase migration list` contradicts the accepted migration-history policy.
- Schema/RLS compare fails.
- Any command prints or requires committing a secret.

## 6. Runtime Provider Smoke Setup

Set Postgres runtime env only in the approved process:

```powershell
$env:PDM_DB_PROVIDER = "postgres"
$env:PDM_POSTGRES_URL = "<server-side staging runtime url>"
$env:PDM_POSTGRES_POOLER_MODE = "direct"
npm.cmd run qc:db-provider-postgres
```

If using a local dev server for app API smoke, start a fresh process with the approved server-side env. Record:

- Startup command.
- Port.
- Runtime provider mode.
- Redacted env names.
- Process ID if available.

Do not reuse a process that previously ran in SQLite mode.

## 7. Smoke API Sequence

Follow the API matrix before execution:

- `.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md`
- `npm.cmd run qc:supabase-runtime-smoke-api-matrix`

Follow the auth/session boundary before execution:

- `.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md`
- `npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary`

Use a unique non-production smoke prefix before any write, for example:

```text
AI_PDM_GB_SMOKE_<YYYYMMDDHHmm>_<operator>
```

Execute and record the smoke matrix:

| Step | Required evidence |
|---|---|
| `db_provider_connection` | `qc:db-provider-postgres` passes with live probe intentionally configured. |
| `schema_rls_compare` | `db:postgres:compare:schema-rls -- --no-write` passes. |
| `auth_login_and_me` | Approved app session proves `Admin` or equivalent role through `/api/auth/me`; record only cookie name `pdm_session`, not cookie/token values. |
| `read_path_admin_matrix` | Approved app API read returns expected compact shape. |
| `read_path_rule_simulator` | Approved app API read/simulation returns expected compact shape. |
| `pre_write_duplicate_guard` | Duplicate-check app API returns expected compact shape before the write. |
| `write_path_numbering_smoke_record` | One isolated non-production smoke record is created. |
| `readback_created_record` | Created smoke record can be read back through app API. |
| `cleanup_smoke_record` | Created smoke record is obsoleted, removed by approved DB cleanup, or explicitly retained with owner, expiry, and reason. |
| `rollback_sqlite_mode` | SQLite/unset rollback checks pass after smoke. |

No-go if any write path requires production customer data, CAD files, release packages, handoff packages, field-test artifacts, QC artifacts, file blobs, browser-side direct Supabase Data API access to base tables, or production cutover.

## 8. Cleanup

Cleanup must run before the smoke is considered complete.

Record in the report:

- Smoke prefix.
- Created IDs.
- Cleanup command or API.
- Cleanup result.
- Remaining known residue, if any.
- Owner and expiry for retained residue.

Stop and mark final disposition `blocked` or `fail` if cleanup cannot be proven.

## 9. Rollback

Stop the Postgres-mode app process before rollback verification.

Then run:

```powershell
Remove-Item Env:\PDM_DB_PROVIDER -ErrorAction SilentlyContinue
Remove-Item Env:\PDM_POSTGRES_URL -ErrorAction SilentlyContinue
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:db-provider-contract
npm.cmd run qc:supabase-secret-boundary
```

Rollback proof must be captured before any provider pointer change is treated as successful.

## 10. Report And Closeout

Use the execution report template:

- `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md`
- `npm.cmd run qc:supabase-runtime-smoke-report-template`

The final execution report must include:

- Approval source and timestamp.
- Target identity evidence.
- Command results.
- Redacted env names.
- Auth/session evidence with `pdm_session` name only and no cookie, token, password, or `set-cookie` values.
- Smoke API matrix.
- Smoke data ledger.
- Cleanup proof.
- Rollback proof.
- Advisor / RLS residual risk.
- Final disposition: `pass`, `fail`, or `blocked`.

This runbook does not approve production cutover, production data migration, Supabase project creation, branch creation, cost-incurring actions, or repository secret commits.
