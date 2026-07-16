# QC Fact Report: BOM Workbench Released Snapshot Export

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:bom-workbench-release-export` with `PDM_BASE_URL=http://127.0.0.1:3120`
- `npm.cmd run lint`
- `cmd /c npm.cmd run build`
- `git diff --check`
- `netstat -ano | findstr :3120`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0 |
| Released Snapshot export QC | Pass | 21/21 passed |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; `/api/bom/releases/[releaseId]/export` included in route manifest |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3120 has no `LISTENING`; only `TIME_WAIT` rows remained |

## Evidence Highlights

- Engineer and manager login both returned HTTP 200.
- Fixture child `BOMEXPORT-CHILD-02302250` and parent `BOMEXPORT-PARENT-02302250` were created through the existing submission API.
- Child fixture was marked `Released`.
- BOM workbench draft was created from assembly references, submitted, and approved.
- Approval returned a Released Snapshot ID used by the export route.
- CSV export returned HTTP 200, `text/csv; charset=utf-8`, and filename `BOM_P-BOMEXPORT-PARENT-02302250_RevA_20260601.csv`.
- CSV contained fixed columns: `level`, `line_no`, `parent_part_number`, `child_part_number`, `child_part_name`, `child_revision`, `quantity`, `source`, `released_at`, `approved_by`.
- CSV contained released child `P-BOMEXPORT-CHILD-02302250` with quantity `3`.
- XLSX export returned HTTP 200, content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, and filename `BOM_P-BOMEXPORT-PARENT-02302250_RevA_20260601.xlsx`.
- XLSX payload had ZIP local file header `504b0304`, end of central directory `504b0506`, workbook parts, worksheet XML, and BOM values.
- Unsupported `format=xls` returned HTTP 400 with `BOM_EXPORT_FORMAT_UNSUPPORTED`.
- Missing snapshot ID returned HTTP 404.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this export work and remain non-fatal.
- Stopping the dev server with `Stop-Process` produced Turbopack persistence/cache warnings after shutdown; port cleanup succeeded and no product check failed.

## Cleanup Notes

- The QC script cleans temporary BOM workbench drafts, review requests, snapshots, tree lines, edit events, legacy BOM rows, file references, and submission files.
- The script intentionally preserves audited submissions and audit logs because audit logs are append-only.
