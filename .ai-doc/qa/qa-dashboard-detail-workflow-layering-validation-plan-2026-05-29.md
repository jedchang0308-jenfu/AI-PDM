# QA Validation Plan: Dashboard Detail Workflow Layering

Date: 2026-05-29
Scope: `DEV-UX-001` 圖面明細工作流分層重設計

## 驗證範圍

- Dashboard 圖面明細由首屏快速動作、工程上下文、協作 / 審核、系統診斷四層組成。
- 首屏不重複總表已有圖號、料號、品名、版次等欄位。
- 檔案路徑、SHA256、Drive iframe 只在診斷層展開後呈現。
- AI 摘要、AI 風險、reuse、重複幾何、供應商、採購同步等高成本資料按需載入。
- PDF 預覽、Drive 預覽、下載、BOM、Where-used、核准 / 駁回流程不回歸。

## 使用者關鍵流程

- 使用者從總表選取圖面後，首屏能直接執行 PDF 預覽、Drive 預覽、下載與發布包操作。
- 工程 / 審核人員需要上下文時，展開工程上下文查看變更原因、材質、版次、BOM、Where-used。
- 審核人員需要協作時，展開協作 / 審核查看 AI 風險、標註、討論、問題、關卡、簽核與核准操作。
- 系統維護或追查問題時，展開系統診斷查看送審 ID、完整識別資訊、檔案路徑、SHA256 與 Drive iframe。

## FMEA 風險表

| 風險 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|
| 首屏仍重複總表欄位 | 明細雜訊未下降 | QC 檢查快速動作層不含 seeded drawing number | 快速動作層只放檔案 / 發布包操作 |
| 高成本 API 在選圖時立即呼叫 | 浪費 AI / API 算力 | QC 監聽初次開明細 request | AI / reuse / supplier / sync 移到展開 callback |
| 工程資訊延遲後不可見 | 審核前無法確認 BOM / Where-used | 展開工程上下文後檢查 BOM / Where-used | lazy loader 完成後寫入既有 state |
| 審核操作被折疊後遺失 | Manager 無法核准或駁回 | 展開協作 / 審核後檢查核准 / 駁回 | 保留原審核 controls，只改層級 |
| 診斷資訊外露在首屏 | 明細仍過載且暴露低頻資訊 | 首屏檢查送審 ID / SHA256 不可見 | 路徑 / SHA / iframe 放入系統診斷 |
| Build 或 lint 失敗 | 無法發布 | 執行 lint / build | 修正型別、JSX 與 lint 問題 |

## 測試案例

- `DDP-001` Detail title remains `圖面明細`.
- `DDP-002` Old `送審明細` title is absent.
- `DDP-003` File section is labelled.
- `DDP-004` Quick actions show preview.
- `DDP-005` Quick actions show download.
- `DDP-006` Summary-table fields are not repeated in quick actions.
- `DDP-007` High-cost resources are not requested on initial detail open.
- `DDP-008` System identifiers are collapsed on first paint.
- `DDP-009` SHA256 is hidden behind diagnostics expansion.
- `DDP-010` Workflow layers are ordered quick actions, engineering, collaboration, diagnostics.
- `DDP-011` Engineering expansion requests BOM diff.
- `DDP-012` Engineering expansion requests Where-used.
- `DDP-013` Engineering expansion keeps BOM visible.
- `DDP-014` Engineering expansion keeps Where-used visible.
- `DDP-015` Collaboration expansion requests AI summary lazily.
- `DDP-016` Collaboration expansion keeps approve control visible.
- `DDP-017` Review issues remain below engineering context.
- `DDP-018` Diagnostics reveal submission id.
- `DDP-019` Diagnostics reveal SHA256 after file expansion.

## 通過標準

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- `npm.cmd run qc:dashboard-detail-priority` passes.
- Broad UI script remains compatible with the new collapsed layers.

## 證據收集方式

- 保存 command output 摘要到 QC report。
- 若 QC 失敗，收集 failing case id、Playwright selector、API request path list 與實際錯誤訊息。
