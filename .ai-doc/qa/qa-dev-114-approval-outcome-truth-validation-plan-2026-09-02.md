# QA-DEV-114：CAPA-001 核准結果、正式資料語意與生命週期證據驗證計畫

日期：2026-09-02  
CAPA：`CAPA-001`  
DEV：`DEV-114`／`DEV-PDM-APPROVAL-OUTCOME-TRUTH-001`  
Authority：`.ai-doc/specs/SPEC-PDM-APPROVAL-OUTCOME-TRUTH-CAPA-001-domain-outcome-and-lifecycle-evidence.md` §9～§15  
Register：`.ai-doc/capa-register.md#capa-001`

## 1. QA 目的與邊界

確認 approval decision、apply result、domain postcondition 與 UI outcome 使用同一組既有 `status/applyStatus` 語意；確認 `part_formal` 只代表主檔導覽層，不被誤投影為正式發行或可使用；確認 exact A0001-P01 evidence 可重現且不因本 CAPA 自動修復資料。

本次允許：本機 source、task-owned isolated SQLite clone、localhost browser、primary SQLite read-only inventory。  
本次禁止：primary／staging／production write、schema／migration、approval authority 變更、deploy、release、rollback、A0001-P01 status repair。

## 2. 固定驗證分母

| 群組 | 案例 | 驗證方式 | 完成條件 |
|---|---|---|---|
| QO | 11 個 outcome matrix cases | shared pure projector | `apply_failed` 不得 success；applied 只有在 apply success 時 success |
| QS | 7 個 wiring／state／action checks + 4 個 shared client/API checks | static source + canonical fixture | 兩個 client、兩個 API、postcondition、Part lifecycle gate 均對齊 |
| QF | 7 個 isolated fault-path checks | task-owned clone | persisted `apply_failed`、`applyStatus=failed`、attempt=1、可重試且無 success feedback |
| QB | 3 個 authenticated browser surfaces | real Chromium | A0001 Part、approval inbox、generic approval workspace 均呈現正確語意；無 raw success false-signal |
| QI | 1 個 primary inventory gate | read-only SQLite | exact identity、counts、hash、FK 與 disposition 可追溯，`productionWrites=false` |

`QO + QS` 由 `npm.cmd run qc:capa-001` 執行，固定報告目前為 `22/22 PASS`；`QF` 由 `npm.cmd run qc:capa-001:fault` 執行，固定報告為 `7/7 PASS`。QB 使用相同 task-owned clone 的 authenticated Chromium，未執行 destructive action。

## 3. QA 操作與證據

1. 執行 `npm.cmd run qc:capa-001:inventory`，保存 primary SQLite 唯讀 manifest。
2. 執行 `npm.cmd run qc:capa-001`，確認 shared projector、API wiring、postcondition 與 Part projection/actionability。
3. 在 task-owned clone 執行 `npm.cmd run qc:capa-001:fault`，建立受控平台測試案件並直接保存 `apply_failed` fixture；mutation ledger 必須標明 clone，完成後刪除整棵 clone。
4. 以本機快速登入的 R&D Manager 讀取 A0001-P01；再讀取 fault fixture 的 `/approvals?requestId=...` 與 `/approvals/[requestId]`，保存 viewport screenshot。
5. 檢查 `git diff --check` 與受影響 ESLint；`typecheck:app` 若被範圍外既有錯誤阻擋，必須記錄原始檔案與行號，不得把結果改寫成 DEV-114 failure 或 PASS。

## 4. QA 結果

| Gate | 結果 | 證據／備註 |
|---|---|---|
| QO + QS | PASS `22/22` | `output/qa/capa-001-approval-outcome/2026-09-02T06-44-20-293Z/report.json` |
| QF | PASS `7/7` | `output/qa/capa-001-approval-outcome/fault-path-20260902/report.json`；僅隔離 clone mutation |
| QB Part | PASS | `browser-20260902/a0001-part-lifecycle.png`；A0001-P01 顯示「主檔 · 草稿（未發行）」／「資料可見」 |
| QB approval inbox | PASS | `browser-20260902/approval-inbox-apply-failed.png`；顯示「核准已保存，正式化未完成」與「重試套用」 |
| QB generic workspace | PASS | `browser-20260902/approval-workspace-apply-failed.png`；顯示同一 failure-aware outcome 與「重試正式化」 |
| QI | PASS | `output/qa/capa-001-approval-outcome/inventory/2026-09-02T06-45-19-969Z/manifest.json`；FK=0、primary read-only、A0001 disposition=`blocked_pending_release_authority` |
| Affected static lint | PASS | 0 errors、1 個既有 `@next/next/no-location-assign-relative-destination` warning |
| Typecheck／legacy regression | Typecheck PASS；legacy baseline blocker | `typecheck:app` PASS；`qc:pdm-approval-platform` 仍有既有 drawing-list compact pending signal failure，不在 DEV-114 scope |

## 5. QA 判定與後續 gate

修復前 QA 判定：本機 corrective implementation、typecheck、affected lint、isolated build 與 local effectiveness 已達成；CAPA 不宣稱 production PASS。當時 A0001-P01 仍是 `Draft` 且 `blocked_pending_release_authority`，不得僅由 `part_formal` 推導 `Released` 或自動執行資料修復。後續 exact 人類授權與結果見 §6；approval production slice 若要開放，仍需依 CAPA SPEC §10 在 exact release revision 重跑 authenticated E2E、PA-05 monitor 與 DEV-032 release/data authorization。

## 6. 後續人類授權增補（2026-09-02）

使用者其後以「正式資料修復／授權執行」明確覆寫本計畫對 exact local A0001 case 的 primary-write禁令。原 QA 結果仍是修復前基線；新增 QR 群組只驗證本機 corrective repair，不把授權解讀為舊核准紀錄，也不開放 staging／cloud production。

| Gate | 結果 | 證據／備註 |
|---|---|---|
| QR dry-run | PASS／READY | `output/qa/capa-001-formal-data-repair/preflight-20260902-03/manifest.json`；exact fingerprint、plan hash、count=4 |
| QR rehearsal | PASS | `output/qa/capa-001-formal-data-repair/rehearsal-20260902-02/manifest.json`；task-owned clone 5 changes、source unchanged、clone removed |
| QR apply | PASS | `output/qa/capa-001-formal-data-repair/apply-20260902-01/manifest.json`；backup verified、transaction readback、FK=0、schema unchanged |
| QR replay | PASS／NO_OP | `output/qa/capa-001-formal-data-repair/replay-20260902-01/manifest.json` |
| QR inventory | PASS | `output/qa/capa-001-approval-outcome/inventory/post-repair-20260902-01/manifest.json`；A0001-P01=`Released`、approval rows=0 |
| QR browser | PASS | `output/qa/capa-001-formal-data-repair/ui-readback-20260902.md`；「主檔 · 已發布」／「申請作廢」可見，未送出 |

增補判定：A0001-P01 local primary corrective repair PASS；原「不自動由 `part_formal` 推導 Released」規則仍有效，只有本次 exact、人類授權、fingerprint-gated 處置例外成立。
