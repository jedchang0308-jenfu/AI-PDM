# DEV-032 Production Release Gate Preflight

Date: 2026-07-15
Owner: Dev PM / deployment-release-gate
Risk lane: Lane 3 High
Release scope under review: DEV-040 official numbering / draft production slice through DEV-046 Phase 3A.0

## Result

Status: blocked at pre-build gate. No production deploy, production migration, production seed, production restore, production allowlist rollout or production smoke was executed.

The local application slice remains a viable candidate for later release work, but DEV-032 cannot be marked release-ready because the release artifact, production target, production environment source, restore/reconciliation evidence and rollback path are not yet proven.

## Evidence Checked

- Source boundary:
  - Branch: `codex/pdm-lifecycle-unified-history`
  - Exact release commit: recorded in `output/dev-032-release-source/manifest.json`; this report intentionally avoids pinning a self-referential commit hash.
  - Worktree: source release boundary is exact; remaining dirty entries are generated evidence or staging-only config excluded by the manifest.
  - Follow-up classification: `.ai-doc/reports/pm/pm-dev-032-source-boundary-classification-2026-07-15.md`.
  - Current snapshot manifest: `output/dev-032-release-source/manifest.json`; unknown-risk paths `0`; exact snapshot SHA-256 is stored in the manifest and not repeated in PM docs to avoid self-referential source hashing.
  - Release-source commit plan: `output/dev-032-release-source/commit-plan.json`; included-source pathspec `output/dev-032-release-source/included-production-source.pathspec`; generated/staging exclusions `output/dev-032-release-source/excluded-generated-or-staging.pathspec`.
  - Release conclusion: dirty paths are classified, hashable and have a verified included-source pathspec. Included production-source paths have been committed into the current release-candidate HEAD; the manifest records the exact commit. Production build/deploy remains blocked by target, environment, restore/reconciliation, rollback and smoke gates.
- Google Cloud read-only target check:
  - Active project: `jenfu-ai-pdm-stg-361825`
  - Active account: `jedchang0308@jenfu.com.tw`
  - Reproducible preflight: `npm run preflight:dev-032-production-target`; report `output/dev-032-production-target-preflight/report.json`.
  - Production target contract: `config/platform/production-target.template.json`; template-only, production action allowed `false`, Firebase Hosting gateway forbidden, expected Cloud Run `ai-pdm-prod`, expected Cloud SQL `ai-pdm-prod-postgres`, required secret IDs `pdm-session-signing-current` and `pdm-session-signing-previous`.
  - Preflight status: `blocked_readonly_preflight`; production action performed `false`; blocker count `8`.
  - `gcloud projects describe jenfu-ai-pdm-prod`: permission denied or project does not exist.
  - `gcloud run services list --project jenfu-ai-pdm-prod --region asia-east1`: denied / invalid consumer.
  - `gcloud sql instances list --project jenfu-ai-pdm-prod`: project not found or deleted.
- Provider config:
  - `.firebaserc` defines only `staging = jenfu-ai-pdm-stg-361825`.
  - `firebase.json` points Hosting site `jenfu-ai-pdm-stg-361825` to Cloud Run `ai-pdm-stg`.
  - `infra/google-cloud/README.md` defines a production release contract but no applied production target.
- Production IaC review package:
  - `infra/google-cloud/production/` now contains a fail-closed Terraform review package for `jenfu-ai-pdm-prod`.
  - `npm run qc:dev-032-production-iac-package`: 15/15 passed.
  - All Google resources are gated by `local.create_resources`; default resource creation is false.
  - Terraform is not installed in the current local shell, so no `terraform init`, `terraform plan` or provider validation was executed.
  - No production apply, import, migration, DNS change, traffic cutover or smoke was executed.
- Production env/secret source:
  - `.env.production` and `.env.production.local` are absent.
  - Required production runtime keys are represented by `config/platform/production-target.template.json`, but no production source of truth is present in repo.
  - Required production Secret Manager metadata IDs are specified by template and checked by read-only preflight; no secret values are printed or persisted.
  - The generic env probe timed out while scanning the large workspace output tree; this is treated as unproven rather than passed.

## Local Checks Executed

- `npm run qc:production-readiness:report`: passed as a report command with `ready=false`; open blocker is the external platform release readiness gate.
- `npm run qc:pdm-production-slice-numbering-draft`: 29/29 passed.
- `npm run qc:dev-046-phase2b`: 15/15 passed.
- `npm run qc:dev-046-firebase-hosting-entrypoint`: 11/11 passed.
- `npm run qc:dev-032-release-gate-package`: 13/13 passed; local clean-seed/allowlist/restore package is template-only and not production evidence.
- `npm run qc:dev-032-release-source-manifest`: 12/12 passed; exact release commit exists with zero included dirty source and zero unknown-risk paths, but remains `safeToBuildForProduction=false` because production gates are still open.
- `npm run dev-032:release-source-commit-plan`: generated applied exact-commit plan/pathspecs; included pathspec is empty because source is already committed.
- `npm run qc:dev-032-release-source-commit-plan`: 11/11 passed; included pathspec excludes generated evidence, `.firebase`, staging Firebase Hosting config and staging Terraform.
- `npm run qc:dev-032-production-iac-package`: 15/15 passed; static package QC only, because Terraform is not installed and no credentialled plan was authorized.
- `npm run qc:dev-032-production-target-contract`: 13/13 passed; validates template-only production target, ALB/custom-domain baseline, regional private Cloud SQL, identity-only Firebase and required secret metadata IDs.
- `npm run preflight:dev-032-production-target`: read-only report generated with `blocked_readonly_preflight`; no production action.
- `npm run qc:dev-032-production-target-preflight`: 15/15 passed.
- `npm run qc:dev-046-phase1e`: 24/24 passed after cost-template and privacy-notice scanner alignment.
- `npm run qc:dev-task-completion-audit`: 8/8 passed and confirms production readiness remains not ready.
- `npm run qc:doc-paths`: 23/23 passed.
- `npm run build:isolated`: passed; Next.js 16.2.6 production build completed. Warning retained: `middleware` file convention is deprecated in favor of `proxy`.

These are Level 0 / Level 2 local-artifact signals only. They do not replace Level 3 production-like pre-deploy smoke or Level 4 post-deploy production smoke for Lane 3.

## Blocking Conditions

1. Production target identity is not proven: `jenfu-ai-pdm-prod` is not accessible or does not exist for the active account.
2. Production provider config is absent: current Firebase/Hosting config is staging-only. A fail-closed production Terraform review package exists, but no credentialled production plan/readback exists.
3. Production env/secret source is absent: production target/secret metadata contract exists as a template, but no real production env source or Secret Manager readback evidence is present.
4. `HD-8-4 / 1A` pre-canary runbook/template exists, but Cloud SQL separate-target restore and numbering-ledger/sequence/non-reuse-reservation reconciliation execution evidence is missing.
5. Clean production seed/allowlist template exists, but real production inventory is not proven: new production PDM IDs, initial Admin, minimum company/role/config, official-number non-reuse reservations, allowlist hash and source read-only archive manifest are not available as production evidence.
6. Production allowlist is not proven: named 3-5-user production PDM-ID allowlist, fail-closed hash and non-canary denial evidence are missing.
7. Rollback target is not proven: there is no previous production Cloud Run revision, production DB restore point, traffic rollback target or operator runbook evidence.
8. Production AAL policy is unresolved: staging used an explicit Google Workspace AAL1 pilot exception. Production must either approve that residual risk or provide Workspace 2SV/provider-managed MFA evidence.
9. Level 3 and Level 4 smoke cannot run: no production-like production target or actual production URL is ready.

## Next Executable Work

1. Establish production target: create or grant access to `jenfu-ai-pdm-prod`, then rerun `npm run preflight:dev-032-production-target` for read-only project/Cloud Run/Cloud SQL/Firebase/Secret Manager target discovery.
2. After production target access exists, run credentialled production IaC plan review only. Stop on any delete/replace or estimate above USD 240; do not apply without separate approval.
3. Populate the clean production seed and allowlist manifests from real production/source-archive inventory: use new production PDM IDs, not source actor IDs or email-domain rules.
4. Execute the `HD-8-4 / 1A` restore/reconciliation runbook on an approved separate target before any canary traffic.
5. After all pre-build blockers close, build one immutable container image, run production-like smoke, then separately request deploy approval and post-deploy smoke.
