# Google Cloud deployment contract

This directory is a local DEV-046 Phase 1 contract. It does not provision,
deploy, enable billing, change DNS, or read Google credentials.

Production and staging releases must satisfy all of these gates:

1. Build `Dockerfile` from an exact Git commit and push the resulting image to
   Artifact Registry.
2. Resolve the application image to `...@sha256:<digest>` before deployment.
3. Deploy the candidate revision with zero traffic. Source deployment and
   branch-triggered production rollout are prohibited.
4. Route through an external Application Load Balancer and an `asia-east1`
   serverless NEG. The Cloud Run ingress policy must reject direct public use of
   the `run.app` endpoint.
5. Run the reviewed smoke suite against the tagged candidate revision, then
   promote traffic manually. Keep the previous known-good revision available
   for rollback.
6. Run Cloud SQL Auth Proxy as a localhost sidecar with private IP and automatic
   IAM database authentication. No service-account key file or static database
   password may be supplied.

The reviewed values live in `config/platform/cloud-run.contract.json`.
`infra/google-cloud/staging` is the Phase 2A fail-closed Terraform review
package. Its resource gate defaults to false and it has no approved backend,
credentials, targets or apply authority. Actual staging resources belong to
Phase 2B after all preflight blockers close; production remains under the
deployment release gate.

`infra/google-cloud/production` is the DEV-032 production Terraform review
package. It is source-controlled production release input, but it is not apply
authority. Its `local.create_resources` gate remains false until the exact
DEV-032 acknowledgement, production target/env/secret readback, clean
seed/allowlist, `HD-8-4 / 1A` restore/reconciliation, rollback readiness,
Level 3 smoke plan and USD 240 plan-review stop all pass. A credentialled plan
above USD 240, any delete/replace action, or any staging/Firebase Hosting
shortcut is a no-go.
