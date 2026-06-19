# QA Validation Plan - PDM Numbering Report Center UI

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: numbering audit report center UI, export download UX, report lists, and department/project pages.

## Validation Scope

- Verify `/numbering/reports` renders for Admin / R&D Manager.
- Verify report center can list recent monthly audit reports and export jobs.
- Verify Admin can manually regenerate a monthly report for a selected month.
- Verify report UI shows company overview metrics and department/role pages.
- Verify project page shows project/department-code buckets or an empty state.
- Verify export UI supports all export modes and downloads a JSON file.
- Verify sidebar links to the report center.
- Verify mobile and desktop layouts have no page-level horizontal overflow.

## User Critical Flows

- Admin opens report center from sidebar.
- Admin regenerates the current monthly numbering report.
- Manager reviews company, RD, PDM admin, QA/document, and project pages.
- Manager exports numbering master data with selected audit scope.
- Manager downloads report/export JSON as audit evidence.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Report center cannot show historical records | API only supports create/detail | User loses audit continuity after refresh | API/static and UI QC | High | Add GET list APIs for export jobs and monthly reports |
| Department pages are empty or hard-coded | Report metadata lacks scoped buckets | Manager cannot review by responsibility area | Repository/static and UI QC | Medium | Monthly report query includes `departmentPages` and `projectBuckets` |
| Manual regeneration is available to wrong role | Route role check too broad | Audit data can be regenerated without admin control | Route/source and UI response checks | High | POST monthly report remains Admin-only |
| Export button creates no usable file | Client only creates job without download | User cannot hand off evidence | Browser download QC | High | UI downloads generated JSON immediately and from recent job rows |
| Mobile report tables break layout | Wide tables escape viewport | Mobile users cannot review report | Browser overflow QC | Medium | Tables stay in `.table-wrap`; page-level overflow must remain <= 2px |

## Test Cases

- `NUM-REPO lists numbering export jobs`.
- `NUM-REPO monthly audit metadata includes department pages`.
- `NUM-REPO lists monthly numbering audit reports`.
- `NUM-API export job route creates and lists exports`.
- `NUM-API monthly report route generates and lists metadata`.
- `NUM-UI numbering report center renders audit report workflow`.
- `NUM-UI numbering report center includes department tabs and download`.
- `NUM-UI sidebar links numbering report center`.
- Browser UI QC: desktop and mobile report center render.
- Browser UI QC: manual monthly report regeneration returns HTTP 201.
- Browser UI QC: department/project pages render.
- Browser UI QC: export JSON download is created.
- Browser UI QC: no console errors and no page-level horizontal overflow.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 136/136 passed.
- `npm.cmd run qc:pdm-numbering-report-center-ui` returns 20/20 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0 after cleaning `.next`.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and route list includes `/numbering/reports`.

## Evidence Collection

- Targeted QC JSON output.
- Browser download filename evidence.
- TypeScript/lint/build exit status.
- Build route list.
- Source checks for report list APIs, department metadata, sidebar entry, and UI download behavior.
