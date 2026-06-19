# QC Supabase Target Identity Receipt

Date: 2026-06-17
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-dev / QC target identity evidence
Status: User-provided target identity and owner evidence recorded; live target guard, schema/RLS compare, permission seed repair, rule seed repair, app smoke, cleanup, and rollback passed

## 1. Purpose

This receipt records non-secret target identity evidence provided by PM for the approved `AI_PDM_STAGING`-only GATE-B staging runtime smoke.

It does not approve production cutover, production data migration, Supabase project creation, branch creation, cost-incurring actions, or repository secret commits.

## 2. Approval Record

| Field | Value |
|---|---|
| Approval source | PM chat message |
| Approval timestamp | 2026-06-16 Asia/Taipei |
| Approved gate | `DEV-SUPABASE-DB-001-GATE-B` |
| Approved target | `AI_PDM_STAGING` |
| Approval scope | Staging runtime smoke only; no production cutover |

## 3. Target Identity

Record only non-secret identifiers.

| Evidence | Expected | Observed |
|---|---|---|
| `PDM_SUPABASE_TARGET_NAME` | `AI_PDM_STAGING` | `AI_PDM_STAGING` |
| Supabase project display name | `AI_PDM_STAGING` | `AI_PDM_STAGING` |
| Supabase project ref | staging ref | `qerabudthnnpqvybpcsq` |
| Organization | approved org | `Jenfu Machinery` / `ydxbtstvlunmpjdlrhml` |
| Region | approved region | `ap-northeast-1` |
| User confirmation | not production, not `ProJED`, not `ProJED_TEST` | yes |
| Target guard command | `npm.cmd run db:postgres:guard -- --phase compare` | PASS; `targetIdentity.safe=true`, `safe=true`, `mode=ai_pdm_shadow_schema`, `expectedTableCount=64`, `publicTableCount=64`, no missing or unknown tables |
| Schema/RLS compare command | `npm.cmd run db:postgres:compare:schema-rls -- --no-write` | PASS; `postgresTables=64`, `rlsMissingTables=[]`, `mismatches=[]` |
| Smoke data owner | named owner before execution | `Jed` |
| Cleanup owner | named owner before execution | `Jed` |
| Cleanup criteria | GATE-B smoke data must be deleted or obsoleted after execution | Delete or obsolete all `AI_PDM_GB_SMOKE_*` test records after GATE-B smoke completes |

No-go if the observed target is missing, unknown, production, `ProJED`, `ProJED_TEST`, or any non-AI_PDM project.

## 4. Platform Version And Exposure

| Evidence | Expected | Observed |
|---|---|---|
| Target Postgres major version | not Postgres 14 after 2026-07-01 unless PM explicitly accepts risk | `17` |
| Postgres 14 risk decision | not applicable | not applicable |
| Data API / GraphQL table exposure used by GATE-B | `no` | no browser-side Supabase Data API used by the app smoke |
| Browser-side direct Supabase Data API to base tables | `no` | no |
| Direct `anon` / `authenticated` base-table grants changed for GATE-B | `no` | no changes performed |
| RLS / FORCE RLS baseline | enabled and forced for public AI_PDM tables | schema/RLS compare passed |
| Advisor / RLS blocker status | no unaccepted P0/P1 blocker | no live advisor mutation or repair performed |

No-go if GATE-B depends on browser-side direct Supabase Data API access to AI_PDM base tables without explicit `GRANT` and RLS review.

## 5. Credential Boundary

Record names and configured/missing status only. Do not record values.

| Env name | Expected | Observed |
|---|---|---|
| `PDM_RUNTIME_SMOKE_APPROVED` | configured only after PM approval | configured in local approved env; value not secret |
| `PDM_POSTGRES_URL` | server-side only, outside repository files | configured outside repository; value not recorded |
| `PDM_POSTGRES_SHADOW_URL` | server-side only, outside repository files | configured outside repository; value not recorded |
| `PDM_DB_PROVIDER` | `postgres` only for approved smoke process | configured only in approved smoke process |
| `PDM_POSTGRES_POOLER_MODE` | `direct` / `session` / `transaction` | local approved env reports `direct`; provider probe passed |
| `NEXT_PUBLIC_*` database password / service role / secret / Postgres URL | absent | absent from this receipt |

Secret values redacted: yes.

No-go if any secret must be committed, printed in an evidence file, exposed through `NEXT_PUBLIC_*`, or copied into the browser.

## 6. Migration History And CLI Evidence

| Evidence | Expected | Observed |
|---|---|---|
| `supabase migration list` | target-linked evidence captured after approval, or accepted ADR exception path used | local Supabase CLI is not installed |
| Supabase MCP migration evidence | acceptable read-only fallback when CLI is unavailable | `list_migrations` returned `20260615040619_harden_set_updated_at_search_path` |
| Migration-history exception | staging-only, ADR-backed if used | ADR exception remains available |
| CLI command discovery | `supabase --help` checked before new CLI usage | failed because CLI is not installed |
| `supabase db lint` / `supabase test db` | not required for GATE-B unless separately approved and CLI available | not run |

No-go if migration history contradicts the accepted policy or the target identity cannot be proven before target-linked CLI commands.

## 7. App Smoke Boundary

| Evidence | Observed |
|---|---|
| Fresh Postgres-mode process | Started on `http://127.0.0.1:3000` and later stopped |
| App auth | PASS; demo Admin login returned cookie name `pdm_session`; cookie value not recorded |
| `/api/auth/me` | PASS; role `Admin` |
| Permission seed repair | PASS; 6 built-in roles, 86 `system_admin` / `pdm_admin` permissions, and one active priority version recorded in `AI_PDM_STAGING` |
| Required Admin smoke permissions | PASS; `settings.admin_matrix`, `numbering.duplicate_check`, `numbering.create`, `numbering.search`, and `numbering.draft.obsolete` are allowed for `system_admin` and `pdm_admin` |
| First protected smoke API after repair | PASS; `/api/numbering/admin/matrix` returned HTTP 200 |
| Rule simulator after repair | PASS; `/api/numbering/rule-simulator` returned HTTP 200 |
| Duplicate check after repair | PASS; `/api/numbering/duplicate-check` returned HTTP 200 |
| Minimal rule seed repair | PASS; `numbering_rule_versions.id='numbering-rule-v1'` exists and is active |
| Write smoke API | PASS; `/api/numbering/records` returned HTTP 201 for `AI_PDM_GB_SMOKE_202606170939_JED` |
| Smoke readback API | PASS; `/api/numbering/roots/0001` returned HTTP 200 |
| Smoke cleanup API | PASS; `/api/numbering/records/0001/obsolete` returned HTTP 200 |
| Smoke data cleanup proof | PASS; root `0001` and part `P-0001-001` are `Obsolete`; active smoke roots `0`, active smoke parts `0` |
| Rollback | PASS; local rollback readiness 10/10 after stopping process |

## 8. Final Receipt Disposition

Final result: `pass`

Reason: target identity, live guard, schema/RLS compare, migration history evidence, Postgres provider probe, secret boundary, rollback evidence, approved staging permission seed repair, approved minimal `numbering-rule-v1` seed repair, app API smoke, and cleanup proof passed for `AI_PDM_STAGING`.

This receipt does not approve production cutover, production data migration, Supabase project creation, branch creation, cost-incurring actions, or repository secret commits.
