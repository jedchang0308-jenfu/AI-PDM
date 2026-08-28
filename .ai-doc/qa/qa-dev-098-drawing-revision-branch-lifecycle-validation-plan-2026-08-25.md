# QA-DEV-098：圖面版次與研發分支生命週期固定驗證計畫

Status：`Fixed QA Plan / Local RD-QA-QC Complete / 31 of 31 PASS / Production Release Gated`

Date：2026-08-25

DEV：`DEV-098`

Authority：

- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001-unified-revision-and-branch-flow.md`
- `.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001-bounded-manual-minor-and-stale-freeze.md`
- Parent regression：`DEV-087` canonical Drawing branch／claim／work與`DEV-050` minor release gate

Current execution disposition（2026-08-28）：`npm run qc:dev-098` fresh aggregate已完成`QA-098-001..031`
31/31 PASS、9/9 commands、4/4 child manifests、P0/P1=0與`completionCandidate=true`；manifest=
`output/qa/dev-098/DEV098-aggregate-2026-08-28T03-13-36-449Z/manifest.json`。Repository、normal-path browser、
disposable PostgreSQL、affected DEV-087 regression、typecheck／lint／isolated build與cleanup／primary invariant均已執行；
未執行production migration、deploy、traffic或release。

## 0. Plan authority與責任邊界

本文件是DEV-098 Current Phase的固定QA分母。`QA-098-001..031`只有實際執行並保存本文件要求的evidence才能計PASS；
文件建立、build、typecheck、RD自述、direct SQL造出期望結果、舊DEV-087 PASS或未執行案例都不能算分子。

角色固定：

- Dev PM：維護scope、trace、stop／release gate；不替RD或QC宣稱PASS。
- RD：依SPEC §15實作、執行self-test、修正產品缺陷並交付dirty boundary／runner／raw evidence。
- QA：維護本計畫與case definition，不在看到實作結果後降低expected或刪除fail-seeking case。
- QC：由同一位開發者在RD與QA工作完成後切換角色，從正常UI入口與raw DB／network ledger重算結論；不要求獨立人員或防作弊收據，oracle仍不得import產品target resolver、service或repository來取代primitive expected。

Risk：`High / P0`。Full local QA completion要求31/31 PASS、P0/P1 defect=0、required regression PASS、cleanup完整；
`QA-098-031`必須使用explicit disposable PostgreSQL，缺provider只能`BLOCKED_FOR_PROVIDER`，不得以SQLite替代。production另走
deployment/release gate與fresh release provenance。

## 1. Scope與明確不測範圍

Current scope：

- server推薦＋同主版次bounded manual minor。
- stale branch freeze、active owner／review收斂、從current production重新開始與pre-production `0.x → 1`。
- global tuple claim、branch cap、row version、idempotency與policy evidence。
- 單一進版dialog、單一primary action、no-flash、錯誤恢復、角色／RWD／keyboard。
- minor里程碑、major量產採用詞彙及DEV-087 affected regression。

Out of scope：真正CAD／BOM／file merge、canonical history backfill、manual major、跨major minor、Part／BOM revision政策、
production migration／repair、deploy、release、Cloud SQL正式資料與實體檔案GC。

### 1.1 FMEA風險表

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| production前進後owner仍可編輯／送審，或basis-read後仍寫入 | stale只在target GET驗證，或guard位於transaction外 | 舊基準內容／檔案／辨識決策繼續流入審核 | promotion後direct測試＋basis-read/write間插入major adoption | P0 | `QA-098-027`驗aggregate-first、zero write、唯讀與cancel cleanup |
| pending review在stale後仍可核准 | approve只驗snapshot、不重驗basis | 產生舊基準受控里程碑或錯誤production | 兩branch ordered approval ledger | P0 | `QA-098-028`要求approve 409、return後cancel |
| system／blocked未收斂時其他branch先推production | major adoption未檢查其他open handling | retry把舊basis寫入或branch永久卡住 | system fault profile後嘗試major adoption | P0 | major transaction回`DRAWING_FORMALIZATION_PENDING`、production不變 |
| PostgreSQL鎖nullable outer join或鎖序不一致 | 沿用source LEFT JOIN `FOR UPDATE OF branch` | runtime SQL error、deadlock或雙winner | disposable PostgreSQL timing／lock ledger | P0 | `QA-098-031`固定aggregate-first與separate branch lock |
| pre-production null basis被猜成production 0 | resolver沒有明定base/current皆null | 錯誤major、假production或minor Released | `D-D` primitive oracle與`0.x → 1`approval | P0 | `QA-098-030`驗canonical null basis與first production |
| manual request跨major／重用claim | client major被信任或validator分叉 | revision lineage破壞 | malformed body、occupied tuple與concurrency | P0 | 002／003／008／009 fail closed |
| production candidate token沿用可預測fallback secret | token helper未對齊canonical production secret gate | 可偽造target request、繞過候選完整性 | production-like env移除三個secret後嘗試sign | P0 | 004必須拒絕簽發且zero write |
| formalize覆寫target policy evidence | JSON整包覆寫 | 無法追溯版次選擇依據 | policy before／after與mutant | P1 | 015 read-merge-write |
| stale列仍先顯示進版或race recovery重載預覽 | projection沒有basis、共用全頁loading | 使用者誤判且2D／3D閃白 | stale initial projection＋post-load race兩路徑 | P1 | `QA-098-020／024／029`驗action、DOM key與scroll |

## 2. Stable fixtures與mutation boundary

### 2.1 Fixture identities

每次run以task-owned temp SQLite建立下列primitive fixture；ID可隨run產生，但logical aliases與tuples固定：

| Alias | State |
|---|---|
| `D-A` | production `1`、open branch `A` latest `1.2`、open branch `B` latest `1.4`、各有approved claim／artifact |
| `D-B` | production `1`、零open branch，供branch cap與manual first branch |
| `D-C` | production `2`、stale open branch base revision `1` latest `1.2`、current production row idle |
| `D-D` | 無production row；open branch base=`null`、latest approved `0.1`，可建立`0.x`並採用第一個production `1`，minor永不Released |
| `D-E` | production `1`、三條open branch，供第四branch fail closed |
| `D-F` | 與`D-A`相同但屬另一company，供scope negative |

Actors：

- `owner-rd`：same company，具view、workspace create/update/cancel與submit。
- `reviewer`：same company，exact reviewer且具decide，不與owner相同。
- `viewer`：same company，只有view，沒有create。
- `foreign-rd`：另一company，具其公司權限但不可存取`D-A`。

### 2.2 Seed限制

- 只可seedcase前置資料：production、approved RD milestone、claims、branch、canonical state、files與必要actor。
- 成功create、stale recovery、collision結果、核准結果與policy snapshot不得預先seed後宣稱journey完成。
- Browser成功mutation必須由rendered UI action發起，並以network initiator、correlation、command receipt與DB delta一對一追溯。
- Repository lane可呼叫public service／repository測交易，但expected tuple、stale與policy oracle只從fixture primitive values重算。
- 所有fixture mutation寫入ledger；primary DB與primary repository一律read-only fingerprint，測試前後必須相同。

## 3. Fixed case registry

### 3.1 Contract／API：QA-098-001..005

| Case ID | Setup／normal path | Expected | Required evidence |
|---|---|---|---|
| `QA-098-001` | 對`D-A` production與RD idle source呼叫targets service／GET | response含exact source、`kind=rd/production`、RD推薦、`manualMinorRule`與v2 token；major／minimum由server basis計算 | redacted response、primitive tuple oracle、token decoded non-secret fields |
| `QA-098-002` | 依recommended與manual兩種合法body進parser | 只接受兩個exact shapes；selection mode必填；route不以`String()`吞型別 | parser result、source scan、request fixtures |
| `QA-098-003` | manual body分別夾帶`major/revision/target/candidateToken`，或用string／0／負數／小數／超上限 | 全部`DRAWING_MANUAL_MINOR_INVALID` 422、DB delta=0 | error envelope、before-after counts／hash |
| `QA-098-004` | v1、過期、改actor、改company、改Drawing、改row／version、改target、壞signature token；production-like env移除三個canonical secrets後嘗試sign | 變造／過期token全部409重新取候選；production缺secret固定`PDM_WORKBENCH_CONTRACT_SECRET_REQUIRED`且不簽token；無claim／revision／work | token mutation table、env-isolated sign result、stable errors、zero delta |
| `QA-098-005` | viewer／foreign-rd direct GET／POST與same-company owner | permission／company boundary server-side生效；viewer POST 403，foreign不得取得target detail或寫入 | paired role responses、no internal ID leak、DB delta |

### 3.2 Repository／transaction：QA-098-006..016

| Case ID | Setup／action | Expected | Required evidence |
|---|---|---|---|
| `QA-098-006` | `D-B` production 1採server RD推薦 | 建立first branch與target `1.1`；predecessor=production revision；全套rows同transaction | branch／claim／revision／work／state／file snapshot ledger |
| `QA-098-007` | `D-A` branch A latest 1.2手動輸入5 | 允許跳號建立`1.5`；major不可由input改變；predecessor=1.2 exact revision | normalized request、claim tuple、predecessor、result |
| `QA-098-008` | branch A輸入1、2與已被branch B占用的4 | 1／2為`DRAWING_MANUAL_MINOR_NOT_FORWARD`，4為`DRAWING_TARGET_REVISION_CLAIMED`；三者zero business write | stable code、raw counts與orphan scan |
| `QA-098-009` | 兩個actor／tab同時手動claim `D-B 1.7` | exactly one winner；loser 409；open count只+1，無orphan branch／revision／work | timing ledger、two receipts、tuple unique readback、FK |
| `QA-098-010` | `D-E`從production以recommended與manual各嘗試第四branch | `DRAWING_RD_BRANCH_LIMIT_REACHED`；open count仍3，zero branch／claim／work | locked aggregate before-after、error envelope |
| `QA-098-011` | `D-C` stale 1.2取target並direct POST recommended／manual | GET零candidate、manual disabled；POST兩mode皆`DRAWING_PRODUCTION_BASE_STALE`，絕無`1.3/2.3` | response、claim inventory、forbidden-label scan |
| `QA-098-012` | stale candidate取得後或正常candidate取得後，另一transaction先推production／改row version | 舊token／request 409、zero write，不自動換target或導向別人work | ordered fault ledger、before-after rows、first failure |
| `QA-098-013` | manual create成功後以同idempotency key同request重試，再改minor重試 | 同request回同work；改minor為`IDEMPOTENCY_KEY_REUSED`；只有一套business rows | receipt request hash／effect key、row counts |
| `QA-098-014` | 在claim／revision／work-file／canonical state各named checkpoint注入失敗 | 每一checkpoint完整rollback，沒有orphan且open count不漂移 | fault matrix、transaction delta、global FK |
| `QA-098-015` | create recommended/manual後讀policy；核准時merge changeImpact；另核准deployment前legacy `{}` work | 新work保存typed target policy且formalize不覆寫；legacy只加changeImpact、不猜造target policy | policy JSON before／after、claim／lifecycle readback |
| `QA-098-016` | minor核准、major採用、取消未核准manual、approved claim mutation／reuse；另讓其他branch停在`system／system_admin／blocked`後嘗試major採用 | minor=`rd_controlled`且production不變；major只在current base且無未收斂formalization時切換；未收斂時`DRAWING_FORMALIZATION_PENDING`且production不變；cancel釋放未核准claim；approved claim不可改刪重用 | state transition ledger、history、immutability errors、formalization handling matrix、artifact count |

### 3.3 Browser／visible path：QA-098-017..024

| Case ID | Rendered journey | Expected | Required evidence |
|---|---|---|---|
| `QA-098-017` | `/numbering/drawings`→D-B drawer→進版 | compact dialog可發現；預設RD推薦；radio不mutation；只有一個`建立進版工作`primary | start-to-dialog screenshot、DOM controls、network=no POST before primary |
| `QA-098-018` | 切`自訂研發小版`，輸入7，送出 | 只可編suffix；major為read-only text；request只含source/mode/minor；成功導向exact workspace 1.7 | interaction trace、request body、URL、DB tuple／policy |
| `QA-098-019` | 輸入`05`、空白、0、超上限，再以direct malformed request觸發server error | client就地提示；server error可見；mode／input／drawer／preview保留，不reload或閃白 | before-after preview DOM key／bounding box／scroll、network、screenshot |
| `QA-098-020` | D-C stale row→進版 | 不顯candidate radio／minor；只顯`量產基準已更新`與recovery；點recovery後載current production正常targets | screenshots、two GETs、zero POST before final primary、source revisions |
| `QA-098-021` | 完成QA-098-020並從current production建立新branch | new predecessor=current production 2；不複製stale payload／work／base，不出現`2.3`或merge文案 | UI route、new branch DB readback、payload diff primitive ledger |
| `QA-098-022` | 選production candidate並走owner送審→exact reviewer核准→回工作臺／history | 所有visible action稱`採用為量產版`；核准前不顯示已量產；核准後production才切換 | owner/reviewer screenshots、correlation chain、state/history readback |
| `QA-098-023` | viewer UI與direct POST、foreign-rd direct request | viewer無create control且direct 403；foreign無cross-company data/write；UI hidden不作唯一權限證據 | paired-role UI、403/404、DB zero delta |
| `QA-098-024` | 1440／1024／390，mouse＋keyboard開關dialog、切mode、輸入、error、stale recovery | 無水平overflow／重疊／截斷；focus trap、Escape restore；console/pageerror/requestfailed與unexpected 4xx/5xx=0 | viewport PNG、geometry JSON、focus trace、console/network logs |

### 3.4 Regression／integrity：QA-098-025..026

| Case ID | Gate | Expected | Required evidence |
|---|---|---|---|
| `QA-098-025` | DEV-087 affected commands／contract／UI selector regression＋typecheck | explicit recommended mode後parent branch/cancel/review仍PASS；原DEV-087 case IDs與分母不被DEV-098偷偷重鍵或縮減 | command outputs、case registry diff、typecheck log |
| `QA-098-026` | isolated build、schema-none guard、source/primary invariant、child-manifest與cleanup | build走task-owned isolated dirs；schema files／migration history無DEV-098 delta；required child manifests可驗hash且未缺漏；primary before=after；ports released | build manifest、git diff、primary fingerprints、child hash inventory／cleanup receipt |

### 3.5 Readiness closure：QA-098-027..031

| Case ID | Setup／normal path | Expected | Required evidence |
|---|---|---|---|
| `QA-098-027` | `D-A` branch A建立owner work／已受理recognition session後，由branch B採用production 2；owner再GET／PATCH／upload／recognition create／decision／rerun／formalize／submit／cancel，另在file／recognition basis-read與write間安排major adoption並讓既有extract completion回報 | workspace原內容／preview保留但轉唯讀；PATCH／file／四種recognition user mutation／submit皆`DRAWING_PRODUCTION_BASE_STALE` 409 zero write；ordered race由aggregate-first序列化且後手依新basis拒絕；既有extract只可保存evidence且不回寫work／formalize；cancel成功並依approved milestone正確保留branch/history與釋放work claim | lock／timing ledger、before-after work／claim／branch／file／storage／recognition ledger、UI readonly screenshot、network correlation、cancel receipt |
| `QA-098-028` | branch A work送審pending後，由branch B採用production 2；reviewer依序嘗試approve與return，owner再cancel | approve在begin system前409，revision不controlled、production不變於2；return成功回owner但仍唯讀，owner只可cancel；review trace與files保留 | handling／review request／revision lifecycle ordered ledger、reviewer與owner UI、zero formalize evidence |
| `QA-098-029` | D-C在首次清單載入時已stale，再測清單載入後才被另一branch推production的race | 初始stale row不顯示`進版`，直接提供restart／合法void；race中既有dialog就地切stale recovery，第二GET替換source且preview／scroll不remount | initial action DTO／DOM、two-path screenshots、GET ledger、preview DOM key／bounding box／scroll |
| `QA-098-030` | D-D從0.1手動建立0.3並核准，再建立server major 1送審核准；另注入base非null、source major非0與期間出現production | 0.3=`rd_controlled`且無production；1核准後才建立唯一released production；三種非法／競態basis皆409 zero write，不出現假production 0 | primitive tuple oracle、basis projection、policy／predecessor、approval ledger、invalid matrix |
| `QA-098-031` | explicit task-owned disposable PostgreSQL執行production-source create、同target雙actor、minor approve與major approve競爭、file／recognition basis-read vs major adoption，並掃描執行計畫／錯誤 | aggregate永遠先鎖、branch以獨立non-outer query鎖；file／recognition後手依新basis拒絕；無nullable-side lock error、deadlock、雙winner或provider-specific結果；SQLite同fixture語意相同 | provider／schema hash、SQL／timing ledger、ordered barriers、two receipts、storage／row counts、first failure、cleanup receipt |

## 4. Requirement traceability

| SPEC AC | Cases |
|---|---|
| AC-01 single canonical UI path | 017、018、022、025 |
| AC-02 production／branch projection | 006、010、016、025、029、030 |
| AC-03 server recommendation＋bounded manual minor | 001..003、006..009、013、017..019 |
| AC-04 stale target freeze／restart | 004、011、012、020、021、029 |
| AC-05 minor milestone／major adoption | 015、016、022、028、030 |
| AC-06 cancel／void／promotion retention | 014..016、021、027、028 |
| AC-07 target concurrency／fourth branch | 009、010、012、014、031 |
| AC-08 shared claim／transaction／permission authority | 002、003、006..009、013、018、023 |
| AC-09 stale in-flight UI／API／DB freeze | 004、011、012、027..029 |
| AC-10 no fake merge vocabulary | 022、024 |
| AC-11 visible states／RWD／reachable primary | 017..024、027..029 |
| AC-12 pre-production `0.x → 1` | 030 |
| AC-13 provider parity／schema-none | 025、026、031 |

所有SPEC AC 1..13皆有explicit case mapping。任何AC變更必須先更新本trace與case definition hash，不可只改runner expected。

## 5. Runner與command contract

預定檔案：

- `scripts/qc-dev-098-contract.mjs`：001..005。
- `scripts/qc-dev-098-repository.mjs`：006..016、027、028、030；使用`--experimental-transform-types`與現有path loader。
- `scripts/qc-dev-098-browser.mjs`：017..024、029；沿用`qc-next-app-runner.mjs`的task-owned process helper。
- `scripts/qc-dev-098-postgres.mjs`：031；只接受explicit task-owned disposable PostgreSQL config，不fallback到default／primary。
- `scripts/qc-dev-098-aggregate.mjs`：025..026、child manifest hash與完整gate。

`package.json`固定命令：

```json
{
  "qc:dev-098:contract": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-098-contract.mjs",
  "qc:dev-098:repository": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-098-repository.mjs",
  "qc:dev-098:browser": "node scripts/qc-dev-098-browser.mjs",
  "qc:dev-098:postgres": "node scripts/qc-dev-098-postgres.mjs",
  "qc:dev-098": "node scripts/qc-dev-098-aggregate.mjs"
}
```

禁止建立永遠PASS的placeholder、空alias、把`--allow-open`當完成、或由aggregate自行產生缺少的child manifest。

## 6. Browser runtime declaration與cleanup

每次browser run在啟動前寫入manifest：

- project：`AI_PDM`。
- purpose：`DEV-098 browser QA`。
- port：由`getFreePort()`配置，記錄實際值；不得占用／停止localhost:3000既有runtime。
- owning process tree：`startNextApp()`回傳的exact PID tree。
- cleanup condition：所有cases完成、first failure或timeout即進finally。
- `PDM_DATA_DIR`：`<task-temp>/data`。
- `PDM_REPOSITORY_DIR`：`<task-temp>/repository`。
- mutation scope：只限上述temp與`output/qa/dev-098/<run-id>` evidence。

finally只停止該PID tree、關閉browser、確認port拒絕連線並移除task temp；cleanup failure使`QA-098-026=FAIL`，不得以產品case
PASS掩蓋。source DB／repository在fixture seed前必須通過master count、canonical root reference、migration residue與
`PRAGMA foreign_key_check`；run後重算同一fingerprint。

## 7. Provider、schema與migration gate

- DEV-098 schema classification=`none`；`db/schema.sql`、`db/postgres/*.sql`與`src/lib/db.ts`應無DEV-098產品delta。
- SQLite repository lane為RD self-test mandatory。`QA-098-031`的disposable PostgreSQL execution為full QA completion mandatory；若
  沒有explicit disposable connection，只能記`BLOCKED_FOR_PROVIDER`，不得連primary、不得把SQLite PASS推論成PostgreSQL PASS，
  也不得讓aggregate或098-C完成。產品實作仍可停在`RD Implemented / Awaiting Provider QA`，production release另需fresh evidence。
- 靜態provider parity至少驗existing target tuple unique constraint、canonical label guard、approved claim immutability與policy JSON
  provider type仍存在。
- 不建立migration script、不修改migration history、不backfill selection evidence。任何實作發現需要DDL時，本plan失效並回SPEC重審。

## 8. Independent oracle與anti-cheat

QC expected只從下列primitive輸入計算：current production tuple／revision ID、source tuple／revision ID、branch base revision ID、
claimed tuple set、open branch count、requested suffix與actor grants。不得import：

- `drawing-revision-target-contract.ts`
- `drawing-revision-target-token.server.ts`
- `drawing-revision-lifecycle-policy.ts`
- `drawing-revision-work.ts`
- `drawing-revision-work-async-repository.ts`
- DEV-098 child runner的expected/result helper

至少注入下列mutants並證明對應case會FAIL：

| Mutant | Must be caught by |
|---|---|
| current production major＋stale source suffix產生`2.3` | 011、020、021 |
| manual request可帶major | 002、003、018 |
| production缺secret仍以固定fallback簽candidate token | 004 |
| `requestedMinor === predecessorMinor`被接受 | 008 |
| formalize把policy snapshot覆寫成只有changeImpact | 015 |
| 同target出現兩winner | 009 |
| invalid／stale error觸發workbench reload造成preview remount | 019、020、024 |
| UI顯示`merge／合併`但沒有內容apply | 022、024 |
| missing cleanup receipt仍被aggregate算PASS | 026 |
| stale owner仍可PATCH／file／recognition user mutation／submit，或reviewer仍可approve | 027、028 |
| file／recognition guard在transaction外，basis-read後仍可被major adoption穿越 | 027、031 |
| 其他branch仍在`system／system_admin／blocked`時major採用仍切換production | 016 |
| 初始stale row仍顯示`進版`且只能點後才發現 | 029 |
| null basis被當成假production 0或第一個major不是1 | 030 |
| aggregate不是第一鎖或對nullable branch outer join加`FOR UPDATE` | 031 |

Mutant可在test-only fault profile或synthetic manifest執行；不得把mutant寫入production code或primary data。

## 9. Evidence manifest最低欄位

每個child manifest至少包含：

```text
schemaVersion, runId, sourceCommitOrDirtyBoundary, targetFileHashes,
caseId, definitionHash, status, firstFailure,
provider, schemaHash, fixtureOrigin, fixtureMutationLedger,
actor, route, viewport, requestCorrelationIds,
assertions, rawArtifacts, prohibitedMutationAudit,
primaryInvariantBefore, primaryInvariantAfter,
runtimeDeclaration, cleanupReceipt
```

Evidence不得包含auth secret、raw candidate signature、未遮罩cookie或正式檔案內容。token只保存非秘密payload欄位與整體hash。

## 10. Pass／fail／blocked與缺陷分級

- PASS：case全部expected成立、required evidence可讀且hash一致、無違規mutation。
- FAIL：任何產品／runner／evidence／cleanup assertion不成立；保留first failure，不覆寫後只留成功run。
- BLOCKED：只有缺外部disposable PostgreSQL或明確環境能力時可用；不計PASS，不得用來關閉local required case。
- SKIP：本固定分母不允許。

Severity：

- P0：跨major／stale寫入、minor Released、兩winner、production pointer錯置、跨公司寫入、partial transaction或資料遺失。
- P1：manual guard可繞過、policy evidence遺失、正常入口不可完成、preview反覆閃白、stale無恢復、重大a11y／RWD阻斷。
- P2：不影響正確性與完成路徑的文案／視覺瑕疵。

Full local QA completion：`31/31 PASS + P0/P1=0 + QA-098-025 parent regression PASS + QA-098-026 cleanup/invariant PASS + QA-098-031 PostgreSQL PASS`。

## 11. Stop conditions

以下任一成立立即停止執行並回Dev PM／使用者：

- 需求被解讀為完整revision／manual major／跨major／stale續作／minor Released／真正merge。
- 實作需要schema、migration、history backfill、production repair、Cloud SQL primary access或正式deployment。
- source snapshot不通過master／root／residue／FK invariant，或fixture只能靠修改primary建立。
- direct相關dirty hunk無法與其他DEV安全分離。
- runner為了通過而修改case ID、expected、fixture終態或忽略unexpected 4xx／5xx／console error。
- stale in-flight未定義return／cancel收斂、pre-production依賴假production，或PostgreSQL runner嘗試fallback到primary／default DB。
- task-owned process tree／port／temp path不能被精確辨識或安全清理。

## 12. Current execution record

- QA plan：Fixed。
- RD implementation：Complete；shared strict parser、server-only token、typed target policy、repository／UI／provider guards均納入fixed aggregate。
- QA execution：`QA-098-001..031` 31/31 PASS；P0/P1=0。
- QC：同人序列式可信任QC完成；不要求Independent QC人員或anti-cheat receipt。
- Schema／migration：None／Not Required。
- Production mutation／deploy／release：Not Authorized／Not Performed。
- Current parent：`output/qa/dev-098/DEV098-aggregate-2026-08-28T03-13-36-449Z/manifest.json`；`31 / 31 PASS`、`completionCandidate=true`、primary protected invariant unchanged、cleanup PASS。
