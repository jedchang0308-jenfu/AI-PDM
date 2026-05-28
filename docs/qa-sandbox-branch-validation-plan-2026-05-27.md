# QA Validation Plan - P2 Sandbox / Prototype Branch

Date: 2026-05-27

## Scope

Validate a lightweight sandbox branch workflow for fast engineering trials without adding full CAD branch/merge complexity.

## User Angle

1. Engineer can create a prototype branch from an existing submission without changing the source revision.
2. Engineer can open the sandbox submission and review copied files/metadata.
3. Active sandbox submissions cannot be approved or released by mistake.
4. Engineer can promote the branch into the normal review/release flow when the trial is ready.
5. Managers can review promoted sandbox submissions through the existing approval process.

## RD FMEA

| Risk | Failure Mode | Control |
| --- | --- | --- |
| Wrong release | Active sandbox is approved like a normal submission | Approval route blocks active sandbox branches |
| Source contamination | Sandbox changes current item revision or source metadata | Sandbox insertion reuses `item_id` and does not call item revision updater |
| Missing traceability | Branch cannot be traced to original submission | `sandbox_branches` links source and sandbox submissions with audit logs |
| Permission leak | Engineer branches or opens another Engineer's submission | Existing `canReadSubmission` scope enforced on sandbox routes |
| Duplicate branch ambiguity | Same branch name reused on one source | Unique source + branch name constraint |

## QC Cases

- `SANDBOX-001` unauthenticated sandbox list returns 401.
- `SANDBOX-002` Manager cannot create sandbox branch.
- `SANDBOX-003` Engineer creates sandbox branch.
- `SANDBOX-004` Sandbox branch is active.
- `SANDBOX-005` Sandbox revision is isolated from source revision.
- `SANDBOX-006` Engineer lists source sandbox branches.
- `SANDBOX-007` Source sandbox list includes created branch.
- `SANDBOX-008` Engineer can open sandbox submission detail.
- `SANDBOX-009` Sandbox detail copies source files.
- `SANDBOX-010` Active sandbox cannot be approved.
- `SANDBOX-011` Engineer promotes own sandbox branch.
- `SANDBOX-012` Promoted sandbox branch status is promoted.
- `SANDBOX-013` Promoted sandbox can enter release flow.
- `SANDBOX-014` Promoted sandbox reaches Released.

## Acceptance

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes and includes sandbox routes.
- `npm.cmd run qc:api` passes all `SANDBOX-*` cases.
- `npm.cmd run qc:ui` passes existing regression.
- `npm.cmd run qc:file-hashes` reports no missing/unreadable/hash mismatch issues.
