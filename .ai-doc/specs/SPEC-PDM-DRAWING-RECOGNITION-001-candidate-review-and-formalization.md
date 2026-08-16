# SPEC-PDM-DRAWING-RECOGNITION-001 - 圖面／CAD 全項辨識候選、人工審核與正式化

Status: Local RD Implemented / Focused QA-QC Passed / Human Confirmed / Production Release Gated
Authorization: 使用者已指示持續推進；本機 Phase 1A～1D 已完成實作與 focused QA/QC。外部 OCR／CAD 採購、production／staging 檔案處理、production migration、部署與 release 仍未授權。
Date: 2026-08-12
Owner: Dev PM
Related DEV: `DEV-068` / `DEV-PDM-DRAWING-ATTRIBUTE-RECOGNITION-001`
Related prototype: `output/dev-068-attribute-recognition-ui-preview.html`（概念預覽，不是實作權威）

Related authority:

- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
- `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`
- `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`

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
12. 送審前即可在現有「新版圖面／歷史版圖面」附件區啟動辨識；此階段只建立綁定目前勾選檔案的候選工作，不建立正式版次、不建立送審，也不寫入 PDM。送審後的自動辨識保留為補救與稽核路徑。

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
4. Given CAD, OCR and current PDM values disagree, then the page exposes every source and formal value as a conflict; confidence does not auto-select a winner.
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
- Native SolidWorks Document Manager metadata adapter and Windows worker.
- Typed numeric/unit fields and controlled engineering characteristic models.
- Review-time quality metrics: miss rate, wrong-owner rate, correction rate and median review time.

Re-entry requires enough reviewed data to measure error/correction behavior plus explicit user authorization for the relevant automation, provider, migration or formal-domain expansion.

## 21. Governance Result

- Spec impact: `Compatible extension`; no existing authority is replaced.
- ADR: not required for this RD Contract because canonical file/drawing/part/revision authorities remain unchanged and the candidate/formalization layer is additive. Re-evaluate ADR need if the generic attribute dictionary becomes a cross-domain platform, formalization becomes distributed/non-atomic, or automatic source precedence is introduced.
- QA plan: `.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md`。
- Fixture manifest: `.ai-doc/qa/fixtures/dev-068-a0005-fixture-manifest.md`。
- Current implementation blocker: none at P0/P1 within the local Phase 1A～1D contract. Coding has not started only because the user has not yet issued the separate execution command.
- Remaining release gates: real OCR/native CAD provider availability and accuracy, license/security/cost acceptance, production representative file access, production migration, deploy and release.

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
| `drawing_recognition_sessions` | `id PK`, `company_id FK`, `source_context_type` (`candidate_revision`,`revision_package`,`drawing_revision`,`drawing_number`), `source_context_id`, `source_lineage_key`, nullable `drawing_id FK`, nullable `drawing_revision_id FK`, immutable `source_set_fingerprint`, unique `deduplication_key`, `status` (`queued`,`extracting`,`review_ready`,`extraction_partial`,`extraction_failed`,`ready_to_formalize`,`formalized`,`cancelled`), `priority default 100`, `not_before`, `attempt_count`, `locked_by/locked_at/heartbeat_at`, nullable `supersedes_session_id FK`, `row_version >= 1`, count columns, safe `error_code/error_summary`, `created_by/created_at/updated_at`, nullable terminal actor/time | unique `(company_id,deduplication_key)`; claim index `(status,not_before,priority,created_at)`; context and successor indexes. Session is mutable only through state-machine repository methods. |
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

`identity_relation` decisions only bind candidates to existing canonical objects in Current Phase. They do not create `drawing_part_links`; a missing relation blocks the affected intended write until the user completes the existing relation workflow.

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
| No real OCR executable is configured locally | P1 release capability | Does not block Phase 1A～1D implementation. External JSON adapter, unsupported state and deterministic fixture are fixed. Production/provider acceptance remains gated and cannot be reported as OCR quality PASS. |
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

- real native SolidWorks/OCR provider, licensing/security/cost and measured extraction accuracy on an approved gold set;
- production object download/worker topology, monitoring and production migration/deployment/rollback;
- full existing PostgreSQL migration chain currently has pre-existing migration 004 drift (`approval_rules.phase`) outside DEV-068; PostgreSQL 001 + 033 was verified in a disposable cluster;
- production/distributed concurrency and the full actor/browser matrix in DRR-001～060 remain release evidence. Focused local QA/QC covers the implemented critical path and safety invariants, not provider quality or production readiness.
