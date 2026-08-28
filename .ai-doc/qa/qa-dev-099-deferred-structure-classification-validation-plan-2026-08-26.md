# QA DEV-099：結構型態延後分類與 BOM Readiness 驗證計畫

> **Superseded 2026-08-28**：BOM readiness與Part結構分類功能已由DEV-095退役；48案只作歷史證據，不得執行為current acceptance。

狀態：`Historical Evidence Only / Superseded by DEV-095`

日期：2026-08-26

Owner：QA

DEV：`DEV-099`

Authority：`.ai-doc/specs/SPEC-PDM-DEFERRED-STRUCTURE-CLASSIFICATION-001-numbering-and-bom-readiness.md`

Decision：`.ai-doc/decisions/ADR-PDM-PART-STRUCTURE-CLASSIFICATION-001-deferred-exact-part-authority.md`

風險：High。此變更跨rendered建號UI、canonical APIs、Part classification、BOM visibility、transaction、permission及SQLite／PostgreSQL；build、direct API或DB單層成功不能構成完成。

## 1. 品質目標

證明：

1. 使用者可在不選結構型態的情況下完成new-root與existing-root建號，結果不被silent default誤分類。
2. `unclassified`是合法狀態，不阻擋新增Part；root共識只初始化新Part，不改寫既有資料。
3. 使用者只能從正常料號工作臺exact Part drawer找到分類入口，並可安全複選同root顏色／規格變體。
4. classification command具備permission、company／root boundary、ETag、idempotency、transaction、audit及BOM conflict的zero-partial保證。
5. 只有assembly顯示BOM section，製造BOM action由server依manufactured＋primary M＋Definition推導。
6. SQLite與PostgreSQL在成功、競爭與fault rollback語意一致，primary資料與未知runtime不受驗證影響。

固定Current Phase分母：`QA-099-001..048`，共48案。任何case未執行、blocked、skip、只有較低層證據或provenance不完整，DEV-099都不得標完成。

## 2. 證據規則

- business mutation只能由rendered UI normal delivery path產生；direct API／repository只可驗contract、permission、concurrency及fault，不得冒充UI journey。
- UI案例可seed公司、root、existing Part、Drawing M與BOM等前置資料，但不得直接seed該案例要證明的分類或新建號postcondition。
- 同一case的UI、network initiator、server correlation、receipt／audit與DB readback必須對應同一identity。
- 每個run保存source revision或exact dirty boundary、artifact hashes、provider、fixture ledger、runtime、viewport、timestamp與cleanup receipt。
- 使用task-owned isolated `PDM_DATA_DIR`、`PDM_REPOSITORY_DIR`及disposable PostgreSQL。不得seed、clean或repair primary DB。
- 使用者可見流程必做fresh session、hard reload、console/page/network與visible alert sweep。
- 測試錯誤狀態以外，任何`.inline-error`、`[role=alert]`、HTTP 4xx/5xx、route error、Not Found、Internal Server Error或不合理空候選皆直接FAIL。
- QA plan在QC前凍結；scope drift先更新authority並記錄affected cases，不得事後縮小分母。

## 3. Test Oracles

| Oracle | 內容 |
|---|---|
| UI | 正常入口、欄位不存在／存在、selection、conditional reason、loading/error/recovery、focus與fresh readback。 |
| Network | canonical payload allowlist、normal UI initiator、If-Match、idempotency key、contract token、stable status／code。 |
| DB | exact Part before／after、sequence/root/drawing/relation delta、receipt、audit、BOM bindings與zero-partial。 |
| Independent consensus | 由fixture manifest的全部current Parts獨立計算unanimous／mixed／unclassified結果，不import SUT helper。 |
| BOM readiness | 由exact item kind、structure type、primary M與Definition rows獨立計算預期action。 |
| Provider | 相同fixture／command在SQLite與PostgreSQL的result、lock、rollback、receipt及FK一致。 |
| Retirement | new-root structure selector、required API guard、first-Part inheritance、unclassified block及parallel entry injection必須使gate失敗。 |

## 4. Required Cases

### 4.1 Numbering UI／contract — QA-099-001..008

| ID | Case | 通過標準 |
|---|---|---|
| QA-099-001 | new-root manufactured rendered form | 不出現結構型態；其餘DEV-093命名／M圖流程完整，只有一個primary。 |
| QA-099-002 | new-root purchased rendered form | 不出現結構型態；Part／optional R流程完整，無assembly限制文案。 |
| QA-099-003 | preview payload／result | UI request不帶structure type；preview回effective=`unclassified`、source=`deferred_default`且DB delta=0。 |
| QA-099-004 | manufactured正式create | rendered UI建立Part＋M，DB structure type明確為unclassified，receipt／audit一致。 |
| QA-099-005 | purchased正式create | rendered UI建立Part／必要R，DB structure type明確為unclassified，不依賴physical default。 |
| QA-099-006 | compatibility single_part | isolated direct contract request接受已知值，effective／receipt為single_part；不作UI PASS。 |
| QA-099-007 | compatibility purchased assembly | isolated request可建立purchased assembly，無BOM side effect；不再422。 |
| QA-099-008 | unknown／null-like值 | unknown字串422且sequence/root/Part/Drawing/relation/receipt/audit delta=0；省略不是錯誤。 |

### 4.2 Existing-root initialization — QA-099-009..016

| ID | Case | 通過標準 |
|---|---|---|
| QA-099-009 | 全single_part root新增Part | UI/request不帶profile，新Part由全體共識初始化single_part，既有Parts零更新。 |
| QA-099-010 | 全assembly root新增Part | 新Part初始化assembly；若manufactured＋M則fresh drawer有BOM readiness。 |
| QA-099-011 | root無既有Part | 新Part為unclassified，不採single_part安全預設。 |
| QA-099-012 | root含unclassified | append-policy不阻擋；新Part為unclassified。 |
| QA-099-013 | root single／assembly混合 | 不取第一筆；新Part為unclassified，全部既有值不變。 |
| QA-099-014 | Part排序／ID改變 | 相同集合不因query排序或最小ID改變共識結果。 |
| QA-099-015 | compatibility assertion一致／不一致 | 一致decided assertion可接受；不一致或無共識時409、zero write。 |
| QA-099-016 | drawing-only append | contract與DB都沒有Part structure mutation，既有Drawing行為不變。 |

### 4.3 Classification repository／API — QA-099-017..028

| ID | Case | 通過標準 |
|---|---|---|
| QA-099-017 | candidate GET normal | context locked selected；只回同company／root current Parts、現有材質／顏色差異與allowed targets，ETag strong且no-store；1／100筆statement無N+1。 |
| QA-099-018 | candidate empty／single | 只有current Part仍可完成，無假空白或unexpected all-zero。 |
| QA-099-019 | candidate超過100 | stable limit blocker，不silent truncate、不誤顯示全選。 |
| QA-099-020 | unclassified→single | PATCH成功、fresh GET／DB／audit一致，沒有BOM side effect。 |
| QA-099-021 | unclassified→assembly | PATCH成功；BOM readiness依個別Part條件回傳。 |
| QA-099-022 | decided→different decided | reason必填且保存trim後值；空原因422 zero write。 |
| QA-099-023 | multi-select same root | current Part鎖定，明確targets全數同值更新；未選候選不變。 |
| QA-099-024 | cross-root／cross-company／inactive target | 404／409且整批zero write；response不洩漏跨company資料。 |
| QA-099-025 | assembly→single有BOM conflict | current/open/released任一binding使整批409；Part／BOM／audit均無partial update。 |
| QA-099-026 | no-op與idempotent replay | same value/no-op穩定；same key＋same fingerprint回同結果且audit不重複。 |
| QA-099-027 | idempotency conflict／stale ETag | same key different payload=409；stale If-Match=412；兩者zero write。 |
| QA-099-028 | fault／concurrency | 每個named checkpoint rollback；兩個相反併發command最多一個依最新ETag成功，無lost update。 |

### 4.4 UI Entry／BOM readiness — QA-099-029..040

| ID | Case | 通過標準 |
|---|---|---|
| QA-099-029 | normal entry discoverability | 從`/parts`正常導航到exact drawer可見目前分類與設定動作；direct URL不作入口證據。 |
| QA-099-030 | permission visibility | 有update權限可操作；read-only只見值；無讀權限看不到exact Part。 |
| QA-099-031 | dialog minimal skeleton | 只有type、current Part、same-root candidates、conditional reason、儲存／取消；無BOM/CAD/source/step/card。 |
| QA-099-032 | multi-select color variants | 可複選顏色差異Parts；不自動全選、不建立多份BOM、不改quantity。 |
| QA-099-033 | save／fresh readback | 成功後關閉、focus回trigger、drawer fresh GET顯示新值；reload後仍一致，無optimistic假成功。 |
| QA-099-034 | stale recovery | 412保留selection／reason，重新取得候選並要求再確認；不自動重送。 |
| QA-099-035 | visible server／network error | 錯誤就地靠近動作、輸入保留、重試可恢復；無raw SQL／stack／route text。 |
| QA-099-036 | unclassified／single BOM visibility | 兩者整段無BOM section／CTA，Drawing drawer與sidebar亦無平行入口。 |
| QA-099-037 | manufactured assembly＋M | 無Definition顯示建立BOM；有Definition顯示正確開啟／歷史action。 |
| QA-099-038 | manufactured assembly缺M | 顯示最短可恢復blocker、無建立BOM；補M後fresh readback轉eligible。 |
| QA-099-039 | purchased assembly | 分類可保存；顯示不適用製造BOM且無create action，不回退成single。 |
| QA-099-040 | RWD／keyboard／a11y | 四viewport、Tab／Shift+Tab、radio／checkbox、Escape、focus return、screen-reader names全通過，無overflow／重疊／截斷。 |

### 4.5 Regression／provider／aggregate — QA-099-041..048

| ID | Case | 通過標準 |
|---|---|---|
| QA-099-041 | DEV-093 legal flows | new/existing root的M／R、命名、relation、allocator、double-submit與quiet append受影響回歸PASS。 |
| QA-099-042 | retired behavior injection | 注入new-root selector、required API、first-Part inheritance、unclassified block任一項時contract gate必FAIL。 |
| QA-099-043 | DEV-096 shared BOM | same-root Parent複選、logical line、exact mapping、review/release snapshot受影響回歸PASS。 |
| QA-099-044 | assembly-only entry retirement | Drawing/root/sidebar/new-root/BOM list任一平行classification或BOM create入口注入時gate必FAIL。 |
| QA-099-045 | active writer inventory | 每個active Part INSERT有明確structure value；移除任一writer mapping時gate必FAIL。 |
| QA-099-046 | SQLite／PostgreSQL parity | 相同成功、BOM conflict、stale、idempotency與fault cases結果／DB delta／receipt一致；1／100 targets無per-Part query。 |
| QA-099-047 | primary invariant／cleanup | primary schema、canonical root/Part/Drawing identities、master counts、migration residue、root references、FK前後不變；task runtime／ports／temp paths完全清理。 |
| QA-099-048 | aggregate completeness | 48 unique cases同一parent run全部PASS，artifact hash/provenance完整，Blocked/Not Run/Skip/P0/P1=0，completionCandidate=true。 |

## 5. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| UI移除欄位但API仍required | 前後端不同步 | 建號全部422 | 001..005 normal journey | P0 | coherent artifact gate；API omission test |
| DB default偷偷寫single_part | writer未明示 | 未確認Part被永久分類 | 004/005/045 DB readback | P0 | active writer inventory＋negative injection |
| existing-root仍取第一筆 | 舊helper殘留 | mixed root新Part誤分類 | 013/014 independent oracle | P0 | 全集合consensus與ordering mutant |
| unclassified仍阻擋追加 | append-policy舊gate | 使用者無法建號 | 012 rendered flow | P0 | route/repository双層回歸 |
| root批次自動全選 | UI便利邏輯過度 | 未同意Parts被改寫 | 023/032 selection＋DB delta | P0 | current-only預選、exact target audit |
| 批次partial write | 無交易／錯誤被略過 | 同root分類分裂且難追 | 024/025/028 fault | P0 | all-or-nothing transaction |
| stale操作覆蓋他人 | ETag不完整 | lost update | 027/028 concurrency | P0 | strong fingerprint＋lock內重算 |
| assembly→single仍有BOM | conflict gate遺漏 | BOM與Part語意矛盾 | 025/043 | P0 | current/open/released binding oracle |
| purchased assembly被拒或誤建BOM | 舊096限制／eligibility耦合 | 分類不彈性或產生錯誤BOM | 007/039 | P1 | 分類合法、製造BOM action none |
| single/unclassified看見BOM | client自行推導／stale cache | 誤建BOM | 036 fresh readback | P0 | server-only projection |
| UI入口只能direct URL達成 | 正常drawer未接線 | 功能實際不可用 | 029 verification integrity | P0 | 從`/parts`正常導航取證 |
| visible error被build綠燈掩蓋 | 證據層級錯誤 | 使用者仍遇4xx/5xx | 034/035/040 sweep | P0 | headed browser hard gate |
| SQLite通過、PostgreSQL競爭失敗 | provider lock差異 | 上線資料競爭／partial write | 046 disposable PostgreSQL | P0 | actual provider mutation＋fault |
| 舊QA被重用當新PASS | provenance不一致 | 錯誤結案 | 048 manifest gate | P0 | fixed denominator、source/artifact hash |

## 6. Fixture Plan

至少建立以下task-owned fixture families；每個manifest記錄seed rows與cleanup：

| Fixture | 內容 |
|---|---|
| `F099-NEW` | 無root的新建號公司／系列前置；不seed結果Part。 |
| `F099-SINGLE` | 同root 2個active single Parts。 |
| `F099-ASSEMBLY` | 同root 2個manufactured assembly Parts，分別有／無primary M。 |
| `F099-MIXED` | 同root single／assembly／unclassified各一。 |
| `F099-COLOR` | 同root顏色差異4 Parts，無BOM；供複選。 |
| `F099-BOM` | assembly Parts綁定open／Released／obsolete-only definitions。 |
| `F099-PURCHASED` | purchased unclassified與purchased assembly。 |
| `F099-SECURITY` | 同company無權限、cross-company、inactive targets。 |
| `F099-LIMIT` | 101 same-root candidates；只驗bounded blocker，不作正常產品基線。 |

fixture seed只能建立case開始前狀態。UI create case不得seed預期new Part；classification case不得seed預期target classification；BOM visibility case可seed既有M／Definition，但不得用DB直接改分類後宣稱完整UI journey。

## 7. Planned Runners

```text
npm run qc:dev-099:contract
npm run qc:dev-099:repository
npm run qc:dev-099:browser
npm run qc:dev-099:postgres
npm run qc:dev-093
npm run qc:dev-096
npm run typecheck:app
npm run lint -- <affected files>
npm run build:isolated
npm run qc:dev-099
```

實際執行順序由aggregate擁有task runtime。任何runtime開始前必須記錄project、purpose、port、owning process tree、cleanup condition、`PDM_DATA_DIR`與`PDM_REPOSITORY_DIR`；結束只停止verified task-owned tree並確認port釋放。

## 8. Evidence Manifest

Evidence root：`output/qa/dev-099/<runId>/`。

必要內容：

- `manifest.json`：48-case exact roster、result、duration、first failure、source／artifact hash。
- `dirty-boundary.json`：起始status、target hashes、DEV-099 touched ledger。
- `fixture-ledger.json`：provider、seed、mutation provenance、cleanup。
- `numbering/`：rendered screenshots、payload、response、identity與DB delta。
- `classification/`：GET／PATCH、ETag、idempotency、audit、before／after rows。
- `browser/`：四viewport screenshots、accessibility、console/page/network/visible-error logs。
- `provider/`：SQLite／PostgreSQL result、lock/fault ledger、FK與transaction evidence。
- `primary-invariant.json`：schema、canonical identities、master counts、migration residue、root refs、FK before／after。
- `cleanup.json`：task ports、PID tree、temp data／repository／PostgreSQL disposal。

## 9. Pass／Fail

`PASS`：

- QA-099-001..048同一source state全部PASS；
- Blocked=0、Not Run=0、Skip=0、P0/P1 open=0；
- normal UI entry、headed screenshots、network correlation、DB/audit readback與provider evidence完整；
- primary invariants與cleanup通過。

`FAIL`：

- 任一必要case失敗、入口不存在、partial write、silent default、client-only eligibility、visible unexpected error或證據與結果矛盾。

`未充分驗證`：

- 只有build／lint／unit／API／DB、direct URL、SQLite-only、舊DEV-093／096 evidence或缺viewport／provenance。

`BLOCKED`：

- 無task-owned provider、角色、權限、真實畫面或可安全fixture。Blocked不可轉成PASS，也不可縮小分母。

## 10. Current Result

本輪已完成同一 parent run 的完整 aggregate gate：`npm run qc:dev-099`，固定分母
`QA-099-001..048` 全數 `48/48 PASS`，`Blocked=0`、`Not Run=0`、`productionWrites=false`。權威 manifest：
`output/qa/dev-099/DEV099-2026-08-26T09-03-03-967Z/manifest.json`。

同一 aggregate 已串接並保留：contract `48/48`、isolated SQLite repository `7/7`、authenticated headed
browser `37/37`（Part drawer、四 viewport、visible error、stale recovery、Drawing 無平行入口）、disposable
PostgreSQL `7/7`、DEV-093 contract／retirement／兩輪 fresh UI、DEV-096 contract／browser；全部 child report
status=0。PostgreSQL evidence 為 `.../provider/postgres.json`，SQLite evidence 為 `.../repository/repository.json`，
browser screenshots與console/page/network ledger在 `.../browser/`。

aggregate 前後 primary SQLite schema hash、roots／parts／drawings／links master counts、canonical root／Part／Drawing
identity hashes、missing root references 與 `PRAGMA foreign_key_check` 完全相同（`foreignKeyViolations=0`）；mutation
只發生在task-owned disposable data／repository／PostgreSQL cluster，未執行正式 migration、deploy、release 或
production smoke。DEV-093／096 舊契約已同步為本 DEV 的 deferred structure amendment，並以回歸 evidence 證明無行為退化。

結論：DEV-099 本機 RD、provider parity、rendered UI、回歸與 aggregate QA 已完成；Production Release 仍受既有
release gate 管制。
