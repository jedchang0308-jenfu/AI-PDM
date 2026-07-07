# AI PDM dev_task PM Control Board

Updated: 2026-07-06
Owner: Dev PM
Purpose: This file is the active DEV control board. Unfinished work stays here; completed work is summarized here and indexed in `.ai-doc/archived/completed-dev-index-2026-06.md`.

Historical snapshots:

- `.ai-doc/archived/dev_task_legacy_before_pm_cleanup_2026-06-16.md`
- `.ai-doc/archived/dev_task_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/documentation_map_before_pm_governance_restructure_2026-06-30.md`

## 1. PM Snapshot

Current active objective: `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` is the latest local delivery package. Phase 1 controlled revision package, Phase 2 multi-file package intake, Phase 3 out-of-order revision/latest-history behavior and Phase 4 first-class revision attachment package model are implemented and locally verified. Phase 4 implements stable `packageId`, package file membership, Released-core immutability, supplement request/approval child records, supplement approval by the current system reviewer/supervisor or Admin, approved supplement `補件` marking in the same main attachment list, and IDE/Codex dry-run reporting for ambiguous legacy migration records instead of a product pending area. The current product rule is: upload/attachment alone is not a formal revision; formal revision requires the controlled submission/review/release package; revisions can be entered and approved in any order; duplicate formal same drawing + same revision is blocked; the computed latest is shown first and older formal revisions belong in history. Production deploy, production migration/cutover, direct data repair, historical cleanup, FFF/part/BOM rule changes, strict chronological approval and dedicated mobile-phone UI remain excluded.

New implemented local package:

- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` Phase 1 is implemented / verification passed locally after the user's 2026-07-03 authorization to execute development, with 2026-07-05 APP feedback applied. `/numbering/revisions` now has a `新版圖面` step, drawing-owned attachment upload/selection for the intended revision, target-revision-only primary attachment selection, collapsed read-only previous/other-revision reference attachments, a dedicated controlled drawing-revision submission API, Pending submission creation, FFF assessment linkage through `drawing_revision_fff_assessments.submission_id`, and a safe compensation path that cancels the Pending submission if FFF creation fails. No-impact drawing revisions may keep part and BOM unchanged with reviewer BOM no-revision confirmation.
- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2` is implemented / verification passed locally after the user's 2026-07-05 `執行開發` authorization. `/numbering/revisions` now treats one target revision as a multi-file `版次檔案包`, accepts multiple queued files, auto-classifies file roles by extension, lets the submitter correct each role, stores package roles/warnings in the submission snapshot, shows warning-only package completeness guidance to the submitter, and surfaces the same warning codes on the full submission detail page and dashboard drawer before approval/rejection. No schema migration, production deploy, direct data repair, CAD/OCR extraction, FFF rule change, forced part/BOM revision, or optional-warning hard block was performed.
- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3` is implemented / verification passed locally after the user's 2026-07-05 `執行開發` authorization. The release flow now accepts out-of-order non-duplicate revisions, still blocks duplicate formal same drawing + revision records, recomputes latest/history by deterministic revision comparison, keeps lower backfilled revisions as formal history, promotes higher revisions to latest, and keeps first-level attachment/package views focused on the computed latest.
- `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4` is implemented / verification passed locally from the user's 2026-07-06 guided decisions and later RD execution authorization. It adds a first-class revision attachment package model with stable `packageId`, package files, Released-core immutability, supplement reason menu, supplement request/approval records, supplement approval by current reviewer/supervisor or Admin, approved supplement `補件` tagging in the main attachment list, multi-file supplement intake and migration dry-run reporting for ambiguous legacy records. Local schema/runtime files and SQLite bootstrap were updated; production deploy, production migration/cutover and existing-data repair were not performed.

New implemented local settings package:

- `DEV-PDM-SETTINGS-CENTER-001` Phase 1 is implemented / verification passed locally after the user's 2026-07-06 authorization. `/settings` now has a settings center overview/work queue, five management-area routes, and a SolidWorks Document Manager secret lifecycle panel. Server-only APIs support redacted status, draft creation, test, activation and revoke. Additive metadata tables `secret_references`, `setting_test_runs` and `setting_activation_events` store lifecycle metadata only; local execution uses a `local_test_double` provider and keeps Supabase Vault live write/smoke as an explicit blocker before production. Existing Google Drive settings remain operational. Production deploy/cutover, Supabase Vault live writes, direct data repair/deletion, external-cost actions and real SolidWorks/CAD-reader proof remain not authorized.

New completed local native preview package:

- `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001` Phase 1 local vertical slice is implemented / verification passed locally after the user's 2026-07-06 authorization, then amended with real Windows Shell worker evidence and a SolidWorks Document Manager SLDDRW PNG worker path. PDM now has additive `preview_jobs` and `file_derivatives` metadata, token-gated worker claim/complete routes, attachment preview enqueue/list APIs, derivative streaming under the source attachment permission path, a fake local PNG worker for deterministic local QC, a Windows `IShellItemImageFactory` worker for model thumbnails, a Document Manager sheet-preview exporter/worker for SLDDRW, blank/low-information PNG quality gating, no-store attachment list responses, and derivative-aware 3D/2D preview cards. Browser behavior is now: ready derivative tied to current source hash first, then PDF/image source, then Google Drive, then actionable placeholder. Verification passed with `tsc`, lint, focused native-preview QC, redaction QC, master-attachments QC, local dev health, API worker smoke on `D-0007-MA1` showing `.SLDPRT` succeeds with a real `windows_solidworks_preview_worker` derivative, and browser smoke showing `.SLDDRW` fails cleanly with a compact worker-key recovery message instead of remaining queued. Full `.SLDDRW` success still requires a worker-readable real Document Manager key via Supabase Vault live secret or worker environment variable; full `.SLDASM` readiness still requires equivalent worker evidence. Phase 2 `.SLDDRW -> PDF`, Phase 3 interactive 3D and Phase 4 production rollout remain not authorized.

New prepared development documents:

- `DEV-PDM-NUMBERING-002` is documented as `RD Implementation Ready / Not Authorized` for a compact Numbering Core V2. It amends the v1 `0001 / P-0001-001 / D-0001-MA1 / D-0001-OT1` scheme for new records to `00001 / 00001-P01 / 00001-M01 / 00001-R01`, keeps `00001` as a reusable design-object root rather than a project/order/equipment root, and requires v1/v2 compatibility through semantic manufacturing/reference helpers. No schema migration, product implementation, production migration, direct data rewrite or v1-to-v2 conversion is authorized by the documentation request.

Current completed local package state:

- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` is implemented / verification passed locally for Phase 1. It is based on the user's 2026-07-02 guided decisions and supersedes the broad `duplicate_active_submission` umbrella for same-revision conflicts with status-specific rules: `same_revision_in_progress`, `release_incomplete_conflict`, `released_revision_exists`, and `obsolete_revision_locked`. Local worktree changes cover submission schema/types/repositories, same-revision classification service, release workflow wrapper, approve route, Pending cancel route, canonical workbench page/API, retry-release API, return-for-correction API, module CTAs, submission-detail recovery UI, resolved ReleaseFailed dashboard/todo de-noising and async transaction boundaries used by return-for-correction. Verified gates include focused recovery QC, disposable mutation lifecycle QC, DB provider transaction QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke, and D-0014 submission-detail browser smoke. Phase 2+ is preserved as RD handoff contracts: master-data completion/writeback, drawing attachment upload, collaboration, dashboard/todo de-noising, and production cutover/historical repair gates. Production deploy, production migration, direct DB cleanup, historical repair and data deletion remain unapproved.
- `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` is documented as `RD Implementation Ready` for Phase 1 after the D-0014-MA1 mismatch was confirmed: `submissions.status = Released` while `drawing_numbers`, linked `part_numbers`, and `part_roots` remain `Draft`. The spec requires release-time master lifecycle synchronization inside the same DB transaction that marks a submission `Released`, plus audit and visible inconsistency guard. RD implementation is not authorized by the documentation request. Historical D-0014 repair, production migration, direct DB mutation and data deletion remain unapproved.
- Local dev entrypoint CAPA PA is implemented / verification passed for recurring broken 3000 prevention: `dev:local` uses the managed launcher, `dev:local:check` performs non-browser health diagnosis, `dev:local:restart` is the explicit stale-project-process recovery path, launcher/status files distinguish launcher PID from real port-owner PID, multi-route health checks cover `/`, `/login`, and `/api/auth/me`, and `clean:next` / `prebuild` refuse to remove `.next` while the project-owned 3000 server is listening unless an explicit bypass is set.
- `DEV-PDM-SUBMISSION-CONFLICT-001` is implemented / verification passed locally from the user's 2026-07-02 duplicate submission decision: `duplicate_active_submission` is a `submission_conflict`, not `master_data_missing`; duplicate drawing + revision submission is blocked, not warning-only; messages are human-readable Chinese; blocked duplicate attempts retain structured audit payload; reviewer approval is guarded against legacy duplicate active conflicts. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved.
- `DEV-PDM-DRAWING-PART-WORKBENCH-001` is implemented / verification passed locally from the user's 2026-07-01 architecture decisions and RD authorization: 圖號模組 remains drawing-focused, 圖料模組 routes into a controlled drawing submission workbench, generic `/upload` and generic `POST /api/submissions` formal creation are retired, inline master-data edits use owner APIs, ambiguous root/drawing/part relationships block submission, submission uses canonical immutable snapshot/hash, idempotency/attempt audit is enforced, and duplicate attachment filenames are blocked with Chinese domain errors. Production deploy, production migration, direct DB cleanup and existing-data repair remain unapproved.
- `DEV-PDM-DRAWING-SUBMISSION-001` is implemented / verification passed locally from the user's 2026-06-30 APP validation decision: drawing module completes master data; drawing-source submission is review-only and does not collect PDM master fields.
- `DEV-PDM-LIFECYCLE-ACTIONS-001` Phase 1-6 local/staging lifecycle package is implemented, QC-captured, and committed locally as `21bcf16` (`DEV-PDM-LIFECYCLE-ACTIONS-001 implement lifecycle actions`). Production and Supabase production cutover are excluded.
- `DEV-PDM-CHANGE-CONTROL-001` Phase 1-5 local implementation evidence is captured; production/Supabase cutover remains approval-gated.
- `DEV-PDM-REVISION-001` and `DEV-SW-LICENSE-PDM-001` are closed local implementation/evidence packages.
- `DEV-SUPABASE-DB-001` staging GATE-B remains passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred.

High-risk constraints:

- Do not run production deployment, production runtime smoke, provider pointer changes, schema migration, data parity execution, direct DB mutation, data deletion, or cost-incurring external actions without explicit PM/user approval.
- Do not move protected evidence files referenced by QC scripts unless scripts and QC evidence are updated in the same scope.
- Do not stage or commit unrelated dirty worktree changes. This repository currently contains many unrelated local modifications.

## 1.1 Non-Production Completion Audit

Audit date: 2026-06-30

User objective: complete all tasks except switching to production.

PM interpretation:

- Completed means all local, non-production, non-cutover, executable DEV/RD/QA/QC tasks in the current control board are either implemented/verified or correctly excluded as blocked/deferred by explicit stop conditions.
- This does not authorize production deployment, Supabase production cutover, provider pointer switch, schema/data migration, direct data mutation, cost-incurring external actions, or external-service validation without required evidence.

Current audit result:

- No local or unclassified open task remains.
- `qc:dev-task-evidence-sync` passed 13/13 and reported no eligible actual dev_task changes while external evidence is open.
- `qc:dev-task-completion-audit` passed 8/8 after parser compatibility was updated for the current `External Blockers / Parked Scope` heading.
- `qc:production-readiness -- --allow-open` is parseable and intentionally reports `ready=false` with five external blockers: `DEV-IND-007`, `DEV-CAD-001`, `DEV-SW-001`, `DEV-BACKUP-001`, and `DEV-FIELD-001`.
- `DEV-STORAGE-COST-001` remains product rollout backlog / parked. It requires real storage inventory, target, cost, retention policy, and production timing approval, and is not a current executable local task.

External blockers that remain after this objective:

- `DEV-IND-007`: needs disposable Supabase/Postgres shadow target and `qc:postgres-shadow` evidence.
- `DEV-CAD-001`: needs SolidWorks Document Manager or equivalent reader/license evidence.
- `DEV-SW-001`: needs SolidWorks Add-in real-machine evidence.
- `DEV-BACKUP-001`: needs offline one-way backup and restore-drill evidence.
- `DEV-FIELD-001`: needs formal field-test evidence.

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed.
- `npm run qc:dev-task-evidence-sync`: passed 13/13.
- `npm run qc:pdm-lifecycle-release-readiness`: passed 48/48.
- `npm run qc:sw-license-pdm-git-boundary`: passed.
- `npm run qc:supabase-runtime-local-readiness`: passed 10/10.
- `npm run qc:supabase-data-parity-policy`: passed 13/13.
- `npm run qc:supabase-current-change-impact`: passed 15/15.
- `npm run qc:production-readiness -- --allow-open`: passed with `ready=false` and all five external blockers visible.
- `npm run qc:dev-task-completion-audit`: passed 8/8.

## 2. Active / Backlog / Deferred / Blocked Work

| Lane | ID | Type | Parent | State | Next condition | Evidence |
|---|---|---|---|---|---|---|
| Implemented / Verification passed | `DEV-PDM-NEXT-STEP-UX-001` | Delivery point / UX quality gate | `DEV-PDM-STATUS-UX-001`; `SPEC-UX-RD-LIFECYCLE-001`; `SPEC-UX-PLATFORM-001` | Phase 1 local UI implementation is complete: shared next-step display is visible by default, unknown status/errors fail closed to actionable Chinese, lifecycle next step is visible inline, dashboard action failures are mapped, and selected blocker/empty/error/disabled states now show what to do next. | Monitor APP validation feedback. Phase 2 scanner/checklist and Phase 3 production release require separate authorization. Stop and re-enter PM/ADR if implementation needs DB/API/permission/state-machine changes, production deploy or data repair. | `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`; `src/components/next-step-state.tsx`; `src/lib/status-display.ts`; `src/components/lifecycle-ux.tsx`; `src/components/dashboard.tsx`; `src/app/numbering/revisions/page.tsx`; `src/app/numbering/dvt/page.tsx`; `src/app/submissions/[id]/page.tsx`; `src/app/handoff/page.tsx`; `src/app/numbering/search/page.tsx`; `src/app/parts/page.tsx`; `src/components/master-attachment-panel.tsx`; `src/app/numbering/part-drafts/page.tsx`; `src/app/numbering/reports/page.tsx`; `src/app/globals.css`; focused QC script maintenance; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-status-ui-vocabulary` 44/44; `npm.cmd run qc:pdm-numbering-search-ui` 28/28; `npm.cmd run qc:pdm-numbering-dvt-ui` 24/24; `npm.cmd run qc:pdm-numbering-report-center-ui` 22/22; `npm.cmd run qc:master-attachments` 93/93; `npm.cmd run qc:pdm-drawing-submission-ui-operation` 14/14; `npm.cmd run dev:local:check`. |
| Implemented / Verification passed | `PA-LOCAL-DEV-3000-001` | CAPA / PA tooling control | None | Recurring broken local 3000 prevention is implemented: managed launcher, `dev:local:check`, stale project recovery via `dev:local:restart`, multi-route health checks, port-owner PID/status JSON/logs, and `.next` clean/build collision guard. | Use `npm run dev:local` for normal startup, `npm run dev:local:check` for diagnosis, and `npm run dev:local:restart` only when the project-owned 3000 process is stale/unhealthy. Build/clean while 3000 is running requires intentional bypass and should not be used as the normal workflow. | `package.json`; `scripts/start-localhost-3000.ps1`; `scripts/clean-next.mjs`; `scripts/qc-local-dev-entrypoint.mjs`; `tmp/local-dev/ai-pdm-3000.status.json`; `npm run qc:local-dev-entrypoint`; `npm run dev:local:check`. |
| Implemented / Verification passed | `DEV-PDM-STATUS-UX-001` | Delivery point | `DEV-PDM-LIFECYCLE-ACTIONS-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` | Phase 1 local RD is implemented: central UI status dictionary, Chinese-only normal UI status display, status filter/badge/error mapping, development phase display mapping and unified `?` help popovers on user-visible status table columns. Focused scanner baseline and browser UI evidence passed. | Monitor APP validation feedback. Remaining Phase 2 hardening, production deploy, DB enum/schema rename, production migration, audit payload migration and historical data repair require explicit authorization. | `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`; `src/lib/status-display.ts`; `src/components/status-help-popover.tsx`; `scripts/qc-pdm-status-ui-vocabulary.mjs`; `npm run qc:pdm-status-ui-vocabulary` 44/44; `npx tsc --noEmit --pretty false`; `npm run lint`; `npm run build`; `output/playwright/status-ui/settings-status-help-open.png`; `output/playwright/status-ui/drawings-phase-label-fixed.png`; `npm run dev:local:check`. |
| Prepared / RD Implementation Ready / Not Authorized | `DEV-PDM-STATUS-UX-002` | Development objective / UX quality gate | `DEV-PDM-STATUS-UX-001`; `DEV-PDM-NEXT-STEP-UX-001` | Development documents are ready for status context disambiguation: task/import/settings/report/DVT/restore/mixed-column status help must become task-specific rather than generic workflow/masterRecord help. No product implementation is authorized by the documentation request. | Requires explicit user authorization before RD implementation. Stop if DB/API/schema migration, production deploy, historical repair, raw audit migration or workflow semantic changes are needed. | `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`; `.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`; required evidence after authorization: `tsc`, lint, focused status context QC, Playwright screenshots for affected routes. |
| Prepared / RD Implementation Ready / Not Authorized | `DEV-PDM-NUMBERING-002` | Delivery point / numbering core | `DEV-PDM-NUMBERING-001`; `SPEC-PDM-NUMBERING-001`; `DEV-PDM-DRAWING-PART-WORKBENCH-001` | Development documents are ready for compact Numbering Core V2: new records target `00001`, `00001-P01`, `00001-M01` and `00001-R01`; v1 `MA/OT` and `D-/P-` records remain readable; manufacturing/reference logic must use semantic helpers; main root remains a reusable design-object root, not a project/order/equipment identity. No product implementation is authorized by the documentation request. | Requires explicit user/RD authorization before Phase 1 implementation. Stop if implementation would invalidate v1 rows, require production migration, direct data rewrite, project/order/equipment numbering, more visible category codes, or a root exceeding 99 per category. | `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`; `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`; `.ai-doc/qa/qa-pdm-numbering-v2-compact-identity-validation-plan-2026-07-07.md`; required evidence after authorization: `tsc`, lint, `qc:pdm-numbering-v2-compact-identity`, existing numbering core/backend/request/search/impact/DVT regressions. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | Delivery point | `DEV-PDM-DRAWING-PART-WORKBENCH-001`; amends `DEV-PDM-SUBMISSION-CONFLICT-001` | Phase 1 implementation surfaces are present and local verification passed: focused recovery QC, disposable mutation lifecycle QC, transaction provider QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke and D-0014 submission-detail browser smoke. A schema bootstrap ordering bug that caused old SQLite files to fail with `no such column: resolved_by_submission_id` was fixed by keeping new release-recovery indexes in runtime migration after lifecycle migration. The mutation gate used disposable records and did not touch existing D-0014/user workflow records. | Monitor APP validation feedback. Phase 2 requires explicit user/PM authorization before RD. Production deploy, production migration, direct DB cleanup, historical data repair and data deletion remain unapproved. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`; `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`; `scripts/qc-pdm-drawing-submission-workbench-recovery.mjs`; `scripts/qc-pdm-drawing-submission-workbench-mutation.mjs`; `output/playwright/pdm-drawing-submission-workbench-d0014-release-incomplete.png`; `output/playwright/pdm-submission-detail-d0014-release-failed-recovery.png`. |
| Prepared / RD Contract Ready | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P` | Delivery point phase handoff | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | Phase 2+ RD handoff contracts complete and rechecked under the latest `dev-pm` All-Phase Gate: master-data completion/writeback through owner APIs, drawing attachment upload before snapshot, collaboration toggle/permissions, operational edit history, dashboard/todo de-noising, and production cutover/historical repair gate. Not executable as RD yet. | Phase 2 requires explicit user/PM authorization. Phase 3 requires Phase 2 implemented/verified plus explicit authorization. Phase 4 requires release-gate approval. Continuation commands must not start Phase 2+ until this row is explicitly updated. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.5. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003` | Delivery point | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | UI-level release-incomplete self-recovery is implemented locally: human-readable diagnosis, attachment organizer, released-filename preflight, explicit selected-attachment correction submission, locked formal-record state, role-aware CTA, submission-detail recovery link, related ReleaseFailed resolution behavior, and UI-only operation validation covering QC-owned route identity (`D-QC-SUBMIT-MA1`), generic upload retirement, detail navigation, recovery, permission, blocker and RWD scenarios. D-0014 remains historical problem context only, not a required executable fixture. | Monitor APP validation feedback. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`; `.ai-doc/qa/qa-pdm-drawing-submission-ui-operation-validation-plan-2026-07-02.md`; `src/app/upload/page.tsx`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/submissions/[id]/return-for-correction/route.ts`; `src/lib/repositories/submission-status-async-repository.ts`; `src/app/submissions/[id]/page.tsx`; `scripts/qc-pdm-drawing-submission-ui-self-recovery.mjs`; `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`; `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`; screenshots `output/playwright/ui-operation-scenarios/REAL-001-qc-submit-drawing-entry.png`, `output/playwright/mock-release-incomplete-ui-self-recovery.png`, `output/playwright/ui-operation-scenarios/MOCK-RELFAIL-001-correction-flow.png`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` | Delivery point | `DEV-PDM-CHANGE-CONTROL-001`; `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | Phase 1 local RD implemented on 2026-07-03, with 2026-07-05 APP feedback applied: a drawing attachment with revision `0.2` is source/staging evidence only until selected into a controlled Pending drawing-revision submission package; the `新版圖面` primary list now shows only target-revision attachments, while previous/other-revision attachments are collapsed read-only reference files with no checkbox. The package creates selected-file snapshot/source traceability and links the FFF assessment via `drawing_revision_fff_assessments.submission_id`. No-impact drawing revisions may keep part and BOM unchanged, but reviewer must confirm BOM no revision. | Monitor APP validation feedback. Production deploy, migration, direct data repair, historical cleanup, CAD/OCR dependency, forced part/BOM revision and later-phase work remain excluded; Phase 2 and Phase 3 are tracked by the P2/P3 rows below. Build remains guarded by `prebuild` when the project dev server is listening on 3000. | `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`; `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`; `src/app/numbering/revisions/page.tsx`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/numbering/drawing-revisions/submissions/route.ts`; `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`; `scripts/qc-pdm-change-control.mjs`; verification: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 56/56, `npm.cmd run dev:local:check`, Playwright mock 1440x900 plus 390x844 sanity check for target `0.2` with only prior `0.1` attachment, plus earlier `npm.cmd run qc:pdm-drawing-submission-review-only`, `npm.cmd run qc:pdm-drawing-submission-workbench-mutation`, local page smoke and protected workbench API 401 unauthenticated. Phone UI is not a separate supported surface; phones use the desktop/default surface. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2` | Delivery point phase handoff | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` | Multi-file revision package intake is implemented locally: one intended drawing revision is a `版次檔案包` with multiple files, extension-based role classification, inline correction, warning-only completeness checks, snapshot persistence and reviewer warning parity on full page plus dashboard drawer. | Monitor APP validation feedback. Stop if follow-up needs production deploy, migration, direct data repair, CAD/OCR extraction, FFF rule change, forced part/BOM revision, optional-file warnings turned into hard blockers, or a dedicated mobile-phone UI. Phones use the desktop/default surface by product setting. | `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 2; `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`; `src/lib/revision-package.ts`; `src/app/numbering/revisions/page.tsx`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/numbering/drawing-revisions/submissions/route.ts`; `src/lib/repositories/submission-list-async-repository.ts`; `src/app/submissions/[id]/page.tsx`; `src/components/dashboard.tsx`; `scripts/qc-pdm-change-control.mjs`; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-change-control` 57/57; `npm.cmd run dev:local:check`; Playwright screenshots `output/playwright/drawing-revision-package-p2/revision-package-submit-desktop.png`, `output/playwright/drawing-revision-package-p2/submission-review-warning-desktop.png`; `output/playwright/drawing-revision-package-p2/revision-package-submit-mobile.png` is retained only as optional viewport sanity, not mobile support evidence. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3` | Delivery point phase handoff | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` | Out-of-order revision acceptance and latest/history view are implemented locally: all drawing revisions may be submitted and approved in any order, the system suggests the next revision first, duplicate formal same drawing + same revision remains blocked, approval/retry-release no longer fails solely because a newer different revision exists, latest/history is recomputed after approval, first-level attachment/package views use the computed latest and older approved revisions remain traceable in history. | Monitor APP validation feedback. Stop if follow-up needs production deploy, direct repair of existing bad data, schema migration without focused plan, duplicate formal records for the same revision, FFF/part/BOM rule changes, strict chronological approval, or dedicated mobile-phone UI. | `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 3; `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`; `src/lib/revision-policy.ts`; `src/lib/repositories/submission-status-async-repository.ts`; `src/lib/repositories/submission-repository.ts`; `src/lib/submission-release-workflow.ts`; `src/app/api/submissions/[id]/approve/route.ts`; `src/app/api/submissions/[id]/retry-release/route.ts`; `src/lib/drawing-revision-workbench.ts`; `src/app/numbering/revisions/page.tsx`; `src/components/master-attachment-panel.tsx`; `scripts/qc-pdm-change-control.mjs`; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-change-control` 61/61; `npm.cmd run dev:local:check`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4` | Delivery point phase handoff | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` | First-class revision attachment package model is implemented locally: stable `packageId`, package files, Released-core immutability, supplement request/approval, confirmed supplement reason menu, approved supplement `補件` tag in the main attachment list and migration dry-run reporting. | Monitor APP validation feedback. Stop if follow-up needs production deploy/migration, direct data repair/deletion, product `待確認附件` area, FFF/part/BOM rule changes, CAD/OCR dependency or dedicated mobile-phone UI. | `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`; `.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-PACKAGE-001-first-class-package-and-supplement.md`; `.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`; `db/schema.sql`; `db/postgres/001_initial_schema.sql`; `src/lib/drawing-revision-package.ts`; `src/lib/repositories/drawing-revision-package-async-repository.ts`; `src/lib/drawing-revision-packages-async.ts`; supplement request/decision API routes; `src/components/master-attachment-panel.tsx`; `scripts/qc-pdm-drawing-revision-package-model.mjs`; `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59; `npm.cmd run qc:pdm-change-control` 61/61; `npm.cmd run db:init`. |
| Implemented / Verification passed | `DEV-PDM-SHARED-3D-MA-BASELINE-001` | Delivery point | `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`; `DEV-PDM-DRAWING-PART-WORKBENCH-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` | Local non-production implementation is complete from the user's 2026-07-06 authorization: part/root-owned shared 3D model versions, hash/revision conflict controls, MA package model-basis API, reviewed `2D-only / no 3D impact` exception, MA package release workflow gate, manufacturing baseline draft/release services, required-MA resolver, immutable released baseline snapshot, part-detail UI slice and additive SQLite/Postgres schema are implemented. | Monitor APP validation feedback. Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule changes, using one MA drawing as shared 3D owner and live production cutover remain not authorized. | `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`; `.ai-doc/decisions/ADR-PDM-SHARED-3D-MA-BASELINE-001-root-shared-model-and-manufacturing-baseline.md`; `.ai-doc/qa/qa-pdm-shared-3d-ma-baseline-validation-plan-2026-07-06.md`; `db/schema.sql`; `db/postgres/001_initial_schema.sql`; `db/postgres/002_supabase_rls_plan.sql`; `src/lib/shared-3d-baseline.ts`; `src/lib/repositories/shared-3d-baseline-async-repository.ts`; shared model / model-basis / manufacturing baseline API routes; `src/app/parts/page.tsx`; `src/lib/submission-release-workflow.ts`; `scripts/qc-pdm-shared-3d-ma-baseline.mjs`; verification: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-shared-3d-ma-baseline` 20/20; `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59; `npm.cmd run qc:pdm-change-control` 61/61; `npm.cmd run qc:db-provider-contract` 35/35; `npm.cmd run qc:db-provider-postgres` 9/9; `npm.cmd run qc:supabase-current-change-impact` 15/15; browser smoke screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`. |
| Implemented / Verification passed | `DEV-PDM-SETTINGS-CENTER-001` | Delivery point | `DEV-CAD-001`; `DEV-SUPABASE-DB-001`; current `/settings` | Phase 1 local implementation is complete: settings center overview/work queue; five management-area routes; server-only SolidWorks secret lifecycle APIs; additive secret metadata schema; redacted UI panel; `local_test_double` provider plus live Supabase Vault gate. Existing Google Drive settings remain operational. | Monitor APP validation feedback. Supabase Vault live write/smoke, production deploy/cutover, direct data repair/deletion, external-cost actions, Manager/Reviewer read views and real SolidWorks/CAD-reader proof require separate authorization/evidence. Stop if implementation needs plaintext secret persistence, frontend Vault access or Google Workspace direct role authority. | `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`; `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`; `.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`; `src/app/settings/page.tsx`; `src/app/settings/integrations/page.tsx`; `src/app/settings/security/page.tsx`; `src/app/settings/workflow/page.tsx`; `src/app/settings/system/page.tsx`; `src/app/api/settings/secrets/*`; `src/lib/settings-secret-lifecycle.ts`; `src/lib/repositories/settings-secret-async-repository.ts`; `db/schema.sql`; `db/postgres/001_initial_schema.sql`; `db/postgres/002_supabase_rls_plan.sql`; `scripts/qc-pdm-settings-center-secret-lifecycle.mjs`; verification: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-settings-center-secret-lifecycle`; `npm.cmd run qc:supabase-secret-boundary`; `npm.cmd run qc:gdrive-folder-tree-settings`; `npm.cmd run qc:db-provider-contract`; `npm.cmd run qc:db-provider-postgres`; `npm.cmd run qc:supabase-current-change-impact`. |
| Implemented / Verification passed | `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001` | Delivery point | `DEV-PDM-SETTINGS-CENTER-001`; `DEV-CAD-001`; `DEV-PDM-SHARED-3D-MA-BASELINE-001`; current master attachment preview board | Phase 1 local non-production vertical slice is implemented: additive preview queue/derivative schema, async service, fake local PNG worker, token-gated worker claim/complete contract, Windows Shell thumbnail worker, SolidWorks Document Manager SLDDRW PNG worker/exporter, blank/low-information PNG quality gate, attachment preview enqueue/list APIs, derivative stream under the source attachment route, no-store attachment list refresh, and derivative-aware first-level 3D/2D preview cards. Ready derivatives are displayed only when their source hash matches the current attachment. | Monitor APP validation feedback. Real Windows Shell evidence passed for `.SLDPRT`; local `.SLDDRW` Shell output was blank and is now failed cleanly. Document Manager SLDDRW worker compiles and claims drawing jobs, but local UI secret storage is `local_test_double` metadata and does not provide plaintext to the worker, so real SLDDRW success requires Supabase Vault live secret read or worker-local `PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY`. Full `.SLDASM` readiness, Phase 2 drawing PDF, Phase 3 interactive 3D, production deploy/migration, direct data repair/deletion, browser access to secrets/native CAD tooling, synchronous COM/eDrawings/SolidWorks in Next.js request handlers, and preview-as-release-blocker policy remain not authorized. | `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`; `.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`; `.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`; `db/schema.sql`; `db/postgres/001_initial_schema.sql`; `db/postgres/002_supabase_rls_plan.sql`; `src/lib/preview-derivatives.ts`; `src/lib/master-attachments-async.ts`; attachment routes under `src/app/api/numbering/drawings/[drawingNumber]/attachments/` and `src/app/api/parts/[partNumber]/attachments/`; `src/app/api/preview-jobs/*`; `src/components/master-attachment-panel.tsx`; `src/app/globals.css`; `scripts/run-windows-shell-preview-worker.mjs`; `scripts/windows-shell-thumbnail-extractor.ps1`; `scripts/run-solidworks-document-manager-preview-worker.mjs`; `scripts/solidworks-document-manager-preview-exporter.cs`; `scripts/qc-pdm-sw-native-preview-worker.mjs`; `scripts/qc-pdm-sw-native-preview-redaction.mjs`; verification: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-sw-native-preview-worker` 90/90; `npm.cmd run qc:pdm-sw-native-preview-redaction` 68/68; `npm.cmd run qc:master-attachments` 101/101; `npm.cmd run dev:local:check`; API worker smoke on `D-0007-MA1` created real `.SLDPRT` derivative `4fde352c-eb3c-416e-bcdd-3ccf1fec6640`; Document Manager worker compile-only passed; SLDDRW API worker smoke failed cleanly with missing worker-readable key; browser smoke screenshot `output/playwright/master-attachment-preview/d0007-3d-ready-2d-key-missing-compact.png`. |
| Implemented / Verification passed | `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` | Delivery point | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`; `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003` | Phase 1 local RD is implemented and verified: release success now syncs submission, source drawing, resolved part and root master lifecycle in one DB transaction, writes master-sync audit, and exposes a temporary visible inconsistency guard for historical released-as-Draft records. Phase 2 historical scanner/Admin repair and Phase 3 production cutover are contract-ready but not authorized. | Monitor APP validation feedback. Historical D-0014 repair, production migration, direct DB mutation against existing user data and data deletion remain unapproved. | `.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`; `src/lib/repositories/submission-status-async-repository.ts`; `src/lib/repositories/numbering-async-repository.ts`; `src/lib/repositories/numbering-repository.ts`; `src/app/numbering/drawings/page.tsx`; `scripts/qc-pdm-release-master-status-sync.mjs`; `npm run qc:pdm-release-master-status-sync` 23/23; `npx tsc --noEmit --pretty false`; `npm run lint`; `npm run qc:pdm-drawing-submission-workbench-recovery` 27/27; `npm run qc:pdm-drawing-submission-ui-operation` 14/14; `output/playwright/pdm-release-master-status-sync-guard-d0014.png`. |
| Implemented / Verification passed | `DEV-PDM-SUBMISSION-CONFLICT-001` | Development objective | `DEV-PDM-DRAWING-PART-WORKBENCH-001` | Duplicate drawing + revision submission is reclassified as `submission_conflict`, blocked at readiness/submit/reviewer guard, shown with human Chinese recovery, retained in structured blocked-attempt audit, and raw DB uniqueness errors are shielded from UI. | Monitor APP validation feedback. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved. | `src/lib/drawing-submission-workbench.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`; `src/app/upload/page.tsx`; `src/app/api/submissions/[id]/approve/route.ts`; `src/components/dashboard.tsx`; `scripts/qc-pdm-submission-conflict-duplicate-active.mjs`; `scripts/qc-pdm-drawing-submission-review-only.mjs`; `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`; `.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-PART-WORKBENCH-001` | Delivery point | Supersedes part of `DEV-PDM-DRAWING-SUBMISSION-001` | 圖料/圖號送審安全 package implemented locally: controlled drawing submission route, generic upload retirement, generic submission POST retirement, readiness APIs, ambiguity blockers, duplicate filename preflight, immutable snapshot/hash, idempotency attempt audit, owner-route master data edit path and updated QC. | Monitor user APP validation feedback. Production deploy, production migration, direct DB cleanup and data deletion remain unapproved. | `src/lib/drawing-submission-workbench.ts`; `src/lib/repositories/submission-write-async-repository.ts`; `src/lib/db.ts`; `db/schema.sql`; `src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx`; `src/app/api/numbering/roots/[rootCode]/submission-readiness/route.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route.ts`; `src/app/api/submissions/route.ts`; `scripts/qc-pdm-drawing-part-workbench-security.mjs`; `scripts/qc-pdm-drawing-submission-review-only.mjs`; `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`; `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`; `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-SUBMISSION-001` | Delivery point | None | Drawing-source `送審` opens a review-only submission workflow. Master data comes from drawing/part modules; missing data blocks and routes back to master data, not inline editing. | Monitor user APP validation feedback; production deploy remains unapproved. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`; `.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submission-context/route.ts`; `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`; `scripts/qc-pdm-drawing-submission-review-only.mjs`; `output/playwright/pdm-drawing-submission-review-only-desktop.png`; `output/playwright/pdm-drawing-submission-review-only-mobile.png`. |
| Implemented / Verification passed | `DEV-PDM-UI-POLISH-001` | Development objective | None | APP manual-verification UI polish package completed: upload form simplification, Chinese CAD warning copy, SolidWorks-primary multi-file metadata, visible conflict warnings, SolidWorks preview fallback, compact drawing governance actions, and drawing revision workbench focused slice. | Monitor user APP validation feedback; future enhancements should be split into new focused tasks. | User APP validation screenshots on 2026-06-30; `src/app/upload/page.tsx`; `src/lib/pdm-metadata.ts`; `src/components/master-attachment-panel.tsx`; `src/app/numbering/drawings/page.tsx`; `src/app/numbering/revisions/page.tsx`; screenshots in `C:\Users\user\AppData\Local\Temp\`. |
| Implemented / Verification passed | `DEV-PDM-UI-POLISH-001A` | Development objective | `DEV-PDM-UI-POLISH-001` | Drawing revision workbench focused slice implemented: official drawing resolver, user-facing workbench UI, server-side drawing/primary-part resolution, duplicate submit guard, and replacement draft reuse. | Monitor user APP validation feedback; remaining enhancements should be split into new tasks. | `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`; `.ai-doc/qa/qa-pdm-drawing-revision-workbench-validation-plan-2026-06-30.md`; `src/lib/drawing-revision-workbench.ts`; `src/app/api/numbering/drawings/resolve/route.ts`; `src/app/numbering/revisions/page.tsx`. |
| Deferred | `DEV-SUPABASE-DB-001` | Development objective | None | Staging GATE-B passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred. Production gate is not executable now. | PM decides data parity tier and production gate scope, or keeps production deferred. | Section 5; `.ai-doc/archived/completed-dev-index-2026-06.md`. |
| Prepared / Blocked | `DEV-SUPABASE-DB-001-DATA-PARITY` | QA / PM evidence | `DEV-SUPABASE-DB-001` | Data parity policy prepared; execution not approved. | PM approves parity tier, source snapshot, table scope, target, cleanup owner, and credential boundary. | `.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md`; `qc:supabase-data-parity-policy`. |
| Deferred | `DEV-SUPABASE-DB-001-PROD-GATE` | PM decision | `DEV-SUPABASE-DB-001` | Staging GATE-B passed; production/cutover remains unapproved and deferred. | Production target, cost confirmation, advisor triage, production migration plan, rollback owner, and release gate approval. | Not executable now. |
| Backlog / Parked | `DEV-STORAGE-COST-001` | Delivery / development objective | None | Evidence captured / product rollout backlog; not part of the current DB runtime gate. | Real storage inventory, target, cost, retention policy, and production timing must be approved. | `.ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md`. |

### DEV-PDM-NUMBERING-002 Compact Numbering Core V2

Status: Prepared / RD Implementation Ready / Not Authorized
Priority: P0 - identity scheme affects root, drawing, part, release gate and future ERP/PLM compatibility
Type: Delivery point / numbering core
Parent: `DEV-PDM-NUMBERING-001`; `DEV-PDM-DRAWING-PART-WORKBENCH-001`; current PDM master-data direction
Authorized phase: Phase 0 development documents are complete. Phase 1 product implementation is not authorized by the documentation request.

Human decisions:

- Main root is a reusable PDM design-object root, not a project, order, equipment serial number or whole-machine project.
- PDM first manages only main root, drawing number and part number.
- New target identities are `00001`, `00001-P01`, `00001-M01` and `00001-R01`.
- Visible drawing number signal should only distinguish manufacturing-authorized drawing from reference-only drawing.
- Additional subtype such as installation, concept, inspection, customer review or fixture belongs in metadata, not visible number codes.

Required docs:

- `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
- `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
- `.ai-doc/qa/qa-pdm-numbering-v2-compact-identity-validation-plan-2026-07-07.md`
- Existing amended authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`

Scope:

- Add `numbering-rule-v2` and generate five-digit root codes.
- Create new part numbers as `{root}-P{seq2}`.
- Create new drawing numbers as `{root}-M{seq2}` or `{root}-R{seq2}`.
- Keep v1 historical data readable/searchable.
- Replace hard-coded `MA/OT` gate logic with semantic manufacturing/reference helpers.
- Update API, UI labels, placeholders, imports, exports, regex validators and focused QC.

Out of scope:

- Production deploy, production migration, Supabase cutover or provider pointer changes.
- Direct rewrite of existing v1 data.
- Project/order/equipment numbering.
- BOM/ERP/equipment history linkage.
- More visible number category codes.
- Retiring v1 read/search paths.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development documents | Complete | SPEC, ADR, QA, dev_task and documentation_map | Authorized by user request |
| Phase 1 - Local v2 creation and compatibility | RD Implementation Ready / Not Authorized | New records use compact v2; v1 remains readable | Requires explicit RD authorization |
| Phase 2 - Migration dry-run | RD Contract Ready / Not Authorized | Map v1 to v2 and identify collision/capacity blockers | Requires Phase 1 evidence and explicit authorization |
| Phase 3 - Downstream compatibility | RD Contract Ready / Not Authorized | Submission, revision, baseline, preview and report semantics support v1/v2 | Requires Phase 1-2 evidence and explicit authorization |
| Phase 4 - Production cutover | Release Gate Contract Ready / Not Authorized | Production migration/deploy/smoke/rollback | Requires deployment-release gate |

Acceptance for Phase 1 after authorization:

- Normal create can produce `00001-P01`, `00001-M01` and `00001-R01`.
- Normal create no longer emits new `D-...`, `P-...`, `MA` or `OT` values.
- v1 rows remain readable/searchable.
- Missing manufacturing drawing gates accept `MA/M` as manufacturing and reject `OT/R` as reference.
- UI labels use `製造圖` and `參考圖`, not `OT 其他圖` for new creation.

Evidence required after authorization:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run qc:pdm-numbering-v2-compact-identity`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-backend-rules`
- `npm.cmd run qc:pdm-numbering-request-ui`
- `npm.cmd run qc:pdm-numbering-search-ui`
- `npm.cmd run qc:pdm-numbering-impact-ui`
- `npm.cmd run qc:pdm-numbering-dvt-ui`

Stop conditions:

- Any implementation would invalidate existing v1 rows.
- A root needs more than 99 part, manufacturing drawing or reference drawing sequence values.
- Implementation needs production migration, direct data rewrite, data deletion or project/order/equipment identity design.
- Reference drawings are requested to become manufacturing basis without becoming an `M` drawing.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Existing-data v1 to v2 rewrite | Same Spec Phase 2 / Not Authorized | Dry-run and approval required |
| Downstream compatibility | Same Spec Phase 3 / Not Authorized | Captured but not Phase 1 by default |
| Production cutover | Same Spec Phase 4 / Not Authorized | Requires deployment-release gate |
| Project/order/equipment numbering | Blocked Human Re-entry | Changes product scope and identity model |
| More visible category codes | Blocked Human Re-entry | User currently chose only `P/M/R` |
| Retiring v1 read paths | No Tracking now | Rejected for safety; historical records stay readable |

Next condition:

- User explicitly authorizes `DEV-PDM-NUMBERING-002` Phase 1 local RD implementation, or keeps it parked as documentation-ready.

### DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001 Windows SolidWorks 原檔預覽衍生檔

Status: Implemented / Verification passed locally for Phase 1
Priority: P1 - removes the current `預覽待產生` gap for native SolidWorks attachments after secret setup
Type: Delivery point
Parent: `DEV-PDM-SETTINGS-CENTER-001`; `DEV-CAD-001`; `DEV-PDM-SHARED-3D-MA-BASELINE-001`; current master attachment preview board
Authorized phase: local non-production Phase 1 implementation is complete and verified. Real Windows Shell worker evidence is captured for `.SLDPRT`; a SolidWorks Document Manager SLDDRW PNG worker/exporter is implemented and compile-verified, but real SLDDRW success still requires a worker-readable active key. Full native preview readiness still requires Document Manager/eDrawings/equivalent success evidence for `.SLDDRW` and `.SLDASM`.

Human decisions:

- User wants SolidWorks native files to show previews similar to Windows File Explorer.
- First value slice is `.SLDPRT / .SLDASM / .SLDDRW -> PNG`.
- Second value slice is `.SLDDRW -> PDF`.
- API key input in `/settings` is a prerequisite only; it does not generate previews by itself.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`
- `.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`
- `.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`

Scope:

- Add preview job and file derivative metadata for native CAD preview generation.
- Add worker claim/complete contract for a trusted Windows preview worker.
- Generate PNG/PDF derivatives as browser-readable artifacts tied to source file hash.
- Update current 3D/2D preview cards to prefer ready derivatives before raw source fallback.
- Show queued/running/ready/failed/stale/skipped states with Traditional Chinese next-action copy.
- Use existing settings secret lifecycle for SolidWorks Document Manager/equivalent credentials without exposing plaintext.
- Validate local PDM pipeline with a fake worker and a real Windows worker smoke before claiming any native preview readiness.

Out of scope:

- Full Windows Document Manager/eDrawings/equivalent worker readiness proof for `.SLDASM`, successful `.SLDDRW` output with a real worker-readable key, and drawing PDF.
- Production deploy, production migration/cutover, direct data repair or data deletion.
- Browser-side parsing of `.SLDPRT`, `.SLDASM` or `.SLDDRW`.
- Calling Windows Explorer shell thumbnail handlers from browser or Next.js request handlers; Shell use is allowed only inside the isolated worker.
- Running SolidWorks/eDrawings/COM/Document Manager synchronously inside Next.js request handlers.
- Interactive 3D viewer, STEP/glTF conversion or measurement features.
- Making preview generation failure a release blocker in Phase 1.
- Replacing source CAD, drawing package source, shared 3D source or manufacturing baseline evidence with preview derivatives.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture SPEC, ADR, QA, dev_task and documentation_map entry | Authorized by user request to write development documents |
| Phase 1 - Native PNG preview vertical slice | Implemented locally / Partial real worker evidence | Queue, derivative metadata, fake worker QC, UI integration, real Windows worker smoke for `.SLDPRT`, and Document Manager SLDDRW PNG worker path; `.SLDDRW` blank Shell output and missing worker-readable key both fail cleanly | Local PDM pipeline implemented; full native readiness requires worker-readable key plus Document Manager/eDrawings/equivalent sample-file success evidence |
| Phase 2 - Drawing PDF preview | RD Contract Ready / Not Authorized | `.SLDDRW -> PDF` through eDrawings/SOLIDWORKS/equivalent controlled worker | Requires renderer/licensing/timeout approval |
| Phase 3 - Interactive 3D derivative | RD Contract Ready / Not Authorized | Evaluate STEP/glTF/web viewer derivative | Requires architecture/security/performance decision |
| Phase 4 - Production rollout | Release Gate Contract Ready / Not Authorized | Worker deployment, storage retention, backfill, production smoke and rollback | Requires deployment-release gate |

Phase 1 acceptance:

- Native SW attachment can enqueue or auto-create an idempotent preview job.
- Fake local worker can generate deterministic PNG derivatives for automated local QC.
- Real Windows worker can generate PNG previews for supported sample files and must fail/skip blank or unsupported outputs without displaying misleading images.
- Preview card displays generated PNG instead of `預覽待產生` when a current-hash derivative exists.
- Failed/skipped preview states show reason and retry/settings recovery path without raw stack traces or command lines.
- Source hash mismatch prevents stale derivative display.
- Existing PDF/image/Drive preview behavior keeps working.
- No SolidWorks API/license key material appears in jobs, logs, API responses, screenshots or report JSON.

Stop conditions:

- RD needs production deploy, migration, direct data repair or data deletion.
- RD needs browser/frontend access to SolidWorks API/license key material.
- RD needs to store plaintext keys in preview jobs, worker output, logs or reports.
- RD needs to call native CAD tooling synchronously from a Next.js API route.
- Worker cannot authenticate as a trusted service identity or cannot tie output to source hash.
- Real native preview proof is required but no Windows host/sample files/component are available.

Evidence required:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run lint -- --quiet`
- `npm.cmd run qc:master-attachments`
- new focused `qc:pdm-sw-native-preview-worker`
- new focused `qc:pdm-sw-native-preview-redaction`
- settings secret boundary regression
- browser smoke for ready PNG derivative and failed/skipped state
- real Windows worker smoke before claiming real native preview readiness

Evidence captured on 2026-07-06:

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
- `npm.cmd run dev:local:check`: passed.
- API worker smoke: `D-0007-MA1.SLDPRT` job `53749eb7-9aa1-4902-b6cc-a4fc2035f814` succeeded through `qc-windows-shell-worker`; derivative `4fde352c-eb3c-416e-bcdd-3ccf1fec6640` is `image/png`, `768x576`, generator `windows-shell-ishellitemimagefactory-v1`.
- API worker smoke: `D-0007-MA1.SLDDRW` job `f921e930-2cec-441c-a8dd-4a06a6f71c6d` first failed cleanly because this workstation's Shell provider returned blank/low-information output, then was claimed by the Document Manager worker and failed cleanly with `solidworks_document_manager_preview_failed` because the active UI secret is `local_test_double` metadata and no worker-readable key is available.
- Worker compile smoke: `node scripts/run-solidworks-document-manager-preview-worker.mjs --compile-only` produced `.tmp/solidworks-document-manager-preview/SolidWorksDocumentManagerPreviewExporter.exe`.
- Browser smoke: demo Admin opened `D-0007-MA1`; screenshot `output/playwright/master-attachment-preview/d0007-3d-ready-2d-key-missing-compact.png` shows the real 3D preview and the compact 2D failed/retry state without fake preview display or clipped long error text.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product implementation | Same Spec Phase 1 / Implemented locally | Local PDM pipeline implemented with fake-worker proof and Windows Shell `.SLDPRT` proof |
| Full Windows Document Manager/eDrawings/equivalent evidence | Blocked Human Re-entry / external evidence | Requires worker-readable active credential and successful `.SLDASM` / `.SLDDRW` sample-file evidence |
| Drawing PDF generation | Same Spec Phase 2 / Not Authorized | Requires renderer/tooling approval |
| Interactive 3D viewer | Same Spec Phase 3 / Not Authorized | Requires separate architecture/security/performance review |
| Production rollout/backfill | Same Spec Phase 4 / Not Authorized | Requires release gate, storage policy and rollback |
| Release blocking on preview failure | Blocked Human Re-entry | Current product assumption keeps preview non-blocking |
| Windows Explorer shell handler direct integration | No Tracking / rejected | Rejected for web/PDM backend safety |

Next condition:

- Continue only after worker-readable Document Manager key is available through Supabase Vault live secret read or worker-local environment variable, or after explicit user/PM authorization for eDrawings drawing worker, Phase 2 `.SLDDRW -> PDF`, production rollout, or historical preview backfill.
- Do not treat this Phase 1 implementation as permission for production migration, production deployment, direct data repair/deletion, or using preview failure as a release blocker.

### DEV-PDM-SETTINGS-CENTER-001 系統設定中心與 Secret 生命週期治理

Status: Implemented / Verification passed locally
Priority: P0 - secret governance and settings activation must be safe before SolidWorks/API keys are managed from UI
Type: Delivery point
Parent: `DEV-CAD-001`; `DEV-SUPABASE-DB-001`; current `/settings`
Authorized phase: local non-production Phase 1 implementation authorized by the user on 2026-07-06. Supabase Vault live writes, production deploy/cutover, direct data repair/deletion and external-cost actions remain not authorized. Local evidence uses an approved test-double/live-gate boundary.

Human decisions:

- `1C`: `/settings` becomes a settings center, not one growing page.
- `2C`: API/license keys can be entered through UI, but backend stores them securely and UI returns only masked status.
- `3B`: low-risk settings can apply immediately; high-risk settings require test before Admin activation.
- `1B`: first version has five settings areas.
- `2B`: secret management is generic, not SolidWorks-only.
- `3B`: high-risk activation is done by Admin after test success.
- `1C amended`: Supabase Vault stores secret material; Supabase DB stores metadata only; Google Workspace handles Drive/account source only.
- `2B`: Admin can change settings; Manager/Reviewer may see selected redacted status only.
- `3B`: non-secret settings can version/rollback; secrets can rotate/revoke but not restore old plaintext.
- `1A`: PDM Next.js backend APIs operate Supabase Vault.
- `2B`: secret metadata lifecycle is `draft -> tested -> active -> retired / revoked`.
- `3B`: Google Workspace is account source, while PDM owns PDM roles/approval.
- `1A`: settings subpages are organized by management task.
- `2B`: use dedicated metadata tables instead of extending `system_settings`.
- `3B`: high-risk UI flow is `save draft -> test -> Admin activate`.
- `1C`: `/settings` overview is a work queue for current settings tasks.
- `2B`: first integration scope is SolidWorks, Google Workspace/Drive, Supabase, LLM/OpenAI and release/backup.
- `3B`: test evidence stores summary/error/actor/time/version/artifact path, not sensitive request/response payloads.
- `1B`: settings visibility is classified by setting type.
- `2B`: high-risk settings are secrets, Google Drive directories, Supabase connection, release/backup and permission matrix.
- `3C`: first implementation order is a SolidWorks secret vertical slice.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`
- `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`
- `.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`

Scope:

- Convert `/settings` into a settings center with overview/work queue and five management areas:
  `/settings`, `/settings/integrations`, `/settings/security`, `/settings/workflow`, `/settings/system`.
- Add generic secret metadata lifecycle backed by Supabase Vault for secret material and Supabase DB metadata only.
- Add server-only APIs for secret draft, test, activation, revoke and redacted status.
- Add high-risk setting draft/test/Admin activation flow.
- Add role-based redacted visibility for Admin, Manager and Reviewer.
- Add SolidWorks secret lifecycle as the first vertical slice.
- Preserve current Google Drive settings until deliberately migrated.

Out of scope:

- Production deploy, production migration/cutover or direct production data repair.
- Direct data deletion.
- Supabase Vault live write/smoke until a disposable/staging target is approved.
- Real SolidWorks Document Manager / CAD-reader proof; that remains under `DEV-CAD-001`.
- Plaintext secret storage in DB, log, audit, report, screenshot or browser response.
- Frontend/browser/Data API access to Supabase Vault.
- Google Workspace direct authority over PDM roles/approval.
- Two-person activation approval in first version.
- ERP/procurement connector settings.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Architecture and long task | Complete | Capture HCS decisions, spec, ADR, QA and dev_task entry | Authorized by `要寫成長任務` |
| Phase 1 - SolidWorks secret vertical slice | Implemented / Verification passed locally | Prove UI input -> test-double Vault boundary -> metadata -> probe/test -> Admin activation -> audit -> work queue | Supabase Vault live evidence remains gated |
| Phase 2 - Settings center IA shell | Implemented / Compatibility shell passed locally | Add five management-area routes while preserving current Google Drive flow | Dedicated per-area pages may be deepened later |
| Phase 3 - Google Workspace/Drive migration | RD Contract Ready / Not Authorized | Move Drive folders/account-source status into lifecycle model | Requires Google credential boundary confirmation |
| Phase 4 - Supabase/LLM/release/backup settings | RD Contract Ready / Not Authorized | Generalize provider lifecycle and redacted evidence | Requires provider/cost/credential approval |
| Phase 5 - Workflow/permission matrix lifecycle | RD Contract Ready / Not Authorized | Apply draft/test/Admin activation to workflow settings | Requires workflow activation authorization |
| Phase 6 - Production release/cutover | RD Contract Ready / Not Authorized | Migrations, advisors, release gate and rollback | Requires deployment-release approval |

Phase 1 acceptance:

- Admin can create a draft SolidWorks secret and cannot read it back as plaintext.
- Backend stores no secret plaintext in PDM DB/log/audit/browser response. Local test-double evidence stores metadata only; Supabase Vault live write remains a production-readiness blocker.
- Test run stores result summary, redacted error, actor, time, version and artifact path only.
- Only `tested` versions can be activated.
- Activating a version retires prior active version.
- Revoked/retired versions cannot be used by runtime/probe.
- `/settings` overview shows missing/draft/test-failed/tested/active states with the correct next action.
- Non-Admin mutation routes are rejected.

Stop conditions:

- RD needs production deploy, production migration/cutover, direct data repair or data deletion.
- RD needs plaintext secret storage outside Supabase Vault.
- RD needs browser, publishable key, anon key or Supabase Data API role to access Vault.
- Supabase Vault live target is required but unavailable and no test double boundary is authorized.
- Probe evidence cannot be redacted without losing QA signal.
- Implementation would let Google Workspace group membership directly control PDM roles or approval authority.

Evidence required:

- Passed locally: `npx.cmd tsc --noEmit --pretty false`
- Passed locally: `npm.cmd run lint -- --quiet`
- Passed locally: `npm.cmd run qc:pdm-settings-center-secret-lifecycle`
- Passed locally: `npm.cmd run qc:supabase-secret-boundary`
- Passed locally: `npm.cmd run qc:gdrive-folder-tree-settings`
- Passed locally for added metadata schema: `npm.cmd run qc:db-provider-contract`, `npm.cmd run qc:db-provider-postgres`, `npm.cmd run qc:supabase-current-change-impact`
- Supabase Vault live evidence remains an explicit test-double/live-gate blocker.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product implementation | Same Spec Phase 1-5 / Not Authorized | Captured in phase roadmap |
| Production release/cutover | Same Spec Phase 6 / Not Authorized | Requires deployment-release gate |
| Supabase Vault live target | Blocked Human Re-entry before production | Local test-double is implemented; live Vault target/smoke is still required before production readiness |
| Two-person activation approval | No Tracking in first version | User selected Admin activation |
| ERP/procurement settings | No Tracking in first version | Excluded from first integration scope |
| Google group direct role mapping | No Tracking / rejected | User selected PDM as role authority |
| Existing settings migration | Same Spec Phase 2-3 | Current flow remains compatible until migrated |
| Secret rollback to old plaintext | No Tracking / rejected | Secrets are rotate/revoke only |

### DEV-PDM-SHARED-3D-MA-BASELINE-001 共用 3D 主檔與 MA 製造基準包

Status: Implemented / Verification passed locally
Priority: P0 - formal manufacturing traceability across shared 3D and multiple MA drawings
Type: Delivery point
Parent: `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`; `DEV-PDM-DRAWING-PART-WORKBENCH-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
Authorized phase: local non-production implementation authorized by the user on 2026-07-06. Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule changes and production cutover remain not authorized.

Human decisions:

- `1B`: shared 3D master data belongs at the part/root level.
- `2B`: part/root manufacturing baseline freezes the effective manufacturing set; it does not replace dynamic part-number/root search.
- `3B`: MA drawing release normally requires shared 3D link; pure 2D marking/annotation changes may use a reviewed `2D-only / no 3D impact` exception.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`
- `.ai-doc/decisions/ADR-PDM-SHARED-3D-MA-BASELINE-001-root-shared-model-and-manufacturing-baseline.md`
- `.ai-doc/qa/qa-pdm-shared-3d-ma-baseline-validation-plan-2026-07-06.md`

Scope:

- Implemented part/root-level shared 3D model ownership and hash reuse guidance.
- Implemented MA drawing revision package model-basis API for shared model version or reviewed 2D-only exception.
- Implemented manufacturing baseline object that freezes shared 3D model hash/version and selected MA drawing revision packages.
- Implemented baseline required-MA resolver so users cannot silently omit required MA drawings at release.
- Implemented model hash/revision conflict policy, approval action codes and additive schema.
- Implemented part detail UI slice for shared 3D creation, MA package binding / 2D-only exception and baseline draft/release.
- Implemented impact service for released baselines that reference a shared model.

Out of scope:

- Production deploy/migration, direct data repair/deletion, CAD/OCR extraction dependency, forced part/BOM revision, replacing drawing revision packages, replacing part/root search, or using one MA drawing as the shared 3D owner.

Acceptance:

- Part/root can own a shared 3D model version with stable id and content hash.
- MA package release blocks missing model link unless reviewed 2D-only exception exists.
- Manufacturing baseline release freezes exact shared 3D and MA package ids.
- Released baseline cannot be edited in place.
- Dynamic part/root search and frozen baseline evidence are clearly distinct.

Stop conditions:

- RD needs production deploy, production migration, direct DB mutation, historical repair or data deletion.
- RD must change FFF, BOM, part-number identity or drawing-number identity rules.
- RD cannot model shared 3D at part/root level without making one MA drawing the owner.
- Baseline release would mutate existing released MA packages.

Evidence:

- Passed locally: `npx.cmd tsc --noEmit --pretty false`
- Passed locally: `npm.cmd run lint -- --quiet`
- Passed locally: `npm.cmd run qc:pdm-shared-3d-ma-baseline` 20/20, including schema/service/API/UI/release-workflow static gates and SQLite immutable baseline semantics.
- Passed locally: `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59.
- Passed locally: `npm.cmd run qc:pdm-change-control` 61/61.
- Passed locally for added schema/runtime boundary: `npm.cmd run qc:db-provider-contract` 35/35, `npm.cmd run qc:db-provider-postgres` 9/9, `npm.cmd run qc:supabase-current-change-impact` 15/15.
- Browser smoke passed on `http://localhost:3000/parts`: first part drawer shows `共用 3D / MA 製造基準`, no console/http error, no horizontal overflow; screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`.

### DEV-PDM-NEXT-STEP-UX-001 全系統可行動狀態提示與下一步 UX

Status: Implemented / verification passed locally for Phase 1
Priority: P0 - user-facing blockers and empty/error states must answer the operational question, not only report system state
Type: Delivery point / UX quality gate
Parent: `DEV-PDM-STATUS-UX-001`; `SPEC-UX-RD-LIFECYCLE-001`; `SPEC-UX-PLATFORM-001`
Authorized phase: Phase 1 local UI implementation was authorized by the user's `執行開發` instruction and is complete. Phase 2 scanner/checklist hardening and Phase 3 production release are not authorized.

Human Decision Brief:

- User-facing states must answer `那我現在要幹嘛`.
- The correct answer may be `不用處理`, but it must be explicit.
- Main UI prompts must not lead with raw backend code, SQL, HTTP status, enum names, internal IDs or audit payloads.
- High-risk states must show the responsible role and a recovery path.
- Technical detail belongs in secondary details/debug/audit, not the primary user-facing answer.

Required docs:

- `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`
- Existing status vocabulary authority: `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`
- Existing lifecycle UX context: `.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md`
- Existing platform routing context: `.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md`

Current QA inventory:

- Good pattern: `src/app/upload/page.tsx` formal same-revision blocker now answers `這版已完成，不用再送審`, with `回圖號模組`, `建立新版次`, `查看正式紀錄`.
- Good pattern: `src/app/bom/reviews/page.tsx`, `src/app/handoff/page.tsx`, and `src/app/numbering/tasks/page.tsx` already use `NextStepState` for some empty states.
- Gap: `src/components/dashboard.tsx` repeats raw/generic `alert(body.error ?? "...失敗")` patterns across many action handlers.
- Gap: `src/lib/status-display.ts`, `src/components/next-step-state.tsx`, and `src/components/lifecycle-ux.tsx` can still hide or omit the direct next step.
- Gap: `src/app/numbering/revisions/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/submissions/[id]/page.tsx`, `src/app/handoff/page.tsx`, `src/app/numbering/search/page.tsx`, `src/app/parts/page.tsx`, `src/components/master-attachment-panel.tsx`, `src/app/numbering/part-drafts/page.tsx`, and `src/app/numbering/reports/page.tsx` have blocker/empty/error/disabled states that need action-first wording.

Phase roadmap:

| Phase | State | Purpose | Authorization boundary |
|---|---|---|---|
| Phase 0 - Documentation | Complete | Capture QA inventory, spec, phase plan and deferred scope | Authorized by `寫成開發文件` |
| Phase 1 - Product UI implementation | Implemented / Verification passed locally | Fix selected blockers, empty states, disabled states and failure states so they answer `現在要做什麼` | Authorized by `執行開發`; local implementation complete |
| Phase 2 - Regression scanner and new-module checklist | RD Contract Ready / Not Authorized | Add QC guard and checklist so new UI states do not regress | Requires separate authorization |
| Phase 3 - Production release gate | RD Contract Ready / Not Authorized | Deploy only after implementation and scanner evidence pass | Requires release/deploy approval |

Phase 1 acceptance:

- Every changed blocker/empty/error/disabled state answers `現在要做什麼`.
- Terminal states explicitly say `不用處理` when no user action is required.
- Recoverable states show a CTA or responsible-role instruction in the main visible area.
- Normal UI main copy does not expose raw backend code, SQL/constraint text, HTTP status or internal enum.
- Desktop and mobile evidence shows no hidden CTA, overlap, clipping or unreadable text.

Stop conditions:

- RD needs DB/API/permission/state-machine changes.
- RD needs production deploy, migration, direct data repair or historical cleanup.
- A state cannot be mapped safely without a human product decision.
- A required UI fix expands into full platform navigation redesign.

Deferred Scope Audit:

| Scope | Classification | Reason |
|---|---|---|
| Product RD implementation | Same Spec Phase 1 / Completed locally | Authorized by `執行開發` and implemented locally on 2026-07-04 |
| Regression scanner hardening | Same Spec Phase 2 / Not Authorized | Should follow or accompany implementation once authorized |
| Production deploy/release | New DEV or release gate / Not Authorized | Requires deployment approval and release evidence |
| DB/API/permission/state-machine changes | Blocked Human Re-entry | Higher-risk product decision outside UI copy contract |
| Admin/debug/audit raw payload full localization | No Tracking in this DEV | Normal user UI is the target; debug/admin payload localization is separate |
| Full platform navigation redesign | No Tracking in this DEV | Covered by `SPEC-UX-PLATFORM-001`; this DEV is state guidance only |

RD / QA / QC result:

- Phase 1 local UI implementation is complete.
- Product code changes stayed in UI presentation, wording, shared UI helpers and focused QC script maintenance.
- No DB/API/permission/state-machine, production deploy, direct data repair or historical cleanup was performed.
- Verification passed: `npx.cmd tsc --noEmit --pretty false`; `npm.cmd run lint -- --quiet`; `npm.cmd run qc:pdm-status-ui-vocabulary` 44/44; `npm.cmd run qc:pdm-numbering-search-ui` 28/28; `npm.cmd run qc:pdm-numbering-dvt-ui` 24/24; `npm.cmd run qc:pdm-numbering-report-center-ui` 22/22; `npm.cmd run qc:master-attachments` 93/93; `npm.cmd run qc:pdm-drawing-submission-ui-operation` 14/14; `npm.cmd run dev:local:check`.
- `npm.cmd run build` was blocked by the intentional local dev guard because AI_PDM was listening on port 3000; no bypass was used.
- Do not start Phase 2 scanner/checklist or Phase 3 production release without explicit authorization.

### DEV-PDM-STATUS-UX-001 全系統狀態中文化與狀態欄說明

Status: Implemented / Verification passed locally
Priority: P0 - status wording is a cross-system usability and workflow-safety defect
Type: Delivery point
Parent: `DEV-PDM-LIFECYCLE-ACTIONS-001`; `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
Authorized phase: Phase 1 local RD implementation and verification are complete. Remaining Phase 2 hardening is RD Contract Ready / Not Authorized. Production deploy, DB enum/schema rename, production migration, historical data repair and audit payload migration are not authorized.

Human Decision Brief:

- UI layer must show status in user-understandable Traditional Chinese only.
- Backend raw status codes may remain in DB/API/audit/debug, but normal UI must not expose them.
- `Released` object status is displayed as `已發布` in normal UI.
- Every user-visible table with a status column must place a unified `?` help button in the status column header.
- The `?` opens a status explanation popover; `ESC` and outside click close it.
- The `?` button must not trigger sorting, filtering, row selection or navigation.

Required docs:

- `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`
- Existing vocabulary authority: `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
- Existing object status UX context: `.ai-doc/specs/SPEC-UX-RD-LIFECYCLE-001-object-status-repair.md`

Scope:

- Add a central UI status dictionary for raw-status-to-Chinese mapping, help text, severity, terminal/actionability metadata and context separation.
- Replace visible status badges, table cells, filters and error messages in normal user UI with dictionary-backed Chinese labels.
- Add a reusable `StatusHelpPopover` / `StatusColumnHeader` or equivalent component.
- Add a status help button to every user-visible table status column.
- Provide focused QC coverage for raw enum exposure, status-column help coverage and popover behavior.

Out of scope:

- DB enum/schema rename.
- Production deploy or production migration.
- Historical data repair.
- Audit payload migration.
- Rewriting the backend lifecycle state machine.
- Full admin/debug raw payload localization.

Implementation contract:

- Suggested new files: `src/lib/status-display.ts`, `src/components/status-help-popover.tsx`.
- UI components must call the central status dictionary instead of local `statusLabels` maps or raw `{status}` rendering.
- Select option values may remain raw status codes for API compatibility, but option labels must be Chinese.
- Unknown raw statuses must show `未分類狀態` or `異常`, not the raw enum.
- Status help content must come from the same dictionary as visible labels.
- Popover behavior must support click open, `ESC` close, outside click close, focus return and mobile viewport safety.

Phase 1 acceptance:

- Normal UI no longer shows raw `Draft`, `PendingReview`, `Released`, `Obsolete`, `MainDrawingInvalid`, `ReleaseFailed`, `duplicate_active_submission`, `drawing_number_not_found` or SQL constraint messages.
- Status filters show Chinese labels.
- Every user-visible table with a `狀態` column has a `?` help button in the header.
- The help popover opens, shows Chinese status explanations, closes by `ESC`, closes by outside click, returns focus and does not trigger table actions.
- Desktop and mobile routes remain readable without overlap, clipping or horizontal overflow.

Phase 1 likely implementation surfaces:

- `src/components/lifecycle-ux.tsx`
- `src/components/dashboard.tsx`
- `src/app/numbering/drawings/page.tsx`
- `src/app/numbering/search/page.tsx`
- `src/app/parts/page.tsx`
- `src/app/submissions/[id]/page.tsx`
- `src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx`
- `src/app/upload/page.tsx`
- `src/app/bom/workbench/page.tsx`
- `src/app/numbering/tasks/page.tsx`
- `src/app/numbering/revisions/page.tsx`

Stop conditions:

- RD needs DB enum/schema migration.
- RD needs production deploy or production data repair.
- A raw status cannot be safely assigned to a user-facing context without changing workflow semantics.
- Existing table component architecture cannot safely accept a header button without a broader UI refactor.

Verification evidence:

- `npm run qc:pdm-status-ui-vocabulary` passed 44/44.
- `npx tsc --noEmit --pretty false` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Browser UI evidence on `/settings` passed: status help opens, Chinese status copy renders, `ESC` closes, outside click closes.
- Screenshot: `output/playwright/status-ui/settings-status-help-open.png`.
- Local server health after build/restart: `npm run dev:local:check` passed and reports `http://127.0.0.1:3000/`.

Phase 2 / hardening:

- Status: RD Contract Ready / Not Authorized.
- Scope: static scanner or QC rule for raw status exposure and missing status help buttons; new-module checklist; optional admin/report/debug context mapping.
- Entry condition: Phase 1 implemented and verified, then explicit authorization.
- Acceptance: new status tables and raw status labels fail focused QC unless they use the central dictionary and status help header.

Deferred Scope Audit:

- DB enum/schema rename: No Tracking; not needed for UI clarity and would create compatibility risk.
- production deploy/migration: New DEV behind release gate if later requested.
- admin/debug/audit raw payload localization: Same Spec Phase 2 if user wants it.
- future module regression prevention: Same Spec Phase 2 through scanner/checklist.

Next condition:

- Monitor APP validation feedback for status wording and status-help coverage.
- Do not start remaining Phase 2 hardening, production work, DB enum/schema rename, audit payload migration or historical data repair without explicit authorization.

### DEV-PDM-STATUS-UX-002 狀態語意分層與狀態混用修正

Status: Prepared / RD Implementation Ready / Not Authorized
Priority: P0 - status help can mislead users when one generic context explains different operational tasks
Type: Development objective / UX quality gate
Parent: `DEV-PDM-STATUS-UX-001`; `DEV-PDM-NEXT-STEP-UX-001`
Authorized phase: Documentation only. RD implementation requires explicit user authorization. Phase 2 regression hardening is RD Contract Ready / Not Authorized.

Human Decision Brief:

- UI first-layer status help must answer the user's current task, not expose all internal enum values.
- `?` status help must explain only the statuses that can appear in that column.
- Backend raw status, DB enum, API payload and audit trail remain unchanged.
- Status contexts should be split by user task: task, import row, import batch, settings lifecycle, job status, restore policy and DVT readiness.
- Columns that mix master status, phase, cost and warning chips must be renamed or visually grouped; they must not imply all chips share one status meaning.

Required docs:

- `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`
- `.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`
- Parent status vocabulary spec: `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`

Scope:

- Add or adjust presentation contexts for `task`, `importRow`, `importBatch`, `settingsLifecycle`, `jobStatus`, `restorePolicy` and `dvtReadiness`.
- Fix high-risk status help misuse in `/numbering/tasks`, `/numbering/imports`, `/settings`, `/numbering/reports`, `/numbering/approvals`, `/numbering/dvt`, BOM deleted drafts and part drafts.
- Fix mixed-column labels in parts/drawings/search surfaces where a column currently mixes status, phase and warning chips.
- Update focused QC so context mismatch and irrelevant status help can be detected.

Out of scope:

- DB enum/schema rename.
- API raw status rename.
- production deploy or production migration.
- historical data repair.
- audit/debug raw payload full localization.
- backend lifecycle state machine changes.

Implementation contract:

- `task` must not alias the full `workflowStatuses` list.
- Report/export jobs must use `jobStatus`, not `fileSync`.
- Import staging row status must use `importRow`; import batch status must use `importBatch`.
- DVT readiness must be explained separately from master-record status.
- `StatusColumnHeader context="X"` and the primary status badge in the same column must use matching context unless the column label declares mixed content.
- `待補件` in approval status wording must be normalized to `待補資料`, except where the subject is an attachment supplement.

Acceptance:

- A user opening a status `?` on each affected page sees only task-relevant statuses.
- 發行審核 keeps the 5-item first-layer help: `審核中 / 待補資料 / 阻擋 / 已核准 / 已退回`.
- 報表 job help shows `等待中 / 執行中 / 已完成 / 失敗` and does not include import/file-sync-only language.
- 匯入列 help does not include approval workflow states.
- 設定版本 help does not include release approval wording.
- DVT page clearly distinguishes DVT readiness from master-record status.
- Mixed columns are labeled as `狀態 / 階段 / 提醒` or equivalent.

Stop conditions:

- RD needs DB/API/schema migration.
- RD needs to change workflow semantics for approval/release/master lifecycle.
- RD needs production deploy, production migration, historical repair or direct DB mutation.
- A page's column structure cannot be adjusted without broader redesign.

Evidence required:

- `npx.cmd tsc --noEmit --pretty false`.
- `npm.cmd run lint -- --quiet` or touched-file lint.
- Focused status context QC command.
- Playwright screenshots and popover-label evidence for high-risk routes: tasks, imports, settings, reports, approvals and dvt.

Deferred Scope Audit:

- DB enum/schema rename: No Tracking; UI clarity does not require data-layer rename.
- production deploy/migration: New DEV behind release gate if requested.
- audit/debug raw payload localization: Same Spec Phase 2 or New DEV if user expands scope.
- historical data repair: Blocked Human Re-entry; requires explicit repair scope and authorization.
- regression scanner hardening: Same Spec Phase 2; not authorized.

Next condition:

- Wait for explicit RD authorization such as `執行開發`.
- If authorized, implement Phase 1 only; do not start Phase 2 scanner hardening unless separately approved.

### DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002 圖面送審工作台與發行未完成恢復流程

Status: Implemented / Verification passed locally for Phase 1; Phase 2+ RD Contract Ready
Priority: P0 - same-revision dead-end and release-incomplete recovery blocks the drawing submission workflow
Type: Delivery point
Parent: `DEV-PDM-DRAWING-PART-WORKBENCH-001`
Amends: `DEV-PDM-SUBMISSION-CONFLICT-001`
Authorized phase: Phase 1 local RD implementation and verification are complete. Phase 2+ is documented for continuity but is not authorized for RD implementation. Production deploy, production migration, direct DB cleanup, historical data repair and data deletion are not authorized.

Human decisions:

- 送審入口保留在圖號模組 / 圖料模組；送審工作台可獨立成頁。
- Phase 1 route target is `/drawings/[drawingNumber]/submission-workbench`; legacy `/upload?source=drawing...` may remain only for compatibility.
- Workbench uses drawing number as the primary object and carries root / primary part context.
- Phase 1 workbench shows `送審條件`, `既有紀錄 / 阻擋`, and `送審動作`.
- Same drawing + revision history is shown only when relevant; full history is deferred.
- Pending can be cancelled by submitter, R&D Manager or Admin and becomes `Cancelled`.
- ReleaseFailed means user-facing `發行未完成`, not a generic duplicate; unresolved ReleaseFailed blocks until manager/admin retry or return-for-correction.
- Resolved ReleaseFailed remains historically visible but no longer blocks and must not appear in main todo.
- All UI layer copy must be human-readable Traditional Chinese and must not expose internal codes.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
- `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`
- Background: `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`
- Background: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- Existing ADR authority with this spec's amendment: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

Current local implementation and verification status:

- Implemented and covered by local verification gates:
  - `db/schema.sql`, `src/lib/db.ts`, `src/lib/types.ts` include `Cancelled` and release-recovery fields / indexes.
  - `src/lib/repositories/submission-status-async-repository.ts`, `src/lib/submission-status-async.ts` include Pending cancellation and release-resolution support.
  - `src/lib/repositories/submission-write-async-repository.ts` narrows same-revision duplicate checks to blocking statuses.
  - `src/lib/drawing-submission-workbench.ts` implements same-revision classification, same-revision history response fields and return-for-correction service logic.
  - `src/lib/submission-release-workflow.ts` exists as a shared release workflow wrapper.
  - `src/app/api/submissions/[id]/approve/route.ts` is partially refactored toward the shared release workflow.
  - `src/app/api/submissions/[id]/cancel/route.ts` exists for Pending cancellation.
  - `src/app/drawings/[drawingNumber]/submission-workbench/page.tsx` exists as the canonical drawing submission workbench page.
  - `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts` exists for the canonical workbench API.
  - `src/app/api/submissions/[id]/retry-release/route.ts` exists for R&D Manager/Admin release retry.
  - `src/app/api/submissions/[id]/return-for-correction/route.ts` exists for R&D Manager/Admin correction handoff.
  - `src/app/numbering/drawings/page.tsx` and `src/app/numbering/search/page.tsx` route submission CTAs to the canonical workbench.
  - `src/app/upload/page.tsx` is aligned to fetch the workbench API and show same-revision records/history.
  - `src/app/submissions/[id]/page.tsx` includes user-facing Chinese labels and actions for `發行未完成`, `取消送審`, `重新發行`, and `退回修正`.
  - dashboard, notification and adaptive-task feed query paths include resolved ReleaseFailed de-noising.
  - `src/lib/db-async-provider.ts`, `scripts/qc-db-provider-contract-test.mjs`, `scripts/qc-db-provider-postgres.mjs` and `src/lib/drawing-submission-workbench.ts` include a local transaction-boundary candidate so return-for-correction can create the linked Pending submission and mark the old ReleaseFailed returned-for-correction in one transaction.
  - `scripts/qc-pdm-drawing-submission-workbench-mutation.mjs` and package script `qc:pdm-drawing-submission-workbench-mutation` are the disposable-fixture mutation lifecycle gate.
- Verified in this pass:
  - `npm run qc:pdm-drawing-submission-workbench-recovery`: passed 27/27.
  - `npm run qc:pdm-drawing-submission-workbench-mutation`: passed 33/33 using temporary local fixture records; no existing D-0014/user records were mutated.
  - `npm run qc:db-provider-contract`: passed 35/35.
  - `npm run qc:db-provider-postgres`: passed 9/9, live Postgres probe skipped because `PDM_POSTGRES_URL` is not configured.
  - `npm run qc:pdm-submission-conflict-duplicate-active`: passed 14/14.
  - `npm run qc:pdm-drawing-part-workbench-security`: passed.
  - `npm run qc:pdm-drawing-submission-review-only`: passed 14/14.
  - `npx tsc --noEmit --pretty false`: passed.
  - `npm run lint`: passed.
  - `npm run build`: passed.
  - API smoke on local 3200: `GET /api/numbering/drawings/D-0014-MA1/submission-workbench` returned drawing `D-0014-MA1`, root `0014`, one `release_incomplete_conflict` blocker and recovery link `/submissions/SUB-20260701-2AEBA0CD`.
  - Browser smoke on local 3200 captured `output/playwright/pdm-drawing-submission-workbench-d0014-release-incomplete.png`: UI shows `D-0014-MA1` and `發行未完成`, not `D-0009-MA1`, `ReleaseFailed`, `duplicate_active_submission`, raw SQL or `Internal Server Error`.
  - Browser smoke on local 3200 captured `output/playwright/pdm-submission-detail-d0014-release-failed-recovery.png`: submission detail `SUB-20260701-2AEBA0CD` loads, shows `D-0014-MA1` and `發行未完成`, and does not show `送審明細讀取失敗`.
- Remaining Phase 1 local gates:
  - None. Future work requires APP validation feedback or explicit Phase 2 authorization.

Scope:

- Add `/drawings/[drawingNumber]/submission-workbench`.
- Prefer the new workbench route from 圖號 / 圖料 module submission CTAs.
- Reclassify same-revision records into `same_revision_in_progress`, `release_incomplete_conflict`, `released_revision_exists`, `obsolete_revision_locked`, and non-blocking history.
- Add or support `Cancelled` status for pre-release cancellation.
- Add Pending cancel endpoint/action for submitter, R&D Manager and Admin.
- Add ReleaseFailed retry-release endpoint/action for R&D Manager and Admin.
- Add ReleaseFailed return-for-correction endpoint/action that creates a linked new working submission.
- Add resolution relation so a successful linked release resolves the old ReleaseFailed and removes it from blockers/todo.
- Add focused QC commands for Phase 1 non-mutating behavior and disposable mutation lifecycle behavior.

Out of scope:

- Master-data completion/writeback in the workbench.
- Attachment upload/writeback in the workbench.
- Collaborative editing.
- Full dashboard/todo refactor beyond excluding resolved ReleaseFailed where touched by Phase 1.
- Full drawing submission history page.
- Production deploy or production migration.
- Direct DB cleanup, historical data repair or data deletion.

Phase 2+ RD handoff contract:

- Phase 2 purpose: allow users to finish submission-required master data and drawing attachments in the workbench while preserving owner-domain APIs and immutable submission snapshots.
- Phase 2 scope: primary part relation, part name, material, surface finish, optional existing owner-supported process/product/variant fields, drawing attachment upload, writeback summary, save-and-submit ordering, stale-version protection and Chinese visible errors.
- Phase 2 boundary: not executable until Phase 1 is implemented/verified and user or PM authorizes Phase 2. It must not create a second master-data source, must not patch Released/Obsolete records inline, and must not require production storage migration.
- Phase 3 purpose: support多人協作完成圖料送審準備 and reduce dashboard/todo noise.
- Phase 3 scope: collaboration toggle, invited same-company collaborators, owner-domain permission checks per field, operational edit history, automatic collaboration close on submission/cancel/manager close, resolved ReleaseFailed hidden from main todo but visible in low-weight history.
- Phase 3 boundary: not executable until Phase 2 is implemented/verified and user or PM authorizes Phase 3. It must not allow unrestricted cross-company visibility, unrestricted editing, or hiding unresolved actionable work.
- Phase 4 purpose: production cutover, compatibility cleanup and historical repair. It is parked behind a release gate and cannot be executed from this DEV without separate approval.
- Phase 2/3/4 handoff coverage: each phase has purpose, outputs, scope, out of scope, implementation/data/API/permission/state-machine impact, dependencies, entry conditions, acceptance, QA/QC gate, stop conditions, evidence required, deferred decisions and recovery conditions in `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.5.
- Latest All-Phase Gate closure: Section 4.5 records that Phase 1 is the only authorized implementation scope; Phase 2 and Phase 3 are RD Contract Ready only; Phase 4 is Release Gate Contract Ready / parked; continuation commands must not start Phase 2+ unless this task board is explicitly updated.

Acceptance:

- 圖號 module `送審` opens `/drawings/[drawingNumber]/submission-workbench`.
- 圖料 module resolves/selects a drawing before opening the same workbench.
- Pending/Releasing same-revision blocks with Chinese `此圖號版次正在送審或發行中...`.
- Unresolved ReleaseFailed blocks with Chinese `發行未完成...需要主管或 Admin 處理`.
- Released/Obsolete same-revision blocks with Chinese `此圖號版次已進入正式紀錄...`.
- Rejected/Cancelled/pre-approval unfinished records show non-blocking history.
- Resolved ReleaseFailed shows low-weight history and does not block.
- Submitter/R&D Manager/Admin can cancel Pending; other Engineer cannot.
- R&D Manager/Admin can retry ReleaseFailed.
- R&D Manager/Admin can return ReleaseFailed for correction and create linked Pending submission.
- Linked successful release resolves old ReleaseFailed and removes it from blockers/todo.
- UI does not expose internal codes or raw DB errors in normal flow.

Stop conditions:

- RD needs production DB mutation, cleanup, migration or deployment.
- Current schema cannot add required state/fields without destructive migration.
- Current release service cannot safely retry release without changing production/integration configuration.
- Permission model cannot determine submitter, R&D Manager or Admin authority.
- Same-revision classification would require allowing duplicate active Pending submissions.

Evidence captured:

- QA plan: `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Focused QC: `npm run qc:pdm-drawing-submission-workbench-recovery`
- Disposable mutation lifecycle QC: `npm run qc:pdm-drawing-submission-workbench-mutation`
- DB provider transaction validation: `npm run qc:db-provider-contract`, `npm run qc:db-provider-postgres`
- Regression: `npm run qc:pdm-submission-conflict-duplicate-active`
- Regression: `npm run qc:pdm-drawing-part-workbench-security`
- Browser evidence captured for D-0014 release-incomplete blocker and submission detail recovery.
- Disposable mutation lifecycle evidence captured for ready/in-progress/terminal/non-blocking states plus cancel Pending, retry ReleaseFailed, return-for-correction and resolved ReleaseFailed history.

Next condition:

- Monitor APP validation feedback for Phase 1.
- Phase 2 can be opened only after Phase 1 is implemented/verified and explicitly authorized.
- Phase 3 can be opened only after Phase 2 is implemented/verified and explicitly authorized.
- Phase 4 production/cutover/historical repair requires separate release-gate approval.

### DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003 發行未完成 UI 自救流程

Status: Implemented / verification passed locally
Priority: P0 - release-incomplete still requires UI-level user recovery; D-0014-like failures should not require RD/API/manual repair
Type: Delivery point
Parent: `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
Authorized phase: User/PM authorized RD implementation on 2026-07-02 through `執行開發`. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved.

Human Decision Brief:

- Confirmed gap: the D-0014-MA1 failure could not be fully resolved through front-end UI before the backend/service correction.
- Confirmed target: users must be able to diagnose release-incomplete, fix drawing attachments, preview corrected package and create corrected submission through UI.
- Confirmed boundary: UI may organize and submit drawing-owned attachments; it must not overwrite released evidence, weaken release conflict guard, or become a second master-data source.
- Confirmed language: all normal UI copy must be user-understandable Traditional Chinese; raw internal codes and SQL/constraint messages are forbidden in normal UI.
- Rejected: ask users to rely on RD/API/database repair for normal release-incomplete recovery.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`
- `.ai-doc/qa/qa-pdm-drawing-submission-ui-operation-validation-plan-2026-07-02.md`
- Parent: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
- Parent QA: `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`

Scope:

- Release-incomplete recovery panel with conflict filename and conflicting formal record.
- Attachment organizer in the drawing submission workbench.
- Upload and soft-delete actions through drawing attachment owner APIs.
- Release preflight for selected attachment IDs.
- Correction preview showing included new attachments and excluded failed-package attachments.
- Return-for-correction with explicit selected attachment IDs.
- Same-revision workflow map and role-aware primary CTA / disabled reason.

Out of scope:

- Production deploy or production migration.
- Direct DB cleanup, historical repair or data deletion.
- Overwriting released packages or another item's released file.
- Full collaboration implementation.
- Full dashboard redesign.
- Google Drive production file movement outside the existing release integration.

Implementation contract summary:

- Workbench API must expose release-incomplete recovery summary in human-usable form.
- Preflight must re-check selected drawing attachments for eligibility, source ownership, duplicate selected filenames and released filename conflicts.
- `return-for-correction` must accept selected current drawing attachment IDs or equivalent explicit selection; service must not blindly copy failed submission files.
- Corrected submission files must retain `source_master_attachment_id`.
- Successful corrected release must resolve related unresolved same drawing + revision ReleaseFailed records.
- UI must show who can act when the current user lacks permission.

Implementation result:

- Drawing submission workbench now contains a drawing-owned attachment organizer for allowed states and locks attachment edit/select/note controls when the same revision is already formal or otherwise blocked by controlled same-revision conflict.
- Release-incomplete recovery mode remains editable: users can remove wrong drawing attachments, upload corrected drawing-owned attachments, select the corrected set and create a linked correction submission.
- Released filename conflict is exposed per attachment and re-checked server-side at submit/correction time.
- `return-for-correction` accepts explicit `selectedAttachmentIds`; correction packages are rebuilt from current drawing attachments instead of blindly copying failed release files.
- Successful corrected release resolves other unresolved same drawing + revision ReleaseFailed rows and keeps resolution audit.
- Submission detail now directs attachment/filename failures to the workbench instead of offering a blind one-click correction path.

Acceptance:

- D-0014-like stuck flow can be resolved with UI steps only: fix attachments, preview corrected package, create correction submission, approve/release.
- Conflict diagnosis shows human Chinese message, conflict filename and conflicting formal record.
- Submit/correction CTAs are disabled with clear reasons when selected attachments still conflict or permissions are insufficient.
- Resolved release-incomplete records appear as low-weight handled history and do not block.
- Normal UI does not show `DUPLICATE_RELEASE_FILENAME`, `ReleaseFailed`, `UNIQUE constraint failed`, stack traces, SQL, `Internal Server Error`, or raw `/api/...` errors.

Stop conditions:

- RD needs production migration/deploy, direct DB mutation, data deletion or historical repair.
- UI cannot identify source drawing attachment ownership.
- Permission model cannot decide attachment manage / correction / release authority.
- Implementation would allow overwriting or ignoring released filename conflicts.

Verification evidence captured:

- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run qc:pdm-drawing-submission-workbench-recovery`
- `npm run qc:pdm-drawing-submission-review-only`
- `npm run qc:pdm-drawing-submission-ui-self-recovery`
- `npm run qc:pdm-drawing-submission-ui-operation`: passed 14/14. Covers UI login, QC-owned drawing entry, legacy route compatibility, retired generic upload, fixture detail identity, ready/no-attachment/blocker states, Pending/Releasing/Released/history UI, release-incomplete correction flow, permission denial, detail-page states and RWD overflow checks. Route-mocked scenarios are labeled as UI contract simulation and do not claim backend persistence proof.
- 2026-07-02 validation-plan correction after clean local data reset: first run failed 10/14 because the plan incorrectly required legacy `D-0014-MA1` data. RD root cause used HCS `#多層次分析`: case layer = D-0014 locator timeout, data layer = blank master/submission tables, process layer = QA confused historical incident data with executable fixture data, governance layer = QC runner normalized recreating old data instead of challenging the plan. Correction: the QA plan and `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs` now use QC-owned `D-QC-SUBMIT-MA1`; D-0014 is documented only as historical context and must not be a required fixture. The runner removes QC-owned fixture rows and local files after browser evidence is captured, whether the fixture was created in the current run or found from an interrupted previous run. Re-run passed `npm run qc:pdm-drawing-submission-ui-operation` 14/14; `npm run dev:local:check`, `node --check scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`, and `npm run lint -- --quiet` also passed.
- `npm run dev:local:check`
- Authenticated Playwright smoke: QC-owned released state hides upload/remove controls, locks selection/note, and shows Chinese formal-record blocker.
- Mocked Playwright smoke: release-incomplete state shows attachment organizer, keeps corrected attachment selectable, blocks conflicting attachment, keeps note editable, shows `建立修正送審`, and hides raw `DUPLICATE_RELEASE_FILENAME` / `rev`.
- UI-only operation report:
  - `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`
  - `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.json`
- Browser screenshots:
  - `output/playwright/d0014-workbench-ui-self-recovery-after-release.png`
  - `output/playwright/mock-release-incomplete-ui-self-recovery.png`
  - `output/playwright/d0014-released-detail-ui-self-recovery.png`
  - `output/playwright/ui-operation-scenarios/REAL-001-qc-submit-drawing-entry.png`
  - `output/playwright/ui-operation-scenarios/REAL-004-qc-submit-submission-detail.png`
  - `output/playwright/ui-operation-scenarios/MOCK-RELFAIL-001-correction-flow.png`

Next condition:

- Monitor APP validation feedback.
- Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement require separate authorization.

### DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P Phase 2+ RD Handoff Package

Status: Prepared / RD Contract Ready
Priority: P1 - preserves the long-term drawing submission architecture but is not executable until Phase 1 is complete and explicitly authorized.
Type: Delivery point phase handoff
Parent: `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
Authorized phase: Documentation and future handoff only. No Phase 2, Phase 3 or Phase 4 implementation is authorized from this row. Continuation commands must not start Phase 2+ unless the user or PM explicitly changes this authorization boundary.

Human Decision Brief:

- Confirmed: 送審入口保留在圖號 / 圖料模組；送審工作台可以是獨立頁面。
- Confirmed: workbench may later support completing required submission data in the same user flow, but owner domains remain authoritative.
- Confirmed: some drawing/part preparation needs多人協作; collaboration must be intentionally opened, not always public.
- Confirmed: normal UI language must be user-understandable Traditional Chinese.
- Rejected: make generic `/upload` the primary formal submission page.
- Rejected: make the workbench a second master-data source.
- Rejected: delete failed or stuck submissions to clean the workflow.
- AI assumption: exact table/route names are RD-owned as long as owner-domain, permission, transaction, idempotency and snapshot contracts are preserved.
- Re-entry triggers: changing data ownership, broadening collaboration visibility, requiring production migration/deploy, direct DB repair, data deletion, cost-incurring external storage/CAD/OCR service, or altering when records become controlled evidence.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.5.
- `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md` Section 5.
- Background authority: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`.

Scope:

- Phase 2 contract: workbench master-data completion, owner-domain writeback, drawing attachment-library upload, writeback summary, stale-version protection and immutable snapshot after writeback.
- Phase 3 contract: collaboration toggle, invited same-company collaborators, per-field owner-domain permissions, operational edit history, collaboration close rules, and dashboard/todo de-noising.
- Phase 4 contract: compatibility cleanup, production migration/cutover planning, historical stuck-record classification, backup/rollback and release-gate evidence.

Out of scope:

- Implementing Phase 2+ now.
- Allowing inline edits to Released/Obsolete data to bypass controlled change flow.
- Cross-company unrestricted collaboration.
- Full real-time co-editing, chat, notifications or audit-report UI.
- Production deploy, production migration, direct DB cleanup, historical repair or data deletion.

Implementation contract summary:

- Phase 2 must write through owner APIs, then re-read/revalidate before creating a submission snapshot.
- Phase 2 attachment upload must land in the drawing attachment library before submission creation.
- Phase 2 save-and-submit must be idempotent and must not create a Pending submission if writeback or blocker validation fails.
- Phase 3 collaboration access controls who may enter the shared workbench; owner-domain permission still controls which fields can be edited.
- Phase 3 operational edit history is preparation accountability, not formal controlled release evidence.
- Phase 4 must use deployment/release gate, additive migration, dry-run classification, backup, rollback and smoke evidence before any production change.

Data / API / permission / state-machine impact:

- Data impact is additive: owner data stays in drawing/part/root-link domains; submission snapshot remains immutable; collaboration tables are optional operational records only.
- API impact is additive: workbench writeback, attachment, submit and collaboration endpoints may be added, but must not replace owner-domain APIs.
- Permission impact is layered: company scope, workbench access, owner-domain field permission, submit permission and manager/admin recovery authority are checked independently.
- State impact: Phase 2 adds preparation/writeback flow but no new formal submission status; Phase 3 may add operational draft states; Phase 4 may add migration classifications but cannot reinterpret Released/Obsolete as reusable.

Acceptance:

- Phase 2 is ready for RD only when Phase 1 is implemented/verified, owner APIs exist for required fields, stale-version protection is possible, and no production storage/migration dependency is needed.
- Phase 3 is ready for RD only when Phase 2 is implemented/verified, collaborator field permissions can be evaluated server-side, and dashboard/todo queries can safely separate actionable work from history.
- Phase 4 is ready for release planning only when target identity, backup/rollback, dry-run classification and release-gate approval exist.
- Future RD can read this row plus the spec and identify scope, out-of-scope, implementation contract, data/API/permission/state impact, dependencies, acceptance, QA/QC gate, stop conditions, evidence and recovery conditions without returning to chat history.

Stop conditions:

- Any future phase needs production deploy, production migration, direct DB mutation, data deletion or destructive repair.
- Owner-domain APIs cannot preserve source-of-truth boundaries.
- Stale overwrite protection cannot be enforced.
- Collaboration would broaden company visibility or bypass field permissions.
- Dashboard/todo de-noising would hide unresolved actionable work.
- Historical records cannot be classified deterministically.

Evidence required when a future phase is authorized:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Existing Phase 1 focused QC and regression gates.
- Phase-specific focused QC:
  - Phase 2 suggested: `npm run qc:pdm-drawing-submission-workbench-writeback`
  - Phase 3 suggested: `npm run qc:pdm-drawing-submission-workbench-collaboration`
  - Phase 4: migration dry-run report, backup/rollback plan, local/staging smoke and release-gate evidence.
- Browser/API evidence for the phase-specific happy path, permission-denied path, stale/conflict path and forbidden internal-string negative check.

Next condition:

- Do not start this package automatically. Open Phase 2 only after the user or PM explicitly authorizes Phase 2.

### DEV-PDM-SUBMISSION-CONFLICT-001 Duplicate active submission conflict classification

Status: Implemented / Verification passed locally
Type: Development objective
Parent: `DEV-PDM-DRAWING-PART-WORKBENCH-001`
Authorized phase: Local RD implementation and verification are complete. Production deploy, production migration, direct DB cleanup, historical duplicate repair and data deletion are not authorized.

Human decisions:

- `duplicate_active_submission` must not be classified as `主資料未完成`.
- Duplicate active drawing + revision submission is blocked, not warning-only.
- Error messages must be human-readable Traditional Chinese.
- Blocked and failed attempts retain audit trail.
- Reviewer approval must be guarded if legacy/race duplicate active submissions exist.
- Old generic upload submission flow remains retired from formal submission.

Required docs:

- `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`
- `.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`
- Amended parent spec: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- Existing ADR authority: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

RD implementation plan:

- Follow `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md` Section 12.
- Implement in this order: blocker grouping contract, existing-submission query, readiness classification, submit-time duplicate guard, DB uniqueness fallback shielding, UI grouped blocker state, reviewer approval/release guard, focused QC command.
- The idempotency branch must run before duplicate-conflict classification so same-key retries do not become false duplicate errors.
- The duplicate active guard must run before file storage and submission creation so a blocked duplicate cannot leave orphaned submission files.
- Reviewer-side blocking is defensive for legacy/race data only; normal duplicate prevention belongs at readiness and submit-time.

Implementation summary:

- `src/lib/drawing-submission-workbench.ts` adds blocker groups, existing-submission summary, structured workbench error options, duplicate conflict audit payload, submit-time duplicate guard before file storage/submission creation, DB uniqueness fallback mapping, and reviewer duplicate active guard helper.
- `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts` returns grouped Chinese domain errors with `code`, `group`, `existingSubmission`, recovery data and no raw generic 500 message.
- `src/app/upload/page.tsx` groups blockers by `submission_conflict`, `master_data_missing`, `attachment_conflict`, `state_or_permission_blocked` and `system_recoverable`; duplicate conflicts no longer render under `主資料尚未完成`.
- `src/app/api/submissions/[id]/approve/route.ts` blocks reviewer approve/release when duplicate active submissions exist and records `submission.review.blocked_duplicate_active`.
- `src/components/dashboard.tsx` prefers API `message` over internal `error` code for reviewer action failures.
- `scripts/qc-pdm-submission-conflict-duplicate-active.mjs` and package script `qc:pdm-submission-conflict-duplicate-active` provide focused contract QC.

Scope:

- Add readiness blocker group classification.
- Classify `duplicate_active_submission` as `submission_conflict`.
- Keep duplicate active drawing + revision blocking at readiness and submit-time.
- Map legacy `DRAWING_SUBMISSION_DUPLICATE_REVISION` and DB uniqueness failures to human Chinese `submission_conflict`.
- Show existing submission summary and recovery CTA when resolvable.
- Ensure idempotency replay is not misclassified as duplicate conflict.
- Add reviewer-side guard so legacy duplicate active records cannot be approved/released.
- Preserve blocked-attempt audit evidence.

Out of scope:

- Production deploy.
- Production schema migration.
- Direct DB cleanup or historical duplicate repair.
- Warning-only duplicate active submission.
- Reopening generic `/upload` as formal submission.
- Full approval workflow redesign.
- New terminal-status same-revision reuse policy.

Acceptance:

- `duplicate_active_submission` never appears under `主資料未完成`.
- Readiness API returns `group: "submission_conflict"` for duplicate active submission.
- Submit API returns 409 with Chinese message, no raw DB error, and no second Pending submission.
- Same-key idempotent replay returns the existing created submission behavior.
- Different-key parallel duplicate creates at most one active submission and audits the blocked attempt.
- UI provides recovery CTA to existing submission or source workflow.
- Reviewer approval/release is disabled when duplicate active submissions already exist.
- Master-data blockers and duplicate attachment blockers keep their own classifications.

Stop conditions:

- Implementation would allow duplicate active submissions and rely on reviewer judgment.
- Active vs terminal submission statuses cannot be determined without changing lifecycle policy.
- Reviewer guard requires a product decision because no safe reject/return/cancel path exists.
- RD needs production deploy, production migration, direct DB mutation, historical cleanup or data deletion.

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14 after updating the duplicate-prevention expectation from legacy `DRAWING_SUBMISSION_DUPLICATE_REVISION` to `duplicate_active_submission`.
- `npm run qc:pdm-drawing-part-workbench-security`: passed.
- `npm run qc:pdm-submission-conflict-duplicate-active`: passed 10/10.
- Browser smoke evidence captured for duplicate conflict state:
  - `output/playwright/pdm-submission-conflict-duplicate-desktop.png`: D-0014-MA1 shows `已有進行中的送審`, existing submission summary, disabled submit reason, and no `主資料尚未完成` duplicate misclassification.
  - `output/playwright/pdm-submission-conflict-mobile.png`: same duplicate conflict state on 390px mobile viewport, with no duplicate-as-master-data wording.
- Browser UI contract evidence captured with Playwright route mock:
  - `output/playwright/pdm-submission-conflict-ready-desktop.png`: ready state shows enabled-ready copy after note and attachment conditions pass.
  - `output/playwright/pdm-submission-conflict-note-required.png`: note-missing state shows note-specific disabled reason.
  - `output/playwright/pdm-submission-conflict-mixed-blockers.png`: mixed blocker state separates `已有進行中的送審` from `主資料尚未完成`.
- Reviewer legacy duplicate browser fixture remains recommended for APP validation when disposable duplicate-active data can be created safely; local reviewer guard is covered by API implementation and focused QC.

Next condition:

- Monitor user APP validation feedback. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved.

### DEV-PDM-DRAWING-PART-WORKBENCH-001 圖料模組資料流與送審安全架構

Status: Implemented / Verification passed locally
Type: Delivery point
Authorized phase: Local RD implementation and verification completed. Production deploy, production migration, direct DB cleanup, data deletion and existing-data repair are not authorized.

Human decisions:

- 圖號模組維持「以圖為主」。
- 圖料模組升級為主根號 / 圖料關聯 / 送審準備工作台。
- 圖料模組可 inline 編輯圖號與料號欄位，但寫入必須走 owner domain API、validation and audit。
- 送審時保存 immutable submission snapshot。
- 送審 gate 採前端顯示、後端強制、DB constraint 三層防線。
- 同一送審包不允許相同 `file_role + original_filename` 附件；必須用人類中文阻擋。
- 失敗送審保留 audit trail。
- 舊 `/upload` 上傳送審頁完全退役，不再作為正式送審入口。

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
- `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`
- Superseded context: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
- Layout baseline: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`

Scope:

- Upgrade 圖料模組 to show root, primary drawing, primary part, owner-labeled master fields, attachments and submission readiness.
- Allow inline edit in 圖料模組 while routing writes to drawing/part/root/link owner APIs.
- Add server-side submission readiness contract and blocker codes.
- Add duplicate attachment filename blocker before DB insert.
- Retire the old generic `/upload` UI from formal submission flow.
- Retire normal web/session formal creation through generic `POST /api/submissions`.
- Route drawing/part shortcuts into 圖料模組 readiness instead of generic upload.
- Create immutable submission snapshot on successful submission.
- Persist canonical snapshot version/hash/rules/source evidence.
- Add submission attempt idempotency and blocked/failed/created audit behavior.
- Block ambiguous root/drawing/part relationships instead of guessing.
- Separate storage identity from display filename to prevent overwrite/collision.
- Preserve source drawing/source part/source attachment traceability.
- Audit owner edits, blocked submit attempts, failed submit attempts and snapshot creation.

Out of scope:

- Production deploy.
- Supabase production cutover or remote schema migration.
- Direct DB cleanup, data deletion, or repair of existing failed submissions.
- CAD file mutation or automatic filename rewrite.
- SolidWorks Document Manager integration.
- Approval workflow redesign.
- Allowing duplicate attachment filenames.

Acceptance:

- 圖號模組 remains drawing-focused.
- 圖料模組 is the formal root/drawing/part submission-preparation entry.
- Inline edits are persisted through owner APIs and leave audit evidence.
- Backend readiness returns Chinese blockers and controls the actual submit state.
- Same `file_role + original_filename` selection is blocked with a Chinese message before DB failure.
- `/upload` no longer renders the generic upload/send-review form.
- Generic `POST /api/submissions` cannot create formal submissions for the retired workflow.
- Drawing detail `送審` shortcut opens 圖料 readiness for the selected drawing/root.
- Ambiguous root, multiple primary drawings, and multiple primary parts block submission with Chinese recovery messages.
- Successful submit creates Pending submission plus canonical immutable snapshot/hash.
- Same idempotency key returns existing created submission; parallel/different-key duplicate active submission is blocked.
- Attachment storage keys include immutable ids and cannot overwrite existing files.
- Released master data cannot be patched inline to make submission pass.
- Failed/blocked submit attempts leave audit trail.
- No raw DB constraint, SQL table/column, stack trace or `Internal Server Error` appears in user-facing flow.

Stop conditions:

- RD would need to patch master data on a generic upload page.
- RD would need to allow or auto-rename duplicate attachment filenames.
- RD would need production deploy, production migration, direct DB mutation, data cleanup or data deletion.
- Owner APIs cannot enforce validation/audit and implementation would directly write owner tables from 圖料 UI.
- Snapshot cannot be created without destructive migration.

Evidence required:

- `npx tsc --noEmit`
- `npm run lint -- --quiet`
- `npm run build`
- `npm run qc:pdm-numbering-api-regression`
- `npm run qc:pdm-drawing-submission-review-only`
- Focused QC to add/update: `npm run qc:pdm-drawing-part-workbench-security`
- Browser screenshots for readiness ready/blocker, duplicate attachment blocker, retired `/upload`, successful submission and mobile viewport.
- Focused negative evidence for direct generic API bypass, owner API rejection, stale version conflict, ambiguous relationships, parallel submit, storage-key collision and released-record edit blocking.

Evidence captured 2026-07-01:

- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-drawing-part-workbench-security`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14 after updating the route expectation from retired `/upload?source=drawing` to controlled `/numbering/submissions/drawings/[drawingNumber]`.
- `npm run qc:pdm-numbering-api-regression` with temporary `PDM_BASE_URL=http://127.0.0.1:3100`: passed; temporary server was stopped after QC.
- Retired `/upload` browser screenshot: `output/playwright/pdm-upload-retired-desktop.png`.
- Existing same-day drawing submission APP evidence retained: `output/playwright/pdm-drawing-master-data-edit-desktop.png`, `output/playwright/pdm-drawing-submission-note-required.png`, `output/playwright/pdm-drawing-submission-ready.png`, `output/playwright/pdm-drawing-submission-duplicate-blocker.png`.

Next condition:

- Monitor user APP validation feedback. Production deploy, production migration, direct DB cleanup, data deletion and existing-data repair remain unapproved.

### DEV-PDM-DRAWING-SUBMISSION-001 Drawing-source Review-only Submission

Status: Implemented / Verification passed
Type: Delivery point
Authorized phase: Local implementation and local/browser QC completed. Production deployment remains out of scope.

Human decision:

- `送審階段不應該再補資料，這些應該都在圖號模組完成`.
- Drawing module owns drawing/part master data.
- Submission page only confirms review package, selected source attachments and review note.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
- `.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`
- Existing auxiliary upload QA for regression only: `.ai-doc/qa/qa-windows-upload-validation-plan-2026-05-26.md`

Scope:

- Change drawing detail `送審` from generic blank upload to drawing-source review-only submission workflow.
- Resolve drawing, primary linked part, material, surface treatment, source attachment candidates and suggested revision from server-side master data.
- Hide/forbid editable PDM master fields in drawing-source submission mode.
- Block submission when required master data or attachments are missing, with recovery links back to drawing/part master surfaces.
- Create Pending submission from selected drawing master attachments and server-derived master data.
- Preserve traceability to source drawing and source master attachment(s).
- Preserve generic `/upload` as auxiliary/manual intake unless a separate task retires it.

Out of scope:

- Removing generic `/upload`.
- Editing drawing/part master data inside the submission page.
- Production deploy or production schema migration.
- Supabase production cutover.
- SolidWorks Document Manager integration.
- CAD file mutation.
- Approval workflow redesign beyond existing one-reviewer/default matrix behavior.

Acceptance:

- From drawing detail `D-0014-MA1`, clicking `送審` opens a drawing-source review-only submission screen, not a blank generic upload form.
- Page clearly displays `送審來源：D-0014-MA1`.
- No editable inputs for `圖號`, `料號`, `品名`, `版次`, `材質`, `表面處理`, or `文件類型` appear in drawing-source mode.
- Missing linked part/material/surface/attachment disables `送出審核` and links to the correct master-data recovery surface.
- Successful submit creates exactly one Pending submission derived from master data and selected attachment(s).
- Duplicate active same drawing/revision submission is blocked.
- Generic `/upload` remains available outside `source=drawing`.

Stop conditions:

- RD would need to let users patch master data inside submission page.
- Existing master data cannot supply required material/surface without a separate schema task.
- File handling would require destructive moves rather than safe copy/reference.
- Production migration/deploy becomes required.

Evidence required:

- `npx tsc --noEmit` passed on 2026-06-30.
- `npm run lint -- --quiet` passed on 2026-06-30.
- `npm run build` passed on 2026-06-30.
- `npm run qc:pdm-drawing-submission-review-only` passed 12/12 checks on 2026-06-30.
- `npm run qc:pdm-change-control` passed 56/56 checks on 2026-06-30.
- `PDM_BASE_URL=http://127.0.0.1:3001 npm run qc:pdm-numbering-api-regression` passed 27/27 checks on 2026-06-30. The first run without `PDM_BASE_URL` failed because the script defaults to port 3100, not due to product behavior.
- Continuation audit on 2026-06-30 reran the required local gates: `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, `npm run qc:pdm-drawing-submission-review-only`, `npm run qc:pdm-change-control`, and `PDM_BASE_URL=http://127.0.0.1:3000 npm run qc:pdm-numbering-api-regression`; all passed.
- Browser smoke against `http://127.0.0.1:3001`: `/upload?source=drawing&drawingNumber=D-0014-MA1` showed `圖面送審`, `送審來源：D-0014-MA1`, no generic `Windows 檔案送審`, no `2. PDM 屬性`, no editable text/select master-data inputs, one review-note textarea, no visible runtime/API error text, and no mobile horizontal overflow.
- Final local smoke against `http://127.0.0.1:3000`: `/upload?source=drawing&drawingNumber=D-0014-MA1` showed `圖面送審`, `送審來源：D-0014-MA1`, no generic `Windows 檔案送審`, zero editable text/select master-data inputs, and disabled `送出審核` while blockers exist.
- Continuation browser/API smoke on `http://127.0.0.1:3000` confirmed source route title/banner, zero editable text/select master-data inputs, one review-note textarea, missing-material and missing-surface blockers, three eligible/source attachments in context API, no visible runtime/API error text, generic `/upload` still rendering `Windows 檔案送審`, mobile no horizontal overflow, and duplicate POST for existing `D-QCDRS-MR0FC6P3-MA1` returned 409 `DRAWING_SUBMISSION_DUPLICATE_REVISION`.
- API smoke with disposable local `QC-DRS-*` fixture: context blockers = 0; POST created `SUB-20260630-5FE2CE3E` revision `0.1`; trace recorded `source_entity_type=drawing_number`, `source_entity_id=qc-drs-drawing-MR0FC6P3`, `source_master_attachment_id=qc-drs-attachment-MR0FC6P3`; server-derived `material=SUS304`, `surface_finish=拋光`; duplicate POST returned 409 `DRAWING_SUBMISSION_DUPLICATE_REVISION`.

### DEV-PDM-UI-POLISH-001 Completed Scope

Status: Implemented / Verification passed.
Keep UI simple and PDM-minimum; backend may stay rigorous.

- Upload/PDM attributes warning: missing company-specific SolidWorks Document Manager or equivalent CAD metadata/reference adapter warnings are shown as concise Traditional Chinese user guidance. CAD adapter integration remains parked under `DEV-CAD-001`.
- Upload PDM attributes form: `版次` defaults to `0.1`; `產品線` is renamed to optional `產品系列`; `客戶`, `專案`, `機台`, `文件類型`, and `簽審層級` are removed from the visible form; `備註` is added; uploads default to one reviewer while backend validation still receives safe defaults.
- File selection: multiple selected files are supported; when SolidWorks files are present, `.slddrw`, `.sldasm`, and `.sldprt` are prioritized as primary metadata sources; conflicts between selected files or detected hints show visible warnings instead of silently choosing one value.
- Attachment surfaces: when attachments include SolidWorks files, the panel shows a 3D preview area. The current preview source contract is server-generated 3D derivative/thumbnail; when no derivative exists, a non-blocking fallback is shown instead of a blank area.
- Drawing governance actions: the drawing detail `圖號治理` area no longer uses `申請新圖號 / 進版`, no longer shows `申請新圖號`, and uses compact icon-free actions:
  - `開啟圖料追溯` -> `/numbering/search?query={drawing.drawingNumber}&entityType=drawing_number`
  - `檢查 MA 影響文件` -> `/numbering/impact?drawingNumber={drawing.drawingNumber}` for MA drawings only
  - `進版` -> `/numbering/revisions?drawingNumber={drawing.drawingNumber}`
  - `送審` was originally routed to `/upload`; this is now intentionally superseded by `DEV-PDM-DRAWING-SUBMISSION-001`, which requires drawing-source `送審` to be review-only rather than a generic upload form.
- `/numbering/revisions` accepts optional `drawingNumberId` and optional `drawingNumber` query parameters. If provided, the page must prefill `drawingNumberId` and show the current drawing number as context; the sidebar route without query remains valid.
- Acceptance notes: from drawing detail, `進版` directly shows the revision assessment form with the current drawing loaded; the previous generic `送審 -> /upload` behavior is not the final target and is superseded by `DEV-PDM-DRAWING-SUBMISSION-001`; governance actions remain clear on desktop without wrapping confusion, overlap, or overflow.
- Drawing revision workbench focused spec implemented: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`. `/numbering/revisions` now resolves official drawing numbers, hides editable internal IDs from users, shows drawing/part context, previews FFF outcome consequences, guides confirmed-impact replacement draft creation, and translates raw domain errors into Traditional Chinese user guidance. State: `Implemented / verification passed`.

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed.
- Browser smoke `/upload`: removed `客戶`, `專案`, `機台`, `文件類型`, and `簽審層級`; shows `產品系列`, `備註`, and revision default `0.1`.
- Browser smoke multi-file upload: SolidWorks primary badge shown; conflicting drawing/part/revision hints shown in Traditional Chinese; technical English CAD-adapter warnings hidden; screenshot `C:\Users\user\AppData\Local\Temp\upload-ui-polish-001-conflict-auth-after-revision-fix.png`.
- Browser smoke drawing attachments: `D-0014-MA1` SolidWorks attachments show non-blocking 3D preview fallback with no post-selection console errors; screenshot `C:\Users\user\AppData\Local\Temp\drawing-solidworks-preview-fallback.png`.
- Browser smoke drawing governance compact actions: screenshot `C:\Users\user\AppData\Local\Temp\drawing-governance-actions-compact.png`.

### DEV-PDM-UI-POLISH-001A Drawing Revision Workbench Focused Slice

Status: Implemented / Verification passed
Type: Development objective
Parent: `DEV-PDM-UI-POLISH-001`
Authorized phase: RD implementation executed by explicit user request on 2026-06-30.

Required docs:

- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`
- `.ai-doc/qa/qa-pdm-drawing-revision-workbench-validation-plan-2026-06-30.md`
- `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`
- `src/app/numbering/revisions/page.tsx`
- `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`
- `src/lib/pdm-change-control-domain.ts`
- `src/lib/repositories/numbering-async-repository.ts`

Scope when authorized:

- Implement `GET /api/numbering/drawings/resolve` or equivalent same-contract resolver.
- Replace editable internal ID fields in `/numbering/revisions` with official drawing/part context.
- Support query-param preload for `drawingNumberId`, `drawingNumber`, and optional `partNumber`.
- Show drawing, current part, revision suggestion, status, BOM/where-used and eligibility context.
- Convert FFF assessment into a stepper/workbench with outcome preview.
- Implement confirmed-impact branch with system-created/reused replacement draft behavior.
- Implement primary manufacturing part fallback and server-side relationship re-check.
- Translate raw domain errors into Traditional Chinese user guidance.
- Add duplicate submit guard using UI pending lock plus server equivalent-active-record guard.
- Add focused QC evidence for resolver, FFF outcomes, confirmed-impact, duplicate submit and RWD.

Implemented files:

- `src/lib/drawing-revision-workbench.ts`
- `src/app/api/numbering/drawings/resolve/route.ts`
- `src/app/api/numbering/drawing-revisions/fff-assessments/route.ts`
- `src/lib/pdm-change-control-domain.ts`
- `src/app/numbering/revisions/page.tsx`

Verification evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-change-control`: passed, 56/56.
- Browser smoke on `http://127.0.0.1:3001/numbering/revisions`: core field visible, resolver button visible, submit disabled before drawing resolution, old editable `圖號 ID` label count 0, runtime errors 0.
- Screenshot evidence: `C:\Users\user\AppData\Local\Temp\drawing-revisions-workbench.png`.

Out of scope:

- Production deploy.
- Supabase production cutover.
- Schema migration unless PM creates a separate migration task.
- CAD/OCR/SolidWorks metadata reader integration.
- Automatic CAD file mutation.
- Automatic released BOM mutation.
- Rewriting `DEV-PDM-CHANGE-CONTROL-001` domain rules.
- Creating a new drawing number from the original drawing revision flow.

Acceptance:

- `/numbering/revisions` can resolve an official drawing number such as `D-0014-MA1` without requiring UUID entry.
- Query params preload valid drawing context and reject mismatched ID/code pairs.
- UI does not expose editable `圖號 ID` or `現行料號 ID` fields in normal operation.
- No-impact, suspected-impact and confirmed-impact previews match the existing change-control rules.
- Confirmed impact cannot submit without a safe current part and replacement draft path.
- Equivalent duplicate submit does not create duplicate active replacement drafts or assessments.
- Error messages are visible, Traditional Chinese and actionable.
- Desktop and mobile screenshots show current drawing context and primary action without overlap, clipping or horizontal overflow.
- Existing `qc:pdm-change-control` and numbering API regression remain passing.

Stop conditions:

- RD needs schema migration to persist new fields.
- RD needs production, Supabase production, direct DB mutation or data migration.
- Existing domain service cannot support confirmed-impact replacement draft reuse/create behavior without changing `DEV-PDM-CHANGE-CONTROL-001` business rules.
- Resolver cannot prove company scope or safe drawing/part relationship.
- Implementation would allow confirmed impact to bypass replacement part requirements.
- CAD/OCR/SolidWorks reader dependency becomes required for v1.

Evidence required:

- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run qc:pdm-change-control`
- `npm.cmd run qc:pdm-numbering-api-regression`
- Focused command if added: `npm.cmd run qc:pdm-drawing-revision-workbench`
- Resolver API evidence.
- Duplicate submit DB/API evidence.
- Desktop and mobile screenshots for `/numbering/revisions`.
- Negative screenshot for not-found or mismatch error.
- `git diff --check` for changed source/docs.

Next condition:

- If user authorizes this focused slice, move state to `Ready / In RD` and execute through RD-QA-QC.
- If user keeps `DEV-PDM-UI-POLISH-001` intake open, retain this as prepared non-executable scope.

### DEV-PDM-DRAWING-REVISION-SUBMISSION-001 圖面進版受控送審包

Status: Implemented / verification passed locally for Phase 1, Phase 2 multi-file revision package intake, Phase 3 out-of-order revision acceptance/latest-history view and Phase 4 first-class revision attachment package model
Priority: P0 - without this, a new drawing file revision can exist in the attachment library without becoming a controlled drawing revision package
Type: Delivery point
Parent: `DEV-PDM-CHANGE-CONTROL-001`; `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
Authorization boundary:

- Phase 1 RD implementation was authorized by the user's 2026-07-03 `執行開發` instruction and is implemented locally.
- Phase 2 multi-file revision package intake was authorized by the user's 2026-07-05 `執行開發` instruction and is implemented locally.
- Phase 3 out-of-order revision acceptance and latest/history view was authorized by the user's 2026-07-05 `執行開發` instruction and is implemented locally.
- Phase 4 first-class revision attachment package model was locally implemented after the user's 2026-07-06 guided decisions and later RD execution authorization. Local schema/runtime files and SQLite bootstrap were updated; production deploy, production migration/cutover and existing-data repair were not performed.
- Phase 5 extraction assistance and Phase 6 production/historical classification are not authorized.
- Mobile-specific UX is not a delivery target; phones use the desktop/default surface, and official UI acceptance is desktop/tablet/current browser only unless the user changes this system setting.

Human Decision Brief:

- A drawing revision such as `D-0007-MA1` from `0.1` to `0.2` may be valid while the linked part number and BOM remain unchanged.
- Uploading a file to `圖號附件庫` with revision `0.2` is not enough to prove formal drawing revision.
- Formal drawing revision requires selected new drawing files, FFF judgement, revision value, reason category, Pending submission package, reviewer confirmation and release/audit evidence.
- No-impact changes such as `標註 / 文字修正` should keep part/BOM unchanged, but reviewer must confirm BOM no revision.
- Confirmed-impact changes still require replacement part draft and drawing part-number match under the existing change-control rule.
- 2026-07-05 Phase 2 decisions: upload unit is a `版次檔案包`; one revision package may contain multiple files; category is auto-classified by extension and user-correctable; completeness checks are warning-only after at least one valid package file exists; the review page/drawer must show the same warnings before approval/rejection.
- 2026-07-05 Phase 3 decision: all revisions may be entered and approved in any order; the system suggests the next likely revision, blocks duplicate formal records for the same drawing + revision, computes the latest approved revision by version comparison and moves non-latest approved revisions to history.
- 2026-07-06 Phase 4 decision: `版次檔案包` must become a first-class model with stable `packageId`; Released core package evidence is immutable; post-release supplements are child records requiring reason and approval; approved supplements display in the same attachment list with `補件` tag; ambiguous migration records are confirmed in IDE/Codex dry-run output, not a product `待確認附件` area.

Required docs:

- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-PACKAGE-001-first-class-package-and-supplement.md`
- `.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`
- `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`
- Parent change-control spec: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- Parent drawing revision UX spec: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`
- Parent drawing submission workbench spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`

Scope:

- Add `新版圖面` step to `/numbering/revisions`.
- Reuse drawing attachment library upload/select behavior for the intended new revision.
- Require at least one eligible new-revision drawing file before formal revision package submit.
- Create one Pending drawing submission package from selected attachment IDs.
- Link the FFF assessment with `drawing_revision_fff_assessments.submission_id`.
- Show preview distinguishing drawing revision, part unchanged/replacement state, BOM unchanged/reconfirmation state, selected files and reviewer action.
- Preserve same-revision blockers and release-incomplete recovery behavior.
- Phase 2: support multi-file upload/dropzone for one intended revision package.
- Phase 2: auto-classify SLDDRW/PDF/DWG/DXF/STEP/SLDPRT or equivalent files by extension and allow inline correction.
- Phase 2: show warning-only package completeness guidance on submitter preview.
- Phase 2: show the same warning codes on the review page/drawer with reviewer wording.
- Phase 3: allow lower or skipped revisions to be submitted, reviewed and approved after newer revisions exist.
- Phase 3: remove chronological order blockers from normal approval/retry-release while preserving same-revision duplicate blockers.
- Phase 3: recompute latest/history after approval and show only latest in first-level operational views.
- Phase 3: keep older approved revisions traceable in history, not in the primary current-file list.
- Phase 4: create a first-class package model with `packageId`, package file memberships and supplement request/approval records.
- Phase 4: keep Released package core immutable and model late files as approved supplements.
- Phase 4: show approved supplement files in the same main attachment list with `補件` tag/icon.
- Phase 4: implement migration dry-run from existing submissions/file assets and report ambiguous records in IDE/Codex output only.

Out of scope:

- Production deploy or production migration.
- Direct DB cleanup, historical repair or data deletion.
- CAD/OCR/SolidWorks automatic extraction as a Phase 1 or Phase 2 dependency.
- Automatic BOM version creation.
- Automatic part-number revision for no-impact changes.
- Dedicated mobile-phone UI, mobile-specific navigation or phone-first layout. Phones use the desktop/default surface.
- Rewriting `DEV-PDM-CHANGE-CONTROL-001` business rules.
- Turning optional package completeness warnings into hard blockers without explicit PM approval.
- Requiring chronological approval order.
- Allowing duplicate formal records for the same drawing + same revision.
- Direct repair of existing wrong latest/history records.
- Product UI `待確認附件` area for ambiguous migration records.
- Editing Released package core files or roles in place.

Implementation contract summary:

- Attachment upload creates drawing-owned source/staging files only; it must not mark a drawing revision as formal.
- Formal action is `建立圖面進版送審`.
- Package creation must re-check drawing, selected attachments, same-revision blockers and FFF branch guards.
- Package creation must create or reuse the drawing submission snapshot/source-attachment traceability.
- FFF assessment and Pending submission must be linked before success returns.
- If FFF assessment creation fails after Pending submission creation, the incomplete Pending submission must be cancelled with audit evidence before returning failure.
- If no-impact: original part is allowed, BOM stays unchanged, and reviewer action is `confirm_bom_no_revision`.
- If suspected-impact: reviewer must choose `confirm_original_part_reuse` or `return_for_replacement_part`.
- If confirmed-impact: replacement draft and matching drawing part-number value remain mandatory.
- Phase 2 package files are treated as one revision package, not separate formal submissions.
- Phase 2 warning logic must be shared between submitter and reviewer surfaces; only wording changes by audience.
- Phase 2 missing PDF/DWG/DXF/3D/intermediate evidence is warning-only unless no valid package file exists or an existing hard blocker applies.
- Phase 3 approval/retry-release must not fail solely because a newer different revision already exists.
- Phase 3 must keep same drawing + same revision uniqueness as a hard blocker.
- Phase 3 must use one deterministic revision comparator for next-revision suggestion, release recomputation and UI grouping.
- Phase 3 latest/history recomputation must keep a lower backfilled revision as formal history when a higher approved revision exists.
- Phase 3 first-level drawing/package/handoff/download defaults must use the computed latest unless the user explicitly opens history.
- Phase 4 package identity must be `packageId`; submission snapshot is evidence and migration seed, not the long-term package model.
- Phase 4 must enforce one effective Released package per company + drawing + revision.
- Phase 4 Released package core files/roles must be immutable.
- Phase 4 supplements must store reason, optional/required note, applicant, reviewer/Admin decision and timestamps.
- Phase 4 `內容有變更，建立新版次` supplement reason must show `應建立新版次` but not hard-block.
- Phase 4 migration must run dry-run before mutation and report ambiguous records in IDE/Codex only.

Acceptance:

- `D-0007-MA1` or QC-owned equivalent can be prepared for `0.2` as a controlled revision package without revising the linked part or BOM when FFF is no-impact.
- Uploading/selecting attachment alone does not create Pending submission, assessment or released drawing revision.
- `建立圖面進版送審` creates one Pending submission and one linked FFF assessment.
- Submission snapshot includes selected source attachment IDs and intended revision.
- Reviewer BOM no-revision confirmation is required before no-impact release.
- Confirmed-impact path remains blocked without replacement draft and drawing part-number match.
- UI copy is Traditional Chinese and does not expose raw internal codes, SQL or stack traces.
- Phase 2: one revision package can contain multiple files under the same target revision.
- Phase 2: extension-based role classification works and user correction is persisted in package evidence.
- Phase 2: missing recommended file roles do not disable submit after at least one valid package file exists.
- Phase 2: reviewer page/drawer shows the same package warning codes before approve/reject actions.
- UI acceptance targets desktop/tablet/current browser surfaces; mobile screenshots are optional sanity evidence only, not a separate supported phone UI.
- Phase 3: approving revision `0.5` after `0.6` exists succeeds as formal history and does not replace `0.6` as latest.
- Phase 3: approving revision `0.7` after `0.6` exists makes `0.7` latest and moves `0.6` into history.
- Phase 3: duplicate formal same drawing + same revision remains blocked with actionable Chinese recovery.
- Phase 3: first-level drawing/package surfaces show only the computed latest revision; older approved revisions are under history.
- Phase 3: manufacturing handoff and default download/package consumers select latest by default.
- Phase 4: package operations use `packageId`.
- Phase 4: same drawing + same revision duplicate Released package is blocked.
- Phase 4: approved supplements appear in the same package attachment list with `補件` tag/icon and audit link.
- Phase 4: `其他` supplement reason requires note; other reasons allow optional note.
- Phase 4: migration dry-run reports ambiguous records without creating product UI clutter.

QA/QC gate:

- Required QA plan: `.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`
- Verification passed locally:
  - `npx.cmd tsc --noEmit --pretty false`
  - `npm.cmd run lint -- --quiet`
  - `npm.cmd run qc:pdm-change-control` 61/61, including Phase 2 package guards and Phase 3 revision-order/latest-history guards
  - `npm.cmd run qc:pdm-drawing-submission-review-only`
  - `npm.cmd run qc:pdm-drawing-submission-workbench-mutation`
  - Existing local dev server page smoke: `/numbering/revisions` returned HTTP 200.
  - Protected workbench API smoke: unauthenticated `/api/numbering/drawings/D-0007-MA1/submission-workbench?revision=0.2` returned HTTP 401 `需要登入`.
  - Phase 2 Playwright smoke: `/numbering/revisions?drawingNumber=D-0007-MA1` shows multi-file package dropzone, selected package role, warning-only submitter guidance and no visible runtime error; `/submissions/SUB-QC-REVPKG-001` shows reviewer warnings before approve/cancel actions.
  - Screenshot evidence: `output/playwright/drawing-revision-package-p2/revision-package-submit-desktop.png`; `output/playwright/drawing-revision-package-p2/submission-review-warning-desktop.png`. The 390px screenshot is retained as optional sanity only, not mobile support evidence.
  - Phase 3 lifecycle QC: lower revision after newer latest approves into history without replacing latest; higher revision becomes latest and moves older approved revisions to history; duplicate same drawing + same revision remains blocked.
  - Phase 3 static guard: approve/retry-release/workflow paths no longer contain the old chronological `revision_release_order_conflict` blocker; duplicate formal same-revision guard remains.
  - Phase 3 UI/static guard: revision intent copy warns when the target revision is lower/higher than current latest, and `master-attachment-panel` uses the shared revision comparator for latest/history grouping.
  - Phase 4 local package model QC: `npm.cmd run qc:pdm-drawing-revision-package-model` passed 59/59, covering schema files, package repository guards, package creation/release/cancel integration, supplement APIs, approved supplement tagging, multi-file supplement UI support and migration dry-run reporting.
  - Phase 4 local regression QC: `npm.cmd run qc:pdm-change-control` passed 61/61 after the package-model implementation.
- Not run:
  - `npm.cmd run build` was blocked by the local dev-entrypoint guard because AI_PDM was already listening on `http://127.0.0.1:3000/` and `prebuild` refused to clean `.next`.
- Recommended focused command: `npm.cmd run qc:pdm-drawing-revision-submission`
- Required UI evidence: preview, missing-file blocker, no-impact package submit, linked assessment/submission, reviewer BOM no-revision confirmation and desktop/tablet/current-browser visible-error checks. Dedicated phone/mobile evidence is not required by current system setting.
- Required Phase 2 evidence: multi-file package upload, category auto-classification, inline correction persistence, warning-only submit behavior, reviewer warning parity and shared warning-code evidence.
- Phase 3 evidence covered in this local pass: lower-after-newer approval into history, higher-after-current approval becoming latest, duplicate same-revision blocker, latest/history static UI grouping, and static/API guard that chronological revision-order conflict is no longer a hard approval blocker. Manual browser evidence for every operational consumer remains recommended for APP validation but is not a separate authorization gate.
- Phase 4 local evidence now includes packageId repository/API integration, duplicate Released package negative guard, Released-core immutability guard, supplement reason/approval implementation, `補件` tag display implementation and migration dry-run reporting via `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59. Remaining recommended APP evidence: browser screenshot with real or seeded data for supplement request, approval/rejection and `補件` tag display. Focused QA plan: `.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`.

Deferred Scope Audit:

- Production deploy / Supabase production cutover: New DEV / release gate; Phase 6 parked.
- Schema migration: Same Spec Phase for local Phase 4 package model; production migration remains Blocked Human Re-entry / release gate.
- CAD/OCR/SolidWorks automatic extraction: Same Spec Phase 5, not authorized.
- Historical attachment-only records: Same Spec Phase 4 dry-run and Phase 6 production cutover; no direct repair/deletion authorized.
- Existing wrong latest/history records: New DEV / Blocked Human Re-entry; no direct repair, deletion or silent cleanup authorized by this documentation request.
- Ambiguous legacy migration records: Same Spec Phase 4; report in IDE/Codex dry-run, no product `待確認附件` UI.
- Strict chronological approval order: No Tracking, explicitly rejected by the Phase 3 product decision.
- Duplicate formal same drawing + same revision: No Tracking, explicitly rejected; same-revision changes must correct the existing package.
- Optional package completeness warnings as hard blockers: Blocked Human Re-entry; rejected for Phase 2 unless product rule changes.
- Automatic BOM revision for no-impact: No Tracking, explicitly rejected by product rule.
- Automatic part-number revision for no-impact: No Tracking, explicitly rejected by product rule.

All-Phase Coverage Matrix:

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 1 - Controlled Revision Package Integration | Authorized and implemented locally on 2026-07-03 | Implemented / verification passed locally | Integrate FFF, selected/uploaded files, Pending submission and `submission_id` link | Production, migration unless stop condition, CAD/OCR dependency, forced part/BOM revision | User `執行開發` authorization | Pending package and FFF assessment linked; no-impact keeps part/BOM unchanged with reviewer confirmation | tsc, change-control QC, drawing-submission QC, mutation QC, local page/API smoke |
| Phase 2 - Multi-File Revision Package Intake (`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2`) | Authorized and implemented locally on 2026-07-05 | Implemented / verification passed locally | Multi-file package upload, role auto-classification, inline correction, warning-only completeness, snapshot evidence and reviewer warning parity | Production, CAD/OCR extraction, optional-role hard blocking, FFF/part/BOM rule changes, dedicated mobile UI | User `執行開發` authorization | Multi-file same-revision package can submit; warnings show on submitter and reviewer pages without blocking | tsc, lint, `qc:pdm-change-control` 57/57, desktop Playwright smoke, snapshot/API/static evidence |
| Phase 3 - Out-of-Order Revision Acceptance And Latest/History View (`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3`) | Authorized and implemented locally on 2026-07-05 | Implemented / verification passed locally | Suggested next revision, out-of-order submit/approve, duplicate same-revision guard, latest/history recompute and latest-only first-level display | Production repair, duplicate formal same-revision records, strict chronological approval, FFF/part/BOM rule changes, dedicated mobile UI | User `執行開發` authorization | Lower backfilled revision approves into history; higher revision becomes latest; first-level views show latest only | tsc, lint, `qc:pdm-change-control` 61/61, approve/retry-release static guard, in-memory release lifecycle tests, latest/history UI static guard |
| Phase 4 - First-Class Revision Attachment Package Model (`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`) | Authorized and implemented locally on 2026-07-06 | Implemented / verification passed locally | First-class packageId model, package files, supplement request/approval, migration dry-run | Production, direct repair, CAD/OCR, product pending-area for ambiguous migration | User `執行開發` authorization after guided Phase 4 decisions | PackageId governs formal package; Released core immutable; supplements approved and tagged | tsc, lint, `qc:pdm-drawing-revision-package-model` 59/59, `qc:pdm-change-control` 61/61, local SQLite `db:init`; browser supplement evidence still recommended |
| Phase 5 - Extraction Assistance | Not authorized | RD Contract Ready / Not Authorized | Optional title-block extraction and richer file role validation | External license/cost and production CAD processing | Phase 4 implemented/verified plus authorization | Extraction assists but does not override RD correction | Adapter tests, mismatch negative cases |
| Phase 6 - Production Cutover / Historical Classification | Not authorized | Release Gate Contract Ready / Parked | Production rollout and historical attachment-only classification | Deletion, silent repair, unapproved migration | Implemented applicable phases plus release gate | Production smoke passes and historical risk classified | Release gate package, migration dry-run, rollback evidence |

Stop conditions:

- RD needs production deploy, production migration, direct DB mutation, historical repair or data deletion.
- Existing submission snapshot cannot preserve selected attachment IDs and FFF assessment link without migration.
- Package creation cannot be transactional or safely compensated.
- Implementation would treat attachment upload alone as formal released revision.
- Implementation would force part/BOM revision for no-impact drawing changes.
- Implementation keeps one-file upload as the only practical primary flow for a revision package.
- Implementation hides submitter package warnings from reviewer page/drawer.
- Implementation blocks submit solely because optional recommended package roles are missing.
- Implementation blocks approval solely because a newer different revision already exists.
- Implementation lets an older backfilled revision replace a newer latest revision.
- Implementation creates duplicate formal records for the same drawing + revision.
- Implementation edits Released package core in place instead of using supplement/new revision path.
- Implementation creates product `待確認附件` UI for migration ambiguity.
- Existing change-control or drawing submission regression QC fails outside this scope.

Next condition:

- Continue only for APP validation feedback or explicitly authorized later-phase work.
- Do not run product implementation, production deploy, migration, direct historical repair, data deletion, CAD/OCR extraction Phase 5 or forced part/BOM revision from this documentation entry.

## 3. External Blockers / Parked Scope

These are not executable by RD without external evidence or explicit PM approval. Keep the task lines in this table so `qc:dev-task-evidence-sync` can continue to audit blocker state.

| Status | ID | Scope | Reason / recovery condition |
|---|---|---|---|
| [!] | DEV-IND-007 | SQLite to Postgres / Supabase shadow migration | Supabase runtime work is controlled by `DEV-SUPABASE-DB-001`. Recovery requires disposable Supabase / Postgres shadow target, live RLS plan, disposable target live compare, and `npm.cmd run qc:postgres-shadow` evidence. |
| [!] | DEV-CAD-001 | SolidWorks Document Manager or equivalent reader | Needs SolidWorks Document Manager API 或等效授權元件 / SolidWorks Document Manager 或等效讀取元件 evidence. |
| [!] | DEV-SW-001 | SolidWorks Add-in real-machine validation | Needs SolidWorks Add-in 實機驗證 evidence. |
| [!] | DEV-BACKUP-001 | Offline one-way backup and restore drill | Needs 離線單向備份與還原 / restore-drill evidence. |
| [!] | DEV-FIELD-001 | Formal field-test evidence | Needs 正式現場測試 evidence. |
| [!] | DEV-STORAGE-COST-001 | Storage governance and cost rollout | Parked until real storage target, inventory, lifecycle policy, cost, and production timing are approved. |

External evidence checklist retained for `qc:dev-task-evidence-sync`:

- [ ] 取得 disposable Supabase / Postgres shadow target。
- [ ] `npm.cmd run qc:postgres-shadow` 在 disposable target 通過。
- [ ] `P0` 整合 SolidWorks Document Manager API 或等效讀取元件。
- [ ] `P0` 確認 SolidWorks Document Manager 授權與可部署方式。
- [ ] `P0` SolidWorks Document Manager API 或等效授權元件。

## 4. Completed / Evidence Summary

Full completed-task index: `.ai-doc/archived/completed-dev-index-2026-06.md`.

| ID | Completed state | Current treatment | Evidence summary |
|---|---|---|---|
| `DEV-PDM-LIFECYCLE-ACTIONS-001` | Phase 1-6 local/staging implementation and QC evidence are captured; local commit `21bcf16`. | Logical Archive / Protected Evidence. Production/Supabase production cutover remains excluded and unapproved. | Phase 5 unified controlled-history UI/API slice is implemented/QC-checked. Phase 6 local/staging release readiness records production/Supabase production exclusion and User has authorized scoped Git/index cleanup. Unified controlled history covers released submissions, formal part numbers, formal drawing numbers, and released BOM. Evidence includes `npm.cmd run qc:pdm-lifecycle-controlled-history` 56/56, `npm.cmd run qc:pdm-lifecycle-controlled-history-ui` 30/30, `npm.cmd run qc:pdm-lifecycle-submission-obsolete` 20/20, `npm.cmd run qc:pdm-lifecycle-release-readiness` 47/47, and screenshots `output/playwright/pdm-lifecycle-controlled-history-desktop.png`, `output/playwright/pdm-lifecycle-controlled-history-mobile.png`. |
| `DEV-PDM-CHANGE-CONTROL-001` | Phase 1-5 local implementation completed and QC-captured. | Logical Archive / Protected Evidence; optional follow-up only if PM expands scope. | ADR/SPEC/implementation contract/QA and `scripts/qc-pdm-change-control.mjs`; QC reports for Phase 1, 2, 3, and 4-5; `npm.cmd run qc:pdm-change-control` 50/50; `npx.cmd tsc --noEmit --pretty false`. |
| `DEV-PDM-REVISION-001` | Numeric no-`V` revision policy implemented; manual QA plan prepared. | Closed local package. | Branch `codex/pdm-revision-policy`; commits `8f472d0`, `af08d81`; `qc:master-attachments`, `qc:revision-lifecycle`, `qc:policy-alignment`; QA plan `.ai-doc/qa/qa-pdm-revision-manual-validation-plan-2026-06-22.md`. |
| `DEV-SW-LICENSE-PDM-001` | Company-scoped PDM boundary implemented and committed. | Logical Archive / Protected Evidence because QC scripts reference original package paths. | Supabase staged evidence commit `be333eb` (`DEV-SUPABASE-DB-001 record staging gate B evidence`), scoped SW/PDM commit `6f4dbab` (`DEV-SW-LICENSE-PDM-001 add company-scoped PDM boundary`), PM handoff `.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md`, and `qc:sw-license-pdm-git-boundary`. |
| `DEV-SUPABASE-DB-001-GATE-B` | Staging gate passed for `AI_PDM_STAGING`; smoke write/readback/cleanup and rollback proof captured. | Protected Evidence; parent production/cutover remains deferred. | Approval package, runbook, smoke API matrix, target identity receipt, execution report, QA/QC staging validation, permission seed repair, rule seed repair, migration history policy, rollback readiness, data parity policy. |
| `DEV-SUPABASE-DB-001-GATE-B-STAGING-QA-QC` | QA/QC staging validation passed for `AI_PDM_STAGING`. | Protected Evidence. | QA plan and QC read-only report; zero active smoke residue; production and cutover remain explicitly unapproved. |
| `DEV-SUPABASE-DB-001-GATE-B-PERMISSION-SEED` | Permission repair passed. | Protected Evidence. | `roles=6`, `role_permissions=86`, active priority=1; admin matrix, rule simulator, duplicate check returned HTTP 200. |
| `DEV-SUPABASE-DB-001-GATE-B-RULE-SEED` | Minimal `numbering-rule-v1` seed repair passed. | Protected Evidence. | `numbering_rule_versions=1`; `numbering-rule-v1` exists and is active; write path no longer fails FK. |
| `DEV-SUPABASE-DB-001-MIGRATION-HISTORY` | Migration history policy accepted for staging exception; Supabase CLI is absent locally. | Protected Evidence. | Migration history policy; `qc:supabase-migration-history-policy`; `qc:supabase-runtime-migrations`; `supabase/migrations/manifest.json`. |
| `DEV-SUPABASE-DB-001-ROLLBACK-PROOF` | Rollback readiness prepared and passed after stopping Postgres-mode local process. | Protected Evidence. | `.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md`; `qc:supabase-runtime-rollback-readiness`; `PDM_DB_PROVIDER=<unset>` and `PDM_POSTGRES_URL=<missing>`. |

## 5. Supabase Protected Evidence Contract

This section intentionally keeps exact evidence names because several QC scripts read `dev_task.md` directly.

| Evidence / gate | Current state | QC token or path |
|---|---|---|
| `DEV-SUPABASE-DB-001-GATE-A` | Done for preparation; runtime execution evidence belongs to GATE-B. | `.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md`; `qc:supabase-runtime-gate-plan` |
| `DEV-SUPABASE-DB-001-GATE-B` | Staging GATE-B passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred. | `.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md`; GATE-B approval package; `qc:supabase-runtime-approval-package` |
| GATE-B execution runbook | GATE-B execution runbook prepared. | `.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md`; `qc:supabase-runtime-gate-b-runbook` |
| Runtime smoke API matrix | Prepared. | `.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md`; `qc:supabase-runtime-smoke-api-matrix` |
| Runtime smoke auth/session boundary | Prepared. | `.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md`; `qc:supabase-runtime-smoke-auth-session-boundary` |
| Runtime smoke report template | Prepared controlled evidence. | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md`; `qc:supabase-runtime-smoke-report-template` |
| Runtime smoke execution report | Passed; app API write/readback/cleanup and current state captured. | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`; `qc:supabase-runtime-smoke-report` |
| GATE-B local pre-approval suite report | Prepared. | `qc:supabase-runtime-gate-b-local-suite-report` |
| GATE-B staging QA/QC validation | QA/QC staging validation passed for `AI_PDM_STAGING`; No production access. No production cutover. | `.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md`; `.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md` |
| Target identity receipt template and user-provided receipt | Recorded; target is `AI_PDM_STAGING`; no production/cutover approval. | `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md`; `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`; `qc:supabase-target-identity-receipt` |
| Runtime rollback readiness | Rollback readiness prepared and passed. | `.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md`; `qc:supabase-runtime-rollback-readiness` |
| Data parity policy | `DEV-SUPABASE-DB-001-DATA-PARITY` policy prepared; execution not approved. | `.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md`; `qc:supabase-data-parity-policy` |
| Current Supabase change impact audit | Current Supabase change impact audit is prepared as local evidence. | `.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md`; `qc:supabase-current-change-impact` |

Supabase stop wording required by QC:

- Production target setup or production cutover is not approved.
- Cost-incurring actions are not approved.
- No repository file contains runtime secrets.
- Service role, secret keys, database passwords, and pooler URLs must never be exposed through `NEXT_PUBLIC_*`.

## 6. Verification Contract

Static checks for this control board:

- `git diff --check -- .ai-doc/dev_task.md .ai-doc/documentation_map.md .ai-doc/archived`
- Search all `DEV-` IDs and confirm unfinished IDs remain in this file.
- Confirm moved or logically archived evidence has no broken active link.

Primary QC commands:

- `npm.cmd run qc:dev-task-evidence-sync`
- `npm.cmd run qc:pdm-lifecycle-actions-git-boundary`
- `npm.cmd run qc:pdm-lifecycle-release-readiness`
- `npm.cmd run qc:sw-license-pdm-git-boundary`
- `npm.cmd run qc:supabase-runtime-local-readiness` only when Supabase runtime docs are touched or as regression evidence.

Known limitation:

- `qc:pdm-lifecycle-actions-git-boundary` is a historical pre-commit boundary script. After the lifecycle package was closed in commit `21bcf16`, it can fail because it still expects lifecycle candidate files to be present in staged, unstaged, or untracked changes. Treat `qc:pdm-lifecycle-release-readiness` plus commit `21bcf16` as the current closed-package evidence unless the boundary script is explicitly updated.

## 7. Stop Conditions

- Do not mark documentation restructuring as product Done.
- Do not delete unfinished tasks or move them only to archive.
- Do not physically move protected evidence while QC scripts still reference hardcoded paths.
- Do not execute blocked, deferred, parked, production, cutover, migration, data parity, or external-service scopes without explicit authorization.
- Do not stage unrelated dirty files.

## 8. Latest Update

- 2026-07-07: Added `DEV-PDM-STATUS-UX-002` development documents for APP feedback that status help still mixes workflow, task, import, settings, job, restore and DVT readiness semantics. Added spec `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`, QA plan `.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`, a `dev_task` row/section and `documentation_map.md` cold-start guidance. Status is `Prepared / RD Implementation Ready / Not Authorized`; no product implementation, DB/API/schema migration, production deploy, historical repair, audit raw-payload migration or workflow semantic change was performed.
- 2026-07-06: Amended and verified `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001` with a real Windows Shell worker after fake preview images were rejected by APP validation, then added a SolidWorks Document Manager SLDDRW PNG worker/exporter path after APP validation showed 3D success but 2D still queued. Added `scripts/run-windows-shell-preview-worker.mjs`, `scripts/windows-shell-thumbnail-extractor.ps1`, `scripts/run-solidworks-document-manager-preview-worker.mjs`, `scripts/solidworks-document-manager-preview-exporter.cs`, default real worker enqueue, fake-derivative display suppression, blank/low-information PNG quality gating, clean failed-job user messages, and a `dev:local:restart` fix so tokenized local worker routes can be exercised. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-sw-native-preview-worker` 90/90, `npm.cmd run qc:pdm-sw-native-preview-redaction` 68/68, `npm.cmd run qc:master-attachments` 101/101, `npm.cmd run dev:local:check`, direct SLDPRT worker extraction, API claim/complete smoke for `D-0007-MA1.SLDPRT`, Document Manager compile-only smoke, SLDDRW API worker fail-safe smoke for missing worker-readable key, and browser smoke screenshot `output/playwright/master-attachment-preview/d0007-3d-ready-2d-key-missing-compact.png`. `.SLDDRW` Shell output on this workstation was blank and is now failed cleanly; Document Manager worker is implemented but still needs Supabase Vault live secret read or worker-local key for successful drawing preview. No production deploy/migration, historical backfill, direct data repair/deletion, Phase 2 drawing PDF, Phase 3 interactive 3D or Phase 4 rollout was performed.
- 2026-07-06: Added `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001` development documents from the user's request to make SolidWorks native previews work like Windows File Explorer. Added spec `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`, ADR `.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`, and QA plan `.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`. Status was `RD Contract Ready / Not Authorized`; no product implementation, schema migration, worker deployment, real Document Manager/equivalent run, production deploy/cutover, direct data repair/deletion or historical preview backfill was performed in that documentation-only step.
- 2026-07-06: Implemented and verified `DEV-PDM-SHARED-3D-MA-BASELINE-001` after the user's `授權給你, 完成這些開發任務` instruction. Added additive shared 3D / MA baseline schema for SQLite and Postgres, async repository/service, part/root shared model version APIs, MA package model-basis API, required-MA resolver, manufacturing baseline draft/release APIs, immutable released baseline snapshot behavior, submission release workflow model-basis gate for MA packages, approval action codes, part-level 3D/intermediate attachment categories, and a part-detail UI slice for shared 3D creation, MA model link / reviewed 2D-only exception and baseline draft/release. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-shared-3d-ma-baseline` 20/20, `npm.cmd run qc:pdm-drawing-revision-package-model` 59/59, `npm.cmd run qc:pdm-change-control` 61/61, `npm.cmd run qc:db-provider-contract` 35/35, `npm.cmd run qc:db-provider-postgres` 9/9, `npm.cmd run qc:supabase-current-change-impact` 15/15 and browser smoke screenshot `output/playwright/shared-3d-ma-baseline/parts-shared-3d-baseline-desktop.png`. Production deploy/migration, direct data repair/deletion, CAD/OCR extraction, forced part/BOM/FFF rule change and production cutover remain excluded.
- 2026-07-06: Implemented and verified `DEV-PDM-SETTINGS-CENTER-001` Phase 1 after the user's authorization. `/settings` now has a settings center overview/work queue, five management-area routes, SolidWorks secret lifecycle UI, server-only draft/test/activate/revoke APIs, dedicated secret metadata tables, RLS plan entries, redacted local test-double evidence and legacy Google Drive settings compatibility. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-settings-center-secret-lifecycle` 22/22, `npm.cmd run qc:supabase-secret-boundary` 15/15, `npm.cmd run qc:gdrive-folder-tree-settings` 35/35, `npm.cmd run qc:db-provider-contract` 35/35, `npm.cmd run qc:db-provider-postgres` 9/9 and `npm.cmd run qc:supabase-current-change-impact` 15/15. Supabase Vault live write/smoke, production deploy/cutover, direct data repair/deletion, external-cost actions and real SolidWorks/CAD-reader proof remain separately gated.
- 2026-07-06: Added `DEV-PDM-SETTINGS-CENTER-001` long-task development package from the user's HCS settings-center decisions. The selected architecture is: `/settings` becomes a work-queue settings center with five management areas; Supabase Vault stores secrets; Supabase DB stores metadata only; PDM backend APIs operate Vault; Google Workspace is account/Drive source while PDM owns roles/approval; high-risk settings use draft/test/Admin activation; the first implementation slice is SolidWorks secret lifecycle. Added spec `.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`, ADR `.ai-doc/decisions/ADR-PDM-SETTINGS-CENTER-001-settings-center-secret-governance.md`, and QA plan `.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`. Status is `RD Contract Ready / Not Authorized`; no product implementation, schema migration, Supabase Vault live write, production deploy/cutover, direct data repair/deletion or secret value handling was performed.
- 2026-07-06: Completed RD-supervisor readiness closure for `DEV-PDM-SHARED-3D-MA-BASELINE-001` documentation. Added ADR `.ai-doc/decisions/ADR-PDM-SHARED-3D-MA-BASELINE-001-root-shared-model-and-manufacturing-baseline.md`, required-MA baseline resolver rules, shared model hash/revision identity rules, approval action codes and QA visible-error/viewport gates. Status remains `RD Implementation Ready / Not Authorized`; no product implementation, schema migration, production deploy, direct data repair/deletion, CAD/OCR extraction, forced part/BOM revision or Git action was performed.
- 2026-07-06: Added `DEV-PDM-SHARED-3D-MA-BASELINE-001` development documents from the user's guided decisions. The confirmed product rule is: shared 3D belongs at the part/root level; part/root search remains dynamic navigation; manufacturing baseline freezes the exact shared 3D hash/model version and MA drawing package revisions used for formal manufacturing; MA drawing release requires a shared model link or reviewed `2D-only / no 3D impact` exception. Added spec `.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md` and QA plan `.ai-doc/qa/qa-pdm-shared-3d-ma-baseline-validation-plan-2026-07-06.md`. Initial RD-supervisor review later required ADR and readiness hardening before keeping RD Implementation Ready status.
- 2026-07-05: Implemented and verified `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3` after the user's simplified PDM revision policy and `執行開發` authorization. Product behavior now allows revisions to be entered and approved in any order, suggests the next likely revision without making it a blocker, blocks duplicate formal same drawing + same revision records, recomputes latest/history after release, keeps lower backfilled revisions as formal history and promotes higher revisions to latest. Updated release lifecycle repositories, approve/retry-release/workflow paths, revision comparator, revision workbench intent guidance, first-level latest/history attachment grouping guard, QC script, controlled revision package spec, QA plan, PM control board and documentation map. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 61/61, `npm.cmd run dev:local:check`, plus static search confirming product approve/retry-release paths no longer use the chronological `revision_release_order_conflict` blocker. No schema migration, production deploy, direct data repair, historical cleanup, FFF/part/BOM rule change, strict chronological approval or dedicated mobile-phone UI work was performed.
- 2026-07-05: Implemented and verified `DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2` after user `執行開發` authorization. The drawing revision workflow now treats one revision as a multi-file `版次檔案包`, supports extension-based role auto-classification with inline correction, persists package role/warning evidence in the submission snapshot, keeps completeness checks warning-only after at least one valid file exists, and shows the same reviewer warnings on the submission page plus dashboard drawer. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 57/57, `npm.cmd run dev:local:check`, and Playwright desktop submit/reviewer warning smoke. `npm.cmd run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000; no bypass was used. Current system setting: no dedicated mobile-phone UI; phones use the desktop/default surface, so 390px screenshots are optional sanity only. No schema migration, production deploy, direct data repair, CAD/OCR extraction, FFF rule change or forced part/BOM revision was performed.
- 2026-07-05: Applied APP feedback to `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` after the user reported that old drawings stayed in the `圖面進版` workbench and interfered with preparing a new revision. `/numbering/revisions` now filters the primary `新版圖面` selectable list to the intended revision only, clears preserved selections that no longer match the target revision, moves prior/other-revision attachments to a default-collapsed read-only `上一版 / 其他版次參考檔` area with no checkbox, shows `還沒有版次 X 的新版圖面` as the next-step answer when only old files exist, and makes the disabled submit CTA visually secondary. Updated the drawing revision submission spec, QA plan and change-control QC static guard. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-change-control` 56/56, `npm.cmd run dev:local:check`, and Playwright mock browser checks at 1440x900 and 390x844 with screenshots under `output/playwright/drawing-revision-reference-filter/`. No DB/API/schema/permission/state-machine change, production deploy, direct data repair or historical cleanup was performed.
- 2026-07-04: Implemented and verified `DEV-PDM-NEXT-STEP-UX-001` Phase 1 local UI package after user `執行開發` authorization. Changed shared state guidance so `NextStepState` shows body inline by default, unknown status/error fallback fails closed to actionable Chinese, lifecycle panels show `現在要做`, dashboard action failures no longer directly alert raw `body.error`, drawing revision same-version blockers use action-first wording, DVT missing items show visible recovery guidance, submission-detail not-found/error/restricted states include CTAs, manufacturing handoff missing packages tell manufacturing not to use the record and route back to submission, search/parts/part-drafts/reports empty states include next action, and master attachment error/empty states are mapped to actionable copy. Focused QC scripts were updated to validate the new status-help and action-first wording. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run lint -- --quiet`, `npm.cmd run qc:pdm-status-ui-vocabulary` 44/44, `npm.cmd run qc:pdm-numbering-search-ui` 28/28, `npm.cmd run qc:pdm-numbering-dvt-ui` 24/24, `npm.cmd run qc:pdm-numbering-report-center-ui` 22/22, `npm.cmd run qc:master-attachments` 93/93, `npm.cmd run qc:pdm-drawing-submission-ui-operation` 14/14, and `npm.cmd run dev:local:check`. `npm.cmd run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000; no bypass was used. No DB/API/permission/state-machine change, production deploy, direct data repair, historical cleanup, Phase 2 scanner/checklist or Phase 3 release work was performed.
- 2026-07-04: Prepared `DEV-PDM-NEXT-STEP-UX-001` Phase 0 documentation package after QA review of UI states that do not answer the user's real question: `那我現在要幹嘛`. Added `SPEC-PDM-NEXT-STEP-UX-001` with Human Decision Brief, action-first copy/component contract, QA inventory, phase roadmap, QA/QC gate, spec governance result, Deferred Scope Audit, All-Phase Coverage Matrix and RD Readiness Review. Phase 1 product UI implementation is RD Implementation Ready but not authorized. Phase 2 regression scanner/checklist and Phase 3 production release are not authorized. DB/API/permission/state-machine changes, production deploy, direct data repair, historical cleanup, admin/debug raw payload full localization and full platform navigation redesign remain excluded unless separately approved.
- 2026-07-03: Implemented and verified `DEV-PDM-DRAWING-REVISION-SUBMISSION-001` Phase 1 locally after user authorization. `/numbering/revisions` now requires a `新版圖面` attachment step before formal submit, uploads selected files to the drawing attachment library as source/staging evidence, validates selected attachment revision against the intended drawing revision, creates a controlled Pending submission package through a dedicated drawing-revision API, links the FFF assessment via `drawing_revision_fff_assessments.submission_id`, and cancels an incomplete Pending submission with audit if FFF creation fails after package creation. Verification passed: `npx.cmd tsc --noEmit --pretty false`, `npm.cmd run qc:pdm-change-control`, `npm.cmd run qc:pdm-drawing-submission-review-only`, `npm.cmd run qc:pdm-drawing-submission-workbench-mutation`, local `/numbering/revisions` HTTP 200 smoke, and unauthenticated workbench API 401 guard smoke. `npm.cmd run build` was blocked by the intentional local-dev guard because AI_PDM was already listening on port 3000; no bypass was used. No production deploy, migration, direct historical repair, data deletion, CAD/OCR Phase 2 or forced part/BOM revision was performed.
- 2026-07-03: Implemented and verified `DEV-PDM-STATUS-UX-001` Phase 1 locally. Added central UI status dictionary, shared status help/header/badge components, Chinese status filters/badges/errors, development phase display mapping (`Release` -> `正式階段`), and focused QC scanner baseline for user-visible status columns and raw status wording. Verification passed: `npm run qc:pdm-status-ui-vocabulary` 44/44, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`, browser UI evidence on `/settings` for status help open/Chinese copy/ESC close/outside click close, browser UI evidence on `/numbering/drawings` for `已發布 / 正式階段`, and `npm run dev:local:check` after restarting local 3000. No production deploy, DB enum/schema rename, production migration, direct historical data repair or audit payload migration was performed.
- 2026-07-02: Implemented and verified `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001` Phase 1 locally after user authorization. The release lifecycle now synchronizes source drawing, resolved part and root master statuses to `Released` / `Release` in the same transaction as submission release, writes `ReleaseMasterStatusSynced` audit, blocks missing/ambiguous source context with Chinese recovery language, and shows a drawing-module guard for historical released-as-Draft mismatches. Verification passed: `npm run qc:pdm-release-master-status-sync` 23/23, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run qc:pdm-drawing-submission-workbench-recovery` 27/27, `npm run qc:pdm-drawing-submission-ui-operation` 14/14, and browser smoke screenshot `output/playwright/pdm-release-master-status-sync-guard-d0014.png`. No historical D-0014 repair, production deploy, production migration, direct mutation against existing user data, data deletion or Phase 2/3 implementation was performed.
- 2026-07-02: Completed `PA-LOCAL-DEV-3000-001` second PA hardening for recurring broken local port 3000. Added `dev:local:check`, upgraded `scripts/start-localhost-3000.ps1` from single `/login` health to multi-route `/`, `/login`, `/api/auth/me` checks, wrote real port-owner PID/status JSON/logs under `tmp/local-dev/`, and added `scripts/clean-next.mjs` guard so `clean:next` / `prebuild` refuse to remove `.next` while the project-owned 3000 server is listening unless an explicit bypass is set. Verification passed: `npm run qc:local-dev-entrypoint`; `npm run dev:local:check`; expected-block test for `node scripts/clean-next.mjs` returned exit code 1 while PID 52928 owned the healthy project server; status JSON ended in `healthy_existing` with all three routes healthy. No production deploy, production migration, direct DB cleanup, data deletion, provider switch, or foreign-process stop was performed.
- 2026-07-02: Completed `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` Phase 1 local verification. Fixed the mutation QC runner to use the real `/api/submissions` dashboard source instead of a nonexistent `/api/dashboard`, then passed `npm run qc:pdm-drawing-submission-workbench-mutation` 33/33 on disposable local fixture records. Required gates passed in this run: `npm run build`, `npm run qc:pdm-drawing-submission-workbench-mutation` 33/33, `npm run qc:pdm-drawing-submission-workbench-recovery` 27/27, `npm run qc:db-provider-contract` 35/35, `npm run qc:db-provider-postgres` 9/9, `npm run qc:pdm-submission-conflict-duplicate-active` 14/14, `npm run qc:pdm-drawing-part-workbench-security`, `npm run qc:pdm-drawing-submission-review-only` 14/14, `npx tsc --noEmit --pretty false`, and `npm run lint`. No production deploy, production migration, direct DB cleanup, historical repair, data deletion, provider switch or Phase 2+ implementation was performed.
- 2026-07-02: Re-synced the `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` development package against the latest `dev-pm` development-document-to-RD-ready rules. The disposable mutation lifecycle gate was explicitly indexed as `npm run qc:pdm-drawing-submission-workbench-mutation` in `dev_task`, `documentation_map`, the Phase 1 QA plan and the main spec. This intermediate documentation state was later superseded by the successful 33/33 mutation QC pass recorded above.
- 2026-07-02: Rechecked `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` development documents against the latest `dev-pm` development-document-to-RD-ready rules. Added a standalone `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P` section with Human Decision Brief, scope/out-of-scope, implementation contract summary, data/API/permission/state-machine impact, acceptance, stop conditions, evidence required and re-entry triggers. Added spec Section 4.5 compliance mapping and refreshed `documentation_map.md` cold-start guidance. This is documentation-only; Phase 2+ remains RD Contract Ready and not authorized for implementation.
- 2026-07-02: Advanced `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` from partial/unverified RD to an intermediate non-mutating verification state. Added focused QC package entry, validated async SQLite/Postgres transaction-boundary candidate, fixed local SQLite bootstrap ordering for release-recovery indexes so old DB files no longer fail with `no such column: resolved_by_submission_id`, and captured local 3200 API/browser evidence for `D-0014-MA1` release-incomplete blocker and `SUB-20260701-2AEBA0CD` detail page. This intermediate state was later superseded by the successful disposable mutation QC and final local verification pass recorded above.
- 2026-07-02: Re-synced `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` with the latest `dev-pm` development-document-to-RD-ready rules after reviewing the current local code state. Updated spec/dev_task/documentation_map/QA wording for return-for-correction transaction-boundary work. This intermediate documentation state was later superseded by the completed local verification recorded above; Phase 2+ remains RD Contract Ready only, and no production deploy, migration, direct DB cleanup, historical repair or data deletion was authorized.
- 2026-07-02: Synced `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` documentation with the latest `dev-pm` development-document rules and current local file state. The canonical workbench page/API, retry-release API, return-for-correction API, module CTA routing, detail recovery UI and resolved ReleaseFailed de-noising were documented for later verification. This intermediate state was later superseded by the completed local verification recorded above.
- 2026-07-02: Rechecked `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` Phase 2+ documentation against the latest `dev-pm` All-Phase RD Contract Gate. Added spec Section 4.5 with explicit authorization boundary, phase entry/stop conditions, spec-governance result and continuation rule. Updated the P2P task row so future continuation cannot treat Phase 2+ contract readiness as implementation authorization. No product implementation, production deploy, migration, direct DB cleanup, historical repair or data deletion was performed.
- 2026-07-02: Reconciled `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` with the latest `dev-pm` development-document rules. Corrected PM state from "not started" to "In Progress / partial local RD" because the worktree already contains unverified Phase 1 implementation changes. Added explicit Priority, authorization boundary, current implementation status, remaining RD gaps, validation gates and Phase 2+ non-authorization boundary.
- 2026-07-02: Updated `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` documentation under the latest dev-pm All-Phase RD Contract Gate. Added Phase 1 QA plan `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`, linked it from spec/dev_task/documentation map, and preserved Phase 2+ as RD Contract Ready only. No product implementation, production deploy, migration, direct DB cleanup, historical repair or data deletion was performed.
- 2026-07-01: Executed CAPA PA for recurring broken local port 3000. Replaced raw `dev:local` with managed `scripts/start-localhost-3000.ps1`, preserved raw Next command as `dev:server`, added `dev:local:restart` for authorized stale-project-process recovery with `.next` cleanup, PID/log files under `tmp/local-dev/`, HTTP `/login` health checking, and static QC `npm run qc:local-dev-entrypoint`. Verification passed: `npm run qc:local-dev-entrypoint`, managed `-CheckOnly`, and `http://127.0.0.1:3000/` returned HTTP 200.
- 2026-07-01: Implemented `DEV-PDM-DRAWING-PART-WORKBENCH-001` locally after user RD authorization. Added controlled drawing submission route, root/drawing readiness APIs, generic `/upload` retired UX, generic `POST /api/submissions` 410 retirement, idempotency attempt audit, duplicate attachment filename preflight, canonical immutable submission snapshot/hash, owner-route master-data edit path and focused QC. Verification passed: `tsc`, `lint`, `build`, `qc:pdm-drawing-part-workbench-security`, `qc:pdm-drawing-submission-review-only`, and `qc:pdm-numbering-api-regression` on temporary local 3100. Production deploy/migration and direct DB cleanup remain unapproved.
- 2026-07-01: Completed RD readiness closure for `DEV-PDM-DRAWING-PART-WORKBENCH-001` documentation. Added explicit generic `/upload` and `POST /api/submissions` retirement, owner API contracts, ambiguity blockers, permission/state matrix, canonical snapshot schema/hash, idempotency attempt state machine, storage-key collision rules and mandatory negative QA cases. State remains RD Implementation Ready; product implementation is still not executed.
- 2026-07-01: Added `DEV-PDM-DRAWING-PART-WORKBENCH-001` development package from user architecture decisions. Added RD-ready spec `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`, ADR `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`, and QA plan `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`. State is documentation ready / RD Implementation Ready; product implementation is not executed by this documentation request.
- 2026-06-30: Implemented `DEV-PDM-DRAWING-SUBMISSION-001`. Added drawing-source context resolver, review-only create API, source drawing/source attachment traceability columns, safe master-attachment copy into submission repository, drawing detail source-aware `送審` route, `/upload?source=drawing` review-only workbench, focused QC script, desktop/mobile browser smoke evidence, and successful local POST/duplicate-prevention evidence. Production deploy/cutover remains out of scope.
- 2026-06-30: Completed non-production executable-work audit for "all tasks except switching to production". Fixed completion/readiness QC parser compatibility with the current `External Blockers / Parked Scope` heading. Evidence passed: `tsc`, `lint`, `build`, `qc:dev-task-evidence-sync`, `qc:dev-task-completion-audit`, lifecycle release readiness, SW/PDM boundary, Supabase local readiness, data parity policy, current-change audit, and production readiness allow-open with five external blockers visible.
- 2026-06-30: Final local 3000 smoke for `DEV-PDM-DRAWING-SUBMISSION-001` passed after documentation sync: drawing-source route renders `圖面送審`, preserves source `D-0014-MA1`, does not show the generic upload flow, has zero editable master-data inputs, and blocks submission while master-data blockers exist.
- 2026-06-30: Continuation audit revalidated `DEV-PDM-DRAWING-SUBMISSION-001` against the current worktree and local 3000 server. Required static/build/QC gates passed; browser/API smoke confirmed review-only UI, blocker behavior, generic upload regression, mobile layout, source traceability evidence, and duplicate 409 behavior.
- 2026-06-30: Added `DEV-PDM-DRAWING-SUBMISSION-001` development documents from user APP validation. Decision: drawing module completes master data; drawing-source submission is review-only and must not collect PDM master fields. Added spec `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md` and QA plan `.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`. This documentation entry was later superseded by the implemented / verification-passed package above.
- 2026-06-30: PM documentation governance restructured. `dev_task.md` now acts as the active control board; completed evidence is summarized and indexed in `.ai-doc/archived/completed-dev-index-2026-06.md`; original full files were snapshotted before restructure.
- 2026-06-30: Completed development-document readiness pass for `DEV-PDM-UI-POLISH-001A`. Added executable-scope entry, primary part fallback contract, replacement draft service contract, duplicate-submit strategy, and focused QA plan.
- 2026-06-30: Implemented `DEV-PDM-UI-POLISH-001A`. Added official drawing resolver API, shared resolver helper, server-side drawing and primary-part resolution for FFF submit, duplicate active assessment guard, drawing-revision replacement draft reuse, and redesigned `/numbering/revisions` workbench. Verification passed: `tsc`, `lint`, `build`, `qc:pdm-change-control`, browser smoke.
- 2026-06-30: Added focused development spec `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md` for the human-centered `/numbering/revisions` workbench redesign. The slice was later implemented under `DEV-PDM-UI-POLISH-001A`.
- 2026-06-30: Completed `DEV-PDM-UI-POLISH-001`. Implemented CAD-adapter warning copy simplification, upload PDM attribute simplification, multi-file upload with SolidWorks-primary metadata and conflict warning, SolidWorks attachment 3D preview fallback, compact icon-free drawing-governance actions, and retained `DEV-PDM-UI-POLISH-001A` drawing revision workbench evidence. Verification passed: `tsc`, `lint`, `build`, and focused browser smoke.
- 2026-06-30: `DEV-PDM-LIFECYCLE-ACTIONS-001` local/staging package is closed in local commit `21bcf16`; production/Supabase production cutover remains unapproved.
- 2026-06-30: User authorized lifecycle scoped Git/index cleanup and unified controlled-history aggregation; the completed evidence is now treated as Logical Archive / Protected Evidence.
- 2026-06-30: Supabase `DEV-SUPABASE-DB-001` staging GATE-B remains passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred.
- 2026-06-19: `DEV-SW-LICENSE-PDM-001` closed after separate Supabase evidence commit `be333eb` and SW/PDM company boundary commit `6f4dbab`.
- 2026-06-24: `DEV-PDM-CHANGE-CONTROL-001` Phase 1-5 local implementation evidence captured; production/Supabase migration remains approval-gated.
- 2026-06-22: `DEV-PDM-REVISION-001` committed on scoped branch `codex/pdm-revision-policy` with commits `8f472d0` and `af08d81`.
