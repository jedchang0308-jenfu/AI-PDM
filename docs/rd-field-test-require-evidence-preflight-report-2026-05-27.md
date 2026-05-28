# RD Report - Field Test Require Evidence Preflight

## Scope

- Strengthens formal field-test closure.
- Keeps normal preflight lightweight while adding a strict evidence mode for final QC.

## Changes

- Added `--require-evidence` to `scripts/field-test-preflight.mjs`.
- Normal `field-test:preflight -- --profile all` still validates environment/tool readiness.
- Strict `field-test:preflight -- --profile all --require-evidence` additionally validates:
  - SolidWorks real-machine report readiness.
  - restore drill report readiness.
  - Document Manager / equivalent extractor report readiness.
- Field-test handoff final QC now runs:
  - `npm.cmd run field-test:preflight -- --profile all --require-evidence`

## Limits

- This does not create real field evidence.
- It prevents final QC from passing when reports are still draft or incomplete.
