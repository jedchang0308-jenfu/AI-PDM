# AI PDM RD 開發報告

日期：2026-05-18  
角色：RD  
開發項目：Engineer submission read scope

## 1. 開發結論

狀態：**Done**

本次依據 `PDM_dev_task.md` 的登入、角色與權限區塊，完成：

- Engineer 查詢 submission list 時，只能看到自己提交的資料。
- Engineer 查詢 submission detail 時，若不是自己提交，回 `403`。
- Engineer 下載或預覽他人 submission file 時，回 `403`。
- R&D Manager / Admin 保持可查看全域 submission。
- AI chat 查詢 Pending / metrics / current submission context 時，會套用同一個 Engineer scope。

## 2. 修改檔案

- `src/lib/db.ts`
- `src/lib/permissions.ts`
- `src/lib/file-response.ts`
- `src/lib/chat.ts`
- `src/app/api/submissions/route.ts`
- `src/app/api/submissions/[id]/route.ts`
- `src/app/api/submissions/[id]/files/[fileId]/route.ts`
- `src/app/api/submissions/[id]/files/[fileId]/preview/route.ts`
- `src/app/api/chat/route.ts`
- `scripts/qc-api-test.mjs`
- `PDM_dev_task.md`

## 3. QC regression 補強

`scripts/qc-api-test.mjs` 新增第二位 Engineer 測試帳號：

```text
engineer2@example.com
```

新增驗證：

- `AUTH-004 Engineer list excludes other Engineer submissions`
- `AUTH-005 Engineer detail for other Engineer submission returns 403`
- `AUTH-006 Manager detail for Engineer submission returns 200`
- `AUTH-007 Engineer download for other Engineer file returns 403`

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

結果：0 vulnerabilities

### 4.4 Smoke Test

```text
npm.cmd run smoke
```

結果：Pass

### 4.5 QC API Regression

```text
npm.cmd run qc:api
```

結果：

```text
26 passed, 0 failed
```

## 5. 尚未完成

本次完成的是本地 MVP role scope，不等於正式帳號系統完成。正式上線前仍需：

- 接正式帳號系統或 Supabase Auth。
- 定義 Engineer 被授權查看他人資料的授權模型。
- Admin 管理系統設定的權限封鎖。
