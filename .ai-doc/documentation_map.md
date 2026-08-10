# AI_PDM Documentation Map

This project uses `.ai-doc` as the single project documentation center.

Cold start / progressive-read rule:

1. Read `.ai-doc/cold-start.md` first for the low-token current boundary.
2. Open `.ai-doc/dev_task.md` and read only `### 派工規則` and `### 目前派工任務清單`; do not load the full
   `## 總任務清單` container.
3. If a DEV ID is known, search its canonical index item and read only until the next peer DEV item.
   If it is unknown, search by status symbol and feature term before opening any task detail.
4. Select the target DEV / package from `dev_task.md`; then return to this map only for the matching package heading.
5. Read only directly linked package docs for the selected DEV. Do not load unrelated `specs/`, `qa/`, `qc/`,
   `reports/`, `archived/`, or historical package sections.
6. Full-map reads are allowed only for documentation-map maintenance, archive restructuring, or explicit cross-package
   consistency audits.
7. Before product code/API/schema/state/permission/UI-flow/acceptance/release behavior changes, run the Spec Impact
   Preflight in `.ai-doc/cold-start.md`; classify the result as `No conflict`, `Compatible exception`,
   `Intentional replacement`, or `Unresolved conflict`.
8. Current production warning: `DEV-032` is the only active first-version release entry. `DEV-030/031` are traceable
   sub-gates inside `DEV-032 Gate B/C`; `DEV-046` Phase 2B is complete and future phases require explicit re-entry.

## 1. Authoritative Entry Points

| Need | Read |
|---|---|
| Current task, blockers, next executable work | `.ai-doc/dev_task.md` |
| PDM 核心物料身份治理：何時升 Drawing/BOM Rev、何時換 Part Number | `.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`; `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`; `.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md`。Part Number 是無版次的物料身份；Drawing 與 BOM 各自獨立版控。同身份只升受影響定義 Rev；FFF、互換性、法規／品質管制或其他身份條件改變時建立新 Part Number，並建立其自己的 BOM。未來跨模組 DEV 必須遵守。 |
| DEV-062 料號／圖料單頁工作台與共用 Workbench Core | `.ai-doc/dev_task.md` (`DEV-062`); core authority `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`; architecture `.ai-doc/decisions/ADR-PDM-WORKBENCH-CORE-001-shared-mechanics-and-domain-adapters.md`; domain amendments `.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`, `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`; validation `.ai-doc/qa/qa-dev-062-unified-part-relation-workbench-validation-plan-2026-08-10.md`; QC `.ai-doc/qc/qc-dev-062-unified-part-relation-workbench-report-2026-08-10.md`. Status: `Local RD Implemented / Fixed-3000 QA-QC Passed / Release Gated`。Isolated run `DEV062-20260810-121012-local-isolated`通過aggregate 15/15、contract 40/40、browser 33/33；使用者截圖重開QC後，fixed runtime run `DEV062-FIX-20260810124507-fixed3000`再通過10/10，證明兩路由hard reload後舊頁籤DOM=0、formal/candidate同頁、legacy URL正規化、visible／console／server error為0。Fixed local launcher預設啟用DEV-062且health check會阻擋Legacy狀態；production/deploy/release仍未執行。 |
| DEV-061 圖號／料號檔案歸屬、送審必備檔與 3D 內容共用 | `.ai-doc/decisions/ADR-PDM-FILE-OWNERSHIP-001-contextual-files-and-3d-content-reuse.md`; `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`; `.ai-doc/qa/qa-dev-061-pdm-file-ownership-and-3d-reuse-validation-plan-2026-08-10.md`; `.ai-doc/qa/qa-dev-061-ai-real-operation-validation-plan-2026-08-10.md`; `.ai-doc/qa/DEV-061-real-operation-evidence-2026-08-10.md`; `.ai-doc/dev_task.md` (`DEV-061`)。Status: `Local RD Implemented / Focused QA-QC Passed / Production Release Gated`。圖號只放受控版次檔，料號保留精簡且不收合的文件清單；每次首版／進版 hard-require 本次上傳 `.SLDDRW` + `.SLDPRT/.SLDASM`，相同 3D bytes 在 company/owner scope 內自動共用 canonical asset。既有無引用圖號一般／參考附件只可依 dry-run、protected reference scan 與 release gate 清理。 |
| Task-driven human status projection, viewer responsibility and R&D/production availability scope | `.ai-doc/specs/SPEC-PDM-STATUS-UX-004-human-status-projection.md`; `.ai-doc/decisions/ADR-PDM-STATUS-UX-004-task-driven-human-status-projection.md`; `.ai-doc/qa/qa-pdm-human-status-projection-validation-plan-2026-08-06.md`; `.ai-doc/qc/qc-dev-055-human-status-projection-2026-08-06.md`; `.ai-doc/dev_task.md` (`DEV-055`). Status: `Local RD Implemented / QA-QC Passed / Production Release Gated`. Current executable boundary: Phase 1A～1D local projector、server projection/filter、viewer responsibility、availability scope、three lists/shared owner drawers and browser QA/QC; no schema/migration、production、deploy or release. |
| Phase 1 native SolidWorks preview auto-orchestration follow-up | `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`; `.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`; `.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`; `.ai-doc/dev_task.md` (`DEV-056`). Status: `Local RD / QA-QC Passed / Production Release Gated`. Scope completed: auto-enqueue on list/create, foreground auto-refresh, heartbeat, stale recovery, worker-owner guard and concise icon/tone/motion UI; no Phase 2 PDF, interactive 3D, production or real key rollout. |
| Google Secret Manager authority and SolidWorks 2D worker credential integration | `.ai-doc/specs/SPEC-PDM-GCP-SECRET-MANAGER-001-solidworks-worker-credential.md`; `.ai-doc/qa/qa-pdm-gcp-secret-manager-solidworks-worker-validation-plan-2026-08-07.md`; `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`; `.ai-doc/dev_task.md` (`DEV-058`). Status: `RD Implementation Ready / Human Confirmed / RD Not Started / Production Release Gated`. This intentionally replaces the old Supabase Vault provider direction while retaining generic settings lifecycle/redaction rules. Current executable boundary is local provider/schema/lifecycle/broker/readiness/QC only; live GCP resource/IAM/deploy/release is excluded. |
| Simplified drawing detail workcard, shared `DrawingWorkspaceDrawer`, state-driven CTA hierarchy and discoverable secondary actions | `.ai-doc/dev_task.md` (`DEV-057`); authoritative UI contract `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`; QA/evidence `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`, `output/qa/pdm-entity-detail-drawer-ai/20260808021459-single-workspace-recheck/`; related authority `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`, `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`, `.ai-doc/specs/SPEC-PDM-STATUS-UX-004-human-status-projection.md`. Status: `Local RD Implemented / UI Replacement Requested / Release Not Authorized`. A0005 正式圖號抽屜保留為唯一現行視覺基準；候選與審核抽屜暫停掛載並待重新設計，API、資料與審核命令契約先保留。 |
| Candidate bundle submit confirmation modal local-close, reload/history/bfcache/runtime recovery and AI real-operation validation | `.ai-doc/specs/SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001.md`; `.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md`; `.ai-doc/qa/DEV-059-real-operation-evidence-2026-08-09.md`; `.ai-doc/dev_task.md` (`DEV-059`, child development point of `DEV-057`). Status: `Local RD Implemented / Focused AI QA-QC Passed / Commit Pending / Production Release Gated`; parent `DEV-057` remains release-gated. Current evidence covers same-route dynamic root-cause reproduction, local UI lifecycle/recovery, focused regression, AI real browser and isolated flow/integration fault coverage. Shared-data mutation, cloud/production/deploy/release remain unauthorized; complete parent PASS still requires isolated disposable UI mutation run. |
| Revision release gate, minor/major lifecycle policy and server-created suggested revision snapshot | `.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`; `.ai-doc/qa/qa-pdm-revision-policy-release-gate-validation-plan-2026-07-17.md`; `.ai-doc/dev_task.md` (`DEV-050`) |
| Reservation-to-first-drawing revision timing UX, rowVersion display, publication-gated first drawing CTA, implementation and QA/QC evidence | `.ai-doc/specs/SPEC-PDM-REVISION-TIMING-UX-001-reservation-first-drawing-revision-entry.md`; `.ai-doc/qa/qa-pdm-revision-timing-ux-validation-plan-2026-07-18.md`; `output/playwright/dev051-reservation-revision-timing-ux/`; `.ai-doc/dev_task.md` (`DEV-051`) |
| Efficiency-first reservation, candidate first-drawing, bundle review and approval auto-finalization with additive adoption of existing production reservations | `.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`; `.ai-doc/decisions/ADR-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-additive-adoption-and-auto-finalization.md`; `.ai-doc/qa/qa-pdm-number-lifecycle-simplification-validation-plan-2026-08-03.md`; `.ai-doc/qc/qc-dev-052-number-lifecycle-simplification-2026-08-04.md`; `.ai-doc/dev_task.md` (`DEV-052`). Status: `Phase 1A-1D Independent Local QC Passed / Production Release Gated`; the retained `保留號` tab at `/numbering/drawings?tab=reserved`, V2 `保留號／首版準備` workspace, candidate-first-revision bundle review and atomic auto-finalization are implemented locally. Latest independent run `DEV052-20260806-015522-local-isolated` passed schema 12/12, data protection 4/4, HTTP 10/10, UI 16/16, flow 8/8 and AI real-operation 41/41 with production writes false and cleanup removed. V2 remains default-off and outside the production mutation allowlist until GCS, migration and release gates pass. |
| Human-confirmed single drawing workbench that removes the `圖號總表／保留號` page split while preserving separate candidate/master/revision/approval authority and all existing formal drawing-management capabilities | `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`; `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`; `.ai-doc/qa/qa-pdm-unified-drawing-workbench-validation-plan-2026-08-04.md`; `.ai-doc/qc/qc-dev-053-unified-drawing-workbench-2026-08-04.md`; `.ai-doc/dev_task.md` (`DEV-053`). Status: `Phase 1H Independent Local QC Passed / Commit Pending / Production Release Gated`。Phase 1F 92/92證據保留為歷史基線；Phase 1H AI QA與獨立QC各59/59，真實Chromium、TypeScript、30檔scoped lint、isolated build、Supabase mirror 76/76及approval-platform 126/126通過。Fresh flow沒有legacy submission／永久task／notification，terminal後transient graph清除而正式package/files/三料scope保留；DEV-054持續為受保護並行任務。 |
| Current DEV-053 Phase 1G one-drawing/multi-part batch revision scope, atomic release and legacy-data compatibility | `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`; `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`; `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`; `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`; `.ai-doc/dev_task.md` (`DEV-053 Phase 1G`). Status: `Multi-Part Local RD / AI QC Passed / Commit Pending / Production Migration & Release Gated`. A0005-M01 defaults P01/P02/P03 selected, permits a non-empty subset, creates one submission/shared attachment package, freezes `submission_part_scopes`, and releases all scoped parts atomically. Existing submissions/reservations are not backfilled; PostgreSQL/Supabase 025 exists only as a local additive artifact. Confirmed-impact multi-part remains fail closed pending per-old-part replacement mapping. DEV-054 remains protected. |
| Current DEV-053 Phase 1H single lifecycle and approval-authority convergence | `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md` (`0.10`); `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`; `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-003-drawing-revision-lifecycle-only-retention.md`; `.ai-doc/qa/qa-pdm-unified-drawing-workbench-validation-plan-2026-08-04.md` (`9G`); `.ai-doc/qc/qc-dev-053-unified-drawing-workbench-2026-08-04.md` (`18`); `.ai-doc/dev_task.md` (`DEV-053 Phase 1H`). Status: `Local RD Implemented / AI QA + Independent QC Passed / Production Release Gated`. Target `2-1-1-0` is implemented: two operational surfaces, one lifecycle truth, one role-appropriate primary action and zero visible legacy submission/audit surfaces. Decisions `1A/2A/3A/4C/5A/6A/7A/8B/9B/10B` are covered by the additive 026 migration, native action, durable part scope, transient workflow/reviewer/token, narrow cleanup guards, active adopter and canonical route/UI projection. Independent run `DEV053-PHASE1H-20260806-134417` passed 59/59 with production connection/write false and cleanup removed. Commit, live adoption/migration, flag activation, deploy and release remain separately unauthorized; DEV-050 policy and DEV-054 protected scope remain unchanged. |
| Five-year Google Cloud ERP platform, IAM, Cloud SQL Taiwan, storage and ontology authority | `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`; `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`; `.ai-doc/qa/qa-pdm-erp-google-cloudsql-platform-validation-plan-2026-07-13.md` |
| RD supervisor multi-level review and closed `HD-6` / `HD-7` / `HD-8-1..4` decisions | `.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-document-review-2026-07-13.md` |
| DEV-046 Phase 2B local Firebase BFF implementation and QC evidence | `.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-phase2b-local-firebase-bff-implementation-2026-07-13.md`; `.ai-doc/qc/qc-pdm-erp-google-cloudsql-phase2b-local-firebase-bff-report-2026-07-13.md` |
| DEV-046 Phase 2B Cloud SQL admin bootstrap and live migration evidence | `output/dev-046-live-migration/execution-summary.json`; `output/dev-046-live-migration/execution-summary.md` |
| DEV-046 staging Firebase Hosting entrypoint, targeted Cloud Run plan/apply and runtime smoke | `output/dev-046-firebase-hosting/deployment-summary.json`; `output/dev-046-firebase-hosting/plan-summary.json`; `output/dev-046-firebase-hosting/runtime-smoke.json` |
| DEV-046 application artifact provenance and local dirty-candidate evidence | `output/dev-046-artifact-provenance/report.json`; `output/dev-046-artifact-provenance/local-candidate-smoke.json` |
| DEV-032 production release gate pre-build, source-boundary, commit-plan and production-target preflight evidence | `.ai-doc/reports/pm/pm-dev-032-production-release-gate-preflight-2026-07-15.md`; `.ai-doc/reports/pm/pm-dev-032-source-boundary-classification-2026-07-15.md`; `.ai-doc/reports/pm/pm-dev-032-release-source-manifest-2026-07-15.md`; `output/dev-032-release-source/manifest.json`; `output/dev-032-release-source/commit-plan.json`; `output/dev-032-production-target-preflight/report.json` |
| DEV-032 production canary seed / allowlist / restore gate package | `config/platform/clean-production-seed.template.json`; `config/platform/production-activation-checklist.template.json`; `config/platform/production-activation-evidence.json`; `.ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md`; `.ai-doc/runbooks/runbook-dev-032-production-activation-2026-07-15.md`; `.ai-doc/reports/pm/pm-dev-032-production-gate-package-2026-07-15.md`; `output/dev-032-production-live-readback/report.json`; `output/dev-032-production-activation-readiness/report.json`; `scripts/capture-dev-032-production-live-readback.mjs`; `scripts/generate-dev-032-production-activation-readiness.mjs`; `scripts/qc-dev-032-release-gate-package.mjs`; `scripts/qc-dev-032-production-activation-checklist.mjs`; `scripts/qc-dev-032-production-activation-readiness.mjs` |
| DEV-032 Gate A-E canonical production execution sequence | `.ai-doc/dev_task.md` (`DEV-032`); A=config/plan review, B=resource apply, C=clean seed/restore/reconciliation, D=immutable deploy/smoke, E=named-user canary |
| DEV-046 initial staging Admin principal bootstrap proposal, readback, access rollback and disposable PostgreSQL evidence | `output/dev-046-staging-principal-bootstrap/manifest.json`; `output/dev-046-staging-principal-bootstrap/report.md`; `output/dev-046-staging-principal-bootstrap/shadow-report.json` |
| DEV-046 employee-number login alias local implementation and QC evidence | `.ai-doc/reports/rd/rd-dev-046-employee-login-alias-local-slice-2026-07-13.md`; `.ai-doc/qc/qc-dev-046-employee-login-alias-local-slice-2026-07-13.md` |
| DEV-046 employee privacy notice and acknowledgement local implementation/QC | `.ai-doc/specs/SPEC-PDM-EMPLOYEE-PRIVACY-NOTICE-001-pilot-notice-and-acknowledgement.md`; `.ai-doc/reports/rd/rd-dev-046-privacy-notice-acknowledgement-local-slice-2026-07-13.md`; `.ai-doc/qc/qc-dev-046-privacy-notice-acknowledgement-local-slice-2026-07-13.md` |
| Internal-pilot account lifecycle and security console | `.ai-doc/specs/SPEC-PDM-ACCOUNT-LIFECYCLE-001-admin-account-security-console.md`; `.ai-doc/qa/qa-pdm-account-lifecycle-validation-plan-2026-07-12.md`; `.ai-doc/qc/qc-pdm-account-lifecycle-report-2026-07-13.md` |
| ERP-ready AI_PDM Phase 1-3 boundary, identity decisions and evidence | `.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-001-integration-ready-boundary.md`; `.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-002-shared-identity-governance.md`; `.ai-doc/specs/SPEC-PDM-ERP-MODULE-FOUNDATION-001-platform-contract.md`; `.ai-doc/reports/rd/rd-pdm-erp-module-foundation-phase1-3-report-2026-07-12.md`; `.ai-doc/qc/qc-pdm-erp-module-foundation-report-2026-07-12.md` |
| Pre-deploy local development completion audit | `.ai-doc/reports/pm/pm-predeploy-development-completion-audit-2026-07-10.md` |
| Completed DEV / gate evidence index | `.ai-doc/archived/completed-dev-index-2026-06.md`; `.ai-doc/archived/completed-dev-index-2026-07.md` |
| Archive policy and snapshots | `.ai-doc/archived/README.md` |
| Requirements and design specs | `.ai-doc/specs/` |
| Architecture decisions | `.ai-doc/decisions/` |
| QA plans | `.ai-doc/qa/` |
| RD implementation reports | `.ai-doc/reports/rd/` |
| QC and evidence reports | `.ai-doc/reports/qc/`, `.ai-doc/qc/` |
| PM handoff / release / governance reports | `.ai-doc/reports/pm/` |
| Runbooks | `.ai-doc/runbooks/` |

Historical snapshots:

- `.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`
- `.ai-doc/archived/dev_task_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/documentation_map_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/dev_task_legacy_before_pm_cleanup_2026-06-16.md`
- `.ai-doc/archived/report-path-index.md`

## 2. Current Dispatch Status / Non-Executable Work

Current dispatch rule:

- No local product DEV is automatically executable from this section. The authoritative PM dispatch entry is `.ai-doc/dev_task.md` Section `目前派工任務清單`.
- `DEV-PDM-ERP-MODULE-FOUNDATION-001` / `DEV-044` Phase 1-3 is complete locally with QC evidence. Phase 4 ERP shell and all production IAM/migration/release work remain unexecuted; no phase may modify ProJED.
- `DEV-PDM-ACCOUNT-LIFECYCLE-001` / `DEV-045` Phase 1 and Phase 2 local slice are complete locally with QC evidence. It adds the consolidated 「帳號與權限」 settings area, Admin account list/detail, lifecycle, identity status, global session revoke, provider-managed recovery handoff, self-service session/device visibility, one-time password reset compatibility and role time-window enforcement without starting live Firebase Auth / Identity Platform/MFA/provider/release work.
- Local product-slice implementation is complete, but production release is not. DEV-046 Phase 1A-1E, Phase 2A staging IaC, Phase 2B local application slices and Phase 2B staging authentication activation are complete. Staging now runs through Firebase Hosting's default `web.app` domain and Cloud Run `ai-pdm-stg`; the current recorded staging revision is `ai-pdm-stg-00015-tim`, image `sha256:9a6ba6dd1d2c6e2266ee477e4014c4378d36e95107990f30c3bf2dd29b34138b`, 100% traffic. Admin bootstrap, 18-version Cloud SQL migration/idempotence, live principal mapping, AAL1 Workspace pilot exception, privacy acknowledgement cookie handoff and dashboard PostgreSQL compatibility hotfix evidence are recorded in `.ai-doc/dev_task.md`. No Firestore, Firebase Storage, Firebase Functions, GCS file authority, public DNS record or production runtime resource was created. Public custom-domain DNS/TLS remains deferred. The only launch-moving boundary is `DEV-032 Gate A-E`; `DEV-030/031` are its database/data-continuity sub-gates, while DEV-046 Phase 3B+ remains future scope.
- 2026-07-15 DEV-032 production release gate pre-build result: blocked before production build/deploy. Evidence reports `.ai-doc/reports/pm/pm-dev-032-production-release-gate-preflight-2026-07-15.md`, `.ai-doc/reports/pm/pm-dev-032-source-boundary-classification-2026-07-15.md`, `.ai-doc/reports/pm/pm-dev-032-release-source-manifest-2026-07-15.md`, `.ai-doc/reports/pm/pm-dev-032-production-iac-review-package-2026-07-15.md` and `.ai-doc/reports/pm/pm-dev-032-production-gate-package-2026-07-15.md` record Lane 3 release scope, classified and hashable dirty source boundary, verified release-source commit pathspec, current release-candidate HEAD, template-checked clean seed/allowlist/restore package, template-checked production target contract, fail-closed production Terraform review package with Docker Terraform static validate evidence, staging-only Firebase config, missing real production env/secret readback, missing credentialled production plan/resource readback, missing real `HD-8-4 / 1A` restore/reconciliation execution, real production runtime/database/secret inventory, rollback and smoke evidence. Production GCP project `jenfu-ai-pdm-prod` has now been created/read back under organization `361825816000` as project number `451715062958`, but no billing link, Cloud Run, Cloud SQL, Secret Manager, Firebase production config, Terraform apply, deploy, migration or DNS action has been performed. The current release-candidate source includes the read-only draft number preview/no-reservation route and matching number-state QC coverage. `config/platform/production-target.template.json` defines the template-only production baseline, `infra/google-cloud/production/` defines the fail-closed review package, `output/dev-032-production-iac-terraform-validate/report.json` records Docker Terraform 1.14.5 `fmt/init -backend=false/validate` evidence, and `output/dev-032-production-target-preflight/report.json` is the reproducible read-only production target preflight; it currently returns `blocked_readonly_preflight` with production action `false`. `output/dev-032-release-source/commit-plan.json` and its included pathspec make the exact release commit step reviewable and have been applied; generated evidence and staging-only provider files remain outside source. Local checks passed (`build:isolated`, TypeScript, lint with warnings only, number-state request-equivalence/contract/HTTP/runtime/UI/Phase1B, numbering-core, production-slice QC, DEV-046 Phase 2B QC, Hosting entrypoint QC, DEV-032 source/gate package QC, DEV-032 source commit-plan QC, DEV-032 production IaC/Terraform validate/target contract/preflight QC, doc-paths and dev-task audit), but they are not Level 3/4 release evidence. Production runtime remains untouched.
- 2026-07-15 follow-up staging deploy: AI_PDM no longer starts its own TOTP enrollment for Google Workspace users. The user also deferred Google Workspace admin-side 2-Step Verification for the initial 3-person internal pilot, so staging now allows verified Firebase `google.com` sign-in plus configured Workspace domain (`jenfu.com.tw`) as an explicit AAL1 pilot exception via `PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED=true`; `PDM_TRUST_GOOGLE_WORKSPACE_MFA=false` because Workspace 2SV is not yet enforced. Deployed Cloud Run revision `ai-pdm-stg-00007-cam`, image `sha256:c677ab0822328944c304afc17877963f611f010c972400fed838ce5153d1818c`, 100% traffic; rollback target is `ai-pdm-stg-00005-4xp`.
- 2026-07-15 privacy acknowledgement staging hotfix: fixed the Google sign-in -> employee privacy acknowledgement handoff that lost the session across Firebase Hosting/Cloud Run rewrite and left `/privacy/acknowledgement` at "確認工作階段已失效". Root cause: Firebase Hosting only forwards the reserved `__session` cookie to Cloud Run, while the app previously relied on `pdm_session`. The fix writes both `__session` and `pdm_session`, reads `__session` first for Firebase Hosting, uses `NextResponse.cookies.set()` and a 200 body-code `privacy_ack_required` login handoff while protected BFF APIs still fail closed with the privacy 428 gate until acknowledgement. Evidence: privacy QC 20/20, Phase 2B QC 15/15, employee alias QC 21/21, TypeScript, isolated build, local container smoke, candidate and official staging `/login` + `/api/auth/mode` + unauth privacy API gate, and browser smoke with no TOTP enrollment or material runtime failure. Human Google-account acknowledgement retest subsequently passed; production remains untouched.
- 2026-07-15 dashboard PostgreSQL compatibility staging hotfix: after human login succeeded through `https://jenfu-ai-pdm-stg-361825.web.app`, dashboard startup showed 500s on `/api/submissions`, `/api/lifecycle/controlled-history`, `/api/notifications` and `/api/approvals/inbox`. Cloud Run stderr showed Postgres parameter type inference `42P08` in `listSubmissions` plus a notification aggregate `GROUP BY` incompatibility. Current staging Cloud Run revision is `ai-pdm-stg-00015-tim`, image `sha256:9a6ba6dd1d2c6e2266ee477e4014c4378d36e95107990f30c3bf2dd29b34138b`, 100% traffic. Evidence: TypeScript, isolated build, DEV-046 privacy QC 20/20, Phase 2B QC 15/15, employee alias QC 21/21, candidate and official staging `/login` + `/api/auth/mode` + unauth privacy API gate. Authenticated dashboard API retest is the remaining field confirmation for this specific hotfix; rollback target is `ai-pdm-stg-00013-vev`.
- Employee privacy notice and UI contract: `.ai-doc/specs/SPEC-PDM-EMPLOYEE-PRIVACY-NOTICE-001-pilot-notice-and-acknowledgement.md`; machine-readable contract: `config/platform/employee-privacy-notice.template.json`. Pilot v1.0 is company-approved and becomes effective on staging opening; minimum official-number/non-reuse records are permanent, while closed/cancelled drafts and operation audit are retained for three years. Immutable version/hash, activation acknowledgement, permanent employee access, protected BFF recheck and read-only Admin evidence are locally implemented and QC-accepted. Actual staging effective timestamp, Cloud SQL migration and provider-backed Google/non-Google evidence remain live gates.
- The package entries below are current implementation context, protected evidence, or read-order guidance. They must not override `dev_task.md` status symbols, stop conditions, release gate wording, or external-evidence blockers.
- Documentation-only governance work remains allowed when scoped to `.ai-doc/dev_task.md`, `.ai-doc/documentation_map.md`, `.ai-doc/archived/`, or the current PM audit report.
- `DEV-PDM-NUMBER-STATE-FLOW-001` / `DEV-048` is `Phase 1E P0 QC Passed / Local Product Integration Complete / Local Only`. Phase 1A-1D local QC passed, and Phase 1E P0 repaired the post-048 create-numbering managed naming, drawing-need guidance and warning-only duplicate-check gap inside DEV-048, not a new DEV. Do not change v3 numbering, `000` universal number behavior, or M/R purpose-code design in this phase. G8/G9 live provider/staging/release remain unexecuted. `HD-048-01..03` are closed by human decisions `1C / 2C / 3C`. Read the package before changing numbering, draft, approval/publication, status, sidebar, transfer or handoff behavior.
- `DEV-PDM-REVISION-POLICY-002` / `DEV-050` is Phase 1A/1B implemented locally with focused QC passed. It intentionally amends lifecycle semantics so minor revisions can remain controlled RD/design-change/history records but cannot become production-effective `Released`; Phase 1A creates server-derived suggestion responses and stores them in submission snapshots, Phase 1B blocks minor `Released` in final approval, retry-release and release workflow paths, and Phase 1C emergency-use lanes are deferred. Read this package before changing revision suggestion, approval, retry-release, release workflow, current/latest computation, conditional-use/trial use or production handoff behavior.
- `DEV-PDM-REVISION-TIMING-UX-001` / `DEV-051` is locally implemented with QA/QC passed. It removes raw reserve-row `v{rowVersion}`, labels audit metadata as `系統紀錄版本`, adds a server-derived first-drawing suggestion preview, and keeps the `建立首版圖面` CTA disabled until publication promotes the candidate drawing to formal master data. The preview uses the route's read-only GET interface so it remains available inside the official-numbering production slice without widening mutation allowlists; formal `/numbering/revisions` handoff remains disabled while that slice is enforced. Outside the slice, after promotion the CTA opens `/numbering/revisions` with `rd_workspace` context; the workbench recomputes the central `DEV-050` suggestion and preserves manual edits. No reservation revision field, schema migration or emergency-use lane was added. Read this package and its browser evidence before changing reserve-number row labels, revision-preparation copy, CTA authority gating, or revision workbench prefill/handoff.

Implemented / protected context:

- `DEV-PDM-ACCOUNT-LIFECYCLE-001` / `DEV-045`: Phase 1 local implementation and QC passed on 2026-07-13; Phase 2 provider-managed recovery handoff/session visibility local slice passed on 2026-07-14. `/settings/accounts` is the consolidated Admin-facing 「帳號與權限」 area with tabs for 帳號管理、邀請新帳號、角色與權限、異動紀錄. Account management covers list/detail, suspend/reactivate/offboard/return-to-work, identity enable/disable, global session revoke and Admin-issued one-time password reset through `/account-recovery`. `/account/security` covers current account security, session/device visibility and revoking other sessions; provider recovery handoff uses a generic response and does not create AI_PDM-owned reset tokens. Local bootstrap evidence now has `jedchang0308@jenfu.com.tw` as the only active Admin; demo users are offboarded, the database backup exists and integrity is `ok`. The requested `1655` was not stored because it violates the 10-character minimum; a 24-hour one-time recovery request was created and its raw token is intentionally absent from documentation. This is local managed-auth state, not production Firebase reprovisioning. Production deploy, live migration, provider pointer, live Firebase Auth / Identity Platform/MFA, merge, PR, rollback and production smoke remain unauthorized.

- `DEV-PDM-ERP-MODULE-FOUNDATION-001` / `DEV-044`: Phase 1-3 local implementation and QC passed on 2026-07-12. Server-derived actor/company command boundaries protect selected numbering/draft mutations; command receipts and transactional outbox are additive across SQLite/PostgreSQL/Supabase with RLS/default-deny; provider-neutral principal/organization mappings preserve PDM IDs and carry platform IDs in evidence; guarded collision tooling passed against a copied local database with 5 users, 2 companies and zero collisions. The original Supabase Auth target is superseded by `DEV-046`; current target governance is Firebase Auth / Identity Platform plus `Person/Identity/Organization/Membership/RoleAssignment`, Admin/Approver MFA and central suspension/session revocation. This is not a provider cutover or production release. ProJED was not modified.

- `DEV-PDM-APPROVAL-PLATFORM-001`: Phase 1A-1B local implementation, Phase 1C-A reviewer entrypoint consolidation, Phase 1C-B legacy reviewer page convergence and Phase 1C-C drawing object pending-review projection complete; transitional adapters, friendly-route delegation and guarded migration dry-run/apply tooling present; release/live migration not authorized. 2026-07-08 architecture decisions: launch timing is not urgent, stability is preferred, and full-system approval platformization should be done before launch. ADR 002 selected additive `approval_platform_*` v2 tables. Local implementation added platform schema, repository/service, `/api/approvals/*`, `/approvals`, legacy adapters including drawing revision impact reviews, friendly decision routes delegating through the platform facade, focused QC, guarded migration dry-run/apply self-test, build and browser evidence. Phase 1C-A makes `審核工作台` the single primary reviewer approval sidebar entry, adds a reviewer-role/company-scoped pending badge, and exposes status/domain/action filters with URL query deep links; Phase 1C-B redirects `/numbering/approvals`, `/bom/reviews` and `/numbering/change-reviews` into equivalent workbench filter states with compatibility messages; Phase 1C-C projects pending drawing revision impact reviews onto the affected drawing number, drawing detail and attachment revision/history rows as compact read-only cues with reviewer deep links. 2026-07-09 system drawer, numbering and lifecycle QC governance was aligned so `/numbering/approvals` and `/bom/reviews` are verified as legacy redirects into canonical `/approvals`, not as stale independent reviewer pages. Production deploy/cutover, Supabase live migration, direct data repair/deletion, merge, PR, rollback and release artifacts are not authorized. Read `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`, `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`, `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md` and `.ai-doc/qa/qa-pdm-approval-platform-validation-plan-2026-07-08.md`.

- `DEV-PDM-NUMBERING-004`: Implemented / local verification passed for Phase 1-3; release not authorized. Object-context root/drawing/part entrances now support adding `M02/R01`, adding `P02`, requesting obsolete for root/drawing/part, root obsolete impact preview plus aggregate approval package, and `/numbering/request` `既有主根號追加` fallback. APP feedback follow-up also adds draft-only `刪除草稿`, cancellable add drawing/part dialogs, `新增相關資料` wording instead of `接續操作`, and root-owned part naming with no editable 料號/圖號 level 品名 in add flows. Verified with `tsc`, lint, build, focused QC 44/44, isolated API smoke 10/10 and browser screenshots. Production deploy, Supabase live cutover, provider pointer change, direct data repair/deletion, merge, PR, rollback and release artifacts remain not authorized. Read `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`, `.ai-doc/qa/qa-pdm-numbering-004-contextual-entrypoints-validation-plan-2026-07-08.md` and `.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`.

- `DEV-PDM-ENTITY-DETAIL-DRAWER-001`: Phase 1C single drawing workspace is implemented locally. `DEV-059` now proves focused current-route recovery: the candidate confirmation modal closes by X/Return/Escape, does not resurrect on reload/history and does not click-through into the underlying drawer across required viewports. Parent full QA-QC remains release-gated because shared-data mutation was intentionally not run; read `.ai-doc/qa/DEV-059-real-operation-evidence-2026-08-09.md` and the focused amendment. Production deploy, merge, PR, rollback and release artifacts remain unauthorized.
- `DEV-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001` / `DEV-059`: `Local RD Implemented / Focused AI QA-QC Passed / Commit Pending / Production Release Gated`. The focused contract treats the field screenshot as first-class evidence, records that `A0006-M01` readiness data/files are present, and now records dynamic same-route root cause plus AI browser recovery. Isolated flow/integration covers submit/withdraw/fault behavior; shared candidate mutation was not run. Read `.ai-doc/specs/SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001.md`, `.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md`, `.ai-doc/qa/DEV-059-real-operation-evidence-2026-08-09.md` and `.ai-doc/dev_task.md` (`DEV-059`).

- `DEV-PDM-ACCESS-CONTROL-001`: 已完成並通過本地驗證。2026-07-07 授權的鉦富先上線切片已落地：`/settings/workflow` 顯示唯讀「鉦富 Jenfu PDM」工作區且沒有公司選擇器；已建立製造、採購、外部專員角色；角色指派可設定適用範圍、指定範圍、內部負責人與 90 天複核日；外部專員預設只能查詢、看圖、留言與提供建議；畫面提供權限預覽與「異動紀錄」分頁；審核矩陣第一欄為唯讀「規則摘要」，用「情境 / 處理」使用者語言呈現，且畫面將情境與處理分行顯示，由觸發動作、條件、是否需要審核、標示方式與審核角色自動產生，不再讓管理員自由輸入規則名稱或手動設定使用/發行阻擋。一般審核規則由系統推導為工作中使用只標示風險、正式發行一律進 gate；硬性限制仍可禁止工作中使用。2026-07-10 `DEV-PDM-ACCOUNT-INVITATION-001` 補上無 Google 帳號邀請與首次密碼設定，`DEV-PDM-GOOGLE-IDENTITY-001` 再完成 `auth_identities`、Google 邀請式綁定與 provider-neutral lookup。本地完成不等於 live provider 已開放；完整帳號生命週期、完整路由旁路權限切換、未來久方工作區、Google Cloud credential、正式環境部署/遷移與 live Supabase migration 仍需後續 gate。讀 `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`。
- `DEV-PDM-NEXT-STEP-UX-001`: Implemented / verification passed locally for Phase 1 on 2026-07-04 after user `執行開發` authorization. Shared next-step state, status/error fallback, lifecycle next-step visibility, dashboard action failures, drawing revision blockers, DVT missing-item guidance, submission-detail error states, handoff missing-package guidance, empty/no-result states and master-attachment error/empty states now answer `那我現在要幹嘛` more directly. Verified with `tsc`, lint, status vocabulary QC, numbering search UI QC, DVT UI QC, report center UI QC, master attachments QC, drawing submission UI operation QC and local dev health. Build was blocked by the intentional local-dev guard because AI_PDM was listening on port 3000; no bypass was used. Read `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`: Implemented / verification passed locally for Phase 1, with Phase 1 contract and QA plan prepared and Phase 2+ RD Contract Ready. Local worktree changes cover `Cancelled` / release-recovery schema fields, same-revision blocker classification, Pending cancel support, release workflow wrapping, approve-flow integration, canonical workbench page/API, retry-release API, return-for-correction API, module CTA routing, submission-detail recovery UI, resolved ReleaseFailed dashboard/todo de-noising and async transaction boundaries. Verified evidence includes focused recovery QC, disposable mutation lifecycle QC, DB transaction provider QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke and D-0014 submission-detail browser smoke. The mutation gate used temporary local fixture records and did not mutate existing D-0014 or other user data. Phase 2+ preserves RD handoff contracts for master-data completion/writeback through owner APIs, drawing attachment upload, collaboration, dashboard/todo de-noising, and production cutover/historical repair gates. Production deploy, production migration, direct DB cleanup, historical repair and data deletion remain unapproved.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`: Implemented / verification passed locally on 2026-07-02 after user RD authorization. UI-level release-incomplete self-recovery now includes human-readable diagnosis, drawing-owned attachment organizer, released-filename preflight, explicit selected-attachment correction submission, formal-record lock state, submission-detail recovery link, focused QC and a UI-only operation validation gate covering route identity, retired upload, blocker wording, correction flow, permissions, detail states and RWD. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved.
- `DEV-PDM-STATUS-UX-001`: Implemented / verification passed locally on 2026-07-03. Phase 1 adds a central UI status dictionary, Chinese-only normal UI status display, status filter/badge/error mapping, development phase display mapping, shared status badge/header/help components and the required `?` help popover on user-visible status table columns. Verified with `npm run qc:pdm-status-ui-vocabulary` 44/44, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`, browser UI evidence on `/settings`, browser UI evidence on `/numbering/drawings` for `已發布 / 正式階段`, and `npm run dev:local:check`. Remaining Phase 2 hardening, DB enum/schema rename, production deploy, production migration, audit payload migration and historical data repair require explicit approval.
- `DEV-PDM-STATUS-UX-002`: Implemented / verification passed locally for Phase 1 on 2026-07-07 after user `執行開發` authorization. Status help is now task-specific across task/import/settings/report/DVT/restore contexts, approval wording uses `待補資料`, mixed master-data columns are labeled `狀態 / 階段 / 提醒`, and focused QC covers context mismatch risks. Verified with `tsc`, lint, status vocabulary QC 81/81, browser status-context checks 73/73, DVT fixture browser check 11/11, 390px task popover sanity 4/4 and local dev health. Phase 2 scanner hardening/checklist, DB/API/schema changes, production deploy, historical repair and audit raw-payload migration remain unapproved.
- `DEV-PDM-PROJECT-STATUS-BOUNDARY-001` / `DEV-054`: Local RD/QA/QC passed / Production Release Gated on 2026-08-05. Active EVT/DVT/PVT and semantic-equivalent PLM phase-gate schema/API/UI/approval blocking are removed; quality stage is limited to research/technical-transfer presentation and change control is a separate dimension. Registered regressions, semantic absence gate, isolated router/build and browser R12 all pass. Historical audit/migrations remain immutable; no live migration, production data rewrite or deploy was executed. Read `.ai-doc/specs/SPEC-PDM-PROJECT-STATUS-BOUNDARY-001-remove-project-phase-authority.md`, `.ai-doc/decisions/ADR-PDM-PROJECT-STATUS-BOUNDARY-001-external-project-authority.md`, `.ai-doc/qa/qa-pdm-project-status-removal-validation-plan-2026-08-04.md` and `.ai-doc/qc/qc-dev-054-project-status-removal-2026-08-04.md`.
- `DEV-PDM-NUMBERING-002`: Implemented / verification passed locally for Phase 1-4 on 2026-07-07 after user RD authorization and explicit formal-cutover authorization. New normal records use compact v2 identities `00001`, `00001-P01`, `00001-M01`, `00001-R01`; root remains a reusable design-object root; normal drawing purpose is `M/R`; local/runtime master rows were converted from `0007/0014`, `P-0007-001/P-0014-001`, `D-0007-MA1/D-0014-MA1` to `00007/00014`, `00007-P01/00014-P01`, `00007-M01/00014-M01`; `numbering-rule-v1` is retired and `numbering-rule-v2` is active. Cutover backup is `data/backups/pdm-numbering-v2-cutover-20260707-052403/ai-pdm.sqlite`; cutover reports are under `output/qc-pdm-numbering-v2-cutover/` and `output/qc-pdm-numbering-v2-cutover-check/`. Historical evidence strings in audit/export/file/package evidence are intentionally retained. Verified with `tsc`, lint, build, formal cutover QC, v2 compact QC, numbering core/API/data/concurrency/draft lifecycle/UI regressions, change-control, master attachments, master workbench and Supabase runtime migration QC. External production/Supabase live cutover, direct data repair/deletion, project/order/equipment numbering and extra visible category codes remain unapproved.
- `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`: Implemented / verification passed locally for Phase 1-3 on 2026-07-07. Allocating numbering QC scripts are guarded from protected `data/ai-pdm.sqlite`, sequence/master/audit drift is detectable by an integrity gate, SQLite `createNumberingRecord` is covered by the async transaction boundary, and the authorized local repair retained drawing-module visible formal roots while purging local test sequence pollution. Duplicate submit prevention now blocks same-form re-entry in UI and returns an existing same company/user/payload create result within a 60-second server replay window before allocating a new root. After user critical review, V2 root allocation is gap-aware: use the lowest root absent from controlled `part_roots`; existing master rows remain occupied even if Draft/Obsolete; purged test roots absent from master rows are reusable. Repair backup is `data/backups/pdm-numbering-sequence-repair-20260707-160332/ai-pdm.sqlite`; current runtime occupied roots are `00007`, `00014`, `00056`, `00057`, `00058`, `00059`; computed lowest available root is `00001`; runtime integrity is `clean=true`. Verified with isolation QC 46/46, integrity QC 3/3, transaction QC 4/4, duplicate-submit guard 10/10, gap reuse QC 8/8, `tsc`, lint and numbering core 241/241. Phase 4 production/Supabase remains unapproved.
- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001`: Implemented / verification passed locally on 2026-07-03 after user RD authorization, with 2026-07-05 APP feedback, Phase 2 multi-file package implementation, Phase 3 out-of-order revision/latest-history implementation and Phase 4 first-class revision attachment package model applied. `/numbering/revisions` now includes the `新版圖面` step, selected/uploaded drawing-owned attachments for the intended revision, target-revision-only primary attachment selection, collapsed read-only previous/other-revision reference attachments, a dedicated controlled drawing-revision submission API, Pending submission creation, FFF assessment linkage through `drawing_revision_fff_assessments.submission_id`, selected-attachment revision validation, multi-file `版次檔案包` intake, extension-based role correction, warning-only package completeness, reviewer warning parity, next-revision suggestion with intentional override guidance, release lifecycle latest/history recomputation and duplicate same-revision formal blocking. Phase 4 adds stable `packageId`, package file membership, Released-core immutability, supplement request/approval by current reviewer/supervisor or Admin, approved supplement `補件` tagging in the main attachment list and migration dry-run reporting. Verified implementation evidence now exists for Phase 1-4. **DEV-061 amendment:** warning-only 2D/3D completeness、collapsed previous/reference picker、generic drawing attachment write 與新 supplement write 只保留歷史證據；新 write 必須本次上傳 `.SLDDRW` + `.SLDPRT/.SLDASM`，並改走 package/canonical asset authority。Production deploy, production migration/cutover, direct data repair, historical cleanup, CAD/OCR dependency, forced part/BOM revision, strict chronological approval and dedicated mobile-phone UI remain excluded. Phones use the desktop/default surface.
- Local dev entrypoint CAPA PA is implemented and hardened: use `npm run dev:local` for normal 3000 startup, `npm run dev:local:check` for non-browser health diagnosis, and `npm run dev:local:restart` only when the project-owned 3000 process is stale/unhealthy. The managed launcher performs multi-route HTTP health checks for `/`, `/login`, and `/api/auth/me`, writes launcher PID, port-owner PID, status JSON and logs to `tmp/local-dev/`, and `clean:next` / `prebuild` refuse to remove `.next` while the project-owned 3000 server is listening unless an explicit bypass is set. Guarded by `npm run qc:local-dev-entrypoint`.
- `DEV-PDM-SUBMISSION-CONFLICT-001`: Implemented / verification passed locally on 2026-07-02. Duplicate drawing + revision submission is classified as `submission_conflict`, blocked at readiness/submit/reviewer guard, shown with human Chinese recovery, audited through structured blocked-attempt payloads, and raw DB uniqueness errors are shielded from UI. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved.
- `DEV-PDM-DRAWING-PART-WORKBENCH-001`: Implemented / verification passed locally on 2026-07-01 after user RD authorization. Drawing module stays drawing-focused; 圖料/圖號 shortcuts route to a controlled drawing submission workbench; inline edits write through owner APIs and audit; ambiguous root/drawing/part relationships block submission; submission uses canonical immutable snapshot/hash; idempotency and failed-attempt audit are enforced; duplicate attachment filenames are blocked with Chinese domain errors; generic `/upload` and generic `POST /api/submissions` formal creation are retired. Production deploy, production migration, direct DB cleanup, data deletion and existing-data repair remain unapproved.
- Non-production executable-work audit: completed locally on 2026-06-30. Production/cutover remains excluded. No local or unclassified open task remains; only external-evidence blockers remain visible under `.ai-doc/dev_task.md` Section 3.
- `DEV-PDM-DRAWING-SUBMISSION-001`: Implemented / verification passed locally. User decision on 2026-06-30: drawing module completes master data; drawing-source `送審` is review-only and does not collect PDM master fields. Production deploy remains unapproved/out of scope.
- `DEV-PDM-UI-POLISH-001`: Implemented / verification passed on 2026-06-30. Upload UI simplification, multi-file SolidWorks-primary metadata, conflict warnings, SolidWorks preview fallback, compact drawing governance actions, and `DEV-PDM-UI-POLISH-001A` drawing revision workbench are complete. Continue only for user APP validation feedback or separately scoped enhancements.
- `DEV-PDM-UI-POLISH-001A`: Implemented / verification passed. Drawing revision workbench focused slice completed on 2026-06-30; continue only for user APP validation feedback or separately scoped enhancements.
- `DEV-PDM-SETTINGS-CENTER-001`: Generic settings lifecycle implemented / verification passed locally on 2026-08-07. `/settings` has an overview/work queue, five management-area routes, server-only SolidWorks secret lifecycle APIs, additive metadata tables, redacted UI and `local_test_double` evidence. Its original Supabase Vault provider choice is superseded by `DEV-058`; only the settings information architecture, lifecycle, Admin activation, redaction and audit contracts remain current.
- `DEV-PDM-SHARED-3D-MA-BASELINE-001`: Implemented / verification passed locally on 2026-07-06 after user authorization. Part/root-owned shared 3D model versions, MA package model-basis API, MA release workflow gate, reviewed `2D-only / no 3D impact` exception, required-MA resolver, manufacturing baseline draft/release, immutable released baseline snapshot, part-detail UI slice, part-level 3D/intermediate attachment categories and additive SQLite/Postgres schema are implemented. Verified with `tsc`, lint, `qc:pdm-shared-3d-ma-baseline` 20/20, drawing revision package regression, change-control regression, DB/Supabase boundary gates and browser smoke screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`. **DEV-061 amendment:** `two_d_only` 僅為歷史相容資料，新 write 禁止；每版仍須重新上傳 3D，再由系統依 company/owner/hash/size 自動共用 canonical asset。Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule changes and production cutover remain separately gated.
- `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`: Implemented / verification passed locally for Phase 1 on 2026-07-06 after user authorization, then amended on 2026-08-07 with real Windows Shell worker evidence, a SolidWorks Document Manager SLDDRW PNG worker path, automatic worker credential resolution and readiness reporting. PDM now has preview job and file-derivative metadata, fake local PNG worker, token-gated worker claim/complete contract, Windows Shell thumbnail worker, Document Manager sheet-preview exporter/worker, blank/low-information PNG quality gate, nested attachment preview APIs, derivative streaming under source attachment permission routes, no-store attachment list refresh and derivative-aware 3D/2D preview cards. Full `.SLDDRW` success now depends on `DEV-058` Google Secret Manager exact-version broker integration and real Windows evidence; local test-double or historical Supabase metadata cannot report ready. Full `.SLDASM` evidence, `.SLDDRW -> PDF`, interactive 3D, production rollout, historical backfill and direct data repair remain separately gated.
- `DEV-PDM-DRAWING-PART-RELATION-VIEW-001`: Implemented / verification passed locally on 2026-07-07 after user authorization for Phase 1-3. `/numbering/search` now defaults to root-grouped 圖料關係樹, includes matrix review, and exposes controlled relationship maintenance through `/api/numbering/relations` with permission, company/root, locked-status and audit gates. Verified with `tsc`, lint, build, `qc:pdm-numbering-search-ui` 30/30, `qc:pdm-master-workbench-layout` 205/205 and `qc:pdm-drawing-part-relation-view` 56/56. Screenshots are under `output/playwright/pdm-drawing-part-relation-view/`. Production deploy, Supabase live cutover, direct data repair/deletion, schema migration, generic bulk relationship API and release artifacts remain separately gated.
- Local PM document governance work: allowed when scoped to `.ai-doc/dev_task.md`, `.ai-doc/documentation_map.md`, and `.ai-doc/archived/`.

Not executable without explicit approval:

- `DEV-PDM-ACCOUNT-LIFECYCLE-001` / `DEV-045` continuation only: Phase 1, Phase 2 local recovery/session-visibility slice and the Phase 3 employee-login-alias local slice are complete locally. Phase 2 remains only an additive registry/UX layer bound to `DEV-046` BFF session v2, not a second session authority. Live Firebase Auth / Identity Platform provider MFA/central offboarding through `DEV-046`, Cloud SQL migration/provider-backed alias evidence, production deploy/smoke, hard delete/merge and ProJED integration remain not executable without explicit human/release gate. AI_PDM-owned password/reset/MFA authority is rejected for production.

- `DEV-PDM-ERP-MODULE-FOUNDATION-001` / `DEV-044` release continuation only: Phase 1-3 provider-neutral foundation is complete locally. The original Supabase Auth provider target is superseded by `DEV-046`; production cutover now proceeds only through `DEV-032`, with former `DEV-030/031` concerns retained as its database/data-continuity sub-gates. Phase 4 ERP shell/integration remains contract-only; ProJED requires a separate repository-owned DEV and is explicitly untouched.
- `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` / `DEV-046`: architecture authority is coherent and closed decisions remain recorded. The USD 210 forecast is below the USD 240 stop. Project, billing, protected state/secrets, Firebase identity, Cloud SQL/Run, ALB, budget, admin bootstrap, migration/idempotence, Firebase Hosting default-domain entrypoint, runtime smoke, live principal bootstrap and staging artifact/readback evidence exist. DNS/public managed TLS remains deferred. Phase 2B staging activation is complete; production deploy, GCS file authority and ProJED change do not exist. Executable without extra release approval: staging-only maintenance/hotfix and release-package preparation. Not executable without explicit high-risk release gate: Phase 3A production canary, production seed/migration/restore, allowlist rollout and production smoke.
- `DEV-PDM-PRODUCTION-SLICE-001`: Phase 1 local product slice implemented and verified; release gate required for production execution. DEV-040原始`/numbering/part-drafts`工作台決策已由DEV-048取代；canonical草稿UI是`/parts?tab=drafts` owner workspace，建立入口位於圖料／圖號／料號owner surfaces。`/numbering/part-drafts`與`/numbering/request`沒有可操作頁面，只由middleware保留相容轉址。Production-slice capability、method-level API default-deny、roadmap `未開放`、owner-workspace inert formal actions、candidate safety及正式號不可重用邊界維持有效。Production target readiness, deploy, provider pointer switch, rollback and production smoke remain in `DEV-032` release gate. Read `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`, `.ai-doc/decisions/ADR-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch-boundary.md`, `.ai-doc/qa/qa-pdm-production-slice-numbering-draft-validation-plan-2026-07-09.md` and `.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`.
- `DEV-PDM-APPROVAL-PLATFORM-001`: Phase 1A-1B local implementation, Phase 1C-A reviewer entrypoint consolidation, Phase 1C-B legacy reviewer page convergence and Phase 1C-C drawing object pending-review projection complete; transitional adapters, friendly-route delegation and guarded migration dry-run/apply tooling present; release/live migration not authorized. Stop if work needs fragmented formal approval inboxes at launch, multiple primary reviewer approval sidebar entries, badge counts that ignore reviewer-role/company scope, one monolithic all-domain apply module, direct formal lifecycle mutation without platform audit, root obsolete without aggregate intent/impact preview, cost/supplement adapters as final launch-readiness state, production/Supabase live migration, provider pointer switch, direct data repair/deletion, merge, PR, rollback or release artifacts.
- `DEV-PDM-NUMBERING-004` Phase 4 release/live work: Phase 1-3 are implemented locally. Do not perform production deploy, Supabase live migration/cutover, provider pointer change, direct data repair/deletion, merge, PR, rollback or release artifacts without explicit release authorization.
- `DEV-PDM-ACCESS-CONTROL-001` 剩餘階段：本地上線切片、邀請、Google identity 與 `DEV-045` Phase 1 帳號生命週期已完成；複核日仍只提醒，不自動停權；角色硬性到期只撤銷該角色效力，不冒充帳號停權。自助密碼、email provider 與 session visibility 由 `DEV-045` Phase 2；Firebase Auth / Identity Platform/MFA 由 Phase 3 與 `DEV-046`。完整路由旁路權限切換、未來久方工作區、外部專員帳號級自動停權與平台級多公司管理台仍需各自續接。
- `DEV-PDM-ACCOUNT-INVITATION-001` / `DEV-042`: 本地完成 / release 未授權。Admin 可在 `/settings/account-invitations` 建立、查看、撤銷一次性邀請；受邀者在 `/invite/accept` 自行設定密碼。資料庫只存 token hash，清單不洩漏 token，接受/撤銷/到期/重複與非 Admin 路徑 fail closed，audit、provider-neutral identities 與 JENFU membership 已接上；managed login 不顯示 demo 帳密。邀請交付目前使用預填郵件或複製連結，不宣稱自動寄信。證據：`qc:pdm-account-invitations` 25/25、`qc:postgres-shadow` 26/26、`qc:supabase-runtime-migrations` 33/33、desktop/mobile screenshots。讀 `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`、`.ai-doc/qa/qa-pdm-account-invitation-validation-plan-2026-07-10.md`、`.ai-doc/qc/qc-pdm-account-invitation-report-2026-07-10.md`。
- `DEV-PDM-GOOGLE-IDENTITY-001` / `DEV-043`: 本地完成 / live provider 與 release 未執行。Google 初次綁定只能從有效 Admin 邀請進入，verified email 必須符合邀請；一般登入只依已綁定 Google `sub`，不做 email/domain 自動授權。OAuth 使用 server-side code flow、state、nonce、PKCE，token/secret 不落 DB/audit；`suspended` 等非 active 帳號會拒絕新登入與既有 session。未設定 credential 時 UI 保留停用按鈕與未開放提示。證據：`qc:pdm-google-identity` 19/19、`qc:pdm-account-invitations` 25/25、`qc:managed-auth` 21/21、migration QC、typecheck、lint、isolated build 與 desktop/mobile screenshots。讀 `.ai-doc/qa/qa-pdm-google-identity-validation-plan-2026-07-10.md`、`.ai-doc/qc/qc-pdm-google-identity-report-2026-07-10.md`。
- `DEV-PDM-SUBMISSION-GATE-001` / `DEV-005`: Phase 1 local implementation passed on 2026-07-10. It owns the research/technical-transfer mode split, rule resolver, direct single-item technical-transfer fail-closed guard, parent package/readiness/sign-off/release policy and Parent Phase 2/4 contracts. Its Phase 1 completion remains valid; future transfer-package product delivery is no longer hidden beneath this completed DEV.
- `DEV-PDM-TRANSFER-PACKAGE-INTAKE-001` / `DEV-041`: child technical-transfer delivery created by user decision `3A`. Phase 3A-0 is locally implemented and QA-passed on 2026-07-13; Phase 3A-1 through 3C are `RD Contract Ready / Not Requested This Turn`. The implemented slice adds explicit idempotent Draft creation, stable package identity, shared create/detail workbench, scope/header maintenance, adapter summaries, blocker guidance, audit events and terminal cancellation. Q3-Q8 remain authoritative for later phases: linked delta packages, atomic multi-top approval, deterministic rules without AI authority, manager-approved formal `no_change` and canonical defer follow-up. Read the child SPEC/QA/QC, parent SPEC/ADR, BOM, approval, access-control, numbering-task and file-storage authorities before later-phase implementation.
- `DEV-PDM-BOM-MODULE-ENTRY-001` / `DEV-060`: `Local RD/QA/QC Passed / Commit Pending / Production Release Gated`；兩步驟三來源、canonical Part Number owner、獨立 BOM Rev與review/release/export/read整合已完成。
  User confirmed Scheme B `1A`, material identity rule `2`, and source scope `3B` on 2026-08-10. `/bom/new` is a
  two-step full-page flow: choose canonical Part Number owner + independent BOM Rev, then choose CAD, SolidWorks
  XLS or blank/manual. Additive schema/migration、canonical create APIs、permission、idempotency/readback、`draftId`
  handoff、review/release/export/read整合與isolated QA/QC均已完成；focused QC 50/50、migration baseline 21/21、
  TypeScript與affected lint通過。未執行live migration、production mutation、production allowlist change或release。
- `DEV-PDM-NUMBERING-003`: Implemented / verification passed locally for Phase 1-3. New normal v3 creation uses `A0001-Z9999` alphanumeric roots and `A0001-P01`, `A0001-M01`, `A0001-R01`; root letters are capacity bands only; existing v1/v2 identities remain readable; v3 allocation reserves legacy numeric root ordinals and audit/control root evidence; `M` is category only and `R` cannot be manufacturing basis. Local/runtime master identities were converted from v2 numeric roots to v3 through scripted dry-run, backup, apply and independent check; historical audit/file/release evidence strings were retained. `I/O/Q` exclusion, production/Supabase migration, direct data repair/deletion outside the scripted local cutover boundary and release artifacts remain not authorized. Read `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`, `.ai-doc/decisions/ADR-PDM-NUMBERING-003-alphanumeric-root-identity.md` and `.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`.
- `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` Phase 4 and any further data repair: Phase 1-3 local CAPA controls and the authorized local repair are implemented and verified. Production/Supabase rollout, visible formal-number renumbering, reset/reuse/backfill/voiding/deletion beyond the captured repair audit, merge, deploy, rollback and production smoke remain not executable without explicit human authorization. Runtime evidence is retained under `output/qc-pdm-numbering-sequence-integrity/` and `output/pdm-numbering-sequence-repair-runtime/`.
- `DEV-PDM-NEXT-STEP-UX-001` Phase 2+: regression scanner/checklist hardening and production release are not authorized. DB/API/permission/state-machine changes, production deploy, direct data repair, historical cleanup, admin/debug raw payload full localization and full platform navigation redesign are excluded unless separately approved.
- `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`: Prepared / RD Implementation Ready for Phase 1 documentation only. It captures the D-0014-MA1 mismatch where submission release state is `Released` while drawing/part/root master statuses remain `Draft`. Phase 1 requires release-time master lifecycle sync in the same DB transaction as submission `Released`, audit and visible inconsistency guard. Phase 2 historical scanner/Admin repair and Phase 3 production cutover are documented but not authorized. No historical D-0014 repair, production migration, direct DB mutation or data deletion is authorized.
- `DEV-PDM-FILE-STORAGE-001`: Historical adapter implementation / local QC passed. Provider pointer, hash/manifest, migration guard, fail-closed Supabase Storage adapter and Drive backup helper evidence remain protected, but the unexecuted production target is superseded by `DEV-046`: GCS is the binary authority and Shared Drive is approved delivery/collaboration only. No provider switch, file migration, live bucket/Drive action or production release is authorized. Read the historical SPEC/ADR/QA/QC plus the current `DEV-046` package.
- `DEV-CLOUDSQL-DB-001-DATA-PARITY`: prepared but blocked; requires parity tier, Cloud SQL target, data scope, cleanup owner, and credential boundary. The former Supabase policy is historical input only.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P`: Phase 2+ RD Contract Ready only and rechecked under the latest `dev-pm` All-Phase Gate. Phase 2 requires Phase 1 implemented/verified and explicit authorization; Phase 3 requires Phase 2 implemented/verified and explicit authorization; Phase 4 requires production release-gate approval. Continuation commands must not start Phase 2+ unless `.ai-doc/dev_task.md` is explicitly updated.
- `DEV-CLOUDSQL-DB-001-PROD-GATE`: deferred; production/cutover remains unapproved and deferred.
- First-version launch evidence split: `DEV-IND-007` is complete for disposable local PostgreSQL compatibility. `DEV-FIELD-001` and its fixed five-business-day Wave 0/Wave 1 observation were cancelled by `HD-9-1` on 2026-07-14; the task is closed without execution or acceptance evidence and no longer blocks the first-version release. The initial named 3-5-user canary, explicit allowlist changes, zero open P0/P1 and production post-deploy smoke remain under `DEV-032`. `DEV-CAD-001`, `DEV-SW-001`, and `DEV-BACKUP-001` remain deferred full-PDM scopes. Closed `HD-8-4 / 1A` separately requires minimum Cloud SQL automated-backup/PITR, pre-canary separate-target restore and numbering-ledger reconciliation evidence.
- `DEV-STORAGE-COST-001`: product rollout backlog / parked scope; requires real storage inventory, target, cost, retention policy, and production timing approval.
- Any production deployment, Cloud SQL/GCS production cutover, schema migration, direct DB mutation, data deletion, provider pointer switch, or cost-incurring external action.

## 3. Active Package Read Order

### DEV-PDM-ERP-GOOGLE-CLOUDSQL-001

Status: `DEV-046` architecture recorded; `HD-8-1..4 Closed`; Phase 1A-1E, Phase 2A, Phase 2B local Firebase BFF, staging runtime/Cloud SQL migration, Firebase Hosting default-domain entrypoint, runtime smoke, live principal bootstrap, staging auth activation and current staging hotfix evidence complete. Public staging DNS/TLS remains deferred. Current executable work is limited to staging hotfix/maintenance or `DEV-032` release-gate preparation; Phase 3A production release requires explicit high-risk release instruction and `HD-8-4 / 1A` restore/reconciliation. Phase 3A numbering/draft release remains independent from Phase 3B direct-GCS file cutover and deferred full-PDM file/offline restore.

Read:

1. `.ai-doc/dev_task.md` (`DEV-046`)
2. `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`
3. `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`
4. `.ai-doc/qa/qa-pdm-erp-google-cloudsql-platform-validation-plan-2026-07-13.md`
5. `.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-document-review-2026-07-13.md`
6. `.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-phase2b-local-firebase-bff-implementation-2026-07-13.md`
7. `.ai-doc/qc/qc-pdm-erp-google-cloudsql-phase2b-local-firebase-bff-report-2026-07-13.md`
8. DEV-044 platform contract and shared-identity ADR
9. DEV-045 account lifecycle SPEC
10. Historical Supabase runtime/file-storage package, compatibility evidence only

Confirmed decisions:

- Current authority: Cloud SQL PostgreSQL in `asia-east1` is staging/production operational relational authority; Supabase is not a production target.
- `2A`: Firebase Auth with Identity Platform is the sole shared ERP IAM.
- `3A`: GCS is authoritative for PDM binaries; Shared Drive is approved delivery/collaboration only.
- RD review `1A`: Firebase terminates at the Next.js BFF; browsers do not connect directly to Cloud SQL or provider table APIs.
- Earlier RD review `2B` proposed operational PITR continuity, weekly independent logical backup, hourly control-ledger reconciliation and GCS restore drills. `HD-8-4 / 1A` supersedes the first-version execution scope: retain automated Cloud SQL backup/PITR plus one pre-canary separate-target restore/numbering reconciliation; defer independent long-retention/offline/GCS/full-PDM recovery work.
- RD review `3A`: Admin/Approver TOTP, eight-hour BFF session, two hardware-key break-glass administrators and Firebase-managed action email; the fourth review later fixes the invitation variant to email-link followed by password linking.
- Third review `1A`: Phase 3A launches App Hosting/Firebase/BFF/Cloud SQL official-numbering/drafts with file workflows closed; Phase 3B later owns GCS file migration and cannot block 3A.
- Third review `2C`: existing PDM/already-implemented platform tables stay locked in `public`; new post-DEV-046 platform/ontology/integration tables use bounded schemas; `DEV-047` owns post-production-stability legacy migration without a fixed observation-period gate.
- Third review `3A`: first ontology MVP is Drawing -> Part -> BOM only; Project/Equipment waits for a ProJED-owned source contract.
- Fourth review HCS default `1B`: Phase 3A.0 deploys only to a named 3-5-user production canary. Its Phase 3A.1 `DEV-FIELD-001` expansion blocker was later superseded by `HD-9-1`: the fixed-duration validation is cancelled, while explicit allowlist/release control remains.
- Fourth review HCS default `2A`: database outage stops official numbering; no paper/Excel/offline issuance or later backfill exists in the first version.
- Fourth review HCS default `3A`: non-Google invitation uses Firebase-managed email-link, canonical invitation/email validation and freshly authenticated password linking; password reset is recovery-only.
- Fifth RD review confirmed credential reprovisioning, Wave 0 -> Wave 1 -> Wave 2 rollout and Google Taiwan primary DB/file placement. Its production stable-ID preservation wording is superseded by the tenth review: clean production creates new production PDM IDs and keeps source actor/history separate. Its wording that Firebase Authentication's US identity processing was already accepted is superseded by the sixth review.
- At the sixth RD supervisor review stage, Taiwan primary DB/file placement was confirmed but Firebase US identity processing was not yet accepted (`HD-6-1`); same-region HA/PITR was separated from regional DR (`HD-6-2`); and day-one regional HA cost remained open (`HD-6-3`). The seventh decision record below supersedes those open statuses.
- Seventh decision closure `1A/2A/3A`: accept Firebase US identity processing with required privacy controls; keep cloud recovery copies Taiwan-only and accept no committed full-region RPO/RTO/no regional-DR claim; require Cloud SQL regional HA from the first canary. Actual privacy notice/inventory, billing owner/budget/alerts, provider resources and release evidence remain unexecuted.
- Eighth RD multi-level review reopened three non-inferable choices: `HD-7-1` because the repository pins `next@16.2.6` while current App Hosting official support lists through Next.js 15.2; `HD-7-2` because the production migrate/seed/archive/exclude row classes were undefined; `HD-7-3` because RPO/RTO lacked a support calendar and incident clock. The active SPEC now includes the Architecture Memory Capsule, five Phase 1 handoff slices, failure/recovery contracts, Deferred Scope Audit and All-Phase Coverage Matrix. Production source auto-rollout is prohibited regardless of the eventual runtime.
- Ninth decision closure `1A/2B/3B`: use App Hosting after an exact Next.js 15.2.x downgrade/pin; create clean production with only initial Admin/minimum configuration/numbering seed/non-reuse reservations and retain local source read-only; measure RPO continuously and RTO during Monday-Friday 08:00-17:00 `Asia/Taipei` excluding company holidays with immediate 24x7 security/data-loss escalation. The user further fixed Cloud SQL as all formal-data authority, direct GCS as all formal-file authority and portable HTTP/BFF as all business-logic boundary, explicitly rejecting Firestore, Firebase Storage, Firebase Functions, Callable and Firestore triggers.
- Tenth RD independent review reopened `HD-8-1` because App Hosting/Next.js 15.2 compatibility does not prove five-year security/LTS maintainability, `HD-8-2` because "immediate 24x7" is not measurable, and `HD-8-3` because non-Google production admission has no wave. It also corrected clean production to new production PDM IDs with source actor/history archive-only, Firebase-managed action email without mandatory custom SMTP, Phase 1 GCS interfaces/fakes with live adapter deferred to 3B, automatic IAM DB auth/no static password, thin Route Handler/middleware/Server Action adapters and a concrete outbox worker retry/DLQ contract.
- Eleventh decision closure `1A/2A/3B`: close `HD-8-1` with `asia-east1` Cloud Run + Next.js 16 Active LTS container behind external ALB/managed TLS/custom domain and restricted immutable-asset CDN; close `HD-8-2` with internal primary+backup all-hours on-call, critical security/data-loss acknowledgement/containment within 60 minutes and no 24x7 restoration claim; close `HD-8-3` with Google/non-Google staging coverage, Google Workspace-only Wave 0 and at least one controlled non-Google user in Wave 1. The user also deferred full PDM/GCS/offline backup-and-restore work and opened `HD-8-4` only for minimum Cloud SQL restore-evidence timing.
- Twelfth decision closure `1A`: close `HD-8-4` by retaining automated Cloud SQL backup/PITR plus one pre-canary separate-target restore and numbering-ledger/sequence/non-reuse-reservation reconciliation. Full PDM/GCS/offline and independent long-retention recovery work remains deferred under `DEV-037`; the minimum DB drill is release evidence, not a product restore feature.

Execution boundary:

- Phase 0 architecture baseline and `HD-8-1..4` decisions are complete.
- Phase 1A-1E were implemented and locally QC-accepted in `ec68981`. Phase 2A then added reviewed fail-closed Terraform, provider lock and no-credential preflight. Phase 2B runtime infrastructure, admin bootstrap, Cloud SQL migration, Firebase Hosting staging gateway and runtime smoke completed under explicit approvals. Public DNS/TLS is deferred; principal mapping and an exact reviewed source-to-image digest with no accepted-route drift remain required before staging acceptance.
- Continuity staging and production require billing/credential/target ownership, least privilege, runtime support/upgrade runway and immutable manual rollout, no Firebase data/storage/function authority, clean seed/read-only archive/non-reuse manifest, continuous-RPO/business-hours-RTO and primary+backup 60-minute critical acknowledgement evidence, full location inventory, VPC/private Cloud SQL/IAM DB auth, connection/migration/cost/IAM evidence and the `HD-8-4 / 1A` pre-canary separate-target restore/numbering reconciliation. Phase 3A.0 keeps direct-GCS PDM writes dormant and restricts access to a Google Workspace new-production-ID canary allowlist; Phase 3A.1 Wave 1 includes at least one controlled non-Google account and supplies field acceptance. Phase 3B requires GCS adapter/integration and its own file migration release gate.
- ProJED is not modified; any future adoption requires a separate ProJED-owned DEV.

Stop local Phase 1 only if work deviates from closed HD-6/HD-7/HD-8, runtime migration regressions are undispositioned, Route Handler/middleware/Server Action owns domain rules, Firebase data/storage/function authority appears, static DB password is introduced, or work needs external cost/live credential/data/production/ProJED/release artifacts. Separately stop production canary if the `HD-8-4 / 1A` restore/reconciliation is missing or failed, non-seed source rows/source actor mappings enter production, the source archive is mutated/deleted, production can auto-roll out, or merge/PR/deploy/rollback/release is requested without its gate.

### DEV-PDM-ERP-BOUNDED-SCHEMA-MIGRATION-001

Status: `DEV-047` Phase A0 deterministic local inventory tooling is complete and QC-passed; authoritative Phase A remains blocked until DEV-046 Phase 3A production slice has a representative PostgreSQL target/snapshot, read-only operator and evidence owner. Do not run DEV-047 authoritative inventory from staging-only or local evidence, because it would produce a speculative schema migration plan. Phase B-D are evidence-sequenced, post-production-slice only and not a first-launch blocker.

Read:

1. `.ai-doc/dev_task.md` (`DEV-047`)
2. `.ai-doc/specs/SPEC-PDM-ERP-BOUNDED-SCHEMA-MIGRATION-001.md`
3. `.ai-doc/qa/qa-pdm-erp-bounded-schema-migration-validation-plan-2026-07-13.md`
4. `.ai-doc/reports/rd/rd-dev-047-phase-a0-local-inventory-tooling-2026-07-13.md`
5. `.ai-doc/qc/qc-dev-047-phase-a0-local-inventory-tooling-2026-07-13.md`
6. DEV-046 ADR/SPEC/QA transition contract and provider-neutral PostgreSQL/Supabase compatibility evidence

Execution boundary:

- Local Phase A0 may inventory repository artifacts without credentials or a database. It cannot classify live authority or propose a migration batch.
- Authoritative Phase A starts only after a stable Phase 3A pilot, representative target/snapshot identity, read-only operator and evidence owner are recorded.
- No big-bang legacy table move, duplicate PDM authority schema or launch-time compatibility rewrite is permitted.
- Any live schema move/table lock/downtime remains migration/release gated.

### DEV-PDM-ACCOUNT-LIFECYCLE-001

Status: Phase 1 + Phase 2 local slice `本機完成 / QC Passed`; Phase 3A employee-login-alias local slice `Implemented / QC Accepted`; Phase 3B provider/staging/production `Release Gate Required`.

Read:

1. `.ai-doc/dev_task.md` (`DEV-045`)
2. `.ai-doc/specs/SPEC-PDM-ACCOUNT-LIFECYCLE-001-admin-account-security-console.md`
3. `.ai-doc/qa/qa-pdm-account-lifecycle-validation-plan-2026-07-12.md`
4. `.ai-doc/qc/qc-pdm-account-lifecycle-report-2026-07-13.md`
5. `.ai-doc/qc/qc-dev-045-phase2-session-recovery-2026-07-14.md`
6. `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`
7. `.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-002-shared-identity-governance.md`
8. DEV-042/043 invitation and identity QA/QC reports
9. DEV-044 RD/QC reports and platform command/outbox contract

Execution boundary:

- Phase 1 and Phase 2 local implementation are complete and should not be reimplemented from scratch.
- Before release, rerun build evidence in a clean condition because the 2026-07-13 build attempt was blocked by the local 3000 dev-server guard.
- Phase 2 live provider execution still requires human confirmation for provider recovery destination, authorized domain/quota, privacy retention and session metadata retention.
- Phase 3 provider/session core belongs to `DEV-046`; DEV-045 may only continue account-console, self-service and Admin lifecycle UX after the shared-IAM contract is stable.
- Production Wave 0 is limited to named Google Workspace users; controlled non-Google Wave 1 requires explicit `DEV-032` allowlist/release evidence.
- Cloud break-glass identities are cloud governance accounts, not PDM business users, and must not receive PDM application sessions.
- No phase may modify ProJED under this AI_PDM task.

Stop if work needs account hard delete/merge, historical actor rewrite, live provider/credential, direct data repair, production migration/deploy, release artifacts or ProJED changes.

### DEV-PDM-ERP-MODULE-FOUNDATION-001

Status: Phase 1-3 complete locally / QC passed; Phase 4 and production IAM/release work remain pending. This package makes AI_PDM integration-ready as a future ERP PDM module while preserving the current official-numbering/draft launch boundary. It does not promote the current ProJED architecture to ERP authority and does not permit any ProJED change.

Read:

1. `.ai-doc/dev_task.md` (`DEV-044`)
2. `.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-001-integration-ready-boundary.md`
3. `.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-002-shared-identity-governance.md`
4. `.ai-doc/specs/SPEC-PDM-ERP-MODULE-FOUNDATION-001-platform-contract.md`
5. `.ai-doc/qa/qa-pdm-erp-module-foundation-validation-plan-2026-07-12.md`
6. `.ai-doc/reports/rd/rd-pdm-erp-module-foundation-phase1-3-report-2026-07-12.md`
7. `.ai-doc/qc/qc-pdm-erp-module-foundation-report-2026-07-12.md`
8. Current identity authority: `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`
9. Current runtime target authority: `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
10. Current first-launch authority: `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`

Human decisions:

- AI_PDM is a future ERP PDM module.
- ProJED may be a future project-management module, but it is not changed by this package.
- Unified ERP experience does not require one process or immediate repository merge.
- PDM controlled data remains server/database authoritative.
- The current official-numbering/draft production slice remains the first launch scope.

Execution boundary:

- Phase 1-3 local development and QC are complete.
- Phase 3 provider-neutral decisions do not authorize Firebase Auth / Identity Platform, MFA or session-revocation production rollout; current provider execution is owned by `DEV-046`.
- Phase 4 cannot modify ProJED; any ProJED consumption requires a separate ProJED-owned task.
- Production, migration, domain routing, rollback and smoke remain release-gated.

Stop if:

- RD needs to change login provider or current user-facing auth in Phase 1.
- RD needs to rewrite stable PDM user/company/object IDs or audit history.
- RD needs browser-authoritative state, browser service-role access or direct cross-module table writes.
- RD needs any ProJED change.
- RD needs live schema/data migration, production, merge, PR, deploy, rollback or release artifacts.

### DEV-PDM-NUMBER-STATE-FLOW-001

Status: `Phase 1E P0 QC Passed / Local Product Integration Complete / Local Only`. Local Phase 1A through Phase 1D independent QC are complete, and the 2026-07-14 post-048 request-equivalence repair restored part of the old numbering request rules inside the new draft flow. The 2026-07-15 Phase 1E P0 repair restored create-numbering naming guidance, management-method confirmed-name templates, drawing-need defaulting and warning-only duplicate-check behavior. Live provider, staging and release credit have not been granted.

Read:

1. `.ai-doc/dev_task.md` entry `DEV-048`
2. `.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`
3. `.ai-doc/decisions/ADR-PDM-NUMBER-STATE-FLOW-001-publish-boundary-and-candidate-reservation.md`
4. `.ai-doc/qa/qa-pdm-number-state-flow-validation-plan-2026-07-13.md`
5. `.ai-doc/reports/rd/rd-dev-048-phase1a-number-state-flow-report-2026-07-13.md`
6. `.ai-doc/qc/qc-pdm-number-state-flow-phase1a-report-2026-07-13.md`
7. `.ai-doc/reports/rd/rd-dev-048-phase1b-number-state-flow-ui-report-2026-07-13.md`
8. `.ai-doc/reports/rd/rd-dev-048-phase1c-number-state-flow-publication-report-2026-07-13.md`
9. `.ai-doc/qc/qc-pdm-number-state-flow-phase1c-report-2026-07-13.md`
10. `.ai-doc/reports/rd/rd-dev-048-phase1d-number-state-flow-transfer-report-2026-07-13.md`
11. `.ai-doc/qc/qc-pdm-number-state-flow-phase1d-report-2026-07-13.md`
12. `.ai-doc/reports/rd/rd-dev-048-request-equivalence-repair-2026-07-14.md`
13. `.ai-doc/reports/rd/rd-dev-048-phase1e-name-builder-repair-2026-07-15.md`
14. DEV-046 platform ADR: `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`
15. DEV-046 platform SPEC: `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`
16. Platform command foundation: `.ai-doc/specs/SPEC-PDM-ERP-MODULE-FOUNDATION-001-platform-contract.md`
17. Existing contextual-entry authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
18. Existing status authority: `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`
19. Existing transfer authority: `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
20. Existing release/master sync authority: `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`
21. Amended historical draft/recycle ADR: `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`
22. Amended production-slice SPEC: `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`

Human decisions:

- `＋建立圖料號` belongs at the top-right of the drawing-part module; drawing and part modules retain their task-specific create CTAs and contextual drawer shortcuts.
- Technical-transfer batch submission belongs under `發行 / 交接 > 技術移轉` and must operate through a case-scoped transfer package, not generic upload or direct single-item transfer submission.
- Permanent number control begins at formal publication. Unpublished draft candidates may be recycled when explicitly cancelled, unreferenced and not review-locked; the first version has no mandatory seven-day cooling period.
- 2026-07-15 Phase 1E decisions: keep current v3 numbering (`A0001-P01`, `A0001-M01/R01` style), keep current M/R purpose-code design, do not implement `000` universal number behavior now, use management-method name templates to generate a manually editable `確定品名`, keep name segments optional/non-blocking, and convert similar-name duplicate checks from blocker to warning.
- 2026-07-15 Phase 1E P0 evidence: `qc:pdm-number-state-flow-request-equivalence` 10/10, `qc:pdm-number-state-flow-phase1b` 14/14, `qc:pdm-numbering-contextual-entrypoints` 46/46, `qc:pdm-number-state-flow-contract` 19/19, `qc:pdm-number-state-flow-runtime` 7/7, `qc:pdm-number-state-flow-http` 21/21, TypeScript, lint, `dev:local:check`, and authenticated local browser smoke at 1440/390 with screenshots under `output/playwright/number-state-phase1e/`. A same-day QC reopen found existing local SQLite drift (`append_reason` missing) causing create-draft 500; RD fixed startup additive SQLite repair for `append_reason` / `universal_reason`. The later management-method name-builder browser QC passed create 201, candidate acquire 200 and cancel/recycle 200, generated `腳架測試121150_JF_100L_白鐵_A`, verified `確定品名`, historical 品名/料號系列欄位分工, no visible error, no console error, no horizontal overflow, no official master pollution and recycled candidates. Follow-up UI-noise QC removed visible `須製程管制`, kept `包含圖號草稿` as the only drawing toggle, confirmed common/shared does not imply drawing by default, and removed common-sense shared explanations. Latest field correction treats `系列代號（選填）` as a single self-made non-shared part metadata field that persists to draft/part data and does not auto-write into `確定品名`. The authenticated browser smoke used a local session cookie for the active local Admin only to verify the UI/API surface; it is not login-flow evidence.
- `HD-048-01 / 1C`: DEV-048 owner surfaces replace the four visible sidebar entries `料號草稿 / 領號申請 / 上傳送審 / 製造交接`. `/parts?tab=drafts` is the canonical draft workspace; old URLs retain redirect/guidance and context only, never a second mutation flow. The 2026-07-17 integration correction removed an erroneous amendment that had reversed this decision.
- `HD-048-02 / 2C`: Drawing and drawing/required-file transfer publication requires finalized controlled-file evidence. Root-only and eligible part-only publication may use a versioned server-side `not_required` result. Production file-required publication remains locked until the direct GCS verifier is ready.
- `HD-048-03 / 3C`: One natural person may submit, approve and publish only when independently granted every required permission. Each step retains a separate command, confirmation, receipt and audit action; approval never auto-publishes and no role/Admin identity implies another permission.

Intentional replacement:

- The latest product rule replaces the older semantics that submission itself makes a candidate permanently non-reusable.
- It also replaces the production-slice assumption that every root/drawing/part record created through the formal form is immediately an official permanent number.
- The replacement is now recorded in `ADR-PDM-NUMBER-STATE-FLOW-001` and amendment banners on the affected change-control and production-slice ADR/SPEC files. Historical implementation/QC evidence remains protected.

Architecture authority:

- New work uses stable `numbering_draft_workspaces` plus typed root/part/drawing/relation draft items. Draft may remain unnumbered.
- Candidate exclusivity is owned by `number_candidate_reservations`; recycled code receives a new reservation ID, while events remain append-only.
- New candidate data does not enter `part_roots / part_numbers / drawing_numbers` until the explicit publication transaction succeeds.
- Approval and transfer review only freeze/lock an immutable snapshot. They do not publish. `/approvals` remains the single reviewer inbox.
- Publication atomically creates the complete official master bundle, promotes reservations, writes audit/receipt/outbox and emits `pdm.numbering.official_number_published.v1` for DEV-046 signed-ledger/recovery handling.
- Production clean seed excludes candidates/local drafts; only published/obsolete official numbers and recovery non-reuse reservations are eligible.

Execution boundary:

- Phase 1A local product code, tests and migration artifacts are implemented and independent local QC passed on 2026-07-13; no UI/sidebar, approval/publication, transfer integration, live provider, credential, production or release artifact was changed.
- Independent QC passed aggregate 47/47 plus PostgreSQL/Supabase mirror checks; this does not grant live provider, staging or release evidence.
- Phase 1B-1D future contracts are in SPEC Section 30; phase-specific QA/QC handoff and evidence are in QA Section 12. `HD-048-01..03` are closed in SPEC Section 1.7 and dev_task.
- Phase 1B, Phase 1C and Phase 1D independent QC passed on 2026-07-13. DEV-048 Phase 1E P0 passed on 2026-07-15, so the local product integration boundary is complete again. Existing-drawing new part variants / one-drawing-many-parts remain a later relation-contract slice. Provider/staging/release work requires explicit DEV-046 / DEV-032 dispatch.
- Live historical repair, Cloud SQL/Firebase/GCS execution, migration/cutover, merge, PR, deploy, smoke, rollback and release require their own high-risk/release gate.

### DEV-PDM-PRODUCTION-SLICE-001

Status: Phase 1 local product slice implemented and verified; release gate required for production execution. This package defines the narrow internal launch slice: Web official numbering plus the DEV-048 `/parts?tab=drafts` owner workspace. `/numbering/part-drafts` and `/numbering/request` are redirect-only compatibility routes. Future roadmap UI remains visible where applicable, but unopened actions must be marked `未開放` and method-level server-side feature gates must fail closed. It does not claim full PDM production readiness.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`
3. `.ai-doc/decisions/ADR-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch-boundary.md`
4. `.ai-doc/qa/qa-pdm-production-slice-numbering-draft-validation-plan-2026-07-09.md`
5. `.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`
6. Related numbering implementation authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
7. Related sequence integrity authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`
8. Related access-control authority: `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`
9. Related Supabase runtime authority: `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`

Human decisions:

- First open surface is Web only.
- Real user-created numbers are official controlled records.
- Launch a narrow `正式領號 / 草稿 production slice`, not full PDM production.
- Keep roadmap UI visible, but mark unopened controls and block APIs server-side.
- Use a smoke company / tenant as the first default for routine production smoke; a dedicated smoke sequence namespace is only a future fallback design.
- First users are 3-5 internal users: Admin, RD Manager and 2-3 engineers.
- Historical RD supervisor follow-up `1B`: draft management is part of the first slice; DEV-048 later moved that capability to `/parts?tab=drafts` and retired the standalone page.
- RD supervisor follow-up `2C`: provisional part-number drafts may be deleted/recycled before controlled boundary; official root/drawing/part numbers may not be recycled.
- RD supervisor follow-up `3A`: release-gate smoke defaults to smoke company / tenant; any leakage into normal Jenfu surfaces blocks production write smoke.

Execution boundary:

- Phase 0 documentation is complete.
- Phase 1 local product slice is implemented and verified.
- Phase 1 implementation follows the SPEC route/API matrix, draft operation matrix, direct-route blocked-state behavior, existing draft lifecycle action closures and narrow admin setup boundary.
- Phase 2+ production target readiness, deployment, provider pointer switch, rollback, production smoke and release report require release-type command plus high-risk confirmation.
- Direct data repair/deletion, live Supabase migration and direct Data API application access are outside this execution boundary.

Stop if:

- RD proposes UI-only disabled controls without server-side API denial.
- Smoke company / tenant isolation cannot be proven.
- RD cannot reuse or faithfully wrap the existing part-number draft controlled-boundary predicate for delete/recycle.
- Work expands into formal submission, release, CAD parsing, SolidWorks Add-in, BOM/manufacturing baseline or full PDM production readiness.
- Any step needs production/Supabase live changes, direct data repair/deletion, merge, PR, rollback or release artifacts.

### DEV-PDM-ENTITY-DETAIL-DRAWER-001

Status: Implemented locally for Phase 1A / release not authorized. This package captures the APP feedback that the same drawing number or part number shows different drawer information depending on whether it is opened from the owner module or the relation module. The implemented local slice keeps `/numbering/search`, `/numbering/drawings` and `/parts` as separate task entry pages, adds target-aware root/drawing/part core detail sections in `/numbering/search`, and publishes common `data-*` entity metadata on owner drawers. Source context may default the focused section only; it must not alter object identity, status, permission, cost visibility, attachment visibility or core sections.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`
3. `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`
4. Drawer behavior authority: `.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md`
5. Master workbench authority: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
6. Relation-view authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
7. Contextual action authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
8. Current code anchors: `src/app/numbering/search/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/parts/page.tsx`, `src/components/numbering-contextual-entrypoints.tsx`

Human decisions:

- Same object ID should not have different visible truth by source module.
- The rule applies to drawing numbers and part numbers.
- Root/drawing/part clicks must open matching entity details.
- Keep the three entry pages because their tasks differ.
- Source context can change focus/highlight but not core object sections.

Authorization boundary:

- Phase 0 documentation is complete.
- Phase 1A target-aware local implementation is complete and verified locally.
- Phase 1B shared shell extraction was authorized and implemented locally on 2026-08-07; release remains gated.
- Phase 2 optional read-only detail facade is RD Contract Ready / Not Authorized and should only execute if Phase 1 adapter duplication is unsafe.
- Production deploy, Supabase live cutover, merge, PR, rollback, production smoke and release artifacts require explicit release authorization.

Stop if:

- RD needs schema/RLS/permission/lifecycle changes.
- RD cannot preserve drawing attachment/readiness sections or part attribute/cost sections in the shared panels.
- Same user would see different cost or attachment visibility by source page.
- The implementation would merge the three entry pages instead of unifying object detail.
- Any step needs production/Supabase live changes, direct data repair/deletion, merge, PR, rollback or release artifacts.

### DEV-PDM-APPROVAL-PLATFORM-001

Status: Phase 1A-1B local implementation complete; Phase 1C-A reviewer entrypoint consolidation complete; Phase 1C-B legacy redirect implemented and locally verified; Phase 1C-C drawing object pending-review projection implemented and locally verified; transitional adapters, friendly-route delegation and guarded migration dry-run/apply tooling present; release/live migration not authorized. It captures the user's 2026-07-08 decision that launch timing is not urgent, stability is preferred, and full-system approval platformization should be completed before launch. The selected architecture is shared approval core plus domain-specific handlers, not fragmented approval islands and not a monolithic all-domain apply module. ADR 002 selected additive v2 platform tables; local implementation added platform schema, APIs, `/approvals`, legacy adapters, friendly decision routes through the platform facade, focused QC, guarded migration reporting/self-test, build and browser evidence. Phase 1C-A now provides one `審核工作台` primary reviewer sidebar entry, a reviewer-role/company-scoped pending badge and workbench filters; Phase 1C-B now redirects legacy reviewer routes into equivalent workbench filter states after adding drawing revision impact review parity; Phase 1C-C now shows compact pending-review cues on affected drawing numbers and attachment revisions without turning object pages into approval inboxes.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
3. `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`
4. `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md`
5. `.ai-doc/qa/qa-pdm-approval-platform-validation-plan-2026-07-08.md`
6. `.ai-doc/qc/qc-pdm-approval-platform-report-2026-07-08.md`
7. Related numbering entrypoint authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
8. Related submission gate authority: `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
9. Related lifecycle authority: `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
10. Current approval code anchors: `db/schema.sql`, `src/lib/repositories/approval-platform-async-repository.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/approval-platform.ts`, `src/app/api/approvals`, `src/app/api/numbering/drawings/route.ts`, `src/app/approvals/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/search/page.tsx`, `src/components/master-attachment-panel.tsx`, `scripts/qc-pdm-approval-platform.mjs`, `scripts/generate-pdm-approval-platform-migration-dry-run.mjs`

Human decisions:

- Launch timing is not urgent.
- Stability is preferred over short-term speed.
- Full-system approval platformization should be done before launch.
- Use shared approval core plus domain-specific handlers.
- Avoid both fragmented module-specific approval islands and one monolithic all-domain apply module.
- `1C`: Phase 1A starts with a no-migration architecture spike and ADR before choosing generalized existing tables or v2 platform tables.
- `2B`: Platform core, numbering/root/drawing/part and submission/BOM formal lifecycle are pre-launch blockers; cost/supplement may start as adapters.
- `3C`: All known historical approval-like records must be physically migrated before launch readiness; read adapters are transitional only.
- Reviewer-entrypoint decisions: `1B` single approval workbench primary sidebar entry; `2A` first anti-missed-review slice is pending-count badge only; `3 phased A -> B` keeps legacy reviewer pages reachable short-term and converges them into workbench filters/details long-term.

Authorization boundary:

- Phase 0 documentation is authorized and complete.
- Phase 1A-1C-C local product implementation is complete; further migration/release product work requires explicit authorization.
- Schema migration, Supabase live migration, production deploy/cutover, provider pointer change, direct data repair/deletion, merge, PR, rollback and release artifacts require separate authorization.
- Future migration/release work must start from the existing ADR 002 platform-table decision and the current dry-run/apply guardrails.

Stop if:

- RD needs live schema/data migration, deployment, rollback or production smoke without release/data authorization.
- RD needs fragmented formal approval inboxes at launch.
- RD needs one monolithic all-domain apply module.
- RD needs direct formal lifecycle mutation without platform audit.
- RD needs root obsolete without impact preview and aggregate root intent.
- RD needs an approval action without a deterministic domain handler.
- RD wants cost/supplement adapters to be the final launch-readiness state.
- RD cannot physically migrate known historical approval-like records without data loss or ambiguity.
- RD needs production/Supabase live migration, direct data repair/deletion or release artifacts.

### DEV-PDM-FILE-STORAGE-001

Status: Historical adapter implementation / local QC passed; its unexecuted production target was superseded on 2026-07-13 by `DEV-046`. The completed provider/bucket/key pointers, provider-aware reads, fail-closed Supabase adapter, local fallback, hash/manifest and migration/backup helpers remain reusable evidence. Current target: Cloud SQL PostgreSQL metadata/transactions + GCS binary authority in Google Taiwan; Shared Drive is approved delivery/collaboration only.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`
3. `.ai-doc/decisions/ADR-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`
4. `.ai-doc/qa/qa-pdm-file-storage-supabase-core-drive-backup-validation-plan-2026-07-08.md`
5. `.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`
6. Existing Supabase DB runtime authority: `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
7. Existing Supabase target decision: `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`
8. Existing storage cost/provider background: `.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md`
9. Relevant storage service code: `src/lib/file-storage.ts`
10. Relevant backup helper code: `src/lib/file-storage-backup.ts`, `scripts/generate-file-storage-drive-backup-plan.mjs`
11. Relevant legacy Drive code: `src/lib/gdrive.ts`
12. Relevant Drive settings UI/API surfaces: `src/app/settings/page.tsx`, `src/app/api/settings/gdrive/folders/route.ts`

Human decisions:

- 2026-07-13 supersession: `DEV-046` decisions `1B / 2A / 3A` replace the following storage-provider target while retaining its completed adapter evidence.

- `1B`: Supabase Postgres and Supabase Storage become the PDM core authority.
- `2A`: Existing local / legacy Google Drive files are migrated in one controlled migration before cutover; no long-term dual-primary.
- `3A`: Google Drive is async best-effort backup only, using version/type folders and manifest/hash evidence to avoid same-folder same-filename conflicts.
- RD supervisor `1C`: Drive backup uses tiered coverage: released files/packages are required and permanent in the first version, draft/in-review/master files are selective, generated preview derivatives are not backed up by default.
- RD supervisor `2A`: First-version Drive backup does not automatically delete or overwrite backed-up file blobs.
- RD supervisor `3B`: Drive backup includes non-secret metadata snapshots as restore aids only; snapshots are not PDM authority.

Authorization boundary:

- Local RD implementation and local QC are complete.
- Supabase bucket creation, RLS policy changes, provider pointer switch, one-time migration execution, Google Drive live backup worker/external writes, real restore drill, retention cleanup/deletion, production deploy/cutover, direct data repair/deletion, merge, PR, rollback and release artifacts require explicit separate authorization.
- `DEV-STORAGE-COST-001` remains cost-control / alternate-provider background; current production-provider authority is `DEV-046`.

Stop if:

- RD needs Google Drive as primary source, reverse-sync source, or release blocker.
- RD needs public Supabase PDM source buckets.
- RD needs service-role or S3 access keys exposed to browser/client code.
- RD needs Supabase Storage S3 bucket versioning as the PDM version model.
- RD needs long-term dual-primary local/Drive/Supabase storage after cutover.
- RD needs a runtime provider pointer switch before migration parity and rollback evidence exist.
- RD needs generated preview derivatives backed up by default.
- RD needs automated Drive backup deletion/overwrite in the first version.
- RD needs metadata snapshots containing secrets, credentials, session tokens, signed URLs or auth payloads.

### DEV-PDM-ACCESS-CONTROL-001

狀態: 授權的鉦富先上線切片已完成並通過本地驗證。角色管理規則矩陣已改為中文管理語言，並補上預設 v3 rule version seed 自修復。身分提供者、完整路由切換、久方工作區與正式環境階段仍是 RD Contract Ready / 未授權。

閱讀:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`
3. 既有設定權責邊界: `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`
4. 既有角色/代理 QA 脈絡: `.ai-doc/qa/qa-pdm-numbering-permission-guard-validation-plan-2026-06-01.md`, `.ai-doc/qa/qa-pdm-numbering-role-delegation-ui-validation-plan-2026-06-01.md`
5. 已實作的上線切片檔案：`db/schema.sql`, `db/postgres/005_access_control_launch_governance.sql`, `supabase/migrations/20260707010000_access_control_launch_governance.sql`, `src/lib/db.ts`, `src/lib/numbering-permission-codes.ts`, `src/lib/repositories/numbering-repository.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/access-control-async-repository.ts`, `src/app/api/numbering/admin/matrix/route.ts`, `src/app/settings/page.tsx`, `scripts/qc-pdm-access-control-governance.mjs`
6. 既有身分/auth 脈絡，只做理解用: `src/lib/auth-async.ts`, `src/lib/auth.ts`, `src/lib/repositories/user-async-repository.ts`, `src/lib/numbering-permission-guard.ts`, `src/lib/permissions.ts`, `src/lib/company-context.ts`

使用者決策:

- `PDM User ID` 獨立於 Google 信箱。
- Google 信箱與本機/無 Google 帳號都是登入方式，不是授權來源。
- 第一版只上線一個自動判斷的鉦富工作區；未來久方擴充必須沿用工作區抽象層，不新增一般管理員公司選擇器。
- 鉦富/久方這類法律公司或資料所有者是工作區內的選用隱藏分類，不是日常權限設定主軸。
- 部門用於歸屬、待辦分派與預設主管，不是動作權限來源。
- 角色決定可做的動作；範圍模板決定角色套用在哪裡。
- 角色權限設定 UI 拆開「角色/動作定義」與「使用者/範圍指派」。
- 一般管理員看到唯讀目前工作區，不看到公司選擇器。
- 角色 UI 用角色清單/詳情、使用者權限、外部專員、異動紀錄；不得變成公司 x 部門 x 角色 x 權限的大矩陣。
- 使用者指派要有範圍模板與儲存前權限預覽。
- 外部專員指派要有內部負責人、指定範圍與第一次 90 天複核日。
- HCS `1C`: 第一版用可上線的最小 UI 加保守後端相容層。
- HCS `2A`: 一般管理員只看保守範圍模板；`workspace_all` 只給系統/PDM 管理員或 seeded policy。
- HCS `3A`: 外部專員預設只能讀取、留言與提供建議；不預設建立、編輯、審核、發行、批次下載或不受控匯出。
- HCS follow-up `1`: 外部專員複核預設 90 天，到期提醒與留紀錄，不自動停權。
- HCS follow-up `2B`: 第一版角色範圍為研發/研發主管所屬部門、品保預設品質視圖、製造/採購正式資料、外部專員指定範圍。
- HCS follow-up `3B`: 無 Google 使用者由管理員邀請並於第一次登入設定密碼。
- 使用者確認 A+ 工作區策略：鉦富先上線、保留未來久方擴充，不做平台級 SaaS console 或一般管理員公司選擇器。
- RD 主管 follow-up `2A`: Google SSO/本機登入只能連到管理員已建立或已邀請的 PDM 使用者；不允許自行註冊或網域自動授權。
- RD 主管 follow-up `3B with guard`: 先建身分/組織/角色/範圍基礎，再旁路比對與受控 route migration；拒絕一次性完整權限切換。
- 使用者面向只使用「外部專員」。
- 必須支援多角色與多部門/專案/產品/客戶範圍。
- 外部專員是 PDM 使用者，但不在內部組織樹下；必須有內部負責人、指定範圍、90 天軟性複核提醒與異動紀錄。
- PDM 主控角色、審核與權限；Google Workspace 只提供帳號/Drive 來源。
- 拒絕共用人員帳號。

授權邊界:

- Phase 0 文件已完成。
- 2026-07-07 使用者授權的 Phase 2-4 本地上線切片已完成並驗證。
- 2026-07-07 依使用者回報修正角色管理規則矩陣：第一欄改為唯讀「規則摘要」並由觸發動作、條件、控制與審核角色自動產生；2026-07-08 進一步改成「情境 / 處理」使用者語言，避免斜線串欄位與系統控制詞，且情境與處理在畫面分行顯示；2026-07-09 依使用者決策移除一般審核矩陣的「阻擋使用 / 阻擋發行」手動設定，只保留「是否需要審核 / 標示方式」，一般審核規則由系統推導為不阻擋工作中使用、使用處標示風險、正式發行一律進 gate；動作、階段、狀態、料件、風險與硬性限制改用中文管理語言；QC 已防止自由輸入規則名稱、`actionCode`、`riskFlag`、狀態代碼與硬性規則代碼回到可見 UI。
- 2026-07-07 補上 numbering repository 的 v3 rule version seed 自修復，避免舊本機資料庫缺 `numbering-rule-v3-alpha-root` 時 admin matrix API 因 FK 失敗。
- Phase 1 無 Google 邀請/首次密碼設定已由 `DEV-PDM-ACCOUNT-INVITATION-001` 完成本地實作；`DEV-PDM-GOOGLE-IDENTITY-001` 已完成 `auth_identities`、Google 邀請式綁定、provider-neutral lookup 與帳號狀態 fail-closed。本地完成不等於 live provider 已啟用；Google Cloud credential、正式 migration、完整帳號生命週期與 release 仍需後續 gate。
- 目前相容面以外的完整路由盤點、旁路比對、feature-flag cutover 與權限整合仍未授權。
- 未來久方 provisioning 仍未授權。
- 正式 rollout、migration、provider cutover、live Supabase migration、直接修資料/刪資料與 release artifacts 需要明確 release 授權。

停止條件:

- RD 需要 Google Workspace 群組直接主控 PDM 角色。
- RD 需要一般管理員跨 tenant 公司切換。
- RD 需要一般鉦富使用者/角色設定時出現公司或工作區選擇器。
- RD 需要部門歸屬直接給動作權限。
- RD 需要 Google 自行註冊或依網域自動授權。
- RD 需要外部專員預設具備審核或發行權。
- RD 需要外部專員預設可建立、編輯、審核、發行、批次下載或不受控匯出。
- RD 需要把外部專員 90 天軟性複核改成自動停權或 hard expiry，且未另行授權。
- RD 需要共用人員帳號。
- RD 需要高風險角色/範圍變更不經預覽、原因與異動紀錄。
- RD 需要無路由盤點、無旁路差異證據、無 feature flag、無 rollback/recovery gate 的一次性完整權限切換。
- RD 需要正式部署、migration、live OAuth setup、直接修資料/刪資料，或改 production schema/RLS。

### DEV-PDM-NUMBERING-004

Status: Implemented / local verification passed for Phase 1-3; release not authorized.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`
3. `.ai-doc/qa/qa-pdm-numbering-004-contextual-entrypoints-validation-plan-2026-07-08.md`
4. `.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`
5. Existing identity authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`
6. Existing relation-view authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
7. Existing lifecycle authority: `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
8. Existing ownership/security authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
9. Current implementation surfaces: `src/components/numbering-contextual-entrypoints.tsx`, `src/components/number-state-workspace.tsx`, `src/app/numbering/search/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/parts/page.tsx`, `src/app/api/numbering/roots/[rootCode]/*`, `src/app/api/lifecycle/obsolete-requests/route.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/lib/numbering-async.ts`, `src/lib/numbering-permission-codes.ts`, `db/schema.sql`, and `scripts/qc-pdm-numbering-contextual-entrypoints.mjs`; the former standalone request page was retired by DEV-048.

Human-confirmed problem:

- Existing root with `M01`: user cannot find where to add `M02` or `R01`.
- Existing drawing with `P01`: user cannot find where to add `P02`.
- Root/drawing/part formal obsolete request entrances are not discoverable in object-context UI.

Human decisions:

- `1B`: first delivery is a usable local vertical slice with UI/API/repository/audit/QA support.
- `2B+C`: root obsolete is a visible entry with impact preview and aggregate approval package supporting whole-root batch intent; no one-click mutation.
- `3B`: primary entries live in root/drawing/part detail drawers; `/numbering/request` is only a fallback with `既有主根號追加`.

Authorization boundary:

- Phase 1-3 local product implementation is authorized and complete.
- Production deploy, Supabase live cutover, provider pointer change, direct runtime DB mutation, direct data repair/deletion, merge, PR, rollback and release artifacts require separate authorization.

Stop if:

- RD needs root obsolete without impact preview and approval.
- RD needs existing-root append to create a new root.
- RD needs an `R` drawing to become manufacturing basis.
- RD cannot preserve root-level reason and child target list in root obsolete approval.
- RD needs production deploy, live migration, direct DB mutation or release artifacts.

### DEV-PDM-SUBMISSION-GATE-001

Status: Phase 1 local implementation passed on 2026-07-10. Parent Phase 2 and Phase 4 are RD Contract Ready / Not Requested This Turn. Technical-transfer Phase 3 implementation is delegated to child `DEV-041`: Phase 3A-0 Local Implementation Complete / QA Passed 2026-07-13; Phase 3A-1 through 3C RD Contract Ready / Not Requested This Turn. Release Gate Required for production work.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
3. `.ai-doc/decisions/ADR-PDM-SUBMISSION-GATE-001-transfer-package-and-exception-policy.md`
4. `.ai-doc/qa/qa-pdm-submission-gate-research-transfer-package-validation-plan-2026-07-07.md`
5. `.ai-doc/qc/qc-pdm-submission-gate-phase1-report-2026-07-10.md`
6. Phase 3A transfer intake spec: `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
7. Phase 3A QA plan: `.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`
8. Phase 3A-0 QC report: `.ai-doc/qc/qc-pdm-transfer-package-phase3a0-report-2026-07-13.md`
9. Existing drawing submission authority: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
10. Existing workbench authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
11. Existing relation view context: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
12. Existing release lifecycle authority: `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`
13. Implemented surfaces: `src/lib/transfer-packages.ts`, `src/lib/transfer-package-api.ts`, `src/lib/repositories/transfer-package-async-repository.ts`, `src/app/api/transfer-packages`, `src/components/transfer-package-workbench.tsx`, `src/app/transfer-packages`, `db/postgres/010_transfer_package_phase3a0.sql`, `scripts/qc-pdm-transfer-package-phase3a0.mjs`.

Human decisions:

- User selected `1B`: submission page must let the user choose `研發送審` or `技術移轉送審`.
- User amended the rule: `技術移轉送審` must not be a direct single drawing or single part submission; it must be a case-scoped transfer package for a development case or design-change case.
- User selected `2B`: required-data rules use a versioned submission rule matrix.
- User selected `3B`: technical transfer hard-blocks missing required data; research submission may allow controlled manager exception with reason and audit.
- Follow-up `1B`: one-item technical transfer package is allowed only with package context, case/change reason, `no other affected items` declaration and reviewer scope confirmation.
- Follow-up `2B`: technical transfer does not allow missing-required-data exception; applicable Manufacturing/Procurement/QA/QC sign off after readiness passes.
- Follow-up `3C`: research exceptions may be submitted with reason, but final approval requires reviewer or supervisor exception decision.
- RD supervisor review `1C`: `ApprovedForTransfer` is controlled handoff package approval, not formal master release. RD Manager/Admin must trigger existing release workflow separately.
- RD supervisor review `2B`: rule matrix determines sign-off applicability; applicable roles must sign, and not-applicable requires rule source or RD Manager/Admin reason/audit.
- RD supervisor review `3B`: package item or readiness-driving data changes invalidate readiness snapshot and affected sign-offs; package must be re-resolved and affected roles re-sign.
- 2026-07-10 Phase 3A guided decision `1B`: Pack-and-Go ZIP upload first enters `Transfer Intake`; integer major baseline is frozen only after human-confirmed classification, BOM, missing-file review and mapping.
- 2026-07-10 Phase 3A guided decision `2A`: first implementation path accepts Pack and Go or equivalent path-preserving ZIP and does not require SolidWorks Add-in; it preserves relative paths and must not overclaim native SolidWorks open verification.
- 2026-07-10 Phase 3A guided decision `3A`: system suggests classifications for part drawings, transient subassemblies, formal subassemblies and top assembly, but humans retain final adjustment authority over all classifications.
- 2026-07-10 UX guided decision `1B`: upgrade existing `/transfer-packages/new` into a transfer package workbench; do not create one page per transfer subtask.
- 2026-07-10 UX guided decision `2B`: use adapter cards inside the workbench to summarize existing BOM, attachment, drawing/part and approval modules; heavy editing stays in owner modules.
- 2026-07-10 UX guided decision `3B`: first recommended product slice is Phase 3A-0 workbench shell, module entry points and blocker summary; full ZIP parser is deferred to Phase 3A-1.
- 2026-07-10 RD completeness decision `1A`: positive integer major belongs to immutable transfer-package baseline; controlled parts, formal subassemblies and top assembly retain independent revisions, and each baseline stores exact revision/hash snapshots.
- 2026-07-10 RD completeness decision `2A`: opening `/transfer-packages/new` is read-only; only required case data plus explicit `建立技轉包` creates a persistent Draft and stable package ID.
- 2026-07-10 RD completeness decision `3A`: child product delivery is `DEV-041`; `DEV-005` remains complete for Phase 1 and parent governance.
- 2026-07-13 design-change decision `1A`: later changes create a new delta package linked to prior current-effective configurations; approved packages are terminal and unchanged evidence is inherited into complete candidates.
- 2026-07-13 multi-top decision `2A`: all governed top assemblies inside one package approve atomically; staged timing requires separate packages.
- 2026-07-13 formal defer decision `1C`: only interchangeable/backward-compatible, non-critical and sufficiently evidenced impacts may defer with R&D Manager reason, owner, due date, follow-up and exact-old-revision availability.
- 2026-07-13 visible-state decision: verified no-change shows `不需進版`; defer/update internal states both show only `已非最新版 / 待更新`.
- 2026-07-13 suggestion-authority decision `1A`: assembly-impact suggestions use deterministic, versioned pure rules with normalized input hash, matched rule IDs and reasons; no AI/LLM/network call or automatic decision authority is allowed.
- 2026-07-13 formal no-change decision `2B`: every formal-lane `no_change` requires R&D Manager approval after exact candidate configuration and SolidWorks verification evidence.
- 2026-07-13 defer-follow-up decision `3A`: formal defer creates canonical `transfer_follow_up` data with owner/due time/evidence and projects it idempotently into the existing workbench and `/numbering/tasks`; no standalone page or global generic-task due-date change is introduced.

Authorization boundary:

- Phase 1 local product slice is implemented and QC-passed.
- `DEV-041` Phase 3A-0 is implemented locally and QA-passed; its local evidence does not authorize live migration or release.
- `DEV-041` Phase 3A-1 through 3C are contract-ready. Each phase still requires the prior child-phase entry evidence before implementation or promotion.
- Parent Phase 2 research exception and Parent Phase 4 rule admin remain under `DEV-005` and were not requested this turn.
- Schema migration, production deploy, Supabase live cutover, direct data repair/deletion, merge, PR, rollback and release artifacts require separate release/high-risk authorization.

Stop if:

- RD needs to allow single-item technical-transfer submission.
- RD needs missing-required technical-transfer exception.
- RD needs research exception final approval without reviewer/supervisor decision.
- RD cannot enforce one-item package declaration and reviewer scope confirmation.
- RD needs `ApprovedForTransfer` to directly mutate drawing/part/root lifecycle to `Released / Release`.
- RD needs stale readiness snapshots or stale affected sign-offs to remain valid after package changes.
- RD cannot provide canonical access-control capability/auth/API assignment for quality sign-off before child Phase 3C.
- RD needs production deploy, live migration or direct DB mutation.
- RD cannot preserve drawing/part owner-domain responsibility.
- RD cannot capture rule-set version with package readiness.
- RD needs full ERP sync, supplier portal or visual BOM/CAD graph in the first slice.

### DEV-PDM-TRANSFER-PACKAGE-INTAKE-001

Status: `DEV-041` Phase 3A-0 Local Implementation Complete / QA Passed 2026-07-13; Phase 3A-1 to 3C RD Contract Ready / Not Requested This Turn.

Read:

1. `.ai-doc/dev_task.md` entry `DEV-041`
2. `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
3. `.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`
4. `.ai-doc/qc/qc-pdm-transfer-package-phase3a0-report-2026-07-13.md`
5. `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
6. `.ai-doc/decisions/ADR-PDM-SUBMISSION-GATE-001-transfer-package-and-exception-policy.md`
7. `.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md`
8. `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
9. `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`
10. `.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`

Execution boundary:

- Phase 3A-0 is complete locally: explicit persistent Draft creation, stable package ID, shared workbench shell, scope, adapters, blockers and return context.
- The next possible product slice is Phase 3A-1 only after an explicit implementation request and acceptance of Phase 3A-0 evidence. ZIP parsing/classification belongs to 3A-1; mapping/BOM/baseline, readiness and review/sign-off remain later phases.
- Package baseline integer never synchronizes item revisions; incomplete manual/file-preview BOM never passes baseline.
- Formal submit requires real-machine SolidWorks open/missing-reference evidence for the exact materialized candidate configuration, without requiring an Add-in.
- One package may govern multiple explicitly selected top assemblies and approves atomically. Later design change uses a new delta package with inherited unchanged evidence; approved packages are terminal.
- System assembly-revision suggestions require human `no_change`/`defer`/`update`; development decimal and formal integer impacts are strictly isolated. Formal defer follows the Q5 `1C` compatibility/risk/manager/follow-up Gate. Human-visible status is limited to verified `不需進版` or `已非最新版 / 待更新`.
- Impact suggestions are deterministic and versioned with no AI/LLM/network authority. Every formal `no_change` requires R&D Manager approval. Formal defer owns a canonical `transfer_follow_up` with due time and an idempotent projection into the existing task center; the generic task remains non-canonical and its global no-due-date policy is unchanged.
- Formal package download, candidate materialization and SolidWorks verification resolve the exact configuration manifest, item revisions and hashes; ambiguous filename-based `latest` resolution is forbidden. Confirmed/approved canonical evidence is immutable. Drive backup remains tiered: released evidence is required/permanent in the first version, pre-release evidence is selective and existing mirrored blobs are never auto-overwritten or auto-deleted.
- No product code, schema migration, production data, provider change, SolidWorks integration or release work was performed by the document-completeness review.

Stop if:

- GET/open must create a package, owner logic must be duplicated, company/RLS boundary cannot be enforced, parser cannot stream/fail closed, a formal/top assembly can baseline without controlled identity, or transfer approval would directly release a master.
- Development impact would stale formal configuration, formal defer could bypass its Gate, UI must expose separate normal defer/in-progress badges, multi-root approval cannot be atomic, or an approved package must be reopened.

### DEV-PDM-BOM-MODULE-ENTRY-001

Status: `DEV-060 Local RD/QA/QC Passed / Commit Pending / Production Release Gated`.

Read:

1. `.ai-doc/dev_task.md` entry `DEV-060`
2. `.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`
3. `.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md` section 17
4. `.ai-doc/qa/qa-dev-060-bom-entry-material-identity-validation-plan-2026-08-10.md`
5. `.ai-doc/qc/qc-dev-060-bom-entry-material-identity-validation-report-2026-08-10.md`
6. `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
7. `.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`
8. `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md` only when changing the BOM
   review handoff

Execution boundary:

- Human decisions: `1A` = independent two-step full page; material identity rule = Part Number has no Revision,
  Drawing/BOM are independently revisioned; `3B` = CAD, SolidWorks XLS and blank/manual are all first-release sources.
- Phase 1A canonical ownership/migration、Phase 1B API/permission/idempotency、Phase 1C兩步驟三來源UI與Phase 1D
  review/release/export/read integration均已完成；server另阻擋occupied/non-forward BOM Rev。
- BOM review remains canonical `/approvals?domain=bom`; production-slice open-page/mutation allowlists remain unchanged.
- 本機產品與isolated migration/runtime已完成；沒有apply live migration、修改production資料、stage/commit、deploy或release。

Next step:

- 若要commit、live migration、staging/production deploy或release，另走Git/release gate；不得把本機PASS當作production evidence。

Stop if:

- Canonical Part Number ownership cannot replace submission ownership; legacy BOM Rev must be guessed or Released
  history changed/deleted; three sources cannot share atomic idempotent create authority; company/API permission cannot
  fail closed; or implementation requires approval-authority change, live migration, production mutation/deploy/release.

### DEV-PDM-DRAWING-PART-RELATION-VIEW-001

Status: Implemented / local verification passed for Phase 1-3.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
3. `.ai-doc/qa/qa-pdm-drawing-part-relation-view-validation-plan-2026-07-07.md`
4. Existing ownership authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
5. Existing ownership ADR: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
6. Existing layout baseline: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
7. Existing identity-list context: `.ai-doc/specs/SPEC-PDM-IDENTITY-LIST-001-master-list-primary-columns.md`
8. Implemented surfaces: `src/app/numbering/search/page.tsx`, `src/app/api/numbering/relations/route.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/lib/numbering-async.ts`, `src/app/globals.css`, `src/app/parts/page.tsx`, `scripts/qc-pdm-numbering-search-ui.mjs`, `scripts/qc-pdm-master-workbench-layout.mjs`, `scripts/qc-pdm-drawing-part-relation-view.mjs`.

Human-confirmed problem:

- Current 圖料模組 flat list repeats root/drawing/part rows and does not show the relationship.
- The UI must support one root to many drawings, one drawing to many parts and one part to multiple drawings.
- Default view should be root-grouped relationship tree; matrix is a review mode.

Authorization boundary:

- Phase 1-3 local implementation is complete and verified.
- Production deploy, Supabase live cutover, schema migration, direct data repair/deletion, generic bulk relationship API, merge/PR/release/rollback artifacts remain not authorized.
- Verification evidence: `tsc`, lint, build, search UI 30/30, master workbench 205/205, relation view 56/56.

### DEV-PDM-NUMBERING-002

Status: Implemented / verification passed locally for Phase 1-4 local/runtime formal cutover. External production/Supabase live cutover remains approval-gated.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
3. `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
4. `.ai-doc/qa/qa-pdm-numbering-v2-compact-identity-validation-plan-2026-07-07.md`
5. `.ai-doc/qc/qc-pdm-numbering-v2-compact-identity-report-2026-07-07.md`
6. `.ai-doc/qc/qc-pdm-numbering-v2-formal-cutover-report-2026-07-07.md`
7. Existing v1 authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`
8. Related ownership/submission boundary: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
9. Implemented surfaces: `src/lib/numbering-identity.ts`, `db/schema.sql`, `db/postgres/001_initial_schema.sql`, `db/postgres/004_numbering_v2_compact_identity.sql`, `supabase/migrations/20260707000000_numbering_v2_compact_identity.sql`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/app/api/numbering/records/route.ts`, `src/app/api/numbering/drawings/route.ts`, `src/components/number-state-workspace.tsx`, `src/app/numbering/search/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/impact/page.tsx`, downstream submission/shared-3D/baseline helpers, import/export scripts, numbering QC scripts, `scripts/pdm-numbering-v2-cutover.mjs`, `scripts/qc-pdm-numbering-v2-formal-cutover.mjs`, `output/qc-pdm-numbering-v2-cutover/report.md` and `output/qc-pdm-numbering-v2-cutover-check/report.md`; DEV-048 later retired the standalone request page without changing identity authority.

Human decisions:

- New compact identities are `00001`, `00001-P01`, `00001-M01` and `00001-R01`.
- `00001` is a reusable PDM design-object root, not a project/order/equipment root.
- Visible drawing code only distinguishes manufacturing drawing from reference drawing.
- Reference subtype belongs in metadata, not number-code expansion.

Target behavior:

- New records use v2 compact format.
- v1 rows remain readable/searchable and gate-compatible.
- Manufacturing/reference logic is semantic: `MA/M` are manufacturing, `OT/R` are reference.
- `R/OT` drawings cannot become manufacturing basis.

Authorization boundary:

- Local Phase 1-4 implementation and runtime formal cutover are complete.
- Stop if work needs external production/Supabase live cutover, direct data repair/deletion outside the scripted cutover boundary, project/order/equipment numbering or more visible category codes.

### DEV-PDM-NUMBERING-003

Status: Implemented / verification passed locally for Phase 1-3; production/Supabase release remains not authorized.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`
3. `.ai-doc/decisions/ADR-PDM-NUMBERING-003-alphanumeric-root-identity.md`
4. `.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`
5. Existing implemented authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
6. Existing numbering ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
7. Sequence integrity context: `.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`

Human decisions:

- Future v3 roots use `A0001-Z9999`.
- Future v3 identities are `A0001-P01`, `A0001-M01` and `A0001-R01`.
- The leading letter is a capacity band only and must not be interpreted as project, customer, product line, drawing type or lifecycle state.
- Root remains a reusable PDM design-object root, not a project/order/equipment root.
- `P/M/R` remain the only visible identity/category codes.

Implemented behavior:

- New v3 creation generates alphanumeric roots instead of pure numeric roots.
- v1 and v2 rows remain readable/searchable.
- CSV/XLSX import/export preserves identity fields as strings and does not rely on user-adjusted spreadsheet formatting.
- Allocation order is `A0001 ... A9999, B0001 ... Z9999`, using the lowest available uncontrolled root.
- `R/OT` drawings remain blocked from manufacturing-basis gates.
- Local runtime master identities have been cut over to v3 through scripted dry-run, backup, apply and independent check.

Authorization boundary:

- Phase 1-3 local v3 creation/compatibility, dry-run and local/runtime cutover are implemented and verified.
- Current local code defaults normal new numbering to `numbering-rule-v3-alpha-root`, and local runtime master identities have been converted to v3.
- Do not run production/Supabase migration, provider pointer change, direct data repair/deletion outside the scripted local cutover boundary, release artifacts or allowed-letter changes such as excluding `I/O/Q` without explicit authorization.

Implemented Phase 1 surfaces:

- `src/lib/numbering-identity.ts`: v3 helper/parser/formatter and full `A-Z` letter sequence.
- `src/lib/repositories/numbering-async-repository.ts` and `src/lib/repositories/numbering-repository.ts`: v3 default creation, legacy numeric ordinal reservation and audit/control root evidence reservation.
- `src/app/api/numbering/relations/route.ts`, `src/app/numbering/search/page.tsx` and `src/app/parts/page.tsx`: wording separates manufacturing-basis relation from actual manufacturability.
- `scripts/qc-pdm-numbering-v3-alpha-root.mjs`: focused v3 governance QC.
- `scripts/pdm-numbering-v3-cutover.mjs`: v3 dry-run/apply/check with classifications `safe_map`, `collision`, `manual_review`, `protected_evidence_retained` and `out_of_scope`.
- `scripts/qc-pdm-numbering-v3-formal-cutover.mjs`: independent runtime cutover verification.

Verification:

- `npm.cmd run qc:pdm-numbering-v3-alpha-root`: passed 14/14.
- `npm.cmd run pdm:numbering-v3:cutover-dry-run`: passed with `safe_map=24`, `collision=0`, `manual_review=0`, `blockers=0`.
- `npm.cmd run pdm:numbering-v3:cutover-apply -- --allow-running-local-server`: passed; backup `data/backups/pdm-numbering-v3-cutover-20260707-131614/ai-pdm.sqlite`.
- `npm.cmd run qc:pdm-numbering-v3-formal-cutover`: passed 8/8.
- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-change-control`: passed 62/62.
- `npm.cmd run qc:pdm-numbering-core`: passed 241/241.
- `npm.cmd run qc:pdm-numbering-gap-reuse`: passed 8/8.
- `npm.cmd run qc:pdm-numbering-qc-isolation`: passed 46/46.
- `npm.cmd run build`: passed.
- `npm.cmd run dev:local:check`: passed; local URL `http://127.0.0.1:3000/`.

### DEV-PDM-NUMBERING-SEQUENCE-CAPA-001

Status: Implemented / verification passed locally for Phase 1-3. Phase 4 production/Supabase and any further data repair are blocked human re-entry.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`
3. `.ai-doc/qa/qa-pdm-numbering-sequence-capa-validation-plan-2026-07-07.md`
4. `.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`
5. `.ai-doc/qc/qc-pdm-numbering-sequence-repair-report-2026-07-07.md`
6. Existing numbering authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
7. Existing numbering ADR: `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
8. Implemented surfaces: `scripts/numbering-qc-runtime-guard.mjs`, `scripts/pdm-numbering-sequence-repair-runtime.mjs`, `scripts/qc-pdm-numbering-qc-isolation.mjs`, `scripts/qc-pdm-numbering-sequence-integrity.mjs`, `scripts/qc-pdm-numbering-sequence-transaction.mjs`, `scripts/qc-pdm-numbering-duplicate-submit-guard.mjs`, `scripts/qc-pdm-numbering-gap-reuse.mjs`, `src/components/number-state-workspace.tsx`, `src/lib/db-async-provider.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`; UI idempotency ownership moved to the DEV-048 workspace.
9. Guarded allocating QC scripts include `scripts/qc-pdm-numbering-request-ui.mjs`, `scripts/qc-pdm-numbering-api-regression.mjs`, `scripts/qc-pdm-numbering-draft-lifecycle.mjs`, `scripts/qc-pdm-numbering-concurrency-reuse.mjs` and related numbering UI/API QC scripts that allocate roots.

Human decisions and assumptions:

- User reported serial-order mismatch and requested CAPA optimized with `#效用理論`.
- User later instructed `完成此開發任務`, authorizing local Phase 1/2 implementation and verification.
- User later decided that only records currently visible in the drawing-number module UI are formal local data; all other local numbering pollution is test data and may be purged by the documented repair.
- Existing v2 identity policy remains unchanged.
- `00056-M01` is correct as the first manufacturing drawing under root `00056`; the CAPA target is the root sequence jump.
- Retained formal roots after repair: `00007`, `00014`, `00056`, `00057`, `00058`.
- AI assumption after repair: further mutation of `data/ai-pdm.sqlite` still requires explicit data-policy authorization and backup.

Target behavior:

- Allocating numbering QC cannot consume root numbers from shared runtime `data/ai-pdm.sqlite`.
- Sequence integrity drift across `numbering_sequences`, master rows and audit evidence is detectable by an integrity gate.
- SQLite root/part/drawing create is atomic in the async repository path.
- Local repair has backup/apply guardrails, retains formal UI-visible records and purges local test sequence pollution.
- V2 create must allocate the lowest root absent from controlled master rows. Current runtime evidence says occupied roots are `00007`, `00014`, `00056`, `00057`, `00058`, `00059` and lowest available is `00001`.
- Same-form duplicate submit does not consume an additional root number.

Authorization boundary:

- Phase 1-3 implementation, repair and verification are complete.
- Do not treat Phase 3 local repair as authorization for Phase 4 release.
- Do not run further reset, reuse, backfill, voiding, deletion or direct DB mutation without explicit data-repair authorization and backup.
- Production/Supabase, merge, PR, deploy, rollback and production smoke artifacts require explicit release authorization.

Verification evidence:

- `npm run qc:pdm-numbering-qc-isolation`: passed 46/46.
- `npm run qc:pdm-numbering-sequence-integrity`: passed 3/3; current runtime `clean=true`, retained roots 6, audit-created roots 6, purged test roots 53.
- `npm run qc:pdm-numbering-sequence-transaction`: passed 4/4.
- `npm run qc:pdm-numbering-duplicate-submit-guard`: passed 10/10.
- `npm run qc:pdm-numbering-gap-reuse`: passed 8/8; runtime computed lowest available root `00001`.
- `node scripts/pdm-numbering-sequence-repair-runtime.mjs --apply --i-understand-local-runtime-data-repair`: applied with backup `data/backups/pdm-numbering-sequence-repair-20260707-160332/ai-pdm.sqlite`.
- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm run qc:pdm-numbering-core`: passed 241/241.

Stop if:

- Work needs mutation of `data/ai-pdm.sqlite` beyond the documented Phase 3 repair.
- Work needs production/Supabase target access.
- Work changes numbering identity policy, reuse policy, project/order/equipment numbering or visible category codes.

### DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001

Status: Implemented / auto-orchestration follow-up verified locally for Phase 1. Windows Shell `.SLDPRT` evidence is captured; full `.SLDASM` / `.SLDDRW` native readiness, Phase 2 PDF, interactive 3D and production rollout remain gated.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`
3. `.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`
4. `.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`
5. Related settings secret context: `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`, `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`
6. Implemented local Phase 1 surfaces: `db/schema.sql`, `db/postgres/001_initial_schema.sql`, `db/postgres/002_supabase_rls_plan.sql`, `src/lib/preview-derivatives.ts`, `src/lib/master-attachments-async.ts`, attachment routes under `src/app/api/numbering/drawings/[drawingNumber]/attachments/` and `src/app/api/parts/[partNumber]/attachments/`, `src/app/api/preview-jobs/*`, `src/components/master-attachment-panel.tsx`, `scripts/qc-pdm-sw-native-preview-worker.mjs`, `scripts/qc-pdm-sw-native-preview-redaction.mjs`, `scripts/qc-master-attachments.mjs`
7. Related native CAD evidence context: `scripts/probe-document-manager-extractor.mjs`, `scripts/document-manager-report-utils.mjs`, `DEV-CAD-001` external evidence row in `.ai-doc/dev_task.md`

Human decisions:

- Users need SolidWorks native attachment previews similar to Windows File Explorer.
- Phase 1 target is `.SLDPRT/.SLDASM/.SLDDRW -> PNG`.
- Phase 2 target is `.SLDDRW -> PDF`.
- Browser must display generated derivatives; it must not parse native SW files directly.
- The existing SolidWorks API key setting is only a prerequisite, not preview generation by itself.

Target behavior:

- Native source attachments enqueue preview jobs.
- A trusted Windows worker generates PNG/PDF derivatives and returns redacted evidence.
- Derivatives are tied to exact source content hash and become stale when source changes.
- Preview cards show generated PNG/PDF before falling back to PDF/image/Drive/source placeholder.
- Failed/skipped preview generation shows a next action and retry/settings recovery path.

Implementation / authorization boundary:

- Phase 1 local PDM pipeline is implemented and verified with a fake local PNG worker plus a real Windows Shell worker for `.SLDPRT`.
- Full native preview readiness still requires worker-readable Document Manager/eDrawings/equivalent evidence on sample `.SLDASM` and `.SLDDRW` files; current `.SLDDRW` Shell output is blank and the Document Manager path is blocked by missing worker-readable key, both failed cleanly.
- Stop if RD needs browser access to secrets/native CAD tooling, plaintext secret persistence, synchronous COM/eDrawings/SolidWorks calls inside Next.js request handlers, release-blocking preview policy, direct data repair/deletion or production deploy.
- Phase 2 `.SLDDRW -> PDF`, Phase 3 interactive 3D, worker deployment, production migration/cutover, historical backfill and real external tooling runs are not authorized.

Verification evidence:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-sw-native-preview-worker`: passed 90/90.
- `npm.cmd run qc:pdm-sw-native-preview-redaction`: passed 68/68.
- `npm.cmd run qc:master-attachments`: passed 101/101.
- `npm.cmd run qc:pdm-settings-center-secret-lifecycle`: passed 22/22.
- `npm.cmd run qc:supabase-secret-boundary`: passed 15/15.
- `npm.cmd run qc:db-provider-contract`: passed 35/35.
- `npm.cmd run qc:db-provider-postgres`: passed 9/9.
- `npm.cmd run qc:pdm-shared-3d-ma-baseline`: passed 20/20.
- `npm.cmd run dev:local:check`: passed; local URL `http://127.0.0.1:3000/`.
- API worker smoke: `D-0007-MA1.SLDPRT` succeeds through `qc-windows-shell-worker` and creates real derivative `4fde352c-eb3c-416e-bcdd-3ccf1fec6640`.
- API worker smoke: `D-0007-MA1.SLDDRW` fails cleanly with the redacted blank-output message because this workstation's Shell provider returns a low-information thumbnail.
- Browser smoke: screenshot `output/playwright/master-attachment-preview/d0007-3d-ready-2d-key-missing-compact.png` shows real 3D preview, compact 2D failed/retry state, and no fake preview display.

### DEV-PDM-SETTINGS-CENTER-001

Status: Generic lifecycle implemented / verification passed locally. Supabase provider authority superseded by `DEV-058`.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-GCP-SECRET-MANAGER-001-solidworks-worker-credential.md`
3. `.ai-doc/qa/qa-pdm-gcp-secret-manager-solidworks-worker-validation-plan-2026-08-07.md`
4. Historical generic lifecycle context: `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`, `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`, `.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`
5. Existing and new settings implementation: `src/app/settings/page.tsx`, `src/app/settings/integrations/page.tsx`, `src/app/settings/security/page.tsx`, `src/app/settings/workflow/page.tsx`, `src/app/settings/system/page.tsx`, `src/app/api/settings/route.ts`, `src/app/api/settings/secrets/`, `src/lib/settings-secret-lifecycle.ts`, `src/lib/repositories/settings-secret-async-repository.ts`, `src/lib/system-settings-async.ts`, `src/lib/repositories/system-settings-async-repository.ts`
6. Current platform authority: `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`, `.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`
7. CAD blocker context: `DEV-CAD-001` external evidence row in `.ai-doc/dev_task.md`

Human decisions:

- `/settings` becomes a settings center work queue with five management areas.
- Google Secret Manager stores secret material; Cloud SQL stores metadata and exact version references only.
- PDM backend APIs operate Secret Manager through runtime identity; browser/frontend never accesses it directly.
- Google Workspace is account/Drive source; PDM remains role and approval authority.
- High-risk settings require draft, test and Admin activation.
- Visibility is classified by setting type; Manager/Reviewer can see selected redacted status only.
- First implementation slice is SolidWorks secret lifecycle.

Target behavior:

- Admin can enter a SolidWorks/CAD-reader secret once and only see masked/fingerprint status afterward.
- Backend adds a version to a pre-provisioned Google secret and keeps only exact version reference, status and test evidence metadata in Cloud SQL.
- Failed or untested drafts cannot be activated.
- `/settings` overview tells Admin what to do next for missing, test-failed, pending-activation and healthy settings.
- Existing Google Drive settings remain operational until deliberately migrated.

Authorization boundary:

- Historical Phase 1 local lifecycle implementation is complete using `local_test_double`; DEV-058 provider implementation has not started.
- Local Google provider/schema/lifecycle/broker/QC work is executable under `DEV-058`; live Secret Manager/IAM, deploy, production migration and native worker proof remain release-gated.
- Stop if RD needs plaintext storage, browser Secret Manager access, Google credential delivery to the Windows worker, broad Admin/destroy permission or Google Workspace direct PDM role authority.

### DEV-PDM-GCP-SECRET-MANAGER-SW-WORKER-001

Status: `RD Implementation Ready / Human Confirmed / RD Not Started / Production Release Gated`.

Read:

1. `.ai-doc/dev_task.md` (`DEV-058` only)
2. `.ai-doc/specs/SPEC-PDM-GCP-SECRET-MANAGER-001-solidworks-worker-credential.md`
3. `.ai-doc/qa/qa-pdm-gcp-secret-manager-solidworks-worker-validation-plan-2026-08-07.md`
4. `.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`
5. Existing implementation boundaries: `src/lib/settings-secret-lifecycle.ts`, `src/lib/repositories/settings-secret-async-repository.ts`, `src/app/api/settings/secrets/`, `src/app/api/preview-workers/solidworks-document-manager-key/route.ts`, `scripts/run-solidworks-document-manager-preview-worker.mjs`, `db/schema.sql`, `db/postgres/001_initial_schema.sql`

Execution boundary:

- Implement local provider/schema/lifecycle/broker/readiness/QC Phase 1A～1D only.
- Keep Cloud SQL metadata-only, pin exact Secret Manager versions and keep the Windows worker free of Google service-account keys.
- Live secret/IAM/Terraform, deploy, production migration, real `.SLDDRW` evidence and release remain under `DEV-032` / deployment release gate.

### DEV-PDM-SHARED-3D-MA-BASELINE-001

Status: Implemented / verification passed locally. Production deploy/migration, direct data repair/deletion, CAD/OCR extraction and production cutover remain gated.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`
3. `.ai-doc/decisions/ADR-PDM-SHARED-3D-MA-BASELINE-001-root-shared-model-and-manufacturing-baseline.md`
4. `.ai-doc/qa/qa-pdm-shared-3d-ma-baseline-validation-plan-2026-07-06.md`
5. Related drawing package model: `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
6. Related drawing revision package flow: `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
7. Related drawing/part workbench ownership: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
8. Related release lifecycle sync: `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`
9. Implemented surfaces: `db/schema.sql`, `db/postgres/001_initial_schema.sql`, `db/postgres/002_supabase_rls_plan.sql`, `src/lib/db.ts`, `src/lib/shared-3d-baseline.ts`, `src/lib/repositories/shared-3d-baseline-async-repository.ts`, `src/lib/submission-release-workflow.ts`, shared model / model-basis / manufacturing baseline API routes, `src/lib/repositories/master-attachment-async-repository.ts`, `src/lib/repositories/master-attachment-repository.ts`, `src/components/master-attachment-panel.tsx`, `src/app/parts/page.tsx`, `scripts/qc-pdm-shared-3d-ma-baseline.mjs`, `package.json`.

Human decisions:

- Shared 3D belongs at part/root level, not under one MA drawing.
- Part/root search remains dynamic navigation.
- Manufacturing baseline is a formal frozen evidence object that locks shared 3D hash/model version and MA drawing package revisions.
- MA drawing release requires shared model link or reviewed `2D-only / no 3D impact` exception.

Target behavior:

- Part/root detail has shared 3D model version evidence and hash reuse guidance.
- MA drawing revision package shows linked shared 3D or reviewed 2D-only exception.
- Manufacturing baseline freezes exact shared 3D and MA package ids and is immutable after release.
- Baseline resolver prevents silent omission of required MA drawings.
- Shared model hash/revision conflicts are deterministic and review-gated.
- Model impact analysis lists MA drawings and baselines that use an older model version.

Authorization boundary:

- Local non-production implementation is complete and verified.
- Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule changes, production cutover and using one MA drawing as the shared 3D owner remain not authorized.
- Handoff/download baseline automation and historical migration dry-run are future gated work.

Evidence:

- `npx.cmd tsc --noEmit --pretty false` passed.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run qc:pdm-shared-3d-ma-baseline` passed 20/20.
- `npm.cmd run qc:pdm-drawing-revision-package-model` passed 59/59.
- `npm.cmd run qc:pdm-change-control` passed 61/61.
- `npm.cmd run qc:db-provider-contract` passed 35/35.
- `npm.cmd run qc:db-provider-postgres` passed 9/9.
- `npm.cmd run qc:supabase-current-change-impact` passed 15/15.
- Browser smoke passed on `http://localhost:3000/parts` with screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`.

### DEV-PDM-NEXT-STEP-UX-001

Status: Implemented / verification passed locally for Phase 1. Scanner/checklist hardening and production release are not authorized.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`
3. Existing status vocabulary context: `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`
4. Existing lifecycle UX context: `.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md`
5. Existing platform routing context: `.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md`
6. Current Phase 1 surfaces: `src/components/dashboard.tsx`, `src/lib/status-display.ts`, `src/components/next-step-state.tsx`, `src/components/lifecycle-ux.tsx`, `src/app/numbering/revisions/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/submissions/[id]/page.tsx`, `src/app/handoff/page.tsx`, `src/app/numbering/search/page.tsx`, `src/app/parts/page.tsx`, `src/components/number-state-workspace.tsx`, `src/components/master-attachment-panel.tsx`, `src/app/numbering/reports/page.tsx`.

Human decisions:

- Normal user UI must answer `那我現在要幹嘛`.
- Correct next action can be `不用處理`, but it must be explicit.
- Main UI copy must not lead with raw backend code, SQL, HTTP status, enum names, internal IDs or audit detail.
- High-risk states must show responsible role and recovery path.
- Technical detail belongs in secondary details/debug/audit, not the primary answer.

Target behavior:

- Blockers, empty states, disabled actions, failure alerts and detail-page error states start with the user's next action.
- The first CTA matches the recommended next action.
- Terminal states do not invite unavailable actions.
- Recoverable states show owner and route.

Authorization boundary:

- Phase 0 documentation is complete.
- Phase 1 local UI implementation is complete and locally verified.
- Phase 2 scanner/checklist requires explicit authorization.
- Phase 3 production release requires release/deploy approval.
- Stop for PM/ADR if implementation needs DB/API/permission/state-machine changes, production deploy, direct data repair or historical cleanup.

Evidence:

- `npx.cmd tsc --noEmit --pretty false` passed.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run qc:pdm-status-ui-vocabulary` passed 44/44.
- `npm.cmd run qc:pdm-numbering-search-ui` passed 28/28.
- `npm.cmd run qc:pdm-numbering-dvt-ui` passed 24/24.
- `npm.cmd run qc:pdm-numbering-report-center-ui` passed 22/22.
- `npm.cmd run qc:master-attachments` passed 93/93.
- `npm.cmd run qc:pdm-drawing-submission-ui-operation` passed 14/14.
- `npm.cmd run dev:local:check` passed.
- `npm.cmd run build` was blocked by the intentional local-dev guard because AI_PDM was listening on port 3000; no bypass was used.

### DEV-PDM-STATUS-UX-001

Status: Implemented / verification passed locally for Phase 1. Remaining Phase 2 hardening, DB enum/schema rename, production deploy, production migration, audit payload migration and historical data repair are not authorized.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`
3. Existing UI vocabulary authority: `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
4. Existing object lifecycle UX context: `.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md`
5. Implemented surfaces include: `src/lib/status-display.ts`, `src/components/status-help-popover.tsx`, `src/components/lifecycle-ux.tsx`, `src/components/dashboard.tsx`, `src/components/dashboard/layout-parts.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/search/page.tsx`, `src/app/parts/page.tsx`, `src/components/number-state-workspace.tsx`, `src/app/submissions/[id]/page.tsx`, `src/app/upload/page.tsx`, `src/app/bom/workbench/page.tsx`, `src/app/numbering/tasks/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/numbering/approvals/page.tsx`, `src/app/numbering/impact/page.tsx`, `src/app/numbering/reports/page.tsx`, `src/app/numbering/imports/page.tsx`, `src/app/settings/page.tsx`, `scripts/qc-pdm-status-ui-vocabulary.mjs`, `package.json`.

Human decisions:

- UI layer must display user-understandable Traditional Chinese status wording only.
- Backend raw status codes may remain in DB/API/audit/debug; normal user UI must not expose them.
- `Released` object status is displayed as `已發布` in normal UI.
- Every table with a status column must add a unified `?` help button in the status column header.
- The status help popover closes on `ESC` and outside click, and must not trigger sort, filter, row selection or navigation.

Target behavior:

- Status badges, filters, table cells, blockers and visible errors use the central status dictionary.
- Status help content is generated from the same dictionary as the visible status label.
- Unknown status fails closed to `未分類狀態` or `異常`; it does not show the raw enum to normal users.

Authorization boundary:

- Phase 1 is implemented and locally verified.
- Remaining Phase 2 hardening/scanner expansion is RD Contract Ready only and requires explicit authorization.
- No DB enum/schema rename, production deploy, production migration, audit payload migration or historical data repair is authorized.

Evidence:

- `npm run qc:pdm-status-ui-vocabulary` passed 44/44.
- `npx tsc --noEmit --pretty false` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Browser UI evidence passed on `/settings`; screenshot `output/playwright/status-ui/settings-status-help-open.png`.
- `npm run dev:local:check` passed after local 3000 restart.

### DEV-PDM-STATUS-UX-002

Status: Implemented / verification passed locally for Phase 1. Phase 2 scanner hardening/checklist remains RD Contract Ready / Not Authorized.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`
3. `.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`
4. Parent context: `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`, `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`
5. Implemented surfaces: `src/lib/status-display.ts`, `src/components/status-help-popover.tsx`, `src/app/numbering/tasks/page.tsx`, `src/app/numbering/imports/page.tsx`, `src/app/settings/page.tsx`, `src/app/numbering/reports/page.tsx`, `src/app/numbering/approvals/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/bom/workbench/page.tsx`, `src/components/number-state-workspace.tsx`, `src/app/parts/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/search/page.tsx`, `scripts/qc-pdm-status-ui-vocabulary.mjs`.

Human-confirmed problem:

- The UI should explain task-specific status, not full raw enum lists.
- `?` help must match the column's real status context.
- Mixed columns must be named or grouped so users do not mistake phase/cost/warning chips for the same status.
- Raw DB/API/audit statuses remain unchanged.

Implementation / authorization boundary:

- Phase 1 is implemented and locally verified.
- Phase 2 scanner hardening is RD Contract Ready / Not Authorized.
- Stop if DB/API/schema migration, lifecycle semantic changes, production deploy, historical repair or direct data mutation are needed.

Verification evidence:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-status-ui-vocabulary`: passed 81/81.
- Browser status-context checks: passed 73/73 for tasks/imports/settings/reports/approvals.
- Browser DVT status-context check with QC-owned temporary fixture: passed 11/11.
- Browser 390px task status popover sanity: passed 4/4.
- Screenshots: `output/playwright/status-context-disambiguation/`.
- `npm.cmd run dev:local:check`: passed.

### DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002

Status: Implemented / verification passed locally for Phase 1; Phase 2+ RD Contract Ready. Production deploy, production migration, direct DB cleanup, historical data repair and data deletion remain unapproved.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
3. Phase 1 QA plan: `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`
4. Background/amended spec: `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`
5. Background/amended spec: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
6. Existing ADR authority with amendment note: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
7. Current / expected implementation surfaces: `db/schema.sql`, `src/lib/db.ts`, `src/lib/types.ts`, `src/lib/drawing-submission-workbench.ts`, `src/lib/submission-release-workflow.ts`, `src/lib/submission-status-async.ts`, `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/repositories/submission-write-async-repository.ts`, `src/app/api/submissions/[id]/approve/route.ts`, `src/app/api/submissions/[id]/cancel/route.ts`, `src/app/api/submissions/[id]/retry-release/route.ts`, `src/app/api/submissions/[id]/return-for-correction/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`, `src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx`, `src/app/upload/page.tsx`, `src/app/submissions/[id]/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/search/page.tsx`, `src/components/dashboard.tsx`, `scripts/qc-pdm-drawing-submission-workbench-recovery.mjs`, `scripts/qc-pdm-drawing-submission-workbench-mutation.mjs`, `package.json`.

Human decisions:

- 送審入口保留在圖號 / 圖料模組；工作台可獨立成 `/drawings/[drawingNumber]/submission-workbench`.
- Same-revision records are status-classified: in-progress, release incomplete, released/obsolete locked, and non-blocking history.
- Pending can be cancelled by submitter, R&D Manager or Admin and becomes `Cancelled`.
- ReleaseFailed UI language is `發行未完成`; unresolved ReleaseFailed blocks and must be handled by R&D Manager/Admin.
- ReleaseFailed can be retried or returned for correction; returned correction creates a linked new working submission.
- Successful linked release resolves the old ReleaseFailed, which no longer blocks or appears in main todo.
- All UI blocker/action copy must be user-understandable Traditional Chinese.

Phase 1 scope:

- New workbench route and module CTA target.
- Status-specific same-revision blocker classification.
- Pending cancellation.
- ReleaseFailed retry and return-for-correction.
- Resolved ReleaseFailed relation and de-noising.
- Focused QC and browser evidence.

Current Phase 1 continuation notes:

- Treat Phase 1 as implemented / verification passed locally. Continue only for APP validation feedback or explicitly authorized future phase work.
- Continue from `.ai-doc/dev_task.md` entry `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`, especially the `Current local implementation status` subsection.
- No Phase 1 local gate remains. Do not start Phase 2+ unless the user explicitly authorizes it.
- Keep all UI copy in user-understandable Traditional Chinese; normal UI must not expose raw internal codes or SQL/constraint errors.

Out of scope for Phase 1:

- Master-data completion/writeback.
- Attachment upload/writeback.
- Collaborative editing.
- Full dashboard/todo refactor.
- Full history/reporting.
- Production deploy/migration or data cleanup.

Phase 2+ RD handoff continuity:

- Phase 2: master-data completion/writeback in the workbench through owner APIs, drawing attachment upload to the attachment library, writeback summary, save-and-submit ordering, stale-version protection, and immutable snapshot after writeback.
- Phase 3: collaboration toggle, invited same-company collaborators, per-field owner-domain permissions, operational edit history, automatic collaboration close, and dashboard/todo de-noising for resolved ReleaseFailed and non-actionable history.
- Phase 4: compatibility cleanup, production migration/cutover and historical repair are parked behind a release gate.
- All Phase 2+ handoff contracts include scope, out of scope, implementation/data/API/permission/state-machine impact, dependencies, entry conditions, acceptance, QA/QC gate, stop conditions, evidence required, deferred decisions and recovery conditions.
- Section 4.5 of the spec records the latest All-Phase Gate closure: Phase 1 is the only authorized implementation scope; Phase 2 and Phase 3 are RD Contract Ready only; Phase 4 is parked behind release gate approval.
- Required read for Phase 2+: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.5 and `.ai-doc/dev_task.md` entry `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P`. The P2P row now carries the `dev-pm` executable schema fields for future scope, out-of-scope, implementation contract, acceptance, stop conditions, evidence and re-entry triggers; it is still documentation-only until explicitly authorized.

### DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003

Status: Implemented / verification passed locally. Continue only for APP validation feedback or separately authorized future work.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`
3. Current UI real-operation QA plan: `.ai-doc/qa/qa-pdm-drawing-submission-ui-real-operation-validation-plan-2026-07-02.md`
4. Legacy partial UI regression QA plan: `.ai-doc/qa/qa-pdm-drawing-submission-ui-operation-validation-plan-2026-07-02.md`
5. Parent recovery spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
6. Parent review-only spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
7. Parent data-ownership spec: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
8. Implemented surfaces: `src/app/upload/page.tsx`, `src/app/submissions/[id]/page.tsx`, `src/lib/drawing-submission-workbench.ts`, `src/lib/repositories/submission-status-async-repository.ts`, `src/app/api/submissions/[id]/return-for-correction/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`, `scripts/qc-pdm-drawing-submission-ui-self-recovery.mjs`, `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`, `package.json`.

Human decisions:

- D-0014-like release-incomplete failures must become UI-solvable.
- UI must show conflict filename, conflicting formal record and next action in Traditional Chinese.
- The workbench may organize drawing-owned attachments and create corrected submission packages, but must not overwrite released evidence or weaken release guards.
- `return-for-correction` must not blindly copy the old failed package when the problem is bad attachments.

Implemented scope:

- Release-incomplete recovery panel.
- Attachment organizer with upload/soft-delete/select.
- Server-side release preflight for selected attachments.
- Selected-attachment confirmation before creating a corrected Pending submission.
- Same-revision workflow map, formal-record lock state and role-aware CTAs.
- Submission-detail link back to the workbench for attachment/filename recovery.
- Focused QC command: `npm run qc:pdm-drawing-submission-ui-self-recovery`.
- UI real-operation QA baseline: `.ai-doc/qa/qa-pdm-drawing-submission-ui-real-operation-validation-plan-2026-07-02.md` defines the current 26-case browser UI matrix. This supersedes the ambiguous 14/28-case planning split for future QC closure.
- Legacy UI-only operation QC command: `npm run qc:pdm-drawing-submission-ui-operation`; latest local run passed 14/14 and writes `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`. Treat this as partial regression evidence, not full 26-case UI closure.
  - Clean database continuation note: the QC runner now bootstraps a minimal QC-owned `D-QC-SUBMIT-MA1` fixture only when absent, records fixture setup in the report, treats setup as prerequisite data rather than UI evidence, and removes QC-owned fixture rows/files after browser evidence is captured. Historical D-0014 data is not a required executable fixture.

Remaining high-risk boundaries:

- No production deploy/migration, direct DB cleanup, historical repair, data deletion or released-file overwrite.
- No collaboration/dashboard later phases or Google Drive production file movement without separate authorization.

### DEV-PDM-DRAWING-REVISION-SUBMISSION-001

Status: Implemented / verification passed locally for Phase 1, Phase 2, Phase 3 and Phase 4. Phase 1 includes 2026-07-05 APP feedback that prior-revision attachments must not pollute the primary new-revision work area. Phase 2 implements multi-file revision package intake, extension-based role correction, warning-only completeness and reviewer warning parity. Phase 3 implements out-of-order revision acceptance, duplicate formal same-revision blocking, deterministic latest/history recomputation and latest-only first-level grouping. Phase 4 implements the first-class revision attachment package model with stable `packageId`, package files, Released-core immutability, supplement request/approval, approved supplement `補件` tagging and migration dry-run reporting. Phase 5 CAD/OCR extraction assistance, Phase 6 production/historical classification, production deploy, production migration/cutover, direct data repair, forced part/BOM revision and dedicated mobile-phone UI are not authorized. Phones use the desktop/default surface.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
3. Phase 4 first-class package model: `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
4. Phase 4 ADR: `.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-PACKAGE-001-first-class-package-and-supplement.md`
5. Phase 4 QA plan: `.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`
6. `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`
7. Parent change-control spec: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
8. Parent drawing revision UX spec: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`
9. Parent drawing submission workbench spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
10. UI self-recovery/attachment organizer context: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`
11. Implemented surfaces: `src/app/numbering/revisions/page.tsx`, `src/lib/revision-policy.ts`, `src/lib/drawing-revision-workbench.ts`, `src/lib/pdm-change-control-domain.ts`, `src/lib/drawing-submission-workbench.ts`, `src/lib/submission-release-workflow.ts`, `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/repositories/submission-repository.ts`, `src/app/api/submissions/[id]/approve/route.ts`, `src/app/api/submissions/[id]/retry-release/route.ts`, `src/components/master-attachment-panel.tsx`, `src/app/api/numbering/drawing-revisions/submissions/route.ts`, `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`, `scripts/qc-pdm-change-control.mjs`, `src/app/upload/page.tsx`.

Human-confirmed problem:

- A drawing revision may advance from `0.1` to `0.2` while part number and BOM remain unchanged.
- An attachment-library file labelled `0.2` is not a formal drawing revision by itself.
- Formal drawing revision needs selected drawing files, FFF judgement, Pending submission package, reviewer confirmation and release/audit evidence.
- 2026-07-05 Phase 2 decision: a drawing revision upload is a multi-file `版次檔案包`; file category is auto-classified by extension with inline correction; completeness checks are warning-only after at least one valid file exists; the review page/drawer must show the same warnings before approval/rejection.
- 2026-07-05 Phase 3 decision: all revisions may be entered and approved in any order; the system suggests the next likely revision, prevents duplicate formal same drawing + same revision records, computes latest by revision order and moves non-latest approved revisions to history.
- 2026-07-06 Phase 4 decision: the package must become a first-class model with stable `packageId`; Released package core evidence is immutable; supplements are approved child records; approved supplements display in the same attachment list with `補件` tag/icon; ambiguous migration records are reported in IDE/Codex dry-run output, not product UI.

Target behavior:

- `/numbering/revisions` must include a `新版圖面` step.
- The primary `新版圖面` selectable list must show only files matching the intended revision; prior/other-revision files stay traceable in a default-collapsed read-only reference area with no checkbox.
- Attachment upload success must clarify the file is source/staging until included in the revision submission package.
- Formal action is `建立圖面進版送審`.
- The package creation flow links `drawing_revision_fff_assessments.submission_id` to the created Pending submission.
- No-impact path keeps part/BOM unchanged and requires reviewer BOM no-revision confirmation.
- Confirmed-impact path keeps existing replacement draft and drawing part-number match guards.
- Phase 2 implemented target: multi-file package upload, role auto-classification, category correction, warning-only submitter guidance and reviewer warning parity.
- Phase 3 implemented target: lower/skipped revisions can be approved after newer revisions exist; lower backfilled revisions become formal history and do not replace the current latest; higher revisions become latest; first-level views show latest only with older approved revisions in history.
- Phase 4 implemented target: package operations use `packageId`; same drawing + revision duplicate Released package is blocked; Released core files are immutable; late files use supplement request/approval; approved supplements are shown with `補件` marking.

Authorization boundary:

- Phase 1 implementation was authorized by the user's 2026-07-03 `執行開發` instruction and is complete locally.
- Phase 2 multi-file package intake was authorized by the user's 2026-07-05 `執行開發` instruction and is complete locally.
- Phase 3 out-of-order revision acceptance and latest/history view is implemented and locally verified.
- Phase 4 first-class package model is implemented / verification passed locally.
- Phase 5 CAD/OCR extraction assistance and Phase 6 production/historical classification are captured but not authorized.
- Production deploy, production migration/cutover, direct DB mutation against existing user data, historical repair, data deletion, CAD/OCR dependency, optional-warning hard-blocking, strict chronological approval, duplicate formal same-revision records, forced part/BOM revision or dedicated mobile-phone UI remain unauthorized after the Phase 4 local implementation.

Verification evidence:

- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint -- --quiet`: passed on 2026-07-05 APP feedback fix.
- `npm run qc:pdm-change-control`: passed 61/61 after Phase 3 implementation, including lower-after-newer history, higher-as-latest, duplicate same-revision guard and static chronological-blocker removal checks.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14.
- `npm run qc:pdm-drawing-submission-workbench-mutation`: passed 33/33.
- Playwright mock browser evidence passed on 2026-07-05 for target revision `0.2` with only prior `0.1` attachment at 1440x900 plus optional 390x844 sanity; screenshots are under `output/playwright/drawing-revision-reference-filter/`.
- Phase 2 Playwright smoke passed for multi-file package submitter guidance and reviewer warning parity. Evidence screenshots: `output/playwright/drawing-revision-package-p2/revision-package-submit-desktop.png`, `output/playwright/drawing-revision-package-p2/submission-review-warning-desktop.png`; `output/playwright/drawing-revision-package-p2/revision-package-submit-mobile.png` is optional viewport sanity only, not mobile support evidence.
- Local page smoke: `/numbering/revisions` returned HTTP 200 from the existing dev server.
- Protected API smoke: unauthenticated `/api/numbering/drawings/D-0007-MA1/submission-workbench?revision=0.2` returned HTTP 401 `需要登入`.
- `npm run build` was not run because the local-dev guard refused to clean `.next` while AI_PDM was already listening on port 3000.
- Phase 4 local implementation evidence: `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`, ADR, QA plan, package schema files, package domain/repository/API integration, `src/components/master-attachment-panel.tsx` supplement UI integration, `scripts/qc-pdm-drawing-revision-package-model.mjs`, `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59, `npm.cmd run qc:pdm-change-control` 61/61, `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet` and `npm.cmd run db:init`.

Required future evidence for future changes:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:pdm-change-control`
- `npm.cmd run qc:pdm-drawing-submission-workbench-recovery`
- `npm.cmd run qc:pdm-drawing-submission-review-only`
- Focused QC if added: `npm.cmd run qc:pdm-drawing-revision-submission`
- Phase 4 focused QC: `npm.cmd run qc:pdm-drawing-revision-package-model` passed 59/59.
- Browser/API/DB evidence proving Pending submission and FFF assessment linkage, no-impact part/BOM unchanged state and reviewer BOM no-revision confirmation.
- Remaining recommended Phase 4 APP evidence: browser/API/migration evidence proving packageId operations, duplicate Released package guard, Released-core immutability, supplement approval/tagging and migration dry-run ambiguity reporting on real or seeded data.
- Phase 2 regression evidence if touched: multi-file package upload, category auto-classification, inline correction persistence, warning-only submit behavior, reviewer warning parity and shared warning-code evidence.
- Phase 3 evidence in this local pass: approve lower-after-newer into history, approve higher-as-latest, duplicate same-revision block, latest/history UI static guard and static/API proof that chronological order conflict no longer blocks approval. Manual browser evidence for every operational consumer remains recommended for APP validation.

### DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001

Status: Phase 1 implemented / verification passed locally. Historical repair and production work require explicit authorization.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`
3. Parent recovery spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
4. UI self-recovery spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`
5. Data ownership ADR: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
6. Implemented surfaces: `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/app/numbering/drawings/page.tsx`, `scripts/qc-pdm-release-master-status-sync.mjs`, `package.json`.

Human-confirmed problem:

- D-0014-MA1 has a released submission but drawing/part/root master statuses remain `Draft`.
- User-facing surfaces must not disagree about whether a drawing is already formal.

Phase 1 result:

- Release success must sync submission, source drawing, primary part and root lifecycle in one DB transaction.
- If master sync fails, the submission must not be reported as `Released`; it must remain recoverable as `發行未完成`.
- Audit must record before/after master status changes.
- Temporary UI guard should surface inconsistency until historical data is repaired.
- Local verification passed: `npm run qc:pdm-release-master-status-sync` 23/23, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run qc:pdm-drawing-submission-workbench-recovery` 27/27, `npm run qc:pdm-drawing-submission-ui-operation` 14/14, and `output/playwright/pdm-release-master-status-sync-guard-d0014.png`.

Not authorized:

- Historical D-0014 repair.
- Production migration or production data repair.
- Direct DB mutation or data deletion.

### DEV-PDM-SUBMISSION-CONFLICT-001

Status: Implemented / verification passed locally. Production deploy, production migration, direct DB cleanup, historical duplicate repair and data deletion remain unapproved.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`
3. `.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`
4. Parent spec: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
5. Existing ADR authority: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
6. Current implementation surfaces: `src/lib/drawing-submission-workbench.ts`, `src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx`, `src/app/upload/page.tsx`, `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`, `src/app/api/numbering/roots/[rootCode]/submission-readiness/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route.ts`, `src/lib/repositories/submission-write-async-repository.ts`.

Human decisions:

- `duplicate_active_submission` is a `submission_conflict`, not `master_data_missing`.
- Duplicate active drawing + revision submission is blocked, not warning-only.
- Errors must be human-readable Traditional Chinese and must not expose raw DB constraints.
- Blocked attempts retain audit trail.
- Reviewer approval/release must be guarded for legacy duplicate active conflicts.

Target behavior:

- Readiness API and UI group duplicate active conflicts separately from master-data missing blockers.
- Submit-time duplicate active conflict returns 409 with Chinese message and creates no second Pending submission.
- Same-key idempotent replay remains safe.
- Parallel different-key duplicate submit creates at most one active submission.
- Reviewer cannot approve/release legacy duplicate active submissions.

Implementation summary:

- Use `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md` Section 12 as the authoritative plan.
- Implemented blocker grouping, existing-submission lookup, readiness classification, submit-time guard, raw DB shielding, UI grouped state, reviewer guard and focused QC.
- Idempotency replay is checked before duplicate conflict; duplicate conflict is checked before file storage and submission creation.
- Implemented surfaces: `src/lib/drawing-submission-workbench.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`, `src/app/upload/page.tsx`, `src/app/api/submissions/[id]/approve/route.ts`, `src/components/dashboard.tsx`, `scripts/qc-pdm-submission-conflict-duplicate-active.mjs`, `scripts/qc-pdm-drawing-submission-review-only.mjs`, `package.json`.

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14.
- `npm run qc:pdm-drawing-part-workbench-security`: passed.
- `npm run qc:pdm-submission-conflict-duplicate-active`: passed 10/10.
- Browser evidence captured:
  - `output/playwright/pdm-submission-conflict-duplicate-desktop.png` and `output/playwright/pdm-submission-conflict-mobile.png` show D-0014-MA1 duplicate conflict as `已有進行中的送審` with no duplicate-as-master-data wording.
  - `output/playwright/pdm-submission-conflict-ready-desktop.png`, `output/playwright/pdm-submission-conflict-note-required.png`, and `output/playwright/pdm-submission-conflict-mixed-blockers.png` cover ready, note-required and mixed blocker UI states through Playwright route-mock UI contract smoke.
- Reviewer legacy duplicate browser fixture remains recommended for APP validation when disposable duplicate-active data can be created safely; local reviewer guard is covered by API implementation and focused QC.

### Non-Production Completion Audit

Status: Completed locally. Production/cutover excluded.

Read:

1. `.ai-doc/dev_task.md` Section 1.1
2. `scripts/qc-dev-task-completion-audit.mjs`
3. `scripts/qc-production-readiness-test.mjs`

Verification evidence:

- `npm run qc:dev-task-evidence-sync`: passed 13/13.
- `npm run qc:dev-task-completion-audit`: passed 8/8.
- `npm run qc:production-readiness -- --allow-open`: passed with `ready=false`, `supabaseShadowEvidenceReady=true`, and one `external_field_test` gate visible; under the later Phase 3A.0/3A.1 decision this blocks wider opening/pilot acceptance, not the first named-user canary deploy.
- `npx tsc --noEmit`, `npm run lint -- --quiet`, and `npm run build`: passed.

`HD-9-1` cancels the former post-deploy `DEV-FIELD-001` fixed five-business-day acceptance task without treating it as passed. The remaining first-version blocker is production release readiness: DEV-046 Phase 2B staging activation is complete, and the next launch-moving gate is `DEV-032` production release, including the closed `HD-8-4 / 1A` pre-canary production DB restore/reconciliation evidence, rollback readiness, explicit allowlist and post-deploy smoke. `DEV-CAD-001`, `DEV-SW-001`, and `DEV-BACKUP-001` remain deferred full-PDM scopes; `DEV-IND-007` is complete for the disposable shadow gate.

### DEV-PDM-DRAWING-PART-WORKBENCH-001

Status: Implemented / verification passed locally on 2026-07-01. Production deploy, production migration, direct DB cleanup, data deletion and existing-data repair remain unapproved.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
3. `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
4. `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`
5. Superseded context: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
6. Layout baseline: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
7. Implemented surfaces: `src/app/numbering/search/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx`, `src/app/upload/page.tsx`, `src/app/api/submissions/route.ts`, `src/app/api/numbering/roots/[rootCode]/submission-readiness/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`, `src/lib/drawing-submission-workbench.ts`, `src/lib/repositories/submission-write-async-repository.ts`, `src/lib/db.ts`, `db/schema.sql`, `scripts/qc-pdm-drawing-part-workbench-security.mjs`, `scripts/qc-pdm-drawing-submission-review-only.mjs`.

Human decisions:

- 圖號模組 remains drawing-focused.
- 圖料模組 is the root/drawing/part aggregation and submission-preparation workbench.
- Inline editing is allowed in 圖料模組 but writes must go through owner domain APIs and audit.
- Submission freezes a snapshot at submit time.
- Send-review safety gate uses frontend visibility, backend enforcement and DB constraints.
- Duplicate attachment filenames are not allowed and must be blocked in Chinese before DB failure.
- Failed submit attempts retain audit trail.
- Generic `/upload` is fully retired from formal submission.
- Generic `POST /api/submissions` no longer creates formal submissions for the retired workflow.
- Ambiguous root/drawing/part relationships block submission and must show Chinese recovery messages.
- Snapshot must include version, rules version, source, canonical hash and immutable owner-field evidence.
- Idempotency must prevent retry/parallel duplicate submission.
- Released master data cannot be patched inline to make submission pass.

Target behavior:

- Drawing/part shortcuts route to 圖料 readiness, not generic upload.
- 圖料 readiness shows owner-labeled fields, blockers, eligible attachments and submit state.
- Successful submit creates Pending submission plus immutable snapshot and source traceability.
- `/upload` no longer shows the generic file dropzone/PDM attribute send-review form.
- Direct generic API bypass is rejected with human-readable Chinese error.

Verification evidence captured:

- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-numbering-api-regression` with temporary `PDM_BASE_URL=http://127.0.0.1:3100`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14.
- `npm run qc:pdm-drawing-part-workbench-security`: passed.
- Browser evidence includes `output/playwright/pdm-upload-retired-desktop.png`, plus same-day drawing submission/master-data screenshots under `output/playwright/`.

### DEV-PDM-DRAWING-SUBMISSION-001

Status: Implemented / verification passed locally. Production deploy not approved.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
3. `.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`
4. Existing auxiliary upload regression context: `.ai-doc/qa/qa-windows-upload-validation-plan-2026-05-26.md`
5. Implementation source files: `src/lib/drawing-submission-workbench.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submission-context/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`, `src/app/numbering/drawings/page.tsx`, `src/app/upload/page.tsx`, `src/lib/file-store.ts`, `src/lib/repositories/submission-write-async-repository.ts`, `db/schema.sql`, `scripts/qc-pdm-drawing-submission-review-only.mjs`.

Human decision:

- `送審階段不應該再補資料，這些應該都在圖號模組完成`.

Target behavior:

- Drawing detail `送審` must not open a blank generic `/upload` form.
- Drawing-source submission page shows read-only drawing/part/attachment context.
- Missing master data blocks submission and routes back to master-data surfaces.
- Only review note/reason and selected source attachment(s) are editable.
- Generic `/upload` remains auxiliary/manual intake unless separately retired.

Verification evidence:

- `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`.
- `npm run qc:pdm-drawing-submission-review-only`, `npm run qc:pdm-change-control`, `PDM_BASE_URL=http://127.0.0.1:3001 npm run qc:pdm-numbering-api-regression`.
- Browser smoke screenshots: `output/playwright/pdm-drawing-submission-review-only-desktop.png`, `output/playwright/pdm-drawing-submission-review-only-mobile.png`.
- Final local `http://127.0.0.1:3000` smoke passed for `/upload?source=drawing&drawingNumber=D-0014-MA1`: review-only route, source banner, no generic upload form, zero editable master-data inputs, blocked submit while missing master data exists.
- API smoke with local `QC-DRS-*` fixture proved successful Pending submission creation, source traceability and duplicate-prevention 409.

### DEV-PDM-UI-POLISH-001

Status: Implemented / verification passed. Scope was user-facing UI simplification and polish only; backend rigor may remain complex.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`
3. `.ai-doc/qa/qa-pdm-drawing-revision-workbench-validation-plan-2026-06-30.md`
4. User APP validation screenshots and notes in the current thread
5. Relevant UI source files: `src/app/upload/page.tsx`, `src/lib/pdm-metadata.ts`, `src/components/master-attachment-panel.tsx`, `src/app/numbering/revisions/page.tsx`, `src/app/numbering/drawings/page.tsx`, and related CSS

Completed scope:

- Upload warning copy simplification for missing company-specific SolidWorks Document Manager or equivalent CAD metadata/reference adapter.
- Upload PDM attributes simplification: revision default `0.1`, product series optional, remove unnecessary fields, add remark, one reviewer by default.
- Multi-file upload with SolidWorks-primary metadata and conflict warnings.
- SolidWorks attachment 3D preview area with non-blocking fallback when no server-generated derivative/thumbnail exists.
- Drawing governance compact icon-free actions: `開啟圖料追溯`, `檢查 MA 影響文件`, `進版`, and `送審`. `申請新圖號` is intentionally not shown in the drawing detail governance area. The generic `送審 -> /upload` target is superseded by `DEV-PDM-DRAWING-SUBMISSION-001` for drawing-source review-only submission.
- Drawing revision workbench redesign: focused development spec exists at `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`. Implemented on 2026-06-30 with official drawing resolver, context summary, FFF outcome preview, confirmed-impact replacement branch, and human-readable error mapping.

Verification evidence is recorded in `.ai-doc/dev_task.md`: `tsc`, `lint`, `build`, focused `/upload` browser smoke, multi-file conflict warning smoke, drawing attachment preview fallback smoke, and compact governance action screenshot.

Implemented focused slice:

- `DEV-PDM-UI-POLISH-001A`: Drawing revision workbench. Required docs are `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md` and `.ai-doc/qa/qa-pdm-drawing-revision-workbench-validation-plan-2026-06-30.md`. State: implemented / verification passed. Evidence is recorded in `.ai-doc/dev_task.md`.

### DEV-SUPABASE-DB-001

Status: Staging GATE-B passed for `AI_PDM_STAGING`; production/cutover remains deferred.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`
3. `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`
4. `.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md`
5. `.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md`
6. `.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md`
7. `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`
8. `.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md`
9. `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`
10. `supabase/README.md`
11. `supabase/migrations/manifest.json`

### DEV-PDM-LIFECYCLE-ACTIONS-001

Status: Implemented local/staging package; local commit `21bcf16`; Logical Archive / Protected Evidence. Production and Supabase production cutover excluded.

Read only if debugging or extending lifecycle actions:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
3. `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md`
4. `.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md`
5. `.ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md`
6. `.ai-doc/reports/pm/pdm-lifecycle-actions-phase-1-git-boundary-handoff-2026-06-29.md`
7. `src/app/api/lifecycle/controlled-history/route.ts`
8. `src/components/dashboard.tsx`
9. `scripts/qc-pdm-lifecycle-release-readiness.mjs`
10. `scripts/qc-pdm-lifecycle-controlled-history-ui.mjs`
11. `output/playwright/pdm-lifecycle-controlled-history-desktop.png`
12. `output/playwright/pdm-lifecycle-controlled-history-mobile.png`

QC contract phrase: production and Supabase production cutover excluded.

### DEV-PDM-CHANGE-CONTROL-001

Status: Phase 1-5 local implementation captured; production/Supabase migration remains approval-gated.

Read only if changing revision/part/BOM impact control:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`
3. `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
4. `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`
5. `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`
6. `scripts/qc-pdm-change-control.mjs`
7. `.ai-doc/reports/qc/qc-pdm-change-control-phase-1-report-2026-06-24.md`
8. `.ai-doc/reports/qc/qc-pdm-change-control-phase-2-report-2026-06-24.md`
9. `.ai-doc/reports/qc/qc-pdm-change-control-phase-3-report-2026-06-24.md`
10. `.ai-doc/reports/qc/qc-pdm-change-control-phase-4-5-report-2026-06-24.md`

## 4. Completed / Protected Packages

### Implemented SW License / PDM Company Package

`DEV-SW-LICENSE-PDM-001` is implemented and committed. It remains indexed here because `scripts/qc-sw-license-pdm-git-boundary.mjs` checks this map.

Read:

1. `.ai-doc/reports/pm/pm-sw-license-pdm-company-operational-shared-development-plan-2026-06-18.md`
2. `.ai-doc/specs/SPEC-SW-LICENSE-PDM-001-operational-shared-company-scope.md`
3. `.ai-doc/decisions/ADR-SW-LICENSE-PDM-001-operational-shared.md`
4. `.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md`
5. `.ai-doc/dev_task.md`
6. `scripts/qc-sw-license-pdm-git-boundary.mjs`

Commit boundary: Supabase staging evidence `be333eb`; SW/PDM company boundary `6f4dbab`.

### Revision Policy Package

`DEV-PDM-REVISION-001` is closed on branch `codex/pdm-revision-policy` with commits `8f472d0` and `af08d81`.

`DEV-PDM-REVISION-POLICY-002` / `DEV-050` is the active locally implemented package for lifecycle-aware revision release gating and server-created suggested revision snapshots. It does not repeal out-of-order controlled revision history, but it blocks minor revisions from becoming production-effective `Released`. Phase 1 does not add an independent policy decision table and does not open `ConditionalUse` / `TrialApproved`.

`DEV-PDM-REVISION-TIMING-UX-001` / `DEV-051` is the completed legacy reservation baseline with QA/QC evidence. It moved revision awareness earlier without moving formal revision authority into reservations: raw `v{rowVersion}` was removed and the drawer used a server-derived preview with formal revision editing in `/numbering/revisions`. For lifecycle-V2 candidate first revisions, the later `DEV-052` authority and `DEV-057` single-workspace UI intentionally replace that visible preparation path: candidate editing is inline in `DrawingWorkspaceDrawer` while formal revision authority remains unchanged. Resolve and submission context still use the same `DEV-050` suggestion lane. Historical evidence remains under `output/playwright/dev051-reservation-revision-timing-ux/`; merge, deploy and release remain separate gates.

Read:

1. `.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`
2. `.ai-doc/qa/qa-pdm-revision-policy-release-gate-validation-plan-2026-07-17.md`
3. `.ai-doc/specs/SPEC-PDM-REVISION-TIMING-UX-001-reservation-first-drawing-revision-entry.md`
4. `.ai-doc/qa/qa-pdm-revision-timing-ux-validation-plan-2026-07-18.md`
5. `.ai-doc/qa/qa-pdm-revision-manual-validation-plan-2026-06-22.md`
6. `.ai-doc/dev_task.md`

### Storage Cost-Control Package

`DEV-STORAGE-COST-001` is parked / product rollout backlog. It must not be treated as part of the historical `DEV-SUPABASE-DB-001` completion. Current product authority for file storage direction is `DEV-046` / `ADR-PDM-ERP-PLATFORM-002`: Cloud SQL PostgreSQL metadata/transactions + Google Cloud Storage binary authority in Taiwan, with Shared Drive limited to approved delivery/collaboration. `DEV-PDM-FILE-STORAGE-001` is retained as historical adapter and migration-safety evidence.

Read:

1. `.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md`
2. `.ai-doc/dev_task.md`

## 5. Protected Evidence

The following evidence is not physically archived in this pass because current scripts, package commands, or active docs reference hardcoded paths. Treat these as Logical Archive / Protected Evidence.

| Evidence group | Protected reason |
|---|---|
| `.ai-doc/dev_task.md` Supabase gate text | `qc:supabase-*` scripts read exact gate state, paths, and tokens. |
| `.ai-doc/documentation_map.md` lifecycle and SW/PDM package text | `qc:pdm-lifecycle-release-readiness` and `qc:sw-license-pdm-git-boundary` read exact paths and phrases. |
| `.ai-doc/reports/pm/pdm-lifecycle-actions-phase-1-git-boundary-handoff-2026-06-29.md` | `qc:pdm-lifecycle-actions-git-boundary` expects the handoff path and candidate group. |
| Lifecycle ADR/SPEC/QA/QC files | Release-readiness and boundary QC scripts check original paths. |
| Supabase QA/QC/runbook/report files | Runtime gate, smoke, receipt, local-readiness, rollback, and staging-validation QC scripts check original paths. |
| SW License / PDM company PM/SPEC/ADR/handoff files | SW/PDM git-boundary QC checks original paths and closure evidence. |
| Output screenshots under `output/playwright/` | Lifecycle UI QC and release-readiness evidence reference these paths. |

## 6. Archive Index

Use `.ai-doc/archived/completed-dev-index-2026-06.md` for completed DEV/Gate IDs, status, evidence, original/current path, and archive/protected reason.

Use `.ai-doc/archived/README.md` for archive policy:

- Unfinished tasks remain in `.ai-doc/dev_task.md`.
- Completed tasks can be summarized and indexed.
- Protected evidence stays at original path until QC scripts are updated.
- Historical snapshots are kept to avoid evidence loss when the active board is shortened.

## 7. Legacy Path Policy

The former `docs/` project-documentation tree was migrated into `.ai-doc` on 2026-06-09. Do not create new PM-dev project files under `docs/`.
