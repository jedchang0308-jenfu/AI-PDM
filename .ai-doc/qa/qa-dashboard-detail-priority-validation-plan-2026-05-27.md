# QA Validation Plan: Dashboard Drawing Detail Priority

Date: 2026-05-27
Scope: PDM_dev_task P1 drawing detail reorder

## User Scenarios

- User finds a drawing and opens detail to confirm identity, files, revision history, BOM, and Where-used before doing review work.
- User can reach preview/download actions quickly after selecting a search result.
- Review comments, review issues, phase gates, approval matrix, and approval buttons remain available but are visually lower priority.

## FMEA Checks

| Risk | Impact | Validation |
|---|---|---|
| Detail panel still says review detail | User perceives the system as approval-first | Verify detail title is `圖面明細` and old `送審明細` title is absent |
| File entry remains buried below review tools | Finding a drawing still requires excessive scrolling | Verify file section appears above checkout/review tools |
| Revision/BOM/Where-used appear after review work | User cannot confirm drawing context quickly | Verify revision history, BOM, and Where-used are above checkout/review tools |
| Review tools disappear during reorder | Existing approval workflow regresses | Verify discussion and review issue sections still exist below drawing context |
| CSS-only reorder breaks production build | UI compiles locally but fails release build | Run lint and build |

## QC Cases

- `DDP-001` Detail title is `圖面明細`.
- `DDP-002` Old title `送審明細` is removed.
- `DDP-003` File section is labelled `檔案`.
- `DDP-004` File section appears before checkout/review tools.
- `DDP-005` Revision history appears before checkout/review tools.
- `DDP-006` BOM appears before checkout/review tools.
- `DDP-007` Where-used appears before checkout/review tools.
- `DDP-008` Discussion appears below drawing context.
- `DDP-009` Review issues appear below drawing context.

## Acceptance

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- `npm.cmd run qc:dashboard-detail-priority` passes.
