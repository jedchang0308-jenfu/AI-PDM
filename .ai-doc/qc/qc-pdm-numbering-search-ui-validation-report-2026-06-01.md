# QC 驗證報告：PDM 圖料號查詢與明細頁

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
對應 QA 計畫：`.ai-doc/qa/qa-pdm-numbering-search-ui-validation-plan-2026-06-01.md`

## 驗證結論

- [x] 通過。圖料號查詢 API、主根明細 API、查詢頁、`!` 提醒與 MA 圖作廢影響頁皆符合本輪驗證計畫。

## 執行項目

- [x] `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- [x] `npm.cmd run qc:pdm-numbering-core`
- [x] `npm.cmd run qc:pdm-numbering-search-ui`
- [x] `npm.cmd run lint`
- [x] `cmd /c npm run build`

## 實際結果

- [x] TypeScript 型別檢查通過。
- [x] `qc:pdm-numbering-core` 148/148 通過，包含 search/detail repository export、search API、root detail API、查詢頁 static check、側欄入口與 package script。
- [x] `qc:pdm-numbering-search-ui` 24/24 通過，覆蓋 Admin 登入、桌面 1440px、手機 390px、料號/圖號查詢、主根明細、warning marker、MA 圖作廢影響分析、圖號 filter、無 console error、無頁面層水平溢出。
- [x] `lint` 0 error；保留既有 `src/app/numbering/tasks/page.tsx` hook dependency warning，本輪未新增 lint error。
- [x] `build` 通過，新增 `/numbering/search`、`/api/numbering/search`、`/api/numbering/roots/[rootCode]` route。Turbopack 仍顯示既有 broad tracing warnings，非本輪新增阻塞。

## 證據

- [x] Search E2E seed 建立一組 DVT 主根、兩個料號、一張 MA 圖、同圖多料號差異欄位、warning event 與 audit log。
- [x] 桌面與手機皆能查到 seed 料號與圖號，開啟主根明細後顯示同圖件與 `!`。
- [x] 點擊 `影響範圍` 成功呼叫 `/api/numbering/impact-analysis`，頁面顯示受影響料號與需進版文件。
- [x] E2E 結束後清除 seed 資料。

## 問題與阻塞

- [x] 無本輪阻塞。
- [x] 已知既有警告：`src/app/numbering/tasks/page.tsx` 的 `useEffect` dependency lint warning，非本輪新增。
- [x] 已知既有警告：Next/Turbopack 對 `src/lib/config.ts`、`src/lib/llm-usage.ts`、`next.config.mjs` 的 broad tracing warning，非本輪新增。
