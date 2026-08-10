# QC operation log

## Conclusion

- Result: **FAIL**
- Safety: 0 product writes; canonical local data remained read-only.
- Static gate: all required commands passed.

## Static gate

| Command | Result |
|---|---|
| scoped ESLint | Pass |
| `qc:pdm-entity-detail-drawer` | Pass 25/25 |
| `qc:dev-053:ui` | Pass 23/23 |
| `qc:dev-053:phase1h:ui` | Pass 12/12 |
| `qc:pdm-number-state-flow-ui` | Pass 8/8 |
| `qc:dev-055:contract` | Pass 13/13 |
| `typecheck` | Pass |
| `git diff --check` | Pass; line-ending warnings only |

## Browser cases

| Case | Actual result | Decision |
|---|---|---|
| Same drawing across owner/search | Status matched, subtitle did not; search list and drawer showed conflicting statuses | Fail |
| Same part across owner/search | Status and core sections matched; subtitle structure did not | Fail |
| Root A0007 raw terms/reminders/CTA | Four specified raw terms 0; one human reminder; one primary CTA | Pass |
| Mobile status tooltip | Rect x=12, right=292 within 390 viewport; content visible; X 44x44 | Pass |
| Close keyboard/mouse | Enter, Space, Escape and mouse all closed | Pass |
| Part first-screen identity | Code/name not repeated in first body block; relation, attributes, cost and attachments discoverable | Pass |
| Row switching and reset | Mouse switch A0007-M01 → A0005-M01 used one drawer and reset scrollTop to 0 | Pass |
| List keyboard activation | Enter/Space focused A0005-M01 but left drawer on A0007-M01; mouse switched correctly | Fail |
| Outside close | Background click closed drawer | Pass |
| Width persistence | 420 → 538.2; reload 538; restored 420 | Pass |
| Candidate dialog isolation | `alertdialog`, modal; Escape closed dialog and kept drawer | Pass |
| Responsive overflow | 1440x900, 1024x768 and 390x844 had no page/drawer horizontal overflow | Pass |
| Mobile scroll ownership | drawer 0 → 604.8; body stayed 0 | Pass |
| Visible error / console | No non-empty visible alerts; no console error/warning | Pass with text-noise defect |
| Real write lifecycle | Not executed: no disposable boundary | Not Executed (Safety Boundary) |

## Screenshots

- `screenshots/search-A0007-M01-list-drawer-status-1440x900.png`
- `screenshots/drawings-A0007-M01-1440x900.png`
- `screenshots/search-A0007-M01-1440x900.png`
- `screenshots/parts-A0007-P01-1440x900.png`
- `screenshots/search-A0007-root-1440x900.png`
- `screenshots/drawings-A0007-M01-status-tooltip-390x844.png`
- `screenshots/parts-A0007-P01-390x844.png`
- `screenshots/drawings-keyboard-row-enter-fail-1440x900.png`
- `screenshots/candidate-cancel-modal-1440x900.png`
