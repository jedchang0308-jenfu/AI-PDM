# AI PDM dev_task PM Control Board

Updated: 2026-06-24
Owner: PM-dev

Legacy snapshot:

- [dev_task_legacy_before_pm_cleanup_2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/archived/dev_task_legacy_before_pm_cleanup_2026-06-16.md)

## 1. PM Snapshot

Active objective: `DEV-PDM-CHANGE-CONTROL-001` Phase 1 data model/domain service implementation is in local evidence capture; `DEV-SW-LICENSE-PDM-001` is committed locally; `DEV-SUPABASE-DB-001` production/cutover remains deferred.

`DEV-SUPABASE-DB-001` staging GATE-B remains passed and production/cutover remains deferred. The approved SW license / PDM company separation implementation lane has been closed in a scoped local commit.

Do not add storage governance, CAD/SolidWorks, backup, field-test, production cutover, unrelated UI work, or new feature scope into this active lane.

| Gate | Current state | Decision |
|---|---|---|
| API route provider boundary | `src/app/api/**/route.ts` direct `@/lib/db` import count is `0` | Prepared |
| `DEV-SUPABASE-DB-001-GATE-A` | Done for preparation; runtime execution evidence still belongs to GATE-B | Prepared |
| `DEV-SUPABASE-DB-001-GATE-B` | PM approval, `AI_PDM_STAGING` target identity, smoke owner, cleanup owner, live target guard, schema/RLS compare, migration history evidence, Postgres provider probe, secret boundary, rollback checks, staging permission seed repair, minimal `numbering-rule-v1` seed repair, app API write/readback/cleanup smoke, and cleanup proof are recorded | Passed |
| Runtime smoke preflight | Runtime smoke preflight passed in local approved env with redacted `<configured>` credential status and zero blockers/hazards | Ready |
| Production gate | Depends on GATE-B pass | Deferred |

GATE-B control note:

- PM approved only `AI_PDM_STAGING` staging runtime smoke; production and cutover remain unapproved.
- Earlier connection blocker is closed: live target guard and schema/RLS compare now pass against `AI_PDM_STAGING`.
- Initial runtime app smoke started a fresh Postgres-mode local process, authenticated demo Admin through app auth, then stopped at `/api/numbering/admin/matrix` with HTTP 403 `Insufficient role permission`.
- PM approved only `AI_PDM_STAGING` GATE-B permission seed repair. Staging ACL seed repair upserted 6 built-in roles, 86 `system_admin` / `pdm_admin` role permissions, and one active role priority version.
- Permission repair verification passed: `/api/numbering/admin/matrix`, `/api/numbering/rule-simulator`, and `/api/numbering/duplicate-check` returned HTTP 200 through the app API.
- PM then approved only `AI_PDM_STAGING` minimal `numbering-rule-v1` data seed repair. Staging now has `numbering_rule_versions.id='numbering-rule-v1'` with active `PDM-NUMBERING-V1` metadata.
- Re-run smoke passed through app API: Admin login, `/api/auth/me`, admin matrix, rule simulator, duplicate-check, numbering record create, readback, obsolete cleanup, and logout all returned success statuses.
- Smoke data `AI_PDM_GB_SMOKE_202606170939_JED`, root `0001`, part `P-0001-001` was created only in staging and then obsoleted through app API. Direct cleanup proof shows active smoke roots `0` and active smoke parts `0`.
- The Postgres-mode process was stopped and port 3000 was released.

Current recommendation: treat `DEV-SUPABASE-DB-001-GATE-B` as passed for `AI_PDM_STAGING`. Production/cutover remains deferred until PM explicitly approves production scope.

## 2. Active Kanban

| Lane | ID | Type | Parent | State | Next condition | Evidence |
|---|---|---|---|---|---|---|
| Evidence Captured / Phase 1 | `DEV-PDM-CHANGE-CONTROL-001` | Delivery point | None | Phase 1 local SQLite schema, change-control domain service, draft recycle/submit guards, boundary reason detection, event retention, and optimistic-lock QC implemented; no Phase 2-5 UI/API/review/BOM release transaction or production/Supabase cutover implemented | PM chooses next slice: Phase 2 API/UI, Postgres/Supabase migration mirror under existing runtime governance, or keep later phases deferred | ADR `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`; SPEC `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`; implementation contract `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`; QA plan `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`; `db/schema.sql`; `src/lib/pdm-change-control-domain.ts`; `src/lib/pdm-change-control.ts`; `scripts/qc-pdm-change-control.mjs`; QC report `.ai-doc/reports/qc/qc-pdm-change-control-phase-1-report-2026-06-24.md`; `npm.cmd run qc:pdm-change-control` 23/23; `npx.cmd tsc --noEmit --pretty false`; focused ESLint |
| Deferred | `DEV-SUPABASE-DB-001` | Development objective | None | Staging GATE-B passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred | PM decides data parity tier and production gate scope, or keeps production deferred | Section 5 |
| Evidence Captured | `DEV-SW-LICENSE-PDM-001` | Delivery point | None | Backend company-scope plus Web/Add-in company selection, direct read-path company permissions, core numbering company scope, company-aware CAD metadata adapter profile resolver, and numbering workflow/detail/task company scope implemented and committed locally | Commit boundary closed in `6f4dbab` after user authorized Supabase staged evidence handling, index rebuild, and partial commit in the dirty worktree | SPEC-SW-LICENSE-PDM-001 / ADR-SW-LICENSE-PDM-001 / PM plan / Git boundary handoff / local commits `be333eb` and `6f4dbab` / `npx.cmd tsc --noEmit` / `npm.cmd run lint` / `npm.cmd run build` / `qc:sw-license-pdm-company-scope` / `qc:sw-license-pdm-numbering-company-scope` / `qc:sw-license-pdm-metadata-adapter-profile` / `qc:sw-license-pdm-git-boundary` / `qc:sw-addin-company-selection` |
| Evidence Captured | `DEV-SUPABASE-DB-001-GATE-B` | Gate / RD-QC execution | `DEV-SUPABASE-DB-001` | Target/schema/provider checks passed; permission repair passed; `numbering-rule-v1` minimal seed passed; app API write/readback/cleanup smoke passed; active smoke data count is zero | No further staging GATE-B action unless PM asks for a rerun | Approval package / runbook / smoke matrix / execution report / target identity receipt |
| Evidence Captured | `DEV-SUPABASE-DB-001-GATE-B-STAGING-QA-QC` | QA / QC acceptance | `DEV-SUPABASE-DB-001-GATE-B` | QA/QC staging validation passed for `AI_PDM_STAGING`; read-only connector evidence confirms active project, seed state, permissions, and zero active smoke residue | No further staging acceptance action unless PM asks for a rerun | QA staging validation plan / QC staging validation report |
| Evidence Captured | `DEV-SUPABASE-DB-001-GATE-B-PERMISSION-SEED` | Gate repair evidence | `DEV-SUPABASE-DB-001-GATE-B` | `roles=6`, `role_permissions=86`, active priority=1; required Admin smoke permissions are `allowed=1`; admin matrix, rule simulator, and duplicate check returned HTTP 200 | No further permission seed action unless a later regression appears | Smoke execution report / target identity receipt |
| Evidence Captured | `DEV-SUPABASE-DB-001-GATE-B-RULE-SEED` | Gate repair evidence | `DEV-SUPABASE-DB-001-GATE-B` | `numbering_rule_versions=1`; `numbering-rule-v1` exists and is active; write path no longer fails FK | No further rule seed action unless a later regression appears | Smoke execution report / target identity receipt |
| Evidence Captured | `DEV-SUPABASE-DB-001-MIGRATION-HISTORY` | PM / QC evidence | `DEV-SUPABASE-DB-001` | Supabase MCP `list_migrations` captured for `AI_PDM_STAGING`: `20260615040619_harden_set_updated_at_search_path`; Supabase CLI is not installed locally | No migration repair unless separately approved | Migration history policy |
| Evidence Captured | `DEV-SUPABASE-DB-001-ROLLBACK-PROOF` | QC evidence | `DEV-SUPABASE-DB-001` | Postgres-mode local process was stopped; `qc:supabase-runtime-rollback-readiness` passed 10/10 with `PDM_DB_PROVIDER=<unset>` and `PDM_POSTGRES_URL=<missing>` | Re-run after final successful smoke if GATE-B is retried | Rollback readiness plan |
| Prepared / Blocked | `DEV-SUPABASE-DB-001-DATA-PARITY` | QA / PM evidence | `DEV-SUPABASE-DB-001` | Policy prepared; execution not approved | PM approves parity tier, target, data scope, cleanup owner, credential boundary | Data parity policy |
| Deferred | `DEV-SUPABASE-DB-001-PROD-GATE` | PM decision | `DEV-SUPABASE-DB-001` | Waiting for staging gate pass | Production target, cost confirmation, advisor triage, production migration plan | Not executable now |

## 3. Parked Scope And External Blockers

These items are deliberately outside the current active lane. They remain visible so evidence-sync can keep them blocked until independent evidence exists.

| Status | ID | Scope | Reason |
|---|---|---|---|
| [!] | `DEV-IND-007` | SQLite to Postgres / Supabase shadow migration | Supabase runtime work is controlled by `DEV-SUPABASE-DB-001` and GATE-B evidence |
| [!] | `DEV-STORAGE-COST-001` | Storage governance and cost | Not part of current DB runtime gate |
| [!] | `DEV-CAD-001` | SolidWorks Document Manager or equivalent reader | Needs external component evidence |
| [!] | `DEV-SW-001` | SolidWorks Add-in real-machine validation | Needs real-machine evidence |
| [x] | `DEV-SW-LICENSE-PDM-001` | SW license / PDM company operational shared strategy | Backend company-scope, Web/Add-in company selection, direct detail/download/release package/BOM/workbench/action read checks, core numbering create/search/detail/update/obsolete/drawing/part-list company scope, numbering approval/import/export/monthly-audit/DVT/impact/part-detail/task/notification company scope, and company-aware metadata adapter profile resolver implemented, verified, and committed in `6f4dbab`; Supabase staged evidence was first committed separately in `be333eb` |
| [!] | `DEV-BACKUP-001` | Offline one-way backup and restore drill | Needs restore-drill evidence |
| [!] | `DEV-FIELD-001` | Formal field-test evidence | Needs formal field evidence |

External blocker ledger kept for evidence-sync:

- [!] `P0` SolidWorks Add-in 實機驗證：needs real-machine evidence; outside current active scope.
- [!] `P0` 離線單向備份與還原：needs restore drill evidence; outside current active scope.
- [!] `P0` SolidWorks Document Manager API 或等效授權元件：needs component evidence; outside current active scope.
- [!] `P1` 正式現場測試：needs formal field-test evidence; outside current active scope.
- [!] 取得 disposable Supabase / Postgres shadow target。Current Supabase work is controlled by `AI_PDM_STAGING` GATE-B; production remains deferred.
- [!] `npm.cmd run qc:postgres-shadow` 在 disposable target 通過。Current approved target is `AI_PDM_STAGING` only.
- [!] `P0` 整合 SolidWorks Document Manager API 或等效讀取元件。Outside current active scope.
- [!] `P0` 確認 SolidWorks Document Manager 授權與可部署方式。Outside current active scope.

## 4. Remaining Development Tasks

| Priority | ID | Remaining work | Prepared evidence | Missing evidence |
|---:|---|---|---|---|
| 1 | `DEV-SUPABASE-DB-001-DATA-PARITY` | Choose parity tier and execute only if approved | Data parity policy prepared; staging smoke baseline exists | Approved source snapshot, table scope, target, cleanup owner, credentials |
| 2 | `DEV-SUPABASE-DB-001-PROD-GATE` | Production target and cutover decision | Staging GATE-B passed | PM approval for production scope, cost confirmation, advisor triage, production migration plan |

## 5. Evidence Index

All evidence below is local-only unless the linked document explicitly says it is approval-gated. No production, cutover, cost action, or repository secret storage is authorized by this section.

| Evidence | Status | QC command |
|---|---|---|
| PDM change-control Phase 1 | Passed / local schema and domain service evidence captured; UI/API/review/BOM release flows deferred | `npm.cmd run qc:pdm-change-control` |
| Runtime provider gate QA plan | Prepared | `npm.cmd run qc:supabase-runtime-gate-plan` |
| GATE-B approval package | Prepared | `npm.cmd run qc:supabase-runtime-approval-package` |
| GATE-B execution runbook | Prepared | `npm.cmd run qc:supabase-runtime-gate-b-runbook` |
| Runtime smoke API matrix | Prepared | `npm.cmd run qc:supabase-runtime-smoke-api-matrix` |
| Runtime smoke auth/session boundary | Prepared | `npm.cmd run qc:supabase-runtime-smoke-auth-session-boundary` |
| GATE-B local pre-approval suite | Prepared | `npm.cmd run qc:supabase-runtime-gate-b-local-suite` |
| GATE-B local pre-approval suite report | Prepared | `npm.cmd run qc:supabase-runtime-gate-b-local-suite-report` |
| Runtime smoke report template | Prepared | `npm.cmd run qc:supabase-runtime-smoke-report-template` |
| Runtime smoke execution report | Passed / app API write, readback, cleanup, and rollback proof captured | `npm.cmd run qc:supabase-runtime-smoke-report` |
| GATE-B staging QA/QC validation | Passed / QA plan and QC read-only verification captured for `AI_PDM_STAGING` | `node scripts/qc-supabase-gate-b-staging-validation.mjs` |
| Static local readiness gate | Prepared | `npm.cmd run qc:supabase-runtime-local-readiness` |
| Runtime smoke preflight | Ready in local approved env; zero blockers/hazards | `npm.cmd run qc:supabase-runtime-smoke-preflight` |
| Current Supabase change impact audit | Prepared | `npm.cmd run qc:supabase-current-change-impact` |
| Target identity receipt template and user-provided receipt | Prepared / recorded; live guard, target table inventory, schema/RLS compare, permission seed repair, rule seed repair, app smoke, cleanup, and rollback passed for `AI_PDM_STAGING` | `npm.cmd run qc:supabase-target-identity-receipt` |
| Migration history policy | Accepted for staging exception; MCP `list_migrations` captured one migration `20260615040619_harden_set_updated_at_search_path`; local Supabase CLI absent | `npm.cmd run qc:supabase-migration-history-policy` |
| Runtime rollback readiness plan | Passed after stopping Postgres-mode local process; `PDM_DB_PROVIDER=<unset>` and `PDM_POSTGRES_URL=<missing>` | `npm.cmd run qc:supabase-runtime-rollback-readiness` |
| Data parity policy | Prepared | `npm.cmd run qc:supabase-data-parity-policy` |

Controlled evidence notes:

- Rollback readiness prepared; after the successful app smoke and cleanup, `qc:supabase-runtime-rollback-readiness` passed in SQLite/unset mode and remains the controlled rollback evidence check.

Linked evidence:

- [.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md)
- [.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md)
- [.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md)
- [.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md)
- [.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md)
- [.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md)
- [.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md)
- [.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md)
- [.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md)
- [.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md)
- [.ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md)
- [.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md](C:/VIBE%20CODING/AI_PDM/.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md)
- [supabase/README.md](C:/VIBE%20CODING/AI_PDM/supabase/README.md)
- [supabase/migrations/manifest.json](C:/VIBE%20CODING/AI_PDM/supabase/migrations/manifest.json)

## 6. Stop Conditions

Do not perform any of the following outside the approved `AI_PDM_STAGING`-only GATE-B smoke scope:

- Supabase connector project or branch operations.
- Provider pointer changes.
- Production target setup or production cutover.
- Cost-incurring actions.
- Production runtime smoke.
- `supabase migration repair`.
- Full data parity execution.
- Direct DB edits to bypass app permissions.
- Writing secrets, connection strings, project refs, target URLs, passwords, service role keys, or token values into repository files.

Allowed next work:

- PM-approved data parity planning only.
- Local document cleanup.
- Static source scan.
- Local QC that does not mutate Supabase data.

## 7. Verification Contract

Primary verification:

- `npm.cmd run qc:supabase-runtime-gate-b-local-suite`
- `npm.cmd run qc:supabase-runtime-smoke-report`
- `node scripts/qc-supabase-gate-b-staging-validation.mjs`
- `npm.cmd run qc:supabase-target-identity-receipt`
- `npm.cmd run qc:supabase-runtime-local-readiness`
- `npm.cmd run qc:supabase-runtime-gate-plan`
- `npm.cmd run qc:dev-task-evidence-sync`
- `rg -n "@/lib/db" src/app/api --glob route.ts`

Expected results:

- Direct route scan has no output.
- Runtime smoke preflight reports `ready` with zero blockers/hazards in the approved local env.
- Target identity receipt records `AI_PDM_STAGING` and no production/cutover approval.
- Runtime smoke report records staging app API write/readback/cleanup smoke passed, cleanup proof captured, and production/cutover remain unapproved.
- GATE-B staging QA/QC validation records `AI_PDM_STAGING` read-only connector evidence, seed state, permission state, cleanup proof, and no production/cutover approval.
- Secret boundary checks do not expose live credentials.

## 8. Update Rules

- Keep only one active objective unless PM explicitly changes the active DEV scope.
- Do not mark partial work as Done; Done requires implementation evidence and QC evidence.
- Approval alone does not close GATE-B; passing status requires execution evidence, cleanup proof, and rollback proof.
- Production remains deferred until staging GATE-B passes and PM explicitly approves production scope.

## 9. Latest Update

- 2026-06-24: Implemented `DEV-PDM-CHANGE-CONTROL-001` Phase 1 local foundation. Added SQLite schema tables for part-number drafts, events, replacement links, FFF assessments, review confirmation events, and BOM reconfirmation flags; added change-control domain service for draft reservation/update/void/recycle/submit, controlled-boundary reason detection, event retention, and optimistic-lock conflict handling; added focused QC script `scripts/qc-pdm-change-control.mjs` and package script `qc:pdm-change-control`. Verification passed: `npm.cmd run qc:pdm-change-control` 23/23, `npx.cmd tsc --noEmit --pretty false`, and focused ESLint. Phase 2-5 UI/API/review/BOM release transaction and production/Supabase migration/cutover remain unimplemented and approval-gated.
- 2026-06-24: Prepared `DEV-PDM-CHANGE-CONTROL-001` governance package after RD主管 debt review. Added ADR for reserved draft number vs controlled part-number recycle policy, amended numbering spec with the controlled exception to the non-reuse rule, added implementation contract for draft model / controlled-boundary service / action APIs / permissions / optimistic locking / atomic confirmed-impact release, and linked QA validation plan in `documentation_map.md`. This package remains Prepared / Blocked and must not be treated as implemented until PM/user authorizes RD Phase 1.
- 2026-06-17: Recorded user-provided `AI_PDM_STAGING` target identity: project ref `qerabudthnnpqvybpcsq`, organization `Jenfu Machinery` / `ydxbtstvlunmpjdlrhml`, region `ap-northeast-1`, Postgres major version `17`, and user confirmation that target is not production, `ProJED`, or `ProJED_TEST`.
- 2026-06-17: Recorded smoke data owner `Jed`, cleanup owner `Jed`, and cleanup criteria: delete or obsolete all `AI_PDM_GB_SMOKE_*` test records after GATE-B smoke completes.
- 2026-06-17: Preflight returned `ready`; target guard compare passed with `safe=true`, mode `ai_pdm_shadow_schema`, expected/public table count `64/64`, no missing or unknown tables.
- 2026-06-17: Schema/RLS compare passed with `sqliteTables=64`, `postgresTables=64`, `missingInPostgres=[]`, `rlsMissingTables=[]`, `mismatches=[]`.
- 2026-06-17: `qc:db-provider-postgres` passed 9/9 including live probe; `qc:supabase-secret-boundary` passed 15/15.
- 2026-06-17: Supabase CLI is not installed locally, so target-linked migration evidence was captured through Supabase MCP `list_migrations`; observed migration list contains `20260615040619_harden_set_updated_at_search_path`. No migration repair was run.
- 2026-06-17: Started a fresh Postgres-mode local app process on `127.0.0.1:3000`; app auth login succeeded with demo Admin, `/api/auth/me` returned role `Admin`, then `/api/numbering/admin/matrix` returned HTTP 403 `Insufficient role permission`. Smoke stopped before duplicate-check or numbering record creation.
- 2026-06-17: PM approved only `AI_PDM_STAGING` GATE-B permission seed repair. Supabase MCP DML seed repair upserted 6 built-in roles, 86 `system_admin` / `pdm_admin` role permissions, and one active role priority version. Verification query confirmed required Admin smoke permissions `settings.admin_matrix`, `numbering.duplicate_check`, `numbering.create`, `numbering.search`, and `numbering.draft.obsolete` are allowed for `system_admin` and `pdm_admin`.
- 2026-06-17: Re-ran app API smoke after permission repair. Admin login and `/api/auth/me` passed; `/api/numbering/admin/matrix`, `/api/numbering/rule-simulator`, and `/api/numbering/duplicate-check` returned HTTP 200. `/api/numbering/records` returned HTTP 400 because `part_roots.rule_version_id` references missing `numbering-rule-v1`; direct verification confirmed `numbering_rule_versions=0` and no `AI_PDM_GB_SMOKE_*` root/part/drawing records exist.
- 2026-06-17: PM approved only `AI_PDM_STAGING` minimal `numbering-rule-v1` data seed repair. Supabase MCP DML upserted `numbering_rule_versions.id='numbering-rule-v1'` with active `PDM-NUMBERING-V1` metadata; independent query confirmed `numbering_rule_versions=1`.
- 2026-06-17: Re-ran full app API smoke after rule seed repair. Admin login, `/api/auth/me`, `/api/numbering/admin/matrix`, `/api/numbering/rule-simulator`, `/api/numbering/duplicate-check`, `/api/numbering/records`, `/api/numbering/roots/0001`, `/api/numbering/records/0001/obsolete`, and logout all passed. Smoke data `AI_PDM_GB_SMOKE_202606170939_JED`, root `0001`, part `P-0001-001` was obsoleted through app API; direct verification confirmed active smoke roots `0` and active smoke parts `0`. Postgres-mode process was stopped, port 3000 released, `qc:supabase-runtime-rollback-readiness` passed 10/10, `qc:supabase-secret-boundary` passed 15/15, and `qc:db-provider-contract` passed 35/35. Production and cutover remain untouched.
- 2026-06-17: Postgres-mode process was stopped and port 3000 was released. Rollback/local verification passed: `qc:supabase-runtime-rollback-readiness` 10/10, `qc:db-provider-contract` 35/35, and `qc:supabase-secret-boundary` 15/15. Production and cutover remain untouched.
- 2026-06-18: QA created `AI_PDM_STAGING`-only GATE-B staging validation plan and QC executed read-only staging verification. Supabase connector project metadata confirmed `AI_PDM_STAGING` ref `qerabudthnnpqvybpcsq`, region `ap-northeast-1`, status `ACTIVE_HEALTHY`, Postgres engine `17`. Read-only seed/cleanup checks confirmed active `numbering-rule-v1=1`, active smoke roots/parts/drawings `0/0/0`, obsoleted smoke root/part proof `1/1`, and required Admin smoke permissions present for `system_admin` and `pdm_admin`. QA/QC staging validation passed for `AI_PDM_STAGING`; production and cutover remain explicitly unapproved.
- 2026-06-18: Added planned Backlog delivery point `DEV-SW-LICENSE-PDM-001` for SW license / PDM company separation. User-approved planning decisions: full `.ai-doc` development package, `operational_shared` strategy, and v1 scope limited to PDM company isolation, user company permissions, and Admin target-company selection. This is not part of the current Supabase active lane.
- 2026-06-18: PM-dev execution started for `DEV-SW-LICENSE-PDM-001` after user approval. Backend slice delivered: `companies` / `user_company_memberships`, `users.company_id`, `items.company_id`, `submissions.company_id`, company-scoped uniqueness for items and submissions, auth payload `default_company` / `companies`, submission list/create and metadata detect company context validation, dashboard metric company filter, and `scripts/qc-sw-license-pdm-company-scope.mjs`. Verification passed: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd run qc:sw-license-pdm-company-scope`.
- 2026-06-18: Continued `DEV-SW-LICENSE-PDM-001` Phase 4 / read-scope slice. Web upload now loads `/api/auth/me`, exposes PDM company selection, and sends `pdm_company_code` to metadata detection and submission. SolidWorks Add-in token DTO maps `default_company` / `companies`, submission window exposes `CmbPdmCompany`, multipart submission and checkout preflight carry `pdm_company_code`, and settings persist only selected PDM company code, not any SW license key. `/api/submissions/preflight-lock` and `/api/search` now validate company context and apply company scope. Added `scripts/qc-sw-addin-company-selection.mjs`; updated SW Add-in source QC for async/company-scoped preflight. Verification passed: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run qc:sw-license-pdm-company-scope`, `npm.cmd run qc:sw-addin-company-selection`, `npm.cmd run qc:sw-addin-source`, and `npm.cmd run sw-addin:build`.
- 2026-06-18: Continued `DEV-SW-LICENSE-PDM-001` direct read-path company permission slice. Added company-aware async permission helpers for submission and BOM reads, then applied them to submission detail, file response/download, release package download, BOM detail/export/diff, BOM workbench/draft/release export, approval/rejection, retry upload, collaboration/share/sandbox/issue/discussion routes, procurement sync, and related direct-ID routes. Updated `scripts/qc-sw-license-pdm-company-scope.mjs` to assert high-risk direct read routes use company-aware permission checks. Verification passed: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run qc:sw-license-pdm-company-scope`, and `npm.cmd run qc:sw-addin-company-selection`.
- 2026-06-18: Continued `DEV-SW-LICENSE-PDM-001` numbering company-scope slice. Added `company_id` and company-scoped uniqueness to numbering sequences, part roots, part numbers, and drawing numbers; added runtime SQLite migration/backfill for existing numbering tables; added company-aware async numbering selectors and company-scoped sequence keys; wired core numbering APIs (`records`, `duplicate-check`, `search`, `roots/[rootCode]`, draft update/obsolete, drawings list, parts list) to resolve and return PDM company context. Added `scripts/qc-sw-license-pdm-numbering-company-scope.mjs` and package script `qc:sw-license-pdm-numbering-company-scope`. Verification passed: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run qc:sw-license-pdm-numbering-company-scope`, `npm.cmd run qc:sw-license-pdm-company-scope`, and `npm.cmd run qc:sw-addin-company-selection`.
- 2026-06-18: Continued `DEV-SW-LICENSE-PDM-001` metadata adapter profile slice. Added server-side `resolveMetadataAdapterProfile` / `serializeMetadataAdapterProfile`, using selected `pdm_company` to choose company-specific extractor env keys (`PDM_METADATA_EXTRACTOR_<COMPANY>_*`, `PDM_CAD_REFERENCE_EXTRACTOR_<COMPANY>_*`) with legacy global fallback and filename-hints fallback. `/api/file-metadata/detect` now returns only redacted adapter profile status and never returns runtime command/args values. Updated native metadata/reference extraction to consume the selected profile. Removed migration-sensitive submission company indexes from static `db/schema.sql` and kept them in runtime `ensureSubmissionIndexes`, fixing production `next start` login failure on old SQLite DBs without `company_id`. Added `scripts/qc-sw-license-pdm-metadata-adapter-profile.mjs` and package script `qc:sw-license-pdm-metadata-adapter-profile`. Verification passed: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run qc:sw-license-pdm-metadata-adapter-profile`, `npm.cmd run qc:sw-license-pdm-company-scope`, `npm.cmd run qc:sw-license-pdm-numbering-company-scope`, `npm.cmd run qc:sw-addin-company-selection`, and `npm.cmd run qc:native-cad-extractor-contract`.
- 2026-06-18: Continued `DEV-SW-LICENSE-PDM-001` numbering workflow/detail company-scope slice. Added runtime/static `company_id` for `approval_requests`, `approval_batches`, `import_batches`, `numbering_export_jobs`, and `monthly_audit_reports`; approval request/batch decision/resubmit paths reject cross-company mismatches; DVT promotion, main drawing impact, import staging/confirm, export payload, monthly audit report list/create/detail, and part detail/variant/cost routes now resolve selected PDM company and pass `companyId` into repository selectors. Extended `scripts/qc-sw-license-pdm-numbering-company-scope.mjs` to guard workflow tables, workflow routes, part routes, DVT/export selectors, and part-detail company filtering. Verification passed: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run qc:sw-license-pdm-company-scope`, `npm.cmd run qc:sw-license-pdm-numbering-company-scope`, `npm.cmd run qc:sw-license-pdm-metadata-adapter-profile`, `npm.cmd run qc:sw-addin-company-selection`, and `npm.cmd run qc:native-cad-extractor-contract`. Build still reports the pre-existing Turbopack NFT tracing warning from `next.config.mjs` / chat route.
- 2026-06-18: Completed `DEV-SW-LICENSE-PDM-001` numbering task/notification company persistence follow-up. Added runtime/static `company_id` for `numbering_task_items` and `numbering_notifications`; task/notification insert, list, direct update, read/handled routes, overdue-draft generated tasks, approval-request generated tasks, and monthly audit task/project counts now use selected company context. Extended `qc:sw-license-pdm-numbering-company-scope` to guard task/notification tables, insert SQL, direct-ID update SQL, and task/notification routes. Verification passed: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run qc:sw-license-pdm-numbering-company-scope`, `npm.cmd run qc:sw-license-pdm-company-scope`, `npm.cmd run qc:sw-license-pdm-metadata-adapter-profile`, `npm.cmd run qc:sw-addin-company-selection`, and `npm.cmd run qc:native-cad-extractor-contract`. One native CAD QC run failed during an intentional parallel build race because `prebuild` removed `.next`; the immediate standalone rerun passed 14/14.
- 2026-06-18: PM-dev commit boundary check found the index already contains unrelated Supabase GATE-B staged files (`.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md`, `.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md`, `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`, `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`, and `scripts/qc-supabase-*`). Therefore no `DEV-SW-LICENSE-PDM-001` commit was created in this pass; committing now would mix unrelated Supabase staging evidence with SW/PDM company-scope code.
- 2026-06-18: Added PM Git boundary handoff and `scripts/qc-sw-license-pdm-git-boundary.mjs`; `npm.cmd run qc:sw-license-pdm-git-boundary` passed and detected 9 unrelated Supabase staged files. This converts the deferred commit boundary into repeatable QC evidence while keeping `DEV-SW-LICENSE-PDM-001` uncommitted until index cleanup or explicit PM grouping approval.
- 2026-06-18: Enhanced `qc:sw-license-pdm-git-boundary` with a temporary clean-index simulation. The check passed with 16 clean-index candidate files and no Supabase staged-file leakage, proving a scoped candidate group can be formed after index cleanup while the current real index still prevents a safe direct commit.
- 2026-06-19: User authorized handling current Supabase staged files, rebuilding the index, and creating a partial commit in the existing dirty worktree. Committed Supabase staging evidence separately as `be333eb` (`DEV-SUPABASE-DB-001 record staging gate B evidence`), then committed the scoped `DEV-SW-LICENSE-PDM-001` SW/PDM company boundary group as `6f4dbab` (`DEV-SW-LICENSE-PDM-001 add company-scoped PDM boundary`). Verification passed before SW/PDM commit: `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run qc:sw-license-pdm-company-scope`, `npm.cmd run qc:sw-license-pdm-numbering-company-scope`, `npm.cmd run qc:sw-license-pdm-metadata-adapter-profile`, `npm.cmd run qc:sw-addin-company-selection`, and `npm.cmd run qc:sw-license-pdm-git-boundary`. Build still reports the existing Turbopack NFT tracing warning from `next.config.mjs` / chat route.
