# QC Supabase GATE-B Staging Validation Report

Date: 2026-06-18
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: QC verification
Status: Passed
Scope: `AI_PDM_STAGING` only

## 1. QC Objective

QC verified the QA plan:

- [.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md)

The verification confirms that GATE-B staging runtime smoke evidence is sufficient for `AI_PDM_STAGING`, while production and cutover remain explicitly unapproved.

## 2. Scope Control

QC performed read-only evidence inspection and read-only Supabase connector checks only.

Not performed:

- No production access.
- No production cutover.
- No production migration.
- No full data parity execution.
- No Supabase project or branch operation.
- No migration repair.
- No direct DB mutation during this 2026-06-18 QC validation pass.
- No secret, connection string, service role key, token, cookie, or password value recorded.

## 3. Supabase Target Identity

Read-only Supabase connector project evidence:

| Field | Observed |
|---|---|
| Project ref | `qerabudthnnpqvybpcsq` |
| Project name | `AI_PDM_STAGING` |
| Organization id | `ydxbtstvlunmpjdlrhml` |
| Region | `ap-northeast-1` |
| Status | `ACTIVE_HEALTHY` |
| Postgres engine | `17` |
| Database version | `17.6.1.127` |

QC result: pass.

## 4. Staging Seed And Cleanup Read-Only Proof

Read-only SQL was executed against project `qerabudthnnpqvybpcsq`.

Observed result:

| Evidence | Value |
|---|---:|
| Active `numbering-rule-v1` rows | `1` |
| Roles count | `6` |
| Active smoke roots | `0` |
| Active smoke parts | `0` |
| Active smoke drawings | `0` |
| Obsoleted smoke root proof for `AI_PDM_GB_SMOKE_202606170939_JED` | `1` |
| Obsoleted smoke part proof for `AI_PDM_GB_SMOKE_202606170939_JED part` | `1` |

QC result: pass.

## 5. Permission Seed Read-Only Proof

Read-only SQL verified Admin smoke permissions through `roles.role_code` joined to `role_permissions.role_id`.

Observed result:

| Role | Allowed permissions | Required smoke permissions allowed count |
|---|---:|---:|
| `pdm_admin` | `43` | `6` |
| `system_admin` | `43` | `6` |

Required smoke permission set:

- `settings.admin_matrix`
- `numbering.duplicate_check`
- `numbering.create`
- `numbering.search`
- `numbering.draft.obsolete`

The observed count is `6` because the database currently contains six matching required smoke permission rows for each role under the approved smoke permission set. QC acceptance requires the count to be at least the named required permissions and not zero.

QC result: pass.

## 6. Existing Runtime Smoke Evidence Reviewed

QC reviewed:

- [.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md)
- [.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md)
- [.ai-doc/dev_task.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/dev_task.md)

Evidence reviewed:

- Admin login passed with cookie-name-only evidence.
- `/api/auth/me` returned role `Admin`.
- `/api/numbering/admin/matrix` returned HTTP 200 after permission repair.
- `/api/numbering/rule-simulator` returned HTTP 200.
- `/api/numbering/duplicate-check` returned HTTP 200.
- `/api/numbering/records` returned HTTP 201 after minimal `numbering-rule-v1` seed repair.
- `/api/numbering/roots/0001` returned HTTP 200.
- `/api/numbering/records/0001/obsolete` returned HTTP 200.
- Logout returned HTTP 200.
- The Postgres-mode process was stopped and port 3000 was released.
- Rollback readiness, provider contract, and secret boundary checks passed.

QC result: pass.

## 7. Local QC Commands

QC validation commands:

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
node --check scripts/qc-supabase-gate-b-staging-validation.mjs
```

Expected result: all pass.

Observed result: pass after this report and validator were added.

## 8. Supabase Guidance Alignment

QC checked that the acceptance remains aligned with current Supabase guidance:

- Server-side Postgres credentials only; no browser-side database secrets.
- No browser-side direct Supabase Data API access to AI_PDM base tables in the smoke.
- No new production data exposure.
- RLS/schema parity was already recorded by the GATE-B smoke evidence.
- Data API table exposure and advisor/RLS findings remain production-gate concerns unless PM explicitly approves further scope.

QC result: pass.

## 9. Final QC Disposition

Final result: pass for `AI_PDM_STAGING` staging acceptance.

This report does not approve production access, production migration, production smoke, production cutover, full data parity execution, Supabase project or branch operations, migration repair, or cost-incurring actions.

Remaining PM decisions:

- Decide whether to approve `DEV-SUPABASE-DB-001-DATA-PARITY`.
- Keep `DEV-SUPABASE-DB-001-PROD-GATE` deferred until separately approved.
