# QC Fact Report: PDM DVT/Release Approval Review UI

Date: 2026-06-01

## 驗證結論

通過。DVT/發行審核頁可由研發主管載入，顯示同專案審核批次、代送審標示與異常/Override 標示，並可用共用意見搭配異常項個別意見完成批次核准。

## 執行項目

- `cmd /c node_modules\.bin\tsc.cmd --noEmit`
- `npm.cmd run lint`
- `cmd /c npm run build`
- `npm.cmd run qc:pdm-numbering-core`
- `npm.cmd run qc:pdm-numbering-approval-review-ui`

## 實際結果

- TypeScript 檢查通過。
- lint 通過，0 errors；僅保留既有 `src/app/numbering/tasks/page.tsx` hook dependency warning。
- build 通過；僅保留既有 Turbopack broad trace warnings。
- `qc:pdm-numbering-core`：178/178 通過。
- `qc:pdm-numbering-approval-review-ui`：21/21 通過。

## 證據

- UI 測試登入 `manager@example.com`，開啟 `/numbering/approvals`。
- 測試資料建立 `NB-QCAPPR-*` 同專案批次，包含 `dvt_promotion` 與 `release_missing_ma_confirm`。
- 畫面確認：
  - 批次與專案代碼可見。
  - DVT 料號與 Release override 料號可見。
  - `代送審` marker 可見。
  - `異常/Override` marker 可見。
- 審核後 DB 確認：
  - `approval_batches.batch_status = approved`
  - 所有 `approval_batch_items.item_status = approved`
  - DVT 項目 decision comment 為共用意見 `QC shared approval comment`
  - 異常項 decision comment 為個別意見 `QC exception item note`
  - DVT 料號 `development_phase = DVT` 且 `record_status = Active`
- 桌面 1440px 與手機 390px 頁面層水平溢出皆為 0px。
- 桌面與手機瀏覽器 console error 皆為 0。

## 問題與阻塞

- 無本輪阻塞。
- 尚未涵蓋角色/代理人設定 UI；此項仍留在 dev_task 未完成項。
