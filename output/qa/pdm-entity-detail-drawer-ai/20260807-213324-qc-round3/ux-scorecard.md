# AI UX Scorecard

## 5 秒答案

1. 物件與名稱清楚；drawing/part owner 與 search subtitle 已一致。
2. A0007-M01 初始狀態不可信：純查看會從 `生產可用` 改成 `等他人處理`。
3. Root 只有一個主要 CTA：`檢查新版送審`。
4. X、Escape、滑鼠列切換、寬度記憶皆直覺。
5. 圖料模組的 part keyboard target 錯開 root，破壞快速連續查閱。
6. 風險操作維持次要樣式，候選取消有 modal 且 Escape 只關 modal。

| Dimension | Score | Evidence |
|---|---:|---|
| 定位與身分 | 2 | owner/search title + subtitle match |
| 狀態語意 | 0 | hard reload status changes after opening drawer |
| 下一步 | 2 | one root primary CTA |
| 連續查閱 | 0 | search part Enter/Space opens root |
| 風險與復原 | 2 | modal isolation; zero writes |
| 資訊負荷 | 2 | root dedupe/raw terms fixed; preview wording humanized |

Total: **8/12 — FAIL**. Mandatory status dimension is 0.
