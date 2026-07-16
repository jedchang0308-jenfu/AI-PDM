# RD Report: Submission Sandbox Async Provider Conversion

Date: 2026-06-12
Task: DEV-SUPABASE-DB-001 Supabase DB runtime migration
Phase: 3BW submission sandbox route async provider conversion

## Scope

- Converted sandbox API routes from synchronous `@/lib/db` helpers to async provider helpers:
  - `src/app/api/submissions/[id]/sandbox/route.ts`
  - `src/app/api/submissions/[id]/sandbox/[branchId]/route.ts`
- Added `src/lib/repositories/sandbox-async-repository.ts`.
- Added `src/lib/sandbox-async.ts`.
- Extended `scripts/qc-access-control-async-repository.mjs` with static and SQLite semantic coverage for sandbox list/get/create/close/merge SQL.

## Implementation Notes

- `AsyncSandboxRepository` now exposes:
  - `listSandboxBranchesForSubmission`
  - `getSandboxBranchById`
  - `getSandboxMergePreview`
  - `createSandboxBranch`
  - `updateSandboxBranchStatus`
  - `mergeSandboxBranch`
- Create branch copies the source submission, files, references, and materializes BOM draft through `AsyncBomRepository` when the source has assembly references.
- Status updates and merge write audit entries through `AsyncAuditRepository`.
- Postgres uses `AsyncDatabaseClient.transaction(...)`; SQLite follows the existing async-provider pattern of sequential execution because SQLite async transaction callbacks cannot await.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- Exact sandbox route scan found no sync DB/helper match:
  - `NO_SUBMISSION_SANDBOX_SYNC_DB_MATCHES`
- `npm.cmd run qc:access-control-async-repository` passed 235/235.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through:
  - `next.config.mjs -> src/lib/llm-usage.ts -> src/lib/chat.ts -> src/app/api/chat/route.ts`

## Runtime Smoke

- Temporary `next dev` on `http://127.0.0.1:3026` was started and cleaned up.
- API smoke passed 7/7:
  - Engineer login.
  - Created a source submission with assembly reference.
  - `POST /api/submissions/{id}/sandbox` created an active sandbox branch and sandbox submission.
  - `GET /api/submissions/{sourceId}/sandbox` listed the branch.
  - `GET /api/submissions/{sandboxSubmissionId}/sandbox` returned `current_branch`.
  - `GET /api/submissions/{sourceId}/sandbox/{branchId}` returned branch detail and merge preview.
  - `PATCH /api/submissions/{sourceId}/sandbox/{branchId}` with `action=close` returned closed status.

## Boundary

- No Supabase connector calls.
- No migration apply.
- No Supabase project or branch creation.
- No live Postgres validation.
- No provider pointer update.
- No production cutover.
- No rollback operation.

## Result

Phase 3BW is complete for the submission sandbox API async provider conversion. The remaining direct route `@/lib/db` imports are outside this slice.
