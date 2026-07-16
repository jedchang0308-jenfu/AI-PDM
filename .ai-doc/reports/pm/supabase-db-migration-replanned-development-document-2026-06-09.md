# AI_PDM Supabase 資料庫遷移重新制定開發文件 - 2026-06-09

關聯任務：`DEV-SUPABASE-DB-001`  
文件類型：PM-dev 開發主文件  
狀態：`In Progress`  
制定日期：2026-06-09  
適用範圍：AI_PDM 資料庫 runtime 由本機 SQLite / Google Drive 輔助流程升級至 Supabase Postgres

## 1. 結論

這次遷移改採「乾淨資料庫起步、資料庫先行、Storage 延後、分切片遷移」。

2026-06-08 已完成本機 `data` reset，舊的 `submission_files`、`release_packages`、QC artifacts、handoff packages、backup snapshots 與 tracked defect register 已依使用者要求清除。因此本計畫不再以「搬舊檔案到 Supabase」為主軸，而是以乾淨 schema、受控 seed、Postgres runtime provider、RLS / advisor / rollback gate 作為正式上線條件。

本任務尚未完成。完成定義不是本機 build pass，而是：

- `AI_PDM_STAGING` 實際建立並通過 live migration / compare / RLS / advisor / API regression。
- `AI_PDM_PROD` 實際建立並通過 production smoke。
- production runtime 寫入與讀回 Supabase Postgres。
- SQLite rollback path 與 rollback drill 有證據。
- Supabase Storage 另開 follow-up 任務，不混入 DB runtime 完成條件。

## 2. 目前基準狀態

### 2.1 已清除資料

已依 reset 計畫清除：

- `C:\VIBE CODING\AI_PDM\data\ai-pdm.sqlite`
- `C:\VIBE CODING\AI_PDM\data\repository`
- `C:\VIBE CODING\AI_PDM\data\release-packages`
- `C:\VIBE CODING\AI_PDM\data\backups`
- `C:\VIBE CODING\AI_PDM\data\quality`
- `C:\VIBE CODING\AI_PDM\data\postgres-shadow-handoffs`
- `data` 底下其他 runtime / QC / handoff / report artifacts
- `C:\VIBE CODING\AI_PDM\data\quality\defect-register.json`

已知原候選資料屬測試 artifacts：

- `submission_files`：80 DB rows、80 local files、declared size 1,930 bytes。
- `release_packages`：21 DB rows、21 local zip files、declared size 39,844 bytes。
- `file_assets`：0 rows。
- 檔名多為 `QC-*`、`TEST-*`、`UIE2E-*`、`REUSE-*`、`GEO-*`。

結論：本次 Supabase DB 遷移不搬遷這批舊檔案與舊資料。

### 2.2 已完成本機能力

目前已具備：

- `supabase/migrations` 本機 migration mirror。
- `npm.cmd run supabase:migrations:sync`。
- `npm.cmd run qc:supabase-runtime-migrations`。
- Postgres target guard，阻擋 `ProJED` / `ProJED_TEST`。
- `db/postgres/001_initial_schema.sql`。
- `db/postgres/002_supabase_rls_plan.sql`。
- Async DB provider contract。
- SQLite async adapter。
- Postgres async adapter minimum implementation。
- async auth / role guard pilot。
- 多批 API route 已由 sync auth guard 轉向 async guard。
- 本機 `db:postgres:compare -- --no-write`、`qc:postgres-shadow`、`build`、`qc:api` 已在多個切片中通過。

尚未具備：

- 使用者確認 Supabase organization、region、cost。
- 新建 `AI_PDM_STAGING`。
- 新建 `AI_PDM_PROD`。
- Supabase CLI 或 live project migration history。
- 對真實 Supabase target 的 Postgres-mode API regression。
- Supabase advisor 實際證據。
- production cutover 與 rollback drill。

## 3. 核心決策

### 3.1 DB-first，不做 Storage-first

本任務只處理資料庫 runtime：schema、repository、server API、RLS、advisor、seed、compare、backup / rollback。Supabase Storage 另開任務。

理由：

- 檔案本體已清空，沒有真實 production 檔案需要遷移。
- Storage 牽涉 private bucket、signed URL、preview/download、hash、Google Drive retirement，風險面不同。
- DB runtime 是 PDM workflow、權限、稽核、BOM、numbering 的主幹，應先穩定。

### 3.2 只使用 AI_PDM 專用 Supabase target

允許：

- `AI_PDM_STAGING`
- `AI_PDM_PROD`

禁止：

- `ProJED`
- `ProJED_TEST`
- 任何非空 public schema
- 任何非 AI_PDM 專用 target
- 未經 target guard 的 migration apply

### 3.3 Browser 不直接打 Supabase base table

AI_PDM browser 仍只呼叫 Next.js server API。Server API 透過 DB provider 存取 SQLite 或 Supabase Postgres。

不得把以下內容放入 frontend bundle：

- Supabase service role key
- database password
- pooler URL
- admin URL
- migration secret

### 3.4 保留 SQLite fallback

SQLite 在遷移期間不是終態，但必須保留為：

- local development fallback
- regression baseline
- cutover rollback path
- staging 問題隔離工具

## 4. 開發分期

### Phase 0：Clean Baseline

目標：確保沒有舊測試資料與舊 runtime artifacts 被搬進 Supabase。

狀態：已完成。

Gate：

- `data` reset 完成。
- `db:init` 能建立乾淨 SQLite runtime。
- demo seed 只在需要 demo / QC 時使用，不進 production。
- Git tracked deletion 的 `data/quality/defect-register.json` 被視為刻意刪除。

### Phase 1：Migration Mirror 與 Target Guard

目標：讓 `db/postgres` schema 可轉為 Supabase migration mirror，且不會誤打既有 Supabase project。

狀態：本機能力已完成，live target 尚未完成。

交付：

- `supabase/migrations/20260608000100_initial_ai_pdm_schema.sql`
- `supabase/migrations/20260608000200_force_rls_deny_direct_access.sql`
- `supabase/migrations/manifest.json`
- `supabase/README.md`
- target guard fail-closed 規則

Gate：

- `npm.cmd run supabase:migrations:sync`
- `npm.cmd run qc:supabase-runtime-migrations`
- `npm.cmd run db:postgres:compare -- --no-write`
- `npm.cmd run qc:postgres-shadow-target-guard`
- `npm.cmd run qc:postgres-shadow`

### Phase 2：Async DB Provider

目標：把 runtime DB access 抽成 provider-neutral async contract。

Provider：

```text
PDM_DB_PROVIDER=sqlite|postgres
PDM_POSTGRES_URL=
PDM_POSTGRES_ADMIN_URL=
PDM_POSTGRES_POOLER_MODE=direct|session|transaction
PDM_SUPABASE_TARGET_NAME=
```

Contract：

```ts
query<T>(sql, params): Promise<T[]>
queryOne<T>(sql, params): Promise<T | null>
execute(sql, params): Promise<void>
transaction<T>(fn): Promise<T>
```

Gate：

- SQLite adapter contract pass。
- Postgres adapter local QC pass。
- 沒有 `PDM_POSTGRES_URL` 時 live probe 必須明確 skipped，不可假裝通過 live target。
- Supabase transaction pooler 模式下不可使用會造成相容性問題的 named prepared statements。

### Phase 3：Repository 與 Route 漸進遷移

目標：逐步移除 API route 對 sync SQLite helper 的依賴，改往 async provider-neutral repository / guard。

順序：

1. auth / users / sessions / audit。
2. settings / Google Drive settings admin route。
3. search / notifications / read-only domain routes。
4. submissions lifecycle。
5. submission files / preview / discussions / issues / changes / phase gates / approval matrix。
6. BOM materialize / read / diff / export。
7. BOM workbench draft / review / release export。
8. numbering write path / approval workflow。
9. release package / share / supplier response / file metadata。
10. repository 寫入層全面 async 化。

每個切片的必備規則：

- 不改 API response contract，除非另有 SPEC。
- 不放寬權限。
- 不拿掉 audit semantics。
- 不一次改完整 domain，除非該 domain 已有足夠 QC 覆蓋。
- 每個切片都要新增或擴充 static QC，證明未回退 sync auth。

每個切片的基本 Gate：

- `npm.cmd run qc:access-control-async-repository`
- `npx.cmd tsc --noEmit`
- `npm.cmd run qc:managed-auth`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run build`
- 相關 domain QC
- 需要時跑 `npm.cmd run qc:api`
- 需要時跑 `npm.cmd run db:postgres:compare -- --no-write`
- 需要時跑 `npm.cmd run qc:postgres-shadow`

### Phase 4：AI_PDM_STAGING Live Validation

目標：建立真實 Supabase staging target，證明 Postgres mode 可跑。

前置條件：

- 使用者確認 Supabase organization。
- 使用者確認 region。
- 使用者確認 cost。
- 不使用 `ProJED` / `ProJED_TEST`。

操作：

1. 建立 `AI_PDM_STAGING`。
2. 設定 `PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING`。
3. 設定 server-only `PDM_POSTGRES_URL` 與 admin-only `PDM_POSTGRES_ADMIN_URL`。
4. 跑 target guard。
5. 套用 migrations。
6. 套用受控 seed。
7. 跑 compare。
8. 跑 RLS deny-by-default 檢查。
9. 跑 Supabase security advisor。
10. 跑 Supabase performance advisor。
11. 跑 Postgres-mode API regression。
12. 跑 build。
13. 跑 smoke。

Exit criteria：

- migration history 可追溯。
- compare 無 schema mismatch。
- 所有 public tables enable + force RLS。
- `anon` / `authenticated` 不可直接讀寫 base tables。
- advisor 無 P0/P1 blocker。
- Postgres-mode API regression 通過。
- SQLite fallback 仍可跑基本 regression。

### Phase 5：AI_PDM_PROD Cutover

目標：production runtime 切到 Supabase Postgres。

前置條件：

- Phase 4 全部通過。
- production env secret 已以 server-side 方式管理。
- rollback drill 已設計完成。
- 使用者核准 cutover window。

操作：

1. 建立 `AI_PDM_PROD`。
2. 跑 prod target guard。
3. 套用 migrations。
4. 套用 production seed。
5. 設定 `PDM_DB_PROVIDER=postgres`。
6. 跑 production smoke。
7. 驗證新增資料實際寫入 Supabase Postgres。
8. 驗證讀回、權限、audit、BOM、numbering、release 主要流程。
9. 封存 cutover evidence。

Exit criteria：

- production smoke pass。
- Supabase advisor 無未處理 blocker。
- rollback 指令與 SQLite fallback snapshot 可用。
- PM / RD / QA / QC 文件全部更新。

### Phase 6：Supabase Storage Follow-up

目標：在 DB runtime 穩定後，再處理檔案本體與 Google Drive retirement。

另開任務，不併入 `DEV-SUPABASE-DB-001` 完成條件。

初步範圍：

- private bucket design。
- upload/download/preview API 改造。
- signed URL / content disposition。
- content hash / file metadata。
- Google Drive pending / released flow retirement。
- 舊 Google Drive setting UI 的轉換策略。

## 5. 風險清單

| 風險 | 影響 | 控制方式 |
|---|---|---|
| 誤把測試資料搬到 Supabase | 汙染 staging / production | 已 reset，DB migration 從乾淨 schema 與受控 seed 開始 |
| 誤用既有 `ProJED` / `ProJED_TEST` | 破壞非 AI_PDM project | target guard fail closed，live apply 前必跑 |
| RLS 設錯 | 資料暴露或 workflow 壞掉 | deny-by-default、force RLS、advisor gate、API regression |
| Secret 外洩到 frontend | 高權限外洩 | Browser 只打 server API，secret 只放 server env |
| SQLite / Postgres SQL dialect 差異 | runtime bug | provider contract QC、Postgres SQL normalization、staging API regression |
| Pooler 模式相容性問題 | production 連線不穩 | Postgres adapter 避免 named prepared statements，staging 測 pooler mode |
| 一次改太多 route | regression 難定位 | 以 route / repository slice 推進，每片都有 QC |
| 未來仍需修改 | 使用者誤以為一次完成 | 本文件明確列出遷移期、上線期、維護期修改 |
| Storage 被混入 DB cutover | 範圍失控 | Storage follow-up 獨立建任務 |
| Rollback 無證據 | cutover 失敗難復原 | production 前必做 rollback drill |

## 6. 未來是否還要修改

會，而且是計畫內工作，不是異常。

遷移期必要修改：

- 逐步把 sync repository 改為 async provider-neutral repository。
- 補 Postgres-mode API regression。
- 補 target guard、secret boundary、RLS、advisor gate。
- 修正 SQLite / Postgres SQL dialect 差異。
- 調整 seed 與 migration history。

上線前必要修改：

- production env 設定。
- backup / restore / rollback SOP。
- advisor remediation。
- performance index / slow query remediation。
- PM / RD / QA / QC evidence 補齊。

DB 上線後 follow-up：

- Supabase Storage。
- Google Drive flow retirement。
- 監控、備份、restore drill。
- schema 變更管制。
- 成本與連線池調校。

## 7. PM-dev 文件治理

本文件是 2026-06-09 後的第一入口。既有文件仍保留作為詳細 evidence：

- PM 任務主控：`.ai-doc/dev_task.md`
- SPEC：`.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
- ADR：`.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`
- RD 計畫：`.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md`
- QA 計畫：`.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md`
- QC 計畫：`.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md`
- PM package：`.ai-doc/reports/pm/pm-supabase-db-migration-development-package-2026-06-08.md`
- 舊 master document：`.ai-doc/reports/pm/supabase-db-migration-master-development-document-2026-06-08.md`
- Docs index：`.ai-doc/reports/pm/supabase-db-migration-development-docs-index-2026-06-08.md`
- Runtime plan：`.ai-doc/reports/industrialization/supabase-runtime-migration-plan-2026-06-08.md`
- Supabase mirror：`supabase/README.md`
- Postgres schema：`db/postgres/README.md`

## 8. 下一個建議開發切片

2026-06-09 更新：下列切片已作為 `Phase 3AI` 執行並通過本機 SQLite-mode / BOM domain regression。`Phase 3AH` 已保留給本文件化切片，因此實作 evidence 使用 `Phase 3AI`。

範圍：BOM workbench / drafts / reviews / release export route async guard migration。

候選 routes：

- `src/app/api/bom/workbench/route.ts`
- `src/app/api/bom/drafts/from-assembly/route.ts`
- `src/app/api/bom/drafts/import-xls/route.ts`
- `src/app/api/bom/drafts/[draftId]/route.ts`
- `src/app/api/bom/drafts/[draftId]/active/route.ts`
- `src/app/api/bom/drafts/[draftId]/diff/route.ts`
- `src/app/api/bom/drafts/[draftId]/submit-review/route.ts`
- `src/app/api/bom/reviews/pending/route.ts`
- `src/app/api/bom/reviews/[reviewId]/approve/route.ts`
- `src/app/api/bom/reviews/[reviewId]/reject/route.ts`
- `src/app/api/bom/releases/[releaseId]/export/route.ts`

建議 Gate：

- `npm.cmd run qc:access-control-async-repository`
- `npx.cmd tsc --noEmit`
- `npm.cmd run qc:managed-auth`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run qc:bom-workbench-foundation`
- `npm.cmd run qc:bom-workbench-tree-rules`
- `npm.cmd run qc:bom-workbench-release-gate-resubmit`
- `npm.cmd run qc:bom-workbench-solidworks-xls-import`
- `npm.cmd run db:postgres:compare -- --no-write`
- `npm.cmd run qc:postgres-shadow`
- `npm.cmd run build`
- `npm.cmd run qc:api`

實際 Gate：

- `npm.cmd run qc:access-control-async-repository`：64/64 pass。
- `npx.cmd tsc --noEmit`：pass。
- `npm.cmd run qc:managed-auth`：18/18 pass。
- `npm.cmd run lint -- --quiet`：pass。
- `npm.cmd run build`：pass，保留既有 Turbopack NFT warning。
- `npm.cmd run db:postgres:compare -- --no-write`：64/64 tables，no mismatch。
- `npm.cmd run qc:postgres-shadow`：22/22 pass。
- `npm.cmd run qc:bom-workbench-foundation`：27/27 pass。
- `npm.cmd run qc:bom-workbench-tree-rules`：22/22 pass。
- `npm.cmd run qc:bom-workbench-release-gate-resubmit`：43/43 pass。
- `npm.cmd run qc:bom-workbench-solidworks-xls-import`：34/34 pass。
- `npm.cmd run qc:bom-workbench-release-export`：21/21 pass。
- `npm.cmd run qc:bom-workbench-review-release`：25/25 pass。
- `npm.cmd run qc:bom-workbench-released-only-permission`：31/31 pass。
- `npm.cmd run qc:api`：391/391 pass。

## 9. 暫不執行事項

目前不執行：

- 不建立 Supabase project，直到使用者確認 organization / region / cost。
- 不連 `ProJED` / `ProJED_TEST`。
- 不搬遷舊檔案。
- 不切 production env。
- 不把 Supabase Storage 併入 DB runtime 任務。
- 不宣稱 `DEV-SUPABASE-DB-001` 完成。

## 10. 完成定義

`DEV-SUPABASE-DB-001` 只有在以下全部成立時才能關閉：

- `AI_PDM_STAGING` live migration pass。
- `AI_PDM_STAGING` Postgres-mode API regression pass。
- `AI_PDM_STAGING` security / performance advisor 無 release blocker。
- `AI_PDM_PROD` migration apply pass。
- production runtime 以 `PDM_DB_PROVIDER=postgres` 運作。
- production smoke 證明資料寫入並讀回 Supabase Postgres。
- SQLite fallback / rollback drill 有證據。
- Supabase Storage follow-up 已建任務並明確排除於 DB runtime 完成條件外。
- PM / RD / QA / QC 文件都更新到最新狀態。

## 11. 2026-06-09 Phase 3AJ Status Update

Phase 3AJ has been completed as the next controlled local migration slice after Phase 3AI.

Scope:
- Submission auxiliary routes: `reuse-candidates`, `duplicate-geometry`, `retry-upload`, `sandbox`, `sandbox/[branchId]`, `pdf-markups`, and `pdf-markups/[markupId]`.
- Numbering approval batch detail route: `numbering/approval-batches/[batchId]`.

Implemented:
- Submission auxiliary routes now use `requireAuthAsync` / `requireRoleAsync`.
- Retry upload now uses async system setting lookup and async audit logging.
- Numbering approval batch detail now uses `requireNumberingPageAsync` and `canUserUseNumberingActionAsync`.
- `scripts/qc-access-control-async-repository.mjs` now includes `ROUTE-AUTH-ASYNC-021` and `ROUTE-AUTH-ASYNC-022`.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 66/66 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run qc:managed-auth`: 18/18 pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run qc:pdm-numbering-core`: 238/238 pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64 SQLite tables and 64 Postgres tables, no missing tables, no RLS-missing tables, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass with the existing Turbopack NFT warning.
- `npm.cmd run qc:api`: 391/391 pass with a temporary local server that was stopped and cleaned afterward.

Current state after Phase 3AJ:
- Direct sync `@/lib/auth` imports/calls are cleared from `src/app/api` route files.
- Remaining local Phase 3 work is now concentrated in sync numbering permission guard routes and sync domain repositories.
- Live Supabase staging/prod validation, advisors/RLS review, Postgres-mode API regression, cutover, and rollback evidence remain open.

## 12. 2026-06-09 Phase 3AK Status Update

Phase 3AK has been completed as the next controlled local migration slice after Phase 3AJ.

Scope:
- Remaining numbering API routes under `src/app/api/numbering`.
- Numbering-adjacent parts API routes under `src/app/api/parts/[partNumber]`.

Implemented:
- Remaining numbering API route permission guards now use `requireNumberingPageAsync`, `requireNumberingActionAsync`, or `canUserUseNumberingActionAsync`.
- Parts detail, attachments, attachment sync/delete, variant update, and cost profile create routes now use async numbering permission guards.
- `numbering/admin/matrix` and `numbering/approval-decisions` no longer import `forbidden` from sync `@/lib/auth`.
- `scripts/qc-access-control-async-repository.mjs` now includes recursive route scans with `ROUTE-AUTH-ASYNC-023` and `ROUTE-AUTH-ASYNC-024`.

Verified:
- Full API sync guard search returned no matches.
- `npm.cmd run qc:access-control-async-repository`: 68/68 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run qc:managed-auth`: 18/18 pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run qc:pdm-numbering-core`: 238/238 pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64 SQLite tables and 64 Postgres tables, no missing tables, no RLS-missing tables, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass with the existing Turbopack NFT warning.
- `npm.cmd run qc:api`: 391/391 pass with a temporary local server that was stopped and cleaned afterward.

Current state after Phase 3AK:
- API route files no longer contain direct sync auth imports/calls or sync numbering permission guard calls.
- Remaining local Phase 3 work is now concentrated in async/provider-neutral domain repository conversion and live Supabase target validation.
- Live Supabase staging/prod validation, advisors/RLS review, Postgres-mode API regression, cutover, rollback evidence, and Storage follow-up remain open.

## 13. 2026-06-09 Phase 3AL Status Update

Phase 3AL has been completed as the first focused provider-neutral domain repository conversion after API route guard migration.

Scope:
- Item revision history read route.
- Item where-used read route.

Implemented:
- Added `AsyncItemInsightRepository` with provider-neutral SQL for revision history and where-used.
- Added runtime helper `src/lib/item-insights-async.ts` using `getAsyncDatabaseClient`.
- Updated `/api/items/[partNumber]/revisions` and `/api/items/[partNumber]/where-used` to await async repository helpers instead of importing sync helpers from `@/lib/db`.
- Made where-used ordering and child lookup portable by avoiding SQLite-only `datetime(...)` and `rowid`.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 75/75 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run qc:managed-auth`: 18/18 pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.
- `npm.cmd run qc:api`: 391/391 pass with a temporary local dev server that was stopped afterward.

Still incomplete:
- Remaining sync domain repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 26. 2026-06-09 Phase 3AY Status Update

Phase 3AY has been completed as a bounded BOM workbench summary read provider-neutral repository conversion.

Scope:
- BOM workbench parent summary lookup.
- BOM workbench draft summary list.
- Active draft detail lookup.
- Active draft line lookup with joined part name.
- `/api/bom/workbench` GET route async migration.

Implemented:
- Added `AsyncBomWorkbenchRepository` with provider-neutral BOM workbench read SQL.
- Added `src/lib/bom-workbench-async.ts` runtime helpers.
- Updated `src/app/api/bom/workbench/route.ts` to use async submission and BOM workbench helpers.
- Expanded `scripts/qc-access-control-async-repository.mjs` with static and semantic checks for the migrated BOM workbench summary read slice.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 169/169 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation.
- No dev server was listening on 3000/3001/3101 after validation.

Still incomplete:
- BOM draft create/save/active/diff/review/release/export paths.
- Numbering, release package/share/supplier/sandbox, attachment, AI, and remaining sync repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 25. 2026-06-09 Phase 3AX Status Update

Phase 3AX has been completed as a bounded submission create/write provider-neutral repository conversion.

Scope:
- Drawing/revision duplicate lookup.
- Item upsert.
- Submission creation.
- Submission file and file reference insertion.
- Submit audit action.
- BOM header/line materialization from assembly component file references.
- `/api/submissions` POST route async migration.

Implemented:
- Added `AsyncSubmissionWriteRepository` with provider-neutral submission create/write SQL and bounded BOM materialization.
- Extended `src/lib/submissions-async.ts` with `submissionRevisionExistsAsync` and `createSubmissionRecordAsync`.
- Updated `src/app/api/submissions/route.ts` to use async submission write, system setting, and file upload status helpers.
- Expanded `scripts/qc-access-control-async-repository.mjs` with static and semantic checks for the migrated submission write slice.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 161/161 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation.
- No dev server was listening on 3000/3001/3101 after validation.

Still incomplete:
- BOM workbench/domain repositories.
- Numbering, release package/share/supplier/sandbox, attachment, AI, and remaining sync repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 24. 2026-06-09 Phase 3AW Status Update

Phase 3AW has been completed as a bounded approve release decision provider-neutral repository conversion.

Scope:
- Active sandbox branch blocking.
- Approval decision insert, duplicate reviewer lookup, and approval summary check.
- Required phase gate and approval matrix release blockers.
- Release status lifecycle from Pending to Releasing, ReleaseFailed, or Released.
- Current item revision update and previous release obsolescence.
- Release package record upsert and released filename conflict lookup.
- Approve route migration away from sync DB helpers.

Implemented:
- Extended async submission status helpers for active sandbox and release lifecycle operations.
- Added async release record helpers for release package and filename conflict SQL.
- Added async release and release package services that keep the existing Google Drive and zip packaging integration points.
- Updated `/api/submissions/[id]/approve` to use async submission, approval, collaboration, status, release, package, and audit helpers.
- Expanded access-control async QC with static and SQLite semantic checks for the approve release flow.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 153/153 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business, BOM, approval, collaboration, release, and sandbox runtime tables remained at 0 after validation.
- No dev server was listening on 3000/3001/3101 after validation.

Still incomplete:
- Submission create/write/upload.
- BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 14. 2026-06-09 Phase 3AM Status Update

Phase 3AM has been completed as a small read-only dashboard metrics provider-neutral repository conversion.

Scope:
- `/api/submissions` GET dashboard metrics.

Implemented:
- Added `AsyncDashboardRepository` with provider-neutral scoped status-count SQL.
- Added runtime helper `src/lib/dashboard-metrics-async.ts` using `getAsyncDatabaseClient`.
- Updated `/api/submissions` GET to await `getDashboardMetricsAsync(submittedBy)`.
- Left submission list, search, create, upload, and write paths on existing sync repositories for later bounded slices.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 81/81 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.

Still incomplete:
- Submission list/search/write async repository conversion.
- BOM, numbering, release, collaboration, attachment, and AI repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 15. 2026-06-09 Phase 3AN Status Update

Phase 3AN has been completed as a small read-only submission list provider-neutral repository conversion.

Scope:
- `/api/submissions` GET submission list.

Implemented:
- Added `AsyncSubmissionListRepository` with provider-neutral list SQL for SQLite and Postgres.
- Added runtime helper `src/lib/submissions-async.ts` using `getAsyncDatabaseClient`.
- Updated `/api/submissions` GET to await `listSubmissionsAsync({ status, submittedBy, limit: limit + 1, offset })`.
- Preserved pagination, status filter, submittedBy scoping, `hasMore`, dashboard metrics, and existing POST/write behavior.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 87/87 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.

Still incomplete:
- `searchSubmissions` async repository conversion.
- Submission detail/create/write/upload paths.
- BOM, numbering, release, collaboration, attachment, and AI repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 16. 2026-06-09 Phase 3AO Status Update

Phase 3AO has been completed as a small read-only submission search provider-neutral repository conversion.

Scope:
- `/api/search` submission search.

Implemented:
- Extended `AsyncSubmissionListRepository` with provider-neutral search SQL for SQLite and Postgres.
- Added runtime helper `searchSubmissionsAsync` in `src/lib/submissions-async.ts`.
- Updated `/api/search` to await `searchSubmissionsAsync(...)` instead of importing sync `searchSubmissions` from `@/lib/db`.
- Preserved query threshold, status/finder filters, submittedBy scoping, child part/drawing filters, outdated/unreleased BOM issue filters, and `{ submissions }` response shape.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 94/94 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business tables remained at 0 after validation.

Still incomplete:
- Submission detail/create/write/upload paths.
- BOM, numbering, release, collaboration, attachment, and AI repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 17. 2026-06-09 Phase 3AP Status Update

Phase 3AP has been completed as a small read-only submission detail provider-neutral repository conversion.

Scope:
- `/api/submissions/[id]` GET submission detail.

Implemented:
- Extended `AsyncSubmissionListRepository` with provider-neutral detail SQL and `getSubmission(id)`.
- Added runtime helper `getSubmissionAsync` in `src/lib/submissions-async.ts`.
- Updated `/api/submissions/[id]` GET to await `getSubmissionAsync(id)` instead of importing sync `getSubmission` from `@/lib/db`.
- Preserved authorization, 404 behavior, response envelope, files, references, approvals, audit logs, active lock, release package, and BOM detail payload.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 101/101 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business tables remained at 0 after validation.

Still incomplete:
- Submission create/write/upload paths and file/download routes.
- BOM, numbering, release, collaboration, attachment, and AI repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 18. 2026-06-09 Phase 3AQ Status Update

Phase 3AQ has been completed as a small submission file metadata provider-neutral repository conversion.

Scope:
- Submission file metadata lookup/update.
- File download/preview metadata authorization through `file-response`.
- Retry upload metadata lookup and Google Drive status updates.
- File-id validation for PDF markup, discussion, and issue creation routes.

Implemented:
- Added `AsyncSubmissionFileRepository` with provider-neutral `submission_files` lookup, upload queue, and status update SQL.
- Added runtime helper `src/lib/submission-files-async.ts`.
- Updated `src/lib/file-response.ts` to use `getSubmissionAsync` and `getSubmissionFileAsync`.
- Updated retry upload to use `getSubmissionAsync`, `getFilesNeedingUploadAsync`, and `updateFileGDriveStatusAsync`.
- Updated PDF markup, discussion, and issue routes to use async submission/file metadata helpers for validation.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 108/108 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business and collaboration tables remained at 0 after validation.

Still incomplete:
- Submission create/write/upload and collaboration write/list repositories.
- BOM, numbering, release, attachment, and AI repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 19. 2026-06-09 Phase 3AR Status Update

Phase 3AR has been completed as a bounded collaboration provider-neutral repository conversion.

Scope:
- Discussion comment list/create/resolve.
- Review issue list/create/resolve.
- PDF markup list/create/resolve.
- Issue assignee lookup through async auth/user repository helper.

Implemented:
- Added `AsyncCollaborationRepository` with provider-neutral SQL for discussion comments, review issues, PDF markups, and audit-backed create/resolve operations.
- Added runtime helper `src/lib/collaboration-async.ts`.
- Added `getUserByIdAsync` in `src/lib/auth-async.ts`.
- Updated discussion, issue, and PDF markup collection/detail routes to use async collaboration helpers and avoid direct sync DB imports.
- Expanded `scripts/qc-access-control-async-repository.mjs` with static and semantic checks for the migrated collaboration slice.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 116/116 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business, BOM, and collaboration runtime tables remained at 0 after validation.
- No dev server was listening on 3000/3001/3101 after validation.

Still incomplete:
- Submission create/write/upload.
- Change request, phase gate, approval matrix, BOM, numbering, release, attachment, AI, and other domain repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 20. 2026-06-09 Phase 3AS Status Update

Phase 3AS has been completed as a bounded change request provider-neutral repository conversion.

Scope:
- Change request list.
- Change request create.
- Change request approve/reject/close decision.
- Change request audit actions.

Implemented:
- Extended `AsyncCollaborationRepository` with provider-neutral change request SQL and list/get/create/decide methods.
- Extended `src/lib/collaboration-async.ts` with change request runtime helpers.
- Updated `src/app/api/submissions/[id]/changes/route.ts` and `src/app/api/submissions/[id]/changes/[changeId]/route.ts` to use async submission and change request helpers.
- Expanded `scripts/qc-access-control-async-repository.mjs` with static and semantic checks for the migrated change request slice.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 123/123 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business, BOM, and collaboration runtime tables remained at 0 after validation.
- No dev server was listening on 3000/3001/3101 after validation.

Still incomplete:
- Submission create/write/upload.
- Phase gate, approval matrix, BOM, numbering, release, attachment, AI, and other domain repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 21. 2026-06-09 Phase 3AT Status Update

Phase 3AT has been completed as a bounded phase gate provider-neutral repository conversion.

Scope:
- Phase gate list.
- Phase gate default initialization.
- Phase gate complete/waive decision.
- Open required phase gate helper.
- Phase gate audit actions.

Implemented:
- Extended `AsyncCollaborationRepository` with provider-neutral phase gate SQL, default checks, list/get/initialize/decide methods, and open-required helper.
- Extended `src/lib/collaboration-async.ts` with phase gate runtime helpers.
- Updated `src/app/api/submissions/[id]/phase-gates/route.ts` and `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts` to use async submission and phase gate helpers.
- Expanded `scripts/qc-access-control-async-repository.mjs` with static and semantic checks for the migrated phase gate slice.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 130/130 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business, BOM, and collaboration runtime tables remained at 0 after validation.
- No dev server was listening on 3000/3001/3101 after validation.

Still incomplete:
- Submission create/write/upload.
- Approval matrix, BOM, numbering, release, attachment, AI, and other domain repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 22. 2026-06-09 Phase 3AU Status Update

Phase 3AU has been completed as a bounded approval matrix provider-neutral repository conversion.

Scope:
- Approval matrix list.
- Approval matrix default/custom initialization.
- Approval matrix refresh and automatic satisfied state.
- Approval matrix waive decision.
- Open required approval matrix helper.
- Approval matrix audit actions.

Implemented:
- Added `AsyncApprovalRepository` with provider-neutral approval matrix SQL, default requirements, list/get/initialize/refresh/waive methods, and open-required helper.
- Added `src/lib/approval-async.ts` with approval matrix runtime helpers.
- Updated `src/app/api/submissions/[id]/approval-matrix/route.ts` and `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts` to use async submission and approval matrix helpers.
- Expanded `scripts/qc-access-control-async-repository.mjs` with static and semantic checks for the migrated approval matrix slice.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 137/137 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business, BOM, and collaboration runtime tables remained at 0 after validation.
- No dev server was listening on 3000/3001/3101 after validation.

Still incomplete:
- Submission create/write/upload.
- Approve/reject release decision flows.
- BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.

## 23. 2026-06-09 Phase 3AV Status Update

Phase 3AV has been completed as a bounded reject release decision provider-neutral repository conversion.

Scope:
- Reviewer duplicate decision lookup.
- Approval decision insertion.
- Approval summary aggregation helper.
- Reject status update.
- Reject audit action.
- `/api/submissions/[id]/reject` route async migration.

Implemented:
- Extended `AsyncApprovalRepository` with provider-neutral approval decision SQL and async add/lookup/summary methods.
- Extended `src/lib/approval-async.ts` with approval decision runtime helpers.
- Added `AsyncSubmissionStatusRepository` and `src/lib/submission-status-async.ts` for bounded reject status updates.
- Updated `src/app/api/submissions/[id]/reject/route.ts` to use async submission, approval, status, and audit helpers.
- Expanded `scripts/qc-access-control-async-repository.mjs` with static and semantic checks for the migrated reject decision slice.

Verified:
- `npm.cmd run qc:access-control-async-repository`: 144/144 pass.
- `npx.cmd tsc --noEmit`: pass.
- `npm.cmd run lint -- --quiet`: pass.
- `npm.cmd run db:postgres:compare -- --no-write`: 64/64 table coverage, no mismatches.
- `npm.cmd run qc:postgres-shadow`: 22/22 pass.
- `npm.cmd run build`: pass, with the existing Turbopack NFT tracing warning.

Data hygiene:
- Full `npm.cmd run qc:api` was intentionally skipped in this slice because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Business, BOM, approval, and collaboration runtime tables remained at 0 after validation.
- No dev server was listening on 3000/3001/3101 after validation.

Still incomplete:
- Submission create/write/upload.
- Approve release decision flow.
- BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and other domain repositories.
- Live `AI_PDM_STAGING` and `AI_PDM_PROD` validation.
- Supabase advisor/RLS review.
- Real Postgres-mode API regression.
- Production cutover, rollback evidence, and Storage follow-up.
