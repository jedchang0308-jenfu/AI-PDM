# QA-DEV-113：料號工作台唯讀抽屜與單一維護入口驗證計畫

Status：`DEV-113-E Local RD Implemented / RD Tech Lead Corrections Closed / P0-P1 Planning Gap 0 / Human Confirmed / Full QA-QC Passed 28/28 / Prior 28/28 Baseline Retained / Production Release Gated`

Date：2026-09-01
Owner：QA（plan）／RD（automation＋evidence）／QC（independent disposition）
DEV：`DEV-113 / DEV-PDM-PART-WORKBENCH-SINGLE-EDIT-ENTRY-001`
Risk：`P1 / Medium`
Authority：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`的DEV-113-E Local RD Implemented amendment
Relation placement：`.ai-doc/specs/SPEC-PDM-INLINE-RELATION-MATRIX-001-direct-formal-edit.md`的DEV-113-E immediate activation amendment

## 1. 目的與不可替代證據

本計畫驗證以下結果，而不是只驗證元件存在：

1. Part drawer body不再承擔任何料號欄位、preview、classification、relation或attachment編輯，是`readonly data surface / zero inline-data mutation`；五秒內只能辨識一個主要維護CTA。
2. `取消本次工作／申請作廢`仍是視覺分離、server-derived的生命週期secondary，不被刪除或誤當第二個編輯入口。
3. `/parts/[partId]/workspace`以`料號資料／即時維護／BOM`成為唯一維護context；不同domain仍依原transaction／review／audit authority生效。
4. `即時維護`是edit-ready context：Part relation沒有第二層`編輯關聯`，但進頁zero mutation、首次cell change只產生local draft、明確save才正式寫入；Drawing drawer仍為explicit view→edit。
5. DEV-108 autosave／submit、DEV-101 immutable reviewer、DEV-090 formal relation、preview、structure classification、attachments與BOM workbench沒有權限、競態、readback或safe-return回歸；root-wide matrix／relation與exact source Part maintenance scope不混淆。

Static source、設計PNG、DOM screenshot或歷史DEV PASS只能作輔助；writer成功必須有API／receipt／DB readback，normal readonly journey的zero mutation必須有network trace與before/after invariant，browser完成必須有實際viewport／focus／history證據。

## 2. Fixed denominator與狀態規則

唯一current denominator=`28`：

| Runner | Cases | 分母 |
|---|---|---:|
| `qc:dev-113:contract` | `C01～C08` | 8 |
| `qc:dev-113:integration` | `R01～R04` | 4 |
| `qc:dev-113:browser-real` | `B01～B12` | 12 |
| `qc:dev-113` aggregate | `G01～G04` | 4 |
| Total | `C+R+B+G` | 28 |

- `PASS`：oracle與evidence完整。
- `FAIL`：實際結果不符或出現unexpected mutation／authority drift。
- `BLOCKED`：環境或必要fixture不可用；仍留在分母。
- `NOT_RUN`：尚未執行；仍留在分母。
- missing case、重複ID、candidate fingerprint不一致、runner非零exit或child manifest遺失，aggregate一律FAIL。
- 目前113-E狀態=`28/28 PASS`。修正前DEV-113 aggregate與browser evidence只作historical baseline；本次由同一candidate重新執行C01～C08、R01～R04、B01～B12、G01～G04，未挪用歷史分子。

### 2.1 2026-09-01 DEV-113-E evidence correction（closed）

本節記錄修正前的證據完整性缺口；已由本計畫 current receipt 關閉，不再代表目前分數。

Source audit確認現行`scripts/qc-dev-113-browser-real.mjs`雖輸出`denominator:12`，實際只有一條管理員Part workspace三頁籤smoke：沒有Part drawer各state、data edit／submit、dirty conflict、preview／classification mutation、attachment journey、完整BOM/history，也沒有真實Drawing×Part relation draft／取消／儲存／response-loss／stale recovery／Drawing explicit regression。舊report沒有B01～B12逐案record、named assertions、network/readback ledger或case artifact mapping，因此整個browser 12案與舊28/28 receipt都不能證明current contract。

- Corrective action（closed）：當時撤回「新契約已完成」的推論並將current numerator歸零；保留舊receipt與截圖，但只標示為pre-113-E historical baseline，後續已在同一candidate重建並取得28/28。
- Preventive control：不增加人工分母，重建同一runner的B01～B12 named registry；每案必須執行自己的前置狀態、journey與assertions，manifest列出expected/actual mutation count、trace、readback與artifact。禁止跑一條journey後複製12個PASS。B09若缺任一capability／draft／cancel／same-key response-loss／save/readback／stale recovery／Drawing explicit步驟，case FAIL；aggregate若缺任一子證據，G04 FAIL。
- Routing：修正在同一DEV、同一QA plan與同一runner完成，不建立新DEV、skill或release gate；這是驗證完整性控制點，不擴張產品scope。

## 3. Runtime、資料與Git邊界

每個可能啟動runtime或寫資料的runner，在開始前必須把下列欄位寫入stdout與manifest：

```json
{
  "project": "C:\\VIBE CODING\\AI_PDM",
  "purpose": "DEV-113 <runner purpose>",
  "port": "task-owned exact port or null",
  "owningProcessTree": "runner -> exact child processes",
  "cleanupCondition": "after assertions/evidence; stop only task-owned tree",
  "PDM_DATA_DIR": "task-owned isolated absolute path or null",
  "PDM_REPOSITORY_DIR": "task-owned isolated absolute path or null",
  "mutationScope": "task-owned fixture/evidence paths only"
}
```

1. 禁止使用primary DB seed／clean作fixture。需要schema initialization或data mutation時，必須使用task-owned isolated `PDM_DATA_DIR`與`PDM_REPOSITORY_DIR`。
2. Fixture只能在unmodified source snapshot通過master count、root reference、migration residue與global FK invariants後建立；保存fixture mutation ledger。
3. Build前後記錄primary SQLite schema hash、canonical root／Part／Drawing identities、migration residue與`PRAGMA foreign_key_check`；任何變動G02 FAIL。
4. Browser runner只停止自己啟動且PID／command line／port都已驗證的process tree；完成後確認port released。禁止終止所有`node.exe`或清除未知port。
5. Candidate fingerprint至少包含branch、HEAD、113-E exact 6個product＋3個runner working SHA、package-lock hash與runner source hash。修正前16 modify＋7 add inventory保留為historical baseline，不是current candidate boundary；aggregate所有child fingerprint必須相同。

## 4. Fixture registry

所有資料建立於一次性fixture company，不得使用production/shared identity：

| Fixture | Actor／state | Purpose |
|---|---|---|
| `P-FORMAL` | Part formal、無work、owner具create/update | `編輯料號`、optional obsolete secondary |
| `P-OWNER` | exact actor active owner work、可update/cancel | `繼續編輯`、取消secondary、matrix autosave |
| `P-REVIEW` | active review；一名exact reviewer、一名other actor | immutable review與非assigned fail closed |
| `P-BLOCKED` | blocked／system／terminal各一 | zero primary CTA與原因 |
| `P-NOPERM` | same-company reader無mutation permissions | readonly/no fake CTA |
| `P-ROOT-MULTI` | 同root 2～3 Parts、Drawing×Part relation、preview、classification、attachments、BOM context | three tabs與domain writers |
| `P-CROSS` | 第二公司Part／asset／rowKey | cross-company 404/403與zero leak |
| `P-CONFLICT` | two clients／stale rowVersion／stale ETag | autosave、relation、classification conflict |

Fixture ledger保存每筆canonical state、Part work、review request、relation cell、preview setting、classification、attachment、BOM ID及before/after hash。生命週期／writer positive cases只能改task fixture，結束後由整個task root清除，不得嘗試回滾primary。

### 4.1 DEV-113-E FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／建議測試 |
|---|---|---|---|---|---|
| 有合法work卻relation唯讀，或reviewer被解鎖 | 把已移除的`edit_relation_matrix`或client role當capability | 無法工作或越權假入口 | C07、B03、B09 exact row actions | P1 | 只接受active Part row exact `key="edit"`；其餘action fail closed |
| 進頁即寫入或無dirty常駐save | immediate被誤作autosave／editing=true | 非預期正式關聯變更、介面噪音 | B09 load network trace、未dirty screenshot | P0 | load mutation=0；normal dock只在dirty |
| response-loss後換新key | client每次click產生UUID | 已成功卻顯示stale，可能形成第二logical command | C08、R04、B09 header/receipt trace | P0 | payload鎖定，同fingerprint重用同key直到terminal receipt |
| stale後反覆送舊ETag | 只保留draft，沒有reload recovery | 使用者陷入無法儲存迴圈 | B09 two-session stale＋recovery readback | P1 | 禁用save；單一`放棄草稿並載入最新資料`後取得新ETag |
| 一條smoke被計成12案 | runner只寫總分母，無case registry | false PASS，缺陷無法追溯 | G04 case/artifact completeness | P0 | B01～B12 unique records、named assertions、missing/duplicate fail closed |

## 5. Contract cases `C01～C08`

| ID | Oracle | 必要證據 |
|---|---|---|
| C01 | Part action projection：formal=`編輯料號`、owner=`繼續編輯`、reviewer=`前往審核`；每state primary maintenance 0或1 | state resolver assertions；unknown/multiple primary fail closed |
| C02 | Part `edit_relation_matrix` action完全移除；`cancel_work／request_obsolete`仍按既有permission存在且被分類為secondary；Drawing actions/labels/order不變 | exact action arrays＋Drawing snapshot |
| C03 | Part drawer body不mount preview source control、classification editor、relation edit mode、attachment manager或BOM create/open control；生命週期secondary只經確認modal；readonly preview/relation/file仍存在 | source/AST registry；禁止只用字串不存在判斷Drawing |
| C04 | Matrix response additive `sourceRowKey`由`source_work_state_id`＋`canonicalRowKey()`產生；query仍恰三statement、initial preview bytes=0 | repository statement instrumentation＋DTO assertion |
| C05 | Tab唯一`data|maintenance|bom`；missing/invalid normalize data；page await params/searchParams且只傳serializable props；header同時顯示root與source Part | unit/static contract |
| C06 | `actionDock`只在data tab；maintenance/BOM只作用exact source Part；relation明示root-wide；其他column focus不得client retarget | component contract＋scope assertions |
| C07 | Shared relation presenter唯一提供`activationMode=explicit|immediate`且default explicit；Part parent只有exact active-work row `action.key="edit"`才傳manage，其他action／缺axes readonly；Part無`編輯關聯`或duplicate editing state；Drawing caller維持explicit | component/AST contract＋row action matrix＋caller registry＋Drawing snapshot |
| C08 | Dirty-only normal dock、非色彩dirty/a11y、stable logical command fingerprint/key、ambiguous／committed-readback／stale recovery contract、BOM單一零件空狀態文案／maintenance tab導向，以及維護四區塊共用section shell／heading／spacing／responsive、compact-minimum最小內距、結構型態唯一`編輯`文案與schema/migration/permission/dependency/new route負向diff；113-E exact 6 product＋3 runner modify、0 add/delete成立，後續視覺與label修正為相容增量 | state-machine unit/source contract＋git diff classifier＋SHA ledger＋scoped visual contract |

## 6. Isolated integration cases `R01～R04`

| ID | 操作 | Oracle／readback |
|---|---|---|
| R01 | 以formal、owner、exact reviewer、other actor、blocked、system與terminal投影Part actions | primary 0/1、secondary合法、server/company/permission truth一致；Drawing projection byte-equivalent current expected |
| R02 | 讀matrix並用回傳sourceRowKey讀exact detail；另試tampered Part、work、rowKey與第二公司 | exact Part成功；mismatch/cross-company 403/404/409、response無他公司identity、DB zero write |
| R03 | 只讀data tab契約並量測repository/query/asset access | 三statements、attachment bytes/preview media request=0、master/state before/after相同 |
| R04 | 以exact source Part組合canonical detail→shared preview/relation→classification/attachment/BOM projection；對relation執行正常save、同payload same-key replay、same-key different-payload negative與stale ETag | orchestration沒有第二writer；正常／replay只一個effect，key reuse 422零第二effect，stale零write；Part work/review與其他domain hashes不變。其餘UI journey由B08～B11承接 |

## 7. Real browser cases `B01～B12`

Browser必須是authenticated real Chromium，攔截並分類所有request；fixtures與runtime皆task-owned。B01～B11主桌面為1440×900，B12以同一fixture抽查1024×768與390×844，不重複整套business mutation。

| ID | Journey | UI／network／state oracle |
|---|---|---|
| B01 | `/parts`開`P-FORMAL` drawer | 首屏辨識identity/status；唯一primary=`編輯料號`；若有obsolete只在分離的`更多操作`；無duplicate edit |
| B02 | 開`P-OWNER` drawer | primary=`繼續編輯`；cancel為secondary且確認取消前zero write；focus由drawer→menu→modal→trigger可恢復 |
| B03 | exact reviewer／other reviewer／no-permission／blocked依序開drawer | exact=`前往審核`且進immutable review；其餘無disabled fake primary、只顯示短原因 |
| B04 | drawer mount、換列、顯示模式、download/view、close/reopen | drawer body無form/file/mutation controls；mutation request count=0；scroll/focus不跳失 |
| B05 | formal點`編輯料號`，模擬double-click、response loss、5xx/409；不改data直接切maintenance再離開 | same logical key、最多一個zero-delta work、formal hash不變；workspace明示未變更，drawer回來投影`繼續編輯`且可由既有secondary取消；safe return完整 |
| B06 | data tab編輯兩個Parts並送審 | DEV-108 autosave、最多3 pool、action dock只在data；flush後submit；independent review packages readback |
| B07 | data pending／failed／conflict時切maintenance/BOM | pending先flush；error/conflict留data且URL未變、focus error；不得自動submit |
| B08 | maintenance操作preview與classification | 進tab才lazy GET/detail；結構型態唯一writer入口顯示`編輯`並成功readback；離開後重進顯示server truth；data review state不變 |
| B09 | 以具真實Drawing×Part axis/cell的`P-ROOT-MULTI`進maintenance，依序做capability/load→change/cancel→normal save/readback→response loss same-key retry→two-session stale→discard-and-reload recovery；再開Drawing drawer | exact row `edit`才讓Part cell首屏edit-ready，review／no-permission readonly；Part頁`編輯關聯`count=0且load mutation=0；change只生local draft與dirty dock；cancel恢復truth仍edit-ready；normal save一個effect；ambiguous時cell鎖定且相同payload／key重送取得同receipt；stale保留draft、禁用save、zero overwrite，recovery GET取得新ETag且仍edit-ready；Drawing仍須先點`編輯關聯` |
| B10 | maintenance附件選檔、upload、preview、delete/restore；另開standalone route | 同頁embedded無第二page frame；選檔dirty guard；existing authority/readback與standalone compatibility |
| B11 | BOM正常／blocked、單一零件empty state與maintenance導向、tab history/reload、workspace→list與DEV-110 return | 無BOM editor/Part submit；root/source scope文案正確；單一零件明示不適用並可回到maintenance；URL/state/focus/return context與unsafe fallback正確 |
| B12 | 1024×768與390×844抽查drawer、三tabs、matrix、immediate relation與BOM；keyboard/screen-reader semantics | 無page雙scroll或dirty dock遮擋；matrix唯一水平scroll；維護預覽／結構型態／附件／關聯矩陣使用一致外框、標題列與最小內部間距，附件不得出現重複card套card；Part workspace採本次compact-minimum密度，主要按鈕觸控尺寸與focus不縮減；窄版可換行且無水平溢出；dirty cell非色彩可辨、accessible state完整；drawer mobile readonly；tablist/aria-selected/visible focus/live region/touch target正確；loading不顯示空白error frame |

每個B case保存獨立case record、named assertions、screenshot、DOM摘要、request trace、console/page errors、failed responses、focus sequence、viewport、before/after readback及mutation ledger。B09至少保存maintenance未dirty、dirty dock、ambiguous lock、save/readback、stale、recovery後與Drawing explicit七個狀態；B12保存1024與390 viewport。正常狀態任何可見`.inline-error`、非預期`[role="alert"]`、raw HTTP／`/api/`錯誤、load failed或console/page error立即FAIL；預期stale alert只在該步允許且必須是safe message，recovery後清除。`P-ROOT-MULTI`若Drawing／Part axis或預期fixture count意外為0，視為data sanity FAIL，不得當empty-state PASS。

## 8. Aggregate gates `G01～G04`

| ID | Gate | PASS條件 |
|---|---|---|
| G01 | Typecheck＋affected ESLint | `typecheck:app`與exact affected files ESLint exit 0；不得用ignore降低規則 |
| G02 | Isolated Next build＋primary invariant | `build:isolated` exit 0；primary schema/identities/residue/FK before=after；task temp清除 |
| G03 | Exact targeted parent regression | 固定只執行`node scripts/qc-dev-090-contract.mjs`、`node scripts/qc-dev-096-contract.mjs`、`node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-099-contract.mjs`、`node scripts/qc-dev-108-contract.mjs`；四者exit 0。Preview／classification／attachments／BOM的current可見journey由B08／B10／B11承接；本次不宣稱或重跑DEV-101 readback |
| G04 | Evidence integrity／visible-error／cleanup | 28 unique cases、PASS=28、B01～B12各有獨立record/assertions/artifacts、missing/duplicate=0、P0/P1=0、candidate fingerprints相同、正常畫面visible errors=0、expected nonzero fixture counts成立、unexpected failed responses=0、productionWrites=false、all task-owned ports/process/temp cleaned |

G03不修改任何parent runner，只由`scripts/qc-dev-113-aggregate.mjs`呼叫上列四個exact commands。若其他舊runner明確驗證已被DEV-113取代的Part drawer placement，保留其source與歷史evidence，不納入current aggregate；不得為讓舊expected變綠而全面改寫歷史journey或放寬成任意selector。

Historical pre-113-E receipt仍保留作baseline；current receipt=`output/qa/dev-113/aggregate/report.json`，最新compact-minimum visual browser=`output/qa/dev-113/browser-real/DEV113-2026-09-02T06-05-22-456Z/report.json`，B01～B12逐案record、named assertions、request trace與artifact=`12/12 PASS`。B08實際驗證結構型態唯一`編輯`writer入口；B11實際驗證單一零件原因文案、maintenance tab導向且mutation=0；B12實際涵蓋1440×900、1024×768、390×844並確認最小內距、維護區塊視覺契約與窄版無溢出；loading空白error frame修正保留，`productionWrites=false`。回復前aggregate已通過G01 contract／typecheck／eslint與G02 integration，但G02 isolated build被範圍外既有未追蹤`src/lib/repositories/ai-pdm-role-capability-repository.ts:77`的TS2345擋住，故本次aggregate不計為28/28新通過；上一輪aggregate manifest的28案missing=0、duplicate=0、artifact存在與primary invariant仍是baseline。task-owned browser runtime／fixture／port／dist／temp已清理；正式PostgreSQL provider、production migration、deploy、activation、release仍維持gated。

## 9. Evidence layout與manifest schema

Root固定：`output/qa/dev-113/{runId}/`

```text
aggregate.json
candidate-fingerprint.json
runtime.json
primary-before.json
primary-after.json
contract/contract.json
integration/integration.json
browser/browser.json
browser/screenshots/*.png
browser/network.json
browser/focus.json
regression/*.json
cleanup.json
```

`aggregate.json`至少包含：`status／denominator=28／passed／failed／blocked／notRun／missing／duplicateIds／p0／p1／candidateFingerprint／childFingerprints／productionWrites／primaryInvariant／runtimeDeclarations／browserErrors／unexpectedFailedResponses／cleanup／commands／durations／artifacts`。任何欄位缺少、child未終止或artifact path不存在都不得標PASS。

## 10. QC獨立抽查與完成條件

QC不重做全部QA，但至少獨立抽查：

1. B01/B02：單一primary與生命週期secondary分離，確認不是把功能藏掉。
2. B04：用network trace證明normal drawer journey zero mutation。
3. B05：response-loss／stable idempotency＋DB唯一work。
4. B07/B09：兩種dirty/conflict guard不丟資料、不覆寫server truth。
5. B10/B11：附件與BOM沒有第二writer/page owner，root/source scope清楚。
6. B12：390×844與keyboard/screen reader語意。
7. G02/G04：primary before/after、process/port/temp cleanup與28案完整性。

113-E完成條件已達成：既有current candidate取得`28/28 PASS`、P0/P1=`0`、exact 9-file implementation boundary可解釋；本次compact-minimum與`編輯`文案為相容呈現層增量，最新B01～B12逐案證據=`12/12 PASS`，B09完整command/recovery trace及B11 BOM empty-state routing存在，且task-owned runtime／fixture／port已清理。G02 build的既有範圍外TS2345 blocker仍需另行處理，不能被本次UI browser PASS取代；DEV-113狀態為`Local RD Implemented / QA-QC Complete / Production Release Gated`。正式PostgreSQL provider、production migration、deploy、activation或release均不在本計畫授權內。
