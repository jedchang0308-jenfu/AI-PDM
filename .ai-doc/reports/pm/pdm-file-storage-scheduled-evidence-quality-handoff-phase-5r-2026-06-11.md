# PDM File Storage Scheduled Evidence Quality Handoff - Phase 5R

Date: 2026-06-11
Task: `DEV-STORAGE-COST-001`

## Purpose

Phase 5R makes provenance quality visible in scheduled monthly evidence handoffs and governance gate reports.

This closes the gap where `excludedQcRuntimeRows` and `legacyUnclassifiedRows` existed in summary data, but PM handoff consumers could miss them unless they inspected the full monthly evidence JSON.

## Delivery

- `scripts/run-file-storage-monthly-evidence-schedule.mjs` now writes `manifest.evidenceQuality`.
- `manifest.evidenceQuality` includes:
  - `excludedQcRuntimeRows`
  - `legacyUnclassifiedRows`
  - `provenanceReviewRequired`
  - `qcRuntimeRowsExcluded`
  - provenance-related warnings
- `scripts/generate-file-storage-governance-gate.mjs` now includes `report.evidenceQuality`.
- Governance gate Markdown now has an `Evidence Quality` section.
- QC fixtures now cover runtime rows, QC runtime rows, and legacy unclassified rows.

## Guardrails

- No Supabase connector call was made.
- No Supabase project or branch was created.
- No schema migration was applied.
- No provider request was made.
- No files were deleted.
- No metadata pointer was updated.
- No local runtime data was seeded by this phase.

## Verification

- `node --check scripts/run-file-storage-monthly-evidence-schedule.mjs` passed.
- `node --check scripts/generate-file-storage-governance-gate.mjs` passed.
- `node --check scripts/qc-file-storage-monthly-evidence-schedule.mjs` passed.
- `node --check scripts/qc-file-storage-governance-gate.mjs` passed.
- `npm.cmd run qc:file-storage-monthly-evidence-schedule` passed 17/17.
- `npm.cmd run qc:file-storage-governance-gate` passed 18/18.

## Remaining External Gates

- User cost confirmation is still required before any Supabase `confirm_cost` or create call.
- Dedicated `AI_PDM_STAGING` / disposable Supabase target is still not created.
- Formal schema apply, verify, Supabase advisor evidence, and promotion are still pending.
- Live storage provider migration, rollback, and cutover are still pending.
