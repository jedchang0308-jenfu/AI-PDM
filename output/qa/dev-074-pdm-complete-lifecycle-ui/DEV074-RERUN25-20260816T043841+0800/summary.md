# DEV-074 R25 QC summary

- 結果：FAILED（B04 發現錯誤後停線）
- 路徑：7 pass / 1 fail / 0 blocked / 50 not run
- 缺陷：DEV074-R25-P1-021
- 原始錯誤：審核快照的 2D 預覽未就緒時，媒體輪詢每 2 秒收到 409，造成瀏覽器持續記錄 Failed to load resource。
- RD 修復：所有 rendered preview 未就緒端點統一回 202 Accepted、Retry-After 與 pending header；UI 保留可理解的等待狀態。
- 定向 UI 複驗：三個附件均可見、等待文案可見，連續 6.5 秒輪詢後 console error = 0。
- 判定：定向複驗不改寫 B04 原始失敗；另開新輪次從 A01 重跑。
