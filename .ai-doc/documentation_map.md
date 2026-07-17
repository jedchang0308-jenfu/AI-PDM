# AI_PDM Documentation Map

`.ai-doc` is the single project documentation center for AI_PDM. 本檔只做文件定位；DEV 狀態、
優先級、下一步與阻塞一律以 `.ai-doc/dev_task.md` 為準。

## Cold Start And Authority

- Canonical repo：`C:\VIBE CODING\AI_PDM`
- 冷啟動：`.ai-doc/cold-start.md`
- 任務權威：`.ai-doc/dev_task.md`
- 完成索引：`.ai-doc/archived/completed-dev-index-2026-06.md`、
  `.ai-doc/archived/completed-dev-index-2026-07.md`
- 先搜尋 DEV ID 或功能詞，只讀命中 package 與直接連結文件；不得把本檔當作全文必讀清單。

## Spec Impact Preflight

- 產品變更前，先用 DEV ID、route、API、table、status、permission 或錯誤訊息定位 active contract。
- 對照 scope、out of scope、authoritative source、ADR、狀態轉換、資料／權限與驗收。
- 結論分類：`No conflict`、`Compatible exception`、`Intentional replacement`、
  `Unresolved conflict`。
- `Unresolved conflict` 不得改碼；找不到 active spec 的 Medium／High 變更必須先補契約或取得決策。

## Current Work Packages

### DEV-032 — Production Release

- 任務與 Gate：`.ai-doc/dev_task.md`（搜尋 `DEV-032`）
- Production ingress authority：
  `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`
  （搜尋 `Production Ingress Amendment`）、
  `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`
  （搜尋 `Current approved production ingress`）
- 人類 handoff：`.ai-doc/reports/pm/pm-dev-032-human-handoff-2026-07-16.md`
- Release package：`.ai-doc/reports/pm/pm-dev-032-production-gate-package-2026-07-15.md`
- Activation runbook：`.ai-doc/runbooks/runbook-dev-032-production-activation-2026-07-15.md`
- Restore/reconciliation：
  `.ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md`
- Current release / Wave 0 closure：`output/dev-032-gate-e-closure/report.json`、
  `output/dev-032-production-activation-readiness/report.json`、
  `output/dev-032-gate-e-automation/human-work-package.md`
- Release decision：2026-07-17 Product Owner `GO`；僅涵蓋正式領號／草稿 production slice。

### DEV-049 — Status Axis UX

- Authoritative spec：`.ai-doc/specs/SPEC-PDM-STATUS-UX-003-state-axis-vocabulary-and-header-help.md`
- Prior contracts：`.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`、
  `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`
- Next-step contract：`.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`
- Implementation source：`src/lib/status-display.ts`、`src/lib/status-scope-display.ts`、
  `src/components/status-help-popover.tsx`
- Inventory：`output/dev-049-status-scope-inventory/status-scope-inventory.json`、
  `output/dev-049-status-scope-inventory/status-scope-inventory.md`（22 routes / 198 sections / 4 exceptions）
- Browser evidence：`output/playwright/dev-049-status-scope/status-scope-browser-metrics.json`
  （40/40；1440、1024、768、390、320；browserErrors=[]）
- Number effectiveness evidence：
  `output/playwright/dev-049-number-effectiveness/number-effectiveness-metrics.json`
- Local QC：`qc:pdm-status-ui-vocabulary` 97/97、`qc:pdm-status-scope-coverage` 86/86、
  `qc:pdm-number-effectiveness-ui` 5/5、`qc:pdm-number-effectiveness-browser` 5/5、
  `qc:pdm-number-state-flow-phase1b` 14/14、
  `qc:pdm-number-state-flow-request-equivalence` 11/11、
  `qc:pdm-master-workbench-layout` 207/207、TypeScript、lint、`git diff --check`

### DEV-041 — Transfer Package Intake

- Authoritative spec：
  `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
- QA：`.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`
- Phase 3A-0 QC：`.ai-doc/qc/qc-pdm-transfer-package-phase3a0-report-2026-07-13.md`

### DEV-047 — Bounded Schema Migration

- Authoritative spec：`.ai-doc/specs/SPEC-PDM-ERP-BOUNDED-SCHEMA-MIGRATION-001.md`
- QA：`.ai-doc/qa/qa-pdm-erp-bounded-schema-migration-validation-plan-2026-07-13.md`
- A0 QC：`.ai-doc/qc/qc-dev-047-phase-a0-local-inventory-tooling-2026-07-13.md`

## Re-entry And Merged Packages

- `DEV-015`：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`；
  先由人類選定單一 Phase 2+ slice。
- `DEV-030`、`DEV-031`：不獨立派工；contract 與證據由 `DEV-032` package 承接。
- `DEV-033`、`DEV-037`：
  `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`；
  只在 Phase 3B/file workflow 明確 re-entry 後使用。
- `DEV-035`：No active spec found；恢復 CAD 2D/native metadata 前必須先建立 active contract。
- `DEV-036`：No active spec found；已停止路線，只有新產品決策可恢復。
- `DEV-038`：人類決策取消；歷史與 release 邊界見 `DEV-046`、`DEV-032`，不得當作 field-test pass。

## Completed And Protected Dependencies

- `DEV-005`：`.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
- `DEV-034`：`data/quality/postgres-shadow/shadow-compare-1783676196559.json`
- `DEV-040`：`.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`、
  `.ai-doc/decisions/ADR-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch-boundary.md`
- `DEV-042`：`.ai-doc/qa/qa-pdm-account-invitation-validation-plan-2026-07-10.md`、
  `.ai-doc/qc/qc-pdm-account-invitation-report-2026-07-10.md`
- `DEV-043`：`.ai-doc/qa/qa-pdm-google-identity-validation-plan-2026-07-10.md`、
  `.ai-doc/qc/qc-pdm-google-identity-report-2026-07-10.md`
- `DEV-044`：`.ai-doc/specs/SPEC-PDM-ERP-MODULE-FOUNDATION-001-platform-contract.md`、
  `.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-001-integration-ready-boundary.md`
- `DEV-045`：`.ai-doc/specs/SPEC-PDM-ACCOUNT-LIFECYCLE-001-admin-account-security-console.md`
- `DEV-046`：保護項目；權威入口為 `.ai-doc/dev_task.md` 原區塊、
  `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`、
  `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`
- `DEV-048`：
  `.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`、
  `.ai-doc/decisions/ADR-PDM-NUMBER-STATE-FLOW-001-publish-boundary-and-candidate-reservation.md`

其餘完成 DEV 的來源 ID、摘要與證據只在 completed index 展開；本檔不複製完成歷史。

## Directory Routing

- SPEC：`.ai-doc/specs/`
- ADR：`.ai-doc/decisions/`
- QA plans：`.ai-doc/qa/`
- QC facts：`.ai-doc/qc/`
- RD reports：`.ai-doc/reports/rd/`
- PM/release evidence：`.ai-doc/reports/pm/`
- Runbooks：`.ai-doc/runbooks/`
- Historical snapshots：`.ai-doc/archived/`

## Governance Boundary

- `.ai-doc` 是 canonical root；不得另建平行 `ai-doc`。
- map 不記錄第二份 DEV 狀態，不保存 PM update timeline，也不把文件 ready 當產品 done。
- completed/protected 文件只供追溯；production、migration、正式資料與 release 仍需對應 gate。
