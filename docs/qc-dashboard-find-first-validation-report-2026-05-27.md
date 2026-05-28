# QC Validation Report: Dashboard Find-First Main View

Date: 2026-05-27
Validation plan: `docs/qa-dashboard-find-first-validation-plan-2026-05-27.md`
Dev task scope: Dashboard find-first P0 items in Phase UI and Sprint 1

## Result

PASS

## Evidence

- `npm.cmd run lint`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd run qc:dashboard-find-first`: PASS, 23/23
- `npm.cmd run qc:api`: PASS, 391/391

## Scenario Results

| Case | Result |
|---|---|
| `DFF-001` First viewport heading is `PDM 圖面資料庫` | PASS |
| `DFF-002` Primary search input is visible | PASS |
| `DFF-003` Primary search placeholder covers drawing metadata and submitter | PASS |
| `DFF-004` Default active status tab is `全部` | PASS |
| `DFF-005` List title is `圖面資料` | PASS |
| `DFF-006` Old review-list title `送審清單` is removed | PASS |
| `DFF-007` Table headers are find-oriented | PASS |
| `DFF-008` Notification summary uses compact area | PASS |
| `DFF-009` Notification item display is capped to six | PASS |
| `DFF-010` Primary search finds a seeded drawing | PASS |
| `DFF-011` Result row shows file availability such as `PDF` | PASS |
| `DFF-012` Result row remains clickable | PASS |
| `DFF-013` Clicking result loads detail panel | PASS |

## Facts

- Dashboard first viewport now presents `PDM 圖面資料庫` with a prominent primary search input.
- Default status filter is `All`, so the table is no longer review-queue-first.
- Search/list rows expose file role availability and release package availability from DB query payloads.
- Result table fields are drawing-focused: drawing number, part number, part name, revision, status, file status, latest update, action.
- Notification summary remains present but is compact and capped to six visible items.
- Existing API regression remains green after list/search query payload changes.

## Open Items

- No open defects for Dashboard find-first P0 items.
