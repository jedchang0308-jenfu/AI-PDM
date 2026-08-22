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
- `DEV-087`目前是`Local RD Complete / Focused QA-QC PASS / Local Canonical-Only Preservation Migration Validated / Retirement Pending / Production Migration & Release Gated`。14-table canonical schema、Cloud SQL migration `042`、SQLite ensure、converter、三domain repository/commands/routes/UI、Drawing exact revision file/recognition、transient review與hard retirement已本機實作；`npm run qc:dev-087` focused gates PASS（migration preservation新增24 checks），證據見`.ai-doc/qc/qc-dev-087-local-implementation-2026-08-22.md`與`output/qa/dev-087-local-preserve-apply/manifest.json`。使用者選擇A後，主DB已保留44筆ambiguous active bundle、9筆未核准part-only及3筆legacy cancelled，共56筆source graph，標記`retained_legacy_source`，unresolved=0，canonical list API/page smoke 200；這些source不進三工作臺。新增`.ai-doc/qa/qa-dev-087-ui-only-lifecycle-operation-validation-plan-2026-08-22.md`，固定圖號27、料號20、圖料根號20共67條真實UI journey及11個UI／API／DB一致性hard gates；AI只能透過UI產生business mutation，API／DB只可唯讀取證，目前尚未執行。完整`QA-087-001..165`、UI-only 67/67+11/11、PostgreSQL rehearsal、SCALE-10K／soak／RTO與production gate仍待獨立執行。依最新決策首重穩定與效率，惡意token、CSRF/DoS、側通道與證據偽造紅隊範圍延後。DEV-088已完成本機focused QA/QC，但不得共用commit或改寫DEV-087 migration authority。
- `DEV-088`目前是`Local RD Implemented / Focused QA-QC PASS / Production Migration & Release Gated`。替代料號來源Part附件預設全選、可取消／新增、Drawing類檔案排除；沿用以兩表稽核＋獨立target `file_assets` row共享immutable storage pointer，不搬source、不複製bytes、不後續同步。source stale、dedupe、idempotency、batch insert及approval原子promotion已完成；`npm run qc:dev-088` 7/7 PASS，cleanup補強後HTTP 15/15、三viewport browser 37/37，21附件建立為14 SQL statements。DEV-084五表／權限改寫／whole-part lease不得恢復；Cloud SQL 041 apply、正式provider驗證、deploy、release、production smoke與physical GC未授權。DEV-087已獨立commit `862ac611`；DEV-088尚未commit。
- `DEV-087`退役舊current-state authority是同一DEV不可拆分的Definition of Done，不得另開future cleanup。fresh session接手時須先讀DEV-087 SPEC的`Transition Exit Gate`、配對ADR／QA與固定路徑retirement evidence：`.ai-doc/qa/dev-087-old-authority-inventory.json`、`output/qa/dev-087-retirement/<run-id>/manifest.json`、`.ai-doc/qc/qc-dev-087-retirement-<date>.md`。缺manifest/hash chain、`npm run qc:dev-087:retirement`非PASS、authority control mode/commit/schema不符、mode非`canonical_only`或仍有active legacy usage，一律回報`Retirement Pending`；`qc:dev-task-completion-audit`必須拒絕complete／handoff ready／release ready。
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
