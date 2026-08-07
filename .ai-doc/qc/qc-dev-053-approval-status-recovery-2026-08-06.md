# DEV-053 FFF 核准後狀態同步修復 QC 報告

日期：2026-08-06  
範圍：固定 `http://127.0.0.1:3000` 本機、既有 A0005-M01 / rev 0.3 唯讀驗證  
保護邊界：未修改 DEV-054、未直接修復資料、未執行 migration/deploy/release

## 根因

FFF 影響審核已寫入 `review_confirmation_events`，所以該筆正確地從「審核工作台／待處理」消失；但一般圖面進版 package read model 只辨識候選號 `drawing_revision_package_review_approvals` companion，沒有把已核准的 FFF 事件投影為一般小數版的 effective `ReviewApproved`。結果造成同一筆資料在審核工作台已完成、圖號模組仍顯示「送審中」的狀態分裂。

## 修復行為

- 小數研發版：physical package 保持 `Pending`，但以已核准 FFF event read-time projection 顯示 effective `ReviewApproved`／「研發受控」；不建立正式 Released、不中斷既有資料。
- 整數正式版：FFF 核准承接既有 approval step、approval matrix 與原子 release workflow。
- 送審明細：小數版 effective `ReviewApproved` 時顯示「不需要再按核准發布」，移除誤導性的 `核准發布` CTA。
- 退回替代料號 action 不會推進送審包。

## 證據

| 檢查 | 結果 |
|---|---|
| `npm.cmd run qc:pdm-drawing-revision-package-model` | 63/63 PASS |
| `npx.cmd tsc --noEmit --pretty false` | PASS |
| 受影響檔案 ESLint | PASS |
| 3000 `/numbering/drawings` A0005-M01 | 顯示「研發受控」、rev 0.3；無 visible error |
| 3000 `/submissions/SUB-20260806-32FAF9E9` | 顯示「研發受控（已核准）」；無 `核准發布`；visible error 0、console error/warning 0 |
| 3000 viewport | `body.scrollWidth=1265`、`innerWidth=1280`，無水平溢位 |

## 未通過或未宣告通過的既有檢查

- `qc:pdm-drawing-submission-review-only` 仍有既有 `body.part_number` 靜態契約債，與本修復無關。
- `qc:pdm-drawing-submission-ui-operation` 仍因測試 runner 對登入按鈕使用非精確 locator 而在登入前失敗，未以修改產品 UI 迎合測試。
- 未執行資料庫寫入、直接 repair、migration、deploy 或 release；因此本報告不宣告 production readiness。
