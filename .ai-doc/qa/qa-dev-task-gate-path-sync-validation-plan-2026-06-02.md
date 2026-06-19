# QA Validation Plan: Dev Task Gate Path / Evidence Sync

日期：2026-06-02

## 驗證範圍

本次驗證 active goal 使用的 task gate 是否能在 `.ai-doc/dev_task.md` 成為權威 task 檔後繼續運作：

- completion audit 可讀 `.ai-doc/dev_task.md`，並辨識 5 個外部 blocker。
- production readiness 可讀 `.ai-doc/dev_task.md`，並回報所有 P0 blocker。
- evidence sync 可讀 `.ai-doc/dev_task.md`，支援新版表格列 `[!]` 狀態。
- evidence sync 不應把 heading 或說明文字誤判成格式錯誤。
- QC fixture 不應覆寫既有 `data/` evidence 檔。

## 使用者關鍵流程

1. QA/QC 執行 progress gate，確認是否還有本機可推進任務。
2. 若外部證據尚未 ready，sync tool 只回報 blocker，不修改 task。
3. 若外部證據 ready，sync tool 可把舊版 checkbox 或新版 task 表格列更新為 `[x]`。
4. production readiness 報告仍應保持 `ready=false`，直到 5 個 P0 blocker 真的解除。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
| --- | --- | --- | --- | --- | --- |
| Gate 找不到 task file | task 從 root 移到 `.ai-doc` | false failure，無法判斷剩餘工作 | `qc:dev-task-completion-audit` / `qc:production-readiness:report` | P0 | task resolver 優先 `.ai-doc/dev_task.md`，保留 legacy fallback |
| Sync 無法更新新版表格 | 只支援 `- [ ]` list checkbox | 外部證據 ready 後進度不會自動同步 | `qc:dev-task-evidence-sync` table fixture | P1 | 支援 `| [!] | DEV-... |` 表格列 |
| Sync 誤判 heading | matcher 太寬 | report 出現假 blocker，降低可信度 | `qa:dev-task:sync` dry-run | P1 | 只有 actionable checkbox/table row 才納入 sync |
| QC 覆寫舊 evidence fixture 失敗 | data 內舊檔權限受限 | QC 不能重跑 | `qc:dev-task-evidence-sync` | P2 | fixture 改寫到 `.tmp/` |

## 測試案例

| ID | 測試項目 | 步驟 | 通過標準 |
| --- | --- | --- | --- |
| QA-GATE-001 | Completion audit | `npm.cmd run qc:dev-task-completion-audit` | 8/8 pass，open task 為 5 個外部 blocker |
| QA-GATE-002 | Production readiness | `npm.cmd run qc:production-readiness:report` | parse pass，`ready=false`，5 個 P0 blocker |
| QA-GATE-003 | Evidence sync dry-run | `npm.cmd run qa:dev-task:sync` | exit 0，無 eligible changes，blocked lines 是真實外部 evidence |
| QA-GATE-004 | Evidence sync regression | `npm.cmd run qc:dev-task-evidence-sync` | 12/12 pass，table row 可由 `[!]` 更新成 `[x]` |
| QA-GATE-005 | 文件路徑 regression | `npm.cmd run qc:doc-paths` | 20/20 pass |
| QA-GATE-006 | Field evidence gate | `npm.cmd run field-test:preflight -- --profile all --require-evidence` | 預期 `ready=false`，失敗項仍是外部 evidence |

## 通過標準

- 本地 gate script 全部可讀 `.ai-doc/dev_task.md`。
- 本地 gate script 不漏報 5 個 P0 blocker。
- 外部 evidence 尚未 ready 時，不得自動勾選 task。
- lint 與 whitespace check 通過。

## 證據收集方式

- 指令輸出。
- `.ai-doc/dev_task.md` Update Log。
- `.ai-doc/qc/qc-dev-task-gate-path-sync-validation-report-2026-06-02.md`。
