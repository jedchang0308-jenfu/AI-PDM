# RD/QC Report：RD 圖號料號生命週期狀態 UX 修復

日期：2026-06-07  
關聯任務：`DEV-UX-RD-LIFECYCLE-001`  
關聯 spec：`SPEC-UX-RD-LIFECYCLE-001`

## 背景

QA 以 RD 視角實測後判定原 UX 仍有 P0 問題：使用者完成領號後不知道此圖號 / 料號目前在哪個狀態、下一步誰接手、草稿是否還需要處理。既有生命週期提示偏頁面級，沒有綁定實際主根號、料號、圖號與 submission 狀態。

## RD 實作摘要

- 新增 `ObjectLifecycleStatusPanel`，將 Draft / Active / PendingReview / Released / Obsolete 等狀態轉成使用者語言、卡點、下一步與 CTA。
- 領號結果頁顯示「這張圖料現在在哪一步」，並把主根號、料號、圖號、品名與 Draft 缺口清楚列出。
- 領號結果的上傳 CTA 帶 query string 到 `/upload`，讓圖號、料號、品名可直接預填。
- `/upload` 支援 `source=numbering_draft`，顯示「從領號草稿接續送審」狀態面板，metadata 偵測不會用空值覆蓋預填資料。
- 首頁新增「我的開發中圖料」，從既有 `/api/numbering/search?recordStatus=Draft` 讀取草稿，不新增 schema/API。
- `/numbering/tasks` 新增「待送審草稿」區塊，避免 0 task 空狀態讓 RD 誤以為無事可做。
- `/numbering/search` drawer 在主根明細上方顯示物件級 lifecycle panel 與 contextual upload / impact / task CTA。

## QC 結果

- `npm.cmd run lint`：通過。
- `npm.cmd run qc:pdm-numbering-request-ui`：23/23 通過。
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:dashboard-quick-access`：16/16 通過。
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:dashboard-find-first`：16/16 通過。
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:pdm-numbering-search-ui`：28/28 通過。
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:pdm-numbering-task-center-ui`：22/22 通過。
- Playwright browser smoke：通過，建立 Draft `0057 / P-0057-001 / D-0057-MA1`，驗證首頁 Draft panel、`/upload` 預填、待辦草稿區與圖料 drawer lifecycle panel。

## Smoke 截圖

- `artifacts/ux-rd-lifecycle-implementation/dashboard-draft-workbench.png`
- `artifacts/ux-rd-lifecycle-implementation/upload-prefill.png`
- `artifacts/ux-rd-lifecycle-implementation/tasks-draft-list.png`
- `artifacts/ux-rd-lifecycle-implementation/search-object-status-drawer.png`

## 結論

此輪已將 RD lifecycle UX 從頁面說明補強為物件級狀態追蹤。RD 建立草稿後，首頁、待辦、領號結果、上傳頁與圖料 drawer 都能回答「現在在哪、卡什麼、下一步去哪」。殘留風險是目前仍沿用搜尋 API 讀取 Draft，尚未建立完整角色化 task feed；該項應回到 `DEV-UX-PLATFORM-002` 自適應任務路由處理。
