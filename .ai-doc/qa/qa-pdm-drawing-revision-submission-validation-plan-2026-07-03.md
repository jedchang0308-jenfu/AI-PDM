# QA-PDM-DRAWING-REVISION-SUBMISSION - 圖面進版受控送審包驗證計畫

Status: Phase 1 and Phase 2 local command/browser gates passed; Phase 3 out-of-order revision acceptance and latest/history local command/static/lifecycle gates passed; Phase 4 first-class package model has separate QA plan and is not authorized for RD
Date: 2026-07-03
Owner: Dev PM / QA
Related DEV: `DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
Material identity authority: `.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`

## 1. Purpose

Validate that drawing revision is controlled by a formal submission/review/release package, not by a loose attachment-library revision value.

The validation target is the user-visible problem:

```text
圖面 0.2 可以成立，Part Number identity 維持不變，BOM 也不一定需要升自己的 Revision；系統仍必須留下正式圖面 0.2 的受控送審證據。
```

## 2. Scope

In scope:

- `/numbering/revisions` guided flow from drawing resolve to controlled revision package submit.
- New drawing file selection/upload for the intended revision.
- Multi-file revision package upload for the same intended revision.
- Extension-based file category auto-classification with user correction.
- Warning-only package completeness checks on submitter preview.
- Reviewer-page parity for the same package warning codes.
- FFF assessment linked to a created Pending submission through `submission_id`.
- No-impact path where part number and BOM remain unchanged.
- Reviewer BOM no-revision confirmation.
- Suspected-impact and confirmed-impact branch guards.
- Same-revision blockers and release-incomplete recovery compatibility.
- Out-of-order revision approval where lower or skipped revisions can be approved after newer revisions exist.
- Latest/history grouping after approval.
- Latest-only first-level display for operational drawing/package views.
- Phase 4 first-class package model is covered separately by `.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`.
- User-facing Chinese copy and visible-error/RWD gates.

Out of scope:

- Production deploy.
- Supabase production migration.
- Direct data cleanup or historical repair.
- CAD/OCR/SolidWorks automatic extraction as a required Phase 1 or Phase 2 dependency.
- Automatic BOM version creation.
- Any automatic Part Number Revision（Part Number 本身無 Revision）；只有物料身份條件改變時才建立 replacement Part Number。
- Direct repair, deletion or migration of existing incorrect historical records.
- Strict chronological approval order.
- Duplicate formal records for the same drawing number and revision.
- Dedicated mobile-phone UI or mobile-specific navigation. Phones use the desktop/default surface by product setting.
- Phase 4 product implementation, schema migration and migration dry-run execution until explicitly authorized.

## 3. Entry Criteria

QC may execute this plan only when:

- RD identifies implementation branch or staged file boundary.
- App can start locally.
- `/numbering/revisions` renders.
- At least one drawing fixture exists with:
  - current revision such as `0.1`;
  - next intended revision such as `0.2`;
  - primary manufacturing part;
  - attachment upload permission.
- Existing drawing submission and change-control QC baselines are runnable.

If fixture data is unavailable, affected cases are `blocked`, not failed.

## 4. Test Data

Preferred real/manual fixture:

- `D-0007-MA1`
- Current released/submitted revision: `0.1`
- Intended revision: `0.2`
- Part: `P-0007-001`
- Change reason: `標註 / 文字修正`
- FFF: all `無影響`

QC-owned fallback fixture:

- Use a disposable drawing number such as `D-QC-REVPKG-MA1`.
- Use disposable attachments and remove them after evidence if the QC runner creates data.
- Do not mutate existing user workflow data for lifecycle or release validation unless explicitly authorized.

## 5. FMEA

| Failure mode | Cause | User impact | Detection | Priority | Control |
|---|---|---|---|---|---|
| Attachment revision is mistaken as formal drawing revision | UI copy or release logic treats attachment upload as controlled evidence | Operators believe 0.2 is released without review | QA-REVPKG-002, QA-REVPKG-003 | P0 | Upload success copy must say attachment is not formal until package submit/release |
| FFF assessment creates reviewer task without selected files | Old endpoint remains primary UI path | Reviewer approves a drawing revision with no drawing files | QA-REVPKG-004 | P0 | Normal UI package submit requires selected attachment IDs |
| Part/BOM incorrectly revise on no-impact drawing change | Domain coupling is too broad | Master data churn and false BOM versions | QA-REVPKG-006 | P0 | Assert part and BOM unchanged before release; reviewer confirms no BOM revision |
| Assessment and submission are not linked | Transaction or API contract missing | Audit cannot prove which files were assessed | QA-REVPKG-005 | P0 | DB/API evidence for `drawing_revision_fff_assessments.submission_id` |
| FFF review is approved but linked package remains misleadingly Pending | Read model ignores `review_confirmation_events` for ordinary revision packages | Reviewer disappears from inbox while drawing module still says `送審中` or exposes a second publish action | QA-REVPKG-005A | P0 | Effective-status projection, minor/major policy split, and submission-detail CTA sweep |
| Confirmed-impact bypasses replacement draft | New package endpoint skips existing change-control guard | Wrong part remains in use after FFF impact | QA-REVPKG-008 | P0 | Confirmed-impact negative tests |
| Same-revision duplicate package created | Idempotency/blocker mismatch | Duplicate Pending submissions and review confusion | QA-REVPKG-009 | P0 | Replay same/different idempotency key and count active records |
| Prior-revision attachment appears in the new-revision work area | UI lists all drawing attachments together and only disables mismatched revision files | Operator mistakes old `0.1` drawing for a `0.2` candidate and cannot tell the next step | QA-REVPKG-013 | P1 | Primary list only shows target revision files; other revisions are collapsed read-only reference files with no checkbox |
| Raw technical errors leak | Error mapping missing | Operator cannot recover and internals leak | QA-REVPKG-011 | P1 | Forbidden text sweep |
| Desktop/default layout hides selected revision/files | Workbench added too many controls | User cannot finish revision submit | QA-REVPKG-012 | P1 | Desktop/tablet/current-browser screenshots or DOM checks |
| Primary upload flow only supports one file | Revision workbench models attachment as a single file instead of a version package | Users cannot prepare real PDM packages containing 3D/2D/PDF/DWG/intermediate files | QA-REVPKG-014 | P1 | Multi-file same-revision package test |
| User must manually choose 3D/2D before upload | Category capture happens before file evidence exists | User guesses category and loses trust in the workflow | QA-REVPKG-015 | P2 | Extension classifier + inline correction evidence |
| Completeness warnings block submit | Warning rules are implemented as hard validation | Valid revision package cannot enter review because optional roles are missing | QA-REVPKG-016 | P1 | Warning-only submit evidence |
| Submitter warnings are absent from reviewer page | Warning logic is local to `/numbering/revisions` | Reviewer cannot answer whether missing package evidence is acceptable | QA-REVPKG-017 | P1 | Reviewer page/drawer warning parity evidence |
| Submitter/reviewer warning logic diverges | UI duplicates warning logic | Same package gives different risk messages across surfaces | QA-REVPKG-018 | P1 | Shared warning code/API evidence |
| Lower backfilled revision is blocked by chronological order | Release service treats newer released revision as a hard conflict | Historical traceability cannot be completed | QA-REVPKG-019 | P0 | Approve lower-after-newer as history |
| Lower backfilled revision replaces newer latest | Latest computation uses approval timestamp instead of revision order | Manufacturing may use an older drawing as current | QA-REVPKG-020 | P0 | Latest/history recompute evidence |
| Duplicate same-revision formal record is allowed | Duplicate guard removed too broadly | Users see two official packages for one drawing revision | QA-REVPKG-021 | P0 | Same drawing + same revision duplicate negative test |
| First-level views list all revisions as current | UI does not group history | Operators cannot tell what to use now | QA-REVPKG-022 | P1 | Latest-only first-level browser evidence |
| Handoff/download defaults use historical revision | Consumer does not ask the latest/history service | Downstream users consume wrong file | QA-REVPKG-023 | P0 | Operational default latest evidence |
| Next-revision suggestion blocks intentional override | UI treats suggestion as authority | User cannot backfill historical data | QA-REVPKG-024 | P1 | Suggestion + override warning evidence |

## 6. Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| QA-REVPKG-001 | Official drawing number resolves and shows current revision, intended revision and current part context | UI screenshot + API payload |
| QA-REVPKG-002 | Uploading/adding attachment for revision `0.2` does not mark drawing revision as released or submitted | UI copy + DB/API status |
| QA-REVPKG-003 | Workbench requires at least one eligible new-revision drawing file before `建立圖面進版送審` | Disabled state + visible Chinese reason |
| QA-REVPKG-004 | Normal UI cannot create an actionable FFF review for a formal revision package without selected files | UI/API negative evidence |
| QA-REVPKG-005 | Successful submit creates one Pending submission and one linked FFF assessment | API/DB evidence: `submissionId`, `assessmentId`, `submission_id` |
| QA-REVPKG-005A | After FFF approval, minor packages show effective `ReviewApproved` / `研發受控`, physical package remains Pending, and no duplicate `核准發布` CTA is shown; major packages hand off to approval-step/release workflow | 3000 browser DOM/screenshot, package read model, audit evidence, no visible errors |
| QA-REVPKG-006 | No-impact flow keeps part number and BOM unchanged while recording reviewer-required BOM no-revision confirmation | DB/API before/after + reviewer UI evidence |
| QA-REVPKG-007 | Suspected-impact flow creates high-risk package and requires reviewer conclusion before final release | UI/API evidence |
| QA-REVPKG-008 | Confirmed-impact flow blocks without replacement draft and matching drawing part-number value | Negative UI/API evidence |
| QA-REVPKG-009 | Idempotency and same-revision blockers prevent duplicate active packages | API replay + active count evidence |
| QA-REVPKG-010 | Existing `發行未完成` recovery and Released/Obsolete blockers still apply | Workbench blocker evidence |
| QA-REVPKG-011 | Normal UI does not expose raw codes, SQL, stack traces, `Internal Server Error`, or English-only permission errors | Text sweep + screenshots |
| QA-REVPKG-012 | Desktop/tablet/current-browser layouts show current drawing, revision, selected files, preview and CTA without overlap/overflow; phones use the desktop/default surface, not a separate mobile UI | Screenshots or DOM measurements |
| QA-REVPKG-013 | Prior/other-revision attachments are not visible in the primary `新版圖面` selectable list and appear only in a read-only reference area | DOM check + collapsed/expanded screenshots |
| QA-REVPKG-014 | One intended revision package can contain multiple uploaded/selected files under the same drawing and revision | UI screenshot + package payload |
| QA-REVPKG-015 | SLDDRW/PDF/DWG/DXF/STEP/SLDPRT or QC-owned equivalent files are auto-classified by extension, and category can be corrected inline | UI screenshot + API/snapshot payload |
| QA-REVPKG-016 | Missing recommended roles such as PDF, DWG/DXF or 3D CAD show warning-only guidance and do not disable submit after at least one valid package file exists | UI screenshot + submit evidence |
| QA-REVPKG-017 | The review page or reviewer drawer shows the same package warning codes before approval/rejection actions | Reviewer screenshot + warning code evidence |
| QA-REVPKG-018 | Submitter and reviewer warning text comes from shared warning codes, with audience-specific wording only | Unit/API evidence or static guard |
| QA-REVPKG-019 | A lower non-duplicate revision can be approved after a newer revision exists and is classified as formal history | API/workflow evidence + DB/API latest/history state |
| QA-REVPKG-020 | A higher revision approved after current latest becomes latest, and lower approved revisions move to history | API/workflow evidence + UI state |
| QA-REVPKG-021 | Duplicate formal same drawing + same revision remains blocked with actionable Chinese recovery | Negative API/UI evidence |
| QA-REVPKG-022 | First-level drawing/package views show only the computed latest approved revision | Browser screenshot or DOM check |
| QA-REVPKG-023 | Manufacturing handoff, default downloads and package summary use latest by default unless history is explicitly selected | Browser/API evidence |
| QA-REVPKG-024 | Workbench suggests next revision but allows intentional lower/higher override with clear warning/confirmation | UI screenshot + submit evidence |

## 7. Test Cases

### TC-REVPKG-001 Resolve And Intent

Steps:

1. Open `/numbering/revisions?drawingNumber=D-0007-MA1` or QC-owned equivalent.
2. Confirm drawing context is loaded.
3. Set intended revision to `0.2`.
4. Set reason to `標註 / 文字修正`.

Expected:

- Drawing number, current part and suggested/latest revision are visible.
- No internal ID fields are editable.
- Intended revision is visible near the primary action.

Evidence:

- Screenshot.
- Resolver/API payload excerpt.

### TC-REVPKG-002 Attachment Is Source, Not Formal Release

Steps:

1. Upload or select a drawing-owned attachment with revision `0.2`.
2. Stop before package submit.
3. Inspect UI and API/DB state.

Expected:

- UI says the attachment is in the drawing attachment library and must be included in the revision submission.
- No Pending submission is created solely by upload.
- No Released drawing revision is created solely by upload.

Evidence:

- Upload success message.
- Submission/revision count before and after upload.

### TC-REVPKG-003 Missing New Drawing File

Steps:

1. Resolve drawing.
2. Set all FFF to `無影響`.
3. Leave all new-revision attachments unselected.

Expected:

- Primary submit action is disabled.
- Visible reason says to upload/select the new drawing for revision `0.2`.
- If only `0.1` or other prior-revision attachments exist, they are default-collapsed under `上一版 / 其他版次參考檔` and have no selectable checkbox.
- No FFF assessment or Pending submission is created.

Evidence:

- Screenshot.
- API/DB no-create evidence if available.

### TC-REVPKG-004 No-Impact Controlled Package

Steps:

1. Resolve drawing.
2. Set revision `0.2`.
3. Set all FFF to `無影響`.
4. Select or upload eligible `0.2` drawing files.
5. Open submit preview.
6. Click `建立圖面進版送審`.

Expected:

- Preview states drawing changes from `0.1` to `0.2`.
- Preview states part number unchanged.
- Preview states BOM waits for reviewer confirmation and does not auto-revise.
- Submit creates one Pending submission and one linked FFF assessment.

Evidence:

- Preview screenshot.
- Submission response.
- Assessment response.
- DB/API link evidence.

### TC-REVPKG-005 Reviewer BOM No-Revision Confirmation

Steps:

1. Use the Pending package from TC-REVPKG-004.
2. Open pending drawing revision review.
3. Confirm BOM no revision.
4. Release/approve through the intended review path if RD implementation includes release flow.

Expected:

- Reviewer must explicitly perform `確認 BOM 不進版`.
- Part number remains unchanged.
- BOM version remains unchanged.
- Drawing revision can become the latest released drawing revision only after release succeeds.

Evidence:

- Review UI screenshot.
- `review_confirmation_events` or API evidence.
- Drawing/part/BOM before/after state.

### TC-REVPKG-006 Suspected Impact

Steps:

1. Resolve drawing and select revision files.
2. Set one FFF dimension to `疑似影響`.
3. Submit the package.
4. Open reviewer action.

Expected:

- Package is marked high risk.
- Reviewer must choose `確認沿用原料號` or `退回補新料號`.
- No final state remains as unresolved suspected impact.

Evidence:

- UI preview.
- Reviewer action options.

### TC-REVPKG-007 Confirmed Impact Negative And Positive

Steps:

1. Resolve drawing and select revision files.
2. Set one FFF dimension to `確認影響`.
3. Attempt submit without replacement draft/read value.
4. Fill replacement reserved number and mismatching drawing read value.
5. Correct drawing read value to match and submit.

Expected:

- Missing replacement data blocks.
- Mismatched drawing part-number blocks.
- Matching values create/reuse a replacement draft and linked package.

Evidence:

- Negative screenshots.
- API/DB evidence for replacement draft and assessment link.

### TC-REVPKG-008 Duplicate And Idempotency

Steps:

1. Submit the same valid package twice with the same idempotency key.
2. Submit another request for the same drawing/revision with a different key.
3. Query active packages.

Expected:

- Same key returns the existing submission/assessment pair.
- Different key is blocked by same-revision active package.
- No duplicate active Pending packages or active FFF assessments are created.

Evidence:

- API responses.
- DB/API count.

### TC-REVPKG-009 Same-Revision Formal Blockers

Steps:

1. Use fixtures for Pending/Releasing, ReleaseFailed, Released/Obsolete and non-blocking history.
2. Open `/numbering/revisions` for the same drawing/revision.

Expected:

- Pending/Releasing blocks as in progress.
- ReleaseFailed shows `發行未完成` recovery.
- Released/Obsolete blocks same revision reuse.
- Rejected/Cancelled/resolved ReleaseFailed do not block by themselves.

Evidence:

- Screenshot per blocker class.
- API blocker code and Chinese copy.

### TC-REVPKG-010 Visible Error And Viewport Gate

Viewports:

- 768 x 900
- 1024 x 768
- 1440 x 900

Optional sanity only, not a supported phone UI requirement:

- 390 x 844

Checks:

- No horizontal overflow.
- No clipped primary CTA.
- Selected drawing/revision/file context remains visible.
- No visible `HTTP 4xx/5xx`, `Internal Server Error`, `Not Found`, `/api/...` failure text, raw SQL, stack trace, `ReleaseFailed`, `duplicate_active_submission`, or English-only permission errors in normal UI.

Evidence:

- Screenshot or DOM measurement per viewport.
- Text sweep result.

### TC-REVPKG-011 Multi-File Package Upload And Classification

Steps:

1. Open `/numbering/revisions?drawingNumber=D-0007-MA1` or QC-owned equivalent.
2. Set intended revision to `0.3` or another safe QC target revision.
3. Upload or select multiple files for the same revision, such as SLDDRW, PDF, DWG/DXF and STEP/SLDPRT equivalents.
4. Observe default file categories.
5. Correct one category inline.
6. Open submit preview.

Expected:

- All files remain in one same-revision package.
- File categories are auto-classified by extension.
- User correction is visible before submit.
- The corrected role is preserved in package payload/snapshot evidence.
- The UI does not force category selection before file upload.

Evidence:

- Upload/package screenshot.
- Classification screenshot.
- Package payload or snapshot excerpt.

### TC-REVPKG-012 Warning-Only Package Completeness

Steps:

1. Prepare a valid package with at least one same-revision file.
2. Omit one recommended role, such as PDF, DWG/DXF or 3D CAD.
3. Open submit preview.
4. Confirm the primary submit action state.
5. Submit the package if no hard blockers remain.

Expected:

- The missing role appears as a warning, not a red hard error.
- Warning copy answers the next step, e.g. `仍可送審，審核者會看到此提醒` or `建議補件後送審`.
- Submit remains enabled after hard blockers are cleared.
- Submission succeeds or reaches the normal submission API path.

Evidence:

- Submit preview screenshot.
- Submit button state screenshot.
- Submission response or API evidence.

### TC-REVPKG-013 Reviewer Warning Parity

Steps:

1. Use the Pending package from TC-REVPKG-012.
2. Open the full submission review page or reviewer drawer.
3. Locate package warning display before approve/reject actions.
4. Compare warning codes with submitter preview/API evidence.

Expected:

- Reviewer sees the same warning codes as the submitter preview.
- Reviewer wording is decision-oriented, e.g. `此版次缺少 PDF，系統不阻擋送審，但審核者需確認是否可接受。`
- Warnings do not disable approve/reject controls.
- If the reviewer rejects because of missing package evidence, the reason is captured as normal review feedback.

Evidence:

- Reviewer page/drawer screenshot.
- Warning code/API evidence.
- Approval/rejection control state.

### TC-REVPKG-014 Lower Revision Backfill After Newer Latest

Steps:

1. Prepare or use a QC-owned drawing with approved latest revision `0.6`.
2. Submit and approve a non-duplicate lower revision such as `0.5`.
3. Inspect release result, latest/history service output and first-level UI.

Expected:

- Approval does not fail solely because `0.6` already exists.
- Revision `0.5` is accepted as formal history.
- Revision `0.6` remains the computed latest.
- First-level UI still shows `0.6`; `0.5` appears only in history.

Evidence:

- Approval/retry-release response.
- DB/API latest/history state.
- First-level and history screenshots.

### TC-REVPKG-015 Higher Revision Becomes Latest

Steps:

1. Use the same QC drawing with latest revision `0.6`.
2. Submit and approve a higher revision such as `0.7`.
3. Inspect latest/history state and operational default views.

Expected:

- Revision `0.7` becomes the computed latest.
- Revision `0.6` moves to history.
- Manufacturing handoff, download default and package summary point to `0.7`.

Evidence:

- Approval response.
- Latest/history API or DB evidence.
- Handoff/download/package summary screenshot or API evidence.

### TC-REVPKG-016 Duplicate Same Revision Remains Blocked

Steps:

1. Use a drawing that already has a formal approved revision such as `0.6`.
2. Attempt to create or approve another formal package for the same drawing + revision `0.6`.
3. Inspect UI/API error handling.

Expected:

- Duplicate formal same-revision package is blocked.
- Recovery copy tells the user to open/correct the existing revision package or choose another revision.
- No second formal `0.6` record is created.

Evidence:

- Negative API response.
- UI blocker screenshot.
- DB/API count evidence.

### TC-REVPKG-017 Revision Suggestion Is Helpful, Not A Blocker

Steps:

1. Open `/numbering/revisions` for a drawing with latest revision `0.6`.
2. Observe suggested revision.
3. Override to lower revision `0.5` and inspect warning.
4. Override to skipped/higher revision `0.8` and inspect confirmation.

Expected:

- The field suggests the next likely revision, such as `0.7`.
- Lower revision override remains possible and warns that approval will enter history.
- Higher/skipped revision override remains possible and warns that approval may become latest.
- Submit remains governed by duplicate/file/FFF hard blockers, not by chronological order.

Evidence:

- UI screenshots.
- Package submit response or blocker evidence proving chronological order is not the blocker.

## 8. QC Commands

Required after RD implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
npm.cmd run qc:pdm-change-control
npm.cmd run qc:pdm-drawing-submission-workbench-recovery
npm.cmd run qc:pdm-drawing-submission-review-only
```

Recommended focused command if RD adds it:

```powershell
npm.cmd run qc:pdm-drawing-revision-submission
```

UI/manual evidence is mandatory. Command-only evidence cannot pass this QA plan because the defect is an operator workflow and controlled-evidence gap.

Executed local evidence on 2026-07-03:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run qc:pdm-change-control`: passed 56/56.
- `npm.cmd run qc:pdm-drawing-submission-review-only`: passed 14/14.
- `npm.cmd run qc:pdm-drawing-submission-workbench-mutation`: passed 33/33.
- Existing local dev server page smoke: `/numbering/revisions` returned HTTP 200.
- Protected API smoke: unauthenticated `/api/numbering/drawings/D-0007-MA1/submission-workbench?revision=0.2` returned HTTP 401 `需要登入`.

Executed APP feedback evidence on 2026-07-05:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-change-control`: passed 56/56, including the static guard that the revision workbench separates target-revision attachments from reference attachments.
- `npm.cmd run dev:local:check`: passed; local `http://127.0.0.1:3000/` healthy.
- Playwright mock for `/numbering/revisions?drawingNumber=D-0007-MA1`, target revision `0.2`, only prior attachment `0.1`: passed on 1440x900 and optional 390x844 sanity. Evidence screenshots:
  - `output/playwright/drawing-revision-reference-filter/desktop-1440-collapsed.png`
  - `output/playwright/drawing-revision-reference-filter/desktop-1440-expanded.png`
  - `output/playwright/drawing-revision-reference-filter/mobile-390-collapsed.png` (optional sanity only)
  - `output/playwright/drawing-revision-reference-filter/mobile-390-expanded.png` (optional sanity only)

Executed Phase 2 local evidence on 2026-07-05:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-change-control`: passed 57/57, including the static guard for multi-file revision package intake and reviewer warning parity.
- `npm.cmd run dev:local:check`: passed; local `http://127.0.0.1:3000/` healthy.
- Playwright smoke for `/numbering/revisions?drawingNumber=D-0007-MA1`: multi-file package dropzone, role correction, warning-only submitter guidance and no visible runtime error.
- Playwright smoke for `/submissions/SUB-QC-REVPKG-001`: reviewer warning panel visible before approve/reject actions.
- Evidence screenshots:
  - `output/playwright/drawing-revision-package-p2/revision-package-submit-desktop.png`
  - `output/playwright/drawing-revision-package-p2/submission-review-warning-desktop.png`
  - `output/playwright/drawing-revision-package-p2/revision-package-submit-mobile.png` (optional viewport sanity only, not mobile support evidence)

Executed Phase 3 local evidence on 2026-07-05:

- `npx.cmd tsc --noEmit --pretty false`: passed.
- `npm.cmd run lint -- --quiet`: passed.
- `npm.cmd run qc:pdm-change-control`: passed 61/61, including Phase 3 revision ordering/latest-history checks.
- `npm.cmd run dev:local:check`: passed; local `http://127.0.0.1:3000/` healthy.
- TC-REVPKG-014 lower-after-newer lifecycle check passed in focused QC: the lower revision is accepted as formal history and does not replace the higher latest revision.
- TC-REVPKG-015 higher-revision lifecycle check passed in focused QC: the higher revision becomes latest and older approved revisions move to history.
- TC-REVPKG-016 duplicate same-revision lifecycle check passed in focused QC: duplicate formal same drawing + same revision remains blocked.
- TC-REVPKG-017 suggestion/override static UI guard passed: the workbench keeps next-revision suggestion but shows lower/higher intent guidance instead of blocking by chronological order.
- Static/API guard passed: product approve/retry-release/workflow paths do not contain the old chronological `revision_release_order_conflict` blocker, while duplicate same-revision release guard remains covered.

Executed approval/status recovery regression on 2026-08-06:

- `npm.cmd run qc:pdm-drawing-revision-package-model`: passed 63/63, including effective `ReviewApproved` projection for approved FFF minor revisions and submission-detail status exposure.
- `npx.cmd tsc --noEmit --pretty false`: passed.
- Scoped ESLint for approval platform, revision package/read model, attachment read model, status display and submission detail: passed.
- Fixed 3000 read-only browser route `/numbering/drawings?view=all&detail=...&query=A0005`: A0005-M01 shows `研發受控`, revision `0.3`, and the drawer has no visible error.
- Fixed 3000 read-only browser route `/submissions/SUB-20260806-32FAF9E9`: header/status show `研發受控（已核准）`, the next-step message says no further `核准發布`, no `核准發布` button is rendered, visible error sweep is empty, console error/warning count is 0, and body width 1265 equals the 1280 viewport content width.
- No database write, direct repair, migration, deployment or release was executed. Existing `A0005` rows remain unchanged.

Not yet executed:

- Full manual no-impact package creation with a real uploaded drawing file.
- Reviewer BOM no-revision confirmation walkthrough.
- Full formal desktop/tablet/current-browser viewport screenshot sweep for the manual no-impact route.
- Full manual browser walkthrough of Phase 3 latest/history on every operational consumer such as handoff/download; current Phase 3 evidence is command/static/lifecycle focused.
- `npm.cmd run build`, because the local-dev guard correctly refused to clean `.next` while AI_PDM was listening on port 3000.

## 9. Pass / Fail / Block Criteria

Pass:

- All P0 and P1 criteria pass.
- At least one no-impact drawing revision package proves drawing revision advances while part/BOM remain unchanged.
- FFF assessment and submission package are linked.
- Multi-file package behavior, warning-only completeness and reviewer warning parity pass.
- Out-of-order lower revision approval goes to history without replacing latest.
- Higher revision approval becomes latest.
- Duplicate same-revision formal record remains blocked.
- First-level operational views show latest only and history is explicit.
- Existing change-control and drawing submission regressions pass.
- UI visible-error and desktop/tablet/current-browser viewport gates pass.

Fail:

- Attachment upload alone can be mistaken for formal revision release.
- Normal UI can create a formal FFF review without selected new drawing files.
- Created assessment is not linked to the submission package.
- No-impact path revises part/BOM automatically.
- Confirmed-impact path bypasses replacement draft or part-number match.
- Revision package still practically supports only one primary uploaded file.
- Missing optional recommended roles disable submit after at least one valid package file exists.
- Reviewer page/drawer does not show the same package warning codes before approval/rejection actions.
- Submitter and reviewer warning logic diverges for the same package.
- Lower non-duplicate revision is blocked only because a newer revision exists.
- Lower backfilled revision replaces a newer latest revision.
- Duplicate formal same drawing + same revision is allowed.
- First-level operational views show historical and latest revisions together as current.
- Handoff/download defaults select a historical revision without explicit user choice.
- Raw internal/SQL errors appear in normal UI.

Blocked:

- App cannot start.
- Fixture data cannot be prepared safely.
- Login/permission setup unavailable.
- Implementation requires production migration/deploy or direct data repair.
- RD needs schema migration and no migration plan has been approved.

## 10. QC Output

QC report must include:

- Implementation branch or staged boundary.
- Commands run and results.
- Fixture drawing number, part number, intended revision and selected attachment IDs.
- Submission ID and FFF assessment ID.
- Evidence that `drawing_revision_fff_assessments.submission_id` links to the created submission.
- Multi-file package category list and any user correction evidence.
- Package warning codes shown to submitter and reviewer.
- Latest/history state before and after lower-backfill and higher-latest approval tests.
- Duplicate same-revision negative evidence.
- First-level latest-only screenshot and history screenshot.
- Handoff/download/package summary evidence showing default latest use.
- Reviewer confirmation evidence for no-impact BOM no revision.
- Before/after part and BOM state for no-impact case.
- Screenshots for preview, success, blocker and viewport states.
- Forbidden text sweep result.
- List of skipped/blocked cases and reasons.
