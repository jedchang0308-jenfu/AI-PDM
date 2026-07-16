# QC Report - Where-used Validation

Date: 2026-05-26

## Scope

QC validation for Where-used API/UI based on `.ai-doc/qa/qa-where-used-validation-plan-2026-05-26.md`.

## Result

Passed after RD fix.

## Initial QC Finding

The first API QC run failed `BOMDIFF-002` through `BOMDIFF-009`.

Observed cause:

- Default previous BOM lookup used timestamp plus id ordering.
- Fast-created test submissions could share the same timestamp window.
- This made the previous revision lookup unstable.

RD fix:

- Updated previous BOM lookup to use SQLite insertion order as the tiebreaker.

## Final Evidence

Commands executed after the fix:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run qc:api
npm.cmd run qc:ui
npm.cmd run qc:file-hashes
```

Observed final results:

- Lint: passed.
- Build: passed.
- API regression: 156 passed, 0 failed.
- UI E2E: 26 passed, 0 failed.
- File hash verification: 1207 checked, 1207 ok, 0 missing, 0 unreadable, 0 size mismatch, 0 hash mismatch.

## Where-used Coverage

API regression included and passed:

- `WHEREUSED-001` unauthenticated where-used returns 401.
- `WHEREUSED-002` Engineer where-used returns 200.
- `WHEREUSED-003` Engineer where-used finds one parent.
- `WHEREUSED-004` where-used parent is target BOM submission.
- `WHEREUSED-005` where-used preserves quantity.
- `WHEREUSED-006` Manager where-used returns 200.
- `WHEREUSED-007` Manager where-used sees parent.
- `WHEREUSED-008` other Engineer where-used returns 200.
- `WHEREUSED-009` other Engineer where-used is scoped empty.
- `WHEREUSED-010` unused part where-used returns 200.
- `WHEREUSED-011` unused part where-used is empty.

## QC Notes

- Local Next.js dev server was started for API/UI validation and stopped after the run.
- Final regression also revalidated BOM schema, BOM auto-draft, and BOM diff coverage.
