# QC Round 8 UX Scorecard

## 5 秒理解

| Surface | Object / identity | Visible status / responsibility | Natural next step | Close / continue | Risk | Result |
|---|---|---|---|---|---|---|
| Root | `A0007` / 馬達_JF_2HP_A in 圖料模組 | `待你處理`; tooltip says `檢查主圖` and `下一步：維護圖料關係` | One primary `檢查新版送審`; `待辦` is secondary | One inline X; list stays visible and clickable | `申請主根作廢` is red outline and not primary | Pass |
| Drawing | `A0007-M01` / 馬達_JF_2HP_A in 圖號工作台 | `等他人處理`; progress is delegated to another reviewer | One primary `查看進度` | One inline X; list remains selectable | No destructive action competes in first screen | Pass |
| Part | `A0001-P01` / 滑鼠_JF_A in 料號模組 | `待你處理`; shared status matches search | One primary `送審製造圖`; secondary tools are visually lower | One inline X; list remains selectable | No destructive action competes in first screen | Pass |
| Candidate modal | candidate name and cancel consequence are visible | Modal states cancel will stop editing and whether a number will be released | `返回檢查` or `確認取消保留號` | Escape returns to the candidate drawer | destructive choice is isolated in `alertdialog` | Pass |

## Operation cost

- Open from list: 1 action.
- Switch to another item while open: 1 action; no close/reopen.
- Close: 1 X action or 1 Escape.
- Status and primary CTA: visible in first screen.
- Same object from another module: identity, first-layer status and core sections remain the same.

## Six-dimension score

| Dimension | Score | Evidence |
|---|---:|---|
| 定位與身分 | 2 | module title + object code/name in all 1440 screenshots |
| 狀態語意 | 2 | A0007 list/drawer both `待你處理`; drawing `等他人處理`; tooltip explains responsibility |
| 下一步 | 2 | root/drawing/part each has one clear primary next action or progress action |
| 連續查閱 | 2 | one non-modal drawer; mouse/keyboard switching; scroll resets to 0 |
| 風險與復原 | 2 | candidate uses modal confirmation; Escape isolates modal; destructive action is secondary |
| 資訊負荷 | 2 | raw terms 0, reminder deduped to 1, part body identity duplicate 0, primary CTA count 1 |

**Total: 12/12.** No dimension is 0. Status, next step and risk/recovery are all 2.

