# QC Validation Report: Windows / Web File Submission Entry

Date: 2026-05-26  
Role: QC  
Scope: `/upload` and `POST /api/file-metadata/detect`  
Reference plan: `.ai-doc/qa/qa-windows-upload-validation-plan-2026-05-26.md`

## Verdict

QC verdict: **Conditional Pass**

The Windows / Web upload entry passes as a P1 auxiliary submission path. It can create normal `Pending` submissions through the existing PDM workflow.

It is not yet a replacement for SolidWorks Add-in metadata extraction because native `.sldprt`, `.sldasm`, and `.slddrw` internal custom-property extraction is still open as P0 and requires SolidWorks Document Manager API or equivalent licensed integration.

## Executed Checks

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | PASS |
| `npm.cmd run build` | PASS |
| `/upload` browser render | PASS |
| UI file picker with `.sldprt` + `.pdm.json` sidecar | PASS |
| `POST /api/file-metadata/detect` authorization | PASS |
| Engineer sidecar metadata detection | PASS |
| Native SolidWorks file without sidecar warning | PASS |
| Malformed JSON sidecar handling | PASS |
| Unauthenticated submit | PASS |
| Manager submit denial | PASS |
| Engineer valid submit | PASS |
| Admin valid submit | PASS |
| Sidecar not persisted as PDM file | PASS |
| SHA256 and file size recorded | PASS |
| Manager sees uploaded Pending submission | PASS |
| Duplicate `drawing_number + revision` rejection | PASS |
| Duplicate leaves no repository file | PASS |
| Unsupported extension rejection | PASS |
| Unsupported extension leaves no repository file | PASS |
| Empty file rejection | PASS |
| Empty file leaves no repository file | PASS |
| `npm.cmd run qc:defects-zero` | PASS |
| `npm.cmd run qc:production-readiness:report` | EXPECTED NOT READY |

## API QC Summary

Automated API scenario:

- Unique drawing number: `WUP-QC-1779764615150`
- Total checks: 24
- Passed: 24
- Failed: 0
- Created Engineer submission: `SUB-20260526-8D4DC91B`
- Created Admin submission: `SUB-20260526-1D69F0B2`

Key evidence:

- Engineer metadata detect returned `200`.
- Sidecar filled all 7 fields with `high` confidence.
- Engineer submit returned `201`, status `Pending`.
- Repository file count increased by 1 after the valid upload.
- Submission detail showed one stored `.sldprt` file, SHA256, file size, and local path.
- `.pdm.json` sidecar was not persisted in `submission_files`.
- Duplicate submission returned `409`.
- Repository file count did not change after duplicate, unsupported, or empty-file rejection.

## UI QC Summary

Automated browser scenario:

- Unique drawing number: `WUP-UI-1779764665480`
- Browser login as Engineer: PASS
- `/upload` page load: PASS
- File picker selection: PASS
- Selected files:
  - `WUP-UI-1779764665480_RevA.sldprt`
  - `WUP-UI-1779764665480.pdm.json`
- Auto-filled fields:
  - `drawing_number`
  - `part_number`
  - `part_name`
  - `revision`
  - `material`
  - `surface_finish`
  - `document_type`
- Console/page errors: 0

## Readiness Gate

`npm.cmd run qc:production-readiness:report` remains `ready: false`.

Remaining blockers:

1. SolidWorks Add-in real-machine validation is still partial.
2. Independent-machine restore drill is still partial.
3. Web/Windows native SolidWorks property extraction is still open P0.

This is expected and does not invalidate the P1 auxiliary upload result.

## QC Notes

During validation, running `npm.cmd run build` while the dev server was active temporarily removed `.next` and caused `/upload` to return `500`. The dev server was restarted and the UI/API validation then passed. This is a test-environment interference, not a product defect.

## Final QC Position

Approve `/upload` as an auxiliary Windows / Web file submission entry with sidecar metadata support.

Do not approve it as a formal replacement for SolidWorks Add-in metadata extraction until native SolidWorks custom-property extraction is implemented and separately validated.
