# Defects

## QC-DRAWER-001 — P0 — Same object has two visible status truths

- Route: `/numbering/search`
- Viewport: `1440x900`
- Fixture: `A0007-M01`
- Steps: open A0007, then click `A0007-M01`.
- Expected: the list and shared drawer use one human status truth, or clearly label genuinely different dimensions.
- Actual: list `狀態：生產可用`; drawer `狀態：等他人處理`.
- Evidence: `screenshots/search-A0007-M01-list-drawer-status-1440x900.png`; `same-object-diff.json`.

## QC-DRAWER-002 — P0 — Canonical identity differs by entry route

- Routes: `/numbering/drawings?view=all`, `/numbering/search`, `/parts`.
- Viewport: `1440x900`.
- Expected: same object header identity is identical across owner and search entry.
- Actual drawing: owner subtitle `馬達_JF_2HP_A`; search subtitle `A0007 / 製造圖`.
- Actual part: owner subtitle `馬達_JF_2HP_A`; search subtitle `A0007 / 馬達_JF_2HP_A`.
- Evidence: `same-object-diff.json`, owner/search screenshots.

## QC-DRAWER-003 — P2 — Preview error exposes engineering/runtime language

- Routes: `/numbering/drawings?view=all` and `/numbering/search` drawing target.
- Viewport: `1440x900`.
- Selector: `article.drawing-preview-card.two-d .drawing-preview-placeholder.failed > span`.
- Rect: x=1234.4, y=523.83, width=139.8, height=74.2 in search drawer.
- Expected: human wording such as `2D 預覽尚未產生，可先下載原始圖檔。`; operational setup stays in Admin/audit.
- Actual: `缺少 worker 可讀取的 Document Manager key。請設定 Vault 或 worker 環境變數。`
- Evidence: `screenshots/search-A0007-M01-list-drawer-status-1440x900.png`.

## QC-DRAWER-004 — P2 — List row Enter/Space does not activate while drawer is open

- Route: `/numbering/drawings?view=all`.
- Viewport: `1440x900`.
- Steps: open A0007-M01; clear search; focus A0005-M01; press Enter, then Space.
- Expected: same behavior as mouse click: one drawer switches to A0005-M01 and resets to top.
- Actual: focus moves to A0005-M01 outside the drawer, but drawer remains A0007-M01 after both keys; mouse click switches correctly.
- Evidence: `screenshots/drawings-keyboard-row-enter-fail-1440x900.png`; `dom-metrics.json`.
