# RD Report - BOM Schema

Date: 2026-05-26

## Scope

Implemented the first BOM data foundation for Sprint 3.

## Completed

- Added `bom_headers` and `bom_lines` to SQLite schema.
- Added matching PostgreSQL/Supabase initial schema sections.
- Added BOM types to `src/lib/types.ts`.
- Added DB helpers:
  - `getBomBySubmissionId`
  - `materializeBomDraftFromReferences`
- Added `/api/submissions/[id]/bom`.
- Added Dashboard detail display for materialized Engineering BOM lines.
- Added API regression coverage `BOM-001` to `BOM-009`.

## Design Notes

- BOM is derived from existing `file_references` where `reference_type = 'assembly_component'`.
- No new manual fields are required from engineers.
- The first implementation stores one BOM line per assembly reference.
- Full automatic generation on upload, BOM diff, and Where-used remain separate Sprint 3 tasks.

## Verification

RD verification completed:

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.
- `npm.cmd run qc:api` passed: 125 passed, 0 failed.
- `npm.cmd run qc:ui` passed: 26 passed, 0 failed.
