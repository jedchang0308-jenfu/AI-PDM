# QC Report：DEV-053 單一圖號工作台

Status: `Phase 1H Independent Local QC Passed / Commit Pending / Production Release Gated`
Date: 2026-08-05
Branch: `持續優化1`
Scope: DEV-053 Phase 1A～1H current local implementation；未連線、遷移、部署或修改 production。

## 1. Final Verdict

Phase 1H current source已完成AI QA與獨立QC並判定`PASS`：P0=0、P1=0、P2=0。Phase 1F/1G證據保留為歷史基線；目前最終判定來自Phase 1H focused aggregate、兩次隔離真實Chromium、交易後資料讀回、protected hash與optimized production build。尚未stage/commit，亦不構成migration、activation、deploy或production release授權。

## 2. Frozen RD/QA Evidence

| Command / check | RD/QA result | Evidence |
|---|---:|---|
| DEV-053 schema | 9/9 | nullable source context、additive/idempotent migration、zero backfill、provider parity、default-off flag |
| DEV-053 read model | 8/8 | stable disjoint row identities、server stage/action、bounded keyset、formal filters、same-root detail、zero-write、permission fail-closed |
| DEV-053 HTTP | 10/10 | GET-only BFF、permission/tenant、private no-store、query validation、bounded hydration、production allowlist closed |
| DEV-053 UI | 16/16 | 無雙頁籤、四欄決策表、舊URL正規化、單一primary CTA、CAP-01～14、production-slice visible-disabled、responsive |
| DEV-053 flow | 7/7 | source context、relationship-only append、fault rollback、retry exactly once、跨公司拒絕 |
| AI real operation | 27/27 | 真實Chromium、CAP-01～14、四viewport、file chooser、送審/撤回/再送審、reviewer核准、自動正式化、正式附件readback、reload冪等 |
| TypeScript | PASS | 全`src` 0 error；排除混合工作區既有`.next-*`產物 |
| scoped lint | PASS | 0 error；`master-attachment-panel.tsx`保留3個既有warning |
| isolated production build | PASS | 獨立QC以短路徑、`npm ci`、乾淨detached worktree執行`npm run build:isolated`，compile、TypeScript與static pages完整exit 0 |

## 3. AI Real-operation Evidence

- Run：`DEV053-20260805-033336-local-isolated`
- Frozen product snapshot：temporary clean-index commit `167199c6b13615d3b134009abb3ae4b87c73418d`；source hash `35868f50b3ca1451ed36757cdd80bac8357d280f6fb131582b9790863c668f8e`
- Root：`output/playwright/dev053-real-operation/DEV053-20260805-033336-local-isolated/`
- Environment：isolated local SQLite + isolated Next.js + real Chromium UI
- Safety：`productionConnected=false`、`productionWrites=false`、cleanup=`removed`
- Browser：console errors 0、failed 5xx responses 0
- Responsive：1440×900、1280×800、1024×768、390×844；document/main無水平overflow，mobile切換card layout。
- Lifecycle：既有reservation在原流程往前；candidate建立後正式master仍為0；真實檔案上傳後送審、撤回、再送審；reviewer核准後原子正式化；重複reload後business hashes不變。
- Capability：正式drawer恢復CAP-01～14，包含版次、送審、關係、影響、作廢、治理、同根料號、主資料、成本、主要圖與受控檔案摘要；`圖面進版`只有一個主控制。
- File authority：正式化後master drawer可見正式版`0.1`與1個受控檔案，upload/delete controls均為0。

## 4. QA Defects Closed Before QC Freeze

QA 視覺判讀曾發現 package file 建立後，底層 `file_assets` 仍指向 candidate revision，造成正式 master drawer讀不到附件。RD 修正 formalization transaction：

1. 驗證 asset 仍屬於該 candidate、未刪除；不符即 `APPROVAL_SNAPSHOT_STALE` 並rollback。
2. 同一 transaction 將 asset ownership 改為正式 `drawing_number`。
3. 再建立 package file reference。
4. 真實 UI 重新驗證檔名可見、master drawer唯讀與reload冪等。

Phase 1E另關閉兩項視覺缺口：formal drawer主CTA寬度在窄drawer被過度撐滿；revision入口同時出現在primary與secondary造成重複。修正後最新截圖確認主CTA可讀且`圖面進版`只出現一次，UI focused case `DEV053-UI-016`與真實操作均通過。

## 5. Existing-data and Production Boundary

- Migration只新增 `numbering_draft_workspaces.source_drawing_number_id`、`source_part_number_id`、`source_link_type` 三個nullable欄位與constraints/indexes；沒有business DML或backfill。
- 舊 rows 維持 NULL；純讀、搜尋、filter、drawer與舊URL不建立workspace、candidate、audit、receipt、outbox或sequence facts。
- `PDM_UNIFIED_DRAWING_WORKBENCH_V1`預設 off，且依賴DEV-052 lifecycle V2；production mutation allowlist未開放。
- 本報告與本次commit不授權production migration、feature activation、deploy、release或production smoke。

## 6. Historical Frozen-commit Independent QC Checklist and Result

以下勾選與PASS只適用Phase 1E凍結commit，不代表目前Phase 1F／固定3000已驗收。

- [x] 重新檢查SPEC/ADR/QA與DEV-053 diff一致性。
- [x] focused contracts 50/50、TypeScript、scoped lint與isolated build全部通過。
- [x] server-side projection、bounded hydration、read path zero-write通過。
- [x] 舊reserved URL、existing reservation、contextual append與direct-master closure通過。
- [x] formalization transaction的source relation與asset ownership轉移全有或全無。
- [x] CAP-01～14、formal drawer正式附件唯讀與無mutation controls通過。
- [x] default-off、production allowlist closed、zero backfill及production false evidence通過。
- [x] 凍結commit的`npm run build:isolated`完整exit 0；RD junction環境異常不可重現，非產品缺陷。
- [x] DEV-053 commit不含DEV-054的DVT刪檔、023/024 migration、專案狀態移除hunk或其文件。
- [x] 最終判定PASS；P0=0、P1=0、P2=0。

## 7. Historical Frozen-commit Independent Real-operation Evidence

- Frozen commit：`6ddd5759e22178b7004e5d5a9927b0dfbe11b706`
- Run：`DEV053-20260805-035048-local-isolated`
- Root：`output/playwright/dev053-real-operation/DEV053-20260805-035048-local-isolated/`
- Result：27/27 passed、failed 0、14 screenshots；1440×900、1280×720、1024×768、390×844。
- Coverage：舊`?tab=reserved`、既有保留號原地推進、建立與關聯、真實file chooser上傳、送審／撤回／再送審、reviewer核准、原子正式化、正式受控檔唯讀與reload冪等。
- Safety：`productionConnected=false`、`productionWrites=false`、cleanupStatus=`removed`；browserErrors=0、failedResponses=0、visibleErrors=0。
- Environment：前兩次runner失敗來自Windows長路徑與Turbopack拒絕跨根`node_modules` junction；使用真正短路徑clean detached worktree + `npm ci`後完整通過，未修改產品。

## 8. Protected Parallel-work Boundary

工作區另有DEV-054的並行變更。DEV-053 commit已由RD與獨立QC確認未包含DEV-054、DVT/phase-gate刪檔、023/024 migrations、project-status-removal程式或文件。DEV-054仍保留在主工作區的未暫存範圍，未被DEV-053修改、還原或提交。

## 9. Current Release Gate

DEV-053 Phase 1F本機implementation與AI QC gate已通過；production release仍維持阻擋。本報告不授權production migration、feature activation、deploy、release或production smoke；若要進正式環境，仍須取得明確指令並執行deployment release gate、backup/rollback與post-deploy smoke。

## 10. 2026-08-05 Post-QC 3000 Runtime Finding and Correction

使用者在固定3000實際操作後發現：A0005候選drawer的`完成首版圖面`被鎖住，formal drawer的`圖面進版`、`上傳與送審`、`製造影響`顯示`未開放`。根因不是CAP-01～14程式被刪除，而是本機`.env.local`仍設定`PDM_PRODUCTION_SLICE_MODE=official-numbering-draft`；先前獨立run固定使用空白slice，因此未覆蓋使用者的固定3000設定。原PASS只對凍結commit與隔離runner有效，不能作為修正後delta的獨立QC判定。

修正：固定`dev:local`入口設定development-only `PDM_LOCAL_FULL_FUNCTION_VALIDATION=true`；`getProductionSliceState`只在`NODE_ENV=development`接受該flag，production仍依`PDM_PRODUCTION_SLICE_MODE` fail closed。未修改production設定、allowlist、資料、migration、部署或DEV-054 protected scope。

RD read-only evidence：

- `GET /api/production-slice/status`：`configured=false`、`active=false`、`mode=""`、`localFullFunctionValidation=true`。
- 真實已登入Chrome：A0005 drawer可見candidate editor、1個file input、拖放區與`上傳主要檔案`；production-slice unopened control為0。未由RD觸發upload/review mutation。
- A0007 formal drawer：`圖面進版`、`上傳與送審`、`完整圖料關係`、`製造影響`均為enabled link；受控檔案摘要、歷史版本、送審檢查、同根料號均可見。
- `qc:pdm-production-slice-numbering-draft` 34/34、`qc:pdm-number-state-flow-routes` 9/9、TypeScript與scoped ESLint通過；production-mode negative contract通過。
- 現行混合工作區DEV-053 focused結果為49/50：read model 8/8、HTTP 10/10、UI 16/16、flow 7/7、schema 8/9。唯一失敗是`DEV053-SCHEMA-005`的Supabase manifest source hash；該manifest正由受保護的DEV-054新增023/024 migration，RD依使用者指示未還原、修改或納入DEV-053。凍結commit原始50/50證據仍只代表先前snapshot；新delta的獨立QC應在DEV-054完成或以正確範圍化baseline重驗。

目前判定：使用者固定3000的可達性缺陷已由RD修正並做真實只讀驗證；新delta仍須由獨立QC依RO-15重跑後，才能再次標記`Independent QC Passed`。production release gate維持關閉。

## 11. Historical 2026-08-05 PM Supervisor Phase 1F Reopen

PM主管以Phase 1E前後能力、固定3000操作、current source與證據契約反向複核，確認共16組產品／交付缺口。關鍵不符合包括：

- 固定3000上傳後仍可能停在`等待 finalized 證據`，沒有可操作的完成／恢復／送審下一步；
- 預設`我的待處理`會排除大多數正式圖面，造成正式管理能力實際不可發現；
- 參考附件與candidate/revision受控檔authority及recovery routing未收斂；
- real-operation對正式secondary能力只驗證link存在，未逐一導覽並完成代表性任務；
- 搜尋request競速、filter後drawer殘留、keyboard／403／empty／terminal、visible technical terms、計數口徑與accessible name未納入原PASS gate；
- 3000 runtime與upload correction仍未形成可與DEV-054分離的current scoped SHA。

當時QC disposition：`Reopened / Not Accepted`。Phase 1F文件已依Human Decisions `1A 2A 3A 4A 5B 6A`達`RD Implementation Ready`，但當時產品尚未修復。其後current-source closure結果見第12節。

## 12. 2026-08-05 Phase 1F Current-source Closure

- Current aggregate：`npm run qc:dev-053` exit 0；schema 9/9、read model 10/10、HTTP 13/13、UI 20/20、flow 7/7、TypeScript PASS。
- AI real operation：`output/playwright/dev053-real-operation/DEV053-20260805-100249-local-isolated/`，27/27、14 screenshots；source hash `c2160977e2f0e673ab0af2f47364e43dffd325d8fa3c962a7e3943f966451774`。
- Lifecycle evidence：真實file chooser、storage hash read-back、publication evidence、送審、撤回、再送審、reviewer核准、原子正式化、canonical row、deep link與reload冪等均通過。
- UI/data evidence：default all、explicit history、multi-file、controlled/reference authority、共享revision workbench、exact permission、keyboard/RWD通過；browser error、5xx及visible error均0。
- Safety：`productionConnected=false`、`productionWrites=false`、cleanup=`removed`；固定3000僅對既有A0005做read-only smoke，未修改既有資料。
- Build：optimized production build compile成功、TypeScript成功、122/122 static pages完成。
- DEV-054：023/024 migrations、project-status-removal文件與既有刪除語意維持受保護；DEV-053未授權還原或重寫。共用檔仍須在未來commit時逐hunk審查。
- Final disposition：`PASS / P0=0 / P1=0 / P2=0`。尚未commit；production migration、activation、deploy與release維持gated。

## 13. 2026-08-05 A0005 Existing-file Recovery Re-QC

### 13.1 Defect and correction

A0005已保存`A0005.SLDPRT`與`A0005-M01.SLDDRW`，但兩筆candidate file缺publication evidence；舊CTA要求先選新檔，導致使用者即使已上傳仍無法往送審推進。RD新增target-only既有檔驗證：UI不要求重傳；server由DB取得asset/storage pointer，核對實體size與SHA-256後才在同一transaction建立evidence、連結file、遞增row version並寫audit/outbox。production無正式provider authority時維持fail closed。

### 13.2 Automated regression result

- `npm run qc:dev-053`：PASS；schema 9/9、read 10/10、HTTP 14/14、UI 21/21、flow 7/7、real operation PASS、TypeScript PASS。
- 最新隔離run：`output/playwright/dev053-real-operation/DEV053-20260805-131319-local-isolated/`；包含正常existing-file recovery、idempotent replay、tampered hash 409零寫入及原上傳到正式化主線；cleanup removed、productionConnected/productionWrites false。
- DEV-052 regression：data protection 4/4、Phase 1B HTTP 10/10／UI 16/16、Phase 1C flow 8/8。
- Scoped ESLint、TypeScript與`npm run build:isolated`全部PASS；production route manifest包含authoritative candidate revision files route。

### 13.3 Fixed-3000 real-operation result

- AI使用既有登入session及使用者指定A0005，真實點擊`驗證既有檔案（2）`；沒有使用file chooser、API或DB代替該UI動作。
- 完成後恢復CTA消失，兩個未驗證標記歸零、兩個驗證完成標記存在，readiness文案可見，送審控制enabled，browser error log為0。
- DB確認candidate仍為`draft`、`approval_request_id=NULL`、row version 6；原file/asset IDs不變，新增兩筆evidence、兩筆audit與兩筆completed command receipt。
- 實體檔SHA-256與DB asset/evidence相符：`A0005.SLDPRT`=`e2060691...4328f2`；`A0005-M01.SLDDRW`=`0dc8d2b6...62337e`。
- QC刻意未點`送交審核`，因此沒有改變A0005審核狀態。

### 13.4 Boundary and verdict

本修復沒有schema/migration/backfill、沒有新增或替換A0005原檔、沒有改號、沒有production連線／部署／release。DEV-054的023/024 migration、DVT／phase-gate刪除與文件仍屬受保護並行範圍，未被本修復還原或改寫。最終判定：`PASS / P0=0 / P1=0 / P2=0`；commit與production release仍待使用者明確授權。

## 14. 2026-08-06 Final Independent QC Freeze

### 14.1 Product and real-operation result

- `npm run qc:dev-053` exit 0：schema 9/9、read 10/10、HTTP 14/14、UI 21/21、flow 7/7、real-operation 31/31，共92/92，TypeScript通過。
- Run：`output/playwright/dev053-real-operation/DEV053-20260806-015338-local-isolated/`；16張screenshots、browserErrors與visibleErrors皆空，`productionConnected=false`、`productionWrites=false`、cleanup=`removed`。
- Fixed 3000 read-only QC：`output/playwright/dev053-fixed-3000-qc/DEV053-final-fixed3000-report.json`；1280×720、1024×768、390×844的document與drawer overflow均0，A0005-M01有兩個已驗證主要檔案及可見送審CTA，visible alerts與console warn/error為0。QC未點送審。

### 14.2 Regression, isolation and configuration integrity

- Phase 1C 45/45、Phase 1D 60/60、Phase 1B 17/17、DEV-052全套與AI real-operation 41/41均通過。
- Lifecycle actions 266/266、actions UI 16/16、obsolete 115/115、BOM obsolete 17/17、submission obsolete 22/22、controlled history 56/56、controlled-history UI 32/32、release readiness 48/48及git boundary均通過。
- 所有lifecycle receipts皆為`productionConnected=false`、`productionWrites=false`、`productionDataUnchanged=true`、cleanup/temp/dist removed。
- QC首次重跑發現Next child在結束後污染tracked TypeScript設定；RD新增可靠child-exit與原子restore guard，並清除canonical設定內歷史QC暫存型別路徑。修正後RD連跑兩輪、獨立QC再跑一輪，`tsconfig.json`與`next-env.d.ts`前後SHA皆完全一致，TypeScript與18檔scoped ESLint通過。

### 14.3 Protected boundary and verdict

DEV-054的023/024 migrations、DVT／phase-gate移除與SPEC／ADR／QA／QC共8個protected hashes在測前／測後逐一一致；本輪未修改、還原、stage或commit該任務。Post-change convergence：`No contract drift`，ADR not needed。最終判定：`PASS / P0=0 / P1=0 / P2=0`；commit、migration、activation、deploy與production release仍未授權。

## 15. 2026-08-06 Phase 1G Multi-Part Targeted QC

### 15.1 Verdict

判定：`Targeted PASS / P0=0 / P1=0 / Known test debt=1 suite`。本判定只覆蓋多料號batch新增範圍，不取代production migration/release gate，也不把既有全生命週期suite的舊契約債標成PASS。

### 15.2 Product evidence

- 固定3000登入後解析A0005-M01，P01/P02/P03三個合法primary parts預設全選；取消P03後CTA與摘要同步為2，再選回後同步為3，並明示`核准時全成或全退`。
- A0005只做read/select；沒有上傳、送審、改號、回填或狀態更新。console error 0；1280 viewport下所有part cards均在main/fieldset邊界內，document horizontal overflow 0。
- 每個選中料號的材質與表面處理缺口個別顯示，任一未完成會使整批送審disabled，沒有以第一個料號代表全部。

### 15.3 Automated and transaction evidence

- TypeScript、production build、drawing-part security、change-control 62/62、access-control async repository 236/236、Supabase migration mirror全部PASS。
- `qc:pdm-release-master-status-sync` 45/45：涵蓋一筆submission建立三筆scope、三料號同transaction正式化，以及任一live relationship漂移時完整rollback。
- PostgreSQL/Supabase 025為additive；scope table有PK、submission/part唯一鍵、FK、index、RLS enable+force與`PUBLIC/anon/authenticated` direct grant revoke。Supabase CLI不在本機，因此只有mirror/hash/contract驗證，未對遠端執行migration。
- DEV-054受保護的023/024 source與Supabase mirrors未被修改；沒有還原DVT/phase-gate刪除。

### 15.4 Known test debt and safe limitation

- 舊`qc:pdm-drawing-submission-workbench-mutation`為22/33；主要release fixtures仍假設`0.1`可成為Released，現行政策正確回`minor_revision_cannot_be_released`，另有舊`nonBlockingHistory` read-model期待。QC拒絕為了綠燈放寬正式版次政策，列為後續測試契約更新。
- 多料號confirmed impact需要每個舊料號各自對應替代料號。Phase 1G在UI/server明確fail closed；不允許一個replacement覆蓋多個old parts。
- Commit、production 025 migration、deploy與release均未授權／未執行。

## 16. 2026-08-06 Optional Standard Cost Targeted QC

判定：`PASS / P0=0 / P1=0 / P2=0`。圖面進版送審的標準成本已由必要改為選填；成本主檔、審核、權限與維護入口未移除。

- Static contract：`node scripts/qc-dev-053-drawing-workbench-ui.mjs` 22/22；明確驗證成本未加入`hasOutstandingItems`／`outstandingCount`，也未使用danger tone。
- Code health：`npx tsc --noEmit --pretty false` PASS；受影響TSX／script scoped ESLint `--quiet` PASS。
- Fixed 3000 formal drawer：A0005-M01的P01/P02/P03三筆成本皆未設定，畫面顯示`送審檢查／資料已備妥`、`標準成本／3 筆未設定・選填`；panel class=`is-ready`，cost chip=`is-default`、中性色。
- Fixed 3000 search drawer：同圖號顯示`標準成本／3 筆未設定（選填）`且為中性色，與工作台契約一致。
- UI gate：1280×720兩入口visible error 0、document horizontal overflow 0；未送審、未修改既有A0005資料。
- Boundary：無schema/API/資料migration；未修改或還原DEV-054。Commit、deploy、production migration/release均未執行。

## 17. 2026-08-06 Revision Intent Recovery Targeted QC

判定：`PASS / P0=0 / P1=0 / P2=0`。

- Root cause：加入0.2版次檔案後，submission-context回傳下一個server suggestion 0.3；前端未鎖定本次上傳意圖，導致畫面改成0.3並把0.2檔案移至參考範圍。
- Fix evidence：加入新版檔案時設定`revisionIntentLockedRef`；context refresh只有在未手動修改且未鎖定時才套用server suggestion；重新解析另一圖號會清除鎖定。
- Static contract：新增`upload_revision_intent_lock_missing`檢查通過。完整`npm.cmd run qc:pdm-reservation-revision-timing-ux`為13/14；唯一失敗是既有`reservation_revision_authority_introduced`契約對保留號工作台現存字串的誤判，與本次版次意圖修正無關，未為了綠燈放寬保留號資料邊界。
- Expected fixed-3000 operation：以0.2加入A0005.SLDPRT與A0005-M01.SLDDRW後，畫面保持0.2，兩檔可選為本次送審，不會自動跳成0.3；送審CTA再依附件／變更原因／FFF必要條件判定。
- Fixed-3000 read-only recovery：既有資料重新載入後，輸入0.2即可恢復兩個0.2主要檔案為`本次送審`；補上變更原因後，`建立送審（1 張圖・3 個料號）`為enabled、visible error為0。再觸發料號選取造成的非同步context refresh，版次仍保持0.2，未跳回0.3；QC未點擊送審，未改變既有正式資料。
- Boundary：未修改schema、migration、正式資料或DEV-054；未commit、deploy或release。

## 18. 2026-08-06 Phase 1H Independent Local QC

### 18.1 Verdict

最終判定：`PASS / P0=0 / P1=0 / P2=0`。RD frozen source的Phase 1H單一生命週期、單一審核權威與完成後限域cleanup均符合SPEC 0.10；未發現資料安全、權限、狀態一致性、UI下一步或相容性阻塞。

### 18.2 Independent execution evidence

- Independent focused suite：schema 15/15、8B adoption 9/9、authority/cleanup 9/9、HTTP 9/9、UI 9/9、real Chromium 8/8，共59/59；TypeScript與30檔scoped ESLint PASS。
- Independent browser run：`DEV053-PHASE1H-20260806-134417`，由實體隔離workspace、disposable SQLite、isolated Next.js port 56131與真實Chromium執行。`productionConnected=false`、`productionWrites=false`、cleanup=`removed`、browserErrors=[]、failedResponses=[]、四張screenshots；完成後舊request資源的一次410為預期canonical redirect探測。
- RD/AI QA durable evidence：`output/playwright/dev053-phase1h-real-operation/DEV053-PHASE1H-20260806-133320/run-report.json`同樣8/8；fresh submit的legacy submissions/permanent task/notification皆0，active native request/workflow各1，terminal後兩者皆0；package 1、part scopes 3、package files 2保留，minor版狀態為`rd_controlled`。
- 8B：adoption先dry-run，任一blocker使整批不apply；exact replay冪等，沒有decision replay或completed/unknown rewrite。
- 9B：目前圖面狀態與`我的待辦`由durable package/current read projection形成，沒有永久Phase 1H notification或manual task row。
- 10B：清除後exact review link導向該圖號最新版；不保留舊審核頁、決策動作或review tombstone。

### 18.3 Regression and boundary

- Supabase migration mirror 76/76、approval-platform 126/126、isolated optimized build與TypeScript PASS。approval-platform舊static test原綁定`approvalProjection`字串；QC後由RD改為驗證canonical drawing-owner workbench BFF與reviewer capability傳遞，再重跑126/126，未恢復舊平行projection。
- Independent QC測前／測後比對27個frozen product-scope檔，`Changed=0`。DEV-054的023/024 PostgreSQL source及Supabase mirrors四個hash完全一致，沒有還原其DVT／phase-gate刪除或修改其語意。
- 限制：本判定只涵蓋本機／隔離產品實作與migration artifact；沒有套用026或8B adoption到固定3000、staging或production，也沒有live Supabase CLI migration。commit、activation、deploy、data repair與release皆維持gated。

## 19. 2026-08-07 Phase 1H Gap Repair Closure

### 19.1 Verdict

最終判定：`PASS / P0=0 / P1=0 / P2=0`。本輪針對上一輪獨立 QC 發現的四項缺口完成 RD 修復，並由隔離資料庫與真實 Chromium 重新驗證通過。

### 19.2 修復內容與證據

- 退回理由：`drawing_revision_packages.active_correction_reason` 回傳至共用圖面進版頁；`退回修改`後可看見「請修正後重新送審」與審核者說明，重新送審後立即清除。完整真實操作 `AIRO-08`、`AIRO-09-REASON`、`AIRO-06` 通過。
- 審核 deep link：首輪 render 不再由 `window.location` 參與 state initializer，改為 mount 後同步篩選與 requestId；3000 `approvals?status=active` 真實頁 console error 0、hydration error 0。
- active adoption：adopter 產生包含 `drawing`、`parts`、`files` 的 immutable impact snapshot；adoption QC `DEV053-1H-ADOPT-010` 驗證 UI 所需料號／檔案數為 1／1，不再顯示 0 個。
- cleanup retry：新增 request-scoped `POST /api/approvals/requests/[requestId]/cleanup`，只允許同公司且被指派的 R&D Manager／Admin，審核頁提供「重試流程整理」；真實點擊後 workflow／request／decision 均為 0，`AIRO-16-CLEANUP-RETRY` 通過。

### 19.3 Regression and boundary

- `npm run qc:dev-053:phase1h` 全套通過：schema 15/15、adoption 10/10、authority 9/9、HTTP 10/10、UI 12/12、real-operation 8/8。
- 完整 AI 真實操作 `output/playwright/dev053-phase1h-real-operation-full/DEV053-PHASE1H-FULL-20260807-014809/run-report.json`：24/24；包含文字退回理由、cleanup retry、跨公司權限、4 種 viewport；`productionConnected=false`、`productionWrites=false`、`browserErrors=[]`、`failedResponses=[]`、`cleanup=removed`。
- TypeScript `npx tsc --noEmit --pretty false` PASS；DEV-054 protected boundary hashes維持不變；本輪沒有使用 3000 進行寫入，沒有 migration、activation、deploy、commit 或 release。
