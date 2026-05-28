# RD Report - P2 Sandbox / Prototype Branch

Date: 2026-05-27

## Scope

Implemented a lightweight sandbox/prototype branch workflow for fast engineering trials.

## Changes

- Added `sandbox_branches` schema for source/sandbox traceability.
- Added `/api/submissions/[id]/sandbox` for listing and creating branches.
- Added `/api/submissions/[id]/sandbox/[branchId]` for promote/close actions.
- Added approval guard so active sandbox submissions cannot be approved or released by mistake.
- Added dashboard sandbox panel with branch creation, branch list, open, close, and promote actions.
- Added API regression cases `SANDBOX-001` through `SANDBOX-014`.

## Design Notes

- Sandbox creation copies submission metadata, files, and CAD references into a separate Pending sandbox submission.
- The sandbox revision uses a generated `-SBX-` suffix and does not update the item current revision.
- Promotion changes branch status to `promoted`; the promoted sandbox then follows the existing approval/release workflow.
- Full CAD branch/merge remains out of scope for this P2 high-efficiency workflow.

## Validation

See `docs/qa-sandbox-branch-validation-plan-2026-05-27.md` and `docs/qc-sandbox-branch-validation-report-2026-05-27.md`.
