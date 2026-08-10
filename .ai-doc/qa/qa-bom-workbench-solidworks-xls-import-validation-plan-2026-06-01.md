# QA Validation Plan - BOM Workbench SolidWorks BOM XLS Import

Date: 2026-06-01

> 2026-08-10 Amendment：`ADR-PDM-MATERIAL-IDENTITY-REVISION-001` 取代本計畫的「料號 + 子件版次」舊合併語意。
> Part Number 無 Revision；新 XLS flow 必須先取得 canonical owner Part Number 與獨立 BOM Rev，並依
> `qa-dev-060-bom-entry-material-identity-validation-plan-2026-08-10.md` 重驗。既有結果只保留為 parser/import 歷史基線。

## 驗證範圍

- `/api/bom/drafts/import-xls` 可由有 Draft 權限的使用者匯入 SolidWorks BOM XLS 類資料並建立新 Draft。
- 每次匯入必須建立新 `bom_drafts`，不得覆蓋既有 Draft。
- 匯入需保存 import profile、import job、原始檔 asset metadata、匯入者、匯入時間、轉換後 BOM lines 與 edit/audit 紀錄。
- 匯入後若經人工校正，來源優先權必須提升為 `manual`，符合 `manual > solidworks_xls > cad_reference`。
- 第一版支援文字型 SolidWorks BOM 匯出：TSV、CSV、Excel HTML、SpreadsheetML XML。
- 第一版不解析舊式二進位 OLE `.xls`，但必須以明確錯誤碼阻擋。

## 使用者關鍵流程

1. 研發或研發主管選擇 canonical owner Part Number 與獨立 BOM Rev；Drawing submission 只能是選配來源證據。
2. 上傳或貼入 SolidWorks BOM XLS 匯出內容。
3. 系統依預設 `solidworks_bom_default` profile 解析料號與數量；通用 `Revision` 欄不得解釋為 Part Number Revision。
4. 系統建立新的 `solidworks_xls` Draft，並可設為 Active Draft。
5. 使用者可在 BOM 工作台看到多 Draft 共存，舊 Draft 不被覆蓋。

## FMEA 風險表

| 風險 | 可能原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| BOM 序號被誤判為料號 | `Item No.` 被放進料號 alias | 匯入錯誤 BOM line | QC 檢查實際 part_number | profile alias 不包含 `Item No.` |
| 重複子件未合併 | 同父層同 Part Number 出現多列 | 數量錯誤 | QC 檢查合併後數量 | 以 parent + Part Number identity 合併，不含 Part Number Revision |
| 原始檔不可追溯 | 只保存檔名、不保存檔案或 hash | audit 不足 | DB 與檔案存在性檢查 | 寫入 repository 並建立 `file_assets` |
| 匯入覆蓋既有 Draft | 用同一 Draft 更新 | RD 無法比對多版本 | 多 Draft API 檢查 | 每次匯入都 insert 新 Draft |
| 人工校正未取得最高優先權 | XLS 匯入後仍保留 `solidworks_xls` source | 後續判讀不清楚何者為人工確認結果 | PATCH 匯入 Draft 後檢查 source/priority | 人工儲存統一寫入 `manual` 與 priority 30 |
| 二進位 XLS 被錯誤解析 | 無 BIFF parser | 產出亂碼 BOM | binary payload QC | 明確回 `BOM_XLS_BINARY_UNSUPPORTED` |

## 測試案例

- TSV 匯入：建立 3 筆 raw row，其中 2 筆同父層同 Part Number，預期轉換為 2 筆 BOM line，數量加總；來源中的 generic revision 值不得形成另一個物料身份。
- Excel HTML 匯入：建立第二份 Draft，預期與第一份 Draft 共存，且最新匯入成為 Active。
- Import metadata：檢查 `bom_import_profiles`、`bom_import_jobs`、`file_assets`、`bom_lines_tree`、`bom_edit_events`、`audit_logs`。
- Manual override：對 XLS Draft 執行 PATCH 校正，預期 Draft source 為 `manual`，line source priority 為 30，並有 `save_tree` event。
- Binary `.xls`：送 OLE header payload，預期 400 且錯誤碼為 `BOM_XLS_BINARY_UNSUPPORTED`。
- Regression：執行既有 BOM workbench foundation，確認 CAD Draft 與 legacy BOM 相容性未破壞。

## 通過標準

- `tsc --noEmit` 通過。
- `npm.cmd run qc:bom-workbench-solidworks-xls-import` 全部通過。
- `npm.cmd run qc:bom-workbench-foundation` 全部通過。
- `npm.cmd run lint` 與 `npm.cmd run build` 通過。

## 證據收集方式

- 保存 QC 腳本輸出總數與通過數。
- 記錄 API HTTP status、Draft line、import job、asset path、profile mapping、edit event、audit log。
- 若失敗，保留錯誤 payload、response body、DB 查詢結果與 server log。
