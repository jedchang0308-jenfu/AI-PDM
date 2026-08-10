# Defects

## QC-DRAWER-R5-001 — P2 — 主根抽屜主要連結無法用 Enter 啟動

- Route: `/numbering/search`
- Viewports: `390x844`, `1440x900`
- Fixture: root `A0007`
- Control: visible focused `<a href="/drawings/A0007-M01/submission-workbench">檢查新版送審</a>`
- Steps:
  1. Open root `A0007` drawer.
  2. Focus `檢查新版送審`.
  3. Press `Enter` and wait 1.5 seconds.
  4. Mouse-click the same link as control.
- Expected: Enter follows the native link exactly like mouse click.
- Actual: focus remains on the anchor, URL stays `/numbering/search`, and root drawer remains open. Mouse click navigates to `/drawings/A0007-M01/submission-workbench`.
- Impact: keyboard users cannot execute the visible primary next action; a global keyboard handler is likely intercepting native link activation.
- Evidence: `screenshots/search-root-link-enter-fail-1440x900.png`, `dom-metrics.json`.
