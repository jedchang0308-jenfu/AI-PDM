# QC Round 6 Operation Log

## Conclusion

- Result: **FAIL**
- Blocking defect: `QC-DRAWER-R6-001` P2.
- Safety: canonical local data remained read-only; product writes = 0.
- Write lifecycle: Not Executed (Safety Boundary).

## Static Gate

| Command | Result |
|---|---|
| scoped ESLint | PASS, 0 errors / 0 warnings |
| `qc:pdm-entity-detail-drawer` | PASS 32/32 + exact-target runtime |
| `qc:dev-053:ui` | PASS 23/23 |
| `qc:dev-053:phase1h:ui` | PASS 12/12 |
| `qc:pdm-number-state-flow-ui` | PASS 8/8 |
| `qc:dev-055:contract` | PASS 13/13 |
| `typecheck` | PASS |
| `git diff --check` | PASS; CRLF warnings only |

## Keyboard Hard Gate

| Case | Result |
|---|---|
| A0007 root `檢查新版送審` Enter | PASS: `/drawings/A0007-M01/submission-workbench` in 605 ms |
| Root primary mouse control | PASS: same destination |
| Root primary Space | PASS: no navigation |
| Root primary Shift/Ctrl/Alt/Meta+Enter | PASS: current tab and controlled-tab count unchanged |
| Drawer `待辦` Enter | PASS: `/numbering/tasks` |
| Search tab `保留號` Enter | **FAIL P2**: focused anchor stayed on `/numbering/search` |
| Search tab `保留號` mouse control | PASS: `/numbering/search?tab=reserved` |

## Stop / Scope

The first newly found P2 ended the run as required. P02/P03 exact-part, close-button regression, same-object owner/search comparison, three-viewport layout, resize, modal isolation and the full UX score were not rerun after the hard failure. Round 5 evidence was read for orientation only and was not reused as Round 6 pass evidence.

Console errors, warnings and visible runtime failures at the failure surface were 0. Page-level horizontal overflow at 1440×900 was 0.
