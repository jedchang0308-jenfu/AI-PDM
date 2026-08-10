# PDM Drawing Submission UI Real Operation QC Report

Generated: 2026-08-10T07:04:27.388Z
Branch: 持續優化1
Base URL: http://127.0.0.1:64670
Run ID: 2026-08-10T07-03-45-016Z
Result: 0/27 UI cases passed, 27 failed
Global gates: 4/5 passed
Temp fixture cleanup: removed

## Scope Notes

- D-0014-MA1 was not used as a required fixture.
- Fixture setup used an isolated temporary SQLite data directory and repository.
- Counted proof comes from rendered browser UI operations and screenshots.

## UI Cases

| ID | Status | Scenario | Evidence / Error |
|---|---|---|---|
| UI26-001 | fail | 四種角色可從登入畫面進入系統 | page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================ |
| UI26-002 | fail | 從圖號模組送審入口開啟同一圖號工作台 | no such table: part_roots |
| UI26-003 | fail | 從圖料模組送審入口開啟同一主根與圖號工作台 | no such table: part_roots |
| UI26-004 | fail | 圖料入口沒有明確主圖時不會開空白上傳頁 | no such table: part_roots |
| UI26-005 | fail | 舊 upload drawing query 仍導向圖面送審工作台 | no such table: part_roots |
| UI26-006 | fail | 泛用 upload 頁面已退役且不能建立失控送審 | page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================ |
| UI26-007 | fail | 工作台主資料與附件數量一致 | no such table: part_roots |
| UI26-008 | fail | 資料完整時可從 UI 建立 Pending 送審 | no such table: part_roots |
| UI26-009 | fail | 送審備註缺漏或太短時被中文阻擋 | no such table: part_roots |
| UI26-010 | fail | 未選附件時不能送出審核 | no such table: part_roots |
| UI26-011 | fail | 主資料缺漏與同版次阻擋分層呈現 | no such table: part_roots |
| UI26-012 | fail | Pending 同版次阻擋並導到同一送審明細 | no such table: part_roots |
| UI26-012B | fail | 送審建立者可從工作台取消 Pending 同版次阻擋 | no such table: part_roots |
| UI26-013 | fail | Releasing 同版次阻擋不能建立重複流程 | no such table: part_roots |
| UI26-014 | fail | 同版次已發布時鎖定並要求使用新版次 | no such table: part_roots |
| UI26-015 | fail | 已駁回或已取消紀錄不阻擋新送審 | no such table: part_roots |
| UI26-016 | fail | 未解決發行未完成對工程師只顯示處理方向不給復原權限 | no such table: part_roots |
| UI26-017 | fail | 已處理的發行未完成只保留歷史不再阻擋 | no such table: part_roots |
| UI26-018 | fail | 既有送審明細連結不會導到無關資料 | no such table: part_roots |
| UI26-019 | fail | 送審建立者可從 UI 取消 Pending | no such table: part_roots |
| UI26-020 | fail | 主管可從 UI 取消同公司 Pending | no such table: part_roots |
| UI26-021 | fail | 非建立者工程師不能取消他人 Pending | no such table: part_roots |
| UI26-022 | fail | 主管可重新發行未完成且同一送審轉為已發布 | no such table: part_roots |
| UI26-023 | fail | 重新發行失敗時維持發行未完成並顯示人類中文 | no such table: part_roots |
| UI26-024 | fail | 主管可從工作台建立發行未完成修正送審 | no such table: part_roots |
| UI26-025 | fail | 修正送審核准發布後關閉舊失敗並同步主資料狀態 | no such table: part_roots |
| UI26-026 | fail | 未登入使用者不能從 UI 查看送審內容 | no such table: part_roots |

## Global Gates

| Gate | Status | Detail |
|---|---|---|
| G3 | pass | {"forbiddenVisibleStrings":["duplicate_active_submission","ReleaseFailed","UNIQUE constraint failed","submission_conflict","DUPLICATE_RELEASE_FILENAME","RELEASE_NOT_CONFIGURED","Internal Server Error","stack trace","Error: ","/api/"]} |
| G4 | fail | no such table: part_roots |
| G5 | pass | {"checkedCaseIds":["UI26-001","UI26-002","UI26-003","UI26-004","UI26-005","UI26-006","UI26-007","UI26-008","UI26-009","UI26-010","UI26-011","UI26-012","UI26-012B","UI26-013","UI26-014","UI26-015","UI26-016","UI26-017","UI26-018","UI26-019", |
| G6 | pass | {"statement":"fixture setup uses an isolated temporary database before UI steps; counted evidence is browser operation. No direct DB/API call is used to unblock a normal UI step."} |
| G1 | pass | {"tempRoot":"C:\\Users\\user\\AppData\\Local\\Temp\\ai-pdm-ui26-Fxkiab","cleanupStatus":"removed"} |

## Fixtures

| Case | Type | Drawing | Part / Submission |
|---|---|---|---|
