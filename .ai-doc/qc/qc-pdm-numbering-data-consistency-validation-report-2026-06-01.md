# QC Fact Report: PDM Numbering Data Consistency

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run lint`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-data-consistency` with `PDM_BASE_URL=http://127.0.0.1:3112`
- `cmd /c npm run build`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0 |
| Lint | Pass | exit code 0 |
| Core numbering QC | Pass | 213/213 passed |
| Data consistency QC | Pass | 16/16 passed |
| Build | Pass | exit code 0; numbering routes generated |
| Dev server cleanup | Pass | port 3112 no longer has `LISTENING`; only `TIME_WAIT` sockets remain |

## Evidence Highlights

- Duplicate drawing number was rejected after MA drawing invalidation with `UNIQUE constraint failed: drawing_numbers.drawing_number`.
- Main drawing restore kept traceable links: old MA drawing became `reference`, replacement MA drawing became `primary_manufacturing`.
- Missing-MA override kept request, decision, and audit trace with `dvt_missing_ma_override`.
- Override audit rows contained an `override` marker derived from the action code.
- Duplicate root code was rejected after obsolete lifecycle with `UNIQUE constraint failed: part_roots.root_code`.
- Duplicate part number was rejected after obsolete lifecycle with `UNIQUE constraint failed: part_numbers.part_number`.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this data consistency work and remain non-fatal.

## Cleanup Notes

- The data consistency script deletes temporary roots and approval request rows.
- It intentionally does not delete audit logs, preserving append-only audit behavior.
