# DEV-032 Production Release Closure

- Date: 2026-09-03 (Asia/Taipei)
- Verdict: **PASS / Production released / DEV-032 closed**
- Canonical URL: `https://jenfu-ai-pdm-prod.web.app`
- Exact source: `bb30682c0a9671fb66564127643ccf3913fa732b`
- Serving revision: `ai-pdm-prod-gh-bb30682c-33729286511`
- Production traffic: `100%`

## Five-user release-gate simplification

The system has five intended users. The release contract therefore retires the low-value named Wave 0 roster, fixed observation period, waiver document and candidate-bound waiver ceremony. These items do not reduce an irreversible technical risk for this deployment size.

The following gates remain mandatory and were completed: exact source/image provenance, production backup, isolated restore rehearsal, migration idempotence and reconciliation, zero-traffic candidate, authenticated Level 4, zero open P0/P1, rollback readiness, Product Owner GO, exact traffic promotion and canonical post-promotion smoke. Future releases must produce new artifact-bound evidence and cannot reuse this receipt.

## Gate C — data protection and migration

- Current migration package: 53 migrations, highest version `056`, manifest SHA-256 `02e07b51cc4d879088dfdf145ae189f8ddaff1f024be4b66daeb9ecfccc7c374`.
- Isolated restore target: `ai-pdm-prod-restore-a2938bfb-c2`, restored from automated backup `1788372000000`.
- Restore migration first pass applied `053`, `055`, `056`; immediate rerun applied zero versions.
- Source and restore reconciliation SHA-256 both equal `9776fb3feaeed1a688d0f5a82c54f32beb673234d99035aa5803829f878df8e3`.
- Restore target, temporary bootstrap object, temporary bucket and temporary IAM binding were deleted; production source metadata remained unchanged during rehearsal.
- Production on-demand backup `1788418322752` completed successfully before source migration. Production executions `ai-pdm-prod-migration-runner-w29cf` and `ai-pdm-prod-migration-runner-r7gtm` applied `053/055/056` and then zero versions. Read-only reconciliation passed.

The later `main` advance from `33ecd137` to `bb30682c` contained release evidence only; the migration manifest hash was unchanged. The application candidate was nevertheless rebuilt because the deployment gate requires the exact current `main` SHA.

## Gate D — immutable candidate and authenticated Level 4

- Candidate workflow: GitHub Actions run `33729286511`.
- Application image: `sha256:fb2ee51c21501b6697a135c5385328abec253ec8a82cdc557cc755912b5a561f`.
- Migration image: `sha256:ff73d02e1cb353868d9a45d48791ad2f2df201346e790495be2884546cc10e6f`.
- Candidate revision: `ai-pdm-prod-gh-bb30682c-33729286511`, held at 0% before promotion.
- Candidate smoke: 14/14 PASS.
- Authenticated Level 4 reference: `production-candidate://ai-pdm-prod-gh-bb30682c-33729286511/bb30682c0a9671fb66564127643ccf3913fa732b/DEV032-L4-20260903T075500Z-A0059`.

The production system administrator session verified the account/permission surface, persistent official-numbering records `A0059`, `A0059-P01` and `A0059-M01`, session reload, and the attachment route's explicit `未開放` fail-closed state. No file was uploaded and no out-of-scope feature was enabled.

The candidate initially exposed `WORKBENCH_AUTHORITY_MISMATCH`, which was correctly treated as a blocker. CAS execution `ai-pdm-prod-migration-runner-tnzxj` changed only `expected_commit` from `33ecd1379136ac6bfd88537e6e1d68b3346a089a` to `bb30682c0a9671fb66564127643ccf3913fa732b` and `row_version` from 7 to 8; `mode=canonical_only` and `schema_hash=dev090-v1` remained unchanged. The shared runner was restored to its dry-run command, original migration image `sha256:b5206fb518c7b6eeccda8c42d6b0468170c97cdc6e63c732e1e555a7e9aaac42`, pinned proxy image and zero repair environment variables at generation 97.

## Gate E — promotion and canonical verification

- Open GitHub issues labelled P0: 0.
- Open GitHub issues labelled P1: 0.
- Product Owner decision: `go`.
- Promotion workflow: GitHub Actions run `33730726544`.
- Canonical smoke: 14/14 PASS, 0 failed.
- Cloud Run readback: the exact revision is latest-created, latest-ready and receives 100% traffic.
- Canonical authenticated readback: `/api/parts/workbench?...A0059-P01` returned 200 and `/api/numbering/drawings/workbench?...A0059-M01` returned 200 after promotion.
- Cloud Run request-log query after promotion found zero 5xx responses for the serving revision.
- Automated rollback was not triggered because promotion and canonical smoke passed. The pre-promotion serving revision remains the documented rollback target.

The earlier promotion run `33728650056` was rejected before traffic mutation because `main` advanced while the workflow waited for approval. This is a successful fail-closed provenance check, not a production outage.

## Task-governance closure

The completion and production-readiness checks no longer hard-code DEV-032 as permanently blocked. They now require an explicit release-gate disposition and assert that readiness matches the current open-gate count. With `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` closed, the current audit reports zero open first-version tasks and production readiness `true`; future releases must create a new artifact-bound gate instead of reopening this receipt implicitly.

## Evidence

- `output/dev-032-cloudsql-native-backup-rehearsal/execution-summary.json`
- `output/dev-032-cloudsql-backup-readiness/report.json`
- `output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json`
- `output/qa/dev-032-production-release/run-33729286511/`
- `output/qa/dev-032-production-release/run-33730726544/`
- `output/qa/dev-032-production-release/final-release-manifest.json`

Known non-blocker: GitHub Actions emitted a Node.js 20 action-runtime deprecation warning while forcing those actions to Node.js 24. All release steps passed; update the pinned third-party actions in normal maintenance.
