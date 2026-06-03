# QA Validation Plan: DEV-IND-007 Evidence Sync

日期：2026-06-02

## 驗證範圍

本次驗證 `qa:dev-task:sync` 是否能處理 `DEV-IND-007` 的 live Supabase/Postgres shadow evidence：

- 讀取最新 `data/quality/postgres-shadow/shadow-compare-*.json`。
- 只有 live Postgres shadow configured、target guard safe、Postgres stats 存在、無 mismatch / missing table / RLS missing / compare error 時才視為 ready。
- evidence 未 ready 時，不得勾選 `DEV-IND-007` overview 或 detail checkbox。
- matcher 只能作用在 active overview row 與 `DEV-IND-007` 自己的 checkbox，不得誤改其他任務風險說明。

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
| --- | --- | --- | --- | --- | --- |
| Static compare 被誤當 live migration pass | 只檢查 `qc:postgres-shadow` 是否通過 | 沒有 disposable target 也會誤勾 `DEV-IND-007` | `qa:dev-task:sync` 檢查 `postgresShadowConfigured` / `postgresStats` | P0 | 必須讀 live compare report 且 Postgres configured |
| 非 AI_PDM target 被誤接受 | 未檢查 target guard | 既有 Supabase 專案可能被當成 shadow evidence | target guard safe 欄位 | P0 | 要求 `postgresTargetGuard.safe === true` |
| 風險說明被誤改成完成 | matcher 太寬，看到 `DEV-IND-007` 就改 | task 風險資料失真 | actual dry-run blocked line 檢查 | P1 | 只匹配 active overview table row 與明確 checkbox 文字 |

## 測試案例

| ID | 測試項目 | 步驟 | 通過標準 |
| --- | --- | --- | --- |
| QA-SUPASYNC-001 | Current dry-run | `npm.cmd run qa:dev-task:sync` | `supabaseShadowReady=false`，0 changes，`DEV-IND-007` 保持 blocked |
| QA-SUPASYNC-002 | Fixture blocked/ready | `npm.cmd run qc:dev-task-evidence-sync` | 13/13 pass；blocked fixture 不改；ready fixture 可更新 `DEV-IND-007` table row |
| QA-SUPASYNC-003 | Completion audit | `npm.cmd run qc:dev-task-completion-audit` | 8/8 pass，仍只有 5 個外部 blocker |

## 通過標準

- Current environment 不可把 `DEV-IND-007` 勾成完成。
- Ready fixture 可把 `DEV-IND-007` table row 與代表性 live shadow checkbox 同步為 `[x]`。
- 未來真實 live shadow report 必須含 Postgres stats 與 safe target guard 才能回填 task。

## 證據收集方式

- `docs/qc-dev-task-supabase-shadow-sync-validation-report-2026-06-02.md`。
- 指令輸出。
