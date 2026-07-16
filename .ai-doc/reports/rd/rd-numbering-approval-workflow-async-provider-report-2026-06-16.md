# RD Report - Numbering Approval Workflow Async Provider Migration

Date: 2026-06-16
Phase: 3CQ
Task: `DEV-SUPABASE-DB-001`

## Scope

Converted the numbering approval workflow route slice from direct sync `@/lib/db` access to async provider-backed repository access.

Routes covered:

- `src/app/api/numbering/approval-batches/route.ts`
- `src/app/api/numbering/approval-batches/[batchId]/route.ts`
- `src/app/api/numbering/approval-decisions/route.ts`
- `src/app/api/numbering/approval-requests/route.ts`

## Changes

- Added async numbering approval workflow methods to `AsyncNumberingRepository`:
  - `requestNumberingApproval`
  - `requestSameDrawingVariantApproval`
  - `requestMainDrawingRestoreApproval`
  - `decideNumberingApproval`
  - `getNumberingApprovalBatch`
  - `listNumberingApprovalBatches`
  - `createNumberingApprovalBatch`
  - `decideNumberingApprovalBatch`
  - `resubmitRejectedNumberingApprovalBatchItems`
- Added provider-neutral SQL constants for approval requests, approval decisions, approval batches/items, approval review summaries, DVT/release apply transitions, same-drawing variants, main drawing restore, tasks, notifications, warnings, and audit side effects.
- Exposed async runtime helpers through `src/lib/numbering-async.ts`.
- Updated four API routes to use async helpers and keep async permission guards.
- Extended `scripts/qc-access-control-async-repository.mjs` so the numbering async provider gate covers approval request, approval decision, approval batch list, and approval batch detail routes.

## Preserved Behavior

- Response shape for approval request, approval decision, approval batch list/detail/create/decision/resubmit routes.
- Permission behavior:
  - `numbering.approvals`
  - `numbering.approval.batch.create`
  - `numbering.approval.batch.decide`
  - `numbering.approval.batch.resubmit`
  - action-code based approval request guard.
- Approval state transitions:
  - request `pending` to `approved`, `rejected`, or `needs_info`.
  - batch item `pending` to decision status.
  - batch status refresh to `approved`, `partially_approved`, `rejected`, `needs_info`, `pending`, or `cancelled`.
  - rejected/needs_info item resubmit creates a new pending request and marks the old item `resubmitted`.
- Side effects:
  - pending approval warning event.
  - approval task item.
  - approval notification.
  - audit logs for request, decision, batch create, batch decision, resubmit, DVT approval, release approval, drawing-part link, and main drawing restore.
- Apply behavior for approved numbering requests:
  - DVT promotion.
  - release.
  - same drawing variant after release.
  - main drawing restore.
- Existing error status mapping for not found, mismatch, already resolved, no pending targets, no rejected targets, and invalid decision payloads.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Exact route sync DB scan passed:
  - `src/app/api/numbering/approval-batches/route.ts`: `HasDirectDb=False`, `HasAsync=True`
  - `src/app/api/numbering/approval-batches/[batchId]/route.ts`: `HasDirectDb=False`, `HasAsync=True`
  - `src/app/api/numbering/approval-decisions/route.ts`: `HasDirectDb=False`, `HasAsync=True`
  - `src/app/api/numbering/approval-requests/route.ts`: `HasDirectDb=False`, `HasAsync=True`
- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npm.cmd run qc:access-control-async-repository` passed: 253/253.
- Runtime smoke with isolated `PDM_DATA_DIR` passed: 32/32.
  - Created numbering records through `/api/numbering/records`.
  - Created DVT approval requests through `/api/numbering/approval-requests`.
  - Listed approval batches through `/api/numbering/approval-batches`.
  - Created approval batches through `/api/numbering/approval-batches`.
  - Read approval batch detail through `/api/numbering/approval-batches/[batchId]`.
  - Approved a batch through PATCH `/api/numbering/approval-batches/[batchId]`.
  - Approved a request through `/api/numbering/approval-decisions`.
  - Rejected a batch and resubmitted rejected items through PATCH `/api/numbering/approval-batches/[batchId]`.
  - Verified audit side effects: 14 matching audit rows.
  - Verified task side effects: 4 approval request task rows.
  - Verified notification side effects: 4 approval request notification rows.
  - Verified approved DVT parts updated: 2.
  - Isolated temp data cleanup proof: `cleanupExists=False`.
- `npm.cmd run qc:doc-paths` passed: 23/23.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed; existing Turbopack NFT trace warning remains unrelated to this slice.

## Direct DB Route Count

- Before slice: 12
- After slice: 8

Remaining direct sync DB API routes:

- `src/app/api/numbering/admin/matrix/route.ts`
- `src/app/api/numbering/dvt-candidates/route.ts`
- `src/app/api/numbering/impact-analysis/route.ts`
- `src/app/api/numbering/import-batches/route.ts`
- `src/app/api/numbering/import-batches/[batchId]/route.ts`
- `src/app/api/numbering/import-batches/[batchId]/confirm/route.ts`
- `src/app/api/numbering/rule-simulator/route.ts`
- `src/app/api/numbering/variants/route.ts`

## Stop Point

Per PM-dev operating rule, this slice stops here. Recommended next slice: numbering import workflow.
