# RD Report - Document Manager Probe Path Gate

## Scope

- Strengthens the remaining Document Manager / equivalent extractor P0 evidence gate.
- Requires a completed evidence report to reference a machine-readable extractor probe result.

## Changes

- Updated Document Manager report schema to version 3.
- Added `environment.extractorProbePath`.
- Updated report validation:
  - Missing `extractorProbePath` blocks readiness.
  - Missing probe file blocks readiness.
  - Probe JSON with `ready !== true` blocks readiness.
- Updated field-test handoff fill template with `--extractor-probe-path`.
- Added `qc:document-manager-probe-path-gate`.

## Limits

- This still does not complete the external P0.
- It prevents formal completion unless real extractor probe evidence is attached.
