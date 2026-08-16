# DEV-074 QC 全量重跑 R7

- 狀態：失敗（A04）
- 起始：2026-08-15 18:43:28 +08:00
- 原則：R6 修復後從 W0 歸零；58 條路徑只採計本次 rendered UI 證據。
- 商業資料變更：僅透過畫面操作；直接 API/DB 變更皆為 0。
- W0：通過。localhost:3000 健康；五個已登入角色與一個未登入 context 皆為 R7 新 session；未登入受保護頁回到登入畫面，資料 API 為預期 401；未發現 production mutation target。
- W1：A01–A03 通過；A04 在提交前發現「製造圖 M」與「關聯會建立為參考」同時顯示，判定 P1。A04 未送出，零 business write；依 wave stop 規則其餘 54 條未執行。
- 計數：Pass 3 / Fail 1 / Blocked 0 / Not Run 54。
- RD 修復：`effectivePrimaryManufacturing` 現以製造用途且同時含料號/圖號判斷；typecheck 通過，R7 原畫面局部重驗已正確顯示「圖料關聯會建立為製造基準」。契約新增防回歸 assertion；既有 request-equivalence suite 另有兩項與本修復無關的基線失敗，留待最終回歸一起處理。
