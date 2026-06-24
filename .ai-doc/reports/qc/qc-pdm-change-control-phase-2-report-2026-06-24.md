# QC Report: DEV-PDM-CHANGE-CONTROL-001 Phase 2

Date: 2026-06-24
Owner: QC
Scope: part-number draft module local API/UI slice

## Result

Passed with residual scope exclusions.

Phase 2 evidence confirms a single part-number draft module now exists with API routes, a direct UI route, three draft labels, reserved draft void/recycle/reconfirm actions, same-source warning detection, and `needs_reconfirmation` domain behavior. This report does not accept drawing revision FFF flow, reviewer approval flow, BOM impact automation, or production/Supabase migration.

## Evidence

| Check | Command | Result |
|---|---|---|
| Focused change-control QC | `npm.cmd run qc:pdm-change-control` | PASS, 30/30 |
| TypeScript compile | `npx.cmd tsc --noEmit --pretty false` | PASS |
| Focused lint | `npm.cmd run lint -- src/lib/pdm-change-control-domain.ts src/lib/pdm-change-control.ts src/lib/pdm-change-control-api.ts src/app/api/numbering/part-number-drafts/route.ts src/app/api/numbering/part-number-drafts/[draftId]/route.ts src/app/api/numbering/part-number-drafts/[draftId]/submit-review/route.ts src/app/api/numbering/part-number-drafts/[draftId]/void/route.ts src/app/api/numbering/part-number-drafts/[draftId]/recycle/route.ts src/app/api/numbering/part-number-drafts/[draftId]/reconfirm/route.ts src/app/numbering/part-drafts/page.tsx scripts/qc-pdm-change-control.mjs` | PASS |
| Local UI route load | `Invoke-WebRequest http://127.0.0.1:3000/numbering/part-drafts` | PASS, HTTP 200 |

## Acceptance Mapping

| Phase 2 criterion | Evidence |
|---|---|
| Single draft list exists | `/numbering/part-drafts` page and `GET /api/numbering/part-number-drafts` |
| Three draft types exist | UI and API support `new_part`, `replacement_part`, `drawing_revision_generated` |
| Reserved draft recycle works | `POST /void` and `POST /recycle`; QC verifies creator recycle path remains valid |
| Same-source warning is testable | `listPartNumberDrafts` returns `sameSourceUnfinishedDraftCount` and warning code |
| `needs_reconfirmation` is testable | `markSameSourceDraftsNeedReconfirmation` and `reconfirmPartNumberDraft` pass QC |

## Residual Risk

- New API/UI uses existing `numbering.tasks` page permission and `numbering.draft.*` action permissions; no new ACL code was added in this slice.
- Source part/drawing fields currently accept IDs for the local Phase 2 slice. User-friendly search/selection belongs to a later UX hardening pass or Phase 3.
- Phase 3 FFF judgement flow, Phase 4 reviewer decisions, Phase 5 BOM reconfirmation blocking, and production/Supabase migration remain out of scope.

## QC Decision

Phase 2 is acceptable as the part-number draft module foundation. The next implementation slice should be Phase 3 drawing revision flow unless PM chooses to handle migration mirror first.
