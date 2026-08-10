# DEV-059 AI 真實操作驗證證據

日期：2026-08-09  
環境：`http://127.0.0.1:3000`、Codex In-app Browser、目前登入工作階段  
範圍：候選圖號 `A0006-M01` 的「送交圖料與首版整包審核」確認彈窗；共享資料只做唯讀復原驗證，可逆送審／撤回／故障案例均在 disposable isolated runtime 執行。

## 實際操作結果

| Case | 操作 | 觀察結果 |
|---|---|---|
| DEV059-REAL-001 | 開啟 `送交審核` | `role=alertdialog` 出現，標題為「送交圖料與首版整包審核」 |
| DEV059-REAL-002 | 點擊右上角 X | 彈窗由 1 變 0；URL 仍為 `detail=candidate:draft-workspace-...`；A0006 明細仍在，沒有誤選其他列 |
| DEV059-REAL-003 | 點擊 `返回檢查` | 彈窗由 1 變 0；URL 與 A0006 明細保持不變 |
| DEV059-REAL-004 | 按 `Escape` | 彈窗由 1 變 0；URL 與 A0006 明細保持不變 |
| DEV059-REAL-005 | 在 X 的實際螢幕座標執行 CUA click | 彈窗由 1 變 0；沒有 click-through 到底層抽屜 |
| DEV059-REAL-006 | 彈窗開啟後重新整理 | 重新載入後彈窗為 0，A0006 明細仍可用 |
| DEV059-REAL-007 | 關閉彈窗後切換至 `A0005-M01` | 成功切換至 A0005，彈窗為 0，未殘留前一筆 confirm state |
| DEV059-REAL-008 | locator 與實際座標 double-click X | 彈窗關閉一次；A0006 仍在，未 click-through 或重複送審 |

## 隔離 disposable UI mutation run

- Run：`DEV059-20260809-161835-isolated`
- Command：`npm.cmd run qc:dev-059:candidate-submit-modal-real-operation`
- 結果：`11/11 PASS`；`productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`、`unexpectedBrowserErrors=0`。
- `DEV059-WRITE-001`：AI 由 UI 建立三筆 `QA_DEV059_<runId>` disposable bundle，透過 `建立首版`、附加 disposable PDF、上傳並完成證據，readback 為 `bundle_ready`。
- `DEV059-REAL-ROUTE`：X、`返回檢查`、Escape、實體座標 click／double-click 均只關閉 confirm modal，drawer、URL、business hash 保持不變。
- `DEV059-VIEW`：1440×900、1024×768、390×844 均完成 modal containment／無水平溢位驗證，並保留手機 screenshot。
- `DEV059-WRITE-002`：以真實 UI double activation 送審，只有一筆 pending review request，未產生重複 mutation。
- `DEV059-FAULT-001`：planned `candidate_review_service_unavailable`（503）由 UI 顯示人類化錯誤，modal 可退出、無 request 寫入、fixture 可安全取消。
- `DEV059-FAULT-003`／`DEV059-FAULT-003R`：server 已 commit 但 client response loss，UI 顯示結果未知並 refresh authoritative state；reload 讀回 `整包審核中`，保留同一 idempotency key，request count 恰為 1。
- `DEV059-WRITE cleanup`：成功、planned 503 與 response-loss 三筆 fixture 均由 UI 撤回／取消，cleanup `removed`。
- `DEV059-GATE-0`：正式 root／part／drawing master 前後差異為 0；無 production connection 或 production write。

完整 artifact 位於 `output/qa/pdm-candidate-submit-modal-recovery/DEV059-20260809-161835-isolated/`，包含 `run-report.json`、`operation-log.md`、`data-before-after.json`、`console-network.json`、`dom-metrics.json`、`cleanup.json`、`trace.zip`、`server-log.txt`、`screenshots/`、`qc-verdict.md`、`defects.md` 與 `ux-review.md`。503 與 response-loss 的 console/network 紀錄是計畫內故障觀察，不列為非預期瀏覽器錯誤。

## 可重跑檢查

- `npm run qc:dev-059:candidate-submit-modal-ui`：9/9 PASS。
- `npm run typecheck`：PASS。
- `npm.cmd run qc:dev-059:candidate-submit-modal-real-operation`：11/11 PASS；上述 isolated run。
- `npm run qc:dev-053:flow`：7/7 PASS；涵蓋候選送審鎖定、撤回解鎖、原子化重試、跨公司阻擋與回滾。
- `npm run qc:pdm-number-state-flow-approval-integration`：27/27 PASS；涵蓋 approval apply fault、withdraw、rejection/needs-info、publication rollback 與 idempotent replay。
- `npm run qc:pdm-number-state-flow-phase1c-http`：11/11 PASS；涵蓋 atomic/idempotent HTTP review、permission/same-origin、cross-company hide、no-store 與 publication boundary。
- affected-file ESLint：`src/components/number-state-workspace.tsx`、`src/components/drawing-workbench.tsx` 與兩支 DEV-059 runner 均 PASS。

`npm run qc:dev-053:real-operation` 另行執行時在既有 DEV-053 清單文案斷言（`DEV053-REAL-003`）即停止，尚未進入其候選送審步驟；該結果不作為 DEV-059 彈窗修正的通過證據，也未把共享資料寫入當作替代驗證。

## 根因與修正

`PdmEntityDetailDrawer` 在 document 層監聽 `pointerdown`，彈窗原本位於抽屜之外，因此彈窗按鈕會先被當成抽屜外點擊；抽屜在 React delegated click 前處理事件，造成確認彈窗按鈕無法關閉，且可能 click-through 到底層列。

`ConfirmDialog` 現在以 backdrop ref 在 native capture 階段攔截 modal pointerdown，並以 `data-number-state-modal-close` 由 native click bridge 執行關閉；同時保留 `alertdialog`、焦點管理與 Escape lifecycle。關閉只清除 confirm state，不改變候選資料或 URL。

結論：DEV-059 已由 AI 在真實渲染 UI 完成 current-route 唯讀 recovery 與 disposable isolated UI mutation gate；成功送審、單一 request、503、response-loss authoritative readback、撤回／取消 cleanup、三 viewport 與正式主檔零污染均通過。父 `DEV-057` 的本機 QA/QC 可恢復為 PASS；commit、merge、PR、deploy、production 與 release 仍保持未授權。
