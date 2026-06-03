# QA Validation Plan: Active Goal Blocked Audit

日期：2026-06-02

## 驗證範圍

確認 active goal 是否仍有可由本機 RD/QA/QC 繼續完成的 task，或是否已只剩外部 evidence / target 條件。

## 使用者關鍵流程

- RD 依 `.ai-doc/dev_task.md` 繼續處理未完成項。
- QA 只在 QC evidence 足夠時才允許 checkbox 更新。
- QC 必須證明剩餘項目是真正外部阻塞，不是本機漏做、文件漏接、或同步 gate 漏判。

## FMEA 風險表

| 風險 | 可能原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| 誤宣告 goal complete | 只看 local gate pass，忽略外部 evidence | 未完成實機驗證即關閉任務 | `qc:production-readiness:report`、各 evidence report gate | 保持 5 個 `[!]` blocker |
| 誤判還有本機 task 可做 | 未檢查 active overview 與 completion audit | 無意義新增 scope 或反覆改文件 | `qc:dev-task-completion-audit` | 只接受 openTasks 中分類結果 |
| 外部交接包缺漏 | Handoff 未含命令或 safety rule | 外部執行後無法回填 evidence | `qc:external-blocker-closure` | package/doc drift 必須 fail |
| evidence sync 誤勾 | report 尚未 ready 但 checkbox 被改為 `[x]` | readiness 假陽性 | `qa:dev-task:sync` dry-run、`qc:dev-task-evidence-sync` | 檢查 `changes=[]` 與 `unsafeCompleted=[]` |
| Supabase 目標誤用 | 使用既有非 disposable project | 破壞既有 schema 或產生成本風險 | Postgres shadow handoff safety rule | 未經確認不建立、不 mutate target |

## 測試案例

| Case | 指令 / 證據 | 通過標準 |
|---|---|---|
| QA-BLOCK-001 | `npm.cmd run qc:dev-task-completion-audit` | 只剩 5 個外部 blocker，無 local/unclassified open task |
| QA-BLOCK-002 | `npm.cmd run qa:dev-task:sync` | `readyToApply=false`、`changes=[]`、不誤勾外部項 |
| QA-BLOCK-003 | `npm.cmd run qc:production-readiness:report` | `ready=false`，5 個 P0 external blockers |
| QA-BLOCK-004 | `npm.cmd run qc:external-blocker-closure` | handoff/package/command/safety rule 全通過 |
| QA-BLOCK-005 | 三份 external report allow-open gate | SW、restore、Document Manager report 皆 `ready=false` |
| QA-BLOCK-006 | `npm.cmd run field-test:preflight -- --profile all --require-evidence` | 嚴格 evidence gate 在外部 evidence 缺失時 fail |

## 通過標準

- 可證明所有本機可完成 task 均已完成或已有 handoff gate。
- 可證明剩餘 5 項均需要外部環境、簽核 evidence 或 disposable target。
- 不更新任何 `[!]` blocker 為 `[x]`。

## 證據收集方式

- 保存本輪命令輸出摘要於 QC report。
- 以 `.ai-doc/dev_task.md`、handoff docs、production readiness report 作權威來源。
