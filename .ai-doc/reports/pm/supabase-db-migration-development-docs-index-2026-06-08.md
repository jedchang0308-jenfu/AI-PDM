# Supabase DB Migration Development Docs Index - 2026-06-08

關聯任務：`DEV-SUPABASE-DB-001`  
文件目的：作為 AI_PDM 從 Google Drive / local SQLite runtime 升級到 Supabase Postgres 的開發文件總入口。

## 結論

2026-06-09 重新制定版已建立：`.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md`。後續 PM/RD/QA/QC 追蹤以此文件為第一入口；2026-06-08 文件包保留為 SPEC、ADR、RD、QA、QC 與歷史 evidence。

Supabase 遷移已改為正式開發文件包管理，不再只停留在對話計畫。

目前狀態是 `[/] In Progress`。本機可完成的前置工作已完成：資料清空、migration mirror、target guard、async DB provider、Postgres adapter local gate、system settings async repository pilot、access-control async repository pilot、permission API async read path、async guard first read-only route batch migration、async auth/session user lookup pilot、async login/token user lookup pilot、async auth audit write pilot 與 PM/RD/QA/QC 文件。

不得標示完成，直到 `AI_PDM_STAGING`、`AI_PDM_PROD` 都完成 live validation，production runtime 實際切到 Supabase Postgres，且 rollback 與 Storage follow-up 都有明確證據或任務。

## 文件閱讀順序

1. PM 主控：
   - `.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md`
   - `.ai-doc/dev_task.md`
   - `.ai-doc/reports/pm/pm-supabase-db-migration-development-package-2026-06-08.md`

2. 需求與決策：
   - `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
   - `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`

3. 開發與驗證：
   - `.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md`
   - `.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md`
   - `.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md`

4. Runtime / migration 操作：
   - `.ai-doc/reports/industrialization/supabase-runtime-migration-plan-2026-06-08.md`
   - `supabase/README.md`
   - `db/postgres/README.md`

## 文件責任

| 文件 | 責任 | 完成狀態 |
|---|---|---|
| `.ai-doc/reports/pm/supabase-db-migration-replanned-development-document-2026-06-09.md` | 2026-06-09 重新制定後的第一入口，定義乾淨資料起步、DB-first、Storage follow-up、分期 gates、風險與完成定義 | 已建立 |
| `.ai-doc/dev_task.md` | PM 任務主控、active status、RD/QA/QC checklist、更新紀錄 | 已建立 |
| `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md` | 正式需求、範圍、target、runtime provider、migration、驗收標準 | 已建立 |
| `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md` | DB-first、新 target、server API 邊界、Storage 延後的決策理由 | 已建立 |
| `.ai-doc/reports/rd/rd-supabase-db-migration-development-plan-2026-06-08.md` | 工程分期、repository 遷移順序、檔案影響、completion criteria | 已建立 |
| `.ai-doc/qa/qa-supabase-db-migration-validation-plan-2026-06-08.md` | 驗證矩陣、local/live command checklist、entry/exit criteria | 已建立 |
| `.ai-doc/qc/qc-supabase-db-migration-fact-check-plan-2026-06-08.md` | 事實驗證 gate、不可接受 evidence、completion rule | 已建立 |
| `.ai-doc/reports/pm/pm-supabase-db-migration-development-package-2026-06-08.md` | PM-dev 文件包總結、狀態、evidence snapshot、下一步 slice | 已建立 |
| `.ai-doc/reports/industrialization/supabase-runtime-migration-plan-2026-06-08.md` | runtime cutover roadmap、gates、local evidence | 已建立 |
| `supabase/README.md` | Supabase migration mirror、target rules、safe workflow、security baseline | 已建立 |
| `db/postgres/README.md` | Postgres / Supabase schema、guard、RLS baseline 說明 | 已建立 |

## 已完成本機開發文件證據

- 2026-06-09 重新制定版已將資料 reset 後的策略改寫為可執行開發文件，明確列出 Phase 0 到 Phase 6、風險控制、未來修改政策與下一個 Phase 3AH 建議切片。
- Full data reset 已納入 SPEC、PM package、QC baseline。
- `ProJED` / `ProJED_TEST` 不可用規則已納入 SPEC、ADR、README、target guard。
- Supabase Storage 延後已納入 SPEC、ADR、RD、QA、QC 與 PM gate。
- Async DB provider、Postgres adapter、system settings async repository pilot、access-control async repository pilot、permission API async read path、async guard helper、第一批 5 個 read-only route migration、async auth/session user lookup pilot、async login/token user lookup pilot 與 async auth audit write pilot 已納入 RD/QA/QC/PM 文件。
- 本機 QC 結果已納入 QA/QC/PM 文件。

## 下一個開發切片

下一步不應直接切 production。建議順序：

1. 繼續將其他 read-only route 改成 async guard，例如 detail/report/import list routes。
2. 繼續抽出 async auth write helper，逐步移除 `ensureDemoUser` / user create/update password 的同步寫入依賴。
3. 新增對應 provider-neutral QC，證明 SQLite mode、Postgres SQL normalization 與 API response parity。
4. 等使用者確認 Supabase organization、region、cost 後，建立 `AI_PDM_STAGING`。
5. 對 staging 執行 target guard、migration apply、compare、RLS、advisor、Postgres-mode API regression。
6. Staging 通過後才建立 `AI_PDM_PROD` 並準備 production cutover。

## 不得做的事

- 不得把 `ProJED` 或 `ProJED_TEST` 當作 AI_PDM target。
- 不得把已清掉的測試檔案重新納入遷移。
- 不得把 Supabase service role、database password、pooler URL 放進 frontend bundle。
- 不得在沒有 advisor、RLS、smoke、rollback evidence 前宣稱 production cutover 完成。
- 不得把 Supabase Storage 混入 DB runtime completion。

## 2026-06-08 Phase 3H Index Addendum

- Added development evidence for async auth user write pilot.
- Primary code evidence: `src/lib/auth-config.ts`, `src/lib/repositories/user-async-repository.ts`, `src/lib/auth-async.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/token/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`.
- Verification status: `qc:access-control-async-repository` 42/42, `qc:managed-auth` 11/11, `tsc --noEmit` passed.
- Completion status: Supabase migration remains incomplete until live staging/prod validation and production cutover evidence are recorded.

## 2026-06-08 Phase 3I Index Addendum

- Added development evidence for `/api/settings` async runtime wiring.
- Primary code evidence: `src/lib/system-settings-async.ts`, `src/lib/auth-async.ts`, `src/app/api/settings/route.ts`.
- Primary QC evidence: `scripts/qc-system-settings-async-repository.mjs`.
- Verification status: `qc:system-settings-async-repository` 15/15, `qc:managed-auth` 11/11, `qc:gdrive-folder-tree-settings` 35/35, `qc:api` 391/391 with a temporary local dev server, `tsc --noEmit`, `lint -- --quiet`, and `build` passed. Build still reports the existing Turbopack NFT warning.
- Completion status at Phase 3I: Supabase migration remains incomplete until provider selection, live staging/prod validation, advisors, Postgres-mode regression, rollback, and production cutover evidence are recorded.

## 2026-06-08 Phase 3J Index Addendum

- Added development evidence for async runtime provider selection.
- Primary code evidence: `src/lib/db-async-provider.ts`, `src/lib/auth-async.ts`, `src/lib/audit-async.ts`, `src/lib/numbering-permission-async.ts`, `src/lib/system-settings-async.ts`, `.env.example`.
- Primary QC evidence: `scripts/qc-db-provider-contract-test.mjs`, `scripts/qc-db-provider-postgres.mjs`, `scripts/qc-access-control-async-repository.mjs`, `scripts/qc-system-settings-async-repository.mjs`.
- Verification status: `qc:db-provider-contract` 35/35, `qc:db-provider-postgres` 9/9 with live probe skipped because `PDM_POSTGRES_URL` is not configured, `qc:access-control-async-repository` 42/42, `qc:system-settings-async-repository` 15/15, `tsc --noEmit`, `qc:managed-auth` 11/11, `qc:pdm-numbering-core` 238/238, `lint -- --quiet`, `qc:gdrive-folder-tree-settings` 35/35, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3K Index Addendum

- Added development evidence for auth session route async migration.
- Primary code evidence: `src/app/api/auth/me/route.ts`, `src/app/api/auth/logout/route.ts`.
- Primary QC evidence: `scripts/qc-managed-auth-test.mjs`, `scripts/qc-access-control-async-repository.mjs`.
- Verification status: `qc:access-control-async-repository` 44/44, `qc:managed-auth` 18/18, `tsc --noEmit`, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3L Index Addendum

- Added development evidence for settings Google Drive admin route async guard migration.
- Primary code evidence: `src/app/api/settings/gdrive/folders/route.ts`, `src/app/api/settings/gdrive/folders/verify/route.ts`.
- Primary QC evidence: `scripts/qc-system-settings-async-repository.mjs`, `scripts/qc-gdrive-folder-tree-settings.mjs`.
- Verification status: `qc:system-settings-async-repository` 16/16, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `qc:gdrive-folder-tree-settings` 35/35, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3M Index Addendum

- Added development evidence for file metadata detect route async role guard migration.
- Primary code evidence: `src/app/api/file-metadata/detect/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`.
- Verification status: `qc:access-control-async-repository` 45/45, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `META-001` through `META-004` covered the authenticated metadata detect path.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3N Index Addendum

- Added development evidence for manufacturing handoff route async auth guard migration.
- Primary code evidence: `src/lib/auth-async.ts`, `src/app/api/handoff/route.ts`, `src/app/api/handoff/export/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`.
- Verification status: `qc:access-control-async-repository` 46/46, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `HANDOFF-001` through `HANDOFF-011` covered both handoff JSON and CSV export routes.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3O Index Addendum

- Added development evidence for search and notifications read-only route async auth guard migration.
- Primary code evidence: `src/app/api/search/route.ts`, `src/app/api/notifications/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`.
- Verification status: `qc:access-control-async-repository` 47/47, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-013`, `SEARCH-001` through `SEARCH-003`, and `NOTIFY-001` through `NOTIFY-009` covered search and notifications behavior.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3P Index Addendum

- Added clean Traditional Chinese master development document: `.ai-doc/reports/pm/supabase-db-migration-master-development-document-2026-06-08.md`.
- Purpose: consolidate full reset scope, Supabase DB-first decision, target guard, phased development plan, validation gates, risk controls, future modification policy, and completion definition into one readable development package.
- This master document is now the primary entry point for `DEV-SUPABASE-DB-001`; the existing PM/RD/QA/QC/SPEC/ADR documents remain supporting evidence.
- Supabase official documentation alignment recorded for RLS, secure data handling, and shared responsibility model.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3Q Index Addendum

- Added development evidence for item revision history and where-used read-only route async auth guard migration.
- Primary code evidence: `src/app/api/items/[partNumber]/revisions/route.ts`, `src/app/api/items/[partNumber]/where-used/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`.
- Verification status: `qc:access-control-async-repository` 48/48, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `HIST-001` through `HIST-006` and `WHEREUSED-001` through `WHEREUSED-011` covered item revision and where-used behavior.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3R Index Addendum

- Added development evidence for procurement releases integration read-only route async role guard migration.
- Primary code evidence: `src/app/api/integrations/procurement/releases/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`.
- Verification status: `qc:access-control-async-repository` 49/49, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `PROCAPI-001` through `PROCAPI-008` covered procurement releases auth, role guard, redaction, and filtering behavior.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3S Index Addendum

- Added development evidence for numbering permissions matrix route async auth guard hardening.
- Primary code evidence: `src/app/api/numbering/permissions/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`, `scripts/qc-pdm-numbering-permission-guard-ui.mjs`, and `scripts/qc-pdm-numbering-cross-role-permission.mjs`.
- Verification status: `qc:access-control-async-repository` 49/49, `tsc --noEmit`, `qc:pdm-numbering-permission-guard-ui` 35/35, `qc:pdm-numbering-cross-role-permission` 45/45, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: numbering permission UI and cross-role QC covered `/api/numbering/permissions`, role matrix toggles, custom role assignment, delegation, revocation, sidebar visibility, and backend guard parity.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3T Index Addendum

- Added development evidence for procurement sync-runs route async role guard migration.
- Primary code evidence: `src/app/api/integrations/procurement/sync-runs/route.ts`, `src/app/api/integrations/procurement/sync-runs/[runId]/route.ts`, and `src/lib/auth-async.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 50/50, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `ERPSYNC-001` through `ERPSYNC-012` covered sync-run auth, role guard, released-only gate, create/list/acknowledge, payload, external ref, and duplicate acknowledgement behavior.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3U Index Addendum

- Added development evidence for chat route async auth guard migration.
- Primary code evidence: `src/app/api/chat/route.ts` and `src/lib/auth-async.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 51/51, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and warmed `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-012`, `AI-009` through `AI-021`, and contextual AI checks covered chat auth, conversation persistence, cross-user 403, source payloads, and tool policy behavior.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3V Index Addendum

- Added development evidence for submission file download and PDF preview route async auth guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/files/[...filePath]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 52/52, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `AUTH-003` and `FILE-001` through `FILE-005` covered submission file auth, download, attachment disposition, PDF preview, PDF content type, and inline disposition behavior.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3W Index Addendum

- Added development evidence for submission discussions and review issues route async auth guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/discussions/[commentId]/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, and `src/app/api/submissions/[id]/issues/[issueId]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 53/53, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `DISCUSS-001` through `DISCUSS-014` and `ISSUE-001` through `ISSUE-013` covered discussion/issue auth, create/list/resolve behavior, file validation, manager visibility, and engineer scope isolation.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3X Index Addendum

- Added development evidence for submission change request route async auth and role guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/changes/route.ts` and `src/app/api/submissions/[id]/changes/[changeId]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 54/54, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHANGE-001` through `CHANGE-017` covered change request auth, validation, ECR/ECO/ECN create/list behavior, manager approval, duplicate-decision conflict, and engineer scope isolation.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3Y Index Addendum

- Added development evidence for submission phase gate route async auth and role guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/phase-gates/route.ts` and `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 55/55, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `PHASE-001` through `PHASE-013` covered phase gate auth, role denial, initialization, summary counts, approval blocking, decisions, duplicate-decision conflict, and release flow.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3Z Index Addendum

- Added development evidence for submission approval matrix route async auth and role guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/approval-matrix/route.ts` and `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 56/56, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, clean rerun `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `MATRIX-001` through `MATRIX-015` covered approval matrix auth, role denial, initialization, summary counts, Manager/Admin approvals, release gating, waiver, and manager-only release behavior.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3AA Index Addendum

- Added development evidence for submission preflight lock route async role guard migration.
- Primary code evidence: `src/app/api/submissions/preflight-lock/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 57/57, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHECKOUT-010` through `CHECKOUT-016` covered preflight auth, owner lock state, non-owner active lock state, and lock owner exposure.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3AB Index Addendum

- Added development evidence for submission checkout route async role guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/checkout/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 58/58, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and `qc:api` 391/391 with a temporary local dev server.
- Runtime route evidence: `qc:api` `CHECKOUT-001` through `CHECKOUT-009` covered checkout auth, role denial, acquire/reuse, competing conflict, owner exposure, and release behavior.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-08 Phase 3AC Index Addendum

- Added development evidence for approve/reject async role guard migration and file preview route stabilization.
- Primary code evidence: `src/app/api/submissions/[id]/approve/route.ts`, `src/app/api/submissions/[id]/reject/route.ts`, and `src/app/api/submissions/[id]/files/[...filePath]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 59/59, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-09 Phase 3AD Index Addendum

- Added development evidence for release package, share, and supplier response async guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/release-package/route.ts`, `src/app/api/submissions/[id]/shares/route.ts`, `src/app/api/submissions/[id]/shares/[shareId]/route.ts`, `src/app/api/submissions/[id]/supplier-responses/route.ts`, and `src/app/api/submissions/[id]/supplier-responses/[responseId]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 60/60, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-09 Phase 3AE Index Addendum

- Added development evidence for AI summary and AI risk async auth guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/ai-summary/route.ts` and `src/app/api/submissions/[id]/ai-risks/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs` and `scripts/qc-api-test.mjs`.
- Verification status: `qc:access-control-async-repository` 61/61, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-09 Phase 3AF Index Addendum

- Added development evidence for submission list/create/detail async auth and role guard migration.
- Primary code evidence: `src/app/api/submissions/route.ts` and `src/app/api/submissions/[id]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`, `scripts/qc-api-test.mjs`, `scripts/compare-sqlite-postgres-shadow.mjs`, and `scripts/qc-postgres-shadow-test.mjs`.
- Verification status: `qc:access-control-async-repository` 62/62, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning after clean rerun, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and redirected `qc:api` 391/391.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-09 Phase 3AG Index Addendum

- Added development evidence for submission BOM materialize/read/diff/export async auth guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/bom/route.ts`, `src/app/api/submissions/[id]/bom/diff/route.ts`, and `src/app/api/submissions/[id]/bom/export/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`, `scripts/qc-api-test.mjs`, `scripts/compare-sqlite-postgres-shadow.mjs`, and `scripts/qc-postgres-shadow-test.mjs`.
- Verification status: `qc:access-control-async-repository` 63/63, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and redirected `qc:api` 391/391.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-09 Phase 3AI Index Addendum

- Added development evidence for BOM workbench, draft, review, and release export async guard migration.
- Primary code evidence: `src/app/api/bom/workbench/route.ts`, `src/app/api/bom/drafts/from-assembly/route.ts`, `src/app/api/bom/drafts/import-xls/route.ts`, `src/app/api/bom/drafts/[draftId]/route.ts`, `src/app/api/bom/drafts/[draftId]/active/route.ts`, `src/app/api/bom/drafts/[draftId]/diff/route.ts`, `src/app/api/bom/drafts/[draftId]/submit-review/route.ts`, `src/app/api/bom/reviews/pending/route.ts`, `src/app/api/bom/reviews/[reviewId]/approve/route.ts`, `src/app/api/bom/reviews/[reviewId]/reject/route.ts`, and `src/app/api/bom/releases/[releaseId]/export/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`, BOM workbench QC scripts, `scripts/qc-api-test.mjs`, `scripts/compare-sqlite-postgres-shadow.mjs`, and `scripts/qc-postgres-shadow-test.mjs`.
- Verification status: `qc:access-control-async-repository` 64/64, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `build` with the existing Turbopack NFT warning, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, BOM workbench foundation 27/27, tree rules 22/22, release gate/resubmit 43/43, SolidWorks XLS import 34/34, release export 21/21, review/release 25/25, released-only permission 31/31, and redirected `qc:api` 391/391.
- Completion status: Supabase migration remains incomplete until configured live Supabase staging/prod validation, advisor/RLS review, Postgres-mode API regression, production cutover, and rollback evidence are recorded.

## 2026-06-09 Phase 3AJ Index Addendum

- Added development evidence for submission auxiliary route async guard migration and numbering approval batch detail async permission guard migration.
- Primary code evidence: `src/app/api/submissions/[id]/reuse-candidates/route.ts`, `src/app/api/submissions/[id]/duplicate-geometry/route.ts`, `src/app/api/submissions/[id]/retry-upload/route.ts`, `src/app/api/submissions/[id]/sandbox/route.ts`, `src/app/api/submissions/[id]/sandbox/[branchId]/route.ts`, `src/app/api/submissions/[id]/pdf-markups/route.ts`, `src/app/api/submissions/[id]/pdf-markups/[markupId]/route.ts`, and `src/app/api/numbering/approval-batches/[batchId]/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`, `scripts/qc-api-test.mjs`, `scripts/qc-pdm-numbering-core-test.mjs`, `scripts/compare-sqlite-postgres-shadow.mjs`, and `scripts/qc-postgres-shadow-test.mjs`.
- Verification status: `qc:access-control-async-repository` 66/66, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `qc:pdm-numbering-core` 238/238, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Static cleanup status: direct sync `@/lib/auth` imports/calls no longer appear under `src/app/api` route files.
- Completion status: Supabase migration remains incomplete until remaining sync numbering permission guards and repositories are migrated, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AK Index Addendum

- Added development evidence for remaining numbering API route permission guard async migration and numbering-adjacent parts API route permission guard async migration.
- Primary code evidence: `src/app/api/numbering/**/route.ts`, `src/app/api/parts/[partNumber]/**/route.ts`, `src/app/api/numbering/admin/matrix/route.ts`, and `src/app/api/numbering/approval-decisions/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`, `scripts/qc-pdm-numbering-core-test.mjs`, `scripts/qc-api-test.mjs`, `scripts/compare-sqlite-postgres-shadow.mjs`, and `scripts/qc-postgres-shadow-test.mjs`.
- Verification status: full API sync guard search returned no matches; `qc:access-control-async-repository` 68/68, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `qc:pdm-numbering-core` 238/238, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build` with the existing Turbopack NFT warning, and redirected `qc:api` 391/391.
- Static cleanup status: direct sync `@/lib/auth` imports/calls and sync numbering permission guard calls no longer appear under `src/app/api` route files.
- Completion status: Supabase migration remains incomplete until repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Executable Development Plan Index Addendum

- Added clean PM-dev executable development document: `.ai-doc/reports/pm/supabase-db-migration-executable-development-plan-2026-06-09.md`.
- Purpose: make the reset-to-Supabase plan directly executable as development work, with PM decision, current baseline, target architecture, Phase 0 through Phase 6 gates, RD rules, QA validation, QC fact-check rules, risk controls, future modification policy, and completion definition.
- Current PM status: `DEV-SUPABASE-DB-001` remains `In Progress`.
- Local status recorded: data reset is complete; migration mirror, target guard, async provider foundation, and API route guard migration through Phase 3AK are locally complete.
- Open blockers recorded: provider-neutral async domain repositories, real `AI_PDM_STAGING` / `AI_PDM_PROD` validation, Supabase advisors/RLS evidence, Postgres-mode API regression, production cutover, rollback drill, and Storage follow-up.
- Recommended next gate: Phase 3AL item revision history and where-used repository/provider-neutral conversion, unless the user chooses to configure live `AI_PDM_STAGING` first.

## 2026-06-09 Phase 3AL Index Addendum

- Added development evidence for item revision history and where-used provider-neutral async repository conversion.
- Primary code evidence: `src/lib/repositories/item-insight-async-repository.ts`, `src/lib/item-insights-async.ts`, `src/app/api/items/[partNumber]/revisions/route.ts`, and `src/app/api/items/[partNumber]/where-used/route.ts`.
- Primary QC evidence: `scripts/qc-access-control-async-repository.mjs`, `scripts/qc-api-test.mjs`, `scripts/compare-sqlite-postgres-shadow.mjs`, and `scripts/qc-postgres-shadow-test.mjs`.
- Verification status: item route sync DB search returned no matches; `qc:access-control-async-repository` 75/75, `tsc --noEmit`, `qc:managed-auth` 18/18, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, `build`, and `qc:api` 391/391 passed.
- Runtime route evidence: `qc:api` `HIST-001` through `HIST-006` and `WHEREUSED-001` through `WHEREUSED-011` remained green after the repository conversion.
- Completion status: Supabase migration remains incomplete until remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AM Index Addendum

- Added development evidence for dashboard metrics provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/dashboard-async-repository.ts`, `src/lib/dashboard-metrics-async.ts`, `src/app/api/submissions/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 81/81, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Completion status: Supabase migration remains incomplete until remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AN Index Addendum

- Added development evidence for submission list provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 87/87, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset.
- Completion status: Supabase migration remains incomplete until `searchSubmissions`, submission detail/create/write/upload paths, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AO Index Addendum

- Added development evidence for `/api/search` submission search provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/search/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 94/94, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business tables remained at 0 after validation.
- Completion status: Supabase migration remains incomplete until submission detail/create/write/upload paths and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AP Index Addendum

- Added development evidence for `/api/submissions/[id]` submission detail provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/submission-list-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/[id]/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 101/101, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business tables remained at 0 after validation.
- Completion status: Supabase migration remains incomplete until submission create/write/upload paths, file/download routes, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AQ Index Addendum

- Added development evidence for submission file metadata read/update provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/submission-file-async-repository.ts`, `src/lib/submission-files-async.ts`, `src/lib/file-response.ts`, `src/app/api/submissions/[id]/retry-upload/route.ts`, `src/app/api/submissions/[id]/pdf-markups/route.ts`, `src/app/api/submissions/[id]/discussions/route.ts`, `src/app/api/submissions/[id]/issues/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 108/108, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business and collaboration tables remained at 0 after validation.
- Completion status: Supabase migration remains incomplete until submission create/write/upload, collaboration repositories, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AR Index Addendum

- Added development evidence for collaboration discussion, review issue, and PDF markup list/create/resolve provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/lib/auth-async.ts`, six collaboration route files under `src/app/api/submissions/[id]/`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 116/116, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business, BOM, and collaboration runtime tables remained at 0 after validation, and no dev server was listening on 3000/3001/3101.
- Completion status: Supabase migration remains incomplete until submission create/write/upload, change request, phase gate, approval matrix, BOM, numbering, release, attachment, AI, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AS Index Addendum

- Added development evidence for change request list/create/decide provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/app/api/submissions/[id]/changes/route.ts`, `src/app/api/submissions/[id]/changes/[changeId]/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 123/123, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business, BOM, and collaboration runtime tables remained at 0 after validation, and no dev server was listening on 3000/3001/3101.
- Completion status: Supabase migration remains incomplete until submission create/write/upload, phase gate, approval matrix, BOM, numbering, release, attachment, AI, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AT Index Addendum

- Added development evidence for phase gate list/initialize/decide provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/collaboration-async-repository.ts`, `src/lib/collaboration-async.ts`, `src/app/api/submissions/[id]/phase-gates/route.ts`, `src/app/api/submissions/[id]/phase-gates/[checkId]/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 130/130, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business, BOM, and collaboration runtime tables remained at 0 after validation, and no dev server was listening on 3000/3001/3101.
- Completion status: Supabase migration remains incomplete until submission create/write/upload, approval matrix, BOM, numbering, release, attachment, AI, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AU Index Addendum

- Added development evidence for approval matrix list/initialize/refresh/waive provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/approval-async-repository.ts`, `src/lib/approval-async.ts`, `src/app/api/submissions/[id]/approval-matrix/route.ts`, `src/app/api/submissions/[id]/approval-matrix/[requirementId]/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 137/137, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business, BOM, and collaboration runtime tables remained at 0 after validation, and no dev server was listening on 3000/3001/3101.
- Completion status: Supabase migration remains incomplete until submission create/write/upload, approve/reject release decision flows, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AV Index Addendum

- Added development evidence for reject release decision flow provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/approval-async-repository.ts`, `src/lib/approval-async.ts`, `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/submission-status-async.ts`, `src/app/api/submissions/[id]/reject/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 144/144, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business, BOM, approval, and collaboration runtime tables remained at 0 after validation, and no dev server was listening on 3000/3001/3101.
- Completion status: Supabase migration remains incomplete until submission create/write/upload, approve release decision flow, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AW Index Addendum

- Added development evidence for approve release decision flow provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/submission-status-async.ts`, `src/lib/repositories/release-async-repository.ts`, `src/lib/release-records-async.ts`, `src/lib/release-async.ts`, `src/lib/release-package-async.ts`, `src/app/api/submissions/[id]/approve/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 153/153, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business, BOM, approval, collaboration, release, and sandbox runtime tables remained at 0 after validation, and no dev server was listening on 3000/3001/3101.
- Completion status: Supabase migration remains incomplete until submission create/write/upload, BOM, numbering, release package/share/supplier/sandbox, attachment, AI, and remaining domain repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AX Index Addendum

- Added development evidence for `/api/submissions` POST create/write provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/submission-write-async-repository.ts`, `src/lib/submissions-async.ts`, `src/app/api/submissions/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 161/161, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation, and no dev server was listening on 3000/3001/3101.
- Completion status: Supabase migration remains incomplete until BOM workbench/domain repositories, numbering, release package/share/supplier/sandbox, attachment, AI, and remaining sync repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.

## 2026-06-09 Phase 3AY Index Addendum

- Added development evidence for `/api/bom/workbench` GET summary read provider-neutral async repository conversion.
- Updated files: `src/lib/repositories/bom-workbench-async-repository.ts`, `src/lib/bom-workbench-async.ts`, `src/app/api/bom/workbench/route.ts`, `scripts/qc-access-control-async-repository.mjs`, and PM/RD/QA/QC/dev_task documents.
- Verification status: `qc:access-control-async-repository` 169/169, `tsc --noEmit`, `lint -- --quiet`, `db:postgres:compare -- --no-write`, `qc:postgres-shadow` 22/22, and `build` passed.
- Data hygiene status: full `qc:api` was intentionally skipped because it repopulates local `P-QC-*` test submissions after the clean DB reset; business, BOM, approval, collaboration, release, sandbox, and audit runtime tables remained at 0 after validation, and no dev server was listening on 3000/3001/3101.
- Completion status: Supabase migration remains incomplete until BOM draft create/save/active/diff/review/release/export paths, numbering, release package/share/supplier/sandbox, attachment, AI, and remaining sync repositories are migrated to provider-neutral async access, configured live Supabase staging/prod validation passes, advisor/RLS review passes, Postgres-mode API regression passes, and production cutover/rollback evidence is recorded.
