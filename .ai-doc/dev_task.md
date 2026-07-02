# AI PDM dev_task PM Control Board

Updated: 2026-07-02
Owner: Dev PM
Purpose: This file is the active DEV control board. Unfinished work stays here; completed work is summarized here and indexed in `.ai-doc/archived/completed-dev-index-2026-06.md`.

Historical snapshots:

- `.ai-doc/archived/dev_task_legacy_before_pm_cleanup_2026-06-16.md`
- `.ai-doc/archived/dev_task_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/documentation_map_before_pm_governance_restructure_2026-06-30.md`

## 1. PM Snapshot

Current active objective: `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` Phase 1 local RD implementation and verification is implemented / verification passed locally while preserving Phase 2+ architecture. Phase 1 development specification is fulfilled locally: new drawing submission workbench route, same-revision lifecycle recovery, Pending cancellation, ReleaseFailed retry/return-for-correction, resolved ReleaseFailed de-noising and user-facing Chinese conflict language are implemented and verified. Local evidence now includes focused recovery QC, disposable mutation lifecycle QC, DB provider transaction gates, duplicate/drawing-part/review-only regressions, `tsc`, lint and build. Mutation validation used temporary local fixture records through `npm run qc:pdm-drawing-submission-workbench-mutation` and did not mutate existing D-0014 or other user data. Phase 2+ development documents remain `RD Contract Ready`: master-data completion/writeback, attachment-library upload, collaboration, dashboard/todo de-noising, and production cutover/historical repair gates include RD handoff contracts but are not authorized for implementation. Production/cutover remains excluded, and external-evidence blockers remain visible under Section 3.

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
| Implemented / Verification passed | `PA-LOCAL-DEV-3000-001` | CAPA / PA tooling control | None | Recurring broken local 3000 prevention is implemented: managed launcher, `dev:local:check`, stale project recovery via `dev:local:restart`, multi-route health checks, port-owner PID/status JSON/logs, and `.next` clean/build collision guard. | Use `npm run dev:local` for normal startup, `npm run dev:local:check` for diagnosis, and `npm run dev:local:restart` only when the project-owned 3000 process is stale/unhealthy. Build/clean while 3000 is running requires intentional bypass and should not be used as the normal workflow. | `package.json`; `scripts/start-localhost-3000.ps1`; `scripts/clean-next.mjs`; `scripts/qc-local-dev-entrypoint.mjs`; `tmp/local-dev/ai-pdm-3000.status.json`; `npm run qc:local-dev-entrypoint`; `npm run dev:local:check`. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | Delivery point | `DEV-PDM-DRAWING-PART-WORKBENCH-001`; amends `DEV-PDM-SUBMISSION-CONFLICT-001` | Phase 1 implementation surfaces are present and local verification passed: focused recovery QC, disposable mutation lifecycle QC, transaction provider QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke and D-0014 submission-detail browser smoke. A schema bootstrap ordering bug that caused old SQLite files to fail with `no such column: resolved_by_submission_id` was fixed by keeping new release-recovery indexes in runtime migration after lifecycle migration. The mutation gate used disposable records and did not touch existing D-0014/user workflow records. | Monitor APP validation feedback. Phase 2 requires explicit user/PM authorization before RD. Production deploy, production migration, direct DB cleanup, historical data repair and data deletion remain unapproved. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`; `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`; `scripts/qc-pdm-drawing-submission-workbench-recovery.mjs`; `scripts/qc-pdm-drawing-submission-workbench-mutation.mjs`; `output/playwright/pdm-drawing-submission-workbench-d0014-release-incomplete.png`; `output/playwright/pdm-submission-detail-d0014-release-failed-recovery.png`. |
| Prepared / RD Contract Ready | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P` | Delivery point phase handoff | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | Phase 2+ RD handoff contracts complete and rechecked under the latest `dev-pm` All-Phase Gate: master-data completion/writeback through owner APIs, drawing attachment upload before snapshot, collaboration toggle/permissions, operational edit history, dashboard/todo de-noising, and production cutover/historical repair gate. Not executable as RD yet. | Phase 2 requires explicit user/PM authorization. Phase 3 requires Phase 2 implemented/verified plus explicit authorization. Phase 4 requires release-gate approval. Continuation commands must not start Phase 2+ until this row is explicitly updated. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md` Sections 4.1-4.5. |
| Implemented / Verification passed | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003` | Delivery point | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` | UI-level release-incomplete self-recovery is implemented locally: human-readable diagnosis, attachment organizer, released-filename preflight, explicit selected-attachment correction submission, locked formal-record state, role-aware CTA, submission-detail recovery link, related ReleaseFailed resolution behavior, and UI-only operation validation covering D-0014 route identity, generic upload retirement, detail navigation, recovery, permission, blocker and RWD scenarios. | Monitor APP validation feedback. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved. | `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`; `.ai-doc/qa/qa-pdm-drawing-submission-ui-operation-validation-plan-2026-07-02.md`; `src/app/upload/page.tsx`; `src/lib/drawing-submission-workbench.ts`; `src/app/api/submissions/[id]/return-for-correction/route.ts`; `src/lib/repositories/submission-status-async-repository.ts`; `src/app/submissions/[id]/page.tsx`; `scripts/qc-pdm-drawing-submission-ui-self-recovery.mjs`; `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`; `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`; screenshots `output/playwright/d0014-workbench-ui-self-recovery-after-release.png`, `output/playwright/mock-release-incomplete-ui-self-recovery.png`, `output/playwright/ui-operation-scenarios/REAL-001-d0014-drawing-entry.png`, `output/playwright/ui-operation-scenarios/MOCK-RELFAIL-001-correction-flow.png`. |
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
- `npm run qc:pdm-drawing-submission-ui-operation`: passed 14/14. Covers UI login, D-0014 drawing entry, legacy route compatibility, retired generic upload, D-0014 detail identity, ready/no-attachment/blocker states, Pending/Releasing/Released/history UI, release-incomplete correction flow, permission denial, detail-page states and RWD overflow checks. Route-mocked scenarios are labeled as UI contract simulation and do not claim backend persistence proof.
- 2026-07-02 continuation QC after clean local data reset: first run failed 10/14 because the plan-required `D-0014-MA1` real fixture no longer existed (`drawing_numbers`, `part_numbers`, `part_roots`, `submissions`, `submission_files` all 0). RD root cause used HCS `#多層次分析`: case layer = D-0014 locator timeout, data layer = blank master/submission tables, process layer = QA precondition conflicted with clean database, governance layer = QC runner did not explain fixture precondition. Correction: `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs` now creates a minimal local `D-0014-MA1` fixture only when absent, records that fixture setup is not UI proof, and does not overwrite an existing D-0014. Re-run passed `npm run qc:pdm-drawing-submission-ui-operation` 14/14; `npm run dev:local:check`, `node --check scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`, and `npm run lint -- --quiet` also passed.
- `npm run dev:local:check`
- Authenticated Playwright smoke: D-0014 released state hides upload/remove controls, locks selection/note, and shows Chinese formal-record blocker.
- Mocked Playwright smoke: release-incomplete state shows attachment organizer, keeps corrected attachment selectable, blocks conflicting attachment, keeps note editable, shows `建立修正送審`, and hides raw `DUPLICATE_RELEASE_FILENAME` / `rev`.
- UI-only operation report:
  - `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`
  - `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.json`
- Browser screenshots:
  - `output/playwright/d0014-workbench-ui-self-recovery-after-release.png`
  - `output/playwright/mock-release-incomplete-ui-self-recovery.png`
  - `output/playwright/d0014-released-detail-ui-self-recovery.png`
  - `output/playwright/ui-operation-scenarios/REAL-001-d0014-drawing-entry.png`
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
