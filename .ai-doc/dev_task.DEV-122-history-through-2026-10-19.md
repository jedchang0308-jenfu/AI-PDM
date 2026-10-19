## DEV-122 CURRENT（正式R10；B52搜尋網址修復通過，審核跳轉P1仍開）

B44 ACTUAL_SELF_PERMISSION_READ／SOURCE_RECONCILIATION：正常授權帳號登入後，正式self GET 200，辨識review／run與workspace.view均true；本人Principal／員工／Firebase identity／公司一致，既有A0061 review GET 200但沒有session。這只證目前新登入的讀取決策，不證原403或POST write snapshot；零recognition POST／零已完成job重排。兩站logout200＋self401，自有runtime／temp及錯誤空白分頁已清理。已無GitHub nonterminal owner，main093133b65 required CI PASS；最新main11檔完整保留、B41排除，獨立source QC P0=0／P1=0。舊owner freeze為歷史紀錄，不把它當新的人類禁令；source PR可續接。另一DEV-121 owner仍續接RD v7，FULL35含未套用085而現有program-only僅接受FULL34／prefix33，沒有source34 alias入口；本任務沒有修改gate、啟動capsule或正式infra mutation。source／owner相容性解決前不切流。[B44查證](qa/DEV-122-B44-self-permission-source-reconciliation-2026-10-12.json)。NO084／7 issues／29 groups／whole NOT_ACCEPTED與原生CAD使用者驗收保持。

B45 LOCAL_QC_PASS_REQUIRED_CI_PENDING：PR #278 的 CI38192747700 已保留實際 FAIL；DEV-012 Isolated PostgreSQL Cutover SUCCESS，Production Slice QC 在 DEV-079 contract 停下。舊檢查把所有 PDF 強制要求隱藏工具列，與已授權完整圖面翻頁／縮放需求不符。本 slice 僅更新 scripts/qc-dev-079-contract.mjs 的 PDF 分流責任，並將既有 B42／B43 聚焦測試接入 .github/workflows/ci.yml；保留 compact iframe 工具列隱藏、原檔定位／開啟、PDF evidence page 及其他 QC。無產品程式、schema、release adapter、worker 或雲端變更。驗證為修正前既有 CI FAIL、修正後 focused source QC＋既有 behavior tests＋獨立 Luna QC，再沿同一 PR 取得新 required CI。Source35／DEV-121 owner 接縫仍須核對，NO084、A0061 不重排、native CAD 使用者驗證、supplier DISABLED_DEFERRED 與 7 issues／29 groups／whole NOT_ACCEPTED 維持。 [B45 CI契約](qa/DEV-122-B45-full-pdf-ci-contract-2026-10-12.json)。本地既有8檔78 tests／0 FAIL、DEV-079 contract59／0 FAIL與changed script lint PASS；獨立Luna只讀QC P0=0／P1=0。這些不冒充新required CI或原403正式修復。五個自有PID皆native absent、登記released、tempremoved；未知Next runtime及其next-env.d.ts不動且不提交。

B47 REQUIRED_CI_PASS_PRODUCTION_PENDING：第二次PR #278 CI38194284044 已通過 B45 修正的Production slice階段，DEV-012 SUCCESS；owner/artifact階段在DEV-065 CPG-FALLBACK-002停下，原生縮圖優先PDF的舊期待與人類「同版本PDF優先」要求相反。僅修改既有DEV-065 QC：current PDF優先、沒有PDF仍保留ready native derivative排序、舊版PDF不冒用；原hash／fake generator／精確revision與其他checks保留，不改產品／adapter／schema／雲端。修正後targeted實際selector契約＋lint與獨立LunaQC，再走同一PR的新required CI。B46正常授權登入之採購GET 200/count0與兩站logout200/self401已保存，僅證空清單可讀；serving source未provider核對、hydration變體與原事故仍未證。原B46 r1及兩次CI FAIL保留，whole NOT_ACCEPTED／7 issues／29 groups、NO084、native CAD使用者驗證、supplier DISABLED_DEFERRED及A0061不重排保持。 [B47 CI契約](qa/DEV-122-B47-pdf-priority-ci-contract-2026-10-12.json)／[B46正式只讀](qa/DEV-122-B46-procurement-production-read-2026-10-12.json)。本地實際selector契約33／0 FAIL、changed script lint PASS；獨立Luna只讀QC P0=0／P1=0，未重跑測試。四個自有PID皆native absent、登記released、tempremoved且無port；未知Next runtime及next-env.d.ts保持且不提交。B47 source66d3ab4之CI38195819316兩required checks均SUCCESS；B48 source6b0f90f92之CI38198072885亦SUCCESS；B50新executor仍待fresh CI，不冒充正式修復。

B48 TARGETED_NATIVE_QA_AND_REQUIRED_CI_PASS_PRODUCTION_PENDING：I-01原測試均同一提交者，null/no filter與明確owner filter不可區別；只補既有native test的不同合法reviewer Released歷史列，不把submitted_by欄位改NULL。實際own PG十案10 PASS／0 FAIL，未篩提交者包含、owner排除、reviewer exact singleton且normal signed GET完成hydration；missing/company_drift各在ID query後真實變更並完成detail query，再回safe500。未seed前505 FK零violation、masters0／roots0／residue0；test blob與before/after source binding一致，lint0、獨立Luna只讀QC P0=0／P1=0。142其他案SKIP、raw PARTIAL_NOT_ACCEPTED／runner1與launcher CHECKS_FAILED／1保留，不改為整體PASS。自有PG／children／controller均native absent及released，ports56835／56836 released、所有own temp移除，primary absence before/after一致；未知Next runtime不動，next-env僅drift fingerprint、不作此procurement執行輸入且不提交。B47 source66d3ab4之CI38195819316兩required checks SUCCESS，B48新blob source6b0f90f92之CI38198072885兩required checks均SUCCESS；source35／program-only34與DEV-121 owner接縫仍待解，未merge/main／deploy。正式B46僅空清單可讀，原採購事故／Jed403根因及非空正式hydration仍未證；NO084、A0061不重排、native CAD使用者驗收、supplier DISABLED_DEFERRED、7 issues／29 groups／whole NOT_ACCEPTED保持。 [B48 native證據](qa/DEV-122-B48-procurement-null-filter-native-2026-10-12.json)。

B49 CURRENT_NATIVE_LIFECYCLE_ASSERTIONS_PASS_UI_PENDING：current source6b0f90f92以現有隔離native runner跑原D03/D04 lifecycle，64 PASS／0 FAIL、88其他SKIP；實際首次發行、major/minor、漂移、rollback／replay證據已保存，local v7 catalog與versioned issuer/grants fixture不冒充producer。raw PARTIAL_NOT_ACCEPTED／runner1、launcher CHECKS_FAILED／1保留；未為本次改產品／test或重跑lint/build。505 FK baseline通過、source before/after一致、primary八項ABSENT不變；own PG／children／controller native absent＋released、ports51389／51390與own temp已清理，獨立Luna actual evidence QC P0=0／P1=0。B48精確source6b之CI38198072885兩required checks SUCCESS；不等於正式發布或原Jed403根因。UI尚缺Part首次發行與同run native readback／reload連結，Drawing transfer readiness另補純讀native斷言；維持7 issues／29 groups／whole NOT_ACCEPTED、NO084與其餘界線。 [B49 native證據](qa/DEV-122-B49-current-native-lifecycle-2026-10-12.json)。

B50 LOCAL_SELECTED_UI_NATIVE_ASSERTIONS_PASS_QC_OPEN：既有兩個executor補原契約證據，產品／schema／catalog／grants／release／依賴／雲端零改動。native selector 8 PASS／0 FAIL、144其他SKIP；正常Drawing intake/item API與真實PG readonly readiness證minor Draft拒絕、major Released可用，own snapshot不變。1440／390兩個既有UI case均完成Part普通Draft→首次發行→退回修改／fresh重送→不同Principal核准→native Released／一snapshot／terminal／work消失→owner reload；Drawing minor／major與Released後續兩輪return／fresh approval／native pointer皆通過，外框overflow檢查通過。raw PARTIAL_NOT_ACCEPTED／runner1／launcher CHECKS_FAILED1及UI prerequisite 1 PASS／151 SKIP均保留。原native r1 fixture400與UI r1審核跳轉timeout不改寫；test-only有界click/history診斷後r2未復現，未改產品／click／逾時或加等待／重試。獨立Luna新source/evidence P0=0／P1=0，但r1審核跳轉P1=1仍OPEN_CAUSE_UNKNOWN，不宣稱修復或整體QC通過。own PID／port／temp／lease已清理，primary absence與source before/after一致，unknown Next及next-env保持且不提交。HTTP readiness GET/auth wiring、producer與production未證；原Jed403 UNKNOWN、FULL35/v7與program-only FULL34/prefix33接縫未解，新executor同PR fresh CI pending。NO084、A0061不重排、supplier停用、native CAD使用者正式驗收、7 issues／29 groups／whole NOT_ACCEPTED不變。 [B50本地證據](qa/DEV-122-B50-lifecycle-ui-native-2026-10-12.json)。


B51 LOCAL_SELECTED_DRAWING_OWNER_RELOAD_ASSERTIONS_PASS_QC_OPEN：只補既有browser executor原D04 owner讀回，產品／schema／catalog／release／雲端未改；1440／390兩個原case正常owner首頁→圖號工作台→量產列明細→reload均GET200，DOM量產版2、rowVersion3、兩個正式檔案binding／source asset／contextId對應同run單一native current revision，master Released。各owner唯讀區間165表snapshot相同且實際API method觀察零mutation；整體lifecycle fixture有預期寫入，不能宣稱全run資料未變。UI prerequisite 1 PASS／0 FAIL／151 SKIP，raw PARTIAL_NOT_ACCEPTED／runner1／launcher CHECKS_FAILED1保留；browser lint0、獨立Luna新source/evidence P0=0／P1=0，原B50 r1跳轉P1=1仍OPEN_CAUSE_UNKNOWN。自有PID／ports60040,60041,52364／temp／lease清理確認，primary八路徑ABSENT及source不變，unknown Next／next-env不動且排除提交。preview仍queued，未證CAD輸出或預覽ready；桌面reload搜尋空白但detail正確，source機制與觀察相符，實際timing及原跳轉根因未證。B50精確sourcea69之CI38202825584兩required checks SUCCESS；B51待same PR fresh CI。FULL35/v7與program-only34/prefix33接縫未解、原Jed403 UNKNOWN、producer／production未證；NO084、A0061不重排、supplier停用、native CAD使用者正式驗收、7 issues／29 groups／whole NOT_ACCEPTED維持。 [B51本地證據](qa/DEV-122-B51-drawing-owner-reload-2026-10-12.json)。

B51 RD_IMPLEMENTATION_READY：原D04最後Drawing核准後owner reload缺口；只在既有lifecycle兩viewport/case補正常owner首頁→圖號工作台→搜尋→量產列明細→reload與實際GET200／native readback。正式Drawing列只有進版等操作，不能假設有無work的編輯workspace；本驗證讀取既有工作台明細，不建立新work、不改產品。exact rowKey／drawing identity／revision code／rowVersion、正式檔案binding/contextId須對應同run單一current production revision，DOM量產版標籤與native master Released相符；前後165表snapshot一致、期間零業務mutation request。沿既有signed v7 fixture、測量有界copy／即時capacity lease、exact PID／port／isolateddata與cleanup，unknown Next及next-env不動。只修改既有browser executor，不新增case／29分母，不重跑未改native64/8或產品checks；同UI runner的native prerequisite保留raw PARTIAL與exit1。原B50 r1跳轉P1仍OPEN_CAUSE_UNKNOWN；新一次通過不宣稱修復。source35/v7接縫、原Jed403、producer／production仍待證；NO084、A0061不重排、supplier停用、native CAD使用者正式驗收與whole NOT_ACCEPTED維持。


B52 LOCAL_SELECTED_FILTER_LOCATION_ASSERTIONS_PASS_QC_OPEN：修正首次restore吞搜尋網址及edit/review離頁前未flush目前filter；真正變更才清restored cursor，selectDetail／導航先同步，popstate清舊timer，同值Apply保留deep-link頁次。未改產品meaningful RED14 PASS／3 FAIL，修後focused17 PASS（原poll12＋location5）、產品／unit lint與typecheck0；cursor／Back只證hook-layer。既有lifecycle與full兩個flow各1440／390兩原case均實際PASS，不增加原29 groups；lifecycle query／detail／returnTo／reload保留且Drawing current revision／files正常owner讀回、各165表唯讀區間snapshot相同／mutation0。full綁current來源驗正常建號201、matrix savedB→A／reload與實際401保存恢復、審核返回、正常附件及expected terminal error gallery／下載／兩quiet periods。兩UI prerequisite各1 PASS／151 SKIP，raw PARTIAL／runner1／launcher1保留；full派生summary誤用200判建檔失敗，原紀錄保留並另存201分類更正，沒有重跑或改原結果。current browser41c兩次ESLint API零error；獨立Luna新P0=0／P1=0，原B50跳轉P1=1仍OPEN_CAUSE_UNKNOWN，未以本修復結案。自有PID／六ports／temp／lease均清理，source前後一致、primary八路徑ABSENT，unknown Next／next-env保持且不提交。preview queued與terminal failure fixture不證CAD/PDF成功；B51精確38之CI38205114973兩required checks SUCCESS，B52待fresh CI。原Jed403 UNKNOWN、producer／production未證、FULL35/v7與program-only34/prefix33接縫未解；NO084／A0061不重排／supplier停用／native CAD使用者正式驗收／7 issues29 groups／whole NOT_ACCEPTED維持。 [B52本地證據](qa/DEV-122-B52-filter-location-local-2026-10-12.json)。

B52 RD_IMPLEMENTATION_READY（局部URL狀態修復／QA定案）：B51 desktop owner reload搜尋空白、detail正確；source restore非null page ref的首次debounce跳過query URL，edit/review取消timer亦未flush目前filter。Root唯一writer，僅canonical-pdm-workbench.tsx、既有preview-poll component test與browser executor；既有3份CURRENT同步。restore/popstate先取消舊filter timer並清dirty；使用者真正query／多選filter／material／color／sort變更清restored cursor並dirty，同值多選Apply以既有序列化比較不重設cursor。dirty才沿原replaceLocation同步filters/page0，不傳detail/historyRevision/layout；selectDetail與edit/review先同步，再沿原historyMode／safe returnTo／router.push。layout/pagination不改，debounce仍load，未改filter的deep-link cursor/direction/page照原復原。先於未改產品跑hook-unit紅燈，修復後focused unit＋lint＋typecheck；既有full flow兩viewport補輸入前passive history/timestamp、query/detail/returnTo/reload斷言，並將已失效的正常UI建號／matrix saved-A／terminal gallery整合證據綁current source。UI fixture無真實nextCursor，cursor/popstate僅focused hook-layer，不冒充mounted pagination。FMEA：首次restore吞query、導航前dirty未flush、同值Apply丟cursor、Back被舊timer覆寫；各有明確負向及回歸斷言。保留visible-error／data sanity、exact isolateddata/PID/ports/temp/capacitylease cleanup。B50 r1跳轉P1仍OPEN_CAUSE_UNKNOWN，未聲稱此修法建立原事故根因；原Jed403 UNKNOWN、source35/v7接縫與正式驗收仍未解，NO084／A0061不重排／supplier停用／CAD使用者驗收／7 issues29 groups／whole NOT_ACCEPTED維持。

B50沿原lifecycle UI case補Part first_release→native readback→owner reload與Drawing readonly技轉readiness，不增加原分母；施工與未驗收界線見[原DEV-122契約](specs/DEV-122-ai-pdm-internal-function-issues.md)。

B43 LOCAL_DIAGNOSTIC_QC_PASS_PENDING_OFFICIAL_RELEASE：review GET／run POST403 文案與封閉診斷已修正；38/38 unit、typecheck／lint／隔離build及1個真實native v4 fixture案例PASS，管理員雙次run檢查create一次，3負例403／零queue。Jed正式effective grant／根因與mounted UI仍未證，不宣稱正式問題修復。原r1 fixture FAIL、r2 launcher registration FAIL及恢復讀回、raw PARTIAL_NOT_ACCEPTED保留；所有自有runtime／UI／assets已清理。既有owner freeze／NO084／7 issues／29 groups／whole NOT_ACCEPTED保持。[B43本地證據](qa/DEV-122-B43-recognition-denial-local-checkpoint-2026-10-12.json)。

B42 LOCAL_QC_PASS_PENDING_OFFICIAL_RELEASE：同版本 PDF 自動優先、完整 PDF.js 換頁／縮放／符合寬度、多檔歧義一次選擇與逾時清理已實作。6 個聚焦檔案 59／59、型別／lint／隔離建置通過；1 個 native fixture 與 1440／390 兩個實際瀏覽器案例通過，Root 查看授權 PDF 的全頁 canvas、尺寸與中文註記可讀。獨立 Luna QC P0=0／P1=0／P2=0，自有程序／ports／暫存／generated assets 已清理，兩 root primary SQLite／sidecars 仍 ABSENT。[B42 本地證據](qa/DEV-122-B42-full-pdf-local-checkpoint-2026-10-12.json)。兩頁 protocol PDF 只證操作，CAD 同版配對 NOT_PROVEN；F-01F 仍由使用者正式驗證。B41 WIP db22018d 不納入，原 FAIL／29 groups／whole NOT_ACCEPTED／NO084 不變。既有 DEV-121 正式 owner freeze 期間僅本地提交，不 push/main merge/prod mutation；管理員辨識拒絕另由 B43 繼續查證。

B38 的固定13個既有原生協定案例已補驗13/13 PASS，包含actual202 headers、claim／content負例及protocol PNG；TypeScript與獨立Luna QC通過。首輪12 PASS／1 FAIL為前例合法queued job污染，保留FAIL，僅在原route回條後精確清理本機fixture；另移除runner既有重複085，未改SQL且NO084。正式使用者回報預覽無法顯示並已重現；設定頁顯示原生2D worker未在線、金鑰尚未啟用，輔助屬性可見但尚未由人類比對。B39以vendored格式的有界診斷抽取，8個授權CAD原檔共讀出14張640×480儲存PNG，CRC／實際解碼與原檔前後SHA通過，已查看D-0007兩圖面及零件縮圖；這是offline相容性，compiled OpenSWX／產品接線／部署均NOT_RUN，不冒充完整CAD渲染或清晰尺寸驗收。runtime／ports／temp／primary absence及Governor清理讀回確認。[B38補驗與正式失敗](qa/DEV-122-B38-native-preview-protocol-and-user-feedback-2026-10-11.json)。

B40新增限定QA selector，重用既有1個native UI fixture案例；4次fixture均1 PASS，瀏覽器均FAIL且完成案例0。已透過正常mounted上傳46-byte protocol檔取得1440×900新pending畫面與spinner；R4保存6次background starts與max in-flight1，但hidden前提逾時，不能推定30次上限、hidden/visible、reload、layout/unmount或390窄版通過。移除Playwright預設forced-focus後仍逾時，唯一原因未知；同類重試已停止。四次FAIL與source hash保留，獨立Luna QC確認屬FAIL／部分觀察，未誤計PASS，fresh讀回確認自有PID／ports／temp已清理、8個primarySQLite／sidecar路徑仍ABSENT。僅本地QA候選，產品／Cloud Run／正式來源未變更，原生CAD與whole仍NOT_ACCEPTED。

本任務最新發布為官方來源 `0d0235d348bf129ef7207c1dfa04f55d18f82567`（PR #269）的 R10 owner [38125246874](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/38125246874)。十階段 SUCCESS；2026-10-11 09:11Z provider 讀回 `ai-pdm-prod-1be8986b68ce` 100%、零 tags、FINALIZED／RELEASED。資料庫 applied0／replayed33／ledger33、NO084；worker generation17 READY、Scheduler ENABLED且資源未修改。本次限定 IAM 計畫0 create／12 no-op，Terraform apply／readback已執行，不將可能的state writes稱為全程唯讀。[R10 發布讀回](qa/DEV-122-B36-R10-production-release-closure-2026-10-11.json)。

B36 原 F01C／D05／UI01 的有限輪詢修復已發布：每個 foreground episode 最多30次 background list GET starts，保留單一timer／generation、hidden pause與停止提示。兩個唯一測試檔25 PASS及required PR／main CI PASS；R9兩個正常原檔下載的provider200／大小／SHA證據沿用未改責任面。正式Jed清單reload顯示50 rows；既有正式profile未啟用gallery，因此不聲稱正式gallery或動畫已驗收。

B37 僅新增隔離CUA handoff及fixture，不改產品或雲端。實際桌面／窄版、鍵盤、延遲／失敗卡片、旋轉動畫、layout退出及停止提示已有部分證據；R3 reload後提示清除且server GET completions由31增至38。這些logs只記完成、狀態與耗時，browser start／concurrency未觀察。queued輸入超過30秒會投影為delayed，fixture名稱pending不代表畫面已驗證pending。R1 SQL失敗、R2 deadline失敗與部分下載保留；R3／R4固定finish已接受但wrapper仍PARTIAL_NOT_ACCEPTED，四次自有runtime／ports／temp／primary absence與lease清理均確認。[B37 部分補驗](qa/DEV-122-B37-mounted-preview-cua-checkpoint-2026-10-11.json)；接續來源的獨立靜態 QC 未發現 P0／P1，[來源審查原文](qa/DEV-122-B37-cua-handoff-source-qc-2026-10-11.json)。

下一步收斂仍缺的原契約正常UI／API／native變體；不因test/docs SHA變更重跑未改產品證據或重新部署。Whole DEV NOT_ACCEPTED、7 issues／29 groups維持；F-01F完整原生CAD由使用者正式驗證、supplier DISABLED_DEFERRED、NO084、A0061已完成工作不重排。唯一施工規則讀[DEV-122契約](specs/DEV-122-ai-pdm-internal-function-issues.md)。R9／R8／R6與原FAIL／UNKNOWN保留為歷史來源。

## DEV-122 HISTORY_ONLY（R6 發布前中止；R7 執行回讀修正 LOCAL_QC_PASS；NOT_DEPLOYED）

PR [#264](https://github.com/jedchang0308-jenfu/AI-PDM/pull/264) 已合併至 94173727eb8f963809e892b475874220d4072b7f，PR／main required CI 與 provider branch-protection readback PASS。R6 protected owner [38076494472](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/38076494472) prepare／build SUCCESS；migrate 對 Cloud Run Execution 回傳省略的兩個 Cloud SQL mount 欄位誤判而停止，candidate／traffic SKIPPED。實際唯一 native execution 已完成只讀 PASS：applied0／replayed33／ledger33，沒有084；此 native 收據沒有 PostgreSQL 版本欄位。原 terminal 的 UNKNOWN／currentDatabaseReadPerformed=false 保持原樣，沒有 migrate association，不將後續觀察回填成原發布成功，也不重送 R6 capsule。Provider 回讀確認 B33 舊服務100%／零tag、worker generation17 READY與Scheduler ENABLED維持。

R7 僅修三個 release libraries及三個定向測試：Execution 同時省略 volumes與volumeMounts時，必須由 exact static Job 補足；部分省略、null／空陣列／錯值仍拒絕。Migration read token只借給固定Job、exact Execution及有界inventory GET，拒絕後不fallback。新增封閉的completed-unassociated-abort唯讀接續，驗原封存UNKNOWN、唯一完成execution、兩次完整穩定inventory、同Run provider時間、retained service/control與普通RELEASED33 anchor；只允許最多一個authentic preexecution ancestor，不擴張發布或資料權限。

Focused6／continuous259／aggregate、abort6／DB21／typecheck／isolated build PASS；artifact、primary invariant與native cleanup已核對。獨立Luna source QC P0=0／P1=0。實際R6→R4→B33 memory-only GET cold/warm／verifyProvider=true預檢1170 GET PASS／0writes，綁定clock修正前SHA，不能冒稱目前R7的provider驗證；R4負例只屬STATIC_GUARD_QC，inherited portable fixture與新kind producer→prepare端到端未建立。TL接受targeted QA，fresh exact official owner preflight仍必須，未使用合成證據代替。

CURRENT_CONTRACT=DEV122_PROGRAM_ONLY_RELEASE_V1。新normal PR／required main CI／fresh official source與R7 owner release尚pending；FULL34／effective33／fresh readonly33、NO084、worker READY／Scheduler ENABLED及既有回復機制保持。不新增IAM／Secret／cloud resource權限。Root唯一產品writer與cleanup owner；同repo既有worktree，canonical及其他任務不動。Whole DEV NOT_ACCEPTED／7 issues／29 groups；supplier DISABLED_DEFERRED，完整原生CAD正式驗證由使用者執行。

[執行回讀修正 checkpoint](qa/DEV-122-B35-execution-recovery-checkpoint-2026-10-11.json)。

## DEV-122 HISTORY_ONLY（B35 限定 IAM APPLIED；R5 唯讀接線 LOCAL_QC_PASS；NOT_DEPLOYED）

PR [#263](https://github.com/jedchang0308-jenfu/AI-PDM/pull/263) 已正常合併為 bc7bf2a4b29b5758fbd866c7e143632c388ed579；PR CI38069358388／main CI38069771172 required checks SUCCESS，official-source／branch protection provider readback PASS。先前五項 metadata IAM APPLIED／provider readback PASS、既有 migration Job image generation22 還原 readback PASS 保持有效。新 R5 只執行 baseline GET，未 source-freeze／plan／apply／dispatch／build／Job run／SQL／candidate／traffic，runtime／temp cleanup PASS。

R5 實際失敗為 program-only proof transport 把 nested paused worker history 的 terminal receipt 當成 current migration bundle；來源 corrective contract 採 closed raw receipt／binary readBytes（own prefix／hash／generation／CRC／same-root memo）、內部 authenticated nested source/provider proof closure（沿用原 factory primary／secondary、forward readSource）、now及四個純 recorded service/revision validators。沒有 general request、live service/revision、control/source prefix transport、CLI/capsule identity或新權限。遞迴也保留同一 closure；depth8／cycle／hash-conflict／admission／期限不放寬。

歷史 IAM 僅放行既有四個 READBACK_IAM_PATHS 加 WORKER_PROFILE_PATH 的固定五檔，不將該 revision 加入一般 sourceAdmissions；profile／plan／descriptor／build／request hashes仍逐項驗證。JSON 規則保持，raw readBytes 只額外接受 own worker prefix 下平坦的 *-plan.tfplan，caller 必驗 request-derived exact URI／binary hash，generation／CRC／same-root memo不變。Source QC 原 P1（二進位檔套 JSON suffix）保留；修正後 Luna 增量 QC P0=0／P1=0。實際 memory-only GET diagnostic R5 已驗 genuine R4 abort→B33 RELEASED／nested paused worker history及 BUILD_IMAGE_VERIFIED：440 GET、含12次歷史 binary plan GET，沒有 cloud writes／SQL／Job run／原始回應或 request headers保存，runtime／temp cleanup PASS；此 dirty-source 診斷不作發布權限。R2 source admission與R4 suffix失敗保留。新 portable P06A+B22 fixture兩次2/3 FAIL照實保留：simple READY graph沒有進入 nested PAUSED supplemental IAM／binary branch，未以弱化 assertions冒稱 PASS；僅回復本次 test edits。TL 接受 targeted QA 採同 exact R4abort／B33 immutable歷史鏈的 actual GET RED→GREEN＋TL／Luna source QC＋既有 mandatory checks，portable legacy/binary regression NOT_ESTABLISHED；fresh exact official owner preflight仍必須。Local19／continuous253／aggregate303、abort6／DB21／typecheck／isolated build PASS（artifact／primary database-absent invariant／cleanup PASS），native CIM9個自有PID皆不存在、無port。Source QC TL／Luna P0=0／P1=0；LOCAL_QC_PASS。新 normal PR／required main CI與 fresh official preflight／owner release仍 pending；舊 R4 terminal capsule及 saved apply binary不重播。

CURRENT_CONTRACT=DEV122_PROGRAM_ONLY_RELEASE_V1。只更新程式，FULL34／effective33／fresh native PG17 readonly33／NO084／worker READY／Scheduler ENABLED及原回復機制保持；不新增 IAM／Secret／資源或正式資料清理。Root唯一writer／cleanup owner，同repo既有 worktree；canonical與其他任務不動。Whole DEV NOT_ACCEPTED／7 issues／29 groups；supplier DISABLED_DEFERRED；完整原生CAD正式驗證由使用者執行。

[唯讀證據接線 checkpoint](qa/DEV-122-B35-observation-transport-checkpoint-2026-10-11.json)。

## DEV-122 HISTORY_ONLY（B35 限定 IAM APPLIED；發布前中止接續修正中；NOT_DEPLOYED）

PR [#262](https://github.com/jedchang0308-jenfu/AI-PDM/pull/262) 正常合併至 66911937e2a17c7348bdcefbec84f3a4b987a949，PR／main required CI SUCCESS。已核准的 1 個 metadata-only role＋4 個 Secret-level bindings 已實際 APPLIED，完整 provider readback PASS；没有新 payload access。Protected owner [38063373523](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/38063373523) prepare／build SUCCESS，migrate 在提交 Job 前因既有 runner image 與封存基線不同而停止。R4 FINALIZED／PRE_ACTIVATION_ABORTED、NOT_APPLIED／currentDatabaseReadPerformed=false；native PG17 NOT_RUN，candidate／traffic SKIPPED。不得重播 terminal capsule 或 saved apply binary。

同一 AI-PDM 正式發布 corrective cycle 已僅還原既有 migration Job 的 image 至已驗 B33 runner；generation21→22，其餘 writable fields／50 筆執行紀錄／Job IAM／service／control／worker／metadata IAM 保持。單次 PATCH 後 guard GET 連線中斷，原始 UNKNOWN 保留；專用 readonly recovery 驗 sealed request／plan／全部 guards，RESTORED_READBACK_ONLY／cleanup PASS，沒有第二次 PATCH、Job run、SQL、IAM、service／traffic／worker 寫入。

最新窄 source 契約為 Architecture Finalized／TL PASS：只對已建置但尚未提交 DB 工作的 program-only 中止加入同 kind PROGRAM_ONLY_ABORT 接續。須 authentic build_only／FULL34／effective33、所有 migrate/native/submission/provider/downstream 收據 positive MISSING、兩次完整相同 inventory／零 matching／所有舊 execution 嚴格早於 sourceLock 下界、direct genuine RELEASED33 prefix／runner joins、舊 service 100%／零 tags與完整 control。NOT_APPLIED／false 照實，不冒稱當前 DB 已驗；UNKNOWN 或部分執行拒絕，新 capsule仍須 fresh native PG17 readonly33。已完成唯讀的既有 branch 保留。

Root 於同 repo worktree 為唯一產品 writer；窄 source 獨立 QC P0=0／P1=0，focused9／continuous250／aggregate300／abort6／DB21／typecheck／isolated build PASS，artifact／primary invariant／cleanup 已核對。R1 focused8/9 的唯一 fixture 未來時間錯誤保留，產品 future guard 保留；新增 true producer→prepare/replay 接線測試3/3 PASS及獨立 Luna增量QC P0=0／P1=0；LOCAL_TEST consumer seam明訂CUTOVER_OMITTED，不冒稱R78或正式prepare全鏈驗證，原profile及production CLI guards保持。Consumer R1缺mode、R2缺無關cutover圖的0/3失敗保留，兩者僅修fixture／限定測試範圍；未新合併或發布。084 禁止執行、不清理正式資料；supplier DISABLED_DEFERRED，完整原生 CAD 正式驗證由使用者執行，Whole DEV NOT_ACCEPTED／7 issues／29 groups不變。

[恢復與接續契約 checkpoint](qa/DEV-122-B35-preexecution-recovery-checkpoint-2026-10-11.json)。

## DEV-122 HISTORY_ONLY（B35 原生 etag 修正 LOCAL_QC_PASS；NOT_APPLIED／NOT_DEPLOYED）

PR [#260](https://github.com/jedchang0308-jenfu/AI-PDM/pull/260) 已合併至 af72165c962c0eaa609929df8291a48ffa7cc494；PR CI38058554315／main CI38059082047 required checks SUCCESS。B35-R2 在歷史來源 admission 失敗；R3 修正 admission 後 native Terraform init／validate／plan／show 成功，但新 gate 拒絕兩筆 etag-only resource_drift。原生計畫為舊7 no-op／新5 create，沒有 apply；失敗與診斷原始證據保留，task-owned runtime／temp／lease 已釋放。

最新 source 修正僅容許兩個既有 Scheduler IAM member 的 etag metadata refresh：before／after 移除 etag 後完整相同，且 drift.after == matching no-op before == matching no-op after；地址各最多一次，拒絕其他 drift／unknown／import／move／duplicate。原 5／7 項 validator、完整 project／Secret policy、saved binary、單次 apply 與 unknown outcome readback 保護不變；新權限範圍仍只有已核准五項。

本次定向11、continuous246、aggregate296、abort6、DB21、typecheck與isolated build均PASS；獨立Luna source QC P0=0／P1=0。此證據是本地 source及native-plan診斷，不是IAM APPLIED或fresh WIF PASS。此修正仍須新protected PR／required CI／fresh source-lock／saved plan／provider readback與owner發布；舊R2／R3 input及失敗capsule不重播。

CURRENT_CONTRACT=DEV122_PROGRAM_ONLY_RELEASE_V1；Architecture Finalized／RD Implementation Ready。NO084、FULL34／effective33／native PG17只讀、worker READY／Scheduler ENABLED及原發布回復機制不變。DEV-122仍NOT_ACCEPTED、7 issues／29 groups；完整原生CAD正式驗證由使用者執行，supplier DISABLED_DEFERRED。Root唯一writer與cleanup owner，沿用同repo工作樹，canonical及其他任務不動。

[唯一施工契約](specs/DEV-122-ai-pdm-internal-function-issues.md)；[原生etag修正checkpoint](qa/DEV-122-B35-native-etag-checkpoint-2026-10-10.json)。

## DEV-122 HISTORY_ONLY（B35 限定 metadata IAM 已核准；R2 接線 QC PASS；NOT_APPLIED／NOT_DEPLOYED）

PR260 新 CI38057619292 的 continuous 245/246 FAIL：新增 B35 Git fixture 使用 RUNNER~1 短 TEMP，嚴格 repository-root comparison 正確拒絕。只修正此測試的 native realpath parent／fixture 與 cleanup guard，產品／Terraform／權限 guard 不變；實際短 TEMP 原 test body RED→修正 GREEN及獨立 Luna test-hunk QC PASS見 [CI fixture checkpoint](qa/DEV-122-B35-ci-native-temp-fixture-2026-10-10.json)。兩次 local setup FAIL 原始證據保留，僅第三次採納為 RED/GREEN；先前六項 PASS 保留原 tested-input scope，新 CI 尚 pending，不冒稱 current CI PASS。

限定 metadata IAM 實作及 consumer 接線已完成本地驗證：9 個定向案例、4 個 producer/resolver/Git 整合案例、continuous 246、aggregate 294、abort 6、DB boundary 21、typecheck 與 isolated build 均 PASS；建置確認 artifact／primary invariant／cleanup，原生回讀確認本次 PID 與三個任務暫存已消失。獨立 Luna source QC P0=0／P1=0，13/13 frozen hashes 相符；僅證本地 source/modelled/native-Git 層，single normal-actor finite writer，不宣稱 concurrent apply、實際 IAM APPLIED 或 WIF capability PASS。詳見 [補權本地 QC checkpoint](qa/DEV-122-B35-secret-version-iam-local-qc-2026-10-10.json)。PR260 將以修正後來源重新取得 required CI；實際 plan/apply/fresh owner release 仍 NOT_RUN，NO084／NOT_ACCEPTED／7/29 不變。

人類已回覆「核准 5 項限定補權並繼續（建議）」；最新授權允許 AI-PDM 在 jenfu-platform-prod 正式環境新增 1 個唯讀角色與 4 個 exact Secret-level 綁定。角色只含 secretmanager.versions.get；兩個既有 Secret 各綁既有 Verifier／Deployer，不新增 payload access、Builder／runtime grant、其他 IAM 或資源。migration 084 仍禁止執行。唯一施工契約讀 [DEV-122 CURRENT](specs/DEV-122-ai-pdm-internal-function-issues.md)，[人類限定授權記錄](qa/DEV-122-B35-secret-version-iam-human-approval-2026-10-10.json)可追溯原始回答；不要求人類重複核准 source／capsule 機器綁定。

[R2 實際 caller 接線證據](qa/DEV-122-B35-numeric-routing-r2-checkpoint-2026-10-10.json)：R1 source QC 的窄範圍 PASS 保留，但 root 發現真實 assertNumericSecret 會輸出專案編號，原 transport 拒絕合法 URL，補驗 RED 4/5。R2 只允許相同專案的文字 ID／編號形式，真實 helper 到 transport 的 focused 5/5、continuous 242、aggregate 281 及六項 required checks PASS，獨立 Luna QC P0=0／P1=0。這是本地 source/mock 證據，未證實實際 WIF 權限；PR260 舊 head 8a937 的 CI PASS 不能替代 R2 source CI。

限定補權施工：新 TF 檔保留舊四份來源及 prebuild TF bytes；計畫須恰 12 addresses，舊 7 全 no-op，新 5 create／no-op。正常發布帳號依 official source-lock、原 supplemental／prebuild refs、人類授權、saved binary 與 request／before-after 進行一次 apply，unknown outcome 先 readback，不重套舊計畫。fresh READY producer 僅在新 immutable continuation 驗證後接受核准的 metadata row；Secret policy version 3、剝除 exact 差異後其他政策與 project IAM 保持相同。實際 plan／apply／fresh owner release 尚 NOT_RUN。

B33 正式基線 ai-pdm-prod-b96191914c5d 100%／零 tags、worker READY／Scheduler ENABLED；原 B35 owner prepare FAIL 與 terminal capsule 保留，禁止重 dispatch。DEV-122 維持 NOT_ACCEPTED、7 issues／29 groups；原生 CAD 完整屬性由使用者正式驗證，supplier DISABLED_DEFERRED。唯一產品 writer 及 cleanup owner 為 root／當次明確交棒 RD，沿用既有同 repo worktree，canonical／其他 task 不動。

## DEV-122 HISTORY_ONLY（B35 PREPARE_FAILED／接線修復LOCAL_QC_PASS；NOT_DEPLOYED）

人類已選擇「同意，只更新程式（建議）」；固定 `DEV122_PROGRAM_ONLY_RELEASE_V1`已合併，最新checkpoint為 `SOURCE_MERGED / REQUIRED_CI_PASS / PRODUCTION_PREPARE_FAILED / LOCAL_ROUTING_FIX_QC_PASS / METADATA_PERMISSION_DECISION_PENDING / NOT_DEPLOYED`。唯一契約讀[DEV-122 CURRENT](specs/DEV-122-ai-pdm-internal-function-issues.md)，固定規則讀[release spec §26.1](specs/SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md)。此入口只路由，不另定規則或擴張人類授權。

程式與固定發布規則已隨 PR [#259](https://github.com/jedchang0308-jenfu/AI-PDM/pull/259) 正常合併至 `71df57ff2ffc05a8a8cb18d1956758f360d3e138`；[PR CI38049694935](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/38049694935) 與 [main CI38050180230](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/38050180230) 兩項 required checks SUCCESS，fresh official-source／ruleset／admin enforcement 回讀 PASS。原 CI38048476227 的238/239 FAIL、8.3 alias RED／GREEN與 fixture-only 修正保留歷史範圍，不回寫原收據。

九項 normal-actor 有限準備 PASS，已建立新 immutable capsule `DEV122-PROGRAM-20261010-B35`；實際 protected owner [38051021115](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/38051021115) 在 prepare 回 `DENIED` 而 FAILURE，後續 build／migrate／candidate／traffic 等全部 SKIPPED。本輪 fresh production DB／native PG17 `NOT_RUN`，B34／B35仍 `NOT_DEPLOYED`。錯誤未記錄 exact endpoint，限定 audit 查詢0筆，原因不可宣稱已精確定位。

失敗後 provider 回讀：B33 `ai-pdm-prod-b96191914c5d` 100%／零tags，template及traffic與發布前基線相同；control仍 `FINALIZED / RELEASED / DEV122-MATRIX-20261009-B33`，worker READY／generation17、Scheduler ENABLED；本輪 prepare／build／migrate／candidate／terminal 收據 provider404。Project及兩個 exact Secret 的 direct-binding角色讀回未提供三個release SA `secretmanager.versions.get`；未完成繼承／group effective-IAM全盤查，亦不將此已確認能力缺口等同exact403 endpoint。Local QC歷史PASS保留，新增actor capability wiring `P1_OPEN`。

[實際prepare失敗／補權提案收據](qa/DEV-122-B35-program-only-prepare-failure-2026-10-10.json)已保存原始FAIL、fresh readbacks與cleanup。最小補權提案為1個metadata-only custom role＋兩個既有Secret各給Verifier／Deployer，共5項IAM；Builder透過既有Verifier observer的exact numeric metadata GET接線，不給Builder新權限。此提案 `PENDING_HUMAN / NOT_APPLIED`，超出最新不新增IAM邊界；Terraform未修改；source接線修復依既有授權已完成且focused5 PASS，六項required checks／Independent Luna source QC已PASS／P0=0／P1=0，新source仍須protected PR／CI；不重播失敗capsule。詳細exact資源及IAM各version metadata範圍讀CURRENT契約。

DEV-122維持開發點與 `NOT_ACCEPTED`，7 issues／29 groups分母不變。原生 CAD 正式驗證由使用者執行；normal UI與業務驗證仍待本輪發布後取得，supplier `DISABLED_DEFERRED`。Root保留既有task-owned login tab供後續驗證與清理責任，canonical checkout及其他owner工作樹不動。

### B35 接線修復與正式唯讀UI subset（2026-10-10）

[本輪接線／UI證據](qa/DEV-122-B35-build-readback-routing-and-ui-2026-10-10.json)記錄source-only修復及focused5、continuous242、aggregate281與六項required checks PASS；Independent Luna source QC P0=0／P1=0。集合有重疊，不相加成7／29完成率；本地modeled token/fetch stub不代表實際WIF權限PASS。自有程序、隔離build、sharp暫存與容量lease已核對清理；aggregate原snapshot保留closure前文件bytes，產品／測試SHA未變。新增IAM五項仍PENDING_HUMAN／NOT_APPLIED；084禁止執行。新source仍未合併／發布，原PR259／CI與ownerFAIL保持其歷史binding。

本輪實際正式UI：B33／Free Number DEV014，在1521×695的正常料號工作台讀取既有A0061、快速篩選、開啟既有明細、清除篩選與重新載入，已觀測儲存名稱及製造關係維持；06 settled圖／DOM為reload終態，05 loading圖只保留觀測。未證實network overlap，不代替mobile、編輯／提交／核准／附件／CAD或未部署B34/B35驗收。新task-owned tab1200846886已close並list核對，既有使用者tabs不動；舊task login surface清理義務仍由root追蹤，未宣稱已關閉。

## DEV-122 HISTORY_ONLY（B33；2026-10-09正式回讀快照）

PR #253 正常合併來源 `e2e7aaa69d7ca3600203874e0a63d288ac8a1a51`，required PR／main CI SUCCESS；owner [37948779825](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37948779825) 十階段 SUCCESS。正式 `ai-pdm-prod-b96191914c5d` 已 RELEASED／FINALIZED、100%／零 tags，映像 `sha256:64ccd0b4d44ac81d10a3ec3220bf322dec7e055b980577e01d97b262a4884bf8`。11 sealed receipts、source／build／image／serving provider join 已實際回讀；來源 package33／最高083／不含084，本次0 applied／33 replayed／ledger33。沒有新增 SQL、IAM、資源或 Secret 版本。

料號矩陣 latest active load guard 已隨本次版本發布；本地根號8／附件7／採購10／取消24共49個選定 native cases，以及桌面／手機 UI 個別case、typecheck與isolated build沿用已驗同byte來源，不重跑未改產品。正常網站上的正式料號行為仍 NORMAL_UI_VALIDATION_PENDING；candidate／canonical authentication smoke不代替業務驗收。

原核准12項方案第5步已完成：worker READY、Scheduler ENABLED，numeric token1／registry3沿用。兩次啟用因首次 stdout查詢 NOT_UNIQUE停止，後續 exact execution均有唯一empty標記；原FAIL與原始query未捕捉／原因UNKNOWN保留。新唯一R2輸入在第一次exact日誌查詢前等待15秒，原provider回應未加工，固定唯一性／window／60秒freshness／deadline檢查保留；`ai-pdm-prod-openswx-metadata-q4lq4` authenticated204，啟用回執與fresh provider回讀相符。這是空工作驗證，不是CAD屬性PASS。24個本次有限runtime的native程序／ports／自有暫存清理已核對，失敗receipt不覆寫。

完整證據見 [B33 正式發布收尾](qa/DEV-122-B33-production-release-closure-2026-10-10.json)，先前 [worker與料號本地驗證](qa/DEV-122-B32-worker-and-matrix-verification-2026-10-09.json)保留。下一步只剩各原契約的正式正常網站／業務驗收；原生CAD完整屬性由使用者正式驗證，supplier停用延期，7 issues／29 groups與whole DEV仍NOT_ACCEPTED。人類「已驗證」只確認發布登入。公司登入頁不同origin的UI讀取曾遭自動核准審查拒絕，未繞過；本次CAD Chrome分頁暫留供人類立即續驗，root保留清理責任。文件收尾不重播B33或舊capsule，不因文件更新重部署未改runtime。

## DEV-122 HISTORY_ONLY（B32 app／背景解析已啟用；料號載入修正本地通過、尚未發布的快照）

B32 正式 app `ai-pdm-prod-e9612df3e9bc`／來源 `74116271d3917a21f11d8a2c785635f84a2b7705` 已 RELEASED／FINALIZED、100%／零 tags。依人類原核准12項資源方案第5步，未修改來源的固定 CLI 完成一次 finite empty claim（`ai-pdm-prod-openswx-metadata-rkm58`，authenticated204）；背景 worker READY、Scheduler ENABLED。實際 provider 回讀與獨立 Luna QC PASS；當次28 executions／0 active僅為該時快照，不代替 CAD 結果。保留原 B32 發布收尾與啟用前快照。

現行隔離 native 根號8／附件權限7／採購10／取消24，共49個選定案例通過。正常 UI 桌面1440×900與手機390×844各自case PASS；桌面整體FAIL保留後續手機登入定位逾時，手機單獨重跑為PARTIAL_NOT_ACCEPTED，兩次不是整體29組驗收。實際本地流程發現舊載入覆蓋輸入；唯一產品修正為料號矩陣 latest active load guard，已通過上述操作、型別與隔離建置，尚未合併／發布。另四個 test-only檔刷新LF-only來源pin、精確SQL fixture、既有081／082＋v6先決條件、ALLOW容量枚舉與正常UI定位；migration SQL bytes／依賴／workflow無更動。原失敗、非byte-identical runner與pending save限制保留。

完整綁定與證據見 [worker與料號驗證](qa/DEV-122-B32-worker-and-matrix-verification-2026-10-09.json)。下一步限定修正的 protected PR／required CI／fresh official-source app release，不重播B32 capsule。7 issues／29 groups仍NOT_ACCEPTED；原生CAD完整屬性由人類正式驗證，supplier停用延期。人類「已驗證」僅確認發布登入；正式CAD正常網站操作仍等待登入與限定SSO授權。自動核准審查拒絕不同origin的公司登入頁讀取，root未繞過；本次CAD Chrome分頁暫留等待人類，root持有清理責任。

## DEV-122 HISTORY_ONLY（B32 app 初次發布後、worker啟用前的快照）

PR #251 已正常合併至官方 main `74116271d3917a21f11d8a2c785635f84a2b7705`，required PR／main CI PASS；本地 targeted 221／221、authentic ROOT 8／8、continuous 175／175及六項 required checks PASS，獨立 Luna source QC PASS。Owner [37893968135](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37893968135) 十階段 SUCCESS；11 sealed receipts 與實際 GET-only provider 回讀已核對，app `RELEASED`／control `FINALIZED`。

正式 `ai-pdm-prod-e9612df3e9bc` 接收 100% 流量、零候選 tags，映像 `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm@sha256:5a1327afceba597bdb140c4b37eafe0f8ee496d5bfc8d45d3916dfbc7d6d6174`；candidate／canonical 登入與拒絕存取 smoke PASS。Cloud Build `69786f5d-7838-438c-9dd1-d2df98e82d59` SUCCESS，source identity 與 app／worker 壓縮 archive 分別驗證，解壓內容精確相符於官方 Git archive。Migration package33／最高083／不含084，本次0 applied／33 replayed／ledger33，execution `ai-pdm-prod-migration-runner-pj6h7`；unchanged083 未重複套用。

結果與可回查綁定見 [B32 正式發布收尾](qa/DEV-122-B32-production-release-closure-2026-10-09.json)；[實際 final provider 回讀](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A24-B32/release/B32-final-r6-provider-readback.json>) SHA `2d2acac27a56f4694bd9999055dfd5c238b2568d641c1ba7d485de34991c2dbc`，觀測 `2026-10-09T07:20:39.149162+00:00`。Root 已以 native CIM 確認本次 collector／SDK 已退出，沒有留下監聽 port；歷史失敗保留。

本次授權的 app 發布出口已完成，舊 B32／B31 retry queue 不再執行。Worker `ACTIVATION_PENDING_NO_EXECUTION`、Scheduler `PAUSED`、既有27 execution／新增0；native `USER_PRODUCTION_VALIDATION_PENDING`、supplier `DISABLED_DEFERRED`、whole DEV `NOT_ACCEPTED`。7 issues／29 groups及不計入交付判定不變；剩餘 CAD／正常 UI／業務驗收依各原契約處理，不推定已通過，也不自動恢復排程。人類「已驗證」只確認登入驗證完成。

## DEV-122 HISTORY_ONLY（B32 切流前證據讀取與 sealed GO 中止承接；發布前施工契約）

B31 PR #250 已正常合併至 main `0e9c4b573c37c32e35ef165589a7f32c4bdf255e`，required PR／main CI PASS。Owner [37882486573](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37882486573) prepare／build／migrate／candidate／entrypoint／verify／decision PASS；activate 在 traffic mutation 前以 `DEV121_OWNER_RELEASE_PROOF_PROVIDER_READBACK_FAILED` 中止，failure recovery SUCCESS。實際 HTTP status／內部原因 UNKNOWN；來源確認 activate 缺既有 builder secondary metadata-read token。canonical 無此 proof hook，不增加該 token。原 B31 capsule 已 terminal，不重播或覆寫。

GET-only sealed receipts／provider 回讀 PASS：migration 0 applied／33 replayed／ledger33，execution `ai-pdm-prod-migration-runner-zfh29`；verify smoke PASS、sealed decision GO；activate／canonical／finalize 正向404 absence。正式 `ai-pdm-prod-44984e6018dc` 100%／零 tags，candidate `ai-pdm-prod-18e86ee54d48` ready但未接流量，Scheduler PAUSED／零新增 worker execution，terminal PRE_ACTIVATION_ABORTED／FORWARD_APPLIED。證據 [B31 abort readback](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A23-B31/release/B31-abort-r1-provider-readback.json>)（SHA `2213f9ed45a03139e8a809a9e7cb85d38460de4ddba85441749d1c881916e2d8`）。未修改來源 actual consumer 32 GET／零 mutation，因 decision 存在而拒絕；[原拒絕](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A24-B32/release/B32-unmodified-current-B31-r1-cold-provider-readback.json>)（SHA `7acc9f66e6b6eeec7a572ecc3dd9f07d5546a54c5fab2434c0bc27b6e242d9da`），process cleanup PASS。

B32 RD Implementation Ready／架構定案。唯一implementation contract讀 [DEV-122 SPEC 的 B32 CURRENT](specs/DEV-122-ai-pdm-internal-function-issues.md)：只補activate既有metadata-read token、sealed verify／GO合法中止、固定一ordinary祖先與兩個native migration binding；同ROOT／depth8／一般prebuild guard保留。下一步root實作及targeted／native ROOT／actual cold-warm回歸，獨立Luna QC與六項requiredchecks、protected PR／CI及fresh capsule後發布。contract PASS不代表source／provider／release PASS。

沿用已授權 DEV-121 PR #242（unchanged migration083）＋DEV-122、AI-PDM／jenfu-platform-prod／ai-pdm-prod 同一正式發布與 corrective cycle，SHA／capsule 為機器 binding。來源 package 33項、最高083；不包含其他 task 的084。禁止 SQL edits／手動 DB、IAM／資源／Secret scope 擴張、worker execution、Scheduler resume 或 sibling mutation。成功出口 app RELEASED；worker ACTIVATION_PENDING_NO_EXECUTION、Scheduler PAUSED、native USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED，Whole DEV NOT_ACCEPTED。人類「已驗證」只確認既有 Firebase reauth完成；不作 CAD驗收。

## DEV-122 HISTORY_ONLY（B31 migration 後 abort 的已驗祖先承接；正式 release 待重試）

B30 PR #249 正常合併至 main `f80531d91298ebf73a59e1f07a5ba03f2e5dbd66`，required PR／main CI PASS。Owner [37868751105](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37868751105) prepare／build／migrate／candidate／entrypoint PASS，verify 因 Portal session HTTP 401 失敗，failure recovery PASS。唯一 app Cloud Build `fde45f99-c87e-4dd4-948f-bd1f14adc08a` SUCCESS；migration 083 已 forward applied，1 applied／32 replayed／ledger 33，boundary PASS。Terminal `PRE_ACTIVATION_ABORTED / FORWARD_APPLIED`，正式 `ai-pdm-prod-44984e6018dc` 100%／零 tags；candidate `ai-pdm-prod-6774ca0fceb8` 未啟用，Scheduler PAUSED／worker 無新 execution。原 capsule 不重播、sealed receipt 不覆寫、已套用 migration 不修改。正式回讀：[B30-abort-r1-provider-readback.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A22-B30/release/B30-abort-r1-provider-readback.json>)。

人類完成既有 Firebase 密碼驗證；同一 AI-PDM smoke Secret numeric 7→8 及同一 GitHub production 欄位已更新。原 issuer／subject／Principal／employee 相符，Portal session、兩次 me、logout revocation PASS，GET-only metadata 回讀 PASS。此回執只證明憑證重驗，不作 release authority；原 401 內部原因仍 UNKNOWN。安全頁 process tree、port 與本次暫存已清理；Chrome 工具尚無法接回本次 tab，UI cleanup obligation 由 root 持有。

B31 `RD Implementation Ready`；架構定案已定案，TL Contract Gate PASS（2026-10-09）。唯一 implementation contract 是 [DEV-122 SPEC 的 B31 CURRENT](specs/DEV-122-ai-pdm-internal-function-issues.md)。此 slice 為開發點／High，不計入產品完成；corrected source、provider consumer 與 production release 尚未通過。

下一步由唯一產品寫入者 RD 依固定 resolver 契約修改 `scripts/lib/dev121-preactivation-abort-continuation.mjs` 與直接回歸 tests；三份受控 docs 由 TL／root 同步。B30→B27 unpublished→B26 zero-build→B14 released 必須在同一 opaque root 的 nested callback 完整驗證，depth8／native source／metadata 與 current traffic guards 保留。原 `assertNoMigrationExecution` 不改；歷史 closed-window 只允許 current B30 sealed migrate 所綁定且 exact Job 完整 executions LIST GET 回讀證實完成的 exact execution。current binding 必須來自已驗 migrate／deployment／control owner run，不接受 caller 或 synthetic evidence。

Acceptance：B30 cold／同 root warm actual consumer、native ROOT authentic 模型與下一輪 producer／cold/cached prepare承接；basis／ref／owner／build／absence／execution／source／root／depth／metadata／current traffic負向均 fail closed 且零 mutation。targeted tests、六項 DEV-117 required checks、獨立 Luna QC、protected PR／CI、fresh official source／新 immutable capsule 必須完成後才可 full owner dispatch，新 runner replay unchanged 083。禁止 SQL edits／手動 SQL、IAM／資源／Secret scope 擴張、worker execution、Scheduler resume 與 sibling mutation。原 [27 GET／零 mutation failure](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A22-B30/release/B31-unmodified-continuation-r1-provider-readback.json>) 與 [Luna 原始 P1／P2](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A22-B30/release/B31-unmodified-continuation-luna-qc-r1.json>) 不覆寫。

沿用人類已授權 DEV-121 PR #242（unchanged migration 083）＋DEV-122、AI-PDM only 正式合併發布；機器 binding 變動不新增人類決策。發布條件 app RELEASED、worker ACTIVATION_PENDING_NO_EXECUTION、Scheduler PAUSED；native USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED，Whole DEV 仍 NOT_ACCEPTED。下方歷史不作現行執行指令。

## DEV-122 HISTORY_ONLY（B30 證據快取版本資訊修正；正式 release 待重試）

B29 PR #248 已正常合併，main `04d3fa365b90724955f9e8b22c1da4ebfca2e87b`，兩項 required PR／main CI PASS。B29 baseline／source-freeze／input-reuse PASS，但 worker reuse 在完整 inherited releasedProof 比對失敗；新 capsule、full owner dispatch、app build、migration、traffic 全部 NOT_RUN。保留 B29 原失敗與正向 404 absence 證據。

B30 `RD Implementation Ready`：同一 opaque evidence root 的 receipt byte memo 命中後遺漏 generation／crc32c；warm B27 continuation 只因這些欄位由已驗值變 null 而失敗。修正只增加 private、verified GCS metadata memo，與既有 receipt URI／SHA key 同生命週期；byte-only memo 必須重新驗 generation-pinned media、CRC／SHA，版本衝突 fail closed。祖先／depth／hash／時限／closed／source admission 與完整 releasedProof 比對不放寬；generic owner v1 shape 不變。僅 AI-PDM observation serialization 保留歷史 prefetched migrate 的 generation／crc32c null shape，migration URI／SHA／內容仍完整驗證，private metadata 不序列化也不宣稱 live DB authority。

本次只改 proof adapter、直接回歸 tests 及三份受控索引；fresh local checks、ROOT authentic cold／warm regression、GET-only actual consumer、獨立 Luna QC、protected PR／CI、official source、全新 capsule 後續綁定本次來源。原 sealed receipt／B29 attempt 不覆寫、不重播過期 input，不新增 IAM／資源／Secret／執行能力。正式基線仍 B27 PRE_ACTIVATION_ABORTED／NOT_APPLIED、B14 `ai-pdm-prod-44984e6018dc` 100%／零 tags、Scheduler PAUSED。

沿用人類已授權 DEV-121 PR #242（含 unchanged migration 083）＋DEV-122、AI-PDM only 正式合併發布。發布條件 app RELEASED、worker ACTIVATION_PENDING_NO_EXECUTION、Scheduler PAUSED；native USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED，Whole DEV 仍 NOT_ACCEPTED。下方歷史不作現行執行指令。

## DEV-122 HISTORY_ONLY（B29 prepare 遷移查詢身份修正；正式 release 待重試）

B28 PR #247 已正常合併，main `04ed844a853a91d1e13b3419d26f118517accc00`、兩項 required CI PASS；B28 production prepare／build／migration／traffic 全部 NOT_RUN。來源補查發現 prepare 的 exact migration-runner executions list 使用 verifier，但 exact Job provider IAM 的既有 `roles/run.viewer` 綁定 deployer；未證實 verifier 曾回正式 403。一般發布身份查證成功不能抵 WIF consumer 證據。

B29 `RD Implementation Ready`：只在 full owner prepare 借用既有 deployer WIF token，限制 bodyless、no redirect 的 exact `ai-pdm-prod-migration-runner/executions` GET、`pageSize=100` 與至多一個 `pageToken`。其他 URL／method／query 使用原 primary 身份；denied／timeout 不 fallback。Build 與其他階段不 mint、不接收此 token。Workflow source guard 驗證 actor、stage、輸出綁定及禁止 credential file／環境 export；不增加 IAM、資源、Secret 或執行能力。

正式基線仍是 B27 `PRE_ACTIVATION_ABORTED / NOT_APPLIED`、B14 revision `ai-pdm-prod-44984e6018dc` 100%／零 tags、Scheduler PAUSED。沿用人類已授權的 DEV-121 PR #242（含 unchanged migration 083）＋DEV-122 同專案正式合併發布。B29 必須完成本次 source-bound checks、獨立 Luna QC、protected PR／CI、official source 與新 capsule 後再 dispatch；B28 pre-fix continuous receipt 不作本次 final evidence，changedFiles 由實際 PR diff 取得。

發布條件 app RELEASED、worker ACTIVATION_PENDING_NO_EXECUTION、Scheduler PAUSED；native USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED。Whole DEV 仍 NOT_ACCEPTED。下方 B28 歷史保留；其中 verifier route 是待修正來源狀態，舊連續測試只證明當時來源。

## DEV-122 HISTORY_ONLY（B28 worker 計時與 unpublished-build abort 復原；正式 release 待重試）

B27 protected-main PR #246（`93fe480bc758315d6b21003e2a0e2a70ff3ed4d1`）的 owner run [37823241328](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37823241328) prepare PASS、build `OPENSWX_OWNER_DEADLINE`、failure PASS。唯一 app Cloud Build `fa2e0853-1fc6-4682-8c23-2aa64d5a1de5` 已 SUCCESS；provenance／SBOM／scan 已寫，build-stage／deployment-capsule／migration／submission／candidate 不存在。Terminal `PRE_ACTIVATION_ABORTED / NOT_APPLIED`，正式 `ai-pdm-prod-44984e6018dc` 100%、零 tags，Scheduler PAUSED。原始 provider readback：[B27-abort-provider-readback.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A20-B27/release/B27-abort-provider-readback.json>)。

B28 `RD Implementation Ready`：每次 worker resolve 從原 stage transport 建立新計時 wrapper，保留每一操作累計 600 秒、request 30 秒及 intent 絕對期限；同一操作的內部 GET 不刷新期限。新增嚴格 `ai-pdm.principal-unpublished-build-abort-basis.v1`：sealed prepare／rollback／terminal、finalized expired control、completed failure owner head；build／deployment／migration／submission／candidate 與後續 receipts 正向 404 缺失；三項 partial receipts source/image joins；exact release-tag list 唯一終結 SUCCESS、source archive generation/image/builder joins；完整分頁 own migration Job executions 拒絕 active、owner run 開始後新 execution、source/output 匹配或未知。只證明 `QUIESCENT_UNPUBLISHED_BUILD_NOT_REUSED`，固定 partial `releaseAuthority=false / migrationVerified=false`；不產生完整 build/deployment/released proof，不將 B27 partial artifact 冒充新 source 的 build。

Anchor 只容許一層 sealed zero-build predecessor：B27 prepare basis 與其 authorization／readiness 完全相同，failedIntentRef 對上 B26；重讀 B26 sealed receipts/source lock/run、zero-build/provider absence，releasedIntentRef 由 B26 intent 固定導向 B14。B14 必須通過既有完整 released source/provider proof、Principal environment、service UID、ready image、canonical entrypoint、唯一 100% traffic／零 tag及環境 hash。歷史 B26 mutable control bytes 不做重新查證主張；只保留 sealed inherited basis 的原 control hash。一般 post-migration nested aborted anchor 仍拒絕。Producer、cold/cached prepare與 worker reuse 仍重新查證相同 basis。

驗收：長 app build 後 refresh、單一 await 到 600 秒及較早 intent deadline fail；native terminal 只由 rollback 保存 recoveryOrder；partial/unknown/pagination/source/image/submission/active execution/nested basis tamper negative；exact own migration execution GET-only verifier route，其他 target/method不借 verifier token。79 targeted、165 continuous 已實際通過；真實 B27 read-only consumer 116 GET 通過（[B28-r3-live-B27-abort-consumer-readback.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A20-B28/release/B28-r3-live-B27-abort-consumer-readback.json>)）。獨立 Luna QC、現行六项 DEV-117 required checks與 protected-main/required CI/official source/release proof 仍須收斂。

沿用人類已授權的 DEV-121 PR #242（含 migration 083）＋DEV-122 同專案正式合併發布；不新增 IAM／資源／Secret／SQL、worker execution 或 Scheduler resume。更新 machine source/capsule bindings後再執行新 owner attempt，不能 replay terminal B27。發布條件 app RELEASED、worker ACTIVATION_PENDING_NO_EXECUTION、Scheduler PAUSED；native USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED。Whole DEV 仍 NOT_ACCEPTED，原證據保留。

## DEV-122 HISTORY_ONLY（B27 建置唯讀身份分工修正；正式 release 待重建）

B26 owner run [37814831003](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37814831003) prepare PASS、build `DENIED`、failure PASS。Terminal `PRE_ACTIVATION_ABORTED / databaseDisposition=NOT_APPLIED`，正式 `ai-pdm-prod-44984e6018dc` 100%，Scheduler PAUSED，零本輪 Cloud Build；B26 source archive 已寫入。B25 freshness 修正已由 B26 prepare 驗證。Log 未記錄被拒絕 URL；程式順序及現行 IAM 支持 beforeBuild 即時 GET 誤用 builder 的診斷，實際 403 endpoint UNKNOWN。

B27 `RD Implementation Ready`：只修本 repo full workflow build 的身份路由。Builder 保留 source／receipt 寫入、Cloud Build 與 Artifact Registry；既有 verifier WIF token 僅借給 exact AI-PDM service／revision、OpenSWX Job／execution、Scheduler GET 及已有 source-proof reader。Source-proof reader 的 Build／Image GET 仍以已驗證的 builder read binding 執行；不新增 IAM、資源、Secret、migration、SQL、worker execution 或 Scheduler resume。缺 token／錯誤 target fail closed；POST／PATCH／DELETE 與 sibling URL 不得取得 verifier token。

驗收：固定路由正反案例、denied/timeout 與 zero mutation；workflow primary/secondary token wiring guard；現行六項 DEV-117 required checks；獨立 Luna QC。原本正式合併發布授權持續有效，機器綁定在修正 main 後更新。發布成功條件為 app RELEASED、worker ACTIVATION_PENDING、Scheduler PAUSED；native USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED。Whole DEV 仍 NOT_ACCEPTED；B24／B25／B26 保留原始證據，不冒充新 release PASS。


## DEV-122 HISTORY_ONLY（B24 native prebuild source 修正／實際本地 QC 完成；正式 release NOT_RUN）

現行狀態 `B24_LOCAL_BEHAVIOR_QC_PASS`；同一 freeze 的實際 local acceptance：[B24-final-local-qc-binding.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B24/release/B24-final-local-qc-binding.json>)（SHA `c992695b41a78eb454f181376a9c08735453371e80b11a12a4cb1d42fca11de3`）。不構成 production release authority。

- 本輪僅修既有 native reader 的第二 historical path allowlist，加入既有 prebuild-list-readback.tf；第一 revision admission、max8、source/root 與 IAM/resource guards 保留。
- 兩份既有測試補 genuine native Git 正負向量及 v3 → retained v1 → prebuild consumer；9 產品／9 測試的 18 個 executor inputs 綁定本輪 actual hashes，ROOT 37 IDs 保留。
- 原 proof-reuse 實際 155／155、完整 ROOT 37／37；原 continuous 實際 142／142；原 QC exit0。三命令同 freeze、四項 finally PASS，fail／cancelled／skip／todo=0。
- QC 的兩個 isolated-build markers 已綁定；primary invariant `database-absent`，artifact／primary／cleanup=true。
- Luna final actual behavior 未解 P1／P2=0；static 或 modeled PASS 不抵 provider／production 接受。

本輪實際證據：
- source-freeze：[B24-r1-source-freeze.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B24/release/B24-r1-source-freeze.json>)（SHA `7660dbe686d86aeb1b97f54d58c285008c0cbae29e4008b5afd1da94c0a90cd3`）
- proof-reuse：[B24-r3-proof-reuse-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B24/release/B24-r3-proof-reuse-check-result.json>)（SHA `ab4c5a5aaaa0cd13dfb4415e59ba3b85399078c75417214470cdd73ba3c1938a`）
- continuous：[B24-r3-continuous-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B24/release/B24-r3-continuous-check-result.json>)（SHA `31513cd3d60480620eb4fd282a66a8f00054a730e3184d7d3cdf0a0feff4089d`）
- qc：[B24-r3-qc-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B24/release/B24-r3-qc-check-result.json>)（SHA `ce38d48a803bcc0cb676c3b21a092c90548191527e4b8a4f55d3f6f4f2691368`）
- independent-qc：[B24-r3-final-independent-luna-qc-review-r1.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B24/release/B24-r3-final-independent-luna-qc-review-r1.json>)（SHA `edfba32fe6894980790fd5dcbcb6eaf08c58a752b4aa139c407edaf639d66bb4`）

B23 為不可覆寫的 HISTORY_ONLY：PR240／原 main CI 與 baseline、source-freeze、input-reuse、reuse 實際 PASS，零 worker builds；descriptor-full 實際 exit1，OPENSWX_HISTORICAL_SOURCE_SCOPE_INVALID。它們不構成本輪新 source 的 PASS。
- 原 official/main：[B23-official-source.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/B23-official-source.json>)（SHA `940143c661b5a68c1f90e44526cca6fb5a0482551a8918e6515567754830e600`）
- 原 reuse：[B23-owner-r1-reuse-owner-readback.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-owner-r1-reuse-owner-readback.json>)（SHA `6bd60b0a162fbd424220376a304a1f37f709773968a0e562c8f62681881fc47c`）
- descriptor-full FAIL：[B23-owner-r1-descriptor-full-runtime-final.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-owner-r1-descriptor-full-runtime-final.json>)（SHA `96756c270d6ccc17e725b0fa1a9a1588ca5e9467d761e9d43e43753d6e113f45`）
- 原始 stderr：[B23-owner-r1-descriptor-full-stderr.raw.log](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-owner-r1-descriptor-full-stderr.raw.log>)（SHA `19382ddf3cdfbadd5ff507c14568f2ac1e1de41025d682bb07e35e5f37079531`）

下方舊 B23 CURRENT 改標 HISTORY_ONLY，整段 body 與更早 r6–r15 PASS／FAIL、契約及 adoption 原文、原 receipt 均保留；不改寫歷史結果。

本輪 B24 正式 PR／main／official qualification 待建立；owner release 後續 `NOT_RUN`；current DB `UNKNOWN`。正式 8 CAD／正常 API／UI 尚未驗證。Repair 變體零 SQL Job，不新增 schema、migration、API、CI、權利、資源、IAM 或 Secret。
Whole DEV：7 issues／29 groups NOT_ACCEPTED；native USER_PRODUCTION_VALIDATION_PENDING；supplier DISABLED_DEFERRED。Local model 不抵正式業務／UI 或 native 使用者驗證。

## DEV-122 HISTORY_ONLY（B23 r15 實際本地行為驗證／Luna QC 完成；production NOT_RUN）

現行狀態 `B23_LOCAL_BEHAVIOR_QC_PASS`；證據入口 [B23-final-local-qc-binding.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-final-local-qc-binding.json>)（SHA `3f975c5cd11d6e50082ef0ce8932394391bf7dccec33d6d9aa3e86f7c9c56248`）。這是同一 r15 freeze 的本地行為接受，不構成 production release authority。

- 九產品／九既有測試；第九產品維持既有 IAM binary .tfplan ref validator 修正。generic sealed terminal 路徑維持 profile bucket／seal；AI-only ordinary abort 與 branded evidence context 保留。
- r15 proof-reuse 原命令實際 155／155、完整 ROOT 37／37；fail／cancelled／skip／todo=0。
- r15 修正 completed-first 時間格式 guard 順序：先驗 raw execution 與 marker timestamp，再保留原 terminal validator；原 continuous 實際 142／142；原 QC 命令 exit0；四項 finally 均 PASS，ROOT 引用同 freeze 的 proof-reuse，未重跑。
- QC stdout 兩個 isolated-build markers 已綁定；primary invariant `database-absent`，artifact／primary／cleanup=true。
- Luna final actual behavior verdict：未解 P1／P2=0；static 或 modeled 正例不冒充 provider／production 接受。

實際證據：
- source-freeze：[B23-r15-source-freeze.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r15-source-freeze.json>)（SHA `c8f02408c022f453830f2843a296d586a921e3f732c72df2893e5a41f5e34896`）
- proof-reuse：[B23-r15-proof-reuse-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r15-proof-reuse-check-result.json>)（SHA `5b17f15d3f96d6bf1fa9c6d817a79467791bf6d13d4cae2ef45d24a917745ce1`）
- continuous：[B23-r15-continuous-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r15-continuous-check-result.json>)（SHA `7ec632fbe3ae90bd9c160c3c60f522419999a064a6534069dcdd5476741faf55`）
- qc：[B23-r15-qc-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r15-qc-check-result.json>)（SHA `39eab5ebfd547d13ee40c4d3f3c3df935e0bbad07b705520b3ea0cb36dde4ec6`）
- independent-qc：[B23-r15-final-independent-luna-qc-review-r2.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r15-final-independent-luna-qc-review-r2.json>)（SHA `ee70e650ab776e980f25b38f90ac273286258969092b3aa681e0c8d0fba79851`）

九個產品（exact hash 見 final binding）：
- `scripts/lib/dev012-owner-release-runtime.mjs`
- `scripts/lib/dev012-owner-stage-executor.mjs`
- `scripts/lib/dev121-owner-release-proof.mjs`
- `scripts/lib/dev121-preactivation-abort-continuation.mjs`
- `scripts/lib/dev122-openswx-bootstrap.mjs`
- `scripts/lib/dev122-openswx-owner-release.mjs`
- `scripts/lib/dev122-openswx-readback-iam.mjs`
- `scripts/lib/dev122-openswx-worker-artifact-reuse.mjs`
- `src/lib/openswx-metadata-dispatch.ts`

九個既有測試（exact hash 見 final binding）：
- `scripts/dev012-owner-prerequisite-producer.test.mjs`
- `scripts/dev012-owner-release-runtime.test.mjs`
- `scripts/dev012-owner-stage-executor.test.mjs`
- `scripts/dev121-owner-release-proof.test.mjs`
- `scripts/dev121-principal-owner-recovery.test.mjs`
- `scripts/dev122-openswx-bootstrap.test.mjs`
- `scripts/dev122-openswx-owner-release.test.mjs`
- `scripts/dev122-openswx-worker-artifact-reuse.test.mjs`
- `src/lib/openswx-metadata-dispatch.test.ts`

r6–r10 proof-reuse、r12 原 continuous 七個、r13 診斷單一 fixture 及 r14 原 QC 真實 FAIL 均保留。r14 QC 為 205／204／1 的 malformed timestamp guard-order 失敗；四項 finally PASS，aggregate 於此停止，後續 abort／DB boundary／typecheck／isolated build 未執行。下方舊 B23 契約／adoption／partial 狀態為 HISTORY_ONLY，原始證據未覆寫：
- [B23-r6-proof-reuse-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r6-proof-reuse-check-result.json>)（SHA `4edb16ce804a8eefa51476533935add5f02adf95e2b9e429c79bf8f843a79ced`）
- [B23-r7-proof-reuse-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r7-proof-reuse-check-result.json>)（SHA `05714ce4e2be0ee9020a964f69513466a85aca15c7f120d12fe36163e58435c8`）
- [B23-r8-proof-reuse-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r8-proof-reuse-check-result.json>)（SHA `baa5029696b03171e52018292e3f91c5fa2bf752d5ea4465d261f97291ea8a4d`）
- [B23-r9-proof-reuse-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r9-proof-reuse-check-result.json>)（SHA `243aeba0e4548619f815e15f3d11555319237c68901bb96189358ceef7fb662f`）
- [B23-r10-proof-reuse-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r10-proof-reuse-check-result.json>)（SHA `ba1489e99dbf1b81f4ee629e345324d2aacb4dd356f0da8b44a13d7be3afc8f0`）
- [B23-r12-continuous-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r12-continuous-check-result.json>)（SHA `320a91a7327c3a1aa7b30cd25d9934a86393c0be129c2612661919aa40d3b337`）
- [B23-r13-continuous-diagnostic-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r13-continuous-diagnostic-check-result.json>)（SHA `ee8befe69474682d5596dddd6f658ccfe6fa764e40a7085c3bce82f57ca23b81`）
- [B23-r14-qc-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r14-qc-check-result.json>)（SHA `e9c8fd11d9cfa63a2526c3ed783750dac67d935306c308ba01c19e556ae7311c`）

r14 full155／ROOT37 與 continuous142 實際 PASS 僅為 HISTORY_ONLY；source 已因 r15 guard-order 修正改變，這些舊 PASS 不構成 current acceptance：
- [B23-r14-proof-reuse-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r14-proof-reuse-check-result.json>)（SHA `9f5b28578eda3482550a8c8d650d68c03be5dc0470a7a11bf9ad96dedee2ab07`）
- [B23-r14-continuous-check-result.json](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-r14-continuous-check-result.json>)（SHA `ae60e8218af50a390d3a3c128659c2a487d091ed1bbf97de9edbb238033fdb48`）

Production `NOT_RUN`；current DB `UNKNOWN`。Repair migration 僅歷史輸入等價取證，此變體零 SQL Job。不新增權利、資源、schema、migration、API、CI 或授權模板。

Whole DEV：7 issues／29 groups NOT_ACCEPTED；native USER_PRODUCTION_VALIDATION_PENDING；supplier DISABLED_DEFERRED。Local modeled PASS 不抵正式 8 CAD、正常 API／UI 待驗或既有 FAIL，無 production READY 宣稱。

## DEV-122 HISTORY_ONLY（2026-10-08；B23 架構定案／RD Implementation Ready／Contract QC PASS）

唯一現行入口為[DEV-122 SPEC 的 B23](specs/DEV-122-ai-pdm-internal-function-issues.md)與[不可覆寫詳細契約](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-paused-app-repair-contract-r3.json>)，契約SHA-256 `4d0b0f0fecdc8c7e75c41e009cc27998935869d570fd2354ebe0f3da1e57251e`。B23 r3獨立契約QC已通過，架構定案／RD Implementation Ready；產品IN_PROGRESS_PARTIAL／NOT_FULLY_TESTED／NOT_SOURCE_FROZEN、archive補遺QC PASS／已採納／production NOT_RUN，尚非Release Ready。

2026-10-07T21:42:20Z 已完成[獨立 Luna r3 契約 QC](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-independent-luna-contract-qc-r3.json>)（SHA `94605db85d2d3db9672cd78bbe3ea33ee1794b5704856fc5ef8da6c2ac082e54`，`CONTRACT_REVIEW_PASS`，無未解finding）及[root adoption](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-contract-adoption.json>)（SHA `997ae9471ce5be1345f2053e593c29804999e9f62ea1f46e6c195ddc91f05d5e`）。現行為 `ARCHITECTURE_FINALIZED / RD_IMPLEMENTATION_READY`；QC僅契約與delta，不是實作或provider行為證據。原r3的凍結metadata與r1／r2失敗不覆寫，成熟度以本adoption為準。Adoption當時的Product `NOT_STARTED`為歷史快照；現為 `IN_PROGRESS_PARTIAL / NOT_FULLY_TESTED / NOT_SOURCE_FROZEN`，production `NOT_RUN`、current DB `UNKNOWN`，尚非Release Ready。單一RD writer已開始獨立parser／schema部分；Archive r3及deadline／context seam的QC／adoption均已完成；依shared reader／context→consumer順序續作，remaining owner graph尚未測試，已驗局部層見下方。

唯一執行缺口補遺為[bounded archive proof r3](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-paused-app-repair-archive-proof-addendum-r3.json>)（SHA `3ee07f650fb1b7430d23e8d0b9d2f3eb51aae65635d451dfb6ca83ccc13892f3`，封存時`RD_CONTRACT_READY / QC_PENDING`，現已`ADOPTED_RD_IMPLEMENTATION_READY`）。既有proof模組內以bounded stream＋記憶體gzip/tar驗固定profile及32 SQL；prepare沿exact Git、build在paid createBuild前驗實際archive，fixed reader只讀已封存capsule與已完成build graph所綁authenticated sourceObject，避免future-ref循環。網路media與解壓各256MiB、metadata64KiB、selected每檔1MiB／合計8MiB；完整PAX／path／hash／generation／CRC與負例見補遺。八產品／九tests、20 schemas／58 refs及零migration Job不變，current DB仍UNKNOWN。2026-10-07T22:10:16Z [補遺r3獨立Luna QC](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-independent-luna-archive-contract-qc-r3.json>)（SHA `7bff67778805e1a57295ef282214492e299d9dae459a847427d6cb929a0b2976`，`CONTRACT_REVIEW_PASS`，P1／P2=0）及[root補遺adoption](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-archive-proof-addendum-adoption.json>)（SHA `45079915e960d8fda7b3979bce1d3c81987f994b688523ef5ca6789c81f12829`）已完成。`DEPENDENT_PROOF_WRITE_GO`僅開放來源實作：先完成closed bounded reader，再整合既有stage／fixed runtime／abort與worker serving-proof consumers，禁止placeholder。產品整體仍IN_PROGRESS_PARTIAL／NOT_FULLY_TESTED／NOT_SOURCE_FROZEN；契約PASS不等於behavior PASS，沒有runtime／provider／release GO。初版補遺SHA `6ec44c17ebf2c63a19959ac4479ee17b5caea0e2ca49934a981a3ac02d9f0c8a`保留，r2只更正B22 metadata的描述路徑。 補遺r2（SHA `60270bbef6c57dd835fc37b8b1f096c82553d968f47db4b0ce0e34440b2dcb12`）的[獨立Luna delta QC](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-independent-luna-archive-contract-qc-r2.json>)（SHA `3bae1b2ce4a942f5d80dcf562c71f0a1bbb9786ad2b02c51599c94ba95f652ca`）發現單一P2：verifyProvider:true的sourceObject read仍可能旁路stream上限；這是static call-chain finding，behavioral repro NOT_RUN，非RD實作失敗。r3僅補明該分支也須重用同一次observation已驗bytes或同一bounded adapter，原始response.arrayBuffer呼叫數必為0，新增under／over-cap向量；Build／Image readback與authority不變。

現行追加限定為[deadline／trusted context seam r2](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-paused-app-repair-deadline-addendum-r2.json>)（SHA `87568673e10140f69121813fa25ff91fa3499b91b017b3e3e5c46c8786f3a6f1`，封存時`RD_CONTRACT_READY / QC_PENDING`，現已`ADOPTED_RD_IMPLEMENTATION_READY`）。原archive r3 QC／adoption保存；新增gap不是RD行為失敗。歷史B14 deadline只驗原證據時序，不能要求現在仍有效；整個readonly graph用單次不可重設600秒budget，當前producer／owner另於觀察前後及動作前驗自己的sealed input／intent期限。既有proof檔窄加Node內建AsyncLocalStorage＋私有WeakMap exact brand，opaque context跨worker→serving→migration共用root hash／path visiting／leaf-only memo及累計max8，拒第9層於provider read前；plain／cloned／prototype／跨root／expired／closed context拒絕，並行branch隔離。固定readOwnerSourceProof仍四參數，沒有public ctx／deadline override、future capsule、npm／新檔／工具／權限。八產品／九tests及20 schemas／58 refs不變。2026-10-07T22:32:53Z 已完成[deadline/context獨立Luna語義QC](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-independent-luna-deadline-context-contract-qc-r2.json>)（SHA `b15af10b34e0e9d5912924bde959788c869b0cf007edbcf7ee6b79bbe81a8198`，`CONTRACT_REVIEW_PASS`，P1／P2=0）與[root採納](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-deadline-context-adoption.json>)（SHA `c75ac8824805d19f209049022607b213abfff5a500e44a7ec339becd14db01dc`）。`DEADLINE_CONTEXT_CONSUMER_WRITE_GO`僅來源實作：先完成branded shared reader／context及fixed observation，再接原stage／runtime／abort／worker consumers，禁止placeholder；此GO不含runtime／provider／release，契約PASS不冒稱behavior PASS。較早deadline-only草案SHA `7236ee23efa918dc88a3384a457f571258d2eb3ea752a54e0f350a48072060a5`留存但未QC／採納。






[Root實際局部分層證據](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-root-local-layer-results.json>)（SHA `f41ce538fd48ae086c9dc298331718a94ea86c0f5ddbef78439be77622639fc2`）：同test／fixture／clock／REST seam僅換parser的old-red／current-green因果驗證PASS，dispatch TypeScript tests28／28，該層hash未變可重用；pure archive57／57、0skip PASS僅綁原freeze輸入，portable／context變更後尚未測試，未覆蓋完整fixed observation／context／provider verifier。八個primary DB／journal前後ABSENT不變，task-owned PID／temp／governor已清理。Root harness regex誤選及freeze aggregate nullsize修正均保留原證據，不計RD failure。整體為 `IN_PROGRESS_PARTIAL / NOT_FULLY_TESTED / NOT_SOURCE_FROZEN`，完整owner／ROOT replay `NOT_RUN`，本phase未做production mutation；局部85 cases不是7 issues／29 groups的業務接受，完整候選獨立source QC仍未執行。

本次僅補錄既有r3/adoption的adapter與QA執行層，詳見[DEV-122 CURRENT](specs/DEV-122-ai-pdm-internal-function-issues.md)，不新增contract revision／schema／八產品九tests scope／人類核准。Cached-build `SOURCE_GO`：固定四欄observer僅以 exact `refs={prepare,migrate:null,terminal:null}` 內部分派既有pre_migration；同scope驗current capsule/build/bundle與bounded archive的profile／32 SQL，再比較current／historical輸入。只回 `build_only / releaseAuthority=false / migrationVerified=false`，無future migrate GET／public mode或override／raw readBytes，sealed deadline與shared context guards不變。

[Root已採納 serving/control retry interpretation r2](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-serving-control-retry-interpretation-r2.json>)（SHA `2ccdbc3ad379eea1ea78797d7269f2866a68af75893d011cf8ea877d55533f76`）僅落實原r3 recoveryConsumer，author GO不等於behavior PASS。`validateRepairBaseline` 的recorded路徑驗sealed APP_SERVICE／APP_REVISION及真正RELEASED serving graph，不把mutable control當舊capsule身分或execution authority；原protected intent、concurrency、control/CAS及phase-specific fresh guards保留。Live producer只接受原exact `FINALIZED/RELEASED`，或完整既有ordinary abort continuation所驗 `FINALIZED/PRE_ACTIVATION_ABORTED`：從fixed control releaseId取得authenticated failedRef，failed lock/deadline綁failed capsule，releasedIntentRef必等於真正servingCapsuleRef，revision／digest／serviceUID等完整join。55秒PAUSED fence後、發布或replay前重讀control與Service並驗原bytes/hash/generation及serving preimage；drift拒絕。Failed與released歷史共用原max8／deadline，禁止reset、failed冒充serving或active control進producer；普通ENABLED guard不變。routine-authority／prepare仍綁failedRef及完整preActivationAbortBasis，previousRevision仍是actual serving revision。R2於任何RD GO前只更正root原紀錄的contract SHA抄錄，原檔保留；無新authority／schema／helper／scope，source仍partial、behavior NOT_RUN。

QA雙mandatory仍為 `CI_PORTABLE`（當次shallow HEAD之profile／32 SQL/full native archive；selected33僅格式／負例）＋`ROOT_AUTHENTIC_REPLAY`。現行[authentic input manifest r3](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-authentic-B14-input-manifest-r3.json>) SHA `deaab704ad17517af14b13e8f899bb48b07e88b342333de915985fc1dfafc204` 綁68 exact GCS objects／8 actual provider raw／3 native historical Git fixtures；directly-consumed worker、IAM／R15與prepare cutover inputs已閉合。這只是data bindings延伸，仍須consumer驗sealed graph後才admit source；actual input-only不是behavior PASS、current DB或release authority。[舊manifest r2](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-authentic-B14-input-manifest-r2.json>) SHA `cb042bc97c0d52cc62dd02106b859e2c1cb99adde4ca6db8c8138600695243e2` 的17 GCS＋2 provider僅保留immutable reader-input歷史。沒有contract revision、新schema、權限或產品scope變更。

[Root執行層澄清](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-qa-execution-layer-clarification.json>) SHA `41c7b7ab2c74f56f67481b7c0973f0e8e65b3c3238f499993130988eb66bb034` 已採納：ROOT consumer suites集中既有proof.test，以有效SHA-sealed manifest額外註冊；未提供明列NOT_RUN，partial／invalid硬失敗，無network fallback／product hook。`proof-reuse`唯一承擔完整固定expected ROOT IDs全PASS、count>0、skip/todo=0與command exit0；producer／worker／stage／bootstrap／abort實際consumer正負例不縮減。continuous／QC原命令與gates各自實跑，明列 `ROOT_EXECUTION_NOT_IN_COMMAND`，引用同source/tests/inputs freeze的真proof-reuse證據，不冒抵或重跑ROOT，不改workflow／npm／wrapper。`B23-r5-checks.mjs`／launch僅prepared NOT_RUN；[獨立Luna限定prepared-controller QC r5](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-root-controller-limited-qc-r5.json>)（SHA `b0a44afd42801f88cdc8f13dac5d33138c7ed84dba876622b4108a83248408ff`）為 `LIMITED_PREPARED_CONTROLLER_QC_PASS_EXECUTION_BLOCKED`，僅controller準備與既有data review重用。Source freeze及完整expected ROOT set尚未sealed／QC pending，PENDING anchors禁止執行；不是implementation PASS，r3／r4準備歷史保留。完整owner／ROOT behavior全部 `NOT_RUN`；RD仍 `IN_PROGRESS_PARTIAL / NOT_FULLY_TESTED / NOT_SOURCE_FROZEN`，本phase未做production mutation，7 issues／29 groups、native USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED及歷史FAIL保留。

r1 契約（SHA `d85df6ff2486e3a469cdd9d8cea94df6c2c097d9cb25c98edf75f99988d0cb50`）經獨立 Luna 判定 `CONTRACT_REVIEW_CHANGES_NEEDED`／P1：既有 prepare 無 fresh ledger證據，runner可套用pending；原檔與[QC失敗紀錄](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-independent-luna-contract-qc.json>)（SHA `7d8b71eda440871d5f7d4238f6c0a6eedb8d4259362f57a6b7407e5d13ef222b`）保留。r2改為historical32＋本次完整migration輸入相等、零migration Job；不是fresh current DB32證明。Actual AI-PDM minimumLedgerCount為0（非generic default15），更需禁止repair fallback到runner。r2封存時為RD Contract Ready／QC PENDING，此為歷史判定。

r3僅修正r2獨立QC的P2措辭：允許既有allowlist內fixed readonly source-proof dispatch，但runtime configuration／transport authority不變；putJson-only僅指新增migration evidence，原app stages的protected build／provider operations沿既有授權。r2 SHA `43fd82d2b38e57195c693c63674220568459bcb5da0c158df0f390931bc66ec4` 與[QC r2](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B23/release/B23-independent-luna-contract-qc-r2.json>)（SHA `4033e5793d3375c7fcddcfb4751f2ddec2468c1802a2d2b0a396fdb232326046`，remainingP1=0）保留。20 closed schemas／58 refs、流程、八產品／九測試及QA門檻完全不變；r3封存時為RD_CONTRACT_READY／QC PENDING；其後已完成獨立delta QC與adoption，現行成熟度見上方。


[B22實際分層結案](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B22/release/B22-root-layer-closure.json>)保存兩輪source closure／PR239 required CI／provider reuse／descriptor-a PASS，以及新的live pause/drain FAIL；full workflow／app build／bootstrap未執行。B23不重置B22計數、不把失敗當第三次producer重試。20:25 UTC provider facts只是歷史觀察，執行前需fresh readback；global head與十次409完整因果UNKNOWN，原FAIL、QC timestamp qualification及local/provider物件hash身分分開保存。

選定full-purpose v3 PAUSED_APP_REPAIR，保持dispatch1／原Job與numericSecrets；新app canonical後finite，exit0只ACTIVATION_PENDING，actual stdout empty／freshness／credential／template／latch通過才READY。失敗前後分流、三個來源owner、最大8層closed graph、current-serving app與last READY worker分離、newREADY→ordinaryDAILY與pending→newrepair均見SPEC。既有十階段／capsule／serviceconcurrency、historical32＋完整ordered migration／082等價、零migration Job、current DB UNKNOWN、零新workerimage／IAM／resource不變；generic proof／preview維持v1-only，限定AI reader分開歷史觀察；preview executable等價因proof檔變更失效，本流程未依賴或執行。沒有observer／新API／新CLI。

同repo worktree branch `codex/dev122-paused-app-repair`，base `14559fb892fc598194f8e74f5bd50bce0dcb96e7`。後續僅八產品／九既有test allowlist（r1五檔加必要proof／abort／fixed-runtime reader三檔），必要六DEV117 checks依最新人類AGENTS重用actual applicable evidence，不增加人工確認。下方歷史CURRENT段落只保留原判定，不是新施工入口。

7 issues／29 groups、wholeDEV NOT_ACCEPTED、F-01F USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED、歷史UI FAIL／8CAD NOT_RUN保留。下一步：完成已採納shared reader／context→相依RD→完整owner QA→獨立implementation QC；本次TL文件交接未執行產品修改／測試／runtime／provider／Git mutation，RD已另行開始部分source實作。

## DEV-122 HISTORY_ONLY（2026-10-07；B18 限定 source QC 通過，B19 RD Implementation Ready／架構已定案）

B14／R17 歷史正式證據保留：官方來源 `54d3c4c3`、`ai-pdm-prod-44984e6018dc` 100%／0 tags，首次自然 Scheduler／app HTTP200／worker execution完成兩CAD、33屬性；正常 parent-work cancel HTTP500與UI FAIL不改寫。正式 SQLSTATE仍UNKNOWN，current production取消未重測；實際native RESTRICT code23001，原23503預測錯誤。

B18修復已在同repo branch `codex/dev122-openswx-work-cancel` dirty source完成限定QC：cancel鎖parent/jobs，queued/running於domain DML前409且永不改job；terminal保留revision/session provenance並釋放claim。PostgreSQL preparing/correction_required只有NEW enqueue才實際MVCC parent touch，row_version/content/updated_by不變、原trigger改updated_at；native兩enqueue-wins race實際40001 whole-callback retry後409且165表與全job bytes不變。Current native test050 fresh24／24（runner仍PARTIAL_NOT_ACCEPTED）、focused138／138有效重用、SQLite6／6、actual ledger17／17及typecheck/lint/boundary exit0；own runtime/temp/capacity已清理。Historical matched red6／green3只綁舊tests，current050沒有exact red twin。獨立Luna `PASS_QUALIFIED_B18_SOURCE_AND_BOUNDED_EVIDENCE`及追加用詞更正已封存，非正式／wholeDEV PASS。

下一個獨立施工slice為[唯一現行SPEC的B19](specs/DEV-122-ai-pdm-internal-function-issues.md)：五OpenSWX產品＋三測試allowlist，closed current-source association／resolver、canonical Git path/mode/raw bytes與Linux archive完整COPY proof、exact READY-full→build→唯一original-build_only→approved-plan chain；fixed READY ENABLED只讀proof與原FIRST/DAILY/full/abort PAUSED guards分開，fresh security/原approved12/current actor readiness，不新建或重套資源／IAM／Secret，零unchanged worker build/image。B19 `RD Implementation Ready／架構已定案`，implementation／provider／efficiency仍pending；先single RD與限定QA，再正常PR／requiredCI與同範圍corrective release／正常取消讀回。DEV117 QC內含actual abort/boundary/typecheck/isolatedbuild計證，不重複standalone成功checks。

[Root B18 actual readback](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B14/release/B18-root-final-r4-bounded-readback.json>)／[Luna QC](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B14/release/B18-independent-luna-final-source-qc.json>)／[QC scope correction](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B14/release/B18-independent-luna-final-source-qc-wording-correction.json>)／[B19 accepted main＋annexes](<C:/VIBE CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/production/A17-B14/release/B19-root-accepted-contract-annexes.json>)。使用Sol／平衡與獨立Luna；單一AI-PDM，禁止cross-project／sibling release input。7 issues／29 groups／整體NOT_ACCEPTED、F-01F USER_PRODUCTION_VALIDATION_PENDING、supplier DISABLED_DEFERRED、歷史UI FAIL／four-pair 8CAD NOT_RUN不變；下方歷史CURRENT不能作新施工入口。

## DEV-122 HISTORY_ONLY（2026-10-07；B13 已發布，排程時間驗證拒絕，B17 窄修復）

PR234 已合併至 main `fb5dba8269e8f664acae5b69a47a5c58684b28e9`；已核准二項 prebuild IAM 實際套用，計畫恰二 create／五 no-op。B13 owner `37593373429` 十階段成功，正式 `ai-pdm-prod-06cc9e8ba15d` 100%／0 tags；migration 為既有 32 筆 replay、零新 apply。R15 worker READY、reader v1／registry v3 原值重用。這些發布證據不等於 CAD 自動處理驗收。

啟用後 08:50／08:55 UTC（台北 16:50／16:55）自然排程實際 HTTP403，固定 Google 簽章／claims／目的地後才到 `schedule_time` gate。現有 parser 只接受 `Z`；Google HttpTarget 明訂 RFC3339 UTC offset，已確認格式契約缺口，但實際 HTTP header 值仍 UNKNOWN，不能把 offset 推論當實際根因。原始 B13 失敗與未完成 UI 保留。R16 固定 pause 已 PASS，佇列保留，沒有手動 CAD run／取消／新增工作。

B17 唯一產品差異為既有 auth.ts 及 auth.test.ts：嚴格日曆／時間／offset 語意、Z 或 ±HH:MM，拒未知 `-00:00`／無時區／list／非法日期／leap second；1..9 位小數以整數奈秒比較原 -60000..+5000 ms 時窗，越界 1ns 也拒。保留真 RSA、固定 issuer／aud／sub／email、POST／path／no-cookie、Host／runtime 與 await 後取 clock。診斷只保留原 schema／reason 並增加封閉 category（MISSING／FORMAT／INVALID_TIMESTAMP／TOO_OLD／TOO_FUTURE），不輸出原始 header／token／cookie／claims。IAM／Secret／worker／schema／排程頻率不變。

本地 focused 18／18、lint 與六項 release 檢查已實際 PASS。Luna 初次來源審查 PASS，依其 evidence gap 補 empty present header／second61／非法 fraction 與 offset 表格案例；空值維持 MISSING 拒絕，不修改產品。補齊後 focused18／18、lint／typecheck 實際 PASS；最終獨立文件／證據 QC 與新來源 PR／main CI／發布待執行。原六項證據以未變的 auth／release／build code 與 fixture 保留，原 raw log 不改寫。

PR235 初次 source `9ce5904690e0ba1320b00bc3cda90f47ae8b41f5` 的 CI `37602330878` 實際 FAIL：route-classification 仍檢查舊 `scheduled` 毫秒字串；PostgreSQL cutover／lint／continuous 通過，後續 release artifact step 未跑，未 merge／未 deploy。B17 r2 將同 repo 的既有 `scripts/qc-dev-121-route-classification.mjs` 對齊嚴格日曆／offset／奈秒時窗與 safe clock，保留 Google／identity／exact route gate；auth 與其測試 byte 不變。gate 語法／完整305 method路由分類／20項記憶體副本安全斷言移除驗證實際 PASS；失敗 helper 的重疊字串 first-missing 期望已修正並保留失敗及完整清理紀錄，產品 byte 未變。最終獨立 QC／新 head CI／發布待執行，舊 CI 失敗 evidence 保留。

QA r2 PlanSHA `8123423baee7ec9f689328fe99311611baba2ef9b5bd1f2eddd71cccf533bdc8`。須聚焦 real-RSA／installed Next adapter 及六項既有 release 檢查、獨立 Luna QC、正常 PR／required main CI，再以 fresh source-bound build／bootstrap／full capsule 續行。新來源的自然 */5 tick、四工作八 CAD／99 儲存值、桌面／窄版／動畫／reduced-motion 仍待實跑；既有帳號限定。歷史 UI 觀察中斷後已證原 PID 不存在；重用 PID 不碰，own temp 清理與 governor 登記追蹤另存證。

native F-01F 仍由使用者正式驗證，供應商回覆停用延後，原 7 issues／29 groups 與整體 NOT_ACCEPTED 不變。[B17 受控修復與證據](qa/DEV-122-openswx-schedule-time-remediation-2026-10-07.json)。

## DEV-122 HISTORY_ONLY（2026-10-07；B16 補權續接相容性修正，正式套用待執行）

本節優先於下方歷史續點。人類已明確核准兩項 prebuild 補權並要求沿用現有測試帳號；PR234 第一輪 exact-head CI 已通過，尚未 merge／apply。套用前確認既有 DAILY fresh IAM 檢查會把新增 binding 算入 unrelated hash，故先補同範圍相容性修正，不把舊 hash 或 receipt 改寫成新結果。

只有 immutable human approval、正式 main source-lock、exact 原四份 IAM source＋新 tf 的 Git hash、恰七項 Terraform 計畫／saved binary／request、實際 before／after provider readback 全部一致才接受續接。原五項必須 no-op，新兩項僅 create／no-op；保留 before／after 原始 policy hash，AFTER 移除完整唯一 verifier 新 role row 後必須回到原 sealed raw hash，其餘 IAM 漂移仍拒。正常 bootstrap／replay 每次 fresh 驗原五項及新 role 的兩項權限；full owner 只沿 sealed chain 驗證，不新增 IAM 讀取權限。

新 ref 僅 DAILY_REFRESH 可顯式輸入，封存於 resource readback／provenance 並沿後續 DAILY／full 繼承；FIRST／pause 注入、explicit 與 inherited 不符、錯來源／approval／binary／policy、額外 member／condition／binding／permission 均拒。補權為 prepare 前置，不依賴尚不存在的新 workerBuild；producer 先讀回 protected main PR／required CI／protection 再 source-freeze，owner prepare 沿既有規則重新驗官方來源。

本次四檔產品 focused 73／73、continuous 139／139 及六項 DEV117 檢查實際通過，task-owned PID／temp／容量 lease 已清理；這只證明本地控制流程。SOURCE_SNAPSHOT：獨立 Luna QC、新 head PR／main CI、fresh Terraform apply／readback、A16／R15／B13 發布與正常排程／四工作八 CAD／動畫 UI 尚待完成，不把第一輪旧 head CI當最終來源證據。

測試沿用既有帳號；原十二資源只讀、reader v1／registry v3不重發，082不重套。native F-01F 仍由使用者正式驗證，供應商回覆停用延後，7 issues／29 groups及整體 NOT_ACCEPTED 不變。[受控修正證據](qa/DEV-122-openswx-scheduler-identity-remediation-2026-10-07.json)。

## DEV-122 HISTORY_ONLY（2026-10-07；A15 prepare DENIED；二項補權已獲人類核准，PR／CI與套用待執行）

B14 prebuild continuation已正常PR233、PR／main required CI及Luna來源QC通過；官方來源`018e1369`，focused12／12、continuous139／139及六項DEV117 checks通過。r3 source QC的prepare漏查P2已補cold／cached每次fresh exact-tag Build list；原FORWARD_APPLIED與其他owner guard未變。原QC FAIL／欄位澄清各以新不可覆寫檔保留。

新A15的operator baseline／routine authority及immutable capsule實際成功，但保護workflow `37577933151` 的prepare以verifier回報DENIED；build與所有後續階段SKIPPED。已實際讀回prepare及後續收據皆404、exact A15 Build list空、control仍B11 FINALIZED／PRE_ACTIVATION_ABORTED；B10 `ai-pdm-prod-abd7ac77760c` 100%／0 tags、Scheduler PAUSED、durable queue保留。原owner log只保留DENIED，並未記錄被拒URL；Cloud Build list缺權由新增query與verifier實際IAM盤點確認，不冒稱完整request trace或已證實serviceusage另被拒。

最小提案只新增AI-PDM自己的Cloud Build custom role與verifier project binding：`cloudbuild.builds.list`及官方custom-role規則要求的`serviceusage.services.use`。已跑Terraform fmt／validate與既有own-state的readonly plan：2 creates／5 no-ops／0 updates／0 deletes，未apply。IAM作用範圍為jenfu-platform-prod全專案Build records（可能含其他應用的source／steps等建置設定）；程式exact failed-tag filter只限制查詢，不能冒充IAM隔離。這是超出原12資源＋5讀取IAM的新增範圍；人類已於2026-10-07明確回覆「核准 2 項補權，繼續上線, 使用現有個測試帳號」，限定上述二項資源／權限與AI-PDM正式發布；不把Source SHA／plan SHA刷新當成額外人類決策。

沿已核准的同一AI-PDM正式發布目標完成source PR／required CI、refresh frozen plan／apply／readback，再以新source-bound build/bootstrap/full capsule續行；原12資源／5IAM只回讀，reader v1／registry v3不重發。A15失敗capsule不冒充新source成功。使用現有測試帳號，不建立帳號或調整能力；正常排程／四工作八CAD／動畫UI仍未完成；native F-01F由使用者正式驗證，供應商回覆停用延後，7 issues／29 groups與整體NOT_ACCEPTED不變。

[實際發布失敗與唯讀補權提案](qa/DEV-122-openswx-scheduler-identity-remediation-2026-10-07.json)。

## DEV-122 HISTORY_ONLY（2026-10-07；B08 已上線，固定排程身分修正中）

本節優先於下方歷史續點。PR228 官方來源 `312be7e8` 的 B08 owner run `37537820569` 全流程 SUCCESS；migration 082 已套用一次、正式 `ai-pdm-prod-7af5f15c8803` 100%／0 tags，原十二資源 readback-only、五 IAM no-op／前後不變、reader v1／registry v3 重用。R09 finite 自測與 sealed activation READY 通過，但第一次實際排程返回 503 `OPENSWX_SCHEDULER_NOT_CONFIGURED`，未派送正常 CAD；READY 不代表排程曾成功。實際 IAM 回讀固定 dispatch 帳號 uniqueId `107606630865191707245`，並確診缺少環境設定。已用原固定 pause helper 暫停唯一 Scheduler，原佇列保留。

修正限 auth 模組的 compiled exact subject default 與 RSA regression；固定 email／audience／sub 聯結及簽章、expiry、時效、cookie／reader／未知身分拒絕均保留，不改 release adapter、IAM、資源、憑證或 migration。8-CAD 首次 harness 把八個檔案放入同一工作，但既有一份 2D／一份 3D 主檔替換規則只保留最後兩份；正常頁面兩來源 GET200，harness 已替換來源 GET403 是正確歸屬拒絕。將依既有規則分四工作驗證，沿用現有 pair／job，不重排。[實際發布、故障與修復證據](qa/DEV-122-openswx-scheduler-identity-remediation-2026-10-07.json)保存每次 FAIL；19／19 RSA default-path／dispatch 回歸、聚焦 lint 與 app typecheck 通過，own 程序／暫存已清理；獨立 QC／normal PR／required CI／新 immutable build與full release／正常排程與8-CAD驗證待完成。完整原生 F-01F 由使用者正式驗證、供應商回覆停用延後、整體 NOT_ACCEPTED。


## DEV-122 HISTORY_ONLY（2026-10-07；A10 建置通過，五項 IAM 完整名稱修復）

本節優先於下方歷史續點。PR227 官方 main `87e01223` 的 required CI 與 A10 protected build-only 均 SUCCESS，app／worker 建置及原安全 gate 通過。五項 IAM 來源刷新在 apply 前被 `OPENSWX_IAM_PLAN_INVALID` 拒絕；實際 NO_APPLY 計畫五筆全為 no-op，前後 IAM 完全相同且 request／plan／final 回執均未建立。唯一差異是同一固定 Job 的名稱由短名變為完整 resource name。修正只允許 exact address/name 的原短名或 frozen project/location/job 完整名；原五地址、帳號、權限、unknown 與 actions 等限制、Terraform／owner workflow／profile／依賴均保留。

42／42 既有 bootstrap／IAM 聚焦測試（含實際 no-op fixture、21 種漂移拒絕及已存在 IAM 的保存計畫／回讀／零 Terraform 重放）通過，专屬程序／暫存已清理；[修復與失敗證據](qa/DEV-122-openswx-iam-canonical-name-remediation-2026-10-07.json)與[限定 B10 契約](specs/DEV-122-openswx-release-readback-iam-contract-2026-10-06.md)保留原失敗及 A10 成功建置。新來源獨立 QC／normal PR／required CI／build／來源回讀仍待跑；原十二資源僅回讀、五 IAM 原範圍刷新、reader v1／registry v3 重用，再接 082／完整發布與正常 8-CAD UI。正式仍 `ai-pdm-prod-5c8854b292a1` 100%／0 tags、Scheduler PAUSED；F-01F 由使用者正式驗證、供應商回覆停用延後、整體 NOT_ACCEPTED。


## DEV-122 HISTORY_ONLY（2026-10-07；原生套件安全證據已更新，正式發布待新來源 CI）

本節優先於下方歷史續點。PR226 官方 main `10110697` 的 A09 app 建置成功，但兩筆 GCC 評估仍綁舊 sharp/vips 指紋，因此既有 gate 以 `GCC_APPLICABILITY_EVIDENCE_INVALID` 停止；worker build、082、candidate 與 traffic 未執行。已完成限定 AI-PDM 的新 source closure：28 份來源／5 份固定補丁／4 份 npm 原生成品與實際映像逐一對上，570 ELF／288 canonical 中 284 未變、4 項升級，載入閉包的 10 個共通檔案未變。新收集與沿用歷史測試分開記錄；R66b 的 FAILURE_PARTIAL 保留，9／9／3 歷史配置測試未重跑。

獨立 Luna evidence QC 通過，五份 content-addressed 自有評估物件已發布並逐位元組回讀；僅更新兩個既有 policy 的 4／5 個引用欄位，驗證器、CVE／owner profile、門檻與 raw HIGH 掃描均未改動。既有聚焦測試通過，專屬程序／暫存已清理；詳見[本次原生安全證據續點](qa/DEV-122-native-applicability-renewal-2026-10-07.json)與[限定續接契約](specs/DEV-122-openswx-release-readback-iam-contract-2026-10-06.md)。下一步是正常 PR／required CI、新來源 app／worker build 與原安全 gate，原十二資源僅回讀、原五項 IAM 僅 no-op／來源回讀，reader v1／registry v3 重用，再接 082／完整 app-owned 上線與正常 8-CAD completed UI。正式仍 `ai-pdm-prod-5c8854b292a1` 100%／0 tags、Scheduler PAUSED；新來源發布及正常 8-CAD NOT_RUN，完整原生 F-01F 留由使用者正式驗證、供應商回覆停用／延後、整體 NOT_ACCEPTED。

## DEV-122 HISTORY_ONLY（2026-10-06；五項補權已套用／R06 通過，來源修復及獨立 QC 通過）

本節優先於下方歷史續點。PR225 已正常合併至官方 main `f1940bb9`，PR／main required CI 均 SUCCESS；A08 受保護 prepare／build 完成，app 與 worker 建置成功，worker raw HIGH／CRITICAL=0。已核准五項唯讀 IAM 實際 APPLIED。R06 原十二資源僅唯讀銜接，bootstrap 與 PAUSED／drained 均 PASS，reader v1／registry v3 原值重用，沒有重發。B05 在本地 runtime-config prerequisite 因 `OPENSWX_IAM_SOURCE_READER_REQUIRED` 停止，未產生完整 capsule；082／candidate／traffic 未執行，既有正式 revision `ai-pdm-prod-5c8854b292a1` 維持 100%／0 tags。

此次修正共用 producer 兩處既有 `readWorkerSource` callback 傳遞，並以最多八層、唯一 immutable bootstrap ref 的完整前序證據續接 completed-FIRST；每筆 inherited execution 須各自驗證來源／成功終態／template／時間／receipt 與現行 exact inventory，任何多出、缺少、active、unknown 或漂移立即停止。沿用原 sealed v1／v3 及最初發行權限時窗，不重套原十二 Terraform、不增加人類或 owner actor 權限；新來源須正常 PR／required CI／fresh capsule，新五資源僅 create／no-op 的原授權套件。詳見[續接架構契約](specs/DEV-122-openswx-release-readback-iam-contract-2026-10-06.md)與[此次修復續點](qa/DEV-122-openswx-producer-continuation-2026-10-06.json)。來源 67／67 mock（含兩個實際 producer caller 與第三來源續接／拒絕／重放）及 targeted ESLint 通過，own runtime／暫存已清理，獨立 Luna source QC 通過且無未解 P0／P1／P2；新來源 required CI／正式發布待執行；正常 8-CAD completed UI 尚 NOT_RUN，完整原生 F-01F 留由使用者正式驗證，供應商回覆停用／延後，整體 NOT_ACCEPTED。

## DEV-122 HISTORY_ONLY（2026-10-06；Job PATCH API修復／40 mock PASS）

PR222官方main9240b84b之A06受保護建置、actual Git LF封存與worker raw HIGH/CRITICAL=0通過（run37426847261）。R04十二資源唯讀銜接APPLIED；原reader v1已恢復、registry v3沿原R03 credential root成功建立，Job因不支援updateMask query被400拒絕，仍舊selftest/PAUSED/零execution，082/candidate/traffic未跑。actual validateOnly比較證明bad query400、合法query200、Job前後完全不變；原FAIL/回執保留。此次[修復證據](qa/DEV-122-openswx-provider-readback-remediation-2026-10-06.json)只改合法Job PATCH、fresh etag與六項既有metadata原值保留/回讀；explicit priorBootstrapInputRef FIRST bridge沿用嚴格helper核對已sealed v1/v3，不重發憑證或重套Terraform。40/40 mock通過且own runtime/temp已清理；獨立Luna source QC已通過；新head required CI待驗。正常completed CAD UI與修正後正式Job仍NOT_RUN，F-01F由使用者正式驗證、D122-07停用、7 issues/29 groups與整體NOT_ACCEPTED不變。

## DEV-122 HISTORY_ONLY（2026-10-06；部分憑證發行回讀修復／36 mock PASS）

PR221官方main19552e3f的A05受保護建置／實際封存／worker raw HIGH/CRITICAL=0通過（run37421000474）；R03十二資源唯讀銜接已APPLIED，不重套Terraform。R03 bootstrap在reader token v1已建立後因putJson無parsed value失敗；實際hash-only原latch與v1 hash/30s時窗吻合，registry仍v1/v2、舊selftest Job、PAUSED、零execution，082／candidate／traffic未執行。此次[修復證據](qa/DEV-122-openswx-provider-readback-remediation-2026-10-06.json)改DEV122專用write helper從驗證bytes解析value，並以原immutable input限定恢復v1、只發剩餘registry；global transport／TF／IAM／worker來源不變。36/36真實回傳格式mock通過，own runtime／暫存清理已驗；獨立Luna來源QC已通過，新head required CI待驗。原FAIL／A05／R03證據保留；正式completed UI待實跑、F-01F由使用者正式驗證、D122-07停用、7 issues／29 groups与整體NOT_ACCEPTED不變。


## DEV-122 HISTORY_ONLY（2026-10-06；A03 build/security 通過，provider 權限查詢修正中）

PR219 已正常合併至 8f25b0a1a5f42c63e6e20d1e48bd44dd91a9a775，PR／main required CI 通過。A03 owner run 37410760255 與兩映像建置成功；worker 精確 digest e9194d35…a59eacc 的 raw HIGH／CRITICAL=0，實際 Linux static-zlib／ldd／APK 移除與隔離自測成功。僅證明 build/security readiness，未證明正常 CAD 或 UI。

十二資源 Terraform R01 已執行且不重套；PR220官方main84f08dbc之A04受保護建置、實際封存與worker raw HIGH/CRITICAL=0通過（run37417618753）。R02唯讀FIRST銜接在PAUSED Scheduler省略retryConfig時被strict比較誤拒絕；未發numeric version、未執行082、未建立candidate或切流。此次[provider readback修正](qa/DEV-122-openswx-provider-readback-remediation-2026-10-06.json)僅按官方語意接受actual省略zero retryCount/maxRetryDuration，同時拒絕null/非zero/invalid limit，並要求既有Terraform之Etc/UTC exact；desired/policy/profile/TF/worker source不变。31/31聚焦mock通過，own程序/暫存已清理；獨立Luna source QC已通過；新head required CI待驗。R01/A04/R02失敗原始證據保留。兩numeric bootstrap、082、正式切流及8CAD completed UI仍待實跑；F-01F由人類正式驗證、D122-07停用、7 issues/29 groups与整體NOT_ACCEPTED不變。

人類既有「核准, 請接續」及本次容量風險授權持續有效。下一步為修正來源的 normal PR／required CI、重新凍結與 build，先核對既有12資源，再接 numeric bootstrap、082與 app-owned 上線。正式仍 R4；新 credential versions／082／切流及 completed 正常UI皆 NOT_RUN，F-01F由使用者正式驗證、D122-07停用與整体NOT_ACCEPTED不變。下方續點為歷史，不再當目前操作佇列。

## DEV-122 Cloud Run 部署續點（2026-10-06；已授權，worker 安全修補／正式驗證中）

人類已核准原十二個限定資源、兩項 numeric credential versions、自有082 forward-only migration及同一AI-PDM app-owned上線；另接受本次固定Terraform provider安裝容量風險。授權只限 AI-PDM／jenfu-platform-prod／asia-east1／ai-pdm-prod，禁止跨專案；精確來源、映像、plan及capsule依執行重綁，安裝前仍需fresh容量結果。

PR218已正常合併至caa34a39607fa8a51b7d1b7dc38cec49bc80f254，required PR／main CI SUCCESS。A01在archive join安全停止，provider位元組回讀已定位並修正Windows換行／gzip差異；A02兩個Cloud Build SUCCESS，但worker映像有17項raw HIGH／CRITICAL，ARTIFACT_POLICY_FAILED，未建立新資源／Secret、未跑082或切流。正式仍為R4／ai-pdm-prod-5c8854b292a1。

[本次worker安全修補](qa/DEV-122-openswx-worker-security-remediation-2026-10-06.json)只更換finite-worker的固定musl建置／執行鏈，靜態連結作者已修補zlib並保留SPDX／license／實際套件DB；歷史CLI及嚴格scan不變。四個既有測試44案：43 PASS、1 Linux限定SKIP、0 FAIL；專屬程序與暫存已清理。這些不證明新Linux成品或CAD結果。獨立Luna來源QC已通過；下一步是normal PR／required CI、新來源Cloud Build／scan，再續已核准資源及發布；completed-result正常UI仍NOT_RUN，完整F-01F由使用者正式驗證，D122-07維持停用，7 issues／29 groups與整體NOT_ACCEPTED不變。

<details>
<summary>HISTORY_ONLY：PR218合併前與原資源待授權續點；以上 current 取代施工指引</summary>

## DEV-122 Cloud Run 部署續點（2026-10-06；本地 QC／建置通過，新增雲端資源待授權）

CURRENT PR218 相依套件修正：第二次 CI37398155430（head5f4e481）Cutover SUCCESS，Production Slice QC 在 production dependency audit FAILURE，lint／後續建置未跑；原始失敗與 provider 回讀保留。依官方修正版只更新 lockfile 中 source-map-js 三欄位1.2.1→1.2.2，其餘套件紀錄、package.json及前66檔未變；新[67檔來源](qa/DEV-122-openswx-phase2-pr218-source-freeze-dependency-v3-2026-10-06.json)與[Luna來源核對](qa/DEV-122-openswx-phase2-pr218-dependency-independent-qc-2026-10-06.json)綁定本次候選。實際 lockfile production audit code0/high與critical0，task cache／child已清理；本機node_modules未更新，尚未宣稱新套件安裝或建置PASS。下一head required CI／build待跑；舊63檔full-r4只屬原來源，Cloud資源授權、完成結果UI、人類F-01F與整體NOT_ACCEPTED邊界不變。

HISTORY_ONLY PR218 lint 修正：首次 CI37395720942 的 Cutover SUCCESS／Production Slice QC 在 lint FAILURE 保留；只將 auxiliary-job.test.mjs 的 mock source 字串變數 module 改名 moduleSource，斷言與產品行為不變，targeted ESLint 已 PASS。[修正後66檔來源](qa/DEV-122-openswx-phase2-pr218-source-freeze-lint-v2-2026-10-06.json)為下一次 CI 候選；舊63檔中61檔未變、main設定頁 auto merge 與此測試更名為兩個差異，owner20 hash 未變。合併後正常 worker／build 驗證待本次 exact PR head CI，Cloud 權限與人類 F-01F 待決邊界不變。

HISTORY_ONLY PR218 main 整合來源37a9578：保留最新官方 main 9b446d498 的 DEV-121 設定唯讀角色頁與正式結案；文件地圖衝突只合併兩方段落。原 63 個凍結產品檔案有 62 個 hash 未變，production-slice.ts 自動整合兩方既有 guard，另三個設定頁／測試檔與官方 main blob 一致。[合併來源凍結](qa/DEV-122-openswx-phase2-pr218-source-freeze-2026-10-06.json)記錄 66 個相關檔案；先前 full-r4／Luna 本地結案只屬其當時來源，合併候選的 required CI 尚待 exact head 結果。新 Cloud 資源授權、人類 F-01F 與整體 NOT_ACCEPTED 不變。

使用者指定 worker 使用 Cloud Run。現有 Windows COM Document Manager reader 無法直接在 Cloud Run Linux 容器執行；現行續點改優先評估免費MIT OpenSWX（Linux／三格式／文件與組態屬性為作者宣稱），仍需本案CAD實跑完整度證據；Datakit只留商用備案，不先購買。固定版本OpenSWX Linux/amd64 own映像已建置並綁31檔source／268個artifact與licenses；16項mapping與隔離tests通過。8檔native CAD（3PRT／1ASM／4DRW）皆讀出非空屬性、明示partial；4損壞／截斷樣本皆拒絕。原始8檔hash未變，14個task容器皆報exact清理；storedValue與effective組態可讀，type／raw／linked／evaluated及完整性仍unsupported或unknown；獨立Luna actual artifact QC已完成；12份暫存測試檔、14個容器、本機own映像與3個build CLI configs已驗明清理。使用者已選擇先開發唯讀輔助結果，Phase2本地契約RD Implementation Ready、cloud資源待具體授權。R2缺make與Windows授權匯出symlink失敗紀錄保留，未建立或部署Cloud Run worker，未新增 IAM／Secret；F-01F 仍待使用者正式驗證，7 issues／29 groups、整體未驗收。依[現行契約](specs/DEV-122-ai-pdm-internal-function-issues.md#cloud-run-部署指示與解析器相容性2026-10-05current優先於下方-windows-啟動契約)與[相容性續點](qa/DEV-122-cloud-run-worker-feasibility-2026-10-05.json)與[8CAD／4負向實測](qa/DEV-122-openswx-feasibility-2026-10-05.json)、[immutable建置／授權](qa/DEV-122-openswx-built-artifact-2026-10-05.json)與[獨立Luna QC](qa/DEV-122-openswx-independent-qc-2026-10-05.json)接續；下方 R03 Windows 主機待提供為歷史，不再作現行待辦。

HISTORY_ONLY／core-v1切片：[Phase2核心本地證據](qa/DEV-122-openswx-phase2-core-checkpoint-2026-10-05.json)：22項focused及3項native PostgreSQL通過，501外鍵與未種資料基線/隔離/防竄改/回執已驗；首fixture失敗保留，task-owned PG與62701已清理。API/dispatch/finite runner/唯讀UI及獨立QC接續中；Cloud child隔離、新資源與正式執行尚未驗證/授權，整體NOT_ACCEPTED。

2026-10-06 CURRENT 唯讀輔助結果續點：最終[63檔來源凍結](qa/DEV-122-openswx-phase2-final-source-freeze-2026-10-06.json)與[QA計畫](qa/DEV-122-openswx-phase2-validation-plan-2026-10-05.json)為本地候選；context-owned單CTA不需DM session，human POST僅提交status-only job，Scheduler自動派送。最新獨立QC已涵蓋47項API／dispatch／UI契約、7項current-work ownership與14項bootstrap／15個錯配變異；各結果只證明對應來源切片。正常Principal API的建立→CAD/PDF上傳→GET／enqueue／重複提交，以及home→Drawing列表→workspace的桌面1440／窄版390等待與取消操作已有本地實測；completed結果正常頁面與正式published authority仍未驗。原生SQL重驗3項／505真外鍵通過，DM表列不變；PG／Next／browser已驗明停止與埠釋放，兩根primary SQLite僅確認ABSENT。獨立Linux成品QC已讀驗同8CAD／10個自有容器均驗明移除，儲存值均partial且hash未變；計算值／公式／型別與完整性缺口保留，child syscall隔離不冒稱namespace／同UID檔案隔離。134項發布契約與6項abort已實跑通過；首次隔離副本漏Dockerfile的133通過／1 ENOENT失敗保留。

CURRENT 獨立驗證索引：[47項契約切片](qa/DEV-122-openswx-phase2-independent-qc-2026-10-06.json)、[current-work owner切片](qa/DEV-122-openswx-phase2-current-work-owner-independent-qc-2026-10-06.json)、[owner bootstrap來源與回放](qa/DEV-122-openswx-owner-source-independent-qc-2026-10-06.json)、[Linux成品與8筆partial CAD](qa/DEV-122-openswx-phase2-independent-artifact-qc-2026-10-06.json)。各紀錄保留自己的來源、首次失敗與適用範圍；不得加總為整體DEV完成。

CURRENT 最後本地 owner checks 已通過：[本地結案與證據索引](qa/DEV-122-openswx-phase2-owner-build-local-closure-2026-10-06.json)綁 full-r4 aggregate 119、abort 6、DB boundary、typecheck、isolated build PASS；134 continuous 僅沿用相同凍結來源的既有 PASS。獨立 Luna／max 逐檔核對 2182 檔與 166 個 freeze comparisons，並確認兩暫存根、三 junction、task-owned process／listener、Governor runtime／lease 已清理，共用依賴保留。建置 artifact 已依 isolated helper 清理，不能當成保留的部署映像；ENOENT／ENOTCONN 失敗歷史不改寫。人類選項 1 僅接受原 session／operation 的 C: 25 GiB 單次風險；容量底層仍 BLOCKED，非一般容量或 Cloud 授權。

下一步為[新增正式資源與上線範圍核准](C:/VIBE%20CODING/AI_PDM/output/qa/dev-122/openswx-phase2/owner-checks/cloud-resource-production-approval-plan-2026-10-06.md)：十二個限定 Terraform addresses、兩項 numeric credential versions 與自有 082 forward-only migration 尚待該批明確授權；Terraform init／plan／apply、Cloud worker 正常執行與 completed-result 正常 UI 皆 NOT_RUN。B 方案保留文字 project ID 並核預期 number；首版依 CURRENT A build_only→normal bootstrap→B full→normal activation。F-01F 完整原生屬性由使用者正式驗證；7 issues／29 groups、整體 NOT_ACCEPTED；本段為提交前證據，後續 Git 狀態依提交收據，不替代正式驗收。

HISTORY_ONLY／corrective-batch2前SQL切片：[Context-owned新版原生SQL證據](qa/DEV-122-openswx-phase2-context-checkpoint-2026-10-06.json)：新版082 exact SHA `9f4ff68f…c8000`、3 native tests及505真外鍵通過，四typedcontext／optional session／防偽造／same-company／single receipt已驗；未種資料基線先通過、lawfulfixture與原DM全列前後不變。Task-owned PG／62702／暫存cluster已清理。只適用凍結SQL subset；normal UI／最終獨立QC／Cloud與完整native CAD仍待各自驗證，整體NOT_ACCEPTED。


</details>

## DEV-122 一次提交金鑰流程（2026-10-05；R03 已部署，待使用者 CAD 驗證）

一次提交後自動測試、啟用與精確服務版本套用確認已部署：R03 owner run [37286616142](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37286616142) RELEASED／FINALIZED，100% ai-pdm-prod-7e169d142ba7、0 candidate tags；官方來源 aacd16a461dec3fca0ac27d2b178939211c5b055（PR211 正常合併），PR／main required CI 均 SUCCESS。170/170 unit、5/5 worker transport、34/34設定、134/134 release tests；isolated PG／正常 Settings UI 1440與390px控制流程及restart七表不變已驗，Luna來源／21張畫面與最後fixture QC無P1/P2。080正式1 applied／29 replayed／ledger30，舊migration prefix未變；B配置與既有三own資源沿用，無新增IAM。真key／CAD與常駐worker未冒稱PASS，R03 Windows launcher已交付；現行 Cloud Run reader 相容性依上方續點處理；F-01F由使用者正式驗證，7 issues／29 groups、整體NOT_ACCEPTED。閱讀[追加契約](specs/DEV-122-ai-pdm-internal-function-issues.md)、[本輪checkpoint](qa/DEV-122-secret-workflow-automation-2026-10-05.json)與[新正式結案](qa/DEV-122-secret-workflow-production-closure-2026-10-05.json)。


> HISTORY_ONLY／R02基線：**2026-10-05 本工作樹入口：AIPDM/DEV-122／R02 已部署**：100% ai-pdm-prod-52f421cb8db9、0 candidate tags，正式登入 smoke PASS；[結案與人工驗收界線](qa/DEV-122-settings-production-closure-2026-10-05.json)。安全頁憑證 reauth 已完成及清理。設定 UI／真 key／probe／activation 與原生 CAD 仍待使用者正式驗證，F-01F NOT_RUN／7 issues／29 groups／整體未驗收。下方 DEV-121 R81 是其 owner 當時結案背景；當時 serving 以 R02 為準；現行 R03 依本頁最上方結案。單一 AI-PDM、禁止跨專案，其他 owner 修改保留。

> HISTORY_ONLY／B合併前工作樹入口：**2026-10-05 本工作樹入口：AIPDM/DEV-122／B方案**：codex/dev122-internal-functions；B方案已完成：PDM_GCP_PROJECT_ID=jenfu-platform-prod保留，另設PDM_GCP_EXPECTED_PROJECT_NUMBER=9536592944；named請求／numeric canonical回傳分開嚴格核對。clean受測HEAD165a53f0bbcfbb9e54049c191505147936fcfaee已整合官方main46438028。unit83/83（Google57＋Principal26）、static36/36、mock27/27、release134/134及六項必要release檢查（QC97、abort6、boundary、typecheck、isolatedbuild）PASS；獨立gpt-6-luna QC為B_LOCAL_QC_PASS_REQUIRED_CI_PENDING_THREE_RESOURCES_PENDING_APPROVAL。新B required CI待同一草稿PR207刷新，舊b89 CI僅歷史。A未套用、不再待配置核准；僅三項新增正式Secret／IAM待明確資源授權，未merge／apply／deploy。真key/probe/activation及CAD properties由使用者正式驗證；F-01F NOT_RUN，7 issues／29 groups不變、整體未驗收。 [最後QC](../output/qa/dev-122/DEV-122-gsm-b-final-luna-qc-2026-10-05.json)／[三資源計畫](../output/qa/dev-122/DEV-122-gsm-b-production-resource-approval-plan-2026-10-05.md)。單一AI-PDM、禁止跨專案；DEV-121/canonical owner修改保留。

<a id="dev-121-current-contract"></a>


<a id="dev-122-business-defects"></a>

## DEV-122：AI-PDM 內部功能缺陷集中處理

目前施工以本檔開頭 DEV-122 CURRENT 與 SPEC 為準：B36-R10 已正式發布，B37 mounted CUA 部分補驗已記錄；下一步補既有業務驗收缺口。NO084、user-owned native CAD、supplier 停用延期與 Whole DEV NOT_ACCEPTED 維持。下方為 HISTORY_ONLY。

2026-10-05 現行正式發布結果：R02 已由 app-owned V3 owner run [37262598122](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37262598122) 完成 RELEASED／FINALIZED；正式 ai-pdm-prod-52f421cb8db9 接收 100% 流量、0 candidate tags。官方來源 602413097ef27a203fe1e2beccac3166c6e2351a 來自正常 PR209 合併，PR／main required CI 均 SUCCESS。人類在本機安全頁完成既有 Firebase 帳號重新驗證，own numeric 6→7 與既有 GitHub production smoke Secret 更新成功；候選及 canonical 正常 SSO／authenticated probe 通過，匿名／撤銷 session 回 401。B 配置保留 jenfu-platform-prod 並另核 expected number 9536592944；三項已授權 own Secret／IAM 於 R01 APPLIED，R02 只沿用來源相容回執，沒有 historical workflow rotation apply。079 在 R01 已 forward apply，R02 0 applied／29 replayed／ledger 29。正式設定 UI 因工具限制 NOT_RUN；登入與 provider 證據不替代 key draft/probe/activation 或原生 CAD 屬性。這些由使用者正式驗證；F-01F NOT_RUN，7 issues／29 groups、整體 NOT_ACCEPTED。R01 401／UNKNOWN／安全中止證據保留。 [正式結案](qa/DEV-122-settings-production-closure-2026-10-05.json)。

HISTORY_ONLY／R01 中止後續點：2026-10-05 現行正式發布續點：R01 已安全中止於 verify：PR 207 正常合併至 697be61d51d105ec940ba594b57dac1c8f255ee6，required CI 37256330647 PASS；人類已授權並建立 exact SolidWorks Secret、add/access custom role、Secret-only runtime binding，provider readback PASS。Owner run 37258147467 的 prepare/build/migrate/candidate/entrypoint PASS，079 forward-only 已套用（1 applied、28 replayed、ledger 29），verify 因既有 smoke 憑證 Portal session 401 失敗。Recovery PASS／PRE_ACTIVATION_ABORTED，R81 ai-pdm-prod-ec2ae6647962 維持 100%，沒有切流。人類已選擇在本機安全頁輸入既有 Firebase 密碼；本輪只修復 reauth CLI 接受 clean detached exact official main，保留 source/repository、同 issuer/subject、Principal、fresh auth、numeric 6→7 與 readback gate。安全頁、憑證更新與重試發布仍 PENDING；401 根因 UNKNOWN，不能以版本輪替成功冒稱恢復。只限 AI-PDM／jenfu-platform-prod／asia-east1／ai-pdm-prod 及自有發布資源，禁止跨專案開發。真 CAD key/probe/activation/property 由使用者正式驗證；F-01F NOT_RUN，7 issues／29 groups及整體未驗收不變。 [R01 checkpoint](qa/DEV-122-settings-release-reauth-checkpoint-2026-10-05.json)。

HISTORY_ONLY／2026-10-05 B合併前續點：B方案已完成：PDM_GCP_PROJECT_ID=jenfu-platform-prod保留，另設PDM_GCP_EXPECTED_PROJECT_NUMBER=9536592944；named請求／numeric canonical回傳分開嚴格核對。clean受測HEAD165a53f0bbcfbb9e54049c191505147936fcfaee已整合官方main46438028。unit83/83（Google57＋Principal26）、static36/36、mock27/27、release134/134及六項必要release檢查（QC97、abort6、boundary、typecheck、isolatedbuild）PASS；獨立gpt-6-luna QC為B_LOCAL_QC_PASS_REQUIRED_CI_PENDING_THREE_RESOURCES_PENDING_APPROVAL。新B required CI待同一草稿PR207刷新，舊b89 CI僅歷史。A未套用、不再待配置核准；僅三項新增正式Secret／IAM待明確資源授權，未merge／apply／deploy。真key/probe/activation及CAD properties由使用者正式驗證；F-01F NOT_RUN，7 issues／29 groups不變、整體未驗收。 [最後QC](../output/qa/dev-122/DEV-122-gsm-b-final-luna-qc-2026-10-05.json)（Root保存獨立Agent原文，SHA256 628f6f88dda39ba883fb7adc145fa84d446f34fa39bea5bed8cf02891be31fc8）；[唯一待核准三資源](../output/qa/dev-122/DEV-122-gsm-b-production-resource-approval-plan-2026-10-05.md)。本輪只更新三份PM metadata，九項B產品hash不變；新CI綁最終head。

HISTORY_ONLY／B前CI fixture續點：草稿PR207已建立並attached，原head db8eb7832。run37232762876的DEV-012 Isolated PostgreSQL Cutover PASS，Production Slice QC原FAIL／owner artifact step SKIPPED保留。舊preview來源:memory: fixture缺content_hash／file_ext，補欄後12案例11P／1F顯示舊cross-company failed mutation期待與現行D05「other-company不變」及native job:null／full-row unchanged契約衝突。Luna只讀核定來源適用性修正，不改產品guard；同5案例第一case改完整preview_jobs row前後相等，其他scope／provenance／invalid completion拒絕保留。新preview-fixture-focused-85e07554830328b9實跑12／12、source不變、primary兩路徑仍ABSENT、PID／temp／Governor runtime已清理。原CI與11P／1F未改寫；只修test/schema fixture與metadata，待final Luna QC、更新同一草稿PR required CI。numeric修正／三項新資源仍未核准，未merge／apply／deploy；human F-01F NOT_RUN／7 issues／29 groups不變。

HISTORY_ONLY／B前設定入口與A提案：官方 main 已整合至7a8f156；未套用077 bytes未變改名079並接在078後，設定 exact gate／Principal capability fail-closed／provider狀態文案與三項B-only資源來源已準備。新增設定 focused85／85、release實際134／134（原wrapper reporter FAIL保留）、static/mock34+36+9與既定abort／DB boundary／typecheck／isolated build均有實際通過證據。078/079 native root／rollback回歸8／8；101 skip不算PASS。本輪正常設定UI在1440×900與390×844共2案例PASS，含導航／鍵盤／無overflow、允許與拒絕Principal、company隔離與空密碼／zero secret POST；原UI403 body未讀，另以same-session獨立HTTP核permission_not_granted，兩層證據不混用。163 own table rows前後相同；含nonce的snapshot hashes不同，不宣相同。原5cbd／941失敗與UNKNOWN不改寫；新e1c041c4f1bba741證據、source unchanged、inner/outer finally及fresh exactPID／port清理另列。唯讀native Terraform plan僅三create、既有83 read/no-op，state serial90／source不變；未apply。GCP canonical version使用數字project9536592944，現named env exact matcher存在合法response拒絕；最小配置修正兩次auto-review拒絕，来源未變，具體提案等待直接人類核准。新Secret/customrole/Secret-onlybinding亦待新增資源授權；先整理草稿PR，不merge／release GO或宣正式PASS。真key／probe／CAD properties由人類正式驗證，F-01F仍NOT_RUN，7／29分母不變。以下舊phase證據保留，不能覆蓋本續點。

狀態：執行中（設定入口已部署；F-01F 待使用者正式驗證）／整體未驗收；成熟度：RD Implementation Ready；架構定案：已定案（2026-10-04）；節點類型：開發點；計入交付：否。

現行 2026-10-05 人類指示授權修好 AI-PDM 金鑰設定入口並上線 jenfu-platform-prod / asia-east1 / ai-pdm-prod；原生 CAD 屬性明確由使用者在正式環境驗證，保持 NOT_RUN／整體未驗收。停止本機 key 實驗，歷史失敗／來源／清理不改寫。官方 main 528429913272ceb3e8d77bb0fcf30d450c6fb368 已有 Principal settings commands/probe 与 078；新來源先整合並保護既有修改。exact 三資源已另獲人類授權並由 R01 建立，R02 復用回執。以下本地-only、Production 未授權與 direct-module 輸入文字是原先 phase 的歷史背景，不能覆蓋最新人類指示。

唯一 CURRENT_CONTRACT 為 [DEV-122 本地開發契約與集中列表](specs/DEV-122-ai-pdm-internal-function-issues.md)。HISTORY_ONLY／初始本地授權邊界：當時人類授權完成單一 AI-PDM 本地開發，execution worktree C:/Users/user/.codex/worktrees/dev122-internal-functions/AI_PDM，branch codex/dev122-internal-functions，base HEAD 93b9b4cf67444d461aaa8934b8b1616537301b38。禁止跨專案開發；Production、遠端 DB、IAM、deploy 未授權。[移交紀錄](reports/pm/DEV-122-worktree-transfer-2026-10-04.md)與[收據](qa/DEV-122-worktree-transfer-2026-10-04.json)保留 24 dirty paths／19 candidate files／排除 hunk 的來源邊界，077 僅在 task-owned isolated PG apply／rerun 測試，live 未套用，不進 DEV-121 Production profile。

目前 Medium 本地 phase：D122-03 first_release；D122-04 Drawing major master 同步；D122-QA-01 測例修復與 AI-PDM 自有 isolated PG runner。D122-01/02 為歷史 resolved 回歸；D122-05 附件／worker 與 D122-06 procurement 500 留本 DEV 的調查→必要修正→本地驗收，不能任意改成 deferred 後把整個 DEV 標 Done。

下一 gate：final candidate 已凍結；97／97 focused cases、typecheck、2GiB bounded isolated build、DB boundary 均由 Luna 獨立 CLI QC 通過。Sol 完成 desktop 1440×900／narrow 390×844 的普通 Part 與 Drawing paired major／minor 正常退回→fresh 重送→核准，並逐 29 IDs 對照：28 組已有相符層級證據，F-01F native CAD customproperties 因隔離環境未配置合法 Document Manager 金鑰受阻。人類 2026-10-05 已確認有 key 且授權 J:/我的雲端硬碟/02_工作/00_雜項任務(進行中)/20260703 PDM開發 測試資料；依同 spec secure local credential closure，準備一次性 task-only password input，actual DPAPI draft→original native probe→activate→broker→CAD3 properties。正常 settings UI 不可達，fixture direct module 不冒稱 UI PASS；正式 gate/auth/deploy 不變。只補該既有用途及受影響下游，不貼金鑰、不擴測全套。7 issues／29 groups 不變，整體未驗收；identity／typed grants 是明示 local versioned seam，producer integration／joint／Production NOT_RUN。

驗收沿同一 spec 的 cases：ordinary edit 不發行；release-only Part 正常保存／送審／核准；major 同交易 canonical/master/pointer 一致而 minor 不發行；current grant／assigned reviewer／scope/CAS 拒絕與 native rollback/replay；正常 UI 操作、錯誤／資料 sanity／desktop+narrow；附件/worker 實際 bytes/output；procurement 真實 route／native hydration 與公司/權限拒絕。使用 task-owned PDM_DATA_DIR/PDM_REPOSITORY_DIR，seed 前 unmodified baseline invariants 與 fixture ledger，build primary before/after invariants，以及 verified PID/port/temp cleanup。

已知證據：[原始 QA](qa/DEV-122-canonical-lifecycle-deferred-2026-10-03.json)與所有 first-failure／UNKNOWN 原始收據保留。[本地續接收據](../output/qa/dev-122/DEV-122-local-rd-checkpoint-2026-10-04.json)綁定 final source、[29 組跨層 QC](../output/qa/dev-122/DEV-122-final-29-group-cross-layer-readonly-qc-2026-10-05.json)、[最後 UI QC](../output/qa/dev-122/DEV-122-final-ui99f2-readonly-qc-2026-10-05.json)及其[路徑更正](../output/qa/dev-122/DEV-122-final-ui99f2-path-correction-qc-2026-10-05.json)、[Luna CLI QC](../output/qa/dev-122/DEV-122-final-cli-luna-qc-2026-10-05.json)。三種 CAD 的 normal upload→claim/content→fresh Shell→complete→Principal preview/download 與三種 original recognition CLI 的 filename／partial 結果分列；檔名辨識沒有讀取 CAD 自訂屬性，Shell thumbnail 不替代 recognition。新 Part／Drawing 根號防漂移與交易故障回滾有 native 證據；原 BAD200、錯根號核准及 UI reader500／missing-key 的失敗紀錄不改寫。Applied migrations 未改；077 僅 isolated PG apply／rerun，live 未套用。Integrated daemon NOT_RUN／PDF preview Phase2 deferred；正式 procurement 500 根因 UNKNOWN，Production bytes L4 NOT_RUN。所有已登記本輪 PID／ports／temp／Governor leases 已由 owner 與獨立 QC 核對清理；primary SQLite 僅確認兩路徑前後 ABSENT，不宣稱有 PRAGMA 快照。

DEV-121 仍維護 verified Principal、scope／撤權、existing effect publish、防 fallback 與可靠發布安全；本 DEV 不移動其責任、不擴張共同 grant 分母。此輪未 stage／commit／merge／deploy，原 owner 工作樹及歷史受控證據保留。

- 2026-10-04：PM 將同一 issue spec 由 Brief Ready 提升 RD Contract Ready，補全 current scope、正常入口、observable acceptance、native isolation／fixture、候選 validation 與 stop conditions；功能及 production 結論未升格。


### 2026-10-06 保存草稿收斂（HISTORY_ONLY）

[DEV-121 主線收斂／原稿保存](qa/DEV-121-preserved-workspace-drafts-2026-10-06.md)：RECONCILED_HISTORY_ONLY。相關 runtime 已在 main 或已確認不採用；原始文件與程式 patch 保存供追溯，不是新的待開發或發布指令。本批不改變 DEV-121 正式結案，DEV-122 延期與其他工作樹原稿保留；必要 CI／review 以本文件 PR 精確來源為準。
## DEV-122#rd-permission — 2026-10-16 RD 圖號工作台權限獨立切片（LOCAL PASS，CI／Production 待完成）

本切片只處理優先項目 2。已證實 v7 `rd` 角色包含 `page:numbering.drawings.view` 與既有 create／update／submit，仍拒絕 approval；085 是未修改的 forward-only v6→v7 publication。新增 exact native selector 後，隔離 PostgreSQL 以同一 signed RD actor／grant／catalog 完成 permissions GET、實際 drawing workbench data 與 submit，approval POST 403 且零 lifecycle side effect；QA 圖號列表 GET 403 且零 side effect。專用案例 1/1 為 `LOCAL_RD_PERMISSION_PASS`，既有 catalog／migration、70-case Principal／workbench、DB boundary、route classification、current35 fixture、final-byte typecheck／isolated build 均已通過；required CI 尚待 PR。

產品共同失效機制位於 active catalog publication→effective grant→session→Principal evaluator，不在 UI 加例外。本輪沒有產品權限碼、catalog 或 migration 變更。正式 085 applied、active v7、真實 RD grant/session 與正式 UI/API 結果仍未知；不得由 local fixture 推定。若 085 未套用，需正常 app-owned full35 migration release，program-only／closed34／prefix33 不適用；若 v7 已 active 而 grant/session 失效，分別回到 OrgMaster assignment 或 Platform session 責任邊界，需另授權寫入。正式 migration／deploy／traffic／IAM／Secret／worker／Scheduler／資料修改均未執行。詳見 [B53 本機證據](qa/DEV-122-B53-rd-permission-repair-local-2026-10-16.md)。管理員辨識、PDF、supplier、原生 CAD 與其餘 DEV-122 工作保持暫停；whole DEV 仍 `NOT_ACCEPTED`。

2026-10-18 corrective CURRENT：production readback 已證 active catalog v6、085 absent、測試 RD actor active grant v13；目前圖號工作台 `permission_not_granted` 的第一個真正失效邊界仍是 catalog v7 尚未發布。full35 的 release 前置另被 worker recovery 接縫阻擋：current RELEASED app 是 program-only capsule，但其 worker 是 sealed retained READY activation，daily 失敗後 live Scheduler 為 PAUSED；舊 `PAUSED_APP_REPAIR` 錯把 app capsule identity 與 worker origin identity 要求為相同。修正集中在共用 artifact-reuse/readback validator，僅接受封閉 policy 與完整 retained-worker chain 精確回連 repair origin，並正規化 Job IAM binding 順序；新增 production-shaped 零 mutation fixture。完成 affected release checks、PR/CI/merge 後，以新 exact main 重產 immutable descriptor，再續跑 app-owned full35、085、candidate／verify／activate與同一測試 RD actor UI/API allow-deny。其他 DEV-122 項目不解凍，whole DEV 維持 `NOT_ACCEPTED`。

同日 C52 正式重試越過 program-only retained-worker 接縫後，下一失敗證實 repair 漏接 serving association 已封存的 numeric Secret-version IAM continuation；live Job/Secret bindings 與 source-owned receipts 一致，無須修改 IAM。corrective source 將該 continuation 從 serving capsule 單向帶入 PAUSED resource readback，v2 input 不可自選，replay 僅接受 legacy 或固定 policy-version-3 URL 的唯一一種。production-shaped fixture 以 distinct prior/current capsule、current lock、numeric Secret IAM 與 live PAUSED 55 秒雙讀通過；仍須新 PR/CI/merge 與 exact-main evidence，未執行 full35 下游 mutation。

PR #378 合併後 C53-R1 已成功發布 PAUSED baseline/security/association，但 descriptor publication 前因 retained READY descriptor 被錯用 current profile 驗證而停止；其歷史 profile 只有 owner deadline 差異，已先由 immutable origin chain 驗證相容。第三個 corrective 將 retained descriptor 與新 repair descriptor 的 profile authority 分離，並把 historical/current 不同 profile 納入完整 PAUSED fixture。C53-R1 保留為第一失敗，不重送；full35 下游仍 `NOT_RUN`。

2026-10-18 release-chain refactor 恢復點：正式 RD 發布依人類指示暫停。PR #378 已合併；PR #379 已在解決與 PR #380 的歷史 profile fixture 衝突、required CI 重跑通過後合併，現行 protected main 為 `5293bdeda4121d62bf4fa9997b0e37112cb62230`。最後正式 run [39126743555](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/39126743555) 已完成失敗，第一個有效錯誤為 prepare 的 `DEV121_OWNER_RELEASE_PROOF_REPAIR_JOIN_INVALID`；build、migration 085、candidate、traffic、rollback/recovery 均未執行，既有 B36 revision／100% traffic、ledger33、active catalog v6、測試 RD grant v13 與 PAUSED worker 狀態維持先前唯讀 readback。C54 immutable source／worker／intent 及本機證據仍在 `output/qa/dev-122/rd-permission-repair/` 與 own release bucket，不改寫。下一個未完成動作不是重試發布，而是在 `codex/dev122-release-chain-refactor` 將 source profile、installed migration history 與 release attempt 分離，移除 B14／32→33 的重複硬編碼並以 program-only source34／installed33→current35 的 production-shaped fixture 驗證；重構 PR／required CI 完成後交接，正式測試帳號驗收與 full35 發布仍待人類另行恢復。

同一恢復點的本機重構已收斂：共用 migration history 現分離 source／installed prefix／attempt，finalize 以 branded history＋current content 重新驗證 mode；PAUSED full evidence 不再重走已驗證 retained READY DAG。原始 source34／installed33→current35、不同 descriptor revision、deadline、Secret IAM continuation、unknown/retry/recovery 與 fail-closed 負向均由完整 QC 覆蓋；受控 `qc:dev-117:continuous`、catalog v7、abort、DB boundary、typecheck 與 isolated build 已通過。這些仍是 local/source evidence，不改變 run 39126743555、正式 catalog v6／ledger33／grant v13／PAUSED 狀態，也不授權或啟動 production。待本 branch 的 PR／required CI／protected-main handoff 完成後，第一個安全恢復動作仍是以新 exact main 做唯讀 ledger/catalog/test-RD-grant/worker readback，再由人類明示恢復正式 RD 任務。

交付 PR 為 [#381](https://github.com/jedchang0308-jenfu/AI-PDM/pull/381)；可執行來源 commit `87cf3e4941c76ca24b7a1e75ebd698f2955397d8`，本機證據位於 `output/qa/dev-122/rd-permission-repair/release-chain-refactor-local-2026-10-18.json`。required CI 與 protected-main handoff 依 PR provider 狀態決定；這一行不構成 CI 或 merge PASS，也不恢復 production。

## DEV-122#release-decoupling — 2026-10-17 CAPA-002 project rollout（本機 RD 完成／required CI 待 PR）

導入 project-wide changed-responsibility planner、affected test runner與 owner/CI routing；shared/unknown inputs保留 legacy full fail-closed。worker current/historical profile判定集中至單一 context，歷史 evidence仍綁 exact revision/profile bytes，不以 current HEAD隱式覆蓋。單一交付切片在 merge 前於同一 branch/PR 收斂 caller graph及 production-shaped fixtures，避免以反覆 merge/PR作為本機可發現缺陷的除錯迴圈。此項不執行production mutation，不改 DEV-122原分母；正式 RD、approval與未授權角色驗收仍 pending。

本機 checkpoint 見 `.ai-doc/qa/DEV-122-CAPA-002-change-scoped-validation-local-2026-10-17.md`；shared aggregate、DB boundary、typecheck、isolated build、lint及 upstream historical-mode 交集均已通過。此為 RD 自驗，不是獨立 QC 或 provider-required CI；PR checks 尚待執行。
