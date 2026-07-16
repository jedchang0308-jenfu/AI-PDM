# QC Fact Report - BOM Workbench Postgres / Supabase Migration Path

Date: 2026-06-01

## 驗證結論

通過。BOM Workbench 第一版仍為 SQLite-only，但 schema、file asset metadata 與 repository contract 已保留未來 Postgres / Supabase / Supabase Storage 遷移路徑。

## 執行項目

| 項目 | 結果 | 證據 |
|---|---|---|
| Migration path static QC | Pass | `npm.cmd run qc:bom-workbench-migration-path` 21/21 passed |
| TypeScript | Pass | `cmd /c node_modules\\.bin\\tsc.cmd --noEmit` exit 0 |
| Lint | Pass | `npm.cmd run lint` exit 0 |

## 實際結果

- SQLite 與 Postgres schema 都包含 `bom_drafts`、`bom_lines_tree`、`bom_import_profiles`、`bom_import_jobs`、`file_assets`。
- Draft source enum 在 SQLite / Postgres 均保留 `cad_reference`、`solidworks_xls`、`manual`。
- BOM line metadata 均保留 `source_priority`、`source_ref_id`、`source_filename`。
- Postgres `bom_import_profiles.mapping_json` 與 `bom_import_jobs.error_json` 使用 JSONB。
- `file_assets` 保留 `supabase_storage`、`storage_key`、`content_hash`、`sync_status`。
- BOM repository 匯入流程會寫入 `file_assets`，保存 original path、storage key 與 hash。
- `BomRepository` contract 已包含 `createWorkbenchDraftFromSolidWorksXls` 與 `getImportJobById`。
- 第一版仍未引入 `@supabase/supabase-js`，`db-provider` 對非 SQLite provider 會 fail closed。

## 問題與阻塞

- 無本輪阻塞。
- 這不是實際 Supabase migration 測試；正式 shadow migration 仍依賴 DEV-IND-007 的 disposable target。
