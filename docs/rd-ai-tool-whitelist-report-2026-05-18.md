# AI PDM RD 開發報告

日期：2026-05-18  
角色：RD  
開發項目：AI tool calling whitelist

## 1. 開發結論

狀態：**Done**

本次完成 `PDM_dev_task.md` 中的 P1 項目：

```text
建立 AI tool calling 白名單
```

## 2. 開發內容

- 新增 `src/lib/ai-tools.ts`。
- 定義唯一允許的 AI read-only tools：
  - `list_pending_reviews`
  - `get_dashboard_metrics`
  - `get_submission_detail`
  - `explain_policy`
- `src/lib/chat.ts` 改為透過白名單工具查詢 PDM metadata。
- explicit tool request 若不在白名單，回 `AI_TOOL_BLOCKED`。
- OpenAI provider prompt 會收到同一份 allowed tool list，並只取得白名單工具整理後的 metadata。
- 保留既有 AI write guardrail：AI 不可核准、駁回、刪除、改版、發布或改狀態。

## 3. 修改檔案

- `src/lib/ai-tools.ts`
- `src/lib/chat.ts`
- `scripts/qc-api-test.mjs`
- `PDM_dev_task.md`

## 4. QC regression 補強

新增驗證：

- `AI-014 whitelisted AI tool request returns 200`
- `AI-015 whitelisted AI tool is not blocked`
- `AI-016 non-whitelisted AI tool is blocked`

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
43 passed, 0 failed
```

## 6. 尚未完成

後續 AI 區塊仍需：

- 接 OpenAI / Azure OpenAI / Gemini 其中一個正式 LLM provider。
- 建立 AI 回答引用資料來源機制。
- 建立 PDM 管理辦法 RAG 查詢。
