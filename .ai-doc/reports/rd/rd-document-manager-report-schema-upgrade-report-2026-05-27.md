# RD Report - Document Manager Report Schema Upgrade

## Scope

- Supports remaining `P0` Document Manager / equivalent component evidence tasks.
- Fixes the local evidence gate so older draft reports can be upgraded when required cases change.

## Changes

- Added versioned `DOCUMENT_MANAGER_SCHEMA_VERSION`; latest schema is now version 3 after the probe path gate.
- Added report normalization in `scripts/document-manager-report-utils.mjs`.
- Added `document-manager:report:upgrade`.
- Unified JSON and Markdown report output through shared report utilities.
- Existing draft report was upgraded:
  - `data/document-manager-reports/20260527-145712/report.json`
  - `data/document-manager-reports/20260527-145712/report.md`

## Result

- Existing report now includes:
  - `schemaVersion: 3`
  - `referenceExtractorCommand`
  - `referenceExtractorArgs`
  - `DM-DEP-004`
  - `extractorProbePath`
- The report remains `ready: false` until real licensed/equivalent deployment evidence is filled and signed off.

## Limits

- This does not complete the SolidWorks Document Manager / equivalent component P0.
- This only keeps the evidence template current and prevents stale reports from hiding required cases.
