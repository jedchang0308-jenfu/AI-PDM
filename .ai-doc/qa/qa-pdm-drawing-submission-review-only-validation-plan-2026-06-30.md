# QA - PDM drawing-source review-only submission

Date: 2026-06-30
Related spec: `.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`
Related DEV: `DEV-PDM-DRAWING-SUBMISSION-001`
Status: Validation passed locally on 2026-06-30

## 1. Validation Goal

Validate that drawing detail `送審` creates a drawing-source review package without turning the submission step into a master-data editing form.

Primary quality claim:

```text
圖號模組完成主資料；送審頁只做唯讀確認、缺漏阻擋、附件選擇與送出審核。
```

## 2. Scope

In scope:

- Drawing detail `圖號治理 -> 送審` navigation.
- Drawing-source submission context resolver.
- Drawing-source review-only UI.
- Submission creation from selected drawing master attachments.
- Missing master-data blockers.
- Duplicate active submission prevention.
- Generic `/upload` auxiliary route regression.

Out of scope:

- Removing generic `/upload`.
- Production deploy or production migration.
- SolidWorks Document Manager integration.
- CAD file mutation.
- Redesigning dashboard review details.

## 3. Test Data

Preferred local seed:

- A drawing such as `D-0014-MA1` with:
  - At least one linked part.
  - At least one SolidWorks or PDF/DWG master attachment.
  - Resolvable material and surface treatment from master data.

Additional fixtures:

- Drawing with no linked part.
- Drawing with linked part but missing material.
- Drawing with linked part but missing surface treatment.
- Drawing with no eligible attachment.
- Drawing with an existing active Pending submission for same drawing/revision.

If fixture creation requires DB writes, use disposable local seed data with a unique prefix and cleanup or mark obsolete after QC.

## 4. Acceptance Matrix

| ID | Priority | Scenario | Expected result |
|---|---|---|---|
| DRS-UI-001 | P0 | Open drawing detail and click `送審` | Navigates to drawing-source submission route with source drawing identified |
| DRS-UI-002 | P0 | Drawing-source submission page loads | Shows `圖面送審` and `送審來源：{drawingNumber}` |
| DRS-UI-003 | P0 | Inspect form fields in drawing-source mode | No editable inputs for drawing number, part number, part name, revision, material, surface finish, document type |
| DRS-UI-004 | P0 | Valid drawing with eligible attachments | Attachment selector appears and defaults to latest suitable drawing/CAD attachment |
| DRS-UI-005 | P0 | Missing linked/primary part | Submit disabled; blocker explains missing relationship and links back to master area |
| DRS-UI-006 | P0 | Missing material | Submit disabled; blocker says material must be completed in master data |
| DRS-UI-007 | P0 | Missing surface treatment | Submit disabled; blocker says surface treatment must be completed in master data |
| DRS-UI-008 | P0 | No eligible attachment | Submit disabled; blocker links to drawing attachment library |
| DRS-UI-009 | P1 | Mobile/narrow viewport | No horizontal overflow, overlap, clipped CTA, or unreadable blocker text |
| DRS-API-001 | P0 | Resolver with valid drawing | Returns drawing, primary part, attachments, suggested revision, blockers array |
| DRS-API-002 | P0 | Resolver with drawing from another company | Returns 404/403 without leaking data |
| DRS-API-003 | P0 | Crafted mismatched drawing identity | Rejects mismatch and does not silently select another drawing |
| DRS-API-004 | P0 | POST valid selected attachment IDs + note | Creates one Pending submission with server-derived master fields |
| DRS-API-005 | P0 | POST tries to include editable master fields | Server ignores/rejects client-supplied master values and derives from master context |
| DRS-API-006 | P0 | POST selected attachment from another drawing/company | Rejects; no submission and no copied orphan files |
| DRS-API-007 | P0 | Duplicate active drawing/revision submission exists | Rejects or returns existing conflict; no second Pending submission |
| DRS-DATA-001 | P0 | Successful submit | Submission fields match drawing/part master data and selected attachment metadata |
| DRS-DATA-002 | P1 | Successful submit with copied files | Submission file traceability records original master attachment ID if schema supports it |
| DRS-REG-001 | P0 | Generic `/upload` auxiliary path | Existing upload page remains usable outside `source=drawing` |
| DRS-REG-002 | P0 | Existing submission approval/rejection | Existing review workflow still handles the created Pending submission |

## 5. UI Visible Error Gate

For all UI cases:

- No visible `Internal Server Error`.
- No raw `/api/...` route text.
- No visible `HTTP 4xx/5xx`.
- No blank page.
- No editable fallback master-data form when drawing context resolution fails.

## 6. Required Commands

Minimum RD verification:

```powershell
npx tsc --noEmit
npm run lint -- --quiet
npm run build
```

Recommended focused QC scripts if added:

```powershell
npm run qc:pdm-drawing-submission-review-only
npm run qc:pdm-numbering-api-regression
```

Existing regression to preserve:

```powershell
npm run qc:pdm-change-control
```

If focused scripts are not available, QC must provide equivalent browser/API evidence.

## 7. Browser Evidence

Capture screenshots for:

- Drawing detail before clicking `送審`.
- Drawing-source review-only page with valid data.
- Missing material or missing attachment blocker.
- Successful submit result or Pending task link.
- Mobile/narrow viewport of review-only page.

Suggested artifact paths:

- `output/playwright/pdm-drawing-submission-review-only-desktop.png`
- `output/playwright/pdm-drawing-submission-review-only-blocker.png`
- `output/playwright/pdm-drawing-submission-review-only-mobile.png`

## 8. Stop Conditions

Stop and return to PM/user if:

- RD concludes drawing-source submission requires editing master data on the submission page.
- Existing master data model cannot store or resolve required material/surface treatment without a separate approved schema task.
- Creating submission from master attachments would require destructive file moves instead of safe copy/reference.
- Production schema migration or production deploy becomes required.
- Approval responsibility changes beyond the existing one-reviewer/default matrix rule.

## 9. Pass / Fail

Pass evidence captured on 2026-06-30:

- All P0 cases pass.
- Drawing-source mode has no editable master-data fields.
- Missing master data is blocked and recoverable through master-data screens.
- Successful submission is traceable to source drawing and source attachment(s).
- Generic `/upload` regression remains green.

Executed evidence:

- `npx tsc --noEmit`: passed.
- `npm run lint -- --quiet`: passed.
- `npm run build`: passed.
- `npm run qc:pdm-drawing-submission-review-only`: passed 12/12 checks.
- Continuation audit on 2026-06-30 reran `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, `npm run qc:pdm-drawing-submission-review-only`, `npm run qc:pdm-change-control`, and `PDM_BASE_URL=http://127.0.0.1:3000 npm run qc:pdm-numbering-api-regression`; all passed.
- Browser smoke against `http://127.0.0.1:3001`: `D-0014-MA1` route showed the drawing-source workbench, no generic upload title/form, no editable text/select master-data inputs, one review-note textarea, no visible runtime/API errors, and no mobile horizontal overflow.
- Final local smoke against `http://127.0.0.1:3000`: `D-0014-MA1` route showed `圖面送審`, `送審來源：D-0014-MA1`, no generic upload title/form, zero editable text/select master-data inputs, and disabled `送出審核` while blockers exist.
- Continuation browser/API smoke against `http://127.0.0.1:3000`: desktop route showed source title/banner, no generic upload title/form, no PDM attribute section, zero editable text/select master-data inputs, one review-note textarea, disabled submit, material and surface blockers, and no visible runtime/API errors; context API returned blockers `missing_material` and `missing_surface_finish` with 3 attachments; generic `/upload` still showed `Windows 檔案送審`; mobile route had no horizontal overflow; duplicate POST for `D-QCDRS-MR0FC6P3-MA1` returned 409 `DRAWING_SUBMISSION_DUPLICATE_REVISION`.
- Missing-data blocker evidence: `D-0014-MA1` context returned blockers for missing material and missing surface treatment, while still showing eligible source attachments.
- Successful submit evidence: local `QC-DRS-*` fixture returned blockers = 0, POST created Pending submission `SUB-20260630-5FE2CE3E` revision `0.1`, persisted source drawing/source attachment traceability, derived material `SUS304` and surface `拋光` server-side, and rejected duplicate POST with 409 `DRAWING_SUBMISSION_DUPLICATE_REVISION`.

Conditional pass:

- P0 UI/API behavior passes but traceability fields are not yet migrated; must record residual risk and follow-up migration task.

Fail:

- Drawing-source `送審` still opens blank `/upload`.
- Submission page permits editing PDM master-data fields in drawing-source mode.
- Duplicate active submission can be created.
- Visible runtime error appears in the main workflow.
