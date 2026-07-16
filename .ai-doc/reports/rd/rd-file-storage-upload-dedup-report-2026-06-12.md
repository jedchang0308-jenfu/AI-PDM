# RD Report: DEV-STORAGE-COST-001 Local Upload Dedup QC

Date: 2026-06-12

## Scope

- Task: `DEV-STORAGE-COST-001`
- Phase: local provider upload-time deduplication gate
- Goal: prevent duplicate local physical objects when uploaded bytes have the same SHA-256 while preserving per-upload business file rows and Submit audit evidence.

## Changes

- Updated `src/lib/file-storage.ts`; `LocalRepositoryStorageAdapter.putObject(...)` now computes SHA-256 before writing and reuses an existing repository object with the same hash.
- Added `scripts/qc-file-storage-upload-dedup.mjs`.
- Registered `qc:file-storage-upload-dedup` in `package.json`.
- Updated `scripts/generate-file-storage-cost-report.mjs` so duplicate recoverable bytes are calculated from unique physical objects, not from already-shared business references.
- Updated `scripts/qc-file-storage-cost-report.mjs` to prove shared local paths do not inflate recoverable duplicate bytes.

## Coverage

- Same bytes uploaded to different keys reuse the canonical local path and storage key.
- Different bytes still create a separate physical object.
- `readObject(...)` and `verifyObjectHash(...)` work against the reused canonical object.
- `AsyncSubmissionWriteRepository` still inserts one `submission_files` row per uploaded file.
- Submit audit still records the original uploaded file count.
- Cost report keeps business reference counts visible but computes duplicate recoverable bytes by unique physical object.

## Verification

- `node --check scripts/qc-file-storage-upload-dedup.mjs` passed.
- `npm.cmd run qc:file-storage-upload-dedup` passed 14/14.
- `npm.cmd run qc:file-storage-cost-report` passed 19/19.

## Boundary

- This closes local provider upload-time dedup behavior only.
- No Supabase connector call, no live provider request, no DB migration, no provider pointer update, no file migration, and no production data mutation was performed.
- Formal `storage_objects` / `storage_object_references` persistence and live provider dedup remain open under the schema / provider migration gates.
