# PDM File Storage QC Runtime Provenance - Phase 5P

Date: 2026-06-11
Task: `DEV-STORAGE-COST-001`

## Scope

This phase prevents runtime QC download evidence from being counted as formal monthly storage-governance egress.

The implementation keeps `StorageAccessed` runtime regression evidence, but marks QC-triggered rows with provenance so PM cost decisions can exclude them by default.

## Delivery

- `src/lib/storage-access-audit.ts` now writes `storageAccessSource` and `qcRunId`.
- QC provenance is accepted only when `NODE_ENV !== "production"` and the request includes `x-ai-pdm-qc-storage-audit-run-id`.
- Authenticated submission file download / preview, authenticated release package download, and public share package download routes pass request-based audit provenance.
- `scripts/qc-api-test.mjs` sends one QC run id across storage access runtime requests and verifies the resulting audit rows carry `storageAccessSource=qc_api`.
- `scripts/generate-file-storage-egress-report.mjs` excludes `qc_api` rows from governance totals by default, reports `excludedQcRuntime`, supports explicit inclusion through `PDM_STORAGE_EGRESS_INCLUDE_QC_RUNTIME=1`, and flags legacy/unclassified rows without provenance.
- `scripts/qc-file-storage-egress-report.mjs`, `scripts/qc-file-storage-monthly-evidence.mjs`, and `scripts/qc-file-storage-access-audit.mjs` now prove QC runtime rows stay out of monthly governance totals.

## Local Runtime Evidence

After the Phase 5P `qc:api` run, local `data/ai-pdm.sqlite` contains:

- 4 legacy `StorageAccessed` rows without provenance from the earlier Phase 5O runtime QC run.
- 4 new `StorageAccessed` rows with `storageAccessSource=qc_api`.

The new `qc_api` rows are excluded by governance. The older unclassified rows remain visible as legacy runtime rows and must be reviewed before using this local DB as monthly cost evidence.

## Guardrails

- No Supabase connector call was made.
- No Supabase project or branch was created.
- No schema migration was applied.
- No provider request was made.
- No files were deleted.
- No metadata pointer was updated.
- Port 3000 was occupied by an existing local process and was not touched.
- An isolated server was started on `127.0.0.1:3001` for runtime QC and stopped after verification.

## Verification

- `node --check scripts/generate-file-storage-egress-report.mjs` passed.
- `node --check scripts/qc-file-storage-egress-report.mjs` passed.
- `node --check scripts/qc-file-storage-monthly-evidence.mjs` passed.
- `node --check scripts/qc-file-storage-access-audit.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:file-storage-egress-report` passed 20/20.
- `npm.cmd run qc:file-storage-monthly-evidence` passed 17/17.
- `npm.cmd run qc:file-storage-access-audit` passed 39/39.
- `npm.cmd run qc:api` passed 409/409 against `http://127.0.0.1:3001`.

## Remaining External Gates

- User cost confirmation is still required before any Supabase `confirm_cost` or create call.
- Dedicated `AI_PDM_STAGING` / disposable Supabase target is still not created.
- Formal schema apply, verify, Supabase advisor evidence, and promotion are still pending.
- Live storage provider migration / rollback / cutover is still pending.
