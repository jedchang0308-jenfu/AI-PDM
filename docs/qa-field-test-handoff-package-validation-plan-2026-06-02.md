# QA Validation Plan: DEV-FIELD-001 Field-Test Handoff Package

Date: 2026-06-02
Scope: local field-test preflight, handoff generation, and package completeness before external field execution.

## 驗證範圍

- 執行 `field-test:preflight -- --profile all`，確認本機工具、報告模板、CAD/restore/Document Manager handoff prerequisites 可被檢查。
- 執行 `field-test:handoff`，產生最新現場測試交接包。
- 驗證最新 handoff package 含 restore、SolidWorks Add-in、Document Manager 三組指令與報告副本。
- 驗證 final QC checklist 含嚴格 evidence gate，不讓 draft evidence 被誤當完成。

## 不在本輪範圍

- 不執行真實 SolidWorks 端到端測試。
- 不執行獨立機 restore drill。
- 不完成正式現場測試報告與 issue closure。

## FMEA 風險表

| 失效模式 | 可能原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| handoff package 缺少指令 | 產生器漏複製命令 | 現場測試人員無法執行 | `qc:field-test-handoff-package` | 驗證所有 command 檔案存在 |
| 報告副本缺失 | 來源 report path 漏接 | 現場回填錯檔 | `qc:field-test-handoff-package` | 驗證三份 report copy |
| final checklist 沒有嚴格 evidence gate | checklist 太寬鬆 | draft report 被誤判 ready | `qc:field-test-handoff-package` | 必須包含 `--require-evidence` 與 production readiness |
| task 過度勾選 | 本機 handoff 被誤當正式 field closure | P0 gate false pass | `qa:dev-task:sync` / completion audit | 只勾本機子項，總列維持 `[!]` |

## 測試案例

| ID | 指令 | 預期 |
|---|---|---|
| QA-FIELD-HANDOFF-001 | `npm.cmd run field-test:preflight -- --profile all` | `ready=true`，0 failed，允許 admin warning |
| QA-FIELD-HANDOFF-002 | `npm.cmd run field-test:handoff` | 產生 `data/field-test-handoffs/<id>` |
| QA-FIELD-HANDOFF-003 | `npm.cmd run qc:field-test-handoff-package` | 最新 package 完整，且外部 handoff 文件沒有舊 package id |
| QA-FIELD-HANDOFF-004 | `npm.cmd run qa:dev-task:sync` | 正式 field evidence 未 ready 時，不自動關閉 `DEV-FIELD-001` |
| QA-FIELD-HANDOFF-005 | `npm.cmd run qc:dev-task-completion-audit` | 仍只剩外部 blocker，`DEV-FIELD-001` 不被誤關 |

## 通過標準

- 本輪三個本機 gate 通過。
- `.ai-doc/dev_task.md` 僅勾選 `DEV-FIELD-001` 的 local preflight / handoff / package 子項。
- `DEV-FIELD-001` overview 與正式 QC 驗收仍維持 blocked，直到正式 field report 與 issue closure 完成。

## 證據收集方式

- 保存命令輸出摘要於 QC report。
- 將最新 handoff package id 寫入 `.ai-doc/dev_task.md` Update Log 與 external handoff 文件。
