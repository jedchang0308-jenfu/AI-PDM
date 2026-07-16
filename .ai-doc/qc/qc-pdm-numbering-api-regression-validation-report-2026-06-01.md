# QC Fact Report: PDM Numbering API Regression

## Verdict

Pass.

## Executed Items

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run lint`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-api-regression` with `PDM_BASE_URL=http://127.0.0.1:3112`
- `cmd /c npm run build`

## Actual Results

| Check | Result | Evidence |
|---|---:|---|
| TypeScript | Pass | exit code 0 |
| Lint | Pass | exit code 0 |
| Core numbering QC | Pass | 212/212 passed |
| API regression QC | Pass | 26/26 passed |
| Build | Pass | exit code 0; numbering API routes generated |
| Dev server cleanup | Pass | port 3112 no longer has `LISTENING`; only `TIME_WAIT` sockets remain |

## Evidence Highlights

- `POST /api/numbering/records` returned HTTP 201 with root, part number, and MA drawing.
- `POST /api/numbering/duplicate-check` returned HTTP 200 and blocked exact reused root / part / drawing codes.
- `POST /api/numbering/variants` returned HTTP 201 and linked a second part number to the same MA drawing with variant fields.
- `GET /api/numbering/search` returned the allocated root.
- `GET /api/numbering/roots/{rootCode}` returned two linked parts, two variant fields, and audit trail entries containing `before`, `after`, and `diff`.
- `POST /api/numbering/impact-analysis` with `applyInvalidation = true` returned impacted linked part numbers.
- `POST /api/numbering/import-batches` staged a valid row; confirm promoted it and reported `createdRoots = 1`, `createdParts = 1`, `createdDrawings = 1`.
- `GET /api/numbering/admin/matrix` returned roles, approval rules, templates, and hard rules.
- `POST` and `GET /api/numbering/monthly-audit-reports` generated and listed report metadata.

## Issues And Blockers

- No blocker in this validation round.
- Build still reports existing Turbopack broad-tracing warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`; they are unrelated to this API regression work and remain non-fatal.

## Cleanup Notes

- The API regression script deletes temporary test roots, import batches, and monthly reports.
- It intentionally does not delete audit logs, preserving append-only audit behavior.
