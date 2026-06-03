# QA Validation Plan: DEV-IND-007 Target Guard / Traceability

日期：2026-06-01

## 驗證範圍

本次只驗證 `DEV-IND-007` 在沒有 disposable Supabase/Postgres target 前，可先完成的本地安全防呆與 evidence traceability：

- target guard 必須 fail closed，阻擋非空、非 disposable、非 AI_PDM schema 目標。
- SQLite/Postgres shadow compare report 必須能追溯到實際 migration 輸入檔。
- 本次不宣告 live shadow migration 完成，因尚未取得可用 disposable target。

## 使用者關鍵流程

1. RD 先在本機產生 Postgres migration 與 RLS plan。
2. RD 執行本地 shadow compare，取得 row count / key hash / migrationTrace evidence。
3. RD 嘗試 live migration 前，必須先跑 target guard。
4. 若 target 不是乾淨 disposable schema，流程必須阻擋。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
| --- | --- | --- | --- | --- | --- |
| 誤跑既有 Supabase 專案 | target guard 太寬鬆 | 既有資料或 schema 被污染 | `qc:postgres-shadow-target-guard` | P0 | fail closed，只允許空 public schema 或完整 AI_PDM shadow schema |
| compare evidence 無法追溯 migration 版本 | report 只記 row/key hash | 後續無法確認 evidence 對應哪版 schema | `qc:postgres-shadow` PG-018 | P1 | report 加入 migrationTrace SHA-256 |
| 將本地 static pass 誤判為 live migration pass | task 狀態未拆分 | production readiness 被誤放行 | task checkbox 與 QC report | P0 | 本地 pass 與 disposable target pass 分開標示 |

## 測試案例

| ID | 測試項目 | 步驟 | 通過標準 |
| --- | --- | --- | --- |
| QA-IND-007-01 | target guard 防呆 | 執行 `npm.cmd run qc:postgres-shadow-target-guard` | 10/10 通過，包含非空/非 AI_PDM/partial schema 阻擋 |
| QA-IND-007-02 | compare traceability | 執行 `npm.cmd run qc:postgres-shadow` | 21/21 通過，PG-018 驗證 migrationTrace |
| QA-IND-007-03 | task 狀態邊界 | 檢查 `.ai-doc/dev_task.md` | 本地 guard/traceability 勾選，live disposable target 保持未完成 |

## 通過標準

- `qc:postgres-shadow-target-guard` 通過。
- `qc:postgres-shadow` 通過且包含 PG-018。
- task 不可把 `DEV-IND-007` 標示完成，因 disposable target 尚未取得。

## 證據收集方式

- QC 指令輸出。
- `.ai-doc/dev_task.md` checkbox 與 Update Log。
- `docs/qc-postgres-shadow-target-guard-traceability-validation-report-2026-06-01.md`。
