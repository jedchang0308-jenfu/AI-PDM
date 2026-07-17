# DEV-046 Migration Runner Apply Verification

Generated at: 2026-07-15T03:08:15.978Z
Result: apply_verified_job_created_not_executed

## Job

- Name: ai-pdm-stg-migration-runner
- UID: a9ccf1a1-6205-424f-8f7b-83310328fec8
- Resource ID: projects/jenfu-ai-pdm-stg-361825/locations/asia-east1/jobs/ai-pdm-stg-migration-runner
- Image: asia-east1-docker.pkg.dev/jenfu-ai-pdm-stg-361825/ai-pdm/ai-pdm-migration@sha256:8794eae1ff71807dd69166f8db2e81b42f99ecbc79911271b48e7a1ff7dc1a1c
- Service account: pdm-migration-stg@jenfu-ai-pdm-stg-361825.iam.gserviceaccount.com
- Main args: scripts/run-dev-046-cloudsql-migrations.mjs --dry-run
- Proxy args include: --private-ip, --auto-iam-authn

## Apply

- Applied plan: output/dev-046-migration-runner-plan/phase2b-migration-runner.tfplan
- Terraform result: 1 added, 0 changed, 0 destroyed
- Apply log: output/dev-046-migration-runner-plan/terraform-apply.log
- Job describe: output/dev-046-migration-runner-plan/cloud-run-job-describe.json
- Job executions readback: output/dev-046-migration-runner-plan/cloud-run-job-executions.json, 0 executions observed

## Boundary

- Terraform apply was executed only against the reviewed saved plan.
- Cloud Run Job execution was not requested.
- Cloud Run Job executions list returned 0 executions.
- Admin bootstrap was not executed.
- Live migration was not executed.
- Runtime smoke was not executed.

## Acceptance

- jobExists: true
- imageDigestMatchesPlan: true
- dryRunOnly: true
- noLiveApprovalEnvInJob: true
- migrationServiceAccount: true
- privateIamProxy: true
- noJobExecutionRequested: true
- noJobExecutionObserved: true
- applyWasPlanOnlyCreate: true
