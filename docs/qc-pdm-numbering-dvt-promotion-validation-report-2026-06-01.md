# QC 驗證報告：PDM EVT 到 DVT 晉升清單

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
對應 QA 計畫：`docs/qa-pdm-numbering-dvt-promotion-validation-plan-2026-06-01.md`

## 驗證結論

- [x] 通過。DVT 晉升清單可列出 EVT 候選、分類完整/缺漏項目、批次送審完整項目，並支援保留 EVT、EVT 停用與作廢。

## 執行項目

- [x] `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- [x] `npm.cmd run qc:pdm-numbering-core`
- [x] `npm.cmd run qc:pdm-numbering-dvt-ui`
- [x] `npm.cmd run lint`
- [x] `cmd /c npm run build`

## 實際結果

- [x] TypeScript 型別檢查通過。
- [x] `qc:pdm-numbering-core` 172/172 通過，包含 DVT promotion approval rule seed、repository workflow、API route、頁面 static check、側欄入口與 package script。
- [x] `qc:pdm-numbering-dvt-ui` 23/23 通過。
- [x] 桌面流程：完整自製件加 MA 圖顯示可送審；缺 MA 自製件顯示待補/Override。
- [x] 批次送審後，完整自製件轉 DVT/PendingReview，並建立 `dvt_promotion` approval request。
- [x] 缺 MA 自製件批次送審時留在 EVT/Draft，之後可由 UI 執行 EVT 停用並轉 EVTDisabled。
- [x] API 可執行保留 EVT，料號維持 EVT/Draft。
- [x] API 可執行作廢，料號轉 Obsolete。
- [x] 桌面 1440px 與手機 390px 均無頁面層水平溢出，`scrollWidth - innerWidth = 0px`。
- [x] 桌面與手機皆無 browser console error。
- [x] `lint` 0 error，仍有既有 `src/app/numbering/tasks/page.tsx` `useEffect` dependency warning。
- [x] `build` 通過，route list 包含 `/numbering/dvt` 與 `/api/numbering/dvt-candidates`。

## 證據

- [x] `qc:pdm-numbering-core` 輸出：total 172、passed 172、failed 0。
- [x] `qc:pdm-numbering-dvt-ui` 輸出：total 23、passed 23、failed 0。
- [x] E2E DB 證據：完整件 `development_phase = DVT` 且 `record_status = PendingReview`。
- [x] E2E DB 證據：缺 MA 件批次後仍為 `EVT/Draft`，停用後為 `EVTDisabled`。
- [x] E2E DB 證據：保留 EVT 維持 `EVT/Draft`；作廢轉 `Obsolete`。

## 問題與阻塞

- [x] 未發現本輪阻塞。
- [x] 既有 lint warning：`src/app/numbering/tasks/page.tsx` hook dependency warning，非本輪新增。
- [x] 既有 build warning：`src/lib/config.ts`、`src/lib/llm-usage.ts`、`next.config.mjs` Turbopack broad tracing warning，非本輪新增。
