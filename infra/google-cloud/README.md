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

The reviewed values live in `config/platform/cloud-run.contract.json`. Actual
Google project IDs, service accounts, domains and resources belong to Phase 2
and the deployment release gate.
