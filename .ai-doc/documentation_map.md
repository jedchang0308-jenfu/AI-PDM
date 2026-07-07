# AI_PDM Documentation Map

This project uses `.ai-doc` as the single project documentation center. Cold start rule: read this file first, then `.ai-doc/dev_task.md`, then only the package docs for the selected task.

## 1. Authoritative Entry Points

| Need | Read |
|---|---|
| Current task, blockers, next executable work | `.ai-doc/dev_task.md` |
| Completed DEV / gate evidence index | `.ai-doc/archived/completed-dev-index-2026-06.md` |
| Archive policy and snapshots | `.ai-doc/archived/README.md` |
| Requirements and design specs | `.ai-doc/specs/` |
| Architecture decisions | `.ai-doc/decisions/` |
| QA plans | `.ai-doc/qa/` |
| RD implementation reports | `.ai-doc/reports/rd/` |
| QC and evidence reports | `.ai-doc/reports/qc/`, `.ai-doc/qc/` |
| PM handoff / release / governance reports | `.ai-doc/reports/pm/` |
| Runbooks | `.ai-doc/runbooks/` |

Historical snapshots:

- `.ai-doc/archived/dev_task_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/documentation_map_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/dev_task_legacy_before_pm_cleanup_2026-06-16.md`
- `.ai-doc/archived/report-path-index.md`

## 2. Current Executable / Non-Executable Work

Executable now:

- `DEV-PDM-NEXT-STEP-UX-001`: Implemented / verification passed locally for Phase 1 on 2026-07-04 after user `執行開發` authorization. Shared next-step state, status/error fallback, lifecycle next-step visibility, dashboard action failures, drawing revision blockers, DVT missing-item guidance, submission-detail error states, handoff missing-package guidance, empty/no-result states and master-attachment error/empty states now answer `那我現在要幹嘛` more directly. Verified with `tsc`, lint, status vocabulary QC, numbering search UI QC, DVT UI QC, report center UI QC, master attachments QC, drawing submission UI operation QC and local dev health. Build was blocked by the intentional local-dev guard because AI_PDM was listening on port 3000; no bypass was used. Read `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`: Implemented / verification passed locally for Phase 1, with Phase 1 contract and QA plan prepared and Phase 2+ RD Contract Ready. Local worktree changes cover `Cancelled` / release-recovery schema fields, same-revision blocker classification, Pending cancel support, release workflow wrapping, approve-flow integration, canonical workbench page/API, retry-release API, return-for-correction API, module CTA routing, submission-detail recovery UI, resolved ReleaseFailed dashboard/todo de-noising and async transaction boundaries. Verified evidence includes focused recovery QC, disposable mutation lifecycle QC, DB transaction provider QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke and D-0014 submission-detail browser smoke. The mutation gate used temporary local fixture records and did not mutate existing D-0014 or other user data. Phase 2+ preserves RD handoff contracts for master-data completion/writeback through owner APIs, drawing attachment upload, collaboration, dashboard/todo de-noising, and production cutover/historical repair gates. Production deploy, production migration, direct DB cleanup, historical repair and data deletion remain unapproved.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`: Implemented / verification passed locally on 2026-07-02 after user RD authorization. UI-level release-incomplete self-recovery now includes human-readable diagnosis, drawing-owned attachment organizer, released-filename preflight, explicit selected-attachment correction submission, formal-record lock state, submission-detail recovery link, focused QC and a UI-only operation validation gate covering route identity, retired upload, blocker wording, correction flow, permissions, detail states and RWD. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved.
- `DEV-PDM-STATUS-UX-001`: Implemented / verification passed locally on 2026-07-03. Phase 1 adds a central UI status dictionary, Chinese-only normal UI status display, status filter/badge/error mapping, development phase display mapping, shared status badge/header/help components and the required `?` help popover on user-visible status table columns. Verified with `npm run qc:pdm-status-ui-vocabulary` 44/44, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`, browser UI evidence on `/settings`, browser UI evidence on `/numbering/drawings` for `已發布 / 正式階段`, and `npm run dev:local:check`. Remaining Phase 2 hardening, DB enum/schema rename, production deploy, production migration, audit payload migration and historical data repair require explicit approval.
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
- Local PM document governance work: allowed when scoped to `.ai-doc/dev_task.md`, `.ai-doc/documentation_map.md`, and `.ai-doc/archived/`.

Not executable without explicit approval:

- `DEV-PDM-NEXT-STEP-UX-001` Phase 2+: regression scanner/checklist hardening and production release are not authorized. DB/API/permission/state-machine changes, production deploy, direct data repair, historical cleanup, admin/debug raw payload full localization and full platform navigation redesign are excluded unless separately approved.
- `DEV-PDM-STATUS-UX-002`: Prepared / RD Implementation Ready / Not Authorized. Captures APP feedback that status help still mixes workflow, task, import, settings, job, restore and DVT readiness semantics after the central Chinese status display work. Phase 1 requires context-specific status help for tasks, imports, settings, reports, approvals, DVT, restore lists and mixed master-data columns, plus focused QA/QC gates. Product implementation, production deploy, DB/API/status-machine changes, historical repair and audit raw-payload migration are not authorized.
- `DEV-PDM-NUMBERING-002`: Prepared / RD Implementation Ready / Not Authorized. Captures compact Numbering Core V2 for new records: `00001`, `00001-P01`, `00001-M01`, `00001-R01`; main root is a reusable design-object root, not a project/order/equipment root; v1 `MA/OT` and `D-/P-` rows remain readable through semantic manufacturing/reference compatibility. Product implementation, schema migration, production migration, direct data rewrite, project/order/equipment numbering and extra visible category codes are not authorized.
- `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`: Prepared / RD Implementation Ready for Phase 1 documentation only. It captures the D-0014-MA1 mismatch where submission release state is `Released` while drawing/part/root master statuses remain `Draft`. Phase 1 requires release-time master lifecycle sync in the same DB transaction as submission `Released`, audit and visible inconsistency guard. Phase 2 historical scanner/Admin repair and Phase 3 production cutover are documented but not authorized. No historical D-0014 repair, production migration, direct DB mutation or data deletion is authorized.
- `DEV-SUPABASE-DB-001-DATA-PARITY`: prepared but blocked; requires parity tier, target, data scope, cleanup owner, and credential boundary.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P`: Phase 2+ RD Contract Ready only and rechecked under the latest `dev-pm` All-Phase Gate. Phase 2 requires Phase 1 implemented/verified and explicit authorization; Phase 3 requires Phase 2 implemented/verified and explicit authorization; Phase 4 requires production release-gate approval. Continuation commands must not start Phase 2+ unless `.ai-doc/dev_task.md` is explicitly updated.
- `DEV-SUPABASE-DB-001-PROD-GATE`: deferred; production/cutover remains unapproved and deferred.
- `DEV-IND-007`, `DEV-CAD-001`, `DEV-SW-001`, `DEV-BACKUP-001`, `DEV-FIELD-001`: external-evidence blockers. Current readiness evidence is `npm run qc:production-readiness -- --allow-open`, which intentionally reports `ready=false` until these external proofs exist.
- `DEV-STORAGE-COST-001`: product rollout backlog / parked scope; requires real storage inventory, target, cost, retention policy, and production timing approval.
- Any production deployment, Supabase production cutover, schema migration, direct DB mutation, data deletion, provider pointer switch, or cost-incurring external action.

## 3. Active Package Read Order

### DEV-PDM-NUMBERING-002

Status: Prepared / RD Implementation Ready / Not Authorized. Phase 0 development documents are complete; Phase 1 local product implementation requires explicit authorization.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`
3. `.ai-doc/decisions/ADR-PDM-NUMBERING-002-compact-root-drawing-part-identity.md`
4. `.ai-doc/qa/qa-pdm-numbering-v2-compact-identity-validation-plan-2026-07-07.md`
5. Existing v1 authority: `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`
6. Related ownership/submission boundary: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
7. Likely implementation surfaces after authorization: `db/schema.sql`, `db/postgres/001_initial_schema.sql`, `src/lib/repositories/numbering-async-repository.ts`, `src/lib/repositories/numbering-repository.ts`, `src/app/api/numbering/records/route.ts`, `src/app/numbering/request/page.tsx`, `src/app/numbering/search/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/impact/page.tsx`, import/export scripts and numbering QC scripts.

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

- No product implementation is authorized by the documentation request.
- Stop if work needs production migration, existing-data rewrite, data deletion, project/order/equipment numbering or more visible category codes.

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

Status: Prepared / RD Implementation Ready / Not Authorized. Documentation only; RD implementation requires explicit authorization.

Read:

1. `.ai-doc/dev_task.md`
2. `.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`
3. `.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`
4. Parent context: `.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`, `.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`
5. Candidate implementation surfaces: `src/lib/status-display.ts`, `src/components/status-help-popover.tsx`, `src/app/numbering/tasks/page.tsx`, `src/app/numbering/imports/page.tsx`, `src/app/settings/page.tsx`, `src/app/numbering/reports/page.tsx`, `src/app/numbering/approvals/page.tsx`, `src/app/numbering/dvt/page.tsx`, `src/app/bom/workbench/page.tsx`, `src/app/numbering/part-drafts/page.tsx`, `src/app/parts/page.tsx`, `src/app/numbering/drawings/page.tsx`, `src/app/numbering/search/page.tsx`, `scripts/qc-pdm-status-ui-vocabulary.mjs`.

Human-confirmed problem:

- The UI should explain task-specific status, not full raw enum lists.
- `?` help must match the column's real status context.
- Mixed columns must be named or grouped so users do not mistake phase/cost/warning chips for the same status.
- Raw DB/API/audit statuses remain unchanged.

Implementation / authorization boundary:

- Phase 1 is RD Implementation Ready but not authorized.
- Phase 2 scanner hardening is RD Contract Ready / Not Authorized.
- Stop if DB/API/schema migration, lifecycle semantic changes, production deploy, historical repair or direct data mutation are needed.

Required evidence after authorization:

- `npx.cmd tsc --noEmit --pretty false`
- lint or touched-file lint
- focused status context QC
- Playwright popover-label/clipping screenshots for tasks/imports/settings/reports/approvals/dvt.

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
- `npm run qc:production-readiness -- --allow-open`: passed with `ready=false` and five external blockers visible.
- `npx tsc --noEmit`, `npm run lint -- --quiet`, and `npm run build`: passed.

Remaining blockers are external-evidence only: `DEV-IND-007`, `DEV-CAD-001`, `DEV-SW-001`, `DEV-BACKUP-001`, and `DEV-FIELD-001`.

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

`DEV-STORAGE-COST-001` is parked / product rollout backlog. It must not be treated as part of `DEV-SUPABASE-DB-001` completion.

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
