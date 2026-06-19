# PDM File Storage Phase 5S PM Evidence

Date: 2026-06-11

Task: `DEV-STORAGE-COST-001`

Phase: migration execution governance gate integration

## Purpose

Phase 5S closes the gap between monthly storage governance evidence and controlled staging migration execution.

Before this phase, `storage:migration-execution-gate` could enter local staging copy when the explicit execution flag, `--confirm-staging`, target mode, and runbook blockers were clean. It did not require a current governance gate artifact, so observation-mode or provenance-review evidence could be bypassed by a correctly configured execution command.

## Delivery

- Updated `scripts/generate-file-storage-migration-execution-gate.mjs`.
- Added `--governance-gate <file>` CLI support and `PDM_STORAGE_GOVERNANCE_GATE_PATH` env support.
- The execution gate now refuses staging copy when governance evidence is missing, unreadable, invalid, not migration-ready, still in observation/review state, or still requires provenance review.
- The execution report now records governance gate path, governance status, governance level, evidence-quality counts, provenance-review state, and the allow/block reason.
- Updated `scripts/qc-file-storage-migration-execution-gate.mjs`.
- QC now covers missing governance gate refusal, legacy provenance review refusal, stable governance approval, no provider requests, no metadata pointer updates, and source preservation.

## Operating Rule

Staging copy is allowed only when:

- `PDM_STORAGE_MIGRATION_EXECUTE_ENABLED=1` is set.
- `--confirm-staging` is provided.
- The target mode is `local_staging_directory`.
- The migration runbook has no blockers and has planned objects.
- A valid `file-storage-governance-gate` report is provided.
- Governance evidence is migration-ready and has no provenance review requirement.
- Governance status is `stable` or `cost_controls_required`.

## Guardrails

- No Supabase connector call was made.
- No Supabase project or branch was created.
- No database migration was applied.
- No storage provider request was made.
- No file was deleted.
- No metadata pointer was updated.

## Verification

- `node --check scripts/generate-file-storage-migration-execution-gate.mjs`: pass.
- `node --check scripts/qc-file-storage-migration-execution-gate.mjs`: pass.
- `npm.cmd run qc:file-storage-migration-execution-gate`: 22/22 pass.

## Remaining External Gates

- Supabase target still requires explicit cost confirmation before any connector execution.
- Formal DB migration still requires target creation, apply gate, verify gate, advisor evidence, and promotion gate.
- Live provider cutover remains blocked until staging evidence, governance evidence, and rollback evidence are all accepted.
