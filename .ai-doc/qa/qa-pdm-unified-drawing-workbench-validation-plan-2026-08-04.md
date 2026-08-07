# QA Plan：DEV-053 單一圖號工作台（由 AI 執行的真實操作驗證計畫）

Status: `Phase 1H Focused AI QA + Independent QC Passed / Full AI Real-Operation Revalidation Ready / Production Release Gated`
Date: 2026-08-05
Owner: QA
Executor: AI QA/QC agent after local implementation freeze
Related DEV: `DEV-053`
Related SPEC: `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`; `.ai-doc/decisions/ADR-PDM-APPROVAL-PLATFORM-003-drawing-revision-lifecycle-only-retention.md`

## 1. Objective and Boundary

驗證單一圖號工作台確實讓使用者不分頁即可判斷生命週期與下一步，同時證明UI合併沒有造成既有圖號、料號、版次、附件、送審、關係、影響與治理能力退化，也沒有重複列、錯誤CTA、權限放寬、受控檔案雙authority或既有資料寫入。

本計畫由AI在隔離本機環境使用真實瀏覽器、真實登入session、真實點擊／輸入／上傳／送審／審核操作執行。UI流程不得以API或DB mutation代替；API、DB與log只用來建立經授權fixture、取得前後baseline、注入受控故障、驗證負向結果與cleanup。禁止連線或寫入production。

2026-08-05 regression reopening：先前run只驗證新生命週期主線，未以舊正式圖面能力清冊逐項驗證，因此錯把最小formal drawer判為PASS。該run保留為歷史證據，但不得作為Phase 1E產品驗收或獨立QC通過依據。

## 1A. Phase 1F Reopen QA Delta

Phase 1E的focused與隔離Chromium結果只保留為歷史基線。Phase 1F必須新增以下gate，且任何一項失敗都不得用既有27/27、link count、static fragment或直接API/DB mutation覆蓋：

| ID | Acceptance / operation | Required evidence |
|---|---|---|
| F1-QA-01 | 以正常`npm run dev:local`／固定3000契約啟動，不由測試runner獨占注入`PDM_PUBLICATION_EVIDENCE_MODE=local_fake`；新建可清理fixture從候選首版上傳推進到可送審 | startup env manifest、UI steps、network、candidate readiness與production=false evidence |
| F1-QA-02 | browser一次選取多檔並逐檔設定說明、分類與primary；每圖至少一個active primary finalized controlled file即可送審，缺PDF/DWG/DXF/3D只警告。受控檔與參考附件的可寫authority、標籤、資格與權限一致 | file chooser、逐檔payload/readback、partial failure/retry、warning snapshot、negative authority checks |
| F1-QA-03 | 首次進入固定`view=all&history=exclude`，可找到candidate、正式受控與已發布；歷史只在`包含歷史`或terminal deep link顯示。`我的待處理／工作中／全部`符合server projection且不受localStorage舊值影響 | scopes/history screenshots、URL、row facts、zero-write hash |
| F1-QA-04 | drawer內`圖面進版／上傳與送審`使用同一共享revision workbench；`完整圖料關係／製造影響／主資料／歷史`逐一到既有專用頁並可返回原列；代表性任務必須完成，只驗證link存在判定失敗 | click log、URL/returnTo、visible task result、allowed fixture before/after facts |
| F1-QA-05 | 送審blocker的處理附件、補主資料、修正關係皆直達可執行入口，不回到唯讀摘要或形成loop | blocker state、CTA destination、completed recovery、return-to-submit evidence |
| F1-QA-06 | 快速連續搜尋、切filter、換頁時只接受最後request；選取列離開結果後drawer與cursor狀態同步清除／重對齊 | delayed-response injection、DOM row/detail match、cursor assertions |
| F1-QA-07 | 完整keyboard/focus restore可操作；401/403/404/409/5xx、empty、blocked、Rejected correction與terminal通過Now What Test。403顯示exact permission/contact role，只有具`settings.admin_matrix`的Admin可到`/settings/workflow` | aria-keyshortcuts、role matrix、capability response、state screenshots與direct API negative checks |
| F1-QA-08 | 可見UI沒有`cad_3d`、`drawing_2d`、raw `finalized`等非必要工程詞；首版計數、stage與usage沒有矛盾或同義重複 | rendered text sweep、counter sanity、red-pen review |
| F1-QA-09 | 可見`建立圖號`與accessible name一致；1440×900、1024×768、390×844無裁切、overflow或drawer scroll責任混亂 | accessibility tree、keyboard focus、viewport screenshots |
| F1-QA-10 | 既有正式／保留資料只讀且business hash不變；所有寫入使用新建可清理fixture | before/after hashes、fixture manifest、cleanup receipt |
| F1-QA-11 | current scoped SHA含完整DEV-053修正且不含DEV-054；乾淨worktree與固定3000重跑同一產品snapshot | scoped diff、SHA、DEV-054 unchanged manifest、command results |
| F1-QA-12 | 既有candidate受控檔已保存但缺evidence時，AI從UI點`驗證既有檔案`，不使用file chooser、不建立新asset；成功後送審解鎖。另驗證冪等重播、部分成功保留、hash mismatch 409零寫入與production fail-closed | UI click/network、file/asset IDs前後、physical SHA-256、evidence/audit/receipt counts、negative-state readback |

AI QA執行責任：所有secondary入口必須真實導覽；檔案、送審、撤回、再送審與核准必須由UI操作。API／DB只作baseline、fixture、fault injection、readback與cleanup證據。

本計畫採用的Human Decisions：`1A`自動驗證後ready但不自動送審、`2A`受控檔／參考附件分權威、`3A`高頻drawer＋低頻專用頁、`4A`一個主要受控檔即可送審、`5B`預設不含歷史、`6A`exact permission與Admin導流。測試不得自行改回更嚴格檔案格式blocker、預設含全部歷史或角色推定權限。

## 1B. Phase 1F AI Execution Result

- Aggregate command：`npm run qc:dev-053`，exit 0。
- Focused contracts：schema 9/9、read model 10/10、HTTP 14/14、UI 21/21、flow 7/7；TypeScript PASS。
- 真實操作：`DEV053-20260805-131319-local-isolated`；existing-file recovery、hash mismatch負向案例與原生命週期主線全部PASS，browser非預期error 0、5xx 0、visible error 0。
- 資料安全：`productionConnected=false`、`productionWrites=false`、cleanup=`removed`；production fail-closed contract通過。
- Runtime/build：固定3000以使用者指定的既有A0005真實點擊`驗證既有檔案（2）`；原兩個asset/file不變、physical SHA-256與DB/evidence相符、送審enabled、console error 0，QC未點送審。optimized production build通過。
- 判定：F1-QA-01～12對應的local product gate無未解P0/P1/P2；commit與production release仍未授權。

## 1C. Fixed-3000 Existing-file Recovery Execution

1. AI以既有登入session開啟A0005，確認兩檔皆顯示需驗證、`驗證既有檔案（2）`唯一可用，送審尚未解鎖。
2. AI只點擊該恢復CTA，不使用file chooser、不呼叫DB/API替代UI動作。
3. UI逐檔呼叫authoritative PATCH；完成後未驗證標記0、驗證完成標記2、恢復CTA消失、`主要受控檔已完成，可送審。`可見，送審控制enabled，console errors 0。
4. DB readback確認candidate仍為`draft`、`approval_request_id=NULL`、row version 6；兩個原file/asset ID不變，各連結一筆evidence，另有兩筆audit與兩筆completed receipt。
5. 實體repository兩檔size及SHA-256與`file_assets`、`numbering_publication_evidence`一致；未送審、未改檔、未改號。

## 2. Entry Criteria

- DEV-053 Phase 1F已完成1F-1～1F-4；AI QA以current source hash與隔離run manifest完成判定，Git commit SHA仍待使用者另行授權；
- DEV-052 lifecycle V2與DEV-053 rollout flag可在正常固定3000 development target及isolated local target開啟，但證據必須分別標示啟動契約與環境；production flag維持off；
- 測試target、DB、file storage與登入帳號均可證明不屬於production；
- 可建立至少四種角色：研發owner、研發主管/reviewer、PDM Admin、唯讀使用者；另有第二公司fixture；
- 可保存DB baseline、request log、console、screenshots、uploaded test files與cleanup manifest；
- 若無法使用真實browser session或真實file chooser，判定blocked，不以終端API成功冒充UI驗證。
- DEV-054受保護基線已保存；測試前後必須證明DVT/開發階段移除、023 migration、DEV-054文件與其刪檔語意未被DEV-053修改或還原。

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
5. 無query第一次進入應為`全部`且`包含歷史`關閉；切換包含歷史後才出現F10，重新開無query不沿用localStorage舊範圍；
6. 開啟`?tab=reserved`、`?tab=official`與未知tab，驗證都安全到同一工作台，其中reserved等效`工作中`；
7. 比對前後DB/audit/outbox/receipt/sequence，全部零變更。

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
2. 真實輸入建議研發版次並用browser file chooser一次選取至少三個檔案，逐檔設定類別、說明與primary；
3. 注入其中一檔hash／evidence失敗：其他成功檔保留，失敗檔可重試或移除；完成一個active primary finalized controlled file後即顯示可送審，不出現額外「完成準備」按鈕；
4. 刻意缺少PDF或DWG/3D其中一類，確認只顯示warning且送審仍可按，confirmation/review snapshot可見warning；
5. 確認檔案只存在candidate revision authority，master reference attachment無相同controlled write；
6. 回到清單，stage/CTA隨server response變更，不靠client optimistic promotion，也不自動送審。

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
5. 注入前一個搜尋延遲後快速連續輸入三組keyword；只允許最後response更新列表。切view/filter/history時page/cursor歸零，選取列離開結果時drawer關閉並移除detail。
6. 直接開Obsolete/Merged/cancelled deep link時自動包含歷史；Rejected顯示`建立修正版`，不被歸為只能查看的terminal。

### RO-08 Formal revision next actions

1. 開F7，確認唯一primary為`查看圖面`且清楚說明研發版未Released；
2. 開F8，確認唯一primary為`建立新版`；
3. 在drawer點`圖面進版`與`上傳與送審`，確認兩者開啟同一共享revision workbench但focus不同；再以既有`/numbering/revisions`wrapper確認相同資料與mutation結果；
4. 建立新版草稿，確認`繼續編輯`／`送交審核`只由該工作台local state呈現；hard reload前後，統一清單不得虛構`revision_drafting`或`revision_ready`；
5. 真實補齊並送審後，統一清單才依server submission顯示`revision_in_review`與`查看審核`；
6. 全程不顯示candidate首版或人工正式發布捷徑，minor Released gate仍fail closed。

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
5. 對每個disabled action比對detail capability與direct API；畫面顯示exact permission code及聯絡角色。readonly不得看到權限管理連結；具有`settings.admin_matrix`／`canManagePermissions`的Admin可點到`/settings/workflow`。

### RO-12 Responsive, keyboard and visible-state

在1440×900、1280×720、1024×768、390×844逐一：

1. 搜尋、切換view/stage、開關drawer、執行primary CTA；
2. 驗證無整頁非預期水平overflow、欄位與CTA不裁切／重疊；
3. 驗證列的ArrowUp/Down、Home/End、PageUp/Down、Enter、Esc、Ctrl/Cmd+C、visible focus、drawer focus return與modal focus trap；input/select/textarea內不得被列快捷鍵攔截；
4. 掃描可見文字、console、failed requests、React hydration與accessibility errors；
5. 執行5秒理解與紅筆刪除：保留文字都必須影響目前判斷或下一步。

### RO-13 Cleanup and preservation proof

1. 取消／移除所有未正式化測試workspace與測試檔案；
2. 正式化fixture只存在isolated disposable DB，整個test target可丟棄；
3. 比對使用者既有本機資料baseline，非fixture rows零變更；
4. 保存cleanup manifest、remaining IDs、production false證據與所有artifact paths；
5. cleanup不完整則QC不得判定Passed。

### RO-14 Formal-drawing capability preservation

對至少一筆有關聯料號、正式版次、待審/發布治理資訊與附件的formal drawing，以真實UI逐項驗證SPEC `CAP-01`～`CAP-14`：

1. 使用關鍵字、系列、用途與資料狀態查詢；確認關聯料號、主資料狀態、待審、發布不一致與警告可發現，且沒有開發階段/DVT filter或顯示；
2. 開啟formal drawer，確認生命週期primary CTA只有一個，並可發現`圖面進版`、`上傳與送審`、`完整圖料關係`、適用時的`影響分析`與`申請作廢`secondary operations；
3. 逐區確認發布不一致、Title block變體風險、送審完整性/成本/待審檢查、同根料號、標準成本與主要製造圖；
4. 以有權與無權角色驗證材質、顏色、表面處理與變體備註編輯，並驗證Released/locked、stale與cross-company fail closed；
5. 確認`受控版次檔案`唯讀且只能從candidate/revision authority寫入；以有權角色在`參考附件`完成多檔加入、說明、預覽重建、Drive重試、刪除／還原與補件申請／決策，以無權角色驗證唯讀與6A guidance；參考附件不得進送審/publication evidence；
6. 在production slice開啟時，受封鎖入口須可見`未開放`原因，不得直接消失；不得因此操作3000資料；
7. 比對DEV-054 protected diff，確認沒有恢復DVT/開發階段、修改023 migration/DEV-054文件或還原其刪檔。

## 5. Contract/API Test Matrix

### RO-15 Fixed localhost 3000 runtime parity

目的：防止隔離runner通過、但使用者固定3000仍被production slice鎖住的環境漂移。

1. 以`npm run dev:local:restart`啟動固定`http://127.0.0.1:3000`，不得手動改production設定或連線production。
2. 讀取`GET /api/production-slice/status`，應為`configured=false`、`active=false`、`localFullFunctionValidation=true`。
3. 先保存既有正式／保留資料business hash，只對新建且可清理的QA fixture執行mutation；既有A0005類資料只作搜尋、開啟與readback。
4. 在正常3000由真實browser完成fixture的candidate revision、多檔上傳、自動evidence verification與可送審；startup/run manifest不得由runner獨占注入`PDM_PUBLICATION_EVIDENCE_MODE=local_fake`。
5. 至少完成一次送審、撤回、再送審、reviewer核准與原子正式化；cleanup後既有資料hash不變，fixture處置完整。
6. 開啟formal drawing並完成1F-QA-04／RO-14代表性secondary任務；不得只數link。
7. 以contract test證明`NODE_ENV=production`時`PDM_LOCAL_FULL_FUNCTION_VALIDATION=true`不能產生本機evidence或關閉production slice；production allowlist維持不變。

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
| API-17 | `history=exclude|include`與terminal deep link | default exclude；include才回history_only，deep link canonicalize且零寫入 |
| API-18 | capabilities/403 guidance | server-derived，permission code/contact role正確；Admin link只對`settings.admin_matrix`／canManagePermissions |
| API-19 | normal-local evidence | stored object hash read-back後才finalized；production與hash failure均fail closed |

## 6. UI/UX Assertions

- H1固定`圖號工作台`，不存在可見`圖號總表／保留號`頁籤；
- `保留號`只作狀態或歷史語言，不再是頁面名稱；
- 主表核心為`圖號／品名／工作狀態／下一步`，多圖bundle以`主要圖號 + N`摘要；formal row另可發現關聯料號、主資料狀態、待審、發布不一致與警告；工作狀態不得被解讀為專案階段；
- 正常列與drawer最多一個primary CTA，文字與SPEC第6節一致；
- formal drawer可同時呈現不競爭primary的版次、送審、關係、影響、作廢與治理secondary operations；
- `auto_finalizing`明確說明不需人工操作；
- blocked/disabled首句說明原因與下一步，不只顯示`未開放`；
- raw enum、rowVersion、snapshot hash、API path、DEV ID、storage path不進主畫面；
- detail/audit允許更完整資訊，但仍不得洩漏secret、signed URL或跨公司資料。

## 7. Regression Gates

- DEV-052 lifecycle projection、legacy active/pending/approved、bundle review、atomicity、idempotency與recovery；
- DEV-050 suggestion snapshot、minor revision Released rejection與major release flow；
- DEV-051正式圖號進版handoff與不把rowVersion當圖面版次；
- drawing master search/filter/detail、relations、trace/impact與obsolete request；
- drawing master attachment authority、同根料號、主資料編輯、標準成本、主要製造圖、發布不一致、Title block與送審檢查；
- production slice default-off與route compatibility；
- DEV-054 protected diff：不得恢復development phase/DVT、修改023 migration或其文件/刪檔；
- lint、TypeScript、isolated production build。

## 8. Execution and Phase Traceability

| Phase | AI verification entry | Required command/evidence |
|---|---|---|
| 1A read foundation | schema、source validation、read-model、HTTP、zero-write、DEV-052 regression | `npm run qc:dev-053:schema`、`npm run qc:dev-053:read-model`、`npm run qc:dev-053:http`、`npm run qc:dev-052` |
| 1B single-page UI | Rejected；舊run只保留歷史證據 | 不得沿用PASS |
| 1C contextual append | RO-03～06、09～11；atomic/idempotency/permission | `npm run qc:dev-053:flow` + focused contextual/attachment/release regressions |
| 1D prior QA/QC | Reopened；capability inventory缺漏 | 歷史run不得作為產品完成證據 |
| 1E capability restoration | RO-00～14、formal capability inventory、cleanup、full regression、type/build、DEV-054 protected diff | `npm run qc:dev-053:real-operation`、`npm run qc:dev-053`、focused master/attachment/revision/relation/production-slice tests、`npm run typecheck`、`npm run lint`、`npm run build:isolated` |
| 1F-1 normal-3000 closure | RO-04、RO-05、RO-15、API-19；4A warning/blocker與production negative | `npm run qc:local-dev-entrypoint`、updated flow/real-operation、DEV-052 regression |
| 1F-2 state integrity | RO-01、RO-07、RO-10～12、API-06～13/17/18 | updated read-model/http/ui scripts |
| 1F-3 formal restoration | RO-08、RO-11、RO-14；shared revision與attachment authority真實操作 | master attachments、revision、relation、production-slice regressions |
| 1F-4 freeze/handoff | F1-QA-01～11、full regression、clean scoped SHA、DEV-054 unchanged | `npm run qc:dev-053`、real-operation、typecheck、lint、isolated build與evidence manifest |

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
- RO-01至RO-14關鍵screenshots，含四種viewport、formal drawer完整分區與production-slice visible-disabled狀態；
- 測試檔案名稱/hash與authority readback，不保存secret或signed URL；
- command/test output與independent QC summary。

QA只制定與執行計畫，不預填通過。沒有事實證據的case標記`Not Run`或`Blocked`。

## 9A. Historical Phase 1E AI QA Execution Record

歷史判定：`AI QA Passed`。本紀錄只證明Phase 1E當時的隔離產品快照；Phase 1F已因固定3000與16項缺口重新開啟，因此不得視為目前產品的AI QA PASS，也不得取代F1-QA-01～11的新證據。

- Run：`DEV053-20260805-033336-local-isolated`
- Frozen product snapshot：temporary clean-index commit `167199c6b13615d3b134009abb3ae4b87c73418d`；source hash `35868f50b3ca1451ed36757cdd80bac8357d280f6fb131582b9790863c668f8e`
- Target：isolated local SQLite + isolated Next.js + real Chromium UI
- Result：27/27 passed；browser errors 0；failed/5xx responses 0；visible errors 0；cleanup `removed`
- Safety：`productionConnected=false`、`productionWrites=false`
- Evidence：`output/playwright/dev053-real-operation/DEV053-20260805-033336-local-isolated/`
- 真實 UI 操作：舊reserved URL正規化、既有reservation在原流程往前、candidate/formal drawer、CAP-01～14、唯一primary CTA、建立同根圖號／同圖料號candidate、真實PDF file chooser上傳、送審confirmation、撤回、再送審、reviewer核准、自動正式化、正式受控附件readback、deep link與重複reload。
- DB/API 證據：讀取、搜尋、filter、drawer、responsive與reload前後business hashes不變；candidate mutation與正式化逐步readback；核准後正式root/part/drawing/link/package/file/review evidence原子存在；reload不重複建立business facts。
- Responsive：1440×900、1280×720、1024×768、390×844 均無document/main水平overflow；desktop維持table語意，mobile切為card layout。
- Capability preservation：formal row可見關聯料號、用途、資料狀態與治理摘要；formal drawer可發現圖面進版、上傳送審、完整圖料關係、製造影響、作廢、受控檔案摘要、送審檢查、同根料號、主資料、成本及主要製造圖；`圖面進版`只有一個主控制。
- Focused contract：schema 9/9、read model 8/8、HTTP 10/10、UI 16/16、flow 7/7，共50/50；全`src` TypeScript 0 error；DEV-053 lint 0 error（`master-attachment-panel.tsx`保留3個既有warning）。
- Clean-index verification：以只含DEV-053暫存內容的乾淨worktree重跑TypeScript與focused contracts，均通過；真實Chromium 27/27亦在同一product snapshot完成。
- Build note：RD暫存驗證曾在跨根`node_modules` junction環境遇到Next page contract異常；獨立QC改以短路徑、`npm ci`、乾淨detached worktree重跑凍結commit後，`npm run build:isolated`完整exit 0。前述現象不可重現，歸類為隔離環境產物而非產品缺陷。
- 未以 API/DB mutation 代替上述 UI 主流程；API/DB只用於隔離 fixture、前後狀態與 readback 證據。

## 9B. Historical Phase 1E Independent QC Execution Record

歷史判定：`PASS`；P0=0、P1=0、P2=0。此結論只適用下列凍結commit與隔離run，不適用目前Phase 1F／固定3000。

- Frozen commit：`6ddd5759e22178b7004e5d5a9927b0dfbe11b706`
- Run：`DEV053-20260805-035048-local-isolated`
- Result：27/27 passed；14 screenshots；browser errors 0；failed/5xx responses 0；visible errors 0
- Safety：`productionConnected=false`、`productionWrites=false`、cleanup `removed`
- Evidence：`output/playwright/dev053-real-operation/DEV053-20260805-035048-local-isolated/`
- Recheck：focused 50/50、TypeScript、scoped lint與`npm run build:isolated`全部通過；3個lint warnings均為凍結commit前既有行。
- Boundary：commit scope未含DEV-054、023/024 migrations、DVT/phase-gate/project-status removal；022 migration只做additive nullable extension，既有列保持NULL。
- Release：Phase 1F current-source local product/AI QC gate已通過；production migration、flag activation與release仍須另走deployment release gate。

歷史run `DEV053-20260804-090838-local-isolated`（19/19）因未覆蓋CAP-01～14，僅保留歷史，不得用於目前產品驗收。

## 9C. 2026-08-06 Current-source Independent QC Execution Record

目前判定：`PASS`；P0=0、P1=0、P2=0。獨立QC在RD freeze後從零重跑，沒有修改程式或測試。

- `npm run qc:dev-053`：schema 9/9、read model 10/10、HTTP 14/14、UI 21/21、flow 7/7、AI real-operation 31/31，共92/92，另含TypeScript PASS。
- Run：`output/playwright/dev053-real-operation/DEV053-20260806-015338-local-isolated/`；16張screenshots，browser/visible errors皆為0，`productionConnected=false`、`productionWrites=false`、cleanup=`removed`。
- Fixed 3000：A0005-M01在1280×720、1024×768、390×844均顯示`整包可送審`、兩個`主要受控檔 · 已完成驗證`及可見`送交審核`；document與drawer overflow皆0，visible alert與console warn/error皆0。證據位於`output/playwright/dev053-fixed-3000-qc/`，QC未點送審、未產生mutation。
- Regression：Phase 1C 45/45、Phase 1D 60/60、Phase 1B 17/17、DEV-052、lifecycle actions 266/266、obsolete 115/115、controlled history 56/56、release readiness 48/48與git boundary均通過。
- QC runner tracked-config污染在QC首次發現後退回RD；修正後Phase 1C/1D連跑及獨立重跑均證明`tsconfig.json`／`next-env.d.ts`前後SHA不變，沒有新增`.tmp/next-qc-*`。
- DEV-054的8個protected hashes在測前／測後完全一致。Post-change convergence為`No contract drift`；不新增ADR，production release gate維持關閉。

## 9D. Phase 1G 由 AI 執行的多料號真實操作驗證計畫與本輪結果

目標：證明一張圖面可帶多個料號進入同一送審，且任何資料／關係失敗都不留下部分正式化。既有A0005只允許read/select驗證，不得送出或改寫；mutation使用隔離fixture或repository transaction。

| Case | AI真實操作／事實驗證 | Expected | 本輪結果 |
|---|---|---|---|
| MP-01 | 固定3000登入後解析A0005-M01 | 顯示P01/P02/P03三個checkbox且預設全選 | PASS |
| MP-02 | 取消P03再重選 | CTA與摘要3→2→3即時一致，選取期間不送出 | PASS |
| MP-03 | 檢查本次範圍readiness | 每個選中料號各自列出材質／表面處理缺口，任一未完成就整批disabled | PASS |
| MP-04 | 建立多料號submission fixture | 一個submission、三個唯一scope、共用revision/attachments/FFF，legacy anchor仍可讀 | PASS，`qc:pdm-release-master-status-sync` |
| MP-05 | 核准／正式化三料號fixture | 三個item/part在同一transaction更新，result回傳完整parts | PASS，45/45 suite |
| MP-06 | 正式化前移除或改變其中一個drawing-part link | 整筆release rollback，其他兩個也不得更新 | PASS，45/45 suite |
| MP-07 | 搜尋P01/P02/P03歷史 | 三者都能追到同一submission，batch detail顯示scope | Code path/type/security PASS；完整隔離UI evidence待下一次full real-operation run |
| MP-08 | 多料號confirmed impact | UI/server fail closed並說明每個舊料號需自己的替代料號 | Contract/static guard PASS；逐料號替代流程不在本phase |
| MP-09 | RWD/console/overflow | 1280 viewport三張卡均在main邊界，console error 0、document overflow 0 | PASS |
| MP-10 | production/reserved protection | A0005不送出、不回填、不改號；025不套用production | PASS（本輪僅本機read/select與隔離transaction） |

本輪證據命令：TypeScript、production build、drawing-part security、access-control async repository 236/236、change-control 62/62、atomic release 45/45、Supabase runtime migration mirror。舊`qc:pdm-drawing-submission-workbench-mutation`仍為FAIL 22/33：其release fixture使用小數版0.1，與現行`minor_revision_cannot_be_released`政策衝突，另含舊nonBlockingHistory read-model期待；此結果記為既有測試契約債，不以放寬production policy修測試。

## 9E. 標準成本選填驗證

| Case | AI操作／檢查 | Expected |
|---|---|---|
| COST-OPT-01 | 開啟三個同根料號皆無標準成本、其餘必要資料完整的formal drawer | `送審檢查`顯示`資料已備妥`；標準成本顯示`3 筆未設定・選填`且不是紅色阻擋 |
| COST-OPT-02 | 同時存在N筆主資料缺口與3筆未設定成本 | `待補`只計N筆主資料；成本3筆不加入總數 |
| COST-OPT-03 | 由同根料號卡點擊`補成本` | 成本維護入口仍可達；不因改為選填而刪除成本功能 |
| COST-OPT-04 | 從圖料查詢drawer查看相同圖號 | 標準成本顯示`未設定（選填）`且為中性tone，不使用danger |
| COST-OPT-05 | targeted static contract、TypeScript及固定3000真實渲染 | 全部通過；無visible error或非預期overflow |

Fail：成本缺漏仍增加`待補`、顯示紅色阻擋、停用送審，或成本維護入口消失。此delta不改schema／API／既有成本資料，也不得修改DEV-054。

本輪結果：COST-OPT-01～05 PASS。固定3000的A0005-M01實際有P01/P02/P03三筆未設定標準成本，formal drawer顯示`資料已備妥`、`3 筆未設定・選填`、panel=`is-ready`、cost chip=`is-default`；圖料查詢drawer顯示`3 筆未設定（選填）`且icon為中性色。1280×720兩入口visible error皆0、document horizontal overflow皆0；未送審、未修改A0005資料。

## 9F. 版次意圖鎖定驗證

| Case | AI操作／檢查 | Expected |
|---|---|---|
| REV-LOCK-01 | 以系統建議版次 0.2 選入兩個新版檔案，按「加入附件庫」 | context refresh後仍為版次 0.2；兩檔仍屬本次送審，不被改成 0.3 或參考檔 |
| REV-LOCK-02 | 檢查送審按鈕與附件狀態 | 0.2附件出現在可選清單並可勾選；CTA不因自動跳版而消失 |
| REV-LOCK-03 | 重新解析另一圖號 | 版次意圖鎖定重置，新圖號可重新取得server建議版次 |

Fail：加入成功訊息與畫面目標版次不一致、已加入檔案被降為參考、或送審CTA因自動跳號重新停用。

## 9G. Phase 1H AI執行的真實操作與資料邊界驗證

本節定義並記錄Phase 1H實作後的QA/QC gate。測試使用隔離SQLite、PostgreSQL/Supabase mirror contract、真實登入session及真實browser；既有A0005與正式環境資料未被寫入，8B adoption只使用專門建立的production-like active fixtures。

| Case | Priority | AI操作／檢查 | Expected |
|---|---|---|---|
| H-QA-01 | P0 | 由Engineer在圖號工作台為一張圖、P01/P02/P03、兩個受控檔建立fresh Phase 1H送審 | 只建立一個native request與transient workflow；不建立legacy `submissions`、永久notification/audit；三料號與檔案數正確 |
| H-QA-02 | P0 | submitter送審後及assigned reviewer登入 | submitter唯一primary為`查看進度`；assigned reviewer唯一primary為`前往審核`；非assigned主管不可決策 |
| H-QA-03 | P0 | 原submitter在decision count 0撤回，再重送；另在第一decision後嘗試撤回 | 前者回`準備中`且保留檔案/scope；後者409 `DRAWING_LIFECYCLE_DECISION_ALREADY_STARTED`、零寫入 |
| H-QA-04 | P0 | reviewer分別以空理由與文字理由`退回修改`，由Engineer修正後重送 | 理由選填；有值只在current correction可見，成功重送同交易清空；兩次舊review graph均清除 |
| H-QA-05 | P0 | reviewer核准小數版與符合DEV-050政策的整數版 | 小數版為`研發受控`、整數版為`正式發布`；raw legacy status不得覆蓋；沒有第二個發布CTA |
| H-QA-06 | P0 | 最新0.3存在時補歷史0.2並核准，重開圖號、附件、tasks、KPI、inbox | 0.2列歷史、0.3仍最新版；所有表面無待審殘留且同一display status |
| H-QA-07 | P0 | 對H-QA-06 cleaned request開新exact URL | 依10B導向圖號最新版0.3；不開0.2審核／歷史頁，不顯示request tombstone |
| H-QA-08 | P1 | 開啟無drawing fallback且資料已不存在的pre-Phase-1H opaque bookmark | 安全回`/numbering/drawings`；不洩漏跨公司或已刪資料 |
| H-QA-09 | P0 | 建立可安全adopt的legacy active review，依序跑8B dry-run、apply、重跑apply | dry-run `blocked=0`；apply建立exact native bridge且不重播decision；legacy inbox消失、native inbox恰一筆；重跑冪等 |
| H-QA-10 | P0 | 建立各一個duplicate、terminal companion、scope collision及非流程child blocker | dry-run列明reason；任一blocker使完整activation set不apply、mode不可`enforced`、所有source hash不變 |
| H-QA-11 | P0 | 核准adopted active fixture並read back cleanup graph | legacy submission/FFF/event/audit/notification與native request/decision/event/target/snapshot/workflow皆0；package/files/P01-P03 scope完整 |
| H-QA-12 | P0 | 在terminal apply後、cleanup前注入故障，再由worker重試兩次 | UI立即顯示durable terminal state；不重做decision/apply；cleanup全有或全無且最後為0 |
| H-QA-13 | P0 | inspection current task/notification/outbox tables與API payload | 9B由package/current task projection成立；沒有submitter/reviewer/reason/request歷史或永久Phase 1H notification |
| H-QA-14 | P0 | 重播相同idempotency key、換actor/公司重播、時間推進超過7天 | 同權限重播不重做；換actor/公司重新授權且fail closed；token無禁存欄位並於7天內物理刪除 |
| H-QA-15 | P0 | 直接呼叫legacy approve/reject/cancel/return routes與legacy頁 | Phase 1H/adopted案件410 `DRAWING_LIFECYCLE_LEGACY_MUTATION_DISABLED`或canonical redirect，DB零寫入；其他domain不退化 |
| H-QA-16 | P0 | 跨公司、非assigned reviewer、Admin撤回override、直接表存取 | 全部403/404 fail closed；Admin無撤回override；新表RLS/revoke有效 |
| H-QA-17 | P0 | 嘗試刪除其他domain及completed/unknown approval/audit/companion rows | append-only/no-delete仍拒絕；narrow cleanup predicate不能越界 |
| H-QA-18 | P1 | 1440×900、1280×720、1024×768、390×844真實UI完整流程 | 5秒可辨狀態/下一步、正常狀態最多一個primary、理由清楚標`選填`、無內部ID/cleanup詞、overflow/console/visible error 0 |
| H-QA-19 | P0 | 保存existing completed/reserved business hash與DEV-054 protected manifest，完成全套後比對 | 非fixture及DEV-054逐檔hash不變；productionConnected/productionWrites皆false |
| H-QA-20 | P0 | SQLite clean bootstrap、Postgres 026、Supabase mirror/manifest、shadow/adoption rollback boundary | schema語意一致；migration無runtime adoption；first decision前rollback guard成立，decision/cleanup後只允許forward-fix |

AI真實UI的mutation步驟固定為：建立fixture → submitter送審 → 系統CTA → reviewer exact審核 → 核准／退回 → reload／redirect。不得以API或DB直接寫decision替代。API/DB只可建立隔離fixture、注入cleanup故障、讀取baseline/after、檢查RLS與清理整個disposable target。

Phase 1H預定command mapping：

- H-QA-01/09/10/17/20：`npm run qc:dev-053:phase1h:schema`、`:adoption`
- H-QA-02～05/14/16：`npm run qc:dev-053:phase1h:authority`、`:http`
- H-QA-06～08/13/15/18：`npm run qc:dev-053:phase1h:ui`
- H-QA-11/12/14/17：`npm run qc:dev-053:phase1h:cleanup`
- H-QA-01～19真實旅程：`npm run qc:dev-053:phase1h:real-operation`；目前runner只完成8項主核准baseline，完整UI旅程須依9H擴充後再執行。
- aggregate及回歸：`npm run qc:dev-053:phase1h`、`npm run qc:dev-053`、`npm run qc:pdm-approval-platform`、typecheck、scoped lint、isolated build。

### 9G.1 2026-08-06 focused AI QA and independent QC execution result

判定：`Targeted PASS / P0=0 / P1=0 / P2=0`。`H-QA-01～20`由focused contract、disposable transaction與8項真實Chromium主核准baseline共同驗證；UI送審與核准沒有被API／DB decision取代。此結果證明主核准路徑，但不等同9H所要求的withdraw、return/resubmit、historical、adoption、permission-negative與cleanup-retry完整UI旅程；9H執行前不得把它擴張解讀為full real-operation PASS。

- AI QA aggregate：schema 15/15、adoption 9/9、authority/cleanup 9/9、HTTP 9/9、UI 9/9、real-operation 8/8，共59/59。
- AI QA browser run：`output/playwright/dev053-phase1h-real-operation/DEV053-PHASE1H-20260806-133320/run-report.json`；四張screenshots、browserErrors/failedResponses皆0、`productionConnected=false`、`productionWrites=false`、cleanup=`removed`。完成後exact request預期回410並導向圖號最新版，該410單列為預期瀏覽器訊息。
- 真實操作證明一張圖、P01/P02/P03、兩個受控檔只建立一個native transient authority；送審後留在共用進版頁且只有一個primary；reviewer待辦是read projection而非永久task；review UI只有`退回修改／核准`且理由選填；核准後transient graph為0，package/files/三料scope保留。
- Independent QC在實體隔離副本重跑59/59；run `DEV053-PHASE1H-20260806-134417`、port 56131、四張screenshots、browser/5xx error 0、production connection/write false、cleanup removed。27個frozen scope檔案測前／測後hash變化為0。
- 回歸：Supabase runtime migration mirror 76/76、approval-platform 126/126、TypeScript、Phase 1H 30檔scoped ESLint與isolated optimized build PASS。approval-platform原本綁定舊`approvalProjection`字串的static assertion已改驗canonical drawing-owner workbench BFF與capability傳遞，產品未恢復舊平行projection。
- DEV-054 protection：023/024 PostgreSQL source及Supabase mirror四個hash逐一一致；沒有還原DVT／phase-gate、沒有stage/commit。固定3000、staging、production、live migration與active adoption apply均未執行。

## 9H. 由 AI 執行的 Phase 1H 真實操作再驗證計畫

Plan status: `Ready for AI QC execution / Not executed in this QA planning turn`

使用思考習慣：`#可驗證性`、`#證據基礎`、`#系統描繪`

### 9H.1 驗證目的與證據邊界

本計畫驗證的不是「API會回成功」，而是Engineer與R&D Manager能否從實際畫面完成整個圖面生命週期，且每一步看到的狀態、唯一下一步、資料範圍與最終結果一致。

- 必須由AI控制真實Chromium登入、點擊、輸入、上傳、送審、撤回、退回、重送、核准、重新整理與開啟舊連結。
- API／DB只可建立隔離fixture、讀取before/after、注入受控故障及cleanup；不得直接寫入送審、撤回、退回、重送或核准結果來代替UI操作。
- 每個會寫入的旅程使用disposable SQLite與isolated Next.js port；禁止連線或寫入固定3000、staging、Supabase/Cloud SQL或production。
- 使用者目前畫面或先前截圖若出現可見錯誤，必須在同一route或等效hard reload重驗；fresh browser成功不能抹除原可見失敗。
- 現有`qc:dev-053:phase1h:real-operation`的8/8只作主核准旅程baseline。它尚未以真實UI完整涵蓋withdraw、return/resubmit、historical 0.2、active adoption、permission-negative及cleanup retry；在下列全套旅程完成前，不得把8/8單獨稱為「完整真實操作通過」。

### 9H.2 測試角色、環境與資料

| 類別 | 必要設定 |
|---|---|
| Runtime | disposable SQLite、isolated app port、`PDM_DRAWING_REVISION_LIFECYCLE_MODE=enforced`、production slice disabled；run manifest須明示`productionConnected=false`、`productionWrites=false` |
| Browser actors | `Engineer-A`申請人、`Manager-A`指定審核人、`Manager-B`同公司但未指派、`Manager-X`跨公司；四個獨立browser context，不共用cookie/session |
| Fresh minor fixture | 一張`H9xxx-M01`、P01/P02/P03三個active primary parts、兩個finalized受控檔（3D CAD與2D drawing）、revision 0.1 |
| Withdrawal fixture | fresh request；另建雙審核人／第一decision已發生fixture，用來驗證撤回cutoff |
| Correction fixture | 可分別執行空理由與文字理由的兩個獨立request，避免前一旅程污染下一旅程 |
| Formal release fixture | 合法整數版次、同三料號及兩檔，可驗證drawing/item/part全成或全退 |
| Historical fixture | 最新版0.3已存在，0.2兩個未送審受控檔；核准0.2後0.3仍必須是latest |
| Adoption fixtures | 一筆安全可adopt的active legacy workflow；另各一筆discussion dependency、scope collision或terminal companion blocker |
| Preservation baseline | completed/unknown workflow與DEV-054 protected files測前hash；不得被adoption或cleanup改寫 |

所有fixture ID、帳號與檔名使用run-specific prefix。禁止使用A0005或其他既有正式資料做mutation；若需在固定3000檢查，只能read-only並另外標示，不可混入此run的PASS計數。

### 9H.3 AI 真實操作旅程

| ID | Pri | AI實際操作 | 預期結果與必要證據 |
|---|---:|---|---|
| AIRO-00 | P0 | 記錄source SHA、tracked config SHA、DB target、port、四角色與production env；建立before hash/count | target明確為disposable；production/3000 credential與URL未出現；DEV-054及completed baseline可重算 |
| AIRO-01 | P0 | Engineer-A登入`/numbering/revisions`開啟fresh minor fixture | 一張圖、P01/P02/P03預設全選、兩個受控檔已選；5秒內看懂狀態與唯一送審CTA；不存在legacy submission入口 |
| AIRO-02 | P0 | Engineer-A以UI填變更說明並點`建立送審（1張圖・3個料號）` | 留在共用進版頁；狀態`送審中`；唯一primary為`查看進度`，撤回只作secondary；DB為1 native request/1 workflow/3 scopes/2 files，legacy submission/permanent task/notification為0 |
| AIRO-03 | P0 | Manager-A登入`我的待辦`，從投影列點`查看`進exact review | 恰一筆待辦、不能手動完成；審核頁只有`退回修改／核准`，理由顯示`選填`，無audit/trace/legacy ID |
| AIRO-04 | P0 | Manager-B及Manager-X分別開同一exact URL並嘗試決策 | 未指派與跨公司均不能看見或執行決策；403/404以人類語言提供安全下一步；DB零變化且不洩漏drawing/request內容 |
| AIRO-05 | P0 | Engineer-A在任何decision前以UI點`撤回送審`，確認後重新整理 | 回`準備中`且檔案／三料scope保留；active transient graph清除；沒有撤回稽核歷程或永久通知 |
| AIRO-06 | P0 | Engineer-A從同一頁重新送審 | 重用同一package/files/scopes，不建立重複revision；新exact request可被Manager-A看見，correction reason為NULL |
| AIRO-07 | P0 | 在雙reviewer fixture由Manager-A做第一個decision，再由Engineer-A嘗試撤回 | 撤回入口消失或command回`DRAWING_LIFECYCLE_DECISION_ALREADY_STARTED`；不能回準備中，所有資料零部分改寫 |
| AIRO-08 | P0 | Manager-A對correction fixture不填理由點`退回修改`；Engineer-A重開並重送 | 退回成功；畫面先回答`請修正後重新送審`，不捏造理由；重送成功後active correction instruction清除 |
| AIRO-09 | P0 | 另一fixture填入文字理由退回；Engineer-A查看、修正並重送 | 理由只在目前`退回修改`狀態可見；重送後UI/API/DB均不可再重建舊理由或審核歷程 |
| AIRO-10 | P0 | Manager-A核准fresh minor fixture，Engineer-A重新整理圖號、待辦與附件 | lifecycle=`研發受控`而非Released；request/decision/event/workflow為0，package/files/P01-P03保留；沒有人工發布CTA或待審殘留 |
| AIRO-11 | P0 | Manager-A核准合法整數版fixture | drawing、三個item/part與package同交易成為正式發布；任一關係漂移故障時完整rollback，不得只發布部分料號 |
| AIRO-12 | P0 | Engineer-A從圖號工作台點`補登歷史版0.2`，確認預填0.2、兩檔與三料號後UI送審；Manager-A核准 | 核准後0.2列入歷史、0.3仍是latest；無第二套送審頁、無0.4誤跳、無待審殘留 |
| AIRO-13 | P0 | 保存AIRO-10/12 exact URL，terminal cleanup後重新開啟 | 允許一次預期HTTP 410資料探測，但畫面不得顯示錯誤；自動導向該圖號最新版，不開歷史審核或tombstone頁 |
| AIRO-14 | P0 | 對安全legacy active fixture先執行dry-run，再apply；Manager-A從UI完成決策 | dry-run `blocked=0`才可apply；legacy inbox消失、native待辦恰一筆、無decision replay；完成後legacy/native transient graph清除，durable package/files/scopes保留 |
| AIRO-15 | P0 | 對含任一blocker的完整activation set執行dry-run及apply嘗試 | apply被整批拒絕；0筆partial adoption、0狀態改寫；completed/unknown hash不變 |
| AIRO-16 | P0 | terminal apply後、cleanup前注入一次受控故障；重新整理UI並觸發cleanup-only retry | 使用者立即看到durable terminal狀態；retry不重做decision/apply；cleanup全有或全無，第二次retry冪等 |
| AIRO-17 | P0 | 由browser/deep link開legacy submission頁；以HTTP supporting check呼叫legacy approve/reject/cancel/return routes | UI只導向canonical頁；legacy mutations回410且零寫入；其他approval domain仍可正常使用 |
| AIRO-18 | P1 | 在1440×900、1280×720、1024×768、390×844重跑fresh submit、review、returned及terminal代表狀態；實測keyboard/focus、drawer scroll與mobile操作 | 每狀態5秒可辨識、最多一個primary、blocked/terminal都有下一步；無重疊、裁切、horizontal overflow、scroll chaining、按鈕遮擋或不可達focus |
| AIRO-19 | P0 | 執行visible-error、console/network、counter與visible-text noise sweep | `.inline-error`、非預期`[role=alert]`、可見4xx/5xx/API route、console error、failed 5xx皆0；待辦/檔案/料號數不意外為0；無DEV/mock/raw status/request ID或重複教學文字 |
| AIRO-20 | P0 | 關閉browser/app，清除run-owned DB/files/temp；重算hash與檢查port/process | cleanup=`removed`、無殘留程序；27個frozen scope與DEV-054 hash不變；失敗證據先保存再清fixture，不得刪證據掩蓋FAIL |

### 9H.4 Now What／UI人工理解矩陣

| 狀態 | 使用者最可能問題 | 畫面第一句必須回答 | 唯一primary／替代下一步 |
|---|---|---|---|
| 準備中、資料不足 | 為何不能送？ | 尚缺哪些真正必要資料 | `繼續準備`；逐項定位缺口 |
| 準備中、已就緒 | 現在能送嗎？ | 資料已備妥，可送審 | `送交審核` |
| 送審中、申請人 | 誰在處理？我能撤回嗎？ | 等待審核；第一個決策前可撤回 | `查看進度`；撤回為secondary |
| 送審中、assigned reviewer | 我要去哪裡審？ | 這筆待你審核 | `前往審核` |
| 退回修改 | 接下來改什麼？ | 請修正後重新送審；有理由才顯示理由 | `修正並重新送審` |
| 研發受控 | 還要發布嗎？ | 小數研發版已受控，不需再發布 | `建立新版次`或查看受控檔 |
| 正式發布 | 還要處理嗎？ | 已正式發布，不用再處理本次審核 | `建立新版次`或查看正式紀錄 |
| cleaned/not found | 舊連結失效怎麼辦？ | 此審核已結束，已帶回圖號最新版 | 圖號最新版；不可出現decision CTA |
| 無權限 | 我能找誰處理？ | 你不是本案審核人／缺少指定權限 | 返回安全頁或聯絡R&D Manager/Admin |

### 9H.5 FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---:|---|
| API/DB替代真實UI後誤判PASS | 自動化只驗domain結果 | 真實入口、按鈕或session仍壞 | 比對browser mutation log；decision必須來自UI click | P0 | AIRO-01～13每個mutation保留click、URL、screenshot與network evidence |
| 角色session混用 | browser context/cookie共用 | 申請人可能冒充審核人 | 四個獨立context及actor標記 | P0 | AIRO-03/04/07；每次決策記錄登入actor |
| 狀態多軸殘留 | raw Pending覆蓋lifecycle projection | 已核准仍顯示送審中 | 圖號、待辦、附件、inbox跨頁比對 | P0 | AIRO-10～13同一時間點截圖與DB readback |
| 歷史版錯成最新版 | revision比較或redirect使用reviewed revision | 0.3被0.2取代 | latest/history readback | P0 | AIRO-12/13 |
| adoption部分套用 | blocker檢查與apply非同一集合 | 舊案件一半新、一半舊 | before/after row count與hash | P0 | AIRO-14/15，全批次blocked=0 gate |
| cleanup提前或跨domain | delete guard過寬、順序錯誤 | 正式資料或其他審核紀錄消失 | transient/durable/other-domain count | P0 | AIRO-16/17及other-domain immutable probe |
| 可見錯誤被refresh掩蓋 | runner只看最終畫面 | 使用者仍遇到紅色錯誤或500 | 全程DOM/console/network listener | P0 | AIRO-19；任一可見錯誤直接FAIL並保留原截圖 |
| 簡化造成入口或風險消失 | text/CTA過度刪減 | 使用者不知道下一步或誤核准 | 5秒理解、Now What、紅筆刪除測試 | P1 | AIRO-18/19與9H.4矩陣 |
| mobile/drawer捲動責任錯亂 | nested scroll與fixed footer | CTA被遮住或誤捲頁面 | viewport量測與wheel操作 | P1 | AIRO-18，記錄document/drawer scrollWidth及scroll owner |

### 9H.6 證據包與判定

每個run至少保存：

- `run-report.json`：run ID、source/config hash、port、browser、actors、fixture IDs、開始/結束時間、production flags、cleanup狀態及逐案PASS/FAIL；
- `screenshots/AIRO-xx-*.png`：每個主要狀態與所有失敗點；四個viewport需記錄尺寸；
- `browser-events.json`：page errors、console warn/error、failed responses、所有mutation method/path/actor；
- `db-before-after.json`：package/files/scopes、legacy submission、request/decision/event/workflow、task/notification與drawing/item/part結果；
- `hash-manifest.json`：frozen product scope、completed fixtures、DEV-054及tracked config測前／測後；
- `cleanup-report.json`：run-owned資料、檔案、process與port是否全部移除。失敗run不得因cleanup刪除證據。

完整PASS需同時符合：

1. AIRO-00～20全部通過；任何P0失敗直接FAIL，P1缺證據為`未充分驗證`；
2. 所有使用者mutation由真實UI完成，沒有API／DB代替；
3. visible error、unexpected console error、failed 5xx、overflow與跨公司資料洩漏皆0；
4. terminal後transient review business graph為0，durable package/files/P01-P03與latest/history正確；
5. production connection/write為false、cleanup removed、protected hashes不變；
6. `npm run qc:dev-053:phase1h`、`npm run qc:pdm-approval-platform`、`npm run typecheck`、scoped ESLint與`npm run build:isolated`通過。

QC執行前置：擴充現有`qc:dev-053:phase1h:real-operation`或新增等效full runner，使其真正覆蓋AIRO-00～20。若只重跑目前8/8 baseline，Phase 1H focused regression可判PASS，但本9H「完整AI真實操作」只能判`未充分驗證`。

Phase 1H直接Fail條件：adoption partial apply；fresh flow仍建立legacy submission；terminal後仍可由任何表/API重建申請人、審核人、決策、理由或時間；cleanup跨domain/跨workflow；目前狀態未原子更新；舊route仍可寫；最新/歷史錯置；DEV-054或既有completed資料變動。

## 10. Pass/Fail Rules

Passed需同時滿足：

1. 所有P0/P1 case通過，P2無影響資料安全、權限、主流程或可及性的未解問題；
2. RO-00～RO-14由AI真實操作完成且cleanup完整；
3. 多圖bundle row transition、zero-write、server-side composition、parallel-path closure、file authority與cross-company全部通過；
4. DEV-052/050/051 regression、lint、TypeScript與isolated build通過；
5. independent QC在RD freeze後重跑，不以RD self-check代替。
6. formal drawing 14組能力清冊全部可達，且DEV-054 protected diff為零語意變更。
7. Phase 1H實作時，H-QA-01～20全部通過，8B adoption `blocked=0`、9B current-state projection與10B latest redirect均有AI真實操作證據。

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
- 任一正式圖面既有能力被靜默隱藏、只能靠猜網址/API完成，或production-slice封鎖時無可見原因；
- DEV-053修改、還原、stage或commit任何DEV-054 protected scope。

## 11. Release Boundary

本QA plan不授權staging或production。production前另需deployment-release gate，至少確認target identity、backup/restore、migration判定、old/new app compatibility、feature-flag rollout/rollback、named-user smoke與既有production保留號read-only preservation evidence。
