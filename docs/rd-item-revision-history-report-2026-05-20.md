# RD Report - Item Revision History

Date: 2026-05-20

## Scope

Implemented local MVP item revision history lookup.

## Changes

- Added `GET /api/items/{partNumber}/revisions`.
- Added DB query for revision history by `part_number`.
- Applied existing Engineer data scope to revision history results.
- Added revision history display to the Dashboard submission detail panel.
- Added QC regression for unauthenticated access, Manager full history visibility, and Engineer scoped visibility.

## Verification

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run smoke`
- `npm.cmd run qc:api` -> 62 passed / 0 failed
- `npm.cmd audit --audit-level=moderate` -> 0 vulnerabilities

## Notes

- Existing build warnings remain unchanged: Turbopack NFT trace warning and Node `node:sqlite` experimental warning.
