# QA Validation Plan - PDM Numbering Admin Matrix UI

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Scope: admin approval matrix settings UI, editable approval rules, hard-rule markers, and simulator.

## Validation Scope

- Verify Admin can read numbering approval matrix data from `/api/numbering/admin/matrix`.
- Verify Admin can create or update configurable approval rules.
- Verify updates are written through the repository and audit log.
- Verify `/settings` renders the approval matrix settings panel.
- Verify the panel includes matrix overview, rule editor, role selector, hard-rule markers, and rule simulator.
- Verify the panel includes built-in rule templates and rule-version history.
- Verify hard rules are shown as non-editable constraints with `!` information markers.
- Verify desktop and mobile widths avoid page-level horizontal overflow.

## User Critical Flows

- Admin opens `/settings`.
- System shows the approval matrix settings panel inside the existing settings page.
- Admin edits an approval rule, approver role, blocking behavior, warning marker, or export marker.
- Admin adds a new approval rule using built-in options or custom action/risk text.
- Admin applies one of the built-in rule templates and reviews the active rule-version record.
- Admin reviews non-editable hard limits before saving risky matrix changes.
- Admin simulates an action/risk combination before applying or reviewing rules.

## FMEA

| Failure Mode | Cause | Effect | Detection | Priority | Countermeasure |
|---|---|---|---|---|---|
| Non-admin changes approval rules | Missing route role check | Unauthorized approval-matrix mutation | Route source/QC check | High | Matrix API requires `Admin` |
| Admin can disable hard limits | Treating hard limits as ordinary configurable rows | Duplicate numbers or MA uniqueness can be bypassed | UI/source/QC check | High | Hard rules are catalogued separately and rendered non-editable |
| Approval rule change has no audit trail | Repository updates without audit event | Matrix changes cannot be traced | Source/QC check | High | Upsert writes `numbering.approval_rule.upsert` |
| Matrix page overflows on mobile | Wide table not contained | Settings page becomes hard to use | Browser QC at 390px | Medium | Tables are inside scrollable `.table-wrap` |
| Simulator uses stale or unrelated rules | UI bypasses rule simulator API | Admin cannot predict matrix behavior | Browser QC | Medium | Simulator calls `/api/numbering/rule-simulator` with current rule version |

## Test Cases

- `NUM-REPO lists admin approval matrix`.
- `NUM-REPO upserts admin approval rules`.
- `NUM-REPO applies approval rule templates`.
- `NUM-REPO audits admin approval rule changes`.
- `NUM-REPO db.ts re-exports admin matrix workflow`.
- `NUM-API admin matrix route requires admin and saves rules`.
- `NUM-UI settings page renders approval matrix controls`.
- `NUM-UI settings page includes hard-rule warning markers and simulator`.
- `NUM-UI settings page includes templates and rule version history`.
- `qc:pdm-numbering-settings-ui`: Admin login, matrix rows, hard-rule table, simulator result, warning markers, desktop/mobile overflow, console errors.

## Pass Criteria

- `npm.cmd run qc:pdm-numbering-core` returns 125/125 passed.
- `npm.cmd run qc:pdm-numbering-settings-ui` returns 22/22 passed.
- `cmd /c node_modules\.bin\tsc.cmd --noEmit` returns exit code 0.
- `npm.cmd run lint` returns exit code 0.
- `cmd /c npm run build` returns exit code 0 and includes `/api/numbering/admin/matrix`.

## Evidence Collection

- Targeted QC JSON output.
- Browser QC JSON output.
- TypeScript/lint/build exit status.
- Build route list.
- Source checks for role guard, repository upsert, audit marker, and settings UI controls.
