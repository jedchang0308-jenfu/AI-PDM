# DEV-032 Production Gate Package Update

Date: 2026-07-15
Owner: Dev PM / deployment-release-gate
Scope: local-only production canary gate package
Production action: none

## Result

Status: local gate package prepared; DEV-032 remains blocked before production build/deploy.

This package adds the local template/runbook/QC needed to prevent the clean seed, allowlist and `HD-8-4 / 1A` restore requirement from being treated as informal notes. It does not provide production evidence.

## Changes

- Updated `config/platform/clean-production-seed.template.json` with:
  - DEV-032 / DEV-046 Phase 3A.0 release-gate metadata;
  - named-user canary allowlist contract;
  - Wave 0 Google Workspace-only and fail-closed access;
  - GCS file authority disabled for Phase 3A;
  - non-Google Wave 0 disabled and Wave 1 separately gated;
  - required historical official-number inventory and non-reuse reservations;
  - `HD-8-4 / 1A` Cloud SQL backup/PITR, separate isolated restore and reconciliation checks;
  - rollback and Level 3/Level 4 smoke evidence requirements.
- Added `.ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md`.
- Added `npm run qc:dev-032-release-gate-package`.
- Added reproducible read-only production target preflight:
  - `config/platform/production-target.template.json`
  - `npm run qc:dev-032-production-target-contract`
  - `npm run preflight:dev-032-production-target`
  - `npm run qc:dev-032-production-target-preflight`
  - current report: `output/dev-032-production-target-preflight/report.json`
- Added fail-closed production Terraform review package:
  - `infra/google-cloud/production/`
  - `npm run qc:dev-032-production-iac-package`
  - `npm run dev-032:production-iac-terraform-validate`
  - `npm run qc:dev-032-production-iac-terraform-validate`
  - every Google resource is gated by `local.create_resources`
  - Docker Terraform static validation runs against a copied `output/` workspace with backend disabled
  - no production apply, import, migration, DNS change, traffic cutover, smoke or credentialled plan was executed
- Added reproducible release-source commit plan:
  - `npm run dev-032:release-source-commit-plan`
  - `npm run qc:dev-032-release-source-commit-plan`
  - included pathspec: `output/dev-032-release-source/included-production-source.pathspec`
  - excluded generated/staging pathspec: `output/dev-032-release-source/excluded-generated-or-staging.pathspec`
- Fixed two local governance regressions found while validating:
  - cost budget assumptions now sum to the approved USD 300 monthly budget while keeping USD 240 plan-review stop;
  - employee privacy notice keeps the no-Firebase-authority meaning without triggering the source scanner on forbidden implementation product names.

## Validation

- `npm run qc:dev-032-release-gate-package`: 13/13 passed.
- `npm run qc:dev-032-release-source-manifest`: 12/12 passed.
- `npm run dev-032:release-source-commit-plan`: generated applied exact-commit plan/pathspecs; no production action.
- `npm run qc:dev-032-release-source-commit-plan`: 11/11 passed.
- `npm run qc:dev-032-production-iac-package`: 16/16 passed.
- `npm run dev-032:production-iac-terraform-validate`: passed; Docker Terraform 1.14.5 `fmt`, `init -backend=false` and `validate -json` completed with zero validate errors/warnings.
- `npm run qc:dev-032-production-iac-terraform-validate`: 12/12 passed.
- `npm run qc:dev-032-production-target-contract`: 13/13 passed.
- `npm run preflight:dev-032-production-target`: generated `blocked_readonly_preflight`; production action `false`; 8 blockers.
- `npm run qc:dev-032-production-target-preflight`: 15/15 passed.
- `npm run qc:dev-046-phase1e`: 24/24 passed.
- `npm run qc:production-readiness:report`: passed as report command with `ready=false`; DEV-032 remains blocked by release-readiness gate.
- Post-commit release-candidate source check: draft number preview/no-reservation source is committed and covered by request-equivalence, number-state contract/HTTP/runtime/UI, production-slice, numbering-core, TypeScript, lint and isolated build evidence. This is still local Level 0/2 evidence, not production readiness.

## Remaining Blockers

- Exact release-candidate commit exists and is recorded by the release-source manifest; production build still remains blocked by non-source gates.
- `jenfu-ai-pdm-prod` remains inaccessible or missing for the active account.
- Production target contract and Terraform review package exist as template-only/fail-closed source; Docker Terraform static validation passed, but real production env/secret source, provider config, credentialled plan and resource readback are still absent.
- Clean seed/allowlist are still templates; real production inventory, official-number non-reuse coverage and allowlist hash evidence are missing.
- `HD-8-4 / 1A` separate-target restore/reconciliation has a runbook but no execution evidence.
- Rollback target, Level 3 production-like smoke and Level 4 post-deploy production smoke are missing.
