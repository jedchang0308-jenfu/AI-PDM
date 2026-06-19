# RD Report - Upload Validation

Date: 2026-05-18

## Scope

Implemented upload file validation for submission creation.

## Changes

- Added `PDM_MAX_UPLOAD_FILE_BYTES` config with a 50 MB default.
- Added upload file validation before files are written to the local repository.
- Restricted upload extensions to `sldprt`, `sldasm`, `slddrw`, `pdf`, and `dwg`.
- Rewrote submission input validation messages in ASCII to avoid encoding-related maintenance risk.
- Added QC regression cases for unsupported file type and oversized file rejection.

## Verification

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run smoke`
- `npm.cmd run qc:api` -> 48 passed / 0 failed

## Notes

- Existing build warnings remain unchanged: Turbopack NFT trace warning and Node `node:sqlite` experimental warning.
