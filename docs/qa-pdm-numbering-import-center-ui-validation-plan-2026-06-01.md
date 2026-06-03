# QA Validation Plan - PDM Numbering Import Center UI

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: legacy numbering master import UI, staging check report, conflict/need-info visibility, and Admin confirmation.

## Validation Scope

- Verify `/numbering/imports` renders for permitted users.
- Verify users can paste JSON array or CSV/TSV with headers and create a staging import batch.
- Verify staging report shows summary counts for total, valid, need-info, and conflict rows.
- Verify row-level issue codes/messages are visible before Admin confirmation.
- Verify conflicts and need-info rows do not become formal master data.
- Verify Admin confirmation applies only valid rows and changes the batch status to confirmed.
- Verify users can download the staging check report JSON.
- Verify recent import batches can be listed and selected.
- Verify sidebar links to the import center.
- Verify desktop and mobile layouts have no page-level horizontal overflow.

## User Critical Flows

- Engineer or Admin opens import center from sidebar.
- User pastes a legacy master-table excerpt and creates a staging check report.
- User reviews valid, conflict, and need-info rows before any formal write.
- Admin confirms the batch; valid rows become formal numbering data and confirmed rows are retained as legacy-kept evidence.
- User downloads the check report JSON for audit trail.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Import writes formal data before review | UI calls confirm directly or backend skips staging | Dirty legacy data pollutes master table | UI/API QC | High | UI only POSTs staging first; confirm is separate Admin action |
| Conflicts are hard to see | Row table hides issue codes/messages | Admin may confirm bad rows | Browser QC | High | Staging rows show status badges and issue messages |
| Invalid rows become formal data | Confirm applies all rows, not only valid rows | Missing names/duplicate numbers enter master | Repository/API QC | High | Confirm query only selects `check_status = 'valid'` |
| Report cannot be exported | UI lacks download action | Audit evidence cannot be archived | Browser download QC | Medium | UI downloads selected batch JSON |
| Mobile page overflows | Wide tables escape viewport | Mobile review becomes unusable | Browser overflow QC | Medium | Tables use `.table-wrap`; page-level overflow must stay <= 2px |

## Test Cases

- `NUM-REPO lists numbering import batches`.
- `NUM-API import batch route creates and lists staging batches`.
- `NUM-UI numbering import center renders staging workflow`.
- `NUM-UI numbering import center shows conflicts and report download`.
- `NUM-UI sidebar links numbering import center`.
- Browser UI QC: desktop and mobile import center render.
- Browser UI QC: staging batch creation returns HTTP 201.
- Browser UI QC: conflict and need-info rows render.
- Browser UI QC: staging report JSON download is created.
- Browser UI QC: Admin confirmation applies valid rows and renders confirmed status.
- Browser UI QC: no console errors and no page-level horizontal overflow.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 141/141 passed.
- `npm.cmd run qc:pdm-numbering-import-center-ui` returns 22/22 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0 after cleaning `.next`.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and route list includes `/numbering/imports`.

## Evidence Collection

- Targeted QC JSON output.
- Browser download filename evidence.
- TypeScript/lint/build exit status.
- Build route list.
- Source checks for import list API, import center page, sidebar entry, and UI download behavior.
