# R26 defects

## DEV074-R26-QC-022 — B06 腳本漏填版次調整原因

- Type: QC method defect（非產品缺陷）
- Path: B06
- Observed: 原始腳本輸入 0.2 後未填必填的「調整原因」，UI 正確拒絕儲存；腳本未驗證儲存結果便繼續送審。
- Root cause: QC 腳本使用 value index 定位欄位，且只固定等待 500ms，沒有等待 PATCH 回應或成功提示。
- Correction: 改用 label 定位、填入調整原因、等待 PATCH 200 與成功提示、驗證 input server readback，再執行後續 UI 操作。
- Targeted UI retest: PASS；審核快照顯示 `版次：0.2` 與 DWG。
- Evidence: `screenshots/B06/targeted-owner-revision-saved.png`, `screenshots/B06/targeted-reviewer-snapshot-0.2.png`。
