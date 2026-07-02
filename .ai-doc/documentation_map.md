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

- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`: Implemented / verification passed locally for Phase 1, with Phase 1 contract and QA plan prepared and Phase 2+ RD Contract Ready. Local worktree changes cover `Cancelled` / release-recovery schema fields, same-revision blocker classification, Pending cancel support, release workflow wrapping, approve-flow integration, canonical workbench page/API, retry-release API, return-for-correction API, module CTA routing, submission-detail recovery UI, resolved ReleaseFailed dashboard/todo de-noising and async transaction boundaries. Verified evidence includes focused recovery QC, disposable mutation lifecycle QC, DB transaction provider QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke and D-0014 submission-detail browser smoke. The mutation gate used temporary local fixture records and did not mutate existing D-0014 or other user data. Phase 2+ preserves RD handoff contracts for master-data completion/writeback through owner APIs, drawing attachment upload, collaboration, dashboard/todo de-noising, and production cutover/historical repair gates. Production deploy, production migration, direct DB cleanup, historical repair and data deletion remain unapproved.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`: Implemented / verification passed locally on 2026-07-02 after user RD authorization. UI-level release-incomplete self-recovery now includes human-readable diagnosis, drawing-owned attachment organizer, released-filename preflight, explicit selected-attachment correction submission, formal-record lock state, submission-detail recovery link, focused QC and a UI-only operation validation gate covering route identity, retired upload, blocker wording, correction flow, permissions, detail states and RWD. Production deploy, production migration, direct DB cleanup, historical repair, data deletion, released-file overwrite, collaboration/dashboard later phases and Google Drive production movement remain unapproved.
- Local dev entrypoint CAPA PA is implemented and hardened: use `npm run dev:local` for normal 3000 startup, `npm run dev:local:check` for non-browser health diagnosis, and `npm run dev:local:restart` only when the project-owned 3000 process is stale/unhealthy. The managed launcher performs multi-route HTTP health checks for `/`, `/login`, and `/api/auth/me`, writes launcher PID, port-owner PID, status JSON and logs to `tmp/local-dev/`, and `clean:next` / `prebuild` refuse to remove `.next` while the project-owned 3000 server is listening unless an explicit bypass is set. Guarded by `npm run qc:local-dev-entrypoint`.
- `DEV-PDM-SUBMISSION-CONFLICT-001`: Implemented / verification passed locally on 2026-07-02. Duplicate drawing + revision submission is classified as `submission_conflict`, blocked at readiness/submit/reviewer guard, shown with human Chinese recovery, audited through structured blocked-attempt payloads, and raw DB uniqueness errors are shielded from UI. Production deploy, production migration, direct DB cleanup and historical duplicate repair remain unapproved.
- `DEV-PDM-DRAWING-PART-WORKBENCH-001`: Implemented / verification passed locally on 2026-07-01 after user RD authorization. Drawing module stays drawing-focused; 圖料/圖號 shortcuts route to a controlled drawing submission workbench; inline edits write through owner APIs and audit; ambiguous root/drawing/part relationships block submission; submission uses canonical immutable snapshot/hash; idempotency and failed-attempt audit are enforced; duplicate attachment filenames are blocked with Chinese domain errors; generic `/upload` and generic `POST /api/submissions` formal creation are retired. Production deploy, production migration, direct DB cleanup, data deletion and existing-data repair remain unapproved.
- Non-production executable-work audit: completed locally on 2026-06-30. Production/cutover remains excluded. No local or unclassified open task remains; only external-evidence blockers remain visible under `.ai-doc/dev_task.md` Section 3.
- `DEV-PDM-DRAWING-SUBMISSION-001`: Implemented / verification passed locally. User decision on 2026-06-30: drawing module completes master data; drawing-source `送審` is review-only and does not collect PDM master fields. Production deploy remains unapproved/out of scope.
- `DEV-PDM-UI-POLISH-001`: Implemented / verification passed on 2026-06-30. Upload UI simplification, multi-file SolidWorks-primary metadata, conflict warnings, SolidWorks preview fallback, compact drawing governance actions, and `DEV-PDM-UI-POLISH-001A` drawing revision workbench are complete. Continue only for user APP validation feedback or separately scoped enhancements.
- `DEV-PDM-UI-POLISH-001A`: Implemented / verification passed. Drawing revision workbench focused slice completed on 2026-06-30; continue only for user APP validation feedback or separately scoped enhancements.
- Local PM document governance work: allowed when scoped to `.ai-doc/dev_task.md`, `.ai-doc/documentation_map.md`, and `.ai-doc/archived/`.

Not executable without explicit approval:

- `DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`: Prepared / RD Implementation Ready for Phase 1 documentation only. It captures the D-0014-MA1 mismatch where submission release state is `Released` while drawing/part/root master statuses remain `Draft`. Phase 1 requires release-time master lifecycle sync in the same DB transaction as submission `Released`, audit and visible inconsistency guard. Phase 2 historical scanner/Admin repair and Phase 3 production cutover are documented but not authorized. No historical D-0014 repair, production migration, direct DB mutation or data deletion is authorized.
- `DEV-SUPABASE-DB-001-DATA-PARITY`: prepared but blocked; requires parity tier, target, data scope, cleanup owner, and credential boundary.
- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P`: Phase 2+ RD Contract Ready only and rechecked under the latest `dev-pm` All-Phase Gate. Phase 2 requires Phase 1 implemented/verified and explicit authorization; Phase 3 requires Phase 2 implemented/verified and explicit authorization; Phase 4 requires production release-gate approval. Continuation commands must not start Phase 2+ unless `.ai-doc/dev_task.md` is explicitly updated.
- `DEV-SUPABASE-DB-001-PROD-GATE`: deferred; production/cutover remains unapproved and deferred.
- `DEV-IND-007`, `DEV-CAD-001`, `DEV-SW-001`, `DEV-BACKUP-001`, `DEV-FIELD-001`: external-evidence blockers. Current readiness evidence is `npm run qc:production-readiness -- --allow-open`, which intentionally reports `ready=false` until these external proofs exist.
- `DEV-STORAGE-COST-001`: product rollout backlog / parked scope; requires real storage inventory, target, cost, retention policy, and production timing approval.
- Any production deployment, Supabase production cutover, schema migration, direct DB mutation, data deletion, provider pointer switch, or cost-incurring external action.

## 3. Active Package Read Order

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
3. UI-only QA plan: `.ai-doc/qa/qa-pdm-drawing-submission-ui-operation-validation-plan-2026-07-02.md`
4. Parent recovery spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
5. Parent review-only spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
6. Parent data-ownership spec: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
7. Implemented surfaces: `src/app/upload/page.tsx`, `src/app/submissions/[id]/page.tsx`, `src/lib/drawing-submission-workbench.ts`, `src/lib/repositories/submission-status-async-repository.ts`, `src/app/api/submissions/[id]/return-for-correction/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts`, `src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts`, `scripts/qc-pdm-drawing-submission-ui-self-recovery.mjs`, `scripts/qc-pdm-drawing-submission-ui-operation-scenarios.mjs`, `package.json`.

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
- UI-only operation QC command: `npm run qc:pdm-drawing-submission-ui-operation`; latest local run passed 14/14 and writes `output/playwright/ui-operation-scenarios/pdm-drawing-submission-ui-operation-report.md`.
  - Clean database continuation note: the QC runner now bootstraps a minimal local `D-0014-MA1` fixture only when absent, records fixture setup in the report, and treats setup as prerequisite data rather than UI evidence.

Remaining high-risk boundaries:

- No production deploy/migration, direct DB cleanup, historical repair, data deletion or released-file overwrite.
- No collaboration/dashboard later phases or Google Drive production file movement without separate authorization.

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
