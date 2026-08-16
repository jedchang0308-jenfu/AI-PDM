# DEV-074 R14 QC full rerun

Status: `FAILED — STOPPED ON FIRST DEFECT`

- Scope: 58 rendered-UI journeys.
- Business mutations: rendered UI only.
- Direct API / DB mutations: 0.
- Result: **13 passed / 1 failed / 44 not run**.
- Passed: A01–A04, B01–B08, C01.
- Failed: C02 (`DEV074-R14-P1-010`).
- Stop reason: the UI-created recognition session remained at `等待辨識`; no recognition candidates were produced and all six review sections remained empty because the recognition worker had exited after a transient `ECONNREFUSED 127.0.0.1:3000`.
- Runtime-gate defect: `npm run dev:local:check` reported the environment healthy even though the recognition worker PID was stale and no worker process existed.
- Evidence: `screenshots/C02/waiting-worker-unavailable.png`, `tmp/local-dev/ai-pdm-recognition-worker.err.log`, and the stale PID value `42280`.
