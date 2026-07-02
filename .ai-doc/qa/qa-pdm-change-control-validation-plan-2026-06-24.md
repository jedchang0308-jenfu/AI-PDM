# QA Validation Plan: PDM Change Control Revision / Part / BOM Flow

Date: 2026-06-24  
Task: `DEV-PDM-CHANGE-CONTROL-001`  
Mode: QA validation plan  
Status: Evidence captured for Phase 1-5 local implementation; retained as QA acceptance contract
Source spec: `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`  

2026-06-29 PM consistency note: this QA plan was created before RD implementation, but `.ai-doc/dev_task.md` now records Phase 1-5 local implementation and QC evidence. Use this file as the acceptance contract and historical QA plan; do not interpret older "before RD implementation" wording as current task state.

## 1. Purpose

This QA plan defines the validation contract for the planned PDM change-control package covering:

- Drawing revision flow.
- Form / Fit / Function judgement.
- Replacement part-number draft flow.
- Reserved draft number recycle rules.
- BOM impact and reconfirmation rules.
- Reviewer confirmation and audit evidence.

The goal is to prove the system is low-friction for draft work while still enforcing controlled boundaries once a part number, drawing, BOM, or review enters the PDM-controlled network.

## 2. QA Role Boundary

QA defines what must be verified and how QC should verify it. QA does not modify product code.

QC may only mark this plan as passed after RD implementation exists and QC has collected reproducible evidence through UI, API, data, and audit checks.

## 3. Scope

In scope:

- Drawing revision entry flow, expected on `/numbering/drawings` or the implemented revision route.
- Part-number draft list and creation flow, expected under the numbering module.
- Release/review flow, expected on `/numbering/approvals`.
- BOM draft and review impact flow, expected on `/bom/workbench` and `/bom/reviews`.
- API and repository behavior for part drafts, replacement links, FFF assessments, reviewer confirmations, BOM reconfirmation flags, and audit events.
- Visible error sweep and viewport sanity for all affected UI routes.

Out of scope:

- Production deployment.
- Supabase production/cutover.
- Automatic CAD file editing.
- Automatic released BOM modification.
- SolidWorks real-machine add-in operation unless RD explicitly includes it in the implementation scope.
- Full CAD OCR accuracy validation beyond the part-number read/manual-correction comparison gate.

## 4. Assumptions

- `DEV-PDM-CHANGE-CONTROL-001` was specification-only when this QA plan was created. As of the 2026-06-29 PM consistency pass, local Phase 1-5 implementation and QC evidence are captured in `.ai-doc/dev_task.md`.
- Exact route names may differ after RD implementation; QC must map this plan to the implemented route names and record the mapping.
- Part numbers have no revision.
- Drawing numbers have revisions and must not use `V` prefix.
- BOM has its own revision but does not directly store drawing revision in v1.
- Reserved draft number recycle is allowed only before the number crosses the controlled boundary.
- Cross-spec UI vocabulary rule: `QA-CHG-010` checks change-control module/domain states, not the global lifecycle main-list badge vocabulary. After `DEV-PDM-LIFECYCLE-ACTIONS-001`, daily main lists should map module states into `草稿 / 審核中 / 正式` plus `detailTags`; this QA plan must not fail a correct lifecycle UI merely because `待審核` is surfaced as `審核中` in the main badge.

## 5. Test Environment

| Item | Requirement |
|---|---|
| App URL | `http://127.0.0.1:3000` or the RD-provided local URL |
| Browser | Chrome or Playwright browser with hard refresh before UI evidence |
| Database | Local test DB or approved staging target; production prohibited |
| Accounts | RD/Engineer, release reviewer, part-number manager, BOM owner/Admin |
| Files | Small valid drawing/CAD/PDF test files with controllable part-number metadata |
| Evidence | Screenshots, API responses, DB snapshots, audit event excerpts, command output |

## 6. Entry Criteria

QC may start execution only when:

- RD identifies the implementation commit or branch.
- Affected migrations or schema changes are applied to the test environment.
- App starts without visible runtime error.
- User can log in as required roles.
- Affected routes render.
- RD provides or seeds test data for drawing, part, replacement, and BOM scenarios.
- Static checks pass at minimum:
  - `npx.cmd tsc --noEmit`
  - `npm.cmd run lint`
  - Any RD-added focused QC command for `DEV-PDM-CHANGE-CONTROL-001`

If any entry criterion is missing, QC result is `blocked`, not failed.

## 7. Test Data

Create or seed these controlled fixtures:

| Fixture | Purpose |
|---|---|
| Source drawing `D-CHG-001-MA1` revision `1` | Base drawing for original revision flow |
| Source part `P-CHG-001-001` | Original part number |
| Replacement draft `P-CHG-001-002` | New part created by confirmed FFF impact |
| Self-made item | Requires drawing upload and part-number comparison before submission |
| Purchased item | Does not require RD reason/attachment before review |
| Standard item | Does not require RD reason/attachment before review |
| Released BOM `BOM-REL-CHG-001` using old part | Must not be auto-modified |
| Unreleased BOM draft `BOM-DRF-CHG-001` using old part | Must be marked `需重新確認` after replacement release |
| Reserved draft number unused | Used for recycle/cooling-period tests |
| Controlled part number | Used to prove recycle is forbidden after controlled boundary |

## 8. Acceptance Criteria

| ID | Acceptance criterion | Evidence required |
|---|---|---|
| `QA-CHG-001` | Revision flow provides reason category and three-state Form/Fit/Function judgement | Screenshot or DOM evidence |
| `QA-CHG-002` | All FFF `無影響` allows original part number and defaults BOM decision to `BOM 不進版，待審核者確認` | UI state + submission payload |
| `QA-CHG-003` | Reviewer must click `確認 BOM 不進版` before approving no-impact case | UI evidence + audit event |
| `QA-CHG-004` | Any FFF `疑似影響` marks case high risk and reviewer must choose `退回補新料號` or `確認沿用原料號` | Review UI + decision audit |
| `QA-CHG-005` | Any FFF `確認影響` blocks original-part submission until a new part-number draft and matching drawing part number exist | UI disabled reason + API rejection |
| `QA-CHG-006` | Confirmed FFF impact keeps original drawing number and creates only a replacement part number | DB/API evidence |
| `QA-CHG-007` | Self-made replacement part cannot be submitted without a new drawing whose read/corrected part number equals the new part number | UI/API negative evidence |
| `QA-CHG-008` | Purchased/standard replacement part does not force RD reason or attachment | UI/API success evidence |
| `QA-CHG-009` | Single part-number draft list shows draft type labels: `全新料號`, `替代料號`, `圖號進版產生` | Screenshot |
| `QA-CHG-010` | Draft statuses are limited to `草稿`, `待審核`, `已發行`, `需重新確認`, `作廢` | UI/API/DB evidence |
| `QA-CHG-011` | Reserved draft number enters 7-day recycle cooling period after obsolete, with immediate recycle allowed for creator or part-number manager | UI/API/audit evidence |
| `QA-CHG-012` | Controlled part numbers cannot be recycled after BOM reference, replacement link, drawing upload, or review submission | API rejection + audit evidence |
| `QA-CHG-013` | Recycled reserved number does not show a recycle badge to normal users, but audit event remains searchable | UI + audit evidence |
| `QA-CHG-014` | Replacement release marks old part as replaced while old released BOM remains unchanged | DB/API comparison |
| `QA-CHG-015` | Unreleased BOM drafts containing replaced part are marked `需重新確認` and cannot be submitted directly | UI/API rejection |
| `QA-CHG-016` | BOM editing may still use a replaced part only after visible warning and user confirmation | UI evidence |
| `QA-CHG-017` | FFF judgement history records each submission and refilled judgement after rejection, not every field edit | Audit/history evidence |
| `QA-CHG-018` | Reviewer confirmation records result, reviewer, time, and required action | Audit/history evidence |
| `QA-CHG-019` | Affected UI has no visible runtime errors and no broken critical counters | Visible error sweep evidence |
| `QA-CHG-020` | 320, 768, 1024, and 1440 px viewports have no critical overlap, clipping, unreadable controls, or horizontal overflow | Screenshot or Playwright viewport evidence |

## 9. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| FFF 確認影響仍允許沿用原料號 | UI disabled rule or backend guard missing | 違反料號無版次與 FFF 換料號原則 | UI and API negative test | P0 | `TC-REV-FFF-003`, API direct post rejection |
| 圖面料號與新料號不一致仍可送審 | OCR/manual correction not validated server-side | PDM 主資料錯誤 | Upload mismatch test | P0 | `TC-REV-FFF-005` |
| 疑似影響被核准後仍留疑似狀態 | Reviewer decision missing | 審核結論模糊，稽核無法判定 | Review audit test | P0 | `TC-REVIEW-002` |
| 預留號已進入受控邊界仍被回收 | Controlled-boundary predicate incomplete | 料號重用造成追溯失效 | API recycle rejection test | P0 | `TC-DRAFT-006` |
| 已發行 BOM 被自動替換 | BOM update automation too aggressive | 受控 BOM 被未授權修改 | DB before/after comparison | P0 | `TC-BOM-002` |
| 未發行 BOM 草稿未標記重新確認 | Replacement event did not propagate | 新 BOM 可能帶入已被取代料號 | BOM draft list and submit test | P1 | `TC-BOM-001` |
| 外購件/標準件被要求上傳圖面 | Item-type gate over-applied | 低摩擦流程被破壞 | Purchased/standard submission tests | P1 | `TC-DRAFT-003`, `TC-DRAFT-004` |
| 一般使用者看到回收歷史標記 | Audit data leaks into normal UI | 使用者困惑、增加心理負擔 | Normal user UI check | P2 | `TC-DRAFT-008` |
| UI 訊息太多導致 RD 看不懂下一步 | Form combines too many rules on main screen | 誤判或放棄流程 | 5-second CTA/disabled reason check | P1 | UI manual review and viewport checks |
| 審核者確認動作沒有留痕 | Audit event omitted | ISO/QMS 證據不足 | DB/audit query | P0 | `TC-AUDIT-001`, `TC-AUDIT-002` |

## 10. Phase Gates

This plan has a final acceptance scope, but QC must not treat unfinished later phases as failures for earlier RD slices. Each phase can pass independently only within its declared scope.

| Phase | Local pass criteria | Cases / evidence |
|---|---|---|
| Phase 1 Data Model And Domain Service | Draft model exists; controlled-boundary service exists; recycle and submit guards are testable; optimistic-lock conflict is testable; no UI pass required | API/data checks for `QA-CHG-011`, `QA-CHG-012`; focused command `qc:pdm-change-control` or RD-provided equivalent |
| Phase 2 Part Draft Module | Single draft list exists; three draft labels exist; reserved draft recycle works; same-source warning and `needs_reconfirmation` are testable | `TC-DRAFT-001` to `TC-DRAFT-008`; visible error sweep for draft routes |
| Phase 3 Drawing Revision Flow | FFF three-state flow exists; confirmed impact creates replacement draft; self-made drawing part-number match gate works | `TC-REV-FFF-001` to `TC-REV-FFF-005`; viewport evidence for revision route |
| Phase 4 Review Flow | Required reviewer actions are enforced; reviewer cannot edit RD FFF judgement; confirmed-impact release transaction is atomic | `TC-REV-FFF-001`, `TC-REV-FFF-002`, `TC-AUDIT-002`; transaction rollback evidence |
| Phase 5 BOM Impact | Unreleased BOM drafts are flagged; released BOMs are unchanged; replaced-part warning and confirmation work in BOM edit | `TC-BOM-001` to `TC-BOM-003` |

Final package pass still requires all P0/P1 cases and UI visible-error gates across affected routes.

## 11. Test Cases

### TC-REV-FFF-001 No FFF Impact Uses Original Part

Preconditions:

- Existing drawing and original part are visible.
- Reviewer account is available.

Steps:

1. Open the implemented original drawing revision flow.
2. Select reason category `標註 / 文字修正`.
3. Set Form, Fit, Function to `無影響`.
4. Confirm the system defaults BOM decision to `BOM 不進版，待審核者確認`.
5. Submit for review with original part number.
6. Log in as reviewer and open the review item.
7. Attempt approval without pressing `確認 BOM 不進版`.
8. Press `確認 BOM 不進版`, then approve.

Expected:

- Original part number remains unchanged.
- Approval is blocked until reviewer confirms BOM no-revision.
- Audit includes reviewer, time, result, and `確認 BOM 不進版`.

Evidence:

- UI screenshots before submit and review approval.
- API payload or DB row for FFF assessment.
- Audit event excerpt.

### TC-REV-FFF-002 Suspected FFF Impact Requires Reviewer Conclusion

Steps:

1. Open original drawing revision flow.
2. Set one FFF item to `疑似影響`.
3. Submit using original part number.
4. Open review page.
5. Verify high-risk marker.
6. Try approving without choosing conclusion.
7. Choose `確認沿用原料號` and approve.
8. Repeat on another fixture and choose `退回補新料號`.

Expected:

- Review cannot be completed without one of the two conclusions.
- `確認沿用原料號` creates controlled evidence.
- `退回補新料號` returns the case for RD without forcing reviewer to edit RD judgement.

Evidence:

- Screenshots of high-risk marker and disabled/blocked approval.
- Audit events for both decision paths.

### TC-REV-FFF-003 Confirmed FFF Impact Requires Replacement Part

Steps:

1. Open original drawing revision flow.
2. Set one FFF item to `確認影響`.
3. Observe original-part submission state.
4. Try submitting without replacement part draft.
5. Click `產生新料號` or equivalent same-page action.
6. Confirm new part-number draft is created and original drawing number remains unchanged.

Expected:

- Submission without replacement part is blocked with visible disabled reason or API error.
- System creates replacement part draft only; it does not create a new drawing number.
- Draft type is `圖號進版產生`.

Evidence:

- UI evidence of blocked submit and generated draft.
- API/DB evidence showing same drawing number and new part number.

### TC-REV-FFF-004 Self-Made Replacement Requires Drawing

Steps:

1. Create a replacement part draft with item type `自製件`.
2. Attempt to submit without uploading a new drawing.
3. Upload a drawing whose read part number matches the new part number.
4. Submit.

Expected:

- Missing drawing blocks submission.
- Matching drawing allows submission.

Evidence:

- Blocked submit screenshot/API rejection.
- Successful submit evidence after matching upload.

### TC-REV-FFF-005 Drawing Part Mismatch Blocks Submit

Steps:

1. Create a confirmed-impact self-made replacement part.
2. Upload a drawing whose read part number differs from the new part number.
3. Manually correct the read value to an incorrect value and try submit.
4. Correct it to the new part number and submit.

Expected:

- Mismatch blocks submit.
- Corrected matching value permits submit.
- Manual correction is visible and auditable as a read-value correction, not as final CAD modification.

Evidence:

- UI screenshots.
- API response for mismatch.
- Audit or submission detail showing read/corrected value.

### TC-DRAFT-001 Single Draft List And Labels

Steps:

1. Create one `全新料號` draft from part module.
2. Create one `替代料號` draft from part module.
3. Create one `圖號進版產生` draft from revision page.
4. Open part-number draft list.

Expected:

- All three drafts appear in one list.
- Each row has correct type label, part type, source part/drawing context, status, creator, and department if applicable.

Evidence:

- Screenshot of list.
- API response if available.

### TC-DRAFT-002 Draft Status Set Is Limited

Steps:

1. Inspect all draft statuses through UI/API.
2. Force or seed each expected status.

Expected:

- Only `草稿`, `待審核`, `已發行`, `需重新確認`, `作廢` appear.
- No hidden extra state such as `待補圖面` appears to normal users.

Evidence:

- UI/API status inventory.

### TC-DRAFT-003 Purchased Part Low-Friction Review

Steps:

1. Create replacement draft with item type `外購件`.
2. Leave RD reason and attachment empty if fields exist.
3. Submit for review.

Expected:

- Submission is allowed.
- Reviewer can approve or reject without mandatory checklist or mandatory opinion.

Evidence:

- Submit success and review UI screenshot.

### TC-DRAFT-004 Standard Part Low-Friction Review

Repeat `TC-DRAFT-003` for item type `標準件`.

Expected:

- Same as purchased part.

### TC-DRAFT-005 Same Source Multiple Drafts Warning

Steps:

1. Create one replacement draft from a source part.
2. Create a second replacement draft from the same source part.

Expected:

- System allows creation.
- UI shows existing unfinished replacement draft warning.
- Use type/context must be visible or required to distinguish drafts.

Evidence:

- Warning screenshot.
- Draft records.

### TC-DRAFT-006 Controlled Number Cannot Recycle

Run four subcases:

1. Draft number referenced by BOM.
2. Draft number referenced by replacement link.
3. Draft number with drawing uploaded to PDM.
4. Draft number submitted for review.

Expected:

- Recycle action is unavailable or API rejects.
- Error message explains number is controlled and cannot be recycled.
- Audit records attempted blocked action if implemented.

Evidence:

- UI/API rejection.
- DB/audit check.

### TC-DRAFT-007 Reserved Draft Recycle Cooling And Immediate Recycle

Steps:

1. Create reserved draft number without any controlled boundary.
2. Obsolete the draft.
3. Confirm it enters 7-day cooling period.
4. As creator, choose immediate recycle.
5. Repeat as part-number manager.
6. Repeat as unrelated normal user.

Expected:

- Default cooling period is 7 days.
- Creator and part-number manager can immediately recycle.
- Unrelated user cannot immediately recycle unless permission grants it.

Evidence:

- UI/API results and audit events.

### TC-DRAFT-008 Reissued Recycled Number UI And Audit

Steps:

1. Reissue a recycled reserved number.
2. Log in as normal engineer.
3. View the new draft.
4. Query audit/history as authorized manager.

Expected:

- Normal UI does not show recycle badge/history.
- Audit history shows previous reserve, obsolete, recycle, and reissue events.

Evidence:

- Normal user screenshot.
- Audit evidence.

### TC-BOM-001 Unreleased BOM Draft Reconfirmation

Steps:

1. Create or locate unreleased BOM draft using old part.
2. Release replacement part that marks old part as replaced.
3. Open BOM draft.
4. Try submit review without reconfirmation.

Expected:

- BOM draft is marked `需重新確認`.
- Direct submission is blocked until user reconfirms/updates according to RD implementation.

Evidence:

- BOM draft UI and API rejection.

### TC-BOM-002 Released BOM Not Auto-Modified

Steps:

1. Capture released BOM contents using old part.
2. Release replacement part.
3. Re-open released BOM.

Expected:

- Released BOM contents remain unchanged.
- System may show informational prompt that a new part exists.
- No automatic replacement occurs.

Evidence:

- Before/after BOM export or DB/API comparison.

### TC-BOM-003 Editing With Replaced Part Warning

Steps:

1. Open BOM editor.
2. Add or retain a part that is marked replaced.
3. Attempt save/submit without acknowledging warning.
4. Acknowledge warning and save/submit.

Expected:

- Warning is visible and understandable.
- Save/submit requires confirmation.
- Confirmation event is recorded if implemented.

Evidence:

- UI screenshots and audit/API evidence.

### TC-AUDIT-001 FFF Judgement History

Steps:

1. Submit revision with FFF judgement.
2. Reviewer rejects or returns.
3. RD refills judgement and resubmits.
4. Inspect history.

Expected:

- History records each submission/refill judgement.
- It does not record every field keystroke or transient edit.

Evidence:

- History panel/API/audit rows.

### TC-AUDIT-002 Reviewer Confirmation Events

Steps:

1. Execute no-impact approval with `確認 BOM 不進版`.
2. Execute suspected-impact approval with `確認沿用原料號`.
3. Execute suspected-impact return with `退回補新料號`.
4. Execute confirmed-impact approval.

Expected:

- Each event records result, reviewer, time, and required action.

Evidence:

- Audit event excerpts.

### TC-UI-001 Visible Error Sweep

Routes to inspect after RD implementation:

- Drawing revision page.
- Part-number draft list and creation page.
- Review page.
- BOM workbench.
- BOM reviews.
- Any route RD adds for this package.

Expected:

- No visible `.inline-error`, `[role=alert]` failure, `HTTP 4xx/5xx`, `Not Found`, `Internal Server Error`, or visible `/api/...` route error unless intentionally testing an error state.
- Critical counters are not unexpectedly zero when fixtures exist.

Evidence:

- Screenshot or DOM evidence for each route.

### TC-UI-002 Viewport And Interaction Sanity

Viewports:

- 320 x 720
- 768 x 900
- 1024 x 768
- 1440 x 900

Checks:

- FFF three-state controls remain readable and operable.
- Disabled reason for blocked submit is visible near the action.
- High-risk marker is visible but does not dominate the page.
- Single draft list can be scanned without broken columns.
- Warning and confirmation UI does not overlap or clip.
- No horizontal overflow on in-scope routes.

Evidence:

- Screenshots or Playwright traces per route/viewport.

## 12. API And Data Consistency Checks

RD should provide focused automated checks after implementation. At minimum, QC should verify:

- Server rejects confirmed FFF impact submission without replacement part.
- Server rejects self-made replacement submission without matching drawing part number.
- Server rejects recycle when a number has crossed controlled boundary.
- Server allows reserved draft recycle only for creator or part-number manager.
- Replacement release updates old part replacement marker and replacement link atomically.
- BOM draft reconfirmation flag is created when replacement part is released.
- Released BOM rows are unchanged before/after replacement release.
- Audit events are append-only and include required action metadata.

Expected command naming if RD adds script:

```powershell
npm.cmd run qc:pdm-change-control
```

General regression commands:

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run qc:revision-lifecycle
npm.cmd run qc:pdm-numbering-api-regression
npm.cmd run qc:bom-workbench-review-release
```

If command names differ, QC must record the actual commands used.

## 13. Pass / Fail / Block Criteria

Pass:

- All P0 and P1 cases pass.
- No visible runtime errors on affected UI.
- Controlled-boundary recycle guards pass.
- Released BOM immutability is proven.
- Reviewer confirmation and FFF history audit evidence exists.

Fail:

- Any confirmed FFF impact can be submitted with original part number.
- Any self-made replacement can be submitted with mismatched drawing part number.
- Any controlled part number can be recycled.
- Any released BOM is automatically modified.
- Reviewer can approve no-impact case without required confirmation.
- Suspected FFF impact can remain unresolved after review.

Blocked:

- RD implementation does not expose required flows.
- Test roles or fixture data are unavailable.
- App cannot start or user cannot log in.
- Required schema/migration is absent.
- Browser evidence cannot be captured for UI-heavy checks.

## 14. QC Evidence Package

QC final report must include:

- Implementation branch/commit.
- Route mapping from this QA plan to actual implemented pages.
- Commands executed and pass/fail output.
- Screenshots for affected routes and viewports.
- API/DB evidence for controlled-boundary and BOM rules.
- Audit/history excerpts for FFF and reviewer confirmation events.
- List of skipped cases with reason.
- Final judgement: `通過`, `未通過`, `未充分驗證`, or `阻塞`.

## 15. No-Go Conditions For Release

Do not release this package if any of these remain:

- Confirmed FFF impact can bypass new part-number flow.
- Drawing part-number mismatch can be approved for self-made replacement.
- Controlled part number can be recycled.
- Released BOM can be automatically changed.
- Reviewer confirmation events are missing.
- UI shows visible runtime errors in normal operation.
- QC cannot prove the low-friction reserved draft boundary separately from controlled part numbers.
