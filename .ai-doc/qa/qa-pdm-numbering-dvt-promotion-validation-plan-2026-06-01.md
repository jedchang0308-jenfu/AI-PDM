# QA 驗證計畫：PDM EVT 到 DVT 晉升清單

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
範圍：`/numbering/dvt`、`/api/numbering/dvt-candidates`、DVT gate evaluator、approval batch

## 驗證範圍

- [x] EVT 候選料號可被列出，並依 DVT gate 分成可送審、待補/override、阻擋。
- [x] 自製/發包/客製件缺主要 MA 圖時不會被批次送審，會留在 EVT 待補。
- [x] 完整資料可批次送入 DVT，建立 `dvt_promotion` approval request 與 approval batch。
- [x] 批次送審後料號、主根與圖號進入 DVT/PendingReview。
- [x] 支援 RD 對 EVT 候選執行保留 EVT、EVT 停用與作廢。
- [x] UI 在桌面與手機 viewport 不得有頁面層水平溢出或 console error。

## 使用者關鍵流程

- [x] RD 開啟 DVT 晉升清單，看到每筆 EVT 料號的主要 MA 圖狀態與缺漏提醒。
- [x] RD 批次勾選完整項目並送審。
- [x] 系統只送出完整項目，不完整項目保留 EVT 草稿。
- [x] RD 可將暫不晉升項目保留 EVT。
- [x] RD 可將不再使用的 EVT 項目停用或作廢。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| 缺 MA 圖項目被送入 DVT | 清單未套用 gate evaluator | DVT 管制失效 | E2E seed 缺 MA 自製件 | `evaluateNumberingGate` 分類，submit 時再驗 gate |
| 批次送審沒有建立 batch | 只建立 request 未組批 | 主管端無法批量審核 | DB 檢查 approval request/batch | repository 內同交易建立 approval requests 與 batch |
| 保留 EVT 被誤更新 | 分流 action 寫錯狀態 | RD 保留項目被推進 DVT | API QC 檢查 phase/status | `keep_evt` 只寫 audit，不改主檔狀態 |
| EVT 停用/作廢未追溯 | 未寫 audit 或 root 狀態不一致 | 後續查詢與報表失真 | API QC 檢查狀態與 audit static | repository 分流時寫 audit 並同步 root closed 狀態 |
| 手機清單溢出 | 表格欄位多 | 現場使用不便 | Playwright 390px `scrollWidth` | 使用 `table-wrap` 橫向容器，避免頁面層 overflow |

## 測試案例

- [x] `tsc --noEmit`：驗證 DVT route、repository、頁面型別。
- [x] `qc:pdm-numbering-core`：驗證 schema seed、repository、DB export、API route、頁面 static check、側欄入口與 package script。
- [x] `qc:pdm-numbering-dvt-ui`：驗證桌面與手機 DVT 晉升流程。
- [x] `lint`：驗證沒有新增 lint error。
- [x] `build`：驗證 `/numbering/dvt` 與 `/api/numbering/dvt-candidates` 納入 production build。

## 通過標準

- [x] 完整 EVT 自製件加主要 MA 圖後可批次送審。
- [x] 缺主要 MA 圖自製件留在 EVT/Draft。
- [x] 批次送審建立 `dvt_promotion` approval request。
- [x] 可用 API 執行保留 EVT 與作廢。
- [x] 可用 UI 執行 EVT 停用。
- [x] 桌面與手機無 console error、無頁面層水平溢出。

## 證據收集方式

- [x] QC 報告：`.ai-doc/qc/qc-pdm-numbering-dvt-promotion-validation-report-2026-06-01.md`。
- [x] `.ai-doc/dev_task.md` 勾選 DVT 晉升清單與驗證項目。
- [x] E2E 測試資料使用 `QCDVT...` 前綴，測試結束後清理。
