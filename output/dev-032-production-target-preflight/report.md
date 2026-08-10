# DEV-032 Production Target Read-only Preflight

Generated: 2026-08-10T17:14:45.367Z
Target project: `jenfu-ai-pdm-prod`
Region: `asia-east1`
Production action performed: `false`
Status: `blocked_readonly_preflight`

## Result

Blocked by 5 read-only preflight blocker(s).

## Active Identity

- Account: `info@jenfu.com.tw`
- Active project: `jenfu-ai-pdm-prod`

## Production Target Contract

- Contract: `config/platform/production-target.template.json`
- Public base URL: `https://jenfu-ai-pdm-prod.web.app`
- Firebase Hosting gateway allowed: `true`
- Cloud Run ingress: `all`
- Expected Cloud SQL instance: `ai-pdm-prod-postgres`
- Required secret IDs: `pdm-session-signing-current`, `pdm-session-signing-previous`

## Blockers

- `PRODUCTION_PROJECT_UNAVAILABLE`: Production project is not readable by the active account or does not exist.
- `PRODUCTION_CLOUD_RUN_SERVICE_UNPROVEN`: Expected production Cloud Run service was not proven readable.
- `PRODUCTION_CLOUD_SQL_INSTANCE_UNPROVEN`: Expected production Cloud SQL instance metadata was not proven readable.
- `PRODUCTION_SECRET_SOURCE_UNPROVEN`: Required production Secret Manager metadata was not proven readable; no secret values were requested.
- `LEVEL3_LEVEL4_SMOKE_NOT_POSSIBLE`: Production-like and post-deploy smoke cannot run until production runtime/database target is proven.

## Read-only Commands

- PASS `gcloud config get-value account`
- PASS `gcloud config get-value project`
- BLOCKED `gcloud projects describe jenfu-ai-pdm-prod --format=json`
- BLOCKED `gcloud run services list --project jenfu-ai-pdm-prod --region asia-east1 --format=json`
- BLOCKED `gcloud sql instances list --project jenfu-ai-pdm-prod --format=json`
- BLOCKED `gcloud secrets list --project jenfu-ai-pdm-prod --format=json`

## Stop Conditions

- This report is read-only discovery evidence only.
- Do not apply Terraform, deploy, import SQL, execute migration jobs or create production resources from this report.
- Do not print or persist secret values.
- Do not proceed to production build/deploy until release source, production target, env/secret source, HD-8-4 restore/reconciliation, rollback and Level 3/4 smoke gates are closed.
