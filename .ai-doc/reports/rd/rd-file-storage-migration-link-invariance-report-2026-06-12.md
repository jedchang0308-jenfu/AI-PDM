# RD Report: DEV-STORAGE-COST-001 Migration Link Invariance Gate

Date: 2026-06-12

## Scope

- Task: `DEV-STORAGE-COST-001`
- Phase: provider migration business-link invariance dry-run gate
- Target: local dry-run / QC fixture only

## Changes

- Updated `scripts/generate-file-storage-migration-dry-run.mjs`.
- The migration dry-run report now records `assumptions.businessRelationshipTablesUntouched=true`.
- Each planned migration object now includes `businessLinkInvariant`.
- The invariant records the source object identity, linked entity type / id, SHA-256, allowed storage pointer fields, and relationship tables that must stay untouched.
- Relationship tables explicitly protected by the dry-run contract include `submissions`, `items`, `bom_headers`, `bom_lines`, `bom_drafts`, `bom_lines_tree`, `drawing_numbers`, `part_numbers`, and `drawing_part_links`.
- Updated `scripts/qc-file-storage-migration-dry-run.mjs` to verify that planned pointer updates do not include business relationship fields such as `submission_id`, `item_id`, `drawing_number`, `part_number`, or `bom_header_id`.

## Verification

- `node --check scripts/generate-file-storage-migration-dry-run.mjs` passed.
- `node --check scripts/qc-file-storage-migration-dry-run.mjs` passed.
- `npm.cmd run qc:file-storage-migration-dry-run` passed 17/17.
- `npm.cmd run qc:file-storage-migration-runbook` passed 26/26.
- `npm.cmd run qc:file-storage-migration-execution-gate` passed 22/22.
- `npm.cmd run qc:file-storage-contract` passed 81/81.
- `npm.cmd run qc:file-storage-local-provider-regression` passed 34/34.

## Boundary

- No Supabase connector call was made.
- No Supabase Storage bucket was created.
- No S3-compatible provider request was made.
- No DB schema migration was applied.
- No provider pointer was updated.
- No file migration was executed against a live provider.
- This proves the local dry-run / runbook / execution-gate contract preserves submission, drawing, part, and BOM relationship identifiers. Live provider migration, metadata pointer update, app smoke, and rollback proof remain open.
