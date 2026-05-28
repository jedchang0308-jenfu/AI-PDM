# QC Validation Report - PLM Phase Gate

Date: 2026-05-27

## Scope

Validated `P2 大型 PLM phase-gate 流程` against `docs/qa-phase-gate-validation-plan-2026-05-27.md`.

## Result

PASS.

## Evidence

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm.cmd run lint` | PASS |
| Build | `npm.cmd run build` | PASS; build includes `/api/submissions/[id]/phase-gates` and `/api/submissions/[id]/phase-gates/[checkId]` |
| API QC | `PDM_BASE_URL=http://127.0.0.1:3001 npm.cmd run qc:api` | PASS; 333 passed, 0 failed |
| UI QC | `PDM_BASE_URL=http://127.0.0.1:3001 npm.cmd run qc:ui` | PASS; 26 passed, 0 failed |
| File hash verification | `npm.cmd run qc:file-hashes` | PASS; 1590 ok, 0 issues |

## Covered Cases

- `PHASE-001` unauthenticated phase gate list returns 401.
- `PHASE-002` Engineer cannot initialize phase gates.
- `PHASE-003` Manager initializes phase gates.
- `PHASE-004` Default phase gate count is 4.
- `PHASE-005` Phase gates start with four open required checks.
- `PHASE-006` Open required phase gates block approval.
- `PHASE-007` Engineer cannot decide phase gate.
- Phase decisions for concept, design, verification, and release return 200.
- `PHASE-008` Phase gate list after decisions returns 200.
- `PHASE-009` No required phase gates remain open.
- `PHASE-010` Phase gate summary is ready.
- `PHASE-011` Decided phase gate cannot be decided again.
- `PHASE-012` Completed phase gates allow approval.
- `PHASE-013` Completed phase gates release submission.

## Runtime Notes

- Port `3000` remained occupied by an external node process, so QC ran against `http://127.0.0.1:3001`.
- The `3001` QC dev server was stopped after validation. No `LISTENING` process remains on port `3001`.

## Findings

No QC failures found.
