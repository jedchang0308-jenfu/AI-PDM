# SPEC-PDM-WORKBENCH-PREVIEW-GALLERY-001：圖號／料號 3D 預覽圖模式

Status: `RD Implemented / Focused Contract QC 10/10 / Browser Smoke Blocked by managed auth / Production Migration & Release Gated`
Date: 2026-08-11
Owner: Dev PM
Related DEV: `DEV-065`
Source ID: `DEV-PDM-WORKBENCH-PREVIEW-GALLERY-001`
Related QA: `.ai-doc/qa/qa-dev-065-workbench-preview-gallery-validation-plan-2026-08-11.md`
Related authority: `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`; `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`; `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`; `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`

## 0. RD handoff

本文件是 DEV-065 的唯一產品與工程契約。RD 可直接執行 Phase 1A～1D，不需再向 PM 詢問版型、預覽來源、缺圖 fallback 或模式記憶規則。

執行前先讀：

1. 本 SPEC。
2. `.ai-doc/qa/qa-dev-065-workbench-preview-gallery-validation-plan-2026-08-11.md`。
3. `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`。
4. `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`。
5. `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`。
6. `.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`。

開始條件：

- `DEV-064` canonical `Drawing / DrawingRevision / DrawingRevisionFile` identity 可讀。
- 既有 Drawing、Part workbench list 與 detail drawer baseline 可運作。
- RD 先記錄工作樹既有變更，只修改 DEV-065 範圍，不覆蓋使用者的平行工作。

完成定義：Phase 1A～1D、QA acceptance `PG-001`～`PG-014`、typecheck、affected lint、focused regression、真實 Chromium 四 viewport 全部通過，且 production connection/write 皆為 false。未經明確 release 指令，不得套用正式 migration、deploy、merge、PR 或 release。

使用思考習慣：#目的、#限制條件、#可驗證性、#批判、#設計思考、#非語言溝通

## 1. Problem and outcome

### 1.1 真正問題

現行圖號與料號工作台以文字列為主，適合精確比較欄位，但使用者在辨識零件外形、快速掃視一組圖號或料號時，必須逐筆開啟明細。Windows 檔案總管式縮圖瀏覽可降低辨識成本，但不能犧牲既有清單能力，也不能讓代表性圖片被誤認為料號本身的精確幾何。

### 1.2 交付結果

- 圖號模組與料號模組各新增 `預覽圖` 模式；既有模式命名為 `清單`。
- 切換器採圖料模組 `關係樹／矩陣` 的 segmented-control 視覺與互動語言。
- 預覽主體為既有 native SolidWorks pipeline 產生的靜態 PNG；瀏覽器不解析 `.SLDPRT/.SLDASM`，也不新增互動式 3D viewer。
- 圖號卡片顯示該 canonical drawing 最新有效版次的 primary 3D 預覽。
- 料號卡片顯示同主根號下、最小圖號流水號之代表圖的最新有效版次 primary 3D 預覽，並明示 `代表圖`。
- 沒有可用 3D 時保留卡片並顯示狀態；不可改用 2D、舊版或下一個圖號掩蓋缺口。

## 2. Human-confirmed decisions

2026-08-11 使用者在引導模式確認：

| Decision | Confirmed rule |
|---|---|
| `HD-065-1 / 1A` | 料號預覽來源固定為「同根號下，圖號流水號最小者」的最新版 3D 預覽；不是料號一般附件。 |
| `HD-065-2 / 2A` | 代表來源沒有 3D 時仍保留卡片並顯示 `無 3D 預覽`；不做 2D fallback。 |
| `HD-065-3 / 3A` | 首次進入預設 `清單`；之後每個模組各自記住最後模式，URL 明確指定時優先。 |

PM 對 1A 的可執行解讀：`根號` 對應 canonical `part_root_id`；`最小流水號` 對應同根號 canonical drawing 的數值 `sequence_no ASC`，不是字串最小、不是最近更新、也不是有預覽者優先。若資料異常出現同一流水號，依 `drawing_number` natural ascending、`drawing.id ASC` 決定唯一代表圖。

## 3. Scope boundary

### 3.1 In scope

- `/numbering/drawings` 與料號工作台現行 canonical route。
- 清單／預覽圖切換、URL 正規化、per-module local preference。
- Drawing、Part list BFF 的 preview summary bulk projection。
- 受權限保護的 thumbnail stream route。
- 可重用的 view switch、preview gallery、preview card 與 placeholder。
- additive SQLite schema index、PostgreSQL forward migration artifact。
- 本機 fixture、focused test、real Chromium UI/UX/a11y/performance 驗證。

### 3.2 Out of scope

- 圖料／Relation 模組的預覽圖模式。
- 互動式 3D、旋轉、量測、爆炸圖、preview size slider。
- 多選、拖放、重新命名、搬移、刪除或其他檔案總管 mutation。
- 新的 upload window、改變檔案 ownership、lifecycle、permission 或 approval authority。
- 2D fallback、舊版 3D fallback、跨根號 fallback、下一順位圖號 fallback。
- 歷史資料回填、批次重生 derivative、live migration、staging/production、deploy/release。

## 4. UX and non-verbal contract

### 4.1 Mode switch

建立共用 `PdmWorkbenchLayoutSwitch`；優先抽取圖料模組既有 `關係樹／矩陣` segmented-control primitive，不複製另一套近似 CSS。

- 選項固定為 `清單`、`預覽圖`；順序不可交換。
- 使用真正的 button 或等價 radio semantics，具可辨識 selected state、focus ring、`aria-pressed` 或 radiogroup state。
- active state 不只靠顏色；必須同時有底色／邊界／字重或 indicator 差異。
- 桌面版位於 filter footer 左側；既有 `顯示歷程` 等控制留在右側。空間不足時整組換行，不拆散 segmented control。
- 切換不 reload、不重新送出 filter；保留搜尋、排序、分頁、選取列與已開啟 detail drawer。

### 4.2 URL and persistence

新增 query `layout=list|preview`。

解析優先序：

1. 有效 URL `layout`。
2. 當前模組的 localStorage preference。
3. `list`。

Storage key：

- Drawing：`pdm:drawing-workbench:layout:v1`
- Part：`pdm:part-workbench:layout:v1`

規則：

- 首次進入一定是清單。
- Drawing 與 Part 不共用最後模式。
- 使用者切換時以 `history.replaceState` 更新 URL 並寫入當前模組 preference；不可污染 back stack。
- 無效值或舊值正規化為 `list`，不得 crash、白屏或清除其他 query。
- SSR/初次 hydration 不直接存取 `window/localStorage`；避免 hydration mismatch。

### 4.3 Gallery/card anatomy

- gallery 使用 `repeat(auto-fill, minmax(184px, 1fr))` 或經視覺驗證的等價規則；不得固定欄數。
- thumbnail canvas 固定 4:3、neutral surface、`object-fit: contain`，不得裁切模型；image 使用 `loading="lazy"`、`decoding="async"`。
- 整張卡片是選取／開啟既有 detail drawer 的目標；不在 grid 新增下載或檔案 mutation 意義。
- 第一層資訊：預覽圖、編號、名稱、既有人類狀態 badge。
- Drawing secondary identity：最新有效 revision；無 revision 時顯示明確缺口。
- Part secondary identity：必須顯示 `代表圖 {drawingNumber}`；可再顯示 revision。tooltip/accessible label 說明「依同主根號最小圖號流水號選取」，避免誤認成料號精確幾何。
- 過長編號／名稱可視截斷，但 `title` 或 accessible name 必須可取得完整值；status 不得只靠 tooltip。
- selected card 延用工作台既有 teal selection 語意；hover、selected、keyboard focus 三態不可混淆。

### 4.4 Preview states

| State | Visible behavior | Card behavior |
|---|---|---|
| `ready` | 顯示 PNG thumbnail。 | 可開 detail drawer。 |
| `pending` | skeleton/compact progress indicator + `預覽產生中`。 | 可開 detail drawer。 |
| `delayed` | clock/low-motion state + `預覽處理較久`。 | 可開 detail drawer。 |
| `missing` | neutral placeholder + `無 3D 預覽`。 | 可開 detail drawer。 |
| `failed` | error-neutral placeholder + `預覽暫時無法顯示`。 | 可開 detail drawer 查看檔案狀態。 |
| `unavailable` | neutral placeholder + `預覽暫時無法顯示`。 | 可開 detail drawer；不得洩漏權限或內部原因。 |

不可把 raw worker error、storage key、asset ID、hash 或 permission code 顯示給使用者。動畫遵守 `prefers-reduced-motion`。

### 4.5 Keyboard and responsive parity

- `Arrow` 移動 card focus/selection；`Home/End` 到首尾；`PageUp/PageDown` 依 viewport 前後移動；`Enter` 開 drawer；`Escape` 關 drawer；`Ctrl/Cmd+C` 複製目前顯示編號。
- 不新增任何 write keyboard shortcut。
- 1440×900、1024×768、768×1024、390×844：無 horizontal overflow、切換器不斷裂、卡片不互疊、底部內容可達。
- 若 gallery virtualization 造成 keyboard 或 screen-reader 順序失真，Phase 1 不採 virtualization；先用 server pagination + lazy image 控制成本。

## 5. Exact read contract

### 5.1 Shared types

在 `src/lib/pdm-workbench-contract.ts` 新增純 projection type；不可把 preview 加進 `PdmWorkbenchRowBase`，避免 Relation 被迫承擔 3D domain 欄位。

```ts
export type PdmWorkbenchPreviewState =
  | "ready"
  | "pending"
  | "delayed"
  | "failed"
  | "unavailable"
  | "missing";

export type PdmWorkbenchPreviewSummary = {
  state: PdmWorkbenchPreviewState;
  href: string | null;
  sourceKind: "drawing_latest_3d" | "root_representative_latest_3d";
  sourceDrawingNumber: string | null;
  sourceRevision: string | null;
  alt: string;
};
```

`DrawingWorkbenchRow` 與 `PartWorkbenchRow` 各加 `preview: PdmWorkbenchPreviewSummary | null`。`null` 只允許 feature flag off 的完整 rollback；flag on 時每列必須回 summary（包含 missing/unavailable），不得以 `null` 逃避狀態判定。Relation row 不變。`href` 只能是同站受權限保護 route，不得回 raw storage URL 或 asset ID。

### 5.2 Drawing source resolver

對每個 canonical Drawing row：

1. 以 row 對應 `drawings.id` 作 source；不得以 display code 重新猜 identity。
2. 從同一 drawing 的 revision 排除 `cancelled`、`superseded`，以 `compareRevisionCodes(..., { allowLegacy: true })` 取 revision code 最大者；相同或不可比較時依 `updated_at DESC, id ASC` 決定。
3. 只讀該最新版次 `drawing_revision_files` 中 `role='cad_3d' AND is_primary=1 AND removed_at IS NULL` 的檔案。
4. 最新版次沒有 primary 3D 時回 `missing`；禁止回到較舊 revision。
5. derivative 必須 `status='ready'`、`source_file_asset_id` 相同、`source_content_hash` 與 source asset 當前 hash 相同，且 generator 不是 `fake_preview_worker`。不合條件的 ready row 不可顯示。
6. 若沒有 ready derivative，state priority 固定為：primary 3D 不存在=`missing`；同 source hash 最新 job 為 `queued/running` 且距 `updated_at` 不超過既有 `previewHeartbeatStaleAfterMs`=`pending`；超過該既有 30 秒門檻=`delayed`；同 source hash job或derivative為failed/skipped/cancelled=`failed`；有source但狀態互相矛盾、bytes遺失或resolver非安全性例外=`unavailable`。不可另建第二個時間門檻。整張 list不得因單筆preview例外500；permission、company或source-integrity違反則fail closed。

### 5.3 Part representative resolver

正式 Part row 以 `part_numbers.part_root_id`；尚無 formal number 的 canonical draft row 以既有 workbench domain adapter 已解析的 canonical root context。不得從 display string 截 root code。

代表圖演算法：

1. candidate set 限同 `company_id`、同 `part_root_id` 的 canonical `drawings`。
2. 排除 terminal drawing：`obsolete`、`merged`、`cancelled`；排除 `sequence_no IS NULL` 或沒有 `drawing_number` 的 row。
3. 依 `sequence_no ASC` 選最小值；tie-break 為 `drawing_number` natural ascending、`drawing.id ASC`。
4. 對唯一代表圖套用 5.2 的最新版次與 primary 3D 規則。
5. 代表圖存在但無可用 3D 時回該代表圖的 `sourceDrawingNumber` 與 `missing/pending/failed`；不得跳到下一個 drawing。
6. 沒有候選 drawing 時回 `missing`、`sourceDrawingNumber=null`；不得查其他根號、料號附件或 2D。

上述演算法必須有 server-side unit/contract test；前端不得自行重算。

### 5.4 Endpoint and cache

新增 domain route：

- `GET /api/numbering/drawings/workbench/[rowKey]/preview`
- `GET /api/parts/workbench/[rowKey]/preview`

兩 route 使用同一 server resolver，但各自從 rowKey 解析 domain source。每次 request 必須重驗 session、company membership、workbench read permission、row/source ownership、source hash 與 derivative readiness。未授權時沿用現有 security policy 回 403/404，且不同公司不得從 status、timing 或 error body得知 preview 是否存在。

成功回應：

- 正確 `Content-Type: image/png`、`X-Content-Type-Options: nosniff`。
- `ETag` 由 derivative content hash 產生；支援 `If-None-Match -> 304`。
- `Cache-Control: private, max-age=300` 或更嚴格；不可 `public`。
- list BFF 維持 `private, no-store`。
- route 只 stream derivative，不把 storage path 或 signed cloud URL寫入 HTML／JSON。

`rowKey` 含冒號時 route client 必須 `encodeURIComponent`；server 使用既有 canonical row-key parser，不可手寫 split 後略過驗證。

## 6. Query, schema and performance contract

### 6.0 Feature flag and rollback

- flag：`PDM_WORKBENCH_PREVIEW_GALLERY_V1`，default `false`；local focused/real-browser test明確設為true。
- 只有目前相應 Drawing/Part unified workbench能力已啟用時才能生效；相依缺少時fail closed到完整既有清單，不顯示半套switch/gallery。
- flag off：不顯示切換器；`layout=preview`正規化為list；row `preview=null`且不執行preview bulk queries；兩個thumbnail routes回404；既有list/drawer/API capability維持。
- rollback只關flag，不刪index、不清local preference、不改資料。production flag activation另走release gate。

### 6.1 Bulk projection

禁止逐 row 查 revision/file/derivative/job。建議分層 bulk read：

1. 由當頁 row IDs/root IDs 一次取得 drawing source／Part representative mapping。
2. 一次取得候選 drawing 的 revision rows，在 application 層用 canonical revision comparator 決定最新版。
3. 一次取得最新版 revision 的 primary `cad_3d` file。
4. 一次取得 derivative + latest preview job summary。

Part list 在 Workbench Core 現有上限 15 queries 之外，preview projection 最多增加 4 個常數 queries，總數 `<=19`，rows 1/20/50 時不可成長。Drawing preview projection最多增加 4 個常數 queries。單一 image stream request 建議 `<=6` queries，且只在 viewport lazy load 時發生。

Projection 的非安全性資料缺口必須回 state，不得讓一筆缺圖拖垮整頁。server log 可記 structured diagnostic，但不得包含 secret、raw signed URL 或完整 storage path。

### 6.2 Additive index/migration

在 canonical SQLite schema 與 PostgreSQL forward migration `db/postgres/031_workbench_preview_gallery.sql` 加：

```sql
CREATE INDEX IF NOT EXISTS idx_drawings_company_root_sequence
ON drawings(company_id, part_root_id, sequence_no, drawing_number, id);
```

只允許 additive index，不改資料、不 backfill、不建立第二份 preview authority。PostgreSQL 031 只產生 artifact；本 DEV 不 apply staging/production。RD 若發現實際 execution plan 不使用此索引，可在不改 product rule 前提下調整欄位順序，但必須在 self-check 記錄 SQLite/PostgreSQL plan evidence；若需新 table、materialized cache 或資料修復，停止並回 PM。

## 7. Component and file ownership

預期修改面；RD 可依現況小幅調整名稱，但不得改變 authority：

| Area | Expected files / responsibility |
|---|---|
| Pure contract | `src/lib/pdm-workbench-contract.ts`：preview summary type；base row 不加 domain 欄位。 |
| Drawing adapter | `src/lib/drawing-workbench.ts`、`src/lib/repositories/drawing-workbench-async-repository.ts`：bulk source projection。 |
| Part adapter | `src/lib/part-workbench.ts`、`src/lib/repositories/part-workbench-async-repository.ts`：root representative projection。 |
| Shared server | 新增 bounded preview resolver；重用 `src/lib/preview-derivatives.ts` 的 hash/readiness policy。 |
| API | `src/app/api/numbering/drawings/workbench/**`、`src/app/api/parts/workbench/**`：list summary 與 stream route。 |
| Shared UI | 新增 view switch、preview gallery/card；重用 `src/components/use-pdm-workbench-controller.ts` selection/detail behavior。 |
| Domain UI | `src/components/drawing-workbench.tsx`、`src/components/part-workbench.tsx`：layout wiring、domain labels。 |
| Style | `src/app/globals.css`：抽取既有 relation segmented switch visual token，gallery/card/RWD/focus/state。 |
| Schema | `db/schema.sql`、`db/postgres/031_workbench_preview_gallery.sql`：additive index only。 |
| Tests | 新增 DEV-065 focused scripts/tests；更新必要 regression，不改 unrelated expected value。 |

禁止：在 shared component 以 `if (module === ...)` 重做 domain selection；Drawing/Part source規則必須由 adapter 提供 preview summary。

## 8. Failure and security behavior

- `401/403/404`：沿用現有 error envelope；前端不可顯示 preview existence。
- invalid/tampered rowKey：400 或現有 canonical 404；不可 fallback 以 displayCode 搜尋。
- stale derivative hash、fake generator、missing file bytes：絕不 stream；列表顯示 `unavailable/failed` 並留下 server diagnostic。
- image load 404/409/5xx：card 轉 neutral `預覽暫時無法顯示`；不得無限 retry 或 broken-image icon。
- request race：快速切 filter/layout 時只接受最新 response；沿用 controller abort/sequence policy。
- localStorage disabled/corrupt：以 list mode 正常運作，不顯示 blocking error。
- 任何 preview failure 不得改變 workbench row identity、selection、human status、primary action 或 detail capability。

## 9. Delivery phases

### Phase 1A — Contract and resolver

- 加 preview types，但不污染 base/Relation。
- 完成 Drawing 與 Part deterministic source resolver、state mapping、bulk read、security tests。
- 加 SQLite index 與 PostgreSQL 031 artifact；只做 local/disposable verification。
- 加 default-off feature flag與flag-off complete rollback contract。

Exit：source algorithm fixtures、cross-company、stale/fake derivative、query count通過。

### Phase 1B — API projection and stream

- Drawing/Part list response加入 preview summary。
- 新增兩個 protected stream routes、ETag/private cache、content validation。
- list projection degradation 與 image error handling通過。

Exit：HTTP contract/permission/cache/hash tests通過，無 raw storage disclosure。

### Phase 1C — Shared switch and gallery

- 抽取 segmented switch visual primitive。
- 完成 URL/storage precedence、gallery/card/states、drawer/keyboard parity。
- Part card明示代表圖；Drawing card顯示 revision。

Exit：兩模組 manual flow與a11y contract通過，清單 mode能力不退化。

### Phase 1D — Regression and real browser gate

- typecheck、affected lint、DEV-053/061/062/064/native-preview focused regression。
- isolated Chromium 1440×900、1024×768、768×1024、390×844。
- 記錄 network/query count、console/page/server errors、overflow、screenshots與source manifest。

Exit：QA `PG-001`～`PG-014` 全 PASS；production connection/write false；cleanup removed。

## 10. Stop conditions

RD 遇到任一條件立即停止並回報，不自行擴張：

- 無法從 canonical `part_root_id` 或 `drawings.sequence_no` 決定代表圖。
- 現況需要改 file ownership、permission、lifecycle 或 preview worker authority。
- 需要新 table/materialized cache、歷史 backfill、正式資料修復或批次重生 preview。
- query budget只能靠 per-row query達成，或 preview failure會破壞整頁。
- 需要 interactive 3D、Relation gallery、檔案 mutation、staging/production、merge/PR/deploy/release。
- 現有未提交變更與 DEV-065 同檔衝突，且無法保留使用者變更。

## 11. Spec impact and ADR decision

- `Compatible extension`：延伸 DEV-062 Workbench Core 的 shared mechanism，但 preview 不進 base row、不影響 Relation。
- `Compatible extension`：使用 DEV-064 canonical Drawing aggregate，不建立平行 drawing identity。
- `Compatible extension`：遵守 DEV-061 file ownership，料號只引用同根號代表 drawing 的受控 3D，不複製檔案。
- `Compatible extension`：只消費 DEV-056 native PNG derivative；interactive 3D 仍未授權。
- ADR：`Not required`。此案未改 architecture authority、data ownership、permission 或 irreversible choice；本 SPEC 足以治理 bounded read projection/UI extension。若實作發現需新 preview authority 或 materialized cache，必須先停下並新增 ADR。

## 12. RD self-check handoff

### 12.1 Current local implementation evidence (2026-08-11)

- Product files implemented: `src/lib/pdm-workbench-preview-gallery.ts`; `src/lib/pdm-workbench-contract.ts`; `src/lib/drawing-workbench.ts`; `src/lib/part-workbench.ts`; `src/lib/preview-derivatives.ts`; the two protected preview route trees; `src/components/pdm-workbench-layout-switch.tsx`; `src/components/pdm-workbench-preview-gallery.tsx`; Drawing/Part workbench components; `src/app/globals.css`.
- Schema/flag: `db/postgres/031_workbench_preview_gallery.sql`, additive SQLite index, `.env.development.local` local enable, `.env.example` default-off.
- Focused evidence: `npm run qc:dev-065-workbench-preview-gallery` PASS 10/10, including an executable numeric-minimum/natural-tie representative fixture. Affected ESLint has 0 errors; dynamic protected previews use `next/image` with `unoptimized` to preserve the protected stream boundary.
- Focused TypeScript sees no DEV-065 source error; the workspace-wide check remains blocked by the pre-existing `src/lib/status-scope-display.ts` missing `importCenter` definition and generated `.tmp/.next` stale references.
- Chromium smoke: BLOCKED at managed `/login` because this local environment has no bootstrap user. No `PG-*` UI case is declared PASS from that blocked run; four viewport/query-count/source fixture evidence remains the next QA action.
- Safety: no live migration, production connection/write, data repair, derivative batch regeneration, deploy, merge, PR or release was performed.

RD 完成後在 DEV-065 記錄：

- 實際修改檔、migration artifact、feature flag（若有）與 default state。
- 每項 `PG-*` 對應 test/evidence 路徑。
- query count：Drawing/Part 各以 1、20、50 rows驗證為常數。
- representative fixture：最小流水號無 3D、下一張有 3D，結果仍為 missing。
- latest revision fixture：新版無 3D、舊版有 3D，結果仍為 missing。
- fake/stale/cross-company negative evidence。
- 4 viewport 截圖、DOM/a11y、network、console/page/server error、horizontal overflow。
- `productionConnected=false`、`productionWrites=false`、cleanup result。

思考習慣檢查：#目的—縮短外形辨識時間；#限制條件—不虛構料號精確幾何；#可驗證性—代表選取、fallback、權限與效能都有 fixture/門檻；#非語言溝通—active、focus、preview state與代表來源不用閱讀長說明即可辨識。
