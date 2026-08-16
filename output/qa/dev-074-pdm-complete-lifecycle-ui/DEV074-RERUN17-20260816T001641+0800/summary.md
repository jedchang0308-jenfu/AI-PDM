# DEV-074 R17 post-repair full QC rerun

Status: `FAILED`

- Scope: 58 rendered-UI journeys, restarted from A01 after the R16 repair.
- Business mutations: rendered UI only.
- Direct API / DB mutations: 0.
- Result at stop gate: 19 Pass, 1 Fail, 0 Blocked, 38 Not Run.
- Failed path: `C08`.
- Defect: `DEV074-R17-P1-013` — explicit N/A was still projected as a target-mapping blocker in the formal-write impact preview.
- RD repair: complete; typecheck, contract QC, isolated A0005 core QC, and rendered-UI preview regression all pass.
- This run remains permanently failed. A clean successor run must restart at A01.
