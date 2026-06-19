# SPEC-UX-RD-LIFECYCLE-001：RD 圖號料號物件級生命週期狀態修復

狀態：Implemented  
關聯任務：DEV-UX-RD-LIFECYCLE-001  
建立日期：2026-06-07  
來源：`.ai-doc/reports/qa/qa-rd-lifecycle-ux-validation-report-2026-06-07.md`

## 問題定義

QA 以 RD 視角走過圖號 / 料號開發生命週期後，判定現行 UX 仍無法讓使用者清楚知道「目前這張圖號 / 料號在哪一步、下一步誰要做、卡在哪裡」。既有 `LifecycleStageGuidance` 偏頁面級說明，對實際物件狀態、草稿號碼與後續送審沒有足夠連接。

## 本輪目標

- 將生命週期提示從「頁面概念」補強為「物件級狀態」。
- RD 領號成功後，立即看到此主根 / 料號 / 圖號目前為 Draft、下一步是上傳送審、缺口是尚未建立 submission。
- `/upload` 可承接領號結果帶入的圖號、料號與品名，避免 RD 重新輸入或拿錯號。
- 首頁與圖號待辦需讓 RD 看到「我的開發中圖料 / 待送審草稿」入口，即使尚未形成正式 task。
- 圖料查詢明細需將 Draft / Active / PendingReview / Released / Obsolete 等狀態翻譯成可執行下一步，而不只是 badge。

## 範圍

### In Scope

- 新增可重用 `ObjectLifecycleStatusPanel` UI component。
- 領號結果頁嵌入物件級狀態、缺口與 contextual CTA。
- `/upload` 讀取 query string 並預填 PDM metadata。
- 首頁工作台新增 RD 草稿追蹤區塊。
- 圖號待辦新增待送審草稿區塊。
- 圖料查詢 drawer 在主根明細上方顯示物件級 lifecycle panel。

### Out of Scope

- 不新增 public API。
- 不新增資料表或任務引擎 schema。
- 不改 numbering / submission / BOM release 的核心狀態機。
- AI 不得核准、駁回、放行、廢止或變更狀態。

## UX 驗收標準

- RD 建立新料號後，畫面明確顯示 Draft、目前物件、下一步 CTA 與缺口。
- 從領號結果點「上傳送審」後，`/upload` 已帶入圖號、料號、品名，並標示資料來源為領號草稿。
- RD 回首頁時能看到待送審草稿入口，不會只看到 0 待辦而誤以為無事可做。
- `/numbering/tasks` 即使沒有正式 task，也會顯示待送審草稿，不把草稿生命週期隱藏。
- `/numbering/search` 點選主根明細時，能看到該物件目前狀態、阻塞原因與下一步。

## QA 計畫

- 建立 Draft 圖號 / 料號，確認 result panel 顯示物件級狀態與下一步。
- 點擊 contextual upload CTA，確認 metadata 預填且缺欄位仍清楚標示。
- 使用 Engineer 視角回首頁，確認待送審草稿可見。
- 開啟圖號待辦，確認草稿不會被 0 task 空狀態掩蓋。
- 開啟圖料查詢 drawer，確認 Draft / Active / Released 等狀態有使用者語言與 CTA。

## QC 執行結果

- `npm.cmd run lint`：通過。
- `npm.cmd run qc:pdm-numbering-request-ui`：23/23 通過。
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:dashboard-quick-access`：16/16 通過。
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:dashboard-find-first`：16/16 通過。
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:pdm-numbering-search-ui`：28/28 通過。
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:pdm-numbering-task-center-ui`：22/22 通過。
- Browser smoke：通過，截圖位於 `artifacts/ux-rd-lifecycle-implementation/`。
