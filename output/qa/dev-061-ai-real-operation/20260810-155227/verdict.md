# DEV-061 AI-QC 執行判定

- Run ID：`20260810-155227`
- Runtime：isolated SQLite + disposable repository；測試 port `3002`／`3003`
- Actor：Demo Admin；公司 `company-jenfu`
- Production：`connected=false`、`writes=false`
- Cleanup apply：未執行；`--apply` 明確拒絕

## 結論

`PASS`

本輪首輪 P1 `REUSE-005` 已修正並通過重測：兩個並行、相同 SHA-256 的 3D CAD upload 都回 201，兩筆 upload receipt 共用同一 `storage_key`，只有一筆 active `shared_cad_model_versions`，實體儲存物件數為 1，沒有孤兒物件。

## QC 通過證據

- 靜態 ownership／migration／並行交易契約：`14/14 PASS`。
- UI contract：`6/6 PASS`；檔案清單常駐且精簡、無一般附件管理、無獨立預覽按鈕、點擊預覽圖為唯一預覽入口。
- 真實瀏覽器：`14/14 PASS`；`1440x900`、`1024x768`、`390x844` 均通過，無水平 overflow。
- formal hard gate：只有 2D 時回 `DRAWING_3D_REQUIRED`；補齊 2D 原始檔與 3D CAD 後建立 submission `SUB-20260810-62E18CA9` 與 package `DRP-916a9001-0096-4a48-9420-9a90fc697b62`。
- pointer／download：submission files 與 package files 均有 `source_file_asset_id`；2D／3D 下載後 SHA-256 均與 receipt 一致，沒有 submission byte copy。
- 同 idempotency key 重送：submission、package、submission files 數量均維持 `1 / 1 / 2`。
- owner isolation：相同 hash 在兩個不同 `part_root` 建立兩筆不同 canonical，沒有跨 owner 共用。
- company isolation：以 `MAXIMA` 查詢 `A0005-M01` 回 404 `drawing_number_not_found`，未暴露鉦富資料。
- ready preview：預覽圖可被 focus，Enter 開啟新分頁並載入 preview URL；focus outline 為 3px。無 ready preview 的 2D 狀態仍提供可下載原檔與重新整理指引。
- cleanup dry-run：`13` 筆 loose candidate；4 筆受保護 asset 均未列入候選。`--apply` 回傳非零並拒絕執行。
- typecheck：通過。
- isolated build：Next `Compiled successfully in 47s`，路由清單產出，isolated 暫存目錄已清除。

## 限制與邊界

- 本輪只使用 disposable fixture；未執行正式資料 cleanup、live migration、deploy、release 或 production storage reconciliation。
- 原有 3000 本機服務未停止；isolated 3002／3003 測試服務均已停止。

## 證據

- DB／storage／pointer readback：`database-readback.json`
- 三 viewport screenshots：`browser/1440x900.png`、`browser/1024x768.png`、`browser/390x844.png`
- fixture DB：`tmp/qa/dev-061/20260810-155227/data/ai-pdm.sqlite`
- fixture repository：`tmp/qa/dev-061/20260810-155227/repository`
