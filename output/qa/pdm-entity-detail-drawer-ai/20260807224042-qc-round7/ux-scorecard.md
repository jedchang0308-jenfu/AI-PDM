# AI UX Scorecard

## Result

**FAIL — 10/12 but contains a critical 0.**

| Dimension | Score | Evidence |
|---|---:|---|
| 定位與身分 | 2 | root/drawing/part/candidate identity is clear in header and metadata |
| 狀態語意 | 0 | A0007 simultaneously shows 生產可用 and 待你處理 as the same unlabeled status concept |
| 下一步 | 2 | root shows one visible primary CTA 檢查新版送審 |
| 連續查閱 | 2 | one click switches entity; drawer remains open; scroll resets |
| 風險與復原 | 2 | danger action opens alertdialog; Escape isolates modal; 0 writes |
| 資訊負荷 | 2 | root raw=0, reminder=1, primary=1; part body identity duplication=0 |

Threshold is not met because no dimension may be 0 and 狀態語意 must be 2.

## 5-second answers

1. Object identity: PASS.
2. Name/code: PASS.
3. Current status / responsibility: FAIL for A0007 because two visible badges contradict.
4. Natural next step: PASS in drawer.
5. Close and continue browsing: PASS.
6. Risky action separation: PASS.