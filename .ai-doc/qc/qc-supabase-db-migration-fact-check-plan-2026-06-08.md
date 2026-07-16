# QC Supabase DB Migration Fact-Check Plan - 2026-06-08

關聯任務：`DEV-SUPABASE-DB-001`  
QC 目標：用可重跑的命令、target identity、migration trace、RLS evidence、advisor evidence 與 smoke evidence 驗證 Supabase DB runtime 遷移，不接受口頭宣稱。

## Current Fact Baseline

已確認：

- 2026-06-08 已完成本機 `data` reset。
- `data/quality/defect-register.json` 的 tracked deletion 是使用者要求的清理範圍。
- 本機重新建立乾淨 `data/ai-pdm.sqlite`。
- 舊 `submission_files`、`release_packages`、`file_assets` 不列入遷移。
- `supabase/migrations` mirror 已建立。
- Supabase CLI 尚未安裝，因此正式 CLI migration history 尚未完成。
- Target identity guard 已強化，會阻擋已知 `ProJED` / `ProJED_TEST` project ref 或 `PDM_SUPABASE_TARGET_NAME`。

## Evidence Rules

QC 不接受：

- 沒有 target identity 的 migration apply 證據。
- 沒有 SHA-256 trace 的 migration 證據。
- 把 `ProJED` 或 `ProJED_TEST` 當作 staging/prod。
- 沒有 advisor output 的 production cutover 宣稱。
- 沒有 secret boundary scan 的 production release。
- 沒有 production smoke write/read evidence 的完成宣稱。

## QC Gates

| Gate | Priority | Required evidence | Pass rule |
|---|---|---|---|
| QC-SUPA-001 target identity | P0 | Supabase project metadata and target guard output. | Target is `AI_PDM_STAGING` or `AI_PDM_PROD`, not existing project. |
| QC-SUPA-002 migration trace | P0 | Compare report with SHA-256 for source schema, migration, and RLS plan. | Hashes match committed files. |
| QC-SUPA-003 RLS posture | P0 | SQL inspection or advisor evidence. | Every public table has RLS enabled and forced. |
| QC-SUPA-004 direct access denied | P0 | Grant/policy inspection. | `anon` and `authenticated` cannot direct-select/update base tables. |
| QC-SUPA-005 provider parity | P0 | SQLite and Postgres provider QC outputs. | Both providers pass the same contract. |
| QC-SUPA-005A async provider boundary | P0 | Static/type QC for provider-neutral async contract. | Async client exists, SQLite adapter exists, Postgres provider fails closed until real implementation. |
| QC-SUPA-005B Postgres adapter local gate | P0 | Static/type QC and optional live probe. | Postgres adapter exists and uses unnamed queries; live probe must be marked skipped unless `PDM_POSTGRES_URL` is configured. |
| QC-SUPA-005C repository async pilot | P0 | Repository source and semantic SQL QC. | Pilot repository avoids sync DB boundary and proves portable settings upsert/read semantics. |
| QC-SUPA-005D access-control async pilot | P0 | Repository source and semantic SQL QC. | Access-control repository avoids sync DB boundary and proves portable role/permission read and upsert semantics. |
| QC-SUPA-005E permission API async read path | P0 | Route source, service source, role matrix regression, and sidebar regression. | Permission API uses async service and role changes still affect API, backend guard, and sidebar visibility. |
| QC-SUPA-005F async guard read-only route migration | P0 | Guard source, read-only route sources, and TypeScript output. | Async page/action guard helpers exist, sync guard is still available, and the first batch of read-only routes uses async page guard. |
| QC-SUPA-005G async auth/session user lookup | P0 | User repository source, auth async source, guard source, and semantic SQL QC. | Async permission guard resolves session users through async user repository rather than sync `requireAuth`. |
| QC-SUPA-005H async login/token user lookup | P0 | Login route source, token route source, async auth source, and managed auth regression. | Login and token routes use async password lookup while session cookie and bearer token behavior remain valid. |
| QC-SUPA-005I async auth audit write | P0 | Audit repository source, auth route source, semantic SQL QC, and managed auth audit rows. | Login and token routes write Login audit rows through async audit repository; token audit keeps client marker. |
| QC-SUPA-006 API regression | P0 | Postgres-mode API QC output. | Main workflows pass without SQLite fallback. |
| QC-SUPA-007 secret boundary | P0 | Static/bundle scan output. | No server DB secret reaches frontend. |
| QC-SUPA-008 advisor closure | P0 | Supabase security/performance advisor output. | No unresolved blocker-level finding. |
| QC-SUPA-009 production smoke | P0 | Timestamped smoke report. | Production flow writes to Supabase and can be read back. |
| QC-SUPA-010 rollback drill | P1 | Staging rollback drill note. | Env rollback and backup path are documented and tested in staging. |

## Existing QC Commands

```powershell
npm.cmd run db:postgres:guard -- --phase pre-migration
npm.cmd run supabase:migrations:sync
npm.cmd run qc:supabase-runtime-migrations
npm.cmd run db:postgres:compare -- --require-postgres
npm.cmd run qc:postgres-shadow-target-guard
npm.cmd run qc:postgres-shadow
npm.cmd run lint
npm.cmd run qc:db-provider-contract
npm.cmd run qc:db-provider-async-contract
npm.cmd run qc:db-provider-postgres
npm.cmd run qc:system-settings-async-repository
npm.cmd run qc:access-control-async-repository
npm.cmd run qc:pdm-numbering-cross-role-permission
npm.cmd run qc:pdm-numbering-permission-guard-ui
npx.cmd tsc --noEmit
npm.cmd run build
```

## Expected New QC Commands

```powershell
npm.cmd run qc:db-provider-postgres
npm.cmd run qc:api:postgres
npm.cmd run qc:supabase-secret-boundary
```

## Required Reports

RD must provide:

- Migration apply evidence.
- Provider implementation summary.
- Staging cutover evidence.
- Production cutover evidence.

QA must provide:

- Validation matrix result.
- Failed case reproduction steps.
- Advisor and RLS review summary.

QC must provide:

- Fact-check result.
- Commands executed.
- Supabase target identities.
- Remaining risk list.

## Completion Rule

`DEV-SUPABASE-DB-001` can only move to `[x]` after:

- Staging and production targets are verified.
- Postgres runtime is active in production.
- SQLite fallback remains operational.
- Storage follow-up is explicitly tracked and not confused with DB completion.

## 2026-06-08 QC Evidence

- `npm.cmd run qc:supabase-runtime-migrations`：17/17 passed。
- `npm.cmd run db:postgres:compare -- --no-write`：64 SQLite tables / 64 Postgres tables，0 missing table，0 RLS missing。
- `npm.cmd run qc:postgres-shadow-target-guard`：11/11 passed。
- `npm.cmd run qc:postgres-shadow`：22/22 passed。
- `npm.cmd run qc:db-provider-contract`：27/27 passed；涵蓋 async provider contract、SQLite adapter、Postgres fail-closed、SQLite awaited transaction callback fail-closed。
- `npm.cmd run qc:db-provider-contract`：31/31 passed；涵蓋 Postgres async adapter、unnamed query、transaction boundary、nested transaction fail-closed。
- `npm.cmd run qc:db-provider-postgres`：8/8 passed；live probe skipped without `PDM_POSTGRES_URL`。
- `npm.cmd run qc:system-settings-async-repository`：11/11 passed；in-memory SQLite semantic SQL checks passed。
- `npm.cmd run qc:access-control-async-repository`：37/37 passed；async permission route/service 接線、async guard helper、5 個 read-only route 接線、async user repository、async auth/session user lookup、login/token async password lookup、async audit insert、roles/users/role_permissions provider-neutral SQL 與 in-memory SQLite semantic checks passed。
- `npm.cmd run qc:pdm-numbering-core`：238/238 passed；numbering core static/semantic checks passed。
- `npm.cmd run qc:managed-auth`：11/11 passed；managed auth login/settings, bearer token regression, and Login audit row checks passed。
- `npm.cmd run qc:pdm-numbering-cross-role-permission`：45/45 passed；custom role priority、assignment、delegation、permission API 與 backend guard parity passed。
- `npm.cmd run qc:pdm-numbering-permission-guard-ui`：35/35 passed；permission API enable/disable、sidebar visibility 與 backend 403 guard passed。
- `npx.cmd tsc --noEmit`：passed。
- `npm.cmd run lint`：passed。
- `npm.cmd run build`：passed；既有 Turbopack NFT tracing warning 仍需後續獨立處理。

## 2026-06-08 Phase 3H QC Addendum

- Fact checked slice: async auth user write pilot.
- Evidence files: `src/lib/auth-config.ts`, `src/lib/repositories/user-async-repository.ts`, `src/lib/auth-async.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/token/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 42/42, `npm.cmd run qc:managed-auth` passed 11/11, and `npx.cmd tsc --noEmit` passed.
- Residual risk: this is still local SQLite/contract evidence; Supabase staging/prod, advisor review, RLS review, Postgres-mode API regression, and rollback evidence remain open.

## 2026-06-08 Phase 3I QC Addendum

- Fact checked slice: `/api/settings` async runtime wiring.
- Evidence files: `src/lib/system-settings-async.ts`, `src/lib/auth-async.ts`, `src/app/api/settings/route.ts`, and `scripts/qc-system-settings-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:system-settings-async-repository` passed 15/15, `npm.cmd run qc:managed-auth` passed 11/11, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run qc:api` passed 391/391 with a temporary local dev server, `npx.cmd tsc --noEmit` passed, `npm.cmd run lint -- --quiet` passed, and `npm.cmd run build` passed with the existing Turbopack NFT warning.
- Residual risk: this is still local SQLite/contract/UI-flow evidence; Supabase staging/prod, advisor review, RLS review, Postgres-mode API regression, and rollback evidence remain open.

## 2026-06-08 Phase 3J QC Addendum

- Fact checked slice: async runtime provider selector.
- Evidence files: `src/lib/db-async-provider.ts`, `src/lib/auth-async.ts`, `src/lib/audit-async.ts`, `src/lib/numbering-permission-async.ts`, `src/lib/system-settings-async.ts`, `.env.example`, `scripts/qc-db-provider-contract-test.mjs`, `scripts/qc-db-provider-postgres.mjs`, `scripts/qc-access-control-async-repository.mjs`, and `scripts/qc-system-settings-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:db-provider-contract` passed 35/35, `npm.cmd run qc:db-provider-postgres` passed 9/9 with live probe skipped because `PDM_POSTGRES_URL` is not configured, `npm.cmd run qc:access-control-async-repository` passed 42/42, `npm.cmd run qc:system-settings-async-repository` passed 15/15, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 11/11, `npm.cmd run qc:pdm-numbering-core` passed 238/238, `npm.cmd run lint -- --quiet` passed, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Residual risk: live Supabase target evidence is still missing; Postgres-mode API regression, Supabase advisors/RLS review, production cutover, and rollback evidence remain open.

## 2026-06-08 Phase 3K QC Addendum

- Fact checked slice: auth session route async migration.
- Evidence files: `src/app/api/auth/me/route.ts`, `src/app/api/auth/logout/route.ts`, `scripts/qc-managed-auth-test.mjs`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 44/44, `npm.cmd run qc:managed-auth` passed 18/18, `npx.cmd tsc --noEmit` passed, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Residual risk: live Supabase target evidence is still missing; Postgres-mode API regression, Supabase advisors/RLS review, production cutover, and rollback evidence remain open.

## 2026-06-08 Phase 3L QC Addendum

- Fact checked slice: settings Google Drive admin route async guard migration.
- Evidence files: `src/app/api/settings/gdrive/folders/route.ts`, `src/app/api/settings/gdrive/folders/verify/route.ts`, `scripts/qc-system-settings-async-repository.mjs`, and `scripts/qc-gdrive-folder-tree-settings.mjs`.
- Command evidence: `npm.cmd run qc:system-settings-async-repository` passed 16/16, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run qc:gdrive-folder-tree-settings` passed 35/35, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Residual risk: live Supabase target evidence is still missing; Postgres-mode API regression, Supabase advisors/RLS review, production cutover, and rollback evidence remain open.

## 2026-06-08 Phase 3M QC Addendum

- Fact checked slice: file metadata detect route async role guard migration.
- Evidence files: `src/app/api/file-metadata/detect/route.ts` and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 45/45, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `META-001` through `META-004` verified `/api/file-metadata/detect` still accepts an authenticated Engineer request and returns native CAD metadata.
- Residual risk: live Supabase target evidence is still missing; Postgres-mode API regression, Supabase advisors/RLS review, production cutover, and rollback evidence remain open.

## 2026-06-08 Phase 3N QC Addendum

- Fact checked slice: manufacturing handoff route async auth guard migration.
- Evidence files: `src/lib/auth-async.ts`, `src/app/api/handoff/route.ts`, `src/app/api/handoff/export/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 46/46, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `HANDOFF-001` through `HANDOFF-011` verified unauthenticated 401, authenticated manager 200, handoff payload fields, and CSV export content.
- Residual risk: live Supabase target evidence is still missing; Postgres-mode API regression, Supabase advisors/RLS review, production cutover, and rollback evidence remain open.

## 2026-06-08 Phase 3O QC Addendum

- Fact checked slice: search and notifications read-only route async auth guard migration.
- Evidence files: `src/app/api/search/route.ts`, `src/app/api/notifications/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 47/47, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `AUTH-013`, `SEARCH-001` through `SEARCH-003`, and `NOTIFY-001` through `NOTIFY-009` verified unauthenticated blocking, authenticated reads, notification summary behavior, and engineer scope isolation.
- Residual risk: live Supabase target evidence is still missing; Postgres-mode API regression, Supabase advisors/RLS review, production cutover, and rollback evidence remain open.

## 2026-06-08 Phase 3Q QC Addendum

- Fact checked slice: item revision history and where-used read-only route async auth guard migration.
- Evidence files: `src/app/api/items/[partNumber]/revisions/route.ts`, `src/app/api/items/[partNumber]/where-used/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 48/48, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `HIST-001` through `HIST-006` and `WHEREUSED-001` through `WHEREUSED-011` verified unauthenticated blocking, manager visibility, engineer scope isolation, quantity preservation, and empty where-used behavior.
- Residual risk: live Supabase target evidence is still missing; these routes still use the existing sync DB query functions after the async auth guard, so repository async migration remains open.

## 2026-06-08 Phase 3R QC Addendum

- Fact checked slice: procurement releases integration read-only route async role guard migration.
- Evidence files: `src/app/api/integrations/procurement/releases/route.ts` and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 49/49, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `PROCAPI-001` through `PROCAPI-008` verified unauthenticated blocking, Engineer 403, Manager 200, package/file/BOM payload shape, redaction, partNumber filter, and future since filter.
- Residual risk: live Supabase target evidence is still missing; this route still uses the existing sync manufacturing handoff query after the async role guard, so repository async migration remains open.

## 2026-06-08 Phase 3S QC Addendum

- Fact checked slice: numbering permissions matrix route async auth guard hardening.
- Evidence files: `src/app/api/numbering/permissions/route.ts` and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 49/49, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:pdm-numbering-permission-guard-ui` passed 35/35, `npm.cmd run qc:pdm-numbering-cross-role-permission` passed 45/45, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:pdm-numbering-permission-guard-ui` verified permission API reads, matrix enable/disable behavior, sidebar visibility, and backend 403 parity; `qc:pdm-numbering-cross-role-permission` verified Admin/R&D Manager/custom role/delegation/revocation behavior through the same permission API.
- Residual risk: live Supabase target evidence is still missing; broader sync route/repository migration remains open even though this permission matrix read path now uses async auth and async permission service wiring.

## 2026-06-08 Phase 3T QC Addendum

- Fact checked slice: procurement sync-runs route async role guard migration.
- Evidence files: `src/app/api/integrations/procurement/sync-runs/route.ts`, `src/app/api/integrations/procurement/sync-runs/[runId]/route.ts`, `src/lib/auth-async.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 50/50, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `ERPSYNC-001` through `ERPSYNC-012` verified unauthenticated blocking, Engineer 403, pending submission 409, Manager create/list/acknowledge, package payload, external reference preservation, and duplicate acknowledgement 409.
- Residual risk: live Supabase target evidence is still missing; these routes still use the existing sync procurement DB functions after the async role guard, so repository async migration remains open.

## 2026-06-08 Phase 3U QC Addendum

- Fact checked slice: chat route async auth guard migration.
- Evidence files: `src/app/api/chat/route.ts`, `src/lib/auth-async.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 51/51, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and a warmed `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `AUTH-012` and `AI-009` through `AI-021` verified unauthenticated blocking, conversation creation, message append, source payloads, continuation, cross-user 403, whitelisted/non-whitelisted tool handling, and policy RAG behavior.
- QC correction: repeated API runs showed the PDF preview 404 was not transient. Phase 3AC replaced the file delivery routes with `src/app/api/submissions/[id]/files/[...filePath]/route.ts`; redirected `qc:api` then passed 391/391, including `FILE-003` through `FILE-005`.
- Residual risk: live Supabase target evidence is still missing; this route still uses existing sync LLM conversation DB functions after the async auth guard, so repository async migration remains open.

## 2026-06-08 Phase 3V QC Addendum

- Fact checked slice: submission file download and PDF preview route async auth guard migration.
- Evidence files: `src/app/api/submissions/[id]/files/[...filePath]/route.ts` and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 52/52, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `AUTH-003` and `FILE-001` through `FILE-005` verified unauthenticated blocking, authenticated file download, attachment disposition, PDF preview, `application/pdf` content type, and inline disposition.
- Residual risk: live Supabase target evidence is still missing; these routes still use the existing sync stored-file read path after the async auth guard, so repository/storage async migration remains open.

## 2026-06-08 Phase 3W QC Addendum

- Fact checked slice: submission discussions and review issues route async auth guard migration.
- Evidence files: `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/discussions/[commentId]/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, `src/app/api/submissions/[id]/issues/[issueId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 53/53, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `DISCUSS-001` through `DISCUSS-014` and `ISSUE-001` through `ISSUE-013` verified unauthenticated blocking, create/list/resolve behavior, file metadata exposure, cross-submission validation, manager visibility, and engineer scope isolation.
- Residual risk: live Supabase target evidence is still missing; these routes still use existing sync discussion/issue DB functions after the async auth guard, so repository async migration remains open.

## 2026-06-08 Phase 3X QC Addendum

- Fact checked slice: submission change request route async auth and role guard migration.
- Evidence files: `src/app/api/submissions/[id]/changes/route.ts`, `src/app/api/submissions/[id]/changes/[changeId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 54/54, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHANGE-001` through `CHANGE-017` verified unauthenticated blocking, validation, ECR/ECO/ECN create/list behavior, role denial, manager approval, decision metadata, duplicate-decision conflict, and engineer scope isolation.
- Residual risk: live Supabase target evidence is still missing; these routes still use existing sync change request DB functions after the async auth/role guard, so repository async migration remains open.

## 2026-06-08 Phase 3Y QC Addendum

- Fact checked slice: submission phase gate route async auth and role guard migration.
- Evidence files: `src/app/api/submissions/[id]/phase-gates/route.ts`, `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 55/55, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `PHASE-001` through `PHASE-013` verified unauthenticated blocking, role denial, initialization, summary counts, approval blocking, phase decisions, ready summary, duplicate-decision conflict, and release flow.
- Residual risk: live Supabase target evidence is still missing; these routes still use existing sync phase gate DB functions after the async auth/role guard, so repository async migration remains open.

## 2026-06-08 Phase 3Z QC Addendum

- Fact checked slice: submission approval matrix route async auth and role guard migration.
- Evidence files: `src/app/api/submissions/[id]/approval-matrix/route.ts`, `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 56/56, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning after a clean rerun, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `MATRIX-001` through `MATRIX-015` verified unauthenticated blocking, role denial, matrix initialization, default count/open roles, Manager/Admin approval progression, release gating, Admin waiver, and manager-only release after waiver.
- Residual risk: live Supabase target evidence is still missing; these routes still use existing sync approval matrix DB functions after the async auth/role guard, so repository async migration remains open.

## 2026-06-08 Phase 3AA QC Addendum

- Fact checked slice: submission preflight lock route async role guard migration.
- Evidence files: `src/app/api/submissions/preflight-lock/route.ts` and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 57/57, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHECKOUT-010` through `CHECKOUT-016` verified unauthenticated blocking, owner preflight behavior, active lock exposure, non-owner state, and lock owner preservation.
- Residual risk: live Supabase target evidence is still missing; this route still uses the existing sync active-lock DB function after the async role guard, so repository async migration remains open.

## 2026-06-08 Phase 3AB QC Addendum

- Fact checked slice: submission checkout route async role guard migration.
- Evidence files: `src/app/api/submissions/[id]/checkout/route.ts` and `scripts/qc-access-control-async-repository.mjs`.
- Command evidence: `npm.cmd run qc:access-control-async-repository` passed 58/58, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHECKOUT-001` through `CHECKOUT-009` verified unauthenticated blocking, role denial, acquire/reuse flow, competing lock conflict, owner exposure, and release behavior.
- Residual risk: live Supabase target evidence is still missing; this route still uses existing sync lock DB functions after the async role guard, so repository async migration remains open.

## 2026-06-08 Phase 3AC QC Addendum

- Fact checked code evidence: `src/app/api/submissions/[id]/approve/route.ts`, `src/app/api/submissions/[id]/reject/route.ts`, `src/app/api/submissions/[id]/files/[...filePath]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-015` verifies approve/reject use `requireRoleAsync(request, ["R&D Manager", "Admin"])`; `ROUTE-AUTH-ASYNC-008` verifies the catch-all file route keeps async auth, stored-file lookup, attachment mode, inline preview mode, and PDF gating.
- Runtime evidence: redirected `qc:api` passed 391/391. Relevant passed checks include `AUTH-002`, `WF-001` through `WF-010`, `PKG-001`, `FILE-003` through `FILE-005`, `PHASE-006`, `PHASE-013`, `MATRIX-011`, and `MATRIX-015`.
- QC finding: the earlier PDF preview 404 was a real route matcher/runtime issue, not transient; Phase 3AC corrected it with the catch-all file route and verified the fix.

## 2026-06-09 Phase 3AD QC Addendum

- Fact checked code evidence: `src/app/api/submissions/[id]/release-package/route.ts`, `src/app/api/submissions/[id]/shares/route.ts`, `src/app/api/submissions/[id]/shares/[shareId]/route.ts`, `src/app/api/submissions/[id]/supplier-responses/route.ts`, `src/app/api/submissions/[id]/supplier-responses/[responseId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-016` verifies release package uses `requireAuthAsync`; share and supplier response routes use `requireRoleAsync(request, ["R&D Manager", "Admin"])`; and all five routes avoid sync auth imports.
- Runtime evidence: redirected `qc:api` passed 391/391. Relevant passed checks include `PKG-003` through `PKG-008`, `SHARE-001` through `SHARE-014`, and `SUPPLIER-006` through `SUPPLIER-011`.
- QC residual risk: these routes still call existing sync domain DB helpers after async guard migration; full repository async migration and real Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AE QC Addendum

- Fact checked code evidence: `src/app/api/submissions/[id]/ai-summary/route.ts`, `src/app/api/submissions/[id]/ai-risks/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-017` verifies both AI routes use `requireAuthAsync`, preserve `buildAiSubmissionSummary`/`buildAiRiskReport`, keep `canReadSubmission` and `scopedSubmittedBy`, and avoid sync auth imports.
- Runtime evidence: redirected `qc:api` passed 391/391. Relevant passed checks include `SUMMARY-001` through `SUMMARY-012` and `RISK-001` through `RISK-011`.
- QC residual risk: these routes still call existing sync `getSubmission` and AI helper internals after async guard migration; full repository async migration and real Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AF QC Addendum

- Fact checked code evidence: `src/app/api/submissions/route.ts`, `src/app/api/submissions/[id]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-018` verifies `/api/submissions` GET uses `requireAuthAsync`, POST uses `requireRoleAsync(request, ["Engineer", "Admin"])`, `/api/submissions/[id]` GET uses `requireAuthAsync`, critical submission helper calls remain present, and sync auth imports are absent.
- Runtime evidence: redirected `qc:api` passed 391/391. Relevant coverage includes unauthenticated submissions list 401, positive submission create 201, create validation 400 cases, duplicate drawing/revision 409, Engineer list scoping, Engineer detail 403 for another engineer's submission, and Manager detail 200.
- Shadow evidence: `db:postgres:compare -- --no-write` reported 64 SQLite tables, 64 Postgres tables, no missing tables, no RLS-missing tables, and no mismatches; `qc:postgres-shadow` passed 22/22.
- QC residual risk: these routes still call existing sync submission DB/file helpers after async guard migration; full repository async migration and real Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AG QC Addendum

- Fact checked code evidence: `src/app/api/submissions/[id]/bom/route.ts`, `src/app/api/submissions/[id]/bom/diff/route.ts`, `src/app/api/submissions/[id]/bom/export/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-019` verifies all three submission BOM routes use `requireAuthAsync`, keep `canReadSubmission`/BOM helper calls, preserve export helper calls, and avoid sync auth imports.
- Runtime evidence: redirected `qc:api` passed 391/391. Relevant passed checks include `BOM-001` through `BOM-013`, `BOMEXPORT-001` through `BOMEXPORT-010`, and `BOMDIFF-001` through `BOMDIFF-013`.
- Shadow evidence: `db:postgres:compare -- --no-write` reported 64 SQLite tables, 64 Postgres tables, no missing tables, no RLS-missing tables, and no mismatches; `qc:postgres-shadow` passed 22/22.
- QC residual risk: these routes still call existing sync BOM DB helpers after async guard migration; BOM repository async migration and real Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AI QC Addendum

- Fact checked code evidence: `src/app/api/bom/workbench/route.ts`, `src/app/api/bom/drafts/from-assembly/route.ts`, `src/app/api/bom/drafts/import-xls/route.ts`, `src/app/api/bom/drafts/[draftId]/route.ts`, `src/app/api/bom/drafts/[draftId]/active/route.ts`, `src/app/api/bom/drafts/[draftId]/diff/route.ts`, `src/app/api/bom/drafts/[draftId]/submit-review/route.ts`, `src/app/api/bom/reviews/pending/route.ts`, `src/app/api/bom/reviews/[reviewId]/approve/route.ts`, `src/app/api/bom/reviews/[reviewId]/reject/route.ts`, `src/app/api/bom/releases/[releaseId]/export/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-020` verifies the 11 BOM workbench/draft/review/release routes use async guards, preserve critical BOM helper calls, remove review route-local role checks, and avoid sync auth imports.
- Runtime evidence: `qc:bom-workbench-foundation` 27/27, `qc:bom-workbench-tree-rules` 22/22, `qc:bom-workbench-release-gate-resubmit` 43/43, `qc:bom-workbench-solidworks-xls-import` 34/34, `qc:bom-workbench-release-export` 21/21, `qc:bom-workbench-review-release` 25/25, `qc:bom-workbench-released-only-permission` 31/31, and redirected `qc:api` 391/391 all passed.
- Shadow evidence: `db:postgres:compare -- --no-write` reported 64 SQLite tables, 64 Postgres tables, no missing tables, no RLS-missing tables, and no mismatches; `qc:postgres-shadow` passed 22/22.
- QC residual risk: these routes still call existing sync BOM DB helpers after async guard migration; BOM repository async migration and real Supabase Postgres-mode evidence remain open.

## 2026-06-09 Phase 3AJ QC Addendum

- Fact checked code evidence: `src/app/api/submissions/[id]/reuse-candidates/route.ts`, `src/app/api/submissions/[id]/duplicate-geometry/route.ts`, `src/app/api/submissions/[id]/retry-upload/route.ts`, `src/app/api/submissions/[id]/sandbox/route.ts`, `src/app/api/submissions/[id]/sandbox/[branchId]/route.ts`, `src/app/api/submissions/[id]/pdf-markups/route.ts`, `src/app/api/submissions/[id]/pdf-markups/[markupId]/route.ts`, `src/app/api/numbering/approval-batches/[batchId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-021` verifies submission auxiliary routes use async guards, retry upload uses async settings/audit helpers, and sync auth imports are absent; `ROUTE-AUTH-ASYNC-022` verifies numbering approval batch detail uses async numbering page/action permission helpers.
- Static cleanup evidence: direct sync auth search under `src/app/api` returned no matches.
- Runtime evidence: redirected `qc:api` passed 391/391. Relevant passed checks include `SANDBOX-001` through `SANDBOX-019`, `MARKUP-001` through `MARKUP-012`, and `REUSE-001` through `REUSE-010`.
- Numbering evidence: `qc:pdm-numbering-core` passed 238/238 after the approval batch detail route guard migration.
- Shadow evidence: `db:postgres:compare -- --no-write` reported 64 SQLite tables, 64 Postgres tables, no missing tables, no RLS-missing tables, and no mismatches; `qc:postgres-shadow` passed 22/22.
- QC residual risk: remaining numbering routes still call sync numbering permission guard helpers, and domain repositories still use sync DB helpers; real Supabase Postgres-mode evidence remains open.

## 2026-06-09 Phase 3AK QC Addendum

- Fact checked code evidence: remaining `src/app/api/numbering/**/route.ts` files, numbering-adjacent `src/app/api/parts/[partNumber]/**/route.ts` files, `src/app/api/numbering/admin/matrix/route.ts`, `src/app/api/numbering/approval-decisions/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-023` recursively checks numbering API routes for async numbering permission guards and rejects sync permission guard or direct sync auth imports; `ROUTE-AUTH-ASYNC-024` does the same for parts API routes that use numbering permission guards.
- Static cleanup evidence: `rg -n 'requireAuth\(|requireRole\(|from ["'']@/lib/auth["'']|requireNumberingPage\(|requireNumberingAction\(|canUserUseNumberingAction\(' src\app\api -g 'route.ts'` returned no matches.
- Runtime evidence: `qc:pdm-numbering-core` passed 238/238 and redirected `qc:api` passed 391/391 against a temporary local server that was stopped and cleaned afterward.
- Shadow evidence: `db:postgres:compare -- --no-write` reported 64 SQLite tables, 64 Postgres tables, no missing tables, no RLS-missing tables, and no mismatches; `qc:postgres-shadow` passed 22/22 after the final route changes.
- QC residual risk: API route auth/numbering guard migration is locally cleared, but domain repositories still use sync DB helpers; real Supabase Postgres-mode evidence, advisors/RLS review, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 QC Executable Document Addendum

- Added QC entry point: `.ai-doc/reports/pm/supabase-db-migration-executable-development-plan-2026-06-09.md`.
- QC fact baseline: data reset is complete; local API route sync auth and sync numbering permission guard checks are clear through Phase 3AK; live Supabase target evidence is still missing.
- QC must continue to distinguish local readiness from production completion. Passing TypeScript, lint, build, and SQLite-mode `qc:api` is not enough to mark `DEV-SUPABASE-DB-001` complete.
- Required future evidence: provider-neutral repository static checks, SQL portability checks, Postgres shadow compare, `AI_PDM_STAGING` migration/app/API evidence, Supabase security/performance advisor evidence, production smoke, and rollback drill.
- Phase 3AL QC focus: prove item revision history and where-used routes no longer depend on sync DB helpers after repository conversion, while preserving runtime API behavior.

## 2026-06-09 Phase 3AL QC Addendum

- Fact checked code evidence: `src/lib/repositories/item-insight-async-repository.ts`, `src/lib/item-insights-async.ts`, `src/app/api/items/[partNumber]/revisions/route.ts`, `src/app/api/items/[partNumber]/where-used/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static evidence: `ROUTE-AUTH-ASYNC-025` verifies both item insight routes call async helpers, await them, import `@/lib/item-insights-async`, and avoid direct `@/lib/db` sync helper imports.
- Repository evidence: `ITEM-INSIGHT-ASYNC-001` through `ITEM-INSIGHT-ASYNC-004` verify `AsyncDatabaseClient` usage, SQL constant exposure, portable named params, no `getDb`, no `better-sqlite3`, no SQLite-only `datetime(...)`, no `rowid`, and runtime provider selection through `getAsyncDatabaseClient`.
- Semantic evidence: `ITEM-INSIGHT-ASYNC-005` and `ITEM-INSIGHT-ASYNC-006` execute the SQL against in-memory SQLite, verifying revision history newest-first ordering, submittedBy scoping, where-used case-insensitive part matching, child outdated detection, and quantity preservation.
- Command evidence: `qc:access-control-async-repository` 75/75, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build`, and `qc:api` 391/391 all passed.
- Cleanup evidence: temporary `127.0.0.1:3101` dev server was stopped; port check returned closed.
- QC residual risk: this proves local SQLite-mode provider-neutral repository behavior only. Live Supabase Postgres-mode API evidence, advisors/RLS review, production cutover, rollback, and remaining repository conversions remain open.

## 2026-06-09 Phase 3AM QC Addendum

- Fact checked source files: `src/lib/repositories/dashboard-async-repository.ts`, `src/lib/dashboard-metrics-async.ts`, `src/app/api/submissions/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `ROUTE-AUTH-ASYNC-026`, `DASHBOARD-METRICS-ASYNC-001`, `DASHBOARD-METRICS-ASYNC-002`, and `DASHBOARD-METRICS-ASYNC-003`.
- Semantic checks added: `DASHBOARD-METRICS-ASYNC-004` and `DASHBOARD-METRICS-ASYNC-005` against in-memory SQLite fixtures.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 81/81, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- QC conclusion: `/api/submissions` dashboard metrics read path is now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for this exact route should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AN QC Addendum

- Fact checked source files: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `ROUTE-AUTH-ASYNC-027`, `SUBMISSION-LIST-ASYNC-001`, `SUBMISSION-LIST-ASYNC-002`, and `SUBMISSION-LIST-ASYNC-003`.
- Semantic checks added: `SUBMISSION-LIST-ASYNC-004` and `SUBMISSION-LIST-ASYNC-005` against in-memory SQLite fixtures.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 87/87, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- QC conclusion: `/api/submissions` GET submission list read path is now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for this exact route should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AO QC Addendum

- Fact checked source files: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/search/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `ROUTE-AUTH-ASYNC-028`, `SUBMISSION-SEARCH-ASYNC-001`, `SUBMISSION-SEARCH-ASYNC-002`, and `SUBMISSION-SEARCH-ASYNC-003`.
- Semantic checks added: `SUBMISSION-SEARCH-ASYNC-004` through `SUBMISSION-SEARCH-ASYNC-006` against in-memory SQLite fixtures.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 94/94, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, and BOM business tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: `/api/search` submission search read path is now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for this exact route should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AP QC Addendum

- Fact checked source files: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/[id]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `ROUTE-AUTH-ASYNC-029`, `SUBMISSION-DETAIL-ASYNC-001`, `SUBMISSION-DETAIL-ASYNC-002`, and `SUBMISSION-DETAIL-ASYNC-003`.
- Semantic checks added: `SUBMISSION-DETAIL-ASYNC-004` through `SUBMISSION-DETAIL-ASYNC-006` against in-memory SQLite fixtures.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 101/101, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, and `item_locks` remained at 0 after validation.
- QC conclusion: `/api/submissions/[id]` GET submission detail read path is now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for this exact route should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AQ QC Addendum

- Fact checked source files: `src/lib/repositories/submission-file-async-repository.ts`, `src/lib/submission-files-async.ts`, `src/lib/file-response.ts`, `src/app/api/submissions/[id]/retry-upload/route.ts`, `src/app/api/submissions/[id]/pdf-markups/route.ts`, `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `SUBMISSION-FILE-ASYNC-001` through `SUBMISSION-FILE-ASYNC-005`.
- Semantic checks added: `SUBMISSION-FILE-ASYNC-006` and `SUBMISSION-FILE-ASYNC-007` against in-memory SQLite fixtures.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 108/108, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, and `pdf_markups` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: submission file metadata lookup/update and file-response metadata authorization are now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for this exact route should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AR QC Addendum

- Fact checked source files: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/lib/auth-async.ts`, `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/discussions/[commentId]/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, `src/app/api/submissions/[id]/issues/[issueId]/route.ts`, `src/app/api/submissions/[id]/pdf-markups/route.ts`, `src/app/api/submissions/[id]/pdf-markups/[markupId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `COLLABORATION-ASYNC-001` through `COLLABORATION-ASYNC-004`.
- Semantic checks added: `COLLABORATION-ASYNC-005` through `COLLABORATION-ASYNC-008` against in-memory SQLite fixtures for create/list/resolve/audit behavior.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 116/116, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `pdf_markups`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, and `bom_release_snapshots` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: discussion, review issue, and PDF markup collaboration list/create/resolve paths are now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for these routes should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AT QC Addendum

- Fact checked source files: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/app/api/submissions/[id]/phase-gates/route.ts`, `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `PHASE-GATE-ASYNC-001` through `PHASE-GATE-ASYNC-004`.
- Semantic checks added: `PHASE-GATE-ASYNC-005` through `PHASE-GATE-ASYNC-007` against in-memory SQLite fixtures for list/decide/audit behavior.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 130/130, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, `pdf_markups`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, and `bom_release_snapshots` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: phase gate list/initialize/decide paths are now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for these routes should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AU QC Addendum

- Fact checked source files: `src/lib/repositories/approval-async-repository.ts`, `src/lib/approval-async.ts`, `src/app/api/submissions/[id]/approval-matrix/route.ts`, `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `APPROVAL-MATRIX-ASYNC-001` through `APPROVAL-MATRIX-ASYNC-004`.
- Semantic checks added: `APPROVAL-MATRIX-ASYNC-005` through `APPROVAL-MATRIX-ASYNC-007` against in-memory SQLite fixtures for list/approved-count/refresh/waive/audit behavior.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 137/137, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `approval_matrix_requirements`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, `pdf_markups`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, and `bom_release_snapshots` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: approval matrix list/initialize/refresh/waive paths are now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for these routes should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AS QC Addendum

- Fact checked source files: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/app/api/submissions/[id]/changes/route.ts`, `src/app/api/submissions/[id]/changes/[changeId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `CHANGE-REQUEST-ASYNC-001` through `CHANGE-REQUEST-ASYNC-004`.
- Semantic checks added: `CHANGE-REQUEST-ASYNC-005` through `CHANGE-REQUEST-ASYNC-007` against in-memory SQLite fixtures for create/list/decide/audit behavior.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 123/123, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `approval_steps`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, `pdf_markups`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, and `bom_release_snapshots` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: change request list/create/decide paths are now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity for these routes should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AV QC Addendum

- Fact checked source files: `src/lib/repositories/approval-async-repository.ts`, `src/lib/approval-async.ts`, `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/submission-status-async.ts`, `src/app/api/submissions/[id]/reject/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `APPROVAL-DECISION-ASYNC-001` through `APPROVAL-DECISION-ASYNC-003` and `SUBMISSION-STATUS-ASYNC-001` through `SUBMISSION-STATUS-ASYNC-002`.
- Semantic checks added: `APPROVAL-DECISION-ASYNC-004` and `APPROVAL-DECISION-ASYNC-005` against in-memory SQLite fixtures for decision insert/lookup/summary and reject status/audit behavior.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 144/144, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `bom_headers`, `bom_lines`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, `bom_release_snapshots`, `approval_steps`, `approval_matrix_requirements`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, and `pdf_markups` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: reject release decision flow is now provider-neutral at the migrated slice boundary.
- QC residual risk: approve/release decision flow still depends on broader release, sandbox, package, lifecycle, and status write paths; full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end runtime parity should be re-run on disposable/staging data before cutover.

## 2026-06-09 Phase 3AW QC Addendum

- Fact checked source files: `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/submission-status-async.ts`, `src/lib/repositories/release-async-repository.ts`, `src/lib/release-records-async.ts`, `src/lib/release-async.ts`, `src/lib/release-package-async.ts`, `src/app/api/submissions/[id]/approve/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: approve-release route and service checks for async helpers, no direct sync DB import, release lifecycle SQL exposure, release package SQL exposure, and provider-neutral helper wiring.
- Semantic checks added: SQLite in-memory checks for active sandbox lookup, released filename conflict lookup, releasing/failure updates, release package upsert, released lifecycle update, previous release obsolescence, and obsolete audit insertion.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 153/153, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `sandbox_branches`, `bom_headers`, `bom_lines`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, `bom_release_snapshots`, `approval_steps`, `approval_matrix_requirements`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, and `pdf_markups` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: approve release decision flow is now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end approve/release runtime parity should be re-run on disposable/staging data before cutover; live Supabase Postgres-mode evidence is still required.

## 2026-06-09 Phase 3AX QC Addendum

- Fact checked source files: `src/lib/repositories/submission-write-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/route.ts`, `src/lib/submission-files-async.ts`, `src/lib/system-settings-async.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `SUBMISSION-WRITE-ASYNC-001` through `SUBMISSION-WRITE-ASYNC-005` for provider-neutral SQL exposure, helper wiring, route async wiring, no direct sync DB import, and Postgres-compatible named-parameter/conflict SQL.
- Semantic checks added: `SUBMISSION-WRITE-ASYNC-006` through `SUBMISSION-WRITE-ASYNC-008` against in-memory SQLite fixtures for item upsert/duplicate lookup, submission file/reference/audit insertion, and BOM materialization from assembly references.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 161/161, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `sandbox_branches`, `bom_headers`, `bom_lines`, `bom_drafts`, `bom_lines_tree`, `bom_review_requests`, `bom_release_snapshots`, `approval_steps`, `approval_matrix_requirements`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, and `pdf_markups` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: `/api/submissions` POST create/write flow is now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end create/upload runtime parity should be re-run on disposable/staging data before cutover; live Supabase Postgres-mode evidence is still required.

## 2026-06-09 Phase 3AY QC Addendum

- Fact checked source files: `src/lib/repositories/bom-workbench-async-repository.ts`, `src/lib/bom-workbench-async.ts`, `src/app/api/bom/workbench/route.ts`, `src/lib/submissions-async.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- Static checks added: `BOM-WORKBENCH-ASYNC-001` through `BOM-WORKBENCH-ASYNC-005` for provider-neutral SQL exposure, helper wiring, route async wiring, no direct sync DB import, and Postgres-compatible named-parameter/deterministic-order SQL.
- Semantic checks added: `BOM-WORKBENCH-ASYNC-006` through `BOM-WORKBENCH-ASYNC-008` against in-memory SQLite fixtures for parent/draft summary lookup, active draft detail and line ordering, joined part name, numeric quantity handling, and missing-row behavior.
- Verified commands: `npm.cmd run qc:access-control-async-repository` 169/169, `npx.cmd tsc --noEmit`, `npm.cmd run lint -- --quiet`, `npm.cmd run db:postgres:compare -- --no-write`, `npm.cmd run qc:postgres-shadow` 22/22, and `npm.cmd run build`.
- Cleanup evidence: `items`, `submissions`, `submission_files`, `file_references`, `release_packages`, `sandbox_branches`, `bom_headers`, `bom_lines`, `bom_drafts`, `bom_lines_tree`, `bom_import_profiles`, `bom_import_jobs`, `bom_review_requests`, `bom_release_snapshots`, `approval_steps`, `approval_matrix_requirements`, `audit_logs`, `item_locks`, `discussion_comments`, `review_issues`, `change_requests`, `phase_gate_checks`, and `pdf_markups` remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- QC conclusion: `/api/bom/workbench` GET summary read path is now provider-neutral at the migrated slice boundary.
- QC residual risk: full `qc:api` was skipped to avoid repopulating local test data after reset, so end-to-end workbench UI/API runtime parity should be re-run on disposable/staging data before cutover; live Supabase Postgres-mode evidence is still required.
