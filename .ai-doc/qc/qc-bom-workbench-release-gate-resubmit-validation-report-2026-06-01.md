# QC Fact Report: BOM Workbench Release Gate And Resubmit

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:bom-workbench-release-gate-resubmit` with `PDM_BASE_URL=http://127.0.0.1:3119`
- `npm.cmd run qc:bom-workbench-review-release` with `PDM_BASE_URL=http://127.0.0.1:3119`
- `npm.cmd run lint`
- `cmd /c npm.cmd run build`
- `git diff --check`
- `netstat -ano | findstr :3119`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0 |
| Release gate / resubmit QC | Pass | 43/43 passed |
| Existing review/release regression | Pass | 25/25 passed |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; BOM review routes included in route manifest |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3119 has no `LISTENING`; only `TIME_WAIT` rows remained |

## Evidence Highlights

- Missing child item approval returned HTTP 409 with `BOM_RELEASE_GATE_BLOCKED` and issue code `missing_child_item`.
- Pending child approval returned HTTP 409 with issue code `child_not_released` and `child_status: Pending`.
- Rejected child approval returned HTTP 409 with issue code `child_not_released` and `child_status: Rejected`.
- Obsolete child approval returned HTTP 409 with issue code `child_not_released` and `child_status: Obsolete`.
- Outdated released child approval returned HTTP 409 with `child_outdated_revision` and `latest_released_revision: B`.
- A second BOM draft for the same parent item/revision could be created, but submitting it while another draft was `PendingReview` returned HTTP 400 with `BOM_PENDING_REVIEW_EXISTS`.
- Manager rejection changed the draft to `Rejected`.
- The same `Rejected` draft was saved in place, resubmitted, and then approved successfully.
- Resubmitted draft had `review_attempt = 2`.
- Review history retained two rows for the draft: first `Rejected`, second `PendingReview` before final approval.
- Existing `qc:bom-workbench-review-release` still passed 25/25 after the new guard and issue-detail changes.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this BOM work and remain non-fatal.
- Stopping the dev server with `Stop-Process` produced Turbopack persistence/cache warnings after shutdown; port cleanup succeeded and no product check failed.

## Cleanup Notes

- The QC scripts clean temporary BOM workbench drafts, review requests, snapshots, tree lines, edit events, legacy BOM rows, file references, and submission files.
- The scripts intentionally preserve audited submissions and audit logs because audit logs are append-only.
