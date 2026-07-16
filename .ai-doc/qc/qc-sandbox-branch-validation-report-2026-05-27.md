# QC Validation Report - Sandbox / Prototype Branch

Date: 2026-05-27

## Scope

Validated `P2 Sandbox / 試作分支` against `.ai-doc/qa/qa-sandbox-branch-validation-plan-2026-05-27.md`.

## Result

PASS.

## Evidence

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm.cmd run lint` | PASS |
| Build | `npm.cmd run build` | PASS; build includes `/api/submissions/[id]/sandbox` and `/api/submissions/[id]/sandbox/[branchId]` |
| API QC | `PDM_BASE_URL=http://127.0.0.1:3001 npm.cmd run qc:api` | PASS; 298 passed, 0 failed |
| UI QC | `PDM_BASE_URL=http://127.0.0.1:3001 npm.cmd run qc:ui` | PASS; 26 passed, 0 failed |
| File hash verification | `npm.cmd run qc:file-hashes` | PASS; 1537 ok, 0 issues |

## Covered Cases

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

## Runtime Notes

- Port `3000` remained occupied by an external node process, so QC ran against `http://127.0.0.1:3001`.
- The `3001` QC dev server was stopped after validation. No `LISTENING` process remains on port `3001`.

## Findings

No QC failures found.
