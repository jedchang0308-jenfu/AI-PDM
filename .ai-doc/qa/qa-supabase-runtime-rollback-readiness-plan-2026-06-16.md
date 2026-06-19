# QA Supabase Runtime Rollback Readiness Plan

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-A`
Mode: PM-dev / QA preparation
Status: Prepared, not executed

## 1. Scope

This plan prepares rollback proof for the Supabase runtime provider gate. It does not execute the staging runtime smoke, connect to Supabase, change provider pointers, create projects, repair migration history, or approve production cutover.

The rollback target for this gate is the current SQLite runtime mode. A successful rollback means the approved smoke process can remove Postgres runtime env, restart a fresh SQLite-mode app process, and prove that the server-side runtime falls back to SQLite with local provider contract checks passing.

## 2. Current Local Readiness

Allowed local checks:

```powershell
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:db-provider-contract
npm.cmd run qc:supabase-secret-boundary
```

Expected local state before approval:

- `PDM_DB_PROVIDER` is unset or `sqlite`.
- `PDM_POSTGRES_URL` is not configured in the local shell used for pre-approval checks.
- No `NEXT_PUBLIC_*` variable contains Postgres URLs, service-role keys, database passwords, secrets, or tokens.
- `qc:db-provider-contract` passes.
- `qc:supabase-secret-boundary` passes.

## 3. Approval-Only Rollback Evidence

During an approved staging smoke, rollback evidence must be captured after Postgres-mode smoke and before declaring the gate successful.

Required evidence:

- Postgres-mode app process stopped.
- `PDM_DB_PROVIDER` removed or set to `sqlite`.
- `PDM_POSTGRES_URL` removed from the app runtime process.
- Fresh SQLite-mode app process started.
- `qc:db-provider-contract` passes after env rollback.
- `qc:supabase-secret-boundary` passes after env rollback.
- Smoke-created staging records are cleaned up or listed with owner and expiry.
- Runtime report records only env names and redacted values.

Minimum PowerShell sequence:

```powershell
Remove-Item Env:\PDM_DB_PROVIDER -ErrorAction SilentlyContinue
Remove-Item Env:\PDM_POSTGRES_URL -ErrorAction SilentlyContinue
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:db-provider-contract
npm.cmd run qc:supabase-secret-boundary
```

If a local dev server was started in Postgres mode, stop it first and start a fresh SQLite-mode process. Do not reuse the same process as rollback evidence.

## 4. No-Go Conditions

- `PDM_DB_PROVIDER=postgres` is still present during rollback proof.
- `PDM_POSTGRES_URL` remains configured in the app runtime process after rollback.
- Any required rollback proof depends on committing secrets to the repository.
- Smoke records cannot be cleaned or explicitly assigned an owner and expiry.
- SQLite fallback local checks fail.
- The target was not `AI_PDM_STAGING` or the smoke was not explicitly approved.

## 5. Evidence To Produce During Runtime Execution

The future runtime smoke report must include:

- Exact rollback env cleanup commands.
- App process stop/start evidence.
- `qc:supabase-runtime-rollback-readiness` result.
- `qc:db-provider-contract` result after rollback.
- `qc:supabase-secret-boundary` result after rollback.
- Smoke data cleanup result.
- Residual risk list.

## 6. Current Stop Point

This document prepares rollback readiness only. It does not prove live rollback because no approved Postgres-mode staging smoke has been executed in this process.

## References

- [Supabase Runtime Provider Gate Validation Plan](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md)
- [Supabase Migration History Policy](C:/VIBE%20CODING/AI_PDM/.ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md)
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/guides/deployment/branching/troubleshooting
