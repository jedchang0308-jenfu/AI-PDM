# RD Report: Numbering Drawing Attachments Async Provider Conversion

Date: 2026-06-16
Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration
Phase: 3CO

## Scope

- Converted `src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts` from synchronous `@/lib/db` access to async provider access.
- Converted `src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts` from synchronous `@/lib/db` access to async provider access.
- Reused `src/lib/master-attachments-async.ts` and `src/lib/repositories/master-attachment-async-repository.ts`; no new repository capability was required because drawing attachment support already existed.
- Updated `scripts/qc-access-control-async-repository.mjs` so `MASTER-ATTACHMENT-ASYNC-001` covers both parts and drawing attachment routes.

## Implementation Notes

- Preserved route parameter behavior through `decodeURIComponent(drawingNumber)`.
- Preserved response shapes:
  - list: `{ entity, attachments }`;
  - create: `{ attachment }`;
  - sync: `{ attachment }`;
  - delete: `{ deleted: true }`;
  - download: binary response through `buildMasterAttachmentFileResponse(...)`.
- Preserved auth behavior through `requireNumberingPageAsync(request, "numbering.drawings.view")` and `requireNumberingActionAsync(request, "numbering.attachments.manage")`.
- Preserved attachment error mapping through `masterAttachmentStatusFromError(...)`.
- Preserved file storage boundary by continuing to use the shared master attachment storage service and keys under `master-attachments/drawing-number/...`.
- Preserved Google Drive fail-closed behavior when no folder is configured.
- Kept this slice within SQLite fallback/runtime provider-neutral repository boundaries. No provider pointer was changed.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route scan found no sync DB/helper match for:
  - `src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts`;
  - `src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts`.
- Direct `@/lib/db` API route count decreased from 17 to 15.
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed 253/253.
- `npm.cmd run qc:master-attachments` passed 85/85.
- Runtime smoke with isolated temporary `PDM_DATA_DIR` passed 9/9:
  - initialized temporary SQLite database;
  - seeded fixture drawing `DRW-RUNTIME-3CO`;
  - admin demo shortcut returned a valid session cookie;
  - GET missing drawing attachments returned `404 DRAWING_NUMBER_NOT_FOUND`;
  - POST drawing attachment upload returned `201` with storage key and SHA-256 content hash;
  - GET drawing attachment list returned uploaded attachment;
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

Phase 3CO is complete for numbering drawing attachments async provider conversion. Remaining direct route `@/lib/db` imports are outside this slice. Per PM operating rules, work stops after 3CO and does not automatically continue into the next route group.
