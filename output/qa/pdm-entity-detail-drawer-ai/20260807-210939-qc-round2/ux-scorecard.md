# AI UX scorecard

## 5-second answers

1. Object: root A0007 in the search drawer; drawing/part targets are identifiable by code.
2. Identity: code is clear, but the same drawing/part has different subtitle structure by entry route.
3. Status/responsibility: drawer status is human-readable, but A0007-M01 simultaneously shows `生產可用` in the list and `等他人處理` in the drawer.
4. Natural next step: root has one primary action, `檢查新版送審`.
5. Close/continue: inline X, Escape and mouse row switching work; keyboard Enter/Space on another row does not switch.
6. Risk: destructive actions are visually secondary and candidate cancellation has a modal confirmation.

## Scores

| Dimension | Score | Evidence |
|---|---:|---|
| 定位與身分 | 1 | `same-object-diff.json`: owner/search subtitle mismatch |
| 狀態語意 | 0 | Same page presents two unlabeled status truths for A0007-M01 |
| 下一步 | 2 | Root has one primary CTA: `檢查新版送審` |
| 連續查閱 | 1 | Mouse switch passes; Enter/Space on another row fails |
| 風險與復原 | 2 | Candidate modal Escape closes only modal; drawer remains |
| 資訊負荷 | 1 | Preview fallback exposes worker/key/Vault/environment-variable language |

Total: **7/12 — Fail**. A mandatory dimension is 0; status, identity and keyboard evidence contradict a pass.
