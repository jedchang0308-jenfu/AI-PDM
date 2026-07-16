# AI PDM QC 驗證報告

日期：2026-05-15  
角色：QC  
測試範圍：MVP Web/API 可驗證範圍  
測試環境：Windows, Node.js v24.12.0, npm 11.6.2, Next.js 16.2.6, SQLite  
測試 URL：`http://127.0.0.1:3000`

## 1. 結論

QC 判定：**Conditional Fail**

原因：

- 自動化驗證、API 負面測試、狀態機測試、UI 基本驗證、AI 基本驗證皆通過。
- 但檔案庫交叉檢查發現 1 個未被 DB 追蹤的 orphan file，屬於 P1 缺陷。
- SolidWorks Add-in、Google Drive、Cloud Function 正式發布、登入權限、離線備份仍未實作，這些是正式 PDM 上線前的 P0 阻擋項。

本次調用的思考習慣：

- #來源品質SourceQuality：同時檢查 command output、API、UI、DB、檔案系統。
- #找對問題RightProblem：不是只看 smoke test 通過，而是檢查是否產生不可追溯檔案。
- #系統思考SystemsThinking：驗證資料流從 API 到 DB、repository、UI、AI 回答的一致性。
- #風險緩解RiskMitigation：將未追蹤檔案列為 P1，避免 PDM 檔案庫失去可追溯性。

## 2. 執行摘要

| 類別 | 結果 | 備註 |
|---|---|---|
| 環境檢查 | Pass | Node/npm 正常，Web 回 200 |
| Lint | Pass | `npm.cmd run lint` 無錯誤 |
| Build | Pass with Warning | build 成功，但有 Turbopack trace warning |
| Security audit | Pass | `npm audit --audit-level=moderate` 為 0 vulnerabilities |
| Smoke test | Pass | 建立送審 + 核准流程成功 |
| API negative tests | Pass | 12/12 通過 |
| UI basic check | Pass | 工作台、指標、清單、明細、AI panel 顯示 |
| AI chat check | Pass | `目前統計？` 有回應 |
| DB/file cross-check | Fail | 發現 1 個 orphan file |

## 3. 已執行命令

```powershell
node --version
npm.cmd --version
npm.cmd run lint
npm.cmd run build
npm.cmd audit --audit-level=moderate
npm.cmd run smoke
npm.cmd run qc:api
```

## 4. 自動化驗證結果

### 4.1 Lint

結果：Pass

```text
npm.cmd run lint
eslint .
```

無 lint error。

### 4.2 Build

結果：Pass with Warning

```text
npm.cmd run build
```

Build 成功，路由包含：

- `/`
- `/settings`
- `/api/chat`
- `/api/submissions`
- `/api/submissions/[id]`
- `/api/submissions/[id]/approve`
- `/api/submissions/[id]/reject`

警告：

- Turbopack 偵測到 dynamic filesystem trace。
- Node `node:sqlite` 顯示 experimental warning。

QC 判定：P2，不阻擋 MVP Web/API 驗證，但正式部署前應處理。

### 4.3 Security Audit

結果：Pass

```text
found 0 vulnerabilities
```

### 4.4 Smoke Test

結果：Pass

`npm.cmd run smoke` 成功建立一筆送審並核准，回傳：

```json
{
  "status": "Released",
  "release": {
    "mode": "local-dev-stub"
  }
}
```

備註：目前是 local-dev stub，不代表 Google Drive / Cloud Function 正式發布已通過。

## 5. API 負面與狀態機測試

執行：

```powershell
npm.cmd run qc:api
```

結果：12 passed, 0 failed

| 測試項目 | 預期 | 實際 | 結果 |
|---|---:|---:|---|
| 缺圖號 | 400 | 400 | Pass |
| 缺料號 | 400 | 400 | Pass |
| 無檔案 | 400 | 400 | Pass |
| 純數字變更原因 | 400 | 400 | Pass |
| 合法送審 | 201 | 201 | Pass |
| 重複圖號 + 版次 | 409 | 409 | Pass |
| Pending 核准 | 200 | 200 | Pass |
| Released 再核准 | 409 | 409 | Pass |
| Pending 駁回 | 200 | 200 | Pass |
| Rejected 再核准 | 409 | 409 | Pass |

## 6. UI 與 AI 驗證

### 6.1 UI

結果：Pass

已確認頁面存在：

- 審核工作台
- Submission metrics
- 送審清單
- 送審明細
- AI 助手

### 6.2 AI

結果：Pass

測試問題：

```text
目前統計？
```

結果：

- AI 對話框可輸入。
- 送出按鈕可使用。
- 回答包含 Pending / Released 統計資訊。

## 7. DB / File Repository 交叉檢查

測試結果：

```json
{
  "statuses": [
    { "status": "Pending", "count": 2 },
    { "status": "Rejected", "count": 1 },
    { "status": "Released", "count": 4 }
  ],
  "files": { "count": 7 },
  "audits": { "count": 16 }
}
```

檔案系統：

```text
data/repository actual files: 8
DB tracked submission_files: 7
```

發現 orphan file：

```text
C:\VIBE CODING\AI_PDM\data\repository\pending\2026\05\SUB-20260515-E6A13100\QC-DUP-633070.pdf
```

## 8. 缺陷清單

### QC-P1-001：重複圖號 + 版次失敗時留下未追蹤檔案

等級：P1  
狀態：Open  
影響範圍：Submission API / File repository  

重現方式：

1. 建立一筆合法送審。
2. 再用相同 `drawing_number + revision` 建立第二筆送審。
3. API 正確回 409。
4. 但檔案已先寫入 `data/repository/pending`。
5. DB 因唯一性限制未建立 `submission_files`，造成 repository 有未追蹤檔案。

風險：

- PDM 檔案庫內出現沒有 DB 紀錄的檔案。
- 後續備份會保存不可追溯檔案。
- 若人工誤判，可能造成檔案版本管理混亂。

建議修正：

- 在保存檔案前，先檢查 `drawing_number + revision` 是否已存在。
- 或在 DB insert 失敗時，自動刪除本次已保存檔案。
- 更完整做法：使用暫存目錄，DB 寫入成功後再 move 到正式 pending repository。

## 9. 已知風險

| ID | 風險 | 等級 | 判定 |
|---|---|---|---|
| R-001 | Node `node:sqlite` 為 experimental | P2 | MVP 可接受 |
| R-002 | Turbopack dynamic filesystem trace warning | P2 | MVP 可接受 |
| R-003 | 尚無正式登入與角色權限 | P0 | 正式上線阻擋 |
| R-004 | 核准目前使用 local-dev stub | P0 | 正式上線阻擋 |
| R-005 | Google Drive 尚未整合 | P0 | 正式上線阻擋 |
| R-006 | SolidWorks Add-in 尚未整合 | P0 | 正式上線阻擋 |
| R-007 | 離線備份尚未實作 | P0 | 正式上線阻擋 |

## 10. QC 建議

優先修正順序：

1. 修正 QC-P1-001 orphan file 問題。
2. 補 API 自動化測試到固定驗證流程。
3. 實作 PDF preview/download endpoint。
4. 實作登入與角色權限。
5. 再接 Google Drive / Cloud Function。
6. 最後接 SolidWorks C# Add-in。

## 11. 最終判定

MVP Web/API 驗證：**未完全通過，需修正 P1 後重測**。  
正式 PDM 生產使用：**不通過**，因多個 P0 整合項尚未實作。
