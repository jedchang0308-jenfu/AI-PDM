# AI_PDM Cold Start

用途：讓下一輪 AI 先用低 token 成本理解目前交付邊界，再依選定 DEV 讀直接相關文件。

## Active Repo

- Active repo：`C:\VIBE CODING\AI_PDM`
- 文件中心：`.ai-doc`
- 不要預設讀取整個 `.ai-doc/specs`、`.ai-doc/qa`、`.ai-doc/qc`、`.ai-doc/reports` 或 `.ai-doc/archived`。

## Progressive Read Order

1. 先讀本檔。
2. 再讀 `.ai-doc/dev_task.md` 的 `### 派工規則` 與 `### 目前派工任務清單`；不得整段載入
   `## 總任務清單`。
3. 已知 DEV ID 時，搜尋該 DEV 的索引起點，只讀到下一個同層狀態符號 DEV 項目前；未知 DEV ID 時，
   先用狀態符號與功能詞搜尋候選，不掃描所有任務明細。
4. 選定一個 DEV / package 後，才到 `.ai-doc/documentation_map.md` 搜尋該 package heading。
5. 只讀該 DEV 直接連結的 SPEC / ADR / QA / QC / report。
6. 只有文件治理、archive restructure 或 cross-package consistency audit 才讀完整 `documentation_map.md`。

## Spec Impact Preflight

修改產品程式、API、schema、狀態機、權限、主要 UI flow、驗收或 release 行為前：

1. 若已知 DEV / package，先讀該 DEV 在 `dev_task.md` 的索引與直接連結的 active SPEC / ADR / QA / QC。
2. 若未知 DEV，先用功能名、component、route、API、table、status、permission、provider 或錯誤訊息搜尋 `documentation_map.md`、`dev_task.md` 與 spec 檔名；只讀命中項。
3. 對照 active contract 的 scope / out of scope、authoritative source、accepted/rejected decisions、狀態轉換、資料/API/權限、驗收與 release gate。
4. 結論分類為 `No conflict`、`Compatible exception`、`Intentional replacement` 或 `Unresolved conflict`。
5. `Unresolved conflict` 不得直接改碼；`Intentional replacement` 必須同步更新 authoritative spec / ADR / dev_task / documentation_map 或取得使用者決策。

## Cross-Module Non-Negotiable Authority

- 任何涉及料號、圖面、BOM、ECO、技轉、匯入／匯出或 ERP 的工作，必須先遵守
  `.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`：
  Part Number 代表物料身份且本身無 Revision；Drawing 與 BOM 是各自獨立版控的受控工程定義。
- 同一物料身份下，只提升實際受影響的 Drawing/BOM Revision，不得自動同步。FFF、互換性、法規／品質管制
  或其他物料身份條件改變時，必須建立新 Part Number，並建立該新身份自己的 BOM。
- 新 schema/API/UI/export 不得建立或呈現 Part Number Revision。發現 legacy `parent_revision`、`child_revision`、
  `items.current_revision` 等語意時，先做 Spec Impact Preflight；不得把它們當成新 authority。

## Current Dispatch Boundary

- 目前沒有可直接正式部署的任務；production、Cloud SQL/GCS cutover、provider pointer、migration、release、rollback 或 production smoke 必須走 release gate。
- `DEV-110`目前是`RD Implemented Locally / Human Confirmed / Full QC Passed 60/60 / Production Release Gated`。主SPEC=`.ai-doc/specs/SPEC-PDM-RECOGNITION-COMMON-VALUE-EXCEPTIONS-001-upstream-part-work-handoff.md` §20～§26，Accepted／Repository Assessed ADR=`.ai-doc/decisions/ADR-PDM-DRAWING-RECOGNITION-PART-WORK-HANDOFF-001-common-projection-and-atomic-draft-transfer.md`，fixed 60 QA=`.ai-doc/qa/qa-dev-110-recognition-common-value-part-work-handoff-validation-plan-2026-08-31.md` §7～§10，local receipt=`.ai-doc/qc/qc-dev-110-local-implementation-2026-08-31.md`。圖面一般區域／明確共用列形成overall common，料號／資料對照表形成exact per-Part override；只接受linked adapter可驗證的exact owner ID／完整canonical anchor，或同欄位observation以token boundary唯一命中formal eligible集合中的完整canonical料號。舊suffix／unanchored owner、persisted `resolved`標記、`P03`縮寫／模糊／多重命中fail closed，且resolver不得擴張formal targets。禁止用unique mode／majority猜common，manual common／override可無candidate。formal-only scope最多100 Parts，handoff以single recognition-specific transaction展開到existing exact Part works，stable idempotency／sorted locks／all-or-nothing。`qc:dev-110:aggregate`已完成SQLite、PostgreSQL、authenticated browser、DEV-108 integration、typecheck、lint、isolated build與G01～G04；schema／permission／root authority／second writer／combined review／structured table parser=0，production release仍受gate管制。
- `DEV-101`審核工作臺共用圖號／料號完整工作區已達`Local RD Implemented / Independent QA-QC Complete /
  Fixed QA 48 of 48 PASS / Production Release Gated`。審核者由actor-scoped清單正常進入與編輯者同一套
  canonical Drawing／Part renderer，以immutable submitted package看完整同根矩陣、圖號／料號、recognition
  projection與檔案；review mode維持zero domain write。A0002-M01清單可發現性、v1／v2分流、owner fail-closed、
  latest-session isolation及anti-false-PASS已由current-source四runner aggregate固定48/48，manifest=`output/qa/
  dev-101-independent-aggregate/DEV101-INDEPENDENT-AGGREGATE-2026-08-27T15-19-16-555Z/manifest.json`，closure=
  `.ai-doc/qc/qc-dev-101-independent-qa-qc-closure-2026-08-27.md`。本DEV沒有未完成的本機RD／QA／QC；production只能由
  `DEV-032`／release owner先選exact release commit或核准current source snapshot，再做writer activation、
  candidate-bound smoke、release與監測。既有v1不backfill、不改hash；未授權前不得修改primary資料或切traffic。
- `DEV-100` P1 Drawing work-file CAPA已達`Local RD Implemented / CAPA Effective / Local QA-QC Complete / Local Fix Verified / A0044 Data Repair Human-Gated / Production Release Gated`。active/tombstone invariant、post-write immediate read、load-error凍結與same-role exact filename提示已實作；fresh `QA-100-001..018` 18/18、SQLite／disposable PostgreSQL、headed authenticated browser、雙mutant、typecheck／lint／isolated build及cleanup均PASS，證據=`output/qa/dev-100/DEV100-2026-08-26T11-50-35-191Z/manifest.json`。舊DEV-087 parent曾因DEV-097 anti-cheat分母不完整而fail closed；該判定自2026-08-27起只作Historical Supporting，DEV-100產品／資料回歸仍是DEV-087新94＋3契約的必要依賴。不得新增組立入口、assembly parser、自動BOM或PDF→SLDDRW fallback；primary A0044資料apply仍須backup、dry-run及人類選擇保留`A0043.SLDASM`或恢復`A0044.SLDASM`，目前`applyCount=0`。
- `DEV-111` 料號核准後 canonical state／關聯矩陣導航 CAPA已達`CAPA Closed / Local + Primary SQLite + Production Code/Schema Effectiveness Verified / Production Released`。Part formalize先upsert `part_formal`、再清除work並read-back formal=1/work=0。地端A0044-P01 exact repair apply=`PASS`、replay=`NO_OP`。正式 PR #28 merge commit=`221b25c1`已發布至revision=`ai-pdm-prod-gh-221b25c1-33457759159`、image digest=`sha256:eb895005...`並承接100%流量；candidate/canonical smoke皆14/14 PASS。正式Cloud SQL pre/post唯讀盤點均為Part/Drawing no-state=0、non-navigable link=0、repair plan空集合；production-bound transaction rehearsal在交易內達成formal=1/work=0後ROLLBACK且指紋不變，因此沒有正式資料repair。`/approvals`仍被official-numbering-draft slice關閉，authenticated approval E2E不得冒充PASS，待未來開放slice時以專用fixture重驗。
- `DEV-099`本機產品實作與完整本機驗證已完成，狀態為`RD Implementation Complete / Human Confirmed / Full
  Aggregate QA 48/48 / Production Release Gated`：new-root建號不再選structure type並明確寫`unclassified`；
  existing-root以全體current Parts共識初始化，無共識也不阻擋。分類唯一入口是exact Part drawer，可複選同root
  變體；只有assembly顯示BOM區，purchased assembly本期無製造BOM action。Authority為`.ai-doc/specs/SPEC-PDM-
  DEFERRED-STRUCTURE-CLASSIFICATION-001-numbering-and-bom-readiness.md`，同一 aggregate `QA-099-001..048`
  48/48 PASS，包含四viewport headed browser、SQLite／PostgreSQL parity、DEV-093／096 regression與primary
  invariant／cleanup evidence：`output/qa/dev-099/DEV099-2026-08-26T09-03-03-967Z/manifest.json`。正式migration、
  activation、deploy、release與production smoke仍受 gate 管制。
 - `DEV-093`目前是`Local RD Implemented / Corrective QA-QC Passed / Production Release Gated`。單一`/numbering/create`、preview no-write、兩值料件分類與DEV-090自動關聯保留；新圖料不顯示`建立內容`，依圖製作件固定建立M圖＋料號，外購標準件預設料號並可選參考圖R；existing-root仍可建料號／圖號／兩者，追加料號時四項根號既有料件profile均唯讀沿用，只顯示`料件設定（沿用根號）`。`主要名詞→建議品名→確定品名`、系列metadata與建議品名雙重用途、條件先行及查重鄰近呈現均保留。Phase 093-H已將`自訂規格`與命名用`特性／規格型號`收斂為單一可見來源；Phase 093-I再將共用件收斂為只勾選、不需原因；Phase 093-K將existing-root的共用、系列、規格與類型設定收斂為server profile authority。依圖製作件顯示`規格／特性`，外購標準件顯示`規格／型號`，同一值進入建議品名、request與DB。QA-093-001..109由兩輪fresh UI session完成115項check全數PASS、六條合法路徑、三種非法組合、DB/API/UI一致、legacy caller=0；最終證據為`output/qa/dev-093/DEV093-2026-08-24T11-51-41-869Z/`，response 577。`044`／`045`尚未授權正式套用；不新增schema，不恢復`draft-workspaces/**`、legacy publication、fallback或dual-write。production migration／deploy／release仍受gate管制。
- `DEV-090`目前是`RD Implementation Complete / Human Confirmed / Local RD Implemented / Local QA-QC Complete / Production Release Gated`。已退役圖料工作台、Relation work/review與專用workspace，改由Drawing／Part drawer顯示同一root-level正式關聯矩陣並直接原子儲存到`drawing_part_links`；不新增Relation審核。`RelationFormalAuthorityRepository`（含SQLite sync adapter）是唯一formal writer，所有runtime link flow共用root-first lock；single save hard cap 2,500、domain/storage enum只在authority mapping、權限為page-neutral read＋`numbering.workspace.update`。`/numbering/search`只保留為無矩陣／無edit的`編號搜尋`。SQLite current projection cleanup、PostgreSQL 043 fail-closed migration與provider-aware runner已實作；focused aggregate、typecheck、isolated build與authenticated browser evidence已完成；正式migration、provider parity、reconciliation、cutover、deploy與release仍需另行授權。
- `DEV-087`目前是`Local RD/QA-QC Complete / Human Confirmed / 94 of 94 Product Cases + 3 of 3 Quality Gates PASS / Production Release Gated`。fresh parent=`output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-27T19-11-41-680Z/manifest.json`，source fingerprint=`fd9f45e792be8275e0e1e4fb92171bf861b86414d0712ab30146594e8a6e8e14`；21/21 commands、94/94 cases、3/3 gates且`completionCandidate=true`。FFF只依server `predecessor_revision_id`：首版zero FFF＋中性`relatedParts`，進版才有`affectedParts`與三軸人工判定。Provider 6/6、security 8/8 zero-write、UI family-viewport 32/32均PASS，actual AT為選配。同一開發者可執行RD／QA／QC，DEV-097與Independent QC／AT receipt不阻擋。三工作臺canonical state、typed detail、single file-read與retirement架構保留；Relation current contract仍由DEV-090取代。正式Cloud SQL restore rehearsal、migration、cutover、deploy與release仍未授權，root明細／動作仍明確排除。
- `DEV-092`目前是`RD Implemented / QA-087-179..186 PASS / Browser PASS / Disposable PostgreSQL PASS / Production Data Repair & Release Gated`。A0006-M01 revision的3筆檔案已exact轉為current work-file snapshot，work API／preview／recognition使用`drawing_revision + current revision + exact 3 assets`，converter、forward repair、composite receipt、read invariant與negative control均PASS；主SQLite apply證據為`output/qa/dev-092-main-apply/manifest.json`。禁止UI fallback到revision files、改寫舊session context、修改physical bytes或未授權production資料。
- `DEV-094`目前是`Local RD Implemented / QA-QC PASS / CAPA Effective / P0 Closed / Production Release Gated`。原始主SQLite為roots=0、parts=0、company-scope candidate=3/3、FK violations=15；一致性備份後已exact recovery為roots=3、parts=3、candidate=0、FK=0，第二次執行NO_OP。initializer跨process lock與atomic reconciliation、build data/repository isolation、detail relation anomaly局部降級、browser pre-seed source guard均完成；focused/browser/fresh parent aggregate全部PASS。權威QC為`.ai-doc/qc/qc-dev-094-sqlite-migration-integrity-capa-2026-08-24.md`。production未連線、遷移、deploy或release。
- `DEV-088`目前是`Local RD Implemented / Focused QA-QC PASS / Production Migration & Release Gated`。替代料號來源Part附件預設全選、可取消／新增、Drawing類檔案排除；沿用以兩表稽核＋獨立target `file_assets` row共享immutable storage pointer，不搬source、不複製bytes、不後續同步。source stale、dedupe、idempotency、batch insert及approval原子promotion已完成；`npm run qc:dev-088` 7/7 PASS，cleanup補強後HTTP 15/15、三viewport browser 37/37，21附件建立為14 SQL statements。DEV-084五表／權限改寫／whole-part lease不得恢復；Cloud SQL 041 apply、正式provider驗證、deploy、release、production smoke與physical GC未授權。DEV-087已獨立commit `862ac611`；DEV-088尚未commit。
- `DEV-087`退役舊current-state authority仍是同一DEV不可拆分的Definition of Done，不得另開future cleanup。fresh session必須同時核對retirement manifest、DEV-092 per-work file-set gate及DEV-094 CAPA/fresh aggregate；缺任一manifest、`QA-087-179..186`未全PASS、migrated work mismatch非0、主SQLite FK/staging不健康、source guard未先於fixture mutation，或`npm run qc:dev-087:retirement`非PASS時，`qc:dev-task-completion-audit`都必須拒絕local complete／handoff ready。即使本機gate全PASS，也不得在正式rehearsal／cutover／release未授權時宣稱production ready。
- `DEV-087`／`DEV-097` current override（2026-08-28 closure）：DEV-097維持`Skipped / Historical Supporting`；其G0-A／G4、QA-087-219..228、Independent QC／AT receipt、mutant與artifact anti-cheat不計入DEV-087 completion gate。DEV-087已依94個產品案例＋3 Quality Gates完成fresh trusted-solo aggregate並結束本機開發／驗證；舊Independent-receipt FAIL不得回推成產品FAIL。若要恢復多人稽核或進production，須另行明確決策／授權。
- `DEV-032` 已於 2026-09-03 完成第一版 production Gate A-E並關閉；source=`bb30682c`、revision=`ai-pdm-prod-gh-bb30682c-33729286511`、traffic=100%、canonical smoke=14/14。現行沒有第一版launch-moving active DEV；未來release或future capsule須依新需求重新派工，不得沿用本次artifact-bound收據。
- `DEV-046` Phase 1A-1E、Phase 2A與Phase 2B staging activation已完成；Phase 3A production由`DEV-032`執行，Phase 3B+只保留future capsules或另行明確派工。
- `DEV-048` 圖料號 / 草稿 / 狀態 / 技轉入口整合已本機完成；不得自動續做 provider/staging/release。
- `DEV-047` 已以accepted technical debt結案；Phase A0 inventory tooling只供未來觸發時重建立基，不是production blocker。
- `DEV-041` 以Phase 3A-0現行範圍結案，`DEV-015`以未選擇／successor承接結案；`DEV-033 + DEV-046 Phase 3B + DEV-037`只保留future capsule，均非active backlog。
- `DEV-060` 已完成 Phase 1A→1D 本機 RD/QA/QC；canonical Part Number owner、獨立 BOM Rev、三來源 `/bom/new`、review/release/export/read integration 與 isolated evidence 已通過。commit、live migration、deploy、production smoke與 release仍須另走 gate。
- `DEV-061` 本機 Phase 1A～1D 已完成，狀態為 `Local RD Implemented / Focused QA-QC Passed / Production Release Gated`。圖號只放受控版次檔，料號保留精簡且不收合的文件清單；每次首版／進版必須重新上傳 `.SLDDRW` + `.SLDPRT/.SLDASM`，相同 3D bytes 才由系統在 company/owner scope 內共用 canonical asset。cleanup 僅 dry-run，production／正式 Drive 或 bucket 刪除、live migration、commit、deploy、release 均未授權。
- `DEV-062` 已達 `✓ Local RD Implemented / Fixed-3000 QA-QC Passed / Release Gated`。Isolated run `DEV062-20260810-121012-local-isolated`通過aggregate 15/15、contract 40/40、browser 33/33；使用者截圖重開QC後，fixed 3000 run `DEV062-FIX-20260810124507-fixed3000`再以10/10證明兩路由舊頁籤為0、formal/candidate同頁、legacy URL正規化且visible／console／server error為0。本機launcher會啟用DEV-062並以health gate防止Legacy誤判；production flag、deploy、release仍須明確release指令。
- `DEV-030`與`DEV-031`只保留來源ID與角色分離證據，分別併入`DEV-032 Gate B/C`，不得再作為獨立派工入口。
- `DEV-035` 現為`Local RD Implemented / Human Confirmed / Real A0002 QA-QC Passed / Production Release Gated`。
  原035-A→D與22-file focused evidence只算partial baseline；035-E→F已完成同一Settings UI的Windows DPAPI／GSM安全儲存、real native probe、test-double activation deny、recognition worker exact-version hot apply／heartbeat、truthful readiness與real A0002八欄E2E。
  Active Windows DPAPI v3、probe、worker exact ack與兩個獨立A0002 session均PASS；八欄value／owner／scope可重現。日常key操作不需PowerShell、`.env.local`或人工restart；本次舊worker只因套用新程式碼做過一次受控版本重啟。
  2D preview、未儲存狀態、Add-in、CAD回寫、OCR與production release不在本phase；
  `DEV-036` SolidWorks Add-in仍停止追蹤。
- `DEV-068`／`DEV-082` 因 A0002 跨來源版次與證據定位缺陷重開，狀態 `RD Implementation Ready / OCR-082-031..038 Pending / Production Release Gated`。Phase 1A～1D、DEV-035 native reader與`OCR-082-001..030`保留為回歸基線。
  Current Phase authority為`SPEC-PDM-DRAWING-RECOGNITION-001` §0.12：統一`source_revision`／`revision`為canonical `revision / identity_relation / evidence_only`，同值合併CAD／PDF evidence、異值顯示衝突，PDF producer輸出`normalized_page` geometry，workspace以locatable-first及source-aware fallback呈現。
  只有PDF辨識內容、零安裝／零OCR主機／零第三方文件流量與Tier 0容量政策均不變。QA為DEV-068 QA §9新增`OCR-082-031..038`並收緊DEV-079 QA-079-26；全部通過前不得恢復Local Current Phase Complete。Production/staging、migration、deploy、release仍未授權。

## Read Guardrails

- Completed / protected context 只作歷史與 evidence，不代表可自動執行。
- `archived/` 只在追查完成任務、舊 evidence、歷史快照或一致性稽核時搜尋命中段落。
- 若只需狀態判斷，優先引用 `dev_task.md` 索引與本檔；不要把大型 spec/report 整份載入。
- `## 總任務清單` 是任務容器，不是冷啟動的全文讀取範圍；一律先定位子章節或目標 DEV。
