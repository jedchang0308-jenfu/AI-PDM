# QA Supabase Runtime GATE-B Local Suite

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-dev / local-only QC consolidation
Status: Prepared

## Purpose

This suite consolidates the pre-approval checks for GATE-B into one local command:

```powershell
npm.cmd run qc:supabase-runtime-gate-b-local-suite
```

It is intentionally not a runtime smoke. It does not approve or run staging, provider switching, Postgres compare, Supabase target migration history, data migration, cleanup, or production cutover.

The durable local evidence report is:

- [.ai-doc/reports/qc/qc-supabase-runtime-gate-b-local-suite-report-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-gate-b-local-suite-report-2026-06-16.md)
- Validate it with `npm.cmd run qc:supabase-runtime-gate-b-local-suite-report`

## Allowed Scope

The suite may run local static checks, document checks, secret boundary checks, source scans, and the runtime smoke preflight in its expected blocked state.

The suite must not run:

- `supabase migration list`
- `db:postgres:guard -- --phase compare`
- `db:postgres:compare:schema-rls -- --no-write`
- `qc:db-provider-postgres`
- `PDM_DB_PROVIDER=postgres`
- `PDM_RUNTIME_SMOKE_APPROVED=true`
- any command that requires `PDM_POSTGRES_URL` or `PDM_POSTGRES_SHADOW_URL`

`qc:supabase-runtime-migrations` is run with `PDM_SUPABASE_SKIP_MIGRATION_LIST=true` so the migration mirror can be checked without invoking Supabase CLI target history.

## Included Checks

```powershell
npm.cmd run qc:doc-paths
npm.cmd run qc:supabase-secret-boundary
npm.cmd run qc:supabase-runtime-migrations
npm.cmd run qc:supabase-migration-history-policy
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:supabase-data-parity-policy
npm.cmd run qc:supabase-runtime-approval-package
npm.cmd run qc:supabase-runtime-local-readiness
npm.cmd run qc:supabase-runtime-gate-b-local-suite-report
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

Expected result:

- all npm QC commands exit 0;
- direct API route scan exits 1 with empty stdout;
- runtime smoke preflight exits 0 with `status=blocked_expected`, `readyForRuntimeSmoke=false`, and no hazards;
- no live Supabase target command is executed.

## Promotion Rule

Passing this suite means the local evidence bundle is consistent. It does not change `DEV-SUPABASE-DB-001-GATE-B` status from blocked.

GATE-B can only proceed after explicit PM approval, server-side `AI_PDM_STAGING` credentials, target identity receipt completion, and the approved runbook sequence.
