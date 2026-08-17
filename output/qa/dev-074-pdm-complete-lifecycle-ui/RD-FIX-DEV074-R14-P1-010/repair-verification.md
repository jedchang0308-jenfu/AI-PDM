# DEV074-R14-P1-010 RD repair verification

Status: `PASS — TARGETED REPAIR VERIFIED`

- Defect: recognition worker exited after a transient application connection failure, while `dev:local:check` still reported a healthy environment.
- RD change 1: the continuous recognition worker now catches request-cycle failures, writes a bounded diagnostic, waits for a bounded reconnect interval, and retries. `--once` remains fail-fast.
- RD change 2: the managed local preflight now requires a live recognition-worker process, records its PID in runtime status, and exits non-zero when it is absent.
- Negative gate proof: with the stale worker PID and no live worker, `npm run dev:local:check` exited `1` and reported `the recognition worker is not running`.
- Recovery proof: `npm run dev:local` started recognition worker PID `28976`; a subsequent `npm run dev:local:check` exited `0` and explicitly reported `Recognition worker is running.`
- Rendered-UI proof: the already queued session `recognition-f3ffa08f-af38-4bd6-aed6-357e1e6485fe` advanced from `等待辨識` with six empty sections to `部分完成，待核對`, showing two source-role candidates and enabled review controls.
- UI evidence: `screenshots/queued-session-processed-after-worker-recovery.png`.
- Automated checks: `npm run qc:local-dev-entrypoint` PASS; `npm run qc:dev-068:contract` PASS; `npm run typecheck:app` PASS.
- Business mutation policy: rendered UI only. Runtime/process inspection and automated contract checks were read-only with respect to business records.

Disposition: targeted repair accepted. Per QC policy, R14 remains failed; acceptance requires a new full clean rerun from W0 through all 58 paths.
