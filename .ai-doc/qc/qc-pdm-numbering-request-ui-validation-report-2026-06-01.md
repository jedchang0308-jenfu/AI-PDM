# QC 驗證報告：PDM 圖料號申請精靈

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
對應 QA 計畫：`.ai-doc/qa/qa-pdm-numbering-request-ui-validation-plan-2026-06-01.md`

## 驗證結論

- [x] 通過。圖料號申請精靈可建立客製尺寸料號、先料號後圖號、自製件同步 MA 圖號，且查重 warning 不阻擋建立。
- [x] 後端已確認 `itemKind=shared` 會被視為共用料號，必須提供共用理由。

## 執行項目

- [x] `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- [x] `npm.cmd run qc:pdm-numbering-core`
- [x] `npm.cmd run qc:pdm-numbering-request-ui`
- [x] `npm.cmd run lint`
- [x] `cmd /c npm run build`

## 實際結果

- [x] TypeScript 型別檢查通過。
- [x] `qc:pdm-numbering-core` 161/161 通過，包含 `part_numbers.custom_specification`、`/api/numbering/records`、申請精靈 UI static check、側欄入口、共用件後端正規化。
- [x] `qc:pdm-numbering-request-ui` 20/20 通過。
- [x] 桌面 1440px：Admin 登入、申請精靈載入、查重 warning 顯示、客製尺寸料號建立、取消同步圖號、DB 保存客製規格、drawing count 為 0。
- [x] 手機 390px：Admin 登入、申請精靈載入、自製件同步 MA 圖建立、結果顯示圖號、DB drawing count 為 1。
- [x] 桌面與手機皆無頁面層水平溢出，`scrollWidth - innerWidth = 0px`。
- [x] 桌面與手機皆無 browser console error。
- [x] `lint` 0 error，仍有既有 `src/app/numbering/tasks/page.tsx` `useEffect` dependency warning。
- [x] `build` 通過，`/numbering/request` 為 static route，`/api/numbering/records` 為 dynamic route。

## 證據

- [x] `qc:pdm-numbering-core` 輸出：total 161、passed 161、failed 0。
- [x] `qc:pdm-numbering-request-ui` 輸出：total 20、passed 20、failed 0。
- [x] E2E DB 證據：客製尺寸料號保存 `custom_specification = "L120 x W30 x H8"`，且未建立圖號。
- [x] E2E DB 證據：自製件同步建立 MA 圖號，該料號 drawing count 為 1。
- [x] Production build route list 包含 `/numbering/request` 與 `/api/numbering/records`。

## 問題與阻塞

- [x] 未發現本輪阻塞。
- [x] 既有 lint warning：`src/app/numbering/tasks/page.tsx` hook dependency warning，非本輪新增。
- [x] 既有 build warning：`src/lib/config.ts`、`src/lib/llm-usage.ts`、`next.config.mjs` Turbopack broad tracing warning，非本輪新增。
