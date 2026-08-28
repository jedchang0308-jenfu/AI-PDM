# DEV-046 Cloud SQL Migration Runner Readiness Contract

Status: blocked_runner_not_ready

## Current Result

- Readiness: blocked_runner_not_ready
- Live migration allowed: false
- Cloud Run Job IaC present: true
- Cloud Run Job apply executed: true
- Cloud Run Job execution requested: true
- Cloud Run Job dry-run only: true
- Migration-capable image present: true

## Required Runner Shape

- Use a reviewed Cloud Run Job or equivalent one-shot runner attached to the staging VPC.
- Run as the dedicated migration service account, not the normal app runtime service account.
- Reach Cloud SQL through private IP and Cloud SQL Auth Proxy or an equivalent connector with automatic IAM database authentication.
- Package the reviewed migration manifest and SQL artifacts immutably with the runner image or reviewed execution artifact.
- Keep the web Cloud Run service image and command separate from live migration execution.
- Keep admin bootstrap, schema migration, runtime grant refresh, runtime smoke and principal mapping as ordered gates.

## Forbidden Shortcuts

- Do not apply `db/postgres/*.sql` directly to Cloud SQL.
- Do not use static database passwords, service-account keys, public Cloud SQL IP, local private-IP tunneling, browser-direct DB access or Firebase data triggers.
- Do not run or repeat live migration without explicit approval and a reviewed immutable artifact.

## Current Blockers

- STAGING_CLOUD_RUN_JOB_APPLY_EVIDENCE_MISSING
- STAGING_CLOUD_RUN_JOB_EXECUTION_UNAPPROVED
- STAGING_ADMIN_BOOTSTRAP_PATH_NOT_APPROVED
