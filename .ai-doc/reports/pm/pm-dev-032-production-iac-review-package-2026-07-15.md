# DEV-032 Production IaC Review Package

Date: 2026-07-15
Owner: Dev PM / deployment-release-gate
Scope: production Terraform review package only
Production action: none

## Result

Status: prepared for review; not release-ready.

`infra/google-cloud/production/` now models the intended DEV-032 / DEV-046
Phase 3A.0 production baseline for `jenfu-ai-pdm-prod`, but all Google
resources remain gated by `local.create_resources`. The default path creates
nothing.

## Covered Target

- Cloud Run `ai-pdm-prod` in `asia-east1`
- Cloud Run ingress `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`
- Cloud Run default URL disabled
- External Application Load Balancer with managed TLS and `pdm.jenfu.com.tw`
- Cloud SQL PostgreSQL `POSTGRES_17`, `REGIONAL`, private IP, IAM DB auth,
  backups, PITR and deletion protection
- Secret Manager containers for session-signing secrets, metadata only
- Firebase Authentication / Identity Platform as identity only
- USD 300 monthly cap and USD 240 credentialled-plan stop

## Gates

`local.create_resources` requires:

- exact acknowledgement `DEV-032-PRODUCTION-RESOURCE-CREATION-APPROVED`
- production target readback
- production env source review
- production Secret Manager metadata readback
- clean seed and allowlist approval
- `HD-8-4 / 1A` separate-target restore/reconciliation
- rollback readiness
- Level 3 production-like smoke plan
- estimated monthly cost at or below USD 240

## Validation

- `npm run qc:dev-032-production-iac-package`: 16/16 passed.
- `npm run dev-032:production-iac-terraform-validate`: passed with Docker
  Terraform 1.14.5.
  - `terraform fmt -check -diff -recursive`: passed.
  - `terraform init -backend=false -input=false -no-color`: passed.
  - `terraform validate -no-color -json`: valid, zero errors and zero warnings.
- `npm run qc:dev-032-production-iac-terraform-validate`: 12/12 passed.
- Local Terraform CLI is still not installed in the current shell; the above
  validation used the Docker executor against a copied workspace under
  `output/`. No credentialled `terraform plan`, `terraform apply`, import,
  deploy, migration, DNS update, traffic cutover or production smoke was run.

## Remaining Gate

After production project access exists, the next IaC step is a credentialled
plan review only. Stop on any delete/replace action, any estimate above USD 240
or any drift from `config/platform/production-target.template.json`.
