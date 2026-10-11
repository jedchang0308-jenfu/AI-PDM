# DEV-121 RD v7 ordinary worker evidence checkpoint（2026-10-11）

範圍：既有AI-PDM/DEV-121#rd-capabilities的owner-release corrective cycle；依賴DEV-122既有daily流程。Base官方main a16eaba2e5003d228fd4438599f8d84cd7ca2231，branch codex/dev121-rd-v7-worker-continuation；沿用本對話原worktree、完整AGENTS已讀、開始tracked clean，其他人的workspace及private output保留。Platform與OrgMaster來源未在本slice修改。

已證實source接縫：普通full35不能直接用跨source舊descriptor/operational receipts。既有artifact reuse只輸出program-only wrapper，DAILY_REFRESH receipt完成也沒有producer發布普通full descriptor。兩個positive fixture在原source各因missing descriptor REF而RED；不存在的正式帳戶或畫面文案不是此slice根因。

Diff：reuse producer另產current association-bound V2 build-only descriptor，移除所有歷史operational refs；existing DAILY bootstrap及same-input完成重播，將new bootstrap/preflight/pause及numeric credentials組成完整ordinary descriptor，在全部full evidence／PAUSED／all-terminal／actual selftest檢查後create-only發布。CLI只回immutable REF。FIRST、B35 closed34/effective33、085／Principal fence與既有auth規則不放寬；沒有新worker image、Secret或IAM操作。

未知發布獨立review曾指出P1：成功bootstrap後descriptor上傳未知被原catch恢復成prior Job，阻斷same-input重播。已修為成功bootstrap後獨立checkpoint，失敗保持selftest/PAUSED；exact URI可讀後由native bytes/hash/generation驗證adopt，零重送POST/PATCH/run。最終獨立gpt-6-luna xhigh只讀source review未見P0/P1，沒有執行雲端。

本機：五項新增tests＋既有source reuse→pause→bootstrap→ordinary owner pipeline聚焦6/6 PASS，零skip。涵蓋same-source完整鏈、readonly artifact reuse、same immutable input replay、source/prior/preflight tamper、ENABLED Scheduler與Job drift拒絕、unknown applied寫入adopt、三次暫時missing後保留checkpoint並在可讀後adopt零重送。完整continuous 285/285 PASS、owner Node regression 339/339 PASS，均零skip；native QC另含sharp contract與image-only驗證、v7 catalog generator 3/3、abort 6/6、db boundary PASS（22 governed files）、typecheck:app PASS及isolated build PASS（artifact/primary/cleanup=true）。原生LOCAL_CONTRACT報告 DEV117-S1B-20261011T104533133Z-FB7ED8C7 保存在private output；source snapshot涵蓋執行時的受控檔案，QA本頁結果後記不在該snapshot清單。建置沿用既有middleware/Edge Runtime警告，未修改無關程式；本機PASS不替代Production。初次wire fixture未含native LF及重播fixture重造deadline的失敗私下保留，修正fixture後通過；沒有更改產品guard。

正式分界：指定OrgMaster事故通知訂閱原設定恢复及candidate smoke v10已native APPLIED；後續OrgMaster owner十階段SUCCESS，fresh sealed canonical/terminal/traffic仍因指定SDKreauth失效未讀回。AI-PDM085 NOT_APPLIED／RD v7 NOT_DEPLOYED；runner build與0% static recovery只證明準備，未取得停寫/fence/migration/traffic證據。私有Production inputs、readbacks、logs不提交public repo。新兩fixture正常drawing/item edit/submit及approval拒絕NOT_RUN；Google延遲正式情境未證，本人DEFERRED_UNVERIFIED，指定歷史資料仍FK阻擋未刪且不擴大清理。

Runtime：本slice Node tests只用memory／原有task-owned temp，port=null；依賴採原canonical node_modules暫時junction，主要資料不seed。完整QC／isolated build由原native driver保護primary invariants及自身temp cleanup；Root於交付移除本slicejunction並讀回程序終了。worktree保留source與私下證據供protected release續接，cleanup owner Root。

## Reviewed LF release inputs corrective checkpoint

沿用 AI-PDM/DEV-121#rd-capabilities；本 corrective slice 從官方 protected main d3fc1bf72b3630f8a748746c40584e595d396dac 建立 codex/dev121-release-input-lf，tracked clean。readback IAM 的九個 sourceHash inputs 在 Git 為 LF，Windows core.autocrlf=true checkout 為 CRLF；native metadata executor 在 Terraform／provider operation 前以 SOURCE_NOT_FROZEN 拒絕。這是 source materialization 接縫，與有效授權、Principal 或應用 session 拒絕分開。

最小修正只在 .gitattributes 為 release-readback 的 Terraform／README、原 B35 核准 JSON 及兩個 secret-version-IAM execution files 固定 LF；不修改來源 SHA guard、IAM plan guard、任何 Terraform 或帳戶規則。暫時 rewrite-and-restore 的執行方法遭自動審核拒絕且未執行；本方案須 PR／required Windows CI／官方乾淨來源，再由 Git 全新 materialize checkout，不能把 dirty rewrite 當成發布來源。

Synthetic baseline 12/13（checkout assertion RED，其餘12 PASS），新增規則後全新 reviewed checkout 13/13 PASS：九個 raw bytes 與 Git blob SHA完全一致、i/lf+w/lf、每項eol=lf；無關文字仍CRLF。Git只切換attributes commit不保證重寫相同blob的既有檔案，因此fixture與正式下一步都使用新乾淨checkout。另以單byte竄改驗 native SOURCE_NOT_FROZEN、零Terraform／provider呼叫／immutable putBytes及putJson；兩個temp scope有精確父目錄與prefix清理，port=null。focused測試不使用雲端憑證；既有同套原生finite executor／unknown request replay不變。最終native QC Node 341/341、另一份 test:dev-117:continuous owner回歸285/285 PASS，均零skip，分母有重疊不相加；v7 catalog generator3/3、abort6/6、DB boundary22檔、app typecheck及isolated build PASS（artifact／primary／cleanup=true），sharp image-only contract／task temp cleanup PASS。LOCAL_CONTRACT報告 DEV117-S1B-20261011T142728552Z-6BBC143E 的source snapshot為605f9c6ab848ab3eaa08b586687582aba63ffc6399392034f913a6b19ebc73fd，QA本段是執行後結果後記；不將它當成provider或Production驗收。

正式readback分界：OrgMaster已RELEASED／canonical正常SSO及reload PASS／100%；AI-PDM原事故訂閱ACTIVE及runner rotation APPLIED，但只是發布前置修正，085／RD v7仍NOT_APPLIED／NOT_DEPLOYED。既有worker映像、runner build provenance及paid build證據沿用，不因attempt或source-doc差異重建同輸入。完整Production證據只在private bucket／ignored output；兩fixture新RD能力、Google正式延遲完成及Dani本人仍未證，歷史外鍵處置不擴張。本頁不是Production驗收。

## Daily metadata evidence propagation corrective checkpoint

沿用 AI-PDM/DEV-121#rd-capabilities，base protected main b79ace00edbde3caf962ab26d415157966fee527；branch codex/dev121-daily-metadata-continuation，原工作樹開始 tracked clean、適用 AGENTS 已完整讀取。LF source materialization 修正已透過 PR272 正常合併；新乾淨官方 checkout 的 metadata executor 與 worker reuse 已完成 native proof，但尚未 pause／bootstrap／migration／candidate／traffic。Production 詳細證據只存 private bucket／ignored output。

兩個 synthetic true RED：已驗證 metadata continuation 在 resolver 被丟棄，daily resource pre-read 精確 policy 檢查回 OPENSWX_RESOURCE_READBACK_INVALID；program-only full descriptor 錯用 daily pause 時竟先執行 lifecycle mutation，沒有 early rejection。此前 fixture 缺 dependency、舊 activation／canonical／runtime hash joins 的失敗屬 setup，不能當作產品 RED；補齊 memory-only 封存圖後才確認以上兩項。

最小 source diff：resolver 回傳既有驗證後的 context；daily pre-read、自測後 readback 與 same-input replay 全部交給原 collector 再驗，resource provenance／readback 封存 exact continuation 與 source-lock refs；replay 核對相同 descriptor graph、既有 IAM 及 metadata binding。獨立 review 另指出最終 full-evidence reader 尚未自行核對新 metadata refs；hash-correct 不符 sealed readback／bootstrap 的 negative 先 true RED（Missing expected rejection），補 exact source-lock／continuation equality 後 GREEN。REUSE_VERIFIED 的 pause／bootstrap 在任何 lifecycle write 前必須是 build_only；activate 原分支不變。沒有新增 input schema、IAM／Secret／資源或資料權限；role／member／source／hash／policy guards不放寬，FIRST及program-only路徑保持原界線。

Focused 5/5 PASS，零skip：actual READY metadata producer/resolver、ordinary reuse→pause→bootstrap→full evidence→same-input replay，以及錯 descriptor、缺證據、錯 hash／source join、live policy drift 拒絕。Replay無 lifecycle writes／新publication；政策漂移後再次拒絕。追加consumer前 native QC343/343、continuous287/287、catalog3/3／abort6/6／DB22檔／typecheck及isolated build PASS（artifact／primary／cleanup=true）；這批結果只涵蓋追加前來源。最終四檔來源 required gates 與增量獨立 source QC 待本輪結果讀回，不把本機 synthetic 宣稱 Production PASS。

Runtime 為有限 memory-only Node tests；port=null、無 primary seed。完整QC及隔離build由原driver管理 task temp、PDM_DATA_DIR／PDM_REPOSITORY_DIR與主資料不變檢查。node_modules為本任務暫時junction，cleanup owner Root；受控來源與 private evidence 保留給 protected release 接續。085與RD能力尚未部署、兩fixture新RD正式驗收NOT_RUN，Dani本人DEFERRED_UNVERIFIED，Google延遲正式情境未證，指定歷史資料未刪且不擴大引用清理。


最終四檔來源 native QC343/343、test:dev-117:continuous287/287 PASS，均零skip、重疊分母不相加；v7 catalog3/3、abort6/6、DB boundary22檔、typecheck與isolated build PASS（artifact／primary／cleanup=true），原Edge警告保持。LOCAL_CONTRACT report DEV117-S1B-20261011T150810528Z-9C4DC145 的source snapshot eb21fcd704d0dfe91667a2d8c0e4922e4b69b89b7ec6553379dd59bb160844ea；本QA結果及路由索引為執行後後記，四個程式／測試檔未再改動。source QC與新增consumer增量review均gpt-6-luna xhigh只讀，P0=0/P1=0；未把 review 當 provider實測。finite runtime／自身temp cleanup PASS，無port／primary seed；正式085／RD驗收仍pending。


## Current program-only serving and retained READY worker checkpoint

沿用 AI-PDM/DEV-121#rd-capabilities／DEV-122 daily dependency，base protected main 5a5d6cf694a7762c6c49cc49c2bcc2b216b76d0f；branch codex/dev121-daily-serving-continuation。開始 tracked clean、AGENTS已完整閱讀，保留原分支、canonical與其他task修改。Platform／OrgMaster來源未修改，正式證據只在private bucket／ignored output。

已證實只讀觀察：原生current artifact resolver→prior activation後，live service revision與prior capsule canonical revision不同，current runtime使用program-only wrapper，prior仍為原READY worker。獨立直接讀prior的早期source-scope拒絕是未先解析current association的helper前置依賴，不當作正常bootstrap根因。正式未pause、未bootstrap、未執行085。Synthetic true RED：有效current RELEASED app＋retained READY worker被舊strict app equality拒絕；無證據的changed serving在拒絕前先產生Scheduler pause。

最小source diff只在bootstrap owner boundary：原strict prior-canonical／repair行為保留，另以source-lock-bound歷史profile、原生完整RELEASED observation＋provider、exact control fingerprint、canonical/current 100%無tag revision及runtime核對program-only serving；readProgramOnlyWorkerEvidence獨立連回原prior activation／image／template／numeric credentials，pre-pause雙重Job／Scheduler policy／Secret metadata readback。雙preflight在第一個lifecycle write前；pause後bootstrap／continuation／recovery再核對current serving。未新增owner輸入schema、角色或帳戶規則，未把genuine current35 profile借用historical34／effective33。

Focused 8/8 PASS、零skip（7個新增＋1個既有相關metadata案例）：positive current-serving pause→bootstrap→full evidence→same-input replay零publication／lifecycle writes、selftest觀察失敗恢復exact prior Job並保持PAUSED、不resume；14類control/runtime/resource drift及缺證據／wrong prior先拒絕且零修改。完整continuous294/294 PASS、零skip。獨立gpt-6-luna xhigh source QC P0=0/P1=0；它是source review，不是獨立provider實測。native QC與typecheck／isolated build仍待結果讀回，本段不宣稱Production PASS。

正式metadata／原生reuse已PASS但ordinary full35 release仍未執行，085未套用，RD v7未上線，舊版仍100%。兩fixture新RD正式驗收NOT_RUN、Dani本人DEFERRED_UNVERIFIED，Google延遲正式情境及指定歷史資料刪除仍未證；不擴大FK引用清理。ownerRunRef只核對本repo numeric run URL形狀，主要source／release證據由封存RELEASED graph、provider build和live runtime核對；未把URL形狀稱作GitHub run provider實測。

Runtime：memory-only finite Node tests，port=null／無primary seed；nativeQC driver負責自己的隔離temp及process cleanup。task-owned dependency junction cleanup owner Root；來源與private evidence留作受保護發布續接。


最終分類相容回歸：native QC 原350項有1項既有 app negative 因固定 active control 缺少時傳出 MISSING 而非既有 OPENSWX_PRIOR_CANONICAL_INVALID。最小修正只對該精確讀取的 MISSING 映射拒絕碼，其他依賴錯誤原樣拋出；新增測試精確 assert code。受影響 focused10/10與最終 native QC350/350 PASS、零skip；完整continuous294/294為分類修正前證據，最終native涵蓋該分母及追加owner案例，不相加。v7 catalog3/3、abort6/6、DB boundary22檔、typecheck:app與isolated build PASS（artifact／primary／cleanup=true），sharp image-only與task temp cleanup PASS。LOCAL_CONTRACT report DEV117-S1B-20261011T160326617Z-BBFE6D68，source snapshot ea7447baca86190dd6ff52e5328bf494829a99254eba8db97d83a882031d5b46。QA結果及路由索引為驗證後後記，兩個程式／測試檔未再變更。增量獨立source QC P0=0/P1=0；保留依賴不可讀及未知版本零寫入拒絕。正式部署及085仍未執行，本機PASS不替代Production驗收。

## Bounded stdout evidence readback corrective checkpoint

沿用 AI-PDM/DEV-121#rd-capabilities／DEV-122 DAILY dependency；base protected main cbe55f681ae7173ae01087ca13d8ce385ecde298，branch codex/dev121-worker-log-readback。開始 tracked clean，AGENTS 已完整閱讀，保留其他 task、canonical 與 private output。僅修改 AI-PDM 自有 bootstrap 日誌證據邊界及 synthetic tests；Platform／OrgMaster 來源、授權與帳戶規則均未修改。

實際發布已完成原事故訂閱恢復、native metadata、current worker artifact association、source-bound infrastructure reuse 與正式 pause。Selftest execution 成功，但首次 stdout proof read 以 OPENSWX_STDOUT_NOT_UNIQUE 拒絕；native failure recovery 已恢復 exact prior normal Job，normal recovery execution 亦成功，Scheduler 保持 PAUSED、durable queue 保留。之後只讀到兩個 execution 各一筆合法 marker，receiveTimestamp 都早於 execution completion。初次查詢的筆數未保留，不能把這次失敗斷言為零筆或日誌傳輸延遲；查詢／索引可見性延遲仍是假說。失敗 input deadline 已過，不重送舊 input、不重寫封存收據、不重複 run。

Synthetic true RED：provider 首次查無 marker、下一次同 scope／window 可見唯一合法 marker時，原 single-query reader立即拒絕。最小修正只對完整分頁查詢後零筆 marker做短暫、有界讀回：沿用 profile 的 recovery budget、poll interval、max pages／entries 及原 absolute deadline；monotonic／wall clock 與 observation count 共同限制重試。最多 20 次 observation，interval 1 秒；單一 provider request 的原 transport timeout 不變。合法唯一 marker proof shape不變；多筆、同 insertId 衝突、錯 scope／window、pagination overflow及 provider dependency error皆即時拒絕。失敗證據只加 executionName、filter hash、marker count、observation count與elapsed milliseconds，不保存日誌 payload、token或Production身份。

本地聚焦 stdout／scoped logs 7/7 PASS、零skip；另 native DAILY 多筆拒絕整合 1/1 PASS、零skip，核對 single immutable recovery receipt 的五項 primitive、必要 prior-normal proof、PAUSED 及零重複 selftest／resume／Secret版本寫入。native完整 regression 354/354 PASS、零skip，v7 catalog3/3、abort6/6、DB boundary22檔、typecheck:app及isolated build PASS（artifact／primary／cleanup=true）；另一份test:dev-117:continuous 294/294 PASS、零skip，分母有重疊不相加。本機合成測試只證明zero→visible的安全接續，不證明先前Production首查為零筆。FAILED DAILY partial continuation仍需原生 immutable-request／completed execution及目前實際Job／Scheduler狀態的封存核對，不能借用historical READY etag、手動resume或跳過source guard。085仍未套用，RD v7未部署，舊版100%流量；兩fixture新RD能力未驗收，Dani本人DEFERRED_UNVERIFIED，Google延遲正式情境及指定歷史資料刪除仍未證。

Production inputs／request／receipt／execution log證據只在private bucket／ignored output；不提交公開repo。本slice runtime為有限memory-only Node tests，port=null，QC／build沿用native primary／temp cleanup；node_modules暫時junction及Governor lease由Root於使用結束後精確清理。worktree保留供reviewed owner release續接。

最終 source-only independent QC：gpt-6-luna xhigh 唯讀，P0=0/P1=0；不是provider實測。LOCAL_CONTRACT report DEV117-S1B-20261011T170919280Z-D37FE82F，sourceSnapshotSha256=ee40ffb7ea492edacaa1a5fe9eb3596dd584b74f9cd90806cf9366aa8a8a4415；兩個程式／測試檔於QC後未再修改，本QA及索引結果為執行後後記。Production PAUSED／085與新RD尚未完成的狀態不升格。


## FAILED DAILY guarded continuation checkpoint（2026-10-12）

沿用 AI-PDM/DEV-121#rd-capabilities／DEV-122 DAILY dependency；branch codex/dev121-failed-daily-continuation，開發 HEAD 3a6e031c4fdfd01a7a625c404fe6039e194fa84f，與官方 main 2f04c56f2ca531b90584439f2953e415eda0e19d 的 tree byte-equivalent。完整適用 AGENTS 已讀，保留其他 task、canonical dependencies 與私下證據。

實際舊 DAILY attempt 在 selftest 成功後 stdout proof 拒絕，failure recovery 已恢复 exact normal Job，Scheduler PAUSED，原 deadline 過期。完成的 selftest／recovery execution 不能當成新的完整 ordinary bootstrap，也不能借用舊 READY generation。最小修正新增封閉三-ref FAILED continuation：重建 sealed 原 input／failure／prior recovery 證據與 byte-equivalent executable，驗 current PAUSED、精確執行清單及 provider metadata；新 normal drain 提供當下空佇列與60秒quiescence proof，再以 fresh etag／generation及immutable request做一次 selftest PATCH。只沿用原隔離結果，零新selftest run；FAILED association不產生READY、DB admission或quiescence假證據。两个full consumers await同一sealed join；activation後的歷史origin只讀sealed圖，下次ordinary origin synthetic已驗。

聚焦28/28 PASS，含metadata與program-only實際consumer、11類prewrite拒絕、unknown有限run／PATCH／四項GCS寫入adopt、重播零writes及provider／IAM／Secret／execution／時間／metadata篡改拒絕。首次consumer漏傳transport／未await曾真實失敗，修正後通過；未繞過產品guards。activation在fixture為synthetic model，不是實際Cloud owner activation。獨立gpt-6-luna xhigh唯讀QC P0=0/P1=0。

原生QC363/363、另一份test:dev-117:continuous 302/302 PASS，均零skip；重疊分母不相加。catalog3/3、abort6/6、DB boundary22檔、app型別與isolated build PASS（artifact／primary／cleanup=true），原middleware／Edge警告保持。LOCAL_CONTRACT報告 DEV117-S1B-20261011T180319282Z-0ABEE533；sourceSnapshotSha256=5c1812443b3bdfdc0313377b08c6e258ab692bafbb10509407c40eaa7d4d050c。本QA／索引結果為執行後後記，五個程式／測試檔未再修改。本slice不新增migration；RD085仍待原受保護維護發布。

原事故訂閱ACTIVE，OrgMaster RELEASED100%；AI-PDM舊版100%、085 NOT_APPLIED／RD v7 NOT_DEPLOYED，新的pause／bootstrap／fence／migration／candidate／traffic待官方clean source與既有owner續接。兩fixture旧正常login／reload／logout為HUMAN_REPORTED_PASS；新RD能力NOT_RUN，Dani本人DEFERRED_UNVERIFIED，Google正式延遲情境未證，指定parent未刪、不擴張FK清理。Production inputs、payload、logs與readbacks只存private bucket／private本地output；Platform output可能UNTRACKED而非ignored，必須逐檔stage、不得把output加入Git。browser action遭automatic approval拒絕，沒有可讀設定證據支持歸責使用者封鎖。

finite synthetic tests port=null；nativeQC／isolated build本身temp cleanup PASS。Root清理交接的精確node_modules junction與Governor lease，canonical dependencies保留；來源worktree保留供protected release，無app server或本task UI。
