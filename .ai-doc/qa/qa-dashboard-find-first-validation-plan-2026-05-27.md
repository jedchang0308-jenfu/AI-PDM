# QA Validation Plan: Dashboard Find-First Main View

Date: 2026-05-27
Scope: PDM_dev_task Phase UI P0, Sprint 1 Dashboard find-first items

## User Scenarios

- User opens Dashboard to find a drawing, not to start review work.
- User searches by drawing number, part number, part name, revision, material, filename, status, or submitter.
- User sees all drawing records by default, including Released, Pending, Rejected, ReleaseFailed, and Obsolete.
- User can scan drawing number, part number, part name, revision, lifecycle status, file availability, and latest activity from the result table.
- Notifications remain available but no longer dominate the first visual area.

## FMEA Checks

| Risk | Impact | Validation |
|---|---|---|
| Dashboard still opens as review queue | Users keep treating the system as approval-first | Verify heading, primary search, and default active tab are find-first / All |
| Search scope misses core drawing metadata | Users cannot quickly find drawings | Verify placeholder and seeded drawing search by drawing number |
| Result table keeps approval-focused columns | Users cannot scan drawing identity or file readiness | Verify table headers include drawing, part, revision, status, file availability, latest update |
| Notifications dominate first screen | Review work still appears as primary workflow | Verify compact notification area and six-item cap |
| Result row cannot open detail | Search flow is broken after finding a drawing | Verify seeded result row opens submission detail |
| Query changes break existing APIs | Existing workflows regress | Run API regression after summary/search query changes |

## QC Cases

- `DFF-001` First viewport heading is `PDM 圖面資料庫`.
- `DFF-002` Primary search input is visible.
- `DFF-003` Primary search placeholder covers drawing metadata and submitter.
- `DFF-004` Default active status tab is `全部`.
- `DFF-005` List title is `圖面資料`.
- `DFF-006` Old review-list title `送審清單` is removed.
- `DFF-007` Table headers are `圖號`, `料號`, `品名`, `版次`, `狀態`, `檔案狀態`, `最近更新`, `操作`.
- `DFF-008` Notification summary uses compact area.
- `DFF-009` Notification item display is capped to six.
- `DFF-010` Primary search finds a seeded drawing.
- `DFF-011` Result row shows file availability such as `PDF`.
- `DFF-012` Result row remains clickable.
- `DFF-013` Clicking result loads detail panel.

## Acceptance

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- `npm.cmd run qc:dashboard-find-first` passes.
- `npm.cmd run qc:api` passes because list/search query payloads changed.
