# RD/QC Report: BOM Visual Editor

Date: 2026-06-07
Task: `DEV-BOM-VISUAL-EDITOR-001`
Spec: `SPEC-BOM-VISUAL-EDITOR-001`

## Scope

Upgrade `/bom/workbench` from a list-style BOM tree editor to an XMind-style visual graph editor. The canonical BOM data model remains unchanged: hierarchy and order are still stored through `parentLineId` and `sequenceNo`.

## RD Changes

- Added `@xyflow/react` and rendered BOM draft lines as React Flow nodes and edges.
- Added custom BOM graph nodes for parent assembly, virtual group, and item lines.
- Added deterministic tree-to-flow layout without saving free-form canvas coordinates.
- Added graph drag behavior for parent changes, root moves, and sibling ordering.
- Replaced the persistent right-side property panel with `PdmDetailDrawer`, aligned with the drawing module detail drawer standard.
- Added a dedicated search-result drag handle and standard `DataTransfer` payload for dropping parts into the graph.
- Preserved existing BOM draft save, active draft, clone, review submit, compare, XLS paste, and API contracts.

## QA Focus

- Desktop graph usability at 1440px: node visibility, edge visibility, toolbar access, left library, and drawer flow.
- Mobile layout at 390px: no page-level horizontal overflow and graph canvas remains available.
- Graph data integrity: drop part into graph, edit quantity in drawer, add group, undo/redo, drag item under group, save, and verify API response.
- Tree rule integrity: max depth, cycle blocking, group semantics, sibling merge behavior, audit/edit events.
- Drawer compatibility: shared detail drawer remains transparent, resizable, and discoverable by system QC.

## QC Results

- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run qc:bom-workbench-tree-rules`: 22/22 passed.
- `npm.cmd run qc:bom-workbench-ui`: 34/34 passed.
- `npm.cmd run qc:pdm-system-detail-drawer-ui`: 53/53 passed.

## Notes

The production build still reports existing Turbopack dynamic path / NFT trace warnings from `src/lib/config.ts`, `src/lib/llm-usage.ts`, and `next.config.mjs`. These warnings predate this BOM visual editor change and were not introduced by the React Flow implementation.
