# AI_PDM Documentation Map

This project uses `.ai-doc` as the single project documentation center. Cold start rule: read this file first, then `.ai-doc/dev_task.md`, then only the package docs for the selected task.

## 1. Authoritative Entry Points

| Need | Read |
|---|---|
| Current task, blockers, next executable work | `.ai-doc/dev_task.md` |
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
- Local pre-deploy development is closed from the current `dev_task.md` completion-audit perspective; production readiness remains false until `DEV-032` release gate and external blockers are satisfied.
- The package entries below are current implementation context, protected evidence, or read-order guidance. They must not override `dev_task.md` status symbols, stop conditions, release gate wording, or external-evidence blockers.
- Documentation-only governance work remains allowed when scoped to `.ai-doc/dev_task.md`, `.ai-doc/documentation_map.md`, `.ai-doc/archived/`, or the current PM audit report.

Implemented / protected context:

- `DEV-PDM-ERP-MODULE-FOUNDATION-001` / `DEV-044`: Phase 1-3 local implementation and QC passed on 2026-07-12. Server-derived actor/company command boundaries protect selected numbering/draft mutations; command receipts and transactional outbox are additive across SQLite/PostgreSQL/Supabase with RLS/default-deny; provider-neutral principal/organization mappings preserve PDM IDs and carry platform IDs in evidence; guarded collision tooling passed against a copied local database with 5 users, 2 companies and zero collisions. Target governance is Supabase Auth plus `Person/Identity/Organization/Membership/RoleAssignment`, Admin/Approver MFA and central suspension/session revocation. This is not a provider cutover or production release. ProJED was not modified. Read ADR-001, ADR-002, the SPEC, QA plan, RD report and QC report in Section 1.

- `DEV-PDM-APPROVAL-PLATFORM-001`: Phase 1A-1B local implementation, Phase 1C-A reviewer entrypoint consolidation, Phase 1C-B legacy reviewer page convergence and Phase 1C-C drawing object pending-review projection complete; transitional adapters, friendly-route delegation and guarded migration dry-run/apply tooling present; release/live migration not authorized. 2026-07-08 architecture decisions: launch timing is not urgent, stability is preferred, and full-system approval platformization should be done before launch. ADR 002 selected additive `approval_platform_*` v2 tables. Local implementation added platform schema, repository/service, `/api/approvals/*`, `/approvals`, legacy adapters including drawing revision impact reviews, friendly decision routes delegating through the platform facade, focused QC, guarded migration dry-run/apply self-test, build and browser evidence. Phase 1C-A makes `審核工作台` the single primary reviewer approval sidebar entry, adds a reviewer-role/company-scoped pending badge, and exposes status/domain/action filters with URL query deep links; Phase 1C-B redirects `/numbering/approvals`, `/bom/reviews` and `/numbering/change-reviews` into equivalent workbench filter states with compatibility messages; Phase 1C-C projects pending drawing revision impact reviews onto the affected drawing number, drawing detail and attachment revision/history rows as compact read-only cues with reviewer deep links. 2026-07-09 system drawer, numbering and lifecycle QC governance was aligned so `/numbering/approvals` and `/bom/reviews` are verified as legacy redirects into canonical `/approvals`, not as stale independent reviewer pages. Production deploy/cutover, Supabase live migration, direct data repair/deletion, merge, PR, rollback and release artifacts are not authorized. Read `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`, `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-001-shared-core-domain-handlers.md`, `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-002-v2-platform-tables.md` and `.ai-doc/qa/qa-pdm-approval-platform-validation-plan-2026-07-08.md`.

- `DEV-PDM-NUMBERING-004`: Implemented / local verification passed for Phase 1-3; release not authorized. Object-context root/drawing/part entrances now support adding `M02/R01`, adding `P02`, requesting obsolete for root/drawing/part, root obsolete impact preview plus aggregate approval package, and `/numbering/request` `既有主根號追加` fallback. APP feedback follow-up also adds draft-only `刪除草稿`, cancellable add drawing/part dialogs, `新增相關資料` wording instead of `接續操作`, and root-owned part naming with no editable 料號/圖號 level 品名 in add flows. Verified with `tsc`, lint, build, focused QC 44/44, isolated API smoke 10/10 and browser screenshots. Production deploy, Supabase live cutover, provider pointer change, direct data repair/deletion, merge, PR, rollback and release artifacts remain not authorized. Read `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`, `.ai-doc/qa/qa-pdm-numbering-004-contextual-entrypoints-validation-plan-2026-07-08.md` and `.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`.

- `DEV-PDM-ENTITY-DETAIL-DRAWER-001`: Implemented locally for Phase 1A / release not authorized. Captures APP feedback that the same drawing or part opened from different entry pages must not show different object truth or different first-screen information density. `/numbering/search`, `/numbering/drawings` and `/parts` remain separate task entry pages, but right-side drawers now share the object-detail rule: root click opens root detail, drawing click opens drawing detail, part click opens part detail. `/numbering/search` adds target-aware drawing/part/root core sections; drawing/part targets use owner-style first-screen actions and do not show root aggregate metrics, full-root lists, relation maintenance, warnings/impact/audit sections. `/numbering/drawings` and `/parts` publish the same entity metadata for QC. Source context may change focus/highlight only. The adjacent system drawer QC false blocker for `/numbering/approvals` was resolved under approval platform governance and is no longer a DEV-039 blocker. Full shared shell extraction, optional read-only detail facade, production deploy, merge, PR, rollback and release artifacts are not authorized. Read `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md` and `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`.

- `DEV-PDM-ACCESS-CONTROL-001`: 已完成並通過本地驗證。2026-07-07 授權的鉦富先上線切片已落地：`/settings/workflow` 顯示唯讀「鉦富 Jenfu PDM」工作區且沒有公司選擇器；已建立製造、採購、外部專員角色；角色指派可設定適用範圍、指定範圍、內部負責人與 90 天複核日；外部專員預設只能查詢、看圖、留言與提供建議；畫面提供權限預覽與「異動紀錄」分頁；審核矩陣第一欄為唯讀「規則摘要」，用「情境 / 處理」使用者語言呈現，且畫面將情境與處理分行顯示，由觸發動作、條件、是否需要審核、標示方式與審核角色自動產生，不再讓管理員自由輸入規則名稱或手動設定使用/發行阻擋。一般審核規則由系統推導為工作中使用只標示風險、正式發行一律進 gate；硬性限制仍可禁止工作中使用。2026-07-10 `DEV-PDM-ACCOUNT-INVITATION-001` 補上無 Google 帳號邀請與首次密碼設定，`DEV-PDM-GOOGLE-IDENTITY-001` 再完成 `auth_identities`、Google 邀請式綁定與 provider-neutral lookup。本地完成不等於 live provider 已開放；完整帳號生命週期、完整路由旁路權限切換、未來久方工作區、Google Cloud credential、正式環境部署/遷移與 live Supabase migration 仍需後續 gate。讀 `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`。
- `DEV-PDM-NEXT-STEP-UX-001`: Implemented / verification passed locally for Phase 1 on 2026-07-04 after user `執行開發` authorization. Shared next-step state, status/error fallback, lifecycle next-step visibility, dashboard action failures, drawing revision blockers, DVT missing-item guidance, submission-detail error states, handoff missing-package guidance, empty/no-result states and master-attachment error/empty states now answer `那我現在要幹嘛` more directly. Verified with `tsc`, lint, status vocabulary QC, numbering search UI QC, DVT UI QC, report center UI QC, master attachments QC, drawing submission UI operation QC and local dev health. Build was blocked by the intentional local-dev guard because AI_PDM was listening on port 3000; no bypass was used. Read `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`: Implemented / verification passed locally for Phase 1, with Phase 1 contract and QA plan prepared and Phase 2+ RD Contract Ready. Local worktree changes cover `Cancelled` / release-recovery schema fields, same-revision blocker classification, Pending cancel support, release workflow wrapping, approve-flow integration, canonical workbench page/API, retry-release API, return-for-correction API, module CTA routing, submission-detail recovery UI, resolved ReleaseFailed dashboard/todo de-noising and async transaction boundaries. Verified evidence includes focused recovery QC, disposable mutation lifecycle QC, DB transaction provider QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke and D-0014 submission-detail browser smoke. The mutation gate used temporary local fixture records and did not mutate existing D-0014 or other user data. Phase 2+ preserves RD handoff contracts for master-data completion/writeback through owner APIs, drawing attachment upload, collaboration, dashboard/todo de-noising, and production cutover/historical repair gates. Production deploy, production migration, direct DB cleanup, historical repair and data deletion remain unapproved.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`: Implemented / verification passed locally on 2026-07-02 after user RD authorization. UI-level release-incomplete self-recovery now includes human-readable diagnosis, drawing-owned attachment organizer, released-filename preflight, explicit selected-attachment correction submission, formal-record lock state, submission-detail recovery link, focused QC and a UI-only operation validation gate covering route identity, retired upload, blocker wording, correction flow, permissions, detail states and RWD. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved.
- `DEV-PDM-STATUS-UX-001`: Implemented / verification passed locally on 2026-07-03. Phase 1 adds a central UI status dictionary, Chinese-only normal UI status display, status filter/badge/error mapping, development phase display mapping, shared status badge/header/help components and the required `?` help popover on user-visible status table columns. Verified with `npm run qc:pdm-status-ui-vocabulary` 44/44, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`, browser UI evidence on `/settings`, browser UI evidence on `/numbering/drawings` for `已發布 / 正式階段`, and `npm run dev:local:check`. Remaining Phase 2 hardening, DB enum/schema rename, production deploy, production migration, audit payload migration and historical data repair require explicit approval.
- `DEV-PDM-STATUS-UX-002`: Implemented / verification passed locally for Phase 1 on 2026-07-07 after user `執行開發` authorization. Status help is now task-specific across task/import/settings/report/DVT/restore contexts, approval wording uses `待補資料`, mixed master-data columns are labeled `狀態 / 階段 / 提醒`, and focused QC covers context mismatch risks. Verified with `tsc`, lint, status vocabulary QC 81/81, browser status-context checks 73/73, DVT fixture browser check 11/11, 390px task popover sanity 4/4 and local dev health. Phase 2 scanner hardening/checklist, DB/API/schema changes, production deploy, historical repair and audit raw-payload migration remain unapproved.
- `DEV-PDM-NUMBERING-002`: Implemented / verification passed locally for Phase 1-4 on 2026-07-07 after user RD authorization and explicit formal-cutover authorization. New normal records use compact v2 identities `00001`, `00001-P01`, `00001-M01`, `00001-R01`; root remains a reusable design-object root; normal drawing purpose is `M/R`; local/runtime master rows were converted from `0007/0014`, `P-0007-001/P-0014-001`, `D-0007-MA1/D-0014-MA1` to `00007/00014`, `00007-P01/00014-P01`, `00007-M01/00014-M01`; `numbering-rule-v1` is retired and `numbering-rule-v2` is active. Cutover backup is `data/backups/pdm-numbering-v2-cutover-20260707-052403/ai-pdm.sqlite`; cutover reports are under `output/qc-pdm-numbering-v2-cutover/` and `output/qc-pdm-numbering-v2-cutover-check/`. Historical evidence strings in audit/export/file/package evidence are intentionally retained. Verified with `tsc`, lint, build, formal cutover QC, v2 compact QC, numbering core/API/data/concurrency/draft lifecycle/UI regressions, change-control, master attachments, master workbench and Supabase runtime migration QC. External production/Supabase live cutover, direct data repair/deletion, project/order/equipment numbering and extra visible category codes remain unapproved.
- `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`: Implemented / verification passed locally for Phase 1-3 on 2026-07-07. Allocating numbering QC scripts are guarded from protected `data/ai-pdm.sqlite`, sequence/master/audit drift is detectable by an integrity gate, SQLite `createNumberingRecord` is covered by the async transaction boundary, and the authorized local repair retained drawing-module visible formal roots while purging local test sequence pollution. Duplicate submit prevention now blocks same-form re-entry in UI and returns an existing same company/user/payload create result within a 60-second server replay window before allocating a new root. After user critical review, V2 root allocation is gap-aware: use the lowest root absent from controlled `part_roots`; existing master rows remain occupied even if Draft/Obsolete; purged test roots absent from master rows are reusable. Repair backup is `data/backups/pdm-numbering-sequence-repair-20260707-160332/ai-pdm.sqlite`; current runtime occupied roots are `00007`, `00014`, `00056`, `00057`, `00058`, `00059`; computed lowest available root is `00001`; runtime integrity is `clean=true`. Verified with isolation QC 46/46, integrity QC 3/3, transaction QC 4/4, duplicate-submit guard 10/10, gap reuse QC 8/8, `tsc`, lint and numbering core 241/241. Phase 4 production/Supabase remains unapproved.
- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001`: Implemented / verification passed locally on 2026-07-03 after user RD authorization, with 2026-07-05 APP feedback, Phase 2 multi-file package implementation, Phase 3 out-of-order revision/latest-history implementation and Phase 4 first-class revision attachment package model applied. `/numbering/revisions` now includes the `新版圖面` step, selected/uploaded drawing-owned attachments for the intended revision, target-revision-only primary attachment selection, collapsed read-only previous/other-revision reference attachments, a dedicated controlled drawing-revision submission API, Pending submission creation, FFF assessment linkage through `drawing_revision_fff_assessments.submission_id`, selected-attachment revision validation, multi-file `版次檔案包` intake, extension-based role correction, warning-only package completeness, reviewer warning parity, next-revision suggestion with intentional override guidance, release lifecycle latest/history recomputation and duplicate same-revision formal blocking. Phase 4 adds stable `packageId`, package file membership, Released-core immutability, supplement request/approval by current reviewer/supervisor or Admin, approved supplement `補件` tagging in the main attachment list and migration dry-run reporting. Verified implementation evidence now exists for Phase 1-4. Production deploy, production migration/cutover, direct data repair, historical cleanup, CAD/OCR dependency, forced part/BOM revision, strict chronological approval and dedicated mobile-phone UI remain excluded. Phones use the desktop/default surface.
- Local dev entrypoint CAPA PA is implemented and hardened: use `npm run dev:local` for normal 3000 startup, `npm run dev:local:check` for non-browser health diagnosis, and `npm run dev:local:restart` only when the project-owned 3000 process is stale/unhealthy. The managed launcher performs multi-route HTTP health checks for `/`, `/login`, and `/api/auth/me`, writes launcher PID, port-owner PID, status JSON and logs to `tmp/local-dev/`, and `clean:next` / `prebuild` refuse to remove `.next` while the project-owned 3000 server is listening unless an explicit bypass is set. Guarded by `npm run qc:local-dev-entrypoint`.
- `DEV-PDM-SUBMISSION-CONFLICT-001`: Implemented / verification passed locally on 2026-07-02. Duplicate drawing + revision submission is classified as `submission_conflict`, blocked at readiness/submit/reviewer guard, shown with human Chinese recovery, audited through structured blocked-attempt payloads, and raw DB uniqueness errors are shielded from UI. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved.
- `DEV-PDM-DRAWING-PART-WORKBENCH-001`: Implemented / verification passed locally on 2026-07-01 after user RD authorization. Drawing module stays drawing-focused; 圖料/圖號 shortcuts route to a controlled drawing submission workbench; inline edits write through owner APIs and audit; ambiguous root/drawing/part relationships block submission; submission uses canonical immutable snapshot/hash; idempotency and failed-attempt audit are enforced; duplicate attachment filenames are blocked with Chinese domain errors; generic `/upload` and generic `POST /api/submissions` formal creation are retired. Production deploy, production migration, direct DB cleanup, data deletion and existing-data repair remain unapproved.
- Non-production executable-work audit: completed locally on 2026-06-30. Production/cutover remains excluded. No local or unclassified open task remains; only external-evidence blockers remain visible under `.ai-doc/dev_task.md` Section 3.
- `DEV-PDM-DRAWING-SUBMISSION-001`: Implemented / verification passed locally. User decision on 2026-06-30: drawing module completes master data; drawing-source `送審` is review-only and does not collect PDM master fields. Production deploy remains unapproved/out of scope.
- `DEV-PDM-UI-POLISH-001`: Implemented / verification passed on 2026-06-30. Upload UI simplification, multi-file SolidWorks-primary metadata, conflict warnings, SolidWorks preview fallback, compact drawing governance actions, and `DEV-PDM-UI-POLISH-001A` drawing revision workbench are complete. Continue only for user APP validation feedback or separately scoped enhancements.
- `DEV-PDM-UI-POLISH-001A`: Implemented / verification passed. Drawing revision workbench focused slice completed on 2026-06-30; continue only for user APP validation feedback or separately scoped enhancements.
- `DEV-PDM-SETTINGS-CENTER-001`: Implemented / verification passed locally on 2026-07-06 after user authorization. `/settings` now has a settings center overview/work queue, five management-area routes, server-only SolidWorks secret lifecycle APIs, additive secret metadata tables, redacted UI status and `local_test_double` evidence. Supabase Vault live writes/smoke, production deploy/cutover, direct data repair/deletion, external-cost actions, Manager/Reviewer read views and real SolidWorks/CAD-reader proof remain separately gated.
- `DEV-PDM-SHARED-3D-MA-BASELINE-001`: Implemented / verification passed locally on 2026-07-06 after user authorization. Part/root-owned shared 3D model versions, MA package model-basis API, MA release workflow gate, reviewed `2D-only / no 3D impact` exception, required-MA resolver, manufacturing baseline draft/release, immutable released baseline snapshot, part-detail UI slice, part-level 3D/intermediate attachment categories and additive SQLite/Postgres schema are implemented. Verified with `tsc`, lint, `qc:pdm-shared-3d-ma-baseline` 20/20, drawing revision package regression, change-control regression, DB/Supabase boundary gates and browser smoke screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`. Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule changes and production cutover remain separately gated.
- `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`: Implemented / verification passed locally for Phase 1 on 2026-07-06 after user authorization, then amended with real Windows Shell worker evidence and a SolidWorks Document Manager SLDDRW PNG worker path. PDM now has preview job and file-derivative metadata, fake local PNG worker, token-gated worker claim/complete contract, Windows Shell thumbnail worker, Document Manager sheet-preview exporter/worker, blank/low-information PNG quality gate, nested attachment preview APIs, derivative streaming under source attachment permission routes, no-store attachment list refresh and derivative-aware 3D/2D preview cards. Verified with `tsc`, lint, focused native-preview QC 90/90, redaction QC, master-attachments QC, local dev health, API worker smoke on `D-0007-MA1.SLDPRT` creating a real `windows_solidworks_preview_worker` derivative, Document Manager compile-only smoke, and browser smoke showing `.SLDDRW` fails cleanly with a compact missing-worker-key message instead of remaining queued. Full `.SLDDRW` success requires worker-readable Document Manager key via Supabase Vault live secret read or worker-local env var; full `.SLDASM` evidence, `.SLDDRW -> PDF`, interactive 3D, production rollout, historical backfill and direct data repair remain separately gated.
- `DEV-PDM-DRAWING-PART-RELATION-VIEW-001`: Implemented / verification passed locally on 2026-07-07 after user authorization for Phase 1-3. `/numbering/search` now defaults to root-grouped 圖料關係樹, includes matrix review, and exposes controlled relationship maintenance through `/api/numbering/relations` with permission, company/root, locked-status and audit gates. Verified with `tsc`, lint, build, `qc:pdm-numbering-search-ui` 30/30, `qc:pdm-master-workbench-layout` 205/205 and `qc:pdm-drawing-part-relation-view` 56/56. Screenshots are under `output/playwright/pdm-drawing-part-relation-view/`. Production deploy, Supabase live cutover, direct data repair/deletion, schema migration, generic bulk relationship API and release artifacts remain separately gated.
- Local PM document governance work: allowed when scoped to `.ai-doc/dev_task.md`, `.ai-doc/documentation_map.md`, and `.ai-doc/archived/`.

Not executable without explicit approval:

- `DEV-PDM-ERP-MODULE-FOUNDATION-001` / `DEV-044` release continuation only: Phase 1-3 is complete locally. Actual Supabase Auth configuration, MFA, central session revocation, staging/live migration and production cutover remain under a new IAM rollout DEV plus `DEV-030`/`DEV-031`/`DEV-032`. Phase 4 ERP shell/integration remains contract-only; ProJED requires a separate repository-owned DEV and is explicitly untouched.
- `DEV-PDM-PRODUCTION-SLICE-001`: Phase 1 local product slice implemented and verified; release gate required for production execution. This captures the user's 2026-07-09 decision to launch only the Web `正式領號 / 草稿 production slice`, not full PDM production readiness, plus RD supervisor follow-up `1B 2C 3A`: include `/numbering/part-drafts`, allow provisional part-number draft delete/recycle before controlled boundary, and use smoke company / tenant as the default smoke isolation path. Local implementation now includes central production-slice capability helpers, method-level API allowlist/default-deny, direct URL blocked state, sidebar roadmap `未開放` state, `/numbering/part-drafts` slice-mode inert actions, and direct API fail-closed for `submit-review`, `reconfirm` and `restore`. Delete/recycle reuses the existing controlled-boundary predicate; official root/drawing/part numbers remain controlled and non-recyclable. Production target readiness, deploy, provider pointer switch, rollback and production smoke remain in `DEV-032` release gate. Read `.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`, `.ai-doc/decisions/ADR-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch-boundary.md`, `.ai-doc/qa/qa-pdm-production-slice-numbering-draft-validation-plan-2026-07-09.md` and `.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`.
- `DEV-PDM-APPROVAL-PLATFORM-001`: Phase 1A-1B local implementation, Phase 1C-A reviewer entrypoint consolidation, Phase 1C-B legacy reviewer page convergence and Phase 1C-C drawing object pending-review projection complete; transitional adapters, friendly-route delegation and guarded migration dry-run/apply tooling present; release/live migration not authorized. Stop if work needs fragmented formal approval inboxes at launch, multiple primary reviewer approval sidebar entries, badge counts that ignore reviewer-role/company scope, one monolithic all-domain apply module, direct formal lifecycle mutation without platform audit, root obsolete without aggregate intent/impact preview, cost/supplement adapters as final launch-readiness state, production/Supabase live migration, provider pointer switch, direct data repair/deletion, merge, PR, rollback or release artifacts.
- `DEV-PDM-NUMBERING-004` Phase 4 release/live work: Phase 1-3 are implemented locally. Do not perform production deploy, Supabase live migration/cutover, provider pointer change, direct data repair/deletion, merge, PR, rollback or release artifacts without explicit release authorization.
- `DEV-PDM-ACCESS-CONTROL-001` 剩餘階段：本地上線切片與 `DEV-PDM-ACCOUNT-INVITATION-001` 無 Google 帳號邀請/首次密碼設定已完成並驗證；Google OAuth / 完整身分提供者、帳號停用/復權/密碼重設/session 撤銷、自動寄信 provider、完整路由盤點與旁路權限切換、未來久方工作區、正式環境遷移/部署、live Supabase migration、外部專員到期自動停權與平台級多公司管理台仍需另行授權。
- `DEV-PDM-ACCOUNT-INVITATION-001` / `DEV-042`: 本地完成 / release 未授權。Admin 可在 `/settings/account-invitations` 建立、查看、撤銷一次性邀請；受邀者在 `/invite/accept` 自行設定密碼。資料庫只存 token hash，清單不洩漏 token，接受/撤銷/到期/重複與非 Admin 路徑 fail closed，audit、provider-neutral identities 與 JENFU membership 已接上；managed login 不顯示 demo 帳密。邀請交付目前使用預填郵件或複製連結，不宣稱自動寄信。證據：`qc:pdm-account-invitations` 25/25、`qc:postgres-shadow` 26/26、`qc:supabase-runtime-migrations` 33/33、desktop/mobile screenshots。讀 `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`、`.ai-doc/qa/qa-pdm-account-invitation-validation-plan-2026-07-10.md`、`.ai-doc/qc/qc-pdm-account-invitation-report-2026-07-10.md`。
- `DEV-PDM-GOOGLE-IDENTITY-001` / `DEV-043`: 本地完成 / live provider 與 release 未執行。Google 初次綁定只能從有效 Admin 邀請進入，verified email 必須符合邀請；一般登入只依已綁定 Google `sub`，不做 email/domain 自動授權。OAuth 使用 server-side code flow、state、nonce、PKCE，token/secret 不落 DB/audit；`suspended` 等非 active 帳號會拒絕新登入與既有 session。未設定 credential 時 UI 保留停用按鈕與未開放提示。證據：`qc:pdm-google-identity` 19/19、`qc:pdm-account-invitations` 25/25、`qc:managed-auth` 21/21、migration QC、typecheck、lint、isolated build 與 desktop/mobile screenshots。讀 `.ai-doc/qa/qa-pdm-google-identity-validation-plan-2026-07-10.md`、`.ai-doc/qc/qc-pdm-google-identity-report-2026-07-10.md`。
- `DEV-PDM-SUBMISSION-GATE-001` / `DEV-005`: Phase 1 local implementation passed on 2026-07-10. It owns the research/technical-transfer mode split, rule resolver, direct single-item technical-transfer fail-closed guard, parent package/readiness/sign-off/release policy and Parent Phase 2/4 contracts. Its Phase 1 completion remains valid; future transfer-package product delivery is no longer hidden beneath this completed DEV.
- `DEV-PDM-TRANSFER-PACKAGE-INTAKE-001` / `DEV-041`: child technical-transfer delivery created by user decision `3A`. Phase 3A-0 is `RD Implementation Ready / Not Requested This Turn`; Phase 3A-1 is `RD Contract Ready / Not Requested This Turn`; Phase 3A-2 through 3C are `Need Human Decisions` for design-change effective-configuration and multi-top approval semantics. Confirmed rules: integer major version belongs to immutable package baseline; controlled items keep independent revisions; opening `/transfer-packages/new` writes nothing; explicit `建立技轉包` creates the persistent Draft and stable ID; Pack-and-Go intake preserves original ZIP/path/hash without falsely claiming openability; exact materialized configuration must pass real SolidWorks open verification before submit; humans own final classification; one package may govern multiple top assemblies; formal/top assemblies need controlled identity; incomplete/manual-preview BOM cannot baseline; owner modules remain canonical; shared approval and formal release stay separate. Read the child SPEC/QA, parent SPEC/ADR, BOM, approval, access-control and file-storage authorities before implementation.
- `DEV-PDM-NUMBERING-003`: Implemented / verification passed locally for Phase 1-3. New normal v3 creation uses `A0001-Z9999` alphanumeric roots and `A0001-P01`, `A0001-M01`, `A0001-R01`; root letters are capacity bands only; existing v1/v2 identities remain readable; v3 allocation reserves legacy numeric root ordinals and audit/control root evidence; `M` is category only and `R` cannot be manufacturing basis. Local/runtime master identities were converted from v2 numeric roots to v3 through scripted dry-run, backup, apply and independent check; historical audit/file/release evidence strings were retained. `I/O/Q` exclusion, production/Supabase migration, direct data repair/deletion outside the scripted local cutover boundary and release artifacts remain not authorized. Read `.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`, `.ai-doc/decisions/ADR-PDM-NUMBERING-003-alphanumeric-root-identity.md` and `.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`.
- `DEV-PDM-NUMBERING-SEQUENCE-CAPA-001` Phase 4 and any further data repair: Phase 1-3 local CAPA controls and the authorized local repair are implemented and verified. Production/Supabase rollout, visible formal-number renumbering, reset/reuse/backfill/voiding/deletion beyond the captured repair audit, merge, deploy, rollback and production smoke remain not executable without explicit human authorization. Runtime evidence is retained under `output/qc-pdm-numbering-sequence-integrity/` and `output/pdm-numbering-sequence-repair-runtime/`.
- `DEV-PDM-NEXT-STEP-UX-001` Phase 2+: regression scanner/checklist hardening and production release are not authorized. DB/API/permission/state-machine changes, production deploy, direct data repair, historical cleanup, admin/debug raw payload full localization and full platform navigation redesign are excluded unless separately approved.
- `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`: Prepared / RD Implementation Ready for Phase 1 documentation only. It captures the D-0014-MA1 mismatch where submission release state is `Released` while drawing/part/root master statuses remain `Draft`. Phase 1 requires release-time master lifecycle sync in the same DB transaction as submission `Released`, audit and visible inconsistency guard. Phase 2 historical scanner/Admin repair and Phase 3 production cutover are documented but not authorized. No historical D-0014 repair, production migration, direct DB mutation or data deletion is authorized.
- `DEV-PDM-FILE-STORAGE-001`: Implemented / local QC passed; production cutover not authorized. Supabase Postgres + Supabase Storage are the target PDM core authority; local implementation now has provider/bucket/key storage pointers, provider-aware submission/release/master attachment/preview reads, Supabase fail-closed runtime config, local fallback, local-provider-only legacy Drive release movement, Drive backup plan/execution helpers, version/hash folder isolation, no first-version delete/overwrite behavior, manifest templates, non-secret `.metadata.json` sidecars, restore index and drift report templates. Supabase bucket creation, provider pointer switch, one-time migration execution, live Google Drive backup writes, retention cleanup/deletion, production deploy/cutover, direct data repair/deletion, public PDM source bucket, service-role/S3 secret exposure, secret-bearing metadata snapshot, Drive reverse sync, backup-as-release-blocker, merge, PR, rollback and release artifacts are not authorized. Read `.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`, `.ai-doc/decisions/ADR-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`, `.ai-doc/qa/qa-pdm-file-storage-supabase-core-drive-backup-validation-plan-2026-07-08.md` and `.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`.
- `DEV-SUPABASE-DB-001-DATA-PARITY`: prepared but blocked; requires parity tier, target, data scope, cleanup owner, and credential boundary.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P`: Phase 2+ RD Contract Ready only and rechecked under the latest `dev-pm` All-Phase Gate. Phase 2 requires Phase 1 implemented/verified and explicit authorization; Phase 3 requires Phase 2 implemented/verified and explicit authorization; Phase 4 requires production release-gate approval. Continuation commands must not start Phase 2+ unless `.ai-doc/dev_task.md` is explicitly updated.
- `DEV-SUPABASE-DB-001-PROD-GATE`: deferred; production/cutover remains unapproved and deferred.
- First-version launch evidence split: `DEV-IND-007` is complete for the disposable local Postgres/Supabase-shadow boundary; `DEV-FIELD-001` remains the only first-version external field-test blocker; `DEV-CAD-001`, `DEV-SW-001`, and `DEV-BACKUP-001` are deferred full-PDM scopes, not blockers for Web official numbering / draft production slice. Current readiness evidence is `npm run qc:production-readiness -- --allow-open`, which intentionally reports `ready=false` until the field-test proof and release-gate evidence exist.
- `DEV-STORAGE-COST-001`: product rollout backlog / parked scope; requires real storage inventory, target, cost, retention policy, and production timing approval.
- Any production deployment, Supabase production cutover, schema migration, direct DB mutation, data deletion, provider pointer switch, or cost-incurring external action.

## 3. Active Package Read Order

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
- Phase 3 target decisions do not authorize Supabase Auth, MFA or session-revocation production rollout.
- Phase 4 cannot modify ProJED; any ProJED consumption requires a separate ProJED-owned task.
- Production, migration, domain routing, rollback and smoke remain release-gated.

Stop if:

- RD needs to change login provider or current user-facing auth in Phase 1.
- RD needs to rewrite stable PDM user/company/object IDs or audit history.
- RD needs browser-authoritative state, browser service-role access or direct cross-module table writes.
- RD needs any ProJED change.
- RD needs live schema/data migration, production, merge, PR, deploy, rollback or release artifacts.

### DEV-PDM-PRODUCTION-SLICE-001

Status: Phase 1 local product slice implemented and verified; release gate required for production execution. This package defines the narrow internal launch slice: Web official numbering plus `/numbering/part-drafts` draft workbench. It keeps future roadmap UI visible, but unopened features must be UI-marked as `未開放`, direct URLs must render blocked states, and method-level server-side feature gates must fail closed. It does not claim full PDM production readiness.

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
- RD supervisor follow-up `1B`: `/numbering/part-drafts` is part of the first slice.
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
- Phase 1B full shared shell extraction remains deferred until APP feedback or duplication risk justifies it.
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

Status: Implemented / local QC passed; production cutover not authorized. It captures the user's 2026-07-08 decisions `1B 2A 3A` and RD supervisor follow-up `1C 2A 3B`: Supabase Postgres + Supabase Storage are the target single PDM core authority; existing local / legacy Drive files must be migrated once and verified before cutover; Google Drive is demoted to an async non-authoritative backup mirror with Windows/File Explorer-compatible folder isolation, tiered coverage, no first-version auto delete/overwrite and non-secret metadata snapshots. Local implementation includes provider/bucket/key storage pointers, provider-aware file and release package reads, fail-closed Supabase runtime config, local fallback, local-only legacy Drive release movement, Drive backup helpers, manifest templates, metadata sidecars, restore index and drift report templates.

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

- `1B`: Supabase Postgres and Supabase Storage become the PDM core authority.
- `2A`: Existing local / legacy Google Drive files are migrated in one controlled migration before cutover; no long-term dual-primary.
- `3A`: Google Drive is async best-effort backup only, using version/type folders and manifest/hash evidence to avoid same-folder same-filename conflicts.
- RD supervisor `1C`: Drive backup uses tiered coverage: released files/packages are required and permanent in the first version, draft/in-review/master files are selective, generated preview derivatives are not backed up by default.
- RD supervisor `2A`: First-version Drive backup does not automatically delete or overwrite backed-up file blobs.
- RD supervisor `3B`: Drive backup includes non-secret metadata snapshots as restore aids only; snapshots are not PDM authority.

Authorization boundary:

- Local RD implementation and local QC are complete.
- Supabase bucket creation, RLS policy changes, provider pointer switch, one-time migration execution, Google Drive live backup worker/external writes, real restore drill, retention cleanup/deletion, production deploy/cutover, direct data repair/deletion, merge, PR, rollback and release artifacts require explicit separate authorization.
- `DEV-STORAGE-COST-001` remains cost-control / alternate-provider background; it does not override this Supabase-core architecture.

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
9. Implementation surfaces: `src/components/numbering-contextual-entrypoints.tsx`, `src/app/numbering/search/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/parts/page.tsx`, `src/app/numbering/request/page.tsx`, `src/app/api/numbering/roots/[rootCode]/*`, `src/app/api/lifecycle/obsolete-requests/route.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/lib/numbering-async.ts`, `src/lib/numbering-permission-codes.ts`, `db/schema.sql`, and `scripts/qc-pdm-numbering-contextual-entrypoints.mjs`.

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

Status: Phase 1 local implementation passed on 2026-07-10. Parent Phase 2 and Phase 4 are RD Contract Ready / Not Requested This Turn. Technical-transfer Phase 3 implementation is delegated to child `DEV-041`: Phase 3A-0 RD Implementation Ready / Not Requested This Turn; Phase 3A-1 RD Contract Ready / Not Requested This Turn; Phase 3A-2 through 3C Need Human Decisions. Release Gate Required for production work.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
3. `.ai-doc/decisions/ADR-PDM-SUBMISSION-GATE-001-transfer-package-and-exception-policy.md`
4. `.ai-doc/qa/qa-pdm-submission-gate-research-transfer-package-validation-plan-2026-07-07.md`
5. `.ai-doc/qc/qc-pdm-submission-gate-phase1-report-2026-07-10.md`
6. Phase 3A transfer intake spec: `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
7. Phase 3A QA plan: `.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`
8. Existing drawing submission authority: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
9. Existing workbench authority: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
10. Existing relation view context: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
11. Existing release lifecycle authority: `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`
12. Phase 1 implemented surfaces: `src/lib/submission-gate.ts`, `src/app/upload/page.tsx`, `src/app/api/submission-rules/active/route.ts`, `src/app/api/submission-readiness/resolve/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`, `src/app/transfer-packages/new/page.tsx`, `scripts/qc-pdm-submission-gate-phase1.mjs`, `package.json`.

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

Authorization boundary:

- Phase 1 local product slice is implemented and QC-passed.
- `DEV-041` Phase 3A-0 is implementation-ready but was not requested for product implementation in this turn; it must not auto-start.
- `DEV-041` Phase 3A-1 is contract-ready. Phase 3A-2 through 3C require Q3/Q4 plus prior child-phase evidence before contract/readiness completion.
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

Status: `DEV-041` Phase 3A-0 RD Implementation Ready / Not Requested This Turn; Phase 3A-1 RD Contract Ready / Not Requested This Turn; Phase 3A-2 to 3C Need Human Decisions for design-change effective-configuration and multi-top approval semantics.

Read:

1. `.ai-doc/dev_task.md` entry `DEV-041`
2. `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`
3. `.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`
4. `.ai-doc/specs/SPEC-PDM-SUBMISSION-GATE-001-research-transfer-package-readiness.md`
5. `.ai-doc/decisions/ADR-PDM-SUBMISSION-GATE-001-transfer-package-and-exception-policy.md`
6. `.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md`
7. `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`
8. `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`
9. `.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`

Execution boundary:

- The next requestable product slice is Phase 3A-0 only: explicit persistent Draft creation, stable package ID, shared workbench shell, scope, adapters, blockers and return context.
- ZIP parser, mapping/BOM/baseline, readiness and review/sign-off remain later child phases with explicit entry evidence.
- Package baseline integer never synchronizes item revisions; incomplete manual/file-preview BOM never passes baseline.
- Formal submit requires real-machine SolidWorks open/missing-reference evidence for the exact materialized candidate configuration, without requiring an Add-in.
- One package may govern multiple explicitly selected top assemblies. Phase 3A-2 to 3C cannot become implementation-ready until delta inheritance and atomic/partial multi-top approval are confirmed.
- No product code, schema migration, production data, provider change, SolidWorks integration or release work was performed by the document-completeness review.

Stop if:

- GET/open must create a package, owner logic must be duplicated, company/RLS boundary cannot be enforced, parser cannot stream/fail closed, a formal/top assembly can baseline without controlled identity, or transfer approval would directly release a master.

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
9. Implemented surfaces: `src/lib/numbering-identity.ts`, `db/schema.sql`, `db/postgres/001_initial_schema.sql`, `db/postgres/004_numbering_v2_compact_identity.sql`, `supabase/migrations/20260707000000_numbering_v2_compact_identity.sql`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/app/api/numbering/records/route.ts`, `src/app/api/numbering/drawings/route.ts`, `src/app/numbering/request/page.tsx`, `src/app/numbering/search/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/impact/page.tsx`, downstream submission/shared-3D/baseline helpers, import/export scripts, numbering QC scripts, `scripts/pdm-numbering-v2-cutover.mjs`, `scripts/qc-pdm-numbering-v2-formal-cutover.mjs`, `output/qc-pdm-numbering-v2-cutover/report.md` and `output/qc-pdm-numbering-v2-cutover-check/report.md`.

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
8. Implemented surfaces: `scripts/numbering-qc-runtime-guard.mjs`, `scripts/pdm-numbering-sequence-repair-runtime.mjs`, `scripts/qc-pdm-numbering-qc-isolation.mjs`, `scripts/qc-pdm-numbering-sequence-integrity.mjs`, `scripts/qc-pdm-numbering-sequence-transaction.mjs`, `scripts/qc-pdm-numbering-duplicate-submit-guard.mjs`, `scripts/qc-pdm-numbering-gap-reuse.mjs`, `src/app/numbering/request/page.tsx`, `src/lib/db-async-provider.ts`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`
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

Status: Implemented / verification passed locally for Phase 1. Windows Shell `.SLDPRT` evidence is captured; full `.SLDASM` / `.SLDDRW` native readiness, Phase 2 PDF, interactive 3D and production rollout remain gated.

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

Status: Implemented / verification passed locally for Phase 1. Supabase Vault live writes/smoke and production release remain gated.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`
3. `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`
4. `.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`
5. Existing and new settings implementation: `src/app/settings/page.tsx`, `src/app/settings/integrations/page.tsx`, `src/app/settings/security/page.tsx`, `src/app/settings/workflow/page.tsx`, `src/app/settings/system/page.tsx`, `src/app/api/settings/route.ts`, `src/app/api/settings/secrets/`, `src/lib/settings-secret-lifecycle.ts`, `src/lib/repositories/settings-secret-async-repository.ts`, `src/lib/system-settings-async.ts`, `src/lib/repositories/system-settings-async-repository.ts`
6. Supabase runtime context: `.ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md`, `.ai-doc/decisions/ADR-SUPABASE-DB-001-runtime-provider-and-target.md`, `.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md`
7. CAD blocker context: `DEV-CAD-001` external evidence row in `.ai-doc/dev_task.md`

Human decisions:

- `/settings` becomes a settings center work queue with five management areas.
- Supabase Vault stores secret material; Supabase DB stores metadata only.
- PDM backend APIs operate Vault; browser/frontend never accesses Vault directly.
- Google Workspace is account/Drive source; PDM remains role and approval authority.
- High-risk settings require draft, test and Admin activation.
- Visibility is classified by setting type; Manager/Reviewer can see selected redacted status only.
- First implementation slice is SolidWorks secret lifecycle.

Target behavior:

- Admin can enter a SolidWorks/CAD-reader secret once and only see masked/fingerprint status afterward.
- Backend writes secret material to Supabase Vault and keeps only metadata, status and test evidence references in PDM DB.
- Failed or untested drafts cannot be activated.
- `/settings` overview tells Admin what to do next for missing, test-failed, pending-activation and healthy settings.
- Existing Google Drive settings remain operational until deliberately migrated.

Authorization boundary:

- Phase 1 local RD implementation is complete using `local_test_double` plus live-gate blocker.
- Supabase Vault live write/smoke, production deploy/migration, direct data repair/deletion, external-cost actions, real SolidWorks/CAD-reader proof and Manager/Reviewer read views remain separately gated.
- Stop if RD needs plaintext secret storage, frontend Vault access, Data API Vault access or Google Workspace direct PDM role authority.

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
6. Likely Phase 1 surfaces: `src/components/dashboard.tsx`, `src/lib/status-display.ts`, `src/components/next-step-state.tsx`, `src/components/lifecycle-ux.tsx`, `src/app/numbering/revisions/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/submissions/[id]/page.tsx`, `src/app/handoff/page.tsx`, `src/app/numbering/search/page.tsx`, `src/app/parts/page.tsx`, `src/components/master-attachment-panel.tsx`, `src/app/numbering/part-drafts/page.tsx`, `src/app/numbering/reports/page.tsx`.

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
5. Implemented surfaces include: `src/lib/status-display.ts`, `src/components/status-help-popover.tsx`, `src/components/lifecycle-ux.tsx`, `src/components/dashboard.tsx`, `src/components/dashboard/layout-parts.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/search/page.tsx`, `src/app/parts/page.tsx`, `src/app/submissions/[id]/page.tsx`, `src/app/upload/page.tsx`, `src/app/bom/workbench/page.tsx`, `src/app/numbering/tasks/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/numbering/approvals/page.tsx`, `src/app/numbering/impact/page.tsx`, `src/app/numbering/reports/page.tsx`, `src/app/numbering/imports/page.tsx`, `src/app/numbering/part-drafts/page.tsx`, `src/app/settings/page.tsx`, `scripts/qc-pdm-status-ui-vocabulary.mjs`, `package.json`.

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
5. Implemented surfaces: `src/lib/status-display.ts`, `src/components/status-help-popover.tsx`, `src/app/numbering/tasks/page.tsx`, `src/app/numbering/imports/page.tsx`, `src/app/settings/page.tsx`, `src/app/numbering/reports/page.tsx`, `src/app/numbering/approvals/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/bom/workbench/page.tsx`, `src/app/numbering/part-drafts/page.tsx`, `src/app/parts/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/search/page.tsx`, `scripts/qc-pdm-status-ui-vocabulary.mjs`.

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
- `npm run qc:production-readiness -- --allow-open`: passed with `ready=false`, `supabaseShadowEvidenceReady=true`, and one first-version `external_field_test` blocker visible.
- `npx tsc --noEmit`, `npm run lint -- --quiet`, and `npm run build`: passed.

Remaining first-version blocker is `DEV-FIELD-001` field-test evidence, plus release-gate execution before production deploy. `DEV-CAD-001`, `DEV-SW-001`, and `DEV-BACKUP-001` remain deferred full-PDM scopes; `DEV-IND-007` is complete for the disposable shadow gate.

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

Read:

1. `.ai-doc/qa/qa-pdm-revision-manual-validation-plan-2026-06-22.md`
2. `.ai-doc/dev_task.md`

### Storage Cost-Control Package

`DEV-STORAGE-COST-001` is parked / product rollout backlog. It must not be treated as part of `DEV-SUPABASE-DB-001` completion. Current product authority for file storage direction is `DEV-PDM-FILE-STORAGE-001`: Supabase Postgres + Supabase Storage core, with Google Drive as backup mirror only.

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
