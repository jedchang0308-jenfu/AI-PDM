# QA Plan：DEV-053 單一圖號工作台（由 AI 執行的真實操作驗證計畫）

Status: `RD Implementation Ready / Planned / Not Yet Executed`
Date: 2026-08-04
Owner: QA
Executor: AI QA/QC agent after local implementation freeze
Related DEV: `DEV-053`
Related SPEC: `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`

## 1. Objective and Boundary

驗證單一圖號工作台確實讓使用者不分頁即可判斷生命週期與下一步，同時證明UI合併沒有造成重複列、錯誤CTA、權限放寬、受控檔案雙authority或既有資料寫入。

本計畫由AI在隔離本機環境使用真實瀏覽器、真實登入session、真實點擊／輸入／上傳／送審／審核操作執行。UI流程不得以API或DB mutation代替；API、DB與log只用來建立經授權fixture、取得前後baseline、注入受控故障、驗證負向結果與cleanup。禁止連線或寫入production。

## 2. Entry Criteria

- DEV-053已完成Implementation Readiness Review與本機產品實作；產品程式凍結後才交QC；
- DEV-052 lifecycle V2與DEV-053 rollout flag只在isolated local target開啟；production flag維持off；
- 測試target、DB、file storage與登入帳號均可證明不屬於production；
- 可建立至少四種角色：研發owner、研發主管/reviewer、PDM Admin、唯讀使用者；另有第二公司fixture；
- 可保存DB baseline、request log、console、screenshots、uploaded test files與cleanup manifest；
- 若無法使用真實browser session或真實file chooser，判定blocked，不以終端API成功冒充UI驗證。

## 3. Test Fixtures

| ID | Fixture | Initial facts | Expected top-level row |
|---|---|---|---|
| F1 | 新建單圖bundle | no workspace | 建立後1個candidate bundle row |
| F2 | 新建多圖bundle | 1 workspace、3 drawing drafts | 正式化前1個candidate bundle row |
| F3 | 既有active保留號 | existing workspace/reservations，無candidate revision | `drawing_preparation`，read zero-write |
| F4 | bundle ready | candidates、relations、finalized file evidence齊全 | `bundle_ready` |
| F5 | bundle review pending | locked snapshot | `in_review` |
| F6 | formalization recovery | approved snapshot + apply_failed，無partial formal rows | `recovery_required` |
| F7 | formal drawing，研發版核准未Released | formal master + effective ReviewApproved | `official_controlled` |
| F8 | released drawing + no draft | released current revision | `released` |
| F9 | released drawing + active submitted review | revision submission pending | `revision_in_review`；未提交local draft不進統一清單stage |
| F10 | cancelled workspace | recycled/terminal | 只在history範圍 |
| F11 | inconsistent lineage | conflicting source link or impossible state | recovery/error，無重複可操作列 |
| F12 | cross-company twin codes | 第二公司相同display code | 不可見、不洩漏 |
| F13 | append part to existing drawing | source drawing + new candidate part + relationship intent | 1個candidate bundle row；不複製existing revision |
| F14 | append drawing to existing part | source part + candidate first drawing + link type | 1個candidate bundle row；核准後1個new formal drawing row |

每個fixture保存workspace/reservation/candidate/master/revision/approval/audit/outbox row count、IDs、codes、states、rowVersions與snapshot hashes baseline。

## 4. AI Real-operation Script

### RO-00 Environment proof

1. 記錄base URL、process、database path/host、feature flags與登入actor；
2. 證明`productionConnected=false`、`productionWrites=false`；
3. 保存baseline與測試run ID；
4. 若target identity不明或可能指向production，立即停止。

### RO-01 Single-page navigation

1. 以研發owner登入；
2. 真實開啟`/numbering/drawings`並hard reload；
3. 確認H1為`圖號工作台`，畫面沒有`圖號總表／保留號`頁籤；
4. 確認只有搜尋、範圍、階段篩選、`建立圖號`與單一清單；
5. 開啟`?tab=reserved`、`?tab=official`與未知tab，驗證都安全到同一工作台，其中reserved等效`工作中`；
6. 比對前後DB/audit/outbox/receipt/sequence，全部零變更。

### RO-02 Existing reservation advances without migration

1. 搜尋F3候選號；
2. 確認只出現一列，stage為首版準備，usage為尚不可正式使用；
3. 開drawer，確認唯一primary CTA為`完成首版`；
4. 關閉、重新開啟、重新整理、改filter；
5. 驗證沒有lazy create candidate revision、回填、改號或rowVersion變更。

### RO-03 Create a real single-drawing work item

1. 點`建立圖號`；
2. 真實輸入品名、系列與圖料關係，關閉一次確認未寫入；
3. 重新開啟並提交；
4. 驗證建立candidate workspace而非drawing master；
5. 清單只新增1個candidate bundle row，CTA依缺項為`繼續建立`或`完成首版`。

### RO-04 Controlled first-revision file operation

1. 從candidate row點`完成首版`；
2. 真實輸入建議研發版次並用browser file chooser上傳測試CAD/PDF；
3. 指定primary file並完成finalized evidence；
4. 確認檔案只存在candidate revision authority，master attachment無相同controlled write；
5. 回到清單，stage/CTA隨server response變更，不靠client optimistic promotion。

### RO-05 Submit, withdraw and resubmit

1. bundle ready時確認唯一primary CTA為`送交審核`；
2. 點擊並閱讀confirmation摘要，真實送審；
3. 重載後確認`查看審核`為唯一primary；
4. 以owner真實撤回，修改內容後重新送審；
5. 驗證snapshot version、lock與idempotency正確，沒有第二個number-only review或人工發布入口。

### RO-06 Reviewer and atomic formalization

1. 以reviewer登入，從`我的待處理`找到F2或新建多圖bundle；
2. 真實開審核、檢視三張圖與檔案證據並核准；
3. 核准後畫面顯示系統正式化，不要求第二次人工發布；
4. 完成後刷新：原1個candidate bundle row離開top-level，出現3個formal drawing rows；
5. 每個正式圖號只一列，來源workspace只在drawer追溯；
6. 連續reload與重進三次，不增加master、revision、audit、receipt或outbox。

### RO-07 Search and deep-link continuity

1. 分別以舊候選圖號、正式圖號、品名、關聯料號、來源workspace ID搜尋RO-06資料；
2. 驗證定位到canonical row，無候選＋正式雙列；
3. 測試舊candidate detail與formal detail deep link；
4. 無權／不存在target顯示安全返回，保留query/filter且零寫入。

### RO-08 Formal revision next actions

1. 開F7，確認唯一primary為`查看圖面`且清楚說明研發版未Released；
2. 開F8，確認唯一primary為`建立新版`；
3. 實際進入既有版次工作台建立新版草稿，確認`繼續編輯`／`送交審核`只由該工作台local state呈現；hard reload前後，統一清單不得虛構`revision_drafting`或`revision_ready`；
4. 真實補齊並送審後，統一清單才依server submission顯示`revision_in_review`與`查看審核`；
5. 全程不顯示candidate首版或人工正式發布捷徑，minor Released gate仍fail closed。

### RO-09 Contextual append routing

1. 從正式drawing drawer點`新增同根圖號`與`新增同圖料號`，另從正式part context建立同根新圖號；
2. 真實輸入並提交，擷取network證明帶`Idempotency-Key`且只呼叫candidate workspace command；
3. 驗證`append_part`保存`sourceDrawingNumberId`與`sourceLinkType`；`append_drawing`保存`sourcePartNumberId`與`sourceLinkType`。兩者source都與workspace root/company一致，且已進candidate facts hash；
4. relationship-only `append_part`只審核新candidate part與關係事實，不建立、複製或重新核准existing drawing revision；
5. 核准後驗證原atomic transaction建立new formal part/drawing與cross-boundary relation；受控失敗時master/link/promotion/package全部rollback，retry沿用同一approved snapshot；
6. 驗證原direct master POST未被UI呼叫，master count直到整包核准前不變；
7. 對未核准測試workspace執行取消，確認候選號依規則釋出。

### RO-10 Failure and recovery

1. 讓unified read的workspace或master source受控失敗，確認整頁error+retry，不回partial rows；
2. 讓action使用stale rowVersion，確認409後refresh，不自動重送；
3. 注入formalization apply failure，確認沒有partial formal rows；
4. 一般owner只可`查看處理狀態`；有權Admin可真實點`重試正式化`；
5. 重試只使用原approved snapshot且exactly once。

### RO-11 Permission and company boundary

1. 依序以owner、reviewer、Admin、readonly登入，比對`mine/work/all`與CTA；
2. 驗證Admin沒有對應permission時仍不能執行command；
3. 以第二公司rowKey、display code、workspace ID、drawing ID探測list/detail/action；
4. 驗證403/404、無存在性洩漏、無cross-company row或filter option。

### RO-12 Responsive, keyboard and visible-state

在1440×900、1280×720、1024×768、390×844逐一：

1. 搜尋、切換view/stage、開關drawer、執行primary CTA；
2. 驗證無整頁非預期水平overflow、欄位與CTA不裁切／重疊；
3. 驗證keyboard tab order、visible focus、Enter/Space、Escape、drawer focus return與modal focus trap；
4. 掃描可見文字、console、failed requests、React hydration與accessibility errors；
5. 執行5秒理解與紅筆刪除：保留文字都必須影響目前判斷或下一步。

### RO-13 Cleanup and preservation proof

1. 取消／移除所有未正式化測試workspace與測試檔案；
2. 正式化fixture只存在isolated disposable DB，整個test target可丟棄；
3. 比對使用者既有本機資料baseline，非fixture rows零變更；
4. 保存cleanup manifest、remaining IDs、production false證據與所有artifact paths；
5. cleanup不完整則QC不得判定Passed。

## 5. Contract/API Test Matrix

| ID | Test | Expected |
|---|---|---|
| API-01 | list response schema、rowKind與rowKey | discriminated、stable、無raw authority洩漏 |
| API-02 | server-side union | browser只呼叫unified list/detail，不自行拼接 |
| API-03 | source failure | request fail whole，不回partial rows |
| API-04 | F2 pre/post formalization | 1 candidate row → 3 formal rows；無completed workspace duplicate |
| API-05 | search aliases | candidate/formal/part/name/workspace均到canonical row |
| API-06 | pagination | unchanged dataset無漏列／重列，order tuple穩定 |
| API-07 | `mine/work/all` | responsibility與permission交集正確 |
| API-08 | action resolver | list/detail同一stage只回一個primary action |
| API-09 | zero-write reads | list/detail/filter/cursor/deep link無business/audit/receipt/outbox write |
| API-10 | stale action | 409 + refresh，無optimistic promotion或自動重送 |
| API-11 | identity conflict | recovery/error，無猜測去重或兩個可操作列 |
| API-12 | cross-company spoof | fail closed且無資料洩漏 |
| API-13 | opaque cursor | 包含version/filterHash/updatedAt/rowKey；tamper、filter mismatch與unsupported version回400 |
| API-14 | source context validation | source drawing/part同company/root、互斥、link type與state fail closed |
| API-15 | relationship-only append | 無candidate drawing仍可在合法source drawing下送整包審核；snapshot與formal relation一致 |
| API-16 | consistent transaction | Postgres repeatable-read/read-only或SQLite bounded read transaction；同response不混合前後狀態 |

## 6. UI/UX Assertions

- H1固定`圖號工作台`，不存在可見`圖號總表／保留號`頁籤；
- `保留號`只作狀態或歷史語言，不再是頁面名稱；
- 主表固定`圖號／品名／目前階段／下一步`，多圖bundle以`主要圖號 + N`摘要；
- 正常列與drawer最多一個primary CTA，文字與SPEC第6節一致；
- `auto_finalizing`明確說明不需人工操作；
- blocked/disabled首句說明原因與下一步，不只顯示`未開放`；
- raw enum、rowVersion、snapshot hash、API path、DEV ID、storage path不進主畫面；
- detail/audit允許更完整資訊，但仍不得洩漏secret、signed URL或跨公司資料。

## 7. Regression Gates

- DEV-052 lifecycle projection、legacy active/pending/approved、bundle review、atomicity、idempotency與recovery；
- DEV-050 suggestion snapshot、minor revision Released rejection與major release flow；
- DEV-051正式圖號進版handoff與不把rowVersion當圖面版次；
- drawing master search/filter/detail、relations、trace/impact與obsolete request；
- production slice default-off與route compatibility；
- lint、TypeScript、isolated production build。

## 8. Execution and Phase Traceability

| Phase | AI verification entry | Required command/evidence |
|---|---|---|
| 1A read foundation | schema、source validation、read-model、HTTP、zero-write、DEV-052 regression | `npm run qc:dev-053:schema`、`npm run qc:dev-053:read-model`、`npm run qc:dev-053:http`、`npm run qc:dev-052` |
| 1B single-page UI | RO-01、02、07、08、12；UI/API network contract | `npm run qc:dev-053:ui` + four-viewport browser evidence |
| 1C contextual append | RO-03～06、09～11；atomic/idempotency/permission | `npm run qc:dev-053:flow` + focused contextual/attachment/release regressions |
| 1D final QA/QC | RO-00～13、cleanup、full regression、type/build | `npm run qc:dev-053:real-operation`、`npm run qc:dev-053`、`npm run typecheck`、`npm run lint`、`npm run build:isolated` |

Expected script files：

- `scripts/qc-dev-053-drawing-workbench-schema.mjs`
- `scripts/qc-dev-053-drawing-workbench-read-model.mjs`
- `scripts/qc-dev-053-drawing-workbench-http.mjs`
- `scripts/qc-dev-053-drawing-workbench-ui.mjs`
- `scripts/qc-dev-053-drawing-workbench-flow.mjs`
- `scripts/qc-dev-053-drawing-workbench-real-operation.mjs`

若phase script、fixture isolation或artifact directory尚未建立，對應case標記`Not Run`，不得手動挑幾個API結果推定phase通過。

## 9. Evidence Package

每次執行建立唯一run目錄，至少包含：

- `run-manifest.json`：target、commit/source hash、flags、actors、productionConnected=false、productionWrites=false；
- `baseline-before.json`、`baseline-after.json`、`cleanup.json`；
- `api-contract-results.json`、`permission-results.json`、`zero-write-results.json`；
- `browser-events.json`、`network-summary.json`、`console-summary.json`、`visible-error-summary.json`；
- RO-01至RO-13關鍵screenshots，含四種viewport；
- 測試檔案名稱/hash與authority readback，不保存secret或signed URL；
- command/test output與independent QC summary。

QA只制定與執行計畫，不預填通過。沒有事實證據的case標記`Not Run`或`Blocked`。

## 10. Pass/Fail Rules

Passed需同時滿足：

1. 所有P0/P1 case通過，P2無影響資料安全、權限、主流程或可及性的未解問題；
2. RO-00～RO-13由AI真實操作完成且cleanup完整；
3. 多圖bundle row transition、zero-write、server-side composition、parallel-path closure、file authority與cross-company全部通過；
4. DEV-052/050/051 regression、lint、TypeScript與isolated build通過；
5. independent QC在RD freeze後重跑，不以RD self-check代替。

以下任一項直接Fail／Stop：

- 看到候選與正式重複top-level row，或多圖正式化遺失任一圖號；
- unified source失敗時仍顯示partial list；
- list/detail/old URL產生任何未授權write；
- direct master create仍可由DEV-053 UI到達；
- controlled file存在兩個可寫authority；
- 無權限／跨公司可見或可操作；
- minor revision成為Released，或核准後要求人工正式發布；
- production target/credential/data被連線或修改；
- AI未能完成真實UI操作卻以API/DB結果宣稱通過。

## 11. Release Boundary

本QA plan不授權staging或production。production前另需deployment-release gate，至少確認target identity、backup/restore、migration判定、old/new app compatibility、feature-flag rollout/rollback、named-user smoke與既有production保留號read-only preservation evidence。
