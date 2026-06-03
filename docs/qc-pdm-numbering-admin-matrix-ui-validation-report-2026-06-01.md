# QC Validation Report - PDM Numbering Admin Matrix UI

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Result: PASS

## Executed Items

| Item | Command / Evidence | Actual Result | Verdict |
|---|---|---|---|
| Targeted numbering regression | `npm.cmd run qc:pdm-numbering-core` | 125 total, 125 passed, 0 failed | PASS |
| Browser settings UI QC | `npm.cmd run qc:pdm-numbering-settings-ui` | 22 total, 22 passed, 0 failed | PASS |
| TypeScript compile | `cmd /c node_modules\.bin\tsc.cmd --noEmit` | Exit code 0 | PASS |
| Lint | `npm.cmd run lint` | Exit code 0 | PASS |
| Production build | `cmd /c npm run build` | Exit code 0 | PASS |
| API route registration | Build route list | `/api/numbering/admin/matrix` present | PASS |

## Evidence Summary

- Admin matrix API reads roles, permissions, approval rules, hard-rule catalog, and UI options.
- Admin matrix API can upsert configurable approval rules and writes `numbering.approval_rule.upsert` audit events.
- Admin matrix API can apply built-in rule templates and writes template-application audit events.
- `/settings` renders approval matrix table, editable rules, role dropdowns, built-in templates, rule-version history, hard-rule `!` markers, role summary, and rule simulator.
- Browser QC verified both 1440px and 390px viewports.
- Browser QC confirmed simulator returns a result containing `requiredRoles`.
- Browser QC confirmed no page-level horizontal overflow and no console errors at tested viewports.

## Observations

- Build still reports unrelated Turbopack broad file tracing warnings from existing chat/config paths.

## Open Risks

- Dedicated role/permission and delegation UI remains a separate open task.
