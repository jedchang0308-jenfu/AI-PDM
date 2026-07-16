# PM Supabase DB Migration Development Package - 2026-06-08

關聯任務：`DEV-SUPABASE-DB-001`  
文件目的：把「由 Google Drive / local runtime 路徑升級到 Supabase DB」整理成可交接、可驗證、可繼續開發的 PM-dev 文件包。

## Current Decision

- 資料庫先行：本任務只處理 Supabase Postgres runtime。
- Storage 延後：Supabase Storage 與檔案本體遷移另開 follow-up。
- 不搬舊資料：2026-06-08 已清空 test-like runtime artifacts。
- 不用既有 target：`ProJED` / `ProJED_TEST` 不可作為 AI_PDM staging/prod。
- 新 target：後續需要建立 `AI_PDM_STAGING` 與 `AI_PDM_PROD`。
- 入口邊界：Browser 仍走 AI_PDM server API，不直接打 Supabase Data API。

## Document Map

| Role | Document | Purpose |
|---|---|---|
| Index | `.ai-doc/reports/pm/supabase-db-migration-development-docs-index-2026-06-08.md` | 開發文件總入口、閱讀順序、責任分工、下一步開發切片。 |
| PM | `.ai-doc/dev_task.md` | 任務主控、狀態、RD/QA/QC checklist、evidence log。 |
| SPEC | `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md` | 正式需求、範圍、target、provider、migration、驗收標準。 |
| ADR | `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md` | 為何 DB-first、為何新 target、為何保留 server API。 |
| RD | `.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md` | 工程分期、檔案影響、repository 遷移順序。 |
| QA | `.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md` | 驗證矩陣、entry/exit criteria、staging/live command checklist。 |
| QC | `.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md` | fact-check gate、不可接受 evidence、completion rule。 |
| Industrialization | `.ai-doc/reports/industrialization/supabase-runtime-migration-plan-2026-06-08.md` | runtime migration roadmap 與 local evidence。 |
| Supabase | `supabase/README.md` | migration mirror 使用方式、target rules、安全 baseline。 |
| Postgres | `db/postgres/README.md` | Postgres / Supabase schema 與 guard 操作說明。 |

## Current Status

`DEV-SUPABASE-DB-001` 應標示為 `[/] In Progress`。

已完成的本機開發 slice：

- Full data reset。
- Supabase migration mirror。
- Migration sync script。
- Migration QC script。
- Target identity guard 強化。
- `.env.example` Supabase runtime env。
- Supabase README。
- RD / QA / QC / SPEC / ADR / PM package 文件。
- Async DB provider contract。
- SQLite async adapter。
- Async provider QC alias。
- Postgres async adapter minimum implementation。
- Postgres provider local QC gate。
- Async system settings repository pilot。
- System settings async repository QC。
- Async access-control repository pilot。
- Access-control async repository QC。
- Async permission API read path。
- Async permission guard helper and first read-only route batch migration。
- Async auth/session user lookup pilot for async permission guard。
- Async login/token user lookup pilot。
- Async auth audit write pilot。
- Permission API / sidebar regression QC。

尚未完成：

- Supabase organization / region / cost confirmation。
- `AI_PDM_STAGING` target 建立。
- Supabase CLI migration history。
- Postgres runtime provider wiring into remaining repositories/API。
- Repository async migration。
- Full repository async migration.
- Staging advisor / API regression。
- `AI_PDM_PROD` cutover。
- Supabase Storage follow-up。

## Evidence Snapshot

已通過：

- `npm.cmd run supabase:migrations:sync`
- `npm.cmd run qc:supabase-runtime-migrations`：17/17
- `npm.cmd run db:postgres:compare -- --no-write`：64/64 tables，0 missing，0 RLS missing
- `npm.cmd run qc:postgres-shadow-target-guard`：11/11
- `npm.cmd run qc:postgres-shadow`：22/22
- `npm.cmd run qc:db-provider-contract`：27/27
- `npm.cmd run qc:db-provider-contract`：31/31
- `npm.cmd run qc:db-provider-postgres`：8/8；live probe skipped without `PDM_POSTGRES_URL`
- `npm.cmd run qc:system-settings-async-repository`：11/11
- `npm.cmd run qc:access-control-async-repository`：37/37
- `npm.cmd run qc:pdm-numbering-cross-role-permission`：45/45
- `npm.cmd run qc:pdm-numbering-permission-guard-ui`：35/35
- `npm.cmd run qc:managed-auth`：11/11
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run lint`
- `npm.cmd run build`

已知限制：

- 本機尚無 Supabase CLI，因此 live migration history 尚未完成。
- `build` 通過但仍有既有 Turbopack NFT tracing warning，需另列低風險技術債追蹤。

## Next RD Slice

已完成上一個建議 slice：

1. 建立 async DB interface。
2. 建立 SQLite adapter，先維持現有 runtime 行為。
3. 建立 provider contract QC。

已完成上一個建議 slice 的第一批：

1. `requireNumberingPermissionAsync` / `requireNumberingPageAsync` / `requireNumberingActionAsync` / `canUserUseNumberingActionAsync` 已建立。
2. `/api/numbering/search`、`/api/numbering/tasks`、`/api/numbering/notifications`、`/api/parts`、`/api/numbering/drawings` 已改為 async page guard。
3. `qc:access-control-async-repository` 已擴充 async guard 與 5 個 read-only route 接線檢查。
4. `requireNumberingPermissionAsync` 已改用 `requireAuthAsync`，session user lookup 透過 async user repository。
5. `/api/auth/login` 與 `/api/auth/token` 已改用 async user repository 讀取 password hash。
6. `/api/auth/login` 與 `/api/auth/token` 的 Login audit 已改用 async audit repository 寫入。

建議下一個開發 slice：

1. 繼續將其他 read-only route 改成 async guard，例如 detail/report/import list routes。
2. 繼續抽出 async auth write helper，逐步移除 `ensureDemoUser` / user create/update password 的同步寫入依賴。
3. 新增 provider-neutral repository contract QC，覆蓋 SQLite adapter、Postgres SQL normalization 與 API response parity。
4. 在 `PDM_POSTGRES_URL` 可用後，讓 `qc:db-provider-postgres` 執行 live `select 1` probe。
5. 不切 production runtime，直到 staging target 與 advisor gate 完成。

## PM Gate

不得把 `DEV-SUPABASE-DB-001` 標示為完成，直到：

- `AI_PDM_STAGING` 與 `AI_PDM_PROD` 都完成 live validation。
- Production runtime 實際使用 Supabase Postgres。
- Postgres-mode API regression 與 smoke 通過。
- SQLite fallback 與 rollback plan 可用。
- Storage follow-up 已另行建立或明確列入 backlog。

## 2026-06-08 Phase 3H PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: async auth user write pilot.
- Delivery: async user upsert/create/password-update helpers are available; login/token demo seed now uses async helpers.
- Evidence: `qc:access-control-async-repository` 42/42, `qc:managed-auth` 11/11, and `tsc --noEmit` passed.
- Next PM gate: continue migrating remaining sync routes/repositories, then schedule Supabase staging live validation before any production cutover.

## 2026-06-08 Phase 3I PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: `/api/settings` async runtime wiring.
- Delivery: settings GET/POST now uses async role guard, async settings repository helper, and async audit helper.
- Evidence: `qc:system-settings-async-repository` 15/15, `qc:managed-auth` 11/11, `qc:gdrive-folder-tree-settings` 35/35, `qc:api` 391/391 with a temporary local dev server, `tsc --noEmit`, `lint -- --quiet`, and `build` passed. Build still reports the existing Turbopack NFT warning.
- Next PM gate: migrate additional sync routes/repositories or wire runtime provider selection, then perform Postgres-mode validation.

## 2026-06-08 Phase 3J PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: async runtime provider selector.
- Delivery: `getAsyncDatabaseClient()` now selects SQLite or Postgres runtime from env; auth/audit/numbering permission/settings async helpers now use the selector instead of hard-coded SQLite adapters.
- Evidence: `qc:db-provider-contract` 35/35, `qc:db-provider-postgres` 9/9 with live probe skipped because `PDM_POSTGRES_URL` is not configured, `qc:access-control-async-repository` 42/42, `qc:system-settings-async-repository` 15/15, `tsc --noEmit`, `qc:managed-auth` 11/11, `qc:pdm-numbering-core` 238/238, `lint -- --quiet`, `qc:gdrive-folder-tree-settings` 35/35, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Next PM gate: configure a real AI_PDM Supabase staging target and run Postgres-mode validation, while continuing to migrate remaining sync routes/repositories.

## 2026-06-08 Phase 3K PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: auth session route async migration.
- Delivery: `/api/auth/me` now reads the session user through async auth; `/api/auth/logout` now reads the session user and writes logout audit through async helpers while preserving logout cookie behavior.
- Evidence: `qc:access-control-async-repository` 44/44, `qc:managed-auth` 18/18, `tsc --noEmit`, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3L PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: settings Google Drive admin route async guard migration.
- Delivery: `/api/settings/gdrive/folders` and `/api/settings/gdrive/folders/verify` now use async Admin role guard while preserving folder list/verify behavior.
- Evidence: `qc:system-settings-async-repository` 16/16, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `qc:gdrive-folder-tree-settings` 35/35, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3M PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: file metadata detect route async role guard migration.
- Delivery: `/api/file-metadata/detect` now uses async Engineer/Admin role guard while preserving metadata detection behavior.
- Evidence: `qc:access-control-async-repository` 45/45, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `META-001` through `META-004` covered the Engineer metadata detect path.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3N PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: manufacturing handoff route async auth guard migration.
- Delivery: `/api/handoff` and `/api/handoff/export` now use async session lookup; `requireAuthAsync` / `requireRoleAsync` result typing is tightened for safer migrated route use.
- Evidence: `qc:access-control-async-repository` 46/46, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `HANDOFF-001` through `HANDOFF-011` covered the JSON and CSV handoff routes.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3O PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: search and notifications read-only route async auth guard migration.
- Delivery: `/api/search` and `/api/notifications` now use async session lookup while preserving existing search and notification scoping behavior.
- Evidence: `qc:access-control-async-repository` 47/47, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-013`, `SEARCH-001` through `SEARCH-003`, and `NOTIFY-001` through `NOTIFY-009` covered unauthenticated blocking and scoped authenticated reads.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3P PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: PM development documentation consolidation.
- Delivery: `.ai-doc/reports/pm/supabase-db-migration-master-development-document-2026-06-08.md` is now the clean master development document for the Supabase DB migration.
- PM use: treat the master document as the first-read plan for scope, phase gates, risk register, validation commands, completion definition, and future modification expectations.
- Existing PM/RD/QA/QC/SPEC/ADR documents remain the detailed supporting package and evidence trail.
- Supabase official documentation alignment checked for Row Level Security, secure data handling, and shared responsibility model.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3Q PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: item revision history and where-used read-only route async auth guard migration.
- Delivery: `/api/items/[partNumber]/revisions` and `/api/items/[partNumber]/where-used` now use async session lookup while preserving existing revision history and where-used query behavior.
- Evidence: `qc:access-control-async-repository` 48/48, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `HIST-001` through `HIST-006` and `WHEREUSED-001` through `WHEREUSED-011` covered unauthenticated blocking, manager visibility, engineer scoping, and empty where-used behavior.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3R PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: procurement releases integration read-only route async role guard migration.
- Delivery: `/api/integrations/procurement/releases` now uses async R&D Manager/Admin role lookup while preserving the existing procurement release payload contract.
- Evidence: `qc:access-control-async-repository` 49/49, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `PROCAPI-001` through `PROCAPI-008` covered unauthenticated blocking, Engineer forbidden, Manager read, payload redaction, and filtering behavior.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3S PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: numbering permissions matrix route async auth guard hardening.
- Delivery: `/api/numbering/permissions` now uses async session lookup while preserving async permission-service evaluation and the existing permission matrix response contract.
- Evidence: `qc:access-control-async-repository` 49/49, `tsc --noEmit`, `qc:pdm-numbering-permission-guard-ui` 35/35, `qc:pdm-numbering-cross-role-permission` 45/45, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: numbering permission UI and cross-role QC covered `/api/numbering/permissions`, role matrix toggles, custom role assignment, delegation, revocation, sidebar visibility, and backend guard parity.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3T PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: procurement sync-runs route async role guard migration.
- Delivery: `/api/integrations/procurement/sync-runs` and `/api/integrations/procurement/sync-runs/[runId]` now use async R&D Manager/Admin role lookup while preserving the procurement sync-run response and state transition contracts.
- Supporting delivery: `AsyncRoleResult` is now a discriminated union, and migrated async routes can use `forbidden` through `auth-async` without importing the sync auth module.
- Evidence: `qc:access-control-async-repository` 50/50, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `ERPSYNC-001` through `ERPSYNC-012` covered sync-run auth, role guard, released-only gate, create/list/acknowledge, payload, external ref, and duplicate acknowledgement behavior.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3U PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: chat route async auth guard migration.
- Delivery: `/api/chat` now uses async session lookup while preserving conversation persistence, response sources, tool behavior, and cross-user conversation denial.
- Evidence: `qc:access-control-async-repository` 51/51, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and warmed `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-012`, `AI-009` through `AI-021`, and contextual AI checks covered chat auth, continuation, cross-user 403, sources, and tool policy behavior.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3V PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission file download and PDF preview route async auth guard migration.
- Delivery: `/api/submissions/[id]/files/[...filePath]` now uses async session lookup while preserving stored-file lookup, `/files/[fileId]` download disposition, `/files/preview/[fileId]` PDF preview disposition, and non-PDF preview rejection behavior.
- Evidence: `qc:access-control-async-repository` 52/52, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-003` and `FILE-001` through `FILE-005` covered unauthenticated download blocking, successful download, attachment disposition, PDF preview, PDF content type, and inline disposition.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3W PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission discussions and review issues route async auth guard migration.
- Delivery: `/api/submissions/[id]/discussions`, `/api/submissions/[id]/discussions/[commentId]`, `/api/submissions/[id]/issues`, and `/api/submissions/[id]/issues/[issueId]` now use async session lookup while preserving discussion/issue creation, listing, resolving, file validation, assignee validation, and submission visibility behavior.
- Evidence: `qc:access-control-async-repository` 53/53, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `DISCUSS-001` through `DISCUSS-014` and `ISSUE-001` through `ISSUE-013` covered unauthenticated blocking, create/list/resolve behavior, manager visibility, file validation, and engineer scope isolation.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3X PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission change request route async auth and role guard migration.
- Delivery: `/api/submissions/[id]/changes` now uses async auth for list and async role guard for create; `/api/submissions/[id]/changes/[changeId]` now uses async R&D Manager/Admin role guard for decisions while preserving ECR/ECO/ECN behavior.
- Evidence: `qc:access-control-async-repository` 54/54, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHANGE-001` through `CHANGE-017` covered unauthenticated blocking, validation, Engineer and Manager create flows, decision role denial, Manager approval, duplicate-decision conflict, and engineer scope isolation.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3Y PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission phase gate route async auth and role guard migration.
- Delivery: `/api/submissions/[id]/phase-gates` now uses async auth for list and async R&D Manager/Admin role guard for initialization; `/api/submissions/[id]/phase-gates/[checkId]` now uses async R&D Manager/Admin role guard for phase decisions while preserving phase gate summary and release-blocking behavior.
- Evidence: `qc:access-control-async-repository` 55/55, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `PHASE-001` through `PHASE-013` covered unauthenticated blocking, Engineer denial, Manager initialization/decisions, approval blocking, ready summary, duplicate-decision conflict, and release flow.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3Z PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission approval matrix route async auth and role guard migration.
- Delivery: `/api/submissions/[id]/approval-matrix` now uses async auth for list and async R&D Manager/Admin role guard for initialization; `/api/submissions/[id]/approval-matrix/[requirementId]` now uses async R&D Manager/Admin role guard for waivers while preserving approval matrix release gating.
- Evidence: `qc:access-control-async-repository` 56/56, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, clean rerun `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `MATRIX-001` through `MATRIX-015` covered unauthenticated blocking, Engineer denial, Manager initialization, Manager/Admin approvals, release after required roles, Admin waiver, and manager-only release after waiver.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3AA PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission preflight lock route async role guard migration.
- Delivery: `/api/submissions/preflight-lock` now uses async Engineer/Admin role lookup while preserving active lock preflight response behavior.
- Evidence: `qc:access-control-async-repository` 57/57, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHECKOUT-010` through `CHECKOUT-016` covered unauthenticated blocking, owner preflight, non-owner active lock detection, and lock owner exposure.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3AB PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission checkout route async role guard migration.
- Delivery: `/api/submissions/[id]/checkout` now uses async Engineer/Admin role lookup for both checkout acquire and release while preserving lock behavior.
- Evidence: `qc:access-control-async-repository` 58/58, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHECKOUT-001` through `CHECKOUT-009` covered unauthenticated blocking, Manager denial, Engineer acquire/reuse, competing lock conflict, owner exposure, and release.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-08 Phase 3AC PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: approve/reject routes now use async role guard and the file delivery endpoint is consolidated into a catch-all route that preserves download and PDF preview URLs.
- PM gate result: local SQLite-mode regression is green for this slice: access-control 59/59, TypeScript, managed-auth 18/18, lint, build, and API QC 391/391.
- Risk retired: PDF preview `404` on `/files/preview/[fileId]` is fixed and covered by `FILE-003` through `FILE-005`.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-09 Phase 3AD PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: release package download now uses async auth; share and supplier response management routes now use async R&D Manager/Admin role guard.
- PM gate result: local SQLite-mode regression is green for this slice: access-control 60/60, TypeScript, managed-auth 18/18, lint, build, and API QC 391/391.
- Risk reduced: supplier/public share workflow no longer depends on sync auth route helpers, while public share endpoints remain unchanged.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-09 Phase 3AE PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: AI summary and AI risk routes now use async auth guard while preserving existing AI response behavior and submission scoping.
- PM gate result: local SQLite-mode regression is green for this slice: access-control 61/61, TypeScript, managed-auth 18/18, lint, build, and API QC 391/391.
- Risk reduced: AI read routes no longer depend on sync auth route helper, but repository/helper async conversion remains open.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-09 Phase 3AF PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: submission list/create/detail routes now use async auth/role guards while preserving submission creation, list scoping, duplicate protection, file handling, and detail visibility behavior.
- PM gate result: local SQLite-mode regression is green for this slice: access-control 62/62, TypeScript, managed-auth 18/18, lint, build, Postgres shadow compare, Postgres shadow QC 22/22, and API QC 391/391.
- Risk reduced: core submission entry points no longer depend on sync auth route helpers, but domain DB/file helper async conversion remains open.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-09 Phase 3AG PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: submission BOM materialize/read/diff/export routes now use async auth guard while preserving BOM authorization, materialization, diff, CSV export, and XLS export behavior.
- PM gate result: local SQLite-mode regression is green for this slice: access-control 63/63, TypeScript, managed-auth 18/18, lint, build, Postgres shadow compare, Postgres shadow QC 22/22, and API QC 391/391.
- Risk reduced: BOM read/export/diff entry points no longer depend on sync auth route helper, but BOM domain repository async conversion remains open.
- Next PM gate: continue migrating remaining sync auth/role guarded API routes or configure a real AI_PDM Supabase staging target for Postgres-mode validation.

## 2026-06-09 Phase 3AH PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: Supabase DB migration plan was rewritten as a PM-dev development document after the full `data` reset.
- Primary document: `.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md`.
- PM decision: migration starts from clean schema and controlled seed; old test-like files are not migrated; DB runtime is handled before Supabase Storage; `ProJED` / `ProJED_TEST` remain forbidden targets.
- Development gates: Phase 0 clean baseline, Phase 1 migration mirror / target guard, Phase 2 async DB provider, Phase 3 repository / route migration, Phase 4 `AI_PDM_STAGING`, Phase 5 `AI_PDM_PROD`, Phase 6 Storage follow-up.
- Risk policy: future modifications are expected and tracked as migration-phase, pre-cutover, and post-cutover work; this is not a one-shot conversion.
- Next PM gate: implement the next controlled route/repository slice or obtain user confirmation for Supabase organization, region, and cost before creating `AI_PDM_STAGING`.

## 2026-06-09 Phase 3AI PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: BOM workbench, draft, review, and release export routes now use async auth/role guards.
- PM gate result: local SQLite-mode regression is green for this slice: access-control 64/64, TypeScript, managed-auth 18/18, lint, build, Postgres shadow compare, Postgres shadow QC 22/22, BOM workbench foundation/tree/release/import/export/released-only QC, and API QC 391/391.
- Risk reduced: BOM workbench UI/API entry points no longer depend on sync auth route helpers, including review Manager/Admin gates and Manufacturing/Procurement released-only export flow.
- Remaining risk: BOM domain repositories still use existing sync DB helpers after async guard migration; real Supabase staging/prod validation is still not configured.
- Next PM gate: continue remaining sync route guard migration or begin BOM repository async conversion before live staging cutover.

## 2026-06-09 Phase 3AJ PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: submission auxiliary routes now use async auth/role guards, retry upload now uses async settings and audit helpers, and numbering approval batch detail now uses async numbering permission guards.
- PM gate result: local SQLite-mode regression is green for this slice: access-control 66/66, TypeScript, managed-auth 18/18, lint, numbering core 238/238, Postgres shadow compare, Postgres shadow QC 22/22, build, and API QC 391/391.
- Risk reduced: direct sync `@/lib/auth` imports/calls are now cleared from `src/app/api` route files.
- Remaining risk: numbering routes still contain sync numbering permission guard helpers, repositories still need async conversion, and real Supabase staging/prod validation is still not configured.
- Next PM gate: migrate the remaining numbering route permission guards to async helpers or begin domain repository async conversion before live staging cutover.

## 2026-06-09 Phase 3AK PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: remaining numbering API routes and numbering-adjacent parts API routes now use async numbering permission guards.
- PM gate result: local SQLite-mode regression is green for this slice: full API sync guard search has no matches, access-control 68/68, TypeScript, managed-auth 18/18, lint, numbering core 238/238, Postgres shadow compare, Postgres shadow QC 22/22, build, and API QC 391/391.
- Risk reduced: API route files are now clear of direct sync auth imports/calls and sync numbering permission guard calls.
- Remaining risk: domain repositories still need async/provider-neutral conversion, and real Supabase staging/prod validation is still not configured.
- Next PM gate: move from route guard migration to repository/provider migration, or obtain user confirmation for Supabase organization, region, and cost before creating `AI_PDM_STAGING`.

## 2026-06-09 PM-dev Executable Document Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Added primary executable development document: `.ai-doc/reports/pm/supabase-db-migration-executable-development-plan-2026-06-09.md`.
- PM decision recorded: start Supabase from clean schema plus controlled seed; do not migrate old test-like file artifacts; keep DB migration before Storage migration; keep SQLite fallback until production cutover and rollback are proven.
- Development structure recorded: Phase 0 clean baseline, Phase 1 migration mirror and target guard, Phase 2 async DB provider, Phase 3 repository/route conversion, Phase 4 `AI_PDM_STAGING`, Phase 5 `AI_PDM_PROD`, Phase 6 Storage follow-up.
- Risk position recorded: future modification is expected and controlled through phase gates; this is not a one-shot conversion.
- Next PM gate: Phase 3AL item revision history and where-used provider-neutral repository conversion, or user confirmation of Supabase organization, region, and cost before live staging setup.

## 2026-06-09 Phase 3AL PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: item revision history and where-used routes now use provider-neutral async repository helpers instead of direct sync `@/lib/db` query helpers.
- Code evidence: `src/lib/repositories/item-insight-async-repository.ts`, `src/lib/item-insights-async.ts`, `src/app/api/items/[partNumber]/revisions/route.ts`, and `src/app/api/items/[partNumber]/where-used/route.ts`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-025` and `ITEM-INSIGHT-ASYNC-001` through `ITEM-INSIGHT-ASYNC-006`, including in-memory SQLite semantic checks for revision ordering, where-used case-insensitive lookup, outdated child detection, quantity preservation, and Engineer scoping.
- PM gate result: local SQLite-mode regression is green for this slice: `qc:access-control-async-repository` 75/75, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build`, and `qc:api` 391/391.
- Cleanup evidence: the temporary `127.0.0.1:3101` dev server used for `qc:api` was stopped; direct sync DB search under the two item routes returned no matches.
- Remaining PM risk: broader domain repositories still require async/provider-neutral conversion, and real Supabase staging/prod validation is still not configured.
- Next PM gate: continue provider-neutral repository conversion for another bounded read/write domain slice, or configure `AI_PDM_STAGING` after user confirms Supabase organization, region, and cost.

## 2026-06-09 Phase 3AM PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: `/api/submissions` GET dashboard metrics now use provider-neutral async repository helpers through `getDashboardMetricsAsync`.
- Code evidence: `src/lib/repositories/dashboard-async-repository.ts`, `src/lib/dashboard-metrics-async.ts`, `src/app/api/submissions/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 81/81, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset.
- Remaining PM risk: submission list/search/write repositories, BOM repository, numbering repository, release/collaboration repositories, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AN PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: `/api/submissions` GET submission list now uses provider-neutral async repository helpers through `listSubmissionsAsync`.
- Code evidence: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-027` and `SUBMISSION-LIST-ASYNC-001` through `SUBMISSION-LIST-ASYNC-005`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 87/87, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset.
- Remaining PM risk: `searchSubmissions`, submission detail/create/write/upload paths, BOM repository, numbering repository, release/collaboration repositories, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AO PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: `/api/search` submission search now uses provider-neutral async repository helpers through `searchSubmissionsAsync`.
- Code evidence: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/search/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-028` and `SUBMISSION-SEARCH-ASYNC-001` through `SUBMISSION-SEARCH-ASYNC-006`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 94/94, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business tables remained at 0 after validation.
- Remaining PM risk: submission detail/create/write/upload paths, BOM repository, numbering repository, release/collaboration repositories, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AP PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: `/api/submissions/[id]` GET submission detail now uses provider-neutral async repository helpers through `getSubmissionAsync`.
- Code evidence: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/[id]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-029` and `SUBMISSION-DETAIL-ASYNC-001` through `SUBMISSION-DETAIL-ASYNC-006`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 101/101, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business tables remained at 0 after validation.
- Operational cleanup: any leftover local Next listener for this workspace must be stopped before handoff so the clean DB state is not confused with an active QC/dev session.
- Remaining PM risk: submission create/write/upload paths, submission file/download routes, BOM repository, numbering repository, release/collaboration repositories, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AQ PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: submission file metadata read/update paths now use provider-neutral async repository helpers.
- Code evidence: `src/lib/repositories/submission-file-async-repository.ts`, `src/lib/submission-files-async.ts`, `src/lib/file-response.ts`, `src/app/api/submissions/[id]/retry-upload/route.ts`, `src/app/api/submissions/[id]/pdf-markups/route.ts`, `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `SUBMISSION-FILE-ASYNC-001` through `SUBMISSION-FILE-ASYNC-007`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 108/108, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business and collaboration tables remained at 0 after validation.
- Remaining PM risk: submission create/write/upload, collaboration write/list repositories, BOM repository, numbering repository, release/collaboration repositories, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AR PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: collaboration discussion, review issue, and PDF markup list/create/resolve paths now use provider-neutral async repository helpers.
- Code evidence: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/lib/auth-async.ts`, six collaboration route files under `src/app/api/submissions/[id]/`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `COLLABORATION-ASYNC-001` through `COLLABORATION-ASYNC-008`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 116/116, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business, BOM, and collaboration runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Remaining PM risk: submission create/write/upload, change request, phase gate, approval matrix, BOM, numbering, release, attachment, AI, and other domain repository conversions, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AS PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: change request list/create/decide paths now use provider-neutral async repository helpers.
- Code evidence: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/app/api/submissions/[id]/changes/route.ts`, `src/app/api/submissions/[id]/changes/[changeId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `CHANGE-REQUEST-ASYNC-001` through `CHANGE-REQUEST-ASYNC-007`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 123/123, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business, BOM, and collaboration runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Remaining PM risk: submission create/write/upload, phase gate, approval matrix, BOM, numbering, release, attachment, AI, and other domain repository conversions, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AT PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: phase gate list/initialize/decide paths now use provider-neutral async repository helpers.
- Code evidence: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/app/api/submissions/[id]/phase-gates/route.ts`, `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `PHASE-GATE-ASYNC-001` through `PHASE-GATE-ASYNC-007`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 130/130, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business, BOM, and collaboration runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Remaining PM risk: submission create/write/upload, approval matrix, BOM, numbering, release, attachment, AI, and other domain repository conversions, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AU PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: approval matrix list/initialize/refresh/waive paths now use provider-neutral async repository helpers.
- Code evidence: `src/lib/repositories/approval-async-repository.ts`, `src/lib/approval-async.ts`, `src/app/api/submissions/[id]/approval-matrix/route.ts`, `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `APPROVAL-MATRIX-ASYNC-001` through `APPROVAL-MATRIX-ASYNC-007`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 137/137, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business, BOM, and collaboration runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Remaining PM risk: submission create/write/upload, approve/reject release decision flows, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repository conversions, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AV PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: reject release decision flow now uses provider-neutral async repository helpers for submission lookup, approval decision insert/duplicate check, reject status update, and audit logging.
- Code evidence: `src/lib/repositories/approval-async-repository.ts`, `src/lib/approval-async.ts`, `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/submission-status-async.ts`, `src/app/api/submissions/[id]/reject/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `APPROVAL-DECISION-ASYNC-001` through `APPROVAL-DECISION-ASYNC-005` plus `SUBMISSION-STATUS-ASYNC-001` and `SUBMISSION-STATUS-ASYNC-002`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 144/144, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business, BOM, approval, and collaboration runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Remaining PM risk: submission create/write/upload, approve release decision flow, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repository conversions, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AW PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: approve release decision flow now uses provider-neutral async repository helpers for submission lookup, active sandbox blocking, approval decision insert/duplicate check, phase gate and approval matrix blocking, release status lifecycle, release package record upsert, filename conflict lookup, and audit logging.
- Code evidence: `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/submission-status-async.ts`, `src/lib/repositories/release-async-repository.ts`, `src/lib/release-records-async.ts`, `src/lib/release-async.ts`, `src/lib/release-package-async.ts`, `src/app/api/submissions/[id]/approve/route.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes approve-release static records and SQLite semantic checks for active sandbox, filename conflict, releasing/failure updates, release package upsert, and released/obsolete lifecycle behavior.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 153/153, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business, BOM, approval, collaboration, release, and sandbox runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Remaining PM risk: submission create/write/upload, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repository conversions, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AX PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: `/api/submissions` POST create/write flow now uses provider-neutral async repository helpers for duplicate drawing/revision lookup, item upsert, submission insert, submission file/reference insert, submit audit, BOM materialization, system setting lookup, and background upload status updates.
- Code evidence: `src/lib/repositories/submission-write-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/route.ts`, `src/lib/submission-files-async.ts`, `src/lib/system-settings-async.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `SUBMISSION-WRITE-ASYNC-001` through `SUBMISSION-WRITE-ASYNC-008`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 161/161, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Remaining PM risk: BOM workbench/domain repositories, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.

## 2026-06-09 Phase 3AY PM Addendum

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Delivery: `/api/bom/workbench` GET summary read path now uses provider-neutral async repository helpers for parent submission summary, draft summary list, active draft detail, and workbench line lookup.
- Code evidence: `src/lib/repositories/bom-workbench-async-repository.ts`, `src/lib/bom-workbench-async.ts`, `src/app/api/bom/workbench/route.ts`, `src/lib/submissions-async.ts`, and `scripts/qc-access-control-async-repository.mjs`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `BOM-WORKBENCH-ASYNC-001` through `BOM-WORKBENCH-ASYNC-008`.
- PM gate result: local non-polluting regression is green for this slice: `qc:access-control-async-repository` 169/169, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build`.
- Data hygiene decision: full `qc:api` was skipped because it repopulates local `P-QC-*` submissions after the user-requested clean reset; business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation; no dev server was listening on 3000/3001/3101.
- Remaining PM risk: BOM draft create/save/active/diff/review/release/export paths, numbering, release package/share/supplier/sandbox, attachment, AI, remaining sync repositories, real Supabase staging/prod validation, advisors/RLS review, Postgres-mode regression, cutover, rollback, and Storage follow-up remain open.
