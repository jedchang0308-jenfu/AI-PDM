# QA Validation Plan: Dashboard Quick Access and Recent Activity

Date: 2026-05-27
Scope: PDM_dev_task P1 quick access, recent search, recent browse

## User Scenarios

- User opens Dashboard and can jump to common drawing search scopes without typing a full query.
- User can return to a recently searched drawing number.
- User can return to a recently opened drawing detail.
- Quick filters do not break status tabs, search, or existing API permissions.

## FMEA Checks

| Risk | Impact | Validation |
|---|---|---|
| Quick entry chips are missing | User still must type every search manually | Verify all expected quick chips are visible |
| Recent search is not retained | User cannot return to previous lookup | Verify a search term becomes a recent search chip |
| Recent browse is not retained | User cannot quickly reopen a drawing | Verify opened drawing becomes a recent browse chip |
| Quick status chips do not control data view | User sees wrong result set | Verify ReleaseFailed quick chip activates status tab |
| Missing handoff filter has no visible state | User cannot tell the active shortcut | Verify missing handoff chip becomes active |
| Summary query regression | Search/list permissions or status filters break | Run API regression after adding `has_active_lock` summary payload |

## QC Cases

- `DQA-001` Quick access area is visible.
- `DQA-002` Chips exist: `全部圖面`, `最近發布`, `我建立的`, `Checkout 中`, `缺交接檔`, `Release 失敗`.
- `DQA-003` Recent search chip is recorded after searching.
- `DQA-004` Recent drawing chip is recorded after opening detail.
- `DQA-005` Release failed chip becomes active.
- `DQA-006` Release failed chip drives `發布失敗` status tab.
- `DQA-007` Missing handoff chip becomes active.
- `DQA-008` Recent search chip restores search input.

## Acceptance

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- `npm.cmd run qc:dashboard-quick-access` passes.
- `npm.cmd run qc:api` passes.
