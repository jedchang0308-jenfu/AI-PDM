# SPEC-PDM-SUBMISSION-CONFLICT-001 - Duplicate active submission conflict

Status: Implemented / Verification passed locally
Date: 2026-07-02
Owner: Dev PM
Related DEV: `DEV-PDM-SUBMISSION-CONFLICT-001`
Parent DEV: `DEV-PDM-DRAWING-PART-WORKBENCH-001`
Amends:

- `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
- `.ai-doc/qa/qa-pdm-drawing-part-workbench-data-flow-security-validation-plan-2026-07-01.md`

## 1. Human Decision Brief

Source decision from user review on 2026-07-02:

- `duplicate_active_submission` must not be classified or displayed as `主資料未完成`.
- Duplicate drawing + revision submission must be blocked, not only warned.
- Error messages must be human-readable Traditional Chinese, not raw DB constraint text or English-only exception codes.
- Failed and blocked submission attempts must retain audit trail.
- The first-wins / warning-only option is rejected because it lets duplicate packages enter the review queue and shifts preventable system responsibility to reviewers.
- Old generic upload submission flow remains fully retired from formal submission.

Thinking habits applied in the preceding decision analysis:

- `#批判`: challenged the tempting first-wins flow because it creates hidden duplicate work and inconsistent reviewer responsibility.
- `#效用理論`: compared early blocking against later reviewer-side blocking; early blocking has lower operational cost and lower audit risk.
- `#倫理考量`: reviewers should not be asked to compensate for a preventable system conflict, and users should receive a clear reason at the point of action.
- `#演算法`: separated readiness categories, submit-time race checks, idempotency behavior and reviewer-side legacy conflict handling.

Rejected options:

- Show only a warning and allow duplicate active submissions to proceed.
- Let the reviewer see a warning but still approve while a duplicate is active.
- Treat `duplicate_active_submission` as missing material, missing part, or other master-data incompletion.
- Surface raw messages such as `UNIQUE constraint failed` to users.
- Delete failed duplicate attempts to make the UI look clean.

AI assumptions:

- Current local implementation uses `Pending` as the active created submission status. Future equivalent in-review statuses such as `InReview`, `Reviewing` or `Releasing` must be included in the active set if introduced.
- If the current repository still treats any existing same drawing + revision submission as a duplicate, RD may retain the stricter policy, but the user-facing group must still be `submission_conflict`, not `master_data_missing`.
- Production deployment, production migration, direct DB cleanup, historical duplicate repair and data deletion are out of scope.

## 2. Problem

The current workflow can say the source package is ready, then disable or fail submit because a same drawing + revision submission already exists. In code and UI this may be handled through a generic blocker path that displays `主資料尚未完成，不能送審。`

That is incorrect:

- The drawing number, part number, material and attachments may be complete.
- The real blocker is workflow conflict: another submission already owns the same drawing + revision workflow.
- Mislabeling it as master-data incompletion sends users to the wrong recovery path.
- Raw DB errors or generic `Internal Server Error` messages destroy operator trust and make audit diagnosis harder.

## 3. Product Rule

`duplicate_active_submission` is a submission lifecycle conflict.

It blocks creation of a new active submission for the same company + drawing number + revision, but it is not a master-data quality failure.

Canonical user message:

```text
此圖號與版次已有進行中的送審，不能重複建立。請查看既有送審，或先完成/退回該送審後再處理新版次。
```

When drawing number and revision are known, the UI may use a more specific message:

```text
圖號 {drawingNumber} 版次 {revision} 已有進行中的送審，不能重複建立。
```

## 4. End-State Flow

```text
圖料/圖號送審入口
-> 後端計算 readiness
-> UI 分類顯示 blockers
   -> master_data_missing: 回圖號/料號 owner 資料區補齊
   -> attachment_conflict: 修正附件選取
   -> submission_conflict: 查看既有送審或改走進版/退回流程
   -> state_or_permission_blocked: 依狀態或權限處理
-> 使用者填送審備註並送出
-> 後端重新檢查 readiness + active duplicate
-> 若 duplicate_active_submission: 409 submission_conflict + audit blocked attempt
-> 若通過: 建立 Pending submission + immutable snapshot + audit
```

## 5. Readiness Contract

The readiness blocker contract becomes additive. Existing clients may still read `code`, `message` and `recoveryHref`; new clients must use `group` for UI classification.

```ts
type SubmissionReadinessBlockerGroup =
  | "master_data_missing"
  | "attachment_conflict"
  | "submission_conflict"
  | "state_or_permission_blocked"
  | "system_recoverable";

type SubmissionReadinessBlocker = {
  code: string;
  group: SubmissionReadinessBlockerGroup;
  severity: "blocker";
  message: string;
  recoveryHref: string;
  recoveryLabel?: string;
  existingSubmission?: {
    submissionId: string;
    drawingNumber: string;
    revision: string;
    status: string;
    createdAt?: string;
    submittedByDisplayName?: string;
  };
};
```

Required classification:

| Code | Group | UI headline | Primary recovery |
|---|---|---|---|
| `missing_primary_part` | `master_data_missing` | `主資料尚未完成` | Go to 圖料/料號 owner area |
| `missing_material` | `master_data_missing` | `主資料尚未完成` | Go to material owner field |
| `missing_surface_finish` | `master_data_missing` | `主資料尚未完成` | Go to surface owner field |
| `missing_attachment` | `attachment_conflict` | `缺少可送審附件` | Go to drawing attachment library |
| `duplicate_attachment_filename` | `attachment_conflict` | `附件選取需修正` | Remove or rename source attachment through owner flow |
| `duplicate_active_submission` | `submission_conflict` | `已有進行中的送審` | Open existing submission or return to revision/change flow |
| `drawing_not_submittable` | `state_or_permission_blocked` | `目前狀態不可送審` | Resolve drawing lifecycle state |
| permission denied | `state_or_permission_blocked` | `權限不足` | Ask authorized owner or admin |

UI must not derive the headline from `context.blockers.length` alone. It must group blockers and show each group separately.

## 6. Submit-Time API Contract

Submit routes must re-check duplicate active submission immediately before creating the submission record.

Required behavior on conflict:

- Return HTTP `409`.
- Use error code `duplicate_active_submission` or map legacy `DRAWING_SUBMISSION_DUPLICATE_REVISION` to that domain code at the UI boundary.
- Return group `submission_conflict`.
- Return Traditional Chinese `message`.
- Include `existingSubmission` when resolvable.
- Do not create another `Pending` submission.
- Do not create submission files.
- Do not mutate drawing, part or root master data.
- Record blocked attempt audit.

Example response:

```json
{
  "error": {
    "code": "duplicate_active_submission",
    "group": "submission_conflict",
    "message": "圖號 D-0014-MA1 版次 0.1 已有進行中的送審，不能重複建立。",
    "recoveryTarget": "existing_submission",
    "existingSubmission": {
      "submissionId": "SUB-20260702-ABCDEF12",
      "drawingNumber": "D-0014-MA1",
      "revision": "0.1",
      "status": "Pending",
      "createdAt": "2026-07-02T10:00:00.000Z"
    }
  }
}
```

Raw DB failures such as `UNIQUE constraint failed` must be caught and mapped to the same domain response if they occur as the final defensive layer.

## 7. Idempotency And Concurrency

Required rules:

- Same `company_id + actor_id + idempotency_key` after successful creation returns the existing created submission result.
- A different idempotency key for the same company + drawing number + revision while an active submission exists returns `409 duplicate_active_submission`.
- Parallel same-key submit creates at most one submission and returns replay or in-progress-safe response for the other request.
- Parallel different-key submit creates at most one active submission; losers receive `submission_conflict`.
- Blocked duplicate attempts are retained in `submission_attempts` or equivalent audit with code, group, message, actor, source drawing, revision and time.

Active status set:

```text
Current local active status: Pending
Future active statuses if introduced: InReview, Reviewing, Releasing, or equivalent non-terminal review states
Terminal statuses: Rejected, Cancelled, Released, Obsolete, or equivalent terminal states
```

If terminal same-revision reuse is not explicitly approved by a later policy, same drawing + revision after terminal state must still not be silently duplicated. It should return a separate `revision_already_submitted` or `revision_already_released` conflict under the same `submission_conflict` group.

## 8. Reviewer-Side Guard

New duplicate active submissions should be impossible after submit-time blocking. The reviewer page still needs a defensive guard for legacy data, races or manual database imports.

Reviewer behavior:

- If exactly one active submission exists for company + drawing + revision, review proceeds normally.
- If multiple active submissions exist for company + drawing + revision, approval/release actions are disabled.
- The UI shows `此圖號與版次有重複進行中的送審，請先退回或結案其他送審後再審核。`
- The reviewer may reject or return the duplicate only if the existing workflow supports that action and permission allows it.
- Approval must not be allowed just because the current submission was opened first in the browser.
- Record audit event such as `submission.review.blocked_duplicate_active` or equivalent.

## 9. UI Contract

Submission confirmation panel states:

| State | Button | Visible copy |
|---|---|---|
| Ready | Enabled after note and attachment rules pass | `主資料、附件與送審備註已通過，可以建立待審核 submission。` |
| Missing master data | Disabled | `主資料尚未完成，請回圖號/料號資料區補齊。` |
| Submission conflict | Disabled | `已有進行中的送審，不能重複建立。` |
| Attachment conflict | Disabled | `附件選取需修正。` |
| Note missing | Disabled | `請填寫 5 到 100 字的送審備註。` |
| Runtime/API conflict after click | Disabled until refresh or recovery | Domain-specific Chinese error with recovery CTA |

CTA requirements for `submission_conflict`:

- `查看既有送審`
- `返回圖料工作台`
- `建立新版次` or `進版` only when the controlled revision/change flow is valid for the record

The panel must not show a green "all passed" message while the button is disabled for a blocker. If only the note is missing, the green message may say source data passed, but the disabled reason must clearly say the note is missing.

## 10. DB And Repository Boundary

Application service must perform the domain check before insertion. DB uniqueness remains the last defensive layer, not the primary user-facing behavior.

Minimum repository requirements:

- Provide a query that returns existing active submission summary by `company_id + drawing_number + revision`.
- If current local schema cannot express a partial unique index, QC must prove the service-level guard and the DB failure mapping.
- If a DB uniqueness or transaction conflict happens, map it to `duplicate_active_submission` or the relevant `submission_conflict` code.
- Never expose table names, column names, SQL messages or stack traces to the user.

## 11. Audit Requirements

Audit record for blocked duplicate attempt must include:

- Actor id.
- Company id.
- Source root code if known.
- Drawing number.
- Revision.
- Error code `duplicate_active_submission`.
- Group `submission_conflict`.
- Existing submission id if known.
- Human message shown.
- Idempotency key or attempt id.
- Timestamp.

Audit may be implemented through `submission_attempts.blocker_json`, `audit_logs`, or both. It must be queryable enough for QC to prove the blocked attempt existed.

## 12. RD Implementation Plan

Chosen plan:

- Use early hard blocking. Do not allow first-wins / warning-only duplicate submissions into the review queue.
- Keep the DB unique constraint as the final safety net, but do not depend on raw DB failure as normal control flow.
- Preserve audit for every blocked duplicate attempt.
- Keep the old generic upload submission flow retired.

### 12.1 Implementation order

RD must implement in this order to avoid half-fixed states:

1. Add blocker grouping primitives.
   - Add `group`, `severity`, `recoveryLabel` and optional `existingSubmission` to the drawing submission readiness blocker contract.
   - Keep `code`, `message` and `recoveryHref` backward-compatible for existing callers.
   - Map `duplicate_active_submission` to `submission_conflict`.

2. Add repository/service query for existing same drawing + revision submission.
   - Query by `company_id + drawing_number + revision`.
   - Prefer active statuses first: `Pending` now, plus future `InReview`, `Reviewing`, `Releasing` if introduced.
   - Return summary fields only: submission id, drawing number, revision, status, created time and submitter display name when available.
   - Do not mutate data in this query.

3. Update readiness calculation.
   - If an existing active same drawing + revision submission exists, add blocker `duplicate_active_submission`.
   - The blocker group must be `submission_conflict`.
   - The UI recovery target should be `查看既有送審` when an existing submission id is known; otherwise use the task list/source workflow.
   - Mixed blockers must remain mixed. A source can simultaneously have `master_data_missing` and `submission_conflict`; the UI must show both groups.

4. Update submit-time service guard.
   - Validate idempotency key first.
   - Same successful `company_id + actor_id + idempotency_key` replay returns the existing created result.
   - Different idempotency key with same active drawing + revision returns `409 duplicate_active_submission`.
   - The duplicate guard must execute before file copy/storage and before creating a new submission row.
   - Store blocked attempt audit with code, group, drawing number, revision, existing submission id if known and human message.

5. Shield DB race / uniqueness fallback.
   - If a race reaches DB uniqueness anyway, catch the DB error in the service/API boundary.
   - Map to `duplicate_active_submission` + `submission_conflict`.
   - Remove any temporary files created for the failed attempt if the implementation already started file work.
   - Return only Traditional Chinese domain message; never return SQL, table names, column names, `UNIQUE constraint failed`, stack traces or `Internal Server Error`.

6. Update submission confirmation UI.
   - Group blockers by `group`, not by total blocker count.
   - `submission_conflict` headline: `已有進行中的送審`.
   - `master_data_missing` headline: `主資料尚未完成`.
   - `attachment_conflict` headline: `附件選取需修正`.
   - The submit button disabled reason must state the actionable blocker, not a generic master-data failure.
   - Green "ready" copy can appear only when source data and attachment readiness truly pass; if only note is missing, the disabled reason must say note is missing.

7. Add reviewer-side defensive guard.
   - On approve/release, re-check active submissions for the same company + drawing + revision.
   - If multiple active submissions exist, block approval/release with `409 duplicate_active_submission`.
   - Show `此圖號與版次有重複進行中的送審，請先退回或結案其他送審後再審核。`
   - Record audit action such as `submission.review.blocked_duplicate_active`.
   - Reject/return may remain available if the existing workflow and permission model already allow it.

8. Add focused QC command.
   - Add `npm run qc:pdm-submission-conflict-duplicate-active`.
   - The QC must check readiness classification, submit-time 409 mapping, raw DB shielding, audit payload, idempotency replay, different-key conflict, reviewer guard and UI copy.

### 12.2 Submit algorithm

```text
POST controlled drawing submission
-> authenticate actor and company
-> resolve drawing/root/part submission context
-> read idempotency attempt by company + actor + idempotency_key
   -> if already created: return existing created submission
   -> if in progress: return safe retry/in-progress response if implemented
-> validate note, selected attachments and readiness blockers
   -> if master data / attachment / lifecycle blockers: audit blocked attempt by their groups, return 409
-> query existing active submission by company + drawing + revision
   -> if found: audit blocked duplicate attempt, return 409 duplicate_active_submission/submission_conflict
-> create immutable snapshot, submission files and Pending submission inside the existing repository boundary
-> record created attempt and audit
-> return created submission
-> if DB unique/race failure occurs: clean temporary artifacts, audit conflict, return 409 duplicate_active_submission/submission_conflict
```

Important ordering:

- Idempotency replay is evaluated before duplicate conflict so the same user retry does not become a false duplicate error.
- Different idempotency keys are evaluated as new attempts and must be blocked if an active same drawing + revision submission exists.
- Readiness blocker display and submit-time enforcement must share the same blocker grouping rules.

### 12.3 UI state machine

| UI state | Source readiness | Note | Attachments | Submit button | Message |
|---|---|---|---|---|---|
| Ready | No blockers | 5-100 chars | At least one selected | Enabled | `主資料、附件與送審備註已通過，可以建立待審核 submission。` |
| Note missing | No blockers | Missing/invalid | At least one selected | Disabled | `請填寫 5 到 100 字的送審備註。` |
| Missing master data | `master_data_missing` | Any | Any | Disabled | `主資料尚未完成，請回圖號/料號資料區補齊。` |
| Attachment conflict | `attachment_conflict` | Any | Invalid/duplicate | Disabled | `附件選取需修正。` |
| Submission conflict | `submission_conflict` | Any | Any | Disabled | `已有進行中的送審，不能重複建立。` |
| Mixed blockers | More than one group | Any | Any | Disabled | Show every blocker group separately with its own recovery CTA. |
| Runtime conflict after click | Backend 409 | Any | Any | Disabled until refresh/recovery | Use returned Chinese domain message and recovery CTA. |

UI anti-patterns that must not ship:

- Showing `主資料尚未完成` when the only blocker is `duplicate_active_submission`.
- Showing a green all-passed state while the button is disabled by a submission conflict.
- Asking the reviewer to decide which duplicate should proceed.
- Displaying `UNIQUE constraint failed`, SQL text, table names, stack trace or English-only internal codes.

### 12.4 Audit payload contract

Blocked duplicate attempts must be auditable with this minimum logical payload, even if stored as JSON text:

```json
{
  "code": "duplicate_active_submission",
  "group": "submission_conflict",
  "message": "圖號 D-0014-MA1 版次 0.1 已有進行中的送審，不能重複建立。",
  "companyId": "company-id",
  "actorId": "actor-id",
  "drawingNumber": "D-0014-MA1",
  "revision": "0.1",
  "idempotencyKey": "client-key",
  "existingSubmissionId": "SUB-...",
  "recoveryTarget": "existing_submission",
  "occurredAt": "2026-07-02T00:00:00.000Z"
}
```

Audit privacy rule:

- Audit can store technical identifiers needed for traceability.
- User-facing messages must stay human-readable and must not expose DB internals.

### 12.5 Reviewer guard algorithm

```text
Reviewer clicks approve/release
-> load current submission
-> verify actor permission and current submission status
-> query active submissions with same company + drawing number + revision
   -> if count <= 1: continue normal approval/release flow
   -> if count > 1:
      -> record audit action submission.review.blocked_duplicate_active
      -> return/display duplicate_active_submission submission_conflict message
      -> do not approve or release
```

This guard is defensive only. Normal users should encounter duplicate prevention at readiness/submit-time before reviewer workflow starts.

### 12.6 Rollback and fallback

Because this change is local RD work and not a production migration:

- Rollback is file-level revert of the local implementation changes before commit.
- No production data rollback is in scope.
- No historical duplicate cleanup is in scope.
- If runtime schema cannot support the required audit payload without migration, RD must stop and report the schema gap instead of silently dropping audit evidence.

## 13. Scope

In scope:

- Add blocker group classification to readiness and submit errors.
- Reclassify `duplicate_active_submission` as `submission_conflict`.
- Add UI grouping and Chinese recovery messaging.
- Add submit-time 409 mapping and raw DB error shielding.
- Add existing-submission summary where resolvable.
- Add reviewer defensive guard for legacy/race duplicate active submissions.
- Add or update focused QC checks.

Out of scope:

- Production deployment.
- Production schema migration.
- Direct DB cleanup or historical duplicate repair.
- Reopening the retired generic upload submission flow.
- Redesigning the whole approval workflow.
- Allowing duplicate active submissions with warning-only behavior.
- New terminal-status revision reuse policy beyond conflict classification.

## 14. RD Acceptance

RD implementation is accepted only if all conditions pass:

- `duplicate_active_submission` never appears under a `主資料未完成` headline or equivalent master-data missing classification.
- Readiness API returns `group: "submission_conflict"` for duplicate active submission.
- Submit API returns 409 with Chinese message and no raw DB error.
- Same-key idempotent replay is not misclassified as duplicate conflict.
- Different-key duplicate active submit is blocked and audited.
- UI shows actionable recovery CTA to existing submission or source workflow.
- Reviewer approval/release is blocked if duplicate active submissions already exist.
- Existing master-data blockers still display as master-data blockers.
- Existing duplicate attachment filename behavior remains blocked and classified as `attachment_conflict`.
- A blocked duplicate attempt can be found in audit evidence with `code`, `group`, drawing number, revision and existing submission id when resolvable.

## 15. QA / QC Gate

Focused QA plan:

- `.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`

Required commands after implementation:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm run qc:pdm-drawing-submission-review-only`
- `npm run qc:pdm-drawing-part-workbench-security`
- Add or update focused command: `npm run qc:pdm-submission-conflict-duplicate-active`

Required browser evidence:

- Submission confirmation ready state with enabled button.
- Duplicate active conflict state with `已有進行中的送審` headline.
- Note-missing state that does not pretend everything is actionable.
- Reviewer legacy duplicate guard state.
- Mobile viewport for the conflict panel without overflow or clipped CTAs.

## 16. Stop Conditions

Stop and return to PM/user if:

- RD finds that blocking duplicate active submissions requires production data cleanup or direct DB mutation.
- RD cannot identify active vs terminal statuses with current schema and would need to change the submission lifecycle policy.
- The only possible implementation would allow duplicate active submissions and rely on reviewer judgment.
- Existing reviewer workflow has no safe reject/return path for duplicate legacy records and a product decision is needed.
- Implementation requires production deploy, production migration, destructive migration or data deletion.
- The implementation cannot preserve blocked-attempt audit without a schema migration that has not been authorized.

## 17. Spec Governance

Cross-spec consistency:

- This spec is compatible with the accepted ADR rule that different idempotency keys for the same active drawing/revision are blocked.
- This spec amends the existing blocker contract by adding `group`, `severity` and optional `existingSubmission`.
- This spec narrows the UI rule: blocker count alone must not produce `主資料尚未完成`.
- Existing generic upload retirement remains unchanged.

ADR decision:

- No new ADR is created because the architectural decision is already covered by `ADR-PDM-DRAWING-PART-WORKBENCH-001`: duplicate active submissions are blocked, attempts are auditable, and raw DB errors are not user-facing.
- This document is an implementation addendum for classification, UI recovery and reviewer defensive guard.
- A new ADR should be considered only if the product later chooses warning-only duplicate submissions, terminal-status same-revision reuse, or reviewer-side first-wins approval.

RD readiness review:

- Human product decisions are confirmed.
- DB/API/UI/audit/idempotency/reviewer contracts are explicit.
- No P0/P1 human blocker remains before local RD implementation.
- Production and data cleanup remain stop conditions.

Implementation evidence:

- `src/lib/drawing-submission-workbench.ts`: blocker groups, existing-submission summary, structured error options, submit-time duplicate guard, DB uniqueness fallback shielding, blocked-attempt payload and reviewer duplicate active guard helper.
- `src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts`: grouped Chinese domain error response and generic raw-message shielding.
- `src/app/upload/page.tsx`: grouped blocker UI and duplicate conflict recovery copy.
- `src/app/api/submissions/[id]/approve/route.ts`: reviewer approval/release defensive duplicate active guard and audit.
- `src/components/dashboard.tsx`: reviewer action failures prefer human `message`.
- `scripts/qc-pdm-submission-conflict-duplicate-active.mjs`: focused contract QC.
- Verification passed: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run qc:pdm-drawing-submission-review-only`, `npm run qc:pdm-drawing-part-workbench-security`, `npm run qc:pdm-submission-conflict-duplicate-active`.
- Browser smoke captured duplicate conflict state: `output/playwright/pdm-submission-conflict-duplicate-desktop.png` and `output/playwright/pdm-submission-conflict-mobile.png`.
- Browser UI contract smoke captured route-mocked ready, note-required and mixed blocker states: `output/playwright/pdm-submission-conflict-ready-desktop.png`, `output/playwright/pdm-submission-conflict-note-required.png`, and `output/playwright/pdm-submission-conflict-mixed-blockers.png`.
