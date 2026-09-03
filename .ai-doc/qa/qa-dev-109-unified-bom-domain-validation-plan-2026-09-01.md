# DEV-109 Unified BOM Domain Validation Plan

狀態：`CAPA Local Corrected / Contract Corrected / Historical 54/54 Retained / CAPA-P01 Observed / CAPA-P02 NO_OP / Production Effectiveness Blocked`

日期：2026-09-01

對應DEV：`DEV-109 / DEV-PDM-BOM-CANONICAL-CREATE-PAGE-001`

產品／實作authority：`.ai-doc/specs/SPEC-PDM-BOM-CREATE-PAGE-001-canonical-entry-and-candidates.md` §29～§34

架構決策：`.ai-doc/decisions/ADR-PDM-BOM-DOMAIN-002-unified-composition-and-deferred-execution-policy.md`

## 1. Validation objective and truth boundary

本計畫驗證single BOM domain的current runtime：purpose retirement、S0／S1 provider migration、Part base UOM、BOM locked UOM、scale-6 exact quantity authority、review／release schema v3、legacy v1／v2 immutability、SLDASM exact Part promotion、normal-route UI與primary-data isolation。

歷史DEV-106 30／30、DEV-109 48／48／60／60只能作為regression case來源。§1～§11的unified implementation historical
baseline固定為54；§12 CAPA另有8個local cases與4個production-specific gates，三者不得互相代替或合併灌大分母。

Historical §1～§11 baseline必須同時滿足：

- C01～C08、M01～M08、P01～P06、R01～R14、T01～T08、B01～B10 exact 54／54 PASS。
- Fail=0、Blocked=0、Not Run=0；case ID無重複、遺漏或多報。
- SQLite與PostgreSQL均有actual migration／mutation evidence；PostgreSQL不可以static SQL lint或SQLite PASS取代。
- Browser由normal UI entry操作real Chromium，不可用direct URL／API seed完成結果取代。
- Typecheck、affected lint、isolated build PASS。
- 每個會寫資料的runner都使用task-owned `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`；primary logical invariants前後不變。
- 所有temporary runtime／port／process tree／temporary path由本run清理並留receipt。

## 2. Roles and evidence independence

| Role | Responsibility |
|---|---|
| RD | 執行unit／contract／provider／transaction runner，交before／after source ledger，不宣告自己的結果等於QC。 |
| QA | 依本固定registry建fixture、編排fault／browser／provider步驟，確保每案都有oracle與cleanup。 |
| QC | 重讀manifest／raw evidence／DB invariant／screenshot／console／network／source fingerprint，只對實際執行結果下PASS／FAIL。 |

AI可在單人流程連續執行RD→QA→QC，但必須保留role boundary：RD runner結果不能直接當QC receipt，QC必須以fresh readback與fixed denominator確認。

## 3. Test environment and runtime lifecycle

### 3.1 Mandatory isolation

任一build、test、preview、worker或browser runtime啟動前，manifest必須記錄：

- project=`C:\VIBE CODING\AI_PDM`
- purpose／command／case IDs
- port
- owning PID與process tree
- cleanup condition
- task-owned absolute `PDM_DATA_DIR`
- task-owned absolute `PDM_REPOSITORY_DIR`
- 允許mutation scope
- primary DB／repository resolved absolute path與read-only invariant source

重用runtime前先證明project／purpose／data directories相同且沒有其他task owner。不得清unknown port、停所有`node.exe`或刪未驗證目錄。結束只停止本run的verified process tree，確認port released並移除task-owned temporary paths。

### 3.2 Primary invariants

每個可寫runner與isolated build前後均取：

1. Primary SQLite schema canonical fingerprint，包含table／index／trigger／column／check SQL。
2. Company、part_roots、part_numbers、drawings／drawing_numbers主數量與canonical identity hash。
3. Definition／Parent binding／Draft／review／release／resolved line counts與v1／v2 snapshot byte／hash inventory。
4. Migration residue inventory。
5. `PRAGMA foreign_key_check`全局結果。
6. Repository object count／path inventory；不以WAL／mtime／raw SQLite container hash單獨判定邏輯變更。

Before與after任一不一致即本run FAIL，不可用fixture cleanup或重跑掩蓋。

### 3.3 Fixture admission and mutation ledger

Fixture只能在unmodified task-owned source snapshot已通過master count、root reference、migration residue、global FK invariants後seed。每筆fixture必須記錄table／object path、stable ID、before／after value、case owner、cleanup result。不得seed最終PASS狀態或把預先建好的Released v3當end-to-end evidence。

## 4. Runner and manifest contract

| Runner | Cases | Output namespace |
|---|---:|---|
| `qc:dev-109:unified:contract` | 8 | `output/qa/dev-109-unified/<runId>/contract/` |
| `qc:dev-109:unified:migration` | 8 | `.../sqlite-migration/` |
| `qc:dev-109:unified:provider` | 6 | `.../provider/` |
| `qc:dev-109:unified:repository` | 14 | `.../repository/` |
| `qc:dev-109:unified:transaction` | 8 | `.../transaction/` |
| `qc:dev-109:unified:browser` | 10 | `.../browser/` |
| `qc:dev-109:unified` | 54 aggregate | `output/qa/dev-109-unified/<runId>/aggregate.json` |

Every child manifest必須有：`schemaVersion`、`devId`、`runId`、`runner`、`startedAt`、`completedAt`、`sourceRevision`、`dirtyBoundaryHash`、`actor`、`companyId`、`provider`、`dataDir`、`repositoryDir`、`productionConnection=false`、`primaryWrites=false`、`cases[]`、`faults[]`、`primaryInvariantBefore`、`primaryInvariantAfter`、`cleanup`。

Each case row：`id`、`title`、`status=PASS|FAIL|BLOCKED|NOT_RUN`、`oracle`、`observed`、`evidencePaths[]`、`durationMs`。Aggregate必須從child case rows重算counts，不接受child自報summary；發現unknown／duplicate／missing ID即aggregate FAIL。

## 5. Fixed 54-case registry

### 5.1 Contract C01～C08

| ID | Oracle |
|---|---|
| C01 | Current source／SQL／DTO／UI沒有behavior-bearing purpose；只允許`legacy_purpose`與schema<=2 legacy decoder中的歷史關聯。 |
| C02 | UOM registry只有8 codes；decimal parser只收plain positive max-6 string、safe upper bound，unknown／clear／precision／range返stable error，無alias／conversion／silent EA／rounding。 |
| C03 | V3 review／release shape包含`quantityUomCode`、不含`bomPurpose`／`fulfillmentPolicy`；quantity只由`quantity_scaled_6`還原，canonical hash對key／array／decimal排序及SQLite／PostgreSQL readback決定性。 |
| C04 | V1／v2 decoder／hash／immutable guards存在且未被v3 normalizer取代。 |
| C05 | 所有current purpose query／body回400 `BOM_PURPOSE_RETIRED`，route不ignore、不default。 |
| C06 | Export dispatcher依schema version分流；v3只produce composition／quantity／uom，v1／v2保留legacy semantics。 |
| C07 | BOM只有existing canonical writer；SLDASM helper不開transaction／HTTP／queue／cron／second receipt，async／sync formal relation writer清單完整且共用同一eligibility規則。 |
| C08 | Spec §31 exact 13 add／52 modify／2 delete／no-touch paths、54-file ledger、package commands、route names與repository symbols在source中可解析且無未列production write path。 |

### 5.2 SQLite migration M01～M08

| ID | Oracle |
|---|---|
| M01 | S0 pre-052 task-owned copy→target；existing Definition `legacy_purpose=manufacturing`，IDs／bindings／counts不變，new Definition default NULL。 |
| M02 | S1 post-052→target；manufacturing／sales_kit exact copy到legacy，purpose column／trigger／index退役。 |
| M03 | Target S2 rerun為no-op；schema／rows／hash／FK不變。 |
| M04 | PendingReview schema v1／v2 > 0時dry-run報`pending_legacy_review`，apply zero write。 |
| M05 | Unknown purpose時報`legacy_purpose_invalid`，不部分copy／drop。 |
| M06 | Same exact Parent對多current Definition時報`duplicate_current_parent_definition`，zero write。 |
| M07 | Null Part／Draft UOM及legacy Draft `quantity_scaled_6=NULL`只建issue inventory，不寫EA、不從REAL假造exact quantity；Draft保留且submit blocker可追溯。 |
| M08 | 每個rebuild checkpoint fault下rollback／discard copy；source IDs／counts／v1-v2 bytes／hash／global FK／residue不變。 |

### 5.3 PostgreSQL P01～P06

| ID | Oracle |
|---|---|
| P01 | Disposable PostgreSQL S0 actual apply建立target columns、constraints與guards。 |
| P02 | Disposable PostgreSQL S0 rerun保持schema fingerprint不變，且專用advisory transaction lock可取得。 |
| P03 | Disposable PostgreSQL S1 actual apply精確copy legacy purpose，並移除舊purpose column／trigger／index。 |
| P04 | Provider-level UOM／scale-6 valid write可讀回；非法UOM、零值與非法scale write由database constraint拒絕且不污染既有row。 |
| P05 | S0／S1 target columns與資料型別一致，`quantity_scaled_6`為`BIGINT`，不以floating column作exact authority。 |
| P06 | Issue CHECK保留existing-10＋new-8聯集，且target UOM constraints實際存在。 |

### 5.4 Repository and API R01～R14

| ID | Oracle |
|---|---|
| R01 | Any legal assembly Parent的create／open eligibility不依item_kind、M圖、CAD、Child Drawing或Parent base UOM。 |
| R02 | Candidate create／open／classify／none與reason／blocker由limit前SQL projection一次決定，exact Part／tenant／cursor一致。 |
| R03 | Legacy purpose query／body均400 `BOM_PURPOSE_RETIRED`，Definition／Draft／audit count zero delta。 |
| R04 | Create idempotency fingerprint不含purpose，same intent exactly-once，new Definition `legacy_purpose=NULL`。 |
| R05 | Child選入時複製base UOM，save／move／floating／restore保留locked UOM＋`quantity_scaled_6`，group無quantity／UOM／scaled value。 |
| R06 | Null base UOM Part可search／read但不可select；`PART_BASE_UOM_REQUIRED`含exact recovery，Draft／context保留。 |
| R07 | Same logical line alternate candidates單位不一致時`BOM_COMPONENT_UOM_MISMATCH`，zero partial mapping。 |
| R08 | Quantity string允許`0.000001`、`0.1`、`999999999.999999`且save／reload exact；0／leading zero／negative／sign／exponent／NaN／Infinity／scale>6／range overflow拒絕且不四捨五入；legacy REAL不得進v3 hash。 |
| R09 | Part base UOM變更不改Draft／Released；Draft save／submit報`BOM_LINE_UOM_STALE`，重選／重確認後可恢復。 |
| R10 | Submit只產生schema v3／deterministic hash，v3 quantity由scaled authority還原、含UOM且無purpose／policy。 |
| R11 | Approve只讀review v3 evidence，生成v3 release／resolved scaled quantity＋UOM，不以latest Draft重組。 |
| R12 | V1／v2 review／release／hash／export與resolved rows原bytes／語意不變，legacy unknown UOM不猜EA。 |
| R13 | Work list／approval／where-used／item insight的current decision無purpose；UOM diff只對v3 recorded value，不假造legacy change。 |
| R14 | Cross-company／unauthorized／stale ETag／forged Part／Drawing／file IDs均fail closed，zero wrong-entity write。 |

### 5.5 SLDASM transaction contract T01～T08

| ID | Oracle |
|---|---|
| T01 | Active primary exact `.SLDASM`／unique same-company formal primary Part：file binding／tombstone／Part assembly／audit／work version同commit。 |
| T02 | Exact Part已assembly時upload success、outcome=`already_assembly`、Part／audit zero delta。 |
| T03 | Same-content reuse仍重跑reconcile；可promotion但不建第二file／object／audit；terminal-preflight miss後的race replay或authoritative reuse會清掉本command unused staged object。 |
| T04 | Formal target為0時file upload成功、outcome=`no_target`，Part write=0，recovery server-resolved。 |
| T05 | Multiple／cross-company／stale target或root-hint→locked-work identity drift回`blocked_relation`／409，wrong-Part／audit write=0；已stage object完成compensation。 |
| T06 | 後續async upsert／replace／matrix與SQLite sync numbering link／create／main-drawing restore在final relation state建立unique target時呼同一規則；sync caller實際為`.immediate()`且無transaction直接呼叫fail closed；Part promotion與一筆audit同commit，batch中間state不promotion。 |
| T07 | Source contract固定new storage stage必須發生在DB transaction外，PostgreSQL row lock／SQLite `BEGIN IMMEDIATE`不得跨remote I/O；root＋work revalidation、Part update、audit、work version、commit checkpoint與storage compensation均由共用primitive定義。完整外部storage fault injection需在deployment gate另行執行，不以本地source assertion冒充。 |
| T08 | SLDPRT／secondary／removed／display-name spoof／replacement／delete／relation removal全部不promotion／不降級。 |

T01～T08 的本機執行層級是 source-contract：runner 會從目前 source 核對共用 primitive 的鎖序、transaction 邊界、正式關聯 writer coverage、checkpoint 與 recovery contract，不會偽造或宣稱已完成外部 storage I/O fault。Provider／repository runner 才對 task-owned PostgreSQL／SQLite 執行實際 migration／mutation／readback；exact SLDASM upload 的 storage fault、DB rollback、compensation inventory 與 production-like object lifecycle 必須在 deployment/release gate 以真實 adapter 重跑。

### 5.6 Real-browser B01～B10

| ID | Oracle |
|---|---|
| B01 | 從BOM工作台Header與empty state都可發現唯一「建立BOM」，到`/bom/create`，safe return正確。 |
| B02 | Create page無purpose selector／helper／empty container；candidate顯示create／open／classify／none、reason與選定狀態。 |
| B03 | 從normal route完成create／open／classify回程，exact Parent／Draft／returnTo不漂移。 |
| B04 | Child picker可選有base UOM Part，Inspector quantity旁顯示唯讀locked unit，Map／Outliner一致。 |
| B05 | Missing UOM Child當列disabled，按「先設定基本單位」到exact Part work，設定後回原Draft／selection context。 |
| B06 | Drawing work上傳exact SLDASM自動promotion，無classification checkbox、modal或常駐success panel。 |
| B07 | `no_target`／`blocked_relation`只在file row顯示一個relation recovery，修正matrix後單向promotion，無global error noise。 |
| B08 | Work list／editor／review current surface無purpose filter／chip／badge／製造／非製造決策文案。 |
| B09 | 1440×900、1024×768、390×844無horizontal／double scroll／footer overlay／drawer clipping／focus loss。 |
| B10 | Keyboard完成search／candidate／Child／recovery／save；loading／empty／error／selected／recovery有programmatic status，console／unexpected HTTP／5xx=0。 |

## 6. Fault injection and readback rules

Fault injection必須由runner checkpoint或provider transaction中斷完成，不可在test後手動改DB伪造rollback。每個fault留before rows、attempted command、thrown checkpoint、after rows、storage inventory、audit count、idempotency receipt與cleanup evidence。

Positive case也必須由independent readback證明，不只信API 2xx：

- Create：Definition／binding／Draft／receipt／audit。
- Save：tree／floating／candidate／mapping／editor_version／`quantity_scaled_6`／UOM；不得以legacy float readback作oracle。
- Submit：review bytes／schema version／hash／state transition。
- Approve：release bytes／hash／resolved scaled quantity＋UOM rows／immutable guard。
- Upload：file asset／binding／tombstone／Part／audit／work version／storage object。
- Relation recovery：formal exact matrix／Part／audit，並證明no duplicate receipt。

## 7. UI QC details

Screenshots必須來自normal entry且維持一致actor／company／fixture／source revision。B09每viewport至少留create、editor Child UOM、Drawing recovery三個state。不以設計稿對照單獨判PASS；但需證明主層級、順序、字體、間距、選定狀態、footer與row-local recovery未退化。

Browser manifest額外記錄：`browserVersion`、`viewport`、`routeSequence`、`focusTrace`、`screenshots`、`consoleErrors`、`pageErrors`、`failedRequests`、`unexpectedResponses`、`horizontalOverflow`、`doubleScroll`、`footerOverlap`。

## 8. Commands and order

```text
npm run qc:dev-109:unified:contract
npm run qc:dev-109:unified:migration
npm run qc:dev-109:unified:provider
npm run qc:dev-109:unified:repository
npm run qc:dev-109:unified:transaction
npm run qc:dev-109:unified:browser
npm run typecheck:app
npx eslint <all changed source and runner files>
npm run build:isolated
npm run qc:dev-109:unified
```

Aggregate最後執行，並驗證前述child manifests全部來自同一source fingerprint／dirty boundary。任一child在aggregate前source變更即全體stale，必須重跑；不得混用不同commit／dirty tree的PASS。

## 9. Stop conditions

1. 無disposable PostgreSQL、real Chromium或task-owned data／repository isolation。
2. Primary invariant baseline不通過，或執行中變更。
3. Migration需改寫v1／v2 snapshot／hash／audit／resolved rows。
4. Current runtime仍以purpose影響eligibility／writer／validation／list／review／release／export。
5. Exact SLDASM target無法在same transaction保證file DB rows／Part／audit／work version與storage compensation。
6. UOM必須silent EA、任意line unit、自動conversion或四捨五入才能完成。
7. 任一v3 path必須由REAL／DOUBLE反向生成canonical quantity，或任一formal primary relation writer無法在existing transaction套用SLDASM invariant。
8. Fixed case被刪除、改為future、以historical PASS取代，或aggregate將BLOCKED／NOT_RUN排除分母。

## 10. Completion and release boundary

本段是原54案的歷史完成語意：QA執行完畢且QC確認54／54前，DEV不得標`RD Implementation Complete`；即使本機54／54、typecheck／lint／build全部PASS，也只能標`Local RD/QA-QC Complete / Production Release Gated`。Current CAPA完成語意改由§12.3管理。

原始54案不授權Production PostgreSQL 054 apply、primary existing-data SLDASM reconciliation／feature activation／deploy／production smoke／rollback rehearsal與release。2026-09-01 CAPA依主SPEC §34將上述正式環境工作納入同一問題的改善與結案範圍，但仍必須另行進入deployment release gate；本文件不構成live data apply或activation授權，且不得把local task-owned evidence當成production change receipt。
## 11. Execution receipt（2026-09-01）

本計畫已依固定順序在同一 working-tree fingerprint 執行。`npm run qc:dev-109:unified` 回報 `status=PASS`、`observedCount=54`、`missing=[]`，C01–C08、M01–M08、P01–P06、R01–R14、T01–T08、B01–B10 全部 PASS，所有 child exit code=0，`productionWrites=false`。Provider runner 使用 task-owned disposable PostgreSQL，Repository runner 使用 task-owned SQLite actual create／save／review／release readback；Transaction runner目前驗證共用primitive的source contract，Browser 使用 task-owned SQLite、動態port與real Chromium，三個viewport與建立CTA readback通過，所有runtime已清理。

Aggregate evidence：`output/qa/dev-109-unified/2026-08-31T20-00-15-154Z/aggregate.json`；browser evidence：同 run 下 `browser/browser.json`；provider evidence：同 run 下 `provider/postgres.json`。工程 gates `npm run typecheck:app`、受影響檔案 ESLint、`npm run build:isolated` 與 `git diff --check` PASS。Migration／reconcile 的 apply 只在隔離 task-owned copy 驗證，transaction external storage fault／rollback／compensation、production PostgreSQL、primary data、activation、deploy 與 release 仍 NOT RUN／由 release gate 管理。

## 12. CAPA Extension：SLDASM 組立分類與正式環境有效性（RD Review Corrected）

對應：主SPEC §34，CAPA ID=`CAPA-DEV-109-SLDASM-CANDIDATE-001`。

目前判定：`CAPA Local Corrected / CAPA Contract Corrected / Production Effectiveness Not Run`。§11的54/54
只保留為historical local baseline；CAPA固定新增8個local cases與4個production-specific gates。DEV-032 generic release
cases仍須通過，但不重複計入CAPA分母。

核心oracle：`.SLDASM`結構證據不依賴Drawing data layer或Revision lifecycle。Promotion必要條件為已驗證的current
active primary exact `.SLDASM`＋same-company formal unique `primary_manufacturing` relation；candidate action仍只依Part
`structure_type`，assembly-file projection只提供reason／ranking且永遠zero write。

### 12.1 Local／isolated CAPA cases（CAPA-L01～L08）

| ID | Oracle |
|---|---|
| CAPA-L01 | current work位於`drawing_preparation`且active primary exact `.SLDASM`、formal unique relation成立時，upload可將single_part／unclassified exact Part單向promotion為assembly；file binding、Part、audit、work row version同commit。這是正向案例，不得因未受控lifecycle而zero write。 |
| CAPA-L02 | relation後補／existing-data路徑分別使用current `drawing_rd + rd_controlled`與`drawing_production + released` fixture；兩者都成立，且另加一個非上述lifecycle的合法current fixture證明layer／lifecycle不是gate。already assembly、same-content replay為no-op，不產生duplicate audit或BOM。 |
| CAPA-L03 | SLDPRT、secondary／removed／deleted file、non-current revision、reference relation、zero／multiple target、cross-company、stale／terminal target全部zero wrong-Part write並回正確recovery；不得把`drawing_preparation`或一般「未受控revision」本身列為反例。 |
| CAPA-L04 | upload writer、drawing-level relation writer、existing-data runner與candidate file projection通過同一語意不變量contract tests；允許各自SQL／helper。Candidate action／blocker只依Part authority與BOM狀態，GET zero write；reason=`assembly_file`且不含data-layer／lifecycle gate。 |
| CAPA-L05 | A0044-shaped fixture的SLDASM早於feature、非目前actor建立、formal可用、current revision有active exact file、無work binding且初始single_part。Reconcile前exact search=`classify + assembly_file`且zero write；reconcile後為`create`或`open`。在固定最多5筆的bounded fixture中，assembly_file優先於created-by／recent並保持deterministic order；不要求真實公司任意A0044永遠在top 5。 |
| CAPA-L06 | existing-data dry-run從current canonical revision＋active primary exact file取數，不依賴work binding／data layer／lifecycle；分類exact promotions／already／no-target／ambiguous／cross-company，輸出scope fingerprint＋plan hash。Apply只改plan exact rows，apply count＝audit count，rerun no-op且drift=0。 |
| CAPA-L07 | SQLite與disposable PostgreSQL的upload／relation／reconcile mutation與candidate readback一致；schema、canonical root／Part／Drawing identity、v1／v2 snapshot、migration residue、非目標table hash與FK before-after不變。 |
| CAPA-L08 | 原C01～B10固定54案全部重跑且PASS；新case不得改寫歷史manifest、縮小舊分母或把歷史PASS計入CAPA 8/8。 |

Local gate：`CAPA-L01..L08 = 8/8 PASS`且歷史54案仍54/54；任何Fail／Blocked／Not Run都不得交付release candidate。

Local execution receipt（2026-09-01）：`CAPA-L01..L08 = 8/8 PASS`，歷史 unified aggregate `observedCount=54`、`missing=[]`，L07另含 disposable PostgreSQL `CAPA-PG-01` exact SLDASM promotion／replay no-op。Evidence=`.ai-doc/qc/qc-dev-109-capa-2026-09-01.md`，machine receipt=`output/qa/dev-109-capa/2026-09-01T02-31-21-606Z/capa.json`。Runner 使用 task-owned SQLite、disposable PostgreSQL provider 與 task-owned Chromium；`productionWrites=false`、`productionConnection=false`、FK=0、task root／child runtime 已清理。

### 12.2 Release／production CAPA gates（CAPA-P01～P04）

通用source provenance、immutable artifact、activation、rollback、generic API／browser smoke由DEV-032判定。本節只驗證
此次CAPA特有的資料與功能結果：

| ID | Oracle |
|---|---|
| CAPA-P01 | Production read-only 054 inventory與reconcile dry-run產生exact counts、scope fingerprint、plan hash與row ledger；可還原backup／restore reference存在。054 apply、Part reconcile與activation各有相應decision evidence；A0044不存在時只記錄同判準既有row，禁止seed。 |
| CAPA-P02 | 經核准的reconcile apply只改plan內仍一致的exact rows；apply count＝audit count、rerun no-op、post-apply drift=0，schema／FK／canonical identity不變。Dry-run=0時輸出NO_OP receipt，不為湊案例寫正式資料。2026-09-01已完成正式 read-only NO_OP（receipt=`output/qa/dev-109-capa-production/2026-09-01T0315Z/p02-no-op.json`）；但 054 schema 尚未 ready，不能視為 production corrected。 |
| CAPA-P03 | DEV-032同一verified artifact在inactive candidate與activation後，由具BOM create／Part read權限actor從BOM工作台正常「建立 BOM」入口進入`/bom/create`：exact search命中、pre/post reconcile對應`classify → create/open`、reason=`assembly_file`、deterministic ordering、API／DB readback、console／pageerror／failed request／5xx=0及read-only drift=0。全公司default top 5不以A0044或任一特定料號作硬性oracle。 |
| CAPA-P04 | Release Capsule指定的日期與owner完成一次read-only effectiveness audit：eligible-but-not-assembly drift=0、wrong-Part=0、duplicate promotion audit／auto-BOM=0、exact-search action／reason正確。若無自然事件，照實記錄樣本限制；除非引用組織政策，不另設14日／3事件硬門檻。 |

Production serving traffic不得作測試環境，不得為CAPA建立虛構正式資料。P01～P03使用既有正式資料、read-only inventory
與inactive candidate；任何live apply或activation仍須獨立核准。

DEV-032 preflight（2026-09-01）先產生不連線 run-plan：`connectionAttempted=false`、expected migrations=`49`、readback SQL SHA-256=`97fbf0eef133a385d626d8084f68f6de040876819ef73382d1c17fea13c238ad`。授權續接後，正式 Cloud Run migration runner 已完成 read-only schema／SLDASM inventory；receipt=`output/qa/dev-109-capa-production/2026-09-01T0315Z/p01-readonly.json`。

正式讀回的關鍵事實：production `pdm_schema_migrations` 目前僅到 `052`（`053`、`054` 缺少），且 `A0044-P01` 是 `Draft/single_part`；`A0044-M01` 是 `Draft/drawing_preparation`、current data layer=`drawing_rd`，formal relation雖存在但 active primary exact `.SLDASM` file rows=`0`。因此 P01 的 reconcile dry-run 為 `exactTargetCount=0`；P02 已以同一 plan 重算形成 `NO_OP` receipt（`applied=0`、`auditCountDelta=0`、`rerunNoOp=true`、`postApplyDrift=0`），不得 seed 或補寫資料。P03 尚無本次 CAPA 的 immutable artifact／inactive candidate，P04 必須等 activation 後再排程；上述狀態不是 local PASS 的替代品。

### 12.3 Evidence、停止條件與完成語意

Evidence path：`output/qa/dev-109-capa/<releaseId>/`或DEV-032 Release Capsule的同一release evidence references。
每案記錄source／artifact／environment／actor／company／data boundary、command／route、expected、actual、before-after、
result與cleanup；不得記錄secret。

Stop：任一caller仍以data layer／lifecycle作必要條件、non-current file被採用、candidate GET有write、unknown release target／
dirty scope、無backup／rollback、dry-run scope／plan／count漂移、ambiguous target進apply、apply／audit／FK／schema／identity
異常、artifact不符或feature smoke失敗。停止後保存證據並回送RD／DEV-032，不降格為warning。

完成語意：

- `CAPA Local Corrected`：CAPA-L01～L08與歷史54案PASS；不代表正式環境改善。
- `CAPA Production Corrected`：CAPA-P01～P03 PASS；正式資料、artifact與post-deploy feature smoke已驗證。
- `CAPA Effective / Closed`：再加CAPA-P04 PASS；Blocked／Not Run／Fail必須為0。
