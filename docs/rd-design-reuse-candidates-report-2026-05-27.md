# RD Report - Design Reuse Candidates

Date: 2026-05-27

## Scope

Implemented the P1 design reuse candidate hint feature using metadata and filename similarity. This phase does not perform geometry comparison.

## Implementation

- Added `DesignReuseCandidate` data type with score, match reasons, and matched files.
- Added `listDesignReuseCandidates` to score visible submissions by part number family, part name tokens, material, surface finish, document type, and filename overlap.
- Added `GET /api/submissions/[id]/reuse-candidates`.
- Enforced existing read scope: Engineer sees own submissions only; Manager can see cross-owner candidates.
- Added Dashboard detail panel for `Design reuse candidates`, including score, reasons, matched files, and click-to-open candidate behavior.
- Added API regression coverage `REUSE-001` through `REUSE-010`.

## Validation

QC passed on 2026-05-27:

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api` with `226 passed / 0 failed`
- `npm.cmd run qc:ui` with `26 passed / 0 failed`
- `npm.cmd run qc:file-hashes` with `1355 checked / 1355 ok`

See `docs/qc-design-reuse-candidates-validation-report-2026-05-27.md`.
