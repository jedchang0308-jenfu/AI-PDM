# QC Validation Report - PDM Numbering Import Center UI

Date: 2026-06-01
Task: DEV-PDM-NUMBERING-001
Result: PASS

## Executed Items

| Item | Command / Evidence | Actual Result | Verdict |
|---|---|---|---|
| TypeScript compile | `cmd /c node_modules\.bin\tsc.cmd --noEmit` | Exit code 0 after cleaning `.next` dev artifacts | PASS |
| Lint | `npm.cmd run lint` | Exit code 0; one pre-existing hook dependency warning in `src/app/numbering/tasks/page.tsx` | PASS |
| Targeted numbering regression | `npm.cmd run qc:pdm-numbering-core` | 141 total, 141 passed, 0 failed | PASS |
| Import center UI | `npm.cmd run qc:pdm-numbering-import-center-ui` with `PDM_BASE_URL=http://127.0.0.1:3104` | 22 total, 22 passed, 0 failed | PASS |
| Production build | `cmd /c npm run build` | Exit code 0; route list includes `/numbering/imports` | PASS |

## Evidence Summary

- `/api/numbering/import-batches` now supports GET list and POST staging creation.
- `/numbering/imports` renders:
  - source filename and optional hash inputs
  - CSV/TSV or JSON array paste area
  - staging creation action
  - summary metrics for total, valid, need-info, and conflict rows
  - row-level status and issue messages
  - staging report JSON download
  - Admin confirmation action
  - recent import batch table
- Sidebar includes `總表匯入` linking to `/numbering/imports`.
- Browser QC verified desktop 1440px and mobile 390px:
  - Admin login succeeds
  - staging creation returns HTTP 201
  - conflict and need-info rows render
  - staging report JSON download is created
  - Admin confirmation returns HTTP 200
  - confirmed batch status renders
  - page-level horizontal overflow is 0px
  - no browser console errors
- QC script cleans up seeded root, part, drawing, link, and import batch test data after execution.

## Observations

- Build still reports unrelated Turbopack broad file tracing warnings from existing `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`.
- Lint still reports an existing warning in `src/app/numbering/tasks/page.tsx`; no lint errors.

## Open Risks

- The first UI version supports pasted CSV/TSV/JSON instead of binary `.xlsx` parsing. The existing backend expects normalized rows; true Excel upload parsing can be added later if required.
- Conflict resolution is report-and-skip; merge/edit-in-staging is not implemented in this round.
