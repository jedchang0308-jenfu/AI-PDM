# DEV-082 PDF 瀏覽器 OCR 本機 QA／QC 報告

狀態：`RD Implemented / Local QA-QC Complete / OCR-082-001..044 PASS / Production Release Gated`  
日期：2026-08-20  
範圍：`DEV-082 / DEV-PDM-PDF-BROWSER-OCR-001`，父交付點 `DEV-068`

## 1. 結論

DEV-082 的 001..038 pipeline／repository baseline 與本輪 039..044 targeted A0002 三 viewport evidence 均通過；DEV-035／DEV-068／DEV-079 affected regression 與 44/44 completion gate 亦已通過。本文件確認本機 QA/QC complete，但 production release 仍獨立 gated。只有 PDF 會讀取內容：瀏覽器先以 PDF.js 取文字層，只有文字層不足的頁面才以 Tesseract.js WebAssembly `chi_tra+eng` OCR；SolidWorks 繼續走 DEV-035 native reader，JPG／JPEG／PNG／DWG／DXF／其他附件只辨識檔名。使用者不需安裝 OCR 軟體或輸入 OCR API key，系統沒有新增 OCR server、queue、VM、container 或第三方文件上傳。

必要欄位固定為圖號、版次、料號、品名／圖名、材質、比例、製圖者。每份 eligible PDF 對七欄都產生 `found／conflict／not_found` outcome；`not_found` 不建立空候選、不沿用既有值，也不清除正式資料。每個必要欄位最多五個 distinct values、每 PDF 最多 50 observations、每 session 最多 100、Tier 3 最多 10；Tier 0 先占容量。

## 2. 本輪 082-I／J 實作與 targeted evidence

082-I 已完成下列程式變更：

- `src/components/pdf-page-viewport.tsx`：同一 loaded `PDFPageProxy` 的 direct clipped render；以 `targetRect` 的水平 30%／垂直 50% safety padding、78% safe lens area、自適應 crop／zoom、backing scale 2.5..3、1024px edge cap、四筆 LRU、cancel／cleanup／fallback 與 `resolutionMode`、`coverageRatio`、`targetRect`、`cropRect`、`backingScale`、`renderElapsedMs` diagnostics 完成高解析局部重繪。
- `src/components/drawing-detail-preview.tsx`：傳入 source-aware cache key，不新增 route、viewer 或 PDF content GET。
- `src/lib/pdm-entity-detail.ts`：candidate PDF 若沒有 derivative，直接以受控原始 PDF 作為 ready preview，避免右欄已有 PDF evidence 而左側仍停在「預覽尚未就緒」。
- `src/app/globals.css`：定位 highlighter 無外框；放大鏡只有單一黃色 ring，移除 green／double frame 與 handle。
- `scripts/qc-dev-079-recognition-layout-browser.mjs`、`scripts/qc-dev-082-contract.mjs`、`scripts/qc-dev-082-gate.mjs`、`scripts/qc-dev-082-regression.mjs`：新增 OCR-082-039..044 對應診斷與 gate 斷言，包含完整 material text、direct crop、三 viewport、canvas/LRU/recovery/elapsed bounds。

Targeted evidence（2026-08-21）：

- `npm run qc:dev-082:contract` PASS；`OCR-082-039..044` static implementation contract PASS。
- `npm run qc:dev-082:repository` PASS；isolated copy 內 PDF-only claim、hash/magic/tenant gate、pending formalization 與 replay invariants PASS。
- `npm run typecheck:app` PASS；affected ESLint PASS。
- A0002 queued recognition sessions 已使用既有 local launcher 保存的 preview token + recognition worker token 完成至 `review_ready`；沒有把 token 寫入 source 或文件。
- `npm run qc:dev-079:contract` PASS；`npm run qc:dev-079:recognition-layout-browser` PASS：isolated successor fixture 在 1440／1024／390 均通過 single-surface、PDF/CAD source switch、marker／magnifier placement、exact material text與 zero error assertions。
- `npm run qc:dev-082:browser` PASS：isolated PDF OCR fixture 完成 9 份 PDF、三 viewport、reload/re-entry、content GET／range／unauthorized、canvas／worker cleanup與 network/privacy sweep。
- Direct PDF.js renderer smoke（不改 UI／DB）：A0002 受控 PDF page 1 以 `offsetX/offsetY` direct crop、backing scale 2.5x 產生 `550×300` canvas（edge 550、RGBA 660,000 bytes），抽樣 non-white pixels=5,512；同頁 text layer 含完整 `不鏽鋼SUS304`。此證據只證明 renderer/crop 基礎，不替代真實 Chromium overlay／三 viewport gate。
- `build:isolated` PASS；Next 16 Turbopack 127 routes compile、TypeScript、static generation均完成，暫存型別檔已由 runner 清理。

因此 `OCR-082-001..044` 與 `OCR-082-030` 均 PASS；canonical `revision` 已取代 fixture 舊 `source_revision`，generic DEV-079 layout 已改用隔離 A0002 fixture 並保留版面斷言，`qc:dev-082:regression` 與 `qc:dev-082:gate` 均完成。production representative gold set、正式檔案存取、部署與 release 仍是獨立 gate。

## 3. 可重跑瀏覽器實證

完成閘門不再依賴人工撰寫的 browser evidence 或單一客戶檔。`scripts/qc-dev-082-browser.mjs` 每次在隔離資料庫即時產生九份不含正式資料的合成 PDF，經真實 Chromium、正式頁面、API 與 DB readback 驗證後只保留報告與截圖，不保存原始 fixture bytes。

| Fixture | 實際結果 |
|---|---|
| 文字圖框 | 七個 Tier 0 全部 `found`；PDF.js 文字層完成，OCR Canvas=0；1 GET＋1 POST |
| 中英掃描圖框 | `chi_tra+eng` Tesseract 實際執行，七個 Tier 0 全部 `found`；刻意 reload 後 2 GET＋1 terminal POST，沒有 false success |
| 混合文字／掃描 | PDF.js 與 Tesseract 結果合併，七個 Tier 0 全部 `found` |
| 缺漏欄位 | 只有品名 `found`，其餘六欄穩定 `not_found`，沒有補猜或空 observation |
| 衝突欄位 | 圖號第六個 distinct value 觸發 `conflict_overflow`，保留最佳五值並回 `partial` |
| 5000×5000 大頁面 | 實際最大 Canvas 11,999,296 pixels，低於 12 MP；完成後 Canvas backing store 歸零 |
| 21 頁掃描 | 只處理 20 個 OCR 頁並回 `pdf_ocr_page_limit_reached`／`partial` |
| 損毀／密碼 PDF | 分別回 `pdf_source_invalid` 與 `pdf_encrypted_or_password_required`，無永久 spinner |

三個 viewport 共顯示 9 張來源卡、63 個必要欄位 outcome；沒有水平 overflow、技術字串、unexpected HTTP error、console error 或第三方 request。PDF 區塊是唯一重新辨識 action owner；固定頁尾不重複重試動作，且與最後內容保有 72～88px 間距。這組 evidence 證明 pipeline、truthfulness、resource bound 與 recovery，不等同跨模板 production accuracy benchmark。先前 A0002 PDF 人工操作結果只保留為補充觀察，不再作 completion gate 的主要證據；A0002 SolidWorks 原生八欄位則由 `qc:dev-035` 的真實 reader gate 獨立驗證。

## 4. OCR-082 驗收矩陣

| IDs | 結果 | 主要證據 |
|---|---|---|
| 001 | PASS | adapter plan contract：PDF browser OCR；SolidWorks native；影像／DWG／DXF filename-only |
| 002～004 | PASS | runtime-generated 文字層、`chi_tra+eng` 掃描與 mixed PDF；真實 Chromium、API、DB readback |
| 005～012 | PASS | 七個 Tier 0 outcome、六值 conflict overflow、no-fabrication、Tier 0-first、50／100／10 caps 與 deterministic ranking |
| 013～014 | PASS | payload denylist、selected evidence only、versioned fail-closed policy與 immutable asset hash |
| 015～021 | PASS | actor/company/source membership、hash／MIME／magic、512 KiB body、single completion、idempotent replay、conflict、pending formalization gate |
| 022～024 | PASS | sanitized terminal diagnostics、12 MP／20頁／60秒／10分鐘 bounds、Canvas/worker cleanup，以及重新開頁／重新辨識 recovery |
| 025～029 | PASS | 可見進度／重試／required outcome tiles、same-origin asset/network sweep、每 PDF 一 GET＋一 POST、1440／1024／390 無水平 overflow |
| 030 | PASS | DEV-035、DEV-068、DEV-079 contract/layout/recognition affected regression、TypeScript、affected ESLint、isolated build與`git diff --check`均通過 |
| 031 | PASS | canonical revision contract：`revision`／`identity_relation`／evidence-only；legacy `source_revision` 僅作輸入 alias |
| 032 | PASS | repository same-value corroboration：CAD／PDF 同值只形成一個 review group並保留雙來源 |
| 033 | PASS | repository cross-source conflict：異值形成單一 unresolved group，不靜默選 winner |
| 034 | PASS | PDF.js與Tesseract producer 均輸出有限 0..1 top-left normalized page geometry；consumer 錨定實際渲染紙張，不使用 browser viewer frame |
| 035 | PASS | evidence resolver 優先可定位 PDF；legacy／CAD fallback 顯示真實來源與無座標狀態 |
| 036 | PASS | identity-only drawing number／revision 不進 formalization impact或 revision metadata write |
| 037 | PASS | 舊 `source_revision`／raw geometry session append-only 可讀，projection相容合併 |
| 038 | PASS | A0002 single-surface browser regression：exact PDF.js page、框完全位於紙張內、三 viewport 座標一致，無 PDF tab／第二 viewer／新 source，焦點可精確返回原圖面 |
| 039 | PASS | isolated A0002 successor browser evidence：target/crop rect、30%／50% safety padding、78% safe lens、coverage `1`，長材質文字含安全留白且未被固定倍率裁切 |
| 040 | PASS | 同一 loaded `PDFPageProxy` direct crop：`resolutionMode=pdf_high_res_crop`、backing scale `2.5`、single page renderer、single preview surface、無新增 content GET／iframe／第二 viewer |
| 041 | PASS | computed styles：highlighter border／outline `0`，magnifier 單一黃色 ring，green／double ring／handle 均不存在；caption 保留值／檔名／頁碼 |
| 042 | PASS | 1440／1024／390 matrix：lens 與 marker 均在實際 PDF paper 內、不重疊、無水平 overflow、無 stale image／unexpected scroll |
| 043 | PASS | component contract + browser diagnostics：canvas edge `<=1024`、LRU `<=4`、render elapsed `<=150ms`、cleanup／fallback／cancellation evidence完整 |
| 044 | PASS | A0002 material readability：三 viewport 顯示完整 `不鏽鋼SUS304`，backing scale `>=2.5`、coverage `1`、正常閱讀距離可辨識 |

## 5. Security、privacy 與成本

- 真實瀏覽器 trace 只有 `127.0.0.1` same-origin；每份 PDF 正常流程恰為一個 content GET 與一個 result POST，無第三方 PDF／OCR text upload。
- PDF bytes、Base64、Canvas、bitmap、word array、被淘汰原文、API key 與本機路徑均不得進 completion payload；repository 只保存 selected field evidence、必要 outcome diagnostics 與 aggregate counts。
- OCR 計算使用瀏覽器 CPU/RAM；server 只有既有受控 PDF 讀取與一次短結果寫入，因此沒有新增 always-on compute 成本。
- immutable OCR 靜態資產 manifest 共 8 檔、9,891,559 bytes（約 9.43 MiB，含 worker wrapper 與 license 檔），實際版本目錄與 manifest 一致、無殘留檔：文字型 PDF 不載入 Tesseract 語言模型；掃描頁第一次才載入 WASM／中英模型，後續由瀏覽器長效快取。增加的是首次下載頻寬與使用者端運算，不是 OCR 主機費。
- production 尚需代表性跨圖框 gold set、真實頻寬／裝置 P95 與 release smoke；這些是 release gate，不否定本機 Current Phase 完成。

## 6. 自動化與瀏覽器證據

- DEV-082 contract：`output/qa/dev-082-browser-pdf-ocr/contract-20260820162258-local-isolated/`
- DEV-082 repository：`output/qa/dev-082-browser-pdf-ocr/repository-20260820162258-local-isolated/`
- DEV-082 browser：`output/qa/dev-082-browser-pdf-ocr/browser-20260820162922-local-isolated/`
- DEV-082 regression：`output/qa/dev-082-browser-pdf-ocr/regression-20260820161721-local-isolated/`（PASS）
- DEV-082 completion gate：`output/qa/dev-082-browser-pdf-ocr/gate-20260820163042-local-isolated/`（44/44 PASS）
- DEV-079 generic layout：`output/qa/dev-079-layout/20260820161642-browser/`（3/3 PASS；isolated A0002 fixture）
- DEV-079 recognition layout（含 A0002 successor、PDF/CAD source switch、黃色螢光標記與局部放大鏡）：`output/qa/dev-079-recognition-layout/20260820161949-browser/`
- DEV-079 contract：`npm run qc:dev-079:contract` PASS（更新後契約明確要求 PDF.js crop render，不再檢查舊版 `drawImage(mainPreviewCanvas, ...)`）。
- DEV-068 aggregate：contract `output/qa/dev-068-drawing-recognition/contract-20260820071616-local-isolated/`、A0005 `A0005-20260820071617-local-isolated`、browser `browser-20260820071632-local-isolated/` 全部 PASS；TypeScript 與 isolated production build退出 0。
- `npm run qc:dev-035` 以 real DPAPI provider、native probe、exact-version worker ack 及 A0002 八欄位 repeatability 通過；affected ESLint、`git diff --check` 亦通過。production／staging、deploy、release 未執行。

補充：A0002 的 PDF 定位不會在預覽畫面新增 PDF 頁籤、route 或第二 viewer；它只在既有 2D preview surface 暫時切換到第 1 頁並顯示黃色螢光標記與局部放大鏡，選 CAD 時顯示「檔案屬性／無圖面座標」，清除 evidence focus 後恢復原 2D 圖面。此行為由 DEV-079 recognition-layout browser evidence 與 OCR-082-038 gate 共同驗證。

2026-08-21 定位修復補充：先前 observation 的 `normalized_page/top_left` 座標本身正確，但 UI 把百分比套在含 Chrome PDF toolbar、thumbnail sidebar 與頁面留白的整個 viewer frame，導致標記落在紙張外；另有原始 PDF 無 derivative 時左欄長時間顯示尚未就緒。Evidence mode 現改以同源 PDF.js 精確渲染指定頁，candidate PDF 直接使用受控原始 PDF；半透明黃色螢光標記成為實際紙張 wrapper 的 child，並由同一 `PDFPageProxy` 以 offset crop 高解析重繪。放大鏡自動避開標記，caption 仍留在既有 preview surface。1440／1024／390 實測 `coverageRatio=1`、`resolutionMode=pdf_high_res_crop`、backing scale `2.5`、完整 `不鏽鋼SUS304`、`highlightWithinRenderedPage=true`、`magnifierWithinRenderedPage=true`、`magnifierOverlapsHighlight=false`、canvas 含實際非白圖面像素且 console/network error=0。最新 browser evidence：`output/qa/dev-079-recognition-layout/20260820161949-browser/`。標準預覽模式不受影響。

本次 UI follow-up 的 `qc:dev-079:contract`、`qc:dev-079:layout-browser`、`qc:dev-079:recognition-layout-browser`、`qc:dev-082:contract`、`qc:dev-082:repository`、affected ESLint、`typecheck:app`、`build:isolated`、`qc:dev-082:regression` 與 `qc:dev-082:gate` 均 PASS；隔離 build／browser 暫存目錄已清除，沒有遺留 task-owned runtime。既有 3000 primary server 未停止。

## 7. 已知限制

- 掃描圖品質、字體、旋轉與圖框差異仍會影響 Tesseract 準確率；低信心時必須回 `not_found/conflict` 交人工核對，不得提高猜測率。
- 第一版要求頁面保持開啟；關頁後不在 server 背景繼續。只有 P95 超過 3 分鐘、平均 OCR 頁數超過 10、tab 中斷率超過 5%，或產品明確要求離頁運算時，才重開 background/checkpoint 架構評估。
- production migration、deploy、正式流量與 release 仍未授權。
