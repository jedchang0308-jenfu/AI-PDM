# QA Supabase Current Change Impact Audit

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-A`
Mode: PM-dev / QA current-change audit
Status: Prepared, not executed

## 1. Purpose

This audit maps current Supabase platform changes and official guidance to the `DEV-SUPABASE-DB-001` runtime gate.

It is a local evidence artifact only. It does not approve live Supabase access, staging runtime smoke, provider switching, target-linked CLI commands, production cutover, cost-incurring actions, or data migration.

## 2. Sources Reviewed

- Supabase changelog: https://supabase.com/changelog
- Breaking change, public tables not exposed to Data API / GraphQL automatically: https://supabase.com/changelog
- Postgres 14 support ending on 2026-07-01: https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026
- Supabase securing your data: https://supabase.com/docs/guides/database/secure-data
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase securing your API: https://supabase.com/docs/guides/api/securing-your-api
- Supabase maturity model: https://supabase.com/docs/guides/deployment/maturity-model
- Supabase CLI testing and linting: https://supabase.com/docs/guides/local-development/cli/testing-and-linting

## 3. Current Changes That Affect This Gate

| Change / guidance | Impact on AI_PDM GATE-B |
|---|---|
| New public tables are not automatically exposed to the Data API / GraphQL API on newer Supabase projects. | GATE-B must not depend on browser-side direct Supabase Data API access. If Data API use is later approved, explicit `GRANT` and RLS policy review must happen together. |
| RLS remains mandatory for exposed schemas. | Public tables must keep RLS enabled and forced. Any future role grants must be paired with least-privilege RLS policies. |
| Direct database connections are server-side credentials. | `PDM_POSTGRES_URL` and `PDM_POSTGRES_SHADOW_URL` must remain server-side only and outside repository files. |
| Service role and secret keys are never frontend-safe. | No `NEXT_PUBLIC_*` database password, service role, secret key, pooler URL, or Postgres URL may be introduced. |
| Postgres 14 support ends on 2026-07-01. | Before approving GATE-B against a live target, record target Postgres major version and treat Postgres 14 as a no-go unless PM explicitly accepts the platform risk. |
| Production maturity guidance requires version-controlled migration workflow and protected production access. | GATE-B remains staging-only. Production target, production cost confirmation, final advisor triage, and production migration workflow are deferred until after stable staging evidence. |
| Supabase CLI supports local database linting / testing, but CLI commands must be discovered and run intentionally. | Pre-approval local evidence may document `supabase db lint` / `supabase test db` readiness, but target-linked or CLI-dependent execution remains blocked unless approved and available. |

## 4. Gate Decisions

These decisions apply until PM changes the runtime gate scope:

- Keep application access through the server-side AI_PDM API during `GATE-B`.
- Do not use browser-side direct Supabase Data API access to AI_PDM base tables during `GATE-B`.
- Keep `anon` and `authenticated` direct base table access deny-by-default unless a future approval explicitly opens Data API usage.
- Pair any future explicit `GRANT` with RLS policy review and advisor triage.
- Add target Postgres major version evidence to the approval package and runtime smoke report.
- Treat Postgres 14 as no-go for new live smoke approval after the 2026-07-01 support cutoff unless PM explicitly accepts the risk.
- Do not run `supabase db lint`, `supabase test db`, `supabase migration list`, or any target-linked CLI command before approval.
- Keep server-side credentials outside repository files and never print secret values in reports.

## 5. Evidence To Capture If GATE-B Is Approved

When GATE-B is approved and executed, the runtime smoke report must capture:

- Target identity receipt: [.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md)
- Target project name: `AI_PDM_STAGING`.
- Target Postgres major version, with secret values redacted.
- Whether Data API / GraphQL table exposure is used: expected `no` for this gate.
- Confirmation that runtime access used server-side Postgres credentials only.
- Confirmation that no `NEXT_PUBLIC_*` secret, service role, database password, pooler URL, or Postgres URL was introduced.
- RLS / exposed-table advisor status or explicit reason it was not run.
- Any Postgres 14 finding and the PM decision attached to it.

## 6. Stop Point

This audit completes a local preparation slice only.

GATE-B remains blocked until explicit PM approval and server-side staging credentials are available.
