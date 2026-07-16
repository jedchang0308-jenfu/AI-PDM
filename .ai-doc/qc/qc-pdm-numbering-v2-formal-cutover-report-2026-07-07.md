# QC-PDM-NUMBERING-V2-FORMAL-CUTOVER Report

Date: 2026-07-07
Related DEV: `DEV-PDM-NUMBERING-002`
Result: PASS for local/runtime formal cutover

## Scope Verified

- Local/runtime DB backup was created before mutation.
- v1 master identities were converted to compact v2 identities.
- `numbering-rule-v1` is retired and `numbering-rule-v2` is active.
- Operational references were updated for submissions, snapshots, revision/change-control/BOM/baseline records and supported JSON fields.
- Historical evidence strings in audit logs, export jobs, file assets, release packages and submission files were intentionally retained.
- Post-cutover API/UI/downstream regression suites passed.

## Cutover Evidence

| Evidence | Result |
|---|---|
| Backup | `data/backups/pdm-numbering-v2-cutover-20260707-052403/ai-pdm.sqlite` |
| Apply report | `output/qc-pdm-numbering-v2-cutover/report.json`, `output/qc-pdm-numbering-v2-cutover/report.md` |
| Independent check report | `output/qc-pdm-numbering-v2-cutover-check/report.json`, `output/qc-pdm-numbering-v2-cutover-check/report.md` |
| Root mappings | `0007 -> 00007`, `0014 -> 00014` |
| Part mappings | `P-0007-001 -> 00007-P01`, `P-0014-001 -> 00014-P01` |
| Drawing mappings | `D-0007-MA1 -> 00007-M01`, `D-0014-MA1 -> 00014-M01` |
| Blocked mappings | 0 |
| Remaining v1 master rows | 0 |

## Verification Commands

| Command | Result |
|---|---|
| `npx.cmd tsc --noEmit --pretty false` | PASS |
| `npm.cmd run lint -- --quiet` | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd run qc:pdm-numbering-v2-formal-cutover` | PASS 11/11 |
| `npm.cmd run qc:pdm-numbering-v2-compact-identity` | PASS 13/13 |
| `npm.cmd run qc:supabase-runtime-migrations` | PASS 25/25 |
| `npm.cmd run qc:pdm-numbering-core` | PASS 241/241 |
| `npm.cmd run qc:pdm-change-control` | PASS 62/62 |
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

## Not Executed

- External production deployment.
- Supabase live cutover.
- Provider pointer change.
- Direct/manual DB repair or deletion outside the scripted cutover boundary.
- Physical file rename or historical evidence rewrite.
