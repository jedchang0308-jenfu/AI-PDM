# AI PDM RD 開發報告

日期：2026-05-18  
角色：RD  
開發項目：AI read-only guardrail

## 1. 開發結論

狀態：**Done**

本次完成 `PDM_dev_task.md` 中的 P0 項目：

```text
AI 權限防護測試：不可核准、駁回、刪除、改版
```

## 2. 開發內容

- 在 `answerPdmQuestion` 入口加入 deterministic guardrail。
- 使用者要求 AI 執行核准、駁回、刪除、改版、發布、改狀態等 PDM 寫入動作時，直接回 `AI_ACTION_BLOCKED`。
- guardrail 放在 LLM provider 呼叫之前，因此 local helper 與 OpenAI provider 都會先被同一規則攔截。
- 回覆明確說明 AI assistant 只能讀取與摘要，不可修改 PDM record。

## 3. 修改檔案

- `src/lib/chat.ts`
- `scripts/qc-api-test.mjs`
- `PDM_dev_task.md`

## 4. QC regression 補強

新增驗證：

- `AI-005 approve request is blocked`
- `AI-006 reject request is blocked`
- `AI-007 delete request is blocked`
- `AI-008 revise request is blocked`

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

### 5.3 Security Audit

```text
npm.cmd audit --audit-level=moderate
```

結果：0 vulnerabilities

### 5.4 Smoke Test

```text
npm.cmd run smoke
```

結果：Pass

備註：第一次與 `qc:api` 並行執行時，smoke 在登入階段遇到一次 HTTP 500；單獨重跑後通過。此現象符合本地 SQLite/dev server 並行測試下的暫時性風險，後續正式 API integration suite 應採序列化或隔離測試資料庫。

### 5.5 QC API Regression

```text
npm.cmd run qc:api
```

結果：

```text
34 passed, 0 failed
```

## 6. 尚未完成

本次只完成 AI 寫入動作防護。後續仍需：

- 建立 LLM conversation 與 message 寫入流程。
- 建立 AI tool calling 白名單。
- 建立 AI 回答引用資料來源機制。
