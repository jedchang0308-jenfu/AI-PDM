# QA - 圖料工作台資料流與送審安全驗證計畫

Date: 2026-07-01
Related SPEC: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`
Related DEV: `DEV-PDM-DRAWING-PART-WORKBENCH-001`
Status: Prepared / RD Implementation Ready

## 1. Validation Goal

Validate that the upgraded 圖料工作台 can act as the root/drawing/part submission-preparation workbench without becoming an unsafe second source of truth.

Primary quality claim:

```text
圖料工作台可聚合與 inline 編輯，但資料寫入仍回到 owner domain；
送審只凍結 snapshot，不補主資料；
舊上傳送審頁退役；
資料錯誤用人類中文阻擋，不外漏 DB error。
```

## 2. Scope

In scope:

- 圖料工作台 root detail readiness surface.
- Inline edit routing to owner APIs.
- Owner-domain validation and audit.
- Submission readiness API.
- Duplicate attachment filename blocker.
- Submission snapshot persistence.
- Failed/blocked submit audit trail.
- `/upload` retirement behavior.
- Drawing module shortcut route to 圖料 readiness.
- Desktop and mobile visible states.

Out of scope:

- Production deploy.
- Supabase production cutover or remote migration.
- Direct cleanup of existing failed submission data.
- SolidWorks Document Manager integration.
- CAD file rename or mutation.
- Approval matrix redesign.

## 3. Test Data

Required local fixtures:

- A root with one primary MA drawing and one primary part.
- A root with missing primary drawing.
- A root with missing primary part.
- A part missing material.
- A part missing surface treatment.
- A drawing with no eligible attachment.
- A drawing with two selectable attachments that share the same `file_role + original_filename`.
- A drawing/revision that already has an active Pending/InReview submission.

Use disposable local prefixes for write tests, for example `QC-DPW-*`. Do not mutate production or staging data.

## 4. Acceptance Matrix

| ID | Priority | Scenario | Expected result |
|---|---|---|---|
| DPW-UI-001 | P0 | Open 圖料工作台 root detail | Shows root, primary drawing, primary part, readiness and owner-labeled fields |
| DPW-UI-002 | P0 | Inline edit material from 圖料工作台 | UI calls part/variant owner API, not a generic root write |
| DPW-UI-003 | P0 | Inline edit drawing-owned field | UI calls drawing owner API or equivalent owner service |
| DPW-UI-004 | P0 | Save inline edit succeeds | Readiness refetches and audit evidence exists |
| DPW-UI-005 | P0 | Missing primary part/drawing | `送審` disabled; blocker uses Chinese and points to correct section |
| DPW-UI-006 | P0 | Missing material/surface | `送審` disabled; blocker says which料號欄位 must be completed |
| DPW-UI-007 | P0 | Duplicate selected attachment filename | UI blocks before submit and lists duplicate filename |
| DPW-UI-008 | P0 | Direct `/upload` | Does not show old file dropzone or PDM attribute form; redirects or retired-state message appears |
| DPW-UI-009 | P1 | Drawing module `送審` shortcut | Opens 圖料 readiness for the source drawing/root, not generic upload |
| DPW-UI-010 | P1 | Mobile viewport | No horizontal overflow, overlapping CTA, clipped blocker or unreadable table |
| DPW-API-001 | P0 | Readiness API valid root | Returns owner fields, attachments, blockers, warnings, suggested revision |
| DPW-API-002 | P0 | Readiness API crafted cross-company root/drawing | Returns 403/404 without leaking data |
| DPW-API-003 | P0 | POST with valid root, attachment and note | Creates one Pending submission and one snapshot |
| DPW-API-004 | P0 | POST includes forged material/part name | Server ignores/rejects client master data and derives from owner domain |
| DPW-API-005 | P0 | POST duplicate attachment filenames | Returns domain error `duplicate_attachment_filename` with Chinese message |
| DPW-API-006 | P0 | POST duplicate active drawing/revision | Returns conflict with Chinese message; no new Pending submission |
| DPW-API-007 | P0 | Retry same idempotency key after success | Returns same submission id or safe already-created result |
| DPW-API-008 | P0 | Attachment deleted between readiness and POST | POST rejects safely; no orphan submission |
| DPW-DATA-001 | P0 | Successful submission | `submission_snapshots` or equivalent snapshot stores root/drawing/part/attachment/revision/note state |
| DPW-DATA-002 | P0 | Successful submission files | `submission_files.source_master_attachment_id` links selected source attachments |
| DPW-DATA-003 | P0 | Failed/blocked submission | Audit trail or `submission_attempts` records actor, root, blocker/error and time |
| DPW-DATA-004 | P1 | Master data changed after submission | Existing submission snapshot remains unchanged |
| DPW-REG-001 | P0 | Existing drawing-source submission QC | Existing review-only regression remains passing or is intentionally replaced by this package |
| DPW-REG-002 | P0 | Numbering API regression | Existing numbering, drawing, part and attachment APIs remain passing |

### 4.1 RD Readiness Closure Cases

These cases are mandatory because they close the RD review P0/P1 gaps.

| ID | Priority | Scenario | Expected result |
|---|---|---|---|
| DPW-UPLOAD-001 | P0 | Open `GET /upload` directly | Old dropzone/PDM attribute/send-review form is absent; user sees redirect or retired Chinese message |
| DPW-UPLOAD-002 | P0 | Direct `POST /api/submissions` using the old generic create payload | API rejects with `GENERIC_SUBMISSION_RETIRED`; no Pending submission, no file rows, no raw error |
| DPW-UPLOAD-003 | P1 | Existing old submission detail/review route | Historical submission remains readable where permissions allow |
| DPW-OWNER-001 | P0 | Edit part material from 圖料工作台 | Request goes to part/variant owner API; audit action is `numbering.part.variant.update` |
| DPW-OWNER-002 | P0 | Send a part-owned field to drawing owner API | API returns `OWNER_FIELD_FORBIDDEN` with Chinese message |
| DPW-OWNER-003 | P0 | Save with stale `version` or `If-Match` | API returns `OWNER_VERSION_CONFLICT`; no silent overwrite |
| DPW-OWNER-004 | P0 | Inline edit on Released master data | Blocked with `RECORD_STATUS_NOT_EDITABLE` or routed to controlled revision/change flow |
| DPW-REL-001 | P0 | Drawing linked to zero root | Readiness blocks with `drawing_part_link_missing` |
| DPW-REL-002 | P0 | Drawing linked to two active roots | Readiness blocks with `ambiguous_root`; no guessed root |
| DPW-REL-003 | P0 | Root has two primary drawings | Readiness blocks with `multiple_primary_drawings` |
| DPW-REL-004 | P0 | Root has two primary parts | Readiness blocks with `multiple_primary_parts` |
| DPW-REL-005 | P1 | Root primary part is not a manufacturing/submittable part | Readiness blocks with `primary_part_not_manufacturing` |
| DPW-SNAPSHOT-001 | P0 | Successful submission snapshot | Snapshot includes `snapshot_version`, `rules_version`, `snapshot_hash`, source, captured actor/time, root, drawing, part, owner fields, attachments, readiness and note |
| DPW-SNAPSHOT-002 | P0 | Recompute canonical hash from stored `snapshot_json` | Recomputed SHA-256 equals stored `snapshot_hash` |
| DPW-SNAPSHOT-003 | P0 | Edit master material after submission | Stored snapshot material and hash do not change |
| DPW-IDEMP-001 | P0 | Retry same idempotency key after success | API returns existing submission id and does not create duplicate rows |
| DPW-IDEMP-002 | P0 | Parallel submit same key | Exactly one created result; other request returns in-progress/safe existing result |
| DPW-IDEMP-003 | P0 | Parallel submit different keys for same drawing/revision | Exactly one Pending/InReview submission; other request returns duplicate active conflict |
| DPW-IDEMP-004 | P1 | Blocked attempt due to missing material | `submission_attempts` or audit contains `submission.attempt.blocked` with actor/root/blocker |
| DPW-IDEMP-005 | P1 | Simulated file/transaction failure before creation | Attempt is `failed`; no Pending submission exists; compensation/audit is visible |
| DPW-STORAGE-001 | P0 | Two selected attachments have same `file_role + original_filename` | Business blocker appears before DB insert; message is Chinese and lists filename |
| DPW-STORAGE-002 | P1 | Two safe filenames sanitize to same text | Storage keys remain unique because they include `submission_file_id`; no overwrite |
| DPW-STORAGE-003 | P1 | Forced storage-key collision | API fails safely with Chinese domain error, records failed attempt, and creates no Pending submission |

## 5. UI Visible Error Gate

The following must not appear in user-facing UI:

- `Internal Server Error`
- `UNIQUE constraint failed`
- raw SQL table/column names
- stack traces
- raw `/api/...` failure text
- English-only technical constraint messages
- blank white page

Required Chinese examples:

- `送審附件中有重複檔名：{filename}。同一送審包不可使用相同檔名，請先移除或更名後再送審。`
- `此圖號與版次已有待審核送審紀錄，不能重複送出。`
- `主料號尚未填材質，請先補齊料號主資料。`

## 6. Required Commands

Minimum RD verification:

```powershell
npx tsc --noEmit
npm run lint -- --quiet
npm run build
npm run qc:pdm-numbering-api-regression
npm run qc:pdm-drawing-submission-review-only
```

Focused QC to add or update:

```powershell
npm run qc:pdm-drawing-part-workbench-security
```

The focused QC must verify:

- `/upload` retirement.
- Direct generic `POST /api/submissions` retirement.
- readiness API contract.
- owner API rejection and stale version behavior.
- ambiguous relationship blockers.
- duplicate filename blocker before DB constraint.
- snapshot creation and immutability.
- snapshot hash recomputation.
- idempotency retry and parallel-submit behavior.
- storage key uniqueness / collision behavior.
- audit trail for failed/blocked attempts.
- owner API routing.
- Released-record inline edit blocking.

## 7. Browser Evidence

Capture desktop and mobile screenshots for:

- 圖料工作台 root detail with readiness ready.
- 圖料工作台 root detail with blockers.
- Inline edit owner field before/after save.
- Duplicate attachment filename blocker.
- Retired `/upload` route.
- Successful submission confirmation or pending task link.

Suggested paths:

- `output/playwright/pdm-drawing-part-workbench-readiness-desktop.png`
- `output/playwright/pdm-drawing-part-workbench-blocker-desktop.png`
- `output/playwright/pdm-drawing-part-workbench-duplicate-attachment.png`
- `output/playwright/pdm-upload-retired.png`
- `output/playwright/pdm-drawing-part-workbench-mobile.png`

## 8. Stop Conditions

Stop and return to PM/user if:

- RD needs to allow duplicate attachment filenames.
- RD needs to patch master data on a generic upload page.
- RD cannot create snapshot without destructive migration.
- RD needs production deploy, production migration, direct DB mutation or cleanup.
- Owner API boundaries cannot be enforced with the current permission model.
- The only possible implementation would make 圖料工作台 directly write owner tables without validation/audit.

## 9. Pass / Fail

Pass:

- All P0 acceptance cases pass.
- No raw DB/API errors are visible.
- Snapshot evidence proves review data is frozen at submit time.
- Audit evidence exists for owner edits and failed/blocked submit attempts.
- `/upload` no longer functions as a formal upload/send-review page.

Conditional pass:

- `submission_attempts` table is not added, but equivalent failed-attempt audit is proven in `audit_logs`.
- Route names differ from the spec, but contracts and evidence are equivalent.

Fail:

- Generic `/upload` still shows file dropzone/PDM attributes as formal submission.
- Generic `POST /api/submissions` can still create formal Pending submissions.
- Inline edit bypasses owner validation.
- Ambiguous root or multiple primary records are silently guessed.
- Duplicate attachment filename reaches raw DB error in UI.
- Submission review reads live master data instead of frozen snapshot.
- Failed submit leaves neither audit nor safe compensation evidence.
- Released master data can be patched inline only to make submission pass.
