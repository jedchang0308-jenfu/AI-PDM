# DEV074-RERUN6 defects

Open P0: 0  
Open P1: 0

本檔只記錄 RERUN6 新缺陷；前輪失敗與修復證據保留於各 run 目錄。

## Closed defects

### DEV074-R6-P1-002 — 圖面辨識 impact 阻擋不可辨識、不可處理

- 發現路徑：C02。
- 現象：頁尾顯示「所有必要候選已核對」，impact modal 僅顯示「阻擋 4 筆」，不列候選欄位、範圍、原因或合法恢復方式，`正式寫入 PDM` 停用。
- 修復：逐筆顯示 blocker 欄位、適用範圍與人類可理解原因；對尚無圖面版次 target 的 pre-submit session，明示可設定歸屬，或以延後／忽略排除。
- 驗證：`qc:dev-068:contract` PASS、`typecheck:app` PASS；rendered UI 見 `screenshots/RD-fix/RD-fix-recognition-blocker-actionability-1440x900.png`。
- 狀態：Closed；RERUN6 仍維持失敗，必須從 W0 新開完整輪次。

## QC 操作事件（非產品缺陷）

- 初次 B07 腳本在取消 POST 尚無回應時主動 navigation，瀏覽器 request #1578 被 abort；當下 active 畫面不構成產品取消失效。
- 依正確步驟等待 rendered UI 顯示「申請已取消。」後重載，工作區進「歷史紀錄」，只讀且取消 CTA disabled。
- B07 最終判定 PASS；`B07-defect-cancelled-workspace-revives-1440x900.png` 僅保留為排除誤判的 QC 操作證據。
