# QC Validation Report - CAD Branch / Merge

## Scope

- Dev task: `P2` CAD branch / merge.
- Validation plan: `.ai-doc/qa/qa-cad-branch-merge-validation-plan-2026-05-27.md`.
- Environment: production build served by `next start -p 3001`.
- Release mode: `PDM_RELEASE_MODE=local_stub`.
- Base URL for API/UI QC: `http://localhost:3001`.

## Result

PASS.

## Evidence

| Check | Result |
| --- | --- |
| `cmd /c node_modules\.bin\tsc.cmd --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run qc:api` | PASS, 376 passed / 0 failed |
| `npm run qc:ui` | PASS, 26 passed / 0 failed |
| `npm run qc:file-hashes` | PASS, 1737 ok / 0 missing / 0 unreadable / 0 size mismatch / 0 hash mismatch |

## CAD Branch / Merge Cases

| Case | Result |
| --- | --- |
| `SANDBOX-001` unauthenticated sandbox list returns 401 | PASS |
| `SANDBOX-002` manager cannot create sandbox branch | PASS |
| `SANDBOX-003` engineer creates sandbox branch | PASS |
| `SANDBOX-004` sandbox branch is active | PASS |
| `SANDBOX-005` sandbox revision is isolated from source revision | PASS |
| `SANDBOX-006` engineer lists source sandbox branches | PASS |
| `SANDBOX-007` source sandbox list includes created branch | PASS |
| `SANDBOX-015` engineer reads sandbox merge preview | PASS |
| `SANDBOX-016` merge preview is mergeable | PASS |
| `SANDBOX-017` merge preview detects sandbox revision change | PASS |
| `SANDBOX-010` active sandbox cannot be approved | PASS |
| `SANDBOX-011` engineer merges own sandbox branch | PASS |
| `SANDBOX-012` merged sandbox branch status | PASS |
| `SANDBOX-018` merged sandbox branch records `merged_at` | PASS |
| `SANDBOX-019` merged sandbox branch returns summary | PASS |
| `SANDBOX-013` merged sandbox can enter release flow | PASS |
| `SANDBOX-014` merged sandbox reaches Released | PASS |

## Findings

- No failed QC case found.
- Merge preview exposes source/sandbox differences before merge.
- Merge action records merge evidence and unblocks the existing approval/release path.
- Existing release package, supplier portal, procurement API, ERP sync, handoff, and approval regressions remain passing.
