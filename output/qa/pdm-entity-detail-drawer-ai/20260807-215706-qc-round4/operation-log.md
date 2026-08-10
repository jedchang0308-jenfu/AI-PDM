# QC Round 4 Operation Log

## Conclusion

- Result: **FAIL**
- Blocking defect: `QC-DRAWER-R4-001` P0.
- Safety: canonical local data read-only; product writes = 0.
- Stop rule: full regression stopped when P0 was reproduced.

## Static Gate

| Command | Result |
|---|---|
| scoped ESLint | PASS, 0 errors / 0 warnings |
| `qc:pdm-entity-detail-drawer` | PASS 31/31 |
| exact target runtime included by focused QC | PASS |
| `qc:dev-053:ui` | PASS 23/23 |
| `qc:dev-053:phase1h:ui` | PASS 12/12 |
| `qc:pdm-number-state-flow-ui` | PASS 8/8 |
| `qc:dev-055:contract` | PASS 13/13 |
| `typecheck` | PASS |
| `git diff --check` | PASS; CRLF warnings only |

## Round 3 Hard Reverification

| Case | Result |
|---|---|
| Search A0007-M01 initial status truth | PASS: hard reload + 5.5s showed `等他人處理` before open; list and drawer remained the same after open |
| Search part keyboard exact target | **FAIL P0**: Enter on P02 and Space on P03 left drawer at P01; mouse on P02 switched correctly |
| Preview wording/capability parity | PASS: human text, no raw runtime terms, discoverable download, no unsupported retry promise |

## Not Executed After P0

- Remaining owner/search part parity, candidate modal, width persistence, all close paths, mobile tooltip, 1024/390 responsive and full UX scorecard were intentionally not rerun after the P0 stop condition.
- Protected DB guard suites and real write lifecycle were not executed; guards were not bypassed.
