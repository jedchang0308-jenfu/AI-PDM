# QA - PDM duplicate active submission conflict validation plan

Status: QA Plan Ready
Date: 2026-07-02
Owner: Dev PM / QA
Related DEV: `DEV-PDM-SUBMISSION-CONFLICT-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`

## 1. Quality Claim

```text
重複圖號 + 版次送審是 submission conflict，不是主資料未完成。
系統必須在送出審核前後阻擋重複 active submission，用人類中文說明原因，並保留 audit trail。
```

## 2. Scope

In scope:

- Readiness blocker group classification.
- UI submission confirmation panel state mapping.
- Submit-time duplicate active conflict mapping.
- Idempotency and parallel submit behavior.
- Reviewer-side defensive guard for legacy duplicate active records.
- Raw DB error shielding.
- Audit evidence for blocked duplicate attempts.

Out of scope:

- Production deployment.
- Production migration or cleanup of historical data.
- Full approval workflow redesign.
- Allowing warning-only duplicate active submissions.
- New terminal-status same-revision reuse policy.

## 3. Test Matrix

| ID | Priority | Case | Expected result |
|---|---|---|---|
| PSC-READY-001 | P0 | Readiness with complete source data and no duplicate active submission | No `submission_conflict`; submit state can become enabled after note and attachment rules pass |
| PSC-READY-002 | P0 | Readiness where same drawing + revision has existing `Pending` submission | Blocker code `duplicate_active_submission`, group `submission_conflict`, Chinese message, existing submission summary when available |
| PSC-READY-003 | P0 | Duplicate active plus missing material | UI separates `主資料尚未完成` and `已有進行中的送審`; duplicate is not counted as master-data missing |
| PSC-READY-004 | P1 | Duplicate active plus duplicate attachment filename | UI separates `submission_conflict` and `attachment_conflict`; no raw DB message |
| PSC-UI-001 | P0 | Conflict panel display | Headline is `已有進行中的送審`; primary CTA opens existing submission or task list |
| PSC-UI-002 | P0 | Note missing while source data passes | Disabled reason says note is missing; green ready message does not imply the button should be clickable |
| PSC-UI-003 | P1 | Mobile conflict state | No horizontal overflow, clipped CTA, overlapping cards or unreadable text |
| PSC-API-001 | P0 | POST same drawing + revision while active submission exists | HTTP 409, code `duplicate_active_submission`, group `submission_conflict`, Chinese message, no new Pending submission |
| PSC-API-002 | P0 | Raw DB unique conflict is simulated | UI/API maps to domain `submission_conflict`; no `UNIQUE constraint failed`, table name, SQL or stack trace appears |
| PSC-IDEMP-001 | P0 | Retry same idempotency key after success | Returns existing created submission or idempotent replay; not treated as duplicate conflict |
| PSC-IDEMP-002 | P0 | Parallel same-key submit | At most one submission created; other response is replay/in-progress safe |
| PSC-IDEMP-003 | P0 | Parallel different-key submit for same drawing + revision | At most one active submission created; loser returns `submission_conflict` |
| PSC-AUDIT-001 | P0 | Blocked duplicate active attempt | `submission_attempts` or `audit_logs` records actor, drawing, revision, group, code, message, existing submission id if known and timestamp |
| PSC-REVIEW-001 | P0 | Reviewer opens legacy duplicate active submissions | Approve/release disabled; Chinese duplicate conflict warning shown |
| PSC-REVIEW-002 | P1 | Reviewer rejects/returns one duplicate if workflow permits | Action is audited and does not approve duplicate active submissions |
| PSC-REG-001 | P0 | Existing master-data blockers | Still classified as `master_data_missing` and recover to owner data areas |
| PSC-REG-002 | P0 | Existing duplicate attachment filename blocker | Still blocked, classified as `attachment_conflict`, and message lists filename |

## 4. Required Fixtures

Minimum local fixtures:

- A complete drawing/root/part package with material, surface finish and eligible source attachments.
- A `Pending` submission for the same company + drawing number + revision.
- A missing-material variant of the same or similar drawing package.
- A selected attachment set with duplicate `file_role + original_filename`.
- A legacy/race fixture with two active submissions for the same company + drawing number + revision, created only in local test data.

Fixture rules:

- Use disposable prefixes such as `QC-PSC-*` where possible.
- Do not mutate production data.
- Do not delete historical real submissions as part of QA.
- Clean up only disposable local fixtures if existing project cleanup conventions support it.

## 5. API Evidence

QC must capture:

- Readiness JSON showing `group: "submission_conflict"`.
- POST 409 JSON showing code, group, Chinese message and existing submission summary.
- DB row count before/after duplicate POST proving no second `Pending` submission was created.
- Attempt/audit record for the blocked duplicate.
- Same-key replay response proving idempotency.
- Different-key parallel conflict response.

## 6. Browser Evidence

Capture desktop and mobile screenshots for:

- Ready state with button enabled after note and attachment requirements pass.
- Duplicate active conflict state.
- Mixed missing master data + duplicate conflict state.
- Note-missing state.
- Reviewer duplicate conflict guard.

Suggested artifact paths:

- `output/playwright/pdm-submission-conflict-ready-desktop.png`
- `output/playwright/pdm-submission-conflict-duplicate-desktop.png`
- `output/playwright/pdm-submission-conflict-mixed-blockers.png`
- `output/playwright/pdm-submission-conflict-note-required.png`
- `output/playwright/pdm-submission-conflict-reviewer-guard.png`
- `output/playwright/pdm-submission-conflict-mobile.png`

## 7. Required Commands

Minimum RD verification:

```powershell
npx tsc --noEmit
npm run lint
npm run build
npm run qc:pdm-drawing-submission-review-only
npm run qc:pdm-drawing-part-workbench-security
npm run qc:pdm-submission-conflict-duplicate-active
```

If `qc:pdm-submission-conflict-duplicate-active` does not exist yet, RD must add it or extend an existing focused QC script with equivalent named checks.

## 8. Stop Conditions

Stop and return to PM/user if:

- The implementation would allow duplicate active submissions and rely on reviewer judgment.
- Active vs terminal submission statuses cannot be determined without changing lifecycle policy.
- Reviewer guard requires a product decision because no reject/return/cancel path exists.
- Production migration, production deploy, direct DB mutation, historical cleanup or data deletion becomes required.
- Raw DB constraint text cannot be shielded without changing the repository error boundary.

## 9. Pass / Fail

Pass:

- All P0 cases pass.
- No duplicate active submission is created by normal, repeated or parallel submit.
- Duplicate active conflict is never labeled as `主資料未完成`.
- UI and API messages are human-readable Traditional Chinese.
- Audit evidence exists for blocked duplicate attempts.
- Reviewer approval/release is disabled for legacy duplicate active conflicts.

Conditional pass:

- Current implementation retains a stricter same drawing + revision uniqueness policy across terminal statuses, as long as the visible classification remains `submission_conflict` and no duplicate active path is allowed.

Fail:

- `duplicate_active_submission` appears under a master-data missing headline.
- The UI says source conditions passed but gives no human-readable reason why submit is disabled.
- Raw `UNIQUE constraint failed`, SQL, stack trace or `Internal Server Error` appears in the conflict flow.
- Reviewer can approve a duplicate active submission.
- Blocked duplicate attempt leaves no audit evidence.
