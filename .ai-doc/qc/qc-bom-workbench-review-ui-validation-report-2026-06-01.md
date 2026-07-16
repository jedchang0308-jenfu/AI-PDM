# QC Fact Report: BOM Workbench Manager Diff Review UI

Task: `DEV-BOM-WORKBENCH-001`
Validation plan: `.ai-doc/qa/qa-bom-workbench-review-ui-validation-plan-2026-06-01.md`

## 驗證結論

Pass.

## 執行項目

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run lint`
- `npm.cmd run qc:bom-workbench-review-ui` with `PDM_BASE_URL=http://127.0.0.1:3131`
- `npm.cmd run qc:bom-workbench-review-release` with `PDM_BASE_URL=http://127.0.0.1:3131`
- `cmd /c npm.cmd run build`
- `git diff --check`
- `netstat -ano | findstr :3131`

## 實際結果

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0 |
| Lint | Pass | exit code 0 |
| Manager diff review UI QC | Pass | `qc:bom-workbench-review-ui` 32/32 passed |
| Review/release regression | Pass | `qc:bom-workbench-review-release` 25/25 passed |
| Production build | Pass | exit code 0; route manifest includes `/bom/reviews`, `/bom/workbench`, draft diff, pending review, and release export routes |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3131 has no `LISTENING` row after stopping the QC server |

## 證據

- Static checks confirmed sidebar route `/bom/reviews` is labeled `BOM 審核`.
- Static checks confirmed `/bom/reviews` calls pending review, approve/reject, and release export endpoints.
- Static checks confirmed `GET /api/bom/drafts/[draftId]/diff` and `GET /api/bom/reviews/pending` exist.
- Static checks confirmed repository diff returns `base_snapshot_id`, `summary`, `changes`, `changed_fields`, and parent path information.
- QC fixture created a baseline Released Snapshot and a second PendingReview Draft for the same parent assembly.
- Diff API returned a baseline snapshot id and summary with added lines and one changed line.
- Changed child line included `changed_fields: ["quantity", "hierarchy"]`.
- Added child line appeared in both diff API evidence and review page diff table.
- `/api/bom/reviews/pending` returned the seeded pending review with diff payload.
- Manager UI displayed previous Released BOM baseline wording, diff summary, `數量`, `階層`, and the added child part.
- Manager approved the review from `/bom/reviews`.
- After approval, XLSX and CSV export links both returned HTTP 200.
- Desktop 1440x900 and mobile 390x844 checks found no page-level horizontal overflow; desktop console had no errors.

## 問題與阻塞

- No blocker in the manager diff review validation.
- Production build warnings, when present, are existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this BOM review UI work and remain non-fatal.

## 清理

- The QC script cleans temporary BOM drafts, tree lines, review requests, snapshots, edit events, legacy BOM rows, file references, and submission files.
- Audit logs remain append-only by design.
