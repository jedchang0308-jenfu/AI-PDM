# QA DEV-110 — 智慧辨識共用值與 Part Work 移交驗證計畫

- Status：`QA Plan Ready / RD Implemented Locally / Full QC Passed 60/60 / Fixed 60 Checks / Production Release Gated`
- Date：2026-08-31
- Parent DEV：`DEV-110`
- Authority：`.ai-doc/specs/SPEC-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001-upstream-part-work-handoff.md`
- Risk：`Medium`，含主要UI互動、跨Drawing／Recognition／Part Work資料流與atomic mutation。

## 1. Validation Boundary

本計畫驗證DEV-110 target contract，不宣稱目前DEV-107 runtime已符合。QA case必須使用正常Drawing workspace入口、server exact relation scope、真實handoff command及existing Part work delivery path；不得以直接SQL建立預期work、只開direct URL、只驗設計稿或只跑build取代交付路徑。

驗證層：

- pure contract／projection：normalization、common／override、explicit absence、difference與source collapse。
- repository／service：scope、merge、lock、idempotency、event、rollback與SQLite／PostgreSQL parity。
- API：permission、company、source／relation drift、typed error與direct bypass。
- real browser：正常入口、操作、preview、destination、四viewport、keyboard、a11y與visible-error sweep。
- integration／snapshot：DEV-108 work readback、Part review ownership、Drawing submitted recognition summary與DEV-107 legacy compatibility。

## 2. Fixture Contract

Task-owned fixture至少包含：

- company A：Engineer owner、可編輯non-owner的Manager、readonly Manufacturing；company B negative actor。
- Drawing work `A0006-M01`與same-root five Parts `A0006-P01..P05`；formal links、current source PDF／3D assets與locatable／metadata-only evidence。
- 圖面一般區域`overall` material／surface fixture，不要求每Part重複證據；料號／資料對照表含同一欄位observation完整`A0006-P03`唯一命中的recognition exception，並含linked adapter明確exact owner ID／full canonical anchor positives，以及legacy suffix owner、unanchored single-target owner、只寫`P03`、同一observation多重eligible part number、non-eligible full code與candidate owner/text mismatch negatives；另含只有per-Part rows但沒有overall的uncovered-Part fixture、P05無source-candidate manual override、same-value multi-source與conflicting-source各一。
- no active work、editable existing work with unrelated-field edit、target-field conflict、review-locked work與unauthorized work。
- zero-delta、exact 100 Parts、101 Parts、source replacement、relation add/remove及fault-at-target-k variants。
- DEV-108 current local exact matrix route與source Part work destination；fixture與runner必須使用相同source revision。若110-0發現route／contract不可用或dirty overlap未解，downstream UI cases標`Not Run`且整體不得宣稱complete；現有DEV-108 PostgreSQL `NOT_RUN`不得借作DEV-110 provider PASS。

### 2.1 多料號圖面語意 fixture

固定一個可重現的混合圖面：一般區域提供`surface_treatment=鍍鋅`；對照表列出`A0006-P01→SUS304`、`A0006-P02→SUS304`、`A0006-P03→SUS301`，P04/P05不在表內。預期projection為一個全域表面處理common、三個材質exact overrides，P04/P05材質保持unset；不得把SUS304多數值升格為common。另以只有`P03`、多重命中、合併儲存格與無法辨識表格邊界的變體驗證unresolved／zero patch，並由人工common／`個別設定`完成復原。

Seed只建立父資料、來源與前置狀態；每個case的handoff結果必須由UI／API delivery path產生。fixture mutation需有ledger，primary/source data不得作測試setup。

## 3. Planned Cases

| ID | Preconditions／action | Expected result | Evidence layer |
|---|---|---|---|
| QA-110-001 | 正常Drawing list→workspace→智慧辨識 | exact session、5 Parts、common-first panel與唯一primary可發現 | authenticated browser＋GET trace |
| QA-110-002 | 圖面一般區域提供overall值，5 Parts不重複列證據 | 每欄一個common control並適用5 Parts；無5份重複值／source badges／例外 | projection＋browser screenshot＋DOM |
| QA-110-003 | linked adapter exact owner ID／full anchor，或料號表同一材質observation以完整`A0006-P03`唯一命中；另跑legacy suffix／unanchored owner、`P03`縮寫、多重／non-eligible命中與owner mismatch variants | verified positives只有材質顯示`1個例外`且P03 exact owner／value正確，其他欄位沿用overall；negative variants全部unresolved／zero patch且不擴張eligible scope；persisted owner ID／`resolved`標記不可單獨升權；per-Part值不因出現次數變成common | projection＋browser |
| QA-110-004 | 沒有field source candidate時，人工輸入common並為P05新增／編輯／恢復override | `override ?? common`正確；common edit不覆蓋P03／P05；恢復後跟隨common；event有manual origin且不建立synthetic candidate／假link | pure＋browser＋DB event |
| QA-110-005 | missing、empty、clear、not_applicable與value matrix | missing zero patch；clear=null；N/A保留explicit intent且按registry映射 | pure＋API／DB event |
| QA-110-006 | material／color label改變但無exact code | label更新且stale code清null；不形成假pair | repository／DB readback |
| QA-110-007 | PDF＋property同值；兩來源衝突；只有per-Part table rows而無overall | 同scope同值折疊；衝突展開且未解時handoff disabled/server blocked；uncovered Parts保持unset／zero patch，不用unique mode推導common | projection＋browser＋API |
| QA-110-008 | focus兩個同一PDF evidence；再點property evidence | 同target不remount／不閃；property不改page／zoom／scroll，只顯示metadata | browser video/screenshot＋geometry/network |
| QA-110-009 | locatable PDF geometry | 正確頁面／區域定位；focus／zoom／scroll保持契約 | real browser measurement |
| QA-110-010 | 0、1、100、101 eligible Parts與foreign-root／cross-company relation | 0 empty、1/100完整、101與integrity mismatch fail closed；無partial target | API＋repository＋browser state |
| QA-110-011 | panel開啟後source或relation變更再handoff | 409、zero Part work／event mutation、local draft保留並可reload | concurrent API＋DB ledger＋browser |
| QA-110-012 | 無active work、有delta | all-target transaction建立exact actor-owned works並mergeonly supported fields | SQLite／PostgreSQL＋DB readback |
| QA-110-013 | 無active work、全部zero delta | 0 no-op works；1 schema-v2 event；session synchronized | provider DB／event readback |
| QA-110-014 | existing editable work只有unrelated field修改 | unrelated field保留；target field安全merge；不duplicate work | repository／DB payload hash |
| QA-110-015 | existing work target field第三值 | UI展開work conflict；無選擇blocked；keep／use兩分支各符合結果與event audit | browser＋API＋DB |
| QA-110-016 | review-locked、other-owner without scope、duplicate/inconsistent work | all-target handoff zero write；safe blocker不洩漏payload | permission/state matrix＋DB invariant |
| QA-110-017 | fault inject at target k、event insert、session update | 任一fault全部rollback；沒有partial work／decision／event／terminal state | SQLite＋PostgreSQL fault evidence |
| QA-110-018 | double click、same-key replay、response loss、same-key different draft | exactly one effect/event；same draft replay；different draft 409 | API receipt＋request trace＋DB count |
| QA-110-019 | positive／zero-delta handoff event／links | schemaVersion=2、destination=part_work、counts／ordered targets正確；positive links只用allowed create／update／not_applicable，no-op只在result／fingerprints且zero-delta可為0 links；Part master不變 | DB event＋master before/after |
| QA-110-020 | 成功handoff→DEV-108 matrix→返回Drawing | exact work values與source destination正確；returnTo安全；無second common editor | real browser＋API/DB readback |
| QA-110-021 | DEV-108逐Part edit／submit／partial submit retry | downstream維持existing per-Part works/requests；upstream不複製submit CTA或combined review | integration browser＋snapshot/audit |
| QA-110-022 | Drawing submit與review snapshot | current source＋relation＋sync event被封存；Part decision authority未混入；no-intent session不成gate | API／snapshot hash＋review browser |
| QA-110-023 | DEV-107 legacy event與canonical cutover | legacy event仍解讀direct_master且immutable；new panel不呼legacy master writer；targeted DEV-107 regressions有明確disposition | contract/network＋DB invariant |
| QA-110-024 | 1536×1024、1440×900、1024×768、390×844＋keyboard／screen reader／reduced motion | 無overflow、重疊、截斷、雙重scroll、footer遮擋；focus順序／accessible names／狀態可理解 | screenshots／geometry／a11y trace |

固定case語意不得在Implementation Readiness時縮小；可新增case或拆runner，但`FAIL／BLOCKED／Not Run`不得從分母消失。

## 4. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---:|---|
| common套錯target／scope | client target／relation stale，或把per-Part table眾數誤當overall | 多料號資料錯誤 | QA-110-002／003／007／010／011 | P0 | server exact scope＋evidence applicability＋禁止mode fan-out＋locked fingerprint |
| legacy owner或表格縮寫／多重命中被猜成exact | persisted suffix／unanchored owner被信任，或heuristic把`P03`／一列多料號任選一筆 | 例外套錯料號 | QA-110-003／007／010 | P0 | linked adapter exact ID／full anchor provenance或formal eligible集合內完整canonical token boundary唯一命中；其他unresolved／zero patch |
| partial handoff | multi-call或transaction漏包 | 部分料號真假不明 | QA-110-017 | P0 | all-target rollback fault matrix |
| existing edit被覆寫 | 只比較formal或忽略work | 使用者資料遺失 | QA-110-014／015 | P0 | three-way conflict＋explicit choice |
| no-op建立垃圾work | 每target無條件create | 下游多餘待辦 | QA-110-013 | P1 | delta preflight＋event-only confirm |
| `formalized`被誤翻成master updated | consumer未讀destination | 使用者／reviewer誤判 | QA-110-019／022／023 | P0 | v2 discriminator＋copy／snapshot gate |
| source badge仍爆量 | presentation沿用candidate loop | 差異淹沒 | QA-110-002／007／024 | P1 | quietness audit＋source collapse |
| preview閃動／假定位 | focus先清空或metadata觸發selection | 核對中斷／誤判來源 | QA-110-008／009 | P1 | stable target check＋nonlocatable no-op |
| hidden error／all-zero假成功 | UI吞掉API錯誤 | 錯誤帶入或無法恢復 | all browser cases | P0 | visible-error hard gate＋data sanity |

## 5. Pass, Fail And Stop Rules

- RD Implementation Ready只表示契約、runner與evidence plan可直接實作；本計畫目前已由DEV-110 full aggregate完成固定60-case QA/QC PASS，後續狀態更新與收據以aggregate及QC receipt為準。
- Local completion至少需要QA-110-001..024全數有`PASS`，provider與browser必要case不得以static scan代替。
- 任一direct Part master write、partial transaction、duplicate event/work、cross-company hydrate、silent clear、unresolved work conflict overwrite、Drawing reviewer取得Part decision、visible raw error或viewport遮擋均為P0/P1 FAIL。
- DEV-108未實作時QA-110-020／021不得用mock改PASS；DEV-110只能停在integration pending。
- source revision、dirty boundary、environment、actor、route、fixture、browser version、viewport與data source任一不同，舊evidence只能作baseline，不能直接支持current PASS。

## 6. Evidence And QC Handoff

候選freeze後由QC以task-owned isolated runtime執行一次final visual gate。Evidence至少包含：

- source HEAD／dirty boundary、planned/actual case IDs、runner version、started/finished time。
- project、purpose、port、owning process tree、cleanup condition、`PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`與mutation scope。
- actor/company/Drawing/session/root/Part/work/event IDs、source／relation fingerprints、rowVersions、idempotency key／draft hash與fixture ledger。
- before/after Part master、work payload、event/link、session、review package與unauthorized write counts。
- browser URL、normal navigation、操作、network、console、viewport geometry、screenshots及preview page/zoom/scroll measurements。
- primary/source schema、canonical identity、migration residue、master counts與foreign-key invariants before/after，以及task-owned runtime／port／temp cleanup。

Exact command、runner split、artifact root與fixed manifest schema已在下方凍結；不得現在預寫release、production migration或deploy artifacts。

本機 implementation receipt：`.ai-doc/qc/qc-dev-110-local-implementation-2026-08-31.md`。`npm run qc:dev-110:aggregate`已依序執行contract（C01..C08）、SQLite repository（R01..R16）、disposable PostgreSQL（P01..P08）、authenticated real Chromium（B01..B16）、integration（I01..I08）及G01..G04 engineering／invariant／cleanup gates，固定60/60全部PASS；aggregate evidence=`output/qa/dev-110/DEV110-aggregate-2026-08-31T13-51-48-003Z/aggregate.json`。

## 7. Fixed Executable Registry — 60 Checks

24個acceptance cases是產品語意分母；runner將其拆成exact 60個可執行checks。兩個分母都要完整：任何`FAIL／BLOCKED／Not Run`保留，不得刪案或改aggregate denominator。

### 7.1 Contract C01..C08

| ID | Check | QA mapping |
|---|---|---|
| C01 | transferable field registry、alias、missing／value／clear／N-A normalization | 005／006 |
| C02 | overall／per-Part applicability、adapter exact-owner provenance、完整canonical token one-to-one resolver、legacy suffix／unanchored與縮寫／substring／multi-match／owner mismatch fail closed、manual common、override precedence、missing overall／scope conflict；禁止unique mode／majority fan-out | 002～004／007 |
| C03 | request≤64 KiB、4 common／400 override bound、duplicate tuple／spoof authority拒絕、draftHash deterministic | 004／010／018 |
| C04 | v2 event schema；manual origin；physical link kind只允許create/update/N-A/evidence；manual-only／no-op可0 link且無synthetic candidate | 004／013／019 |
| C05 | canonical network／source scan不呼legacy commit、formalize、write-impact或Part master writer | 019／023 |
| C06 | exact add／modify／no-touch boundary；migration／dependency／new permission=0 | 023 |
| C07 | safe exact Part destination、allowlisted same-origin `returnTo`、unsafe URL拒絕 | 020 |
| C08 | QA-110-001..024全部映射到C/R/P/B/I/G且60 IDs唯一、無漏案 | 001～024 |

### 7.2 SQLite R01..R16

| ID | Check | QA mapping |
|---|---|---|
| R01 | 1／5 Parts overall common projection；queued／extracting polling不開SQLite write-reserved transaction且worker status write不飢餓 | 001／002 |
| R02 | linked adapter exact ID／full anchor或完整`A0006-P03` table observation解析為exact exception；legacy suffix／unanchored owner、`P03`縮寫、多重／non-eligible命中與owner mismatch unresolved／zero patch；P05無candidate manual common／override／restore；per-Part-only uncovered Parts zero patch | 003／004／007 |
| R03 | formal-only scope排除draft、foreign root/company、terminal Part | 010 |
| R04 | 0／100／101 target behavior與fingerprint natural order | 010 |
| R05 | zero delta：0 work、1 v2 event、0 link、terminal session | 013／019 |
| R06 | new works exact payload、owner、rowVersion、work/state雙寫 | 012 |
| R07 | editable existing work merge保留non-target | 014 |
| R08 | target第三值 blocked／keep／use三分支 | 015 |
| R09 | review-owner／system／other-owner／duplicate-inconsistent work整體阻擋 | 016 |
| R10 | source replacement drift rollback | 011 |
| R11 | relation／formal／work row drift rollback | 011／016 |
| R12 | fault-at-target-k rollback work/state/event/session/receipt | 017 |
| R13 | fault-before-event／link-batch／session-update rollback | 017 |
| R14 | double click、same-key replay、different-payload 409、post-commit response loss | 018 |
| R15 | positive event／allowed links／target fingerprints；Part master before=after | 019 |
| R16 | legacy direct-master immutable、single-event unique、amendment successor可handoff | 023 |

### 7.3 PostgreSQL P01..P08

| ID | Check | QA mapping |
|---|---|---|
| P01 | repeatable-read GET same snapshot、domain SELECT≤7＋authority query≤1 | 001／010／011 |
| P02 | 100-target sorted lock、domain≤226／transaction≤234、lock<5s／E2E<8s | 010／012 |
| P03 | two-tab same session：one receipt、one event、no duplicate work | 018 |
| P04 | reversed client display/order input仍按Part ID lock，20 races zero deadlock／partial | 017／018 |
| P05 | concurrent source／relation change serialization retry後fail closed | 011 |
| P06 | target／event／link／session fault全rollback | 017 |
| P07 | 100／101、foreign company與unauthorized work payload redaction | 010／016 |
| P08 | SQLite parity、FK、append-only trigger、session event unique、Part master invariant | 019／023 |

### 7.4 Authenticated real Chromium B01..B16

| ID | Check | QA mapping |
|---|---|---|
| B01 | 正常Drawing list→workspace→智慧辨識且唯一primary可發現 | 001 |
| B02 | drawing-wide overall quiet common rows，無N份值／badge／框中框 | 002 |
| B03 | 完整`A0006-P03`唯一命中時只有P03材質列顯示1例外；縮寫／歧義variant顯示待確認且不預填，其他欄位仍是overall common | 003 |
| B04 | 無candidate時人工common與P05個別設定新增／編輯／恢復，common edit不覆蓋 | 004 |
| B05 | Header單一N來源、same-value collapse、focus return | 007 |
| B06 | source conflict展開、未解action disabled且direct POST blocked | 007 |
| B07 | same PDF evidence identity不remount/refetch/flicker；property focus page/zoom/scroll不變 | 008／009 |
| B08 | missing／clear／N-A controls與preview copy可辨識 | 005 |
| B09 | third-value work conflict的keep／use互動與effective preview | 015 |
| B10 | locked／permission／stale錯誤可見、draft保留、無payload leakage | 011／016 |
| B11 | double click／timeout／token-expiry保留body、key與local draft並收斂 | 018 |
| B12 | zero delta顯示確認資料已一致／資料已一致，無work destination假數 | 013 |
| B13 | positive CTA N只計mutation，成功開exact DEV-108 destination | 012／020 |
| B14 | 1536×1024＋1440×900 geometry／scroll／sticky footer | 024 |
| B15 | 1024×768＋390×844 reading order／overflow／touch targets | 024 |
| B16 | keyboard、screen reader names/live state、reduced motion、console/network/visible-error sweep | 024 |

### 7.5 Integration I01..I08

| ID | Check | QA mapping |
|---|---|---|
| I01 | DEV-108 exact matrix readback每Part effective values與source work | 020 |
| I02 | source Part selection與safe return回原Drawing | 020 |
| I03 | downstream逐Part edit不反寫recognition common/event | 021 |
| I04 | independent Part submit／partial retry，無combined request／Drawing decision | 021 |
| I05 | Drawing submit重驗current source／relation／sync event，寫入destination-aware recognition projection v2並封存摘要 | 022 |
| I06 | DEV-101 reviewer看immutable `destination=part_work` handoff摘要與正確copy，但無Part approve authority | 022 |
| I07 | DEV-107 legacy event／projection v1解讀為direct_master且immutable、legacy routes無canonical network call | 023 |
| I08 | DEV-107 38-case targeted disposition＋DEV-108／101 focused regression與Part master zero-diff | 020～023 |

### 7.6 Aggregate G01..G04

| ID | Check |
|---|---|
| G01 | manifest exact C8＋R16＋P8＋B16＋I8＋G4=60；planned／executed／PASS數可追溯。 |
| G02 | actor／company／fixture／fingerprint／idempotency／query／viewport／artifact evidence欄位完整。 |
| G03 | primary SQLite schema、canonical identities、migration residue、global FK before=after且task runtime／ports／temp已清理。 |
| G04 | finalizer只在其餘56個C/R/P/B/I checks＋G01..G03共59項PASS，且typecheck／affected ESLint／isolated build／diff／primary invariants／cleanup artifacts全PASS後把自身標為PASS；之後才可形成60/60與Local Complete。 |

### 7.7 Acceptance-to-runner manifest

| Acceptance | Required runner checks |
|---|---|
| QA-110-001 | R01、P01、B01、G01～G04 |
| QA-110-002 | C02、R01、B02、G01～G04 |
| QA-110-003 | C02、R02、B03、G01～G04 |
| QA-110-004 | C02、R02、B04、G01～G04 |
| QA-110-005 | C01、B08、G01～G04 |
| QA-110-006 | C01、R06、R15、G01～G04 |
| QA-110-007 | C02、B05、B06、G01～G04 |
| QA-110-008 | B07、G01～G04 |
| QA-110-009 | B07、G01～G04 |
| QA-110-010 | C03、R03、R04、P02、P07、G01～G04 |
| QA-110-011 | R10、R11、P05、B10、G01～G04 |
| QA-110-012 | R06、P02、B13、G01～G04 |
| QA-110-013 | C04、R05、B12、G01～G04 |
| QA-110-014 | R07、G01～G04 |
| QA-110-015 | R08、B09、G01～G04 |
| QA-110-016 | R09、P07、B10、G01～G04 |
| QA-110-017 | R12、R13、P04、P06、G01～G04 |
| QA-110-018 | C03、R14、P03、B11、G01～G04 |
| QA-110-019 | C04、R05、R15、P08、G01～G04 |
| QA-110-020 | C07、B13、I01、I02、G01～G04 |
| QA-110-021 | I03、I04、G01～G04 |
| QA-110-022 | I05、I06、G01～G04 |
| QA-110-023 | C05、C06、R16、P08、I07、I08、G01～G04 |
| QA-110-024 | B14、B15、B16、G01～G04 |

## 8. Runner Commands And Artifact Contract

Planned scripts：

```text
npm run qc:dev-110:contract
npm run qc:dev-110:repository
npm run qc:dev-110:postgres
npm run qc:dev-110:browser
npm run qc:dev-110:integration
npm run qc:dev-110:aggregate
npm run qc:dev-110
```

`qc:dev-110`必須依序執行contract→repository→postgres→browser→integration→`npm run typecheck:app`→affected ESLint→`npm run build:isolated`→affected diff／primary invariant checks→aggregate finalizer。aggregate最後讀取59項先前結果與全部engineering／cleanup artifacts，成功後才產生G04與60/60；缺任何artifact、先執行aggregate或任一項非PASS都必須使G04 FAIL。aggregate不得把build當產品case或用build替代browser。DEV-107／108／101 focused commands由I08 manifest列exact command與source revision，不借用舊PASS。

目前工作樹已提供contract／repository／PostgreSQL／real Chromium／integration／aggregate完整runner；`npm run qc:dev-110`會產生固定60/60 evidence。Browser source evidence採受控PDF content GET與source disclosure驗證，避免觸發會改變row version的重複OCR寫入；這不降低正常入口、destination與UI四viewport驗證範圍。

Engineering gate commands固定：

```text
npm run typecheck:app
npm exec eslint -- "src/app/api/numbering/recognition-sessions/[sessionId]/route.ts" "src/app/api/numbering/recognition-sessions/[sessionId]/handoff/route.ts" src/components/drawing-recognition-workspace-panel.tsx src/components/canonical-drawing-change-workspace.tsx src/lib/drawing-recognition.ts src/lib/drawing-recognition-part-work-handoff-contract.ts src/lib/drawing-recognition-part-work-access.ts src/lib/drawing-recognition-part-work-handoff.ts src/lib/drawing-recognition-review-projection.ts src/lib/drawing-recognition-review-snapshot.ts src/lib/pdm-review-package.ts src/lib/repositories/drawing-recognition-async-repository.ts src/lib/repositories/drawing-recognition-part-work-handoff-async-repository.ts src/lib/repositories/part-change-work-async-repository.ts scripts/qc-dev-110-contract.mjs scripts/qc-dev-110-repository.mjs scripts/qc-dev-110-postgres.mjs scripts/qc-dev-110-browser-real.mjs scripts/qc-dev-110-integration.mjs scripts/qc-dev-110-aggregate.mjs
npm run build:isolated
git diff --check
```

`build:isolated`必須遵守project AGENTS的primary SQLite／canonical identity／migration residue／global FK before-after invariant；若現行runner不能產出該證據，先補runner evidence contract，不得把一般Next build冒充isolated PASS。

Artifact root固定`output/qa/dev-110/<run-id>/`，現行runner輸出：

- `aggregate.json`：固定60 denominator、C/R/P/B/I分組結果、G01～G04 engineering／invariant／cleanup gates與primary snapshot。
- `repository.json`、`postgres.json`、`browser.json`、`integration.json`：各provider／UI／downstream case result、fixture與runtimeDeclaration。
- `screenshots/`：real Chromium四viewport recognition畫面與DEV-108 downstream matrix畫面。

## 9. Isolated Runtime, Fixture And Cleanup

- 所有runner預設`DEV110_QA_PORT=33110`；若port已被占用必須fail並回報owner，不得kill unknown process。PostgreSQL task-owned port預設`55410`，container／database name含run-id。
- runner在啟動前寫`runtime.json`planned state，包含project=`AI_PDM`、purpose=`DEV-110 QA`、owning process tree、cleanup=`runner completion/abort`、`PDM_DATA_DIR=output/qa/dev-110/<run-id>/data`、`PDM_REPOSITORY_DIR=output/qa/dev-110/<run-id>/repository`與只限該root的mutation scope。
- 原始source snapshot先通過primary master-count、canonical root／Part／Drawing reference、migration residue與global FK；之後才seed isolated fixture。primary DB／repository不得seed、clean或schema-init。
- fixture ledger以case命名，每case重建或transaction rollback到已知基線；不共享前案hand-off結果。Browser只從正常Drawing list導航，session/work/event必須由UI／API delivery path產生。
- fault registry固定：`after_target_preflight`、`after_work_mutation_k`、`before_event_insert`、`after_event_insert`、`after_link_batch_k`、`before_session_terminal`、`before_outbox_enqueue`、`before_command_complete`、`after_command_complete_response_loss`。每點必須在SQLite／PostgreSQL適用層證明預期rollback／receipt收斂。
- 結束時只停止task-owned PID tree、刪task-owned temp／container／database並確認33110／55410釋放；不得停止其他node／browser／DB。cleanup失敗使G03 FAIL。

## 10. Implementation And QA Gate Sequence

1. C01..C08先固定scope-aware applicability、manual intent與no-schema/no-legacy-call boundary。
2. R01..R16完成後才跑P01..P08；R01的SQLite polling／worker-write gate或P02/P04不通過不得進browser。
3. B01..B16必須使用authenticated real Chromium與正常入口；static DOM scan不能代替。
4. DEV-108 exact matrix不可用時I01..I04=`NOT_RUN`、G04 FAIL；mock／design image不得轉PASS。
5. C/R/P/B/I共56項先完成，接著G01..G03與engineering／invariant／cleanup gates；`qc:dev-110:aggregate`最後才執行G04。只有final 60/60全PASS，QA才可提Local Complete；QC仍需以獨立task-owned run覆核高風險P0/P1 cases。
