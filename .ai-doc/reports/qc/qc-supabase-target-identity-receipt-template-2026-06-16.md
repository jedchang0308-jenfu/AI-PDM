# QC Supabase Target Identity Receipt Template

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-dev / QC target identity evidence template
Status: Template only; target identity not verified

## 1. Purpose

This receipt is the required target identity evidence template for approved GATE-B execution.

It does not approve live Supabase access, staging runtime smoke, provider switching, target-linked CLI commands, production cutover, cost-incurring actions, or data migration.

## 2. Approval Record

Fill only after explicit PM approval.

| Field | Value |
|---|---|
| Approval source | `<PM approval message / issue / ticket>` |
| Approval timestamp | `<YYYY-MM-DD HH:mm TZ>` |
| Approved gate | `DEV-SUPABASE-DB-001-GATE-B` |
| Approved target | `AI_PDM_STAGING` |
| Approval scope | Staging runtime smoke only; no production cutover |

## 3. Target Identity

Record only non-secret identifiers. Redact project refs if PM considers them sensitive.

| Evidence | Expected | Observed |
|---|---|---|
| `PDM_SUPABASE_TARGET_NAME` | `AI_PDM_STAGING` | `<configured/missing>` |
| Supabase project display name | `AI_PDM_STAGING` | `<name/redacted>` |
| Supabase project ref | `<staging ref / redacted>` | `<ref/redacted>` |
| Organization | `<approved org>` | `<org/redacted>` |
| Region | `<approved region>` | `<region>` |
| Target guard command | `npm.cmd run db:postgres:guard -- --phase compare` | `<pass/fail>` |
| Target guard conclusion | target is not `ProJED`, `ProJED_TEST`, production, or unknown | `<pass/fail>` |

No-go if the observed target is missing, unknown, production, `ProJED`, `ProJED_TEST`, or any non-AI_PDM project.

## 4. Platform Version And Exposure

| Evidence | Expected | Observed |
|---|---|---|
| Target Postgres major version | not Postgres 14 after 2026-07-01 unless PM explicitly accepts risk | `<major version>` |
| Postgres 14 risk decision | `<not applicable / approved risk reference>` | `<result>` |
| Data API / GraphQL table exposure used by GATE-B | `no` | `<no/yes with approval reference>` |
| Browser-side direct Supabase Data API to base tables | `no` | `<no/yes>` |
| Direct `anon` / `authenticated` base-table grants changed for GATE-B | `no` | `<no/yes with GRANT + RLS review reference>` |
| RLS / FORCE RLS baseline | enabled and forced for public AI_PDM tables | `<pass/fail>` |
| Advisor / RLS blocker status | no unaccepted P0/P1 blocker | `<none/list>` |

No-go if GATE-B depends on browser-side direct Supabase Data API access to AI_PDM base tables without explicit `GRANT` and RLS review.

## 5. Credential Boundary

Record names and configured/missing status only. Do not record values.

| Env name | Expected | Observed |
|---|---|---|
| `PDM_RUNTIME_SMOKE_APPROVED` | configured only after PM approval | `<configured/missing>` |
| `PDM_POSTGRES_URL` | server-side only, outside repository files | `<configured/missing>` |
| `PDM_POSTGRES_SHADOW_URL` | server-side only, outside repository files | `<configured/missing>` |
| `PDM_DB_PROVIDER` | `postgres` only for approved smoke process | `<configured/missing>` |
| `PDM_POSTGRES_POOLER_MODE` | `<direct/session/transaction>` | `<configured/missing>` |
| `NEXT_PUBLIC_*` database password / service role / secret / Postgres URL | absent | `<absent/found>` |

Secret values redacted: `<yes/no>`

No-go if any secret must be committed, printed in an evidence file, exposed through `NEXT_PUBLIC_*`, or copied into the browser.

## 6. Migration History And CLI Evidence

| Evidence | Expected | Observed |
|---|---|---|
| `supabase migration list` | target-linked evidence captured after approval, or accepted ADR exception path used | `<pass/fail/exception>` |
| Migration-history exception | staging-only, ADR-backed if used | `<no/yes with ADR>` |
| CLI command discovery | `supabase --help` / relevant `--help` checked before new CLI usage | `<done/not needed>` |
| `supabase db lint` / `supabase test db` | not required for GATE-B unless separately approved and CLI available | `<not run / result>` |

No-go if migration history contradicts the accepted policy or the target identity cannot be proven before target-linked CLI commands.

## 7. Final Receipt Disposition

Choose one:

- `pass`: target identity, version, exposure, credentials, and migration-history evidence are acceptable for approved GATE-B smoke.
- `fail`: target identity, version, exposure, credentials, or migration-history evidence contradicts the gate.
- `blocked`: evidence is missing or approval/credentials are unavailable.

Final result: `<pass/fail/blocked>`

This receipt does not approve production cutover, production data migration, Supabase project creation, branch creation, cost-incurring actions, or repository secret commits.
