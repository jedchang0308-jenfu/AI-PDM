# CHG-DEV046-PHASE2B-20260714

Date: 2026-07-14  
DEV: `DEV-046` Phase 2B isolated staging  
Risk lane: Lane 3  
Approval status: Approved with constraints  
Execution status: Cost stop cleared by `HD-10-1 / 1A`; controlled Phase 2B staging runtime infrastructure applied

## Approval Record

The user explicitly approved DEV-046 Phase 2B staging resource creation with these non-waivable constraints:

- Monthly budget cap: USD 300.
- Stop before apply when the reviewed plan forecast exceeds USD 240.
- Stop before apply when Terraform proposes any deletion or replacement.
- Scope is isolated AI_PDM staging only; no production, public DNS cutover, ProJED change or Phase 3B GCS file authority.

The approval is recorded in `config/platform/staging-preflight.template.json`. The template keeps `resourceCreationEnabled` and `terraformApplyAllowed` false by default; actual apply required explicit environment variables, the approved `CHG-*` ticket and the exact Phase 2B acknowledgement.

## Cost Gate Result

The stop condition is already true before a credentialled Terraform plan:

- Existing repository planning allowances total USD 300/month.
- Excluding the deferred USD 20 Phase 3B GCS file-authority allowance leaves a Phase 2B/3A staging forecast of USD 280/month.
- The known fixed list-price floor is approximately USD 191.60/month: USD 173.35 for regional-HA Cloud SQL compute plus 20 GiB SSD, and USD 18.25 for the first-five global forwarding-rule tier.
- Cloud Run usage, Cloud SQL backup overage, Logging/Monitoring, Cloud Build, Artifact Registry, Secret Manager, Firebase Identity Platform and network/data processing remain variable additions.

Because USD 280 exceeds the approved USD 240 plan-review stop, `COST_FORECAST_EXCEEDS_PLAN_REVIEW_STOP` blocks credentialled plan/apply and resource creation.

## Cost Gate Resolution

On 2026-07-14 the user selected option A, recorded as `HD-10-1 / 1A`: staging changes from Regional HA to single-zone `ZONAL`, while production remains Regional HA. Taiwan list-price calculation for `db-custom-1-3840` plus 20 GiB SSD is approximately USD 86.67 per 730-hour month; the budget assigns USD 90 including backup allowance. The revised conservative Phase 2B/3A forecast is USD 210, below the USD 240 stop.

`COST_FORECAST_EXCEEDS_PLAN_REVIEW_STOP` is therefore closed. This does not authorize deletion/replacement and does not itself satisfy the remote-state, provider, secret, credentialled-plan, migration or runtime-smoke gates.

Pricing references reviewed on 2026-07-14:

- https://cloud.google.com/sql/pricing
- https://cloud.google.com/vpc/pricing
- https://cloud.google.com/run/pricing
- https://cloud.google.com/products/calculator

## Mutation Evidence

- Google account and ADC authentication were verified read-only.
- Organization and Billing Account discovery were read-only.
- Initial cost-stop evaluation created no cloud resources. After `HD-10-1 / 1A` cleared cost, the approved bootstrap created project `jenfu-ai-pdm-stg-361825`, linked Billing Account `018678-C2F032-7680E4`, and created state bucket `jenfu-ai-pdm-stg-361825-tfstate` in `ASIA-EAST1` with uniform access, public access prevention, versioning and 30-day soft delete.
- Isolated Docker Terraform 1.14.5 initialized and read the empty GCS backend using an ephemeral access token. No credential was written to the repository or mounted from the user gcloud configuration.
- No Firebase app, Cloud SQL instance, Cloud Run service, load balancer, application secret, IAM runtime binding, budget, DNS record, migration or deployment was created. No Terraform plan/apply/import/destroy/delete/replacement was executed.

Subsequent approved bootstrap evidence: one Firebase Web App was created without Analytics/Firestore/Storage/Hosting data resources, and its public API key was restricted to Auth APIs and approved referrers. Terraform then applied exactly two Secret Manager container creates and two in-place deletion-protection updates, with zero destroys/replacements. Two distinct session-signing versions were streamed from memory to Secret Manager; values were neither printed nor persisted locally. On 2026-07-14 the user enabled the Google provider; Identity Toolkit Admin REST verified `google.com` as enabled without storing OAuth secret material in Terraform. Two email Monitoring notification channels were created for the named primary and backup responders.

Runtime infrastructure evidence on 2026-07-14:

- `_Default` log sink imported into remote state before management.
- Artifact Registry repository `ai-pdm` created and image digest `sha256:cf36fa4f6bc68a59db7f632dd9c7df3e81b84ac28cf7c5a5a11034408d7920c3` pushed.
- Cloud SQL `ai-pdm-stg-postgres` created in `asia-east1`, private IP only, `ZONAL`, PITR enabled, IAM database users created.
- Cloud Run `ai-pdm-stg` created with default URL disabled, LB-only ingress, Cloud SQL proxy sidecar, digest-pinned image and `/login` startup probe passed.
- External HTTP/HTTPS Application Load Balancer created at `136.68.130.84`; HTTP redirect smoke returned 301.
- Budget `AI PDM staging monthly budget` created for project `1042387036944`, TWD 9600, 50/80/100 thresholds. Billing account currency is TWD, so the API budget uses TWD while the user approval remains USD 300 maximum.
- The final applied plan `phase2b-full-recovery-v5` had 6 adds, 2 in-place changes, 0 deletes and 0 replacements. A follow-up Terraform detailed plan returned `No changes`.
- DNS was not mutated. `pdm-stg.jenfu.com.tw` currently returns NXDOMAIN and the managed certificate reports `FAILED_NOT_VISIBLE`. On 2026-07-15 the user decided not to configure public staging DNS for short-term internal use; this changes public DNS/TLS into a deferred external gate, not a passed smoke result. Internal pilot still requires a browser-accessible HTTPS entrypoint before runtime/user smoke can be claimed.

## Re-entry Gate

The cost-strategy decision is complete through `HD-10-1 / 1A`, and Phase 2B staging runtime infrastructure, admin bootstrap and Cloud SQL live migration are complete. Remaining current internal-pilot acceptance blockers are internal HTTPS entrypoint, runtime smoke and staging principal mapping. Public DNS A record / managed TLS active evidence is deferred until public staging is requested. Any next credentialled plan/apply still uses the same stop rules: stop on forecast above USD 240, any delete/replace, or scope drift.

2026-07-15 update: the Cloud SQL migration package is now generated as proposal-only local evidence in `output/dev-046-cloudsql-migration-package/` and passed focused QC 22/22. A separate proposal-only runner readiness report in `output/dev-046-cloudsql-migration-runner-package/`, dry-run-first executor/Docker target and review-only Cloud Run Job IaC now exist for local review. The migration-runner image was built from the current working-tree snapshot, local container dry-run smoke passed with `connectionAttempted=false`, and digest `asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm-migration@sha256:8794eae1ff71807dd69166f8db2e81b42f99ecbc79911271b48e7a1ff7dc1a1c` was pushed to Artifact Registry. Credentialled Terraform Docker plan review produced `output/dev-046-migration-runner-plan/phase2b-migration-runner.tfplan` with exactly 1 add (`google_cloud_run_v2_job.migration_runner[0]`), 0 update, 0 delete and 0 replace. After separate approval, Terraform applied only that saved plan and created Cloud Run Job `ai-pdm-stg-migration-runner`; apply evidence in `output/dev-046-migration-runner-plan/apply-summary.json` records 1 add, 0 change and 0 destroy, and `cloud-run-job-executions.json` returned an empty execution list. The Cloud Run Job remains dry-run only and has not been executed. There is still no approved admin bootstrap path, live migration or runtime smoke. It is not approved for live apply. The migration blocker remains open until package review is accepted, admin bootstrap runs, schema migration succeeds, runtime smoke passes and principal mappings are verified.

2026-07-15 live migration closure: the user separately approved admin bootstrap and live migration. On-demand backup `1784085929277` succeeded before mutation. Admin bootstrap then succeeded through a temporary, access-controlled Cloud SQL import bucket that was deleted afterward. Successful Cloud Run execution `ai-pdm-stg-migration-runner-k5pg9` applied 18 intended versions; immediate execution `nkrhj` applied zero versions. Two failed migration attempts and one failed bootstrap attempt were transaction-safe and are retained in `output/dev-046-live-migration/execution-summary.json`. The Job was restored to the reviewed dry-run image and live approval environment values were removed. No fresh Terraform apply, runtime smoke or principal mapping was performed. Remaining internal-pilot blockers are internal HTTPS entrypoint, runtime smoke and principal mapping; the USD 300 cap, USD 240 plan stop and delete/replace stop remain unchanged for future mutations.
