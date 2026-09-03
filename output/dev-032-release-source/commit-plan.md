# DEV-032 Release Source Commit Plan

Generated: 2026-09-01T07:16:09.529Z
Status: `release_source_snapshot_unstable`
Production action performed: `false`

## Release Source Boundary

- Included production-source candidate paths: 304
- Excluded generated evidence paths: 79435
- Excluded staging-only paths: 0
- Unknown-risk paths: 0
- Source snapshot SHA-256: `31035ef3cfdf1345829669cc9c0b1e3e5930a20940ed5e7c0f7e125317bc42ee`

## Generated Pathspecs

- Included pathspec: `output/dev-032-release-source/included-production-source.pathspec`
- Excluded pathspec: `output/dev-032-release-source/excluded-generated-or-staging.pathspec`

## Next Step

The release-source boundary changed between two consecutive snapshots. Do not stage or build from this plan; stop concurrent source/config work, then regenerate the plan until the source snapshots are identical. Generated-evidence-only churn is intentionally excluded from this stability decision.

First snapshot: `1246848797e39159f24751033a3c7eff40013c5d5988d5f48618e326fda5a322`
Second snapshot: `31035ef3cfdf1345829669cc9c0b1e3e5930a20940ed5e7c0f7e125317bc42ee`

## Stop Conditions

- This plan is not a release approval and does not create an exact release commit.
- Do not stage generated evidence, staging-only Firebase config or staging Terraform as production source.
- Do not stage, build, push or deploy until two consecutive source snapshots are identical; another process is changing the worktree.
- Do not proceed while production target, env/secret source, HD-8-4 restore evidence, rollback and Level 3/4 smoke are missing.

