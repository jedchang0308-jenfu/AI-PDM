# QC Round 3 Operation Log

## Conclusion

- Result: **FAIL**
- Safety: canonical local data read-only; product writes = 0。
- Static Gate: all required commands passed。

## Static Gate

| Command | Result |
|---|---|
| scoped ESLint | PASS, 0 errors / 0 warnings |
| `qc:pdm-entity-detail-drawer` | PASS 29/29 |
| `qc:dev-053:ui` | PASS 23/23 |
| `qc:dev-053:phase1h:ui` | PASS 12/12 |
| `qc:pdm-number-state-flow-ui` | PASS 8/8 |
| `qc:dev-055:contract` | PASS 13/13 |
| `typecheck` | PASS |
| `git diff --check` | PASS; CRLF warnings only |

## Browser Results

| Case | Result |
|---|---|
| Drawing owner list vs drawer status | PASS: both `等他人處理` |
| Drawing owner/search drawer identity | PASS: `A0007-M01 / 馬達_JF_2HP_A` |
| Search initial status truth | **FAIL**: `生產可用` → `等他人處理` after open |
| Part owner/search identity/status | PASS: `A0007-P01 / 馬達_JF_2HP_A / 生產可用` |
| Preview raw terms | PASS: worker/Document Manager/Vault/env counts 0 |
| Preview actions | **FAIL P2**: download discoverable; no retry control |
| Drawing row Enter/Space switch | PASS: A0007→A0005→A0007 |
| Search part Enter/Space switch | **FAIL P0**: P02/P03 opened root A0005 |
| Input Enter isolation | PASS: did not switch entity |
| Close | PASS: Enter, Space, Escape, mouse, outside click |
| Shell | PASS: complementary, non-modal, one inline 44px X |
| Mouse switch/scroll reset | PASS: scroll 132→0; one drawer |
| Width persistence | PASS: 420→542; reload 542; restored 421 |
| Root noise/CTA | PASS: specified raw terms 0, one reminder, one primary CTA |
| Part first screen | PASS: no repeated identity; relation/attributes/cost/attachments discoverable |
| Tooltip mobile bounds | PASS: x=12, right=292 within 390 |
| RWD/overflow | PASS for 1440x900, 1024x768, 390x844 on tested routes |
| Mobile scroll ownership | PASS: drawer 0→338.4; body stayed 0 |
| Candidate dialog isolation | PASS: alertdialog modal; Escape kept drawer; 0 writes |
| Console / visible error | PASS: 0 error, 0 warning, 0 visible runtime failure |
| Real write lifecycle | Not Executed (Safety Boundary) |

## Evidence

- See `screenshots/`, `dom-metrics.json`, `same-object-diff.json`, `console-network.json`, `ux-scorecard.md`, `defects.md`, and `cleanup.json`。
