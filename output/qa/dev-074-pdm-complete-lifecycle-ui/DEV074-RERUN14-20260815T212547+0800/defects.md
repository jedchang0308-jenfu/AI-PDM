# R14 defects

## DEV074-R14-P1-010 — recognition worker exits and local health check reports false healthy

- Path: W0 / C02
- Severity: P1 critical flow unavailable and preflight false-positive
- UI reproduction: owner uploads the same 2D/3D SolidWorks files to the 0.2 revision package through the rendered revision UI, clicks `開始辨識`, and opens the rendered recognition review page.
- Expected: the background worker claims the UI-created session and moves it to a reviewable result; the local preflight must fail whenever this required worker is absent.
- Actual: the page remains at `等待辨識`, all six recognition sections are empty, and both review actions are disabled. The worker log shows an uncaught `fetch failed` caused by `ECONNREFUSED 127.0.0.1:3000`, after which PID `42280` no longer exists. Despite that, `npm run dev:local:check` exits successfully and prints `AI_PDM is healthy.`
- Root cause: continuous worker polling has no top-level retry boundary; additionally, the `-CheckOnly` branch validates the 3D worker and optional 2D worker but omits `Get-RecognitionWorkerProcessInfo`.
- Data integrity: the failed recognition session produced no formal attribute writes. Business mutations before the defect were performed through rendered UI only; read-only process/log diagnostics were used to establish cause.
- Evidence: `screenshots/C02/waiting-worker-unavailable.png` and `tmp/local-dev/ai-pdm-recognition-worker.err.log`.
- Disposition: R14 stopped. RD must make continuous polling reconnect-safe and make the managed preflight reject a missing recognition worker before a new full rerun.
