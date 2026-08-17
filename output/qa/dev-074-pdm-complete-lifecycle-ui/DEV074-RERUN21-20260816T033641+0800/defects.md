# R21 defects

## DEV074-R21-P1-017 — cancelled append workspace was retained but invisible in history UI

- Path: B07
- Severity: P1
- Primary-run result: failed
- Symptom: A0033-M05 disappeared from the normal work list after UI cancellation, but remained absent after the Owner selected “全部” and enabled “包含歷史”.
- Root cause: the relation repository correctly loaded the cancelled source workspace under formal root A0033, yet the list projection neither removed cancelled source changes when history was excluded nor rendered `activeChanges` / history identities inside the expanded relation tree.
- RD repair: history scope now filters cancelled candidate changes before root projection; expanded formal roots render each visible change identity with drawing/part codes and stage label, and the item opens its read-only candidate detail.
- Targeted rendered-UI retest: passed on the same retained A0033-M05. Normal scope hides it; history scope displays A0033-M05 as “已取消”; no restore or publish action is available.
- Evidence: `screenshots/B07/normal-hidden.png`, `screenshots/B07/history-visible-all-scope.png`.
- Clean-run gate: R22 must rerun all 58 paths from zero.
