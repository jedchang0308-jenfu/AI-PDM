# SPEC-PDM-DRAWING-RECOGNITION-001 - 圖面／CAD 全項辨識候選、人工審核與正式化

Status: DEV-082 RD Implemented / Local QA-QC Complete / OCR-082-001..044 PASS；DEV-107 RD Implemented Locally / Human Confirmed / Local QA-QC Complete 38/38 PASS / Production Release Gated；DEV-110 RD Implemented Locally / Human Confirmed / Full QC Passed 60/60 / Production Release Gated
Authorization: 使用者已於 2026-08-20 要求把 A0002「右側版次已找到、左側卻顯示檔案屬性無法定位」缺陷寫回既有開發文件；2026-08-31 再確認取消獨立辨識核對頁、改為智慧辨識分頁內一鍵寫入，並補上送審前編輯入口，且連續要求升級開發文件。DEV-107的local產品／測試契約、SQLite schema／initializer與PostgreSQL 053 migration實作及隔離驗證已完成；同日使用者再確認DEV-110上游common＋exceptions與Part-work handoff方向並要求升級`RD Contract Ready`，後續已完成DEV-110本機實作與固定60/60工程QC。正式primary data repair、production migration、部署或 release仍未授權。
Date: 2026-08-12; amended 2026-08-31
Owner: Dev PM
Related DEV: `DEV-068` / `DEV-PDM-DRAWING-ATTRIBUTE-RECOGNITION-001`; reopened Current Phase child `DEV-082` / `DEV-PDM-PDF-BROWSER-OCR-001`; workspace relation `DEV-079`; inline formalization delivery `DEV-107` / `DEV-PDM-RECOGNITION-INLINE-FORMALIZATION-001`; implemented successor `DEV-110` / `DEV-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001`
Related ADR: `.ai-doc/decisions/ADR-PDM-DRAWING-RECOGNITION-AMENDMENT-LINEAGE-001-origin-overlay-and-synchronized-commit.md`; `.ai-doc/decisions/ADR-PDM-DRAWING-RECOGNITION-PART-WORK-HANDOFF-001-common-projection-and-atomic-draft-transfer.md`
Related prototype: `output/dev-068-attribute-recognition-ui-preview.html`（概念預覽，不是實作權威）

Related authority:

- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
- `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`
- `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`

## 2026-08-31 DEV-110 Target Successor Amendment — Common Value／Exceptions To Part Work

Status：`RD Implemented Locally / Human Confirmed / Full QC Passed 60/60 / Production Release Gated`。完整Current Phase authority為`.ai-doc/specs/SPEC-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001-upstream-part-work-handoff.md`，QA plan為`.ai-doc/qa/qa-dev-110-recognition-common-value-part-work-handoff-validation-plan-2026-08-31.md`，accepted target ADR為`ADR-PDM-DRAWING-RECOGNITION-PART-WORK-HANDOFF-001`；local receipt為`.ai-doc/qc/qc-dev-110-local-implementation-2026-08-31.md`，aggregate為`output/qa/dev-110/DEV110-aggregate-2026-08-31T13-51-48-003Z/aggregate.json`。C/R/P/B/I與G01～G04均已執行並PASS；DEV-107僅保留legacy baseline，runtime activation仍受release gate管制。

- Target UI把圖面一般區域／明確共用列的overall evidence投影成單一common field；料號／資料對照表的exact Part evidence只形成該Part exception，禁止以unique mode／majority推導common。Current Phase不新增structured table parser：只接受linked adapter可驗證的exact owner ID／完整canonical anchor，否則只在同欄位observation內以token boundary唯一命中formal eligible集合的一個完整canonical料號；舊suffix／unanchored owner、persisted `resolved`標記、縮寫／模糊／多重命中fail closed且resolver不能增加target。只在per-Part差異、source conflict、manual override或existing-work conflict時展開exceptions；公式固定`effective(part,field)=override ?? common`。manual common／override可無candidate並由v2 event稽核，common不是root persisted authority。
- Header只保留一個`N 個來源`入口；普通欄位不重複source badge。PDF evidence有geometry才定位；file property只顯示metadata，focus不得清空／remount preview造成閃動。
- canonical primary action由`確認寫入 PDM`改為有delta時的`帶入 N 個料號工作`，全部no-op時為`確認資料已一致`。server在一個bounded transaction內重驗source／relation／Part work truth，使用既有Part work invariant建立／更新exact works，成功後才建立append-only synchronization event。
- New logical event以existing `drawing_recognition_formalization_events.result_json.schemaVersion=2`與`destination=part_work`辨識；legacy event缺discriminator時維持`direct_master`解讀。physical session status仍可為`formalized`，UI不得把DEV-110 session翻譯為Part master已核准／已更新。
- DEV-110 handoff不得直接寫`part_numbers`、`part_variant_attributes`、`pdm_part_attribute_values`或Drawing master。Part edit／submit／review／approve仍由DEV-108與existing Part authority負責，Drawing review snapshot只有recognition handoff摘要，不能核准Part changes。
- DEV-107 purpose／evidence-origin overlay、single receipt、append-only event、exact source revalidation、idempotency與submitted snapshot基礎保留；direct-master commit在cutover後只作legacy／internal compatibility，不得與handoff並列為正常UI流程。
- Current Phase schema／migration／new permission=`none`。如果實作無法共用Part work repository validation、需要root writer／combined review、無法100-Part sorted atomic lock、或event discriminator不足以區分legacy／new semantics，立即停止回Dev PM。

DEV-110完整QA/QC已通過，本文§33／§34與DEV-107 ADR仍保留為legacy runtime contract，既有38/38 evidence不因successor實作而失效。DEV-110 exact repo／file／query／runner／estimate仍以authoritative successor SPEC §20～§26為準；固定60/60 aggregate evidence已形成，不能解讀為production activation或release授權。

## 0. DEV-082 Reopen Amendment — PDF 瀏覽器 OCR 與效用優先欄位容量

### 0.1 Authority、成熟度與取代範圍

本 amendment 是 DEV-068 真實 PDF 內容辨識的 Current Phase authority。2026-08-20 的 A0002 實例已由 DEV-082 以 canonical revision、normalized geometry、evidence resolver與單一 preview surface修正並完成 fresh evidence 對帳；`OCR-082-001..044`、affected regression與completion gate均通過，現行成熟度為 `RD Implemented / Local QA-QC Complete / Production Release Gated`。P0／P1 implementation gap=0；production representative accuracy、正式檔案存取、部署與release仍為獨立 gate。

Spec Impact Preflight：`Intentional replacement + compatible extension`。

- `Intentional replacement`：取代本文舊 §2／§5／§9／§17／§20／§25／§27／§30／§31 中「PDF／影像都可送 OCR」、「Current Phase 使用 `external-json-ocr.v1`／`PDM_DRAWING_RECOGNITION_OCR_CMD`」、「真實 OCR provider 尚未選定」及「所有未知 OCR 原文完整持久化」的 Current Phase 敘述。
- `Compatible extension`：保留 `filename.v1`、`native-metadata-bridge.v1`、既有 session/source/result/observation/candidate schema、company/permission guard、source hash、人工核對及正式化契約。
- 舊 `external-json-ocr.v1` 只保留未來可能的 server-side provider hook；DEV-082 adapter plan、readiness、完成判定與 UI 不得依賴它，也不得再因 `PDM_DRAWING_RECOGNITION_OCR_CMD` 未設定而顯示永久等待。
- ADR not required：本決策沒有新增 master-data authority、permission、lifecycle、正式寫入路徑或難以回復的資料模型；現行 adapter architecture 與本 SPEC 足以成為權威。

### 0.2 Human Decision Brief — 2026-08-20

1. 內容 OCR 僅處理受控 PDF。JPG／JPEG／PNG／DWG 與其他附件維持檔名及檔案角色辨識，不解析內容。
2. PDF OCR 固定在使用者瀏覽器執行，使用 PDF.js 與 Tesseract.js WebAssembly；使用者不安裝桌面程式／外掛、不輸入 OCR API Key，開發與營運不維護獨立 OCR VM、container、queue 或 GPU 主機。
3. PDF 有原生文字層時優先使用 PDF.js 文字，不啟動 Tesseract；只有無可用文字層的掃描頁才渲染 Canvas 並執行 `chi_tra + eng` OCR。
4. `圖號、版次、料號、品名／圖名、材質、比例、製圖者` 是 Tier 0 必要辨識欄位。必要的意思是每份 eligible PDF 都必須完成嘗試並回報 `found／conflict／not_found`，不是無證據時捏造值。
5. 容量先保留給 Tier 0；必要欄位完成或確定找不到後，剩餘 observation 容量才依效用分數收錄 Tier 1、Tier 2 與少量尚未歸類關鍵字。不得以 OCR 出現順序或信心分數讓低價值文字擠掉必要欄位。
6. 每份 PDF 最多持久化 50 筆 OCR observations；完整 OCR token／word boxes 只在瀏覽器記憶體中參與解析與排序，不逐字寫入資料庫。被容量淘汰的數量按 tier 記入安全 diagnostics，不保存原始內容。
7. 第一版採單次完成提交，不做 lease、逐頁 API、checkpoint tables 或關閉分頁後背景運算。關閉分頁後重新開啟並重跑未完成 PDF；若未來中斷率或文件規模達 re-entry threshold，再評估 checkpoint 或 managed background OCR。

使用思考習慣：#批判、#效用理論

### 0.3 Current Phase Scope

In scope：

- `browser-pdf-ocr.v1` 瀏覽器 adapter、PDF.js 文字層解析、必要時 Tesseract.js WebAssembly OCR。
- 同來源 PDF 的完整記憶體內文字解析、欄位映射、去重、效用排序與 bounded observation selection。
- 同源靜態 WASM／worker／`chi_tra`／`eng` assets，自動下載、版本化及長效快取；不使用第三方 runtime CDN。
- 一個 actor-authorized PDF source-content route、一個 client-adapter-result completion route，以及 session projection 的 pending-client-adapter 狀態。
- 既有 `drawing_recognition_adapter_results`、`drawing_recognition_observations`、`drawing_recognition_candidates` 與 unique `(session_id, source_id, adapter_code)`；不新增 OCR run/page tables。
- owner workspace 與完整 recognition review 的進度、終態、錯誤、重試與 formalization pending gate。
- desktop Chromium／Edge 類現代瀏覽器的真實 OCR；窄 viewport 驗證可見狀態與操作不破版。執行能力仍以 WebAssembly／Web Worker feature detection 為準，不以 viewport 猜測。

Out of scope：

- JPG／JPEG／PNG／DWG 內容 OCR、DWG 原生解析、SolidWorks 檔案 OCR。
- 手寫文字、尺寸／公差／GD&T／焊接符號或工程幾何的自動語意正式化。
- 把全文 OCR 做成搜尋索引、產生含 OCR layer 的新 PDF、保存每個 word box 或頁面 bitmap。
- 外部付費 OCR API、使用者 API Key、獨立 OCR 主機、Cloud Run Job、逐頁續傳或關頁後背景執行。
- production migration、deploy、traffic、正式檔案 gold set 或 release artifact。

### 0.4 Source Admission And Adapter Plan

| Source extension | Required adapter plan | Content behavior |
|---|---|---|
| `.sldprt`／`.sldasm`／`.slddrw` | `filename.v1` + `native-metadata-bridge.v1` | 只讀檔名與 Document Manager metadata；不 OCR |
| `.pdf` | `filename.v1` + `browser-pdf-ocr.v1` | PDF 文字層；掃描頁才 OCR |
| `.jpg`／`.jpeg`／`.png`／`.dwg`／其他 | `filename.v1` | 只讀檔名／角色；不 OCR／不 native parse |

Server 建立 source 時即固定 plan；client 不得自行把非 PDF source 改送 OCR。`browser-pdf-ocr.v1` 必須同時驗證 canonical source extension、MIME、PDF magic bytes、session/company 與 content hash。副檔名／MIME／magic 不一致時回 terminal `failed/pdf_source_invalid`，不得嘗試影像 fallback。

### 0.5 Browser Pipeline

```text
worker 完成 filename/native adapters
  -> session projection 發現 PDF planned adapter 尚無 terminal result
  -> owner/reviewer browser 以既有 actor/company permission 取得受控 PDF bytes
  -> PDF.js 對每頁讀 getTextContent()
       -> 文字層達門檻：直接解析
       -> 文字層不足：依 rotation 渲染 bounded Canvas，再交 Tesseract.js Web Worker
  -> 全文只在記憶體內正規化、找 label/value、去重、排序
  -> 一次 POST bounded adapter result
  -> server transaction 驗證並附加 observation/candidate
  -> row version／count／projection 更新，進入人工核對
```

文字層是否足夠由 deterministic rule 判斷，不用 LLM：每頁正規化後至少 24 個可列印字元且至少一個已知欄位 label，或整份 PDF 至少 80 個可列印字元；未達門檻的頁才 OCR。RD 可在實檔 gold set 後調整數值，但不得把「任何字元存在」視為文字層可用。

Raster guard：單頁最大 12MP、concurrency 1、單頁 60 秒、整份 PDF 10 分鐘、OCR 頁數上限 20。每頁結束立即釋放 Canvas；超限回 `partial` 或 `timeout`，檔名及其他 adapter 證據維持可用。

### 0.6 Necessary-First Capacity And Utility Policy

#### Tier 0 — 必要辨識

| Stable field key | 初始 aliases（大小寫／全半形／標點正規化後比對） | Required outcome |
|---|---|---|
| `drawing_number` | 圖號、圖面編號、DRAWING NO、DWG NO | `found/conflict/not_found` |
| `revision` | 版次、版本、REV、REVISION | `found/conflict/not_found` |
| `part_number` | 料號、零件號、PART NO、ITEM NO | `found/conflict/not_found` |
| `title` | 品名、圖名、名稱、TITLE、DESCRIPTION | `found/conflict/not_found` |
| `material` | 材質、材料、MATERIAL | `found/conflict/not_found` |
| `scale` | 比例、SCALE | `found/conflict/not_found` |
| `drawn_by` | 製圖者、繪圖者、DRAWN BY、DRAWER | `found/conflict/not_found` |

Rules：

- 排序前先完成整份 PDF 的可用文字擷取；不得在先讀到 50 筆文字時提前停止。
- 每個 Tier 0 欄位保留每個 distinct normalized value 的最佳證據，單欄最多 5 個 distinct values；七欄最多占 35 筆，確保至少 15 筆可供次要欄位使用。
- 同值多次出現時保留最高 evidence-quality observation，並以 source/page/geometry/corroboration metadata 表達其他命中，不重複占用容量。
- 超過 5 個衝突值時，adapter 回 `partial/required_field_conflict_overflow:<fieldKey>`，該欄位保持 blocked，不能因只保存前五個值而自動接受。
- 找不到值時輸出 bounded diagnostic `required_field_not_found:<fieldKey>`，不得建立空白、猜測或沿用正式值的 OCR observation。

#### Tier 1／2／3 — 剩餘容量

| Tier | Initial fields | Policy |
|---|---|---|
| Tier 1 | `unit`、`drawing_date`、`sheet_number`、`surface_finish`、`heat_treatment`、`hardness`、`coating_or_color`、`weight`、`general_tolerance` | Tier 0 選取完後依效用分數收錄 |
| Tier 2 | `standard_or_spec`、`process_requirement`、`inspection_requirement`、`general_note`、`supplier_or_customer_reference` | Tier 1 後依效用分數收錄 |
| Tier 3 | 尚未歸類但含工程關鍵字的 bounded text block | 最多 10 筆，且必須超過最低品質門檻 |

欄位／alias／tier／business weight／max distinct values 放在 versioned `config/drawing-ocr-field-priorities.json`，不是散落在 UI 或 OCR worker 內。設定檔 schema 需 fail closed：重複 stable key、Tier 0 遺漏、非法 weight／alias 或超過 quota 時 build/QC 失敗。

Selection algorithm：

1. normalize text／label／value，移除空白與純框線噪音。
2. 建立 potential observations，依 stable field + normalized value + scope 去重。
3. 無條件先選 Tier 0，套用每欄最多 5 distinct values。
4. 對剩餘候選計算 deterministic utility score：

   ```text
   utility = tierWeight
           + businessWeight
           + labelMatchQuality
           + OCR/TextLayerConfidence
           + titleBlockOrTableLocationBonus
           + crossOccurrenceCorroboration
           - duplicatePenalty
           - noisePenalty
   ```

5. Tier 1、Tier 2、Tier 3 依 utility 降冪選入；同分以 page number、reading order、stable field key 固定排序。
6. 每 PDF 最多 50 筆、每 session 最多 100 筆 `browser-pdf-ocr.v1` observations。Tier 0 先選；低 tier 不得反向淘汰 Tier 0。
7. diagnostics 只記 `selected/discarded/not_found/conflict_overflow` counts 與 stable keys，不記被淘汰的客戶原文。

### 0.7 Client Result API And Transaction Contract

新增 user routes：

- `GET /api/numbering/recognition-sessions/:sessionId/sources/:sourceId/content`：沿用 recognition review permission、company/source membership 與 source hash；只回 eligible PDF，`private, no-store`。若 owner workspace 已取得同一 PDF bytes，client 必須共用同一 `ArrayBuffer`，不得為預覽與 OCR 重複下載。
- `POST /api/numbering/recognition-sessions/:sessionId/client-adapter-results`：一次提交一個 PDF source 的 terminal adapter result，不接受逐頁 POST。

Request contract：

```json
{
  "expectedRowVersion": 1,
  "sourceId": "recognition-source-*",
  "contentHash": "sha256",
  "adapterCode": "browser-pdf-ocr.v1",
  "adapterVersion": "pdfjs-<version>+tesseractjs-<version>+policy-<version>",
  "status": "succeeded|partial|unsupported|failed|timeout",
  "observations": [],
  "diagnostics": []
}
```

Boundary：

- Body 上限 512 KiB；每 source 最多 50 observations；server 在同一 transaction 再檢查 session 累計最多 100 browser OCR observations。
- Request 不得包含 PDF bytes、Base64、Canvas、page bitmap、完整 word array、WASM path、local absolute path、API key 或 secret。
- Server 鎖定 session，驗證 actor permission/company、source membership、PDF admission、content hash、adapter plan、session nonterminal 及 `expectedRowVersion`。
- `drawing_recognition_adapter_results` 既有 unique `(session_id,source_id,adapter_code)` 是 idempotency authority。相同 source/adapter 重送回既有 projection；需要新辨識內容時必須建立 successor rerun session，不覆寫 append-only evidence。
- Repository 新增 client-result append transaction，復用既有 observation validation、candidate grouping、current formal comparison、counts 與 row-version 更新；不得建立第二套 mapper。
- Session projection 新增 derived `pendingClientAdapters[]`；不新增 DB status。Recognition `formalize` 在 planned client adapter 尚未產生 terminal result 時 fail closed，但這個 gate只限制 recognition 正式寫入，不得阻擋 Drawing 版次儲存或送審。
- Browser 不支援 WebAssembly／Worker、PDF 加密／損壞或超限時，client 必須提交 terminal `unsupported/failed/timeout` result；session 可呈現 partial 並由人類決定是否核對其他來源，不得永久停在「等待 worker」。

### 0.8 UI、Failure And Recovery Contract

- 使用者開啟智慧辨識頁且 worker baseline 已完成後，自動處理 planned PDF；不顯示 OCR API Key 或要求安裝。
- 可見階段固定為：`準備 PDF`、`讀取文字層`、`辨識第 n/N 頁`、`整理必要欄位`、`提交候選`、terminal result。
- 執行期間顯示「請保持此頁面開啟」；關閉分頁不建立 server heartbeat 或假背景工作。重新開啟時，若 adapter result 仍缺失就安全重跑。
- Model／WASM 下載失敗、CSP／Worker／memory 問題、PDF password、頁數／像素／時間超限及 result 409/413 必須有使用者可理解訊息與重試入口；不得無限 spinner。
- Tier 0 每欄顯示 `已找到／值衝突／未找到`。`not_found` 是辨識覆蓋狀態，不建立空候選，也不清除正式值。
- lower-tier 候選沿用既有快速接受／修正／定位；source file role 仍不進人工待核對數。

### 0.9 Security、Cost And Dependency Contract

- `pdfjs-dist`、`tesseract.js`、WASM worker、`chi_tra`／`eng` traineddata 必須 pin version、納入 package lock、SBOM/license QC，並從同源 versioned static path 提供；官方基線為 PDF.js 與 Tesseract.js Apache-2.0。語言模型授權需在 dependency evidence 一併驗證。
- Static assets 使用 content-hashed/versioned filename 與 `Cache-Control: public, max-age=31536000, immutable`；不得從任意 CDN 執行程式或模型。
- OCR CPU/RAM 全在瀏覽器；Cloud Run 只提供既有 PDF bytes 與一次短結果 POST。不得新增 always-on instance、OCR queue、server OCR process 或 user API key。
- PDF bytes 只經既有 same-origin authenticated boundary；client adapter 不向第三方網域發送 PDF、OCR text 或模型輸入。QA 必須以 network allowlist 實證。
- 每份 PDF 的 server 增量成本邊界是一次必要 source read、一次 result write 與最多 50 observations；超過此邊界即停止並回 Dev PM，不以「準確率」為由無限制持久化 OCR token。

### 0.10 Repository/File Impact And RD Slices

Expected modified/new files：

- `package.json`、`package-lock.json`：加入 pinned `pdfjs-dist`、`tesseract.js` 與必要 browser assets。
- `config/drawing-ocr-field-priorities.json`：versioned tier／alias／utility policy。
- `src/lib/browser-pdf-ocr.ts`：browser-only PDF text/raster/OCR runner；不得被 server bundle 執行。
- `src/lib/drawing-ocr-priority-policy.ts`：pure deterministic normalize/rank/select contract。
- `src/lib/drawing-recognition-contract.ts`、`src/lib/drawing-recognition.ts`、`src/lib/repositories/drawing-recognition-async-repository.ts`：pending client adapter projection、append transaction、limits、formalize gate。
- `src/app/api/numbering/recognition-sessions/[sessionId]/sources/[sourceId]/content/route.ts`：actor-authorized PDF bytes。
- `src/app/api/numbering/recognition-sessions/[sessionId]/client-adapter-results/route.ts`：single-result completion。
- `src/components/drawing-recognition-workspace-panel.tsx`、`src/components/drawing-recognition-review.tsx`：browser execution、progress、required-field coverage、retry／terminal states。
- `scripts/run-drawing-recognition-worker.mjs`、`src/lib/repositories/drawing-recognition-async-repository.ts`：從 non-PDF 與 worker OCR plan 移除 `external-json-ocr.v1`，只對 PDF plan `browser-pdf-ocr.v1`。
- `scripts/qc-dev-082-contract.mjs`、`scripts/qc-dev-082-browser.mjs`、`scripts/qc-dev-082-gate.mjs` 與 `package.json` scripts：focused contract、真實 browser OCR、cost/security/visible-error gate。

RD sequence：

| Slice | Scope | Gate |
|---|---|---|
| 082-A | source policy、priority config/schema、pure ranking tests | 非 PDF OCR=0；Tier 0 永不被低 tier 擠出；50/100 limits deterministic |
| 082-B | PDF.js text layer、Canvas/Tesseract worker、same-origin assets/cache | text PDF 不啟動 OCR；scanned PDF `chi_tra+eng`；無第三方 request |
| 082-C | actor source route、single result API、append transaction、pending/formalize gate | permission/company/hash/rowVersion/idempotency/race/append-only PASS；無 migration |
| 082-D | owner/review UI progress、coverage、retry、terminal handling | 真實 Chromium、三 viewport visible-error／overflow／console/network gate PASS |
| 082-E | production-safe PDF gold set、regression、cost envelope | Tier 0 field outcomes、lower-tier fill、request/write counts、DEV-035/068/079 regressions PASS；不得假設既有 A0002-M01 已有合法 PDF fixture |

### 0.11 Acceptance、Evidence And Stop Conditions

DEV-082 local completion requires：

1. PDF text-native 與 scanned gold files 都走到 terminal adapter result；非 PDF sources 的 OCR invocation count 為 0。
2. 每份 PDF 七個 Tier 0 field 都有 deterministic `found/conflict/not_found` coverage；低 tier 不可在 cap 壓力下取代 Tier 0。
3. 在 50 筆 cap 下，Tier 0 先選，剩餘 slots 依 utility 填入；同輸入重跑的 observation order、stable keys、values 與 diagnostics 相同。
4. No word-level persistence、no raw PDF/result upload、no third-party network、no API key／external command／OCR host。
5. 每 PDF 至多一個 source GET 與一個 completion POST；DB 至多一個 adapter result、50 observations及其必要 candidate links。
6. Cross-company／wrong actor／wrong MIME／wrong magic／stale hash／stale rowVersion／duplicate result 全部 fail closed 或 idempotent，無 evidence leak／partial write。
7. Tab close後沒有假背景狀態；重開可重跑，PDF failure仍保留 filename/native 證據且不阻擋 Drawing 送審。
8. `qc:dev-082:*`、affected DEV-068／035／079 regression、typecheck、affected lint、isolated build及 `git diff --check` 通過；真實 browser 證據包含 desktop/tablet/mobile layout、console、network、visible errors 與 DB/API readback。

目前完成判定（2026-08-21）：以上 1～8 已由 `OCR-082-001..044` fresh local executable evidence、DEV-035／DEV-068／DEV-079 affected regression與`qc:dev-082:gate`通過；矩陣覆蓋跨來源 canonical revision、normalized geometry、evidence priority、truthful fallback、identity-only formalization、legacy append-only compatibility、A0002 單一 preview surface與高解析完整文字取景。DEV-082 與父 DEV-068 已達本機 RD/QA/QC complete；production accuracy、正式檔案存取、migration、deploy與release仍維持獨立 gate。

Stop and return to Dev PM if：

- 無法在不新增 OCR server／paid API／user key 的前提完成 PDF OCR；
- 需要把 JPG／PNG／DWG 納入內容辨識，或自動正式化尺寸、公差、GD&T／幾何；
- 必須新增 OCR checkpoint schema、per-page server write、always-on compute、production resource、remote migration 或外部費用；
- Tier 0 在 50 筆 cap 內仍可能被低 tier 淘汰，或必須保存完整 word tokens 才能運作；
- client result 不能與 formalization race 安全隔離、不能驗證 canonical content hash，或需繞過既有 company/permission authority。

Future Phase Captured / Not Requested：只有在實測 P95 OCR 超過 3 分鐘、平均 OCR 頁數超過 10，或未完成／中斷率超過 5% 時，才重新評估逐頁 checkpoint；只有產品要求關閉瀏覽器後仍執行時，才另評估 managed background OCR 與其費用、監控及 release contract。

### 0.12 DEV-082 Reopen Amendment — 跨來源版次整合與證據定位

#### 0.12.1 Confirmed Defect And Root Cause

2026-08-20 對本機 A0002 最新 recognition session 的 read-only 查核確認：

| UI 顯示 | Stored field/category | Source/evidence | Value | Geometry |
|---|---|---|---|---|
| 版次 | `source_revision / identity_relation` | `A0002.SLDPRT` / `cad_property` | `0.1` | null |
| 版次 | `revision / drawing_revision` | `A0002-M01.pdf` / `pdf_title_block` page 1 | `0.1` | raw PDF points |

已確認根因：

1. SOLIDWORKS alias 使用 `source_revision`，PDF policy 使用 `revision`，且 category 不同；repository 的 `group_key` 包含 category／field key，所以相同值也不合併。
2. 兩個 candidate 的可見 label 都是「版次」，DEV-079 density layout 又移除分類標題與來源輔助文字，因此使用者看不到兩者的語意差異。
3. workspace focus 固定使用 `candidate.observations[0]`，CAD observation 通常早於 browser PDF observation；有可定位 PDF evidence 時仍可能選到 nonspatial evidence。
4. PDF.js text layer 儲存 PDF points、Tesseract 儲存 Canvas pixels；consumer 只接受 0..1 或 0..100，且 observation 未帶完整 page width／height／origin／rotation contract。
5. consumer 只用「geometry 能否解析」判斷來源，任何缺失或舊格式 PDF geometry 都被誤稱為「僅存在檔案屬性」。
6. OCR `revision` 被分類為 `drawing_revision`，但正式化 allowlist 不允許 revision metadata；它應是 identity evidence-only，否則接受後可能成為 formalization blocker 或 422。
7. DEV-079 browser gate 只要求「property flash 或 evidence box 任一成立」，沒有指定聚焦 PDF 版次必須得到 PDF 定位框，因此錯誤路徑也能 PASS。

Spec Impact Preflight：`Compatible correction`。保留 append-only observation/candidate ledger、decision API、company/permission、PDF-only OCR、human review、formalization authority與零 OCR server架構；修正 canonical field semantics、derived projection、geometry contract與 UI truthfulness，不新增資料權威或 schema。

#### 0.12.2 Canonical Field And Review-group Contract

- Canonical recognition semantic key 固定為 `revision`；`source_revision` 只作 legacy input alias，不再作新的 candidate stable key。
- SOLIDWORKS「版次／版本／revision」與 PDF Tier 0 `revision` 均分類為 `identity_relation`、owner type `drawing_revision`、write policy `evidence_only`。
- 新 observation 在計算 `group_key` 前套用同一個 server-side canonicalizer；不得只在 UI 改 label。
- 同一 owner／scope／semantic key／normalized value 的 CAD 與 PDF observations 必須連到同一 candidate，形成 corroborated evidence。
- 同一 semantic key 有多個 normalized values 時，projection 形成一個 conflict review group，列出每個值、來源檔、location kind與 confidence；不得依來源順序或 confidence 靜默選 winner。
- 舊 session 的 `source_revision` rows 維持 append-only，不做資料回填或 migration。Projection 以 `semanticFieldKey=revision` 相容分組；需要新 normalized geometry 時建立 successor rerun session。
- Review group 至少回傳 `semanticFieldKey`、`fieldLabel`、`memberCandidateIds[]`、`distinctValues[]`、`observations[]`、`conflictState` 與 deterministic `primaryCandidateId`。排序不可依 fetch timing。
- 同一次辨識工作區以 canonical `fieldKey` 作唯一可見欄位鍵；`category`、owner type／ID、來源類型、正式值來源、sheet、page、configuration 與 applicability scope 都只能成為該欄位下的 review group／observation metadata，不得再產生第二張同 `fieldKey` 欄位卡。Legacy `surface_treatment` 必須在 ingestion 與舊 session projection 時 canonicalize 為 `surface_finish`；沒有 canonical `fieldKey` 的未歸類資料才可用 category＋label fallback 分組。
- `drawn_by`／`drawn_by_name`／「製圖」／「製圖者」統一為 `drawn_by_name`；`sw_custom_2d圖號_用途_*` 與 `sw_custom_圖號_*` 統一為 evidence-only `drawing_number`。畫面各只顯示一個「製圖者」與「圖號」，所有原始 observations 仍保留在該 canonical field 下。
- SOLIDWORKS `SWFormatSize` 統一投影為 `paper_size`／「圖紙尺寸」；ISO A 系列標準毫米尺寸允許正反向與 `*`、`x`、`×` 分隔，`210 × 297 mm` 必須顯示為 `A4`，原始尺寸字串仍只保存在 observation evidence。
- UI 以 review group 為一個可見欄位；同值只顯示一次「版次 0.1」，來源控制只顯示 `檔案屬性`／`PDF圖面`，不在按鈕內重複顯示檔名、頁碼、組態、座標或其他定位 metadata，也不另顯示重複的適用範圍與來源證據小標。異值顯示一張衝突卡，由人類選值或修正。
- PDF evidence 聚焦仍保留高亮與放大鏡，但不再顯示「辨識證據／日期／檔名／頁碼」覆蓋說明，避免遮住圖面內容。
- 批次儲存仍展開成既有 candidate decisions 並在同一 row-version command 提交；原 observations、來源差異及決策前值不得遺失。
- `drawing_number` 與 `revision` 永遠是 `identity_relation` evidence-only。Impact 必須排除，不得寫入 `pdm_drawing_revision_metadata_values`、建立動態欄位或改變 DrawingRevision identity。

#### 0.12.3 Normalized Page Geometry Contract

新 PDF observations 的 geometry 固定為：

```json
{
  "coordinateSpace": "normalized_page",
  "origin": "top_left",
  "x": 0.0,
  "y": 0.0,
  "width": 0.0,
  "height": 0.0,
  "pageWidth": 841.89,
  "pageHeight": 595.28,
  "pageRotation": 0,
  "producerSpace": "pdf_points|ocr_pixels"
}
```

Rules：

- `x/y/width/height` 必須為有限值並落在 0..1；`width/height > 0`，框不得超出頁面。Invalid geometry 不得冒充可定位 evidence。
- PDF.js text items 必須在 producer 端使用實際 viewport transform 轉為 top-left normalized page space；不得把 bottom-left PDF points直接交給 UI。
- Tesseract boxes 必須以該頁實際 Canvas width／height正規化為同一 top-left space；不得只傳 canvas height。
- rotation/crop 已由 producer 納入 transform；consumer 只使用 normalized contract，不自行猜測 PDF points、pixels或百分比。
- `pageWidth/pageHeight/producerSpace` 是診斷證據，不是 consumer 的第二套換算 authority。
- 舊 geometry 無法可靠換算時標記 `legacy_unlocatable`，不得改寫舊 row；successor rerun 可產生新座標。
- Consumer 必須把 normalized geometry 套在「實際渲染 PDF 紙張」的 bounding box；不得套在包含瀏覽器 PDF toolbar、thumbnail sidebar、scrollbar 或頁面留白的 iframe／viewer frame。Evidence mode 必須取得可量測、same-origin 的 page element；若無法取得實際紙張座標面，應停止顯示 evidence treatment 並回 truthful unlocatable／load-failed 狀態，不得近似猜測。

#### 0.12.4 Evidence Selection And UI Truthfulness

Human-confirmed UX clarification（2026-08-20）：證據定位重用既有左側單一預覽面，不新增 PDF 頁籤、第三種 preview kind、獨立 PDF route 或額外檔案／版次。

預設證據選擇順序：

1. 使用者明確選取的來源；
2. 與目前 2D preview source/page相符且有合法 normalized geometry 的 observation；
3. 其他有合法 normalized geometry 的 PDF／OCR observation；
4. nonspatial CAD/file evidence。

行為契約：

- 不得再固定取 `observations[0]`。
- 聚焦「版次」且 PDF evidence 可定位時，左側必須切至 2D、顯示黃色螢光標記／局部放大鏡與 `A0002-M01.pdf · 第 1 頁`來源 caption。
- `3D 模型／2D 圖面`仍是唯一 preview navigation；不得因 evidence source 是 PDF 而新增「PDF」tab、並排第二個 PDF viewer 或新的 revision/file card。
- 左側既有 2D preview 是唯一 evidence surface：若 evidence 與目前 source/page 相同，只更新黃色螢光標記、局部放大鏡與 caption；若來源檔或頁碼不同，則在同一 surface 暫時切換至該 PDF/page，再疊加相同 evidence treatment。
- Spatial evidence 的可見標示固定為無外框、半透明黃色螢光標記，並在同一 actual PDF page element 內顯示局部放大鏡。舊版「直接裁切已縮放預覽 canvas、固定 3×」契約由 §0.13 `Intentional replacement` 取代；現行放大內容必須重用同一已載入 `PDFPageProxy` 做高解析局部重繪，不得重新抓檔、建立第二 viewer 或使用另一套座標換算。放大鏡自動選擇不遮住標記的位置、完整留在 preview viewport，desktop／tablet／mobile 都必須可讀。黃色不是唯一證據訊號，既有 caption 仍顯示辨識值、檔名與頁碼。
- 首次進入 evidence mode 時保存單一 `preEvidencePreviewState = { activePreviewKind, sourceId, pageNumber }`；後續切換 PDF／CAD evidence 不得覆寫這份快照。使用者按「返回原圖面」、清除候選焦點或離開 evidence mode 時，恢復原 preview kind、source 與 page。
- 多頁 PDF 只把同一 viewer 導向 observation 的 `pageNumber`，不複製、不插入也不產生新的 PDF 頁面；caption 必須持續顯示實際檔名與 `第 N 頁`。
- 使用瀏覽器原生 PDF viewer 顯示一般圖面時，內嵌預覽 URL 必須設定 `navpanes=0` 與 `toolbar=0`，讓左側縮圖／分頁欄及上方工具列預設隱藏；另開來源連結保留完整 viewer 工具列與 `pageNumber` 定位。此規則只降低頁內預覽雜訊，不改 PDF source、page、evidence geometry 或下載權限。
- 暫時來源／頁碼切換是 client preview state，不得建立附件、derived file、candidate revision、recognition source或瀏覽器 route/history entry，也不得影響未儲存的右欄核對資料。
- 多來源時來源 badge／control 可切換 PDF 與 SOLIDWORKS evidence；切到 CAD property 顯示「版次 0.1 已辨識；來源：A0002.SLDPRT 檔案屬性，無圖面座標」。
- 切到 nonspatial CAD evidence 時不得把現有 PDF 畫面冒充 CAD 定位結果；保留原 preview 或恢復 `preEvidencePreviewState`，只顯示來源明確的無座標訊息。
- PDF observation 缺合法 geometry 時顯示「版次 0.1 已辨識；來源：A0002-M01.pdf 第 1 頁，但此證據沒有可用定位座標」。不得宣稱它是檔案屬性，也不得把「已辨識」改成「未找到」。
- evidence PDF/page 載入失敗時，保留目前可用 preview，移除過期螢光標記／放大鏡並顯示實際來源／頁碼與載入失敗訊息；不得用錯誤頁面的標記、空白 viewer或 CAD-property 文案掩蓋失敗。
- 右側 Tier 0 tile 是該 PDF source 的 coverage；候選欄位是跨來源 review projection。兩者文案必須包含 source context，避免被理解成互相矛盾。
- `found`、`conflict`、`not_found` 與 `locatable` 是不同軸；UI、ARIA與測試不得混用。

#### 0.12.5 Repository And File Impact

Expected affected files：

- `config/solidworks-metadata-field-aliases.json`、`config/drawing-ocr-field-priorities.json`：revision stable key/category 對齊。
- `src/lib/solidworks-metadata-mapping.ts`、`src/lib/drawing-ocr-priority-policy.ts`、recognition contract：共享 canonical field semantics及 projection types。
- `src/lib/drawing-pdf-text-layout.ts`、`src/lib/drawing-ocr-spatial-layout.ts`、`src/lib/browser-pdf-ocr.ts`：producer-side normalized geometry。
- `src/lib/repositories/drawing-recognition-async-repository.ts`：ingestion canonicalization、legacy projection grouping、identity evidence formalization exclusion。
- `src/components/drawing-recognition-workspace-panel.tsx`、`src/components/drawing-owner-workspace.tsx`、`src/components/drawing-detail-preview.tsx`、`src/components/pdf-page-viewport.tsx`、必要時 `drawing-recognition-pdf-ocr.tsx`：review group、source-aware evidence selection、same-origin PDF page renderer、page-bound overlay與 truthful messages。
- `scripts/qc-dev-082-*.mjs`、`scripts/qc-dev-079-recognition-layout-browser.mjs`：新增精確 evidence assertions，移除 `flash OR box` 弱 gate。

No schema／migration／new API route／new dependency／new OCR asset／new environment variable。舊 session read compatibility是必要驗收，不以資料修復取代。

RD slices：

| Slice | Scope | Exit gate |
|---|---|---|
| 082-F | canonical revision registry、config/category與 repository grouping／legacy projection | `OCR-082-031..033,036,037` |
| 082-G | normalized geometry producers、evidence resolver、workspace source-aware UI | `OCR-082-034,035,038` |
| 082-H | affected DEV-035／068／079 regressions、typecheck、lint、build與 fresh completion gate | 新舊 OCR matrix全部通過 |

#### 0.12.6 Acceptance And Stop Conditions

DEV-082 重新完成必須同時滿足：

1. A0002 等值 CAD/PDF revision 只顯示一個 review field，保留兩個來源；不同值明確顯示衝突。
2. PDF text-layer與Tesseract evidence均產生合法 normalized top-left geometry；consumer 以實際 PDF 紙張 element 為座標面，黃色螢光標記落在正確 title-block cell且完全位於紙張內，不能以整個瀏覽器 viewer frame 代替紙張；§0.13 高解析局部重繪放大鏡必須完整涵蓋證據文字、含有實際圖面像素且不得遮住標記。
3. 聚焦 revision 預設選可定位 PDF evidence；選 CAD evidence時顯示來源明確的 nonspatial message。
4. 定位全程只使用既有單一 preview surface；同頁只加框、跨來源／跨頁在原 viewer 暫時切換，並可精確恢復進入 evidence mode 前的 preview kind／source／page。DOM、route、network與資料 readback 必須證明沒有新增 PDF tab、第二 viewer、附件、版次或 recognition source。
5. PDF coverage `found` 不得被左側文案呈現為 `not_found` 或 `cad_property`。
6. revision decisions不產生正式 metadata change或 `RECOGNITION_DRAWING_FIELD_INVALID`；identity evidence仍可完成review／impact。
7. legacy session可讀、可核對；需新座標時以 successor rerun恢復，不修改 append-only evidence。
8. `OCR-082-001..044`、affected DEV-035／068／079、typecheck、affected lint、isolated build及 diff check全部通過。

Stop and return to Dev PM if修復需要改寫歷史 evidence、建立新的 canonical revision authority、改 Drawing submit/lifecycle、放寬 tenant/permission、增加 schema/migration、把非 PDF 送 OCR、加入外部付費服務／主機，或觸及 production/staging/deploy/release。

### 0.13 DEV-082 Reopen Amendment — 放大鏡完整取景與高解析局部重繪

狀態：`RD Implemented / Local QA-QC Complete / OCR-082-001..044 PASS / Production Release Gated`

決策來源：2026-08-20 使用者以真實 A0002 圖面回報，局部放大鏡未完整顯示「不鏽鋼SUS304」，且文字因二次放大預覽 canvas 而模糊；使用者要求最佳化並寫入既有開發文件。

Spec Impact Preflight：`Intentional replacement`。本節只取代 §0.12.4 的「固定 3×、裁切已縮放預覽 canvas」放大策略；保留 normalized geometry、同一 2D preview surface、單一 PDF page element、黃色螢光標記、caption、source-aware evidence、PDF-only OCR、candidate／formalization authority、tenant／permission及零 OCR server 架構。ADR 不需要，因為資料權威、API、schema、外部契約與部署拓撲均未改變。

#### 0.13.1 UX Intent And Visual Contract

- 主要任務是讓使用者在不改變目前證據核對流程下，立即看清楚被定位的完整欄位值；成功不是「畫面有放大鏡」，而是完整文字可讀、來源可核對且不遮住原定位。
- 完整內容優先於固定倍率。RD 不得為維持 `3×` 而裁掉文字；`3×` 只作上限，不是固定值。
- Evidence marker 維持無外框、半透明黃色螢光標記；放大鏡只保留一個黃色外框，不得再出現螢光筆外框、綠框、雙環或額外裝飾容器。
- Current Phase 不新增倍率 slider、放大／縮小按鈕、模式切換、第二 viewer、popover、卡片或說明面板。自動取景是唯一預設；辨識值、檔名與頁碼沿用既有 caption／ARIA，顏色不得成為唯一證據訊號。
- 圓形鏡片為預設外觀。若完整欄位在最大允許圓形尺寸下仍無法容納，可降低倍率至 `1×`；Current Phase 不自動切換長條鏡片。是否改為橫向閱讀鏡片屬 future re-entry，只有代表性圖面證明圓形鏡片經自適應後仍大量不可讀才重新評估。

#### 0.13.2 Adaptive Coverage Contract

以 observation 的合法 `normalized_page/top_left` geometry 為唯一取景核心，先轉換成同一 PDF page coordinate，再建立 `targetRect`：

1. 水平兩側各補 `max(region.width * 0.30, page.width * 0.005)`；垂直兩側各補 `max(region.height * 0.50, page.height * 0.005)`，並裁切在實際 PDF page boundary 內。
2. 放大鏡內定義直徑 `78%` 的中央安全內容區；完整 `targetRect` 必須落在此安全區，不能只以文字中心點定位。
3. 鏡片 CSS 尺寸以實際紙張短邊的 `32%` 為基準：desktop clamp `128..200 px`、viewport 寬度 `481..1024` clamp `128..168 px`、`<=480` clamp `120..140 px`；不得超出紙張或 viewport。
4. `fitZoom = min(safeWidth / targetCssWidth, safeHeight / targetCssHeight)`；實際倍率為 `min(3, fitZoom)`。若 `fitZoom < 1`，先使用該 viewport 最大鏡片，再以完整內容為優先降至 `1×`，不得裁切證據框來維持放大感。
5. Crop 必須在頁面邊緣重新置中並 clamp；clamp 後仍要重新驗證 `targetRect` 全部位於 crop 與圓形安全內容區內。
6. OCR／PDF bbox 過窄時使用上述安全 padding；不得依字串長度、字型估算或猜測另一套座標。Invalid／legacy geometry 沿用 §0.12 truthful unlocatable 行為，不顯示猜測位置。

#### 0.13.3 High-resolution Local Render Contract

- 放大鏡不得再以 `drawImage(mainPreviewCanvas, ...)` 作正常路徑。它必須重用目前已載入的 `PDFDocumentProxy/PDFPageProxy`、頁碼與同一 normalized geometry，在離屏 canvas 直接執行一次 clipped PDF.js render。
- 不得為放大鏡重新請求 PDF bytes；不得建立 iframe、第二 viewer、第二 route或持久化衍生圖。文件已載入後，切換 evidence 不應增加 content GET。
- Magnifier backing store 比例固定為 `min(3, max(2.5, window.devicePixelRatio))`，並直接以目標輸出解析度渲染 PDF crop；CSS 只縮至鏡片顯示尺寸，不再放大低解析 bitmap。
- 每次只渲染 `targetRect` 所需的 bounded crop，不得為放大鏡建立整頁 4× canvas。單一 backing canvas 任一邊不得超過 `1024 px`、估計 RGBA 記憶體不得超過 `4 MiB`。
- Cache key 至少包含 `sourceId/pageNumber/targetRect/outputScale`，採最多四筆 LRU；切頁、換檔、geometry 改變或 component unmount 時取消 stale render task並釋放不再使用的 canvas。
- 直接 PDF render 保留 PDF.js 正常反鋸齒。只有高解析 render 失敗時，才可暫用既有 preview canvas 作 degraded fallback；fallback 必須以 `resolutionMode=fallback` 可診斷、清除過期影像，且不算 `OCR-082-040/044` 通過。不得以影像銳化或生成不存在的筆畫改變證據內容。
- High-resolution crop 失敗時，不新增錯誤卡；在既有 caption 顯示短句「局部放大載入失敗」，保留螢光標記與來源資訊，下一次切換 evidence 可重試。

#### 0.13.4 Repository And File Impact

Current Phase 預期只修改：

- `src/components/pdf-page-viewport.tsx`：自適應 `targetRect`、動態倍率、同 page proxy 高解析 crop render、bounded cache／cancel／cleanup、diagnostic data attributes。
- `src/app/globals.css`：單一黃色鏡框、鏡片尺寸與 responsive 約束；不得恢復螢光筆外框或綠色第二環。
- `scripts/qc-dev-079-recognition-layout-browser.mjs`：三 viewport 真實畫面、完整取景、單黃框、page-bound／overlap／network／console assertions。
- `scripts/qc-dev-082-contract.mjs`、`scripts/qc-dev-082-regression.mjs`、`scripts/qc-dev-082-gate.mjs`：`OCR-082-039..044`、current-source render mode、backing ratio、cache／cleanup與完成矩陣。

不修改 recognition API、DB／schema／migration、OCR field policy、permission、candidate／formalization、附件或 lifecycle；不新增 dependency、environment variable、OCR key、worker、server compute或第三方流量。

#### 0.13.5 Performance, Failure And Evidence Contract

- PDF page 已 ready 後，單次 magnifier crop render 的 reference-device P95 目標為 `<=150 ms`；同 key cache hit 目標 `<=16 ms`。超標需附 profile 再回 RD 調整，不得改用 server render。
- Evidence 切換與 resize 使用 debounce／latest-task-wins；舊 render 完成後不得覆蓋新 focus，連續切換後只保留最後一個 magnifier。
- 診斷 attributes 至少揭露 `resolutionMode=pdf_high_res_crop|fallback`、`coverageRatio`、`effectiveZoom`、`backingScale`、`cropRect` 與 `renderState`，只供測試／診斷，不在產品 UI 顯示工程詞。
- `coverageRatio` 必須為 `1`，表示 padded `targetRect` 全部落在 crop 安全內容區；只看到非白像素或中心點不再足以通過。
- Scanned PDF 的來源像素若本身不足，系統不得宣稱已提高來源解析度；仍需以可取得的最高原始頁面解析度渲染並保留 truthful evidence。QC 以「不二次放大預覽 canvas、全文未裁切、正常閱讀距離可辨識」判定，不以人工銳化掩蓋來源品質。

#### 0.13.6 Acceptance And Stop Conditions

1. 真實 A0002 材質 evidence 聚焦後，「不鏽鋼SUS304」全文與安全留白在放大鏡內可見，不得顯示成「不鏽鋼SUS…」或裁掉右側字元。
2. 放大鏡正常路徑為 `pdf_high_res_crop`、backing scale `>=2.5`、`coverageRatio=1`，且不呼叫 `drawImage(mainPreviewCanvas, ...)` 進行二次放大。
3. 桌面 `1440x900`、laptop `1024x768`、mobile `390x844` 均只有一個黃色鏡框；螢光標記無外框，無綠環、雙環、裁切、overflow或非預期捲動。
4. 每個 viewport 的 magnifier 與 marker 都完全位於實際 PDF paper element 內、互不遮擋；長文字、頁面邊緣與快速切換 evidence 均保持完整取景。
5. 在瀏覽器 100% 顯示比例下，人工 QC 可直接辨識完整材質文字，並以截圖證明；DOM／canvas evidence 同時證明 backing ratio 與高解析來源，不能只靠目視宣稱清晰。
6. 文件載入後切換 evidence 不增加 PDF content GET；無 OCR server、API key、第三方文件流量或新增 server compute。Cache／canvas符合上限且 unmount 後可釋放。
7. High-resolution render failure 顯示既有 caption 內的短恢復訊息，不留下舊 crop、不遮住來源資訊；fallback 不能被 completion gate 當作清晰度 PASS。
8. `OCR-082-001..044`、DEV-079 recognition-layout三 viewport、typecheck、affected lint、isolated build及 diff check全部通過，才可將 DEV-082 與父 DEV-068 恢復為 Local RD/QC complete。

Current implementation evidence（2026-08-21）：`OCR-082-039..044` 已由 isolated A0002 successor fixture 的 Chromium 1440／1024／390 matrix 全部 PASS；同一 loaded `PDFPageProxy` direct crop、coverage `1`、backing scale `2.5`、完整 `不鏽鋼SUS304`、單一黃色鏡框與 borderless highlighter 均已留存。`typecheck:app`、affected ESLint、`build:isolated`、`qc:dev-079:contract`、`qc:dev-079:layout-browser`、`qc:dev-079:recognition-layout-browser`、`qc:dev-082:contract`、`qc:dev-082:repository`、`qc:dev-082:regression`與`qc:dev-082:gate` PASS；gate evidence為 `output/qa/dev-082-browser-pdf-ocr/gate-20260820163042-local-isolated/`（44/44）。canonical `revision` 已取代 fixture 舊 `source_revision`，generic layout runner已改用隔離 A0002 fixture並保留版面斷言。production representative accuracy、正式檔案存取、migration、deploy與release仍各自 gated。

Stop and return to Dev PM if實作需要改變 normalized geometry authority、建立第二 PDF viewer／route、增加 schema／API／dependency／server render、把文件送第三方、超出既有 tenant／permission，或觸及 production/staging/deploy/release。

## 1. Human Decision Brief

Source: 2026-08-12 user discussion, table review and UI review.

Confirmed product decisions:

1. SolidWorks 3D custom property 是辨識來源之一，不是圖面上傳成功的必要條件，也不是無條件最高權威。
2. OCR、圖面文字、CAD metadata、檔名與既有 PDM 值都先進候選層；人工確認前不得覆寫正式資料。
3. OCR 是來源，不是資料分類。所有辨識結果放在同一個 `圖面辨識審核` 分頁，以連續分區完成一次核對；區段導覽只負責定位，不得以互斥頁籤隱藏其他結果。
4. `物料屬性` 與 `製程與外觀` 合併為 `料號屬性候選`。材料、規格、原料型態、厚度、表面處理、電鍍、塗裝、顏色、熱處理、硬度及整體粗糙度使用同一套基準／變體判斷。
5. 單圖多料號時，辨識工作區先顯示共用料號基準，再顯示每個料號相對基準的差異；正式權威仍是每個料號經人工確認後的完整有效屬性。
6. 變體差異只使用 `相同／變更／新增／明確不適用`。未辨識到值不得推定為取消；只有明確的 `無／取消／N/A／不適用` 證據可提出不適用。
7. 整體屬性與特定加工面的局部工程要求必須依適用範圍分流；局部粗糙度、尺寸、公差、GD&T 等第一版只作證據，不直接覆蓋料號基準。
8. 欄位候選不受預先白名單限制。未知原文必須保留，使用者可映射既有欄位、建立自訂欄位、改掛對象或忽略。
9. A0005 完整 3D＋2D 是第一個端到端 pilot；P01／P02／P03 等變體需要各別辨識與人工修正。
10. 正式寫入前保留輕量影響確認 gate，但不建立獨立預覽頁或第二套審核功能。確認視窗只列實際異動、衝突、寫入範圍與不寫入項目。
11. 審核頁主動作為 `確認寫入內容`；確認視窗使用 `返回核對` 與 `正式寫入 PDM`。只有後者可異動正式資料。
12. 送審前的候選版次檔案上傳完成後，系統即以目前未移除的受控檔案自動建立或重用辨識工作；正常流程不顯示獨立「開始辨識」按鈕。使用者進入工作區時，若已有可辨識檔案但沒有相同來源集合的工作，頁面必須自動補建並輪詢結果。此階段只建立候選工作，不建立正式版次、不建立送審，也不寫入 PDM；重複上傳、重新進頁或重繪不得產生相同來源集合的重複工作。

Rejected behavior:

- 因 3D custom property 缺值就拒絕上傳、辨識或人工審核。
- 將 OCR 結果直接當作正式資料，或以固定來源優先序靜默覆蓋其他來源。
- 為 OCR、CAD、圖框或檔名各開一個互斥審核頁籤。
- 將材料、表面處理、顏色分散在彼此競爭的正式模型。
- 將共用基準另建成與料號主資料競爭的正式權威。
- 把未辨識值解讀成移除既有值。
- 動態為每個 OCR 欄名新增資料庫 column。
- 讓辨識流程建立新圖號／料號、改變版次生命週期、核准、發布或改寫原始 SolidWorks 檔。
- 以另一張完整預覽頁重複人類已完成的審核工作。
- 把正常辨識啟動責任交給使用者，要求每次上傳後再按一次「開始辨識」。

## 2. Problem And Outcome

目前的正式資料若過度依賴 3D custom property，會把「來源是否完整」誤當成「PDM 是否可管理」。真實圖面資料可能同時存在於 3D configuration、2D 圖框、一般註記、表格、PDF／影像 OCR 與檔名，且同一張圖可能對應多個料號與不同例外。

Current Phase outcome:

```text
canonical 上傳檔案
  -> 多來源擷取
  -> 可追溯 observation / candidate
  -> 同頁人工分類與修正
  -> 輕量寫入影響確認
  -> 原子正式化
  -> 正式值可回查來源與人工決策
```

成功不是「OCR 讀到最多文字」，而是：

- 不完整來源仍可進入工作區。
- 每個候選都知道原文、來源、位置、推定欄位與推定對象。
- 多料號共用與差異不互相覆蓋。
- 未知資料不遺失，衝突不被隱藏。
- 正式資料只有在人類明確確認後才變更。
- 寫入後可由正式值回查當次來源、修正與操作者。

## 3. Authority Boundary

```text
FileAsset / RevisionPackage = 受控來源檔與檔案包權威
Drawing / DrawingRevision   = 圖號與版次權威
Part                        = 料號 identity 權威
RecognitionSession          = 一次辨識與人工審核工作區
Observation / Candidate     = 非正式、可重跑、可修正的證據與提案
AttributeDefinition         = 公司範圍的正式欄位定義
PartAttributeValue          = 各料號的完整有效正式屬性
ControlledNote              = 無法標準化但需要保留的受控要求
FormalizationEvent          = 一次正式寫入的不可變稽核證據
```

Rules:

- 辨識 session 只能引用 canonical file asset，不得複製出第二套受控檔案權威。
- 送審前辨識使用 `drawing_number` source context，且必須帶入目前勾選的 `sourceAssetIds[]`；檔案選取集合改變後，上一輪結果只能作歷史證據，不能視為本次檔案的核對結果。
- 辨識結果不得建立新圖號、料號或版次 identity；無法對應既有／工作中 canonical object 時，正式化必須停止並要求人工掛接。
- 辨識不得改變 revision package、送審、核准、發布、BOM 或 FFF 規則。
- DEV-061 對首版／進版要求本次 `.SLDDRW` 與 `.SLDPRT/.SLDASM` 的規則維持不變；「3D 屬性可不完整」不等於放寬受控送審的必備檔案。
- 共用基準只存在於候選比較與審核模型；正式層每個料號仍保存自己的完整有效值。
- 既有 `same_drawing_variants` 與 `part_variant_attributes` 可作既有正式資料的相容讀寫 adapter，但不得拿來保存 observation、raw OCR、信心、衝突或人工決策。Current Phase 需要 additive、正規化的候選與稽核模型。

## 4. Spec Impact Preflight

Classification: `Compatible extension`.

| Existing authority | Current Phase impact |
|---|---|
| Drawing revision extraction assistance | 擴充既有 Phase 5，從 title-block part number 延伸成全項 observation／candidate；送審前可先針對圖號附件集合辨識，人工修正仍優先。 |
| Canonical drawing/revision/file | 不取代、不重編號、不改生命週期；只引用 stable ID 與內容 fingerprint。 |
| Revision package and file ownership | 不放寬 package 必備檔與 immutability；辨識可在 partial extraction 狀態保留候選，但 formal revision 流程仍遵守原規格。 |
| Part and drawing relation | 可提出 link 候選，不自行建立 identity 或繞過現有 relation authority。 |
| Change control / BOM / FFF | 不因辨識結果自動升版、換號、改 BOM 或發布。 |
| Access control | 延用 company scope 與 server permission guard，新增辨識專用 action permission。 |

This spec resolves one previously open direction in `SPEC-PDM-CHANGE-CONTROL-001`: Current Phase 不選擇一個無條件的來源優先序，而是保存多來源證據、揭露衝突並由人類決定正式值。

## 5. Current Phase Scope

### 5.1 In Scope

- 從一個或多個 canonical file assets 建立一次非同步辨識 session。
- 支援 OCR、2D 原生文字／metadata、3D CAD metadata、檔名解析及既有 PDM 值比較；adapter 可部分成功。
- 保存原文、正規化值、來源檔、頁／sheet／configuration、位置、信心、extractor 與版本。
- 在同一審核分頁呈現六個連續區段：
  1. 識別與關聯
  2. 料號基準與變體
  3. 圖面與版次控制
  4. 特殊要求與註記
  5. 局部工程資訊
  6. OCR 原文與尚未歸類
- 支援接受、修正欄名／值、映射既有欄位、建立公司自訂欄位、改掛對象、改列基準、標記明確不適用、忽略及保留待分類。
- 支援多來源相同值聚合與不同值衝突顯示。
- 支援共用基準加逐料號差異的審核投影。
- 提供寫入影響摘要與人類正式化 command。
- 正式化時原子寫入 formal values、evidence links 與 audit event。
- 保留重跑、partial failure、stale source／target、idempotency 與 optimistic concurrency 行為。
- 以 A0005 進行端到端 pilot 與 QA fixture 建立。

### 5.2 Out Of Scope

- production／staging 檔案處理、production migration、deploy 或 release。
- 採購 OCR API、SolidWorks Document Manager license、建立 Windows production worker 或接受外部費用。
- 修改或回寫 SolidWorks 3D／2D custom property。
- 自動建立圖號、料號、版次、configuration identity 或新 BOM。
- 自動核准、送審、發布、升版、換號或套用 FFF 決策。
- 第一版將尺寸、公差、GD&T、局部粗糙度、焊接符號或表面符號寫成一般料號屬性。
- 全歷史批次 OCR／CAD 回填。
- 自動學習欄位別名、自動升格公司欄位或自動接受高信心結果。
- 動態 schema column、每個 OCR 欄名一張表或無治理的 JSON 正式主資料。
- 獨立預覽頁、第二套審核頁或專用手機流程。

## 6. Recognition Classification Contract

分類依「資料要寫到哪個 PDM domain」決定；來源只作 evidence metadata。

| Category code | 顯示名稱 | Examples | Formal target |
|---|---|---|---|
| `identity_relation` | 識別與關聯 | 主根號、圖號、料號、版次、configuration、sheet、表格列對應料號 | 只 link 到既有 canonical object；無對象時不可正式化該項 |
| `part_attribute` | 料號屬性候選 | 材料、規格、原料型態、厚度、表面處理、顏色、熱處理、硬度、整體粗糙度 | 公司欄位字典 + 各料號完整有效值 |
| `drawing_revision` | 圖面／版次控制 | 圖號、版次、單位、比例、投影法、製圖／審核日期 | 既有可編輯 drawing/revision metadata；不得改 lifecycle |
| `controlled_note` | 特殊要求與註記 | 去毛邊、焊接、檢驗、包裝、品質、法規要求 | 可標準化者轉 part attribute；否則 controlled note |
| `engineering_evidence` | 局部工程資訊 | 尺寸、公差、GD&T、局部粗糙度、焊接符號、表面符號 | Current Phase evidence-only，不進一般料號基準 |
| `unclassified` | OCR 原文與尚未歸類 | 欄名、值、範圍或對象不確定的原文 | 無 formal write；保留或人工再分類 |

Classification invariants:

- 同一 observation 可被人工拆成多個 candidate，但每個正式候選只有一個目標 category 與 owner。
- 同一 candidate 可引用多個一致來源；來源不一致時保留各自 evidence 並建立 conflict，不以信心分數靜默選勝者。
- OCR confidence 只影響排序與視覺優先級，不等於正確性，也不影響正式權限。
- `unclassified` 預設不阻擋其他已完成項目的正式化，但必須在寫入確認中顯示排除數量；若它影響 intended target identity、owner 或既有值衝突，則為 blocker。

## 7. Multi-Part Baseline And Variant Contract

```text
候選投影：料號有效屬性 = 共用料號基準 + 該料號差異
正式權威：每個料號自己的完整有效屬性集合
```

Variant statuses:

| Status | Rule | Formal effect |
|---|---|---|
| `same` | 值與共用基準一致 | 審核投影不重複顯示；正式值維持相同有效值 |
| `changed` | 相同欄位有明確不同值 | 只替該料號提出覆寫候選 |
| `added` | 基準無此欄位，該料號有明確值 | 只替該料號新增候選 |
| `explicit_not_applicable` | 有 `無／取消／N/A／不適用` 或等價直接證據 | 只替該料號提出清除／不適用；確認視窗必須明示 |
| `unrecognized` | 未讀到值或無足夠證據 | 預設繼承或待確認，不得轉成清除 |

Baseline rules:

- 系統可依多料號共同值提出 baseline 建議，但人類可將 candidate 移入或移出 baseline。
- baseline 重算不得改寫已接受的人類 per-part decision；若重算造成差異，顯示 stale／conflict。
- 正式化只寫實際新增、變更或明確清除；不因 baseline 投影而重寫全部無差異 rows。
- 寫入後查詢每個料號時，不需要依賴 recognition session 才能算出正式有效值。

## 8. Logical Data Contract

Physical table names、index names、repository placement 與 provider parity 已在第 22 節固定；下列 object、欄位語意、immutability 與 relation 不得省略。

### 8.1 RecognitionSession

Required fields:

- `id`, `companyId`, optional `drawingId`, `drawingRevisionId`, `packageId` or workspace reference.
- `status`, `createdBy`, `createdAt`, `updatedAt`, `rowVersion`.
- immutable `sourceSetFingerprint` and optional `supersedesSessionId`.
- `extractorSummary`, `warningCount`, `conflictCount`, `unclassifiedCount`.
- terminal `formalizedAt`, `formalizedBy`, `formalizationEventId` when applicable.

State machine:

```text
created -> extracting -> review_ready
                    \-> extraction_partial -> review_ready
                    \-> extraction_failed
review_ready -> ready_to_formalize -> formalized
review_ready -> cancelled
extraction_failed -> retry creates a new attempt or successor session
formalized/cancelled = terminal
rerun = new successor session; never resets or overwrites the old session
```

### 8.2 RecognitionSource

- References one canonical `file_asset` plus its content hash, generation／version, filename, MIME and source role.
- Records requested adapters and per-adapter result: `succeeded`, `partial`, `unsupported`, `failed`.
- Source set is immutable after extraction starts. A changed／deleted source makes the session stale; it is not silently rebound.

### 8.3 RecognitionObservation

- Immutable extractor output: raw text/value, source asset ID, page／sheet／configuration, geometry or anchor, confidence, extractor ID/version, raw payload reference/hash and captured timestamp.
- Observation is evidence, not a formal field and not directly editable.
- Corrections create candidate decisions; they do not destroy raw evidence.

### 8.4 RecognitionCandidate

- `category`, normalized proposed field key/label, raw and normalized value, proposed owner type/ID, scope, variant status and confidence band.
- Links one or more observations and optional current formal value snapshot.
- Carries `proposed`, `accepted`, `corrected`, `mapped`, `ignored`, `deferred`, `conflict` or `blocked` review state.
- Duplicate candidates may be grouped for display, but source links remain individually queryable.

### 8.5 ReviewDecision

- Records before/after field, value, category, owner, scope and decision action.
- Records actor, time, reason when clearing/ignoring/conflict override, and expected session row version.
- Append-only for audit. Current projection may point to the latest decision.

### 8.6 CompanyAttributeDefinition

`非限制欄位` means candidate names are open and a reviewer may explicitly create a governed company field; it does not mean dynamic database columns.

Required semantics:

- company-scoped stable normalized `key`, editable display `label`, category, status and aliases.
- Current Phase value type is `text`; raw value and optional unit text are preserved. Typed numeric/date validation is future work.
- Unique normalized key per company.
- Creating a custom field requires explicit review action and collision／similar-name warning.
- Alias suggestions may be shown, but automatic merge, rename or promotion is out of scope.

### 8.7 Formal Value And Note

- `PartAttributeValue`: company + part + attribute definition has one current effective value, row version, last formalization event and evidence link.
- Existing fixed material/color/surface fields may be updated through an adapter when the attribute definition maps to them; the generic formal model remains the source for additional governed fields.
- `ControlledNote`: stable note text, owner object, applicability scope, status and source evidence. It must not be disguised as a random part attribute when it cannot be standardized.
- `EngineeringEvidence`: source-linked evidence index only; Current Phase has no general master-data mutation.

### 8.8 FormalizationEvent

- Immutable event containing session ID, actor, idempotency key, preview/write-impact fingerprint, target versions, exact applied changes, exact exclusions, timestamp and result.
- Every applied formal row links back to this event and its accepted candidate/evidence.
- Repeated request with the same idempotency key returns the original result; it must not duplicate writes.

## 9. Extraction Adapter Contract

Current Phase 採 provider-neutral command adapter；provider／license 不進入 domain model。每個 adapter 必須滿足同一邊界：

```text
extract(canonicalAssetReference, immutableSourceFingerprint, capabilityOptions)
  -> observations[] + adapterResult + diagnostics
```

Rules:

- Adapter may read only the supplied company-scoped canonical asset stream or approved derivative.
- Adapter may not mutate the source asset, SolidWorks file, revision package or formal PDM data.
- OCR, native PDF/text parser, SolidWorks metadata reader and filename parser are independent capabilities; no one adapter is mandatory for the logical model.
- One adapter failure creates `extraction_partial` when other evidence exists; it does not discard successful observations.
- Unsupported files produce a visible diagnostic, not a fabricated empty success.
- External raw payload storage must be content-addressed or hash-linked, encrypted according to repository policy and excluded from user-visible secrets/logs.
- Extractor name/version and run time are required so A0005 results can be reproduced and compared.

Current Phase local adapter stack:

- `filename.v1`：內建、必定可用、零授權費，只能產生檔名 observation，不得冒充 OCR。
- `native-metadata-bridge.v1`：包裝既有 `pdm-metadata-adapter.ts`／`cad-extraction.ts`；未設定 company-scoped command 時回報 `unsupported`，不回空白成功。
- `external-json-ocr.v1`：透過 `PDM_DRAWING_RECOGNITION_OCR_CMD` 與 JSON array `PDM_DRAWING_RECOGNITION_OCR_ARGS` 呼叫本機或未來核准的 OCR executable；stdin／stdout contract 由第 22 節固定。Current Phase 不綁定、不安裝也不採購特定 provider。
- `fixture-marker.v1`：只可在 test／isolated fixture mode 使用，以 deterministic observation 驗證完整流程；production mode 必須 fail closed。

Readiness assessment 已確認本機未安裝 Tesseract、未設定 OCR／CAD extractor env，也沒有已核准的外部 provider。因此本機第一階段可實作並驗證候選、審核、正式化與 adapter failure/unsupported 行為；「真實 OCR 準確率」是 provider/release capability gate，不得偽裝成本機已通過。

## 10. Review And UI Contract

The single page is the complete human decision surface.

Required behavior:

- Six sections render in one scroll surface; a sticky section navigator may scroll to anchors and show counts.
- Normal high-confidence, non-conflicting candidates remain visually quiet; conflicts, low confidence, unresolved owner and unclassified items receive higher emphasis.
- Baseline appears once. Each part row shows only changed, added or explicitly not-applicable values by default, with a discoverable way to inspect inherited/same values.
- Evidence opens in a side panel/drawer with source file, page/sheet/configuration, highlighted region, raw text and extractor details; closing it preserves list position and unsaved review state.
- Color is never the only state signal. Use text/icon labels for proposed, corrected, conflict, ignored, deferred and blocked.
- Human changes have undo/recover behavior before formalization. Ignored evidence stays traceable.
- The page must clearly separate `候選／待確認` from `目前正式值`.
- The primary page CTA is `確認寫入內容`, not `儲存草稿` versus `預覽正式化` as two competing final actions. Review edits may auto-save or use a quiet recovery status, but they are not formal writes.

Write confirmation gate:

- Opens from `確認寫入內容` and is backed by the server write-impact calculation.
- Shows target object/count, actual creates/updates/clears, current-value conflicts, blockers and excluded/unclassified count.
- Does not repeat unchanged, inherited or merely observed rows.
- `返回核對` causes zero formal write.
- `正式寫入 PDM` calls the formalization command.

Responsive acceptance viewports: desktop `1440px`, compact desktop/tablet `1024px`, narrow `390px`. Current Phase is desktop-first, but the narrow view must remain usable and must not hide blockers or formal write consequences.

## 11. API Contract

Route folders are fixed below. RD must still read and follow the repository's local Next.js 16 route/page guides before implementation; permission, concurrency and error semantics may not be weakened.

| Operation | Route | Minimum input | Required output / behavior |
|---|---|---|---|
| Create/run | `POST /api/numbering/recognition-sessions` | canonical `sourceAssetIds[]`, optional drawing/revision/package/workspace context, client idempotency key | `202`, session ID, status, immutable source fingerprint; queues extraction |
| Read review projection | `GET /api/numbering/recognition-sessions/:id` | session ID | company-scoped six-section projection, current formal values, counts, evidence links allowed to viewer, row version |
| Save decisions | `PATCH /api/numbering/recognition-sessions/:id/decisions` | batch decisions + expected row version | updated projection/counts/row version; append-only decision audit |
| Calculate write impact | `POST /api/numbering/recognition-sessions/:id/write-impact` | expected session version + intended decision set | actual changes, conflicts, blockers, exclusions, target fingerprints and short-lived impact token; zero formal write |
| Formalize | `POST /api/numbering/recognition-sessions/:id/formalize` | impact token + idempotency key | atomic applied result + formalization event; no partial success |
| Rerun | `POST /api/numbering/recognition-sessions/:id/reruns` | adapter options + client idempotency key | new successor session; old reviewed/formalized session unchanged |

Error semantics:

- `400`: invalid decision shape, invalid target type or clearing without required explicit evidence/reason.
- `403`: missing action permission or company scope.
- `404`: source/session/target is not visible in the caller scope.
- `409`: session row version changed, source fingerprint stale, formal target changed after impact calculation, unresolved intended-write conflict or session already terminal with a different idempotency key.
- `422`: intended formal item has unresolved owner/field mapping or violates existing domain lifecycle rules.
- `503`: feature is enabled but queue infrastructure is unavailable before a session can be persisted. Normal adapter unsupported/all-failed outcomes remain queryable session states and do not convert the original upload into 503.

API responses must not return source text, file links, formal values or evidence outside the caller's company and object visibility scope.

## 12. Permission And Tenancy Contract

Existing page permission may continue to use `numbering.drawings.view`, but Current Phase needs dedicated server action permissions:

| Semantic action | Proposed code | Rule |
|---|---|---|
| Start/retry extraction | `numbering.recognition.run` | User can see every source asset and owning context; attaching/uploading files still uses existing file permission. |
| Edit review decisions | `numbering.recognition.review` | Company-scoped reviewer or authorized operator; cannot formalize by implication. |
| Formalize into PDM | `numbering.recognition.formalize` | Separate high-risk permission; generic `numbering.draft.update` or `attachments.manage` is insufficient. |

Guards:

- Every read/write resolves company context server-side and verifies source plus target visibility.
- Formalization rechecks permission and target scope; a previously issued impact token is not authorization.
- Evidence URLs use the existing protected asset access path and short-lived access mechanism; never expose storage credentials or raw provider paths.
- Cross-company duplicate hashes or file reuse must not reveal file existence, content or metadata.
- Audit records include actor and company context and cannot be edited through the recognition API.

## 13. Formalization Transaction Contract

Formalization is one external write command, not a sequence of client-side PATCH calls.

Required transaction behavior:

1. Validate session status, expected session version, impact token, source fingerprints, permissions and company scope.
2. Re-read every formal target and compare the target version/fingerprint captured by `write-impact`.
3. Reject stale or unresolved intended-write conflicts before any mutation.
4. Apply all part attributes, drawing/revision metadata, controlled notes, evidence links and formalization event inside one database transaction.
5. Mark session formalized only after every target write succeeds.
6. On any failure, roll back all target and event writes; the session remains reviewable with a visible error.
7. Return the same result for a repeated idempotency key.

No partial formalization is allowed in Current Phase. If RD finds a target adapter that cannot join the transaction and cannot provide a safe compensating protocol, implementation must stop and return to Dev PM.

## 14. Rerun, Conflict And Recovery Contract

- Rerun creates a successor session and records `supersedesSessionId`; it never deletes or overwrites an earlier session, review decision or formalization event.
- Human mappings from an earlier session may be shown as suggestions only. They cannot be auto-accepted in the new session.
- If official values change after `write-impact`, formalization returns stale conflict and requires `返回核對` plus a new impact calculation.
- If source content changes, the current session stays bound to the old fingerprint and cannot formalize against the changed source without a new run.
- One failed adapter does not erase successful evidence. Users can review partial results with an explicit warning.
- All-adapter failure retains diagnostics and retry action; it produces no empty-success session.
- Ignored or deferred candidates remain auditable and appear as exclusions in the write confirmation count.
- A formalized session is read-only. Corrections after formalization follow normal PDM change rules and may start a new recognition session; they do not edit the old event.

## 15. Acceptance Contract

### 15.1 Product Acceptance

1. Given A0005 complete 3D＋2D sources, when extraction completes, then one session contains traceable observations from every successful adapter and missing 3D properties do not block review.
2. Given one drawing maps to A0005 and P01／P02／P03 variants, when common and different values are recognized, then common material／surface／color appears once as baseline and each part shows only its own differences.
3. Given a part has no recognized value for a baseline field, then the system does not propose clearing it; only explicit `無／取消／N/A／不適用` evidence can create a clear/not-applicable proposal.
4. Given CAD and OCR sources propose different non-empty values, the page exposes every source as a conflict and confidence does not auto-select a winner. In a reversible draft-population context, a difference from current PDM alone remains a proposed draft update and is shown at write-impact instead of becoming an initial field error.
5. Given an unknown field label, then the user can map it, create a company custom field with collision warning, defer it or ignore it without losing raw evidence.
6. Given a local roughness symbol and a title-block overall roughness note, then the local symbol remains engineering evidence while the overall value may become a part attribute candidate.
7. Given unresolved text that does not affect an intended write, then formalization may proceed only after the confirmation shows the excluded count; unresolved owner or intended-write conflict blocks it.
8. Given review changes are saved, then no formal PDM row changes until the user clicks `正式寫入 PDM`.
9. Given `確認寫入內容` is clicked, then only actual creates/updates/clears, conflicts, target scope and exclusions are displayed; inherited/no-change rows are absent.
10. Given `返回核對`, then formal PDM change count remains zero and review state is preserved.
11. Given a valid non-stale impact token and authorized formalization, then all target changes and evidence links commit once and every formal value can navigate back to the event, candidate and source.
12. Given any target write fails, then all formal changes roll back; retry with the same idempotency key cannot duplicate writes.
13. Given the official target changes between impact calculation and formalization, then the command returns conflict and applies zero changes.
14. Given a rerun after human correction, then a successor session is created and the earlier review/formalization remains immutable.
15. Given an unauthorized or cross-company request, then the API returns no source evidence, candidate, formal value or mutation.

### 15.2 Engineering Acceptance Evidence

RD/QA must plan and later provide:

- SQLite and PostgreSQL schema/repository parity for every additive model and transaction rule.
- Adapter contract tests for success, partial, unsupported, timeout and all-failed cases.
- API tests for company scope, permission separation, optimistic concurrency, stale impact token, idempotency and atomic rollback.
- Model tests for source binding, duplicate grouping, baseline/difference calculation, explicit-not-applicable and local-vs-overall scope.
- A0005 deterministic fixture manifest listing source asset hashes, expected identity relations, expected shared attributes, expected P01／P02／P03 differences and acceptable OCR variance.
- UI browser evidence at 1440/1024/390 for same-page sections, anchor navigation, evidence drawer, conflicts, unknown fields, confirmation gate, error recovery and zero hidden blocker.
- Visible console/server error sweep and accessibility checks for keyboard navigation, focus return, labels and non-color state signals.
- Negative evidence showing zero formal writes before confirmation and zero partial writes after forced failure.

## 16. Non-Functional Contract

- Extraction is asynchronous and must not hold an upload HTTP request open until OCR/CAD processing completes.
- Large raw payloads and rendered evidence must use file/derivative storage; do not place unbounded blobs in normal API responses.
- List/review endpoints return paged or section-windowed evidence details when required, while counts and blockers remain complete.
- Logs must redact raw drawing text when it may contain customer, supplier or regulated data; diagnostics use IDs/hashes and safe error codes.
- Provider timeout/retry has bounded attempts and does not duplicate sessions or formalization events.
- Review autosave or draft persistence must expose saving/error/recovered state; browser reload cannot silently lose accepted human decisions.
- Source and target fingerprints must be deterministic across supported database providers.

## 17. Dependencies

`RD Implementation Ready` dependency resolution:

- `Resolved`：canonical `file_assets`、candidate/package/revision file links與 protected preview/stream authority 已存在。
- `Resolved`：stable Drawing／DrawingRevision／Part／relation／package／workspace ID 已存在。
- `Resolved`：沿用 preview job 的 claim／heartbeat／complete pattern，recognition 使用獨立 token、table 與 runner。
- `Resolved`：additive attribute definition/value、drawing metadata、controlled note、engineering evidence 與 formalization event physical model固定於第 22 節。
- `Resolved`：三個 action permission 與 default role matrix 固定於第 22 節。
- `Resolved`：SQLite baseline、PostgreSQL `033`、local apply/dry-run 與 forward-compatible rollback 固定於第 22 節。
- `Resolved`：local adapter 採 built-in filename + existing native bridge + provider-neutral external JSON OCR + test-only fixture marker；無購買、無憑證、無授權費承諾。
- `Resolved`：A0005 兩個 canonical local assets、hash、canonical relation與正式變體 ground truth 已記錄於 `.ai-doc/qa/fixtures/dev-068-a0005-fixture-manifest.md`。

## 18. Stop / Re-entry Conditions

Stop implementation and return to Dev PM/user if:

- Work requires production/staging files, credentials, external purchase, SolidWorks license activation, live provider cost or production worker installation.
- RD proposes OCR/CAD output as an automatic authority or removes the final human formalization command.
- Source files must be copied into a new competing file authority or mutated in place.
- Recognition must create new canonical drawing/part/revision identities, bypass relation authority, alter package lifecycle, approve, publish, revise BOM or apply FFF.
- Company scope or source/target permissions cannot be verified server-side.
- Flexible formal fields can only be delivered as dynamic DB columns, ungoverned JSON or a provider-specific schema without SQLite/PostgreSQL parity.
- Formalization cannot be atomic or safely compensating across all intended targets.
- Existing controlled values would be overwritten without target version checks and visible conflict.
- A0005 source/expected mappings are unavailable, ambiguous or include production-only data that cannot enter isolated verification.
- Implementation touches production migration, deployment, release, data deletion or historical mass backfill.

Re-enter product decision if:

- User wants unclassified items to hard-block every formalization rather than only owner/intended-write conflicts.
- User wants auto-create of canonical part/drawing identities or automatic custom-field promotion.
- User wants engineering dimensions/GD&T to become editable formal master data in Current Phase.
- User wants a source priority rule that can automatically override conflicting evidence.
- User wants partial formalization of only selected target objects.

## 19. RD Handoff And Phase Gate

Current maturity: `Local RD Implemented / Focused QA-QC Passed / Production Release Gated`.

Completed local implementation boundary:

- Implement local Phase 1A～1D in the exact boundary defined by sections 22～30.
- Use only isolated/local fixtures and additive migrations; keep the feature default-off.
- Raise only a true stop condition or a contract conflict to Dev PM.

RD may not:

- Run A0005 through an external paid/live provider.
- Touch production/staging data or credentials.
- Stage, commit, merge, deploy or release DEV-068 changes.

Readiness gate result:

1. `PASS`：使用者要求在 RD Implementation Readiness Assessment 上繼續推進；本機 Phase 1A～1D 已完成。
2. `PASS`：physical schema／repository／API／file list 與 SQLite/PostgreSQL parity 已固定。
3. `PASS`：local adapter contract 與 license/cost boundary 已固定；真實 provider 是 release capability gate。
4. `PASS`：permission defaults、feature flag、dry-run 與 forward rollback 已固定。
5. `PASS`：A0005 fixture manifest 已建立，來源 hash 與 repository-derived ground truth 可驗證。
6. `PASS`：沒有未解的 P0/P1 authority、atomicity、tenancy 或 formal-field blocker。

## 20. Future Phase Capsule

After A0005 and Current Phase human workflow are verified, future phases may evaluate:

- Company field alias suggestions and explicit dictionary promotion.
- Drawing-template/layout profiles.
- Learning from repeated human corrections without auto-approval.
- Historical batch OCR with dry-run and data/release gates.
- Native SolidWorks metadata reader and Windows worker；2026-08-20 `DEV-035 / DEV-CAD-001` 已達 `Local RD Implemented / Real A0002 QA-QC Passed / Production Release Gated`，專屬authority為 `.ai-doc/specs/SPEC-PDM-SOLIDWORKS-METADATA-READER-001-native-property-extraction.md`。Current Phase固定Document Manager、UI-managed credential broker、job-locked source bytes、file/configuration scope、company alias/owner與sanitized diagnostics；仍只輸出本SPEC的observation/candidate並沿用human review/impact/atomic formalization。2D preview、Add-in、未儲存狀態與production deploy仍是明確排除或future scope，不改變DEV-068已完成Phase 1A～1D authority。
- Typed numeric/unit fields and controlled engineering characteristic models.
- Review-time quality metrics: miss rate, wrong-owner rate, correction rate and median review time.

Re-entry requires enough reviewed data to measure error/correction behavior plus explicit user authorization for the relevant automation, provider, migration or formal-domain expansion.

## 21. Governance Result

- Spec impact: `Compatible extension`; no existing authority is replaced.
- ADR: not required for this RD Contract because canonical file/drawing/part/revision authorities remain unchanged and the candidate/formalization layer is additive. Re-evaluate ADR need if the generic attribute dictionary becomes a cross-domain platform, formalization becomes distributed/non-atomic, or automatic source precedence is introduced.
- QA plan: `.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md`。
- Fixture manifest: `.ai-doc/qa/fixtures/dev-068-a0005-fixture-manifest.md`。
- Current implementation blocker: 無 DEV-082 本機 blocker；`qc:dev-082:gate` 已以 44/44 executable matrix 通過。production representative PDF/CAD accuracy、正式檔案存取、migration、deploy與release仍是獨立 gate，不得把本機 PASS 當成 production release authorization。
- Remaining gates: production representative PDF/CAD accuracy set、production device/network P95、production file access、migration、deploy與release仍各自 gated。

## 22. Repository-Specific Implementation Assessment

Assessment date: 2026-08-12.

Verified repository facts:

- Runtime is Next.js 16.3 + React 19 + TypeScript. Before editing routes/pages, RD must read the relevant local guides under `node_modules/next/dist/docs/` as required by `AGENTS.md`.
- `src/lib/db-async-provider.ts` provides SQLite and PostgreSQL clients plus transactions; PostgreSQL uses a real transaction and SQLite uses `BEGIN IMMEDIATE` semantics.
- SQLite fresh-schema authority is `db/schema.sql`; PostgreSQL migrations currently end at `032_remove_part_cost.sql`, so DEV-068 owns additive `033_drawing_recognition.sql`.
- `platform_command_receipts`、`platform_outbox_events` 與 `executePdmCommandWithOutbox` already provide command idempotency and outbox behavior; DEV-068 must reuse them, not add another command receipt system.
- `file_assets` is the file identity/storage record. Company access is resolved through the owning candidate/package/revision context because `file_assets` itself has no `company_id`.
- Candidate upload and revision-package repositories already persist canonical source links transactionally. Automatic recognition enqueue hooks belong after successful persistence in those services; extraction failure must never roll back a successful file upload or submission.
- Existing `ai-ocr-adapter.ts` is a legacy fixed-whitelist marker/key-value helper, not real OCR and not suitable as the new open-field candidate authority. It remains backward compatible; DEV-068 uses a new observation contract.
- Existing `pdm-metadata-adapter.ts`、`cad-extraction.ts` and company-specific adapter profile can be wrapped as optional low-level sources.

Implementation risk: `Medium / cross-module additive data and workflow`. No canonical identity replacement, production write or distributed transaction is required.

## 23. Physical Schema Contract

All tables use `TEXT` IDs and ISO timestamp text to match current provider conventions. Every company-owned query includes `company_id`; all FK targets are rechecked in the repository because polymorphic or storage records do not independently prove company ownership.

### 23.1 Candidate and job tables

| Table | Required columns and constraints | Required indexes / mutability |
|---|---|---|
| `drawing_recognition_sessions` | `id PK`, `company_id FK`, `source_context_type` (`candidate_revision`,`revision_package`,`drawing_revision`,`drawing_number`), `source_context_id`, `source_lineage_key`, nullable `drawing_id FK`, nullable `drawing_revision_id FK`, immutable `source_set_fingerprint`, unique `deduplication_key`, `session_purpose` (`recognition`,`rerun`,`amendment`), nullable `evidence_origin_session_id FK` (legacy recognition／rerun null is interpreted as self-origin; amendment inherits origin), `status` (`queued`,`extracting`,`review_ready`,`extraction_partial`,`extraction_failed`,`ready_to_formalize`,`formalized`,`cancelled`), `priority default 100`, `not_before`, `attempt_count`, `locked_by/locked_at/heartbeat_at`, nullable `supersedes_session_id FK`, `row_version >= 1`, count columns, safe `error_code/error_summary`, `created_by/created_at/updated_at`, nullable terminal actor/time | unique `(company_id,deduplication_key)`; claim index `(status,not_before,priority,created_at)`; context／successor／lineage indexes; partial unique open amendment on `(company_id,evidence_origin_session_id)` for amendment statuses. Session is mutable only through state-machine repository methods. |
| `drawing_recognition_sources` | `id PK`, `session_id FK`, `company_id FK`, `file_asset_id FK`, copied immutable `content_hash/storage_generation/file_name/file_ext/mime_type/file_size`, `source_role`, `sort_order`, `adapter_plan_json`, created fields | unique `(session_id,file_asset_id)`; indexes by session/order and asset/hash. No update/delete after insert. |
| `drawing_recognition_adapter_results` | `id PK`, `session_id/source_id FK`, `company_id`, `adapter_code/version`, `status` (`succeeded`,`partial`,`unsupported`,`failed`,`timeout`), `observation_count`, bounded `diagnostics_json`, timestamps | unique `(session_id,source_id,adapter_code)`; append-only after worker completion. |
| `drawing_recognition_observations` | `id PK`, `session_id/source_id/adapter_result_id FK`, `company_id`, `raw_text`, nullable `raw_value/normalized_value`, `location_kind`, nullable `page_number/sheet_name/configuration_name`, bounded `geometry_json`, `confidence_band`, `extractor_code/version`, nullable `raw_payload_hash/raw_payload_derivative_id FK`, `captured_at` | indexes by session/category projection and source; update/delete blocked by provider-equivalent append-only triggers. Raw payload itself stays in protected derivative storage. |
| `drawing_recognition_candidates` | `id PK`, `session_id/company_id`, `category` (`identity_relation`,`part_attribute`,`drawing_revision`,`controlled_note`,`engineering_evidence`,`unclassified`), `field_key/field_label`, `raw_value/proposed_value/normalized_value`, `proposed_owner_type/id`, `applicability_scope`, `variant_status`, `confidence_band`, `review_state`, nullable current formal snapshot/fingerprint, `group_key`, `sort_order`, `row_version`, timestamps | session/category/owner indexes; current projection is mutable only with an append-only decision in the same transaction. |
| `drawing_recognition_candidate_observations` | `candidate_id FK`, `observation_id FK`, `company_id`, `created_at` | composite PK `(candidate_id,observation_id)`; append-only. |
| `drawing_recognition_decisions` | `id PK`, `session_id/candidate_id/company_id`, `action`, `before_json`, `after_json`, nullable `reason`, `expected_session_version`, `actor_id`, `decided_at` | session/time and candidate/time indexes; update/delete blocked. Actions are `accept`,`correct`,`map`,`create_field`,`reassign`,`set_baseline`,`not_applicable`,`ignore`,`defer`,`restore`. |

`deduplication_key = SHA-256(companyId + sourceLineageKey + ordered(assetId,contentHash,generation,role))`. A changed source set creates a successor session. If an earlier session is still `queued`, it may be cancelled as `source_set_superseded_before_claim`; its source rows and fingerprint are never rewritten. A 2-second `not_before` quiet window coalesces normal sequential 3D/2D upload without holding the upload request.

### 23.2 Formal master and evidence tables

| Table | Required columns and constraints | Authority rule |
|---|---|---|
| `pdm_attribute_definitions` | `id PK`, `company_id FK`, normalized `stable_key`, `display_label`, `category='part_attribute'`, `value_type='text'`, `aliases_json`, nullable `legacy_target_key`, `status`, `row_version`, actor/timestamps; unique `(company_id,stable_key)` | Governed company field dictionary. No dynamic columns. Similar-name collision is an application warning; exact-key collision is DB-enforced. |
| `pdm_part_attribute_values` | `id PK`, `company_id`, `part_number_id FK`, `attribute_definition_id FK`, `applicability_state` (`value`,`not_applicable`), nullable `value_text/unit_text`, `row_version`, `last_formalization_event_id`, actor/timestamps; unique `(company_id,part_number_id,attribute_definition_id)` | Formal source for flexible part attributes. Existing fixed material/color/surface projection is mirrored/fallback through one repository adapter in the same transaction; `part_variant_attributes` never stores evidence or decisions. |
| `pdm_drawing_revision_metadata_values` | `id PK`, `company_id`, `drawing_revision_id FK`, `metadata_key` (`unit`,`scale`,`projection_method`,`drawn_date`,`reviewed_date`), `value_text`, `row_version`, `last_formalization_event_id`, actor/timestamps; unique `(company_id,drawing_revision_id,metadata_key)` | Drawing number and revision are read-only identity checks and are never written here. |
| `pdm_controlled_notes` | `id PK`, `company_id`, exactly one of `part_number_id FK`／`drawing_id FK`／`drawing_revision_id FK`, `note_text`, `applicability_scope`, `status` (`active`,`superseded`), `row_version`, `last_formalization_event_id`, actor/timestamps | Formal non-standardized requirement; no polymorphic unverified owner string. |
| `pdm_engineering_evidence` | `id PK`, `company_id`, exactly one canonical owner FK as above, `session_id/candidate_id/observation_id FK`, `evidence_type`, `summary`, nullable location fields, `created_at` | Evidence index only; no general dimension/GD&T master-data mutation. Immutable. |
| `drawing_recognition_formalization_events` | `id PK`, unique `session_id FK`, `company_id`, `actor_id`, `idempotency_key`, `impact_fingerprint`, `target_fingerprints_json`, `applied_changes_json`, `exclusions_json`, `result_json`, `created_at`; unique `(company_id,idempotency_key)` | Immutable audit event. Command receipt remains the platform idempotency authority. |
| `drawing_recognition_formalization_links` | `event_id/candidate_id/company_id`, `target_type`, `target_id`, `field_key`, `change_kind`, nullable `before_value/after_value`, `created_at` | composite unique `(event_id,candidate_id,target_type,target_id,field_key)`; immutable navigation from formal value to event/candidate/evidence. |

FK cycles are avoided by letting session projection derive its formalization event from the event table. Physical DDL creates `drawing_recognition_formalization_events` before the master value/note tables, so every `last_formalization_event_id` can use a real FK in both providers. During formalization the immutable event is inserted first with the already-calculated applied result, then formal rows and links reference it; the surrounding transaction rolls the event back if any later insert/update fails.

### 23.3 Provider parity and migration

- SQLite fresh DB: append identical logical tables, indexes and append-only triggers to `db/schema.sql`.
- Existing local SQLite: `scripts/apply-dev-068-local-schema.mjs` supports `--dry-run` and explicit `--apply --confirm-local-dev-068-schema`; it applies only idempotent additive DDL and records `pdm_local_data_migrations.version='DEV-068-drawing-recognition-v1'`.
- PostgreSQL: `db/postgres/033_drawing_recognition.sql`; constraints/indexes/immutability functions mirror SQLite semantics. Update `db/postgres/README.md`.
- No automatic data backfill. Formal reads use generic rows first and the existing fixed `part_variant_attributes` compatibility projection only when a generic row does not exist. The first confirmed write creates the generic row and mirrors a known fixed field atomically.
- Rollback is forward-compatible: disable `PDM_DRAWING_RECOGNITION_V1` and roll back application code. Do not drop the additive tables or delete candidate/evidence data. Production apply requires a separate migration/release authorization.

## 24. Repository, Service And Transaction Contract

New core files:

- `src/lib/drawing-recognition-contract.ts` — enums, API envelopes, normalization, source/target fingerprints and state-machine types.
- `src/lib/drawing-recognition-adapters.ts` — provider-neutral adapter runner and bounded payload validation.
- `src/lib/drawing-recognition.ts` — create/rerun, decision projection, impact calculation and formalization orchestration.
- `src/lib/repositories/drawing-recognition-async-repository.ts` — all SQL and provider-specific lock clauses.
- `src/lib/drawing-recognition-feature.ts` is not added; the flag belongs in existing `src/lib/number-state-flow-feature.ts`.

Required integration points:

- `src/lib/number-lifecycle-simplification.ts` and `src/lib/repositories/number-lifecycle-simplification-async-repository.ts`: after a candidate source file commits, best-effort `ensureRecognitionSessionForSourceContextAsync` enumerates the full active file set. The upload remains successful if recognition enqueue fails; response contains a safe warning/status.
- `src/lib/repositories/drawing-revision-package-async-repository.ts`: after package/file persistence, ensure or reuse the lineage/source-fingerprint session. It must not enqueue a duplicate when the candidate lineage and source set are unchanged.
- `src/lib/drawing-workbench.ts`: add latest recognition summary and capability; detail read budget is at most one additional aggregate query, never one query per candidate/part.
- `src/lib/numbering-permission-codes.ts`, `src/lib/numbering-permission-guard.ts`, `db/schema.sql` and PostgreSQL 033: add permissions and defaults together.
- `src/app/api/numbering/state-flow/status/route.ts`: expose the server-derived recognition flag status without exposing worker/provider commands or secrets.

Formalization command name is `drawing_recognition.formalize.v1` and must call `executePdmCommandWithOutbox`. Lock order is fixed:

1. recognition session;
2. attribute definitions ordered by stable key;
3. parent `part_numbers` ordered by ID, then existing attribute rows ordered by definition ID;
4. parent `drawing_revisions` ordered by ID, then metadata rows ordered by key;
5. controlled-note/evidence target parents ordered by type + ID;
6. formalization event/value/link inserts and session terminal update, all after the lock/recheck sequence.

PostgreSQL uses `SELECT ... FOR UPDATE`; SQLite runs within `BEGIN IMMEDIATE`. `write-impact` hashes the expected session version, immutable source set and current target rows including explicit missing-row markers. Formalization locks and re-hashes every target. Any mismatch returns `409` before the first formal mutation. If a target is Released/controlled, the command also requires existing `post_release_change` plus a non-empty reason; recognition permission never bypasses lifecycle authority.

`identity_relation` decisions may populate the reversible recognition draft and bind the same logical part across canonical／active-draft layers. They do not directly create canonical identity or `drawing_part_links`; a truly unresolved relation blocks the affected intended formal write at impact until the user completes the existing relation workflow.

## 25. API And Worker File Contract

User routes:

- `src/app/api/numbering/recognition-sessions/route.ts` — `POST` create/run.
- `src/app/api/numbering/recognition-sessions/[sessionId]/route.ts` — `GET` six-section projection.
- `src/app/api/numbering/recognition-sessions/[sessionId]/decisions/route.ts` — `PATCH` batched decision command.
- `src/app/api/numbering/recognition-sessions/[sessionId]/write-impact/route.ts` — `POST` zero-write impact.
- `src/app/api/numbering/recognition-sessions/[sessionId]/formalize/route.ts` — `POST` atomic command.
- `src/app/api/numbering/recognition-sessions/[sessionId]/reruns/route.ts` — `POST` successor.
- `src/app/api/numbering/recognition-sessions/[sessionId]/observations/[observationId]/route.ts` — protected evidence detail; derivative/source streams still use existing protected file authority.

Worker routes and runner:

- `src/app/api/recognition-jobs/claim/route.ts`.
- `src/app/api/recognition-jobs/[sessionId]/heartbeat/route.ts`.
- `src/app/api/recognition-jobs/[sessionId]/complete/route.ts`.
- `scripts/run-drawing-recognition-worker.mjs`.

Worker auth uses a separate `PDM_DRAWING_RECOGNITION_WORKER_TOKEN`; it does not reuse browser cookies or preview token. Claim returns only IDs, immutable hashes and a local source path when `storage_provider='local_repository'`. Current Phase does not add a production GCS downloader. Completion accepts bounded observations/diagnostics, verifies lock owner, adapter/version, source hash and payload limits, then persists all results transactionally. Worker output never contains formal writes.

External OCR command input is one JSON document on stdin with `schemaVersion`, `sessionId`, `sourceId`, `sourcePath`, `contentHash`, `mimeType`, `languageHints` and `requestedCapabilities`. Stdout is one JSON document with `schemaVersion`, `adapter`, `status`, `observations[]` and bounded `diagnostics[]`; arbitrary provider JSON is rejected. Default timeout is 30 seconds per source, maximum 120 seconds, two attempts, exponential retry, and no retry for `unsupported`/validation errors.

## 26. Permission Defaults And Scope

Add action codes to `NUMBERING_ACTION_PERMISSION_CODES` and both schema providers:

| Role | `run` | `review` | `formalize` | Scope |
|---|---:|---:|---:|---|
| `rd` | yes | yes | yes | Own/assigned active workspace/drawing only; non-Released targets only. |
| `rd_manager` | yes | yes | yes | Company-wide; Released/controlled writes additionally require existing `post_release_change`. |
| `pdm_admin` | yes | yes | yes | Company-wide; lifecycle authority still applies. |
| `system_admin` | yes | yes | yes | Company-wide; lifecycle authority still applies. |
| `document_admin`, `qa`, `manufacturing`, `procurement`, `external_specialist` | no | no | no | Existing `numbering.drawings.view` may show formal values/evidence summary only, never the editable recognition session. |

The exact codes are `numbering.recognition.run`, `numbering.recognition.review` and `numbering.recognition.formalize`. Auto-enqueue runs as server-internal work only after an authorized upload/submission; it records the initiating actor but does not grant that actor review/formalize authority. Session GET requires `review`; a formal-value evidence-summary projection may use existing drawing view permission and must redact raw OCR/decision payloads.

## 27. Feature Flag And Configuration

- Add `DRAWING_RECOGNITION_V1_FLAG = 'PDM_DRAWING_RECOGNITION_V1'` and status helper to `src/lib/number-state-flow-feature.ts`.
- Enabled only when requested truthy and `isUnifiedDrawingWorkbenchV1Enabled(env)` is true. Default is `false` in `.env.example`.
- Flag off means: no auto-enqueue, routes return feature-disabled/404 according to current convention, no navigation/CTA, and existing upload/revision behavior is unchanged. Existing additive data remains readable only through admin/diagnostic tooling.
- Add `.env.example` placeholders for `PDM_DRAWING_RECOGNITION_WORKER_TOKEN`, `PDM_DRAWING_RECOGNITION_WORKER_BASE_URL`, `PDM_DRAWING_RECOGNITION_OCR_CMD`, `PDM_DRAWING_RECOGNITION_OCR_ARGS` and bounded timeout/attempt settings. No secret value enters git or client bundles.

## 28. UI Implementation Contract

Implemented page/components:

- `src/app/numbering/recognition/[sessionId]/page.tsx`.
- `src/components/drawing-recognition-review.tsx` — one scroll surface with six continuous sections, sticky anchor navigator, protected evidence drawer and lightweight actual-change modal. The drawer/modal remain colocated because they share session state and no second page/domain authority is introduced.
- `src/components/drawing-recognition-status-chip.tsx` — latest-session state and review entry.
- `src/components/drawing-recognition-pre-submit-panel.tsx` — existing revision workbench's attachment-area entry; starts a `drawing_number` session for the currently selected file assets before submit, shows source count and stale-selection warning, and links to the same review page.
- `src/app/numbering/revisions/page.tsx` — render the pre-submit entry beside the controlled attachment list; after a successful submission, the same status/link remains available as a post-submit recovery path.
- `scripts/start-localhost-3000.ps1` — local development startup owns the recognition worker lifecycle and shares the token with the app, so a queued pre-submit session is actually claimed during local verification.
- `src/components/drawing-recognition-status-chip.tsx` / latest-session API — compare the latest session's `sourceAssetIds` with the current attachment selection before showing a status/link; a different historical source set is shown as not started rather than being presented as the current result.
- `src/components/drawing-workbench.tsx` — latest status chip and `核對辨識結果` entry in drawing data maintenance.
- `src/lib/number-lifecycle-simplification.ts` and `src/lib/drawing-revision-packages-async.ts` — retain enqueue after successful source persistence as fallback; recognition failure remains a warning and cannot fail the upload/package command.
- `src/lib/repositories/drawing-recognition-async-repository.ts` — resolves `drawing_number` context to the existing drawing and selected canonical master attachments without creating a formal revision.
- `src/app/globals.css` — scoped styles only; no parallel page theme.

Review actions save to the server after each explicit row/section action. Current Phase intentionally has no client-side offline queue: a successful response is the saved authority, a failed response remains visibly retryable, and reload restores only server-saved decisions. At 390px, impact rows become labelled cards while all target, field, current value and intended value remain visible. Modal Escape, Tab focus containment and trigger-focus return are browser-verified. Color is never the only state signal.

## 29. Phase Plan And Exact Test Files

| Phase | Deliverable | Required evidence |
|---|---|---|
| 1A | contract, schema 033, local apply/dry-run, repository, permission/flag defaults | `scripts/qc-dev-068-schema.mjs`, `scripts/qc-dev-068-contract.mjs`, SQLite fresh/existing + disposable PostgreSQL |
| 1B | automatic enqueue, adapter runner, worker claim/heartbeat/complete, partial/retry boundary | `scripts/run-drawing-recognition-worker.mjs`, contract QC and authenticated browser worker flow |
| 1C | six-section API/UI, baseline/variant projection, evidence drawer, focus/review recovery | `scripts/qc-dev-068-browser.mjs`, real Next API/browser at 1440 and 390 plus zero-overflow/focus assertions |
| 1D | impact token, atomic formalization, legacy field adapter, A0005 isolated pilot | `scripts/qc-dev-068-a0005-core.mjs`, stale target/idempotency/rollback/open-field/missing-value cases |

Implemented package scripts are `db:dev-068:local-schema`, `recognition:worker`, `qc:dev-068:schema`, `qc:dev-068:contract`, `qc:dev-068:a0005-core`, `qc:dev-068:browser` and aggregate `qc:dev-068`.

## 30. Readiness Risk Closure

| Risk | Severity | Resolution / remaining gate |
|---|---|---|
| OCR/CAD becomes formal authority | P0 | Closed: observation/candidate only; human command and target recheck are mandatory. |
| Dynamic field schema fragments database | P1 | Closed: company field dictionary + normalized value rows; no dynamic columns. |
| Cross-company asset/evidence leak | P0 | Closed at contract: every source and target resolves through owning context and company before read/write; negative QA required. |
| Partial or duplicate formal writes | P0 | Closed at contract: one DB transaction + platform command receipt + deterministic lock order + stale fingerprints. |
| A0005 expected result is invented or unstable | P1 | Closed: canonical file hashes, relation IDs and existing formal values are recorded in a fixture manifest; raw OCR accuracy is not claimed. |
| Browser OCR assets or runtime drift | P1 release capability | Closed locally：PDF.js／Tesseract.js／chi_tra＋eng皆pin版本與hash，版本目錄每次精確重建且不得含manifest外殘留；production representative accuracy與裝置P95仍是release gate。 |
| Local/production schema diverges | P1 | Closed at contract: SQLite baseline/apply + PostgreSQL 033 + parity/concurrency tests; production apply remains separately gated. |

Final assessment: `Local RD Implemented / Focused QA-QC Passed`. No P0/P1 implementation blocker remains inside the authorized local slice. RD must stop if the next step requires live provider purchase/license, production/staging files or credentials, a non-atomic formal target, a new canonical identity authority, production migration/deploy/release, or a departure from the same-page human review decision.

## 31. Implementation And Spec Drift Audit

Implemented and verified on 2026-08-12:

- candidate/evidence/formal master model across 14 additive tables in SQLite and PostgreSQL 033;
- default-off feature flag, three recognition permissions, company/session scope and worker bearer-token boundary;
- canonical-source dedup/supersession, 2-second quiet window, claim/heartbeat/complete and provider-neutral versioned JSON adapter process with `shell:false` and bounded retry;
- one-page six-section review, A0005 P01/P02/P03 baseline/variant projection, protected evidence detail, responsive impact preview and explicit formalization action;
- open OCR field mapped to governed stable key without dynamic DB columns;
- missing value cannot remove a formal value; explicit N/A requires a human reason;
- one transactional/idempotent formalization event with stale-target guard, append-only decision/evidence audit and forced-failure rollback.

Intentional implementation simplifications accepted by this audit:

- route is `/numbering/recognition/[sessionId]` rather than nesting under `/numbering/drawings`; the drawing workbench still owns the entry point;
- evidence drawer and impact modal are internal regions of the single review component, not separate authority-bearing components;
- decisions use explicit server round trips rather than a sessionStorage/offline queue; no unsaved client state is represented as PDM truth.

Remaining release/extended-matrix gates, not local PASS claims:

- production representative PDF/CAD gold set、device/network P95，以及對應license/security/cost acceptance；local browser OCR與real A0002 native reader已通過，不再列為「provider未實作」；
- production object download/worker topology, monitoring and production migration/deployment/rollback;
- full existing PostgreSQL migration chain currently has pre-existing migration 004 drift (`approval_rules.phase`) outside DEV-068; PostgreSQL 001 + 033 was verified in a disposable cluster;
- production/distributed concurrency and the full actor/browser matrix in DRR-001～060 remain release evidence. Focused local QA/QC covers the implemented critical path and safety invariants, not provider quality or production readiness.

## 32. DEV-079 Part-owner Invariant And Reconciliation（2026-08-27 CAPA replacement）

Spec Impact：`Intentional replacement / schema + reconciliation + read-purity contract`。本節完整取代先前以 non-terminal projection GET self-heal 作永久控制、並宣稱 `no schema／no migration／no backfill` 的相容性修正。既有 focused evidence 保留為歷史證據，但不得再支持 recurrence closure。

### 32.1 Canonical owner resolver

- Part owner 的 authority 是同 company、同 exact Drawing work 的有效關聯集合：正式層以 `drawings.formal_drawing_number_id → drawing_part_links → part_numbers`；草稿層以同一 `workspace_id` 的 `numbering_draft_parts → active number_candidate_reservations`。正式與草稿若候選碼相同，視為同一 logical Part，並優先使用正式 master ID。
- resolver 回傳明確 discriminated union：`resolved(ownerId, logicalPartNumber, evidence)`、`unresolved(reason)`、`ambiguous(candidateOwnerIds, logicalPartNumbers)`；nullable owner 不是 resolution state。
- server native、browser PDF、retry、import 與未來 adapter 均須在 candidate group key 與 INSERT 之前呼叫同一 resolver。adapter 提供的 owner 只能作 anchor；repository 必須重驗其 same-company、exact-work relation與有效狀態。無 anchor 時只有一個 logical Part 才可自動解析；0 或 >1 一律 fail closed。
- `.SLDPRT` 與 `.SLDASM` 都可以依 exact Part number/configuration anchor 解析；不得用檔名根號、候選順序、confidence 或畫面第一筆料號猜測。
- canonical candidate key 以 canonical category／field／normalized value／applicability scope／resolved owner 建立。相同 native＋PDF observation 必須落在同一 candidate aggregate；raw observations維持 immutable 並各自連結到 aggregate。

### 32.2 Accepted-state invariant

- 對 `proposed_owner_type='part_number'`、非空 `proposed_value` 的 candidate，`review_state IN ('accepted','corrected','mapped')` 必須同時滿足：owner 非空、同 company、屬同 exact Drawing work、且正式 Part 非 `Obsolete／Merged／MainDrawingInvalid` 或草稿 reservation 為 active。
- `saveDecisions` 的 accept／correct／map／create／reassign／set-baseline，以及 impact／formalize boundary，都必須在同一 transaction 內重新解析與驗證 owner、relation、company與 rowVersion。缺 owner 回 `422 RECOGNITION_PART_OWNER_REQUIRED`；無效、跨公司或非該 work 關聯回 `422 RECOGNITION_PART_OWNER_INVALID`；多 owner 且無 exact anchor 回 `422 RECOGNITION_PART_OWNER_AMBIGUOUS`。
- SQLite fresh schema 與 PostgreSQL migration 必須各有 provider-safe INSERT／UPDATE trigger 作最後防線；直接 SQL、舊 command 或新 adapter 不得繞過 invariant。資料層錯誤碼固定為 `RECOGNITION_PART_OWNER_INVARIANT`。
- ignored／deferred／blocked／proposed 可保留 unresolved evidence；terminal／formalized session 的歷史資料不得被自動改寫。任何 invalid formal intent 都必須在 impact 階段以 blocker fail closed。

### 32.3 Explicit reconciliation and GET purity

- owner reconciliation 是顯式、可審計的 operation，不是 GET 副作用。runner 至少支援 `inventory`、`dry-run`、`apply`；預設為 read-only。SQLite schema apply與data apply都需exact database target、candidate fingerprint、review-request snapshot fingerprint及human confirmation；data apply另需idempotency key。任一fingerprint drift必須在transaction前零寫入停止。
- inventory 依 company／session／drawing／field／review state／terminal status／resolution分類；dry-run只對 exactly-one owner產生 plan，0／>1／invalid／cross-company／terminal列入 unresolved disposition。A0002 legacy v1 review request的 snapshot/hash不得改寫。
- apply 必須保存 immutable manifest、before/after row values、resolver evidence、pre/post fingerprint、FK check、exact delta與 rollback SQL/artifact；重跑同一 idempotency key為零 business delta。primary、staging、production apply均為 human gate。
- `getProjection`、review package reader與 reviewer detail 的正常 GET 必須 zero-write；重複讀取前後 candidate rowVersion、decision/event audit、business hash與 FK inventory完全一致。先前 `assignUniquePartOwner` read repair 必須移除，不保留隱藏 feature flag。

### 32.4 Canonical projection and immutable review dependency

- UI 只消費 repository 投影的 `ownerResolution／effectiveOwnerId／blockingReason`；raw candidate members只能供稽核展開，不得自行決定第一層「需指定料號」。
- owner缺失是欄位錯誤：就地紅框／紅字／圖示／原因，加上 `aria-invalid=true` 與 `aria-describedby`；不得顯示無法解決 owner 的全域「重新辨識」入口。
- Drawing submission readiness 仍只由必要 2D／3D 與既有 lifecycle 規則決定；recognition unresolved 不得偽裝成檔案缺失 gate。若 recognition 是本次送審 decision basis，DEV-101 v2 package必須保存完整 versioned projection與 inner hash。
- reviewer 主畫面只讀已驗 hash 的 submitted projection；不得讀 latest/live recognition 回填。legacy v1 若缺 exact recognition basis，必須明確標示並走退回／重新送審，不做 silent backfill。

### 32.5 Fixed verification denominator

- DEV-079 QA 固定保留 QA-079-01～29，並新增 QA-079-30～42：跨 adapter resolver、exact duplicate aggregate、0／1／>1與 invalid owner、command＋DB mutants、inventory/dry-run/apply/idempotency、terminal immutability、GET zero-write、SQLite／PostgreSQL parity、A0002 disposition與 primary invariant。
- DEV-101 固定 QA-101-001～048；editor pre-submit projection hash、package inner hash與 reviewer renderer input 必須相等，重跑 recognition 不改變 submitted decision basis。
- focused RD runner 不得升格為 Independent QC。QA/QC manifest必須列出完整固定 case registry、NOT_RUN／PASS／FAIL、mutation sensitivity、runtime ownership與 cleanup evidence。

### 32.6 Production recurrence and release gate

- release artifact 必須包含 PostgreSQL invariant migration、reconciliation runner、DEV-079/101 fixed QA gates與 rollback runbook；CI/build只能證明 artifact readiness，不等於 production schema/data已套用。
- production 先做 read-only inventory與 backup/fingerprint；schema migration、data apply、`PDM_REVIEW_PACKAGE_V2_WRITE` activation、deploy、traffic promotion均需各自明確 human authorization。任何未解釋 ownerless accepted／terminal/formalized inventory都阻擋 promotion。
- zero-traffic candidate 必須回讀 `PDM_DRAWING_RECOGNITION_V1=true` 與 `PDM_REVIEW_PACKAGE_V2_WRITE=true`，再以正常登入流程建立、從 inbox 開啟並核對一筆新 v2 request；script-local env 不算 actual runtime evidence。
- production candidate、Level 4、Wave 0、product-owner go/no-go與 rollback readiness全數通過後，才可宣告「正式部署後 recurrence control effective」。本節不構成部署或資料修復授權。

## 33. DEV-107 RD Contract Amendment — 智慧辨識內嵌一鍵寫入與送審前再編輯

### 33.1 Authority、成熟度與取代範圍

Status：`RD Implemented Locally / Human Confirmed / Local QA-QC Complete 38/38 PASS / Production Release Gated`；exact implementation authority與最新證據由§34補完，正式migration／activation／deploy／release仍另走既有閘門。

本節是 DEV-107 Current Phase 的產品與跨層行為權威。決策來源為使用者 2026-08-31 對實際智慧辨識、獨立核對頁與料號資料畫面的確認：正常工作不再離開 Drawing canonical workspace；安全情境在`智慧辨識`分頁點一次`確認寫入 PDM`即完成，寫入後在送審前可由`編輯`建立受控修正。

Spec Impact：`Intentional replacement + compatible preservation`。

- `Intentional replacement`：取代 §1 決策 10～11、§2 的獨立impact gate流程、§10 的`確認寫入內容`＋modal、§15.1 案例 8～10、§28 的獨立review page／status-chip正式入口，以及任何要求從embedded panel導向`/numbering/recognition/[sessionId]`完成核對或寫入的 Current Phase placement。
- `Compatible preservation`：保留 source/session/observation/candidate、append-only decision與event、owner invariant、zero-write impact、impact token、server recompute、permission／company、target fingerprint、idempotency、atomic formalization、Part正式投影、DEV-101 immutable submitted snapshot及既有Drawing submission／approval／release authority。
- §14「formalized session唯讀、修正建立successor」仍有效；本節只把pre-submit successor的建立、取消、再次寫入與UI狀態固定為可用產品流程。
- ADR=`New ADR Required and Accepted`：`ADR-PDM-DRAWING-RECOGNITION-AMENDMENT-LINEAGE-001`固定purpose／evidence-origin overlay、single synchronized commit、global lock order及exact formalized snapshot；data owner、formal writer、permission codes與approval authority仍不新增第二套。

### 33.2 UX Intent And UI Entry Contract

Target actor是持有`numbering.recognition.review`的Drawing work owner／受指派操作者，以及具有同公司範圍的RD主管／PDM管理者。正常起點固定為`/numbering/drawings/[drawingId]/workspace`；主要工作物件是目前Drawing work綁定的exact recognition session與其對應Part候選，唯一正式寫入主動作位於右側`智慧辨識`分頁。

Current Phase可見介面只保留：

- 既有候選欄位與證據定位、靠近候選區的寫入狀態，以及依狀態唯一出現的`確認寫入 PDM`或`更新寫入 PDM`；不增加另一個主要`儲存核對`步驟。
- 成功寫入後一個`已寫入 PDM`狀態與次要`編輯`；no-op使用`PDM 已是最新`。兩者都不等於已送審、已核准或已發布。
- blocker只在受影響欄位或同一寫入狀態區顯示最短原因與恢復動作；排除摘要只顯示數量與`evidence-only／未接受／未映射或未歸屬／不支援`分類，不重複完整候選表。

預設刪除獨立完整核對頁、正式寫入impact modal、第二次確認、重複寫入前後值表、正常成功說明卡與Part頁的第二個寫入入口。移除後唯一不可省略的風險訊號是：未解intended-write blocker、stale、權限拒絕、寫入失敗、dirty與submission lock；其餘以按鈕disabled／busy、欄位狀態與內容readback表達。

Legacy entry contract：

- `/numbering/recognition/[sessionId]`保留為redirect-only相容route，不再mount review／impact／formalize UI或任何command owner。
- server先依company／object visibility解析session；成功後以history replace導向exact `/numbering/drawings/[drawingId]/workspace`，帶入bounded `recognitionSession` focus intent與既有allowlisted `returnTo`，最後定位`智慧辨識`區。invalid、cross-company、無drawing/workspace或不合法return target安全404／fallback，不得猜第一筆Drawing。
- Current Phase不設定自動退役日期；只有future explicit retirement DEV證明source/runtime caller=0、bookmark/support需求可接受且沒有review/recovery依賴後，才可移除redirect。正常navigation與status chip立即停止產生舊URL。

### 33.3 Derived UI State And Submission Gate

不新增database status enum。UI狀態由既有session status、rowVersion、latest server decisions、write-impact與Drawing lifecycle投影得到；不得以client布林值冒充server truth。

| Derived state | 可見狀態 | 動作／規則 |
|---|---|---|
| no session／feature off／no eligible result | 無額外寫入狀態 | 不新增 recognition submission gate；沿用Drawing既有資格 |
| `queued／extracting` | `辨識處理中` | 無寫入動作；不因OCR處理本身阻擋送審 |
| local review input changed | `有未寫入修改` | 單一commit intent保存＋重算＋同步；離頁與送審由unsaved guard阻擋 |
| saved decision正在preflight | `正在檢查寫入內容` | 寫入disabled；只有存在saved intended write時暫時阻擋送審 |
| `changes>0`、blockers=0、非post-release | `待寫入 PDM` | 唯一primary=`確認寫入 PDM`；送審阻擋 |
| accepted intended、`changes=0`、blockers=0 | commit建立`appliedCount=0`同步event並formalize後顯示`PDM 已是最新` | Part／link零寫入；完成同步後送審可用，欄位仍可核對修正 |
| intended-write blocker／stale | `無法寫入 PDM` | 就地修正、重新檢查或明確改為defer／ignore；送審阻擋 |
| commit pending | `正在寫入 PDM` | 所有重複寫入控制disabled |
| current session `formalized` | `已寫入 PDM` | 欄位read-only；送審前顯示次要`編輯` |
| open amendment differs from last event | `有未寫入修改` | primary=`更新寫入 PDM`、secondary=`取消編輯`；送審阻擋 |
| submitted／in review | 既有Drawing review狀態 | recognition edit／write省略或鎖定；reviewer只讀immutable snapshot |

Submission guard的精確邊界：

1. Recognition不是一般hard gate。沒有session、處理中、extraction failed、只有proposed／ignored／deferred／unclassified／identity或engineering evidence、沒有accepted/corrected/mapped intended write時，不得阻擋既有Drawing submit。
2. current exact source只要有accepted／corrected／mapped決策且latest leaf尚未formalized，UI與Drawing submit command都必須阻擋，不論其impact為positive、zero delta或blocker；直到single commit建立positive／zero-change同步event，或使用者明確defer／ignore移除寫入意圖。
3. Browser-local dirty只由UI unsaved guard處理；server submit不能看到未送出的記憶體值。對已保存decision，submit transaction必須依exact Drawing work、current source fingerprint與latest non-terminal session重算bounded recognition readiness，不能只信任client `submitReady`。
4. preflight／submit guard只讀既有recognition與formal target，不建立session、decision、event或master write。guard出錯時，已保存的intended write採fail closed並回可理解錯誤；recognition完全不適用時不得因查詢失敗製造假gate。
5. submission成功後鎖定edit／formalize；`return_for_correction`回到owner handling後，若current source與target仍有效可重新進入amendment。Approved／Released情境由既有change/revision flow處理，不從本panel直接寫入。

### 33.4 Background Preflight And One-click Formalization

- 只有session可review、沒有browser-local dirty、decision save成功且rowVersion穩定時，client才自動呼叫既有`POST .../write-impact`。相同`sessionId + rowVersion`只保留最後一個in-flight請求；舊請求必須abort／忽略，response使用`private, no-store`。
- background impact只是advisory，綁定session、rowVersion與source／target fingerprints；不得放URL、localStorage、commit或submission authority。decision、source、target、actor scope或lifecycle改變即丟棄。
- 一次click以stable idempotency key＋draft hash呼叫新增commit endpoint。server同一serializable transaction保存current decisions、重驗Drawing／source／lineage／target、重算impact並formalize；client不得先PATCH decisions或使用impact token授權寫入。
- `changes>0 && blockers=0`才寫master／links＋positive event；accepted intended且`changes=0 && blockers=0`建立`appliedCount=0`event並formalize，Part／links零寫入。blocker／stale／error使decision與所有formal write一起rollback。
- `409`為零commit write並保留local draft；`422`定位blocker；`403`顯示無權限並隱藏危險重試；5xx／未知結果以同idempotency key＋draft hash readback／retry。任何錯誤都不得導航到舊頁或露出raw API／SQL／stack。
- `requiresPostReleaseChange=true`在DEV-107 embedded flow固定為`formal_change_required` blocker，提供既有canonical change flow入口；不顯示post-release reason textarea，也不以recognition formalize permission繞過生命周期。原formalize API的post-release guard保留供既有相容／管理流程，不成為本panel的Current Phase正常入口。

### 33.5 Pre-submit Amendment And Immutability Contract

`formalized` session、其decisions、event、links與evidence永遠不可編輯。送審前點`編輯`時，server以新增的`POST /api/numbering/recognition-sessions/:id/amendments`建立或冪等重用一個successor：

- Input：parent formalized session ID、expected parent rowVersion、client idempotency key。只有目前Drawing work仍為owner／returned、source set與parent fingerprint一致、沒有active review，且actor具`numbering.recognition.review`時可建立。
- Output：`201`（建立或重用時皆回傳canonical readback），回傳`ready_to_formalize` successor、`supersedesSessionId`、parent event reference、同一immutable source/evidence lineage與以最後成功after values／目前正式target snapshot初始化的editable candidate projection。
- 同一 evidence-origin lineage 同時最多一個open amendment；併發create以deterministic deduplication key得到同一successor。source變更、target drift、submitted/reviewing、wrong parent或已有不同open successor回409且零PDM write。
- amendment只在candidate／decision層可變；raw observation、source geometry、confidence、extractor與舊event不複製。053新增`session_purpose`與`evidence_origin_session_id`：amendment繼承origin並只建立candidate overlay／links，partial unique index保證one-open；完整provider契約以§34.5與配對ADR為準。

編輯流程：

1. `編輯`建立／重用successor後解鎖可正式化candidate value；evidence-only與identity evidence保持read-only。
2. 欄位修改先保持為local draft；background preflight只對先前clean saved projection提供提示，PDM維持parent event的最後成功值。
3. `更新寫入 PDM`把current draft送入§33.4 single commit；成功產生positive或zero-change event並把successor標為formalized，Part／Drawing projection指向新event，舊event仍可追溯。
4. `取消編輯`呼叫新增的`POST /api/numbering/recognition-sessions/:id/cancel-amendment`，其中`:id`固定為open successor session ID，並帶expected successor rowVersion與idempotency key；只可取消未formalized且有合法formalized parent的open amendment。它把successor標為cancelled、零PDM write，畫面回到parent `已寫入 PDM`。unknown response依同key readback，不可由client假設已取消。
5. reload／back／tab切換讀到open amendment時恢復`有未寫入修改`與server-saved decisions；browser尚未保存的輸入仍由unsaved guard保護，不得被「已儲存」狀態掩蓋。

### 33.6 API、Permission And Data Impact

| Operation | Contract impact |
|---|---|
| GET session projection | 保留既有route；需能投影parent／open amendment、last formalization、derived write state與human-safe blocker，不暴露跨公司evidence。 |
| POST `:id/commit` | embedded唯一write intent；一次帶current decisions／expected rowVersion／draft hash，server同transaction保存、重驗、重算並formalize。 |
| PATCH decisions | 保留append-only compatibility／internal route；canonical panel不得用它拆分commit。 |
| POST write-impact | 保留zero-write advisory；embedded可背景呼叫，但response不授權commit且不要求完整change table UI。 |
| POST formalize | 保留compatibility／internal route；與commit共用同一master-writer domain authority及lock order，canonical panel不直接呼叫。 |
| POST `:id/amendments` | `:id`為formalized parent session；帶expected parent rowVersion與Idempotency-Key，由platform command建立／重用successor review draft，不寫PDM。 |
| POST `:id/cancel-amendment` | `:id`為open successor session；帶expected successor rowVersion與Idempotency-Key，由platform command只取消該amendment，不回滾parent event或PDM。 |
| Drawing work submit | 加入server-side saved-intent recognition readiness guard；不接受client gate布林值。 |
| `/numbering/recognition/[sessionId]` | 變成company-scoped redirect-only compatibility route；不得mount mutation UI。 |

Permission保持既有三碼：viewer無raw recognition；`review`可核對、建立／取消amendment；`formalize`才可執行初次或更新寫入。Manager／admin的company-wide scope不改；exact reviewer只讀submitted package，不能因review角色取得owner edit。所有new orchestration route都必須重驗company、Drawing work、session lineage、source／target scope與current lifecycle。

Data impact為`Additive schema / no Part-master model change`。Current Phase新增053 purpose／evidence-origin lineage與one-open partial unique index、commit／successor／cancel command、projection／snapshot／submit guard；既有append-only rows與formal event鏈仍是權威。Part頁只讀`pdm_part_attribute_values`及既有formal projection，顯示last event來源；不得新增Part端平行recognition writer。

### 33.7 Failure Recovery, Dependencies And Stop Conditions

Failure recovery：

- commit失敗保留browser draft並顯示欄位附近錯誤；decision／PDM／link／event零部分寫入。
- impact失敗不影響draft；commit未知結果先以idempotency receipt／session/event readback判斷，不能先重建amendment。
- source set變動回409並要求reload current lineage；禁止把舊draft blind apply到新檔案。cancel失敗時保持dirty與submit lock。
- Part投影readback失敗不得把session誤標已寫入；顯示同步結果未知並保留安全重試。
- legacy redirect解析失敗不猜測其他Drawing，也不把raw session ID／returnTo帶入錯誤頁。

Dependencies：DEV-068 formalization、DEV-079 canonical workspace／dirty guard、DEV-087 Drawing submit transaction、DEV-101 immutable review projection、DEV-083 Part formal projection均已存在；exact call sites、053 migration、origin overlay、single commit、snapshot selector、query budget與route/page retirement已由§34固定。

Stop and return to Dev PM if：

- 需要新Part／Drawing master writer、browser直寫、多交易partial formalization或修改既有formalized event／decision。
- 無法在SQLite／PostgreSQL以同一語意落實purpose／origin constraints、唯一open successor、global lock order、idempotent commit／cancel或server submit guard。
- 要讓recognition absence／processing／adapter failure全面阻擋Drawing submit，或反向允許saved intended changes繞過同步直接送審。
- 需要讓embedded panel直接改Approved／Released資料、弱化post-release authority，或變更DEV-101 submitted snapshot/hash。
- 需要超出053的schema／repair、production/staging資料、credential、deploy、release或既有primary資料repair。

### 33.8 Acceptance And Evidence Contract

Fixed Current Phase denominator為`QA-107-001..038`，定義於`.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md` §10。除normal delivery path外，必須涵蓋stale source／target零寫入、single commit exactly-once、purpose／origin overlay、lock race、accepted no-op audit、exact formalized snapshot、optional recognition non-gate、legacy cross-company fail closed、三viewport／keyboard／visible-error與Part readback。

UI證據必須從正常`/numbering/drawings`入口進入exact Drawing workspace，完成核對→背景preflight→一次寫入→Part readback→編輯→更新／取消→submit gate；direct URL只可補充legacy redirect，不得取代入口可發現性。API／DB證據另證明zero-write impact、provider parity、atomicity、event lineage、permission／company與primary invariant。任何舊DEV-068 impact modal PASS只能作歷史回歸證據，不得冒充DEV-107新入口／無modal契約已通過。

### 33.9 Current Phase Handoff And Execution Boundary

本節原handoff已由§34的RD-supervisor-corrected Implementation Readiness Package完成並取代：current repository／Next.js guide、exact inventory、053 migration、purpose／origin overlay、single commit、source／lock／snapshot contract、legacy route、dirty ledger、固定runner／manifest及P0/P1 audit均已凍結。DEV-107現已進入`RD Implemented Locally`；107-A～D與完整provider／repository／browser evidence均已完成，aggregate封存於`output/qa/dev-107/DEV107-aggregate-2026-08-31T06-54-27-649Z/manifest.json`，QC receipt為`.ai-doc/qc/qc-dev-107-local-completion-2026-08-31.md`。

Execution Boundary：本輪已修改DEV-107產品／測試契約、SQLite schema／initializer與PostgreSQL 053 migration，並完成task-owned隔離驗證；未修改primary data、未stage／commit／merge／PR、未deploy或release。

## 34. DEV-107 RD Implementation Readiness Package — 2026-08-31

### 34.1 Readiness Result、authority與效用選擇

Readiness result=`PASS after RD supervisor correction`；本節目前狀態為`RD Implemented Locally / Human Confirmed / Local QA-QC Complete 38/38 PASS / Production Release Gated`。本節是DEV-107 Current Phase的exact implementation authority；與§33或本節較早內容有差異時，以本節2026-08-31 supervisor correction及`ADR-PDM-DRAWING-RECOGNITION-AMENDMENT-LINEAGE-001`為準。原`migration=none`、deep evidence clone、client多命令串接、no-op無event與review snapshot no-change判定已撤回；local產品、資料契約與完整repository／PostgreSQL／browser證據均已落地，正式發布仍未宣稱完成。

效用選擇固定如下：

- 正常使用只保留canonical Drawing workspace的`智慧辨識`panel；不保留第二個工作台、impact table或confirmation modal。
- 使用者的單一承諾動作是真正的`確認寫入 PDM`／`更新寫入 PDM`。同一手勢只送出一個server commit intent；server在同一serializable command內保存draft decisions、重驗source／target、重算impact並正式同步。不得由client串接PATCH／impact／formalize形成半完成狀態。
- background write-impact只對clean saved projection提供零寫入提示；commit永遠重算，不信任client或舊impact token。stale、blocker、權限或任一步驟失敗時整個commit rollback，client保留local draft並顯示可處理原因。
- 已接受／修正／映射的intended data即使`changes=0 && blockers=0`，同一次commit仍建立exactly-once、`appliedCount=0`的同步事件並把session關閉為`formalized`；不寫Part master／link，UI顯示`PDM 已是最新`。完全沒有accepted intended data才不建立event且不得成為送審gate。
- 已寫入且尚未送審才顯示次要`編輯`。它建立不可變parent的successor amendment；取消只取消successor，不回滾最後一次成功的PDM值。
- embedded flow不接收`post_release_change`理由。只要impact回`requiresPostReleaseChange=true`，panel顯示`需走正式變更`並導向既有change／new revision入口；不得在精簡流程放寬Approved／Released authority。

### 34.2 Current Repository And Next.js 16.3.0 Audit

Repository head at readiness audit=`91de270c3a644dfbcbee49ed255b3c18e13df9dd`，branch=`持續優化2`，package的Next.js=`16.3.0`。依專案`AGENTS.md`已完整閱讀本機版本文件：

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/02-guides/redirecting.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`

Implementation constraints：

1. 新mutation維持App Router `route.ts`、`POST`、`runtime="nodejs"`與`private, no-store`；每個route本身重新驗證authentication、action permission、company與resource scope，不能信任page或client狀態。
2. legacy page維持Server Component並使用`redirect()`；`redirect()`置於`try/catch`外。page只做server-side access／target resolution與轉址，不render loading shell或舊Client Component。
3. DB、permission、session lineage與canonical target resolution都留在server-only service／repository；Client Component只接收最小projection並管理輸入、AbortController、focus與可見狀態。
4. `params`、`searchParams`與`returnTo`一律視為不可信輸入。session ID先走`requireSafeRecognitionId`；return target只能是server計算出的same-company exact Drawing workspace，輸入的`returnTo`只有與該target相同時才保留，否則忽略。
5. expected errors回typed HTTP result並由event handler捕捉為可見文字；不把raw SQL、stack或內部ID lineage暴露給使用者。E2E以production build／task-owned server執行，三viewport與keyboard都由正常入口到達。

### 34.3 Exact Add／Modify／Delete／No-change Inventory

| Disposition | Exact file | Exact responsibility／symbol |
|---|---|---|
| Modify | `src/components/drawing-recognition-workspace-panel.tsx` | `DrawingRecognitionWorkspacePanel`；唯一mutation controller改呼叫server `commit` intent，不串接PATCH／impact／formalize；加入background preflight latest-wins、stable attempt key、`beginAmendment`、`cancelAmendment`、inline reason／status與formalized read-only projection。 |
| Modify | `src/components/canonical-drawing-change-workspace.tsx` | `CanonicalDrawingChangeWorkspace`、`ownerCommand("submit")`、`submitReady`；接收panel的local dirty／server write-block projection，footer就地顯示原因，submit成功前仍由server命令重驗。 |
| Modify | `src/app/globals.css` | 只新增／收斂`dev079-recognition-*`的write state、secondary edit／cancel、visible error、focus、390px及`prefers-reduced-motion`樣式；不得再建立modal或框中框。 |
| Modify | `src/lib/drawing-recognition-contract.ts` | 新增`sessionPurpose`、`evidenceOriginSessionId`、amendment／commit／write-control DTO、唯一derived phase enum與本節typed errors；DB session status只增加purpose/origin欄位，不另造重複UI status authority。 |
| Modify | `src/lib/drawing-recognition-review-projection.ts` | 由evidence origin解析source／observation，再疊加current candidate／decision；projection只外送最小`writeControl` lineage／lifecycle欄位。 |
| Modify | `src/lib/drawing-recognition.ts` | 新增`commitDrawingRecognitionToPdm`、`createDrawingRecognitionAmendment`、`cancelDrawingRecognitionAmendment`、`getDrawingRecognitionWriteControl`、`assertCurrentRecognitionSourceSet`與`assertDrawingRecognitionSubmissionReady`；所有mutation走platform receipt＋outbox。 |
| Modify | `src/lib/repositories/drawing-recognition-async-repository.ts` | purpose／origin overlay repository、open-amendment uniqueness、commit authority、current-source assertion、snapshot selector與submission guard；禁止raw evidence clone及per-observation insert loop。 |
| Modify | `src/app/api/numbering/recognition-sessions/route.ts`、`src/app/api/numbering/recognition-sessions/[sessionId]/reruns/route.ts` | create／rerun寫入正確purpose／origin並遵循全域Drawing→source→lineage lock order。 |
| Modify | `src/app/api/numbering/recognition-sessions/[sessionId]/route.ts` | GET projection加入最小`writeControl`，維持action／company／owner檢查與no-store。 |
| Add | `src/app/api/numbering/recognition-sessions/[sessionId]/commit/route.ts` | embedded唯一commit endpoint；同一serializable transaction套用draft decisions、重驗source／target、重算impact並formalize或建立zero-change synchronization event。 |
| Add | `src/app/api/numbering/recognition-sessions/[sessionId]/amendments/route.ts` | formalized parent建立／重用open successor。 |
| Add | `src/app/api/numbering/recognition-sessions/[sessionId]/cancel-amendment/route.ts` | open successor cancellation；zero PDM write。 |
| Modify | `src/app/api/numbering/recognition-sessions/[sessionId]/decisions/route.ts`、`write-impact/route.ts`、`formalize/route.ts` | compatibility／internal endpoints仍逐支驗證current source；embedded UI不直接使用其mutation串接。formalize與commit共用同一master-writer domain authority。 |
| Modify | `src/lib/drawing-revision-work.ts` | `DrawingRevisionWorkService.submit`在locked work與mutation-basis驗證後、任何payload／review／lifecycle write前呼叫server submission guard。 |
| Modify | `src/lib/drawing-recognition-review-snapshot.ts`、`src/lib/pdm-review-package.ts` | submitted package只選same company／revision／exact current source fingerprint的latest `formalized` leaf；忽略processing、failed、open／cancelled amendment及wrong fingerprint，並經origin overlay解析immutable evidence。 |
| Modify | `db/schema.sql`、`src/lib/db.ts` | 新增`session_purpose`、`evidence_origin_session_id`、constraints／trigger／partial unique index；`ensureDev107DrawingRecognitionLineageSchema`以additive、idempotent方式處理既有SQLite。 |
| Add | `db/postgres/053_drawing_recognition_amendment_lineage.sql` | PostgreSQL additive migration、backfill、FK／check／immutability與one-open-amendment partial unique index。 |
| Modify | `db/postgres/README.md` | 登錄053順序、preflight、apply／rollback與provider parity要求。 |
| Add | `scripts/qc-dev-107-migration.mjs` | provider-aware dry-run／apply／verify rehearsal；SQLite copy與disposable PostgreSQL，禁止primary自動repair。 |
| Add | `src/lib/drawing-recognition-legacy-redirect.ts` | `server-only` resolver：驗證actor／company／session，解析exact current Drawing work URL並只接受同一target的safe `returnTo`。 |
| Modify | `src/app/numbering/recognition/[sessionId]/page.tsx` | 改為async Server Component redirect-only；401依既有login return flow，403／404／cross-company fail closed，不render舊頁。 |
| Delete | `src/components/drawing-recognition-review.tsx` | 等panel parity與`rg` caller=0後移除舊獨立工作台；刪除前先依§34.11保全目前dirty hunk。 |
| Delete | `src/components/drawing-recognition-review.module.css` | 隨唯一consumer刪除；不得把舊modal CSS搬進global。 |
| Modify | `package.json` | 加入`qc:dev-107:contract／repository／postgres／migration／browser`與aggregate `qc:dev-107`。 |
| Add | `scripts/qc-dev-107-contract.mjs` | 固定QA-107-001..008。 |
| Add | `scripts/qc-dev-107-repository.mjs` | 固定QA-107-009..019、021..026、033..035、037..038，task-owned SQLite。 |
| Add | `scripts/qc-dev-107-postgres.mjs` | 固定QA-107-020，disposable PostgreSQL concurrency parity。 |
| Add | `scripts/qc-dev-107-migration.mjs` | 固定QA-107-036；SQLite copy＋disposable PostgreSQL migration／backfill／constraint parity。 |
| Add | `scripts/qc-dev-107-browser.mjs` | 固定QA-107-027..032，normal entry、Part readback、三viewport／keyboard與cleanup。 |
| Add | `scripts/qc-dev-107-aggregate.mjs` | exact 38-case denominator、affected regression、source／primary invariant、cleanup與completionCandidate。 |
| No change | `src/lib/db-async-provider.ts` | 直接使用現有SQLite `BEGIN IMMEDIATE` queue與PostgreSQL serializable 3次`40001／40P01` retry。 |

清單是Current Phase完整source contract。若RD發現需要第二個master writer、新permission／lifecycle／approval authority、persistent client draft、超出053的資料修復，或無法在origin overlay下維持immutable submitted evidence，立即停止並回Dev PM／ADR；不得以實作便利擴張。

Implementation reconciliation（2026-08-31）：本輪已落地的實際範圍為panel、recognition service／repository、commit／amendment／cancel routes、Drawing submit guard、snapshot／package selector、legacy redirect、SQLite initializer、PostgreSQL 053與五支child runner＋aggregate。`canonical-drawing-change-workspace.tsx`／global CSS未新增平行辨識writer；舊review component保留為相容邊界並由legacy route redirect-only保護，不成為Current Phase mutation owner。最新aggregate已完成repository／PostgreSQL／browser child evidence與affected regressions，未以不存在的檔案或runner宣稱完成。

### 34.4 One-gesture Client Orchestration And Derived State

`DrawingRecognitionWorkspacePanel`固定使用一個write intent controller：

1. 每次session／rowVersion／draft變動都abort舊impact request並丟棄不匹配response；background preflight只對clean saved projection執行。
   preflight未完成或暫時失敗不得迫使使用者前往別頁或多按一次；只要client必填／permission／lifecycle guard允許，commit CTA仍可送出，由server做完整判定。只有與current fingerprint綁定的明確blocker可就地disabled並提供修正入口。
2. 初次或amendment有dirty時，主要按鈕仍只有`確認寫入 PDM`／`更新寫入 PDM`。click把pure decision draft、`expectedRowVersion`及stable `Idempotency-Key`一次送到commit endpoint；server command receipt以canonical decision draft產生並綁定`draftHash`，client不先PATCH，也不把background impact token當commit authority。
3. commit在server同一transaction內保存decision、重驗source／target並重算impact。`blockers>0`、stale、`requiresPostReleaseChange=true`或permission不足時整筆rollback；panel列出最多三個可行原因＋總數，焦點移到第一個可修正欄位或正式變更入口，本機draft仍在。
4. `changes=0 && blockers=0`仍由commit建立`appliedCount=0`同步event並formalize；`changes>0 && blockers=0`才寫Part／link及positive event。按鈕pending時disabled，double-click不產生第二個intent。
5. response loss不生成新key；先GET server projection／receipt-derived result，已formalized即投影`synchronized`，未formalized才以同key及同draft hash重試。只有成功、明確取消或使用者產生新draft才結束該key。
6. session formalized時欄位read-only；未送審且`writeControl.canAmend=true`顯示次要`編輯`。successor建立後切換到其projection；`取消編輯`若本機dirty，先在原action row展開inline `放棄本次修改／繼續編輯`防誤觸，再呼cancel endpoint，不開modal也不出現另一張工作台。

Current derived phase唯一enum=`idle | processing | reviewing | preflighting | ready_to_commit | committing | synchronized | editing | dirty | blocked | failed | locked`。source of truth固定為`server session/writeControl + latest advisory impact + local dirty`；client不得只靠舊notice或localStorage宣稱`synchronized`。

Visible mapping：`processing=辨識中`、`reviewing=待核對`、`preflighting=正在檢查寫入內容`、`ready_to_commit=待寫入 PDM`、`committing=正在寫入 PDM`、`synchronized(appliedCount>0)=已寫入 PDM`、`synchronized(appliedCount=0)=PDM 已是最新`、`editing=編輯中`、`dirty=有未寫入修改`、`blocked=無法寫入 PDM`、`failed=寫入失敗`；`locked`沿用Drawing lifecycle狀態。所有狀態有文字且顏色只作輔助；只在commit開始／成功／失敗與blocking recovery使用`aria-live`，不得讓每次background phase變動形成screen-reader噪音。

### 34.5 Successor Amendment Algorithm And Provider-safe Uniqueness

既有`supersedes_session_id`無法區分rerun與amendment；Current Phase採`ADR-PDM-DRAWING-RECOGNITION-AMENDMENT-LINEAGE-001`並執行additive 053 migration：

- `session_purpose TEXT NOT NULL CHECK IN ('recognition','rerun','amendment')`。
- `evidence_origin_session_id` same-company self FK，建立後不可變；`supersedes_session_id`建立後不可變（僅既有取消清理流程可在同一transaction先解除自參照再刪除）；legacy recognition／rerun可為NULL（有效origin按`COALESCE(origin,id)`解讀），amendment必須繼承parent origin。
- partial unique index保證`session_purpose='amendment'`且status為`queued | extracting | review_ready | extraction_partial | ready_to_formalize`時，每個`(company_id,evidence_origin_session_id)`最多一筆。
- legacy backfill只按既有事實分類：無parent=`recognition`、有parent=`rerun`、origin=`self`；不得猜成amendment。

Provider migration sequence固定：

1. 先建立task-owned backup／fingerprint與read-only preflight；orphan parent、duplicate open、cross-company lineage、foreign-key violation任一非零即停止。
2. PostgreSQL 053先加nullable columns、backfill、驗證，再設NOT NULL／FK／check／immutability trigger／partial unique index；transaction內任一步失敗全rollback。
3. SQLite canonical `db/schema.sql`對新資料庫使用NOT NULL／check／index；既有資料由`ensureDev107DrawingRecognitionLineageSchema`add columns、backfill並用insert／update triggers提供等價的origin existence、same-company、purpose-parent、origin inheritance與immutability約束。不得為補SQLite DDL限制而重建或清理primary table。
4. amendment的candidate-observation link所指observation必須屬於`evidence_origin_session_id`；recognition／rerun origin必須self，amendment parent必須formalized且origin與parent相同。service assertion與provider trigger雙層防線不得只留其一。
5. rehearsal以SQLite copy與disposable PostgreSQL執行dry-run→apply→idempotent reapply→verify→rollback simulation；production apply、down migration及primary repair均不在DEV-107本機實作授權內。

`createAmendment`必須在`executePdmCommandWithOutbox(..., serializable:true)`內執行：

1. 先依§34.7全域lock order取得Drawing work與current exact source set，再鎖recognition parent／lineage；驗證parent=`formalized`、purpose合法、是exact source fingerprint的current formalized leaf、Drawing仍pre-submit且actor有review能力。
2. 查open amendment；存在即回同一winner。若已有較新的formalized leaf或rerun／source變動，回`RECOGNITION_AMENDMENT_PARENT_NOT_CURRENT`；不得從歷史parent分叉。
3. 不存在時建立`session_purpose=amendment`、`evidence_origin_session_id=parent.evidence_origin_session_id`、status=`ready_to_formalize`的新session。deterministic dedup key＋partial unique index＋serializable retry保證單一winner；不排worker、不重新OCR。
4. 以set-based `INSERT ... SELECT`只複製current candidate overlay及candidate-observation links；source、adapter result、observation零新增。projection由origin讀immutable evidence，再疊加amendment candidate／decision。
5. candidate從parent最後有效欄位／owner／review state建立並刷新current formal value／fingerprint。parent decision／event不複製、不修改；successor的新人工修改才append新decision。
6. 任一overlay、refresh、receipt或outbox失敗整個rollback；不得留下半個successor，也不得有per-observation loop。

`cancelAmendment`同樣使用platform command receipt並遵循Drawing→source→lineage lock order：驗證expected rowVersion、current open leaf及pre-submit lifecycle；更新status=`cancelled`、`cancelled_at`與rowVersion，零master／formalization event／link write。相同key replay同receipt；不同key對已cancelled session回`alreadyCancelled=true`。取消後下一次編輯建立新successor，不能復活舊amendment。

Migration fail-closed preflight必須驗證orphan／cross-company origin、非法purpose、同parent多open amendment與foreign key violations全為零；SQLite copy與disposable PostgreSQL演練通過後才能進domain實作。provider migration失敗整筆rollback，不得自動修primary data。

### 34.6 Exact HTTP And Projection Contract

所有mutation request都帶`Idempotency-Key`、JSON body及現有company context；response帶`cache-control: private, no-store`。

| Endpoint | Request | Success | Authority／failure |
|---|---|---|---|
| `POST .../:sessionId/commit` | `{ expectedRowVersion, decisions }`＋stable `Idempotency-Key`（server依canonical decisions計算並綁定`draftHash`） | `200 { result:{ sessionId,eventId,appliedCount,status:"formalized" }, session }`；positive／zero-change共用 | `numbering.recognition.formalize`；同一serializable command保存decision、重驗current source／target、重算impact並原子同步。stale／blocker／失敗整筆rollback。embedded唯一write mutation。 |
| `POST .../:parentSessionId/amendments` | `{ expectedRowVersion }` | `201 { session, parentSessionId }`（同key replay讀回；open successor可重用） | `numbering.recognition.review`；platform receipt＋serializable transaction驗actor／company／owner／pre-submit。stale／非current／非formalized=`409`。 |
| `POST .../:successorSessionId/cancel-amendment` | `{ expectedRowVersion }` | `200 { session }` | `numbering.recognition.review`；platform receipt＋row-version；非open current leaf／review lock=`409`。 |
| existing `PATCH .../:sessionId/decisions` | `{ expectedRowVersion, decisions }` | 現有`{session}` | compatibility／internal；仍重驗current exact source。canonical panel不以它拆分commit。 |
| existing `POST .../:sessionId/write-impact` | `{ expectedRowVersion }` | 現有`{impact}` | zero-write advisory；只對clean saved projection，仍重驗source。不得作commit授權。 |
| existing `POST .../:sessionId/formalize` | `{ impactToken }` | 現有`{result}` | compatibility／internal；與commit共用domain writer與lock order。canonical panel不直接呼叫。 |

新增穩定error codes：

- `RECOGNITION_AMENDMENT_PARENT_NOT_FORMALIZED` `409`
- `RECOGNITION_AMENDMENT_PARENT_NOT_CURRENT` `409`
- `RECOGNITION_AMENDMENT_NOT_OPEN` `409`
- `RECOGNITION_AMENDMENT_LIFECYCLE_LOCKED` `409`
- `RECOGNITION_AMENDMENT_STALE` `409`
- `RECOGNITION_SOURCE_SET_CHANGED` `409`
- `RECOGNITION_COMMIT_STALE` `409`
- `RECOGNITION_COMMIT_BLOCKED` `422`
- `RECOGNITION_SUBMISSION_WRITE_PENDING` `422`
- `RECOGNITION_SUBMISSION_WRITE_BLOCKED` `422`

GET session的`writeControl`最小欄位固定為`sessionPurpose`、`evidenceOriginSessionId`、`parentSessionId`、`latestFormalizedSessionId`、`openAmendmentSessionId`、`formalizationEventId`、`appliedCount`、`canAmend`、`lockedReason`；impact counts仍只來自write-impact，不在GET重算整份impact。

Idempotency scope固定`companyId + actorId + sessionId + commandName + Idempotency-Key`，receipt綁定request／draft hash。相同key＋相同hash replay同結果；相同key＋不同hash回`409`，不得套用新內容。positive與zero-change commit都只有一筆command receipt與一筆formalization／synchronization event。

### 34.7 Server Submission Guard、query與lock順序

`DrawingRevisionWorkService.submit`在既有transaction中完成locked work read與`assertWorkMutationBasis`後、`UPDATE drawing_revision_works`、review package、review request及任何lifecycle write之前呼叫`assertDrawingRecognitionSubmissionReady({client:tx, companyId, drawingRevisionId})`。

全域lock order固定為：

`Drawing aggregate/work → current source-set revalidation → recognition lineage/session → sorted PDM targets`

create、rerun、decision save、amend、cancel、commit、compatibility formalize及submit凡會碰觸兩個以上authority，一律依此順序；PostgreSQL用`FOR UPDATE`＋serializable retry，SQLite用top-level `BEGIN IMMEDIATE`。worker只取得session lock且永遠不再取得Drawing work／PDM target lock，因此不形成反向鎖。禁止formalize保留舊的「session先鎖、之後再碰Drawing」路徑。

`assertCurrentRecognitionSourceSet`提供兩種明確模式：

- `lockedMutation`：在Drawing work lock內以`listContextSources`相同canonical排序重算current exact file IDs／hashes／revision及fingerprint；save、amend、cancel、commit、formalize、submit必用此模式。
- `stableRead`：background write-impact在同一read snapshot內計算，並於impact完成前後各讀一次source basis；任一version／file set／fingerprint變動即回`RECOGNITION_SOURCE_SET_CHANGED`，零寫入且不發布舊impact。

任何命令都不得只比較session中儲存的fingerprint。新增／移除／替換檔案、rerun winner改變或current work basis變動後，舊session的save／impact／amend／commit／formalize全部`409`；client保留draft並重新載入current lineage。

Guard algorithm：

1. 在locked Drawing work下重算current source set；查same company／revision／exact fingerprint的current recognition lineage。
2. 無session、`queued／extracting／extraction_failed`，或只有proposed／conflict／ignored／deferred／unclassified／identity／engineering-evidence且完全沒有`accepted | corrected | mapped` intended candidate時allow；recognition缺席或失敗不成為通用gate。
3. 只要current exact lineage存在accepted intended candidate，其latest leaf必須為`formalized`且formalization／synchronization event與current source／target fingerprint相符；open／cancelled amendment、rerun中間態或尚未commit的zero-delta intended session都拒絕。
4. nonformalized intended session且有actual delta回`RECOGNITION_SUBMISSION_WRITE_PENDING`；有owner失效、target stale、active Part work或其他blocker回`RECOGNITION_SUBMISSION_WRITE_BLOCKED`；zero-delta intended但尚未建立同步event也回pending。兩種拒絕都使外層transaction零payload／review／lifecycle write。
5. commit完成的positive或zero-change formalized session才allow；submitted package selector同時鎖定該session ID、formalization event ID、source fingerprint及evidence origin，不以「資料剛好相等」取代同步事實。

Client footer可利用local dirty與latest impact先disabled以改善體驗，但server guard是唯一不可繞過authority。submitted／in review沿用既有work mutation-basis lock；returned重新由current source truth建立amendment；submitted review package只讀exact formalized projection，不讀processing、wrong-fingerprint、open或cancelled successor。

### 34.8 Legacy Redirect、Part Readback And Failure Recovery

Legacy resolver以current request headers建立server auth／company context，先驗session scope再查same-company current work：

- canonical target固定`/numbering/drawings/[drawingId]/workspace?workId=[workId]`；若輸入`returnTo`經same-origin正規化後不等於該exact drawing／work target，忽略它。不得接受external、protocol-relative、其他company或任意內頁。
- invalid ID、session不存在、cross-company、無current work或非drawing-revision context都fail closed；不得先redirect後由client API才發現錯誤。未登入使用既有login return flow；有登入但無權限不洩漏session identity。
- `DrawingRecognitionReview`及其module CSS只有舊page一個consumer；panel parity、browser case及`rg` caller=0後同slice刪除，不留dead interactive owner。

Part頁不新增任何write API或CTA；formalize後直接讀既有canonical Part fields／attributes與formalization lineage。QA逐欄readback必須用actual Part owner ID，不能只看Drawing panel notice。

Recovery matrix：

| Failure | Required recovery |
|---|---|
| impact stale／aborted | 丟棄token，按latest session／rowVersion重新preflight；舊response不能重新enable按鈕。 |
| commit response loss | 保留stable idempotency key與draft hash，先GET確認receipt／event／status，再以同key同payload重試；不得產生第二event。 |
| source set changed | 保留local draft、reload current source／lineage並要求重新核對；舊session不可blind retry或套用到新檔案。 |
| amendment create response loss | GET parent `writeControl`，找到open successor就切換；同key replay或server reuses winner。 |
| cancel response loss | GET successor／parent；cancelled即回parent，仍open才以同key重試。 |
| 401／403 | 清除pending動作但保留可安全顯示的draft，要求重新登入／權限處理；不得自動高權限retry。 |
| 409 | 保留輸入、reload server truth、重新建立preflight；禁止blind overwrite。 |
| 5xx | 顯示bounded錯誤與重試；任何master值維持最後成功版本。 |

`drawing-recognition-review-snapshot`與`pdm-review-package`不是No-change consumer：兩者必須使用同一exact selector，只能選latest `formalized` leaf，且source fingerprint等於submit transaction內重算的current fingerprint。selector找不到合法session時只表示沒有可封存recognition projection；若存在accepted intended但未同步，submission guard先拒絕，不能降級成「無辨識資料」繞過。

### 34.9 Implementation Slices、entry／exit與估工

| Slice | Scope | Entry | Exit／handoff | Estimate |
|---|---|---|---|---:|
| `107-A Migration and lineage` | ADR落地、053、SQLite schema/helper、backfill／constraints、purpose／origin DTO、migration rehearsal | §34.11 dirty baseline；task-owned provider targets | SQLite copy＋disposable PostgreSQL parity、rollback與primary invariant pass；可交107-B | 2.0–2.5 d |
| `107-B Domain, commit and compatibility` | origin overlay repository、source assertion、global lock order、commit／amend／cancel、submit／snapshot selector、legacy resolver與四支route | 107-A migration contract穩定 | auth／atomicity／race／zero-change audit／snapshot／query-budget pass；可交107-C | 2.5–3.5 d |
| `107-C Embedded UX and submit integration` | single commit panel、background advisory impact、edit／cancel、visible state、Drawing footer guard、redirect-only page、刪舊component／CSS | 107-A／B pass；保存舊dirty review hunk | normal path不離panel、Part readback、submitted／returned lock、三viewport／keyboard pass | 2.0–2.5 d |
| `107-D QA/QC closure` | 6 runners、exact manifest、affected regressions、typecheck／lint／isolated build、cleanup與證據對帳 | A–C source stable | fresh QA-107 38／38、P0/P1=0、primary/source unchanged；只達local completion candidate | 2.5–3.5 d |

總估工=`9–12 person-days`，其中RD約`6.5–8.5`、QA／targeted QC約`2.5–3.5`；不含independent production QC、live migration、staging／production deploy、release或真人canary。每個slice可獨立review；不得為等待107-D而把A～C全部標成完成，也不得在107-A先做UI。

目前進度：107-A～D 的 local implementation與QA/QC均已完成；`npm.cmd run qc:dev-107`以aggregate＋typecheck封存QA-107-001..038 exact 38/38 PASS，local completion candidate成立。正式migration／activation／deploy／release不在本DEV授權內。

### 34.10 Executable QA／QC Contract

固定runner ownership：

- contract=`QA-107-001..008`（8）
- SQLite repository／service=`QA-107-009..019,021..026,033..035,037..038`（22）
- disposable PostgreSQL=`QA-107-020`（1）
- provider migration=`QA-107-036`（1；SQLite copy＋disposable PostgreSQL）
- browser=`QA-107-027..032`（6）
- aggregate必須得到exact union=`QA-107-001..038`，unique count=38，`PASS=38`，`Blocked／Not Run／unexpected visible error=0`。

Commands：

```text
npm run qc:dev-107:contract
npm run qc:dev-107:migration
npm run qc:dev-107:aggregate
npm run qc:dev-107
```

repository／PostgreSQL／browser child runners與aggregate已納入package；最新aggregate以exact union 38、child PASS、source／primary invariant、cleanup、`productionConnection=false`與`primaryWrites=false`為完成條件，不以靜態contract或單一SQLite migration rehearsal代替。

Aggregate本身只負責DEV-107五個child與exact 38分母；`typecheck:app`、affected ESLint及`build:isolated`另行作quality gates。DEV-068／079 contract回歸已通過；DEV-068 A0005、DEV-079 layout、DEV-083 mutation、DEV-101 package等歷史資料相依runner因來源fixture不存在或已漂移而fail-closed，並已保留parent baseline disposition。這些結果不改QA-107固定分母，也不得被手工改成PASS；各parent owner補齊fixture後再重跑。

Evidence root=`output/qa/dev-107/<runId>/`；child位於`contract／repository／postgres／migration／browser/manifest.json`，root `manifest.json`至少含：

- `runId`、source HEAD／dirty baseline hash、runner version、started／finished time、exact expected／actual case IDs與每案status／artifact path。
- fixture IDs、actor／company／Drawing／revision／Part／parent／successor／evidence-origin／event IDs、row versions、source fingerprints、idempotency key／draft hash、before／after formal values與mutation ledger。
- runtime declaration：project、purpose、dynamic task-owned port、owning process tree、cleanup condition、isolated`PDM_DATA_DIR`、isolated`PDM_REPOSITORY_DIR`及mutation scope。
- primary before／after：SQLite schema hash、canonical root／Part／Drawing identity、master counts、migration residue、root refs、`PRAGMA foreign_key_check`；PostgreSQL使用disposable target並證明drop／port release。
- browser：normal entry path、Chromium version、`1440×900／1024×768／390×844`、keyboard、reduced motion、focus、accessibility tree、console／network／overflow、screenshots及Part readback。
- `sourceUnchanged`針對aggregate開始時的candidate source snapshot；測試不得格式化或修補產品碼。所有task-owned runtime／temp在manifest完成前停止並確認port released。

Query／storage budget是exit gate：amendment建立對raw source／adapter／observation的INSERT必須為0；domain SQL statement count（不含platform receipt／outbox與transaction control）在1筆與500筆observation fixture間相同且不超過12；origin-overlay projection在auth／company context之後不超過8個data SELECT。任何per-observation clone／query loop或statement count隨raw evidence成長都使`QA-107-037`失敗。

### 34.11 Dirty-working-tree Ledger And RD Entry Boundary

Readiness audit發現下列overlapping source已在本DEV前dirty；這些是使用者／既有工作的內容，不得reset、checkout、clean或以HEAD覆寫。第一次記錄後、文件驗證期間又觀察到`canonical-drawing-change-workspace.tsx`、`globals.css`與`package.json`被其他共享工作更新；未回退該變更，以下三筆已refresh為本輪handoff前的current working-tree SHA，其餘維持首次baseline：

| File | Git state／numstat | Baseline SHA-256 |
|---|---:|---|
| `src/components/drawing-recognition-workspace-panel.tsx` | `M +9/-1` | `34eeb4d4151193b078e7a45c806146f94f41cf7880c40902ae38c2bf25f054ff` |
| `src/components/drawing-recognition-review.tsx` | `M +35/-7` | `17f56146a2a5672a5561ddfbfdfa3c5442fc9e7c47dc877c7d2184da0de0be92` |
| `src/components/drawing-recognition-review.module.css` | `??` | `ee2328e754c56602b532705c3e6c940d4531bac805db8de31fdc6f335b7e6f73` |
| `src/components/canonical-drawing-change-workspace.tsx` | `M +32/-28`（RD supervisor refresh） | `829593ff6d5e005bda6189f2a2b4b4c3689095ea2137abe5600306f0ca7b9a16` |
| `src/lib/drawing-recognition.ts` | `M +20/-0` | `bf321eb115156eff966c872a7783c85a831af5e499f918bc735af00b2afcf921` |
| `src/lib/repositories/drawing-recognition-async-repository.ts` | `M +137/-3` | `1dd4c402d168a04c65ecaf7aac6732238e2edbe4d37d8d4f9bcbb4449773d8d4` |
| `src/lib/drawing-revision-work.ts` | `M +18/-5` | `76afa71e6f57dc354a9b8f193a236f72e53f9b2984dd2f5c312bb11da523d500` |
| `src/app/globals.css` | `M +211/-427`（handoff refresh） | `a117aa33054eb6617b78d10130953dba073540db50d94550bcc82fba7ebb8ebf` |
| `package.json` | `M +22/-0`（handoff refresh） | `4ed9e8527c844f36d25328fab5ff5674c70a092f166a7a5d95c3242e006b2c87` |
| `db/schema.sql` | `M +11/-0`（No-change target） | `8b35fe62043ecdaf80beebc29916fd18a861c20dfe8397837507215efefd8d24` |

開始107-A前，RD必須重新執行`git status --short`、`git diff --numstat`與hash；若hash已改，更新task-owned evidence ledger並以當下working tree為base。每個overlap檔先讀existing diff再作最小patch；尤其舊review component刪除前，必須把仍屬current panel的post-release／evidence／failure能力逐項對照，不得直接丟失dirty內容。文件本輪不建立stash、不stage、不commit。

### 34.12 P0／P1 Gap Audit、DoD與Execution Boundary

| Risk | Readiness control | Result |
|---|---|---|
| 第二個PDM writer／partial intent | embedded只呼commit endpoint；commit與compatibility formalize共用同一domain writer；decision＋impact＋write同transaction | Closed |
| amendment資料膨脹／purpose不明／並行雙建 | 053 purpose＋evidence origin、candidate overlay、partial unique index、serializable retry | Closed |
| source drift誤寫 | save／impact／amend／cancel／commit／formalize／submit全數重算current exact source，分locked mutation／stable read模式 | Closed |
| lock反轉／rerun race | Drawing→source→lineage→sorted target唯一lock order；worker不得再取Drawing lock | Closed |
| optional recognition變成通用submit gate | exact source＋saved intended-only algorithm；negative matrix | Closed |
| accepted no-op無稽核閉環 | 同一commit建立`appliedCount=0`event、formalized session且零Part／link write | Closed |
| submitted snapshot封存錯session | latest exact-fingerprint formalized leaf selector；processing／open／cancelled／wrong fingerprint排除 | Closed |
| client bypass submit | guard置於existing submit transaction、review write前 | Closed |
| Released authority被精簡UI繞過 | requiresPostRelease直接導正式變更；embedded不接reason | Closed |
| legacy IDOR／open redirect | server auth／company／session／exact target resolver | Closed |
| one-click其實變多命令 | single server commit receipt；失敗全rollback，background impact僅advisory | Closed |
| 多代amendment形成儲存／查詢債 | raw evidence零複製、set-based overlay、固定statement-count budget | Closed |
| dirty worktree遺失既有修改 | exact SHA／numstat ledger＋overlap re-read gate | Closed |
| fixed QA分母失真 | 5 child runners＋aggregate exact set 38 | Closed |

Current Phase DoD=`107-A～D complete + fresh QA-107 38/38 + affected regressions PASS + P0/P1 open=0 + migration/provider parity + task-owned cleanup + primary/source invariant unchanged`。DEV-107已達成上述local DoD並取得`completionCandidate=true`；這只代表本機交付完成，production release仍另走既有release gate。

本輪Execution Boundary：已修改DEV-107產品／測試契約、SQLite schema／initializer與PostgreSQL 053 migration，並以task-owned隔離資料／repository執行完整38案QA、affected regressions、typecheck、affected lint與isolated build；aggregate證明primary／source invariant不變且所有task-owned runtime／temp均清除。未修改primary data、未stage／commit／merge／PR，未deploy／release。下一個合法動作是由授權者另行啟動production migration／activation／deploy／release gate。
