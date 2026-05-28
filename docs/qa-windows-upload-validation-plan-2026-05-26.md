# QA Validation Plan: Windows / Web File Submission Entry

Date: 2026-05-26  
Owner: QA  
Scope: `/upload` Windows / Web file submission entry and `POST /api/file-metadata/detect`

## 1. QA Objective

Verify that users can submit files from Windows Explorer or the browser without using the SolidWorks Add-in, while preserving the existing PDM controls:

- Role-based access control.
- Required PDM metadata.
- Change reason validation.
- File type and size policy.
- Duplicate `drawing_number + revision` prevention.
- Repository / DB traceability.
- Pending review workflow.

This validation does not certify native SolidWorks custom-property extraction from `.sldprt`, `.sldasm`, or `.slddrw`. That remains a P0 open item until SolidWorks Document Manager API or equivalent licensed extraction is integrated.

## 2. Scope

In scope:

- `/upload` page rendering and usability.
- Drag-and-drop and Windows file picker selection.
- `.pdm.json`, `.properties`, and `.txt` sidecar metadata detection.
- Filename fallback metadata hints.
- Manual correction of detected metadata.
- Submission through existing `POST /api/submissions`.
- Repository storage and DB records.
- Dashboard visibility after upload.
- Error handling and security boundaries.

Out of scope for this plan:

- SolidWorks Add-in real-machine registration and UI validation.
- Google Drive release end-to-end validation, except checking that upload still enters Pending normally.
- Native SolidWorks internal property extraction.

## 3. Environment

| Item | Requirement |
| --- | --- |
| OS | Windows |
| App URL | `http://localhost:3000` |
| Node.js | Project-supported local Node runtime |
| Auth mode | `PDM_AUTH_MODE=demo` or managed equivalent |
| Engineer account | `engineer@example.com` / configured password |
| Manager account | `manager@example.com` / configured password |
| Browser | Chromium / Edge / Chrome |
| Test command baseline | `npm.cmd run lint`, `npm.cmd run build` |

Recommended startup:

```powershell
npm.cmd run dev -- -H 0.0.0.0
```

## 4. Test Data

### 4.1 Valid Sidecar JSON

Create `A-900.pdm.json`:

```json
{
  "drawing_number": "A-900",
  "part_number": "PN-900",
  "part_name": "Field Upload Test Part",
  "revision": "A",
  "material": "SUS304",
  "surface_finish": "Polished",
  "document_type": "Part"
}
```

Pair it with one or more submission files:

- `A-900_RevA.sldprt`
- `A-900_RevA.pdf`
- `A-900_RevA.dwg`

### 4.2 Valid Properties Sidecar

Create `A-901.properties`:

```properties
drawing_number=A-901
part_number=PN-901
part_name=Field Upload Properties Test
revision=A
material=AL6061
surface_finish=Anodized
document_type=Drawing
```

### 4.3 Missing Metadata Sidecar

Create `A-902.pdm.json` with one required field missing:

```json
{
  "drawing_number": "A-902",
  "part_number": "PN-902",
  "revision": "A",
  "material": "S45C",
  "surface_finish": "Black oxide",
  "document_type": "Part"
}
```

### 4.4 Invalid Files

- Empty file.
- Unsupported extension, such as `.exe`.
- File larger than `PDM_MAX_UPLOAD_FILE_BYTES`.
- Duplicate `drawing_number + revision`.

## 5. Entry Criteria

QA may start when:

- `/upload` route exists.
- `POST /api/file-metadata/detect` route exists.
- `POST /api/submissions` still passes existing regression tests.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.

## 6. Exit Criteria

The feature can be accepted for P1 Windows / Web upload when:

- All P0 and P1 cases in this plan pass.
- No unauthorized user can detect metadata or submit files.
- Sidecar files are not stored in `submission_files`.
- Uploaded real files are stored and traceable by DB row, SHA256, file size, and local path.
- Dashboard shows the new submission as `Pending`.
- `qc:production-readiness:report` still reports native SolidWorks property extraction as open P0 until implemented.

## 7. Test Cases

### 7.1 Build And Route

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-BLD-001 | P1 | Run `npm.cmd run lint`. | Exit code 0. |
| WUP-BLD-002 | P1 | Run `npm.cmd run build`. | Exit code 0; `/upload` and `/api/file-metadata/detect` appear in route list. |
| WUP-BLD-003 | P1 | Open `/upload` in browser. | Page title and dropzone render without console errors. |

### 7.2 Auth And Role

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-AUTH-001 | P0 | Open `/upload` while not logged in. | Page can render, but metadata detect and final submit return `401`. |
| WUP-AUTH-002 | P0 | Call `POST /api/file-metadata/detect` without cookie/token. | Returns `401`. |
| WUP-AUTH-003 | P0 | Call metadata detect as Engineer. | Returns `200` for valid input. |
| WUP-AUTH-004 | P0 | Submit upload as Engineer. | Returns `201`, status `Pending`. |
| WUP-AUTH-005 | P0 | Submit upload as Manager. | Returns `403`, because existing submission API allows Engineer/Admin only. |
| WUP-AUTH-006 | P0 | Submit upload as Admin. | Returns `201`, status `Pending`. |

### 7.3 Metadata Detection

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-META-001 | P1 | Upload `.sldprt` plus valid `.pdm.json`. | All 7 metadata fields are auto-filled with `high` confidence. |
| WUP-META-002 | P1 | Upload `.pdf` plus valid `.properties`. | All 7 metadata fields are auto-filled with `high` confidence. |
| WUP-META-003 | P1 | Upload `.dwg` plus `.txt` key-value sidecar. | Known aliases are mapped into fields. |
| WUP-META-004 | P1 | Upload only `A-903_RevA.sldprt`. | Filename fallback fills drawing/part/revision/document type where possible; warning states native extraction requires Document Manager. |
| WUP-META-005 | P0 | Upload native SolidWorks file without sidecar. | System must not claim it has read internal SolidWorks custom properties. |
| WUP-META-006 | P1 | Sidecar has nested JSON object. | Known fields are detected if aliases are present. |
| WUP-META-007 | P1 | Sidecar is malformed JSON. | Detect API returns `400`, UI shows error and allows manual entry. |
| WUP-META-008 | P1 | Sidecar exceeds 1 MB. | Sidecar is skipped with warning; no crash. |

### 7.4 Manual Form And Validation

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-FORM-001 | P0 | Clear `drawing_number` and submit. | Returns validation error; no repository file is created. |
| WUP-FORM-002 | P0 | Clear `part_number` and submit. | Returns validation error; no repository file is created. |
| WUP-FORM-003 | P1 | Use change reason shorter than 5 chars. | Submit is blocked or API returns `400`. |
| WUP-FORM-004 | P1 | Use numeric-only change reason. | API returns `400`. |
| WUP-FORM-005 | P1 | Correct detected metadata manually before submit. | Submitted record stores corrected values. |
| WUP-FORM-006 | P1 | Select approval required = 2. | Submission stores two-reviewer requirement. |

### 7.5 File Policy

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-FILE-001 | P0 | Submit `.sldprt`. | Accepted and stored with file role `sldprt`. |
| WUP-FILE-002 | P0 | Submit `.sldasm`. | Accepted and stored with file role `sldasm`. |
| WUP-FILE-003 | P0 | Submit `.slddrw`. | Accepted and stored with file role `slddrw`. |
| WUP-FILE-004 | P0 | Submit `.pdf`. | Accepted and preview/download remains available. |
| WUP-FILE-005 | P0 | Submit `.dwg`. | Accepted and stored with file role `dwg`. |
| WUP-FILE-006 | P0 | Include sidecar with real files. | Sidecar is not persisted as a PDM file. |
| WUP-FILE-007 | P0 | Submit unsupported `.exe`. | Returns `400`; no repository file is created. |
| WUP-FILE-008 | P0 | Submit empty file. | Returns `400`; no repository file is created. |
| WUP-FILE-009 | P0 | Submit oversized file. | Returns `400` with file-size error. |

### 7.6 Submission And Repository Integrity

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-SUB-001 | P0 | Submit valid upload with sidecar. | API returns `201`, new submission status is `Pending`. |
| WUP-SUB-002 | P0 | Check dashboard as Manager. | New submission appears in Pending list. |
| WUP-SUB-003 | P0 | Open submission detail. | Metadata, files, SHA256, file size, and local path are visible. |
| WUP-SUB-004 | P0 | Check DB/repository consistency. | No orphan and no missing file. |
| WUP-SUB-005 | P0 | Submit duplicate `drawing_number + revision`. | Returns `409`; no orphan file remains. |
| WUP-SUB-006 | P1 | Submit multiple files in one record. | File count and all file roles are recorded. |

### 7.7 Workflow Integration

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-WF-001 | P0 | Manager approves uploaded Pending submission. | Existing approval workflow works. |
| WUP-WF-002 | P0 | Manager rejects uploaded Pending submission. | Existing rejection workflow works. |
| WUP-WF-003 | P0 | Engineer attempts to approve own upload. | Returns `403`. |
| WUP-WF-004 | P1 | AI asks about uploaded Pending item. | AI response respects same role/data scope. |

### 7.8 Browser Usability

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-UI-001 | P1 | Drag files onto dropzone. | File list appears and metadata detection runs. |
| WUP-UI-002 | P1 | Select files through Windows file picker. | File list appears and metadata detection runs. |
| WUP-UI-003 | P1 | Remove one file from selected list. | File is removed and detection refreshes. |
| WUP-UI-004 | P1 | Use desktop viewport. | No overlapping controls or unreadable text. |
| WUP-UI-005 | P2 | Use mobile/narrow viewport. | Form remains usable; no text overflow that blocks submission. |

### 7.9 Security And Audit

| ID | Priority | Test | Expected Result |
| --- | --- | --- | --- |
| WUP-SEC-001 | P0 | Sidecar contains script or HTML in field values. | Values are displayed as text; no script execution. |
| WUP-SEC-002 | P0 | Sidecar contains path traversal-looking values. | Files are still stored only through server-controlled repository path. |
| WUP-SEC-003 | P1 | Successful upload creates audit log. | Audit log contains Submit action and file count. |
| WUP-SEC-004 | P0 | CAD workstation credential policy. | No Google service account key is required for `/upload` user submission. |

## 8. Recommended Manual Execution Flow

1. Log in as Engineer.
2. Open `/upload`.
3. Drag `A-900_RevA.sldprt` and `A-900.pdm.json`.
4. Confirm all 7 metadata fields auto-fill.
5. Enter meaningful change reason.
6. Submit.
7. Log in as Manager.
8. Confirm Pending list and detail page.
9. Preview/download files where applicable.
10. Approve or reject to confirm workflow integration.

## 9. Recommended Automation Additions

Add or extend test scripts later:

- `scripts/qc-windows-upload-test.mjs`
- Include it in `qc:full` after `qc:api`.
- Cover:
  - unauthorized metadata detect.
  - Engineer sidecar detect.
  - valid sidecar submission.
  - duplicate submission no orphan.
  - sidecar not persisted.

## 10. Risk Register

| Risk | Priority | QA Position |
| --- | --- | --- |
| Users may believe native SolidWorks properties are read directly. | P0 | UI/report must keep warning until Document Manager integration exists. |
| Sidecar data may differ from actual CAD file custom properties. | P0 | Treat sidecar upload as auxiliary path; formal CAD release should prefer SolidWorks Add-in until native extraction exists. |
| Manual correction may introduce wrong metadata. | P1 | Audit trail and reviewer check are required. |
| Duplicate or failed upload may leave orphan files. | P0 | Must reuse existing duplicate/orphan regression. |
| Manager role cannot submit through API. | P0 | Expected by current role model; only Engineer/Admin submit. |

## 11. QA Conclusion Criteria

QA may mark this feature `Pass for P1 auxiliary upload` when all P0/P1 cases pass.

QA must mark `Conditional Pass` if sidecar and manual upload work but native SolidWorks property extraction remains open. The condition is:

> Windows / Web upload is approved as an auxiliary submission entry. It is not yet approved as a replacement for SolidWorks Add-in metadata extraction or formal CAD release validation.
