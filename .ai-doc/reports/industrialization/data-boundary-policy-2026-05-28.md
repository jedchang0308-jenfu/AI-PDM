# Data Boundary Policy - 2026-05-28

## Goal
Separate runtime state, repository files, backups, fixtures, QC evidence, reports, and quality records without breaking the current local development defaults.

## Default Compatibility
The current default remains `./data` so existing local workflows continue to run.

The path module `scripts/pdm-paths.mjs` is the source of truth for scripts. It keeps defaults compatible while allowing production or field-test machines to split paths through environment variables.

## Ownership
- Runtime DB: `PDM_DATA_DIR`, default `./data`, file `ai-pdm.sqlite`.
- Runtime repository: `PDM_REPOSITORY_DIR`, default `./data/repository`.
- Backups: `PDM_BACKUP_DIR`, default `./data/backups`.
- Quality records: `PDM_QUALITY_DIR`, default `./data/quality`.
- Evidence root: `PDM_EVIDENCE_DIR`, default `./data`.
- Report root: `PDM_REPORT_DIR`, default `./data`.
- Restore drills: `PDM_RESTORE_DRILL_DIR`, default `./data/restore-drills`.
- Restore targets: `PDM_RESTORE_TARGET_DIR`, default `./data/restore-targets`.
- Retention drills: `PDM_RETENTION_DRILL_DIR`, default `./data/retention-drills`.
- Restore handoffs: `PDM_RESTORE_HANDOFF_DIR`, default `./data/restore-handoffs`.
- Field-test handoffs: `PDM_FIELD_TEST_HANDOFF_DIR`, default `./data/field-test-handoffs`.

## Source-Control Rule
`data/` remains ignored. Formal DBs, repository files, generated reports, backup snapshots, and field evidence must not be committed.

## Runtime Packaging Rule
`next.config.mjs` excludes `./data/**/*` from output tracing so runtime and evidence state is not bundled into app artifacts.

## QC Gate
Run:
- `npm.cmd run qc:data-boundary`
- `npm.cmd run backup:verify`
- `npm.cmd run qc:file-hashes`
- `npm.cmd run field-test:preflight -- --profile restore`
