# QA Validation Plan: External Handoff Sync

日期：2026-06-02

## 驗證範圍

本次只驗證外部驗證交接文件是否與目前 active task / gate 工具一致：

- 外部交接文件必須指向 `.ai-doc/dev_task.md`，不可再要求更新舊 `PDM_dev_task.md`。
- 文件需列出 5 個 P0 外部 blocker。
- 文件需包含目前 2026-06-02 的 local gate 狀態。
- Supabase live shadow gate 必須明確要求 disposable target 與使用者確認，不可暗示能使用既有 projects。

## 測試案例

| ID | 測試項目 | 步驟 | 通過標準 |
| --- | --- | --- | --- |
| QA-HANDOFF-001 | Task path | 搜尋外部交接文件 | 交接文件引用 `.ai-doc/dev_task.md` |
| QA-HANDOFF-002 | 5 blockers | 檢查 blocker 表 | `DEV-CAD-001`、`DEV-SW-001`、`DEV-BACKUP-001`、`DEV-FIELD-001`、`DEV-IND-007` 皆存在 |
| QA-HANDOFF-003 | Local gate command | 檢查 commands section | 包含 completion audit、production readiness、evidence sync、field preflight |
| QA-HANDOFF-004 | Supabase safety | 檢查 `DEV-IND-007` section | 明確禁止未確認前建立或使用非 disposable target |

## 通過標準

- `qc:dev-task-completion-audit` 通過，證明文件提到的 open blockers 與 task 相符。
- `qa:dev-task:sync` dry-run 不會產生 changes。
- 文字檢查不再把完成規則指向舊 `PDM_dev_task.md`。

## 證據收集方式

- 指令輸出。
- `docs/qc-external-handoff-sync-validation-report-2026-06-02.md`。
