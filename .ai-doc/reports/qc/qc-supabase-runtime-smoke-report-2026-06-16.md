# QC Supabase Runtime Smoke Report

Date: 2026-06-17
Task: `DEV-SUPABASE-DB-001-GATE-B`
Mode: PM-approved staging smoke attempt
Status: Passed / full staging app API smoke and cleanup proof captured

## 1. Approval Record

Approval source: PM chat message on 2026-06-16 Asia/Taipei.

Approved scope:

- Run `AI_PDM_STAGING` staging runtime smoke only.
- Do not touch production.
- Do not perform cutover.
- Do not write secrets, connection strings, service role keys, tokens, cookies, or passwords into repository files.

## 2. Execution Decision

Live staging prerequisites were executed only within the approved `AI_PDM_STAGING` scope.

Final result: `pass`

Reason: target identity, schema/RLS, migration history, Postgres provider, secret boundary, rollback checks, approved staging permission seed repair, approved minimal `numbering-rule-v1` seed repair, app API write/readback/cleanup smoke, and cleanup proof all passed.

Smoke data `AI_PDM_GB_SMOKE_202606170939_JED`, root `0001`, and part `P-0001-001` were created only in `AI_PDM_STAGING` and obsoleted through the app API. Direct cleanup proof shows active smoke roots `0` and active smoke parts `0`.

| Evidence | Current state |
|---|---|
| `PDM_RUNTIME_SMOKE_APPROVED=true` | PM-approved and configured in local approved env |
| `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING` | User-provided target identity recorded and configured in local approved env |
| `PDM_POSTGRES_URL` | Configured outside repository; value not recorded |
| `PDM_POSTGRES_SHADOW_URL` | Configured outside repository; value not recorded |
| `PDM_DB_PROVIDER=postgres` | Configured only in the approved smoke process |
| Target identity proof | User-provided receipt recorded; live target guard passed |
| Smoke data owner | `Jed` |
| Cleanup owner | `Jed` |
| Cleanup criteria | Delete or obsolete all `AI_PDM_GB_SMOKE_*` test records after GATE-B smoke completes |

Target identity receipt:

- `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`

## 3. Preflight Evidence

Command executed:

```powershell
npm.cmd run qc:supabase-runtime-smoke-preflight
```

Observed result:

| Field | Result |
|---|---|
| `status` | `ready` |
| `readyForRuntimeSmoke` | `true` |
| `blockerCount` | `0` |
| `hazardCount` | `0` |
| `approval.granted` | `true` in local approved env |
| `target.configured` | `AI_PDM_STAGING` |
| `runtime.provider` | `postgres` |
| `PDM_POSTGRES_URL` | `<configured>` |
| `PDM_POSTGRES_SHADOW_URL` | `<configured>` |
| `PDM_POSTGRES_POOLER_MODE` | `direct` |

Blockers reported by preflight: none.

## 4. Live Target Guard And Schema/RLS Evidence

Command executed:

```powershell
npm.cmd run db:postgres:guard -- --phase compare
```

Observed result:

| Field | Result |
|---|---|
| `targetIdentity.safe` | `true` |
| `configuredTargetName` | `AI_PDM_STAGING` |
| `phase` | `compare` |
| `safe` | `true` |
| `mode` | `ai_pdm_shadow_schema` |
| `expectedTableCount` | `64` |
| `publicTableCount` | `64` |
| `missingExpectedTables` | `[]` |
| `unknownTables` | `[]` |
| `issues` | `[]` |

Command executed:

```powershell
npm.cmd run db:postgres:compare:schema-rls -- --no-write
```

Observed result:

| Field | Result |
|---|---|
| `comparePolicy` | `schema_rls_only` |
| `dataCompareSkipped` | `true` |
| `sqliteTables` | `64` |
| `postgresTables` | `64` |
| `missingInPostgres` | `[]` |
| `rlsMissingTables` | `[]` |
| `postgresTargetIdentity.safe` | `true` |
| `postgresTargetGuard.safe` | `true` |
| `mismatches` | `[]` |

## 5. Migration History Evidence

The local Supabase CLI is not installed, so `supabase migration list` could not be used after command discovery failed.

Read-only Supabase MCP `list_migrations` was used for project `qerabudthnnpqvybpcsq`.

Observed migration:

- `20260615040619_harden_set_updated_at_search_path`

No migration repair was run.

## 6. Runtime Provider Evidence

Command executed:

```powershell
npm.cmd run qc:db-provider-postgres
```

Observed result:

- Passed 9/9.
- Live Postgres probe passed.
- No connection string value was recorded.

Command executed:

```powershell
npm.cmd run qc:supabase-secret-boundary
```

Observed result:

- Passed 15/15.

## 7. App API Smoke Evidence

Fresh Postgres-mode local app process:

- Startup command: `npm.cmd run dev:local`
- URL: `http://127.0.0.1:3000`
- Runtime provider: `postgres`
- Env source: local approved `gate-b-staging.env.ps1`
- Secret values: not recorded

Smoke API result:

| Step | Result |
|---|---|
| `auth_login` | PASS; HTTP 200; cookie name `pdm_session`; account label `demo-admin`; cookie value not recorded |
| `auth_me_confirm` | PASS; `/api/auth/me` returned role `Admin` |
| `read_path_admin_matrix` | PASS after permission repair; HTTP 200; roles array length `6`, rolePermissions array length `86` |
| `read_path_rule_simulator` | PASS after permission repair; HTTP 200 |
| `pre_write_duplicate_guard` | PASS after permission repair; HTTP 200; no duplicate matches |
| `write_path_numbering_smoke_record` | PASS after rule seed repair; HTTP 201; root `0001`, part `P-0001-001`, drawing `null` |
| `readback_created_record` | PASS; HTTP 200; partNumbers array length `1`, drawingNumbers array length `0` |
| `cleanup_smoke_record` | PASS; HTTP 200; root and part status obsoleted through app API |
| `auth_logout` | PASS; HTTP 200 |

Permission seed repair evidence:

| Evidence | Result |
|---|---|
| Staging target | `AI_PDM_STAGING` / project ref `qerabudthnnpqvybpcsq` |
| Approved repair scope | GATE-B permission seed repair only; no production; no cutover |
| Roles after repair | `roles=6` |
| Role permissions after repair | `role_permissions=86` for `system_admin` and `pdm_admin` |
| Active role priority | `role_priority_versions=1`; `gate-b-baseline` |
| Required Admin smoke permissions | `settings.admin_matrix`, `numbering.duplicate_check`, `numbering.create`, `numbering.search`, `numbering.draft.obsolete` all `allowed=1` for `system_admin` and `pdm_admin` |

Rule seed repair evidence:

| Evidence | Result |
|---|---|
| Approved repair scope | Minimal `numbering-rule-v1` data seed repair only; no production; no cutover |
| `numbering_rule_versions` | `1` |
| `numbering-rule-v1` | exists and active |
| `rule_code` | `PDM-NUMBERING-V1` |
| `rule_json` | `{"partRootDigits":4,"partSequenceDigits":3,"drawingPrefix":"D","partPrefix":"P","drawingPurposeCodes":["MA","OT"]}` |

Cleanup proof:

| Evidence | Result |
|---|---|
| Smoke core | `AI_PDM_GB_SMOKE_202606170939_JED` |
| Smoke root | `0001`, `Obsolete` |
| Smoke part | `P-0001-001`, `Obsolete` |
| Active smoke roots | `0` |
| Active smoke parts | `0` |

Interpretation: GATE-B staging runtime smoke passed for `AI_PDM_STAGING`. Production and cutover remain unapproved.

## 8. Rollback Evidence

The Postgres-mode local process was stopped and port 3000 was released.

Commands executed after stopping the process:

```powershell
npm.cmd run qc:supabase-runtime-rollback-readiness
npm.cmd run qc:db-provider-contract
npm.cmd run qc:supabase-secret-boundary
```

Observed result:

| Command | Result |
|---|---|
| `qc:supabase-runtime-rollback-readiness` | PASS 10/10; `PDM_DB_PROVIDER=<unset>` and `PDM_POSTGRES_URL=<missing>` |
| `qc:db-provider-contract` | PASS 35/35 |
| `qc:supabase-secret-boundary` | PASS 15/15 |

## 9. Actions Not Performed

The following were not performed:

- No production access.
- No production cutover.
- No Supabase project or branch operation.
- No migration repair.
- No full data parity execution.
- No direct DB edit to bypass app permissions.
- No active `AI_PDM_GB_SMOKE_*` numbering record remains; created smoke data was obsoleted through app API.
- No repository secret commit.

## 10. Final Disposition

GATE-B passed for `AI_PDM_STAGING`.

Remaining before production:

- PM must explicitly approve any production target setup, production smoke, production migration, or cutover.
- Data parity remains a separate PM-approved scope if needed.

Production and cutover remain unapproved.
