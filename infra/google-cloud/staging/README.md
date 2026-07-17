# DEV-046 Phase 2B staging IaC

Status: Phase 2B staging resources created on 2026-07-14 under
`CHG-DEV046-PHASE2B-20260714`. Terraform state is remote in the approved
staging state bucket, the latest drift plan is clean, and no destroy/replace
action was accepted. On 2026-07-15 the user deferred public staging DNS for
short-term internal use and selected the Firebase Hosting default domain as a
staging-only HTTPS gateway. `pdm-stg.jenfu.com.tw` is not live and the managed
TLS certificate remains a deferred external gate, not a passed smoke result.
The same day, separately approved admin bootstrap and live Cloud SQL migration
completed; the immediate second migration run applied zero versions.

## Safety boundary

- Every Google resource is fail-closed. Runtime resources use
  `local.create_resources`; the two empty signing-secret containers may use the
  independently approved `local.secret_bootstrap_ready` gate.
- `enable_resource_creation` defaults to `false`.
- Resource creation additionally requires real target values, verified alert
  channels, an approved `CHG-*` ticket and the exact Phase 2B acknowledgement.
- The GCS backend has no embedded bucket. Backend initialization is impossible
  until an approved existing state bucket is supplied out of band.
- The approved remote backend is
  `gs://jenfu-ai-pdm-stg-361825-tfstate/ai-pdm/staging`.
- Cloud SQL and Cloud Run use deletion protection. Staging Cloud SQL has private
  IP, single-zone availability, automated backups, PITR and IAM database
  authentication. Production retains the separate regional-HA requirement.
- No database password, service-account key, OAuth client secret or secret value
  belongs in Terraform variables or state.
- Formal file buckets and GCS runtime integration are intentionally absent;
  they remain DEV-046 Phase 3B scope.

## Review-only commands

The Phase 2A checks are local and do not read Google credentials:

```text
npm run preflight:dev-046-phase2a
npm run qc:dev-046-phase2a
```

Terraform formatting and validation may run in an isolated local container with
backend initialization disabled. Do not run plan/apply/import, do not pass ADC,
and do not mount the user gcloud configuration during Phase 2A.

## Phase 2B blockers

The existing `_Default` Logging sink has been imported into the reviewed remote
state before being managed; attempting to create another `_Default` sink remains
forbidden.
The Google Workspace Identity Platform provider was configured through the
Firebase Console and verified by Identity Toolkit Admin REST evidence. It stays
out of Terraform because the provider resource stores the OAuth client secret in
state.

Created Phase 2B resources:

- Cloud SQL `ai-pdm-stg-postgres`, private IP only, `asia-east1`, single-zone
  staging, PITR enabled, IAM database users.
- Cloud Run `ai-pdm-stg`, image pinned by digest. Its normal baseline disables
  the default URL and uses load-balancer-only ingress. The current staging-only
  Firebase Hosting exception enables all ingress and the default URL because
  Hosting rewrites require an unauthenticated Cloud Run endpoint.
- External HTTP/HTTPS Application Load Balancer on `136.68.130.84`.
- Billing budget `AI PDM staging monthly budget`, TWD 9600, 50/80/100
  thresholds, scoped to project number `1042387036944`.

Current internal-pilot acceptance blockers:

- Create/verify real staging principal mappings for the pilot users.
- Produce a reviewed application artifact from an exact source revision. The
  deployed immutable image predates at least the employee-login-intent route,
  so Hosting/runtime smoke cannot be promoted to full application acceptance.

Completed 2026-07-15 entrypoint/runtime evidence:

- Firebase Hosting live URL:
  `https://jenfu-ai-pdm-stg-361825.web.app`, version
  `c61e4ebfa2556848`.
- Cloud Run revision `ai-pdm-stg-00003-vz4`; Terraform apply result 0 added,
  1 changed, 0 destroyed and 0 replaced.
- Live login, Firebase BFF mode, private/no-store headers, direct `run.app`
  origin denial and a read-only Cloud SQL runtime query passed 6/6.
- Evidence is under `output/dev-046-firebase-hosting/`.
- The public `run.app` shell is an accepted staging residual risk and bypasses
  Hosting headers. Production still requires ALB-only ingress, disabled default
  URL, managed TLS and the production custom domain.

Do not apply `db/postgres/*.sql` directly to Cloud SQL. The reviewed execution
used the generated Cloud SQL-specific package, which excludes Supabase-only RLS
and Phase 3B GCS pointer migrations, through the private VPC-attached runner.

Local migration-package preflight:

```text
npm run dev-046:cloudsql-migration-package
npm run qc:dev-046-cloudsql-migration-package
```

The generator remains local-only and writes
`output/dev-046-cloudsql-migration-package/cloudsql-migration-manifest.json`,
`runner-contract.md` and candidate SQL files. It intentionally excludes the
Supabase RLS baseline and deferred Phase 3B GCS pointer migration from the
current no-file internal-pilot slice. The generated manifest never grants live
approval by itself; separate approval and execution evidence are recorded in
`output/dev-046-live-migration/execution-summary.json`.

Local migration-runner preflight:

```text
npm run dev-046:cloudsql-migration-runner-package
npm run qc:dev-046-cloudsql-migration-runner-package
```

This writes `output/dev-046-cloudsql-migration-runner-package/report.json` and
`migration-runner-contract.md`. It reads durable execution evidence but performs
no Cloud SQL, Cloud Run, Terraform or gcloud action. The repository contains a
separate Docker target, dry-run-first executor and Cloud Run Job IaC. After the
approved migration, the live Job was restored to the reviewed dry-run image and
contains no live approval environment values:

```text
npm run dev-046:cloudsql-migration-runner:dry-run
docker build --target migration-runner .
```

The executor refuses live mode unless explicit DEV-046 staging approval and
admin-bootstrap confirmation environment values are present. Do not repeat
`--execute`, change the Job, or run another bootstrap/migration without a new
explicit approval and reviewed immutable artifact.

2026-07-15 plan-review evidence:

- Migration-runner image digest:
  `asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm-migration@sha256:8794eae1ff71807dd69166f8db2e81b42f99ecbc79911271b48e7a1ff7dc1a1c`.
- Local container dry-run smoke passed with `connectionAttempted=false`.
- Credentialled Terraform Docker plan output:
  `output/dev-046-migration-runner-plan/phase2b-migration-runner.tfplan`.
- Machine summary:
  `output/dev-046-migration-runner-plan/plan-summary.json`.
- Plan review result: 1 actionable add,
  `google_cloud_run_v2_job.migration_runner[0]`; 0 update, 0 delete, 0
  replace.
- Saved-plan apply result:
  `output/dev-046-migration-runner-plan/terraform-apply.log` shows 1 added, 0
  changed, 0 destroyed.
- Created Cloud Run Job:
  `projects/jenfu-ai-pdm-stg-361825/locations/asia-east1/jobs/ai-pdm-stg-migration-runner`.
- Apply verification:
  `output/dev-046-migration-runner-plan/apply-summary.json` confirms the job
  uses the reviewed digest, migration service account, `--dry-run` command and
  private IAM Cloud SQL proxy.
- Cloud Run executions readback:
  `output/dev-046-migration-runner-plan/cloud-run-job-executions.json` returned
  an empty list immediately after the original Job-creation apply.

2026-07-15 live migration evidence:

- On-demand pre-migration backup `1784085929277` completed successfully and is
  retained.
- Admin bootstrap completed through Cloud SQL SQL import without a static
  database password or public IP.
- Execution `ai-pdm-stg-migration-runner-k5pg9` applied all 18 intended schema
  versions; `ai-pdm-stg-migration-runner-nkrhj` immediately applied zero.
- Successful OCI index digest:
  `sha256:e473f36a28d000bbb5982088a6a5755a76e686b366986cea339473085916ee90`;
  Cloud Run resolved manifest:
  `sha256:67ba9509b21f06b0ef8a5b4139fa63eb3b94d661c88f812801338cb2d2c86070`.
- Full attempts, rollback facts, hashes, cleanup and post-execution Job posture:
  `output/dev-046-live-migration/execution-summary.json`.
- Runtime smoke passed through the application runtime identity. Principal
  mapping and exact-source artifact provenance/drift evidence remain blockers.

Deferred external gate:

- If public staging is later needed, create DNS A record
  `pdm-stg.jenfu.com.tw -> 136.68.130.84`, then wait for the managed
  certificate to move from `FAILED_NOT_VISIBLE` to active before claiming
  public HTTPS smoke.

The Firebase BFF application path and Firebase-managed email-link invitation
flow are implemented locally after Phase 2A. The runtime Firebase Authentication
Admin role is limited to the dedicated staging service account and is required
for reviewed user provisioning, deny-first disable/revoke and compensation. Live
staging has approved Firebase project/web-app values and Google provider
configuration. It still needs real account-mapping evidence.

The two Secret Manager containers and strong current/previous signing-key
versions were created through their approved gate. Secret values and versions
remain outside Terraform configuration and state.
