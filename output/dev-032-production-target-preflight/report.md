# DEV-032 Production Target Read-only Preflight

Generated: 2026-07-15T23:52:01.444Z
Target project: `jenfu-ai-pdm-prod`
Region: `asia-east1`
Production action performed: `false`
Status: `preflight_readonly_passed_release_still_requires_approval`

## Result

Read-only target discovery did not find target-level blockers, but release still requires separate approval and post-deploy smoke.

## Active Identity

- Account: `jedchang0308@jenfu.com.tw`
- Active project: `jenfu-ai-pdm-prod`

## Production Target Contract

- Contract: `config/platform/production-target.template.json`
- Public base URL: `https://jenfu-ai-pdm-prod.web.app`
- Firebase Hosting gateway allowed: `true`
- Cloud Run ingress: `all`
- Expected Cloud SQL instance: `ai-pdm-prod-postgres`
- Required secret IDs: `pdm-session-signing-current`, `pdm-session-signing-previous`

## Blockers


## Read-only Commands

- PASS `gcloud config get-value account`
- PASS `gcloud config get-value project`
- PASS `gcloud projects describe jenfu-ai-pdm-prod --format=json`
- PASS `gcloud run services list --project jenfu-ai-pdm-prod --region asia-east1 --format=json`
- PASS `gcloud sql instances list --project jenfu-ai-pdm-prod --format=json`
- PASS `gcloud secrets list --project jenfu-ai-pdm-prod --format=json`

## Stop Conditions

- This report is read-only discovery evidence only.
- Do not apply Terraform, deploy, import SQL, execute migration jobs or create production resources from this report.
- Do not print or persist secret values.
- Do not proceed to production build/deploy until release source, production target, env/secret source, HD-8-4 restore/reconciliation, rollback and Level 3/4 smoke gates are closed.

