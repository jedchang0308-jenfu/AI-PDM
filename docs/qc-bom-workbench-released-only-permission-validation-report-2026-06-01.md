# QC Fact Report - BOM Workbench Released-only Permission

Date: 2026-06-01
Task: DEV-BOM-WORKBENCH-001
Validation plan: `docs/qa-bom-workbench-released-only-permission-validation-plan-2026-06-01.md`

## Validation Conclusion

Pass.

Manufacturing and Procurement roles can log in and export Released BOM Snapshot CSV, but receive HTTP 403 when attempting to read or mutate BOM Draft API routes. Existing BOM review/release and Released Snapshot export regressions still pass.

## Executed Items

| Item | Command / Evidence | Result |
|---|---|---|
| TypeScript | `cmd /c node_modules\.bin\tsc.cmd --noEmit` | Pass |
| Released-only role QC | `npm.cmd run qc:bom-workbench-released-only-permission` with `PDM_BASE_URL=http://127.0.0.1:3121` | Pass, 31/31 |
| BOM review/release regression | `npm.cmd run qc:bom-workbench-review-release` with `PDM_BASE_URL=http://127.0.0.1:3121` | Pass, 25/25 |
| BOM release export regression | `npm.cmd run qc:bom-workbench-release-export` with `PDM_BASE_URL=http://127.0.0.1:3121` | Pass, 21/21 |
| Lint | `npm.cmd run lint` | Pass |
| Build | `cmd /c npm.cmd run build` | Pass |
| Whitespace | `git diff --check` | Pass; CRLF warnings only |
| Dev server cleanup | `netstat -ano | Select-String ':3121'` after stop | No listening process |

## Actual Results

- `Manufacturing` and `Procurement` demo users logged in through `/api/auth/login`.
- R&D Manager created a BOM Draft and read workbench/draft detail successfully.
- Engineer submitted the BOM Draft review.
- R&D Manager approved the review and created a Released Snapshot.
- Manufacturing received HTTP 403 for:
  - pending submission detail
  - BOM workbench summary
  - BOM draft detail
  - BOM draft patch
  - set active draft
  - submit draft review
  - create draft from assembly
- Procurement received HTTP 403 for the same Draft and pending-submission routes.
- Manufacturing and Procurement both exported Released BOM CSV with HTTP 200.
- Export filename matched `BOM_{part_number}_Rev{revision}_{YYYYMMDD}.csv`.
- CSV output contained the released parent and child part numbers.

## Evidence

`qc:bom-workbench-released-only-permission` output:

```json
{
  "total": 31,
  "passed": 31,
  "failed": 0
}
```

Regression outputs:

```json
{
  "qc:bom-workbench-review-release": { "total": 25, "passed": 25, "failed": 0 },
  "qc:bom-workbench-release-export": { "total": 21, "passed": 21, "failed": 0 }
}
```

Build notes:

- `next build` passed.
- Turbopack emitted existing broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; these warnings pre-existed this slice and did not fail the build.

## Problems / Blockers

- No functional blocker found in this slice.
- Stopping the dev server after QC emitted Turbopack cache persistence/compaction warnings, but port 3121 was verified closed afterward.
