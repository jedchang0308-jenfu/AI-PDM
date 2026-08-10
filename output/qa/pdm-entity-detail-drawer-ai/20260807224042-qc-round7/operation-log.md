# QC Round 7 Operation Log

## Conclusion

- Result: **FAIL**
- Blocking defect: QC-DRAWER-R7-001 P0.
- Safety: canonical local data remained read-only; product writes = 0.
- Write lifecycle: Not Executed (Safety Boundary).

## Static Gate

| Command | Result |
|---|---|
| scoped ESLint | PASS, 0 errors / 0 warnings |
| qc:pdm-entity-detail-drawer | PASS 33/33 + exact-target runtime |
| qc:dev-053:ui | PASS 23/23 |
| qc:dev-053:phase1h:ui | PASS 12/12 |
| qc:pdm-number-state-flow-ui | PASS 8/8 |
| qc:dev-055:contract | PASS 13/13 |
| typecheck | PASS |
| git diff --check | PASS; CRLF warnings only |

## Keyboard / Tabs

- Search official/reserved: Enter and mouse round trip PASS; active aria-current PASS; Space/modifiers do not misfire; one controlled tab.
- Parts official/drafts: Enter and mouse round trip PASS; active aria-current PASS; Space/modifiers do not misfire.
- Drawings: live unified workbench intentionally has no owner tabs; legacy reserved URL normalized to view=work. Static shared-tab contract PASS; live tab round trip N/A.
- Root primary Enter and 待辦 Enter PASS.
- A0005-P02 Enter and A0005-P03 Space open the exact part; close X Enter/Space PASS; X is 44x44.
- Input/select/query button keyboard semantics PASS.

## Full Regression

- Drawing A0007-M01 owner/search identity, status and section skeleton PASS.
- Part A0001-P01 owner/search identity, status and section skeleton PASS; body identity duplicate count 0.
- Preview raw text 0; fake retry 0; download fallback controls present.
- Root raw code 0; duplicate reminder 1; visible primary CTA 1.
- Mouse/keyboard row switch uses one complementary non-modal drawer and resets scroll to 0.
- Outside click, Escape and mouse X close PASS.
- Resize 380 to 499; reload persisted 499; restored to 380.
- Candidate alertdialog is aria-modal=true; Escape closed dialog only and kept drawer; 0 writes.
- 1440x900, 1024x768 and 390x844 checks found page/drawer horizontal overflow 0; mobile drawer did not chain scroll to page.
- Mobile tooltip stayed within viewport; close target 44x44.
- Console warnings/errors and visible runtime failures: 0.

## P0 Stop

- Hard reload /numbering/search, wait for A0007, open root and wait 1.8 seconds.
- Same visible object simultaneously shows list status 生產可用 and drawer status 待你處理.
- Both are unlabeled primary status badges with 状態 aria-label, so the user cannot distinguish dimensions.
- Full result is FAIL even though all other executed regressions passed.