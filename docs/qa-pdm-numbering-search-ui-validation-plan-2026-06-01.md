# QA 驗證計畫：PDM 圖料號查詢與明細頁

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
範圍：`/numbering/search`、`/api/numbering/search`、`/api/numbering/roots/[rootCode]`

## 驗證範圍

- [x] RD / 主管 / Admin 登入後可查詢料件主根、料號、圖號。
- [x] 查詢結果可依關鍵字、類型、狀態、階段篩選。
- [x] 點選結果後可開啟同主根明細，顯示料號、圖號、同圖連結、差異欄位、warning 與近期 audit。
- [x] `!` 提醒需能標示 PendingReview、MainDrawingInvalid、OT 圖不可作 MA、查重/高相似 warning、DVT/Release 缺 MA 圖風險。
- [x] MA 圖可觸發作廢影響分析，主管審核可用資訊需包含受影響料號與需進版文件清單。
- [x] 桌面與手機寬度不可有頁面層水平溢出或 console error。

## 使用者關鍵流程

- [x] RD 以主根號或料號查詢，快速確認該料件是否已有號碼與主要 MA 圖。
- [x] RD 點入明細，查看同圖多料號與差異欄位，避免重複領號或誤用。
- [x] 主管或管理員查看 `!` 提醒，確認資料是否需補件、審核或進版。
- [x] 主管在 MA 圖作廢前打開影響範圍，確認受影響料號與文件。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| 查詢漏資料 | API 只查單一表或 filter 寫錯 | RD 以為沒有既有號碼而重複領號 | E2E seed 主根、料號、圖號後逐項查詢 | Search repository 同時查 `part_roots`、`part_numbers`、`drawing_numbers` |
| 明細關聯錯誤 | link / variant join 條件錯誤 | 同圖多料號判斷錯 | E2E 驗證同一 MA 圖連兩料號與差異欄位 | detail API 回傳 links / variants |
| `!` 提醒缺漏 | warning/status 未帶到 UI | 主管審核看不到風險 | static check 與 E2E 檢查 warning marker | detail 回傳 warning，UI 以 `WarningDot` 顯示 |
| MA 作廢影響不可見 | UI 未串 impact-analysis | 作廢前無法判斷進版文件 | E2E 點擊影響範圍並驗證受影響料號 | 查詢頁提供影響範圍按鈕與影響頁區塊 |
| 手機寬度溢出 | table/card 寬度未限制 | 現場使用不易操作 | Playwright 390px 檢查 `scrollWidth` | table 包在 `.table-wrap`，明細使用單欄流式 layout |

## 測試案例

- [x] `tsc --noEmit`：型別檢查 API、repository、UI props。
- [x] `qc:pdm-numbering-core`：靜態驗證 search/detail API、查詢頁與側欄入口。
- [x] `qc:pdm-numbering-search-ui`：Admin 登入、桌面/手機查詢、明細、`!`、MA 影響頁、圖號 filter、console/overflow。
- [x] `lint`：確認沒有新增 lint error。
- [x] `build`：確認 Next route 可建置。

## 通過標準

- [x] 查詢 API 回傳主根、料號、圖號三種 entity。
- [x] 明細 API 回傳 root、parts、drawings、links、variants、warnings、auditTrail。
- [x] UI 可用關鍵字查到 seed 資料並開啟明細。
- [x] 影響範圍按鈕成功呼叫 `/api/numbering/impact-analysis`，並顯示受影響料號。
- [x] 桌面與手機 QC 均無 console error 與頁面層水平溢出。

## 證據收集方式

- [x] 保存本文件作 QA 計畫。
- [x] QC 完成後建立 `docs/qc-pdm-numbering-search-ui-validation-report-2026-06-01.md`。
- [x] 將通過結果回填 `.ai-doc/dev_task.md`。
