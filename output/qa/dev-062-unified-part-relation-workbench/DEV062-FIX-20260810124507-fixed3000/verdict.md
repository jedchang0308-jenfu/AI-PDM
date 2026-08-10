# DEV-062 fixed local QA/QC verdict

Run: `DEV062-FIX-20260810124507-fixed3000`

Verdict: **PASS / Fixed Local Runtime / Release Gated**

- Fixed `127.0.0.1:3000` status reports `partRelationWorkbench.enabled=true` and `requested=true`.
- `/parts` hard reload renders `料號工作台`; legacy tab DOM and reserved-tab links are both 0.
- `/numbering/search` hard reload renders `圖料工作台`; legacy tab DOM and reserved-tab links are both 0.
- Part displays 19 formal rows and 4 candidate rows in one list; Relation displays formal and candidate signals in one root list.
- Legacy `?tab=reserved` URLs canonicalize to `?view=work` without restoring a second page.
- `建立保留號` remains a same-page modal action; QC opened and closed it without submitting.
- Visible alerts, horizontal overflow, final app console errors/warnings and server unexpected errors/5xx are 0.
- Core 6/6, compatibility 8/8, Part and Relation focused suites, TypeScript and `dev:local:check` all pass.
- UI layout amendment PASS：1920×799 實際 Chrome 展開第一筆後，根號／名稱／狀態同列，並依序呈現「圖號」灰底列與「料號」膠囊；drawing rows=1、part chips=1、legacy tabs=0、reserved links=0、visible alerts=0、horizontal overflow=false。截圖：`screenshots/relation-ui-reference-layout-20260810.png`。
- 紅線文字移除 PASS：展開 `A0005` 後僅保留 `A0005-M01` 與 `A0005-P01/P02/P03` 代碼；用途／數量／品名文字均不在展開樹中。截圖：`screenshots/relation-redline-removed-20260810.png`。
- 圖號／料號視覺一致性 PASS：兩者 computed style 的白底、8px 圓角、30px 高度、`4px 8px` 內距與代碼粗體一致；`visualStyleMatch=true`。截圖：`screenshots/relation-drawing-same-as-part-20260810.png`。
- 圖號明細 disclosure PASS：非歷史區塊 `details=0`，僅保留「歷史版本」本體與 2 個版次明細；歷史開啟／關閉 `true → false`。實際 Chrome 截圖：`drawing-non-history-always-open-20260810.png`、`drawing-non-history-always-open-management-20260810.png`、`drawing-non-history-always-open-lower-20260810.png`。
- 圖號明細紅線精簡 PASS：移除「更多」管理卡、參考附件／已刪除資料、同根料號「補成本／編輯」與狀態冗餘；保留受控檔案、歷史版本、料號必要資料與資料維護三個入口。`removedTextPresent=false`、`details=3`、visible alerts=0、horizontal overflow=false。實際 Chrome 截圖：`drawing-redline-simplified-20260810.png`、`drawing-redline-simplified-lower-20260810.png`、`drawing-redline-simplified-maintenance-20260810.png`。
- 頂端 header 版面 PASS：正式圖號小標移除，`A0005-M01`、品名、`研發可用` 同列，`建立新版次` 與關閉按鈕保留；`inlineHeader=true`、`eyebrowPresent=false`、visible alerts=0、horizontal overflow=false。實際 Chrome 截圖：`drawing-header-target-20260810.png`。

The application-level feature default and production activation remain release-gated. No staging, production, schema, live data, commit, deploy or release action was performed.
