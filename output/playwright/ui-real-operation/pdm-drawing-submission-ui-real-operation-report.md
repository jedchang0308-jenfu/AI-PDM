# PDM Drawing Submission UI Real Operation QC Report

Generated: 2026-07-04T05:50:16.714Z
Branch: codex/pdm-lifecycle-unified-history
Base URL: http://127.0.0.1:49881
Run ID: 2026-07-04T05-48-36-075Z
Result: 26/27 UI cases passed, 1 failed
Global gates: 5/5 passed
Temp fixture cleanup: removed

## Scope Notes

- D-0014-MA1 was not used as a required fixture.
- Fixture setup used an isolated temporary SQLite data directory and repository.
- Counted proof comes from rendered browser UI operations and screenshots.

## UI Cases

| ID | Status | Scenario | Evidence / Error |
|---|---|---|---|
| UI26-001 | pass | 四種角色可從登入畫面進入系統 | 4 screenshots |
| UI26-002 | pass | 從圖號模組送審入口開啟同一圖號工作台 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-002-D-QAUI002-MA1.png |
| UI26-003 | pass | 從圖料模組送審入口開啟同一主根與圖號工作台 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-003-D-QAUI003-MA1.png |
| UI26-004 | pass | 圖料入口沒有明確主圖時不會開空白上傳頁 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-004-ROOT-QAUI004.png |
| UI26-005 | pass | 舊 upload drawing query 仍導向圖面送審工作台 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-005-D-QAUI005-MA1.png |
| UI26-006 | pass | 泛用 upload 頁面已退役且不能建立失控送審 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-006-retired-upload.png |
| UI26-007 | pass | 工作台主資料與附件數量一致 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-007-D-QAUI007-MA1.png |
| UI26-008 | pass | 資料完整時可從 UI 建立 Pending 送審 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-008-D-QAUI008-MA1.png |
| UI26-009 | pass | 送審備註缺漏或太短時被中文阻擋 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-009-D-QAUI009-MA1.png |
| UI26-010 | pass | 未選附件時不能送出審核 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-010-D-QAUI010-MA1.png |
| UI26-011 | pass | 主資料缺漏與同版次阻擋分層呈現 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-011-D-QAUI011-MA1.png |
| UI26-012 | pass | Pending 同版次阻擋並導到同一送審明細 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-012-SUB-UI26-012-PENDING.png |
| UI26-012B | pass | 送審建立者可從工作台取消 Pending 同版次阻擋 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-012B-D-QAUI012B-MA1.png |
| UI26-013 | pass | Releasing 同版次阻擋不能建立重複流程 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-013-D-QAUI013-MA1.png |
| UI26-014 | pass | 同版次已發布時鎖定並要求使用新版次 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-014-D-QAUI014-MA1.png |
| UI26-015 | pass | 已駁回或已取消紀錄不阻擋新送審 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-015-D-QAUI015-MA1.png |
| UI26-016 | pass | 未解決發行未完成對工程師只顯示處理方向不給復原權限 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-016-SUB-UI26-016-RELFAIL.png |
| UI26-017 | pass | 已處理的發行未完成只保留歷史不再阻擋 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-017-D-QAUI017-MA1.png |
| UI26-018 | pass | 既有送審明細連結不會導到無關資料 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-018-SUB-UI26-018-PENDING.png |
| UI26-019 | pass | 送審建立者可從 UI 取消 Pending | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-019-SUB-UI26-019-CANCEL.png |
| UI26-020 | pass | 主管可從 UI 取消同公司 Pending | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-020-SUB-UI26-020-MANAGER-CANCEL.png |
| UI26-021 | pass | 非建立者工程師不能取消他人 Pending | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-021-SUB-UI26-021-DENIED.png |
| UI26-022 | pass | 主管可重新發行未完成且同一送審轉為已發布 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-022-SUB-UI26-022-RETRY.png |
| UI26-023 | pass | 重新發行失敗時維持發行未完成並顯示人類中文 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-023-SUB-UI26-023-RETRY-FAIL.png |
| UI26-024 | pass | 主管可從工作台建立發行未完成修正送審 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-024-D-QAUI024-MA1.png |
| UI26-025 | fail | 修正送審核准發布後關閉舊失敗並同步主資料狀態 | 圖號模組仍顯示 Draft 狀態 |
| UI26-026 | pass | 未登入使用者不能從 UI 查看送審內容 | C:\VIBE CODING\AI_PDM\output\playwright\ui-real-operation\2026-07-04T05-48-36-075Z\UI26-026-unauthorized.png |

## Global Gates

| Gate | Status | Detail |
|---|---|---|
| G3 | pass | {"forbiddenVisibleStrings":["duplicate_active_submission","ReleaseFailed","UNIQUE constraint failed","submission_conflict","DUPLICATE_RELEASE_FILENAME","RELEASE_NOT_CONFIGURED","Internal Server Error","stack trace","Error: ","/api/"]} |
| G4 | pass | 8 screenshots |
| G5 | pass | {"checkedCaseIds":["UI26-001","UI26-002","UI26-003","UI26-004","UI26-005","UI26-006","UI26-007","UI26-008","UI26-009","UI26-010","UI26-011","UI26-012","UI26-012B","UI26-013","UI26-014","UI26-015","UI26-016","UI26-017","UI26-018","UI26-019", |
| G6 | pass | {"statement":"fixture setup uses an isolated temporary database before UI steps; counted evidence is browser operation. No direct DB/API call is used to unblock a normal UI step."} |
| G1 | pass | {"tempRoot":"C:\\Users\\user\\AppData\\Local\\Temp\\ai-pdm-ui26-jjM1mj","cleanupStatus":"removed"} |

## Fixtures

| Case | Type | Drawing | Part / Submission |
|---|---|---|---|
| 002 | drawing | D-QAUI002-MA1 | P-QAUI002-001 |
| 003 | drawing | D-QAUI003-MA1 | P-QAUI003-001 |
| 004 | root_without_drawing | - | P-QAUI004-001 |
| 005 | drawing | D-QAUI005-MA1 | P-QAUI005-001 |
| 007 | drawing | D-QAUI007-MA1 | P-QAUI007-001 |
| 008 | drawing | D-QAUI008-MA1 | P-QAUI008-001 |
| 009 | drawing | D-QAUI009-MA1 | P-QAUI009-001 |
| 010 | drawing | D-QAUI010-MA1 | P-QAUI010-001 |
| 011 | drawing | D-QAUI011-MA1 | P-QAUI011-001 |
| 012 | drawing | D-QAUI012-MA1 | P-QAUI012-001 |
| 012 | submission | D-QAUI012-MA1 | SUB-UI26-012-PENDING |
| 012B | drawing | D-QAUI012B-MA1 | P-QAUI012B-001 |
| 012B | submission | D-QAUI012B-MA1 | SUB-UI26-012B-WORKBENCH-CANCEL |
| 013 | drawing | D-QAUI013-MA1 | P-QAUI013-001 |
| 013 | submission | D-QAUI013-MA1 | SUB-UI26-013-RELEASING |
| 014 | drawing | D-QAUI014-MA1 | P-QAUI014-001 |
| 014 | submission | D-QAUI014-MA1 | SUB-UI26-014-RELEASED |
| 015 | drawing | D-QAUI015-MA1 | P-QAUI015-001 |
| 015 | submission | D-QAUI015-MA1 | SUB-UI26-015-CANCELLED |
| 016 | drawing | D-QAUI016-MA1 | P-QAUI016-001 |
| 016 | submission | D-QAUI016-MA1 | SUB-UI26-016-RELFAIL |
| 017 | drawing | D-QAUI017-MA1 | P-QAUI017-001 |
| 017R | drawing | D-QAUI017R-MA1 | P-QAUI017R-001 |
| 017R | submission | D-QAUI017R-MA1 | SUB-UI26-017-RESOLVER |
| 017 | submission | D-QAUI017-MA1 | SUB-UI26-017-RESOLVED |
| 018 | drawing | D-QAUI018-MA1 | P-QAUI018-001 |
| 018 | submission | D-QAUI018-MA1 | SUB-UI26-018-PENDING |
| 019 | drawing | D-QAUI019-MA1 | P-QAUI019-001 |
| 019 | submission | D-QAUI019-MA1 | SUB-UI26-019-CANCEL |
| 020 | drawing | D-QAUI020-MA1 | P-QAUI020-001 |
| 020 | submission | D-QAUI020-MA1 | SUB-UI26-020-MANAGER-CANCEL |
| 021 | drawing | D-QAUI021-MA1 | P-QAUI021-001 |
| 021 | submission | D-QAUI021-MA1 | SUB-UI26-021-DENIED |
| 022 | drawing | D-QAUI022-MA1 | P-QAUI022-001 |
| 022 | submission | D-QAUI022-MA1 | SUB-UI26-022-RETRY |
| 023A | drawing | D-QAUI023A-MA1 | P-QAUI023A-001 |
| 023A | submission | D-QAUI023A-MA1 | SUB-UI26-023-RELEASED-CONFLICT |
| 023 | drawing | D-QAUI023-MA1 | P-QAUI023-001 |
| 023 | submission | D-QAUI023-MA1 | SUB-UI26-023-RETRY-FAIL |
| 024 | drawing | D-QAUI024-MA1 | P-QAUI024-001 |
| 024 | submission | D-QAUI024-MA1 | SUB-UI26-024-OLD-FAILED |
| 025 | drawing | D-QAUI025-MA1 | P-QAUI025-001 |
| 025 | submission | D-QAUI025-MA1 | SUB-UI26-025-OLD-FAILED |
| 025 | submission | D-QAUI025-MA1 | SUB-UI26-025-CORRECTION |
| 026 | drawing | D-QAUI026-MA1 | P-QAUI026-001 |
| 026 | submission | D-QAUI026-MA1 | SUB-UI26-026-UNAUTH |
| 900 | drawing | D-QAUI900-MA1 | P-QAUI900-001 |
| 900 | submission | D-QAUI900-MA1 | SUB-UI26-900-RWD |
