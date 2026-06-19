# QA Validation Plan: External Blocker Closure Package Gate

## 驗證範圍

本次驗證五個仍未完成的外部 blocker 是否都有一致、可重複、可交接的 closure package：

- `DEV-CAD-001`
- `DEV-SW-001`
- `DEV-BACKUP-001`
- `DEV-FIELD-001`
- `DEV-IND-007`

此驗證不嘗試關閉外部 blocker；目標是防止外部證據回填前，文件、package、指令或 production readiness gate 漂移。

## 使用者關鍵流程

| 流程 | 預期 |
|---|---|
| 管理員查看外部交接文件 | 每個 blocker 都能找到 required inputs、commands、pass criteria |
| 外部操作者執行 field package | 使用最新 `data/field-test-handoffs/20260602-090136` |
| 外部操作者執行 Supabase shadow package | 使用最新 `data/postgres-shadow-handoffs/20260602-091309` |
| QA/QC 重跑總控 gate | `qc:production-readiness:report` 仍在缺 evidence 時保持 `ready=false` |

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| 外部 gate 被誤關閉 | task checkbox 被手動勾掉 | production readiness 假陽性 | `qc:external-blocker-closure` 檢查 readiness blocker 與 dev_task `[!]` | P0 | 未有外部 evidence 前保持 blocker |
| 交接文件引用舊 package | handoff 重新產生後未同步文件 | 操作者跑錯指令或舊報告 | QC 比對 latest package id | P1 | 外部 handoff、checklist、active blocker report 都要引用最新 package |
| 現場問題未轉 defect/task | field issue intake 未在 final checklist | 已知問題消失 | QC 檢查 `field-issues-import.ps1`、`qc:defects-zero` 與轉 defect/task 規則 | P0 | active P0/P1 必須阻擋 readiness |
| Supabase 誤用既有專案 | target safety 規則遺失 | 既有 schema 被汙染 | QC 檢查 `ProJED` / `ProJED_TEST` / `PDM_POSTGRES_SHADOW_URL` safety text | P0 | 僅允許 disposable target |

## 測試案例

| Case | 步驟 | 通過標準 |
|---|---|---|
| QA-EXT-CLOSE-001 | `npm.cmd run qc:external-blocker-closure` | 所有 blocker、package、command、safety rule 檢查通過 |
| QA-EXT-CLOSE-002 | `npm.cmd run qc:dev-task-completion-audit` | 仍只剩 5 個外部 blocker |
| QA-EXT-CLOSE-003 | `npm.cmd run qa:dev-task:sync` | 0 changes；不誤勾外部 gate |
| QA-EXT-CLOSE-004 | `npm.cmd run qc:production-readiness:report` | `ready=false`，5 個 P0 blockers |

## 通過標準

- `qc:external-blocker-closure` 通過。
- `DEV-CAD-001`、`DEV-SW-001`、`DEV-BACKUP-001`、`DEV-FIELD-001`、`DEV-IND-007` 均仍由 production readiness 回報為外部 blocker。
- 外部 handoff 文件引用最新 field-test 與 Postgres shadow package。

## 證據收集方式

- `.ai-doc/qc/qc-external-blocker-closure-package-validation-report-2026-06-02.md`
- `.ai-doc/dev_task.md`
- `.ai-doc/reports/industrialization/external-validation-handoff-2026-05-28.md`
