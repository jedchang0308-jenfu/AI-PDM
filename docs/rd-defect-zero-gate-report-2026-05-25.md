# RD Report: P0/P1 Defect Zero Gate

Date: 2026-05-25

## Scope

Built a machine-readable defect register and QC gate so production readiness can track whether all P0/P1 defects are cleared.

## Added

- `data/quality/defect-register.json`
- `scripts/defect-register-utils.mjs`
- `scripts/qc-defects-zero.mjs`
- `npm.cmd run qc:defects-zero`
- `npm.cmd run qc:defects-zero:report`

## Gate Rules

- The defect register must exist and be valid JSON.
- Every defect must include `id`, `title`, `priority`, `status`, `owner`, and `evidence`.
- Valid priorities: `P0`, `P1`, `P2`, `P3`.
- Valid statuses: `open`, `in_progress`, `reopened`, `deferred`, `closed`, `verified`.
- Any P0/P1 defect not in `closed` or `verified` blocks readiness.

## Readiness Integration

`qc:production-readiness` now includes:

- `defectsZeroReady`
- `activeP0P1Defects`
- release readiness blocker evidence when defect zero is not ready

## Current Result

The initial register contains zero active defects. `qc:defects-zero` is expected to pass until QC records a new active P0/P1 defect.
