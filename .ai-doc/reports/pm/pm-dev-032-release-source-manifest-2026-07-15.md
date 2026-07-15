# DEV-032 Release Source Manifest Evidence

Date: 2026-07-15
Owner: Dev PM / deployment-release-gate
Scope: local source-control release boundary evidence
Production action: none

## Result

Status: release source now has an exact local commit, but DEV-032 remains blocked before production build/deploy.

The manifest gives a reproducible source boundary and records the exact release commit when no included production-source paths remain dirty. It does not mean production can be built or deployed, because production target, environment, restore/reconciliation, rollback and smoke gates remain open.

## Evidence

- Manifest: `output/dev-032-release-source/manifest.json`
- Commit plan: `output/dev-032-release-source/commit-plan.json`
- Included-source pathspec: `output/dev-032-release-source/included-production-source.pathspec`
- Excluded generated/staging pathspec: `output/dev-032-release-source/excluded-generated-or-staging.pathspec`
- Generator: `npm run dev-032:release-source-manifest`
- QC: `npm run qc:dev-032-release-source-manifest`
- QC result: 12/12 passed
- Commit-plan generator: `npm run dev-032:release-source-commit-plan`
- Commit-plan QC: `npm run qc:dev-032-release-source-commit-plan`
- Commit-plan QC result: 11/11 passed
- Source snapshot SHA-256: recorded in the manifest, not repeated here to avoid self-referential source hashing.
- Classification SHA-256: recorded in the manifest, not repeated here to avoid self-referential source hashing.

## Snapshot Summary

The authoritative current counts are stored in `output/dev-032-release-source/manifest.json`.
This report is itself part of the dirty governance source, so repeating exact counts here
would create stale self-counting evidence after every report edit.

Required invariant:

- Unknown-risk entries: 0
- Generated evidence and staging-only entries are excluded from production source.
- Included source entries are classified by application, release tooling, release governance, schema/migration, build/runtime config or platform contract.
- `safeToBuildForProduction=false` until the remaining DEV-032 production gates are closed.

## Gate Meaning

This evidence narrows the source blocker:

- Closed locally: dirty entries are classified and hashable with zero unknown-risk paths.
- Closed locally: a verified included-source pathspec exists for a future exact release commit.
- Closed locally: included production-source paths were committed into the current release-candidate HEAD; exact commit is recorded in the manifest.
- Still open: no pushed production release artifact and no production deployment evidence.

The manifest explicitly keeps `safeToBuildForProduction=false` until the remaining DEV-032 production blockers are closed.

## Remaining DEV-032 Blockers

- `jenfu-ai-pdm-prod` target remains inaccessible or missing.
- Production env/secret source remains absent.
- Real clean seed/allowlist inventory and `HD-8-4 / 1A` restore/reconciliation execution evidence remain missing.
- Rollback, Level 3 production-like smoke and Level 4 post-deploy production smoke remain missing.
