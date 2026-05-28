# QC Validation Report - BOM Export

Date: 2026-05-27

## Result

Pass.

## Evidence

| Command | Result |
| --- | --- |
| `npm.cmd run lint` | Pass |
| `npm.cmd run build` | Pass; Next routes include `/api/submissions/[id]/bom/export` |
| `npm.cmd run qc:api` | Pass; `236 passed / 0 failed` |
| `npm.cmd run qc:ui` | Pass; `26 passed / 0 failed` |
| `npm.cmd run qc:file-hashes` | Pass; `1403 checked / 1403 ok` |
| `netstat -ano \| findstr :3000` after shutdown | No `LISTENING`; only `TIME_WAIT` entries remained |

## BOM Export Tests

- `BOMEXPORT-001` unauthenticated BOM CSV export returns 401.
- `BOMEXPORT-002` missing BOM export returns 404.
- `BOMEXPORT-003` Engineer can export own BOM CSV.
- `BOMEXPORT-004` BOM CSV export uses CSV content type.
- `BOMEXPORT-005` BOM CSV export has UTF-8 BOM.
- `BOMEXPORT-006` BOM CSV export contains child and source filename.
- `BOMEXPORT-007` Manager can export BOM Excel.
- `BOMEXPORT-008` BOM Excel export uses Excel content type.
- `BOMEXPORT-009` BOM Excel export uses `.xls` filename and workbook content.
- `BOMEXPORT-010` Engineer cannot export other Engineer BOM.

## QC Finding

Initial UI run failed after `next build` cleaned `.next` while the dev server was still running. RD restarted the dev server and reran UI QC. Final validation passed with zero failures.
