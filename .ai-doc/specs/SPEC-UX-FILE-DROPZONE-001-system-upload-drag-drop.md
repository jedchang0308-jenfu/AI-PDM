# SPEC-UX-FILE-DROPZONE-001: 全系統拖曳上傳 UX

狀態: Implemented
日期: 2026-06-07
專案: AI_PDM
文件類型: PM / UX / RD 規格
關聯任務: DEV-UX-FILE-DROPZONE-001

## 1. 目標

將系統內既有文件上傳入口統一為可拖曳、可點擊、可鍵盤操作的區塊式 dropzone，降低使用者從 Windows 檔案總管上傳 CAD、PDF、DWG、BOM XLS、圖號附件與料號附件的操作成本。

## 2. 範圍

本階段涵蓋目前 repo 內既有檔案上傳入口:

- `/upload` 送審上傳，多檔上傳。
- `/bom/workbench` SolidWorks BOM XLS 匯入，單檔上傳。
- `MasterAttachmentPanel` 圖號附件庫與料號附件庫，單檔上傳。

本階段不改後端 API、不新增全頁 overlay、不改 Google Drive / PDM 儲存流程。

## 3. UX 規格

- 上傳入口需支援拖曳檔案到區塊、點擊區塊開啟選檔、鍵盤 focus。
- 拖曳進入時要有明確 drag-over 視覺狀態。
- disabled 狀態需阻擋 click/drop，並保留可讀提示。
- 單檔上傳區若收到多個檔案，需拒絕並顯示錯誤，不自動取第一個。
- 檔案限制以現有 API/頁面邏輯為準，前端 dropzone 只負責基本 accept 與互動提示。
- mobile / drawer 內不得發生文字重疊、水平 overflow 或操作按鈕跳動。

## 4. 技術方案

- 新增共用 client component `FileDropzone`。
- `/upload` 改用共用 dropzone，保留現有 metadata detection、sidecar 分類與檔案清單。
- BOM 工作台 XLS 按鈕/hidden input 改為 compact dropzone。
- 主檔附件庫的原生 file input 改為 single-file dropzone，顯示已選檔案 chip 與清除動作。
- 新增 QC 腳本確認所有既有上傳入口已接上共用 dropzone。

## 5. 驗收標準

- `npm.cmd run qc:file-dropzone-ux` 通過。
- `npx.cmd tsc --noEmit` 通過。
- `npm.cmd run lint` 通過。
- `node node_modules/next/dist/bin/next build` 通過。
- Browser smoke 驗證 `/upload`、BOM 工作台、圖號附件庫、料號附件庫可看到 dropzone 並可載入頁面。

## 6. 實作結果

- 已新增共用 `FileDropzone` client component。
- `/upload`、`/bom/workbench`、圖號附件庫與料號附件庫已改用共用 dropzone。
- 單檔入口已支援多檔拖入拒絕提示。
- 本輪不改後端 API、不改 Google Drive 同步流程。
- 驗證完成日期: 2026-06-07。
