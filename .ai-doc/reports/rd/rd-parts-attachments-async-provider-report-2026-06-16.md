# RD Report: Parts Attachments Async Provider Conversion

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CN

## Scope

- Converted `src/app/api/parts/[partNumber]/attachments/route.ts` from synchronous `@/lib/db` access to async provider access.
- Converted `src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts` from synchronous `@/lib/db` access to async provider access.
- Added `src/lib/repositories/master-attachment-async-repository.ts` for provider-neutral attachment lookup, create, download, soft delete, and Drive sync status operations.
- Added `src/lib/master-attachments-async.ts` runtime helper functions.
- Updated `scripts/qc-access-control-async-repository.mjs` with static regression checks for the async repository, helper, and two parts attachment routes.

## Implementation Notes

- Preserved route parameter behavior through `decodeURIComponent(partNumber)`.
- Preserved response shapes:
  - list: `{ entity, attachments }`;
  - create: `{ attachment }`;
  - sync: `{ attachment }`;
  - delete: `{ deleted: true }`;
  - download: binary response through `buildMasterAttachmentFileResponse(...)`.
- Preserved auth behavior by switching to `requireNumberingPageAsync(...)` and `requireNumberingActionAsync(...)`.
- Preserved attachment error mapping through `masterAttachmentStatusFromError(...)`.
- Preserved file storage boundary by continuing to use `createFileStorageService()` and storage keys under `master-attachments/...`.
- Preserved Google Drive fail-closed behavior when no folder is configured.
- Kept this slice within SQLite fallback/runtime provider-neutral repository boundaries. No provider pointer was changed.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for:
  - `src/app/api/parts/[partNumber]/attachments/route.ts`;
  - `src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts`.
- Direct `@/lib/db` API route count decreased from 19 to 17.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 253/253.
- `npm.cmd run qc:master-attachments` passed 85/85.
- Runtime smoke with isolated temporary `PDM_DATA_DIR` passed 9/9:
  - initialized temporary SQLite database;
  - seeded fixture part `PN-RUNTIME-3CN`;
  - admin demo shortcut returned a valid session cookie;
  - GET missing part attachments returned `404 PART_NUMBER_NOT_FOUND`;
  - POST attachment upload returned `201` with storage key and SHA-256 content hash;
  - GET attachment list returned uploaded attachment;
  - GET preview download returned uploaded bytes with inline disposition;
  - POST Drive sync without configured folder returned `503 MASTER_ATTACHMENT_GDRIVE_FOLDER_NOT_CONFIGURED`;
  - DELETE soft-deleted the attachment;
  - GET list omitted the deleted attachment;
  - GET deleted attachment download returned `404 MASTER_ATTACHMENT_NOT_FOUND`;
  - temporary server and temporary data directory were cleaned up.

## Boundary

- Runtime smoke used an isolated temporary SQLite database and did not mutate local `data/ai-pdm.sqlite`.
- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.
- Full lint/build was intentionally skipped for this slice per the PM batch-control rule; targeted typecheck, exact route scan, QC syntax, targeted QC, route-specific QC, and runtime smoke were used instead.

## Result

Phase 3CN is complete for parts attachments async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice. Per PM operating rules, work stops after 3CN and does not automatically continue into the next route group.
