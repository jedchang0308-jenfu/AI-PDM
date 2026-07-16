# PDM File Storage Evidence Provenance Quality - Phase 5Q

Date: 2026-06-11
Task: `DEV-STORAGE-COST-001`

## Purpose

Phase 5P marked QC runtime storage access rows so governance can exclude them. Phase 5Q carries that provenance quality into PM-facing monthly evidence, dashboard summary, and governance gate decisions.

This prevents old or unclassified local runtime rows from making storage cost evidence look cleaner than it really is.

## Delivery

- `scripts/generate-file-storage-monthly-evidence.mjs` now includes:
  - `summary.excludedQcRuntimeRows`
  - `summary.legacyUnclassifiedRows`
  - readiness warnings for excluded QC rows and legacy rows without provenance
- `src/lib/storage-evidence-dashboard.ts` now normalizes those summary fields and adds a PM next action when legacy rows exist.
- Legacy unclassified rows now force governance level `review` with label `Evidence provenance review required`.
- Legacy provenance review does not by itself recommend alternate provider migration; it blocks stable interpretation until PM reviews or regenerates provenance-aware evidence.

## Guardrails

- No Supabase connector call was made.
- No Supabase project or branch was created.
- No schema migration was applied.
- No provider request was made.
- No file was deleted.
- No metadata pointer was updated.
- No local runtime data was seeded by this phase.

## Verification

- `node --check scripts/generate-file-storage-monthly-evidence.mjs` passed.
- `node --check scripts/qc-file-storage-monthly-evidence.mjs` passed.
- `node --check scripts/qc-file-storage-evidence-dashboard.mjs` passed.
- `node --check scripts/qc-file-storage-governance-gate.mjs` passed.
- `npm.cmd run qc:file-storage-monthly-evidence` passed 19/19.
- `npm.cmd run qc:file-storage-evidence-dashboard` passed 26/26.
- `npm.cmd run qc:file-storage-governance-gate` passed 16/16.

## Remaining External Gates

- User cost confirmation is still required before any Supabase `confirm_cost` or create call.
- Dedicated `AI_PDM_STAGING` / disposable Supabase target is still not created.
- Formal schema apply, verify, Supabase advisor evidence, and promotion are still pending.
- Live storage provider migration, rollback, and cutover are still pending.
