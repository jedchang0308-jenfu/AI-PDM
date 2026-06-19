# QA 驗證計畫：PDM MA 圖作廢影響範圍頁

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
範圍：`/numbering/impact`、`/api/numbering/impact-analysis`

## 驗證範圍

- [x] 管理員或主管可輸入 MA 圖號與作廢原因，先產生影響分析，不直接異動主檔。
- [x] 影響頁需顯示受影響料號、品名、料件類型、階段與目前狀態。
- [x] 影響頁需顯示文件進版待辦，讓主管審核可看到相關文件類型。
- [x] 套用失效前需勾選確認，避免誤操作。
- [x] 套用失效後，受影響料號需轉為 `MainDrawingInvalid`，MA 圖轉 `Obsolete`。
- [x] 桌面與手機寬度不可有頁面層水平溢出或 console error。

## 使用者關鍵流程

- [x] 主管輸入即將作廢的 MA 圖號。
- [x] 主管檢查受影響料號、狀態與文件進版待辦。
- [x] 主管填寫原因並確認後套用失效。
- [x] 系統保留影響分析與套用失效 audit。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| 影響料號漏列 | link 查詢未限主要 MA 或 join 錯誤 | 作廢後部分料號未進版 | E2E seed 一張 MA 圖對兩料號 | 直接使用既有 impact-analysis API |
| 套用前誤異動 | UI 查詢按鈕直接 apply | RD/主管誤把料號失效 | E2E 分析後檢查需勾選才能套用 | UI 分析與套用分離，套用需 checkbox |
| 狀態不可見 | 表格未顯示目前狀態 | 主管無法判斷風險 | E2E 檢查 Active/Released 料號列 | 受影響表格顯示 `recordStatus` |
| 文件進版待辦缺漏 | requiredDocuments 未呈現 | RD 不知道後續文件需進版 | E2E 檢查 Released PDF package | UI 顯示 requiredDocuments checklist |
| 手機版溢出 | table 未包覆 | 現場審核難使用 | 390px Playwright 檢查 `scrollWidth` | table 使用 `.table-wrap` |

## 測試案例

- [x] `tsc --noEmit`：檢查影響頁型別。
- [x] `qc:pdm-numbering-core`：靜態驗證 impact page、側欄入口、QC script。
- [x] `qc:pdm-numbering-impact-ui`：Admin 登入、桌面/手機 MA 圖分析、受影響料號、文件進版待辦、套用失效、DB 狀態、console/overflow。
- [x] `lint`：確認無新增 lint error。
- [x] `build`：確認 Next route 可建置。

## 通過標準

- [x] 分析時不直接作廢主檔。
- [x] 受影響料號與文件待辦完整顯示。
- [x] 套用失效需使用者確認。
- [x] 套用後 DB 中受影響料號為 `MainDrawingInvalid`。
- [x] 桌面與手機 QC 均無 console error 與頁面層水平溢出。

## 證據收集方式

- [x] 保存本文件作 QA 計畫。
- [x] QC 完成後建立 `.ai-doc/qc/qc-pdm-numbering-impact-ui-validation-report-2026-06-01.md`。
- [x] 將通過結果回填 `.ai-doc/dev_task.md`。
