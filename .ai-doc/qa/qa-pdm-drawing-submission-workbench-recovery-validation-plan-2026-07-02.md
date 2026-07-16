# QA-PDM-DRAWING-SUBMISSION-WORKBENCH-RECOVERY - 圖面送審工作台與發行未完成恢復驗證計畫

Status: Verification passed locally for Phase 1; Phase 2+ RD Contract alignment preserved
Date: 2026-07-02
Owner: Dev PM / QA
Related DEV: `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
Related SPEC: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`

Supersession note: Section 4.7 remains historical planning context. Future UI real-operation closure must use `.ai-doc/qa/qa-pdm-drawing-submission-ui-real-operation-validation-plan-2026-07-02.md`, which defines the current 26-case browser UI matrix. The focused recovery QC evidence in this file is supporting evidence, not a substitute for the 26 UI cases.

## 1. Purpose

Validate that the new drawing submission workbench fixes the current dead-end workflow without creating unsafe data flow:

- same drawing + revision conflicts are classified by lifecycle status, not by one generic duplicate code;
- `ReleaseFailed` is shown to users as `發行未完成` and has manager/admin recovery actions;
- Pending submissions can be cancelled without deleting records;
- resolved failed-release records stop blocking work and do not pollute main todo;
- user-facing UI never exposes raw DB constraints, internal codes or English-only technical errors.

Current QA result:

- Non-mutating local verification has passed: focused QC command/package entry exists, transaction-boundary candidate is validated, static/regression commands pass, and D-0014 release-incomplete API/browser smoke is captured.
- Disposable mutation lifecycle verification has passed: `npm run qc:pdm-drawing-submission-workbench-mutation` passed 33/33 using temporary local fixture records.
- No production migration, direct DB cleanup, data deletion, provider switch, historical repair or Phase 2+ implementation was performed.

## 2. QA Scope

Phase 1 in scope:

- `/drawings/[drawingNumber]/submission-workbench` route and module CTA routing.
- Workbench readiness data: drawing, root, primary part, revision, attachments and same-revision records.
- Same-revision blocker classification:
  - Pending / Releasing -> `此圖號版次正在送審或發行中...`;
  - unresolved ReleaseFailed -> `發行未完成...需要主管或 Admin 處理`;
  - Released / Obsolete -> `此圖號版次已進入正式紀錄...`;
  - Rejected / Cancelled / resolved ReleaseFailed -> non-blocking history.
- Pending cancellation permission and lifecycle.
- ReleaseFailed retry-release permission and lifecycle.
- ReleaseFailed return-for-correction, linked Pending submission and final resolution relation.
- Dashboard/todo exclusion only for resolved ReleaseFailed.
- Regression coverage for existing idempotency, duplicate attachment filename and retired generic upload protections.

Out of scope for Phase 1 QA:

- Master-data edit/writeback inside the workbench.
- Attachment upload/writeback inside the workbench.
- Collaboration editing.
- Full history report UI.
- Production migration, production deploy, direct DB cleanup, data deletion or historical repair.

## 3. Risk Matrix

| Risk | Severity | QA control |
|---|---:|---|
| Wrong same-revision record blocks the user or points to unrelated drawing data. | P0 | API fixture must assert same company + drawing number + revision filtering and recovery links. |
| `發行未完成` remains unrecoverable. | P0 | Retry and return-for-correction paths must be tested for manager/admin. |
| Non-owner Engineer can cancel or resolve another user's work. | P0 | Permission negative tests for same-company Engineer. |
| Released/Obsolete same revision becomes reusable. | P0 | Terminal-state blocker tests. |
| Rejected/Cancelled/resolved ReleaseFailed still blocks new work. | P1 | Non-blocking history tests plus successful new submission path. |
| Raw DB or internal code leaks to UI. | P1 | Browser and API negative checks for forbidden strings. |
| Resolved ReleaseFailed is hidden everywhere and loses traceability. | P1 | Detail/history accessibility test while main todo stays clean. |
| Phase 2+ work accidentally starts during Phase 1. | P1 | Static scope check: no master-data writeback, attachment upload or collaboration UI required in Phase 1. |

## 4. Acceptance Tests

### 4.1 Route and entry

- 圖號 module `送審` opens `/drawings/[drawingNumber]/submission-workbench`.
- 圖料 module resolves/selects a drawing before opening the same route.
- Legacy `/upload?source=drawing&drawingNumber=...` is not the primary route.
- Workbench shows `送審條件`, `既有紀錄 / 阻擋`, and `送審動作`.

### 4.2 Same-revision classification

- Pending same drawing + revision blocks with `此圖號版次正在送審或發行中，請先查看既有送審或聯絡負責人。`
- Releasing same drawing + revision uses the same in-progress copy.
- Unresolved ReleaseFailed blocks with `發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。`
- Released and Obsolete block with `此圖號版次已進入正式紀錄，不能重複送審同一版次。`
- Rejected and Cancelled show non-blocking history and do not disable submit by themselves.
- Resolved ReleaseFailed shows low-weight history and does not block.
- Workbench must not navigate to a different drawing's existing submission detail.

### 4.3 Pending cancellation

- Submitter can cancel own Pending submission with a Chinese reason or UI default reason.
- R&D Manager and Admin can cancel Pending.
- Same-company Engineer who is not submitter cannot cancel another user's Pending submission.
- Cancellation changes status to `Cancelled` and does not delete submission files, snapshot or row.
- Cancelled record no longer blocks a new same drawing + revision submission.

### 4.4 ReleaseFailed recovery

- Engineer sees responsible guidance but no misleading recovery action they cannot perform.
- R&D Manager/Admin can retry unresolved ReleaseFailed.
- Retry uses the same submission id and transitions through `Releasing`.
- Retry success becomes `Released`; retry failure remains `ReleaseFailed` with a human-readable failure summary.
- R&D Manager/Admin can return ReleaseFailed for correction.
- Return-for-correction creates a linked new Pending submission through `corrects_submission_id` or equivalent.
- Old ReleaseFailed remains unresolved until linked submission is released.
- Linked release success sets `resolved_by_submission_id` and `resolved_at` or equivalent on the old ReleaseFailed.
- Linked cancellation or rejection does not resolve the old ReleaseFailed.

### 4.5 UI language and safety

- Normal UI must not display:
  - `duplicate_active_submission`;
  - `ReleaseFailed`;
  - `UNIQUE constraint failed`;
  - `submission_conflict`;
  - `controlled exception`;
  - raw SQL, stack trace or `Internal Server Error`.
- Permission-denied messages explain who can act in Traditional Chinese.
- Browser evidence covers desktop and mobile viewports without text overlap, clipping or horizontal overflow.

### 4.6 Regression

- Existing duplicate active submission regression remains passing.
- Existing drawing-part workbench security regression remains passing.
- Existing idempotency behavior remains passing: same successful idempotency key returns existing result; different key for active same drawing + revision is blocked.
- Duplicate attachment filename protections still block before raw DB failure.

### 4.7 Operation scenario validation matrix

QC must validate the workbench through actual operation scenarios, not only by command results. Each scenario records role, route, fixture drawing, revision, submission id, viewport, screenshot or DOM evidence, visible error sweep result and API payload excerpt when relevant.

| ID | Scenario | Role | Preconditions | Operation steps | Expected result | Required evidence |
|---|---|---|---|---|---|---|
| OP-001 | 圖號模組送審入口 | Engineer | Existing drawing with available submission context | Open 圖號模組, select drawing, click `送審` | Browser opens `/drawings/[drawingNumber]/submission-workbench`; page title is `圖面送審`; source drawing matches the selected drawing | URL, selected drawing, screenshot, API drawing number |
| OP-002 | 圖料模組送審入口 | Engineer | Root has one clear primary / MA drawing | Open 圖料/主根號 workbench, click drawing submission action | System resolves/selects the drawing before opening the same workbench route; root and primary part context are visible | URL, root, drawing number, primary part evidence |
| OP-003 | Ambiguous drawing selection | Engineer | Root has no clear primary drawing or multiple eligible drawings | Click submission action from 圖料 context | Submission is blocked until the user selects a specific drawing; no blank generic upload page appears | Screenshot of selection/blocker state and no visible runtime error |
| OP-004 | Legacy compatibility route | Engineer | Legacy URL is still available | Open `/upload?source=drawing&drawingNumber=...` | Compatibility route either redirects to or renders the drawing workbench contract; it must not show the generic Windows upload/PDM attribute form | URL, screenshot, forbidden generic form check |
| OP-005 | Ready-to-submit happy path | Engineer | Same drawing + revision has no blocking same-revision record; master data and eligible attachments are present | Open workbench, select allowed attachment(s), enter 5-100 char note, click `送出審核` | Submit button is enabled only after required note and attachment conditions pass; successful submission creates Pending record for the same drawing/revision | Screenshot before submit, submit result, new submission id, API payload |
| OP-006 | Missing note / invalid note length | Engineer | Otherwise ready context | Leave note blank, enter too-short note, enter over-limit note | Submit remains disabled or returns Chinese field-level reason; no submission is created | Button state, Chinese validation text, submission count unchanged |
| OP-007 | No eligible attachment selected | Engineer | Drawing has eligible and/or ineligible attachments | Deselect all attachments or select only ineligible attachments | Submit is blocked with Chinese reason explaining attachment requirement | Attachment list, selected count, disabled reason |
| OP-008 | Pending same-revision blocker | Engineer | Existing Pending record for same drawing + revision | Open workbench | Workbench shows `此圖號版次正在送審或發行中...`; submit is blocked; `查看既有送審` opens the matching Pending record | Workbench screenshot, linked submission id, detail page drawing number |
| OP-009 | Releasing same-revision blocker | Engineer / Manager | Existing Releasing record for same drawing + revision | Open workbench | Same in-progress blocker appears; no duplicate submission can be created | API blocker code, UI Chinese copy, submit blocked |
| OP-010 | Unresolved ReleaseFailed blocker | Engineer | Existing unresolved ReleaseFailed for same drawing + revision | Open workbench and detail link | Workbench uses `發行未完成` copy; Engineer sees guidance and no unauthorized recovery action | Workbench screenshot, detail screenshot, forbidden string sweep |
| OP-011 | Released / Obsolete same-revision blocker | Engineer | Existing Released or Obsolete record for same drawing + revision | Open workbench | Submit is blocked with `此圖號版次已進入正式紀錄...`; UI guides user to create a different revision instead of resubmitting same revision | Screenshot, disabled reason, API terminal status |
| OP-012 | Rejected / Cancelled non-blocking history | Engineer | Existing Rejected or Cancelled same drawing + revision; no active/terminal blocker | Open workbench | History is visible with low weight; submit can proceed if other requirements pass | History screenshot, submit enabled after requirements pass |
| OP-013 | Resolved ReleaseFailed non-blocking history | Engineer | Old ReleaseFailed has `resolved_by_submission_id` | Open workbench | Old failure appears only as non-blocking/low-weight history and does not appear as a blocker or main todo item | Workbench screenshot, dashboard/todo check |
| OP-014 | Existing submission detail navigation correctness | Engineer / Manager | Workbench blocker includes existing submission link | Click `查看既有送審` | Detail page opens the linked submission for the same drawing; it must not route to unrelated drawings such as another drawing number | Source drawing, linked submission id, detail drawing number |
| OP-015 | Pending cancel by submitter | Submitter | Own Pending submission exists | Open detail, click `取消送審`, confirm/default reason | Status becomes `Cancelled`; row/files/snapshot remain; same revision no longer blocks new work | Before/after status, lifecycle event, workbench unblock evidence |
| OP-016 | Pending cancel by Manager/Admin | R&D Manager / Admin | Pending submission exists in same company | Open detail, cancel with reason | Status becomes `Cancelled`; audit/lifecycle actor is manager/admin | Actor, reason, status, audit/lifecycle evidence |
| OP-017 | Pending cancel denied for non-owner Engineer | Engineer | Another user's Pending submission exists in same company | Attempt cancel by API or UI if action is visible | Action is hidden or denied with human Chinese message explaining who can cancel; status unchanged | UI/action absence or API 403, Chinese error, unchanged status |
| OP-018 | Retry ReleaseFailed success | R&D Manager / Admin | Unresolved ReleaseFailed exists and release stub/service can succeed | Open detail, click `重新發行` | Same submission id transitions through Releasing and becomes Released; no new submission is created | Submission id before/after, status sequence, no duplicate id |
| OP-019 | Retry ReleaseFailed failure | R&D Manager / Admin | Release service fails deterministically | Click `重新發行` | Submission remains `ReleaseFailed`; UI shows human-readable failure summary without raw stack/SQL | Status, visible error text, forbidden string sweep |
| OP-020 | Return ReleaseFailed for correction | R&D Manager / Admin | Unresolved ReleaseFailed exists | Click `退回修正` and confirm | New linked Pending submission is created; old ReleaseFailed remains unresolved until the linked submission is released | Old id, new id, `corrects_submission_id`, old unresolved state |
| OP-021 | Linked correction released | R&D Manager / Admin | Linked Pending correction exists | Approve/release linked correction | New submission becomes Released; old ReleaseFailed gets `resolved_by_submission_id`/`resolved_at`; old record no longer blocks or appears in actionable todo | Both records, workbench blocker absence, dashboard/todo exclusion |
| OP-022 | Linked correction rejected/cancelled | R&D Manager / Admin | Linked correction exists | Reject or cancel linked correction | Old ReleaseFailed remains unresolved and still blocks same revision until handled again | Status of both records, blocker still present |
| OP-023 | Duplicate active submission race / idempotency | Engineer | Ready fixture can submit | Replay same idempotency key and submit parallel/different key attempts | Same key returns existing result; different key cannot create a second active same drawing + revision submission; raw DB unique errors are hidden | API results, submission count, UI Chinese conflict |
| OP-024 | Permission and company scope | Cross-company or unauthorized user | Drawing/submission belongs to another company or restricted scope | Attempt to open workbench/detail/action | Access is denied or restricted by current policy; no cross-company data leak in UI/API | HTTP status, redacted payload, screenshot if UI route |
| OP-025 | Dashboard/todo de-noising | Submitter / Manager | Unresolved and resolved ReleaseFailed fixtures both exist | Check workbench, dashboard, todo/adaptive-task surfaces | Unresolved actionable records remain findable; resolved ReleaseFailed is removed from main actionable queues but remains traceable through history/detail | Dashboard/todo screenshot or API payload, detail link evidence |
| OP-026 | Visible error hard gate | Any | Local server and fixture data available | Hard reload affected routes and perform main operations | No visible `HTTP 4xx/5xx`, `Internal Server Error`, `Not Found`, `/api/...` failure banner, `.inline-error`, or unexpected all-empty critical counts | Route list, viewport, visible error sweep notes |
| OP-027 | Desktop/tablet/mobile layout | Any | Same fixture set used across viewports | Verify 1440, 1024, 768 and 320 width surfaces | No horizontal overflow, overlap, clipping, unreadable disabled reason, or hidden primary CTA; scroll behavior is understandable | Screenshots or DOM measurements for each viewport |
| OP-028 | Forbidden technical language sweep | Any | Workbench/detail/error states available | Search visible text after each blocker/recovery path | Normal UI does not show `duplicate_active_submission`, `ReleaseFailed`, `UNIQUE constraint failed`, `submission_conflict`, raw SQL, stack trace, or English-only permission errors | Text sweep result and screenshot for error states |

### 4.8 Operation-level FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 從圖號/圖料入口導到錯誤圖號或錯誤送審明細 | Route parameter、link href 或查詢條件沒有綁定同一 drawingNumber / revision / company | 使用者可能處理別人的或無關圖面的送審 | OP-001、OP-002、OP-014 比對來源圖號、API payload、detail page 圖號 | P0 | 每個入口與明細連結都要驗證 source drawing = destination drawing |
| 頁面可開但實際是泛用上傳頁或空白頁 | Legacy `/upload` contract 未退場乾淨、workbench component fallback 錯誤 | 使用者在送審階段被迫補錯地方的資料，流程混亂 | OP-003、OP-004、OP-026 visible error sweep | P0 | 禁止 generic upload form 作為圖面正式送審主流程 |
| 可送出狀態與實際 backend 規則不一致 | Frontend readiness 與 submit API 分類不同步 | 按鈕可按但送審失敗，或已通過卻不能送出 | OP-005 到 OP-013、OP-023 同時檢查 UI disabled reason 與 API response | P0 | 每個 blocker 都要有 UI 與 API 對應證據 |
| 使用者看見 raw code / SQL / 英文技術錯誤 | Exception 未轉譯、DB constraint 未被 domain error 包裝 | 使用者不知道如何處理，也暴露內部實作 | OP-019、OP-023、OP-028 | P1 | 所有 normal UI error 走人類中文文案與 forbidden string sweep |
| 權限錯誤造成不該取消/重發/退回的人可操作 | UI 隱藏不足或 API 缺 guard | 送審責任被破壞，資料流不安全 | OP-017、OP-018、OP-020、OP-024 | P0 | UI 與 API 均驗證 submitter / Engineer / Manager / Admin |
| Resolved ReleaseFailed 清得太乾淨而失去追溯 | De-noising 查詢直接排除所有歷史 | 主管無法追查發行未完成曾如何處置 | OP-013、OP-021、OP-025 | P1 | 主工作佇列低噪音，但 history/detail 保留 |
| 手機或小視窗無法完成高風險操作 | CTA、錯誤訊息或表格在小 viewport 裁切/重疊 | 現場使用者無法送審或誤判狀態 | OP-027 | P1 | 320/768/1024/1440 viewport 截圖或 DOM overflow 證據 |

## 5. Phase 2+ Contract Checks

These are not Phase 1 executable tests. They are readiness guards for future phases.

Phase 2 gate:

- Workbench master-data writeback must use owner-domain APIs.
- Submit after writeback must snapshot the saved owner data.
- Stale version and permission failures must show Chinese recovery copy.
- Attachment upload must land in the drawing attachment library before submission snapshot.

Phase 3 gate:

- Collaboration access must not bypass owner-domain field permissions.
- Operational edit history is not formal controlled release evidence.
- Resolved ReleaseFailed is hidden from main todo but still available as low-weight history.

Phase 4 gate:

- Production migration/cutover requires deployment-release gate, backup, rollback, dry-run classification and smoke evidence.
- Historical repair must classify records and must not delete evidence to clean UI.

## 6. Evidence Required

Required commands after RD implementation:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `npm run qc:db-provider-contract`
- `npm run qc:db-provider-postgres`
- `npm run qc:pdm-drawing-submission-workbench-recovery`
- `npm run qc:pdm-drawing-submission-workbench-mutation`
- `npm run qc:pdm-submission-conflict-duplicate-active`
- `npm run qc:pdm-drawing-part-workbench-security`

Evidence captured on 2026-07-02:

- `npm run build`: passed.
- `npm run qc:pdm-drawing-submission-workbench-mutation`: passed 33/33 using disposable local fixture records; no existing D-0014/user workflow records were mutated.
- `npm run qc:pdm-drawing-submission-workbench-recovery`: passed 27/27.
- `npm run qc:db-provider-contract`: passed 35/35.
- `npm run qc:db-provider-postgres`: passed 9/9; live Postgres probe skipped because `PDM_POSTGRES_URL` is not configured.
- `npm run qc:pdm-submission-conflict-duplicate-active`: passed 14/14.
- `npm run qc:pdm-drawing-part-workbench-security`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 14/14.
- `npx tsc --noEmit --pretty false`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Local 3200 API smoke for `GET /api/numbering/drawings/D-0014-MA1/submission-workbench`: HTTP 200, drawing `D-0014-MA1`, root `0014`, one release-incomplete blocker, recovery link `/submissions/SUB-20260701-2AEBA0CD`.
- Browser smoke screenshot `output/playwright/pdm-drawing-submission-workbench-d0014-release-incomplete.png`: workbench UI shows `D-0014-MA1` and `發行未完成`, not unrelated `D-0009-MA1`, raw SQL, `ReleaseFailed`, `duplicate_active_submission`, `UNIQUE constraint failed` or `Internal Server Error`.
- Browser smoke screenshot `output/playwright/pdm-submission-detail-d0014-release-failed-recovery.png`: submission detail `SUB-20260701-2AEBA0CD` loads, shows `D-0014-MA1` and `發行未完成`, and does not show `送審明細讀取失敗`.
- Runtime defect fixed before evidence capture: old local SQLite files could fail during bootstrap schema index creation with `no such column: resolved_by_submission_id`; new release-recovery indexes are now created by runtime migration after lifecycle schema migration.

Pre-QC static readiness checks before running full validation:

- `src/app/api/submissions/[id]/cancel/route.ts` exists and returns Traditional Chinese messages.
- `src/app/api/submissions/[id]/retry-release/route.ts` exists and is restricted to R&D Manager/Admin.
- `src/app/api/submissions/[id]/return-for-correction/route.ts` exists and creates a linked Pending correction.
- canonical `/drawings/[drawingNumber]/submission-workbench` route exists or old route clearly redirects to it.
- workbench API returns `sameRevisionRecords`, `blockers` and `nonBlockingHistory`.
- detail UI labels unresolved `ReleaseFailed` as `發行未完成`.
- `package.json` exposes `qc:pdm-drawing-submission-workbench-recovery`.
- `package.json` exposes `qc:pdm-drawing-submission-workbench-mutation`; this command must seed disposable local records and must not mutate existing D-0014/user workflow records.
- focused QC checks same-revision classification, recovery actions, de-noising and forbidden UI/API text.
- transaction candidate validation confirms return-for-correction cannot be blocked by an unresolved failed-release uniqueness conflict and that linked Pending creation plus old ReleaseFailed relation update are transactional, or records a non-destructive RD fix before QC proceeds.
- normal UI/API responses do not expose `UNIQUE constraint failed`, `duplicate_active_submission`, raw SQL or `Internal Server Error`.

Captured browser/API and lifecycle evidence:

- Release-incomplete blocker, detail-page loading and forbidden UI string negative checks for the D-0014 stuck-record case are covered by existing local API/browser evidence.
- Disposable mutation fixtures cover ready/cancelled-history behavior, Pending blocker/permission-denied cancel path, cancel Pending success, retry ReleaseFailed success, return-for-correction linked Pending creation, resolved ReleaseFailed low-weight history and actionable submissions exclusion.
- Existing local D-0014 data was not used for mutation validation.

## 7. Stop Conditions

QA must stop and return to RD/PM if:

- the implementation requires production migration, direct DB cleanup, data deletion or provider switch;
- the system cannot determine submitter/R&D Manager/Admin authority;
- same-revision classification would require allowing duplicate active Pending submissions;
- ReleaseFailed cannot be retried or returned for correction without changing release-service ownership;
- raw internal codes or SQL errors appear in normal UI;
- the workbench opens or links to an unrelated drawing's submission record;
- mutation QC would need to alter existing local D-0014/user records instead of disposable fixtures;
- Phase 2+ writeback/collaboration work is mixed into Phase 1 without explicit authorization.

## 8. QC Output

QC report should record:

- commands run and pass/fail result;
- fixture drawing number, revision and submission ids used;
- operation scenario IDs executed and pass/fail result;
- screenshots or API payload excerpts for each lifecycle state;
- role, route, viewport and source module for every UI operation scenario;
- visible error sweep result for workbench, submission detail, dashboard/todo and recovery action surfaces;
- confirmation that no forbidden UI text appears;
- confirmation that production deploy/migration/data cleanup was not performed.
