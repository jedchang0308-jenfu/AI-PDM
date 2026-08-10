# AI UX Scorecard - Early Stop

## 5 秒與操作事實

- A0007-M01 身分、狀態與下載替代路徑可直接理解。
- A0005-P02 / P03 的鍵盤焦點正確，但抽屜沒有切換；滑鼠對同一控制項可切換。
- 因連續查閱是核心情境且鍵盤操作與滑鼠結果矛盾，依 P0 立即停止。

| Dimension | Score | Evidence |
|---|---:|---|
| 定位與身分 | 2 | A0007 drawing identity matches owner/search |
| 狀態語意 | 2 | A0007-M01 is consistently `等他人處理` |
| 下一步 | 2 | Preview names download and reload path without fake retry |
| 連續查閱 | 0 | Enter/Space on P02/P03 leaves P01 open |
| 風險與復原 | 2 | Read-only run, zero writes; no risky action invoked |
| 資訊負荷 | 2 | Preview raw terms absent |

Total: **10/12 — FAIL** because one dimension is `0`; mandatory no-zero rule is not met.
