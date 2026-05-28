# RD Report: Google Drive PDF Viewer Embed

Date: 2026-05-22
Scope: P1 Google Drive PDF viewer embed

## Changes

- Added a Google Drive PDF preview link for PDF files that have `gdrive_file_id`.
- Added an embedded Google Drive PDF iframe in the submission detail file section.
- Kept the existing local backend PDF preview and download links as fallback actions.
- Updated UI e2e seed data to mark the test PDF as uploaded to mock Google Drive.
- Added UI e2e checks for the Drive preview link and iframe source.
- Updated `PDM_dev_task.md` to mark `P1 Google Drive PDF viewer embed` complete.

## Behavior

For PDF files with a Drive file ID, the dashboard now renders:

- Local `Preview`
- Google `Drive Preview`
- `Download`
- Inline Google Drive iframe preview

Files without a Drive file ID keep the existing local preview/download behavior.

## Validation

- `node --check scripts/ui-e2e-test.mjs`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:full`

Result: all passed. `qc:full` completed with 9 passed / 0 failed. UI e2e now reports 26 passed / 0 failed, including Drive preview link and iframe checks.
