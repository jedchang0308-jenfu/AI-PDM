# DEV-046 Phase 2A staging preflight implementation report

Date: 2026-07-13
Scope: local reviewed IaC and no-credential preflight only
Result: implemented and locally QC-accepted
Release state: `blocked_expected`; no staging or production resource exists from this work

## Delivered

- Corrected the authority drift that still described Phase 1A-1E as unimplemented. Commit `ec68981` and the existing Phase 1 evidence remain the implementation authority; the focused suite was rerun at 86/86.
- Added `infra/google-cloud/staging` with Terraform 1.14.x and locked `hashicorp/google` 7.39.0.
- Modeled 37 Google resource blocks for required APIs, dedicated runtime/migration service accounts, private VPC, Cloud SQL regional HA/PITR/IAM DB auth, Cloud Run multi-container runtime, external ALB/managed TLS, immutable-only CDN, Identity Platform/TOTP, Secret Manager/KMS, regional application logs, monitoring and budget alerts.
- Added a multi-factor fail-closed gate. Defaults create zero resources; later creation requires real approved targets, notification channels, a `CHG-*` ticket and exact Phase 2B acknowledgement.
- Added `config/platform/staging-preflight.template.json`, machine-readable preflight and focused QC. The preflight never queries gcloud auth or ADC.
- Corrected Cloud SQL IAM to require both `roles/cloudsql.client` and `roles/cloudsql.instanceUser` for automatic IAM database login.

## Verification

- `npm run preflight:dev-046-phase2a`: local static checks 20/20; result `blocked_expected`; 23 blockers; zero cloud action.
- `npm run qc:dev-046-phase2a`: 20/20 passed.
- Terraform image: `hashicorp/terraform:1.14.5`, local image digest `sha256:96d2bc440714bf2b2f2998ac730fd4612f30746df43fca6f0892b2e2035b11bc`.
- `terraform init -backend=false`: passed without Google credentials and generated the provider lock.
- `terraform fmt -check -diff`: passed.
- `terraform validate -json`: valid, zero errors and zero warnings.

## Critical findings

- At Phase 2A execution time, the application had provider interfaces/fakes but no Firebase Admin/client adapter and no `firebase_bff` mode. Phase 2B local work has since resolved that application blocker; real Firebase provider configuration and live staging evidence remain blocked.
- Terraform Identity Platform provider configuration can persist OAuth client secrets in state. Phase 2A deliberately omits the Google IdP resource; Phase 2B needs a separate secret-safe setup procedure and evidence.
- The existing Logging `_Default` sink must be imported into approved remote state before Terraform manages it. A duplicate-create attempt is forbidden.
- Full direct-GCS file resources remain Phase 3B and are absent from this no-file staging package.

## Official implementation references reviewed

- Cloud Run multi-container startup/health ordering: https://cloud.google.com/run/docs/configuring/services/containers
- External Application Load Balancer with serverless NEG and restricted ingress: https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless
- Cloud SQL proxy/private connectivity: https://cloud.google.com/sql/docs/postgres/sql-proxy
- Cloud SQL IAM database authentication: https://cloud.google.com/sql/docs/postgres/iam-authentication
- Regionalized Logging buckets and `_Default` routing: https://cloud.google.com/logging/docs/regionalized-logs
- Terraform Google provider resources: https://registry.terraform.io/providers/hashicorp/google/7.39.0

## Not executed

No Google credential read, Terraform plan/apply/import, project or billing change, API enablement, IAM binding, resource creation, DNS/TLS activation, database migration, provider switch, user provisioning, data movement, deployment, production smoke, release action or ProJED modification occurred.
