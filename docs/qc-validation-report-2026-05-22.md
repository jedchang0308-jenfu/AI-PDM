# AI PDM QC 驗證報告 — Phase 4: Google Cloud Function Release

日期：2026-05-22  
角色：QC  
測試範圍：Phase 4: Google Cloud Function Release & 整合驗證  
測試環境：Windows, Node.js v24.12.0, npm 11.6.2, Next.js 16.2.6, SQLite  
測試 URL：`http://127.0.0.1:3000`

---

## 1. 最終判定

QC 判定：**PASS (完全通過)**

### 判定理由：
- **功能完整性**：Cloud Function (`cloud-functions/release-handler`) 的架構與主程式已建立，包含 Token 驗證、Stateless Folder Routing、強健的冪等性（Idempotency）以及全角色 `.appProperties` 寫入。
- **本地整合修改**：本地端 `release.ts` 與 fallback `local-gdrive` 機制皆已完美解鎖 PDF 限制並對應 PascalCase 的防偽中繼資料規格。
- **自動化回歸測試**：
  - `npm.cmd run lint`：通過（無任何程式碼風格或語法錯誤）。
  - `npm.cmd run build`：通過（無任何型別檢查或編譯阻礙）。
  - `npm.cmd run qc:api`：通過（71/71 測項全數成功，且無 regression 問題）。

---

## 2. 測試執行摘要與歷史紀錄

| 類別 | 結果 | 備註 |
|---|---|---|
| 專案結構檢查 | Pass | `package.json`, `index.js`, `.gcloudignore`, `README.md` 全數建立 |
| 依賴套件安裝 | Pass | 於 `cloud-functions/release-handler` 成功執行 `npm install` |
| 靜態程式碼分析 | Pass | `npm.cmd run lint` 0 errors |
| 專案生產編譯 | Pass | `npm.cmd run build` 成功完成 TypeScript 型別與路由編譯 |
| API 整合回歸測試 | Pass | 71/71 測試成功（包含重試、二階段審核、同名檔案防範與 Auth 權限） |
| 防偽中繼資料檢視 | Pass | 欄位符合 PascalCase 設計規範，解除 PDF 單一類型限制 |

---

## 3. 測試細項與驗證邏輯

### 3.1. 專案合規性審查 (`cloud-functions/release-handler`)
- **`package.json`**：設定 `functions-framework` 與 `googleapis` 依賴。
- **`index.js`**：
  - **安全性**：比對 `Authorization` Header 與 `process.env.API_TOKEN` 做驗證。
  - **冪等性**：事前呼叫 `drive.files.get` 取回 parents 與 `appProperties`。若確認檔案已在 Released 資料夾且防偽資料無誤，則自動跳過移轉（Idempotent Skip），不重複引發 Drive 錯誤。
  - **跨格式中繼資料**：不論是 `.pdf` 還是 `.dwg`/`.sldprt`/`.sldasm`/`.slddrw` 等 CAD 原始檔，皆會被寫入 `appProperties`，欄位完全符合設計文件：
    - `Status`: `"Official"`
    - `SubmissionId`
    - `DrawingNumber`
    - `Revision`
    - `ApprovedBy`
    - `ApprovedAt`
- **`.gcloudignore`**：正確排除 `node_modules` 與敏感金鑰。

### 3.2. 本地端 Backend 改造 (`src/lib/release.ts`)
- 解除 `pdf` 檔案過濾條件，使 `local-gdrive` fallback 下也能完美適用 CAD 原始檔的防偽標記。
- 呼叫 Cloud Function 時，將 `pendingFolderId`, `releasedFolderId` 以及 `approvedAt` (ISO-8601 string) 自動包入 HTTP Payload，落實 stateless 機制。

### 3.3. 自動化測試執行截圖（紀錄）
1. 啟動 Next.js 伺服器：`Ready in 620ms`。
2. 執行 API Regression Suite `npm.cmd run qc:api`：
   - 包含 `REL-004` (重複 Released 檔名拋 500 並轉為 `ReleaseFailed`) 測試通過。
   - 包含 `WF-010` 二階段審定自動觸發發布測試通過。
   - 最終報告輸出：`71 passed / 0 failed`，全功能綠燈。

---

## 4. 未來上線與維運建議

1. **GCP 環境變數配置**：
   在真正執行 `gcloud functions deploy` 時，必須在環境變數中設定與 Next.js 專案 `RELEASE_FUNCTION_TOKEN` 相同的 `API_TOKEN` 值。
2. **ADC (Application Default Credentials) 授權**：
   Cloud Function 的 Runtime 服務帳戶（Service Account）必須在 Google Workspace 或目標 Google Drive 中被顯式賦予對 Pending 與 Released 資料夾的「編輯者」權限，否則 Drive API 將回傳 `403/404` 錯誤。

---

**QC 判定最終結論：Phase 4 開發任務合格，准予合流（Merge）並交付下階段測試部署。**
