# RD Report: DEV-UX-PLATFORM-001 多角色平台 UX Phase 1A/1B

日期：2026-06-02

## 修改內容

- 將 sidebar 從平鋪功能清單改為平台分群導覽：工作台、專案 / 圖料、BOM、變更 / 審核、發行 / 交接、管理。
- 在首頁新增「多角色工作台」，以我的待辦、我要開始、我要追蹤、我要交接輸出、系統建議五種工作意圖提供入口。
- 新增共用 `WorkflowStrip` 元件，並接入上傳送審、領號申請、BOM 工作台、BOM 審核、圖號待辦、總表匯入、MA 影響分析、製造交接。
- 新增共用 `NextStepState` 元件，將關鍵空狀態與完成狀態改為「說明目前狀態 + 可執行下一步」。
- 將待辦中心、總表匯入、MA 影響分析、BOM 工作台、BOM 審核、製造交接、首頁明細與通知/圖面清單接上下一步 CTA。
- 上傳完成與領號完成狀態補上合理後續入口，避免使用者完成單一步驟後停住。
- 調整匯入中心、MA 影響分析、BOM 審核的標題/狀態文案，避免與既有標題或 badge 重複造成 Playwright strict locator 不穩。
- 補齊首頁搜尋 placeholder 的 metadata 範圍，並讓最近圖號在選取圖面時即時同步，避免 detail 載入後 select 狀態延遲。
- 補上 desktop / mobile 響應式樣式，避免新增工作台與流程定位造成水平溢出。

## 主要檔案

- `src/components/sidebar-nav.tsx`
- `src/components/dashboard.tsx`
- `src/components/workflow-strip.tsx`
- `src/components/next-step-state.tsx`
- `src/components/dashboard/layout-parts.tsx`
- `src/app/globals.css`
- `src/app/styles/responsive.css`
- `src/app/upload/page.tsx`
- `src/app/numbering/request/page.tsx`
- `src/app/numbering/tasks/page.tsx`
- `src/app/numbering/imports/page.tsx`
- `src/app/numbering/impact/page.tsx`
- `src/app/bom/workbench/page.tsx`
- `src/app/bom/reviews/page.tsx`
- `src/app/handoff/page.tsx`
- `.ai-doc/dev_task.md`

## 殘留風險

- 本次未建立完整自適應任務排序引擎；已另開 `DEV-UX-PLATFORM-002` 作為 Phase 3 backlog，後續需定義資料模型、角色視角與排序權重。
- QA/QC 專屬模組尚未產品化的入口仍以現有報告、證據與阻塞摘要承接，後續若要做完整品質工作台需另立任務。
