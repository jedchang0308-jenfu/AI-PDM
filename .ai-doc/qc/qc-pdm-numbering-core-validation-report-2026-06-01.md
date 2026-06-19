# QC 驗證報告：PDM 圖料號自動化核心資料模型與占號服務

日期：2026-06-01
對應任務：`DEV-PDM-NUMBERING-001`
對應 QA 計畫：`.ai-doc/qa/qa-pdm-numbering-core-validation-plan-2026-06-01.md`

## 驗證結論

通過。

本輪完成的核心資料模型、唯一性約束、主要 MA 圖唯一約束、repository 基本防呆與匯出未破壞 TypeScript、lint、build。

## 執行項目

1. 針對性 QC：

```powershell
npm.cmd run qc:pdm-numbering-core
```

2. TypeScript：

```powershell
cmd /c node_modules\.bin\tsc.cmd --noEmit
```

3. Lint：

```powershell
npm.cmd run lint
```

4. Build：

```powershell
npm.cmd run build
```

## 實際結果

| 項目 | 結果 | 證據 |
---|---|---|
| `qc:pdm-numbering-core` | 通過 | 31 total / 31 passed / 0 failed |
| TypeScript | 通過 | exit code 0 |
| lint | 通過 | exit code 0 |
| build | 通過 | exit code 0 |

Build 有既有 Turbopack warning，內容指向 `src/lib/config.ts`、`src/lib/llm-usage.ts` 與 `next.config.mjs` 的 broad file tracing，與本輪新增圖料號 schema/repository 無直接關係。

## 證據摘要

`qc:pdm-numbering-core` 覆蓋：

- `numbering_sequences`
- `numbering_rule_versions`
- `part_roots`
- `part_numbers`
- `drawing_numbers`
- `drawing_part_links`
- `same_drawing_variants`
- `rule_templates`
- `approval_rules`
- `roles`
- `role_permissions`
- `role_priority_versions`
- `approval_delegations`
- `import_batches`
- `import_staging_rows`
- `file_assets`
- `monthly_audit_reports`
- 預設 numbering rule
- 審核模板 seed
- 內建角色 seed
- primary manufacturing partial unique index
- root / part / drawing unique constraint
- 一料號一主要 MA 圖 constraint
- repository transaction 與防呆靜態檢查

## 問題與阻塞

- 無本輪阻塞。
- 殘留風險：build warning 為既有 broad file tracing 警告，未在本輪修正。
- 未驗證範圍：UI、API route、DVT 晉升流程、審核矩陣 UI、MA 圖作廢完整流程、staging 匯入 UI、Supabase Storage 遷移。
