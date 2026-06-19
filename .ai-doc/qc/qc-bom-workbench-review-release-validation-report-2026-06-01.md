# QC Fact Report: BOM Workbench Review Release

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:bom-workbench-review-release` with `PDM_BASE_URL=http://127.0.0.1:3118`
- `npm.cmd run lint`
- `cmd /c npm run build`
- `git diff --check`
- `netstat -ano | findstr :3118`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0; build TypeScript phase also completed |
| BOM workbench review/release QC | Pass | 25/25 passed |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; submit/approve/reject routes included in route manifest |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3118 has no `LISTENING`; only `TIME_WAIT` rows remained |

## Evidence Highlights

- Engineer and manager login both returned HTTP 200.
- Fixture submissions `BOMREL-CHILD-00818527` and `BOMREL-PARENT-00818527` were created through the existing submission API.
- Child fixture was marked `Released` before release gate validation.
- Empty review reason returned HTTP 400 with `BOM_REVIEW_CHANGE_REASON_REQUIRED`.
- Engineer submitted the first draft review and received HTTP 201 with `PendingReview`.
- Engineer approval attempt returned HTTP 403.
- Manager approval returned HTTP 200; review became `Approved` and draft became `Released`.
- Second draft saved a quantity update, submitted, and approved successfully.
- Prior release snapshot count with `obsolete_at IS NOT NULL` was `1`.
- Manager rejected another pending review and draft became `Rejected`.
- Missing-child draft approval returned HTTP 409 with `BOM_RELEASE_GATE_BLOCKED` and issue code `missing_child_item`.
- Audit logs contained `BomWorkbenchReviewSubmitted`, `BomWorkbenchReviewApproved`, and `BomWorkbenchReviewRejected`.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this BOM review/release work and remain non-fatal.

## Cleanup Notes

- The QC script cleans temporary BOM workbench drafts, review requests, snapshots, tree lines, edit events, legacy BOM rows, file references, and submission files.
- The script intentionally preserves audited submissions and audit logs because audit logs are append-only.
