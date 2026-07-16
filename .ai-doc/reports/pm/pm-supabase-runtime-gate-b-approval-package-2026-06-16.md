# PM Supabase Runtime GATE-B Approval Package

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-dev approval package
Status: PM approval received for AI_PDM_STAGING-only smoke; execution blocked by missing server-side staging credentials

## Approval Received

Approval source: PM chat message on 2026-06-16 Asia/Taipei.

Approved scope:

- Run only `DEV-SUPABASE-DB-001-GATE-B` staging runtime smoke against `AI_PDM_STAGING`.
- Do not touch production.
- Do not perform cutover.

Approval text:

```text
PM 明確批准 GATE-B
先批准範圍：只跑 AI_PDM_STAGING staging runtime smoke、不碰 production、不做 cutover。
```

Current execution state: blocked. Approval is recorded, but the current process does not have server-side `PDM_POSTGRES_URL`, `PDM_POSTGRES_SHADOW_URL`, `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING` target identity evidence, smoke data owner, or cleanup owner.

## 1. Decision Needed

This package records the PM decision for the controlled staging runtime smoke and preserves the remaining execution gates.

| Option | Meaning |
|---|---|
| Approve GATE-B staging runtime smoke | Run the approved smoke against `AI_PDM_STAGING` only. |
| Defer GATE-B | Keep app runtime on SQLite and continue local-only gate hardening. |
| Request more local evidence | Do not run staging smoke; specify the missing document or QC proof. |

Copy-paste approval statement, if approved:

```text
I approve DEV-SUPABASE-DB-001-GATE-B staging runtime smoke against AI_PDM_STAGING only, with non-production smoke data, server-side credentials, rollback proof, cleanup proof, and no production cutover.
```

## 2. Scope

This approval package authorizes only a controlled runtime smoke within the approved `AI_PDM_STAGING` scope after all remaining preconditions are satisfied.

It does not approve:

- Supabase project or branch creation.
- Production cutover.
- Production data migration.
- Cost-incurring actions.
- Browser-side direct Supabase Data API access to base tables.
- Repository commits containing secrets, connection strings, or unredacted target details.

## 3. Preconditions

Do not start GATE-B until every precondition below is true.

| Area | Required evidence |
|---|---|
| PM approval | Received for `AI_PDM_STAGING` staging runtime smoke only; production and cutover remain unapproved. |
| Target | `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING`. |
| Approval env | `PDM_RUNTIME_SMOKE_APPROVED=true`, set only in the approved smoke process. |
| Runtime credential | Server-side `PDM_POSTGRES_URL`, stored outside the repository. |
| Compare credential | Server-side `PDM_POSTGRES_SHADOW_URL`, stored outside the repository. |
| Provider | `PDM_DB_PROVIDER=postgres`, set only for the approved smoke process. |
| Data boundary | Non-production smoke records only. |
| Rollback | Rollback readiness plan accepted before provider-mode smoke. |
| Cleanup | Cleanup owner and cleanup criteria accepted. |
| Migration history | `supabase migration list` evidence or approved migration-history policy path is available. |
| Current Supabase changes | [.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md) accepted; Target Postgres major version evidence required before smoke. |
| Target identity receipt | [.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md) accepted; complete before runtime API smoke. |
| Smoke API matrix | [.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md) accepted; validate with `npm.cmd run qc:supabase-runtime-smoke-api-matrix` before runtime API smoke. |
| Auth/session boundary | [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md) accepted; validate with `npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary` before runtime API smoke. |
| Secrets | No `NEXT_PUBLIC_*` database password, service role, secret, token, or Postgres URL exposure. |

Required local checks before approval execution:

```powershell
npm.cmd run qc:supabase-runtime-gate-b-local-suite
```

The suite expands to these local-only checks and forces `PDM_SUPABASE_SKIP_MIGRATION_LIST=true` for migration mirror QC:

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

Expected current local result:

- Direct route scan returns no matches.
- `qc:supabase-runtime-smoke-preflight` reports `blocked_expected` until approved-scope server-side staging credentials and target evidence are configured.
- `qc:supabase-runtime-local-readiness` passes as a static gate without invoking Supabase CLI, `pg`, provider switching, or live URLs.
- `qc:supabase-runtime-gate-b-local-suite-report` passes and confirms the durable local suite report exists without claiming GATE-B execution.
- `qc:supabase-runtime-smoke-report-template` passes and confirms the execution report template is ready without claiming GATE-B execution.
- `qc:supabase-runtime-gate-b-runbook` passes and confirms the approved execution sequence is documented without claiming GATE-B execution.
- `qc:supabase-runtime-smoke-api-matrix` passes and confirms the approved app API set is documented without claiming GATE-B execution.
- `qc:supabase-runtime-smoke-auth-session-boundary` passes and confirms app login/session/role evidence rules are documented without claiming GATE-B execution.
- `qc:supabase-runtime-gate-b-local-suite` passes and confirms no approval-gated target commands are included in the pre-approval path.
- Secret boundary checks pass.

## 4. Smoke Matrix Template

Fill this table before or during execution. Keep secret values redacted.

| Step | Command or API | Expected evidence | Owner | Status |
|---|---|---|---|---|
| `db_provider_connection` | `npm.cmd run qc:db-provider-postgres` | Provider connects to `AI_PDM_STAGING`; env values redacted. | RD/QC | Pending approval |
| `schema_rls_compare` | `npm.cmd run db:postgres:compare:schema-rls -- --no-write` | Schema/RLS-only compare passes. | QC | Pending approval |
| `auth_login_and_me` | Approved app auth/session sequence | Login status, `pdm_session` cookie-name-only evidence, `/api/auth/me` role, and no token/cookie values recorded. | RD/QC | Pending approval |
| `read_path_admin_matrix` | Approved app API call | Status and compact response shape recorded. | RD/QC | Pending approval |
| `read_path_rule_simulator` | Approved app API call | Status and compact response shape recorded. | RD/QC | Pending approval |
| `pre_write_duplicate_guard` | Approved app API call | Duplicate-check status and compact response shape recorded before write. | RD/QC | Pending approval |
| `write_path_numbering_smoke_record` | Approved app API call | Smoke record created with unique prefix, owner, and expiry. | RD/QC | Pending approval |
| `readback_created_record` | Approved app API call | Created smoke record can be read back through app API. | RD/QC | Pending approval |
| `cleanup_smoke_record` | Approved cleanup command/API | Created smoke record obsoleted, removed by approved DB cleanup, or explicitly listed as retained with owner and expiry. | RD/QC | Pending approval |
| `rollback_sqlite_mode` | `npm.cmd run qc:supabase-runtime-rollback-readiness` and `npm.cmd run qc:db-provider-contract` | Runtime returns to SQLite/unset mode and local provider contract passes. | QC | Pending approval |

## 5. Data Boundary

Allowed:

- Non-production smoke records created specifically for this gate.
- Unique smoke prefix, owner, expiry, created IDs, and cleanup proof.
- Deterministic baseline seed only if separately approved for smoke readiness.

Not allowed:

- Production customer data.
- CAD files.
- Release packages.
- Handoff packages.
- Field-test artifacts.
- QC artifacts.
- File blobs.
- Browser-side direct Supabase Data API access to base tables.
- Production cutover.

Full data parity remains blocked by the data parity policy.

## 6. Stop / No-Go

Stop and report if any condition below appears:

- PM approval is missing, ambiguous, or outside the `AI_PDM_STAGING`-only smoke scope.
- `AI_PDM_STAGING` target identity cannot be proven.
- Target points to `ProJED`, `ProJED_TEST`, production, or an unknown project.
- Required server-side credentials are missing.
- Any secret would need to be committed or exposed through `NEXT_PUBLIC_*`.
- Rollback readiness is not passing before smoke.
- Cleanup owner or cleanup criteria are missing.
- Migration history evidence is missing and the accepted exception path does not cover the operation.
- Supabase advisor or RLS evidence shows an unaccepted P0/P1 security blocker.
- The smoke requires production data or production cutover.

## 7. Execution Evidence Template

When GATE-B is executed, write the runtime smoke report under `.ai-doc/reports/rd/` or `.ai-doc/reports/qc/` with:

- Follow this runbook: [.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md)
- Use this template: [.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md)
- Use this API matrix: [.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md)
- Use this auth/session boundary: [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md)
- Pre-approval local suite: [.ai-doc/qa/qa-supabase-runtime-gate-b-local-suite-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-gate-b-local-suite-2026-06-16.md)
- Pre-approval local suite report: [.ai-doc/reports/qc/qc-supabase-runtime-gate-b-local-suite-report-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-gate-b-local-suite-report-2026-06-16.md)
- Post-approval blocked execution report: [.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md)
- Approval source and timestamp.
- Target identity evidence.
- Target identity receipt.
- Target Postgres major version evidence.
- Commands executed and results.
- Runtime provider env names used, with secret values redacted.
- Auth/session evidence with cookie and token values redacted.
- Smoke API matrix.
- Created IDs and cleanup proof.
- Rollback verification.
- Residual risks.

## 8. Current Stop Point

PM approval is recorded for `AI_PDM_STAGING`-only staging runtime smoke. Runtime provider smoke remains blocked until server-side staging credentials, target identity proof, smoke data owner, and cleanup owner are available. Production and cutover remain unapproved.
