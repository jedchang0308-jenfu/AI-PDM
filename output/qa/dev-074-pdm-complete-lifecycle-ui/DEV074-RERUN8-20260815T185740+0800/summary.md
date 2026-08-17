# DEV-074 QC 全量重跑 R8

- 狀態：進行中
- 起始：2026-08-15 18:57:40 +08:00
- 原則：R7 修復後從 W0 歸零；58 條路徑只採計本次 rendered UI 證據。
- 商業資料變更：僅透過畫面操作；直接 API/DB 變更皆為 0。
- W0：通過。五個 R8 隔離登入 context 與一個未登入 context 已由畫面驗證；localhost 健康、3D worker 運作、未登入受保護路徑回登入、無 production target。
- W1/A：A01–A04 通過。R7 缺陷已由 A04 的真實提交與結果畫面重驗；目前 Pass 4 / Not Run 54。
- W1/B01：失敗。僅 2D 的缺 3D gate 正確，但預覽 UI 顯示 3D 文案並以 409 重複輪詢，連續產生 console errors。依 wave stop，B02–G06 未執行；R8 計數 Pass 4 / Fail 1 / Not Run 53。
- RD 修復：preview pending 改用 HTTP 202 + Retry-After，shared renderer 依 2D/3D 顯示正確文案。typecheck 通過；新隔離畫面連續收到 202、顯示「2D 預覽轉檔」，console 0 error。R8 verdict 不變，下一輪仍需全量重跑。
