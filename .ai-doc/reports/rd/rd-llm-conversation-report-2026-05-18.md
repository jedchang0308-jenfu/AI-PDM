# AI PDM RD 開發報告

日期：2026-05-18  
角色：RD  
開發項目：LLM conversation and message persistence

## 1. 開發結論

狀態：**Done**

本次完成 `PDM_dev_task.md` 中的 P1 項目：

```text
建立 LLM conversation 與 message 寫入流程
```

## 2. 開發內容

- `POST /api/chat` 未提供 `conversationId` 時，建立新的 `llm_conversations` record。
- 每次 chat request 會寫入一筆 `user` message。
- AI 回答後會寫入一筆 `assistant` message。
- response 會回傳 `conversationId`，前端或測試可用同一 ID 續寫對話。
- 使用既有 `llm_conversations` 時，會確認 conversation owner 必須是目前登入 user。
- 跨使用者續寫 conversation 會回 `403`。

## 3. 修改檔案

- `src/lib/db.ts`
- `src/app/api/chat/route.ts`
- `scripts/qc-api-test.mjs`
- `PDM_dev_task.md`

## 4. QC regression 補強

新增驗證：

- `AUTH-012 unauthenticated chat returns 401`
- `AI-009 chat creates conversation`
- `AI-010 chat writes user and assistant messages`
- `AI-011 chat continues same conversation`
- `AI-012 chat follow-up appends messages`
- `AI-013 cross-user conversation access returns 403`

## 5. 驗證結果

### 5.1 Lint

```text
npm.cmd run lint
```

結果：Pass

### 5.2 Build

```text
npm.cmd run build
```

結果：Pass

保留既有 P2 warning：

- Turbopack dynamic filesystem trace warning。
- Node `node:sqlite` experimental warning。

### 5.3 Smoke Test

```text
npm.cmd run smoke
```

結果：Pass

### 5.4 Security Audit

```text
npm.cmd audit --audit-level=moderate
```

結果：0 vulnerabilities

### 5.5 QC API Regression

```text
npm.cmd run qc:api
```

結果：

```text
40 passed, 0 failed
```

## 6. 尚未完成

後續 AI 區塊仍需：

- 接 OpenAI / Azure OpenAI / Gemini 其中一個正式 LLM provider。
- 建立 AI tool calling 白名單。
- 建立 AI 回答引用資料來源機制。
