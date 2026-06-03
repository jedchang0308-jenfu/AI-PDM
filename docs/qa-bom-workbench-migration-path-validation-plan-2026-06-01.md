# QA Validation Plan - BOM Workbench Postgres / Supabase Migration Path

Date: 2026-06-01

## 驗證範圍

- 第一版仍只啟用 SQLite provider，不引入正式 Supabase dependency 或雲端成本。
- BOM Workbench 相關 schema 在 SQLite 與 Postgres shadow schema 都保留等價資料表。
- SolidWorks XLS 匯入原始檔、profile、job、line source metadata 可被未來 Postgres / Supabase Storage adapter 承接。
- Repository contract 必須包含 BOM XLS 匯入與 import job 查詢邊界，避免未來 adapter 缺功能。

## 使用者關鍵流程

1. 第一版使用本機 SQLite 與 repository 檔案保存 BOM 匯入原始檔。
2. 未來切到 Postgres / Supabase 時，schema 有對應 BOM tables、JSONB metadata 與 file asset storage key。
3. 未來切到 Supabase Storage 時，`file_assets.storage_provider/storage_key/content_hash/sync_status` 可承接同步狀態。

## FMEA

| 風險 | 可能原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| SQLite 有 BOM 表但 Postgres 沒有 | shadow schema 未同步 | 未來 migration 缺資料表 | schema static QC | 比對必要 table |
| XLS import metadata 在 Postgres 不能保存 | JSON 欄位型別或欄位缺漏 | 匯入追溯失效 | Postgres schema 檢查 | `mapping_json/error_json` 使用 JSONB |
| 原始檔未來無法搬到 Supabase Storage | 缺 storage key/hash/status | 檔案遷移不可追溯 | file_assets 欄位檢查 | 保留 `supabase_storage`、`storage_key`、`content_hash`、`sync_status` |
| 新 DB adapter 漏實作 XLS import | contract 未列出方法 | 切換 provider 後功能缺失 | contract static QC | 補 `createWorkbenchDraftFromSolidWorksXls` / `getImportJobById` |
| 第一版誤啟用 Supabase | 引入 dependency 或 provider | 產生成本與部署依賴 | package/provider 檢查 | 保持 SQLite-only guard |

## 測試案例

- `TC-BOM-MIG-001`：SQLite 與 Postgres schema 都包含 `bom_drafts`、`bom_lines_tree`、`bom_import_profiles`、`bom_import_jobs`、`file_assets`。
- `TC-BOM-MIG-002`：BOM draft/line source metadata 在兩邊 schema 都存在。
- `TC-BOM-MIG-003`：Postgres import profile/job metadata 使用 JSONB。
- `TC-BOM-MIG-004`：file assets 保留 `supabase_storage`、`storage_key`、`content_hash`、`sync_status`。
- `TC-BOM-MIG-005`：repository contract 包含 XLS import 與 import job 查詢。
- `TC-BOM-MIG-006`：第一版 provider 仍 fail-closed 在 SQLite-only。

## 通過標準

- `npm.cmd run qc:bom-workbench-migration-path` 全部通過。
- `cmd /c node_modules\\.bin\\tsc.cmd --noEmit` 通過。
- `npm.cmd run lint` 通過。
- `git diff --check` 通過或僅 CRLF warning。

## 證據收集方式

- 保存 QC 腳本 JSON 結果。
- 保存 schema/contract 靜態檢查項目與通過數。
- 若失敗，保留缺漏 table/column/method 與對應檔案路徑。
