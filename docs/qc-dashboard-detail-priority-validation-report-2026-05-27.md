# QC Validation Report: Dashboard Drawing Detail Priority

Date: 2026-05-27
Validation plan: `docs/qa-dashboard-detail-priority-validation-plan-2026-05-27.md`
Dev task scope: PDM_dev_task P1 drawing detail reorder

## Result

PASS

## Evidence

- `npm.cmd run lint`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd run qc:dashboard-detail-priority`: PASS, 12/12

## Scenario Results

| Case | Result |
|---|---|
| `DDP-001` Detail title is `圖面明細` | PASS |
| `DDP-002` Old title `送審明細` is removed | PASS |
| `DDP-003` File section is labelled `檔案` | PASS |
| `DDP-004` File section appears before checkout/review tools | PASS |
| `DDP-005` Revision history appears before checkout/review tools | PASS |
| `DDP-006` BOM appears before checkout/review tools | PASS |
| `DDP-007` Where-used appears before checkout/review tools | PASS |
| `DDP-008` Discussion appears below drawing context | PASS |
| `DDP-009` Review issues appear below drawing context | PASS |

## Facts

- Detail panel title now uses drawing-oriented wording.
- File list has an explicit `檔案` section label.
- CSS order prioritizes drawing information, release package, files, revision history, BOM, BOM diff, Where-used, and CAD references before review tools.
- Checkout, sandbox, AI, discussion, review issue, phase gate, approval matrix, change, and approve/reject controls remain available lower in the panel.

## Open Items

- No open defects for drawing detail priority reorder.
