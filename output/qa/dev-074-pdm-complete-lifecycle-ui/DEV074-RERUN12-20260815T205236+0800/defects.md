# R12 defects

## DEV074-R12-P1-008 — terminal history retained a cancel mutation control

- Severity: P1
- Detected path: B07
- Status: RD fixed; targeted UI proof passed; clean full rerun required.
- Actual: after cancelling A0023-M05 through UI and reopening it with `包含歷史`, the history-only drawer still contained a disabled `取消圖號工作` button.
- Expected: terminal/history-only mutation controls are absent from the DOM; only read-only history and traceability remain.
- RD correction: render the cancel control only when server capability `canCancel` is true; transient busy state may disable it only while the action remains applicable.
- Checks: application typecheck passed; targeted rendered-UI reload showed `取消圖號工作` count = 0.
- Run disposition: R12 remains failed and R13 must rerun all 58 paths from W0.
