# AI PDM RD 修復報告

日期：2026-05-18  
角色：RD  
修復項目：`QC-P1-001` 重複圖號 + 版次失敗時留下未追蹤檔案

## 1. 修復結論

狀態：**Fixed**

原問題：

- `POST /api/submissions` 先保存檔案，再寫入 SQLite。
- 若 SQLite 因 `drawing_number + revision` 唯一性限制失敗，API 回 409，但已保存的檔案不會清除。
- 結果造成 `data/repository` 中出現 DB 沒有紀錄的 orphan file。

## 2. 修復內容

### 2.1 API 前置檢查

在保存檔案前先檢查：

```text
drawing_number + revision 是否已存在
```

若已存在，直接回：

```text
409 圖號 + 版次已存在，不能重複送審
```

不會寫入任何 repository 檔案。

### 2.2 DB 失敗 rollback 清理

若檔案已保存，但後續 DB 寫入發生錯誤，API 會刪除本次送審資料夾：

```text
data/repository/pending/yyyy/mm/SUB-...
```

刪除前會檢查目標路徑必須位於 PDM repository 之下，避免誤刪其他位置。

### 2.3 QC 測試補強

`npm.cmd run qc:api` 已新增 regression check：

```text
QC-P1-001 duplicate rejection does not create orphan files
```

測試邏輯：

1. 記錄 duplicate 測試前 orphan file 數量。
2. 送出重複 `drawing_number + revision`。
3. 確認 API 回 409。
4. 再次計算 orphan file 數量。
5. 前後數量必須一致。

## 3. 修改檔案

- `src/app/api/submissions/route.ts`
- `src/lib/db.ts`
- `src/lib/file-store.ts`
- `scripts/qc-api-test.mjs`
- `package.json`

## 4. 驗證結果

### 4.1 Lint

```text
npm.cmd run lint
```

結果：Pass

### 4.2 Build

```text
npm.cmd run build
```

結果：Pass

保留既有 P2 warning：

- Turbopack dynamic filesystem trace warning。
- Node `node:sqlite` experimental warning。

### 4.3 Security Audit

```text
npm.cmd audit --audit-level=moderate
```

結果：

```text
found 0 vulnerabilities
```

### 4.4 QC API Regression

```text
npm.cmd run qc:api
```

結果：

```text
13 passed, 0 failed
```

新增測試通過：

```text
QC-P1-001 duplicate rejection does not create orphan files
actual: 0
expected: 0
```

### 4.5 Smoke Test

```text
npm.cmd run smoke
```

結果：Pass

### 4.6 DB / Repository 交叉檢查

結果：

```json
{
  "tracked": 10,
  "actual": 10,
  "orphanCount": 0,
  "missingCount": 0
}
```

## 5. RD 判定

`QC-P1-001` 已修復。  
目前 MVP Web/API 層沒有發現 orphan file。

正式上線前仍需處理既有 P0 未實作項：

- SolidWorks C# Add-in。
- Google Drive Pending upload。
- Google Cloud Function release。
- 登入與角色權限。
- 離線單向備份。
