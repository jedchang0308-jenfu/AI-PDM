# QC Fact Report: PDM Numbering Draft Lifecycle

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-draft-lifecycle` with `PDM_BASE_URL=http://127.0.0.1:3114`
- `npm.cmd run lint`
- `cmd /c npm run build`
- `git diff --check`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0 |
| Core numbering QC | Pass | 232/232 passed |
| Draft lifecycle QC | Pass | 29/29 passed |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; new draft routes included in route manifest |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3114 no longer has `LISTENING` |

## Evidence Highlights

- Engineer login and Admin login both returned HTTP 200 with session cookies.
- Engineer call to `POST /api/numbering/drafts/overdue` returned HTTP 403, proving overdue admin confirmation is not available to RD by default.
- Engineer-created root `0025`, part `P-0025-001`, and drawing `D-0025-MA1` were all `Draft`.
- Draft creation, draft update, and draft obsolete each had approval request count `0`.
- Draft update kept root, part, and drawing in `Draft` and wrote `numbering.draft.update` audit.
- Draft obsolete changed root, part, and drawing to `Obsolete` and wrote `numbering.draft.obsolete` audit.
- Overdue scan returned `updatedRootCodes:["0026"]` and `updatedCount:1`.
- Old draft root/part/drawing moved to `PendingAdminConfirm`; fresh draft root/part/drawing remained `Draft`.
- Overdue scan created a `draft_admin_confirm` task assigned to `pdm_admin`.
- Overdue scan created a `draft_admin_confirm` notification for `pdm_admin` with `dismissible:0`.
- Overdue scan wrote `numbering.draft.pending_admin_confirm` audit.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this draft lifecycle work and remain non-fatal.

## Cleanup Notes

- The draft lifecycle script deletes temporary roots, parts, drawings, warnings, tasks, notifications, approval requests, and duplicate-check rows created for this run.
- It intentionally does not delete audit logs, preserving append-only audit behavior.
