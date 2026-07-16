# DEV-032 Production Principal And Restore Reconciliation

Date: 2026-07-16
Target: `jenfu-ai-pdm-prod` / `asia-east1`
Status: principal bootstrap and HD-8-4 isolated restore reconciliation passed; authenticated Level 4 remains open

## Identity And Principal

- Identity Toolkit readback found exactly one verified production `google.com` user for `jedchang0308@jenfu.com.tw`.
- Firebase UID: `U57t2eIOzLdhAmNDUbFyOz3fdMm2`.
- Principal bootstrap created `prod-pdm-admin-001` with 9 roles and 237 permissions. No application password, TOTP secret or service-account key was stored.
- Cloud Run Job execution `ai-pdm-prod-migration-runner-95bn8` completed once with zero retries and `allChecksPassed=true`.
- The runner package hashes matched a clean `git archive` of source revision `b22955c16fbbb4e4a8547f748e01afbdc8ca0274`. The local Windows checkout hash difference was traced to CRLF normalization and was not accepted as provenance evidence.

## Source Reconciliation

- IaC removed an explicit `CLOUD_RUN_JOB` environment variable because Cloud Run reserves and injects that name. Runner-side job-name validation remains enabled.
- New saved plan: 0 create, 1 in-place Job update, 0 delete, 0 replace.
- Pre-canary execution: `ai-pdm-prod-migration-runner-2szd5`; one successful task, zero retries.
- Readback passed 18 migrations, 1 company, 1 active Admin, 9 roles and 237 permissions.
- Roots, parts, drawings, legacy drafts and workspaces were all zero. Collision, reuse, sequence regression, orphan, stale receipt and GCS-evidence checks were all zero.
- Source numbering snapshot SHA-256: `81f983ce4f3ed580d71f1cdef70cfbade83d860498a4310a1a61c11e997c1f57`.

## Recovery Point And Isolated Restore

- Post-principal on-demand recovery point `1784162806569` completed with `SUCCESSFUL` status.
- Restore target: `ai-pdm-prod-restore-20260716a`; connection name `jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-restore-20260716a`.
- The target is separate from the source, `POSTGRES_17`, zonal `db-f1-micro`, 20 GiB SSD, private IP only, backup disabled and storage auto-resize disabled.
- The target adds about USD 14.5/month equivalent while retained. Combined with the reviewed USD 210 production estimate, the temporary total is about USD 224.5, below the USD 240 stop line.
- Restore operation `3cf621be-4b2f-4788-b7c7-99e000000025` completed against the isolated target. The source `ai-pdm-prod-postgres` remained `RUNNABLE` and was not restored over or restarted by this operation.
- Restore reconciliation execution `ai-pdm-prod-migration-runner-9ss25` completed once with `allChecksPassed=true`.
- Restore counts matched the source and the restore numbering snapshot SHA-256 exactly matched `81f983ce4f3ed580d71f1cdef70cfbade83d860498a4310a1a61c11e997c1f57`.

## Safe Posture

- The migration runner was returned to `scripts/run-dev-046-cloudsql-migrations.mjs` without `--execute`.
- Principal bootstrap, live migration and reconciliation execution flags are false; execution acknowledgements and restore connection input are cleared.
- Final Terraform plan reported `No changes`.
- The isolated restore target is retained as evidence. Deletion is not implied by this report and requires an explicit cleanup decision.

## Remaining Release Gate

- Complete interactive Google login at `https://jenfu-ai-pdm-prod.web.app` after the principal bootstrap.
- Run authenticated Level 4 for privacy acknowledgement, production-slice permissions, official numbering, optional series code, draft persistence, re-login persistence and disabled file/CAD paths.
- Confirm the final named 3-5 user canary allowlist and a non-allowlisted denial case. Do not guess additional identities.
