# QC-PDM-NUMBERING-V2-COMPACT-IDENTITY Report

Date: 2026-07-07
Related DEV: `DEV-PDM-NUMBERING-002`
Result: PASS for local Phase 1-3 implementation; production cutover not executed

## Scope Verified

- New normal numbering creates compact v2 identities: `00001`, `00001-P01`, `00001-M01`, `00001-R01`.
- Normal creation uses `M/R`; historical `MA/OT` remains readable and gate-compatible.
- Manufacturing/reference checks use semantic helpers instead of raw `MA`/`M` literals.
- Migration dry-run produces JSON/Markdown reports and proves no fixture mutation.
- Downstream numbering, submission, shared 3D/baseline, master attachments and master workbench paths remain compatible.
- Supabase runtime migration mirror includes compact numbering migration `004`.

## Evidence

| Command | Result |
|---|---|
| `npx.cmd tsc --noEmit --pretty false` | PASS |
| `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd run qc:pdm-numbering-v2-compact-identity` | PASS 13/13 |
| `npm.cmd run qc:pdm-numbering-v2-migration-dry-run` | PASS |
| `npm.cmd run qc:pdm-numbering-core` | PASS 241/241 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-api-regression` | PASS 27/27 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-data-consistency` | PASS 16/16 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-concurrency-reuse` | PASS 32/32 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-draft-lifecycle` | PASS 29/29 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-request-ui` | PASS 66/66 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-search-ui` | PASS 28/28 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-impact-ui` | PASS 24/24 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-numbering-dvt-ui` | PASS 24/24 |
| `npm.cmd run qc:master-attachments` | PASS 101/101 |
| `PDM_BASE_URL=http://127.0.0.1:3000 npm.cmd run qc:pdm-master-workbench-layout` | PASS 224/224 |
| `npm.cmd run qc:supabase-runtime-migrations` | PASS 25/25 |

## Generated Evidence

- `output/qc-pdm-numbering-v2-migration-dry-run/report.json`
- `output/qc-pdm-numbering-v2-migration-dry-run/report.md`

## Blocked / Not Executed

- `npm.cmd run build` was blocked by the intentional local-dev guard because PID 30948 was already listening on `http://127.0.0.1:3000`; no bypass was used.
- Production deployment, production migration/cutover, applying v1-to-v2 rewrite, direct DB repair/deletion, project/order/equipment numbering and extra visible category codes were not executed.
