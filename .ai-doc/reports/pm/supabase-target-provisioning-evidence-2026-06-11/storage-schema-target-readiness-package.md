# AI_PDM Storage Schema Target Readiness Package

Generated at: 2026-06-11T04:21:44.717Z
Package version: storage-schema-target-readiness-package/v1
Readiness gate version: storage-schema-target-readiness/v1

## Summary

- Status: blocked_target_readiness
- Ready for schema apply gate: false
- Expected target name: AI_PDM_STAGING
- Project count: 2
- Ready candidate count: 0

## Guardrails

- Evidence only: true
- No Supabase project created: true
- No cost accepted: true
- No database connection: true
- No SQL applied: true

## Required External Inputs

- Dedicated AI_PDM_STAGING or disposable/shadow Supabase target inventory
- User-approved Supabase project or branch cost when a new target must be created
- Dedicated target database URL after the target exists

## Blocked Actions

- Do not use ProJED or ProJED_TEST for AI_PDM storage schema validation
- Create or provide a dedicated AI_PDM_STAGING/disposable/shadow target
- Re-export project inventory after the target exists

## Next Commands

- `npm.cmd run storage:schema-target-readiness -- --projects-report <projects.json> --expected-target-name AI_PDM_STAGING --output <evidence-dir>`
- `set PDM_STORAGE_SCHEMA_APPLY_ENABLED=1 && set PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL=<dedicated-target-url> && npm.cmd run storage:schema-apply-gate -- --target-name AI_PDM_STAGING --confirm-disposable --output <evidence-dir>`
- `set PDM_STORAGE_SCHEMA_VERIFY_ENABLED=1 && set PDM_STORAGE_SCHEMA_VERIFY_DATABASE_URL=<dedicated-target-url> && npm.cmd run storage:schema-verify-gate -- --target-name AI_PDM_STAGING --confirm-target --output <evidence-dir>`
- `npm.cmd run storage:schema-advisor-evidence -- --security-report <security-advisor.json> --performance-report <performance-advisor.json> --target-name AI_PDM_STAGING --output <evidence-dir>`
- `npm.cmd run storage:schema-promotion-gate -- --apply-report <storage-schema-apply-gate.json> --verify-report <storage-schema-verify-gate.json> --advisor-evidence <supabase-advisor-evidence.json> --output <evidence-dir>`

