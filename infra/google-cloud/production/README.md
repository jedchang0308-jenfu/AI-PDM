# DEV-032 production Terraform review package

Status: review package only. This directory does not authorize `terraform apply`,
production resource creation, production migration, DNS change, traffic cutover,
or production smoke.

This package models the intended DEV-032 / DEV-046 Phase 3A.0 production
target after the release gates close:

- Project: `jenfu-ai-pdm-prod`
- Region: `asia-east1`
- Runtime: Cloud Run `ai-pdm-prod`, default `run.app` URL disabled
- Pilot edge: Firebase Hosting default site `jenfu-ai-pdm-prod.web.app` rewrites
  to the existing Cloud Run service. The external Application Load Balancer,
  managed TLS resource and `pdm.jenfu.com.tw` remain provisioned but DNS is
  intentionally deferred and they are not the current browser entrypoint.
- Database: Cloud SQL for PostgreSQL `POSTGRES_17`, `REGIONAL`, private IP,
  IAM DB auth, backups, PITR and deletion protection
- Identity: Firebase Authentication with Identity Platform only
- Auth handler and canonical pilot origin: `jenfu-ai-pdm-prod.web.app`.
  `jenfu-ai-pdm-prod.firebaseapp.com` remains an authorized Firebase domain.
- Secrets: Secret Manager containers only; values are never stored here
- Logs and signing: regional application-log bucket and HSM-backed numbering
  ledger signing key
- File authority: GCS remains disabled for Phase 3A

Terraform state is isolated at
`gs://jenfu-ai-pdm-prod-tfstate/ai-pdm/production`; the bucket uses regional
placement, uniform access, public-access prevention, versioning and 30-day soft
delete. Initialize it with `backend.production.hcl.example`.

## Hard Gates

`local.create_resources` remains false unless all of these are true:

1. `enable_resource_creation = true`
2. `production_apply_acknowledgement =
   "DEV-032-PRODUCTION-RESOURCE-CREATION-APPROVED"`
3. production target readback is approved
4. production environment source is approved
5. production Secret Manager metadata readback is approved
6. estimated monthly cost is at or below the USD 240 plan-review stop

Clean seed/allowlist, `HD-8-4 / 1A` restore/reconciliation, rollback readiness
and Level 3 smoke remain mandatory post-apply release gates. They cannot be
preconditions for creating the empty Cloud SQL and runtime resources they must
validate. Terraform exposes them as `post_apply_release_gates_ready`; Gate D
must remain closed until all four pass.

The reviewed monthly cap remains USD 300. The approved Billing Account is
denominated in TWD, so the API budget is TWD 9,600. Any credentialled plan above USD 240,
any delete/replace action, or any drift from `config/platform/production-target.template.json`
must stop before apply.

The asymmetric numbering-ledger signing key uses reviewed manual key-version
rotation because Google Cloud KMS does not support automatic rotation schedules
for `ASYMMETRIC_SIGN` keys.

The private migration Job is created only with
`DEV-032-PRODUCTION-MIGRATION-JOB-REVIEWED` and remains dry-run by default.
Switching the Job to live execution requires the separate
`DEV-032-PRODUCTION-CLOUDSQL-MIGRATION-APPROVED` acknowledgement after the
database admin bootstrap has completed.

After schema migration and its immediate idempotent rerun pass, the same Job
may be switched to the production principal bootstrap runner. That transition
requires a verified production Firebase UID, exact image source revision and
`DEV-032-PRODUCTION-PRINCIPAL-BOOTSTRAP-APPROVED`; template or staging UIDs
remain fail-closed.

After schema and principal readback pass, the same Job may run the strictly
read-only reconciliation runner in `pre_canary`, `post_smoke` or `restore`
mode. The three live Job modes are mutually exclusive. Every reconciliation
run requires `DEV-032-PRODUCTION-RECONCILIATION-READONLY-APPROVED` and the exact
image source revision. `restore` additionally requires readback of a separate
`ai-pdm-prod-restore-*` Cloud SQL instance; the source instance cannot be used
as a restore target.

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

- Do not use any Firebase Hosting site except `jenfu-ai-pdm-prod`, and do not
  add Firebase Functions, Callable, Firestore, Firebase Storage or business
  logic to the Hosting layer.
- Do not treat the direct `run.app` endpoint as a canonical browser origin.
  Its requests may load the shell, but same-origin session exchange must remain
  pinned to `https://jenfu-ai-pdm-prod.web.app`.
- Do not use staging project, staging Cloud Run, staging Cloud SQL or staging
  secrets.
- Do not store secret values, Firebase private keys, database passwords or
  service-account keys.
- Do not enable GCS file authority in Phase 3A.
- Do not apply this package until DEV-032 gates and explicit production
  authorization are recorded.
