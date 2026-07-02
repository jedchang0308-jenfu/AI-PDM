# PDM Drawing Submission UI Operation Scenario Report

Generated: 2026-07-02T14:49:05.346Z
Base URL: http://127.0.0.1:3000
Result: 14/14 passed, 0 failed

## Fixture Setup

- D-QC-SUBMIT-MA1: created - Created minimal local D-QC-SUBMIT-MA1 fixture for real UI route checks; setup is not counted as UI evidence. QC-owned fixture rows and local files were removed after browser evidence was captured.
- Fixture setup is test data preparation only; pass/fail evidence comes from browser UI operations and screenshots.

| ID | Status | Scenario | Detail |
|---|---|---|---|
| AUTH-001 | pass | 三種測試角色可用登入頁表單登入 | Engineer / R&D Manager / Admin 均完成 UI 登入 |
| REAL-001 | pass | 從圖號模組點選 QC 專用圖號送審入口 | 導到同一圖號工作台且正式版次被鎖定 |
| REAL-002 | pass | Legacy drawing upload route 不回到泛用上傳表單 | 仍呈現圖面送審工作台 |
| REAL-003 | pass | 泛用 /upload 已退役且導向受控來源 | 未出現空白送審表單 |
| REAL-004 | pass | 既有送審明細導向同一 QC 專用正式紀錄 | 未導到無關圖號 |
| MOCK-READY-001 | pass | 可送審狀態：備註與附件條件控制送出審核 | UI 完成送出審核成功訊息 |
| MOCK-READY-002 | pass | 未選附件時阻擋送審 | 顯示附件需求並鎖住送出 |
| MOCK-BLOCKER-001 | pass | 主資料缺漏 blocker 與同版次 blocker 分層顯示 | 主資料缺漏以中文說明並阻擋送審 |
| MOCK-BLOCKER-002 | pass | Pending / Releasing / Released / History 狀態 UI 分流 | 四種同版次狀態皆完成 UI 模擬 |
| MOCK-RELFAIL-001 | pass | 發行未完成可整理附件並建立修正送審 | 移除、上傳、選取、建立修正送審皆由 UI 完成 |
| MOCK-PERM-001 | pass | 建立修正送審被權限阻擋時顯示中文 | 權限不足由中文說明處理人 |
| MOCK-DETAIL-001 | pass | 送審明細：Pending 取消、非建立者限制、發行未完成角色差異 | 四個明細角色/狀態分支皆完成 UI 操作 |
| MOCK-DETAIL-002 | pass | 送審明細：受限摘要與找不到資料 | 受限與 404 狀態皆以人類中文呈現 |
| RWD-001 | pass | 核心工作台 viewport 無水平 overflow | 1440/1024/768/390 皆完成 UI 檢查 |
