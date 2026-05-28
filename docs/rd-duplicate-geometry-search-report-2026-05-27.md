# RD Report - P2 Duplicate Geometry Search

Date: 2026-05-27

## Scope

Implemented a low-cost duplicate geometry search before SolidWorks Document Manager or true geometric comparison is available.

## Changes

- Added `/api/submissions/[id]/duplicate-geometry`.
- Added duplicate candidate scoring based on native CAD file hash, filename stem/token overlap, same-role file size proximity, material/surface/document metadata, and part-number token overlap.
- Added Engineer scope control so Engineers only see own readable candidates while Managers/Admins can review cross-owner duplicates.
- Added dashboard panel to show duplicate level, fingerprint score, signals, and matched files.
- Added API regression coverage `GEODUP-001` through `GEODUP-010`.

## Constraints

- This is a file-fingerprint and metadata-assisted duplicate search.
- It does not claim full geometric shape comparison.
- True CAD geometry comparison remains dependent on future CAD extraction or licensed SolidWorks Document Manager integration.

## Validation

See `docs/qa-duplicate-geometry-search-validation-plan-2026-05-27.md` and `docs/qc-duplicate-geometry-search-validation-report-2026-05-27.md`.
