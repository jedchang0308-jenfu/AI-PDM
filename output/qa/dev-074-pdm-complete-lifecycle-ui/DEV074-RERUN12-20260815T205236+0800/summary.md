# DEV-074 R12 QC full rerun

Status: `FAILED — STOPPED AT B07`

- Scope: 58 rendered-UI journeys.
- Business mutations: rendered UI only.
- Direct API / DB mutations: 0.
- Pass: 7; Fail: 1; Blocked: 0; Not Run: 50.
- Defect: `DEV074-R12-P1-008` — terminal history retained a disabled cancel mutation control.
- RD repair: typecheck and targeted UI proof passed; R12 was not rescored.
- Next run: R13 starts from W0 and reruns all 58 paths.
