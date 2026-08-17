# DEV074-RERUN4 defects

Open P0: 0  
Open P1: 0

本檔只記錄 RERUN4 新缺陷；前三輪失敗與修復證據保留在各自 run 目錄。

## DEV074-R4-TRIAGE-001 — preview 409（不成立缺陷）

- Severity: Not a defect / expected protocol event
- Status: Closed after RD triage
- Path: B01
- Fixture: `A0015`, candidate revision `NCR-06d57cb1-50f7-4493-9525-2ea128f48777`
- Reproduction: rendered UI 選取 `A0033-M01.SLDDRW` →「上傳並完成驗證」→「移除 A0033-M01.SLDDRW」。
- Triage: `drawing-detail-preview.tsx` 對 `PREVIEW_NOT_READY / 409` 有明確重試協定；`scripts/qc-dev-053-drawing-workbench-real-operation.mjs` 亦將 `preview=1 + 409` 列為 expected browser event。切換到可直接預覽的 PDF 後，舊檔輪詢停止，console 計數不再增加。
- Decision: 記入 `network.jsonl` expected allowlist，不計為 runtime hard-gate failure；B01 繼續執行。
- Evidence: `screenshots/B01/B01-only-2d-selected-1440x900.png`, `screenshots/B01/B01-missing-3d-gate-1440x900.png`, `.playwright-cli/console-2026-08-15T09-15-06-549Z.log` lines 5+.

## DEV074-R4-P0-001 — 相同內容檔案無法恢復同版次邏輯引用

- Severity: P0
- Status: Resolved by RD; focused UI retest passed; RERUN4 remains failed by run-boundary rule
- Path: B01
- Fixture: `A0015`, candidate revision `NCR-06d57cb1-50f7-4493-9525-2ea128f48777`, file `A0033-M01.SLDDRW`
- Reproduction: rendered UI 上傳檔案 → 由 UI 移除 → 再選取相同 bytes →「上傳並完成驗證」。
- Actual: 內容雜湊正確重用 physical asset，但既有 soft-deleted revision-file relation 未恢復；唯一性約束阻擋新增，UI 顯示「首版主要檔案尚未加入」。
- Expected: physical asset 維持單一真相來源；同版次被移除的邏輯引用應原子恢復，跨版次則建立各自可見的邏輯引用；流程不得阻擋。
- Evidence: `screenshots/B01/B01-defect-same-content-reattach-blocked-1440x900.png`.
- Fix: `reuseCandidateFileLink` 現在會辨識 soft-deleted relation，原子清除 `removed_at/removed_by`、恢復正確 primary 狀態並保留同一 `source_file_asset_id`；呼叫端一併傳入 server 判定的 `isPrimary`，避免 PDF 等附件被誤升為主要檔。
- Automated checks: `typecheck:app` PASS；`qc:dev-074:same-content-relink` PASS；`qc:dev-072:contract` PASS；`qc:dev-067:ui` PASS。
- Focused UI retest: 同一個失敗 fixture 再按「上傳並完成驗證」後，`A0033-M01.SLDDRW` 恢復為「2D 圖面 · 主要受控檔 · 已完成驗證」，畫面進入「整包可送審」。Evidence: `screenshots/RD-fix/RD-fix-same-content-reference-reactivated-1440x900.png`.
