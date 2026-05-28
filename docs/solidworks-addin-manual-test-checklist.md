# SolidWorks Add-in Manual Test Checklist

Date: 2026-05-22
Scope: SolidWorks C# Add-in real-machine validation

This checklist is for QC or field validation on a Windows machine with SolidWorks installed. It verifies the Add-in from the user's point of view: registration, login, metadata extraction, file collection, API upload, cleanup, and security constraints.

## Machine-Readable Result Report

Before field execution, generate a fill-in report folder:

```powershell
npm.cmd run sw-addin:report:new
```

Build the Add-in on the CAD machine:

```powershell
npm.cmd run qc:sw-addin-build
```

The expected build output is:

```text
sw-addin/bin/Release/AiPdmAddin.dll
```

Register the Add-in from an elevated Administrator PowerShell session:

```powershell
.\scripts\register-sw-addin.ps1
```

To remove the registration after testing:

```powershell
.\scripts\unregister-sw-addin.ps1
```

The command creates:

```text
data/sw-addin-test-reports/<reportId>/report.json
data/sw-addin-test-reports/<reportId>/report.md
```

During field testing, fill `report.json` with:

- environment details
- each case result: `pass`, `fail`, `blocked`, `not_applicable`, or `not_run`
- evidence links or filenames
- backend submission IDs where applicable
- final sign-off fields

Validation:

```powershell
npm.cmd run qc:sw-addin-real-machine-report:report
npm.cmd run qc:sw-addin-real-machine-report
npm.cmd run qc:production-readiness:report
```

`qc:sw-addin-real-machine-report` passes only when every required case is `pass`, optional cases are `pass` or `not_applicable`, P0/P1 findings are closed or accepted, and final sign-off is filled.

## 1. Test Environment

Record these before testing:

| Item | Value |
| --- | --- |
| Tester |  |
| Test date |  |
| Windows version |  |
| SolidWorks version |  |
| .NET Framework 4.8 installed | Yes / No |
| AI PDM backend URL |  |
| Test account |  |
| Test machine type | CAD workstation / VM / Other |

Required setup:

- Backend is running and reachable from the CAD machine.
- Test account can log in through `POST /api/auth/token`.
- SolidWorks sample files are prepared: one part, one assembly, one drawing.
- `%APPDATA%\AiPdm` and `%TEMP%\AiPdm` are accessible to the Windows user.
- CAD machine does not contain Google service account keys or cloud admin credentials.

## 2. Sample File Matrix

Prepare these files before execution:

| ID | File type | Required custom properties | Expected collected files |
| --- | --- | --- | --- |
| SW-PT-001 | `.sldprt` | drawing_number, part_number, part_name, revision, material, surface_finish, document_type | Native part file only |
| SW-ASM-001 | `.sldasm` | drawing_number, part_number, part_name, revision, material, surface_finish, document_type | Native assembly file only |
| SW-DRW-001 | `.slddrw` | drawing_number, part_number, part_name, revision, material, surface_finish, document_type | Native drawing, exported PDF, exported DWG |
| SW-MISS-001 | Any supported type | Missing at least one required property | Submission is blocked before upload |

## 3. Installation And Registration

| Case ID | Steps | Expected result | Pass |
| --- | --- | --- | --- |
| SW-INST-001 | Run `npm.cmd run qc:sw-addin-build` on the CAD machine, then run `.\scripts\register-sw-addin.ps1` from Administrator PowerShell. | Build/install completes without error. |  |
| SW-INST-002 | Register the Add-in according to the deployment method used by the test build. | SolidWorks Add-ins list shows AI PDM Add-in. |  |
| SW-INST-003 | Start SolidWorks and enable the Add-in. | Add-in loads without crash. |  |
| SW-INST-004 | Confirm command button is visible in SolidWorks CommandManager. | AI PDM submit command is visible and clickable. |  |
| SW-INST-005 | Disable and re-enable the Add-in. | Add-in unloads and reloads without leaving duplicate buttons. |  |

Evidence to save:

- Screenshot of Add-ins list.
- Screenshot of CommandManager button.
- Build or registration log if available.

## 4. Authentication And Local Security

| Case ID | Steps | Expected result | Pass |
| --- | --- | --- | --- |
| SW-AUTH-001 | Click the AI PDM command while not logged in. | Login window opens. |  |
| SW-AUTH-002 | Log in with a valid Engineer account. | Login succeeds and submission window opens. |  |
| SW-AUTH-003 | Close SolidWorks, reopen it, and click the command again. | Token is reused; login is not required unless token is invalid. |  |
| SW-AUTH-004 | Inspect `%APPDATA%\AiPdm\token.dat`. | Token file exists and is not plain readable text. |  |
| SW-AUTH-005 | Log out from the Add-in UI. | Token is removed or invalidated locally; next command asks for login. |  |
| SW-AUTH-006 | Log in with invalid credentials. | Login fails with a clear error and no token is stored. |  |
| SW-AUTH-007 | Search the CAD workstation for Google service account JSON keys used by PDM. | No Google service account key is present on the CAD machine. |  |

Evidence to save:

- Login success screenshot.
- Logout behavior screenshot.
- Redacted screenshot of `%APPDATA%\AiPdm`.

## 5. Metadata Extraction And Validation

| Case ID | Steps | Expected result | Pass |
| --- | --- | --- | --- |
| SW-META-001 | Open `SW-PT-001` and click submit. | Submission window shows all extracted properties correctly. |  |
| SW-META-002 | Open `SW-ASM-001` and click submit. | Submission window shows all extracted properties correctly. |  |
| SW-META-003 | Open `SW-DRW-001` and click submit. | Submission window shows all extracted properties correctly. |  |
| SW-META-004 | Open `SW-MISS-001` and click submit. | Add-in blocks submission and lists missing properties. |  |
| SW-META-005 | Use an unsaved SolidWorks document and click submit. | Add-in blocks submission and asks user to save the file first. |  |
| SW-META-006 | Leave `document_type` blank but keep other required properties valid. | Add-in auto-fills document type from SolidWorks document type. |  |

Required properties:

- `drawing_number`
- `part_number`
- `part_name`
- `revision`
- `material`
- `surface_finish`
- `document_type`

## 6. File Collection And Export

| Case ID | Steps | Expected result | Pass |
| --- | --- | --- | --- |
| SW-FILE-001 | Submit `SW-PT-001`. | Upload includes one native `.sldprt` file. |  |
| SW-FILE-002 | Submit `SW-ASM-001`. | Upload includes one native `.sldasm` file. |  |
| SW-FILE-003 | Submit `SW-DRW-001`. | Upload includes native `.slddrw`, exported `.pdf`, and exported `.dwg`. |  |
| SW-FILE-004 | After successful drawing submission, inspect `%TEMP%\AiPdm`. | Temporary exported PDF/DWG files are removed. |  |
| SW-FILE-005 | Force upload failure after drawing export, then inspect `%TEMP%\AiPdm`. | Temporary exported PDF/DWG files are still removed. |  |
| SW-FILE-006 | Submit a file exceeding configured upload limit. | Submission is blocked or fails with a clear file-size error. |  |
| SW-FILE-007 | Submit an unsupported file type if the UI can reach that state. | Backend rejects it and Add-in shows a clear error. |  |

Evidence to save:

- Submission window file list screenshot.
- `%TEMP%\AiPdm` before/after screenshot for drawing tests.
- Backend submission detail showing uploaded file roles.

## 7. Submission Workflow

| Case ID | Steps | Expected result | Pass |
| --- | --- | --- | --- |
| SW-SUB-001 | Submit a valid part with a meaningful change description. | Backend returns success and status `Pending`. |  |
| SW-SUB-002 | Submit a valid drawing with approval_required = 1. | Backend creates submission and approval steps correctly. |  |
| SW-SUB-003 | Submit a valid drawing with approval_required = 2. | Backend creates two-reviewer workflow correctly. |  |
| SW-SUB-004 | Enter fewer than 5 characters in change description. | Submit button is disabled. |  |
| SW-SUB-005 | Enter more than 100 characters in change description. | Submit button is disabled. |  |
| SW-SUB-006 | Enter only numbers or symbols in change description. | Submit button is disabled. |  |
| SW-SUB-007 | Submit duplicate drawing_number + revision. | Backend rejects with duplicate error; no orphan file remains. |  |
| SW-SUB-008 | After successful submission, open Web dashboard. | New submission appears in `Pending`. |  |
| SW-SUB-009 | Open Web submission detail. | SHA256, file size, local path or Google Drive file ID are recorded. |  |

## 8. Failure And Recovery

| Case ID | Steps | Expected result | Pass |
| --- | --- | --- | --- |
| SW-FAIL-001 | Set backend URL to an unreachable host and submit. | Add-in shows network error and does not crash. |  |
| SW-FAIL-002 | Stop backend during upload and submit. | Add-in shows upload failure and cleans temporary files. |  |
| SW-FAIL-003 | Use an expired or deleted token and submit. | Backend returns unauthorized; Add-in asks user to log in again or shows auth error. |  |
| SW-FAIL-004 | Make `%TEMP%\AiPdm` unavailable if possible and submit drawing. | Add-in reports export or temp-folder error without crashing. |  |
| SW-FAIL-005 | Submit while backend rejects file by policy. | Error is shown to user and no local high-privilege credential is created. |  |

## 9. Logs And Evidence

| Case ID | Steps | Expected result | Pass |
| --- | --- | --- | --- |
| SW-LOG-001 | Perform a successful submission. | `%APPDATA%\AiPdm\logs` contains an entry for collection/upload success. |  |
| SW-LOG-002 | Perform a failed submission. | Log contains failure reason without exposing password or token. |  |
| SW-LOG-003 | Check log retention behavior if old logs are available. | Logs older than configured retention are not kept indefinitely. |  |

Attach these artifacts to the QC result:

- Screenshots for every failed case.
- Add-in log files with credentials redacted.
- Backend request IDs or submission IDs.
- Web dashboard screenshots for created submissions.

## 10. Pass Criteria

The Add-in can be treated as real-machine validated only when:

- All P0 security cases pass.
- Valid part, assembly, and drawing submissions all reach backend `Pending`.
- Drawing export produces PDF and DWG and always cleans temporary files.
- Missing metadata and invalid change descriptions are blocked before upload.
- Network, auth, and backend failures do not crash SolidWorks.
- No Google service account key or cloud high-privilege credential exists on the CAD workstation.

## 11. Open Items After Manual QC

Use this section during execution:

| Finding ID | Severity | Description | Owner | Status |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 12. Machine-Readable Defect Tracking

If real-machine testing finds any P0/P1 defect, record it in:

```text
data/quality/defect-register.json
```

Production readiness requires:

```powershell
npm.cmd run qc:defects-zero
```

to report `ready: true` and `activeP0P1: 0`.
