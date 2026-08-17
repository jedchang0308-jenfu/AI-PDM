# Defects

## QC-DRAWER-R3-001 — P0 — 同一圖號狀態因純查看而改變

- Route: `/numbering/search`
- Viewport: `1440x900`
- Fixture: `A0007-M01`
- Selector: A0007 relation article → `.pdm-relation-node-header .human-status-badge-anchor`
- Steps: hard reload，等待 5 秒，不開 drawer；記錄狀態；再點 `A0007-M01`。
- Expected: 純查看前後使用同一 canonical work status。
- Actual: 開啟前 `生產可用`；點開後清單與 drawer 變成 `等他人處理`。
- Evidence: `screenshots/search-A0007-M01-before-open-1440x900.png`, `screenshots/search-A0007-M01-after-open-1440x900.png`, `same-object-diff.json`。

## QC-DRAWER-R3-002 — P0 — 圖料工作台料號鍵盤操作開成主根號

- Route: `/numbering/search`
- Viewport: `1440x900`
- Fixture: expanded `A0005` with `A0005-P01/P02/P03`
- Selector: relation part button whose accessible name starts `A0005-P02` / `A0005-P03`
- Steps: mouse open `A0005-P01`; focus `A0005-P02` and press Enter; focus `A0005-P03` and press Space。
- Expected: same drawer switches to `part_number` `A0005-P02`, then `A0005-P03`。
- Actual: both keys resolve to `part_root` `A0005`。Mouse target behavior and keyboard target behavior disagree。
- Evidence: `screenshots/search-part-keyboard-row-switch-1440x900.png`, `dom-metrics.json`。

## QC-DRAWER-R3-003 — P2 — 預覽文案說可重試，但沒有可發現的重試控制

- Routes: `/numbering/drawings?view=all`, `/numbering/search`
- Viewport: `1440x900`
- Selector: 2D preview fallback article
- Expected: 人話結論，下載與重試行動可直接發現。
- Actual: raw engineering terms = 0 and accessible download link exists; however the only retry cue is prose `稍後重試`，no link/button contains `重試`。
- Evidence: `screenshots/drawings-A0007-M01-1440x900.png`, `dom-metrics.json`。
