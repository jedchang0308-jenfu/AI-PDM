# R16 defects

## DEV074-R16-P1-012 — 「不適用」被投影為「已修正」

- Path: `C07`
- Severity: `P1`
- Result: `FAIL`
- Reproduction: 管理者從完整辨識核對畫面將「受控備註」恢復待核對，填寫原因後按「不適用」，再重新載入頁面。
- Actual: 候選的 `variant_status` 已是 `explicit_not_applicable`，但 UI 仍依摘要 `review_state=corrected` 顯示「已修正」，無法辨識本次決策是 N/A。
- Expected: 畫面必須穩定顯示「不適用」，且仍可由「恢復待核對」重開。
- Evidence: `RD-FIX-DEV074-R16-P1-012/not-applicable-visible-after-reload.png`（修復後）。
- Root cause: `drawing-recognition-review.tsx` 僅以 `reviewState` 取標籤，未用已持久化的 `variantStatus=explicit_not_applicable` 投影 N/A 語意。
- Repair: 新增候選決策投影函式，以 `corrected + explicit_not_applicable` 顯示「不適用」，並加上專屬 class；補 contract gate。
- RD verification: `typecheck:app` PASS；`qc:dev-068:contract` PASS；`qc:dev-068:a0005-core` PASS；UI reload 後兩筆 N/A 均顯示「不適用」。
