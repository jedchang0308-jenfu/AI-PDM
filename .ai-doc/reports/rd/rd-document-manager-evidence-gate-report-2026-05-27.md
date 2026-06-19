# RD Report - Document Manager Evidence Gate

## Scope

- Remaining dev task support:
  - `P0` 確認 SolidWorks Document Manager 授權與可部署方式。
  - `P0` SolidWorks Document Manager API 或等效授權元件。
  - `P0` 整合 SolidWorks Document Manager API 或等效讀取元件。

## Implemented

- Added Document Manager evidence report tooling:
  - `npm run document-manager:report:new`
  - `npm run document-manager:report:fill`
  - `npm run qc:document-manager-report`
  - `npm run qc:document-manager-report:report`
- Added `scripts/document-manager-report-utils.mjs`.
- Added evidence cases for:
  - license/component ownership
  - deployment command configuration
  - `.sldprt`, `.sldasm`, `.slddrw` native metadata extraction
  - assembly and drawing reference extraction
  - Web upload native source traceability
  - fallback, temp-file cleanup, and security behavior
- Reports are stored under `data/document-manager-reports/<reportId>/`.
- `qc:document-manager-report` fails until a real completed report exists.
- `qc:document-manager-report:report` allows open state for readiness tracking.

## Completion Boundary

- This round does not mark the remaining Document Manager P0 items complete.
- The P0 items still require real evidence from a licensed SolidWorks Document Manager API or approved equivalent extractor.
