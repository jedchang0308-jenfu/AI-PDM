# QA DEV-096：組立件情境式共用 BOM 驗證計畫

狀態：Local QA-QC Executed / 88 of 88 PASS / P0-P1 0 / Production Release Gated

執行結論：096-A～E在task-owned隔離環境完成。最終fresh aggregate為`output/qa/dev-096-aggregate/DEV096-2026-08-24T17-00-05-541Z/`；88/88 PASS、Blocked=0、Not Run=0。SQLite與disposable PostgreSQL均執行實際repository mutation；42個named fault checkpoint、四viewport Chromium、consumer exact projection、provider migration parity、typecheck與primary invariant皆通過。正式migration、feature activation、deploy與release未執行。

對應：`.ai-doc/specs/SPEC-PDM-ASSEMBLY-BOM-REBUILD-001-contextual-shared-structure.md`

DEV-099 evidence boundary（2026-08-26）：本計畫的88-case PASS繼續證明shared BOM Definition／mapping／review／release authority，但只適用DEV-096當時的分類入口與eligibility revision。DEV-099會取代required structure type、purchased assembly 422、first-Part inheritance及unclassified append block；不得以本計畫取代QA-099 fixed 48-case current evidence。

風險：High。驗證必須證明shared ownership、per-parent deterministic projection、migration preservation及retired authority不回歸；UI綠燈或單一SQLite happy path不足以構成PASS。

## 1. Scope

Current Phase 1A-1C：structure type與Part context、BOM Definition／applicability、manual shared Draft、variant mapping、review／release、exact-parent export／where-used、permission、SQLite／PostgreSQL migration parity及四viewport UX。

Out of scope：`.SLDASM` parser、CAD proposal、purchased assembly、cross-root sharing、Released Parent detach／fork與production release。

## 2. Test Oracles

- DB oracle：Definition／Draft／binding／line／mapping／review／snapshot exact rows、FK、unique constraint、projection hash及zero-partial delta。
- API oracle：server DTO/action、stable error、idempotency receipt、ETag/editor-version與HTTP status。
- Independent projection oracle：從immutable snapshot獨立展開每個Parent的resolved tree，再和export／where-used比對。
- UI oracle：fresh browser session、visible action／selection／dirty／error／focus及network／console errors。
- Migration oracle：source manifest、target manifest、per-entity crosswalk、apply／rerun、provider parity及protected hashes。
- Retirement oracle：DEV-095 route／caller／source／writer negative scan及injection。

## 3. Required Cases

### 3.1 Structure type與context — Slice 1A

| ID | Case | Expected |
|---|---|---|
| QA-096-001 | manufactured＋single_part new-root | Part＋M建立；single_part；BOM action=0 |
| QA-096-002 | manufactured＋assembly new-root | Part＋M＋primary relation＋assembly同transaction |
| QA-096-003 | purchased＋single_part，無／有R | 沿用DEV-093合法結果；BOM action=0 |
| QA-096-004 | purchased＋assembly | 422；sequence/root/Part/Drawing/link delta=0 |
| QA-096-005 | new-root missing／invalid structureType | 422；zero write |
| QA-096-006 | create idempotency replay／same key different structure | exact replay／409 conflict；不重複建號 |
| QA-096-007 | existing-root add Part／Drawing＋Part | UI／canonical request不顯示也不傳structureType；server繼承root canonical Part，unclassified阻擋，drawing-only不受影響 |
| QA-096-008 | existing Part single→assembly／assembly→single | 只走Part change work；current BOM存在時assembly→single被阻擋 |
| QA-096-009 | Part detail server action matrix | single／unclassified／inactive none；assembly create/open；anomaly blocked |
| QA-096-010 | Drawing drawer | 所有情境BOM action=0；可由matrix選到exact Part |

### 3.2 Definition、applicability與create — Slice 1B

| ID | Case | Expected |
|---|---|---|
| QA-096-011 | current Parent only | one Definition、Draft、binding、effect、audit；URL帶exact Parent |
| QA-096-012 | red／blue／black multi-select | one Definition／Draft／Revision、three bindings；零duplicate BOM rows |
| QA-096-013 | context Part未在selection | 422；zero write |
| QA-096-014 | duplicate／unordered IDs | server dedupe＋canonical sort；fingerprint穩定 |
| QA-096-015 | cross-company／cross-root／single／purchased／inactive candidate | foreign ID=404；same-company scope/type=422或state conflict=409；整筆zero write |
| QA-096-016 | candidate missing primary M | 409；整筆zero write |
| QA-096-017 | Parent已綁另一current Definition | 409；不自動合併或覆寫 |
| QA-096-018 | stale selection ETag／row version | 409；保留client仍有效選取；DB zero write |
| QA-096-019 | two concurrent creates share one Parent | exactly one commit；other 409；無orphan Definition／Draft |
| QA-096-020 | idempotent retry after unknown response | same Draft／receipt；different payload same key 409 |
| QA-096-021 | transaction failure at each insert boundary | Definition、Draft、bindings、effect、audit全有或全無 |
| QA-096-022 | legacy owner-only payload on DEV-096 writer | 422；不得建立single-owner新authority |

### 3.3 Logical lines與variant mapping — Slice 1C

| ID | Case | Expected |
|---|---|---|
| QA-096-023 | fixed Child line | one line、onecanonical child、quantity保持 |
| QA-096-024 | multi-select Child candidates | one logical line；candidate count不改quantity |
| QA-096-025 | complete red→red／blue→blue mapping | 每Parent exact one Child；shared tree line count=1 |
| QA-096-026 | multiple Parents map same Child | 合法；quantity仍屬line |
| QA-096-027 | incomplete mapping save | Draft可保存；unresolved list exact；submit blocked |
| QA-096-028 | child candidates cross-company／cross-root | 422；tree/mapping/editor version不變 |
| QA-096-029 | mapping duplicate／unknown Parent／unknown Child | 422；zero partial mapping |
| QA-096-030 | line self-reference／resolved graph cycle | save或release gate fail closed；無snapshot |
| QA-096-031 | group／item／positive quantity rules | existing rules保持；variant不繞過validation |
| QA-096-032 | concurrent editor save | expectedEditorVersion exactly one success；tree＋mappingatomic |
| QA-096-033 | floating topic＋mapping blocker coexist | blocking list完整且不重複line；submit 409 |

### 3.4 Review、release與consumers

| ID | Case | Expected |
|---|---|---|
| QA-096-034 | submit complete shared Draft | review snapshot固定parents/tree/mappings；status PendingReview |
| QA-096-035 | no item line／unresolved／reconfirmation／cycle | submit或approve 409；review／snapshot無partial mutation |
| QA-096-036 | reviewer diff | applicability、tree、quantity、mapping差異全可查且exact |
| QA-096-037 | Draft mutated or Part stale after review | approve 409；review保持Pending；無snapshot |
| QA-096-038 | approve shared release | one immutable snapshot＋all parent snapshots＋mapping＋projection hashes |
| QA-096-039 | next Revision release | same Definition；previous snapshot整體Obsolete；history可讀 |
| QA-096-040 | Released mutation attempt | 409／blocked；snapshot hashes不變 |
| QA-096-041 | export one-parent snapshot | parent可省略或明確；內容與hash oracle一致 |
| QA-096-042 | export multi-parent missing／invalid Parent | missing=422、invalid/not-applicable=404；不猜anchor；valid Parent檔名／內容正確 |
| QA-096-043 | where-used fixed Child | 列出全部實際resolved Parents |
| QA-096-044 | where-used variant Child | 只列映射到該Child的Parents，不列其他候選Parents |
| QA-096-045 | generic BOM list/search | one row perDefinition／Revision；可由任一適用Part搜尋；不duplicate |
| QA-096-046 | whole-definition obsolete | review required；all current Parents一致；partial obsolete不存在 |

### 3.5 Permission與資料隔離

| ID | Case | Expected |
|---|---|---|
| QA-096-047 | Engineer create/edit/submit | company scope內成功；不能approve |
| QA-096-048 | R&D Manager／Admin | contract允許的create/edit/review成功 |
| QA-096-049 | Manufacturing／Procurement | Draft/context candidates/mapping 403或不可見；Released exact projection可讀 |
| QA-096-050 | actor只可讀部分selected Parents | create／save／submit整筆403；不得藉shared set擴權 |
| QA-096-051 | cross-company URL／ID tamper | 固定404且無存在性洩漏、無write |
| QA-096-052 | reviewer company／role mismatch | approve/reject denied；review state不變 |

### 3.6 Migration、compatibility與retirement

| ID | Case | Expected |
|---|---|---|
| QA-096-053 | fresh SQLite／PostgreSQL schema | objects、FK、checks、indexes與semantics parity |
| QA-096-054 | exact legacy canonical manual owner | Definition＋sole binding；ids/revision/status/lines/review/snapshot preserved |
| QA-096-055 | legacy ambiguity／orphan／duplicate current | migration fail closed／issue；不猜測、不刪除 |
| QA-096-056 | migration apply／rerun | second run no-op；counts／hashes／FK exact |
| QA-096-057 | old owner compatibility read | historical data可讀；new authority command不只讀owner |
| QA-096-058 | DEV-095 retired routes／sources／writers | active caller=0；negative injection使gate FAIL |
| QA-096-059 | `.SLDASM` file authority regression | upload／preview／hash／read contract不因Phase 1改變 |
| QA-096-060 | primary data isolation | all build/test使用task-owned roots；before/after schema/identity/BOM/residue/FK invariant exact |

### 3.7 UX、RWD與Accessibility

| ID | Case | Expected |
|---|---|---|
| QA-096-061 | Part drawer no BOM／open BOM | only one applicable action；normal狀態無教學噪音 |
| QA-096-062 | create dialog selection | current Part鎖定；checkbox複選；不自動全選；一primary一secondary |
| QA-096-063 | loading／empty／error／stale | local feedback、input preserved、valid recovery、無duplicate global message |
| QA-096-064 | dirty matrix／editor navigation | BOM action遵守dirty guard；不得丟失未儲存工作 |
| QA-096-065 | variant inspector | one logical line；mapping rows可鍵盤操作；missing state可定位 |
| QA-096-066 | 1440×900／1024×768／768×1024／390×844 | 無裁切、重疊、水平overflow、雙重捲動或主要動作被遮蔽 |
| QA-096-067 | keyboard／focus／screen reader／no-color | focus order一致、dialog trap／return正確、dynamic errors announced、狀態不只靠顏色 |
| QA-096-068 | console／network／dead CTA sweep | unexpected 4xx/5xx、console/page error與dead CTA=0 |

### 3.8 Revision、lifecycle與second-readiness closure

| ID | Case | Expected |
|---|---|---|
| QA-096-069 | initial revision suggestion／tamper | candidate回read-only `1`；POST非exact suggestion為409，zero write |
| QA-096-070 | next Revision from latest Released | 同一POST writer、same Definition、base snapshot exact、revision n+1、tree/candidates/mappings clone atomic |
| QA-096-071 | next Revision加入same-root Parents | Parent set為base superset；fixed自動解析；by-parent新Parent保持unresolved且不按顏色猜測 |
| QA-096-072 | next Revision移除／替換existing Parent | 409 `BOM_PARENT_REMOVAL_NOT_SUPPORTED`；Definition/bindings/Draft delta=0 |
| QA-096-073 | one open／restorable revision | Draft／Rejected／PendingReview／Archived任一存在時不能建立另一版；concurrency最多一commit |
| QA-096-074 | archive／restore shared Draft | 只有Draft可archive；binding/tree/mapping保留；Archived從Part仍open；restore為Draft且conflict fail closed |
| QA-096-075 | manual set-active route | 所有shared狀態回410；`is_active`只由transition自動維護 |
| QA-096-076 | whole-Definition obsolete lifecycle | review impact含全部current Parents；approve後terminal read-only；subset／detach不存在 |
| QA-096-077 | schema-v2 review snapshot | canonical JSON/hash/version immutable；Draft/Part stale使decision 409且review保持Pending |
| QA-096-078 | self approve／reject | R&D Manager或Admin submitter都403 `BOM_REVIEW_SELF_DECISION_FORBIDDEN`；state/hash不變 |
| QA-096-079 | structured error boundary | body有error/message/details/correlationId；cross-company=404、同company缺capability=403；無SQL/stack/foreign IDs |
| QA-096-080 | audit／edit event／no outbox | 每個command exact audit；tree變更有edit event；BOM platform outbox delta=0 |
| QA-096-081 | logical line clone／move／diff | cross-revision logical ID保持；row ID重建不誤判；non-clone reuse被拒絕 |
| QA-096-082 | approval source canonicalization | 新item key=`bom_workbench:{reviewId}`；historical decided `legacy_bom`可讀；pending不可模糊轉換即activation blocked |
| QA-096-083 | bounds／set-based queries | 250 Parents／candidate、5000 nodes個別上限及100,000 resolved-row組合上限正確；任一超界413 zero write；query round trips符合SPEC上限 |
| QA-096-084 | feature rollback after shared release | flag off後new mutation不可達，但schema-v2 released list/export/where-used仍exact可讀 |
| QA-096-085 | replacement reconfirm exact occurrence | candidate與parent-selection flags精確定位；reconfirm只ack，不改candidate／mapping |
| QA-096-086 | list/search cardinality與cursor | 任一Parent搜尋只回one Definition/Revision row；排序/cursor無重複或漏列 |
| QA-096-087 | corrupt schema-v2 fail closed | 缺review/release JSON、row或hash時approval/export/where-used/transfer/AI全拒絕；不fallback legacy |
| QA-096-088 | deterministic migration IDs／rerun | 刪除crosswalk evidence後以同source重跑仍產生同IDs；SQLite/PostgreSQL exact parity、delta=0 |

## 4. Phase Gates

- Gate 1A：QA-096-001..010全部PASS，DEV-093 regression PASS，Part／Drawing drawer contract無drift。
- Gate 1B：QA-096-011..022、053..060全部PASS，provider migration parity與retirement negative injection有效。
- Gate 1C：QA-096-023..052、061..088全部PASS；每Parent projection oracle、完整lifecycle、export與where-used exact match。
- Aggregate：required cases全PASS、P0/P1=0、unresolved migration issues=0、retired active caller=0、primary invariants exact、production/deploy/release=false。

## 5. Evidence Required

每次run manifest至少記錄commit/worktree dirty boundary、provider、schema version/hash、fixture seed、task-owned data/repository paths、runtime/port owner（若有）、pre/post invariants、case result、first failure、API receipts、DB deltas、browser screenshots/traces、console/network log與cleanup confirmation。

UI沒有真實browser evidence時只能標`NOT_RUN`；PostgreSQL沒有disposable shadow時只能標`BLOCKED`，不得用SQLite PASS代替。正式migration、deploy與production smoke不屬本計畫執行範圍。

## 6. Repository-specific Runner Matrix

| Runner | Primary cases | Required independent oracle |
|---|---|---|
| `qc:dev-096:contract` | 001..010、022、045、058、059、075、079、082、084 | static route/caller/type/schema marker/approval source scan；注入一個retired caller後runner必須FAIL。 |
| `qc:dev-096:migration` | 053..060、082、088 | unmodified source manifest、fresh schema、apply/rerun、crosswalk、deterministic IDs、issue inventory、SQLite/PostgreSQL semantic parity、primary pre/post invariants。 |
| `qc:dev-096:repository` | 009、011..018、023..031、036、038..052、057、069..077、079..083、085..087 | 直接DB row oracle＋independent canonical JSON/hash/projection，不呼叫production mapper產生expected。 |
| `qc:dev-096:mutation` | 001..008、011..040、046..052、069..081、083、085 | task-owned DB；fault points、two-client concurrency、idempotency、serializable retry、zero-partial deltas。 |
| `qc:dev-096:consumers` | 036、038..046、049、051、057、076..087 | same snapshot對export、where-used、change-control、技轉包、approval inbox及AI summary逐一exact compare。 |
| `qc:dev-096:browser` | 009、010、045、047..052、061..079、084..086 | fresh authenticated Chromium；visible DOM／API／DB三方一致、四viewport、keyboard/focus/a11y、console/network sweep。 |
| `qc:dev-096` | 001..088 | fresh aggregate；不得消耗舊runner PASS作current evidence。 |

一個case可由多個runner共同舉證；case final status取最嚴格結果。Static contract PASS不能替代mutation/browser；browser visible PASS不能替代DB/projection oracle。

## 7. Stable Fixture Contract

fixture seed只可在unmodified source snapshot通過master count、root reference、migration residue及global FK invariants後執行，並保存逐row mutation ledger。最小fixture固定包含：

- Parent root `ASM-COLOR`：`ASM-RED`、`ASM-BLUE`、`ASM-BLACK`，同company、manufactured、assembly、Active且各有exact primary M。
- negative Parents：same-root single Part、purchased Part、no-M assembly、inactive assembly、other-root assembly、cross-company assembly、已綁另一Definition assembly。
- Child root `CHILD-COLOR`：`CHILD-RED`、`CHILD-BLUE`、`CHILD-BLACK`，同company canonical active Parts；另有cross-root、cross-company、obsolete、MainDrawingInvalid及manufactured-no-M Child。
- BOM data：one-parent legacy manual Draft、legacy Released snapshot、multi-parent shared Draft、complete/incomplete mapping、floating topic、next revision與cycle graph。
- Actors：Engineer、R&D Manager、Admin、Manufacturing、Procurement、cross-company Engineer；每位使用者的company／permission來源需在manifest列出。

Fixture IDs在單一run內stable、跨run由`runId` namespace隔離；不得依賴A000x primary資料、不得直接修改primary DB，也不得為了讓case通過而跳過產品API建立不可由UI達成的終態。Migration source fixture是例外，但必須由migration runner獨立ledger標明legacy source rows。

## 8. Fault Injection與Concurrency Matrix

只允許在task-owned transaction client注入下列named fault points：

| Command | Fault points | Zero-partial oracle |
|---|---|---|
| numbering create | `before_sequence`、`after_root`、`after_part`、`after_drawing`、`after_relation` | sequence/root/Part/Drawing/relation/structure/audit/effect全有或全無。 |
| shared create／clone | `after_definition`、`after_definition_binding`、`after_draft`、`after_draft_binding_n`、`after_clone_line`、`after_create_effect`、`before_commit` | Definition/Draft/bindings/clone/effect/audit/edit event全有或全無；BOM outbox永遠0。 |
| save | `after_old_graph_delete`、`after_tree_insert`、`after_component_node`、`after_candidate`、`after_parent_selection`、`before_editor_cas` | old graph完整保留或new graph完整可讀；editor version不跳號。 |
| submit | `after_validation`、`after_review_insert`、`before_draft_status` | review與Draft status一致；無半份review evidence。 |
| approve | `after_snapshot_header`、`after_parent_snapshot`、`after_resolved_line`、`after_hash`、`after_prior_obsolete`、`before_review_approved` | snapshot/header/rows/hash、prior obsolete、Draft/review/audit全部rollback或全部commit。 |
| archive／restore／obsolete／reconfirm | `after_state_cas`、`after_flag_update`、`after_audit`、`before_commit` | lifecycle state、legacy active、flags及audit全有或全無；binding/snapshot hash不變。 |

Concurrency至少覆蓋two-client同Parent create、same idempotency key、different key same Parent、same Draft editor CAS、review後Draft/Part stale及兩個reviewer同時approve。PostgreSQL需證明serialization/deadlock retry後最多一個commit；SQLite需證明queued top-level transaction沒有interleaved partial rows。

## 9. Feature Flag與Compatibility Assertions

- `PDM_ASSEMBLY_SHARED_BOM_V1=false`：Part BOM section=0、DEV-096 create/mutation不可達、DEV-095 manual regression維持、schema-v2 released read若存在仍可用。
- flag=true但`PDM_UNIFIED_PART_RELATION_WORKBENCH_V1`或`PDM_BOM_XMIND_EDITOR_V2_ENABLED`缺一：client status `requested=true/enabled=false`；不顯示create，shared Draft只能read-only，不能用legacy editor保存。
- dependencies及flag皆true：DEV-096 create／save可用；legacy owner-only payload 422，active owner-only mutation caller=0。
- activation inventory有open issue或schema-v2 coverage不足：server status blocked，writer回`BOM_SHARED_MIGRATION_BLOCKED`；不得因UI flag=true繞過。

上述四組均需contract、API與browser三層證據；不得只單元測試flag helper。

## 10. Consumer Projection Oracle

對每個Released Parent，runner自行從immutable `parent_snapshot_json`、shared lines及mapping snapshot展開expected preorder，再驗證：

1. `bom_release_resolved_lines` logical line／parent／child／quantity／level exact。
2. CSV export row order、filename、Parent identity、quantity及hash evidence exact。
3. where-used只回實際resolved Child；未選candidate不出現。
4. `pdm-change-control-domain`在Draft candidate／mapping或Released resolved reference命中時要求reconfirmation，無關candidate不誤報。
5. `transfer-package-phase1d`按selected Parent取exact latest released projection，多Parent不得fallback owner。
6. approval inbox顯示Definition revision、context Parent及impact count，authorization不洩漏其他company。
7. AI risk／summary／tools只透過async where-used authority取得同一結果。

任一schema-v2 header缺parent row、resolved row、JSON或hash時，上述consumer全部fail closed，不准回讀legacy owner/line文字拼出「看似可用」結果。

## 11. Runtime、Isolation與Evidence Manifest

- 所有mutation／browser／build使用runner建立的task-owned `PDM_DATA_DIR`與`PDM_REPOSITORY_DIR`；啟動前manifest記錄project、purpose、port、owning process tree、mutation scope及cleanup condition。
- Runtime完成或first failure後只停止該task-owned process tree，確認port released；不得停止既有port 3000或所有`node.exe`。
- aggregate前後讀primary SQLite只做schema、canonical root/Part/Drawing identity、BOM counts/hashes、migration residue及`PRAGMA foreign_key_check`比較；任何primary delta使整體FAIL。
- PostgreSQL runner只接受explicit disposable shadow DSN；缺少時標`BLOCKED`，production／staging／Cloud SQL DSN guard必須在連線前拒絕。
- evidence root固定`output/qa/dev-096-shared-assembly-bom/{runId}/`；需含manifest、pre/post invariants、fixture ledger、migration crosswalk/issues、API receipts/ETags、fault deltas、projection oracle、screenshots/traces、console/network及cleanup confirmation。

Manifest分母固定88 cases。Aggregate PASS要求`PASS=88`、`FAIL=0`、`NOT_RUN=0`、`BLOCKED=0`、P0/P1=0、open migration issues=0、retired active caller=0、productionWrites=false及ports released。若只完成SQLite本地RD而PostgreSQL blocked，結論必須是`Local SQLite RD Complete / Multi-provider QA Blocked`，不得標`Local QA-QC Complete`或產品完成。

## 12. QA Entry／Exit Boundary

Entry：096-A～D code完成、flag仍default-off、target-file dirty ledger可辨識、DEV-095 current retirement regression可執行、所有runtime可使用task-owned paths。若source fixture baseline invariant未過，不得seed。

Exit：§4全部phase gates＋§11 manifest gate通過，且QA報告逐一處置first failure與所有P0/P1。正式provider migration、capability activation、production deploy/release仍需deployment release gate，不由本QA計畫自動授權。
