# AI PDM dev_task PM Control Board

更新日期：2026-08-04
Owner：Dev PM
用途：這份文件是 active DEV control board。未完成任務留在此處；已完成任務只保留摘要，完整索引在 `.ai-doc/archived/completed-dev-index-2026-06.md` 與 `.ai-doc/archived/completed-dev-index-2026-07.md`。

歷史快照：

- `.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`
- `.ai-doc/archived/dev_task_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/dev_task_legacy_before_pm_cleanup_2026-06-16.md`
- `.ai-doc/archived/documentation_map_before_pm_governance_restructure_2026-06-30.md`

## 總任務清單

這是目前 AI/PM 協作的任務容器，不是冷啟動的全文讀取範圍。`DEV-001` 這類短碼是溝通用別名；
原本的語意來源 ID 仍是規格、QC 腳本、證據路徑與歷史引用的權威 ID。

低 token 讀取邊界：先讀 `### 派工規則` 與 `### 目前派工任務清單`。已知 DEV ID 時，只搜尋並讀取
該 DEV 的 `### 任務索引` 項目，讀到下一個同層狀態符號 DEV 項目前；不得順序載入所有任務明細。

狀態符號：

- `○` 待排
- `☐` 可執行
- `◐` 執行中
- `◇` 驗證中
- `✓` 本輪本地範圍已完成
- `!` 阻塞 / 需高風險確認或外部證據
- `↷` 延後
- `×` 跳過

### 派工規則

- 本節的多行索引是權威任務清單；後方表格只保留給 release gate、外部阻塞與 QC 腳本相容。
- 狀態符號直接決定可否派工：`☐` 才是一般可派工；`○` 需先選定切片或使用者提出實作型指令；`!` 與 `↷` 不可由 RD 直接執行。
- 目前唯一推進第一版 production 的入口是 `DEV-032`。`DEV-030` Cloud SQL target/capacity 與 `DEV-031` clean seed/restore/reconciliation 已整併為其子關卡，不再獨立派工；`DEV-046` Phase 2B staging activation 已完成，Phase 3A production execution 由 `DEV-032` 管控。
- `DEV-005` Phase 1 本地切片已完成；技轉包 Phase 3 已依使用者決策抽成 `○ DEV-041`。`DEV-041` Phase 3A-0 已於 2026-07-13 完成本機實作與 QA；Phase 3A-1 之後仍須明確提出實作需求並逐階段進入。
- `DEV-044` Phase 1-3 已完成本機 RD/QA/QC：server-derived command boundary、transactional receipt/outbox、provider-neutral principal/organization mapping 與 collision tooling 均已落地；原 Supabase Auth provider 目標已由 `DEV-046` 的 Firebase Auth / Identity Platform 決策取代，既有 provider-neutral evidence 仍有效，production cutover 仍未授權，ProJED 未修改。
- `DEV-045` Phase 1、Phase 2 本機切片與 Phase 3A 工號登入別名 local slice 已完成本機 RD/QA/QC：包含「帳號與權限」單一管理入口、帳號生命週期、identity 狀態、session revoke、provider-managed recovery handoff、self-service session/device visibility、角色時間區間 UI 與 permission-path enforcement。Phase 3B provider rollout、production、Firebase Auth / Identity Platform live provider、MFA 與 release 仍未授權。
- `DEV-046` Phase 1A-1E、Phase 2A staging IaC、Phase 2B local application slices 與 Phase 2B staging authentication activation 均已完成。`HD-10-1 / 1A` 採單區 staging、Regional-HA production，production IaC 保守估算 USD 210；staging 與 production 均依使用者決策採 Firebase Hosting 預設網址，DNS 延後，ProJED 未修改。2026-07-16 `DEV-032` Gate A/B/C 已完成：`jenfu-ai-pdm-prod` Paid Billing、Firebase/Identity Platform、Cloud SQL Regional HA、private VPC、Cloud Run、IAM、monitoring、regional logs、TWD 9,600 budget、Admin principal、18 migrations、pre-canary reconciliation 與 HD-8-4 separate-target restore reconciliation均通過；production entrypoint為`https://jenfu-ai-pdm-prod.web.app`，無GCS file authority，Terraform no-drift。Gate D只剩authenticated Level 4，Gate E仍待final 3-5位named-user canary。
- 2026-07-15 Workspace pilot access staging deploy：使用者決定公司 Google Workspace 使用者不再由 AI_PDM 首次登入要求 Authenticator/TOTP enrollment，且暫不要求 Workspace 管理端先強制 2-Step Verification。staging 已以 dirty working tree explicit approval 部署 image `sha256:c677ab0822328944c304afc17877963f611f010c972400fed838ce5153d1818c` 至 Cloud Run revision `ai-pdm-stg-00007-cam`，100% traffic；runtime env 為 `PDM_TRUST_GOOGLE_WORKSPACE_MFA=false`、`PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED=true`、`PDM_GOOGLE_WORKSPACE_DOMAINS=jenfu.com.tw`。post-deploy smoke 通過 `/login`、`/api/auth/mode`、未登入 `/api/numbering/permissions` 401，且登入頁無 Authenticator/TOTP enrollment 可見文案；rollback target 為 `ai-pdm-stg-00005-4xp`。
- 2026-07-15 privacy acknowledgement staging hotfix：修正 Firebase Hosting -> Cloud Run rewrite 後，Google 登入告知流程未穩定帶入工作階段而使 `/privacy/acknowledgement` 顯示「確認工作階段已失效」的問題。根因是 Firebase Hosting 只會把名為 `__session` 的 cookie 轉送至 Cloud Run，原本的 `pdm_session` 不會進入後端 request。變更包含 pending cookie `SameSite=Lax`、登入交換/告知 API fetch 明確 `credentials: "same-origin"`、登入交換遇到 `privacy_ack_required` 改為 HTTP 200 body-code handoff、以 `NextResponse.cookies.set()` 同時寫入 `__session` 與 `pdm_session`，後端讀 session 時優先讀 `__session` 並保留 `pdm_session` 供未來 ALB/custom domain 相容；未確認個資告知前，受保護 BFF API 仍由 privacy gate 回 428 fail-closed。staging 已部署 image `sha256:702abf5ecd72e6b5878a3727c769f26cc3a426af29857308dfd6366b3255e35a` 至 Cloud Run revision `ai-pdm-stg-00013-vev`，100% traffic；驗證通過 privacy QC 20/20、Phase 2B QC 15/15、employee login alias QC 21/21、TypeScript、isolated build、本地容器與 staging smoke。後續真人 Google acknowledgement flow 重測已通過；rollback target 為 `ai-pdm-stg-00011-bot`，再上一版 rollback target 為 `ai-pdm-stg-00009-lab`。
- 2026-07-15 dashboard PostgreSQL compatibility staging hotfix：人類已確認 `jedchang0308@jenfu.com.tw` 可經 Firebase Hosting 預設網址登入並進入 AI PDM 主控台；登入後發現 dashboard 啟動 API `/api/submissions`、`/api/lifecycle/controlled-history`、`/api/notifications`、`/api/approvals/inbox` 出現 500。Cloud Run stderr 定位為 Postgres nullable parameter type inference `42P08` 與 notification aggregate `GROUP BY` 相容性問題；已補 `submission-list` 與 `dashboard` nullable filter cast，並補 `notification` pending-review GROUP BY。驗證通過 TypeScript、isolated build、DEV-046 privacy QC 20/20、Phase 2B QC 15/15、employee login alias QC 21/21、candidate `/login`、`/api/auth/mode`、未登入 privacy API 401 與正式 staging 相同 smoke。staging 已部署 image `sha256:9a6ba6dd1d2c6e2266ee477e4014c4378d36e95107990f30c3bf2dd29b34138b` 至 Cloud Run revision `ai-pdm-stg-00015-tim`，100% traffic；production 未觸碰，rollback target 為 `ai-pdm-stg-00013-vev`。
- CAD 原檔解析、SolidWorks Add-in、完整 PDM 離線檔案還原演練與 live Supabase 資料工作都不是本輪自動可執行範圍。使用者於 2026-07-14 以 `HD-9-1` 取消 `DEV-FIELD-001` 固定五個工作日正式現場驗證；既有真人 UI 登入、領號、重登持久性與系列代號重測只保留為本機功能證據，不冒充 production canary evidence。此決策不豁免 `DEV-032`、production post-deploy smoke、allowlist、零 open P0/P1 與 `HD-8-4 / 1A` continuity gate。

### 目前派工任務清單

此段是 PM / RD 唯一派工入口；完整 DEV 摘要與證據仍以後方 `### 任務索引` 為準。

- 唯一 P0 launch-moving 任務：`DEV-032` ERP 平台 production release work package。
  - 當前子關卡：`DEV-032 Gate D` authenticated Level 4 production smoke；Hosting/OAuth、principal bootstrap、pre-canary reconciliation 與 HD-8-4 separate-target restore reconciliation 均已完成。
  - 後續順序：完成 Google 互動登入 -> authenticated privacy/permissions/領號/草稿/重登/file fail-closed smoke -> `Gate E` named-user canary。
  - 整併來源：`DEV-030` 轉為 032B/032C database 子關卡；`DEV-031` 轉為 032C data-continuity QC 子關卡；兩者保留來源 ID，不再獨立派工。
  - release scope：`DEV-040` 領號／草稿、`DEV-042/043/045` 身分與帳號治理、`DEV-048` 圖料號／草稿入口；GCS file workflow、CAD、BOM 與完整 PDM 不在第一版。

- 下一個產品候選：`DEV-041` Phase 3A-1 Pack-and-Go Intake。
  - 恢復條件：使用者明確提出產品實作指令；不得自動跨到 mapping/BOM/baseline 或 release。

- 待選切片後再立項：`DEV-015` 圖面送審工作台 Phase 2+。
  - 目前不派工；需先從主資料、附件、協作、dashboard/todo 去噪中選一個切片。

- 版次治理：`DEV-050` 版次發布閘門與建議版次決策引擎已完成 Phase 1A/1B 本機實作與 focused QC；Phase 1C 緊急使用情境仍 deferred。
  - 狀態：Phase 1A/1B 本機實作完成且 focused QC 通過；Phase 1C 不開放。
  - 已決策：先做系統自動建立建議版次並於送審 snapshot 固化，再做 P0 release gate；小數版不可成為正式 `Released`；Phase 1 不開放緊急使用情境。
  - 恢復條件：若要部署、合併、正式 release、live data repair 或開放 `ConditionalUse` / `TrialApproved`，需另起人類決策與 release/data-repair gate。

- 版次前置 UX：`DEV-051` 保留號首版圖面版次預告與建立入口已完成本機 Phase 1A-1D，QA/QC Passed。
  - 狀態：raw `v{rowVersion}` 誤讀已移除，detail suggestion panel、publication-gated CTA、`/numbering/revisions` handoff、server suggestion alignment、manual edit guard 與 focused/browser QC 均完成。
  - 已決策：採「提示提前，正式承諾延後」；候選圖號可先顯示 server-derived 建議研發版次，但 CTA 在正式發布與 drawing reservation `promoted` 前保持停用，保留號本身不成為版次 authority。
  - 恢復條件：若要 merge、PR、deploy、正式 release、production smoke、live data repair 或開放 `ConditionalUse` / `TrialApproved`，另走 release/data-repair 與人類決策 gate。

- 新生命週期候選：`DEV-052` 圖料生命週期效率優先簡化已達 `Phase 1A-1D Independent Local QC Passed / Production Release Gated`。
  - 目標流程：`建立料件 → 完成首版圖面並一次送審 → 核准`；候選號、首版圖面與核准後正式化由系統承接，不再要求人工發布。
  - 已決策：既有保留號透過 read-time compatibility projection 直接進入新流程並往前推進；候選階段可建立受控草稿；整包核准後由同一冪等交易自動正式化。
  - UI：保留既有 `保留號` 頁籤與 `/numbering/drawings?tab=reserved`；工作區改稱 `保留號／首版準備`，正常狀態單一CTA，正式化後轉入正式圖號且歷史仍可查。
  - 安全邊界：不批次回填、不改號、不重播舊審核；開啟／讀取零寫入。舊 number-only 核准不得冒充圖面核准，須接續圖面差異審核。正式 migration、deploy、release 與 production data 仍未授權。
  - readiness 結果：採 physical `Pending` package + immutable review-approval companion 投影 effective `ReviewApproved`，避開既有 package status 擴張、SQLite table rebuild與舊版 reader 風險。
  - 驗證結果：獨立QC在RD凍結後重跑`npm run qc:dev-052`（181項可計數檢查）、全專案lint與隔離production build均通過；AI真實操作RO-00～RO-20為41/41，正式連線／寫入皆false且測試資料已清除。
  - 下一步：維持production release gate；若要staging／production migration、啟用flag、deploy或release，另走target、backup、rollback與smoke gate，不直接碰既有正式保留號。

- 單一圖號工作台：`DEV-053` 已達 `RD Implementation Ready / Human Confirmed`，下一步可執行Phase 1A本機切片。
  - 產品決策：取消「圖號總表／保留號」雙分頁，改成單一「圖號工作台」；保留號改為生命週期狀態，不再是獨立頁面。
  - 使用者流程：同一張清單直接顯示圖號、品名、目前階段與唯一下一步；建立、首版、送審、核准、正式化、發行與進版依狀態接續。
  - 安全邊界：只合併使用者介面與查詢投影，不合併保留工作區、圖號主資料、版次、審核或稽核資料；只對workspace additive新增三個nullable source-context欄位，既有production資料不搬移、不回填、不改號。
  - 相容：既有 `/numbering/drawings?tab=reserved` 必須可安全導向單一工作台的工作中範圍，不得因開啟舊網址產生任何寫入。
  - 契約：統一清單由server-side唯讀BFF產生；進行中一個workspace/bundle一列，正式化後切換成每張正式drawing master一列，完成workspace只留在drawer/audit追溯。
  - readiness決策：採server-side一致性投影、opaque keyset cursor與workspace source drawing/part/link context；ADR已Accepted，flag `PDM_UNIFIED_DRAWING_WORKBENCH_V1`預設off。
  - 下一步：派RD執行`DEV-053 Phase 1A：read foundation`，僅限本機schema/read model/API/focused tests；production migration、flag activation、deploy與release仍需獨立gate。

- production 穩定後的技術治理：`DEV-047` bounded schema migration。
  - Phase A0 本機工具已完成；Phase A 需 production representative snapshot、read-only operator 與 evidence owner，不以固定觀察天數作 entry gate。

- 未來 GCS package：`DEV-033` + `DEV-046` Phase 3B + `DEV-037`。
  - 同一 package 依序處理檔案 inventory/cost/retention、direct-GCS authority 與完整 file/offline continuity；不阻擋第一版 no-file production slice。

- CAD 延後：`DEV-035` 保留 2D preview/native metadata；`DEV-036` SolidWorks Add-in 已移出目前產品路線並停止獨立追蹤。

### 任務索引

以下保留每個 DEV 的摘要、來源 ID、證據、歸檔位置、批次發版指向與計入交付判定；使用者可直接用 `DEV-005` 這類短碼指定任務。

- ✓ DEV-046 [開發點] [Phase 2B Staging Activation Complete / Future Phases Gated] [P0] Google Cloud SQL 五年 ERP 平台與本體論基礎
  - 摘要：建立 AI_PDM 作為未來 ERP 模組的 Google control plane、Firebase 單一 IAM、Cloud SQL PostgreSQL、GCS binary authority、Shared Drive delivery boundary 與 ontology-ready object/link/action/event 契約；operational DB/files 位於 Google Taiwan，Firebase identity data 的 US location exception 已依 `HD-6-1 / 1A` 接受並保留 privacy implementation gate。
  - 來源 ID：`DEV-PDM-ERP-GOOGLE-CLOUDSQL-001`
  - 父任務：ERP platform program；承接 `DEV-044` provider-neutral foundation，修正 `DEV-002` 與 `DEV-045` 的未來 provider 目標。
  - 任務清單：
    - [x] Phase 0 architecture baseline：完成 superseding ADR、五年 SPEC、QA、account reprovision、Taiwan primary data placement、wave rollout、Architecture Memory Capsule、Failure/Recovery、RD Handoff Contracts、Deferred Scope Audit 與 All-Phase Coverage Matrix；使用者以 `1A/2A/3A` 關閉 `HD-6-1` identity US processing、`HD-6-2` Taiwan-only/no regional DR、`HD-6-3` canary day-one regional HA。
    - [x] Human Decision Gate `HD-8-1..3`：`1A` 選定 `asia-east1` Cloud Run + Next.js 16 Active LTS container + external ALB/managed TLS/custom domain，CDN 只允許 reviewed immutable assets；`2A` 選定 internal primary+backup all-hours on-call、critical security/data-loss event 60 分鐘內 acknowledgement/containment，且不承諾 24x7 restoration；`3B` 選定 staging 同測 Google/non-Google、Wave 0 Google Workspace only、Wave 1 至少一位受控 non-Google。
    - [x] Human Decision Gate `HD-8-4 / 1A`：完整 PDM/GCS/offline restore 延後；Cloud SQL automated backup/PITR 與一次 separate-target isolated restore + numbering-ledger/sequence/non-reuse-reservation reconciliation 必須在 canary 前完成，來源不得被覆寫，未通過則 no-go。
    - [x] Phase 1A runtime foundation：Next.js 16/Node 24 LTS standalone container、Cloud Run/ALB/NEG/TLS/restricted-CDN/manual-promotion contract及本機 build/start/browser evidence已完成；focused QC 16/16。
    - [x] Phase 1B IAM/BFF contract：Firebase provider interface/fakes、八小時 `pdm_session` v2、key rotation、AAL2/TOTP/replay、deny-first saga、invite compensation、reprovision/collision/legacy closure已完成；focused QC 15/15，live provider未接。
    - [x] Phase 1C Cloud SQL database/migration contract：provider-neutral Cloud SQL adapter、private localhost proxy/IAM auth、runtime/migration role、capacity/timeouts、singleton checksum migration與 browser denial已完成；focused QC 17/17。Phase 2A 依官方要求補上 `roles/cloudsql.instanceUser`。
    - [x] Phase 1D storage/continuity contract：direct-GCS interfaces/fakes/fail-close、generation/hash pointer、number reservation/signed-ledger/reconciliation fixtures已完成；focused QC 14/14，live GCS仍屬 3B。
    - [x] Phase 1E portability/data/SLO/cost governance：clean seed/archive、location/retention、cost/SLO/observability、no-Firebase-authority/portable-BFF scanners已完成；focused QC 24/24。
    - [x] Phase 2A staging preflight/IaC：建立 fail-closed Terraform review package，涵蓋 API/IAM、private VPC、Cloud SQL/PITR、Cloud Run proxy sidecar、ALB/TLS、immutable-only CDN、Identity Platform/TOTP、regional logs、monitoring與50/80/100 budget；`HD-10-1 / 1A`後staging Cloud SQL改為單區，production Regional HA契約不變。37/37 Google resource blocks皆受`local.create_resources` gate，Terraform `fmt`/`validate`與QC 20/20通過；尚未建立任何雲端資源。
    - [x] Phase 2B local application/IaC readiness：Firebase Web/Admin SDK、Google/password/TOTP client flow、revoked-token BFF exchange、八小時rotatable session、UID-only principal mapping、managed email-link invitation與compensation、legacy route closure、Cloud Run secret/bootstrap contract、invitation schema/migration及standalone tracing已完成；focused QC 14/14、preflight 19/19與image `sha256:cf36fa4f6bc68a59db7f632dd9c7df3e81b84ac28cf7c5a5a11034408d7920c3` container smoke通過。
    - [x] Phase 2B Cloud SQL migration與冪等驗證：本機產生Cloud SQL-specific no-file migration package，排除Supabase RLS baseline與Phase 3B GCS pointer，並移除transaction wrapper、forced RLS及Supabase role依賴；Cloud Run Job IaC保存plan只新增1個Job，0 update/0 delete/0 replace。2026-07-15經分段核准後，先建立on-demand backup `1784085929277`，再以Cloud SQL SQL import完成admin bootstrap；首個bootstrap因跨role default privilege被Cloud SQL managed postgres拒絕且transaction rollback，修正後成功。live migration首試connection timeout、次試因approval rule FK順序失敗並rollback；修正seed順序後，`ai-pdm-stg-migration-runner-k5pg9`成功套用18版，`nkrhj`立即重跑為`appliedVersions: []`。Job隨後回復reviewed `--dry-run` image且移除live approval env。完整證據見 `output/dev-046-live-migration/execution-summary.json`；migration與runtime smoke gate均已關閉。
    - [x] Phase 2B employee login alias local slice：完成company-scoped additive schema與Supabase migration mirror、Admin新增／退役別名、登入intent API、Firebase session exchange、登入與`/settings/accounts` UI、production-slice allowlist及21項安全負向測試。intent最長5分鐘、只保存SHA-256 hash、single-use；未知別名回應不列舉帳號，provider UID必須命中同一active PDM user/company；AI_PDM不保存password/MFA/recovery secret。TypeScript、lint、Next production build及desktop/mobile browser QC通過。
    - [x] Phase 2B employee privacy acknowledgement local slice：完成Pilot v1.0 canonical content/hash、SQLite/PostgreSQL migration、immutable published version與ack evidence、first-session pending cookie、exact-version acknowledgement API、protected BFF recheck、invitation activation同交易、`/privacy`、`/privacy/acknowledgement`、login/sidebar discovery及`/settings/accounts` Admin唯讀證據。focused QC 20/20、migration mirror QC 56/56、Phase 2A/2B regression、scoped lint、isolated production build及desktop/mobile browser QC通過；未建立live effective timestamp或employee acknowledgement。
    - [x] Phase 2B Google popup recovery：2026-07-15 staging重現Google帳號選擇視窗未完成或關閉後，主登入頁仍永久維持`處理中`；登入頁已新增專用等待狀態、可操作的取消／重設控制及失敗狀態釋放，focused QC 5/5、Phase 2B regression 14/14、scoped lint與124頁isolated production build通過。後續 staging activation 與 hotfix revisions 已取代當時的未部署狀態；目前 staging 以頂部記錄的 revision 為準。
    - [x] Phase 2B Firebase Hosting OAuth same-origin hotfix：live runtime原使用`firebaseapp.com` authDomain，但使用者入口為`web.app`，Google popup回呼跨來源且未建立Firebase user/session exchange。2026-07-15已保留既有firebaseapp授權並新增`https://jenfu-ai-pdm-stg-361825.web.app` JavaScript origin與`/__/auth/handler` redirect URI；targeted Terraform saved plan僅將Cloud Run `PDM_FIREBASE_AUTH_DOMAIN`切至web.app，0 add/1 update/0 destroy/0 replace，revision `ai-pdm-stg-00004-zcp`承接100%流量。`/login`、`/api/auth/mode`與web.app auth handler post-deploy configuration smoke通過；真人Google登入已建立並查得verified Firebase identity `qxEv2napjvMEmiqIUqwhTCf6gjg2`，`POST /api/auth/firebase/session`到達BFF後以`403 principal_not_active` fail closed，證明OAuth已修復但Cloud SQL principal尚未開通。
    - [x] Phase 2B initial Admin TOTP enrollment與principal bootstrap local package：補上首次privileged Google user的Firebase TOTP enrollment UI；enroll後立即登出並要求再次Google+TOTP登入，不保存TOTP secret。focused QC 9/9、Phase 2B regression 14/14、popup regression 5/5、TypeScript、scoped lint與124頁isolated production build通過。另從canonical schema產生transactional/idempotent/collision-fail-closed staging bootstrap proposal，固定`company-jenfu`、新PDM ID `stg-pdm-admin-001`、NULL password、Google auth identity、default membership、provider-neutral organization/principal mapping、9 roles與237 permissions；static QC 12/12及disposable PostgreSQL 17 shadow 6/6通過，含立即重跑、UID碰撞整筆拒絕及access-only rollback。套件見`output/dev-046-staging-principal-bootstrap/`；後續 live deploy/bootstrap/readback 已記錄於 Phase 2B live isolated staging acceptance。
    - [x] Phase 2B live isolated staging acceptance：dedicated staging project 與 future production project 分離；`HD-10-1 / 1A` 採單區 staging 與 USD 210 估算，production 維持 Regional HA。project、Paid Billing、remote state、Firebase Web App/Google provider、notification channels、session secrets、Artifact Registry、Cloud SQL `ai-pdm-stg-postgres`、Cloud Run `ai-pdm-stg`、external ALB、budget、admin bootstrap、18 版 migration 及冪等驗證均已完成。2026-07-15 使用者採 Firebase Hosting 預設網址作 staging-only 入口；後續 staging authentication activation 以 source snapshot `69a8c1da0c694079940988edbde8c74211f62d19` 通過 provenance gate，部署 application image `sha256:6d4142080c7e4820e11088d60b2ac15378ce87c170d5658c80c1bfe7aa91a6d6` 至 Cloud Run revision `ai-pdm-stg-00005-4xp`，100% traffic；Firebase Hosting 入口 `https://jenfu-ai-pdm-stg-361825.web.app` 可用。Cloud Run Job execution `ai-pdm-stg-migration-runner-ddrfk` 已用 staging private Cloud SQL path 執行 principal bootstrap，readback `allChecksPassed=true`、PDM user `stg-pdm-admin-001`、Firebase UID `qxEv2napjvMEmiqIUqwhTCf6gjg2`、9 roles、237 permissions、NULL application password、無 MFA secret/recovery material；Job 已回復 dry-run image/args 且 bootstrap approval env absent。2026-07-15 後續依使用者 explicit dirty-worktree staging approval，重新部署 image `sha256:c677ab0822328944c304afc17877963f611f010c972400fed838ce5153d1818c` 至 revision `ai-pdm-stg-00007-cam`，移除 AI_PDM TOTP enrollment，並以 AAL1 pilot env 放行公司 Google 帳號。live HTTP/browser smoke：`/login` 200、`/api/auth/mode` 200、未登入 `/api/numbering/permissions` 401、登入頁無 Authenticator/TOTP enrollment 可見文案；production、GCS file authority、ontology future phases 與 `HD-8-4 / 1A` canary 前 restore/reconciliation 仍須獨立 gate。
    - Phase 3A.0 production release：由 `DEV-032 Gate A-E` 唯一派工，吸收原 `DEV-030` database target/capacity 與 `DEV-031` clean-seed/restore/reconciliation 子關卡；Phase 3A file writer/UI/API 全關閉。
    - Phase 3A.1 fixed-duration field gate：使用者於 2026-07-14 以 `HD-9-1` 取消 `DEV-038` / `DEV-FIELD-001` 的固定觀察，不執行亦不得標示為 field-test pass；任何 allowlist 擴大仍由 `DEV-032 Gate E` 明確核准。
    - Future capsule Phase 3B：與 `DEV-033`、`DEV-037` 合併為 GCS file authority/cost/continuity package；需先在 staging 驗證 direct-GCS adapter/IAM/finalize/quarantine/recovery，再另走 release gate。
    - Future capsule Phase 4：Drawing -> Part -> BOM ontology MVP 與 governed event projection；需 named consumer、projection SLO、idempotent replay/DLQ owner，不得形成第二 command path。
    - Future capsule Phase 5-6：第 12/18 個月以實測資料 review Cloud SQL right-size；第 3-5 年各 domain 另立 owner-governed DEV，ProJED 必須另立 repository-owned DEV。
  - 執行範圍：Phase 1A-1E、Phase 2A、Phase 2B local slices、staging database-role admin bootstrap/migration、Firebase Hosting 預設網址、runtime smoke、TOTP UI deploy、live principal bootstrap、exact-source artifact provenance/readback 與 staging authentication activation 已完成。使用者決定短期不上公開 DNS；未執行 production、未修改 ProJED、未執行 GCS file authority。Phase 3-6 仍為 gated contract，pre-canary restore/reconciliation evidence 尚未執行。Phase 3B 與 DEV-047 不得阻擋 Phase 3A 領號／草稿交付。
  - 驗收標準：Cloud Run/Next.js 16 runtime具 current support/LTS posture、upgrade runway且 production source auto-rollout 關閉；external ALB/managed TLS/custom domain 正確，CDN 不快取 private/auth responses；Firebase 僅作 Auth/identity metadata，所有正式 business/workflow/role/session/audit/outbox 只進 Cloud SQL，enabled正式 file 只進 direct GCS，所有 business command/query 只走 portable HTTP/BFF domain services，無 Firestore/Firebase Storage/Functions/Callable/Firestore-trigger authority；clean production 僅 seed initial Admin的新 production ID/最低 config/numbering integrity，local business/draft/demo/test/history/source actor 零搬移且 archive read-only，已用正式號不重發；continuous RPO <= 1 小時，RTO <= 4 Taiwan business support hours，critical event 由 primary+backup all-hours on-call 於 60 分鐘內 acknowledgement/containment；Wave 0 Google Workspace only，Wave 1 包含至少一位受控 non-Google；Cloud SQL restore evidence 符合 closed `HD-8-4`；其餘 IAM、HA、privacy、cost 與 ProJED 邊界依 ADR/SPEC/QA。
  - 必讀文件：`.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`、`.ai-doc/specs/SPEC-PDM-ERP-GOOGLE-CLOUDSQL-002-five-year-platform-ontology-roadmap.md`、`.ai-doc/qa/qa-pdm-erp-google-cloudsql-platform-validation-plan-2026-07-13.md`、DEV-044/045 與歷史 Supabase compatibility evidence。
  - 停止條件：偏離任何 closed HD-6/HD-7/HD-8、canary 前缺少/未通過 `HD-8-4 / 1A` separate-target restore/numbering reconciliation、runtime migration造成未處置 regression、Route Handler/middleware/Server Action持有 domain rules、引入 Firestore/Firebase Storage/Functions/Callable/Firestore-trigger authority、production 搬入非 seed allowlist row/source actor mapping、修改/刪除 source archive、static DB password、runtime support 不明、production auto-rollout，或需要 Cloud Billing、live credential/domain/data、GCS file workflow、production、ProJED、merge/PR/deploy/release 時停止並進相應 gate。
  - 證據：`.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-phase1-implementation-2026-07-13.md`、`.ai-doc/qc/qc-pdm-erp-google-cloudsql-phase1-report-2026-07-13.md`、`.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-phase2a-preflight-implementation-2026-07-13.md`、`.ai-doc/qc/qc-pdm-erp-google-cloudsql-phase2a-preflight-report-2026-07-13.md`、`.ai-doc/reports/rd/rd-pdm-erp-google-cloudsql-phase2b-local-firebase-bff-implementation-2026-07-13.md`、`.ai-doc/qc/qc-pdm-erp-google-cloudsql-phase2b-local-firebase-bff-report-2026-07-13.md`、`.ai-doc/reports/pm/pm-dev-046-phase2b-change-ticket-cost-stop-2026-07-14.md`、`config/platform/staging-preflight.template.json`、`output/dev-046-phase2b-terraform-full-plan/phase2b-full-recovery-v5-plan.json`、`output/dev-046-live-migration/execution-summary.json`、`.ai-doc/reports/rd/rd-dev-046-employee-login-alias-local-slice-2026-07-13.md`、`.ai-doc/qc/qc-dev-046-employee-login-alias-local-slice-2026-07-13.md`、`.ai-doc/reports/rd/rd-dev-046-privacy-notice-acknowledgement-local-slice-2026-07-13.md`、`.ai-doc/qc/qc-dev-046-privacy-notice-acknowledgement-local-slice-2026-07-13.md`、`.ai-doc/qc/qc-dev-046-staging-authentication-activation-2026-07-15.md`、`output/dev-046-staging-principal-bootstrap/live-execution-readback.json`；後續各 phase 依 QA 計畫產出 production/GCS/ontology/release/wave evidence。
  - 計入交付：否（平台開發點，不直接增加第一版領號/草稿使用者交付完成率）

- ↷ DEV-047 [開發點] [P1] [Phase A0 Local Tooling Complete / Phase A Post-Production-Stability Deferred] Legacy public schema bounded migration
  - 摘要：在 production slice 穩定後，將核准的 legacy PDM/platform tables 從鎖定的 `public` 分批移往 bounded schemas，清除 hybrid schema 技術債而不影響第一版上線。
  - 來源 ID：`DEV-PDM-ERP-BOUNDED-SCHEMA-MIGRATION-001`
  - 父任務：`DEV-046`；不計入 `DEV-040` 第一版領號／草稿完成率。
  - 任務清單：
    - [x] Phase A0 Local Inventory Tooling：完成 deterministic machine-readable local baseline、SQL artifact declarations、SQLite/PostgreSQL name mirror、repository/runtime/script/QC lexical dependencies、dynamic SQL review queue、source hashes、explicit external-consumer unknown、zero candidate batches及未執行的read-only PostgreSQL catalog query contract；focused QC 22/22。
    - [ ] Phase A Authoritative Inventory：在穩定 pilot 後，以命名的代表性 PostgreSQL snapshot/runtime catalog與實際migration history校正本機baseline，完成external consumer與owner domain確認；涵蓋table/sequence/index/constraint/FK/view/materialized view/function/trigger/grant/RLS、migration history、SQLite/PostgreSQL mirror、repository raw SQL、script/QC與外部consumer，未知consumer只阻擋其候選batch。
    - [ ] Phase B Contract：依 owner domain/dependency order 排定 migration batches、schema-qualified SQL、old/new app deployment boundary、compatibility behavior、lock/downtime、rollback point 與 evidence preservation；不得以永久 dual write、compatibility view 或 broad search path 收尾。
    - [ ] Phase C Rehearsal：以代表性快照在 disposable PostgreSQL target 逐批 dry-run/apply/rollback，驗證 schema/RLS/grant/migration-history diff、old/new app compatibility、runtime regression 與 downtime。
    - [ ] Phase D Release：只在獨立 release 指令、target identity、backup/restore evidence、downtime owner與每批 go/no-go 齊備後執行；遇未知 dependency、lock、grant/checksum drift 或 regression 立即停止。
  - 執行範圍：Phase A0本機唯讀工具、focused QC與文件已完成，未讀credential、未連DB、未觀察runtime catalog/snapshot、未提出destination/batch、未做DDL。Phase A authoritative inventory只在production canary穩定、target/snapshot/read-only operator/evidence owner齊備後可開始；不要求固定觀察天數。Phase B-D依前階段evidence推進，production schema move仍需專屬release gate。
  - 驗收標準：無斷裂 SQL/FK/view/function/script；stable ID/history 不變；browser grants 仍為零；owner/runtime grants 最小化；每批 rollback/rehearsal/evidence 完整。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-ERP-BOUNDED-SCHEMA-MIGRATION-001.md`、`.ai-doc/qa/qa-pdm-erp-bounded-schema-migration-validation-plan-2026-07-13.md`、DEV-046 ADR/SPEC/QA、provider-neutral PostgreSQL schema/migration authorities、歷史Supabase migration evidence與所有repository/QC dependency inventory。
  - 停止條件：需要 live schema move、table lock/downtime、compatibility view、direct data repair、production、ProJED 或 release artifact 時進專屬 high-risk/release gate。
  - 證據：`output/dev-047-bounded-schema-inventory/local-baseline.json`、`.ai-doc/reports/rd/rd-dev-047-phase-a0-local-inventory-tooling-2026-07-13.md`、`.ai-doc/qc/qc-dev-047-phase-a0-local-inventory-tooling-2026-07-13.md`；未來另需authoritative inventory、migration rehearsal、schema/RLS/grant diff、runtime regression與release evidence。
  - 計入交付：否（production 穩定後的平台治理開發點）

- ✓ DEV-048 [開發點] [本機整合完成] [P1] [Phase 1E P0 QC Passed / Local Only] 圖料號、草稿、狀態與技術移轉入口整合
  - 摘要：把分散的料號草稿、領號、上傳送審與製造交接入口收斂成物件導向建立與案件式技轉流程，並以「正式發布」而非「號碼曾顯示或送審」作為永久占號邊界。
  - 來源 ID：`DEV-PDM-NUMBER-STATE-FLOW-001`
  - 父任務：`DEV-PDM-NUMBERING-004`、`DEV-040`、`DEV-041`、`DEV-PDM-STATUS-UX-002`、`DEV-044`、`DEV-046`
  - 任務清單：
    - [x] Functional Spec：完成 UI 入口、候選號 / 審核鎖定 / 待發布 / 正式號、回收政策、狀態維度、技轉整批送審、錯誤復原與功能 AC。
    - [x] Architecture / ADR alignment：以 DEV-046 Cloud Run/BFF/Cloud SQL/GCS/transactional outbox/signed-ledger 不變量，完成三層 identity、發布 boundary、typed schema、API、權限、併發、migration、compatibility、failure/recovery 與跨規格 amendment。
    - [x] QA Plan：完成 FMEA、fixture、G0-G9 gates、domain/concurrency/API/approval/publication/transfer/migration/UI 1440/1024/768/390/320、visible-error/data-sanity 與 QC evidence contract。
    - [x] Phase 1A RD：完成 draft workspace、typed items、candidate reservation/event、root-first gap allocator、immediate recycle、non-destructive migration classifier、command/audit/receipt/outbox 與 create/read/update/acquire/cancel APIs；RD isolated self-verification通過。
    - [x] 後續開發文件：Phase 1B-1D均補齊可派工契約；文件完成不等於實作完成。
      - 契約包含entry、task IDs、資料/API/權限/transaction、failure recovery、acceptance、evidence、stop與next conditions。
    - [x] Human Decision Gate `HD-048-01..03`：使用者於2026-07-13以`1C / 2C / 3C`關閉。
      - `HD-048-01 / 1C`：`料號草稿 / 領號申請 / 上傳送審 / 製造交接`四個舊側欄入口退出；草稿改由`/parts?tab=drafts`承接，舊URL只保留redirect/guidance與context，不得保留第二套mutation。
      - `HD-048-02 / 2C`：drawing與含drawing/required-file技轉必須有finalized controlled-file evidence；純root/無drawing obligation的part-only可由版本化server rule回`not_required`；production direct GCS verifier未就緒前，需檔案發布維持鎖定。
      - `HD-048-03 / 3C`：不要求三位不同自然人；同一actor可submit/approve/publish，但每步仍需獨立明示permission、command/confirmation/receipt與audit，approval不得自動publish，Admin/角色不隱含其他權限。
    - [x] Phase 1A QC：2026-07-13獨立本機QC通過；aggregate 47/47，Postgres shadow 26/26，Supabase migration mirror 46/46。
      - 證據：disposable `PDM_DATA_DIR`/server、Company A/B、owner/manager/admin/denied、20-way distinct/same-key acquire、direct API bypass、reference blocker、正式主檔零污染與503 no-offline error matrix。
      - 邊界：未使用live PostgreSQL/Cloud SQL/Supabase/Firebase/GCS；不授予G8/G9、staging、production或release credit。
    - [x] Phase 1B RD `DEV-048-1B-01..08`：完成模組CTA、草稿tab、四種create flow、server projection/Now What、candidate確認與watermark、feature flag/舊route compatibility、RWD/a11y與focused UI/route tests。
      - RD證據：14/14 Phase 1B contract、21/21 disposable HTTP、241/241 numbering core、46/46 contextual entrypoints、14/14 entity drawer、27/27 production slice、focused lint與isolated production build通過；browser完成關閉不寫入、建立、取得候選號、取消回收、舊route與1440/1024/768/390/320無整頁overflow驗證。
    - [x] Phase 1B QC：2026-07-13獨立重驗通過；首輪窄螢幕list/drawer及stale access-control regression缺陷已修正並保留追溯。
      - 證據：功能/route/flag/role/company/data-sanity、1440/1024/768/390/320 browser facts、完整390/320 card-list/drawer、253/253 access-control、93/93 governance、TypeScript/lint/build均通過。
    - [x] Phase 1C RD `DEV-048-1C-01..08`：approval action/snapshot、review locks/apply、PublicationEvidencePort、explicit atomic publication、workspace actions及automation已完成。
      - 範圍：permission parity、approval action/snapshot、submit/withdraw、decision apply locks、PublicationEvidencePort fake/fail-close、explicit atomic publish、workspace actions、fault/SoD/regression tests。
    - [x] Phase 1C QC：初審阻擋五項缺口修正後，獨立重驗43/43通過；無P0/P1/P2 finding。
      - 證據：approve-zero-master、snapshot immutability/stale、每個publish write-point rollback、collision/evidence/idempotency/outbox與role/company browser facts。
    - [x] Phase 1D RD `DEV-048-1D-01..10`：完成transfer draft scope、readiness、aggregate review/frozen snapshot/invalidation、batch publish、published-only handoff、三tabs、redirect/guidance compatibility與focused regressions。
      - 範圍：transfer draft scope schema/API、readiness、aggregate review/frozen snapshot/invalidation、batch publish、published-only handoff、三tabs、redirect/guidance compatibility與focused regressions。
    - [x] Phase 1D QC：首輪3個P1、2個P2修正後，獨立重驗未留P0/P1/P2；focused aggregate 60/60。
      - 證據：migration parity、scope command replay、ReleaseFailed resubmit/edit/cancel recovery、batch all-or-none、manufacturing/procurement published-only、old bookmarks、RWD/a11y與transfer/approval/numbering/lifecycle regressions。
    - [x] Request-equivalence repair：2026-07-14補回048前領號申請規則在新草稿flow中的等價行為；包含主根號輸入轉server ID、append-policy預覽、正式主根追加原因、查重提示/阻擋、主根管理料號品名、共用原因、M/MA primary manufacturing防呆、關閉modal不寫入提示，以及對應SQLite/PostgreSQL/Supabase migration mirror。
      - 證據：`.ai-doc/reports/rd/rd-dev-048-request-equivalence-repair-2026-07-14.md`、`output/playwright/number-state-request-equivalence/`、`qc:pdm-number-state-flow-request-equivalence` 6/6、`qc:supabase-runtime-migrations` 66/66、`qc:pdm-number-state-flow-contract` 19/19、`qc:pdm-number-state-flow-runtime` 7/7、`qc:pdm-number-state-flow-http` 21/21、`qc:pdm-number-state-flow-ui` 7/7、`qc:pdm-number-state-flow-phase1b` 14/14、`qc:pdm-numbering-core` 241/241、typecheck與lint通過；2026-07-14依使用者授權重啟3000後，`PDM_NUMBER_STATE_FLOW_V1=true` browser smoke通過。
    - [x] 2026-07-17整合來源校正：帳號邀請、production CI/IaC、DB及平台架構採production/main；前端UI與圖料號申請採已通過QC的DEV-048 owner-surface契約。`/parts?tab=drafts`承接領號申請；`/numbering/part-drafts`與`/numbering/request`的舊`page.tsx`/`layout.tsx`已實體移除，舊URL只由middleware保留redirect與query/`returnTo` context，不存在第二套mutation UI；Cloud SQL schema/provider、BFF boundary、正式發布與不可重用規則不變。
      - 整合證據：Phase 1B contract 15/15、production slice 33/33、request equivalence 11/11、contextual entrypoints 47/47、numbering core 241/241、change control 62/62、lifecycle 266/266、series code 10/10、v2 compatibility 13/13、v3 14/14、number effectiveness 5/5、status scope 84/84、status vocabulary 94/94、legacy request owner browser 34/34、legacy draft owner browser 11/11、TypeScript與isolated production build 122頁通過；build route manifest不含兩個已退役頁面。Lint 0 error／3個既有warning。
    - [x] Phase 1E P0 原始建立圖料號等價修復：2026-07-15依公司管理辦法與使用者決策，補回品名規則引導、圖號需求判斷與非阻擋查重；此為048造成的原始功能等價缺口，不另開DEV。
      - 約束：不改v3編碼原則；不落地`000`萬用料號；不改M/R用途碼；品名不要求唯一且相似品名查重不得阻擋建立，只能提醒；唯一性由圖號/料號與正式發布authority承擔。
      - P0完成：管理辦法品名建議器、`確定品名`、外購/自製/共用分流、半形底線串接、獨立系列代號 metadata、料件類型分流、查重提醒不阻擋、圖號需求引導、focused QC防回歸。
      - P0證據：`.ai-doc/reports/rd/rd-dev-048-phase1e-name-builder-repair-2026-07-15.md`、`qc:pdm-number-state-flow-request-equivalence` 10/10、`qc:pdm-number-state-flow-phase1b` 14/14、`qc:pdm-numbering-contextual-entrypoints` 46/46、`qc:pdm-number-state-flow-contract` 19/19、`qc:pdm-number-state-flow-runtime` 7/7、`qc:pdm-number-state-flow-http` 21/21、TypeScript、lint、`dev:local:check`通過。
      - 2026-07-15 UI雜訊修正：移除建立草稿表單可見的`須製程管制`，圖號需求只保留`包含圖號草稿`；共用件不再推導圖號需求，並移除共用件常識說明。Browser QC確認自製預設包含圖號、外購與共用預設不包含圖號，桌面/手機無overflow；截圖`qc-remove-process-control-noise-desktop.png`、`qc-remove-process-control-noise-mobile.png`位於`output/playwright/number-state-phase1e/`。
      - 2026-07-15 管理辦法品名命名browser QC：本機Admin session於`/numbering/search?create=numbering`建立`腳架測試121150_JF_100L_白鐵_A`草稿，驗證`確定品名`、半形底線、品名/料號系列欄位拆分、建立草稿201、取得候選號200、取消回收200、桌面1440與手機390無visible error/console error/horizontal overflow，正式主檔計數前後不變；截圖`qc-name-builder-create-modal-desktop.png`、`qc-name-builder-candidate-desktop.png`、`qc-name-builder-candidate-mobile.png`、`qc-name-builder-cancelled-desktop.png`位於`output/playwright/number-state-phase1e/`。後續真人 staging UI 重測改以單一`系列代號（選填）`欄位作自製非共用件 metadata，不再要求自動併入`確定品名`。
      - 2026-07-15 QC reopen與修復：實際瀏覽器曾發現既有`data/ai-pdm.sqlite`缺`numbering_draft_workspaces.append_reason`導致`POST /api/numbering/draft-workspaces` 500；RD補上啟動時additive SQLite repair（`append_reason`、`universal_reason`）與QC斷言後重啟3000，browser QC以本機Admin session完成建立草稿201、取得候選號200、取消回收200，桌面1440與手機390無visible error/console error/horizontal overflow，正式主檔數未增加、候選號全回收；截圖在`output/playwright/number-state-phase1e/`。本機session cookie只驗證UI/API工作流，不是登入流程evidence。
      - P1後續：既有圖號新增料號變體 / 一圖多料號入口需另補draft relation contract，不得用舊正式寫入API繞過草稿發布邊界；此後續不阻擋Phase 1E P0與DEV-048本機整合完成判定。
  - 執行範圍：Phase 1A-1E P0 local product integration與focused QC已完成；Phase 1E只修復建立圖料號UI/flow等價缺口與既有本機SQLite additive compatibility repair，不改編碼authority、不新增正式authority schema、不接live provider。live provider、正式資料、staging、deployment與release不在本輪。
  - 範圍外：live Cloud SQL/Firebase/GCS、歷史資料實際repair、production seed/migration、Pack-and-Go parser/baseline、merge/PR/deploy/smoke/rollback/release。
  - RD主管判定：DEV-048 Phase 1A-1E P0本機整合完成；建立圖料號已恢復品名引導、圖號需求引導與warning-only查重。approval不寫master、publish維持第二個明確command，provider snapshot immutable、跨公司non-disclosure、batch rollback、失敗後解鎖與published-only handoff均有獨立證據；正式上線仍須release gate。
  - 停止條件：若要改永久發布邊界、重用正式號、自動/固定冷卻、跨公司號池、auto-demote legacy master、offline issuance、live data repair/provider/release，須人類 re-entry及對應high-risk/release gate。
  - 證據：`.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`、`.ai-doc/decisions/ADR-PDM-NUMBER-STATE-FLOW-001-publish-boundary-and-candidate-reservation.md`、`.ai-doc/qa/qa-pdm-number-state-flow-validation-plan-2026-07-13.md`、`.ai-doc/reports/rd/rd-dev-048-phase1a-number-state-flow-report-2026-07-13.md`、`.ai-doc/qc/qc-pdm-number-state-flow-phase1a-report-2026-07-13.md`、`.ai-doc/reports/rd/rd-dev-048-phase1b-number-state-flow-ui-report-2026-07-13.md`、`.ai-doc/qc/qc-pdm-number-state-flow-phase1b-report-2026-07-13.md`、`.ai-doc/reports/rd/rd-dev-048-phase1c-number-state-flow-publication-report-2026-07-13.md`、`.ai-doc/qc/qc-pdm-number-state-flow-phase1c-report-2026-07-13.md`、`.ai-doc/reports/rd/rd-dev-048-phase1d-number-state-flow-transfer-report-2026-07-13.md`、`.ai-doc/qc/qc-pdm-number-state-flow-phase1d-report-2026-07-13.md`、`.ai-doc/reports/rd/rd-dev-048-request-equivalence-repair-2026-07-14.md`、`output/playwright/dev048-phase1d-qc/`、`output/playwright/number-state-phase1e/`。
  - 下一步：若要處理既有圖號新增料號變體 / 一圖多料號，先補Phase 1E P1 draft relation contract；provider/staging或production release須另行明確派工。
  - 計入交付：否（開發點）；文件 ready 不計產品完成，待實作/QC後再由PM依交付點規則更新。

- ✓ DEV-050 [交付點] [本輪本地範圍已完成 / Focused QC Passed] [P0] [Phase 1A+1B Local] 版次發布閘門與建議版次決策引擎
  - 摘要：依管理辦法版次原則補齊 lifecycle enforcement，阻止小數版進入正式 `Released`，並把建議版次改成 server-created / submission-snapshot policy evidence。
  - 來源 ID：`DEV-PDM-REVISION-POLICY-002`
  - 父任務：`DEV-PDM-REVISION-001`、`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`、`DEV-PDM-DRAWING-REVISION-PACKAGE-002`、`DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
  - 人類決策：`HD-050-01 / 1C` 採 RD Implementation Ready 且逐步確認；`HD-050-02 / 2A` 先做 P0 release gate 加自動建議版次；`HD-050-03 / 3A` 小數版緊急使用不得借用 `Released`；`HD-050-04 / 1C` 實作順序先建議版次再 release gate；`HD-050-05 / 2B` 建議版次只在 API response 產生並於送審 snapshot 固化；`HD-050-06 / 3C` Phase 1 不開放緊急使用情境。
  - 任務清單：
    - [x] PM critique：確認現行系統僅驗證格式與重複，未在 release workflow 強制小數版不得 `Released`。
    - [x] SPEC：建立效用理論取捨、演算法契約、suggestion snapshot、release gate、資料/API/權限/停止條件。
    - [x] QA Plan：建立 Phase 1A/1B 負向矩陣，含 approval route、retry-release、direct workflow、major regression、suggestion stale/override。
    - [x] Phase 1A RD：讓建議版次由 API response server-side 產生，送審時把 suggested / selected / override / policy metadata 固化到 submission snapshot，不新增獨立 policy table。
    - [x] Phase 1B RD：實作 `assertRevisionPolicyCanTransition`，在 final approval、release workflow、retry-release 前阻擋 minor -> `Released`。
    - [x] Phase 1C：延後且不開放；未新增 `ConditionalUse` / `TrialApproved` 或任何緊急使用替代路徑。
  - 執行範圍：本輪完成 Phase 1A suggestion snapshot、Phase 1B release gate、focused QC 與文件同步；未操作正式資料、live provider、deployment、release、merge、PR 或歷史資料修復。
  - 驗收標準：系統依 workflow intent 自動建立建議版次，送審 snapshot 固化 suggested/selected/override/policy metadata；小數版 `0.2` / `1.1` 從所有 release path 都不得寫成 `Released`；整數版 `1` / `2` 既有 release gate 不因本規格被破壞；override 需理由且不得繞過 release gate；Phase 1 不顯示或接受緊急使用路徑。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`、`.ai-doc/qa/qa-pdm-revision-policy-release-gate-validation-plan-2026-07-17.md`、`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`、`.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`。
  - 停止條件：需要讓小數版變成 `Released`、改嚴格 chronological approval、為建議版次新增獨立 policy table、production migration、歷史資料修復/刪除、live data mutation、deploy/release、或開放 conditional-use / trial emergency lane 時停止。
  - 證據：`.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`、`.ai-doc/qa/qa-pdm-revision-policy-release-gate-validation-plan-2026-07-17.md`、`npm.cmd run qc:pdm-revision-policy-suggestion` 14/14、`npm.cmd run qc:pdm-revision-policy-release-gate` 11/11、`npm.cmd run qc:pdm-change-control` 62/62、`npm.cmd run qc:pdm-drawing-submission-workbench-recovery` 27/27、`npm.cmd run qc:pdm-drawing-submission-review-only` 14/14、`npm.cmd run qc:pdm-drawing-revision-package-model` 59/59、`npm.cmd run qc:pdm-release-master-status-sync` 31/31、`npm.cmd run lint`、`npx.cmd tsc --noEmit --pretty false`。
  - 下一步：若要合併、部署或正式 release，走既有 release gate；若要開放 emergency-use / conditional-use / trial-approved，需另起人類決策、ADR 與狀態機設計。
  - 計入交付：是（正式版次生命週期 P0 安全交付點；Phase 1A/1B 已完成本機產品實作與 focused QC）

- ✓ DEV-051 [交付點] [本機完成 / QA-QC Passed] [P1] [Local Only / Release Gate Required] 保留號首版圖面版次預告與建立入口
  - 摘要：把保留號成立後的版次提示提前到 reserve-number detail，移除或重標 raw `rowVersion` 的 `v2` 誤讀，並提供 `建立首版圖面` CTA 進入 `/numbering/revisions` 由 server suggestion 決定可編輯版次。
  - 來源 ID：`DEV-PDM-REVISION-TIMING-UX-001`
  - 父任務：`DEV-048`、`DEV-050`、`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 人類決策：2026-07-18 使用者指出新保留號顯示 `新圖料 · v2` 造成版次誤解，並要求評估版次調整時間點是否應提前；PM 結論採「提示提前，正式承諾延後」。
  - 任務清單：
    - [x] SPEC：建立保留號到首版圖面版次預告、rowVersion 顯示、CTA handoff、資料/API/權限/停止條件。
    - [x] QA Plan：建立 rowVersion 誤讀、建議版次提示、CTA handoff、版次編輯點、visible-error、RWD 與 `DEV-050` regression 驗證矩陣。
    - [x] RD Implementation Contract：補齊 `src/components/number-state-workspace.tsx`、`/numbering/revisions`、resolve route、revision workbench context、focused QC script 與 `package.json` 的檔案級變更契約。
    - [x] Phase 1A RD：reserve-number list 不再顯示 raw `v{rowVersion}`；內部版本明確標為 `系統紀錄版本` 並降層到 detail/audit。
    - [x] Phase 1B RD：reserve-number detail 新增 `圖面版次準備` 區塊，顯示 server-derived `建議研發版次`、`尚未建立版次`、retry/no-drawing 狀態與候選態停用原因。
    - [x] Phase 1C RD：新增 publication/promotion 與 `numbering.draft.update` permission-gated `建立首版圖面` handoff 到 `/numbering/revisions`；receiving workbench 重新呼叫 server suggestion、傳遞 workflow intent 並保留人工版次修改。
    - [x] Phase 1D QC：static/API/browser/RWD/visible-error/data-sanity 與 `DEV-050` / `DEV-048` regression 驗證通過。
  - 執行範圍：完成本機 UI/API handoff、central suggestion alignment 與 focused QC；未新增 revision authority table、未改 release gate、未操作正式資料或 live provider。
  - 驗收標準：新保留號清單不再出現可誤解的 `v2`；detail 清楚顯示建議研發版次與尚未建立版次；版次只在首版圖面/進版工作台可編輯；送審 snapshot 與 minor `Released` gate 仍由 `DEV-050` 控制。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-REVISION-TIMING-UX-001-reservation-first-drawing-revision-entry.md`、`.ai-doc/qa/qa-pdm-revision-timing-ux-validation-plan-2026-07-18.md`、`.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`、`.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`。
  - 停止條件：需要把版次持久化到保留號、信任 query-string revision、允許小數版成為 `Released`、開放 emergency-use / `ConditionalUse` / `TrialApproved`、production migration、live data repair、deploy/release 時停止。
  - 證據：`.ai-doc/specs/SPEC-PDM-REVISION-TIMING-UX-001-reservation-first-drawing-revision-entry.md` Section 5-16、`.ai-doc/qa/qa-pdm-revision-timing-ux-validation-plan-2026-07-18.md` Section 3-14、`scripts/qc-pdm-reservation-revision-timing-ux.mjs` 13/13、`qc:pdm-revision-policy-suggestion` 14/14、`qc:pdm-revision-policy-release-gate` 11/11、`qc:pdm-number-state-flow-phase1b` 15/15、`qc:pdm-number-state-flow-ui` 7/7、`qc:pdm-drawing-submission-workbench-recovery` 27/27、`qc:pdm-drawing-submission-review-only` 14/14、TypeScript、lint、`git diff --check`、`qc:doc-paths` 23/23、`qc:dev-task-evidence-sync` 13/13、`qc:dev-task-completion-audit` 8/8、`output/playwright/dev051-reservation-revision-timing-ux/` 六張桌機/平板/手機截圖與 0 console errors / 0 warnings。
  - 下一步：產品本機範圍已完成；只有明確 merge/PR/deploy/release 指令才進 release gate。Phase 1C emergency-use 仍不開放。
  - 計入交付：是（產品 UX 交付點；Phase 1A-1D 已本機完成並通過 QA/QC）

- ✓ DEV-052 [交付點] [本機完成] [P0] [Phase 1A-1D Local QC Passed / Production Release Gated] 圖料生命週期效率優先簡化
  - 摘要：將「保留號 → 號碼送審 → 核准 → 人工發布 → 建立首版圖面」簡化為「建立料件 → 完成首版圖面並一次送審 → 核准」，由系統原子完成正式化；既有保留號以零回填 compatibility projection 進入同一流程並往前推進。
  - 來源 ID：`DEV-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001`
  - 父任務：`DEV-048`、`DEV-050`、`DEV-051`、`DEV-PDM-APPROVAL-PLATFORM-001`
  - Human Decision Gate：
    - [x] `HD-052-01`：既有保留號直接進入新流程並從現況往前推進；採 read-time projection，不永久保留第二套 legacy UI，也不對舊 rows 做 bulk conversion/backfill。
    - [x] `HD-052-02`：候選圖號可建立、編輯不可正式使用的首版圖面草稿；整包送審 snapshot 才固化版次、檔案與圖料關係。
    - [x] `HD-052-03`：整包核准後由同一冪等 outer transaction + savepoint 自動正式化；任一驗證／正式化寫入失敗時 domain rows全數 rollback，但保留 immutable decision與 `apply_failed` 診斷，進 `recovery_required` 後只重試原 approved snapshot。
    - [x] `HD-052-04`：保留既有 `/numbering/drawings?tab=reserved` 與 `保留號` 頁籤，不建第二套V2/legacy頁；V2工作區標題為 `保留號／首版準備`，正式化後移入正式圖號並保留歷史查閱。
  - 目標流程：`建立料件（自動保留候選號） → 完成首版圖面並一次送審 → 核准 → 系統自動正式化`。小數研發版以 physical `Pending` package + immutable companion 投影 effective `ReviewApproved`，仍不可成為 production-effective `Released`。
  - UI 決策：保留 `/numbering/drawings?tab=reserved` 與 `保留號` 頁籤，不建立第二套新版頁；V2工作區標題為 `保留號／首版準備`。正常狀態只顯示一個primary CTA，`Now What`只用於empty/legacy/blocked/recovery/terminal分流；正式化成功後離開預設進行中清單，轉入正式圖號且歷史仍可查。
  - 既有資料相容：
    - `active` 直接映射為 `drawing_preparation`；開啟 list/detail/drawer 零寫入，只有使用者明確建立 candidate revision 才新增 additive rows。
    - 舊 `review_locked` number-only request 繼續原審核；核准後進 `drawing_addendum_required`，撤回／退回則進完整 bundle preparation，不得盲目 auto-publish。
    - 舊 `approved_locked` 將原核准當號碼基線，補齊圖面後只做差異 addendum review；核准後才 auto-finalize。
    - `published/promoted`、`cancelled/recycled` 維持終結事實；矛盾狀態進 `recovery_required`，不得推測或自動修復。
  - 任務清單：
    - [x] Phase 0A Brief／guided decisions：完成效率、既有資料、安全、自動正式化與保留號頁面延續四項人類決策。
    - [x] Phase 0B RD Contract：完成 authoritative SPEC、ADR、QA plan、Spec Impact Preflight與既有規格 amendment。
    - [x] Implementation readiness：完成 exact files/migrations/repositories、outer transaction + savepoint、API/error/idempotency、physical/effective status相容方案、phase evidence與 production-slice/file-authority blockers，已可逐檔派工。
    - [x] Phase 1A：完成 compatibility projection、additive candidate schema、zero-write read path、default-off feature flag與 SQLite/PostgreSQL/Supabase migration parity；local only。
    - [x] Phase 1B：完成 candidate first-revision workbench、finalized evidence binding、保留號頁整合與單一 next-step UI；local only。
    - [x] Phase 1C：完成 versioned bundle review、atomic auto-finalization、payload-aware idempotency、apply-failed recovery、permission/audit/outbox；local only。
    - [x] Phase 1D：完成 legacy pending/approved addendum continuation、sanitised fixture rehearsal、DEV-048 runtime／DEV-050 release gate／migration／browser／build focused regression。
    - [ ] Release gate：staging GCS authority、backward-read/rollback、target/backup/recovery owner與 production activation；需獨立指令。
  - Spec Impact Preflight：`Intentional replacement`。DEV-052 啟用後，對 `numbering.candidate_bundle_review` 取代 DEV-048「approval 不自動 publication」，並取代 DEV-051「publication/promotion 前不得建立首版圖面」；舊 `numbering.candidate_publication_review` snapshot/apply 不被靜默修改。DEV-050 minor `Released` 禁令完整保留。
  - 驗收標準：保留 `/numbering/drawings?tab=reserved`、`保留號` tab與 `保留號／首版準備` 工作區標題；新案件只有一次送審與一次核准；既有 `active` 保留號直接顯示 `完成首版圖面`；正常狀態只有一個primary CTA且不顯示重複Now What；正式化後移出預設進行中清單但正式頁／歷史可查；open/read/bootstrap零寫入；舊 number-only核准不得發布未審圖面；auto-finalization全有或全無且重送不重複配號、建master、建版或發event；小數版只到effective `ReviewApproved`；跨公司、無權限、stale snapshot、未finalized file evidence全部fail closed。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`、`.ai-doc/decisions/ADR-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-additive-adoption-and-auto-finalization.md`、`.ai-doc/qa/qa-pdm-number-lifecycle-simplification-validation-plan-2026-08-03.md`，以及 DEV-048／050／051 authority。
  - RD 派工邊界：Phase 1A exact files為 `db/schema.sql`、`db/postgres/021_number_lifecycle_simplification.sql`、Supabase mirror/manifest、V2 feature status、pure projection/read repository、focused schema/data-protection scripts與 `package.json`；Phase 1A 不新增 mutation route/UI CTA、不修改 production-slice allowlist。
  - 執行範圍：Phase 1A-1D 本機產品程式、additive schema/mirror、API、UI 與 QA/QC 已完成；feature flag 預設 off、production mutation allowlist 未開放，未連 production、未 backfill、未 deploy/release。
  - 停止條件：需要更新／刪除／回填既有 reservation/workspace/approval/master rows、舊 app 無法讀新 schema/state、approval apply 無法原子冪等、production file authority 未就緒、放寬 minor release gate、live credential/data repair、merge/PR/deploy/release 時停止並進獨立 data/release gate。
  - 下一步：本機產品範圍已完成；只有明確 staging／migration／deploy／release 指令才進獨立 release gate，並先完成真實 GCS authority、target identity、backup/rollback與 production smoke 授權。
  - 證據：`.ai-doc/qc/qc-dev-052-number-lifecycle-simplification-2026-08-04.md`、`output/playwright/dev052-real-operation/DEV052-20260804-045957-local-isolated/`、`npm run qc:dev-052`、DEV-052 schema 12/12、data protection 4/4、HTTP/idempotency 10/10、UI 15/15、flow/atomic recovery 8/8、AI真實操作41/41、revision release gate 11/11、DEV-048 runtime 7/7、Supabase migration 69/69、全專案lint、TypeScript與隔離production build。
  - 計入交付：是（本機產品 UX 與交易流程交付點；production activation 仍未計入）

- ☐ DEV-053 [交付點] [RD Implementation Ready / Human Confirmed] [P1] [Phase 1A Local Only / Awaiting RD] 單一圖號工作台與生命週期導向操作
  - 摘要：將「圖號總表／保留號」雙分頁改成單一「圖號工作台」，讓使用者從同一列判斷目前階段與唯一下一步；UI合併但保留工作區、正式主資料、版次與審核authority仍維持分離。
  - 來源 ID：`DEV-PDM-UNIFIED-DRAWING-WORKBENCH-001`
  - 父任務：`DEV-052`、`DEV-050`、`DEV-051`
  - Human Decision Brief：
    - [x] 取消「圖號總表／保留號」兩個頁面與頁籤；canonical UI為單一「圖號工作台」。
    - [x] 「保留號」由頁面名稱改為資料生命週期狀態；使用者不需先判斷資料位於保留工作區或圖號主資料。
    - [x] 主清單預設聚焦「我的待處理」，仍可用搜尋與狀態篩選查閱全部、正式及歷史資料。
    - [x] canonical row unit依生命週期切換：進行中一個workspace/bundle一列；正式化後每張drawing master一列，完成workspace不再佔top-level列，只由drawer/audit追溯。多圖bundle不得被誤壓成單一正式圖號，也不得顯示candidate＋formal重複列。
    - [x] UI單頁化不得合併底層資料表、放寬權限、改寫既有資料、重播審核或降低DEV-050/052交易與release gate。
  - 問題：目前雙分頁反映系統資料型態，不符合使用者「找一個圖號、看目前階段、做下一步」的心智模型；相同建立、附件、送審與狀態說明存在平行入口，增加選錯流程的風險。
  - 使用者價值：減少頁面選擇與狀態翻譯；研發人員在單一清單即可完成從建立候選內容到正式圖號後續進版的連續工作。
  - UX Intent：
    - 使用者：研發工程師、研發主管、PDM Admin及需要查閱圖號狀態的人員。
    - 主要任務：搜尋或建立一筆圖號工作，理解目前階段、使用風險與唯一下一步。
    - 成功狀態：首次看到列資料5秒內能回答「這是什麼、目前在哪一步、能否正式使用、下一步按哪裡」。
    - 頁面：H1為`圖號工作台`；主畫面只有搜尋、範圍、狀態篩選、`建立圖號`與資料表。
    - 主清單欄位：`圖號`、`品名`、`目前階段`、`下一步`；料號關聯、檔案、審核、發行、追溯與audit進drawer。
    - 安全預設：預設顯示使用者待處理工作；已取消、作廢與歷史資料不搶占主清單，但可由狀態篩選查回。
    - 不可發生：同一來源同時顯示candidate列與其formal列、同時顯示多個primary CTA、把多圖bundle遺失成一列、從主資料drawer直接繞過保留／首版／整包審核建立正式圖料號。
  - 主要流程與唯一下一步：

    | Visible stage | 主畫面必要資訊 | 唯一 primary CTA | Secondary / history |
    |---|---|---|---|
    | 建立中／尚未產生圖號 | 申請名稱、缺少內容、尚未占用號碼 | `繼續建立` | `取消` |
    | 已保留／首版未完成 | 候選圖料號、`尚不可正式使用`、首版缺項 | `完成首版` | `編輯`、`取消保留` |
    | 首版已完成 | 將被鎖定的圖料號、關係、版次與檔案摘要 | `送交審核` | `編輯` |
    | 審核中 | 審核責任與鎖定範圍 | `查看審核` | 符合規則時`撤回` |
    | 系統正式化中 | 核准完成、系統處理中、禁止重複操作 | 無人工CTA | `查看處理狀態` |
    | 研發版已核准／主資料已建立 | 尚未成為量產Released的風險、正式圖號入口 | `查看圖面` | `追溯` |
    | 已發布 | 現行版次、使用效力與開發階段 | `建立新版` | `追溯`、`影響`、`申請作廢` |
    | 已取消／已作廢／歷史 | 終結原因與不用再處理的結論 | `查看紀錄` | 無復活或發布捷徑 |

  - 初步開發範圍：
    - [ ] 移除`圖號總表／保留號`頁籤，將`/numbering/drawings`改成單一生命週期清單與統一drawer。
    - [ ] 建立候選workspace與drawing master的server-side read-only統一投影；以namespaced stable row key定義canonical row unit、去重、排序、搜尋、cursor分頁與狀態filter，browser不得自行拼接兩支清單。
    - [ ] 將`建立保留號`改成使用者意圖語言`建立圖號`，但仍走DEV-052候選保留、首版與整包審核流程。
    - [ ] 將`新增同根圖號／新增同圖料號`改為帶入既有主根脈絡後建立候選workspace，不得直接POST新增master。
    - [ ] 將受控CAD／2D／DWG／PDF檔案寫入集中到候選首版或正式版次工作台；圖號主資料drawer只保留唯讀摘要，非受控檔案若仍存在須明確標為`參考附件`。
    - [ ] 依生命週期只顯示一個primary CTA；`進版`、`送審`、`查看審核`不得在同一正常狀態並列競爭。
    - [ ] 合併狀態說明入口；說明內容改用新版生命週期與下一步語言，不再顯示舊number-only review／人工發布教學。
    - [ ] 舊`?tab=reserved`、既有detail/query deep link與書籤採零寫入相容導向，找不到目標時提供安全返回與篩選復原。
  - Scope外：不合併或刪除既有workspace/master/revision/approval資料表；不批次回填、搬移、改號或刪除production資料；不改DEV-052整包核准自動正式化、DEV-050小數版Released禁令、既有審核決策與稽核證據；本機只允許三個nullable source-context欄位及migration artifact，production migration、deploy與release仍不執行。
  - RD Implementation Contract：
    - SPEC：`.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`。
    - QA：`.ai-doc/qa/qa-pdm-unified-drawing-workbench-validation-plan-2026-08-04.md`；執行時由AI以真實登入、點擊、輸入、檔案上傳、送審、審核與重新載入操作，不以API/DB mutation代替UI流程。
    - ADR：`.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`；Accepted，鎖定server一致性投影與三個nullable source-context欄位。
    - Read model：`GET /api/numbering/drawings/workbench`與row-key detail為唯讀BFF；同一company/permission/read-consistency邊界產生清單，任一來源失敗整體fail，不回partial list；所有open/search/filter/deep link zero-write。
    - Row identity：`candidate:{workspaceId}`與`drawing:{drawingNumberId}`為概念性namespaced identity。1個多圖candidate bundle正式化後切成N個formal drawing rows，completed workspace只保留來源追溯。
    - Action routing：primary action由server lifecycle/capability resolver決定；統一API不代理mutation，建立、候選首版、bundle review、formal revision與作廢各回原authoritative command handler。
    - Parallel-path closure：DEV-053 UI中的`新增同根圖號／新增同圖料號`必須建立帶source context的candidate workspace，不得直接POST建立master；`append_part`允許只含新part與指定existing drawing關係，不複製existing revision；`append_drawing`可保存指定existing part。
    - File authority：candidate revision或formal revision package為受控檔案唯一寫入點；drawing master drawer唯讀。若保留一般附件，必須改稱`參考附件`且排除publication evidence。
    - Permission：統一讀取取drawing view與workspace visibility交集；`mine`只收server可證明由目前actor負責的owner/reviewer/recovery工作；Admin名稱不隱含command permission。
    - Rollout：`PDM_UNIFIED_DRAWING_WORKBENCH_V1`預設off，只可在DEV-052 lifecycle V2相依能力可用時開啟；錯誤組態fail closed或完整回退舊UI，不得形成半套UI／雙mutation path。
  - Schema/migration boundary：
    - `numbering_draft_workspaces`只additive新增`source_drawing_number_id`、`source_part_number_id`、`source_link_type`三個nullable欄位；既有rows維持NULL，零backfill、零改號。
    - exact artifacts：`db/schema.sql`、`db/postgres/022_unified_drawing_workbench.sql`、`supabase/migrations/20260804020000_unified_drawing_workbench.sql`、migration manifest與`src/lib/db.ts` SQLite `ensureColumn`。
    - source IDs必須同company/root、drawing與part互斥、link type成對存在；facts hash、approved snapshot與atomic formalization均包含source context。
  - Exact implementation files：
    - Server：`src/lib/drawing-workbench.ts`、`src/lib/repositories/drawing-workbench-async-repository.ts`、必要的`numbering-async-repository.ts`／`numbering-repository.ts` batch read、兩支`/api/numbering/drawings/workbench` GET routes。
    - Lifecycle：`src/lib/number-state-flow.ts`、`src/lib/repositories/number-state-flow-async-repository.ts`、`src/lib/number-lifecycle-simplification.ts`、`src/lib/repositories/number-lifecycle-simplification-async-repository.ts`、draft workspace create route。
    - UI：`src/app/numbering/drawings/page.tsx`、新增`src/components/drawing-workbench.tsx`、`number-state-workspace.tsx`、`master-attachment-panel.tsx`、`numbering-contextual-entrypoints.tsx`、status help/display與`globals.css`。
    - Flag：`src/lib/number-state-flow-feature.ts`與`src/app/api/numbering/state-flow/status/route.ts`；status response key為`drawingWorkbench`。
  - Sequential implementation slices：
    - `Phase 1A`（下一步）：schema/source context、snapshot/formalization、consistent read repository/service、list/detail API、default-off flag；exit為schema/read-model/HTTP/zero-write與DEV-052 regression。
    - `Phase 1B`：單頁list/drawer、舊URL、master attachment read-only、status help、四種viewport；須等1A evidence。
    - `Phase 1C`：contextual append改道、relationship-only bundle、cross-boundary relation、action routing；須等1B evidence。
    - `Phase 1D`：AI真實操作、完整回歸、build與獨立QC；QC不得改產品後自判通過。
  - Focused commands：新增`qc:dev-053:schema`、`read-model`、`http`、`ui`、`flow`、`real-operation`及aggregate；並重跑`qc:dev-052`、contextual entrypoints、master attachments、revision release gate、numbering core、production slice、typecheck、lint與isolated build。
  - Rollback：關閉DEV-053 flag完整回舊雙頁；additive nullable欄位保留供追溯，不做down migration刪欄／清資料。任何production rollout另走backup、migration rehearsal、flag與smoke gate。
  - 驗收方向：
    - [ ] `/numbering/drawings`只呈現一個工作台且無雙分頁；舊reserved URL可安全到達等效工作中範圍。
    - [ ] 候選、審核、正式化、主資料、已發布及歷史狀態皆能在同一搜尋入口查得；進行中bundle一列，正式化後每張formal drawing一列且completed workspace不重複顯示。
    - [ ] 多圖bundle正式化前後正確由1列切換為N張正式圖號列；候選號、正式號與來源workspace ID都能定位canonical row與來源追溯。
    - [ ] 每個正常狀態只有一個primary CTA，且CTA與狀態矩陣一致；disabled／blocked狀態同時提供原因與替代下一步。
    - [ ] 既有保留號與正式圖號在純瀏覽、搜尋、篩選、開drawer及舊網址相容導向時零寫入、零回填、零改號。
    - [ ] 所有新增與追加同根圖料號均進入候選workspace；不得由統一工作台繞過首版與整包審核直接建立master。
    - [ ] 新增同圖料號保存指定existing drawing且允許relationship-only review；新增同根圖號可保存指定existing part，核准時跨邊界關係與master在同transaction完成。
    - [ ] 受控檔案只有一個寫入authority；主資料摘要、候選首版與正式版次不可形成無法判斷的平行附件來源。
    - [ ] 1440×900、1280×720、1024×768與390×844可完成搜尋、開drawer與主要下一步，無水平overflow、CTA裁切或重疊。
    - [ ] 真實瀏覽器5秒理解、可見錯誤掃描、可見文字紅筆刪除、keyboard/focus、console與資料一致性驗證通過。
  - Spec Impact Preflight：`Intentional replacement + additive source-context extension`。UI／導覽／read projection取代DEV-052 `HD-052-04`雙頁契約；DEV-052 aggregate、legacy、single bundle review、atomic auto-finalization、permission、idempotency與release gate保持authoritative。
  - ADR判定：已建立並Accepted `ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001`。它關閉「append workspace只有root，無法保存指定existing drawing/part」的P1缺口；超出三個nullable欄位、多source aggregate、backfill或authority變更必須重進ADR。
  - 風險等級：Medium-High。主要風險為跨來源快照不一致、source關係連錯、錯誤action routing、舊deep link失效與受控檔案雙authority；以一致性transaction、stable IDs、default-off flag及sequential QC控制。
  - 文件成熟度與執行邊界：`RD Implementation Ready / Human Confirmed`；exact files、schema/migration、adapter/API、flag、分期、focused commands、rollback、release feasibility與AI真實操作QA均已定義，P0/P1 open question為0。本輪只推進文件，未改產品或資料。
  - RD停止條件：若需以名稱／號碼猜測、client-side拼接、partial list、放寬權限、direct master create、雙file authority、超出三欄schema、新table/backfill/table rebuild、production或release，立即停止並回Dev PM。
  - 下一步：執行`DEV-053 Phase 1A：read foundation`（local only）；完成schema/read-model/HTTP/zero-write與DEV-052 regression evidence後才回Dev PM開Phase 1B。狀態為`☐ 可執行`。
  - 計入交付：是（完成標準為單一工作台產品實作與QA/QC通過；文件Brief本身不計完成）

- ✓ DEV-045 [交付點] [本機完成] [P0] [Phase 1+2 + Phase 3A Local QC Passed / Release Gate Required] 帳號生命週期與安全管理台
  - 摘要：補齊已啟用帳號的 Admin 管理 UI 與 server lifecycle，並把邀請帳號、既有帳號、角色與權限、異動紀錄收斂到同一個「帳號與權限」管理入口，避免系統只有分散的邀請／角色 UI，卻無法安全處理停權、離職、session 撤銷與密碼重設。
  - 來源 ID：`DEV-PDM-ACCOUNT-LIFECYCLE-001`
  - 父任務：`DEV-003`、`DEV-040`、`DEV-042`、`DEV-043`、`DEV-044`
  - 任務清單：
    - [x] 文件 Phase 0：Human Decision Brief、End-State、Architecture Memory Capsule、Deferred Scope Audit、All-Phase Coverage Matrix。
    - [x] Phase 1：「帳號與權限」單一管理入口、`/settings/accounts` list/detail、account lifecycle、identity status、global session revoke、Admin one-time password reset、邀請新帳號入口整合、角色／代理有效時間區間恢復與全 permission-path enforcement、SQLite/PostgreSQL/Supabase migration parity、RLS/default-deny、API/security QC。
    - [x] Phase 1A：在 `/settings/workflow` 角色指派恢復「開始生效／到期停用」控制；帳號管理區以分頁整合角色與權限，不建立第二個角色寫入入口。
    - [x] Phase 1B：同步／非同步、numbering 與 production-slice guards 統一套用 `starts_at <= now < hard_ends_at`；複核日只提醒。
    - [x] Phase 1C：offboard 關閉 system role、撤銷角色、停用 login identities；disabled local identity reset 後保持 disabled；self/last-admin/last-identity guard 由 server 檢查。
    - [x] Phase 1D：recovery fragment token、same-origin JSON、no-store/no-referrer、integer lifecycle version、migration mirror 與 token/audit redaction QC。
    - [x] Phase 1E 本機 Admin bootstrap：先 online backup SQLite，再將 `jedchang0308@jenfu.com.tw` 設為唯一 active Admin、offboard 其他 demo 帳號並撤銷其 session/identity/role；`1655` 因不符 10-128 字元政策未寫入，改建立 24 小時一次性 recovery link。DB integrity `ok`，raw token 不進文件/evidence；production Firebase reprovision 仍未執行。
    - [x] Phase 2 本機切片：Cloud Identity／Firebase provider-managed recovery handoff contract、Firebase-managed `PASSWORD_RESET` action email adapter、`account_session_records` additive registry、`/account/security` self-service session/device visibility、個別撤銷其他 session、logout revoke registry、production-slice account-safety allowlist、SQLite/PostgreSQL/Supabase migration parity與no-credential-storage evidence已完成；不開發AI_PDM自有password/reset/MFA authority或第二套session authority。live provider/domain/quota/privacy/session-retention gate仍未執行。
    - [x] Phase 3A 工號登入別名local slice：company-scoped schema/migration artifact、短效single-use intent、verified UID/company mapping、登入與帳號管理UI、安全負向QC已完成；AI_PDM不保存password/MFA/recovery secret，DEV-045僅保留account console與Admin lifecycle surface。
    - [ ] Phase 3B provider rollout：不搬既有憑證，由`DEV-046`擁有Cloud Identity／Firebase Identity Platform reprovision、Cloud SQL migration、真實provider alias evidence、BFF八小時session、provider-managed Admin/Approver TOTP與invitation/recovery、deny-first central offboarding rollout；staging需同測Google與受控non-Google，production Wave 0限具名Google Workspace，Wave 1 non-Google需`DEV-032` allowlist/release；cloud break-glass不得取得PDM session，browser不直連Cloud SQL。
  - 執行範圍：Phase 1、Phase 2本機切片與Phase 3A工號別名local slice本機RD/QA/QC已完成；Phase 3B provider/staging仍只達RD Contract Ready。DEV-045後續只做account console/lifecycle/self-service UX；正式部署、live migration、Firebase Auth/Identity Platform live provider、MFA、merge、PR、rollback與production smoke未執行。
  - 驗收標準：帳號邀請、既有帳號管理、角色與權限、異動紀錄從同一「帳號與權限」入口可發現，且不混成一張大表；非 Admin/跨公司/body spoof fail closed；停權/離職/revoke/reset 後所有舊 cookie/bearer 立即失效且復權不復活；不能鎖死自己、最後 Admin 或最後 login identity；角色時間區間在所有 permission path 真正生效；offboard/return-to-work 不殘留或恢復舊權限；disabled identity reset 不自動啟用；recovery token/hash/secret/自由文字理由不外洩；mutation/audit/outbox atomic；stable PDM IDs/history 不改寫。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-ACCOUNT-LIFECYCLE-001-admin-account-security-console.md`、`.ai-doc/qa/qa-pdm-account-lifecycle-validation-plan-2026-07-12.md`、DEV-042/043/044 與 access-control authorities。
  - 停止條件：需要 hard delete/merge、live email/provider、Firebase Auth/Identity Platform/MFA、production migration/deploy、資料修復、ProJED 或 release artifacts 時停止並進對應 human/release gate。
  - 證據：`.ai-doc/qc/qc-pdm-account-lifecycle-report-2026-07-13.md`、`.ai-doc/qc/qc-dev-045-phase2-session-recovery-2026-07-14.md`、`.ai-doc/qc/qc-dev-046-employee-login-alias-local-slice-2026-07-13.md`、`npm run qc:pdm-account-lifecycle` 26/26、`npm run qc:dev-045-phase2` 14/14、`qc:dev-046-login-alias` 21/21、`qc:pdm-account-invitations` 25/25、`qc:pdm-google-identity` 19/19、`qc:pdm-production-slice-numbering-draft` 27/27、`npm run qc:supabase-runtime-migrations` 66/66、`npx tsc --noEmit`通過、`npm run lint` 0 errors、isolated `next build`通過。
  - 計入交付：是（內部 pilot 前 P0 帳號治理）

- ✓ DEV-044 [開發點] [本機完成] [P0] [Phase 1-3 QC Passed] ERP-ready AI_PDM 模組基礎
  - 摘要：把 AI_PDM 固化為未來 ERP 的獨立 PDM 模組，先建立 server-authoritative actor/company/command 邊界，再分期加入 atomic audit/outbox、shared IAM adapter 與 ERP shell contract；不把現有 ProJED 架構升格成 ERP 母架構，也不在本任務修改 ProJED。
  - 來源 ID：`DEV-PDM-ERP-MODULE-FOUNDATION-001`
  - 父任務：未來 ERP platform program；現階段不計入 `DEV-040` 正式領號/草稿交付完成率。
  - 任務清單：
    - [x] Phase 0：建立 ADR、SPEC、QA、All-Phase Coverage Matrix、Deferred Scope Audit 與 PM 續接入口。
    - [x] Phase 1：route ownership inventory、`PlatformActorContext`、versioned command/idempotency contract、selected P0 route boundary、client/server import guard、spoofing QC。
    - [x] Phase 2：SQLite/PostgreSQL/Supabase parity transactional outbox、atomic mutation/audit/event、claim/ack/fail repository、RLS/default-deny、duplicate/rollback QC。
    - [x] Phase 3：採用 `1A 2A 3A` 治理決策，完成 shared IAM/core mapping、雙 ID 證據鏈、collision dry-run/apply tooling 與 auth/suspension/audit regression；provider cutover 另走 release gate。
    - [ ] Phase 4：待 ERP shell/consumer 決策後提供 versioned PDM integration contract；ProJED 需另外建立其 repository-owned DEV。
    - [ ] Phase 5：任何 production migration/deploy/cutover 只續接 `DEV-032` release gate。
  - 執行範圍：Phase 1-3 本機開發與驗證完成；Phase 4 ERP shell contract、Phase 5 production/release 未執行。
  - 驗收標準：PDM controlled mutations 只能使用 server-derived actor/company context；browser 不得持有 privileged DB/provider secret；current PDM IDs/history 不被改寫；Phase 2 mutation/audit/outbox atomic；跨模組只能走 versioned command/read/event contract；ProJED 零修改。
  - 必讀文件：`.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-001-integration-ready-boundary.md`、`.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-002-shared-identity-governance.md`、`.ai-doc/specs/SPEC-PDM-ERP-MODULE-FOUNDATION-001-platform-contract.md`、`.ai-doc/qa/qa-pdm-erp-module-foundation-validation-plan-2026-07-12.md`、Phase 1-3 RD/QC reports。
  - 停止條件：需要改登入 provider、canonical org/person 產品語意、stable ID/history、ProJED、live migration、production、外部成本、merge/PR/deploy/release 時停止並進對應 human/release gate。
  - 證據：`.ai-doc/reports/rd/rd-pdm-erp-module-foundation-phase1-3-report-2026-07-12.md`、`.ai-doc/qc/qc-pdm-erp-module-foundation-report-2026-07-12.md`、`qc:pdm-erp-module-foundation` 26/26、production slice 27/27、invitation 25/25、Google identity 19/19、managed auth 21/21、Supabase migration 36/36、Postgres shadow 26/26、typecheck/lint/build pass。
  - 計入交付：否（平台開發點，不直接增加第一版使用者交付完成率）

- ✓ DEV-001 [交付點] [完成] [P0] [已歸檔] 全系統審核平台化
  - 摘要：建立共用審核平台核心、審核工作台、legacy reviewer redirect、跨模組審核 adapter 與圖號待審投影，讓 launch 前審核不再分散且不漏看受影響圖號。
  - 來源 ID：`DEV-PDM-APPROVAL-PLATFORM-001`
  - 父任務：編號、送審、BOM、成本與補件等審核流程
  - 證據：`.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`、`.ai-doc/qc/qc-pdm-approval-platform-report-2026-07-08.md`、`npm.cmd run qc:pdm-approval-platform` 125/125、`npm.cmd run qc:pdm-entity-detail-drawer` 14/14。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-001）
  - 批次發版：見 `DEV-032`；歷史實體遷移、Supabase live migration、production release 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-002 [交付點] [完成] [P1] [已歸檔] Supabase 核心檔案權威與 Google Drive 備份鏡像
  - 摘要：歷史上完成 Supabase Storage/Drive adapter、provider pointer、hash/manifest、migration guard 與 local fallback；2026-07-13 未執行的 production target 已由 `DEV-046` 改為 GCS binary authority + Shared Drive approved delivery/collaboration only，既有實作證據保留但不再代表終局 provider。
  - 來源 ID：`DEV-PDM-FILE-STORAGE-001`
  - 父任務：`DEV-SUPABASE-DB-001`、`DEV-STORAGE-COST-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`、`.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`、`qc:pdm-file-storage-supabase-core-drive-backup` 37/37。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-002）
  - 批次發版：不得依本歷史目標直接切換；未來GCS scope依`DEV-046` Phase 3B/`DEV-033`，production release只依`DEV-032`。
  - 計入交付：是

- ✓ DEV-003 [交付點] [完成] [P0] [已歸檔] 使用者身分、組織範圍與權限架構
  - 摘要：完成鉦富單公司權限切片、角色/審核矩陣管理語言中文化、外部專員權限邊界與規則摘要防呆；審核矩陣控制項收斂為「是否需要審核 / 標示方式」，使用與發行控制改由系統推導。
  - 來源 ID：`DEV-PDM-ACCESS-CONTROL-001`
  - 父任務：`DEV-PDM-SETTINGS-CENTER-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`、`npm.cmd run qc:pdm-access-control-governance` 93/93、rule matrix screenshots。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-003）
  - 批次發版：見 `DEV-032`；無 Google 帳號邀請/首次密碼設定已由 `DEV-042` 完成，Google 身分/provider-neutral identity 已由 `DEV-043` 完成本地切片；完整帳號生命週期、完整路由權限盤點、live provider 與 Supabase migration 仍未進入 release 執行邊界。
  - 計入交付：是

- ✓ DEV-042 [交付點] [本地完成] [P0] 內部帳號邀請與首次密碼設定
  - 摘要：在不引入 Google OAuth 或完整 IAM 的前提下，讓 Admin 建立一次性邀請連結，受邀者自行設定密碼並登入。
  - 來源 ID：`DEV-PDM-ACCOUNT-INVITATION-001`
  - 父任務：`DEV-003`、`DEV-040`
  - 任務清單：
    - [x] 新增 `account_invitations` SQLite/Postgres/Supabase mirror schema、pending email 唯一索引與 RLS/default-deny。
    - [x] 只保存 token hash；建立 API 只回傳一次 invite URL，清單 API 不回傳 token/hash。
    - [x] Admin 建立/查看/撤銷邀請；非 Admin fail closed。
    - [x] 受邀者 lookup、首次設密碼、建立 JENFU membership、session 與 audit；重複/逾期/撤銷連結 fail closed。
    - [x] 加入 `/settings/account-invitations`、`/invite/accept`、managed login demo credential suppression 與 production-slice allowlist。
    - [x] 提供預填郵件與複製連結；明示目前不自動寄信。
    - [x] 完成 focused API/security QC、typecheck、Postgres/Supabase migration QC 與 desktop/mobile browser evidence。
  - 驗收標準：管理員能產生可寄送連結；受邀者能自行設定符合政策的密碼並登入；token 不落明文、不可重用；非 Admin、逾期與撤銷路徑被拒絕。
  - 證據：`.ai-doc/qa/qa-pdm-account-invitation-validation-plan-2026-07-10.md`、`.ai-doc/qc/qc-pdm-account-invitation-report-2026-07-10.md`、`npm.cmd run qc:pdm-account-invitations` 25/25、`qc:managed-auth` 21/21、`qc:pdm-production-slice-numbering-draft` 27/27、`qc:postgres-shadow` 26/26、`qc:supabase-runtime-migrations` 33/33、typecheck、lint、isolated production build 與 Playwright screenshots。
  - 停止條件：需要自動寄信 provider/secret、Google OAuth、帳號停用/復權、密碼重設、session 撤銷、live Supabase migration 或 production deploy 時停止並另立切片/release gate。
  - 下一步：Phase 3A.0 canary 正式部署時設定 canonical `PDM_PUBLIC_BASE_URL`；部署後併入 `DEV-038` 的 3-5 人 field test，通過前不擴大使用者。
  - 計入交付：是

- ✓ DEV-043 [交付點] [本地完成] [P0] Google 身分與 provider-neutral identity
  - 摘要：新增 `auth_identities` 與帳號狀態，讓受邀 Google 使用者透過 OIDC 綁定既有 PDM 身分；本機帳密與 Google 都解析到穩定 `users.id`，未知或停用身分 fail closed。
  - 來源 ID：`DEV-PDM-GOOGLE-IDENTITY-001`
  - 父任務：`DEV-003`、`DEV-042`、`DEV-040`
  - 任務清單：
    - [x] 新增 SQLite/PostgreSQL/Supabase `auth_identities` 與 `users.account_status`，backfill 本機密碼身分並強制 RLS/default-deny。
    - [x] 實作 Google OIDC authorization-code flow、state、nonce、PKCE S256 與 server-side ID token 驗證。
    - [x] Google 初次綁定只接受有效管理員邀請及相符 verified email；一般登入只依已綁定 Google `sub`，不做 email/domain 自動授權。
    - [x] OAuth token/secret 不落 DB/audit；登入 audit 只記 provider、PDM user/identity 與非敏感 email。
    - [x] 本機密碼登入改走 provider-neutral identity；非 active user 與 disabled identity 不得登入，既有 session 在解析時 fail closed。
    - [x] `/login`、`/invite/accept` 加入 Google 控制；未設定 credential 時保留停用按鈕與「未開放」提示。
    - [x] 完成 mocked OIDC、邀請/managed auth regression、migration、typecheck、lint、isolated build 與 desktop/mobile UI evidence。
  - 驗收標準：有 Google 與無 Google 使用者共用穩定 PDM User ID；未知 Google 身分不可自助註冊；受邀 email mismatch、重複 subject、竄改 state、停用帳號與舊 session 都被拒絕；OAuth token/secret 不持久化。
  - 證據：`.ai-doc/qa/qa-pdm-google-identity-validation-plan-2026-07-10.md`、`.ai-doc/qc/qc-pdm-google-identity-report-2026-07-10.md`、`qc:pdm-google-identity` 19/19、`qc:pdm-account-invitations` 25/25、`qc:managed-auth` 21/21、`qc:supabase-runtime-migrations` 33/33、`qc:postgres-shadow` 26/26、typecheck、lint 與 isolated production build。
  - 停止條件：需要 live Google credential/consent screen、正式 redirect URI、live Supabase migration、provider rollout、production smoke/deploy、自助註冊、domain/group 授權或帳號生命週期管理 UI 時停止並進 release/new DEV gate。
  - 下一步：由 `DEV-032` release gate 完成 provider credential、migration、HTTPS cookie 與 Phase 3A.0 named-user canary/post-deploy smoke；其後納入 `DEV-038` 3-5 人 field test，通過前不擴大開放。
  - 計入交付：是

- ✓ DEV-004 [交付點] [完成] [P0] [已歸檔] 情境式編號生命週期入口
  - 摘要：在 root/drawing/part context 直接新增 M/R、P、obsolete request 與 aggregate approval package，並修正 APP 回饋的草稿與命名 UX。
  - 來源 ID：`DEV-PDM-NUMBERING-004`
  - 父任務：`DEV-PDM-NUMBERING-003`、`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-LIFECYCLE-ACTIONS-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`、`.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`、focused QC 44/44。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-004）
  - 批次發版：見 `DEV-032`；production/Supabase cutover、provider pointer、merge/PR/deploy 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-005 [交付點] [Phase 1 本地完成] [P1] [已完成 / 後續交付分流] 研發 / 技術移轉送審關卡
  - 摘要：Phase 1 已把研發送審與技術移轉送審做成可見模式選擇、versioned local rule resolver、API fail-closed guard 與 transfer package context 入口；技術移轉不能被當成單一圖號直接正式送審。技轉包工作台、Pack-and-Go intake、整數 baseline、readiness 與 sign-off 已依使用者 `3A` 分流至 `DEV-041`，不計入本 DEV 的完成宣告。
  - 來源 ID：`DEV-PDM-SUBMISSION-GATE-001`
  - 父任務：圖面送審、工作台與發行生命週期權威
  - 任務清單：
    - [x] Phase 1：建立研發送審 / 技術移轉送審模式選擇與 readiness resolver。
    - [x] Phase 1：技術移轉從圖號或料號來源進入 transfer package context，不可建立單一物件正式送審。
    - [x] Phase 1：補 API fail-closed guard，direct technical-transfer single-item submit 必須回穩定錯誤碼且不產生 Pending submission。
    - [x] Phase 1：readiness payload 要包含欄位、負責角色、blocker code 與 remediation route。
    - [x] Phase 1：補 focused QC，至少覆蓋 mode selector、resolver 狀態、transfer redirect 與 direct API guard。
    - [x] Phase 3A 文件治理：原 Phase 3A 規格依 `1A 2A 3A` 補齊並分流到 `DEV-041`。
    - Phase 2 research exception 與 Parent Phase 4 rule admin 仍由本 DEV parent SPEC 管理；技轉包 builder/sign-off 不再列為本完成 DEV 的未勾待辦。
  - 驗收標準：研發送審與技術移轉送審在 UI、API 與 QC 證據中可被清楚區分；技術移轉不能被誤當成單一圖號/料號直接送審。
  - 證據：`.ai-doc/qc/qc-pdm-submission-gate-phase1-report-2026-07-10.md`、`npm.cmd run qc:pdm-submission-gate-phase1` 15/15、`npx.cmd tsc --noEmit --pretty false`、`npm.cmd run lint -- --quiet`、`npm.cmd run qc:pdm-drawing-submission-review-only` 14/14、`npm.cmd run build`、Playwright smoke 5/5（`output/playwright/pdm-submission-gate-mode-selector.png`、`output/playwright/pdm-submission-gate-transfer-package-placeholder.png`）。Phase 3A 文件：`.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`、`.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`。
  - 停止條件：需要 live schema migration、production deploy、正式資料修復、改變既有 release workflow、或缺少 transfer package case context 時停止回報。
  - 下一步：技轉包產品能力改從 `DEV-041` 續接；`DEV-005` 只在指定 research exception 或 Parent Phase 4 rule admin 時恢復。
  - 計入交付：是

- ○ DEV-041 [交付點] [待排] [P1] [Phase 3A-0 本機完成 / QA Passed；Phase 3A-1 to 3C RD Contract Ready] 技轉包工作台、Pack-and-Go Intake 與整數 Baseline
  - 摘要：把技轉從 unsaved entry、明確建立的 persistent Draft、Pack-and-Go intake、人工分類/對應、完整 BOM、整數 package baseline、readiness、共用審核簽核一路管到 release-work-item handoff；不強迫所有零件同步進版。
  - 來源 ID：`DEV-PDM-TRANSFER-PACKAGE-INTAKE-001`
  - 父任務：`DEV-005` / `DEV-PDM-SUBMISSION-GATE-001`
  - 任務清單：
    - [x] Phase 3A-0：實作明確建立後才持久化的 Draft、穩定 package ID、共用工作台、scope、adapter cards、blocker 匯總與 return context。
    - [ ] Phase 3A-1：實作 streaming ZIP safety、原始封包保存、manifest/hash、分類建議與人類 override。
    - [ ] Phase 3A-2：實作 deterministic impact resolver、formal no-change manager gate、canonical transfer follow-up/task projection、controlled mapping/BOM、delta package、完整候選配置與 atomic multi-root baseline。
    - [ ] Phase 3B：實作 configuration readiness、follow-up pending/overdue/projection blocker、簡化 `已非最新版 / 待更新`、SolidWorks 證據與 stale detection。
    - [ ] Phase 3C：整合 atomic multi-root 共用審核、terminal ApprovedForTransfer、applicable sign-offs 與 release-work-item handoff。
  - 執行範圍：Phase 3A-0 本機產品、SQLite schema、provider-neutral PostgreSQL migration artifact、API、共用工作台與 QC 已完成；下一個可請求切片為 Phase 3A-1。
  - 範圍外：未執行 live PostgreSQL/Supabase migration、正式資料操作、ZIP parser、分類、mapping/BOM/baseline、SolidWorks Add-in/Document Manager、production、merge/PR/deploy/release。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`、`.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`、parent SPEC/ADR、BOM、approval、access-control 與 file-storage authority。
  - 驗收：各 phase 必須依 SPEC 保持 deterministic/no-AI impact evidence、formal no-change manager approval、canonical follow-up/idempotent task projection、package baseline 與 item revision 分離、明確 Draft create、canonical owner 邊界、company/RLS 安全、不可變快照、同軌影響、formal defer Gate、簡化可見狀態及 ApprovedForTransfer 不自動 release。
  - 停止條件：需要改變任何已確認 HCS 決策、impact resolver 需要 AI/LLM/network、formal no-change 可繞過 RD 主管、generic task 成為 follow-up authority、研發版影響正式版、系統自動替組合件進版、無條件 formal defer、允許 partial multi-root approval、重開已核准 package、繞過完整 BOM/controlled identity/實機開啟證據、複製 owner logic、缺 role/company 安全、要求 live migration/direct repair/deploy/release 時停止。
  - 證據：`.ai-doc/qc/qc-pdm-transfer-package-phase3a0-report-2026-07-13.md`；focused QC 18/18、submission-gate regression 15/15、account-lifecycle regression 26/26、typecheck/lint/isolated build 通過，並完成 1440/1024/390 browser/visible-error evidence。
  - 下一步：Phase 3A-1 只在使用者提出明確實作指令後開始；不得自動跨到 mapping/BOM/baseline 或正式送審。
  - 計入交付：是

- ✓ DEV-006 [交付點] [完成] [P1] [已歸檔] 圖料模組關係視圖
  - 摘要：將圖料模組從平面清單改為 root-grouped 關係樹與矩陣 review，並提供受控關係維護 API。
  - 來源 ID：`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`
  - 父任務：`DEV-PDM-DRAWING-PART-WORKBENCH-001`、`DEV-PDM-NUMBERING-002`
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`、`qc:pdm-drawing-part-relation-view` 56/56、relation-view screenshots。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-006）
  - 批次發版：見 `DEV-032`；正式環境、schema migration 與批次關係寫入需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-007 [交付點] [完成] [P2] [已歸檔] 全系統可行動狀態提示與下一步 UX
  - 摘要：讓錯誤、空狀態、生命週期、送審與附件狀態直接回答使用者現在要做什麼，減少只顯示 raw status。
  - 來源 ID：`DEV-PDM-NEXT-STEP-UX-001`
  - 父任務：`DEV-PDM-STATUS-UX-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`、status/search/DVT/report/master-attachment/drawing-submission QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-007）
  - 批次發版：見 `DEV-032`；Phase 2 scanner/checklist 未進入本輪執行邊界，production release 需走 release gate。
  - 計入交付：是

- ✓ DEV-039 [交付點] [完成] [P1] [已歸檔] 圖號 / 料號 / 主根號統一物件詳情抽屜
  - 摘要：統一 root/drawing/part detail drawer 契約，確保同一物件從不同入口打開時核心資訊與首屏密度一致。
  - 來源 ID：`DEV-PDM-ENTITY-DETAIL-DRAWER-001`
  - 父任務：`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-NUMBERING-004`、主資料工作台
  - 證據：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`、`.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`、`qc:pdm-entity-detail-drawer` 12/12。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-039）
  - 批次發版：見 `DEV-032`；完整 shared shell 抽取未進入本輪執行邊界，merge/PR/deploy/release 需走 release gate。
  - 計入交付：是

- ✓ DEV-008 [PM 證據] [完成] [P3] [已歸檔] 本地開發入口 CAPA 預防措施
  - 摘要：用 managed local dev launcher、health check、restart 與 clean guard 防止 port 3000 / .next 被反覆破壞。
  - 來源 ID：`PA-LOCAL-DEV-3000-001`
  - 父任務：無
  - 證據：`npm run qc:local-dev-entrypoint`、`npm run dev:local:check`、`scripts/start-localhost-3000.ps1`、`scripts/clean-next.mjs`。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-008）
  - 批次發版：無；這是 PM/CAPA 證據，不進 release batch。
  - 計入交付：否

- ✓ DEV-009 [交付點] [完成] [P2] [已歸檔] 全系統狀態中文化與狀態欄說明
  - 摘要：建立中央 UI status dictionary、中文 status badge/filter/error 與狀態說明 popover，降低 raw code 外露。
  - 來源 ID：`DEV-PDM-STATUS-UX-001`
  - 父任務：生命週期與發行狀態工作
  - 證據：`.ai-doc/specs/SPEC-PDM-STATUS-UX-001-unified-chinese-status-display.md`、`npm run qc:pdm-status-ui-vocabulary` 44/44、browser status evidence。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-009）
  - 批次發版：見 `DEV-032`；DB enum/schema 改名、historical repair 與 production migration 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-010 [開發點] [完成] [P2] [已歸檔] 狀態語意分層與狀態混用修正
  - 摘要：修正狀態/階段/提醒混用，讓不同任務、匯入、設定、報告、DVT 與恢復情境使用正確狀態語意。
  - 來源 ID：`DEV-PDM-STATUS-UX-002`
  - 父任務：`DEV-PDM-STATUS-UX-001`、`DEV-PDM-NEXT-STEP-UX-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-STATUS-UX-002-status-context-disambiguation.md`、`.ai-doc/qa/qa-pdm-status-context-disambiguation-validation-plan-2026-07-07.md`、status context QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-010）
  - 批次發版：無獨立 release；Phase 2 scanner hardening 未進入本輪執行邊界。
  - 計入交付：否

- ✓ DEV-011 [交付點] [完成] [P1] [已歸檔] 緊湊編號核心 V2
  - 摘要：將編號核心改為 compact v2 root/part/drawing identity，完成本地 runtime cutover 並保留歷史 evidence string。
  - 來源 ID：`DEV-PDM-NUMBERING-002`
  - 父任務：編號核心 / 圖料工作台
  - 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-002-compact-root-drawing-part-numbering.md`、`.ai-doc/qc/qc-pdm-numbering-v2-formal-cutover-report-2026-07-07.md`、v2 cutover QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-011）
  - 批次發版：見 `DEV-032`；production/Supabase live cutover、provider pointer 與直接資料修復需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-012 [交付點] [完成] [P1] [已歸檔] 英數主根號身分 V3
  - 摘要：完成 A0001-Z9999 英數 root identity、v1/v2/v3 read compatibility、legacy numeric ordinal reservation 與本地 runtime v3 cutover。
  - 來源 ID：`DEV-PDM-NUMBERING-003`
  - 父任務：`DEV-PDM-NUMBERING-002`
  - 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`、`.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`、v3 formal cutover QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-012）
  - 批次發版：見 `DEV-032`；production/Supabase migration 與直接資料修復需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-013 [開發點] [完成] [P1] [已歸檔] QC 隔離、流水號完整性與本機修復
  - 摘要：阻止 QC 消耗正式 local runtime 流水號，補完整性偵測、transaction guard、duplicate submit guard 與本機測試資料修復。
  - 來源 ID：`DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`
  - 父任務：編號流水號完整性
  - 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`、`.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`、repair report。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-013）
  - 批次發版：見 `DEV-032`；Phase 4 production/Supabase rollout 或任何新資料修復需走 release gate 或高風險確認。
  - 計入交付：否

- ✓ DEV-014 [交付點] [完成] [P1] [已歸檔] 圖面送審工作台與發行未完成恢復流程
  - 摘要：完成 same-revision conflict 分類、release recovery、workbench API/page、retry/return-for-correction 與 disposable mutation QC。
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
  - 父任務：圖面送審權威
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`、`.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`、mutation/recovery QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-014）
  - 批次發版：見 `DEV-032`；Phase 2+ 已另列 `DEV-015`，production/historical repair 需走 release gate 或高風險確認。
  - 計入交付：是

- ↷ DEV-015 [開發點] [延後 / 待選切片] [P1] [RD Contract Ready] 圖面送審工作台第 2+ 階段交接包
  - 摘要：保留圖面送審工作台 Phase 2+ 的 RD 交接契約，涵蓋主資料補完/寫回、附件上傳、協作、dashboard/todo 去噪與正式切換前置條件。
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P`
  - 父任務：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
  - 任務清單：
    - [ ] 指定要先做的 Phase 2+ 切片：主資料補完/寫回、附件上傳、協作或 dashboard/todo 去噪。
    - [ ] 讀取 `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002` SPEC / QA，確認切片不回頭破壞 Phase 1 recovery contract。
    - [ ] 為選定切片補 RD scope、out of scope、API/data boundary、QA gate 與 QC evidence required。
    - [ ] 實作選定切片並跑 focused QC；未選定切片前不進產品實作。
  - 驗收標準：選定切片完成後，圖面送審工作台的主資料、附件、協作或待辦噪音有可觀察改善，且不破壞已完成的 release recovery。
  - 停止條件：historical repair、direct DB mutation、production migration、資料刪除或 release/cutover 需求出現時停止並轉 release/high-risk gate。
  - 下一步：先由使用者選定一個第 2+ 階段切片，再恢復為可執行 DEV；production/historical repair 另走 release gate 或高風險確認。
  - 計入交付：否

- ✓ DEV-016 [開發點] [完成] [P1] [已歸檔] 發行未完成 UI 自救流程
  - 摘要：補上 release-incomplete 的人可讀診斷、附件修正入口、submission detail recovery link 與 UI operation QC。
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`
  - 父任務：圖面送審工作台
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`、drawing submission UI/recovery QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-016）
  - 批次發版：見 `DEV-032`；正式環境修復、historical repair 與 data deletion 需走 release gate 或高風險確認。
  - 計入交付：否

- ✓ DEV-017 [交付點] [完成] [P1] [已歸檔] 圖面進版受控送審包第 1 階段
  - 摘要：讓圖面進版必須先選/上傳新版圖面並建立受控 Pending submission package，保留 FFF linkage 與失敗補償。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 父任務：圖面進版權威
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`、`.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`、change-control QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-017）
  - 批次發版：見 `DEV-032`；production deploy、migration、direct repair 與 historical cleanup 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-018 [交付點] [完成] [P1] [已歸檔] 多檔版次包送審
  - 摘要：將單一版次送審擴充為多檔版次檔案包，支援 extension role auto-classification、role correction 與 warning-only completeness。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 2、revision submission QA、change-control QC 57/57。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-018）
  - 批次發版：無本任務專屬下一步；共用 release gate 見 `DEV-032`。
  - 計入交付：是

- ✓ DEV-019 [交付點] [完成] [P1] [已歸檔] 非依序進版與最新 / 歷史行為
  - 摘要：允許非依序但不重複的正式進版，重新計算 latest/history，讓低版次補登保留歷史、高版次升為最新。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 3、`npm.cmd run qc:pdm-change-control` 61/61。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-019）
  - 批次發版：無本任務專屬下一步；共用 release gate 見 `DEV-032`。
  - 計入交付：是

- ✓ DEV-020 [交付點] [完成] [P1] [已歸檔] 一級版次附件包模型
  - 摘要：建立 stable packageId、package file membership、Released-core immutability 與補件 request/approval/補件標記。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`、`.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`、package QC 59/59。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-020）
  - 批次發版：見 `DEV-032`；若要補 browser 補件證據，應另開 QC/follow-up，不阻擋本 DEV 完成。
  - 計入交付：是

- ✓ DEV-021 [交付點] [完成] [P1] [已歸檔] 共用 3D 主檔與 MA 製造基準包
  - 摘要：完成 part/root 共享 3D 模型版本、MA model-basis API、required-MA resolver、manufacturing baseline draft/release 與 part-detail UI slice。
  - 來源 ID：`DEV-PDM-SHARED-3D-MA-BASELINE-001`
  - 父任務：進版包、圖料工作台與發行同步
  - 證據：`.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`、`qc:pdm-shared-3d-ma-baseline` 20/20、browser screenshot。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-021）
  - 批次發版：見 `DEV-032`；production deploy/migration、CAD/OCR extraction 與 forced part/BOM/FFF changes 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-022 [交付點] [完成] [P2] [已歸檔] 系統設定中心與 Secret 生命週期治理
  - 摘要：建立 settings center、五個管理區、server-only secret lifecycle API、secret metadata tables、redacted UI 與 local test double。
  - 來源 ID：`DEV-PDM-SETTINGS-CENTER-001`
  - 父任務：CAD、Supabase 與設定權威
  - 證據：`.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`、`.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`、settings secret QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-022）
  - 批次發版：見 `DEV-032`；Supabase Vault live write/smoke、真實 CAD 證據與 production cutover 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-023 [交付點] [完成] [P1] [已歸檔] Windows SolidWorks 原檔預覽衍生檔
  - 摘要：建立 preview job/derivative schema、fake PNG worker、Windows Shell worker、Document Manager SLDDRW worker path 與 derivative-aware preview cards。
  - 來源 ID：`DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`
  - 父任務：設定中心、CAD 讀取器與附件預覽
  - 證據：`.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`、native-preview QC 90/90、redaction QC、master-attachments QC、API worker smoke。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-023）
  - 批次發版：見 `DEV-032`；真實 SLDDRW key、SLDASM evidence、Phase 2/3 與 production rollout 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-024 [交付點] [完成] [P1] [已歸檔] 送審發行後主檔生命週期同步
  - 摘要：在 submission release 成功時同步 source drawing、part、root master lifecycle，寫入 audit，並提供歷史 mismatch 可見 guard。
  - 來源 ID：`DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
  - 父任務：圖面送審工作台
  - 證據：`.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`、`npm run qc:pdm-release-master-status-sync` 23/23、browser guard screenshot。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-024）
  - 批次發版：見 `DEV-032`；historical D-0014 repair、production migration 與 direct DB mutation 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-025 [開發點] [完成] [P2] [已歸檔] 重複進行中送審衝突分類
  - 摘要：將 duplicate active submission 改為 submission_conflict，於 readiness/submit/reviewer guard 阻擋並用中文 recovery 與 audit payload 留證。
  - 來源 ID：`DEV-PDM-SUBMISSION-CONFLICT-001`
  - 父任務：`DEV-PDM-DRAWING-PART-WORKBENCH-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`、`.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`、duplicate conflict QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-025）
  - 批次發版：見 `DEV-032`；historical duplicate repair、production migration 與 direct cleanup 需走 release gate 或高風險確認。
  - 計入交付：否

- ✓ DEV-026 [交付點] [完成] [P1] [已歸檔] 圖料模組資料流與送審安全架構
  - 摘要：確立圖號/圖料 controlled drawing submission workbench、owner API edit path、immutable snapshot/hash、idempotency audit 與 generic upload retirement。
  - 來源 ID：`DEV-PDM-DRAWING-PART-WORKBENCH-001`
  - 父任務：圖面送審權威
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`、`.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`、workbench security QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-026）
  - 批次發版：見 `DEV-032`；production deploy/migration、direct DB cleanup 與 existing-data repair 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-027 [交付點] [完成] [P2] [已歸檔] 圖面來源只送審流程
  - 摘要：讓圖面來源送審只負責 review-only submission，主資料必須在圖面/圖料模組先完成，不在送審中收 PDM master fields。
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-001`
  - 父任務：圖面模組主資料流程
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`、`.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`、review-only QC/screenshots。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-027）
  - 批次發版：見 `DEV-032`；production deploy 需走 release gate。
  - 計入交付：是

- ✓ DEV-028 [開發點] [完成] [P3] [已歸檔] APP 人工驗證 UI 打磨包
  - 摘要：完成 upload UI 簡化、多檔 SolidWorks-primary metadata、conflict warning、preview fallback 與 drawing governance CTA polish。
  - 來源 ID：`DEV-PDM-UI-POLISH-001`
  - 父任務：無
  - 證據：APP validation screenshots、`src/app/upload/page.tsx`、`src/components/master-attachment-panel.tsx`、focused browser smoke。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-028）
  - 批次發版：無；未來 UI 改善需拆成新的聚焦任務。
  - 計入交付：否

- ✓ DEV-029 [開發點] [完成] [P3] [已歸檔] 圖面進版工作台聚焦切片
  - 摘要：完成 drawing revision workbench focused slice：official drawing resolver、server-side primary-part resolution、duplicate submit guard 與 replacement draft reuse。
  - 來源 ID：`DEV-PDM-UI-POLISH-001A`
  - 父任務：`DEV-PDM-UI-POLISH-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-002-drawing-revision-workbench-ux-contract.md`、`.ai-doc/qa/qa-pdm-drawing-revision-workbench-validation-plan-2026-06-30.md`、change-control QC/browser smoke。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-029）
  - 批次發版：無；剩餘改善需拆成新的聚焦任務。
  - 計入交付：否

- × DEV-030 [關卡] [不獨立派工 / 已併入 DEV-032] [P0] Cloud SQL operational provider 與正式環境切換
  - 摘要：原 Cloud SQL target、capacity、connector、IAM DB auth、HA/PITR、成本、migration 與 rollback scope 已拆入 `DEV-032 Gate B/C`，避免與 production release gate 重複管理。
  - 來源 ID：`DEV-CLOUDSQL-DB-001`（supersedes active execution of `DEV-SUPABASE-DB-001`）
  - 父任務：`DEV-032`
  - 下一步：不再獨立派工；target/capacity/resource apply 由 `DEV-032 Gate B` 驗收，migration/DB continuity 由 `Gate C` 驗收。
  - 阻塞 / 恢復條件：沿用 `DEV-032` 的 explicit approval、cost stop、rollback owner、credential boundary 與 release gate。
  - 證據：既有 Phase 1C/2A/2B Cloud SQL contract、staging migration/idempotence 與 production IaC review package。
  - 計入交付：否

- × DEV-031 [QA/QC] [不獨立派工 / 已併入 DEV-032 Gate C] [P0] Cloud SQL clean-production seed / archive 一致性執行
  - 摘要：clean production seed、source archive、non-reuse reservation、separate-target restore 與 numbering reconciliation 保留為角色分離 QC，但由 `DEV-032 Gate C` 統一排程與判定 go/no-go。
  - 來源 ID：`DEV-CLOUDSQL-DB-001-DATA-PARITY`
  - 父任務：`DEV-032`
  - 下一步：在 `DEV-032 Gate C` 確認 source snapshot、seed manifest、archive owner、target credential boundary 後執行；不得被視為 business-row parity migration。
  - 阻塞 / 恢復條件：任何 live data repair、刪除、覆寫、來源 archive 修改、未確認 target compare 或 secret exposure 立即停止。
  - 證據：`config/platform/clean-production-seed.template.json`、production canary restore/reconciliation runbook 與後續 `DEV-032 Gate C` execution report。
  - 計入交付：否

- ◇ DEV-032 [關卡] [Authenticated Verification In Progress] [P0] [Release Gate Required] ERP 平台 production release work package
  - 摘要：第一版 production 的唯一 active 入口，集中承接 `DEV-046` Phase 3A.0、`DEV-030` database target/capacity、`DEV-031` clean seed/continuity QC，以及 `DEV-040` 領號／草稿 release；GCS/CAD/BOM/完整 PDM 均不在此 package。
  - 來源 ID：`DEV-CLOUDSQL-DB-001-PROD-GATE`；吸收來源 `DEV-CLOUDSQL-DB-001`、`DEV-CLOUDSQL-DB-001-DATA-PARITY`
  - 父任務：`DEV-046` Phase 3A.0、`DEV-040`
  - 任務清單：
    - [x] `DEV-032-BASE`：release source boundary、exact commit、production target contract、fail-closed IaC static validate、clean seed/allowlist/restore templates與production project readback完成；production action為false。
    - [x] `Gate A - Production Configuration & Plan Review`：production Firebase/Identity/Web App、env source、Secret Manager metadata、exact artifact及credentialled Terraform plan已完成；reviewed plan為53 create/5 update/0 delete/0 replace、USD 210，GCS file authority為0。Google provider已用Firebase Auth專用deploy啟用，Admin API讀回`enabled=true`且OAuth client/secret metadata存在；Email/Password保持啟用、Anonymous關閉。
    - [x] `Gate B - Production Resource Apply`：partial apply後已完成state import、corrective saved plan與apply；Cloud SQL Regional HA、private VPC、Cloud Run service/job、IAM、Identity config、LB、TLS resource、monitoring、regional logs、TWD 9,600 budget與HSM signing key readback通過，Terraform 58 resources無drift，0 GCS file authority。
    - [x] `Gate C - Clean Seed & Continuity`：mutation前on-demand backup `1784136240742`、privileged admin bootstrap、18筆schema migration與立即idempotence rerun已完成。production Identity Toolkit已讀回verified `google.com` UID `U57t2eIOzLdhAmNDUbFyOz3fdMm2`；principal `prod-pdm-admin-001` bootstrap通過，包含9 roles與237 permissions。pre-canary reconciliation執行`ai-pdm-prod-migration-runner-2szd5`通過；post-principal recovery point `1784162806569`已還原到獨立target `ai-pdm-prod-restore-20260716a`，restore reconciliation執行`ai-pdm-prod-migration-runner-9ss25`通過，來源與restore的numbering snapshot SHA-256均為`81f983ce4f3ed580d71f1cdef70cfbade83d860498a4310a1a61c11e997c1f57`。runner已清除execution ack並恢復dry-run，Terraform no-drift；restore target暫留為evidence，未刪除。
    - [ ] `Gate D - Immutable Deploy & Smoke`：exact application image index `sha256:b4fb8e9f...`已部署，Cloud Run執行的linux/amd64 child manifest `sha256:570dd9f0...`父子關係已驗證；production AAL1 pilot契約已對齊，Cloud Run v2 traffic-only rollback/restore與後續Terraform no-drift通過。rollback runner已固定`updateMask=traffic`、禁止會產生template drift的`gcloud run services update-traffic`路徑，並以current latest revision完成production `validateOnly` preflight。依使用者既有決策，短期production pilot採`https://jenfu-ai-pdm-prod.web.app`且不設定DNS；專用Hosting config與OAuth origin/redirect已發布。部署後發現runtime漏設production slice，已在mutation smoke前停止並以saved plan `25f6f28a...7221e`只做0 create/1 Cloud Run in-place update/0 delete/0 replace；revision `ai-pdm-prod-00006-lx5`承接100%流量且維持相同immutable image。direct Cloud Run與Hosting均讀回`configured=true`、`active=true`、`official-numbering-draft`與private/no-store；Level 3 production-like smoke 14/14通過，未登入protected API維持401，送審/file/CAD/BOM mutation均穩定403 `feature_not_open_in_production_slice`。rollback/Level 3/post-apply gates均為true，最終Terraform 0 drift。Google帳號選擇頁可到達且principal已開通；Gate D只剩完成互動登入後的authenticated privacy/permissions/領號/草稿/系列代號/重登/file fail-closed Level 4 smoke。
    - [ ] `Gate E - Named-User Canary`：只開放核准的3-5位Google Workspace使用者，驗證allowlist/non-allowlist、登入、privacy、領號、草稿、重登持久性與零open P0/P1；固定五日field gate已取消，不得自動擴大allowlist。
  - 下一步：人類只需在已開啟的production Google帳號選擇視窗點選`jedchang0308@jenfu.com.tw`並回報「已登入」。Codex隨後執行authenticated Level 4及production UI acceptance。其餘1-3位canary不得由AI自行臆測；不要求設定DNS。
  - 阻塞 / 恢復條件：每個子關卡需獨立 explicit approval；artifact provenance、target identity、cost、privacy、clean seed/source archive/non-reuse、connection budget、rollback、restore/reconciliation、smoke tenant任一缺失即停止。
  - 證據：`.ai-doc/reports/pm/pm-dev-032-production-gate-package-2026-07-15.md`、`.ai-doc/reports/pm/pm-dev-032-gate-a-b-execution-2026-07-16.md`、`.ai-doc/reports/pm/pm-dev-032-production-hosting-activation-2026-07-16.md`、`.ai-doc/reports/pm/pm-dev-032-production-principal-restore-reconciliation-2026-07-16.md`、`.ai-doc/reports/pm/pm-dev-032-human-handoff-2026-07-16.md`、`output/dev-032-production-terraform-plan/corrective/post-apply-readback.json`、`output/dev-032-production-hosting-plan/summary.json`、`output/dev-032-production-slice-activation/plan-review.json`、`output/dev-032-production-slice-activation/level3-smoke.json`、`output/dev-032-live-migration/`、`output/dev-032-production-auth-activation/summary.json`、`output/dev-032-production-principal-bootstrap/`、`output/dev-032-production-reconciliation/`、`output/dev-032-aal1-pilot-plan/post-apply-readback.json`、`output/dev-032-rollback-drill/v2-api-closure.json`、`output/dev-032-rollback-drill/traffic-rollback-validate-1784143002444.json`；authenticated smoke待追加。
  - 計入交付：否

- ↷ DEV-033 [開發點] [延後 / 併入 DEV-046 Phase 3B] [P2] GCS 檔案權威、保留、成本與 continuity package
  - 摘要：與 `DEV-046` Phase 3B、`DEV-037` 合併管理檔案 inventory、成本、保留政策、direct-GCS authority、backup與restore責任；目前不是 RD 可直接執行任務。
  - 來源 ID：`DEV-STORAGE-COST-001`
  - 父任務：`DEV-046` Phase 3B；continuity 子關卡為 `DEV-037`
  - 任務清單：
    - [ ] 盤點目前檔案量、附件類型、保留年限、預期增長與備份需求。
    - [ ] 依 DEV-046 決定 GCS primary/backup-project、30-day soft delete、Shared Drive approved export 與離線/獨立備份的責任邊界；Supabase Storage 只作 legacy migration source。
    - [ ] 建立成本估算、保留政策與清理政策；未確認前不做 production rollout。
  - 驗收標準：上線前可說明儲存成本、保留策略、備份責任與不可自動清理的資料範圍。
  - 停止條件：需要外部費用承諾、正式資料刪除、bucket/RLS production 變更或 live migration 時停止。
  - 下一步：Phase 3A production slice穩定且使用者明確開啟file workflow後，先完成inventory/cost/retention決策，再進staging adapter與release gate。
  - 計入交付：否

- ✓ DEV-034 [關卡] [完成] [P0] [本機 disposable Postgres shadow gate 通過] SQLite 到 PostgreSQL 影子遷移
  - 摘要：已在 disposable local PostgreSQL target 完成 shadow migration、RLS 與 schema/RLS compare 證據，作為 Cloud SQL migration compatibility evidence，避免直接碰正式資料或正式 schema。
  - 來源 ID：`DEV-IND-007`
  - 父任務：`DEV-CLOUDSQL-DB-001`；歷史來源為 `DEV-SUPABASE-DB-001`
  - 任務清單：
    - [x] 準備 disposable Postgres target，不使用 production target。
    - [x] 跑 schema migration apply、RLS plan 與 shadow compare。
    - [x] 取得 `qc:postgres-shadow` 與 target guard 證據。
  - 證據：`data/quality/postgres-shadow/shadow-compare-1783676196559.json`；`npm.cmd run qc:postgres-shadow` 通過 26/26；`npm.cmd run qc:postgres-shadow-target-guard` 通過 11/11。
  - 停止條件：若未來改成 staging/production Cloud SQL、正式資料遷移、direct repair 或 production schema 變更，必須回到 `DEV-032` release gate。
  - 下一步：第一版不再因 `DEV-IND-007` 阻塞；正式 Cloud SQL target/connector/grants、provider pointer 與 production smoke 只由 `DEV-032` 管控。
  - 計入交付：否

- ↷ DEV-035 [關卡] [延後] [P2] [完整 CAD / PDM 階段] SolidWorks Document Manager 或等效讀取器
  - 摘要：使用者實測 SolidWorks 檔案上傳 OK、3D 檔可預覽、2D 檔無法預覽；此缺口不阻塞第一版正式領號 / 草稿 production slice，保留為完整 CAD 預覽與 native metadata 階段。
  - 來源 ID：`DEV-CAD-001`
  - 父任務：原檔預覽 / CAD 中繼資料
  - 任務清單：
    - [ ] 確認 2D `.slddrw` / PDF / DWG preview 策略與可部署讀取元件。
    - [ ] 用真實或代表性 SolidWorks 檔案取得 metadata / 2D preview extraction 證據。
    - [ ] 將讀取器限制寫回 settings / preview 相關 DEV 的恢復條件。
  - 恢復條件：使用者要開放 CAD 原檔解析、2D 預覽、native metadata 或完整 PDM/CAD workflow 時再恢復。
  - 下一步：不列第一版 blocker；後續完整 CAD 階段再取得可部署讀取元件證據。
  - 計入交付：否

- × DEV-036 [關卡] [停止追蹤 / 未納入目前產品路線] [P3] SolidWorks Add-in 實機驗證
  - 摘要：目前第一版與技轉包方向採 Web / Pack-and-Go / 等效上傳路線，沒有明確 SolidWorks Add-in 交付；保留歷史 ID，但不再作為 active 或 deferred backlog。
  - 來源 ID：`DEV-SW-001`
  - 父任務：SolidWorks 整合
  - 歷史重新開啟條件：若未來重新採用Add-in路線，需另備Windows/SolidWorks版本、安裝帳號、測試檔案、操作腳本、版本截圖/log與錯誤復原證據；本清單不是目前待辦。
  - 恢復條件：只有未來產品重新明確要求 SolidWorks Add-in 或 CAD workstation 內操作時，才以新產品決策恢復。
  - 下一步：無；不可直接刪除歷史 ID，也不得把本項列為未完成交付。
  - 計入交付：否

- ↷ DEV-037 [關卡] [延後 / DEV-033 Continuity 子關卡] [P2] [完整 PDM / 檔案保存階段] 離線單向備份與還原演練
  - 摘要：完整 PDM 檔案離線單向備份、GCS 檔案復原與隔離還原演練依本輪使用者決策延後，不列第一版正式領號 / 草稿 blocker；closed `DEV-046 HD-8-4 / 1A` 只要求 Cloud SQL automated backup/PITR 與 pre-canary separate-target restore/numbering-ledger reconciliation，兩者不得混算。
  - 來源 ID：`DEV-BACKUP-001`
  - 父任務：`DEV-033` / `DEV-046` Phase 3B
  - 任務清單：
    - [ ] 確認備份來源、離線目的地、保留週期、責任人與不可覆寫規則。
    - [ ] 執行一次備份與隔離還原演練，不碰 production 原始資料。
    - [ ] 留存 restore drill report、校驗值、耗時與失敗復原步驟。
  - 恢復條件：上線範圍包含正式 CAD 檔案保存、Google Drive mirror、Supabase Storage、完整 PDM production ready 或正式資料保存政策時恢復。
  - 下一步：第一版 Phase 3A 依 closed `HD-8-4 / 1A` 驗證最低 DB continuity evidence；本 DEV 的完整 file-storage/offline restore drill 延後到 Phase 3B 或完整 PDM file release。
  - 計入交付：否

- × DEV-038 [關卡] [人類決策取消] [不計為通過] 正式現場測試證據
  - 摘要：原規劃在 Phase 3A.0 named-user production canary 上執行固定五個工作日端到端觀察；使用者於 2026-07-14 以 `HD-9-1` 明確取消，不執行且不再阻擋第一版 release。
  - 來源 ID：`DEV-FIELD-001`
  - 父任務：正式環境準備
  - 取消邊界：不執行五日 observation、formal field report 或以此任務簽署 pilot accepted；既有 2026-07-14 真人 UI 登入、領號、重登持久性與系列代號重測保留為 local functional evidence。
  - 保留 gate：初次 named 3-5-user allowlist、非 allowlist fail-closed、DB outage 禁止紙本/Excel/offline 補登、production post-deploy smoke、零 open P0/P1 與明確 allowlist 變更仍由 `DEV-032` 驗證。
  - 下一步：`DEV-046` Phase 2B staging authentication activation 已完成；之後以 release 型指令進入 `DEV-032`，不得因本任務取消而宣稱 production/pilot 已通過。
  - 計入交付：否

- ✓ DEV-040 [交付點] [本輪本地範圍已完成] [P0] [Release Gate Required for production use] 正式領號 / 草稿 production slice
  - 摘要：Web 正式領號與 `/parts?tab=drafts` owner workspace production slice 已完成 local product slice；DEV-048已實體移除獨立草稿／領號頁，舊URL只轉址；未開放功能保留藍圖可見性，但 UI 與 API fail-closed。
  - 來源 ID：`DEV-PDM-PRODUCTION-SLICE-001`
  - 父任務：`DEV-PDM-NUMBERING-004`、`DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`、`DEV-PDM-ACCESS-CONTROL-001`、`DEV-CLOUDSQL-DB-001-PROD-GATE`
  - 已完成任務清單：
    - ✓ 建立 central production-slice capability model 與 method-level allowlist / default-deny gate。
    - ✓ 新增 production-slice status API 與直接 URL blocked state。
    - ✓ Sidebar roadmap 保留可見，但未開放路由顯示 `未開放` 並導向 blocked page。
    - ✓ `/parts?tab=drafts` owner workspace承接建立、編輯與候選號生命週期；`submit` / `withdraw` / `publish`為accessible inert `未開放` action，direct API fail-closed。
    - ✓ 2026-07-15 修復 `POST /api/numbering/duplicate-check` production-slice allowlist 缺口；建立圖料號草稿的新主根查重不再被誤判為未開放功能。
    - ✓ Direct API 對 `submit-review` / `reconfirm` / `restore` 回 stable `feature_not_open_in_production_slice`，且在 mutation 前停止。
    - ✓ Draft delete/recycle 仍使用既有 controlled-boundary predicate；正式 root/drawing/part 號碼不可回收。
    - ✓ `.env.example` 補上 `PDM_PRODUCTION_SLICE_MODE`。
    - ✓ Focused QC 與既有 numbering/UI/access-control regression 已通過。
  - 下一步：若要讓內部人員正式使用，改走 `DEV-032` release gate，確認 production target、named 3-5-user allowlist、smoke company / tenant、部署、rollback、post-deploy smoke、零 open P0/P1 與 `HD-8-4 / 1A` pre-canary restore/reconciliation。`DEV-038` 已取消；任何 allowlist 擴大仍須明確 release 決策。若要擴大到送審、發行、CAD、BOM 或完整 PDM，另開對應 DEV，不併入本 slice。
  - 阻塞 / 恢復條件：production release/deploy、live Cloud SQL target、provider pointer、rollback、production smoke、資料恢復與直接資料修復仍由 `DEV-032` release gate / 高風險確認管控。
  - 證據：`.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`、`.ai-doc/decisions/ADR-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch-boundary.md`、`.ai-doc/qa/qa-pdm-production-slice-numbering-draft-validation-plan-2026-07-09.md`、`.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`
  - 批次發版：見 `DEV-032`；merge、PR、deploy、rollback、production smoke 與 release report 延後到 release 型指令或高風險確認。
  - 計入交付：是

## 1. 未完成任務與 release gate 明細

此 active board 只保留尚未完成、本輪可執行、需高風險確認、需外部證據、需產品上線決策，或本地已完成但仍需 release gate 的項目。已完成任務的完整歷史細節已歸檔到 2026-07 completed index 與 sweep 前快照；本節只作為派工與恢復條件的明細。

| 狀態 | DEV | 來源 ID | 類型 | 下一步 / 恢復條件 |
|---|---|---|---|---|
| ✓ 本輪本地範圍已完成 | `DEV-005` | `DEV-PDM-SUBMISSION-GATE-001` | 交付點 | Phase 1 local QC passed；Phase 2+ 需另指定，release/deploy 走 `DEV-032` |
| ✓ Phase 2B complete | `DEV-046` | `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` | 開發點 | staging activation已完成；Phase 3A production由`DEV-032`執行，Phase 3B+只保留future capsules |
| ↷ 待選切片 | `DEV-015` | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P` | 開發點 | 指定一個第2+階段切片後才恢復為可執行 |
| ✓ 本輪本地範圍已完成 | `DEV-050` | `DEV-PDM-REVISION-POLICY-002` | 交付點 | Phase 1A suggestion snapshot、Phase 1B release gate focused QC passed；Phase 1C emergency-use deferred；release/deploy 另走 gate |
| ✓ 本輪本地範圍已完成 | `DEV-051` | `DEV-PDM-REVISION-TIMING-UX-001` | 交付點 | Phase 1A-1D 本機實作與 QA/QC passed；candidate suggestion 提前、CTA 於 publication/promotion 前 fail-closed；release/deploy 另走 gate |
| × 併入 | `DEV-030` | `DEV-CLOUDSQL-DB-001` | 關卡 | target/capacity/apply併入`DEV-032 Gate B`，migration/continuity併入`Gate C` |
| × 併入 | `DEV-031` | `DEV-CLOUDSQL-DB-001-DATA-PARITY` | QA/QC | clean seed/archive/restore/reconciliation保留角色分離QC，統一由`DEV-032 Gate C`派工 |
| ! release gate | `DEV-032` | `DEV-CLOUDSQL-DB-001-PROD-GATE` | 關卡 | 唯一production入口；當前執行`Gate A` configuration與credentialled plan review，不得apply |
| ↷ Phase 3B future | `DEV-033` | `DEV-STORAGE-COST-001` | 開發點 | 與DEV-046 Phase 3B、DEV-037合併為GCS authority/cost/continuity package |
| ✓ 完成 | `DEV-034` | `DEV-IND-007` | 關卡 | disposable local PostgreSQL shadow gate 已通過；正式 Cloud SQL release只走`DEV-032` |
| ↷ 延後 | `DEV-035` | `DEV-CAD-001` | 關卡 | 3D 預覽人類實測 OK；2D 預覽 / native metadata 延後到完整 CAD 階段 |
| × 停止追蹤 | `DEV-036` | `DEV-SW-001` | 關卡 | 目前無 Add-in 產品路線；保留歷史 ID，未來需新產品決策才恢復 |
| ↷ 延後 | `DEV-037` | `DEV-BACKUP-001` | 關卡 | 完整 PDM file/GCS/offline restore drill 延後；Phase 3A 另依 closed `DEV-046 HD-8-4 / 1A` 完成 pre-canary DB restore/reconciliation |
| × 取消 | `DEV-038` | `DEV-FIELD-001` | 關卡 | `HD-9-1` 於 2026-07-14 取消固定五個工作日驗證；不執行、不算通過，且不再是第一版 blocker |
| ✓ 本輪本地範圍已完成 | `DEV-040` | `DEV-PDM-PRODUCTION-SLICE-001` | 交付點 | Phase 1 local product slice 已完成並驗證；正式部署、production smoke、release report 另走 `DEV-032` |

稽核限制：`qc:dev-task-completion-audit` 只稽核 external-evidence table 中尚未關閉的 blocker；`DEV-FIELD-001` 已依 `HD-9-1` 關閉為 cancelled，而非 evidence passed。production readiness 必須繼續顯示 `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` live platform/release blocker；任何稽核通過均不得單獨宣稱 live staging/production ready。

## 2. 批次發版與正式環境關卡

共用 release、production、Cloud SQL、migration、provider pointer、rollback 與 production smoke 不掛在每個已完成 DEV 底下，只由 `DEV-032` active gate 管控：

- `DEV-032 Gate A`：production provider/env/secret metadata與credentialled plan review；不得apply。
- `Gate B`：production resource apply；原`DEV-030` target/capacity/resource scope在此驗收。
- `Gate C`：clean seed/migration/restore/reconciliation；原`DEV-031` data-continuity QC在此驗收。
- `Gate D`：immutable deploy、rollback、Level 3/4 smoke。
- `Gate E`：3-5位named-user canary與後續allowlist變更。
- `DEV-034`：SQLite 到 PostgreSQL 影子遷移已完成本機 disposable gate；正式 Cloud SQL target只走`DEV-032`。
- `DEV-040`：正式領號 / 草稿 production slice；Phase 1 local product slice 已完成並驗證，release/deploy 仍走 `DEV-032`。

使用者已授權本輪依Gate A-E順序執行所有Codex可完成工作；任何delete/replace、USD 240以上估算、target/provenance不一致、migration/restore/rollback/reconciliation/Level 3或4失敗仍須立即停止。Google re-auth、provider/MFA、DNS、named canary與真人UI驗收集中在人類工作包。

## 3. External Blockers / Parked Scope（外部阻塞與暫停範圍）

這些項目沒有外部證據、高風險確認或 release-gate 指令時，不可交給 RD 直接執行。表格保留原始 task line，讓 `qc:dev-task-evidence-sync` 可以持續稽核已完成 gate 與延後範圍。

| 狀態 | ID | 範圍 | 阻塞原因 / 恢復條件 |
|---|---|---|---|
| [x] | DEV-IND-007 | SQLite to Postgres / Supabase shadow migration | Disposable local Postgres shadow gate passed with schema/RLS compare evidence; formal production target/advisor work, if needed, remains in `DEV-032`. |
| [/] | DEV-CAD-001 | SolidWorks Document Manager or equivalent reader | Human test: SW upload OK and 3D preview OK; 2D preview/native metadata remains deferred to full CAD phase and is not a first-version blocker. |
| [ ] | DEV-SW-001 | SolidWorks Add-in real-machine validation | Cancelled as a product route, not evidence-passed. Historical ID retained; a new product decision is required to reopen it. |
| [ ] | DEV-BACKUP-001 | Offline one-way backup and restore drill | Full PDM file/GCS/offline restore drill deferred to Phase 3B/full file readiness; Phase 3A separately requires closed DEV-046 `HD-8-4 / 1A` pre-canary Cloud SQL restore/reconciliation evidence. |
| [x] | DEV-FIELD-001 | Formal field-test evidence | Cancelled by Human Decision `HD-9-1` on 2026-07-14; closed without execution or acceptance evidence and no longer a first-version blocker. |
| [!] | DEV-PDM-ERP-GOOGLE-CLOUDSQL-001 | Live platform and release readiness | DEV-046 Phase 2B staging activation complete. DEV-032 pre-build gate opened on 2026-07-15; dirty source boundary is classified and hashable with zero unknown-risk paths, clean seed/allowlist/`HD-8-4` restore package、template-only production activation checklist 與 activation readiness aggregator 均已 QC-checked，production target contract template and fail-closed production IaC review package are QC-checked, Docker Terraform static validate passes against a copied backend-disabled workspace, read-only production target preflight writes `output/dev-032-production-target-preflight/report.json` with production action `false`, and release-source commit plan has been applied into the current release-candidate HEAD. Current release-candidate source also includes the read-only draft number preview/no-reservation route and matching number-state QC evidence. Production GCP project `jenfu-ai-pdm-prod` is now created/readable, but gate remains blocked by missing production Firebase/provider config, production env/secret metadata readback, credentialled production plan/resource readback, real production runtime/database/secret inventory, separate-target restore/reconciliation execution, rollback evidence, Level 3 production-like smoke and Level 4 post-deploy smoke. See `.ai-doc/reports/pm/pm-dev-032-production-release-gate-preflight-2026-07-15.md`, `.ai-doc/reports/pm/pm-dev-032-source-boundary-classification-2026-07-15.md`, `.ai-doc/reports/pm/pm-dev-032-release-source-manifest-2026-07-15.md`, `.ai-doc/reports/pm/pm-dev-032-production-iac-review-package-2026-07-15.md`, and `.ai-doc/reports/pm/pm-dev-032-production-gate-package-2026-07-15.md`. |
| [!] | DEV-STORAGE-COST-001 | Future GCS authority/cost/continuity package | Parked with DEV-046 Phase 3B and DEV-037 until Phase 3A is stable and file-workflow scope, inventory, lifecycle policy, cost and recovery ownership are approved. |

保留給 `qc:dev-task-evidence-sync` 的外部證據 checklist：

- [x] 取得 disposable Supabase / Postgres shadow target。
- [x] `npm.cmd run qc:postgres-shadow` 在 disposable target 通過。
- [ ] `P0` 整合 SolidWorks Document Manager API 或等效讀取元件。
- [ ] `P0` 確認 SolidWorks Document Manager 可部署方式與使用條件。
- [ ] `P0` SolidWorks Document Manager API 或等效可部署讀取元件。

## 4. 已完成任務與證據摘要

完整已完成任務索引：`.ai-doc/archived/completed-dev-index-2026-06.md`；`.ai-doc/archived/completed-dev-index-2026-07.md`。

| ID | 完成狀態 | 目前處理 | 證據摘要 |
|---|---|---|---|
| `DEV-PDM-LIFECYCLE-ACTIONS-001` | Phase 1-6 local/staging implementation and QC evidence are captured; local commit `21bcf16`. | Logical Archive / Protected Evidence. Production/Supabase production cutover remains outside release gate. | Phase 5 unified controlled-history UI/API slice is implemented/QC-checked. Phase 6 local/staging release readiness records production/Supabase production exclusion and user-requested scoped Git/index cleanup. User has authorized scoped Git/index cleanup. Unified controlled history covers released submissions, formal part numbers, formal drawing numbers, and released BOM. Evidence includes `npm.cmd run qc:pdm-lifecycle-controlled-history` 56/56, `npm.cmd run qc:pdm-lifecycle-controlled-history-ui` 30/30, `npm.cmd run qc:pdm-lifecycle-submission-obsolete` 20/20, `npm.cmd run qc:pdm-lifecycle-release-readiness` 47/47, and screenshots `output/playwright/pdm-lifecycle-controlled-history-desktop.png`, `output/playwright/pdm-lifecycle-controlled-history-mobile.png`. |
| `DEV-PDM-CHANGE-CONTROL-001` | Phase 1-5 local implementation completed and QC-captured. | Logical Archive / Protected Evidence; optional follow-up only if PM expands scope. | ADR/SPEC/implementation contract/QA and `scripts/qc-pdm-change-control.mjs`; QC reports for Phase 1, 2, 3, and 4-5; `npm.cmd run qc:pdm-change-control` 50/50; `npx.cmd tsc --noEmit --pretty false`. |
| `DEV-PDM-REVISION-001` | Numeric no-`V` revision policy implemented; manual QA plan prepared. | Closed local package. | Branch `codex/pdm-revision-policy`; commits `8f472d0`, `af08d81`; `qc:master-attachments`, `qc:revision-lifecycle`, `qc:policy-alignment`; QA plan `.ai-doc/qa/qa-pdm-revision-manual-validation-plan-2026-06-22.md`. |
| `DEV-SW-LICENSE-PDM-001` | Company-scoped PDM boundary implemented and committed. | Logical Archive / Protected Evidence because QC scripts reference original package paths. | Supabase staged evidence commit `be333eb` (`DEV-SUPABASE-DB-001 record staging gate B evidence`), scoped SW/PDM commit `6f4dbab` (`DEV-SW-LICENSE-PDM-001 add company-scoped PDM boundary`), PM handoff `.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md`, and `qc:sw-license-pdm-git-boundary`. |
| `DEV-SUPABASE-DB-001-GATE-B` | Staging gate passed for `AI_PDM_STAGING`; smoke write/readback/cleanup and rollback proof captured. | Protected Evidence; parent production/cutover remains deferred. | Approval package, runbook, smoke API matrix, target identity receipt, execution report, QA/QC staging validation, permission seed repair, rule seed repair, migration history policy, rollback readiness, data parity policy. |
| `DEV-SUPABASE-DB-001-GATE-B-STAGING-QA-QC` | QA/QC staging validation passed for `AI_PDM_STAGING`. | Protected Evidence. | QA plan and QC read-only report; zero active smoke residue; production and cutover remain explicitly unapproved. |
| `DEV-SUPABASE-DB-001-GATE-B-PERMISSION-SEED` | Permission repair passed. | Protected Evidence. | `roles=6`, `role_permissions=86`, active priority=1; admin matrix, rule simulator, duplicate check returned HTTP 200. |
| `DEV-SUPABASE-DB-001-GATE-B-RULE-SEED` | Minimal `numbering-rule-v1` seed repair passed. | Protected Evidence. | `numbering_rule_versions=1`; `numbering-rule-v1` exists and is active; write path no longer fails FK. |
| `DEV-SUPABASE-DB-001-MIGRATION-HISTORY` | Migration history policy accepted for staging exception; Supabase CLI is absent locally. | Protected Evidence. | Migration history policy; `qc:supabase-migration-history-policy`; `qc:supabase-runtime-migrations`; `supabase/migrations/manifest.json`. |
| `DEV-SUPABASE-DB-001-ROLLBACK-PROOF` | Rollback readiness prepared and passed after stopping Postgres-mode local process. | Protected Evidence. | `.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md`; `qc:supabase-runtime-rollback-readiness`; `PDM_DB_PROVIDER=<unset>` and `PDM_POSTGRES_URL=<missing>`. |

## 5. Supabase 受保護證據契約

本節刻意保留 exact evidence names，因為多個 QC scripts 會直接讀取 `dev_task.md`。

Protected QC marker: Production gate; staging GATE-B passed; production/cutover remains unapproved and deferred.

| Evidence / gate | 目前狀態 | QC token or path |
|---|---|---|
| `DEV-SUPABASE-DB-001-GATE-A` | Done for preparation; runtime execution evidence belongs to GATE-B. | `.ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md`; `qc:supabase-runtime-gate-plan` |
| `DEV-SUPABASE-DB-001-GATE-B` | Staging GATE-B passed for `AI_PDM_STAGING`; production/cutover remains unapproved and deferred. | `.ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md`; GATE-B approval package; `qc:supabase-runtime-approval-package` |
| GATE-B execution runbook | GATE-B execution runbook prepared. | `.ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md`; `qc:supabase-runtime-gate-b-runbook` |
| Runtime smoke API matrix | Prepared. | `.ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md`; `qc:supabase-runtime-smoke-api-matrix` |
| Runtime smoke auth/session boundary | Prepared. | `.ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md`; `qc:supabase-runtime-smoke-auth-session-boundary` |
| Runtime smoke report template | Prepared controlled evidence. | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md`; `qc:supabase-runtime-smoke-report-template` |
| Runtime smoke execution report | Passed; app API write/readback/cleanup and current state captured. | `.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md`; `qc:supabase-runtime-smoke-report` |
| GATE-B local pre-approval suite report | Prepared. | `qc:supabase-runtime-gate-b-local-suite-report` |
| GATE-B staging QA/QC validation | QA/QC staging validation passed for `AI_PDM_STAGING`; No production access. No production cutover. | `.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md`; `.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md` |
| Target identity receipt template and user-provided receipt | Recorded; target is `AI_PDM_STAGING`; no production/cutover approval. | `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md`; `.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md`; `qc:supabase-target-identity-receipt` |
| Runtime rollback readiness | Rollback readiness prepared and passed. | `.ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md`; `qc:supabase-runtime-rollback-readiness` |
| Data parity policy | `DEV-SUPABASE-DB-001-DATA-PARITY` policy prepared; execution not approved. | `.ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md`; `qc:supabase-data-parity-policy` |
| Current Supabase change impact audit | Current Supabase change impact audit is prepared as local evidence. | `.ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md`; `qc:supabase-current-change-impact` |

QC 要求保留的 Supabase stop wording：

- Production target setup or production cutover is not approved.
- Cost-incurring actions are not approved.
- No repository file contains runtime secrets.
- Service role, secret keys, database passwords, and pooler URLs must never be exposed through `NEXT_PUBLIC_*`.

## 6. 驗證契約

此 control board 的靜態檢查：

- `git diff --check -- .ai-doc/dev_task.md .ai-doc/documentation_map.md .ai-doc/archived`
- Search all `DEV-` IDs and confirm unfinished IDs remain in this file.
- Confirm moved or logically archived evidence has no broken active link.

主要 QC 指令：

- `npm.cmd run qc:dev-task-evidence-sync`
- `npm.cmd run qc:dev-task-completion-audit`
- `npm.cmd run qc:pdm-lifecycle-release-readiness`
- `npm.cmd run qc:sw-license-pdm-git-boundary`
- `npm.cmd run qc:supabase-runtime-local-readiness` only when Supabase runtime docs are touched or as regression evidence.

已知限制：

- `qc:pdm-lifecycle-actions-git-boundary` is a historical pre-commit boundary script. After the lifecycle package was closed in commit `21bcf16`, it can fail because it still expects lifecycle candidate files to be present in staged, unstaged, or untracked changes. Treat `qc:pdm-lifecycle-release-readiness` plus commit `21bcf16` as the current closed-package evidence unless the boundary script is explicitly updated.

## 7. 停止條件

- Do not mark documentation restructuring as product Done.
- Do not delete unfinished tasks or move them only to archive.
- Do not physically move protected evidence while QC scripts still reference hardcoded paths.
- Do not execute blocked, deferred, parked, production, cutover, migration, data parity, or external-service scopes without a matching execution boundary, high-risk confirmation, or release gate.
- Do not stage unrelated dirty files.

## 8. 最新更新

- 2026-08-04: 依使用者「下一成熟度為RD Implementation Ready，請推進」，完成`DEV-053` Implementation Readiness Review並改為`☐ 可執行 / Awaiting Phase 1A Local Execution`。repo盤點發現現有append workspace只有source root，無法保存使用者指定的existing drawing/part；已建立並Accepted `ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001`，採server-side一致性投影及workspace三個nullable source-context欄位，既有rows保持NULL且不backfill。SPEC/QA/dev board已補exact files、PostgreSQL 022與Supabase mirror、relationship-only append、atomic cross-boundary relation、opaque keyset cursor、正式版次local-draft狀態限制、`PDM_UNIFIED_DRAWING_WORKBENCH_V1` default-off、Phase 1A-1D、focused commands、rollback與production release feasibility；P0/P1 open question為0。下一步只執行Phase 1A本機read foundation，本輪未修改產品、schema實體、資料、production、deploy或release。
- 2026-08-04: 依使用者「下一成熟度為RD Contract Ready，請執行」，將`DEV-053`由Brief Ready升級為`RD Contract Ready / Human Confirmed / Awaiting RD Implementation Readiness Review`。新增單一圖號工作台SPEC與「由AI執行的真實操作驗證計畫」，完成server-side unified read BFF、candidate bundle→formal drawing canonical row切換、多圖去重、state-to-primary-action、舊reserved URL zero-write相容、contextual append改走candidate workspace、controlled-file單一authority、permission交集、source failure fail-whole、feature flag與stop conditions。Spec preflight維持對DEV-052 `HD-052-04`的`Intentional replacement`；本輪只改文件，未修改product/schema/migration/production/deploy/release。
- 2026-08-04: 使用者確認不再以「圖號總表／保留號」兩頁呈現圖號生命週期；建立`DEV-053`單一圖號工作台`Brief Ready / Human Confirmed`。新方向把保留號改為生命週期狀態，以單一清單、統一drawer與每狀態唯一CTA承接建立、首版、審核、正式化、發行與進版；UI合併但底層workspace/master/revision/approval authority仍分離。Spec preflight判定為對DEV-052 `HD-052-04`的`Intentional replacement`，現有產品與DEV-052證據不回寫成新契約；本輪未修改product/schema/migration/production/deploy/release。
- 2026-08-04: DEV-052完成RD修正並交回獨立QC。QC在產品程式凍結後重跑`npm run qc:dev-052`，181項可計數檢查全數通過；AI真實操作RO-00～RO-20為41/41，涵蓋四角色登入、真實檔案上傳、送審／撤回／補件／核准、故障回滾、Admin UI重試、exactly-once正式化、legacy續接、跨公司拒絕與1440/1024/390視覺判讀。全專案lint 0 errors、隔離production build 123 pages通過，P0/P1/P2皆為0；run manifest確認productionConnected=false、productionWrites=false、cleanup=removed。狀態更新為`Phase 1A-1D Independent Local QC Passed / Production Release Gated`，未連線、遷移、部署或修改production。
- 2026-08-04: 使用者確認將現行／DEV-052 UI差異寫入開發文件。`保留號`頁籤與 `/numbering/drawings?tab=reserved` 固定保留，不建立第二套V2/legacy頁；V2工作區標題固定為 `保留號／首版準備`，角色由號碼送審／人工發布改為候選首版準備。SPEC新增現新UI比較、state-to-primary-action、資訊分層與post-formalization導向；QA新增route/tab/H1、single CTA、Now What exception-only、zero-write navigation、1440/1280/1024/390 viewport與六張狀態證據契約。DEV-052仍為RD Implementation Ready／Phase 1A未執行；本輪未修改product/schema/production。
- 2026-08-04: 依使用者指令將 `DEV-052` 補至 `RD Implementation Ready / Awaiting Phase 1A Execution`。完成實際 schema、approval savepoint、publication evidence、production slice、UI與測試入口盤點；因既有 `drawing_revision_packages.status` check 與舊版 reader 相容限制，正式決定不新增 physical `ReviewApproved` enum，改用 physical `Pending` package + immutable review-approval companion 投影 effective `ReviewApproved`。SPEC/ADR/QA已補 exact additive tables、021 PostgreSQL/Supabase mirror、default-off V2 flag、API payload/error、permission、outer transaction + savepoint、idempotency/recovery、逐檔 Phase 1A-1D與 evidence commands。下一步僅可派 `DEV-052 Phase 1A` local；本輪未修改 product code/schema、未連 production、未 backfill、未 deploy/release。
- 2026-08-03: 使用者關閉 `DEV-052 HD-052-01..03`：正式既有保留號以 zero-write read-time projection進新流程並往前推進；候選階段可建立不可正式使用的首版草稿；整包核准後由系統原子冪等正式化。文件建立效率優先 SPEC、ADR、QA plan與 DEV-048/050/051 amendments；舊 number-only approval不得擴大為圖面核准，須走 drawing addendum。當時狀態為 RD Contract Ready，未修改 product/schema/production。
- 2026-07-18: 修正 `DEV-051` 在 `official-numbering-draft` production slice 中無法取得建議版次。根因是 reservation drawer 使用 `POST /api/submissions/revision-suggestion`，middleware 將所有 POST 視為 mutation 並依 allowlist 回 403；該端點實際只有讀取歷史與計算建議，且已提供 GET。修正為帶 `drawingNumber` / `workflowIntent=rd_workspace` 的唯讀 GET，未擴張 mutation allowlist；同時讓正式 `/numbering/revisions` CTA 在 production slice 內維持停用，避免發布後導向未開放頁面。使用者回報的 `A0005-M01` 畫面實測恢復為 `ready / 0.1`，無 slice 錯誤、無水平溢出、console 0 errors/warnings。middleware smoke 證明 GET 穿過 slice gate 後由 auth 回 401，舊 POST 仍被 403 擋下。驗證通過 focused QC 13/13、production-slice 33/33、number-state Phase 1B 15/15、UI 7/7、TypeScript 與 lint；未改 schema、正式資料、live provider、deploy 或 release。
- 2026-07-18: 依使用者「繼續」完成 `DEV-051` / `DEV-PDM-REVISION-TIMING-UX-001` Phase 1A-1D 本機產品實作。保留號清單移除 raw `v{rowVersion}`，drawer 改標 `系統紀錄版本` 並新增 `圖面版次準備`；候選圖號先呼叫 `DEV-050` server suggestion 顯示 `0.1` 與 `尚未建立版次`，但因 formal revision workbench 只解析正式 `drawing_numbers`，CTA 在 workspace 尚未發布或 drawing reservation 尚未 `promoted` 時保持停用並說明原因，發布後才可 handoff。`/numbering/revisions` 支援 workflow intent aliases、resolve/submission context 一致走 central suggestion engine，人工把新版次改為 `0.2` 後不會被 async `0.1` 建議覆蓋。focused QC 13/13、DEV-050 14/14+11/11、DEV-048 Phase 1B 15/15+UI 7/7、drawing submission recovery 27/27+review-only 14/14、TypeScript、lint 均通過；Playwright 於 1440x900、1024x768、390x844、320x740 驗證無可見錯誤/重疊/水平溢出，console 0 errors/0 warnings，六張截圖保存在 `output/playwright/dev051-reservation-revision-timing-ux/`。隔離資料確認僅看建議與人工修改不建立 submission/revision package，測試 DB、auth cookie 與 30273 服務已清除，使用者既有 3000 服務保留。未新增 schema、未操作正式資料/live provider、未 merge/PR/deploy/release。
- 2026-07-18: 依使用者指定 `dev-pm` 建立並補強 `DEV-051` / `DEV-PDM-REVISION-TIMING-UX-001` 開發文件與 QA 驗證計畫，回應新保留號顯示 `新圖料 · v2` 的版次誤讀與版次調整時間點前移問題。文件現為 `RD Implementation Ready / Awaiting RD Execution`：補齊 `number-state-workspace.tsx`、`/numbering/revisions`、resolve route、revision workbench context、focused QC script 與 `package.json` 的檔案級 contract；QA plan 補上 RD traceability matrix、focused QC assertions、browser/RWD/visible-error 與 `DEV-050` regression gate。文件驗證通過 `git diff --check`、`qc:doc-paths` 23/23、`qc:dev-task-evidence-sync` 13/13、`qc:dev-task-completion-audit` 8/8。決策維持「提示提前，正式承諾延後」：保留號 detail 可提前顯示 server-derived 建議研發版次與 `建立首版圖面` CTA，但保留號本身不得持久化 drawing revision；真正可編輯版次仍在 `/numbering/revisions` 或等效受控圖面工作台，送審後由 `DEV-050` snapshot 與 minor `Released` gate 控制。本輪未實作產品程式、schema/migration、正式資料、provider、deploy、release、merge 或 PR。
- 2026-07-17: 依使用者「繼續」指令完成 `DEV-050` / `DEV-PDM-REVISION-POLICY-002` Phase 1A/1B 本機實作。新增 `revision-policy-engine` 與 `revision-policy-release-gate`，讓 `/api/submissions/revision-suggestion` 回傳 server-derived 建議版次、policy version、basis hash 與 compatibility fields；送審建立時 snapshot suggested/selected/override/policy metadata，stale basis 409，override 無理由即拒絕。release gate 已接入 final approval、release workflow 與 retry-release，minor `0.2` / `1.1` 不能成為正式 `Released`，blocked release 寫入 `revision_policy.release_blocked` 且 audit 失敗 fail-closed；Phase 1C emergency-use 仍不開放，未新增或顯示 `ConditionalUse` / `TrialApproved`。同時修正 release-master QC 舊期待，改驗證非重複較低整數正式版可補發為歷史且 latest/current 維持較高版；移除 `tsconfig.json` 中已失效的歷史 `.tmp/next-qc-numbering-request-ux-20260714` type include。驗證通過 `qc:pdm-revision-policy-suggestion` 14/14、`qc:pdm-revision-policy-release-gate` 11/11、`qc:pdm-change-control` 62/62、`qc:pdm-drawing-submission-workbench-recovery` 27/27、`qc:pdm-drawing-submission-review-only` 14/14、`qc:pdm-drawing-revision-package-model` 59/59、`qc:pdm-release-master-status-sync` 31/31、`npm.cmd run lint`、`npx.cmd tsc --noEmit --pretty false`。未操作正式資料、live provider、schema migration、deploy、release、merge 或 PR。
- 2026-07-17: 依使用者指定 `dev-pm` 與 `#引導模式`，針對管理辦法版次原則與現行系統落差建立 `DEV-050` / `DEV-PDM-REVISION-POLICY-002` 開發文件。第一輪決策為 `1C / 2A / 3A`：文件達 RD Implementation Ready 但逐步確認，先阻擋小數版 `Released` 並加入系統自動建立建議版次，小數版緊急使用不得借用 `Released`。第二輪決策為 `1C / 2B / 3C`：實作順序先做 suggestion snapshot 再做 release gate；建議版次只在 API response 產生並於送審 snapshot 固化，不新增獨立 policy table；Phase 1 不開放緊急使用情境。新增並更新 SPEC 與 QA plan，Phase 1A/1B 可拆小任務實作，Phase 1C deferred。文件驗證通過 `git diff --check`、`qc:doc-paths` 23/23、`qc:dev-task-evidence-sync` 13/13 與 `qc:dev-task-completion-audit` 8/8。本輪未實作產品程式、schema/migration、正式資料、provider、deploy、release、merge 或 PR。
- 2026-07-15: 執行PM治理CAPA：根因是架構父任務、database gate、data QC與release gate同時被當成active blocker，加上phase完成狀態未同步cold-start，造成重複派工與狀態失真。CA將第一版production收斂為唯一`DEV-032 Gate A-E` work package，`DEV-030/031`保留來源ID但不再獨立派工，`DEV-046`改為Phase 2B完成/future phases gated，`DEV-033 + DEV-046 Phase 3B + DEV-037`合併為future GCS package，`DEV-047`改為production穩定後恢復，`DEV-036`停止追蹤。PA同步更新cold-start、documentation map與active SPEC；文件治理不計入產品交付完成。
- 2026-07-14: 執行 `DEV-045` Phase 2 本機切片。完成 provider-managed recovery handoff、Firebase-managed `PASSWORD_RESET` adapter contract、`account_session_records` server-owned additive registry、`/account/security` self-service session/device visibility、個別撤銷其他 session、logout registry revoke、public recovery handoff generic response、production-slice account-safety allowlist、PostgreSQL/Supabase migration mirror與RLS deny-list更新。驗證通過 `npm run qc:dev-045-phase2` 14/14、`npm run qc:supabase-runtime-migrations` 66/66、`npx tsc --noEmit`；首輪QC暴露 production-slice gate 擋住 account-safety revoke API，已補最小 allowlist 後重跑通過。未執行 live Firebase/Cloud Identity寄信、authorized domain/quota/privacy審查、Cloud SQL live migration、staging/production、merge、PR、deploy、release或ProJED修改；AI_PDM仍不建立自有password/reset/MFA authority或第二套session authority。
- 2026-07-14: Firebase Management REST API將staging project加入Firebase並建立Web App `1:1042387036944:web:dc5bf62bb50038c7ac9395`；公開Web API key限制於Identity Toolkit/Secure Token/Firebase Installations及核准referrers，未連Analytics且未建立Firestore/Storage/Hosting資料資源。Terraform secret bootstrap plan/apply為2 add/0 destroy，deletion-protection plan/apply為2原地update/0 destroy；current/previous各建立一個ENABLED version，使用記憶體stdin、未落檔／未輸出且值相異。Web/secret blockers關閉，external/live blocker由7降為5。
- 2026-07-14: Phase 2B bootstrap依`CHG-DEV046-PHASE2B-20260714`建立ACTIVE project `jenfu-ai-pdm-stg-361825`並連結Paid Billing Account，建立`ASIA-EAST1` state bucket `jenfu-ai-pdm-stg-361825-tfstate`，啟用uniform bucket access、public access prevention、versioning與30日soft delete。以短效token注入隔離Docker Terraform 1.14.5，remote backend init與空state list通過；未掛載gcloud設定且未建立runtime/application資源。state與executor blockers關閉，external/live blocker由9降為7。
- 2026-07-14: `HD-10-1 / 1A`採staging單區、production Regional HA。IaC將staging Cloud SQL `availability_type`改為`ZONAL`，保留PITR、14份備份、private IP、IAM DB auth與deletion protection；Taiwan list price估算Cloud SQL約USD 86.67，含備份以USD 90編列，Phase 2B/3A保守總估算USD 210。`COST_FORECAST_EXCEEDS_PLAN_REVIEW_STOP`關閉，external/live blocker由10降為9；當時credential、plan、apply與resource flags仍維持false。
- 2026-07-14: 使用者核准`DEV-046 Phase 2B` isolated staging資源建立，限制為USD 300/月、plan預估超過USD 240或出現刪除／取代即停止；本地建立`CHG-DEV046-PHASE2B-20260714`。當時規劃在排除Phase 3B GCS後仍為USD 280，故新增`COST_FORECAST_EXCEEDS_PLAN_REVIEW_STOP`並維持`resourceCreationEnabled=false`、`terraformApplyAllowed=false`。使用者另提供`nokai520@hotmail.com`作受控non-Google登入測試帳號，關閉其missing gate；change ticket與resource authorization missing gate亦關閉，Phase 2B external/live blocker由12降為10。後續成本gate由`HD-10-1 / 1A`關閉。
- 2026-07-14: 使用者回報Billing Account `018678-C2F032-7680E4`已啟用為Paid account且付款方式正常。machine-readable staging preflight將`paymentActivationApproved`改為true，並記錄`human-reported-cloud-console`、`billingStatusVerifiedAt=2026-07-14`；只關閉`PAYMENT_ACTIVATION_NOT_AUTHORIZED`，當時不視為`RESOURCE_CREATION_NOT_AUTHORIZED`、credential、Terraform plan/apply或任何付費資源建立授權。Phase 2B external/live blocker由13降為12；未讀credential、未執行cloud/billing mutation、未plan/apply/deploy、未修改ProJED。
- 2026-07-13: DEV-048 Phase 1D完成RD與獨立QC，Phase 1A-1D local product integration正式收斂。Phase 1D實作transfer draft scope、aggregate readiness/review、explicit all-or-none batch publish、published-only handoff、`/technical-transfer`三頁籤及舊route compatibility。首輪獨立QC發現legacy API guard、scope command idempotency、ReleaseFailed lock recovery三個P1，以及UI publish permission、PostgreSQL event immutability兩個P2；修正後獨立重驗未留P0/P1/P2。最終Phase 1D focused aggregate 60/60，Phase 1A/1B/1C回歸48/48、14/14、43/43，Supabase mirror 59/59、Postgres static/target guard 26/26、access-control 253/253、TypeScript、lint 0 errors及120頁isolated build均通過。未設定live Postgres shadow、未連Cloud SQL/Firebase/GCS、未stage/commit/deploy/release；後續只能由明確指令進DEV-046 / DEV-032 release gate。
- 2026-07-13: 依使用者指定`dev-pm`，先確認DEV-046可本機完成範圍已收斂，再評估並續做DEV-047。因DEV-047正式Phase A仍以DEV-046 Phase 3A pilot穩定為前置，本輪不偽造live inventory，改完成Phase A0本機唯讀工具：新增deterministic SQL artifact/SQLite-PostgreSQL mirror/source dependency inventory、dynamic SQL人工複核queue、source hash與explicit external-consumer unknown，產出`output/dev-047-bounded-schema-inventory/local-baseline.json`；另準備未執行的PostgreSQL catalog唯讀查詢契約。focused QC 22/22通過，本機baseline辨識123個PostgreSQL table artifact names、5,357筆保守code dependency candidates與20個dynamic SQL candidates，candidate batch維持0。未讀credential、未連DB、未使用snapshot/business row、未提出destination、未執行DDL/lock/staging/production/ProJED/release；正式Phase A仍等待pilot stability、代表性target/snapshot、read-only operator與evidence owner。
- 2026-07-13: 依使用者指令完成DEV-046 employee privacy notice/acknowledgement local slice。新增Pilot v1.0 canonical SHA-256、immutable notice/ack schema與PostgreSQL/Supabase migration artifact、first-session pending cookie、exact-version API、protected BFF recheck、ack/invitation atomic activation、永久`/privacy`、re-ack page、login/sidebar入口及Admin唯讀證據。focused QC 20/20、migration QC 56/56、Phase 2A 20/20、Phase 2B 14/14、account lifecycle 26/26、source-only TypeScript、full lint、isolated production build及desktop/mobile browser QC通過；visual QC發現並修正390px acknowledgement panel的min-content窄欄缺陷，最終完整告知、checked/disabled gate與expired-session visible error均無裁切。preflight維持`blocked_external`且live blockers由14降為13。未建立或修改雲端／付費資源，未讀credential、未執行live migration/provider user/plan/apply/deploy，實際staging effective timestamp仍為空，ProJED未修改。
- 2026-07-13: DEV-048 Phase 1B缺陷修正後由獨立QC判定PASS。1024/768的狀態、候選號、下一步與明細CTA無需水平捲動；390/320改為完整標籤卡片清單並驗證full-height scrollable drawer；access-control回歸253/253、governance 93/93、focused/API/regression、TypeScript、lint與isolated production build均通過，visible-error與console error為零。Phase 1C現已開放RD；live provider、staging、production與release gate仍未授權。
- 2026-07-13: 依使用者指令完成DEV-046 employee-login-alias local slice。新增company-scoped alias、token-hash-only五分鐘single-use intent、資料庫共用rate-limit、同源登入API、Firebase UID/PDM user/company一致性兌換、登入UI、`/settings/accounts`新增／退役UI及production-slice allowlist；focused QC 21/21、TypeScript、lint零錯誤、isolated production build、desktop/mobile browser QC及既有Phase 2A/2B regression均通過。`EMPLOYEE_LOGIN_ALIAS_MAPPING_NOT_IMPLEMENTED`已關閉，live blockers由15回到14；Cloud SQL migration、真實Firebase provider與跨instance staging證據仍未執行。本輪未讀Google credential、未plan/apply/import/deploy、未建立付費資源，ProJED未修改。
- 2026-07-13: 依使用者指令執行DEV-048 Phase 1B RD。已完成owner surfaces建立入口、`/parts?tab=drafts`草稿清單與detail drawer、四種create mode、先保存再明確領候選號、server projection/capabilities、候選號取消回收、Phase 1C disabled actions、`PDM_NUMBER_STATE_FLOW_V1`、四個舊側欄入口退出與保留query/`returnTo`的route compatibility；並修正browser same-origin誤拒、1024px hidden-header overflow、client-only legacy redirect及未授權badge請求噪音。RD self-verification通過Phase 1B contract 14/14、HTTP 21/21、numbering core 241/241、contextual entrypoints 46/46、entity drawer 14/14、production-slice 27/27、focused ESLint、isolated production build及1440/1024/768/390/320瀏覽器流程與overflow檢查。現為`RD Implemented / Independent QC Pending`；既有port 3000未停止或寫入，本輪未stage/commit、未做Phase 1C/1D、live provider、正式資料、deploy或release。
- 2026-07-13: DEV-046 Phase 2B 第3項身分決策採「支援工號登入別名與帳號映射，但不開發AI_PDM自有密碼儲存、MFA與密碼重設系統」：Cloud Identity／Firebase Identity Platform擁有credential、MFA與recovery；alias只建立最長5分鐘、single-use、company-bound provider-routing intent，callback仍以verified provider UID映射stable PDM User ID。規格已補data/API/UI/security/QA契約；因尚未實作，machine preflight新增`EMPLOYEE_LOGIN_ALIAS_MAPPING_NOT_IMPLEMENTED`，live blocker由14增為15，既有Phase 2B local QC完成證據不回溯灌水。
- 2026-07-13: DEV-046 Phase 2B 引導決策續輪採 `1A / 2A`：正式圖號與防重所需最小台帳永久保存，已關閉／取消草稿保存3年，操作稽核保存3年且永久主體識別使用stable PDM User ID而非email；公司核准員工個資告知Pilot v1.0，於staging開放給第一位員工時生效。machine-readable approval已關閉`EMPLOYEE_PRIVACY_NOTICE_APPROVAL_MISSING`，但新增`PRIVACY_NOTICE_UI_AND_ACKNOWLEDGEMENT_NOT_IMPLEMENTED`，需先實作版本hash、首次確認、永久查閱與Admin證據才可啟用員工帳號，因此Phase 2B blocker仍為14。第3題「無既有Google帳號的公司配發身分」仍待選擇Cloud Identity、Firebase email/password或自建帳密邊界。
- 2026-07-13: DEV-046 Phase 2B 引導決策採 `1A / 2A / 3C`：AI_PDM staging核准共用既有Billing Account `018678-C2F032-7680E4`；離職立即停權、Firebase identity 30日後刪除、邀請／復原／session security 180日、application security logs 365日，另揭露Google `_Required` provider固定400日；privacy聯絡窗口為`jedchang0308@jenfu.com.tw`主責、`dani@jenfu.com.tw`備援。已更新machine-readable preflight/privacy/location manifests與SPEC；free-trial升級、付款與付費資源仍未授權，並新增獨立`PAYMENT_ACTIVATION_NOT_AUTHORIZED` gate；商業稽核保存期限及privacy v1.0最終核准仍開放。Phase 2B blockers由15降至14。
- 2026-07-13: DEV-046 Phase 2B 引導決策採 `1A / 2A / 3A`，授權唯讀Cloud discovery、公司名義self-service Billing方向與員工個資告知草案。Cloud Console以`jedchang0308@jenfu.com.tw`查得organization `jenfu.com.tw / 361825816000`、既有projects `projed-cc78d`、`projed-test`、`projed-485502`、`valid-tuner-484106-m6`，以及既有Billing Account `018678-C2F032-7680E4` free-trial state，推翻「Cloud皆未建立」假設。未建立或修改任何cloud/billing/project/IAM/resource；AI_PDM共用或另建Billing於後續決策關閉。新增員工個資告知草案與首次啟用／永久查閱／Admin稽核UI契約，仍非法律／privacy核准。Phase 2B external blockers降至15。
- 2026-07-13: DEV-046 Phase 2B 引導決策續輪採 `1A / Workspace-only / 3A`：staging Cloud SQL 改為 `db-custom-1-3840` Regional HA，核准 USD 300月預算、50/80/100 alerts與USD 240 credentialled-plan review stop；主要 cost/business owner為`jedchang0308@jenfu.com.tw`，continuity backup為`dani@jenfu.com.tw`。公司當時自述只有Google Workspace，Organization ID待唯讀discovery，Cloud project/Billing Account/state/Firebase均尚未建立；後續唯讀discovery已更正此假設。IaC、preflight、cost/continuity governance與文件已同步；Phase 1E QC 24/24、Phase 2A QC 20/20、Phase 2B local preflight 19/19且external blockers由25 -> 19 -> 16。未建立資源／billing／DNS、未plan/apply/deploy。
- 2026-07-13: 依使用者指定`dev-pm`繼續DEV-048，單一派工邊界執行Phase 1A獨立QC。新增可重跑的disposable HTTP與provider-outage suites；aggregate通過contract 19/19、runtime 7/7、HTTP 20/20與503 fail-closed 1/1，另確認Postgres shadow 26/26、Supabase migration mirror 46/46。Company A/B、owner/manager/admin/denied、20-way distinct/same-key acquire、direct API bypass、review blocker、recycle gap reuse、正式master零污染與no-offline均有事實證據。首輪HTTP 19/20僅因QC斷言把wrong-company Admin 404誤限定為通用permission code，修正測試後完整clean-fixture rerun 20/20；產品程式無需修復。Phase 1A改為`QC Passed / Phase 1B Ready`；本輪未進Phase 1B，未使用live provider/正式資料，未stage/commit/deploy/release。
- 2026-07-13: 使用者以`1C / 2C / 3C`關閉DEV-048 `HD-048-01..03`。Phase 1B開放時立即移除`料號草稿 / 領號申請 / 上傳送審 / 製造交接`四個可見側欄項目，舊URL只保留redirect/guidance與context；drawing及含drawing/required-file技轉發布必須有finalized controlled GCS evidence，純root/part-only可由版本化server rule回`not_required`，production verifier未就緒前需檔案發布維持鎖定；同一自然人可submit、approve、publish，但三步仍需各自明示permission、command/confirmation/receipt/audit，approval不得自動publish。SPEC、ADR、QA、dev_task與documentation map同步改為Phase 1B-1D `RD Contract Ready / Sequential QC Gated`；下一步仍是`DEV-048 Phase 1A QC`。本輪只修改文件，未實作產品、provider、正式資料、merge、PR、deploy或release。
- 2026-07-13（當時狀態，已由上一筆`1C / 2C / 3C`決策關閉更新取代）: 依使用者指定`hcs`以RD主管角色複核DEV-048後續文件。審查否定「Phase 1B-1D已無P0/P1缺口」的舊判定：新增`HD-048-01`舊側欄roadmap相容策略、`HD-048-02`publication file-evidence applicability、`HD-048-03`submitter/approver/publisher SoD三項Human Decision Gate。直接補正五項工程缺口：四種create mode責任矩陣、same-workspace internal relation不阻擋整包取消、pre/post-commit publication failure分流、transfer batch每workspace official event cardinality與獨立failure-record command、320/768 responsive boundary。當時Phase 1A可先做獨立QC，Phase 1B等待`HD-048-01`，Phase 1C-1D等待`HD-048-02..03`及前置QC；目前Human Decision Gate已關閉。本輪只修改文件，未實作產品、provider、正式資料、merge、PR、deploy或release。
- 2026-07-13: 依使用者指定`dev-pm`補齊DEV-048後續開發文件。Phase 1B新增`DEV-048-1B-01..08`，涵蓋owner-surface CTA、草稿tab、create flow、server projection/Now What、candidate UX、feature flag/route compatibility、RWD/a11y與focused tests；Phase 1C新增`DEV-048-1C-01..08`，涵蓋approval action/snapshot、review locks、PublicationEvidencePort fake/fail-close、explicit atomic publish、SoD/fault/regression；Phase 1D新增`DEV-048-1D-01..10`，涵蓋transfer draft scope、readiness/frozen snapshot、aggregate review、batch publish、published-only handoff、三tabs與compatibility。每一phase均補entry、資料/API/權限/transaction、failure recovery、acceptance、evidence、stop與next condition，QA亦新增phase-specific handoff matrix與fail-fast rules。執行順序固定為`1A QC -> 1B RD/QC -> 1C RD/QC -> 1D RD/QC`；本輪只改文件，未實作Phase 1B-1D、未執行provider/正式資料/merge/PR/deploy/release，下一步仍是`執行 DEV-048 Phase 1A QC`。
- 2026-07-13: 使用者明確要求執行 `DEV-046 Phase 2A staging preflight` 且不得建立付費資源。先校正 Phase 1A-1E已由 `ec68981` 完成且重新QC 86/86通過，再新增 `infra/google-cloud/staging` fail-closed Terraform package、target/owner/privacy/account preflight manifest與 machine-readable preflight/QC。IaC建模37個Google resource blocks，全部由預設false的multi-factor apply gate保護；Cloud SQL automatic IAM補齊官方要求的 `roles/cloudsql.instanceUser`。隔離 Docker Terraform 1.14.5執行 `init -backend=false`、provider lock 7.39.0、`fmt -check`與`validate`皆通過；Phase 2A QC 20/20。結果維持 `blocked_expected`：未讀Google credential，未plan/apply/import，未建立project/billing/resource/DNS，live Firebase adapter、`firebase_bff` auth mode與外部owner/privacy/target evidence仍阻擋Phase 2B；ProJED未修改。
- 2026-07-13: 依使用者指定 `dev-pm` 繼續下一步開發，執行 DEV-048 Phase 1A Domain/Data Foundation。新增 stable draft workspace 與 typed item schema、候選號 reservation/event authority、root-first smallest-gap allocator、取消即回收、legacy dry-run classifier、create/read/update/acquire/cancel BFF，以及 PdmCommand/audit/receipt/outbox transaction boundary；同步新增 PostgreSQL migration 012 與 Supabase 010-012 runtime mirrors。RD self-verification 已通過 focused contract 19/19、runtime 7/7、Postgres shadow 26/26、Supabase migration 46/46、TypeScript、build 與既有 numbering/ERP/transfer/history regressions；ESLint 為 0 errors、3 個既有 warning。受保護資料庫拒絕的既有 API/data/concurrency/cross-role suites 需由下一輪獨立 QC 使用同一 disposable `PDM_DATA_DIR` server 執行，故狀態為 `RD Implemented / Independent QC Pending`，不得先進 Phase 1B。本輪未做 UI、Phase 1C-1D、live provider、正式資料 migration、deploy、release、stage 或 commit。
- 2026-07-13: 依使用者指定 `dev-pm`，基於 DEV-046 最新 Google 架構完成 DEV-048 開發文件：將 candidate 從正式 master 拆出為 stable draft workspace + recyclable reservation，只有 explicit atomic publication 才建立 official root/part/drawing/link並輸出 signed-ledger event；approval/技轉核准只鎖定 immutable snapshot，不直接發布。新增 ADR 與 QA/FMEA/G0-G9 gates，補齊資料/API/權限/transaction/concurrency/migration/rollback/route compatibility/UI 1440/1024/390/visible-error/data-sanity/Phase 1A-1D RD Handoff，並對舊 change-control/production-slice 文件加 amendment。DEV-048 現為 RD Implementation Ready / Not Requested；本輪未改產品、測試、schema、資料、provider、merge、PR、deploy或release artifact，下一步為明確指令 `執行 DEV-048 Phase 1A`。
- 2026-07-13: 使用者以 `1A` 關閉 DEV-046 `HD-8-4`：完整 PDM/GCS/offline backup-and-restore 功能與演練繼續由 `DEV-037` 延後；正式領號 canary 前則必須啟用 Cloud SQL automated backups/PITR，將一個 production-like recovery point 還原到 separate isolated target，且通過 schema/migration、account mapping、audit/outbox、numbering ledger/sequence/non-reuse reservations 核對，來源不得被覆寫。這是 release evidence，不是產品還原 UI，也不代表完整 PDM recovery ready。`HD-8-1..4` 至此全數關閉；Phase 1A-1E 維持 RD Implementation Ready / Not Requested，provider/staging/release evidence仍未執行。本輪只修改開發文件，未實作產品、provider、billing、credential、資料 migration、production、ProJED、merge、PR、deploy 或 release artifact。
- 2026-07-13: 使用者以 `1A / 2A / 3B` 關閉 DEV-046 `HD-8-1..3`：production hosting 採 `asia-east1` Cloud Run + Next.js 16 Active LTS container，經 external ALB/managed TLS/custom domain，CDN 僅允許 reviewed immutable assets；重大 security/data-loss 事件由內部 primary+backup all-hours on-call 在 60 分鐘內 acknowledgement 並啟動 containment，不宣稱 24x7 restoration；staging 同測 Google/non-Google，Wave 0 Google Workspace only，Wave 1 至少納入一位受控 non-Google。使用者另要求把完整備份還原功能延後，故 `DEV-037` 維持 deferred，並開啟 `HD-8-4` 單獨決定正式 canary 前最低 Cloud SQL backup/PITR/隔離 restore 與 numbering-ledger reconciliation evidence 的執行時點。Phase 1A-1E 改為 RD Implementation Ready / Not Requested；本輪只修改開發文件，未實作產品、provider、billing、credential、資料 migration、production、ProJED、merge、PR、deploy 或 release artifact。
- 2026-07-13: RD 主管以 #批判 / #多層次分析完成 DEV-046 第三輪獨立文件稽核。官方支援複核確認 App Hosting 對 Next.js 15.2.x 的相容性不等於五年 security/LTS 維護保證，故開啟 `HD-8-1` runtime posture；「24x7 即時 escalation」不可驗收，開啟 `HD-8-2` acknowledgement/coverage；non-Google production admission 未指定 wave，開啟 `HD-8-3`。同步修正 clean production 必須建立新 production PDM IDs、source actor/history只留唯讀封存且不得同 email auto-link；Firebase-managed action email 初版不需 custom SMTP；Phase 1D只做GCS interface/fake/fail-close，live adapter移至Phase 3B；outbox補 dedicated worker/at-least-once/lease/checkpoint/retry/DLQ；Cloud SQL補 automatic IAM DB auth與禁止static password。DEV-046改為 `!` blocked；本輪只修改開發文件，未實作產品、provider、billing、credential、資料 migration、production、ProJED、merge、PR、deploy 或 release artifact。
- 2026-07-13（歷史紀錄，已由本節首筆 DEV-048 更新取代）: 依使用者指定 `dev-pm`，建立 `DEV-048` 純功能規格，收斂 `＋建立圖料號` 的模組頁首與物件脈絡入口、`發行 / 交接 > 技術移轉` 的技轉包整批送審，以及未領號草稿 / 候選號 / 審核鎖定 / 待發布 / 已發布 / 已作廢的分層規則。最新人類決策以正式發布作永久占號邊界，草稿候選號在零有效引用且未鎖定時可立即回收，第一版不強制 7 天冷卻；此語意刻意取代既有「送審即永久受控」與 formal create 即 official 的舊邊界。當時僅完成純功能規格；目前已依本節首筆更新補齊架構、ADR 與 QA/QC 契約，後續入口改為明確指令 `執行 DEV-048 Phase 1A`。
- 2026-07-13: 使用者以 `1A / 2B / 3B` 關閉 `HD-7`：App Hosting 搭配實作時核准並 exact pin 的 Next.js 15.2.x；production 建 clean Cloud SQL，只 seed initial Admin/最低 config/numbering sequence/non-reuse reservations，local business/draft/demo/test/history 零搬移且 source read-only archive；continuous RPO <= 1 小時，RTO <= 4 Taiwan business hours（週一至週五 08:00-17:00、排除公司假日），security/data-loss 24x7 即時 escalation。另固定平台不變量：所有正式資料只在 Cloud SQL、正式檔案只在 direct GCS、business logic 只經 portable HTTP/BFF，禁止 Firestore/Firebase Storage/Firebase Functions/Callable/Firestore trigger authority。Phase 1A-1E 已達 RD Implementation Ready / Not Requested；本輪未改 package/code、未降版、未建立 provider/billing/credential、未搬資料、未部署或修改 ProJED。
- 2026-07-13: RD 主管以 #批判 / #多層次分析完成 DEV-046 二次文件審查。發現 active Cloud SQL SPEC 缺少其任務索引已宣稱完成的 Architecture Memory Capsule、各 phase RD Handoff、Failure/Recovery、Deferred Scope Audit 與 All-Phase Coverage Matrix，並確認 repository `next@16.2.6` 超出目前 Firebase App Hosting 官方 Next.js 支援矩陣至 15.2。文件已補齊上述契約與 ontology event version/idempotency/DLQ/replay 邊界，production source auto-rollout 改為一律禁止；另重開 `HD-7-1` runtime compatibility、`HD-7-2` production data cutover/archive class、`HD-7-3` RTO support clock。DEV-046 從 Phase 1 RD Implementation Ready 修正為 provider-neutral RD Contract Ready / target-dependent decision-gated。本輪只修改開發文件，未執行產品程式、provider、billing、credential、資料 migration、production、ProJED、merge、PR、deploy 或 release artifact。
- 2026-07-13: DEV-046 第四輪 RD 完整性審查中，使用者以「繼續」採用 HCS 建議預設 `1B / 2A / 3A`：Phase 3A 拆為 3A.0 named 3-5-user production canary 與 3A.1 `DEV-038` field acceptance，field evidence 阻擋擴大 allowlist/pilot accepted 而非首次受控部署；DB outage 完全停止正式領號，不允許紙本、Excel、offline 或事後補登；非 Google 邀請採 Firebase-managed email-link，完成 canonical invitation/email proof 後於 freshly authenticated setup state 連結密碼，password reset 僅供啟用後 recovery。RD 同時修正跨 Firebase/PostgreSQL 停權為 deny-first saga，將 DEV-047 拆為 inventory/design/rehearsal/release 契約，並將 Google project names 明定為 logical labels。本輪只修改開發文件，未實作產品/schema/migration、未建立 cloud resource、未部署或修改 ProJED。
- 2026-07-13: 使用者以 `1A/2A/3A` 關閉 RD 主管審查的 `HD-6`：接受 Firebase US identity processing 並要求 privacy minimization/notice/retention-deletion inventory；所有 cloud recovery copies 留台灣，接受 full `asia-east1` outage 無承諾 RPO/RTO且不得宣稱 regional DR；Cloud SQL regional HA 自首批 3-5-user canary 起強制。文件已同步，實際 privacy evidence、billing owner/budget/alerts、provider resources、deployment/release 仍未執行。
- 2026-07-13: 使用者完成第五輪決策：既有登入憑證不保留、approved users 於 Firebase 重新佈建並 mapping stable PDM IDs；canary 後採 Wave 1 約 5 人、Wave 2 剩餘 approved staff 的五工作天 gates；Cloud SQL/GCS/App Hosting operational data/files 位於 Google Taiwan，Firebase Auth identity data 是明示 US-location exception。新增 `ADR-PDM-ERP-PLATFORM-002`、Cloud SQL SPEC/QA，Supabase 僅保留歷史/disposable compatibility evidence。另完成本機 managed-auth bootstrap：online backup 後將 `jedchang0308@jenfu.com.tw` 設為唯一 active Admin，offboard demo accounts，建立 24 小時一次性 recovery link；未採用不符 10 字元政策的 `1655`，未把 raw token 寫入文件。未建立 Google/Firebase/Cloud SQL/GCS live resource、未部署、未修改 ProJED。
- 2026-07-13: 使用者完成 DEV-046 第三輪 RD 完整性決策 `1A / 2C / 3A`：production 拆成 Phase 3A App Hosting/Firebase/BFF/Supabase 正式領號／草稿上線與 Phase 3B GCS file migration/pointer/file-workflow opening，3B 不得阻擋 3A；現有 PDM/既有 platform tables 暫留鎖定的 `public`，新 post-DEV-046 platform/ontology/integration tables 進 bounded schemas，另建立 `DEV-047` 管 production-stability legacy schema migration；第一個 ontology MVP 收斂為 AI_PDM-owned Drawing -> Part -> BOM，Project/Equipment 等 ProJED owner contract。RD 並補齊 `pdm_session` v2 AAL/replay/MFA enrollment、GCS 50 MiB 內 hash worker/TTL/retry/quarantine、business-hours observability/alert/log retention、DB outage 禁止離線領號、Phase 3B migration/rollback 與 QA negative/visible-error gates。本輪只修改開發文件，未實作產品/schema/migration、未建立 cloud resource、未部署或修改 ProJED。
- 2026-07-13: 使用者完成 DEV-046 RD 完整性引導決策 `1A / 2B / 3A`：Firebase 止於 Next.js BFF，browser 不以 Firebase JWT 直連 Supabase；production 採 RPO <= 1 小時/RTO <= 4 小時、七天 PITR、每週獨立 logical backup、GCS 30 天 soft delete/跨專案 no-delete backup 與每季隔離 restore drill；Admin/Approver 採 TOTP、八小時 session，兩位 hardware-key break-glass 管理員，邀請/復原先用 Firebase-managed action email。同步補齊 GCS v2 intent/finalize 狀態機、storage schema/API/transaction contract、server-only PostgreSQL role/pool boundary、18 個月量化門檻、第一個 traceability ontology use case、FMEA、visible-error/data-sanity gate、Deferred Scope Audit 與完整 All-Phase matrix。本輪只修改開發文件，未實作產品/schema/migration、未建立 billing/project/credential、未部署或修改 ProJED。
- 2026-07-13: 依使用者五年 ERP 平台引導決策 `1B / 2A / 3A` 建立 `DEV-046` Phase 0 初版文件：Supabase PostgreSQL 作初期 operational relational authority，18 個月後依量化 gate 決定是否遷移 Cloud SQL；Firebase Auth with Identity Platform 作唯一共用 IAM；GCS 作 PDM binary authority，Shared Drive 僅作核准交付/協作出口。初版曾假設 Supabase 信任 Firebase JWT，該假設已由後續 RD 完整性決策 `1A` 明確取代為 BFF-only。未建立 Cloud Billing/project/credential/domain，未切換登入或儲存 provider，未搬資料、未修改 ProJED、未執行 production/release artifact。
- 2026-07-13: 執行 `DEV-041` Phase 3A-0 本機開發。新增技轉包 counter/package/item/event SQLite schema 與 provider-neutral PostgreSQL migration artifact、company-scoped repository/service、明確且 idempotent 的 Draft 建立、header/scope CRUD、readiness summary、terminal cancel API，以及 `/transfer-packages/new` 與 `/transfer-packages/[id]` 共用工作台；owner module adapter、return context、blocker/next action 與未開放能力均維持誠實邊界。另修復既有資料庫初始化時 account lifecycle compatibility column 晚於 index 建立的順序問題。驗證通過 focused QC 18/18、submission-gate regression 15/15、account-lifecycle regression 26/26、typecheck、full lint、isolated production build、runtime API contract，以及 1440/1024/390 Playwright UI/overflow/visible-error checks。完整證據見 `.ai-doc/qc/qc-pdm-transfer-package-phase3a0-report-2026-07-13.md`。未執行 ZIP parser、分類、mapping/BOM/baseline、SolidWorks integration、live PostgreSQL/Supabase migration、正式資料、production、merge、PR、deploy 或 release artifact。
- 2026-07-13: 依使用者確認「邀請帳號、角色權限管理、所有已啟用帳號生命週期」應收斂到同一頁面，完成 `DEV-045` Phase 1 本機 RD/QA/QC。實作包含 `/settings/accounts`「帳號與權限」分頁入口、帳號清單/明細、停權/復權/離職/復職、identity 停用/復用、全部 session 撤銷、Admin 一次性密碼重設、`/account-recovery`、account lifecycle schema/migration mirror、session invalidation、角色開始/到期 UI 與 permission-path enforcement。證據：`.ai-doc/qc/qc-pdm-account-lifecycle-report-2026-07-13.md`、`qc:pdm-account-lifecycle` 26/26、`qc:pdm-account-invitations` 25/25、`qc:pdm-google-identity` 19/19、`qc:pdm-production-slice-numbering-draft` 27/27、`qc:supabase-runtime-migrations` 39/39、`tsc` 通過、lint 0 errors。`npm run build` 因本機 3000 dev server guard 阻止清 `.next` 而未完成；未停止 server、未使用 bypass。未執行 production deploy、production smoke、live Supabase migration、provider pointer、Supabase Auth/MFA、merge、PR、rollback 或 release artifact。
- 2026-07-13: 使用者完成第三輪引導決策 `1A 2B 3A`：組合件 impact suggestion 採 deterministic/versioned pure resolver，記錄 input hash/rule IDs/reasons，禁止 AI/LLM/network authority；所有 formal `no_change` 必須在 exact candidate/SolidWorks evidence 後由 RD 主管核准，Admin 不得代替工程決策；formal defer 建立 canonical `transfer_follow_up`（owner/due_at/evidence），再以 outbox/idempotent projection 顯示於既有 package workbench 與 `/numbering/tasks`，不新增頁面、不改 generic task 無期限政策。正式取檔固定 exact configuration/revision/hash；canonical confirmed/approved evidence 不可變，Drive 備份依 file-storage 權威維持 released required/permanent、pre-release selective、既有 mirror 不自動覆寫/刪除。Phase 3A-1 到 3C 恢復 RD Contract Ready / Not Requested This Turn。文件治理通過 `qc:doc-paths` 23/23、`qc:dev-task-evidence-sync` 13/13、`qc:dev-task-completion-audit` 8/8、target whitespace checks，並確認 150 個唯一 `.ai-doc` Markdown 引用皆存在。未執行產品程式、schema/migration、正式資料、AI provider、production、merge、PR、deploy 或 release artifact。
- 2026-07-13: RD 主管第三輪完整性審查發現 Q6-Q8 高影響缺口：組合件進版建議的 deterministic/AI 權威與成本邊界、formal `no_change` 的核准責任，以及 formal defer 必須有期限但既有 numbering task policy 明定一般待辦不設期限的跨 SPEC 衝突。Phase 3A-2 到 3C 暫回 `Need Human Decisions Q6-Q8`；Phase 3A-0/3A-1 邊界不變。已由既有規格確定、不再詢問：正式 CAD 下載必須依 exact configuration/revision，不得用模糊 latest；第一版正式/備份檔案不自動刪除；不新增獨立一般操作頁。未執行產品程式、schema/migration、正式資料、外部 AI、production、merge、PR、deploy 或 release artifact。
- 2026-07-13: 使用者以 `1A 2A` 確認前輪 Q3/Q4：設變採新 delta package，繼承前一 current-effective 配置並產生完整候選配置；已核准 package 不重開；同包多總組件採 atomic approval，需分批則拆包。系統只能提出組合件是否進版建議，人類選 `不變更`、`晚點執行`、`變更`；研發小數版只評估研發配置，正式整數版只評估正式配置，研發上傳不得造成正式 stale/進版。Q5 選 `1C`：formal defer 僅限可互換/向下相容、非關鍵且證據充足，並須 RD 主管理由、owner、due date、follow-up 與 exact old revision；否則阻擋。UI 依註解收斂：驗證後 no-change 顯示 `不需進版`，defer/update 內部狀態一律只顯示 `已非最新版 / 待更新`，不得覆寫 master lifecycle。Phase 3A-1 到 3C 恢復 RD Contract Ready / Not Requested This Turn。文件治理通過 `qc:doc-paths` 23/23、`qc:dev-task-evidence-sync` 13/13、`qc:dev-task-completion-audit` 8/8、target whitespace checks，並確認 140 個 `.ai-doc` Markdown 引用皆存在。未執行產品程式、schema/migration、正式資料、SolidWorks integration、production、merge、PR、deploy 或 release artifact。
- 2026-07-12: 依 RD 主管完整性審查與使用者「將時間區間設定功能加回去」指示，DEV-045 採用上一輪 HCS 建議預設 `1A / 2C / 3A`：停權保留權限狀態、離職原子關閉 system-role gate、撤銷角色／代理並停用 identities，復職重選 system role/identity 且不恢復舊額外權限；disabled local identity reset 後保持 disabled；pilot 離職採單 Admin 原因＋typed confirmation。角色指派恢復開始／到期 UI，`/settings/accounts` 顯示摘要並深連結 `/settings/workflow`，所有同步／非同步、numbering、approval 與 production-slice permission paths 必須套用時間條件。另補 recovery fragment/CSRF/rate-limit/security headers、integer version、stable cursor、outbox reasonCode、offboard atomicity 與 accessibility QA。只修改開發文件，未實作產品程式、schema/migration、資料、provider、deploy 或 release artifact。
- 2026-07-13: 依使用者對「邀請帳號、角色權限管理、所有已啟用帳號生命週期」是否應整合的追問，DEV-045 UI IA 增補為「帳號與權限」單一管理入口，分成帳號管理、邀請新帳號、角色與權限、異動紀錄。原則是同入口、分任務，不做一張混雜帳號/邀請/角色制度的大表；`/settings/workflow` 仍是角色與審核規則唯一寫入權威，`/settings/accounts` 顯示角色摘要與深連結，既有 `/settings/account-invitations` 可作相容路由但 UI 上必須歸入同一管理區。本輪只修改開發文件，未實作產品程式、schema/migration、資料、provider、deploy 或 release artifact。
- 2026-07-12: 依使用者要求建立 `DEV-045` / `DEV-PDM-ACCOUNT-LIFECYCLE-001` 開發文件。Phase 1 針對內部 pilot 補 `/settings/accounts`、停權/復權/離職/復職、identity enable/disable、全部 session 撤銷與 Admin 一次性密碼重設連結，採 hash-only token、`session_invalid_before`、防 self/last-admin/last-login-identity lockout、server-derived command、atomic audit/outbox 與 SQLite/PostgreSQL/Supabase parity，狀態達 `RD Implementation Ready / Not Requested This Turn`。Phase 2 self-service/session visibility/email adapter 與 Phase 3 Supabase Auth/MFA/central offboarding 已達 RD Contract Ready；email/provider/production/ProJED 維持 human/release gate。本輪只修改開發文件，未實作產品、schema/migration、資料、provider、deploy 或 release artifact。
- 2026-07-10: 依使用者要求完成 `DEV-043` / `DEV-PDM-GOOGLE-IDENTITY-001` 本地切片：新增 `auth_identities`、`users.account_status`、本機身分 backfill、Google OIDC code flow/state/nonce/PKCE、邀請式 Google 綁定、stable `sub` lookup、停用帳號/session fail-closed、token/secret redaction、未設定 provider 時的停用 UI 與 SQLite/PostgreSQL/Supabase migration mirror。證據為 `qc:pdm-google-identity` 19/19、`qc:pdm-account-invitations` 25/25、`qc:managed-auth` 21/21、`qc:supabase-runtime-migrations` 33/33、`qc:postgres-shadow` 26/26、typecheck、lint 0 errors、isolated production build 與 desktop/mobile UI screenshots。Supabase CLI 未安裝；未執行 Google Cloud credential/consent screen、live migration、provider enable、production deploy/smoke、merge、PR、rollback 或 release report。
- 2026-07-10: 依使用者最新決策處理第一版上線 blocker：`DEV-034` / `DEV-IND-007` 已在 disposable local Postgres target 完成 schema migration、RLS plan、target guard、schema/RLS-only live compare 與 `qc:postgres-shadow` 26/26，evidence 為 `data/quality/postgres-shadow/shadow-compare-1783676196559.json`；同時修正 Postgres migration generator 的 FK 建表順序並新增 `PG-010A` 回歸檢查。`DEV-035` / `DEV-CAD-001` 記錄人類實測 SW 上傳 OK、3D 預覽 OK、2D 預覽未支援，改列完整 CAD 階段延後；`DEV-036` / `DEV-SW-001` 因目前無明確 Add-in 產品路線而移出第一版 blocker、保留歷史 ID；`DEV-037` / `DEV-BACKUP-001` 完整 restore drill 延後到完整 PDM / 檔案保存階段，第一版 release gate 僅需最小 snapshot / rollback owner。`DEV-038` 正式 field-test 仍是第一版外部 blocker。未執行 production deploy、production smoke、live Supabase cutover、provider pointer、正式 schema migration、direct data repair/deletion、merge、PR、rollback 或 release report。
- 2026-07-10: RD 主管第二輪完整性審查收到使用者決策 `1A 2B`：正式送審前必須對「完整候選有效配置」執行 SolidWorks 實機開啟與缺件/參照驗證，但不要求 Add-in；單一技轉包可包含多個明確治理的總組件。使用者同時指出設計變更範圍可能只含一個零件，因此 Phase 3A-2 到 3C 暫列 `Need Human Decisions`，等待確認 delta change package 如何繼承舊配置，以及多總組件採整包或逐根核准。Phase 3A-0/3A-1 邊界不變；未執行產品程式、schema/migration、正式資料、SolidWorks integration、production、merge、PR、deploy 或 release artifact。
- 2026-07-10: 依 RD 主管完整性審查與使用者 `#引導模式` 決策 `1A 2A 3A` 重構技轉包文件邊界：整數大版次屬於 immutable transfer-package baseline，零件/正式次組件/總組件保留獨立版次；`/transfer-packages/new` 開啟不寫資料，只有完成案件欄位並按 `建立技轉包` 才建立 persistent Draft 與 stable package ID；原本藏在完成 `DEV-005` 下的 Phase 3A 產品交付抽成 `○ DEV-041`。Phase 3A-0 已達 RD Implementation Ready / Not Requested This Turn，Phase 3A-1 到 3C 已達 RD Contract Ready。同步補齊 schema/API/RLS/grants/transaction/ZIP safety/compensation/state/QA/QC/All-Phase contracts。文件驗證通過 `qc:doc-paths` 23/23、`qc:dev-task-evidence-sync` 13/13、`qc:dev-task-completion-audit` 8/8、target files whitespace check，並確認 128 個 `.ai-doc` Markdown 引用皆存在。未執行產品程式修改、schema/migration、正式資料、SolidWorks integration、production、merge、PR、deploy、rollback 或 release artifact。
- 2026-07-10: 依使用者 `#引導模式` 決策 `1B 2B 3B` 更新 `DEV-005` Phase 3A 文件方向：技轉功能不採每個子功能新開分頁，改為升級現有 `/transfer-packages/new` 成單一技轉包工作台；技轉工作台用 adapter cards 復用既有 BOM、附件、圖料、審核模組，重度編輯回到 owner module；第一建議產品切片為 Phase 3A-0 工作台骨架、既有模組整合入口、狀態與 blocker 匯總，完整 Pack-and-Go ZIP parser 延後到 Phase 3A-1。未執行產品程式修改、schema migration、SolidWorks Add-in / Document Manager 整合、production deploy、production smoke、merge、PR、rollback 或 release artifact。
- 2026-07-10: 依使用者 `#引導模式` 決策 `1B 2A 3A` 補齊 `DEV-005` Phase 3A Pack-and-Go 技轉封包解析與組合分類開發文件：新增 `.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md` 與 `.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`。決策邊界為：技轉整包先進 `Transfer Intake`，人工確認分類/BOM/缺件後才凍結整數大版次；第一版不依賴 SolidWorks Add-in，僅接受 Pack and Go 或等效保留相對路徑 ZIP；系統自動分類但所有分類人類保有最後調整權。未執行產品程式修改、schema migration、SolidWorks Add-in / Document Manager 整合、production deploy、production smoke、merge、PR、rollback 或 release artifact。
- 2026-07-10: 重跑 active goal completion audit：`dev_task.md` 搜尋未發現任何 `☐ DEV` 可直接派工項；未勾選項目當時集中在 `DEV-015` 待指定切片、`DEV-030` 到 `DEV-032` release / high-risk gate、`DEV-033` 產品上線決策與 `DEV-034` 到 `DEV-038` 外部證據 blocker，後續本輪已補上 `DEV-IND-007` disposable local Postgres shadow evidence 並將 `DEV-CAD-001` / `DEV-SW-001` / `DEV-BACKUP-001` 收斂為 deferred scope。`npm.cmd run qc:dev-task-evidence-sync` 通過 13/13、`npm.cmd run qc:dev-task-completion-audit` 通過 8/8、`npm.cmd run qc:doc-paths` 通過 23/23、`npx.cmd tsc --noEmit --pretty false` 通過、`npm.cmd run lint -- --quiet` 通過、`npm.cmd run qc:pdm-production-slice-numbering-draft` 通過 27/27、`npm.cmd run qc:pdm-submission-gate-phase1` 通過 15/15。為避免停止健康 dev server PID 13340，正式 workspace 未直接執行 `npm.cmd run build`；改用 `.tmp/predeploy-build-worktree-*` 隔離副本執行 `npm.cmd run build` 並通過，僅有 Next workspace-root/NFT tracing 與 deprecated `middleware` convention warnings，臨時副本已刪除。未執行 production deploy、production smoke、live Supabase cutover、provider pointer、schema migration、direct data repair/deletion、merge、PR、rollback 或 release report。
- 2026-07-10: 追加 dev_task 重構後的安全驗證紀錄：`npm.cmd run qc:pdm-numbering-contextual-entrypoints` 通過 46/46、`npm.cmd run qc:pdm-numbering-gap-reuse` 通過 8/8、`npm.cmd run qc:pdm-numbering-sequence-integrity` 通過 3/3 並產出 read-only runtime report。需寫入測試資料的 `qc:pdm-numbering-api-regression` 與 `qc:pdm-drawing-part-relation-view` 未在受保護 local runtime 上執行，runtime guard 正確阻擋；嘗試使用 disposable `PDM_DATA_DIR` 啟動第二個 Next dev server 時，Next 偵測同一專案已有健康 server PID 13340 而拒絕啟動，未停止程序、未繞過 guard。`qc:pdm-access-control-governance` 預設 3100 無 server 而未完成；未改用受保護 runtime 重跑。未執行 production deploy、production smoke、live Supabase cutover、provider pointer、schema migration、direct data repair/deletion、merge、PR、rollback 或 release report。
- 2026-07-10: 續跑正式部署前本機產品驗證：`npx.cmd tsc --noEmit --pretty false` 通過、`npm.cmd run lint -- --quiet` 通過、`npm.cmd run qc:pdm-production-slice-numbering-draft` 通過 27/27、`npm.cmd run qc:pdm-submission-gate-phase1` 通過 15/15、`npm.cmd run qc:pdm-numbering-core` 通過 241/241、`npm.cmd run qc:pdm-numbering-duplicate-submit-guard` 通過 10/10、`npm.cmd run dev:local:check` 顯示既有 AI_PDM dev server healthy。`npm.cmd run build` 本次被 `clean-next` guard 擋在編譯前，因 port 3000 有健康專案 server PID 13340；未停止程序、未繞過 guard、未執行 production deploy、production smoke、live Supabase cutover、provider pointer、schema migration、direct data repair/deletion、merge、PR、rollback 或 release report。
- 2026-07-10: 刷新 `DEV-034` Postgres shadow handoff package，因目前 `db/schema.sql`、`db/postgres/001_initial_schema.sql` 與 `db/postgres/002_supabase_rls_plan.sql` 已與舊 package hash 不一致。新 package：`data/postgres-shadow-handoffs/20260710-034552`；`npm.cmd run qc:postgres-shadow-handoff-package` 通過 67/67，`npm.cmd run qc:external-blocker-closure` 通過 83/83。未執行 disposable Supabase target 建立、migration、live compare、provider pointer、production deploy、production smoke、merge、PR、rollback 或 release artifact。
- 2026-07-10: 依 `dev-pm` 範本補強開頭 `## 總任務清單` 的 PM 派工入口：新增「目前派工任務清單」，把 `DEV-040` 已完成待上線、`DEV-005` 可延伸、`DEV-015` 可恢復候選、`DEV-033` 產品上線決策、`DEV-030`/`DEV-031`/`DEV-032` 正式環境關卡與 `DEV-034` 到 `DEV-038` 外部證據 blocker 分開列清楚。未執行產品程式修改、schema migration、production deploy、production smoke、merge、PR、rollback 或 release artifact。
- 2026-07-10: 產出並於後續更新 PM pre-deploy development completion audit：`.ai-doc/reports/pm/pm-predeploy-development-completion-audit-2026-07-10.md`。最新 `qc:dev-task-completion-audit` 顯示 open local/unclassified task 為 0，第一版外部 blocker 只剩 `DEV-FIELD-001`；`DEV-IND-007` 已以 disposable local Postgres shadow evidence 完成，`DEV-CAD-001`、`DEV-SW-001`、`DEV-BACKUP-001` 改列完整 PDM deferred scope。`qc:production-readiness -- --allow-open` 仍為 `ready=false`，原因是 field-test evidence 與 release gate 尚未完成。未執行 production deploy、production smoke、live Supabase cutover、provider pointer、schema migration、direct data repair/deletion、merge、PR、rollback 或 release report。
- 2026-07-10: DEV-005 Phase 1 local product slice 已完成並驗證。實作範圍包含 `研發送審` / `技術移轉送審` 模式選擇、versioned local readiness resolver、active rule/readiness APIs、direct single-drawing technical-transfer fail-closed guard 與 `/transfer-packages/new` context placeholder。驗證證據見 `.ai-doc/qc/qc-pdm-submission-gate-phase1-report-2026-07-10.md`；research exception、完整 transfer package builder、sign-off matrix、rule admin、schema migration、production deploy、production smoke、merge、PR、rollback 與 release report 仍未執行，未列為本次正式領號 / 草稿 production slice 的 pre-deploy 必做範圍。
- 2026-07-10: DEV-040 Phase 1 local product slice 已完成並驗證。實作範圍包含 production-slice capability model、method-level API allowlist/default-deny、direct URL blocked page、roadmap `未開放` sidebar state、`/numbering/part-drafts` slice-mode inert actions、`submit-review` / `reconfirm` / `restore` direct API fail-closed、`.env.example` slice mode 設定與 focused QC。驗證證據見 `.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`；production deploy、production smoke、Supabase live target、provider pointer、merge、PR、rollback 與 release report 仍未執行，保留在 `DEV-032` release gate。
- 2026-07-10: 依 `dev-pm` dev_task 範本重構入口任務清單：移除開頭 A/B/C 表格作為主清單的結構，改為多行權威任務索引；補齊 `DEV-005`、`DEV-015`、`DEV-030` 到 `DEV-038` 的任務清單、驗收或停止條件，並保留 `External Blockers / Parked Scope` 腳本相容標題與 Supabase protected evidence contract。未執行產品程式修改、schema migration、production deploy、production smoke、merge、PR、rollback 或 release artifact。
- 2026-07-10: 依 RD 主管審查後的 `#引導模式` 補齊 DEV-040 文件：既有 `/numbering/part-drafts` 的 `submit-review`、`reconfirm`、`restore` 在 production slice 必須 UI inert / API fail-closed；provisional draft delete/recycle 必須復用或忠實包裝既有 controlled-boundary predicate；documentation_map smoke stop wording 對齊 smoke company / tenant。未執行產品程式修改、schema migration、production deploy、production smoke、merge、PR、rollback 或 release artifact。
- 2026-07-10: 用新版 Dev PM 規則重構 `DEV-040` 開發文件包，並納入 RD 主管引導決策 `1B 2C 3A`。`DEV-PDM-PRODUCTION-SLICE-001` 保留為可執行候選，但產品實作本輪未要求；SPEC 補上 method-level Route / API Boundary Matrix、Draft Operation Matrix、Direct Route / Roadmap UI Matrix、Smoke Isolation Decision 與窄版 Admin setup 邊界。第一版開 `/numbering/part-drafts`；暫用 part-number draft 可刪除/回收；正式 root/drawing/part 號碼不可回收；release-gate smoke 預設使用 smoke company / tenant。QA 補上 route/API、草稿、直接 URL、admin setup 測試與 `qc:pdm-numbering-contextual-entrypoints`、`qc:pdm-numbering-duplicate-submit-guard`、`qc:pdm-numbering-sequence-integrity` 等 gate。未執行產品程式修改、schema migration、production deploy、production smoke、merge、PR、rollback 或 release artifact。
- 2026-07-09: 執行 archive sweep。已完成且只剩共用 release / production / Supabase / migration gate 的 DEV，詳細段落自 active board 移出；active `總任務清單` 保留中文任務摘要、證據、歸檔位置、是否計入交付與批次發版指向。完整 sweep 前內容保存在 `.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`，本次完成任務索引保存在 `.ai-doc/archived/completed-dev-index-2026-07.md`。未執行產品實作、schema migration、production deploy、直接資料修復/刪除、merge、PR、rollback 或 release artifact。
- 2026-07-09: 依新版 Dev PM「任務意圖 + 高風險邊界」重構 `dev_task.md` 主控板語言。一般 RD/QA/QC 不再用「授權」作為可執行判斷；未要求的後續工作標為 `Not Requested This Turn`，正式環境、release、live migration、provider pointer、資料修復與外部成本改由 `Release Gate Required` 或高風險確認管控。`DEV-040` 當時暫列 Phase 1 local/staging product slice 可執行；2026-07-10 後續已完成 Phase 1 local product slice，release/deploy 仍延後到 `DEV-032`。
- 2026-07-09: Resolved the system drawer QC false blocker for the approval platform legacy redirect and aligned adjacent active QC contracts. Evidence: `npm.cmd run qc:pdm-system-detail-drawer-ui` 72/72, `npm.cmd run qc:pdm-approval-platform` 106/106, `npm.cmd run qc:pdm-numbering-approval-review-ui` 10/10, `npm.cmd run qc:pdm-lifecycle-actions` 272/272, `npm.cmd run qc:pdm-lifecycle-obsolete` 115/115 and `npm.cmd run qc:pdm-numbering-core` 241/241 passed. No product UI, schema, data repair, merge, PR, deployment, rollback or release artifact was changed.
- 2026-07-09: Completed `DEV-PDM-APPROVAL-PLATFORM-001` Phase 1C-C drawing object pending-review projection and APP redline cleanup. A0007-M01 pending drawing revision impact reviews remain as compact read-only cues on `/numbering/drawings`, `/numbering/search` drawing targets and attachment revision/history rows; the drawing detail `待審焦點` focus panel, preview-card file extension header labels and collapsed upload `建議版次` text were removed per screenshot redlines. Evidence: `npx.cmd tsc --noEmit --pretty false`, source-scoped lint, `npm.cmd run qc:pdm-approval-platform` 125/125, `npm.cmd run qc:pdm-entity-detail-drawer` 14/14, `npm.cmd run dev:local:check`, `qc:dev-task-evidence-sync` 13/13, and Playwright screenshots under `output/playwright/pdm-approval-projection/`. `npm.cmd run build` was blocked by the intentional local-dev guard because the healthy project-owned dev server was listening on port 3000; no bypass was used. No schema migration, lifecycle mutation, data repair, merge, PR, deployment, rollback or release artifact was changed.
- 2026-07-09: 依新的 Dev PM canonical format 重構開頭總任務清單，並依使用者要求強制中文化。總任務清單使用狀態符號放在 `DEV-001` 到 `DEV-039` 短碼前方，且每個短碼都映射回既有語意來源 ID。
