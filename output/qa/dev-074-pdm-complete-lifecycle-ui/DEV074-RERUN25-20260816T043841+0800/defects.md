# R25 defects

## DEV074-R25-P1-021 — 預覽等待輪詢持續製造瀏覽器錯誤

- Severity: P1
- Path: B04
- Observed: 已核准審核明細正確顯示 SLDPRT、SLDDRW、PDF，但未完成的 2D 預覽每 2 秒向 evidence preview URL 請求並收到 HTTP 409，console 連續累積錯誤。
- Root cause: 未就緒屬正常非同步狀態，端點卻使用 Conflict 語意；UI 雖捕捉 409 並重試，瀏覽器仍將每次非成功資源回應記為錯誤。
- Repair: 審核 evidence、圖面版次包、候選版次三種 rendered preview 路徑統一採 202 Accepted + `Retry-After: 2` + `x-pdm-preview-state: pending`。
- Targeted UI retest: PASS；附件 3/3、等待文案可見、console error 0。
- Evidence: `screenshots/B04/targeted-preview-pending-no-console-error.png`。
