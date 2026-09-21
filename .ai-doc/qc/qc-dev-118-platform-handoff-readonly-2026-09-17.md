# DEV-118 118-B Platform 唯讀交接查核

## 現行發布判定：staging fixture不再是開發／release entry阻塞（2026-09-18）

依最新版`deployment-release-gate`，DEV-118因涉及登入、session與authorization邊界，採Protected Release。下方staging owner／target readback仍是有效且可重用的環境證據；`DEV014_LOGIN_FIXTURE_MANIFEST`缺件只代表選配staging provider runner未執行，不能再把118-B標為開發阻塞，也不要求為此新增staging、重複build、DEV-118專屬Release Capsule或第二次批准。

118-B改列`Local Development Complete / Protected Release Verification Pending`。明確release指令啟動後，沿既有DEV-117 app-owned workflow重用未漂移的local／staging evidence，對exact artifact build一次；production canonical再以受控Workspace／Cloud Identity Free principal完成八個identity cells、PDM C01／C02四格及必要拒絕路徑。未完成時只可標`feature verification pending`；security或核心登入失敗時使用existing previous-revision traffic rollback。本文件沒有執行production。

## Staging readiness readback（歷史證據；現行發布判定以上節為準）

本次以使用者已授權的固定 `jenfu-platform-nonprod / asia-east1` staging owner mutation 範圍完成 provider readback；沒有延伸到 production、shared DB migration、credential 讀取或 provider 帳號建立。先前「尚未 mutation」的 owner／infra receipts 改列為歷史快照，不能覆寫本節現況。

- DEV-013 三個 Artifact Registry repository、三個 evidence bucket 與 `platform-dev013-stg-migration` 已存在；migration 最近一次 execution `platform-dev013-stg-migration-9zrrm` 為 `EXECUTION_SUCCEEDED`。三個 bucket 均為 `ASIA-EAST1`、public access prevention enforced、uniform bucket-level access；未讀 Secret payload。
- Platform owner receipt：`gs://jenfu-platform-nonprod-dev013-platform-evidence/receipts/dev-013/l3/platform/owner/5476f5f326e7b87950c2cbe2ff69b3d6351238da/ca66fe52e3987f6cd14df4c25235c6def161ea2bb28d70983d6111533a124a0c.json`，self-hash=`ca66fe52e3987f6cd14df4c25235c6def161ea2bb28d70983d6111533a124a0c`，`OWNER_READY_FOR_L3_BROWSER`；Platform rollout phase 3 receipt=`25069bd7ab83f4110f8d44d8030ddf3ebbe7197ac90c832bd2ba3c4e2dbc28e5`。
- OrgMaster owner receipt：`gs://jenfu-platform-nonprod-dev013-orgmaster-evidence/receipts/dev-013/l3/orgmaster/owner/9b6f13f08325da564ab5f4703ee4f41111e25153/2d3772082d9a92682c96803d515c6a3f1e242da23dfd440622b99f52f57d719d.json`，self-hash=`2d3772082d9a92682c96803d515c6a3f1e242da23dfd440622b99f52f57d719d`，`OWNER_READY_FOR_L3_BROWSER`、handoff `on`。
- AI-PDM owner／target receipts：owner self-hash=`8a967d8170474e7f1f329fa3cd62d907dd037cfff4a21714265bbc8f338c245d`、active hard-join self-hash=`133a46bb7744be10bfbccaa02eb929c57e2124e7c41b96b2b2aa89add3586bad`；兩者均由 `jenfu-platform-nonprod-dev013-aipdm-evidence` readback，active revision 與 exact service identity 已綁定。
- Secret metadata readback：`dev010-stg-platform-runtime-config:1` 與 `dev010-stg-orgmaster-runtime-config:1` 均 `ENABLED`；AI-PDM 三個既有 Secret 亦使用 numeric version `1`。這只記錄 metadata，不代表讀取任何 secret value。
- 最新 provider readiness runner=`DEV014-LOGIN-PROVIDER-20260917T160139495Z-5deeb289`，`DEV014_LOGIN_PROVIDER_ENV=staging`、`DEV014_LOGIN_PROVIDER_MODE=real`，已接受 OrgMaster DEV-049 self-hashed owner receipt 與 AI-PDM hard-join target receipt；唯一缺件是 `DEV014_LOGIN_FIXTURE_MANIFEST:valid-json-file`。runner `credentialsRead=false`、`providerMutations=false`、`productionWrites=false`，未啟動真實 provider 互動。

因此118-B的staging owner／target readiness已完成到`OWNER_READY_FOR_L3_BROWSER`，完整LOGIN六案與PDM C01／C02仍為`NOT_RUN`。這次runner當時把token-free fixture manifest列為staging helper的唯一缺件；依頁首current override，該helper不再是release entry前置，真實browser／provider cells可由production protected release取得。synthetic JSON、owner receipt或staging rollout receipt仍不能代替登入互動證據。

## 歷史複審：OrgMaster owner receipt 已交付／Platform local gate closure（2026-09-17）

本次只讀重讀現行 owner evidence，修正下方 21:34 複審中已過期的「OrgMaster producer NOT_DELIVERED」描述。Platform DEV-014 現行 owner SPEC 記錄 R1～R5 source corrections closed、Platform targeted `62／62`、S2 `7／7`、LOGIN PostgreSQL `5／5`、build／regression PASS；OrgMaster DEV-049 已提供 `jenfu.managed-login.v1` owner receipt、migration 013、CAS／reservation／idempotent receipt／lifecycle barrier，以及 contract／PostgreSQL／browser local evidence。這些均是 local／isolated implementation evidence，不等於 provider、target、staging、production 或 release acceptance。

- Platform source baseline：owner receipt `output/qa/dev-014-login/DEV014-LOGIN-L2-20260917T144849635Z-b081d306/report.json`，status=`PASS`；provider readiness manifest `output/qa/dev-014-login/DEV014-LOGIN-PROVIDER-20260917T150421109Z-c2ea48de/manifest.json`，status=`BLOCKED`。
- OrgMaster owner receipt：`../../OrgMaster/qa/dev-049/producer/owner-receipt.json`，receipt SHA-256=`79a489833141d7773f845ba1e8cb608d1be9faf4276be9e344e1e102ee5b23b7`，status=`LOCAL_OWNER_IMPLEMENTATION_PASS`；其 limitation 明確保留 provider／target／activation 未完成。
- 固定staging target profile確實存在；上段已記錄後續owner mutation與provider readback。較新的DEV-013 owner／infra readiness receipts只作為mutation前歷史證據；該次provider gate已補齊environment、real mode、OrgMaster owner receipt與AI-PDM target receipt，當時只缺valid token-free fixture manifest。`credentialsRead=false`、`providerMutations=false`、`productionWrites=false`仍成立。因此118-B staging owner／target readiness可交接，完整LOGIN六案與PDM C01／C02四格維持`NOT_RUN`；runner本身的`BLOCKED`只描述選配staging path。

歷史staging續接方式：若選擇使用固定staging helper，可在其既有授權與輸入範圍內先補Platform八個identity cells，再以同一份evidence執行AI-PDM `PDM-W-G`、`PDM-W-E`、`PDM-F-G`、`PDM-F-E`。現行主路徑改由頁首的production protected release；未取得真實輸入前仍不修改provider、不讀credential、不宣稱PASS。

### 選配L3 staging operator handoff（輸入契約，尚未執行）

固定環境 profile 已存在：Platform `config/dev-013/l3-managed-staging.json` 固定 `environment=staging`、project=`jenfu-platform-nonprod`、service names `jenfu-platform-stg`／`orgmaster-stg`／`ai-pdm-stg`。本次已完成該範圍的 artifact／evidence bucket／migration job、Secret numeric version與 owner-native runtime readback；三份 owner receipt 已達 `OWNER_READY_FOR_L3_BROWSER`。profile仍不是 LOGIN browser/provider PASS，也不能推論 production release。

若operator選擇補充staging evidence，可在同一份受控nonprod／staging evidence中提供`DEV014_LOGIN_FIXTURE_MANIFEST`的token-free、可驗章fixture manifest；`DEV014_LOGIN_PROVIDER_ENV=staging`、`DEV014_LOGIN_PROVIDER_MODE=real`、OrgMaster owner receipt與AI-PDM target receipt已通過readiness。Platform runner命令為`npm run qc:dev-014:login:provider`；缺fixture只使此選配runner產生`BLOCKED`，不得自動建立服務、帳號、provider state、credential或target session。fixture／target receipt仍須逐格引用`PDM-W-G`、`PDM-W-E`、`PDM-F-G`、`PDM-F-E`，並記錄source／environment／providerMode／fixture／cleanup provenance。

## 歷史複審：2026-09-17 21:34（Asia/Taipei）

Platform已提供新source與focused tests，**不再沿用「五項都未修」**。現行結論為`R2／R3／R4 source correction confirmed；R1／R5 PARTIALLY_RESOLVED / Consumer acceptance CHANGES_REQUIRED`。此為唯讀source複審，本任務未執行Platform程式或測試。

（以下為 21:34 的歷史快照，已由本文件上方現行複審更新。）Platform branch=`持續優化1`、HEAD=`84faef21d91b188494f1f94f1429545335bf04a8`，仍有未提交source；AI_PDM HEAD=`beab841421fded3c95c2e03921b7942dbc00b7f9`，登入page與browser runner雜湊仍與118-A最新receipt一致。當時 OrgMaster HEAD=`7c56a883d530f4c807674a23571c46b06398889c`，本地`server`未找到`jenfu.managed-login.v1`路由，Producer NOT_DELIVERED；該狀態已被 DEV-049 owner receipt 取代。本段只保留歷史查核來源。

| 原發現 | 本次source複審 | 尚須交付的修正或證據 |
| --- | --- | --- |
| R1：工號snapshot比對 | `managed-login-service.ts:82–85`已接受active且exact pair／revision；active日常登入的直接失效機制已修正。 | pending分支`:87–90`仍允許`registryRevision >= expected.registryRevision`，而§18.5.1／2固定number assignment revision不漂移；first binding只容許owner證明的identity revision改變。`managed-login-service.test.ts:148–155`目前甚至把identity／registry均由1→2當成功。維持registry exact match，保留受控identity binding例外；補「工號相同但assignment revision改變」拒絕、正常pending與active成功反例，不改六案分母。 |
| R2：orphan rollback | `:207–218,245`先在callback回傳，再於交易外throw restart；原本會rollback撤銷的機制已修正。 | 新unit仍以mock callback直接改state，不能證明COMMIT或晚到cookie失效。須實際exchange＋disposable PG＋guard readback；未把source修正填成完整QA PASS。 |
| R3：generation／TTL | service保存claimGeneration並於final compare；repository `:136–142` consume以digest、generation、lease及expiry的DB-clock條件更新，session同交易rollback保護已落實。 | 尚缺兩connection／barrier的真實service lease reclaim、舊worker零session、300秒final expiry證據；unit改記憶體generation不足以驗交易排程。 |
| R4：owner暫時性失敗 | service `:249,253–263`使用intentId為command，只將terminal deny終止；503保留processing並附Retry-After，原本一次失敗即終止已修正。 | 現有unit只驗第一個503後仍processing及requestId；須補lease後相同token完整重試成功、owner提交但response遺失與永久binding不重做。 |
| R5：final admission | `:283–288`已在scoped DB重讀active mapping／mappingVersion及epoch，檢查revoked_before。 | 仍未把`verified.identity.pair`比對本地已驗Firebase issuer／subject，也未比對owner `authenticatedAt`與原`auth_time`；只驗parser格式不足以落實§18.5.2(7)。補exact pair／original authentication time核對與兩種owner錯配回應的零session反例；再驗真正lifecycle barrier／commit race。 |

Owner SPEC §18.5.8記錄60 focused tests、LOGIN PG 5／5、S2 PG 7／7與build／regression PASS；這些為owner紀錄，本任務未重跑。PG LOGIN runner仍只做migration／ACL／direct SQL，未經`createManagedLoginService.exchange`。下列實際讀取的manifest都為`BLOCKED`，不能當browser或provider已驗：

- `output/qa/dev-014-login/DEV014-LOGIN-BROWSER-20260917T132122956Z-2da847d0/manifest.json`：缺local target／stub／Playwright inputs，browserStarted=false。
- `output/qa/dev-014-login/DEV014-LOGIN-PROVIDER-20260917T132123756Z-e1f53c52/manifest.json`：缺nonprod環境／真實帳號／owner／target receipts，credentialsRead=false。

本次source SHA-256（路徑相對Jenfu-Platform）：

| 路徑 | SHA-256 |
| --- | --- |
| `src/lib/auth/managed-login-service.ts` | `f0554bd71fe00edb8f83d8a69439dca8071485cdc670e8d530aa7444d75375c3` |
| `src/lib/auth/managed-login-intent-repository.ts` | `47fabbc2ea33ac5735ce71dce70ce59da716c3fb35f01597afed887e73759ac0` |
| `src/lib/auth/managed-login-service.test.ts` | `b1f9e4d622ba241a19d0f8f19e0e07debb7b3b4dd9f94ff7fb12858c9cd49ba9` |
| `src/lib/auth/principal-admission-repository.ts` | `349646718d0f4c680837de644b45e1e40a442f22c8599908772c1e34bf016486` |
| `src/lib/auth/auth-epoch-repository.ts` | `f3c5c38faef08cc37e8be4bef84914694314c71cda5db3d0e5a51e8a17c263f8` |

當時續接順序為Platform補R1／R5核對與實際service PG／browser證據、OrgMaster交付producer／CAS／barrier，再完成真實八個identity cells及PDM四個target cells。前兩項後續已關閉；provider／target cells仍依原分母在current Protected Release完成，沒有被豁免。

## 20:00 初次source審查（已由上述複審更新）

`Consumer review: CHANGES_REQUIRED / LOGIN-R1 architecture unchanged / 118-B acceptance NOT_DELIVERED`。Platform 工作樹已有 Google／工號 UI、intent route、owner client、migration 007 與 session exchange，不再是只有 email/password 或基礎檔。Owner SPEC §18.5.8 最新記錄 25 個 unit／component tests 通過；本任務沒有執行或獨立複驗這些測試。完整 LOGIN 六案仍 0／6，不能把局部測試或 source 存在換算成整合完成。

- Platform：`持續優化1` @ `5d5a5111ab28307d9c6655669e8b4ec891286e9e`，dirty，含其他任務持續修改；以下結論限定所列檔案雜湊，不只綁 HEAD。
- AI_PDM：`codex/dev-013-ai-pdm` @ `3c83a2b24af6c5a7b9759c93bd9b37f7ae12d033`，保留本任務既有未提交 A03／browser 修正。
- OrgMaster：`codex/dev-013-orgmaster` @ `7c56a883d530f4c807674a23571c46b06398889c`，當時只有文件變更；`server` 未找到 `managed-login/v1`／`jenfu.managed-login.v1` 實作。此為本地 source 查核，不證明任何遠端環境狀態。
- 本輪只讀來源程式，依既有人類「AI_PDM 與 Jenfu-Platform 兩專案文件」授權更新交接文件。沒有修改來源程式、執行來源測試／build／migration，沒有修改 OrgMaster 文件或環境。

### 必要修正與既有驗收對應

以下五項為靜態程式審查發現，尚未用 PostgreSQL／provider 重現；不填為 QA case FAIL 或 PASS。Owner 在原生 `DEV-014 / 014-LOGIN` 修正，來源仍為 `AI_PDM / DEV-118 / 118-B`，不新增 DEV、identity store 或 session 協定。

| ID／優先級 | 證據與失效機制 | 最小修正與完成證據 |
| --- | --- | --- |
| R1／P1：已啟用員工的工號登入必定被拒絕 | `managed-login-service.ts:63–74,230` 的 `ownerExpectedMatches` 最後強制 `expected.linkState=pending` 且 pair=null；合法 active 工號 snapshot 因此永遠 false。pending 首次 binding 若依法增加 identity revision，逐字 revision equality 也會拒絕成功結果。 | 依 §18.5.2 分別處理 active exact pair／revision 與 owner 證明的合法 pending→active；永久 employee／Directory／number 鍵仍 exact match，不能泛化接受 revision 漂移。QA014-LOGIN-01／03 覆蓋 `W-A-E`、`F-A-E` 日常成功及 pending 首次成功、錯 pair／非 binding drift 拒絕。 |
| R2／P1：orphan 撤銷被整筆 rollback | `managed-login-service.ts:185–199` 在同一 callback 執行 revoke＋settle 後 throw 409；`managed-login-intent-repository.ts:178–183` 使用 `database.transaction`，`src/lib/db.ts:69–75` 遇 throw 會 ROLLBACK。結果是回覆要求重啟，卻未持久撤銷舊 session。 | 在交易內回傳 settlement outcome，確認 commit 後才在交易外轉成 409；保留 session revoke 與 intent rejected 同 commit。QA014-LOGIN-03 以真實 disposable PostgreSQL 驗 DB readback，並證明晚到原 cookie 在 session／handoff guard 被拒絕。 |
| R3／P1：舊 worker 缺 generation fence，最後提交也未重驗 intent TTL | `managed-login-service.ts:211–214` 未保存 claim 後 generation；`:248` 只比 state／digest／lease，repository `:136–140` consume 未比較 generation 或 expires_at。同 token 新 worker 回收 lease 後，舊 worker 可借新 lease 提交；接近 300 秒截止時也可能跨過 TTL。 | 保存本次 claim 的 generation；最後以同一 scoped transaction、DB clock 同時檢查 expected generation、digest、lease、intent expiry，再 INSERT＋consume。QA014-LOGIN-03 以兩 connection／barrier 固定回收排程：舊 worker 零 INSERT／Set-Cookie，新 worker 至多一個 session，300 秒邊界拒絕。 |
| R4／P1：暫時性 owner 失敗被終止，重試也更換 command ID | `managed-login-service.ts:228` 每次產生 random requestId；`:231–236` 對 owner timeout／503 亦 setRejected 後回 503。UI 保留相同 token 重試時只會得到 restart_required，偏離同 command／digest 的受控恢復。 | owner requestId 固定 intentId；只把 terminal identity deny 改 rejected，可恢復失敗保留 processing／原 digest，依剩餘 lease 回 Retry-After，任何 worker state write 都比較 generation。QA014-LOGIN-01／03／05 驗 owner 已提交但 response 遺失、相同 body bytes 重試、不增加 binding revision／reservation。 |
| R5／P1：最後 session commit 未重讀 admission／epoch | `managed-login-service.ts:242` 在最後交易外讀 epoch，`:249–260` 直接使用 owner response 的 principal／employee；未在 scoped DB 重讀 active-principal mapping／mappingVersion，也未比對 owner authenticatedAt／verified pair 及 revoked_before。Owner 回應與 session commit 間的 lifecycle 變更未落實定案 barrier。 | 依 §18.5.2(7–8) 在最後短交易重讀既有 versioned mapping 與 epoch，核對 owner response／verified identity，保留原 auth_time 並拒絕 revoked_before；不新增 authority。QA014-LOGIN-06 在 owner success 與 commit 間插入 lifecycle mutation，證明拒絕不合法 session，commit 後變更仍由既有 guard 拒絕。 |

**證據界線：** `managed-login-service.test.ts` 此次只含 start opaque intent／非法工號兩案，mock transaction 直接呼叫 callback；不能證明 exchange、rollback、lease reclaim 或 commit race。既有 QA 六案已容納上述反例，不擴充分母。其他 unit／component PASS 保留，consumer acceptance 需另外完成上述對應 evidence。

文件同步期間owner另補`qc-dev-014-login-postgres.mjs`與5／5 PG checks紀錄；唯讀檢視runner覆蓋migration apply／replay、DML／state constraints、sibling ACL及直接SQL rollback，未呼叫`createManagedLoginService.exchange`。因此保留這份局部進度，但它未關閉R1～R5的實際service失效路徑；本任務沒有重跑該runner，也未把測試名稱推定為service交易已通過。

**已更新的觀察：** 早先讀取時 Google 無 intent 拒絕仍依賴 feature flag；本次最後 source 已改成無條件拒絕 `google.com`，不把該舊發現列為未修缺陷。這也說明同 HEAD 的 dirty source 必須用檔案雜湊辨識。此次未審查全部新增 source，不能宣稱其他缺陷為零。

### Source fingerprint 與交接退出條件

以下路徑相對於 Jenfu-Platform，SHA-256：

| 路徑 | SHA-256 |
| --- | --- |
| `src/lib/auth/managed-login-service.ts` | `8c9be6dbffc14b544e31fd336345a232bceaca4a7dc54a3627f7bb7ff41c5971` |
| `src/lib/auth/managed-login-intent-repository.ts` | `9e5e8bbdce26ac5ca45ef8569d9b43784114a7367024e960350d0bbca14d4892` |
| `src/lib/db.ts` | `4e03ea3c1734e7f9dcb2c11454f2d36ce2e597331f2db0156a6419cd603b5ed2` |
| `src/lib/auth/require-portal-session.ts` | `c7ff3e4728348791db6f64d73b8d3b8301d6d67a2705e1cf8134ff416e825d6b` |
| `src/lib/auth/managed-login-service.test.ts` | `f808f9aaf2974e9271f095aae141c31590c690915a27947cbe6d13f8db91f3b6` |

先由獲授權 Platform owner 修正 R1～R5並交付同一 source 的 unit／真實 disposable PostgreSQL／browser evidence；再取得 OrgMaster producer native contract／commit／CAS／barrier 證據，完成受控真實 Workspace／Free 八格與 PDM 四格。沒有 producer 時可先修復並驗證 Platform 本地反例，但不能啟用正式 provider 或把 stub 計為 LOGIN 全案 PASS。本任務接手來源專案產品開發的授權問題仍待人類答覆，文件授權不替代它。

本輪文件驗證：兩repo的Markdown `git diff --check`通過；新增／修改行中的本地連結AI_PDM 17個、Platform 15個均可解析。五個review source fingerprint於文件同步後再讀一致。這些是文件與source穩定性檢查，不是產品QA或獨立QC PASS。

## 歷史查核（以下不代表現況）

- 日期：2026-09-17
- 查核 repo：`C:\VIBE CODING\Jenfu-Platform`
- Branch：`持續優化1`
- HEAD：`ab38ad87ef5120212f46cba2c1633d995d28a9ad`
- Working tree：clean
- 查核性質：read-only；未修改 Platform source、文件、資料、provider 或 release

## 查核結果

`src/app/login/login-client.tsx` 目前只呼叫 `signInFirebasePassword`，畫面欄位為「電子郵件」與「密碼」。未發現 Google CTA、工號輸入、employee mapping routing 或 non-Google provider 分支。

因此 118-B 的狀態維持 `RD Contract Ready / Platform Handoff Required`。118-A 的 AI-PDM local PASS 不足以宣稱平台雙入口完成；118-C 的 C01/C02 與 production release 必須等 Platform owner 建立／承接 owner-native 任務、完成 provider／mapping／API／UI 實作及對應驗收後，才可進入整合 gate。

本查核只證明查核當下的 Platform source 狀態，不代表 provider readiness、正式帳號開通或 production 能力已通過。

## 後續唯讀查核：Platform native task ownership

- 查核時 Platform branch=`持續優化1`、HEAD=`f3ad684`；工作樹已有其他 active task 的未提交變更，本查核未修改、stage、測試或 build。
- Platform `DEV-014` 已存在，來源是 `OrgMaster / DEV-047 / production activation`，狀態為 `Brief Ready / Documents Only / Production Release Gated`。
- DEV-014 與 118-B 在受管身分、員工編號及跨 app invalidation 有相鄰範圍，但其文件明確不授權產品實作，且沒有 `AI_PDM / DEV-118 / 118-B` 來源、Google／工號雙入口 UI/API、non-Google provider 分支或對應 QA evidence。
- 因此不得再把 DEV-014 當成空白可直接建立的 ID，也不得把其 Brief 誤算為 118-B 完成。取得人類精確授權後，由 Platform owner 決定將 118-B 登錄為 DEV-014 的具名來源切片，或依當時索引配置下一個 native ID。
