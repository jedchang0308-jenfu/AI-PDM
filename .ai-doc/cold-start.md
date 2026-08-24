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
 - `DEV-093`目前是`Local RD Implemented / Corrective QA-QC Passed / Production Release Gated`。單一`/numbering/create`、preview no-write、兩值料件分類與DEV-090自動關聯保留；新圖料不顯示`建立內容`，依圖製作件固定建立M圖＋料號，外購標準件預設料號並可選參考圖R；existing-root仍可建料號／圖號／兩者，追加料號時四項根號既有料件profile均唯讀沿用，只顯示`料件設定（沿用根號）`。`主要名詞→建議品名→確定品名`、系列metadata與建議品名雙重用途、條件先行及查重鄰近呈現均保留。Phase 093-H已將`自訂規格`與命名用`特性／規格型號`收斂為單一可見來源；Phase 093-I再將共用件收斂為只勾選、不需原因；Phase 093-K將existing-root的共用、系列、規格與類型設定收斂為server profile authority。依圖製作件顯示`規格／特性`，外購標準件顯示`規格／型號`，同一值進入建議品名、request與DB。QA-093-001..109由兩輪fresh UI session完成115項check全數PASS、六條合法路徑、三種非法組合、DB/API/UI一致、legacy caller=0；最終證據為`output/qa/dev-093/DEV093-2026-08-24T11-51-41-869Z/`，response 577。`044`／`045`尚未授權正式套用；不新增schema，不恢復`draft-workspaces/**`、legacy publication、fallback或dual-write。production migration／deploy／release仍受gate管制。
- `DEV-090`目前是`RD Implementation Complete / Human Confirmed / Local RD Implemented / Local QA-QC Complete / Production Release Gated`。已退役圖料工作台、Relation work/review與專用workspace，改由Drawing／Part drawer顯示同一root-level正式關聯矩陣並直接原子儲存到`drawing_part_links`；不新增Relation審核。`RelationFormalAuthorityRepository`（含SQLite sync adapter）是唯一formal writer，所有runtime link flow共用root-first lock；single save hard cap 2,500、domain/storage enum只在authority mapping、權限為page-neutral read＋`numbering.workspace.update`。`/numbering/search`只保留為無矩陣／無edit的`編號搜尋`。SQLite current projection cleanup、PostgreSQL 043 fail-closed migration與provider-aware runner已實作；focused aggregate、typecheck、isolated build與authenticated browser evidence已完成；正式migration、provider parity、reconciliation、cutover、deploy與release仍需另行授權。
- `DEV-087`目前是`Local QA-QC Restored by DEV-094 / Fresh Aggregate 16 of 16 PASS / CAPA Effective / Production Zero-Loss Rehearsal, Cutover & Release Gated`。2026-08-23證據保留為歷史；current closure固定使用`output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-24T05-53-07-065Z/manifest.json`，涵蓋DEV-092 work-file、DEV-094 SQLite integrity、zero-loss、retirement、file-read、91/91 rendered browser、typecheck、isolated build與runtime dist cleanup。三工作臺canonical state、typed detail、single file-read與retirement架構保留；Relation current contract仍由DEV-090取代。正式Cloud SQL兩次restore rehearsal、migration、cutover、deploy與release仍未授權。
- `DEV-092`目前是`RD Implemented / QA-087-179..186 PASS / Browser PASS / Disposable PostgreSQL PASS / Production Data Repair & Release Gated`。A0006-M01 revision的3筆檔案已exact轉為current work-file snapshot，work API／preview／recognition使用`drawing_revision + current revision + exact 3 assets`，converter、forward repair、composite receipt、read invariant與negative control均PASS；主SQLite apply證據為`output/qa/dev-092-main-apply/manifest.json`。禁止UI fallback到revision files、改寫舊session context、修改physical bytes或未授權production資料。
- `DEV-094`目前是`Local RD Implemented / QA-QC PASS / CAPA Effective / P0 Closed / Production Release Gated`。原始主SQLite為roots=0、parts=0、company-scope candidate=3/3、FK violations=15；一致性備份後已exact recovery為roots=3、parts=3、candidate=0、FK=0，第二次執行NO_OP。initializer跨process lock與atomic reconciliation、build data/repository isolation、detail relation anomaly局部降級、browser pre-seed source guard均完成；focused/browser/fresh parent aggregate全部PASS。權威QC為`.ai-doc/qc/qc-dev-094-sqlite-migration-integrity-capa-2026-08-24.md`。production未連線、遷移、deploy或release。
- `DEV-088`目前是`Local RD Implemented / Focused QA-QC PASS / Production Migration & Release Gated`。替代料號來源Part附件預設全選、可取消／新增、Drawing類檔案排除；沿用以兩表稽核＋獨立target `file_assets` row共享immutable storage pointer，不搬source、不複製bytes、不後續同步。source stale、dedupe、idempotency、batch insert及approval原子promotion已完成；`npm run qc:dev-088` 7/7 PASS，cleanup補強後HTTP 15/15、三viewport browser 37/37，21附件建立為14 SQL statements。DEV-084五表／權限改寫／whole-part lease不得恢復；Cloud SQL 041 apply、正式provider驗證、deploy、release、production smoke與physical GC未授權。DEV-087已獨立commit `862ac611`；DEV-088尚未commit。
- `DEV-087`退役舊current-state authority仍是同一DEV不可拆分的Definition of Done，不得另開future cleanup。fresh session必須同時核對retirement manifest、DEV-092 per-work file-set gate及DEV-094 CAPA/fresh aggregate；缺任一manifest、`QA-087-179..186`未全PASS、migrated work mismatch非0、主SQLite FK/staging不健康、source guard未先於fixture mutation，或`npm run qc:dev-087:retirement`非PASS時，`qc:dev-task-completion-audit`都必須拒絕local complete／handoff ready。即使本機gate全PASS，也不得在正式rehearsal／cutover／release未授權時宣稱production ready。
- `DEV-032` 是第一版 production 唯一 active launch-moving package；當前子關卡為 `Gate A` production Firebase/provider config、env source、Secret Manager metadata readback與credentialled plan review，仍不得apply。
- `DEV-046` Phase 1A-1E、Phase 2A與Phase 2B staging activation已完成；Phase 3A production由`DEV-032`執行，Phase 3B+只保留future capsules或另行明確派工。
- `DEV-048` 圖料號 / 草稿 / 狀態 / 技轉入口整合已本機完成；不得自動續做 provider/staging/release。
- `DEV-047` bounded schema migration只有Phase A0本機inventory tooling完成；authoritative inventory要等production canary穩定與受控target/snapshot，不要求固定觀察天數。
- `DEV-041` Phase 3A-1是下一個可選產品切片；`DEV-015`需先選定單一切片；`DEV-033 + DEV-046 Phase 3B + DEV-037`是future GCS authority/cost/continuity package。
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
