# SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003 - 發行未完成 UI 自救流程

Status: RD Contract Ready / not authorized for implementation
Date: 2026-07-02
Owner: Dev PM
Related DEV: `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`
Parent:

- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`

## 1. Human Decision Brief

Source: 2026-07-02 D-0014-MA1 release-blocking APP validation and follow-up user clarification.

Confirmed facts:

- `D-0014-MA1` could not be released from the UI because the submission package contained wrongly named attachments: `水槽本體2.SLDDRW` and `水槽本體2.SLDPRT`.
- The conflicting released file was `水槽本體2.SLDPRT` from another formal released record.
- The existing UI did not let the user fully resolve this from the front end:
  - no clear release-incomplete diagnosis in human language;
  - no guided attachment correction step inside the release-incomplete path;
  - return-for-correction reused the failed submission package instead of letting the user choose corrected source attachments;
  - same-revision history did not clearly separate actionable blockers from low-weight resolved history.
- The expected user capability is: correct the drawing attachments, create a corrected submission, and complete release without RD/API/manual data repair.

Confirmed product direction:

- The formal send-review entry stays in 圖號 / 圖料 modules.
- The drawing submission workbench may be an independent page.
- Normal UI text must use user-understandable Traditional Chinese.
- Raw internal codes, SQL/constraint messages, English-only technical errors and release-service exception names must not be shown in normal UI.
- UI must explain what the user can do next; disabled primary actions must show a human reason.
- The workbench remains a preparation and submission surface. It does not become the owner of drawing, part, root-link or controlled release data.

Rejected options:

- Tell the user to use RD/API/database repair to fix a normal release-incomplete condition.
- Keep `退回修正` as a blind action that copies failed submission files without a correction preview.
- Hide old `ReleaseFailed` records without showing how they were handled.
- Let users bypass released-filename conflicts by overwriting another item's released file.
- Show `DUPLICATE_RELEASE_FILENAME`, `ReleaseFailed`, `UNIQUE constraint failed` or raw route errors as the primary UI message.

AI assumptions:

- Existing drawing attachment APIs can be reused for upload/delete/restore unless RD discovers a safer owner-domain route already exists.
- The current backend release guard remains authoritative; UI preflight is advisory and must be rechecked on submit/release.
- Exact component names, route helpers and response field names are RD-owned as long as this behavior contract is preserved.

Re-entry triggers:

- User wants to allow overwriting or reusing another item's released filename.
- User wants non-manager users to resolve/release another user's failed submission.
- UI self-recovery requires production data repair, destructive migration, direct DB mutation, or Google Drive file movement outside the existing release gate.
- Attachment correction would change controlled released evidence rather than pre-release source data.

## 2. Problem Statement

The system can detect that a release cannot proceed, but the UI does not yet turn that condition into a solvable user workflow.

Current failure pattern:

```text
User opens drawing submission
  -> sees same-revision or release-incomplete blocker
  -> opens existing submission
  -> cannot replace the bad submitted files
  -> return-for-correction can repeat the same bad package
  -> approve fails again
  -> old failed records continue to confuse the workflow
```

This is not a user training problem. It is a missing UI recovery path.

## 3. UX Intent

Primary user:

- Engineer or Admin preparing a drawing submission.
- R&D Manager/Admin resolving a release-incomplete submission.

Primary task:

- Identify why the release is blocked.
- Correct the source attachments in the drawing-owned attachment library.
- Preview exactly what the corrected submission will contain.
- Create a corrected Pending submission.
- Approve/release without manual backend intervention.

Success:

- User can resolve a D-0014-like stuck workflow using only UI.
- UI shows the blocked filename, conflicting formal record and next action.
- Corrected submission uses selected current drawing attachments, not stale failed submission files.
- Released success marks related unresolved failed same-revision submissions as handled.
- Workbench shows final state as formally released and does not leave an active blocker.

## 4. End-State Architecture

```text
圖號 / 圖料模組
  -> 圖面送審工作台
    -> 發行未完成診斷
    -> 附件整理 / 上傳 / 移除錯掛附件
    -> 發布風險預檢
    -> 修正送審確認
    -> 建立修正 Pending submission
    -> 主管/Admin 審核發布
    -> 同版次紀錄收斂
```

Responsibility boundary:

| Area | Responsibility |
|---|---|
| 圖號附件庫 | Owns drawing source files, upload/delete/restore, revision and attachment category. |
| 圖面送審工作台 | Selects current valid drawing attachments for submission, shows release risk and correction preview. |
| Submission domain | Creates Pending submission, immutable snapshot and source-attachment traceability. |
| Release service | Enforces release guard and creates release package. |
| Lifecycle service | Resolves related same drawing + revision ReleaseFailed records after successful release. |

## 5. Scope

Phase 1 scope:

- Add a release-incomplete recovery panel to workbench and submission detail.
- Show conflict diagnosis in user language:
  - blocked filename;
  - conflicting formal record;
  - current submission status;
  - who can act.
- Add attachment organizer in the workbench:
  - list active drawing attachments;
  - upload new drawing attachment;
  - soft-delete wrong active attachment if permission allows;
  - choose which attachments enter correction submission;
  - show whether each selected attachment is eligible.
- Add release preflight for selected attachments before creating correction submission.
- Add correction preview before `退回修正 / 重新送審`.
- Add clear disabled reason for `送出審核` and `建立修正送審`.
- Add same-revision workflow map:
  - `正在送審中`;
  - `發行未完成，需要處理`;
  - `發行未完成，已處理`;
  - `已取消`;
  - `已發布`.

Out of scope:

- Production deployment or production migration.
- Direct cleanup, deletion or mutation of historical production data.
- Overwriting another item's released file.
- Changing release package format.
- Full dashboard redesign.
- Full collaboration feature.
- Allowing non-authorized users to approve/release.
- Moving Google Drive files outside existing release integration rules.

## 6. Phase Roadmap

### Phase 1 - UI self-recovery vertical slice

Status: RD Contract Ready / not authorized.

Goal:

- Make the D-0014-MA1 failure class solvable through UI.

Main outputs:

- Recovery panel.
- Attachment organizer.
- Release preflight.
- Correction preview.
- Corrected submission creation using selected current attachment IDs.
- Same-revision workflow map.

Entry conditions:

- `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` Phase 1 is implemented / verified.
- User or PM explicitly authorizes this DEV.

Stop conditions:

- Fix requires direct DB mutation, production migration, destructive schema change or release guard weakening.
- UI cannot determine source drawing attachment ownership.
- Current permission model cannot decide who may manage attachments or return for correction.

### Phase 2 - Collaboration-ready correction workspace

Status: RD Contract Ready / deferred.

Goal:

- Allow multiple authorized users to prepare the corrected drawing package without losing owner-domain control.

Main outputs:

- Optional collaboration toggle.
- Field/attachment edit ownership display.
- Correction activity log for pre-release operational trace.
- Clear close/cancel/reopen behavior for collaboration.

Entry conditions:

- Phase 1 implemented / verified.
- User explicitly authorizes collaboration behavior.

### Phase 3 - Worklist and reporting integration

Status: RD Contract Ready / deferred.

Goal:

- Ensure release-incomplete recovery tasks appear only where actionable and old handled records do not distract users.

Main outputs:

- Task/todo filters for unresolved release-incomplete only.
- Low-weight resolved history.
- QC evidence dashboard for stuck-flow prevention.

Entry conditions:

- Phase 1 implemented / verified.
- Dashboard/todo scope explicitly authorized.

## 7. UI Contract

### 7.1 Release-incomplete recovery panel

When a same drawing + revision has unresolved release-incomplete records, show:

```text
發行未完成，需要處理

這個圖號版次已通過審核，但發布時被系統擋下。
原因：附件檔名已被其他正式紀錄使用，不能發布。

衝突附件：
- 水槽本體2.SLDPRT

已使用此檔名的正式紀錄：
- 水槽本體2 / 版次 0.1

下一步：
[修正附件後重新送審] [查看衝突正式紀錄] [查看原送審]
```

Rules:

- First line must use user language, not backend error code.
- Conflict filename and conflicting released record must be visible when available.
- If details are unavailable, show `發布失敗原因不足，請主管或 Admin 查看技術明細。`
- Technical detail may be in collapsible `技術明細`, not primary copy.

### 7.2 Attachment organizer

The workbench attachment section must support:

- Active drawing attachments table/list.
- Columns or equivalent:
  - selected;
  - file name;
  - role/extension;
  - revision;
  - category;
  - eligibility;
  - risk warning;
  - actions.
- Upload action writes to drawing attachment library.
- Delete action is soft-delete only and must ask confirmation:

```text
移除這個圖號附件？
這只會從目前圖號附件庫移除，不會刪除已發布紀錄。
```

Filename risk warning examples:

- `檔名看起來不是目前圖號，請確認是否錯掛。`
- `此檔名已被其他正式紀錄使用，不能發布。`
- `此附件版次與本次送審版次不同。`

### 7.3 Correction preview

Before creating corrected submission, show:

```text
修正送審確認

來源圖號：D-0014-MA1
送審版次：0.1

本次會送出的附件：
- D-0014-MA1.SLDDRW
- D-0014-MA1.SLDPRT

不會沿用的舊附件：
- 水槽本體2.SLDDRW
- 水槽本體2.SLDPRT

處理後：
- 新建一筆待審核送審
- 舊的發行未完成紀錄會保留
- 新送審成功發布後，舊紀錄會標示為已處理
```

Primary CTA:

- `建立修正送審`

Disabled reasons:

- `請至少選擇一個可送審附件。`
- `仍有附件檔名衝突，請先移除或重新上傳。`
- `你沒有權限建立修正送審，請通知主管或 Admin。`

### 7.4 Same-revision workflow map

Same-revision records must be grouped by action relevance:

| User label | Visual weight | Meaning |
|---|---|---|
| `需要處理` | High | Pending/Releasing or unresolved ReleaseFailed blocking current work. |
| `正式紀錄` | Medium | Released/Obsolete terminal state. |
| `已處理` | Low | Resolved ReleaseFailed. |
| `已取消 / 已退回` | Low | Non-blocking pre-release history. |

The workbench must not show an active-looking `送出審核` button when the same revision is already formally released.

## 8. API / Service Contract

Exact route names may vary if behavior is equivalent.

### 8.1 Workbench release preflight

Required behavior:

- Given drawing number, revision and selected attachment IDs, return:
  - attachment eligibility;
  - duplicate selected filenames;
  - released filename conflicts;
  - source ownership mismatch;
  - suggested recovery action.

Suggested route:

```text
POST /api/numbering/drawings/[drawingNumber]/submission-workbench/preflight
```

Request:

```ts
type DrawingSubmissionPreflightRequest = {
  revision: string;
  selectedAttachmentIds: string[];
  correctionOfSubmissionId?: string;
};
```

Response:

```ts
type DrawingSubmissionPreflightResponse = {
  ok: boolean;
  blockers: Array<{
    code: string;
    message: string;
    affectedAttachmentIds?: string[];
    conflictingSubmissionId?: string;
    conflictingDrawingNumber?: string;
    conflictingRevision?: string;
  }>;
  warnings: Array<{ code: string; message: string; attachmentId?: string }>;
  selectedAttachments: Array<{
    id: string;
    fileName: string;
    fileRole: string;
    revision: string | null;
    eligible: boolean;
  }>;
};
```

### 8.2 Return for correction with explicit attachment selection

Existing return-for-correction behavior must be extended so UI can explicitly select corrected attachments.

Suggested route:

```text
POST /api/submissions/[id]/return-for-correction
```

Request addition:

```ts
type ReturnForCorrectionRequest = {
  reason: string;
  selectedAttachmentIds?: string[];
  idempotencyKey?: string;
};
```

Rules:

- If `selectedAttachmentIds` is supplied, the new correction submission must use those current drawing attachments.
- If omitted, service may default to current same-revision eligible drawing attachments, but UI should normally pass explicit IDs.
- Service must not blindly copy failed submission files.
- POST must re-run preflight server-side.
- File copy and submission creation must be transactional/compensated.

### 8.3 Conflict detail hydration

When release failure contains released filename conflict, backend should expose human-usable detail:

```ts
type ReleaseFailureRecoverySummary = {
  submissionId: string;
  drawingNumber: string;
  revision: string;
  userMessage: string;
  conflictFiles: Array<{
    fileName: string;
    fileRole: string;
    conflictingSubmissionId?: string;
    conflictingDrawingNumber?: string;
    conflictingRevision?: string;
    conflictingPackageFilename?: string;
  }>;
  allowedActions: Array<"retry_release" | "fix_attachments" | "return_for_correction" | "view_conflict">;
};
```

Normal UI must use `userMessage`, not parse raw `release_error`.

## 9. Permission Contract

| Action | Submitter | Engineer same company | R&D Manager | Admin |
|---|---:|---:|---:|---:|
| View recovery diagnosis | Yes if can read summary | Yes if same-company summary allowed | Yes | Yes |
| Upload drawing attachment | If has attachment manage permission | If has attachment manage permission | Yes if policy allows | Yes |
| Soft-delete wrong drawing attachment | If has attachment manage permission | If has attachment manage permission | Yes if policy allows | Yes |
| Create correction submission | Submitter if submission policy allows | No by default | Yes | Yes |
| Retry release | No | No | Yes | Yes |
| Approve/release | No | No | Yes | Yes |

Permission-denied copy must explain the next human:

```text
你可以整理附件，但不能核准發布。請通知主管或 Admin 建立/核准修正送審。
```

## 10. Data And State Rules

- Corrected submission must keep `corrects_submission_id`.
- Corrected submission files must record `source_master_attachment_id`.
- Old failed submission remains `ReleaseFailed` until successful correction release.
- Successful correction release sets related unresolved same drawing + revision ReleaseFailed records as resolved.
- Resolved failed submissions remain queryable but do not block and do not appear in primary todos.
- Soft-deleted attachments remain recoverable according to lifecycle policy.
- Released package evidence must never be overwritten by UI correction.

## 11. Failure Recovery

| Failure | Required UI behavior |
|---|---|
| Preflight detects filename conflict | Block create/submit and show conflict file + formal record. |
| Upload succeeds but correction creation fails | Say attachment was saved, submission was not created, and offer retry. |
| Attachment deleted by another user during preview | Re-run preflight, show stale state, require refresh. |
| User lacks correction permission | Show who can act; do not show misleading primary CTA. |
| Release fails again | Keep release-incomplete panel with updated reason and selected package trace. |
| Related failed records cannot be resolved after success | Show manager/admin task; do not hide the inconsistency. |

## 12. RD Acceptance Criteria

- User can open `D-0014-MA1` workbench and see a release-incomplete diagnosis without raw codes.
- UI shows conflict file and conflicting formal record when released filename conflict is known.
- User with attachment permission can upload correctly named drawing attachments from the workbench.
- User with attachment permission can soft-delete wrong active drawing attachments from the workbench.
- User can preview old failed attachments versus corrected current attachments before creating correction submission.
- Correction submission uses selected current drawing attachment IDs and records source attachment traceability.
- Server rejects correction creation when selected attachments still conflict with existing released filenames.
- Same-revision workflow map shows `已發布` as terminal and disables duplicate same-revision submit.
- Resolved old release-incomplete records appear as low-weight `已處理` history.
- Normal UI does not show `DUPLICATE_RELEASE_FILENAME`, `ReleaseFailed`, `UNIQUE constraint failed`, stack traces, SQL, `Internal Server Error`, or raw `/api/...` route failures.

## 13. QA / QC Gate

QA scenarios:

- OP-001: Existing release-incomplete with filename conflict shows human diagnosis.
- OP-002: Wrong active attachment can be soft-deleted by authorized user.
- OP-003: Correctly named attachment can be uploaded and appears in current attachment list.
- OP-004: Preflight blocks selected attachment that still conflicts with released filename.
- OP-005: Correction preview shows included and excluded attachments.
- OP-006: Correction submission is created from selected current attachment IDs.
- OP-007: Manager/Admin approval releases corrected submission.
- OP-008: Old unresolved release-incomplete records become handled history after release.
- OP-009: Engineer without permission sees who can act and cannot approve/release.
- OP-010: Same revision already released disables submit with `此圖號版次已進入正式紀錄...`.

Required verification:

- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run build`
- `npm run qc:pdm-drawing-submission-workbench-recovery`
- New focused QC script for UI self-recovery contract, suggested:
  - `npm run qc:pdm-drawing-submission-ui-self-recovery`
- Browser evidence:
  - desktop 1440/1600 workbench release-incomplete state;
  - correction preview modal/drawer;
  - disabled CTA reason;
  - final released detail page;
  - no visible runtime errors.

Runtime-visible error gate:

- UI cannot pass if normal visible surface contains raw HTTP 4xx/5xx text, `Internal Server Error`, internal route path errors, raw SQL/constraint text, or backend exception codes.

## 14. Authorization Boundary

This document is development planning only.

Authorized now:

- Documentation and task-board indexing.

Not authorized from this document alone:

- RD implementation.
- Production deploy.
- Production migration.
- Direct DB cleanup or historical repair.
- Data deletion.
- Google Drive production file movement beyond existing approved release integration.

Continuation rule:

- `完成 dev_task` must not start this DEV unless `.ai-doc/dev_task.md` is explicitly updated from `Prepared / RD Contract Ready` to an authorized implementation state.

