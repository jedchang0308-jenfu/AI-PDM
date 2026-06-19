# RD Report - BOM Auto Draft

Date: 2026-05-26

## Scope

Connected CAD assembly references to submission creation so Engineering BOM drafts are created automatically.

## Completed

- Upload page now submits detected `cadReferences` as `cad_references_json`.
- `POST /api/submissions` parses CAD reference payloads.
- Submission creation now writes `file_references`.
- Submission creation automatically materializes a BOM draft when assembly component references exist.
- API regression coverage added:
  - `BOM-010`
  - `BOM-011`
  - `BOM-012`
  - `BOM-013`

## Design Notes

- Engineers do not get any new manual BOM fields.
- The feature reuses existing CAD reference extraction output.
- If no assembly component references exist, no BOM draft is created.
- Full Document Manager extraction remains a separate CAD integration task.

## Verification

RD verification completed:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `npm.cmd run qc:api` passed: 130 passed, 0 failed.
- `npm.cmd run qc:ui` passed: 26 passed, 0 failed.
