# QA-DEV-101：審核工作臺共用 Drawing／Part 完整工作區固定驗證計畫

Status：`Independent Local QA/QC Completion Candidate / Fixed QA 48 of 48 PASS / 0 Fail, Blocked or Not Run / Production Release Gated`

Date：2026-08-26

DEV：`DEV-101`

Authority：

- `.ai-doc/specs/SPEC-PDM-APPROVAL-CANONICAL-REVIEW-WORKSPACE-001-snapshot-package-and-shared-renderers.md`
- `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`
- CAPA：`.ai-doc/qc/qc-dev-101-approval-inbox-discoverability-capa-2026-08-27.md`、`.ai-doc/qc/qc-dev-079-dev-101-recognition-owner-review-parity-capa-2026-08-27.md`
- Regression：DEV-067、070、079、083、087、090

## 0. Plan Authority and Completion Rule

本文件原分母`QA-101-001..036`先因2026-08-27正常入口漏接CAPA重設為`QA-101-001..042`，再因辨識owner／review parity CAPA固定擴為`QA-101-001..048`。RD focused／aggregate只保留為輔助證據；它不映射、不縮減、不代替固定48案。固定case仍須由QA／QC依本registry獨立簽結。文件、source存在、typecheck、DB row、direct URL、單張截圖、RD自測敘述、舊DEV PASS或設計意圖都不能計固定case PASS。

角色：

- Dev PM維護scope、trace、phase與release gate，不替RD／QC簽產品PASS。
- RD依SPEC實作、執行self-test、交付target hash／touched ledger／raw evidence，不自行簽Independent QC。
- QA維護本分母與fail-seeking cases，不因實作困難刪case或降低expected。
- QC由正常UI入口、raw request JSON／DB、network與independent oracle重算；不得importSUT hash／marker／diff helper當expected。

Risk=`Medium / P1`。Local QA complete要求48/48 PASS、Blocked／Not Run=0、P0/P1 defect=0、required regression PASS、task runtime cleanup完整。`QA-101-035`與`QA-101-048`需要explicit task-owned disposable PostgreSQL；缺provider只能`BLOCKED_FOR_PROVIDER`，不得以SQLite替代。

## 1. Scope、Fixtures and Mutation Boundary

### 1.1 Stable logical fixtures

每次run從unmodified source snapshot建立task-owned isolated SQLite與repository：

| Alias | Primitive setup |
|---|---|
| `PKG-D1` | Drawing revision work；root含2 Drawings × 3 Parts，primary Drawing有field＋file change、risk，另一Part在送審後改名／附件 |
| `PKG-P1` | Part change work；root含1 Drawing × 2 Parts，primary Part附件在送審後增、刪各一 |
| `PKG-V1-D` | 現行legacy Drawing narrow snapshot pending request |
| `PKG-V1-P` | 現行legacy Part narrow snapshot pending request |
| `PKG-MULTI` | repository-level valid v2 envelope，2 submitted targets＋context targets；只測reader／request-level decision，不宣稱現行UI有multi-target authoring |
| `PKG-LARGE` | 200 targets／2,500 cells／接近8MiB，另備201 targets、2,501 cells與>8MiB三個超限變體 |
| `PKG-BAD` | package hash、duplicate target、bad primary、cross-root axis、asset membership各一個mutant |
| `GEN-A` | 非PDM generic approval request，供fallback regression |
| `REL-H` | historical／retired Relation request，必須不可進current review shell |

Actors：

- `reviewer-exact`：same company、exact assignment、具decide。
- `reviewer-other`：same company、具decide但未被指派。
- `owner-rd`：same company owner／editor，不因此取得review request。
- `viewer`：只有view。
- `foreign-reviewer`：另一company具decide。

### 1.2 Isolation

- primary SQLite／repository只讀fingerprint；build、test、browser、preview／recognition worker一律task-owned isolated dirs。
- fixture seed前驗master count、canonical root／part／drawing identities、migration residue與global FK；run後重算。
- 成功submit、request、decision、drift與return結果不得預先seed後冒充journey；只有`PKG-MULTI`與legacy compatibility可直接seed contract-level request，且manifest標記seed purpose。
- browser mutation只可由rendered decision action發出；所有fixture mutation寫ledger。

## 2. FMEA

| 失效模式 | 使用者／資料影響 | Priority | Detection／case |
|---|---|---|---|
| package hash拿來取代primary work hash | v2 approve永遠drift或錯誤核准 | P0 | 005、010、014、035 |
| review時live query補identity／附件 | 審核內容被送審後變更靜默替換 | P0 | 004、008、016、030 |
| active target進decision body／service | 形成未授權部分核准 | P0 | 014、018、027 |
| context identity誤標submitted | reviewer誤判scope | P1 | 003、023、027 |
| shared shell吸收domain conditions | edit／review再次分叉且維護困難 | P1 | 020、021、034 |
| marker只靠色彩／hover或合成最高嚴重度 | 狀態遺失、鍵盤／觸控不可用 | P1 | 024、025、031 |
| matrix cell變成可點／可編輯 | Relation review被意外恢復 | P0 | 022、033 |
| Part live附件仍加常駐note | snapshot truth與quiet UI失敗 | P1 | 008、021、030 |
| v2 kill switch同時關閉reader | 已建立request無法處理 | P0 | 006、015 |
| large root被截斷或N+1 | 不完整審核、timeout | P1 | 011、012、032 |
| sticky dock／雙scroll遮擋 | reviewer無法檢查或決策 | P1 | 028、031 |
| canonical pending request未投影到approval inbox | reviewer看見0筆、無法開始審核 | P1 | 037..040、042 |
| direct URL成功被誤算成入口成功 | list adapter缺失仍形成false PASS | P1 | 039、042 |
| v1可發現性與v2 writer啟用混淆 | 開flag掩蓋feed缺口或破壞immutable request | P1 | 040、041 |
| recognition只保存session摘要 | 外觀相同但reviewer沒有送審時欄位、owner與證據 | P0 | 043、044、046、048 |
| reviewer讀latest recognition補snapshot | 後續重跑辨識改變既有decision basis | P0 | 045、047 |
| owner unresolved仍可核准 | 非空Part-domain辨識值以未知歸屬進formalization | P0 | 043、046、048 |

## 3. Fixed Case Registry

### 3.1 Contract and Snapshot：QA-101-001..008

| ID | Setup／action | Expected | Required evidence |
|---|---|---|---|
| `QA-101-001` | strict parser處理valid v2、legacy Drawing／Part、null、array、unknown schema、extra／missing fields | valid discriminated；invalid stable 409；不以coercion吞型別 | parser matrix、stable codes、source scan |
| `QA-101-002` | PKG-D1／P1 submit | envelope含submittedAt、root、完整axes／cells、每identity target、primary、stable sorting；snapshot column hash重算相等 | persisted JSON、independent canonical hash、axis/target bijection |
| `QA-101-003` | 讀primary與context targets、PKG-MULTI | existing writers恰1 submitted；context_only不進scope；multi envelope可2 submitted且primary在scope | target manifest oracle、marker facts、decision scope readback |
| `QA-101-004` | submit後改context Part名、Drawing current revision、relation與附件 | package JSON／hash不變；shell／target仍顯示submitted facts；drift另顯示 | before/after snapshot hash、current raw rows、DTO diff |
| `QA-101-005` | 分別改package envelope、primary work payload與只有context資料 | envelope變造=integrity 409；primary work變更=approve drift；context drift不造成basis drift | three-hash ledger、decision zero/effect evidence |
| `QA-101-006` | flag off／on建立request；再關flag讀既有v2；讀v1 | off新寫v1、on新寫v2；關flag後v2仍可讀／decision；v1不被live回填成v2 | env matrix、request rows、reader results |
| `QA-101-007` | PKG-BAD duplicate target／axis、missing primary、cross-root mapping | submit或read fail closed，zero request／state transition；無silent omission | invalid table、transaction delta、first failure |
| `QA-101-008` | Part附件送審後soft-delete／新增／改名 | v2 snapshot manifest不變，active request exact asset/hash仍可讀；current差異只進compare；basis hash不變 | file read response/hash、attachment ledger、no live-note DTO |

### 3.2 Repository, Transaction and Performance：QA-101-009..014

| ID | Setup／action | Expected | Required evidence |
|---|---|---|---|
| `QA-101-009` | Drawing、void、Part submit在snapshot各named checkpoint注入failure | request／handling／revision全部rollback，無partial JSON／orphan | fault matrix、row counts、FK |
| `QA-101-010` | v2 Drawing／Part approve、return、response-loss retry、double click | request-level單一effect／trace／receipt；return不要求drift read；approve重驗basis | two-call receipts、trace count、formal rows |
| `QA-101-011` | PKG-LARGE boundary與三種over-limit | boundary完整成功；超限422且zero request；不得截斷、分頁或live fill | byte/target/cell counts、error、zero delta |
| `QA-101-012` | 1、20、200 targets量測builder與GET | builder<=18且不隨target線性增加；shell 1 request row、0 live domain；target/compare<=14且只讀active target | SQL ledger、query shape、N+1 detector |
| `QA-101-013` | source asset同hash derivative queued→ready、另注入wrong source hash | matching derivative可在review後ready；wrong hash永不顯示；snapshot不變 | polling/network、source/derivative hashes、screenshots |
| `QA-101-014` | PKG-MULTI在不同activeTarget各核准／退回，並direct body夾帶target | POST parser拒extra target或service忽略不得允許；整包一次完成、無per-target row／publication | request bodies、DB delta、forbidden table/state scan |

### 3.3 API, Permission and File Security：QA-101-015..019

| ID | Setup／action | Expected | Required evidence |
|---|---|---|---|
| `QA-101-015` | exact reviewer呼shell／target／compare／decision；terminal後再呼 | pending合法；terminal stale／404，無facts／second effect；flag狀態不影響v2 read | response matrix、trace/effect count |
| `QA-101-016` | other reviewer、owner、viewer、foreign對shell／target／compare/file/decision | fail closed 404/403且不hydratecode、root、asset、hash | paired responses、redaction scan、zero delta |
| `QA-101-017` | target path改entityType／ID、用另一request target、bad encoded ID | 404；shell仍可回primary；不得查任意master | route ledger、query parameters、no fact leak |
| `QA-101-018` | decision body缺／多field、reject、needs_info、stale rowVersion、bad token | only approve／return exact shape；stable 4xx、zero effect | body matrix、responses、DB ledger |
| `QA-101-019` | review_package file用wrong request／target／asset／binding／hash或terminal request | 全部404；exact active membership可讀submitted object；current replacement不可替代 | file cases、bytes hash、source query ledger |

### 3.4 Shared Renderer and Browser UX：QA-101-020..031

| ID | Rendered journey | Expected | Required evidence |
|---|---|---|---|
| `QA-101-020` | 同一Drawing在owner edit與v2 review | 同一Drawing content component、section/label/preview/file order相同；review只少mutation、多context/decision | source import graph、DOM signature、paired PNG |
| `QA-101-021` | 同一Part在owner edit與v2 review | 同一Part content component/order；review顯submitted attachment manifest且無management control／常駐scope note | DOM/source evidence、network zero write、paired PNG |
| `QA-101-022` | matrix以mouse／keyboard操作identity與cell | identity可切target；cell無click、tab、menu、edit；DEV-090 owner matrix edit仍可用 | focus trace、DOM roles、owner regression |
| `QA-101-023` | Drawing-only、Part-only、Drawing+Parts、PKG-MULTI | 全部顯完整同根matrix；submitted/context清楚；切換不改scope／dock | screenshots、manifest oracle、dock DOM key |
| `QA-101-024` | 同identity同時submitted＋change＋risk，另測各種缺slot | 三marker固定次序且並存；缺項不使其他slot位移；selected是獨立channel；無常駐marker文字 | bounding boxes、grayscale/high contrast PNG、DOM text scan |
| `QA-101-025` | hover、focus、click、tap、outside、Escape輪流操作marker | transient/pinned規則、一次一個、分離hit target、focus回trigger；screen reader取得名稱／描述 | interaction trace、accessibility tree、focus log |
| `QA-101-026` | direct URL、reload、share、Back／Forward、invalid／foreign target、快速切換 | 合法還原；invalid replace primary不增history；stale response不覆蓋新target；returnTo保持 | URL/history/network sequence、visible identity |
| `QA-101-027` | 在多個targets／sections間切換後approve／return | dock始終可達且actions不因已讀改變；network decision沒有target/read state；整包單一result | network body、DOM state、DB effect |
| `QA-101-028` | active target產生drift後開關compare | 無drift無marker；desktop snapshot左/current右；changed first、unchanged可展開；關閉還原target/scroll | compare DTO、PNG、scroll anchor、hash labels |
| `QA-101-029` | 390px compare swipe＋二態control、matrix pan、browser back gesture | 預設snapshot；tap／keyboard可切；三種手勢邊界不誤觸 | video/trace、URL、pointer geometry |
| `QA-101-030` | snapshot file unavailable、target GET fail、preview queued/fail、decision conflict | 局部恢復，不整頁reload、不以current補snapshot；matrix/dock/context保留 | fault screenshots、DOM keys、network/error ledger |
| `QA-101-031` | 1440×900、1024×768、768×1024、390×844、200% zoom；mouse/keyboard/screen reader/reduced motion | body無horizontal overflow；matrix唯一horizontal owner＋sticky axes/auto-reveal；dock不遮擋；focus完整可見 | viewport PNG、geometry JSON、AT/focus logs、console=0 |

### 3.5 Regression and Integrity：QA-101-032..036

| ID | Gate | Expected | Required evidence |
|---|---|---|---|
| `QA-101-032` | large matrix performance、rapid target switching、preview mount count | within budgets；只mount active target；無request waterfall／memory持續增長 | timing/query/network/mount counters |
| `QA-101-033` | generic GEN-A、legacy v1 D/P、REL-H、DEV-070 return、DEV-090 matrix owner edit | generic不變；v1可完成；Relation current 404；list/return與owner relation edit無退化 | browser journeys、source scan、responses |
| `QA-101-034` | typecheck、affected lint、contract source checks與duplicated-domain-JSX detector | zero type errors／lint errors；Drawing/Part各一renderer；approval shell無domain fields | logs、AST/import inventory、duplication mutant |
| `QA-101-035` | disposable PostgreSQL：v2 submit、hash lock、concurrent approve/retry、attachment drift、large boundary | 與SQLite同語意；exactly-one effect、無deadlock／partial request/provider-specific JSON問題 | provider/schema hash、barrier timing、rows、cleanup |
| `QA-101-036` | isolated build、schema-none、primary invariants、child manifest/hash、task cleanup、Independent QC aggregate | build PASS；DB/migrations無DEV-101 delta；primary before=after；ports/process/temp清除；48/48才candidate | manifests、git diff、fingerprints、cleanup receipt、QC signoff |

### 3.6 CAPA Normal Entry and Anti-false-PASS：QA-101-037..042

| ID | Setup／normal action | Expected | Required evidence |
|---|---|---|---|
| `QA-101-037` | isolated DB各建立assigned v1／v2 canonical pending request，exact reviewer由`/approvals`進入 | 兩筆都出現在rendered list；summary total／pending與可見rows一致；code、revision、kind、status可辨識 | raw request/state rows、inbox JSON、rendered DOM、count oracle、PNG |
| `QA-101-038` | exact、other、owner、viewer、foreign actors；pending／applying／terminal；搜尋A0002等code並跨limit／cursor | 只有same-company exact reviewer的actionable request可見；filter-before-limit、search、cursor穩定；無facts leak或重複row | actor response matrix、query ledger、row keys、cursor sequence、zero-write |
| `QA-101-039` | 從rendered owner UI建立可送審work並送審，reviewer從`/approvals`找row、點列、切target、返回 | postcondition不得預seed；row直接進`/approvals/[requestId]`而非PDM decision drawer；v2 workspace可見；return恢復filter／cursor／selection並刷新count | headed trace/video、network、URL/history、DOM、DB persistence、mutation ledger |
| `QA-101-040` | PKG-V1-D／P與A0002等價legacy request經正常list開啟 | v1同樣可發現且走compatibility reader；不backfill、不改hash、不假裝v2 matrix；direct URL不算入口PASS | before/after snapshot/hash、list journey、legacy DOM、zero migration／backfill |
| `QA-101-041` | task-owned runtime分別flag off／on，由正常UI各新建request並回讀actual runtime／persisted schema | off新request=v1、on新request=v2；兩者都可由list找到；既有v1保持v1；env檔字串不能代替runtime readback | runtime declaration、status/readback、request JSON、list/page screenshots、cleanup |
| `QA-101-042` | mutant移除`pdm_work_review` inbox adapter但保留detail direct URL與v2 shell | 037／039及aggregate必FAIL，first failure明確指向入口／count；恢復adapter後同source run PASS | mutant diff/hash、FAIL/PASS receipts、direct-page supporting evidence、aggregate manifest |

### 3.7 Recognition Projection、Owner Gate and Immutable Parity：QA-101-043..048

| ID | Setup／normal action | Expected | Required evidence |
|---|---|---|---|
| `QA-101-043` | exact Drawing revision recognition session含多source、candidate decisions、field scopes、observations與唯一Part owner，經正常submit建立v2 package | package保存versioned full projection：exact session/source identities、candidate decisions、canonical fields/scopes、ownerResolution、effectiveOwnerId、evidence references、blockingReason與獨立projection hash；outer package hash亦涵蓋該projection | pre-submit projection JSON/hash、persisted package JSON、independent inner/outer hash、exact membership ledger |
| `QA-101-044` | 同一task-owned fixture依序讀owner editor API、submit、由`/approvals`開reviewer Drawing target | editor API projection、package projection及review renderer input在schema、field/member、decision、owner resolution、evidence reference與projection hash完全一致；review使用與editor相同recognition panel、只切readonly capability | 三段DTO canonical diff、DOM signature／source import graph、paired PNG、network methods |
| `QA-101-045` | submit後建立時間較新的same Drawing但不同revision／source-context／lineage session，並改動latest結果 | package JSON／inner hash／outer hash與reviewer顯示不變；review target不得呼latest-session endpoint或把新session混入snapshot；latest-read mutant使case及aggregate FAIL | before/after hashes、session tuple oracle、network zero-call ledger、mutant FAIL/PASS pair |
| `QA-101-046` | 分別測unresolved、ambiguous、invalid owner及legacy meta-only recognition，嘗試approve與return | v2 unresolved／ambiguous與legacy incomplete basis在approve前fail closed為stable code、zero formal effect；return仍可用；v1不backfill、不live-fill、不假裝full projection | decision responses/codes、effect delta、legacy before/after hash、return receipt |
| `QA-101-047` | exact reviewer由正常清單開啟v2 Drawing target並操作recognition section／candidate evidence | 同一shared panel可見送審時欄位、candidate／source evidence與projection provenance；無polling、recognition GET／POST、candidate decision、upload或其他domain mutation；只有active snapshot target被mount | rendered DOM/PNG、accessibility tree、network allowlist、zero-write DB fingerprint |
| `QA-101-048` | SQLite與task-owned disposable PostgreSQL執行exact revision projection、JSON／JSONB round-trip、inner-hash mutant、concurrent approve與query budget | 兩provider projection與hash語意一致；Date／timestamp canonical化後round-trip不漂移；改nested recognition且重算target/outer hash仍被inner hash攔截；snapshot read zero-write且batch query不隨member線性成長 | provider canonical JSON/hash、barrier rows、query ledger、mutant receipt、cleanup與primary invariant |

## 4. Requirement Traceability

| SPEC AC | QA cases |
|---|---|
| AC-01 canonical PDM path／generic preservation | 015、020..023、033 |
| AC-02 shared renderer parity | 020、021、034 |
| AC-03 complete immutable package | 001..004、007、009、011 |
| AC-04 separated hashes／formalization | 002、005、010、014、035 |
| AC-05 matrix／markers | 003、022..025、031 |
| AC-06 URL state | 026、030、031 |
| AC-07 drift compare | 004、008、028..030 |
| AC-08 Part attachment exception | 008、019、021、030、035 |
| AC-09 atomic decision dock | 010、014、018、023、027、031 |
| AC-10 zero mutation／security | 014..019、020..023、027 |
| AC-11 accessibility／viewport | 024..031 |
| AC-12 v1／flag／rollback | 001、006、015、033、036 |
| AC-13 limits／provider／integrity | 009..013、032、034..036 |
| AC-14 normal inbox discoverability／exact actor／return | 037..042 |
| AC-15 full recognition projection／owner fail-closed | 043、044、046..048 |
| AC-16 immutable recognition parity／latest-session isolation | 044、045、047、048 |

所有16項AC有explicit coverage。AC或case內容變更時先更新registry hash與trace，不可只改runner expected。

## 5. Runner and Command Contract

預定檔案與本輪已落地的focused runner：

- `scripts/qc-dev-101-contract.mjs`：RD focused static contract checks（`DEV101-CONTRACT-001..012`；不替代固定case）。
- `scripts/qc-dev-101-package-builder.mjs`：RD focused isolated package builder checks（`DEV101-PACKAGE-001..004`；不替代固定case）。
- `scripts/qc-dev-101-repository.mjs`：002..013、019。
- `scripts/qc-dev-101-api.mjs`：015..019。
- `scripts/qc-dev-101-browser.mjs`：RD focused authenticated browser/API smoke（`DEV101-BROWSER-001..006`；不替代固定case）；CAPA後必須從正常`/approvals`入口覆蓋037、039..042，direct URL只可作detail supporting probe；完整020..033 runner仍待補。
- `scripts/qc-dev-101-postgres.mjs`：035，只接受explicit disposable provider。
- `scripts/qc-dev-101-aggregate.mjs`：036、child manifest hash與completion gate。

`package.json`固定命令：

```json
{
  "qc:dev-101:contract": "node scripts/qc-dev-101-contract.mjs",
  "qc:dev-101:package": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-101-package-builder.mjs",
  "qc:dev-101:repository": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-101-repository.mjs",
  "qc:dev-101:api": "node scripts/qc-dev-101-api.mjs",
  "qc:dev-101:browser": "node scripts/qc-dev-101-browser.mjs",
  "qc:dev-101:postgres": "node scripts/qc-dev-101-postgres.mjs",
  "qc:dev-101": "node scripts/qc-dev-101-aggregate.mjs"
}
```

不得建立placeholder PASS、空alias、aggregate自行補child manifest或以`--allow-open`作completion。

## 6. Browser Runtime Declaration and Cleanup

每次browser run啟動前manifest必含：

- project=`AI_PDM`；purpose=`DEV-101 approval canonical review browser QA`。
- free port、exact owning PID tree、cleanup condition=complete／first failure／timeout。
- `PDM_DATA_DIR=<task-temp>/data`；`PDM_REPOSITORY_DIR=<task-temp>/repository`。
- mutation scope只限task temp與`output/qa/dev-101/<run-id>`。

不得停止localhost:3000或任何未知runtime。finally只停止本runner PID tree、關browser、確認port released並移除task temp；cleanup失敗使036 FAIL。

## 7. Provider, Schema and Rollback Gate

- schema classification=`none`；`db/schema.sql`、`db/postgres/*.sql`、`src/lib/db.ts`不應有DEV-101 delta。
- SQLite repository lane mandatory；035 mandatory disposable PostgreSQL。無provider即Blocked，不准連primary。
- rollback rehearsal需證明：writer flag off後不再產生v2，但既有v2 reader／decision仍工作；pending_v2>0時禁止code rollback移除reader。
- final production activation另要求pending_v1 inventory=0或人類批准的normal-flow收斂計畫；不得backfill／改hash／direct delete。

## 8. Independent Oracle and Required Mutants

QC可使用primitive snapshot JSON、stable sorted raw facts、current DB rows、HTTP methods、DOM geometry與file bytes自行算expected；不得import：

- `pdm-review-package-contract.ts` canonical/hash helper
- `pdm-review-package.ts` drift／scope helper
- package renderer marker／selection helper
- child runner result／summary helper

至少注入：

| Mutant | Must fail |
|---|---|
| package hash直接拿來比current primary work | 005、010 |
| target GET用live identity／attachment覆寫snapshot | 004、008、016、030 |
| context target預設submitted | 003、023 |
| activeTarget加入decision body並縮小scope | 014、027 |
| relation cell可點／可編輯 | 022、033 |
| 三markers合成一個或用row background | 024 |
| marker只有hover／color、無accessible name | 025、031 |
| mobile只有swipe、無二態control | 029、031 |
| flag off同時拒絕既有v2 reader | 006、015 |
| builder針對每target query files／history | 012、032 |
| missing child／cleanup仍被aggregate算PASS | 036 |
| 移除canonical inbox source但direct URL仍可開 | 037、039、042 |
| env檔有flag但actual runtime未啟用 | 041、042 |
| recognition只保留session meta或省略candidate/evidence/owner resolution | 043、044、046 |
| reviewer依Drawing code抓latest session而非exact revision/context | 045、047 |
| 改nested recognition後只重算target／outer hash即可通過 | 043、048 |
| unresolved／ambiguous owner仍允許approve | 046、048 |

## 9. Evidence Manifest Minimum

每個child至少保存：run ID、case registry hash、source HEAD／dirty target hashes、provider、fixture fingerprint、case totals／IDs／status、command／exit code、raw artifact paths＋SHA-256、first failure、P0/P1 count、primary before/after、runtime PID／port／cleanup。Browser另含viewport、actor、URL、console/pageerror/requestfailed、network methods/bodies redaction、accessibility／focus／geometry與PNG hash。

Aggregate只能引用同一parent run驗證過hash的child；不得把舊DEV-067／087證據抄成current PASS。

## 9A. RD Supporting Execution Evidence（不等同固定QA／Independent QC）

2026-08-27同一source state的RD aggregate=`output/qa/dev-101-aggregate/DEV101-AGGREGATE-RD-2026-08-27T10-55-37-882Z/manifest.json`，狀態=`RD_IMPLEMENTATION_READY`、11/11 lanes PASS：contract 22/22、package 15/15、inbox 7/7、repository 5/5、v2 normal owner→submit→list→review browser 28/28、API 5/5、legacy v1 normal-entry browser 16/16、disposable PostgreSQL 10/10、DEV-090 regression、typecheck、affected lint與isolated build 122 static pages全PASS。source hash與primary SQLite fingerprint before=after，foreign-key violations=0，aggregate temp removed=true；task-owned browser ports 60071／52679與PostgreSQL port 56979均已釋放。

v2 browser另證明reviewer以shared editor panel渲染full immutable recognition projection，network ledger對latest/session recognition read為0；package lane證明inner-hash mutant、unresolved owner approve fail-closed、newer different-lineage session不洩漏；PostgreSQL lane證明timestamp canonicalization後JSONB round-trip與concurrent approve exactly-one effect。完整RD收據：`.ai-doc/qc/qc-dev-101-rd-implementation-completion-receipt-2026-08-27.md`。

上述RD supporting evidence仍不換算固定case PASS。其後已由四個獨立runner在同一parent/source下重新執行固定`QA-101-001..048`：data 29/29、rendered browser 23/23、PostgreSQL 2/2、gate 5/5；重疊case依registry取交集後為48/48 PASS、0 FAIL／BLOCKED／NOT_RUN。最終run、child hashes、primary/source invariants與cleanup明細由`.ai-doc/qc/qc-dev-101-independent-qa-qc-closure-2026-08-27.md`保存。

## 10. Completion, Independent QC and Release

Local QA completion candidate條件已滿足：48/48 PASS、0 Blocked／Not Run／Fail、未結P0/P1=0、typecheck／affected lint／isolated build／SQLite與真實disposable PostgreSQL／primary invariants／cleanup全PASS。Independent aggregate只接受同parent/source且通過hash與provenance驗簽的四個child；缺任何runner、case、artifact、正常入口、provider、可見錯誤稽核或cleanup即FAIL。

Production release仍需deployment/release gate、fresh source provenance、flag activation／rollback rehearsal與正式授權；本QA local PASS不等於deploy或release。
