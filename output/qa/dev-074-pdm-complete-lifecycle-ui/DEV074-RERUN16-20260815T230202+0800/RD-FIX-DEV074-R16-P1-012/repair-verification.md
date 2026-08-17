# RD repair verification — DEV074-R16-P1-012

- Defect: UI「不適用」決策在 reload 後誤顯示為「已修正」。
- Root cause: 候選摘要使用 `reviewState` 單軸標籤，忽略已持久化的 `variantStatus=explicit_not_applicable`。
- Repair: `candidateReviewLabel` 將 `corrected + explicit_not_applicable` 投影為「不適用」，並保留「恢復待核對」能力；contract QC 加入固定檢查。
- `npm run typecheck:app`: PASS
- `npm run qc:dev-068:contract`: PASS
- `npm run qc:dev-068:a0005-core`: PASS
- Rendered UI reload: PASS；A0005-P03 變體備註與受控備註均顯示「不適用」。
- Screenshot: `not-applicable-visible-after-reload.png`
- Release decision: R16 維持 FAIL；必須另起一輪從 A01 開始完整重跑。
