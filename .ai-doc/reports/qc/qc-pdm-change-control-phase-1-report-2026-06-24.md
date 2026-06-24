# QC Report: DEV-PDM-CHANGE-CONTROL-001 Phase 1

Date: 2026-06-24
Owner: QC
Scope: local Phase 1 data model and domain service only

## Result

Passed with residual scope exclusions.

Phase 1 evidence confirms the local SQLite schema and domain service now support reserved part-number drafts, controlled recycle boundaries, submission guards, audit events, and optimistic locking. This report does not accept Phase 2-5 UI/API/review/BOM release behavior, and does not approve production or Supabase cutover.

## Evidence

| Check | Command | Result |
|---|---|---|
| Focused change-control QC | `npm.cmd run qc:pdm-change-control` | PASS, 23/23 |
| TypeScript compile | `npx.cmd tsc --noEmit --pretty false` | PASS |
| Focused lint | `npm.cmd run lint -- src/lib/pdm-change-control-domain.ts src/lib/pdm-change-control.ts scripts/qc-pdm-change-control.mjs` | PASS |

## Acceptance Mapping

| Phase 1 criterion | Evidence |
|---|---|
| Draft table/model exists | `db/schema.sql` adds `part_number_drafts` and active reserved-number uniqueness |
| Audit/event model exists | `db/schema.sql` adds `part_number_events`; QC verifies events remain after recycle |
| Controlled-boundary service exists | `src/lib/pdm-change-control-domain.ts` exposes `getPartNumberControlBoundary` and recycle/submit guards |
| Recycle guard is testable | QC verifies unrelated users cannot recycle and BOM/drawing/replacement boundaries block recycle |
| Submit guard is testable | QC verifies self-made replacement drafts require a source drawing and submitted drafts become controlled |
| Optimistic lock conflict is testable | QC verifies stale expected-version update fails with `optimistic_lock_conflict` |

## Residual Risk

- Postgres/Supabase schema mirror is not accepted in this report; production migration remains under the existing runtime migration governance.
- UI entry points, API routes, approval queue wiring, reviewer confirmation actions, and BOM release transaction behavior are not implemented in Phase 1.
- Confirmed-impact atomic release, including simultaneous drawing release, replacement part release, and BOM reconfirmation flag creation, remains a later phase.

## QC Decision

Phase 1 is acceptable as a local foundation. Next work must be explicitly scoped as either Phase 2 API/UI integration, database migration mirror planning, or later release/review/BOM flow implementation.
