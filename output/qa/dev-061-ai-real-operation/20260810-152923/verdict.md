# DEV-061 AI-QC 執行判定

- 執行時間：2026-08-10
- Run ID：`20260810-152923`
- Runtime：isolated SQLite + disposable repository，`127.0.0.1:3002`
- Actor：Demo Admin / `company-jenfu`
- 正式資料 mutation：否；所有 mutation 僅寫入 `tmp/qa/dev-061/20260810-152923`
- Cleanup apply：未執行

## 結論

`FAIL`

首個失敗為 P1 `REUSE-005`：兩個並行、相同 SHA-256 的 3D CAD upload 都回 201，但建立了 2 個 physical storage object。其一回報 `reused=true` 並指向另一個 canonical asset；孤兒 asset 仍保留，未達「單一 canonical physical object、無孤兒 object」要求。

## 通過項目

- `qc:dev-061:file-ownership`：11/11。
- `qc:dev-061:ui`：6/6。
- `qc:dev-061:real-operation`：14/14；viewport `1440x900`、`1024x768`、`390x844`。
- 正式 hard gate：只 2D 回 `DRAWING_3D_REQUIRED`；只 3D 回 `DRAWING_2D_REQUIRED`；完整 2D + 3D 建立 submission/package，兩個 primary role 均存在。
- 退役路由：POST `/api/numbering/drawings/A0005-M01/attachments` 回 410 `DRAWING_REFERENCE_UPLOAD_RETIRED`，並指向受控進版路徑。
- 順序重用：相同 3D bytes 的第二版回 `reused=true`，hash、canonical asset 與 storage key 一致。
- Pointer/download：submission `SUB-20260810-3A60CC35` 的 2D/3D `source_file_asset_id` 非空；package pointer 對應；下載 bytes SHA-256 均與 source asset 一致。
- UI：檔案清單常駐且精簡、不收合、無一般附件管理入口、無獨立預覽按鈕、無水平 overflow。 :codex-annotation{index="1"}
- 3000 原有本機服務於結束時仍健康；3002 隔離服務已關閉。

## 未充分驗證

- 候選首版完整 parity、跨 company／跨 owner isolation、response-loss idempotency、正式 cleanup protected-reference failure injection 尚未完成；依 P1 失敗停止後續 mutation。
- 本輪 fixture 沒有可用的 ready preview derivative，因此只驗證 pending/missing fallback；實際點擊預覽圖開新分頁未形成 PASS 證據。
- cleanup script 本次仍讀取 canonical `data/ai-pdm.sqlite`，雖然 `apply=not_performed`，不列為本 run fixture 的完整 cleanup PASS。

## 證據

- Browser screenshots：`output/qa/dev-061-real-operation/20260810-1440x900.png`、`20260810-1024x768.png`、`20260810-390x844.png`。
- Isolated fixture DB：`tmp/qa/dev-061/20260810-152923/data/ai-pdm.sqlite`。
- Isolated runtime log：`tmp/qa/dev-061/20260810-152923/runtime-dev.stdout.log`。
- 關鍵 DB/storage 回讀：同目錄 `database-readback.json`。

