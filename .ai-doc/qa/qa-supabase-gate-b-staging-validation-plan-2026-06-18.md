# QA Supabase GATE-B Staging Validation Plan

Date: 2026-06-18
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: QA validation plan
Status: Prepared for QC execution
Scope: `AI_PDM_STAGING` only

## 1. Purpose

This QA plan defines the validation criteria for accepting the completed GATE-B staging runtime smoke evidence for `AI_PDM_STAGING`.

The plan verifies that staging runtime behavior is proven, cleanup is proven, rollback readiness is proven, and the production/cutover boundary remains intact.

This plan does not authorize production access, production smoke, production migration, cutover, Supabase project or branch creation, migration repair, or cost-incurring actions.

## 2. Validation Boundary

Allowed:

- Read existing local QA/QC/PM evidence files.
- Run local QC scripts that do not mutate Supabase data.
- Run read-only Supabase connector checks against project `qerabudthnnpqvybpcsq` / `AI_PDM_STAGING`.
- Verify existing smoke residue and deterministic seed state.
- Verify that secrets are redacted and not committed.

Not allowed:

- Production access.
- Production cutover.
- Production data migration.
- Full data parity execution.
- Supabase project or branch operations.
- Direct DB mutation during this validation pass.
- Repository storage of connection strings, passwords, service role keys, cookies, or tokens.

## 3. Current Supabase References

QA reviewed current Supabase guidance relevant to this validation:

- Supabase changelog, including the 2026 breaking change that new public tables are not automatically exposed to Data and GraphQL APIs: https://supabase.com/changelog
- Seeding guidance for deterministic test/development seed data: https://supabase.com/docs/guides/local-development/seeding-your-database
- Securing data with RLS, least privilege grants, and server-side credential boundaries: https://supabase.com/docs/guides/database/secure-data
- Custom schema and Data API exposure guidance: https://supabase.com/docs/guides/api/using-custom-schemas
- Database advisor RLS public-table lint guidance: https://supabase.com/docs/guides/database/database-advisors

Validation implication:

- GATE-B must remain app-API based and server-side.
- Browser-side direct Supabase Data API access to base tables is not accepted.
- Public schema exposure and RLS remain production-gate concerns unless explicitly approved.
- Deterministic staging seed repairs are acceptable only because PM approved them for `AI_PDM_STAGING` and QC verifies cleanup and boundaries.

## 4. QA Acceptance Criteria

| ID | Criterion | Required evidence |
|---|---|---|
| `QA-STG-001` | Target is exactly `AI_PDM_STAGING` | Supabase project read-only evidence: ref `qerabudthnnpqvybpcsq`, name `AI_PDM_STAGING`, organization `ydxbtstvlunmpjdlrhml`, region `ap-northeast-1`, status `ACTIVE_HEALTHY`, Postgres major `17` |
| `QA-STG-002` | Production and cutover are explicitly denied | Runtime smoke report, target identity receipt, dev_task, and QC validator all state no production and no cutover |
| `QA-STG-003` | GATE-B app API smoke passed | QC runtime smoke report records login, `/api/auth/me`, admin matrix, rule simulator, duplicate-check, record create, readback, obsolete cleanup, and logout success |
| `QA-STG-004` | Permission seed repair is sufficient for smoke | `system_admin` and `pdm_admin` each have 43 allowed permissions; required smoke permission set is allowed |
| `QA-STG-005` | Minimal `numbering-rule-v1` seed exists | Read-only query shows active `numbering_rule_versions.id='numbering-rule-v1'` count is `1` |
| `QA-STG-006` | Smoke data is cleaned or obsolete | Read-only query shows active smoke roots `0`, active smoke parts `0`, active smoke drawings `0`, and the known smoke root/part are obsolete |
| `QA-STG-007` | Rollback readiness is proven | `qc:supabase-runtime-rollback-readiness`, `qc:db-provider-contract`, and `qc:supabase-secret-boundary` pass after stopping the Postgres-mode process |
| `QA-STG-008` | Secret boundary is intact | Evidence records only configured/missing status and redacted placeholders; no live secrets appear in tracked QA/QC/dev_task evidence |
| `QA-STG-009` | Staging acceptance is not expanded into data parity | dev_task keeps `DEV-SUPABASE-DB-001-DATA-PARITY` as separate PM-approved scope |

## 5. QC Execution Steps

QC must execute or inspect the following:

```powershell
node scripts/qc-supabase-gate-b-staging-validation.mjs
npm.cmd run qc:supabase-runtime-smoke-report
npm.cmd run qc:supabase-target-identity-receipt
npm.cmd run qc:supabase-runtime-local-readiness
npm.cmd run qc:supabase-runtime-gate-plan
npm.cmd run qc:supabase-runtime-gate-b-local-suite
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:supabase-secret-boundary
npm.cmd run qc:db-provider-contract
```

QC may additionally perform read-only Supabase connector checks against `AI_PDM_STAGING`:

- Project metadata read.
- Deterministic seed counts.
- Smoke residue counts.
- Required Admin smoke permission counts.

## 6. No-Go Criteria

QC must fail or block acceptance if any of the following are observed:

- Target name is not `AI_PDM_STAGING`.
- Project ref does not match `qerabudthnnpqvybpcsq`.
- Project status is not healthy enough for staging verification.
- Any evidence claims production approval or cutover approval.
- Any live connection string, password, service role key, cookie, or token appears in repository evidence.
- Active `AI_PDM_GB_SMOKE_*` root, part, or drawing records remain without owner/expiry.
- `numbering-rule-v1` is missing or inactive.
- Required Admin smoke permissions are not allowed for `system_admin` and `pdm_admin`.
- The validation attempts full data parity, production access, or direct DB mutation.

## 7. QA Disposition

QA disposition: ready for QC verification.

The expected QC outcome is pass only if the evidence proves `AI_PDM_STAGING` staging acceptance and preserves the no-production/no-cutover boundary.
