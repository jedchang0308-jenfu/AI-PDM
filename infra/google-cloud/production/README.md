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
  to the existing Cloud Run service. DEV-069 removes the unused external
  Application Load Balancer, managed TLS resource and reserved edge IPv4;
  `pdm.jenfu.com.tw` remains a deferred re-entry decision.
- Database: Cloud SQL for PostgreSQL `POSTGRES_17`, `db-f1-micro`, `ZONAL`,
  private IP, IAM DB auth, backups, PITR and deletion protection. This prelaunch
  topology has no database SLA and must be upsized before general availability.
- Identity: Firebase Authentication with Identity Platform only
- Auth handler and canonical pilot origin: `jenfu-ai-pdm-prod.web.app`.
  `jenfu-ai-pdm-prod.firebaseapp.com` remains an authorized Firebase domain.
- Candidate release origin: the fixed Cloud Run `candidate` tag is authorized
  for OAuth and remains at 0% production traffic; each candidate deployment
  moves that tag to the new immutable revision.
- Runtime boundary: server-only `PDM_PRODUCTION_SLICE_MODE` is fixed to
  `official-numbering-draft`; unopened workflows remain UI disabled and API
  fail-closed.
- Secrets: Secret Manager containers only; values are never stored here
- Logs and signing: regional application-log bucket and HSM-backed numbering
  ledger signing key
- Runtime capacity: Cloud Run min 0 / max 2 per revision and PostgreSQL pool 2;
  two concurrent revisions plus migration reserve use at most 10 of the
  expected 25 connections.
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
and production-bound Candidate verification remain mandatory post-apply release
gates. Staging rehearsal cannot satisfy Candidate evidence. These gates cannot be
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

## Keyless GitHub Production Releases

The optional GitHub deployment identity is disabled by default. It is created
only when `enable_github_deployment_identity = true` and the separate
`DEV-032-PRODUCTION-GITHUB-WIF-DEPLOYMENT-APPROVED` acknowledgement is present
inside an otherwise approved production apply.

The OIDC provider accepts only repository ID `1260972060`, owner ID
`257207597`, `refs/heads/main`, the tracked `deploy-production.yml` workflow
and the GitHub `production` Environment. The deployer has no key and no Cloud
SQL, Secret Manager, Firebase Auth, project IAM or Terraform state role. Its
permissions are limited to pushing the application image, deploying a revision
of `ai-pdm-prod`, changing that service's traffic, and attaching the existing
runtime service account.

Terraform continues to own the full Cloud Run service. The application
container image is the one deliberate split-ownership field: the production
workflow updates it by immutable digest while Terraform ignores only that
nested image attribute. Every application release first deploys that exact
digest to a 0% Candidate revision. Production-only Auth/IAM/env/secrets,
data/migration readback, authenticated Level 4, Wave 0 and go/no-go checks apply
to that exact revision; their evidence reference is bound to its revision and
source commit, and staging evidence is rejected. Wave 0 may use either
`wave0_mode=tested` with 3–5 named Workspace users or an explicit
`wave0_mode=waived` risk-acceptance record bound to the same candidate revision
and source commit (`WAVE0-WAIVER://<candidate_revision>/<release_commit>/<immutable-id>`);
the waiver records that Wave 0 was not tested and does not satisfy Product Owner
go/no-go by itself. Candidate deployment never promotes traffic. A separate
promote dispatch rechecks provenance and approval, then Firebase Hosting at
`https://jenfu-ai-pdm-prod.web.app` receives canonical
smoke and automatic rollback protection after traffic activation.

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
- Do not remove, rename or expose `PDM_PRODUCTION_SLICE_MODE` through a
  `NEXT_PUBLIC_*` variable.
- Do not apply this package until DEV-032 gates and explicit production
  authorization are recorded.
