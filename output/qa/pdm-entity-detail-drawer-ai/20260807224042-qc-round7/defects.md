# Defects

## QC-DRAWER-R7-001 — P0 — A0007 同一畫面出現互斥第一層狀態

- Route: /numbering/search
- Viewport: 1440x900
- Fixture: A0007
- Steps:
  1. Hard reload /numbering/search.
  2. Wait for the A0007 relation row.
  3. Observe the list status, then open A0007 and wait 1.8 seconds.
  4. Compare the still-visible list badge with the drawer header badge.
- Expected: the same object has one canonical first-layer human status; if different dimensions must coexist, each must be explicitly labeled and not presented as the same generic status.
- Actual list: 生產可用; key=relation_complete; availability scope=production; aria-label=狀態：生產可用，查看說明.
- Actual drawer: 待你處理; key=data_conflict; availability scope=none; aria-label=狀態：待你處理，查看說明.
- Impact: the operator cannot tell whether A0007 is usable or requires immediate action. The system violates one-object-one-visible-truth and the actor-aware first-layer status requirement.
- Evidence: screenshots/search-a0007-root-status-mismatch-1440x900.png; dom-metrics.json root.statusContradiction.
- Disposition: return to RD; QC cannot pass until list and drawer consume one canonical root status projection or clearly separate labeled dimensions.