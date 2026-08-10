# DEV-061 圖號／料號檔案歸屬與 3D 內容共用驗證計畫

Status: `Focused Local QC Executed / Production Storage & Cleanup Gate Pending`
Date: 2026-08-10
Owner: QA
Related DEV: `DEV-061`
Related SPEC: `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-FILE-OWNERSHIP-001-contextual-files-and-3d-content-reuse.md`

## 1. 驗證目標與責任邊界

本計畫驗證四個不可互相替代的結果：

1. 圖號只承載受控圖面版次檔，不再提供一般附件庫、參考附件或已刪除資料入口。
2. 每次首版／進版送審都必須收到本次操作重新上傳的 2D 原始檔與 3D CAD；不得以歷史連結或沿用上一版取代上傳動作。
3. 系統在收到 3D 後以 SHA-256、檔案大小、公司與 owner scope 判斷；相同內容重用 canonical asset／shared model link，不增加第二份實體物件。
4. 料號文件仍可獨立新增、預覽、下載與管理，但使用精簡、不收合且不重複預覽資訊的清單 UI。

QA 負責測試策略、fixture、風險覆蓋與證據要求；QC 必須在 RD 完成後，以真實 UI、API、資料庫與儲存物件計數獨立驗證。此文件不是 QC PASS 證據。

## 2. Human Confirmed 驗證基線

- `HD-061-01`：既有圖號一般／參考附件是無用資料；只刪除經引用掃描證明不受任何受控紀錄保護的資料。
- `HD-061-02`：每次圖面首版／進版仍須由使用者上傳 3D；系統偵測與其他版本完全相同時共用 canonical asset，不重複占用容量。
- `HD-061-03`：所有首版／進版一律要求 2D 原始檔與 3D CAD，缺一不得送審。

任何實作若把 `HD-061-02` 解讀為「使用者可以不傳 3D、直接沿用前版」，立即判定 FAIL。

## 3. 測試資料與隔離環境

所有 mutation 與清理測試只准在 disposable isolated runtime／storage 執行，不得連接 production bucket、正式 Drive 或正式資料庫。

| Fixture | 內容 | 預期用途 |
|---|---|---|
| F-01 | 公司 A、同 drawing/root，版次 `0.1` 與 `0.2`；2D bytes 不同、3D bytes 完全相同 | 驗證每版皆上傳，但 3D physical object count 不增加 |
| F-02 | 同 owner 版次 `0.3`；3D bytes 改變 | 驗證建立新 canonical asset／shared model version |
| F-03 | 公司 B 上傳與 F-01 相同 bytes | 驗證不得跨公司共用或洩漏識別資訊 |
| F-04 | 公司 A、不同 part root／owner 上傳相同 bytes | 驗證不得自動跨 owner 共用 |
| F-05 | 缺 `.SLDDRW`、缺 `.SLDPRT/.SLDASM`、多個 primary、手動錯分 role | 驗證 hard gate 與 role 防呆 |
| F-06 | legacy loose drawing reference assets；另含 package、candidate、supplement、shared model、submission 所引用 assets | 驗證 dry-run 候選與 protected set |
| F-07 | 相同 actor/idempotency key 重送、response loss、兩個並行相同 3D upload | 驗證 readback、冪等與 concurrency guard |
| F-08 | 料號規格、材質證明、檢驗報告與照片 | 驗證料號文件精簡清單與既有能力不退化 |

每個 binary fixture 必須記錄預先計算的 SHA-256、bytes、company、owner 與預期 canonical asset ID；不得只用檔名推論相同內容。

## 4. Failure Mode / FMEA

| ID | Failure mode | 風險 | 必驗控制 |
|---|---|---:|---|
| FM-01 | 缺 2D 或 3D 仍可送審／發布 | Critical | server authoritative readiness hard-block；UI 只作提前提示 |
| FM-02 | 使用者手動把 PDF／STEP 或其他檔案標成 required role | High | extension + sniffed type + role 契約拒絕錯分 |
| FM-03 | 相同 3D 每版各存一份 physical object | High | hash/size/scope 查重與 object-count assertion |
| FM-04 | 跨公司 hash 命中造成資料洩漏 | Critical | company scope fail closed；回應不得暴露他公司 asset ID |
| FM-05 | 跨 owner 自動共用造成錯誤主檔歸屬 | High | owner scope 限制與 negative test |
| FM-06 | submission pointer、hash 或下載內容不一致 | Critical | immutable snapshot hash readback；release/download 前驗證 |
| FM-07 | 並行請求建立兩個 canonical asset／物件 | High | DB uniqueness、transaction 與 losing request authoritative readback |
| FM-08 | submission 仍複製 bytes，容量節省只存在 shared model 表 | High | submission object-count／storage-key assertion |
| FM-09 | 清理 script 刪除 package/candidate/supplement/shared/submission 引用檔 | Critical | protected reference scan、dry-run、apply 前後 hash/count |
| FM-10 | 外部物件已刪、DB 刪除失敗，或反向失敗 | Critical | two-phase receipt、retry/reconciliation 與 fail-closed |
| FM-11 | 圖號頁仍顯示參考附件、附件管理、已刪除資料或重複上傳窗 | Medium | visible text／DOM sweep 與紅筆檢查 |
| FM-12 | 預覽按鈕與預覽圖重複、清單收合或 viewport overflow | Medium | interaction、keyboard 與三 viewport visual QC |

## 5. Functional Test Matrix

### 5.1 Required role 與送審 gate

- 新首版與正式進版都必須有且只能有一個 primary `drawing_2d`，副檔名為 `.slddrw`。
- 新首版與正式進版都必須有且只能有一個 primary `cad_3d`，副檔名為 `.sldprt` 或 `.sldasm`。
- PDF、DWG、DXF、STEP、IGES、X_T、圖片或說明文件不能滿足上述 required role。
- 候選首版與正式進版必須呼叫同一 server readiness service，輸入相同時結果與 error code 相同。
- 只勾選歷史 3D、只保留前版 model link、或 client 偽造 role 時，因缺本次 `cad_3d_upload_receipt` 而拒絕。
- 上傳完成、角色判定完成但 package write 失敗時，不得形成可送審的半套狀態。

### 5.2 3D content reuse

- F-01 的 `0.1`、`0.2` 各自形成 upload receipt 與 package evidence；第二次寫入後 3D physical object count、canonical `file_assets` count 與 shared model content identity count皆不增加，只新增版次關聯。
- F-02 必須建立新 canonical asset、新 storage object 與新 model version；不得誤連舊 hash。
- F-03、F-04 即使 hash/size 相同也不得自動重用；API 回應、log、audit 不得暴露別的 company／owner asset metadata。
- 回應遺失後以相同 idempotency key 重送，只回讀同一結果；不同 key 同內容仍只保留一份 canonical object。
- 兩個並行相同 upload 最終只允許一個 canonical winner；loser 取得同一 canonical pointer，暫存物件須清除或進入可追蹤 reconciliation。
- hash 相同但 size 不同、hash 缺失、hash algorithm 非預期、讀取驗證失敗時一律 fail closed，不得共用。

### 5.3 Submission、release、preview 與 download

- 新 submission row 寫入 `source_file_asset_id` 與 immutable hash；不得再為同一受控檔建立 submission 專用 byte copy。
- legacy `local_path` 仍能相容讀取；新 write 不得依賴 legacy path。
- submit、review、release、preview、download 與 audit readback 都解析到同一 bytes；hash mismatch 必須阻擋並留下可操作錯誤。
- 3D preview 點擊預覽圖即開啟預覽；DOM 不存在獨立「開啟預覽」按鈕。沒有預覽 derivative 時顯示單一 fallback，不製造第二個檔案入口。

### 5.4 API 與權限

- 新 package file route 僅允許具對應 drawing revision write 權限者新增／刪除 draft 檔案；Released evidence 不可改。
- `POST /api/numbering/drawings/{drawingNumber}/attachments` 回 `410` 與 `DRAWING_REFERENCE_UPLOAD_RETIRED`，不得偷偷轉寫料號文件或 package。
- 料號附件 POST 保持可用且 company／part scope 正確。
- 所有 write 支援 idempotency/readback；重送不得產生重複檔、重複 package role 或重複 audit event。
- 權限不足、檔型錯誤、缺 required role、hash 驗證失敗、Released immutable 與 retired endpoint 必須回規格指定且穩定的 error code。

### 5.5 資料清理 migration

- `scripts/migrate-dev-061-remove-drawing-reference-files.mjs` 預設只能 dry-run，輸出候選 asset ID、storage key、bytes、hash、引用掃描結果與總數。
- F-06 中 package、candidate、supplement、shared model、submission 任一引用存在的 asset 都不得列入刪除。
- preview job／derivative 本身不保護無 authority 的 loose reference asset，但必須依 canonical source 的刪除結果一致清理。
- apply 只能在 disposable storage，須先保存 manifest／checksum；完成後提供 DB、外部物件與 audit receipt 的 before/after count。
- 注入 object delete failure、DB failure、timeout 與重跑；結果須可恢復、可對帳，不能成為無紀錄孤兒。
- production apply、正式 Drive／bucket 刪除與不可逆資料修復不在本地 RD 授權內。

## 6. UX / Visual / Accessibility Matrix

- 圖號詳情只有一個主要 CTA：依狀態顯示「建立首版」或「建立新版本」；不得同時出現一般附件上傳窗。
- `圖面與附件` 只呈現 3D／2D 受控內容及精簡、常駐的版次檔案資訊；不得出現「附件管理」「參考附件」「已刪除資料」或同檔案重複卡片。
- 料號詳情顯示不收合的精簡 `料號文件` 清單；每列只保留檔名、類型／說明、版本或日期、主要動作，不以大卡片重複預覽資訊。
- 檔案清單不以收合節省空間；應由緊湊 row、合理欄距與單層 action 降低高度。
- 3D／2D 預覽區點擊內容開啟預覽；download 可保留為次要 icon，不能另放「開啟預覽」icon／button。
- 驗證 1440×900、1024×768、390×844：無水平 overflow、裁切、重疊、離屏 action 或 sticky header 遮擋。
- 完成 visible text noise／red-pen sweep：無重複檔名、重複類型、重複數量、歷史參考清單與無功能標題。
- 鍵盤可聚焦預覽圖並用 Enter／Space 開啟；focus 樣式可見；icon-only download 有 accessible name；錯誤訊息可被讀屏辨識並指向缺少的 2D 或 3D。

## 7. Planned Automated Commands

RD 應新增並由 QC 執行：

```powershell
npm.cmd run qc:dev-061:file-ownership
npm.cmd run qc:dev-061:cleanup-dry-run
npm.cmd run qc:dev-061:ui
npm.cmd run qc:dev-061:real-operation
npm.cmd run typecheck
```

另需執行 affected-file ESLint、SQLite/PostgreSQL bootstrap、PostgreSQL migration mirror／manifest 檢查。命令名稱若因專案慣例調整，必須回寫 SPEC、`package.json` 與本計畫，不能只存在個人 shell history。

## 8. Evidence Contract

`output/qa/dev-061-file-ownership/<runId>/` 至少包含：

- fixture manifest、預期／實際 SHA-256、size、company、owner 與 asset/model/package/submission IDs；
- API request/response、idempotency replay、parallel race 與 authoritative readback；
- DB rows、storage object keys 與 before/after physical object count；
- cleanup dry-run manifest、protected set、disposable apply receipt、failure injection 與 reconciliation；
- submit/review/release/preview/download 的完整 read path 與 hash verification；
- 1440×900、1024×768、390×844 screenshots、DOM visible-text sweep、console/network log 與 accessibility checks；
- 缺陷清單、修正重測、productionConnected=false、productionWrites=false、cleanupStatus。

只提供 unit test 或 mock storage 證據，不足以證明 3D 實體容量沒有重複；只提供畫面截圖，也不足以證明資料保護與 submission pointer 正確。

## 9. Pass / Fail / Stop Conditions

PASS 必須同時成立：

- required 2D/3D server gate、candidate/formal parity 全部通過；
- 每一版都有本次 3D upload receipt，且 identical 3D 只有一份 canonical physical object；
- company／owner isolation、concurrency、idempotency、response-loss readback 全部通過；
- submission 不再複製新 bytes，release/preview/download hash 完整；
- cleanup dry-run 零 protected false-positive，disposable apply 與失敗恢復通過；
- 圖號 UI 無一般附件入口，料號文件清單精簡且不收合，三 viewport 與鍵盤操作通過；
- typecheck、affected lint、migration mirror 與四個 DEV-061 QC command 全數通過。

以下任一情況立即停止並標記 `Blocked / Insufficient Evidence`：

- 需要連線或刪除 production／正式 Drive／正式 bucket 資料；
- 需要放寬 Human Confirmed 的 2D/3D hard gate、允許沿用歷史 3D 而不重新上傳，或新增 `two_d_only` 例外；
- 無法證明 asset 是否被 package、candidate、supplement、shared model 或 submission 引用；
- 無法取得真實 storage object count、hash readback 或 disposable cleanup 證據；
- 需要跨 company／owner 共用，或需改寫 Part Number／Drawing revision authority；
- 發現舊規格與 DEV-061 衝突但未完成 amendment／governance convergence。

## 10. Current Verdict

本機產品與 focused QC 已完成：`qc:dev-061` 通過 file-ownership 11/11、cleanup dry-run `ready_for_review`、UI contract 6/6 與 typecheck；隔離 SQLite 真實瀏覽器 14/14 通過 1440×900、1024×768、390×844；舊 drawing attachment POST 410、同 3D bytes 跨版次 `reused=true`／canonical asset readback、affected lint、build 與 migration mirror 亦通過。

本計畫仍保留兩個 release gate：正式 storage object count/hash reconciliation 尚未連 production 執行；cleanup 目前只產生 12 筆候選 dry-run，未 apply、未刪除正式資料。完整 production deletion、live migration、deploy 與 release 均未授權。實際操作摘要與限制見 `.ai-doc/qa/DEV-061-real-operation-evidence-2026-08-10.md`。
