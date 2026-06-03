# QA Validation Plan: DEV-IND-007 Postgres Shadow Handoff Package

## 驗證範圍

本次只驗證 `DEV-IND-007` 在尚未取得 disposable Supabase/Postgres target 前，可先完成的交接包：

- 產生 Postgres shadow handoff package。
- package 內含 SQL copy/hash、target guard、migration apply、live compare、advisor checklist 與 final QC checklist。
- package 不保存真實 `PDM_POSTGRES_SHADOW_URL` 或 hardcoded Postgres URL。
- 外部 handoff 文件與 task 指向最新 package，但不誤關閉 live target gate。

## 使用者關鍵流程

| 流程 | 預期 |
|---|---|
| 管理員取得 package | 可從 `data/postgres-shadow-handoffs/<id>` 讀 README 與 manifest |
| target 建立前 | `01-pre-migration-guard.ps1` 要求設定 `PDM_POSTGRES_SHADOW_URL`，且 guard 只能接受空 public schema |
| target 建立後 | `02-apply-migration.ps1` 套用 schema/RLS；`03-compare-shadow.ps1` 以 `--require-postgres` 執行 live compare |
| advisor evidence | `supabase-advisor-checklist.md` 引導記錄 security/performance advisor 與 RLS exposure |
| 文件治理 | `.ai-doc/dev_task.md` 只勾本機 handoff，不勾 live migration/compare/advisor |

## FMEA 風險表

| 失效模式 | 原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| 誤跑既有 Supabase project | handoff 未明確禁止既有 target | 汙染 production/schema | package QC 檢查 `ProJED` / `ProJED_TEST` 禁止文字與 guard command | P0 | README、manifest、QC 都要求 disposable target |
| 連線字串外洩 | command 或 docs 寫入真實 URL | credential 風險 | QC 掃描 package 內 `postgres://` / `postgresql://` | P0 | 只允許 operator shell session 設定 env |
| migration evidence 無法追溯 | package 沒有 SQL hash | 後續無法確認套用版本 | QC 比對 manifest hash、source hash、copy hash | P1 | package manifest 保存三份 SQL hash |
| static compare 誤當 live compare | 只跑本地 `qc:postgres-shadow` | 沒 target 也誤關閉 task | dev_task 保留 live checkbox `[ ]`；sync gate 檢查 `postgresShadowConfigured` | P0 | 只勾 handoff package，不勾 live gate |

## 測試案例

| Case | 步驟 | 通過標準 |
|---|---|---|
| QA-PG-HANDOFF-001 | `npm.cmd run postgres-shadow:handoff` | 產生 `data/postgres-shadow-handoffs/<id>` |
| QA-PG-HANDOFF-002 | `npm.cmd run qc:postgres-shadow-handoff-package` | package 檔案、hash、commands、RLS、no hardcoded URL、docs reference 全通過 |
| QA-PG-HANDOFF-003 | 檢查 `.ai-doc/dev_task.md` | 只新增本機 handoff `[x]`；live target/migration/compare/advisor 仍 `[ ]` |
| QA-PG-HANDOFF-004 | `npm.cmd run qc:dev-task-completion-audit` | 仍回報 5 個外部 blocker，不誤標 complete |

## 通過標準

- `qc:postgres-shadow-handoff-package` 通過。
- `DEV-IND-007` top-level 狀態仍為 `[!]`。
- production readiness 仍因外部 target/evidence 未完成而 `ready=false`。

## 證據收集方式

- `data/postgres-shadow-handoffs/<id>/postgres-shadow-handoff.json`
- `docs/qc-postgres-shadow-handoff-package-validation-report-2026-06-02.md`
- `.ai-doc/dev_task.md` Update Log 與 `DEV-IND-007` section
