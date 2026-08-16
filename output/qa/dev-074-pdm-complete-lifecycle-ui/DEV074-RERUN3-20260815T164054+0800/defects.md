# DEV074-RERUN3 defects

Open P0: 0  
Open P1: 0

本檔只記錄本輪新缺陷；前兩輪 W0 缺陷保留於各自 run 目錄。

## DEV074-RERUN3-B01-001 — 統一明細漏掉候選首版與檔案準備入口（P0）

- 狀態：Resolved 2026-08-15 17:02 +08:00；RERUN3 仍維持失敗，須由新 run 歸零驗證。
- 前置：以 Demo Engineer 由 UI 建立 A0013／A0013-P01／A0013-M01，候選工作處於「待你處理／準備首版」。
- 操作：圖料工作台點開 A0013。
- 實際：畫面顯示「目前版次：尚未建立；附件 0 件」及「尚缺必要資料或檔案：首版」，但只有「維護圖料關聯」、停用的「送交審核」、「取消編號申請」與「返回」。
- 預期：候選工作應能從 rendered UI 建立首版並加入必要的 2D／3D 檔案；補齊後可送審。
- 影響：整個候選圖料生命週期在 B01 中斷。若繞過 UI 才能建立首版，即不符合本輪 UI-only 驗證條件。
- 根因定位：`RelationWorkbench` 在 `entityDetail.enabled=true` 時改用 `UnifiedPdmEntityDetailDrawer`；原 `WorkspaceDrawer` 內的 `NumberingCandidateRevisionEditor` 因條件分支不再渲染，而統一明細沒有等效編輯器。
- 證據：`screenshots/B01/B01-unreachable-first-revision-upload-1440x900.png`
- RD 修復：候選工作在圖料、圖號、料號三個工作台一律保留可編輯 `WorkspaceDrawer`；統一明細只接管非候選正式物件。
- 修復焦點驗證：UI 已顯示「建立首版」，點擊後顯示研發版次、檔案選擇器及「上傳並完成驗證」。證據為 `screenshots/RD-fix/RD-fix-candidate-first-revision-entry-1440x900.png`、`screenshots/RD-fix/RD-fix-file-picker-visible-1440x900.png`。
- 自動合約：typecheck PASS；DEV-067 UI PASS；DEV-072 action contract PASS；entity detail drawer 42/42 PASS；numbering search target runtime PASS。
- 變更計數：直接 API mutation 0；直接 DB mutation 0。
