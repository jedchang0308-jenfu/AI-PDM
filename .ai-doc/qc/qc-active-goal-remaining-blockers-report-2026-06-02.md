# QC Fact Report: Active Goal Remaining External Blockers

日期：2026-07-10

## 驗證結論

目前 active goal 仍不可標示 complete，因正式 field-test / release gate 尚未完成。2026-07-10 追加驗證後，`DEV-IND-007` disposable local Postgres shadow gate 已完成；`DEV-CAD-001`、`DEV-SW-001`、`DEV-BACKUP-001` 改列第一版外的 deferred scope。本機可完成的正式領號 / 草稿 production slice、送審 gate Phase 1、Postgres shadow、handoff、同步、traceability、issue intake 與 pre-deploy build/type/lint/focused QC 工作已收斂。

## 執行項目

| 項目 | 指令 / 證據 | 實際結果 |
|---|---|---|
| Completion audit | `npm.cmd run qc:dev-task-completion-audit` | 8/8 pass；open first-version blocker 只剩 `DEV-FIELD-001` |
| Production readiness | `npm.cmd run qc:production-readiness -- --allow-open` | pass with `ready=false`；`supabaseShadowEvidenceReady=true`；剩 `DEV-FIELD-001` / release gate |
| Evidence sync dry-run | `npm.cmd run qa:dev-task:sync` | pass；`changes=[]`；`supabaseShadowReady=true` from `data/quality/postgres-shadow/shadow-compare-1783676196559.json` |
| Evidence sync QC | `npm.cmd run qc:dev-task-evidence-sync` | 13/13 pass |
| Document path QC | `npm.cmd run qc:doc-paths` | 23/23 pass |
| Pre-deploy product slice QC | `npm.cmd run qc:pdm-production-slice-numbering-draft`; `npm.cmd run qc:pdm-submission-gate-phase1` | 27/27 pass；15/15 pass |
| Type / lint | `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet` | pass；pass |
| Build evidence | `npm.cmd run build` in temporary `.tmp/predeploy-build-worktree-*` isolated copy | pass；未停止健康 dev server PID 13340，未繞過 `clean-next`。觀察到 Next workspace-root/NFT tracing warning 與 deprecated `middleware` convention warning；臨時副本已刪除 |
| Local dev health | `npm.cmd run dev:local:check` | pass；AI_PDM healthy at `http://127.0.0.1:3000/`，port owner PID 13340 |
| DEV-CAD local adapter contract | `npm.cmd run qc:native-cad-extractor-contract` | 14/14 pass；含 external extractor contract 與 no-extractor fallback |
| DEV-CAD local probe tooling | `qc:document-manager-extractor-probe` / `qc:document-manager-probe-redaction` / `qc:document-manager-probe-path-gate` | 6/6、9/9、4/4 pass |
| Field-test local handoff package | `npm.cmd run field-test:preflight -- --profile all`; `npm.cmd run field-test:handoff`; `npm.cmd run qc:field-test-handoff-package`; `npm.cmd run qc:field-test-issue-intake` | preflight `ready=true`; handoff `data/field-test-handoffs/20260706-123433`; package QC 53/53 pass; issue intake QC 11/11 pass |
| Postgres shadow local handoff package | `npm.cmd run postgres-shadow:handoff`; `npm.cmd run qc:postgres-shadow-handoff-package` | handoff `data/postgres-shadow-handoffs/20260710-034552`; package QC validates files, SQL hashes, no hardcoded Postgres URL, latest doc references |
| Postgres shadow disposable live gate | disposable local Postgres 18 target at `.tmp/postgres-shadow-20260710-173550`; copied compare report `data/quality/postgres-shadow/shadow-compare-1783676196559.json` | schema migration apply passed, RLS plan apply passed, target guard compare safe, schema/RLS-only compare passed, `qc:postgres-shadow` 26/26 passed; temp server stopped |
| Field-test required evidence preflight | `npm.cmd run field-test:preflight -- --profile all --require-evidence` | `ready=false`；19 passed / 3 failed / 1 warning |

## 問題與阻塞

| Task | 目前證據 | 尚缺外部輸入 |
|---|---|---|
| `DEV-FIELD-001` | Local field-test handoff package 與 issue intake 已完成；strict evidence preflight 仍 `ready=false` | 第一版正式領號 / 草稿 pilot 現場測試、signed evidence、field issue closure |

## 延後範圍

| Task | 現況 | 恢復條件 |
|---|---|---|
| `DEV-CAD-001` | 使用者人類實測 SW 上傳 OK、3D 預覽 OK、2D 預覽無法預覽；不阻塞第一版正式領號 / 草稿 slice | 要開放 2D drawing preview、native metadata、完整 CAD/PDM workflow 時恢復 |
| `DEV-SW-001` | 目前沒有明確 SolidWorks Add-in 交付路線；保留歷史 ID，不刪除 | 未來明確要求 SolidWorks Add-in 或 CAD workstation 內操作時恢復 |
| `DEV-BACKUP-001` | 完整離線單向備份與隔離還原演練不阻塞第一版；第一版 release gate 仍需最小 snapshot / rollback owner | 上線範圍包含正式 CAD 檔案保存、完整 PDM production ready 或正式資料保存政策時恢復 |
| `DEV-IND-007` | disposable local Postgres shadow gate 已完成；正式 Supabase project/branch advisor 不列第一版 local dev blocker | 要切換 live Supabase target、provider pointer、正式 schema migration 或 production deploy 時由 `DEV-030` / `DEV-032` 恢復 |

## 判定

- Active goal 目前沒有一般可直接派工的本地 DEV；仍可持續推進正式 field-test / release gate，但不能標示 complete。
- 不建議使用 `ProJED` 或 `ProJED_TEST` 作為 `DEV-IND-007` shadow target，因 public schema 非空且非乾淨 AI_PDM shadow schema。
- `DEV-IND-007` 已用 disposable local Postgres target 取得 first-version acceptable evidence；若未來改用正式 Supabase branch/project，仍需高風險確認與 release gate。
