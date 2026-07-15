# DEV-032 production Terraform review package

Status: review package only. This directory does not authorize `terraform apply`,
production resource creation, production migration, DNS change, traffic cutover,
or production smoke.

This package models the intended DEV-032 / DEV-046 Phase 3A.0 production
target after the release gates close:

- Project: `jenfu-ai-pdm-prod`
- Region: `asia-east1`
- Runtime: Cloud Run `ai-pdm-prod`, default `run.app` URL disabled
- Edge: external Application Load Balancer, managed TLS, custom domain
  `pdm.jenfu.com.tw`
- Database: Cloud SQL for PostgreSQL `POSTGRES_17`, `REGIONAL`, private IP,
  IAM DB auth, backups, PITR and deletion protection
- Identity: Firebase Authentication with Identity Platform only
- Secrets: Secret Manager containers only; values are never stored here
- File authority: GCS remains disabled for Phase 3A

## Hard Gates

`local.create_resources` remains false unless all of these are true:

1. `enable_resource_creation = true`
2. `production_apply_acknowledgement =
   "DEV-032-PRODUCTION-RESOURCE-CREATION-APPROVED"`
3. production target readback is approved
4. production environment source is approved
5. production Secret Manager metadata readback is approved
6. clean seed and allowlist package is approved
7. `HD-8-4 / 1A` separate-target restore/reconciliation is approved
8. rollback readiness is approved
9. Level 3 production-like smoke plan is approved
10. estimated monthly cost is at or below the USD 240 plan-review stop

The reviewed monthly cap remains USD 300. Any credentialled plan above USD 240,
any delete/replace action, or any drift from `config/platform/production-target.template.json`
must stop before apply.

## Allowed Local Commands

Without production credentials:

```powershell
npm run qc:dev-032-production-iac-package
npm run dev-032:production-iac-terraform-validate
npm run qc:dev-032-production-iac-terraform-validate
```

The Terraform validation command uses Docker Terraform 1.14.5 against a copied
workspace under `output/`; it runs `fmt -check`, `init -backend=false` and
`validate -json` only. It is not a credentialled plan.

After explicit release-gate approval and target access, a future operator may
run a credentialled `terraform plan` for review only.

A plan file is not an apply approval.

## Prohibited

- Do not use Firebase Hosting or `web.app` as the production gateway.
- Do not use staging project, staging Cloud Run, staging Cloud SQL or staging
  secrets.
- Do not store secret values, Firebase private keys, database passwords or
  service-account keys.
- Do not enable GCS file authority in Phase 3A.
- Do not apply this package until DEV-032 gates and explicit production
  authorization are recorded.
