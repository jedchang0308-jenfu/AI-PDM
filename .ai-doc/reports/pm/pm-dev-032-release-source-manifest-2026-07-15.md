# DEV-032 Release Source Manifest Evidence

Date: 2026-07-15
Owner: Dev PM / deployment-release-gate
Scope: local source-control release boundary evidence
Production action: none

## Result

Status: current dirty snapshot has a deterministic source manifest, but DEV-032 remains blocked before production build/deploy.

The manifest gives a reproducible hash for the current dirty source candidate and classifies every dirty entry. It does not mean the release owner has selected this dirty snapshot, and it is not an exact release commit.

## Evidence

- Manifest: `output/dev-032-release-source/manifest.json`
- Commit plan: `output/dev-032-release-source/commit-plan.json`
- Included-source pathspec: `output/dev-032-release-source/included-production-source.pathspec`
- Excluded generated/staging pathspec: `output/dev-032-release-source/excluded-generated-or-staging.pathspec`
- Generator: `npm run dev-032:release-source-manifest`
- QC: `npm run qc:dev-032-release-source-manifest`
- QC result: 11/11 passed
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
- `safeToBuildForProduction=false` until release owner selection, exact release commit and the remaining DEV-032 production gates are closed.

## Gate Meaning

This evidence narrows the source blocker:

- Closed locally: dirty entries are classified and hashable with zero unknown-risk paths.
- Closed locally: a verified included-source pathspec exists for a future exact release commit.
- Still open: no release-source owner decision, no staged/committed release source, no pushed or immutable production release artifact.

The manifest explicitly keeps `safeToBuildForProduction=false` until release owner selection and the remaining DEV-032 production blockers are closed.

## Remaining DEV-032 Blockers

- Release owner must choose current dirty snapshot or a clean release branch.
- An exact release commit or immutable release snapshot must be created from the verified included-source pathspec.
- `jenfu-ai-pdm-prod` target remains inaccessible or missing.
- Production env/secret source remains absent.
- Real clean seed/allowlist inventory and `HD-8-4 / 1A` restore/reconciliation execution evidence remain missing.
- Rollback, Level 3 production-like smoke and Level 4 post-deploy production smoke remain missing.
