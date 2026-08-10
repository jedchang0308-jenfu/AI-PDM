# Defects

## QC-DRAWER-R6-001 — P2 — Search 分頁連結無法用 Enter 啟動

- Route: `/numbering/search`
- Viewport: `1440x900`
- Control: visible `<a href="/numbering/search?tab=reserved">保留號</a>`
- Steps:
  1. Hard-open `/numbering/search` and wait until the relation list is ready.
  2. Focus `保留號` and press unmodified `Enter`.
  3. Wait 1.2 seconds and inspect `activeElement` and URL.
  4. Mouse-click the same anchor as the control.
- Expected: Enter follows the anchor to `/numbering/search?tab=reserved`, matching mouse behavior and native link semantics.
- Actual: `activeElement` remained the `A` element with the expected href, but URL stayed `/numbering/search`. Mouse click immediately navigated to `/numbering/search?tab=reserved`.
- Additional evidence: computed focus style was `outline: none`, `box-shadow: none`, and a transparent bottom border, so the focused tab link also had no visible keyboard-focus treatment.
- Impact: keyboard users cannot open the reserved-number tab from this visible search-page anchor. The anchor bridge fixes the root primary link but does not provide complete search-page anchor behavior.
- Evidence: `screenshots/search-reserved-link-enter-fail-1440x900.png`, `dom-metrics.json`.
