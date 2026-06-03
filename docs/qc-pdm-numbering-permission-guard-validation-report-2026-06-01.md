# QC Validation Report - PDM Numbering Role Permission Guard

日期：2026-06-01
任務：DEV-PDM-NUMBERING-001
依據計畫：`docs/qa-pdm-numbering-permission-guard-validation-plan-2026-06-01.md`

## 驗證結論

通過。

角色矩陣權限已套用到主要 numbering API 與 sidebar UI guard。Admin 可切換 RD 權限；RD 權限關閉後，API 回 403 且 sidebar 隱藏入口；測試結束已還原 RD 原始權限。

## 執行項目

| 項目 | 結果 | 證據 |
|---|---|---|
| TypeScript | 通過 | `cmd /c node_modules\.bin\tsc.cmd --noEmit` exit 0 |
| Lint | 通過 | `npm.cmd run lint` exit 0；保留既有 `src/app/numbering/tasks/page.tsx:96` hook dependency warning |
| Build | 通過 | `cmd /c npm run build` exit 0；保留既有 Turbopack broad trace warnings |
| Core QC | 通過 | `npm.cmd run qc:pdm-numbering-core` 201/201 |
| Permission Guard UI/API QC | 通過 | `npm.cmd run qc:pdm-numbering-permission-guard-ui` 35/35 |

## 實際結果

- Schema seed：內建角色 page/action permissions 已建立，RD 預設不可批次審核。
- Repository：`checkNumberingPermission` 依 active role priority 判斷最高權限，並支援 delegated role 的 project/action scope。
- API：主要 numbering GET/POST/PATCH route 已改用 page/action permission guard。
- UI：sidebar 讀取 `/api/numbering/permissions`，無權限頁面入口會隱藏。
- E2E：RD `numbering.request` 關閉後，桌機與手機 sidebar 不顯示領號入口。
- E2E：RD `numbering.create` 關閉後，`POST /api/numbering/records` 回 403。
- E2E：測試結束還原 RD `numbering.request` 與 `numbering.create` 原始狀態。

## 問題與阻塞

- 未發現本輪阻塞。
- 既有 lint warning 未在本輪處理：`src/app/numbering/tasks/page.tsx:96` 的 `useEffect` missing dependency。
- 既有 build warning 未在本輪處理：`src/lib/config.ts`、`src/lib/llm-usage.ts`、`next.config.mjs` 的 Turbopack broad trace warning。
