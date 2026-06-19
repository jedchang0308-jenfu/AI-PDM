# QC 驗證報告：PDM MA 圖作廢影響範圍頁

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
對應 QA 計畫：`.ai-doc/qa/qa-pdm-numbering-impact-ui-validation-plan-2026-06-01.md`

## 驗證結論

- [x] 通過。MA 圖作廢影響範圍頁可分析受影響料號、顯示文件進版待辦，並在確認後套用失效。

## 執行項目

- [x] `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- [x] `npm.cmd run qc:pdm-numbering-core`
- [x] `npm.cmd run qc:pdm-numbering-impact-ui`
- [x] `npm.cmd run lint`
- [x] `cmd /c npm run build`

## 實際結果

- [x] TypeScript 型別檢查通過。
- [x] `qc:pdm-numbering-core` 152/152 通過，包含 impact page static check、側欄入口與 `qc:pdm-numbering-impact-ui` package script。
- [x] `qc:pdm-numbering-impact-ui` 24/24 通過，覆蓋 Admin 登入、桌面 1440px、手機 390px、MA 圖分析、受影響 Active/Released 料號、文件進版待辦、`!` 提醒、套用失效、DB 狀態轉 `MainDrawingInvalid`、無 console error、無頁面層水平溢出。
- [x] `lint` 0 error；保留既有 `src/app/numbering/tasks/page.tsx` hook dependency warning，本輪未新增 lint error。
- [x] `build` 通過，新增 `/numbering/impact` static route。Turbopack 仍顯示既有 broad tracing warnings，非本輪新增阻塞。

## 證據

- [x] E2E seed 建立一張 MA 圖對兩個料號，一個 Active、一個 Released。
- [x] 影響分析顯示兩個受影響料號與 `Released PDF package` 等文件進版待辦。
- [x] 勾選確認後執行套用失效，API 回 200，DB 驗證兩個受影響料號皆轉 `MainDrawingInvalid`。
- [x] E2E 結束後清除 seed 資料。

## 問題與阻塞

- [x] 無本輪阻塞。
- [x] 測試時 `127.0.0.1` 觸發 Next 16 dev resource cross-origin 限制，改用 `localhost` 後通過；產品 build 不受此 dev server host 限制影響。
- [x] 已知既有警告：`src/app/numbering/tasks/page.tsx` 的 `useEffect` dependency lint warning，非本輪新增。
- [x] 已知既有警告：Next/Turbopack 對 `src/lib/config.ts`、`src/lib/llm-usage.ts`、`next.config.mjs` 的 broad tracing warning，非本輪新增。
