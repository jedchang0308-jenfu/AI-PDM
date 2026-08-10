# QC Fact Report - BOM Workbench SolidWorks BOM XLS Import

> Historical evidence note (2026-08-10)：本報告的「同料號同版次」是 legacy 實作證據。
> `ADR-PDM-MATERIAL-IDENTITY-REVISION-001` 已改為同父層依 Part Number identity 合併，Part Number 本身無 Revision；
> DEV-060 必須以新的 canonical owner／BOM Rev／XLS QA plan 重驗。下列 PASS 不可作為新治理規則的完成證據。

Date: 2026-06-01

## 驗證結論

通過。SolidWorks BOM XLS 匯入 API 可建立新的 `solidworks_xls` Draft、保留原始檔與 import metadata、保存轉換後 BOM lines，且不覆蓋既有 Draft。

## 執行項目

| 項目 | 結果 | 證據 |
|---|---|---|
| TypeScript strict check | Pass | `cmd /c node_modules\\.bin\\tsc.cmd --noEmit` exit 0 |
| SolidWorks XLS import QC | Pass | `npm.cmd run qc:bom-workbench-solidworks-xls-import` 34/34 passed |
| BOM workbench foundation regression | Pass | `npm.cmd run qc:bom-workbench-foundation` 27/27 passed |
| Lint | Pass | `npm.cmd run lint` exit 0 |
| Production build | Pass | `cmd /c npm.cmd run build` exit 0 |
| Whitespace check | Pass | `git diff --check` exit 0；僅 CRLF warning |

## 實際結果

- TSV 匯入回 201，Draft source 為 `solidworks_xls`。
- 同料號同版次重複列已合併，子件 A 數量由 2 + 3 合併為 5。
- 子件版次保留，子件 B revision 為 `B`。
- Import job `row_count` 為 3，保存原始檔名、匯入者、匯入時間與 metadata JSON。
- `file_assets` 保存原始檔 asset row，且 repository path 實際存在。
- `bom_lines_tree` 保存 `source = solidworks_xls`、`source_priority = 20`、`source_filename`。
- 第二次 HTML XLS 匯入建立另一個 Draft，workbench 保留兩個 Draft，最新 Draft 成為 Active，舊 Draft 未被覆蓋。
- 對 XLS Draft 執行人工校正後，Draft source 為 `manual`，line source priority 為 30，數量校正為 6，並寫入 `save_tree` event 與 `BomWorkbenchDraftSaved` audit log。
- 二進位 OLE `.xls` payload 回 400，錯誤碼為 `BOM_XLS_BINARY_UNSUPPORTED`。
- 匯入流程寫入 `import_solidworks_xls` edit event 與 `BomWorkbenchDraftImported` audit log。

## 問題與阻塞

- 已發現並修正 profile alias 問題：`Item No.` 不應視為料號欄位，避免把 BOM 序號匯入成 part number。
- 第一版未支援舊式二進位 BIFF/OLE `.xls` 解析；目前以明確錯誤碼要求使用者匯出 TSV、CSV、Excel HTML 或 SpreadsheetML。
