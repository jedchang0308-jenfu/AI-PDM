# RD Report: DEV-STORAGE-COST-001 Local Provider File-Domain Regression

日期：2026-06-12

## Scope

- Task: `DEV-STORAGE-COST-001`
- Phase: Phase 5U local provider file-domain regression gate
- Goal: provide a fast equivalent file-domain regression gate for local provider behavior without requiring a live Supabase Storage bucket, S3-compatible provider, or external migration target.

## Changes

- Added `scripts/qc-file-storage-local-provider-regression.mjs`.
- Registered `npm.cmd run qc:file-storage-local-provider-regression`.
- Updated `.ai-doc/dev_task.md` to mark the local-provider regression gate, PDF preview/CAD guard, and missing/hash/orphan detection as completed.

## Coverage

The new QC verifies:

- `createFileStorageService()` still defaults to `LocalRepositoryStorageAdapter`.
- Local download access remains server-streamed, audited, and authorization-header required.
- Submission upload writes through `FileStorageService` and preserves file role, original filename, local path, SHA-256, and file size metadata.
- Submission download and PDF preview read through the storage service, keep attachment/inline disposition, and keep private no-store headers.
- The preview route only permits PDF inline preview and leaves non-PDF/CAD preview blocked.
- Release package downloads remain released/obsolete gated, ZIP responses, audited, and storage-backed.
- Public supplier share package downloads remain token scoped, audited as external access, and revocation-sensitive through existing `qc:api` assertions.
- Existing cost-report fixtures still identify missing local objects, hash mismatches, orphan local files, and duplicate hash groups.
- Existing `qc:api` assertions for file download, PDF preview, release package, public share package, audit provenance, and procurement-release redaction remain present.

## Verification

- `node --check scripts/qc-file-storage-local-provider-regression.mjs` passed.
- `npm.cmd run qc:file-storage-local-provider-regression` passed 34/34.

## Guardrails

- No Supabase connector calls.
- No Supabase Storage bucket creation.
- No S3-compatible provider request.
- No DB schema migration.
- No provider pointer update.
- No file migration or deletion.

## Remaining Work

- Supabase Storage staging private bucket live validation remains pending.
- Upload-time physical-object deduplication remains pending until the formal `storage_objects` / `storage_object_references` schema gate.
- Live provider migration, pointer rollback, and external cold-provider restore remain pending.
- Manufacturing / Procurement released-file download authorization still needs accepted runtime/user-role validation before closure.
