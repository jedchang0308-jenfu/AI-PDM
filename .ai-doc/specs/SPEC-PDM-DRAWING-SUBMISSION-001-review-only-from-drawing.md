# SPEC-PDM-DRAWING-SUBMISSION-001 - Drawing-source review-only submission

Status: Implemented / verification passed locally
Date: 2026-06-30
Owner: Dev PM
Related DEV: `DEV-PDM-DRAWING-SUBMISSION-001`

## 1. Human Decision Brief

Source decision from user APP validation on 2026-06-30:

- User rejected the current behavior where drawing detail `送審` opens a blank generic `/upload` form.
- User confirmed the product rule: `送審階段不應該再補資料，這些應該都在圖號模組完成`.

HCS thinking habits applied:

- `#目的`: submission exists to submit already-controlled drawing data for review, not to create or repair master data.
- `#系統描繪`: drawing module owns drawing master data; submission owns review package creation.
- `#差距分析`: current system has drawing context and attachments, but the CTA drops the operator into an unrelated blank form.
- `#批判`: editable PDM master fields in submission create duplicate sources of truth and weaken PDM control.
- `#可驗證性`: the corrected flow must prove no editable master-data fields appear after entering from a drawing.

Confirmed decisions:

- Drawing module is the authoritative place to complete drawing/part master data before review.
- Drawing-source `送審` must open a review-only submission workflow with read-only context and blockers.
- Missing master data must block submission and guide the user back to drawing/part master editing; it must not be fixed on the submission page.
- Submission note/reason is allowed because it belongs to review context, not master data.
- Generic `/upload` can remain as an auxiliary/manual intake route, but drawing detail must not route users to a blank generic upload form.

Rejected options:

- Prefill `/upload` and let users edit drawing number, part number, part name, revision, material, surface finish, or document type.
- Keep `送審` as `/upload` with an empty form.
- Use submission as a fallback master-data repair screen.

AI assumptions:

- First implementation covers drawing detail `圖號治理 -> 送審`; other entry points can reuse the service later.
- Existing master attachment files are the source files for drawing-source submission. If no suitable attachment exists, the user must upload/manage it in the drawing attachment library first.
- General `/upload` remains available for auxiliary Windows/Web file intake until a separate deprecation task is approved.
- Production deploy, production migration, and Supabase production cutover remain out of scope.

Re-entry triggers:

- User wants to remove generic `/upload` entirely.
- User wants submission to create or mutate drawing/part master data.
- Implementation requires destructive data migration or production cutover.
- Existing schema cannot support traceability without adding fields beyond the minimal source-link contract below.

## 2. Problem

The current drawing detail action opens `/upload` without drawing context. This violates the operator mental model:

```text
I selected D-0014-MA1 -> I clicked 送審 -> I expect to submit D-0014-MA1 for review
```

Instead, the current UI asks the user to re-enter PDM attributes. This creates duplicate sources of truth:

- Drawing number, part number, part name and revision can diverge from the drawing module.
- Material and surface treatment can be patched in submission without updating master data.
- Reviewers cannot tell whether they are reviewing a controlled drawing package or a temporary upload form.

## 3. Product Rule

Authoritative boundary:

```text
圖號模組 = 主資料完成區
送審頁 = 審核提交區
```

Submission may collect only review-package inputs:

- Submission note / reason.
- Selected source attachment version(s) from the drawing attachment library.
- Optional reviewer route only if company policy requires user choice.

Submission must not collect or edit master-data fields:

- Drawing number.
- Part number.
- Part name.
- Revision.
- Product series.
- Process.
- Material.
- Surface treatment.
- Document type.
- Customer/project/machine legacy fields.

## 4. Target UX

### 4.1 Drawing detail CTA

Drawing detail `圖號治理` action:

```text
送審 -> /upload?source=drawing&drawingNumber={drawing.drawingNumber}
```

Route implementation may use `/upload?source=drawing...` or a dedicated route such as `/numbering/drawings/{drawingNumber}/submit`, but drawing-source mode must render a distinct review-only workbench, not the generic upload form.

### 4.2 Review-only workbench

The first viewport must show:

- Title: `圖面送審`.
- Source banner: `送審來源：{drawingNumber}`.
- Read-only master summary:
  - Drawing number.
  - Purpose / drawing type.
  - Part name or core name.
  - Linked part number(s), with primary part clearly marked.
  - Development phase and record status.
  - Suggested review revision.
  - Material and surface treatment resolved from master data.
- Attachment selector:
  - Default selected source file is the latest appropriate drawing/CAD attachment.
  - SolidWorks files are labelled by extension and revision.
  - Sidecar/property files are not independent review files unless explicitly allowed later.
- Blocker panel:
  - Missing linked part.
  - Missing material/surface treatment.
  - Missing suitable attachment.
  - Duplicate active submission for the same drawing/revision.
  - Drawing status not eligible for submission.
- Editable review-only field:
  - `送審備註` / `送審原因`.
- Primary action:
  - `送出審核`.

No editable PDM master-data input fields may be visible in drawing-source mode.

### 4.3 Missing data behavior

If required data is missing:

- `送出審核` is disabled.
- The blocker says exactly what is missing.
- The recovery action navigates back to the correct master-data surface:
  - Missing attachment -> drawing detail attachment library.
  - Missing material/surface treatment -> linked part/drawing master data editor.
  - Missing linked part -> drawing/part relationship area.
- The submission page must not show fields to fix those values inline.

## 5. Implementation Contract

### 5.1 Resolver

Add or extend a server-side resolver:

```text
GET /api/numbering/drawings/{drawingNumber}/submission-context
```

Equivalent route names are acceptable if the contract is preserved.

Response:

```ts
type DrawingSubmissionContext = {
  pdmCompany: {
    companyId: string;
    companyCode: string;
    displayName: string;
  };
  drawing: {
    id: string;
    drawingNumber: string;
    purposeCode: string;
    purposeLabel: string;
    recordStatus: string;
    developmentPhase: string;
    coreName: string;
  };
  primaryPart: null | {
    id: string;
    partNumber: string;
    partName: string;
    itemKind: string;
    material: string;
    surfaceFinish: string;
    processName: string;
    productSeries: string;
  };
  linkedParts: Array<{
    id: string;
    partNumber: string;
    partName: string;
    isPrimary: boolean;
  }>;
  attachments: Array<{
    id: string;
    displayName: string;
    fileName: string;
    fileExt: string;
    fileSize: number;
    documentCategory: string;
    revision: string | null;
    createdAt: string;
    eligibleForSubmission: boolean;
    ineligibleReason?: string;
  }>;
  suggestedRevision: {
    revision: string;
    source: "revision_policy" | "latest_attachment" | "manual_master";
  };
  blockers: Array<{
    code:
      | "missing_primary_part"
      | "missing_material"
      | "missing_surface_finish"
      | "missing_attachment"
      | "duplicate_active_submission"
      | "drawing_not_submittable";
    message: string;
    recoveryHref: string;
  }>;
};
```

Resolution rules:

- Company scope must be enforced server-side.
- `drawingNumber` must resolve to exactly one drawing in the user's allowed company.
- Primary part selection:
  - Prefer explicit primary manufacturing link.
  - Else use the first linked manufacturing part when exactly one safe candidate exists.
  - Else return blocker `missing_primary_part`.
- Material and surface finish must be resolved from master data, preferably `part_variant_attributes.material_label` and `surface_treatment`; fallback to equivalent existing master fields if present.
- Attachment eligibility:
  - Allowed first-version review files: `slddrw`, `sldprt`, `sldasm`, `pdf`, `dwg`.
  - Prefer drawing files over model files when selecting defaults.
  - Metadata sidecar files are not selected as review files.

### 5.2 Submission creation

Add a review-only create endpoint or service:

```text
POST /api/numbering/drawings/{drawingNumber}/submissions
```

Request:

```ts
type CreateDrawingSubmissionRequest = {
  selectedAttachmentIds: string[];
  note: string;
};
```

The request must not accept editable PDM master-data values. Server derives all submission fields from master context.

Server-derived submission input:

| Submission field | Source |
|---|---|
| `drawing_number` | drawing master |
| `part_number` | resolved primary part |
| `part_name` | resolved primary part, fallback drawing/core name only if product rule allows |
| `revision` | resolver suggested revision or selected attachment revision when policy-compatible |
| `product_line` | primary part product series / empty optional |
| `process_name` | primary part process / empty optional |
| `material` | primary part material |
| `surface_finish` | primary part surface treatment |
| `document_type` | selected attachment category / file extension |
| `change_description` | user note |
| `approval_required` | existing default one reviewer unless approval matrix overrides |

Transaction / file handling:

- Validate context and blockers again on POST.
- Validate selected attachments belong to the same drawing and company.
- Copy selected master attachment files into the submission repository, or reuse repository storage through a traceable file reference if the file-store contract supports it.
- Create submission as `Pending`.
- Create audit event linking source drawing and selected attachment IDs.
- If DB insert fails after file copy, remove copied submission files.
- If background Drive sync fails, preserve submission and mark file sync status per existing compensation behavior.

### 5.3 Minimal schema / traceability contract

If existing schema does not already preserve source traceability, add nullable fields through the normal local migration path:

- `submissions.source_entity_type` = `drawing_number` for drawing-source submissions.
- `submissions.source_entity_id` = source drawing number ID.
- `submission_files.source_master_attachment_id` = original master attachment ID.

These fields are additive and nullable. Existing generic upload submissions remain compatible.

Production schema migration is out of scope unless separately approved through deployment/release gate.

### 5.4 UI implementation

`src/app/upload/page.tsx` may branch by query parameter:

- `source=drawing`: render review-only drawing submission workbench.
- otherwise: render existing generic upload form.

Alternative dedicated page is acceptable if drawing detail CTA points there and generic upload remains unaffected.

Drawing detail update:

- Replace `href="/upload"` with source-aware route containing drawing number.
- Do not include internal UUID in visible UI.
- If using both ID and official number internally, reject mismatched pairs server-side.

## 6. Permissions

Minimum required permissions:

- User must be authenticated.
- User must have permission to view the drawing.
- User must have permission to create submissions in the resolved company.
- First implementation can follow existing submission role gate: Engineer/Admin.

Forbidden:

- Manager-only review users should not create drawing-source submission unless existing product policy allows them to submit.
- User must not submit a drawing from another company by crafting query params.

## 7. Failure Modes

| Failure | Required behavior |
|---|---|
| Drawing not found | Traditional Chinese visible error; no blank form |
| Multiple/mismatched drawing identity | Block and ask user to re-open from drawing module |
| Missing primary part | Disabled submit; recovery link to relationship/master area |
| Missing material/surface finish | Disabled submit; recovery link to master data editing |
| No eligible attachment | Disabled submit; recovery link to attachment library |
| Duplicate active submission | Disabled submit; link to existing pending/released item if available |
| Attachment deleted during submit | POST re-check fails safely; no orphan submission |
| File copy fails | No DB submission or rollback + visible error |
| Drive sync fails after submission | Submission remains Pending; file sync status shows failed/retry per existing behavior |

## 8. Out of Scope

- Removing generic `/upload`.
- Production deployment.
- Supabase production cutover.
- SolidWorks Document Manager integration.
- CAD file mutation.
- Editing drawing/part master data inside submission page.
- Redesigning the whole submission dashboard.
- Changing approval business rules beyond defaulting to the existing one-reviewer path.

## 9. Acceptance Criteria

- From drawing detail `D-0014-MA1`, clicking `送審` opens a drawing-source submission screen, not a blank generic upload form.
- The page title and source banner identify the drawing being submitted.
- Drawing number, part number, part name, revision, material, surface finish and document type are read-only or not shown as inputs.
- No visible labels/inputs for `圖號`, `料號`, `品名`, `版次`, `材質`, `表面處理`, `文件類型` appear as editable fields in drawing-source mode.
- Existing source attachments can be selected for review.
- Submit is disabled until source attachment and required master data are valid.
- Missing master data recovery sends user back to master-data surfaces.
- Successful submit creates one Pending submission with fields derived from the drawing/part master data.
- Duplicate active submission for same drawing/revision does not create a second Pending item.
- Generic `/upload` remains usable for auxiliary intake and its existing tests still pass.
- Desktop and mobile drawing-source submission screens have no horizontal overflow, overlap, clipped buttons, or visible runtime errors.

## 10. QA / QC Gate

Required validation:

- `npx tsc --noEmit`
- `npm run lint -- --quiet`
- `npm run build`
- Existing submission regression covering `POST /api/submissions`.
- Numbering API regression covering drawing/part relationship safety.
- Focused browser smoke:
  - Drawing detail `送審` route.
  - Drawing-source review-only page.
  - Missing data blocker.
  - Successful submission.
  - Duplicate submission prevention.

Focused QA plan: `.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`.

Execution evidence captured on 2026-06-30:

- `npx tsc --noEmit` passed.
- `npm run lint -- --quiet` passed.
- `npm run build` passed.
- `npm run qc:pdm-drawing-submission-review-only` passed 12/12 checks.
- `npm run qc:pdm-change-control` passed 56/56 checks.
- `PDM_BASE_URL=http://127.0.0.1:3001 npm run qc:pdm-numbering-api-regression` passed 27/27 checks.
- Browser smoke on `http://127.0.0.1:3001/upload?source=drawing&drawingNumber=D-0014-MA1` passed desktop/mobile visible-error and no-master-input checks. Screenshots: `output/playwright/pdm-drawing-submission-review-only-desktop.png`, `output/playwright/pdm-drawing-submission-review-only-mobile.png`.
- Final local smoke on `http://127.0.0.1:3000/upload?source=drawing&drawingNumber=D-0014-MA1` passed: title/source banner present, generic upload content absent, editable text/select master-data input count = 0, and `送出審核` disabled while blockers exist.
- API smoke with local disposable-prefix `QC-DRS-*` fixture created a Pending submission with server-derived material/surface, source drawing trace, source master attachment trace and duplicate-prevention 409.

## 11. Spec Governance

Cross-spec handling:

- This spec intentionally supersedes the `DEV-PDM-UI-POLISH-001` completed-scope statement that drawing detail `送審` enters `/upload` as a generic workflow.
- `DEV-PDM-UI-POLISH-001` remains completed for UI simplification work, but drawing-source submission is now a new follow-up DEV with stricter responsibility boundary.
- Existing `.ai-doc/qa/qa-windows-upload-validation-plan-2026-05-26.md` remains valid for auxiliary upload; it does not govern drawing-source review-only submission.

ADR decision:

- No standalone ADR is created now because the decision is local to drawing-source submission workflow and is captured here with explicit supersession notes.
- ADR should be reconsidered if generic `/upload` is retired globally or if submission lifecycle/approval ownership changes beyond drawing-source entry.
