# RD Report: Google Drive Integration Test

Date: 2026-05-22
Scope: P1 Google Drive integration test

## Changes

- Added mockable Drive API base URLs in `src/lib/gdrive.ts`.
- Added `scripts/qc-gdrive-integration-test.mjs`.
- Added npm script `qc:gdrive`.
- Updated `PDM_dev_task.md` to mark `P1 建立 Google Drive integration test` complete.

## Coverage

The new integration test starts a local mock Google Drive API and a Next.js dev server configured to use it. It verifies:

- background upload calls the Drive multipart upload endpoint
- DB stores `gdrive_file_id`
- file status changes to `uploaded`
- approval uses the local-gdrive release path
- Drive move endpoint is called with the Released folder
- anti-forgery `appProperties` are written
- file status changes to `moved`
- all Drive calls carry the configured bearer token

## Notes

This validates backend-to-Drive integration behavior without requiring real Google credentials. Production behavior is unchanged unless mock environment variables are explicitly set.
