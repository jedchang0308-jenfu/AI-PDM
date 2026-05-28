# QC Validation Report - Supplier Portal

## Result

- Status: PASS
- Date: 2026-05-27

## Validated Scope

- Public supplier portal response API.
- Internal supplier response list and close workflow.
- Public share page response form and response history.
- Dashboard supplier response visibility and close action.
- Existing share, package, handoff, procurement, release, approval matrix, phase-gate, and sandbox regression coverage.

## Evidence

| Check | Result |
| --- | --- |
| `tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `PDM_BASE_URL=http://localhost:3001 npm run qc:api` with `PDM_RELEASE_MODE=local_stub` server | PASS, 359 passed / 0 failed |
| `PDM_BASE_URL=http://localhost:3001 npm run qc:ui` | PASS, 26 passed / 0 failed |
| `npm run qc:file-hashes` | PASS, 1677 ok / 0 missing / 0 mismatch |

## Supplier Portal Cases

- `SUPPLIER-001`: invalid public token returns 404.
- `SUPPLIER-002`: invalid supplier response payload returns 400.
- `SUPPLIER-003`: public supplier response returns 201.
- `SUPPLIER-004`: supplier response starts open.
- `SUPPLIER-005`: public portal shows supplier response.
- `SUPPLIER-006`: Engineer cannot list supplier responses.
- `SUPPLIER-007`: Manager lists supplier responses.
- `SUPPLIER-008`: Manager list includes supplier response.
- `SUPPLIER-009`: Manager closes supplier response.
- `SUPPLIER-010`: closed response status is persisted.
- `SUPPLIER-011`: closing the same response twice returns 409.

## Notes

- QC used `PDM_RELEASE_MODE=local_stub` because local production-mode release tests do not have an external release integration configured.
- Port `3001` server was stopped after validation.
