# DEV074-RERUN5 defects

Open P0: 0  
Open P1: 0

本檔只記錄 RERUN5 新缺陷；前輪失敗與修復證據保留於各 run 目錄。

## DEV074-R5-P1-001 — 圖料根號明細未投影已正式化的首版與檔案

- Severity: P1
- Status: Resolved by RD at 2026-08-15T17:46:29+08:00；RERUN5 仍維持歷史失敗，下一輪從 W0 重跑
- Path: B02
- Fixture: A0016-M01，approval `APR-a0b06fe2-c45f-426e-84c6-93f8a195fcd6`
- Reproduction: Engineer 由 UI 上傳主要 2D `A0033-M01.SLDDRW` 與主要 3D `A0033.SLDPRT`，送交整包審核；R&D Manager 由 UI 檢視鎖定快照並核准。
- Actual: 正式化資料與「圖號工作台 → A0016-M01」UI 已有首版 0.1 與 2 個附件，但「圖料工作台 → A0016 根號明細」的內嵌圖面區錯誤顯示「尚未建立／附件 0 件」，同一真實資料在兩個 UI 入口不一致。
- Expected: 圖料根號明細應投影主要製造圖的 canonical drawing、current revision 與附件；與圖號工作台顯示同一真實來源。
- Evidence: `screenshots/B02/B02-defect-approved-without-controlled-revision-files-1440x900.png`
- Root cause: `PdmEntityDetailService.loadSource()` 對 `root:*` 只載入 root/part/relation，卻仍繪製 drawing projection；未載入主要製造圖的 canonical aggregate、正式附件與 revision records。
- RD fix: root detail 依 `isPrimaryManufacturing` 選代表圖號，使用相同 snapshot client 載入 canonical drawing、master/package attachments 與 revision records；無資料複製、無資產重建。
- Verification: `npm run typecheck:app` PASS；`npm run qc:dev-067:query` PASS（relation 15 reads ≤ 24）；rendered UI 根號明細顯示版次 0.1、附件 2 件、2D/3D 檔名。Evidence: `screenshots/RD-fix/RD-fix-root-detail-shows-controlled-revision-files-1440x900.png`。
