# DEV-032 Gate A/B Production Execution Record

Date: 2026-07-16
Status: Gate A complete; Gate B partial apply stopped, corrective plan pending re-auth

## Scope

- Project: `jenfu-ai-pdm-prod`
- Region: `asia-east1`
- Release slice: official numbering and draft creation only
- Database authority: Cloud SQL PostgreSQL
- File authority: disabled; no GCS file-workflow resource in the reviewed plan
- Monthly cap: USD 300
- Plan-review stop: USD 240

## Provenance

- Application source commit: `68b89f088b46a2e66b6949c177549f9e51054f7d`
- Application image: `asia-east1-docker.pkg.dev/jenfu-ai-pdm-prod/ai-pdm/ai-pdm@sha256:b4fb8e9ffd45da987cab42241811194b45556e4316bc52cbed04c7d0f768aaa3`
- Migration image: `asia-east1-docker.pkg.dev/jenfu-ai-pdm-prod/ai-pdm/ai-pdm-migration@sha256:e5909a392344a0908fadcb39fba4ebe5a17cf5b5d569fa22dbc58bcf1d129ed8`
- IaC commits after artifact build: `55fe1f6`, `43e2702`, `c6680d8`, `9d127e5`, `eac403d`

The application image remains tied to the exact application-source commit.
Later commits change production IaC, validation or migration/bootstrap tooling and
must be recorded separately from application artifact provenance.

## Gate A Evidence

- Billing linked and enabled.
- Firebase project, Identity Platform and production Web App created.
- Regional versioned Terraform state initialized and five pre-existing resources imported.
- Session-signing Secret Manager containers and enabled versions exist; values were generated through memory/stdin and were not read back.
- Credentialled saved plan: 53 create, 5 update, 0 delete, 0 replace.
- Cost estimate: USD 210, below the USD 240 stop.
- Plan contains no GCS/file-authority resource.
- Imported-resource updates were reviewed; the Google `_Default` logging filter is preserved.
- Terraform static validation: 12/12.
- Production IaC package QC: 18/18.

## Gate B Partial Apply

The reviewed saved plan was applied once and exited non-zero. Terraform evidence
shows successful creation or update of the principal substrate, including:

- private VPC, subnet and private service networking
- Regional HA Cloud SQL PostgreSQL instance, database and IAM database users
- runtime and migration service accounts and IAM grants
- Cloud Run application service and private migration Job
- serverless NEG, HTTP redirect path, global address and managed certificate
- Identity Platform configuration
- regional application log bucket and `_Default` sink destination
- monitoring alert policies and session-secret access grants

Four errors closed the apply with a non-zero result:

1. Two backend-service long-running operation polls returned 401 after the short-lived user token expired.
2. Billing Budget rejected USD because the approved billing account is denominated in TWD.
3. Cloud KMS rejected automatic rotation for an `ASYMMETRIC_SIGN` key.

The Budget contract is corrected to TWD 9,600 while retaining the USD 300 cap
and USD 240 plan-review stop. The signing key now uses manual key-version
rotation. Credentials expired before authoritative state/cloud readback, so no
corrective apply is allowed until re-auth, discovery and import reconciliation.

## Gate C Preparation

- Production Cloud SQL migration package contains 18 ordered schema migrations and excludes Supabase RLS plus Phase 3B GCS pointers.
- Production principal bootstrap uses the new stable PDM ID `prod-pdm-admin-001`.
- A verified production Firebase UID is mandatory; staging and template UIDs fail closed.
- Bootstrap remains passwordless, transactional, idempotent and collision-fail-closed.
- Canonical role/permission matrix is 9 roles and 237 permissions.
- Production principal bootstrap QC: 9/9.
- Production migration package QC: 10/10; staging regression remains 25/25.

No admin bootstrap, schema migration, seed, principal mapping, production
numbering write, DNS change or Level 4 smoke has been executed.

## Resume Order

1. Re-authenticate Google CLI once.
2. Read Terraform state and live cloud resources.
3. Import any backend service completed after token expiry but missing from state.
4. Produce a new corrective plan; stop on delete, replace, scope drift or cost above USD 240.
5. Apply only that reviewed corrective plan and complete Gate B readback.
6. Continue Gate C backup, privileged role bootstrap, schema migration twice, clean seed, restore and reconciliation.

Evidence paths:

- `output/dev-032-production-terraform-plan/review-summary.json`
- `output/dev-032-production-terraform-plan/apply-summary.json`
- `output/dev-032-production-terraform-plan/apply.txt`
- `output/dev-032-production-iac-terraform-validate/report.json`
- `output/dev-032-cloudsql-migration-package/`
- `output/dev-032-production-principal-bootstrap/`
