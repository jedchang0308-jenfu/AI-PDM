# QC Fact Report: Dashboard Detail Workflow Layering

Date: 2026-05-29
Task: `DEV-UX-001`
Validation plan: `docs/qa-dashboard-detail-workflow-layering-validation-plan-2026-05-29.md`

## 驗證結論

- PASS：圖面明細已改為快速動作、工程上下文、協作 / 審核、系統診斷四層。
- PASS：首次開明細只請求 submission detail，未立即呼叫 AI / reuse / supplier / procurement sync 等高成本端點。
- PASS：PDF 預覽、Drive 預覽、下載、BOM、Where-used、核准 / 駁回與 Drive iframe 回歸測試通過。

## 執行項目

- `npm.cmd run lint -- --quiet`
- `npm.cmd run build`
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:dashboard-detail-priority`
- `PDM_BASE_URL=http://127.0.0.1:3100 npm.cmd run qc:ui`

## 實際結果

- `lint`: PASS
- `build`: PASS
- `qc:dashboard-detail-priority`: PASS, 22/22
- `qc:ui`: PASS, 26/26

## 證據

- `DDP-007` 初次開明細 request list 只有 `/api/submissions/{id}`，未包含 `/ai-summary`、`/ai-risks`、`/reuse-candidates`、`/duplicate-geometry`、`/supplier-responses`、`/sync-runs`。
- `DDP-011`、`DDP-012` 展開工程上下文後才請求 BOM diff、Where-used、revision history。
- `DDP-015` 展開協作 / 審核後才請求 AI summary / risks / reuse / duplicate geometry。
- `DDP-018`、`DDP-019` 系統診斷展開後才顯示送審 ID 與 SHA256。
- `UI-018`、`UI-019` Drive preview link 與 Drive iframe 在新分層下仍通過。

## 問題與阻塞

- 既有 `localhost:3000` node process 的 `/api/auth/login` 回 500；本次 QC 改用 final build 啟動 `localhost:3100` 驗證並已關閉臨時服務。
- `next build` 仍有既有 Turbopack tracing warnings，來源為 `src/lib/config.ts`、`src/lib/llm-usage.ts` 與 `next.config.mjs` 動態路徑追蹤；build 最終成功，未列為 `DEV-UX-001` 阻塞。
