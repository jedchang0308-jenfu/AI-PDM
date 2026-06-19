# AI_PDM Supabase Runtime Migrations

This directory contains the local Supabase migration mirror for `DEV-SUPABASE-DB-001`.

## Current Status

- The local machine does not currently have the Supabase CLI installed.
- The files in `supabase/migrations` are synchronized from `db/postgres/*.sql` by:

```powershell
npm.cmd run supabase:migrations:sync
```

- Before applying anything to a live Supabase project, validate the target and migration history again with the Supabase CLI or Supabase MCP tooling.
- When the Supabase CLI is available, `npm.cmd run supabase:migrations:sync` records the result of `supabase migration list` in `supabase/migrations/manifest.json`. If the CLI is absent, the manifest records `localMigrationList.attempted=false` and no live history check is claimed.

## Target Rules

Only AI_PDM dedicated targets may be used:

- `AI_PDM_STAGING`
- `AI_PDM_PROD`

Do not apply these migrations to:

- `ProJED`
- `ProJED_TEST`
- any non-empty public schema
- any partial or non-AI_PDM public schema

Set `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING` or `AI_PDM_PROD` when running live validation so target guard output is explicit.

## Migration Files

```text
supabase/migrations/20260608000100_initial_ai_pdm_schema.sql
supabase/migrations/20260608000200_force_rls_deny_direct_access.sql
supabase/migrations/20260615040619_harden_set_updated_at_search_path.sql
supabase/migrations/manifest.json
```

The SQL files include source SHA-256 comments so they can be traced back to:

- `db/postgres/001_initial_schema.sql`
- `db/postgres/002_supabase_rls_plan.sql`
- `db/postgres/003_harden_set_updated_at_search_path.sql`

## Local Migration Mirror Workflow

```powershell
npm.cmd run db:postgres:migration
$env:PDM_SUPABASE_SKIP_MIGRATION_LIST = "true"
npm.cmd run qc:supabase-runtime-migrations
```

This local workflow does not query a Supabase target. Target-linked migration history and schema/RLS compare remain live target workflow steps.

## Live Target Workflow

Live target execution remains blocked until the user confirms Supabase organization, region, and cost.

After a dedicated target exists:

```powershell
npm.cmd run db:postgres:guard -- --phase pre-migration
```

Then apply migrations through the approved Supabase migration mechanism. After apply:

```powershell
npm.cmd run db:postgres:compare:schema-rls -- --require-postgres
npm.cmd run qc:postgres-shadow
```

Use the schema/RLS-only compare for an intentionally empty staging database. Full data parity compare remains a separate gate and should run only after controlled seed or data migration policy is approved.

## Runtime Approval Package

GATE-B staging runtime smoke is controlled by [.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md).

Before running any Postgres-mode app smoke:

```powershell
npm.cmd run qc:supabase-runtime-approval-package
npm.cmd run qc:supabase-runtime-local-readiness
npm.cmd run qc:supabase-runtime-smoke-preflight
npm.cmd run qc:supabase-runtime-gate-b-local-suite
```

The approval package requires explicit PM approval, `AI_PDM_STAGING`, server-side `PDM_POSTGRES_URL`, server-side `PDM_POSTGRES_SHADOW_URL`, non-production smoke data, cleanup proof, rollback proof, and no production cutover.

`qc:supabase-runtime-local-readiness` is the static pre-approval gate. It verifies the evidence bundle and command separation without invoking Supabase CLI, `pg`, provider switching, or live URLs.

`qc:supabase-runtime-gate-b-local-suite` is the consolidated pre-approval command. It runs the local evidence checks, forces migration mirror QC to skip `supabase migration list`, verifies the preflight is still `blocked_expected`, and confirms direct API routes have no `@/lib/db` imports.

The local suite report is [.ai-doc/reports/qc/qc-supabase-runtime-gate-b-local-suite-report-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-gate-b-local-suite-report-2026-06-16.md). Validate it with `npm.cmd run qc:supabase-runtime-gate-b-local-suite-report`; it is a local-only evidence artifact and does not claim GATE-B execution.

The execution report template is [.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md). Validate it with `npm.cmd run qc:supabase-runtime-smoke-report-template` before any approved runtime smoke.

The controlled execution runbook is [.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md). Validate it with `npm.cmd run qc:supabase-runtime-gate-b-runbook` before any approved runtime smoke.

The runtime smoke API matrix is [.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md). Validate it with `npm.cmd run qc:supabase-runtime-smoke-api-matrix` before any approved runtime smoke. It fixes the server-side app API set for admin matrix read, rule simulation, duplicate guard, numbering smoke write, readback, and soft cleanup.

The runtime smoke auth/session boundary is [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md). Validate it with `npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary` before any approved runtime smoke. It fixes the app session, `pdm_session` cookie-name-only evidence, login/me/logout sequence, Admin role requirement, permission list, and token/secret redaction rules.

The current-change impact audit is [.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md). Validate it with `npm.cmd run qc:supabase-current-change-impact` before any approved runtime smoke. It records Data API / GraphQL exposure, RLS, server-side credential, Postgres 14, and production workflow implications.

The target identity receipt template is [.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md). Validate it with `npm.cmd run qc:supabase-target-identity-receipt` before any approved runtime smoke. It defines the required evidence for `AI_PDM_STAGING` identity, project ref redaction, Postgres major version, Data API exposure, migration history, and server-side credential boundary.

## Data Parity Policy

The accepted policy is [.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md).

Policy tiers:

- `schema_rls_only`: allowed for intentionally empty staging; runs `db:postgres:compare:schema-rls -- --no-write` and does not claim row-count or key-hash parity.
- `smoke_seed`: limited to non-production records with a unique smoke prefix, owner, expiry, and cleanup proof.
- `full_data`: approval-gated; requires `AI_PDM_STAGING`, server-side `PDM_POSTGRES_SHADOW_URL`, declared source snapshot, table scope, exclusions, cleanup owner, and passing `qc:supabase-data-parity-policy`.

The data parity policy does not approve production customer data, CAD files, release packages, handoff packages, field-test artifacts, QC artifacts, file blobs, browser-side direct Supabase Data API access, or production cutover.

## Migration History Policy

`AI_PDM_STAGING` has a documented base-history exception: the initial schema and RLS baseline were applied through a raw `psql -f` path before the Supabase migration history path was fully controlled.

Policy:

- The accepted policy is [.ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md).
- The exception is staging-only and does not approve production cutover.
- Before any production cutover, capture `supabase migration list` or Supabase MCP migration-history evidence from the approved target.
- Use `supabase migration repair --status applied <timestamp>` only when schema/RLS parity proves the migration is already present and the history table is missing the record.
- Do not use migration repair for unknown, partial, failed, production, or non-AI_PDM targets.

## Security Baseline

- Public tables must have RLS enabled and forced.
- `anon` and `authenticated` must not receive direct base table access by default.
- Browser code must not receive database passwords, service role keys, or server-only Postgres URLs.
- Application access remains through the server-side AI_PDM API until explicit RLS policies are designed and approved.
