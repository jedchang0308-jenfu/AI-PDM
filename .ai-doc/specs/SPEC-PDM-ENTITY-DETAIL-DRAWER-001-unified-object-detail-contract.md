# SPEC-PDM-ENTITY-DETAIL-DRAWER-001 - 圖號 / 料號 / 圖料根號統一物件詳情抽屜

Status: Phase 1C Unified Drawing Workspace Implemented Locally / Independent QC Passed; `DEV-067 UnifiedPdmEntityDetailDrawer Local RD Implemented / Local QA-QC Passed`; `DEV-072 Local RD/QA-QC Complete / Human Confirmed`; `DEV-079 RD Implemented Locally / Focused Contract + Browser Evidence / Independent QC Pending`; `DEV-083 RD Implemented / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition`; `DEV-107 RD Implemented Locally / Human Confirmed / Local QA-QC Complete 38/38 PASS / Production Release Gated`; `DEV-108 RD Implemented Locally / Focused QA Passed / PostgreSQL Provider Gate Not Run / Production Release Gated`; `DEV-110 RD Implemented Locally / Human Confirmed / Full QC Passed 60/60 / Production Release Gated`; `DEV-113-E Local RD Implemented / RD Tech Lead Corrections Closed / P0-P1 Planning Gap 0 / Human Confirmed / Full QA-QC Passed 28/28 / Production Release Gated`; Production Release Gated
Date: 2026-07-09; amended 2026-09-02
Owner: Dev PM
Related DEV: `DEV-PDM-ENTITY-DETAIL-DRAWER-001` / `DEV-039`; `DEV-PDM-DRAWING-WORKBENCH-SIMPLIFICATION-001` / `DEV-057`; `DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001` / `DEV-067`; `DEV-PDM-DETAIL-ACTION-DISCOVERABILITY-001` / `DEV-072`; `DEV-PDM-DRAWING-READONLY-DRAWER-FULLPAGE-EDITOR-001` / `DEV-079`; `DEV-PDM-PART-RELATION-READONLY-DRAWER-FULLPAGE-EDITOR-001` / `DEV-083`; `DEV-PDM-STATUS-DATA-REBUILD-001` / `DEV-087`; `DEV-PDM-RECOGNITION-INLINE-FORMALIZATION-001` / `DEV-107`; `DEV-PDM-PART-NUMBER-EXCEL-MATRIX-WORKSPACE-001` / `DEV-108`; `DEV-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001` / `DEV-110`; `DEV-PDM-PART-WORKBENCH-SINGLE-EDIT-ENTRY-001` / `DEV-113`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`; `.ai-doc/decisions/ADR-PDM-DRAWING-RECOGNITION-PART-WORK-HANDOFF-001-common-projection-and-atomic-draft-transfer.md`
Related QA: `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`; `.ai-doc/qa/qa-dev-067-unified-pdm-entity-detail-validation-plan-2026-08-12.md`; `.ai-doc/qa/qa-dev-072-pdm-action-discoverability-ai-real-operation-validation-plan-2026-08-14.md`; `.ai-doc/qa/qa-dev-079-drawing-readonly-drawer-fullpage-workspace-validation-plan-2026-08-19.md`; `.ai-doc/qa/qa-dev-083-part-relation-readonly-drawer-fullpage-workspace-validation-plan-2026-08-20.md`; `.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md` §10；`.ai-doc/qa/qa-dev-110-recognition-common-value-part-work-handoff-validation-plan-2026-08-31.md`；`.ai-doc/qa/qa-dev-113-part-workbench-single-edit-entry-validation-plan-2026-09-01.md`
Extends: `.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md`
Extends: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
Extends: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
Extends: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`

## 2026-09-01 DEV-113 - 料號工作台唯讀抽屜與單一維護入口

Baseline Status：`Local RD Implemented / RD Tech Lead Corrections Closed / Human Confirmed / Historical QA-QC 28/28 / Production Release Gated / P1 / Medium`。本節原始113-A～D完成紀錄保留為修正前基線；目前實作與驗證狀態改由下列DEV-113-E amendment治理。

### 2026-09-01 DEV-113-E 維護分頁直接編輯修正（Local RD Implemented）

Status：`Local RD Implemented / RD Tech Lead Corrections Closed / P0-P1 Planning Gap 0 / Human Confirmed / Full QA-QC Passed 28/28 / Prior 28/28 Baseline Retained / Production Release Gated / P1 / Medium`。

#### DEV-113-E implementation and QC receipt（2026-09-01）

已完成113-E1～E3：Part maintenance relation在exact active work `action.key="edit"`下直接edit-ready；移除第二層`編輯關聯`；保留local draft、明確儲存／取消、stable logical-command fingerprint與同key response-loss retry；409／412 stale與committed readback failure均以單一primary recovery action收斂；Drawing drawer維持explicit view→edit；附件載入加入request-generation guard，避免並行lazy load以舊錯誤覆蓋成功狀態。另補上BOM空狀態的結構原因文案與回到維護分頁的安全導向，仍由server eligibility決定是否可建立BOM。未新增API、schema、migration、permission、dependency或domain writer。

- Aggregate receipt：`output/qa/dev-113/aggregate/report.json`，G01～G04 `PASS`。
- Browser receipt：`output/qa/dev-113/browser-real/DEV113-2026-09-01T13-27-51-231Z/report.json`，B01～B12 `12/12 PASS`；B12涵蓋1440×900、1024×768、390×844，B11另驗證單一零件文案與維護導向。
- Contract／integration：C01～C08 `8/8 PASS`、R01～R04 `4/4 PASS`；parent regression DEV-090／096／099／108均PASS。
- Evidence integrity：case IDs missing=0、duplicates=0、artifacts存在、`productionWrites=false`；primary SQLite snapshot before/after相同（schema、canonical identities、migration residue、root references、FK violations均未變）。本次task-owned browser port 65330、fixture／repository／dist已清理；保留production migration、PostgreSQL provider、deploy／activation／release gate未開放。

#### DEV-113 maintenance section visual consistency amendment（2026-09-02）

依使用者指出維護頁的預覽、結構型態、附件與關聯矩陣各自使用不同容器層級，補上只影響呈現層的 section contract：四區塊共用同一外層卡片、標題列高度、18px section padding 與14px內容節奏；預覽／結構／關聯保留原功能邊界，嵌入式附件頁只移除重複的內層 card shell並以分隔線維持資訊層級；窄版改為可換行標題與單欄操作，不新增全域save、autosave、API、schema、migration、permission或domain writer。這是DEV-113-E的相容視覺修正，不改既有資料authority與操作語意。

- Product visual boundary：`src/components/part-maintenance-workspace-sections.tsx`、`src/components/canonical-part-preview-section.tsx`、`src/components/part-structure-classification.tsx`、`src/components/canonical-relation-matrix-section.tsx`、`src/app/globals.css`；5 files modified、0 add/delete，未擴大至API／schema／permission／writer。
- Working SHA-256：`part-maintenance-workspace-sections.tsx`=`1dc5f096fc07f16f1fb41d71bbb9a67a985ef217ddd27fc139f74c972f15b964`；`canonical-part-preview-section.tsx`=`4dbe09072cdf83c109f8ea47f4175aabbf1320d5e1c606e076cc054a494b056a`；`part-structure-classification.tsx`=`e83ed68c1390bb0b7ce1a35871c671466b818284bf2871451871ae2bf9d8d2ef`；`canonical-relation-matrix-section.tsx`=`a553efd68db5011782f066c804c657e5bd151dbcae8d1a51f045014316c0d9b5`；`globals.css`=`6f85119cf15327a8bea71e58f516234767a28e50851405bd0a97de5bd527efa8`。
- Visual receipt：`output/qa/dev-113/browser-real/DEV113-2026-09-02T04-02-30-876Z/report.json`，B01～B12=`12/12 PASS`；B12保存1440×900、1024×768、390×844三種viewport，`productionWrites=false`，task-owned runtime／data／repository／temp均已清理。固定aggregate=`output/qa/dev-113/aggregate/report.json`同步通過G01～G04。

#### DEV-113 Part workspace compact density amendment（2026-09-02）

依使用者要求將料號工作台整體留白降低約2/3，採只影響`part-number-workspace` scope的相容呈現修正；目前回到上一版第一輪約原留白1/3的密度值。頁面外距、header／tab／body／section間距、卡片padding、預覽框高度與附件列表行距維持第一輪收斂結果。BOM、資料與維護三個分頁共用同一density boundary，非Part頁面不受影響。預覽仍保留可讀主視覺，主要按鈕不低於既有觸控尺寸，visible focus、keyboard順序、tab與relation cell語意不變；共用frame在loading期間不渲染空白錯誤框，真正error／權限／衝突訊息仍保留；沒有新增全域save、autosave、API、schema、migration、permission、repository/domain writer或資料交易。

- Product boundary：`src/components/pdm-edit-page-frame.tsx`新增可組合`className`以承接頁面scope；`src/components/part-number-matrix-workspace.tsx`只掛上`part-number-workspace`；`src/app/globals.css`新增Part workspace compact density規則。這是DEV-113-E既有視覺修正的相容增量，current implementation boundary更新為`11 modify + 0 add + 0 delete`（8 product＋3 runner）。
- Working SHA-256：`pdm-edit-page-frame.tsx`=`7C26929F4291EE2DB3F9F650F2B35ED514812652E9CB5EBD2A37B04BFE4226E2`；`part-number-matrix-workspace.tsx`=`B070F2BD1C0F81943EEC66FF79B5D28DE27D30440CE1B8EFCCCD1E8297E65DD1`；`globals.css`=`81CB85157618F7EE13437B2F7DDBCD36694FA16CBC2BEC35789A2FF8DC534474`。
- Visual receipt：回復後`output/qa/dev-113/browser-real/DEV113-2026-09-02T05-36-40-724Z/report.json`，B01～B12=`12/12 PASS`，B12保存1440×900、1024×768、390×844且無page-level overflow，B11無可見重新載入／空白錯誤框，`productionWrites=false`；回復後aggregate=`output/qa/dev-113/aggregate/report.json`已完成G01 contract／typecheck／eslint與G02 integration，但G02 isolated build被範圍外既有未追蹤`src/lib/repositories/ai-pdm-role-capability-repository.ts:77`的TS2345擋住，故不宣稱本次G01～G04／28案全通過；上一輪完整aggregate仍保留為baseline，task-owned browser runtime／data／repository／port均已清理。

#### DEV-113 Part workspace compact-minimum與classification action label amendment（2026-09-02）

依使用者最新畫面註記，將Part workspace的預覽框、section heading、頁面／section／附件／關聯矩陣內部間距收斂至最小可讀值；窄版同步縮減，保留主要按鈕touch target、visible focus、keyboard順序、matrix水平捲動與既有資料／writer邊界。結構型態唯一動作的可見與accessible name由`分類／批次分類`改為`編輯`，只變更文案，不改分類／批次分類功能、權限或readback。

- Product／verification boundary：`src/app/globals.css`的`.part-number-workspace` scoped compact-minimum規則、`src/components/part-structure-classification.tsx`的label-only修正，以及`scripts/qc-dev-113-browser-real.mjs`的B08 oracle同步；不新增API、schema、migration、permission、dependency或domain writer，不改Drawing與其他頁面。
- Working SHA-256：`globals.css`=`96FCD1EF090E5B9EC7DF28EEC667DECF127ABF1508D9C2A8301B47ABDE0B2D8D`；`part-structure-classification.tsx`=`0CDAC62D04F212ABB040FAC984C188D176FFF9ECB666CD9558F5A171DF8C7F3F`；`scripts/qc-dev-113-browser-real.mjs`=`65C1FCF6453F698FAECB08327664CCCB844B7BE6D46E209CDB3F20832388C3BE`。
- Visual receipt：`output/qa/dev-113/browser-real/DEV113-2026-09-02T06-05-22-456Z/report.json`，B01～B12=`12/12 PASS`；B08確認唯一`編輯`writer入口，B12保存1440×900／1024×768／390×844、最小內距且無水平溢出，`productionWrites=false`；型別檢查與受影響元件ESLint通過，task-owned runtime／data／repository／port／dist已清理。

#### 決策、效用與Spec Impact

使用者已經由`編輯料號／繼續編輯`進入`/parts/[partId]/workspace`的`即時維護`context；在同一頁再要求點一次`編輯關聯`，不增加權限、資料完整性或復原能力，只增加一步操作與「我現在到底能不能改」的不確定性。因此DEV-113-E採`Intentional replacement + compatible preservation`：只取代Part workspace關聯矩陣的第二層啟用按鈕，保留明確commit boundary及所有server authority。

1. `即時維護`載入後，只有exact active Part work的server row actions包含`action.key="edit"`且矩陣root／Drawing／Part axes完整時，關聯cell立即呈現可編輯affordance；頁面不得顯示`編輯關聯`。`create_change／review／cancel_work／request_obsolete`都不能解鎖relation editor。
2. 「直接編輯」是edit-ready，不是autosave。進頁、focus、hover與切換section均不得呼叫mutation API；使用者首次改cell後只建立browser draft。
3. Normal dirty state只顯示primary `儲存關聯`與secondary `取消`；無dirty時不顯示disabled save。取消回復目前server snapshot後仍留在edit-ready；儲存取得terminal receipt並完成readback後仍留在edit-ready，dock收合。Ambiguous／committed-readback-failed／stale狀態各自只顯示一個可恢復的primary action，不與一般save並列。
4. Dirty cell必須有非色彩唯一的可見標記（outline／符號）及accessible state；三態仍為`空白／製造／參考`。409／412或其他save error保留draft、顯示短錯誤並focus可處理位置，不得自動merge或覆寫server truth；stale時以`放棄草稿並載入最新資料`完成明確恢復，不能讓舊ETag無限重送。
5. Dirty時切tab、返回、browser back或close沿用既有discard guard；確認discard只丟棄未儲存relation draft，已成功的preview／classification／attachment獨立writer不rollback。
6. Drawing drawer保留`view → 編輯關聯 → edit`，因drawer的首要任務仍是檢視；本修正不得把Drawing drawer也改成常駐edit-ready。
7. `上傳圖片`、`編輯`、`上傳附件`與BOM導向是明確command，不是重複mode gate；結構型態的分類／批次分類能力由`編輯`承接，本期不把所有section改成autosave或單一全域save。

#### Shared component contract與演算法

`canonical-relation-matrix-section.tsx`新增單一placement參數`activationMode?: "explicit" | "immediate"`，default固定`explicit`，避免既有Drawing caller被默默改變。Part maintenance唯一傳`immediate`。Part parent先以exact detail row action推導`partRelationCanManage`，再傳`mode="manage" | "readonly"`；shared component不得自行猜Part action。另新增optional `onReloadRequested`，只供Part stale／committed readback recovery重抓exact detail，不改Drawing caller。

```text
partRelationCanManage = row.entityType == part AND row.actions contains exact key "edit"
canManage = mode == manage AND rootId exists AND drawings.length > 0 AND parts.length > 0
editReady = canManage AND (activationMode == immediate OR explicitEditing == true)
dirtyKeys = diff(serverCells, draftCells)
commandFingerprint = stableSerialize(rootId, matrixEtag, sort(changes))

on enter/immediate: mutationCount = 0
on cell change: update browser draft; mark exact dirty cell; reveal action dock
on cancel: draft = serverCells; clear dirty/error; keep editReady when immediate
on first save: bind one UUID to commandFingerprint; PATCH with existing token + ETag
  success receipt -> lock draft; GET exact detail
    GET success -> replace server/draft, clear command/dirty, keep editReady, hide dock
    GET failure -> mark committed-readback-failed; primary "重新載入已儲存結果" does GET only
  network/timeout/5xx -> mark ambiguous; lock cell changes; primary "重試確認儲存結果"
    retries the identical payload with the same UUID; never creates a new command
  definitive 4xx -> zero-write terminal; clear command key, preserve correctable draft
  stale 409/412 -> preserve draft, disable save; primary "放棄草稿並載入最新資料"
    calls onReloadRequested, replaces ETag/server/draft, clears error, keeps editReady
```

任何尚未送出的draft change都會使舊command key失效並在下一次save建立新key；一旦進入ambiguous或已取得success receipt，cell暫時鎖定直到相同logical command或GET readback收斂，避免同key不同payload與未知commit後的新command。`explicit`模式的save／cancel仍可回到view；`immediate`模式的save／cancel不得把cell切回readonly。Shared component持有draft／command／save／recovery狀態與diff，parent不得複製第二套relation state machine。

#### Exact follow-up boundary與dirty preflight

Assessment基準：branch=`持續優化2`、HEAD=`91de270c3a644dfbcbee49ed255b3c18e13df9dd`。SHA是2026-09-01 assessment當下working-content SHA-256；`M/??`為共享dirty worktree既有內容，RD須先重算並只改exact hunks，禁止reset／checkout／整檔覆寫。

| Action | File | Status | Working SHA-256 | 113-E responsibility |
|---|---|---:|---|---|
| Modify | `src/components/part-maintenance-workspace-sections.tsx` | ?? | `a5c4067fe46e8c770b6f21529e11cb95e37b1e4697cdd82f7649c0f50f03a0f3` | 由exact `action.key="edit"`推導mode、移除`relationEditing／編輯關聯`、傳immediate與reload callback |
| Modify | `src/components/canonical-relation-matrix-section.tsx` | ?? | `d205289c02a3d6c3a5d8b4523fe9b24d67e2503429f0ba5e5350284357a6cca2` | explicit/immediate、stable logical key、dirty-only dock、ambiguous/readback/stale recovery |
| Modify | `src/components/relation-matrix-table.tsx` | M | `a5a272114df0997372ac460335dfe6da281cc0ec5d0fb538246c13beae430940` | exact dirty keys、非色彩dirty／accessible state、ambiguous/recovery時input lock |
| Modify | `src/app/globals.css` | M | `fc371eaff6c5bba427c7276a5408692acd1385e653f56a8f0f1aabaee0467982` | scoped cell affordance、dirty/error/dock、1024與390 viewport |
| Modify | `src/components/canonical-part-attachment-manager.tsx` | M | `3227a478e09c587601ad9a27e440d301c753a624007f8fe3b8c3dc158cbe68ca` | request-generation guard，避免並行lazy load stale error覆蓋成功狀態 |
| Modify | `src/components/part-bom-context.tsx` | M | `3b99e890fcd90466d7ee08ce98fef1f7d4d3c98cb3da5f389611d9a981265828` | 單一零件／未分類BOM空狀態原因文案與回到maintenance tab導向；保留assembly-only create gate |
| Modify | `scripts/qc-dev-113-contract.mjs` | ?? | `ff91126f134d4f174c9aa3960df194c639a7194802520c7f961b94b275c5c663` | C07/C08 capability、stable key、recovery與boundary contract |
| Modify | `scripts/qc-dev-113-browser-real.mjs` | ?? | `cfd311884111f46a6cefb214dc1d444d77b36468e462365cb5df3e137f83ae97` | 重建B01～B12 named registry；B09含response-loss／stale recovery／Drawing regression；B12補1024 viewport |
| Modify | `scripts/qc-dev-113-aggregate.mjs` | ?? | `3d2386a0a284e0cddc0419b5b8b2958a3a83e65c347fa7cdfa63ceb1e1155264` | follow-up fingerprint、28-case evidence completeness與exact G03 commands |

Current implementation boundary=`11 modify + 0 add + 0 delete`（8 product＋3 runner）；文件同步=`5 modify`（本SPEC、relation SPEC、DEV-113 QA、`dev_task.md`、`documentation_map.md`）。不得修改API、schema、migration、permission、repository/domain writer、package/dependency、`canonical-pdm-workbench.tsx`、preview／classification components或DEV-065／087／090／101歷史runner。`part-number-matrix-workspace.tsx`本次僅掛上頁面density class，不改矩陣資料／writer／submit authority；`pdm-edit-page-frame.tsx`僅新增可組合呈現className；`part-bom-context.tsx`本次僅補單一零件空狀態文案與回到maintenance tab的安全導向，不改BOM eligibility、create writer或API authority；附件元件本次僅加入並行載入狀態防護，不改附件writer／API authority。若SHA drift，先列diff owner；若需超界，立即回Dev PM。

#### RD slices、估工與完成定義

| Slice | 內容 | 完成條件 | 估工 |
|---|---|---|---:|
| `113-E1` | Exact capability＋shared immediate activation＋Part parent移除gate | `edit`解鎖、其他actions fail closed、Drawing explicit、entry mutation=0 | 0.75～1.0人日 |
| `113-E2` | Dirty UI＋stable command key＋ambiguous/readback/stale recovery＋RWD/a11y | response-loss同key、stale可恢復、desktop／1024／390及keyboard oracle通過 | 1.0～1.5人日 |
| `113-E3` | B01～B12 named browser registry、exact G03、aggregate與文件receipt | 每案獨立assertion/evidence、current 28/28、missing=0、candidate一致 | 1.75～3.0人日 |

總估工=`3.5～5.5 person-days`，順序E1→E2→E3。113-E已重建12個named case records並完成固定分母28案；本次aggregate與browser receipt取代pre-113-E historical baseline。ADR=`No New ADR`：writer、transaction、permission、schema與跨domain authority均未改；RD技術主管三項P1已由本修正版封口，planning gap=`P0 0 / P1 0`。

Stop conditions：需要autosave／全域save、API／schema／permission／writer改動；exact active Part work無法以既有`action.key="edit"`安全判斷manage；無法維持Drawing explicit；same logical command無法跨response-loss保留同key；stale／committed-readback-failed沒有可收斂恢復；dirty draft無法在離頁時保留；或B01～B12無法產生逐案可追溯證據。任一成立即停止，不得用常駐disabled按鈕、client-only permission、換新idempotency key、重新點舊ETag或一條smoke冒充12案繞過。

視覺與互動基準：

- `output/design/part-workbench-single-edit-entry-ui-v1.html`
- `output/design/part-workbench-single-edit-entry-ui-v1-spec.md`
- `output/design/part-workbench-single-edit-entry-drawer-v1.png`
- `output/design/part-workbench-single-edit-entry-workspace-v1.png`
- `output/design/part-workbench-single-edit-entry-drawer-mobile-v1.png`
- `output/design/part-workbench-single-edit-entry-workspace-mobile-v1.png`

### 問題、目的與成功結果

目前料號工作台的抽屜明細與全頁「建立修改／進行編輯」工作區都含可寫控制，使用者無法從畫面責任判斷應在哪裡修改，也可能在抽屜直接改了即時生效資料，卻誤以為仍會跟料號資料一起送審。

DEV-113採用以下產品原則：

1. Part drawer只負責快速辨識、閱讀與導向，是`readonly data surface / zero inline-data mutation`；受控生命週期secondary不屬於資料編輯，但只能經獨立確認modal送出。
2. `/parts/[partId]/workspace`是唯一料號維護入口；同一入口依資料的既有authority分區，不新增第二個Part writer。
3. 「單一入口」不等於「單一交易」：料號資料仍先保存至Part work並送審；預覽、結構分類、正式關聯與附件仍依各自既有權限及commit boundary即時生效；BOM仍由BOM domain管理。
4. 使用者在料號清單開啟抽屜後，五秒內只能辨識到一個合法的料號編輯入口，不需理解formal／work／relation等內部資料層。

成功結果是抽屜不再與全頁工作區競爭編輯責任，且所有既有資料authority、審核、並行與稽核語意維持不變。

### Spec Impact Preflight

分類：`Intentional replacement planned + compatible preservation`。

DEV-113實作與targeted QA/QC完成後，已取代下列使用者可見placement：

- DEV-090「Part drawer內直接進入關聯矩陣edit mode」的Part-side placement；Drawing drawer不在本DEV範圍。
- 現行Part drawer內的預覽來源上傳／重設、結構分類、附件管理與其他mutation controls。
- DEV-083／108 normal entry中同一Part同時可由抽屜與全頁表面編輯而形成的雙入口認知。

相容保留：

- DEV-090的`drawing_part_links`唯一正式權威、relation matrix API、ETag、idempotency、transaction與立即生效語意；只把Part-side編輯placement移到全頁工作區。
- DEV-108同根Part轉置矩陣、per-Part work、autosave、`送出審核`、獨立review package與immutable reviewer。
- Part preview source、DEV-099 exact structure classification、canonical attachment與BOM domain的既有repository、permission、audit與failure contract。
- stable Part identity、company boundary、server action projection、safe `returnTo`及既有canonical route。

在DEV-113實作前，既有runtime仍是現況權威；本機實作與新驗收完成後，Part drawer已符合readonly-data target。ADR判定為`No New ADR`：本DEV只重排既有UI owner surface，沒有新增或改變資料authority、狀態機、permission、schema或跨服務契約；DEV-090既有ADR繼續治理正式關聯writer。若後續發現必須新增writer、合併交易或改權限，立即停止並重做ADR判定。

### Human-confirmed target flow

1. 使用者由`/parts`清單選取料號，開啟同一canonical Part drawer。
2. Drawer依固定順序顯示識別與狀態、目前資料、預覽、關聯與文件摘要；不得出現任何mutation control。
3. Server action projection依exact state最多只提供一個合法「主要維護導向」：
   - 正式資料、無可續接工作且可建立修改：`編輯料號`。
   - 已有actor可編輯的active work：`繼續編輯`。
   - 審核中且actor是exact assigned reviewer：`前往審核`。
   - 無合法主要導向、他人審核中、terminal、restricted或blocked：不渲染disabled假入口，只顯示最短必要狀態／原因。
   既有`取消本次工作／申請作廢`不是資料編輯入口；有server capability時只能放在與主要維護CTA視覺分離的`更多操作`，沿用既有確認modal、permission、impact及command authority。不得因移除drawer欄位編輯而刪除或改寫正式生命週期能力。
4. `編輯料號`由server action建立或重用合法work後導向`/parts/[partId]/workspace?workId=...&returnTo=...`；client不得自行推測work、reviewer或permission。
5. `繼續編輯`進入同一workspace；`前往審核`進入既有immutable review workspace，不把reviewer導到live editable matrix。
6. 返回`/parts`時保留合法query、filters、sort、cursor、selected row及合理scroll/focus context；reload／back／forward皆由server truth重建。

### Drawer readonly-data contract

- Drawer body不得mount料號欄位`input`、`textarea`、`select`、file input、contenteditable、preview upload／reset、classification editor、relation edit mode或attachment manager。合法`取消本次工作／申請作廢`只可由獨立確認modal承接，不得偽裝為欄位編輯或直接在drawer body執行。
- 預覽只顯示目前best-available image／狀態；關聯矩陣與附件只顯示唯讀摘要、count或合法view／download navigation。
- `編輯料號／繼續編輯／前往審核`是navigation action，不得在drawer內先執行資料mutation；唯一例外是既有server-controlled `編輯料號` entry command可原子建立空白Part work並立即導向workspace，且不得在drawer呈現可編輯值。
- 選列、開關drawer、切換清單顯示方式、下載及安全導覽不得觸發資料mutation request；只有使用者明確開啟生命週期操作、通過確認並送出時，才允許既有exact command request。
- 桌面使用右側drawer；390px窄版改為全螢幕詳情，但責任、內容順序及readonly-data契約相同。

### 唯一維護工作區與交易分區

全頁workspace固定以下三個一級頁籤；它們共享返回脈絡，但資料作用域不同且不共享一個提交交易。Header必須同時顯示`root code`與`目前料號`：`料號資料`是同root多Part矩陣，`即時維護／BOM`只作用於進入workspace的exact source Part。不得讓使用者誤以為即時維護會套用整個root。

| 頁籤 | Owner內容 | Commit／生效語意 | 主要動作 |
|---|---|---|---|
| `料號資料` | DEV-108轉置矩陣：品名、料件類型、規格、材質、顏色、表面處理、BOM使用規則、共用件、變體備註與既有confirmed attributes | 沿用per-Part autosave至work；送審、核准後才成正式資料 | `送出審核`，只在本頁籤顯示 |
| `即時維護` | exact source Part預覽來源、結構分類、附件；另顯示並明確標記`{rootCode} 全根號圖料關聯` | Part控制沿用各自writer；relation仍是root-level formal authority。成功即依原契約生效，不併入Part review | 各區塊自己的最小commit action；不得顯示`送出審核` |
| `BOM` | exact Part目前BOM摘要、狀態與合法入口 | 不在Part workspace複製BOM editor或writer；導向既有BOM workbench | `開啟 BOM 工作台`；不得顯示`送出審核` |

即時維護中的四個區塊可使用同頁section、panel或dialog，但必須保留一個全頁Part workspace作context owner；不得重新放回drawer，也不得建立與既有authority平行的通用「全部儲存」。切換頁籤前若`料號資料`有pending／failed／conflict autosave，沿用DEV-108 guard；不得因切換頁籤而自動submit或把即時維護操作混入Part payload。

### Scope、Out of Scope 與限制

Current Phase包含：Part drawer readonly-data／zero inline-data mutation、state-driven單一主要維護CTA、Part workspace三頁籤資訊架構、既有mutation surface relocation、safe return及桌面／手機責任一致性。

Current Phase不包含：

- 修改Drawing drawer、Drawing workspace或Drawing-side relation editing placement。
- 合併Part work、preview、classification、relation、attachment與BOM transaction；新增`全部儲存`或combined review package。
- 新schema、migration、backfill、permission、角色、domain writer、API authority或BOM editor。
- 改變DEV-101 reviewer snapshot／hash、DEV-108 autosave／submit算法、DEV-090 relation invariant或附件file authority。
- 本輪產品程式、測試、資料、runtime、deploy或release變更。

### Acceptance direction（Brief，尚非QA執行計畫）

升級RD Contract Ready時，至少將下列情境轉為固定case與evidence owner：

1. 正式且無work、本人active work、exact reviewer、他人審核中、無編輯權、terminal／blocked六類action projection均只有零或一個正確主要維護CTA；生命週期secondary不得成為第二個編輯入口。
2. Desktop 1440×900、tablet 1024×768與mobile 390×844可在首屏辨識Part、狀態及唯一主動作；無page/drawer雙水平scroll、遮擋或focus trap。
3. Drawer DOM zero mutation controls；正常檢視、換列、關閉、下載與view navigation的network mutation count=`0`。
4. Drawer內不得同時出現`編輯料號`與`建立修改／編輯關聯／管理附件／上傳／儲存`等第二入口。
5. `料號資料`只有DEV-108 autosave與`送出審核`；`即時維護`與`BOM`頁籤均無`送出審核`。
6. Preview、classification、relation與attachment各自的permission、conflict、retry、success readback及立即生效語意沒有回歸；不得用UI截圖代替API／DB或receipt證據。
7. `編輯料號`建立／重用work、`繼續編輯`、`前往審核`、401／403／404／409／5xx與response-loss皆fail closed且不重複建立work。
8. 返回清單保留filter／sort／cursor／selection／scroll／focus；reload與history navigation不依賴stale client memory。
9. 鍵盤、screen reader與touch可完成drawer→workspace／review及頁籤操作；狀態與選取不只靠顏色。
10. Drawing drawer、DEV-101 reviewer、DEV-108矩陣、DEV-090 formal relation及BOM workbench執行targeted regression。

### Brief歷史與升級結果

前述產品問題、target flow、scope、Spec Impact與視覺基準源自已確認Brief；以下repository-assessed契約已補齊exact component／route／DTO／state boundary、dirty-worktree preflight、演算法、固定28案QA/QC、RD slices、估工與stop conditions。DEV-113曾以`RD Implementation Ready`進入實作，現已完成本機實作與固定QA/QC；正式provider與release仍受獨立gate管制。

### 2026-09-01 RD技術主管審查修正

結論：`通過（已修正）`，P0/P1 planning gap=`0`。

核心因果鏈：Part drawer同時mount多個既有writer → 使用者無法由surface預測commit boundary → 相同任務出現兩個資料編輯入口。真正槓桿點是`mutation placement與action ownership`，不是重做domain writer、建立通用workspace service或複製既有writer測試。

審查後做四項compatible correction：

1. 把模糊的`zero-write drawer`改成可驗證的`readonly data surface / zero inline-data mutation`。正常瀏覽network mutation固定0；`取消本次工作／申請作廢`仍是既有受控生命週期能力，只能由分離secondary＋確認modal送出，因此不與「唯一資料編輯入口」互相矛盾。
2. 禁止在新orchestrator複製現行`PartCanonicalPreview／RelationMatrixEditor`。兩者各抽成單一shared component，Drawing／Part drawer與Part workspace共用同一render／save／dirty邏輯；新增抽象只因現在有兩個合法consumer，不建立generic plugin registry或通用form engine。
3. 封口scope：`料號資料`是root-wide matrix；`即時維護／BOM`是exact source Part；relation是唯一例外，仍為root-wide formal matrix，UI必須標示`全根號圖料關聯`。Header同時顯示root與source Part，避免把root變更誤認為exact Part變更。
4. 移除13支歷史runner的廣泛改寫與重複domain-writer驗證。Current boundary只修改5支直接受placement影響的focused parent runner；新的28案只驗DEV-113增量風險，preview／classification／relation／attachment／BOM深層authority由各自current parent runner在G03承接。

不接受的替代方案：保留兩套可寫UI、在client用CSS藏舊writer、建立combined save、為每個tab新建BFF、或重寫所有歷史browser journey。它們都沒有改變根因，且會增加雙軌authority或測試維護債。

已知受控技術債：existing Part workspace以`workId`為entry guard，因此formal Part點`編輯料號`後，即使只使用`即時維護／BOM`也會先建立一筆zero-delta Part work。影響是離開後主要CTA會成為`繼續編輯`，但正式Part資料、relation、BOM與附件authority不會因此自動變更或送審。Current isolation固定：workspace明示`修改工作已建立，料號資料尚未變更`、保留既有`取消本次工作`secondary、zero-delta不得submit；B05驗證exactly-one work與formal hash不變。若未來要求「不建work即可直接進即時維護」、或實際使用發現abandoned zero-delta work造成責任狀態噪音，觸發新DEV評估optional formal bootstrap；不得在DEV-113偷偷放寬matrix guard或另建第二入口。

### Repository assessment（2026-09-01 current facts）

1. Runtime為`next@16.3.0` App Router。`src/app/parts/[partId]/workspace/page.tsx`已正確把`params／searchParams`視為Promise並await；頁面維持Server Component，只把serializable `partId／workId／returnTo／initialTab`傳入Client Component。不得為頁籤把整頁改成`use client`。
2. `/parts/[partId]/workspace`目前經`CanonicalChangeWorkspace`分派至`PartNumberMatrixWorkspace`；後者已是DEV-108 per-Part autosave、stable logical command key、最多3筆跨Part併行與自然序送審的唯一owner。DEV-113在這個component外層加IA，不重寫其writer演算法。
3. `PartNumberMatrixAsyncRepository.getMatrix()`固定三個bounded statements；第一段guard已讀到`source_state.id AS source_work_state_id`。Response可從該值增加`sourceRowKey=canonicalRowKey(source_work_state_id)`，不增加SQL statement、不讀preview bytes、不做client join。
4. Exact Part detail read已存在：`GET /api/parts/workbench/[rowKey]` → `PdmCanonicalWorkbenchService.detail(rowKey, "part", actor)`，會重驗actor、company、row identity並回傳Part preview、preview source control、relation matrix、BOM context與contract token。`即時維護／BOM`必須惰性復用此read，不新增BFF或writer。
5. 現有獨立writer全部可直接復用：preview image upload/reset、exact structure classification GET/PATCH、formal relation matrix PATCH、canonical attachment CRUD/restore及BOM navigation。它們的permission、ETag／rowVersion、idempotency、audit、receipt與transaction boundary保持原樣。
6. 實作前Part drawer曾把`PartPreviewSourceControl`、`PartStructureClassification`、`PartBomContext`、attachment management及`RelationMatrixEditor`全部mount在drawer；DEV-113已移除這組duplicate placement並由workspace承接。Drawing drawer仍使用既有preview／relation editor，禁止用粗略source scan一併移除。
7. 實作前Part action projection為formal=`建立修改＋申請作廢＋編輯關聯矩陣`、owner=`取消本次工作＋進行編輯＋編輯關聯矩陣`、reviewer=`前往審核＋編輯關聯矩陣`；目前已落地移除Part的`edit_relation_matrix`，主要文案為`編輯料號／繼續編輯`，`取消本次工作／申請作廢`維持secondary lifecycle authority。Drawing action projection完全不變。
8. Worktree為共享dirty boundary：branch=`持續優化2`、assessment HEAD=`91de270c3a644dfbcbee49ed255b3c18e13df9dd`。多個target檔案已modified或untracked；RD不得reset、checkout、覆寫整檔或把工作樹當成HEAD內容。每個slice開始前必須重算下列working SHA，只有完全相符或能逐hunk解釋的compatible drift才可繼續。

### Current API／DTO／state contract

#### Matrix read additive field

`GET /api/pdm/parts/{partId}/matrix-workspace?workId={workId}`維持原route、method、auth與三statement budget，只對`data`做additive response：

```ts
type PartNumberMatrixProjection = {
  root: { id: string; code: string };
  sourcePartId: string;
  sourceRowKey: `cw_${string}`;
  columns: PartNumberMatrixColumn[];
};
```

`sourceRowKey`必須由server guard查到的exact `source_work_state_id`經`canonicalRowKey()`產生；不得接受query、client拼接或以Part ID猜測。缺少exact state仍回現行`WORKBENCH_SNAPSHOT_DRIFT/409`。這是compatible read projection，不是新authority。

#### Workspace tab URL contract

- 唯一值域：`data | maintenance | bom`，可見文案依序為`料號資料／即時維護／BOM`。
- 缺少`tab`固定`data`；invalid raw固定normalize為`data`，不得讀localStorage或猜最近使用值。
- Server page先normalize `initialTab`，以serializable prop傳入；Client切換使用Next支援的native history `pushState`，`popstate`必須還原頁籤與焦點。Canonical URL只保留一個`tab`。
- 進入`maintenance／bom`才以`sourceRowKey`惰性GET exact detail；同一rowKey成功結果可在該workspace session內cache。response必須驗證`presentation.kind="part"`、`row.entityId===sourcePartId`與rowKey一致，不符即fail closed。
- `sourcePartId`是workspace的exact maintenance target；root-wide matrix內選取／focus其他Part column不得偷偷改變此target。要維護另一Part的preview／classification／attachment／BOM，必須從該Part的server-derived entry重新進入同一路由，不能由client拿column ID拼rowKey。Relation section因authority本來就是root-level，固定標示`{rootCode} 全根號圖料關聯`。
- `returnTo`沿用既有safe path：正常Part入口接受exact `/parts?...`；DEV-110 handoff只接受其既有validator允許的exact `/numbering/drawings/{id}/workspace...`。拒絕`//`、反斜線、control characters、外部origin及任意path，fallback=`/parts`。

#### Action projection matrix

| Part server state | 主要維護CTA（最多一個） | 次要生命週期 | 禁止 |
|---|---|---|---|
| `part_formal + handling=none + createWork` | `編輯料號`→existing create-change command | 具exact formal obsolete capability時`申請作廢` | `建立修改`、`編輯關聯矩陣` |
| exact actor owner work＋`updateWork` | `繼續編輯`→existing workspace | 具`cancelWork`時`取消本次工作` | drawer field／relation edit |
| exact assigned reviewer＋`decideReview` | `前往審核`→immutable review | 無 | live matrix／即時維護入口 |
| other reviewer／other owner／restricted／blocked／system／terminal | 無 | 只允許既有server明確投影的合法lifecycle；通常無 | disabled假CTA、client permission推測 |

Drawer controller把Part actions分成`primaryMaintenance`與`secondaryLifecycle`：前者只認`create_change | edit | review`且最多一筆；後者只認`cancel_work | request_obsolete`並放入低權重`更多操作`。未知或多個primary要記錄contract error並fail closed，不得取第一筆掩蓋server錯誤。Drawing沿用原排序與action bar。

### UI component ownership與資料流

```text
/parts list
  -> CanonicalPdmWorkbench
     -> Part Drawer：readonly identity／fields／preview／relation／files
        -> one primary maintenance CTA
        -> optional separated lifecycle menu
  -> /parts/[partId]/workspace?workId=...&tab=...
     -> PartNumberMatrixWorkspace（page/frame/tab owner；header=root+source Part）
        -> data：root-wide DEV-108 matrix + data-only action dock
        -> maintenance：exact source Part writers + labeled root-wide relation
        -> bom：exact source Part BOM navigation
```

1. `PartNumberMatrixWorkspace`擁有page frame、三頁籤、URL/history、data-tab autosave與單一bottom action dock。`actionDock`只在`activeTab=data`且matrix ready時mount；其他頁籤DOM不得含`送出審核`。
2. 新增`canonical-part-preview-section.tsx`，把現行local `PartCanonicalPreview`原樣搬成唯一Part preview presenter；`mode="readonly" | "manage"`只決定是否mount既有`PartPreviewSourceControl`，不得複製preview state/copy或upload logic。
3. 新增`canonical-relation-matrix-section.tsx`，把現行local `RelationMatrixEditor`原樣搬成Drawing drawer與Part workspace共用的唯一matrix presenter/editor；保留ETag、dirty、save/cancel與identity navigation，Part drawer只傳readonly，Drawing行為不變。
4. 新增`part-maintenance-workspace-sections.tsx`只負責exact detail lazy read、scope label與section composition。它組合上述shared sections及既有classification／attachment／BOM components，不得內建第二份preview/relation state或generic write dispatcher。
5. `CanonicalPartAttachmentManager`增加`embedded`與`onDirtyChange`相容props，仍保留standalone route；embedded mode沿用同一endpoint、permission與元件內state，只移除重複page chrome。選檔未上傳時回報dirty。
6. `PartBomContext`增加`mode="readonly" | "workspace"`與safe `returnTo`。Drawer只顯示summary；BOM tab才顯示existing create/open navigation。不得在Part workspace mount BOM editor。
7. Preview成功、structure保存、relation保存後只refresh exact detail projection；attachment manager自行readback，必要時通知parent更新count。不得觸發matrix submit、重建Part work或混入Part payload。

### 演算法與競態封口

#### A. Drawer entry command

1. 以server action key分類；Part primary數量不是0或1時fail closed並顯示可重載錯誤。
2. 點`編輯料號`前凍結`rowKey／entityId／rowVersion／returnTo`，logical fingerprint=`create_change:{rowKey}:{rowVersion}`；同一terminal resolution前固定同一idempotency key。
3. 2xx取得exact `workId`才導向workspace；URL固定帶safe `returnTo`與`tab=data`。`edit／review`同樣在既有server href上只add safe `returnTo`，不得重建authority href。
4. network／5xx／response loss為uncertain，不得立即換key重送：先以same key replay；仍不確定才重新讀取exact row。若server truth已出現actor可續接work，依其`edit` action導向；若仍formal且rowVersion未變才允許same-key retry；其他轉409-style conflict。
5. 成功navigation前不可先丟失`returnTo`；既有`command()`先close drawer的順序需調整為capture context→terminal command→navigate，再由destination取代頁面。double-click與busy期間只允許一個in-flight。

#### B. Tab switch／dirty guard

1. 從`data`切出前取消idle timers並`flushAll()`；等待所有同Part序列與最多3筆pool flight terminal。
2. `cellErrors／conflicts／pending draft`任一存在就留在`data`、focus第一個error summary，不更新URL、不submit。
3. `maintenance`中的relation changes或attachment selected files為dirty；切頁籤、返回、browser back與close時先走同一discard guard。取消就保持原tab與focus；確認discard才reset local draft，已成功的獨立writer不rollback。
4. `beforeunload`只在matrix pending或maintenance dirty時掛載；成功flush後移除。切tab永不自動`送出審核`。

#### C. Lazy detail與refresh

1. `data`首屏只執行DEV-108 matrix GET，preview bytes與attachment list request維持0。
2. 首次進`maintenance／bom`以AbortController＋monotonic request id讀exact detail；stale response不得覆寫新row/tab。
3. 401/403=`restricted`、404=`not_found`、409=`conflict`、5xx=`error+retry`；錯誤只影響該panel，不清空已保存matrix draft。
4. refresh保留目前tab與section focus；relation 412/409沿用existing ETag錯誤並重新讀取，不自動覆寫使用者changes。

### Exact implementation boundary與dirty preflight

Assessment基準：branch=`持續優化2`、HEAD=`91de270c3a644dfbcbee49ed255b3c18e13df9dd`。表中SHA是2026-09-01 working-content SHA-256，不代表HEAD blob。`M/??`是使用者或其他任務既有內容，RD只能在完全理解的exact hunks上追加；若SHA drift，先列出差異與owner，禁止reset／checkout／整檔覆寫。

| Action | File | Assessment status | Working SHA-256 | Exact responsibility |
|---|---|---:|---|---|
| Modify | `package.json` | M | `6614680dd878d7e975f7e675494e84987eea0e1738407991b1056e57ce2d71d8` | DEV-113四個runner scripts |
| Modify | `src/app/parts/[partId]/workspace/page.tsx` | clean | `450e6f4f956545ad6bc1137b8177f596b70a456cb55fbad40fcea070299682e4` | await query、safe return、initial tab |
| Modify | `src/components/canonical-change-workspace.tsx` | M | `ecf19f0e5e92733561ab48febb7364db867e9b811a3dfb5f150953d88b77feb3` | dispatcher傳initial tab；generic reviewer不變 |
| Modify | `src/components/part-number-matrix-workspace.tsx` | ?? | `50ad13fe2c6986d06cfd7d86bc3c02f28df7576d3ed6a599eaf9ce3692c280b6` | frame、tabs、history、dirty guards、data action dock |
| Add | `src/components/part-maintenance-workspace-sections.tsx` | new | `ADD` | exact detail lazy read與maintenance/BOM composition |
| Add | `src/components/canonical-part-preview-section.tsx` | new | `ADD` | 唯一Part preview presenter；readonly/manage mode |
| Add | `src/components/canonical-relation-matrix-section.tsx` | new | `ADD` | Drawing/Part共用relation presenter/editor |
| Modify | `src/components/canonical-pdm-workbench.tsx` | M | `10f4cc83930ac5ff3e4c3a113a870a25c9cc586f4a115e37edd1fcb443254c64` | Part readonly drawer、action split、stable entry、return context；Drawing保留 |
| Modify | `src/components/canonical-part-attachment-manager.tsx` | M | `24abf628d662fbac44398ecf7f81b69ea6b3071391b77b3282f52b64cec7058c` | embedded與dirty callback，writer不變 |
| Modify | `src/components/part-bom-context.tsx` | M | `40d4f04a9137cb5e85e653f91713ec0eec2ced5c166b591633cde9f349bccc20` | readonly/workspace mode與safe return |
| Modify | `src/lib/part-number-matrix-contract.ts` | ?? | `f0e18070f1c235338fa6eee3833cbe2c7e81719ef43e67147ea41e81caac8dac` | tab registry／normalizer client-safe contract |
| Modify | `src/lib/repositories/part-number-matrix-async-repository.ts` | ?? | `3f006a6cef540c45c74eca82634fa1301f1ee285701ccc9c9176482dbff23015` | additive sourceRowKey，不增statement |
| Modify | `src/lib/pdm-canonical-workbench-state.ts` | M | `ea94c48e49f1ebb6da37ee11bdaf9222dd4f9817f3adb389040688994a03455d` | Part labels／remove matrix action；lifecycle與Drawing不變 |
| Modify | `src/app/globals.css` | M | `dac990d204fcd5ed62180bbf0917b92ac8bb84ea2dc478206f2707145570192d` | tabs、sections、responsive、focus、lifecycle overflow |
| Modify | `scripts/qc-dev-090-contract.mjs` | clean | `67a26d97dde5390d948f6b2d2f0b0b899979237612b8f5a3f48a92fe317143ed` | Drawing drawer edit＋Part workspace edit placement |
| Modify | `scripts/qc-dev-096-contract.mjs` | clean | `39276922daef031e38a2a1eaa7a38c250e485a08270c6a441e36c7b939bae271` | BOM moves to Part workspace, domain unchanged |
| Modify | `scripts/qc-dev-099-contract.mjs` | clean | `e9e5dc041fe4e8e0f3bcbaaabeaf40e20495bab3f43e4c807b138799dcc14662` | classification placement replacement |
| Modify | `scripts/qc-dev-108-contract.mjs` | ?? | `ba29887b77f35565eda43856ebe70e3fdbfb527be35c87d476856d84d988d4d2` | sourceRowKey、tabs、initial query budget |
| Modify | `scripts/qc-dev-108-browser-real.mjs` | ?? | `ee5ee2b04f7acfd4607302ecdfb65a698abb7a164b65a3f32430c1815be8ae6b` | default data tab／autosave／submit regression |
| Add | `scripts/qc-dev-113-contract.mjs` | new | `ADD` | C01～C08 |
| Add | `scripts/qc-dev-113-integration.mjs` | new | `ADD` | R01～R04 additive projection／authority composition |
| Add | `scripts/qc-dev-113-browser-real.mjs` | new | `ADD` | B01～B12 real Chromium／viewport／network |
| Add | `scripts/qc-dev-113-aggregate.mjs` | new | `ADD` | G01～G04、fixed denominator、fingerprint、cleanup |

固定boundary=`16 modify + 7 add`。DEV-065／087／101等歷史runner與manifest列為no-touch；它們的舊placement selector保留歷史語意，不為DEV-113改寫。Current regression由新runner與上表5支直接受影響的focused parent runner承接，不得把舊PASS重算為DEV-113 PASS。

No-touch：所有`migrations/**`、schema／seed／primary data、lockfile與dependency、`src/app/api/**` writer routes、`src/lib/pdm-canonical-workbench-contract.ts`、`src/lib/part-number-matrix-workspace.ts`、`src/components/part-preview-source-control.tsx`、relation／attachment／BOM repositories與services、Drawing workspace／reviewer data authority、DEV-065／087／101歷史runner與manifest、production config。`src/components/part-structure-classification.tsx`原則上仍為no-touch；僅允許本次已核准的DEV-113 compact-minimum後續label-only amendment，範圍限可見／accessible action name由`分類／批次分類`改為`編輯`，不得變更分類功能、權限、writer或資料契約。若實作需要改任何其他no-touch項，立即停止回Dev PM重做Spec Impact／ADR／risk。

### RD slices、依賴與估工

| Slice | 內容 | 依賴／完成條件 | 估工 |
|---|---|---|---:|
| `113-A` Projection與drawer責任 | sourceRowKey、Part action labels/action split、drawer readonly-data、entry idempotency/safe return | C01～C04、R01～R03；Drawing diff與regression通過 | 1.5～2.0人日 |
| `113-B` Workspace IA | server initial tab、root/source header、client history、three tabs、lazy exact detail、data dirty guard | A；B05～B07、B11 | 1.5～2.0人日 |
| `113-C` Shared extraction與relocation | 抽preview/relation shared sections，再組合classification、embedded attachments、BOM | B；R04、B08～B10；無duplicate writer | 1.5～2.5人日 |
| `113-D` Responsive與fixed QA/QC | CSS/a11y、5支focused parent regression、28案aggregate、build與cleanup | A～C；0 missing、P0/P1=0 | 1.5～2.5人日 |

總估工=`6～9 person-days`，順序固定A→B→C→D；A的sourceRowKey與action contract是B/C共同前置。不得讓多個RD同時改`canonical-pdm-workbench.tsx`或`part-number-matrix-workspace.tsx`；若要平行，只能把runner／evidence準備與不重疊shared extraction分開，整合前仍重算SHA。

### QA／QC、readiness與完成定義

Current fixed denominator=`28`：`C01～C08 + R01～R04 + B01～B12 + G01～G04`，完整oracle、fixture、evidence與cleanup見`.ai-doc/qa/qa-dev-113-part-workbench-single-edit-entry-validation-plan-2026-09-01.md`。修正前基線為歷史`28/28 PASS`；113-E current=`28/28 PASS`，且B01～B12逐案artifact完整。Brief、設計稿、static source存在或歷史DEV evidence均不得計入新分子。

最小執行命令：

```text
npm.cmd run qc:dev-113:contract
npm.cmd run qc:dev-113:integration
npm.cmd run qc:dev-113:browser-real
npm.cmd run qc:dev-113
```

aggregate另執行`typecheck:app`、affected ESLint、`build:isolated`及targeted parent regressions；runner必須先宣告project／purpose／port／process tree／cleanup／PDM_DATA_DIR／PDM_REPOSITORY_DIR／mutation scope，使用task-owned isolated data與repository。完成後只停止自己啟動的process tree、確認port釋放並移除task-owned temp；primary SQLite schema、canonical root／part／drawing identities、migration residue與`PRAGMA foreign_key_check`前後必須相同。

113-A～D的歷史完成條件為exact 16 modify＋7 add邊界可解釋、所有28案PASS且missing=0、P0/P1=0、browser errors／unexpected failed responses=0、Drawing/reviewer/DEV-108/relation/attachment/BOM focused regressions通過、primary invariants與cleanup通過、evidence manifest具candidate fingerprint。113-E使目前任務重新成為`☐`；須依本節113-E exact boundary重跑同一28案後才可再次轉`✓`。不得因typecheck或畫面看似正確宣稱完成；production deployment／release仍需獨立gate。

### 2026-09-01 Local RD Implementation / QA-QC Complete

DEV-113已依exact `16 modify + 7 add` boundary完成本機實作：Part drawer改為readonly data surface，主要維護入口收斂到既有Part workspace；workspace提供`料號資料／即時維護／BOM`三頁籤，data維持root-wide matrix，maintenance／BOM鎖定exact source Part，relation明示root-wide；preview與relation共用presenter，附件以embedded mode重用既有writer，BOM維持既有domain。Drawer command保留safe return、stable idempotency key、response-loss same-key retry與exact-row refresh。

驗證 receipt 為`output/qa/dev-113/aggregate/report.json`：G01 engineering、G02 isolated integration/build、G03 DEV-090／096／099／108 parent regression、G04 real browser 全部 PASS；固定分母`C01～C08 + R01～R04 + B01～B12 + G01～G04 = 28/28`，P0/P1=`0`。最新 browser evidence=`output/qa/dev-113/browser-real/DEV113-2026-09-01T08-03-04-816Z/`，包含 desktop data／maintenance／BOM 與 390×844 maintenance screenshot；isolated build report 證明 artifact、primary SQLite schema／canonical root／Part／Drawing identities、migration residue、`PRAGMA foreign_key_check`前後一致且 task-owned temp／port／process已清理。ESLint為0 error（2個既有warning）。

本機完成不等於正式發版：PostgreSQL provider gate、production migration、feature activation、deploy、rollback、release與production smoke均維持獨立 gate；zero-delta work受控技術債與既有workId entry guard仍依本節契約管理。

### Stop conditions

- exact detail無法以現有rowKey／company authority安全復用，或必須由client猜row identity。
- 需要新schema、migration、permission、writer route、combined save／review、BOM editor副本或改DEV-108 autosave／submit authority。
- Part drawer無法移除mutation controls而不破壞Drawing drawer，或生命週期能力只能靠刪除／隱藏才能達成單一入口。
- response loss無法以same idempotency key＋server readback收斂，可能建立重複Part work。
- tab切換會遺失pending matrix draft、把即時writer混入Part review，或無法在conflict時阻止navigation。
- shared dirty target SHA出現無法歸屬或相衝hunks，或必須reset／覆寫他人變更。
- isolated runtime／data boundary、primary before/after invariant或cleanup無法證明。

任一條成立即停止並回Dev PM／人類；不得用duplicate form、client-only permission、hidden legacy editor、放寬expected、mock-only PASS或擴張scope繞過。

## 2026-08-31 DEV-110 Planned Upstream Handoff Amendment

Status：`RD Implemented Locally / Human Confirmed / Full QC Passed 60/60`。完整authority位於`.ai-doc/specs/SPEC-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001-upstream-part-work-handoff.md`；本節只固定DEV-108的入口與writer相容邊界。DEV-110 local receipt=`.ai-doc/qc/qc-dev-110-local-implementation-2026-08-31.md`，aggregate已完成provider／browser／integration與G04。

1. DEV-110成功handoff可作DEV-108 alternate normal entry。response提供exact source `partId／workId`與safe `returnTo`；同一root多個works由DEV-108既有matrix read自server truth hydrate，不由query傳完整payload或Part清單。
2. common＋exceptions只存在Drawing recognition上游。進入DEV-108前已展開成exact per-Part payload／work；Part matrix不得再增加common-value editor、source badge列、recognition mode tab、impact modal或combined submit。
3. DEV-108仍沿用每Part autosave、rowVersion、conflict、attachment與N個independent Part review requests。DEV-110 handoff完成不等於Part submit／approve，DEV-108的`送出審核`仍是下游唯一primary action。
4. DEV-110 accepted ADR對本SPEC原「cross-Part atomic writer即Stop Condition」建立精確例外：只允許recognition-specific、server-side、最多100 Parts、同一transaction的draft handoff；它必須共用existing Part work repository invariant，只可create／update work，不可submit、approve、formalize master或暴露為通用root batch API。
5. Handoff對existing work保留非target fields；target field conflict必須在人類明確選keep-work或use-recognition後才可寫。任何Part blocker使整筆zero write；成功後DEV-108只看到正常Part works，不需理解recognition event內部語意。
6. 若handoff全部no delta，不建立no-op works；destination使用第一個eligible Part載入read matrix。若有delta，優先focus natural order第一個touched work；返回Drawing維持safe return。
7. DEV-108已有local implementation與focused SQLite／Chromium evidence，但PostgreSQL provider gate仍`Not Run`。DEV-110 downstream browser acceptance必須用相同source revision與normal destination重驗；若110-0發現route／dirty contract不可整合，維持`Not Run`，不得以mock或既有DEV-108 evidence代替DEV-110整合通過。

DEV-110核心本機切片已實作並完成固定60/60 QC；DEV-108經RD主管修正後的exact inventory與62-case denominator不因DEV-110完成而改變。aggregate已以同一source revision重驗Part work service／repository dirty boundary與DEV-108 optional initial payload；不得把本文件更新解讀為production release授權。

## 2026-08-31 DEV-108 Amendment - 料號工作台 Excel 轉置資料總表

Status：`RD Implemented Locally / Focused QA Passed / PostgreSQL Provider Gate Not Run / Production Release Gated / P1 / Medium`。本節是 DEV-108 current product／technical authority；核准視覺基準為 `output/design/part-number-workspace-excel-matrix-ui-v1.png`。本節把 formal Part owner workspace 從單一料號表單改成同根料號轉置矩陣，有意取代 DEV-083 的單一 `PartWorkspaceEditor` 呈現與顯式儲存操作；保留 stable Part identity、canonical route、每一料號獨立 change work／review package、既有 permission／lifecycle／audit／attachment／safe-return authority。2026-08-31 RD技術主管有條件通過後，使用者接受以既有create writer的optional initial payload封閉首次儲存交易、同logical command穩定idempotency、token無損refresh、deleted-data server guard、material/color pair及root integrity校正；本文件已將五項P1缺口納入current contract。後續依瀏覽器註記移除可編輯格的click-to-edit display button，改為矩陣內直接呈現輸入控制項。本機實作與focused QA已完成；PostgreSQL provider gate因未設定`PDM_POSTGRES_URL`保留Not Run，production release仍由獨立gate管理。

### Human-confirmed product contract

1. 只有一張可編輯矩陣；橫軸為同一 exact Part Root 的料號，縱軸為資料欄位。不建立單筆／批次模式、選取範圍、共通值合併、右側編輯器、確認 modal 或第二個 Part writer。
2. 具既有編輯能力且未被 lifecycle／review lock 的可維護儲存格直接呈現輸入控制項，可直接填寫。使用者不需先點擊顯示值、建立批次、選取料號或按「進入編輯」；系統在背後按 exact Part 懶建立或重用既有 `part_change_work`。
3. 同一可比較屬性列有兩種以上 canonical normalized values 時，整列只用單一淡黃色背景；不判斷正誤、不視為 validation error，也不疊加可見 badge、icon或警告文案。直接輸入控制項以單一青綠外框表示 focus，不另畫儲存格外框；red 只保留真正錯誤。
4. 附件列只顯示各 Part 的附件數量與入口，不參與差異判定。PDF／圖片按需預覽或下載，其他格式下載；初始矩陣不得抓取附件 bytes、preview derivative 或產生常駐預覽區。
5. 沒有額外批次提交流程。底部只有一個 `送出審核` 主動作；它顯示或鄰近呈現本次將送出的料號數，無 confirmation modal。每個料號仍建立自己的 request／snapshot／audit，不建立 root-level combined review package。
6. Part在current schema必須有exact `part_root_id`；不建立nullable-root UI compatibility。source Part存在但root identity無法解析時視為資料完整性錯誤並fail closed，不以stub或虛擬root掩蓋。
7. 材質、熱處理、表面處理與其他已確認屬性各自佔一個矩陣資料列；不得把多個屬性合併在「其他已確認屬性」彙總格。沒有同一 Part work writer 的確認屬性維持唯讀，但仍參與canonical difference提示。
7. 材質／顏色有code時，矩陣輸入控制項直接編輯label，code作為隱含配對值維護；label未變時保留code，以自由文字變更label時清除舊code，清空label時code與label皆為null。此pair語意與server normalization、difference及review snapshot一致。

### UI Entry Contract 與同根範圍

| Contract item | Rule |
|---|---|
| Target actor | 同公司、可讀 exact Part，並具現行 `create／update／submit` 或 non-owner edit scope 的工程／管理使用者；其他合法 viewer 只讀。 |
| Normal entry | Part 清單／唯讀 drawer 的既有 `建立修改` 或 `進行編輯` action 建立或開啟 source Part work，導向 `/parts/[partId]/workspace?workId=...&returnTo=...`。 |
| Stable identity | route 的 `partId` 與 `workId` 必須由 server 重驗屬於同公司、同 exact source Part；不能用可變 part number、欄位文字或 client root code 當 authority。 |
| Same-root membership | 由 source Part 的 current exact `part_root_id` 與 current canonical formal Part projection決定；只包含同公司且未被 obsolete／merged／cancelled 等 current policy排除的 formal Parts。候選、tombstone、檔名推測與跨公司資料不得加入。 |
| Root integrity | source Part與exact root皆為required identity；source存在但root缺失／不匹配時回409 blocking state，不建立虛擬root、不降級成單欄compatibility。 |
| Ordering／focus | 料號依 canonical natural order；source Part 欄進頁後捲入可見並取得矩陣焦點，不改變欄順序。 |
| Result bound | 一次完整載入最多 100 個 current Parts。超過時不得只載入部分後計算差異或允許編輯；顯示可返回清單的 blocking state，待另立 paging／virtualization contract。 |
| Return | 沿用 Part closed allowlist；reload／back／forward後由 server truth 重建 root、columns、work與rowVersion，不依賴 React memory。 |

載入、空白、restricted、not-found、conflict 與 error 狀態沿用 `PdmEditPageFrame` 的單一 page-state owner。正常畫面不顯示用途介紹、操作教學、欄位 helper、差異說明 legend或常駐成功訊息。

### Matrix read projection 與欄位 registry

Current phase需要一個 bounded、same-snapshot 的 Part matrix read projection；可 additive 擴充現有 canonical Part read service／workspace loader，但不得逐欄在 browser 發出 N 個 Part detail request，也不得建立新的 authoritative writer。最小 response contract：

- `root`: required exact `id／code`；`sourcePartId`；canonical ordered `columns`；stable ordered `rows`。source存在但root無法解析時整體409，不回`root=null`成功response。
- 每個 column 至少包含 `partId／partNumber`、formal row version、current data／handling state、`canEdit／canSubmit／disabledReason`、active `workId／workRowVersion／workOwner`（actor可合法知道時）、`valueSource=formal|work`、完整 normalized Part change payload、attachment count。
- `meta`包含 actor／company-scoped current command contract與 correlation ID；read response維持 `private, no-store`。
- 初始查詢必須 bounded 聚合 current Part、可合法讀取的 active Part work、attachment count與必要 capability；不能用 client relation matrix、visible label或附件清單回推 authority。

| Row | Canonical value／control | Editable in DEV-108 | Difference |
|---|---|---:|---:|
| 品名 | `partName`／required text | 是 | 是 |
| 料件類型 | `itemKind=purchased|manufactured`／既有 canonical select | 是 | 是 |
| 規格／特性 | `customSpecification`／nullable text | 是 | 是 |
| 材質 | `materialCode + materialLabel`／矩陣直接編輯label；label變更清code | 是 | 是 |
| 顏色 | `colorCode + colorLabel`／矩陣直接編輯label；label變更清code | 是 | 是 |
| 表面處理 | `surfaceTreatment`／nullable text | 是 | 是 |
| BOM 使用規則 | `bomUsagePolicy`／既有 enum select | 是 | 是 |
| 共用件 | `isUniversal`／checkbox | 是 | 是 |
| 變體備註 | `variantNote`／nullable multiline text | 是 | 是 |
| 已確認屬性（每個 stable key 獨立一列，如熱處理） | current `pdm_part_attribute_values` read projection；未有同一 Part work writer 時為唯讀 | 否，除非已有同一 Part work writer contract | 是 |
| 附件 | current active attachment count＋exact Part attachment入口 | 操作入口 | 否 |

空字串先依現行 writer normalization轉成 `null`；`null`與`null`相同，`null`與非空值不同。enum以key、boolean以true／false、code＋label以normalized pair比較，不以翻譯後文字或 client DOM判定。差異在本地合法 edit commit後立即重算，save readback後再以authoritative normalized payload校正。黃色列同時輸出非可見 `aria-label／aria-describedby` 與stable `data-difference=true`，但不增加可見說明。

`structureType`仍由 DEV-099 exact Part classification contract與minimal dialog治理；每個已確認屬性以獨立矩陣資料列呈現（不再彙總為「其他已確認屬性」），但沒有 Part change writer 的資料仍不得偽裝成可編輯矩陣列。

### Per-Part autosave／work orchestration contract

1. 一個 matrix column對應一個 exact Part payload與至多一個 active Part work。只有使用者提交第一個 valid normalized delta 時才懶建立 work；若已有 actor可編輯的 active work則重用，不建立duplicate。無active work時，既有create route以optional `initialPayload`在同一transaction建立formal baseline hash與第一版proposed payload，不能先commit無差異work再依賴第二個PATCH完成使用者意圖。
2. 儲存仍使用既有 `POST /api/pdm/parts/{partId}/change-works` 與 `PATCH /api/pdm/part-change-works/{workId}`。create body固定為`{} | { initialPayload: PartChangePayload }`，空body／`{}`保留既有單筆入口的baseline create相容行為；matrix第一個delta必傳完整validated `initialPayload`。後續PATCH傳完整validated Part payload、current `If-Match` row version、logical-command idempotency key與server contract token；不新增cell PATCH、root PATCH或parallel writer。
3. 同一 Part 的變更嚴格序列化，跨 Parts可有bounded concurrency。cell blur／Enter立即flush；連續輸入在800ms idle後flush。新輸入可合併尚未送出的同Part payload，但不得跳過已送出command的response／rowVersion。
4. global save status只聚合 `saving／saved／error／conflict`；正常成功不建立toast或常駐面板。cell error靠近原格，column conflict保留local input且阻擋該Part submit；不得自動拿新rowVersion覆寫或重送。
5. matrix當次建立的work若在submit前回到exact formal baseline，且沒有附件／review／其他side effect，使用既有cancel contract自動清除並移出submit count；進頁前已存在的work永不自動取消。
6. 附件是獨立mutation boundary。開啟附件管理前先flush該Part pending field save；失敗時留在原cell。附件新增／刪除不建立Part payload delta，也不因數量不同觸發黃色列。
7. pending／failed／conflict cell存在時，`送出審核` disabled。合法submit set固定為畫面中所有 `canSubmit=true`、已成功儲存且work payload與formal baseline不同的 Part works；按鈕附近顯示料號數，不要求使用者再選取範圍。
8. 點擊主動作後逐一呼叫既有 `POST /api/pdm/part-change-works/{workId}/submit`。這不是cross-Part transaction：已成功的Part維持submitted／locked，失敗的Part保留工作與輸入並可重試；重試不得重新送出已成功request。
9. Idempotency key以「一個已凍結request body＋expected rowVersion的logical command」為生命週期：新payload／新rowVersion才產生新key；network、5xx或response遺失造成結果不確定時，必須以相同body／If-Match／key重播，讓既有receipt回傳terminal result。不得用fresh key重試同一個不確定command。
10. `WORKBENCH_CONTRACT_EXPIRED`不得套用一般rowVersion conflict處理。client以同一matrix GET取得fresh token與server projection；相關rowVersion未變時保留local draft並用原logical-command key重試，rowVersion已變才標真正conflict。token refresh不可自動捨棄local draft。

`取消本次工作`、correction recovery與歷史追溯仍由既有 exact Part work／list action承接；DEV-108不新增全根號取消、批次復原或自動撤回審核。

### Keyboard、focus、viewport 與附件互動

- 使用 semantic grid／table、row header與column header；focus順序與視覺順序一致。Tab／Shift+Tab依cell順序移動，Enter commit並移到同欄下一列，方向鍵在navigation state移動；文字正在編輯時左右鍵保留caret語意，Escape回復該cell最後成功值。
- `Ctrl+C／Ctrl+V`只支援單一cell；貼上依target row type parse／validate，失敗不寫入且在原cell顯示最短錯誤。formula、drag fill與multi-cell range paste不在本期。
- 第一欄與表頭固定；矩陣是唯一水平scroll owner。1536×1024核准稿為visual baseline；1440×900與1024×768不得有page-level horizontal overflow、重疊、截斷或fixed footer遮擋。390×844一次至少可讀欄位名＋一個Part column，返回與送審可達，不把矩陣卡片化。
- 點附件數量開啟exact Part附件操作面；PDF／image才提供on-demand preview，preview error仍保留download。工程／Office／CAD等其他格式只download，不在矩陣預載或內嵌第三方viewer。

### Permission、review、failure 與 compatibility contract

- 現行 `create／update／submit／cancel`、`numbering.attachments.manage`、non-owner edit scope、company partition、active-review lock、rowVersion、idempotency、audit與reviewer authority完全保留。client可見或focus不代表可寫；server每次create／PATCH／submit都重驗。
- actor不能編輯的Part仍可在合法read scope顯示formal value；其cell使用readonly semantics與最短accessible disabled reason，不顯示假的disabled editor。沒有合法read scope的column不得hydrate。
- 已在review、system processing、terminal或stale的column不可寫；黃色差異仍按可見current values計算，不能以鎖定狀態消除差異。
- 401重新登入後fresh read；403保留合法readonly context；404移除stale source並回安全清單；source/root integrity 409顯示blocking state；`WORKBENCH_ROW_VERSION_CONFLICT`保留local input並要求manual reconcile；`WORKBENCH_CONTRACT_EXPIRED`走無損token refresh；5xx／network保留最近成功read與未儲存input並以相同logical-command key恢復。任何visible `.inline-error`、`role=alert`、4xx／5xx raw text或預期有資料卻全空均為QC fail。
- DEV-101 reviewer仍讀每個request的immutable Part snapshot／attachment manifest；不得以live editable root matrix取代review renderer、改package hash或把多個Parts包成單一decision。Drawing／Relation／BOM workspace不受本 amendment影響。

### Acceptance、FMEA 與 evidence contract

Current phase固定以下最小QA案例；本次 Implementation Readiness 已在下文補齊 exact runner／fixture／file inventory，不得縮小case語意：

| ID | Delivery-path acceptance | Required evidence |
|---|---|---|
| QA-108-01 | Part list／drawer正常入口→source workspace；exact root與all current Parts正確，valid reload／return保持上下文 | authenticated browser＋read DTO／DB readback |
| QA-108-02 | required root identity與provider NOT NULL／FK invariant成立；root integrity異常及超過100皆fail closed，不partial highlight或partial edit | provider schema／API＋browser error state |
| QA-108-03 | 全部editable registry rows可直接編輯；同Part rapid edits序列化；token到期無損refresh；autosave後reload一致 | browser interaction＋PATCH／rowVersion／token trace＋DB readback |
| QA-108-04 | sibling首個delta以initial payload原子建立work；existing合法work重用；duplicate／cross-company／non-owner旁路失敗 | API／DB／receipt／audit evidence |
| QA-108-05 | normalized相同列白底；2+ values、empty vs non-empty與local pending delta為淡黃；附件count不觸發；focus只由輸入控制項顯示單一青綠框 | 1536／1440 screenshots＋DOM semantics |
| QA-108-06 | single-cell copy／paste、Tab／Enter／arrow／Escape與focus return符合contract；invalid paste zero write | browser keyboard trace＋network evidence |
| QA-108-07 | attachment count入口可達；PDF／image按需preview＋download，其他格式download-only；初始load無attachment bytes／preview requests | browser network＋preview／download evidence |
| QA-108-08 | pending／failed／conflict阻擋submit；成功save的N個delta送出N個existing Part requests／snapshots，無root-level batch writer | browser＋API＋DB snapshot／audit readback |
| QA-108-09 | 第k個submit失敗或submit成功後response遺失時，先前success不重送，失敗／不確定Part可由receipt或readback恢復，retry只處理remaining set | fail-seeking fault injection＋receipt／request count |
| QA-108-10 | readonly、review lock、terminal、non-owner、cross-company、stale row與401／403／404／409／5xx不旁路且保留適用input | API security matrix＋browser states |
| QA-108-11 | 1440×900、1024×768、390×844無page overflow、重疊、截斷、雙重scroll或footer遮擋 | actual browser screenshots／measurements |
| QA-108-12 | DEV-101 immutable Part review、existing attachment manager、DEV-099 classification、Drawing／BOM regressions不漂移；schema／migration／new permission／new write route=0 | contract scan＋targeted regressions＋diff gate |

| Failure mode | User impact | Detection | Required control |
|---|---|---|---|
| N+1 detail／preview load | 根號料號多時畫面慢或附件成本失控 | request count／payload size | one bounded matrix read；initial preview bytes=0 |
| 同Part autosave out-of-order | 舊值覆蓋新值 | rowVersion／request trace | per-Part serialized queue＋fresh readback |
| 黃色比較用display text | 翻譯或hidden code造成假相同／假差異 | normalized fixture | compare canonical normalized values |
| submit部分成功被當成全敗／全成 | duplicate request或漏送 | fault injection＋receipt count | per-Part terminal tracking；retry remaining only |
| locked／cross-company cell仍可寫 | 未授權修改或資料外洩 | actor/company negative matrix | server revalidation＋no unauthorized hydration |
| 舊兩段式create已commit但第一個PATCH未完成 | 留下隱藏無差異work並阻擋後續 | response-loss／page-close fault＋DB readback | create optional initial payload同transaction保存第一個delta，DEV-108不得實作兩段式首次save |
| PATCH／submit已commit但response遺失 | UI誤報conflict／重送或卡住 | post-commit response-loss fault＋receipt readback | 同logical command穩定key重播terminal receipt |
| 15分鐘contract token到期 | 長時間編輯無法autosave或被迫捨棄draft | fake clock／expired-token fault | fresh GET更新token；rowVersion未變時保留draft與原command |
| deleted-data只靠UI隱藏 | 合法reader可直接呼叫API讀取已刪附件 | direct API negative | server對`surface=deleted_data`重驗manage action |

候選freeze後，QC須由AI操作實際browser完成一次final visual gate，記錄source revision／dirty boundary、route、actor、fixture、viewport、操作、network、screenshot與結果；build、typecheck或direct URL單獨不能支持UI PASS。

### RD slices、stop conditions 與 execution boundary

| Slice | Scope | Exit gate |
|---|---|---|
| 108-A Read contract | same-root matrix projection、100-column bound、capability／work／attachment-count snapshot | QA-108-01／02／04 read與negative contract可證 |
| 108-B Matrix UI | row registry、difference、in-cell controls、keyboard、responsive scroll | QA-108-03／05／06／11 visual與interaction可證 |
| 108-C Autosave | lazy create／reuse、per-Part queue、normalization、no-delta cleanup、failure recovery | QA-108-03／04／10 API＋DB可證 |
| 108-D Submit／attachments | N-work submit aggregation、partial failure recovery、on-demand preview／download | QA-108-07／08／09可證 |
| 108-E Regression／QC | DEV-101／099／083、security、schema negative diff、candidate freeze visual gate | QA-108-10～12與visible-error sweep通過 |

Stop conditions：若DEV-108自身實作需要 root-level persisted entity、一般用途cross-Part atomic writer、combined review package、new permission、schema／migration、改canonical route identity、讓附件進Part payload transaction、把recognition-only attribute變成未授權writer，或無法在100 Parts內提供bounded same-snapshot read，停止並回Dev PM重做Spec Impact／ADR／產品決策。既有create command的optional `initialPayload`屬同一Part writer的compatible extension，已由本次Human Confirmed／技術主管修正明確納入，不命中new-writer stop condition。唯一cross-Part例外是前述DEV-110 accepted ADR定義的recognition-specific bounded atomic draft handoff；該例外不改DEV-108 matrix autosave／submit orchestration，也不能被擴張為通用root writer。除此以外，DEV-108仍是既有Part domain內可逆的read projection、UI composition、same-writer transaction correction與client orchestration。

本輪已依下列 exact inventory 完成本機 implementation 與 focused QA；未修改正式schema、migration、production資料或release狀態。PostgreSQL provider gate、production migration、deploy、rollback與release仍不在本DEV本機執行範圍內。

### 2026-08-31 RD Implementation Readiness Upgrade（RD技術主管修正版）

#### Repository assessment 與框架約束

1. Current owner route `src/app/parts/[partId]/workspace/page.tsx` 已是 Next.js App Router server page，`params`／`searchParams`均為 Promise；實作保留此路由與 `force-dynamic`，只把 formal Part owner renderer換成DEV-108 matrix client boundary。
2. 互動矩陣、keyboard、autosave與局部錯誤狀態需要 Client Component；DB、company／permission guard、root membership、active work redaction與same-snapshot查詢必須留在server-only service／repository，client不可匯入DB module。
3. `CanonicalChangeWorkspace`仍負責Drawing與DEV-101 Part reviewer／snapshot相容面；owner route不再呼叫它的Part單筆表單。不得為了共用而把reviewer改成live matrix，也不得刪除generic Part renderer。
4. 現行 `PartChangeWorkService`、`PartChangeWorkAsyncRepository`、`POST /api/pdm/parts/{partId}/change-works`、`PATCH／cancel／submit /api/pdm/part-change-works/{workId}`已具company、owner/non-owner scope、rowVersion、idempotency、contract token與immutable review package。DEV-108只對既有create command做compatible extension：optional `initialPayload`與formal baseline在同一transaction保存；不新增route、command name、permission、work table或第二個writer。PATCH／cancel／submit的server domain authority不變。
5. 現行canonical file read已支援 `part_attachment`、`preview=1`與inline content disposition；附件頁只需為可預覽格式增加按需入口，不建常駐viewer、不加第三方預覽服務。
6. Schema／migration／new dependency／new env／new permission／feature flag=`none`。新增一個read-only Route Handler不是新write authority；其GET維持request-time、`private, no-store`。

#### Exact implementation inventory

| Action | Exact path | Responsibility／boundary |
|---|---|---|
| No change | `src/app/parts/[partId]/workspace/page.tsx` | 既有canonical route／Promise params與safe return維持；matrix dispatch由既有`CanonicalChangeWorkspace` owner boundary承接，不改路由identity。 |
| Add | `src/lib/part-number-matrix-contract.ts` | client-safe DTO、row registry、100／800ms／3-concurrency常數、material/color pair、logical-command idempotency、payload／cell normalization與difference pure functions；不得匯入DB或Node-only module。server的`validatePartChangePayload`仍是最終write validation authority。 |
| Add | `src/lib/repositories/part-number-matrix-async-repository.ts` | source/work guard、bounded same-root projection、active work/state、attachment count及recognition-only attributes的set-based read。 |
| Add | `src/lib/part-number-matrix-workspace.ts` | server-only service；執行snapshot、capability/redaction、integrity與source focus投影，並簽發既有workbench contract token。 |
| Add | `src/app/api/pdm/parts/[partId]/matrix-workspace/route.ts` | 唯一新增API：`GET` read projection；沿用`resolveDev087RouteActor(request, "numbering.search")`與`dev087RouteError`，不得實作POST/PATCH/DELETE。 |
| Add | `src/components/use-part-number-matrix-controller.ts` | client per-Part queue、atomic initial create/reload-reuse、stable logical-command key、800ms autosave、token refresh、flush、conflict/error保留、no-delta cleanup與sequential submit orchestration。 |
| Add | `src/components/part-number-matrix-workspace.tsx` | `PdmEditPageFrame`內的semantic table/grid、direct cell controls、keyboard、attachment navigation與single action dock。 |
| Modify | `src/app/globals.css` | sticky header／row label、matrix-only horizontal scroll、yellow difference、teal focus、cell error與四viewport layout；不得建立page-level scroll owner。 |
| Modify | `src/lib/part-change-work.ts` | `create`接受optional validated initial payload，idempotent request hash包含initial payload；仍呼叫同一repository／command name與authority control。保留目前working-tree其他DEV的formal attributes delta。 |
| Modify | `src/lib/repositories/part-change-work-async-repository.ts` | `create`鎖formal Part後分別計算formal baseline hash與validated proposed payload，在同一transaction建立work/state；empty input維持既有baseline create。 |
| Modify | `src/app/api/pdm/parts/[partId]/change-works/route.ts` | 解析`{} | { initialPayload }`；空body向後相容，未知key或invalid payload由既有canonical envelope拒絕。不得新增第二條create route。 |
| Modify | `src/components/canonical-part-attachment-manager.tsx` | 合法Part reader一律可看active attachments與preview/download；只有`canManage`才fetch／mount upload、delete、restore與deleted-data。PDF／PNG／JPEG／WEBP／GIF顯示「預覽」＋「下載」，其他格式只下載；預覽使用canonical read href加`preview=1`並按需開啟。 |
| Modify | `src/app/api/parts/[partNumber]/attachments/route.ts` | active GET維持`numbering.search`；`surface=deleted_data`在server另以`numbering.attachments.manage` action guard fail closed，不能只靠client不mount。 |
| Add | `scripts/qc-dev-108-contract.mjs` | static＋pure contract固定12 cases。 |
| Add | `scripts/qc-dev-108-repository.mjs` | task-owned isolated SQLite repository evidence（R01..R14 coverage）。 |
| Add | `scripts/qc-dev-108-postgres.mjs` | task-owned disposable PostgreSQL provider/snapshot/query evidence。 |
| Add | `scripts/qc-dev-108-browser-real.mjs` | task-owned Next runtime＋real Chromium 22-case focused gate，含matrix、autosave、DB readback與四viewport；`qc-dev-108-browser.mjs`保留conditional wrapper。 |
| Add | `scripts/qc-dev-108-aggregate.mjs` | 固定primary denominator、parent regressions、engineering gates、manifest與cleanup結果。 |
| Modify | `package.json` | 新增`qc:dev-108:contract／repository／postgres／browser／browser-real／aggregate`與`qc:dev-108`；不得新增package dependency或改既有script語意。 |

Validation-only／no-touch authority：`src/components/canonical-change-workspace.tsx`、`src/components/canonical-review-package-workspace.tsx`、`src/lib/pdm-canonical-command.ts`、`src/lib/pdm-canonical-workbench-contract.ts`、`src/lib/pdm-review-package.ts`、`src/lib/part-structure-classification.ts`、`src/app/api/pdm/file-assets/[fileAssetId]/route.ts`、`db/schema.sql`與`db/postgres/*`。既有idempotent receipt與15分鐘token contract只被client正確使用，不修改其authority；只有實作證明本節compatible create extension或schema invariant無法滿足已確認contract時才觸發Stop Condition，不可順手擴scope。

#### Read API 與 DTO contract

Canonical request固定為：

`GET /api/pdm/parts/{partId}/matrix-workspace?workId={sourceWorkId}`

- path `partId`與query `workId`皆為exact UUID identity。source work不存在、跨公司、與Part不匹配時回404；actor既非owner也無non-owner edit scope時回403，不以錯誤文字洩漏其他工作內容。
- source work的canonical state缺失、work/state不一致、source root缺失／不匹配或authority不完整時回409並禁止hydrate editable UI；root超過100個current Parts時回422 `WORKBENCH_BAD_REQUEST`與固定使用者訊息，不回partial columns。
- 成功response為`{ data, meta }`；headers固定`cache-control: private, no-store`。`meta`至少含既有`contractToken／correlationId`與`canManageAttachments`。
- `data.root={ id, code }`、`sourcePartId`、ordered `rows`及ordered `columns`。column最小shape：
  - `partId／partNumber／sequenceNo／recordStatus／formalRowVersion`；
  - `formalPayload`與actor可合法看見的`effectivePayload`；
  - `valueSource=formal|work`、`attachmentCount`；
  - `work=null | { workId, rowVersion, handling, ownerScope=self|editable_non_owner|other }`；
  - `capabilities={ canEdit, canSubmit, disabledReason }`；
  - `confirmedAttributes`以stable key保存`label／applicabilityState／value／unit`。
- 不具work讀取／編輯權的column只hydrate formal payload；不得把其他使用者未送審proposed payload傳給browser。owner或具non-owner edit scope者才可取得可編輯work payload。`handling!==owner`一律readonly且不可submit。
- `rows`先輸出九個固定editable rows，再輸出active且`legacy_target_key IS NULL`的recognition-only rows（每個`display_label, stable_key`各自成列並排序），最後是附件row；不得把多個已確認屬性合併成單一「其他已確認屬性」cell。material/color cell直接編輯label；label未變保留code，自由文字改label清除對應code，清空label則pair皆為null，避免舊code與新label形成假pair。

#### Same-snapshot query plan 與bound

Domain projection在一次`withPdmWorkbenchReadSnapshot`內最多三個set-based statements；auth／company resolution與authority-token control read另計，但必須記在evidence：

1. `source_guard`：以`company_id + source part id + source work id`連結Part、Root、`part_change_works`與`canonical_workbench_states`，驗證exact owner/work/state及取得required root；source存在但root join缺失／不匹配視為integrity 409，不提供nullable-root compatibility。
2. `root_columns`：對exact root依`sequence_no ASC, part_number ASC, id ASC`取得`LIMIT 101`，只含`record_status NOT IN ('Obsolete','Merged')`；同一statement LEFT JOIN formal state、variant attributes、active work/work state與pre-aggregated active `file_assets` count。讀到101筆立即fail closed，不裁成100。
3. `confirmed_attributes`：只對上一步最多100個Part IDs set-based讀取active definitions與current confirmed values；不得逐Part查詢。

PostgreSQL必須由既有helper使用`REPEATABLE READ READ ONLY`；SQLite使用同一transactional snapshot abstraction。任一column出現work存在但state遺失、duplicate／mismatched identity或source未包含於current scope，整個response回409。初始GET的file-read／preview request count與attachment bytes必須為0。

#### Client state machine 與exact orchestration

1. `use-part-number-matrix-controller`以`partId`為queue key；每一Part同時最多一個create/PATCH/cancel在flight，跨Part flush pool固定最多3。尚未送出的同Part edits可合併；已送出request的response與rowVersion不可跳過。
2. edit先更新local draft並立即重算difference。blur／Enter呼叫`flushPart`；其他連續輸入在最後一次change後800ms flush。required／enum／boolean／pair normalization失敗只在原cell顯示，zero write。
3. 無work的第一個valid delta以既有create route送`{ initialPayload: fullDraft }`與`If-Match=formalRowVersion`；server在同一transaction建立formal baseline hash、proposed payload、work與state，成功response即是第一筆authoritative save，不再接第二個PATCH。create若回`WORKBENCH_ACTIVE_WORK_EXISTS`，只重讀matrix一次；若fresh response顯示actor可編輯既有work且local draft仍有效，才以新的PATCH logical command保存draft，否則停在readonly/conflict，禁止create loop。
4. 每一個outbound create／PATCH固定request body、expected rowVersion與一個idempotency key，直到收到terminal response或readback完成reconciliation；只有newer draft形成下一個logical command時才產生fresh key。PATCH response payload是authoritative normalized saved payload；flight期間若又有新edit，保留newer draft並排下一次flush。
5. `WORKBENCH_ROW_VERSION_CONFLICT`保留local draft、標記整欄conflict並阻擋submit；不自動換rowVersion重送。使用者可明確選「重新載入此料號」以fresh server值取代該欄local draft，不使用confirmation modal。network／5xx／response loss保留draft並先以exact same request／If-Match／idempotency key原位retry；terminal receipt replay成功即按正常response收斂，不得換fresh key製造假conflict。
6. 只有本次client session自己建立、尚未開過附件、沒有review/side effect且saved payload回到formal baseline的work才自動呼叫既有cancel。reload後來源不明的work一律視為pre-existing，不自動取消。
7. 點附件前先`flushPart`；成功後導向`/parts/{partNumber}/attachments?returnTo={current matrix URL}`。附件頁先以既有`numbering.search` page guard載入active list；`numbering.attachments.manage`同時在UI與server控制upload／delete／restore與deleted-data，無manage時不得fetch deleted-data，也不得把有read權的使用者整頁擋成restricted。PDF/image preview由附件頁上的使用者手勢才發出`preview=1`；preview 202／503時仍保留原檔下載。
8. submit前先`flushAll`；任一pending／error／conflict存在時disabled。eligible set依natural column order固定，逐一、concurrency=1呼叫既有submit；每個Part的submit logical command固定latest rowVersion、request body與idempotency key直到terminal resolution。成功立即標記terminal、不得重送；第k筆明確失敗後停止，保留remaining set。response遺失時先以same key replay；若仍無terminal response才fresh GET，exact work已為`review_owner`即依server lifecycle truth標成功，仍為owner且rowVersion相同才重播same key，其他狀態轉conflict。browser case另以DB readback證明active review request仍唯一。retry從第一個未terminal Part繼續。全部成功才return到safe Part list，partial failure留在matrix。
9. `WORKBENCH_CONTRACT_EXPIRED`為authority refresh而非data conflict：以current route重新GET matrix取得fresh token。各Part rowVersion未變時merge fresh projection與local draft，並用原logical-command key繼續；已變才標該Part conflict。refresh不得呼叫writer、不得丟棄draft、不得重送已terminal submit。
10. `PdmEditPageFrame.isDirty`只代表尚未成功flush的local delta，不能把已成功autosave的work誤當browser unsaved。返回時有pending/error/conflict存在才觸發既有leave guard；單純saved work可安全離開。

#### Fixed runner／case registry

Primary planned denominator固定為62：contract 12、SQLite repository 14、PostgreSQL repository 14、real-browser 22；provider重跑是獨立evidence，不合併成一個假case。

| Runner IDs | Fixed coverage | Maps to |
|---|---|---|
| `C01..C12` | exact route/client boundary、row registry、constant、no new writer/schema/permission、review/file-read/no-forbidden-UI、manifest cleanup contract | QA-108-01／05／07／12 |
| `R01..R14` per provider | source/work guard、membership/order、required-root schema／FK invariant、100/101 bound、status exclusion、payload normalization、self/non-owner/other-work redaction、handling lock、attachment count zero-bytes、confirmed attrs、≤3 domain queries、cross-company/integrity fail-closed | QA-108-01／02／04／10／12 |
| `B01..B05` | list/drawer→owner、reload/return/source focus、page states、all controls、difference/semantic/focus styling | QA-108-01／03／05 |
| `B06..B11` | keyboard/clipboard、same-Part serialization、cross-Part max3、atomic initial create、existing/race reuse、save error/409、session-only no-delta cleanup | QA-108-03／04／06／10 |
| `B12..B15` | initial attachment network=0、flush/navigation、PDF/image preview+download、other download-only、N-submit與第k筆failure/retry remaining DB/audit readback | QA-108-07／08／09 |
| `B16..B18` | role/company/state/direct bypass、1536/1440/1024/390 geometry、a11y/visible-error/noise sweep與review/classification regressions | QA-108-10／11／12 |
| `B19..B22` | atomic initial create中斷、PATCH commit-response-loss、submit commit-response-loss、15分鐘token expiry無損refresh | QA-108-03／04／09／10 |

Exact case names不得在實作時重新編號：

| ID | Exact planned assertion |
|---|---|
| C01 | Part owner page await動態參數、只接受workId並以closed allowlist normalize return。 |
| C02 | owner route使用獨立matrix client boundary；Drawing與review仍走既有renderer。 |
| C03 | 固定row registry順序、control type與dynamic readonly attribute placement符合contract。 |
| C04 | 100／800ms／3 constants與payload、null、enum、boolean、material/color pair及logical-command key normalization為client-safe pure contract。 |
| C05 | difference只比較canonical normalized value；附件row永不標差異。 |
| C06 | source中不存在single/batch tabs、scope picker、merged cell、right editor、confirmation modal、formula或range paste。 |
| C07 | client只呼同一create／PATCH／cancel／submit writers；create optional initial payload不產生新route／command，new matrix route只有GET。 |
| C08 | schema、PostgreSQL migrations、permissions、dependencies、feature flags均無DEV-108 delta。 |
| C09 | DEV-101 Part review renderer、snapshot/package hash與decision route無DEV-108 delta。 |
| C10 | attachment preview只組canonical `pdmFileReadHref`＋`preview=1`，無third-party viewer。 |
| C11 | semantic table/grid、row/column headers、difference semantics、visible focus及matrix-only scroll selectors存在。 |
| C12 | package scripts完整、aggregate固定62分母、runtime declaration／invariants／finally cleanup與Not Run保存存在。 |
| R01 | source Part/work exact same-company match；mismatch、cross-company與unauthorized owner fail closed。 |
| R02 | exact root membership只含current formal Parts，不含Obsolete／Merged／candidate／tombstone。 |
| R03 | columns依`sequence_no, part_number, id`deterministic natural order且source focus不改順序。 |
| R04 | SQLite／PostgreSQL皆證明`part_numbers.part_root_id`為NOT NULL且FK開啟時orphan insert失敗；read contract不含nullable-root success branch。 |
| R05 | 1／100 Parts完整成功；101 Parts整體422且不回partial columns。 |
| R06 | formal core＋variant rows組成完整validated `PartChangePayload`；label未變保留code、自由文字改label清code、清空label清pair，且server normalization正確。 |
| R07 | self-owned active owner work使用work payload／rowVersion並可edit/submit。 |
| R08 | actor具non-owner scope時可hydrate並reuse他人owner work，capability由server重算。 |
| R09 | actor無non-owner scope時只見formal payload，other work payload／raw owner identity不hydrate。 |
| R10 | review_owner／system／blocked／terminal column readonly，disabled reason與canSubmit一致。 |
| R11 | work/state遺失、identity mismatch或source不在scope時整體409，不部分開放。 |
| R12 | active attachment count set-based正確；repository不讀storage object、preview derivative或file bytes。 |
| R13 | active non-legacy confirmed attributes set-based、stable sorted；not_applicable/value/null比較正確。 |
| R14 | domain statements≤3且在同一snapshot；SQLite／PostgreSQL輸出shape、redaction與query count一致。 |
| B01 | Part list／drawer建立或進行編輯後到exact matrix；reload、back/forward與safe return正確。 |
| B02 | source欄自動捲入可見並取得focus；root code、all columns與header identity正確。 |
| B03 | loading、403 readonly、404、409、5xx、network、101 blocking state皆無raw error或空白誤導。 |
| B04 | 九個editable rows的text/select/textarea/checkbox均可直接編輯；readonly row沒有假editor。 |
| B05 | all-same白底、two-values與null-vs-value淡黃、附件count不黃、active cell只有teal focus及semantic marker。 |
| B06 | Tab／Shift+Tab／Enter／Escape／arrows與single-cell copy/paste正確；invalid paste zero write。 |
| B07 | 同Part rapid edits網路嚴格序列、舊response不覆蓋新draft，reload為最後成功值。 |
| B08 | 不同Parts同時flush的inflight峰值≤3，單Part仍≤1。 |
| B09 | sibling首個valid delta以optional initial payload只create一次且不接PATCH；DB同一transaction只有一個exact work／state，formal base hash與proposed delta正確。 |
| B10 | pre-existing self/non-owner work直接reuse；create race 409只reload一次且不形成loop/duplicate。 |
| B11 | PATCH rowVersion 409／500／network保留local draft並阻擋submit；explicit reload或same logical-command retry後可恢復。 |
| B12 | session-created work回baseline且無side effect會cancel；pre-existing/reloaded/attachment-visited work不自動cancel。 |
| B13 | initial matrix沒有file-read／preview bytes；附件click先flush再以exact partNumber進既有manager並可返回；read-only合法reader可見active list。 |
| B14 | PDF/image由使用者手勢preview＋download，STEP/CAD download-only；preview 202／503仍能download；無manage權限時upload／delete／restore／deleted-data皆不fetch／不mount，direct deleted-data GET回403。 |
| B15 | 三個saved delta依natural order建立三個existing review requests/snapshots；第2筆fault後第1筆不重送，retry只送第2／3筆。 |
| B16 | Engineer owner/non-owner、Manager、Manufacturing、review-lock、cross-company與direct API bypass符合permission/state且zero unauthorized write。 |
| B17 | 1536×1024、1440×900、1024×768、390×844無page overflow、重疊、footer遮擋或雙重水平scroll。 |
| B18 | keyboard/a11y、visible-error/noise sweep、DEV-101 reviewer、DEV-099 classification與attachment manager targeted regression通過。 |
| B19 | first-delta create在server commit後response遺失或browser立即離開；same-key replay／reload讀回exact proposed delta，零baseline-only orphan。 |
| B20 | PATCH commit後response遺失；same body／If-Match／key replay terminal receipt，不產生fresh-key假409，newer local edit仍排下一command。 |
| B21 | submit commit後response遺失；same-key replay或exact review-state readback標terminal，active review request仍只有一個，remaining Parts不漏送／不重送。 |
| B22 | fake clock使15分鐘token到期；fresh GET更新token、未變rowVersion保留draft並以原key完成save／submit；rowVersion已變才進conflict。 |

Package commands固定為：

```powershell
npm.cmd run qc:dev-108:contract
npm.cmd run qc:dev-108:repository
npm.cmd run qc:dev-108:postgres
npm.cmd run qc:dev-108:browser
npm.cmd run qc:dev-108
```

Aggregate除62項primary registry外，必須順序執行`qc:dev-083:contract`、`qc:dev-083:api`、`qc:dev-087:contract`、`qc:dev-087:commands`、`qc:dev-087:part-attachments`、`qc:dev-099:contract`、`qc:dev-101:contract`、`qc:dev-101:package`、`qc:master-attachments`、`typecheck:app`、affected-file ESLint與`build:isolated`。DEV-083舊Part單筆視覺／顯式Save assertion若存在，必須標成DEV-108 intentional replacement並保留歷史結果，不能修改expected後假報PASS；DEV-087 create／command parent assertions必須同時覆蓋empty-body baseline backward compatibility與initial-payload atomic path，DEV-101 reviewer與writer/API assertions不可接受superseded。

#### Fixture、fault、evidence 與cleanup

- stable fixture建立company A的Engineer／Manager／Manufacturing與company B actor；root `A0006`至少5個current Parts，含all-same、two-values、null-vs-value、self work、editable non-owner work、other-user locked work與review-locked work。另建exact 100與101 Parts roots、PDF／PNG／STEP attachments及可被選出的reviewer；不得用no-root stub製造current schema不可存在的成功案例。SQLite／PostgreSQL直接驗NOT NULL／FK並以實際rejected insert保存證據。
- named faults固定：`create_active_work_race`、`create_commit_response_lost_or_page_close`、`patch_delay_out_of_order`、`patch_row_version_conflict`、`patch_network_or_500`、`patch_commit_response_lost`、`submit_fail_at_k`、`submit_commit_response_lost`、`contract_token_expired`、`preview_pending_or_unavailable`。fault解除後必須由相同UI路徑或canonical receipt／fresh read恢復，不能直接SQL修結果。
- browser/runtime啟動前輸出project、purpose、port、owning process tree、cleanup condition、`PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`與mutation scope；使用task-owned copied/seeded SQLite及isolated repository/dist。PostgreSQL runner使用task-owned cluster/DB/port並在finally停止、關閉connection及移除temp。
- fixture seed前先驗source snapshot的master counts、canonical root/Part identity、migration residue與global FK；primary SQLite schema、canonical identity、counts、migration residue、root references及`PRAGMA foreign_key_check`在aggregate前後必須一致。fixture每個business mutation寫入ledger。
- evidence root固定`output/qa/dev-108/{runId}/`；`manifest.json`至少保存HEAD／dirty boundary、runtime declaration、62-case denominator、actor／fixture、query counts、request trace、rowVersion／idempotency lifecycle、contract-token refresh、DB／receipt／snapshot／audit readback、viewport geometry、screenshots、browser errors、failed responses、primary invariants及cleanup。FAIL／BLOCKED／Not Run不得從分母消失。

#### Slice、估工、Git boundary 與readiness conclusion

| Slice | Exact owner | Estimate | Exit |
|---|---|---:|---|
| 108-A Read projection | contract／matrix repository／service／GET route | 2–3 person-days | C／R source、required-root invariant、bound、provider、security與query gate |
| 108-B Matrix surface | page／matrix component／CSS | 3–4 person-days | B01–B05、B17–B18 |
| 108-C Autosave／atomic create | controller、existing create service／repository／route、matrix integration | 2.5–3.5 person-days | B06–B11、B19–B20，rowVersion／receipt／token／failure trace閉合 |
| 108-D Submit／attachment | controller、matrix、existing attachment manager／GET route | 2–3 person-days | B12–B16、B21–B22，preview cost、permission與partial recovery閉合 |
| 108-E QA/QC closure | six runners、package scripts、evidence | 3–4 person-days | 62/62＋parent/engineering gates |

總估工為`12.5–17.5 person-days`，是單一RD依A→E順序加QA自動化的工程估算，不是日曆承諾；相較前版增加existing create transaction、permission route與四個fail-seeking browser cases。B／C／D會接觸相同component/controller，禁止多個RD在同一dirty worktree平行改檔；若要平行，只能把108-A matrix repository與108-E runner scaffold放在獨立worktree，merge前重跑aggregate。

Assessment baseline：branch=`持續優化2`、HEAD=`91de270c3a644dfbcbee49ed255b3c18e13df9dd`、workspace dirty entries=`871`。直接既有target中，Part workspace page為clean SHA `c684a56ba4776f9586b6378ea51090ccc6fbc8ef`，attachment manager為clean SHA `3ccf89d515eef5e76f34d0e6f0c04a6d58258eec`；Part change repository／create route／attachment GET route為clean SHA `bb4187768abc1b351423b9f0eef42365dd39aca4`／`39b700601efbc9345173f761198bff681a8f2b62`／`8159b4465ef74cb43ccbdd01ef791afc0fcaca5d`。`src/lib/part-change-work.ts`已有其他DEV的formal attributes delta（WT `5df116c0142f61363310a41567a8af20d7fcff9c`、HEAD `cd6d056d3b9764e09771a05fe8f29b60c95d196b`、`+13/-3`），atomic create實作保留並在同檔整合；`package.json`亦為其他任務dirty（WT `94d6c35bf250c08da763c6fdbe189cf6c55228a4`、HEAD `8d301309a625ab8996ce4caf3a78b6ef534fbbd4`、`+27/-0`），僅增DEV-108 keys。`src/lib/pdm-canonical-workbench-contract.ts`已有非本DEV dirty delta且列為no-touch；未為token refresh或limit code改動它。

Readiness conclusion：RD技術主管提出的五項P1已完成文件封口：首次delta原子create、same-command idempotency replay、15分鐘token無損refresh、deleted-data server permission及material/color／required-root repository fact correction。Human product gaps=0、P0/P1 planning gaps=0、schema/migration/ADR gap=0；exact add/modify/no-touch files、query plan、DTO、state machine、62-case runner denominator、fixture/fault、estimate與cleanup均已固定，且本機 implementation 已依此完成。若後續實作需要突破本節Stop Conditions、無法維持三個domain statements／100-Part bound，或DEV-101 immutable review必須跟著改，立即停止並回Dev PM；不得以擴scope方式自行解決。

### 2026-08-31 DEV-108 Local Implementation Evidence

- Implementation status：`RD Implemented Locally / Focused QA Passed / PostgreSQL Provider Gate Not Run / Production Release Gated`。實際變更集中在 matrix read contract／repository／service／GET route、`PartNumberMatrixWorkspace` client table、existing Part create optional `initialPayload`、attachment manager／deleted-data server guard、global matrix CSS與DEV-108 runners；未新增schema、migration、permission、dependency、root writer或combined review package。
- Engineering gates：`npm.cmd run typecheck:app` PASS；`npm.cmd run qc:dev-108:contract` `C01..C12` PASS；`npm.cmd run qc:dev-108:repository` SQLite focused evidence PASS；`npm.cmd run qc:dev-108` aggregate完成，primary denominator固定62，available gates PASS，PostgreSQL明確保留NOT_RUN。
- Evidence reports：contract=`output/qa/dev-108/contract/report.json`；SQLite=`output/qa/dev-108/repository/report.json`；PostgreSQL=`output/qa/dev-108/postgres/report.json`（`PDM_POSTGRES_URL`未設定，未接觸primary／shared DB）；real browser=`output/qa/dev-108/browser-real/DEV108-2026-08-31T09-27-52-967Z/report.json`，`B01..B22` denominator=22、matrix／autosave readback PASS，1536／1440／1024／390四視窗無page-level horizontal overflow且visible alert=0。
- Browser screenshots：`output/qa/dev-108/browser-real/DEV108-2026-08-31T09-27-52-967Z/screenshots/matrix-desktop.png`、`matrix-laptop.png`、`matrix-tablet.png`、`matrix-mobile.png`。實機 gate 另證明 sibling 首次delta以單一 atomic initial payload create 保存，readback值正確；材質、熱處理、表面處理等確認屬性各自成獨立列且無「其他已確認屬性」彙總列；可維護格直接呈現輸入控制項且focus只有控制項單一青綠框；附件初始載入不讀bytes，預覽仍為使用者手勢觸發的on-demand canonical file read。
- Isolation／cleanup：browser與repository runner均使用task-owned `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`與短生命週期port；runner finally已停止task-owned Next child、釋放port、移除fixture／dist temp，並以primary snapshot／FK invariants確認未寫入正式資料。PostgreSQL 14 cases與正式migration／activation／deploy／release仍是後續獨立gate，不得以本機SQLite／browser PASS代替。

## 2026-08-31 DEV-107 Amendment - 智慧辨識內嵌寫入與送審前再編輯

Status：`RD Implemented Locally / Human Confirmed / Local QA-QC Complete 38/38 PASS / Production Release Gated`。完整狀態、exact inventory、single commit、purpose／evidence-origin candidate overlay、全域鎖序、送審snapshot、053 migration、四個slice／估工與38案runner authority位於`SPEC-PDM-DRAWING-RECOGNITION-001` §34、配對ADR及`qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md` §10；本節只固定DEV-079的UI placement與相容性。

- canonical Drawing workspace右欄的`智慧辨識`task panel是辨識核對、寫入狀態與formalization的唯一可見mutation owner。clean saved projection可背景執行零寫入preflight；有dirty候選時同一個`確認寫入 PDM`手勢依序保存、fresh preflight及原子寫入，不另顯示儲存主按鈕，不導向獨立辨識頁、不開impact／confirmation modal，也不在畫面重複完整候選表。
- 首次寫入前沿用現有候選欄位直接核對／修正。成功寫入且未送審時提供次要`編輯`；formalized parent以`purpose=amendment` successor承接candidate overlay並共用immutable evidence origin，dirty時顯示`有未寫入修改`，由`更新寫入 PDM`或`取消編輯`結束。舊session、raw evidence、decision與event不可改寫。
- 本amendment有意取代下文DEV-079「進階歸類與正式寫入仍由既有完整核對頁負責」、智慧辨識列的「完整核對入口」及acceptance中把impact／正式寫入排除在panel之外的條款。舊`/numbering/recognition/[sessionId]`只保留安全redirect compatibility，不再render獨立工作台；其餘Drawing full-page workspace、visual-first雙欄、右欄scroll owner、底部單一lifecycle action bar、safe return與drawer唯讀契約不變。
- 「辨識不是送審hard gate」收斂為精確規則：無session、processing、extraction failed、只有raw proposal、ignored／deferred／unclassified、identity／evidence-only或沒有accepted intended write，不得新增submit blocker；本機未儲存edit由client阻擋，已保存且會實際改變PDM或仍有formalization blocker的接受／修正／映射結果，由server submit command重驗後阻擋。
- submitted／reviewing期間panel唯讀且review snapshot不可變；returned重新開放owner amendment；Approved／Released只能走既有正式變更／new revision。Part明細只投影最後成功值與來源狀態，不建立第二個recognition／Part writer，也不提供另一個`寫入 PDM`入口。
- 本修訂不新增permission、lifecycle、approval authority或feature flag；DEV-107明確新增的053 additive schema（`session_purpose`／`evidence_origin_session_id`）由主recognition SPEC與配對ADR管制，並已完成migration／provider parity與38案aggregate gate。Implementation以parent lock、deterministic generation、platform receipt、SQLite `BEGIN IMMEDIATE`及PostgreSQL serializable retry封口單一open successor；若後續仍需persistent cross-page draft／新writer／超出053的schema，必須停止並回Dev PM重做Spec Impact／ADR。

## 2026-08-26 DEV-101 Amendment - Review package與domain renderer共用

Status：`Local RD Corrective Implementation Complete / Human Confirmed / Fixed QA 48 Not Run / Independent QC Required / Production Release Gated`。

DEV-101不把review responsibility放回drawer，也不改Drawing／Part owner drawer的快速查閱責任。它對covered v2 PDM review作以下窄幅取代：

- `/approvals/[requestId]`以full-page package shell承載完整同根snapshot matrix、active target、drift compare與single decision dock；approval drawer／owner drawer都不是正式decision body。
- Drawing／Part editor與review各自共用同一domain content renderer；`PdmEditPageFrame`仍只負責mechanics，不能加入domain switch或decision authority。
- DEV-067 surface-based`none／summary／full`只保留drawer read projection，不再裁切v2 review domain content。所有target完整資訊可達，但一次只mount active target。
- matrix在review永遠readonly navigation；DEV-090 owner drawer的formal relation edit仍是唯一current relation writer。
- v2 Part attachment section顯示submitted manifest，不再顯示live list＋常駐scope note；附件仍可獨立維護、不進decision basis。
- Drawing editor／reviewer共用同一recognition panel與server-projected fields；review surface以immutable package projection啟動snapshot mode，不輪詢、不呼latest recognition，也不暴露recognition mutation。

Exact authority：`.ai-doc/specs/SPEC-PDM-APPROVAL-CANONICAL-REVIEW-WORKSPACE-001-snapshot-package-and-shared-renderers.md`。其餘drawer、owner editor、generic approval與Relation edit契約不變。

## 2026-08-23 DEV-090 Amendment - Drawer 關聯矩陣直接正式編輯

Status: `RD Implementation Complete / Local QA-QC Complete / Production Gated`。

DEV-090 activation後，Drawing／Part drawer以`關聯矩陣`取代`直接關聯`，並在該段提供server-authorized `編輯關聯`、三態cell、`儲存／取消`。這是對DEV-083「Part／Relation drawer全面zero-write、所有Relation mutation導向full-page workspace」的窄幅`Intentional replacement`：

- 只有root-level關聯矩陣可在Drawing／Part drawer寫入；Drawing revision內容、Part主資料、附件、history、review與其他drawer section仍遵守既有唯讀／full-page owner契約。
- direct edit不建立通用drawer command bus；Relation projection擁有typed state與`PATCH /api/pdm/relations/[rootId]/matrix`，shared drawer只提供geometry、dirty guard、focus與action placement。
- 儲存前變更只在browser memory；一次儲存原子更新正式`drawing_part_links`，不autosave、不建立Relation work／review或專用workspace。
- Relation list/drawer與專用Relation workspace已在本機DEV-090 replacement／migration／retirement gate後移除；正式環境仍須完成provider-aware migration與zero-loss cutover gate。

完整authority：`.ai-doc/specs/SPEC-PDM-INLINE-RELATION-MATRIX-001-direct-formal-edit.md`；ADR：`.ai-doc/decisions/ADR-PDM-RELATION-EDITING-001-direct-formal-authority.md`。

## 2026-08-22 DEV-087 Target-State Amendment - 極簡唯讀抽屜與受控狀態動作

Status: `RD Implementation Ready (RD Supervisor Reviewed) / Human Confirmed / DEV-087 activation only`.

本節只在DEV-087 canonical state啟用時取代既有status/action composition；啟用前現有DEV-083 runtime仍是baseline。本節不重構Drawing現有full-page editor，也不新增角色／permission code。若舊drawer/status/action規則與本節衝突，以本節為主；activation時拆除舊composition與fallback，不保留雙軌相容。

### 固定資訊與章節

Drawing／Part drawer固定順序：`主識別／品名／處理狀態` → `主要內容／預覽` → `關聯矩陣` → `直接關聯` → `受阻資訊（條件式）` → `歷史版次（Drawing only）` → `動作區`；不再存在獨立Relation drawer。

- Drawing顯示exact revision、2D/3D、受控檔、關聯矩陣、直接關聯與歷史版次。Part沒有版次／歷史，顯示關聯矩陣與直接關聯；root不再有獨立drawer、版本／歷史／共同檔案或直接關聯區。
- 可見處理文字只可為`負責人處理／審核負責人處理／系統處理／系統管理員處理／受阻`，正常留空；不得依viewer改成你我他或姓名。
- `system_admin`只顯示`請系統管理員處理`；`blocked`只顯示一項人類原因。兩者都沒有恢復／處理假CTA。
- branch/source/predecessor、raw status、package/baseline/workflow/approval、人名與日期不進drawer、DOM accessible name、tooltip或popover。

### 主要 action、受控風險 action 與 server descriptor

| Row/state | Server-authorized action | 無權限或不適用 |
|---|---|---|
| Drawing production，open branch `<3` | `進版`→server target modal | 隱藏；達3個時停用並顯示`已有 3 個研發分支，請先完成其中一個` |
| Drawing RD mutable work | `進行編輯` | 唯讀、無action |
| Drawing RD review，exact reviewer | `前往審核` | 其他viewer唯讀、無action |
| Drawing RD idle | 主要 `進版`→同branch target modal；次要風險 `申請作廢`→確認後送審 | 隱藏 |
| Part formal／Relation formal，無work | `建立修改／建立調整` | 隱藏 |
| Part／Relation mutable work | `進行編輯` | 唯讀、無action |
| Part／Relation review，exact reviewer | `前往審核` | 其他viewer唯讀、無action |
| system／system_admin／blocked | 無 | 只顯示狀態／原因 |

open Drawing branch上限為3，包含active與approved-idle；這是server/transaction authority，不以UI count判定。Manufacturing可在同公司清單／drawer看到production與所有最多3個current RD rows，但沒有create/edit/submit/cancel/review action。Owner可依action permission處理自己的work；具`hasPdmNonOwnerEditScope`且通過action permission與lifecycle gate的同公司使用者可處理非本人work；exact reviewer只在canonical request route決定；其他non-owner唯讀；cross-company／未授權不得hydrate drawer或artifact。

### target modal、editor與return

- list/page只擁有開drawer；drawer通常只擁有一個主要navigation action。Drawing RD idle 是唯一例外：除主要`進版`外，可有一個視覺降階、與主要動作分離的風險 action `申請作廢`；target／confirmation modal擁有最後選擇與confirm，modal開啟時底層inert。
- production `M`由server提供`M+1`與最小未占用RD `M.n`；RD `M.n`提供大於`n`的最小未占用minor，且branch base仍current時才可提供`M+1`。stale branch只可續minor，顯示`量產基準已更新，這個研發分支只能繼續研發版`。
- server原子建立／沿用branch、claim、work、canonical row成功後才導航exact full-page editor。Drawing沿用現有獨立編輯器；Part／Relation維持各自domain editor。
- 操作超過5秒顯示進行中並防重送；失敗保留modal、focus error summary且無partial create。取消／Escape回原drawer row並恢復focus/scroll；drawer body與modal body各自是唯一scroll owner。
- reviewer route可與owner route不同，但必須使用相同domain editor components、data及layout的fully-readonly模式。Part review attachment依DEV-087直接契約及現行附件authority保持live，附件區顯示`附件獨立維護，不屬於本次資料核准`；此note不進一般drawer。後續DEV-088不是此畫面的實作前置。
- `申請作廢` 只在 open、idle、latest approved RD 且無active work／pending void request時顯示。確認文案為`核准後，研發版 {revision} 將不再有效，這一系列研發版會從目前清單移除，且無法復原`；核准並formalize後關閉整個branch、移除current row並釋放branch cap，不提供reopen或restore入口。退回修改則結束本次request並恢復idle open。

本節由DEV-087 `QA-087-048..054、078、080、082、083、085、093、094、101..107、110、115..120`驗收。

## 2026-08-20 DEV-083 RD Implementation Contract - 料號／圖料唯讀抽屜與完整 URL 編輯工作區

Status: `RD Implemented / Human Confirmed / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Affected Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition / Production Release Gated`.

Execution Boundary：本節已完成並在本機落實083-A～D；focused contract/API、isolated build、disposable authenticated browser與disposable mutation已取得PASS。最新browser evidence為22 runner checks／三viewport／zero-write network，manifest `output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`；最新mutation evidence `output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json` 以disposable SQLite＋Chromium完成31/31 result rows PASS、cleanup=removed，驗證candidate lifecycle／recovery、Part variant、Part／Drawing／Relation Engineer owner/non-owner與Manager／Admin同公司正向、Manufacturing fail-closed、cross-company denial、Relation五種操作與reviewer `needs_info`／reject／approve／scope denial／snapshot drift／retry的exactly-once、readback、audit，已直接關閉QA-083-11/12/13/17/18/19。另修正candidate cancel payload邊界、server actionBar gate封住Part unauthorized write controls、審核 retry request 的JSON content type、safe-return hydration wait、Windows disposable cleanup tolerance，並在既有Part attachment與Drawing revision upload route補same-company resource guard，封住cross-company route intent寫入。最新完整aggregate manifest `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為30 child／29 PASS／1 DEV-072 parent baseline FAIL（`accepted-superseded`）；DEV-072 runner另已將readiness probe每次2秒可取消、legacy marker wait限縮5秒，保留舊expected而避免過時基準無界掛住。DEV-067 parent browser最新manifest `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json`為18/18、browserErrors=0、failedResponses=0，已解決responsive candidate marker baseline。DEV-072 bounded manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留fixture／cleanup與obsolete marker觀測；DEV-079 contract 22/22、layout 3/3與recognition layout 3/3承接現行readonly drawer／canonical full-page replacement，原始failure與expected均保留並標記`accepted-superseded`；2026-08-20 QC disposition 已接受該replacement並關閉QA-083-24。`typecheck:app`、affected lint、isolated build、DEV-070 browser與DEV-079 contract均已在目前工作樹重跑PASS。QA-083-01～24已具備closure evidence；不得自行 stage、commit、merge、PR、deploy、release、修改 production／shared data，或擴張到未列檔案、Drawing 重構、schema、permission、lifecycle 與新 write API。

### 問題、效用與核心流程

圖號工作台已把「清單中快速閱讀」與「完整編輯任務」分流，但料號與圖料工作台仍在 candidate、formal、legacy、unified 與 approval drawer 內保留寫入。這使三個工作台的使用者心智模型不一致，並讓 drawer 同時承擔查閱、表單、檔案、關聯維護、送審、撤回與審核決策，增加誤操作、長表單捲動、返回脈絡遺失與同一 command 多入口的成本。

```text
料號／圖料／審核清單 -> 右側唯讀 drawer -> 一個狀態導向 navigation CTA
                     -> 同分頁、可定址的 canonical full-page workspace
                     -> domain action owner／必要確認 -> 完成或取消
                     -> 安全返回原清單、篩選、頁次、選取與焦點
```

效用判斷：多一次可預期導覽的固定成本，換取一致肌肉記憶、完整編輯空間、可分享／reload／back-forward 的 URL、drawer zero-write 與單一 command placement。Part 主資料、Relation 關聯與 Approval decision 都是低頻、高投入或高風險任務，淨效用為正。批判性限制是：只統一**任務模式、頁面 mechanics 與 action ownership**，不統一 domain editor；若為此建立大型泛型工作台，方案即失去優雅性。

### Human-confirmed decisions 與契約解讀

1. Part／Relation drawer 以快速閱讀為唯一責任，必須 zero-write；只保留預覽、複製、下載、唯讀摘要與最多一個主要 navigation CTA。
2. 所有 Part／Relation 編輯使用同分頁完整 URL，支援 hard reload、browser back／forward、安全 `returnTo` 與未儲存離開保護；不用 fullscreen modal，也不自動開新分頁。
3. 同一 candidate aggregate 只有一個 canonical workspace URL：`/numbering/workspaces/[workspaceId]`。Part／Relation 入口可使用安全 anchor 聚焦不同區段，但不得建立兩個 candidate URL 或兩份 editor。
4. formal Part 使用 `/parts/[partId]/workspace`；formal Relation root 使用 `/numbering/relations/[rootId]/workspace`。route identity 使用穩定 ID，不使用可變 display code；query／anchor 只表達 intent、focus 與 return context，不解鎖權限。
5. Drawing 現行 `/numbering/drawings/[drawingId]/workspace` 不在本 DEV 重構範圍；先保護已完成且仍待獨立 QC 的工作面。
6. 契約解讀：`drawer zero-write` 包含由 `/approvals` 開啟的 Part／Relation 審核 drawer。否則 `UnifiedPdmEntityDetailDrawer` 仍須保留 command runner，會破壞單一 action owner；因此既有 `/approvals/[requestId]` 擴為 Drawing／Part／Relation 共用 reviewer workspace，但審核 API、exact reviewer、company、audit 與 decision authority 不變。

### Spec Impact 與 ADR 判定

Spec Impact Preflight：`Intentional replacement + compatible preservation`。

- 取代：`DEV-079` 將 Part／Relation drawer 全面唯讀列為 Out of Scope；`DEV-072` 允許 Part／Relation／Approval owner drawer 執行 `command`；`DEV-067` 將 `ContextActionBar` 同時視為 drawer command placement 的部分。
- 保留：`DEV-062` 小型 mechanics core＋domain adapters、`DEV-067` composer＋domain-owned projections＋server policy、`DEV-072` applicable／locked／omitted action truth、`DEV-081` supervisor/admin capability，以及既有 schema、資料 owner、command API、permission、lifecycle、approval、audit、concurrency 與 idempotency authority。
- ADR：不新增。修訂既有 `ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001`，把 composer 的終局責任收斂為 read-only drawer；full-page frame 是既有 `ADR-PDM-WORKBENCH-CORE-001` 的 compatible mechanics extension，不是新 data／command owner。若後續要求共用 domain editor、persistent cross-page draft state 或新的跨 domain command service，才重新進入新 ADR 判定。

### Current Architecture Impact（2026-08-20 repository audit）

1. `part-workbench.tsx` 與 `relation-workbench.tsx` 的 candidate detail 直接掛載 `WorkspaceDrawer`；drawer 內的 `NumberingCandidateRevisionEditor`、workspace edit form、送審、撤回、發布／取消與確認 modal 仍可寫入。
2. `UnifiedPdmEntityDetailDrawer` 對 Part／Relation navigation action 會原地打開 maintenance panel，並對 candidate lifecycle、approval decision、withdraw、cancel、retry 等 descriptor 執行 command；只有 Drawing 已 fail closed 為 navigation-only。
3. formal Part 的 unified path 由 `PartProjection` 直接 `PUT /api/parts/[partNumber]/variant`；legacy `PartDetailPanel` 另有附件、variant save 與 contextual lifecycle actions，形成兩個可寫 drawer branch。
4. formal Relation 的 unified `RelationProjection` 與 legacy `RelationMaintenancePanel` 都可呼叫 `POST /api/numbering/relations`；root／part／drawing contextual actions也仍掛在 drawer。
5. `/approvals` 對非 Drawing request 仍在 drawer 執行 approve／needs-info／reject；`/approvals/[requestId]` 目前只解析 Drawing target 與 Drawing projection。
6. `PdmEntityDetailService` 對 Part／Relation 的 `ownerHref` 仍回 list＋`detail` anchor；`normalizePdmSurfaceReturnTo` 只有 Drawing／Approval allowlist，Part／Relation 暫以 Approval fallback 處理。
7. Part／Relation workbench 已共用 `usePdmWorkbenchController`，但仍使用 memory-only cursor history，`readLocation`／`writeLocation` 未保存 cursor／page；離開到 full page 後不能保證回到同一頁次。
8. 現有 read BFF、entity detail projection、workspace、Part、Relation 與 Approval command routes足以承接本 DEV；預期不需要 schema、migration、新 permission、新 lifecycle 或新 write API。

9. legacy `NumberStateWorkspaceWorkbench` 也直接掛載同一個可寫 `WorkspaceDrawer`；只改 `PartWorkbench`／`RelationWorkbench` 會留下 flag-off candidate drawer write path。083-D 必須把這個 legacy mount 與新版兩個 mount 同次改為 read-only navigation。

### Implementation baseline 與 dirty-worktree boundary

以下表格保留實作前／早期回歸快照，供dirty-worktree與變更歸因追溯；current evidence reconciliation以本節後段與QA plan §5的最新manifest為準，不得把早期aggregate數字當作目前完成度。

Baseline captured at `2026-08-20 Asia/Taipei`，branch=`持續優化2`，HEAD=`050eedd4fe963d0f225820facec8d221a1df76ce`。本輪未啟動 app／test server，未建立臨時 runtime，未寫產品程式。

| Result | Pre-implementation command／finding |
|---|---|
| PASS | `typecheck:app`; `qc:dev-062:core`; `qc:dev-062:part`; `qc:dev-062:relation`; `qc:dev-062:compat`; `qc:dev-067:contract`; `qc:dev-067:ui`; `qc:dev-067:navigation`; `qc:dev-072:contract`; `qc:dev-072:api`; `qc:dev-079:contract`; `qc:master-attachments` |
| Existing FAIL | `qc:dev-067:review`：`review receipt matches target type/id pairs`; `qc:pdm-entity-detail-drawer`：Drawing pending approval projection assertion；`qc:pdm-approval-platform`：Phase 1C-C Drawing pending badge assertion |
| Correctly blocked | `qc:pdm-drawing-part-relation-view` 拒絕使用受保護的 `data/ai-pdm.sqlite`；最終驗證必須以 disposable `PDM_DATA_DIR` 與同一 isolated server 重跑 |
| PASS | `qc:dev-083:contract`; `qc:dev-083:api`; `qc:dev-083:mutation`; affected `lint`（0 errors／14既有warnings）；`build:isolated`；最新 authenticated Chromium disposable run 22/22 runner checks，browserErrors=0、failedResponses=0、mutationRequests=0，browser evidence=`output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`；mutation evidence=`output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`（31/31 result rows PASS、QA-083-11/12/13/17/18/19，含Engineer owner/non-owner與三domain Manager／Admin／non-editor／company partition） |
| Parent baseline / gate disposition | latest completed aggregate `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為30 child／29 PASS／1 DEV-072 parent baseline FAIL；DEV-067 browser已由最新parent runner 18/18 PASS解決；DEV-072保留FK／cleanup與bounded obsolete marker的歷史failure，依DEV-079 contract 22/22、layout 3/3、recognition layout 3/3標記`accepted-superseded`，未改expected、不歸因DEV-083；`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`已記錄可追溯QC disposition，QA-083-24已關閉，不得把舊runner failure改寫成PASS |

`qc:dev-067:ui`目前通過的是「editable candidate drawer」歷史 expected；083-D 已以新 zero-write contract替換candidate mount，該歷史expected不得作為DEV-083證據。最新`qc:dev-067:browser`已改為接受現行candidate readonly marker與canonical reviewer route並18/18 PASS。DEV-072舊action-discoverability runner的FK fixture與obsolete marker failure仍須保留、重現與個別歸因；DEV-079 replacement evidence只能支援`accepted-superseded`，不得藉改expected把舊runner改成PASS。

工作樹已有大量使用者／其他DEV變更。下列direct-edit tracked檔目前已有pre-existing hunks：`package.json`、`src/app/api/pdm/entity-details/[entityKey]/route.ts`、`src/app/approvals/page.tsx`、`src/app/globals.css`、`src/app/numbering/search/page.tsx`、`src/components/number-state-workspace.tsx`、`src/components/part-detail-content.tsx`、`src/components/part-projection.tsx`、`src/components/part-workbench.tsx`、`src/components/relation-workbench.tsx`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/lib/part-workbench.ts`、`src/lib/pdm-approval-owner-route.ts`、`src/lib/pdm-detail-action-resolver.ts`、`src/lib/pdm-entity-detail.ts`、`src/lib/pdm-review-navigation.ts`、`src/lib/relation-workbench.ts`；`src/components/approval-request-workspace.tsx`為pre-existing untracked檔。test boundary另有dirty `scripts/qc-dev-062-relation-workbench.mjs`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-pdm-entity-detail-drawer.mjs`、`scripts/qc-pdm-numbering-approval-review-ui.mjs`，以及untracked `scripts/qc-dev-079-contract.mjs`。

RD在每個direct-edit檔第一個patch前必須保存`git diff -- <file>`或untracked全文作hunk ledger；只增加DEV-083可歸因hunk，不得格式化、回復、覆蓋或把pre-existing變更計入本DEV。若必要改動與既有hunk無法隔離、new path已被其他工作建立、或測試需要改動未列檔案，立即停止回Dev PM；不得用checkout/reset、whole-file rewrite或放寬測試解衝突。stage／commit未授權。

### Exact direct-edit source inventory（28 files）

新增8個source：

| File | Exact responsibility |
|---|---|
| `src/app/numbering/workspaces/[workspaceId]/page.tsx` | thin async route；解析stable ID／search params並掛載單一candidate editor |
| `src/app/parts/[partId]/workspace/page.tsx` | thin formal Part route；不在page組mutation |
| `src/app/numbering/relations/[rootId]/workspace/page.tsx` | thin formal Relation route；不在page組mutation |
| `src/components/pdm-edit-page-frame.tsx` | mechanics-only frame；return、identity/status、failure、unsaved guard、focus、responsive與action dock slots |
| `src/components/numbering-workspace-editor.tsx` | candidate唯一write owner；搬入既有edit/file/lifecycle/confirm邏輯，不複製command |
| `src/components/part-workspace-editor.tsx` | formal Part唯一write owner；stable-ID read、variant、attachment與contextual actions |
| `src/components/relation-workspace-editor.tsx` | formal Relation唯一write owner；stable-ID read、impact／relation commands與lock recovery |
| `src/components/relation-workspace-content.tsx` | 從2900+行route抽離domain-owned root/tree/matrix/read-only／workspace presentation；不是shared core |

修改20個既有source：

| File | Required delta |
|---|---|
| `src/components/number-state-workspace.tsx` | `WorkspaceDrawer`收斂／改名為`WorkspaceReadonlyDrawer`；移除editor、form、submit／withdraw／publish／cancel與confirm props；legacy workbench只read＋navigate；create完成導向single candidate URL |
| `src/components/part-workbench.tsx` | 移除candidate update/action/confirm owner；candidate/formal都只開read-only drawer；序列化cursor/page並使用bidirectional mode |
| `src/components/relation-workbench.tsx` | 移除candidate、relation、impact與contextual mutation owner；read-only drawer；序列化cursor/page並使用bidirectional mode |
| `src/components/part-detail-content.tsx` | `PartDetailPanel`改用discriminated presentation；drawer分支附件／variant／contextual全唯讀，workspace分支才掛write |
| `src/app/numbering/search/page.tsx` | legacy formal drawer使用抽出的read-only Relation content；移除drawer relation／contextual write callback |
| `src/components/part-projection.tsx` | 刪除local variant form、PUT與maintenance props，固定為read projection |
| `src/components/relation-projection.tsx` | 刪除POST、maintenance form與write callback，固定為read projection |
| `src/components/unified-pdm-entity-detail-drawer.tsx` | 刪除`PendingCommand`、command fetch/dialog、Part／Relation maintenance state與write callbacks；只執行read/local/navigate action |
| `src/app/approvals/page.tsx` | PDM owner row的drawer全面read-only且decision導向reviewer URL；非PDM approval既有detail authority不變 |
| `src/components/approval-request-workspace.tsx` | 由Drawing-only改為server owner context組合Drawing／Part／Relation full projections；projection成功前不hydrate；decision仍用既有API |
| `src/lib/pdm-review-navigation.ts` | 以closed pathname set建立candidate／Part／Relation／Drawing／Approval normalizer；保留既有export相容性 |
| `src/lib/pdm-approval-owner-route.ts` | 所有PDM owner approval統一產生`/approvals/[requestId]?returnTo=...`，保留target context resolver |
| `src/lib/pdm-detail-action-resolver.ts` | Part／Relation／review mutation descriptor改為canonical navigate／locked／omitted；每狀態最多投影一個主要mutation navigation；Drawing規則不改 |
| `src/lib/pdm-entity-detail.ts` | Part／Relation ownerHref改stable-ID canonical pages；candidate共用single route；review一律exact request route；surface fallback正確化 |
| `src/app/api/pdm/entity-details/[entityKey]/route.ts` | 傳入真實Part／Relation／review surface return context，不再把non-Drawing一律fallback到Approval |
| `src/lib/part-workbench.ts` | query增加signed cursor direction/pageIndex；response產生previous/next cursor與bounded pageIndex |
| `src/lib/repositories/part-workbench-async-repository.ts` | identity page支援before comparator/reverse canonical order並回first/last identity；不改hydrate authority |
| `src/lib/relation-workbench.ts` | 同Part的bidirectional service envelope；保留filter hash/company/actor/root uniqueness |
| `src/lib/repositories/relation-workbench-async-repository.ts` | 同Part的before/after identity scan；不改tree/matrix hydrate boundary |
| `src/app/globals.css` | 只新增／泛化page-frame、domain workspace與三viewport必要樣式；不得順帶重畫Drawing或全站 |

Validation-only、不預期direct edit：`src/components/use-pdm-workbench-controller.ts`、`src/components/pdm-workbench-pagination.tsx`、`src/lib/pdm-workbench-contract.ts`、`src/lib/pdm-workbench-cursor.ts`、既有workspace／Part／Relation／Approval write API routes、`src/app/approvals/[requestId]/page.tsx`與Drawing workspace。若這些檔需要改business contract，停止重做impact analysis；單純修正已存在且被DEV-083直接揭露的bug也必須先加入inventory與歸因。

### Exact component／function／type delta

1. `PdmEditPageFrameProps`只接受已正規化的`returnHref`、identity/status React slots、`loading | ready | restricted | not_found | conflict | error` page state、`isDirty`、retry／back callbacks、notice、children與actionDock；不得接受`domain`、API URL、command descriptor或在內部switch。所有return allowlist在domain editor／navigation helper完成。
2. `WorkspaceReadonlyDrawer` props只含workspace read model、presentation／overview、canonical `ownerHref`、geometry與close/focus；不得含`busy`、`editing`、`onUpdate`、`onSubmit`、`onWithdraw`、`onPublish`、`onCancel`、revision editor change callback或confirm state。原可寫body搬到`NumberingWorkspaceEditor`；不能複製一份留在drawer。
3. `PartDetailPanel`與`RelationWorkspaceContent`使用discriminated union：`{ presentation: "drawer-readonly" }`不接受mutation callback；`{ presentation: "workspace-editor"; ...domain callbacks }`才可接受write。禁止多個`showMaintenancePanel`／`readOnly` boolean組合造成非法狀態。
4. `PartProjection`／`RelationProjection`只接受projection與純顯示選項；移除`showMaintenancePanel`、`onMaintenanceChanged`、`onRelationChange`及內部fetch。`UnifiedPdmEntityDetailDrawerProps`同步移除`onCommandSuccess`、`onRelationChange`、`contextualActions`、`onContextualChanged`。
5. `readLocation`／`writeLocation`（Part、Relation）讀寫opaque `cursor`與bounded `pageIndex`；controller設`paginationMode: "server-bidirectional"`並以response `previousCursor`／`hasPreviousPage`導航。URL不得解碼／重簽cursor。
6. `NormalizedPartWorkbenchQuery`／`NormalizedRelationQuery`增加`direction: "after" | "before"`與pageIndex；service以signed cursor truth覆蓋client direction，repository before query反向比較／讀取後再恢復canonical順序，response簽署first/last identity。invalid／filter-mismatch cursor維持400與安全第一頁恢復。
7. `normalizePdmCandidateReturnTo`、`normalizePdmPartReturnTo`、`normalizePdmRelationReturnTo`新增且closed allowlist；`normalizePdmDrawingReturnTo`、`normalizePdmApprovalReturnTo`相容保留。所有helper拒絕absolute、scheme-relative、backslash、control character與錯誤pathname。
8. `buildPdmApprovalOwnerHref`與entity-detail composer產生canonical owner URL；`resolvePdmDetailActions`只保留server truth與placement，不再把Part／Relation／review mutation組成drawer command。`isPdmDetailMutationAction`保留作static gate。
9. `ApprovalRequestWorkspace`先讀request metadata並用`resolvePdmApprovalOwnerContext`取得target，再以exact `reviewRequestId`讀locked full projection；任何target receipt、company、assignment、active state或drift失敗都fail closed，不可先畫full projection再隱藏。

### Exact test／runner inventory

新增：`scripts/qc-dev-083-contract.mjs`、`scripts/qc-dev-083-api.mjs`、`scripts/qc-dev-083-browser.mjs`、`scripts/qc-dev-083-mutation.mjs`、`scripts/qc-dev-083-aggregate.mjs`。`package.json`新增且只新增`qc:dev-083:contract`、`:api`、`:browser`、`:mutation`、`qc:dev-083`五個command；aggregate保存每個child result，不可吞掉FAIL／BLOCKED。

Intentional-replacement expected必須同步修改：`scripts/qc-dev-062-part-workbench.mjs`、`scripts/qc-dev-062-relation-workbench.mjs`、`scripts/qc-dev-067-unified-drawer-ui.mjs`、`scripts/qc-dev-067-navigation.mjs`、`scripts/qc-dev-067-browser.mjs`、`scripts/qc-dev-070-contract.mjs`、`scripts/qc-dev-070-legacy-owner.mjs`、`scripts/qc-dev-070-browser.mjs`、`scripts/qc-dev-072-action-contract.mjs`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-dev-072-browser.mjs`、`scripts/qc-dev-079-contract.mjs`、`scripts/qc-pdm-entity-detail-drawer.mjs`、`scripts/qc-pdm-number-state-flow-phase1b.mjs`、`scripts/qc-pdm-numbering-approval-review-ui.mjs`。只改與canonical route／zero-write／bidirectional return直接衝突的assertion；保留projection、permission、scope、Drawing與資料一致性expected。

`qc:dev-083:contract`負責28-file boundary、route/stable-ID/safe-return、single candidate editor、drawer/frame source scan與schema/write-route negative diff；`:api`負責before/after cursor、owner resolver、action destination、actor/company/reviewer負向、existing payload與exactly-once；`:browser`負責legacy/unified三list四workspace、DOM/a11y/network zero-write、unsaved/focus/return與1440×900／1024×768／390×844；`:mutation`在disposable SQLite＋Chromium中負責candidate lifecycle／recovery、Part variant、角色／公司 authority、Relation五種操作與reviewer `needs_info`／reject／approve、scope denial、snapshot drift與retry formalization的exactly-once／readback／audit；aggregate依QA plan跑parent regressions、`typecheck:app`、affected lint與`build:isolated`。需要資料的runner只能使用disposable isolated directory與task-owned runtime，完成後依`AGENTS.md`精確停止並確認port釋放。

### UX Intent 與操作主權

- 使用者與情境：工程師／主管在 Part 或 Relation 清單快速掃描多筆資料，只有決定維護主資料、關聯、candidate aggregate 或審核案件時才進入完整工作面。
- 成功結果：5 秒內辨識物件、狀態與是否值得進入工作區；drawer 中不可能誤觸 write；full page 能完成一個明確任務並安全返回。
- 操作 owner 固定為 `List/Page -> Drawer(read/navigation) -> Full-page Form/Workspace -> Confirmation Modal`。每一層只保留最上層 active owner；modal 開啟時底層 action dock 必須 inert，關閉後回到原觸發控制項。
- Drawer 一個 primary navigation CTA；full-page 每個 active scope 一個 primary action，secondary／danger 由 domain editor決定。導覽 link 不混入 form action dock。
- 正常／成功狀態保持安靜；blocked、restricted、not-found、conflict 或 failed 才在受影響位置顯示人類影響與可發現恢復方式。不得把 DEV ID、API route、raw status、技術錯誤或 QA checklist 顯示在產品 UI。
- Drawer desktop 維持右側 overlay與單一 body scroll owner；mobile 為全寬 drawer。Full page 的 header、domain body與 action dock不得形成多個不清楚的垂直 scroll owner，固定列需為最後控制項保留淨空。

### Canonical route、stable identity 與 ownership

| Context | Canonical URL | Stable identity | 唯一 write owner |
|---|---|---|---|
| candidate aggregate owner | `/numbering/workspaces/[workspaceId]?intent=<intent>&returnTo=<encoded>` | `candidate:{workspaceId}` | `NumberingWorkspaceEditor`＋既有 workspace／candidate revision APIs |
| formal Part owner | `/parts/[partId]/workspace?intent=<intent>&returnTo=<encoded>` | `part:{partNumberId}` | Part domain editor＋既有 Part／attachment／contextual command APIs |
| formal Relation owner | `/numbering/relations/[rootId]/workspace?intent=<intent>&returnTo=<encoded>` | `root:{partRootId}` | Relation domain editor＋既有 relation／contextual command APIs |
| exact reviewer | `/approvals/[requestId]?returnTo=<encoded>` | approval request ID＋request target receipt | domain-aware `ApprovalRequestWorkspace`＋既有 decision/apply APIs |
| list／drawer | `/parts?...&detail=<entityKey>`、`/numbering/search?...&detail=<entityKey>`、`/approvals?...` | existing row/entity key | read、copy、download、preview、refresh、return、navigate only |
| Drawing owner／reviewer | 現有 `/numbering/drawings/[drawingId]/workspace`、`/approvals/[requestId]` | existing Drawing/request ID | `DEV-079` authority，不由 DEV-083 重構 |

允許 intent：candidate=`edit | submit_review | withdraw_review | cancel | recovery | view`；formal Part=`edit | manage_files | history | view`；formal Relation=`manage_relation | history | view`。unknown／inapplicable intent 必須由 server truth 正規化為 `view` 或 locked state並說明，不得只依 query string掛載表單。`#part-data-maintenance`、`#relation-maintenance` 等 anchor只控制初始 focus，不改 projection、capability 或 command scope。

### State／action destination contract

| State／action | Drawer behavior | Canonical destination／owner behavior |
|---|---|---|
| candidate building／drawing preparation／correction | `繼續建立／繼續修正` navigation | candidate workspace `edit`；沿用目前 aggregate editor與server capability |
| candidate bundle ready／submit | `檢查並送審` navigation | candidate workspace `submit_review`；實際 submit／confirmation只在full page |
| candidate in review／withdraw | `查看審核`或`查看工作` navigation | owner在candidate workspace唯讀／依既有capability撤回；reviewer在request workspace決策 |
| candidate recovery／cancel | `處理異常`／`繼續工作` navigation | candidate workspace `recovery`／`cancel`，由既有idempotency與server truth處理 |
| formal Part edit／files／contextual lifecycle | `編輯料號資料`或server-derived CTA navigation | Part workspace；active-review或terminal依既有policy鎖定／唯讀 |
| formal Relation maintenance／contextual lifecycle | `維護圖料關聯`或server-derived CTA navigation | Relation workspace；既有record lock與relation permission不變 |
| approve／needs-info／reject／retry apply | `前往審核工作區` navigation | `/approvals/[requestId]`；exact reviewer、target receipt、drift、idempotency與audit由server重驗 |
| history／terminal／readonly | 唯讀、history navigation或無primary | canonical workspace `view/history`；不得顯示假的可寫 control |

`PdmEntityDetailResponse.actionBar` 繼續是 drawer 的 server-derived action truth，但 Part／Relation／Approval mutation intent 的 `execution` 必須為 `navigate`、locked 或 omitted，不得是 `command`。Full-page domain editor直接使用既有 domain command contract；不得把 drawer action runner搬進 `PdmEditPageFrame` 形成跨 domain command bus。

### 最小共用元件與 domain boundary

- `PdmEditPageFrame`：只治理safe return、stable identity header、human status、loading／401／403／404／409／5xx state、unsaved guard、action-dock placement、responsive shell與focus restoration。它接受slots／callbacks，不得 import Part／Relation projection、domain status或API route，也不得出現`if (domain === ...)`。
- `NumberingWorkspaceEditor`：由現有 `WorkspaceDrawer` candidate可寫body抽出，僅掛載於單一candidate route；Part／Relation入口只決定安全return與初始anchor，不建立不同editor mode。
- `PartWorkspaceEditor`：domain-owned；復用Part projection、variant、attachments與contextual lifecycle primitives，且只有此full-page owner掛載其write controls。
- `RelationWorkspaceEditor`：domain-owned；復用root aggregate、tree／matrix、relation maintenance與contextual lifecycle primitives，且只有此full-page owner掛載relation commands。
- `ApprovalRequestWorkspace`：保留request／decision authority並改為依server owner context組合Drawing／Part／Relation projections；不得在shared frame建立domain switch式表單。
- `UnifiedPdmEntityDetailDrawer`：保留read composer、server projection policy、geometry、scroll、focus與單一navigation action bar；移除Part／Relation maintenance state、pending command runner與write callbacks。

禁止：`GenericWorkbench<T>`、schema-driven universal form、跨domain action runner、第二個candidate editor、client fetch-all後hide、把Part fields塞進core contract、把Relation tree強制渲染成Part表單，以及為DEV-083新增feature flag。

### Data、API、permission 與 consistency contract

- Schema／migration：無。Part Number identity、Relation root、workspace lifecycle、approval request／target／decision資料模型均不變。
- Read：復用 `GET /api/numbering/draft-workspaces/[id]`、`GET /api/parts/workbench/[rowKey]`、`GET /api/numbering/relations/[rowKey]`、`GET /api/pdm/entity-details/[entityKey]` 與 `GET /api/approvals/requests/[requestId]`；response維持`private, no-store`。Page若需要read adapter，只能薄包裝既有service，不建立第二份domain truth。
- Write：復用既有workspace／candidate revision、Part variant／attachments、`POST /api/numbering/relations`、contextual lifecycle與approval decision/apply APIs。不得新增平行write endpoint、改payload語意或複製command logic。
- Part／Relation list為精確返回可additive支援`previousCursor/pageIndex`與signed bidirectional cursor；既有cursor HMAC、filter hash、actor/company/domain隔離及400回第一頁規則不變。這是read envelope兼容擴充，不是新資料authority。
- Permission：沿用`numbering.workspace.view/update/cancel`、`numbering.draft.update`、candidate submit／withdraw、`numbering.attachments.manage`、`numbering.link_variant`、publication／contextual action、exact reviewer decision與`DEV-081` non-owner edit scope。Client route、intent或可見button不得放寬server判定。
- 每次read／write重驗authenticated actor、company與存在性；每次write另重驗owner／non-owner scope、lifecycle／active-review lock、exact reviewer、request target receipt、existing concurrency／rowVersion、idempotency與audit。DEV-083不補造目前domain沒有的rowVersion或transaction語意。

### Safe return、list freshness 與 navigation

- `returnTo`採closed allowlist：candidate只接受`/parts`或`/numbering/search`；Part只接受`/parts`；Relation只接受`/numbering/search`；reviewer只接受`/approvals`。拒絕absolute URL、scheme-relative、backslash、control character、cross-origin與不符pathname的值。
- Part／Relation list location需保存目前可序列化的view、query、filter、sort、layout、history、opaque cursor、bounded pageIndex、detail entity key與selected row；不得把HMAC payload解碼或寫入localStorage作authority。
- 進入workspace時可關閉drawer，但`returnTo`保留其detail key；完成／取消／browser back後回到原頁次並恢復列focus。若資料已離開filter、cursor失效或物件不存在，回最近可解釋list state、移除stale detail並顯示一次人類可理解notice。
- hard reload／direct URL以server truth重建，不依賴drawer snapshot、React state或client capability。已完成upload／command不算unsaved；只有尚未提交的form input觸發discard guard。

### Failure／recovery contract

- 401：導向login並保留workspace本身的safe return；登入後重新讀server truth。
- 403：保留唯讀identity與可返回入口；說明所缺能力／聯絡角色，不顯示disabled假表單。
- 404：顯示物件不存在或已移轉，提供回allowlisted list；不得留下空白workspace。
- 409／active-review drift：保留未送出input，要求refresh truth；不可自動覆寫。Relation／workspace既有lock與rowVersion語意不變。
- 5xx／network失敗：保留未送出input與最近成功read，提供retry；畫面不得顯示raw JSON、stack、API route或HTTP技術訊息。
- mutation response未知：不得自動重送非安全operation；以既有idempotency／PUT語意與readback確認結果。partial upload保留已完成檔案，不把成功upload誤列為unsaved。
- 離頁：route change、返回、關閉、browser back與切換entity都使用同一discard guard；confirmation modal接管時底層form action不可點擊／Tab／AT操作。

### Current phase DAG、entry／exit gate

| Phase | Scope | Entry | Exit evidence |
|---|---|---|---|
| `083-A Route／read contract` | 四canonical routes、stable ID、safe return、intent normalization、domain-aware reviewer owner resolver | 本Implementation Contract | route/action/security contract可證；unknown intent fail closed；Drawing snapshot不變 |
| `083-B Full-page owners` | page frame、single candidate editor、Part／Relation domain editors、三domain reviewer workspace | 083-A | direct URL／reload／permission／failure states可操作；無新write API或domain bus |
| `083-C Exact return mechanics` | Part／Relation bidirectional cursor、URL state、selected-row/focus recovery | 083-A | next/previous、back/forward、stale cursor、missing row、open redirect negative cases通過 |
| `083-D Atomic zero-write cutover` | candidate、formal、legacy、unified、approval drawer同次navigation-only | 083-B＋083-C | 所有flag branch／actor／state drawer DOM與network mutation=0；唯一workspace owner成立 |
| `083-E QA freeze` | focused contract/API/browser＋parent regressions | 083-D | QA-083完整gate、P0/P1=0、visible／console／network unexpected error=0 |

A～C可在本機分開實作與提交，但不是可release中間態；D必須與已完成的canonical pages同一application artifact。現有`PDM_UNIFIED_PART_RELATION_WORKBENCH_V1`只能切list／drawer renderer，不能決定是否允許drawer write；flag on/off兩支都必須zero-write。不新增DEV-083 feature flag，無DB rollback。

### Acceptance Criteria 與 QA/QC handoff

1. Part／Relation candidate、formal、legacy、unified與approval drawer的DOM、keyboard、accessibility tree及network均zero-write；無form、file input、save、relation mutation、submit、withdraw、cancel、approve、reject、retry或contextual mutation control。
2. candidate、formal Part、formal Relation與exact reviewer各有且只有一個canonical full-page owner；相同intent不存在drawer／page雙路徑或多個candidate URL。
3. Drawer只有read actions與最多一個primary navigation CTA；full-page與confirmation依層級各只有一個active action owner，底層owner在上層開啟時不可操作。
4. `PdmEditPageFrame`無domain import／switch／command href；Part與Relation editor保留domain差異、既有permission與server validation。
5. safe return完整保存Part／Relation清單脈絡；direct URL、reload、back／forward、完成、取消、stale cursor與missing row均有可解釋結果且無open redirect。
6. owner、R&D Manager、Admin、exact reviewer、readonly actor與cross-company actor覆蓋candidate／formal／review／terminal；未授權資料不hydrate，disabled reason與contact role保持server truth。
7. 既有workspace、Part、Relation、attachment與approval API的payload、audit、lifecycle、lock與idempotency回歸不變；repository diff不得出現schema／migration／新permission／新write route。
8. 1440×900、1024×768、390×844驗證Part、Relation、Approval list→drawer→workspace→return，包含loading／empty／error／blocked／not-found、focus、scroll owner、action dock clearance、mobile keyboard與horizontal overflow。
9. 每個critical route執行visible-error與information-noise sweep；可見UI無raw status、DEV ID、API route、HTTP/stack、重複identity／status、逐項教學CTA或被fixed bar遮住的最後欄位。
10. Drawing `/numbering/drawings/[drawingId]/workspace`與DEV-079 drawer contract保持等價；DEV-083不得以共用frame名義修改Drawing產品面。

 QA authority：`.ai-doc/qa/qa-dev-083-part-relation-readonly-drawer-fullpage-workspace-validation-plan-2026-08-20.md`。RD已建立`qc:dev-083:contract`、`:api`、`:browser`、`:mutation`與aggregate commands；focused contract/API、latest 22-check authenticated browser、最新disposable mutation、typecheck、lint與isolated build均有證據。aggregate仍逐child保存parent FAIL／BLOCKED與baseline標籤；DEV-083未刪舊expected取得可追溯closure。Mutation runner最新manifest為`output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`且31/31 result rows passed、cleanup=removed，已閉合QA-083-11/12/13/17/18/19，後者包含Engineer owner/non-owner與三domain Manager／Admin／non-editor／company partition；DEV-067 parent browser最新18/18 PASS，DEV-072則保留`accepted-superseded`及原始failure，並由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`的2026-08-20 QC disposition關閉QA-083-24。

### Deferred Scope Audit、future capsule 與 stop conditions

- `Future Phase Captured / Not Requested`：待DEV-083本機QA/QC穩定且Drawing獨立QC完成後，才評估讓Drawing workspace採用`PdmEditPageFrame`；只有能證明減少重複且不改Drawing DOM／behavior時才重進規劃。
- `Future Phase Captured / Not Requested`：legacy drawer compatibility code的物理刪除延後到flag on/off zero-write與rollback evidence穩定；current phase必須先unmount／fail closed，但不為清理擴大產品風險。
- `Release Gate Required`：staging／production activation、deploy、traffic、production smoke與application rollback artifact另走release gate；本文件不產生release操作表。

停止條件：需要universal editor、同一candidate無法使用單一URL、stable ID或safe return不成立、legacy／unified／approval branch無法同次zero-write、command authority無法唯一化、Part／Relation list只能client join才能恢復、reviewer route需全域權限繞過，或需改schema／permission／lifecycle／production。發生時回Dev PM；不得以duplicate page、client-only permission、hidden form、modal工作台或drawer暫留write繞過。

> **2026-08-11 Part-cost retirement amendment**
>
> The part-cost sections, cost status, cost redaction and cost-maintenance deep links are retired from the current drawer contract by `ADR-PDM-PART-COST-RETIREMENT-001`. This document's historical cost references must not be implemented or used as current acceptance criteria.

## 2026-08-19 DEV-079 Amendment - 圖號唯讀抽屜與全頁編輯工作區分流

Status: `RD Implemented Locally / Focused Contract + Browser Evidence / Independent QC Pending / Production Release Gated`.

### 2026-08-20 Density／layout amendment

依使用者在 owner workspace 的紅線標記，本輪只收斂 presentation density，不改本節既有資料、命令與權限 authority：

- 移除左側預覽的 `N 類`計數與預覽標題列，避免與 tab 重複傳達可用圖面數量。
- 移除右側候選版次 header 的重複圖號；完整圖號仍保留在工作區主標題與受控檔案清單。
- 2D／3D tab 同列顯示檔名；取消 tab 與大型預覽、task tab 與版次 editor 間的多餘 padding／gap。
- owner workspace 的大型預覽不再顯示下方重複檔名 footer；檔名由 2D／3D tab 與右側受控檔案清單承接，避免同一檔案在主視覺區重複呈現。
- owner workspace 的受控檔案列不顯示`主要受控檔／受控附件`與`已完成驗證／需要先驗證`輔助 metadata；檔案標題、預覽／下載／移除操作與驗證流程保留。
- 右側 candidate editor/card 以內容高度排列，保留版次儲存、受控檔案、上傳、智慧辨識與底部生命週期操作列；PNG 預覽維持 `object-fit: contain`，不裁切工程圖。
- 生命週期操作列只停駐在右側 task column 底部；不得再建立與左側等寬的空白 preview placeholder。左側 2D／3D 預覽須使用原 footer row 的高度並延伸到工作區底部；窄 viewport 仍依主視覺→task panel→sticky 操作列排列。
- 智慧辨識人工核對欄位採緊湊垂直節奏：標題、輸入值與來源控制保持相鄰，例外提示不另占大型區塊；mobile 仍保留可讀輸入高度與來源按鈕，最後的批次儲存按鈕須在 sticky 操作列上方保留安全間距。
- 智慧辨識 task panel 另移除 tab badge、`輔助工具`標籤、compact 送審前說明／狀態 chip、重複統計摘要與分類標題；`source_file_role` 屬內部 metadata，不列入人工核對候選或待處理計數。正常流程不顯示獨立「開始辨識」按鈕：檔案上傳完成即自動排程，進頁時自動補建缺少的相同來源工作並輪詢；處理中只顯示安靜狀態，完成後直接顯示候選。
- 候選欄位本身是證據定位入口；有圖面座標時 focus／click 即定位，沒有座標時顯示`來源不在圖面上，僅存在檔案屬性`。人工核對以單一`完成核對並儲存`提交全部接受／修正，已修改欄位以文字訊號標示；不保留逐欄`套用修正／接受`按鈕或常駐`待核對`文案。
- 候選卡的`辨識／修正值`、`目前值`與`可信度`僅屬可壓縮的輔助 metadata：可見 UI 不再顯示前兩者標籤或可信度文字；正式值為空時整列不渲染，已有值時僅顯示值本身。欄位名稱／例外狀態、輸入、欄位本身的圖面定位與單一批次儲存不得被此收斂移除；輸入欄位仍須有可及名稱。
- 窄 viewport 的底部生命週期列只在接近頁面底部時 sticky，避免遮住辨識處理狀態或候選欄位。

Focused browser evidence：`npm.cmd run qc:dev-079:layout-browser`，1440×900／1024×768／390×844 三 viewport PASS；證據位於 `output/qa/dev-079-layout/20260820020110-browser/`，並確認 owner preview footer 檔名與受控檔案 metadata 不存在。此 amendment 不改 schema、API、permission、lifecycle、recognition authority 或 submit gate，且不取代 QA-079-01～28 的完整獨立QC。

### 問題、效用與目標流程

現行圖號抽屜同時承擔「快速找資料」與「長時間編輯／上傳／送審」。前者需要保留清單上下文、快速切換與高資訊密度；後者需要穩定寬度、完整預覽、錯誤處理及清楚的任務順序。兩種任務共用右側窄欄時，編輯畫面被迫由上而下延伸，使用者必須頻繁捲動並反覆確認目前做到哪一步。

本 amendment 將兩種任務模式分開：

```text
圖號清單 -> 右側圖號明細抽屜（唯讀） -> 點擊狀態導向 CTA
         -> 同分頁、可由 URL 定址的全頁工作區 -> 完成或取消 -> 返回原清單脈絡
```

效用判斷：多一次明確導覽的固定成本，換取抽屜瀏覽效率、編輯空間、預覽可見性、錯誤恢復與送審前判斷品質。由於編輯是低頻但高投入、高風險任務，效益高於額外一次點擊；不應以 modal 疊加或新分頁把上下文與返回責任交給使用者自行管理。

### Human-confirmed decisions

1. `HD-079-01 / 1B`：整個 **Drawing／圖號明細抽屜全面唯讀**。抽屜不承載表單、上傳、刪除、儲存、送審、撤回、核准、退回、作廢或其他 mutation control；可保留下載、開啟預覽、複製圖號與導覽 CTA。Part、Relation 與非 Drawing drawer 不在本階段改造範圍。
2. `HD-079-02 / 2A`：編輯使用**同分頁、獨立 URL 的全頁工作區**；不是 fullscreen modal，也不自動開新分頁／視窗。必須支援重新整理、瀏覽器上一頁／下一頁與安全 `returnTo`。
3. `HD-079-03 / 3A`：桌面採**雙欄工作區＋底部固定操作列**。左欄處理版次與本次檔案，右欄顯示 3D／2D 預覽、檔案辨識與送審 readiness；窄 viewport 依同一資訊順序改為單欄，不另造第二套流程。
4. `HD-079-04 / Visual-first amendment`：保留 3A 的全頁雙欄與底部單一生命週期操作列，但**取代其欄位 placement**。桌面左欄改為 2D／3D 大型主視覺，右欄改為可切換的`版次與檔案／智慧辨識`任務面板；右欄擁有自己的內容捲動，圖面不隨長表單離開視線。智慧辨識沿用既有 recognition session／decision authority，以 candidate revision 的受控 file asset 為來源；辨識不是送審 hard gate，進階歸類與正式寫入仍由既有完整核對頁負責。

### 抽屜唯讀契約

Drawing drawer 的責任是「辨識物件、快速預覽、判斷狀態、決定要不要進入工作面」，不是完成 mutation。內容優先序固定為：

1. 完整圖號、名稱／用途、第一層狀態與必要責任說明；
2. 3D 模型與 2D 圖面的真實預覽／可理解缺件狀態；
3. 目前版次、受控檔案、關聯料號與必要摘要；
4. 一個依狀態與權限由 server 決定的主要**導覽** CTA；
5. 歷史、更多唯讀資料與低頻導覽入口。

主要 CTA 只負責前往 canonical owner workspace，不得在 drawer 內直接執行 domain command。狀態與目的地契約如下；canonical route 與 capability matrix 見本 amendment 的 RD Handoff Contract：

| 狀態／意圖 | Drawer CTA | 目的地語意 |
|---|---|---|
| 首版準備／修正中 | `編輯首版`／`繼續編輯` | 圖號版次全頁編輯工作區 |
| 本次必要檔案已就緒 | `檢查並送審` | 同一全頁工作區的預覽／送審區，不在 drawer 送審 |
| 審核中 | `查看審核` | 依 viewer capability 前往 owner 或 reviewer 的 canonical review workspace |
| 研發版／量產版可使用且可進版 | `建立新版次` | 正式版次全頁編輯工作區 |
| 唯讀、無權限或 terminal | `查看詳情`或無主要 CTA | 唯讀 canonical detail／history；不得顯示假的可寫控制項 |

同一情境最多一個 primary CTA。若 applicable action 尚不可執行，沿用 `DEV-072` 的 locked reason truth，但控制項仍只能導覽或唯讀；不得因 locked 顯示而把 mutation 表單重新放回 drawer。Drawing-surface Approval owner context 的核准／退回同樣不得直接寫入 drawer，必須進入 canonical review workspace；Part／Relation approval surface 維持原契約，不在本 DEV 改造範圍。

### 全頁版次編輯工作區契約

全頁工作區沿用 `DEV-064` 的 canonical Drawing／Revision／File identity，以及現行 server permission、lifecycle、idempotency、optimistic concurrency、submission 與 publication authority，不建立第二套資料或命令來源。

桌面資訊架構（以 `HD-079-04` 為現行 placement authority；下表取代 3A 的左右欄內容分配）：

| 區域 | 內容與順序 |
|---|---|
| 頂部 | 返回原清單、**完整圖號**、名稱／用途、目前狀態；不以「M 圖面」等分類名稱取代圖號。 |
| 左側主視覺 | 預設顯示 2D 圖面，與 3D 模型以 tab 切換；一次只顯示一個大型預覽。OCR 證據可在 2D 上疊加定位框與來源摘要；無法解析座標時仍顯示證據文字，不得顯示 raw geometry。 |
| 右側任務分頁 | `版次與檔案`承載建議版次、此次版次、`儲存版次`、`上傳此版次檔案`、逐檔狀態及必要／建議說明；上傳成功後由系統自動排程辨識。`智慧辨識`承載安靜的處理／異常狀態、可直接編輯與定位的候選欄位、單一批次儲存與完整核對入口，不顯示正常流程的手動啟動按鈕。右側內容獨立垂直捲動。 |
| 底部 | 單一生命週期 action bar：返回／取消與唯一 primary 下一步。送審只能由既有 readiness 與 permission server truth 啟用；OCR 狀態、待核對數或 feature flag 均不得加入 submit gate。 |

必要／建議檔案的精簡說明放入可鍵盤 focus、桌面 hover、觸控點擊的說明浮層：`必要｜主要 3D 模型、主要 2D 圖面`；`建議｜PDF、DWG／DXF`。主畫面不常駐「必要檔案齊全後即可送審」句子；實際 blocker 仍必須在相關控制項旁以短句指出缺少哪一類檔案。檔案必要性與 canonical reuse 仍以 `DEV-061` 為 authority。

窄 viewport 依 `頂部 -> 圖面主視覺 -> 右側任務分頁 -> 固定操作列` 排列；主視覺先於表單，任務分頁內仍維持`版次／上傳`或`辨識／核對`的各自順序。固定操作列不得遮住最後一個欄位、錯誤訊息或瀏覽器安全區。

### 導覽、返回與資料新鮮度

- 進入全頁工作區時，以 same-origin allowlisted `returnTo` 保存 keyword、filter、sort、layout、history、cursor／page、selected row、drawer detail 與可恢復 scroll anchor；不得接受任意外部 URL。
- 完成或取消後回到原結果與原列；若該列已離開結果或失效，回到可解釋的最近清單狀態並說明原因，不以空白畫面代替。
- browser back／forward、hard reload 與 direct URL 必須可用。工作區重新載入 server truth，不以 drawer 舊 snapshot 解鎖 mutation。
- 有未儲存輸入時，離開、返回清單或切換圖號前必須顯示可理解的 discard guard；已完成的逐檔上傳不得被錯誤宣稱為未儲存。
- 抽屜與全頁工作區可共用 read projection、preview component 與 action descriptor，但 mutation component 只掛載於 canonical full-page owner workspace。

### Scope、Out of Scope 與驗收方向

Scope：Drawing drawer 全面唯讀、狀態導向導覽 CTA、同分頁全頁版次／送審工作區、雙欄與 responsive layout、精確返回、未儲存保護，以及既有 Drawing mutation 由 drawer 遷移至 canonical owner workspace。

Out of Scope：Part／Relation drawer 全面唯讀化、生命週期或權限變更、新 schema／migration／API authority、production 資料修復、部署／release、自動開新分頁、fullscreen modal，以及以新頁複製既有 command logic。

Acceptance Criteria：

1. Drawing drawer DOM 中不存在 mutation form、file input／dropzone、save／submit／approve／reject／withdraw／obsolete control；唯讀預覽、下載、複製與導覽仍可用。
2. 所有 Drawing write intent 都前往明確 canonical workspace；不得同時保留 drawer 與 full page 兩套 mutation path。
3. 左側大型圖面與右側`版次與檔案／智慧辨識`任務切換可同時理解；`決定此次版次 -> 儲存版次草稿 -> 上傳此版次檔案 -> 送審`仍完整，儲存版次與 OCR 均不得被誤認為送審。
4. 1440×900、1024×768、390×844 驗證抽屜瀏覽、CTA 導覽、visual-first 雙欄／單欄切換、右欄獨立捲動、固定 action bar、keyboard focus、scroll／overflow 與未儲存保護。
5. 從含 keyword／filter／sort／layout／history／cursor／selected detail 的清單進入，完成、取消、browser back 與 hard reload 後均可安全返回；無 open redirect。
6. candidate、formal、reviewer、readonly 四類 actor/state 驗證 server capability、active-review write lock、stale rowVersion、重送 idempotency、401／403／404／409／5xx 與 retry/recovery，不得因 UI 分流放寬 authority。
7. 可見畫面不得出現 raw JSON、API error、stack、技術狀態碼、內容裁切或被 sticky bar 遮住的最後一項。
8. OCR 建立必須使用目前 candidate revision 與其未移除的受控 `source_file_asset_id`；每次上傳成功後自動 ensure，相同來源集合必須重用既有 session。進頁時若已有來源但沒有相符 session，必須自動補建並輪詢至可顯示結果。沒有辨識權限、功能未啟用或自動建立失敗時，版次與送審既有流程仍可使用；只有可處理的異常才顯示重試，不得出現失敗型假警報。
9. OCR 候選可在右欄接受／修正並在左側 2D 定位；歸類、不適用、忽略、延後、影響預覽與正式寫入沿用既有完整核對頁，不在 DEV-079 複製第二套 command authority。

### Spec Impact、ADR 與 re-entry

Spec Impact Preflight：`Intentional replacement + compatible preservation`。本 amendment 明確取代本文後段「candidate first-revision editor 必須 inline、submit 必須在同一 drawer、不得 route change 或 drawer replacement」以及 `DEV-053` 將高頻進版／送審留在 drawer 的 UI placement。舊段落保留為歷史基線，衝突時一律以 `DEV-079` 為準。

保留項：`DEV-064` Drawing／Revision／File 單一資料權威、`DEV-061` 檔案必要性與 canonical reuse、`DEV-067` server composer／projection、`DEV-072` applicable／locked action truth、既有 command route、permission、state machine、audit、submission、publication、idempotency 與 concurrency guard。

ADR 判定：目前不新增 ADR；這是同一 Drawing authority 下的 task-mode／navigation／component placement 變更。若後續要求所有 PDM drawer 全面唯讀、建立新的資料／命令 owner、改變 approval decision surface authority，或 full-page workspace 需要獨立持久化狀態，必須停止並回 Dev PM 重做 Spec Impact／ADR 判定。本次 repository inventory 已證明可沿用既有 Drawing／Revision／File、approval 與 command authority，無 schema／migration／新 domain API 必要；route、component、feature rollout、failure recovery 與 QA/QC case 已在下列 RD Contract 封口。

### Current Architecture Impact（RD Contract Upgrade）

079 implementation前盤點到四個會造成 Drawing mutation placement 分散的實作面；本輪已完成收斂，以下保留作差異歸因：

1. `src/components/drawing-workbench.tsx` 的 candidate／formal detail與legacy drawer曾直接承載workspace action。
2. `WorkspaceDrawer`曾內嵌`NumberingCandidateRevisionEditor`，形成drawer內更新、上傳、送審、撤回或取消路徑。
3. `src/components/unified-pdm-entity-detail-drawer.tsx`曾可執行server command descriptor，且projection可能掛載可寫附件能力。
4. formal revision全頁與`src/app/approvals/page.tsx`的Drawing review曾與drawer mutation並存。

本輪已把現有mutation component收斂到canonical full-page owner，並讓所有Drawing drawer分支同次轉成zero-write。`PdmDetailActionExecution`既有`navigate`型別足以承載導覽；不需要新增drawer command authority。`PDM_UNIFIED_ENTITY_DETAIL_V1`仍只決定哪一個**唯讀**drawer renderer，不再決定Drawing mutation是否留在drawer，亦未新增feature flag。

現有 `PdmEntityKey` 以 `drawing:<id>` 表示 canonical Drawing，legacy `candidate:<workspaceId>` 可由 workbench detail 解析到 canonical Drawing。新 canonical path 必須使用穩定 Drawing ID，不得使用可變圖號或 workspace ID 當 route identity。

### Canonical route、intent 與 ownership contract

| Surface | Canonical URL | Owner | Contract |
|---|---|---|---|
| 圖號 owner full-page workspace | `/numbering/drawings/[drawingId]/workspace?intent=<intent>&returnTo=<encoded>` | Drawing workspace route | candidate、formal revision、檔案、送審、撤回與 owner recovery 的唯一 UI placement；`drawingId` 為 canonical Drawing ID。 |
| Drawing reviewer full-page workspace | `/approvals/[requestId]?returnTo=<encoded>` | Approval request route | exact reviewer 的審核資料與核准／退回唯一 UI placement；由 request authority 重驗 actor。 |
| 現有 formal revision deep link | `/numbering/revisions?...` | compatibility adapter | 既有連結不得失效；解析 drawingNumber／revision 後 canonicalize 到 Drawing workspace，或薄包裝共用 full-page shell，不得保留第二套 command logic。 |
| 清單與 drawer | `/numbering/drawings?...&detail=drawing:<id>`、`/approvals?...` | list/read projection | 只讀與導覽；Drawing surface 不得送 mutation request。 |

允許的 `intent` 固定為 `edit_revision | submit_review | create_revision | manage_files | withdraw_review | recovery | view`。route 可依 server truth 正規化 intent：例如 active review 時將未允許的 `edit_revision` 轉為 `view` 並說明鎖定原因；不得只依 query string 解鎖表單。取消是頁面動作，不是 route intent；完成／取消均依安全 `returnTo` 返回。

### State × actor destination matrix

| Canonical state | Owner／可編輯 actor | Exact reviewer | Readonly／其他 actor |
|---|---|---|---|
| `building`／`drawing_preparation`／`correction` | Drawing workspace `edit_revision` | 無 review decision；依權限唯讀或無 CTA | `view` 或無 primary CTA |
| `bundle_ready` | Drawing workspace `submit_review` | 無 decision | `view` 或 locked reason |
| `in_review` | Drawing workspace `view`；具既有撤回權限者可在該頁撤回 | `/approvals/[requestId]`，決策只在全頁 review workspace | `view`，不得看見可執行 decision |
| `auto_finalizing` | Drawing workspace `view`／refresh | Approval page只讀處理進度 | `view` |
| `recovery` | 依既有 recovery capability 前往 Drawing workspace `recovery` 或 Approval request page | 只有 request authority允許的 recovery／decision | `view`與精確責任說明 |
| `rd_controlled`／`released`且可進版 | Drawing workspace `create_revision` | 無 review decision | `view` |
| terminal／history | 唯讀 history | 唯讀 history | 唯讀 history |

Drawer 每次最多回傳一個 server-derived primary navigation CTA。對 `surface=drawing`，`edit`、`submit_review`、`withdraw_review`、`cancel`、`approve`、`return_for_correction`、`reject`、`retry_apply`、`retry_cleanup`、`create_revision`、`manage_files` 等 mutation intent 的 descriptor 必須是 `type: "navigate"` 或 omitted／locked，不得是 `command`／`local`；`view_history`、preview、download、copy、refresh、return 可維持唯讀。Part／Relation resolver 行為不得因本 DEV 被改寫。

### Data、API、permission 與 concurrency contract

- 不新增 schema、migration、lifecycle state、permission 或 domain command。全頁 UI 沿用 `/api/numbering/drawings/workbench/[rowKey]`、`/api/pdm/entity-details/[entityKey]`、現有 revision／candidate file APIs、`/api/approvals/requests/[requestId]` 與 `/decisions`；若頁面整合需要 route-specific BFF，只能是 no-store read adapter，所有 write 仍呼叫既有 authority。
- read authority 至少保留 `numbering.drawings.view`／`numbering.workspace.view`；mutation 沿用 `numbering.workspace.update`、`numbering.draft.update`、`numbering.candidate.review.submit`、`numbering.candidate.review.withdraw`、`numbering.candidate.review.decide`、`numbering.publish`、`post_release_change`、`numbering.attachments.manage`，管理入口仍由 `settings.admin_matrix` 控制。
- exact reviewer、owner assignment、separation of duties、active-review write lock、company scope 必須由 server 於每次 write 重驗。可讀但不可寫時，全頁工作區以唯讀資料、精確 disabled reason 與應聯絡角色呈現；不能藉隱藏按鈕或 client query 代替授權。
- `rowVersion`／optimistic concurrency、Idempotency-Key、submission／publication 原子性與 audit 不變。409 必須刷新 server truth、保留可安全重填內容並要求使用者重新確認；未知 submit 結果先依 idempotency key 查詢／refresh，不得盲目重送。
- `NumberingCandidateRevisionEditor` 的必要檔案 gate 延用 `主要 3D 模型 + 主要 2D 圖面`；PDF、DWG／DXF 僅警告不阻擋。readiness 應收斂於右欄狀態／操作區，移除重複長句，不變更 server gate。

### Return、URL state 與 navigation contract

- Drawing workspace 的 `returnTo` 只接受 same-origin `/numbering/drawings`；review workspace 只接受 same-origin `/approvals`。拒絕外站、`//`、control characters 與不在 allowlist 的 path。現有 approval-only `normalizePdmApprovalReturnTo` 不得拿來正規化 Drawing list return；應抽出 surface-aware safe return helper。
- `readDrawingWorkbenchLocation`／`writeDrawingWorkbenchLocation` 必須納入 opaque signed cursor 與有界、非負的 page／pageIndex，並保存 keyword、view、stage、series、purpose、record／human status、history、sort、layout、detail 與 selected row。
- 返回時重新開啟原列 drawer，使該列可見並取得合理 focus；不要求還原像素級 scroll。cursor 過期時回第一個安全頁並顯示短說明；原列已離開結果或不存在時保留清單條件並說明，不能出現空白 drawer 或上一筆殘影。
- same-tab navigation、browser back／forward、hard reload、direct URL 都必須重抓 server truth。未儲存表單離開時顯示 discard guard；已成功上傳的檔案不是未儲存資料。

### Component boundary、responsive 與 duplicate-path prevention

- 新 route 負責 full-page shell；可抽出共用 owner editor，但 `NumberingCandidateRevisionEditor`、可寫 `CandidateDrawingFileUpload`、可寫 `MasterAttachmentPanel` 與 approval decision controls 只能掛載在對應 full-page route。
- `drawing-workbench.tsx`、`WorkspaceDrawer` 與 `UnifiedPdmEntityDetailDrawer` 的 Drawing 分支只保留 read projection／preview／download／navigation。resolver 是主要 truth；client drawer 再加 defense-in-depth：遇到 Drawing `command`／`local` descriptor 不執行並記錄可測錯誤，避免舊 payload 旁路。
- rollout 必須是單一 atomic placement change：legacy 與 unified Drawing drawer 同次變唯讀，新 full-page owner 同次可用。不可先新增 full-page editor卻保留 drawer write，也不可用既有 flag 讓其中一條 branch 繼續寫。
- 頁面 shell 固定於viewport：desktop左側visual可伸縮且`min-width:0`，右側task panel至少360px並擁有唯一內容scroll owner；左側圖面不隨右側長表單捲走。低於約900px改為主視覺→task panel單欄及一般page scroll。底部action bar須處理safe area且不遮內容；表單與預覽不得產生水平overflow。
- 頂部只保留一個 canonical status badge。底部包含返回／取消、儲存草稿與恰一個 primary；高風險最終送審可使用精簡 confirmation modal，但 editor 本體不可成為 fullscreen modal。

### Failure recovery、RD handoff 與 stop conditions

- 401：導向既有登入／session recovery 並保留安全 return；403：顯示缺少能力與應聯絡角色；404：回清單並說明物件不存在／已移除；409：依 server truth refresh；5xx／網路錯誤：保留已輸入但未送出的表單與逐檔成功結果，提供 retry，不顯示 raw JSON／stack／API body。
- 多檔上傳採逐檔結果；部分成功不得整批宣稱失敗或重傳已成功檔。送審結果不確定時禁止重複產生 request。
- RD 交付本輪新增 `scripts/qc-dev-079-contract.mjs` 與 package command `qc:dev-079:contract`；focused Playwright CLI evidence另保存owner／reviewer畫面。既有 DEV-053／067／072與entity-detail expected已依新zero-write／canonical route契約更新，不得刪除回歸來取得綠燈。
- RD Implementation Package 已在本機完成079-A～079-D與HD-079-04 visual-first/OCR placement；本輪再補齊候選唯讀抽屜的3D／2D同排預覽與歷史版次逐版展開；079-E仍交獨立QC收斂完整browser matrix與既有fixture blockers。不得把focused evidence冒充QA-079-01～28全PASS，亦不得因此操作staging／production。
- 停止條件：實作證明需要新 schema／permission／lifecycle／command owner、無法以 stable Drawing ID 定址、review request 無 canonical full-page authority、surface-aware return 不能安全完成、或無法同次移除兩條 drawer write path。遇到任一條應停止並回 Dev PM，不得以 duplicate form、modal、client-only permission 或放寬 expected 繞過。

QA 計畫：`.ai-doc/qa/qa-dev-079-drawing-readonly-drawer-fullpage-workspace-validation-plan-2026-08-19.md`。focused證據包含原079-A～D artifacts、本輪visual-first contract／browser量測，以及候選唯讀抽屜預覽／歷史版次收合證據；QA-079-01～28尚未宣告完整PASS。P0/P1 finding、Drawing drawer任一非預期write、OCR誤成submit gate、錯版來源、visible error、權限旁路、return open redirect、兩條mutation path或viewport遮擋均阻擋QA/QC PASS。

### RD Implementation Package（current authority）

本節記錄本輪實際可追溯的DEV-079責任檔案、元件、資料流與切片結果；成熟度是`RD Implemented Locally`，仍未宣告獨立QC完成。

#### Exact direct-edit inventory

原079-A～D attributable direct-edit inventory為`26 files = 20 source + 5 test scripts + package.json`。`HD-079-04`再納入3個原inventory外source：`drawing-detail-preview.tsx`、`drawing-recognition-pre-submit-panel.tsx`、新增`drawing-recognition-workspace-panel.tsx`；`drawing-owner-workspace.tsx`、`globals.css`與既有079 contract script屬原boundary內修訂。因此現行unique direct inventory為`29 files = 23 source + 5 test scripts + package.json`。工作樹另有既有使用者變更；未列入本數的dirty檔案不得被回溯計入DEV-079。

原079-A～D新增5個source（其中owner shell已由HD-079-04再修訂）：

| File | Responsibility |
|---|---|
| `src/app/numbering/drawings/[drawingId]/workspace/page.tsx` | canonical Drawing owner route；解析stable Drawing ID、intent與safe return，交給共用client workspace。 |
| `src/components/drawing-owner-workspace.tsx` | owner page shell、candidate／formal分流、server-truth refresh、visual-first兩欄／單欄、右側task tabs、OCR evidence bridge、底部actions與人類錯誤狀態。 |
| `src/components/use-unsaved-changes-guard.ts` | explicit return／cancel、browser back與`beforeunload`的dirty guard；已持久化upload不算dirty。 |
| `src/app/approvals/[requestId]/page.tsx` | canonical Drawing reviewer route；request ID定址與safe approval return。 |
| `src/components/approval-request-workspace.tsx` | 從既有Approval detail抽出可共用的request load、evidence／preview、exact decision／retry與error recovery。 |

原079-A～D修改source＋HD-079-04增量：

| File | Exact change |
|---|---|
| `src/app/globals.css` | DEV-079 viewport shell、左側大型preview、右側task content scroll、evidence overlay、固定action bar與約900px單欄規則；只改窄scope class。 |
| `src/components/drawing-detail-preview.tsx` | 向後相容新增grid／tabs layout、controlled active kind與overlay slot；既有consumer預設grid不變。 |
| `src/components/drawing-recognition-pre-submit-panel.tsx` | 向後相容新增source context override、compact／disabled與session callback；原drawing-number consumer不變。 |
| `src/components/drawing-recognition-workspace-panel.tsx` | 右側candidate OCR task：session status／poll、待處理／衝突篩選、接受／修正、2D evidence callback及canonical完整核對連結。 |
| `src/app/numbering/revisions/page.tsx` | 將`DrawingRevisionWorkbench`調整為canonical shell可重用、回報dirty；舊query解析後canonicalize或共用同一shell。 |
| `src/app/approvals/page.tsx` | 抽出共用request workspace；Drawing drawer只讀＋`前往審核`，非Drawing／歷史相容分支不變。 |
| `src/app/api/pdm/entity-details/[entityKey]/route.ts` | 依review request與Drawing surface選擇approval／drawing safe-return normalizer；維持no-store read。 |
| `src/components/drawing-workbench.tsx` | location納入cursor／page；candidate、formal與secondary action都改canonical navigate；Drawing drawers不再掛mutation。 |
| `src/components/numbering-candidate-revision-editor.tsx` | 提供dirty callback／canonical page integration；維持版次同列與`上傳此版次檔案`，移除主畫面重複長readiness句。 |
| `src/components/unified-pdm-entity-detail-drawer.tsx` | Drawing surface只執行navigate；永不開Drawing maintenance；收到Drawing command／local時fail closed，Part／Relation不變。 |
| `src/components/use-pdm-workbench-controller.ts` | 修正server-bidirectional cursorHistory以pageIndex定位、popstate初始化與invalid cursor URL清理。 |
| `src/lib/drawing-workbench.ts` | list query／response加入direction、pageIndex、previousCursor；Drawing row action href改stable owner／reviewer route。 |
| `src/lib/repositories/drawing-workbench-async-repository.ts` | 實作after／before keyset query；before反向掃描後恢復顯示順序，維持同一filter hash與company scope。 |
| `src/lib/pdm-detail-action-resolver.ts` | Drawing edit／submit／withdraw／retry／create revision／manage files與review decision改為canonical navigate／locked／omitted；Part／Relation command維持。 |
| `src/lib/pdm-entity-detail.ts` | 由canonical Drawing ID組owner href、保留surface-safe return；review request組reviewer href，其他surface維持現況。 |
| `src/lib/pdm-entity-detail-contract.ts` | navigation fallback／descriptor型別容納Drawing owner與Approval owner，不新增mutation execution種類。 |
| `src/lib/pdm-review-navigation.ts` | 抽出surface-aware same-origin allowlist；新增Drawing helper，保留approval helper相容wrapper。 |
| `src/lib/pdm-approval-owner-route.ts` | Drawing request owner指向`/approvals/[requestId]`；Part／Relation既有list-owner route不變。 |

測試／config direct edits：

| Kind | Files |
|---|---|
| New | `scripts/qc-dev-079-contract.mjs` |
| Update old expected／regression | `scripts/qc-dev-053-drawing-workbench-http.mjs`、`scripts/qc-dev-067-unified-entity-contract.mjs`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-pdm-numbering-approval-review-ui.mjs` |
| Commands | `package.json`新增`qc:dev-079:contract`；Playwright CLI focused evidence以本機runtime執行，未新增未可重現的fixture runner。 |

下列8個檔案是validation-only inventory，預設不得修改：`src/components/drawing-projection.tsx`、`src/components/drawing-workspace-drawer.tsx`、`src/components/pdm-workbench-list.tsx`、`src/lib/pdm-workbench-contract.ts`、`src/lib/pdm-workbench-cursor.ts`、`src/app/api/numbering/drawings/workbench/route.ts`、`src/app/api/approvals/requests/[requestId]/route.ts`、`src/app/api/approvals/requests/[requestId]/decisions/route.ts`。它們用來證明projection／container／list focus、cursor codec與既有read／decision authority可重用；若必須修改，視為inventory deviation。

#### Component and data-flow contract

```text
/numbering/drawings list
  -> Drawing readonly drawer
  -> server-derived navigate href
  -> /numbering/drawings/[drawingId]/workspace
       -> GET workbench detail: drawing:<stable-id>
       -> candidate: NumberingCandidateRevisionEditor
       -> formal: shared DrawingRevisionWorkbench
       -> existing revision/file/submit/withdraw APIs
       -> refresh server truth -> safe returnTo -> selected row

/approvals list -> Drawing readonly drawer -> /approvals/[requestId]
  -> existing GET request/evidence authority
  -> extracted ApprovalRequestWorkspace
  -> existing decision/retry API with exact-reviewer recheck
  -> refresh request truth -> safe approval returnTo
```

- Full-page元件只能組合現有write authority，不能複製repository／domain command、直接寫DB或新增proxy mutation。
- Drawing page以workbench detail中的`candidate`與formal revision truth決定editor，不以query intent決定資料種類。intent只選擇可見focus／primary；server state可降級成`view`或locked。
- Approval page先由request API重驗company、request kind、request state與exact reviewer；非Drawing request依既有owner route處理，不因動態route獲得Drawing decision UI。
- Drawing drawer只讀的防線有兩層：resolver不發command／local；client即使收到舊payload也不得發POST／PUT／PATCH／DELETE。

#### Return and bidirectional cursor implementation

1. `pdm-review-navigation.ts`保留`isSafePdmApprovalReturnTo`／`normalizePdmApprovalReturnTo`相容介面，新增Drawing allowlist介面；兩者都拒絕absolute URL、protocol-relative URL、control character與錯surface path。
2. Drawing location codec寫入keyword、view、stage、series、purpose、record／human status、history、sort、layout、detail、opaque cursor與bounded pageIndex；pageIndex不是DB offset，只是history／display identity。
3. repository接收`direction: after | before`。`before`使用相反比較與排序取得前頁，再於service response前reverse，確保畫面排序不跳動；response同時提供`previousCursor`與`nextCursor`。
4. controller的`cursorHistory[index]`必須與`pageIndex`對齊；next不得以`setCursorHistory([nextCursor])`後再讀index 1，previous／popstate亦同。invalid cursor時清除URL中的cursor／page，保留有效filters並顯示短notice。
5. 返回後以既有`PdmWorkbenchList.onRowRef`使selected row可見並取得合理focus；不新增像素scroll store。

#### Phase DAG、entry／exit gate

| Slice | Depends on | Direct implementation outcome | Exit gate |
|---|---|---|---|
| `079-A Route/action foundation` | 本SPEC、HD-079-01..04 | safe-return helpers、stable href、Drawing navigate resolver、entity-detail adapter | 新contract route／action／security matrix PASS；Part／Relation snapshot不變。 |
| `079-B Canonical full-page owners` | 079-A | 兩個dynamic routes、三個共用components/hooks、candidate／formal／reviewer UI與CSS | direct URL／reload、state×actor、required／recommended、dirty、401／403／404／409／5xx focused tests PASS。 |
| `079-C List-state recovery` | 079-A | after／before cursor、URL page state、history與selected-row restore | next／previous、back／forward、hard reload、expired cursor／missing row contract PASS。 |
| `079-D Atomic drawer cutover` | 079-B＋079-C | legacy、candidate、unified、approval Drawing drawer同次zero-write並導向canonical page | 兩flag branches × state × actor DOM/network mutation=0；Part／Relation回歸PASS；不得產生可release的半套狀態。 |
| `079-E QA freeze` | 079-D | focused contract、既有expected、browser evidence與fixture finding收斂 | QA-079-01～28、typecheck、focused regression、isolated build與cleanup evidence全部可追溯後交獨立QC；目前尚未完成全矩陣PASS。 |

RD每完成一個slice更新`.ai-doc/dev_task.md`為實際狀態與證據，不可預先標示後續slice完成。A～C可作本機reviewable commits，但整個DEV-079 application change只在D完成後才是可驗證artifact；任何中間commit均不可部署。

#### Dirty-worktree boundary and baseline

2026-08-19盤點到8個direct-edit files已dirty：`package.json`、`scripts/qc-dev-053-drawing-workbench-ui.mjs`、`src/app/globals.css`、`src/components/drawing-workbench.tsx`、`src/components/number-state-workspace.tsx`、`src/components/numbering-candidate-revision-editor.tsx`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/lib/pdm-entity-detail-contract.ts`。另有2個validation-only files dirty：`src/components/drawing-projection.tsx`、`src/lib/pdm-workbench-contract.ts`。

RD開始每個dirty direct file前先保存`git diff -- <file>`與scoped hash；只在目前working copy用窄hunk patch，禁止checkout／reset／整檔覆寫、整批stage或把無法歸屬的hunk算入DEV-079。若同一hunk無法安全分離，停止並回報Dev PM。

文件升級前的dirty baseline：

| Command | Result | Interpretation |
|---|---|---|
| `npm run qc:dev-053:ui` | FAIL 23/24 | formal filters／linked-part identity assertion失敗；既有baseline finding。 |
| `npm run qc:pdm-entity-detail-drawer` | FAIL | candidate identity assertion失敗；既有baseline finding。 |
| `npm run qc:dev-067:ui` | PASS | 舊editable-candidate expected仍成立，實作後必須有意改寫。 |
| `npm run qc:dev-067:navigation` | PASS | 舊approval-only fallback仍成立，實作後須擴為surface-aware。 |
| `npm run qc:dev-072:contract` | PASS | 舊action inventory baseline。 |
| `npm run qc:dev-072:api` | PASS | 舊Drawing command/decision baseline，實作後須改navigate。 |
| `npm run typecheck:app` | PASS | 文件升級前型別基線。 |

兩個既有FAIL不阻擋文件達到RD Implementation Ready，但會阻擋079-E PASS。RD／QA不得刪assertion、放寬expected或把它們誤報為DEV-079 regression；必須先重現、歸因並以修復或獨立owner/evidence關閉。

#### Rollout, rollback and Definition of Done

- 不新增DEV-079 feature flag。`PDM_UNIFIED_ENTITY_DETAIL_V1`只決定使用哪個唯讀renderer，不能決定Drawing是否可在drawer寫入。
- Local rollout順序固定A→B／C→D→E；B與C可在A後平行，但D必須同時依賴兩者。Production rollout未授權。
- Release artifact若未同時包含canonical owner/reviewer route與全部Drawing drawer zero-write，不得進staging／production。
- 無schema／migration／資料回填，故無DB rollback。P0、open redirect、permission旁路、重複mutation或任一drawer write發生時，回退整個DEV-079 application artifact／commit set至前一版本；不得只恢復單一legacy／unified branch。舊`/numbering/revisions`compatibility adapter保留作降級入口。
- DoD：原079-A～D direct edits可追溯；HD-079-04新增／修改檔案與本輪候選唯讀抽屜修正以scoped diff為準，visual-first contract與預覽／歷史版次focused contract、typecheck、affected lint與readonly browser evidence已取得。QA-079-01～28、四actor／三viewport完整matrix與既有fixture findings仍須由獨立QC結案。DoD不授權commit／merge／deploy／release或live data操作。

## 2026-08-14 DEV-072 Amendment - 可預期但不可旁路的明細動作列

Status: `Local RD/QA/QC Complete / Human Confirmed / Production Release Gated`.

### 2026-08-14 Approval owner drawer follow-up - 審核情境移除重複流程入口

在 `/approvals` 由送審項目進入的 `UnifiedPdmEntityDetailDrawer` 已經是審核者正在處理的明細，不再重複提供會把人帶回同一流程或改變受控資料的 owner workflow entry：

- `detail:<owner>:view_review`（`查看審核`）省略：目前已在審核工作台。
- `detail:<owner>:withdraw_review`（`撤回送審`）省略：撤回是送審者／owner 的送審流程操作，不是審核者決策操作。
- `detail:relation:manage_relation`（`維護圖料關聯`）省略：審核者只查閱送審快照與做 request 允許的決策，不在審核抽屜開啟關聯維護。

此規則只由 server resolver 在 `review` receipt 存在的 Approval owner context 套用；一般圖號、料號、圖料根號工作台，以及未帶 review receipt 的 owner detail 不變。審核決策 action 與「返回」保留，Projection data、3D／2D preview、snapshot 與 command authority 不變；審核者畫面只去除重複的人類狀態 badge 與 `自動預覽` 標題列。

### 2026-08-14 Visible detail cleanup - 預覽資訊去重

在所有 `UnifiedPdmEntityDetailDrawer` context 中，`DrawingProjection` 不再顯示重複的「預覽狀態／代表狀態」fact，也不顯示 `DrawingDetailPreview` 的 `自動預覽` 標題列；3D／2D preview card、檔案名稱、ready／missing／running 等卡片內狀態仍保留。預覽狀態只在實際 3D／2D 卡片內呈現，避免同一狀態在圖面資料摘要、區段標題與預覽卡重複。

### Human decision and problem statement

圖號、料號、圖料根號及審核 owner detail 現行只顯示「現在可按」或「現在主要」的動作，其他動作在不同狀態突然出現或消失。這讓使用者無法預先建立流程心智模型，也無法知道完成目前條件後可做什麼。人類已確認以下顯示原則：

1. 對目前 owner surface 與物件生命週期仍然**適用**的動作一律顯示；尚不可執行時顯示低色階鎖頭並禁止操作。
2. locked 原因不常駐佔版；桌面 hover、鍵盤 focus、觸控點擊鎖頭時顯示短提示。
3. 不屬於該 surface、跨 domain 的管理動作、或已永久終結且未來不可能執行的動作完全不顯示，也不放進「更多」。資料摘要仍依 projection policy 顯示，不因隱藏跨 domain 動作而消失。
4. 可執行動作以 primary／accent 渲染提示；同一動作由 locked 轉 enabled 時位置與文字不變。
5. 每個情境最多一個 primary CTA；審核情境在 owner action catalog 上增加精確允許的審核決策，送審期間 owner mutation 保持 locked。

此設計有意取代「只顯示當下 CTA」、「無權限時不顯示 disabled 假入口」及「disabled 原因必須常駐在控制項旁」在本共用 drawer action bar 的舊顯示規則；不取代 server permission、狀態機、separation of duties、domain command authority、active-review write lock、idempotency、audit 或 publication authority。Spec Impact Preflight：`Intentional replacement`。既有 DEV-067 composer／projection ADR 足以承載本變更，不新增架構 ADR。

### Applicability contract

server 必須先判定 action 是否適用，再判定現在能否執行：

```text
action definition
  -> applicable = false  => omit from payload and DOM
  -> applicable = true
       -> enabled = true  => render actionable control
       -> enabled = false => render locked control + accessible reason
```

- `applicable` 是 domain、surface、生命週期及永久終態的判定，不等同權限。client 不得以 CSS 隱藏 server 已回傳的不適用動作，也不得自行補出 server 未授權的動作。
- 因 prerequisite、processing、active review、actor permission、ownership 或 separation-of-duties 暫時不能執行，但未來仍可能執行的 action 保留並 locked。
- 已取消、作廢、純歷史、永遠不屬於該 owner surface，或沒有任何合法恢復路徑的 mutation action 必須省略；utility read action 只有仍有任務價值時保留。
- `disabledReason` 必須是人類可理解的一句原因與必要責任角色；machine reason 使用獨立 `disabledReasonCode`。UI 不得顯示 raw API error、stack、SQL 或內部例外。
- disabled control 的 click、Enter、Space、touch 及 direct API 旁路均不得導航、送 request 或造成資料異動；domain server authority 仍須對 enabled command 重新驗證，不能信任 client descriptor。

### Owner action inventory

以下是 action **種類清冊**，不是要求所有列同時渲染；resolver 仍依上節判斷 applicable。跨 domain 資料可以摘要顯示，但跨 domain 管理 action 完全省略。

| Owner surface | 可納入的 action catalog | 必須省略的跨 domain action |
|---|---|---|
| Drawing | `edit`（UI label：`圖面維護`，同一入口承載主資料與附件維護）、`submit_review`、`view_review`、`withdraw_review`、`create_revision`、`view_history`、`refresh`、`return` | Part 主資料編輯、Relation 管理 |
| Part | `edit`、`submit_review`、`view_review`、`withdraw_review`、`view_history`、`refresh`、`return` | Drawing 檔案／進版、Relation 管理 |
| Relation | `manage_relation`、`submit_review`、`view_review`、`withdraw_review`、`view_history`、`refresh`、`return` | Drawing 檔案／進版、Part 主資料編輯 |
| Assigned active review | request policy 精確允許的 `approve`、`return_for_correction`、`reject`，加上 `return`；Approval owner context 省略 `view_review`、`withdraw_review`，且 Relation 不提供 `manage_relation` | request scope 外、未指派、跨公司或該 domain 不支援的 decision，以及審核者不應在此處執行的 owner workflow entry |

`return` 可依「哪裡來，哪裡去」由 drawer close／back affordance 承擔，不要求在 footer 重複一顆按鈕；但 return contract 必須在 action model 或 shell contract 中可驗證。`refresh` 只在 delayed／processing／recoverable error 有任務價值時適用。

### Stable grouping, order and rendering

- 固定群組順序：`object -> workflow -> review -> utility`。同群組由 server `order` 排序；狀態切換不得改變同一 action 的相對位置。
- `primary` 只能有 0 或 1 個。當 prerequisite 尚未完成時，未來 primary 仍留在其固定位置但為 locked；目前可推進流程的 action 才使用 primary/accent。其他 action 為 secondary／tertiary。
- 本 contract 不提供「更多」作為 action 倉庫。不適用 action 完全省略；適用 action 必須在 action bar 可發現。
- locked control 使用低色階 lock icon、正常可讀標籤、`aria-disabled="true"` 與明確 focus style；不得只靠顏色，也不得使用不可 focus 的原生 disabled button 作為唯一 DOM。
- 原因提示使用同一 accessible tooltip／popover primitive：pointer hover 約 300ms、鍵盤 focus 立即、touch 點擊鎖頭開啟；最多兩行、不可包含互動連結；Escape、移出／失焦、點外關閉。native `title` 不得作為唯一提示機制。
- drawer action bar 必須維持單一 body scroll owner、sticky/footer 安全距離與 1440×900、1024×768、768×1024、390×844 可達性；不可遮住內容、產生水平 overflow 或讓 mobile touch target 小於既有設計系統下限。

### State expectations

| State family | Expected action behavior |
|---|---|
| 建立／準備中 | 編輯或補件可用；`送交審核`固定顯示但 locked，提示尚缺的最高優先 prerequisite |
| 可送審 | 同位置的`送交審核`解鎖並成為唯一 primary；不新增第二顆送審按鈕 |
| 送審／審核中（owner 工作台） | `查看審核`為主要可用動作；owner edit、檔案、關係等適用 mutation locked，提示`送審中不可修改`；撤回只在 policy 允許時 enabled，否則 locked 或在永久不適用時省略 |
| 審核者 Approval owner drawer | 不重複顯示 `查看審核`、`撤回送審`；Relation 也不顯示 `維護圖料關聯`；只顯示 request 允許的決策與安全返回，投影與審核快照仍完整可查閱 |
| 系統正式化／處理中 | mutation locked；有任務價值時顯示可用`重新整理`／`查看處理狀態`，不提供人工發布 |
| 退回補正 | owner 修正動作解鎖；重新送審保留但在 prerequisite 未完成前 locked |
| 已發布／受控 | Drawing 的`建立新版`依 authority 可用或 locked；首版送審、審核決策等已不適用 action 省略 |
| 已取消／作廢／純歷史 | mutation action 全部省略；只保留仍具任務價值的 history／return/read utility |

### Typed contract and API version

現行 `pdm-entity-detail.v1` 的 `primary` 必填、descriptor 欄位不足且 Drawing 可由 client override，無法安全表示本需求。這是 feature-gated、`private, no-store`、由同一部署的單一 drawer 消費的內部 API；RD 必須將 response 明確升為 `pdm-entity-detail.v2`，不得在同一 schema version 靜默改變 nullability 或 action semantics。endpoint 與 query parameters 不變：

```text
GET /api/pdm/entity-details/[entityKey]
  ?surface=drawing|part|relation
  &reviewRequestId=<optional exact request>
  &returnTo=<validated local path>
```

`src/lib/pdm-entity-detail-contract.ts` 的目標型別固定如下：

```ts
type PdmDetailActionKind =
  | "edit"
  | "submit_review"
  | "withdraw_review"
  | "approve"
  | "return_for_correction"
  | "reject"
  | "retry_apply"
  | "retry_cleanup"
  | "create_revision"
  | "view_review"
  | "manage_relation"
  | "view_history"
  | "refresh"
  | "return"
  | "manage_files";

type PdmDetailActionGroup = "object" | "workflow" | "review" | "utility";

type PdmDetailActionDisabledReasonCode =
  | "PDM_ACTION_PREREQUISITE_MISSING"
  | "PDM_ACTION_PERMISSION_REQUIRED"
  | "PDM_ACTION_OWNER_REQUIRED"
  | "PDM_ACTION_REVIEW_LOCKED"
  | "PDM_ACTION_REVIEW_SCOPE_REQUIRED"
  | "PDM_ACTION_REVIEW_DRIFT"
  | "PDM_ACTION_PROCESSING"
  | "PDM_ACTION_TARGET_UNAVAILABLE";

type PdmDetailActionExecution =
  | { type: "navigate"; href: string }
  | {
      type: "command";
      method: "POST";
      href: string;
      body: Record<string, string | number | boolean | null>;
      input: "none" | "optional_reason" | "required_comment";
      success: "refresh_detail" | "return_to_inbox";
    }
  | { type: "local"; command: "refresh" | "return" };

type PdmDetailActionDescriptor = {
  id: `detail:${"drawing" | "part" | "relation" | "approval" | "navigation"}:${string}`;
  kind: PdmDetailActionKind;
  owner: "drawing" | "part" | "relation" | "approval" | "navigation";
  label: string;
  tone: "primary" | "secondary" | "danger";
  placement: "primary" | "secondary";
  group: PdmDetailActionGroup;
  order: number;
  enabled: boolean;
  disabledReason: string | null;
  disabledReasonCode: PdmDetailActionDisabledReasonCode | null;
  permissionCode: string | null;
  contactRole: string | null;
  execution: PdmDetailActionExecution | null;
  requiresConfirmation: boolean;
  idempotencyRequired: boolean;
};

type ContextActionBarModel = {
  primary: PdmDetailActionDescriptor | null;
  secondary: PdmDetailActionDescriptor[];
};

type PdmEntityDetailResponse = {
  schemaVersion: "pdm-entity-detail.v2";
  // entity/header/projections/navigation stay compatible with v1
  actionBar: ContextActionBarModel;
};
```

不新增 `visible` 或 `applicable` 欄位：不適用即不回傳。`primary` 與 `secondary` 合計必須包含所有 applicable context actions，且 group/order 是穩定順序的唯一權威。enabled action 必須有非 null `execution`；locked action 必須 `execution=null`，避免 event guard 失效時仍保留可執行 target。`href`／`commandRef` 舊欄位由 v2 的 discriminated `execution` 取代，不保留兩份 action target truth。

`GET /api/pdm/entity-details/[entityKey]?surface=...&reviewRequestId=...&returnTo=...` 回傳的 `actionBar` 是 drawer 的唯一 action truth。現行 Drawing route 的 `primaryContextAction` client prop／override 必須自 `UnifiedPdmEntityDetailDrawer` public contract 移除；`drawing-workbench.tsx` 的 list-row `primaryAction` 可繼續服務清單列，但不得再注入或覆蓋 drawer action bar。Part、Relation 與 Approval owner route 同樣不得新增平行 override。

### Server action resolver contract

新增 `src/lib/pdm-detail-action-resolver.ts`，只接受已驗證的 server facts，不讀 request query 中的 role、enabled、action kind 或 permission。`PdmEntityDetailService.compose()` 在同一次 aggregate read 後傳入：

- canonical `entityKey`、requested owner `surface`、server-derived `stateFamily`；
- candidate workspace ID、owner ID、row version、lifecycle-v2 effective flag、active request ID、decision count；
- formal Drawing number、current lifecycle request／submitter／decision count；
- readiness blocker codes，依既有 owner service 的必要條件排序；
- exact review receipt、allowed decisions、snapshot drift 與 return path；
- server-resolved capability map及現有 canonical owner href。

新增 `src/lib/pdm-detail-action-capabilities.ts`，由 API route 對 authenticated user/company 一次取得本 surface 所需 capability。允許的既有 permission code 只有：

| Capability | Existing permission authority |
|---|---|
| workspace edit | `numbering.workspace.update` |
| formal/candidate Drawing data edit | `numbering.draft.update` |
| submit review | `numbering.candidate.review.submit` |
| withdraw review | `numbering.candidate.review.withdraw` |
| retry publication | `numbering.publish` |
| create Drawing revision | `post_release_change` |
| manage Drawing files | `numbering.attachments.manage` 或既有 revision owner authority |
| edit Part variant | `numbering.draft.update` |
| manage Drawing-Part relation | `numbering.link_variant` |
| show Admin permission link | `settings.admin_matrix` |

review decision 不以一般 role boolean 取代；仍以 DEV-067 exact request/company/target `PdmReviewScopeReceipt` 與 decision API 為權威。permission resolution 位於 read snapshot 外，aggregate projection 的 `16/16/24/28` query budget不變；capability checks 必須是固定集合，不得依附件／料號／關聯數量 N+1。

### Canonical action IDs, order and primary selection

stable ID/order 固定如下；不適用可省略，但不得重編號或把 enabled action移到前方：

| Action | Stable ID pattern | Group / order |
|---|---|---:|
| edit | `detail:<owner>:edit` | `object / 100` |
| manage_files | `detail:drawing:manage_files` | `object / 110` |
| manage_relation | `detail:relation:manage_relation` | `object / 120` |
| submit_review | `detail:<owner>:submit_review` | `workflow / 200` |
| view_review | `detail:<owner>:view_review` | `workflow / 210` |
| withdraw_review | `detail:<owner>:withdraw_review` | `workflow / 220` |
| retry_apply | `detail:<owner>:retry_apply` | `workflow / 230` |
| retry_cleanup | `detail:<owner>:retry_cleanup` | `workflow / 240` |
| create_revision | `detail:drawing:create_revision` | `workflow / 250` |
| view_history | `detail:<owner>:view_history` | `workflow / 260` |
| approve | `detail:approval:approve` | `review / 300` |
| return_for_correction | `detail:approval:return_for_correction` | `review / 310` |
| reject | `detail:approval:reject` | `review / 320` |
| refresh | `detail:navigation:refresh` | `utility / 900` |
| return | `detail:navigation:return` | `utility / 910` |

primary 選擇是純 server priority，不依 client array position：

1. exact assigned review 且可決策：`approve`；
2. correction/building：enabled `edit` 或 `manage_relation`；
3. ready：enabled `submit_review`；
4. in-review owner surface：`view_review`；
5. recovery：enabled `retry_apply` 或 `retry_cleanup`；
6. released Drawing：enabled `create_revision`；
7. processing、terminal、只有 locked actions或只有 utility read：`primary=null`。

locked future action不得以 primary tone 假裝可執行；它保留原 group/order並使用 secondary low-tone lock。當同一 action 解鎖時 ID/order/label不變，只改 `enabled`、reason、tone/placement、execution。

### Applicability and disabled-reason precedence

resolver 依下列順序選一個最可行的 locked reason，禁止 client拼接：

1. snapshot drift／exact review scope不成立；
2. active-review mutation lock；
3. system processing；
4. ownership／submitter條件；
5. permission；
6. readiness prerequisite；
7. canonical target 暫不可用。

狀態 inventory 固定為：

- Candidate building/preparation/correction：owner object actions + `submit_review`；尚缺必要條件時 submit locked。尚未存在 request 時不顯示 `view_review/withdraw_review`。
- Candidate ready：同一 `submit_review` 解鎖；object actions仍依 owner/permission可用。
- Candidate/formal in review（owner 工作台、未帶 review receipt）：object mutations保留但以 `PDM_ACTION_REVIEW_LOCKED` 鎖定；`view_review`可用；`withdraw_review`只要 request仍具可能撤回的語意即顯示，非 submitter、已有 decision或缺權限時 locked，request已 terminal則省略。
- Auto-finalizing：mutation locked；只有有任務價值的 `refresh`／processing view，不顯示人工 publish。
- Recovery：只顯示現有 owner authority真正支援的 retry/view/history；不得新造 publish command。
- Released/controlled Drawing：candidate submit/withdraw省略；`create_revision`依 `post_release_change` enabled或locked；history可用。
- Formal Part：Part-owned `edit`與history；Drawing file/revision及Relation管理省略。
- Formal Relation：Relation-owned `manage_relation`與history；Drawing file/revision及Part edit省略。
- Cancelled/obsolete/merged/history-only：mutation全部省略，只保留有資料可看的 history及 shell return。
- Assigned active review：Approval owner context 不套用 owner workflow entry 的重複入口；省略 `view_review`、`withdraw_review`，Relation 的 `manage_relation` 亦省略，只疊加 request真正允許的 decisions 與安全 return。未列於 `allowedDecisions` 的 decision省略，而不是顯示全域三顆按鈕。

### Existing command routing and payload

DEV-072 不新增 domain mutation API。server descriptor只可指向下列既有 owner authority；所有 command仍由 endpoint重新驗證 permission、company、state、ownership、row version、review lock與 idempotency：

| Action | Existing execution |
|---|---|
| candidate submit | `POST /api/numbering/draft-workspaces/{workspaceId}/submit-bundle-review` when lifecycle v2 effective，否則既有 `/submit-review`; body包含 server-read row version與 reason；Idempotency-Key必填 |
| candidate withdraw | `POST /api/numbering/draft-workspaces/{workspaceId}/withdraw-bundle-review` when lifecycle v2 effective，否則既有 `/withdraw-review`; body包含 server-read row version與 reason；Idempotency-Key必填 |
| formal Drawing review withdraw | `POST /api/approvals/requests/{requestId}/withdraw`; Idempotency-Key必填 |
| review approve/return/reject | `POST /api/approvals/requests/{requestId}/decisions`; body decision只能來自 descriptor kind mapping，非 approve需 `required_comment`; Idempotency-Key必填 |
| create revision | existing `/numbering/revisions?drawingNumber=...&returnTo=...` canonical navigation |
| edit/files/relation/history/view review | existing canonical owner href/anchor only；若目前沒有可完成任務的 owner target，該 action不得標 enabled，且不得新增平行 drawer或跨-domain write API |
| refresh/return | drawer local refresh與 validated `navigation.returnTo` |

command body內的 row version是當次 detail response 的 optimistic token；若 response在執行前已 stale，existing endpoint回409。client 顯示人類化訊息並重新讀取整個 v2 detail；不得自動以新 version重送。busy期間該輪所有 mutation controls設 `aria-busy`/locked且 exactly-once；navigation/read actions可依既有 UX保留。

### Shared control component and interaction contract

新增 `src/components/pdm-detail-action-control.tsx`，由 `UnifiedPdmEntityDetailDrawer` 的 primary/secondary actions共用：

- enabled navigate使用 `<a>`；enabled command/local使用 `<button>`。
- locked一律使用可聚焦的 `<button type="button" aria-disabled="true">`，不使用 native `disabled`，並在 click／Enter／Space handler第一行阻擋 execution。
- 每個 locked control渲染低色階 `LockKeyhole`、`aria-describedby=<stable-tooltip-id>`、`data-action-id/group/order/enabled`，供 a11y 與 QC盤點。
- tooltip state集中在 action control，不在 drawer page複製；hover 300ms timer、focus立即、touch點鎖頭開啟，Escape/blur/outside pointer關閉，unmount清 timer；使用 viewport-clamped fixed portal或等效現有 primitive。
- tooltip文字來自 server `disabledReason`，最多兩行；`permissionCode`可供支援證據，不得把 raw API/stack當主要文案。
- action busy不得把既有 permission/review reason永久覆蓋；busy只是一個本輪 UI狀態，完成後重新讀 server action truth。

`UnifiedPdmEntityDetailDrawer` 只執行 `execution` discriminated union，不依 entity state/role決定顯示。review comment UI可沿用現行最小互動，但 action kind到 decision payload mapping必須集中且 exhaustively typed；unknown kind/execution fail closed並觸發可見 generic refresh error。

### Exact implementation files

新增：

- `src/lib/pdm-detail-action-resolver.ts`：pure applicability、reason、order與primary resolver。
- `src/lib/pdm-detail-action-capabilities.ts`：固定 permission capability resolver。
- `src/components/pdm-detail-action-control.tsx`：共用 enabled/locked/tooltip control。
- `scripts/qc-dev-072-action-contract.mjs`：v2 schema、inventory、negative inventory、stable order、no client override、no CSS hiding。
- `scripts/qc-dev-072-action-api.mjs`：disposable fixture 的 disabled no-op、direct API fail-closed、submit/withdraw/decision/idempotency/data hash。
- `scripts/qc-dev-072-browser.mjs`：AI real-browser `ACT-016..030`、四 viewport與 evidence manifest。

修改：

- `src/lib/pdm-entity-detail-contract.ts`、`src/lib/pdm-entity-detail.ts`。
- `src/app/api/pdm/entity-details/[entityKey]/route.ts`：capability resolution與v2 response；不改 page-view gate/company isolation。
- `src/components/unified-pdm-entity-detail-drawer.tsx`：移除 `primaryContextAction`、只執行 v2 execution、nullable primary、busy/error/refresh。
- `src/components/drawing-workbench.tsx`：移除 `PdmDetailActionDescriptor` adapter與 `unifiedPrimaryAction` injection；list-row action維持。
- `src/app/globals.css`：scoped action bar、locked、tooltip、focus、touch與responsive styles。
- `scripts/qc-dev-067-unified-entity-contract.mjs`、`scripts/qc-dev-067-unified-drawer-ui.mjs`及必要的 `scripts/qc-dev-067-browser.mjs` assertions：接受v2並證明DEV-067 projection/review/return不回歸；歷史證據檔不改寫。
- `package.json`：新增 `qc:dev-072:contract`、`qc:dev-072:api`、`qc:dev-072:browser`、`qc:dev-072`。

`part-workbench.tsx`、`relation-workbench.tsx`、`app/approvals/page.tsx` 預期只需由現有 unified drawer自動取得 v2 action，無新 override；若實作必須修改，僅允許型別／selector／safe-return整合，不得加入 domain action catalog。無 schema/migration、fixture migration、新 dependency、env或feature flag；沿用 `PDM_UNIFIED_ENTITY_DETAIL_V1` 作 rollback gate，API payload schema本身為v2。

`package.json` script value 也是交付契約，不只是命名建議：

```json
{
  "qc:dev-072:contract": "node scripts/qc-dev-072-action-contract.mjs",
  "qc:dev-072:api": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-072-action-api.mjs",
  "qc:dev-072:browser": "node scripts/qc-dev-072-browser.mjs",
  "qc:dev-072": "npm run qc:dev-072:contract && npm run qc:dev-072:api && npm run qc:dev-067:contract && npm run qc:dev-067:policy && npm run qc:dev-067:query && npm run qc:dev-067:ui && npm run qc:dev-067:preview && npm run qc:dev-067:review && npm run qc:dev-067:lock && npm run qc:dev-067:navigation && npm run qc:dev-072:browser && npm run typecheck:app && npm run build:isolated"
}
```

### Phase sequence and exit gates

| Phase | RD scope | Exit gate |
|---|---|---|
| 1A Contract/server | v2 types、capability resolver、action resolver、route/service、Drawing override removal | `qc:dev-072:contract`、`qc:dev-067:contract`、`qc:dev-067:policy`、`qc:dev-067:query`、`qc:dev-067:navigation` PASS；ACT-001..010 static/fixture evidence |
| 1B Shared UI | action control、tooltip、nullable primary、stable layout、busy/no-op/a11y | focused component/DOM checks + affected lint/typecheck；ACT-011、013..015 PASS |
| 1C Command integration | existing submit/withdraw/decision/navigation execution、409/403 refresh、idempotency、exact review overlay | `qc:dev-072:api` + DEV-067 lock/review regressions PASS；ACT-012 and mutation evidence |
| 1D AI QC | disposable isolated app，AI真實操作ACT-016..030 | `qc:dev-072:browser`、四viewport、cleanup、P0/P1=0；aggregate `qc:dev-072` PASS |

RD每一 phase完成後才進下一 phase。若1A發現 action truth只能由 client workbench state取得，立即停止，不得先做 CSS/tooltip 製造表面完成。

### Implementation boundary and exact impact

本機 Phase 1A～1D 現在可由 RD 執行。禁止 schema/migration、新 dependency、環境變數、production/staging data、permission/state-machine改寫、第二套 drawer、直接改正式資料或 release。若實作發現必須改其中任一項，或無法由既有 server capability判定 applicability，立即停止回 Dev PM，不可在 client猜測。

Dirty worktree boundary：目前 branch已有大量既存修改，且 DEV-067相關產品檔亦為 dirty。RD 必須先記錄本任務開始時的 scoped diff，僅在上述 exact files上疊加最小變更；不得 reset、restore、重排或提交其他人的修改。若同一 hunk 無法安全分離，停止並回報衝突檔/hunk，不可覆寫。

### Acceptance and AI real-operation QC gate

- `ACT-001..015`：action inventory、applicability omission、stable group/order、唯一 primary、disabled no-op、server bypass、permission/company/request scope contract。
- `ACT-016..030`：AI 必須在真實 Chromium rendered page 操作四工作台 owner detail，覆蓋 hover、keyboard focus、touch tooltip、locked→enabled 同位置、真實 disposable 送審／撤回／決策、returnTo、四 viewport、visible error、console/network/5xx sweep。
- QC evidence authority：`.ai-doc/qa/qa-dev-072-pdm-action-discoverability-ai-real-operation-validation-plan-2026-08-14.md`。
- PASS 必須有可重跑 manifest、case result、before/after screenshots、DOM/ARIA snapshot、interaction trace、network/data mutation assertion與 cleanup 結果。單元測試、source scan、build 或「畫面看起來正確」均不能取代 AI 真實操作。
- DEV-072 本機 Phase 1A～1D 已完成；final AI real-browser evidence與aggregate均通過。DEV-067 歷史 PASS未被冒充為DEV-072證據，production release保持 gated。

### RD Readiness Review

- Architecture：沿用 DEV-067 composer/projection/server-policy ADR；新增的是 action resolver/control，不建立第二套 detail body。ADR not needed。
- API：同 endpoint 升為明示 v2；input/output、action execution、nullable primary與client override removal已固定。
- Data/schema/migration：無 persistent data change、無 migration、無 cache migration。
- Permissions：只讀取既有固定 capability；decision仍由 exact review receipt與既有 command API；不新增或放寬權限。
- State machine：不改 transition；applicability/state matrix、terminal omission與reason precedence已固定。
- Transaction/concurrency：read projection snapshot不變；write仍由既有 endpoint transaction/lock/idempotency/row version權威；409不自動重送。
- Failure recovery：unknown action fail closed、disabled零execution、403/409整體refresh、202 processing、tooltip失效不解鎖皆已定義。
- Backward compatibility/rollback：feature flag預設/現況邊界不變；同部署 client/server使用v2；關閉既有 unified detail flag回legacy，無資料回滾。
- QA/QC：ACT-001..030、phase gates、exact scripts、evidence/cleanup與AI真實操作已定義。
- Open P0/P1 readiness gap：0。高影響 deferred scope只有production release，維持既有 release gate；沒有新future phase或新DEV。

Result: `DEV-072 Local RD/QA/QC Complete / Human Confirmed / Production Release Gated`.

### 2026-08-14 DEV-072 Implementation and QC Result

- Server：`pdm-entity-detail.v2`、固定九項capability map、pure action resolver、typed execution、reason precedence、stable ID/group/order與nullable unique primary已落地。
- Client：四工作台共用同一`ContextActionBar`與`PdmDetailActionControl`；Drawing override、`primaryContextAction`、`showOwnerNavigation`與client decision mapping已退役。locked control支援hover/focus/touch、event guard、fixed portal與140px desktop stable slot；390px改為full-width。
- Command integration：沿用既有submit/withdraw/decision routes與server revalidation；403/409 fail closed，409不自動重送；`return_to_inbox`成功不再背景refresh失效detail。
- Final evidence：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T050039Z-113d57e2/`，21/21 browser cases、13 screenshots、12/12 visible-error sweeps、0 console/page error、0 unexpected 4xx/5xx、2 expected-negative、cleanup removed 8且temporary root removed。manifest含實際HEAD／branch、scoped dirty/content SHA-256與19個來源檔清單；runner只對已知Windows `next-env.d.ts` transient lock做最多三次啟動重試，其他錯誤仍fail closed。
- Mutation evidence：confirmation cancel=0 write；submit、withdraw、needs-info、reject、approve各exactly once；stale direct submit=409、permission direct submit=403，兩者domain state unchanged。
- Aggregate：`npm run qc:dev-072` PASS，包含DEV-067回歸、TypeScript與isolated production build。Focused QC conclusion：`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`。
- Boundary：無schema/migration、新permission code、domain mutation API、dependency、env或production data change；production release仍gated。

## 2026-08-12 DEV-067 Amendment - `UnifiedPdmEntityDetailDrawer`

Status: `Local RD Implemented / Local QA-QC Passed / Production release gated`.

### Fact finding and gap classification

The existing implementation has partial shell convergence, not one cross-state and cross-domain detail contract:

- Candidate and formal paths share `DrawingWorkspaceDrawer`, `DrawingDetailContent` and the low-level `PdmEntityDetailDrawer` shell.
- Candidate still composes `NumberingCandidateRevisionEditor`, `CandidateDrawingPreview`, `LifecycleV2PendingPanel` and `WorkspaceRelationsDetails`; formal composes `MasterAttachmentPanel`, `DrawingSubmissionPrerequisitePanel`, `SameRootPartPanel` and contextual entrypoints.
- Candidate preview currently maps file presence directly to `ready`, while formal preview uses the attachment/derivative queue, polling and richer ready/delayed/failed states. Sharing `DrawingDetailPreview` card markup does not make those behaviors equivalent.
- The flag-off branch in `src/app/numbering/drawings/page.tsx` still owns a separate `DrawingDetailDrawer` composition.
- Part candidate detail uses the shared workspace composition while formal Part detail directly composes `PdmEntityDetailDrawer` and `PartDetailContent`; the visible body still changes by source state.
- Relation root/candidate/child details use relation-specific composition and custom owner renderers. It reuses some owner content, but there is no single projection order or visibility contract shared with Drawing and Part.
- Existing static QC proves shared component references and a common section skeleton; it does not prove one preview orchestration, one section model or one real-browser behavior across every lifecycle state and reviewer role.

Therefore the earlier statement that all lifecycle variants use one visible detail module is only partially satisfied. A Drawing-only wrapper would also leave Part and Relation muscle memory split. `DEV-067` intentionally strengthens the contract below.

### Canonical visible component

Every covered Drawing, Part and Relation lifecycle state and actor context MUST mount one top-level `UnifiedPdmEntityDetailDrawer`:

```text
UnifiedPdmEntityDetailDrawer
├─ SharedIdentityStatusHeader
├─ ProjectionComposer（固定相對順序）
│  ├─ DrawingProjection
│  ├─ PartProjection
│  ├─ RelationProjection
│  └─ ReviewContextProjection
│     └─ ApprovalSnapshotProjection（scope/hash/diff evidence only）
└─ ContextActionBar
```

The fixed order is a sequence of available projection slots, not a requirement to render empty cards. A projection that is not applicable or not authorized is not hydrated and is omitted; the remaining slots keep their relative order. `PdmEntityDetailDrawer`, `DrawingWorkspaceDrawer` and `WorkspaceDrawer` may temporarily remain as low-level shell or compatibility wrappers, but they must not remain public APIs capable of independently assembling a covered domain body.

`UnifiedPdmEntityDetailDrawer` owns overlay geometry, shared header, one body scroll owner, focus/Escape behavior, safe return and one `ContextActionBar`. It MUST NOT contain a giant Drawing/Part/Relation status-role conditional render tree. A projection registry maps normalized projection models to domain-owned components. `DrawingProjection`, `PartProjection` and `RelationProjection` retain their domain data, preview and command authorities; they may consume facts, media identifiers, capabilities, disabled reasons and command references, but may not fetch or mutate a second object truth from inside the shared composer.

### Server-derived projection policy

The server derives `none | summary | full` for every projection from the canonical entity, surface, lifecycle state, actor capabilities, company and active review context. It returns only permitted projection data and fields. Fetching all data and hiding sections with client conditions or CSS is forbidden.

| Surface/context | DrawingProjection | PartProjection | RelationProjection | ReviewContextProjection |
|---|---|---|---|---|
| `/numbering/drawings` normal | `full`: shared 3D/2D, files/revisions, readiness | `summary`: linked part identity/summary only | `summary`: relation and traceability | `none` |
| `/parts` normal | `summary`: representative drawing identity/preview summary only; no drawing files or revision detail | `full`: part facts and permitted part documents | `summary`: linked drawings and traceability | `none` |
| `/numbering/search` relation | `full` | `full` | `full` | `none` |
| assigned active review | `full` inside exact request scope | `full` inside exact request scope | `full` inside exact request scope | `full` |

`full` means information is reachable, not that every section is expanded. Review opens decision-critical content first; secondary detail may be collapsed with a present-section navigation index. This prevents a full aggregate from becoming an unreadable long drawer.

Reviewer full visibility is an ephemeral, server-derived review-scope capability, not a global role bypass. It requires exact reviewer assignment/eligibility, active request, same company and target membership. Terminal, unassigned, tampered or cross-company context cannot obtain the full aggregate. If any required projection cannot be authorized or hydrated, decision commands fail closed and the drawer shows the recovery owner instead of silently omitting evidence.

### Projection ownership

1. **DrawingProjection** owns the existing Drawing six-section behavior in this internal order: identity/state context supplied by the shared header, automatic 3D/2D preview, attachments/revisions, readiness/next step, drawing-side relation/traceability, and its contribution to the context action model. Candidate, formal, review and history use the same preview resolver and section components.
2. **PartProjection** owns part identity facts, permitted part documents and part-side relation summaries. In Drawing context it is summary-only; in Part/Relation/review context policy may expose more. It never imports Drawing file mutation authority.
3. **RelationProjection** owns root/drawing/part topology, matrix/health/blockers and traceability. It does not duplicate Drawing or Part fields and forms that belong to their projections.
4. **ReviewContextProjection** owns request status, scope, reviewer responsibility, decision history/reason and integrity evidence. `ApprovalSnapshotProjection` is a narrow child that may show target IDs, scope, hash/diff/check result and mismatch status only. It MUST NOT render copied Drawing/Part/Relation facts, files or relationships. Snapshot drift fails closed; snapshot content never substitutes for locked owner data.
5. **ContextActionBar** is the sole primary-action owner. Projections contribute capability/action descriptors; they do not each render competing sticky footers. Candidate edit, controlled read, relation mutation and approval decision commands remain server-authorized by their existing domain owners.

### State and capability matrix

| State family | Same composer/projections | State-specific behavior allowed |
|---|---|---|
| `building`, `drawing_preparation` | same composer; policy-selected projections | editable draft facts/files; show missing requirements; one safe next action |
| `bundle_ready` | same composer; policy-selected projections | readiness complete; action bar exposes submit after risk/scope confirmation |
| `in_review`, `revision_in_review` | same composer; owner data locked | submitter may withdraw if permitted; exact reviewer gets scoped full projections and decision controls |
| `auto_finalizing` | same composer; read-only | action bar states progress/no action/retry destination |
| `correction_required` | same composer | editable only after returned state is effective; show correction reason and resubmit path |
| `recovery_required` | same composer; read-only evidence | explicit recovery owner/action |
| `rd_controlled`, `released` | same composer | controlled files remain immutable; action bar may offer revision/traceability actions |
| `history_only` / terminal | same composer; read-only | safe successor/return action; no mutation from terminal record |

This is **visible composition and interaction convergence**, not data-owner or command-authority convergence. The composer consumes server-derived projection models/capabilities and invokes domain commands without reimplementing policies.

### Shared behavior rules

1. **Identity/status**: one shared hierarchy for stable entity identity, human status, actor responsibility and validated return behavior. Domain labels may differ; header structure may not.
2. **Automatic preview**: one Drawing preview resolver/state vocabulary across every context. File presence alone is not `ready`; queued/running/ready/delayed/failed/unavailable/missing use the same polling/retry behavior.
3. **Projection order**: only present projections appear, always in canonical relative order. Surface context may set default expansion/focus but cannot create another body.
4. **Now What**: normal usable states avoid redundant teaching text; blocked/error/terminal states first identify next action and responsible owner.
5. **Action bar**: exactly one primary action. Secondary/destructive actions retain permission, impact preview, confirmation and disabled reason. Reviewer approve/return/reject is a capability in this bar, not a separate review body.

### UX and acceptance direction

- Status transitions refresh the same selected canonical entity and same drawer; they do not close one module and open another.
- The drawer body has one scroll owner. The action bar may be sticky but must not overlap preview/files/confirmation content or create a second ambiguous vertical scroll region.
- At 1440×900, 1024×768, 768×1024 and 390×844, validate every state family for overflow, crop, focus, Escape/nested-modal behavior and visible runtime errors.
- Real-browser evidence must compare Drawing, Part, Relation, candidate/formal/history, submitter and assigned-reviewer contexts at each supported viewport. Static source checks alone cannot close this brief.
- `data-component="unified-pdm-entity-detail-drawer"` (or the exact RD Contract equivalent) appears once for an open entity; legacy/candidate/formal/approval drawer body markers must not coexist.
- Network evidence proves omitted projections and prohibited fields are absent from responses, not merely hidden in the DOM. Review-scope elevation, expiry and cross-company denial require negative tests.

The implementation contract below closes the former readiness gaps. RD may execute Phase 1A through 1D locally in order without another product-design decision. Production/staging, live data, merge, PR, deploy and release remain separately gated.

## DEV-067 RD Implementation Contract（2026-08-12）

### 0. Readiness result and implementation invariant

`DEV-067` is `RD Implementation Ready`. This amendment is the executable contract for the next local implementation and intentionally replaces historical sections in this file wherever they still describe an optional read facade, an approval-owned detail body, lifecycle-specific visible bodies, or a frontend-only source-context projection.

The non-negotiable invariant is:

> One canonical entity key + one server-composed read snapshot + one `UnifiedPdmEntityDetailDrawer` + one domain projection implementation per domain + one context action bar.

The shared composer is not a new cross-domain data owner. Existing Drawing, Part, Relation and approval services remain authoritative for facts and commands. The new facade only resolves identity, authorizes projection depth, reads the existing authorities in one bounded snapshot and returns normalized view models.

No schema migration or backfill is required. Existing `approval_platform_requests`, `approval_platform_targets`, `approval_requests`, lifecycle reviewer rows and typed workbench row keys are sufficient. Existing indexes `idx_approval_platform_requests_status`, `idx_approval_platform_requests_action`, `idx_approval_platform_targets_request` and `idx_approval_platform_targets_target` are reused. If implementation requires a new table, global reviewer permission, RLS relaxation or data rewrite, RD must stop and return to Dev PM.

### 1. Exact public TypeScript contract

RD must create `src/lib/pdm-entity-detail-contract.ts` as a React/DB-free type module. The public envelope is versioned and discriminated; a `none` projection is represented by an omitted key, never by a hydrated payload that the client hides.

```ts
export type PdmEntityKey =
  | `candidate:${string}`
  | `drawing:${string}`
  | `part:${string}`
  | `root:${string}`;

export type PdmDetailSurface = "drawing" | "part" | "relation";
export type PdmProjectionLevel = "summary" | "full";
export type PdmDetailStateFamily =
  | "building" | "drawing_preparation" | "bundle_ready"
  | "in_review" | "auto_finalizing" | "correction_required"
  | "recovery_required" | "rd_controlled" | "released"
  | "history_only" | "terminal";

export type PdmProjectionEnvelope<Summary, Full> =
  | { level: "summary"; data: Summary }
  | { level: "full"; data: Full };

export type PdmEntityDetailResponse = {
  schemaVersion: "pdm-entity-detail.v1";
  entityKey: PdmEntityKey;
  surface: PdmDetailSurface;
  generatedAt: string;
  revisionToken: string;
  header: SharedIdentityStatusHeaderModel;
  projections: {
    drawing?: PdmProjectionEnvelope<DrawingProjectionSummary, DrawingProjectionFull>;
    part?: PdmProjectionEnvelope<PartProjectionSummary, PartProjectionFull>;
    relation?: PdmProjectionEnvelope<RelationProjectionSummary, RelationProjectionFull>;
    review?: PdmProjectionEnvelope<never, ReviewContextProjectionFull>;
  };
  actionBar: ContextActionBarModel;
  navigation: PdmDetailNavigationModel;
};
```

Required common models:

```ts
export type SharedIdentityStatusHeaderModel = {
  entityKind: "candidate" | "drawing" | "part" | "root";
  entityCode: string;
  displayName: string;
  humanStatus: HumanStatusProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  stateFamily: PdmDetailStateFamily;
  actorResponsibility: string;
  lockedByReview: boolean;
};

export type PdmDetailActionKind =
  | "edit" | "submit_review" | "withdraw_review"
  | "approve" | "return_for_correction" | "reject"
  | "retry_apply" | "retry_cleanup" | "create_revision"
  | "manage_relation" | "view_history" | "refresh" | "return";

export type PdmDetailActionDescriptor = {
  id: string;
  kind: PdmDetailActionKind;
  owner: "drawing" | "part" | "relation" | "approval" | "navigation";
  label: string;
  tone: "primary" | "secondary" | "danger";
  placement: "primary" | "secondary";
  enabled: boolean;
  disabledReason: string | null;
  href: string | null;
  commandRef: string | null;
  requiresConfirmation: boolean;
  idempotencyRequired: boolean;
};

export type ContextActionBarModel = {
  primary: PdmDetailActionDescriptor;
  secondary: PdmDetailActionDescriptor[];
};

export type PdmDetailNavigationModel = {
  ownerHref: string;
  returnTo: string;
  fallbackHref: "/approvals";
  targetAnchors: Array<{
    id: string;
    label: string;
    projection: "drawing" | "part" | "relation" | "review";
  }>;
};
```

Action priority is deterministic: actionable recovery first; assigned review decision second; owner lifecycle next step third; safe return last. Review context uses `approve` as the one primary action when decision-ready; return/reject/needs-information equivalents are secondary. If no mutation is legal, `return` is the primary action. Projection components may render local read links such as preview/download/section anchors, but may not render a second sticky footer or competing lifecycle CTA.

### 2. Exact domain projection fields

The domain models must not expose raw DB rows, `payload_json`, `snapshot_json`, storage keys, provider credentials, unscoped file IDs or arbitrary server errors.

`DrawingProjectionSummary` contains only `drawingId`, `rowKey`, `drawingNumber`, `displayName`, `purposeCode`, `purposeLabel`, `humanStatus`, `viewerStatus`, `availabilityScope`, `linkedPartCount` and a representative preview summary (`kind`, server state and non-download identity only). It contains no revision list, attachment list, source asset ID or file mutation capability.

`DrawingProjectionFull` contains the summary plus:

- canonical Drawing/revision identity and `stateFamily`;
- the same two-slot automatic preview model used by every context;
- current revision and allowed revision history summary;
- attachment/version rows, allowed media hrefs and per-row capabilities;
- readiness blockers and `Now What` owner;
- linked Part identity summaries and drawing-side traceability;
- command capabilities and disabled reasons, not callback functions.

The preview model is exact:

```ts
export type DrawingPreviewState =
  | "queued" | "running" | "ready" | "delayed"
  | "failed" | "unavailable" | "missing";

export type DrawingPreviewSlotModel = {
  kind: "three-d" | "two-d";
  title: string;
  fileName: string | null;
  state: DrawingPreviewState;
  stateTitle: string;
  stateText: string;
  mediaHref: string | null;
  downloadHref: string | null;
  retryCommandRef: string | null;
};
```

`PartProjectionSummary` contains `partId`, `rowKey`, `partNumber`, `rootCode`, `displayName`, `itemKind`, `humanStatus`, `viewerStatus`, `availabilityScope`, `linkedDrawingCount` and representative drawing identity only. `PartProjectionFull` adds allowed Part attributes, Part-owned documents, linked Drawing summaries, shared-model/variant summaries, lifecycle/readiness/traceability and Part command capabilities. Retired Part-cost fields remain absent.

`RelationProjectionSummary` contains `rootId`, `rowKey`, `rootCode`, relation health, counts, blockers and traceability summary. `RelationProjectionFull` adds batched Drawing/Part nodes, link topology/matrix, active changes, target anchors and relation command capabilities. It references Drawing/Part identities and anchors; it does not duplicate their file, revision, attribute or document bodies.

`ReviewContextProjectionFull` contains:

- `requestId`, source, action code/title, active status, requester, eligible reviewer responsibility and decision readiness;
- exact target index, target/section anchors and one atomic decision boundary;
- allowed decisions, reason policy, prior decisions allowed by the existing domain and recovery commands;
- `ApprovalSnapshotProjection` limited to `snapshotId`, target IDs, snapshot hash, current aggregate hash, check status, checked time, diff summary and mismatch reason;
- no copied Drawing/Part/Relation fields, file cards, raw JSON or snapshot body.

### 3. Server visibility policy and API

RD must create:

- `src/lib/pdm-entity-detail-policy.ts` for pure policy resolution;
- `src/lib/pdm-entity-detail.ts` for service orchestration;
- `src/lib/repositories/pdm-entity-detail-async-repository.ts` for one-snapshot reads;
- `src/app/api/pdm/entity-details/[entityKey]/route.ts` for the read facade.

Request:

```text
GET /api/pdm/entity-details/{encodeURIComponent(entityKey)}
    ?surface=drawing|part|relation
    [&reviewRequestId={requestId}]
```

The route requires authenticated user and company context and parses only the four typed entity-key prefixes. Without review context it requires the existing owner-page permission. With `reviewRequestId`, the server first resolves a valid `PdmReviewScopeReceipt`; that receipt is the only bounded alternative to normal owner-page read permission and exposes only its exact company/request/targets. `surface` and `reviewRequestId` are untrusted presentation inputs and never grant visibility by themselves. A failed receipt does not fall back to normal full-review data.

`resolveDetailSurfacePolicy()` takes canonical entity, requested surface, lifecycle state, company, actor capabilities and optional verified review receipt, and returns four levels. The hard matrix is:

| Effective context | Drawing | Part | Relation | Review |
|---|---:|---:|---:|---:|
| Drawing owner | full | summary | summary | omitted |
| Part owner | summary | full | summary | omitted |
| Relation owner | full | full | full | omitted |
| Verified active review | full | full | full | full |

The server serializes only fields allowed by the selected level. A summary serializer must be a separate allowlist mapper; it must not spread a full model and delete fields afterward. Network negative tests must prove that omitted fields are absent.

Response success is `200`, `Cache-Control: private, no-store`. `revisionToken` is a stable hash of canonical IDs, row versions, preview states and verified review status used to ignore stale client responses. The client must cancel/ignore superseded requests by entity key + request sequence.

### 4. One-snapshot read and query budget

`PdmEntityDetailService.detail()` owns exactly one `withPdmWorkbenchReadSnapshot()` boundary. PostgreSQL remains `REPEATABLE READ READ ONLY`; SQLite uses its transaction snapshot. The service must not call the three HTTP APIs or invoke repository methods that open nested snapshots.

RD must extract or add `...InClient(client, ...)` readers in:

- `src/lib/repositories/drawing-workbench-async-repository.ts`;
- `src/lib/repositories/part-workbench-async-repository.ts`;
- `src/lib/repositories/relation-workbench-async-repository.ts`;
- `src/lib/repositories/approval-platform-async-repository.ts`.

The new aggregate repository invokes those readers with the same snapshot client and performs batched `IN (...)` hydration for child Drawing, Part, relation, attachment and preview metadata. Projection React components do not fetch their own detail truth. Media bytes and explicit command calls are the only separate requests.

Hard local query budgets, excluding authentication/company lookup and binary media streaming:

| Context | Maximum queries | Growth rule |
|---|---:|---|
| Drawing owner detail | 16 | constant for 1/20/50 linked Parts/files |
| Part owner detail | 16 | constant for 1/20/50 linked Drawings/documents |
| Relation full detail | 24 | constant for 1/20/50 targets/nodes |
| Verified review full aggregate | 28 | constant for 1/20/50 targets; includes request, eligibility and evidence check |

No per-target, per-file or per-node query is allowed. Representative local fixture p95 is `<=500 ms` for normal owner detail and `<=800 ms` for verified review detail. These are focused local gates, not production SLOs.

All required projections are one logical response. A required full projection failure returns the aggregate failure; the server may not return partial success that looks complete. Preview derivative failure is represented in its slot and does not erase the verified original-file row. A missing or unreadable decision-required original evidence sets review decision readiness to false.

### 5. Review scope, exact owner route and multi-target aggregate

RD must create `src/lib/pdm-review-scope.ts`. It resolves a request-specific capability receipt by reusing the same domain decision authority, never by trusting a client role label:

```ts
export type PdmReviewScopeReceipt = {
  requestId: string;
  companyId: string;
  actionCode: string;
  actorId: string;
  entityKey: PdmEntityKey;
  ownerSurface: PdmDetailSurface;
  targetRefs: Array<{ type: string; id: string }>;
  allowedDecisions: Array<"approved" | "rejected" | "needs_info">;
  snapshotHash: string;
  currentAggregateHash: string;
  decisionReady: boolean;
};
```

Eligibility rules:

- drawing revision lifecycle uses the existing active workflow and `drawing_revision_lifecycle_reviewers` exact actor assignment;
- candidate bundle/publication uses existing `numbering.candidate.review.decide`, company and request-specific scope checks;
- legacy numbering actions use existing role/project/action/delegation decision eligibility;
- requester self-approval and separation-of-duties behavior remain whatever the existing decision command enforces; the read receipt cannot weaken it;
- request must be active for review (`pending`); `apply_failed` may expose recovery context only, not a new decision; terminal/unassigned/cross-company/tampered contexts never receive full-review projection data.

The owner resolver is keyed by `(source, actionCode, target type)`, not action label or the first target:

| Covered request | Canonical owner result |
|---|---|
| `numbering.candidate_bundle_review` | `/numbering/search`, `candidate:{workspaceId}` |
| existing `numbering.candidate_publication_review` | `/numbering/search`, `candidate:{workspaceId}` |
| `numbering.drawing_revision_lifecycle_review` | `/numbering/drawings`, `drawing:{drawingId}` resolved from package |
| `numbering.drawing_revision_impact_review` | `/numbering/drawings`, canonical `drawing:{drawingId}` |
| `numbering.same_drawing_variant_after_release` | `/numbering/search`, shared `root:{rootId}` resolved from Drawing/Part |
| `numbering.main_drawing_restore` | `/parts`, canonical `part:{partId}` |
| `numbering.obsolete_part_number` | `/parts`, canonical `part:{partId}` |
| `numbering.obsolete_ma_drawing` | `/numbering/drawings`, canonical `drawing:{drawingId}` |
| `numbering.obsolete_part_root` | `/numbering/search`, canonical `root:{rootId}` |
| `numbering.release` / `numbering.release_missing_ma_confirm` | route by stored primary entity type; root -> relation, drawing -> Drawing, part -> Part |

BOM, submission, drawing-package supplement, transfer-package and other approval domains remain out of DEV-067. Their inbox behavior stays unchanged.

Multi-target resolution follows this order: explicit workspace/root primary target; shared formal root of all Drawing/Part targets; single canonical Drawing; single canonical Part. Targets that span more than one root or cannot be joined to one canonical aggregate return `PDM_REVIEW_AGGREGATE_AMBIGUOUS` and are not actionable; the server never guesses the first target. Stable anchors use `target:{targetType}:{targetId}` and scroll within the same drawer. One request retains one atomic decision bar even when several targets are shown.

### 6. Active-review write lock and transaction boundary

RD must create `src/lib/pdm-review-lock.ts` with `lockPdmEntityScopeAsync(client, targetRefs)` and `assertPdmEntityWriteAllowedAsync(client, input)`. Both review submission and every covered mutation use the same coarse entity locks before reading/fixing the snapshot or changing reviewed content. PostgreSQL locks canonical rows with `FOR UPDATE`; SQLite uses the existing write transaction. The global lock order is `workspace -> root -> drawing -> part -> revision -> attachment/relation`, then lexical canonical ID inside each kind. Dependent rows are locked only after their canonical owner. Multi-target submit sorts/deduplicates the full target set first. This order is mandatory to prevent write-vs-submit races and cross-command deadlocks.

The write guard executes on the same transaction/client after `lockPdmEntityScopeAsync` and before any state/file-reference write. Review-request creation locks the same scope, recomputes the aggregate/hash in that transaction, then inserts the pending request/targets. A read-before-transaction check, inconsistent lock order or snapshot calculation before the common scope lock is insufficient.

Lock states:

- `pending`: reviewed fields are locked;
- `apply_failed`: approved scope remains locked; only existing retry/recovery commands are legal;
- `needs_info`, `rejected`, `cancelled`: candidate/editable scope is unlocked only after the existing domain command atomically transitions it to correction/draft state;
- `approved` / `applied`: review lock ends, but existing controlled/released immutability continues;
- drawing lifecycle follows its existing workflow state; `correction_required` is editable only through the current revision lifecycle contract.

The command matrix is:

| Command family | During active review | Integration point |
|---|---|---|
| workspace facts, candidate numbers, candidate revision metadata | reject `409 PDM_ENTITY_REVIEW_LOCKED` | number-state/lifecycle repository transaction |
| candidate file upload, verify, remove or replace | reject | candidate revision command transaction |
| Drawing/Part attachment upload, delete, restore or replace | reject | `master-attachments-async.ts` owner transaction |
| Drawing revision file/submission content change | reject | drawing revision/submission service transaction |
| Part variant/shared-model/document mutation | reject | Part/numbering repository transaction |
| Drawing-Part link, relation or root membership mutation | reject | numbering/relation repository transaction |
| preview derivative enqueue/poll/read/download | allow if source hash/owner link is unchanged | existing preview/media authority |
| Drive sync of unchanged bytes/hash | allow; reject if it changes reviewed content identity | master attachment service |
| withdraw, return/reject, approve, retry apply/cleanup | allow only through existing domain command | approval/lifecycle authority |
| audit, event, notification and read-only trace | allow | existing authority |

The UI disabled state mirrors the guard, but server rejection is the acceptance boundary. Direct HTTP tests must cover at least one route from every rejected family and concurrent `lock-vs-write` / `write-vs-submit` interleavings. No write may commit after the review snapshot hash has been fixed without causing the submit/decision transaction to fail.

### 7. Preview orchestration parity

`DrawingProjection` is the only visible owner of `DrawingDetailPreview`. Candidate, formal, relation and review adapters all produce `DrawingPreviewSlotModel`; none may translate file existence directly to `ready`.

Canonical behavior:

- server resolves `queued/running/ready/delayed/failed/unavailable/missing` from source hash, non-fake derivative and job heartbeat;
- while a slot is queued/running/delayed and the document is visible, the drawer controller revalidates the same unified detail endpoint every 2.5 seconds, with one in-flight request and cleanup on key change/unmount;
- media is fetched only when the slot is `ready`; an unexpected `409 PREVIEW_NOT_READY` keeps the existing two-second bounded media retry as race recovery;
- retry uses the existing owner preview command and then refreshes the same entity key;
- exact review media href carries `reviewRequestId`, and the existing owner file/preview route calls the same `PdmReviewScopeReceipt` validator before allowing scoped read; no approval-evidence preview body is used;
- `src/app/api/approvals/requests/[requestId]/evidence/[fileId]/route.ts` remains compatibility-only and is not called by enabled DEV-067 UI.

### 8. Navigation and return-state contract

`/approvals` inbox items receive a server-built `ownerHref`. The browser must not build it from title/action text. The href shape is:

```text
{ownerPath}?view={currentOwnerView}
  &detail={encodedEntityKey}
  &reviewRequestId={encodedRequestId}
  &returnTo={encodedSafeApprovalsPathAndQuery}
```

`returnTo` must start with one `/`, must not start with `//`, must contain no control characters and must resolve to `/approvals` for review entry. Put the validator in a shared exported helper; do not duplicate the current private helper. Invalid/missing values fall back to `/approvals`.

Close button and explicit return call `router.push(returnTo)`. Browser Back uses history naturally. After approve/return/reject/retry completion, the command result returns the safe destination; the owner route navigates there, and the inbox reloads while preserving status/domain/action/query and `requestId` selection if still present. A 401 routes to login with the current owner URL as login return; 403/404/stale review preserves a visible safe return without leaking cross-company identity.

### 9. Failure and recovery contract

| HTTP/code | Visible first answer | Required next action |
|---|---|---|
| 400 `PDM_ENTITY_KEY_INVALID` | 無法辨識這筆明細 | 回原清單重新選取 |
| 401 | 登入狀態已失效 | 重新登入後回目前 owner URL |
| 403 `PDM_REVIEW_NOT_ASSIGNED` | 你不是此案目前可處理的審核者 | 回審核工作台 |
| 404 `PDM_ENTITY_DETAIL_NOT_FOUND` | 找不到資料或目前無權查看 | 回來源清單；跨公司同樣回404 |
| 409 `PDM_REVIEW_NOT_ACTIVE` | 此案已不在待審狀態 | 回審核清單查看最新狀態 |
| 409 `PDM_REVIEW_AGGREGATE_AMBIGUOUS` | 此案範圍無法對應單一圖料明細 | 由 PDM Admin 修正送審範圍；禁止決策 |
| 409 `PDM_REVIEW_SNAPSHOT_DRIFT` | 送審完整性檢查不一致 | 禁止決策；撤回/退回後重新送審或交 Admin |
| 409 `PDM_ENTITY_REVIEW_LOCKED` | 此資料正在審核，現在不能修改 | 撤回/退回後再修改 |
| 409 `PDM_ENTITY_DETAIL_STALE` | 資料已更新 | 保留 entity key 並重新整理同一抽屜 |
| 503 `PDM_ENTITY_DETAIL_PROJECTION_FAILED` | 明細目前未完整載入 | 原地重試；禁止以部分 projection 決策 |

Raw SQL, stack trace, raw JSON, English transport error and `Failed to execute...` must never be the primary visible state. Every blocked/error/terminal state identifies the responsible owner and one next action.

### 10. Exact component ownership and compatibility retirement

RD must create:

- `src/components/unified-pdm-entity-detail-drawer.tsx`;
- `src/components/drawing-projection.tsx`;
- `src/components/part-projection.tsx`;
- `src/components/relation-projection.tsx`;
- `src/components/review-context-projection.tsx`.

`unified-pdm-entity-detail-drawer.tsx` owns the registry, header, fixed slot order, one body scroll owner, focus trap/restore, Escape, resize, safe return and action bar. It must contain no `actionCode === ...` or domain lifecycle render tree. Domain projection components receive only normalized models plus a closed command dispatcher supplied by their owner controller.

Existing components are migrated as follows:

- `pdm-entity-detail-drawer.tsx` remains the low-level non-modal overlay primitive;
- `drawing-workspace-drawer.tsx` becomes a compatibility wrapper/re-export that cannot accept arbitrary body section composition in the enabled path;
- `drawing-detail-content.tsx`, `DrawingDetailPreview` and relevant `MasterAttachmentPanel` presentation pieces move behind `DrawingProjection` without duplicating preview state resolution;
- `WorkspaceDrawer`, candidate editors and `PartDetailPanel` become section/command contributors, not top-level covered drawer owners;
- `RootDetailDrawer`, page-local Drawing/Part fallback drawers and `ApprovalDetailDrawer` are not mounted when DEV-067 is enabled;
- `/approvals` deletes the enabled-path `ApprovalImpactSummary`, `ApprovalResultBody`, `ApprovalDrawingPreview`, raw snapshot JSON and decision footer composition; it keeps inbox/filter/count plus owner navigation.

Open drawer DOM must contain exactly one `data-component="unified-pdm-entity-detail-drawer"`. No `approval-detail-drawer`, lifecycle-specific drawer body or second sticky action footer may coexist.

### 11. Exact implementation files

Required new product files are the contract/policy/service/repository/route and five components listed above, plus `src/lib/pdm-review-scope.ts`, `src/lib/pdm-review-lock.ts` and DEV-067 QC scripts.

Required existing product files to modify:

- feature/config: `src/lib/number-state-flow-feature.ts`, `src/app/api/numbering/state-flow/status/route.ts`, `.env.example`, `package.json`;
- read authority: Drawing/Part/Relation workbench services and their async repositories, `src/lib/repositories/approval-platform-async-repository.ts`, `src/lib/approval-platform.ts`;
- shared UI/controllers: `pdm-entity-detail-drawer.tsx`, `drawing-workspace-drawer.tsx`, `drawing-detail-content.tsx`, `drawing-workbench.tsx`, `part-workbench.tsx`, `relation-workbench.tsx`, `number-state-workspace.tsx`, `part-detail-content.tsx`, `master-attachment-panel.tsx`, `drawing-detail-preview.tsx`;
- owner pages: `src/app/numbering/drawings/page.tsx`, `src/app/parts/page.tsx` through `PartModule`, `src/app/numbering/search/page.tsx`;
- approval: `src/app/approvals/page.tsx`, inbox/request/decision routes and `src/lib/approval-workbench-legacy-redirect.ts` / drawing lifecycle owner href producers;
- scoped media: candidate revision file GET, Drawing/Part attachment GET and preview routes;
- lock integration: workspace/candidate revision commands, master attachment upload/delete/restore, Drawing revision file/submission, Part shared-model/variant/document and Drawing-Part/relation mutation service paths;
- style: `src/app/globals.css` for projection/index/action-bar/responsive states only.

RD must preserve unrelated dirty worktree changes and record the actual modified file list after every phase. Product implementation must use `apply_patch`; no live migration, stage, commit, merge, PR or release is part of this contract.

### 12. Feature flag and rollback

Add `PDM_UNIFIED_ENTITY_DETAIL_V1`. It defaults off and is effective only when both `PDM_UNIFIED_DRAWING_WORKBENCH_V1` and `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1` are effective. `/api/numbering/state-flow/status` exposes requested/effective/dependencies and phase `DEV-067`.

Local RD/QA sets the flag on. Production remains off until a separate release gate. Turning it off restores existing owner/inbox paths without schema or data rollback. In the enabled path there is no dual render or fallback to a second visible body after a projection error; the unified drawer shows the controlled recovery state. Legacy code removal after production stabilization is a later cleanup, not a condition for safe local rollback.

### 13. Ordered implementation phases and exit gates

| Phase | Product work | Exit gate before next phase |
|---|---|---|
| 1A Contract/policy/read facade | types, policy, one-snapshot readers, unified API, feature status | TypeScript; policy/payload/query tests; 1/20/50 constant counts; no hidden fields or partial response |
| 1B Composer/domain projections | unified drawer, Drawing/Part/Relation projections, preview parity, owner workbenches | one DOM drawer; same projection component IDs; state transition retains key/selection; focused UI + preview QC |
| 1C Review routing/scope/lock | ownerHref registry, `/approvals` inbox-only path, review receipt, review projection, actions, transaction lock, safe return | assigned/denied/terminal/cross-company/drift tests; direct write bypass tests; decision idempotency; return-state browser evidence |
| 1D Compatibility/regression | enabled-path legacy body retirement, all states/viewports, aggregate regressions, isolated build | complete QA plan PASS; no open P0/P1; isolated build; handoff to independent QC |

RD may start 1A immediately and continue locally only after each exit gate passes. A phase failure remains `RD in progress`; it is not skipped by hiding the feature or marking a test blocked without evidence.

## Human Decision Brief

Confirmed decisions from APP feedback and follow-up discussion:

- The same drawing number, part number or root number must not show different object truth depending on the entry page.
- Keep separate entry pages because their primary tasks differ:
  - `/numbering/search` is the root/drawing/part relationship inspection surface.
  - `/numbering/drawings` is the drawing master workbench.
  - `/parts` is the part master workbench.
- Unify the right-side detail drawer contract:
  - click drawing number -> drawing detail;
  - click part number -> part detail;
  - click root number -> root detail.
- Apply the same rule to part numbers, not only drawing numbers.
- Entry context may change the default expanded section, scroll focus and server-authorized projection depth, but must not create a second object truth or a second domain component.
- Detail drawers remain overlay-style but non-modal: no dark backdrop, no focus trap or body lock, and the underlying list remains directly clickable for rapid inspection.
- The shared header owns one inline close `X`; entity pages must not add floating, previous/next or duplicate close controls.
- Modal confirmation dialogs remain separate and modal; opening one must prevent its `Escape` event from also closing the underlying detail drawer.

Rejected options:

- Maintain two separate drawing detail modules that show different sections for the same drawing number.
- Maintain two separate part detail modules that show different sections for the same part number.
- Merge `/numbering/search`, `/numbering/drawings` and `/parts` into one huge page. This would reduce task clarity and make scanning worse.
- Keep the relation-tree drawer as root-detail-only when a user clicks a drawing or part.
- Build one giant conditional component that mixes root, drawing and part logic in one render path.

AI assumptions:

- First implementation should use existing local data contracts where possible; no DB schema change is required for Phase 1.
- Existing owner pages and APIs remain authoritative:
  - root detail: `GET /api/numbering/roots/[rootCode]` and relation aggregation data;
  - drawing list/detail: `/numbering/drawings`, drawing attachment/readiness routes and existing same-root part data;
  - part list/detail: `GET /api/parts/[partNumber]`, permitted part-document and shared-model routes.
- `src/components/numbering-contextual-entrypoints.tsx` remains the shared action surface for root/drawing/part add and obsolete actions.
- Attachment/document permissions, lifecycle policy and company scope must follow existing server-side guards.
- `DEV-067` requires a server-derived projection policy/envelope before implementation; frontend adapters may normalize presentation only and may not fetch full data then hide it.

Re-entry triggers:

- User wants page-specific object truth or domain projection implementations to diverge beyond the confirmed `none/summary/full` policy.
- User wants to merge the three entry pages into one module.
- Implementation requires schema migration, RLS/policy changes, live Supabase migration, provider pointer change, direct data repair/deletion, production deployment, merge, PR, rollback or release artifacts.
- Existing APIs cannot expose enough drawing or part detail without introducing new product semantics.
- Server policy cannot omit restricted attachments/fields from summary/none responses, or review full visibility cannot be bounded to exact active request/company scope.

## Problem

The current UI can open the same drawing number from two places:

- `/numbering/drawings`: the drawer behaves like a drawing-governance detail surface with attachments, submission readiness, same-root parts and operational actions.
- `/numbering/search`: the drawer behaves like a relation/lifecycle summary for the selected target.

This creates a trust problem. A user sees the same object ID but receives different information depending on where they clicked. The mental model should be:

```text
Object code -> object detail
Entry page -> task context
```

The entry page may explain why the user arrived there, but it must not redefine what the object is.

## UX Intent

使用思考習慣: `#目的`, `#批判`, `#效用理論`, `#設計思考`, `#心理成因`, `#內容組織`, `#可驗證性`

- Primary users: RD, RD Manager, QA/QC, manufacturing preparation, purchasing preparation and PDM administrators.
- User mental model: a code represents one object. Clicking that code should open that object's canonical detail.
- Main task: inspect the current object, understand status/readiness/relationships, then continue with the correct next action.
- Success state: from any supported entry page, clicking `A0001-M01`, `A0001-P01` or `A0001` opens the same composer and domain projections; the server returns the confirmed task-appropriate depth without changing object truth.
- Natural next step:
  - drawing: inspect attachments/readiness/linked parts, then submit, revise, trace or impact-analyze;
  - part: inspect attributes/permitted documents/status/linked drawings, then update part data, shared model or lifecycle action;
  - root: inspect family relationship health, counts and add/obsolete actions.
- Most likely misunderstanding: users think two modules disagree about the same drawing or part record.
- Must not happen: a part click shows root-only details; a Drawing full projection hides its attachments/readiness; a source page silently returns stale data; or a summary/none surface receives restricted full payloads and only hides them client-side.

## End-State Architecture

Separate entry pages stay. Object detail becomes a shared contract.

```text
Entry page
  /numbering/search        relation-first task context
  /numbering/drawings      drawing-list task context
  /parts                   part-list task context

UnifiedPdmEntityDetailDrawer
  SharedIdentityStatusHeader
  ProjectionComposer
    DrawingProjection
    PartProjection
    RelationProjection
    ReviewContextProjection
  ContextActionBar

Domain adapters
  own projection models, preview/read authority and commands

Server DetailSurfacePolicy
  controls none/summary/full, allowed fields and review scope
```

### Object Identity Rule

| Click target | Required drawer entity type | Forbidden result |
|---|---|---|
| Root code, for example `A0001` | `part_root` | drawing-only or part-only detail |
| Drawing number, for example `A0001-M01` | `drawing_number` | root-only detail |
| Part number, for example `A0001-P01` | `part_number` | root-only or drawing-only detail |

### Source Context Rule (`DEV-067` amendment)

`sourceContext` never changes identity, domain truth or permission. Under the historical Phase 1 contract it affected only emphasis; `DEV-067` intentionally extends it with server-authorized projection depth:

| Source context | Allowed default focus/depth | Invariant |
|---|---|---|
| `relation_tree` | relation first; Drawing/Part/Relation full | canonical identity, owner data, domain permission/commands |
| `drawing_module` | Drawing full; Part/Relation summary | canonical Drawing truth; Part details are not returned |
| `part_module` | Part full; Drawing/Relation summary; no Drawing files/revisions | canonical Part truth; Drawing file authority is not imported |
| `active_review` | exact request aggregate full plus ReviewContext | locked owner data; exact reviewer/request/company scope |
| `request_fallback` | create/append context highlighted | existing object core truth |

Projection reduction is explicit task policy, not another version of the object. The server omits unauthorized/not-needed fields; client-only hiding is forbidden.

## Drawer Information Architecture

### Shared Shell

`EntityDetailDrawerShell` owns only common drawer behavior:

- right-side drawer layout, close button, width clamp and persisted width;
- resize handle;
- outside click and `Escape` close behavior;
- direct row-to-row switching without close/reopen flicker, with detail scroll reset to the top for the newly selected entity;
- loading, not found, restricted and error states;
- source context hint;
- keyboard-safe focus behavior;
- `data-entity-type`, `data-entity-code`, `data-source-context` attributes for QC.

The shell must not contain object-specific business rules except dispatching to the correct panel.

### Root Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | root code, core name, status, phase |
| Summary | drawing count, part count, manufacturing/reference counts, blockers |
| Relationship health | complete, missing manufacturing drawing, missing part, ambiguous, blocked, draft |
| Primary actions | `新增圖號`, `新增料號`, draft delete or root obsolete action when allowed |
| Relationship view | child drawings, parts, link health and orphan states |

Required sections:

- `關係摘要`: drawings, parts, links, blockers.
- `新增相關資料`: reuse `NumberingContextualEntrypoints` root mode.
- `生命週期`: draft delete, formal obsolete request, pending request state.
- `送審 / 製造可用性`: concise readiness blockers that answer "現在要做什麼".
- `Audit / history`: collapsed or lower priority.

### Drawing Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | drawing number, root code, purpose `M/R`, core name/title if available |
| State | record status, development phase, lifecycle/readiness state |
| Primary actions | `進版`, `送審` or `檢查送審條件`, `追溯`, `影響分析`, contextual add/obsolete actions |
| Relationship summary | linked parts, same-root parts, manufacturing/reference semantics |
| Attachments | drawing-owned attachment library and deleted/recoverable data state |

Required sections:

- `Object lifecycle`: status, phase, why it can/cannot proceed.
- `圖號附件庫`: current attachments, deleted data section and refresh state.
- `送審檢查`: prerequisite blockers, missing attachment/data states and next CTA.
- `同根料號`: linked parts and same-root part cards.
- `關係 / 影響`: traceability and impact analysis entry.
- `新增相關資料`: drawing-context `NumberingContextualEntrypoints`.

The drawing detail panel must be the same whether opened from `/numbering/drawings` or `/numbering/search`. The relation page may default-scroll to `同根料號` or `關係 / 影響`, but it cannot omit attachments or readiness sections.

Candidate reservations that contain a drawing are members of the same `drawing_number` detail family, even though their canonical entity metadata remains `candidate_bundle`. Candidate and formal drawing drawers MUST therefore publish `data-detail-family="drawing_number"` and `data-drawing-detail-skeleton="true"`, and render this ordered section contract:

1. `drawing-overview`: purpose, linked-part summary and same-root/content summary;
2. `drawing-revision-files`: candidate first-revision editor or formal controlled revision files;
3. `drawing-preview`: real preview content, or a concise human empty state with the next step;
4. `drawing-pending`: review, missing-data, recovery or no-action guidance;
5. `drawing-more`: reference attachments, relationship/data maintenance, edit/cancel and other secondary actions.

Historical Phase 1C baseline (superseded by the 2026-08-12 `DEV-067` amendment wherever it is less strict): both lifecycle variants rendered `DrawingWorkspaceDrawer` and published `data-component="drawing-workspace-drawer"`. Candidate and formal adapters could provide different section content. The new authority is `UnifiedPdmEntityDetailDrawer` plus domain-owned projections; Drawing's six-section behavior is owned inside `DrawingProjection`, not an independently composed lifecycle body.

Candidate drawing preparation is an incomplete-data state inside the workspace, not a navigation destination. Opening a candidate MUST expose the existing first-revision editor, missing requirements and file work area inline. The visible UI MUST NOT render a `準備首版圖面` link/button that jumps to another layer, duplicate that action in header and body, or add a separate `下一步` card. When readiness becomes complete, the existing server-derived submit action becomes available in the same drawer; review, return and controlled states continue in the same component without a route change or drawer replacement.

This is component/view-model convergence, not lifecycle-authority convergence. Candidate mutation stays in `NumberingCandidateRevisionEditor` and candidate review/cancel actions; formal controlled files remain read-only in `MasterAttachmentPanel` and changes continue through the formal revision workflow. Candidate preview data is not invented. No API, schema, permission or lifecycle-authority change is introduced by this contract.

Historical Phase 1C content contract used `DrawingDetailContentModel`, `DrawingDetailSummary` and `DrawingDetailSection`, with the A0005 formal order. `DEV-067` intentionally places the human-confirmed Drawing six-section behavior inside `DrawingProjection` under the fixed cross-domain composer and further limits adapters to data/capability/command projection. These existing components may be reused internally only if they implement the new projection contract and cannot compose a second body.

Preview content is also a shared contract, not merely a shared shell. Candidate, formal and approval adapters MUST render `DrawingDetailPreview`. It always presents the same two cards—`3D 模型` and `2D 圖面`—in the same order and uses the adapter only for media, file identity, preview state and permitted actions. When a preview is unavailable, pending or missing, the same card remains visible with human-readable state and recovery guidance; a mode-specific preview grid or one-sided empty state is not permitted. Formal media may render directly, while candidate and approval may expose evidence preview/download actions, but the visual component and state vocabulary remain one source of truth.

Historical Phase 1C approval placement rendered the shared shell from `/approvals`. `DEV-067` intentionally replaces that placement: `/approvals` remains the inbox, selecting a covered request navigates to its canonical owner route and mounts `UnifiedPdmEntityDetailDrawer`. The assigned reviewer receives server-scoped full Drawing/Part/Relation projections plus decision capability and a safe return path. Approval snapshots remain integrity evidence inside `ReviewContextProjection`, not a separate visible body.

### Historical Part Detail Panel (`DEV-067` moves current behavior to `PartProjection`)

The following is retained as implemented Phase 1 history. Part-cost rows are retired by the 2026-08-11 amendment; current Part requirements are governed by the top-level `PartProjection` contract.

Required first screen:

| Area | Required content |
|---|---|
| Identity | part number, root code, part name/core name, item kind |
| State | record status, development phase, lifecycle/readiness state |
| Primary actions | part data update, cost action if permitted, shared model/MA baseline actions if applicable, contextual add/obsolete actions |
| Relationship summary | linked drawings, primary manufacturing drawing, reference-only links |
| Attributes | material, color, surface treatment, variant note |

Required sections:

- `Object lifecycle`: status, phase and action-first next step.
- `料號屬性`: material, color, surface treatment, variant note and missing-data state.
- `圖號關聯`: linked drawings, manufacturing/reference semantics, missing manufacturing blocker.
- `成本狀態`: standard cost status, pending cost request count and permitted amount visibility.
- `附件 / 模型`: part attachments, shared 3D model and MA baseline sections where current system supports them.
- `新增相關資料`: part-context `NumberingContextualEntrypoints`.

The part detail panel must be the same whether opened from `/parts` or `/numbering/search`. The relation page may default-scroll to `圖號關聯`; `/parts` may default-scroll to `料號屬性` or `成本狀態`.

## Data Contract

### Phase 1A-1B Implementation Note

The 2026-07-09 local implementation intentionally lands the user-visible parity first:

- `/numbering/search` keeps its relation-first drawer, but now dispatches by target entity and renders root/drawing/part core sections before the full relation context.
- Drawing targets reuse the existing drawing attachment component and expose drawing readiness / same-root part sections.
- Part targets load the existing part owner detail API for attributes, linked drawings and cost status.
- `/numbering/drawings` and `/parts` keep their owner workbench UI, but publish the same `data-detail-*`, `data-entity-*` and `data-source-context` metadata as the relation drawer.
- Phase 1B extracts `PdmEntityDetailDrawer` over the existing low-level `PdmDetailDrawer`. Drawing, part, relation-search and candidate/reservation details reuse the same non-modal shell, header, close control, width persistence, outside-click rule and entity metadata.
- Object-specific part/root bodies remain domain components. Candidate and formal drawing adapters both render `DrawingWorkspaceDrawer`; lifecycle-specific data and commands stay in adapters/child domain components so the shared workspace does not duplicate mutation authority.
- Human-status filters and drawer-width behavior now have shared sources instead of page-local copies.

### Historical Phase 1 Data Strategy (superseded for `DEV-067` composition/policy)

The following model records the implemented Phase 1 baseline. `DEV-067` replaces it with projection models and a server-derived `DetailSurfacePolicy`; frontend-only full-data normalization is not an allowed final contract.

```ts
type EntityDetailTarget = {
  entityType: "part_root" | "drawing_number" | "part_number";
  entityCode: string;
  rootCode?: string;
  sourceContext: "relation_tree" | "drawing_module" | "part_module" | "request_fallback";
  defaultSection?: "relationships" | "attachments" | "readiness" | "attributes" | "cost" | "actions";
  relationContext?: {
    drawingNumber?: string;
    partNumber?: string;
    relationType?: "primary_manufacturing" | "reference" | "none";
  };
};

type EntityDetailViewModel = {
  target: EntityDetailTarget;
  identity: {
    entityType: EntityDetailTarget["entityType"];
    entityCode: string;
    rootCode: string;
    displayName: string;
  };
  status: {
    recordStatus: string;
    developmentPhase: string;
    lifecycleMessage: string;
    nextStep: string;
  };
  sections: {
    relationships: boolean;
    attachments: boolean;
    readiness: boolean;
    attributes: boolean;
    cost: boolean;
    actions: boolean;
    audit: boolean;
  };
};
```

Existing sources:

| Entity | Existing source | Notes |
|---|---|---|
| Root | `GET /api/numbering/roots/[rootCode]`, relation view data | Must include drawings, parts, matrix/health where available |
| Drawing | `/numbering/drawings` list payload, drawing attachment/readiness APIs, relation data | Must include same-root parts and readiness sections from drawing module |
| Part | `GET /api/parts/[partNumber]`, part attachment/cost/shared-model APIs, relation data | Must preserve cost redaction rules |

### Historical Phase 2 Optional Data Facade（superseded by DEV-067）

This was the pre-DEV-067 option. It is retained only as history and must not be implemented as written. DEV-067 has made the unified, policy-enforced read facade mandatory and defines its exact route/types in the RD Implementation Contract above.

```text
GET /api/numbering/entities/[entityType]/[entityCode]/detail?sourceContext=
```

The facade must:

- be read-only;
- enforce existing page permission and company scope;
- reuse owner-domain services and redaction helpers;
- return no write side effects;
- avoid new identity semantics.

The optional decision is closed: `GET /api/pdm/entity-details/[entityKey]` is required in DEV-067 Phase 1A.

## Historical Phase 1A-1B Implementation Contract（implemented baseline; not DEV-067 handoff）

### Frontend

1. Create a shared shell component. Recommended path:
   - `src/components/pdm-entity-detail-drawer.tsx`
   - or a small folder under `src/components/entity-detail-drawer/`.
2. Extract object panels without changing product behavior first:
   - `RootNumberDetailPanel`
   - `DrawingNumberDetailPanel`
   - `PartNumberDetailPanel`
3. Move common drawer behavior out of page-local implementations:
   - width clamp and storage;
   - resize;
   - close/backdrop;
   - shell states;
   - QC `data-*` attributes.
4. Update `/numbering/search`:
   - relation-tree root click passes `entityType: "part_root"`;
   - drawing click passes `entityType: "drawing_number"`;
   - part click passes `entityType: "part_number"`;
   - matrix row/column identity clicks follow the same rule.
5. Update `/numbering/drawings`:
   - use the shared shell and `DrawingNumberDetailPanel`;
   - keep drawing-module source context.
6. Update `/parts`:
   - use the shared shell and `PartNumberDetailPanel`;
   - keep part-module source context.
7. Preserve `NumberingContextualEntrypoints` behavior and labels from `DEV-PDM-NUMBERING-004`.
8. Do not place cards inside cards. Drawer sections can use compact panels, rows and lists.
9. Use source context for default expanded section only.

### Backend / API

Phase 1:

- No schema migration.
- No write route required.
- Existing APIs remain owner-domain authority.
- Any new helper must be a read adapter or TypeScript view-model mapper.

Historical Phase 2 optional facade（superseded by the required DEV-067 facade）:

- Must be read-only.
- Must not bypass attachment or lifecycle permissions; historical cost references are retired.
- Must return 404/403 states in action-first Traditional Chinese when rendered.

### Permission Contract

| Data | Permission behavior |
|---|---|
| Root/drawing/part core identity | Existing page-level read permission |
| Drawing/part attachments | Existing master attachment permission path |
| Part cost amounts | Retired; no Part-cost projection or field is returned |
| Contextual add/obsolete actions | Existing `numbering.create`, `numbering.link_variant`, lifecycle/approval action guards |
| DEV-067 unified facade | Same or stricter than source APIs plus exact server summary/full allowlists |

## Failure And State Handling

| State | First visible answer |
|---|---|
| root not found | `找不到這個圖料根號，請重新查詢或確認權限。` |
| drawing not found | `找不到這個圖號，請重新查詢或確認是否已切換公司/資料範圍。` |
| part not found | `找不到這個料號，請重新查詢或確認是否已切換公司/資料範圍。` |
| restricted | `目前角色不能查看這項資料，請改用有權限的帳號或聯絡 Admin。` |
| partial relation context missing | `已開啟物件詳情，但來源關係不存在或已變更，請重新整理關係樹。` |
| API error | `明細讀取失敗，請重新整理；若仍失敗請請 Admin 檢查資料。` |

No drawer may show raw SQL, stack trace, `Internal Server Error`, route text, untranslated backend error or JSON payload as the primary visible state.

## Phase Roadmap

| Phase | Status | Purpose | Authorization |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture UX decision, architecture, RD contract, QA and PM control entry | Authorized by user request to write development documents |
| Phase 1A - Target-aware parity implementation | Implemented locally / Release Not Authorized | Unify visible root/drawing/part detail behavior across `/numbering/search`, `/numbering/drawings` and `/parts` using existing APIs and drawer metadata | Authorized by user `完成DEV-039開發 /goal`; release not authorized |
| Phase 1B - Shared shell extraction | Implemented locally / Release Not Authorized | Reuse one non-modal shell and shared interaction/metadata contracts while preserving domain-specific panels | Authorized by user instruction on 2026-08-07; release not authorized |
| DEV-067 - Unified entity composer/projections | Local RD Implemented / Local QA-QC Passed | One composer, domain-owned projections, server `none/summary/full`, scoped review full view, one action bar and lock/return parity | Local Phase 1A～1D complete; production/schema/release gated |
| Historical Phase 2 - optional detail facade | Superseded by DEV-067 | Previous optional normalized read API | Replaced by required DEV-067 unified facade |
| Phase 3 - Release / production | Release Authorization Required | Merge/deploy/production smoke/rollback | Requires explicit release authorization and deployment-release-gate |

## RD Handoff Contract

### Historical Phase 1 - Shared Drawer Shell And Canonical Panels

This handoff records completed Phase 1A/1B behavior. Wherever it conflicts with the `DEV-067` amendment, the amendment and ADR are authoritative; it is not the implementation contract for the next delivery.

Scope:

- Build shared drawer shell.
- Extract drawing detail panel so `/numbering/drawings` and `/numbering/search` use the same drawing detail information architecture.
- Extract part detail panel so `/parts` and `/numbering/search` use the same part detail information architecture.
- Keep root detail panel as canonical root relationship detail for root clicks.
- Implement `EntityDetailTarget` and source-context default focus.
- Preserve existing drawer width/resize/keyboard behavior.
- Add focused QC for same-object consistency.

Out of scope:

- Merging the three entry pages.
- Changing identity format.
- DB schema migration.
- Permission/RLS changes.
- Production deploy, Supabase live cutover, provider pointer changes.
- Direct data repair/deletion.
- New cost workflow or attachment workflow.

Implementation contract:

- Shared shell must dispatch by `entityType`.
- Page-local code may adapt existing payloads into shared view models.
- Historical rule: source context did not hide core sections. `DEV-067` intentionally replaces this with server-authorized `none/summary/full` projection depth while preserving one domain truth.
- Drawing panel must include attachment/readiness/same-root part sections even when launched from relation tree.
- Candidate and formal render paths must directly use `DrawingWorkspaceDrawer`, publish `data-component="drawing-workspace-drawer"`, and share the header hierarchy and ordered five-section skeleton while retaining separate lifecycle actions and mutation authority.
- Candidate preparation must render inline; `準備首版圖面` cannot be a visible navigation CTA, duplicated action or second drawer/page.
- Part full projection must include current permitted attributes/documents/relationships when launched from Relation; retired cost sections are not restored.
- Root panel must include relation health, child counts and contextual add/lifecycle action sections.

Acceptance:

- Clicking `A0001-M01` from `/numbering/drawings` and `/numbering/search` opens the same DrawingProjection; the Relation context may expose the full aggregate while Drawing context keeps Part details at summary.
- Clicking `A0001-P01` from `/parts` and `/numbering/search` opens the same PartProjection; the Relation context may expose the full aggregate while Part context receives Drawing summary without files/revisions.
- Clicking `A0001` opens `part_root` detail, not drawing or part detail.
- Relation matrix row/column clicks preserve entity type.
- Source context changes default focus and server-authorized projection depth, never identity, domain truth or command authority.
- Candidate title uses the primary reserved drawing code or `尚未產生圖號`; it never substitutes a root code.
- Candidate and formal drawers expose `drawing-overview → drawing-revision-files → drawing-preview → drawing-pending → drawing-more` in DOM order; preview empty states state a human next step.
- Both candidate and formal paths expose exactly one `data-component="drawing-workspace-drawer"`; candidate first-revision editing is present without an intermediate click.
- The same drawer remains open while readiness/action state changes; each state exposes at most one primary CTA.
- No page-level horizontal overflow or drawer text overlap at desktop/laptop/mobile widths.

Evidence required:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-system-detail-drawer-ui
npm.cmd run qc:part-number-module
npm.cmd run qc:pdm-entity-detail-drawer
```

Browser evidence:

- `/numbering/search` desktop `1440x900`, laptop `1024x768`, and current supported mobile/default narrow viewport.
- `/numbering/drawings` drawing drawer.
- `/parts` part drawer.
- Same drawing opened from two sources.
- Same part opened from two sources.

### Historical Phase 2 - Optional Read-Only Detail Facade（superseded）

This section is historical. DEV-067 Phase 1A now requires the normalized server-policy facade and its tests; do not wait for a new duplication-risk decision.

Historical scope:

- Add normalized read-only facade only if Phase 1 duplicates fetching or state mapping enough to create maintenance risk.
- Keep existing source APIs authoritative.
- Add facade QC for read-only/no-write-side-effect and redaction parity.

Out of scope:

- Write APIs.
- New data ownership.
- Schema/RLS changes unless separately authorized.

Acceptance:

- Facade response matches source APIs for identity/status/relationship/visibility.
- Unauthorized users do not see more through facade than through owner pages.
- Read call does not mutate audit, sequence, relation, attachment or cost records.

Evidence required:

- API facade no-write-side-effect QC.
- Cost redaction parity QC.
- Attachment permission parity QC.

## QA/QC Gate Summary

Primary QA plan:

- `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`

Minimum gates:

- 5-second object identity test: reviewer can identify whether drawer is root/drawing/part/candidate, its name, current status and next step.
- Drawing-family consistency test: candidate and formal variants share header/section grammar while candidate-only lifecycle work remains in `drawing-pending` / `drawing-more`.
- Same-projection consistency test: the same Drawing/Part projection implementation and owner data are reused across routes; only policy depth/focus/capabilities differ.
- Source-context test: server response contains only allowed `none/summary/full` data; DOM hiding cannot satisfy the gate.
- Visible error sweep.
- Keyboard and close/resize behavior regression.
- Responsive/no-overlap evidence.
- Permission/payload parity for attachments/documents and scoped reviewer full view.

## Stop Conditions

Stop and return to PM/user if:

- RD cannot reuse one Drawing/Part/Relation projection per domain without removing required full-projection content.
- Implementation needs schema migration, RLS changes, production/Supabase live changes or direct data repair.
- API sends full or restricted attachment/file data to a summary/none context and relies on client hiding.
- Assigned review full view cannot be bounded to exact active request, targets, eligibility and company, or remains accessible after terminal state.
- Source context changes data truth/command authority instead of only policy depth, focus and capability projection.
- Drawer implementation causes nested-card layout, text overlap, critical overflow or unclear scroll ownership.
- RD wants to merge entry pages or remove `/numbering/search`, `/numbering/drawings` or `/parts`.

## Deferred Scope Audit

| Deferred scope | Classification | Handling |
|---|---|---|
| Product implementation | Same Spec Phase 1 / Implemented Locally | Phase 1A parity and Phase 1B shared shell are implemented and locally verified; production release remains gated. |
| DEV-067 composer/projection implementation | Current Phase / Local RD Implemented / Local QA-QC Passed | Phase 1A～1D and focused QA/QC evidence completed under the exact contract above; no new product decision is required. |
| Optional read-only detail facade | Same Spec Phase 2 / Not Authorized | Implement only if Phase 1 leaves unsafe duplication. |
| Merging the three modules/pages | No Tracking | Rejected because entry pages serve different user tasks. |
| Schema/RLS migration | Blocked Human Re-entry | Not expected; requires explicit authorization if discovered. |
| Production deploy, merge, PR, rollback, production smoke | Blocked Human Re-entry / Release Authorization Required | No release artifacts are created in this document. |
| Dedicated phone UI beyond current supported surface | No Tracking | Current product guidance uses desktop/default surface; narrow viewport remains a sanity check only unless separately requested. |
| Retired Part-cost workflow | No Tracking | Current product authority keeps Part cost retired; DEV-067 must not reintroduce it. |
| Bulk relation editing from drawer | New DEV later | Existing controlled relation maintenance remains authoritative. |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | SPEC, QA, dev_task, documentation_map | product implementation | user asked `寫成開發文件` | files created and indexed | git diff / file review |
| Phase 1 / shared drawer | Authorized locally | Implemented Locally / Release Not Authorized | shared shell, canonical root/drawing/part/candidate panels, source context, QC | schema/RLS, page merge, release | user instruction on 2026-08-07 | same object from multiple entry points shows same core sections and one non-modal interaction contract | tsc, lint, focused QC, authenticated browser evidence |
| DEV-067 / unified entity composer | Local Phase 1A～1D authorized | Local RD Implemented / Local QA-QC Passed | Drawing/Part/Relation projections, server visibility, scoped review full view, lock/action/return parity | schema/RLS, production/staging, merge/PR/deploy/release | current exact contract and clean phase entry | one composer; no parallel body; no hidden restricted payload; review scope fail closed | focused contract/network/DB/query/PostgreSQL/multi-viewport browser evidence |
| Historical Phase 2 / optional detail facade | Superseded | Replaced by DEV-067 Phase 1A | historical read-only option | current implementation | none | do not implement separately | DEV-067 evidence applies |
| Phase 3 / release | Not authorized | Release Authorization Required | merge/deploy/production smoke/rollback | unapproved production work | explicit release authorization | deployment-release-gate pass | release gate evidence |

## RD Readiness Review

DEV-067 P0/P1 readiness:

- DB schema: no change required.
- Migration: no change required.
- API: required unified GET facade, exact envelope and summary/full field allowlists are defined.
- Permissions: existing page/command permissions are retained; exact request/company/target reviewer receipt is defined and client parameters never elevate.
- Transaction boundary: one repeatable-read detail snapshot plus same-transaction write-lock guard is defined; no nested read snapshots or pre-transaction-only locks.
- Failure recovery: exact 400/401/403/404/409/503 codes, action-first Traditional Chinese copy and safe return are defined.
- State machine: no lifecycle transition change.
- Data mapping: typed keys, header, four domain/review projection models, preview state, action and navigation models are exact.
- Multi-target: canonical owner precedence, stable anchors, one atomic decision boundary and ambiguous-root fail-closed are exact.
- Performance: hard Drawing/Part/Relation/review query budgets and 1/20/50 no-growth rule are exact.
- QA/QC: FMEA and `UDD-001..050` contract/network/DB/browser plan are defined.
- Release: not authorized; release artifacts deferred.

Result: historical Phase 1A-1B remains `Implemented Locally / Release Not Authorized`; DEV-067 is `Local RD Implemented / Local QA-QC Passed / Production Release Gated` with no open P0/P1 local implementation gap.

## Spec Governance

Cross-spec handling:

- Extends `SPEC-PDM-DETAIL-DRAWER-001` for shared drawer behavior.
- Extends `SPEC-PDM-MASTER-WORKBENCH-001` without changing the three-page responsibility split.
- Extends `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` by tightening click target semantics: root/drawing/part clicks must open matching entity detail.
- Extends `SPEC-PDM-NUMBERING-004` by preserving contextual add/obsolete entrypoints inside canonical object panels.
- Compatible with `SPEC-PDM-PART-COST-001`; part cost remains part-owned and redacted by permission.

ADR decision:

- New ADR is not required for Phase 1 because the decision is UI information architecture and shared component ownership, not identity, schema, lifecycle, audit, permission or release-gate policy.
- If Phase 2 introduces a cross-module backend detail facade that becomes an authoritative API surface, revisit ADR need before implementation.

Current authorization boundary:

- Documentation is complete.
- Product implementation is not authorized.
- Merge, PR, deploy, rollback, production smoke and release reports are deferred until explicit release authorization.

## 2026-08-09 Focused Amendment — DEV-059 QA-QC Reopen

This section supersedes only the previous PASS interpretation for the candidate bundle-submit confirmation layer; it does not repeal the shared `DrawingWorkspaceDrawer`, entity ownership, lifecycle, permission, schema or API contracts above.

- User field evidence on the current `/numbering/drawings` route shows `送交圖料與首版整包審核` cannot be dismissed by the visible `X`, `返回檢查` or re-entry, and the modal blocks the underlying workspace.
- The earlier Phase 1C browser evidence remains a historical baseline, but it does not prove current-route hard reload, back/forward or bfcache restore, runtime interruption, click-through prevention, and each close mechanism as an independent case.
- Parent status is therefore `Local RD Implemented / QA-QC Reopened by DEV-059 / Release Not Authorized` until focused AI real-operation evidence passes.

## 2026-08-10 Product Direction Amendment — A0005 Visual Baseline

The user has selected the A0005 formal drawing detail drawer as the only current visual baseline while the drawer family is redesigned. The candidate and approval detail drawer mounts are intentionally retired from the active UI, and their visible entry paths are paused. This amendment supersedes the active-rendering requirement for those two surfaces only; it does not delete or alter their API, data, lifecycle, permission, approval-command or evidence contracts. A future redevelopment task must explicitly reintroduce and validate the candidate/approval UI before those drawers are considered active again.
- The focused compatible-exception contract is `.ai-doc/specs/SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001.md`; the executable validation authority is `.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md`.
- `DEV-059` may change local modal state ownership, focus/keyboard handling, navigation/runtime recovery and visible status copy. It may not change lifecycle/API/schema/permission/formal data or release scope without a new Spec Impact Preflight.
- No QA/QC PASS may be restored from static source inspection or old screenshots. The AI must operate the current route in a real browser, execute isolated fault cases and complete disposable mutation/readback/cleanup evidence.

Focused result (2026-08-09): DEV-059 completed the current-route modal recovery portion with AI browser evidence for X, 返回檢查, Escape, physical click, hard reload, back/forward, candidate switching and 1440/1024/390 viewport checks. The parent full PASS remains gated because the shared candidate was intentionally not mutated; isolated flow/integration evidence covers submit/withdraw/fault behavior, while an isolated disposable UI mutation run remains an extended gate.

## 2026-08-14 DEV-073 CAPA Amendment — Status/Action/Work-item Consistency

This amendment is authoritative for the A0005 formal drawer state inconsistency and intentionally replaces any owner-only responsibility interpretation.

- A published workspace is provenance only; it must not be passed to the action resolver as an active candidate or override formal lifecycle/action ownership.
- The action catalog is resolved before viewer responsibility. `current_user` requires an applicable domain responsibility action; history and navigation alone are insufficient.
- Formal `rd_controlled` renders usable status and formal actions such as create revision/history, subject to existing permission rules.
- `in_review` without a resolvable request/workflow renders `unknown / 負責人待確認` and a locked `view_review` gateway with `PDM_ACTION_TARGET_UNAVAILABLE` plus PDM administrator recovery wording.
- Acceptance and evidence are controlled by `SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001`, QA-DEV-073 and QC-DEV-073. No schema, permission or decision-authority change is implied.

## 2026-08-14 Drawing maintenance entry merge amendment

- `編輯圖面資料` 與 `管理圖面檔案` 僅在 UI/action catalog 層合併為單一 `detail:drawing:edit`，可見 label 固定為 `圖面維護`。此入口進入同一 `DrawingProjection`，同時提供基本資料、自動 3D／2D 預覽、版本與附件、受控補檔表單及關聯料號。
- 主資料保存與附件上傳仍是兩個獨立 backend mutation boundary；任一 mutation 失敗不回滾另一者。附件類別仍由 server-side 自動偵測，UI 不提供人工 3D／2D 類別選擇。若資料或附件維護能力任一缺少，合併入口整體以低色階鎖定並以 tooltip 說明，避免進入後出現未授權控制。
- 影響檔案：`src/lib/pdm-detail-action-resolver.ts`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/components/drawing-projection.tsx`、`src/components/master-attachment-panel.tsx`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-dev-072-browser.mjs`。
- Focused browser evidence：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T110623Z-5ad38d84/run-manifest.json`；AI Chromium 確認圖面只出現 `detail:drawing:edit` 且不再輸出 `detail:drawing:manage_files`，並通過補檔表單可見與審核中鎖定斷言。完整 browser runner 後段既有 approval fixture 仍有 404／等待逾時，因此本 amendment 不宣告新的 aggregate 21/21；既有 DEV-072 baseline PASS 不被覆寫。
