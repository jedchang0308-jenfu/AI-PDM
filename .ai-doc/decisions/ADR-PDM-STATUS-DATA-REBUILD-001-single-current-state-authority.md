# ADR-PDM-STATUS-DATA-REBUILD-001：單一 current-state authority 與 Drawing 多研發分支

Status: `Accepted / Architecture Preserved / Trusted-Solo QA Contract / Fresh 94 + 3 Aggregate Pending / Production Zero-Loss Rehearsal & Release Gated`
Date: 2026-08-22; amended 2026-08-27
Owner: Dev PM
Related DEV: `DEV-087` / `DEV-PDM-STATUS-DATA-REBUILD-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`
Related QA: `.ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md`

## 1. Context

2026-08-23 最終資料政策：正式 PostgreSQL 零捨棄、零 unresolved、逐筆唯一 mapping；本機 SQLite 可刪除所有舊 workspace graph 與56筆 quarantine，但 canonical hash 必須不變。此決策取代本 ADR 任何 `retained_legacy_source` 或 production discard 描述；legacy 只可在遷移窗短暫存在，完成後前端、API、table read、projector 與 fallback 全部退役。

2026-08-23 DEV-090 supersession（RD Implementation Complete / Local QA-QC Complete / Production Gated）：使用者已決定在Drawing／Part drawer直接編輯root-level關聯矩陣，儲存後立即更新正式Relation，不建立Relation work或review。DEV-090 已完成本機實作、SQLite cleanup與retirement gate；正式 PostgreSQL provider parity、zero-loss rehearsal、cutover與release仍 gated。本ADR中`Part/Relation=正式＋work`、`relation_change_works`、Relation transient review／approval與Relation工作台 owner surface 均由`.ai-doc/decisions/ADR-PDM-RELATION-EDITING-001-direct-formal-authority.md`取代；Drawing、多branch、Part work/review、單一current authority及正式資料零遺失政策不變。

三工作臺目前由多套 DB 狀態、lifecycle、approval、human/viewer/responsibility/availability projector 與 lane resolver共同拼出 current state。UI 即使減字，底層仍可能對同一資料得出矛盾結論。

DEV-086 先解決生產版被研發版遮蔽，採用一列 production＋一列 RD。然而後續產品決策要求平行研發分支都能被看見與處理；單一 RD aggregate 仍會隱藏工作，也無法精確保存每個 revision 的來源。

同時必須維持：

- Drawing 有 revision；Part／Root 沒有 revision。
- 未核准工作不能污染正式資料。
- production promotion 失敗時舊正式仍有效。
- 一般 UI 最大程度精簡，branch、source、workflow 與技術稽核資料不顯示。
- 已核准資料完整追溯；未核准取消資料最大程度清除。

## 2. Options Considered

### A. 只改 UI 文案，保留所有舊 projector

Rejected。表面精簡但 current authority 仍分散，同類矛盾會再發；filter、drawer、list 仍可能各用不同來源。

### B. 延續 DEV-086，每 Drawing 只保留一列 RD aggregate

Rejected。無法同時呈現平行 branch 的 latest work；aggregate conflict row 也不能讓使用者知道每個分支都待處理。

### C. 每個 revision 都當 current row

Rejected。清單會變成歷史總表；同 branch 的舊 revision 會干擾目前工作，無法維持極簡人類語意。

### D. 單一 canonical current-state authority；Drawing=production 0/1＋最多三個 open branch latest，Part=正式 0/1＋work 0/1，Relation=正式矩陣

Chosen。它把 Drawing／Part current row identity、處理責任、分支 latest 與正式效力放在一個 server-owned read/write model；Relation 不再建立 current row，改由 `drawing_part_links` 與 inline matrix authority 維持正式關聯。

### E. 長期 dual read/write，逐步淘汰舊狀態

Rejected。會永久保留兩套真相與 fallback。只允許離線 shadow conversion 與 maintenance-window cutover；通過 gate 後同一窗口移除舊 current-state authority。

### F. 延用 `numbering_draft_workspaces` 作為三 domain 共用 current work authority

Rejected。舊 workspace 同時承載不同 domain、不同生命週期與 legacy projector 語意，若繼續映射，乾淨重建仍會依賴舊混合 authority，無法建立可由 DB constraint 驗證的單一 current work。

### G. Drawing／Part 各建專用 work table；Relation direct formal edit

Chosen。新增 `drawing_revision_works`、`part_change_works` 保存 Drawing revision work 與 Part change work；Relation 改由 DEV-090 的 inline matrix direct formal edit 處理，`relation_change_works` 只作 migration source，activation 後退役。legacy workspace 只作遷移來源，不再是新 runtime authority。

### G2. 將 DEV-087 decision 直接寫入既有 `approval_platform_decisions`

Rejected。現況該表只接受`approved|rejected|needs_info`，永久保存 reviewer、decision、comment且有no-delete trigger；本案已確認永久只保存review cycle/entity/time。強行共用會違反資料最小化、退回語意與清除契約。

### G3. 沿用 `/approvals`入口，但以專屬 transient review request adapter供應DEV-087

Chosen。`pdm_work_review_requests`只在pending/applying/apply_failed期間保存exact reviewer與snapshot；return或formalize success後清除。`pdm_review_traces`永久只留cycle/entity/time。其他approval domain的既有request/decision/history不變。

### H. 延後 branch close／提供一般 close 或 reopen

Rejected。idle RD branch 若已不再有效卻永久佔用三分支上限，會形成無法清除的 current row。Chosen 方案是在本期提供受審核的 `申請作廢`：只有該 open branch 最新、已核准且 idle 的研發版可申請；核准後關閉 branch，且不提供 reopen。

### I. 為未核准實體檔案提供備份回復功能

Rejected。實體檔案在零有效引用且通過 canonical-only gate 後永久刪除，不提供備份回復、使用者恢復或 UI 復原入口。資料庫 schema、資料與 binding 的切換備份／rollback 仍為 release gate，兩者不得混為一談。

## 3. Decision

採用以下不可拆分的決策組：

1. 新增單一 `canonical_workbench_states` authority，三 workbench list/drawer/filter/action projection 只讀它。
2. Drawing production 唯一鍵是 `company+drawing+production`；Drawing RD 唯一鍵是 `company+drawing+branch_id`。同一 `company+drawing` 最多三個 open RD branches；`pdm_workbench_aggregates` 的 stable lock row 在 PostgreSQL `FOR UPDATE`／SQLite write transaction 內原子維護 `open_branch_count=0..3`，第四個新 branch 必須拒絕。
3. 每個 Drawing branch 使用不可變 hidden `branch_id`，每個 revision 綁 exact predecessor revision ID；不從 revision code 或時間猜測。
4. target revision 由 `company+drawing+revision` 全域唯一 claim 原子保留；版次以`M`／`M.n`tuple由server計算，不做decimal/client運算。production可建立下一production或下一RD；RD可續minor，且base仍current時才可推進下一production。未核准取消釋放claim，核准後永久不可重用。
5. 新增 `drawing_revision_works`、`part_change_works` 作為 Drawing／Part 的 current work authority；Relation 不建立 branch、revision或current work，正式關聯唯一由 `drawing_part_links` 維護。`relation_change_works` 不得被新 runtime 讀寫；不得以 `numbering_draft_workspaces` 或其他 legacy mixed workspace 直接承擔新 runtime authority。
6. canonical handling 只有 `none|owner|review_owner|system|system_admin|blocked`，直接映射固定角色文案。
7. 核准後自動正式化。async/failed path 只重試 exact approved snapshot，舊正式持續有效。
8. DEV-087 Drawing／Part request 的 review UI 只有核准／退回修改；Relation 新流程不建立 request或review，儲存矩陣即正式生效。其他 approval domain 維持既有 decision。Drawing／Part reviewer 經 canonical request route 使用編輯者相同 components/data/layout 的 fully-readonly editor。
9. minimal review trace 只保存 review_cycle identity、entity reference 與 decision time，用於追溯審了幾次及時間點；不進一般 UI。
10. Drawing approved revision 保存完整 controlled evidence；Part approved change 保存完整 before/after snapshot；既有 Relation approved snapshot 只作歷史唯讀證據，DEV-090 新儲存不產生 snapshot；未核准 canceled work 依 retention contract刪除。
11. Part attachments 的獨立即時生效由DEV-087直接決定並沿用現行附件authority，不進Part work/review snapshot/active-review lock/rollback；Drawing controlled file維持既有review lock與snapshot治理。Relation 矩陣依 DEV-090 直接正式更新，不建立 Relation review lock 或 snapshot。排在後續的DEV-088替代料號附件沿用、附件平台重建、權限改寫與whole-part lease不屬本ADR execution boundary。
12. 延續既有 non-owner edit scope：owner 可編輯自己的 work；具 `hasPdmNonOwnerEditScope` 且通過 action permission 的同公司使用者可編輯非本人 work；manufacturing 無編輯權；reviewer 只可由 exact request route 進唯讀審核頁。不得把 clean rebuild 誤改成 owner-only。
13. 本期實作 Drawing branch `申請作廢`。只允許 open、idle、latest approved RD 且無 active work 的 branch 送審；退回後恢復 idle open，核准並完成 system formalize 後 branch 轉歷史 closed、從 current list 移除、原子遞減 `open_branch_count`，且不得 reopen。已核准 identity、minimal review trace 與 controlled artifact 保留。
14. 未核准實體檔案在 refcount=0 且 canonical-only gate 通過後永久刪除，不提供備份回復功能。舊 current-state authority則在 external write freeze、old runtime/worker drain、DB/schema/binding backup+restore drill、shadow reconciliation、singleton authority fencing、single-authority smoke與retirement gate後，於同一maintenance window drop；開放流量前失敗以RPO=0 relational rollback，不保留read-only observation period。
15. 遇到舊契約與DEV-087衝突，以本ADR與主SPEC的新決策為主。舊current-state table/field/projector/resolver/filter/query/API command/feature flag能安全移除者必須在同一DEV拆除，不建立雙軌相容；只保留正式版次、受控檔案、permission、approved evidence及明確列入inventory的domain authority。
16. Cloud SQL PostgreSQL migration固定為`042_status_data_rebuild.sql`（041為後續DEV-088保留但尚不存在的編號）；042不得依賴041，可從001..040直接apply，未來若DEV-088重新核准041後補套也不得與042衝突。SQLite由`db/schema.sql`與`ensureDev087CanonicalWorkbenchSchema`維護。schema/table/API/route/module/query-budget的exact contract依主SPEC §§3.1.2、9、10，不再留作RD preflight決策。
17. DEV-087 review不寫`approval_platform_decisions`；`/approvals`只透過adapter聚合transient request與server-owned href。return或formalize成功即清除request/snapshot，apply failure只暫存到修復完成。
18. minimal retention是跨surface規則，不只限制`pdm_review_traces`。DEV-087 terminal decision的receipt/outbox/audit/log/error只可留下content-free technical projection，不得永久保存或重建reviewer、decision、comment、revision或work snapshot；active replay先重驗exact reviewer，terminal replay只回經授權的安全acknowledgement。full DB backup是受控、加密、90-day expiry的operational recovery evidence，不得掛回一般runtime或成為review歷史來源。
19. whole-object obsolete 不由 DEV-087 另造 command；既有 numbering authority 仍是唯一入口。只要同一 canonical entity 存在 `owner`、`review_owner`、`system`、`system_admin` 或 `blocked` 的 current work，作廢 action 必須 fail closed、不得建立 obsolete request、不得取消或改寫該 work。只有 formal entity idle 且無 active work／pending request 時，才可依既有 authority 申請作廢；此規則同時適用 Drawing、Part 與 Relation root。
20. root obsolete 不做隱含 cascade。root 或任一直接子項仍有 current work、review、system processing、open Drawing RD branch 或受控依賴時，root 作廢入口只回阻擋資訊並 zero-write；不自動取消子項、不自動改寫 stale、不把多個 domain 的 work 合併成一個 request。所有子項先各自完成或由其既有 authority 結束後，才可重新讀取 root impact 並建立 exact scope request。
21. `Merged` 是既有 domain authority 產生的 terminal evidence，不是 DEV-087 的建立／合併 command。三工作臺對 `Merged` 只允許從既有歷史導覽唯讀查看，current list、action descriptor 與 editor 不得提供復活、進版、修改或發布；UI-only QA 只驗證已存在且可由合法 UI 導覽的 history row，不得以 seed、SQL 或測試中途 mutation 補造 Merged 前置。

## 4. Human Semantics Decision

人類第一層只顯示：編號、單行品名、資料層／revision、固定角色處理狀態；受阻原因只在 drawer 條件式顯示。

| Domain | Formal/production | Work/RD |
|---|---|---|
| Drawing | `量產版 {revision}` | `研發版 {revision}` |
| Part | `正式資料` | `修改中` |
| Relation | `正式關聯` | `調整中` |

branch/source/predecessor、package/baseline/workflow/approval/raw status、人名與時間都不進 list/drawer/filter/tooltip/a11y。舊 filter URL 顯示`此篩選網址已失效`，不做 silent compatibility。

## 5. Branch Consequences

- production row 永遠第一；每個 open branch latest 都可見。
- branch 可各自同時處理一份 work；同 branch 不可有第二份。
- open branch cap=3，包含active與approved-idle branch；達cap時只禁止建立新branch，不妨礙既有branch續作。
- 建立新 branch 不會隱藏、merge 或關閉舊 branch。
- production advancement 只歷史化實際被 promotion 的來源 branch，其他 RD branch 保持 current。
- production advancement後其他舊base branch仍可續RD minor，但不得直接推進production。
- idle approved RD branch 仍是 current row，handling 為 none，並顯示主要動作 `進版` 與次要風險動作 `申請作廢`。
- `申請作廢` 只針對該 branch 的 latest approved RD；送出後進 exact request review，不建立新 revision。退回修改即結束本次作廢 request 並恢復 idle open；核准後由 system formalize 關閉整個 branch，使該 branch 不再有任何 current valid revision。
- branch close 後不得 reopen；current row 移除且 branch cap 立即釋放一格。已核准 revision、identity、minimal review trace 與 controlled artifact 仍保留供追溯，不因關閉而實體刪除。

## 6. Data Retention Consequences

### 保留

- 所有 approved Drawing version/file/preview/identity。
- 所有 approved Part/Relation before/after snapshot。
- 新系統每次 reviewer decision 的 minimal trace，即使 work 後來取消。
- 正式資料、shared assets 的其他有效引用、Part live attachments。
- pre-migration DB/schema/binding backup低成本保留90天，期滿刪除仍須核准；若備份時間點含active transient review，manifest須記錄數量、加密／存取／expiry與隔離restore限制，不能當成business trace使用。

### 刪除

- 新系統未核准 canceled work 的 work data、work bindings、unapproved revision identity/predecessor/claim；零有效引用且 canonical-only gate 通過後才永久刪除 physical bytes。physical bytes 不提供備份回復或 UI 復原入口。
- return或formalize success後的DEV-087 request/snapshot與transport payload；terminal receipt/outbox只允許主SPEC §3.4定義的safe technical projection，reviewer／decision／comment／content不得從旁路保留。
- legacy cancelled source不成為永久資料層：正式環境逐筆轉換審核次數／時間、關聯與檔案引用後刪除old current-state payload；本機在canonical hash不變的清理證據下直接刪除舊graph。
- 通過 cutover gate 後的舊 current-state tables/fields/projectors/filter/fallback。

## 7. Migration Decision

採 `external-write freeze／old runtime drain → DB/schema/binding backup+restore drill → offline shadow conversion → full reconciliation → authority-control fenced cutover → allowlisted smoke → same-window old-authority drop → canonical-only re-gate → reopen traffic`。

- ambiguous/unmapped data 禁止猜測，進阻擋清單；正式環境只有取得唯一人工mapping並完成receipt後才可清空。
- predecessor 只有唯一可證明才 backfill；否則 hidden `source_unknown`，經人工確認可算 resolved。
- cutover 要求 unresolved=0。
- 2026-08-23 最終決策：正式 converter 禁止 `--retain-unmapped-legacy` 與任何 discard flag；`unresolved=0`、人工mapping清單為空、source/target reconciliation=100%才可排cutover。本機舊資料不要求保存，清理後canonical count／PK／FK／內容hash必須完全不變。
- 不設舊表唯讀觀察期，不設永久 dual read/write。
- rollback 依完整 DB/schema/binding backup、authority control 與 exact application version 共同 restore；若 restore drill 未通過，禁止 drop。對外寫入在開放前維持 freeze，目標 RPO=0；若偵測未核准外部寫入，禁止自動 restore 並交人類對帳。此 rollback 不承諾回復已符合永久刪除條件的 physical bytes，因此 physical GC 必須延後至 canonical-only gate 後。

此決策接受「same-window drop 使 relational rollback 依賴完整 restore、而非切回舊表」，以及「符合條件的未核准 physical bytes 永久刪除、無回復功能」的風險，以換取沒有長期雙權威的乾淨狀態模型。

### 7.1 Transition Exit／Anti-Forgetting Decision

過渡期不得依賴執行者或 AI 記得回來清理；它必須是可由機器拒絕結案的同一個 DEV-087 完成條件：

1. runtime 只允許 `legacy_only`、隔離環境的 `shadow_compare`、受控維護窗的 `cutover_window`、最終 `canonical_only` 四種明確模式；禁止 production dual authority、dual write、canonical→legacy fallback與無期限 shadow。
2. DEV-087 的交付邊界包含舊 current-state authority 從 active runtime 退役；不得另開「日後清理」DEV、future capsule或非阻塞技術債，也不得因新功能 smoke PASS 就先結案。
3. RD必須在固定位置維護`.ai-doc/qa/dev-087-old-authority-inventory.schema.json`、`.ai-doc/qa/dev-087-old-authority-inventory.json`、`output/qa/dev-087-retirement/<run-id>/manifest.json`與`.ai-doc/qc/qc-dev-087-retirement-<date>.md`；QA驗證hash chain、負向注入與fresh-session continuation；QC執行聚合retirement gate；Dev PM與release owner在gate非PASS或manifest缺漏時只能標記`Retirement Pending`。
4. 聚合 gate `npm run qc:dev-087:retirement` 必須證明舊 schema read/write、projector／resolver／filter／URL／API compatibility、feature flag、runtime registration與fallback active usage皆為 0，並綁定 exact commit、schema hash、provider與退役收據。
5. production release gate的硬條件是singleton authority control=`canonical_only`且綁exact commit/schema/provider、retirement gate PASS、retirement manifest complete。isolated environment可使用canonical_only做完整驗證，但不能冒充production readiness。只有兩個production合法出口：完成canonical-only退役，或rollback回`legacy_only`；不得停在半套新舊並存。
6. `npm run qc:dev-task-completion-audit`必須消費DEV-087 QC summary與manifest；缺檔或hash/commit/schema/provider不符時拒絕完成。
7. AI 記憶不是 authority。新的 AI session 必須能由 `cold-start → DEV-087 index → SPEC／ADR／QA → retirement manifest`判斷目前模式、未清項與下一個 gate；若無法判斷或證據不存在，一律 fail closed 為 `Retirement Pending`。

## 8. Supersession

本 ADR 在 DEV-087 activation 時有意取代：

- `ADR-PDM-WORKBENCH-PRODUCTION-RD-LANES-001` 的 Drawing 單 RD row／最多兩列決策。
- `ADR-PDM-STATUS-UX-004` 以多 projector 合成人類 current status 的部分。
- 任何讓 legacy filter/current status fallback 保持 active 的相容決策。

保留：Drawing/Part/Root identity、approved revision/release evidence、permission、artifact security、現行Part attachment authority、現有 Drawing editor/recognition ownership。DEV-087只直接定義附件與Part work/review的隔離語意，不承接後續DEV-088尚待縮編的資料模型、替代沿用、權限或lease方案。

DEV-086 在 DEV-087 尚未啟用前仍是現行 runtime baseline，不能因本 ADR 已 Accepted 就假稱產品已切換。

## 9. Consequences

正面：

- 不再出現同列兩套互斥狀態。
- 平行研發工作完整可見，不由 aggregate 掩蓋。
- production 使用 exact approved data，失敗時不被半完成資料取代。
- UI 語意顯著減少，後端仍保有必要嚴謹與追溯。
- idle branch 可由受審核作廢正常退出 current set，不會永久佔用三分支上限。

成本與風險：

- 需要新 schema、converter、branch/claim concurrency、command transaction 與 destructive migration。
- pagination/query 必須支援每group最多四列（1 production+3 RD），並在0/1/3 branches維持常數query budget。
- same-window drop 的 relational rollback 依賴 restore drill，maintenance window 與 release gate 是 P0。
- 未核准 physical bytes 在安全門檻後永久刪除且無回復功能，refcount、approved-artifact guard 與 canonical-only gate 是 P0。
- production converter與兩次restore rehearsal仍待正式環境執行；在完成前production migration/release維持BLOCKED。local old graph已依明確allowlist清除，不得重新引入相容讀取。

## 10. Re-entry Triggers

需要下列任一改變時重開本 ADR：

- Drawing RD open branch hard cap要從3改為其他值、要合併／允許重開或讓使用者看source/branch。
- branch close 不再由 latest approved idle RD 的 `申請作廢 → 審核 → system formalize` 驅動，或要增加一般 close／reopen action。
- review trace 要保存 decision/reviewer/comment/content。
- Part attachments 要跟隨 review 或 rollback。
- 不能在同一 maintenance window retire old authority。
- target revision 無法用 DB/global constraint 原子 claim。
- 全量 migration 無法達成 unresolved=0 或 DB/schema/binding restore drill 無法保證 relational rollback。

## 11. 2026-08-25 功能完整性重開判定

本次DEV-087重開不建立新ADR。8項缺口是既有single-current-state架構的journey與implementation completeness問題：Drawing FFF仍需收斂進同一canonical work/review、task center需重新掛回既有task/notification authority、Drawing／Part formal obsolete需只走既有approval authority、Part variant需進既有Part work snapshot，其餘是exact history/file readback、matrix navigation與list query/cursor接線。R1～R3已完成本機接線並取得自動化evidence。2026-08-27起local QA改採單人可信契約，不再等待Independent QC／AT receipt；契約變更後仍需fresh 94案＋3 Gate aggregate。正式migration／cutover／release仍另行gated。

下列決策仍不可改變：

- current Drawing／Part work與review各只有一套；舊Drawing submission／FFF review與Part direct PUT不得作平行writer。
- formal obsolete只使用既有numbering approval request/apply；Drawing RD branch void仍是另一個明確domain action，`part_root`不在本次範圍。
- Relation仍由DEV-090 direct formal matrix authority擁有，不恢復Relation work/review/page。
- 新增資料只進既有JSON／domain tables，schema/migration=`none`；review永久留存仍只有cycle/entity/time。

若RD需要新增table／migration、永久dual-write、第二套review request、保存reviewer/outcome/comment/content、擴張root能力或讓Part attachment進review，才觸發本ADR re-entry。完整implementation contract見配對SPEC §15。

本輪歷史evidence保留：actual PostgreSQL G4 product `output/qa/dev-087-capability/DEV087-product-g4-postgres-2026-08-25T15-44-41-956Z/manifest.json`、G4 integrity `output/qa/dev-087-capability/DEV087-G4-20260825155456106/manifest.json`、aggregate `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-25T15-53-16-455Z/manifest.json`。其anti-cheat斷言不再是current completion authority；產品、provider、security、visible UI、primary invariant與cleanup斷言可作新契約重跑前的回歸參考。`part_root`排除及正式zero-loss rehearsal／release gate不變。

## 12. 2026-08-27 單人可信QA決策

此決策只改變local QA的執行與證據契約，不改變本ADR的single-current-state authority、Drawing branch、Part work/review、Relation direct formal matrix、file identity、permission或transaction決策，因此`No New ADR`。

- DEV-097的G0-A／G4、Independent QC／AT receipt、immutable denominator、independent oracle、mutant與artifact anti-cheat已由使用者明確取消為current completion gate。
- DEV-087改以94個產品案例、`QG-087-PROVIDER`、`QG-087-SECURITY`與`QG-087-UI`驗收；同一開發者可執行RD／QA／QC。
- 尚未修改的舊registry／aggregate runner只作Historical Supporting，不得因Independent receipt缺席判產品FAIL；後續仍需實作新分母並執行fresh run。
