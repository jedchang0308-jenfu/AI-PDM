# RD Report: DEV-STORAGE-COST-001 Upload Detail Metadata QC

Date: 2026-06-12

## Scope

- Task: `DEV-STORAGE-COST-001`
- Phase: upload detail metadata gate
- Goal: prove Engineer-uploaded CAD / PDF / DWG files preserve detail metadata from upload through submission detail response.

## Changes

- Added `scripts/qc-file-storage-upload-detail-metadata.mjs`.
- Registered `qc:file-storage-upload-detail-metadata` in `package.json`.

## Coverage

- Upload validation allows `sldprt`, `sldasm`, `slddrw`, `pdf`, and `dwg`.
- `saveUploadedFiles(...)` records file role, original filename, local path, SHA-256, and byte size from the storage service write.
- `createSubmissionRecordAsync(...)` receives the saved file metadata and inserts it into `submission_files`.
- Submission detail repository selects all files for the submission, normalizes file size, computes file count / role summary, and returns `files` in the detail payload.
- Submission detail route authenticates, checks `canReadSubmission(...)`, and only then returns the payload.
- Existing `qc:api` runtime coverage still exercises created submission detail metadata, PDF file download/preview, native CAD upload role metadata, and DWG missing-role consumers.

## Verification

- `node --check scripts/qc-file-storage-upload-detail-metadata.mjs` passed.
- `npm.cmd run qc:file-storage-upload-detail-metadata` passed 13/13.

## Boundary

- This is a local static/regression gate. It does not start a server, mutate DB data, call Supabase, create buckets, migrate files, or update provider pointers.
- This gate proves metadata preservation for current local storage submission detail behavior. Live provider metadata parity remains part of the external provider cutover gates.
