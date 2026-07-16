# QA Validation Plan - BOM Workbench UI

Task: `DEV-BOM-WORKBENCH-001`

## 驗證範圍
- `/bom/workbench` 獨立 BOM 工作台頁面與 sidebar 導航入口。
- 工程師從 CAD references 建立 BOM Draft、搜尋料號/圖面並拖入子件、調整樹狀階層/排序/數量、Undo/Redo、未儲存提示、儲存、複製 Draft、設為 Active Draft、比較 Draft、送主管審核。
- 桌機與手機視窗不可產生頁面層水平溢出。

## 使用者關鍵流程
1. 工程師開啟 BOM 工作台並選定 parent submission。
2. 建立 CAD Draft，看到 CAD reference 子件。
3. 從左側料號/圖面搜尋結果拖入 BOM 樹。
4. 編輯子件數量，新增虛擬群組，使用排序與縮排控制調整階層。
5. 使用 Undo/Redo 驗證 session 編輯可回復。
6. 儲存 Draft 後確認 PATCH 回應保存數量與階層。
7. 複製 Draft、設為 Active Draft、比較 Draft。
8. 填寫送審原因並送主管審核。

## FMEA 風險表
| 失效模式 | 可能原因 | 影響 | 偵測方式 | 優先級 | 對策 |
|---|---|---|---|---|---|
| 工作台沒有真正獨立入口 | sidebar 未連到頁面 | RD 仍回到 Dashboard 手動找 BOM | 靜態檢查 sidebar 與 route build | P1 | QC 檢查 `/bom/workbench` 與 build route |
| 拖拉只改畫面不保存 | client state 與 PATCH payload 不一致 | BOM 發行結構錯誤 | Playwright 等待 PATCH 回應並檢查 lines | P0 | 驗證 quantity、parent_line_id |
| Undo/Redo 不反映 session 編輯 | history index 或 reset 時機錯誤 | 工程師誤操作難以復原 | E2E 先新增群組、Undo 移除、Redo 還原 | P1 | session history 測試 |
| Active Draft 操作錯誤 | 多 Draft 狀態切換錯誤 | 送審到錯誤 BOM | E2E 複製後設 Active | P0 | API regression + UI E2E |
| 手機或窄版溢出 | 三欄版面未響應式收斂 | 現場查閱不可用 | Playwright 測量 document scrollWidth | P2 | 390px viewport 檢查 |

## 測試案例
| ID | 步驟 | 預期結果 |
|---|---|---|
| BOM-UI-001 | 開啟 `/bom/workbench?submissionId=...` | 頁面標題、sidebar link、parent 資訊可見 |
| BOM-UI-002 | 點 CAD Draft | BOM 樹顯示 CAD reference 子件 |
| BOM-UI-003 | 搜尋子件並拖入 BOM 樹 | BOM 樹新增 manual 子件 |
| BOM-UI-004 | 編輯數量為 3 | 樹列與儲存後 PATCH 回應皆為 Qty 3 |
| BOM-UI-005 | 新增群組、Undo、Redo | 群組被移除後可還原 |
| BOM-UI-006 | 群組上移、子件縮排至群組下 | 儲存後 child `parent_line_id` 指向群組 |
| BOM-UI-007 | 複製 Draft、設為 Active、比較 Draft | UI 顯示成功訊息且 comparison panel 更新 |
| BOM-UI-008 | 填送審原因後送審 | 回傳成功並顯示已送審 |
| BOM-UI-009 | 桌機與手機 viewport | 無 console error，無頁面層水平溢出 |

## 通過標準
- `npm.cmd run qc:bom-workbench-ui` 全數通過。
- `npm.cmd run qc:bom-workbench-foundation` 仍通過，避免 UI 工作破壞既有 BOM API。
- `tsc`、`lint`、`build` 通過。

## 證據收集方式
- 保存 QC script JSON output。
- Production build route list 必須包含 `/bom/workbench`。
- QC report 記錄命令、結果、未涵蓋範圍與殘留風險。
