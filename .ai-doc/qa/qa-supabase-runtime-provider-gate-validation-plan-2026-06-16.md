# QA Supabase Runtime Provider Gate Validation Plan

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-A`
Mode: PM-dev / QA preparation
Status: Prepared, not executed

## 1. Scope

This gate prepares the controlled staging Postgres runtime smoke for `DEV-SUPABASE-DB-001`.

It does not authorize connector operations, Supabase project or branch creation, provider pointer changes, production cutover, or cost-incurring actions. Those remain explicit PM approval gates.

## 2. Current Evidence

- Direct API route migration away from sync `@/lib/db` is complete.
- Static scan target: `rg -n "@/lib/db" src/app/api --glob route.ts` must return no matches.
- Runtime provider code already supports `PDM_DB_PROVIDER=sqlite|postgres`.
- Postgres runtime URL is server-side only through `PDM_POSTGRES_URL`.
- Migration mirror and RLS baseline are covered by `supabase:migrations:sync` and `qc:supabase-runtime-migrations`.
- Secret boundary is covered by `qc:supabase-secret-boundary`.

Official Supabase references reviewed for this gate:

- Supabase changelog, including 2026 Data API / GraphQL default exposure changes: https://supabase.com/changelog
- Row Level Security guide: https://supabase.com/docs/guides/database/postgres/row-level-security
- Securing your data guide: https://supabase.com/docs/guides/database/secure-data
- Securing your API guide, including explicit grants and Data API exposure controls: https://supabase.com/docs/guides/api/securing-your-api
- Database advisor guidance for GraphQL table exposure: https://supabase.com/docs/guides/database/database-advisors
- Supabase GitHub integration / branching guide, including no production data copied to preview branches: https://supabase.com/docs/guides/deployment/branching/github-integration
- Supabase current-change impact audit: [.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md)
- Supabase target identity receipt template: [.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md)
- Supabase runtime smoke auth/session boundary: [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md)

## 3. Pre-Approval Local Checks

These checks are allowed before runtime approval because they are local, static, or explicitly skip live probes when no runtime URL is configured.

```powershell
npm.cmd run qc:supabase-runtime-gate-b-local-suite
```

The suite expands to:

```powershell
npm.cmd run qc:doc-paths
npm.cmd run qc:supabase-secret-boundary
npm.cmd run qc:supabase-runtime-migrations
npm.cmd run qc:supabase-migration-history-policy
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:supabase-data-parity-policy
npm.cmd run qc:supabase-runtime-approval-package
npm.cmd run qc:supabase-runtime-local-readiness
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

Expected results:

- Documentation path QC passes.
- Secret boundary QC passes.
- Migration mirror QC passes and records `supabase migration list` readiness.
- Migration history policy QC passes and keeps the raw `psql -f` base apply as a staging-only exception.
- Rollback readiness QC passes in local SQLite/unset mode.
- Data parity policy QC passes and keeps full data parity execution approval-gated.
- GATE-B approval package QC passes and keeps runtime execution blocked until explicit PM approval.
- Local readiness QC passes as a static gate and does not invoke Supabase CLI, `pg`, provider switching, or live URLs.
- Runtime smoke report template QC passes and confirms the execution report will capture required evidence without claiming execution.
- GATE-B runbook QC passes and confirms the approved execution sequence without claiming execution.
- Runtime smoke API matrix QC passes and confirms the approved app API set without claiming execution.
- Runtime smoke auth/session boundary QC passes and confirms app login/session/role evidence rules without claiming execution.
- Supabase current-change impact QC passes and confirms the gate captures Data API / GraphQL exposure, RLS, server-side credential, Postgres 14, and production workflow implications.
- Target identity receipt QC passes and confirms the execution evidence fields are ready without claiming live target verification.
- `qc:supabase-runtime-gate-b-local-suite` passes and confirms migration mirror QC uses `PDM_SUPABASE_SKIP_MIGRATION_LIST=true` before approval.
- Direct API route import scan has no matches.

## 3A. Migration History Policy

The base migration history exception is controlled by:

- [.ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md)
- `npm.cmd run qc:supabase-migration-history-policy`

The policy accepts the raw `psql -f` base apply as a staging-only exception. It does not approve production cutover, runtime provider smoke, or migration-history repair. Any future repair must first prove target identity, schema/RLS parity, source SHA evidence, secret boundary, and explicit PM approval.

## 3B. GATE-B Approval Package

The staging runtime smoke approval decision is controlled by:

- [.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md)
- [.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md)
- [.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md)
- [.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md)
- [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md)
- [.ai-doc/qa/qa-supabase-runtime-gate-b-local-suite-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-gate-b-local-suite-2026-06-16.md)
- `npm.cmd run qc:supabase-runtime-approval-package`
- `npm.cmd run qc:supabase-runtime-local-readiness`
- `npm.cmd run qc:supabase-runtime-smoke-report-template`
- `npm.cmd run qc:supabase-runtime-gate-b-runbook`
- `npm.cmd run qc:supabase-runtime-smoke-api-matrix`
- `npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary`
- `npm.cmd run qc:supabase-runtime-gate-b-local-suite`

The package, report template, runbook, API matrix, and auth/session boundary define the PM decision options, exact approval wording, server-side credential boundary, smoke matrix, no-go criteria, app session evidence, role/permission checks, data boundary, cleanup proof, rollback proof, residual-risk capture, final disposition, approved API set, and approved command order. They prepare the decision and evidence structure only; they do not authorize execution by themselves.

## 4. Approval Preconditions

Do not start staging runtime smoke until all items below are available:

- Explicit PM approval to open the Supabase runtime gate.
- GATE-B approval package accepted by PM.
- `PDM_RUNTIME_SMOKE_APPROVED=true` set only in the approved smoke process.
- Confirmed target: `AI_PDM_STAGING`.
- Migration history policy accepted, and any history repair separately approved if needed.
- Server-side runtime connection string stored outside the repository as `PDM_POSTGRES_URL`.
- Maintenance / compare connection string stored outside the repository as `PDM_POSTGRES_SHADOW_URL` or approved equivalent.
- `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING`.
- Confirmation that the smoke uses non-production data only.
- Rollback proof prepared before provider pointer change.
- Rollback readiness plan accepted: [.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md)
- Cleanup criteria and owner approved.
- Current-change impact audit accepted, including target Postgres major version evidence requirement.
- Target identity receipt template accepted before live target setup: [.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md)
- Runtime smoke auth/session boundary accepted before app API smoke: [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md)

## 5. Staging Smoke Scope After Approval

The smoke should prove server runtime behavior against `AI_PDM_STAGING`, not production readiness.

Minimum runtime coverage:

- DB provider can connect to staging Postgres.
- At least one read-only route path returns expected shape.
- At least one isolated write path creates a test record.
- The created test record can be read back through the app API.
- Related audit / workflow side effects are present when the domain requires them.
- Test records are removed or explicitly marked as smoke-only according to the cleanup plan.

Suggested domain path:

- Numbering root / part / drawing creation with a unique smoke prefix.
- Admin matrix read.
- Rule simulator read / simulation.
- Variant or impact-analysis read path if data exists.

The exact API set is controlled by [.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md) and must be copied into the runtime smoke report before execution.

The auth/session setup is controlled by [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md) and must be copied into the runtime smoke report before execution.

## 6. Post-Approval Command Sequence

Run only after the approval preconditions are met.

```powershell
$env:PDM_RUNTIME_SMOKE_APPROVED = "true"
$env:PDM_SUPABASE_TARGET_NAME = "AI_PDM_STAGING"
$env:PDM_POSTGRES_SHADOW_URL = "<server-side staging maintenance url>"
npm.cmd run qc:supabase-runtime-smoke-preflight
npm.cmd run db:postgres:guard -- --phase compare
npm.cmd run db:postgres:compare:schema-rls -- --no-write
npm.cmd run qc:supabase-secret-boundary
npm.cmd run qc:supabase-runtime-migrations
```

Then, for runtime provider smoke:

```powershell
$env:PDM_DB_PROVIDER = "postgres"
$env:PDM_POSTGRES_URL = "<server-side staging runtime url>"
$env:PDM_POSTGRES_POOLER_MODE = "direct"
npm.cmd run qc:db-provider-postgres
```

If a local dev server is used for route smoke, start it with the same server-side env and record:

- Port.
- Startup command.
- Smoke API calls.
- Response status and compact response shape.
- Created IDs.
- Cleanup result.
- Any remaining rows or known residue.

## 7. Rollback Proof

Rollback evidence must be captured before any provider pointer change is treated as successful.

Readiness plan:

- [.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md)
- `npm.cmd run qc:supabase-runtime-rollback-readiness`

Required proof:

- Current app runtime can be returned to SQLite by removing `PDM_DB_PROVIDER=postgres` or setting `PDM_DB_PROVIDER=sqlite`.
- SQLite fallback local checks pass after rollback.
- Any staging smoke records are either cleaned up or listed in the report with reason and owner.
- No repository file contains runtime secrets.

Minimum rollback commands:

```powershell
Remove-Item Env:\PDM_DB_PROVIDER -ErrorAction SilentlyContinue
Remove-Item Env:\PDM_POSTGRES_URL -ErrorAction SilentlyContinue
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:db-provider-contract
npm.cmd run qc:supabase-secret-boundary
```

If a dev server was started in Postgres mode, stop it before the rollback verification and start a fresh SQLite-mode process for smoke verification.

## 8. Data Parity Boundary

This gate does not approve full production data migration.

Data Parity Policy:

- [.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md)
- `npm.cmd run qc:supabase-data-parity-policy`

Allowed data:

- Non-production smoke records created specifically for the gate.
- Deterministic baseline seed required for roles, permissions, numbering rules, and system settings.

Not allowed:

- Production customer data.
- CAD files, release packages, handoff packages, field-test artifacts, or QC artifact migration.
- Browser-side direct Supabase Data API access to base tables.

Parity checks for this gate:

- Schema and RLS parity may use `db:postgres:compare:schema-rls`.
- `schema_rls_only` intentionally skips row counts and key hashes for empty staging.
- `smoke_seed` is limited to non-production records with a unique smoke prefix, owner, expiry, and cleanup proof.
- Full row-count and key-hash data parity is deferred until controlled seed/data migration scope is approved.

## 9. Security Gates

The staging smoke must respect current Supabase security guidance:

- RLS must be enabled and forced for public tables in the baseline.
- Direct grants to `anon` and `authenticated` must remain deny-by-default unless explicitly justified.
- Service role, secret keys, database passwords, and pooler URLs must never be exposed through `NEXT_PUBLIC_*`.
- If Data API / GraphQL exposure is intentionally used later, explicit `GRANT` statements and RLS policies must be reviewed together.
- Advisor findings related to exposed tables, RLS, views, or privileged functions must be triaged before production cutover.

## 10. Go / No-Go Criteria

Go for staging runtime smoke only if:

- Approval preconditions are complete.
- Target guard confirms `AI_PDM_STAGING`.
- Local static QC passes.
- Rollback proof is ready.
- Smoke data boundary is accepted.

No-go if:

- Target identity is unknown or points to `ProJED` / `ProJED_TEST`.
- Any required secret would need to be committed to the repository.
- Runtime provider smoke would require production data.
- Rollback cannot be verified before or immediately after smoke.
- Supabase advisor or RLS evidence shows an unaccepted P0/P1 security blocker.

## 11. Evidence To Produce During Execution

When this gate is actually executed, write a runtime smoke report under `.ai-doc/reports/rd/` or `.ai-doc/reports/qc/` containing:

- Follow the execution runbook: [.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md)
- Use the report template: [.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md)
- Use the API matrix: [.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md)
- Use the auth/session boundary: [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md)
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

## 12. Current Stop Point

This document completes the preparation slice only. Runtime provider smoke remains blocked until explicit approval and server-side staging credentials are available.
