# QA-DEV-090：抽屜關聯矩陣直接正式編輯驗證計畫

Status: `QA Focused Local Executed / Production Gate Pending`
Date: 2026-08-23
DEV: `DEV-090`
SPEC: `.ai-doc/specs/SPEC-PDM-INLINE-RELATION-MATRIX-001-direct-formal-edit.md`
Risk: High / immediate formal relation mutation and cross-surface retirement

## 1. 驗證目標

只有UI顯示、API結果與資料庫正式關聯同時符合SPEC，才可判定PASS。QA不得只證明元件可點、HTTP 200或資料表有變更；必須證明同一root在Drawing drawer、Part drawer、direct mutation與`drawing_part_links`之間完全一致，且Relation work/review/runtime已退役而歷史證據沒有遺失。

本輪已完成本機 focused contract／repository／mutation／migration／retirement與authenticated browser evidence；正式 Cloud SQL migration、provider parity、兩輪 fresh session與production操作仍未執行。

## 2. Fixture Matrix

| Fixture | Drawing | Part | Links | Purpose |
|---|---:|---:|---:|---|
| F0 empty root | 0 | 0 | 0 | root-only搜尋與空狀態 |
| F1 drawing only | 2 | 0 | 0 | 單axis不可編輯 |
| F2 part only | 0 | 2 | 0 | 單axis不可編輯 |
| F3 blank matrix | 2 | 3 | 0 | 建立第一個正式關聯 |
| F4 mixed | 3 | 4 | primary＋reference | 正常檢視／編輯 |
| F5 concurrency | 2 | 2 | existing | 兩session lost-update防護 |
| F6 large | 50 | 50 | sparse mixed | overflow、render與query budget |
| F7 terminal child | 2 | 2 | existing | identity／dependency guard |
| F8 legacy active work | existing | existing | formal＋proposed | activation blocker |
| F9 ambiguous legacy | 1 | 1 | same pair two types | mapping blocker |
| F10 writer convergence | 3 | 4 | mixed | direct edit、建立編號、正式化、替代料號、主圖恢復與root delete共用authority／lock |

所有fixture必須有SQLite與PostgreSQL等價版本；不得用只在單一provider成立的隱式排序、partial index或transaction行為判定產品正確。

## 3. UI Journey Matrix

| ID | Journey | Expected UI | Required API／DB evidence |
|---|---|---|---|
| RIM-001 | 圖號清單開啟drawer | 只有一個`關聯矩陣`，沒有`直接關聯` | detail含formal matrix；root/hash正確 |
| RIM-002 | 料號清單開啟drawer | 與同root圖號drawer矩陣相同 | 兩detail matrix hash相同 |
| RIM-003 | Drawing production、RD切列 | 都顯示同一root正式矩陣，不顯示source layer | revision/work不改matrix authority |
| RIM-004 | Part formal、work切列 | 都顯示同一root正式矩陣 | Part work不建立Relation work |
| RIM-005 | 點`編輯關聯` | drawer原位進edit mode，沒有route跳轉 | mutation尚未呼叫；DB hash不變 |
| RIM-006 | 鍵盤修改三態cell | 空白／製造／參考可辨識且不只靠顏色 | browser draft only；API=0 |
| RIM-007 | 取消edit | 全部草稿消失並回view mode | DB／ETag／receipt不變 |
| RIM-008 | dirty時關閉／上下切列／返回 | 出現既有unsaved guard，選擇留在原列可保留draft | 未提交時DB write=0 |
| RIM-009 | 儲存一或多格 | 一次busy、成功後重抓detail、回view mode並顯示目前exact結果 | 單一PATCH＋單一detail refresh；links＋receipt同transaction |
| RIM-010 | 儲存失敗 | 保留draft、焦點到錯誤、沒有混合舊新矩陣 | links／receipt零partial write |
| RIM-011 | empty root搜尋 | `編號搜尋`root identity可見、只顯示最短事實；沒有矩陣或edit | search包含root-only record，沒有第三個matrix GET |
| RIM-012 | blank matrix建立首link | cell可編輯並直接正式生效 | task/review新增數=0 |
| RIM-013 | 單axis root | 不顯示空toolbar或disabled save | mutation入口不存在 |
| RIM-014 | 圖號／料號identity導航 | 前往各自canonical工作台並可安全返回 | 不命中Relation list/workspace |
| RIM-015 | 圖料工作台退役 | sidebar及全站文案沒有該名稱，舊route不可達current workbench | forbidden caller／visible copy scan=0；合法編號搜尋caller全數有分類 |
| RIM-016 | 待辦／審核中心 | 新Relation direct edit不產生項目 | task/review row delta=0 |
| RIM-017 | 各舊入口逐一導航 | search intent到`編號搜尋`、owner intent到Drawing／Part、number-create intent到既有申請；Relation intent fail closed | 每個inventory caller均有expected target與fresh-session證據，無broken query/fallback |

## 4. Mutation、Concurrency 與 Integrity

| ID | Case | PASS condition |
|---|---|---|
| RIM-101 | valid primary add | pair一列、Part primary count=1、commit後strong ETag等於DB重算值 |
| RIM-102 | valid reference add | pair一列reference、ETag改變且SQLite／PostgreSQL一致 |
| RIM-103 | primary→reference | old pair刪除、新pair一列、無瞬間雙型殘留 |
| RIM-104 | relation→blank | pair移除，其他cell不變 |
| RIM-105 | duplicate pair in request | 422、零write |
| RIM-106 | second primary for same Part | 409、整批零write |
| RIM-107 | cross-root identity | 422/404、零write且不洩漏資料 |
| RIM-108 | cross-company identity | 403/404、零write |
| RIM-109 | stale strong ETag `If-Match` | 409、draft可恢復、零write |
| RIM-110 | two fresh sessions same ETag | 只第一個成功，第二個stale；無last-write-wins |
| RIM-111 | same idempotency replay | compact response identity／matrixEtag一致、只有一次effect |
| RIM-112 | same key different payload | 422 `IDEMPOTENCY_KEY_REUSED`、無第二effect |
| RIM-113 | response loss then retry | compact receipt可重取、effect只有一次；detail再讀目前authority |
| RIM-114 | no-op patch | 成功但ETag不變且receipt不增加 |
| RIM-115 | transaction fault after delete/before insert | rollback後links／receipt／重算ETag完全不變 |
| RIM-116 | dependency guard rejection | 409且人類訊息可理解、零write |
| RIM-117 | 2,500 changes／2,501 changes | 50×50全部cell可一次原子save；2,501或超過目前cell數固定413，client不得自動拆批 |
| RIM-118 | 非DEV-090 formal writer regression | 建立編號、正式化、替代料號、主圖恢復與root delete全部經formal authority及同一root-first lock；任一raw writer注入使gate失敗，ETag由結果內容自然重算 |
| RIM-119 | A→B→A內容回復 | ETag可回到A，但command receipt次數仍正確；UI只依目前authority判斷stale |
| RIM-120 | domain/storage enum mapping | DTO只見`manufacturing_basis|reference`、DB只見`primary_manufacturing|reference`；authority外inline mapping scan=0 |
| RIM-121 | runtime authority schema hash | DEV-090 runtime只接受`dev090-v1`；若DB authority仍是舊hash，API固定回503 `WORKBENCH_AUTHORITY_MISMATCH`，不得呈現部分清單或發出mutation token |
| RIM-122 | 無圖料根號的準備中資料開啟抽屜 | 顯示明細與空矩陣說明，不誤報資料衝突，也不提供無效的關聯矩陣寫入入口 |

## 5. 權限矩陣

| ID | Actor | Drawing drawer | Part drawer | PATCH |
|---|---|---|---|---|
| RIM-151 | `numbering.drawings.view=yes`、`numbering.search=no`、`numbering.workspace.update=yes` | 可讀可編輯 | 依exact entity read | 允許；不得因缺search permission拒絕 |
| RIM-152 | `numbering.search=yes`、`numbering.drawings.view=no`、`numbering.workspace.update=yes` | 依exact entity read | 可讀可編輯 | 允許；resolver保持page-neutral |
| RIM-153 | 任一read=yes、update=no | 唯讀且無假入口 | 唯讀且無假入口 | 403、零write |
| RIM-154 | anonymous | 不可讀 | 不可讀 | 401、零write |
| RIM-155 | cross-company／錯root binding | 不洩漏存在性 | 不洩漏存在性 | 403/404、零write |

## 6. Projection、Performance 與 Accessibility

- RIM-201：Drawing／Part detail使用同一projection，禁止client由`directRelations`組裝。
- RIM-202：Drawing／Part list query count delta=`0`；detail只增加固定statements且不隨axis/cell成長。
- RIM-203：save使用單一JSON parameter與provider-specific set operation；1／20／2,500 changed cells statement count不線性成長，也不超過SQLite parameter limit。
- RIM-204：F6 50×50在desktop與窄版只有matrix wrapper水平捲動，drawer/page沒有雙重overflow。
- RIM-204A：先測原生semantic table；開啟至可互動p95≤500ms、cell回饋p95≤100ms、view/edit切換p95≤300ms且無>200ms long task。全數通過時不得為推測新增virtualization dependency；任一失敗才驗證windowing後仍保留sticky axis、focus、keyboard與screen-reader語意。
- RIM-205：table headers、cell name、三態input、edit/save/cancel、error live region及visible focus可由鍵盤與screen reader辨識。
- RIM-206：狀態移除顏色後仍可理解；reduced motion不影響結果。
- RIM-207：drawer寬度偏好、上下鍵切列、Escape、focus restore與最後一列不被action dock遮住。
- RIM-208：browser console error、uncaught promise、network 5xx、hydration mismatch與stale cache皆為0。

## 7. Migration 與 Retirement Gate

| ID | Gate | PASS condition |
|---|---|---|
| RIM-301 | active work inventory | work/review/apply_failed全部0；不得自動套用或丟棄 |
| RIM-302 | ambiguous pair inventory | same pair dual type=0；人工mapping清單空 |
| RIM-303 | primary uniqueness | multi-primary Part=0 |
| RIM-304 | canonical ETag parity | 每root source／target hash一致；SQLite／PostgreSQL canonical serialization相同 |
| RIM-305 | formal relation reconciliation | count、PK/FK、company、root、內容hash 100% |
| RIM-306 | historical evidence | completed snapshots／minimal traces筆數與hash不變 |
| RIM-307 | current state removal | Relation canonical current rows移除後Drawing／Part matrix仍完整 |
| RIM-308 | caller scan | Relation navigation/runtime/API/repository/worker/script writer current caller=0、可見`圖料工作台／回圖料工作台／查圖料`=0；保留search caller逐筆分類且query符合allowlist |
| RIM-309 | negative injection | 注入任何retired caller後gate必須FAIL |
| RIM-310 | orphan scan | orphan root/link/work/review=0 |
| RIM-311 | provider parity | SQLite與PostgreSQL schema、constraint、canonical ETag、transaction、result相同 |
| RIM-312 | migration 043 order | 041／042不可變；043 fail-closed、re-run、rollback與official package inventory正確 |
| RIM-313 | sole formal writer | `drawing_part_links`所有runtime DML只存在formal authority；sync legacy writer caller=0並刪除，或其原flow已遷到async authority |

正式migration rehearsal、production cutover與release不在本輪文件授權內；未來必須沿用DEV-087正式資料零遺失政策，`unresolved>0`或reconciliation非100%即停止。

## 8. Focused Regression

- Drawing：production/RD多branch清單、歷史、preview、editor/review、智慧辨識與進版。
- Part：formal/work、附件獨立即時生效、editor/review與替代料號附件。
- Shared drawer：寬度偏好、上下鍵、close/Escape、returnTo、focus與viewport。
- Approval：Drawing／Part request仍正常；Relation request新增為0。
- Search：drawing、part、root、root-only及舊query rejection符合新route契約。

## 9. Focused FMEA

| Failure mode | Effect | Priority | Prevention／Detection | Stop condition |
|---|---|---|---|---|
| 其他formal writer繞過root lock | lost update、constraint衝突或矩陣hash漂移 | P0 | sole-authority DML scan、F10多flow並行、negative injection | 任一runtime raw writer或不同lock order |
| timeout／response loss後重送 | double effect或UI誤認失敗 | P0 | idempotency replay、receipt＋no-store detail refetch、fault injection | effect count≠1或receipt/link不同transaction |
| 舊搜尋caller／文案未改 | broken navigation或已退役產品重新出現 | P1 | caller classification、全站copy/query scan、fresh-session journey | 任一forbidden intent可達或合法caller無target |
| route綁`numbering.search` | Drawing／Part合法使用者被誤拒 | P1 | RIM-151～155 permission matrix | 任一page-neutral角色結果不符 |
| 500／2,500上限不一致 | 大矩陣無法一次儲存，client被迫拆批 | P1 | 2,500-cell atomic test＋2,501 negative | 50×50不能單次save |
| stale／constraint失敗後混合刷新 | UI、API、DB顯示不同資料 | P0 | two-session、after-delete fault、exact refetch | 任一partial write或混合matrix |
| 2,500 cell過密或卡頓 | drawer不可操作、鍵盤焦點遺失 | P1 | native-first performance budget；必要時semantic windowing | 任一performance/a11y gate失敗 |
| error／empty UI被誤當成功 | 使用者看不到失敗或空root被當可編輯 | P1 | visible error、empty-root search與UI/API/DB三方比對 | 只靠HTTP 200或seed即可判PASS |

## 10. Evidence 與判定

必要evidence：

- contract／repository／transaction test輸出與fixture manifest。
- SQLite＋PostgreSQL provider parity report。
- before/after DB count、PK/FK、root／matrixEtag、link hash與historical evidence hash。
- 真實Chromium兩輪fresh-session screenshots／trace／network／console manifest，涵蓋desktop與窄版。
- retirement caller inventory與negative-injection結果。

PASS只有一種：所有適用RIM case通過，UI/API/DB一致，migration gate=`unresolved=0`、reconciliation=`100%`，caller=0且沒有P0/P1回歸。任一項無證據、環境不一致、只靠seed／SQL直接製造UI狀態、或只驗證HTTP 200，一律不得判PASS。

## 10.1 固定執行入口與證據位置

```powershell
npm.cmd run qc:dev-090:contract
npm.cmd run qc:dev-090:repository
npm.cmd run qc:dev-090:mutation
npm.cmd run qc:dev-090:migration
npm.cmd run qc:dev-090:retirement
npm.cmd run qc:dev-090:browser
npm.cmd run typecheck:app
npm.cmd run lint
npm.cmd run build:isolated
npm.cmd run qc:dev-090
```

aggregate只承認同一`output/qa/dev-090/<run-id>/manifest.json`所列的provider parity、migration reconciliation、retirement negative injection與兩輪fresh browser evidence；不得引用DEV-087／089舊PASS替代DEV-090事實驗證。

## 10.2 本機執行結果（2026-08-23）

- `qc:dev-090:contract`：25/25 PASS，包含runtime authority與無根號資料回歸檢查。
- `qc:dev-090:repository`：5/5 PASS；所有 `drawing_part_links` runtime writer 已收斂到 formal authority。
- `qc:dev-090:mutation`：A→B→A、primary uniqueness、no-op receipt stability PASS。
- `qc:dev-090:migration`：SQLite dry-run PASS；本機已在確認的 `data/ai-pdm.sqlite` 建立 pair unique index。
- `qc:dev-090:retirement`：10/10 PASS；Relation API、workspace、change-work service/repository、review caller與runtime可見退役語意掃描均通過。
- `qc:dev-090:browser`：Drawing／Part drawer inline matrix、編號搜尋最小 identity與截圖 evidence PASS，見 `output/qa/dev-090-browser/evidence.json`。現有 fixture 的2D preview仍顯示既有「預覽產生失敗」，不作為本任務關聯權威判定依據。
- `typecheck:app`、`build:isolated`（124/124）PASS；043 PostgreSQL migration syntax／provider-aware runner已補齊，尚未連線正式 Cloud SQL。

本節只代表 local implementation evidence；`unresolved=0`、正式資料 reconciliation 100%、PostgreSQL provider parity、兩輪 fresh session、fault injection與production release gate仍須另行完成。

## 11. Stop Conditions

- 發現正式Relation work或pending review無合法UI方式歸零。
- ambiguous pair或multi-primary不能唯一映射。
- direct save存在partial write、last-write-wins、provider差異或無法固定query budget。
- empty root在移除圖料工作台後不可達。
- Drawing／Part任一既有生命週期被迫依賴Relation work/review。
- retirement仍有current caller、fallback或orphan資料。
- 任一正式link writer未收斂到formal authority／root-first lock，或2,500格無法一次原子提交。

命中任一stop condition即回送RD；不得以改QA預期、保留永久相容路徑或刪除資料掩蓋。
