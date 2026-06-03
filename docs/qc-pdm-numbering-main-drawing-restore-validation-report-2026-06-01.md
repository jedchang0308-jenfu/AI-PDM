# QC Validation Report - PDM Numbering Main Drawing Restore

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Result: PASS

## Executed Items

| Item | Command / Evidence | Actual Result | Verdict |
|---|---|---|---|
| Targeted numbering regression | `npm.cmd run qc:pdm-numbering-core` | 68 total, 68 passed, 0 failed | PASS |
| TypeScript compile | `cmd /c node_modules\.bin\tsc.cmd --noEmit` | Exit code 0 | PASS |
| Lint | `npm.cmd run lint` | Exit code 0 | PASS |
| Production build | `cmd /c npm run build` | Exit code 0 | PASS |
| API route registration | Build route list | `/api/numbering/approval-requests` and `/api/numbering/approval-decisions` present | PASS |

## Evidence Summary

- Restore requests use `main_drawing_restore`.
- Restore request validates that the part number is currently `MainDrawingInvalid`.
- Replacement drawing validation requires same root, MA purpose, and non-obsolete status.
- Approved restore can reassign the primary manufacturing drawing and set the part number back to `Active`.
- Root status is restored only when no other part numbers under the root remain `MainDrawingInvalid`.
- Restore operation writes `numbering.main_drawing.restore` audit evidence.

## Observations

- Build still reports unrelated Turbopack broad file tracing warnings from existing chat/config paths.

## Open Risks

- Coverage is currently schema/source/compile/build-level; authenticated HTTP E2E for approval forms is still pending with the approval matrix UI work.
