# AI UX Scorecard

## 5-second understanding

- Object, code, name and responsibility-oriented status are visible on the first screen.
- One primary next action is visible.
- Mouse users can follow the primary action, but keyboard Enter cannot activate that native link.

| Dimension | Score | Evidence |
|---|---:|---|
| 定位與身分 | 2 | owner/search identity and subtitle match |
| 狀態語意 | 2 | A0007-M01 consistently shows 等他人處理; part shows 生產可用 |
| 下一步 | 1 | primary action is visible but Enter is intercepted |
| 連續查閱 | 2 | mouse and exact row keyboard switching pass; scroll resets |
| 風險與復原 | 2 | modal isolation, all close paths and zero-write boundary pass |
| 資訊負荷 | 2 | raw terms 0, reminders deduped, one primary CTA |

Total: **11/12 — FAIL** because 下一步 must be 2 and a P2 keyboard defect remains.
