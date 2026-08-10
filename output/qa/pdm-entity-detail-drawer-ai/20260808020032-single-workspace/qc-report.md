# DEV-057 單一圖面工作區 QC 報告

## 驗證結論

- 判定：**未通過**
- 缺陷：P0 = 0、P1 = 0、P2 = 1
- 原因：核心 intentional replacement 已落實，但候選工作區仍把同一個「補齊首版檔案」指示重複顯示於版次檔案、預覽空狀態與下一步區，未通過 Visible Text Noise Gate。
- 證據完整性：UI、DOM、console 與 viewport 已驗證；browser network response status 子項未充分驗證。

## 通過項目

- Candidate 與 formal 都只有一個 `[data-component="drawing-workspace-drawer"]`。
- 兩者共用同一五段順序：overview → revision-files → preview → pending → more。
- Candidate A0006-M01 開啟後不用再按「準備首版圖面」，即看見研發版次、首版檔案選取、上傳驗證與缺項。
- 產品可見「準備首版圖面」計數為 0。
- Header primary：candidate 0、formal 1（查看進度），符合每狀態至多一個。
- Formal A0005-M01 的受控版次檔案、3D/2D 預覽、待處理附件、審核與更多資料仍可見。
- Candidate 取消只開啟 `alertdialog`；確認視窗具釋出範圍與阻擋說明，已用 Escape 返回，未執行取消。
- 1440×900、1024×768、390×844 均無水平 overflow、X 軸裁切、重疊或互動控制超出 viewport；drawer body 是明確垂直 scroll owner。
- Visible Error Sweep：無 `.inline-error`、有文字的 `[role=alert]`、HTTP 4xx/5xx、Not Found、Internal Server Error 或 `/api/` route 錯誤。
- Browser console：0 error / warning。

## P2-001：候選缺檔指示重複

- 重現：開啟 `/numbering/drawings?view=all` → 點 A0006-M01。
- 實際：同一件事出現三次：
  1. 版次檔案：「下一步：加入至少一個主要受控檔……」
  2. 預覽空狀態：「先在上方加入首版圖面與版次檔案。」
  3. pending 區：「下一步／補齊首版檔案／在上方加入主要受控檔……」
- 影響：不阻擋操作，但增加閱讀量，與「最大化精簡」及 Visible Text Noise Gate 不符。
- 預期：只保留一個權威缺項訊息；預覽空狀態或 pending 區不得再重複相同下一步。
- 證據：`candidate-a0006-390x844.png`、`candidate-a0006-1440x900.png`、DOM 五段文字盤點。

## 自動化與靜態 Gate

- `npm run typecheck`：PASS
- `npm run qc:pdm-entity-detail-drawer`：41/41 PASS
- `npm run qc:pdm-number-state-flow-ui`：8/8 PASS
- `npm run qc:dev-053:ui`：23/23 PASS
- scoped ESLint：0 error；2 warnings（`master-attachment-panel.tsx` 的 hook dependency 與 `<img>`）

## 未充分驗證子項

- in-app Browser 未提供 response-status/network log 介面，因此無法對本次瀏覽器 session 逐筆證明無 4xx/5xx。
- 終端未帶瀏覽器登入 session 的唯讀 GET 對受保護 API 回傳 401；此結果不代表已登入 UI 的 runtime failure，未列為產品缺陷。
- 已有替代證據：兩種明細與正式預覽資料成功渲染、Visible Error Sweep 全空、console 全空；但不把替代證據宣稱為完整 network verification。

## 證據

- 目錄：`output/qa/pdm-entity-detail-drawer-ai/20260808020032-single-workspace/`
- 截圖：7 張（candidate/formal 三 viewport + candidate 取消確認）
- DOM/Runtime：`dom-metrics.json`

