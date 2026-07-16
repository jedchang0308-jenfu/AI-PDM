# QA Manual Validation Plan: PDM Drawing Revision Control

Date: 2026-06-22
Task: `DEV-PDM-REVISION-001`
Mode: QA hands-on validation plan
Status: Prepared for QC/manual execution
Target branch: `codex/pdm-revision-policy`
Target commit: `8f472d0`

## 1. Purpose

This QA plan defines the manual validation scope for the PDM drawing revision-control change based on engineering drawing management procedure section 4.1.

The operator must personally use the web UI and API-facing workflows to prove:

- Revision is an important controlled PDM field.
- Revision defaults are auto-filled by the system.
- Users can still edit revision before submission or attachment upload.
- Revision format does not include `V`.
- Numeric major/minor revision rules are enforced consistently across submission upload, drawing attachment library, backend validation, and AI policy/RAG content.

## 2. Scope

In scope:

- `/numbering/drawings` drawing detail drawer and `MasterAttachmentPanel`.
- `/upload` submission upload form.
- `GET /api/submissions/revision-suggestion`.
- `POST /api/submissions` revision validation.
- Drawing master attachment upload revision validation.
- AI/PDM policy source and generated RAG rule text.
- Visible UI error sweep and viewport sanity checks.

Out of scope:

- Production deployment.
- Supabase production/cutover.
- SolidWorks real-machine add-in operation.
- Google Drive live release integration.
- Full data parity or migration testing.

## 3. Test Environment

| Item | Requirement |
|---|---|
| App URL | `http://127.0.0.1:3000` |
| Browser | Chrome or Playwright browser, hard refresh before UI checks |
| Database | Local `data/ai-pdm.sqlite` test data |
| Branch evidence | `codex/pdm-revision-policy` commit `8f472d0` |
| Accounts | Admin/Manager for setup and release checks; Engineer for normal upload paths |
| Demo password | Use configured `PDM_DEMO_PASSWORD`, or local default only if demo mode is enabled |

## 4. Entry Criteria

QA may start manual execution only if:

- Local app starts without visible server error.
- User can log in.
- `/numbering/drawings` renders at least one drawing row.
- `/upload` renders metadata fields including `版次`.
- `npm.cmd run qc:master-attachments`, `npm.cmd run qc:revision-lifecycle`, and `npm.cmd run qc:policy-alignment` have passed on the target branch.

## 5. Test Data

Preferred existing data:

- Drawing: `D-0011-MA1` or any visible MA drawing in `/numbering/drawings`.
- Purpose/process control: MA drawings are treated as process-controlled.
- Existing released submission: use the latest `QC-REVOBS-*` or create one through the controlled upload/release flow.

If data is missing:

1. Create or locate a process-controlled drawing number.
2. Create a test submission with revision `1`.
3. Release it through the normal manager approval path.
4. Use the same drawing number to validate next major/minor suggestions.

## 6. Acceptance Criteria

| ID | Acceptance criterion | Evidence required |
|---|---|---|
| `QA-REV-001` | Drawing attachment panel auto-fills an editable minor revision for process-controlled work-area drawings | Screenshot of drawing drawer showing revision field value `0.1` or next minor, helper text says no `V` |
| `QA-REV-002` | User can edit the auto-filled attachment revision | Screenshot before upload and created attachment row showing edited numeric revision |
| `QA-REV-003` | Attachment upload rejects `V1`, `V0.1`, `A`, `B`, and `R01` | Visible UI error or API response evidence showing 400/error message |
| `QA-REV-004` | Submission upload auto-fills suggested revision from `/api/submissions/revision-suggestion` | Screenshot of `/upload` revision field and captured API response |
| `QA-REV-005` | Submission upload allows user edit to another valid numeric revision | Screenshot and successful submission evidence |
| `QA-REV-006` | Submission upload rejects `V` prefix and alphabetic revisions | Visible validation error or HTTP 400 body |
| `QA-REV-007` | Released-area revisions use major numeric format | Release/revision lifecycle evidence showing `1 -> 2` |
| `QA-REV-008` | Work-area revisions use minor numeric format | Drawing attachment or design-change scenario evidence showing `0.1`, `0.2`, `1.1`, or `1.2` |
| `QA-REV-009` | Policy/RAG text tells users no `V`, numeric major/minor format, editable default | Evidence from `.ai-doc/reference/pdm-management-policy-draft.md` and `src/lib/pdm-policy-rag-data.ts` |
| `QA-REV-010` | UI has no visible runtime errors during operation | Screenshot or note from visible error sweep |

## 7. Manual Test Cases

### TC-REV-001 Drawing Attachment Default

Steps:

1. Log in.
2. Open `http://127.0.0.1:3000/numbering/drawings`.
3. Select a process-controlled MA drawing such as `D-0011-MA1`.
4. In the drawing detail drawer, scroll to `圖號附件庫`.
5. Observe the `版次` input.

Expected:

- `版次` is auto-filled.
- For MA work-area drawing, default is a minor revision such as `0.1`.
- Helper text says the revision can be edited and must not include `V`.
- No visible `.inline-error`, `HTTP 4xx/5xx`, `Not Found`, or `/api/...` failure text appears.

### TC-REV-002 Attachment Revision Can Be Edited

Steps:

1. Continue from `TC-REV-001`.
2. Change `版次` from default to a valid numeric value such as `0.2`.
3. Select a small local test file.
4. Upload the attachment.

Expected:

- Upload succeeds.
- Created attachment row displays `版次 0.2`.
- The row does not display `Rev 0.2`.

### TC-REV-003 Attachment Invalid Revision Rejection

Steps:

1. Open the same drawing attachment panel.
2. Set `版次` to `V1`.
3. Select a small local test file.
4. Upload.
5. Repeat with `A` or `R01` if the UI remains available.

Expected:

- Upload is rejected.
- Error message explains that `V`/alphabetic revision is not allowed or numeric format is required.
- No attachment row is created for the invalid revision.

### TC-REV-004 Upload Page Auto-Fills Submission Revision

Steps:

1. Open `http://127.0.0.1:3000/upload`.
2. Select or drag a valid CAD/PDF test file.
3. Fill or confirm `圖號`.
4. Observe the `版次` field after the drawing number is entered.
5. Optionally inspect network response from `/api/submissions/revision-suggestion`.

Expected:

- `版次` is auto-filled by the system.
- Suggested revision has no `V`.
- Helper text says users can edit and should use `1`, `2`, `0.1`, or `1.1`.

### TC-REV-005 Upload Page User Edit

Steps:

1. Continue from `TC-REV-004`.
2. Edit `版次` to another valid numeric value that is not a duplicate for the drawing.
3. Complete required metadata and submit.

Expected:

- The edited numeric revision remains in the field.
- Submission succeeds unless blocked by a legitimate duplicate.
- The resulting submission displays the edited revision.

### TC-REV-006 Upload Page Rejects `V`

Steps:

1. Open `/upload`.
2. Prepare a valid file and required metadata.
3. Set `版次` to `V1`.
4. Submit.

Expected:

- Submission is rejected.
- Error message says `版次` already implies version and `V` must not be added, or equivalent numeric-format warning.
- No successful submission is created.

### TC-REV-007 Major Revision Lifecycle

Steps:

1. Create a submission for a test drawing with revision `1`.
2. Approve/release it as Manager.
3. Create another submission for the same item/drawing with revision `2`.
4. Approve/release it.
5. Check revision history and handoff/procurement effective revision.

Expected:

- Revision `1` becomes `Obsolete` after revision `2` is released.
- `items.current_revision` becomes `2`.
- Manufacturing handoff/procurement expose only the effective released revision `2`.

### TC-REV-008 Policy/RAG Manual Check

Steps:

1. Open `.ai-doc/reference/pdm-management-policy-draft.md`.
2. Open `src/lib/pdm-policy-rag-data.ts`.
3. Locate the `版次規則` section.

Expected:

- Both files state system auto-fills default revision and user may edit.
- Both files state no `V`.
- Both files reject `V1`, `V0.1`, `A/B/C`, and `R01/R02`.
- There is no active policy sentence saying the MVP does not auto-generate revision.

## 8. Visible Error Sweep

For every UI route used above, QA must perform a visible error sweep:

- No visible `.inline-error` unless it is the expected validation error being tested.
- No visible `[role=alert]` unexpected failure.
- No visible `HTTP 4xx/5xx`, `Not Found`, `Internal Server Error`, or `/api/...` route error text.
- No all-zero or empty critical panels when the test scenario expects data.
- No horizontal overflow or clipped revision helper text at desktop width.

Required viewports:

- Desktop: `1440 x 900` or current desktop browser.
- Tablet/narrow sanity: around `768 x 900`, if the route remains usable at that size.

## 9. FMEA

| Risk | Failure mode | User impact | Detection | Severity | Mitigation / expected control |
|---|---|---|---|---|---|
| Wrong default revision | System suggests `V1` or `A` | Drawing revision table conflicts with company rule | UI field and API suggestion check | P0 | Central numeric revision policy rejects `V`/alpha |
| User edit overwritten | User edits revision but async suggestion overwrites it | Wrong revision is submitted | Upload page edit test | P0 | `revisionTouched` preserves manual edits |
| Attachment bypass | Attachment backend accepts invalid revision | Uncontrolled file revision enters PDM | Invalid upload test | P0 | Sync/async repositories validate attachment revision |
| Policy drift | AI/RAG explains old A/B or no-auto rule | Users follow wrong rule | Policy/RAG manual check | P1 | `qc:policy-alignment` includes numeric/no-`V` checks |
| UI visible failure | Drawer or upload form shows hidden runtime error | User cannot trust workflow | Visible error sweep | P0 | QA fails the run until same surface is clean |

## 10. No-Go Criteria

QA must reject the build if any of the following occurs:

- Any valid workflow auto-fills a revision with `V`.
- Any invalid revision `V1`, `V0.1`, `A`, `B`, or `R01` is accepted.
- A manual edit is overwritten by a later suggestion.
- Attachment row shows `Rev {revision}` instead of `版次 {revision}`.
- Policy/RAG still says revision is not auto-generated.
- The UI has unexpected visible errors on the tested route.
- The revision lifecycle cannot prove `1 -> 2` release behavior.

## 11. QC Handoff

QC may accept this QA plan when it can produce:

- Screenshots for `TC-REV-001`, `TC-REV-002`, `TC-REV-004`, and visible error sweep.
- API/body evidence for invalid `V1` rejection on submission and attachment.
- Runtime evidence for major lifecycle `1 -> 2`.
- Static evidence from policy/RAG files.
- Command evidence from:

```powershell
& .\node_modules\.bin\eslint.cmd src/lib/revision-policy.ts src/components/master-attachment-panel.tsx src/app/numbering/drawings/page.tsx src/app/upload/page.tsx src/app/api/submissions/revision-suggestion/route.ts
& .\node_modules\.bin\tsc.cmd --noEmit --pretty false
npm.cmd run qc:master-attachments
npm.cmd run qc:revision-lifecycle
npm.cmd run qc:policy-alignment
npm.cmd run qc:dev-task-evidence-sync
```

QA disposition: ready for manual QC execution.
