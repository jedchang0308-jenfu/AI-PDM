# SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002 - 圖面送審工作台與發行未完成恢復流程

Status: Implemented / verification passed locally for Phase 1; Phase 2+ RD Contract Ready
Date: 2026-07-02
Owner: Dev PM
Related DEV: `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
Related QA: `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`
Parent / amended scope:

- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`

Implementation progress note:

- This document is the authoritative behavior and engineering contract, not evidence that Phase 1 is complete.
- As of the latest 2026-07-02 verification sync, the local worktree contains Phase 1 implementation changes for `Cancelled`, release-recovery fields, same-revision blocker classification, Pending cancellation, shared release workflow wrapping, canonical workbench page/API, retry-release API, return-for-correction API, module CTA routing, submission-detail recovery UI, resolved ReleaseFailed dashboard/todo de-noising and async transaction boundaries for return-for-correction / release resolution.
- Local verification passed: focused recovery QC, disposable mutation lifecycle QC, DB provider transaction QC, `tsc`, lint, build, D-0014 workbench API smoke, D-0014 release-incomplete browser smoke and D-0014 submission-detail browser smoke. The disposable mutation lifecycle gate `npm run qc:pdm-drawing-submission-workbench-mutation` passed on temporary local records and did not mutate existing D-0014/user workflow records.
- Phase 2, Phase 3 and Phase 4 remain non-authorized handoff contracts only.

## 1. Human Decision Brief

Human-confirmed decisions from 2026-07-02 HCS guided planning:

- Submission entry remains in 圖號模組 / 圖料模組. The workbench itself may be an independent page.
- New drawing submission workbench route: `/drawings/[drawingNumber]/submission-workbench`.
- 圖號模組直接 opens the drawing submission workbench. 圖料模組 must first resolve/select the primary or MA drawing, then open the same workbench.
- Workbench carries root and primary part context, but drawing number is the primary object.
- Phase 1 may keep legacy `/upload?source=drawing&drawingNumber=...` for compatibility, but module entry points must prefer the new workbench route.
- The workbench has three Phase 1 areas: `送審條件`, `既有紀錄 / 阻擋`, `送審動作`.
- Phase 1 shows only same drawing + revision related records, not full drawing history.
- Phase 1 has a short confirmation summary: attachments, revision, note and blocker status.
- UI layer must use user-understandable Traditional Chinese; internal codes must not appear in normal UI.

Lifecycle and duplicate decisions:

- `ReleaseFailed` does not mean an ordinary active duplicate. It means `發行未完成`.
- `ReleaseFailed` still blocks same drawing + revision while unresolved.
- UI message for unresolved `ReleaseFailed`:

```text
發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。
```

- Pending / Releasing conflict code: `same_revision_in_progress`.
- Release failed conflict code: `release_incomplete_conflict`.
- Released / Obsolete terminal conflict codes: `released_revision_exists`, `obsolete_revision_locked`.
- `duplicate_active_submission` is no longer the canonical umbrella code for all same-revision blockers.
- Pending can be cancelled by submitter, R&D Manager or Admin.
- Cancelled status does not occupy the drawing + revision for future submission.
- `Cancelled` is a new pre-release terminal status distinct from `Rejected`.
- `Rejected`, `Cancelled` and other pre-approval unfinished records may be shown as history but must not block a new same-revision submission.
- Released and Obsolete revisions must not be reused.
- ReleaseFailed can be handled by R&D Manager/Admin through:
  - retry release, preserving the same submission id;
  - return for correction, creating a new working submission linked to the failed one.
- When a new linked submission is released successfully, the old ReleaseFailed record remains historically ReleaseFailed but is marked resolved by the new submission and no longer blocks.
- Resolved ReleaseFailed records:
  - do not appear in dashboard/todo;
  - do not appear as blockers in the workbench;
  - appear only in same-revision history with low visual weight;
  - detail page remains openable but visually de-emphasized.

Phase roadmap decisions:

- Phase 1 goal: unblock dead-end flows and create the new workbench route.
- Phase 2: master-data completion, writeback summary, attachment upload to drawing attachment library.
- Phase 3: collaborative editing and dashboard/todo noise reduction.

Decision source and unanswered defaults:

- Source: 2026-07-02 user-guided HCS planning in the current thread, including decisions on entry location, same-revision blocking, ReleaseFailed recovery, cancellation, collaboration boundary and user-facing Traditional Chinese copy.
- No high-impact HCS decision remains unanswered for this spec. Technical choices such as exact field names, route component naming, repository placement, static QC script implementation and local additive migration shape are AI/RD-owned decisions under this contract.
- If a future decision would change data ownership, controlled-evidence timing, collaboration permission, production migration or deletion policy, use the re-entry triggers below.

Confirmed out of scope for this document:

- Phase 1 does not implement master-data completion/writeback, drawing attachment upload/writeback, collaboration editing, full history/reporting, production deploy, production migration, direct DB cleanup, historical repair or data deletion.
- Phase 2 and Phase 3 are handoff contracts only until explicitly authorized.
- Phase 4 is release-gate planning only and cannot be executed from this spec alone.

Rejected options:

- Keep routing drawing submission through generic `/upload` as the primary user flow.
- Show raw codes such as `duplicate_active_submission`, `ReleaseFailed`, `UNIQUE constraint failed`, `submission_conflict` or `controlled exception` in user-facing copy.
- Let ReleaseFailed permanently block even after a linked replacement submission is released.
- Delete failed submissions to make the workflow look clean.
- Let any Engineer cancel or resolve another user's in-flight submission without ownership or manager/admin authority.

AI assumptions:

- Existing local implementation already has a `ReleaseFailed` status and release retry/release service surfaces that can be reused or wrapped.
- Existing submission attempt audit remains valid for blocked/failed submit attempts, but Phase 1 does not require a full audit-reporting UI.
- Production deploy, production migration, direct DB cleanup, historical data repair and data deletion are not authorized.
- If current SQLite schema constraints require local additive migration for `Cancelled` or resolution fields, RD may implement local schema migration only; production migration remains gated.

Re-entry triggers:

- User changes the definition of when a submission becomes formally controlled.
- User asks to delete submission records instead of lifecycle-closing them.
- RD discovers current schema cannot add `Cancelled` or release-resolution fields without destructive migration.
- RD needs production data cleanup, production migration, direct DB mutation, provider switch or deployment.
- Permission changes would allow non-owner Engineers to cancel or resolve other users' work without explicit collaboration rules.

## 2. Problem

The current drawing submission flow creates dead ends:

- A same drawing + revision submission can fail at release and then keep blocking new submission.
- The user cannot delete the existing failed submission.
- Pending, Releasing, ReleaseFailed, Released and Obsolete are not separated clearly enough in duplicate handling.
- UI messages tell users to complete or return a workflow even when the current status cannot use the normal Pending reject/approve paths.
- A user can be blocked by an existing submission they cannot fully read or resolve.
- `查看既有送審` may reveal the stuck record but does not provide a path to clear the blocker.

The main issue is not only duplicate detection. It is missing lifecycle recovery for same drawing + revision conflicts.

## 3. End-State Architecture

### 3.1 Entry and workbench

```text
圖號模組
  -> 送審
  -> /drawings/[drawingNumber]/submission-workbench

圖料模組 / 主根號工作台
  -> choose primary or MA drawing
  -> /drawings/[drawingNumber]/submission-workbench

圖面送審工作台
  -> drawing-first context
  -> root / primary part context
  -> same-revision records
  -> blockers and available recovery actions
  -> confirmation summary
  -> create submission
```

### 3.2 Responsibility boundary

| Surface | Responsibility |
|---|---|
| 圖號模組 | Drawing-focused entry and drawing attachments. |
| 圖料模組 | Root/part/drawing context and choosing the drawing to submit. |
| Drawing submission workbench | Readiness, same-revision conflict visibility, submission action and recovery links. |
| Submission detail page | Existing submission status, role-appropriate actions and human-readable next steps. |
| Release service | Retry release for already-approved failed release. |
| Lifecycle recovery service | Cancel Pending and return ReleaseFailed for correction. |

## 4. Phase Roadmap

### Phase 1 - Workbench and dead-end recovery

Implemented / verification passed locally. Local Phase 1 implementation is present and the required static, non-mutating and disposable mutation lifecycle gates have passed.

Current implementation checkpoint:

- Implemented and covered by static / non-mutating validation:
  - local submission schema/type additions for `Cancelled`, cancellation metadata and release-resolution relation;
  - repository/service support for Pending cancellation and resolved ReleaseFailed relation;
  - narrowed same-revision blocking lookup for unresolved ReleaseFailed and active/terminal states;
  - same-revision blocker mapping and same-revision history response fields in `drawing-submission-workbench`;
  - shared release workflow wrapper and partial approve-route integration;
  - Pending cancel API route;
  - canonical `/drawings/[drawingNumber]/submission-workbench` page;
  - `GET /api/numbering/drawings/[drawingNumber]/submission-workbench`;
  - `POST /api/submissions/[id]/retry-release`;
  - `POST /api/submissions/[id]/return-for-correction`;
  - module CTA routing from 圖號 / 圖料 surfaces to the canonical workbench;
  - `/upload?source=drawing...` compatibility behavior alignment through the same workbench component;
  - submission-detail actions and status labels for `發行未完成`, `取消送審`, `重新發行`, `退回修正`;
  - resolved ReleaseFailed exclusion from main dashboard/todo surfaces;
  - async SQLite transactions support awaited callbacks, Postgres nested transaction calls reuse the active transaction client, return-for-correction creates the linked Pending submission plus old ReleaseFailed relation update inside one transaction candidate, and release success resolves corrected ReleaseFailed records transactionally;
  - SQLite bootstrap compatibility: new release-recovery indexes are created by runtime migration after lifecycle schema migration, avoiding old local DB startup failure such as `no such column: resolved_by_submission_id`.
- Verified in this pass:
  - `npm run qc:pdm-drawing-submission-workbench-recovery`: passed 27/27.
  - `npm run qc:db-provider-contract`: passed 35/35.
  - `npm run qc:db-provider-postgres`: passed 9/9, live Postgres probe skipped because `PDM_POSTGRES_URL` is not configured.
  - `npm run qc:pdm-submission-conflict-duplicate-active`: passed 14/14.
  - `npm run qc:pdm-drawing-part-workbench-security`: passed.
  - `npm run qc:pdm-drawing-submission-review-only`: passed 14/14.
  - `npx tsc --noEmit --pretty false`: passed.
  - `npm run lint`: passed.
  - `npm run build`: passed.
  - local 3200 API smoke confirmed `D-0014-MA1` workbench payload with one `發行未完成` blocker pointing to `SUB-20260701-2AEBA0CD`, not unrelated drawing data.
  - browser smoke captured `output/playwright/pdm-drawing-submission-workbench-d0014-release-incomplete.png` and `output/playwright/pdm-submission-detail-d0014-release-failed-recovery.png`; normal UI did not expose `ReleaseFailed`, `duplicate_active_submission`, raw SQL, `UNIQUE constraint failed` or `Internal Server Error`.
- Remaining Phase 1 local gates:
  - None. Future work requires APP validation feedback or explicit Phase 2 authorization.

Scope:

- Add `/drawings/[drawingNumber]/submission-workbench`.
- Keep legacy `/upload?source=drawing...` compatibility, but module entry points prefer the new route.
- Reclassify same drawing + revision records by status.
- Add `Cancelled` for pre-release cancellation.
- Add cancel Pending action for submitter, R&D Manager and Admin.
- Add ReleaseFailed recovery actions for R&D Manager and Admin:
  - retry release;
  - return for correction and create linked working submission.
- Add resolution relation so old ReleaseFailed can be marked resolved by a successful linked submission.
- Workbench UI three areas:
  - `送審條件`;
  - `既有紀錄 / 阻擋`;
  - `送審動作`.
- Same drawing + revision history only.
- Short confirmation summary: attachment, revision, note, blocker status.
- User-facing Chinese copy for all blockers and recovery actions.

Out of scope:

- Master-data edit/writeback in the workbench.
- Attachment upload/writeback in the workbench.
- Collaborative editing.
- Full dashboard/todo refactor.
- Full drawing submission history screen.
- Production deployment or production migration.
- Direct cleanup of existing records.

### Phase 2 - Master-data completion and writeback

RD Contract Ready. Not authorized for RD until Phase 1 is implemented / verified and the user or PM explicitly authorizes Phase 2.

Target scope:

- Workbench can complete submission-required master data:
  - part name;
  - material;
  - surface finish;
  - primary part relation;
  - attachments.
- Send action shows writeback summary with old value and new value.
- Confirmation writes master data to owner domain APIs, then creates submission snapshot.
- Workbench attachment upload writes into drawing attachment library before submission snapshot.

### Phase 3 - Collaboration and noise reduction

RD Contract Ready. Not authorized for RD until Phase 2 is implemented / verified and the user or PM explicitly authorizes Phase 3.

Target scope:

- Authorized owner/manager/admin can open collaboration editing.
- Collaboration remains active until submission completes or is cancelled.
- Resolved ReleaseFailed records are removed from dashboard/todo and remain only as low-weight history.

### Phase 4 - Production cutover and historical repair

Parked release gate. Not authorized by this spec.

Target scope:

- Redirect or retire legacy compatibility routes after Phase 1-3 are stable.
- Plan additive production migration for new statuses, relations, workbench drafts or collaboration tables if needed.
- Classify existing stuck submissions without deleting records.
- Prepare backup, dry-run, rollback and production smoke evidence before any cutover.

## 4.1 Phase 2+ Architecture Memory Capsule

This capsule preserves decisions that must not be lost when Phase 2 or later work resumes.

Fixed decisions:

- The formal entry remains in 圖號模組 / 圖料模組; the workbench may be a standalone page.
- The workbench is a submission-preparation surface, not a new source of truth.
- 圖號 data remains owned by drawing domain.
- 料號 data remains owned by part domain.
- 主根號 and drawing/part relationships remain owned by numbering/link domain.
- Any workbench edit must write through the owning domain API and owner-domain validation.
- Submission creation freezes a canonical immutable snapshot after successful writeback.
- Pre-release workbench collaboration is operational preparation, not a formal controlled release record.
- Once a submission is approved/released, the approved snapshot and release record become the controlled evidence.
- UI copy must be Traditional Chinese and understandable by normal users.
- Raw DB errors, internal codes and stack traces must not be shown in normal UI.
- Production deploy, production migration, direct DB cleanup, historical repair and data deletion remain excluded until a separate release gate.

End-state data flow:

```text
圖號 / 圖料模組 entry
  -> 圖面送審工作台
  -> 讀取 drawing/root/part/attachment owner data
  -> 使用者補齊可編輯欄位
  -> writeback preview: old value -> new value
  -> owner APIs validate + persist master data
  -> workbench revalidates same-revision blockers and attachment eligibility
  -> create Pending submission
  -> create immutable submission snapshot + hash
  -> approval/release flow
  -> Released record becomes controlled evidence
```

Data ownership matrix:

| Data | Owner domain | Workbench responsibility |
|---|---|---|
| Drawing number, purpose, drawing status | Drawing / numbering domain | Read, show, route to owner API for allowed draft updates. |
| Part number, part name, material, surface finish, process/product series when supported | Part domain | Read, show, route to owner API for allowed draft updates. |
| Root code, primary drawing, primary part, drawing-part links | Root/link domain | Read, show ambiguity blockers, route relationship changes through link APIs. |
| Drawing attachments | Attachment/file asset domain under drawing owner | Upload to drawing attachment library, validate role/revision/duplicate filename. |
| Submission note, selected attachments, revision choice | Submission domain | Capture as submission input and snapshot. |
| Snapshot | Submission domain | Immutable evidence of what was sent for review. |
| Collaboration access | Workbench/collaboration domain | Control who may edit preparation data before submission. |

State and safety rules:

- Phase 2 must not let users edit Released/Obsolete master data inline to bypass formal change control.
- Phase 2 may update Draft/NeedInfo-like master data when owner-domain policy allows it.
- If a field is not editable because of status or permission, the UI must show who can act or which module to use.
- Workbench writeback must use optimistic version/ETag checks or equivalent stale-data prevention.
- The final submit action must re-read the latest owner data before snapshot creation.
- If writeback succeeds but submission creation fails, the UI must say that master data was saved but submission was not created, and provide a retry path.
- If submission creation succeeds, later master-data changes must not mutate snapshot JSON or hash.
- Phase 3 collaboration must never allow an invited collaborator to bypass owner-domain permission checks.

AI assumptions for Phase 2+:

- Existing `file_assets` can remain the drawing attachment library unless RD discovers a stronger local attachment abstraction already exists.
- Existing numbering owner APIs can be extended for missing fields instead of creating a generic workbench write table.
- A small workbench draft/collaboration table is acceptable only if needed for multi-user collaboration, unsaved changes or share state; it is not master data.
- Local SQLite additive migration is acceptable for local development. Production migration is not authorized here.
- Existing role permissions such as `numbering.draft.update`, `numbering.attachments.manage`, R&D Manager and Admin can be reused where semantically correct.

Phase 2+ re-entry triggers:

- The user wants the workbench to become the owner of part/drawing/root data.
- The user wants collaboration edits to be unrestricted by owner-domain permission.
- RD needs destructive migration, record deletion, direct production DB mutation or provider cutover.
- RD cannot identify owner API boundaries for one or more required fields.
- A required field would change the meaning of controlled release evidence.
- Cost-incurring external storage, OCR, CAD metadata services or production file migration become necessary.

## 4.2 Phase 2 RD Handoff Contract - Master-Data Completion, Writeback And Attachment Library

Status: RD Contract Ready; not RD Implementation Ready until explicitly authorized.

Purpose:

- Let users finish the submission-required data in the same drawing submission workbench.
- Preserve the rule that master data lives in owner domains, not in the submission page.
- Prevent the "ready for submission" UI from drifting away from the actual stored master data.

Primary outputs:

- Editable workbench master-data panel.
- Writeback summary showing current value and proposed value.
- Attachment upload into drawing attachment library.
- `save and submit` flow that writes owner data first, then creates a Pending submission snapshot.
- Phase 2 focused QC covering master-data writeback, attachment upload and snapshot integrity.

Dependencies:

- Phase 1 route, blocker classification and recovery flows implemented / verified.
- Owner APIs exist or are created for every editable field.
- Current user role and company scope can be resolved server-side.
- Existing snapshot/hash and idempotency contracts remain intact.

Scope:

- Required master data:
  - primary part relation;
  - part name;
  - material;
  - surface finish;
  - drawing attachment readiness.
- Optional master data when the owner domain currently supports it:
  - product series;
  - process/manufacturing method;
  - color or variant fields;
  - drawing purpose description.
- Attachment upload:
  - `SLDDRW`, `SLDPRT`, `SLDASM`, `PDF`, `DWG`;
  - attachment role/category;
  - attachment revision;
  - duplicate filename preflight before submission.
- Confirmation:
  - show old/new values;
  - show selected attachments;
  - show revision;
  - show blockers after latest revalidation;
  - show whether any master data was saved during the submit action.

Out of scope:

- Full collaboration editing.
- Approval UI redesign.
- BOM review/editing.
- CAD/OCR automatic metadata extraction as a required dependency.
- Production migration or production file movement.
- Editing Released/Obsolete data to bypass controlled change flow.

Workbench response extension:

```ts
type DrawingSubmissionWorkbenchPhase2 = DrawingSubmissionWorkbenchPhase1 & {
  editableMasterData: Array<{
    fieldKey:
      | "primary_part"
      | "part_name"
      | "material"
      | "surface_finish"
      | "product_series"
      | "process_name"
      | "variant_color"
      | "drawing_purpose_description";
    label: string;
    ownerDomain: "drawing" | "part" | "root_link";
    currentValue: string | null;
    proposedValue: string | null;
    editable: boolean;
    requiredForSubmission: boolean;
    versionToken: string;
    blockedReason?: string;
    recoveryHref?: string;
  }>;
  attachmentUpload: {
    enabled: boolean;
    allowedExtensions: string[];
    maxFileSizeBytes?: number;
    targetEntityType: "drawing_number";
    targetEntityId: string;
    targetDrawingNumber: string;
  };
  writebackSummary: Array<{
    fieldKey: string;
    label: string;
    oldValue: string | null;
    newValue: string | null;
    ownerDomain: "drawing" | "part" | "root_link";
    effect: "save_required" | "unchanged" | "blocked";
  }>;
};
```

API contract:

```text
GET  /api/numbering/drawings/[drawingNumber]/submission-workbench
POST /api/numbering/drawings/[drawingNumber]/submission-workbench/writeback
POST /api/numbering/drawings/[drawingNumber]/submission-workbench/attachments
POST /api/numbering/drawings/[drawingNumber]/submission-workbench/submit
```

Rules:

- `writeback` must call owner-domain write services; it must not update part/drawing/root tables through ad hoc SQL hidden in the UI route.
- `attachments` must create drawing-linked `file_assets` or the existing owner attachment abstraction, not a submission file yet.
- `submit` must revalidate latest master data, selected attachments, same-revision blockers and idempotency before creating the submission.
- If the UI combines writeback and submit into one button, backend order must be:
  1. validate idempotency key;
  2. validate company and permission;
  3. validate owner field version tokens;
  4. write owner data;
  5. upload/attach files if included;
  6. re-resolve workbench context;
  7. check blockers;
  8. create submission, files, snapshot and attempt state.

Transaction and recovery:

- In local SQLite, writeback + submit should run in one DB transaction when all touched data is in the same database.
- If file storage is involved, file object creation must be idempotent by content hash or generated upload id.
- If file storage succeeds but DB attach fails, the UI must show a retryable attachment failure and the server must not create a partial submission.
- If writeback succeeds but submit is blocked by a new same-revision record, master data remains saved and the user sees the blocker.
- If submit succeeds, selected owner data is frozen into snapshot and must not be refreshed later.

Permission contract:

| Action | Engineer | Submitter | R&D Manager | Admin |
|---|---:|---:|---:|---:|
| View workbench | If same company and authorized | Yes | Yes | Yes |
| Edit allowed draft master data | If owner-domain permission allows | If owner-domain permission allows | Yes | Yes |
| Upload drawing attachment | If `numbering.attachments.manage` or equivalent allows | Same | Yes | Yes |
| Save and submit | If no blockers and submit permission allows | Yes | Yes | Yes |
| Edit Released/Obsolete master data inline | No | No | No, use controlled flow | No, use controlled/admin flow |

Data / API / permission / state-machine impact:

- Data impact is additive: owner-domain master-data fields are updated through existing or extended owner APIs; submission snapshot remains immutable evidence.
- API impact is additive: workbench writeback, attachment upload and save-and-submit endpoints may be new or composed from existing owner APIs.
- Permission impact is field-level: view, edit, upload and submit checks must be evaluated independently.
- State-machine impact is limited to preparation-before-submit:
  - no new formal submission status is required for Phase 2;
  - failed writeback must not create a Pending submission;
  - successful writeback plus blocked submit leaves saved master data and no new submission;
  - successful submit enters the existing Phase 1 Pending flow.

User-facing UI contract:

- Use one main action label: `儲存並送審` when unsaved required data exists; `送出審核` when no writeback is needed.
- Show old/new summary before submit.
- For stale data, show `資料已被其他人更新，請重新整理後再確認。`
- For permission denial, show `你目前不能修改此欄位，請由有權限的人員處理。`
- For owner-domain validation failure, show the owner-field reason in Chinese and keep the user in the workbench.

Phase 2 acceptance:

- Missing material/surface finish can be completed in the workbench only if owner-domain policy allows edit.
- The saved value appears in owner data after writeback.
- Snapshot captures the saved value at submit time.
- Attachment upload adds files to the drawing attachment library before submission.
- Submission files copy/reference only selected eligible drawing attachments.
- Duplicate filenames are blocked in Chinese before DB constraint failure.
- Stale version tokens block writeback with Chinese recovery copy.
- Permission failures do not expose raw internal role or SQL errors.
- Released/Obsolete master data cannot be patched inline.
- Existing Phase 1 conflict/recovery QC still passes.

Phase 2 stop conditions:

- Owner APIs are missing and cannot be safely added without changing domain ownership.
- Required fields cannot be versioned or protected from stale overwrite.
- Attachment upload requires production storage migration or cost-incurring external services.
- RD needs destructive schema migration or direct production DB repair.
- Save-and-submit cannot keep snapshot data consistent with owner writeback.

Phase 2 deferred decisions:

- Exact UI grouping of optional fields such as product series, process name and variant color may be decided during RD if required fields remain clear.
- Whether file upload uses direct multipart upload, existing file-asset service or a staged upload token is an RD decision as long as the attachment lands in the drawing attachment library before snapshot.
- Whether save and submit is one backend endpoint or a composed backend transaction is an RD decision as long as ordering, idempotency and recovery rules are preserved.

Phase 2 recovery condition:

- Phase 2 can move from RD Contract Ready to RD Implementation Ready only after Phase 1 is implemented / verified, owner API surfaces are confirmed for all required fields, and no production storage/migration dependency is needed.

Phase 2 evidence required:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Existing Phase 1 QC command.
- New focused QC, suggested: `npm run qc:pdm-drawing-submission-workbench-writeback`
- Browser evidence for:
  - missing data -> edit -> writeback summary -> submit;
  - attachment upload -> selection -> submit;
  - stale data conflict;
  - permission-denied field;
  - released/obsolete inline edit blocked.

## 4.3 Phase 3 RD Handoff Contract - Collaboration And Dashboard Noise Reduction

Status: RD Contract Ready; not RD Implementation Ready until Phase 2 is verified and Phase 3 is explicitly authorized.

Purpose:

- Support多人協作完成圖料送審準備 without creating uncontrolled data changes.
- Reduce dashboard/todo noise so users see actionable work instead of resolved historical failures.

Primary outputs:

- Workbench collaboration toggle.
- Collaborator permission model.
- Operational edit history for preparation changes.
- Dashboard/todo filtering for resolved ReleaseFailed and non-actionable history.
- Phase 3 focused QC covering collaboration permission and de-noising.

Dependencies:

- Phase 1 same-revision lifecycle recovery implemented / verified.
- Phase 2 writeback rules implemented / verified.
- Owner-domain permissions can be checked for each editable field.
- Dashboard/todo queries can distinguish active work from historical records.

Scope:

- Default workbench is private to creator/owner plus R&D Manager/Admin.
- Owner, R&D Manager or Admin can enable `開放協作`.
- When collaboration is enabled, invited same-company users may edit only fields their roles can edit through owner APIs.
- R&D Manager/Admin can close collaboration.
- Collaboration closes automatically when:
  - submission is created;
  - workbench is cancelled;
  - drawing/root is locked by a formal release/change flow;
  - manager/admin closes it.
- Track operational edit history:
  - actor;
  - field;
  - old value;
  - new value;
  - time;
  - reason when required.
- Dashboard/todo:
  - unresolved Pending/Releasing remains actionable;
  - unresolved ReleaseFailed remains manager/admin actionable;
  - resolved ReleaseFailed is hidden from main todo;
  - resolved ReleaseFailed appears only in low-weight history;
  - Cancelled/Rejected pre-release records do not pollute active todos.

Out of scope:

- Real-time co-edit cursor UI.
- Chat/discussion system beyond minimal edit notes.
- External notifications.
- Supplier/customer portal collaboration.
- Full audit report UI.
- Production migration.

Possible additive data contract:

RD may use equivalent structures if existing tables already cover this contract.

```text
submission_workbench_drafts
  id
  company_id
  drawing_number_id
  drawing_number
  suggested_revision
  owner_id
  collaboration_enabled
  status: Active | Submitted | Cancelled | Closed
  created_at
  updated_at
  closed_at

submission_workbench_collaborators
  draft_id
  user_id
  role: owner | editor | viewer
  invited_by
  revoked_at

submission_workbench_edit_events
  id
  draft_id
  actor_id
  owner_domain
  field_key
  before_json
  after_json
  reason
  created_at
```

Rules:

- Draft/collaboration tables are operational preparation records, not the source of master data.
- Final owner-domain writes still occur through owner APIs.
- Edit events are for accountability and recovery, not a replacement for controlled release history.
- If the user disables collaboration, existing invited editors lose edit access immediately.
- If two users edit the same owner field, stale version checks decide; last writer must not silently overwrite without version confirmation.

API contract:

```text
POST /api/numbering/drawings/[drawingNumber]/submission-workbench/collaboration/open
POST /api/numbering/drawings/[drawingNumber]/submission-workbench/collaboration/close
POST /api/numbering/drawings/[drawingNumber]/submission-workbench/collaboration/invite
POST /api/numbering/drawings/[drawingNumber]/submission-workbench/collaboration/revoke
GET  /api/numbering/drawings/[drawingNumber]/submission-workbench/history
```

Dashboard/todo query contract:

- Main todo includes only records where current user can take meaningful action.
- Resolved ReleaseFailed must not appear in main todo.
- ReleaseFailed unresolved appears to R&D Manager/Admin with action copy `發行未完成，需要處理`.
- Engineer view of unresolved ReleaseFailed shows guidance, not a primary action they cannot perform.
- Cancelled/Rejected history remains reachable from the workbench same-revision history.

Data / API / permission / state-machine impact:

- Data impact is additive: workbench draft/collaboration tables may be added only for operational preparation records.
- API impact is additive: collaboration open/close/invite/revoke/history endpoints must not replace owner-domain write APIs.
- Permission impact is dual-layer:
  - collaboration access determines who may enter the shared workbench;
  - owner-domain permission still determines which fields they may edit.
- State-machine impact:
  - collaboration draft status may be `Active`, `Submitted`, `Cancelled` or `Closed`;
  - creating a formal submission closes or locks the collaboration draft;
  - resolved ReleaseFailed affects dashboard/todo visibility, not the historical submission status.

Phase 3 acceptance:

- A workbench owner can enable and disable collaboration.
- Invited user can edit only owner-domain-permitted fields.
- Invited user without field permission sees read-only fields and Chinese explanation.
- Manager/Admin can close collaboration.
- Submission creation closes collaboration and prevents further draft edits.
- Operational edit history captures actor/time/field before-after values.
- Resolved ReleaseFailed does not show in main todo.
- Unresolved ReleaseFailed remains visible only to roles who can act or with guidance for roles who cannot act.
- Existing Phase 1 and Phase 2 QC still pass.

Phase 3 stop conditions:

- Role/permission model cannot safely distinguish collaborator edit rights.
- Collaboration would require unrestricted cross-company visibility.
- Real-time collaboration infrastructure becomes mandatory.
- Dashboard de-noising would hide actionable unresolved work.
- RD needs production migration or direct production data repair.

Phase 3 deferred decisions:

- Real-time presence, typing indicators and conflict UI are deferred unless RD can implement them without new infrastructure.
- Notification delivery is deferred; Phase 3 only requires visible collaboration state inside the workbench.
- Full audit-report UI is deferred; operational edit history only needs to be queryable and visible enough for workbench recovery.

Phase 3 recovery condition:

- Phase 3 can move from RD Contract Ready to RD Implementation Ready only after Phase 2 is implemented / verified, collaborator field permissions can be evaluated server-side, and dashboard/todo queries can safely distinguish actionable work from history.

Phase 3 evidence required:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Phase 1 and Phase 2 focused QC.
- New focused QC, suggested: `npm run qc:pdm-drawing-submission-workbench-collaboration`
- Browser evidence for:
  - open collaboration;
  - invited editor allowed field;
  - invited editor blocked field;
  - close collaboration;
  - resolved ReleaseFailed hidden from todo but visible in history.

## 4.4 Phase 4 RD Handoff Contract - Cutover, Compatibility Cleanup And Historical Repair

Status: RD Contract Ready for release-gate planning; Parked / Release Gate Required. Not authorized.

Purpose:

- Move the system from local/staged compatibility to stable production behavior only after Phase 1-3 are verified.
- Repair or classify historical stuck records without deleting evidence.

Scope candidate:

- Redirect legacy `/upload?source=drawing&drawingNumber=...` to the canonical workbench.
- Remove generic formal submission entry from visible navigation if still reachable.
- Add production migration for:
  - `Cancelled`;
  - ReleaseFailed resolution relation;
  - workbench draft/collaboration tables if Phase 3 used them;
  - required indexes.
- Backfill historical same-revision records into blocking/non-blocking categories.
- Produce rollback and smoke test plan.

Implementation contract:

- Phase 4 must use the deployment/release gate before any production action.
- Migration must be additive wherever possible:
  - add statuses/columns/indexes before routing traffic to the new behavior;
  - backfill classification through a dry-run report before writing;
  - never delete stuck or failed submissions to clean the UI.
- Compatibility cleanup must prefer redirect or read-only compatibility over sudden route removal.
- Historical repair must classify records into:
  - active in-progress;
  - unresolved release incomplete;
  - resolved release incomplete;
  - released/obsolete terminal;
  - non-blocking cancelled/rejected history;
  - manual-review-needed.
- Any manual-review-needed record remains blocked from automated repair until an Admin/PM decision.

Data / API / permission / state-machine impact:

- Data impact may include production migration for `Cancelled`, release-resolution relation, workbench collaboration tables and indexes.
- API impact may include route redirects and compatibility responses for legacy `/upload?source=drawing...`.
- Permission impact must preserve existing company/user access; cutover cannot broaden visibility.
- State-machine impact must not reinterpret Released/Obsolete records as editable or reusable.

QA/QC gate:

- Dry-run migration report reviewed before write migration.
- Local/staging migration smoke must pass before production.
- Legacy route behavior must be verified before and after cleanup.
- Same-revision blocker classification must match Phase 1 status policy after migration.
- Dashboard/todo visibility must not hide unresolved actionable work.

Out of scope:

- Silent deletion of failed submissions.
- Production cutover without backup and rollback.
- Changing the user-confirmed ownership architecture.

Acceptance:

- Production migration is additive or has explicit rollback.
- Dry run reports how many records would be classified as unresolved ReleaseFailed, resolved ReleaseFailed, active, terminal or non-blocking history.
- Legacy route redirects or displays canonical workbench consistently.
- No raw internal status/code leaks in migrated UI flows.
- Post-cutover smoke verifies Phase 1-3 core flows.

Evidence required:

- Migration dry-run report with record counts by classification.
- Backup/rollback plan and owner.
- Local/staging migration execution evidence.
- `npm run build` and relevant Phase 1-3 QC commands.
- Browser smoke for canonical workbench and legacy compatibility route.
- Production smoke only after explicit release-gate approval.

Stop conditions:

- Any destructive data repair is required.
- Existing records cannot be classified deterministically.
- Backup/rollback evidence is missing.
- Production credentials, target identity or cost approval is missing.

Deferred decisions:

- Exact production deployment window and rollback owner remain deferred to release planning.
- Whether historical records require manual business review remains deferred until dry-run classification evidence exists.
- Full deletion/archival of old routes is deferred until redirect compatibility is proven stable.

Recovery condition:

- Phase 4 can move from parked to executable release work only after Phase 1-3 are implemented/verified or explicitly scoped down, production target identity is confirmed, backup/rollback evidence is prepared, and the user/PM authorizes deployment/migration.

## 4.5 Current Dev-PM All-Phase Gate Result

Gate date: 2026-07-02

This section is the latest `dev-pm` All-Phase RD Contract Gate closure for this package. It prevents future continuation work from confusing documented future contracts with implementation authorization.

Gate result:

- Phase 1 is the only currently authorized implementation scope, and only for local RD / local verification.
- Phase 1 is implemented / verification passed locally. The local worktree has Phase 1 implementation, non-mutating QC/browser/API evidence and disposable mutation lifecycle evidence.
- Phase 2 and Phase 3 are `RD Contract Ready`, not `RD Implementation Ready`.
- Phase 4 is a parked release-gate contract, not an executable local RD task.
- No product decision blocker remains for the Phase 2+ contract itself. Future implementation still requires the entry conditions below.

Latest `dev-pm` development-document compliance:

- Human Decision Brief is in Section 1 and records confirmed decisions, rejected options, AI assumptions and re-entry triggers. No additional human product decision is currently required for the documented Phase 2+ contract.
- End-State Architecture is in Section 3. It keeps the workbench drawing-first while preserving drawing, part and root/link owner-domain boundaries.
- Architecture Memory Capsule is in Section 4.1 and preserves fixed decisions, data flow, ownership matrix, safety rules, AI assumptions and Phase 2+ re-entry triggers.
- RD Handoff Contracts are in Sections 4.2, 4.3 and 4.4. Each phase includes purpose, outputs, dependencies, scope, out of scope, implementation/API/data/permission/state impact, acceptance, stop conditions, deferred decisions, recovery condition and evidence required.
- Authorization Boundary is in this Section 4.5 and is mirrored in `.ai-doc/dev_task.md` under `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P`.
- QA/QC alignment is split intentionally: Phase 1 executable verification is in Section 12 and the QA plan; Phase 2+ checks remain contract guards until a later authorization.
- Spec governance result is recorded below. A new ADR is not required unless a later phase changes the owner-domain or controlled-evidence architecture.

Authorization boundary:

| Phase | Readiness state | Implementation authorization | Required entry condition | Must stop if |
|---|---|---|---|---|
| Phase 1 - workbench and dead-end recovery | Implemented / verification passed locally | Completed local Phase 1 scope | Monitor APP validation feedback; do not start Phase 2+ without explicit authorization | Needs production deploy, production migration, direct DB cleanup, destructive schema change, or unresolved permission/release-service ownership decision |
| Phase 2 - master-data writeback and attachment library | RD Contract Ready | Not authorized | Phase 1 implemented/verified plus explicit user/PM authorization for Phase 2 | Owner APIs cannot preserve source-of-truth boundaries, stale protection cannot be enforced, or production storage/migration is required |
| Phase 3 - collaboration and dashboard de-noising | RD Contract Ready | Not authorized | Phase 2 implemented/verified plus explicit user/PM authorization for Phase 3 | Collaboration bypasses owner-domain permissions, cross-company visibility would broaden, or unresolved actionable work would be hidden |
| Phase 4 - production cutover and historical repair | Release Gate Contract Ready / Parked | Not authorized | Phase 1-3 implemented/verified or explicitly scoped down, production target identity confirmed, backup/rollback evidence prepared, and release-gate approval granted | Any destructive repair, missing backup/rollback, unknown production target, missing cost approval, or unclassifiable historical records |

Spec governance result:

- Authoritative source for this DEV: this spec plus the QA plan linked in Section 12.
- This spec intentionally amends the older generic duplicate-active wording from `SPEC-PDM-SUBMISSION-CONFLICT-001`; same-revision conflicts must now use the status-specific lifecycle matrix in Section 5.2.
- The existing data-ownership ADR remains authoritative for owner-domain boundaries. A new ADR is not required for the current contract because the core ownership decision is not changing.
- A new ADR or explicit decision is required if a future phase tries to make the workbench the owner of drawing, part, root/link or controlled release evidence.

Continuation rule:

- `完成 dev_task` or equivalent continuation may only resume Phase 1 unless `dev_task.md` is later updated to authorize a later phase.
- Phase 2+ documents are intended to preserve architecture memory and RD handoff detail; they are not evidence that those phases are implemented or allowed to start.

## 5. State Model

### 5.1 Submission statuses

| Status | User meaning | Blocks same drawing + revision? |
|---|---|---|
| `Pending` | 正在送審中 | Yes, `same_revision_in_progress` |
| `Releasing` | 正在發行中 | Yes, `same_revision_in_progress` |
| `ReleaseFailed` unresolved | 發行未完成，需要主管/Admin 處理 | Yes, `release_incomplete_conflict` |
| `ReleaseFailed` resolved | 發行未完成，已由新版送審處理完成 | No |
| `Rejected` before release | 未完成，可重新送審 | No |
| `Cancelled` before release | 已取消，可重新送審 | No |
| `Released` | 已進入正式紀錄 | Yes, `released_revision_exists` |
| `Obsolete` | 已作廢的正式紀錄 | Yes, `obsolete_revision_locked` |

### 5.2 Same-revision conflict classification

The backend must return one of these categories for same company + drawing number + revision:

| Existing state | Code | UI copy |
|---|---|---|
| Pending / Releasing | `same_revision_in_progress` | `此圖號版次正在送審或發行中，請先查看既有送審或聯絡負責人。` |
| ReleaseFailed unresolved | `release_incomplete_conflict` | `發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。` |
| Released | `released_revision_exists` | `此圖號版次已進入正式紀錄，不能重複送審同一版次。` |
| Obsolete | `obsolete_revision_locked` | `此圖號版次已進入正式紀錄，不能重複送審同一版次。` |
| Rejected / Cancelled / pre-approval unfinished | non-blocking history | `曾有未完成送審，不影響本次送審。` |
| ReleaseFailed resolved | non-blocking history | `發行未完成，已由新版送審處理完成。` |

UI must not display internal codes as primary copy.

## 6. Data Contract

### 6.1 Additive schema requirements

RD may choose exact field names, but Phase 1 requires equivalent persisted data:

```text
submissions.status includes Cancelled

submissions.cancelled_at nullable timestamp
submissions.cancelled_by nullable user id
submissions.cancel_reason nullable text

submissions.returned_for_correction_at nullable timestamp
submissions.returned_for_correction_by nullable user id
submissions.returned_for_correction_reason nullable text
submissions.corrects_submission_id nullable submission id

submissions.resolved_by_submission_id nullable submission id
submissions.resolved_at nullable timestamp
```

Minimum meaning:

- `corrects_submission_id`: the new working submission exists to correct a previous ReleaseFailed.
- `resolved_by_submission_id`: the old ReleaseFailed was resolved by a later successful Released submission.
- `Cancelled` applies only to pre-release workflow cancellation.

Indexes:

- Query same drawing + revision records by `company_id + drawing_number + revision`.
- Query unresolved ReleaseFailed by `company_id + drawing_number + revision + resolved_by_submission_id IS NULL`.
- Query correction relation by `corrects_submission_id`.

### 6.2 Readiness/workbench response

The new workbench route may call existing APIs or a new API. The response must contain:

```ts
type DrawingSubmissionWorkbenchPhase1 = {
  drawing: { drawingNumber: string; status: string; purposeCode: string };
  root: { rootCode: string; coreName: string };
  primaryPart: null | { partNumber: string; partName: string; material: string; surfaceFinish: string };
  revision: { suggested: string; source: string };
  attachments: Array<{ id: string; filename: string; role: string; revision: string | null; size: number; eligible: boolean }>;
  sameRevisionRecords: Array<{
    submissionId: string;
    status: string;
    userLabel: string;
    blocking: boolean;
    resolved: boolean;
    submittedByName?: string;
    createdAt?: string;
    releaseError?: string | null;
    resolvedBySubmissionId?: string | null;
    correctsSubmissionId?: string | null;
  }>;
  blockers: Array<{
    code: "same_revision_in_progress" | "release_incomplete_conflict" | "released_revision_exists" | "obsolete_revision_locked" | string;
    message: string;
    recoveryHref?: string;
    recoveryLabel?: string;
    existingSubmissionId?: string;
  }>;
  nonBlockingHistory: Array<{ message: string; submissionId: string; href: string }>;
};
```

## 7. API Contract

Route names may vary if behavior is equivalent.

### 7.1 Workbench view

```text
GET /drawings/[drawingNumber]/submission-workbench
GET /api/numbering/drawings/[drawingNumber]/submission-workbench
```

Rules:

- Must enforce authentication and company scope.
- Must resolve root and primary part context.
- Must return same-revision records and classified blockers.
- Must not show raw DB or internal exception messages.

### 7.2 Submit

Existing drawing submission create route may be reused:

```text
POST /api/numbering/drawings/[drawingNumber]/submissions
```

Phase 1 changes:

- It must use the new classification matrix.
- It must allow same-revision submission when previous records are only Cancelled, Rejected or resolved ReleaseFailed.
- It must block unresolved ReleaseFailed, Pending, Releasing, Released and Obsolete with the correct domain code and Chinese message.
- It must keep idempotency replay behavior.

### 7.3 Cancel Pending

```text
POST /api/submissions/[id]/cancel
```

Rules:

- Allowed roles: submitter, R&D Manager, Admin.
- Current status must be `Pending`.
- Result status: `Cancelled`.
- Requires a Chinese reason, or a default reason supplied by UI.
- Must not delete files, snapshot or submission row.
- Must create audit / lifecycle event equivalent.

### 7.4 Retry release

```text
POST /api/submissions/[id]/retry-release
```

Rules:

- Allowed roles: R&D Manager, Admin.
- Current status must be unresolved `ReleaseFailed`.
- Must use same submission id.
- Must transition through `Releasing`.
- On success, status becomes `Released`.
- On failure, status remains `ReleaseFailed` and release error is updated.
- Must not create a new submission.

### 7.5 Return ReleaseFailed for correction

```text
POST /api/submissions/[id]/return-for-correction
```

Rules:

- Allowed roles: R&D Manager, Admin.
- Current status must be unresolved `ReleaseFailed`.
- Creates a new working submission with status `Pending`.
- New submission points to old failed submission through `corrects_submission_id` or equivalent.
- New submission reuses source drawing/part context and eligible file selection from the failed submission unless RD determines a safer explicit selection flow is required.
- Old ReleaseFailed remains `ReleaseFailed` and unresolved until the new linked submission is released.

### 7.6 Release success resolution hook

When any submission releases successfully:

- If it corrects a ReleaseFailed submission, set the old failed submission's `resolved_by_submission_id` and `resolved_at`.
- Resolved failed submission must no longer block same-revision submission.
- Dashboard/todo queries must exclude resolved ReleaseFailed from active failure tasks.

## 8. Permission Contract

| Action | Submitter | Engineer same company | R&D Manager | Admin |
|---|---:|---:|---:|---:|
| View full own submission | Yes | No unless current policy allows | Yes | Yes |
| View restricted same-company summary | Yes | Yes | Yes | Yes |
| Cancel Pending | Yes | No | Yes | Yes |
| Retry ReleaseFailed | No | No | Yes | Yes |
| Return ReleaseFailed for correction | No | No | Yes | Yes |
| Create new workbench submission | Yes if authorized for drawing/company | Yes if authorized for drawing/company | Yes | Yes |

All permission-denied UI messages must explain who can act, not just say "no permission".

## 9. UI Contract

### 9.1 Workbench layout

Phase 1 workbench uses three areas:

1. `送審條件`
   - drawing number, revision, primary part, material, surface finish and attachment readiness.
2. `既有紀錄 / 阻擋`
   - blocking record with action-oriented Chinese copy;
   - same-revision history with non-blocking low-weight records.
3. `送審動作`
   - note input;
   - selected attachments;
   - confirmation summary;
   - submit button.

### 9.2 Confirmation summary

Before submit, show:

```text
送審前確認

本次版次：0.1
本次附件：
- 水槽本體2.SLDDRW｜圖面檔｜版次 0.1｜89.3 KB
- 水槽本體2.SLDPRT｜3D CAD｜版次 0.3｜142.3 KB

送審備註：...

送審條件：
- 主資料已齊全
- 已選擇 2 個附件
- 目前沒有進行中的同版次送審
```

### 9.3 Existing submission detail actions

Pending / Releasing detail:

- `取消送審`
- `查看負責人`
- `返回送審工作台`

ReleaseFailed detail:

- For R&D Manager/Admin:
  - `重新發行`
  - `退回修正`
  - `查看負責人`
- For Engineer:
  - show responsible owner/manager/admin guidance.
  - no misleading actionable button if they cannot act.

Released / Obsolete detail:

- `建立新版`
- `返回圖號`

### 9.4 User copy

Forbidden normal UI text:

- `duplicate_active_submission`
- `ReleaseFailed`
- `UNIQUE constraint failed`
- `submission_conflict`
- `controlled exception`
- raw SQL, stack trace or English-only permission errors

Required copy examples:

- `此圖號版次正在送審或發行中，請先查看既有送審或聯絡負責人。`
- `發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。`
- `此圖號版次已進入正式紀錄，不能重複送審同一版次。`
- `曾有未完成送審，不影響本次送審。`
- `發行未完成，已由新版送審處理完成。`

## 10. Transaction, Idempotency And Recovery

- Submit creation must remain idempotent by actor + idempotency key.
- Same-revision conflict must be checked immediately before submission creation.
- Cancel Pending must be transactional: status, actor, reason and audit are written together.
- Retry release must not create a second submission id.
- Return-for-correction must be transactional: new submission creation and relation to old ReleaseFailed are written together, or neither is.
- Release-success resolution must be transactional with final release status update, or follow with a retryable compensation job that cannot leave a released correction while the old ReleaseFailed still blocks.

Current local transaction implementation:

- SQLite async provider uses explicit `BEGIN` / `COMMIT` / `ROLLBACK` around awaited callbacks and reuses the active client when already inside a transaction.
- Postgres transaction client reuses the active transaction client for nested repository calls instead of rejecting nested calls.
- `returnReleaseFailedSubmissionForCorrectionAsync` uses a transaction client to create the linked Pending correction and update `returned_for_correction_*` fields on the old unresolved ReleaseFailed record together.
- `markSubmissionReleasedAndObsoletePrevious` uses the async transaction boundary for release, corrected ReleaseFailed resolution, item revision update and previous release obsolescence.
- Verified by `qc:db-provider-contract`, `qc:db-provider-postgres`, `tsc`, lint, build, focused workbench recovery QC and disposable lifecycle mutation QC.

Failure recovery:

- If retry release fails, stay `ReleaseFailed` with updated human-readable failure summary.
- If return-for-correction fails before new submission creation, old ReleaseFailed remains unchanged.
- If return-for-correction succeeds but the new submission is later cancelled, old ReleaseFailed remains unresolved and continues to block.
- If linked new submission is rejected or cancelled, old ReleaseFailed remains unresolved unless a manager/admin explicitly chooses another path.

## 11. Migration And Compatibility

Local development may add additive SQLite schema changes:

- add `Cancelled` to accepted submission statuses;
- add cancellation fields;
- add correction/resolution fields;
- add indexes for same-revision lookup and resolution status.

Compatibility:

- Existing `/upload?source=drawing&drawingNumber=...` remains usable only as a compatibility route during Phase 1.
- New module CTAs must target `/drawings/[drawingNumber]/submission-workbench`.
- Existing implemented duplicate conflict behavior remains valid for Pending/Releasing but must be narrowed by status classification.
- Existing records do not require destructive cleanup.

Production migration:

- Not authorized by this spec.
- Must be separately planned and approved before deployment/cutover.

## 12. QA / QC Gate

Authoritative Phase 1 QA plan:

- `.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`

Phase 1 acceptance:

- Drawing module `送審` opens `/drawings/[drawingNumber]/submission-workbench`.
- Drawing-part/root module送審 path resolves/selects drawing then opens the same workbench.
- Legacy `/upload?source=drawing&drawingNumber=...` does not become the primary route.
- Pending/Releasing same-revision record blocks with `此圖號版次正在送審或發行中...`.
- Unresolved ReleaseFailed blocks with `發行未完成...需要主管或 Admin 處理`.
- Released/Obsolete blocks with `此圖號版次已進入正式紀錄...`.
- Rejected/Cancelled/pre-approval unfinished record shows non-blocking history.
- Resolved ReleaseFailed shows low-weight history and does not block.
- Submitter/Manager/Admin can cancel Pending; other Engineer cannot.
- Manager/Admin can retry ReleaseFailed.
- Manager/Admin can return ReleaseFailed for correction and create linked Pending submission.
- Linked successful release resolves the old ReleaseFailed and removes it from blockers/todo.
- UI does not expose internal codes or raw DB errors in normal flow.
- Existing idempotency and duplicate file-name QC still pass.

Required commands:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- focused QC: `npm run qc:pdm-drawing-submission-workbench-recovery`
- disposable mutation lifecycle QC: `npm run qc:pdm-drawing-submission-workbench-mutation`
- transaction candidate validation: `npm run qc:db-provider-contract` and `npm run qc:db-provider-postgres`
- existing regression: `npm run qc:pdm-submission-conflict-duplicate-active`
- existing regression: `npm run qc:pdm-drawing-part-workbench-security`

Command evidence captured on 2026-07-02:

- `npm run build`: passed.
- `npm run qc:pdm-drawing-submission-workbench-mutation`: passed 33/33.
- `npm run qc:pdm-drawing-submission-workbench-recovery`: passed 27/27.
- `npm run qc:db-provider-contract`: passed 35/35.
- `npm run qc:db-provider-postgres`: passed 9/9.
- `npm run qc:pdm-submission-conflict-duplicate-active`: passed 14/14.
- `npm run qc:pdm-drawing-part-workbench-security`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.

Browser/API evidence captured:

- Local 3200 workbench API smoke: `D-0014-MA1`, root `0014`, release-incomplete blocker, recovery link `/submissions/SUB-20260701-2AEBA0CD`.
- `output/playwright/pdm-drawing-submission-workbench-d0014-release-incomplete.png`: workbench UI shows `D-0014-MA1` and `發行未完成`, with no unrelated `D-0009-MA1` or raw internal strings.
- `output/playwright/pdm-submission-detail-d0014-release-failed-recovery.png`: submission detail loads `SUB-20260701-2AEBA0CD`, shows `D-0014-MA1` and `發行未完成`, and does not show `送審明細讀取失敗`.
- Passing disposable mutation lifecycle QC evidence from `npm run qc:pdm-drawing-submission-workbench-mutation` 33/33.
- Workbench ready / cancelled-history fixture state.
- Pending blocker and permission-denied cancel path.
- Cancel Pending success flow.
- Retry ReleaseFailed success flow using the same submission id.
- Return-for-correction flow creating a linked Pending correction.
- Resolved ReleaseFailed low-weight history and actionable submissions exclusion.

Stop conditions:

- RD needs direct production DB mutation or cleanup.
- Mutation validation would need to alter existing local D-0014/user records instead of disposable fixtures.
- Existing schema cannot add required state/fields without destructive migration.
- Current release service cannot safely retry release without changing production/integration configuration.
- Permission model cannot determine submitter/manager/admin authority.
- Same-revision classification would require allowing duplicate active Pending submissions.

## 13. RD Readiness Result

Phase 1 is `RD Implementation Ready` for local development after explicit execution authorization.

No remaining P0/P1 product decision blocker is known for Phase 1. Engineering details such as exact field names, repository class placement, route component naming and QC script implementation are AI/RD decisions as long as the contracts above are preserved.

Phase 2, Phase 3 and Phase 4 are now preserved as `RD Contract Ready` or release-gated backlog:

- Phase 2 master-data completion/writeback and attachment-library upload has purpose, scope, out of scope, implementation contract, data/API/permission/state-machine impact, owner API boundary, transaction/recovery rules, permissions, acceptance, QA/QC evidence, deferred decisions, recovery condition and stop conditions.
- Phase 3 collaboration and dashboard/todo noise reduction has purpose, scope, out of scope, implementation contract, data/API/permission/state-machine impact, collaboration permission model, operational edit-history boundary, dashboard query contract, acceptance, QA/QC evidence, deferred decisions, recovery condition and stop conditions.
- Phase 4 production cutover, compatibility cleanup and historical repair has release-gate handoff contract, migration/compatibility contract, data/API/permission/state-machine impact, dry-run/rollback evidence, deferred decisions, recovery condition and stop conditions.

This document does not authorize Phase 2 or Phase 3 RD implementation by itself. Phase 2 can become RD work only after Phase 1 is implemented / verified and the user or PM explicitly authorizes the Phase 2 boundary. Phase 3 can become RD work only after Phase 2 is implemented / verified and explicitly authorized. Phase 4 requires production release-gate approval.
