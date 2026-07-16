# QC Validation Report - ERP / Inventory / Procurement Closed Loop

## Scope

- Dev task: `P2` 完整 ERP / 庫存 / 採購閉環。
- Validation plan: `.ai-doc/qa/qa-erp-procurement-closed-loop-validation-plan-2026-05-27.md`.
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
| `npm run qc:api` | PASS, 371 passed / 0 failed |
| `npm run qc:ui` | PASS, 26 passed / 0 failed |
| `npm run qc:file-hashes` | PASS, 1707 ok / 0 missing / 0 unreadable / 0 size mismatch / 0 hash mismatch |

## ERP Sync Cases

| Case | Result |
| --- | --- |
| `ERPSYNC-001` unauthenticated sync runs returns 401 | PASS |
| `ERPSYNC-002` Engineer sync runs returns 403 | PASS |
| `ERPSYNC-003` Pending submission cannot be synced | PASS |
| `ERPSYNC-004` Manager creates ERP sync run | PASS |
| `ERPSYNC-005` ERP sync run starts sent | PASS |
| `ERPSYNC-006` ERP sync payload includes package | PASS |
| `ERPSYNC-007` Manager lists sync runs | PASS |
| `ERPSYNC-008` sync run list includes created run | PASS |
| `ERPSYNC-009` Manager acknowledges ERP sync run | PASS |
| `ERPSYNC-010` acknowledged sync run status | PASS |
| `ERPSYNC-011` acknowledged sync run keeps external ref | PASS |
| `ERPSYNC-012` acknowledging sync run twice returns 409 | PASS |

## Findings

- No failed QC case found.
- New ERP / inventory / procurement sync run API is covered for unauthenticated access, Engineer denial, Pending submission block, released package payload, list visibility, acknowledgement, retained external reference, and duplicate acknowledgement rejection.
- Regression suites for existing API, UI smoke path, and file hash integrity remain passing.
