# AI_PDM Supabase 資料庫遷移主控開發文件 - 2026-06-08

DEV 任務：`DEV-SUPABASE-DB-001`  
狀態：`In Progress`  
範圍：將 AI_PDM 的資料庫 runtime 由本機 SQLite / Google Drive 時代的資料持久層，逐步升級為 Supabase Postgres。  
不在本階段範圍：Supabase Storage 檔案搬遷、正式生產切換、未經驗證的真實客戶資料導入。

2026-06-09 更新：重新制定後的第一入口為 `.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md`。本文件保留為 2026-06-08 master evidence 與歷史主控文件。

## 1. 開發目標

本次遷移的真正目標不是「把檔案搬到雲端」，而是把 AI_PDM 的資料層改成可受控、可驗證、可 rollback 的 Postgres runtime。

核心成果：

- 清除既有測試 runtime 資料，避免把 QC / demo / handoff 假資料帶進 Supabase。
- 保留 SQLite fallback，讓開發與 rollback 還有本機可用模式。
- 建立 Supabase 對應 schema、migration mirror、target guard、RLS baseline 與 QC gate。
- 把 API / repository 逐步改為 provider-neutral async DB path。
- 先完成 staging 驗證，再進 production cutover。

## 2. 已完成的前置清理

2026-06-08 已完成 full data reset 規劃與執行方向確認。

清理對象：

- `C:\VIBE CODING\AI_PDM\data\ai-pdm.sqlite`
- `C:\VIBE CODING\AI_PDM\data\repository`
- `C:\VIBE CODING\AI_PDM\data\release-packages`
- `C:\VIBE CODING\AI_PDM\data\backups`
- `C:\VIBE CODING\AI_PDM\data\quality`
- `C:\VIBE CODING\AI_PDM\data\postgres-shadow-handoffs`
- 其他 `data` 下 runtime / QC / handoff / report 資料夾
- `C:\VIBE CODING\AI_PDM\data\quality\defect-register.json`

清理依據：

- `submission_files`：80 筆 DB rows，80 個 local files，宣告總大小 1,930 bytes。
- `release_packages`：21 筆 DB rows，21 個 zip files，宣告總大小 39,844 bytes。
- `file_assets`：0 筆。
- 檔名多為 `QC-*`、`TEST-*`、`UIE2E-*`、`REUSE-*`、`GEO-*`。

判定：目前沒有需搬遷的正式 PDM 檔案資料。Supabase Storage 必須從空狀態開始，未來只收真實上傳。

## 3. 架構決策

### 3.1 DB-first，不先做 Storage-first

先遷移資料庫 runtime，檔案 storage 另立 follow-up。

原因：

- 目前清理後沒有正式檔案資產需要搬遷。
- DB schema、權限、audit、workflow 是 PDM 的核心一致性來源。
- Storage 若先做，容易把測試檔與錯誤 metadata 固化到雲端。

### 3.2 Server API 直接連 Postgres，不讓前端直打 Supabase Data API

AI_PDM 現階段應維持：

- Browser 只呼叫 Next.js server API。
- Server API 使用受控環境變數連 Supabase Postgres。
- 不把 service role、database password、pooler URL 放到 frontend bundle。

這符合 Supabase 官方安全原則：前端只能使用 publishable key；secret / service role / DB credentials 不可暴露在前端。Supabase 文件也明確要求 exposed schema 的 table 啟用 RLS，並由使用者負責 access management、data 與 security controls。

參考：

- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Securing your data: https://supabase.com/docs/guides/database/secure-data
- Supabase Shared Responsibility Model: https://supabase.com/docs/guides/deployment/shared-responsibility-model

### 3.3 必須有 target guard

禁止誤用既有 `ProJED` / `ProJED_TEST` 作為 AI_PDM staging / production。

必要 target：

- `AI_PDM_STAGING`
- `AI_PDM_PROD`

任何 migration apply、compare、QC live probe 都必須先通過 target identity guard。

### 3.4 SQLite fallback 保留到 production cutover 後

SQLite 不是最終 production runtime，但在遷移期有三個用途：

- 本機快速開發。
- regression baseline。
- production cutover rollback 緊急路徑。

## 4. 現有開發成果

已建立或已更新的核心開發項目：

- `supabase/migrations` migration mirror。
- `npm.cmd run supabase:migrations:sync`。
- `npm.cmd run qc:supabase-runtime-migrations`。
- Postgres target guard。
- `src/lib/db-async-provider.ts` async DB provider selector。
- SQLite async adapter。
- Postgres async adapter。
- async repository pilots：
  - system settings
  - access control
  - users
  - audit
- async helper pilots：
  - auth
  - audit
  - numbering permission
  - system settings
- 已遷移部分 API route 到 async guard / async repository path：
  - `/api/auth/login`
  - `/api/auth/token`
  - `/api/auth/me`
  - `/api/auth/logout`
  - `/api/settings`
  - `/api/settings/gdrive/folders`
  - `/api/settings/gdrive/folders/verify`
  - `/api/file-metadata/detect`
  - `/api/handoff`
  - `/api/handoff/export`
  - `/api/search`
  - `/api/notifications`
  - numbering permission 相關 read path

目前仍非完成狀態，因為尚未完成 real Supabase staging / production validation。

## 5. 開發階段計畫

### Phase 0：資料歸零與 baseline

目標：確保不把測試資料搬到 Supabase。

完成條件：

- `data` 已完整 reset。
- `npm.cmd run db:init` 可建立乾淨 SQLite baseline。
- 不執行 demo seed，除非測試明確需要。
- Git 可清楚顯示 `data/quality/defect-register.json` 是預期刪除。

### Phase 1：Supabase schema mirror

目標：讓本地 `db/postgres` schema 能同步生成 Supabase migration mirror。

完成條件：

- `supabase/migrations` 與 `db/postgres/*.sql` hash 可追溯。
- `qc:supabase-runtime-migrations` 通過。
- RLS baseline 以 SQL / README / QC gate 記錄。

### Phase 2：runtime provider 抽象

目標：把 sync SQLite runtime 逐步替換成 async provider-neutral DB client。

完成條件：

- `PDM_DB_PROVIDER=sqlite` 預設可用。
- `PDM_DB_PROVIDER=postgres` 缺少 `PDM_POSTGRES_URL` 時 fail closed。
- SQLite async path 與既有 API regression 不破壞。
- Postgres adapter 支援 query、queryOne、execute、transaction、named parameter normalization。

### Phase 3：repository / route 漸進遷移

目標：逐步移除 server route 對 `@/lib/db` sync aggregate 的依賴。

已完成 slice：

- auth login/token/me/logout。
- settings 與 Google Drive settings admin guard。
- file metadata detect。
- handoff / handoff export。
- search / notifications。
- numbering permission read path。

後續 slice：

- item detail / revisions / where-used read-only routes。
- submission lifecycle routes。
- numbering write paths。
- approval workflow routes。
- BOM workbench routes。
- release package / file metadata repository。
- user create/update/password mutation helpers。

完成條件：

- 每個 slice 都要有 QC static guard。
- 每個 slice 都要跑 typecheck、managed-auth、lint、build、API regression。
- 不一次大改全部 repository，避免行為 diff 難以追。

### Phase 4：Supabase staging

目標：建立真實 `AI_PDM_STAGING`，驗證 schema、RLS、advisor、API parity。

必要步驟：

1. 確認 Supabase organization、region、cost。
2. 建立 staging project 或 branch。
3. 設定 `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING`。
4. 設定 server-only `PDM_POSTGRES_URL`。
5. 執行 migration apply。
6. 執行 target guard。
7. 執行 compare。
8. 執行 RLS / advisor 檢查。
9. 執行 Postgres-mode API regression。
10. 記錄 rollback 演練結果。

完成條件：

- Postgres live probe 不再 skipped。
- Supabase security advisor 無 release blocker。
- API regression 在 Postgres mode 通過。
- SQLite fallback 仍可通過 baseline QC。

### Phase 5：production cutover

目標：將 production runtime 切到 `AI_PDM_PROD`。

必要前提：

- staging 全部 gate 通過。
- prod target guard 通過。
- prod migration apply 有紀錄。
- prod smoke test 通過。
- rollback route 有演練，不只是文件。
- Storage follow-up 不阻塞 DB runtime，但必須另列 DEV 任務。

## 6. 驗證計畫

每個開發 slice 最低驗證：

- `npm.cmd run qc:access-control-async-repository`
- `npm.cmd run qc:system-settings-async-repository`
- `npm.cmd run qc:db-provider-contract`
- `npm.cmd run qc:db-provider-postgres`
- `npm.cmd run qc:managed-auth`
- `npx.cmd tsc --noEmit`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build`
- `npm.cmd run qc:api`

staging / production 額外驗證：

- `npm.cmd run db:postgres:guard -- --phase pre-migration`
- `npm.cmd run db:postgres:compare -- --require-postgres`
- `npm.cmd run qc:postgres-shadow`
- Supabase security advisor
- Supabase performance advisor
- Postgres-mode API regression
- rollback drill

## 7. 主要風險與控制

| 風險 | 影響 | 控制方式 |
|---|---|---|
| 誤把測試資料搬到 Supabase | 汙染 staging / production | 已先 full data reset；Storage 從空狀態開始 |
| 誤連既有 Supabase project | 破壞 `ProJED` / `ProJED_TEST` | target guard fail closed |
| secret 外洩到前端 | 高資安風險 | 只允許 server API 持有 DB URL / secret |
| RLS 缺漏 | exposed schema 可被錯誤讀寫 | 所有 public table 必須 enable RLS；advisor 為 cutover gate |
| SQLite / Postgres SQL 差異 | runtime bug | provider contract QC、Postgres adapter normalization、API parity |
| 一次性大改造成 regression | 難以定位錯誤 | 以 route/repository slice 漸進遷移 |
| connection pool 設定不當 | latency 或連線耗盡 | staging 壓測與 `PDM_POSTGRES_MAX_CONNECTIONS` gate |
| rollback 只寫文件沒演練 | cutover 失敗時無法恢復 | production 前必須完成 rollback drill |

## 8. 未來是否還要修改

會，需要分三類修改：

1. 遷移期必要修改
   - 繼續把 sync SQLite repository 換成 async provider-neutral repository。
   - 補齊 Postgres-mode API regression。
   - 補齊 live staging / prod guard。

2. 上線前必要修改
   - RLS policies 依角色與資料邊界收斂。
   - migration history 由 Supabase CLI / project history 驗證。
   - secrets / env / deployment 設定。
   - production rollback drill。

3. 上線後維護修改
   - performance indexes。
   - slow query / advisor remediation。
   - Storage follow-up。
   - backup / restore drill。
   - schema 變更管制。

結論：目前不是一次改完，而是進入受控遷移期。未來修改是預期工作，不是計畫失敗。

## 9. 完成定義

`DEV-SUPABASE-DB-001` 不能只因為 local build passed 就關閉。必須同時滿足：

- `AI_PDM_STAGING` live validation 通過。
- `AI_PDM_PROD` cutover 通過。
- Postgres runtime provider 成為 production runtime。
- SQLite fallback / rollback 演練有證據。
- Supabase security advisor / performance advisor 無 release blocker。
- API regression 在 SQLite 與 Postgres mode 都通過。
- Storage follow-up 已另建任務，不混入 DB runtime 完成定義。

## 10. 文件索引

本文件是主控文件，細節文件如下：

- PM package：`C:\VIBE CODING\AI_PDM\.ai-doc\reports\pm\pm-supabase-db-migration-development-package-2026-06-08.md`
- RD plan：`C:\VIBE CODING\AI_PDM\.ai-doc\reports\rd\rd-supabase-db-migration-development-plan-2026-06-08.md`
- QA plan：`C:\VIBE CODING\AI_PDM\.ai-doc\qa\qa-supabase-db-migration-validation-plan-2026-06-08.md`
- QC plan：`C:\VIBE CODING\AI_PDM\.ai-doc\qc\qc-supabase-db-migration-fact-check-plan-2026-06-08.md`
- Docs index：`C:\VIBE CODING\AI_PDM\.ai-doc\reports\pm\supabase-db-migration-development-docs-index-2026-06-08.md`
- Spec：`C:\VIBE CODING\AI_PDM\.ai-doc\specs\SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
- ADR：`C:\VIBE CODING\AI_PDM\.ai-doc\decisions\ADR-SUPABASE-DB-001-runtime-provider-and-target.md`
- Runtime migration plan：`C:\VIBE CODING\AI_PDM\.ai-doc\reports\industrialization\supabase-runtime-migration-plan-2026-06-08.md`
- Supabase mirror：`C:\VIBE CODING\AI_PDM\supabase\README.md`
- Postgres schema：`C:\VIBE CODING\AI_PDM\db\postgres\README.md`

## 11. 2026-06-08 Phase 3V Development Evidence

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission file download and PDF preview route async auth guard migration.
- Delivery: `src/app/api/submissions/[id]/files/[...filePath]/route.ts` now uses `await requireAuthAsync(request)` and preserves both `/files/[fileId]` download and `/files/preview/[fileId]` PDF preview behavior.
- Preserved behavior: `getStoredSubmissionFile`, `buildFileResponse`, attachment download disposition, inline PDF preview disposition, PDF content type, and non-PDF preview `415`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-008` for the two submission file routes.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 52/52, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `AUTH-003` and `FILE-001` through `FILE-005` covered unauthenticated blocking, download response, attachment disposition, PDF preview response, PDF content type, and inline disposition.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression, production cutover, and rollback evidence.

## 12. 2026-06-08 Phase 3W Development Evidence

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission discussions and review issues route async auth guard migration.
- Delivery: `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/discussions/[commentId]/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, and `src/app/api/submissions/[id]/issues/[issueId]/route.ts` now use `await requireAuthAsync(request)` instead of sync `requireAuth`.
- Preserved behavior: `getSubmission`, `canReadSubmission`, discussion create/list/resolve, issue create/list/resolve, file validation, assignee validation, and existing response status contracts.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-009` for the four discussion/issue routes.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 53/53, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `DISCUSS-001` through `DISCUSS-014` and `ISSUE-001` through `ISSUE-013` covered unauthenticated blocking, create/list/resolve behavior, file validation, manager visibility, and engineer scope isolation.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression, production cutover, and rollback evidence.

## 13. 2026-06-08 Phase 3X Development Evidence

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission change request route async auth and role guard migration.
- Delivery: `src/app/api/submissions/[id]/changes/route.ts` GET now uses `await requireAuthAsync(request)`, POST uses `await requireRoleAsync(request, ["Engineer", "R&D Manager", "Admin"])`, and `src/app/api/submissions/[id]/changes/[changeId]/route.ts` PATCH uses `await requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Preserved behavior: `getSubmission`, `canReadSubmission`, `listChangeRequests`, `createChangeRequest`, `decideChangeRequest`, ECR/ECO/ECN validation, manager decision metadata, and duplicate-decision conflict handling.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-010` for the two change routes.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 54/54, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHANGE-001` through `CHANGE-017` covered unauthenticated blocking, validation, create/list behavior, decision role denial, manager approval, decision metadata, duplicate-decision conflict, and engineer scope isolation.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression, production cutover, and rollback evidence.

## 14. 2026-06-08 Phase 3Y Development Evidence

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission phase gate route async auth and role guard migration.
- Delivery: `src/app/api/submissions/[id]/phase-gates/route.ts` GET now uses `await requireAuthAsync(request)`, POST uses `await requireRoleAsync(request, ["R&D Manager", "Admin"])`, and `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts` PATCH uses `await requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Preserved behavior: `getSubmission`, `canReadSubmission`, `listPhaseGateChecks`, `initializePhaseGateChecks`, `buildPhaseGateSummary`, `getPhaseGateCheck`, `decidePhaseGateCheck`, required-check blocking, decision validation, duplicate-decision conflict, and release readiness.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-011` for the two phase gate routes.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 55/55, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `PHASE-001` through `PHASE-013` covered unauthenticated blocking, role denial, initialization, summary counts, approval blocking, phase decisions, ready summary, duplicate-decision conflict, and release flow.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression, production cutover, and rollback evidence.

## 15. 2026-06-08 Phase 3Z Development Evidence

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission approval matrix route async auth and role guard migration.
- Delivery: `src/app/api/submissions/[id]/approval-matrix/route.ts` GET now uses `await requireAuthAsync(request)`, POST uses `await requireRoleAsync(request, ["R&D Manager", "Admin"])`, and `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts` PATCH uses `await requireRoleAsync(request, ["R&D Manager", "Admin"])`.
- Preserved behavior: `getSubmission`, `canReadSubmission`, `refreshApprovalMatrixRequirements`, `initializeApprovalMatrixRequirements`, `buildApprovalMatrixSummary`, `parseRequirements`, `getApprovalMatrixRequirement`, `waiveApprovalMatrixRequirement`, required-role validation, waiver flow, and matrix release gating.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-012` for the two approval matrix routes.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 56/56, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning after a clean rerun, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `MATRIX-001` through `MATRIX-015` covered unauthenticated blocking, role denial, initialization, summary counts, Manager/Admin approvals, release gating, Admin waiver, and manager-only release after waiver.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression, production cutover, and rollback evidence.

## 16. 2026-06-08 Phase 3AA Development Evidence

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission preflight lock route async role guard migration.
- Delivery: `src/app/api/submissions/preflight-lock/route.ts` POST now uses `await requireRoleAsync(request, ["Engineer", "Admin"])` instead of sync `requireRole`.
- Preserved behavior: drawing/part number body parsing and validation, `findActiveItemLockForSubmissionIdentifiers`, `locked`, `lockedByCurrentUser`, `matchedBy`, and `lock` response payload.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-013` for the preflight lock route.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 57/57, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHECKOUT-010` through `CHECKOUT-016` covered unauthenticated blocking, owner preflight behavior, non-owner active lock detection, and lock owner exposure.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression, production cutover, and rollback evidence.

## 17. 2026-06-08 Phase 3AB Development Evidence

- Status: `DEV-SUPABASE-DB-001` remains in progress.
- Completed slice: submission checkout route async role guard migration.
- Delivery: `src/app/api/submissions/[id]/checkout/route.ts` POST and DELETE now use `await requireRoleAsync(request, ["Engineer", "Admin"])` instead of sync `requireRole`.
- Preserved behavior: submission visibility checks, `createItemLock`, `releaseItemLock`, reason/hour validation, lock reuse, competing lock conflict payload, admin force release, and release response.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-014` for the checkout route.
- Verification: `npm.cmd run qc:access-control-async-repository` passed 58/58, `npx.cmd tsc --noEmit` passed, `npm.cmd run qc:managed-auth` passed 18/18, `npm.cmd run lint -- --quiet` passed, `npm.cmd run build` passed with the existing Turbopack NFT warning, and `npm.cmd run qc:api` passed 391/391 with a temporary local dev server.
- Runtime evidence: `qc:api` `CHECKOUT-001` through `CHECKOUT-009` covered unauthenticated blocking, Manager denial, Engineer acquire/reuse, competing conflict owner exposure, and release behavior.
- Remaining gates: additional sync API/repository migration, configured live Supabase staging/prod validation, Supabase advisors/RLS review, Postgres-mode API regression, production cutover, and rollback evidence.

## 18. 2026-06-08 Phase 3AC Development Evidence

- Scope: approve/reject async role guard migration and file preview route stabilization.
- Code: `src/app/api/submissions/[id]/approve/route.ts` and `src/app/api/submissions/[id]/reject/route.ts` now use `requireRoleAsync` for R&D Manager/Admin access.
- Code: `src/app/api/submissions/[id]/files/[...filePath]/route.ts` handles both download and preview URL shapes, fixing the observed `/files/preview/[fileId]` runtime 404 while preserving API compatibility.
- Behavior preserved: approval status gates, duplicate reviewer blocking, phase gate and matrix blocking, two-reviewer release, package creation, lifecycle obsolete marking, reject status/reason/audit behavior, attachment download, PDF inline preview, and non-PDF preview rejection.
- Verification: access-control 59/59, TypeScript, managed-auth 18/18, lint, build with the existing Turbopack NFT warning, and redirected API QC 391/391.
- Remaining overall gates: Supabase staging/prod configuration, advisors/RLS review, Postgres-mode API regression, remaining sync route/repository migration, cutover, and rollback evidence.

## 19. 2026-06-09 Phase 3AD Development Evidence

- Scope: release package, read-only share, and supplier response route async guard migration.
- Code: `src/app/api/submissions/[id]/release-package/route.ts` now uses `requireAuthAsync`; share and supplier response management routes now use `requireRoleAsync` for R&D Manager/Admin.
- Behavior preserved: package ZIP download, share creation/list redaction/revoke, public share metadata/package behavior, supplier response list/close, Engineer denial, Manager access, and duplicate close conflict.
- Verification: access-control 60/60, TypeScript, managed-auth 18/18, lint, build with the existing Turbopack NFT warning, and redirected API QC 391/391.
- Remaining overall gates: Supabase staging/prod configuration, advisors/RLS review, Postgres-mode API regression, remaining sync route/repository migration, cutover, and rollback evidence.

## 20. 2026-06-09 Phase 3AE Development Evidence

- Scope: AI submission summary and AI risk route async auth guard migration.
- Code: `src/app/api/submissions/[id]/ai-summary/route.ts` and `src/app/api/submissions/[id]/ai-risks/route.ts` now use `requireAuthAsync`.
- Behavior preserved: summary generation, risk hint generation, submission visibility, scoped submitter display, Engineer own access, Manager access, cross-engineer denial, BOM/Where-used sources, and duplicate filename risk detection.
- Verification: access-control 61/61, TypeScript, managed-auth 18/18, lint, build with the existing Turbopack NFT warning, and redirected API QC 391/391.
- Remaining overall gates: Supabase staging/prod configuration, advisors/RLS review, Postgres-mode API regression, remaining sync route/repository migration, cutover, and rollback evidence.

## 21. 2026-06-09 Phase 3AF Development Evidence

- Scope: submission list, create, and detail route async auth/role guard migration.
- Code: `src/app/api/submissions/route.ts` GET now uses `requireAuthAsync`, POST now uses `requireRoleAsync` for Engineer/Admin, and `src/app/api/submissions/[id]/route.ts` GET now uses `requireAuthAsync`.
- Behavior preserved: list pagination/status filtering, Engineer `scopedSubmittedBy` scoping, dashboard metrics scoping, form/file validation, duplicate drawing/revision 409, CAD reference parsing, local file save/cleanup, background Google Drive upload, detail visibility, and cross-engineer 403.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-018` for the submission list/create/detail routes.
- Verification: access-control 62/62, TypeScript, managed-auth 18/18, lint, build with the existing Turbopack NFT warning after a clean rerun, Postgres shadow compare with 64/64 table coverage and no mismatches, Postgres shadow QC 22/22, and redirected API QC 391/391.
- Remaining overall gates: Supabase staging/prod configuration, advisors/RLS review, Postgres-mode API regression against a real target, remaining sync route/repository migration, cutover, and rollback evidence.

## 22. 2026-06-09 Phase 3AG Development Evidence

- Scope: submission BOM materialize/read/diff/export route async auth guard migration.
- Code: `src/app/api/submissions/[id]/bom/route.ts`, `src/app/api/submissions/[id]/bom/diff/route.ts`, and `src/app/api/submissions/[id]/bom/export/route.ts` now use `requireAuthAsync`.
- Behavior preserved: `canReadSubmission` authorization, BOM materialization from CAD references, existing BOM read, missing BOM handling, previous/explicit base diff selection, CSV export, XLS Spreadsheet XML export, content headers, UTF-8 BOM CSV output, filename sanitization, and cross-engineer 403.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-019` for the three submission BOM routes.
- Verification: access-control 63/63, TypeScript, managed-auth 18/18, lint, build with the existing Turbopack NFT warning, Postgres shadow compare with 64/64 table coverage and no mismatches, Postgres shadow QC 22/22, and redirected API QC 391/391.
- Remaining overall gates: Supabase staging/prod configuration, advisors/RLS review, Postgres-mode API regression against a real target, remaining sync route/repository migration including BOM repository async conversion, cutover, and rollback evidence.

## 23. 2026-06-09 Phase 3AI Development Evidence

- Scope: BOM workbench, draft, review, and release export route async guard migration.
- Code: `/api/bom/workbench`, `/api/bom/drafts/from-assembly`, `/api/bom/drafts/import-xls`, `/api/bom/drafts/[draftId]`, `/api/bom/drafts/[draftId]/active`, `/api/bom/drafts/[draftId]/diff`, `/api/bom/drafts/[draftId]/submit-review`, and `/api/bom/releases/[releaseId]/export` now use `requireAuthAsync`.
- Code: `/api/bom/reviews/pending`, `/api/bom/reviews/[reviewId]/approve`, and `/api/bom/reviews/[reviewId]/reject` now use `requireRoleAsync(request, ["R&D Manager", "Admin"])` and no longer keep route-local role checks.
- Behavior preserved: workbench summary, draft creation from assembly, SolidWorks XLS import, draft detail/save/active/diff/submit-review, pending review list, approve/reject with release gates, released snapshot CSV/XLSX export, draft permission checks, released-only Manufacturing/Procurement export access, edit events, and audit logs.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-020` for the BOM workbench/draft/review/release route group.
- Verification: access-control 64/64, TypeScript, managed-auth 18/18, lint, build with the existing Turbopack NFT warning, Postgres shadow compare with 64/64 table coverage and no mismatches, Postgres shadow QC 22/22, BOM workbench foundation 27/27, tree rules 22/22, release gate/resubmit 43/43, SolidWorks XLS import 34/34, release export 21/21, review/release 25/25, released-only permission 31/31, and redirected API QC 391/391.
- Remaining overall gates: Supabase staging/prod configuration, advisors/RLS review, Postgres-mode API regression against a real target, BOM repository async conversion, remaining sync route/repository migration, cutover, and rollback evidence.

## 24. 2026-06-09 Phase 3AJ Development Evidence

- Scope: submission auxiliary routes and numbering approval batch detail route async guard migration.
- Code: `/api/submissions/[id]/reuse-candidates`, `/duplicate-geometry`, `/retry-upload`, `/sandbox`, `/sandbox/[branchId]`, `/pdf-markups`, and `/pdf-markups/[markupId]` now use async auth/role guards.
- Code: `/api/submissions/[id]/retry-upload` now uses async system setting lookup and async audit logging.
- Code: `/api/numbering/approval-batches/[batchId]` now uses `requireNumberingPageAsync` and `canUserUseNumberingActionAsync`.
- Behavior preserved: design reuse and duplicate geometry scoping, retry upload pending folder fallback and success/failure counts, sandbox branch create/list/merge/promote/close, PDF markup validation and resolve flow, and numbering approval batch read/decide/resubmit behavior.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-021` and `ROUTE-AUTH-ASYNC-022`.
- Verification: access-control 66/66, TypeScript, managed-auth 18/18, lint, numbering core 238/238, Postgres shadow compare with 64/64 table coverage and no mismatches, Postgres shadow QC 22/22, build with the existing Turbopack NFT warning, and redirected API QC 391/391.
- Static cleanup evidence: direct sync `@/lib/auth` import/call search under `src/app/api` returned no matches.
- Remaining overall gates: Supabase staging/prod configuration, advisors/RLS review, Postgres-mode API regression against a real target, remaining sync numbering permission guard migration, repository async conversion, cutover, and rollback evidence.

## 25. 2026-06-09 Phase 3AK Development Evidence

- Scope: remaining numbering API route permission guards and numbering-adjacent parts API route permission guards.
- Code: all remaining `src/app/api/numbering/**/route.ts` sync numbering permission guard calls now use `requireNumberingPageAsync`, `requireNumberingActionAsync`, or `canUserUseNumberingActionAsync`.
- Code: `src/app/api/parts/[partNumber]/**/route.ts` numbering-adjacent routes now use async numbering permission guards for part detail, attachments, attachment sync/delete, variant update, and cost profile creation.
- Code: `numbering/admin/matrix` and `numbering/approval-decisions` no longer import `forbidden` from sync `@/lib/auth`; they import through `@/lib/auth-async`.
- QC expansion: `scripts/qc-access-control-async-repository.mjs` now recursively scans numbering API routes and parts API numbering-adjacent routes via `ROUTE-AUTH-ASYNC-023` and `ROUTE-AUTH-ASYNC-024`.
- Verification: full API sync guard search returned no matches, access-control 68/68, TypeScript, managed-auth 18/18, lint, numbering core 238/238, Postgres shadow compare with 64/64 table coverage and no mismatches, Postgres shadow QC 22/22, build with the existing Turbopack NFT warning, and redirected API QC 391/391.
- Remaining overall gates: Supabase staging/prod configuration, advisors/RLS review, Postgres-mode API regression against a real target, repository/provider async conversion, production cutover, rollback evidence, and Supabase Storage follow-up.
