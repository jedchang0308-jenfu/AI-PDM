# QC Fact Report: PDM Numbering Concurrency And Reserved Code Reuse

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-concurrency-reuse` with `PDM_BASE_URL=http://127.0.0.1:3113`
- `npm.cmd run lint`
- `cmd /c npm run build`
- `git diff --check`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0 |
| Core numbering QC | Pass | 221/221 passed |
| Concurrency/reuse QC | Pass | 32/32 passed |
| Lint | Pass | exit code 0 |
| Build | Pass | exit code 0; numbering routes generated |
| Diff whitespace | Pass | exit code 0; CRLF warnings only |
| Dev server cleanup | Pass | port 3113 no longer has `LISTENING` |

## Evidence Highlights

- 12 concurrent `POST /api/numbering/records` requests all returned `201`.
- Returned root codes were unique: `0011`, `0015`, `0018`, `0017`, `0020`, `0021`, `0012`, `0010`, `0019`, `0016`, `0014`, `0013`.
- Returned part numbers and MA drawing numbers were unique and matched expected formats.
- Duplicate-check returned blockers for exact root/part/drawing codes allocated by the concurrent run.
- Pending approval kept request status `pending`; duplicate root, part, and drawing insertions failed with SQLite `UNIQUE` constraints, and duplicate-check returned blockers.
- Rejected approval kept request status `rejected`; duplicate root, part, and drawing insertions failed with SQLite `UNIQUE` constraints, and duplicate-check returned blockers.
- Obsolete root/part/drawing records stayed blocked from reuse through both SQLite uniqueness and duplicate-check blockers.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this concurrency/reuse work and remain non-fatal.

## Cleanup Notes

- The concurrency/reuse script deletes temporary roots, parts, drawings, warnings, tasks, notifications, approval requests, and duplicate-check rows created for this run.
- It intentionally does not delete audit logs, preserving append-only audit behavior.
