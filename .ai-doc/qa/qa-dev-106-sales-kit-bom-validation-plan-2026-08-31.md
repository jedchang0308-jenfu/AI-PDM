# QA DEV-106：銷售組合包 BOM 驗證計畫

狀態：QA Plan Frozen / DEV Implementation Complete / Full QA-QC PASS 30/30 / PostgreSQL + Real Browser PASS / Production Migration & Release Gated
日期：2026-08-31
Authority：`SPEC-PDM-SALES-KIT-BOM-001-commercial-bundle-structure.md`

## 1. 驗證目標

證明 `sales_kit` 能由正常BOM工作台入口建立、編輯、送審、發布與匯出，同時不放寬manufacturing M圖gate、不新增第二writer、不誤寫primary／production資料。

風險等級：Local implementation為Medium；provider migration與production release另屬High gate。

## 2. Evidence Boundary

- Contract／unit只證明typed contract與pure validation。
- Repository／API證明transaction、idempotency、constraint與持久化。
- DB evidence證明migration、row／hash／FK與provider parity。
- Browser evidence必須由 `/bom/workbench` 正常入口操作，證明可發現性、互動、畫面與destination。
- direct URL只可補充route evidence，不得替代正常入口。
- fixture只建立company、actor、Part、Drawing等前置條件；sales-kit Draft／Released結果必須由受測UI／API delivery path產生。

## 3. Fixture Matrix

| Fixture | Parent／Child | 用途 |
|---|---|---|
| `P-KIT-01` | purchased assembly、無M、Active、無Definition | sales-kit happy path |
| `P-KIT-02` | manufactured assembly、無M、Active、無Definition | manufacturing blocked、sales-kit可選 |
| `P-MFG-01` | manufactured assembly、有primary M | manufacturing regression／purpose choice |
| `P-UNC-01` | unclassified | 導向Part分類 |
| `P-SINGLE-01` | single_part | classification handoff |
| `P-INACTIVE-01` | Obsolete | blocker |
| `P-EXIST-01` | existing open Definition／Draft | open而非duplicate |
| `C-PUR-01` | active purchased Child、無M | 合法Child |
| `C-MFG-01` | active manufactured Child、有M | 合法Child |
| `C-MFG-NOM` | manufactured Child、無M | child readiness negative |
| `C-OTHER-CO` | cross-company Child | scope negative |
| `C-INACTIVE` | inactive Child | lifecycle negative |

Actors：Engineer、R&D Manager、Admin、Manufacturing、Procurement、cross-company Engineer。

## 4. FMEA

| 失效模式 | 可能原因 | 使用者／營運影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|---|
| sales kit被當成製造BOM | consumer忽略purpose | 缺M產品進入製造／技轉 | manufacturing negative query | P0 | QA-106-018、025 |
| 重複建立Definition | picker與Part drawer競爭／idempotency缺口 | 兩份current結構 | concurrent create與DB count | P0 | QA-106-009、010 |
| 重複Child雙倍展開 | line可重複 | 庫存／報價錯誤 | release negative | P0 | QA-106-014 |
| cross-company Child混入 | client filtering被繞過 | 資料洩漏／錯誤組包 | direct negative＋DB delta | P0 | QA-106-013 |
| 無M規則被全域放寬 | purpose matrix寫錯 | 製造安全gate退化 | existing manufacturing regression | P0 | QA-106-003、024 |
| 工作台入口存在但無法完成 | 只做button／direct URL | 使用者卡住 | normal browser journey | P1 | QA-106-019..023 |
| purpose在review/export遺失 | DTO或snapshot未帶欄位 | 核准與下游誤判 | hash／export comparison | P1 | QA-106-016、017 |
| flag off仍外露action | UI與server gate不一致 | 未完成能力被使用 | flag-off browser＋API | P1 | QA-106-026 |
| migration改寫existing BOM | default/backfill錯誤 | 歷史資料漂移 | before/after invariant | P0 | QA-106-001、027 |
| 窄版modal或CTA被遮住 | layout未驗證 | 無法建立／取消 | four viewport browser | P1 | QA-106-023 |

## 5. Planned Cases

### Contract／Migration

| ID | 操作 | PASS |
|---|---|---|
| `QA-106-001` | fresh SQLite／PostgreSQL建立schema | purpose CHECK與default正確，existing schema可啟動 |
| `QA-106-002` | migration apply後立即rerun | second run no-op，row count／IDs／FK不變 |
| `QA-106-003` | eligibility matrix全部組合 | manufacturing與sales-kit結果逐格符合SPEC |
| `QA-106-004` | DTO／snapshot／audit contract scan | purpose在所有required paths存在且typed |
| `QA-106-005` | retired route／writer scan | `/bom/new`、sales-kit POST、second repository caller皆為0 |

### Repository／API

| ID | 操作 | PASS |
|---|---|---|
| `QA-106-006` | 讀create candidates | same-company bounded、action與allowedPurposes正確 |
| `QA-106-007` | unclassified／single／inactive候選 | classify／blocked action正確，無create |
| `QA-106-008` | 建立sales kit | Definition purpose、exact Parent、Draft、effect、audit同交易exactly once |
| `QA-106-009` | same idempotency key replay／different payload | replay同Draft；fingerprint衝突409 zero write |
| `QA-106-010` | 兩個session concurrent create | 一個winner；另一stable open/conflict；current Definition=1 |
| `QA-106-011` | stale ETag／Part分類變更 | 409且zero write，重新整理可恢復 |
| `QA-106-012` | sales kit傳多Parent／非context Parent | 422且Definition／Draft／binding delta=0 |
| `QA-106-013` | cross-company／inactive／missing Child | save或submit fail closed，已輸入合法內容保留 |
| `QA-106-014` | duplicate Child、decimal／zero quantity | release gate拒絕並定位line |
| `QA-106-015` | self cycle與cross-purpose cycle | 409、snapshot與status不變 |
| `QA-106-016` | submit→reject→edit→approve | purpose不變、self-decision拒絕、immutable review hash正確 |
| `QA-106-017` | Released export／where-used | exact Parent／Child／quantity／purpose／explode flag一致 |
| `QA-106-018` | manufacturing readiness／技轉consumer讀sales kit | 不得視為manufacturing BOM；無fallback |

### Browser／UI

| ID | Viewport／actor | 操作 | PASS |
|---|---|---|---|
| `QA-106-019` | 1440 Engineer | BOM工作台Header→從料號建立→搜尋P-KIT-01 | 入口可發現、result action正確、導向exact Part |
| `QA-106-020` | 1440 Engineer | Part drawer建立sales kit→進editor | dialog最小、無Parent複選、URL／purpose／Draft正確 |
| `QA-106-021` | 1440 Engineer | 加Child、改quantity、save、reload、submit | Outliner與持久化正確；不顯示mapping controls |
| `QA-106-022` | 1440 Manager | inbox開review、檢查purpose／diff、approve | purpose清楚且Released可由正常入口取得 |
| `QA-106-023` | 1024／768／390 | picker、dialog、list、Released view與keyboard journey | 無overflow／遮擋／focus trap失效／dead CTA |
| `QA-106-024` | 1440 Engineer | 打開P-MFG-01既有製造流程 | M圖、多Parent、mapping與原行為不退化 |
| `QA-106-025` | Manufacturing／Procurement | 開Released sales kit與manufacturing | 都只讀Released；purpose與export不混淆 |
| `QA-106-026` | flag off | 工作台、Part drawer與direct API | sales-kit action=0；manufacturing正常；無visible error |

### Provider／Aggregate

| ID | 操作 | PASS |
|---|---|---|
| `QA-106-027` | primary invariant before／after isolated build與migration rehearsal | primary schema／identity／master counts／residue／FK完全不變 |
| `QA-106-028` | affected DEV-096 regression | shared manufacturing 88-case或current等價固定gate全部PASS |
| `QA-106-029` | affected DEV-099／104 regression | classification、Part action、structured editor固定gate全部PASS |
| `QA-106-030` | final aggregate | exact 30-case set全PASS、Blocked／Not Run／unexpected visible error=0、cleanup完成 |

## 6. Visible Error與Data Sanity Gate

Browser case只要出現非預期 `role=alert`、HTTP 4xx／5xx、route error、console/page error、required fixture count=0、錯誤empty state或畫面與DB purpose不一致，立即FAIL／reopen。Build、API或另一個fresh session成功不能覆蓋原可見失敗。

## 7. Runtime與資料隔離

實作驗證前必須宣告project、purpose、port、PID tree、cleanup condition、`PDM_DATA_DIR` 與 `PDM_REPOSITORY_DIR` scope。所有schema／mutation／browser fixture使用task-owned isolated paths；開始前與結束後證明primary SQLite schema、canonical identities、migration residue與 `PRAGMA foreign_key_check` 不變。只停止本任務確認過的process tree並確認port released。

## 8. Stop／Pass

- 任一P0 case FAIL：停止aggregate並回送RD。
- 缺provider、normal UI entry、actor、fixture、viewport或primary invariant evidence：`未充分驗證` 或 `Blocked`，不得縮小分母。
- `PASS`：QA-106-001..030同一frozen candidate全PASS，受影響manufacturing regression、provider、UI與cleanup gates全部通過。

## 9. Fixed Runner Allocation

每個case ID只能由一個owner runner產生最終狀態；supporting provider／screenshot／regression evidence可被引用，但不得重複計數。

| Runner | Fixed case IDs | Provider／surface | Output |
|---|---|---|---|
| `scripts/qc-dev-106-migration.mjs` | `001–002` | fresh＋upgraded SQLite、disposable PostgreSQL | `migration/case-results.json` |
| `scripts/qc-dev-106-contract.mjs` | `003–005` | pure matrix、typed/static source inventory | `contract/case-results.json` |
| `scripts/qc-dev-106-repository-runner.mjs` | `006–018` | provider-neutral pure validation contract；作為owner contract evidence | `repository/case-results.json` |
| `scripts/qc-dev-106-postgres.mjs` | supporting `001–018` | task-owned localhost PostgreSQL 052、writer、review、release與company/FK parity；不計重複分母 | `postgres/postgres.json` |
| `scripts/qc-dev-106-browser-real.mjs` | `019–026` | Chromium normal entry、actor、keyboard與四viewport；保存screenshots/network summary | `browser-real/browser.json` |
| `scripts/qc-dev-106-browser.mjs` | supporting scan | static UI source contract；不取代real-browser owner evidence | `browser-static/case-results.json` |
| `scripts/qc-dev-106-aggregate.mjs` | `027–030` | 執行上述owner／supporting runners、nested regressions、exact denominator與cleanup | `manifest.json` |

Supporting raw provider file為`scripts/qc-dev-106-repository.ts`，只輸出`repository/raw-<provider>.json`，不得自行計入case分母。Aggregate若發現case missing、duplicate、unknown、status非PASS或evidence path不存在，`QA-106-030`必須FAIL。

## 10. Fixture Builder Contract

`scripts/dev106-qc-fixture.mjs`只在task-owned data／repository建立前置資料，輸出`fixture/fixture.json`與`fixture/mutation-ledger.json`：

- exact fixture IDs沿用§3，不得以runtime現有資料或模糊搜尋結果代替。
- actor必須分別建立Engineer、R&D Manager、Admin、Manufacturing、Procurement與cross-company Engineer；不得用Admin結果替代其他角色。
- `P-MFG-01`需有active primary M及可完成既有manufacturing流程；`P-KIT-01／02`不得被fixture預先建立sales-kit Definition。
- `P-EXIST-01`可預建existing manufacturing Definition／open Draft，只用於open-not-duplicate oracle。
- cross-purpose cycle前置可seed一份immutable manufacturing Released graph；受測sales-kit Draft／Review／Released必須由正式repository/API/UI route產生。
- ledger每筆至少含`table`、`id`、`operation`、`reason`、`fixtureId`、`provider`；未登錄mutation或primary path命中立即FAIL。
- seed前先證明unmodified source snapshot的master counts、root references、migration residue與global FK invariants；fixture完成後再記錄isolated FK與required count皆非0。

## 11. Package Commands與Environment

### 11.1 Frozen package scripts

~~~json
{
  "migrate:dev-106:dry-run": "node scripts/migrate-dev-106-sales-kit-bom.mjs --mode=dry-run",
  "migrate:dev-106:apply": "node scripts/migrate-dev-106-sales-kit-bom.mjs --mode=apply",
  "migrate:dev-106:postgres": "node scripts/migrate-dev-106-sales-kit-bom.mjs --provider=postgres --mode=rehearsal",
  "qc:dev-106:migration": "node scripts/qc-dev-106-migration.mjs",
  "qc:dev-106:contract": "node scripts/qc-dev-106-contract.mjs",
  "qc:dev-106:repository": "node scripts/qc-dev-106-repository-runner.mjs",
  "qc:dev-106:postgres": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-106-postgres.mjs",
  "qc:dev-106:browser-real": "node scripts/qc-dev-106-browser-real.mjs",
  "qc:dev-106:browser": "node scripts/qc-dev-106-browser.mjs",
  "qc:dev-106": "node scripts/qc-dev-106-aggregate.mjs"
}
~~~

### 11.2 Required environment

| Variable | Contract |
|---|---|
| `DEV106_POSTGRES_DSN` | 本機full runner不讀取；保留作未來外部release gate，不得填入production credential |
| `DEV106_POSTGRES_DISPOSABLE=true` | 本機full runner不依賴；production／外部provider rehearsal仍須獨立明示 |
| `PDM_POSTGRES_BIN` | optional；task-owned local PostgreSQL 18 binaries，預設`C:\Program Files\PostgreSQL\18\bin` |
| `DEV106_EVIDENCE_DIR` | optional；未給時使用`output/qa/dev-106/<runId>` |
| `PDM_DATA_DIR` | runner建立的task-owned isolated data directory |
| `PDM_REPOSITORY_DIR` | runner建立的task-owned isolated repository directory |
| `PDM_DB_PROVIDER` | raw suite由runner設為`sqlite`或`postgres`，不可由使用者輸入混用 |
| `PDM_ASSEMBLY_SHARED_BOM_V1=true` | test-only isolated runtime prerequisite |
| `PDM_BOM_XMIND_EDITOR_V2_ENABLED=true` | test-only isolated runtime prerequisite |
| `PDM_SALES_KIT_BOM_V1_ENABLED=true/false` | browser/API positive與flag-off negative各自明示 |

任一command開始前先輸出runtime declaration；不得從`.env.local`繼承primary DB、known production URL或production credential。`qc-dev-106-postgres.mjs`自建localhost cluster並在finally停止、確認port released後刪除；aggregate只接受其`status=PASS`，不把未連線解讀成PASS。

## 12. Repository／Browser Execution Detail

### 12.1 Repository provider parity

`qc-dev-106-repository-runner.mjs` 以同一case matrix驗證provider-neutral graph contract；`qc-dev-106-postgres.mjs` 再以task-owned PostgreSQL實際執行migration、create/save/review/approve/export與immutable/company/FK checks，raw receipt至少含：

- before／after row counts：Definition、Definition binding、Draft、Draft binding、component、candidate、selection、effect、review、release header、release parent、resolved line、edit event、audit。
- request fingerprint、selection ETag、Definition row version、Draft editor version、review hash、release hash及purpose。
- expected error的HTTP／code／details與transaction delta；所有negative case要求delta=0或只保留case明定的既有Draft輸入。
- concurrency winner／loser與final unique Definition count。
- old schema-v2 manufacturing hash branch、新purpose hash branch、sales-kit legacy-branch rejection。
- transfer projection不得選sales kit、where-used必須選到且帶purpose、change-control reference guard不得漏掉sales kit。

本輪已完成SQLite與PostgreSQL實際provider parity；兩者任一結果不同，owner case FAIL。PostgreSQL evidence只作supporting provider proof，固定owner分母仍由migration／contract／repository／real-browser runner提供。

### 12.2 Browser journeys

- Viewports固定`1440×900`、`1024×768`、`768×1024`、`390×844`。
- `QA-106-019`必須由`/bom/workbench` Header開始；`QA-106-023`需同時覆蓋Header與empty-state同一入口、Modal focus trap／Escape／focus return。
- `QA-106-020`由picker導航到`/parts?detail=cw_<canonicalStateUuid>`，等待server BOM context，再由正常按鈕建立；不得在測試中直接呼叫POST取代點擊。
- `QA-106-021`建立結果需以fresh reload及DB read雙證據驗證；UI顯示成功但資料未寫不得PASS。
- `QA-106-022`由`/approvals?domain=bom`正常inbox開啟；目的標籤、actor與self-decision denial都需可見／可查。
- 每個browser case保存route timeline、viewport screenshot、DOM assertion、network summary、console/page errors與visible `role=alert` inventory。
- 預期negative response需由case whitelist exact method／route／status／code；其他4xx／5xx一律unexpected failure。

## 13. Aggregate與Evidence Manifest

Evidence root固定：`output/qa/dev-106/<runId>/`。至少包含：

~~~text
run-context.json
source-boundary.json
primary-invariant-before.json
fixture/fixture.json
fixture/mutation-ledger.json
migration/case-results.json
contract/case-results.json
repository/case-results.json
postgres/postgres.json
browser-real/browser.json
browser-static/case-results.json
regressions/dev-096/...
regressions/dev-099/...
regressions/dev-104/...
primary-invariant-after.json
cleanup.json
manifest.json
~~~

### 13.1 Per-case required fields

每個`case-results.json`的case至少含：

~~~ts
{
  caseId: `QA-106-${string}`;
  runner: "migration" | "contract" | "repository" | "browser" | "aggregate";
  status: "PASS" | "FAIL" | "BLOCKED" | "NOT_RUN";
  sourceRevision: string;
  dirtyBoundaryHash: string;
  artifactId: string;
  fixtureIds: string[];
  provider: "sqlite" | "postgres" | "both" | "browser" | "static";
  actor: string | null;
  route: string | null;
  viewport: string | null;
  preconditions: unknown[];
  actions: unknown[];
  expected: unknown;
  actual: unknown;
  evidencePaths: string[];
  consoleErrors: unknown[];
  httpFailures: unknown[];
  visibleErrors: unknown[];
  dataSanity: unknown;
  runtimeOwnership: unknown;
  cleanup: unknown;
}
~~~

空的`evidencePaths`、不存在的檔案、source mismatch、required fixture count=0或用同一artifact冒充不同actor／viewport均FAIL。

### 13.2 Aggregate gates

1. source revision、branch與排除generated paths後的dirty-boundary hash在before／after完全一致。
2. primary SQLite schema、canonical root／Part／Drawing identities、master counts、migration residue與`PRAGMA foreign_key_check`完全一致。
3. owner runners合計exact `QA-106-001..030`各一筆；PASS=30、FAIL／Blocked／Not Run／unknown=0。
4. `QA-106-028`引用current-source DEV-096 contract regression；`QA-106-029`引用DEV-099／DEV-104 current contract regressions。歷史完整88／48 gate仍保留於各自authority，不以歷史manifest冒充本輪30案。
5. DEV-104 nested gate中的`typecheck:app`與`build:isolated`可作同一source candidate的工程證據；outer aggregate另跑DEV-106 affected ESLint。不得以歷史manifest取代current run。
6. 所有task-owned browser／Next／worker／PostgreSQL target完成cleanup，port released；只保留evidence。
7. manifest固定`schemaVersion=1`、`devId=DEV-106`、`fixedDenominator=30`、`productionConnected=false`、`productionWrites=false`、`primaryWrites=false`與`completionCandidate`；本輪full aggregate在30/30 PASS後寫入`completionCandidate=true`，仍不代表production release授權。

### 13.3 Affected ESLint boundary

至少涵蓋§19產品檔與全部DEV-106 scripts；特別包含`src/app/api/bom`、`src/app/bom/workbench`、`src/components/bom-*`、`src/components/part-bom-context.tsx`、`src/lib/bom-*`、`src/lib/sales-kit-bom-feature.ts`、`src/lib/repositories/{bom-workbench-async-repository,item-insight-async-repository,approval-platform-async-repository}.ts`與`src/lib/transfer-package-phase1d.ts`。lint有error即aggregate FAIL；warning需逐筆記錄且不得掩蓋為0。

## 14. Execution Receipt與Boundary

2026-08-31 本機執行結果：

- `npm run typecheck:app`：PASS。
- changed-file ESLint：PASS（0 error）。
- `npm run qc:dev-106:migration`：`QA-106-001..002` PASS；task-owned SQLite fresh／apply／rerun與FK check完成。
- `npm run qc:dev-106:contract`：`QA-106-003..005` PASS。
- `npm run qc:dev-106:repository`：`QA-106-006..018` PASS；sales-kit provider-neutral graph contract PASS。
- `npm run qc:dev-106:postgres`：supporting PostgreSQL `QA-106-001..002`、`006..018` 15/15 PASS；task-owned cluster、data、repository與port均清理。
- `npm run qc:dev-106:browser-real`：`QA-106-019..026` 8/8 PASS；Chromium normal entry、drawer、create、editor、Escape/focus與1440／1024／768／390 viewport均通過，console／page／HTTP error為0。
- `npm run qc:dev-106`：固定 `QA-106-001..030` 30/30 PASS，`completionCandidate=true`，並通過DEV-096／099／104 current contract regression；manifest=`output/qa/dev-106/20260831044613157/manifest.json`。
- task-owned資料／repository／暫存runtime已清理；primary資料、正式provider、staging／production、deploy與release均未接觸。

因此目前結論為「DEV-106本機RD實作與QA-QC完成，固定30/30、實際PostgreSQL provider parity與四viewport real-browser均PASS」；production migration／activation／deploy／release仍保持獨立gate，本機`completionCandidate=true`不等於正式上線核准。

## 14. DEV-109 Successor Case Disposition（2026-08-31）

DEV-109的舊domain／DB／writer與normal-entry functional baseline曾完成48／48；2026-08-31使用者field畫面重開的visual layer完成60／60，但兩者都是舊purpose runtime的immutable historical evidence。Current unified domain以主SPEC §33與`output/qa/dev-109-unified/2026-08-31T19-13-51-837Z/aggregate.json`的54／54為準；不得改寫既有manifest或把本文件當成DEV-109 current completion證據。

- `QA-106-019..025`凍結為pre-DEV-109 UI歷史案例。DEV-109切換入口後不再以舊Modal操作重跑，也不得因current source不符合舊UI expectation而縮小或改寫歷史分母。
- `QA-106-001..018`的migration、purpose、graph、writer、review／release domain證據仍是回歸authority；DEV-109 aggregate以current source重跑未被successor取代的contract／repository assertions或等價nested gate。
- `QA-106-026`的sales-kit fixed-child／no-Parent-mapping意圖由DEV-104 current contract與`QA-109-036／045／046`承接；DEV-109不得恢復sales-kit Parent mapping。
- `QA-106-027..030`中primary isolation、DEV-096／099／104 regression與fixed denominator責任，由`QA-109-045..048`重新產生current source evidence。
- `npm run qc:dev-106`保留為DEV-106歷史completion aggregate，不列為DEV-109 current completion command；DEV-109唯一current aggregate為`npm run qc:dev-109`。

DEV-109 historical 48案與舊60案仍只支持舊流程回歸。Current completion改依target SPEC §33固定54案，已由`output/qa/dev-109-unified/2026-08-31T19-13-51-837Z/aggregate.json`完成54／54；這不改寫DEV-106既有PASS事實，也不把任何本機PASS升格為production release。
