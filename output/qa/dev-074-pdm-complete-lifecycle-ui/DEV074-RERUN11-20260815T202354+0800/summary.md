# DEV-074 R11 QC full rerun

Status: `FAILED — STOPPED AT B05`

- Scope: 58 rendered-UI journeys.
- Pass: 8; Fail: 1; Blocked: 0; Not Run: 49.
- Business mutations: rendered UI only.
- Direct API / DB mutations: 0.
- Defect: `DEV074-R11-P1-007` — the formal revision UI omitted a reused 3D logical reference.
- RD repair: targeted automated and fresh-session UI proof passed, but R11 was not rescored.
- Next run: R12 starts from W0 and must rerun all 58 paths.
