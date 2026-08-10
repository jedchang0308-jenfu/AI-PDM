# DEV-032 Release Source Commit Plan

Generated: 2026-08-09T14:56:58.184Z
Status: `release_source_commit_plan_ready_not_applied`
Production action performed: `false`

## Release Source Boundary

- Included production-source candidate paths: 58
- Excluded generated evidence paths: 171
- Excluded staging-only paths: 0
- Unknown-risk paths: 3
- Source snapshot SHA-256: `0e6cd960956314a99a0308426d9d70f0e8638ee3ea7b7fc733634f6f85b2ffd0`

## Generated Pathspecs

- Included pathspec: `output/dev-032-release-source/included-production-source.pathspec`
- Excluded pathspec: `output/dev-032-release-source/excluded-generated-or-staging.pathspec`

## Next Step

This plan does not stage or commit. After release-owner review, create an exact release commit by staging the included pathspec only. Generated evidence and staging-only provider config must stay outside the production release source unless a separate decision changes the boundary.

Suggested command after explicit release-source selection:

```powershell
git add --pathspec-from-file=output/dev-032-release-source/included-production-source.pathspec --pathspec-file-nul
git commit -m "chore: prepare DEV-032 production release candidate"
```

## Stop Conditions

- This plan is not a release approval and does not create an exact release commit.
- Do not stage generated evidence, staging-only Firebase config or staging Terraform as production source.
- Do not build, push or deploy production until the release owner selects the source boundary and an exact release commit exists.
- Do not proceed while production target, env/secret source, HD-8-4 restore evidence, rollback and Level 3/4 smoke are missing.

