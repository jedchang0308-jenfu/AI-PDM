# RD Report: Cloud Function Mock Failure Test

Date: 2026-05-22
Scope: P1 Cloud Function mock failure test

## Changes

- Added `scripts/qc-release-failure-test.mjs`.
- Added npm script `qc:release-failure`.
- Updated `PDM_dev_task.md` to mark `P1 建立 Cloud Function mock failure test` complete.

## Coverage

The new test starts a local mock release function that always returns HTTP 503, then starts the Next.js app with `RELEASE_FUNCTION_URL` pointed at that mock. It verifies:

- approval returns HTTP 500 when the release function fails
- API response reports `ReleaseFailed`
- database status becomes `ReleaseFailed`
- `release_error` stores the mock error
- audit log records `ReleaseFailed`
- release request sends the configured bearer token
- release payload includes the submission id

## Notes

This is a local deterministic failure-path test. It does not require real Google Cloud or Google Drive credentials.

## Follow-up Fix During Regression

While running the full regression after this change, the catch-all file route proved unstable under Next.js dev routing. The file API was restored to explicit routes:

- download: `/api/submissions/{id}/files/{fileId}`
- preview: `/api/submissions/{id}/files/preview/{fileId}`
