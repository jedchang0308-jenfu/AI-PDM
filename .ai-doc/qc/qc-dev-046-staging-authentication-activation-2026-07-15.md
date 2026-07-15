# DEV-046 Staging Authentication Activation QC

## Result

- Status: `passed_staging_activation`
- Scope: staging only; production was not accessed or deployed.
- Source snapshot: `69a8c1da0c694079940988edbde8c74211f62d19`
- Source provenance: passed with clean snapshot, matching OCI revision label, and all 7 accepted DEV-046 routes present.

## Application Deployment

- Firebase Hosting: `https://jenfu-ai-pdm-stg-361825.web.app`
- Firebase operation: `--only hosting`
- Cloud Run service: `ai-pdm-stg`
- Ready revision: `ai-pdm-stg-00005-4xp`
- Traffic: 100% to the ready revision
- Application image: `asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm@sha256:6d4142080c7e4820e11088d60b2ac15378ce87c170d5658c80c1bfe7aa91a6d6`
- Image route manifest: 266 routes; all accepted DEV-046 routes present.
- Live HTTP smoke: `/login` 200, `/api/auth/mode` 200, unauthenticated `/api/numbering/permissions` 401.
- TOTP UI bundle smoke: 2 login JS bundles contain the TOTP enrollment implementation.

## Admin Bootstrap

- Target: `jenfu-ai-pdm-stg-361825:asia-east1:ai-pdm-stg-postgres`, database `ai_pdm`
- Execution: `ai-pdm-stg-migration-runner-ddrfk`
- Execution status: succeeded; one task succeeded; 12-second runtime.
- Runner image index: `asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm-migration@sha256:dccadf3723586c38c4d598f9008de67a83933199e4c29acb1f320a0a7087f2bf`
- Resolved execution image: `asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm-migration@sha256:da26d6c546933f04d8cddafa1e75726e3f5b3bae9257d77c877e79d85d9ca9f`
- Principal: `stg-pdm-admin-001`, Firebase UID `qxEv2napjvMEmiqIUqwhTCf6gjg2`
- Runner readback: `mode=execute`, `allChecksPassed=true`
- Canonical role count: 9
- Canonical permission count: 237
- Application password: not stored
- MFA secret/recovery material: not stored
- SQL connection: Cloud SQL Auth Proxy over staging private path with IAM database user

## Posture

- Migration Job restored to the original migration image and two args: `scripts/run-dev-046-cloudsql-migrations.mjs`, `--dry-run`.
- Bootstrap approval env vars absent from the stored Job spec.
- Job resource UID remained unchanged; no Cloud SQL resource deletion occurred.
- No production deployment, production database access, or business-data deletion was performed.

## Evidence

- Detailed bootstrap readback: `output/dev-046-staging-principal-bootstrap/live-execution-readback.json`
- Local TOTP QC: `npm run qc:dev-046-totp-enrollment` (9/9)
- Firebase Hosting contract QC: `npm run qc:dev-046-firebase-hosting-entrypoint` (11/11)
- Bootstrap package QC: `npm run qc:dev-046-staging-principal-bootstrap-package` (12/12)
- Bootstrap runner QC: `npm run qc:dev-046-staging-principal-bootstrap-runner` (10/10)
- Disposable PostgreSQL shadow QC: `npm run qc:dev-046-staging-principal-bootstrap-shadow` (6/6)
