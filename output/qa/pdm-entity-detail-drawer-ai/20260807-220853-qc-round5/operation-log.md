# QC Round 5 Operation Log

## Conclusion

- Result: **FAIL**
- Blocking defect: `QC-DRAWER-R5-001` P2.
- Safety: canonical local data read-only; product writes = 0.
- Write lifecycle: Not Executed (Safety Boundary).

## Static Gate

| Command | Result |
|---|---|
| scoped ESLint | PASS, 0 errors / 0 warnings |
| `qc:pdm-entity-detail-drawer` | PASS 31/31 + exact-target runtime |
| `qc:dev-053:ui` | PASS 23/23 |
| `qc:dev-053:phase1h:ui` | PASS 12/12 |
| `qc:pdm-number-state-flow-ui` | PASS 8/8 |
| `qc:dev-055:contract` | PASS 13/13 |
| `typecheck` | PASS |
| `git diff --check` | PASS; CRLF warnings only |

## Hard Gate

| Case | Result |
|---|---|
| Mouse-open P01, P02 Enter | PASS: part_number/A0005-P02 |
| P03 Space | PASS: part_number/A0005-P03 |
| P02 Space | PASS: part_number/A0005-P02 |
| P03 Enter | PASS: part_number/A0005-P03 |
| Drawing/root Enter + Space cross-check | PASS, exact target each time |
| X Enter / Space | PASS; 44×44 control closes drawer |
| Native primary link Enter | **FAIL P2**: focused `<a>` remains on search; mouse click navigates correctly |

## Completed Regression Before Defect

- A0007-M01 hard reload + 5.5s: list already showed `等他人處理`; owner/search drawer identity, subtitle and status match.
- A0007-P01 owner/search identity, subtitle, status and seven core sections match.
- Root raw internal terms 0; reminder badge 1; warning title 1; primary CTA 1.
- Preview raw engineering terms 0; unsupported retry 0; download links 4; human next-step copy present.
- Mouse row switch reset drawer scroll 46.4 → 0.
- Mouse X, Escape and outside click each closed the drawer.
- Width 527 → 614; reload remained 614; restored to 526.4.
- Candidate alertdialog was modal; Escape closed only the dialog and preserved the drawer.
- 1440×900, 1024×768 and 390×844 had zero page/main-drawer horizontal overflow.
- Mobile status tooltip was within viewport; drawer body used overscroll containment and did not chain to page.
- Console errors/warnings and visible runtime failures: 0.

## Stop / Scope

The link defect was independently reproduced at 390×844 and 1440×900. QC did not modify product code and did not execute data writes.
