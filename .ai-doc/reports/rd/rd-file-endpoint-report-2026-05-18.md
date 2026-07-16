# AI PDM RD 開發報告

日期：2026-05-18  
角色：RD  
開發項目：PDF preview / submission file download endpoint

## 1. 開發結論

狀態：**Done**

已完成：

- `GET /api/submissions/{id}/files/{fileId}`：登入後下載送審檔案。
- `GET /api/submissions/{id}/files/{fileId}/preview`：登入後 inline 預覽 PDF。
- Web Admin UI 檔案清單加入 `Preview` 與 `Download` 操作。
- QC API regression test 加入檔案下載與 PDF preview 檢查。

## 2. 權限與安全處理

- 未登入呼叫檔案下載會回 `401`。
- 檔案必須同時符合 submission id 與 file id。
- 讀檔前檢查 `local_path` 必須位於 `data/repository` 底下，避免讀取 repository 外部檔案。
- PDF preview 僅允許 `file_role = pdf` 或副檔名 `.pdf` 的檔案，其他檔案回 `415`。
- 檔案 response 加入 `x-content-type-options: nosniff` 與 `cache-control: private, no-store`。

## 3. 修改檔案

- `src/lib/db.ts`
- `src/lib/file-response.ts`
- `src/app/api/submissions/[id]/files/[fileId]/route.ts`
- `src/app/api/submissions/[id]/files/[fileId]/preview/route.ts`
- `src/components/dashboard.tsx`
- `src/app/globals.css`
- `scripts/qc-api-test.mjs`
- `PDM_dev_task.md`

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

### 4.3 Smoke Test

```text
npm.cmd run smoke
```

結果：Pass

### 4.4 QC API Regression

```text
npm.cmd run qc:api
```

結果：

```text
21 passed, 0 failed
```

新增通過項目：

- `AUTH-003 unauthenticated file download returns 401`
- `FILE-001 submission file download returns 200`
- `FILE-002 download uses attachment disposition`
- `FILE-003 PDF preview returns 200`
- `FILE-004 PDF preview content type is application/pdf`
- `FILE-005 PDF preview uses inline disposition`
