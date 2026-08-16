# Defects

## QC-DRAWER-R4-001 — P0 — 圖料工作台料號鍵盤操作沒有切換精確目標

- Route: `/numbering/search`
- Viewport: `1440x900`
- Fixture: expanded `A0005` with `A0005-P01/P02/P03`
- Control semantics: native enabled `<button type="button">`.
- Steps:
  1. Mouse-open `A0005-P01`.
  2. Focus `A0005-P02` and press `Enter`; wait 3 seconds.
  3. Focus `A0005-P03` and press `Space`; wait 3 seconds.
  4. As a control, mouse-click `A0005-P02`.
- Expected: the shared drawer switches to `part_number/A0005-P02`, then `part_number/A0005-P03`.
- Actual: active focus is correctly on P02/P03, but both key paths leave the drawer at `part_number/A0005-P01`. Mouse click on P02 immediately switches to `part_number/A0005-P02`.
- Impact: keyboard users cannot continuously inspect the selected part; automation source assertions report a false pass.
- Evidence: `screenshots/search-part-keyboard-row-switch-1440x900.png`, `dom-metrics.json`.
