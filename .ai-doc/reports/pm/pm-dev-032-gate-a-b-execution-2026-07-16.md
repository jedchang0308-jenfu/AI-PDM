# DEV-032 Gate A/B Production Execution Record

Date: 2026-07-16
Status: Gate A and Gate B complete; Gate C migration complete, principal/restore pending verified Firebase UID

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

## Gate B Closure

The original reviewed saved plan was applied once and exited non-zero after
partially creating the substrate. Recovery did not reuse that stale plan. The
two completed backend services were imported after a state backup, then a new
credentialled corrective plan was reviewed and applied.

- private VPC, subnet and private service networking
- Regional HA Cloud SQL PostgreSQL instance, database and IAM database users
- runtime and migration service accounts and IAM grants
- Cloud Run application service and private migration Job
- serverless NEG, HTTP redirect path, global address and managed certificate
- Identity Platform configuration
- regional application log bucket and `_Default` sink destination
- monitoring alert policies and session-secret access grants

The original partial apply stopped on four errors:

1. Two backend-service long-running operation polls returned 401 after the short-lived user token expired.
2. Billing Budget rejected USD because the approved billing account is denominated in TWD.
3. Cloud KMS rejected automatic rotation for an `ASYMMETRIC_SIGN` key.

The Budget contract is corrected to TWD 9,600 while retaining the USD 300 cap
and USD 240 plan-review stop. The signing key uses manual key-version rotation.
After re-auth, discovery and import reconciliation, the corrective saved plan
contained 5 create, 0 update, 0 delete and 0 replace actions. Apply completed
with 5 added, 0 changed and 0 destroyed. Post-apply readback and a subsequent
Terraform plan prove 58 managed resources with no drift.

## Gate C And D Progress

- Production Cloud SQL migration package contains 18 ordered schema migrations and excludes Supabase RLS plus Phase 3B GCS pointers.
- Mutation pre-backup `1784136240742` completed successfully.
- Privileged admin bootstrap and readback completed without static credentials.
- All 18 schema migrations applied; the immediate rerun applied zero migrations.
- The migration Job is restored to dry-run posture.
- Firebase Google provider is enabled and its OAuth metadata is present. The production user inventory remains empty, so the real Google UID cannot be fabricated.
- Production principal bootstrap will use stable PDM ID `prod-pdm-admin-001` only after the verified production Firebase UID exists; staging and template UIDs fail closed.
- Bootstrap remains passwordless, transactional, idempotent and collision-fail-closed.
- Canonical role/permission matrix is 9 roles and 237 permissions.
- Production principal bootstrap QC: 9/9.
- Production migration package QC: 10/10; staging regression remains 25/25.
- The exact application OCI index is deployed and its Cloud Run linux/amd64 child manifest is verified.
- The approved Workspace AAL1 pilot flag is active without claiming Workspace MFA/AAL2.
- Cloud Run v2 traffic-only rollback and restore passed; Terraform no-drift passed afterward.

No principal mapping, production numbering write, DNS change, isolated restore,
Level 3 HTTP smoke or Level 4 smoke has been executed. Those actions remain
blocked on Cloudflare DNS and the first verified Google sign-in.

## Resume Order

1. Add Cloudflare DNS-only `A pdm -> 136.69.102.146` and wait for managed TLS.
2. Sign in once with `jedchang0308@jenfu.com.tw` to create a verified production `google.com` Firebase identity.
3. Read the immutable Firebase UID and generate the collision-fail-closed principal package.
4. Apply principal seed, run pre-canary reconciliation, create an isolated restore target and run restore reconciliation.
5. Run Level 3/4 HTTP/UI, access-boundary, numbering, draft, persistence and file fail-closed smoke.

Evidence paths:

- `output/dev-032-production-terraform-plan/review-summary.json`
- `output/dev-032-production-terraform-plan/apply-summary.json`
- `output/dev-032-production-terraform-plan/apply.txt`
- `output/dev-032-production-iac-terraform-validate/report.json`
- `output/dev-032-cloudsql-migration-package/`
- `output/dev-032-production-principal-bootstrap/`
- `output/dev-032-production-auth-activation/summary.json`
- `output/dev-032-aal1-pilot-plan/post-apply-readback.json`
- `output/dev-032-rollback-drill/v2-api-closure.json`
