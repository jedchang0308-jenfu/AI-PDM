# AI PDM dev_task PM Control Board

更新日期：2026-08-28
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

- 新開發 Brief：`○ DEV-104` BOM 工作台 V2 受控產品結構與精簡編輯重構。
  - 狀態：`Brief Ready / Human Direction Captured / Need Human Decisions / RD Not Requested`。
  - 目標：將 BOM 工作台收斂為「受控 EBOM 結構從草稿到正式快照」，以階層表／Outliner、差異、
    Release Gate 與精確 Parent 投影為主體，避免將 XMind 畫布、行動端複雜編輯與極端容量當成近期主線。
  - 權威邊界：保留DEV-095／096的exact Part入口、stable Definition、Revision、shared applicability、
    exact Parent-to-Child mapping、immutable review／release evidence與Released projection；本Brief尚未取代現行SPEC。
  - 待決策：主編輯模式與Floating Topic定位、手機／平板編輯邊界、V2首切片是否只收斂核心工作台。
  - 執行邊界：只完成Brief與文件治理；不修改產品、schema、API、權限、資料、runtime、部署或release。

- 本機已完成、待 release gate：`DEV-101` 審核工作臺共用圖號／料號完整工作區。
  - 狀態：`Local RD Implemented / Independent QA-QC Complete / Fixed QA 48 of 48 PASS / Production Release Gated`。
  - 已確認：所有 PDM 審核情境皆直接進入 canonical 圖號／料號工作區的 `review` 模式；不依情境
    刪減可看的 domain 資訊，由審核者決定檢視深度。
  - 系統責任：固定揭露送審範圍、變更、風險、版本與快照時間；預設可定位首個變更／風險，但不得
    隱藏其餘完整內容。多目標案件在上方顯示送審當下完整同根唯讀矩陣；只點圖號／料號名稱切換
    下方單一完整目標，交叉格只呈現關係。矩陣狀態採無常駐文字的視覺標記，說明集中於支援
    hover／focus暫時顯示、click／tap固定的可存取懸浮層。窄版保留矩陣並限制於自身平移區；active
    target寫入URL並可由返回／分享還原。
  - 安全邊界：review 讀 immutable submitted snapshot，不能以 live master 代替；只共用 domain
    workspace／view model，不把編輯 command、permission 或 approval decision authority 混成單一元件；
    live drift在desktop由同頁snapshot／current左右比較、窄版由水平滑動切換，不能改變審核主體。
    比較預設聚焦差異但完整內容可展開；決策列沿用editor底部sticky位置，對整份request原子決策，
    不追蹤閱讀進度，也不以開啟頁籤／目標作為核准條件。
  - 直接 authority：SPEC `.ai-doc/specs/SPEC-PDM-APPROVAL-CANONICAL-REVIEW-WORKSPACE-001-snapshot-package-and-shared-renderers.md`；
    ADR `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md` DEV-101 amendment；
    固定QA `.ai-doc/qa/qa-dev-101-approval-canonical-review-workspace-validation-plan-2026-08-26.md`（CAPA後48案）；
    CAPA `.ai-doc/qc/qc-dev-101-approval-inbox-discoverability-capa-2026-08-27.md`、
    `.ai-doc/qc/qc-dev-079-dev-101-recognition-owner-review-parity-capa-2026-08-27.md`。
  - CAPA事實：A0002-M01已有assigned pending `pdm_work_review_requests`與`review_owner` canonical state，但
    `/api/approvals/inbox`未合併canonical request source，R&D Manager因此看到0筆。focused browser直接進
    `/approvals/{requestId}`，繞過正常清單入口，不能證明可發現性。
  - 跨DEV CAPA事實：A0002-M01 exact relation已正確指向A0002-P01；native candidates有owner，但同session的
    browser PDF candidates以`part_number + NULL owner`進入aggregate，且三筆舊候選已被accept。既有v1 request
    又未保存recognition projection；現行v2 builder也只保存recognition meta，因此editor與reviewer可能對同一
    案件得出不同owner warning。A0044 non-terminal GET self-heal不覆蓋accepted legacy，不得再作根治證據。
  - Local RD corrective implementation：101-A～101-E已補齊contract／v2 package builder／shared renderer／shell、
    matrix、URL、drift compare、review_package file-read、canonical inbox adapter、normal submit→list→page→return、
    v1／v2分離，以及exact full recognition projection／inner hash／owner fail-closed／latest-session leak mutants。
    RD aggregate 11/11 PASS；其後四個independent runner固定48案亦48/48 PASS。current-source re-qualification=
    `output/qa/dev-101-independent-aggregate/DEV101-INDEPENDENT-AGGREGATE-2026-08-27T15-19-16-555Z/manifest.json`，
    closure見`.ai-doc/qc/qc-dev-101-independent-qa-qc-closure-2026-08-27.md`。DEV-079 accepted-state command／DB invariant、
    explicit reconciliation與GET zero-write已在隔離SQLite／PostgreSQL通過，但primary 21筆repair尚未授權apply。
    新writer仍由default-off `PDM_REVIEW_PACKAGE_V2_WRITE`控制；production activation仍受gate，不得清理既有dirty
    work、修改primary資料、stage／commit／merge／PR、deploy或release。

- 新發現 P1 CAPA：`DEV-100` 遷移圖號工作檔案合法替換後讀取失敗。
  - 狀態：`RD Implementation Ready / CAPA Confirmed / RD Not Started / Local Fix Eligible / A0044 Data Repair Human-Gated / Production Release Gated`。
  - 已確認：A0044-M01 依序上傳 `A0044.SLDASM`、`A0044-M01.pdf`、`A0043.SLDASM`；第三檔與第一檔同屬 primary `cad_3d`，既有 last-wins 規則合法替換前檔並留下 tombstone，但 migrated-work read invariant 把該合法 tombstone 誤判為 `source_asset_invalid`，因此寫入成功後 GET 回 409。三個 physical files 與 hash 均存在，並非檔案遺失，也不是 Part 的 structure type 所致。
  - 可直接派工：修正 mutable work snapshot invariant、加入 post-write immediate-read gate、錯誤畫面停止呈現 stale 假空狀態，並以 SQLite／PostgreSQL、真實三檔順序與 mutation-sensitive QA 驗證。
  - 人類閘門：A0044-M01 的資料 repair apply 前，必須明確選擇最終 primary 3D 是保留目前 `A0043.SLDASM`，或恢復 `A0044.SLDASM`；未選定前只准 backup／inventory／dry-run，不修改 primary SQLite。
  - 邊界：保留單一 Drawing／Part 工作臺、每個 exact Drawing work 一個 primary 3D 與 DEV-096 Future Phase 的 `.SLDASM` 結構建議；本 CAPA 不新增組立入口、不解析 assembly children、不自動建 BOM、不把 PDF 當 `.SLDDRW`。

- 本輪完成：`✓ DEV-102` 圖號報表獨立頁面拆除。
  - 狀態：`Local RD Implemented / Focused Retirement QC 13/13 / Typecheck PASS / Isolated Build PASS / Browser PASS / Production Release Gated`。
  - 使用者決策：移除 `/numbering/reports` 頁面、側邊欄入口、首頁建議卡、製造交接頁死連結與頁面狀態說明；不保留舊網址轉址。
  - 保留邊界：月報／匯出 API、資料表與 `numbering.reports` API 權限仍保留，供既有後端回歸與後續重新設計使用；本輪不做資料刪除、schema migration、production migration、deploy 或 release。
  - Spec Impact=`Intentional replacement`；ADR=`No New ADR`。Focused gate：`npm.cmd run qc:pdm-numbering-report-retirement`、TypeScript、affected lint、isolated browser direct-route 404。
  - 證據：`npm.cmd run qc:pdm-numbering-report-retirement` 13/13、`npm.cmd run typecheck:app`、affected ESLint 0 errors、`npm.cmd run build:isolated`；isolated headed browser desktop／390px 驗證首頁無報表入口、頁面 overflow=0、`/numbering/reports` HTTP 404。完整歷史報表 UI 證據保留於既有 `.ai-doc/qc/`，不再視為現行 UI 契約。
  - 計入交付：是（移除無明確使用價值的獨立入口與死連結；正式環境 release 仍另走既有 gate）。

- 本輪完成：`✓ DEV-103` 工作臺抽屜預覽區關聯編輯入口與冗餘提示收斂。
  - 狀態：`Local RD Implemented / Focused Contract QC 25/25 / Typecheck PASS / Browser PASS / Production Release Gated`。
  - 使用者決策：移除關聯矩陣下方常駐的 direct-edit 說明；將既有「編輯關聯」入口移到圖號／料號預覽區標題列，保留矩陣內的儲存／取消與原子 API 行為。
  - 紅線處理：現行 source 沒有截圖所示「有新版本可用」獨立 modal；stale contract 只保留 fail-closed 錯誤訊息，未新增或保留不存在的版本更新元件。
  - 範圍：只改 canonical preview panel、Drawing／Part drawer action placement、RelationMatrixEditor 的受控 editing state 與既有 DEV-090 focused contract；不改 schema、資料、API、權限或 lifecycle。
  - Spec Impact=`No conflict / presentation-only amendment`；ADR=`No New ADR`；直接 authority 沿用 DEV-090 inline relation matrix contract。
  - 證據：`npm.cmd run qc:dev-090:contract` 25/25、`npm.cmd run typecheck:app`、isolated headed browser 四 viewport；確認預覽區可見「編輯關聯」、矩陣區沒有常駐 helper、儲存／取消仍可用、console／request failure／visible alert=0、horizontal overflow=0。
  - 計入交付：是（降低關聯編輯尋找成本並移除無法支持判斷的常駐文字；正式環境 release 仍另走既有 gate）。

- 本輪完成交付點：`DEV-099` 結構型態延後分類與 BOM readiness 解耦。
  - 狀態：`RD Implementation Complete / Human Confirmed / Full Aggregate QA 48/48 / Typecheck + Lint + Isolated Build PASS / Production Release Gated`。
  - Current Phase：new-root建號不再選結構型態並明確建立`unclassified`；existing-root只在全體
    current Parts具有單一共識時初始化新Part，否則同樣unclassified且不阻擋。exact Part drawer是唯一
    分類入口，可複選同root顏色／規格變體並all-or-nothing套用。
  - BOM邊界：只有assembly顯示BOM區；manufactured＋primary M才可建立／開啟製造BOM。
    purchased assembly可分類但沒有Current Phase製造BOM動作。
  - 本機驗收：099-A～E與固定48-case aggregate已完成；contract 48/48、SQLite repository 7/7、headed browser
    37/37、PostgreSQL 7/7、DEV-093／096回歸與primary invariant均PASS。完整證據為
    `output/qa/dev-099/DEV099-2026-08-26T09-03-03-967Z/manifest.json`。
  - 下一步：若要進入正式環境，另行取得備份、provider migration rehearsal、activation、deploy、release與
    production smoke授權；本 DEV 不自動推進 release。
  - 禁止：不新增sidebar／組立件頁、schema／migration、root-level自動分類、CAD／檔名自動寫入、
    production migration／deploy／release。

- 本輪完成：`DEV-096` 組立件情境式共用 BOM 重建。
  - 狀態：`RD Implementation Complete / Human Confirmed / Local QA-QC Complete / Production Migration & Release Gated`。
  - Current Phase：Part Number持有structure type；只有manufactured assembly＋primary M的Part drawer顯示唯一BOM action。stable BOM Definition承接多Parent applicability、logical line與exact Parent-to-Child mapping，沿用generic review／release但改為per-parent deterministic snapshot。
  - 已完成：exact九表authority、stable logical line、schema-v2 review/release evidence、SQLite initializer、PostgreSQL 048、default-off flag、初版／下一版同writer、one-open Revision、archive／restore／whole obsolete lifecycle、Definition權限與structured error、完整API/DTO、transaction/failure recovery、consumer收斂，以及096-A～E與QA-096-001..088完整gate；`.SLDASM` parser及Released Parent移除／detach／fork仍為Future Phase。
  - 本機證據：fresh aggregate 88/88 PASS，SQLite與實際PostgreSQL repository mutation皆PASS；42個named fault checkpoint、四viewport真實瀏覽器、typecheck、affected ESLint與123/123 isolated production build均PASS。primary SQLite SHA-256前後固定為`f717739e8b165d4ea6a621133a14f7a7ea898c990f5c366efa85f82b662b8ec8`。
  - 下一步：正式環境仍須另行授權PostgreSQL migration rehearsal／apply、feature activation、deploy、release與production smoke；目前不得由本機完成狀態推定授權。

- 唯一 P0 launch-moving 任務：`DEV-032` ERP 平台 production release work package。
  - 當前子關卡：`DEV-032 Gate D` authenticated Level 4 production smoke；Hosting/OAuth、principal bootstrap、pre-canary reconciliation 與 HD-8-4 separate-target restore reconciliation 均已完成。
  - 後續順序：完成 Google 互動登入 -> authenticated privacy/permissions/領號/草稿/重登/file fail-closed smoke -> `Gate E` named-user canary。
  - 整併來源：`DEV-030` 轉為 032B/032C database 子關卡；`DEV-031` 轉為 032C data-continuity QC 子關卡；兩者保留來源 ID，不再獨立派工。
  - release scope：`DEV-040` 領號／草稿、`DEV-042/043/045` 身分與帳號治理、`DEV-048` 圖料號／草稿入口；GCS file workflow、CAD、BOM 與完整 PDM 不在第一版。
  - PDM admission gate：目前第一版 scope 不含 DEV-052／DEV-064；未來任何 release 若要啟用 `PDM_NUMBER_LIFECYCLE_V2` 或套用 canonical Drawing adoption，必須先完成舊 reservation ID 全量 source/adoption reconciliation、backup/PITR、flag-off readback與read-only canary。unmapped／duplicate／renumbered任一非0，或cutover freeze期間source hash changed非0，一律不得activation。

- P0 預上線成本最佳化：`DEV-069` Production Micro／Zonal、低成本按需 Staging、Restore 清理與兩套 ALB 拆除。
  - 狀態：`RD/QC Local Passed / Human Confirmed / Exact Commit 1065d4a7 / Blocked: Google OAuth + ADC Refresh / Live GCP Release Gated`。
  - 本機下一步：恢復 `a29836e7` 的 Staging IaC authority，完成 Micro connection budget、edge gate、Terraform validate 與 targeted QC。
  - Live 邊界：使用者已確認成本方向；實際 Production／Staging apply、Restore delete、DB restart 與 post-change smoke 仍由 `DEV-032`／`deployment-release-gate` 管控，不建立第二條 production release path。

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
  - 已決策：既有保留號透過 read-time compatibility projection 直接進入新流程並往前推進；2026-08-15追加正式環境零遺漏決策，每一筆 reservation ID 必須恰好納入首版準備／可送審、審核／正式化中、補首版、正式、歷史或復原一個合法 bucket；候選階段可建立受控草稿；整包核准後由同一冪等交易自動正式化。
  - UI：保留既有 `保留號` 頁籤與 `/numbering/drawings?tab=reserved`；工作區改稱 `保留號／首版準備`，正常狀態單一CTA，正式化後轉入正式圖號且歷史仍可查。
  - 安全邊界：不批次回填、不改號、不重播舊審核；開啟／讀取零寫入。舊 number-only 核准不得冒充圖面核准，須接續圖面差異審核。正式 migration、deploy、release 與 production data 仍未授權。
  - readiness 結果：採 physical `Pending` package + immutable review-approval companion 投影 effective `ReviewApproved`，避開既有 package status 擴張、SQLite table rebuild與舊版 reader 風險。
  - 驗證結果：2026-08-06獨立QC重跑`npm run qc:dev-052`，schema 12/12、data protection 4/4、HTTP 10/10、UI 16/16、flow 8/8、AI真實操作41/41及附帶回歸／typecheck全數通過；run `DEV052-20260806-015522-local-isolated`，production連線／寫入皆false且cleanup removed。
  - 2026-08-15 focused gate：data protection 5/5；18筆 source reservations 對應18筆 adoption records，unmapped／duplicate／unexpected／changed均為0，read path total changes與protected hashes不變。
  - 下一步：維持production release gate；若 DEV-052／DEV-064 納入正式 release scope，交由 `DEV-032` release owner 在 flag off/cutover freeze 狀態先完成逐company、全分頁 source/adoption manifest，`unmapped=0`、`duplicate_mapping=0`、`renumbered=0`、`source_row_hash_changed=0` 後才可read-only canary／啟用；正式資料本輪未變更。

- 單一圖號工作台：`DEV-053` 已完成Phase 1H單一生命週期與審核權威收斂及四項gap repair的本機實作／AI QA／獨立QC，現為 `Phase 1H Gap Repair Independent Local QC Passed / Commit Pending / Production Migration & Release Gated`。
  - 保留決策：取消「圖號總表／保留號」雙分頁，維持單一「圖號工作台」與生命週期唯一 primary CTA。
  - 修正原則：單頁化只能減少導覽選擇，不能刪除或遮蔽既有圖號、料號、版次、附件、送審、關係、影響與主資料治理能力。
  - 現況判定：16組能力與可達性缺口已完成修復；A0005既有受控檔可驗證並進入`整包可送審`，正式能力、附件authority、生命週期狀態與單頁入口均已恢復。
  - 受保護邊界：`DEV-054`為另一AI的必要並行任務；不得恢復開發階段/DVT、修改其migration/spec/QA/QC、還原其刪檔，或把其變更混入DEV-053 commit。
  - 證據：Phase 1F獨立QC `npm run qc:dev-053`為92/92；Phase 1H gap repair `npm run qc:dev-053:phase1h` 全套通過（schema 15/15、adoption 10/10、authority 9/9、HTTP 10/10、UI 12/12、real-operation 8/8）；完整 AI 真實操作 run `DEV053-PHASE1H-FULL-20260807-014809` 為24/24，含文字退回理由、cleanup retry、cross-company與4 viewport，browser/5xx errors為0、production connection/write false、cleanup removed；TypeScript PASS。DEV-054 protected hashes不變。
  - 2026-08-06修復：FFF影響審核完成後，審核工作台以`review_confirmation_events`為核准證據；一般小數版送審包以read-time projection顯示effective `ReviewApproved`／`研發受控`，不改physical `Pending`、不誤發正式`Released`；整數版才承接approval step與原子正式化。既有A0005-M01不回填、不重播審核，固定3000唯讀驗證已確認無`核准發布`錯誤入口、無visible error、console error 0、1280 viewport水平溢位0。DEV-054 protected boundary未觸碰。
  - 下一步：維持commit與production release gate；若要stage／commit、staging／production migration、flag activation、deploy或release，需另行明確授權並執行對應gate。

- 專案狀態權威移除：`DEV-054` 已於 2026-08-05 完成 RD 修正與獨立 QA/QC，狀態為 `Local RD/QA/QC Passed / Production Release Gated`。
  - 決策：AI PDM 不管理、保存或同步 EVT/DVT/PVT；專案管理軟體是唯一專案狀態權威。
  - 範圍：移除 `development_phase`、DVT 晉升、phase-based approval、相關 UI/API/permission，保留 PDM 資料、技轉、發布、版次與 ECR/ECO/ECN change control。
  - 安全邊界：只做本機產品、SQLite compatibility 與 forward migration artifact；不操作 live Supabase/Cloud SQL/production data/deploy/release。
  - 驗收：active runtime零專案狀態依賴，research/technical-transfer與release/change-control回歸通過，代表性UI無殘留與破版。
  - 證據：專項 QC 10/10、隔離 API 396/396、approval 125/125、migration mirror、technical-transfer、change control、release sync、狀態回歸、全專案 lint、TypeScript、122-route 隔離 production build，以及 3 種 viewport × 5 routes 的瀏覽器 R12 15/15 全數通過；詳見 `.ai-doc/qc/qc-dev-054-project-status-removal-2026-08-04.md`。

- 狀態 UI 交付：`DEV-055` 任務導向的人類狀態投影已達 `RD Implementation Ready / Human Confirmed / Local RD Complete / Production Release Gated`。
  - 目標：圖號、料號、圖料清單每列只顯示一個人類結論；drawer、filter 與 owner module 使用同一 projection。
  - 已決策：維持覆蓋式 drawer、共用圖號／料號 owner detail、完成詞必須有 evidence，移除「草稿確認」與多 badge 競爭。
  - Phase 1 邊界：1A projector contract、1B server projection/filter、1C lists/shared drawers、1D browser QA/QC；不改 DB/schema、狀態轉換、權限、正式資料或 production。
  - 下一步：本機 1A～1D 已完成；若要正式使用，另走 disposable DB 關聯操作回歸與 production release gate。

- 狀態資料重建：`✓ DEV-087 Local RD/QA-QC Complete／FFF適用性矯正已驗證`。使用者於2026-08-27確認首版工作不適用FFF，只有存在前版基準的進版工作才進行變更影響判定；單人可信QA模式維持，不驗證執行者是否作弊，但已驗證功能、資料、權限、provider與真實UI是否正確。
  - 狀態：`Local RD/QA-QC Complete / Human Confirmed / 94 of 94 Product Cases + 3 of 3 Quality Gates PASS / Production Release Gated`。
  - 已決策：不是只在 UI 隱藏舊狀態；最終要建立單一乾淨的 workbench state authority，完成切換後拆除舊的重複狀態欄位、投影與 filter authority。
  - 人類層：圖號使用`量產版／研發版＋版次`，同一圖號顯示一列量產及最多3個open研發分支各自最新版；料號使用`正式資料／修改中`；圖料根號使用`正式關聯／調整中`。料號與圖料根號沒有版本或分支；處理狀態只顯示固定角色，不依登入者改寫成你／我／他。
  - 抽屜：三工作臺共用唯讀骨架與固定資訊順序；歷史版次只屬圖號，料號維持「直接關聯」，圖料根號只顯示「關聯矩陣」，三者在受阻時顯示一項原因。
  - 進版／分支關閉：圖號抽屜以「進版」為主要入口；production可建立下一量產版或下一研發版，RD可續minor，且base仍current時才可升下一量產版。目標版次由server tuple authority計算；同圖號第4個新branch原子拒絕。latest approved idle RD另可用次要風險action`申請作廢`，核准formalize後關閉branch、移除current row、釋放cap且不可reopen。
  - 編輯頁：圖號維持現有獨立編輯器、圖面／檔案／智慧辨識及送審架構不變；料號以主資料表單處理「修改中」，圖料根號以關聯樹處理「調整中」，不得建立三工作臺共用編輯表單。
  - 資料與權限：Drawing／Part／Relation使用三張專用current work table，legacy mixed workspace只作conversion source；延續既有same-company non-owner edit scope。未核准physical bytes經零引用、approved-artifact與canonical-only gate後永久刪除，不提供備份回復功能；DB/schema/binding rollback仍保留。
  - 過渡期護欄：只允許`legacy_only → shadow_compare（隔離）→ cutover_window → canonical_only`；舊authority退役是同一DEV的Definition of Done，不得延後成future cleanup。缺retirement manifest或`npm run qc:dev-087:retirement`未PASS時，狀態只能是`Retirement Pending`。
  - 權威：`.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`、`.ai-doc/decisions/ADR-PDM-STATUS-DATA-REBUILD-001-single-current-state-authority.md`、`.ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md`；UI-only執行子契約：`.ai-doc/qa/qa-dev-087-ui-only-lifecycle-operation-validation-plan-2026-08-22.md`。
  - RD／QA主管封口：Cloud SQL schema migration固定`042_status_data_rebuild.sql`，正式資料轉換另由provider-aware `scripts/migrate-dev-087-postgres.mjs`負責；SQLite使用`ensureDev087CanonicalWorkbenchSchema`與受限cleanup工具。typed DTO、single file-read、domain command、transient review、retirement與`QA-087-001..186`均已寫入權威文件；DEV-092 的 `QA-087-179..186` 已全部 PASS並保留。2026-08-27 current completion改為94個產品案例與三個Quality Gate；`QA-087-219..229`只作Historical Supporting。
  - UI-only本期生命週期QA：current圖號24、料號13、inline matrix 14的51-case與11個共同hard gates，加上2026-08-25重開新增的Drawing變更影響、任務通知、Drawing／Part正式作廢、Part四項變體屬性、歷史exact artifact、工作檔案管理、矩陣identity導覽與工作臺探索控制32案，合計94案。合法business mutation仍只能由rendered UI觸發，API／DB只可唯讀取證；只有明確列入的fail-closed negative probe可直接呼叫API，且必須non-2xx、DB delta=0。另以provider、security與UI三個橫向Gate驗收，不接受舊67-case或任意「受影響子集」替代。
  - 新舊衝突原則：以DEV-087新決策為主；activation後安全可拆的舊current-state table/field/projector/resolver/filter/query/API command/feature flag與fallback在同一DEV拆除。DEV-086、DEV-055/078、DEV-085、workbench core、Drawing/Part/Relation owner與approval等直接文件均已加target supersession boundary；舊QA只作activation前歷史證據，不可要求保留相容路徑。
  - 歷史本機結果：canonical schema／repository／commands／三工作臺UI／Drawing獨立編輯與辨識／review／cancel／retirement已實作；DEV-092／DEV-094已關閉當時的work-file snapshot與SQLite migration完整性問題。這些舊PASS只作回歸基線；2026-08-28另以修正後94案＋3 Gate的fresh aggregate完成current結案。
  - 本機清理：2026-08-23最終決策取代local preservation。主SQLite的60個legacy workspace與56筆quarantine已清為0；兩筆old approved review轉為minimal trace，canonical hash完全不變，未刪任何仍有有效引用的file asset／physical bytes。證據 `output/qa/dev-087-local-cleanup/main-apply/manifest.json`。
  - 2026-08-28 current重驗結論：修正後runner／registry與fresh aggregate已完成；21/21 commands、94/94 product cases、3/3 Quality Gates、Blocked／Not Run／Fail=`0/0/0`，`completionCandidate=true`。其中repository `25/25`、negative `6/6`、PostgreSQL `6/6`、security zero-write `8/8`及8族×4 viewport=`32/32`均PASS；release維持false，exact evidence見DEV-087完成收據。

- 統一建立編號：`✓ DEV-093` `Local RD Implemented / Corrective QA-QC Passed / Production Release Gated`。
  - 目標：Drawing／Part header與drawer共用單一`/numbering/create` progressive flow；new root既有完整命名流程維持不變；existing root精簡為root、建立內容、必要M／R欄、單行「將建立」與唯一primary action，不重複顯示或輸入料件profile。
  - 權威：正式寫入只走canonical record/root append command與DEV-090 relation writer；new root名稱與規格契約不變。existing root的`itemKind/structureType/isUniversal/seriesCode/customSpecification`只由server在transaction內讀取root canonical Part並繼承，canonical UI／request不得重複定義。preview唯讀且不保留號，不新增schema/migration，不恢復workspace、candidate reservation、fallback或dual-write。
  - 本機結果：Phase 093-E～I與Phase 093-J～L existing-root quiet append皆已完成。QA-093-001..110、兩輪fresh Chromium、桌面／320px、五項profile後端繼承、異常profile fail closed、contract／retirement／isolated build均PASS；`建立新圖料`未被本次精簡誤改。
  - 下一步：正式環境只剩044／045 PostgreSQL migration rehearsal、zero-loss reconciliation、deploy／release授權與production smoke；未取得授權不得執行。

- 預覽自動化補強：`☑ DEV-056` Phase 1E SolidWorks 2D PNG 預覽端到端修復。
  - 狀態：`RD Implementation Complete / Local E2E Verified / P0 / Local Only / Production Release Gated`。
  - 重開原因：真實 `A0002-M01.SLDDRW` 工作已建立但維持 `queued`、`attempt_count=0`、`locked_by=null`；固定本機 runtime 同時回報 Document Manager preview worker `not_configured`。既有「2D 處理較久」截圖只能證明 placeholder，不再作為完成證據。
  - 目前範圍：讓 launcher 與 UI-only DPAPI／GSM credential lifecycle 一致；統一 Phase 1 `.SLDDRW -> PNG` 的 job kind；新增獨立 2D renderer capability heartbeat；讓 unified entity detail 也執行 queued/running stale recovery並呈現可行動終態。
  - 驗收：管理員只在 UI 輸入、測試、啟用 key且不需PowerShell／`.env.local`／人工restart；同一常駐2D worker自動取得exact active version；A0002工作被領取並產生current-hash PNG derivative；超時未領取不得永久顯示「預覽產生中」。
  - 不在本任務：Phase 2 `.SLDDRW -> PDF`、互動式 3D、production deploy/migration、歷史批次回填、CAD來源檔修改。
  - 結果：真實A0002 E2E、secret redaction與三viewport browser gate已通過；receipt位於`output/qa/dev-056-2d-preview/20260819132108/`與`output/qa/dev-056-2d-preview/20260819132829-browser/`。Phase 2 PDF、互動式3D、production deploy/migration/release仍另受授權gate管制。

- 精簡圖號明細工作卡：`◇ DEV-057` `Local RD Implemented / QA-QC Passed by DEV-059 / Commit Pending / Release Not Authorized`。
  - 目標：候選與正式圖號共用同一 `DrawingWorkspaceDrawer`；候選首版補資料、檔案與送審在同頁完成，不再經過「準備首版圖面」第二層入口。
  - UI 收斂補強：`/approvals` 保留審核清單作為背景脈絡，選取案件改用同一 `DrawingWorkspaceDrawer` 覆蓋式抽屜與五段順序；審核證據、預覽／下載與決策按鈕由 adapter 提供，不再維護獨立 `approval-detail-panel`。
  - 內容層收斂：A0005 正式圖號的摘要密度與區塊標題成為唯一視覺基準；候選、正式、審核都把資料交給 `DrawingDetailContent`／`DrawingDetailContentModel`，不再各自繪製首層版面，adapter 只提供資料與操作權限。
  - 預覽層收斂：候選、正式、審核共用 `DrawingDetailPreview` 與同一套預覽解析規則，固定呈現 3D／2D 兩張卡；有媒體就載入實際預覽，尚未產生則顯示同一套可理解的等待／下載 fallback，不再由模式各自繪製預覽版面。
  - 2026-08-10 使用者重新決策 UI 方向：目前只保留 A0005 正式圖號明細抽屜作為唯一視覺基準；候選圖號與審核明細抽屜暫停掛載並移除可進入入口，待重新設計後再開發。API、資料與審核命令契約先保留，不視為正式 release。
  - 父任務：`DEV-053`、`DEV-055`、`DEV-056`、`DEV-PDM-NEXT-STEP-UX-001`、`DEV-PDM-ENTITY-DETAIL-DRAWER-001`。
  - 下一步：`DEV-059` current-route recovery 與 isolated disposable UI mutation extended gate 均已通過；父點本機 QA/QC 恢復為 PASS。commit、merge、PR、deploy 與 release 仍須另行明確授權並走既有 gate。
  - 阻塞 / 恢復條件：目前無產品方向阻塞；若實作需要改 lifecycle/status authority、schema、權限、既有路由語意或刪除既有能力，停止並回 PM 做 Spec Impact Preflight 與範圍決策。
  - 計入交付：是（首屏 UX 與狀態導向入口交付；production release 另走既有 release gate）。

- 候選整包送審確認復原：`✓ DEV-059` `Local RD Implemented / AI QA-QC Passed / Commit Pending / Production Release Gated`。
  - 目標：修正「送交圖料與首版整包審核」確認視窗無法由 `X`、`返回檢查` 或 `Escape` 關閉，並讓重整、上一頁／下一頁、bfcache、候選切換與 runtime 異常都能回到可理解、可恢復的工作狀態。
  - 父任務：`DEV-057`；關聯 authority：`DEV-052`、`DEV-053`。
  - 執行邊界：Medium / P0，本機 UI lifecycle、復原處理、focused checks 與 AI 真實瀏覽器驗證；共享 route 保持唯讀，可逆 mutation 僅限 disposable isolated runtime；不改 lifecycle/API/schema/permission/正式資料，不含 deploy/release。
  - 驗收與證據：current-route X／返回／Escape／reload／back-forward／CUA 與 1440/1024/390 viewport 通過；`npm.cmd run qc:dev-059:candidate-submit-modal-ui` 9/9、typecheck、affected-file ESLint 通過；`npm.cmd run qc:dev-059:candidate-submit-modal-real-operation` run `DEV059-20260809-161835-isolated` 11/11 PASS，覆蓋 disposable UI 建立與首版證據、單一送審 request、503、response-loss authoritative readback、撤回／取消 cleanup、正式主檔零污染，`productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`；另有 DEV-053 flow 7/7、approval integration 27/27、Phase 1C HTTP 11/11。
  - 下一步：DEV-059 extended gate 已完成並恢復父 `DEV-057` 本機 QA/QC PASS；commit、merge、PR、deploy、production 與 release 仍保持未授權。
  - 計入交付：否（`DEV-057` 的缺陷修復開發點，不另計新的產品交付點）。

- BOM 建立入口：`✓ DEV-060` `Local RD/QA/QC Passed / Commit Pending / Production Release Gated`。
  - 目標：採方案 B 的獨立 `/bom/new` 建立入口，先以「已偵測組合件／全新空白 BOM／已有 BOM 草稿」三路徑分流；組合件與 XLS 再進入來源步驟，空白人工可直接建立，所有路徑建立可追溯 Draft 後交接 `/bom/workbench/<draftId>`。
  - 核心 authority：`ADR-PDM-MATERIAL-IDENTITY-REVISION-001`。Part Number 無 Revision；Drawing/BOM 各自版控。
    同身份只升受影響定義 Rev；FFF、互換性、法規／品質或其他身份條件改變時換新 Part Number，並建立其 BOM。
  - 實作結果：Phase 1A canonical owner/schema/migration、1B API/permission/idempotency、1C navigation/UI/handoff、
    1D review/release/export/read integration 與 isolated QA/QC 均已完成；三路徑入口、空白 BOM／XLS 真實 UI、三 viewport 與組合件證據分流通過。
  - 下一步：維持 commit 與 production release gate；未執行 live migration、正式資料修復、stage/commit/deploy/release。
  - 計入交付：是（BOM 工作台建立入口與可完成的首次建草稿導引）。

- 圖號／料號檔案歸屬精簡：`✓ DEV-061` `Local RD Implemented / Focused QA-QC Passed / Production Release Gated`。
  - 目標：圖號只保留受控版次檔；料號只保留物料層長期文件；移除圖號一般／參考附件、重複預覽與多重上傳窗口。
  - 已確認：既有無引用圖號參考附件刪除；每次首版／進版一律重新上傳 `.SLDDRW` + `.SLDPRT/.SLDASM`；相同 3D bytes 由系統自動共用 canonical asset，不重複占用容量。
  - 執行邊界：可執行本機 Phase 1A～1D、additive migration artifact、disposable cleanup rehearsal 與 QA/QC；不得刪除正式資料、apply live migration、stage/commit/deploy/release。
  - 實作結果：Phase 1A canonical ownership/readiness service、029 migration mirror、primary-role guard；Phase 1B candidate/formal required-role hard gate、3D SHA-256 scoped reuse、legacy drawing upload 410；Phase 1C immutable `source_file_asset_id` pointer、package canonical-link projection；Phase 1D drawing/part UI 收斂、compact non-collapsed file list、preview-image click target、isolated browser evidence 均已完成。
  - 下一步：維持 production deletion、live migration、commit、deploy、release gate；若要實際清理 12 筆目前 dry-run candidates，須另取得受控 migration/cleanup approval，不以本機完成證據直接刪除。
  - 計入交付：是（檔案 authority、容量去重與使用介面共同收斂）。

- 料號／圖料單頁工作台：`✓ DEV-062` `Local RD Implemented / Fixed-3000 QA-QC Passed / Release Gated`。
  - 目標：比照圖號工作台的單一生命週期入口，取消料號與圖料工作台各自的「總表／保留號」雙頁籤；使用者不必先判斷資料是候選或正式，便能在同一工作台找到工作、理解狀態並完成下一步。
  - 架構決策：先建立小型共用 Workbench Core，集中 server projection、cursor／URL、權限、狀態與清單互動；料號與圖料保留各自 domain adapter。禁止建立大型萬用 workbench、core 內以 module 分支，或由各模組重做共用機制。
  - 2026-08-11 使用者決策 amendment：料號／製造成本產品功能、後端契約與既有成本表全部退役；以 `ADR-PDM-PART-COST-RETIREMENT-001` 為現行權威。DEV-062 的歷史 `cost redaction` 證據不再是目前 acceptance，成本退役 QC 改由 `qc:pdm-part-cost-retirement` 負責。
  - 實作結果：Phase 1A 四個小型 core 單元與Drawing parity、Phase 1B Part candidate/formal單頁BFF、Phase 1C canonical Relation root/overlay/candidate_root、Phase 1D legacy/race/權限/RWD/a11y/aggregate均完成；fixed 3000 亦已啟用並通過使用者可見驗收。Evidence見runs `DEV062-20260810-121012-local-isolated`與`DEV062-FIX-20260810124507-fixed3000`。
  - 下一步：維持default-off與production/deploy/release gate；若要開啟staging/production flag、執行smoke/rollback rehearsal或退役flag-off legacy branch，必須另以明確release指令進入deployment release gate。
  - 計入交付：是（兩個模組皆完成單頁化才結案；單獨完成 core 或其中一個模組不計整體完成）。

- 編號詞彙統一：`✓ DEV-063` `本機 RD/QA/QC 完成 / Human Confirmed` `P1` `Local Only / Production Release Gated`。
  - 目標：使用者介面不再以「保留號」、「候選圖號」、「正式圖號」等生命週期詞替代物件名稱；統一使用「編號／主根號／料號／圖號」，以流程狀態與操作限制取代號碼效力分類。
  - 下一步：本機產品程式、local rewrite runner、targeted QA/QC 與瀏覽器驗收已完成；staging／production 另依 deployment release gate 處理。
  - 執行邊界：本輪完成 local implementation 與驗證；未執行 production data、live apply、正式 migration、deploy、merge、PR 或 release。
  - 相容邊界：本 phase 未改 API shape、schema shape、舊 URL 或內部 `reserved`／`candidate`／`official` machine 識別；5C 只改寫 exact inventory 內的人類可讀文字，immutable raw audit／snapshot 維持 raw value 並由 projection 顯示。
  - 計入交付：是（完成後使用者可在同一物件名稱下理解狀態，不必用資料來源或生命週期猜測名稱）。

- 圖號單一資料層：`✓ DEV-064` `本機 RD/QA/QC 完成 / Human Directed` `P0` `Local Only / Production Migration & Release Gated`；focused 7/7、isolated Chromium 28/28，正式 migration/deploy/release 未執行。
  - 目標：所有圖號狀態共用同一 `Drawing / DrawingRevision / DrawingRevisionFile` 權威；workspace 只保留整包流程容器，candidate/formal tables 降為相容投影。
  - 使用者決策：2026-08-11 明確要求「所有狀態都共用同一個資料層」，並要求待處理圖號共用研發可用的圖號明細入口；2026-08-15追加所有舊保留號零遺漏納管，可工作的active案件進「首版準備」，其他狀態保留在合法後續／歷史／復原入口。
  - Spec Impact Preflight：`Intentional replacement`；取代 DEV-052／DEV-053 將 candidate aggregate 正式化為另一套 master/package 的衝突條款，保留編號唯一性、整包 snapshot、原子審核、server permission 與受控版次不可變性。
  - 執行邊界：本機 additive schema、compatibility backfill artifact、transactional dual-write、canonical workbench identity、共用 drawer、QA/QC；不得執行 staging／production migration、live data repair、deploy、merge、PR 或 release。
  - 計入交付：否（待 RD self-check、QA 與獨立 QC 完成）。

- ✓ DEV-065 [交付點] [Phase 1 + Phase 2 Local RD Implemented] [P1] [SQLite + Browser QA Passed / PostgreSQL Shadow Blocked / Capability Default Off / Production Release Gated] 圖號／料號工作台預覽圖模式
  - 摘要：Phase 1 Drawing gallery與Phase 2 Part identity preview均已完成本機RD實作。Part auto只解析direct primary manufacturing Drawing，production ready優先，否則取latest open active RD ready；例外可上傳custom image。Schema 046／SQLite marker、sharp、service/routes、same-snapshot resolver、shared components與三支runner均已落地，沒有新增branch preference或第二套preview元件，capability維持default off。
  - 來源 ID：`DEV-PDM-WORKBENCH-PREVIEW-GALLERY-001`。
  - 父任務：`DEV-087`；歷史關聯`DEV-053`、`DEV-056`、`DEV-061`、`DEV-062`、`DEV-064`。
  - 下一步：若要full multi-provider QA或啟用capability，在safe disposable PostgreSQL shadow執行既有provider runner；production migration、deploy與release另走gate。
  - 阻塞／恢復條件：Human、engineering與local implementation blocker=0；PostgreSQL parity因無safe shadow為BLOCKED。
  - 證據：SPEC §0.16／§0.16.19、`ADR-PDM-PART-PREVIEW-AUTHORITY-001`、QA §0.7／`PPC-001..018`、QC `.ai-doc/qc/qc-dev-065-part-preview-local-execution-2026-08-24.md`；contract 28/28、SQLite 30/30、browser 112 checks PASS；A0005-P01四viewport顯示`研發預覽 · A0005-M01 · 0.1`。
  - 計入交付：是（Drawing＋Part本機RD）；PostgreSQL full QA、activation與release不計入。

- 三工作台頂部欄一致化：`◇ DEV-066` `RD Implemented / Focused Contract QC 13/13 / Browser Smoke Blocked by auth` `P1` `Local Only / Production Release Gated`。
  - 目標：統一圖料、圖號、料號工作台的 topbar、filter row、history deep-link scope、顯示模式與 pagination 位置，最大化使用者肌肉記憶。
  - 使用者需求：過濾器相關控制項同一排；分頁按鈕固定同一位置；相同定義控制項在三模組固定相同空間位置。圖料保留 `關係樹／矩陣`，圖號／料號保留 `清單／預覽圖`。
  - Spec Impact Preflight：`Compatible extension`；只收斂既有 UI shell、DOM、CSS、ARIA 與 pagination markup，不改 API、schema、permission、status、preview source、URL semantics 或資料排序。
  - RD Contract：filter grid 為第一列；三模組均不渲染 `包含歷史` checkbox/helper；可用 mode switch 固定在 footer 右側，無 mode switch 時不渲染空白 footer；`history=include` deep link 與 history-only detail 仍相容；三模組共用 `PdmWorkbenchPagination`；桌面左右對齊，手機上下堆疊；既有 drawing help 不強行補到其他模組。
  - 權威文件：`.ai-doc/specs/SPEC-UX-PDM-WORKBENCH-TOPBAR-001-unified-toolbar-muscle-memory.md`；QA `.ai-doc/qa/qa-dev-066-workbench-topbar-muscle-memory-validation-plan-2026-08-11.md`。
  - 驗收：`TB-001`～`TB-013` 全部有 evidence；含三 route DOM contract、history control removal/deep-link compatibility、mode/pagination 行為、1440/1024/768/390 四 viewport、keyboard/a11y、affected lint/typecheck。Browser/auth 阻塞時必須明確標記 BLOCKED，不得以靜態檢查冒充 UI PASS。
  - 執行邊界：可執行本機 UI markup/CSS/component、focused QA/QC；不可執行 production/staging、migration、data repair、deploy、merge、PR 或 release。
  - 實作結果：三模組已完成 shared topbar class、條件式 filter/footer DOM 收斂、共用 `PdmWorkbenchPagination`、desktop/tablet/mobile CSS 與 5-filter grid 收斂；依使用者要求移除圖料、圖號、料號工作台的 inline history checkbox/helper，保留 `history=include` deep-link／history-only detail 相容性，且沒有 mode switch 時不渲染空白 footer；受影響 ESLint、`typecheck:app`、focused contract QC 13/13 與 diff check PASS。
  - 驗證限制：managed-auth route 與隔離 demo-auth route 均無法建立可用 session，四 viewport real-browser smoke 暫列 BLOCKED；未以靜態 QC 冒充 UI PASS。
  - 計入交付：是（三模組全部完成且共同契約無漂移才標記本機實作完成；browser evidence 補齊後才可移除驗證阻塞）。

- ◇ DEV-085 [交付點] [RD Implemented / Contract QC 6/6 / Selection QC 9/9 / Query QC 11/11 / Browser 12/12 / Focused Regressions PASS / QA-QC Pending] [P1] [Local Only / Production Release Gated] 三工作台 Excel 式複選篩選器
  - 摘要：圖料、圖號、料號三個工作台頂端的12個下拉欄位改為同一 Excel 式複選器，並同步完成 explicit selection、repeated URL、API normalization、server-side OR/AND、signed cursor與RWD契約。
  - 來源 ID：`DEV-PDM-WORKBENCH-MULTISELECT-FILTER-001`。
  - 父任務：`DEV-066`；關聯：`DEV-062`、`DEV-078`。
  - 下一步：QA/QC依SPEC收斂MSF-016、MSF-018～020、MSF-034～037、MSF-044、R06與independent QC manifest；完成後才可將`◇`改為`✓`。production/staging、deploy、release仍另受gate。
  - 證據：權威SPEC `.ai-doc/specs/SPEC-PDM-WORKBENCH-MULTISELECT-FILTER-001-excel-style-filter-contract.md`；QA `.ai-doc/qa/qa-dev-085-workbench-multiselect-filter-validation-plan-2026-08-20.md`；selection `output/qa/dev-085-workbench-multiselect-filter/selection-20260820102202-local/selection-results.json`；query `output/qa/dev-085-workbench-multiselect-filter/query-20260820102306-local/query-results.json`；contract `output/qa/dev-085-workbench-multiselect-filter/contract-20260820102306-local/contract-results.json`；browser `output/qa/dev-085-workbench-multiselect-filter/browser-202608201025-local/browser-results.json`；四 viewport screenshots `output/playwright/dev085-{drawing,part,relation}-{desktop,tablet-landscape,tablet-portrait,mobile}.png`。
  - 計入交付：是；三route全部實作並通過MSF-001～046、R01～R07與真實browser evidence後才完成。

  - 文件成熟度：`RD Implemented / Contract QC 6/6 / Selection QC 9/9 / Query QC 11/11 / Browser 12/12 / Focused Regressions PASS / QA-QC Pending`；本機產品碼與主要 query/cursor、四 viewport keyboard/a11y、visible-error evidence 已落地，剩餘案例與 independent QC 尚未完成，不得冒充完整產品交付。
  - 風險等級：`Medium / P1`。主要風險為零選取誤查全部、UI/API集合漂移、filter-after-limit假空頁、all漏candidate/formal、cursor未隨canonical set失效及popover RWD/a11y缺陷。
  - Human Decision：所有實際選項預設勾選；`（全選）`支援checked/indeterminate/unchecked；零選取明確顯示`未選取`並回零筆。popover只在`確定`後套用；取消、Escape、outside pointer/focus捨棄草稿；同欄OR、跨欄AND。
  - RD Contract：all省略query key、none使用`__none__`、some以repeated key傳輸；舊單值相容。shared client-safe helper負責mode、去重、排序與wire，domain adapter擁有options/labels/SQL。some在identity SQL使用named `IN`／EXISTS OR；projected human status在bounded scan中matches-any，必須先filter再形成limit+cursor page。
  - Data/API/Permission：無schema、migration、資料、permission、status、mutation或新flag；三條既有GET route與no-store policy保留。filter hash加入canonical arrays，same set order-invariant，set改變使舊cursor fail closed。
  - UI Contract：新增共用portal popover；summary固定`全部`／單值／`第一值 +N`／`未選取`，series可搜尋options。保留DEV-066 filter grid/footer/mode/pagination位置，不新增永久chips或第二toolbar。
  - Failure Recovery：browser invalid URL正規化為none且可在原欄位全選恢復；direct API malformed selection回400 `workbench_invalid_filter`；network/5xx保留既有retry，不得冒充empty state。
  - Stop Conditions：需要改schema/data/permission/lifecycle/sort/preview/mutation/legacy projection/approval，core需理解domain欄位，無法維持filter-before-limit與既有query budgets，或需要第三方UI、env/flag、production/deploy/release時立即回Dev PM。
  - Spec Impact：`Intentional follow-up + compatible preservation`；DEV-085有意承接DEV-066的filter-semantics stop condition，保留其空間契約與舊evidence但不挪用為新功能證據。ADR沿用`ADR-PDM-WORKBENCH-CORE-001`，不新增。
  - 執行邊界：本輪已完成DEV/SPEC/QA/map文件、本機產品實作與主要 focused 驗證；下一步僅允許QA/QC在本機/disposable範圍完成剩餘案例與證據收斂。production/staging、資料操作、stage/commit/merge/PR/deploy/release未授權。

- ◇ DEV-086 [交付點] [CAPA Corrective Implementation Verified / Local QA-QC PASS] [P0] [Local Only / Production Release Gated] 三工作台量產／研發最新版雙列投影
  - 摘要：圖號、料號、圖料三個工作台不再以單一「全域最新版」覆蓋生產仍須使用的版本；同一主檔群組最多相鄰顯示一列`量產最新版`與一列`研發最新版`，並可直接依版別篩選。
  - 來源 ID：`DEV-PDM-WORKBENCH-PRODUCTION-RD-LANES-001`。
  - 父任務：無；關聯 authority：`DEV-050`、`DEV-053`、`DEV-055`、`DEV-062`、`DEV-066`、`DEV-078`、`DEV-083`、`DEV-085`。
  - 完成證據：CAPA `R0→R5` 已完成本機矯正與驗證；on-path status readback 為 `requested=true / enabled=true`，`npm.cmd run typecheck:app` PASS，`npm.cmd run qc:dev-086` aggregate PASS（contract 5、repository 4、api 4、query-budget 6、transition 3、classifier 2、browser 76/76）。A0002-M01 rendered list 同時呈現`量產最新版／版次 1`與`研發最新版／版次 1.1`；料號與圖料根號同樣具雙列與直接版別篩選。證據 manifest：`output/qa/dev-086/dev-086-2026-08-21T00-59-40-660Z/manifest.json`。
  - 邊界：維持本機與 release gate；production/staging deploy、merge、PR、正式資料操作與 release 未授權。後續若要放行 production，需補組織要求的獨立簽核、部署與 smoke evidence，不另開平行 DEV。
  - 計入交付：是；三工作台、雙列資料權威、直接篩選、原子發布切換與失敗保護全部完成並通過 QA/QC 後，才計入產品交付。

  - 文件成熟度：`RD Implementation Complete / CAPA Corrective Implementation Verified / Local QA-QC PASS`。P0/P1產品決策gap=0；產品契約與 ADR 不變，live on-path、valid fixture、rendered browser與清單／明細 lane parity 已有本機證據。上段「CAPA 重開事實」保留為歷史根因記錄，不再代表目前狀態。
  - 權威文件：`.ai-doc/specs/SPEC-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-latest-projection.md`；`.ai-doc/decisions/ADR-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-lane-authority.md`；`.ai-doc/qa/qa-dev-086-production-rd-lanes-validation-plan-2026-08-20.md`；CAPA `.ai-doc/qc/qc-dev-086-dual-lane-completion-capa-2026-08-21.md`。
  - 風險等級：`High / P0`。若「研發最新版」覆蓋「量產最新版」，生產可能看不到仍有效版本或誤用尚未發布版本；所有查詢與發布失敗都必須 fail closed。

  - CAPA 重開事實（2026-08-21）：
    - 本機 A0002-M01 只顯示一列；列顯示`研發版可使用`，同列明細顯示`量產版可使用`且目前版次為 1.1，沒有`量產最新版／研發最新版`並列。
    - `/api/numbering/state-flow/status` 回讀 `productionRdLanes.requested=false / enabled=false`，表示檢視時仍是舊 read path；同時 1.1 已核准／發布，版次 1 已進歷史，並非合法 V1 production＋V1.1 active fixture。
    - `scripts/qc-dev-086-browser.mjs` 目前只有 7 個 source string／rowgroup 靜態斷言，沒有真實 route、rendered DOM、viewport、network 或 screenshot 證據；其 PASS 必須重新分類為 source-contract evidence。
    - 根因分類為 fixture 前置控制、feature activation 前置控制、evidence taxonomy 與 PM completion gate 四層失效；不改 dual-lane 產品決策，也不新增 ADR。
    - CA：重建非終結雙 lane fixture、啟用並回讀 flags、修正 on-path、補真實 browser／exact reference／transition／query evidence；PA：invalid fixture fail、manifest evidence class、row/detail parity 與不可略過的 completion receipt。
    - 歷史 `Do Not Complete Until` 閘門已由本次 CAPA receipt 滿足：flag on 回讀、valid disposable fixture、三 route rendered browser、query／transition focused checks、P0/P1=0與cleanup均已保存；production 放行仍須另遵循組織 release gate 的獨立簽核、部署與 smoke evidence。

  - 問題與使用者價值：
    - 圖號、料號、圖料工作台同時服務研發與生產；「只顯示全域最新版」把兩種不同效力的最新版錯誤壓成同一筆。
    - 量產料件進入設變後，新 V2 可能仍在編輯或審核，但 V1 仍是生產唯一有效依據；兩者必須同時可見且不能互相取代。
    - 使用者掃描清單時要在五秒內辨識「現在生產用哪版」與「研發正在改哪版」，並能直接只看其中一種版別。

  - Human Decision Brief（已確認）：
    1. 同一 canonical 主檔不是複製兩份 master，而是由同一 identity 投影為最多兩列：`量產最新版`與`研發最新版`。
    2. 有兩列時固定量產列在上、研發列在下並保持相鄰；只有一個 lane 有合法資料時只顯示一列，不用同一版本補成兩列。
    3. 清單只顯示各 lane 的最新版；舊版次、已取代發布版與 revision history 只在明細／歷史區查閱，不回到 top-level list。
    4. `包含歷史`只控制已終結 canonical master 群組，不把舊 revision 展開成多列，也不得破壞每群組最多兩列的上限。
    5. 所有有權查看該主檔的研發與生產使用者都可看到兩個 lane；角色只改變可執行動作，不改變版本可見性。
    6. 版別必須以短標籤、圖示、固定位置與低對比列底／左側識別線共同表達；顏色不是唯一訊號，每列仍只保留一個 `DEV-055` 人類主要狀態。
    7. 預覽、下載、明細與 deep link 必須鎖定所點 lane 的 exact version／baseline；資料不足或失效時顯示錯誤，不得跨 lane fallback。

  - V2 編輯／審核中的固定呈現：
    - 量產列保持 `量產最新版｜V1｜生產可用`，直到 V2 的完整發布交易成功；建立、編輯、送審或核准中的 V2 都不得提前覆蓋 V1。
    - V2 顯示在 `研發最新版`列，版次欄可顯示`V2`，其下以次要文字標示`目標量產版`；主要狀態依事實顯示`編輯中`、`審核中`、`待補正`或`發布未完成`。
    - `目標量產版`是版次目的，不是已生效狀態；它不能顯示`生產可用`，也不能取得量產列的預覽／下載指標。
    - V2 完整且原子發布成功後，量產指標一次切到 V2，V1 進入 revision history；若沒有更新的 active change，研發列消失。
    - 發布任一步驟失敗時，量產列仍固定 V1；研發列 V2 顯示`發布未完成`或`待確認`及恢復入口，不得出現半套 V2 生產投影。

  - 清單視覺契約圖：

    ```mermaid
    flowchart TB
      G["同一 canonical 主檔群組<br/>例如圖號 A0005／料號 P01／圖料根號 A0005"]
      G --> P["🏭 量產最新版｜V1<br/>主要狀態：生產可用<br/>固定第一列・量產樣式"]
      G --> R["🧪 研發最新版｜V2<br/>次要文字：目標量產版<br/>主要狀態：編輯中／審核中／發布未完成"]
      P --- N["兩列相鄰且同頁；預覽、下載、明細皆鎖定 exact lane"]
      R --- N
    ```

  - 發布切換與失敗保護圖：

    ```mermaid
    flowchart LR
      A["目前生產：V1"] --> B["建立 V2 設變"]
      B --> C["研發列：V2 編輯中"]
      C --> D["研發列：V2 審核中"]
      D --> E{"完整發布交易"}
      E -->|"全部成功"| F["量產列原子切換至 V2<br/>V1 進歷史"]
      E -->|"任一步失敗"| G["量產列仍為 V1<br/>研發列 V2：發布未完成"]
      G --> E
    ```

  - 三工作台 lane authority 方向：

    | 工作台 | canonical group | `量產最新版`候選權威 | `研發最新版`候選權威 |
    |---|---|---|---|
    | 圖號 | drawing master identity | 最新完整發布且 production-effective 的 drawing revision package | 最新 active、未終結的 drawing candidate／revision／change projection |
    | 料號 | stable Part Number identity；不建立 Part Revision | 該料號最新 Released manufacturing baseline／受控生產組態 | 該料號最新 active manufacturing baseline／workspace／change projection |
    | 圖料 | stable root identity | 最新 Released relation／manufacturing baseline snapshot，且必要依賴完整 | 最新 active root change／workspace relation projection |

    上表的資料權威、優先序與缺資料處理已由DEV-086主SPEC封口：production使用可證明的Released package／baseline，無baseline的legacy record只可使用明確released basis並回傳誠實reference kind；RD彙整active change，平行衝突只回單一conflict projection。Part／Root owner batch query、legacy classifier、既有index、migration=`none`與數值query budget已在RD Implementation Package固定；不得用更新時間或顯示碼猜測最新版，也不得虛構Part Revision。

  - 版別篩選與查詢方向：
    - 三工作台新增同義的`版別`篩選，實際值只有`量產最新版`與`研發最新版`；預設兩者皆納入，可直接只看其中一種。
    - 若與 `DEV-085` 一起落地，`版別`沿用 Excel 式複選：兩值全選等於全部、單選即 lane filter、零選取即零筆；同欄 OR、跨欄與圖號／料號／根號搜尋及其他 filter 採 AND。
    - 圖號搜尋定位 drawing group、料號搜尋定位 Part Number group、圖料搜尋定位 root group；搜尋結果仍依版別 filter 投影，不因命中舊 revision 而新增歷史列。
    - 篩選、分組與每 lane 選 latest 必須全部在 server-side cursor／limit 之前完成；不得先分頁再由 client 配對或刪列。

  - Architecture Memory Capsule：
    - `groupKey`固定 canonical entity identity；`rowKey`必須包含 domain＋identity＋lane，但不含會變動的顯示版號，確保選取與 deep link 不串 lane。
    - pagination unit 是 canonical group，不是單列；同一群組的量產／研發列不得被拆到不同頁，next cursor 必須對齊 group boundary。
    - shared Workbench Core 只提供 grouping／cursor／URL／request-race mechanics；Drawing、Part、Relation adapter 各自決定 lane authority，禁止在 core 寫 domain switch，也禁止 browser join 多個 API。
    - 若同一 lane 存在無法排序的平行 active changes，不得任選一筆冒充最新版；只保留一列`研發最新版`，主要狀態顯示`待確認`，次要文字顯示`存在 N 個平行設變`並導向 exact selection surface。
    - release switch必須與完整package／baseline、必要依賴與audit在同一原子或可證明等價的交易邊界；production reference由已commit source推導，不新增pointer，失敗不得改變下一個read snapshot的production結果。

  - RD Implementation Ready Upgrade（2026-08-20）：
    - 採用 derived effective reference，不新增人工 production pointer，也不複製 master；production 由完整 Released evidence 推導，RD 由 active change aggregate 推導。
    - API DTO 新增`groupKey／entityKey／lane／laneLabel／reference／projectionToken`；stable key固定`<domain>:<identity>:production|rd`，source-less candidate只允許`candidate:<workspaceId>:rd`。
    - lane query沿用DEV-085 explicit selection wire：all省略key、none=`lane=__none__`、some使用repeated `lane` key；選滿兩值正規化為all，禁止另造comma-separated格式。pagination unit固定canonical group，signed cursor升為v2，舊v1只安全reset一次。
    - list summary依formal master view權限顯示安全的兩 lane 摘要；detail／preview／download／action仍依actor、company與exact lane重新授權，使用projection token且禁止跨lane fallback，private response採`no-store`。
    - 現行Drawing single highest overlay、Part candidate/formal獨立row、Relation source-root overlay皆已在受影響SPEC標註target intentional replacement；shared mechanics/domain adapter與每lane一個human status保留。
    - schema／migration classification固定`none`；既有drawing package、workspace source FK與baseline owner indexes足夠。若RD query plan否定此判定，立即停止回Dev PM／ADR，不得自行加table、index、backfill或人工pointer。
    - umbrella flag固定`PDM_WORKBENCH_PRODUCTION_RD_LANES_V1`且預設關閉；三工作台同次啟用／rollback，禁止只開一個domain形成語意不一致。
    - exact file／function／route、SQL intent、projection token wire、query budget、fixture、evidence path、dirty ledger與1A～1E entry／exit均已固定；`npm.cmd run qc:dev-086` aggregate 31 checks、DEV-085 regression 26 checks與typecheck:app的既有 PASS 僅是歷史 source/focused evidence。CAPA 已把 live activation、valid fixture、real browser 與 completion receipt 擴充為 QA-086-33～38；全數完成前不得宣稱產品完成。
    - query ceilings：Drawing／Part／Relation list=`18/18/22`，lane detail=`18/18/26`，baseline owners batch=`2`；1／20／50 group或owner count必須不成長，list/detail read path business write=0。
    - exact aggregate command target為`npm run qc:dev-086`；subcommands為`:contract`、`:repository`、`:api`、`:query`、`:transition`、`:classifier`、`:browser`、`:regression`，evidence固定`output/qa/dev-086/<run-id>/`。
    - baseline release與`ManufacturingBaselineReleased` audit必須改成同一transaction；Drawing release沿用既有atomic lifecycle transaction。這是P0 transition gate，不是新產品authority。
    - dirty baseline為branch`持續優化2`／HEAD`050eedd4`；稽核時243個product paths已modified／untracked，多個DEV-086 target也dirty。RD逐檔保存diff hash並只擁有新增hunks，禁止reset、整檔覆寫或把pre-existing work計入證據。

  - Scope：
    - 圖號、料號、圖料三個 top-level workbench list、同義版別 filter、lane-aware row selection、preview／download／detail handoff、URL／cursor／pagination與發布後 read projection。
    - 保留各domain master、revision／baseline、permission、approval與release authority；本DEV改讀取投影並補強baseline release/audit atomicity，不新增production-effective pointer，也不合併三個owner domain。
    - 以表格／清單的扁平雙列呈現，不建立每個主檔一張雙層卡片，也不增加重複說明型容器。

  - Out of Scope：
    - 不新增主資料表、index／migration／backfill、production pointer、Part Revision、Relation preview endpoint或另一套master；exact implementation inventory已在主SPEC第14節固定。
    - 不建立 Part Revision，不用人工手動指定目前量產版，不讓審核中版次提前成為 production-effective。
    - 不把 revision history、已作廢舊版、所有平行 branches 展開到 top-level list；不合併三工作台，也不改 approval inbox／owner workspace 的職責。
    - 本次 CAPA 文件修正本身不修改產品碼、測試碼、schema／migration、正式資料或 runtime；重開後的 DEV-086 可在 task-owned local／isolated 範圍修正既有 exact product/test targets。stage／commit／merge／PR／deploy／release與 production data 仍未授權。

  - Acceptance Direction：
    1. V1 已量產且 V2 編輯／審核時，三工作台對應 group 同時顯示量產 V1 與研發 V2 兩列；V2 明確標示`目標量產版`，生產使用者仍可開啟 V1。
    2. 同一 group 最多兩列，固定量產在上、研發在下、同頁相鄰；單 lane 資料不複製成兩列，歷史 revision 不進 top-level list。
    3. 兩列以文字、圖示、位置與列樣式區分；關閉色彩或使用輔助科技仍可辨識，每列只有一個主要人類狀態。
    4. `版別`可直接篩出只含量產列、只含研發列或兩者；圖號／料號／根號搜尋與版別條件組合後不漏列、不重複、不產生 client-side 假空頁。
    5. 換頁、reload、Back／Forward、filter change與 concurrent refresh 後，同一 pair 不拆頁，selection 不跨 lane，舊 response／cursor 不覆蓋新條件。
    6. 從任一 lane 開啟 preview、下載或明細都只取得該 lane exact artifact／baseline；缺檔、無權限、stale reference或讀取失敗時 fail closed，不能回退另一 lane。
    7. V2完整發布成功後，下一個完整read snapshot的derived production reference原子切換；任何發布失敗、依賴不全或transaction rollback都維持V1生產列，V2留在研發列並顯示可恢復狀態。
    8. 1440×900、1024×768、768×1024、390×844 下，雙列群組、版別標籤、主要狀態、操作與 filter 無裁切、重疊、水平 overflow或只靠顏色辨識。

  - Spec Impact Preflight：`Intentional replacement + compatible preservation`。已同步修訂`SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001`的正式master單列、`SPEC-PDM-NUMBER-STATE-FLOW-001`的Part獨立列、`SPEC-PDM-DRAWING-PART-RELATION-VIEW-001`的source-root overlay、`SPEC-PDM-STATUS-UX-004`的lane-row語意，以及`SPEC-PDM-WORKBENCH-CORE-001`／其ADR的group cursor契約；保留「每個lane row一個主要狀態」、Part Number無Revision與shared mechanics/domain adapter邊界。target authority由DEV-086主SPEC承接，現行runtime在flag開啟前不變。
  - ADR 判定：`Created / Accepted`。權威為`.ai-doc/decisions/ADR-PDM-WORKBENCH-PRODUCTION-RD-LANES-001-dual-lane-authority.md`；選擇同canonical group的derived production／RD projections，拒絕global latest、雙master、drawer-only補洞與人工pointer。
  - Implementation readiness：`PASS / CAPA Re-entry Triggered`。exact repo/file/function/route/SQL intent/index inventory、Part/Root owner queries、local data limitation、legacy classifier、projection token、數值query budget、migration=`none`、fixture/runner與dirty-hunk ledger仍有效；2026-08-21 因 flag off、invalid fixture、static-only browser evidence與單列 live result觸發 re-entry，不另寫平行規格。
  - 執行邊界：既有本機 source implementation 與 focused evidence保留，但不再視為 accepted implementation；重開後須在本機／隔離範圍完成 correction 與 QA/QC。未授權 schema／migration、正式資料、stage／commit／merge／PR／deploy／release。

- ✓ DEV-087 [交付點] [Local RD/QA-QC Complete / Human Confirmed] [P0] [94/94 Product Cases + 3/3 Quality Gates PASS / Production Release Gated] 三工作臺狀態資料重建與漏接功能回復
  - 摘要：重建圖號與料號工作臺的唯一狀態資料權威，將資料層、目前處理責任與受阻結果收斂成乾淨模型；完成安全切換後退役舊的 record／lifecycle／human／viewer／responsibility／availability 重複狀態 authority。Drawing改為一列production加最多3個open RD branch各自latest（最多四列）；Part沒有版本或branch，只允許一份current work。Relation 的 current work／review／工作台由 DEV-090 取代為 Drawing／Part drawer inline matrix direct formal edit，正式關聯唯一由`drawing_part_links`維護。唯讀抽屜共用骨架，Drawing編輯工作區維持獨立，Part仍由自己的domain editor擁有。
  - 來源 ID：`DEV-PDM-STATUS-DATA-REBUILD-001`。
  - 父任務／關聯：intentional-replace `DEV-055`、`DEV-078` Phase 2、`DEV-080` 的舊狀態 authority與 projection chain，以及`DEV-086`的Drawing單一RD列／最多雙列contract；amend `DEV-085` filter、`DEV-079／083` 唯讀抽屜與 unified entity detail/review action contract；preserve `DEV-068／079` 現有圖號編輯與智慧辨識架構、`DEV-073` evidence gate、既有 approval／release business evidence與 exact artifact authority。Part附件獨立即時生效由DEV-087直接定義並沿用現行附件authority，不依賴排在後續的DEV-088。
  - 權威文件：SPEC `.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`；ADR `.ai-doc/decisions/ADR-PDM-STATUS-DATA-REBUILD-001-single-current-state-authority.md`；QA `.ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md`；UI-only執行子契約 `.ai-doc/qa/qa-dev-087-ui-only-lifecycle-operation-validation-plan-2026-08-22.md`。
  - 下一步：本機RD與單人可信QA-QC已完成，沒有待補的current產品案例。若要進入production，須另行明確授權並依release gate執行正式Cloud SQL restore rehearsal、migration／cutover、deploy、production smoke與監測；實際輔助科技維持非阻擋選配。
  - 阻塞／恢復條件：目前沒有待使用者裁決的產品方向；本次明確不處理圖料根號搜尋明細、root狀態／阻擋原因、root整體新增或作廢影響。若實作需要新增current authority、恢復已退役Relation work／review、恢復舊組合件流程、修改production資料或擴張root範圍，立即停止並回Dev PM做Spec Impact Preflight。
  - 歷史證據：2026-08-23／24 cleanup、DEV-092、DEV-094、原48-case、Part附件與fresh aggregate證據完整保留，仍可證明其原始assertions；因未涵蓋本次8項漏接功能，全部標記為`Historical Regression Baseline`，不得作current completion替代證據。
  - 單人可信UI操作驗證：DEV-090 supersession後current固定回歸名冊為`D01–D24 / P01–P13 / I01–I14 = 51 cases`，加上`C01–C11 = 11 cases`與功能增補`QA-087-187..218 = 32 cases`，current產品分母合計94案。舊`R01–R14`及`QA-087-219..228`只作Historical Supporting，不計入current分母。所有可視功能仍必須由正常導覽與rendered UI進入，UI／API／DB／file bytes／authority結果需一致；直接API只允許202／206的拒絕式negative probe，必須zero-write。
  - 2026-08-22 QC journey 增補與根因修正（歷史快照，已由 2026-08-23 48-case canonical disposition 取代）：D21/D22、workspace layout、preview terminal race 與 review terminal race 的首敗、修正與重跑證據完整保留；不再以舊 67-case 暫定分母阻止已核定的本期48-case local closure。

  - 2026-08-25 功能完整性 CAPA 根因：症狀是舊API／route或domain能力仍在，但canonical UI入口、操作與readback不完整；直接原因是架構切換只搬了核心state與部分happy path，沒有逐項搬完整user journey；控制失效是scope rebaseline把「目前不可執行」移出分母後，未建立old-to-new capability trace；系統根因是completion gate偏重authority／migration與已存在案例總數，沒有逐項驗證`可發現入口 → 可操作 → 結果回饋 → 可回復／可追溯`。
  - CA：同一DEV重開，停用現行完成宣告，將下列8項列入開發與QA；readiness已把legacy disposition封口為route刪除／410 zero-write，不得雙寫、委派成另一份工作或繞過審核。
  - PA：保留old-to-new capability coverage matrix、每個保留authority的discoverable writable/readable surface gate與`QA-087-218`功能負向回歸；移除DEV-097的防執行者作弊要求。未來若入口、主要動作、exact artifact或readback缺失，仍以產品案例FAIL處理。

  - 重開開發範圍：

    | Phase／優先級 | 開發事項 | 完成條件 |
    |---|---|---|
    | R1／P0 | Drawing canonical「進版」接回既有變更影響／FFF／affected Parts／replacement Part流程；首版建立不適用FFF；`/numbering/revisions`頁面與導覽直接刪除，不保留轉址或平行current流程。 | server只以`predecessor_revision_id`判定適用性：`NULL`首版只顯示中性「關聯料號」且不建立FFF evidence；非`NULL`進版才要求三軸明確判定、受影響料號與replacement snapshot，owner與reviewer只面對一套current work／review authority，核准只formalize一次。 |
    | R1／P0 | 依2026-08-27使用者決策退役`/numbering/tasks`獨立頁面、元件、sidebar／dashboard入口與page-level allowlist；既有task／notification API、repository與permission capability保留供其他流程使用。 | 正式UI無「待辦與通知」入口，直接URL為unmatched route／404且不轉址；後端排序、處理狀態、通知read／handled與既有caller仍可獨立驗證。 |
    | R1／P0 | 恢復Drawing／Part正式作廢的申請、審核、拒絕／核准與依賴快照；standalone製造圖影響分析頁、API、權限與repository能力全部退役。 | Drawing與Part皆無直接繞過審核的current writer；核准、拒絕、重試與併發均原子且可追溯。root作廢入口不在本期。 |
    | R1／P0 | 將Part `material`、`color`、`surfaceTreatment`、`variantNote`接入canonical work、review snapshot與formalize；legacy direct PUT固定410 zero-write。 | owner編輯、reviewer唯讀快照、退回／取消／核准與正式資料一致；legacy path不可造成review外寫入。 |
    | R2／P1 | Drawing歷史每列可開啟exact revision artifact與受控檔案，不再只顯示純文字歷程。 | revision identity、檔案集合、hash與預覽一致；缺檔或錯binding fail closed，不回退latest。 |
    | R2／P1 | Drawing work file由只有上傳補齊逐檔下載、移除誤上傳、metadata與進度／錯誤狀態。 | owner可安全管理非primary工作檔；reviewer保持唯讀，所有操作綁exact work/file-set並有補償與readback。 |
    | R3／P2 | Drawing／Part drawer的關聯矩陣identity可導回對應Drawing或Part，並處理未儲存矩陣變更。 | 鍵盤／滑鼠皆可導覽；dirty時明確儲存、捨棄或留在原頁，不靜默遺失。 |
    | R3／P2 | 恢復domain探索控制：Drawing目的／系列、Part料件類型／系列／材質／顏色、文字搜尋、排序切換及雙向cursor換頁。 | filter/search/sort先於pagination，Back／Forward與reload穩定，無漏列、重複列或stale response覆蓋。既有狀態filter替代決策不回復。 |

  - 2026-08-27 FFF適用性 Human Confirmed 矯正：
    - 真正業務判定固定為「是否存在可比較前版」，不是前端猜測版號。`drawing_revision_claims.predecessor_revision_id IS NULL`為首版，API投影`changeImpactRequired=false`；非`NULL`為進版，投影`changeImpactRequired=true`。不得以`revision === '0.1'`、layer或畫面來源替代server authority。
    - 首版work payload不得新建`changeImpact`；既有open首版若已含預設FFF，只在read/update/submit相容層視為不適用並排除，不批次回填、不改approved history。首版submit／return／approve只處理Drawing、受控檔案、辨識與一般review，不建立FFF assessment、replacement、BOM reconfirmation effect，也不把`changeImpact`寫入revision policy snapshot。
    - 進版work保留direct relation fingerprint與affected Parts authority，但draft三軸初始必須是「未判定」，不得把缺值正規化為`no_impact`。Form／Fit／Function均完成後才可送審；任一軸為條件相容或不相容時原因分類必填，不相容另需合法replacement。正式assessment／approved snapshot仍只保存三種既有終態，不新增DB enum或constraint。
    - owner首版workspace在「版次與檔案」後只顯示compact中性「關聯料號」，不顯示`FFF／變更影響`、綠色勾選或internal `not_specified`；進版workspace才在原位置顯示「判定範圍」與FFF表單。reviewer沿用同一骨架：首版無FFF，進版顯示exact immutable snapshot。
    - API／DTO需分離`relatedParts`與`affectedParts`，並由server提供`changeImpactRequired`；relation scope stale仍在進版submit fail closed。schema／migration／production backfill=`none / not required / not authorized`。
    - 本矯正重用`QA-087-187..192`與UI-only `D01..D06`，current分母仍為94案＋3 Quality Gates；所有既有FFF/browser/G4 PASS只作修正前回歸基線，fresh矯正證據完成前不得恢復`RD Product Implementation Complete`。

  - 明確排除：本次不處理`part_root`搜尋結果自己的明細與動作、不新增root狀態／阻擋原因／整體新增或作廢影響；不恢復DEV-090已退役的Relation工作／送審／樹狀編輯、不恢復DEV-095／096已退役的`/bom/new`、CAD／XLS／from-assembly入口，也不恢復DEV-087已正式退役的status URL、withdraw或publish。
  - Spec Impact：`Compatible exception + implementation correction / Existing authority intent preserved`。既有DEV-087 single-current-state、DEV-090 direct relation、FFF domain evidence與formal-obsolete approval仍是唯一authority；本次只補完整journey、JSON snapshot、read model、route fence與UI wiring，沒有第二套current state。
  - ADR 判定：`No New ADR / Existing ADR remains Accepted`。沒有新增current authority、branch／review語意或資料保留決策；若實作發現必須新增table／migration、永久雙寫、另一套review request或root能力，立即停止並重新做ADR。
  - 文件／產品成熟度：`Local RD/QA-QC Complete / Human Confirmed / 94 of 94 Product Cases + 3 of 3 Quality Gates PASS / Production Release Gated`。父DEV風險維持`High / P0`；缺獨立QC或actual AT收據不再是本機完成阻擋。fresh completion證據為`output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-27T19-11-41-680Z/manifest.json`與`.ai-doc/qc/qc-dev-087-trusted-solo-local-completion-2026-08-28.md`。schema／migration／primary canonical invariant不變，未stage／commit／merge／PR／deploy／release。

  - 2026-08-26 RD矯正：在既有矩陣button contract上新增server-projected exact `detailHref`，Drawing固定選canonical production row、Part選formal row；Drawing／Part drawer均傳入callback並先套matrix dirty discard/stay guard，再以history-preserving navigation開啟exact detail。SQLite repository 38 checks、typecheck及contract capability lane已通過。
  - 2026-08-26 repository／negative corrective implementation：任務中心排序改由共用`risk → dueAt → createdAt → id`契約且保留company欄位；Drawing歷史在active binding缺asset／deleted asset時回`HISTORY_REVISION_FILE_UNAVAILABLE`，禁止latest fallback；signed cursor除驗signature/filter/version外亦重驗anchor identity尚存在；Drawing series與Part material／color filter改用實際schema及完整重複placeholder綁定；Drawing change-impact read→update可接受但不信任derived outcome；confirmed replacement在核准交易內exactly-once formalize到`part_replacement_links`；正式作廢申請與核准前均重算dependency fingerprint；SQLite與PostgreSQL的approval decision／apply統一在單一transaction，stale fingerprint不得留下partial decision/request write。
  - 2026-08-26 current evidence：fresh G0-A、contract、repository與negative lane在`output/qa/dev-087-capability/`均已產生v2 manifest；repository `25/25 PASS`、negative `6/6 PASS`、FAIL/NOT_RUN皆為0。repository以23個case-specific isolated fixtures加202／206兩個actual route zero-write probe覆蓋25案；negative以actual route、deleted history asset、primary work-file remove、cursor faults及8-family roster removal probes覆蓋6案。fresh aggregate可依序通過G0-A、contract與repository，但在browser lane以91案NOT_RUN fail closed，故overall 104案仍不得計為PASS、`completionCandidate=false`，negative standalone PASS亦不得冒充同一parent aggregate child。primary schema／canonical identity／master counts／migration residue／root reference／FK在驗證前後相同；既有task-owned之外的local dev runtime仍在port 3000持有primary SQLite，raw file hash不列為本輪不變宣稱。本任務未停止該runtime。
  - 2026-08-26 completion disposition：撤回2026-08-25 final QA closure。current aggregate必須停在第一個不完整product lane並輸出`completionCandidate=false`；G4 225～228維持Not Verified。QA主管重新審查須等raw repository／fault／browser／PostgreSQL／security／visible-a11y證據補齊。

  - 2026-08-27 RD completion checkpoint：
    - 產品修正包含PostgreSQL `JSONB` approval payload物件解析（避免解析失敗被靜默改成`{}`而誤判`LIFE_OBSOLETE_SNAPSHOT_STALE`）、PostgreSQL reviewer query／nullable preview query、legacy Drawing change-impact hydration、task／notification錯誤可視化，以及G4角色登入、formal fixture隔離與server log證據。
    - `output/qa/dev-087-capability/DEV087-product-g4-postgres-2026-08-26T16-59-16-316Z/manifest.json`：business-only 6/6 PostgreSQL PASS，transaction isolation均為`repeatable read`，12條mutation ledger、primary invariant與cleanup PASS；該診斷模式只因刻意未跑security／visible而overall FAIL。
    - `output/qa/dev-087-capability/DEV087-product-g4-postgres-2026-08-26T17-02-30-251Z/manifest.json`：6/6 PostgreSQL、8/8 security zero-write、32/32 family-viewport、16 headed、12 mutation ledger、primary invariant與cleanup均PASS。其overall FAIL來自舊`QA-087-228` Independent AT契約，自2026-08-27起只作Historical Anti-cheat Evidence，不再是DEV-087完成阻擋；產品與資料斷言仍可作新契約重跑前的回歸參考。
    - QA fixture規則新增「互相有狀態副作用的formal Drawing／Part案例不得共用同一target」；QA-087-199使用`A0002-M01`，QA-087-201改用未連到該圖的`A0002-P47`，避免前案把後案轉成`MainDrawingInvalid`後造成假失敗。
    - 2026-08-27 fresh browser audit在`DEV087-product-browser-2026-08-26T17-22-19-705Z`發現raw UI child雖有1筆`net::ERR_NO_BUFFER_SPACE`，仍因status公式未納入`consoleErrors`而自報PASS；外層capability正確以`UI_UNEXPECTED_ERROR_PRESENT`攔下。runner已改為`failures`或`consoleErrors`任一非空即raw FAIL，contract亦固定檢查此fail-closed條件；該次34/34 business journey通過仍不得當作clean browser PASS，需以穩定環境fresh重跑。
    - primary protected invariant固定為schema `2a26e5fa...d07e`、canonical identity `ba12f2a5...4141`、roots/parts/drawingNumbers/drawings=`59/59/50/53`、unresolved residue/root-reference/FK=`0`；因另一個既有runtime可寫非保護列，raw byte hash僅觀察、不取代上述hard gate。

  - 2026-08-28 trusted-solo local completion：
    - fresh parent aggregate=`output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-27T19-11-41-680Z/manifest.json`，SHA-256=`B063307F1BB5B32DD95E1B651CE87C7BCA28721F2F725B8327DE8FA4B6E139EC`；21/21 commands、94/94 current product cases、3/3 Quality Gates均PASS，`completionCandidate=true`，來源指紋=`fd9f45e792be8275e0e1e4fb92171bf861b86414d0712ab30146594e8a6e8e14`。
    - FFF矯正已按Human Confirmed契約落地並由`QA-087-187..192` fresh驗證：server只依`predecessor_revision_id`；首版zero FFF且只顯示中性`relatedParts`，進版才投影`changeImpactRequired=true`、分離`affectedParts`並要求三軸人工明確判定。未新增ADR、schema、migration或backfill。
    - browser capability=`DEV087-product-browser-2026-08-27T19-15-25-308Z` PASS；UI-only單次fresh attempt為34/34 cases、11/11 C gates、42/42 infrastructure，Part attachments、inline matrix與功能案例由同一parent的受控children補齊。PostgreSQL G4=`DEV087-product-g4-postgres-2026-08-27T19-33-06-736Z` PASS：6/6 provider、12筆成功mutation receipt、8/8 security zero-write、32/32 family-viewport，1440×900與390×844為headed。
    - DEV-100 fresh 18/18、DEV-092 fresh browser 21/21、DEV-094 CAPA/browser、retirement、zero-loss、file-read、typecheck與isolated build均在同一parent chain PASS。主SQLite protected schema／canonical identity／counts／migration residue／root reference／FK前後一致；raw byte hash只作另一個既有port 3000 runtime可能寫入非保護列的觀察值。本任務所有task-owned ports與暫存路徑均已釋放／移除，未停止或改動port 3000 owner。
    - DEV-097維持`Skipped / Historical Supporting`，不阻擋DEV-087；`part_root`搜尋結果自己的明細／動作、root狀態／阻擋原因及root整體新增／作廢影響仍是明確排除。production、stage、commit、merge、PR、deploy與release均未執行。

  - RD Implementation Ready 封口（2026-08-25）：
    - schema／migration=`none`。沿用`drawing_revision_works.proposed_payload`、`pdm_work_review_requests.snapshot_payload`、`drawing_revisions.policy_snapshot_json`、`drawing_revision_fff_assessments`、`part_number_drafts`、`part_replacement_links`、`part_change_works.proposed_payload`、`part_approved_change_snapshots`、`part_variant_attributes`、既有numbering task／notification與approval tables；不得以本任務新增migration。
    - transaction owner固定：Drawing canonical submit準備FFF／replacement暫存並建立同一transient review；return清除該cycle的FFF／replacement暫存後解鎖原work；approve在同一DB transaction內重驗snapshot與affected-Part fingerprint、formalize replacement impact、formalize Drawing、寫minimal receipt。不得呼叫舊submission或舊review action形成第二次審核。
    - legacy fence固定：`/numbering/revisions`頁面、導覽、權限映射與現行caller全部刪除，直接請求為unmatched route／404，不保留相容轉址；舊drawing submission／FFF／review mutation回`410 DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED`；`PUT /api/parts/[partNumber]/variant`回`410 PART_VARIANT_DIRECT_WRITE_RETIRED`；`applyInvalidation=true`回`410 MAIN_DRAWING_DIRECT_INVALIDATION_RETIRED`。三者皆在auth/company guard後zero-write，不採「可拒絕或可委派」的模糊雙模式。
    - formal obsolete固定：Drawing production／Part formal idle row新增server descriptor `request_obsolete`，先讀個別object dependency snapshot，再以`POST /api/lifecycle/obsolete-requests`建立既有approval；只有`entityType=drawing_number|part_number`保存並重算fingerprint，不一致回409且zero-write。shared route既有`part_root`handler／payload／approval行為原樣保留但不接入新DTO、fingerprint或UI；Drawing RD branch仍走`void_rd`。
    - list wire固定加入repeated `purpose`／`series`／`itemKind`／`material`／`color`、`sort=asc|desc`、signed cursor v2 direction與`previousCursor`；Drawing series定義為同root Part的`series_code`，Part material／color定義為`part_variant_attributes` code，filter/search/sort全部先於group pagination。
    - UI ownership固定：canonical Drawing editor內新增FFF／affected Parts／replacement區，不複製整個舊進版頁；`/numbering/tasks`獨立頁面、sidebar／dashboard入口與page allowlist已退役，task／notification API只保留為其他流程的後端能力；formal obsolete使用drawer modal；history在原drawer內開exact revision唯讀子視圖；file管理留在Drawing full-page workspace；matrix identity沿用`RelationMatrixTable`既有callbacks並套dirty guard；清單換頁採shared controller的`server-bidirectional`模式。
    - query budget：canonical list在現有identity／row／count／preview查詢之外，filter options最多`+1` batch、previous-page existence不得N+1；Drawing/Part list hard cap各`<=8`（無preview）／`<=10`（有preview），detail維持既有hard cap，history exact detail`<=6`，task＋notification各單次list不得per-row query。若量測超標，先batch／CTE修正，不自行加index；若既有index不足才停止回PM重做migration preflight。

  - Historical exact implementation map：

    | Phase | Existing authority／修改檔 | 新增檔／route | 必須退役或改寫 |
    |---|---|---|---|
    | R1-A Drawing impact／FFF | `src/lib/drawing-revision-work-payload.ts`、`src/lib/drawing-revision-work.ts`、`src/lib/repositories/drawing-revision-work-async-repository.ts`、`src/lib/pdm-change-control-domain.ts`、`src/components/canonical-drawing-change-workspace.tsx`、`src/lib/repositories/pdm-work-review-async-repository.ts` | `src/lib/drawing-change-impact.ts` | `src/app/numbering/revisions/page.tsx`與側欄入口直接刪除，現行href／permission／task allowlist歸零；`src/app/api/numbering/drawing-revisions/submissions/route.ts`、`fff-assessments/route.ts`與`src/app/api/numbering/reviews/[reviewId]/*/route.ts`的legacy mutation固定410／caller=0。 |
    | R1-B task／notification | `src/lib/repositories/numbering-async-repository.ts`、既有tasks／notifications API與`src/lib/numbering-task-center-contract.ts`後端排序／安全action契約 | 無 | 刪除`src/app/numbering/tasks/page.tsx`、`src/components/numbering-task-center.tsx`、sidebar／dashboard入口、navigation permission map、production open-page path與退役route action allowlist；`scripts/qc-pdm-numbering-task-center-ui.mjs`固定驗證頁面退役且API仍受權限保護。 |
    | R1-C formal obsolete | `src/lib/numbering-async.ts`、`src/lib/repositories/numbering-async-repository.ts`、`src/app/api/lifecycle/obsolete-requests/route.ts`、`src/lib/pdm-canonical-workbench-state.ts`、`src/lib/pdm-dev087-route.ts`、`src/components/canonical-pdm-workbench.tsx` | `src/app/api/lifecycle/obsolete-impact/route.ts` | standalone頁面、`src/app/api/numbering/impact-analysis/route.ts`、舊permission與repository direct mutation全部移除；正式作廢只走fingerprint-gated request／approval。 |
    | R1-D Part variant | `src/lib/repositories/part-change-work-async-repository.ts`、`src/lib/part-change-work.ts`、`src/components/canonical-change-workspace.tsx` | 無 | `src/app/api/parts/[partNumber]/variant/route.ts`的PUT固定410；`upsertPartVariantAttributesAsync`不得再有current UI caller。 |
    | R2-A history | `src/lib/pdm-canonical-workbench.ts`、`src/lib/pdm-canonical-workbench-contract.ts`、`src/components/canonical-pdm-workbench.tsx`、single file-read／preview authority | `src/lib/pdm-canonical-drawing-history.ts`、`src/app/api/numbering/drawings/[drawingId]/history/[revisionId]/route.ts` | 歷史開啟不得改用current row detail或latest fallback。 |
    | R2-B work files | `src/lib/drawing-revision-work-file.ts`、`src/lib/drawing-revision-work.ts`、`src/components/canonical-drawing-change-workspace.tsx` | `src/app/api/pdm/drawing-revision-works/[workId]/files/[fileBindingId]/route.ts` | current fetch serial upload改為逐檔狀態與byte progress；primary／locked file remove一律409。 |
    | R3-A matrix nav | `src/components/relation-matrix-table.tsx`、`src/components/canonical-pdm-workbench.tsx` | 無 | 只接現有`onOpenDrawing`／`onOpenPart`；不得新增Relation owner頁或root drawer。 |
    | R3-B discovery／cursor | `src/lib/pdm-canonical-workbench-contract.ts`、`src/lib/repositories/pdm-canonical-workbench-async-repository.ts`、`src/lib/pdm-canonical-workbench.ts`、`src/components/canonical-pdm-workbench.tsx`、`src/components/use-pdm-workbench-controller.ts` | 無 | `載入更多`append模式退役；cursor v1拒絕／受控reset，不得client-side filter或先分頁後刪列。 |

  - Payload／DTO contract：
    - Drawing work的`changeImpact`固定為`{schemaVersion:1, affectedPartNumberIds:string[], formState, fitState, functionState, reasonCategory, note, replacement}`；三個FFF值只允許`no_impact|suspected_impact|confirmed_impact`，server依最高風險推導outcome。`replacement`只在confirmed時存在，包含`sourcePartNumberId`、`reservedPartNumber`、`itemType`、detected／corrected number與既有replacement attachment snapshot；unknown key、跨root／company、非candidate Part或outcome不相符回422／409。
    - Part work payload固定增加`materialCode`、`materialLabel`、`colorCode`、`colorLabel`、`surfaceTreatment`、`variantNote`六個nullable storage欄位，UI呈現四項業務控制；before／after snapshot、base hash與formal upsert都包含六欄，附件仍排除。
    - history entry增加`detailHref`與exact `revisionId`；history detail只回該revision identity、preview slots與`CanonicalDetailFile[]`，無actions。work file DTO增加`fileSize`、`mimeType`、`contentHash`、`downloadHref`、`canRemove`、`removeBlockedReason`與upload terminal state。
    - obsolete impact DTO固定`{entityType, entityCode, dependencies, fingerprint, pendingRequestId}`；request必帶同一fingerprint與idempotency key。list DTO固定同時回`nextCursor`、`previousCursor`與company-scoped `filterOptions`；cursor hash涵蓋domain、query、所有filter、sort、company與limit。

  - Phase gate／QA handoff：
    1. `R1-A` exit=`QA-087-187..192 focused PASS`且legacy Drawing writer scan=0；否則不得開始會寫正式資料的R1-C／D整合測試。
    2. `R1-B` exit=`QA-087-193..197 focused PASS`：193驗證頁面／元件／入口／page allowlist刪除與直接URL 404；194～197改由repository／API驗證task排序、exact identity、通知read／handled與empty／failure差異。`dueAt`只由validated `detail.dueAt`投影，不新增欄位。
    3. `R1-C／D` exit=`QA-087-198..206 PASS`、202／206 zero-write、dependency／snapshot stale全部409；P0全PASS才可進R2。
    4. `R2` exit=`QA-087-207..211 PASS`，exact history與file bytes/hash無fallback，primary與reviewer mutation均被拒絕。
    5. `R3` exit=`QA-087-212..218 PASS`，包含四viewport／keyboard／a11y與功能負向回歸。
    6. Final跑current 51-case固定名冊、C01～C11與QA-087-187..218，得到94/94產品案例；再執行`QG-087-PROVIDER`、`QG-087-SECURITY`、`QG-087-UI`、typecheck、affected lint、isolated build、primary invariant before/after與task-owned cleanup。舊`qa-integrity`、mutant、artifact hash chain與Independent AT receipt不再是completion前置。

  - Dirty worktree boundary：readiness基準為branch`持續優化2`、HEAD`818db82ad9f47e938be15c3ded21ff88f7e3ea07`。`package.json`、`scripts/qc-dev-087-commands.mjs`、canonical workbench contract／service／component、Drawing workspace／work service／repository與`numbering-async-repository.ts`在盤點時已有modified hunks；另有未追蹤Drawing work file route/module。RD必須先保存`git diff --numstat`與逐檔hunk hash，只擁有本次新增hunks，不得reset、整檔覆寫或把既有dirty內容算成R1～R3證據。

  - 問題與使用者價值：
    - 現況同時存在資料狀態、生命週期、人類狀態、責任狀態、可用範圍與版本列，server 與 UI 又二次合成，造成同一列可能同時顯示「研發最新版」與「量產版可使用」。
    - 頂部「工作狀態／資料狀態／版本列」看似同一類篩選器，實際分別代表不同軸；人類無法用相同詞彙掃描、比較與直接篩選。
    - 根因不是文案太多，而是目前狀態 authority 被拆散在多組欄位、resolver與相容 projection，導致相同事實能產生不同狀態。只換 UI 名稱仍會留下錯誤資料源與再發風險。
    - 最終目標是重建乾淨、唯一、可由 command 原子維護的 workbench state；approval、release、revision、attachment 等業務證據可保留為各自 domain record，但不得再各自充當工作臺「目前狀態」authority。

  - Clean State Data Target（第一性原理；Relation 條款已由 DEV-090 取代）：
    - 一筆工作臺狀態只回答三件事：`哪個 canonical entity`、`哪一條 lane／revision`、`目前由哪個角色處理或是否受阻`。其餘資料是 domain evidence，不是另一套 current status。
     - 新 authority正式table名為 `canonical_workbench_states`。Drawing production唯一鍵為`company + drawing + production`，Drawing RD唯一鍵為`company + drawing + branch_id`，因此可有一列production與0..3個open branch latest；Part維持`company + part + data_layer`，最多一列formal與一列work；Relation不建立current workbench row，正式矩陣由`drawing_part_links`維護。
    - open branch hard cap=`3`，包含active與approved-idle branch；新branch建立須鎖定`company+drawing`aggregate並在同一transaction重新計數，第四個新branch回`DRAWING_RD_BRANCH_LIMIT_REACHED`且不得留下claim/work/state。既有branch進版不消耗新名額。
    - `pdm_workbench_aggregates`提供每個`company+drawing`的stable lock row並原子維護`open_branch_count=0..3`；PostgreSQL使用`FOR UPDATE`，SQLite使用write transaction。first-work cancel若branch尚無approved revision，必須刪除空branch並遞減count；已有approved revision的next-work cancel則回到原idle branch，不減count。
    - 最小 canonical 欄位方向：entity identity reference、domain data layer、hidden Drawing `branch_id`、exact revision/work reference、`handling=none|owner|review_owner|system|system_admin|blocked`、可選human blocker reason與concurrency/version。每個Drawing revision另保存exact predecessor，target revision以`company+drawing+revision`全域原子claim；branch/source/predecessor不進UI。
     - current work authority固定為`drawing_revision_works`與`part_change_works`兩張專用table；`relation_change_works`僅作DEV-090 migration source，activation後退役。legacy `numbering_draft_workspaces`只作migration source，不得在新runtime承擔read/write authority。每branch／part只能有一份active current work；正式ambiguous source進阻擋清單並要求唯一人工mapping，本機舊graph可在canonical hash不變後清除。
    - `production` row只能由approved且production-effective transaction建立或切換；Drawing RD row可指向active work或approved idle branch latest。promotion成功必須在同一原子邊界切production並將實際來源branch移入歷史；失敗不得覆蓋既有production，且不得移除其他無關RD branches。
     - DEV-087所有 Drawing／Part create-work／edit／submit／return／approve／formalize／cancel／branch-void／retry command都必須由server transaction更新domain evidence與canonical state；Relation改依DEV-090單次矩陣儲存直接更新正式資料，不建立第二個人類publish動作或review command。既有其他domain obsolete／merge流程只能經其原authority驅動canonical terminal移除，不納入本DEV另造command；client、list resolver與filter不得推測或修補current status。
     - Drawing核准版保留完整controlled history；Part核准變更保留完整before/after snapshot；既有Relation核准snapshot只作歷史唯讀證據，DEV-090新儲存不產生snapshot。每次reviewer按下核准或退回只保留backend-only `review_cycle_id + entity reference + decision_at` minimal trace；開頁／送審不計次，cancel後trace仍保留。
    - 最終退役範圍包含舊 current-status 欄位、derived projection authority、legacy filter vocabulary與fallback。退役必須在新舊資料全量reconciliation、read cutover、write cutover及rollback gate通過後執行；不是只把舊欄位藏起來。

  - Migration Direction：
    1. `Inventory`：列出所有舊狀態欄位、enum、table、DTO、resolver、filter、URL相容值、寫入command、資料量與consumer；分類為domain evidence、current-state authority、derived compatibility或dead state。
    2. `Canonical model`：以ADR固定唯一狀態聚合、欄位、enum、唯一鍵、transition、concurrency、transaction與failure semantics；禁止再新增平行 projector。
    3. `Shadow build`：先在disposable SQLite／PostgreSQL建立新模型及deterministic offline converter；不得建立永久dual read/write。
    4. `Reconciliation`：對全量資料產出source/target count、identity hash、unmapped、duplicate、invalid branch/reference、duplicate target claim、production-without-approved evidence、work-without-owner與檔案／預覽hash；ambiguous不得猜latest。正式環境每筆須有唯一target或人工mapping receipt，mapping清單清空、unresolved=0且reconciliation=100%；禁止捨棄或retained legacy source。
    5. `Cutover`：先freeze外部寫入、drain舊web/worker/scheduler，完成DB/schema/binding backup與restore drill後，在maintenance window以singleton authority control綁定exact commit/schema切single command/read/filter/UI authority；舊build/client與legacy fallback一律fence。
    6. `Retirement`：allowlisted command/browser/exact artifact smoke與backup verification通過後，於同一maintenance window立即drop已驗證的舊current-state欄位／table、projector、filter與adapter；再次canonical-only gate PASS才開放流量。開放前失敗以RPO=0 DB/schema/binding backup＋application/control restore；若發現未核准外部寫入則禁止自動restore。pre-migration relational backup驗收後低成本保留90天，到期刪除仍須核准。未核准physical bytes僅在零有效引用、approved-artifact guard與canonical-only gate全通過後永久刪除，明確不提供備份回復功能。

  - Transition Exit／Anti-Forgetting Gate：
    1. 過渡期只允許`legacy_only`、隔離`shadow_compare`、受控`cutover_window`與最終`canonical_only`；禁止production dual authority／dual write、legacy fallback與無期限shadow。
    2. Phase 1A必須建立`.ai-doc/qa/dev-087-old-authority-inventory.schema.json`與`.ai-doc/qa/dev-087-old-authority-inventory.json`；每個舊table／column／enum／projector／resolver／filter／URL／API／UI consumer都有owner、唯一處置、retirement phase與verification，unknown／unowned均為0。
    3. Phase 1D必須實作`npm run qc:dev-087:retirement`，聚合驗證舊schema active read/write=0、舊projector/runtime registration/import=0、舊API／URL／flag／resolver／fallback=0，以及retired schema receipt與protected evidence hash未變。
    4. RD產出inventory與retirement manifest並完成移除；同一執行者可完成QA負向注入、fresh-session continuation與QC聚合gate；Dev PM與release owner在任何產品、資料或cleanup證據缺漏時不得把DEV標為complete／handoff ready／release ready。
    5. retirement manifest固定為`output/qa/dev-087-retirement/<run-id>/manifest.json`並由`.ai-doc/qc/qc-dev-087-retirement-<date>.md`記錄path/hash；至少綁定inventory hash、exact commit、schema hash、provider、removed／preserved item、scan結果、schema receipt、smoke與rollback evidence。
    6. `npm run qc:dev-task-completion-audit`必須消費上述summary/manifest；缺檔、hash/commit/schema/provider不符或gate非PASS一律標`Retirement Pending`。
    7. 清除舊架構是DEV-087同一Definition of Done，不另開follow-up DEV、future capsule或「之後再做」清理。只有`canonical_only + retirement PASS`或完整rollback至`legacy_only`兩個合法出口。
    8. fresh-session AI只讀`cold-start → DEV-087 index → direct authority docs`即須正確指出transition mode、未清項與下一gate；不得依賴對話記憶。讀不到retirement evidence時必須fail closed，不得宣告完成。

  - Human Confirmed UI Information Contract：
    1. `編號`（高）：圖號工作臺顯示圖號、料號工作臺顯示料號、圖料工作臺以圖料根號為主識別並保留必要關聯編號層級。
    2. `品名`（高）：只顯示單行品名；不得追加變更摘要、處理人、日期或狀態說明第二行。
    3. `資料層／版次`（高）：圖號擁有版次，顯示`量產版 {revision}`／`研發版 {revision}`；料號沒有版次，顯示`正式資料`／`修改中`；圖料根號沒有版次，顯示`正式關聯`／`調整中`。後兩者不得出現數字版次或被稱為量產版／研發版。清單契約已保證每個資料層只投影目前資料，因此 UI 不重複顯示「最新版」。
    4. `處理狀態`（高）：正常、無須處理時留空；需要處理時只顯示固定角色語意，不依登入者改寫成你／我／他。
    5. `受阻原因`（中）：清單只顯示`受阻`；既有明細摘要可顯示一項人類可理解的原因，不顯示 raw code、技術狀態鏈或多項診斷卡。
    6. 低重要性狀態資訊為零：低重要性資訊全部不進 UI，不建立欄位、badge、第二行、tooltip、popover、filter 或獨立卡片承載。

  - 唯一處理狀態語彙：
    - `負責人處理`
    - `審核負責人處理`
    - `系統處理`
    - `系統管理員處理`
    - `受阻`
    - 上述五項與空白正常態是三工作臺 list、filter、shared drawer header 與同一資料列其他狀態摘要的唯一可見 authority；不得另顯示「待你處理／待我處理／待他人處理」。

  - Human Confirmed Drawer Contract（2026-08-22 amendment）：
     - Drawing／Part使用同一個快速查閱骨架；順序為`主識別／品名／處理狀態` → `主要內容／預覽` → `關聯矩陣` → `直接關聯` → `受阻資訊（條件式）` → `歷史版次（僅圖號）` → `動作區`。圖料根號不再有獨立drawer owner surface；root矩陣嵌入Drawing／Part抽屜。不同階段只改變處理狀態、受阻資訊與可執行動作，不重排抽屜。
     - 抽屜不承載既有版本、料號主資料或Relation mutation form；Drawing／Part主資料編輯與審核仍導向各自canonical full-page workspace，矩陣則在drawer以單次儲存直接更新正式關聯。「進版」是由目前圖號建立新版本的導覽入口，不是修改目前版本。
     - 圖號抽屜顯示圖號、品名、`量產版 {revision}`／`研發版 {revision}`、必要時的處理狀態、2D／3D 預覽、目前版受控檔案、關聯矩陣、直接關聯、受阻資訊與歷史版次。歷史版次固定呈現清單，每列只呈現版次與版本列；開啟後只能查看該版預覽／檔案，不得修改歷史版。
     - 料號抽屜顯示料號、品名、`正式資料`／`修改中`、必要時的處理狀態、料號基本資料、料號自身附件、關聯矩陣、直接關聯與受阻資訊；不得顯示料號版本或歷史版次。相關圖號可顯示自己的版次，但該版次明確屬於圖號。
     - 圖料根號不顯示獨立清單／抽屜、版本、歷史版次、直接關聯或「共同檔案／圖料層直接管理的檔案」；root identity只可由編號搜尋辨識，關聯矩陣由Drawing／Part drawer提供。
     - `直接關聯`只屬圖號／料號抽屜；圖號列出直接關聯的圖料根號與料號，料號把既有「圖號關聯」與「所屬圖料根號」合併。矩陣是另一個正式關聯區段，不另建Relation工作台同義區塊。
    - 三抽屜都具備相同受阻區；只有 canonical handling=`blocked`時顯示一項人類可理解的原因，不顯示 raw code、診斷鏈、處理人或日期。受阻時不提供「前往處理」或恢復操作。

  - Drawer Stage／Action Contract：
    - `handling=none`：處理狀態留空；符合建立工作資料條件時，圖號顯示`進版`、料號正式資料顯示`建立修改`、圖料正式關聯顯示`建立調整`。
    - `handling=owner`：顯示`負責人處理`；只有存在真實 domain owner workspace 時顯示`進行編輯`。
    - `handling=review_owner`：顯示`審核負責人處理`；只有存在真實 review workspace 時顯示`前往審核`。
    - `handling=system`：顯示`系統處理`；動作為無。
    - `handling=system_admin`：顯示`系統管理員處理`及資訊`請系統管理員處理`；動作為無，不顯示`前往恢復`。
    - `handling=blocked`：顯示`受阻`與一項原因；動作為無。
    - Drawer action owner每次最多一個 primary action。Drawing RD idle是唯一例外，可另顯示一個視覺降階、與主要`進版`分離的次要風險action `申請作廢`。動作不適用時省略；不得以無 endpoint、無 permission 或無真實 command 的假 CTA 取代資訊提示。
    - 動作由server descriptor依既有permission/company boundary決定，不新增角色：Manufacturing同公司可看量產列與最多3個研發列但全部無mutation；owner依action permission處理自己的work；具`hasPdmNonOwnerEditScope`且通過action permission與lifecycle gate的同公司使用者可處理非本人work；exact reviewer只在canonical request route核准／退回；其他non-owner唯讀；cross-company不hydrate list/drawer/artifact/request。
    - action ownership固定為list開drawer、drawer開target modal、modal確認建立work並導航editor；超過5秒顯示進行中且禁止重送，失敗保留modal並focus error，取消／Escape回原row並恢復focus/scroll。

  - Drawing Revision Entry Contract：
    - `進版`只屬圖號，可從production與RD row進入；同一branch最多一份active work，不同branches可並行，但同一圖號最多3個open branches。達cap時production的新branch入口停用並顯示`已有 3 個研發分支，請先完成其中一個`；既有branch不受影響。
    - server以revision tuple與exact source回傳推薦候選及manual-minor rule：production 1可選server production 2、推薦RD 1.n，或只輸入同major向前且未占用的manual minor suffix；non-stale RD 1.1可選推薦1.2、較大的未占用manual minor，且base current時才可選production 2。major、完整label與predecessor只由server決定；production target被claim時不得跳到3。
    - 其他branch推進production後，舊base branch仍顯示但一律freeze，不得續recommended／manual minor或升production；UI顯示`量產基準已更新`，只保留查看、申請作廢或從current production另開，backend zero-write fail closed。
    - 使用者確認target時，server須在同一transaction取得`company+drawing+target revision`全域claim、建立／沿用hidden branch、綁exact predecessor並建立work/canonical row，成功後才導航full-page editor。concurrent loser顯示target已占用並刷新候選，不得自動換branch。
    - major target在核准正式化前仍顯示`研發版 {target}`；只有核准成功才切為`量產版 {target}`。未核准取消會刪除work/predecessor/claim並允許revision重用；已核准revision永久不可重用。
    - 新版本以exact來源版的受控檔案建立work-owned副本／引用，後續修改只發生在新版本；來源與歷史版唯讀。核准Drawing永久保留完整controlled files/previews/history。
    - open、idle、latest approved RD且無active work／pending void request時可顯示`申請作廢`；確認後送出exact `branch_void` request，不建立新revision。退回即恢復idle open；核准並system formalize後關閉branch、移除current row、原子遞減`open_branch_count`，該branch不再有current valid revision且不得reopen。approved identity、minimal review trace與controlled artifact持續保留。

  - Human Confirmed Editing Workspace Contract（2026-08-21 amendment）：
    - 拒絕「三工作臺共用編輯頁」：唯讀drawer可以共用shell，但長時間編輯工作必須由Drawing、Part、Relation各自的canonical full-page owner負責。三者只共用返回、未儲存離開保護、permission／blocked guard、儲存結果與單一主要動作等mechanics，不共用可見編輯表單或domain內容。
    - 圖號編輯頁明確列為`Preserve / No Redesign`：沿用目前的版次與檔案、2D／3D大型預覽、智慧辨識、欄位核對、儲存與送審架構；DEV-087只修正workbench／drawer入口、來源／目標版次與人類狀態接線，不得藉狀態整頓重構現有圖號編輯版面、辨識流程或component ownership。
    - 圖號量產列以`進版`選擇下一量產版或下一研發版後進入現有圖號編輯頁；圖號研發列以`進行編輯`回到同一現有編輯頁。來源與目標revision必須exact傳遞，不能另開第二套簡化編輯器。
    - 料號正式列顯示`正式資料`並以`建立修改`建立唯一未生效工作資料；料號工作列顯示`修改中`並以`進行編輯`進入料號主資料編輯頁。正式資料在審核核准前持續供生產使用，不得被未完成修改覆蓋；同一料號不得同時存在兩份current修改中資料。
    - 料號編輯頁只管理料號自身主資料欄位，例如品名、規格、材質、顏色、表面處理與現行必要屬性。Part附件由DEV-087直接定義為獨立即時生效，沿用現行附件authority，不納入修改案／審核snapshot／active-review lock／取消rollback；reviewer看到當下live附件清單及review-only提示`附件獨立維護，不屬於本次資料核准`。料號與圖料根號識別唯讀；直接關聯只供查閱，不可在此頁增刪。料號沒有版次、歷史版次或進版動作。
    - 料號欄位預設只顯示一份可編輯值；欄位變更後才在該欄位附近顯示原正式值，未變更欄位不得永久重複正式／修改中兩欄。首次建立且沒有正式資料時不顯示比較資訊。
    - 圖料正式列顯示`正式關聯`並以`建立調整`建立唯一未生效關聯工作資料；圖料工作列顯示`調整中`並以`進行編輯`進入關聯樹編輯頁。正式關聯在審核核准前持續供生產使用，不得被未完成調整覆蓋；同一根號不得同時存在兩份current調整中資料。
    - 圖料編輯頁以`root → drawing → part`關聯樹為主要工作物件，只能新增關聯、移除本次關聯、調整現行系統已存在的關聯用途及復原尚未送審的調整；節點旁只以`新增／移除／調整`短標籤呈現本次差異，不建立大型變更摘要區。
    - 圖料編輯頁不得顯示根號版本、歷史版次、共同檔案、圖料層附件、Drawing／Part主資料表單或智慧辨識。若送審包含移除關聯，由送審confirmation surface列出exact被移除圖號／料號；底層頁面不再提供第二個承諾動作。
    - Part／Relation編輯頁的單一primary依狀態切換：有未儲存變更時為`儲存修改／儲存調整`；已儲存且必要資料完整時才切為`送交審核`。三domain review_owner由canonical request route載入與owner相同domain editor components/data/layout但fully read-only；只有DEV-087 Drawing／Part／Relation request decision收斂為`核准／退回修改`，其他approval domain不變。system／system_admin／blocked不提供編輯入口；`system_admin`仍只顯示`請系統管理員處理`。

  - Human Confirmed Review／Formalization／Retention Contract：
    - 編輯者送審後work鎖定且不能取消；reviewer只能核准或退回修改。退回沿用同一work copy並解鎖給owner或具既有non-owner edit scope的同公司協作者，重新送審建立新review cycle。
    - 只有reviewer實際按下核准／退回才計一次review；開頁與送審不計。backend只永久保留`review_cycle_id + entity reference + decision_at`以追溯次數與時間，不保留reviewer/outcome/revision/comment/content，也不進UI。
    - 核准後自動更新正式，沒有第二個人類發布動作。Drawing minor核准只正式化RD並回idle，不改production；major只有current-base guard通過才推進production。async時為`system`且舊正式持續有效；已知安全管理員retry為`system_admin`，無安全路徑為`blocked`。retry只使用exact approved snapshot，禁止重算latest。
    - DEV-087 Drawing／Part／Relation request descriptor只允許`核准／退回修改`；BOM等其他approval domain的既有decision不被移除。reviewer從canonical request route載入相同domain editor components/data/layout的唯讀畫面，不要求與owner URL相同。
    - Part附件依DEV-087自身契約維持獨立即時生效，排除於Part review snapshot與active-review lock，review頁在附件區顯示`附件獨立維護，不屬於本次資料核准`；Drawing受控檔與Relation exact tree仍在lock/snapshot內。DEV-087不得提前建立後續DEV-088尚待縮編的附件binding/version/lease模型、替代料號附件沿用流程或權限重建。
    - Relation reference snapshot drift時技術拒絕核准，review保持`review_owner`，由reviewer決定退回；不得自動merge或自動return。
    - Drawing核准版本永久保留完整受控資料與檔案；Part／Relation每次核准保留backend-only完整before/after snapshot。新未核准work取消會刪work data/file bindings/unapproved revision/predecessor/claim，但保留已產生minimal review trace與所有shared/formal/live attachment引用。
    - legacy migration不得猜測來源；正式環境無法唯一映射的active／cancelled source進阻擋清單，取得唯一人工mapping receipt前不得cutover，且禁止retain/discard flag。本機舊graph則在canonical count／PK／FK／hash不變後清除。physical bytes只有新引用完整、hash相同、零有效引用與approved-artifact guard全通過才永久刪除，不提供備份回復、使用者恢復或UI復原入口。

  - 清單與 lane contract：
    - Drawing同一canonical group顯示0/1列production與每個open branch各一列latest RD（0..3），最多四列；production固定第一，可處理RD其次、idle approved RD最後，整組為單一pagination unit。Part／Relation仍各最多一列formal與一列work。沒有可證明approved／production-effective basis時不得建立正式列。
    - 圖號的人類標籤為`量產版 {revision}`／`研發版 {revision}`；料號為`正式資料`／`修改中`；圖料根號為`正式關聯`／`調整中`。backend可保留production／rd lane作canonical authority，但UI、DOM與accessible name必須使用對應domain語意，不得把料號或根號稱為版本。
    - `已取消／已作廢／已合併`等terminal record不進目前工作臺。新系統未核准取消work依SPEC刪除但minimal review trace保留；本機legacy cancelled source payload已清除。正式環境同類資料須先完成trace／關聯／file reference遷移及逐筆receipt後才可刪old source。已核准Drawing history、Part／Relation approved snapshots仍保留。

  - 篩選器契約：
    - 狀態相關篩選器只保留一個domain資料層篩選器與`處理狀態`；圖號／品名／料號／圖料根號搜尋、系列代號與類型等業務條件不受本 DEV 影響。
    - 圖號使用`版本：全部／量產版／研發版`；料號使用`資料：全部／正式資料／修改中`；圖料使用`關聯：全部／正式關聯／調整中`。選項必須直接對應同工作臺清單可見文字，不能再用共用`版本列`把三domain硬套成相同版本語意。
    - `處理狀態`選項固定為`全部／負責人處理／審核負責人處理／系統處理／系統管理員處理／受阻`，直接對應列上可見文字；row filter只保留exact命中列，不帶出companion production或整組。
    - 移除頂部`資料狀態`與舊混合`工作狀態`選項；不得另建`使用資格`篩選器。既有legacy query不相容，顯示`此篩選網址已失效`並要求返回新工作臺，不得hidden parse或silent fallback。

  - 明確禁止呈現：
    - 變更摘要、變更原因、處理人姓名、assignment 姓名、處理日期、最後更新日期及其清單第二行／明細摘要。
    - `package`、`baseline`、`workflow`、`approval`、raw lifecycle、raw database status、內部 ID、source ID、ledger、effect key 與相同技術語意的中英文變體。
    - 技術證據可保留在後端、log、測試與受控開發文件，但不得出現在三工作臺、shared drawer及三domain owner workspace的人類UI、DOM、accessible name、tooltip、popover、filter option或空狀態文案。

  - Scope：
    - 全面盤點圖號、料號、圖料current status的DB／repository／service／DTO／projector／filter／URL／UI／QC authority，建立可刪除與必須保留的來源清單。
    - 依Cloud SQL `042_status_data_rebuild.sql`與SQLite `ensureDev087CanonicalWorkbenchSchema`建立SPEC §3.1.2 exact schema：唯一canonical workbench state、aggregate lock、Drawing branch/predecessor/global claim、三張專用current work、transient review request、minimal trace、Part／Relation approved snapshot與quarantine；以server-owned transaction承接create／submit／return／approve／formalize／cancel／branch_void／recovery。
    - 建立SQLite／PostgreSQL migration、offline converter、zero-unresolved reconciliation、DB/schema/binding backup/restore、single read/write cutover、same-window old-authority drop與90-day relational backup retention contract；physical bytes永久刪除另受refcount／approved-artifact／canonical-only gate管制且無回復功能。
    - 圖號、料號、圖料三工作臺的清單列、domain資料層標籤、處理狀態、頂部狀態型 filter、共用預覽／明細標頭及相同shared status consumer全部改讀新authority。
    - 收斂三工作臺唯讀抽屜的資訊順序、domain-specific projection、圖號／料號的`直接關聯`或圖料根號的`關聯矩陣`、受阻資訊、圖號歷史版次與單一 action owner；圖號進版入口依 server applicability提供量產／研發兩個明確目標，idle RD另提供受控次要風險action `申請作廢`。
    - 收斂三domain編輯／審核入口與資料隔離：圖號導回現有獨立智慧辨識編輯頁；料號由正式資料建立唯一修改中工作；圖料由正式關聯建立唯一調整中關聯樹；reviewer使用相同頁面唯讀。核准前正式資料／關聯持續有效，工作資料不得污染生產讀取。
    - 保留既有permission、action availability、其他domain approval／release business rule、revision／baseline domain identity與exact artifact handoff；這些是狀態轉換證據或動作authority，不再自行投影另一套current status。DEV-087本身只沿用`/approvals`入口，不寫既有永久decision table。

  - Out of Scope：
    - 不改圖號／料號／圖料身份、Part Revision政策、permission／角色指派、附件／預覽／下載authority或production-effective業務條件。Drawing新增branch/predecessor/target claim及一般review決定收斂為核准／退回，其他既有domain規則只改為驅動唯一current state。
    - 不重構、簡化或共用化現有圖號full-page editor；不改其2D／3D預覽、受控檔案、智慧辨識、欄位核對、儲存或送審架構。DEV-087只能調整入口與狀態接線，不能以一致性名義搬動圖號編輯內容。
    - 不用人工指定production／RD current pointer，不以updated_at、顯示碼或client排序猜測目前版本，也不把舊狀態值直接原樣搬到新enum。
    - 不提供任意`結束研發分支`、直接close或reopen action；本期唯一人類觸發的branch close是latest approved idle RD的`申請作廢 → 審核 → system formalize`。若要新增免審close、關閉非latest／active branch或reopen，須重回Dev PM／ADR。
    - 本輪文件更新不執行產品／測試修改、schema／migration、backfill、drop、資料修復、runtime啟停、stage／commit／merge／PR、staging／production deploy或release；後續實作與正式資料切換須依高風險gate另行授權。

  - Spec Impact Preflight：`Intentional replacement + compatible preservation`。
    - Intentional replacement：平行current-state projector chain；DEV-086的Drawing「最多production+RD兩列／RD只代表active work」；DEV-085／066 legacy status URL compatibility；舊多decision人類review vocabulary；料號／圖料根號沿用版本語意的方向。
    - Compatible preservation：approval/release/revision/baseline/assignment/permission/artifact作domain evidence；filter-before-group-pagination與複選互動mechanics；現行Part附件讀寫authority與DEV-087直接定義的獨立即時語意；DEV-068／079現有Drawing full-page editor、智慧辨識、預覽／檔案與送審ownership。
    - `ADR created / Accepted`：`.ai-doc/decisions/ADR-PDM-STATUS-DATA-REBUILD-001-single-current-state-authority.md`固定single current-state authority、Drawing多branch、revision claim、retention與same-window retirement。
    - 受影響文件以新SPEC的Supersession Matrix為target authority；DEV-087 activation前DEV-086仍為runtime baseline，activation後被取代的projector/filter/row contract active read/write必須為0。

  - Acceptance Direction：
    1. 完成全狀態inventory；每個現行欄位／enum／resolver／filter／consumer都有`保留為domain evidence／轉入canonical state／歷史唯讀／刪除`唯一處置，unknown=0。
    2. 新canonical state對Drawing每個`company+drawing`最多一列production、最多3個open RD branches且每個`company+drawing+branch_id`最多一列RD current；Part／Relation每entity最多一列formal與一列work。handling只允許`none／owner／review_owner／system／system_admin／blocked`，沒有第二套current-state enum或client fallback。
    3. 所有in-scope command在同一transaction更新domain evidence與canonical state；concurrent review／formalize／cancel／recovery不得產生雙production、同branch雙work、跨branch target collision、stale overwrite或partial state。
    4. 全量migration／converter reconciliation的unexpected unmapped、duplicate、invalid branch/reference、duplicate target claim、production-without-approved evidence、work-without-owner、hash mismatch、人工mapping待辦與unresolved全為0；source／target counts、review count/time、file binding與protected evidence hashes可重現且達100%。
    5. read／write cutover及rollback實測通過後，active runtime對舊current-state欄位、projector、filter與adapter的read/write均為0；最終移除或明確轉成不可影響current state的歷史唯讀資料，不保留永久雙權威。
    6. 三工作臺每列只含編號、品名、domain資料層／圖號版次與處理狀態；受阻原因只在既有明細按需顯示一次，無其他狀態欄、第二行或重複 badge。
    7. A0002-M01同時存在approved production 1與branch A latest 1.1時固定呈現`量產版 1`及`研發版 1.1`；若branch B另有target 2則同組呈現第三列`研發版 2`，研發列不得有量產可用語意。
    8. A0005-M01只有active 0.1且沒有Released basis時，只建立RD canonical row並顯示`研發版 0.1`，不得建立production row。
    9. 相同entity／lane／canonical state對所有合法觀看角色顯示相同角色文字；不同觀看者只能在可執行動作上不同，狀態不得出現你／我／他或姓名。
    10. 正常正式／工作中列處理狀態留空；只有五項人類處理狀態可見。圖號、料號、圖料根號各自的domain資料層filter、API canonical lane與列文字必須可逆映射。
    11. 預設目前清單不出現terminal record；cancel／obsolete／merge command會移除current row或轉成明確非current歷史，不得由resolver加回。
    12. 三工作臺及shared drawer的rendered DOM、accessible name、tooltip、popover與filter不得出現已禁止的變更／人名／日期／技術狀態詞彙。
    13. Domain資料層與handling filter直接查canonical state，精確保留命中row，不補companion production或整組，並在server-side group limit/cursor前生效；搜尋、換頁、reload、Back／Forward後不漏列、不重複、不產生client-side假空頁。
    14. 1440×900、1024×768、768×1024、390×844下，必要資訊、多branch群組與兩個狀態型filter無裁切、重疊、水平overflow或只靠顏色辨識。
    15. QA/QC依`.ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md`之`QA-087-001..178`、AC追溯矩陣與FMEA/phase gates執行，新增local destructive cleanup、PostgreSQL provider-aware zero-loss、typed projection、single file-read與全runtime retirement負向注入。正式release另要求兩次restore rehearsal；本期不做紅隊防作弊。required case必須全PASS、P0/P1=0且舊authority active usage=0後才可完成。
     16. Drawing／Part抽屜使用同一唯讀骨架與固定章節順序；切換圖號、料號或處理階段時，只有domain內容、狀態、例外與真實動作改變。圖料根號不再有獨立drawer owner surface，root矩陣嵌入Drawing／Part抽屜，沒有平行drawer或重複狀態區。
    17. 圖號抽屜固定提供歷史版次清單，能逐版唯讀查看exact preview／file；目前版、其他版與歷史版artifact不得混用或由fallback替換。
    18. 料號與圖料根號的header、body、DOM與accessible name均沒有其自身的版本／歷史版次；圖料根號沒有共同檔案區。料號既有圖號關聯與所屬根號只以一個`直接關聯`區呈現，圖料根號只呈現`關聯矩陣`，不呈現直接關聯。
    19. 三抽屜在受阻時只顯示`受阻`與一項原因且沒有處理／恢復動作；`system_admin`只顯示`請系統管理員處理`且沒有`前往恢復`或其他假 CTA。
    20. 可進版的`量產版 1`顯示`量產版 2`與`研發版 1.1`兩個server-derived候選；可進版的`研發版 0.5`顯示`量產版 1`與`研發版 0.6`兩個候選。UI不得自行計算目標版次。
    21. target確認須原子claim revision、建立／沿用hidden branch、綁exact predecessor與work後才導航；來源與歷史版維持唯讀。同branch active edit／review／system／blocked不得建立第二份work，但其他branches可並行進版。
    22. 抽屜與進版選擇視窗在1440×900、1024×768、768×1024、390×844下可完成鍵盤／觸控操作，drawer body與modal各自擁有明確scroll owner，唯一primary action不遮住最後一列或被其他dock重複。
    23. 圖號量產列經`進版`選定target、或研發列經`進行編輯`後，都進入目前canonical圖號full-page editor；既有圖面／檔案／2D／3D／智慧辨識／欄位核對／送審資訊架構與主要互動沒有因DEV-087被替換、刪除或搬進共用Part／Relation表單。
    24. 圖號進入現有編輯頁時來源與目標revision exact，重新整理、返回與送審不會切到另一lane、歷史版或global latest；不得存在第二套簡化圖號編輯入口。
    25. 料號清單與filter只使用`正式資料／修改中`；正式列可建立且只建立一份current修改中資料，工作列可`進行編輯`。核准前生產讀取仍為正式資料，取消／退回／失敗都不得污染正式值。
    26. 料號編輯頁沒有版次、歷史版次、進版或可寫關聯；Part work只編輯料號自身主資料欄位，已變更欄位才顯示原正式值。附件區即使同頁呈現，也由現行live attachment controller獨立即時寫入，不屬Part work DTO/snapshot/review/rollback；未變更欄位與首次建立資料不產生重複比較欄。DEV-088重新達到RD contract前不得在此建立新附件資料模型或整料號lease。
     27. （Historical／由DEV-090取代）圖料清單的`正式關聯／調整中`列與Relation filter退役；現行矩陣只在Drawing／Part drawer讀寫正式`drawing_part_links`，不建立current調整資料或送審。
     28. （Historical／由DEV-090取代）root → drawing → part關聯樹的Relation editor不再是現行入口；矩陣直接在Drawing／Part drawer顯示與編輯，不存在根號版本、歷史版次、共同檔案、圖料附件、Drawing／Part主資料表單或智慧辨識。
     29. Part只有domain mechanics可與Drawing共用；Relation不再提供可寫editor。任何可寫欄位都只有一個domain owner，Drawing／Part頁面不產生第二條mutation path。
     30. Part有未儲存變更時唯一primary是`儲存修改`，資料已儲存且完整時才進入既有審核；Relation矩陣唯一primary是`儲存`，成功即正式生效、不切換為`送交審核`。Part review_owner仍在同domain editor/layout fully-readonly；system／system_admin／blocked無編輯入口。
     31. Part review decision click才建立minimal trace；Relation direct matrix save不建立review trace、snapshot或approval task。Part附件不進snapshot/review；system retry不得重算latest。
    32. 新未核准cancel會刪除work/ref/predecessor/claim並允許revision重用，但保留已產生minimal trace。正式legacy cancelled資料也必須轉移審核次數／時間、關聯與檔案引用並逐筆對帳，不得捨棄或永久quarantine；本機舊payload可清除。physical bytes只有新引用完整、內容hash相同、零有效引用與approved-artifact guard通過後才可永久刪除，且沒有備份回復功能。
    33. external write freeze、old web/worker/scheduler drain、DB/schema/binding backup/restore drill、zero-unresolved shadow reconciliation、singleton authority fencing、allowlisted smoke與backup verification通過後，同一maintenance window退役舊current-state authority；canonical-only re-gate後才開流量，無唯讀觀察期或永久dual read/write。
    34. transition mode只允許`legacy_only／shadow_compare／cutover_window／canonical_only`；shadow_compare只能在隔離環境，production不得雙寫、雙讀裁決或canonical→legacy fallback。
    35. fixed-path machine-readable inventory schema/canonical inventory覆蓋每一項舊authority與consumer，且owner、disposition、retirement phase、verification完整，unknown=0、unowned=0。
    36. `npm run qc:dev-087:retirement`在SQLite、PostgreSQL rehearsal與authorized production cutover均PASS，結果綁定exact commit、schema hash與provider。
    37. 舊schema active read/write、projector／resolver／filter import與runtime registration、legacy API field／URL parser／feature flag／fallback使用量全部為0；保留的domain evidence無法再驅動workbench current state。
    38. retirement manifest與QC summary使用SPEC固定路徑，保存inventory hash、removed／preserved清單、scan與schema receipt、protected evidence hash、smoke與rollback結果，且能由completion audit與fresh session定位及驗證hash。
    39. manifest缺漏、gate非PASS、transition mode非`canonical_only`或任一舊authority仍active時，DEV-087只能標`Retirement Pending`，不能標complete／handoff ready／release ready。
    40. 全新AI session不使用聊天記憶，只讀cold-start、DEV index與direct authority docs，即能正確回答目前mode、未清項、owner與下一gate；回答錯誤即驗收失敗。
    41. 不建立平行cleanup DEV或future capsule承接舊架構退役；舊authority清除與新authority交付必須在同一DEV-087及其release gate一起關閉。
    42. Manufacturing在A0002同時看見`量產版 1`及`研發版 1.1`但無mutation；owner、具既有same-company non-owner edit scope者、exact reviewer、一般non-owner、cross-company矩陣及server denial皆通過。
    43. production 1可選server production 2、推薦RD 1.1或同major manual minor；non-stale RD 1.1可續推薦／manual minor且base current時可升2；stale branch零target，claimed major不得跳號。
    44. 四個併發creator只能建立三個open branches；第四個回固定錯誤且無partial write，已存在三branch時其最新版仍全部顯示且既有branch可續作。
    45. authority control與runtime commit/schema/mode不一致時readiness/command fail closed；開放流量前rollback達RPO=0，發現未核准寫入則禁止自動restore。
    46. QA每個case都有case definition／AC／risk、precondition/steps/expected/actual/provider/artifact/commit/schema/fixture seed/result/首敗/cleanup；expected可由同一開發者撰寫，但必須是可觀察的產品結果。BLOCKED、NOT_RUN、skip、flaky及只有aggregate綠燈或截圖都不構成PASS。
     47. `drawing_revision_works／part_change_works`是新runtime current work authority；`relation_change_works`僅是DEV-090 migration source，activation後必須退役。legacy mixed workspace只能在正式converter中被deterministic conversion／人工唯一mapping，或在本機依cleanup policy刪除，不能被新read/write path使用。
    48. first-work cancel會刪除空branch並原子遞減open count；已有approved revision的next-work cancel只移除work並回idle branch。兩條路徑都無孤兒claim、state或錯誤branch-cap占用。
    49. latest approved idle RD可`申請作廢`；退回恢復idle open，核准並formalize後branch closed、current row移除、cap釋放且不可reopen。active／review／system／blocked／非latest／重複request一律fail closed。
    50. branch void保留所有approved identity、minimal review trace與controlled artifact；不得因branch current row消失而刪除或改綁已核准檔案。
    51. 作廢確認明確告知整個研發系列會從目前清單移除且無法復原；沒有restore CTA，keyboard／focus／a11y與四viewport皆通過。
     52. DEV-087的Drawing／Part Cloud SQL migration固定042；DEV-090 Relation migration固定043且必須在正式 provider-aware rehearsal、zero-loss reconciliation與授權 cutover gate後執行。SQLite/PostgreSQL exact schema、constraint、index、fresh/apply/re-run/provider parity通過。
    53. DEV-087審核只使用transient`pdm_work_review_requests`；return或formalize success清除request/snapshot，永久trace只有cycle/entity/time且不寫`approval_platform_decisions`。terminal receipt/outbox/audit/log/error/backup依主SPEC安全投影掃描，不能由旁路還原reviewer、decision、comment、revision或work content。
    54. list/detail DTO與command routes符合SPEC §9 allowlist；retired query/command固定410，沒有舊status欄位、silent translation或compatibility write。
     55. Drawing/Part list/detail與approval adapter符合SPEC數值query hard cap，Drawing 0/1/3 branch statement delta=0且無N+1；Relation不再有list/detail owner surface，矩陣只在Drawing/Part drawer內查詢。
    56. converter依唯一證據映射；multi-target/multi-active/lineage不明/over-cap/company mismatch進阻擋清單且禁止cutover，人工mapping完成後清單必須為空；dry-run/apply/re-run counts/hash一致且不猜測、不捨棄。
    57. 與過去文件或code衝突時以DEV-087為主；direct authority的supersession boundary可被fresh-session讀出，舊QA不要求保留相容路徑，retirement negative injection能證明舊code可拆且已拆。

  - 執行邊界：本輪已修改本機產品、測試／migration tooling、SQLite資料與權威文件；本機legacy graph清理已獲使用者授權並完成。未連線、寫入或刪除正式Cloud SQL，未執行stage／commit／merge／PR／deploy／release；正式cutover仍須一次明確高風險授權。
  - 計入交付：是；只有新canonical state成為唯一read/write authority、Drawing所有open branch latest完整可見、舊current-state authority完成same-window安全退役、全量資料／command／restore reconciliation通過，且三工作臺人類語意符合本契約後才完成。

- × DEV-097 [開發點] [跳過 / Historical Supporting] [P0] [Superseded by Trusted-Solo QA Decision] QA完成分母與反假PASS封口
  - 摘要：封住DEV-087可能因案例分母縮小、seed終態冒充UI journey、SUT同源oracle、舊aggregate只看exit code、UI外mutation或拼接／重用evidence而產生假PASS的系統控制缺口。這是QA harness與完成判定開發點，不新增產品能力。
  - 來源 ID：`DEV-PDM-QA-INTEGRITY-GATE-001`
  - 父任務：`DEV-087`
  - 決策取代：使用者於2026-08-27明確接受單人自開發、自驗證的剩餘誠信／稽核風險。本項的獨立QC、獨立oracle、不可變分母、artifact hash chain、M01..M12與actual AT receipt自此不再是DEV-087 completion gate。
  - 下一步：無。現有registry、manifest schema、reference oracle、mutant、`qa-integrity`與receipt template保留為Historical Supporting；除非使用者日後明確恢復防弊或多人稽核，不得再阻擋DEV-087。
  - 阻塞／恢復條件：無活動阻塞；若未來要恢復本控制，必須另有使用者明確決策，並同步修訂DEV-087與QA契約。production release gate不因本決策取消。
  - 事實基線：QA主管審查時的主QA有219筆case definition rows但只有218個unique numeric IDs，第二筆`QA-087-115`重複。文件已把該historical supporting case重鍵為`QA-087-229`並完成AC 1..81 trace修正；`currentDenominatorDelta=0`。2026-08-26新增overlapping runner coverage與manifest v2；舊child自報、泛化assertion、只看exit code及相同dirty path不同內容等作弊路徑已被hardening probes拒絕。
  - Spec Impact：`Intentional replacement / No product behavior change`。schema／migration=`none`；不新增產品route、action、state或authority。ADR=`No New ADR`，既有DEV-087 ADR維持Accepted。
  - Exact implementation map：
    1. `.ai-doc/qa/dev-087-current-case-registry.json`＋`.schema.json`：每案固定`caseId/classification/gateStage/definitionHash/acIds/runner/provider/fixtureOrigin/allowedClaims/assertionIds/requiredArtifacts`；runtime不得自行解讀range或「受影響」。
    2. `.ai-doc/qa/dev-087-capability-manifest.schema.json`：固定`schemaVersion/runId/gateStage/source/environment/registryHash/oracleHash/runnerHash/caseResults/childManifests/prohibitedMutationAudit/primaryInvariant/firstFailure/cleanupReceipt`並fail closed。
    3. `.ai-doc/qa/dev-087-case-id-migration.json`：只記第二筆舊115→229、舊／新definition hash、reason/date與`currentDenominatorDelta=0`；229固定`historical_supporting`。
    4. `scripts/qc-dev-087-reference-oracles.mjs`：只接受primitive JSON tuples，key-sorted UTF-8 JSON SHA-256；exact exports為`oracleAffectedParts`、`oracleObsoleteFingerprint`、`oracleTaskOrder`、`oracleGroupedCursor`，不得import`src/lib`、repository、產品service、aggregate或capability runner。
    5. `scripts/qc-dev-087-qa-integrity.mjs`：同一runner以`--stage preflight|evidence`分段，不import SUT或四支capability runner；獨立驗registry、oracle sensitivity、fixed mutants、child manifest與artifact hashes，保留immutable first failure。
    6. `scripts/qc-dev-087-capability-{contract,repository,browser,negative}.mjs`各產生schema-valid child manifest；`scripts/qc-dev-087-aggregate.mjs`與`package.json`只新增實際command，不建立空`qc:dev-087:harness`alias。
  - Current denominator：本段舊分母已取消。DEV-087新current denominator為`D01..D24 + P01..P13 + I01..I14 + C01..C11 + QA-087-187..218 = 94`，另有不計入個案數的三個橫向Gate。`R01..R14`、舊67-case、QA-087-219..229均只作Historical Supporting。
  - Historical fixture／mutation contract：browser case曾固定`fixtureOrigin=ui_created|repository_seeded_read_only|fault_profile`與完整UI action／network／server／DB ledger；此anti-cheat provenance不再是current gate。新契約仍禁止用API／DB建立UI案例的成功postcondition，202／206以外不得直接執行business mutation。
  - Historical gate topology：harness→G0-A、fault injection→capability-negative＋mutants、visible/a11y→G4 QA-087-228的拓樸不再是current completion順序；產品assertions已由四支capability runner與94＋3 Gate承接。
  - Historical Anti-cheat：本項的G0-A／G4、synthetic invalid manifests、mutants、provenance hash與收據要求全數停止作為current gate。
  - Current product gates：SQLite／PostgreSQL關鍵行為一致納入`QG-087-PROVIDER`；same-origin／cross-company／identity zero-write納入`QG-087-SECURITY`；actual viewport、headed visible、keyboard／focus／overflow／visible error納入`QG-087-UI`。同一位開發者可執行，actual AT選配。
  - Out of scope：通用跨專案紅隊平台、DEV-087產品功能實作、production data／migration／credential／deploy／release，以及`part_root`搜尋明細、root狀態／阻擋原因與root整體新增／作廢影響。
  - QA／QC acceptance：不再對DEV-097產生current PASS；DEV-087以94/94與三個橫向Gate判定。
  - Planned commands／evidence：舊`qa-integrity --stage preflight|evidence`及收據流程非必要。四支capability runner可保留作產品回歸工具；aggregate後續實作需改為94案＋3 Gate，不得再因缺Independent AT receipt回FAIL。
  - Historical 2026-08-27 evidence：fresh G0-A、contract、repository `25/25`、negative `6/6`、browser `91/91`均PASS；主browser另有`288/288`、Part附件`48/48`。raw G4證明6/6 PostgreSQL、8/8 zero-write security與32組可視證據，但因舊Independent AT receipt契約回FAIL。該FAIL不再代表DEV-087產品FAIL；新completion仍需94＋3 fresh aggregate，且不得誤報已可release。
  - 執行邊界：本輪已新增／修改registry、schema JSON、oracle、integrity runner、四支capability runner、G4 raw runner、fail-closed aggregate與QA212產品接線；所有執行均限task-owned SQLite fixture或read-only static guard，未修改primary data、未連線Cloud SQL、未建立或寫入既有PostgreSQL default DB，未stage／commit／deploy／release。
  - 計入交付：否；且不再是aggregate／local completion／release re-entry前置。

- ✓ DEV-098 [交付點] [Human Confirmed] [P0] [Local RD/QA-QC Complete / Fixed QA 31 of 31 PASS / Production Release Gated] 圖面版次與研發分支統一生命週期
  - 摘要：統整舊版手動版次、舊submission sandbox與現行canonical Drawing多研發分支，建立「量產基準、同主版次手動小版、受控里程碑、stale freeze、量產採用」可由人理解且可由系統一致執行的單一生命週期。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001`
  - 父任務：無；直接關聯`DEV-050`版次政策、`DEV-087`canonical多分支、`DEV-053`進版工作臺與`DEV-079`Drawing owner workspace。
  - 直接文件：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001-unified-revision-and-branch-flow.md`；ADR `.ai-doc/decisions/ADR-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001-bounded-manual-minor-and-stale-freeze.md`。
  - 文件成熟度：`Local RD/QA-QC Complete / Human Confirmed`。正常branch、同主版次manual minor、stale in-flight收斂、pre-production `0.x → 1`、UI basis projection、exact wire／validator／aggregate-first transaction、typed policy snapshot、schema decision、file map、分期、FMEA、fixed QA與phase boundary已封口；31案固定分母已全部實跑PASS。
  - 問題／使用者價值：目前畫面顯示「版次」，但建立版次、建立研發分支、核准minor、升量產major、補登歷史與處理過期分支分散在不同年代的流程。使用者無法只從圖號工作臺理解何時設定版次、每個分支最後會成為什麼，以及「合併」是否真的套用內容。統一後，RD應能從同一圖號看見量產基準、每條研發路徑的最新里程碑與唯一下一步，不需理解submission、claim或branch ID。
  - 已分析的三套事實基線：
    1. 舊版版次：server先建議版次，UI允許修改；偏離建議時必須填覆寫原因，並可用歷史補登建立不取代最新版的受控紀錄。minor仍不可成為`Released`。
    2. 第一代sandbox：分支綁`source_submission_id`，複製欄位、檔案與references，產生`${source}-SBX-XXXX`；同一來源只允許一條active branch，active時阻擋來源核准。所謂merge只產生diff摘要並把branch標成`promoted`，沒有把sandbox內容原子套回source，因此不是完整merge。
    3. 現行canonical branch：分支綁stable Drawing，保存base production與latest approved RD，最多三條open branch；建立work時原子claim target revision。minor核准後branch保持open，major核准後才更新production並把來源branch歷史化；取消與作廢依是否已有approved revision採不同保留規則。
  - 程式事實來源：舊版可修改／補登UI在`src/app/numbering/revisions/page.tsx:988`與`:1877`，覆寫原因guard在`src/lib/drawing-submission-workbench.ts:886`；sandbox clone在`src/lib/repositories/sandbox-async-repository.ts:230`，diff preview在`:175`，status-only merge在`:331`，active branch approval block在`src/app/api/submissions/[id]/approve/route.ts:89`；canonical schema在`db/schema.sql:4501`起，候選／claim／cancel／formalize在`src/lib/repositories/drawing-revision-work-async-repository.ts:46`起。
  - 已確認的實作差距：現行candidate程式以「目前production major」組合「來源RD minor + 1」。若production已由1升2，而stale branch停在1.2，程式可能提出`2.3`。此外create只接受candidate token、候選按鈕直接mutation，formalize會把`policy_snapshot_json`覆寫成只有`changeImpact`；action resolver、work／file／recognition mutation、review GET與approve都缺少一致basis capability／guard，PostgreSQL source lock又對LEFT JOIN branch使用`FOR UPDATE OF branch`。全部已在SPEC §15列為必改；stale必須零target且既有work只走return／cancel收斂，鎖序固定aggregate-first。
  - 差距分析：

    | 能力 | 舊版 | 現行 | DEV-098需封口 |
    |---|---|---|---|
    | 版次產生 | 建議值可修改 | 只接受server候選與claim | 保留server推薦；一般RD只輸入同主版次minor suffix，server重驗 |
    | 歷史補登 | 有明確backfill語意 | canonical branch未涵蓋 | 本Current Phase不新增canonical backfill；既有歷史只讀 |
    | 分支owner | Submission clone | Canonical Drawing | 保留canonical Drawing；不得復活submission雙主檔 |
    | 平行研發 | 同來源最多一條active | 每Drawing最多三條open | 保留原子cap／claim與全部latest可見 |
    | minor／major | minor受控、major量產 | minor留branch、major升production | 統一成人類可理解的里程碑／量產採用語意 |
    | 過期分支 | 無完整跨基準治理 | spec可續minor；程式可能混成`2.3` | 固定freeze；只查看、作廢或從current production另開 |
    | merge | diff後只改狀態 | 以major promotion採用branch | 沒有內容套用就不得稱merge；真merge另定契約 |
  - 已確認的目標心智模型：
    1. `量產版 N`是目前生產基準；`研發分支`是從某一量產基準開始的工作路徑，不是版次本身。
    2. `研發版 N.x`是該分支已核准的受控里程碑；核准minor不改量產基準，也不能成為`Released`。
    3. 分支選擇`N+1`並核准，代表採用該分支成果成為新量產版；來源branch歷史化，其他舊基準branch進入明確的過期處置。
    4. 系統推薦仍是預設；一般RD可切換`自訂研發小版`，但只輸入同主版次minor suffix。server固定major並重驗lineage、唯一claim、branch base與minor release gate。
    5. 「合併」只在差異預覽、衝突處理、exact source/target、原子套用、冪等receipt與失敗復原都存在時使用；否則一律稱`採用為量產版`、`結束分支`或`作廢分支`。
  - 建議主流程：

    ```text
    量產基準 N
      └─ 建立研發分支＋原子claim目標
           ├─ 取消（尚無approved revision）→ 刪work／claim；空branch移除
           ├─ 核准 N.x → 保存受控研發里程碑；branch保持open
           ├─ 再進版 → 沿同branch建立下一個合法target
           ├─ 核准 N+1 → 切換量產基準；來源branch歷史化
           └─ 作廢（已有approved RD）→ 受控審核後歷史化；artifact永久保留

    量產基準被其他branch推進
      └─ 舊基準branch → freeze
           ├─ idle：查看／作廢／從current production另開
           ├─ owner work：同workspace唯讀，只可取消
           └─ review：不得核准，只可退回；退回後owner取消

    pre-production 0.x
      ├─ base=null且無current production → 可續合法0.y
      └─ server major 1核准 → 建立第一個production

    自訂研發小版
      └─ major由server鎖定，只輸入向前且未占用minor suffix → 同transaction claim
    ```
  - 初始Current Phase候選範圍：
    - 統一revision、branch、work、approved milestone、production adoption與history read的人類語意及server invariant。
    - 對齊圖號workspace的版次顯示、進版入口、候選選擇、過期分支阻擋／恢復與歷史導覽。
    - 保留canonical Drawing owner、tuple revision、predecessor、全Drawing唯一claim、最多三open branches與minor不可Released。
    - 同一進版dialog同時支援server推薦與bounded manual minor；不新增Manager exception頁或canonical backfill入口。
    - 舊manual revision／sandbox只保留read-only差距紀錄；Current Phase不建立轉換migration、不回填selection evidence，也不假定legacy lineage可自動映射。
  - Out of Scope：
    - 復活`submission sandbox`、`${source}-SBX-*`版次或submission雙主檔。
    - 在canonical Drawing新增history backfill、手動major、跨主版minor、stale續作或minor Released。
    - 在本phase實作真正three-way merge、CAD內容合併、BOM自動合併或衝突編輯器。
    - 開放`ConditionalUse`／`TrialApproved`、讓minor成為正式量產、改Part Number／BOM revision policy。
    - 未經另行授權的production migration、資料修復、deploy、release、實體檔案刪除或歷史重寫。
  - 驗收方向：
    1. 使用者從單一Drawing workspace可回答「目前量產版、有哪些研發分支、每條最新里程碑、誰可做什麼、下一步是什麼」。
    2. server推薦與manual minor都在同transaction claim；manual只帶minor suffix且允許跳過未使用suffix，但回退、重用、跨major、stale basis與第四條branch全部zero-write fail closed。
    3. minor核准只更新該branch研發里程碑；major核准只在base仍current時原子更新production，任何失敗不留下partial pointer／claim／artifact狀態。
    4. manual minor沿用正常RD權限，不要求override reason；policy evidence必須保存selection mode、server-derived major、requested minor與source row version。canonical history backfill不在本期。
    5. 其他branch推進production後，舊基準branch不得產生target、編輯、送審或核准；owner／review只保留cancel／return收斂，UI投影一項可行動的人類處置並保留既有工程證據。
    6. 所有approved revision identity、predecessor、claim與controlled artifact永久可追溯；取消未核准work與作廢已核准branch的資料保留規則明確分離。
    7. UI沒有branch ID、submission ID、raw error或技術狀態競爭；桌面／窄幅皆維持一個主要焦點與唯一primary action。
    8. 任何稱為merge的操作都必須證明內容實際套用、衝突已處置、transaction可復原；否則產品詞彙與API不得使用merge。
  - Exact implementation map：新增shared target contract、`server-only` token與pure lifecycle policy三個單責模組；修改Drawing revision service／file helper／recognition user-command guard、review GET capability projection、Drawing repository、workbench basis query／action resolver、revision-work／review guards、canonical workbench與Drawing workspace；同步DEV-087 selectors；新增`qc-dev-098-{contract,repository,browser,postgres,aggregate}.mjs`。`revision-targets` route外殼與DB schema／initializer／migrations維持no-touch。
  - API／資料契約：recommended使用綁actor/company/Drawing/source row/version/tuple/expiry的v2 token；manual body只帶JSON integer suffix。所有basis-sensitive Drawing mutation在serializable transaction固定`aggregate → current production → source → exact branch → claim/work → recognition session（若有）`鎖序並重驗basis／cap／predecessor／claim；guard不得放在transaction外，PostgreSQL不得鎖nullable outer join branch。existing tuple claim是唯一authority；policy snapshot typed merge保留。schema classification=`none`、migration/backfill=`not required / not authorized`。
  - QA／QC plan：`.ai-doc/qa/qa-dev-098-drawing-revision-branch-lifecycle-validation-plan-2026-08-25.md`固定`QA-098-001..031`與FMEA，涵蓋stale owner／review收斂、proactive stale action＋race recovery、pre-production `0.x → 1`及disposable PostgreSQL aggregate-first lock。2026-08-28 final fresh aggregate為31/31 PASS、9/9 commands、4/4 child manifests、P0/P1=0、`completionCandidate=true`；evidence=`output/qa/dev-098/DEV098-aggregate-2026-08-28T07-21-30-116Z/manifest.json`。
  - 已關閉高影響決策：`HD-098-01 / 1C-bounded`＝一般RD只輸入同主版次minor suffix；`HD-098-02 / 2A`＝stale freeze；`HD-098-03 / 3A`＝本期不做真正merge，採`採用為量產版`。
  - 治理判定：`Intentional replacement + compatible preservation`。DEV-087「auto-only minor」與「stale可續minor」被取代；DEV-050加入bounded canonical exception但minor release gate不變。兩份parent SPEC均已有DEV-098 amendment，DEV-087 canonical state／claim／branch cap相容保留。
  - ADR／下一步：配對ADR已Accepted；2A的in-flight cleanup已工程化封口。Local RD→QA→QC已完成；若要上production，另以fresh release provenance走正式release gate，不以本機aggregate代替部署、流量或production smoke。
  - 2026-08-28完成邊界：contract、repository、browser、disposable PostgreSQL、affected DEV-087 regression、typecheck、lint與isolated build均由aggregate執行；primary schema／canonical identity／master counts／migration residue／root references／FK before=after，task-owned ports與temp均清理。未執行production migration、deploy、traffic或release。
  - 計入交付：是（Local RD/QA-QC complete；production release仍gated）。

- ✓ DEV-092 [開發點] [RD Implemented / QA-087-179..186 PASS / Browser PASS / Disposable PostgreSQL PASS] [P0] [Local CAPA Implemented / Production Data Repair & Release Gated] 遷移圖號工作檔案快照完整性修復
  - 摘要：修正DEV-087遷移建立`drawing_revision_works`、claim與canonical state時漏建`drawing_revision_work_files`的缺口。該缺口會讓revision檔案與實體asset都存在，current work API卻回傳空files，進而造成2D/3D預覽空白、`sourceAssetIds=[]`、智慧辨識不啟動，最後錯顯示「尚無可辨識的檔案」。
  - 來源 ID：`DEV-PDM-DRAWING-WORK-FILE-SNAPSHOT-CAPA-001`
  - 父任務／關聯：父交付點`DEV-087`；保留`DEV-068` recognition context／evidence lineage與`DEV-079` Drawing獨立workspace架構；不恢復legacy workspace或舊file-read route。
  - 直接 authority：本段、`.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md` §0.3／§3.1.1／§8／§10.2／§12，以及`.ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md` §23。ADR判定=`No New ADR`：本案只是落實既有work-owned snapshot authority，不改架構決策。
  - 事實基線：A0006-M01 drawing `drawing-draft-drawing-58f3b735-a3fe-4c3b-87be-f2e23a15bebe`、revision `drawing-revision-NCR-f8871cbc-9540-4f73-bb4b-1db2106da51f`（`0.1`）有PDF／SLDDRW／SLDPRT共3筆未移除revision files，對應assets與physical bytes存在；current migrated work `dcf65c1a-3ede-4fba-a473-f3cf5ef6d6c5`的work-file binding為0。既有`candidate_revision` recognition session有3 sources／27 candidates／29 observations，但current UI要求`drawing_revision` context與current work exact source set，因此不得只因圖號相同就誤用舊session。
  - 根因／控制失效：`scripts/migrate-dev-087-canonical-workbench.mjs`建立branch／claim／work／state卻未轉換work-file child rows；`scripts/migrate-dev-087-postgres.mjs`的一般table receipt無法充分驗證複合鍵work-file集合；`scripts/qc-dev-087-migration.mjs`fixture沒有Drawing files，zero-loss與completion audit也未檢查每個migrated work的expected/actual file-set equality。這是`Implementation defect + migration verification control failure`，不是單純OCR或UI文案問題。
  - Current Phase目的：已完成全量影響範圍確認，並以可重跑、無猜測的forward repair補齊snapshot；converter、read invariant、zero-loss negative control、fresh browser UI與disposable provider rehearsal均已通過。不把本機／隔離 PASS延伸成production完成。
  - 資料修復契約：
    1. 唯讀inventory只鎖定`proposed_payload.migrated=true`且仍由current canonical state指向的active Drawing work；每個work的唯一source revision須由該work payload／exact canonical state證明，禁止用global latest、revision文字排序或同圖號猜測。
    2. expected set固定為exact source revision上所有未移除`drawing_revision_files`；target set固定為該work的`drawing_revision_work_files`。每筆target使用原`file_binding_id`、revision file的`sort_order`作`ordinal`、對應`file_assets.content_hash`作hash；不複製或改寫physical bytes。
    3. dry-run與apply共用同一classifier；預設dry-run，apply只允許明示本機／隔離DB。完整集合為0時保持合法空snapshot；expected>0且target為0或partial時只可整組原子補齊／修正，不得部分成功。
    4. source revision歧義、missing／deleted asset、cross-company／cross-drawing、duplicate binding／ordinal、content-hash drift、target多餘列或任何source mutation均fail closed，`unresolved>0`且不寫任何target。
    5. apply/re-run後每個work的ordered tuple set `(file_binding_id, ordinal, content_hash)`與source完全相等，第二次apply insert/update/delete皆為0；manifest必須記錄before/after、source fingerprint、per-work receipts與異常清單。
  - 實作契約：
    - converter／repair：修訂`scripts/migrate-dev-087-canonical-workbench.mjs`與`scripts/migrate-dev-087-postgres.mjs`，使新轉換與既有migrated work forward repair遵守同一集合規則；PostgreSQL必須新增可驗證複合鍵tuple的專用receipt／reconciliation，不得以row count或`ON CONFLICT DO NOTHING`代替。
    - runtime read：修訂`src/lib/drawing-revision-work.ts`與`src/lib/repositories/drawing-revision-work-async-repository.ts`，維持work-owned snapshot為唯一authority。偵測到已遷移work的expected/actual集合不一致時回傳stable anomaly code與精簡可見錯誤，禁止把corruption投影成合法「尚無檔案」。真正expected=0的work仍使用既有empty state。
    - workspace／recognition：`src/components/canonical-drawing-change-workspace.tsx`仍只使用work API files產生preview與`sourceAssetIds`，不得直接fallback讀revision files。修復後智慧辨識以exact `drawing_revision + current revision id + exact source asset set`建立／載入session；不得僅因drawing number一致而重用`candidate_revision` session。跨context lineage import/reuse不在本期。
    - prevention／completion：補強`scripts/qc-dev-087-migration.mjs`、`scripts/qc-dev-087-zero-loss-migration.mjs`、`scripts/qc-dev-task-completion-audit.mjs`及對應fixture／aggregate，使0／1／3檔、partial row、hash drift、deleted asset、跨公司與第二次apply均可證偽；刪除任一work-file binding的negative injection必須讓migration、zero-loss與completion audit失敗。
  - CAPA可追溯：CA=`converter + forward repair + read invariant`；PA=`file-bearing fixture + exact tuple reconciliation + composite receipt + completion negative control`；effectiveness=`QA-087-179..186與獨立QC在修復前能重現FAIL、修復後全量PASS，且A0006 hard reload後預覽與辨識來源恢復`。PA流向為DEV實作、QA/QC case、completion audit與migration release gate，不另建平行skill或SOP。
  - 驗收：
    1. 全量active migrated Drawing works的expected/actual tuple set與hash 100%相等，ambiguous／unresolved／orphan／extra／partial=`0`；A0006固定為`3 expected = 3 actual`。
    2. SQLite converter／forward repair對0／1／3檔fixture完成dry-run、apply、re-run；PostgreSQL mirror產生逐work複合receipt，兩provider結果同構。
    3. A0006 current work API回傳exact 3 files；2D／3D preview與download仍走canonical protected route，content type／hash／binding一致，沒有legacy fallback。
    4. A0006 current workspace hard reload後不再顯示假空狀態；智慧辨識使用`drawing_revision` exact context與3個source assets建立或取得正確session，console、visible error與unexpected 4xx/5xx皆為0。
    5. 合法零檔work仍顯示正常empty state；故意製造partial/mismatch時呈現一項可行動錯誤並fail closed，不可靜默fallback或誤報無檔。
    6. `QA-087-179..186`、targeted aggregate、negative control與獨立QC全部PASS，P0/P1=0後才可把DEV-087恢復為local PASS。
  - QA／QC與證據：`qc:dev-092:work-file-snapshot`=`PASS (21 checks)`（fixture含source／target missing、deleted、hash drift、duplicate、extra與cross-company scope drift、repair與idempotent re-run）；`qc:dev-092:runtime-invariant`=`PASS (2 checks)`；`qc:dev-092:recognition-context`=`PASS (6 checks)`；`qc:dev-087:zero-loss`=`PASS (29/29)`；disposable PostgreSQL 0／1／3 rehearsal、4 composite receipts、rerun stable與target-drift fail-closed均PASS；isolated fresh-auth browser=`PASS (17/17)`，另有DEV-087舊流程回歸`85/85 PASS`。`typecheck:app`、`qc:doc-paths`與`qc:dev-task-evidence-sync`均PASS。主SQLite已先dry-run再apply，證據為`output/qa/dev-092-main-dry-run/manifest.json`與`output/qa/dev-092-main-apply/manifest.json`，A0006 exact 3 work-file rows、FK=`0`；QA-087-179..186現為Blocked=0、Not Run=0。QC已保留原始首敗與本次PASS artifacts，不以瀏覽器空畫面推論資料缺失。
  - Out of Scope：直接UI fallback到revision files、改寫既有immutable recognition session context、建立第二套file authority/schema、變更physical bytes、production data mutation、Cloud SQL rehearsal/cutover、deploy/release、跨context recognition lineage合併。
  - 執行邊界：本輪已修改本機產品code、migration／repair tooling、disposable fixtures、主SQLite與開發文件；主SQLite apply前已保存dry-run並核對exact target。未執行正式PostgreSQL資料修復、migration、cutover、deploy或release；上述動作仍須另走DEV-032／deployment release gate與明確授權。
  - 計入交付：是（RD implementation／local QA-QC／browser／disposable provider gates，且已由DEV-094 fresh aggregate重新確認）；否（production release）。DEV-092本機CAPA已完成；剩餘僅正式備份下的兩次PostgreSQL rehearsal、cutover與release授權。

- ✓ DEV-094 [開發點] [Local RD Implemented / QA-QC PASS / CAPA Effective] [P0 Closed] [CAPA-PDM-2026-08-24-001 / Production Release Gated] SQLite 圖料主檔遷移完整性與 runtime 隔離修復
  - 摘要：修正 `part_roots`／`part_numbers` company-scope startup rebuild 在多 process 初始化下可留下空正式表與 migration residue，導致 A0002／A0005 清單仍存在但 drawer 回「圖料根號不存在」；同時關閉 build worker 觸碰主 SQLite、seeded browser fixture 假 PASS 與 relation matrix 單點錯誤吞掉整份 detail 的驗證缺口。
  - 來源 ID：`DEV-PDM-SQLITE-MIGRATION-INTEGRITY-CAPA-001`；CAPA=`CAPA-PDM-2026-08-24-001`。
  - 父任務／重開：`DEV-087`、`DEV-092`。兩者歷史 evidence 不改寫；DEV-094 fresh aggregate已完成並恢復兩者本機QA-QC狀態，production completion仍不在本案。
  - 直接 authority：`.ai-doc/specs/SPEC-PDM-SQLITE-MIGRATION-INTEGRITY-CAPA-001-root-recovery-and-runtime-isolation.md`、`.ai-doc/qa/qa-dev-094-sqlite-migration-integrity-capa-validation-plan-2026-08-24.md`、`.ai-doc/qc/qc-dev-094-sqlite-migration-integrity-capa-2026-08-24.md`；ADR=`No new ADR required`，Spec Impact=`Compatible CAPA amendment`。
  - 原始事實基線：主 SQLite `part_roots=0`、`part_numbers=0`、`drawing_numbers=3`、global FK violations=15；兩張 `*_company_scope_migration` 各保存3筆且exact覆蓋A0001/A0002/A0005。A0002 production/RD及A0005 RD共有3個orphan-root states；A0003/A0006為unscoped且可開啟。既有 `qc-dev-087-browser` 在source check前seed A0002 root/parts並刪orphan links，不能作主資料完整性證據。
  - CA：一致性備份＋expected fingerprint dry-run後exact回填3 roots/3 parts、FK 15→0、staging 2→0；全initializer跨process lock與atomic count/ID/FK reconciliation；isolated build強制temp data/repository；detail relation anomaly局部降級並停用root-dependent actions；DEV-087 browser新增pre-seed source invariant。
  - PA：`AGENTS.md`新增任何build/test/runtime必須明示資料目錄與mutation scope；completion audit納入主資料FK/staging/count evidence；migration驗證固定2／5／11 process與中斷/re-entry；fixture mutation ledger不可覆蓋source baseline。
  - QA gate：`QA-094-001..012`；主DB recovery、negative/fault/concurrency/build invariants、orphan detail降級、A0002/A0005/A0003/A0006 rendered UI、fresh DEV-087 aggregate/typecheck/build/completion audit全部PASS且Blocked/Not Run/P0/P1=0。
  - 完成證據：主DB apply=`output/qa/dev-094-main-recovery/apply/manifest.json`（roots/parts 0→3/3、FK 15→0、staging 2→0、backup SHA-256=`AB43803C30A6A89E9D7810699511409FA6EEDEF8D1DFFFE9EC50B88086276698`）；第二次=`output/qa/dev-094-main-recovery/post-apply-noop/manifest.json`（NO_OP）。focused CAPA=`output/qa/dev-094/DEV094-2026-08-24T05-53-07-356Z/manifest.json` PASS；browser=`output/qa/dev-094-browser/DEV094-browser-2026-08-24T05-53-25-049Z/manifest.json` 31/31 PASS；fresh DEV-087 aggregate=`output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-24T05-53-07-065Z/manifest.json` 16/16 PASS，含91/91 affected browser、typecheck、isolated build與runtime dist cleanup gate。
  - Current state：主SQLite healthy，roots=3、parts=3、candidate=0、FK=0；第二次recovery為NO_OP。四次isolated build均PASS且主DB fingerprint不變；task-owned ports/temp roots已清理，既有非task-owned port 3000未停止。
  - 執行邊界：允許本機產品／測試／文件與 `data/ai-pdm.sqlite` 的可逆exact repair；apply前必須一致性備份、dry-run與expected fingerprint。禁止正式PostgreSQL／Cloud SQL mutation、deploy、cutover或release；不停止既有非task-owned port 3000 runtime。
  - 計入交付：是（本機主資料修復、因果鏈矯正、fresh QA/QC與runtime cleanup均完成）；否（production migration／cutover／deploy／release）。

- ✓ DEV-088 [交付點] [Local RD Implemented / Focused QA-QC PASS] [P1] [Production Migration & Release Gated] 替代料號附件人工沿用與安靜選擇
  - 摘要：替代料號建立時顯示來源formal Part目前有效直接附件並預設全選；使用者可取消任一／全部或在同一提交加入新檔。Drawing、Drawing Revision、`drawing_2d`與`cad_3d`不進候選。UI維持扁平安靜，不顯示件數、badge、risk card、token或第二wizard。
  - 來源 ID：`DEV-PDM-REPLACEMENT-PART-ATTACHMENT-REUSE-002`
  - 父任務：時序前置`DEV-087`；歷史來源`DEV-084`；相關`DEV-061`檔案歸屬與現行Part附件authority。
  - 直接 authority：`.ai-doc/specs/SPEC-PDM-PART-ATTACHMENT-REUSE-002-replacement-selection-snapshot.md`、`.ai-doc/decisions/ADR-PDM-PART-ATTACHMENT-REUSE-002-file-asset-snapshot.md`、`.ai-doc/qa/qa-dev-088-replacement-part-attachment-selection-2026-08-22.md`、`.ai-doc/qc/qc-dev-088-local-implementation-2026-08-22.md`。歷史DEV-084 SPEC／ADR／QA只供追溯，不能恢復五表平台、權限改寫或whole-part lease。
  - 實作：新增兩張最小snapshot/origin表與PostgreSQL 041；沿用建立獨立target `file_assets` row但共用immutable storage pointer，不搬source owner、不複製bytes、不後續同步。commit重算source token、同hash+size dedupe、batch insert、冪等；approval在同一transaction把draft assets promotion到formal Part，缺件整案rollback。
  - 權限／安全邊界：沿用既有candidate read、draft/release與Part attachment權限；anonymous與cross-company fail closed。依使用者優先序，不建立惡意payload、暴力猜測、側通道或證據偽造平台；正常auth/company/permission/idempotency/stale-tab仍是完成門檻。
  - 效能：21個來源附件建立使用14個SQL statements，candidate固定單次query，asset與origin皆batch insert，未出現逐檔N+1或physical bytes倍增。
  - 證據：`npm run qc:dev-088` 7/7 PASS；contract 40、repository 29、change-control 64、typecheck、127-page isolated build均PASS。HTTP 15/15、browser 37/37；最新browser manifest=`output/qa/dev-088/DEV088-2026-08-21T19-49-42-331Z/manifest.json`，所有task-owned ports與tracked Next type entry已恢復，3000未受影響。
  - 下一步／release gate：不得自動套用Cloud SQL 041、搬正式資料、deploy、release、production smoke或physical GC；若要上線須另走release gate並驗證041/042 order、正式provider storage pointer與rollback。
  - 計入交付：是；本機產品、QA與QC已完成，production交付仍未完成。DEV-087保持獨立commit `862ac611`，DEV-088目前未建立commit。

- ✓ DEV-089 [歷史基線／已由 DEV-090 取代] [Local RD Implemented / Focused QA-QC PASS] [P1] [Superseded / Production Release Gated] Canonical 圖料工作臺抽屜關聯矩陣
  - Supersession：DEV-090 已取代本段的 Relation detail/work projection、`relation_change_works` 與審核語意；本段只保留矩陣視覺基線與回歸證據，不得作為 current data／route／review contract。
  - 摘要：在新的 canonical 圖料工作臺抽屜明細恢復關聯矩陣；圖料抽屜只呈現矩陣、不呈現直接關聯，清單仍是唯一瀏覽模式，矩陣只呈現圖號、料號與製造／參考關聯，不恢復舊工作臺、舊狀態或第二套關聯權威。
  - 來源 ID：`DEV-PDM-CANONICAL-RELATION-MATRIX-001`
  - 父任務：`DEV-087`；直接 authority：`.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md` §6.3、§9.1、§12。
  - 實作（歷史基線，已由DEV-090取代）：Relation detail typed projection新增`matrix`；正式列只讀`drawing_part_links`，調整中只讀該列 exact `relation_change_works.proposed_tree`，禁止 formal fallback／混合。矩陣直接隨exact detail回傳並在drawer渲染；圖號／料號軸可前往各自canonical工作臺。不得再建立或讀取Relation current work。
  - UX：頁首沒有矩陣模式或切換器，也不新增`display/matrix` URL state。每一列打開原本抽屜後，只顯示該列關聯矩陣，不再顯示直接關聯；矩陣固定圖號欄、料號列與空白／製造／參考語意，容器自行負責水平捲動。上下鍵切列、detail reload與抽屜寬度偏好直接沿用既有mechanics。
  - 驗證：repository 29/29、contract 31/31、drawer版rendered browser 118/118、`typecheck:app`、125-page isolated build全部PASS。browser證明正式matrix位於drawer、Relation drawer沒有直接關聯區、無獨立模式／額外URL、detail reload、identity導航、overflow owner、drawer寬度／上下鍵既有功能及console/network gate；work empty-tree不fallback由repository exact fixture證明。evidence=`output/qa/dev-087/DEV087-2026-08-23T12-16-02-402Z/manifest.json`。
  - 執行邊界：未新增schema／migration，未修改正式資料、未stage／commit／merge／PR／deploy／release；正式使用仍隨DEV-087 production cutover/release gate。
  - 計入交付：是；本機功能與focused QA/QC完成，production交付未完成。

- ✓ DEV-095 [交付點] [RD Implementation Complete / Human Confirmed / Local QA-QC PASS] [P1] [Intentional Replacement / Production Migration & Release Gated] 舊組合件建立工作流與資料 authority 退役
  - 摘要：拆除DEV-060獨立`/bom/new`、已偵測組合件、CAD／XLS來源、`from-assembly`與assembly reference自動產生BOM，讓組立件回到既有Drawing／Part identity；本輪不建立替代入口或新組立流程。
  - 來源 ID：`DEV-PDM-ASSEMBLY-LEGACY-WORKFLOW-RETIREMENT-001`
  - 父任務／關聯：Intentional-replace `DEV-060`；保留`DEV-061`檔案authority、`DEV-087/093` canonical workbench/identity、generic BOM review/release與`DEV-041`技轉包。
  - 直接 authority：SPEC `.ai-doc/specs/SPEC-PDM-ASSEMBLY-LEGACY-WORKFLOW-RETIREMENT-001-canonical-workbench-boundary.md`；ADR `.ai-doc/decisions/ADR-PDM-ASSEMBLY-MASTER-ENTRY-001-canonical-workbenches-only.md`；QA `.ai-doc/qa/qa-dev-095-assembly-legacy-workflow-retirement-validation-plan-2026-08-24.md`；QC `.ai-doc/qc/qc-dev-095-assembly-retirement-2026-08-24.md`。
  - Spec Impact：`Intentional replacement`。使用者明確否決組合件走不同入口，故DEV-060三路徑不再是現行authority；技術移轉package不是組立件主檔入口，不在本輪退役。
  - RD範圍：刪除`/bom/new`與navigation/empty CTA、create-context/from-assembly/import-xls routes、assembly/CAD/XLS domain writers與auto-materialize；canonical create只允許manual。fresh schema與forward migration移除import tables、BOM source package欄位、assembly reference與舊source值；shared read tables若仍有非assembly consumer則保留但停止writer。
  - UX：採刪除優先，不建立施工中頁、redirect或平行入口；BOM workbench只保留既有BOM清單與續作，`.SLDASM`仍是Drawing revision合法`cad_3d`。
  - 驗收結果：舊route/caller/writer scan=0；頁面／context 404，舊POST writer path 405且zero-write，source-bound generic payload 422且zero-write；manual create/idempotent replay/edit/review/release snapshot通過；fresh/isolated migration clean、manual draft保留且rerun no-op；SLDASM通用契約不變；primary SQLite schema/identity/count/residue/FK前後完全相同。
  - 停止條件：需刪SLDASM通用能力、canonical Drawing／Part或generic BOM review/release；發現需保留的正式舊組合件資料；migration碰到非舊source／physical bytes／canonical roots；需要開始新組立流程時停止並另立DEV。
  - 證據：checkpoint=`codex/checkpoint-pre-assembly-retirement-20260824-142931`／`d4a7c84e50d0f47d3c9167404753d03690204f66`；`npm run qc:dev-095`、`typecheck:app`、122-page isolated build與三viewport browser全部PASS。primary schema hash=`b44df078de88ecbeef8afa67a8968a4fda283235bda66a354d54a0d6ba21b322`、identity hash=`89d366ecd9f01a9ccbd40aee471f150b10d7b327d2263283c17c04131c6f7562`、FK=0前後一致；task-owned port 3195與temp roots已清理。
  - 執行邊界：只在task-owned isolated data/repository執行mutation。主要SQLite、正式Cloud SQL、stage／commit／merge／PR、deploy與release均未執行；existing port 3000 runtime未被停止或重啟。
  - 計入交付：是（舊authority本機退役與QA/QC完成）；否（新組立流程與production migration/release）。

- ✓ DEV-096 [交付點] [RD Implementation Complete / Human Confirmed / Local QA-QC Complete] [P1] [Local Complete / Production Migration & Release Gated] 組立件情境式共用 BOM 重建
  - 摘要：在既有統一建立編號、Drawing／Part工作臺內重建組立件BOM，不恢復獨立入口。只有明確`結構型態=組立件`的exact Part context顯示`建立 BOM／開啟 BOM`；同root顏色變體可複選適用Parent Parts並共用一份BOM Revision／Snapshot。
  - 來源 ID：`DEV-PDM-ASSEMBLY-BOM-REBUILD-001`
  - 父任務／關聯：父交付點`DEV-095`；延續`DEV-093` canonical統一建號、`DEV-061` Drawing Revision檔案authority、`DEV-087/090` canonical identity／relation與generic BOM edit／review／release。
  - 直接 authority：SPEC `.ai-doc/specs/SPEC-PDM-ASSEMBLY-BOM-REBUILD-001-contextual-shared-structure.md`；入口ADR `.ai-doc/decisions/ADR-PDM-ASSEMBLY-MASTER-ENTRY-001-canonical-workbenches-only.md`；共用結構ADR `.ai-doc/decisions/ADR-PDM-BOM-STRUCTURE-SHARING-001-variant-part-applicability.md`；QA `.ai-doc/qa/qa-dev-096-assembly-shared-bom-rd-contract-validation-plan-2026-08-24.md`。
  - Human decisions：不新增sidebar／route／wizard；單一零件無BOM action；`.SLDASM`屬exact Drawing Revision，Parent由context確定；圖料根號檔名只解析root候選，不自動建Part或寫BOM；候選必須可複選，且Child複選是一個邏輯位置／變體集合，不是多line或quantity倍增。
  - Current Phase：先做無CAD依賴的情境式人工共用BOM。structure type authority固定Part Number；合法assembly為manufactured＋primary M；BOM action只在Part drawer。stable Definition／logical line、Draft／review／Released applicability snapshot、fixed／by-parent line與exact projection取代single owner authority；quantity／hierarchy／角色不同停止，Released Parent移除／detach／fork不在本期。
  - Future capsules：Phase 2為`.SLDASM`非同步結構建議、root／custom property／configuration解析、unresolved與diff後一次套用Draft；Phase 3才加入批次mapping、變體規則與完整impact analysis。兩者均`Future Phase Captured / Not Requested`。
  - RD Implementation Contract：初版與`建立下一版`沿用同一`POST /api/bom/drafts` writer及`GET /api/bom/applicability-candidates`；request明示context Part＋applicable Parent IDs、server-only exact major revision、base snapshot並要求`If-Match`＋idempotency。next Revision保留Parent superset與logical line，新增Parent的by-parent mapping不得按顏色猜測。save以同request的`components`保存fixed／by-parent candidates及exact mappings；sorted lock、Definition/editor versions與transaction保證zero partial write。review凍結schema-v2 JSON/hash；release建立immutable parent／mapping／resolved projection＋SHA-256；export、where-used、change-control、技轉包、approval及AI consumer皆使用exact Parent authority。
  - Exact schema／feature：`part_numbers.structure_type`＋`bom_drafts.definition_id/base_release_snapshot_id`＋tree/floating `logical_line_id`＋schema-v2 review/release欄；新增`bom_definitions`、definition/draft parent bindings、component node/candidate/selection、release parent/resolved rows及migration issues九張表。SQLite由`ensureDev096SharedAssemblyBomSchema`與exact marker／validation triggers，PostgreSQL固定transactional advisory-locked `048_shared_assembly_bom.sql`；default-off flag=`PDM_ASSEMBLY_SHARED_BOM_V1`且依賴canonical Part workbench與BOM XMind v2。
  - Migration：`scripts/migrate-dev-096-shared-assembly-bom.mjs`預設dry-run；existing canonical manual BOM按owner lineage建立Definition＋sole binding並保留Draft／review／snapshot／line history，exact item text backfill為stable logical line＋fixed canonical Child，review/release可重放才升schema v2。新增authority ID由stable source ID deterministic導出，不依賴crosswalk才能rerun；歧義進`bom_shared_structure_migration_issues`且fail closed。legacy owner欄只作compatibility投影，active owner-only create／revision／permission／release／export／where-used caller最終為0；不恢復DEV-095已退役source/schema。
  - Actual repo impact：SPEC §20固定add/modify/no-touch逐檔表，涵蓋schema/config、numbering、Part detail、BOM async repository/editor、review/release與五類consumer；沒有Current Phase delete清單。assessment時workspace已有709筆unrelated dirty entries，RD必須保存target hashes／touched ledger並最小重疊修改，禁止clean/reset或覆蓋使用者變更。
  - Lifecycle／security：Definition同時最多一個`Draft／Rejected／PendingReview／Archived` Revision；archive保留bindings且只可restore，manual set-active退役，explicit obsolete需整個Definition review。所有route共用Definition＋完整Parent capability resolver，cross-company=404、同company缺capability=403；submitter不得approve/reject自己。Audit/edit event與command同transaction，BOM不新增無外部side effect的platform outbox。
  - 驗收：QA-096-001..088由contract／migration／repository／mutation／consumers／browser／aggregate七個runner承接；包含named fault points、independent projection/hash oracle、revision/lifecycle、no-N+1 bounds、flag dependency、provider parity、retirement negative injection、primary isolation及四viewport accessibility。只有88/88、P0/P1=0、open issue=0、provider blocked=0及096-A～E aggregate全PASS才可完成。
  - 執行結果：096-A～E產品、schema、API、repository、consumer、UI與provider-aware migration已完成。最終fresh aggregate `output/qa/dev-096-aggregate/DEV096-2026-08-24T17-00-05-541Z/`為88/88 PASS、P0/P1=0、Blocked=0、Not Run=0；SQLite與disposable PostgreSQL實際repository mutation、42個named fault checkpoint、四viewport browser 26/26、typecheck、affected ESLint及123/123 isolated production build均PASS。
  - 執行邊界：所有mutation、migration與browser均在task-owned disposable data／repository／PostgreSQL執行；primary SQLite只有read-only前後比對，SHA-256固定為`f717739e8b165d4ea6a621133a14f7a7ea898c990f5c366efa85f82b662b8ec8`。未執行primary／Cloud SQL migration、flag activation、deploy、release或production smoke。
  - 下一步：正式環境需先做備份邊界、兩次獨立PostgreSQL rehearsal與zero-loss reconciliation，再另行取得migration／activation／deploy／release授權。若要求purchased assembly、Released Parent移除、partial obsolete、cross-root sharing或detach／fork，先重新進入產品決策。
  - 計入交付：是（Current Phase RD實作與本機QA/QC完成）；否（production migration、activation、deploy與release）。

- ✓ DEV-099 [交付點] [RD Implementation Complete / Human Confirmed / Local QA-QC Complete] [P1] [Full Aggregate QA 48/48 / Production Release Gated] 結構型態延後分類與 BOM readiness 解耦
  - 摘要：把建立圖料identity、exact Part結構分類與製造BOM readiness拆成三層。建號不再要求過早
    選單一零件／組立件；`unclassified`是合法暫態，之後只在既有料號抽屜設定，不建立新入口。
  - 來源 ID：`DEV-PDM-DEFERRED-STRUCTURE-CLASSIFICATION-001`
  - 父任務／關聯：Intentional-replace `DEV-093`的required structure type／first-Part inheritance／
    unclassified block，以及`DEV-096`的purchased assembly 422與Part change-only限制；保留單一建號入口、
    exact Part authority及shared BOM Definition／mapping／release authority。
  - 直接 authority：SPEC
    `.ai-doc/specs/SPEC-PDM-DEFERRED-STRUCTURE-CLASSIFICATION-001-numbering-and-bom-readiness.md`；ADR
    `.ai-doc/decisions/ADR-PDM-PART-STRUCTURE-CLASSIFICATION-001-deferred-exact-part-authority.md`；QA
    `.ai-doc/qa/qa-dev-099-deferred-structure-classification-validation-plan-2026-08-26.md`。
  - Human decisions：結構型態不在建號時強制選；只有assembly出現BOM區；同root顏色／規格變體可人工
    複選但不自動全選；root命名3D檔只解析root候選，不自動寫分類或BOM。
  - Numbering／data：new-root省略時明確寫unclassified；existing-root只有全部current Parts具有同一
    decided type才初始化新Part，empty／mixed／含unclassified都寫unclassified且不回寫既有Parts。
    新table／column／enum／backfill／migration=0；所有active Part writer必須明示值，不得依賴physical default。
  - Classification contract：`GET／PATCH /api/pdm/parts/[partId]/structure-type`提供bounded候選與atomic
    command；strong`If-Match`、idempotency、workbench token、exact IDs、current Part鎖定、最多100筆。
    decided-to-decided或批次變更要求reason；cross-root／inactive／stale／BOM conflict整批zero write。
  - BOM／UI：正常入口固定`/parts`→exact Part drawer→`設定結構型態`。只有assembly渲染BOM section；
    manufactured＋primary M依Definition顯示建立／開啟，缺M顯示blocker，purchased assembly可分類但無
    製造BOM action。無sidebar、Drawing／root入口、step/card或成功頁。
  - Security／transaction：mutation沿用`numbering.workspace.update`；cross-company=404、同company
    缺權限=403。root→sorted Parts→sorted BOM authority→receipt固定鎖序，before／after／reason audit
    與command同transaction，無外部side effect故不新增outbox。
  - Phase／估工：099-A contract／numbering→099-B repository／API→099-C Part UI／BOM projection→
    099-D provider／regression→099-E aggregate／handoff；`7.0～10.0 person-days`。不得把只完成server
    放寬視為可release。
  - 驗收：fixed `QA-099-001..048`；同一 parent aggregate 已完成 contract 48/48、isolated SQLite repository 7/7、
    authenticated headed browser 37/37（四 viewport、visible-error、stale recovery）、PostgreSQL 7/7、DEV-093／096
    回歸、writer inventory／negative injection與primary invariant／cleanup gate，全數 PASS。
  - 下一步：Production Release Gate；正式環境備份、migration rehearsal、activation、deploy、release與production
    smoke均需另行授權，不得由本機 PASS 推定已發布。
    需要schema／migration、正式資料回填、BOM detach／fork、supplier BOM、CAD/root自動寫入或primary
    mutation時停止回送Dev PM。
  - 阻塞／恢復條件：目前P0/P1產品決策缺口=0，Local RD可執行；production migration、activation、deploy與release未授權。
  - 證據：aggregate=`output/qa/dev-099/DEV099-2026-08-26T09-03-03-967Z/manifest.json`（48/48、Blocked=0、
    Not Run=0）；contract／repository／provider／browser artifacts均在同一 evidence root。primary SQLite schema、
    master counts、canonical identities、root refs與FK前後完全相同；所有task-owned runtime、fixture與temporary
    provider已清理。未執行production migration、deploy、release或Git stage／commit。
  - 計入交付：是（Current Phase本機產品、provider parity、rendered UI、回歸與aggregate QA完成）；否（正式資料
    migration、activation、deploy、release與production smoke）。

- ✓ DEV-100 [開發點] [Local RD Implemented / CAPA Effective / Local QA-QC Complete] [P1] [Local Fix Verified / A0044 Data Repair Human-Gated / Production Release Gated] 遷移圖號工作檔案合法替換後快照一致性 CAPA
  - 摘要：修正 migrated Drawing work 在合法替換同角色 primary 檔案後，upload transaction 已成功、read invariant 卻把 command 產生的 tombstone 誤判為快照毀損，造成 exact workspace GET 409、畫面保留 stale 假空狀態與後續操作受阻。本案是 `Implementation defect + transition verification control failure`，不是使用者誤操作、檔案遺失、SolidWorks 格式錯誤或 Part structure type 錯誤。
  - 來源 ID：`DEV-PDM-DRAWING-WORK-FILE-REPLACEMENT-CAPA-001`；CAPA=`CAPA-PDM-2026-08-26-001`。
  - 父任務／關聯：父交付點`DEV-087`；延續`DEV-092` work-owned exact snapshot與`DEV-095` `.SLDASM`合法`cad_3d`能力；`DEV-096` `.SLDASM`結構建議仍是Future Phase；`DEV-099` exact Part分類不重開。DEV-092原「遷移時漏建binding」closure保留為歷史，本DEV處理遷移後的mutable replacement transition。
  - 直接 authority：本段、`.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md` §0.5／§15.7.2，以及`.ai-doc/qa/qa-dev-087-status-data-rebuild-validation-plan-2026-08-21.md` §28。Spec Impact=`Compatible CAPA amendment + implementation correction`；ADR=`No New ADR`，因單一Drawing入口、work-owned snapshot與一個primary 3D authority均不改變。
  - 事實基線：affected work=`c65d1134-44d1-49d1-a689-74d83e75174a`，Drawing=`A0044-M01`、revision=`0.1`、`proposed_payload.migrated=true`。使用者依序上傳`A0044.SLDASM`、`A0044-M01.pdf`、`A0043.SLDASM`；`.SLDASM/.SLDPRT`同映射`cad_3d`，第三檔依last-wins合法替換第一檔。DB目前active bindings為`A0043.SLDASM(cad_3d primary, ordinal 0)`與`A0044-M01.pdf(pdf, ordinal 1)`；`A0044.SLDASM`binding／asset以`drawing_revision_work_file_replaced` tombstone。三個physical files均存在且SHA-256與DB一致。exact Part=`A0044-P01`目前`single_part`，但不參與409判定。
  - 根因分層：
    1. 現象層：三筆上傳UI均顯示成功，batch後GET重複409，workspace保留載入前的空files並誤顯「尚無檔案」。
    2. 直接原因：primary same-role replacement command合法soft-remove前binding／asset；migrated-only `assertWorkFileSnapshot`卻掃描所有source rows，將任何`removed_at`或deleted asset統一判成`source_asset_invalid`，未區分active source與command-owned tombstone。
    3. 系統原因：migration snapshot invariant假設source集合immutable，work-file mutation則允許replace/remove；兩邊對同一資料生命週期採不相容假設，造成write-success/read-fail。
    4. 控制失效：DEV-092驗證涵蓋0／1／3檔靜態快照與不同role的SLDDRW＋SLDPRT上傳，未覆蓋`migrated work × same-role replacement × immediate read`轉移；browser runner也沒有依使用者三檔順序驗證。
    5. 反事實：若read invariant以active work set為expected、明確認可無active binding引用的合法replacement tombstone，同序列可讀；而active asset deleted、missing／extra binding、hash／scope／ordinal drift仍會409。故根因已足以區分合法轉移與真實毀損。
  - 立即圍堵（Containment）：
    1. affected A0044-M01暫停重傳、刪檔、取消工作與送審；保留三檔bytes、hash、binding／asset rows與錯誤證據，不以反覆上傳嘗試修好狀態。
    2. 409維持fail closed；禁止改成200、忽略invariant或讓UI直接fallback讀revision files。workspace載入失敗時凍結upload／submit／remove，僅顯示一項可行動的「資料讀取失敗，暫停操作」訊息，不投影stale空files為正常empty。
    3. primary SQLite在code與隔離fixture驗證完成前只准唯讀inventory／fingerprint；任何repair apply前需一致性備份、expected delta、dry-run與人類選定最終primary。
  - CA（矯正措施）：
    1. 重構`assertWorkFileSnapshot`：active source僅含`removed_at IS NULL`；active source必須有live asset／hash，actual work bindings須與active expected set在company／drawing／revision／binding／ordinal／hash完全相等。
    2. tombstone只在「無active work binding引用、刪除原因屬allowlisted work command且可追溯」時排除expected；不得用「忽略全部deleted rows」掩蓋active asset deleted。missing／extra binding、active missing/deleted asset、hash／scope／ordinal mismatch與cross-company仍回stable 409。
    3. same-role primary replacement完成後，在同一transaction以同一canonical invariant驗證post-write state；若commit後立即讀取會失敗，upload不得先回成功。retry／response loss沿用idempotency與rowVersion，不能建立第二次替換或孤兒asset。
    4. client收到load 409時清楚區分「合法零檔」與「資料快照需修復」；後者不渲染stale data、不顯示錯誤的缺2D／3D readiness、不允許後續mutation。若同批選取多個primary 3D，upload前以exact filenames提示「後一檔將取代前一檔」，不增加wizard或新入口。
  - A0044 bounded data recovery gate：code／QA通過後產生只讀repair plan，但apply前必須由人類選一項：`A`保留目前last-wins的`A0043.SLDASM`；`B`恢復`A0044.SLDASM`並retire A0043；`C`取消work重建（不建議）。未選定不得猜測檔名根號、Part關聯或上傳順序意圖。PDF維持active non-primary；現行送審仍要求native primary `.SLDDRW`與primary `.SLDPRT/.SLDASM`，不得把PDF自動當2D主檔。
  - PA（預防措施）：
    1. 所有mutable snapshot invariant必須有`create → add → replace → remove → retry/response loss → immediate read`transition coverage，並覆蓋migrated與new work、SQLite與PostgreSQL；流向project QA checklist／DEV-087 completion gate，不修改全域skill。
    2. 新增same-role矩陣：SLDASM→SLDASM、SLDPRT→SLDASM、SLDDRW→SLDDRW；另驗different-role upload、合法tombstone與active deleted/missing／binding extra/missing／hash／scope／ordinal異常。
    3. authenticated rendered browser依exact A0044三檔順序操作，核對UI／API／DB／bytes四方、visible error、console/network、四viewport與warning；不得以direct API postcondition或靜態截圖替代。
    4. 保留mutant：舊`source_asset_invalid`規則必須讓新same-role案例失敗；另一mutant「跳過所有deleted rows」必須被active-deleted-asset negative拒絕，證明validator對兩邊都有敏感度。
  - 效用與取捨：
    | 對策 | 根因消除 | 使用者風險降低 | 成本／範圍風險 | 裁定 |
    |---|---:|---:|---:|---|
    | 修正active/tombstone invariant＋post-write read gate＋雙mutant | 高 | 高 | 中 | Current Phase 必做 |
    | 多primary檔名替換提示＋409凍結錯誤畫面 | 中 | 高 | 低 | Current Phase 必做 |
    | 只要求使用者「小心上傳」 | 低 | 低 | 低但無效 | 拒絕作為CA／PA |
    | 現在實作`.SLDASM` assembly parser／自動BOM | 與本根因無關 | 未直接降低409 | 高 | 留在DEV-096 Future Phase |
  - UI Entry Contract：唯一正常入口仍為`/numbering/drawings`→exact Drawing work；same-role替換提示鄰近檔案選擇區，錯誤為單一inline banner。不得新增sidebar、組立件頁、modal wizard或第二個file authority。正常空work可繼續上傳；snapshot invalid work只允許返回清單與系統管理修復，不顯示可送審假象。
  - Verification Integrity Matrix：
    | 結論 | 執行動作 | UI證據 | API／DB／bytes postcondition | Negative／mutant | 防自證循環 |
    |---|---|---|---|---|---|
    | 合法same-role替換可立即讀取 | 真實upload A→PDF→B | 檔案列只顯示B＋PDF、無409、提示可見 | active set exact、A tombstone可追溯、hash全存在 | 舊validator mutant需FAIL | expected由獨立fixture/oracle重算 |
    | 真實毀損仍fail closed | 注入active deleted／missing／drift | 單一修復訊息、mutation disabled | stable 409、zero business delta | skip-all-deleted mutant需FAIL | 不採SUT summary作expected |
    | retry不重複替換 | response-loss後同idempotency重送 | 最終單一成功狀態 | rowVersion／receipt穩定、無orphan | 改key重送仍服從stale guard | raw rows與assets另行盤點 |
    | A0044 repair安全 | backup→dry-run→人類選A/B→apply | hard reload顯示選定primary | exact delta／FK／hash／invariant PASS | target fingerprint不符即停止 | apply plan與驗收readback分離 |
  - QA／QC gate：依主QA §28固定`QA-100-001..018`；完成需18/18、Blocked=0、Not Run=0、P0/P1=0，SQLite／disposable PostgreSQL parity、authenticated browser、兩個named mutants、typecheck／affected lint／isolated build、primary schema／master identity／FK前後不變與task-owned cleanup全部PASS。CAPA effectiveness只能由fresh parent aggregate與Independent QC宣告，PM文件、focused單案或「不再看到錯誤」不得計為產品完成。
  - 完成證據：fresh DEV-100 aggregate=`output/qa/dev-100/DEV100-2026-08-26T11-50-35-191Z/manifest.json`，固定分母`18/18 PASS`、Blocked／Not Run／FAIL／P0／P1=`0`，13/13 commands PASS；SQLite transition／fault／retry／雙mutant、disposable PostgreSQL 6/6、headed authenticated browser 28/28（含exact三檔順序、409凍結、四viewport／200% zoom）、typecheck、affected lint與isolated build均PASS。parent integration=`output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-26T11-49-52-656Z/manifest.json`已對DEV-100 child驗證為`PASS`；該父aggregate因舊DEV-097 anti-cheat分母而`FAIL / completionCandidate=false`的結果自2026-08-27起只作Historical Supporting，不反向降級本DEV證據，也不替代DEV-087新94＋3 fresh aggregate。既有QC紀錄=`.ai-doc/qc/qc-dev-100-drawing-work-file-replacement-capa-2026-08-26.md`。
  - Phase：`100-A invariant contract／fixture`→`100-B repository transaction／stable error`→`100-C workspace state／same-role warning`→`100-D provider／browser／mutants`→`100-E A0044 dry-run plan／human gate`→`100-F fresh aggregate／handoff`。100-A～D與dry-run可直接執行；A0044 apply、production migration／deploy／release需另行授權。
  - Out of Scope：新增組立件入口、從多個SLDASM推導parent／child、自動建立Part／BOM、CAD內容解析、變更single primary規則、PDF升格為native drawing、Part structure type自動分類、正式資料repair、physical delete、production deploy／release。
  - 執行邊界：已完成產品、SQLite／PostgreSQL repository invariant、transaction checkpoint、UI freeze／warning、DEV-100 evidence package及DEV-087 child-validation整合；並修正PostgreSQL `043_inline_relation_matrix.sql`在退役`relation_change_works`後仍由surviving guard function引用舊表的provider rehearsal blocker。所有mutation僅在task-owned isolated `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`與disposable PostgreSQL／browser fixture，primary只讀；既有port 3000未停止或重啟。未stage／commit／merge／PR、未執行primary A0044 repair、production migration／deploy／release。
  - 計入交付：否。DEV-100是已完成的修正／驗證開發點，不重複計為產品交付點；A0044 primary資料選擇與apply仍受Human/Data Repair Gate，`applyCount=0`，不能用code PASS自動越過。

- ✓ DEV-101 [交付點] [Local RD Implemented / Independent QA-QC Complete / Fixed QA 48 of 48 PASS] [P1] [Production Release Gated] 審核工作臺共用圖號／料號完整工作區
  - 摘要：讓 PDM 審核者直接進入與編輯者相同的 canonical Drawing／Part domain workspace，沿用相同
    資訊架構、欄位順序、預覽、檔案位置與操作肌肉記憶；review mode 只更換資料來源、能力與決策列，
    不再依審核情境維護另一套裁切內容或 approval-only detail body。
  - 來源 ID：`DEV-PDM-APPROVAL-CANONICAL-REVIEW-WORKSPACE-001`。
  - 父任務／關聯：承接 `DEV-070` 的審核清單共用 mechanics 與 exact return、`DEV-067` 的 domain-owned
    projection／snapshot／review scope、`DEV-079／083` 的 canonical full-page owner workspace，以及
    `DEV-087` 的 Drawing／Part current data authority；`DEV-090` Relation workbench／review 退役結論不重開。
  - 文件成熟度：`Local RD Implemented / Independent QA-QC Complete / Fixed QA 48 of 48 PASS /
    Production Release Gated`。19項產品決策不變；兩份CAPA已補入
    canonical inbox adapter、正常入口、v1／v2分流、full recognition projection／inner hash、owner fail-closed、
    latest-session isolation、anti-false-PASS與單一完成出口。RD supporting evidence本身不計固定case；獨立四runner
    aggregate才形成48/48 local completion candidate，且仍不等於可部署。
  - 直接 authority：
    - SPEC：`.ai-doc/specs/SPEC-PDM-APPROVAL-CANONICAL-REVIEW-WORKSPACE-001-snapshot-package-and-shared-renderers.md`。
    - ADR：`.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md` DEV-101 amendment。
    - QA：`.ai-doc/qa/qa-dev-101-approval-canonical-review-workspace-validation-plan-2026-08-26.md`，固定
      `QA-101-001..048`；固定48案已由獨立四runner同源執行48/48，RD runner仍只屬supporting，詳見QA §9A與closure receipt。
    - CAPA：`.ai-doc/qc/qc-dev-101-approval-inbox-discoverability-capa-2026-08-27.md`；
      `.ai-doc/qc/qc-dev-079-dev-101-recognition-owner-review-parity-capa-2026-08-27.md`。

  - 2026-08-27 CAPA重開：
    1. 已知事實：A0002-M01的request `234ebcc8-9ed4-4b78-a004-42212729d76b`為pending、指派
       `user-manager-demo`，canonical state=`review_owner`；approval inbox仍回0筆。
    2. 根因：SPEC誤把canonical PDM request已進DEV-070 inbox當成既有能力，並把必要的approval inbox
       repository列為no-touch；RD只完成detail route，focused browser又以direct URL繞過正常入口。
    3. CA：同一DEV補`pdm_work_review` inbox adapter、exact reviewer／company／status／query filter、server href、
       normal submit→list→page→return與v1／v2分離；既有A0002 v1不backfill、不改hash、不direct delete。
    4. PA：UI Entry Gate、source-to-inbox coverage matrix、adapter-removal mutant、evidence taxonomy、single status
       receipt與runtime activation readback；CAPA文件本身不計產品完成。
    5. Stop：若需要schema／backfill／primary data mutation、改decision semantics或把`applying`重新變成reviewer
       可決策狀態，立即停止回PM／人類決策。

  - 2026-08-27 owner-review parity CAPA修訂：
    1. 已知事實：A0002-M01 relation已正確關聯A0002-P01；同一recognition session中native candidates有exact
       owner，browser PDF candidates卻為`part_number + NULL owner`，其中材質／表面處理／熱處理已在送審前被accept。
    2. CAPA發現時的審核證據缺口：既有request為v1 narrow snapshot，沒有recognition projection；當時v2 builder也只
       保存recognition meta。local corrective implementation現已補exact full projection與inner hash，但不回寫該v1 request。
    3. CA：同一DEV補full versioned recognition projection、owner resolution、blocking reason與hash coverage；reviewer
       只讀package，live data只能作明確drift compare。受影響v1案走正常退回／重送，不backfill、不改hash。
    4. PA：新增editor→submit→review hash parity、latest-session leak mutant、actual runtime writer readback與normal-path
       v2 request；現行固定分母48案已由independent local aggregate 48/48完成，production effectiveness仍須actual runtime與release smoke。
    5. Spec impact：DEV-101原屬`Implementation needs correction`；local correction與automated effectiveness candidate已完成，既有產品決策不變，無需新增ADR。

  - 問題與使用者價值：
    1. 現行審核清單已開始共用 PDM workbench mechanics，但清單、抽屜與全頁工作區仍存在不一致的
       開啟方式與 detail composition；審核者可能看到 owner editor 的子集合，而非送審者當時的完整內容。
    2. 以 `none／summary／full` 或案件類型決定顯示哪些 domain 區塊，短期看似降噪，長期會建立第二套
       資訊規則；新增欄位、檔案或風險時，編輯面與審核面容易再次漂移。
    3. 案件若同時涵蓋 Drawing 與 Part，單一 primary `canonicalEntityType` 只能決定首要入口，不能保證
       審核者已看見整包所有圖號、料號、版本與彼此關係。
    4. 目標不是讓 reviewer 看見更多卡片，而是讓同一工程事實在 edit／review 之間只有一套排列與語意，
       降低尋找、比對與誤判成本，並讓使用者沿用既有肌肉記憶。

  - Human Confirmed Decisions：
    1. 不論 PDM 審核情境，從 `/approvals` 開啟案件後，直接進入 canonical Drawing／Part workspace 的
       `review` 模式；不先用 approval drawer 重新組裝或裁切 domain 內容。
    2. 完整資訊必須可達，由審核者決定檢視深度。系統固定呈現「本次送審範圍、變更與風險」，但不以
       閱讀追蹤、確認勾選或阻擋式 gate 取代審核者判斷，也不決定哪些完整內容永遠不顯示。
    3. edit 與 review 使用相同 domain section、view model、欄位順序、2D／3D 預覽、附件／受控檔案與
       關聯位置；review 為唯讀，編輯 action dock 由 approval decision dock 取代。
    4. review 的事實來源固定為 immutable submitted snapshot；只有偵測到 live master／current work 與
       snapshot 不同時才出現清楚標示的 comparison／drift 入口，且不能靜默替換送審快照。
    5. 多目標案件採「上方關聯矩陣＋下方單一完整目標」：矩陣列出送審快照內全部 Drawing／Part
       identity、revision／version與關聯，審核者在矩陣點擊切換，下方一次顯示一個 target 的完整 workspace。
    6. 關聯矩陣是 submitted-snapshot 的唯讀目標導航，不提供 formal relation edit，也不恢復 Relation
       workbench／Relation review。切換 target 只改變目前檢視焦點，不改 snapshot 或 decision scope。
    7. approval decision dock 永遠可操作；系統不追蹤已讀／未讀、不要求開啟全部 target／section、
       不增加高風險確認 gate。scope／change／risk 保持可見，最終檢視深度由審核者負責。
    8. 矩陣只有 Drawing／Part identity名稱是target-switch control；交叉格只顯示submitted-snapshot關係，
       不可點擊、不可切換relation type，也不開啟配對摘要。此行為沿用既有矩陣identity button語意。
    9. 矩陣範圍是送審當下完整同根Drawing × Part，而非只有本次targets；本次送審項目必須以非色彩
       唯一依賴的方式明確標記。未納入送審者只供關係脈絡，不得被誤算進decision scope。
    10. `activeTarget`是可分享、可返回的URL state；URL有合法target時還原該target，否則顯示request
        primary target。scope／change／risk可以提示其他目標，但不自動奪走使用者選取。
    11. 送審範圍、變更與風險直接在矩陣identity旁以圖形、輪廓、圖樣或狀態呈現，不放常駐文字標籤，
        且不得只靠顏色。文字說明統一收進同一個懸浮說明層；該層同時支援hover、鍵盤focus與tap，
        marker另具accessible name／description，active-target選取態不得與scope／change／risk標記混用。
    12. 只有偵測live drift時，active-target header才顯示無常駐文字的可操作視覺標記；啟動後在同一頁
        以submitted snapshot在左、current state在右並排比較。snapshot始終是decision truth，current只供
        差異判讀；關閉比較後回到原active target與捲動脈絡。
    13. approval decision dock沿用editor action dock的頁面底部sticky位置與空間節奏，但只提供合法審核
        決策；它永遠可操作、不複製到header／右欄，也不得在窄版或200% zoom遮住內容與鍵盤焦點。
    14. marker說明層在hover／focus時暫時顯示；click／tap marker後固定，直到再次啟動、外點或Escape
        關閉。同一時間只允許一個說明層；marker與identity名稱使用分離hit target，避免查看說明時誤切
        active target，且固定後的焦點必須可預期地返回原marker。
    15. 窄版仍保留Drawing × Part矩陣，不改成清單或收進drawer。矩陣擁有自己的水平平移邊界、sticky
        row／column axis與active-target auto-reveal；頁面本身不得產生水平overflow，下方仍是單一完整
        target workspace，維持桌面與窄版相同的資訊模型。
    16. drift compare在desktop維持snapshot左／current右；窄版改為同一比較區內水平滑動切換兩個pane，
        預設停在snapshot。swipe不是唯一入口，必須另有可點擊、可鍵盤操作的兩態切換；「送審快照」與
        「目前狀態」是decision evidence身分而非marker說明，必須在當前pane保持可見且不可只放tooltip。
    17. 多目標案件沿用request-level decision authority，整份submitted package一次核准／退回修改；需要補件
        仍使用`return_for_correction`，不新增`needs_info`或per-target decision status。所有submitted targets共同構成原子decision scope，context-only
        identities不在scope內；切換active target只改檢視焦點，不改決策範圍或產生部分發布結果。
    18. drift compare預設只展開有差異的section／field，未變內容收合但始終可由同一pane展開查看；不得
        只傳或只顯示diff而使完整snapshot／current不可達。差異定位是注意力捷徑，不是新的資料來源，
        欄位判讀仍以兩側完整domain projection與snapshot provenance為準。
    19. submitted target、change與risk使用固定順序、彼此獨立的視覺marker槽位，可在同一identity同時
        出現；不合成為單一highest-severity glyph，也不以整列背景承擔多重語意。缺少某狀態時保留穩定
        對齊但不顯示裝飾占位，active-target selected態維持另一條獨立視覺通道。

  - 設計裁定與批判：
    - 優雅的共用單位是「同一 domain workspace + 不同 surface capabilities」，不是把所有 Drawing、Part、
      approval 條件塞進一個巨型元件。Drawing 與 Part editor 必須維持 domain ownership。
    - 應共用的是 renderer、section order、view model 與 interaction mechanics；必須分離的是 live edit
      command、owner permission、submitted snapshot load、review assignment、decision、audit 與 concurrency。
    - 「完整資訊」不等於同時 mount 全部 target。上方矩陣承擔關係與切換，下方只 mount active target
      的完整 domain workspace；這是焦點管理與效能邊界，不是依情境刪除內容。
    - PDM approval drawer 不再是正式決策內容 owner。若保留 quick peek，只能使用同一 domain summary
      projection且不得承載核准／退回；正式 decision path 以 full-page review workspace 為唯一入口。

  - 目標架構膠囊：
    ```ts
    type WorkspaceSurface =
      | { mode: "edit"; source: "live_work"; workId: string }
      | {
          mode: "review";
          source: "submitted_snapshot";
          requestId: string;
          submittedAt: string;
          allowedDecisions: readonly ReviewDecision[];
        };
    ```

    ```text
    ApprovalWorkbenchList                    ← DEV-070 shared list mechanics
      └─ server-authorized reviewHref
          └─ ReviewPackageWorkspace          ← review orchestration only
              ├─ ReviewContextBar            ← scope / submitter / time / snapshot / drift
              ├─ ReviewTargetRelationMatrix  ← fixed marker slots; bounded pan + sticky axes
              ├─ AccessibleMarkerOverlay     ← transient hover/focus; pinnable click/tap
              ├─ ActiveTargetWorkspace
              │   ├─ CanonicalDrawingWorkspace(mode=review, snapshot view model)
              │   └─ CanonicalPartWorkspace(mode=review, snapshot view model)
              ├─ SnapshotDriftCompare        ← changed-first; complete panes remain reachable
              └─ ReviewDecisionDock          ← bottom sticky; package-atomic request decision

    CanonicalDrawingWorkspace(mode=edit, live view model)
    CanonicalPartWorkspace(mode=edit, live view model)
    ```

  - 主流程：
    1. 審核者在共用清單以既有搜尋、篩選、鍵盤與分頁找到案件。
    2. 點列後由 server-authorized `reviewHref` 進入該 request 的 full-page review workspace；URL 保留 exact
       `returnTo`，不依 PDM subtype 在 drawer／page 間分叉。
    3. 固定header保留案件層摘要；其下的唯讀關聯矩陣呈現送審當下完整同根Drawing × Part，並以
       無常駐文字、非色彩唯一依賴的視覺標記區分submitted target、變更、風險與context-only identity。
       三種marker以固定槽位獨立並存；文字說明由同一個hover／focus／tap懸浮層按需揭露，不另建
       常駐legend或說明卡。
    4. URL有合法`activeTarget`時先還原，否則顯示request primary target。審核者點擊矩陣的Drawing／Part
       名稱切換active target；交叉格不可點。下方以與editor相同的位置顯示該target完整snapshot內容。
       若active target已漂移，點header視覺標記開啟同頁唯讀比較：desktop為snapshot左／current右，窄版
       預設snapshot並以swipe或兩態控制切換current；當前pane的證據身分保持可見，差異section優先展開，
       其餘完整內容仍可就地展開。
    5. 核准／退回修改只經 approval decision authority；需要補件沿用退回修改，不新增第三種decision。完成或返回後恢復原清單 query、cursor、
       page 與 selection，並只刷新受影響列與 pending count。底部sticky decision dock不依矩陣切換紀錄
       改變可用性；每次decision原子作用於整份submitted package，且全頁沒有第二組重複決策控制。

  - Current Phase Scope：
    - 保留 DEV-070 approval row projection 與 shared list mechanics，統一 covered PDM row 的 full-page
      review navigation；消除同類案件一部分直達 page、一部分先開 drawer 的差異。
    - 將 Drawing／Part workspace 抽出穩定的 surface capability 與 shared domain view model boundary，讓
      edit／review 共用相同 domain renderer，不複製欄位、預覽、檔案與 section JSX。
    - 建立 review package shell，負責 request context、完整同根唯讀submitted-snapshot矩陣、URL-backed
      active target、矩陣identity視覺標記、可存取懸浮說明層、snapshot provenance、條件式同頁drift
      desktop左右／窄版水平切換比較，以及底部sticky decision dock。
    - 單一 Drawing、單一 Part、Drawing + Parts及多目標package都必須能由矩陣看見完整同根snapshot；
      submitted targets／change／risk以非色彩訊號區分，不放常駐文字。點擊identity名稱後顯示完整
      workspace並同步active target URL；三種marker依固定獨立槽位並存，說明可由hover／focus暫時取得，
      並由click／tap固定。
    - 窄版矩陣保留相同Drawing × Part模型，以自身水平平移區、sticky axes及active-target auto-reveal
      避免頁面overflow；drift compare另有獨立手勢邊界，不得與矩陣平移或瀏覽器返回手勢互相觸發。
    - review mode 全面封鎖 domain write controls，保留合法 preview／download；權限、assignment、company
      scope、separation of duties、decision idempotency與audit沿用既有 server authority。
    - decision仍由既有request-level authority原子處理submitted target manifest；active target、marker、
      差異展開狀態與瀏覽軌跡都不是partial decision或publication input。

  - Out of Scope：
    - 不把 Drawing／Part 合併成 `GenericPdmWorkspace`，不把 domain condition 寫進 shared core。
    - 不重啟已由 DEV-090 退役的 Relation workbench／Relation review。上方矩陣只讀submitted snapshot；
      cell不得可點，不得出現edit mode、draft relation、save、配對摘要或relation decision。
    - 不改審核資格、assignment、status machine、decision semantics、publication、audit、lifecycle command
      或 production data authority。
    - 不允許 review mode 寫入 live work／master，也不以 live master 補掉 snapshot 缺欄位。
    - 不接受color-only、pure-hover-only或沒有accessible name的marker；不在identity旁常駐顯示「送審」、
      「變更」、「風險」等說明文字，也不以tooltip承擔其他位置完全不存在的必要流程教學。
    - 不把live欄位直接混入snapshot內容，不以modal、跳頁或current-only畫面取代同頁snapshot／current
      比較；不在header、右欄或內容區複製第二組approval decision actions。
    - 不建立per-target核准狀態、部分核准或部分發布；不以單一最高嚴重度glyph吞掉submitted／change／
      risk的其他事實，也不把整列背景同時當成多種狀態語意。
    - 不把changed-only payload或diff view當成完整審核內容；未變section可預設收合，但不得刪除、拒絕
      展開或改讀live data補齊。
    - schema／migration disposition已固定為`none`：使用既有immutable `snapshot_payload`與`snapshot_hash`；
      不新增table／column／trigger、不backfill v1。若實作證明必須DDL或背景補snapshot，立即停止回SPEC。
    - 不含本SPEC未列的其他產品實作、正式資料變更、stage／commit／merge／PR、deploy 或 release。

  - 驗收方向：
    1. 同一 Drawing／Part 內容在 edit 與 review 的 section 順序、欄位標籤、preview／file 位置與主要識別
       一致；差異只來自 surface capability、snapshot context、change/risk guidance 與 decision dock。
    2. Drawing-only、Part-only、Drawing + Parts與多目標案件都顯示送審當下完整同根唯讀矩陣；submitted
       targets與context-only identities可區分。只有identity名稱可點，每個identity都可切到其完整snapshot。
       同一identity可同時顯示submitted／change／risk三個固定槽位marker；缺少其中一種不造成其他marker
       位移，且不使用單一highest-severity glyph或整列背景取代多重狀態。
    3. scope／change／risk marker沒有常駐文字且不用顏色作唯一訊號；hover、鍵盤focus與tap均可開啟
       同一說明層，讀屏可取得等價名稱／描述。hover／focus為暫時態，click／tap可固定且同時只開一個；
       外點或Escape關閉後焦點回原marker。active-target selected態與各marker在灰階、高對比及200%
       zoom仍可區分，查看marker不會誤切target，說明層不遮住目前identity。
    4. 合法`activeTarget`可經hard reload、Back/Forward與分享URL還原；無值或失效時回primary target且
       不改snapshot。只有live state已變才顯示drift marker；desktop同頁清楚分隔snapshot左／current右，
       窄版預設snapshot並能以swipe、tap及鍵盤切換兩個pane。當前pane證據身分保持可見，snapshot仍是
       decision evidence；有差異的section／field預設展開，未變內容可展開且資料完整。關閉後還原原
       target與捲動脈絡，snapshot hash／version不變。
    5. review surface 除 decision API 外，對 Drawing／Part mutation routes 為零；隱藏按鈕不能代替 server
       deny，無權限、跨公司、非assigned reviewer與已決案件均 fail closed。
    6. scope／change／risk在未切換target前仍可辨識；底部sticky decision dock不因未開啟某target或
       section而disabled，不記錄已讀狀態、不要求逐項確認，也不把瀏覽軌跡寫成審核證據。全頁只有
       一組decision actions，每次decision原子涵蓋完整submitted target manifest，active target不會縮小
       scope，也不存在per-target decision state。desktop／tablet／mobile及200% zoom皆不遮住內容、焦點
       或系統操作區。
    7. `/approvals` 不再維護 covered PDM 的第二套 detail body；靜態與 rendered evidence 能證明 renderer
       共用，而不是只有視覺仿製。返回後 exact filter／cursor／selection 與 affected row refresh 正確。
    8. desktop／tablet／mobile 與200% zoom無非預期頁面overflow、矩陣不可操作、sticky dock遮擋或
       雙scroll owner；large matrix在自身邊界內平移，sticky axes與active-target auto-reveal可用，頁面不
       跟隨橫移。矩陣平移、compare swipe及瀏覽器返回手勢不互相誤觸；loading、preview failure、media
       unavailable與decision conflict皆有可恢復狀態。

  - RD Implementation Contract：
    - persisted v2 envelope=`pdm-review-package-v2`，保存submittedAt、primary、decisionBasis、root、完整同根
      matrix與所有Drawing／Part target workspace snapshots。column`snapshot_hash`驗整包；envelope內
      `decisionBasis.hash`只驗primary formalization；target／matrix evidence hash只判live drift，三者不得混用。
    - existing writers本期產生`1 submitted + N context_only`；reader／UI支援多submitted target fixture與未來
      writer，但不新增multi-target authoring。decision仍由既有POST對整個request原子執行。
    - shell GET只讀snapshot；active target與comparison各有exact membership route，live只計drift／current
      compare，不回填snapshot。Part附件v2保存submitted manifest，仍不鎖、不進decision basis；舊live list＋
      常駐note只保留legacy v1。
    - Drawing recognition projection固定schema=`pdm-recognition-review-projection-v1`，依exact
      `drawingId + drawingRevisionId + drawing_revision context`批次zero-write讀取session、sources、candidate
      decisions、observations、fields/scopes、ownerResolution、effectiveOwnerId與blockingReason；inner projection hash、
      target hash與outer package hash分層驗證。editor API與review package共用同一projector／panel，reviewer不呼
      latest session。legacy meta-only與unresolved／ambiguous owner拒絕approve但保留return，不backfill v1。
    - hard limits：targets<=200、matrix cells<=2,500、canonical JSON<=8MiB；超限在建request前422、zero write。
      builder package資料query<=18且禁止N+1；shell 1 request row／0 domain live query；單target/compare<=14。
    - exact add／modify／no-touch map與API DTO以SPEC §7／§11為準；schema files、generic approval handlers、
      `drawing_part_links` formal writer與permanent review trace shape為no-touch。
    - v1/v2 dual reader；default-off `PDM_REVIEW_PACKAGE_V2_WRITE`只控制新write，不能關閉pending v2 read／
      decision。production convergence前`pending_v1=0`，不得backfill、direct approve或delete。
    - phase=`101-A contract/projector`→`101-B v2 writer/hash`→`101-C shared renderers/shell`→`101-D matrix/
      compare/file-read`→`101-E fixed QA/provider/browser`→`101-F local handoff`；估工`8～12 person-days`，不含
      production activation／release。
  - UI Entry Contract：exact reviewer由`/approvals`進`/approvals/[requestId]`；`activeTarget=type:id`由URL還原，
    invalid值replace primary。Drawing／Part各自只有一個domain content renderer；review為snapshot source＋
    readonly capabilities。matrix只點identity、三marker固定獨立slots且無常駐文字；desktop／narrow compare、
    sticky dock、focus／overlay／scroll／200% zoom行為以SPEC §8固定。
  - Verification／QA gate：固定48案，涵蓋strict parser、package/basis/evidence／recognition inner hashes、snapshot不被live替換、
    Part附件例外、transaction/idempotency、limits/query、exact permission/file membership、shared renderer、
    URL、matrix/markers、a11y/RWD、legacy/generic/Relation regression、canonical list projection、normal UI journey、
    recognition editor→submit→review parity、owner fail-closed、latest-session leak、runtime activation readback、
    disposable PostgreSQL、isolated build與anti-false-PASS mutants。QA/QC完成需48/48、
    Blocked／Not Run=0、P0/P1=0、Independent QC與cleanup全PASS。
  - RD完成證據：`output/qa/dev-101-aggregate/DEV101-AGGREGATE-RD-2026-08-27T10-55-37-882Z/manifest.json`為
    `RD_IMPLEMENTATION_READY`、11/11 lanes PASS；contract 22/22、package 15/15、inbox 7/7、repository 5/5、
    v2 normal-path browser 28/28、API 5/5、v1 normal-entry 16/16、disposable PostgreSQL 10/10、DEV-090 regression、
    typecheck、affected lint與isolated build皆PASS。source／primary fingerprint before=after、FK=0、task temp removed，
    ports 60071／52679／56979已釋放。該receipt維持`RD_SUPPORTING_ONLY_NOT_INDEPENDENT_QC`；其後獨立四runner
    已於固定registry完成current-source 48/48 PASS，manifest=`output/qa/dev-101-independent-aggregate/
    DEV101-INDEPENDENT-AGGREGATE-2026-08-27T15-19-16-555Z/manifest.json`，權威closure見
    `.ai-doc/qc/qc-dev-101-independent-qa-qc-closure-2026-08-27.md`。
  - Git／執行邊界：assessment branch=`持續優化2`、HEAD=`818db82a`；target files已有既有dirty changes。
    RD開始前先記base／target hashes／touched ledger並以目前working tree為準，不得reset、清理或覆寫無關變更。
    本輪產品實作與隔離驗證使用task-owned runtime／data／repository；未修改primary schema/data，未stage／commit／merge／PR／deploy／release。
  - 風險等級：`Medium / P1`。主要風險是把「完整」誤作首屏全部展開造成效能與認知負荷、snapshot 欄位
    不足而偷讀live data、完整同根snapshot放大payload、context-only identity被誤算進decision scope、
    共用元件吸收domain logic、activeTarget失真、visual-only marker只靠顏色或hover而失去可存取性、
    marker合成後遺失同時狀態、active target被誤作partial decision scope、changed-first誤刪完整資料、
    snapshot／current視覺混淆、窄版矩陣與compare或瀏覽器手勢衝突、sticky dock遮擋內容、review洩漏
    mutation及drawer／page分流未同次退役。
  - Spec Impact：`Intentional replacement + compatible preservation`。已amend Approval Platform、Entity Detail
    Drawer與既有Unified Entity Detail ADR。v2取代DEV-067 covered review的surface裁切／owner-route-only body，
    並取代DEV-087 Part live attachment list＋常駐note；保留DEV-070 list/return、DEV-079/083 page mechanics、
    DEV-087 decision/formalization與DEV-090 Relation retirement。runtime在RD實作前仍維持現況。
  - ADR disposition：已修訂既有
    `ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`，固定domain renderer two modes、
    immutable package、hash分責與不建立generic editor；不新增平行ADR。
  - 計入交付：是（本機交付點）。正常清單、review workspace同源、全目標完整可見、recognition snapshot
    不漂移、zero domain write、exact return與48案Independent QA/QC已全部通過；CAPA文件與RD supporting checks
    未被誤算進固定QA分母，因此維持`✓`並計入正式本機QA/QC完成。
  - 下一步：本DEV沒有未完成的本機RD／QA／QC工作。若要進正式環境，只能由`DEV-032`／release owner選定
    exact release commit或核准current source snapshot，再執行default-off writer activation、candidate-bound smoke、
    production release與release後監測；未取得該決策前不得deploy、切traffic或修改primary資料。

- ✓ DEV-090 [交付點] [RD Implementation Complete / Human Confirmed / Local QA-QC Complete] [P1] [Local Only / Production Release Gated] 圖料工作台退役與抽屜關聯矩陣直接編輯
  - 摘要：取消圖料工作台、Relation work與Relation審核流程；圖號與料號抽屜以同一root-level矩陣projection檢視並直接編輯正式關聯。使用者進入編輯模式後一次儲存，成功即原子更新`drawing_part_links`；不逐格autosave、不建立調整中資料、不送審。Relation formal authority是唯一讀寫權威。
  - 來源 ID：`DEV-PDM-RELATION-WORKBENCH-REPLACEMENT-001`
  - 父任務：`DEV-087`、`DEV-089`。本任務有意取代DEV-087的Relation formal/work、調整、送審與核准契約，以及DEV-089「Relation清單／drawer為矩陣owner surface」；保留DEV-089的matrix語意、root/company reference validation與single projection基線。
  - 直接 authority：`.ai-doc/specs/SPEC-PDM-INLINE-RELATION-MATRIX-001-direct-formal-edit.md`；架構決策`.ai-doc/decisions/ADR-PDM-RELATION-EDITING-001-direct-formal-authority.md`；驗證計畫`.ai-doc/qa/qa-dev-090-inline-relation-matrix-validation-plan-2026-08-23.md`。
  - Spec Impact：`Intentional replacement`。已同步DEV-087 SPEC／ADR、Drawing-Part-Relation View、Workbench Core、Entity Detail Drawer與Approval Platform的supersession boundary；本機runtime已完成DEV-090 activation並採canonical-only，Drawing／Part本身生命週期不變。
  - RD Contract：Drawing／Part drawer以exact root讀同一正式矩陣；預設唯讀，`編輯關聯`後每格使用明確`空白／製造／參考`三態輸入，一個`儲存`可原子提交目前矩陣全部changed cells（hard cap 2,500），一個`取消`丟棄browser draft。Mutation固定走`PATCH /api/pdm/relations/[rootId]/matrix`、strong ETag `If-Match`、idempotency與server contract token；server驗證same company/root、pair唯一、每個料號最多一張主要製造圖及所有業務guard，失敗零partial write。
  - UI／人類語意：Drawing／Part drawer以`關聯矩陣`取代`直接關聯`，不顯示正式關聯、調整中、處理角色、審核、來源或audit。Drawing production/RD與Part formal/work列都只看到同一份root-level正式關聯；Relation不再出現在我的待辦或審核工作台。`直接編輯`不等於逐格autosave，儲存前只存在browser memory。
  - Data／migration：`drawing_part_links`是唯一formal storage，`RelationFormalAuthorityRepository`（含SQLite sync adapter）是唯一formal writer；全部runtime flow共用root-first lock與in-transaction typed primitives，raw legacy writer已移除。Domain enum`manufacturing_basis|reference`只在authority映射到DB enum`primary_manufacturing|reference`。不新增row counter，concurrency由root、axis identity／status及formal links的provider-neutral canonical SHA-256 `matrixEtag`承接。本機SQLite migration會在單一transaction fail-closed清除current Relation state／aggregate／review與`relation_change_works`，建立pair unique並核對formal link hash不變；PostgreSQL `043_inline_relation_matrix.sql`已加入advisory lock、active work/review/quarantine、duplicate／multi-primary／orphan guard、current Relation schema retirement與reconciliation assertion。provider-aware converter支援PostgreSQL inventory／isolated rehearsal apply，但正式 Cloud SQL conversion、reconciliation與cutover仍受production gate。
  - Permission／search：matrix actor resolver不得綁死`numbering.search`；read接受`numbering.drawings.view`或`numbering.search`任一來源權限並做exact company/entity check，edit另要求`numbering.workspace.update`。`/numbering/search`保留且更名`編號搜尋`，只呈現root／Drawing／Part identity，不顯示矩陣或edit；empty root由此可達。
  - Retirement：已移除Relation list/detail API、專用Relation workspace、Relation change-work service/repository、create/edit/submit/cancel route與Relation review decision caller；`編號搜尋`僅保留root／Drawing／Part identity，不呈現矩陣或edit。保留正式link authority及歷史唯讀domain evidence；`qc:dev-090:retirement`注入／掃描任一舊caller或raw writer時gate失敗。
  - Actual repo impact：新增formal authority repository/service/PATCH route、drawer MatrixSection、minimal numbering search、PostgreSQL 043、provider converter與`qc:dev-090:*`；修改全部formal link writer、canonical typed contract／projection／command receipt／review dispatch、全域navigation/recovery href、sidebar／CSS／package scripts；刪除Relation list/detail API、workspace、change-work API/service/repository及sync legacy formal writers。完整逐檔責任、batch JSON策略與add/modify/delete gate見SPEC §17～§21。
  - Phase：`090-A Contract／repository`✓→`090-B Drawer UI`✓→`090-C Cutover／retirement`✓→`090-D Focused QA/QC`✓→`090-E Handoff`✓。中間雙路徑已移除；正式 provider parity、zero-loss reconciliation與release gate仍未宣告完成。
  - 下一步：進入正式 Cloud SQL migration rehearsal／reconciliation gate；不得在未取得正式授權前執行production migration、cutover或release。
  - 阻塞／恢復條件：文件契約無P0/P1人類決策阻塞；implementation activation受`active_relation_work=0`、`pending_relation_review=0`、`ambiguous_pair=0`、`unresolved=0`、formal writer convergence、root search可達、provider parity與正式資料reconciliation 100%阻擋。
  - 證據：`npm run qc:dev-090` focused aggregate PASS（contract 22/22、repository 5/5、migration、mutation含A→B→A與no-op receipt、retirement 10/10）；`npm run typecheck:app` PASS；`npm run build:isolated` 124/124 PASS；authenticated browser evidence `output/qa/dev-090-browser/evidence.json`、drawing／part drawer screenshots與Playwright snapshots。已證明UI矩陣、API authority、formal DB link與canonical ETag在本機一致；正式 provider parity、兩輪fresh session、fault injection與Cloud SQL reconciliation仍屬release gate。
  - 執行邊界：本輪修改本機產品code、API、SQLite schema／migration、測試runner與本機資料（唯一pair index）；未執行正式資料庫遷移、production data delete、stage／commit／merge／PR、deploy或release。
  - 計入交付：是；本機抽屜直接編輯、單一正式authority、Relation work/review caller退役與focused QA/QC已完成；正式資料零遺失遷移及release仍須獨立gate。

- ✓ DEV-093 [交付點] [Local RD Implemented / Corrective QA-QC Passed] [P0] [Local Complete / Production Release Gated] Canonical 統一建立編號
  - 摘要：保留單一canonical建號入口與完整命名引導，並移除新圖料重複的`建立內容`決策。新圖料由料件類型直接推導：依圖製作件固定建立M圖＋料號；外購標準件預設只建立料號，可選擇同時建立參考圖R。無root時可建立新圖料或加到既有圖料，已知root時顯示readonly根號與確定品名；不恢復workspace、候選號、舊送審發布鏈或退役API。
  - 來源 ID：`DEV-PDM-CANONICAL-NUMBER-CREATION-001`。
  - 父任務／關聯：parent `DEV-087`；relation writer與M/R映射依`DEV-090`；人類詞彙依`DEV-063`。Intentional-replace `DEV-PDM-NUMBERING-004`的三個平行新增入口，以及`DEV-048`／Number State Flow內以draft workspace、candidate reservation建立新編號的使用者流程；保留其identity、approval/release evidence與transfer hard rule。
  - 直接 authority：SPEC `.ai-doc/specs/SPEC-PDM-CANONICAL-NUMBER-CREATION-001-unified-contextual-create.md`；QA `.ai-doc/qa/qa-dev-093-canonical-number-creation-validation-plan-2026-08-24.md`。ADR判定`No new ADR required`，沿用DEV-087 single canonical authority與DEV-090 formal relation authority。
  - Human Confirmed UX：完整流程固定用`/numbering/create`；無root入口先選建立方式。新圖料流程與完整命名器維持不變。existing-root鎖定root後，只顯示料號／圖號／圖號與料號、必要M／R與R用途、政策實際要求的追加原因、單行`將建立`及取消／建立編號；不得顯示料件類型、結構型態、共用件、系列代號、規格／特性、命名器、查重或`沿用根號設定`狀態列。每頁只有一個primary`建立編號`，錯誤就地顯示，正式號仍由提交時原子配置。
  - Canonical data/API：new root走`POST /api/numbering/records`，client typed intent與server route共同拒絕manufactured part-only、manufactured R與purchased M；existing root依content走`/parts`、`/drawings`或`/drawing-part` append API。Part五項profile由repository在交易內以根號第一筆canonical料號為權威並完整繼承；canonical request不傳五項欄位，相容client明示不一致時以item-kind／structure-type mismatch拒絕，`unclassified`則由append-policy與repository雙層阻擋。existing-root不執行品名查重。圖號＋料號由server經`RelationFormalAuthorityRepository`自動建立M=`manufacturing_basis`或R=`reference`關聯，UI不顯示technical relation type。
  - Preview／retirement：新增read-only `GET /api/numbering/records/preview`與canonical `src/lib/numbering-preview.ts`；不得寫sequence、reservation、audit或outbox。append-policy切換後，`src/lib/number-candidate-preview.ts`須在runtime／navigation／API／worker／script caller=0後刪除；任一`draft-workspaces/**`、`create=new_bundle`、`tab=reserved`建號caller、fallback或dual-write注入都必須使retirement gate失敗。
  - Data／migration：新增 provider-aware `db/postgres/044_canonical_item_kind_two_values.sql` 與 `db/postgres/045_part_number_draft_item_type_two_values.sql`；底層相容值保留`manufactured／purchased`，正式料件確定映射為`outsourced→manufactured`、`custom→manufactured`。舊`shared`只表示共用性，無法判斷是依圖製作或外購標準，故 provider-aware converter 必須逐筆明確指定基礎分類並保留`is_universal=1`，否則 migration fail closed；禁止猜成 purchased。變更控制草稿的歷史`standard→purchased`。正式套用前 unresolved 必須為0且 source/target reconciliation 100%，未授權不得執行 production migration。新寫入只接受 manufactured／purchased（legacy change-control API只接受 self_made／purchased）；最新決策有意取消新圖料的依圖製作part-only路徑，建立時即原子配置M圖與料號。
  - Repo intent：保留既有`/numbering/create`、canonical routes、preview helper與entry；corrective slice修改`canonical-numbering-create-form.tsx`、最小CSS與`qc-dev-093-*`。品牌與流水識別仍只作命名view state；系列代號獨立持久化，單一規格值同時映射到命名helper與既有`customSpecification`；drawing-only typed intent不得含Part欄位，existing-root不得接收client coreName或執行品名查重。不改Drawing/Part lifecycle、DEV-090 relation model、DB schema或既定044/045 migrations。
  - QA gate：`QA-093-001..111`；所有合法business mutation只由AI操作rendered UI，API／DB只作readback，另以disposable API證明三種非法new-root組合回422且DB delta=0。`QA-093-108`鎖定quiet append UI與單一primary，`QA-093-109`鎖定request零五項profile且DB五項完整繼承，`QA-093-110`鎖定unclassified fail closed，`QA-093-111`以隔離fault injection鎖定stale sequence仍由root-scoped atomic allocator建立preview所示P02且不洩漏SQL；兩輪fresh session、desktop／320px、DB/API/UI 100%一致、double-submit exactly once、legacy caller=0、preview write=0、Blocked=0、Not Run=0、P0/P1=0。
  - Phase：`093-A～093-D`保留為canonical architecture baseline；`093-E～I`✓→`093-J～L Existing-root quiet append／server profile inheritance／fail closed`✓。未恢復舊modal、draft workspace或candidate API。
  - 下一步：本機開發與corrective QA/QC已完成；若要進正式環境，先完成044／045 PostgreSQL provider rehearsal、unresolved=0與source/target reconciliation 100%，再另行取得migration、deploy與release授權。
  - 阻塞／恢復條件：目前無未決P0/P1人類決策。發現需要schema/migration、恢復retired route、production資料處理、正式provider或改變DEV-087／090 authority時立即停止並回Dev PM做Spec Impact Preflight。
  - 證據：最終run `output/qa/dev-093/DEV093-2026-08-25T01-32-17-561Z/`；兩輪fresh session全數通過，existing-root request僅含`reason/sourceEntrypoint`，DB的`item_kind/structure_type/is_universal/series_code/custom_specification`逐項等於來源Part；兩輪均在正式P01已存在時注入`next_value=1`，UI預估、API與DB仍一致建立P02。desktop與320px無overflow且每頁只有一個主要動作。三種非法組合均422且全canonical count不變。資料增量為roots `4→14`、parts `4→18`、drawings `5→17`、links `3→13`、part formal states `4→18`、initial drawing works `4→16`，candidate／recovery維持0；legacy caller、console/page/failed request均0。contract、retirement、aggregate、affected ESLint、typecheck與isolated build均PASS；task-owned runtime與temp paths已清除。
  - 執行邊界：本機產品code、disposable/local QA資料、browser UI驗證；未授權stage／commit／merge／PR、正式資料庫mutation、Cloud SQL migration、deploy或release。
  - 計入交付：是；existing-root重複設定與唯讀狀態列已移除，五項profile改由server繼承，QA-093-001..110及兩輪fresh session通過，本機交付完成。正式migration／deploy／release仍不得由此完成標記推定授權。

- PDM 統一實體明細投影、審核全景與送審鎖定：`✓ DEV-067` `Local RD Implemented / Focused Contract, Query, Lock, Build & Authenticated Browser Matrix Passed` `P0` `Production Release Gated`。
  - 目標：Drawing、Part、Relation 三個工作台共用同一 `UnifiedPdmEntityDetailDrawer` 骨架、固定投影順序與單一操作列；各 domain 只提供自己的 projection。一般圖號／料號情境依任務刪減，圖料工作台顯示完整關聯全景，審核者只在被指派 request scope 內看完整 Drawing／Part／Relation 與審核脈絡。
  - 使用者決策：不再為 candidate、formal、relation、reviewer 拆不同明細 UI；送審期間 owner data 由 server 鎖定；`/approvals` 只保留總表並導向 canonical owner route；導覽遵守「哪裡來，哪裡去」。最新決策有意取代先前「審核者與送審者顯示完全相同章節」：兩者仍共用相同 projection components 與 locked owner data，但 reviewer 是 exact review scope 的授權全景。
  - Spec Impact Preflight：`Intentional replacement`；取代「共用 shell 即視為同一明細」、跨狀態／跨 domain 的分叉 composition、approval-only detail，以及 reviewer 只能看到一般 owner surface 刪減內容的舊方向。保留 domain data/command authority、`/approvals` 單一 inbox、server permission、decision/audit authority與 integrity snapshot。
  - 權威文件：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`（`UnifiedPdmEntityDetailDrawer` amendment）、`.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`、`.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`、`.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`（Phase 1C-D amendment）、`.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`（DEV-067 amendment）。
  - RD Contract：exact typed envelope、server-only `none/summary/full` allowlist、單一 read snapshot、review-scope receipt、action-to-owner resolver、multi-target ambiguity、transaction lock、preview parity、safe return、query budget、exact files與Phase 1A～1D均已固定；QA `UDD-001`～`UDD-050` 已建立。
  - 實作結果：Phase 1A～1C 已完成 unified response/policy/read façade、單一 drawer/projections、ownerHref／approvals inbox-only、review scope／preview media parity、active-review write guard與固定 canonical lock order；flag default-off。另已將統一 `DrawingProjection` 接回既有 `DrawingDetailPreview` owner，集中安全 `returnTo` helper，正式版次決策納入同一 lock order。
  - 驗證結果：contract／policy／專用 UI／preview／navigation QC PASS；SQLite 查詢預算 `11/13/10/6` 且加入20筆子項後讀取數不成長；隔離 PostgreSQL row-lock blocking、canonical-order no-deadlock、active-review write rejection PASS；isolated build 125/125、affected ESLint、`git diff --check` PASS。`qc:dev-067:browser` 以 disposable SQLite + 真實 Chromium 通過 18 cases：Drawing／Part／Relation 四 viewport、review owner route、shared preview、flag on/off、focus restore、keyboard list navigation、close／Escape／returnTo、a11y semantics、overflow、console/network/5xx sweep；最新 aggregate browser manifest `DEV067-20260812T075344Z-39e3be5e` 及 screenshots 已保存於 `output/playwright/dev-067-unified-entity-detail/`。本機 Phase 1A～1D gate 已完成，production release 仍 gated。
  - 執行邊界：schema/migration、production/staging資料、stage/commit/merge/PR/deploy/release仍未授權；feature flag仍 default-off。
  - 計入交付：是（Drawing／Part／Relation 跨狀態單一 composer、server projection policy、active-review lock、preview parity、review-scope full view、單一 action bar 與 returnTo 全部驗收後才計入）。

- ✓ DEV-068 [交付點] [Local RD/QA/QC Complete / OCR-082-001..044 PASS] [P1] [Local Only / Production Release Gated] 圖面／CAD 全項辨識與人工確認入庫
  - 摘要：跨來源辨識、人工核對與正式化的父交付點；既有 OCR／版次整合／定位基線保留，但真實 A0002 證明放大鏡會裁切完整材質文字且二次放大預覽 canvas 造成模糊，已由 DEV-082 §0.13 重開。
  - 來源 ID：`DEV-PDM-DRAWING-ATTRIBUTE-RECOGNITION-001`
  - 下一步：保留 production representative gold set、正式檔案存取、部署與 release smoke 的獨立 gate；本機功能不再有 DEV-035／DEV-079 回歸 blocker。
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md`；`.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md`；`output/qa/dev-082-browser-pdf-ocr/gate-20260820163042-local-isolated/`。
  - 計入交付：是

- ✓ DEV-082 [開發點] [RD Implemented / Local QA-QC Complete / OCR-082-001..044 PASS] [P1] [Local Only / Production Release Gated] PDF OCR 跨來源版次整合、證據定位與高解析放大鏡
  - 摘要：保留已通過的 `OCR-082-001..038` 跨來源與定位基線，重開 `OCR-082-039..044`：以完整文字優先的自適應取景及同一已載入 PDF page proxy 高解析局部重繪，取代固定 3× 二次放大預覽 canvas。
  - 來源 ID：`DEV-PDM-PDF-BROWSER-OCR-001`
  - 父任務：`DEV-068`；關聯 `DEV-035`、`DEV-079`
  - 下一步：保留 production representative gold set、正式檔案存取、部署與 release smoke 的獨立 gate；本機 DEV-082 不再有 cross-DEV regression blocker。
  - 證據：權威契約 `.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md` §0.13；QA `.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md` §9；QC `.ai-doc/qc/qc-dev-082-browser-pdf-ocr-2026-08-20.md`；最新 gate `output/qa/dev-082-browser-pdf-ocr/gate-20260820163042-local-isolated/`（44/44）；regression `regression-20260820161721-local-isolated/`；browser `browser-20260820162922-local-isolated/`；recognition layout `output/qa/dev-079-recognition-layout/20260820161949-browser/`。
  - 本次 UI follow-up 驗證：DEV-035、DEV-068、DEV-079 contract/layout/recognition、`typecheck:app`、affected ESLint、`build:isolated`、`git diff --check` 與 `qc:dev-082:gate` 全部 PASS；canonical `revision` 取代 fixture 舊 `source_revision`，gate 分別讀 OCR synthetic 與 recognition-layout evidence。
  - 計入交付：否（由父交付點 `DEV-068` 計入）

- BOM 樹狀編輯直覺化與 Floating Topic 暫存區：`✓ DEV-071` `本機 RD/QA/QC 完成 / Human Confirmed` `P1` `Local Only / Production Release Gated`。
  - 目標：把 XMind 的靠近節點新增、可預測拖放、安全刪除、Undo、折疊／聚焦與 Floating Topic 心智模型轉譯成受治理的 BOM Draft 編輯體驗。
  - 已確認決策：Floating Topic 在編輯過程中是必要功能；它只存在「未納入 BOM」草稿暫存區，可保存並重新開啟，但在全部歸位前阻擋送審、發行與正式匯出。
  - 完成內容：035 additive schema、editor version、雙 graph 原子 repository/API、write permission、submit/approve/release fail-closed、semantic history、XMind toolbar/shortcut/drag/drop/Floating/Map/Outliner/inspector 與四 viewport 已落地。
  - 驗證：contract 18/18、API 16/16、migration 21/21、PostgreSQL shadow 27/27；AI 真實 rendered-browser recheck 56/56（含 Topic/Subtopic canonical picker、Insert Parent/Floating/Group、leaf Delete＋Undo、More 導覽圖／設為目前／複製／刪除、四 viewport、console／HTTP error gate）；獨立 flag-off browser 10/10（FF-002～004、blocked handoff、legacy save、floating hash 不變）；TypeScript PASS、P0/P1=0。
  - 執行邊界：feature flag 預設關閉；production／live migration、正式資料、flag activation、stage/commit/merge/PR/deploy/release 仍受 gate 管制。
  - 計入交付：是；本機授權範圍已完成。

- PDM 四工作台明細動作可發現性與鎖定提示：`✓ DEV-072` `本機 RD/QA/QC 完成 / Human Confirmed` `P1` `Local Only / Production Release Gated`。
  - 目標：圖號、料號、圖料根號與審核 owner detail 共用同一 action catalog；適用但尚不可按的未來動作固定顯示低色階鎖頭，可按時在原位置解鎖並渲染提示，讓使用者預先知道下一步。
  - 已確認決策：disabled 原因只放 hover／focus／touch 可達提示；跨 domain、永久不適用與 terminal 無恢復動作完全不顯示；資料摘要不因跨 domain action 隱藏而移除；每個情境最多一個 primary CTA；審核沿用 owner catalog 並只增加 exact allowed decisions。
  - Spec Impact Preflight：`Intentional replacement`；只取代共用 drawer action bar 的 current-action-only、無權限不顯示及 nearby 常駐 disabled reason 顯示規則，不改權限、狀態機、domain command authority、review lock、audit 或 publication。
  - 權威文件：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`（2026-08-14 DEV-072 amendment）；AI 真實操作 QA `.ai-doc/qa/qa-dev-072-pdm-action-discoverability-ai-real-operation-validation-plan-2026-08-14.md`；QC `.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`。
  - 完成內容：`pdm-entity-detail.v2`、固定 capability/action resolver、typed execution、nullable unique primary、Drawing override退役、共用 focusable locked control／tooltip、固定140px action slot、四工作台 negative inventory與既有 submit/withdraw/decision整合已落地；不改 schema、permission code、狀態機或 domain mutation API。
  - 驗收：`npm run qc:dev-072` PASS；final Chromium run `DEV072-20260814T050039Z-113d57e2` 為21/21、13 screenshots、12/12 visible sweeps、console/page error 0、unexpected 4xx/5xx 0。stale 409與permission 403旁路各一次且資料不變；submit/withdraw/needs-info/reject/approve exactly once；四 viewport與cleanup通過；manifest含實際HEAD、branch、scoped dirty/content SHA-256與來源檔清單。
  - 執行邊界：本機 Phase 1A～1D 完成；production/staging data、stage/commit/merge/PR/deploy/release未執行，production release維持 gated。
  - 計入交付：是；本機授權範圍已完成。

- 狀態、責任與審核工作項一致性 CAPA：`✓ DEV-073` `Local RD/QA/QC Complete / Human Confirmed` `P1` `Production Release Gated`。
  - 目標：消除「待你處理但沒有可處理動作、active 審核清單也無工作項」的 phantom task；讓 Drawing list、unified detail、approval inbox與canonical lifecycle共用可稽核事實。
  - 根因：published workspace仍參與visible lifecycle、workbench reader排除最新`lifecycle_state=NULL`正式封裝而選到舊退回封裝、`rd_controlled`被誤投影為waiting、viewer responsibility只看owner，以及取消的FFF submission仍可能進入pending摘要。
  - Spec Impact Preflight：`Intentional replacement + compatible repair`。收窄DEV-055 assignee規則，新增applicable domain action／active work-item evidence gate；保留小數版physical Pending + effective ReviewApproved、審核決策權威與active inbox語意。
  - 權威文件：`.ai-doc/specs/SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001-state-workitem-consistency.md`；QA `.ai-doc/qa/qa-dev-073-status-actionability-capa-validation-plan-2026-08-14.md`；QC `.ai-doc/qc/qc-dev-073-status-actionability-capa-2026-08-14.md`。
  - 執行邊界：本機server projector、workbench/detail、domain同步、safe repair tooling與QA/QC；不改schema／permission／decision authority，不連staging／production，不deploy／release／merge／PR。
  - 完成結果：讀取層改以最新有效版次／封裝為唯一真相，A0005-M01 0.10終結FFF投影為`rd_controlled`；正式明細忽略已發布候選殘留關聯，UI顯示「研發可用」、0.10與P01～P04，待辦／active inbox排除歷史確認與取消submission。
  - 驗收：最終報告 `.ai-doc/qc/qc-dev-073-status-actionability-capa-2026-08-16.md`；`qc:dev-073:contract`、`qc:dev-070:legacy-owner`、`qc:dev-075:current-work-item`、`typecheck:app`、`build:isolated` PASS；DEV-073 Chromium run `DEV073-20260816T125206Z-dc0ca99b`為8 cases，DEV-070 browser PASS，console/network/visible error皆0。PostgreSQL runtime未設定，僅保留static parity guard，不宣稱 runtime PASS。
  - 計入交付：是。

- 料號／圖號全生命週期 AI UI 真實操作驗證：`✓ DEV-074` `Executed / QC Passed 58/58 / Historical Pre-DEV-087 Baseline` `P0` `Local Isolated Only`。
  - 目標：排除舊保留號後，使用 AI 控制真實 rendered browser，驗證建號、首版、辨識、圖面進版／FFF、BOM、技轉與終止治理的完整可達生命週期。
  - 路徑盤點：7 個家族、58 條 in-scope UI journey；`B09`、`D15`、`E02`、`F08` 與工程內容差異列為本輪 Out of Scope；角色、viewport、權限與 readback 是覆蓋維度，不重複灌水計數。
  - UI-only hard gate：所有 business mutation、SW 上傳、送審、撤回、退回、核准、發布、取消、作廢與測試資料清理都必須由 UI 操作；禁止直接 API／DB 寫入、fixture injection、status repair 或測試 helper 替代。UI 不可達的 recovery path 一律列 Blocked，不得降級為 PASS。
  - 權威 QA：`.ai-doc/qa/qa-dev-074-pdm-complete-lifecycle-ui-real-operation-validation-plan-2026-08-15.md`。
  - 執行結果：2026-08-15～16已由AI-QA以rendered UI執行並由獨立AI-QC結案；58/58 PASS、Blocked=0、open P0/P1=0，證據位於`output/qa/dev-074-pdm-complete-lifecycle-ui/`，QC為`.ai-doc/qc/qc-dev-074-pdm-complete-lifecycle-ui-real-operation-report-2026-08-15.md`。
  - 計入交付：是；僅作DEV-087啟用前歷史基準。DEV-087重建後必須依新的67條UI-only子契約重驗，不得沿用此58/58宣告新架構PASS。

- 還原資料候選關聯自動投影與移轉對帳：`✓ DEV-076` `RD/QA/QC Complete / Authenticated Staging Read-only Passed` `P0` `Production Release Gated`。
  - 目標：既有 production 備份還原到 staging 後，candidate-first 架構中的圖號、料號與關聯必須自動投影到目前樹／矩陣 UI；資料完整時不得顯示空矩陣或要求使用者重建關聯。
  - 根因：候選根列將 `drawings`、`parts`、`matrix` 硬編碼為空陣列；既有 QC fixture 沒有候選圖號／關聯，且生命週期 readiness 只驗證全 workspace `relationCount > 0`，未逐一驗證每個需製造圖的料號。
  - 父任務：`DEV-062`、`DEV-064`；關聯 `DEV-052`、`DEV-053`、`SPEC-PDM-DRAWING-PART-RELATION-VIEW-001`。
  - 不可變限制：不新增 schema／authority／permission／mutation API；不修改 production；staging 驗證僅使用既有還原資料與 read-only 對帳；不得要求使用者為移轉資料補按鈕、重選關聯或手動轉換。
  - 驗收：A0002／A0003／A0004 的有效候選關聯在樹與矩陣可見，清單／明細／DB 對帳一致；取消資料預設排除；缺一個必要 primary manufacturing 關聯即禁止 readiness；candidate identity 不誤導為正式可用；三 viewport、權限、zero-write、typecheck、build 與 staging browser evidence 通過。
  - 計入交付：是；只有 QA P0/P1=0 且 staging read-only 驗證通過才能結案。

- 正式編號草稿作廢與 production lifecycle 收斂：`✓ DEV-077` `RD Implementation Ready / Human Confirmed / RD Implemented` `P0` `Local-Staging Implementation Complete / Production Release Gated`。
  - 目標：消除「畫面顯示可刪除、正式 API 卻封鎖」的斷裂，並讓已領號但未送審、不再使用的圖料根號有不刪資料、不回收號碼且可追溯的生命週期終點。
  - 決策：`HD-077-01..03` 已於 2026-08-18 依建議全數採用；草稿已領號資料走「作廢草稿編號 → Obsolete」，正式資料走「申請作廢 → approval → Obsolete」，production 分 UI 止血、草稿作廢、正式作廢／審核三段 gate。
  - 下一步：本機／隔離 staging 的 Phase A→B→C 實作與驗證已完成；下一步只剩依 `DEV-032` 執行正式 staging／production deployment-release gate，不在本 DEV 內直接發布。
  - 計入交付：是；本機產品實作、focused／PostgreSQL／browser QC 與既有回歸已完成，production release 仍維持獨立 gate。

- 固定責任稱謂與六狀態 UI 投影：`✓ DEV-078` `Phase 2 Local RD Implemented / Human Confirmed / Full Aggregate QC Passed` `P1` `Local Implementation Complete / Production Release Gated`；Phase 1既有實作與完整QC保留為歷史基線。
  - 目標：第一層UI固定為`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`，所有觀看者看到相同名稱；角色責任與個人可處理性保留在說明／動作層。
  - 已確認決策：本責任流程直接涉及的組織角色為 RD、RD主管；畫面上的三種人工責任稱謂為負責人、審核負責人、系統管理員。工作負責人、送審負責人、圖料管理人、主圖維護人合併為「負責人」；審核人員合併為「審核負責人」；發布管理人改稱「系統管理員」。
  - 自動發布邊界：DEV-052／053統一整包流程審核通過後由系統自動正式化，正常期間顯示「系統處理中」；只有可證明的自動化異常且存在管理者恢復動作時，才顯示「待系統管理員處理」。DEV-048 legacy number-only approval不由本DEV改寫。
  - 驗證結果：已完成P2-A～P2-D；`npm.cmd run qc:dev-078`完整聚合PASS，包含DEV-078 projection 42/42、contract 53/53、DEV-055／DEV-073回歸、DEV-062、DEV-053 UI 24/24與real-operation 15/15、entity-detail drawer、typecheck及isolated build 124/124。production deployment／release仍須另走release gate。
  - 計入交付：是；Phase 1與Phase 2均已完成本機／隔離實作與QC，production release仍維持獨立 gate。

- 圖號唯讀抽屜與全頁編輯工作區分流：`◐ DEV-079` `RD Implemented Locally / Contract + Owner Resolution + 3-Viewport Browser PASS / Independent Full-Matrix QC Pending` `P1` `Local Implementation Complete / Production Release Gated`。
  - 目標：把圖號的快速查閱與長時間編輯拆成`清單 -> 唯讀右側抽屜 -> 同分頁全頁工作區`，避免窄 drawer 同時承載版次、上傳、預覽與送審。
  - 已確認決策：`1B` 整個 Drawing drawer 全面唯讀；`2A` 編輯使用同分頁、獨立 URL 的全頁工作區；`3A` 保留全頁雙欄及底部固定操作列；`HD-079-04`更新欄位 placement 為左側 2D／3D 大型主視覺、右側`版次與檔案／智慧辨識`任務分頁及右欄獨立捲動，OCR 不構成送審 gate。
  - Spec Impact：`Intentional replacement + compatible preservation`；取代 DEV-053／057／067／072 的 drawer 內 mutation placement，保留 DEV-061／064 的檔案與單一資料權威，以及既有 permission、lifecycle、submission／publication、idempotency、concurrency 與 return context。
  - RD Implementation Result：owner route=`/numbering/drawings/[drawingId]/workspace`，reviewer route=`/approvals/[requestId]`；既有`/numbering/revisions`只作相容。079-A～079-D已在本機完成，並落地 visual-first shell、共用 2D／3D tab preview、candidate revision OCR source、右欄快速核對與 2D evidence overlay；沿用既有data／API／permission／concurrency authority，無schema／migration。
  - 驗證證據：`npm run qc:dev-079:contract` 22/22、`npm run qc:dev-079:layout-browser` 3/3、`npm run qc:dev-079:recognition-layout-browser` 3/3、`npm run typecheck:app`與 affected-file ESLint 0 errors；瀏覽器已實際驗證 list→唯讀抽屜→owner workspace、visual-first 佈局、右欄獨立捲動、2D／3D與版次／OCR tabs，以及版次／上傳區就地唯讀原因；完整四actor mutation／獨立QC仍交後續 gate。
  - QA 狀態：QA-079-01～29尚未宣告完整PASS；QA-079-29的料號owner修正已有focused隔離與三viewport browser證據，其餘完整actor／fixture matrix仍不誤報完成；既有`qc:dev-067:browser`與`qc:dev-072:browser`歷史fixture findings保留，不以刪assertion或補資料掩蓋。
  - 2026-08-20 DEV-086 本機 RD（歷史 developer evidence；已由 2026-08-21 CAPA 重開）：source implementation涵蓋三工作台 production／RD dual-lane projection、lane filter、group cursor v2 metadata、HMAC projection token、detail／preview handoff、umbrella flag、rowgroup UI，以及 manufacturing baseline release＋audit 同交易。`npm.cmd run qc:dev-086` aggregate 31 checks、DEV-085 selection/query/contract regression 26 checks與`npm.cmd run typecheck:app`曾 PASS；但當時 browser runner僅有 source 靜態斷言，且真實四 viewport、on-path flag readback、valid dual-lane fixture、query-budget runtime、transition concurrency與independent QC均未完成，故不得作為 DEV-086 完成證據。CAPA：`.ai-doc/qc/qc-dev-086-dual-lane-completion-capa-2026-08-21.md`；未stage／commit／deploy／release。
  - 2026-08-20 preview/file-meta cleanup amendment：依瀏覽器紅線回饋，移除左側大型預覽下方重複的 2D 檔名 footer，以及右側受控檔案列的 `2D 圖面 · 主要受控檔 · 已完成驗證` 類型輔助 metadata；檔名仍保留在 2D／3D tab 與右側受控檔案清單標題，不改預覽、下載、檔案 authority 或操作流程。`npm.cmd run qc:dev-079:layout-browser` 三 viewport 3/3 PASS；Evidence：`output/qa/dev-079-layout/20260820020110-browser/`。
  - 2026-08-20 candidate-card redline amendment（歷史切片）：移除可見的`辨識／修正值`、`目前值`與`可信度`文字；逐欄操作曾在該切片保留，現已由下一項 silent auto-recognition amendment 取代。Evidence：`output/qa/dev-079-recognition-layout/20260820013849-browser/`。
  - 2026-08-20 silent auto-recognition amendment：取消 owner workspace 的`開始辨識`按鈕；candidate revision 檔案上傳成功後由 server 自動 ensure 去重排程，進頁時對已有檔案自動補建相符 session並每2.5秒輪詢。候選欄位 focus／click直接定位，無座標顯示檔案屬性來源提示；逐欄按鈕與`待核對`文案取消，改為已修改訊號及單一`完成核對並儲存`。`qc:dev-079:contract`、`qc:dev-079:layout-browser`、`qc:dev-079:recognition-layout-browser`、typecheck、affected ESLint、DEV-068 contract與三 viewport browser PASS；Evidence：`output/qa/dev-079-layout/20260820161642-browser/`、`output/qa/dev-079-recognition-layout/20260820161949-browser/`。
  - 計入交付：是；本機產品實作完成並交獨立QC，production release、merge、PR、deploy仍未執行。

- 全系統第一層狀態可見性與例外分層：`◐ DEV-080` `RD Implemented Locally / Human Confirmed / DEV-080 Focused QC Passed / Existing Baseline Findings Recorded` `P1` `Local Implementation Complete / Production Release Gated`。
  - 目標：每個item第一層固定一個主要工作狀態與最多一個最高嚴重度例外；正常、成功、重複與技術細節降到可及popover／drawer，阻擋、錯誤、資安與缺必要條件不得hover-only。
  - 已確認決策：`缺製造圖`等會改變判斷／下一步／風險的訊號固定可見；`關聯完整`等正常完成訊號預設降層。hover必須同時支援focus、click/touch與Escape。
  - Repository inventory：`58 direct files = 30 source + 27 test/QC + package.json`；另有43 validation-only source與1 conditional CSS。全系統母體為42個page route、25個target display context、13條axis、22個target scope；19個直接status-bearing page只作census，不作coverage gate。
  - RD Implementation Result：080-A～080-E的presentation接線已完成；shared policy、signal group、recognition contexts、scope/route繼承、PDM／workflow／admin／task／public收斂均已落地，沒有改schema、API、permission、assignment、lifecycle或write flow。
  - 驗證證據：DEV-080 projection 15/15、contract 26/26、rendered browser 240/240；DEV-071 browser 56/56；`typecheck:app`與isolated build（124 pages）PASS。Evidence：`output/qa/dev-080-status-visibility/20260819072228-1d1c809a/`與QA-DEV-080 §14。
  - Baseline findings：`qc:dev-060-bom-create`缺released-child fixture、`qc:dev-068:browser`缺recognition context、`qc:ux-attribute-hierarchy`仍呼叫已退役generic submission POST（HTTP 410）；均保留為跨DEV既有finding，未歸因DEV-080。
  - 計入交付：是；本機產品實作與DEV-080 focused gates完成，完整跨DEV fail-fast aggregate與production/release仍維持獨立gate。

- 工程師、主管與系統管理員跨負責人編輯：`◐ DEV-081` `Local RD Implemented / Human Confirmed / Focused QA Passed / Disposable Mutation QC Pending` `P0` `Production Release Gated`。
  - 目標：工程師、研發主管與系統管理員可維護同公司所有圖號、料號、圖料根號／關聯與 BOM，即使不是原負責人；UI capability與API授權必須一致。
  - 邊界：覆寫owner／原送審者gate；工程師、主管可依既有 action permission 維護可變更資料，主管仍可跨負責人取消、撤回未決案、審核與發行；保留company scope、生命週期／已決案鎖定、owner identity與audit actor。送審內容讀取 scope 維持獨立。
  - 權威：`.ai-doc/specs/SPEC-PDM-SUPERVISOR-EDIT-SCOPE-001-manager-admin-nonowner-edit.md`；QA：`.ai-doc/qa/qa-dev-081-supervisor-nonowner-edit-scope-validation-plan-2026-08-19.md`。
  - 計入交付：是；需完成四領域角色矩陣、typecheck、affected lint、isolated build與browser／API一致性驗證。

- 2026-08-13 RD repair + QC convergence：依 AI full-operation recheck 的實際失敗修復 picker entrypoints、Insert menu、leaf Delete direct path、More lifecycle actions、canonical clone revision、draft-delete impact confirmation、flag-off Floating handoff／legacy PATCH fail-closed，並修正既有 browser smoke 使其遵循 SPEC 的 picker 與 leaf-delete contract。`npm run qc:dev-071-browser` 最新 run `output/qa/dev-071-xmind-bom-editor/20260813131302/run-manifest.json` 為 56/56、17 screenshots、console error 0、unexpected HTTP 0；`npm run qc:dev-071-flag-off-browser` 最新 run `output/qa/dev-071-flag-off-browser/20260813131601/run-manifest.json` 為 10/10，包含 flag=true 建立 Floating、flag=false hard reload blocked handoff、legacy PATCH 409 `BOM_EDITOR_V2_REQUIRED`、兩 graph unchanged 與 zero-floating legacy save。QC gate：`PASS`（local only / production release gated）。
- 2026-08-14 edge geometry amendment：依使用者畫面回饋，BOM legacy canvas 與 XMind editor 的 parent-child edge 統一由 `smoothstep` 改為 `straight`，下一階從父節點以單一直線連接、不使用彎折。typecheck PASS、affected lint 0 errors；flag-off rendered QC 10/10，flag-on XMind browser QC 56/56、17 screenshots、console error 0、unexpected HTTP 0。證據：`output/qa/bom-straight-edge/20260814101014/run-manifest.json`、`output/qa/bom-straight-edge/20260814101255/run-manifest.json`。Release 仍 gated。

- Google Secret Manager 憑證整合：`✓ DEV-058` `RD Implemented / Local Phase 1A-1D QC Passed / Production Release Gated`。
  - 目標：以 Google Secret Manager 取代舊 Supabase Vault secret provider，讓 Cloud SQL 只保存 reference/lifecycle metadata，並讓可信任 Windows Document Manager worker 可透過 server broker 讀取 exact active version。
  - 父任務：`DEV-022`、`DEV-023`、`DEV-046`、`DEV-056`。
  - 已確認決策：Google Cloud 是正式平台 authority；Supabase Vault 僅保留歷史相容脈絡，不再是 staging/production secret target。
  - 派工邊界：可執行本機 provider、schema/migration artifact、lifecycle、worker broker、readiness UI 與 focused QA/QC；不得建立/修改 live GCP resource、IAM、deploy、production migration 或 release。
  - 下一步：RD 依 `.ai-doc/specs/SPEC-PDM-GCP-SECRET-MANAGER-001-solidworks-worker-credential.md` 執行 Phase 1A～1D；live Secret Manager 與真實 `.SLDDRW` 證據另走 release gate。
  - 計入交付：是（本機產品與安全邊界完成後）；2D native readiness 仍須 live Secret Manager + Windows worker L4 證據。

- production 穩定後的技術治理：`DEV-047` bounded schema migration。
  - Phase A0 本機工具已完成；Phase A 需 production representative snapshot、read-only operator 與 evidence owner，不以固定觀察天數作 entry gate。

- 未來 GCS package：`DEV-033` + `DEV-046` Phase 3B + `DEV-037`。
  - 同一 package 依序處理檔案 inventory/cost/retention、direct-GCS authority 與完整 file/offline continuity；不阻擋第一版 no-file production slice。

- CAD／辨識：`✓ DEV-068`／`✓ DEV-082`；`OCR-082-001..044` 已由 contract、repository、synthetic Chromium OCR、A0002 三 viewport recognition-layout、跨 DEV regression 與 gate 全數通過。`OCR-082-001..038` 保留為跨來源／定位回歸基線；只有 PDF 辨識內容，其他附件維持檔名；不新增 OCR 主機、API key、server compute或第三方流量。Production representative gold set、部署／release仍 gated；`DEV-036` SolidWorks Add-in仍停止追蹤。

### 任務索引

以下保留每個 DEV 的摘要、來源 ID、證據、歸檔位置、批次發版指向與計入交付判定；使用者可直接用 `DEV-005` 這類短碼指定任務。

- ○ DEV-104 [交付點] [Brief Ready / Human Direction Captured / Need Human Decisions] [P1] [Document Only / RD Not Requested] BOM 工作台 V2 受控產品結構與精簡編輯重構
  - 變更紀錄：2026-08-28 建立 `Brief Ready`，承接BOM工作台重構方向；尚未授權RD實作。
  - 摘要：將BOM工作台從「以XMind空間畫布為主的多功能編輯器」收斂為「精確組立料號的受控EBOM結構，
    經編輯、完整性確認、差異審核後產生可供製造／採購使用的正式快照」，以精簡主流降低近期實作與維護成本。
  - 來源 ID：`DEV-PDM-BOM-WORKBENCH-V2-001`
  - 父任務／關聯：延續`DEV-095`的canonical Drawing／Part入口與`DEV-096`的shared BOM authority；
    對`DEV-060`工作台呈現契約與`DEV-071` XMind／Floating Topic契約為intentional-replacement candidate。
  - 成熟度：`Brief Ready`。本輪只回答要解決什麼、為何值得做與第一版邊界；未建立schema／API／檔案／migration／完整QA契約，不可直接派RD。
  - 問題：
    - 現行單一client page同時承擔清單、legacy submission搜尋、舊ReactFlow、lifecycle、diff與drawer；
      XMind editor又同時承擔結構編輯、Floating Topic、送審、匯出、封存與變體對應，產品心智與程式職責皆重疊。
    - 系統同時承接DEV-060早期多來源／Active Draft、DEV-071 XMind與DEV-096 shared Definition三代觀念，
      使使用者的核心任務被視圖模式、歷史相容與假想擴充分散。
    - 鉦富機械目前14人、研發工程師1位，近期需要的是穩定累積BOM資料資產，而非同時實作完整視覺工具、
      手機複雜編輯、通用審批引擎與極端容量最佳化。
  - 使用者價值：
    - 研發工程師可以在單一明確結構中完成插入料號、調整階層／順序／數量、變體對應與送審，不必理解多套編輯心智。
    - 研發主管以與上一正式版的差異和影響Parent為第一審核畫面，不需重新逐列閱讀全棵BOM。
    - 製造／採購只取得指定Parent的Released projection與正式匯出，不接觸Draft、候選或不確定對應。
    - 公司後續可以在不改寫BOM核心權威的前提下，接入CAD建議、MBOM／ERP與技轉投影。
  - 產品定位：
    - V2是「受控EBOM／產品結構工作台」，不是MBOM、製程路由、庫存、成本或供應商替代料管理器。
    - 核心成功結果是「一個／多個明確適用Parent的產品結構，從Draft轉成可稽核、可重現、可供下游使用的Released Snapshot」。
  - 已確認保留的domain boundary（來源為DEV-095／096與既有ADR）：
    - 由exact manufactured assembly Part drawer建立／開啟BOM；全域BOM清單只作搜尋、篩選與續作，不恢復第二套owner入口。
    - `BOM Definition -> BOM Revision -> Draft/Review -> Released Snapshot`，同一Definition同時只有一個open／restorable Revision。
    - shared applicability必須明確綁定Parent；每個Parent在每個邏輯位置發行前都必須解析成唯一Child。
    - `logical_line_id`穩定；Released Snapshot不原地修改；下游只讀取immutable released authority。
    - CAD／XLS／AI只能經「source adapter -> suggestion -> diff -> human accept -> canonical command」接入，不成為第二寫入權威。
  - Current Phase初步scope：
    1. 單一BOM情境列：精確Parent、Definition、BOM Revision、lifecycle、適用Parents、base Released Snapshot與dirty state。
    2. 階層表／Outliner主編輯：搜尋並插入canonical Part、移除、調整父子關係、順序、數量、群組、Undo／Redo與離開保護。
    3. 情境式變體對應：單一Parent／固定Child時不顯示額外面板；只在多Parent或by-parent line時顯示對應與未完成數。
    4. 完整性與Release Gate：循環、過深、無效／不可用Child、重複、未解析mapping、replacement reconfirm與stale／concurrency。
    5. 變更與lifecycle：儲存、與base release比較、必要變更原因、送審、退回、核准、建立下一版、封存／恢復與whole-Definition作廢。
    6. 正式使用：exact Parent Released view、CSV／XLSX匯出、where-used／影響入口、來源記錄與audit。
  - 主要流程：
    1. 研發從Part drawer建立／開啟BOM，或從全域BOM清單續作既有Definition／Revision。
    2. Draft在階層表編輯；Inspector只顯示當前節點的數量、對應與必要屬性。
    3. 系統就地顯示結構／mapping問題；未解析的line可定位，但不建立常駐總覽面板。
    4. Draft儲存後才可送審；審核以logical diff、影響Parent與gate結果為第一畫面，仍可開啟完整結構。
    5. 核准後產生immutable per-parent projection；後續變更由最新current Released Snapshot建立下一版。
  - UI／UX intent：
    - 一個作用範圍只有一個主焦點與一個主要動作：有dirty變更時主動作為「儲存」；clean Draft為「送審」；Released為「建立下一版」。
    - Desktop只保留單一情境列、中央結構、可收合Inspector與就地問題；不常駐搜尋側欄、說明卡、成功宣告或重複狀態。
    - Map、差異、gate、匯出、archive／obsolete不能同時作為等權重主視圖；依當前狀態與角色才顯示。
    - 風險與不可逆動作保留明確文字、preview／confirm／recovery；簡潔不得隱藏未解析mapping、影響Parent或review gate。
  - 初步out of scope：
    - MBOM、routing／work center、庫存／成本、包裝、損耗、供應商替代料與可互換候選集。
    - CAD／XLS／AI自動materialize formal BOM；第一切片不建立source parser或import workflow。
    - 多層會簽、動態workflow designer、代理簽核或通用approval rule engine。
    - 沒有真實資料基準的250 Parent／5,000 nodes／100,000 resolved rows極端最佳化；保留bounded safety limit，不把上限當主流驗收。
    - 直接修改Part master的料號、品名、材質或表面處理。
  - 驗收方向：
    - 研發可從正常Part drawer入口或BOM清單，不依賴direct URL，進入精確Definition／Revision／Parent情境。
    - 在不使用Map的情況下，可完成新增料件、移除、數量、排序、調整階層、儲存、差異與送審主流。
    - 單Parent固定結構不看到變體噪音；多Parent時可定位每一個未解析邏輯位置並切換Parent預覽唯一投影。
    - Draft／PendingReview／Rejected／Released／Archived／Obsolete保留真實lifecycle、權限與server gate；精簡UI不得用隱藏取代後端阻擋。
    - 主管可從正常approval inbox開啟immutable review evidence，先讀差異／影響後回到完整結構並完成原子決策。
    - 製造／採購只能讀取指定Parent的Released projection，匯出、where-used與audit的結果一致。
    - 後續進入RD Contract時，使用者可見變更至少列為Medium；需以真實入口、指定角色、fixture、desktop viewport、實際UI操作與可見錯誤掃描支持QC。
  - 限制／安全邊界：
    - 現有DEV-095／096已完成且尚未production release；V2不得在未封口authority、migration／compatibility與activation路徑前與其並行寫入。
    - 現有dirty worktree屬使用者與既有任務；後續實作必須另行列明目標檔案與不碰範圍，不清理或回復無關變更。
    - 主要BOM編輯對象預設為SolidWorks工作站上的desktop；窄版需求以可讀、可審核與無overflow為基準，是否可複雜編輯待HD-104-02。
    - 不得用無型別JSON雜物欄取代未來ERP契約；RD Contract需確認quantity/UOM/line position的權威與snapshot邊界。
  - Architecture Memory Capsule：
    - 核心domain只保留identity／revision、structure／validation、applicability／resolution、lifecycle／release四個責任。
    - 寫入為create／save／validate／submit／approve／clone等canonical commands；讀取為workbench list、editor detail、diff／review、released projection等read models。
    - UI收斂為BOM清單、結構編輯、情境式variant inspector、review／released view；不建立通用plugin framework或巨型參數元件。
    - 製造、採購、技轉包與未來ERP不直接依賴Draft tables，只依賴版本化Released Projection contract。
  - Human Decision Brief（進入RD Contract前必須關閉）：
    - `HD-104-01` 主編輯模式與Floating Topic：
      - A. 階層表／Outliner為主，Map為選配檢視，Floating Topic保留為收起的進階Draft staging（建議；相容DEV-071已確認邊界）。
      - B. 階層表／Outliner為唯一正式編輯，Map唯讀且退役Floating Topic（最簡，但需明確取代DEV-071 human-confirmed decision）。
      - C. XMind Map／Floating Topic繼續為主編輯，Outliner只作輔助（維持現況，實作與驗證成本最高）。
    - `HD-104-02` 窄版編輯邊界：
      - A. Desktop可完整編輯；tablet／phone只讀BOM、diff、審批與基本匯出（建議）。
      - B. Desktop／tablet可編輯；phone只讀／審批。
      - C. Desktop／tablet／phone都支援完整結構編輯。
    - `HD-104-03` V2第一可驗收切片：
      - A. 只收斂核心workbench與既有shared BOM lifecycle（建議）。
      - B. 同時建立CAD／XLS suggestion adapter與accept-diff流程。
      - C. 同時納入MBOM／ERP欄位與製程語意。
  - Future Phase Capsules（`Future Phase Captured / Not Requested`）：
    - Source suggestion：接入`.SLDASM`、SolidWorks XLS或AI辨識，只產生可重現suggestion／diff與人工accept commands；重新進入條件為核心V2穩定且有明確節省工時的真實樣本。
    - MBOM／ERP：以Released EBOM Projection為來源建立製程、損耗、包裝、供應與成本語意；重新進入條件為命名ERP consumer、owner與權威邊界。
    - Shared structure evolution：Released Parent移除、detach／fork、跨root共用與真正可互換替代料；重新進入條件為出現真實結構分歧案例且現行new Revision無法合理處理。
    - 容量最佳化：以真實P50／P95 Parent數、node數、深度、query數與duration重設預算；重新進入條件為真實環境出現可重現性能瓶頸。
  - Spec Impact：`Unresolved conflict / Intentional replacement candidate`。
    - 本Brief不變更DEV-095／096 domain authority與ADR；`SPEC-PDM-ASSEMBLY-BOM-REBUILD-001`仍是shared BOM、permission、review／release與snapshot權威。
    - 若`HD-104-01=A`，後續以相容修訂收斂`SPEC-BOM-WORKBENCH-001`與`SPEC-BOM-VISUAL-EDITOR-001`的呈現契約；
      若選B，必須明確記錄對DEV-071 human-confirmed Floating Topic的intentional replacement與受影響QA／schema／compatibility處置。
    - `ADR not needed at Brief stage`；關閉HD-104-01後再依是否改變長期產品契約判定。
  - 風險等級：文件本輪為Low；未來實作因會改變主要UI互動、狀態動作與跨層讀寫，至少為Medium。
  - 下一步：由使用者回覆`HD-104-01..03`；收斂後只升級同一DEV-104至`RD Contract Ready`，進行current-code／data／API／permission／UI影響盤點與分階估工，不另建平行Brief。
  - 證據：現行`src/app/bom/workbench/page.tsx`約2,046行、`src/components/bom-editor/bom-xmind-editor.tsx`約1,254行；
    直接比對DEV-060／071／095／096，BOM兩份現行SPEC、兩份accepted ADR與DEV-096本機QA-QC證據。
  - 計入交付：是（只在產品切片實作並經風險相稱QA／QC完成後計入；Brief不計為已交付）。

- ✓ DEV-103 [交付點] [Local RD Implemented / Focused Contract QC 25/25 / Browser PASS] [P1] [Typecheck + Isolated Build PASS / Production Release Gated] 工作臺抽屜預覽區關聯編輯入口與冗餘提示收斂
  - 摘要：移除關聯矩陣下方不必要的常駐 direct-edit 說明，並把既有「編輯關聯」入口移到 Drawing／Part 預覽區標題列；editing state 仍由矩陣 editor 控制，儲存／取消／dirty guard與API不變。
  - 來源 ID：`DEV-PDM-CANONICAL-DRAWER-PREVIEW-RELATION-ACTION-UI-001`
  - 範圍：`canonical-preview-panel`、`drawing-detail-preview`、`canonical-pdm-workbench`、canonical preview CSS與DEV-090 focused contract；版本提示截圖所示的獨立 modal 不存在於現行 source，未創造替代元件。
  - 驗收：圖號／料號 drawer 預覽區顯示單一「編輯關聯」；關聯矩陣標題只保留必要建立編號動作；helper text 不渲染；進入編輯後矩陣仍可修改、儲存或取消；窄版無溢出、錯誤或重疊。
  - 證據：`npm.cmd run qc:dev-090:contract` 25/25；`npm.cmd run typecheck:app`；isolated headed browser 1440×900、1024×768、768×1024、390×844，截圖與量測 artifact 置於`output/playwright/dev-103-ui-refinement/`。
  - 下一步：若要正式上線仍需既有 production release gate；若要改版本更新提示，須提供現行 route／component 或另立明確產品需求。
  - 計入交付：是（presentation-only UI 交付；不含資料、schema、API、permission或production deploy）。

- ✓ DEV-102 [交付點] [Local RD Implemented / Focused Retirement QC 13/13 / Browser PASS] [P1] [Typecheck + Isolated Build PASS / Production Release Gated] 圖號報表獨立頁面拆除
  - 摘要：依使用者明確決策拆除 `/numbering/reports` 獨立 UI route 與所有現行產品入口，避免首頁、交接流程與導覽指向已不需要的功能；不保留 legacy redirect。
  - 來源 ID：`DEV-PDM-NUMBERING-REPORT-CENTER-RETIREMENT-001`
  - 範圍：刪除頁面與舊 page UI QC，移除 sidebar/dashboard/handoff dead links、navigation permission path 與 report status-scope registry；月報／匯出 API、資料表與 API 權限保留。
  - 驗收：route source absent、現行 UI／連結／status scope 無報表頁引用、四個 report API route 仍受 `numbering.reports` guard 保護；再以 isolated browser 驗證 direct `/numbering/reports` 回 404。
  - 證據：`scripts/qc-pdm-numbering-report-retirement.mjs`；舊 report-center UI QC 與既有報表 spec/QC 只作歷史證據。
  - 下一步：若要正式上線仍需既有 production release gate；若要恢復報表 UI，須另立新設計與明確實作指令。
  - 計入交付：是（資訊架構去除獨立報表入口）；不含 API／資料刪除與 production deploy。

- ✓ DEV-098 [交付點] [Local RD/QA-QC Complete / Human Confirmed] [P0] [Fixed QA 31/31 PASS / Production Release Gated] 圖面版次與研發分支統一生命週期
  - 摘要：統整舊版manual revision、submission sandbox與現行canonical branch，定義同主版次manual minor、研發里程碑、stale freeze及量產採用的一致產品邏輯。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001`
  - 下一步：若要求實作，依SPEC §15的098-B1～B3與`QA-098-001..031`開始；full QA需disposable PostgreSQL，完成後仍需Independent QC，production另走release gate。
  - 證據：本檔DEV-098段、配對SPEC、ADR及`.ai-doc/qa/qa-dev-098-drawing-revision-branch-lifecycle-validation-plan-2026-08-25.md`。
  - 計入交付：否（文件／決策階段）。

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
      - 2026-07-15 管理辦法品名命名browser QC：本機Admin session於`/numbering/search?create=numbering`建立`腳架測試121150_JF_100L_白鐵_A`草稿，驗證`確定品名`、半形底線、品名/料號系列欄位拆分、建立草稿201、取得候選號200、取消回收200、桌面1440與手機390無visible error/console error/horizontal overflow，正式主檔計數前後不變；截圖`qc-name-builder-create-modal-desktop.png`、`qc-name-builder-candidate-desktop.png`、`qc-name-builder-candidate-mobile.png`、`qc-name-builder-cancelled-desktop.png`位於`output/playwright/number-state-phase1e/`。其中workspace／候選號只作歷史證據；2026-08-24 DEV-093最新Human Decision重新確認系列代號既是依圖製作非共用件的獨立metadata，也必須自動加入建議品名並可套用至`確定品名`。
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
    - [x] `HD-052-05`：舊保留號全量整併進「首版準備」生命週期；正式啟用前後以 reservation ID 逐筆對帳，任何遺漏、重複、改號或 cutover freeze 期間來源 hash 變更都阻擋上線。
    - [x] `HD-052-06`：開發階段即將所有尚未正式化且非終結的舊保留號投影到唯一可見「首版準備」站；使用者完全不看見 legacy adoption、舊審核續接、補登、復原、整併或對帳過程，來源狀態與稽核證據只留 server/admin。
  - 目標流程：`建立料件（自動保留候選號） → 完成首版圖面並一次送審 → 核准 → 系統自動正式化`。小數研發版以 physical `Pending` package + immutable companion 投影 effective `ReviewApproved`，仍不可成為 production-effective `Released`。
  - UI 決策：`/numbering/drawings?tab=reserved` zero-write收斂到同一圖號工作台；所有 preformal／nonterminal 舊保留號只顯示「首版準備」及一般首版 CTA。legacy adoption、舊審核、補登、差異審核、復原、整併與對帳不得形成頁籤、badge、Now What、CTA或導引；正式化成功後轉入研發受控／正式圖號，terminal歷史仍維持真實狀態可查。
  - 既有資料相容：
    - `active`、`review_locked`、`approved_locked` 與 inconsistent facts 的 raw/internal projection保留；一般使用者一律只看 `drawing_preparation`，open list/detail/drawer不改寫來源 rows。
    - 舊 number-only approval、snapshot hash、recovery reason／owner與 reconciliation bucket只作 server/admin evidence；不得盲目 auto-publish，也不得外露成使用者作業路徑。
    - `published/promoted`、`cancelled/recycled` 維持真實正式／終結事實，不得重開成可編輯首版；實際新流程 `bundle_apply_failed` 仍依權限顯示必要處理資訊。
  - 任務清單：
    - [x] Phase 0A Brief／guided decisions：完成效率、既有資料、安全、自動正式化與保留號頁面延續四項人類決策。
    - [x] Phase 0B RD Contract：完成 authoritative SPEC、ADR、QA plan、Spec Impact Preflight與既有規格 amendment。
    - [x] Implementation readiness：完成 exact files/migrations/repositories、outer transaction + savepoint、API/error/idempotency、physical/effective status相容方案、phase evidence與 production-slice/file-authority blockers，已可逐檔派工。
    - [x] Phase 1A：完成 compatibility projection、additive candidate schema、zero-write read path、default-off feature flag與 SQLite/PostgreSQL/Supabase migration parity；local only。
    - [x] Phase 1B：完成 candidate first-revision workbench、finalized evidence binding、保留號頁整合與單一 next-step UI；local only。
    - [x] Phase 1C：完成 versioned bundle review、atomic auto-finalization、payload-aware idempotency、apply-failed recovery、permission/audit/outbox；local only。
    - [x] Phase 1D：完成 legacy pending/approved internal evidence compatibility、單一可見「首版準備」投影、sanitised fixture rehearsal、DEV-048 runtime／DEV-050 release gate／migration／browser／build focused regression。
    - [ ] Release gate：staging GCS authority、backward-read/rollback、target/backup/recovery owner、全company／全分頁舊保留號source-adoption manifest與 production activation；需獨立指令。
  - Spec Impact Preflight：`Intentional replacement`。DEV-052 啟用後，對 `numbering.candidate_bundle_review` 取代 DEV-048「approval 不自動 publication」，並取代 DEV-051「publication/promotion 前不得建立首版圖面」；舊 `numbering.candidate_publication_review` snapshot/apply 不被靜默修改。DEV-050 minor `Released` 禁令完整保留。
  - 驗收標準：舊 URL 與所有 preformal／nonterminal 舊保留號收斂到同一圖號工作台「首版準備」；使用者畫面不得出現 legacy、舊審核續接、補登／差異審核、復原、整併或對帳流程；來源 state、approval、reason、owner與reservation ID仍完整留在後台。新案件只有一次送審與一次核准；正常狀態只有一個primary CTA且不顯示重複Now What；正式／發布／terminal維持真實下游狀態；open/read projection零來源改寫；舊 number-only核准不得發布未審圖面；auto-finalization全有或全無且重送不重複配號、建master、建版或發event；小數版只到effective `ReviewApproved`；正式採用需 `source_count=distinct_mapped_count=bucket_distinct_id_sum` 且 unmapped／duplicate／renumbered全為0，cutover freeze期間source hash changed為0；跨公司、無權限、stale snapshot、未finalized file evidence全部fail closed。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`、`.ai-doc/decisions/ADR-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-additive-adoption-and-auto-finalization.md`、`.ai-doc/qa/qa-pdm-number-lifecycle-simplification-validation-plan-2026-08-03.md`，以及 DEV-048／050／051 authority。
  - RD 派工邊界：Phase 1A exact files為 `db/schema.sql`、`db/postgres/021_number_lifecycle_simplification.sql`、Supabase mirror/manifest、V2 feature status、pure projection/read repository、focused schema/data-protection scripts與 `package.json`；Phase 1A 不新增 mutation route/UI CTA、不修改 production-slice allowlist。
  - 執行範圍：Phase 1A-1D 本機產品程式、additive schema/mirror、API、UI 與 QA/QC 已完成；feature flag 預設 off、production mutation allowlist 未開放，未連 production、未 backfill、未 deploy/release。
  - 停止條件：需要更新／刪除／改號既有 reservation/workspace/approval/master rows、舊 app 無法讀新 schema/state、approval apply 無法原子冪等、production file authority 未就緒、任一舊 reservation 未映射／重複／hash改變、rollback需刪資料、放寬 minor release gate、live credential/data repair、merge/PR/deploy/release 時停止並進獨立 data/release gate。
  - 下一步：本機產品範圍已完成；只有明確 staging／migration／deploy／release 指令才進獨立 release gate。當本切片被納入 release scope，由 `DEV-032` 先完成真實 GCS authority、target identity、backup/PITR、全量 reservation reconciliation、flag-off readback、canary、rollback與 production smoke 授權。
  - 證據：`.ai-doc/qc/qc-dev-052-number-lifecycle-simplification-2026-08-04.md`、`output/playwright/dev052-real-operation/DEV052-20260804-045957-local-isolated/`、`npm run qc:dev-052`、DEV-052 schema 12/12、data protection 4/4、HTTP/idempotency 10/10、UI 15/15、flow/atomic recovery 8/8、AI真實操作41/41、revision release gate 11/11、DEV-048 runtime 7/7、Supabase migration 69/69、全專案lint、TypeScript與隔離production build。
  - 追加證據：2026-08-15 `npm.cmd run qc:dev-052-number-lifecycle-data-protection` 6/6、`npm.cmd run qc:dev-052-number-lifecycle-ui` 17/17、`npm.cmd run qc:dev-052-legacy-first-preparation-browser` 7/7。18筆 source reservations 全量一對一，六個 internal adoption buckets 各3筆，unmapped／duplicate／unexpected／changed皆0；使用者投影則將 active／pending／approved／inconsistent 舊資料全部收斂為 `drawing_preparation`。真實 Chromium run `DEV053-20260815-031953-local-isolated` 驗證目前統一明細抽屜未出現舊審核、補登、修復、整併或對帳文字／控制，read hash不變，console／5xx／visible error皆0，production connection/write=false，cleanup=removed。
  - 計入交付：是（本機產品 UX 與交易流程交付點；production activation 仍未計入）

- ● DEV-053 [交付點] [本機完成] [P0] [Phase 1H Gap Repair Independent Local QC Passed] 單一圖號工作台與審核權威收斂
  - 摘要：Phase 1A～1G本機成果保留；Phase 1H以「2個操作介面、1個使用者狀態、1個主要下一步、0個可見legacy操作」收斂圖號生命週期與審核權威，不再讓使用者理解內部多軸狀態或平行送審頁。
  - 來源 ID：`DEV-PDM-UNIFIED-DRAWING-WORKBENCH-001`
  - 父任務：`DEV-052`、`DEV-050`、`DEV-051`
  - 下一步：本機RD、AI QA與獨立QC均已完成。commit、production migration、8B active adoption apply、flag activation、deploy與release仍須各自明確指令及release gate。
  - 阻塞 / 恢復條件：無待人類產品決策。啟用前的active-workflow adoption dry-run必須`blocked=0`；任一進行中案件無法無重播地轉接、cleanup需放寬其他approval領域append-only／RLS、無法保留正式版次／檔案／多料號scope、需要觸及DEV-054或既有已完成資料時，停止回PM。Phase 1G confirmed-impact多料號仍fail closed；production migration/deploy/release另走release gate。
  - 證據：權威SPEC 0.10、ADR-003、QA 9G與QC 19；gap repair後 `npm run qc:dev-053:phase1h` 為 schema 15/15、adoption 10/10、authority 9/9、HTTP 10/10、UI 12/12、real-operation 8/8；完整 AI 真實操作 `DEV053-PHASE1H-FULL-20260807-014809` 為24/24，實際覆蓋文字退回理由、cleanup retry、跨公司與4 viewport，production connection/write false、cleanup removed。fresh flow仍無legacy submission／永久task／notification，terminal後transient graph為0而package/files/P01-P03保留。DEV-054 protected hashes不變。
  - 計入交付：是
  - Human Confirmed：
    - [x] 保持單一`圖號工作台`，不恢復`圖號總表／保留號`雙分頁；`保留號`是生命週期狀態。
    - [x] 單頁化不得刪除、遮蔽或弱化既有圖、料、版次與治理功能；正式圖面仍須在同頁完成原本可完成的工作。
    - [x] `DEV-054`為必要並行任務，屬受保護範圍；DEV-053不得恢復開發階段/DVT或修改其程式、migration與文件。
    - [x] 一張圖面服務多個料號時，本次進版要帶著三個料號一起走；預設全選、一次送審、共用附件、原子核准／正式化，不退化為只選一個。
    - [x] 2026-08-06：圖面進版送審的標準成本改為非必要；未設定成本不計入待補、不顯示紅色阻擋且不影響送審，但仍保留成本維護入口與中性選填提示。
    - [x] Guided `1A`：候選受控檔上傳後由系統自動驗證為可送審；不增加「完成準備」步驟，也不自動送審，失敗時保留草稿並提供恢復入口。
    - [x] Guided `2A`：同一drawer分開顯示受控版次檔案與參考附件；只有受控檔案計入送審／publication evidence。
    - [x] Guided `3A`：正式圖面採混合式操作；高頻進版與上傳送審留在drawer，關係、影響、主資料與歷史進專用工作面並保留返回上下文。
    - [x] Guided `4A`：每張候選圖面只要求至少一個active primary finalized controlled file；缺PDF、DWG/DXF或3D檔只警告並交reviewer判斷，不阻擋送審。
    - [x] Guided `5B`：第一次進入顯示進行中、正式受控與已發布，歷史預設隱藏於`包含歷史`切換；不記憶上次範圍。
    - [x] Guided `6A`：403顯示確切permission與聯絡角色；具`settings.admin_matrix`的Admin可前往`/settings/workflow`，一般使用者不顯示管理連結。
    - [x] 2026-08-06 Phase 1H：頂層只保留`圖號工作台`與`審核工作台`；`保留號`是生命週期狀態，`補歷史版`是正常進版的輸入模式，不另開頁面或審核流。
    - [x] 2026-08-06 Phase 1H：送審、核准、退回與撤回只能經由一個權威；舊`submission`明細不再作為使用者頁面，deep link只導向canonical圖號／審核工作台，不得顯示平行核准／駁回／取消動作。
    - [x] 2026-08-06 Phase 1H：同一角色、同一狀態最多一個primary CTA；使用者只看到準備中、送審中、退回修改、研發受控與正式發布，歷史是檢視分類而非第二狀態機。
    - [x] `HD-053-1H-01 / Guided 1A`：送審成功後只顯示一個動態primary CTA；目前使用者對exact approval request具可執行審核責任與權限時顯示`前往審核`，其餘情況顯示`查看進度`。
    - [x] `HD-053-1H-02 / Guided 2A`：申請人可在第一個審核決策發生前撤回；任何核准／退回決策發生後即不可撤回，後續必須走修正或新進版。撤回只能經canonical approval command與同一transaction authority，不得直接改raw submission status。
    - [x] `HD-053-1H-03 / Guided 3A`：移除獨立legacy送審明細操作面與使用者可見的稽核drawer／頁面；舊deep link依角色與狀態導向圖號工作台或exact審核工作台，不保留平行決策介面。後端紀錄政策由後續`HD-053-1H-04 / 4C`另行取代。
    - [x] `HD-053-1H-04 / Guided 4C`：DEV-053圖面進版流程完成後，前後端都不保留審核歷程，只留下版次生命週期狀態；不保留永久申請人／審核人／決策／時間／理由紀錄。此為圖面進版領域的限定資料政策例外，不追溯刪除既有資料，也不自動套用至BOM、成本、作廢或其他審核領域。
    - [x] `HD-053-1H-05 / Guided 5A`：退回理由為選填；若有填寫，只作為目前`退回修改`狀態的active correction instruction，重新送審成功時立即刪除。未填理由時顯示中性通用下一步，不阻擋退回。
    - [x] `HD-053-1H-06 / Guided 6A`：先成功固化版次生命週期結果並送達必要通知，才將workflow視為完成並清除submission／approval／decision／outbox business data；任一步失敗不得提前清除。
    - [x] `HD-053-1H-07 / Guided 7A`：允許最長7天的短期技術idempotency／recovery token；只含防重雜湊、操作scope與到期時間，不含人員、理由、檔案內容或可重建審核歷程的payload，到期自動刪除。
    - [x] `HD-053-1H-08 / Guided 8B`：Phase 1H啟用時，既有進行中圖面進版案件一併轉接新流程；啟用採全批次fail-closed，先dry-run、再無決策重播地建立canonical active authority，任何阻擋即不得部分開啟。既有已完成案件與正式PDM資料不轉接、不刪除、不重寫。
    - [x] `HD-053-1H-09 / Guided 9B`：必要通知以成功更新`圖面目前狀態／我的待辦`投影為送達；投影不得保存申請人、審核人、理由或request history。terminal結果與目前狀態投影同一transaction完成，Phase 1H不建立永久`numbering_notifications`審核訊息。
    - [x] `HD-053-1H-10 / Guided 10B`：完成／清除後的舊送審連結導向該圖號的最新版，不再開啟原送審版次或歷史審核頁；新連結必須攜帶server驗證的drawing fallback，無法解析的舊bookmark安全回`圖號工作台`。
  - Phase 1G Multi-Part Batch Revision Contract：
    - UI：`/numbering/revisions`顯示所有合法primary-manufacturing料號checkbox，預設全選；至少一個，摘要與CTA直接顯示數量／清單及`核准時全成或全退`。
    - API：GET/POST接受`partNumberIds`；scalar `currentPartNumberId`只保留舊client相容。Server必須逐一驗證company、drawing與link type，任何一筆失效即整批拒絕。
    - Data：新增additive `submission_part_scopes`，不回填既有submission；舊資料沒有scope row時沿用`submissions.item_id`／legacy snapshot。新submission、scope、files、snapshot與audit同一transaction。
    - FFF：同一圖面變更共用一組FFF輸入，並把state/outcome複製至每個scope。no/suspected impact支援多料號；confirmed impact多料號回`DRAWING_SUBMISSION_MULTI_PART_REPLACEMENT_REQUIRED`，直到可逐舊料號提供替代結果。
    - Release：正式化前逐一驗證snapshot link仍存在且link type一致，再於單一transaction更新全部item/part；任一關係漂移或寫入失敗完整rollback。P01/P02/P03歷史都必須追到同一submission。
    - Security/compatibility：PostgreSQL/Supabase 025啟用且強制RLS，撤銷`PUBLIC/anon/authenticated`直連；migration未套production。既有正式／保留號資料零回填、零改號、零狀態重播。
    - Affected files：`src/app/numbering/revisions/page.tsx`、submission workbench/create/status/list/item-history repositories、三個revision submission API routes、`db/schema.sql`、`db/postgres/025_submission_part_scope.sql`、Supabase mirror、types與focused QC scripts。
    - Spec Impact Preflight：`Intentional replacement`；取代三份舊規格與既有ADR中的「多個primary只能選一個current part」，但保留一圖多料、owner authority、legacy snapshot與正式版次政策。
    - Stop：production migration/deploy/release、歷史回填、逐料號confirmed-impact替代演算法、權限放寬、DEV-054任何hunk、或無法以單一transaction保證全成全退時停止。
  - 2026-08-06 Optional Standard Cost Amendment：
    - Scope：只調整圖號工作台與圖料工作台 drawer 的圖面進版送審準備語意；標準成本資料、成本設定／審核、金額權限與`補成本`入口保持原功能。
    - Rule：`missing standard cost`為`optional`，不得加入`outstandingCount`、紅色`待補`或送審disabled條件；有缺漏時顯示`未設定（選填）`，已設定時仍顯示完成狀態。
    - Compatibility：本修正不改schema、API payload、既有料號／成本資料或權限，也不觸及DEV-054；技轉包的獨立submission-gate政策不在本次DEV-053畫面修正範圍。
    - Acceptance：當三個料號唯一缺口都是標準成本時，送審檢查顯示`資料已備妥`，成本顯示為中性選填資訊；若另有主資料或待審項目，待補數只計真正阻擋項。
  - 2026-08-06 Revision Intent Recovery Amendment：
    - Scope：修正加入新版次檔案後的送審工作台刷新行為；不改版次政策、附件authority、資料schema或既有附件。
    - Rule：使用者開始將檔案加入目標版次後，該版次意圖鎖定；context refresh不得將`0.2`自動推進成`0.3`，新檔必須仍留在本次送審範圍。
    - Acceptance：A0005-M01以0.2加入2個新版檔案後，畫面仍保持0.2、兩檔可選為本次送審，`建立送審（1張圖・3個料號）`依其他必要條件啟用；重新解析另一圖號才可重置版次建議。
  - 2026-08-06 Historical Revision Backfill UX Amendment：
    - Scope：在既有圖號drawer辨識低於目前受控最新版、但尚未納入送審的工作附件，依版次聚合並提供單一`補登 X 歷史版`入口；入口導向canonical `/numbering/revisions`正常送審頁，不在drawer內嵌第二套表單，也不新增頁面、schema、API或審核流程。
    - Rule：正常進版與歷史補登共用同一全頁工作台。補登連結只額外預填舊版次、該組附件與安全`returnTo`，並鎖定版次意圖；不得自動送審、刪除、重傳、改號或改寫既有資料。核准結果沿用既有out-of-order規則只進歷史，不取代較新正式版。
    - Supplement boundary：`申請補件`只可對目前physical `Released`附件包的同版次工作檔顯示；舊版補登與effective `ReviewApproved`／physical `Pending`附件包不得誤顯示補件表單。
    - Spec Impact Preflight：Intentional replacement；依2026-08-06使用者最新決策，將前一版「drawer內展開共用元件」替換為「導向canonical正常送審頁」。較低版次補登、核准後進歷史、authority與資料生命週期不變。
    - Acceptance：固定3000的A0005-M01顯示`0.2 未送審舊版`、`目前最新版 0.3；核准後只進歷史。`及單一CTA；點擊後離開drawer並在正常圖面進版頁維持0.2、預選兩個0.2檔案與三個料號，提供`返回圖號`，無drawer內嵌表單、無`申請補件`、無0.4誤跳、無自動mutation。
    - Evidence：`qc:dev-053:ui` 23/23、TypeScript PASS、scoped ESLint 0 error；固定3000登入session真實點擊確認drawer內嵌表單0個，補登URL帶`source=historical_backfill`、0.2與兩個attachmentId，正常頁預選2檔／3料號且顯示安全`返回圖號`；一般`上傳與送審`亦導向相同頁面。console error 0、水平overflow 0，驗證停在建立送審前，既有A0005資料零寫入。
  - Phase 1H Single Lifecycle and Approval Authority RD Implementation Contract：
    - 文件成熟度：`Local RD Implemented / AI QA + Independent QC Passed / Production Release Gated`。`HD-053-1H-01..10`均已落地；exact schema、migration、adoption、command、cleanup、UI、error code與QA/QC mapping見權威SPEC 0.10。
    - 問題：圖面進版建立送審後，系統仍可把使用者導向舊`/submissions/{id}`操作面，同時各頁以raw `Pending`、effective review與publication不同口徑顯示狀態，造成已核准仍待審、舊核准入口觸發minor release blocker與通知長期殘留。
    - 使用者價值：使用者只需知道「現在是什麼狀態、下一步做什麼」，不需辨識FFF、raw/effective status、legacy submission或多個審核頁。
    - 精簡原則：`2-1-1-0`—只有圖號與審核兩個作業面；每個情境只有一個使用者狀態、一個primary CTA；沒有可見legacy決策動作。
    - Scope：收斂圖號工作台、送審後成功狀態、審核工作台、active workflow投影、terminal cleanup、dashboard/KPI、通知、附件／歷史列與舊approve/reject/cancel route的狀態與動作口徑。
    - UI：`圖號工作台`承接建立、上傳、補歷史版、送審、進度與歷史；`審核工作台`承接所有reviewer決策。送審後只顯示一個動態primary CTA：對exact approval request具可執行審核責任與權限者顯示`前往審核`，其餘顯示`查看進度`。
    - 狀態：主畫面只使用`準備中`、`送審中`、`退回修改`、`研發受控`、`正式發布`；低於最新版只決定列入歷史，不建第二套狀態。新Phase 1H流程完成後不得另留raw/effective approval business history。
    - Architecture Memory Capsule：流程active期間`ApprovalRequest`是唯一review decision authority；完成後`RevisionPackage`的server-side lifecycle projection是唯一保留的審核業務結果，Phase 1H不永久保留`Submission`／approval decision／audit history。正式版次、受控檔案、三個料號scope及latest/history分類仍是PDM主資料，不屬審核歷程。核心層回傳semantic allowed actions，BFF/presenter當下計算`displayStatus`與唯一`primaryAction`，不持久化URL或下一步。
    - Compatibility：既有已完成正式／保留號、版次、submission、approval與audit資料零刪除、零回填、零改號、零重播；依8B，啟用時仍進行中的合格圖面進版workflow會由一次性adopter建立canonical native request與transient sidecar，legacy列只讀且從inbox抑制，完成後才依4C清除其workflow graph。任何ambiguous／已決策衝突／含非本流程子資料案件阻擋整批啟用。
    - Out of Scope：追溯刪除既有production submission／approval／audit、將`4C`擴大至其他審核領域、production資料修復／live migration／deploy／release、改寫DEV-050 minor `Released`政策、confirmed-impact多料號替代演算、DEV-054任何程式／migration／SPEC／QA／QC或刪檔。
    - RD Handoff／狀態動作：server projection優先序固定為`正式發布 > 研發受控 > 退回修改 > 送審中 > 準備中`，raw legacy status不得覆蓋effective lifecycle；history只是分類。semantic actions限`continue_preparation`、`submit_for_review`、`open_exact_review`、`view_progress`、`withdraw_before_decision`、`correct_and_resubmit`、`create_revision`與`none`，每位使用者只可有一個primary。
    - RD Handoff／退回撤回：DEV-053 reviewer UI只提供`核准`與`退回修改`；退回理由選填，保存到目前correction state並於重新送審成功時刪除。申請人只有在decision count為0時可撤回；撤回回到可編輯準備狀態並保留已準備檔案，但不保留撤回歷程。
    - RD Handoff／資料保留：fresh Phase 1H不再建立legacy `submissions`作審核authority；以native `approval_platform_requests`加transient `drawing_revision_lifecycle_workflows`運作。正式版次包、受控檔案及`drawing_revision_package_part_scopes`永久保存；terminal apply同交易更新`drawing_revision_packages.lifecycle_state`作9B目前狀態投影，再以domain-scoped cleanup清除active graph。既有已完成列隱含permanent；8B只允許明確adopted active graph在完成後清除。
    - RD Handoff／防重：technical token最長7天，只存不可逆雜湊、command scope、結果指紋與expiry，不存actor／reason／file／snapshot。每次重試仍重做company、permission、assignment與state檢查；token到期自動刪除且不得成為查詢型audit API。
    - RD Handoff／API與deep link：建立送審、exact approval decision及新增withdraw command都委派同一authority；成功response回傳drawingNumber、revision、displayStatus、semantic actions與canonical redirect，不要求client再讀已清除request。新exact review URL必須帶安全drawing fallback；terminal cleanup後舊request URL回canonical圖號狀態，不提供歷史明細。legacy mutation只能delegate或fail closed零寫入。
    - RD Handoff／權限：送審維持`numbering.draft.update`加Engineer/Admin與company scope；審核需R&D Manager/Admin且必須是當下assigned eligible reviewer；撤回僅原submitter且尚無decision，Admin無額外覆寫；cleanup只允許system service。403須顯示缺少能力與聯絡角色，不得顯示不存在的audit入口。
    - RD Handoff／交易恢復：final decision、revision materialization與9B目前狀態／待辦投影同一transaction；不以外部通知或永久notification row作cleanup前置條件。其後單一idempotent cleanup transaction刪除transient graph。apply失敗不得terminal或cleanup；cleanup失敗禁止重做decision/apply，只重試cleanup。generic metric只記去識別計數。
    - 驗收方向：正常進版與歷史補登都必須從圖號工作台送到exact canonical審核案；0.3已是最新版時補送0.2，核准後0.2自動列入歷史且0.3仍是最新；圖號、通知、KPI、附件與審核佇列口徑一致；舊決策頁／API不可產生寫入。另須驗證有／無退回理由、第一decision前後撤回、通知失敗與cleanup重試、7天token清除、完成後業務審核資料為0及既有資料hash零變化。
    - UI/QC方向：每個受影響狀態5秒內可辨識狀態與下一步，正常狀態最多一個primary CTA；不顯示內部識別、重複說明或無決策價值警語；真實登入UI必須完成create → system CTA → exact review → approve → reload，且visible/console error、誤導動作與非預期overflow為0。
    - Stop：需要第二個持久化狀態權威、cleanup會放寬其他approval領域append-only／RLS、無法先解除transient FK再清除、無法隔離既有資料、必須寫既有A0005／production資料、需觸及DEV-054，或無法安全分離共用hunk時停止回PM。
    - Evidence Required：targeted contract tests覆蓋projection/actions/permission/withdraw/optional reason/terminal cleanup/token TTL/legacy fail-closed；disposable DB證明新flow cleanup後無business workflow rows且formal package完整；existing-data hash與DEV-054 manifest不變；固定3000真實登入完成submitter與reviewer雙角色流程、visible/console error 0、主要viewport無overflow。
    - Exact implementation：新增`db/postgres/026_drawing_revision_lifecycle_authority.sql`及Supabase mirror、package lifecycle欄位、durable part-scope、transient workflow與7-day token表；新增`drawing-revision-lifecycle` domain/repository/adopter，收斂create/decision/withdraw/legacy redirect與workbench projection。exact files、FK cleanup order、錯誤碼、切片與QC commands見SPEC 0.10。
    - Execution result：`1H-1～1H-4`本機完成；schema 15/15、adoption 9/9、authority 9/9、HTTP 9/9、UI 9/9、真實Chromium 8/8，共59/59；獨立QC重跑同為59/59，`P0=0 / P1=0 / P2=0`。optimized build與approval-platform 126/126回歸通過。
    - Re-entry：只有明確commit或release型指令才進下一關；production migration、8B live adoption、flag activation、deploy與release仍需獨立release gate，開始前重新保存DEV-054 protected manifest與dirty-boundary。
  - Phase 1F PM Reopen Brief：
    - 問題：目前16組缺口涵蓋固定3000生命週期閉環、既有上傳／附件能力、受控檔與參考附件authority、recovery routing、預設可發現性、搜尋競速、drawer-list一致性、keyboard／403／empty／terminal狀態、可見文字、計數口徑與accessible name。
    - 已確認：工作台第一次進入固定`全部`且不含歷史；`我的待處理`與`工作中`保留為效率篩選，歷史由明確toggle控制，不使用localStorage恢復上次範圍。
    - Scope：Phase 1F只修正常固定3000與單一工作台能力／狀態退化，並補AI真實操作gate；既有正式與保留資料只讀驗證、零回填／零改號／零審核重播。
    - Out of Scope：雙分頁、`development_phase`／DVT、DEV-054任何hunk、production migration／資料修復／deploy／release、權限放寬或第二套受控檔案authority。
    - 驗收方向：使用新建可清理fixture在正常固定3000完成`建立 → 候選首版 → 多檔加入 → 證據完成／可恢復 → 送審 → 撤回／再送審 → 核准 → 原子正式化`；正式secondary入口必須實際點入完成代表性任務，link count不算通過。
    - 防再發：完成宣告必須同時綁定normal runtime、current scoped SHA、dirty-boundary、完整capability matrix、Now What／visible text／accessibility與DEV-054 unchanged evidence。
    - 權威文件：`.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`第0節、對應QA delta與QC reopen紀錄。
  - 問題與根因：`src/app/numbering/drawings/page.tsx`在flag開啟後直接回傳`DrawingWorkbench`，造成舊正式圖面drawer與管理區完全不渲染；QA只驗證新生命週期主線，沒有以既有能力清冊做negative-regression gate。
  - 使用者價值：使用者只需進入一個頁面，但仍能搜尋、判斷生命週期並完成正式圖面、料號主資料、版次、送審、附件與關係治理，不必在「簡單流程」與「完整功能」之間二選一。
  - 目前有效成果：
    - [x] `Phase 1A` server-side一致性投影、stable row key、detail BFF、default-off flag及additive source context。
    - [x] `Phase 1C` contextual append改走candidate workspace、relationship-only bundle、原子正式化與權限/idempotency邊界。
    - [x] `Phase 1B` 最小formal drawer驗收維持撤銷，已由Phase 1E完整能力組合取代。
    - [x] `Phase 1D／1E` QA與QC證據只保留為歷史凍結快照；Phase 1F已由current source重新取得完整產品PASS。
  - Phase 1F RD Implementation Contract：
    - `1F-1 / P0 Normal-3000 candidate closure`：在`NODE_ENV !== production && PDM_LOCAL_FULL_FUNCTION_VALIDATION=true`使用現有storage寫入、SHA-256 read-back驗證與non-production evidence receipt；production忽略此flag。候選UI支援多檔、分類、說明與primary，逐檔成功／失敗；每張圖只以至少一個active primary finalized controlled file作blocker，其他格式缺漏只警告。完成必要檔案後自動顯示送審，不另增完成按鈕、不自動送審。
    - `1F-2 / P0-P1 Workbench state integrity`：`/numbering/drawings`預設`view=all&history=exclude`，`tab=reserved`相容為work；`包含歷史`明確切換。Rejected改為`correction_required／建立修正版`，Obsolete、Merged與取消各有原因／下一步。list request採abort+sequence；filter重設cursor，選取列離開結果即關drawer；恢復完整keyboard與focus。
    - `1F-3 / P1 Formal capability restoration`：`MasterAttachmentPanel`以`authorityMode`分離唯讀受控摘要與可管理參考附件，恢復預覽重建、Drive重試、刪除／還原、補件流程且不形成雙authority。抽出共享`DrawingRevisionWorkbench`供page/drawer使用；進版與上傳送審只差initial focus。關係、影響、主資料與歷史保留專用頁並帶drawing/return context。
    - `1F-3 permission/recovery`：detail BFF提供`canUpdateDraft`、`canCreateRevision`、`canManageReferenceAttachments`、補件與`canManagePermissions`等server-derived capabilities，後者只由`settings.admin_matrix`推導；disabled/403顯示permission code、中文能力與contact role，只有有權Admin可到`/settings/workflow`。401/403/404/409/5xx分流，使用者草稿與已成功檔案不得因可重試錯誤消失。
    - `1F-4 / P0 Freeze and AI QA handoff`：更新既有DEV-053 schema/read-model/http/ui/flow/real-operation scripts；正常`npm run dev:local`先驗證既有檔不用重傳即可解鎖送審，再完成新檔上傳→送審→撤回／再送審→核准→原子正式化，另驗證secondary實際操作、RWD、accessibility、既有資料zero-write hash、scoped SHA及DEV-054 unchanged manifest。
    - [x] `1F-1`完成：development-only storage write + SHA-256 read-back evidence、多檔逐檔上傳／恢復、主要受控檔blocker與格式warning已實作並由UI真實操作通過。
    - [x] `1F-2`完成：default all、明確history、Rejected correction、terminal說明、request/cursor/selection競速保護與keyboard操作通過focused contracts。
    - [x] `1F-3`完成：受控／參考附件authority分離、共享revision workbench、正式secondary入口、exact permission/admin routing與恢復文案通過。
    - [x] `1F-4`完成：aggregate QC、真實Chromium、固定3000唯讀驗證、production build與cleanup證據完成；未連線或寫入production。
    - Exact data/API：沿用`numbering_candidate_revision_*`與`numbering_publication_evidence`，不新增schema/migration；既有`candidate-revisions/{revisionId}/files` route的POST維持上傳authority，PATCH提供target-only既有檔驗證，多檔由UI逐檔編排；list BFF新增／正規化`history=exclude|include`與capability fields，不新增平行mutation API。
    - Exact primary files：`scripts/start-localhost-3000.ps1`、`src/lib/number-lifecycle-simplification.ts`、`src/lib/publication-evidence.ts`、`src/components/numbering-candidate-revision-editor.tsx`、`src/components/drawing-workbench.tsx`、`src/lib/drawing-workbench.ts`、`src/lib/repositories/drawing-workbench-async-repository.ts`、`src/app/api/numbering/drawings/workbench/**`、`src/components/master-attachment-panel.tsx`、`src/app/numbering/revisions/page.tsx`、新`src/components/drawing-revision-workbench.tsx`與DEV-053 focused scripts。files/attachments route只有contract test證明必要時才做最小變更。
    - Stop：需要schema/provider enum、新business table、production target/credential、既有資料寫入、權限放寬、第二套受控檔authority、direct master create或觸及DEV-054時立即停止回PM。
  - Historical Phase 1E RD Implementation Contract（不代表目前Phase 1F ready）：
    - 單頁資訊架構：保留`我的待處理／工作中／全部`與唯一primary CTA；候選列使用生命週期drawer，正式drawing列使用完整正式圖面drawer，兩者共享同一頁與deep link，不共用一個過度簡化內容模板。
    - 清單可見性：保留核心`圖號／品名／工作狀態／下一步`，並以欄位或列內次資訊恢復關聯料號、主資料狀態、待審、發布不一致與警告；恢復用途與資料狀態篩選。不得加入`development_phase`篩選或顯示。
    - 正式圖面操作：生命週期primary CTA置頂；另保留不競爭primary的固定secondary入口：`圖面進版`、`上傳與送審`、`完整圖料關係`、製造圖`影響分析`與`申請作廢`。production slice封鎖時顯示既有`未開放`原因，不可把功能靜默隱藏。
    - 正式圖面治理：恢復發布狀態不一致、Title block變體風險、送審完整性/成本/待審檢查、同主根料號、主要製造圖與標準成本資訊。
    - 料號主資料：恢復同主根料號清單與既有權限下的材質、顏色、表面處理、變體備註編輯；Released/locked資料仍走原authoritative guard，不因同頁化放寬權限。
    - 附件：candidate首版與formal revision仍是受控檔案唯一寫入authority；正式master drawer顯示受控摘要與前往權威工作台的入口。若保留既有一般附件CRUD，必須標為`參考附件`、沿用原權限/production-slice guard，且不得成為送審或publication evidence。
    - API/data：優先擴充既有workbench detail projection以提供正式drawer所需欄位；不得由browser額外拼接形成不一致資料。Phase 1E不新增schema/migration、不回填、不改號、不修改approval/release authority。
  - Historical Phase 1E exact implementation boundary（Phase 1F不得直接照此開工）：
    - 主要檔案：`src/components/drawing-workbench.tsx`、`src/app/numbering/drawings/page.tsx`、`src/lib/drawing-workbench.ts`、`src/lib/repositories/drawing-workbench-async-repository.ts`、`src/app/api/numbering/drawings/workbench/**`、DEV-053 focused scripts與必要CSS。
    - 可最小修改的共用檔：`src/components/master-attachment-panel.tsx`、`src/components/numbering-contextual-entrypoints.tsx`、`src/app/globals.css`；只允許DEV-053能力恢復hunk，不得覆寫其他任務變更。
    - 受保護/禁止修改：`db/postgres/023_remove_project_status_authority.sql`、`supabase/migrations/20260804030000_remove_project_status_authority.sql`、DEV-054 SPEC/ADR/QA/QC、已刪除的DVT頁面/API/測試、`development_phase`移除與DEV-054權限/規則調整。
    - Git邊界：不得整檔stage混合變更；共用檔必須逐hunk檢查。若DEV-053無法與DEV-054安全分離，停止commit並回Dev PM，不以還原另一AI成果解決。
  - Historical Phase 1E slices：
    - [x] `1E-1 Formal row parity`：已恢復篩選、列內關聯/治理摘要與固定secondary入口。
    - [x] `1E-2 Full formal drawer`：已恢復治理面板、同根料號、主資料編輯、成本/主要圖與附件authority導流。
    - [x] `1E-3 Regression automation`：已新增舊功能清冊assertions、route/action可達性、read-only authority、production-slice visible-disabled與bounded keyset檢查。
    - [x] `1E-4 AI QA + Independent QC`：AI QA與凍結commit獨立QC真實操作皆為27/27；focused 50/50、TypeScript、scoped lint、isolated build通過，P0/P1/P2皆為0。
  - Historical Phase 1E驗收紀錄（不得作Phase 1F PASS）：
    - [x] 單一工作台、候選/正式row去重、唯一primary CTA與舊reserved deep link仍成立。
    - [x] 正式drawing可依用途、資料狀態、系列與關鍵字查詢；關聯料號與治理警示不需猜測或切回舊頁。
    - [x] 每張正式drawing都能發現版次、上傳送審、完整圖料關係、影響分析（適用時）與作廢入口；被production slice或權限封鎖時可見原因。
    - [x] 發布不一致、Title block風險、送審檢查、同根料號、標準成本與主要製造圖均可見且資料與authoritative API一致。
    - [x] 有權使用者可維護既有料號主資料；無權、Released/locked、跨公司與stale write均fail closed。
    - [x] 受控檔案只在candidate/revision authority寫入；正式master drawer為唯讀摘要並導回candidate/revision authority。
    - [x] DEV-053範圍未修改、還原或提交`DEV-054`的DVT刪檔、023/024 migration、SPEC/ADR/QA/QC或專案狀態移除hunk。
    - [x] 1440×900、1280×720、1024×768及390×844可完成主流程，無水平overflow、CTA裁切或drawer重要功能不可達。
    - [x] open/search/filter/drawer/deep link零寫入；隔離寫入流程cleanup完成，productionConnected=false、productionWrites=false。
  - Historical QA/QC evidence：`qc:dev-053` aggregate、typecheck、scoped lint、isolated build與Chromium 27/27只對Phase 1E frozen snapshot有效；不得作Phase 1F或目前固定3000 PASS依據。
  - Spec Impact Preflight：`Intentional replacement`。保留單頁與server projection，撤銷「四欄簡版＋最小drawer即完成」的錯誤UI契約；DEV-052/050 authority與DEV-054專案狀態移除均保持authoritative。
  - ADR判定：不新增ADR。development evidence adapter不改production provider，附件分層沿用既有controlled/reference authority，read projection仍由現有ADR涵蓋；若實作需要provider enum、持久化authority、migration或新mutation route，停止並另開ADR。
  - 風險等級：High。主要風險為正常固定3000無法閉環、再次漏功能、雙檔案authority、錯誤action routing、production-slice靜默隱藏、證據與current SHA脫鉤及覆寫並行DEV-054。
  - RD停止條件：需要新增schema/migration、回填/改號、放寬權限、direct master create、雙file authority、修改DEV-054、操作3000正式資料、production/deploy/release或無法安全分離共用hunk時停止。
  - 文件成熟度與執行邊界：`Phase 1G Multi-Part + Optional Cost Local RD / AI QC Passed / Commit Pending / Production Migration & Release Gated`。本機批次進版及成本選填修正完成；尚未commit，025 production migration／deploy／release仍未授權。

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

- ✓ DEV-054 [交付點] [本機 RD/QA/QC 通過] [P0] [Production Release Gated] 移除 PDM 專案狀態權威
  - 摘要：完整移除 AI PDM 的 EVT/DVT/PVT 與語意等價 PLM phase-gate、`development_phase`、DVT 晉升及 phase-based rules，讓專案管理軟體成為唯一專案狀態權威。
  - 來源 ID：`DEV-PDM-PROJECT-STATUS-BOUNDARY-001`
  - 父任務：`DEV-049`、`DEV-053`、`DEV-005`
  - Human Decision：2026-08-04 使用者明確要求直接從系統移除；不採隱藏、降級或雙軌相容。
  - 執行範圍：本機產品、SQLite compatibility、PostgreSQL source migration、Supabase mirror、targeted QA/QC；不連線或修改正式環境。
  - 驗收標準：active runtime/API/UI/current schema 無 project phase 或 PLM phase-gate；品質階段只有研發階段／技術移轉；變更管制是獨立 workflow dimension；DVT workflow 與正常 action catalog 資訊退役；release/technical-transfer/revision/change-control authority 不退化；舊註冊測試、migration 與 UI 證據齊備。
  - 下一步：本機產品範圍已完成；只有收到明確 production migration/deploy/release 指令時才進 release gate。
  - 證據：保留 2026-08-05 QA reopen 作歷史，修正後 R01～R12 獨立重驗全部通過；完整證據收斂至 `.ai-doc/qc/qc-dev-054-project-status-removal-2026-08-04.md` 與 `output/playwright/dev-054-project-status-removal/evidence.md`。
  - 停止條件：需要 live migration、production data rewrite、deploy/release、清除不可變歷史audit或建立外部專案管理整合時停止並另走gate。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-PROJECT-STATUS-BOUNDARY-001-remove-project-phase-authority.md`、`.ai-doc/decisions/ADR-PDM-PROJECT-STATUS-BOUNDARY-001-external-project-authority.md`、`.ai-doc/qa/qa-pdm-project-status-removal-validation-plan-2026-08-04.md`。
  - 計入交付：是

- ✓ DEV-055 [交付點] [完成] [P1] [Phase 1A～1D 本機] 任務導向的人類狀態投影
  - 摘要：把多維 domain status 經 projector 收斂成一個人類可判斷的主要狀態，另以 availability scope 區分研發可用／生產可用，統一圖號、料號、圖料清單、filter 與共用 drawer，移除「草稿確認」及重複 badge。
  - 成熟度：`RD Implementation Ready / Human Confirmed / Local RD Complete / Production Release Gated`
  - 來源 ID：`DEV-PDM-HUMAN-STATUS-PROJECTION-001`
  - 父任務：`DEV-PDM-STATUS-UX-001～003`、`DEV-PDM-NEXT-STEP-UX-001`、`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-053`
  - 執行範圍：1A shared contract/projectors；1B additive API/server filter；1C 一狀態清單與共用 drawer；1D 三 route、三 viewport QA/QC。Drawing workbench 沿用既有 cursor；parts/relations 本輪沒有 client pagination。
  - 驗收標準：每物件最多一個主要狀態；usable 依 evidence 顯示研發／生產可用範圍；list/drawer/filter同源；無「草稿確認」；owner detail共用；server filter先於 response limit；既有權限與 lifecycle 不退化；資料不足不得宣稱生產可用。
  - 下一步：本機 Phase 1A～1D 已完成；若進 production，先依 release gate 在 disposable DB 重跑關聯操作 suite，再另行處理 deploy/release。
  - 阻塞 / 恢復條件：若正確狀態需 confirmation schema、正式資料回填、權限或 lifecycle authority變更，停止並回到規劃；不得由 Draft或無 blocker推論已確認。
  - 證據：`.ai-doc/specs/SPEC-PDM-STATUS-UX-004-human-status-projection.md`、`.ai-doc/decisions/ADR-PDM-STATUS-UX-004-task-driven-human-status-projection.md`、`.ai-doc/qa/qa-pdm-human-status-projection-validation-plan-2026-08-06.md`、`.ai-doc/qc/qc-dev-055-human-status-projection-2026-08-06.md`。
  - 計入交付：是（文件 ready 不計完成；產品實作及 QC 通過後才計入）

- ☑ DEV-056 [交付點] [RD Implementation Complete / Local E2E Verified / Production Release Gated] [P0] [Phase 1E 本機可執行] SolidWorks 2D PNG 預覽端到端修復
  - 摘要：修復 `.SLDDRW` 預覽工作雖已排入佇列卻沒有被2D worker領取，且頁面永久顯示「預覽產生中」的端到端缺口；管理員只需在UI管理Document Manager key，worker必須自動啟動、套用exact active version並產生current-hash PNG。
  - 成熟度：`RD Implementation Complete / Human Confirmed by 2026-08-19 execution request / Local E2E Verified / Production Release Gated`
  - 來源 ID：`DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001-AUTOPILOT-001`
  - 父任務：`DEV-023` / `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`；依賴 `DEV-035` UI-only DPAPI/GSM lifecycle與`DEV-058` broker；關聯`DEV-079` unified drawing workspace。
  - 原始需求邊界：使用者回報`A0002-M01.SLDDRW`長時間停在「預覽產生中」，並明確要求重開既有對應DEV、寫成開發文件供RD執行；不得把PowerShell環境變數設key當日常解法。
  - 事實基線：job `f88ad620-88b3-4514-9882-d9ba8bea72ca`為`drawing_pdf/queued`、`attempt_count=0`、`locked_by=null`；runtime status的Document Manager preview worker PID為0且state=`not_configured`，但3D models-only與recognition workers在線。來源檔存在且無2D derivative，故直接故障點在worker接手前，不是來源內容解析失敗。
  - Spec Impact Preflight：`Intentional replacement + compatible extension`。保留Windows隔離worker、source-hash derivative、token-gated broker、current-owner completion與Phase 2 PDF界線；取代「DEV-056已完成」、launcher以env/GSM判斷key、SLDDRW自動排`drawing_pdf`及queued可永久顯示processing的舊契約。
  - 風險等級：Medium / P0。產品主要預覽能力完全阻斷，但本Phase只修改本機worker啟動、既有queue kind、read projection、settings readiness、UI狀態與focused tests；不改source CAD、domain ownership、permission、正式資料或production。
  - RD Readiness Gate：P0/P1產品與工程決策缺口為0；provider、啟動條件、job/derivative kind、heartbeat capability、逾時、錯誤語意、檔案邊界、migration、QA/QC與停止條件均已封口，Phase 1E-A～D已完成。
  - Phase 1E-A／credential與launcher：`start-localhost-3000.ps1`不得以plaintext env/GSM設定作為2D worker啟動前提；Windows interop、worker script、service token與server可用即啟動。worker透過既有private/no-store broker解析`windows_dpapi`或`google_secret_manager` exact active version，無key時常駐並回blocked heartbeat，UI啟用後同PID hot apply，不需restart。
  - Phase 1E-B／job kind：Current Phase `.SLDDRW -> PNG`一律建立`native_thumbnail_png`；Document Manager worker亦只claim同kind並產生`thumbnail_png`或`sheet_png` derivative。`drawing_pdf`保留Phase 2且未有對應renderer時不得由自動流程排入。既有錯kind queued job以`preview_kind_unavailable`安全終止，再依current source hash idempotently建立正確PNG job，不直接改寫歷史job。
  - Phase 1E-C／capability truth：復用`worker_capability_heartbeats`，新增獨立capability code `solidworks_2d_preview_png`與`POST /api/preview-workers/heartbeat`；idle/running均每15秒回報`ready|blocked|degraded`、exact version/fingerprint、renderer version與stable issue code。recognition的`solidworks_document_manager` heartbeat或3D Shell PID不得滿足2D renderer在線。
  - Phase 1E-D／recovery與UI：所有attachment/detail read projections共用同一preview prepare/recovery流程。queued且120秒無claim轉`preview_worker_unavailable`；running且30秒無heartbeat最多重排3次，再轉terminal failed。只有已被可用worker接手的running狀態可顯示「預覽產生中」；offline／blocked／kind mismatch顯示可行動原因與重試，不得無限spinner。
  - Component boundary：`scripts/start-localhost-3000.ps1`、`scripts/run-solidworks-document-manager-preview-worker.mjs`、preview worker credential/heartbeat/claim routes、`src/lib/settings-secret-lifecycle.ts`、`src/app/settings/page.tsx`、`src/lib/preview-derivatives.ts`、`src/lib/master-attachments-async.ts`、`src/lib/pdm-entity-detail.ts`、所有SLDDRW自動enqueue producers、drawing preview components及focused QC scripts。復用既有generic heartbeat table，預期`schema migration=None`。
  - 驗收標準：① UI-only key，secret零DB/log/browser/args洩漏；② launcher/status可見2D worker running而非因缺env誤報not_configured；③ producer/claim kind一致；④ A0002同一source hash被claim、attempt≥1並建立ready PNG derivative；⑤ unified drawing workspace無手動重整顯示實圖；⑥未claim逾時顯示service unavailable而非processing；⑦rotation/revoke、stale owner/hash guard、3D/PDF/image/Drive與DEV-035 recognition不退化；⑧1440×900、1024×768、390×844無visible error/overflow。
  - Required evidence：`npm.cmd run qc:pdm-sw-native-preview-worker`、`npm.cmd run qc:pdm-sw-native-preview-redaction`、`npm.cmd run qc:master-attachments`、`npm.cmd run qc:dev-056:2d-preview-e2e`、`npm.cmd run qc:dev-056:2d-preview-browser`、settings lifecycle／DEV-035 credential regressions、typecheck、affected lint及`output/qa/dev-056-2d-preview/<runId>/`的job/heartbeat/derivative/source-hash/redaction/browser manifest。
  - 歷史證據處理：101/101、68/68、103/103與`auto-preview-updated.png`只保留為3D與placeholder partial baseline；該截圖的2D「處理較久」不是成功預覽，也不能支持本Phase completion。
  - 停止條件：需要修改CAD來源、儲存plaintext key、在Next.js request內執行native CAD、採desktop COM/Add-in、新license採購、schema destructive change、正式資料修復、production/deploy/release，或無法取得真實A0002 worker/PNG/browser evidence時停止，不得恢復完成狀態。
  - 相關文件：`.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`、`.ai-doc/decisions/ADR-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-worker-derivative-boundary.md`、`.ai-doc/qa/qa-pdm-sw-native-preview-worker-validation-plan-2026-07-06.md`。
  - 實作與驗證結果（2026-08-19）：Phase 1E-A～D已完成。`start-localhost-3000.ps1`不再以plaintext env作為2D worker啟動門檻；UI-managed `windows_dpapi` exact active version由常駐2D worker透過broker套用並回報`solidworks_2d_preview_png` heartbeat。所有`.SLDDRW`自動producer與worker claim統一`native_thumbnail_png`，錯kind歷史工作保留並由read recovery建立正確PNG工作；detail/list/workspace共用stale recovery與truthful status projection。
  - 真實A0002 E2E：source `A0002-M01.SLDDRW` bytes/hash未變；job `d8d13547-da31-4bb1-8b72-d352a083a516`以`native_thumbnail_png`被`dev056-solidworks-2d-preview-worker` claim，`succeeded`、`attempt_count=1`；heartbeat為dedicated capability `ready`、active version 3；current-hash `thumbnail_png` derivative為`image/png`、640×480、real `windows_solidworks_preview_worker`；authenticated browser DOM驗證A0002-M01 workspace選定`2D 圖面`、preview link存在且無stuck processing copy，未手動重整。
  - QC結果：`typecheck:app`、affected ESLint、`qc:pdm-sw-native-preview-worker` 109/109、`qc:pdm-sw-native-preview-redaction` 68/68、`qc:master-attachments` 103/103、`qc:pdm-settings-center-secret-lifecycle` 34/34、`qc:pdm-gcp-secret-manager` 36/36、`qc:dev-035:completion-gate` PASS、`qc:dev-056:2d-preview-e2e` 18/18與`qc:dev-056:2d-preview-browser`三viewport PASS全部通過。後續UI fit amendment另以`output/qa/dev-056-2d-preview/20260819135345-browser/`驗證PNG使用image renderer、置中填滿舞台且無溢出；未保存key、raw broker body或absolute secret path。
  - UI fit amendment（2026-08-19）：修正2D `image/png` derivative被錯誤放入`iframe`而以intrinsic size釘在左上角的呈現缺口。`PreviewMedia`依實際MIME選擇`<img>`或PDF文件renderer；影像以`object-fit: contain`填滿主視覺舞台，保留比例、不裁切、不變形。此為相容延伸，不改preview job、derivative、source hash、permission或API authority。
  - Runtime handoff：驗證用2D worker為本次task-owned temporary process，已停止且確認無同worker殘留；既有project-owned `127.0.0.1:3000` server未停止。未執行production、deploy、release、migration或資料修復。
  - 下一步：DEV-056 Phase 1E本機交付已完成；若要支援`.SLDASM`、Phase 2 `.SLDDRW -> PDF`、staging/production GSM或正式 rollout，需另開授權的DEV/Release Gate，不得回寫本DEV完成證據。
  - 計入交付：是；本次local Phase 1E receipt已取代重開前partial baseline，production/release完成率仍不得由本DEV推論。

- ◇ DEV-057 [交付點] [Local RD Implemented / QA-QC Reopened by DEV-059 / Release Not Authorized] [P0] [本機驗證重啟] 精簡圖號明細工作卡與狀態導向入口
  - 摘要：保留圖號、版次、受控檔案、預覽下載、送審與主資料能力，但將 Drawer 首屏收斂為「目前狀態、誰負責、唯一主要下一步、必要例外」；關係、影響、參考附件、歷史與高風險維護移入「更多」分組，降低使用者的判斷與誤操作成本。
  - 成熟度：`Local RD Implemented / QA-QC Reopened by DEV-059 / Release Not Authorized`。
  - 2026-08-19 current-direction amendment：`DEV-079` 已依使用者 `1B／2A／3A` 有意取代 Drawer 內直接編輯／上傳／送審的 placement；本 DEV 已有產品與 QC 證據只保留為歷史基線，不得再當作現行目標 UI。資料、command 與 permission authority 不因 placement 變更而失效。
  - 來源 ID：`DEV-PDM-DRAWING-WORKBENCH-SIMPLIFICATION-001`。
  - 父任務：`DEV-053`、`DEV-055`、`DEV-056`。
  - 是否計入產品交付：是。
  - 原始需求邊界：使用者要求「保留最重要的東西，整體優化重新設計」，本輪已完成基線 commit，現在進入本機產品實作；不涉及 schema、正式資料、production、deploy 或 release。
  - 任務目標：讓 RD、主管與審核者開啟圖號明細後，在 5 秒內辨識圖號身份、目前工作狀態、自己是否需要操作，以及下一個可執行動作。
  - 使用者成功條件：正常狀態首屏最多一個主要 CTA；等待他人處理時不再顯示會誘導重複送審的上傳入口；未完成項目可直接跳到修正位置；所有跨頁操作可返回原圖號上下文。
  - 風險等級：Medium。原因是會改變主要 UI flow、CTA 命名、資訊層級與跨頁返回行為，但本任務預設不改 schema、lifecycle authority、permission model 或正式資料。
  - 根因判定：目前 Drawer 同時暴露流程操作、查詢、附件管理、主資料維護、關係維護與高風險作廢功能；標題 primary action 已依狀態分流，但內容 action row 仍以功能存在與權限為主，造成「等他人處理」與「上傳與送審」並存。
  - 設計原則：
    - `唯一主要 CTA = 狀態 × viewer responsibility × permission × terminal` 的投影結果。
    - 首屏只回答「我在哪裡、現在狀態、下一步、風險」。
    - 受控檔案的正式預覽與下載保留；參考附件、Google Drive、刪除紀錄與 audit 降至明細層。
    - 只顯示未完成或有風險的必要條件；正常完成項目不常駐佔版面。
    - 作廢、移除、同步、核准等高風險操作不與主要進版 CTA 並列，必須進「更多」並帶影響摘要與確認。
  - 首屏保留：圖號身份與用途、單一人類工作狀態、唯一主要 CTA、必要撤回入口、受控版次檔案預覽／下載、未完成主資料例外、送審版次與料號數量摘要。
  - 「更多」分組：`關聯與影響`（圖料關係、製造圖影響分析）、`附件管理`（參考附件、補件、歷史附件、Google Drive 同步）、`資料維護`（補資料、補成本、新增同根圖號、新增同圖料號）、`歷程與高風險`（歷史版本、作廢申請、必要送審追溯與權限設定）。
  - 狀態 CTA 初步契約：`等他人處理／送審中`顯示`查看審核進度`並只在申請人尚未決策時保留`撤回送審`；`指定審核人`顯示`前往審核`；`退回修改`顯示`繼續修正並重送`；`已發布／研發受控`顯示`建立新版次`；`系統處理中`顯示`查看處理進度`；`已作廢／已合併／歷史`顯示`查看歷史紀錄`。不在等待、處理中或歷史狀態顯示上傳、送審或編輯入口。
  - 行為與返回契約方向：進版、圖料關係、製造影響與附件補登等跨頁入口必須保留安全 `returnTo`；完成、取消、阻擋與錯誤狀態都要回到原圖號上下文或提供明確替代入口，不得只回模組首頁。
  - Out of Scope：不刪除底層關係、影響、附件、歷史、成本、主資料、作廢或送審能力；不改 domain lifecycle、schema/migration、正式資料、權限模型、審核 authority、production deploy、release、mobile 專用版或新 provider 整合。
  - Spec Impact Preflight：暫判 `Compatible exception`；本任務調整 DEV-053/055 已確認的可見資訊層級與入口位置，保留 `2-1-1-0`、single lifecycle、single primary action 與既有 owner authority。進入 `RD Contract Ready` 前，須對照 `SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001`、`SPEC-PDM-NEXT-STEP-UX-001`、`SPEC-PDM-STATUS-UX-004` 與 entity drawer contract，若移動入口會改變既有驗收或權限語意，改列 `Intentional replacement` 並同步權威文件。
  - 初步驗收方向：A0005-M01的`等他人處理`首屏只顯示`查看審核進度`；六種主要狀態各有唯一且不誤導的CTA；受控檔案預覽／下載不退化；未完成主資料、成本或審核項目可直接進入修正或追蹤位置；「更多」仍能發現關係、影響、附件、歷史與高風險操作；1440、1024、390 viewport無CTA競爭、水平溢位、裁切、不可操作或visible raw error；既有送審、撤回、補登、附件下載與主資料維護流程仍可由新入口完成。
  - RD Implementation Contract：沿用 server-derived `row.primaryAction` 作為 Drawer 唯一主要 CTA；`DrawingDetailContent` 的首個操作區只提供狀態必要的次要撤回與 `更多` 分組，不重新推導 lifecycle 或 permission。`更多` 以 `關聯與影響`、`附件管理`、`資料維護`、`歷程與高風險` 分組，既有能力只改可見層級，不刪除 command authority。
  - Component/route boundary：新增 `src/components/drawing-workspace-drawer.tsx` 作候選／正式唯一 owner drawer；`src/components/drawing-workbench.tsx` 與 `src/components/number-state-workspace.tsx` 只保留 adapter/slot 組裝，`src/components/numbering-candidate-revision-editor.tsx` 直接在候選 body 內運作。沿用 `src/components/master-attachment-panel.tsx`、`src/components/numbering-contextual-entrypoints.tsx` 與既有 `returnTo`；不改 domain mutation/API authority。
  - State/role matrix：`revision_in_review + exact reviewer` 顯示 `前往審核`；`revision_in_review + other actor` 顯示 `查看審核進度`，僅申請人且 decision count 0 顯示 `撤回送審`；`correction_required` 顯示 `繼續修正並重送`；`rd_controlled/released` 顯示 `建立新版次`；`auto_finalizing/recovery_required/history_only` 沿用既有 system/recovery/history primary action，禁止競爭性上傳入口。
  - Return contract：進版、關係、影響、歷史補登與從「更多」開啟的跨頁操作都攜帶原圖號安全路徑；`/numbering/revisions` 維持既有返回；`/numbering/search` 與 `/numbering/impact` 必須消費 `returnTo`，完成、阻擋、取消與錯誤狀態提供回原圖號或明確替代入口。
  - Visible text budget：正常首屏最多一個 primary CTA；保留圖號身份、用途、狀態、責任提示、受控檔案摘要與未完成例外；Google Drive、刪除資料、完整 audit、參考附件 CRUD 與技術狀態降至更多／明細／例外狀態。
  - Dangerous-action contract：作廢、撤回、移除、補件與同步維持原權限與 API guard；移入更多後仍須保留可見風險摘要、disabled reason、確認或恢復入口，不以簡化為由靜默隱藏。
  - Spec Impact Preflight 結論：`Compatible exception`。本次只收斂資訊層級、入口分組與 return context，符合既有 single lifecycle、single primary action、owner authority 與 no raw error 契約；不修改 lifecycle、schema/migration、permission、資料或 API command authority。
  - 2026-08-08 Intentional replacement：依使用者明確指示，candidate/formal 不再只共享骨架，而是必須直接渲染同一 `DrawingWorkspaceDrawer`。`準備首版圖面` 改為同頁 incomplete-data 狀態，不得再作為 header/body 導航 CTA；既有 candidate/formal adapter、mutation authority、permission、API、schema 與 lifecycle truth 維持不變。
  - 實作停止條件：若必須修改狀態 authority、schema、migration、權限、資料清理、既有 API 相容契約，或無法安全分離 DEV-054 protected hunk，停止並回 PM。
  - 停止條件：需要新增或修改狀態、審核 authority、schema、migration、權限、資料清理、既有 API 相容契約或刪除既有使用者能力時，停止本任務並回 PM 重新定義 scope。
  - 相關文件：`.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`、`.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`、`.ai-doc/specs/SPEC-PDM-STATUS-UX-004-human-status-projection.md`、`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`、`.ai-doc/qa/qa-pdm-unified-drawing-workbench-validation-plan-2026-08-04.md`、`.ai-doc/qa/qa-pdm-human-status-projection-validation-plan-2026-08-06.md`。
  - 候選受影響介面：`src/components/drawing-workbench.tsx`、`src/lib/drawing-workbench.ts`、`src/components/master-attachment-panel.tsx`、`src/components/numbering-contextual-entrypoints.tsx`、`src/app/numbering/revisions/page.tsx`、`src/app/numbering/search/page.tsx`、`src/app/numbering/impact/page.tsx`；實作前由 RD Contract 再確認，不預先視為全部必改。
  - 歷史證據：候選／正式 owner paths 直接使用同一 `DrawingWorkspaceDrawer`；候選開啟後 0 次額外導航即見首版 editor，visible `準備首版圖面` 為 0，缺檔提示只出現一次；正式受控檔案／預覽／待處理附件不退化。Typecheck、drawer QC 42/42、number-state UI 8/8、DEV-053 UI 23/23、scoped ESLint皆通過；當時獨立 QC P0/P1/P2=0，candidate 1440/390與formal 1440 evidence位於 `output/qa/pdm-entity-detail-drawer-ai/20260808021459-single-workspace-recheck/`。這些證據只保留為歷史基線。
  - QA 重啟理由：2026-08-09 使用者在 current route 提供現場截圖，顯示候選整包送審確認視窗無法由可見關閉動作解除，重新進入仍被同一 modal 阻擋；舊證據未覆蓋 current-route hard reload、bfcache、runtime 中斷與三種關閉動作的獨立重驗，因此不得再代表現況 PASS。
  - 下一步：執行 `DEV-059`；只有 focused regression、current-route AI 真實操作、故障注入、disposable mutation/cleanup 與資料前後核對全部通過，才可恢復本機 QA-QC PASS。commit/merge/PR/deploy/release 仍需另行明確授權。

- ✓ DEV-058 [交付點] [RD Implemented / Local Phase 1A-1D QC Passed / Production Release Gated] [P0] [本機與 staging-ready 開發] Google Secret Manager 與 SolidWorks 2D Worker 憑證整合
  - 摘要：將設定中心 secret material authority 從已過時的 Supabase Vault provider 改為 Google Secret Manager；Cloud SQL 只保存 exact version reference 與 lifecycle metadata，可信任 Windows worker 透過 token-gated BFF route 取得 active key，且 UI 分開呈現「憑證可用」與「worker 在線」。
   - 成熟度：`RD Implemented / Local Phase 1A-1D QC Passed / Production Release Gated`。
  - 來源 ID：`DEV-PDM-GCP-SECRET-MANAGER-SW-WORKER-001`。
  - 父任務：`DEV-022` / `DEV-PDM-SETTINGS-CENTER-001`、`DEV-023` / `DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`、`DEV-046`、`DEV-056`。
  - 是否計入產品交付：是；本機實作與 QC 通過可計本地交付，production/native readiness 必須另有 live GCP 與真實 `.SLDDRW` 證據。
  - 原始需求：使用者確認系統已移至 Google Cloud，要求不要再設定 Supabase，並要求新增 `google_secret_manager` provider、Cloud SQL metadata-only、Google Secret Manager key authority 與 worker readiness；本輪要求由 PM 寫成可派工開發文件。
  - 任務目標：修正「UI 已啟用 key，但 2D worker 無可讀 secret」的 provider mismatch，使 Admin 設定、server secret access、Cloud SQL metadata 與 Windows native worker 形成一致閉環。
  - 使用者成功條件：Admin 可在 UI 輸入、測試、啟用 key；key 不進 DB/瀏覽器/log；worker 可取得 exact active version；2D 預覽卡自動接續；UI 不把已存 key 誤報為 worker 已在線。
  - 風險等級：High / P0。涉及 credential authority、跨環境 IAM、schema provider check、server-to-worker secret broker 與 production architecture replacement；任何 secret leakage、錯版讀取、授權繞過或錯誤 readiness 均為停止條件。
  - Spec Impact Preflight：`Intentional replacement`。`ADR/SPEC-PDM-SETTINGS-CENTER-001` 的 settings center、Admin activation、redaction、audit 與 lifecycle 繼續有效；其中 Supabase Vault provider 決策由 Google platform authority 與本 DEV 明確取代。
  - Authority contract：Google Secret Manager 保存 secret material；Cloud SQL 保存 provider、exact version resource reference、mask/fingerprint、lifecycle/test/audit metadata；Cloud Run BFF 使用 ADC 存取；Windows worker 不持有 Google service-account key。
  - Provider contract：新增 `google_secret_manager`；staging/production 新 draft 僅允許此 provider；`local_test_double` 僅供 isolated test 且永遠不得回報 ready；`supabase_vault` 只保留歷史診斷，不得建立新的正式 draft。
  - Version contract：Admin 建立 draft 時只對預先 provisioned secret 新增 immutable version；Cloud SQL pin exact `projects/.../versions/{n}`，禁止 runtime 使用 `latest`；test 通過才可 activate，前一 active metadata reference 原子 retired。
  - Worker contract：沿用 `/api/preview-workers/solidworks-document-manager-key`，採獨立 bearer token、constant-time compare、private/no-store、redacted audit；只回傳給 trusted worker，key 僅存在 worker process memory。
  - Readiness contract：`credential readiness` 與 `worker presence/job heartbeat` 分離；儲存或啟用 key 不能推論 Windows worker 在線，3D worker 正常也不能冒充 2D worker 正常。
  - Schema contract：fresh SQLite/PostgreSQL provider check 加入 `google_secret_manager`；新增 `db/postgres/027_settings_secret_google_secret_manager.sql`；保留 legacy physical columns `vault_provider/vault_secret_id` 以避免 destructive rename，其中後者只存 exact GCP version resource reference。
  - IAM contract：release IaC 預建單一環境 secret；Cloud Run runtime service account 僅在該 secret 取得 `roles/secretmanager.secretAccessor`，需要 UI 新增版本時另給 `roles/secretmanager.secretVersionAdder`；不得給 project-wide Admin 或 version destroy 權限。
  - Component boundary：預期修改 `src/lib/google-secret-manager.ts`、`src/lib/settings-secret-lifecycle.ts`、`src/lib/repositories/settings-secret-async-repository.ts`、settings secret routes、worker credential route、settings readiness UI、Document Manager worker、SQLite/Postgres schema/migration 與 focused QC scripts。
  - Out of Scope：live Secret Manager/IAM/Terraform、deploy、production migration/data repair、Supabase plaintext migration、secret disable/destroy/delete、worker service-account JSON、Cloud Run native CAD、`.SLDDRW -> PDF`、interactive 3D。
   - Current-phase authorization：已完成本機 Phase 1A～1D RD、focused QC 與三 viewport browser evidence；Live GCP resource mutation、staging/production activation與 release 不因本地完成自動獲得授權。
  - 驗收標準：exact-version write/read、metadata-only DB、Admin lifecycle/RBAC、worker broker auth/no-store、redaction sentinel、provider/schema migration、false-readiness negative cases、Google 403/404/429/5xx mapping、3D/PDF/image/Drive regression與三 viewport browser evidence全數通過。
  - Release evidence：Secret Manager/IAM readback、live staging add/read、Cloud SQL metadata-only、真實 Windows `.SLDDRW` claim/heartbeat/PNG/browser auto-update與 revoke negative proof；缺一不得聲稱 2D production ready。
  - Git boundary：DEV-058 使用獨立 focused commit；不得混入目前 DEV-057、numbering/drawing lifecycle、正式資料、generated output、worktree temp 或 release artifact。
  - 停止條件：需要 live resource/IAM mutation、production deploy/migration、plaintext import/storage、Google credential 下放 worker、broader Admin/destroy permission、legacy metadata deletion或 native CAD execution boundary 變更時，停止並回 PM/release gate。
   - 相關文件：`.ai-doc/specs/SPEC-PDM-GCP-SECRET-MANAGER-001-solidworks-worker-credential.md`、`.ai-doc/qa/qa-pdm-gcp-secret-manager-solidworks-worker-validation-plan-2026-08-07.md`、`.ai-doc/qc/qc-pdm-gcp-secret-manager-solidworks-worker-report-2026-08-07.md`、`.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`、`.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`。
   - 下一步：進入 `DEV-032` release gate，先完成 staging Google Secret Manager/IAM、Cloud SQL metadata-only、真實 Windows `.SLDDRW` claim/heartbeat/PNG 與部署回滾證據；本地完成不等同 production ready。

- ✓ DEV-059 [開發點] [Local RD Implemented / AI QA-QC Passed / Commit Pending / Production Release Gated] [P0] [本機已完成] 候選整包送審確認視窗與 runtime 復原
  - 摘要：修正候選工作區送審確認 modal 被持續保留、所有可見關閉動作失效，以及重整／重新進入後仍阻擋工作的缺陷；同時把「資料是否齊全、為何仍是候選號、下一步會發生什麼」改成使用者可理解的單一狀態敘事。
  - 成熟度：`Local RD Implemented / AI QA-QC Passed / Commit Pending / Production Release Gated`。
  - 來源 ID：`DEV-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001`。
  - 父任務：`DEV-057`；關聯規格：`DEV-052` lifecycle readiness、`DEV-053` unified drawing workbench。是否計入產品交付：否，為既有交付點的 P0 缺陷修復。
  - 原始需求：使用者回報「不論按什麼鈕都無法消除彈出視窗，重新點進來仍卡住，也不知道缺什麼」，並要求寫成含 QA 驗證計畫、必須由 AI 真實操作驗證的開發文件。
  - 事實基線：`A0006-M01` 的 revision、主要 3D、2D 圖面、finalized evidence、圖料關係與本機檔案 hash/size 已核對齊全；畫面卡住不是可接受的缺件提示。AI 已在同一路由動態重現：明細抽屜 document-level `pointerdown` outside-click listener 先於 React delegated click 處理彈窗按鈕，造成 close click 失效與 click-through 風險。
  - 風險／優先級：Medium / P0。修改範圍預期為本機 modal lifecycle、focus/keyboard、navigation/runtime recovery 與狀態文案；但目前缺陷會完全阻斷主要送審工作，故缺陷優先級為 P0。
  - Spec Impact Preflight：`Compatible exception`。保留 `DEV-052` 候選／整包送審／自動正式化 authority 與 `DEV-057` single workspace，只補齊確認層的 local close、清除、復原與資訊呈現；若根因要求改 API、schema、permission、lifecycle 或正式資料，停止並重新做 preflight。
  - Phase 1A 根因重現：以截圖同一路由與 workspace 重現，蒐集 DOM/focus、React state 觸發源、URL/history、console、network、server log；分辨事件未觸發、state 立即重開、hydration/runtime mismatch、overlay click-through 或 navigation restore，不得只靠 source inspection。
  - Phase 1B lifecycle/recovery：modal 只能由使用者明確點擊送審 CTA 開啟；`X`、`返回檢查`、`Escape` 各自只關閉最上層 modal，保留 drawer、候選與捲動／合理 focus；切換候選、關閉 detail、unmount、hard reload、back/forward、bfcache 不得還原確認 modal；runtime/API 失敗須可關閉、重試或安全 readback。
  - Phase 1C 狀態文案：readiness 完成時顯示 `資料已齊，可以送審`、`目前仍是候選圖號；核准完成前不可正式使用`、`缺件 0` 及本次送審的圖號／料號／版次／檔案摘要；不得同時顯示「可送審」與令人誤解為缺件的警告。
  - Phase 1D AI 真實操作：AI 已在真實瀏覽器完成 X、返回、Escape、CUA physical click、hard reload、back/forward、候選切換與 1440×900／1024×768／390×844 viewport；另以 `DEV059-20260809-161835-isolated` 在 disposable isolated runtime 由 UI 實際建立、送審、故障注入、readback、撤回／取消與 cleanup。結果記於 `.ai-doc/qa/DEV-059-real-operation-evidence-2026-08-09.md`；共享候選保持唯讀。
  - 預期影響：`src/components/number-state-workspace.tsx`、`src/components/drawing-workbench.tsx`；只在 current evidence 證明共用層責任時修改 overlay lifecycle 與 mutation result recovery。新增 `scripts/qc-dev-059-candidate-submit-modal-ui.mjs`、`scripts/qc-dev-059-candidate-submit-modal-real-operation.mjs` 與兩個 package commands；不新增 schema、API、permission 或 lifecycle authority。
  - 驗收：三種關閉動作 100% 可用且零 write；無背景 click-through；重整／history／候選切換不自動重開；三 viewport 無 overflow/裁切；focused static 9/9、typecheck、affected-file lint 與 AI current-route operation evidence 通過。isolated runner 11/11 PASS，覆蓋 submit-lock、單一 request、withdraw/cancel、planned 503、response-loss authoritative readback、idempotent replay、cleanup removed 與 formal master zero pollution；production connection/write false。
  - 停止條件：無法取得同一路由真實 browser 證據、需要修改 lifecycle/API/schema/permission/正式資料、需要 live cloud/production mutation，或 fault injection 無法隔離時，標為 `Blocked/Insufficient Evidence`，不得以靜態測試或舊截圖宣稱 PASS。
  - 證據要求：`output/qa/pdm-candidate-submit-modal-recovery/<runId>/` 必須包含 before/after screenshots、video/trace、DOM/focus、console/network、server logs、mutation/readback、data sanity、cleanup、defects 與 UX scorecard；缺任一關鍵證據只能判 `未充分驗證`。
  - 相關文件：`.ai-doc/specs/SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001.md`、`.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md`、`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`、`.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`。
  - 證據：`npm.cmd run qc:dev-059:candidate-submit-modal-ui` 9/9、`npm.cmd run qc:dev-059:candidate-submit-modal-real-operation` 11/11、`npm run typecheck` PASS、affected-file ESLint PASS、`npm run qc:dev-053:flow` 7/7、number-state Phase 1C approval integration 27/27、Phase 1C HTTP 11/11、AI browser current-route evidence 8 cases PASS；isolated artifact `output/qa/pdm-candidate-submit-modal-recovery/DEV059-20260809-161835-isolated/`。既有 `qc:dev-053:real-operation` 在 stale DEV-053 list assertion 前停止，未作 DEV-059 pass evidence。
  - 下一步：DEV-059 extended gate 已完成，父 `DEV-057` 本機 QA/QC 恢復 PASS；保留 commit、merge、PR、deploy、production 與 release gate，未執行上述動作。

- ✓ DEV-060 [交付點] [Local RD/QA/QC Passed] [P1] [Commit Pending / Production Release Gated] BOM 工作台入口與建立 BOM 清單
  - 摘要：採方案 B 建立獨立 `/bom/new` 兩步驟全頁流程，把 `建立 BOM`、`BOM 工作台`、`BOM 審核` 分成三個可理解任務；所有來源建立相同 canonical ownership 的 Draft，再以 `draftId` 交接工作台。
  - 來源 ID：`DEV-PDM-BOM-MODULE-ENTRY-001`；關聯 approval authority：`DEV-PDM-APPROVAL-PLATFORM-001`。
  - 人類已確認（2026-08-10）：`1A` 兩步驟全頁；`2` Part Number 代表物料身份且無 Revision，Drawing/BOM 為各自獨立版控的受控定義；`3B` 第一版同時支援 CAD、SolidWorks XLS、空白人工三種來源。
  - 治理 authority：`.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`。同一物料身份只提升實際受影響的 Drawing/BOM Rev；FFF、互換性、法規／品質管制或其他物料身份條件改變時建立新 Part Number，並建立其自己的 BOM。任何未來 DEV 使用「料號升版」皆為 blocker。
  - Spec Impact Preflight：`Intentional replacement + cross-spec convergence`。入口為 compatible extension；但既有 `bom_drafts.parent_revision = submissions.revision`、child revision 與 submission-bound ownership 違反新 identity authority，必須同 DEV additive migration，不能只加 UI。
  - 產品流程：Step 1 以三個區塊分流：只列 CAD／組合件證據且無進行中草稿的組合件、可直接建立空白 BOM 的 canonical owner、以及 Draft／PendingReview／Rejected 續作入口；既有進行中草稿不得再列為新建候選。空白路徑直接建立 `source=manual`；XLS 由空白區塊的次要入口帶入 owner/BOM Rev 後進入 Step 2；組合件仍由 Step 2 選 CAD／XLS／空白來源。所有成功結果導向 `/bom/workbench/<draftId>` 獨立編輯頁。
  - Navigation：`BOM > 建立 BOM` 指向 `/bom/new`；`BOM 工作台` 指向 `/bom/workbench`；`BOM 審核` 指向 canonical `/approvals?domain=bom`。建立頁每步一個 primary CTA，不恢復 `Current / Next / 5 steps` 流程雜訊。
  - Work list convergence（2026-08-10 follow-up）：`BOM 工作台` 不新增第二份草稿清單／入口；Draft、PendingReview、Rejected、Released、Obsolete 均在同一 BOM 清單依 lifecycle 狀態辨識。抽出 `PdmWorkbenchList` 供「圖號工作台」與 BOM 共用 table、selection、keyboard、loading／empty 與 RWD 骨架，兩者只替換欄位與 row content；Archived 不顯示於主清單或 BOM 編輯頁。依使用者紅筆刪除決策，移除常駐「料號／圖面搜尋」左欄，`/bom/workbench` 改為單欄全寬純清單；點選列才導向 `/bom/workbench/<draftId>` 獨立編輯頁。編輯頁不顯示重複頁名／副標、研發階段摘要、正常載入成功提示或「已刪除資料」區塊，並將 BOM 標題、主件、圖號、BOM 數整合成單一 `BOM 基本資料` 橫列，不用多張摘要卡分開佔版位；畫布節點只保留料號／群組名稱、品名與必要來源 badge，BOM Rev、子件 Rev、數量、Level 改由 Drawer 查閱；新增「插入料件」工具列動作，從右側選料 Drawer 搜尋並選擇料件後加入目前群組或主件，維持未儲存狀態，沿用既有 Drawer、搜尋與草稿復原能力；其餘保留操作工具列、畫布與 Drawer。owner/source 建立入口維持 `/bom/new`；舊 `?draftId=` 只作 redirect 相容。
  - Data contract：新 write 以 `owner_part_number_id -> part_numbers.id` + `bom_revision` 為 authority；`source_submission_id` nullable 且只作來源證據。新增 `bom_create_effects`，unique `(company_id, actor_id, idempotency_key)`；Active/Pending uniqueness 改為 owner + BOM Rev。legacy `parent_*` 與 line revision 只相容讀取，新 line 不寫 Part Number Revision。
  - Migration：新增 PostgreSQL `028_bom_material_identity_revision.sql` 與 Supabase `20260810010000_bom_material_identity_revision.sql` mirror/manifest，更新 SQLite schema/bootstrap。先以 company+part number deterministic crosswalk dry-run；唯一匹配才回填。歷史 `parent_revision` 只有序列無衝突時可一次性採認為初始 BOM Rev並留 audit；缺 identity／衝突列 `manual_review`、fail closed，Released history count/hash 不變。
  - API：新增 `GET /api/bom/create-context`、`POST /api/bom/drafts`；更新 `POST /api/bom/drafts/import-xls` 接受 owner/BOM Rev/idempotency；`from-assembly` 只作 canonical adapter，缺 BOM Rev 回 422，不得沿用 Drawing Rev；workbench canonical selector 改 `draftId`。同 key 同 fingerprint 回同 receipt，key 重用不同 payload 回 409。
  - Permission：Engineer 僅能為同 company 且本人建立／負責或有既有受控關聯的 owner 建 Draft，CAD source 仍須通過 submission visibility；R&D Manager/Admin 可處理其管理 company；Manufacturing/Procurement 只能讀 Released。新增 `canCreateBomDraftAsync`，API company fail closed，sidebar 不作唯一權限控制。
  - Repo impact：`src/components/sidebar-nav.tsx`、新增 `src/app/bom/new/page.tsx` 與 `src/components/bom-create-workflow.tsx`、更新 `src/app/bom/workbench/page.tsx`；新增 create-context/generic create routes，更新現有 BOM routes；更新 async/sync repositories、permissions、revision policy、schema/migrations與 focused QC scripts。`src/lib/production-slice.ts` 維持 BOM 未開放，本 DEV 不改 production allowlist。
  - [x] Phase 1A：canonical owner/schema/migration foundation、deterministic legacy crosswalk與 canonical adapter 已完成。
  - [x] Phase 1B：create-context、generic create、XLS canonical input、permission、idempotent effect/authoritative readback、BOM Rev occupied/forward gate 已完成。
  - [x] Phase 1C：三路徑入口、組合件來源步驟、空白／XLS direct entry、`draftId` deep link、canonical approval handoff與 humanized recovery 已完成。
  - [x] Phase 1D：review/release/export/read integration已改讀 canonical fields；canonical Released export、製造唯讀、null child revision release evidence、isolated real-operation與 cleanup 已通過。
  - 驗收：三路徑入口可辨識；空白與 XLS 真實 UI 各成功一次，CAD 在有組合件證據的 fixture 中成功；每筆 Draft owner/BOM Rev 正確且 manual submission=null；Drawing/BOM Rev 互不自動同步；身份改變走新料號；double click/retry/response loss effect count=1；角色/跨公司負向通過；1440×900、1024×768、390×844 無 overflow/裁切/假 affordance；無 raw error/secret。
  - QA/QC：`npm.cmd run qc:dev-060-bom-create` 50/50 PASS；`npm.cmd run qc:bom-workbench-migration-path` 21/21 PASS；清單／獨立編輯頁 follow-up `npm.cmd run qc:pdm-lifecycle-bom-draft-ui` 37/37 PASS（左側常駐搜尋不存在、清單點選後進入獨立編輯頁、返回清單、舊 query URL 轉址、編輯頁不顯示重複頁名／研發摘要／正常載入提示／已刪除資料，BOM 基本資料橫列整合主件／圖號／BOM 數，流程節點文字降噪，插入料件抽屜可搜尋並加入節點、可復原未儲存變更，工具列、畫布與 1440px overflow 均通過）；TypeScript與 affected ESLint PASS。證據明示 `productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`，詳見 `.ai-doc/qc/qc-dev-060-bom-entry-material-identity-validation-report-2026-08-10.md`。
  - Spec Drift Check：`Intentional replacement` 已完成且無未解 P0/P1 drift；舊 submission/drawing revision ownership 僅保留 legacy read compatibility，新 write、review、release、export與權限均使用 canonical owner/BOM Rev。
  - 停止條件：只能以 submission 當 owner、需要猜測/覆寫/刪除 legacy Released history、三來源無法共用 atomic effect authority、API 無法 company fail closed、或需要改 approval authority／production slice／live migration／deploy/release時，停止回 PM。
  - 執行邊界：本輪完成本機產品碼、SQLite isolated migration驗證與 forward PostgreSQL/Supabase migration artifacts；未 apply live migration、未修改 production資料、未 stage/commit/merge/PR/deploy/release。
  - 相關文件：`.ai-doc/specs/SPEC-BOM-WORKBENCH-001-bom-workbench.md` 第 17 節、上述 ADR、上述 QA plan、`.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`、`.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`、`.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`、`.ai-doc/documentation_map.md`。
  - 計入交付：是。

- ✓ DEV-061 [交付點] [本機完成 / Local QA/QC Passed] [P1] [Production Deletion & Release Gated] 圖號／料號檔案歸屬精簡與 3D 共用
  - 摘要：Human Confirmed `HD-061-01..03`：刪除經引用掃描證明無用的既有圖號一般／參考附件；每次候選首版與正式進版都必須由使用者重新上傳一個 primary `.SLDDRW` 與一個 primary `.SLDPRT`／`.SLDASM`，缺一 server hard-block；系統在 durable write 前依 `company + owner scope + verified SHA-256 + size` 判斷，與其他版本完全相同的 3D 共用 canonical `file_asset/shared_cad_model_version` 與實體物件，但仍保留本版 upload receipt、package 關聯與稽核。圖號 UI 只留受控圖面與一個建立／進版 CTA，不再顯示附件管理、參考附件、已刪除資料、重複檔案卡或獨立開啟預覽按鈕；點預覽圖即開啟。料號保留不收合的精簡 `料號文件` 清單。Spec Impact Preflight=`Intentional replacement`：DEV-053 controlled/reference 雙區、舊 package warning-only completeness、post-release supplement new write、shared-3D `two_d_only` 與 generic drawing attachment write authority 在新 write 上由 DEV-061 取代；歷史 Released package／補件／baseline／audit 維持唯讀可追溯。資料契約新增 submission canonical pointer、active owner/hash uniqueness、primary role uniqueness；新 3D upload 必須 concurrency-safe、idempotent 且不跨 company／owner 自動共用。清理 script 預設 dry-run，只刪除未被 package、candidate、supplement、shared model 或 submission 引用的 drawing loose assets，並以 two-phase external object/DB receipt 支援重跑與對帳。
  - 來源 ID：`DEV-PDM-FILE-OWNERSHIP-001`；authority：`.ai-doc/decisions/ADR-PDM-FILE-OWNERSHIP-001-contextual-files-and-3d-content-reuse.md`、`.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`、`.ai-doc/qa/qa-dev-061-pdm-file-ownership-and-3d-reuse-validation-plan-2026-08-10.md`。
  - 父任務：`DEV-053`、`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`、`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`、`DEV-PDM-SHARED-3D-MA-BASELINE-001`；關聯 file authority：`DEV-002`／`DEV-046`。本 DEV 不改 Part Number 無版次、Drawing/BOM 各自版控的 `ADR-PDM-MATERIAL-IDENTITY-REVISION-001`。
  - 執行結果：
    - [x] Phase 1A：canonical file ownership/readiness service、SQLite/PostgreSQL/Supabase schema mirror、`029_pdm_file_ownership_and_3d_reuse.sql`；legacy `two_d_only` 只讀，新 write 禁止。
    - [x] Phase 1B：package-specific revision file API、候選與正式 required-role gate、SHA-256 company/owner scoped reuse；generic drawing attachment POST 已回 `410 DRAWING_REFERENCE_UPLOAD_RETIRED`，part document API 保持可用。
    - [x] Phase 1C：submission 改存 `source_file_asset_id` immutable pointer；package projection 以 canonical 3D asset link 取代重複 bytes；legacy `local_path` 僅相容讀取。
    - [x] Phase 1D：drawing/part UI 收斂、精簡且不收合檔案清單、預覽圖 click target、`qc-dev-061-cleanup-dry-run.mjs` dry-run guard、三 viewport 與真實操作證據。
  - 阻塞／恢復：本機文件與 RD 派工無阻塞。若需要 production／正式 Drive／正式 bucket 刪除或 migration apply、無法 deterministic 建立 protected reference set、無法取得真實 storage object count/hash、需跨 company／owner 自動共用、需允許沿用歷史 3D 而不重新上傳、需恢復 `two_d_only`，或需改 material identity／approval authority，停止並回 Dev PM／release gate；只有人類確認新 authority 與可回復證據後才恢復。
  - 證據：修正後 run `20260810-155227` 已通過並收錄於 `output/qa/dev-061-ai-real-operation/20260810-155227/verdict.md`：file ownership 14/14、UI contract 6/6、真實瀏覽器 14/14、並行同 hash 為 2 receipts／1 canonical／1 physical object、formal pointer/download、candidate required-role parity、跨 owner／company isolation、idempotency 與 cleanup protected scan 均通過；typecheck、affected ESLint 與 isolated build 通過。完整 production storage object count、不可逆 cleanup apply、live migration、commit、deploy、release 仍不在本輪授權內，詳見 `.ai-doc/qa/DEV-061-real-operation-evidence-2026-08-10.md` 與 run-specific verdict。
  - 計入交付：是；本地 Phase 1A～1D 完成且 QA/QC 通過才可標 `Local RD Implemented`，production deletion、migration apply、commit、deploy 與 release 仍各自受 gate 管理。

- ✓ DEV-062 [交付點] [本機完成 / Fixed-3000 QA-QC Passed] [P1] [Release Gated] 料號／圖料單頁工作台與共用 Workbench Core
  - 摘要：將 `/parts` 與 `/numbering/search` 各自從「總表／保留號」雙頁籤整併為單一工作台；沿用 `DEV-053` 已驗證的 read-projection 方向，但不複製圖號功能模組的 domain implementation。共用層只承接跨模組不變量，料號與圖料仍各自投影正確的 row identity、detail 與動作。
  - 來源 ID：`DEV-PDM-UNIFIED-PART-RELATION-WORKBENCH-001`。
  - 父任務／關聯 authority：`DEV-048`、`DEV-053`、`DEV-055`、`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-NUMBER-STATE-FLOW-001`、`ADR-PDM-MATERIAL-IDENTITY-REVISION-001`。
  - 原始需求與後續授權：先要求比照圖號工作台完成單頁整併分析、資深架構 `#差距分析` 與 RD-ready 文件；後續要求補齊並完成本機開發。使用者以固定3000截圖重開QC後，已完成local flag／launcher health矯正、hard reload驗收與focused regression；仍未授權 schema、正式資料、stage/commit、部署或 release。
  - 使用思考習慣：`#差距分析`、`#系統描繪`、`#第一性原理`、`#可驗證性`。

  - 問題與使用者價值：
    - 現況把「候選／保留」誤呈現成與「正式總表」平行的資訊架構，使用者必須先理解內部資料來源，才能找到同一件工作的下一步。
    - 真正任務是依料號或主根脈絡找到工作、判斷目前效力、完成唯一主要下一步；候選與正式是生命週期／來源狀態，不是兩個使用者模組。
    - 完成後，第一次進入 `料號工作台` 或 `圖料工作台`，應在 5 秒內知道「目前看到什麼、哪筆要處理、正式效力為何、下一步是什麼」，不必切換總表／保留號尋找同一物件。

  - 現況基線與架構差距：
    - `/numbering/drawings` 已使用 `drawing-workbench` read projection，能以候選與正式 row key、server-derived status／action、cursor 與 detail source context 支撐單頁；此為參考模式，不代表其元件可原封不動套用其他 domain。
    - `/parts` 仍由 page-level `activeTab` 切換正式清單與 `NumberStateWorkspaceWorkbench module="parts"`；`/numbering/search` 也以 `activeTab` 切換正式關係視圖與 `module="search"`。雙頁籤只是 UI 分流，沒有解決跨來源一致讀取。
    - `parts/page.tsx`、`search/page.tsx` 與 `number-state-workspace.tsx` 各自承擔搜尋、載入、選取、keyboard、drawer、URL 或 workspace lifecycle，形成頁面級巨石與重複控制流程；共用集中在 primitive UI，尚未集中到 application/workflow lifecycle。
    - `search/page.tsx` 直接引用 `parts/page.tsx` 的 `PartDetailPanel`，代表 page layer 洩漏；detail 內容應由 owner-domain component export，而非跨 route page import。
    - candidate 建立入口與 `drawingWorkbenchEnabled` 耦合，且建立後統一導向圖號工作台；這會讓料號／圖料單頁化受到錯誤 feature flag 與錯誤 owner route 控制。
    - `/api/numbering/relations` 已是正式圖料關係聚合與維護 authority，現有逐 root 取得 detail 的路徑有 N+1 風險；新工作台應擴充同一 read authority 或由其 adapter 使用批次 projection，不得建立平行 relation endpoint。
    - 多個 QC script 直接依賴 `number-state-workspace.tsx` 的文字與結構；拆分元件時必須把驗證轉向 public behavior／contract，不能以保留巨石檔案換取測試不動。

  - 已確認產品與架構決策：
    1. 料號與圖料各自只保留一個模組頁，不再顯示「總表／保留號」頁籤；舊 query 只作 zero-write 相容，不恢復第二套操作面。
    2. 單頁化只合併讀取與任務導覽，不合併底層 master、candidate workspace、revision、approval 或 relation mutation authority。
    3. 採「小型 Workbench Core + domain adapters + 共用 UI primitives」，不採三套平行 workbench service，也不採大型 `UnifiedWorkbench<T>`。
    4. 共用 invariants，不共用 domain meaning：core 不得出現 `module === "parts"`／`"search"` 分支；domain adapter 不得重做 cursor、URL、權限、request sequencing、selection reconciliation 或 lifecycle action projection。
    5. Part Number 是無版次的物料身份；候選／正式投影不得新增 `Part Revision`，Drawing 與 BOM 仍各自版控。
    6. 圖料以 root-centric 關係樹為主，不改成扁平 object list；正式關係仍由 `/api/numbering/relations` 與既有 owner APIs 管理。
    7. `DEV-057` 於 2026-08-10 暫停候選與審核 drawer 掛載；本 Brief 不把該暫停狀態複製成料號／圖料目標，也不重新開啟圖號候選 drawer。

  - 目標架構與共用責任：

    | Layer | 共用責任 | 明確不負責 |
    |---|---|---|
    | Workbench Core | actor/company/permission context、一致讀取 snapshot、canonical lifecycle/action projection、signed cursor、URL/deep-link 相容、request sequencing、selection reconciliation | 料號欄位、圖料樹、關係健康、domain-specific CTA 文案 |
    | Shared UI / Controller | `usePdmWorkbenchController`、搜尋／篩選／換頁、keyboard/focus、loading/empty/error、單一 primary action slot、共用 detail drawer shell | 猜測權限／狀態、直接組 domain payload、以泛型條件渲染所有 domain |
    | Part Adapter | candidate bundle／formal part row、料號 owner detail、料號文件與可執行動作投影 | Drawing/BOM revision、關係樹、共用 cursor/URL 邏輯 |
    | Relation Adapter | root tree、candidate overlay、drawing-part links、關係健康／缺口、matrix projection、owner drawer handoff | Part/Drawing master mutation、第二套 relation authority、共用 lifecycle 重算 |
    | Drawing Adapter | 作為 Phase 1A core 等價驗證 consumer；既有可見行為與 authority 不變 | 在本 DEV 重做圖號 UX 或重啟已暫停 drawer |

  - Domain row 與投影方向：
    - 料號工作台：正式料號使用穩定 `part:{partId}`；尚未正式化且含料號工作的 candidate bundle 使用 `candidate:{workspaceId}`，一個 bundle 只出現一次並在 detail 顯示其 typed items。清單排序、filter、status、capabilities 由 server projection 決定，browser 不拼接兩次 API 結果。
    - 圖料工作台：既有正式 root 使用 `root:{rootId}` 且每個 root 只出現一次；有 source root 的 candidate／review 置於同一 root 的「變更審查中」overlay，不複製正式 root。尚無 source root 的新建 bundle 才使用 `candidate:{workspaceId}` 作為獨立準根節點，且不得冒充正式關係或生產可用。
    - 所有 row 都包含穩定 row key、source kind、human status、availability、viewer responsibility、唯一 primary action、capabilities、detail reference；visible UI 不顯示 workspace ID、raw status、cursor 或其他技術識別碼。
    - detail 由 row 的 source context 交給 Part／Drawing owner-domain component；圖料工作台只提供關係脈絡與安全 handoff，不複製料號／圖號明細內容或 mutation form。

  - UX Intent 與資訊分層：
    - 料號工作台主要任務：找一個物料身份，判斷候選／正式效力並完成建立、補資料、送審或查看正式資料的下一步。
    - 圖料工作台主要任務：由主根理解 `主根號 → 圖號 → 料號` 的正式關係、候選變更與缺口；正式樹永遠優先，candidate 不得覆蓋仍有效的正式關係。
    - 第一層只顯示 identity、單一人類狀態、會改變判斷的摘要與一個 primary CTA；第二層 drawer 顯示詳細內容與次要操作；稽核／raw facts 降至明確展開區或專用頁。
    - 正常、blocked、empty、error、history 狀態都必須通過 Now What Test；高風險送審、撤回、核准、刪除與關係修改沿用既有 permission／confirmation gate。

  - Phase capsules：
    - `1A Core extraction / Drawing parity`：從已運作的 drawing read path 抽出 core contracts、controller 與 primitives；圖號輸出、URL、cursor、權限與可見行為須等價，這一階段不算料號／圖料產品交付。
    - `1B Part single workbench`：建立 server-composed part rows 與 Part Adapter，移除 `/parts` 雙頁籤；候選 bundle 與正式料號同一清單、同一 drawer shell、同一 lifecycle action contract。
    - `1C Relation single workbench`：擴充既有 relation read authority 支援 candidate overlay／source-less candidate，移除 `/numbering/search` 雙頁籤；保留 root tree、matrix 與 owner drawer handoff。
    - `1D Compatibility and convergence`：將 `?tab=drafts`、`?tab=reserved` 與既有 bookmarks canonicalize 到對應 view/filter/detail，讀取零寫入；移除不再使用的 page-level分流與跨 page import，將 QC 從 source string coupling 轉為 contract／real-operation evidence。

  - RD exact dispatch contract：
    - [x] `Phase 1A`：新增 `pdm-workbench-contract.ts`、server-only signed cursor、read snapshot helper、`usePdmWorkbenchController`，並讓 drawing repository/component改用 core；Drawing focused read/UI parity通過。
    - [x] `Phase 1B`：完成 Part adapter/repository、read-only list/detail BFF、`PartWorkbench` 與 owner detail component；candidate/formal stable identity、同 snapshot、cost redaction、permission、cursor、zero-write與 legacy capability parity通過。
    - [x] `Phase 1C`：完成 Relation adapter/repository/component與同 namespace detail BFF；`projection=workbench_v1`、formal root uniqueness、candidate overlay/source-less candidate、tree/matrix、owner handoff與 batch hydration通過，既有 relation POST不變。
    - [x] `Phase 1D`：完成 default-off dependency-bound flag、status、legacy URL canonicalization、safe returnTo、flag-off rollback、race/back-forward/reload、query budget、zero-write、responsive/keyboard、real-operation與 focused aggregate regressions。

  - Exact shared/public contracts：
    - 共用base只含`rowKey/rowKind/sourceKind/display identity/updatedAt/humanStatus/viewerStatus/availability/primaryAction/terminal`；Part/Relation domain欄位不可上提到core。
    - signed cursor固定`{version:1,filterHash,updatedAt,rowKey}`、HMAC格式沿用Drawing；filter hash綁domain namespace、normalized filters、actor與company，tampered/cross-context回400並從第一頁復原。
    - controller只負責URL、AbortController/request sequence、cursor history、selection/detail reconciliation與popstate；Part表格使用`PdmWorkbenchList`，Relation保留domain tree renderer，兩者共用keyboard hook與`PdmEntityDetailDrawer` shell。
    - API success皆`private, no-store`；list envelope=`rows,nextCursor,generatedAt,filters`；permission/company/capability由server推導。candidate無view權限時omit且detail 404，不洩漏existence。
    - mutation ownership不變：Part/workspace owner routes、approval/publication commands與`POST /api/numbering/relations`是唯一命令authority；新workbench endpoints只允許GET。

  - Query/performance hard gates（IDs<=400）：Part list<=15、candidate detail<=13、formal detail<=6；Relation list<=18、root detail<=10、candidate detail<=13；增加row/root/child數量不得增加query count。代表性local fixture的BFF p95<=500ms、debounced browser可見更新p95<=800ms；這是focused local gate，不宣稱production SLO。

  - Exact affected-file boundary：
    - 共用／Drawing：`src/lib/pdm-workbench-contract.ts`、`src/lib/pdm-workbench-cursor.ts`、`src/lib/repositories/pdm-workbench-read-snapshot.ts`、`src/components/use-pdm-workbench-controller.ts`、`src/components/pdm-workbench-list.tsx`、既有drawing workbench lib/repository/component與focused QC。
    - Part：`src/lib/part-workbench.ts`、`src/lib/repositories/part-workbench-async-repository.ts`、`src/app/api/parts/workbench/**`、`src/components/part-workbench.tsx`、`src/components/part-detail-content.tsx`、`src/app/parts/page.tsx`、owner create/contextual entrypoints及batch read helper。
    - Relation：`src/lib/relation-workbench.ts`、`src/lib/repositories/relation-workbench-async-repository.ts`、`src/app/api/numbering/relations/**`、`src/components/relation-workbench.tsx`、`src/app/numbering/search/page.tsx`與bounded repository batch reads。
    - Compatibility/QC：feature/status、legacy route resolver、middleware、`.env.example`、`package.json`、DEV-048/053/055及Part/Relation/Drawer regressions。無schema/migration/data file邊界。

  - 初始範圍：共用 read-model／controller／list/drawer shell；料號與圖料單頁 projection；legacy URL compatibility；owner-domain detail handoff；server filter／cursor／capability；desktop、tablet、mobile 與 keyboard/focus 行為；必要的 focused contract 與真實操作驗證。
  - 初始範圍外：schema/migration、既有資料回填／重算／改號、Part Revision、新 lifecycle/status/permission、approval authority、關係 bulk mutation、新圖號 drawer 設計、production slice mutation allowlist 擴張、commit/merge/PR/deploy/release、正式資料寫入或清理。

  - 驗收方向：
    1. `/parts` 與 `/numbering/search` 不再顯示總表／保留號頁籤；candidate 與 formal 均能在單頁被搜尋、篩選、選取與 deep link。
    2. 舊 `?tab=drafts`／`?tab=reserved` bookmark 導向同頁的等價 view/filter，保留安全 `returnTo`，且 open/search/filter/deep-link 全程零寫入。
    3. 料號 candidate bundle 與 formal part 不重複、不產生 Part Revision；圖料正式 root 只出現一次，source-root candidate 疊在原 root，source-less candidate 不冒充正式 root。
    4. row/list/drawer/filter 使用同一 server-derived human status、availability、viewer responsibility 與 capabilities；每個狀態最多一個 primary CTA，無 raw technical status／ID。
    5. Part／Relation adapters 不能自行實作 cursor、URL、permission、request race 或 lifecycle projection；Workbench Core 不能出現 domain switch。靜態 architecture check 與 code review 可直接驗證。
    6. 圖料 read projection 不新增平行 relation API，且以批次查詢消除按 root 逐筆 detail 的 N+1；代表性資料量下需在 RD Contract 定義 query count／latency budget。
    7. 快速搜尋、切 filter、換頁、back/forward、reload、drawer close/reopen 只顯示最後一次有效結果；舊 response／cursor／selection 不得覆蓋新條件。
    8. 1440×900、1024×768、768×1024、390×844 可完成主流程；無水平 overflow、CTA 裁切、drawer 遮擋，方向鍵、Home/End、PageUp/Down、Enter、Escape 與焦點返回符合共用契約。
    9. 原料號主資料、料號文件、圖料 tree/matrix、關係維護 handoff、正式／候選動作與權限能力不得因單頁化消失；以 capability parity matrix 驗證，不以 route 或 link 存在冒充完成。

  - 風險等級：Medium / P1。主要風險為單頁 replacement 遺失既有能力、candidate/formal projection 重複或效力誤標、抽象層過大、stale response、跨公司／權限洩漏、relation N+1 與 legacy route 形成第二套操作面。
  - Spec Impact Preflight：`Intentional replacement`。本 DEV 明確取代 `DEV-048`、`SPEC-PDM-NUMBER-STATE-FLOW-001` 與 `SPEC-PDM-PRODUCTION-SLICE-001` 中把 `/parts?tab=drafts` 視為可見獨立頁籤的 UI 條款，以及圖料頁的 `?tab=reserved` 分流；只替換可見資訊架構與 read projection，不替換 workspace／publication／approval／relation mutation authority。與 `DEV-053` 的單頁、source-context、zero-write compatibility 原則及 `DEV-055` 單一 human status 為相容延伸；對 `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` 是相容擴充，保留正式 root tree 與「變更審查中」，只補上無 source root candidate 的可達性。與 material identity ADR 無衝突。若進入實作，應 amendment 既有 SPEC，不建立重複單頁 workbench SPEC。
  - ADR 判定：已新增並接受 `ADR-PDM-WORKBENCH-CORE-001`。原因是RD-ready contract固定跨模組stable row identity、signed cursor、single snapshot與relation read authority邊界；這些是跨模組public read contract。ADR明確拒絕三套平行service、mega generic component、client merge與平行relation endpoint。
  - AI 假設：第一版不需 schema；parts 可用新的 server read projection 組合既有 formal/candidate repositories，relations 以擴充現有 aggregation 完成。若 representative data 證明無法在既有 identity／query model 內正確投影，停止而不是在 client join 或 N+1 上妥協。
  - 阻塞／恢復條件：本機 Phase 1A～1D 已完成，P0/P1=0。若需要schema/migration、new status/permission/approval/mutation authority、Part Revision、跨多source roots新aggregate、client join/partial read、existing data寫入/修復/刪除，立即停止回Dev PM/ADR；staging/production flag、deploy/release轉deployment release gate。
  - QA/QC結果：isolated `qc:dev-062` aggregate 15/15、contract 40/40、real-operation 33/33；Part query 14/11/6、Relation 18/10/11，且query count不隨代表性cardinality成長。Fixed runtime run `DEV062-FIX-20260810124507-fixed3000`另為10/10：狀態flag enabled/requested、兩路由hard reload、舊頁籤DOM=0、formal/candidate同頁、舊URL正規化、同頁modal、visible alert／overflow／app console／server unexpected error或5xx=0；core 6/6、compat 8/8、Part／Relation focused與TypeScript均通過。Evidence見兩個run的`verdict.md`及`.ai-doc/qc/qc-dev-062-unified-part-relation-workbench-report-2026-08-10.md`。
  - 相關文件：`.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`、`.ai-doc/decisions/ADR-PDM-WORKBENCH-CORE-001-shared-mechanics-and-domain-adapters.md`、`.ai-doc/qa/qa-dev-062-unified-part-relation-workbench-validation-plan-2026-08-10.md`、`.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`、`.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`（DEV-062 amendment）、`.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`（DEV-062 amendment）、`.ai-doc/specs/SPEC-PDM-STATUS-UX-004-human-status-projection.md`、`.ai-doc/decisions/ADR-PDM-MATERIAL-IDENTITY-REVISION-001-part-number-vs-controlled-definition-revision.md`、`.ai-doc/documentation_map.md`。
  - 計入交付：是；Phase 1B 與 1C 都完成且通過整體 capability parity／real-operation gate 才可標示本地產品交付完成。

- ✓ DEV-064 [交付點] [本機 RD/QA/QC 完成 / Human Directed] [P0] [Local Only / Production Migration & Release Gated] 圖號單一資料層與共用明細入口
  - 摘要：建立 canonical `drawings`、`drawing_revisions`、`drawing_revision_files`；同一圖號從準備、審核、研發受控、發布到歷史只轉移狀態，不再產生第二個 canonical identity。
  - 來源 ID：`DEV-PDM-UNIFIED-DRAWING-AGGREGATE-001`
  - 父任務：`DEV-052`、`DEV-053`、`DEV-057`；關聯 `DEV-061`、`DEV-063`。
  - 權威文件：`.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`、`.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-AGGREGATE-001-canonical-drawing-and-revision.md`、`.ai-doc/qa/qa-dev-064-unified-drawing-aggregate-validation-plan-2026-08-11.md`。
  - Current Architecture Impact：candidate revision/file 與 formal package/file 目前是兩套 authority；工作台以 UNION 建立兩種 row key。DEV-064 改由 canonical aggregate 作唯一 identity/read authority，舊 tables 暫時以同一 transaction 寫入作 compatibility projection。
  - RD Contract：draft drawing 建立即有 stable Drawing ID；取得號碼只補號碼；首版建立 canonical revision/file；送審與核准只轉態；工作台 row key 固定 `drawing:{drawingId}`；舊 candidate/formal deep link zero-write 解析到同一 Drawing。
  - Data Contract：SQLite canonical schema 與 PostgreSQL 030 forward migration artifact；existing promoted candidate/formal deterministic 合併、migration 可重跑。正式 migration、live backfill、flag activation與release未授權。
  - Zero-loss Contract：production canonical backfill以每筆 reservation ID 為最小單位；drawing reservation唯一連到canonical Drawing／具名recovery，root／part reservation保留workspace／bundle trace；backfill不得改來源 ID、號碼、狀態與hash。任何 unmapped、duplicate、renumbered 或 cutover freeze 期間 source hash changed 都是 no-go；正式開放後合法state／row-version前進另由audit驗證。
  - Visible Lifecycle Contract：開發階段與未來 production 啟用後，所有 preformal／nonterminal 舊 reservation不論 internal adoption bucket，使用者只看「首版準備」；legacy／addendum／recovery／reconciliation只存在server/admin evidence。正式／發布／terminal維持真實下游狀態。
  - Security Contract：UI capability 不是權限邊界；server/domain 必須驗證 actor permission、state、row version與snapshot。`rd_controlled`／`released` revision content與file relation不可直接改寫，變更須建立新 revision。
  - Acceptance：核准前後 Drawing／Revision／File canonical ID與row count不增加第二份；workbench identity SQL不再 UNION workspace/master；待處理與研發可用皆進同一 drawer frame；multi-drawing workspace每張圖有獨立 stable identity；fault injection時canonical與legacy全 rollback；每一舊 reservation ID恰好納管一次；所有 preformal／nonterminal 舊資料只由「首版準備」找到且不暴露整併過程，正式／發布／terminal由真實後續／歷史找回。
  - Stop Conditions：需要production/staging、live data repair、無法transactional dual-write、放寬immutability/permission/snapshot、任一舊reservation unmapped／duplicate／renumbered、cutover freeze來源hash改變、rollback需刪資料、觸及DEV-054 protected範圍、merge/PR/deploy/release時停止。
  - 實作結果：SQLite 新增 canonical `drawings`／`drawing_revisions`／`drawing_revision_files` 與 deterministic local backfill；PostgreSQL 030 forward artifact 已備妥。所有既有 candidate/formal mutation 在原 transaction 同步 canonical aggregate；workbench identity 改為只讀 `drawings`，row key 固定 `drawing:{drawingId}`，舊 candidate/formal key zero-write解析。2026-08-15新增 user-view projection：舊 pending／approved／inconsistent adoption在 badge、階段、主要動作與下一步區域都只顯示「首版準備」，舊撤回／重試等作業控制不再對一般使用者呈現；來源 facts不改寫。
  - Policy結果：受控 revision 內容與檔案 relation 由 DB trigger fail closed；revision state machine允許準備→送審、審核撤回、核准與發布等合法轉移，禁止研發受控倒退。UI capability 仍由 server/domain permission、state、row-version與snapshot policy驗證。
  - QA/QC結果：focused DEV-064 8/8（含舊保留號 user-view projection與目前統一明細資料契約）；DEV-052 data protection 6/6、UI 17/17、flow 8/8；2026-08-15 focused isolated Chromium run `DEV053-20260815-031953-local-isolated` 7/7，pending／approved／inconsistent舊來源都以 `drawing_preparation` 開啟目前統一明細抽屜，禁用舊制流程文字／控制皆未出現，read hash不變，unexpected console/visible/5xx=0，production connection/write=false，cleanup=removed。既有完整基線仍為DEV-053 schema/read/http/ui/flow = 9/10/14/24/7與isolated Chromium run `DEV053-20260811-061739-local-isolated` 28/28；DEV-062 core 6/6、compat 8/8；DEV-063 10/10；TypeScript與diff check PASS。
  - 證據：`.ai-doc/qc/qc-dev-064-unified-drawing-aggregate-report-2026-08-11.md`、`.ai-doc/qc/qc-dev-052-number-lifecycle-simplification-2026-08-04.md`（2026-08-15 focused amendment）、`.ai-doc/qa/qa-dev-064-unified-drawing-aggregate-validation-plan-2026-08-11.md`、`scripts/qc-dev-064-unified-drawing-aggregate.mjs`、`output/playwright/dev053-real-operation/DEV053-20260815-031953-local-isolated/`。
  - 下一步：若要進 staging／production，需另走 release/data gate，取得 disposable PostgreSQL shadow 做 030 migration/compare，再由 `DEV-032` 規劃 backup/PITR、全量 source/adoption manifest、flag-off readback、live backfill、canary、deploy、smoke 與保留資料的flag rollback；本輪未執行。
  - 計入交付：是（本機產品切片）；production release 仍不計入。

- ✓ DEV-065 [交付點] [Phase 1 + Phase 2 Local RD Implemented] [P1] [SQLite + Browser QA Passed / PostgreSQL Shadow Blocked / Capability Default Off / Production Release Gated] 圖號／料號工作台預覽圖模式
  - 摘要：Phase 1已在DEV-087 canonical圖號工作台恢復`清單／預覽圖`並通過local QA/QC；Phase 2依使用者2026-08-24確認，為料號工作台加入代表「料號本身」的預覽圖：預設只解析direct primary manufacturing Drawing，production ready優先，否則顯示latest open active RD ready；少數例外可上傳PNG／JPEG作為明確custom override。Gallery與drawer共用safe projection、media／panel與entity-neutral gallery能力，不複製Part元件。
  - 來源 ID：`DEV-PDM-WORKBENCH-PREVIEW-GALLERY-001`
  - 父任務：`DEV-087`；歷史關聯 `DEV-053`、`DEV-056`、`DEV-061`、`DEV-062`、`DEV-064`。
  - 下一步：本機Phase 1／2 RD已完成。若要升為雙provider QA PASS或啟用capability，先提供safe disposable `PDM_POSTGRES_SHADOW_URL`執行既有runner；其後production migration、flag activation、deploy與release仍另走gate。
  - 阻塞／恢復條件：Human／engineering／local implementation blocker皆為0；PostgreSQL provider acceptance因本機沒有safe shadow為`BLOCKED`，不是產品實作FAIL。不得用SQLite代替PostgreSQL parity，也不得連production補證據。
  - 證據：current `qc:dev-065:contract` 28/28、`qc:dev-065:part-preview` 30/30、authenticated `qc:dev-065:browser` 112 checks；A0005-P01四viewport=`ready / 研發預覽 / A0005-M01 / 0.1`。Part list 0/1/20/50 statements=2/7/7/7、detail=13、list transaction=1。DEV-087 contract/repository/commands/file-read=31/29/30/193，DEV-088 contract/repository/HTTP=40/29/15；typecheck、affected-file ESLint、先前isolated build 126/126與diff check PASS。PostgreSQL runner安全BLOCKED且productionWrites=false；詳細歸因見`.ai-doc/qc/qc-dev-065-part-preview-local-execution-2026-08-24.md`。
  - 計入交付：是（Phase 1 Drawing與Phase 2 Part本機RD產品切片）；PostgreSQL full-provider QA、capability activation與production release不計入。

  - Phase 1 Drawing問題與價值：新架構已在 exact row drawer提供3D／2D預覽，但清單沒有外形掃視模式；使用者須逐筆開drawer才能辨識外形。恢復gallery可降低大量圖號的辨識成本，又不犧牲清單的精確欄位比較。
  - Phase 1 Human Decision Brief：
    1. `HD-065-N1`：Phase 1只恢復 Drawing；Part當時不在已要求範圍。
    2. `HD-065-N2`：保留清單，預覽圖只作第二種瀏覽方式。
    3. 沿用既有確認：首訪list；有效`layout=list|preview`優先於Drawing自己的local preference；無效值安全回list。
  - Phase 1 Current Architecture Impact：existing canonical list read snapshot與drawer preview source已延伸為exact-row preview map與shared resolver；current UI已完成Drawing-only layout state/gallery/race-safe append。No schema/migration/new route/feature flag。
  - Phase 1 RD Implementation Contract：
    1. `CanonicalWorkbenchListDto.data.preview3dByRowKey`只在Drawing response出現，key set與visible rows完全相等；ready才有canonical file-read href。
    2. Repository在existing snapshot以2個constant statements讀exact revision sources及derivative/jobs；總Drawing list statements`<=12`，1/20/50與multi-RD delta=0。
    3. 新shared mapper固定3D source priority、hash/fake/job state；list與drawer不得分叉，也不得重新選global latest。
    4. UI storage key=`pdm-canonical-drawing-layout-v1`；valid URL > valid storage > list。Switch用replaceState、不refetch、不遺失selection/drawer；append map按rowKey merge，stale request不得覆蓋。
    5. 新canonical gallery只使用current row DTO；card唯一入口、lazy 4:3 contain、六種狀態、keyboard/a11y/RWD；Part/Relation不顯示switch。
    6. Bytes只走`/api/pdm/file-assets/{fileAssetId}`；old preview route/helper/flag/lane/token current caller=0。
  - Phase 1 Exact files／execution／acceptance：modify canonical contract/repository/service/workbench/globals及package；new`src/lib/pdm-canonical-preview.ts`、`src/components/canonical-pdm-preview-gallery.tsx`與current browser runner；Phase 1A mapper → 1B snapshot projection → 1C Drawing gallery → 1D QA/QC均已完成。詳細責任與證據見SPEC §0.10～0.13。
  - Phase 1 Spec Impact／release：`Intentional replacement + Compatible extension`；取代DEV-065舊Drawing wiring，相容延伸DEV-087 list/drawer/file-read。ADR=`Not required`，Migration=`Not required`；local完成不等於Release Ready。

  - Phase 2 Part RD Implementation Result：`Local RD Implemented / SQLite + Browser Passed / PostgreSQL Shadow Blocked / ADR Accepted`。
    1. 主物件是Part。無custom override時，只取該Part直接且唯一`primary_manufacturing` Drawing；production ready優先，否則取latest open active RD ready。多RD branch仍顯示一張，不要求人工指定；禁止root-min、reference Drawing、historical／terminal RD、2D或任意附件fallback。
    2. 有權限者可在Part drawer的`預覽圖來源`上傳PNG／JPEG作custom override；有效custom優先並標`自訂圖片`，auto依實際來源標`量產預覽`或`研發預覽`並帶drawing/revision。Custom只是辨識媒體，不是CAD／Drawing／approval authority。
    3. Custom無法讀時顯示`自訂圖片無法顯示`且不silent fallback；`恢復使用主要製造圖`必須是明確、可readback的command。Upload／replace／reset失敗保留原來源。
    4. Part gallery保留list parity、獨立`pdm-canonical-part-layout-v1` preference、卡片單一open-detail行動；formal/work/history同一canonical Part共用entity-level override。
    5. 唯一durable authority固定`part_preview_settings`：無row=初始auto；set／replace／reset後保留row與monotonic row version，reset清pointer但不刪row，避免ABA。Custom asset是同Part active `file_assets`、category=`part_preview_image`；setting才是active authority。
    6. API固定`POST /api/parts/[partNumber]/preview-image`與`.../reset`，要求expected row version＋Idempotency-Key，重用canonical receipt、append-only audit、same-company、`numbering.attachments.manage`與review lock。圖片限PNG／JPEG、<=10 MiB、decoded 64..8192，server驗MIME/extension/magic/decode並正規化orientation／metadata。
    7. Active custom遭generic附件soft-delete固定409 `PART_PREVIEW_ACTIVE_ASSET`；必須先reset／replace。Reset／replace不隱式刪舊asset，restore舊asset不重新指定；upload/storage/DB/audit失敗保留舊來源，response loss由receipt/readback判定。
    8. Drawing／Part list在Phase 2原子收斂為top-level `previewByRowKey`；Part list/detail共用唯一resolver與safe projection。Part preview固定增量<=4 statements、list/detail總上限<=14；SQLite／PostgreSQL runner在2C exit量測，超標不得改寬expected。
    9. 元件end-state固定「共用預覽能力、分離業務policy」：`CanonicalPreviewProjection`、protected`PreviewMedia`、single/tabs/grid`PreviewPanel`與entity-neutral gallery共用；Drawing保留thin adapter，Part只新增source-control mutation surface。
    10. Part drawer只保留一個主要`料號預覽`並與gallery吃同一projection；最小顯示source label與`查看主要製造圖`。禁止複製Part gallery/media、custom-as-Drawing-slot、`entityType`巨型元件、boolean soup與list/detail雙resolver。
  - Phase 2 Spec Impact：歷史Part root-min、current未限定primary的`representativeDrawingRevisionId`與Drawing-only`preview3dByRowKey`=`Intentional replacement`；Phase 1 Drawing gallery、DEV-087 Part identity/drawer、Part附件／file-read／audit／receipt=`Compatible extension`；Drawing exact source、Relation、CAD／approval／BOM／release=`No change`。`ADR-PDM-PART-PREVIEW-AUTHORITY-001`已Accepted；component composition另判`Not required`。
  - Phase 2 exact implementation：PostgreSQL forward=`046_part_preview_settings.sql`，SQLite同marker＋`ensureDev065PartPreviewSchema`；DB trigger守same-company/custom asset與active soft-delete。Direct dependency固定`sharp@0.35.3`，input/output均<=10 MiB、64..8192、single-page、auto-orient/metadata strip。Flag固定default-off`PDM_PART_PREVIEW_V1`並依賴既有gallery/unified Part flags；未實作暫名`PDM_PART_PREVIEW_OVERRIDE_V1`退役。
  - Phase 2 files/slices：exact add/modify/no-touch manifest見SPEC §0.16.15；估工2A～2D共5–7 RD days＋2–3 QA/QC days。既有dirty canonical/schema/package/attachment-command檔先保存targeted diff/hash，不得reset或誤歸因。
  - Phase 2 acceptance contract：`PPC-001..018`固定auto/custom、validation、reset/replace/delete/recovery、permission/identity、read/query parity、component/drawer/UX、security、regression與feature-off rollback；產品與三支runner均已實作。SQLite／browser與focused regressions已執行通過，PostgreSQL對應cases因缺safe shadow保持BLOCKED，故不宣稱full multi-provider QA PASS。
  - Stop Conditions：任何permission／CAD／approval authority擴張、既有附件挑圖／GC、共用command/storage helper需重寫、unsafe shadow／dirty same-hunk、production、stage/commit/merge/PR/deploy/release，仍須重新切scope或獨立gate。

- ◇ DEV-066 [交付點] [RD Implemented / Focused Contract QC 12/12 / Browser Smoke Blocked by auth] [P1] [Local Only / Production Release Gated] 三工作台頂部欄一致化與肌肉記憶
  - 摘要：把圖料、圖號、料號的頂部欄收斂為同一 shell：第一列搜尋與篩選器、footer 左側包含歷史、footer 右側顯示模式、結果面板底部分頁。
  - 來源 ID：`SPEC-UX-PDM-WORKBENCH-TOPBAR-001`
  - 父任務：`DEV-062`、`DEV-065`。
  - 權威文件：`.ai-doc/specs/SPEC-UX-PDM-WORKBENCH-TOPBAR-001-unified-toolbar-muscle-memory.md`；QA `.ai-doc/qa/qa-dev-066-workbench-topbar-muscle-memory-validation-plan-2026-08-11.md`。
  - Human Decision Brief：保留各模組既有模式（圖料 `關係樹／矩陣`；圖號／料號 `清單／預覽圖`），只改共同位置與視覺語法；不新增不適用的 help，不改資料與流程 authority。
  - Current Architecture Impact：沿用既有 `drawing-workbench-filter-grid`、`pdm-relation-view-switch` 與 `PdmWorkbenchLayoutSwitch`；新增 shared pagination component 與 toolbar footer class，domain controller、URL、API、preview resolver 不變。
  - RD Contract：`relation-workbench.tsx`、`drawing-workbench.tsx`、`part-workbench.tsx` 必須輸出相同 toolbar DOM 順序；`PdmWorkbenchPagination` 提供相同 nav/label/按鈕順序；desktop/tablet/mobile 依 SPEC 第 3 節排版。
  - Acceptance：`TB-001`～`TB-012` 全部 evidence；三 route filter/footer/pagination 位置一致、mode 行為不回歸、無 overflow/overlap/crop、keyboard/a11y 通過；focused contract command：`node scripts/qc-dev-066-workbench-topbar.mjs`；browser 無法登入時保留 BLOCKED 證據。
  - Stop Conditions：觸及 API/schema/permission/status/preview authority、引入新模式、改動資料排序、staging/production/deploy/release 或無法保留既有功能時停止並回 PM。
  - 下一步：補 managed bootstrap user 或可用 disposable demo auth 後，依 QA plan 完成四 viewport、keyboard/a11y 與 route interaction evidence；未完成 real-browser 不標記 ✓。
  - 計入交付：是（三模組全部完成且 QA/QC 無 open P0/P1 UI regression 才可結案）。

- ✓ DEV-067 [交付點] [RD Implementation Ready / Human Confirmed] [P0] [Local RD Implemented / Contract + Query + Lock + Build + Authenticated Browser Matrix Passed / Production Release Gated] PDM 統一實體明細投影、審核全景與送審鎖定
  - 摘要：以一個 `UnifiedPdmEntityDetailDrawer` composer 承接 Drawing、Part、Relation 三域及其 candidate/formal/history 狀態。三域共用識別標頭、固定投影槽位、overlay/scroll/focus/return 規則與單一 context action bar；domain projection 繼續由各 owner 擁有。圖號／料號 surface 只取工作所需內容，圖料 surface 是關係全景，review surface 是 exact assigned request scope 內的完整全景。
  - 來源 ID：`DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001`
  - 父任務：`DEV-039`；關聯：`DEV-001`、`DEV-052`、`DEV-053`、`DEV-056`、`DEV-057`、`DEV-062`、`DEV-064`、`DEV-066`。
  - 文件成熟度：`RD Implementation Ready / Human Confirmed`；本機 Phase 1A～1D 已實作，DEV-067 local QA/QC 已通過。production/staging、schema/migration、資料修復、stage/commit/merge/PR/deploy/release仍受 gate 管制。
  - 權威文件：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`（DEV-067 RD Implementation Contract）、`.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`、QA `.ai-doc/qa/qa-dev-067-unified-pdm-entity-detail-validation-plan-2026-08-12.md`、`.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`（single Drawing/state authority）、`.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`（2026-08-12 Phase 1C-D amendment）、`.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`（DEV-067 lock/navigation amendment）、`.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`（relation superset amendment）、`.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`（composer/core boundary amendment）。
  - ADR 判定：`ADR accepted`。跨三 domain 的 composition ownership、server projection policy、review-scope read capability與snapshot evidence邊界屬長期跨模組契約；選擇「shared composer + domain-owned projections + server-derived policy」，拒絕巨型條件元件與三套獨立 drawer。

  - Human Decision Brief：
    1. `/approvals` 是唯一 reviewer inbox，只負責總表、篩選、待辦數與來源 context，不擁有圖號／料號／圖料關係明細 body。
    2. 圖號前往 `/numbering/drawings`、料號前往 `/parts`、圖料關係前往 `/numbering/search`，並由 server-authorized owner href 開啟該模組 canonical detail；browser 不可自行猜 target route。
    3. Drawing、Part、Relation 的 candidate/formal/review/history 都 mount 同一 `UnifiedPdmEntityDetailDrawer`。固定 slot 相對順序是 `DrawingProjection -> PartProjection -> RelationProjection -> ReviewContextProjection`；未授權或不適用 slot 不 hydrate、不留空卡。
    4. `UnifiedPdmEntityDetailDrawer` 只負責 shared identity/status header、projection composition、drawer geometry/scroll/focus/return 與一個 context action bar。不得在這個元件內建立 Drawing／Part／Relation 的巨型 status/role 條件樹。
    5. `DrawingProjection`、`PartProjection`、`RelationProjection` 由各 domain 擁有，使用同一 owner data/preview authority；projection 只能接收 server-normalized model、capability、disabled reason 與 command reference，不得自行另取第二份 object truth或跨 domain mutation。
    6. 送審成功即鎖定同一份 owner data。active review 期間，受審欄位、關係、版次內容與 scope 內附件的新增／刪除／替換都由 server 拒絕；需變更時走撤回／退回後修改再重送。
    7. `ApprovalSnapshotProjection` 只能位於 `ReviewContextProjection` 內，顯示送審範圍、target IDs、hash/diff/check結果與決策脈絡；不可重畫 Drawing／Part／Relation 欄位、檔案或關係，也不可成為第二份 visible detail authority。snapshot drift 時 fail closed，不以 snapshot body 替代 owner data。
    8. 最新決策有意取代先前「reviewer body 與 submitter body 完全相同」的嚴格敘述：元件與 owner data仍相同，但 reviewer在 exact assigned request/company scope 內可見 full Drawing／Part／Relation projections與decision controls；這不是全域權限繞過，terminal、未指派或跨公司 context不得取得此全景。
    9. 導覽遵守「哪裡來，哪裡去」：owner href 使用 validated same-origin `returnTo`，關閉、Back 或決策完成後回到原 `/approvals` filter/query/selection 並刷新該列。

  - 使用者確認並經架構批判後收斂的 canonical component tree：

    ```text
    UnifiedPdmEntityDetailDrawer
    ├─ SharedIdentityStatusHeader
    ├─ ProjectionComposer（固定相對順序）
    │  ├─ DrawingProjection
    │  ├─ PartProjection
    │  ├─ RelationProjection
    │  └─ ReviewContextProjection
    │     └─ ApprovalSnapshotProjection（scope/hash/diff evidence only）
    └─ ContextActionBar（唯一 primary action owner）
    ```

  - Context visibility policy（由 server 決定 `none / summary / full`，禁止先 fetch all 再由 client CSS 隱藏）：

    | Surface/context | DrawingProjection | PartProjection | RelationProjection | ReviewContextProjection |
    |---|---|---|---|---|
    | `/numbering/drawings` 一般圖號 | `full`，含統一3D/2D、附件/版次、readiness | `summary`，僅關聯料號識別/摘要 | `summary`，關係與追溯 | `none` |
    | `/parts` 一般料號 | `summary`，可含代表圖識別/preview摘要，但不得回圖面檔案/版次細節 | `full`，含料號屬性與允許文件 | `summary`，關聯圖號與追溯 | `none` |
    | `/numbering/search` 圖料 | `full` | `full` | `full` | `none` |
    | assigned active review | exact request scope內 `full` | exact request scope內 `full` | exact request scope內 `full` | `full`，含evidence與decision context |

    `full` 表示資訊可達，不等於所有章節預設展開；review先展開決策必要內容，次要細節可收合並提供章節錨點，避免超長抽屜造成判讀負擔。

  - 問題與差距：
    - 目前 active workbench 已共用 `DrawingWorkspaceDrawer` 與 `DrawingDetailContent` 外殼，但仍不是完整單一明細模組。Candidate 內容由 `NumberingCandidateRevisionEditor`、`CandidateDrawingPreview`、`WorkspaceRelationsDetails` 組合；formal 內容由 `MasterAttachmentPanel`、`DrawingSubmissionPrerequisitePanel`、`SameRootPartPanel` 組合。
    - Preview 行為目前確實分叉：candidate 以「檔案存在」直接投影 `ready`；formal 才使用 `MasterAttachmentPanel` 的 derivative queue/running/ready/failed 與 polling。共用同一 `DrawingDetailPreview` 卡片外觀，仍不能保證自動預覽與狀態真相一致。
    - Feature flag 關閉時，`src/app/numbering/drawings/page.tsx` 仍 mount 另一個 `DrawingDetailDrawer`；這是第三條 visible composition，不能算已完成單一模組。
    - 現況把審核者明細與送審者 owner detail 分成不同 composition／preview path，即使資料指向同一物件，也會發生區塊、附件、自動預覽與狀態更新不一致。
    - Part目前candidate走`WorkspaceDrawer`、formal直接組`PdmEntityDetailDrawer + PartDetailContent`；Relation則由root/candidate/child target與custom renderer組不同body。Drawing統一後若不處理這兩域，跨工作台肌肉記憶仍不成立。
    - 現況沒有跨域`ProjectionModel`、server-side visibility policy或review-scope full-read capability；若前端把全資料抓回來再隱藏，會造成越權與資料外洩風險。
    - `ApprovalSnapshotProjection`名稱容易讓RD把snapshot誤作可見明細來源；必須受`ReviewContextProjection`約束，只投影完整性證據。
    - 多target request若沒有canonical review aggregate，full projections會變成長清單且難以確認決策範圍；需先定義scope導覽、target anchor與單一decision boundary。
    - 「看起來相似」無法保證長期一致；每次 owner UI 修正若需同步 approval copy，就會再次漂移。
    - 既有靜態 QC 驗證了共用 component 名稱與 section skeleton，但沒有證明 candidate/formal/reviewer 使用同一 preview orchestration、同一 section adapter 或真實瀏覽器行為；因此「已共用 shell」不能宣告為本 DEV 的完整 PASS。
    - 根因不是 CSS，而是 component ownership、section adapter 與 visible read authority 分叉。此 DEV 的完成條件是刪除 covered flow 的分叉，不是再做一次視覺對版。

  - 初始範圍：
    - 建立 canonical `UnifiedPdmEntityDetailDrawer`、`ProjectionComposer`、projection registry與`DetailSurfacePolicy`；既有`PdmEntityDetailDrawer`／`DrawingWorkspaceDrawer`／`WorkspaceDrawer`只可作遷移期shell或compatibility wrapper，不得再公開獨立組body的權限。
    - 將既有Drawing六區契約收進`DrawingProjection`；建立`PartProjection`與`RelationProjection`，candidate/formal/history adapter只提供server-normalized model、capability與commands。
    - Drawing／Part／Relation 全狀態在同一 composer原地轉態；狀態變化refresh同一stable entity key與drawer instance，不關閉再換另一個drawer。
    - 建立server-derived `none / summary / full` visibility contract；API只回允許projection與允許欄位，client不得以role label自行展開full view。
    - 建立assigned active review的scoped read capability與`ReviewContextProjection`；無法取得完整必要projection時整筆審核不可決策並顯示復原責任，不得靜默隱藏。
    - active-review server lock、capability projection與明確錯誤／復原。
    - automatic preview parity、reviewer decision slot、safe returnTo 與來源清單狀態復原。
    - action adapter/server resolver 必須回 canonical owner href；multi-target request 優先回送審者使用的 owner aggregate，不得以第一個 target 猜測。

  - 不在本階段：
    - BOM、submission、supplement 或其他 domain 的projection adoption；後續仍必須遵循相同 owner-surface rule，不可直接塞入composer條件樹。
    - 重寫 approval request/decision/audit 核心、刪除既有歷史 snapshot、改 schema/migration、production data repair 或 release。
    - 把 candidate editor 與 controlled-file mutation authority合併成同一 command、放寬受控版不可變性、建立 approval-only preview、把 reviewer inbox 搬進 owner module，或把projection共用誤作domain write authority合併。

  - Current Phase RD Handoff Contract：
    - Phase 1A：建立`pdm-entity-detail-contract/policy/service/repository`與`GET /api/pdm/entity-details/[entityKey]`；四種typed key、summary/full allowlist、one-snapshot與Drawing/Part/Relation/review hard budget分別`16/16/24/28` queries，1/20/50 children/targets不得成長。
    - Phase 1B：建立`UnifiedPdmEntityDetailDrawer`與Drawing/Part/Relation/Review projections；既有shell只保留primitive/compatibility，enabled path只mount一個composer；preview固定`queued/running/ready/delayed/failed/unavailable/missing`與2.5秒single-flight refresh。
    - Phase 1C：建立request-specific review receipt、exact owner href registry、ambiguous aggregate fail-closed、owner media scoped read、single action bar、same-transaction active-review lock與validated `/approvals` return state；`/approvals` enabled path刪除approval-only body/preview/raw snapshot JSON。
    - Phase 1D：完成legacy enabled-path retirement、四viewport/keyboard/a11y、failure/race/concurrency、focused regression與isolated build；flag `PDM_UNIFIED_ENTITY_DETAIL_V1` default off且依賴Drawing與Part/Relation workbench flags。
    - No migration：沿用既有approval request/target/workflow/reviewer與workbench snapshot/index；若需要new table、RLS/global permission或data rewrite，立即停止回PM。

  - Exact implementation files：
    - 新增：`src/lib/pdm-entity-detail-contract.ts`、`pdm-entity-detail-policy.ts`、`pdm-entity-detail.ts`、`pdm-review-scope.ts`、`pdm-review-lock.ts`、`src/lib/repositories/pdm-entity-detail-async-repository.ts`、unified API route、`unified-pdm-entity-detail-drawer.tsx`及四個domain/review projection components、DEV-067 QC scripts。
    - 修改：Drawing/Part/Relation workbench services/repositories/controllers/pages、現有drawer/detail/preview/master-attachment components、approval inbox/request/decision/legacy href、scoped media routes、所有受審field/file/relation mutation transaction、feature status、CSS、`.env.example`與`package.json`。
    - 完整逐檔與command-family integration point以主SPEC第11節為準；RD每phase記錄actual modified files並保留既有dirty worktree。

  - QA/QC Gate：
    - `UDD-001`～`UDD-012`：type/policy/payload/one-snapshot/query/failure/race/zero-write。
    - `UDD-013`～`UDD-024`：single composer/domain projection/preview/state/action/flag-on recovery。
    - `UDD-025`～`UDD-039`：owner resolver、exact reviewer、negative scope、drift、ambiguous aggregate、direct write bypass、concurrency、decision/retry與return-state。
    - `UDD-040`～`UDD-050`：1440×900、1024×768、768×1024、390×844、scroll/focus/Escape/a11y/5-second identity/Visible Text Noise/console-network/regression/build。
    - Evidence root：`output/qc-dev-067-unified-pdm-entity-detail/{run-id}/`；只有server/DB/network/browser四類證據完整且零open P0/P1才可由QA交QC。

  - 驗收方向：
    1. Drawing、Part、Relation所有stage/context只mount一個`UnifiedPdmEntityDetailDrawer`；DOM不得共存candidate/formal/reviewer專屬drawer body，composer本身不得含domain status/role巨型條件樹。
    2. 同一 canonical entity在狀態轉移後drawer不被替換，stable entity key、選取列與scroll owner保持；只更新projection model、visibility、capability與action bar。
    3. DrawingProjection在Drawing、Relation與review context使用同一preview state resolver與automatic polling；queued/running/ready/delayed/failed/unavailable/missing的圖像、文案與retry一致，不以「檔案存在」假裝ready。
    4. 各projection只有一個domain-owned component；candidate edit、controlled read、relation mutation與review decision command仍由各自authority驗證，composer不得代理跨域mutation。
    5. server response依surface/context只hydrate允許的`none/summary/full`projection與欄位；Drawing一般view不見Part細節，Part一般view不取得Drawing files/revisions，Relation為full aggregate。
    6. exact assigned active reviewer取得request/company scope內full Drawing/Part/Relation與ReviewContext；未指派、terminal、cross-company或tampered context不得升權。缺任一決策必要projection時decision fail closed。
    7. active-review 核心欄位、關係、版次與 scope 內附件 write API 全部 fail closed；僅 disabled UI 不算通過。
    8. approver permission、company scope、self-approval、decision idempotency與 reason policy仍由 server 驗證；native owner route 不繞過 approval authority。
    9. close、browser Back、approve、return、reject 與 401/403/404/stale target 都有安全回程；正常路徑保留原 `/approvals` filters、query、selected request與更新後 row。
    10. 1440×900、1024×768、768×1024、390×844 下，單一 drawer scroll owner、sticky/action footer與 nested confirmation無重疊、裁切、雙 scrollbar、focus/Escape衝突或水平溢位；所有 loading/blocked/error/terminal 狀態先回答下一步且無 visible runtime error。

  - Spec Impact Preflight：`Intentional replacement`。有意取代 Phase 1C-C「actual decision workflow deep-link 回 `/approvals`」、舊 number-state「decision只在`/approvals` UI」、DEV-067前版「Drawing-only consolidation」與「reviewer/submitter章節完全相同」；保留單一 reviewer inbox、domain data/command authority、server permission、separation of duties、decision authority、snapshot integrity與atomic publication。
  - 風險：`P0 / High implementation risk`。最大風險是巨型條件元件、前端hide造成資料外洩、reviewer scope升權、projection各自fetch造成snapshot不一致/N+1、multi-target沒有單一decision boundary、snapshot重新成為第二真相、多个projection各自產生primary CTA、active review仍可由其他API修改、returnTo open redirect，以及preview polling分叉。
  - Stop / Re-entry：若必須新增或放寬global reviewer permission、建立跨域data owner、從snapshot重建visible object detail、無法以server policy阻止非授權projection資料回傳、無canonical multi-target review aggregate、放寬active-review lock，或觸及schema/RLS/production/staging/data repair/deploy/release，停止並回Dev PM；不另開平行DEV。
  - 實作證據：`npm run qc:dev-067:query` 通過（candidate/formal-drawing/part/relation 11/13/10/6，加入20個子項後無成長）；`npm run qc:dev-067:lock` 通過（canonical/workspace lock order、active-review write rejection）；`npm run qc:dev-067:postgres` 通過（disposable PostgreSQL row-lock blocking、canonical-order no-deadlock、active-review write rejection）；`npm run qc:dev-067` aggregate 的 contract/policy/query/UI/preview/review/lock/postgres/navigation/browser 全部通過；`npm run build:isolated` 通過（125/125 routes）；`git diff --check` 通過。
  - 已補安全修正：review request scope 的 inactive／not-assigned／ambiguous aggregate 轉為明確 409/403；legacy approval 不產生未經 native receipt 驗證的 owner deep-link，維持 legacy detail fallback；drawing lifecycle 僅接受 exact workflow reviewer，candidate review 保留既有角色 authority。
  - 驗證結論：authenticated browser matrix 已以一次性本機 fixture actor 完成四 viewport、Drawing／Part／Relation 三入口、review owner route、flag on/off、focus/keyboard、close/Escape/returnTo、a11y/overflow 與 console/network/5xx sweep；disposable PostgreSQL semantic/concurrency 亦已通過。DEV-067 local QA/QC 可結案；production/staging、migration、deploy、release仍受 gate 管制。
  - 下一步：若要進入 production release，另依 release gate 進行環境、資料、migration、部署與正式 smoke；不在本 DEV-067 local implementation scope 內直接執行。
  - 計入交付：是；三工作台與審核情境的單一composer、domain projection ownership、server visibility、review-scope full view、lock、preview、decision與returnTo全部通過才計入。

- ✓ DEV-068 [交付點] [RD/QC Local Passed / Evidence Reconciled] [P1] [本輪完成 / Production Release Gated] 圖面／CAD 全項辨識與人工確認入庫
  - 摘要：以 OCR、圖面文字與可用 CAD metadata 建立非白名單候選層，並在同一審核頁分區呈現識別關聯、料號基準與變體、圖面控制、特殊要求、局部工程資訊及尚未歸類原文；材料、製程與外觀統一視為料號屬性候選，單圖多料號時以共用基準加逐料號差異審核，再由人類確認後寫入正式 PDM。3D 屬性不完整不得使圖面上傳或管理失敗。
  - 來源 ID：`DEV-PDM-DRAWING-ATTRIBUTE-RECOGNITION-001`
  - 父任務：無；關聯 `DEV-017`、`DEV-023`、`DEV-035`、`DEV-056`、`DEV-061`、`DEV-064`、`DEV-067`。
  - 權威文件：`.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md`；QA `.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md`；fixture `.ai-doc/qa/fixtures/dev-068-a0005-fixture-manifest.md`。
  - 實作結果：14 張 additive candidate/formal/evidence tables、SQLite local apply、PostgreSQL 033、recognition repository/service、user/worker routes、同頁六區 UI、三權限、default-off flag、versioned external JSON adapter、platform receipt/outbox 原子正式化與 A0005 pilot 均已落地。另將辨識入口前移至現有進版頁附件區，新增 `drawing_number` source context 與目前勾選檔案指紋；送審前只建立候選工作，不建立正式版次或寫入 PDM。未知 OCR 欄位可建立 governed stable key；缺值不清除、N/A 需理由。
  - 驗證結果：2026-08-20 `OCR-082-001..038` 已由 fresh contract／repository／真實 Chromium／regression／completion gate 全數 PASS；A0002 跨來源版次語意、normalized geometry、證據優先序、truthful fallback、identity-only formalization與單一 preview surface均已納入驗證。
  - 下一步：維持 Production Release Gated；待 production representative gold set、實際裝置／網路 P95、正式檔案存取與 release smoke gate。
  - 阻塞／恢復條件：本機修復無人類決策 blocker，可直接執行；禁止改寫 append-only 舊 observation，應以相容投影與 successor rerun 處理。Production representative gold set、production migration/deploy/release仍各自 gated。
  - 計入交付：是。

  - 文件成熟度：`RD/QC Local Passed / Evidence Reconciled / Production Release Gated`。SPEC §0.12 與 QA §9 已固定本次實作、失敗恢復與證據邊界，P0／P1 readiness gap=0。

  - 問題：
    - 目前若把材料、表面處理、顏色等資料只視為 3D custom property，使用者必須先把每個模型／configuration 定義得非常完整；圖面文字、圖框或料號變體因此容易漏入 PDM。
    - 同一主根號可能共用部分屬性，但不同料號具有例外；單一固定欄位或單一 3D 值無法表達「共用＋差異」，也容易讓後寫入值覆蓋前一變體。
    - OCR／CAD 解析皆可能讀錯、漏讀或彼此衝突；若辨識結果直接成為正式資料，錯誤會進入主資料與後續送審。

  - 使用者價值：
    - 上傳者先完成檔案交付，不必因 3D 屬性不齊全而中斷流程。
    - 系統先代做找字、抄值、比對與分組；人類把時間集中在例外、衝突與語意判斷。
    - 未知欄位與新供應商／新圖框寫法不會被丟棄，仍可在尚未歸類區修正、映射或保留。
    - 每一個正式值可回看來源檔、來源位置、原始文字與人工修正，避免只剩一個無法解釋的 OCR 結果。

  - 主要流程：

    ```text
    上傳 3D／2D／PDF／影像
      → 擷取可用 CAD 屬性、圖框／註記、檔名與 OCR 文字
      → 建立辨識候選資料（原文、來源、位置、信心與關聯對象）
      → 分流
         ├─ 共用料號基準：同圖多個料號共同適用的料號屬性
         ├─ 各料號變體：依料號或 configuration 顯示新增、變更或不適用
         └─ 尚未歸類：對象、欄名或值仍不確定
      → 人工逐項接受、修正、改掛對象、映射欄位或忽略
      → 開啟寫入前影響確認，只列實際異動、衝突與不寫入項目
      → 人工點選「正式寫入 PDM」後才異動正式資料，並保留辨識與修正證據
    ```

  - Human Decision Brief：
    1. 3D custom property 是可用來源之一，不是上傳必要條件，也不是無條件最高權威。
    2. OCR／圖面文字／CAD metadata／檔名先進候選層；任何來源都不得在沒有人工確認時直接覆寫已核准資料。
    3. OCR 是辨識來源，不是獨立資料類別。所有辨識結果固定放在同一個 `圖面辨識審核` 分頁，依 `識別與關聯／料號基準與變體／圖面與版次控制／特殊要求與註記／局部工程資訊／OCR 原文與尚未歸類` 分區連續呈現；區段導覽只能定位，不得以頁籤切換隱藏其他辨識結果。尚未判定的資料不可被靜默捨棄。
    4. 同根料號的共用事實只在基準層顯示一次；各料號只顯示差異或例外，避免同一材料／處理文字重複堆疊。
    5. A0005 是第一個端到端 pilot；P01／P02／P03 等變體必須能各別辨識與人工修正。
    6. 原「物料屬性」與「製程與外觀」合併為 `料號屬性候選`；材料、材質牌號、材料規範、原料型態、厚度、表面處理、電鍍、塗裝、顏色、熱處理、硬度與整體粗糙度都進入同一料號屬性基準／變體判斷。
    7. 單張圖只有一個料號時，辨識到的料號屬性直接形成該料號基準候選；單張圖有多個料號時，先建立共同基準，再只記錄各料號相對基準的差異。
    8. 變體差異只分為 `相同／變更／新增／明確不適用`。未辨識到值不等於取消基準值；只有圖面明確出現 `無／取消／N/A／不適用` 等證據，才可提出移除或不適用候選。
    9. 同一詞彙須依適用範圍判斷：例如圖框或一般註記的整體粗糙度可進料號屬性；附著於特定加工面的局部粗糙度仍是局部工程資訊，不得覆蓋料號基準。
    10. 正式 PDM 權威仍是每個料號經人工確認後的完整有效屬性；`共用基準＋料號變體` 是辨識、比較與審核模型，不另形成與料號主資料競爭的正式權威。
    11. 因一次操作可能同時異動多個料號、圖面版本與受控註記，正式寫入前保留一個輕量影響確認 gate；它不是獨立預覽頁或另一套審核功能，也不得重複展示整張辨識審核表。
    12. 審核頁主動作固定為 `確認寫入內容`。點擊後開啟確認視窗，只顯示寫入對象與數量、實際新增／變更／覆寫、既有正式值衝突，以及不會寫入的待分類項目；完全繼承、無差異或未異動資料不重複列出。
    13. 寫入確認視窗的次要動作固定為 `返回核對`，主要動作固定為 `正式寫入 PDM`；只有使用者點擊後者才可異動正式資料。

  - 辨識分類表（2026-08-12 Human Confirmed）：

    分類依資料用途決定；OCR、CAD metadata、2D 原生資料、檔名與既有 PDM 值均屬來源標記，可同時出現在各分類，不另拆成互斥分頁。

    | 辨識類別 | 內容範例 | 建議用途 |
    |---|---|---|
    | 識別與關聯 | 主根號、圖號、料號、版次、configuration、sheet、表格列對應料號 | 建立圖面、料號與變體之間的關聯，先回答候選資料屬於誰 |
    | 料號屬性候選 | 材料、材質牌號、材料規範、原料型態、厚度、表面處理、電鍍、塗裝、顏色、熱處理、硬度、整體粗糙度 | 寫入料號屬性候選；單圖多料號時先建立共用基準，再辨識各料號差異 |
    | 圖面／版次控制 | 圖號、版次、單位、比例、投影法、製圖／審核日期 | 寫入圖面或版次資料，不屬於料號屬性 |
    | 特殊要求與註記 | 去毛邊、焊接、檢驗、包裝、品質或法規要求 | 能標準化者可轉為料號屬性候選；無法標準化者保留為受控註記 |
    | 局部工程資訊 | 尺寸、公差、GD&T、局部粗糙度、焊接符號、表面符號 | 保留辨識位置與證據，第一版不直接寫入料號基準 |

  - 多料號基準與變體判斷：

    ```text
    料號有效屬性 = 共用料號基準 + 該料號差異

    相同：與基準一致，不重複顯示
    變更：同一屬性有不同值
    新增：基準沒有，但特定料號有明確值
    明確不適用：圖面有無／取消／N/A／不適用等直接證據
    未辨識：預設繼承或待確認，不得推定為移除
    ```

  - 初步範圍：
    - 接收上傳檔案的可辨識內容並建立候選，不因 3D 屬性缺漏拒絕 upload。
    - 保留辨識原文、來源類型、來源檔／頁面／區域、信心、推定欄名、推定值與推定歸屬，具體儲存模型留到 RD Contract。
    - 支援單一審核分頁內的識別與關聯、共用料號基準、逐料號變體、圖面控制、特殊要求、局部工程資訊及 OCR 原文／尚未歸類分區；材料與製程／外觀使用同一料號屬性集合，使用者可在同一畫面完成全部確認。
    - 單圖多料號時計算各料號相對基準的相同、變更、新增與明確不適用；未辨識值不得自動視為取消。
    - 同一值若被多來源辨識，可合併顯示來源；值不同時必須顯示衝突，不用來源優先序靜默吃掉其中一方。
    - 人工可接受、修正欄名／值、移到另一料號、改列基準、映射既有欄位、建立自訂欄位或忽略，所有變更保留操作者與時間。
    - 正式寫入前提供輕量影響確認，只列實際異動、衝突、寫入範圍及排除項目；寫入後仍可由正式值回查候選與來源證據。

  - 初步 UX 意圖：
    - 主工作面採可掃描、比較與批次審核的表格／矩陣，不為每個候選建立大型卡片。
    - 所有辨識結果位於同一分頁並依用途分區；頂端可提供區段跳轉，但不得用互斥頁籤讓使用者逐頁尋找漏項。OCR 原文與尚未歸類保留在同頁最末區，確保一次審核可看見完整範圍。
    - 共用料號基準位於父層並只顯示一次；料號列只顯示新增、變更與明確不適用。正常高信心且無衝突資料保持低干擾，衝突、尚未歸類與低信心資料提高視覺權重。
    - 來源證據、OCR 框選位置與完整辨識歷史放在 side panel／drawer，使用者不離開清單上下文即可核對 2D 圖面。
    - 顏色不得是唯一訊號；候選、已修正、衝突、待確認與忽略均需短標籤／圖示及可發現的恢復操作。
    - 寫入前確認視窗是外部正式寫入的最後安全 gate，不是第二次完整審核；資訊必須通過紅筆刪除測試，只保留會改變寫入判斷或風險認知的內容。

  - 初步 out of scope：
    - 不自動修改 SolidWorks 3D／2D 原檔或回寫 custom property。
    - 不讓 OCR／AI 自動核准、發布、改版或覆寫既有受控主資料。
    - 不建立獨立「預覽正式化」頁面、額外預覽功能或重複整張審核表的確認視窗。
    - 本 Contract 不選定 OCR 模型、Document Manager／SolidWorks license 或付費供應商；logical API 與資料語意已固定，physical table/index/migration、exact route/file placement 留給 RD Implementation Readiness Assessment。
    - 不在第一版自動把歷史所有圖檔批次回填；歷史導入需另有範圍、成本、dry-run 與 release/data gate。

  - 驗收方向：
    1. 以 A0005 完整 3D＋2D 上傳後，系統能建立候選資料，且 3D 屬性不完整、缺值或與圖面不同時仍可繼續人工審核。
    2. 材料、表面處理、顏色、熱處理、硬度與整體粗糙度使用同一料號屬性分類；共用值進基準層，P01／P02／P03 只顯示各自差異且不互相覆蓋。
    3. 無法判定欄名、值或料號歸屬的文字進入尚未歸類；使用者可映射、建立自訂欄位、改掛或忽略，原文不遺失。
    4. CAD、圖面 OCR 與人工既有值衝突時，介面同時顯示各來源與正式值；未確認前正式 PDM 零寫入。
    5. 人工確認後，正式資料、變體歸屬與來源／修正證據可追溯；重跑辨識不得無提示覆寫人工確認結果。
    6. 缺少某個變體值時不得推定取消基準；只有明確 `無／取消／N/A／不適用` 可建立不適用候選。
    7. 整體粗糙度可進料號基準，特定加工面的局部粗糙度只保留為局部工程證據，不得互相覆蓋。
    8. 至少驗證正常、高低信心、來源衝突、未知欄位、錯掛料號、重複候選與 OCR 失敗等情境。
    9. 使用者不切換分頁即可依序核對全部辨識分類、OCR 原文與尚未歸類資料；區段跳轉後其他分區仍保留在同一審核頁。
    10. 點擊 `確認寫入內容` 後，確認視窗只列寫入對象／數量、實際新增／變更／覆寫、既有值衝突與不寫入項目；完全繼承、無差異或未異動資料不得重複出現。返回核對不產生正式寫入，只有點擊 `正式寫入 PDM` 才可異動正式資料。

  - 限制與主要風險：
    - OCR 信心不是資料正確性的證明；低信心只是提高人工優先級，高信心也不能繞過衝突檢查。
    - 「非限制欄位」若直接進正式層，容易產生材料／材質、表處／表面處理等同義欄位膨脹；第一版必須保留自訂能力，同時讓人工能映射既有欄位。
    - 變體與料號／configuration 關聯不明時必須 fail open to review（保留候選並要求分類），不得猜測後直接正式化。
    - 詞彙本身不能決定資料層級；整體／局部適用範圍不明時必須進待確認，避免局部工程要求錯寫成整個料號基準。
    - 辨識工作不得改變受控檔、版次、附件與 master-data authority；production 檔案、外部成本與大規模歷史回填維持 gate。

  - RD Contract 固定邊界：
    - 第一版以「單次上傳後的人工作業工作區」為主，不先做全歷史批次 OCR。
    - 尚未歸類資料的預設處理是保留待審；使用者明確忽略後才不進正式資料，但證據仍保留。
    - 重複出現且被人工確認的自訂欄名，未來可提議升格為公司欄位字典；第一版不自動學習或自動升格。
    - `非限制欄位` 固定解讀為候選欄名開放、可人工建立 company-scoped stable field key；不得動態新增 DB column 或把無治理 JSON 當正式主資料。
    - 辨識 session 綁定 canonical file asset ID 與內容 fingerprint；重跑建立 successor，不覆寫舊 session、人類決策或 formalization event。
    - 寫入影響計算為 zero-write server operation；正式化必須用 target fingerprint、optimistic concurrency、idempotency key 與單一 transaction，任一 target 失敗即全部 rollback。
    - 頁面讀取、run、review 與 formalize 維持 company scope；Current Phase 新增獨立 semantic action permissions，正式寫入不得只靠 `draft.update` 或 `attachments.manage`。

  - Future Phase Capsule：可在 A0005 pilot 與第一版人工流程穩定後，評估欄位別名建議、圖框模板、重複修正學習、批次歷史辨識與 native CAD metadata adapter。重新進入條件是人工修正資料量足以衡量誤辨率、漏辨率與審核時間，且使用者明確要求自動化升級。

- ✓ DEV-082 [開發點] [RD Implemented / Local QA-QC Complete / OCR-082-001..044 PASS] [P1] [Local Only / Production Release Gated] PDF OCR 跨來源版次整合、證據定位與高解析放大鏡
  - 摘要：補齊 `DEV-068` 尚未真正讀取 PDF 內容的缺口。PDF 在瀏覽器先用 PDF.js 文字層抽取；低於門檻的掃描頁才用 Tesseract.js WebAssembly `chi_tra+eng`。不要求使用者安裝軟體、輸入 OCR API key，也不建立開發團隊維護的 OCR server；文件 bytes 不送第三方。
  - 來源 ID：`DEV-PDM-PDF-BROWSER-OCR-001`
  - 父任務：`DEV-068`；關聯 `DEV-035`、`DEV-061`、`DEV-079`。
  - 權威文件：沿用 `.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md`；§0.12 保留跨來源／定位基線，§0.13 為現行放大鏡 Current Phase authority。QA 為 `.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md` §9。不得另建平行 OCR candidate/formalization SPEC。
  - Spec Impact Preflight：`Intentional replacement + compatible extension`。取代 `external-json-ocr.v1`、worker env/provider command 與「真實 OCR 僅是未定 release gate」方向；相容擴充既有 source plan、adapter result、observation、candidate、人工核對、impact 與 atomic formalization。ADR 不需要，因 canonical data owner、DB model、deployment topology與正式寫入 authority 未改變。
  - 檔案矩陣：PDF=`filename.v1 + browser-pdf-ocr.v1`；SolidWorks=`filename.v1 + native-metadata-bridge.v1`；JPG／JPEG／PNG／DWG／other=`filename.v1`。只有 PDF 辨識內容，client 不得自行擴大來源。
  - 必要辨識 Tier 0：`drawing_number`、`revision`、`part_number`、`title`、`material`、`scale`、`drawn_by`。每欄必須有 found／conflict／not_found 結果；每欄最多保留五個 distinct normalized values，超限視為 partial/conflict 並阻擋該欄正式化，缺值不得虛構或清空正式資料。
  - 效用容量：先保留 Tier 0，再以 `tierWeight + businessWeight + labelMatchQuality + confidence + titleBlock/table bonus + corroboration - duplicatePenalty - noisePenalty` 決定 Tier 1～3。每 PDF 50、每 session 100，Tier 3 最多10；完整抽取在記憶體完成後才排名，不得以早期截斷讓低價值內容占滿配額。
  - 實作契約：versioned `config/drawing-ocr-field-priorities.json` fail-closed；same-origin actor-authorized PDF content GET；browser 每 PDF 只送一次 bounded completion POST；重用 `(session_id, source_id, adapter_code)` unique adapter result，不新增 status/table；只保存 selected field evidence與aggregate discard counts，不保存完整 OCR word arrays、頁面 bitmap或捨棄原文。
  - RD slices：082-A～H 保留為 `OCR-082-001..038` 已通過基線；本次 082-I 實作自適應完整取景與同 page proxy 高解析局部重繪，082-J 補 `OCR-082-039..044`、DEV-079 三 viewport與回歸完成 gate。
  - 驗收：必要七欄在配額壓力下不被淘汰；文字PDF不啟動OCR、掃描頁才啟動；其他附件OCR invocation=0；缺值／衝突不造成誤寫；跨tenant與hash/MIME/magic mismatch fail-closed；關頁重開可安全重跑且沒有無限等待；無第三方文件流量；server僅一GET＋一POST且無OCR compute。
  - Stop / Re-entry：若需要paid/cloud OCR、使用者安裝、維護OCR主機、新recognition status table、per-page server write、raw OCR文字／bitmap持久化、非PDF OCR、降低company/actor guard、提高容量、讓OCR阻擋Drawing submit，或觸及production/staging/migration/deploy/release，停止回Dev PM。只有 P95 >3分鐘、平均頁數>10、tab interruption>5%或產品明確要求離頁背景完成，才另開checkpoint/background amendment。
  - 歷史實作基線：082-A→H 已完成，包含 PDF.js／Tesseract pipeline、canonical revision semantics、跨來源 reviewGroups、legacy append-only projection、producer-side normalized page geometry、locatable-first resolver與單一 2D preview surface；`OCR-082-001..038` 既有證據繼續作回歸基線，但不能證明本次全文／清晰度驗收。
  - 重開原因（2026-08-20）：`src/components/pdf-page-viewport.tsx` 目前將主 preview canvas 的 device pixel ratio 上限設為 `2`，鏡片固定 `3×` 並以 `drawImage` 二次放大；約 150 px 鏡片只取得約 50 px 原始視野，造成「不鏽鋼SUS304」右側被裁切且 glyph 因低解析 raster 再取樣而模糊。
  - Current Phase RD Contract：以 geometry bbox 加水平 30%／垂直 50% 安全邊界建立 `targetRect`，完整內容優先於固定倍率；以鏡片中央 78% 為安全內容區並自動反算 `fitZoom<=3`。正常路徑重用同一已載入 `PDFPageProxy`，以 backing scale `2.5..3` 直接 clipped render 到 bounded offscreen canvas，不重新抓檔、不建立第二 viewer，不再二次放大主 preview canvas。
  - UI／效能邊界：螢光標記維持無外框，放大鏡只有單一黃色外框；不新增 slider、按鈕、卡片、popover或新模式。桌面／laptop／mobile鏡片上限分別為 200／168／140 px，單一 canvas 任一邊 `<=1024 px`、RGBA `<=4 MiB`、最多四筆 LRU，stale render必須取消；文件載入後切換 evidence 不增加 content GET，server compute／OCR成本維持零新增。
  - 重開證據（2026-08-20）：A0002 最新 session 同時存在 `source_revision=0.1`（`A0002.SLDPRT`、`cad_property`、無 geometry）與 `revision=0.1`（`A0002-M01.pdf`、`pdf_title_block`、page 1）。因 category／field key 不同而產生兩個同標籤候選；UI 又固定取 `observations[0]`，並將任何無法解析的 geometry 誤稱為「僅存在檔案屬性」。PDF producer 儲存絕對 points／pixels，preview 只接受 0..1／0..100，且缺 page width／height／origin，即使選中 PDF 證據也可能無法定位。
  - 根因契約：`source_revision` 與 `revision` 應共用 canonical semantic key `revision` 與 `identity_relation` evidence-only category；新 ingestion 在計算 `group_key` 前正規化，舊 append-only rows 不改寫，由 projection 相容合併。同值顯示一個 review group 並列出 CAD／PDF 來源；異值顯示來源衝突，不靜默選值。圖號／版次仍是身分檢查證據，不寫入 `pdm_drawing_revision_metadata_values`。
  - 定位契約：PDF.js text layer 與 Tesseract layout 在 producer 端統一輸出 `normalized_page` 0..1／`top_left`，帶 page number／rotation／頁面尺寸證據；consumer 不再猜測 raw coordinate space，也不得把座標套在含 toolbar／thumbnail／margin 的 iframe viewer frame。Evidence mode 以可量測的 actual PDF paper element 為唯一 overlay parent，使用無外框黃色螢光標記；局部放大鏡依 §0.13 從同一 page proxy 高解析重繪、自動避開標記並保持 viewport 內。焦點候選時優先選可定位 PDF evidence，再降級到 source-aware nonspatial message；不得以 `observations[0]` 或 geometry parse failure 推定來源類型。定位只重用既有左側單一 2D preview surface：同source/page只加 evidence treatment，跨file/page在原viewer暫時切換，多頁PDF導向精確頁，並以一次性 `preEvidencePreviewState` 在返回／清除焦點時恢復原preview kind/source/page；禁止新增PDF tab、第二viewer、route、附件、版次或recognition source。
  - 實作邊界：修正 `solidworks-metadata-field-aliases.json`、`drawing-ocr-field-priorities.json`、PDF／OCR spatial producers、recognition repository projection／grouping、workspace evidence selection／message 與 DEV-082／079 gates；不新增 schema／migration／OCR 主機／API key／第三方流量，不改 Drawing submit gate。
  - 驗收邊界：既有 `OCR-082-031..038` 繼續覆蓋 canonical／geometry／source-aware 定位；新增 `OCR-082-039..044` 覆蓋完整 bbox、安全 padding、自適應倍率、PDF高解析crop、單黃框、三viewport、cache／failure／network成本與 A0002「不鏽鋼SUS304」全文清晰度。
  - 修正結果（2026-08-20）：右欄 PDF coverage 與左欄跨來源 review projection 已分離但對齊；同值版次只顯示一個 review field，異值保留 conflict；PDF 可定位時左側同一 2D surface 以 exact PDF.js page 顯示頁碼、黃色螢光標記與 3× 局部放大鏡，兩者相對實際紙張定位而非整個 browser viewer。CAD 無座標時明確顯示檔案屬性來源，不再誤稱未找到或冒充 PDF 定位。
  - 本輪 RD 實作（2026-08-20）：082-I 已完成 `src/components/pdf-page-viewport.tsx` 自適應 `targetRect`（水平 30%／垂直 50% padding）、78% 安全內容區、鏡片尺寸 200／168／140 上限、同一 `PDFPageProxy` 的 2.5..3x direct clipped render、bounded 1024px crop canvas、四筆 LRU、stale cancel／unmount cleanup、fallback status 與 render/cache diagnostics；`drawing-detail-preview.tsx` 傳入 source-aware cache key；`globals.css` 移除 highlighter 外框、green/second magnifier frame 與 handle，保留單一黃色 ring。082-J 的可驗收 runner 已補上 `targetRect`／`cropRect`／coverage／resolution／backing scale／elapsed／LRU／material exact text 斷言與 OCR-082-039..044 報告案例。
  - 目前證據（2026-08-21）：`qc:dev-082:contract`、`qc:dev-082:repository`、`qc:dev-082:browser`、`qc:dev-079:layout-browser`、`qc:dev-079:recognition-layout-browser`、`qc:dev-079:contract`、`typecheck:app`、affected ESLint、`build:isolated`、`qc:dev-082:regression` 與 `qc:dev-082:gate` PASS。isolated A0002 successor fixture 的 1440／1024／390 Chromium matrix 已證明 `OCR-082-039..044` 全部 PASS：完整 `不鏽鋼SUS304`、coverage `1`、`pdf_high_res_crop`、backing scale `2.5`、單一黃色鏡框、螢光筆無外框、無綠框／雙環／第二 viewer／新增 content GET。最新 gate `output/qa/dev-082-browser-pdf-ocr/gate-20260820163042-local-isolated/` 為 44/44 PASS；canonical `revision` 已取代 fixture 舊 `source_revision`，generic layout runner改用隔離 A0002 fixture並保留版面斷言。
  - 下一步：保留 production representative gold set、正式檔案存取、部署與 release smoke 的獨立 gate；本機 DEV-082 不再有 regression blocker。Production Release Gate維持不變。
  - 計入交付：否（本項為支援父交付點 `DEV-068` 的開發點；只有父交付點計入產品完成率）。

- ! DEV-069 [交付點] [RD/QC Local Passed / Human Confirmed] [P0] [Blocked: Google OAuth + ADC Refresh / Live GCP Release Gated] AI-PDM 預上線 GCP 降本與低成本 Staging
  - 摘要：將 Production Cloud SQL 改為 `db-f1-micro`／`ZONAL`，把 Staging 改成 Micro／Zonal／按需啟停且保留完整發布驗證能力，刪除已完成 reconciliation 的 Restore target，並移除 Production／Staging 未使用的 external ALB chain；預估從目前約 NT$4,300／月降到約 NT$550／月。
  - 來源 ID：`DEV-PDM-GCP-PRELAUNCH-COST-OPTIMIZATION-001`
  - 父任務：`DEV-032`、`DEV-046`；Production live execution 維持由 `DEV-032` 作唯一 release 入口。
  - 下一步：2026-08-12 本機 RD／QA／QC 已完成；待 `gcloud auth login --update-adc` 重新驗證後，依序執行 approved remote backend refresh、saved plan allowlist、Staging 啟動／完整發布 smoke／停止、Production runtime 收斂、Production Micro／Zonal＋ALB apply、Restore 精確刪除與 post-change readback。
  - 阻塞／恢復條件：2026-08-12 已連續三輪確認 `gcloud auth print-access-token` 與 `gcloud auth application-default print-access-token` 均因 reauthentication failed 而不可用；最新 `gcloud auth login --update-adc` 已開啟 Google 帳戶選擇頁，需使用者親自選擇 `jedchang0308@jenfu.com.tw` 並允許授權。授權完成後立即恢復 credentialled plan；不得用 Console-only 操作繞過 release gate。若 plan 會 replace／destroy Production main DB、刪 private networking／IAM／secret／Firebase／state backend、缺最新 backup／PITR、Staging remote state drift 無法解釋、`web.app` smoke 失敗或 Micro connection budget 不成立，立即停止。
  - 證據：local release source `codex/dev-069-cost-optimization@1065d4a7`（clean、尚未 push）；`.ai-doc/specs/SPEC-PDM-GCP-COST-OPTIMIZATION-001-prelaunch-runtime-topology.md`、`.ai-doc/decisions/ADR-PDM-GCP-COST-OPTIMIZATION-001-prelaunch-firebase-hosting-zonal-micro.md`、`config/platform/dev-069-gcp-cost-optimization.json`、`scripts/qc-dev-069-gcp-cost-optimization.mjs`、`scripts/verify-dev-069-terraform-plan.mjs`、`.ai-doc/reports/pm/pm-dev-032-production-principal-restore-reconciliation-2026-07-16.md`、`.ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md`。
  - 計入交付：是（成本目標、Production 可用性、Staging 發布驗證能力、資源清理與帳務 readback 全部通過才完成）。

  - 文件成熟度：`RD/QC Local Passed / Human Confirmed`。Production／Staging backend-disabled Terraform fmt／validate 均為 0 error／0 warning；DEV-069 targeted QC 16/16，相關 DEV-032／DEV-046 contract QC 均通過。Live phase 雖已有方向確認，仍須獨立 release gate 留下 credentialled plan、backup、角色分離 QC 與 post-change evidence。
  - Spec Impact Preflight：`Intentional replacement`。預上線期間取代原 canary day-one Regional HA、常駐 `db-custom-1-3840` 與為 deferred custom domain 保留 ALB 的成本姿態；Cloud SQL authority、Taiwan region、private IP、IAM DB auth、backup／PITR、clean seed、Production HSM 與 numbering integrity 不變。
  - 核心容量契約：`maxInstancesPerRevision=2`、`maximumConcurrentRevisions=2`、`effectiveMaximumInstances=4`、`poolMax=2`、`migrationAdminReserve=2`、`maxConnections=25`；必須證明 `4 × 2 + 2 = 10 <= floor(25 × 0.70) = 17`，並以 live `SHOW max_connections` 校正。
  - Staging 契約：保留 Firebase Hosting、Cloud Run min 0、migration runner、Cloud SQL private access、IAM、Identity Platform、Secret Manager、VPC、logs、monitoring、budgets 與 Artifact Registry；DB 平時停止，發布驗證時啟動並完成 migration idempotence、登入／session、核心 API、資料寫入／重讀、candidate smoke 與 rollback readiness 後停止。
  - ALB 契約：每環境完整移除 serverless NEG、兩個 backend、兩個 URL map、managed certificate、兩個 proxy、兩個 forwarding rule 與 edge reserved IPv4；private service access address／VPC／Cloud SQL private IP 不得刪除。
  - Restore 契約：只刪 `jenfu-ai-pdm-prod / asia-east1 / ai-pdm-prod-restore-20260716a`；刪除前確認最新 Production backup／PITR、既有 restore report 與 source／restore hash equality，且不得刪正式主庫或證據。
  - 驗收：local IaC/QC PASS；Staging 完整發布驗證後回到 stopped；Production Micro／Zonal、`web.app` authenticated smoke、資料／schema／IAM／numbering integrity無漂移；兩套 ALB 與 Restore 不再新增 SKU 費用；24～72 小時 Billing run-rate 可解釋且目標偏差不超過 20%。
  - Optional future：Staging HSM 可改 SOFTWARE key，但必須先做簽署／驗簽 parity 並另取得舊 HSM version scheduled-destruction 核准；Artifact Registry cleanup 不得刪 current／previous-known-good digest。

- ✓ DEV-070 [交付點] [RD Implementation Ready / Human Confirmed] [P1] [Local RD Implemented / Focused Contract + Query + Browser QC Passed / Full APW Matrix Pending / Production Release Gated] 審核清單共用 PDM 工作台骨架與精確返回
  - 摘要：讓 `/approvals` 審核清單沿用圖號／料號／圖料工作台的搜尋、篩選、清單、選取、鍵盤、游標分頁、URL 與錯誤恢復 mechanics，維持相同肌肉記憶；審核列只提供自己的欄位投影，點選 PDM 案件仍前往送審者使用的 owner module 與同一 `UnifiedPdmEntityDetailDrawer`。
  - 來源 ID：`DEV-PDM-APPROVAL-INBOX-WORKBENCH-001`
  - 父任務：`DEV-062`、`DEV-066`；關聯：`DEV-067`、`DEV-PDM-APPROVAL-PLATFORM-001`。
  - 下一步：本機 Phase 1A → 1B → 1C 已實作並完成 focused QC；Phase 1D 的完整 `APW-001..028` 四 viewport／101+／跨 actor-company／決策返回矩陣仍待專用 fixture 與人工驗收。不得自行進入 production/staging、stage/commit、merge/PR、deploy 或 release。
  - 證據：`.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`（DEV-070 RD Implementation Contract）、`.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`（optional core delta）、`.ai-doc/specs/SPEC-UX-PDM-WORKBENCH-TOPBAR-001-unified-toolbar-muscle-memory.md`（spatial/UI amendment）、`.ai-doc/qa/qa-pdm-approval-platform-validation-plan-2026-07-08.md`（`APW-001..028`）及契約內 exact product/test file plan。
  - 本機實作：新增 `approval-workbench-contract`；approval repository/API/page 改用六來源 server list、deterministic rowKey、server-side query search、signed after/before cursor、server summary、shared controller/list/pagination、canonical URL 與 owner-route navigation；submission/BOM reader 補 `companyId` SQL scope；移除重複 BOM 審核 sidebar entry。當前 source merge 採 bounded scan；101+ strict keyset traversal 仍是未關閉 gate。
  - 聚焦驗證：`qc:dev-070:contract` PASS、`qc:dev-070:query` PASS（legacy 3 reads 與 batched 3 reads deep-equal）、`qc:dev-070:postgres` PASS（static guard；未設定外部 PostgreSQL，runtime parity 未宣稱 PASS）、`qc:dev-070:navigation` PASS、`qc:dev-062:core` PASS（6/6）、`qc:pdm-approval-platform` PASS（123/123）、`typecheck:app` PASS、`build:isolated` PASS、`qc:dev-070:browser` PASS（shared list/filter/pagination envelope、無 auto-open、owner route、console/network 及 screenshot）。Browser evidence：`output/playwright/dev-070-approval-workbench/approval-workbench.png`。
  - 計入交付：是；只有審核清單共用 mechanics、完整返回 context 與真實 viewport/interaction 驗收通過後才計入完成。

  - Human Decision Brief：
    1. 審核清單與圖料工作台共用工作台骨架、互動語言與操作位置；不得另維護一套近似的 filter/list/selection/pagination CSS 與 controller。
    2. 共用不等於直接重用 `RelationRowCard`。圖料清單是可展開的 root relationship browser；審核清單是跨 domain work queue，使用 `ApprovalInboxRowProjection` 顯示審核對象／品名、審核類型、送審者、送審時間與狀態。
    3. `/approvals` 不顯示 `關係樹／矩陣`，也不重新組裝右側審核明細。PDM 案件由 server-authorized owner href 導向 `/numbering/drawings`、`/parts` 或 `/numbering/search`，在來源模組開啟同一 unified drawer。
    4. 導航遵守「哪裡來，哪裡去」：`returnTo` 必須保存 status、domain、action、query、cursor/page 與 selected request；關閉、Back 或完成決策後回到原篩選、原頁次與原選取列，只刷新受影響資料。
    5. 正常列保持低噪音；狀態以 badge／icon／列選取表達。只有 blocked、error、empty、no-permission 等中斷狀態顯示恢復操作。

  - 現況差距與根因：
    1. `src/app/approvals/page.tsx` 以 page-local `useState`、`loadInbox`、`approval-inbox-item` 與專屬 CSS 組清單；未使用 `usePdmWorkbenchController`、`PdmWorkbenchList`／共用 collection primitive 或 `PdmWorkbenchPagination`。
    2. 審核清單沒有搜尋、cursor pagination 或清單鍵盤操作；API 固定 `limit=100`，UI count 只反映本次載入筆數，不能證明完整 inbox。
    3. `loadInbox` 沒有共用 AbortController/request sequence guard；快速切換篩選時，較舊 response 可能晚到並覆蓋新條件。
    4. filters 雖寫入 URL，但選取列未寫回 canonical request selection；owner href 的 fallback `returnTo` 不包含原 selected request，返回後可能改選第一筆，尚未完整符合 DEV-067 safe-return contract。
    5. 目前看似相近的 panel/list 外觀由兩套 DOM/CSS 維持，之後 toolbar、row density、selected/loading/empty/error 或 responsive 規則容易再次漂移。

  - Current Phase Scope：
    - 共用 topbar／toolbar／result panel／collection／pagination 的位置、spacing、loading、empty、error、selected 與 responsive 規則。
    - 讓 approval inbox 使用 shared workbench controller contract：URL sync、request cancellation/race guard、cursor history、selection、Back/Forward、reload 與 refresh。
    - 新增搜尋與 server-side cursor pagination；跨 native/legacy approval sources 的排序與 cursor 必須 deterministic，不能先各取固定筆數後在 client 假裝完整分頁。
    - 以 approval row adapter 投影跨 domain 欄位；domain/status/action filter 維持 approval authority，不進 workbench core。
    - 點選 covered PDM request 時保留 owner-route navigation；返回時恢復 exact inbox context 並刷新 affected row。未覆蓋的 legacy/BOM 類型可保留既有 fallback，但清單本身仍使用同一 workbench shell。

  - Out of Scope：
    - 不把圖料 `關係樹／矩陣`、root expand/collapse 或 relation mutation 搬進審核清單。
    - 不在 `/approvals` 建立新的 approval-only detail drawer、preview、附件或 snapshot body。
    - 不改 approval assignment、eligibility、decision、idempotency、audit、status machine、owner data lock 或 domain command authority。
    - 不要求本階段把 BOM／submission／drawing-package 明細全部遷移成 PDM entity drawer；各 domain 具備 canonical owner surface 時再依 owner adapter 接入。
    - 不含 schema/migration、production/staging、merge/PR/deploy/release。

  - 目標架構：
    ```text
    SharedPdmWorkbenchMechanics
    ├─ WorkbenchTopbar / Toolbar
    ├─ URL + Search + Filter + Cursor Controller
    ├─ Collection / Selection / Keyboard / Pagination
    ├─ Loading / Empty / Error / Recovery
    └─ RowProjection
       ├─ RelationRootRowProjection
       └─ ApprovalInboxRowProjection

    ApprovalInboxRowProjection
    └─ server-authorized ownerHref
       ├─ Drawing owner workbench + UnifiedPdmEntityDetailDrawer
       ├─ Part owner workbench + UnifiedPdmEntityDetailDrawer
       └─ Relation owner workbench + UnifiedPdmEntityDetailDrawer
    ```

  - 驗收方向：
    1. `/approvals` 與三個 PDM 工作台在頁首、toolbar、結果 panel、selected row、pagination、loading/empty/error 與 desktop/mobile 響應位置具一致肌肉記憶；審核專屬欄位不被迫顯示關係樹或矩陣控制。
    2. 搜尋、status/domain/action filter、cursor/page、selected request 在 URL 可重載、分享、Back/Forward，快速操作只保留最後一次有效 response。
    3. 超過 100 筆資料時可完整分頁且無重複／漏列；同 requestedAt 使用 stable tie-breaker；filters/search 改變後 invalid cursor 安全回第一頁。
    4. ArrowUp/Down、Home/End、PageUp/Down、Enter、Escape 與無文字選取時複製主識別符合 shared contract；focus 在 input/textarea/select 時不攔截。
    5. 點選 Drawing/Part/Relation request 後只 mount owner route 的 `UnifiedPdmEntityDetailDrawer`；`/approvals` 不出現 approval-only detail body。close/Back/decision 返回 exact 清單 context，原列保持可定位且資料已刷新。
    6. 1440×900、1024×768、768×1024、390×844 無水平 overflow、重疊、裁切或不明 scroll owner；visible error、console error 與非預期 API 4xx/5xx 為 0。

  - 風險等級：Medium / P1。主要風險是跨 native/legacy source cursor 語意錯誤、返回狀態遺失、shared core 吸收 approval domain 邏輯、誤把 relation tree 當通用 list，以及看似共用但仍維護平行 DOM/CSS。
  - Spec Impact Preflight：`Compatible extension`。它延伸 DEV-062 shared mechanics + domain adapters、DEV-066 toolbar muscle memory與 DEV-067 inbox-only/owner-route/safe-return；不取代既有審核 authority。ADR 不新增，沿用 `ADR-PDM-WORKBENCH-CORE-001`，因其已明確選擇 shared mechanics + domain adapters 並拒絕 mega generic component。

  - RD Handoff Contract：
    - List API：`GET /api/approvals/inbox` 接受既有 `status`、`domain`、`action`，新增 `query`、signed `cursor`；`limit` 預設 60、最大 100。response 至少包含 `rows`、`nextCursor`、`previousCursor`、`generatedAt`、normalized `filters` 與 reviewer-scoped `summary.pending`。
    - Row projection：每列具有不可碰撞 `rowKey = approval:{source}:{sourceRecordId}`、可供 detail API 使用的 `requestId`、`source`、`displayCode`、`displayName`、`actionCode/actionTitle`、`domainCode`、`requesterName`、`requestedAt`、`status` 與 server-authorized `ownerHref`；legacy `requestId` 保留既有 encoded ID，core 不解讀 approval 欄位。
    - 搜尋範圍：server-side 搜尋 target code/label/title、request title、requester display name 與 package code；trim、空白正規化、case-insensitive，Phase 1 不要求 fuzzy search。filter/search 必須在 source limit 與 global page slice 前完成。
    - Cursor：namespace `approval-inbox-v1` 進 filter hash；wire payload 沿用 version/filterHash/updatedAt/rowKey，`updatedAt` 承載 requestedAt，新增 `direction=after|before` 與 signed pageIndex。global order 固定 `requestedAt DESC, rowKey ASC`；after/before 使用相反 keyset predicate，回傳頁一律重排為 canonical order。cursor 遭竄改、跨使用者、跨公司或 filter mismatch 回 400，UI 清除 cursor 回第一頁並顯示可恢復提示。
    - 跨來源 merge：native、numbering、submission、BOM、drawing package、drawing revision review 六來源均先做 actor/company/assignment/filter/query/cursor predicate，再各取 `limit + 1`，server 依 global order merge/slice；禁止先固定取 100、post-limit filter，或把 incomplete slice 當完整結果。
    - Count：sidebar 與 workbench pending badge 使用獨立 reviewer-scoped exact count，不得由當頁 `rows.length` 推算；無 exact `matchingTotal` 時 UI 僅顯示「本頁 N 筆」。整個 list read path 在 1／20／60 rows 下 query count 不成長，hard budget `<=16`，不得 N+1。
    - URL：canonical state 為 `/approvals?status=...&domain=...&action=...&query=...&cursor=...&page=...&requestId=...`；page 為server cursor衍生的一基顯示值。filter/query 變更清除 cursor/page 與不再存在的 selection。reload、share、Back/Forward 必須還原相同可見頁與選取列。
    - Owner navigation：API 依 normalized current list state與該列 `requestId` 產生 `ownerHref.returnTo`；client 不自行猜測。covered PDM row 導向 Drawing/Part/Relation owner route，僅 mount 該 owner 的 `UnifiedPdmEntityDetailDrawer`。close、browser Back、decision success 回 exact inbox state並只 refresh affected row與 exact pending count。
    - Shared mechanics：沿用 shared topbar/toolbar/result/selection/pagination、abort/latest-response guard、keyboard/focus、loading/empty/error/retry與 responsive contract；approval 僅提供 filter/row/navigation adapter，不在 core 加 domain conditional。
    - Permission：維持現行 reviewer role、assignment、company/workspace scope與 decision capability；scope 必須在 search/count/cursor 前套用，owner href 僅在 server 再授權後輸出。無權限回 403 且不洩漏列、count、target 或 owner URL。
    - Failure：任一 required source 讀取失敗時 whole response fail closed，不回 partial inbox；401 走既有 login return、403 顯示 no-permission、stale response 不可覆蓋新 state、owner target 已失效時回安全可恢復狀態，不得改用 approval-only drawer。
    - Data/schema：本 phase 不新增 persistent table、欄位或 migration；若正確游標需要新持久 identity、物化 inbox 或改 approval authority，立即停止回 Dev PM 與 architecture review。

  - Dependencies：
    - `DEV-062`／`ADR-PDM-WORKBENCH-CORE-001`：shared mechanics + domain adapters 與 signed cursor基礎。
    - `DEV-066`：三工作台 toolbar/topbar 肌肉記憶；approval 只能相容延伸。
    - `DEV-067`：owner-module unified drawer、server-authorized owner resolver與 safe `returnTo`。
    - `DEV-PDM-APPROVAL-PLATFORM-001`：assignment、status、decision、audit、domain handler與 legacy source authority；DEV-070不得重定義。

  - RD Implementation Readiness：`PASS / no P0-P1 gap`。
    - Product files：新增 `src/lib/approval-workbench-contract.ts`；修改 `pdm-workbench-contract.ts`、`pdm-workbench-cursor.ts`、`use-pdm-workbench-controller.ts`、`pdm-workbench-pagination.tsx`、approval repository/service/API/page、`pdm-review-navigation.ts`、`sidebar-nav.tsx` 與 scoped `globals.css`。`PdmWorkbenchList`、keyboard hook、unified drawer及三個 owner workbench預設只重用、不修改。
    - Test files：擴充 `scripts/qc-approval-inbox-query-budget.mjs`、更新被 DEV-067/070 明確取代的 `scripts/qc-pdm-approval-platform.mjs` expectations；新增 `scripts/qc-dev-070-approval-workbench.mjs`、`scripts/qc-dev-070-postgres.mjs`、`scripts/qc-dev-070-browser.mjs` 與 `package.json` 五個 `qc:dev-070:*` scripts。
    - Data/query：六來源各自 push down company/reviewer/status/domain/action/search/keyset；native list最多3 reads、五 legacy最多5 reads、六來源 grouped count最多6 reads，預期14、hard gate `<=16`，無 N+1。legacy submission/BOM補 company predicate；drawing revision排序改與 exposed assessedAt一致；SQLite以同一 `strftime` expression正規化混合timestamp，PostgreSQL以native TIMESTAMPTZ比較，API統一ISO。
    - Compatibility：shared contract/controller additions全為 optional，default仍是既有 history mode；approval使用 server-bidirectional mode。舊 `items` response與sidebar fallback同一 change atomically移除；非covered legacy detail仍保留。
    - Dirty boundary：assessment baseline為 branch `持續優化1`、HEAD `cc393e04`，target內既有 dirty files為 `package.json`、approval page、`globals.css`、`sidebar-nav.tsx`、approval repository，且無 staged target。RD 必須先保存並逐 hunk 保留使用者變更，禁止 reset／checkout／全域格式化。
    - Commands：`qc:dev-070:contract` → `qc:dev-070:query` → `qc:dev-070:postgres` → `qc:dev-062:core` → `qc:dev-067:navigation` → `qc:pdm-approval-platform` → `typecheck:app` → `build:isolated` → `qc:dev-070:browser`。

  - Phase Coverage Matrix：
    1. `1A Server list contract`：normalized filters/search、六來源 global ordering、signed bidirectional cursor、exact pending count與 query budget。
    2. `1B Shared client mechanics`：共用 shell/controller/list/pagination、approval row adapter、URL selection、race guard、keyboard/focus與 responsive。
    3. `1C Owner return`：canonical ownerHref、exact `returnTo`、close/Back/decision refresh與 fallback domain compatibility。
    4. `1D QA/QC`：API contract、permission/isolation、100+ pagination、stale-response、四 viewport、keyboard/focus、network/console與 static architecture evidence。

  - Acceptance and Evidence Gate：
    - `APW-001..028` 全數有可重跑證據；包含 0、1、20、60、101+ 及六來源同時間 collision fixture，證明排序、next/previous、reload/back、filter mismatch、tamper、actor/company isolation無重複漏列。
    - 靜態證據證明 shared core 無 approval status/action/domain branch、`/approvals` enabled path 無第二套 Drawing/Part/Relation detail body，且所有 covered PDM row 使用 server owner href。
    - Browser evidence 覆蓋 1440×900、1024×768、768×1024、390×844；搜尋／篩選／分頁／selection／owner return／keyboard／focus／loading／empty／error／forbidden皆可操作，水平 overflow、錯誤 scroll owner、visible error、console error與非預期 4xx/5xx 為 0。
    - 完成定義不接受「看起來相同」或單一 happy path；必須證明同一 mechanics primitive、bounded query、latest-response-wins與 exact return context。

  - Stop / Re-entry：若需要 schema/migration、persistent cross-source identity、partial-source degrade mode、approval權限/狀態/decision語意變更、shared core domain branch、production/staging data、merge/PR/deploy/release，立即停止並回 Dev PM；帶上影響面、選項、風險與待確認人類決策後才能重入。
  - Execution Boundary：本機 Phase 1A～1C 已完成，focused QC 已完成；完整 APW matrix、外部 PostgreSQL timestamp/cursor parity、production/staging data、stage/commit、merge/PR、deploy 與 release 仍受 gate 管制。無 schema/migration、新 dependency 或環境變數。
  - Future Phase Capsule：BOM、submission、drawing-package 等非 PDM 審核明細只有在各自具備 canonical owner workbench、server-authorized owner href 與 safe return contract 後，才接入相同 owner-surface模式；重新進入條件是使用者要求該 domain 明細收斂，或 legacy fallback 成為可見一致性／維護風險。

- ✓ DEV-071 [交付點] [本機 RD/QA/QC 完成 / Human Confirmed] [P1] [Local Only / Production Release Gated] BOM 樹狀編輯直覺化與 Floating Topic 暫存區
  - 摘要：研究 XMind 的 Topic、Outliner、Filtering、Marker、Note 與 Advanced Layout，將可降低 BOM 編輯認知成本的互動轉成受治理的 Draft 工作流；正式 BOM 仍是唯一可審核、可重現、可匯出的嚴格樹。
  - 來源 ID：`DEV-PDM-BOM-VISUAL-EDITOR-002`
  - 父任務：`DEV-060`；延伸歷史 `DEV-BOM-VISUAL-EDITOR-001`，但不重開已完成的建立入口、canonical Part Number owner、BOM Rev 或 review/release/export 整合。
  - 完成結果：Phase 1A `035` additive schema／editor version／雙 graph repository API；Phase 1B semantic history、conversion 與 shortcuts；Phase 1C XMind spatial UI；Phase 1D contract/API/schema/browser evidence 均已完成。
  - 安全結果：formal/floating/version 原子保存；stale 409 不覆蓋 winner；unresolved Floating 在 submit、approve/release authority fail closed；Manufacturing PATCH 403；browser `Ctrl+R`／`Ctrl +/-` 保留原生行為。
  - 證據：SPEC `.ai-doc/specs/SPEC-BOM-VISUAL-EDITOR-001-xmind-style-bom-editor.md`；AI QA `.ai-doc/qa/qa-dev-071-ai-full-operation-validation-plan-2026-08-13.md`；QC `.ai-doc/qc/qc-dev-071-xmind-bom-editor-2026-08-13.md`；latest browser manifests `output/qa/dev-071-xmind-bom-editor/20260813131302/run-manifest.json`、`output/qa/dev-071-flag-off-browser/20260813131601/run-manifest.json`。
  - 驗證摘要：contract 18/18、API 16/16、BOM migration path 21/21、PostgreSQL shadow 27/27、latest AI browser 56/56／17 screenshots、flag-off browser 10/10、TypeScript PASS、console error 0、非預期 HTTP error 0、P0/P1=0。
  - 計入交付：是；本機授權範圍已完成。

  - Human Decision Brief：
    1. Floating Topic 是必要的草稿編輯能力，不因正式 BOM 禁止游離料件而移除。
    2. Floating Topic 必須位於清楚標示的「未納入 BOM」暫存區，與正式 BOM 樹有可見邊界。
    3. 暫存項目可隨 Draft 保存／重開；歸位後才成為 canonical BOM line。
    4. 存在未歸位項目時，送審、發行與正式匯出必須在 UI 與 server 兩側阻擋，不得靜默丟棄、排除或猜測父層。

  - Current Scope：
    - 節點旁新增同層／子層、低風險快速編輯與 canvas-focus-only Enter／Tab／Shift+Tab／Alt+Up/Down／Undo／Redo。
    - 拖放前顯示上方 reorder、中央 reparent、下方 reorder 三種落點與 invalid reason。
    - 「只移除節點並處理子件」與「刪除整個子樹」分離，子樹刪除顯示影響數並可 Undo；欄位編輯 session 合併成一個 history step。
    - 折疊／展開、隱藏後代數、只看分支與可恢復 breadcrumb。
    - Floating Topic 搜尋加入、正式樹移出、保存、定位、歸位與提交 fail-closed。

  - Out of Scope：任意 relationship edge、自由樣式／座標作為正式資料、批次跨 BOM 搬移、AI 自動改 BOM、production／deploy／release；Map／Outliner 已由第 8 節納入本 phase。
  - Spec Impact Preflight：`Intentional replacement`。只取代「Draft 畫布任何時刻都不能有游離物件」的假設；不取代正式 BOM hierarchy、canonical ordering、review/release/snapshot/export authority。節點資訊採 `Compatible exception`，只讓 Qty 與會改變判斷的例外回到節點，完整資料仍留在覆蓋式 drawer。
  - Acceptance Direction：5 秒內辨識正式樹與暫存區；放開前辨識三種 drop 結果；鍵盤操作不污染輸入；刪除語意可預測；Floating Topic 可保存／重開／歸位；未歸位時 UI/server 同步阻擋；1440／1024／768／390 viewport 無關鍵操作遮擋或非預期 overflow。
  - Future Phase Capsules：大型 BOM 進階例外篩選、批次選取、批次移動與註記。只有真實任務證明本切片不足時才重新進入。
  - RD Implementation Contract：
    - Spatial UI：context strip 下方固定 52px XMind toolbar；slot 順序 `Undo → Redo → Topic → Subtopic → Insert → Fold → Focus → spacer → Save → Detail → More`；右側 inspector fixed overlay；右下固定 `Map/Outliner → − → ratio → + → Fit`；branch-only 左上顯示 full-content recovery。
    - Shortcuts：`Enter` 同層、`Tab` 子層、`Ctrl+Enter` 新父群組、雙擊 blank 建 Floating、`Space` 編輯、`Alt+Up/Down` 排序、`Ctrl+Delete` 只刪節點並提升子件、`Delete` 刪 branch、`Ctrl+Z`／`Ctrl+Shift+Z`、`Ctrl+/`、`Ctrl+Alt+/`、`Ctrl+;`、`Escape`、`Ctrl+S`；`Ctrl+R` 與 `Ctrl +/-` 保留瀏覽器。
    - Data：`bom_drafts.editor_version`＋`bom_draft_floating_topics` editor-only table；`db/postgres/035_bom_draft_floating_topics.sql`，不混用 formal root null。
    - API／transaction：GET additive 回 editor version/floating；PATCH 要求 expected version、lines、floatingTopics，雙 graph＋audit 原子保存；stale 409；submit/approve/release/export unresolved-floating server fail-closed。
    - Exact files：新增 BOM toolbar/node/picker/outliner/canvas-controls/keyboard/history/contract files；修改 page、scoped CSS、types、async repository、route、permission、SQLite/PostgreSQL baseline/RLS、package與既有 BOM QC。
    - QA：`XMB-001..016`；contract/schema/API、BOM regressions、typecheck、lint、isolated build、1440/1024/768/390 browser matrix全通過才可完成。
  - Execution Boundary：本機產品碼、schema/migration、API、permission 與 QA/QC 已完成。`PDM_BOM_XMIND_EDITOR_V2_ENABLED` 預設 `false`；未執行 live migration、正式資料、flag activation、stage/commit/merge/PR/deploy/release，production rollout 仍須獨立 release gate。

- ✓ DEV-072 [交付點] [本機 RD/QA/QC 完成 / Human Confirmed] [P1] [Local Only / Production Release Gated] PDM 四工作台明細動作可發現性與鎖定提示
  - 來源 ID：`DEV-PDM-DETAIL-ACTION-DISCOVERABILITY-001`。
  - 父任務：`DEV-067`；關聯 `DEV-053`、`DEV-055`、`DEV-062`、`DEV-066`、`DEV-070`。這是 DEV-067 統一 composer 的後續互動契約，不重開 DEV-067 已完成的 projection、preview、review lock、query 或 safe-return 結論。
  - 完成狀態：`Local RD/QA/QC Complete / Human Confirmed / Production Release Gated`。Phase 1A～1D與最終AI真實操作已通過，P0/P1=0；production rollout不在本輪授權。

  - 2026-08-14 Approval owner drawer follow-up：依實際 UI review，審核者已在 `/approvals` 明細內，不再重複顯示 `查看審核`、`撤回送審`；Relation owner 亦不顯示 `維護圖料關聯`。同一情境再移除抽屜頂部／Projection 重複狀態 badge 與 `自動預覽` 標題列，但保留 3D／2D 預覽內容。此為 server resolver 與 review-receipt scoped display amendment；一般圖號／料號／圖料根號工作台與未帶 review receipt 的 in-review owner detail 保持原規則。審核 decision 與 safe return 保留。
  - Follow-up QC：`DEV072-20260814T053707Z-e58c6459` 以真實 Chromium 重跑 21/21；五個 action/display omission assertions、三種審核決策 exactly-once、四 viewport、console/network/visible-error sweep 與 cleanup 均通過；`qc:dev-072:api`、`qc:dev-072:contract`、`typecheck:app` PASS。
  - 2026-08-14 visible detail cleanup：依最新 UI 紅線標註，所有 unified detail 抽屜移除 DrawingProjection 重複的「預覽狀態」fact 與 `自動預覽` 標題列；3D／2D preview card 及其檔案／狀態內容保留。這是 visible-copy cleanup，不改 preview resolver、檔案下載、衍生檔或資料契約。
  - Follow-up browser acceptance：圖料明細實際打開後，`預覽狀態` 與 `自動預覽` 不得存在；`3D 模型`、`2D 圖面` 必須仍存在。既有 `ACT-026` 同時驗證此刪除與圖料矩陣 parity。
   - 2026-08-14 補檔入口與操作整併：實際操作確認原本的 `編輯圖面資料` 與 `管理圖面檔案` 會讓使用者分辨兩個入口，且補檔需靠另一個 action 才能進入。現改由單一 `detail:drawing:edit` action 顯示 `圖面維護`，由共用 `PdmDetailActionControl` 進入 `#drawing-data-maintenance`，在同一 `DrawingProjection` 顯示基本資料、自動預覽、關聯料號與 `MasterAttachmentPanel` 受控上傳入口；後端資料儲存與檔案上傳仍是獨立 mutation boundary，檔案類別仍由 server-side 自動分類，不新增人工 3D／2D 類別選擇。圖面 payload 不再輸出獨立 `manage_files` action。
   - Follow-up verification：`qc:dev-072:contract`、`qc:dev-072:api`、`typecheck:app` PASS；AI Chromium evidence `output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T110623Z-5ad38d84/run-manifest.json` 已實際確認合併後的 `detail:drawing:edit` 顯示 `圖面維護`、`#drawing-data-maintenance` 與 `form[aria-label="上傳圖面資料"]` 出現。完整回歸後段的既有審核案例等待逾時，未將本次 follow-up 宣告為新的 21/21 全綠；production/staging/release 仍未執行。

  - Human Decision Brief：
    1. Drawing、Part、Relation 與由 Approval 進入的 owner detail，都使用同一 `ContextActionBar` 顯示規則。
    2. 對該 owner surface 與生命週期適用的動作一律顯示；現在不能按時以低色階鎖頭與 disabled 語意保留。
    3. disabled reason 不常駐；桌面 hover、鍵盤 focus、觸控點擊鎖頭顯示同一短提示。
    4. 不適用、跨 domain、永久終結且無恢復路徑的 action 完全不顯示，也不放入「更多」。跨 domain projection 的資料摘要仍依 DEV-067 policy 顯示。
    5. enabled action 以 primary／accent 提示；每個情境最多一個 primary，同一 action 解鎖時不可移位或改名。
    6. 審核者看到相同 owner action catalog 加 exact allowed decisions；送審中的 owner mutation locked，無權限 decision 顯示 locked reason 或在永久不適用時省略。

  - Problem / Value：現行 `buildContextActions` 只回傳當下 primary，加上 review decisions／refresh／return，導致下一步 action 突然出現；`unified-pdm-entity-detail-drawer.tsx` 又以 native disabled button／`title` 呈現，鍵盤與 touch 無法可靠取得原因。完成後使用者不必猜流程，且 disabled 不會成為權限旁路。

  - Scope：
    - 建立 server-side applicable action catalog 與 resolver，分離 `applicable` 和 `enabled`。
    - Drawing／Part／Relation owner inventory 與 assigned-review overlay；跨 domain action negative inventory。
    - action group/order、唯一 primary、locked→enabled stable placement。
    - 共用 focusable locked action control 與 hover／focus／touch accessible tooltip/popover。
    - disabled click／keyboard／touch no-op、direct API fail-closed、responsive sticky action bar。
    - focused contract/API/DOM/a11y/browser QC scripts 與 evidence manifest。

  - Out of Scope：狀態機、permission 定義、審核 decision authority、domain write API、資料模型/schema/migration、projection depth、preview/content section、workbench list row action、production/staging rollout。`return` 可由既有 close/back shell 提供，不要求 footer 重複按鈕。

  - Spec Impact Preflight：`Intentional replacement`。有意取代：
    - 舊「只顯示當下可按／主要 action」；
    - 舊「無權限時不顯示 disabled 假入口」在 unified drawer action bar 的規則；
    - `SPEC-PDM-NEXT-STEP-UX-001` 對此 action bar 要求 disabled reason 常駐附近的規則。
    保留 server permission、client 不猜狀態、separation of duties、active-review mutation lock、domain command authority、audit/idempotency、`/approvals` inbox-only owner route與「哪裡來，哪裡去」。沿用 `ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001`，不新增 ADR。

  - RD Contract：
    - 同 endpoint `GET /api/pdm/entity-details/[entityKey]` 明示升為 `pdm-entity-detail.v2`；query不變。v2新增 `manage_files`、group/order、typed reason、permission/contact與 discriminated `execution`；enabled才可有execution，locked必須為null。不新增`visible/applicable`，不適用即不回payload。
    - `ContextActionBarModel.primary/secondary` 保留，`primary` 改為 nullable；合計是完整 applicable set，group/order 為位置權威，primary只能0或1。stable IDs/order固定於 master SPEC。
    - resolver 必須位於 server policy/service；client 只 render descriptor，不依 status／role 重算 applicability 或 authority。
    - 新增固定 capability resolver，只讀既有 `numbering.workspace.update`、`numbering.draft.update`、candidate submit/withdraw、publish、`post_release_change`、attachments、link_variant與admin_matrix；review decision仍由exact review receipt決定。
    - `GET /api/pdm/entity-details/[entityKey]` 的 `actionBar` 是 drawer 唯一權威；退役 `UnifiedPdmEntityDetailDrawer.primaryContextAction` 與 Drawing client override。清單列可保留自己的 server-derived primary，但不得注入明細。
    - submit/withdraw/decision沿用既有POST endpoints與row version/idempotency；create revision沿用canonical revisions href；403/409整體refresh，409不得自動重送。不得新增domain mutation API。
    - locked control 使用 `aria-disabled`、event guard、focus style 與 low-tone lock；native `title` 不得是唯一提示，原生不可 focus disabled button 不得是唯一 DOM。
    - tooltip/popover：hover 約 300ms、focus 立即、touch 點 lock 開啟、最多兩行、無互動連結，Escape／失焦／點外關閉。
    - 建立／準備中保留 locked `送交審核`；ready 同位置解鎖；review 中 mutation locked；returned 修正解鎖；released 只保留適用新版／history；cancelled/obsolete/history mutation 省略。

  - Exact implementation impact：
    - 新增 `src/lib/pdm-detail-action-resolver.ts`、`src/lib/pdm-detail-action-capabilities.ts`、`src/components/pdm-detail-action-control.tsx`。
    - 修改 `src/lib/pdm-entity-detail-contract.ts`、`src/lib/pdm-entity-detail.ts`、`src/app/api/pdm/entity-details/[entityKey]/route.ts`。
    - 修改 `src/components/unified-pdm-entity-detail-drawer.tsx`；移除 `primaryContextAction`、支援 nullable primary與v2 execution。
    - `src/components/drawing-workbench.tsx`：移除 `unifiedPrimaryAction` drawer injection，不改 list-row primary contract。
    - `src/app/globals.css` 或既有 scoped styles。
    - 新增 `scripts/qc-dev-072-action-contract.mjs`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-dev-072-browser.mjs`；更新 DEV-067 contract/UI/browser assertions與 `package.json` 的四個 `qc:dev-072:*` commands。
    - 預期無 schema/migration、新 dependency 或 env；若發現需要，立即停止回 Dev PM。

  - Failure / recovery：resolver hydration 失敗時 fail closed，不由 client 猜動作；unknown action/reason code 不渲染 mutation 並顯示可恢復的 read/refresh 狀態；disabled interaction不得送 request；409/403 由既有 owner authority 回應並 refresh action model；tooltip failure不得讓 disabled control變成 enabled。

  - AI 真實操作 QC：`.ai-doc/qa/qa-dev-072-pdm-action-discoverability-ai-real-operation-validation-plan-2026-08-14.md` 為唯一 focused QC authority。`ACT-001..015` 驗證 contract／resolver／bypass；`ACT-016..030` 由 QC AI 在真實 Chromium 逐項操作 Drawing、Part、Relation、Approval owner route，包含 hover、focus、touch、disposable 送審／撤回／決策、returnTo、1440×900／1024×768／768×1024／390×844、visible error、console/network/5xx、mutation/cleanup。證據輸出 `output/qa/dev-072-pdm-action-discoverability/<runId>/`。

  - Acceptance：
    1. 四工作台對同一 owner/state/action 得到相同 label、group/order、enabled 與 reason；來源 route 只影響 safe return，不影響 action truth。
    2. applicable-but-disabled action 在 DOM 與畫面可見、低色階 locked、可由 hover/focus/touch取得原因；操作不導航、不發 request、不異動資料。
    3. inapplicable/cross-domain/terminal mutation 在 payload 與 DOM 都不存在，沒有空位或「更多」。
    4. prerequisite 完成後原 locked action 原地解鎖；全程最多一個 primary，無 duplicate CTA。
    5. assigned reviewer 只在 exact request/company scope 看 allowed decisions；owner mutation locked；未指派／跨公司/direct API fail closed。
    6. AI real-operation evidence 完整且 P0/P1=0；單元測試、build、source scan 或人工目視不能單獨結案。

  - Phase / handoff：
    - Phase 1A：完成。v2 typed contract、capability/action resolver、route/service、Drawing override removal；`qc:dev-072:contract`及DEV-067 contract/policy/query/navigation通過。
    - Phase 1B：完成。共用 locked action／tooltip、140px stable slot、event guard、responsive/a11y與ACT-011、013..015通過。
    - Phase 1C：完成。既有submit/withdraw/decision/navigation execution、idempotency、403/409 fail-closed及DEV-067 lock/review回歸通過；decision成功不再重讀失效detail。
    - Phase 1D：完成。QC AI以真實Chromium及disposable SQLite copies操作完整矩陣；final focused run 21/21，aggregate、typecheck、isolated build全通過。

  - Implementation / QC Outcome（2026-08-14）：
    - 新增 `pdm-detail-action-resolver.ts`、`pdm-detail-action-capabilities.ts`、`pdm-detail-action-control.tsx` 與三支 DEV-072 QC scripts；contract、service、route、drawer、Drawing/Approval integration、projection anchors、scoped CSS與package scripts已更新。
    - final evidence：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T050039Z-113d57e2/`；21/21 cases、13 screenshots、12/12 visible sweeps、0 console/page error、0 unexpected 4xx/5xx、2 expected-negative、cleanup removed 8且temporary root removed。
    - provenance／runner reliability：manifest記錄HEAD `cc393e048b251fb1ea3356204de56bc4c9eacc45`、branch、scoped dirty/content SHA-256與19個來源檔。複核時先發現舊manifest缺來源hash，再遇到一次Windows `next-env.d.ts` transient lock；runner已只對該已知鎖檔錯誤做最多三次重試，後續focused run與完整aggregate皆PASS。
    - true mutation：submit／withdraw／needs-info／reject／approve各 exactly once；confirmation cancel 0 write；stale direct command 409、permission direct command 403且domain state unchanged。
    - 完整命令：`npm run qc:dev-072` PASS；另 `npm run qc:dev-070:contract` PASS。詳細事實見 `.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`。

  - Stop / Re-entry：若需改狀態機、權限、decision authority、schema/migration、新 dependency、production/staging data、或 client 才能猜 applicability，立即停止並回 Dev PM。若真實 browser fixture 無法隔離 production，QC 必須標記 `NOT SUFFICIENTLY VERIFIED`，不得執行 mutation 或降級為靜態 PASS。
  - RD Entry Checklist：已完成；Next.js route/server-client/navigation/accessibility文件、起始scoped diff、feature flags與disposable SQLite邊界皆於實作前確認。
  - Execution Boundary：本機產品碼/API/UI/QC文件已完成；無schema/migration、新permission、新dependency或env。未連production/staging、未改正式資料、未stage/commit/merge/PR/deploy/release；共享工作樹非DEV-072變更均保留。
  - 計入交付：是；本機授權範圍已完成。

- ✓ DEV-073 [交付點] [Local RD/QA/QC Complete / Human Confirmed] [P1] [Production Release Gated] 狀態、責任與審核工作項一致性 CAPA
  - 摘要：修正published workspace、effective ReviewApproved、canonical lifecycle、viewer responsibility與active review work item之間的投影斷鏈，消除無動作的phantom「待你處理」。
  - 來源 ID：`DEV-PDM-STATUS-ACTIONABILITY-CAPA-001`
  - 父任務：`DEV-055`、`DEV-064`、`DEV-067`、`DEV-070`、`DEV-072`
  - 完成：effective lifecycle projector、monotonic canonical sync、published-provenance boundary、viewer/action invariant、orphan recovery、safe repair tool與三viewport browser gate均已落地；A0005本機4筆狀態修復完成且有hash-verified backup。
  - 證據：`.ai-doc/specs/SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001-state-workitem-consistency.md`、`.ai-doc/qa/qa-dev-073-status-actionability-capa-validation-plan-2026-08-14.md`、`.ai-doc/qc/qc-dev-073-status-actionability-capa-2026-08-14.md`、`output/qa/dev-073-status-actionability/DEV073-20260814T103234Z-bb1449b0/`。
  - 計入交付：是

  - RD Implementation Ready：
    - 真正需求：只有存在可證明的目前責任與適用domain action時顯示「待你處理」；active review必須有request/workflow，已核准歷史維持歷史並投影完成結果。
    - 不可變限制：不重播審核、不新增假request、不把小數版發布為Released、不直接改physical package/event、不改schema／permission／decision authority。
  - RD/QA/QC closure：CAPA-001～022完成；本機範圍P0/P1=0。未連production/staging，未stage/commit/merge/PR/deploy/release。
    - Scope：effective lifecycle projector、unified synchronizer、Drawing list/detail一致性、orphan recovery提示、viewer/action invariant、dry-run/backup/hash-gated local repair、focused/browser QC。
    - Out of Scope：staging／production data、migration、deploy、release、merge／PR及無法由現有evidence唯一決定的歷史修復。
    - Stop Conditions：需要新狀態／permission／decision規則、repair無法唯一決定、apply無backup/hash或任何production連線。
    - Acceptance：SPEC AC-01～09及QA CAPA-001～022全數通過，P0/P1=0。
    - ADR：Not required；沿用canonical Drawing、human status與unified detail既有ADR，只新增一致性invariant。

- ✓ DEV-074 [驗證點] [Executed / QC Passed 58/58 / Historical Pre-DEV-087 Baseline] [P0] [Local Isolated Only] 料號／圖號全生命週期 AI UI 真實操作驗證
  - 摘要：以目前可見產品 UI 為唯一 business mutation 入口，串接建號、首版、圖面／CAD 辨識、正式圖面進版與 FFF、BOM、技轉、作廢與歷史治理；舊保留號依使用者指示排除。
  - 父任務：`DEV-052`、`DEV-053`、`DEV-060`、`DEV-061`、`DEV-062`、`DEV-064`、`DEV-067`、`DEV-068`、`DEV-070`、`DEV-071`、`DEV-072`、`DEV-073`。
  - QA 契約：`.ai-doc/qa/qa-dev-074-pdm-complete-lifecycle-ui-real-operation-validation-plan-2026-08-15.md`；7 個路徑家族、58 條 in-scope UI journey，完整 PASS 要求 58/58、Blocked=0、Not Run=0、P0/P1=0。`B09`、`D15`、`E02`、`F08` 與工程內容差異不列入本輪分母。
  - 不可變限制：禁止 direct mutation API、DB write、seed／repair、fixture injection、JavaScript 注入與非 UI cleanup；browser network/read-only hash 只作佐證。本輪不執行 `apply_failed / ReleaseFailed` recovery；後續另立 recovery extension。
  - Input Gate：使用者提供 2D、3D、assembly、recognition 與 edge cases 的 SW 檔案組；minor／major／replacement 流程可用同檔案重複上傳驗證，必須標記 `content_changed=false`／`hash_reused=true`，不把流程 PASS 誤寫成工程內容差異 PASS；本輪不要求 BOM XLS／`.xlsx/.xls` 匯入，也不要求實際幾何／尺寸變更檔。
  - Evidence：`output/qa/dev-074-pdm-complete-lifecycle-ui/`逐 path 保存 action provenance、before/during/after screenshot、UI-triggered network、visible-error sweep、viewport、SW hash、readback、defect 與 cleanup ledger；QC為`.ai-doc/qc/qc-dev-074-pdm-complete-lifecycle-ui-real-operation-report-2026-08-15.md`。
  - 本輪狀態：2026-08-15～16已完成AI rendered UI操作與獨立QC；58/58 PASS、Blocked=0、Not Run=0、open P0/P1=0。
  - 計入交付：是；僅作DEV-087前歷史基準，不得替代DEV-087新的67條UI-only journey與11個triad gates。

- ✓ DEV-076 [交付點] [RD/QA/QC Complete / Authenticated Staging Read-only Passed] [P0] [Production Release Gated] 還原資料候選關聯自動投影與移轉對帳
  - 摘要：修正 production 備份還原到 candidate-first staging 後，候選資料雖存在 `numbering_draft_relations`，圖料工作台卻顯示空樹／空矩陣的偏差；資料與 UI 轉換必須由系統自動完成，使用者不承擔轉換動作。
  - 父任務：`DEV-062`、`DEV-064`；關聯：`DEV-052`、`DEV-053`、`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`。
  - Spec Impact Preflight：`Compatible correction`。DEV-062 與 relation-view spec 已要求 source-less candidate root、tree/matrix 同源投影及 filter-before-pagination；本 DEV 修正實作與測試偏離，不新增 ADR、schema、狀態、permission 或 write authority。
  - 真正需求：candidate 架構是 migration/read authority；production snapshot 還原後，有效候選圖號、料號、primary/reference 關聯與 UI 狀態須由 server projection 自動呈現，不能要求使用者重建或確認既有關聯。
  - Scope：
    - server-side candidate relation projector：以 workspace draft drawings／parts／relations 產生 tree、matrix、blocker 與 relationship health，list/detail 使用同一 projector；
    - candidate UI：完整資料顯示「關係已建立（尚未生效）」並呈現樹／矩陣；candidate identity 開啟同一 workspace drawer，不建立不存在的 formal deep link；
    - lifecycle gate：逐一驗證每個 `manufactured|outsourced|custom` draft part 恰有一個合法 primary manufacturing relation，避免一筆 relation 掩蓋其他缺漏；
    - read-only reconciliation：對 active/cancelled workspace、draft relation、formal link 做 company/workspace ownership、orphan、必要關聯缺漏、count/hash 與 UI/API parity 對帳；
    - focused regression、typecheck、isolated build、staging browser 三 viewport與 visible/network/console error sweep。
  - Out of Scope：production migration/deploy/traffic、production business write、使用者手動轉換、bulk relation edit、new relation mutation authority、資料刪除、無唯一規則可決定的自動修復。
  - Stop Conditions：發現 relation 無法由既有 draft facts 唯一投影、需要猜測主製造圖、跨 company/workspace 關聯、需新 schema/permission/status/authority、或 staging 驗證會寫 production 時，停止並回 Dev PM／release gate。
  - Acceptance：
    1. A0002／A0003／A0004 active workspace 既有 1×1 primary manufacturing 關聯在樹與矩陣可見；list/detail/DB count與pair hash一致。
    2. 完整 candidate 不顯示「關係待處理」或空矩陣；仍清楚標示尚未正式生效，且不提供 formal owner deep link。
    3. 每個需製造依據的料號都必須恰有一個合法 primary relation；缺漏、重複、reference-only、orphan或cross-scope一律 fail closed。
    4. cancelled/history 預設排除，`history=include` 才可見；搜尋／篩選必須在 cursor/limit 前生效，不得造成假空頁。
    5. repository、API、tree、matrix、drawer 使用同一候選關聯事實；read-only 導覽與驗證的 DB hash 不變。
    6. Engineer／Reviewer／Admin 可見與可操作性符合既有 permission；無權限與跨 company fail closed。
    7. 1440×900、1024×768、390×844 無 page-level overflow、裁切、raw error、console error或 unexpected 4xx/5xx。
  - Evidence：`npm run qc:dev-076`、`npm run typecheck:app`、`npm run build:isolated`；staging evidence 輸出至 `output/qa/dev-076-candidate-relation-reconciliation/<runId>/`，保存 revision/commit、DB read-only receipt、pair hashes、API payload、三 viewport screenshots、console/network、zero-write before/after hash與 verdict。
  - Completion evidence（2026-08-17）：implementation commit `89e8023a7b44fcd08257f7ec226f25b24b6096ba`；Cloud Build `8a7a2bb6-c8a7-43fd-96cb-0ff2ff15fe32`；staging revision `ai-pdm-stg-dev07689e802`。A0002／A0003／A0004 authenticated tree、matrix、workbench API 皆 PASS，console error 0；驗證前後 all-candidate hash 均為 `f6f061b1a8d75c885f3509b157bad811`，三筆 target hash 逐筆相同，DB write 0。QC：`.ai-doc/qc/qc-dev-076-candidate-relation-reconciliation-2026-08-17.md`；evidence：`output/qa/dev-076-candidate-relation-reconciliation/DEV076-20260817-182941-staging-readonly/`。
  - RWD qualification：同一 source commit 的 isolated Chromium 通過 1440×900、1024×768、768×1024、390×844；authenticated staging Chrome 完成 live data/UI/API/console 驗證。Chrome extension 的 viewport override 實測未生效，未把固定 1536px 誤記為三尺寸；詳細補償控制與限制見 QC report。
  - Known non-blocker：全 staging 有 1 個與 target 無關的未完成 active draft part 缺 primary relation；target 三筆 missing/duplicate/invalid-scope 都是 0。未完成草稿依既有規則 fail closed，不猜測或自動補資料。
  - 執行邊界：本輪可修改本機產品碼／測試／文件並部署 staging candidate 做 read-only 驗證；production、正式 traffic、production DB migration/write、merge/release另走 deployment release gate。
  - 計入交付：是；QA P0/P1=0、focused/local gate與 staging read-only gate全數通過才標完成。

- ✓ DEV-077 [交付點] [RD Implementation Ready / Human Confirmed / RD Implemented] [P0] [Local-Staging Implementation Complete / Production Release Gated] 正式編號草稿作廢與 production lifecycle 收斂
  - 摘要：補齊「已領圖料根號但仍為 Draft／NeedInfo、未送審且不再使用」的生命週期終點，收斂 UI、domain policy 與 production allowlist，避免可點擊的「刪除草稿」只在送出後才回 `feature_not_open_in_production_slice`。
  - 來源 ID：`DEV-PDM-NUMBERING-ROOT-LIFECYCLE-001`
  - 父任務：`DEV-040`、`DEV-PDM-NUMBERING-004`、`DEV-PDM-LIFECYCLE-ACTIONS-001`；production release 仍由 `DEV-032` 單一入口管控。
  - 交付結果：已完成 Phase A→B→C 的本機／隔離 runtime 實作；production gate、server policy、草稿作廢、正式申請／核准與 root drawer 已收斂，未執行部署或 production 資料異動。
  - 阻塞 / 恢復條件：目前無 P0／P1 readiness blocker；若受控引用無法由共用 predicate 判定、generic approval route 無法 action-code fail closed，或實作需要新 schema／正式資料修復，停止並回 PM 重新界定。
  - 證據：正式畫面曾出現 raw `feature_not_open_in_production_slice`；本次已以 server-owned policy、精確 lifecycle gate、command／outbox／serializable transaction、SQLite 隔離 API QC 與 authenticated rendered browser evidence 完成修正。
  - 計入交付：是；本機產品實作、SQLite API、PostgreSQL concurrency、authenticated browser 與既有 numbering／lifecycle／approval regression 已完成；production deployment/release evidence 仍由 QA／`DEV-032` release gate 管控。

  - DEV-077 implementation evidence（2026-08-18）：
    - `npm run typecheck:app -- --pretty false`：PASS。
    - `npm run qc:dev-077:contract`：12/12 PASS；contract／route／policy／UI vocabulary convergence。
    - `npm run qc:dev-077:gate`：5/5 PASS；containment、draft-obsolete、formal-obsolete 與 fail-closed parser。
    - `PDM_BASE_URL=http://127.0.0.1:3100 PDM_DATA_DIR=tmp/dev-077-qc npm run qc:dev-077:api`：14/14 PASS；direct obsolete、idempotent replay、root＋children preservation、audit 與 approval target snapshot。
    - `npm run qc:dev-077:postgres`：17/17 PASS；PostgreSQL 17 SERIALIZABLE concurrency／idempotency／snapshot與controlled-reference gate通過，競態下exactly one transition與single audit成立。
    - `npm run qc:dev-077:browser`：27/27 PASS；A0001 root drawer 的 `作廢草稿編號`、danger dialog、reason／ack gate 在 1440×900、1024×768與390×844通過，三尺寸無水平溢位、console/page error=0、HTTP 5xx=0；證據位於 `output/qa/dev-077-browser/dev-077-desktop.png`、`output/qa/dev-077-browser/dev-077-tablet.png`、`output/qa/dev-077-browser/dev-077-mobile.png`。
    - 既有回歸：`qc:pdm-approval-platform` 123/123、`qc:pdm-production-slice-numbering-draft` 34/34、`qc:pdm-numbering-api-regression` 23/23、`qc:pdm-numbering-concurrency-reuse` 32/32 PASS；並修正兩個disposable fixture的unified `drawings` FK清理順序。`typecheck:app` PASS、`build:isolated` PASS、lint 0 errors（15 warnings）。
    - isolated runtime port 3100、PostgreSQL disposable runtime與browser task-owned runtime均已停止並釋放；既有 port 3000保持可達；未執行production mutation、deploy、merge、PR、rollback或release。

  - 文件成熟度：`RD Implementation Ready / Human Confirmed / RD Implemented`。產品決策、repo/module/file、API、資料、交易、併發、idempotency、錯誤恢復與驗證證據均已固定，無 P0／P1 readiness 缺口；不包含 merge、PR、deploy、rollback、production smoke 或 release report。

  - 問題與使用者價值：
    - A0001 類資料已取得圖料根號，在使用者畫面仍呈現 Draft／NeedInfo，因此 UI 顯示「刪除草稿」；正式環境的 method-level allowlist 又刻意封鎖該 DELETE，形成可見操作與可執行能力不一致。
    - 使用者需要清楚區分「可刪除／可回收的暫用草稿」與「已領號但尚未正式化的受控編號草稿」，並能在不破壞追溯與不重用號碼的前提下結束後者生命週期。
    - 成功結果是：任何可見 lifecycle CTA 都與 server capability 一致；已領號但不再使用的資料有合法終點；正式資料仍維持審核與受控歷史。

  - 已確認事實：
    1. `NumberingContextualEntrypoints` 目前只以 root status 為 Draft／NeedInfo 且 formal child count 為 0 判斷顯示「刪除草稿」，未納入 production-slice capability。
    2. production middleware 對 write method 採 default-deny；`DELETE /api/numbering/records/[rootCode]/draft`、`POST /api/numbering/records/[rootCode]/obsolete` 與 `POST /api/lifecycle/obsolete-requests` 目前均未列入第一版 allowlist。
    3. production-slice QA 將正式編號 draft delete route 被拒絕列為 P0 negative PASS，但沒有涵蓋「可點擊控制必須可執行，否則須標未開放且 inert」的 root drawer browser case。
    4. 既有 draft-obsolete repository 可把全為可變草稿狀態的 root／part／drawing 原子轉為 `Obsolete` 並寫入 `numbering.draft.obsolete` audit；是否足以覆蓋所有受控引用仍須在 RD Contract 階段確認，不能直接視為 production-ready。

  - 根因與控制失效：
    - 直接原因：UI 以狀態推導動作，middleware 以 route allowlist 決定能力，兩者沒有共享同一 server-owned lifecycle capability。
    - 規格層原因：共用生命週期把一般草稿導向刪除、正式資料導向申請作廢；production slice 又禁止正式編號 root delete／obsolete，未替「已領號、未送審、永久不重用」定義可操作終點。
    - 驗證層原因：既有 QC 證明 API fail-closed，卻未同時驗證目前 rendered surface 的 action／blocked reason／raw error；因此安全控制成立但使用者流程仍失敗。
    - 系統性根因：UI、domain policy、permission 與 environment capability 分散決策，缺少「可見、可按、可執行、可追溯」的一致性 invariant 與 release gate。

  - 已確認目標生命週期：

    | 資料類型 / 狀態 | 使用者動作 | 目標狀態 | 審核 | 號碼重用 |
    |---|---|---|---|---|
    | 暫用 `part_number_draft` | 既有刪除／回收 | 已刪除／依規則可回收 | 沿用既有規則 | 僅在 controlled-boundary predicate 允許時 |
    | 已領根號且 root／children 全為 Draft／NeedInfo、零受控引用 | `作廢草稿編號` | `Obsolete`／受控歷史 | 免正式審核，但需權限、原因、影響摘要與明確確認 | 永久不可重用 |
    | Active／Released 或既有 `MainDrawingInvalid` formal-responsibility 投影，或存在受控引用 | `申請作廢` | 待審核 → `Obsolete` | 必須依 approval authority | 永久不可重用 |
    | `Obsolete` | 查看追溯 | 終止狀態 | 不適用 | 不可還原、不可回收 |

  - 初步範圍：
    - 先止血：production slice 內未開放的 lifecycle CTA 必須 disabled／inert，顯示人類可理解的「未開放」原因，不得呼叫 mutation；raw error code 不得出現在一般 UI。
    - 生命週期收斂：定義已領號草稿根號與正式根號／圖號／料號各自的終止動作、審核責任、audit、受控歷史與 no-reuse 規則。
    - 能力收斂：後續契約須讓 UI 與 mutation route 使用同一 server-owned capability truth，且 route 仍需重新驗證 company、permission、狀態與 controlled references。
    - 分段開放：草稿根號作廢與正式資料作廢申請分為不同 production gate；未通過的入口保持 `未開放`，不以 broad allowlist 一次開啟。
    - 驗證方向：狀態／引用／角色／production mode 矩陣、原子狀態與 audit、號碼不可重用、direct API bypass、真實 rendered UI visible-error sweep，以及 1440×900、1024×768、390×844。

  - 初步 Out of Scope：
    - 開放 `DELETE /api/numbering/records/[rootCode]/draft`、hard delete 正式編號、sequence reset、號碼回收或重新發出。
    - 直接修改或清理 A0001 等 production business data、遠端 schema migration、production deploy／traffic／smoke、merge／PR／rollback artifact。
    - 改變既有正式作廢 approval authority、重播舊審核、建立假 approval evidence，或讓已作廢資料從一般已刪除區直接還原。

  - UX Intent：
    - 使用者與情境：工程或 PDM 管理者在圖料根號明細判斷「這筆是否仍要使用」。
    - 主要任務：辨識資料仍是暫用草稿、已領號草稿、審核中、正式或歷史，並只看到當下真正適用的終止動作。
    - 高風險預設：正式編號不硬刪、不回收；作廢前顯示 root、part、drawing、關聯與受控引用摘要；前置條件不成立時 disabled 並提供恢復或替代路徑。
    - 不能發生：active-looking CTA 送出後才發現 route 未開放；一般 UI 顯示 raw API／HTTP／machine error；Draft 文案使使用者誤認正式編號可回收。

  - 驗收方向：
    1. UI、server policy 與 route gate 對每個 lifecycle action 給出一致的 allowed／blocked／requires-approval 結論。
    2. 未開放功能可見時必須明確標示、可由鍵盤／觸控理解且 inert；不得產生 mutation request或 raw error。
    3. 符合草稿作廢條件的已領根號整組原子轉為 `Obsolete`，保留原因、操作者、時間、before／after audit，且號碼永久不可重用。
    4. 任一 formal／submitted／approved／revision／manufacturing baseline／BOM replacement 或其他 controlled reference 存在時，不得直接作廢草稿；正式資料只可建立作廢審核。
    5. `Obsolete` 只進受控歷史並可追溯，不出現在一般 active work list，不提供一般還原或回收。
    6. production allowlist 只能開精確必要 route；未列入的 DELETE、approval、obsolete mutation 繼續 fail closed。
    7. 真實 browser 驗證不得出現 visible raw error、unexpected 4xx/5xx、console error、裁切或水平溢位。

  - Human Decision Brief：
    - `HD-077-01 / Accepted / 2026-08-18`：已領 root／children 全為 Draft／NeedInfo 且零受控引用時，採「作廢草稿編號 → Obsolete、免正式審核、永久不回收」。
    - `HD-077-02 / Accepted / 2026-08-18`：Active／Released 或存在需正式責任鏈的受控引用時，一律採「申請作廢 → approval → Obsolete」。
    - `HD-077-03 / Accepted / 2026-08-18`：production 分三個 release slice：A UI 止血、B 草稿作廢、C 正式作廢／審核；每段獨立驗證與授權。
    - Rejected：official allocated root hard delete／sequence reuse、所有草稿一律正式審核、一次開放整個 lifecycle／approval route family。

  - CAPA／PA 追溯：

    | 根因 | CA | PA | 效用判斷 | 驗證證據 | 建議流向 |
    |---|---|---|---|---|---|
    | UI 與 allowlist 分離 | 未開放 CTA 改 inert，補中文錯誤 | 建立 server-owned capability invariant | 低風險先止血，高度降低誤操作 | rendered browser、zero mutation、visible-error sweep | DEV-077／QA plan |
    | 已領草稿根號缺少終點 | 定義作廢草稿編號與 no-reuse | 狀態／引用／審核矩陣成為 domain contract | 保留稽核且不製造號碼重用風險 | transaction、audit、sequence/readback | DEV-077／既有 SPEC amendment |
    | QC 只驗 API 拒絕 | 補 root drawer production-mode case | release gate 加入「可按即必須可執行，否則 inert」 | 以小幅測試成本降低漏檢率 | 三 viewport、DOM、network、console | QA plan／release gate |

  - Spec Impact Preflight：`Intentional replacement accepted / authoritative docs amended`。
    - Scoped replacement：production-slice SPEC 對 root obsolete mutation 的全面封鎖，以及 lifecycle/contextual-entrypoints SPEC 將 allocated official draft-only root 固定導向 delete/cancel 的規則。
    - 保留：正式編號禁止 hard delete／回收、production method-level default-deny、正式資料作廢需審核、受控歷史與 audit authority。
    - 已修訂 lifecycle ADR、lifecycle-actions SPEC、contextual-entrypoints SPEC與production-slice SPEC；focused QA plan為DEV-077受影響驗收authority。
    - ADR：不另建。既有 `ADR-PDM-LIFECYCLE-ACTIONS-001` 已涵蓋詞彙與 backend lifecycle，本輪以同一 ADR amendment 保存 scoped exception，避免雙重 authority。
    - Post-change convergence：實作中若發現 DEV、ADR、SPEC、QA 與 repo fact 不一致，RD 必須停止 mutation 實作，先完成 Spec Impact Preflight、同步全部 authority 並取得 PM 確認；不得以程式碼行為反向覆寫本契約。

  - Current Architecture Impact：
    - 受影響面：official numbering root／child 狀態機、root detail drawer、lifecycle policy、permission、production-slice capability、obsolete API、approval platform、audit／history projection。
    - 不新增主資料身份或 provider；沿用 `part_roots`、`part_numbers`、`drawing_numbers` 的 `Obsolete` terminal state、既有 company scope、permission code、approval request／batch 與 audit authority。
    - `part_number_drafts`、candidate workspace 與尚未配置 official number 的草稿仍由其原有取消／void／recycle authority 管理，不受本 DEV 改寫。

  - Current Phase RD Handoff Contract：
    - 目的：建立 server-owned lifecycle capability，使 `可見、可按、可執行、可追溯` 在 local、staging 與 production-slice mode 共用相同 truth。
    - 主要輸出：root action policy、draft-obsolete transaction、formal-obsolete action-level production gate、drawer／dialog UX、focused QA/QC evidence。

    - Scope：
      - official allocated root bundle 的 draft direct-obsolete；保留 root、children、圖料關係、附件與完整 audit，不刪 row、不釋放 sequence。
      - Active／Released root／child 的 aggregate impact preview、作廢申請、approval decision 與 controlled-history result。
      - root drawer 在各 capability slice 下的 enabled／inert／hidden 規則與人類可讀錯誤。
      - production page、method 與 action-code 三層 fail-closed；generic approval endpoint 不得因 path 被允許而處理其他 action code。
      - SQLite／PostgreSQL 支援路徑中與本 lifecycle transaction 相關的行為一致性。

    - Out of Scope：
      - official root／drawing／part hard delete、sequence 回退或號碼重用。
      - 正式作廢資料直接還原、physical purge、retention job、歷史資料回填或既有錯誤資料修復。
      - 改寫 candidate workspace／`part_number_drafts` 的 recycle policy。
      - 開放 release、CAD、BOM、file provider、import/export 或其他 production lifecycle mutation。
      - merge、PR、deploy、production smoke、rollback 或 release report。

    - Domain / State Contract：

      | Current object boundary | User action | Server transition | Approval | Reuse |
      |---|---|---|---|---|
      | client-only／candidate，尚未配置 official number | 依原 authority 取消／刪除 | 不建立或取消 candidate | 否 | 依 candidate authority |
      | official root 與全部 children 為 Draft／NeedInfo，且 zero controlled reference | `作廢草稿編號` | transaction 內 root／children → `Obsolete` | 否 | 永久禁止 |
      | root 或任一 child 為 Active／Released、root 為 `MainDrawingInvalid` formal-responsibility 投影，或 Draft／NeedInfo bundle 已有受控引用 | `申請作廢` | root-scoped request pending；核准後核定 targets → `Obsolete` | 是 | 永久禁止 |
      | `Obsolete` | 查看受控歷史 | terminal；不提供還原／再次作廢 | 不適用 | 永久禁止 |

    - Draft Direct-Obsolete Contract：
      - mutation admission先由server action guard重驗authenticated user、company scope與permission；進入同一transaction後再鎖定並確認root與全部children皆為Draft／NeedInfo、沒有pending approval、revision package、shared CAD model、manufacturing baseline、replacement、BOM reconfirmation或等效受控引用。
      - controlled-boundary predicate 必須由既有 hard-delete dependency scan 抽成共用 server authority或忠實包裝；不得在 production-slice 另寫較弱判斷。一般附件存在本身不自動阻擋，但不得被刪除或移出關聯；若附件已屬受控 package，應由共用 predicate 阻擋。
      - 成功時只更新 root／children status 與 timestamps，保留 identifiers、relations、files、sequence 與 rows；audit 記錄 actor、reason、company、before／after、target counts 與 capability slice。
      - reason 必填且 server 需驗證明確 confirmation；重複、stale 或競態請求不得產生 partial mutation、重複 audit 或繞過較新的 controlled reference。
      - `DELETE /api/numbering/records/[rootCode]/draft` 不再是一般使用者 lifecycle 入口；production 永久拒絕，UI 不得呼叫。既有 route 的移除／測試相容清理留待 Implementation Ready 決定。

    - Formal Obsolete Contract：
      - 先由 impact read 顯示 root、Active／Released targets、因受控引用而不能direct-obsolete的 Draft／NeedInfo targets、children／relations、warnings 與既有 pending request；reason、scope acknowledgement 必填。
      - `POST /api/lifecycle/obsolete-requests` 只建立 request／batch，不直接改狀態；核准 decision 才套用 `obsolete_part_root`、`obsolete_part_number` 或 `obsolete_ma_drawing`。受控但仍為 Draft／NeedInfo 的bundle只走root-scoped `obsolete_part_root`，不得假借單筆formal action。
      - approval snapshot需保存root intent、target status與controlled-reference摘要；apply時重驗target仍屬同company／root且未被其他流程合法終止，然後把核定的Active／Released或controlled Draft／NeedInfo targets轉為`Obsolete`。
      - production 若開 generic approval decision route，handler 必須先載入 request，僅允許上述 action codes，並再次驗證 reviewer role、company scope、terminal／already-resolved state；其他 approval action 仍回 unopened denial。
      - rejected／needs_info 不得把正式 targets 改為 `Obsolete`；pending request 必須阻止重複建立。

    - API / Capability Contract：

      | Capability | Contract |
      |---|---|
      | Root action policy | server 回傳 domain eligibility、permission 與 environment capability；client 不自行拼裝最終 enabled 狀態 |
      | Draft obsolete write | `POST /api/numbering/records/[rootCode]/obsolete`；reason＋explicit confirmation；只處理 eligible Draft／NeedInfo official bundle |
      | Draft delete compatibility | `DELETE /api/numbering/records/[rootCode]/draft` 不列入 production allowlist，owner UI 不呼叫 |
      | Formal impact | `GET /api/numbering/roots/[rootCode]/obsolete-impact` 或等效既有 read authority |
      | Formal request | `POST /api/lifecycle/obsolete-requests`；production 只允許 root／part／drawing obsolete action |
      | Formal decision | 既有 approval decision API；production 必須 request action-code scoped，不得只做 path-level allow |
      | Denial | stable machine code 留在 API；UI 顯示人類影響與恢復方式，不渲染 raw route／code／stack |

    - Permission Contract：
      - draft direct-obsolete 沿用 `numbering.draft.obsolete` 與 company scope，不新增角色語意；無權限、跨公司與未登入均在 mutation 前 fail closed。
      - formal request 沿用 `obsolete_part_root`、`obsolete_part_number`、`obsolete_ma_drawing`；approval decision 沿用既有 R&D Manager／Admin 或 approval matrix authority。
      - UI capability 只改善可發現性，不取代 route、service 與 repository 的 server authorization。

    - UX Contract：
      - 入口固定在 `/numbering/search` root detail drawer；draft eligible label 為 `作廢草稿編號`，formal label 為 `申請圖料根號作廢`，兩者不得同時 enabled。
      - Gate A 尚未開 write path 時，適用 action 可見但 inert，提供 keyboard／touch 可讀 `未開放` 理由且 network write count=0；不得先送 request 再顯示拒絕。
      - draft dialog 顯示 root code、part／drawing counts、不可回收、將進受控歷史、reason 與 acknowledgement；取消／關閉 zero mutation。
      - formal dialog 顯示 impact preview、approval 結果預期與 acknowledgement；正常狀態保持安靜，完整技術資訊降層到 audit。
      - 成功後 drawer／list 立即反映 terminal state或受控歷史位置；blocked／error 提供可理解原因，不顯示 `feature_not_open_in_production_slice`。

    - Dependencies / Entry Conditions：
      - 既有 lifecycle `Obsolete` status、numbering permission guard、company resolver、aggregate approval platform、audit 與 include-history projection可重用。
      - RD 可直接依本文件的 `RD Implementation Contract` 實作；工程契約已固定實際 module／file、共用 controlled-reference predicate、transaction／lock strategy、error codes、測試命令與 rollout gate。
      - 任一 production mutation 前需完成 local＋staging QA/QC、exact release scope、rollback readiness與 `DEV-032` release decision。

    - Acceptance Boundary：
      - enabled lifecycle CTA 在相同 capability truth 下必有可執行 server path；inert CTA 不發 write request。
      - eligible draft bundle 成功後 root／children 全為 `Obsolete`，rows／IDs／relations／files／sequence 保留，default active list移除，include-history／受控歷史與 audit 可查。
      - mixed status、controlled reference、pending request、缺權限、跨公司、重複／競態請求在draft direct path全部 fail closed且 zero partial mutation；其中controlled Draft／NeedInfo bundle必須能改走root-level approval，不得形成無出口終點。
      - formal request 核准前 status 不變；approved 才 transition；rejected／needs_info／duplicate 不直接異動。
      - production Gate B 只開 draft obsolete；Gate C 才開 formal obsolete request／decision，其他 unlisted methods與 action codes仍 default deny。
      - 1440／1024／390 viewport 的 drawer、dialog、focus、touch、disabled reason、visible-error、console／network與 overflow gate通過。

    - QA / QC Gate：
      - Focused QA authority：`.ai-doc/qa/qa-dev-077-official-numbering-obsolete-production-lifecycle-validation-plan-2026-08-18.md`。
      - 需有 policy／permission unit evidence、SQLite＋PostgreSQL transaction／concurrency evidence、API no-mutation matrix、rendered browser three-viewport evidence與 production-slice simulated allowlist／action-code evidence。
      - P0/P1=0 才能由 Gate A 進 Gate B；Gate B 通過不自動授權 Gate C；production evidence不得以 local simulated mode替代。

    - Stop Conditions：
      - 需要 hard delete、sequence reuse、正式資料直接修復或 production migration。
      - 無法可靠辨識 controlled reference，或只能以 UI status 判定 eligibility。
      - generic approval route 無法 action-code scoped fail closed，會順帶開放 release、submission或其他 approval mutation。
      - 需要改變已確認的免審核 draft obsolete、formal approval或三段 production gate。
      - 任一 browser surface仍顯示 raw machine code、enabled-but-denied CTA或不可恢復的 partial mutation。

    - Evidence Required：
      - contract／spec convergence diff、targeted typecheck／lint／build、focused lifecycle與production-slice tests、DB before／after／audit／sequence readback、browser screenshot／DOM／network／console manifest。
      - 明確環境與 revision provenance；production release evidence只由 deployment release gate產生，本文件不得作為 deploy依據。

  - RD Implementation Contract（2026-08-18）：

    - Readiness verdict：`PASS / No P0-P1 Readiness Gap`。Phase A、B、C 是同一 DEV 的累進實作切片；RD 依序完成並逐段驗證，不得把任一 local pass 解讀為 production 開放。

    - Exact Repository Impact：

      | File / module | Required change |
      |---|---|
      | `src/lib/production-slice.ts`、`.env.example` | 新增 lifecycle gate parser、client-safe capability、page／method／approval-action allowlist；missing／unknown gate預設 containment |
      | `src/lib/db-async-provider.ts`、`src/lib/platform-command-service.ts` | transaction API增加可選`serializable`；PostgreSQL以`BEGIN ISOLATION LEVEL SERIALIZABLE`開始，SQLite維持`BEGIN IMMEDIATE`；command/outbox可傳遞此選項 |
      | `src/lib/pdm-lifecycle-policy.ts` | 增加official root policy builder與`numbering_part_root`；輸出domain action、availability、approval／reason／ack需求、stable reason與人類訊息 |
      | `src/lib/repositories/numbering-repository.ts` | 定義共用dependency summary、root approval targets／snapshot型別；同步SQLite repository忠實鏡像domain predicate與terminal transition |
      | `src/lib/repositories/numbering-async-repository.ts` | 抽出既有draft-delete dependency scan、root／children lock、direct obsolete、impact、request snapshot及approved apply的單一server authority |
      | `src/lib/numbering-async.ts` | direct obsolete與obsolete request接入platform command receipt／outbox，固定command name、payload fingerprint與serializable transaction |
      | `src/app/api/numbering/roots/[rootCode]/obsolete-impact/route.ts` | 回傳policy、dependency summary、approval targets與pending request；計算read、action permission及environment capability |
      | `src/app/api/numbering/records/[rootCode]/obsolete/route.ts` | 嚴格JSON／same-origin／Idempotency-Key、reason、confirmation、permission／company與stable error envelope；只呼叫async command path |
      | `src/app/api/lifecycle/obsolete-requests/route.ts` | 三種obsolete action均要求Idempotency-Key；受控Draft／NeedInfo僅允許root-scoped request；create不改target status |
      | `src/app/api/approvals/inbox/route.ts`、`src/lib/approval-platform.ts`、`src/lib/repositories/approval-platform-async-repository.ts` | Gate C時server端只查legacy numbering的三個obsolete action，filter／summary／cursor都以同一scope計算，不在client事後過濾 |
      | `src/app/api/approvals/requests/[requestId]/route.ts` | detail read先驗company，再於production Gate C只允許obsolete action；其他action回unopened且不洩漏detail |
      | `src/app/api/approvals/requests/[requestId]/decisions/route.ts`、`.../[requestId]/apply/route.ts` | request lookup後、mutation前做obsolete action gate；驗Idempotency-Key、reviewer、company、status；apply-failed retry亦同scope |
      | `src/components/numbering-contextual-entrypoints.tsx` | 移除root status-only delete判斷與DELETE呼叫；消費server policy，實作互斥CTA、inert reason、draft terminal dialog、idempotent POST與humanized recovery |
      | `src/app/approvals/page.tsx` | Gate C顯示obsolete-only審核範圍；其他action filter／write control不渲染；decision／apply保留既有drawer pattern |
      | `scripts/qc-pdm-production-slice-numbering-draft.mjs`、`scripts/qc-pdm-numbering-contextual-entrypoints.mjs`、`scripts/qc-pdm-lifecycle-obsolete.mjs`、`scripts/qc-pdm-numbering-draft-lifecycle.mjs` | 把舊「root draft delete」assertion改為DEV-077新authority並保留DELETE negative regression |
      | `scripts/qc-dev-077-contract.mjs`、`scripts/qc-dev-077-gate.mjs`、`scripts/qc-dev-077-api.mjs`、`scripts/qc-dev-077-postgres-concurrency.mjs`、`scripts/qc-dev-077-browser.mjs`、`package.json` | 新增focused contract／production gate／isolated API／PostgreSQL concurrency／三viewport browser suites與固定npm入口；均以task-owned runtime執行並留存證據 |

      - `src/middleware.ts` 本 DEV 不改名也不加入domain判斷；它只繼續呼叫 `production-slice.ts`。Next.js 16 的 `middleware`→`proxy`框架遷移是獨立維護範圍，不得混入本 lifecycle 交付。
      - 預期不修改 `db/schema.sql`、`db/postgres/*.sql` 或資料 migration；若實作證明必須修改，立即停止，DEV-077退回readiness review。

    - Rollout / Environment Contract：
      - 新增server-only `PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE=containment|draft-obsolete|formal-obsolete`；不得使用`NEXT_PUBLIC_`。
      - `PDM_PRODUCTION_SLICE_MODE=official-numbering-draft`生效時，missing、空值或unknown gate一律解讀為`containment`並default deny；status API可回傳validity但不回傳secret。
      - `containment`只完成Gate A且zero lifecycle write；`draft-obsolete`累進開Gate A+B；`formal-obsolete`累進開A+B+C。非enforced local環境維持完整功能供測試，`PDM_LOCAL_FULL_FUNCTION_VALIDATION`原規則不變。
      - Gate B只增加`POST .../obsolete`；Gate C再增加`POST /api/lifecycle/obsolete-requests`、obsolete-scoped decision／apply與`/approvals`。`DELETE .../draft`永不開放。

    - Root Policy / API Response Contract：
      - `GET .../obsolete-impact` additive回傳`policy`、`controlledReferences`、`approvalTargets`；保留既有`parts`、`drawings`、`links`、`warnings`、`pendingRequestId`與相容的`formalTargets`。
      - `policy.action`只允許`obsolete_draft_official_number`、`request_formal_obsolete`、`none`；`availability`只允許`hidden`、`inert`、`enabled`。
      - policy另含`requiresApproval`、`requiresReason`、`requiresAcknowledgement`、`reasonCode`、`message`；client只渲染，不自行由status／formal child count重算。
      - Direct action只在root＋全部children屬`Draft|NeedInfo`、zero controlled reference、無pending request、permission/company正確且Gate B以上時enabled。
      - Root formal action在root為`Active|Released|MainDrawingInvalid`、任一child為`Active|Released`，或dependency count大於0時成立；所有children必須在`Draft|NeedInfo|Active|Released`集合。`PendingReview|PendingAdminConfirm|Rejected|Obsolete|Merged`等mixed／terminal狀態不得猜測，回inert stable reason。
      - Root approval的`approvalTargets`包含該root下全部非terminal且允許的part／drawing；snapshot保存`schemaVersion=1`、root identity/status、每個target identity/status、dependency IDs／counts與fingerprint，確保核准的是完整aggregate而非部分清單。apply重算時必須排除本次obsolete approval request本身，避免自己的request造成假stale。

    - Data / Migration Contract：
      - `No schema migration / No data backfill / No local-cache migration`。沿用`record_status='Obsolete'`、approval request payload JSON、approval batch、audit log、`platform_command_receipts`與`platform_outbox_events`。
      - 作廢只更新root／part／drawing status與`updated_at`；row、identifier、relation、file asset、revision、sequence及既有audit不可刪除、soft-delete或回退。
      - command receipt／outbox tables是既有platform前置條件；若目標環境未具備既有migration，屬release blocker，不在DEV-077新增替代table或降級為非idempotent write。

    - Transaction / Concurrency / Idempotency：
      - Direct obsolete、root obsolete request與`obsolete_part_root` approved apply使用單一transaction。SQLite由`BEGIN IMMEDIATE`取得write lock；PostgreSQL使用`SERIALIZABLE`，並依company＋root鎖root、parts、drawings rows後才重讀status與dependencies。
      - transaction內至少做兩次安全判定：lock後完整scan，mutation前以同一predicate／snapshot fingerprint再確認；PostgreSQL `40001`／deadlock不得轉500或自動無限重試，回retryable conflict且zero partial mutation。
      - Direct command name固定`pdm.numbering.obsolete_official_draft_bundle`；root／單筆request固定`pdm.numbering.request_root_obsolete`／`pdm.numbering.request_record_obsolete`。相同company＋command＋Idempotency-Key＋payload回原result，不重寫status／audit；同key不同payload回`idempotency_payload_mismatch`。
      - Idempotency-Key沿用`^[A-Za-z0-9._:/-]{1,200}$`且由danger dialog生命週期內重用。already-obsolete的新command回conflict；approval decision／apply以request terminal state＋既有decision唯一性阻止重複套用。
      - `obsolete_part_root` apply必須比對完整target set、expected status與dependency fingerprint；fingerprint重算排除目前approval request ID。任何其他dependency新增／移除、跨root／跨company或狀態漂移回`ROOT_OBSOLETE_SNAPSHOT_STALE`，整筆rollback，不做partial apply。

    - Stable Error / Recovery Contract：

      | Code | HTTP | Human recovery |
      |---|---:|---|
      | `feature_not_open_in_production_slice` | 403 | 顯示「此作廢流程尚未開放」，CTA inert；不得顯示raw code |
      | `idempotency_key_required`／`idempotency_payload_mismatch` | 400／409 | 保留輸入；前者重建有效key，後者停止並刷新policy，不換key偷送不同payload |
      | `OBSOLETE_REASON_REQUIRED`／`NUMBERING_DRAFT_OBSOLETE_CONFIRMATION_REQUIRED` | 400 | 聚焦reason／ack欄位，zero mutation |
      | `NUMBERING_DRAFT_OBSOLETE_HAS_CONTROLLED_REFERENCES` | 409 | 刷新policy並切到root-level`申請作廢`；不重試direct path |
      | `NUMBERING_ROOT_NOT_DRAFT`／`NUMBERING_PART_NOT_DRAFT`／`NUMBERING_DRAWING_NOT_DRAFT` | 409 | 刷新明細／policy，依新狀態改走審核或只讀歷史 |
      | `LIFE_OBSOLETE_ALREADY_REQUESTED` | 409 | 顯示既有pending request並導向obsolete-only審核入口 |
      | `LIFE_OBSOLETE_ALREADY_APPROVED` | 409 | 刷新為受控歷史；不再次寫audit |
      | `ROOT_OBSOLETE_SNAPSHOT_STALE`／`ROOT_OBSOLETE_TARGET_MISMATCH` | 409 | apply標failed且zero partial mutation；重新做impact／建立新request，或修正後由同scope retry apply |
      | `NUMBERING_LIFECYCLE_CONFLICT_RETRY` | 409 | 標`retryable:true`，刷新policy後由使用者重送；client不得自動重播danger action |
      | auth／permission／company denial | 401／403／404 | 不洩漏跨公司target；重新登入、請具權限角色處理或返回清單 |

      - Network timeout後先重新讀policy／impact：若已`Obsolete`或已有pending request即視為完成／已建立，不盲目重送。command仍processing回retryable conflict。
      - Approval apply失敗沿用`apply_failed`，同一transaction rollback business status；Gate C只允許同三個obsolete action的retry apply。Outbox delivery失敗不回滾已完成transaction，由既有outbox監控重送。
      - 此流程不需要補償性hard delete、sequence restore或資料修復；任何需要人工DB write的情況立即停止。

    - RD Sequence and Done Evidence：
      1. Phase A：先完成gate parser、server policy與inert／humanized UI；證明write count=0後才能進B。
      2. Phase B：完成shared predicate、serializable command、direct-obsolete API與history／no-reuse readback；P0/P1=0後才能進C。
      3. Phase C：完成aggregate snapshot、request、obsolete-only inbox/detail/decision/apply及action isolation；其他approval action必須仍403且zero mutation。
      4. 每phase修改後同步四個既有QC script並執行focused suites；不得靠靜態字串assertion取代DB與rendered evidence。

      固定驗證入口：

      - `npm run typecheck:app`
      - `npm run lint`
      - `npm run qc:dev-077:contract`
      - `npm run qc:dev-077:gate`
      - `npm run qc:dev-077:api`
      - `npm run qc:pdm-numbering-api-regression`
      - `npm run qc:pdm-numbering-concurrency-reuse`
      - `npm run qc:pdm-approval-platform`
      - `npm run qc:pdm-production-slice-numbering-draft`
      - `npm run build:isolated`

      `package.json`已新增：`qc:dev-077:contract`→`node scripts/qc-dev-077-contract.mjs`、`qc:dev-077:gate`→production gate parser suite、`qc:dev-077:api`→isolated SQLite API suite、`qc:dev-077:postgres`→isolated PostgreSQL 17 concurrency／snapshot／idempotency suite、`qc:dev-077:browser`→isolated authenticated Chromium三viewport suite；本輪均已執行並保存隔離 evidence。

      Evidence固定輸出`output/qa/dev-077-official-numbering-lifecycle/<runId>/`，至少含manifest、revision／branch、DB kind、gate、fixture、command log、before／after hash、audit／receipt／outbox、concurrency timeline、API matrix、三viewport screenshot、DOM／network／console及verdict。

    - Execution Boundary：本輪已完成 local／isolated product implementation、focused QC、PostgreSQL concurrency、authenticated browser與既有回歸；不得stage／commit／merge／PR／deploy、操作production資料或變更production gate。deployment-release evidence仍需另走 QA／`DEV-032` gate。

    - Release Feasibility Note：新增env為optional且fail-closed，無schema／data migration；release階段仍須由DEV-032確認exact artifact、target gate值、既有platform migration、rollback readiness與live smoke，本文件不提供可執行release artifact。

  - All-Phase Coverage Matrix：

    | Phase | Execution boundary | Document status | Entry condition | Acceptance / exit | Release effect |
    |---|---|---|---|---|---|
    | A UI 止血 | Local／isolated staging implementation complete | `RD Implemented` | contract／UI／production gate checks pass | unopened CTA inert、中文原因、zero write | 無新 mutation |
    | B 草稿編號作廢 | A pass後已實作並驗證 | `RD Implemented` | shared predicate／transaction／API／browser checks pass | eligible draft → Obsolete、no reuse、P0/P1=0 | 只精準開 draft obsolete |
    | C 正式作廢／審核 | B pass後已實作並驗證 | `RD Implemented` | approval action-code isolation／snapshot／regression checks pass | request／decision／history鏈完整、其他 action仍拒絕 | 只精準開 obsolete approval |
    | Production release | `Release Gate Required` | `Future Phase Captured / Not Requested` | local＋staging QA/QC、DEV-032明確納入scope | exact target／artifact／rollback／smoke gate pass | 不自動擴大 canary或功能 |

  - 計入交付：是；DEV-077已達 `RD Implementation Ready / Human Confirmed / RD Implemented`，本機／隔離實作與適用QC完成；production release仍不得由本紀錄自動視為完成。

- ✓ DEV-078 [交付點] [Phase 2 Local RD Implemented / Human Confirmed / Full Aggregate QC Passed] [P1] [Local Implementation Complete / Production Release Gated] 固定責任稱謂與六狀態 UI 投影
  - 摘要：Phase 1已把viewer-relative的「待你處理／等他人處理」改為跨帳號一致的責任資料；Phase 2依使用者決策再把第一層UI收斂為`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`。資料責任、viewer actionability與可用證據不變，角色移到說明層。本DEV不改寫DEV-055／073或Phase 1已完成的歷史證據。
  - 來源 ID：`DEV-PDM-RESPONSIBILITY-STATUS-VOCABULARY-001`
  - 父任務／關聯：狀態父任務`DEV-055`、`DEV-073`；生命週期依賴`DEV-052`、`DEV-053`；authority為`SPEC-PDM-STATUS-UX-004`、`SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001`。
  - 文件成熟度：Phase 1與Phase 2皆為`RD Implemented / Full Aggregate QC Passed`；2026-08-19 Phase 2已完成本機／隔離runtime實作、focused／parent regression、瀏覽器矩陣、entity-detail drawer、typecheck與isolated build。production deployment／release仍須另走release gate。

  - Human Decision Brief：
    1. 本責任流程直接涉及的組織角色只有兩類：`RD`、`RD主管`；其他唯讀或平台角色不列為本流程的處理責任。畫面上的三個名稱是「人工處理責任」，不是三個新的帳號角色。
    2. `負責人`由 RD 擔任，合併既有工作負責人、送審負責人、圖料管理人與主圖維護人。
    3. `審核負責人`由 RD主管擔任，合併所有審核人員稱謂。
    4. `系統管理員`是異常恢復責任，現階段由 RD主管擔任，取代「發布管理人」稱謂；本決策不自行新增或放寬帳號權限。
    5. `DEV-052／053`現行統一整包流程在審核通過後由系統自動正式化，不等待第二次人工發布；只有自動化異常且存在可執行的管理者恢復動作時，才轉為待系統管理員處理。DEV-048既有number-only legacy approval相容語意不由本DEV改寫。
    6. 主要狀態不得因登入者改成「你／他人」。viewer-specific 能力可保留在「我的待辦」、個人化篩選或明細提示，但不得改寫第一層主要狀態。
    7. 同一帳號即使同時具有編輯與審核能力，也由目前流程階段決定唯一責任：送審前或退回後由負責人處理；有效審核工作項存在時由審核負責人處理；不得因 capability 同時顯示兩種待辦。
    8. Phase 2第一層UI只允許六項：`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`。角色責任保留在說明與動作層，不再出現在主要badge名稱。

  - 問題與使用者價值：
    - 「待你處理／等他人處理」對單一觀看者很直覺，但同一筆資料會因帳號不同產生不同截圖，會議中無法直接引用，亦不利於主管追責與跨角色排障。
    - 固定責任稱謂後，狀態成為共享事實；個人是否能操作則降為第二層資訊，避免把「誰在看」誤當成「流程目前由誰負責」。
    - 只顯示角色仍可能稀釋個人當責，因此明細／popover在已有 assignment evidence 時應補充實際負責人姓名與下一步；第一層 badge 仍維持固定角色稱謂。不得只依賴使用者記得自己的角色來防止誤判。

  - 主要流程與顯示契約：

    > 下表保留Phase 1的資料責任與第二層責任語意；目前第一層主badge與visible filter以本節「Phase 2 — Six-State UI Vocabulary」六狀態表為唯一authority。

    | 可證明的目前責任／狀態 | 第一層主要狀態 | 說明 |
    |---|---|---|
    | 未送審、資料待補、退回修正，且存在負責人適用動作 | `待負責人處理` | 包含工作、送審、圖料與主圖維護責任；姓名放第二層 |
    | 存在有效 active review request/work item | `待審核負責人處理` | 是否為目前登入者不改變文案；送審者的可選撤回不改變主責任 |
    | 審核通過且自動發布正常執行 | `系統處理中` | 系統 actor，不是人員角色；不應出現人工 primary CTA |
    | 自動發布有可證明異常，且存在系統管理員恢復動作 | `待系統管理員處理` | 不得把一般處理較久或責任不明誤判為管理員待辦 |
    | 已具可使用證據 | `研發可用`／`生產可用` | 沿用既有 availability evidence，不再套待辦稱謂 |
    | 已作廢、取消或合併 | 既有終止狀態 | 沿用客觀 terminal evidence |
    | 找不到有效責任或審核工作項 | `負責人待確認` | fail closed，不猜負責人、審核人或系統管理員 |

    - 責任轉移主線：`待負責人處理 → 待審核負責人處理 → 系統處理中 → 研發可用／生產可用`。
    - 退回分支：`待審核負責人處理 → 待負責人處理`。
    - 自動化異常分支：`系統處理中 → 待系統管理員處理 → 系統處理中／研發可用／生產可用`。
    - 若審核中發現缺資料，在審核工作項仍有效且尚未退回前，主責任維持「待審核負責人處理」；審核負責人執行退回後才切回「待負責人處理」。

  - 範例判定：
    - A0002、A0003若都在首版資料準備階段，即使一筆指派給目前登入的 RD、另一筆指派給其他 RD，所有人看到的第一層狀態都應是「待負責人處理」。
    - 使用者需要辨識實際承辦人時，由明細／popover顯示「目前責任：負責人（姓名）」；截圖仍能用穩定的角色稱謂溝通。
    - RD主管同時具有編輯與審核能力時，缺資料且尚未送審顯示「待負責人處理」；active review存在時顯示「待審核負責人處理」；不以登入者擁有哪些 permission 直接選擇主要狀態。

  - Current Phase Scope：
    - 圖號、料號、圖料清單與共用明細的主要狀態 badge、popover、狀態篩選字典與 API read projection 語意一致化。
    - 保留 DEV-073 的 actionability／active work-item evidence gate：沒有適用責任動作不得顯示任何「待…處理」。
    - 保留 viewer-specific「我的待辦」查詢價值，但查詢結果中的主要 badge仍使用固定責任稱謂。
    - 顯示「目前責任角色、實際負責人（若有 assignment evidence）、現在發生什麼、下一步、是否由系統自動完成」。

  - Current Architecture Impact：
    - 現況將客觀 `humanStatus`、viewer-relative `viewerStatus`、可見 label與 `needs_action/waiting` 篩選綁在同一投影；只換文字會讓同一 label同時代表不同責任，故本 DEV採 read-contract分離，不改 domain lifecycle。
    - API新增所有觀看者一致的 `responsibilityStatus`，類別固定為 `owner | review_owner | system | system_admin | usable | terminal | unknown`；list、drawer、badge與穩定狀態篩選只讀此欄位。
    - viewer-specific `isMine/canAct/disabledReason` 收斂為 `viewerActionability`；既有 `viewerStatus`在相容期可保留供舊 consumer與 server filter使用，但不得再作第一層可見文案 authority。
    - `availabilityScope`繼續負責 `研發可用／生產可用`；DEV-073的 applicable responsibility action與active review work-item evidence gate維持不變。
    - DB/schema/migration、write API、transaction、approval/publication authority與資料可見性不受影響。回應仍維持 `private, no-store`，因同一 DTO仍含 viewer-specific actionability。

  - Current Phase RD Handoff Contract：
    - 主要輸出：同一 entity/version/company 的 `responsibilityStatus`對所有合法觀看者完全相同；不同觀看者只能在 `viewerActionability`與可執行 CTA上不同。
    - server/domain responsibility resolver必須先依 canonical lifecycle、active work item與適用 responsibility action判定唯一責任，再計算目前 actor是否可處理；client不得用登入者角色、permission或 raw status重算責任稱謂。
    - `role_capability`只能證明 viewer是否可處理共享佇列，不能決定主要責任是「負責人」或「審核負責人」；責任種類由流程階段與工作項決定。
    - 可見狀態優先序固定為：terminal／usable evidence → verified system-admin exception → normal automatic finalization → active review work item → owner responsibility action → unknown。`rd_controlled/released`不得因 owner仍存在而退回待辦。
    - active review缺有效 request/work item時維持 `負責人待確認`；不得猜為審核負責人或系統管理員。自動化處理較久但未達異常證據時仍為 `系統處理中`。
    - 系統管理員責任只接受 formalization/release failure evidence加上既有可適用 recovery action；「系統管理員」是顯示責任，不新增 RBAC role，也不代表所有 RD主管都自動取得 recovery permission。
    - popover/detail的實際姓名只重用目前授權範圍已可見的 assignment資料；無既有可見姓名時只顯示角色，不新增跨帳號個資暴露。正常／可用狀態保持安靜，只有待辦、阻擋或異常顯示可發現的處理／恢復提示。

  - API／Filter Compatibility：
    - 新增 `responsibilityStatus`與 `viewerActionability`為 additive read fields；Phase 1不移除既有 `viewerStatus`、raw fields或既有 route。
    - 工作狀態篩選新增穩定 machine values `owner | review_owner | system | system_admin`，顯示文字與 badge共用同一 vocabulary；`production | rd | availability_unknown | needs_confirmation | history`語意不變。
    - `我的待辦`／`view=mine`依 `viewerActionability.isMine`與DEV-073 evidence gate在 response limit／cursor fill前由server篩選，不成為主要狀態選項。
    - 舊 `needs_action | waiting | ready` query僅保留隱藏相容解析，不再出現在新 UI filter；不得在未完成 consumer inventory前刪除或偷偷改成另一個穩定責任類別。
    - list與detail對同一 entity/version的 `responsibilityStatus`必須deep-equal；API仍沿用既有401／403與company scope，不因狀態詞彙放寬資料或動作權限。

  - Implementation Readiness Assessment（2026-08-18）：
    - 結論：`IMPLEMENTED`；原P0 readiness gap=`0`、P1 readiness gap=`0`，並已依此完成本機Phase 1A～1D。使用者決策、單一責任優先序、相容期、跨actor驗收、完整回歸與release boundary均已落地。
    - repository fact：既有`humanStatus`、`viewerStatus`、`availabilityScope`、owner ID、active approval request、正式圖面exact reviewer IDs、candidate review role-queue permission、`auto_finalizing／recovery_required`及action descriptors足以投影新read contract；不需要新增資料來源。
    - 審核責任差異已封口：正式圖面依既有exact reviewer assignment計算個人`isMine/canAct`；candidate bundle沿用目前RD主管role queue，由active request證明共享`review_owner`、由既有`candidateReview`與適用review action計算個人actionability。不得為本DEV新增reviewer schema或把capability反推成共享責任。
    - Git boundary：目前worktree另有DEV-077等未提交變更，且`package.json`、`src/components/relation-workbench.tsx`有重疊可能；實作已依最小patch完成，後續修復fixture仍須保留既有diff，不得覆寫、清理、stage或提交不屬DEV-078的變更。
    - migration／dependency／env：DB schema、migration、backfill、seed、外部套件、feature flag與環境變數全部為`none`；產品read model與UI採同一build原子切換。

  - RD Implementation Contract — exact repository impact：
    - 新增核心投影：`src/lib/responsibility-status-projection.ts`。集中定義`ResponsibilityStatusProjection`、`ViewerActionabilityProjection`、resolver precedence、legacy viewer adapter及stable／legacy filter matcher；不得在各頁複製責任判斷。
    - 修改既有共用契約：`src/lib/human-status-projection.ts`、`src/lib/pdm-workbench-contract.ts`、`src/lib/pdm-entity-detail-contract.ts`、`src/lib/pdm-detail-status-actionability.ts`。`humanStatus`維持客觀狀態；所有workbench row、detail header與drawing／part projection必填新增兩欄，`viewerStatus`保留相容。
    - 修改server composers：`src/lib/drawing-workbench.ts`、`src/lib/part-workbench.ts`、`src/lib/relation-workbench.ts`、`src/lib/pdm-entity-detail.ts`。每筆先建立與actor無關的responsibility evidence／status，再建立viewer actionability，最後由同一pair產生legacy`viewerStatus`；`view=mine`改讀`viewerActionability.isMine`。
    - 修改legacy read adapters：`src/app/api/parts/route.ts`、`src/app/api/parts/[partNumber]/route.ts`、`src/app/api/numbering/relations/route.ts`、`src/app/api/numbering/roots/[rootCode]/route.ts`。這些route目前自行組裝`viewerStatus`，需補齊新欄位與新filter matcher。workbench list/detail route為service pass-through，原則上只驗證`private, no-store`，若不需改碼不得製造無效diff。
    - 修改shared UI與所有已盤點consumer：`src/components/human-status-badge.tsx`、`src/components/human-status-filter.tsx`、`src/components/drawing-workbench.tsx`、`src/components/part-workbench.tsx`、`src/components/relation-workbench.tsx`、`src/components/pdm-workbench-preview-gallery.tsx`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/components/drawing-projection.tsx`、`src/components/part-projection.tsx`、`src/components/part-detail-content.tsx`、`src/app/numbering/search/page.tsx`。主要badge只吃`responsibilityStatus + availabilityScope`；`viewerActionability`只供popover／action hint／DOM evidence，不得退回讀`viewerStatus.label`。
    - 修改既有回歸：`scripts/qc-dev-055-human-status-projection.mjs`、`scripts/qc-dev-055-human-status-contract.mjs`、`scripts/qc-dev-055-human-status-browser.mjs`、`scripts/qc-dev-073-status-actionability.mjs`；只更新現行程式驗收，不改寫既有歷史QC報告。`scripts/qc-dev-073-browser.mjs`接受`PDM_DEV073_SOURCE_DB`隔離來源，`scripts/qc-dev-073-browser-runner.mjs`負責歷史fixture preflight、唯讀複製與task-owned temp cleanup。
    - 新增focused QC：`scripts/qc-dev-078-responsibility-status-projection.mjs`、`scripts/qc-dev-078-responsibility-status-contract.mjs`、`scripts/qc-dev-078-responsibility-status-browser.mjs`；於`package.json`新增`qc:dev-078:projection`、`qc:dev-078:contract`、`qc:dev-078:browser`、`qc:dev-078`，並將`qc:dev-073:browser`指向可重現的preflight runner。

  - RD Implementation Contract — deterministic mapping：

    | Resolver條件（由上而下，第一個命中即停止） | `responsibilityStatus` | `viewerActionability`來源 |
    |---|---|---|
    | `humanStatus.phase=terminal` | `terminal / 已結束` | `isMine=false, canAct=false` |
    | `humanStatus.phase=usable` | `usable`；第一層文字交`availabilityScope` | `isMine=false, canAct=false` |
    | `formalization_failed／release_status_mismatch`＋非navigation recovery descriptor | `system_admin / 待系統管理員處理` | 依既有recovery permission、enabled action與disabled reason |
    | `finalizing／auto_finalizing`且未符合前項 | `system / 系統處理中` | `isMine=false, canAct=false` |
    | `waiting_review／in_review`＋active request/work item | `review_owner / 待審核負責人處理` | 正式圖面用exact reviewer；candidate bundle用既有RD主管role queue；兩者都須有適用review action |
    | owner類status＋owner assignment或非viewer-specific owner action evidence | `owner / 待負責人處理` | 有assignment時比對owner；role queue只用既有capability計算viewer utility |
    | 以上證據不足 | `unknown / 負責人待確認` | `isMine=false, canAct=false`，保留可理解原因 |

    - owner類status限定`missing_manufacturing_drawing`、`main_drawing_invalid`、`missing_part`、`correction_required`、`data_conflict`、`data_needs_review`、`preparing`、`ready_to_submit`及其canonical state-family等價值；不得把history、refresh、純navigation或任意`phase=waiting`直接算成owner責任。
    - `system_admin`的共享判定不得讀目前actor是否有`publish`；須先存在客觀failure與非`view_*`的canonical recovery action evidence。actor permission只決定`isMine/canAct`。缺recovery descriptor時一律`unknown`，不能只靠`recovery_required`字串猜測。
    - legacy query固定映射：`needs_action`＝人工責任且`viewerActionability.isMine=true`；`waiting`＝人工責任且`isMine=false`；`ready`＝`isMine=true`且客觀phase仍為`ready`。三者只保留URL/API相容，不列入`HUMAN_STATUS_FILTER_OPTIONS`；`system`沿用為stable value。
    - 缺新欄位時client不得fallback成`viewerStatus.label`。開發中以required TypeScript contract一次收斂；runtime若遇未預期舊payload，顯示`負責人待確認`並使contract QC失敗，不以「待你／他人」冒充成功。

  - RD slices and gates：
    1. `Phase 1A — projector + compatibility`：新增共享檔、型別、mapping、stable／legacy filter及legacy viewer adapter；更新DEV-055／073 unit-contract。Gate：RS-01～15 projector matrix、同fixture跨actor responsibility deep-equal、DEV-073 invariant與legacy query全部PASS。
    2. `Phase 1B — server DTO + filter`：接drawing／part／relation workbench、entity detail及四個legacy read adapters；stable與mine filter都在limit／cursor前。Gate：list/detail/root/child additive shape、private/no-store、401/403/company scope、filter ordering與A0002／A0003 API parity PASS。
    3. `Phase 1C — shared UI migration`：badge／popover／filter及全部consumer切新欄位；禁止主要surface舊詞、第二個viewer badge或client-side責任推導。Gate：source contract scan與desktop/tablet/mobile DOM contract PASS。
    4. `Phase 1D — rendered QA/QC convergence`：以隔離DB、free port與至少RD owner／RD主管reviewer／非負責人／recovery actor執行cross-actor browser；產出`output/qa/dev-078-responsibility-status/<runId>/`。Gate：QA-078-01～18、P0/P1=0、console/network unexpected error=0，且task-owned runtime已清理。
    - Phase 1A未PASS不得進1B；1B payload／filter parity未PASS不得切1C；1C source gate未PASS不得宣稱rendered完成。任何production deploy或live data mutation均不在此派工。

  - Exact verification commands（RD完成碼後依序）：
    - `npm run qc:dev-078:projection`
    - `npm run qc:dev-078:contract`
    - `npm run qc:dev-055:projection`
    - `npm run qc:dev-055:contract`
    - `npm run qc:dev-073:contract`
    - `npm run typecheck:app`
    - `npm run qc:dev-078:browser`
    - `npm run qc:dev-055:browser`
    - `npm run qc:dev-073:browser`
    - `npm run build:isolated`
    - 最終聚合：`npm run qc:dev-078`；聚合script須含新focused tests、DEV-055 projection/contract/browser、DEV-073 contract/browser、typecheck與isolated build，任一步失敗即非PASS。

  - Failure／Recovery／Rollback：
    - 本DEV只有additive read projection與UI切換，無資料migration或write side effect；projection／filter／rendered gate失敗時停止於當前phase，保留fixture與manifest，修正後只重跑受影響phase及其後續gate。
    - server DTO與client切換須在同一local build完成；不得留下「部分route有新欄位、部分surface仍讀舊label」的可交付狀態。contract scan任一缺口即阻擋handoff。
    - 本機回復方式是只回退DEV-078範圍source、scripts與`package.json`命令；因`viewerStatus`與舊query仍保留，無DB rollback。不得以`git reset --hard`、整檔覆寫或清理其他DEV dirty changes回復。
    - production rollback／deploy不在本phase；若未來release，沿用deployment release gate與單一artifact回退，不執行資料回滾。

  - Dependencies：
    - `DEV-055 / SPEC-PDM-STATUS-UX-004` 的共用 server projector、badge、filter-before-limit與availability contract。
    - `DEV-073 / SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001` 的actionability、canonical lifecycle與active work-item evidence gate。
    - `DEV-052／DEV-053` 的新整包審核、atomic auto-finalization、`auto_finalizing／recovery_required`與「不得重新引入人工正式發布」authority；它們已明確取代DEV-048對新整包流程的manual publication規則，但不重播或改寫legacy number-only approval。
    - 既有 entity detail action catalog、exact reviewer assignment、owner assignment及formalization recovery action；不另建平行責任來源。

  - Out of Scope：
    - 不新增組織角色、permission、審核決策權、schema／migration或 assignment 資料模型。
    - 不改變審核後自動發布的 domain 流程、retry／recovery策略或正式化 transaction。
    - 不回寫或改寫歷史 audit／snapshot／已完成 QC evidence中的舊文案。
    - Phase 1歷史範圍已修改DEV-078產品碼、UI consumer、相容回歸腳本與package commands；2026-08-19 Phase 2本輪只修改`.ai-doc/`，未修改產品／測試碼、schema、migration、正式／staging資料，不 stage／commit／merge／PR／deploy／release。

  - Acceptance Criteria：
    1. 同一筆資料由 RD、RD主管與其他可見角色查看時，第一層主要狀態文字完全一致；跨帳號截圖可直接比較。
    2. 圖號、料號、圖料清單、共用明細與狀態篩選不再以「待你處理／等他人處理」作為主要顯示文案。
    3. A0002／A0003首版準備情境均顯示「待負責人處理」，個人 assignment只在第二層顯示，不改主狀態。
    4. 送審前缺資料、active review、退回修正、auto-finalizing、auto-finalizing exception各自符合上表唯一責任；同時具編輯／審核能力的帳號也只能看到一個主責任。
    5. 「待審核負責人處理」必須有 active review request/work item；「待系統管理員處理」必須有自動化異常證據與可執行 recovery action；缺少證據時 fail closed。
    6. 正常自動發布顯示「系統處理中，不需人工操作」，不得讓系統管理員誤以為每次核准都要手動發布。
    7. 1440×900、1024×768、390×844 rendered browser驗證 badge、popover、filter與 drawer 文案一致，且無截斷、水平溢位、visible／console／network unexpected error。

  - QA／QC Gate與 Evidence Required：
    - focused QA authority：`.ai-doc/qa/qa-dev-078-responsibility-status-vocabulary-validation-plan-2026-08-18.md`。
    - contract evidence需覆蓋 resolver precedence、role-capability negative cases、list/detail parity、新舊 query compatibility、filter-before-limit、private/no-store與API additive shape。
    - cross-actor evidence需以相同 fixture／entity/version分別由 RD、exact reviewer RD主管、非負責人與具 recovery permission actor讀取；`responsibilityStatus`須相同，`viewerActionability`可依證據不同。
    - rendered evidence需覆蓋圖號、料號、圖料與共用明細，包含A0002／A0003、缺資料、active review、退回、auto-finalizing、verified exception、unknown、usable、terminal及三 viewport。
    - P0／P1 finding必須為0；任何主要表面仍顯示 viewer-relative舊詞、同筆跨帳號主狀態不同、phantom task、無 recovery action卻顯示待系統管理員，均判定未通過。

  - Stop Conditions：
    - 正確區分負責人／審核負責人／系統管理員需要新增 schema、改 assignment ownership、改 permission或改 approval/publication authority時，停止並回 Dev PM升級契約。
    - 同一時點存在兩個合法且不可排序的主要人工責任、平行會簽需同時曝光，或system exception沒有唯一 recovery responsibility時，停止並請使用者決定聚合語意。
    - 任何 consumer把 `viewerStatus.label`當外部穩定 API、移除舊欄位會破壞未盤點整合，或責任姓名需要擴大現有可見範圍時，不得在本 phase直接移除／曝光。
    - 正常自動發布若實際需要人工核准或手動發布，代表產品決策與 runtime不一致，停止並回產品契約，不得以文案掩蓋。
    - 本責任語彙若要套到其他approval domain或DEV-048 legacy number-only path，須先確認該domain是否真的自動正式化；不得把本DEV的system狀態泛化到仍需人工publish的舊流程。

  - 限制與 re-entry trigger：
    - 第一版假設同一時點只有一個主要處理責任；若未來允許平行會簽、多人共同編輯或多個 recovery owner，須回 Dev PM 決定聚合顯示，不得自行堆疊多個主要 badge。
    - viewerStatus相容欄位退役是 future cleanup；需先完成consumer inventory、雙欄位parity與使用者另行要求，狀態為 `Future Phase Captured / Not Requested`。
  - Phase 1歷史基線：DEV-078 Phase 1A～1D local implementation、focused projector／contract／browser、DEV-055／DEV-073回歸、typecheck、isolated build與完整聚合均已通過。

  - Phase 2 — Six-State UI Vocabulary（2026-08-19）：
    - 狀態：`Local RD Implemented / Human Confirmed / Full Aggregate QC Passed / Production Release Gated`。Spec Impact=`Intentional replacement + compatible preservation`；沿用同一DEV，不建立平行DEV。
    - 產品目標：第一層只回答「目前階段、是否需查核、可用範圍」，當責角色改放popover／drawer／action說明。跨actor主狀態與canonical description一致，個人actionability仍可不同。

    | 資料層條件 | UI層名稱 | UI層說明內容 |
    |---|---|---|
    | filter reset | `全部` | 顯示目前所有工作資料；歷史資料需另外開啟「包含歷史」。 |
    | `category=owner` | `編輯中` | 資料尚在建立、補件或修正，由負責人處理。 |
    | `category=review_owner` | `審核中` | 已送審，等待審核負責人完成審核。 |
    | `category=system` | `審核中` | 審核已完成，系統正在自動發布，不需人工操作。 |
    | `category=system_admin` | `待確認` | 自動化處理異常，由系統管理員確認並執行恢復。 |
    | `category=unknown` | `待確認` | 系統無法確認目前責任或有效工作項，請由管理者查核。 |
    | `category=usable`＋scope unknown/none | `待確認` | 已符合可使用階段，但用途範圍證據不足，需確認研發版或量產版。 |
    | `category=usable`＋scope rd | `研發版可使用` | 已受控，可用於研發、試作與設計驗證；不可作為量產依據。 |
    | `category=usable`＋scope production | `量產版可使用` | 已正式發布，可作為採購、製造與量產依據。 |
    | `category=terminal`或客觀phase terminal | `humanStatus.label`精確歷史結果 | 不列入五種工作狀態與visible filter；由「包含歷史」控制，以neutral/archive結果chip顯示。 |

    - UI／filter contract：visible values固定為`all | editing | reviewing | needs_confirmation | rd_available | production_available`；`全部`只供filter，非終止資料列只顯示其餘五項。terminal列顯示exact historical result，不得留白或冒充第七個filter。`我的待辦`與`包含歷史`分別是viewer／temporal scope，不得混入工作狀態。
    - grouping：`editing=owner`；`reviewing=review_owner|system`；`needs_confirmation=system_admin|unknown|usable+scope unknown/none`。相同UI名稱不得反推相同責任：`system`不產生人工待辦，`system_admin`仍須verified failure＋applicable recovery action。
    - presentation contract：`editing=info/play`、`reviewing=info/clock`、`needs_confirmation=warning/alert`、兩種available=`success/check`、terminal result=`neutral/archive`。`status=null`不render；責任、availability、system basis或system-admin recovery證據不完整時fail closed到`待確認`，不得製造phantom task。label／description／tone／icon都不得讀viewer identity或permission。
    - compatibility：canonical URL只使用`humanStatus`與`history=include|exclude`；舊role／availability query依SPEC §19.4正規化；`humanStatus=history→all+history=include`；`needs_action`在支援mine view的頁面轉`view=mine+all`，其餘為all；`waiting|ready|invalid→all`。五個host在initial/reload/deep-link/popstate一致，首次正規化以`replaceState`寫回，不允許hidden legacy predicate或空白select。
    - Current Architecture Impact：新增純read `WorkStatusPresentation`；保留`responsibilityStatus.category`、`viewerActionability`、`availabilityScope`、Phase 1 DTO label、API routes、write flow、permission與schema。primary UI不得直接render舊data-layer label。`NumberingSearchInput`與`PartModuleListInput`新增optional `includeHistory`，undefined保留舊caller行為。
    - Repository inventory：預計直接修改`30 files = 17 source + 12 test scripts + package.json`；17 source分為5個shared authority/component、5個client filter host、5個server filter入口及2個repository query builder。另有4個badge-only consumer只驗證；全體為9個consumer檔、13個badge掛載點、5個filter掛載點。
    - Exact authority：新增`src/lib/work-status-presentation.ts`；修改`src/lib/human-status-projection.ts`、`src/lib/responsibility-status-projection.ts`、`src/components/human-status-{badge,filter}.tsx`。client hosts為drawing／part／relation workbench、numbering search、part detail；server入口為三workbench service與parts／relations兩list API；repository為sync／async numbering repository。完整路徑見SPEC §19.5.2。
    - UI去重：`src/app/numbering/search/page.tsx`移除2處直接render的`availabilityScope.label`；其餘4個badge-only consumer不得新增local label map。現行fluid CSS初判不需改；只有三viewport重現截斷才條件式修改`src/app/globals.css`並更新inventory。
    - Repository filter ordering：`src/lib/repositories/numbering-repository.ts`與`numbering-async-repository.ts`在`includeHistory=false`時都於SQL `LIMIT`前排除`Obsolete/Merged`；兩個legacy list API明確傳true/false。禁止route固定抓100筆後再filter或產生underfill；無schema／migration／index變更。
    - Test inventory：更新DEV-078三支、DEV-055三支、DEV-073兩支、DEV-062 relation一支、DEV-053兩支與entity-detail drawer一支，共12支；`package.json`既有`qc:dev-078`內容必改、命令名稱不新增不改名，且須納入全部required regression與isolated build。
    - prevention gates：static scan必須分類所有active source/test中的legacy `humanStatus` query命中，並解析`package.json`斷言aggregate command DAG完整。DEV-062原`waiting&limit=1`主案例改為canonical `editing`，另測`waiting→all`且不殘留viewer predicate。
    - RD slices：P2-A shared presentation／query matrix／static gate → P2-B五server入口＋兩repository → P2-C shared UI／五host／13 badge points → P2-D四actor×三viewport aggregate。每段fail-fast，server與client必須同一build收斂。
    - Execution evidence（2026-08-19）：`npm.cmd run qc:dev-078`完整聚合PASS，包含DEV-078 projection 42/42、contract 53/53、DEV-055 projection 71/71／contract 13/13／browser、DEV-073 contract／8-case browser、DEV-062 relation、DEV-053 UI 24/24／real-operation 15/15、entity-detail drawer、typecheck與isolated build 124/124；DEV-078 browser evidence=`output/qa/dev-078-responsibility-status/20260819041629-90ff3789/`，DEV-073=`output/qa/dev-073-status-actionability/DEV073-20260819T041838Z-f6a83fac/`，DEV-053=`output/playwright/dev053-real-operation/DEV053-20260819-041911-local-isolated/`。P0/P1=0、task-owned runtime已清理。
    - Failure recovery：無schema/data rollback。失敗時最小回退Phase 2 projector／matcher／consumer patch，保留Phase 1 DTO與legacy fields；不得reset、整檔覆寫或清理其他dirty changes。browser只用temp DB＋free port，結束清理task-owned process並確認其port釋放。
    - Git／Next boundary：17個source與`package.json`可能已有其他未提交diff，RD須先保存scoped inventory並只做最小patch；改產品碼前依`AGENTS.md`讀repository內Next Client Component、URL/search params、Route Handler現行文件。
    - Acceptance：visible options恰為六項且順序一致；主surface無舊角色狀態或`研發可用／生產可用／可用範圍待確認`；資料到UI mapping、terminal result、tone/icon與fail-closed完全符合SPEC；filter-before-limit、history URL/API、sync/async parity、aggregate DAG、private/no-store、401/403/company scope無退化；P0/P1=0。
    - QA authority：`.ai-doc/qa/qa-dev-078-responsibility-status-vocabulary-validation-plan-2026-08-18.md` §11。Phase 1舊run只作回歸基線，不能作為Phase 2 PASS evidence。
    - Stop：若資料無法唯一投影、`審核中`會掩蓋必須人工發布的domain、legacy client把舊label當外部穩定契約，或需改schema／permission／assignment／approval-publication authority，停止並回Dev PM。
    - 本輪邊界：Phase 2已修改authority指定的產品source、回歸腳本與既有`qc:dev-078` aggregate，未修改schema／migration／正式或staging資料、production；暫存runtime皆由套件清理。

  - Spec Impact Preflight：Phase 1取代DEV-055以`current_user／other_user`決定主要可見文案的契約；Phase 2再取代Phase 1以責任角色作主要badge／visible filter的部分。兩次均為`Intentional replacement + compatible preservation`，保留客觀human status、責任category、availability、server projection、private/no-store、DEV-073 actionability與既有權限／lifecycle authority。
  - ADR判定：沿用並修訂既有`ADR-PDM-STATUS-UX-004`，不建立新ADR；同一主題已有跨模組architecture authority。
  - Phase 1 RD Implementation Result（2026-08-18）：`npm run qc:dev-078` 完整聚合 PASS；DEV-078 projection 26/26、contract 32/32、DEV-055 projection 71/71、contract 13/13、DEV-055 browser PASS、DEV-073 contract PASS、DEV-073 browser 8 cases PASS、`typecheck:app` PASS、124 routes isolated build PASS。DEV-078 browser evidence為4 actors × 3 viewports，console/network/overflow PASS。
  - DEV-073 fixture safety：目前主`data/ai-pdm.sqlite`若缺少可用A0005-M01歷史fixture，runner會先檢查`data/backups`／既有QA輸出中的候選SQLite；僅選用通過`rd_controlled`、0.2／0.3／0.5 revisions、P04、drawing number、terminal FFF與A0007 orphan preflight者，複製到OS temp後執行，完成即清理。此次選用`data/backups/20260818-140227/database/ai-pdm.sqlite`，未修改任何來源資料或放寬expected。
  - 計入交付：Phase 1本機RD實作、完整回歸與文件同步已完成；Phase 2已達`RD Implementation Ready`但產品實作與新QC尚未開始。production deployment／release仍受既有release gate管控。

- ◐ DEV-079 [交付點] [Owner-Review Parity CAPA Corrected Locally / Focused QA-QC PASS / Independent Full-Matrix QC Pending] [P1] [Primary Data-Migration-Production Release Human Gated] 圖號唯讀抽屜與全頁編輯工作區分流
  - 摘要：將圖號查閱與圖號 mutation 分成兩種 task mode。清單的右側 Drawing drawer 專注快速辨識、3D／2D 預覽、受控資料摘要與狀態判斷；所有編輯、版次儲存、上傳、送審、審核決策與生命週期寫入，改由狀態導向 CTA 前往 canonical owner workspace。
  - 來源 ID：`DEV-PDM-DRAWING-READONLY-DRAWER-FULLPAGE-EDITOR-001`
  - 父任務／關聯：UI 父任務 `DEV-053`、`DEV-057`、`DEV-067`；action discoverability 關聯 `DEV-072`；檔案與資料 authority 依賴 `DEV-061`、`DEV-064`；共用返回 mechanics 依賴 `DEV-070` 與 `SPEC-PDM-WORKBENCH-CORE-001`。
  - 成熟度：`Owner-Review Parity CAPA Corrected Locally / Focused SQLite + PostgreSQL + Browser QA-QC PASS / Independent Full-Matrix QC Pending / Primary Data + Production Release Gated`。079-A～D既有產品切片保留；accepted-state invariant、跨adapter resolver、受控reconciliation與GET zero-write已在task-owned provider fixtures通過，DEV-101 immutable review parity另由48/48 independent aggregate關閉；尚未把focused證據誤升格為QA-079-01～42完整matrix或production effectiveness。
  - 2026-08-20 density/layout amendment：依使用者紅線回饋收斂 owner workspace 的視覺層級。移除左側預覽 `N 類` 計數與預覽標題列、移除右側候選版次重複圖號；2D／3D tab 同列顯示檔名，取消 tab→圖面與 task tab→編輯器的多餘間距，右側 editor/card 改以內容高度排列，保留檔案清單、上傳入口、版次儲存、智慧辨識與底部生命週期操作列。此為 presentation-only amendment，不改 Drawing／Revision／File／recognition authority、permission、lifecycle 或 submit gate。
  - 2026-08-20 focused browser evidence：`npm.cmd run qc:dev-079:layout-browser` 三 viewport（1440×900／1024×768／390×844）PASS；HTTP 200、2D PNG 置中且填滿 preview frame、紅線對應項目不存在、右欄無重複圖號與受控檔案 metadata、預覽 footer 檔名不存在、horizontal overflow=0、console／request failure／visible alert=0。Evidence：`output/qa/dev-079-layout/20260820020110-browser/`。
  - 2026-08-20 recognition density amendment（歷史切片）：移除智慧辨識分頁 badge、輔助標籤、重複說明／統計／分類標題與內部候選；該輪逐欄操作已由下方 silent auto-recognition amendment 取代。Evidence：`output/qa/dev-079-recognition-layout/20260820012547-browser/`。
  - 2026-08-20 candidate-card redline amendment（歷史切片）：移除可見的`辨識／修正值`、`目前值`與`可信度`文字；逐欄操作曾在該切片保留，現已由下一項 silent auto-recognition amendment 取代。Evidence：`output/qa/dev-079-recognition-layout/20260820013849-browser/`。
  - 2026-08-20 silent auto-recognition amendment：依使用者確認移除 owner workspace 的手動`開始辨識`；每次 candidate upload 成功後 server 以來源集合 ensure session，相同集合重用，頁面進入時自動補建舊檔缺漏並輪詢 queued／extracting。正常狀態只呈現處理中或結果，異常才顯示重試。欄位本身負責定位，無座標顯示來源提示；人工核對改為單一批次儲存與已修改訊號。Evidence：`output/qa/dev-079-recognition-layout/20260820023754-browser/`。
  - 2026-08-27 unresolved part-owner correction：A0044-M01 首次上傳組合檔後的卡住原因，不是缺少下一步按鈕，而是料號屬性候選沒有唯一 `part_number` owner，UI又把它呈現成全域「重新辨識」阻擋，讓使用者無法知道應修哪個欄位。相容修正固定為：`.SLDASM`在同一 session 只有一個合法邏輯料號時可安全自動補 owner；零個或多個合法 owner 時維持 blocked，直接在該欄位以紅框、紅字、圖示、`aria-invalid`及`aria-describedby`指出「尚未指定料號歸屬」，不得再顯示假的全域重新辨識入口。未歸屬候選排除於批次儲存，但其他合法欄位仍可儲存；server對未歸屬候選的accept／correct／map／create等正式意圖回422，defer／ignore仍可用；Drawing送審只依本版次2D＋3D主檔，不因未歸屬辨識候選受阻。未新增schema、migration、route、permission、lifecycle或persistent owner-selection state。Focused evidence：`npm run qc:dev-079:owner-resolution` PASS，report=`output/qa/dev-079-owner-resolution/DEV079-OWNER-2026-08-26T16-49-06-933Z/report.json`；existing authenticated runtime的1440×900／1024×768／390×844 read-only browser evidence確認三個欄位就地紅字、red=`rgb(180, 35, 24)`、`aria-invalid=true`、批次儲存與送出審核均未被歸屬缺口鎖死、390px horizontal overflow=0、console error=0、無mutation request。QA分母增為QA-079-01～29，既有28項不刪減；完整獨立matrix仍待QC，production release仍gated。
  - 2026-08-27 legacy-session CA／PA：根因是上述自動補值只在adapter ingestion完成後執行，2026-08-26既有session的projection read path沒有相同收斂控制；因此正式A0044-P01關聯與料號candidate正確，品名／材質／熱處理仍可保留NULL owner。CA將non-terminal `getProjection`改為transactional self-heal：PostgreSQL先`FOR UPDATE`鎖session，SQLite沿用transaction；只接受同company、同session、恰一個且非`Obsolete／Merged／MainDrawingInvalid`的part owner，重算formal snapshot／fingerprint／group／variant／review state並以`proposed_owner_id IS NULL`確保冪等，terminal session不改。PA把legacy／二次讀取／零／失效／多owner／422／defer／SQLite主資料不變與PostgreSQL雙併發exactly-once納入`qc:dev-079:owner-resolution`，最新report=`output/qa/dev-079-owner-resolution/DEV079-OWNER-2026-08-27T08-40-52-011Z/report.json`；A0044主要環境實頁readback為`需指定料號=0`、console error=0、四個part candidates都指向A0044-P01、foreign key violation=0。release prevention另把`qc:dev-079:contract`接入CI與production verify，Terraform／zero-traffic candidate明確設定並回讀`PDM_DRAWING_RECOGNITION_V1=true`，`qc:production-deployment-pipeline`20/20 PASS。本輪未執行production deploy／traffic；candidate smoke、Level 4、Wave 0與product-owner go/no-go仍須原release gate。
  - 2026-08-27 owner-review parity CAPA重開：A0002-M01的exact relation與native candidates已正確指向A0002-P01，但同session的browser PDF candidates仍以`part_number + NULL owner`進入aggregate，且三筆舊候選已被accept；現行self-heal只處理`proposed／conflict／blocked`，無法修復accepted legacy。這證明GET self-heal是局部containment，不是根治。CA改為所有adapter共用owner resolver、accepted-state command＋provider-safe DB invariant、受控一次性reconciliation及reconciliation後GET zero-write；0／>1 owner fail closed。跨DEV的DEV-101同時保存full immutable recognition projection/version/hash，reviewer不得讀latest補主畫面。完整CAPA與有效性gate見`.ai-doc/qc/qc-dev-079-dev-101-recognition-owner-review-parity-capa-2026-08-27.md`；先前A0044 report只保留supporting evidence，不得宣稱部署後不復發。

  - Human Decision Brief：
    1. `HD-079-01 / 1B`：整個 Drawing／圖號抽屜全面唯讀。可保留預覽、下載、複製與導覽，不得掛載任何 mutation form、file input、dropzone、save、submit、approve、reject、withdraw、obsolete control。Part／Relation drawer 不在本 phase。
    2. `HD-079-02 / 2A`：編輯使用同分頁、獨立 URL、可 hard reload／back-forward 的全頁工作區；不使用 fullscreen modal，不自動開新分頁。進出必須安全保存並恢復清單 `returnTo`。
    3. `HD-079-03 / 3A`：桌面採雙欄＋底部固定操作列；左欄依序是版次與`上傳此版次檔案`，右欄 sticky 顯示 3D／2D 預覽與 readiness，窄 viewport 依相同任務順序堆疊為單欄。
    4. `HD-079-04 / Visual-first amendment`：保留 3A 的全頁雙欄與底部單一生命週期操作列，但取代左右 placement；左側為 2D／3D 大型主視覺，右側為`版次與檔案／智慧辨識`任務分頁且自行捲動，OCR 沿用既有 authority、可定位 2D 證據，但不構成送審 gate。

  - UX／內容契約：
    - Drawer 顯示完整圖號、狀態、3D／2D 預覽、目前版次、受控檔案、關聯摘要與一個 server-derived 主要導覽 CTA；不以分類名稱取代完整圖號。
    - 全頁工作區首列把`建議版次`、`此次版次`輸入與`儲存版次`放在同一列；儲存只建立／更新草稿，不等於上傳完成或送審。
    - 上傳區標題固定為`上傳此版次檔案`。必要／建議說明放在可 hover／focus／touch 的說明浮層：`必要｜主要 3D 模型、主要 2D 圖面`、`建議｜PDF、DWG／DXF`；主畫面刪除常駐「必要檔案齊全後即可送審」。
    - 建議流程可由畫面順序直接讀成`決定此次版次 -> 儲存版次草稿 -> 上傳 -> 預覽／檢查 -> 送審`。Drawer 的`檢查並送審`只能導覽，實際 submit 必須在 full-page owner workspace。
    - 現行 full-page placement 以圖為主：左側一次顯示一個大型 2D／3D preview；右側 task tab 切換版次／上傳與辨識／核對。上傳成功後自動開始或重用辨識工作，進頁自動補建並輪詢；OCR quick review以欄位本身定位證據、單一批次儲存接受／修正，進階歸類／排除／正式寫入導向既有完整核對頁。

  - Spec Impact Preflight：`Intentional replacement + compatible preservation`。
    - 取代：DEV-053 高頻進版／送審留在 drawer、DEV-067 candidate editor inline／same-drawer submit／no route change，以及 DEV-072 drawer action bar 直接執行 Drawing mutation 的 placement。
    - 保留：DEV-061 檔案必要性與 canonical 3D reuse、DEV-064 Drawing／Revision／File 單一資料 authority、DEV-067 server composer／projection、DEV-072 applicable／locked reason truth，以及既有 command API、permission、state machine、audit、submission／publication、idempotency、optimistic concurrency 與 active-review write lock。
    - ADR：不新增。若擴張為全部 PDM drawer、引入新 data／command owner、改變 approval decision authority 或需要新 persistent editor state，回 Dev PM 重做 ADR 判定。

  - Scope：Drawing drawer read-only、狀態導向 navigation CTA、同分頁 visual-first 版次／送審工作區、2D／3D主視覺、右側版次／OCR task tabs、responsive、固定 action bar、精確返回、未儲存保護，以及既有 Drawing／Recognition mutation component 的 placement 收斂。
  - Out of Scope：Part／Relation drawer 全面唯讀化、新 schema／migration／API／permission／lifecycle、production data repair、deployment／release、新分頁、fullscreen modal，以及複製既有 command logic。

  - Acceptance Criteria：
    1. Drawing drawer DOM 對所有 drawing lifecycle state 與 actor 均為 zero-mutation；預覽、下載、複製、唯讀摘要與 canonical navigation 仍可用。
    2. candidate／formal／review 四類 write intent 均只有一個 canonical full-page owner；不存在 drawer 與 full page 雙寫路徑。
    3. 左側圖面與右側版次／OCR任務分層清楚；`儲存版次`與 OCR 均不會被誤認為送審，必要／建議檔案可由可存取說明取得。
    4. keyword／filter／sort／layout／history／cursor／selected row／scroll context 在完成、取消、browser back、hard reload 後安全恢復；`returnTo` 無 open redirect。
    5. 1440×900、1024×768、390×844 驗證 drawer 瀏覽、visual-first 兩欄／單欄、右欄獨立捲動、固定 action bar、keyboard、focus、overflow、最後欄位不被遮蔽與 unsaved guard。
    6. 驗證 readonly、owner、reviewer、admin capability，以及 401／403／404／409／5xx、stale rowVersion、重送 idempotency、active-review lock；畫面無 raw JSON／API／stack。
    7. candidate OCR 使用目前 candidate revision 與其未移除受控 file asset；feature off／403／無結果不阻擋既有版次與送審流程，完整核對／正式寫入不在本頁複製。

  - Current Architecture Impact（實作後）：
    - 079已將candidate／formal editor、Drawing drawer與Drawing review的分散mutation placement收斂；Drawing drawer只保留唯讀投影與canonical navigation。
    - `PdmDetailActionExecution`既有`navigate`型別；`drawing:<id>`作stable canonical identity，legacy`candidate:<workspaceId>`可解析至Drawing，未新增domain authority或migration。
    - `readDrawingWorkbenchLocation`／`writeDrawingWorkbenchLocation`現已保存cursor／page並支援before／after；entity detail已改用surface-aware return normalizer。

  - RD Handoff Contract：
    - Canonical owner route：`/numbering/drawings/[drawingId]/workspace?intent=<intent>&returnTo=<encoded>`，`drawingId`必須是stable Drawing ID；intent限定`edit_revision | submit_review | create_revision | manage_files | withdraw_review | recovery | view`。
    - Canonical reviewer route：`/approvals/[requestId]?returnTo=<encoded>`；只有Drawing-surface exact reviewer在此做核准／退回。Part／Relation approval維持原契約。
    - Compatibility：既有`/numbering/revisions?...`解析後canonicalize或共用full-page shell，不得保留平行command logic，也不得破壞舊deep link。
    - State destination：building／drawing_preparation／correction→edit；bundle_ready→submit_review；in_review owner→view／既有撤回，exact reviewer→request page；auto_finalizing→view；recovery→既有capability owner；rd_controlled／released→create_revision；terminal→history唯讀。
    - Action resolver：`surface=drawing`的edit／submit／withdraw／cancel／review decisions／retry／create revision／manage files只能回`navigate`、locked或omitted；Drawing drawer不得執行`command`／`local`。Part／Relation不變。
    - Rollout：legacy與unified Drawing drawer必須同次zero-write；`PDM_UNIFIED_ENTITY_DETAIL_V1`只能切換唯讀renderer，不新增flag，不允許任何branch繼續drawer write。
    - Data／API：沿用workbench/entity-detail read APIs、candidate/formal revision/file APIs及approval request/decision APIs；若需page BFF只能no-store read adapter。無schema、migration、新permission、新lifecycle或新command。
    - Permission／concurrency：沿用`numbering.drawings.view`、workspace/draft update、submit／withdraw／decide、publish、post-release、attachment與admin-matrix權限；每次write由server重驗exact reviewer、owner、company、active-review lock、rowVersion、idempotency與audit。
    - Return：Drawing只allowlist same-origin`/numbering/drawings`，Approval只allowlist`/approvals`；保存keyword、filters、sort、layout、history、opaque cursor、bounded page、detail、selected row。過期cursor／missing row要可解釋fallback；back／forward／reload／direct URL均可用。
    - UI：桌面左側大型 2D／3D 主視覺、右側至少360px的版次／OCR task panel及其單一內部scroll owner、底部固定 actions；低於約900px依主視覺→任務分頁單欄。單一status badge、恰一個生命週期primary，固定列不得遮內容；必要/建議file規則延用DEV-061。
    - Failure：401 session recovery；403精確能力／聯絡角色；404安全回清單；409 refresh truth並重新確認；partial upload逐檔保留；submit未知結果依idempotency refresh；5xx保留未送出輸入且不露raw error。

  - QA／QC Handoff：
    - QA plan：`.ai-doc/qa/qa-dev-079-drawing-readonly-drawer-fullpage-workspace-validation-plan-2026-08-19.md`；狀態`Focused Evidence Available / Independent QC Pending`。
    - 本輪使用`scripts/qc-dev-079-contract.mjs`與task-owned `qc:dev-079:owner-resolution`；後者保留fixture mutation ledger、SQLite primary invariant與Cloud SQL PostgreSQL provider／concurrency evidence。Playwright CLI與主要環境readback已取得focused browser evidence。
    - 必須有意更新DEV-053 drawing-workbench UI、entity-detail drawer、DEV-067 drawer/navigation、DEV-070 browser及DEV-072 action/browser舊expected；不得刪回歸取得綠燈。
    - Evidence root：`output/qa/dev-079-drawing-fullpage-workspace/<run-id>/`；需含state×actor×viewport、兩drawer branch zero-mutation network、route/return security、pre/post data sanity、screenshots、console/network/visible error與runtime cleanup。
    - PASS gate：QA-079-01～29、P0/P1=0、unexpected drawer mutation=0、duplicate write path=0、visible/console/network unexpected error=0，1440×900／1024×768／390×844全通過。

  - RD Implementation Package（current authority）：
    - Direct-edit inventory：原079-A～D為`26 files = 20 source + 5 test scripts + package.json`；HD-079-04新增3個原boundary外source，現行unique inventory為`29 files = 23 source + 5 test scripts + package.json`。完整檔名與責任以`SPEC-PDM-ENTITY-DETAIL-DRAWER-001`的DEV-079 `RD Implementation Package`為準；工作樹其他dirty檔案不得回溯計入本DEV。
    - `079-A Route／action foundation`：先完成surface-aware safe return、stable Drawing owner/reviewer href、Drawing-only navigate descriptor及entity-detail read adapter；Part／Relation行為必須保持。Exit：contract matrix先紅後綠，Drawing drawer descriptor不再包含可執行command／local。
    - `079-B Canonical full-page owners`：建立Drawing workspace與Approval request page，共用現有candidate／formal revision／approval API及command元件，加入dirty guard、雙欄／單欄與sticky action bar；舊drawer此時仍不得作為可release中間態。Exit：direct URL、reload、401／403／404／409／5xx及required／recommended規則可測。
    - `079-C List-state recovery`：Drawing list補surface-safe `returnTo`、cursor／page URL state、server bidirectional cursor及selected-row focus restoration，修正controller cursorHistory索引與stale cursor URL。Exit：next／previous、back／forward、hard reload與失效fallback全有contract evidence。
    - `079-D Atomic drawer cutover`：同一source freeze將legacy drawings page、candidate workspace drawer、unified Drawing drawer與Drawing approval drawer全部改為zero-write並連到已完成的canonical pages；不得讓flag分支保留任何Drawing mutation。Exit：兩drawer flags、所有state×actor與network method audit均為zero mutation，Part／Relation回歸通過。
    - `079-E QA freeze`：已完成visual-first/OCR contract、候選唯讀抽屜3D／2D同排預覽、歷史版次收合／逐版展開 contract、legacy owner-resolution SQLite／PostgreSQL focused QC、production recurrence gate、typecheck、isolated build與本輪browser evidence；QA-079-01～29完整matrix與既有browser fixture blockers仍須由獨立QC收斂。
    - Rollout／rollback：A～C可在本機分slice提交，但不可個別部署；D與已完成的canonical routes必須在同一release artifact。無DB rollback。任何P0或drawer write殘留，整包回退DEV-079 application artifact／commit set至前一版本，不得只恢復其中一條drawer write path；`/numbering/revisions` compatibility保留。
    - Dirty boundary：目前8個direct-edit files已帶未提交變更（`package.json`、DEV-053 UI script、`globals.css`、`drawing-workbench.tsx`、`number-state-workspace.tsx`、`numbering-candidate-revision-editor.tsx`、`unified-pdm-entity-detail-drawer.tsx`、`pdm-entity-detail-contract.ts`），另2個validation-only source亦dirty（`drawing-projection.tsx`、`pdm-workbench-contract.ts`）。RD逐檔先保存scoped diff/hash，僅在現有working copy上做窄hunk patch；不得checkout/reset、整檔覆寫、stage unrelated change。
    - Baseline（2026-08-19 dirty worktree）：PASS=`qc:dev-067:ui`、`qc:dev-067:navigation`、`qc:dev-072:contract`、`qc:dev-072:api`、`typecheck:app`；FAIL=`qc:dev-053:ui` 23/24（formal filters／linked-part identity）、`qc:pdm-entity-detail-drawer`（candidate identity assertion）。兩個FAIL是DEV-079文件修改前的既有基線，不得歸因本DEV，也不得刪expected；最終QA前必須分辨並關閉或以獨立owner／evidence處置。
    - Definition of Done：原079-A～D direct edits與visual-first UI證據可追溯；all-adapter resolver、accepted legacy reconciliation、command＋SQLite／PostgreSQL DB invariant、GET zero-write、DEV-101 immutable projection parity與固定48案local completion candidate均已完成。Primary schema／21筆repair、A0002既有v1正常退回／重送與production runtime effectiveness仍未授權／未執行，故不得宣稱production recurrence prevention。

  - 風險：`High / P1`。除route／return、duplicate write path與responsive風險外，accepted ownerless candidate與live/latest review leakage會直接破壞審核決策依據。
  - 下一步：local corrective implementation與independent automated effectiveness已完成。下一個合法步驟是重新確認primary inventory fingerprint後，由人類明確授權schema guard與21筆exactly-one reconciliation apply；再走staging rehearsal、zero-traffic production candidate、actual flag readback、Level 4／Wave 0與post-deploy smoke。任何primary／staging／production schema、data apply、writer activation、deploy、release或traffic仍須另走release gate。
  - 阻塞／恢復條件：本機契約修訂無P0/P1 human decision blocker；primary／staging／production資料修復、schema migration與activation均是human gate。若provider-safe invariant需要全面重構polymorphic owner schema、改domain authority／permission／lifecycle或改approval decision semantics，停止並回Dev PM做ADR／scope preflight。
  - 證據：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md` 的 `DEV-079` RD Contract amendment；`.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md` 的 2026-08-19 amendment；`.ai-doc/qa/qa-dev-079-drawing-readonly-drawer-fullpage-workspace-validation-plan-2026-08-19.md`；CAPA `.ai-doc/qc/qc-dev-079-dev-101-recognition-owner-review-parity-capa-2026-08-27.md`；`.ai-doc/documentation_map.md` 的 `DEV-079` entry。
  - 計入交付：產品交付點保留；本CAPA文件與先前focused證據不計完成。root correction、fresh QA、Independent QC與production release分開管控。

- ✓ DEV-083 [交付點] [RD Implemented / Human Confirmed / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Affected Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition] [P1] [Local QA/QC Complete / Production Release Gated] 料號／圖料唯讀抽屜與完整 URL 編輯工作區
  - 摘要：把圖號工作台已驗證的task-mode架構延伸到料號、圖料與其審核情境：drawer只快速閱讀與導覽，candidate、formal與review mutation各自進入唯一canonical full-page owner。共用頁面mechanics與candidate editor，不建立通用domain editor。
  - 來源 ID：`DEV-PDM-PART-RELATION-READONLY-DRAWER-FULLPAGE-EDITOR-001`
  - 父任務：模式基線`DEV-079`；workbench mechanics`DEV-062`；drawer composer／projection`DEV-067`；action truth`DEV-072`；主管／Admin capability`DEV-081`。
  - 成熟度：`RD Implemented / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Affected Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / DEV-067 parent browser 18/18 PASS / DEV-072 accepted-superseded QC disposition recorded / QA-083-24 Closed`。已完成canonical routes、shared page frame、candidate／Part／Relation owner、reviewer target projection、drawer zero-write cutover、safe return與signed bidirectional cursor；`qc:dev-083:contract`、`:api`、最新22-check三viewport authenticated browser與disposable mutation runner通過。最新mutation manifest `output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`已證實31/31 result rows passed、cleanup=removed，涵蓋candidate lifecycle exactly-once／recovery readback、Part／Drawing／Relation Engineer owner/non-owner與Manager／Admin同公司正向、Manufacturing fail-closed、cross-company authority、Relation五種操作、reviewer `needs_info`／reject／approve／scope denial／snapshot drift／retry decision的readback／audit；QA-083-11/12/13/17/18/19已閉合。最新browser manifest `output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`為22/22 checks、browserErrors=0、failedResponses=0。最新aggregate `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為30 child／29 PASS／1 DEV-072 parent baseline FAIL；DEV-072 bounded manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留8項cleanup removed與obsolete marker觀測。另修正cancel payload邊界、Part editor server actionBar gate、審核 retry JSON content type、Part／Drawing API same-company resource guard；`qc-next-app-runner` readiness probe每次2秒可取消，DEV-072 legacy marker wait限縮5秒但不改舊expected。affected lint與`build:isolated`通過；目前工作樹重跑的`typecheck:app`、DEV-079 contract、DEV-070 legacy-owner與DEV-070 browser均PASS；DEV-067 parent browser最新 `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json`為18/18、browserErrors=0、failedResponses=0。QA-083-24已由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`的accepted-superseded QC disposition關閉。

  - 問題／效用／批判：
    - Part／Relation目前在candidate、formal、legacy、unified與approval drawer仍可執行workspace、variant、attachments、relation、lifecycle與review command，與Drawing zero-write模式不一致。
    - 多一次明確導覽換得完整工作空間、可reload／分享／返回的URL、單一command placement與較低誤操作風險；對主資料、關聯與審核決策的淨效用為正。
    - 優雅邊界是「共用mechanics、不共用domain meaning」。`GenericWorkbench<T>`、schema-driven universal editor、跨domain action runner、兩個candidate URL或drawer/page雙寫均視為過度設計並停止。

  - Human-confirmed contract：
    1. Part／Relation drawer全面唯讀；最多一個server-derived primary navigation CTA，preview／copy／download／history／refresh可保留。
    2. candidate aggregate只有`/numbering/workspaces/[workspaceId]`與一份`NumberingWorkspaceEditor`；Part／Relation入口只帶allowlisted return與安全anchor。
    3. formal Part=`/parts/[partId]/workspace`；formal Relation=`/numbering/relations/[rootId]/workspace`；stable ID作route authority，intent／anchor不解鎖permission。
    4. `/approvals/[requestId]`擴為Drawing／Part／Relation exact reviewer workspace；Part／Relation approval drawer也zero-write，decision API／reviewer scope／audit不變。
    5. Drawing現行workspace不在DEV-083重構範圍；未來採共用frame另依QC結果re-entry。

  - Current Architecture Impact（實作後）：
    - candidate：三個candidate mount改為`WorkspaceReadonlyDrawer`，唯一寫入 owner 為`NumberingWorkspaceEditor`與既有workspace APIs。
    - formal：unified／legacy Part projection與Relation projection固定唯讀；variant、attachment、relation mutation只在各自 full-page editor。
    - review：PDM owner approval統一導向`/approvals/[requestId]`，reviewer workspace依server target context呈現Drawing／Part／Relation projection。
    - navigation：Part／Relation ownerHref改stable-ID workspace；safe-return helper增加candidate／Part／Relation allowlist；list API回傳signed previous/next cursor。
    - 既有read／write APIs、permission與server policy足以承接；預期無schema、migration、新permission、新lifecycle或新write endpoint。

  - RD Handoff Contract：
    - drawer action truth仍來自`PdmEntityDetailResponse.actionBar`，但Part／Relation／Approval mutation intent只能回`navigate`、locked或omitted；drawer不得執行`command`。
    - `PdmEditPageFrame`只治理return、identity/status、loading／401／403／404／409／5xx、unsaved guard、focus、responsive與action-dock placement；不得import domain model、switch domain或知道API route。
    - Part／Relation formal editor維持domain-owned；candidate共用唯一editor；reviewer workspace依server owner context組合projection，不建立domain command bus。
    - Read復用workspace、Part／Relation workbench detail、entity-detail與approval request GET；Write復用workspace／candidate、Part／attachment、relation、contextual與approval APIs，payload／audit／lock／idempotency不變。
    - Permission沿用workspace view/update/cancel、draft update、submit／withdraw、attachments、link variant、contextual／publication、exact reviewer與DEV-081 non-owner scope；route／intent只影響placement，不影響authority。
    - returnTo allowlist：candidate=`/parts|/numbering/search`、Part=`/parts`、Relation=`/numbering/search`、review=`/approvals`。Part／Relation additive使用既有server-bidirectional controller能力保存opaque cursor/page，不解碼cursor或client join。
    - Full-page與confirmation依層級只有一個active action owner；modal開啟時底層dock必須不可點擊、不可Tab且不在a11y tree。固定dock不得遮住最後欄位或錯誤。
    - Source direct-edit封口為28 files：新增3 route pages、`PdmEditPageFrame`、candidate／Part／Relation editors與domain-owned `RelationWorkspaceContent`；修改20個既有drawer/workbench/projection/approval/navigation/cursor/style owners。Core controller、contract、cursor、pagination與Drawing workspace預期validation-only。
    - `WorkspaceDrawer`必須收斂為無mutation props的`WorkspaceReadonlyDrawer`；legacy `NumberStateWorkspaceWorkbench`、新版Part與Relation三個candidate mounts同次切換。只改新版兩支即視為083-D失敗。
    - `PartDetailPanel`／`RelationWorkspaceContent`使用`drawer-readonly | workspace-editor` discriminated presentation；`PartProjection`／`RelationProjection`固定read-only。禁止boolean soup與同一write primitive在drawer/page雙mount。
    - Dirty boundary：17個tracked direct-edit檔（含`package.json`）已有pre-existing hunks，`approval-request-workspace.tsx`為pre-existing untracked；另有4個dirty與1個untracked parent test。每檔首patch前保存hunk ledger，只加DEV-083 attributable diff；無法隔離即停止，不得reset／whole-file rewrite／格式化。

  - Current phase DAG：
    - `083-A Route／read contract`：四canonical routes、stable ID、safe return、intent與review owner resolver。
    - `083-B Full-page owners`：輕量frame、single candidate、Part／Relation domain editor與三domain reviewer workspace。
    - `083-C Exact return`：Part／Relation signed bidirectional cursor、URL state、selected row與focus recovery。
    - `083-D Atomic cutover`：candidate／formal／legacy／unified／approval drawer同次zero-write；既有flag on/off都不得保留write。
    - `083-E QA freeze`：focused contract／API／browser與parent regressions。A～C可本機分開完成，但D前沒有可release中間態。

  - Acceptance／QA：
    1. 所有Part／Relation drawer branch的DOM、keyboard、a11y tree與network均zero-write；相同intent沒有drawer／page雙owner。
    2. candidate、formal Part、formal Relation、exact reviewer各只有一個canonical URL，支援direct URL、reload、back／forward、完成／取消與安全返回。
    3. owner、Manager、Admin、exact／unassigned reviewer、readonly與cross-company actor覆蓋candidate／formal／review／terminal；未授權full projection不hydrate。
    4. 401／403／404／409／5xx、stale cursor、missing row、unknown mutation result與partial upload均有可理解恢復，不露raw技術訊息。
    5. 1440×900、1024×768、390×844驗證Part／Relation／Approval完整journey、scroll owner、focus、action ownership、noise／visible-error與overflow。
    6. DEV-062／067／072／079、approval platform、entity detail、attachments、typecheck與isolated build回歸無未歸因P0/P1；Drawing workspace產品面不變。
  - QA plan：`.ai-doc/qa/qa-dev-083-part-relation-readonly-drawer-fullpage-workspace-validation-plan-2026-08-20.md`，狀態`QA Plan Ready / RD Implemented / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Affected Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition`。Exact commands為`qc:dev-083:contract`、`:api`、`:browser`、`qc:dev-083:mutation`與`qc:dev-083`，均已建立；最新browser manifest為`output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`（22/22 runner checks），最新mutation manifest為`output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`（31/31 result rows PASS，含Engineer owner/non-owner與三domain Manager／Admin／non-editor／company partition、cleanup=removed），completed aggregate manifest為`output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`（30 child／29 PASS／1 DEV-072 parent baseline FAIL，`accepted-superseded`）。另有DEV-067 parent browser最新manifest `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json`（18/18、browserErrors=0、failedResponses=0）；DEV-072 bounded manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留8項cleanup removed與obsolete marker觀測；`qc-next-app-runner` readiness probe每次2秒可取消、legacy marker wait限縮5秒但保留舊expected。2026-08-20 QC disposition 已接受replacement並關閉QA-083-24；完整aggregate仍保留baseline failure，不能將舊runner failure改寫成PASS。
  - Baseline（2026-08-20，branch`持續優化2`，HEAD`050eedd4fe963d0f225820facec8d221a1df76ce`）：最新完成aggregate `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`保留1項DEV-072 parent baseline，30 child中29 PASS；DEV-067 browser已由parent runner更新為candidate／unified兼容檢查，最新manifest `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json`為18/18 PASS，涵蓋四viewport、single scroll owner、focus／keyboard與canonical reviewer route。DEV-072 bounded manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留8項cleanup removed與obsolete marker觀測；以`admin@example.com`修正disposable fixture後可啟動，並以5秒bounded wait重現舊runner marker timeout。現行DEV-079已明確將該action placement取代為readonly drawer＋canonical full-page owner，故記為`accepted-superseded`，不宣稱舊runner PASS。`qc-next-app-runner` readiness probe每次2秒可取消，避免transient I/O或過時marker無界掛住；DEV-079 focused contract 22/22、layout 3/3與recognition layout 3/3作為replacement evidence；DEV-067 review scope、DEV-070 legacy-owner／browser、number-state Phase 1B、approval platform、isolated drawing-part-relation view與PDM entity-detail drawer均已重跑PASS；DEV-083 browser hydration-safe-return與DEV-070 legacy cleanup EPERM亦已由focused gate修正。未修改expected或產品資料。QA-083-19已正式PASS；QA-083-24已由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`的accepted-superseded QC disposition關閉。
  - Spec Impact：`Intentional replacement + compatible preservation`。取代DEV-079 Part／Relation out-of-scope、DEV-072 Part／Relation／Approval drawer command placement與DEV-067相衝突的drawer action解讀；保留DEV-062／067架構、DEV-072 action truth、DEV-081 capability與全部domain authority。
  - ADR：修訂既有`ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001`，選擇read-only composer＋light page frame＋domain editors；不新增ADR。Workbench Core是compatible extension。
  - 風險：`Medium`。沒有資料migration，主要風險為雙寫殘留、owner／review route誤導、review scope放寬、返回狀態遺失、action ownership與responsive遮擋。
  - 下一步：QA-083-19的Drawing／Relation owner identity direct path已由最新disposable fixture補齊，`output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`證明31/31 result rows PASS、Engineer owner/non-owner、Manager／Admin、non-editor、company partition與audit actor readback；`typecheck:app`、affected lint、isolated build、DEV-079 contract與DEV-070 browser的非DEV-083歸因gate已解除。DEV-067 parent browser已18/18 PASS；DEV-072 legacy action-discoverability runner的`accepted-superseded` disposition已由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`記錄，QA-083-24已關閉；不得把parent baseline拒絕誤報為舊runner PASS，也不得刪除原始expected。
  - Closure handoff：QA-083-19已正式PASS，disposable fixture補齊Part／Drawing／Relation的Engineer owner、Engineer non-owner、Manager、Admin、non-editor、company與audit actor readback。QA-083-24已由DEV-072 QC evidence-level disposition關閉：保留原始FK／cleanup manifest、fixture修正與obsolete marker觀測，並以DEV-079 contract 22/22、layout 3/3、recognition layout 3/3作現行replacement evidence。不得刪assertion、改expected、換shared DB或把baseline拒絕誤報為舊runner PASS；aggregate仍保留baseline metadata。
  - PM completion audit：`qc:dev-task-completion-audit` 本輪為 6/8；既有 open `DEV-085`、`DEV-065` 與 external blocked `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` 仍未達全域完成。這些不是DEV-083產品證據，亦不改寫為本DEV的PASS／FAIL。
  - 阻塞／恢復條件：目前P0/P1產品決策gap=0。若需要universal editor、同一candidate無法單一URL、stable ID／safe return不成立、任何drawer branch無法同次zero-write、reviewer需全域bypass，或需改schema／permission／lifecycle／production，停止回Dev PM。
  - 證據：主SPEC的`2026-08-20 DEV-083 RD Implementation Contract`；ADR的DEV-083 amendment；Workbench Core SPEC §0B；QA-DEV-083；documentation map的DEV-083 entry。
  - 計入交付：是；本輪完成本機RD實作、focused contract/API、22-check authenticated browser、disposable mutation、typecheck、affected lint與isolated build證據；最新完成aggregate已保留30個child的逐項狀態（29 PASS／1 DEV-072 parent baseline FAIL，`accepted-superseded`），QA-083-19與QA-083-24已完成可追溯closure，QA-083-01～24 matrix PASS；commit與release仍受gate管控。

- × DEV-084 [交付點] [Superseded by DEV-088 / Historical ID Only] [P2] [Do Not Execute] 替代料號附件人工沿用與安靜選擇（歷史大包）
  - 摘要：保留2026-08-20曾形成的替代附件沿用與五表／權限／lease方案作歷史追溯；未交付、不得執行，後續產品意圖與時序全部由DEV-088承接。
  - 來源 ID：`DEV-PDM-REPLACEMENT-PART-ATTACHMENT-REUSE-001`
  - 父任務／既有 authority：`DEV-061`（檔案歸屬與內容共用）；關聯 `DEV-PDM-CHANGE-CONTROL-001`、`ADR-PDM-MATERIAL-IDENTITY-REVISION-001`。
  - 直接 authority：`.ai-doc/specs/SPEC-PDM-PART-ATTACHMENT-REUSE-001-replacement-snapshot-and-part-lock.md`、`.ai-doc/decisions/ADR-PDM-PART-ATTACHMENT-REUSE-001-snapshot-reference-and-whole-part-lock.md`。
  - 文件成熟度：`Superseded / Historical`。2026-08-22決定不把完整DEV-084併入DEV-087；後續再以DEV-088排在DEV-087之後。既有exact schema/API/lease/permission/Phase 1A～1E與QA-084-01～40只保留為歷史設計輸入。
  - 阻塞／恢復條件：DEV-084永久不恢復、不重用ID；所有後續決策、文件成熟度與開發只更新DEV-088。

  - 問題與使用者價值：
    - 舊料號作廢並領用新料號時，多數料號附件仍適用；逐件重新上傳會重工、產生重複檔案，且容易漏件。
    - 系統無法可靠判斷附件內容是否仍適用，因此不建立自動分類或建議規則；由最了解變更內容的使用者一次完成保留、排除與新增。
    - 預設全選可降低高頻情境的操作成本；取消與新增則保留例外處理能力。

  - Human Decision Brief（已確認）：
    1. 系統只提供選擇工具，不判斷附件是否適用；不做安全／需確認／不建議分類、風險分數、內容掃描或類別式沿用規則。
    2. 清單只包含來源舊料號目前有效且直接歸屬料號的附件，進入畫面時全部勾選。
    3. 使用者可取消任一或全部附件，亦可新增新料號專屬附件；取消不影響舊料號原附件，建立新料號也不要求至少沿用一件。
    4. 圖號附件仍由圖號／受控版次 authority 管理，不在料號端重複呈現或選擇。
    5. UI 保持安靜：不顯示「沿用 N 件／排除 N 件／新增 N 件」摘要，不增加一般狀態徽章、風險提示卡或說明型容器；第一層只保留附件清單、勾選控制與新增入口。
    6. 送出時重新確認來源附件仍有效；若已被其他人刪除、替換或失效，停止建立並要求使用者重新確認，不得使用舊快照或靜默排除。重新確認時盡量保留其他勾選與已新增檔案。
    7. 建立替代料號的使用者對沿用選擇負責；系統保存操作者與選擇紀錄，但不增加舊料號負責人或附件專屬的第二次確認關卡。
    8. 新增檔案若與已選附件的檔案內容完全相同，只保留一筆附件關聯；同檔名但內容不同仍允許，系統不得僅以檔名阻擋。
    9. 附件選擇與新增位於建立替代料號的同一流程；任何新增附件或建立動作失敗時，不留下使用者可見的半成品料號或孤立附件，並保留可安全重試的操作內容。
    10. 沿用時一併保存檔案與當下的附件名稱、說明、類別等使用者可見資料快照；建立後新舊料號各自獨立，任一方後續修改不得連動另一方。
    11. 現階段料號附件不設附件專屬角色、上傳／編輯／刪除權限或審核流程；在既有登入、公司／租戶與資料可見性邊界內，能進入該料號情境的使用者均可操作，以最高效率為優先。
    12. 沿用來源必須保存，但正常附件清單不顯示「沿用自舊料號」標籤；只在附件明細、歷史或稽核需要時提供查詢。
    13. 附件可直接修改名稱、說明、類別等資料，也可更換檔案；更換時建立新的不可變檔案版本並只更新目前料號的附件關聯，不得覆寫其他料號正在引用的內容。
    14. 任何可操作該料號的使用者都可立即刪除附件，不顯示確認步驟；刪除只移除目前料號的附件關聯，不影響其他料號引用與既有歷史，系統必須留下操作者、時間與刪除對象紀錄。
    15. 任一使用者進入任何料號資料或附件編輯時，都取得同一個料號級排他鎖；其他使用者仍可閱讀料號與下載附件，並看見目前鎖定者，但不得修改任何料號欄位，也不得新增、編輯、替換、刪除或還原附件。
    16. 鎖定者儲存或取消時立即解除；關閉頁面、連線中斷或長時間無操作時必須自動逾時，避免形成永久鎖定。逾時長度與續租機制由後續 RD 依既有系統慣例收斂，不在 Brief 指定秒數。
    17. 任何可操作該料號的使用者都可從歷史直接還原已刪除附件，不需審核；還原恢復原附件所指向的檔案版本與當時資料，並留下操作者、時間與還原對象紀錄。
    18. 料號附件不受料號生命週期限制；包含已發行、已作廢料號在內，均可新增、編輯、替換、刪除與還原。此自由維護規則不延伸到圖號／受控版次檔案。

  - 概念主流程：
    1. 使用者由舊料號啟動「建立替代料號」。
    2. 系統以單一平面清單顯示舊料號的有效料號附件，並預設全部勾選。
    3. 使用者依實際適用性取消附件，必要時新增新附件。
    4. 送出時重新確認所選來源附件仍有效；若來源已異動，停止建立並回到可重新確認的狀態。
    5. 建立新料號時，系統依當下選擇建立新料號自己的附件關聯；沿用不搬移舊料號附件、不改寫舊歷史，也不複製相同檔案內容。
    6. 建立完成後，新舊料號的附件適用性各自固定；舊料號日後新增、刪除或替換附件，不得靜默同步到新料號。

  - 初始範圍：替代料號建立流程、有效料號附件全選、人工取消、新附件上傳、選擇結果與操作者稽核、相同不可變檔案內容的參照共用，以及所有料號生命週期的附件自由維護、歷史還原與料號級排他鎖定產品規則。
  - 不在範圍：圖號／受控版次附件、圖料根號或其他物件附件、跨料號共用內容的實體永久清除、自動適用性判斷、建立後持續同步、既有附件類別資料品質整治，以及任何本輪技術實作。

  - Current Architecture Impact：
    - 現行`file_assets`把immutable bytes、附件metadata與單一`linked_entity_type/id` owner放在同一列，不能安全表達兩個料號各有獨立刪除／替換／還原生命週期卻引用相同內容；RD契約要求新增binding/version indirection或等價模型，不得以搬移owner或複製bytes替代。
    - 現行part attachment GET/POST/DELETE/restore以`file_assets`owner直接查寫，且write要求`numbering.attachments.manage`；DEV-084有意改為既有登入、same-company/tenant與part visibility邊界內可直接維護附件，但不放寬料號欄位、圖號、BOM或發行動作的既有權限。
    - 現行`item_locks`綁定`submissions.item_id`、預設固定8小時，未見renew/fencing與active unique guarantee；它只能作行為參考，不能直接視為已滿足formal part／persisted draft及所有part-write consumer的whole-owner lease。
    - 現行replacement release transaction建立formal part與`part_replacement_links`；DEV-084須在replacement draft建立時固定attachment decision snapshot，formalization只能promotion/resolution該snapshot，不得重新讀來源最新版。

  - 歷史 RD Implementation Package（2026-08-20 frozen；2026-08-22起非執行契約）：
    - Data：新增`part_attachment_contents`、`part_attachment_bindings`、`part_attachment_versions`、`part_attachment_binding_origins`與`part_edit_leases`；Cloud SQL migration固定`db/postgres/041_part_attachment_reuse_and_edit_leases.sql`，SQLite authority為`db/schema.sql`＋`src/lib/db.ts#ensurePartAttachmentReuseSchema`。`scripts/migrate-dev-084-legacy-part-attachments.mjs`以dry-run預設、明示apply讀storage補算hash並idempotent backfill；legacy part asset ID沿用為binding ID，Drawing rows零改寫，Supabase不是target。
    - Content：same-company`SHA-256 + size`為canonical identity，storage key固定`part-attachment-content/{companyId}/{hash-prefix}/{hash}`；`FileStorageService`回`created/reused`並create-if-absent＋hash驗證。後段失敗可保留UI不可見的verified unbound content供重用，不做可能刪除共享bytes的猜測式compensation。
    - Version/provenance：metadata edit與file replace都insert immutable version；delete/restore只改binding relation state。same-content representative採new upload優先、同層request ordinal最小，所有selected source origins與selected/excluded/new audit仍完整保留。
    - Lease：新增獨立`part_edit_leases`，不重用8小時`item_locks`；TTL 5分鐘、heartbeat 60秒、idle 15分鐘、無grace，raw token只存sessionStorage與DB hash，new acquire遞增fencing。同帳號第二tab無有效token也被鎖。
    - Enforcement：interactive variant／draft metadata／attachment writes要求`X-PDM-Part-Lease-Token`＋`X-PDM-Part-Lease-Version`；controlled review/release/obsolete/status writers不需user token但必須拒絕active human lease。transaction lock order固定canonical owner→lease→review policy→binding/version；PostgreSQL SERIALIZABLE最多3次retry，SQLite BEGIN IMMEDIATE。
    - API：新增replacement candidates、formal/draft edit-lease、attachment history；既有part attachment URL保留並增加PATCH metadata、PUT replace。`POST part-number-drafts`與`POST drawing-revisions/submissions`保留JSON，new files時使用multipart`command`＋`part_attachment_file:{clientKey}`。
    - UI：新`PartAttachmentPanel`與`use-part-edit-lease`切開Drawing `MasterAttachmentPanel`；formal workspace是唯一writable lease session owner，drawer/search只讀。replacement附件留在既有同頁section，不新增wizard、summary/count/badge或第二submit。
    - Flag／rollback：`PDM_PART_ATTACHMENT_REUSE_V1`預設off；additive migration＋兼容reader先行，再按company enable。啟用後不得rollback到不理解binding model的pre-DEV-084 binary；migration rollback採forward fix、不drop新tables。
    - Exact QA：`.ai-doc/qa/qa-dev-084-part-attachment-reuse-and-lock-validation-plan-2026-08-20.md`；40 cases覆蓋schema/backfill/content/version/replacement/permission/lease/audit/browser/回歸，evidence固定`output/qa/dev-084-part-attachment-reuse/{runId}/manifest.json`。

  - 歷史 Current Phase RD Handoff Contract（非當前派工依據）：
    - Logical domain至少分為`CanonicalFileContent`、`PartAttachmentBinding`、不可變`PartAttachmentVersion`、`ReplacementAttachmentDecision`與`PartEditLease`；實體命名留待Implementation Ready，但owner isolation、version restore、provenance與content integrity是不變量。
    - Replacement prepare回active direct part candidates與source token；commit以完整selected/excluded binding/version selection、new multipart uploads與idempotency為輸入。New content先做same-company deterministic canonical ingestion，server重驗來源後再於serializable transaction原子保存draft aggregate、target snapshot與audit；stale回409並保留browser session中未受影響的selection/files。
    - 同一target owner對同一immutable content最多一個active binding；檔名不參與duplicate判定。同內容可參照既有canonical content，不增加physical bytes。
    - Metadata edit與replace建立目標自己的可還原版本；delete只soft-delete目前binding且不確認，restore恢復確切content+metadata version。所有事件保留actor/time/target/source，正常UI不顯示provenance。
    - Formal part以stable part ID、persisted draft以stable draft ID取得whole-owner lease；所有server-side part field與attachment mutations驗證opaque lease token與fencing。讀取／下載不鎖定；save/cancel release，disconnect/inactivity由expiry回收。
    - UI沿用替代料號同頁與compact料號文件清單，只保留flat rows、checkbox、新增與必要row actions；不新增件數摘要、來源badge、風險分類、說明卡或附件專屬submit。

  - Execution Boundary：DEV-084已被DEV-088接替且不得進入RD；不得以歷史契約建立041、五個`part_attachment_*／part_edit_leases` tables、feature flag、compat reader、replacement snapshot或whole-part lease。DEV-087只沿用現行附件authority並直接承接獨立即時語意。
  - 風險：若未來恢復仍為High，因其會同時改變attachment authorization、資料owner representation與所有part writes的concurrency boundary；恢復前必須先縮編並重新完成Spec Impact與QA readiness。

  - 驗收方向：
    1. 所有符合範圍的舊料號有效附件均出現且預設勾選；圖號附件不出現。
    2. 取消只排除新料號關聯；新增只歸屬新料號；舊料號附件與歷史保持不變。
    3. 沿用不產生重複檔案內容，且新料號建立後不受舊料號附件異動影響。
    4. 系統不替使用者做適用性判斷，介面不呈現件數摘要、風險分類或多餘提示。
    5. 來源附件在送出前失效時，系統不得靜默建立不完整結果；使用者可重新確認並重試，而不必重做未受影響的選擇。
    6. 相同檔案內容不產生重複附件關聯；同檔名不同內容不被誤判為重複。
    7. 建立或新增附件失敗時，不留下可見半成品；正常流程也不增加附件專屬審核關卡。
    8. 沿用附件保留建立當下的使用者可見資料，且新舊料號任一方後續編輯不影響另一方。
    9. 可存取該料號的使用者均可上傳、編輯與刪除附件，不出現附件專屬權限或送審阻擋；操作者仍須可追溯。
    10. 日常附件清單不增加來源標籤，明細、歷史或稽核仍可查明沿用來源。
    11. 更換檔案只改變目前料號的附件，其他料號引用與歷史內容保持不變。
    12. 刪除不需確認且立即從目前料號移除，但不得刪除其他料號仍在使用的內容，並可從操作紀錄查明誰在何時刪除哪一附件。
    13. 任一料號資料或附件進入編輯後，其他使用者不能修改整個料號；第二位使用者必須看見鎖定者，但仍可閱讀料號與下載附件。
    14. 儲存、取消、離線、關頁或閒置逾時均能解除鎖定，不會留下永久無法編輯的料號。
    15. 任何可操作該料號的使用者都能從歷史直接還原已刪除附件，不需審核，且還原行為可追溯。
    16. 已發行與已作廢料號仍可自由新增、編輯、替換、刪除及還原料號附件；圖號／受控版次檔案維持原管制。

  - Stop conditions：若必須動態繼承、搬移來源owner、複製相同bytes、跨company查找內容、修改Drawing/Revision authority，或無法讓所有part writes共用stable-owner lease與fencing，立即停止回Dev PM；replacement draft／attachments／audit無法形成atomic或可補償business operation時亦不得局部交付。
  - Evidence required：後續至少包含binding/content/version資料契約、source stale與idempotency API、same-company/cross-company/anonymous permission matrix、double acquire/renew/expiry/stale writer concurrency、audit重建，以及1440×900／1024×768／390×844 rendered browser UX與keyboard/focus證據。
  - RD re-entry trigger：不適用；DEV-084不再重開。相同產品意圖只由DEV-088在DEV-087本機RD／QA／QC完成後重新封口contract。
  - Spec Impact Preflight：`Intentional execution supersession`。2026-08-22取消原`RD Implementation Ready`執行資格；DEV-061現行料號附件authority與`numbering.attachments.manage`規則繼續有效，直到未來經核准的新契約明確取代。
  - 下一步：無；轉DEV-088。不得直接從歷史Phase 1A開始。
  - 證據：主SPEC §5～18、Accepted ADR、`.ai-doc/qa/qa-dev-084-part-attachment-reuse-and-lock-validation-plan-2026-08-20.md`、DEV-061／change-control target amendments及documentation map entry。
  - 計入交付：否；未交付歷史ID，由DEV-088作為新的獨立交付點計算。

- ◐ DEV-080 [交付點] [RD Implemented Locally / Human Confirmed / DEV-080 Focused QC Passed / Existing Baseline Findings Recorded] [P1] [Local Implementation Complete / Production Release Gated] 全系統第一層狀態可見性與例外分層
  - 摘要：在DEV-078六狀態主要投影之後新增surface-aware visibility authority。每個list/card/drawer header固定`1 primary + 0..1 exception`；正常、成功、重複與技術資訊降到可及popover／drawer，阻擋、錯誤、衝突、資安與缺必要條件留第一層。
  - 來源 ID：`DEV-PDM-STATUS-VISIBILITY-POLICY-001`
  - 父任務：`DEV-055`、`DEV-078`；關聯`DEV-049`、`DEV-062`、`DEV-068`、`SPEC-PDM-STATUS-UX-003`、`SPEC-PDM-STATUS-UX-004`。
  - Maturity：`Local Implementation Complete`；2026-08-19 QA scope re-audit的4個P1與2個P2已轉成精確context/scope/file/route/test契約，readiness P0/P1=0；Spec Impact=`Compatible extension + Intentional presentation refinement`；Human Decision gap=0；風險Medium。
  - Human-confirmed product rules：
    - 主要UI仍為`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`，不新增第七種work status。
    - `缺製造圖`、發布失敗、資料衝突、安全／權限／法律待確認等會改變決策的例外不得hover-only。
    - `關聯完整`、正常同步、成功與重複狀態預設降層或隱藏；若該surface專門比較此軸，才能保留compact comparison。
    - 第一層最多一個例外；多例外依severity排序並聚合，detail保留完整原因、責任與下一步。
    - hover必須有focus、click/touch、Escape與focus return；public/read-only、page error、audit/history不得依賴hover。
  - Current Architecture Impact：
    - 現有23個`StatusDisplayContext`擴為25個：新增`recognitionStatus`與`recognitionReviewStatus`；既有`terminal/abnormal/actionable`metadata保留，`status-visibility-policy.ts`依surface產生`primary/exception/detail/hidden`，不改domain facts。
    - 現有20個status scope擴為22個：新增`bomCreate`與`drawingRecognition`；補`approvalInbox/accountList/invitationList` active掛載，component-hosted route依SPEC §5.1繼承，`numberingRequest/numberingDraftList`只作alias/retired治理。
    - `StatusSignalGroup`與既有`StatusBadge/HumanStatusBadge`共用registry；page-local map/raw fallback必須收斂或留下可測例外理由。
    - DB/schema/index/migration/backfill、API、permission、assignment、lifecycle、write flow、filter-before-limit與cache contract全部不變。
  - Repository inventory：
    - 全系統母體：42個page route逐條有disposition；19個page直接承載status只作census；component-hosted workbench由route/child雙向追蹤；13條status axis不合併。
    - Required source=`30`：2 new + 28 modify，分為shared policy 8、PDM list/relation/file 6、workflow/BOM/transfer/recognition 12、admin 2、task/public 2。
    - Required test/QC=`27`：3 new DEV-080 scripts + 24 affected existing scripts；另修改`package.json`建立`qc:dev-080*`並納入DEV-060、071、079、task-center與public-share regressions。
    - Direct-edit total=`58 files = 30 source + 27 test/QC + package.json`；另43 validation-only source、1 conditional `src/app/styles/responsive.css`。
    - 完整檔名、42-route disposition與逐檔責任以`.ai-doc/specs/SPEC-PDM-STATUS-UX-005-first-layer-status-visibility-policy.md` §9.1／§10為唯一authority；數量不是凍結成功指標，consumer差異必須更新manifest與本索引。
  - RD slices：
    - `080-A Shared authority`：policy、signal group、metadata、兩個recognition context、兩個新scope、三個active scope gap及projection/contract/browser prevention gates。
    - `080-B PDM`：relation complete降層、missing drawing固定可見、legacy drawings多badge與attachment例外聚合。
    - `080-C Workflow`：approval、review context、BOM create/workbench、lifecycle、transfer與recognition三surface收斂，不得隱藏人工阻擋。
    - `080-D Admin`：accounts、invitations、privacy/security exception與scope help。
    - `080-E Aggregate`：42-route disposition、四actor×1440/1024/390、list/card/drawer/form/public-readonly；`qc:dev-080`完整PASS。
  - QA/QC Handoff：`.ai-doc/qa/qa-dev-080-system-status-visibility-validation-plan-2026-08-19.md`。PASS gate為P0/P1=0、critical/security/blocking hidden=0、raw status=0、badge wall=0、inaccessible critical explanation=0、unexpected visible/console/network error=0。
  - Failure/Recovery：本DEV無資料rollback；失敗只最小回退DEV-080 presentation/component/tests。不得清理其他dirty changes；temporary runtime必須使用free port、隔離資料並在finally清理。
  - Stop conditions：需要改schema／assignment／permission／lifecycle、阻擋只能由client猜測、兩個critical例外無法安全聚合、public/read-only只能靠hover理解，或需移除audit／法規證據時，立即停止回Dev PM。
  - 下一步：由各既有DEV owner修復DEV-060／DEV-068 fixture與更新退役API的UX hierarchy QC後重跑full aggregate；production deploy/release另走既有gate。
  - 證據：`.ai-doc/specs/SPEC-PDM-STATUS-UX-005-first-layer-status-visibility-policy.md`、`.ai-doc/qa/qa-dev-080-system-status-visibility-validation-plan-2026-08-19.md`、amended `ADR-PDM-STATUS-UX-004`與`.ai-doc/documentation_map.md`。
  - 計入交付：是；本機產品實作與DEV-080 focused gates完成，完整跨DEV fail-fast aggregate與production/release仍維持獨立gate。

- ◐ DEV-081 [交付點] [Local RD Implemented / Human Confirmed / Focused QA Passed / Disposable Mutation QC Pending] [P0] [Production Release Gated] 工程師、主管與系統管理員跨負責人編輯
  - 摘要：以單一server policy讓`Engineer`、`R&D Manager`與`Admin`可編輯同公司任一非本人負責的圖號、料號、圖料根號／關聯與BOM，並使清單、明細、canonical workspace與mutation API一致。
  - 來源 ID：`DEV-PDM-SUPERVISOR-EDIT-SCOPE-001`
  - 父任務：`DEV-052`、`DEV-060`、`DEV-062`、`DEV-067`、`DEV-079`；關聯`DEV-068`。
  - Spec Impact：`Intentional replacement + compatible preservation`。使用者本輪明確取代candidate owner-only mutation及原送審者限制，並授權主管／Admin執行其action permission涵蓋的取消、撤回、審核與發行；新增`rd_manager` publication permission migration，不改identity、owner assignment或lifecycle state machine。
  - 風險：High。這是跨四領域的寫入授權變更；必須同時驗證positive、negative、cross-company、locked-state、permission-denied與audit／owner不變。
  - RD slices：新增共用edit-scope policy；接Drawing／Part／Relation workbench與entity detail；確認number-state write scope與OCR共用；明確收斂BOM；補focused contract與受影響回歸。
  - 下一步：在disposable DB/runtime執行主管取消／撤回／審核／發行與audit／owner不變mutation matrix；不得寫入shared／staging／production business data，不得deploy／release。
  - 2026-08-19 evidence：DEV-081 contract、typecheck、affected ESLint、isolated build、DEV-079、DEV-072、Part、Relation與production pipeline均PASS；共享3000只讀browser確認Manager／Admin可進A0002全頁編輯與選檔。2026-08-20 policy amendment：Engineer 同公司非 owner 也可進入可變更狀態，BOM creator／submission owner filter 移除；送審內容的讀取 scope 維持獨立限制。新矩陣的BOM policy contract、typecheck與affected ESLint已重跑PASS；BOM舊suite仍受fixture／3130前置阻擋。
  - 證據：`.ai-doc/specs/SPEC-PDM-SUPERVISOR-EDIT-SCOPE-001-manager-admin-nonowner-edit.md`、`.ai-doc/qa/qa-dev-081-supervisor-nonowner-edit-scope-validation-plan-2026-08-19.md`。
  - 計入交付：是。

- ✓ DEV-063 [交付點] [本機 RD/QA/QC 完成 / Human Confirmed] [P1] [Local Only / Production Release Gated] 編號、圖號、料號與圖料根號使用者詞彙統一
  - 摘要：將「保留號」、「候選」與號碼效力分類從使用者可見語言移除；建立動作依頁面使用「建立編號／建立圖號／建立料號／建立圖號與料號」，物件名稱只使用「編號／圖號／料號／圖料根號」，同根料件區塊使用「同根料號」，改以流程狀態、操作限制、說明與 CTA 表達下一步。
  - 來源 ID：`DEV-PDM-NUMBERING-IDENTITY-VOCABULARY-001`
  - 父任務：`DEV-062`；關聯 `DEV-053`、`DEV-052`、`DEV-055`、`SPEC-PDM-STATUS-UX-003`。
  - 下一步：本機 RD/QA/QC 已完成；若要進入 staging／production，另依 deployment release gate 做資料範圍、backup、migration、deploy 與 release 決策。
  - 阻塞／恢復條件：本 phase 不要求 audit／immutable evidence 保存；若後續實作發現人類文字與 machine code 無法分離、需要改狀態機／權限／authority／舊 URL，或要求 production migration，立即停止回 Dev PM。既有 dirty `src/components/number-state-workspace.tsx` 變更已保留。
  - 證據：inventory 命中 26 個產品 source、20 個 QC／real-operation script、34 份文件；已完成 scoped `rg` 零殘留掃描、10/10 vocabulary rewrite QC、TypeScript、lint、numbering lifecycle regression、request equivalence、status scope、production-slice 與 1440／390 瀏覽器驗收。runner dry-run 掃描 16 個欄位、1031 筆資料，變更 0 筆。
  - 計入交付：是。

  - Human Decision Brief：
    1. 物件名稱只表達 identity：`編號／圖料根號／料號／圖號`；不以 `保留號／候選圖號／正式圖號／正式料號` 作為物件名稱；同根料件區塊固定使用 `同根料號`。
    2. 狀態獨立表達：`編輯中／送審中／審核中／已發布／已取消`；依 `1C` 不再顯示 `預覽／已保留／正式／已釋出` 號碼效力軸，必要限制改由流程狀態、禁用原因、說明與 CTA 表達。
    3. 已確認的使用者入口 mapping：料號工作台使用「建立料號」、圖號工作台使用「建立圖號」、圖料工作台使用「建立圖號與料號」、無明確 domain context 時使用「建立編號」。
    4. `reserved`、`candidate`、`official`、`?tab=reserved`、`?tab=drafts` 與既有 API／audit／repository machine 識別維持；舊 URL 維持 zero-write compatibility，5C 可改寫其中的人類可讀文字。
    5. 2026-08-11 使用者以 `1C / 2C / 3B` 明確要求：移除所有號碼效力顯示、改寫歷史與儲存內容、使用者介面完全移除「候選」。此決策取代第 1～2 項中相衝突的顯示範圍；本 phase 尚無稽核要求，5C 直接納入。
    6. 2026-08-11 使用者選擇 `4A / 5C`：流程狀態保留「編輯中／申請中／送審中／審核中／已發布／已取消」，限制以白話與 disabled CTA 表達；本 phase 尚無稽核要求，接受 5C 直接改寫儲存的人類可讀文字，不另保存原始 audit／snapshot 文案。此決策不等於改寫 machine code、ID、hash、狀態值、權限或 authority。

  - 問題與使用者價值：
    - 現行介面把資料生命週期誤當成物件名稱，使用者必須先理解「保留號／候選／正式」才知道自己正在處理哪個圖號或料號。
    - 「建立圖號」進入後又顯示「建立保留號」，造成同一流程出現兩套名稱。
    - 完成後，使用者應先看到穩定的圖號／料號 identity，再從流程狀態、限制與下一步判斷能否繼續作業。

  - 開發範圍：
    - [x] 更新 `src/components/number-state-workspace.tsx` 的建立入口、modal、empty、error、success、drawer、confirmation、ARIA label、搜尋與狀態說明。
    - [x] 更新 Part／Drawing／Relation workbench、dashboard、lifecycle、upload、approval、handoff、transfer package、production-slice blocked 與查無資料導引。
    - [x] 檢查並重標 `候選圖號／候選料號／候選圖料號／正式圖號／正式料號／正式圖料根號`，並完全移除使用者可見的「候選」；以「首版準備／關係待處理」等任務語言取代。
    - [x] 更新 `status-display.ts`、`status-scope-display.ts` 的物件名稱、流程狀態、help title 與 scope label；移除 user-facing 號碼效力軸與「候選」詞，改由流程限制與 CTA 明示不可執行的動作。
    - [x] 更新所有依賴舊 visible copy 的 QC、browser real-operation、request-equivalence、change-control 與 static contract scripts。
    - [x] 更新 active `documentation_map.md`、`dev_task.md`、相關 SPEC／ADR／QA contract；2026-08-12 再將 `主根號` 改為 `圖料根號`、`同主根號料號` 改為 `同根料號`；歷史 QC report 與 archived evidence 不直接改寫。

  - 主要影響檔案群：
    - 共用核心：`src/components/number-state-workspace.tsx`、`src/lib/status-display.ts`、`src/lib/status-scope-display.ts`、`src/lib/production-slice.ts`。
    - 工作台與導引：`src/components/part-workbench.tsx`、`src/components/relation-workbench.tsx`、`src/components/drawing-workbench.tsx`、`src/components/part-detail-content.tsx`、`src/components/dashboard.tsx`、`src/components/dashboard/layout-parts.tsx`、`src/components/lifecycle-ux.tsx`。
    - 流程與模組：`src/app/upload/page.tsx`、`src/app/approvals/page.tsx`、`src/app/handoff/layout.tsx`、`src/app/production-slice-blocked/page.tsx`、`src/app/numbering/search/page.tsx`、`src/app/numbering/drawings/page.tsx`、`src/components/transfer-package-workbench.tsx`。
    - Identity fallback：`src/components/numbering-candidate-revision-editor.tsx`、`src/app/api/numbering/relations/route.ts`、`src/app/numbering/revisions/page.tsx`、`src/components/numbering-contextual-entrypoints.tsx`、`src/app/api/lifecycle/controlled-history/route.ts`。
    - 相關文字：`src/lib/privacy-notice-content.ts`、`src/app/privacy/page.tsx`；僅調整「正式領號」等流程稱呼，不改告知內容的資料處理範圍。

  - 驗收方向：
    1. 三個工作台的建立入口分別顯示正確的「建立料號／建立圖號／建立圖號與料號」，通用情境才顯示「建立編號」。
    2. 使用者可見的物件名稱與流程文案不再出現「保留號」、「候選圖號」、「候選料號」、「正式圖號」、「正式料號」或 `預覽／已保留／正式／已釋出` 號碼效力分類；流程狀態仍可獨立查閱。
    3. 對受限制的流程，首屏或 detail 仍以白話說明「目前不能執行製造／採購／交接」等必要限制，並由 disabled CTA 或下一步導引可驗證；不得因移除效力標籤而隱藏治理限制。
    4. 舊 `?tab=reserved`、`?tab=drafts` bookmark 仍可讀取並 zero-write 導向單頁工作台，頁面不恢復舊頁籤或舊名稱。
    5. 共用建立流程、審核、撤回、取消、發布、正式化、交接與技轉包流程的行為不變；只改 user-facing vocabulary 與 5C 人類可讀儲存投影，machine identity、狀態機與 authority 不變。
    6. 1440×900、1024×768、390×844 無裁切、重疊、水平溢位、visible error 或 ARIA label 殘留舊名稱。

  - 限制與不在範圍：依 `2C/5C`，歷史／儲存內容改寫與必要 local migration 進入 scope；不得改號碼值、狀態機、permission、approval authority、publication authority、API payload shape、machine audit code、repository internal names 或舊 route query。5C 只改寫已辨識的人類可讀 label／description／title／help／history reason 字串；不改 ID、enum、code、hash、timestamp、numeric value 或 command semantics。一般「資料已保留／表單已保留／檔案已保留」只有在確認為 domain 詞彙時才修改。
  - 風險等級：High / P1。風險包含共用元件與全域流程文案、移除效力語意造成安全限制遺失、歷史／儲存內容改寫、不可變資料的顯示投影、回復與跨版本相容性；不得以一般文字替換流程處理。
  - Spec Impact Preflight：`Intentional replacement`。使用者已明確要求取代現有 user-facing `保留號／候選圖號／正式圖號`、號碼效力顯示與歷史／儲存文案契約；本 DEV amendment 取代 `SPEC-PDM-STATUS-UX-003` 中 Phase 1A 號碼效力顯示與「不改 audit/history」條款，內部 machine contract 不變。
  - 成熟度：`RD Implementation Ready / Human Confirmed / Local RD Complete / QA-QC Passed / Production Release Gated`。已完成產品 source/UI/projection、local rewrite runner、focused QC 與瀏覽器驗收；未執行 live data apply、backup/restore、production、merge、PR、deploy 或 release artifact。

  - Current Architecture Impact：只改 user-facing vocabulary projection、既有 human-readable history/audit/snapshot 的顯示投影與共用 status scope；可變人類文字欄位才直接改寫，append-only audit 與帶 hash snapshot 保留 raw value，改由 local projection 供畫面使用。不改 schema shape、ID、enum、狀態機、permission、approval/publication authority、API payload shape 或 route compatibility。需要一個可重跑且只處理明確 human-readable columns/fields 的 local rewrite runner；不得以全文 replace 破壞 machine code。
  - Current Phase RD Handoff Contract：
    - 目的：在不改產品流程 authority 的前提下，讓所有使用者可見 identity 只使用「編號／圖料根號／料號／圖號」，移除「保留號／候選／預覽／已保留／正式／已釋出」等號碼效力詞，並以 `4A` 流程狀態與白話限制維持可操作性；檔案預覽仍可作為檔案操作語言。
    - 交付：共用 vocabulary mapping、受影響頁面與元件文案、local historical/human-readable content rewrite runner、狀態／CTA mapping、QC scanner 與 browser evidence；dry-run 已驗證 16 個欄位／1031 筆資料／0 筆變更。
    - 進入條件：使用者決策 `1C / 2C / 3B / 4A / 5C` 已確認；既有 dirty worktree 變更已辨識；active SPEC/QA amendment 已同步。
    - 完成邊界：local product code、local rewrite runner、focused QC、typecheck、affected lint、browser 1440/390；production data、正式 migration、deploy/release 另行 gate。isolated production build 已完成 compile、TypeScript 與 127/127 static generation，但既有 local dev server 造成 wrapper cleanup 未以 exit 0 結束，故不標示 build gate 完成。

  - Implementation Contract：
    - Identity copy mapping：`保留號／保留號碼／候選圖號／候選料號／候選圖料號／正式圖號／正式料號／正式圖料根號` 一律依 domain context 改為 `編號／圖號／料號／圖料根號`；`同主根號料號` 改為 `同根料號`；建立入口依 context 使用 `建立編號／建立圖號／建立料號／建立圖號與料號`。
    - Status mapping：保留 `編輯中／申請中／送審中／審核中／已發布／已取消`；不渲染 `numberEffectiveness` user-facing badge、filter、help title 或 stored display label；限制使用白話句與 disabled CTA，例如「目前不能作為製造、採購或交接依據」。
    - Candidate removal：UI、ARIA、title、placeholder、empty/error/success/drawer/confirmation、history reason、scope help、API fallback display text 與 QC fixture title 不得出現「候選」；內部 `candidate` code、repository、API field 與 route compatibility 保留。
    - Storage rewrite：RD 依 `scripts/dev-063-numbering-vocabulary-rewrite.mjs` 的 exact field inventory，只改寫可辨識的人類可讀字串；5C 納入現有 history/audit/snapshot 的畫面投影，raw append-only audit 與 hash-bound snapshot 不覆寫，並保留 source hash。不得改寫 machine code、ID、hash、timestamp、state enum、permission code 或 payload key。
    - Migration behavior：runner 已實作 dry-run → count → apply → post-scan，支援 transaction、idempotency key／migration version、前後計數與 mismatch fail-closed；本輪只執行 dry-run，未對 live/local data apply。成功後不承諾恢復舊詞彙，失敗於 commit 前必須 rollback。不得連線 production target。
    - Failure recovery：未知欄位、非預期字串、count mismatch、跨 company scope、transaction failure 或 machine-token 命中時停止，不做部分成功；UI vocabulary projection 若遇未知 context 以開發/QC failure 暴露，不猜測替代詞。
    - Compatibility：`reserved`、`candidate`、`official`、`?tab=reserved`、`?tab=drafts`、API/audit/repository machine identifiers 維持；舊 URL zero-write canonicalization 維持。

  - QA/QC Gate：
    - static inventory：產品 source、active docs、QC scripts、migration field inventory 的舊詞掃描與 allowlist 分流；machine identifiers 不列入 user-facing 零殘留規則。
    - data rewrite QC：dry-run/apply 前後 row count、human-readable field count、machine field hash、state/ID/hash/permission invariants、idempotent rerun 與 transaction failure rollback。
    - functional regression：number-state lifecycle、create/submit/withdraw/cancel/approve/publish/handoff/transfer、old URL zero-write、API fallback、history/detail rendering。
    - browser evidence：1440×900、1024×768、390×844；無舊詞、visible error、水平溢位、focus loss、ARIA 舊 label；限制文案與 disabled CTA 可見。
    - required commands：`npx.cmd tsc --noEmit --pretty false`、`npm.cmd run lint -- --quiet`、`npm.cmd run qc:dev-063-numbering-vocabulary-rewrite`、affected status UI/browser QC；本輪結果為 typecheck/lint、10/10 rewrite、5/5 UI、6/6 browser、8/8 state-flow、11/11 request-equivalence、34/34 production-slice、83/83 status-scope。

  - Stop Conditions：需要改 schema shape、state transition、permission、approval/publication authority、API payload、machine identifiers、production data、正式 migration、deploy/release 或無法區分 human-readable text 與 machine token時，停止並回 Dev PM。

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

- ✓ DEV-006 [交付點] [完成] [P1] [已歸檔] 圖料工作台關係視圖
  - 摘要：將圖料工作台從平面清單改為 root-grouped 關係樹與矩陣 review，並提供受控關係維護 API。
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
  - 摘要：統一 root/drawing/part detail drawer 契約；candidate 與正式圖號共用同一 drawing detail family、header 層級與五段資訊骨架，候選專屬生命週期動作只留在 pending/more。
  - 來源 ID：`DEV-PDM-ENTITY-DETAIL-DRAWER-001`
  - 父任務：`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-NUMBERING-004`、主資料工作台
  - 證據：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`、`.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`、Phase 1B 共用 `PdmEntityDetailDrawer`、`qc:pdm-entity-detail-drawer` 40/40、drawing-family browser QC `output/qa/pdm-entity-detail-drawer-ai/20260808091130-drawing-family/`。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-039）
  - 批次發版：見 `DEV-032`；shared shell 已於 2026-08-07 本機完成，merge/PR/deploy/release 仍需走 release gate。
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
  - 摘要：建立 settings center、五個管理區、server-only secret lifecycle API、secret metadata tables、redacted UI 與 local test double；原 Supabase Vault provider 選擇已由 `DEV-058` 的 Google Secret Manager authority 取代，通用 lifecycle 證據仍有效。
  - 來源 ID：`DEV-PDM-SETTINGS-CENTER-001`
  - 父任務：CAD、Supabase 與設定權威
  - 證據：`.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`、`.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`、settings secret QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-022）
  - 批次發版：見 `DEV-032` 與 `DEV-058`；不得再以 Supabase Vault 作正式 target，Google Secret Manager live write/read、真實 CAD 證據與 production cutover 需走 release gate。
  - 計入交付：是

- ✓ DEV-023 [交付點] [完成] [P1] [已歸檔] Windows SolidWorks 原檔預覽衍生檔
  - 摘要：建立 preview job/derivative schema、fake PNG worker、Windows Shell worker、Document Manager SLDDRW worker path 與 derivative-aware preview cards。
  - 來源 ID：`DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`
  - 父任務：設定中心、CAD 讀取器與附件預覽
  - 證據：`.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`、native-preview QC 90/90、redaction QC、master-attachments QC、API worker smoke。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-023）
  - 批次發版：見 `DEV-032` 與 `DEV-058`；真實 SLDDRW key 必須由 Google Secret Manager authority 提供，SLDASM evidence、Phase 2/3 與 production rollout 需走 release gate。
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

- ✓ DEV-026 [交付點] [完成] [P1] [已歸檔] 圖料工作台資料流與送審安全架構
  - 摘要：確立圖號/圖料 controlled drawing submission workbench、owner API edit path、immutable snapshot/hash、idempotency audit 與 generic upload retirement。
  - 來源 ID：`DEV-PDM-DRAWING-PART-WORKBENCH-001`
  - 父任務：圖面送審權威
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`、`.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`、workbench security QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-026）
  - 批次發版：見 `DEV-032`；production deploy/migration、direct DB cleanup 與 existing-data repair 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-027 [交付點] [完成] [P2] [已歸檔] 圖面來源只送審流程
  - 摘要：讓圖面來源送審只負責 review-only submission，主資料必須在圖面/圖料工作台先完成，不在送審中收 PDM master fields。
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
    - [x] `Gate C - Clean Seed & Continuity`：mutation前on-demand backup `1784136240742`、privileged admin bootstrap、18筆schema migration與立即idempotence rerun已完成。production Identity Toolkit已讀回verified `google.com` UID `U57t2eIOzLdhAmNDUbFyOz3fdMm2`；principal `prod-pdm-admin-001` bootstrap通過，包含9 roles與237 permissions。pre-canary reconciliation執行`ai-pdm-prod-migration-runner-2szd5`通過；post-principal recovery point `1784162806569`已還原到獨立target `ai-pdm-prod-restore-20260716a`，restore reconciliation執行`ai-pdm-prod-migration-runner-9ss25`通過，來源與restore的numbering snapshot SHA-256均為`81f983ce4f3ed580d71f1cdef70cfbade83d860498a4310a1a61c11e997c1f57`。runner已清除execution ack並恢復dry-run，Terraform no-drift；restore target在當次驗證後曾暫留為evidence，但2026-08-26唯讀查詢已確認該instance目前不存在。
    - [ ] `Gate C2 - Current PDM Data/Schema Candidate`：上述Gate C只證明歷史18版第一版production slice，不得冒充目前47版PDM候選。現行production package含47筆ordered migrations，exact manifest SHA-256=`27c4d4e6cb85a95b8b63d0fceb9b1b505177fd1880b6f61dc1097e93651ee81f`；masked正式內容搬運、formal-ledger disposable PostgreSQL apply／idempotent rerun與相容性QC已PASS。2026-08-26唯讀盤點已確認production source為private、RUNNABLE，自動備份、PITR與deletion protection皆啟用，最近成功AUTOMATED backup `1787680800000`於`2026-08-25T20:35:02.233Z`完成，距盤點約9.7小時；但歷史restore target `ai-pdm-prod-restore-20260716a`目前回傳404而不存在，且尚無綁定此exact manifest的separate-target native restore、apply/rerun、reconciliation與rollback evidence。`output/dev-032-cloudsql-backup-readiness/report.json`因此只保留2個fail-closed blockers；未補齊前不得把現在工作樹部署正式。
    - [ ] `Gate D - Immutable Deploy & Smoke`：目前production revision為`ai-pdm-prod-gh-f70c8982-29636150040`，100%流量指向source `f70c89821b717e6e98e3a6ef855af47e4b4a69dc`與image `sha256:6963bb079a12e3ba973d4b07e0945cd2ee34178de9326f9e5735e3e133a94b91`。GitHub Actions run `29636150040`以keyless OIDC完成exact-commit驗證、immutable build、0% candidate、traffic validate、promotion與canonical smoke；保存的release artifact `8427222934`顯示candidate/canonical各13/13、traffic checks全通過，OCI revision label亦與source一致。2026-08-11 GCP唯讀live readback再次確認Cloud Run、Cloud SQL Regional HA、backup/PITR/deletion protection、獨立private restore target、principal、reconciliation與production slice均通過。歷史hotfix `1936e93d`的authenticated Level 4證據不得冒充目前release；Gate D只剩依另行核准的production-smoke程序取得與目前source/revision/image完全一致的authenticated privacy/permissions/領號/草稿/系列代號/重登/file fail-closed Level 4 evidence。
    - [ ] `Gate E - Named-User Canary`：只開放核准的3-5位Google Workspace使用者，驗證allowlist/non-allowlist、登入、privacy、領號、草稿、重登持久性與零open P0/P1；固定五日field gate已取消，不得自動擴大allowlist。
  - 下一步：若只驗收目前線上source `f70c8982`，在取得獨立production-smoke核准後執行authenticated Level 4，再由產品負責人提供共3-5位具名Wave 0使用者與go/no-go。若要部署本次47版PDM資料／schema候選，必須先完成Gate C2：以已讀回的近期native backup建立新的獨立private restore target、綁定exact manifest執行兩次migration、資料reconciliation與rollback evidence，再完成staging smoke與clean exact release commit；兩條證據鏈不得互相代用。建立／保留／刪除restore target與寫入migration皆屬Lane 3，須另行明確授權。
  - 2026-08-11本分支正式部署前機器驗證：`qc:full` 42/42步驟通過、`qc:industrialization` 41/41步驟通過、target preflight 16/16、activation readiness 18/18、`npm audit --audit-level=moderate`為0 vulnerabilities；dev與standalone production runtime皆以disposable SQLite snapshot完成API/UI/檔案雜湊驗證，不寫入工作區主資料。嚴格`qc:production-readiness`仍依設計因上述A8/A9真人證據回傳blocked，故本紀錄不構成deploy/go-live授權。
  - 阻塞 / 恢復條件：每個子關卡需獨立 explicit approval；artifact provenance、target identity、cost、privacy、clean seed/source archive/non-reuse、connection budget、rollback、restore/reconciliation、smoke tenant任一缺失即停止。
  - 證據：`.ai-doc/reports/pm/pm-dev-032-production-gate-package-2026-07-15.md`、`.ai-doc/reports/pm/pm-dev-032-gate-a-b-execution-2026-07-16.md`、`.ai-doc/reports/pm/pm-dev-032-production-hosting-activation-2026-07-16.md`、`.ai-doc/reports/pm/pm-dev-032-production-principal-restore-reconciliation-2026-07-16.md`、`config/platform/production-activation-evidence.json`、`output/dev-032-production-live-readback/report.json`、`output/dev-032-production-target-preflight/report.json`、`output/dev-032-production-slice-activation/github-f70c8982-release-evidence.json`、`output/dev-032-production-activation-readiness/historical-activation-closure-hotfix-1936e93d.json`、`output/dev-032-production-activation-readiness/report.json`；現行47版候選另見`output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json`、`output/dev-032-cloudsql-backup-readiness/report.json`與`.artifacts/AI_PDM/production-data-sync-20260825-091904/cloudsql-history-rehearsal/manifest.json`。目前release的authenticated Level 4待追加，歷史18版restore與舊hotfix UI證據只保留歷史用途。
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

- ✓ DEV-035 [開發點] [Local RD/QA-QC Complete] [P1] [Real A0002 Closure 21/21 PASS / Production Release Gated] SolidWorks 原生屬性讀取與辨識診斷可視化
  - 摘要：管理員只在UI安全儲存、真實測試及啟用Document Manager key；local/test由Windows DPAPI、staging/production由Google Secret Manager保管，worker自動套用exact version且不需PowerShell、`.env.local`或restart。之後由trusted Windows reader讀取受控`.SLDPRT`／`.SLDASM`／`.SLDDRW` file/configuration properties，轉成DEV-068可追溯候選；不可把reader未執行呈現成屬性0或啟用完成。
  - 來源 ID：`DEV-CAD-001`；父任務：`DEV-068`；關聯 `DEV-056`、`DEV-058`、`DEV-079`。
  - 完成狀態：`Local RD/QA-QC Complete / Real A0002 Closure 21/21 PASS / Production Release Gated`；風險`Medium`。歷史035-E secure provider／probe／hot-apply仍有效；2026-08-28在task-owned SQLite／repository與free-port runtime中，從canonical workspace正常「重新辨識」入口連續建立兩個successor，兩次均由真實Document Manager reader讀取相同A0002.SLDPRT bytes/hash、14 observations與八個expected fields，現行projection hash一致，worker exact-version ack、completion gate、FK／primary invariant與cleanup均PASS。
  - Spec Impact Preflight：`Intentional replacement + compatible extension`。保留DEV-068 observation/candidate/human review/partial-success/atomic formalization與既有Windows worker／DEV-058 broker；取代test-double可啟用、日常env key、worker startup-bound credential、no-migration與real A0002 optional completion。
  - 重開事實：A0002-M01最新session三個native adapter均`unsupported`、0 observations，原因為metadata command未設定；UI active reference是`local_test_double`且原key未持久化，最近測試只驗證lifecycle/redaction；worker又在啟動時綁定command/key。故原「完成」判定無效。
  - 已採用決策：
    - reader固定SolidWorks Document Manager，不用desktop COM／Add-in fallback；只在read-only Windows child process執行。
    - 同一UI跨環境；`windows_dpapi`與`google_secret_manager`可真實啟用，`local_test_double`只能模擬且永遠不得ready。
    - Windows非automated-test runtime若誤設`PDM_SETTINGS_SECRET_PROVIDER=local_test_double`，新UI draft強制改用Windows DPAPI；test double需明確`NODE_ENV=test`或`PDM_ALLOW_SETTINGS_SECRET_TEST_DOUBLE=true`，避免真實輸入再次被丟棄。
    - 復用token-gated broker；每job／active version變更解析exact key，只進當次native child env，不進global process env、args、DB、log或browser。
    - real native probe PASS後才tested；active version、probe PASS、recognition worker online與exact-version ack四者全滿足才ready。
    - 新增worker-only source-content GET，以token＋session/source/worker lock/company/hash/size驗證；worker下載到task-owned temp、double-hash、finally清理。
    - `製圖`固定為`drawn_by_name`字串metadata，不查user ID；`3D圖號(主)`固定為drawing identity evidence，不改canonical identity。
    - `品名/料號/3D圖號(主)/版本／版次`在draft context是可逆draft input，不因與正式值不同先標衝突，但仍不可直接改寫canonical identity；`材質/表面處理/熱處理`為part attributes；未知欄位保留unclassified，空值blocked且不等於`無`。
    - 2026-08-25使用者決策：辨識系統先填入圖號／料號與屬性草稿，正式值差異延後到write-impact；同碼正式part＋有效draft part視為同一邏輯owner並優先正式ID，舊批次重複owner警告收斂為單一重新辨識提示。
    - native metadata command 已配置但 credential 尚未 ready 時，worker 只回報 blocked heartbeat、暫不 claim recognition job；key 由 UI 啟用後同一 PID 自動恢復，避免產生 `unsupported/0` 假辨識結果。
    - worker 本身會在每個 polling cycle discovery metadata/probe wrapper；不再把 command 是否於 launcher 啟動當下存在當成必要條件，避免既有 PID 因缺少 startup env 而無法套用 UI 後設的 secure credential。
  - Exact manifest：historical baseline=`22 files = 17 product + 5 QC`；current delta=`39 files = 26 product + 13 validation`，新增`scripts/qc-dev-035-native-retry-browser.mjs`。Schema migration=`Additive / Medium`，provider check＋probe jobs＋worker capability heartbeats；validation delta包含修正completion audit解析active`☐ DEV-*`；完整路徑見SPEC §15。
  - RD phases：
    - [x] 035-A：company alias/mapping、job-locked source bytes route、hash/size/security guard、sanitized health projector。
    - [x] 035-B：C# raw extractor＋Node wrapper、credential broker reuse、heartbeat、staging、timeout/retry、exact child-tree termination與cleanup。
    - [x] 035-C：嵌入式／完整核對共同health UI、`drawn_by_name` allowlist、identity draft input與no-direct-canonical-write。
    - [x] 035-D：QA-035-01～44 deterministic aggregate；只保留為partial baseline，不構成completion。
    - [x] 035-E：Windows DPAPI secure provider、test-double activation deny、async real probe job、worker hot apply／heartbeat、truthful Settings state與038 migration。
    - [x] 035-F：UI-only credential activation、real probe、exact-version acknowledgment、三viewport／redaction contract與real A0002兩次E2E completion gate。
    - [x] 035-G：draft-population語意、同碼canonical／draft owner去重、舊批次單一rerun提示與1440／390隔離瀏覽器回歸；2026-08-28兩個現行真實A0002 successor的readback／repeatability gate已PASS。
  - Acceptance：完整AC-035-01～24與QA-035-01～64；尤其UI輸入一次、無shell/env/restart、test double不可ready、invalid key不可activate、worker exact-version ack、rotation/revoke、secret零洩漏及A0002 expected八欄必須全通過。
  - Out of Scope：SOLIDWORKS未儲存狀態／視窗星號、Add-in、CAD回寫、OCR、cut-list/geometry、2D preview/PDF/DWG、canonical identity自動建立、production credential/worker/deploy/migration/release。
  - Rollback／停止：每個phase都能回到visible blocked且保留其他adapter／歷史observation。若需desktop COM/Add-in、新license採購、live production resource/apply、canonical identity write，或出現secret/path/cross-company leak、CAD hash改變、wrong-owner、orphan process/temp、partial formal write，立即停止。
  - 歷史partial evidence：`qc:dev-035`、typecheck、compile-only與unavailable-state Playwright曾PASS，但未證明provider可讀、worker套用或real A0002成功；不得再列completion evidence。
  - 歷史 runtime checkpoint（2026-08-19）：task-owned no-key one-shot曾正確回報`native_metadata_license_missing`且不claim job；當時completion gate為`BLOCKED`。該process已退出，證據只保留為negative baseline。
  - Local completion evidence（2026-08-19）：Security UI建立並啟用`windows_dpapi` v3；real probe=`passed`，reader=`solidworks-document-manager-reader.v1`；常駐recognition worker回報同版本／fingerprint且`status=ready`。A0002 source SHA-256=`15cd458b983e4dddd0836555dfa8eac0f4d3ac87c056403d4279ebbf3d3ec7f4`，兩個獨立session `recognition-7e08788c-9e47-4962-bebd-05f0fc4b29c3`、`recognition-376da831-c73e-4a86-bdaa-c6b41546b880`皆由`solidworks-document-manager.v1`成功產生14筆observation；八個expected欄位missing／mismatch／owner mismatch／scope mismatch皆為0，repeatable=`true`。原檔bytes/hash不變，key未進DB／log／evidence。完整`npm.cmd run qc:dev-035`與`qc:dev-035:completion-gate`均PASS。
  - Draft population evidence（2026-08-25）：`qc:dev-035:contract`16/16、mapping、browser、worker-hot-apply、DEV-068 contract/schema、typecheck與affected ESLint PASS；`qc:dev-035:native-retry-browser`以隔離主資料快照完成24/24，1440／390無overflow／console／network error，舊5筆owner警告收斂為單一rerun且成功建立queued successor，主SQLite invariant hash前後相同，`next-env.d.ts`逐字恢復。證據：`output/qa/dev-035-native-retry/DEV035-NATIVE-RETRY-2026-08-25T08-29-47-134Z/manifest.json`。
  - 實作修正：補齊native child的Node TypeScript transform flag、C# stdout UTF-8、Document Manager空evaluated欄位的安全raw literal fallback與`版次`alias、draft part owner context、non-empty expected-value gate，以及只對`.SLDPRT/.SLDASM/.SLDDRW`投影native health，PDF不再造成SolidWorks讀取失敗警告。
  - 下一步：完成draft-population隔離QA/QC後，由使用者在既有工作台按一次「重新辨識」取得新session並以真實A0002確認欄位直接預填且不再出現重複需處理；production credential／migration／worker部署與release仍只走`DEV-032`。
  - 權威：`.ai-doc/specs/SPEC-PDM-SOLIDWORKS-METADATA-READER-001-native-property-extraction.md`；QA：`.ai-doc/qa/qa-dev-035-solidworks-native-metadata-reader-validation-plan-2026-08-19.md`；fixture expectation：`.ai-doc/qa/fixtures/dev-035-a0002-property-expectations.md`；parent：`.ai-doc/specs/SPEC-PDM-DRAWING-RECOGNITION-001-candidate-review-and-formalization.md`。
  - 計入交付：是（DEV-068的本機SolidWorks原生屬性辨識能力支撐；不包含production release或2D preview）

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
| ✓ 本輪本地範圍已完成／production gate | `DEV-092` | `DEV-PDM-DRAWING-WORK-FILE-SNAPSHOT-CAPA-001` | 開發點 | QA-087-179..186、browser與disposable PostgreSQL均PASS；正式備份兩次rehearsal、production資料修復、cutover與release仍由`DEV-032`另行授權 |
| ↷ Phase 3B future | `DEV-033` | `DEV-STORAGE-COST-001` | 開發點 | 與DEV-046 Phase 3B、DEV-037合併為GCS authority/cost/continuity package |
| ✓ 完成 | `DEV-034` | `DEV-IND-007` | 關卡 | disposable local PostgreSQL shadow gate 已通過；正式 Cloud SQL release只走`DEV-032` |
| ☐ 修正驗證中 | `DEV-035` | `DEV-CAD-001` | 開發點 | 2026-08-25 draft-population修正已實作；隔離QA/QC與真實A0002新session重驗後再關閉，production release另受gate管理 |
| × 停止追蹤 | `DEV-036` | `DEV-SW-001` | 關卡 | 目前無 Add-in 產品路線；保留歷史 ID，未來需新產品決策才恢復 |
| ↷ 延後 | `DEV-037` | `DEV-BACKUP-001` | 關卡 | 完整 PDM file/GCS/offline restore drill 延後；Phase 3A 另依 closed `DEV-046 HD-8-4 / 1A` 完成 pre-canary DB restore/reconciliation |
| × 取消 | `DEV-038` | `DEV-FIELD-001` | 關卡 | `HD-9-1` 於 2026-07-14 取消固定五個工作日驗證；不執行、不算通過，且不再是第一版 blocker |
| ✓ 本輪本地範圍已完成 | `DEV-040` | `DEV-PDM-PRODUCTION-SLICE-001` | 交付點 | Phase 1 local product slice 已完成並驗證；正式部署、production smoke、release report 另走 `DEV-032` |

稽核紀錄：2026-08-19曾發現`qc:dev-task-completion-audit`漏讀active`☐ DEV-*`；DEV-035 Phase F已修正parser與runtime completion gate。現行DEV-035只有在real secure provider、probe、exact worker ack與兩個獨立A0002 session同時PASS時才能標記`✓`。`DEV-FIELD-001`仍是cancelled而非evidence passed，production readiness仍須顯示`DEV-PDM-ERP-GOOGLE-CLOUDSQL-001` blocker。

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
| [x] | DEV-CAD-001 | SolidWorks Document Manager native metadata reader | DEV-035 Current Phase已取得real native probe、recognition worker exact-version acknowledgment與A0002兩次可重現observations；2D preview與production release仍不在本DEV。 |
| [ ] | DEV-SW-001 | SolidWorks Add-in real-machine validation | Cancelled as a product route, not evidence-passed. Historical ID retained; a new product decision is required to reopen it. |
| [ ] | DEV-BACKUP-001 | Offline one-way backup and restore drill | Full PDM file/GCS/offline restore drill deferred to Phase 3B/full file readiness; Phase 3A separately requires closed DEV-046 `HD-8-4 / 1A` pre-canary Cloud SQL restore/reconciliation evidence. |
| [x] | DEV-FIELD-001 | Formal field-test evidence | Cancelled by Human Decision `HD-9-1` on 2026-07-14; closed without execution or acceptance evidence and no longer a first-version blocker. |
| [!] | DEV-PDM-ERP-GOOGLE-CLOUDSQL-001 | Live platform and release readiness | DEV-032 machine-verifiable Gates A-C及Gate D candidate/canonical smoke已具證據：2026-08-11唯讀preflight與live readback通過，production authority為Firebase Hosting → Cloud Run → Cloud SQL PostgreSQL，file authority為GCS，Supabase維持retired/fail-closed。現行revision `ai-pdm-prod-gh-f70c8982-29636150040`、source `f70c89821b717e6e98e3a6ef855af47e4b4a69dc`、image `sha256:6963bb079a12e3ba973d4b07e0945cd2ee34178de9326f9e5735e3e133a94b91`已由GitHub Actions run/artifact、OCI標籤與GCP live state交叉核對；candidate/canonical smoke各13/13。P0仍保持blocked，唯一Gate D缺口是目前release的authenticated Level 4；Gate E另待3-5位具名Wave 0使用者與product-owner go/no-go。歷史`1936e93d` Level 4不得重用。Evidence：`config/platform/production-activation-evidence.json`、`output/dev-032-production-live-readback/report.json`、`output/dev-032-production-slice-activation/github-f70c8982-release-evidence.json`、`output/dev-032-production-activation-readiness/report.json`。 |
| [!] | DEV-STORAGE-COST-001 | Future GCS authority/cost/continuity package | Parked with DEV-046 Phase 3B and DEV-037 until Phase 3A is stable and file-workflow scope, inventory, lifecycle policy, cost and recovery ownership are approved. |

保留給 `qc:dev-task-evidence-sync` 的外部證據 checklist：

- [x] 取得 disposable Supabase / Postgres shadow target。
- [x] `npm.cmd run qc:postgres-shadow` 在 disposable target 通過。
- [x] `P1` 完成035-E implementation：UI安全儲存、real native probe job、test-double activation deny、recognition worker hot apply／exact-version heartbeat與038 additive migration；real runtime PASS仍待QA。
- [ ] `P1` 完成035-F：只透過UI且不restart的invalid-key／rotation／revoke／restart persistence／redaction／三viewport evidence。
- [ ] `P1` 以 A0002 代表檔驗證 file-level／configuration-specific property、中文 alias、原始／resolved value與安全diagnostics；native adapter必須succeeded且八欄符合，deterministic fixture不可替代。
- [x] `P1` 固定 `製圖=drawn_by_name` drawing-revision metadata字串、`3D圖號(主)=model_root_number` drawing identity evidence；兩者均不查user ID或自動改canonical identity。

## 4. 已完成任務與證據摘要

- 2026-08-27（DEV-101 independent local CAPA completion candidate）：完成canonical`pdm_work_review` inbox adapter、normal
  owner submit→reviewer list→full-page review→return／approve、v1／v2分流，以及Drawing exact full recognition
  projection／inner hash、owner fail-closed、shared editor-review panel與latest-session isolation。最終aggregate
  `output/qa/dev-101-aggregate/DEV101-AGGREGATE-RD-2026-08-27T10-55-37-882Z/manifest.json`為
  `RD_IMPLEMENTATION_READY`、11/11 lanes PASS；typecheck、affected lint、SQLite／disposable PostgreSQL、兩個
  task-owned browser runtime、isolated build 122 pages、primary/source invariant與cleanup均通過。fixed
  `QA-101-001..048`已由data 29/29、normal-entry browser 23/23、PostgreSQL 2/2與gate 5/5四runner在同parent/source
  彙整為48/48 PASS，closure=`.ai-doc/qc/qc-dev-101-independent-qa-qc-closure-2026-08-27.md`。DEV-079 local
  accepted-state invariant／reconciliation／GET zero-write亦完成；primary 21筆repair與production release仍未完成。未stage／
  commit／merge／PR、未修改primary schema/data、未deploy或release。

- 2026-08-27（DEV-101 CAPA重開）：使用者以A0002-M01實際操作確認`/approvals`顯示0筆。唯讀查證確認
  request `234ebcc8-9ed4-4b78-a004-42212729d76b`為pending、exact reviewer=`user-manager-demo`、canonical
  handling=`review_owner`；`listInbox()`未讀`pdm_work_review_requests`，而focused browser直接navigate detail
  route。CAPA已撤回完整RD交付敘述、把22/22降為supporting、修正SPEC no-touch錯誤、將QA由36擴為42案，
  並固定same DEV corrective scope、normal UI journey、v1／v2分離、adapter-removal mutant與single completion
  receipt。文件工作未改產品碼、primary schema／data或runtime，未stage／commit／merge／PR／deploy／release。

- 2026-08-26（DEV-101 RD Implementation Ready）：使用者選擇`C`，沿用同一DEV直接升級為可派工合約。
  repository assessment確認現行review GET只回單一entity且混入live identity／files／Part attachments；
  `snapshot_hash`同時承擔package與formalization drift，不能直接擴大。新SPEC固定versioned v2 immutable
  review package、column package hash／envelope decisionBasis hash／target evidence hash三責分離、完整同根
  snapshot、shared Drawing／Part renderers、shell／target／comparison API、Part submitted attachment manifest、
  v1/v2 dual read、default-off writer flag、schema=`none`、exact add/modify/no-touch map、query／payload limits、
  rollout／rollback與36案QA。既有Unified Entity Detail ADR、Approval Platform與Entity Detail Drawer SPEC已同步
  amendment。狀態=`RD Implementation Ready / RD Not Started / Local Implementation Eligible / Production Release
  Gated`；本輪只修改開發文件，未改產品/schema/data/tests、未啟動runtime，未stage/commit/merge/PR/deploy/release。

- 2026-08-26（DEV-101 local RD implementation completion）：依已確認的`1A／2A／3A`等19項決策完成
  v2 review package contract／builder、Drawing／Part shared review renderer、review shell／target／comparison
  API、immutable snapshot file-read scope、readonly Drawing × Part matrix、URL active target、visual marker
  slots與editor位置一致的decision dock；保留v1 dual reader，v2 writer由default-off
  `PDM_REVIEW_PACKAGE_V2_WRITE`控制，schema／migration=`none`。`qc:dev-101:contract` 12/12、package
  builder 4/4、isolated browser/API smoke 6/6 PASS；`typecheck:app`、affected lint與`build:isolated` PASS，
  primary SQLite logical invariant before／after hash一致，task-owned runtime／temp已清理。固定QA分母
  `QA-101-001..036`仍待QA／Independent QC，不將focused smoke誤算為36案PASS；full lint仍有既有
  `src/app/policy/page.tsx`兩個錯誤，未涉及DEV-101 touched files。未stage／commit／merge／PR、未啟用
  production、未deploy或release。

- 2026-08-26（DEV-101 引導決策 Round 5）：使用者選擇`1A／2A／3A`。多目標submitted package沿用
  request-level authority一次原子核准／退回修改；需要補件沿用`return_for_correction`，不新增第三種
  decision、per-target decision或partial publication；
  active target只改變檢視焦點。drift compare採changed-first，差異section／field預設展開，未變完整內容
  仍可就地取得。submitted／change／risk使用固定、獨立且可同時存在的marker槽位，不合成highest-
  severity glyph或以整列背景承擔多重語意。DEV-101維持
  `Brief Ready / Human Confirmed / RD Not Requested`；本輪只更新既有DEV與documentation map，未修改
  產品／測試碼、schema/data、runtime或release邊界。

- 2026-08-26（DEV-101 引導決策 Round 4）：使用者選擇`1A／2A／3B`。marker說明在hover／focus暫時
  顯示，click／tap可固定；同時只開一個，以外點或Escape關閉，marker與identity切換使用分離hit target。
  窄版保留完整Drawing × Part矩陣，以自身水平平移、sticky axes及active-target auto-reveal維持相同
  資訊模型。drift compare在desktop維持snapshot左／current右，窄版預設snapshot並以swipe或可存取的
  兩態控制切換；證據身分名稱保持可見，swipe不是唯一入口。DEV-101維持
  `Brief Ready / Human Confirmed / RD Not Requested`；本輪只更新既有DEV與documentation map，未修改
  產品／測試碼、schema/data、runtime或release邊界。

- 2026-08-26（DEV-101 引導決策 Round 3）：使用者選擇`1A／2A／3A`。矩陣identity旁的submitted
  target／change／risk不放常駐文字，改以圖形、輪廓、圖樣或狀態標記；文字統一收進支援hover、
  keyboard focus、tap與讀屏的同一懸浮說明層，且selected態與marker語意不得混用。live drift只在
  active-target header顯示視覺入口，於同頁以snapshot左／current右並排，snapshot仍是唯一decision truth。
  approval decision dock沿用editor頁面底部sticky位置、永遠可操作且不重複。DEV-101維持
  `Brief Ready / Human Confirmed / RD Not Requested`；本輪只更新既有DEV與documentation map，未修改
  產品／測試碼、schema/data、runtime或release邊界。

- 2026-08-26（DEV-101 引導決策 Round 2）：使用者選擇`1A／2B／3C`。矩陣只有Drawing／Part identity
  名稱可切換active target，交叉格只讀關係且不可點；直接沿用既有identity button語意。矩陣顯示送審
  當下完整同根Drawing × Part，submitted targets以非色彩唯一依賴的方式標記，其餘identity只供脈絡且
  不進decision scope。合法`activeTarget`寫入URL，reload／Back／分享後還原；無值或失效時顯示request
  primary target，risk提示不自動奪走選取。DEV-101維持`Brief Ready / Human Confirmed / RD Not Requested`；
  本輪只更新既有DEV與documentation map，未修改產品／測試碼、schema/data、runtime或release邊界。

- 2026-08-26（DEV-101 引導決策 Round 1）：使用者選擇`1B／2B／3A`。多目標審核頁採上方唯讀
  submitted-snapshot關聯矩陣，點擊切換下方單一完整Drawing／Part workspace；矩陣只作target導航，
  不恢復Relation workbench／review或formal edit。送審快照是唯一審核主體，只有偵測live drift時才顯示
  明確比較入口。decision dock永遠可操作，不追蹤閱讀、不要求開啟所有target／section，也不增加風險
  確認gate；scope／change／risk仍固定可見。DEV-101維持`Brief Ready / Human Confirmed / RD Not Requested`；
  本輪只更新既有DEV與documentation map，未修改產品／測試碼、schema/data、runtime或release邊界。

- 2026-08-26（DEV-101 Brief Ready）：依使用者 `$dev-pm` 與人類確認方向建立審核內容面開發文件。
  PDM 審核案件固定直接進 canonical Drawing／Part workspace 的 `review` mode，完整 domain 資訊由審核者
  決定檢視深度；系統固定揭露 scope／change／risk／target manifest，預設可定位但不得情境性裁切。
  edit／review 共用 domain renderer、section order與view model，review改讀immutable submitted snapshot並
  以decision dock取代edit actions；multi-target必須由矩陣完整列出所有圖號／料號，且各target的完整
  快照皆可切換到達。此 Brief
  有意取代 DEV-067 review visibility裁切與covered PDM approval-only detail composition，保留DEV-070清單、
  exact return、既有permission／decision／audit與DEV-079／083 domain workspace。狀態僅`Brief Ready /
  Human Confirmed / RD Not Requested / Documentation Only`；未修改產品／測試碼、schema/data或runtime，
  未stage／commit／merge／PR／deploy／release。

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

- 2026-08-27（DEV-087／097單人可信QA契約取代）：使用者明確決定「防君子不防小人」，不再要求獨立QC、actual AT收據、immutable denominator／independent oracle／M01..M12／artifact hash chain／provenance防拼接等防執行者作弊控制。DEV-097改為`Skipped / Historical Supporting`，不再阻擋DEV-087。DEV-087 current契約改為94個產品案例（current UI 51＋C01..C11 11＋QA-087-187..218 32）與`QG-087-PROVIDER`、`QG-087-SECURITY`、`QG-087-UI`三個橫向Gate；同一開發者可執行RD／QA／QC。剩餘接受風險為測試者可能縮小名冊、調整expected、重用或偽造證據；但功能、資料、權限、provider、真實UI、primary invariant與cleanup仍是必驗。本輪只修改開發文件，未改runner／registry／產品／schema／data／runtime，未stage／commit／deploy／release。

- 2026-08-26（DEV-100 Local RD／QA-QC completion）：完成migrated Drawing work mutable snapshot classifier、upload／remove post-write transaction gate、stable 409 fail-closed、workspace stale-state清除／mutation凍結及同批primary exact filename替換提示；並修正PostgreSQL 043 surviving guard仍引用已退役Relation表的rehearsal blocker。fresh aggregate `output/qa/dev-100/DEV100-2026-08-26T11-50-35-191Z/manifest.json`為`QA-100-001..018 18/18 PASS`、13/13 commands，SQLite／disposable PostgreSQL 6/6、headed browser 28/28、雙mutant、typecheck／lint／isolated build、primary protected invariant與cleanup均通過。DEV-087 parent `output/qa/dev-087-aggregate/DEV087-aggregate-2026-08-26T11-49-52-656Z/manifest.json`已驗證same-run DEV-100 child/hash為PASS，但父DEV仍因DEV-097 browser 91案NOT_RUN而fail closed。A0044 repair仍需人類選A/B，`applyCount=0`；未stage／commit／merge／PR、未套primary／production migration、deploy或release。

- 2026-08-26（DEV-100 CAPA／RD Implementation Ready）：依A0044-M01首次組合檔上傳的UI、API、SQLite binding／asset與physical hash事實，確認same-role primary replacement合法留下`drawing_revision_work_file_replaced` tombstone，但migrated-only read invariant把它誤判為source asset invalid，造成upload success後GET 409與stale假空畫面。建立不計交付P1開發點DEV-100，固定containment、active/tombstone invariant、post-write immediate read、load-error凍結、多primary exact filename提示、SQLite／PostgreSQL／browser／雙mutant共18案及fresh aggregate gate。程式與隔離QA可直接派工；A0044 primary apply另需backup／dry-run及人類選A0043或A0044。Spec Impact=`Compatible CAPA amendment`、ADR=`No New ADR`；不新增入口、assembly parser、自動BOM或PDF fallback。本輪只修改開發文件，未改產品／tests／schema/data/runtime，未stage／commit／deploy／release。

- 2026-08-26（DEV-099 Full Aggregate QA Complete）：依使用者確認，將建號identity、exact Part結構分類與
  BOM readiness解耦。new-root不再顯示／要求structure type並明確寫`unclassified`；existing-root只在
  全部current Parts有單一decided共識時初始化，empty／mixed／含unclassified不阻擋。分類唯一入口為
  `/parts` exact drawer，可複選同root變體並以ETag／idempotency／all-or-nothing transaction／audit／
  BOM conflict保護；只有assembly顯示BOM區，purchased assembly可分類但無Current Phase製造BOM action。
  同一 parent aggregate `output/qa/dev-099/DEV099-2026-08-26T09-03-03-967Z/manifest.json` 以固定
  `QA-099-001..048` 48/48 PASS，並完成SQLite 7/7、PostgreSQL 7/7、headed四viewport browser 37/37、
  DEV-093／096回歸、writer negative injection與primary invariant／cleanup gate。schema／migration／backfill=0；
  未執行正式migration、activation、deploy、release或production smoke，Git stage／commit仍未執行。

- 2026-08-25（DEV-087／097 RD主管開發文件封口）：RD主管複核後把原本不可能在產品證據前一次完成的`QA-087-219..228 G0`拆為`G0-A QA-087-219..224`與`G4 QA-087-225..228`。G0-A先驗immutable roster、AC trace、fixture classification、獨立oracle與mutant sensitivity；產品child缺席時current aggregate必須expected-FAIL `CURRENT_EVIDENCE_INCOMPLETE`且不產生completion candidate。G4只接受R1～R3實際repository/browser證據，封口mutation provenance、provider/security、artifact hash與headed visible/a11y。第二筆重複`QA-087-115`已在文件重鍵為historical supporting `QA-087-229`且current denominator delta=0；新增exact registry／manifest schema、migration ledger、reference-oracle exports、single staged integrity runner、四支capability runner與M01..M12 mapping契約。shared obsolete route只對Drawing／Part套新fingerprint，既有`part_root`handler／payload／approval不變。本輪結論為`RD Implementation Ready / QA Supervisor Re-review Required`；只改`.ai-doc/`，未實作runner、未改產品/schema/data/runtime，未stage／commit／deploy／release。
- 2026-08-25（DEV-097 QA主管充分性／反假PASS封口；原始發現，後由上一筆RD主管封口取代）：QA主管審查確認DEV-087功能案例雖廣，但case分母、fixture provenance、獨立oracle、aggregate fail-closed與evidence integrity仍有可產生假PASS的P0缺口，因此撤回`QA Plan Ready`並建立不計交付的子開發點DEV-097。current分母固定為原51-case exact roster、C01..C11、功能187..218與完整性219..228；新增immutable registry、AC 1..81雙向trace、UI action/network/server/DB mutation ledger、primitive oracle、bounded mutant catalog、provider／security／headed-visible/a11y gate及獨立integrity validator契約。此筆原先把219..228全部視為前置G0，現已由上一筆更正為G0-A 219..224、R1～R3、G4 225..228的順序。Spec Impact=`Compatible verification hardening`、schema/migration=`none`、ADR=`No New ADR`、`part_root`排除不變。本輪只修改`.ai-doc/`，未實作runner／registry、未改產品/schema/data/runtime，未stage／commit／deploy／release。
- 2026-08-25（DEV-087 RD Implementation Ready升級）：完成current code／route／repository／permission／QC與dirty boundary盤點，把8項漏接能力封口為R1-A～R3-B exact implementation contract。Drawing FFF固定進同一canonical work/transient review並以caller transaction準備／清理／formalize；舊Drawing mutation、Part variant PUT與direct invalidation分別固定410 zero-write。task center復用既有API；Drawing／Part formal obsolete增加個別dependency fingerprint；Part四項variant進work/review/formal snapshot；history／work file／matrix nav／domain filter與signed bidirectional cursor均有exact DTO、route、transaction、query budget與phase gate。schema/migration=`none`、ADR=`No New ADR`、root排除不變。主QA §26與UI-only §28已綁定planned `capability-contract/repository/browser/negative` runners、fixture、fact oracle、four-viewport、primary invariant與evidence manifest。狀態升為`Reopened / RD Implementation Ready / RD Not Started / QA Plan Ready / Current Completion Suspended`；本輪只修改`.ai-doc/`，未改產品／測試碼／schema/data/runtime，未stage／commit／deploy／release。

- 2026-08-25（DEV-087功能完整性CAPA重開）：新舊架構能力盤點確認8項既有使用者功能未完整接回canonical入口／動作／結果／追溯鏈，因此撤回current completion、重開同一DEV-087為`☐ Reopened / RD Contract Ready / QA Plan Ready / Current Completion Suspended`。開發依R1 P0（Drawing變更影響／FFF、任務通知、Drawing／Part正式作廢、Part四項變體屬性）、R2 P1（歷史exact artifact、工作檔管理）、R3 P2（矩陣identity導覽、探索／排序／雙向換頁）分期；主QA新增`QA-087-187..218`共32案與negative completion control，UI-only計畫新增8族journey。先前51-case、DEV-092／094與fresh aggregate只保留Historical Regression Baseline。依使用者決策，本輪排除`part_root`搜尋明細、root狀態／阻擋原因及root整體新增／作廢影響；未修改產品、schema、migration、primary data或runtime，未stage／commit／deploy／release。

- 2026-08-25（DEV-096 Current Phase本機完成）：在既有Part drawer與BOM workbench完成組立件情境式共用BOM，不新增入口。manufactured assembly＋primary M才顯示唯一BOM action；同root Parent可複選共用Definition／Revision，Child候選以logical line與exact Parent mapping保存；初版／下一版、review／release、archive／restore、whole obsolete、permission、consumer及provider-aware migration均收斂到同一authority。fresh aggregate `output/qa/dev-096-aggregate/DEV096-2026-08-24T17-00-05-541Z/`為88/88 PASS，SQLite與disposable PostgreSQL實際mutation、42個named fault checkpoint、四viewport Chromium、typecheck、affected ESLint與123/123 isolated build均PASS；primary SQLite SHA-256前後不變。未執行正式migration、flag activation、deploy或release。

- 2026-08-25（DEV-093 stale Part allocator corrective完成）：使用者畫面揭露existing-root預估P02但提交發生`part_root_id + sequence_code`唯一鍵衝突。根因為preview依正式資料找最低可用號，submit卻只讀可能過期的`numbering_sequences`。現已改為交易內鎖定root流水範圍，依正式Part與recovery reservation重算最低可用號並同步counter；route統一封裝技術錯誤。`npm run qc:dev-093`兩輪fresh Chromium均在P01存在時注入`next_value=1`，UI預估、API及DB全部建立P02，legacy caller／failed request／console／page error=0。證據`output/qa/dev-093/DEV093-2026-08-25T01-32-17-561Z/`。未修改schema或正式資料，未執行deploy／release。
- 2026-08-25（DEV-093 Phase 093-J～L existing-root quiet append完成）：依最新決策只精簡「加到既有圖料」，建立新圖料流程不變。UI移除料件類型、結構型態、共用件、系列代號、規格與「沿用設定」狀態列，只保留root、三種建立內容、必要M／R、必要追加原因、單行「將建立」與一個主要動作；canonical request不傳五項profile，server在transaction內完整繼承，`unclassified`雙層fail closed。歷史證據`output/qa/dev-093/DEV093-2026-08-24T16-38-47-636Z/`已由上述stale allocator corrective evidence取代。未執行正式migration、deploy或release。

- 2026-08-24（DEV-093 Phase 093-I／J 歷史基線，existing-root呈現已由2026-08-25取代）：共用件無原因契約仍有效；當時existing-root顯示唯讀類型的做法已退役，現行UI不得再呈現該狀態。其run只作歷史證據。

- 2026-08-24（DEV-093 Phase 093-H 歷史基線，existing-root部分已由2026-08-25取代）：當時將`自訂規格`與品名命名用`特性／規格型號`合併為單一人類輸入；new-root單一規格來源仍有效，當時existing-root保留規格欄的決策已退役，不得再作現行實作依據。其run只作歷史證據。

- 2026-08-24（DEV-093 Phase 093-G 本機完成）：依最新Human Decision移除新圖料的手動`建立內容`。依圖製作件固定原子建立M圖＋料號；外購標準件預設只建立料號，勾選`同時建立參考圖 R`後才顯示參考用途並建立R圖＋料號；共用件維持獨立屬性，existing-root三種追加選項不變。typed client intent與server route共同拒絕manufactured part-only／R及purchased M。`npm run qc:dev-093`兩輪fresh Chromium aggregate通過QA-093-001..104，最終證據`output/qa/dev-093/DEV093-2026-08-24T06-51-38-512Z/`；typecheck、affected ESLint、122/122 isolated build與main DB hash invariant通過。未新增schema、未恢復legacy authority，亦未執行正式migration、deploy或release。

- 2026-08-24（DEV-093 料件分類整併，最新決策）：人類層料件類型固定為`依圖製作件`／`外購標準件`兩項；`manufactured`／`purchased`只作底層相容值。依圖製作件涵蓋廠內與委外依圖加工，外購標準件表示型錄／標準規格採購；`共用件`維持獨立`isUniversal`＋`universalReason`。同步修改 canonical 建號表單、Part change work／review、impact與approval摘要。PostgreSQL `044`改為`outsourced|custom→manufactured`；舊`shared`須由provider-aware converter逐筆明確分類並保留共用屬性，否則fail closed，禁止猜測。`045`仍將歷史`standard→purchased`。正式套用仍受 unresolved=0、reconciliation 100%與release gate管制；尚未執行正式migration、deploy或release。

- 2026-08-24（DEV-092 CAPA文件建置／DEV-087 QA-QC重開）：依A0006-M01唯讀事實建立P0開發點`DEV-092`，成熟度=`RD Contract Ready / RD Not Started`。revision `0.1`有PDF／SLDDRW／SLDPRT共3筆未移除files與存在的assets／physical bytes，但current migrated work `dcf65c1a-3ede-4fba-a473-f3cf5ef6d6c5`的`drawing_revision_work_files=0`；work API因此回空並阻斷preview／recognition。根因收斂為DEV-087 converter漏轉work-file child rows，加上fixture、zero-loss與completion audit未檢查per-work exact tuple equality。已同步修訂DEV-087 index／SPEC／主QA／documentation map／cold-start及2026-08-23 QC報告重開註記，新增`QA-087-179..186`、composite receipt、idempotent repair、runtime anomaly與negative-control契約；歷史PASS證據保留但不再支持目前結案。ADR判定No New ADR。本輪只改`.ai-doc/`，未修改產品、測試碼、schema、SQLite／physical files、runtime、stage／commit／merge／PR、Cloud SQL、deploy或release。

- 2026-08-23（DEV-090 RD主管readiness remediation）：依使用者要求把RD主管批判結果直接併回同一Implementation Contract。P0修正為`drawing_part_links`只是唯一storage、`RelationFormalAuthorityRepository`才是唯一writer；盤點`numbering-async-repository`、`number-state-flow-async-repository`、`pdm-change-control-domain`、`relation-change-work-async-repository`與sync legacy `numbering-repository`，固定所有current formal flow共用root-first lock及in-transaction typed primitives，raw writer必須遷移或caller=0後刪除。P1/P2同步關閉：`/numbering/search`定義為無矩陣／無edit的`編號搜尋`，全域navigation/recovery caller分流；權限改為page-neutral read entitlement＋`numbering.workspace.update`；single save上限與50×50對齊為2,500；domain/storage enum只在authority mapping；效能採native semantic table先量測、失敗才windowing。QA新增permission matrix、formal-writer convergence、2,500-cell atomic case、全caller journey及八項focused FMEA；SPEC內明定第1～16節為normative contract、第17～22節只作repo binding，並要求090-E清除active文件的雙重Relation authority。P0/P1 readiness gap重新審核為0，狀態維持`RD Implementation Ready / RD Not Started`。本輪只修改`.ai-doc/`，未修改產品code、schema/data、測試、build、runtime、stage/commit/merge/PR、provider、deploy或release。

- 2026-08-23（DEV-090 RD Implementation Ready）：依使用者要求沿用同一DEV-090，把已確認的「Drawing／Part drawer直接編輯正式關聯、取消圖料工作台與Relation審核」補成可派工Implementation Contract。實際盤點branch`持續優化2`／HEAD`c759a7bb`的canonical workbench、Relation list/workspace/change-work/review dispatch、SQLite／PostgreSQL schema、Cloud SQL migration lane、permission、keyboard/drawer mechanics與舊QC caller。為避免新增counter後要求所有formal writer手動bump而再產生漏網，concurrency定案為root＋axis identity/status＋formal links的provider-neutral canonical SHA-256 strong ETag；DB另新增pair unique並保留primary-per-Part partial unique。固定PostgreSQL`043_inline_relation_matrix.sql`、SQLite/PostgreSQL provider-aware converter、single-JSON batch SQL、compact idempotency receipt、完整add/modify/delete檔案清單、090-A～E phase、rollback與`qc:dev-090:*`／evidence path；P0/P1 contract gap=0。狀態升為`RD Implementation Ready / RD Not Started / Local Implementation Eligible / Production Release Gated`。本輪只修改`.ai-doc/`，未修改產品code、schema/data、測試、build、runtime、stage/commit/merge/PR、provider、deploy或release。

- 2026-08-23（DEV-090 RD Contract Ready／關聯矩陣直接正式編輯，已由同日Implementation Contract升級取代）：依使用者最新決策取代前一版「drawer矩陣唯讀、另開Relation工作／審核頁」。新target取消圖料工作台、Relation work、Relation review與專用Relation workspace；Drawing／Part drawer以同一root-level matrix直接編輯，一個明確`儲存`原子更新`drawing_part_links`，不逐格autosave。當時暫定的手動row counter已由上方最新紀錄改成content-derived strong`matrixEtag`，不得再作實作依據。新增SPEC、ADR與QA計畫，固定same-root/company、pair唯一、每個Part最多一張主要製造圖、stale/response-loss/fault rollback、empty-root search、50×50矩陣、SQLite/PostgreSQL parity、active work/review歸零、正式資料reconciliation 100%及caller=0 gate。DEV-087 SPEC／ADR加入future supersession notice；現行runtime未改變。本輪只更新`.ai-doc/`，未修改產品code、schema/data、測試、build、stage/commit/merge/PR/deploy/release。

- 2026-08-23（DEV-090 Local RD／QA-QC完成）：依同一DEV-090實作formal relation authority、`PATCH /api/pdm/relations/[rootId]/matrix`、strong ETag／If-Match／idempotency、SQLite pair unique migration與Drawing／Part drawer inline matrix；所有runtime `drawing_part_links` writer已收斂到authority，Relation list／workspace／change-work service／repository／review caller已移除。`npm run qc:dev-090` focused aggregate、A→B→A與no-op mutation、SQLite migration、retirement 9/9、`typecheck:app`及124-page isolated build PASS；authenticated browser證明圖號／料號drawer矩陣與編號搜尋最小identity，截圖與manifest在`output/qa/dev-090-browser/`。正式Cloud SQL provider parity、zero-loss reconciliation、fresh-session/fault injection與production cutover／release仍受gate，未執行正式資料異動。本機DEV-090狀態升為`RD Implementation Complete / Local QA-QC Complete / Production Release Gated`。

- 2026-08-23（DEV-090 RD implementation remediation／文件同步）：依正式資料零遺失與本機可清除政策，補齊PostgreSQL `043_inline_relation_matrix.sql`的transaction advisory lock、active Relation work/review/quarantine、duplicate／multi-primary／orphan guard、current Relation projection/table retirement與reconciliation assertion；`scripts/migrate-dev-090-inline-relation-matrix.mjs`改為真正provider-aware SQLite／PostgreSQL inventory與隔離rehearsal apply，正式cutover仍需環境授權。SQLite activation新增fail-closed startup cleanup；本機`data/ai-pdm.sqlite`已刪除3筆Relation current projection、移除`relation_change_works`，`drawing_part_links` 3筆與hash不變。canonical current contract移除Relation workbench類型與workspace編輯分支，歷史Relation只保留audit型別；retirement scan擴充至全runtime。`qc:dev-090` aggregate更新為contract 22/22、repository 5/5、retirement 10/10；`typecheck:app`與124頁isolated build PASS。正式Cloud SQL未連線、未遷移、未刪除正式資料、未deploy/release。

- 2026-08-22（DEV-087 UI-only全生命週期驗證子契約）：依使用者要求建立`.ai-doc/qa/qa-dev-087-ui-only-lifecycle-operation-validation-plan-2026-08-22.md`。分母固定為Drawing 27、Part 20、Relation/root 20，共67條AI rendered UI journey，另有11個共同hard gates；所有business mutation只能由UI觸發，API與DB只做唯讀readback，每個checkpoint必須UI／API／DB identity、數量、版次、handling、action與資料hash一致。完整PASS要求67/67、11/11、Blocked/Not Run/P0/P1=0，focused runner或DEV-074舊58/58不得替代。計畫另揭露whole-object obsolete與active work競合、root aggregate obsolete含open child work、Merged缺UI前置、system_admin/blocked缺合法fault profile四項執行前gap；未關閉時如實BLOCKED，不准seed或改DB補造。本輪只更新QA／PM文件並修正DEV-074任務板與既有QC證據不同步，未啟動runtime、未執行UI journey、未修改產品/schema/data、未deploy/release。

- 2026-08-22（DEV-088本機實作與focused QA/QC完成）：在DEV-087獨立commit `862ac611`後完成最小替代料號附件沿用。來源formal Part active direct附件預設全選，可取消任一／全部或同submit加入新檔；Drawing／Revision與`drawing_2d`／`cad_3d`排除。新增兩張snapshot/origin表與PostgreSQL 041，target建立獨立`file_assets` rows但共享immutable storage pointer，不搬source、不複製bytes、不後續同步；source stale、hash+size dedupe、idempotency、batch insert與approval atomic promotion皆已接線。promotion另要求origin數、有效target數與草稿active附件總數完全一致，只更新origin列出的target，任何snapshot外row皆整案rollback。`npm run qc:dev-088` 7/7 PASS：contract 40、repository 29（21附件=14 SQL statements）、HTTP 15、browser 37、change-control 64、typecheck與127-page isolated build；task-owned ports及tracked Next type entry均恢復，3000未受影響。歷史DEV-084五表／permission rewrite／whole-part lease保持退役。Cloud SQL 041 apply、正式provider驗證、deploy、release、production smoke、physical GC與DEV-088 commit未執行。

- 2026-08-23（DEV-087新架構整併與本機舊資料清理）：依最終資料政策，typed canonical detail取代動態欄位、三工作臺共用drawer mechanics但保留domain projection、所有使用者檔案讀取收斂到`/api/pdm/file-assets/{fileAssetId}`，舊workspace頁面／controller／14條410 route與舊binary GET移除；retirement gate改掃全runtime/navigation/API/worker/script caller。主SQLite先在副本演練後清除60個legacy workspace與56筆quarantine，canonical hash不變，review trace 5→7，未刪仍被引用的8個asset與任何physical bytes。新增PostgreSQL provider-aware零遺失converter與阻擋式reconciliation；正式兩次restore rehearsal、cutover與release仍未授權／未執行。
- 2026-08-22（DEV-087本機實作與focused QA/QC完成；preservation部分已被2026-08-23最終政策取代）：完成14-table canonical schema、Cloud SQL migration 042／SQLite ensure、deterministic converter、Drawing／Part／Relation專用work authority、canonical list/detail/commands、Drawing多研發分支與exact revision file/recognition、transient review、cancel cleanup、三工作臺極簡UI與15條legacy draft-workspace route hard retirement。`npm run qc:dev-087` aggregate 8/8 PASS：contract 25、repository 17、commands 39、migration 24、retirement 30、browser 46、typecheck與isolated build；latest browser port 59098 cleanup PASS。當時依Human decision A保留56筆legacy source的內容只作歷史演進證據，不是現行資料政策。DEV-087本機產品範圍完成，production migration／retirement release gate與完整獨立QA仍開放；惡意行為／證據防作弊紅隊依使用者決策延後。

- 2026-08-22（DEV-084歷史ID由DEV-088接替）：依使用者要求將替代料號附件後續工作排在DEV-087之後。為保留穩定追溯，未竄改舊ID：DEV-084改為`Superseded by DEV-088 / Historical ID Only / Do Not Execute`且不計交付；新增DEV-088為`待排 / Follows DEV-087 / Rescope Required / P1`獨立交付點。只有DEV-087本機產品實作、獨立QA／QC完成且現行attachment authority穩定後，DEV-088才進行最小contract重建；歷史五表、權限重建與whole-part lease不自動繼承。041保留改由DEV-088持有，但DEV-087的042仍須在041不存在時獨立運作。本輪只修改文件，未改產品／測試/schema/data/runtime，未建立041或執行migration/deploy/release。
- 2026-08-22（DEV-084延後縮編／DEV-087附件契約解耦）：依使用者確認的建議方案，完整DEV-084不併入DEV-087。DEV-087直接承接「Part附件沿用現行authority、獨立即時生效、不進修改案／review snapshot／active-review lock／cancel rollback」契約；042必須在041不存在時獨立運作，且不得建立DEV-084的替代附件沿用、五表content-binding-version-origin-lease、permission重建或whole-part lease。DEV-084改為`Deferred / Rescope Required / RD Not Eligible / P2`，原SPEC／ADR／QA與Phase 1A～1E只保留為歷史設計；恢復前須重新確認近期價值與最小scope。同步更新DEV、documentation map、cold-start、DEV-087 SPEC／ADR／QA、Approval／Entity Detail，以及file ownership／change-control的supersession boundary；本輪未修改產品／測試/schema/data/runtime，未建立041、未執行migration/deploy/release。
- 2026-08-22（DEV-087 QA主管批判補強／穩定效率優先修訂）：QA計畫由120案擴充至`QA-087-001..165`並建立55項SPEC AC追溯矩陣。依使用者「首重穩定性與效率、防君子不防小人」決策，Phase 0只保留關鍵獨立oracle與3項stability negative control，不建立重型mutation或紅隊反作弊平台；惡意token、暴力猜測、timing side channel、CSRF/DoS與證據偽造攻防延後。新增跨provider同fixture、review terminal跨request/receipt/outbox/audit/log/error/backup留存掃描、crash checkpoints、normal role-change/idempotency、7組linearizability race、model-based sequence、SCALE-10K＋EXPLAIN、baseline p95/p99、20 readers＋5 writers 60分鐘soak、connection/worker backpressure、migration rows/sec/memory/disk/lock/RTO、migration fuzz、GC race，以及真實UI visible-error/data-sanity/200% zoom/quietness hard gate。同步補主SPEC／ADR的terminal safe projection。`package.json`目前0個DEV-087 runner，因此狀態仍是`QA Plan Strengthened / Independent QA Execution Pending`，不是QA PASS；本輪未修改產品／測試/schema/data/runtime，未啟動server，未執行migration/delete/drop/deploy/release。
- 2026-08-22（DEV-087 RD Implementation Ready／全文件矛盾整頓）：RD主管依branch `持續優化2`／audit HEAD `050eedd4`盤點SQLite＋Cloud SQL provider、migration序列、三workbench service/repository/API/UI、permission、owner editors、approval storage與QC runners。固定Cloud SQL `042_status_data_rebuild.sql`（041屬DEV-084）、SQLite ensure、14-table exact schema、canonical DTO、domain command/review routes、query hard caps、converter與exact file/module map；因既有`approval_platform_decisions`永久保存reviewer/decision/comment且不可刪，DEV-087改用`pdm_work_review_requests` transient inbox adapter並永久只留minimal trace。QA擴充至`QA-087-001..120`。依使用者「與過去矛盾以新決策為主、能拆就拆」原則，已在DEV-086 dual-lane、DEV-055/078 status、DEV-085 filter、workbench core、Drawing/Part/Relation owner、approval、entity drawer、lifecycle及相關QA加target supersession boundary；activation後舊current-state/filter/projection/command/fallback必須同DEV退役，歷史QA只作baseline evidence。P0/P1 human/engineering gap=0，文件達`RD Implementation Ready / RD Not Started`；本輪未修改產品／測試/schema/data/runtime，未執行delete/migration/drop/deploy/release。
- 2026-08-22（DEV-087 RD主管決策修訂）：依使用者明確選擇，延續現行same-company non-owner edit scope；current work authority採`drawing_revision_works／part_change_works／relation_change_works`三張專用table，不以legacy mixed workspace承擔新runtime；放棄未核准physical bytes的備份回復功能，但保留DB/schema/binding切換rollback，實體檔只在零有效引用、approved-artifact guard與canonical-only gate通過後永久刪除；branch close改成本期實作，latest approved idle RD以次要風險action`申請作廢`送審，退回恢復idle open，核准formalize後branch closed、current row移除、cap釋放且不得reopen，已核准identity／trace／artifact保留。已同步DEV-087 SPEC／ADR／QA、Approval／Entity Detail／Lifecycle cross-spec、DEV index、documentation map與cold-start；QA擴充至`QA-087-001..110`。此為文件演進歷史，當時的`RD Implementation Readiness Remediation Pending`已由後續RD主管全文件審查關閉；本輪未修改產品／測試/schema/data/runtime，未執行physical delete、migration、drop、deploy或release。
- 2026-08-21（DEV-087初版RD Contract／歷史，已由後續決策取代）：新增`SPEC-PDM-STATUS-DATA-REBUILD-001`、配對ADR與`QA-087-001..066`，將Brief升級為可派工contract。初版與2026-08-22 quarantine保留方向均已被2026-08-23正式零遺失／本機可清除政策取代，不代表目前狀態或QA PASS。
- 2026-08-22（QC journey sequence triage）：D07、D09、D12分別以全新 disposable UI-only runtime 單獨執行並 PASS（13:37、13:38、13:39；各自 C01–C11=11/11、consoleErrors=0、UI/API/DB triad一致），確認全量 run 的三項 BLOCKED 是共享狀態造成的 sequence／fixture 編排缺口，不是產品缺口。後續 full runner 必須以可重置的合法 UI fixture chain 執行，不得 seed／SQL／直接 business API；DEV-087 仍以 67/67 全案例門檻判定完成。
- 2026-08-22（QC journey multi-context triage）：D14、D16、D17 亦以 fresh disposable UI-only runtime PASS（13:41–13:42；各自 C01–C11=11/11、consoleErrors=0、UI/API/DB triad一致），確認同類 multi-context／stale blocker 亦非產品缺口；後續需把 runner 改為每案例可重置 fixture chain，再重跑完整67案。
- 2026-08-22（QC journey 補強 D15／R13）：D15 與 R13 各自以全新 disposable UI-only runtime PASS（13:47–13:48；各自 C01–C11=11/11、consoleErrors=0、UI/API/DB triad一致）；R13 觀測同一 target `200/409` singleton 競合且敗者 zero-write。同步修正 R13 runner return 控制流與預期409監控，確認目前可重現 open product gap=0；DEV-087 仍須以可重置合法 UI fixture chain 完成67/67，未解除 release gate。
- 2026-08-22（QC journey P04 分流）：無 focus full run `DEV087-ui-only-2026-08-22T13-50-24-996Z` 的唯一 `P04 FAIL` 由 runner 舊 Save locator 在 workspace 重繪後點到 disabled button；fresh `DEV087-ui-only-2026-08-22T13-58-29-380Z` 的 `J-P04 PASS`、C01–C11=11/11，故分類為 runner hydration／sequence 缺口，非產品缺口。已改 runner 在儲存前重新定位 enabled rendered button，下一次 full run 必須回歸；目前可重現 open product gap仍為0。
- 2026-08-21（DEV-087 QA remediation／branch cap amendment）：依使用者決策將同一圖號open RD branch hard cap固定為3；第4個新branch以aggregate lock transaction原子拒絕，既有branch仍可續作，stale-base branch只可續minor。QA主管補齊revision tuple／candidate、role/action/company矩陣、DEV-087 review decision scope與Part attachment例外、singleton authority fencing、external-write freeze與RPO=0 rollback、fixed retirement artifact path、completion-audit consumer、FMEA、Phase 1A～1E gates及`QA-087-076..096`。DEV-087狀態為`RD Contract Ready (QA Remediation Revised) / Independent QA Re-review Pending / RD Not Started`；本輪只更新開發文件，未改產品／測試/schema/data/runtime，未執行delete/drop/deploy/release。
- 2026-08-21（DEV-087 Transition Exit／Anti-Forgetting初版，已由後續QA remediation補強）：將「過渡期後回來清除」改為機器可阻擋的同一DEV完成條件。初版加入四種transition modes、machine-readable inventory、`npm run qc:dev-087:retirement`、manifest、fresh-session continuation及release hard gate，QA當時擴充至`001..075`；後續已再固定artifact path、completion-audit consumer與cases `076..096`。任何舊authority active usage、證據缺漏或gate非PASS時仍只能標`Retirement Pending`。
- 2026-08-21（DEV-087 三domain編輯工作區 Human Confirmed amendment）：依使用者最新決策修正「三工作臺共同編輯頁框架」的錯誤方向。唯讀drawer仍可共用shell，但編輯工作區依domain分離：圖號的`進版／進行編輯`固定進入既有canonical full-page編輯器，保留圖面、受控檔案、2D／3D、智慧辨識、欄位核對、儲存與送審，不因狀態重建而重構；料號沒有版次，以`正式資料／修改中`及`建立修改／進行編輯`管理唯一未生效主資料工作副本；圖料根號沒有版次，以`正式關聯／調整中`及`建立調整／進行編輯`管理唯一未生效關聯樹。兩者核准前都不得污染生產使用的正式資料／關聯。三工作臺filter同步改為domain語意：圖號`版本`、料號`資料`、圖料`關聯`，選項與清單文字完全一致；acceptance新增23～30封口editor preservation、single work copy、domain mutation owner與primary action。Spec Impact為`Intentional replacement + compatible preservation`；DEV-087維持`Brief Ready / Human Confirmed / RD Not Requested / Documentation Only`，本輪只更新`.ai-doc/dev_task.md`與`.ai-doc/documentation_map.md`，未修改產品／測試碼、schema/data、runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-22（QC journey 補齊後最新分流；Part 附件範圍已於 2026-08-24 更正）：P05 fresh `DEV087-ui-only-2026-08-22T14-10-35-764Z` PASS，P04→P05 sequential `DEV087-ui-only-2026-08-22T14-13-10-742Z` PASS；儲存控制項重繪競態已由 UI runner 重解定位／有限重試修正。最新無 focus full `DEV087-ui-only-2026-08-22T14-13-47-545Z` 為`41 PASS／26 BLOCKED／0 FAIL`、gates `11/11`、console `0`。已證實產品缺口為`0`；D07/D09/D12/D14/D15/D16/D17/P04/P05/R13均由 fresh／sequential UI triad 證實為 runner／fixture sequence，不改產品邏輯；本段原記載 `P11–P17` 全屬 DEV-088 已失效，現行範圍為 `P11–P13` 屬 DEV-087、`P14–P17` 屬 DEV-088；D25–D27/P18–P20/R15–R20列為尚未證實的產品能力／契約缺口候選。完整DEV-087仍`NOT PASS`，放行門檻維持`67/67 + Blocked=0 + NotRun=0 + gates=11/11 + P0/P1=0`。詳見`.ai-doc/qc/qc-dev-087-ui-only-lifecycle-execution-2026-08-22.md` §28與`.ai-doc/qa/qa-dev-087-ui-only-lifecycle-operation-validation-plan-2026-08-22.md` §0。
- 2026-08-21（DEV-086 CAPA corrective implementation verified）：依使用者回報「版次1.1與1不可同時看到」完成多層次CAPA。根因確認為 on-path flag 未啟用、1.1 fixture 被終結、browser runner 僅做 source assertions，以及正式 row 沿用研發 overlay 狀態；已修正三工作台 dual-lane resolver、lane-specific Drawing status/detail、圖號清單的`版次1／版次1.1`文字、料號／圖料同群組鍵、unified detail suffix handoff與真實 Playwright browser runner。`npm.cmd run typecheck:app` PASS；`npm.cmd run qc:dev-086` aggregate PASS（contract 5、repository 4、api 4、query-budget 6、transition 3、classifier 2、browser 76/76）；A0002-M01與A0002兩組 rendered browser evidence、三 route×desktop/tablet/mobile、lane filter、a11y、network／console／page error與cleanup均完成。DEV-086 狀態更新為`CAPA Corrective Implementation Verified / Local QA-QC PASS / Local Only / Production Release Gated`；CAPA、SPEC、QA、documentation map同步，未 deploy/release。
- 2026-08-20（DEV-082 放大鏡完整取景與高解析重開）：依使用者真實 A0002 畫面，確認既有固定 `3×` 放大鏡只截取約鏡片三分之一寬的預覽 canvas，造成「不鏽鋼SUS304」右側裁切，且主預覽 DPR 上限 `2` 後再放大導致字形模糊。沿用同一 `DEV-082` 與父 `DEV-068`，不另建交付點；主 SPEC 新增 §0.13 並維持 `RD Implementation Ready / RD Not Started`，固定完整文字優先、geometry bbox 安全邊界、自適應倍率、同一已載入 `PDFPageProxy` 高解析 bounded crop、單一黃色鏡框、三 viewport、LRU／取消／失敗恢復及零新增 server compute／第三方流量。QA 新增 `OCR-082-039..044`；既有 `001..038` 僅作回歸基線，A0002 全文與清晰度、`coverageRatio=1`、`pdf_high_res_crop`、backing scale `>=2.5` 未通過前不得恢復父任務完成狀態。本輪只更新既有開發文件與索引，未修改產品／測試碼、schema/data、runtime，未 stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-086 RD Implementation Ready）：沿用同一`DEV-086`把雙lane契約升級為`RD Implementation Ready / Human Confirmed / RD Not Started`。repository audit確認Drawing既有list以unified`drawings.id`為canonical group、目前`overlayLifecycle`會選最高non-terminal revision；Part／Relation缺owner-batch baseline resolver；Drawing release已在既有transaction，manufacturing baseline release與audit則尚分兩次commit。主SPEC／ADR／QA已固定exact file/function/route與SQL intent、signed projection token wire、cursor v2、migration=`none`、既有index、read-only classifier、list/query ceilings`18/18/22`、detail ceilings`18/18/26`、baseline batch=`2`、DEV-086 runners／isolated fixtures／evidence path、Phase 1A～1E與dirty ledger。local DB只有2 Drawing／2 Part／2 Root、無Released package/baseline且56 source-less active workspace，故不得冒充transition evidence；QA必須建isolated deterministic V1/V2 fixtures。branch`持續優化2`／HEAD`050eedd4`及243個既有dirty product paths已記錄，RD必須逐hunk保護。本輪只修改`.ai-doc/`，未改產品／測試碼、schema/data、runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-084 RD Implementation Ready）：沿用同一`DEV-084`完成repository／schema／route／storage／consumer inventory，將RD Contract升級為`RD Implementation Ready / Human Confirmed / RD Not Started / Local First / Production Release Gated`。固定5-table content-binding-version-origin-lease模型、legacy attachment ID backfill、Cloud SQL migration `041`與SQLite ensure path、deterministic same-company content ingestion、exact JSON/multipart wire、formal/draft lease routes、5m TTL／60s heartbeat／15m idle／fencing、interactive與controlled writer guard、draft→formal atomic promotion、new PartAttachmentPanel、feature flag／rollback、Phase 1A～1E及QA-084-01～40／runner／evidence contract。Supabase依退役治理明確排除，Drawing authority與`item_locks`保持不變。P0/P1 human decision gap=0，RD可由本機Phase 1A開始；本輪只修改`.ai-doc/`，未改產品／測試碼、schema/data、runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-084 RD Contract Ready）：依使用者完成的15題引導決策，沿用同一`DEV-084`由Brief升級為`RD Contract Ready / Human Confirmed / RD Not Started`。新增替代料號附件snapshot SPEC與Accepted ADR，固定來源active direct part attachments預設全選、人工取消／新增、source stale重驗、target獨立binding/version、immutable canonical content共用、所有生命週期自由維護、attachment-specific permission／confirmation／approval取消、relation-level delete／exact restore與whole-owner exclusive lease。現況盤點確認`file_assets`仍是single-owner asset row、part attachment writes仍要求`numbering.attachments.manage`，且`item_locks`仍是submission/item-bound而缺renew/fencing/active unique guarantee，因此Spec Impact定為`Intentional replacement + compatible preservation`，並同步修訂DEV-061與change-control target authority。Exact schema/API/migration/file/test/lease與QA尚未凍結，故不得開始RD實作；本輪只修改`.ai-doc/`，未修改產品／測試碼、schema/data、runtime或release邊界。
- 2026-08-20（DEV-086 RD Contract Ready）：沿用同一`DEV-086`把 Human Decision Brief 升級為`RD Contract Ready / Human Confirmed / RD Not Requested`。建立權威雙lane SPEC、Accepted ADR與QA-086-01～32風險計畫；固定Drawing／Part／Root production-effective與active RD來源、derived reference（不設人工pointer／不複製master）、stable lane key、group cursor v2、direct lane filter、exact projection token、permission/cache、legacy fail-closed、umbrella flag與Phase 1A～1E gate。同步在Drawing single-row、Part candidate/formal、Relation source-root overlay、Human Status與Workbench Core既有SPEC／ADR加入target amendment，衝突分類為`Intentional replacement + compatible preservation`。P0/P1產品決策gap=0，但exact file／SQL／index／數值query budget／fixture runner／dirty ledger尚未封口，故不是RD Implementation Ready；本輪只修改`.ai-doc/`，未修改產品／測試碼、schema/data、runtime或release邊界。
- 2026-08-20（DEV-085 RD Implementation Ready）：依使用者要求「補到RD可開發」，沿用同一 `DEV-085`，由 Brief 升級為 `RD Implementation Ready / Human Confirmed / RD Not Started`。契約固定 explicit `all / none / some` selection、`all` 省略 query key、`none` 使用保留值 `__none__`、`some` 使用 repeated query keys，並保留 legacy scalar deep link；共用 client-safe selection helper 與單一 portal popover 負責 Excel 式草稿／確定／取消／全選／indeterminate mechanics，三個 domain adapter 保有選項、標籤、SQL 與 projection。Repository 必須同欄 OR、跨欄 AND、filter-before-limit，none 可安全 short-circuit；cursor hash 使用 canonical arrays。已建立 focused SPEC、QA matrix、exact file/function/test inventory、分期與 stop conditions，並修訂 Topbar／Workbench Core 相容性邊界。P0/P1 產品決策 gap=0，RD 可由 Phase 1A 開始；本輪只修改開發文件，未修改產品碼、測試、schema/data、runtime 或 release 邊界。
- 2026-08-20（DEV-086 Brief Ready）：依使用者指定 `$dev-pm`，建立三工作台量產／研發最新版雙列投影 Human Decision Brief。固定同一 canonical group 最多相鄰兩列、量產在上研發在下；V1 已量產且 V2 編輯／審核時，V1 保持`量產最新版／生產可用`，V2 顯示`研發最新版／目標量產版`及事實狀態。只有完整原子發布成功才把 production pointer 切到 V2；失敗時 V1 不動、V2 顯示`發布未完成`。文件另固定三工作台版別直接篩選、group pagination、lane-aware preview／download／detail、平行設變待確認、Part Number 無 Revision，以及色彩以外的列辨識訊號。Spec preflight 為`Intentional replacement candidate`；成熟度僅`Brief Ready / Human Confirmed / RD Not Requested`，現行 SPEC 仍是 runtime authority，RD Contract 前需修訂受影響 SPEC並建立 ADR。本輪只更新開發文件與文件索引，未修改產品碼、測試、資料或 release 邊界。
- 2026-08-20（DEV-085 Brief Ready）：依使用者指定 `$dev-pm`，建立三工作台 Excel 式複選篩選器的 Human Decision Brief。固定所有實際選項預設勾選、`（全選）`部分選取時為 indeterminate、零選取即零筆且不得解讀為全部；popover 採草稿／確定套用，同欄 OR、跨欄 AND，並要求 URL 還原、server-side pre-cursor filtering、cursor hash 正規化、候選／正式／無值不漏列與四 viewport／鍵盤驗收。此需求另立 `DEV-085` 承接 `DEV-066` 的 filter-semantics stop condition，成熟度為 `Brief Ready / Human Confirmed / RD Not Requested`；本輪只更新開發文件與文件索引，未修改產品碼或 release 邊界。
- 2026-08-20（DEV-082 單一證據預覽面決策）：依使用者確認，PDF證據定位不會在左欄多出PDF頁籤或建立新頁面／檔案。SPEC §0.12.4固定只重用既有2D preview surface：同source/page只疊定位框，跨file/page與多頁PDF在同一viewer暫時導向證據頁；首次進入evidence mode保存preview kind/source/page，返回原圖面或清除焦點後精確恢復。nonspatial CAD不得冒充畫面定位，載入失敗不得留下過期框。同步收緊`OCR-082-038`與`QA-079-26`的DOM／route／network／readback驗收，禁止新增PDF tab、第二viewer、附件、版次或recognition source。此為既有DEV-082 compatible clarification，成熟度維持`RD Implementation Ready / RD Not Started`，未另開DEV／SPEC，未修改產品碼或release邊界。
- 2026-08-20（DEV-082 A0002跨來源版次與證據定位重開）：依使用者實際畫面與本機DB／程式read-only查核，右側PDF tile的「版次已找到」與左側「來源僅存在檔案屬性」不是OCR缺值，而是兩個缺陷疊加：`source_revision / identity_relation / cad_property`與`revision / drawing_revision / pdf_title_block`因key/category不同形成兩個同名候選；workspace固定取`observations[0]`且geometry parser只接受0..1／0..100，PDF.js points／Tesseract pixels沒有page dimensions／origin契約，任何parse failure又被誤稱為檔案屬性。另確認`revision`應為identity evidence-only，否則接受後可落入drawing metadata formalization invalid path。重開既有DEV-082與父DEV-068，不另建平行DEV／SPEC；主SPEC新增§0.12，QA新增`OCR-082-031..038`並收緊DEV-079 QA-079-26，固定canonical `revision / identity_relation / evidence_only`、same-value corroboration／different-value conflict、legacy projection、producer-side normalized page geometry、locatable-first resolver與source-aware truthful fallback。狀態為`RD Implementation Ready / RD Not Started`；本輪只修改既有開發文件，未修改產品／測試碼、schema/data、runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-083 aggregate re-audit／歷史快照，已由後續evidence reconciliation取代）：重跑目前工作樹的`qc:dev-079:contract`與`typecheck:app`均PASS；重新執行`qc:dev-083`取得30 child／22 PASS／8 parent baseline FAIL／0非DEV-083歸因FAIL，affected lint（0 errors／14既有warnings）與isolated build亦PASS。當時aggregate mutation evidence=`output/qa/dev-083-mutation/DEV083-MUT-20260820T075229Z-a928db94/manifest.json`，browser evidence=`output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T075038Z-82d2ff50/manifest.json`，aggregate=`output/qa/dev-083-aggregate/DEV083-aggregate-20260820T075034Z-aaee8256/manifest.json`；本輪收斂DEV-067 UI、DEV-070 cursor contract、DEV-081 shared authority policy與entity-detail pending projection四個parent差異。QA-083-11/12/13/17/18維持PASS，QA-083-19仍為partial authority partition，QA-083-24與8個parent baseline findings保持open；當時completion audit為7/8，剩餘`DEV-065`與external blocked `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001`不屬DEV-083；未stage/commit/merge/PR/deploy/release。
- 2026-08-20（歷史 DEV-082 local completion／已由本節上方 A0002 重開取代）：依當時矩陣完成PDF抽取、成本、隱私、資源與基礎UI `OCR-082-001..030`；後續A0002證據證明未涵蓋canonical revision、geometry conversion、evidence priority與identity formalization，因此只保留為回歸基線，不再代表DEV-082／068 Current Phase完成。
- 2026-08-20（DEV-083 RD Implementation Ready）：沿用同一DEV完成第二次文件升級。Repository audit補抓legacy `NumberStateWorkspaceWorkbench`的可寫candidate drawer，封口`28 source = 8 new + 20 modified`、`19 test scripts = 4 new + 15 parent expectation migrations`、`package.json`、component/function/type delta與dirty hunk ledger。基線在branch`持續優化2`／HEAD`050eedd4fe963d0f225820facec8d221a1df76ce`取得：typecheck、DEV-062、DEV-067 contract/UI/navigation、DEV-072 contract/API、DEV-079 contract與attachments PASS；DEV-067 review、entity-detail、approval-platform保留existing FAIL；relation-view由protected DB guard正確BLOCKED。Exact runners固定為`qc:dev-083:contract|api|browser`與aggregate，尚未建立或執行。主SPEC、ADR、Workbench Core、QA、task與documentation map同步為`RD Implementation Ready / Human Confirmed / RD Not Started`；本輪仍只修改`.ai-doc/`，未修改產品／測試碼，未啟動runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-083 RD Contract Ready）：依使用者「繼續升級開發文件」沿用同一`DEV-083`，由Brief升為`RD Contract Ready / Human Confirmed / RD Not Requested`。Repository audit確認Part／Relation candidate `WorkspaceDrawer`、formal unified projection、legacy Part／Relation maintenance、non-Drawing approval drawer、list-owner href、safe-return與memory-only cursor七類現況；契約固定candidate唯一`/numbering/workspaces/[workspaceId]`、formal Part=`/parts/[partId]/workspace`、formal Relation=`/numbering/relations/[rootId]/workspace`、三domain reviewer=`/approvals/[requestId]`。所有candidate／formal／legacy／unified／approval drawer同次zero-write；只抽`PdmEditPageFrame` mechanics與單一`NumberingWorkspaceEditor`，domain editor保持分離，Drawing現行workspace不重構。Spec Impact=`Intentional replacement + compatible preservation`；修訂既有Unified Entity Detail ADR與Workbench Core compatible contract，不新增ADR、schema、permission、lifecycle、write API或flag。QA-083-01～24、083-A～E、safe return、failure／action ownership／三viewport gate已封口，P0/P1產品決策gap=0，可供RD估工；direct-edit inventory、baseline、runner與產品實作仍待下一次`RD Implementation Ready`。本輪只修改`.ai-doc/`，未修改產品／測試碼、schema/data、runtime、stage/commit/merge/PR/deploy/release。
- 2026-08-20（歷史首次 DEV-068 reopen／DEV-082 PDF內容契約）：依使用者確認必要七欄與剩餘容量效用政策建立child development point `DEV-082`；該契約後續完成`OCR-082-001..030`，又被本次A0002跨來源證據缺陷重開。原決策仍有效，只是完成邊界已擴充為SPEC §0.12與`OCR-082-031..038`。
- 2026-08-19（DEV-035 completion correction／重開）：使用者再次以真實A0002-M01畫面確認native屬性仍為0，並要求日常local/test/real環境都只能透過UI設定key，不接受PowerShell／`.env.local`或手動restart。Runtime evidence顯示latest session三個`native-metadata-bridge.v1`均`unsupported`／0 observations／metadata command未設定；active reference為`local_test_double`且不保存secret material；最近測試只驗證lifecycle/redaction；worker在啟動時綁定command並把broker key寫入process env。依CAPA重開同一`DEV-035 / DEV-CAD-001`，撤回`Local Implementation Complete`與delivery claim；原035-A～D只列partial baseline。現行SPEC為`RD Implementation Ready / Human Confirmed / Reopened`，新增035-E Windows DPAPI／GSM同UI lifecycle、test-double deny、real native probe、worker exact-version hot apply／heartbeat、truthful readiness與038 additive migration，及035-F no-restart／rotation／revoke／restart persistence／real A0002 E2E。QA改為01～64全過才可結案，45～64不再是optional external gate；文件QC另發現completion audit 8/8未解析本DEV，修正已納入validation delta。Reopen delta=`35 files = 23 product + 12 validation`，P0/P1 decision gap=0。本輪只修改開發文件，未修改產品／測試碼、schema/data、runtime或production，未stage/commit/merge/PR/deploy/release。
- 2026-08-19（DEV-035 Phase E implementation）：完成 Windows DPAPI current-user encrypted blob＋ACL、UI-only async probe queue、test-double deny、038/schema/SQLite/RLS 同義表、credential probe C# child、recognition worker child-scope key injection（不寫global `process.env`）、capability heartbeat、exact-version readiness AND gate、Settings testing/worker applying truth-state與completion-gate runtime QC。`npm.cmd run typecheck:app`、`qc:dev-035:contract`、`qc:dev-035:worker`、`qc:dev-035:secure-provider`、`qc:dev-035:worker-hot-apply`、`qc:dev-035:real-ui`、`qc:pdm-settings-center-secret-lifecycle`、`qc:doc-paths`、`qc:dev-task-evidence-sync`與isolated build通過；DPAPI實際round-trip＋`icacls` ACL通過。`qc:dev-035:completion-gate`直接查目前runtime仍為`local_test_double`、無real probe/heartbeat，A0002 native adapter仍`unsupported`／0 observations，故狀態明確為`BLOCKED`，DEV-035不關閉；下一步只剩使用者於UI重新輸入合法key後跑QA-035-45～64與兩次real A0002 E2E。未stage/commit/merge/PR/deploy/release。
- 2026-08-19（DEV-035 runtime checkpoint + worker hardening）：以既有本機 server 執行一次 task-owned smoke worker，實際寫入 `worker_capability_heartbeats` 的 blocked state，確認 UI-only credential lifecycle 的 worker side route 已可達；同步修正 probe heartbeat 在 native child 例外時必須 `finally` 清理，避免常駐 worker 累積 interval。`qc:dev-035:worker`、`npm.cmd run typecheck:app` 與 `git diff --check` 通過。completion gate 仍為 `BLOCKED`，因沒有合法 real key／probe pass／exact-version ack／A0002 native observations；DEV-035維持open。
- 2026-08-19（DEV-035 evidence-audit convergence）：修正 production-readiness parser 對 active `☐ DEV-*` 任務的漏讀與 DEV-035 分類，並修正 completion audit 以 readiness report 的全部 blocker ID 對帳；新增 external-validation handoff 的 DEV-035 runtime entry。`qc:production-readiness:report` 現在明確列出 DEV-035 `external_document_manager` blocker，`qc:dev-task-completion-audit` 的 DEV-035 對帳通過；仍保留真實 key／probe／A0002 gate 未通過的 open 狀態。
- 2026-08-19（DEV-035 no-key worker safety）：native metadata command 已配置但沒有 credential 時，worker 不再 claim recognition job，A0002 session 保持原狀而不新增 `unsupported/0` 結果；`qc:dev-035:worker-hot-apply`、`qc:dev-035:worker`、`typecheck:app` 通過。此行為只延後工作，不取代 real probe、exact-version ack 或 A0002 E2E。
- 2026-08-19（DEV-035 completion-gate strengthening）：completion gate 不再只看 `observation_count`；改為讀取 A0002.SLDPRT 的 candidate/observation、逐一驗證八個 stable key/value、owner、CAD scope、real reader version、source hash，並要求同一 source hash 的兩次結果可重現。現有歷史 `unsupported/0` 因此明確維持 BLOCKED；未以數量或 fixture 冒充 real pass。
- 2026-08-19（DEV-035 local completion）：管理員只透過Security UI建立／測試／啟用Document Manager key，active provider為Windows DPAPI v3；real probe PASS且recognition worker已ack exact version／fingerprint。修正舊worker等待、native child缺TypeScript transform、C# stdout編碼、Document Manager linked/raw欄位、`版次`alias、draft part owner、empty observation驗收與PDF誤投影後，同一A0002.SLDPRT hash在兩個獨立session均由real reader成功產生14筆observation，八欄value／owner／scope全數符合且repeatable。`npm.cmd run qc:dev-035`、completion gate、`typecheck:app`、isolated build、`qc:doc-paths`、`qc:dev-task-evidence-sync`、`qc:source-boundary`與`git diff --check`均PASS；Chrome重整後八欄仍可見、Settings為v3 active／worker可使用，無PDF native-reader假警告。全專案`qc:dev-task-completion-audit`仍為7/8，唯一失敗是既有未完成`DEV-065`，不是DEV-035缺口。任務改列`Local RD Implemented / Real A0002 QA-QC Passed / Production Release Gated`。未執行production migration／deploy／release，也未把2D preview納入完成範圍。

- 2026-08-19（歷史035-A～D readiness，已由上方reopen amendment取代）：依使用者要求沿用同一`DEV-035 / DEV-CAD-001`補到RD可實作，當時固定Document Manager read-only reader、broker、source-content、mapping與safe diagnostics，並以22-file／no-migration規劃派工；此規劃未涵蓋UI secure persistence、real probe與worker hot apply，現行派工不得再引用其completion boundary。
- 2026-08-19（歷史DEV-035 completion聲明，已由上方CAPA作廢）：依當時SPEC完成035-A→D產品碼與focused QC；`qc:dev-035`、typecheck、compile-only與unavailable-state Playwright通過。後續真實runtime evidence已證明native adapter未執行，故這些證據只保留為partial baseline，不再代表local completion。

- 2026-08-19（歷史Brief，已由上方RD Implementation Ready紀錄取代）: 依使用者要求把「SolidWorks 自訂屬性已建好但智慧辨識只有檔案角色」寫成開發文件，沿用既有 `DEV-035 / DEV-CAD-001`，由 deferred 恢復為 `Brief Ready / 待排`，不建立重複 DEV。A0002 read-only evidence確認兩個受控來源皆進 session，但 native metadata adapter 因 `PDM_DRAWING_RECOGNITION_METADATA_CMD` 未設定而 unsupported；本 Brief 固定 native reader、file/config scope、中文／公司欄位映射與diagnostics可視化範圍，明確排除未儲存狀態處理、Add-in路線、CAD回寫、OCR、2D preview與production/release。Spec Impact=`Compatible extension / future phase re-entry`；本輪只修改開發文件。

- 2026-08-19: DEV-079上傳可用性follow-up確認A0002-M01在目前本機資料由`Production User 0003`負責，而瀏覽器登入者為`Demo Engineer`，故owner authority正確拒絕寫入；未放寬permission或改動資料。UI改為唯讀時顯示`查看此版次／唯讀`，並在版次與上傳控制項旁就地說明限制；有權者未選檔時按鈕顯示`選擇檔案後上傳`，避免把正常disabled誤判為上傳故障。QA-079-17與focused contract同步更新。

- 2026-08-19（歷史初盤，已由同日QA矯正取代）: 依使用者指定`$dev-pm`建立`DEV-080 / DEV-PDM-STATUS-VISIBILITY-POLICY-001`的RD Implementation Ready文件與全系統盤點。決策固定每個item第一層`1 primary + 0..1最高嚴重度exception`；`缺製造圖`等阻擋不得hover-only，`關聯完整`等正常成功訊號預設降層；popover需同時支援focus/click/touch/Escape。當時初盤為42個page route、19個直接status-bearing page、23 display contexts、13 axes、20 scopes與`42 direct files`；這些舊數字不得再作RD派工依據。

- 2026-08-19: 依使用者要求將DEV-080第二輪QA盤查補進開發文件。修正漏列的BOM create、lifecycle、recognition review/workspace/pre-submit、part baseline、task critical detail與public-share raw fallback；中央context改為25、scope改為22、42 routes逐條有disposition。現行派工基準為`58 direct files = 30 source + 27 test/QC + package.json`，另43 validation-only source與1 conditional CSS；aggregate明確納入DEV-060、DEV-071、DEV-079、task-center與public-share regressions。原QA的4個P1與2個P2已轉成可執行契約，readiness P0/P1=0，DEV-080維持`RD Implementation Ready / RD Not Started`。本輪只修改`.ai-doc/`，未修改產品／測試／config、schema/data、runtime、production，未stage/commit/merge/PR/deploy/release。

- 2026-08-19: 依使用者要求完成DEV-079 visual-first編輯頁修訂。`HD-079-04`有意取代3A的欄位placement但保留Drawing drawer唯讀、canonical full-page route、既有permission／lifecycle／submission authority與底部單一生命週期action bar；左側改為可切換2D／3D的大型主視覺，右側改為`版次與檔案／智慧辨識`task tabs及獨立scroll。OCR沿用既有recognition session／decision API，以candidate revision未移除受控file asset為來源，可接受／修正並在2D定位證據；進階核對／正式寫入仍走canonical recognition page，且OCR不進submit gate。`npm run qc:dev-079:contract` 21/21、typecheck PASS、affected lint 0 errors；1280×720 readonly browser focused evidence確認左574px／右360px、task body `overflow-y:auto`、兩組tabs與OCR 403資訊狀態。QA擴為QA-079-01～26，四actor／三viewport與owner OCR mutation仍待獨立QC；未新增schema／migration／permission／API authority，未stage/commit/merge/PR/deploy/release，未啟停共用3000 runtime。
- 2026-08-19: 依使用者要求修正DEV-079候選圖號唯讀明細抽屜。新增`圖面預覽`區塊，3D與2D固定同一排並沿用既有candidate file preview authority；新增預設收合的`歷史版次`，每一版可獨立展開查看版次狀態、檔案與唯讀查看入口，不新增schema／API／permission／lifecycle authority。`npm.cmd run qc:dev-079:contract`、`typecheck:app`、affected lint與桌面／390px browser evidence PASS；QA範圍同步擴為QA-079-01～28。A0002-M01目前沒有歷史版次資料，實際畫面以`歷史版次 0 個`呈現；歷史fixture仍由獨立QC補測。未stage/commit/merge/PR/deploy/release，未啟停共用3000 runtime。
- 2026-08-19: 依使用者要求執行DEV-078 Phase 2六狀態UI實作。完成shared `work-status-presentation`、五個server/query入口、sync／async history scope-before-limit、drawing／part／relation／search／legacy parts URL與history同步、badge/filter/drawer consumer切換及compatibility adapters；主要UI固定為`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`。`npm.cmd run qc:dev-078`完整聚合PASS：DEV-078 projection 42/42、contract 53/53、DEV-055/073/062回歸、DEV-053 UI 24/24與real-operation 15/15、entity-detail drawer、typecheck及isolated build 124/124；docs QC為23/23、13/13、8/8。證據見SPEC §19.7與QA §11.3.1；production deployment／release仍由既有gate管控，未修改schema／migration／正式或staging資料，未stage/commit/merge/PR/deploy/release。
- 2026-08-19: 依使用者要求沿用同一`DEV-079`補到RD可實作，狀態升為`RD Implementation Ready / Human Confirmed / RD Not Started / Local Implementation Eligible / Production Release Gated`。Repository inventory固定`33 direct files = 22 source + 10 test scripts + package.json`，另列8個validation-only source；封口079-A route/action foundation、079-B canonical owner/reviewer pages、079-C bidirectional cursor/list-state recovery、079-D atomic Drawing drawer zero-write與079-E QA freeze，並加入component/data flow、dirty-worktree窄hunk邊界、entry/exit gate、整包application rollback與DoD。文件前基線為DEV-067 UI/navigation、DEV-072 contract/API、typecheck PASS；DEV-053 UI 23/24與entity-detail candidate identity為既有dirty FAIL，須在最終QA前歸因關閉。本輪只修改`.ai-doc/`，未修改產品／測試／config、schema/data或runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-19: 依使用者要求執行DEV-078 Phase 2文件QA矯正。前次26檔盤點被本筆明確取代：新增sync／async numbering repository、DEV-062 relation query regression與`package.json` aggregate，現為`30 direct files = 17 source + 12 tests + package.json`，另4個validation-only source。補齊terminal neutral result、tone/icon、fail-closed projector、canonical `humanStatus/history` URL、五host reload/deep-link/popstate、兩legacy API history scope與SQL `LIMIT`前排除terminal；新增legacy-query consumer及aggregate command DAG prevention gates。四組P1已轉成精確contract與可證偽gate，open P1=0，維持`RD Implementation Ready`。本輪只修改`.ai-doc/`，未修改產品／測試／config、schema/data、runtime、production。
- 2026-08-19: 依使用者要求沿用同一`DEV-079`由Brief升級為`RD Contract Ready / Human Confirmed / RD Not Requested`。Repository audit確認legacy candidate drawer、unified drawer、formal revisions page與Drawing approval drawer四條現況；canonical owner route固定為`/numbering/drawings/[drawingId]/workspace`、reviewer route為`/approvals/[requestId]`，舊`/numbering/revisions`僅相容；legacy／unified Drawing drawer同次zero-write，Part／Relation不變。封口stable identity、state×actor destination、surface-aware return、cursor/page恢復、既有permission/API/concurrency、atomic rollout、failure recovery、QA-079-01～22與focused commands；新增QA plan。P0/P1 decision gap=0，可供RD估工，但產品碼／測試碼、schema/data、runtime、production皆未修改，未stage/commit/merge/PR/deploy/release。
- 2026-08-19: 依使用者 `#引導模式` 決策 `1B／2A／3A` 建立 `DEV-079` Human-confirmed Brief：Drawing drawer 全面唯讀，所有圖號 mutation intent 以狀態導向 CTA 前往同分頁、獨立 URL 的 canonical full-page workspace；桌面為左版次／上傳、右 sticky 預覽／readiness與底部 sticky action bar，窄 viewport 同序單欄。Spec Impact=`Intentional replacement + compatible preservation`，明確取代 DEV-053／057／067／072 的 drawer 內 mutation placement，保留 DEV-061／064 資料與檔案 authority、permission／lifecycle／commands／idempotency／concurrency／return contract。ADR 目前不新增；本輪只修改`.ai-doc/`，未修改產品／測試碼、schema/data、runtime、production，未stage/commit/merge/PR/deploy/release。
- 2026-08-19（歷史初盤，檔案數已由上方QA矯正紀錄取代）: 使用者要求將DEV-078 Phase 2升級為`RD Implementation Ready`並盤點修改點。當時初盤為15個必改source、11個必改test scripts、合計26個direct-edit files；此數字不得再作RD派工依據，現行authority是30 direct files。UI覆蓋共9個consumer檔／13個badge掛載點／5個filter掛載點，search另有2處重複availability文字需移除。新增`work-status-presentation.ts`作UI projection authority，Phase 1 DTO／schema／permission／write flow不變；baseline 26/26、32/32、13/13 PASS。本輪只修改`.ai-doc/`，未修改產品／測試碼、資料、runtime或production。
- 2026-08-19: 依使用者確認將DEV-078第一層UI收斂為`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`，以同一DEV新增Phase 2並列為`RD Contract Ready / Human Confirmed / RD Not Started / Production Release Gated`。資料層`responsibilityStatus.category`、`viewerActionability`、`availabilityScope`與既有權限／生命週期不變；`review_owner|system`聚合為審核中，`system_admin|unknown|可用範圍不足`聚合為待確認，角色與異常責任保留在canonical description。SPEC §19、ADR、CAPA §8、QA §11、documentation map與DEV index同步；Phase 1完整QC只作歷史基線。本輪只修改`.ai-doc/`，未修改產品／測試碼、schema/data、runtime、production，未stage/commit/merge/PR/deploy/release。
- 2026-08-18: 使用者要求將同一`DEV-078`升級為RD可實作；狀態更新為`RD Implementation Ready / Human Confirmed / RD Not Started / Local Implementation Eligible / Production Release Gated`。完成repository-specific readiness assessment（P0/P1 gap=0）、exact file/consumer inventory、正式圖面exact reviewer與candidate RD主管role-queue邊界、deterministic mapping、legacy query adapter、Phase 1A→1D、focused QC scripts／package commands、failure recovery與dirty-worktree Git boundary；SPEC、CAPA、ADR、QA與documentation map同步。本輪仍只修改`.ai-doc/`，未修改產品碼、測試碼、schema/data、runtime、production，未stage/commit/merge/PR/deploy/release。
- 2026-08-18: 使用者要求繼續升級DEV-078開發文件；同一DEV由`Brief Ready`升為`RD Contract Ready / Human Confirmed / RD Not Requested`。完成Current Architecture Impact與RD Handoff Contract，採`responsibilityStatus`共享責任＋`viewerActionability`個人可處理性的additive read boundary，固定stable filter、舊query相容、permission/cache/privacy、DEV-073 evidence gate、QA/QC evidence與stop conditions；修訂既有STATUS-UX-004 SPEC、CAPA與ADR並新增focused QA plan。本輪只修改`.ai-doc/`，未修改產品碼、schema/data、test、production、stage/commit/merge/PR/deploy/release。
- 2026-08-18（DEV-078 local implementation follow-up）：依同一RD Contract完成Phase 1A～1D產品實作：新增shared responsibility projector、additive DTO與legacy adapter、stable／mine server filter、drawing／part／relation／detail投影及所有已盤點badge／filter／drawer consumer切換；保留`viewerStatus`相容、private/no-store、exact reviewer與candidate RD主管role queue，不新增schema／permission／assignment。focused evidence：DEV-078 projection 25/25、contract 29/29、DEV-055 projection 71/71、DEV-055 contract 13/13、DEV-073 contract、typecheck、isolated build與DEV-078 browser（4 actors × 3 viewports）均PASS。DEV-073 browser重跑被目前dirty local SQLite缺少可用A0005-M01歷史fixture阻塞；未修改地端資料或放寬expected，完整`qc:dev-078`暫不宣稱PASS。production、stage/commit/merge/PR/deploy/release仍受既有gate管控。
- 2026-08-18（DEV-078 full aggregate convergence）：新增`qc-dev-073-browser-runner.mjs`，以SQLite read-only preflight檢查A0005-M01 canonical/revisions、A0005-P04、drawing number、terminal FFF與A0007 orphan；主資料不符合時只從既有backup／QA artifact挑選通過者，複製到OS temp執行browser並在finally清理。完成`npm run qc:dev-078`完整聚合：DEV-078 projection 26/26、contract 32/32、DEV-055 projection 71/71、contract 13/13、DEV-055 browser、DEV-073 contract／8-case browser、typecheck與124-route isolated build均PASS。文件狀態升為`RD Implemented / Full Aggregate QC Passed / Production Release Gated`；未修改source SQLite、schema、production，未stage/commit/merge/PR/deploy/release。
- 2026-08-18: 依使用者指定 `$dev-pm` 建立 `○ DEV-078 / DEV-PDM-RESPONSIBILITY-STATUS-VOCABULARY-001` 開發文件，狀態為 `Brief Ready / Human Confirmed / RD Not Requested`。固定本責任流程直接涉及的組織角色為 RD／RD主管，畫面人工責任稱謂為負責人／審核負責人／系統管理員；主要狀態改為所有觀看者一致的「待負責人處理／待審核負責人處理／系統處理中／待系統管理員處理」，正常核准後自動發布，只有自動化異常且有 recovery action才交系統管理員。保留「我的待辦」等 viewer-specific utility及DEV-073 evidence gate；本輪只修改開發文件，未修改產品碼、schema/data、production、test、stage/commit/merge/PR/deploy/release。
- 2026-08-18: 使用者在採用 `HD-077-01..03` 並完成 `RD Contract Ready` 後，要求將同一 `DEV-077` 補到 `RD Implementation Ready`。本輪完成 repository-specific Implementation Readiness Assessment，固定 server-owned action policy、`PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE=containment|draft-obsolete|formal-obsolete`、草稿 direct-obsolete 與正式 approval transaction／lock／idempotency、aggregate snapshot、stable errors、exact files、Phase A→B→C、focused QA commands、failure recovery 與 production release boundary；既有 command receipt／outbox 足以承接，預期無 schema／data migration。ADR、三份 SPEC、documentation map 與 DEV-077 QA plan 已同步；狀態為 `RD Implementation Ready / Human Confirmed / RD Not Started / Local-Staging Implementation Ready / Production Release Gated`，P0/P1 readiness gap為0。本輪只修改 `.ai-doc/`，未修改產品碼、schema/data、production allowlist/runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-18（implementation follow-up）：依同一 `HD-077-01..03` 完成 DEV-077 Phase A→B→C local／isolated implementation。新增 server-owned root policy、三段 lifecycle gate、direct draft obsolete、formal root approval snapshot／action isolation、serializable command／outbox／Idempotency-Key與root drawer互斥CTA；focused contract 12/12、gate 5/5、isolated API 14/14、PostgreSQL concurrency 17/17、authenticated browser 27/27、既有 API 23/23、numbering／lifecycle／approval regression與isolated build均通過，typecheck PASS、lint 0 errors（15 warnings）。DEV-077狀態為 `RD Implementation Ready / Human Confirmed / RD Implemented / Local-Staging Implementation Complete / Production Release Gated`；未修改production資料或執行deploy，正式發布仍由`DEV-032` release gate管控。
- 2026-08-14: 使用者再次要求以 `/goal` 完成 `DEV-072`；completion re-audit發現舊final manifest未符合QA要求的commit／dirty hash，並在重跑時捕捉一次Windows `next-env.d.ts` transient lock。RD補上實際HEAD／branch／scoped dirty/content SHA-256與來源檔清單，且只對該已知鎖檔錯誤加最多三次啟動重試；失敗run `DEV072-20260814T045044Z-aca7a0c1`保留。最終aggregate run `DEV072-20260814T050039Z-113d57e2`為21/21、13 screenshots、12/12 visible sweeps、0 console/page error、0 unexpected 4xx/5xx，`npm run qc:dev-072`與completion audit PASS；未stage/commit/merge/PR/deploy/release。
- 2026-08-14: 使用者要求完成 `DEV-072` 開發；本機Phase 1A～1D已落地並由AI真實操作QC通過。完成`pdm-entity-detail.v2`、server capability/action resolver、typed execution、Drawing override退役、共用locked control/tooltip、fixed action slot與既有submit/withdraw/decision整合；final aggregate browser run已由後續completion re-audit更新為`DEV072-20260814T050039Z-113d57e2`，21/21、13 screenshots、12/12 visible sweeps、0 console/page error、0 unexpected 4xx/5xx，stale 409與permission 403旁路資料不變，五種正向mutation exactly once，cleanup完成。`npm run qc:dev-072`與`qc:dev-070:contract` PASS；無schema/migration、新permission/API/dependency/env，未stage/commit/merge/PR/deploy/release，production release維持gated。
- 2026-08-14: 使用者要求將 `DEV-072` 補到 RD 可開發；完成 repository fact finding 與 Implementation Readiness Assessment，同一 DEV 由 `RD Contract Ready` 升級為 `☐ RD Implementation Ready / Human Confirmed / Local Implementation Eligible / RD Not Started / Production Release Gated`，未新開平行 DEV。固定 `pdm-entity-detail.v2`、server capability/action resolver、nullable unique primary、typed execution、stable action IDs/order、locked reason precedence、既有command routing、exact files、Phase 1A～1D與精確 `qc:dev-072:*` command chain；修正 building 狀態尚無 request 時 `view_review/withdraw_review` 為 inapplicable 而省略。P0/P1 readiness gap為0；無schema/migration、新permission、新dependency或env。本輪僅文件交接，尚未修改產品碼／API／data，未stage/commit/merge/PR/deploy/release。
- 2026-08-14: 依使用者指定 `$dev-pm` 建立 `○ DEV-072 / DEV-PDM-DETAIL-ACTION-DISCOVERABILITY-001`，當時成熟度為 `RD Contract Ready / Human Confirmed / RD Not Started`。四工作台共用 drawer 的 applicable action 固定顯示；disabled 以低色階鎖頭保留，原因只在 hover／focus／touch 可存取提示；inapplicable、跨 domain 與 terminal 無恢復 action 完全省略；enabled action 原地解鎖且每情境最多一個 primary。Spec Impact 為 `Intentional replacement`，只改顯示／可發現性契約，不改 permission/state/domain authority。新增 `ACT-001..030` AI 真實 Chromium 操作 QC 計畫，要求 disposable 送審／撤回／審核決策、四 viewport、DOM／network／data／cleanup evidence；本輪只修改 `.ai-doc`，未實作產品、未 stage/commit/merge/PR/deploy/release。
- 2026-08-13: 完成 `DEV-071` 本機 Phase 1A～1D。新增 `bom_drafts.editor_version`、draft-only Floating Topic table／PostgreSQL 035、formal＋floating 雙 graph 原子 PATCH、stale 409、write permission 與 submit/approve/release server fail-closed；實作 10-slot／52px XMind toolbar、canonical picker、Insert Parent/Floating/Group、Enter/Tab/Ctrl+Enter/Space/Alt+UpDown/Delete/Undo/fold/focus/save、blank double-click Floating、hover＋、context menu、三區 drop preview、semantic history、Map/Outliner、branch recovery、More lifecycle actions、inspector與responsive。contract 18/18、API 16/16、migration 21/21、PostgreSQL shadow 27/27、AI browser 56/56／17 screenshots、flag-off browser 10/10、TypeScript PASS，console error 0、非預期 HTTP 0、P0/P1=0。feature flag 預設關閉；未執行 live migration、正式資料、stage/commit/merge/PR/deploy/release。
- 2026-08-13: 使用者要求將 `DEV-071` 直接補到 RD 可開發，並要求編輯肌肉記憶、快捷鍵與按鈕位置幾乎等同 XMind；同一 DEV 已升級為 `☐ RD Implementation Ready / Human Confirmed / Local Implementation Eligible / RD Not Started / Production Release Gated`，未另開平行規格。第 8 節固定 52px toolbar 與 exact slot order、右上 inspector、右下 Map/Outliner＋zoom controls、branch-only recovery、node hover `+`、context menu、三區 drop preview，以及 Enter／Tab／Ctrl+Enter／Space／Alt+Up/Down／Ctrl+Delete／Delete／Undo/Redo／fold／focus 全部 shortcut contract；Web 保留 `Ctrl+R` 與 `Ctrl +/-` 原生行為。資料採 additive `bom_drafts.editor_version`＋`bom_draft_floating_topics`、PostgreSQL 035、雙 graph 原子 PATCH、write permission、optimistic concurrency與 submit/approve/release/export server fail-closed；補 exact files、Phase 1A～1D、XMB-001..016、error、rollback、feature flag與 dirty worktree boundary。本輪仍只修改 `.ai-doc/`，未修改產品碼/schema/data，未stage/commit/merge/PR/deploy/release。
- 2026-08-13: 依使用者指定 `$dev-pm` 建立 `○ DEV-071 / DEV-PDM-BOM-VISUAL-EDITOR-002`，成熟度為 `Brief Ready / Human Confirmed / RD Not Started / Not Requested for Implementation`。XMind 研究轉譯範圍包含靠近節點新增、Enter／Tab 階層編輯、三區拖放預覽、安全單節點／子樹刪除、history 合併、折疊／只看分支、例外 marker 與 Map／Outliner 雙視圖 future capsule。使用者明確確認 Floating Topic 在編輯過程中是必要功能；正式 BOM 仍不得有游離料件，因此它被定義為可保存／重開的「未納入 BOM」草稿暫存區，歸位後才成為 canonical line，未歸位時 UI 與 server 必須阻擋送審、發行及正式匯出。Spec Impact 為 `Intentional replacement`；本輪只修改權威開發文件，未修改產品碼、schema/migration、API、permission、data，未 stage/commit/merge/PR/deploy/release。
- 2026-08-12: 使用者明確要求「完成DEV-070開發」，依既有 Implementation Ready 契約完成本機 Phase 1A～1C：approval inbox 改用 shared PDM workbench mechanics、六來源 scoped/keyset list、signed bidirectional cursor、exact summary envelope、owner-route navigation、無 auto-first-select，並補 submission/BOM company predicate。Focused QC 已通過 contract、query budget、navigation、DEV-062 core、approval regression、typecheck、isolated build 與 browser smoke；PostgreSQL verifier 僅完成 static guard，因本機未設定外部 PostgreSQL 不宣稱 runtime parity。DEV-070 現為 `Local RD Implemented / Focused Contract + Query + Browser QC Passed / Full APW Matrix Pending / Production Release Gated`；未 stage/commit/merge/PR/deploy/release。
- 2026-08-12: 依使用者要求「繼續推進開發文件完成度」，沿用同一 `DEV-070` 升級為 `RD Contract Ready / Human Confirmed / RD Estimation Eligible / Implementation Not Authorized`，未另開平行 DEV。契約固定 approval-specific row、`GET /api/approvals/inbox` query/filter/limit/signed bidirectional cursor、六來源 pre-limit scope/search與 `requestedAt DESC,rowKey ASC` global merge、exact reviewer pending count、`<=16` read budget、shared shell/controller/list/pagination、canonical URL/selected request及server owner href safe return；補齊 permission/fail-closed/race guard、Phase 1A～1D、stop/re-entry與 `APW-001..028` 四 viewport/100+ collision/query/static/browser evidence。Spec Impact 維持 `Compatible extension` 並沿用既有 ADR；無schema/migration。本輪只修改 `.ai-doc/`，未修改產品碼/API/data/permission，未stage/commit/merge/PR/deploy/release；下一步是 RD 估工與 Implementation Readiness Assessment，不代表可直接開工。
- 2026-08-12: 依使用者指定 `$dev-pm` 建立 `○ DEV-070 / DEV-PDM-APPROVAL-INBOX-WORKBENCH-001`，成熟度為 `Brief Ready / Human Confirmed / RD Not Started`。差距盤點確認 `/approvals` 仍以 page-local state、固定 100 筆、專屬 row/CSS 與無 request race guard 的方式維持清單；filters 未保存 selected request，owner route 返回可能失去原列。人類決策固定為共用 PDM workbench mechanics、使用 approval row projection、不搬 relation tree/matrix、不在 approvals 另做明細；PDM request 繼續前往來源 owner module，`returnTo` 必須保存 query/cursor/selection 並遵守「哪裡來，哪裡去」。Spec Impact Preflight 為 `Compatible extension`，ADR 不新增；本輪只修改開發文件，未修改產品碼、API、schema/data、權限、stage/commit/merge/PR/deploy/release。
- 2026-08-12: 完成 `DEV-068` 本機 Phase 1A～1D：14張additive tables、SQLite/PostgreSQL 033、recognition service/repository、upload/package auto-enqueue、versioned worker adapter、同頁六區 review、evidence drawer、responsive impact gate與atomic formalization均落地。focused contract/A0005/schema/browser/typecheck/build全部PASS；A0005 21 candidates、P01-P03基準/變體、governed open field、missing/N/A、idempotency、append-only、stale target、rollback與keyboard/focus均有證據。真實OCR/native CAD品質、migration 004既有drift、production migration/deploy/release仍gated；未stage/commit/merge/PR/deploy/release。
- 2026-08-14: 依使用者確認「辨識功能應在送審前出現」執行流程前移：現有 `新版圖面／歷史版圖面` 附件區新增 `開始辨識`，只引用目前勾選的 canonical master attachments，檔案集合變更會提示上一輪結果失效；`建立送審`仍為主要承諾動作，辨識結果仍須同頁人工核對後才可正式化。新增 SQLite local schema rebuild script 與 PostgreSQL 037 constraint migration；未執行 production/staging migration、deploy、release。
- 2026-08-14: 實機驗證發現本機 queued 工作沒有 worker 取件；已將 local startup 流程補為網站、3D preview 與圖面辨識 worker 一起啟動，並讓最新 session 只在來源檔案集合相同時顯示，避免歷史版次誤掛另一組檔案的辨識結果。A0005 0.3（`A0005.SLDPRT` + `A0005-M01.SLDDRW`）實際跑出 21 筆候選：SUS304 基準、P02 SUS301、P03 黑色、表面處理／變體備註與圖面證據，停在人工核對，未直接寫入 PDM；真實 OCR/native CAD provider 仍是 release capability gate。
- 2026-08-12: 依使用者在 `RD Implementation Readiness Assessment` 上要求「繼續推進」，完成 `DEV-068` repository-specific readiness 並升級為 `RD Implementation Ready / Human Confirmed / RD Not Started / Production Release Gated`。主 SPEC 現已固定 14 張 additive physical tables、SQLite baseline/local apply、PostgreSQL 033、exact repository/service/API/UI/worker files、三個 action permissions/default roles、default-off flag、platform command/outbox atomic formalization、deterministic locks/fingerprints、provider-neutral external JSON OCR boundary與 Phase 1A～1D。新增 QA `DRR-001..060` 與 A0005 fixture manifest；本機確認 A0005 3D/2D hash、M01→P01/P02/P03 關聯及 SUS304/SUS301、無/黑正式變體 baseline。未安裝／設定真實 OCR provider，因此 provider accuracy 保持 release capability gate，未偽稱通過。本輪仍只修改開發文件，未修改產品碼/schema/data，未stage/commit/merge/PR/deploy/release；下一步等待明確 `執行 RD 開發`。
- 2026-08-12: 依使用者在 `DEV-068 Brief Ready` 上要求「繼續推進」，將同一 DEV 升級為 `RD Contract Ready / Human Confirmed / RD Estimation Eligible / Implementation Not Authorized`，不另開平行 DEV。新增權威 SPEC `SPEC-PDM-DRAWING-RECOGNITION-001`，固定 canonical asset-bound session、observation/candidate/evidence、company-scoped 彈性欄位字典、同頁六區審核、共用基準＋逐料號差異、dedicated run/review/formalize permission、zero-write 影響計算、target concurrency、idempotency、原子正式化、successor rerun、A0005 pilot 驗收與 stop/re-entry；同步解決 change-control 的固定來源優先序未決項，並對齊 drawing submission/package Phase 5。RD 下一步只可估工與 Implementation Readiness Assessment；本輪未修改產品碼/schema/data，未選 provider/license，未stage/commit/merge/PR/deploy/release。
- 2026-08-12: 使用者要求「補到RD可實作」，同一`DEV-067`已由`Brief Ready`升級為`☐ RD Implementation Ready / Human Confirmed / RD Not Started`，不另開平行DEV。Repo fact finding確認可沿用typed workbench keys、`withPdmWorkbenchReadSnapshot`、approval request/target indexes、candidate `review_locked`與drawing lifecycle exact reviewer authority，無schema/migration需求；同時確認`/approvals`仍有approval-only snapshot附件/preview/raw JSON composition與正式Drawing/Part/Relation mutation缺少統一review lock guard。主SPEC現已固定exact envelope/fields、unified GET facade、server allowlist policy、single snapshot、review receipt、action-to-owner registry、multi-root ambiguity fail-closed、same-transaction lock、preview polling、safe return、query budgets、feature rollback、exact files與Phase 1A～1D。新增QA plan `UDD-001..050`與FMEA、四viewport、network/DB/browser evidence gate。本輪仍只修改開發文件，未修改產品碼/schema/data，未stage/commit/merge/PR/deploy/release；下一步RD可直接開始本機Phase 1A。
- 2026-08-12: 依使用者指定 `dev-pm` 建立並擴充 `○ DEV-067 / DEV-PDM-UNIFIED-DRAWING-DETAIL-REVIEW-001`，成熟度為 `Brief Ready / Human Confirmed / RD Not Started`。程式盤點確認目前只共用 `DrawingWorkspaceDrawer`／`DrawingDetailContent` 外殼，candidate/formal preview、附件／版次、readiness、relations與legacy flag-off detail仍分叉；使用者因此確認所有圖號狀態收斂為 `UnifiedDrawingDetailDrawer` 六區固定架構。`/approvals`只保留總表入口；圖號／料號／圖料關係審核直接進送審者原 owner route，共用locked owner data與自動preview，只讓狀態／角色操作列改變，並以validated `returnTo`遵守「哪裡來，哪裡去」。Spec Impact Preflight為`Intentional replacement`；本輪只同步開發文件，未修改產品碼、schema/migration、資料、stage/commit/merge/PR/deploy/release。
- 2026-08-12: 使用者再將 DEV-067 提升為跨 Drawing／Part／Relation 的 `UnifiedPdmEntityDetailDrawer`。差距盤點確認 Part candidate/formal 與 Relation root/target 也有不同 composition；因此建立 `ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001`，選擇 shared composer + domain-owned projections + server-derived `none/summary/full` policy，拒絕巨型條件元件。一般 Drawing/Part surface依任務刪減、Relation為full aggregate；assigned active reviewer僅在exact request/company scope內取得full aggregate與`ReviewContextProjection`。前版「reviewer/submitter章節完全相同」被有意取代，但相同projection components、locked owner data、snapshot evidence-only、server lock與safe `returnTo`保留。本輪仍只同步開發文件，未修改產品碼、schema/migration、資料、stage/commit/merge/PR/deploy/release。
- 2026-08-12: 依既有 DEV-067 實作契約完成本機 Phase 1A～1C/1D focused slice：新增 unified contract/policy/service/repository、request-scoped review receipt、三域 projection 與單一 drawer、owner inbox href、review media scope、active-review transaction guards、feature flag與 QC scripts；candidate/package/formal preview均沿用 owner media authority，統一 Drawing 預覽直接使用 `DrawingDetailPreview`，`/approvals` enabled path只保留 inbox。contract／policy／UI／preview／navigation、SQLite query-budget、隔離 PostgreSQL concurrency/lock、isolated build 125/125、affected ESLint與`git diff --check`通過；disposable authenticated browser已驗證三入口、review owner route、scope/快照區、1440/390、close/Escape/returnTo。完整 UDD-001..050 四 viewport keyboard/a11y/network matrix仍保持開放，未宣告完整 QA/Done；未stage/commit/merge/PR/deploy/release。
- 2026-08-11: 依使用者指定 `dev-pm` 與 `#引導模式` 建立 `DEV-065 / DEV-PDM-WORKBENCH-PREVIEW-GALLERY-001`；使用者確認 `1A/2A/3A`。本輪已完成本機產品實作與 additive 031 artifact，包含 deterministic root/latest/hash/non-fake resolver、protected stream、共用 switch/gallery、URL/local preference與 focused contract QC 10/10（含可執行 representative fixture）；未執行 production/staging migration、資料修復、stage/commit/merge/PR/deploy/release。Chromium smoke 因 managed local auth 無 bootstrap user 暫列 BLOCKED，未誤宣告 QA 完成。
- 2026-08-10: 依使用者 `#引導模式` 明確確認 `HD-061-01..03` 後完成 `DEV-061` 本機 Phase 1A～1D。圖號只保留受控版次檔，料號保留精簡且不收合的文件清單；每次首版／進版 hard-require 本次上傳 `.SLDDRW` + `.SLDPRT/.SLDASM`，相同 3D bytes 由系統在 company/owner scope 內共用 canonical asset；generic drawing attachment POST 退役為 410，預覽圖可直接點擊開啟。`qc:dev-061`、isolated real-operation 14/14、build、typecheck、affected lint與migration mirror通過；cleanup 只執行 dry-run，現有 12 筆候選未刪除。production deletion、live migration、commit、deploy、release仍各自受 gate 管理。
- 2026-08-10: 依使用者明確指令完成`DEV-060` Phase 1A～1D本機RD/QA/QC。已落地canonical `part_numbers` owner、獨立`bom_revision`、SQLite compatibility migration與PostgreSQL 028/Supabase mirror、create-context/generic create/XLS/from-assembly canonical adapter、company/role permission、atomic idempotency receipt/readback、occupied/non-forward BOM Rev gate、`/bom/new`兩步驟三來源、`draftId`工作台交接、canonical review/release/export/read權限；頂部`Current/Next/5 steps`雜訊維持移除。`npm.cmd run qc:dev-060-bom-create` 50/50、migration baseline 21/21、TypeScript與affected ESLint通過；三來源真實UI、Engineer自有料號、R&D Manager、跨公司403、Manufacturing/Procurement唯讀、1440/1024/390 viewport、Released CSV與null child revision release均有證據，`productionConnected=false`、`productionWrites=false`、`cleanupStatus=removed`。未stage/commit、未apply live migration、未deploy/release。
- 2026-08-10: 依使用者 HCS 引導決策 `1A / material identity rule / 3B`，將 `DEV-060` 從 Brief 升級為 `RD Implementation Ready / Human Confirmed / RD Not Started`。新增 `ADR-PDM-MATERIAL-IDENTITY-REVISION-001`，正式確立 Part Number 是無版次物料身份、Drawing/BOM 各自獨立版控；同身份只升實際受影響定義 Rev，FFF、互換性、法規／品質管制或其他身份條件改變時建立新 Part Number 與其自己的 BOM。BOM SPEC 第 17 節補齊方案 B 兩步驟全頁、CAD/XLS/空白人工三來源、canonical `part_numbers` owner、獨立 `bom_revision`、additive dry-run migration、generic create API、permission、idempotency/readback、error/recovery、逐檔 impact、Phase 1A～1D 與 stop conditions；新增 DEV-060 QA plan，並同步修正 change-control、drawing-submission、transfer-package與 documentation map 的料號版次舊語意。本輪只修改開發文件，未實作產品碼、未 apply migration／修改資料、未 stage/commit/merge/PR/deploy/release。
- 2026-08-19: 依使用者真實A0002畫面與runtime／DB證據重開`DEV-056 Phase 1E`並補至`RD Implementation Ready`。`A0002-M01.SLDDRW`為`drawing_pdf/queued`、attempt 0、無owner，專用2D worker未啟動；確認launcher未認UI DPAPI key、producer/worker kind不一致及unified detail未套queued stale recovery。現行契約固定UI-only DPAPI/GSM broker hot apply、SLDDRW Phase 1 `native_thumbnail_png`、獨立2D heartbeat與真實A0002 PNG/browser completion gate；本輪只更新文件，未修改產品碼、DB、runtime或release狀態。
- 2026-08-19（DEV-056 RD completion）：依使用者「請執行」完成Phase 1E-A～D產品實作與local evidence。launcher改為不依plaintext env啟動2D worker；worker以UI-managed secure provider exact active version hot-apply並回報`solidworks_2d_preview_png`；SLDDRW producers/claim統一`native_thumbnail_png`；錯kind、queued/running stale recovery與unified detail projection已收斂。A0002 source hash/bytes保持不變，job `d8d13547-da31-4bb1-8b72-d352a083a516`由dedicated worker claim並成功產生640×480 current-hash PNG，heartbeat ready/version 3；`qc:dev-056:2d-preview-e2e` 18/18、`qc:dev-056:2d-preview-browser`三viewport、`qc:dev-035:completion-gate`與focused regressions全數PASS。temporary worker已停止，既有3000 runtime保留；DEV-056標記`RD Implementation Complete / Local E2E Verified / Production Release Gated`，未執行production/deploy/release/migration/資料修復。
- 2026-08-07: 歷史partial baseline曾記錄`DEV-056 Phase 1 Preview Auto-Orchestration`完成。native attachment list/create自動enqueue、前景pending polling、5秒worker heartbeat、30秒stale recovery（最多3次）、current-worker completion/failure guard與icon/tone/motion狀態UI已落地；3D `.SLDPRT` worker完成後瀏覽器自動由`建立中`轉為PNG，無需手動重新整理，2D無可用worker時顯示`處理較久／系統會自動接續`。native QC 101/101、redaction 68/68、master-attachments 103/103、TypeScript、lint、local health與隔離browser visual QC通過；2026-08-19重開後，此證據不得再代表2D preview完成。
- 2026-08-07: 使用者授權`DEV-039 Phase 1B`本機執行。先建立checkpoint commit `4c98cd15`，再抽取非modal共用`PdmEntityDetailDrawer`，供drawing、part、relation-search及candidate/reservation details共用header、單一inline X、透明非阻塞overlay、resize/width persistence、outside/Escape close、row-to-row switching、scroll reset與entity metadata；domain body及modal confirm維持分離。同步集中human-status filters與drawer width來源。focused QC 19/19、23/23、12/12、8/8、13/13、TypeScript、scoped lint及authenticated browser smoke通過；未改schema/migration/正式資料，未deploy或release。
- 2026-08-07: 依使用者決策刪除圖號工作台總表「下一步」欄與列內重複CTA，表格收斂為`圖號／品名／工作狀態`三欄；server primary action與權限說明仍保留於明細抽屜，不改API、domain lifecycle或寫入流程。同步更新DEV-053/055 contract、browser操作路徑與STATUS-UX-004 QA gate；`DEV053 UI 23/23`、`DEV055 contract 13/13`、TypeScript、scoped lint及隔離browser三viewport PASS。
- 2026-08-07: 依使用者要求執行`DEV-055 viewer-aware responsibility projection`。保留客觀`humanStatus`，新增actor-specific`viewerStatus`：`待你處理／等他人處理／系統處理中／可使用／已結束`；drawing workbench以owner/reviewer為優先證據，part/relation因尚無個人assignment model而以role capability表示共享工作佇列。viewer filter改在response limit前依actor分類，相關API加`private, no-store`；共用badge懸浮層改用人類語言說明責任、是否自動完成及下一步。新增role matrix、filter與cache contract驗證；不修改domain lifecycle、schema/migration、正式資料、production、deploy或release。
- 2026-08-07: 依使用者要求執行`availabilityScope`擴充。保留`humanStatus`與`viewerStatus`，新增客觀可用範圍投影：研發受控顯示`研發可用`，正式發布且製造依賴完整顯示`生產可用`；發布衝突、主要製造圖未發布或關聯缺口時 fail closed，不宣稱生產可用。新增主要製造圖 record status 的 read-only查詢欄位，未修改schema/migration、domain lifecycle、正式資料或寫入流程；同步補 availability matrix、API DTO、badge說明與browser QC。`qc:dev-055:projection` 44/44、contract 13/13、隔離 Chromium 三 viewport、TypeScript、affected-file ESLint 通過。
- 2026-08-06: 完成`DEV-055 Phase 1A～1D`本機RD與QA/QC。新增`HumanStatusProjection`、part/relation/drawing projectors與共用`HumanStatusBadge`；三個清單與明細抽屜改用單一主要狀態，新增工作狀態篩選，server filter先於response limit，料號抽屜收斂至共用overlay與單一inline X，移除「草稿確認」及重複 primary badge。`qc:dev-055:projection` 21/21、contract 10/10、隔離 Chromium browser（API rows: parts 5 / relations 3 / drawings 5）、TypeScript、affected-file ESLint、entity-detail-drawer 15/15、part-number-module 86/86 全部通過；未修改正式資料、schema/migration、commit、deploy或release。既有關聯操作 suite因protected runtime guard未直接執行，列為正式release前 disposable DB gate。
- 2026-08-06: 完成`DEV-053 Phase 1H`本機RD、AI QA與獨立QC。已落地native drawing-revision lifecycle authority、026 schema/mirror、8B全批次active adoption guard、9B無永久notification的current-state/task projection、10B cleaned-link latest redirect、pre-decision withdraw、optional correction reason、7-day payload-free token、terminal cleanup、單一CTA與legacy mutation 410 closure。AI QA與獨立QC各59/59，獨立run `DEV053-PHASE1H-20260806-134417`為8/8、production connection/write false、cleanup removed；TypeScript、30檔scoped lint、isolated build、Supabase mirror 76/76及approval-platform 126/126通過。27個frozen product檔與DEV-054 protected hashes不變。未stage/commit，未修改固定3000或production，未執行live migration/adoption/flag/deploy/release。
- 2026-08-06: 依使用者要求將 `DEV-055` 補至 `RD Implementation Ready / Human Confirmed / Awaiting Local RD`。完成實際 repo/file impact、closed `HumanStatusProjection` contract、drawing/part/relation projector matrix、server API/list-detail parity、server filter-before-response-limit、part owner `PdmDetailDrawer` 收斂、stale drawer recovery、無 schema/migration 相容契約，以及 1A～1D sequential gates與 `qc:dev-055` QA/QC mapping；drawing workbench cursor沿用既有契約，parts/relations client pagination保留為future capsule；P0/P1 open question為0。Spec preflight對 STATUS-UX/NEXT-STEP/DEV-053為 compatible exception，對 relation root多 badge為 intentional replacement。本輪只修改開發文件，未修改產品、資料、production、commit、deploy或release。
- 2026-08-06: 依使用者指定 `dev-pm`，建立 `DEV-055` 任務導向人類狀態投影開發文件、ADR 與 QA 驗證計畫，狀態為 `Brief Ready / Human Confirmed / RD Not Requested`。Phase 1 固定圖號、料號、圖料總表每列一個主要狀態、完成 evidence gate、覆蓋式共用 owner drawer、完整結果集 filter 與 1440／1024／390 browser QC；`STATUS-UX-001～003` 的字典／狀態軸保留為 detail/help authority，圖料關係原多 badge summary 由新規格 intentional replacement。本輪只修改文件，未修改產品、schema/migration、資料、production、commit、deploy或release。
- 2026-08-06: 使用者以引導決策`8B 9B 10B`完成DEV-053 Phase 1H RD契約。文件升級為`RD Implementation Ready / Human Confirmed / RD not started`：啟用前對所有進行中圖面進版workflow做all-or-nothing adoption，completed/unknown資料維持永久；必要通知改為同交易更新drawing/current-task projection，不建立永久審核notification；cleaned deep link導向drawing最新版。權威SPEC 0.10已固定native action、026 schema/mirror、durable part scope、transient workflow/reviewer/token、narrow delete guards、adopter、API/errors、FK cleanup order、exact files、1H-1～1H-4切片與H-QA-01～20。DEV-054、產品程式、schema/migration、資料、commit、deploy與release均未執行。
- 2026-08-06: 使用者以引導決策`5A（理由選填） 6A 7A`關閉DEV-053 Phase 1H剩餘產品決策，文件升級為`RD Contract Ready / Human Confirmed / RD not started`。退回理由只在目前correction state有效且重新送審即刪；版次結果固化與必要通知送達後才清除workflow business data；technical idempotency/recovery token最長7天且禁止人員、理由、檔案與snapshot payload。RD Contract已補server lifecycle precedence、唯一semantic CTA、第一decision前撤回、domain-scoped terminal cleanup、既有資料grandfather、API/deep-link/permission、transaction/recovery、QA/QC evidence與stop conditions，並同步修正approval platform永久audit契約的圖面進版限定例外。本輪只改權威開發文件；未修改產品、schema/migration、既有資料、DEV-054、commit、deploy或release。
- 2026-08-06: 使用者以資深PM視角確認將DEV-053收斂為`2-1-1-0`精簡系統：兩個操作介面、一個使用者狀態、一個primary CTA、零個可見legacy操作。新增`Phase 1H Single Lifecycle and Approval Authority Convergence`並標記`Brief Ready / Human Confirmed`；保留Phase 1A～1G本機成果為歷史證據，尚未開始Phase 1H RD。本輪只更新DEV-053權威文件與索引，未修改產品、schema/migration、既有資料、DEV-054、commit、deploy或release。
- 2026-08-06: 使用者確認A0005-M01進版必須同時帶P01/P02/P03，完成`DEV-053 Phase 1G Multi-Part Batch Revision`本機實作。UI預設全選合法主要料號並顯示`1 張圖・N 個料號`／全成全退；API改接非空`partNumberIds`，新增additive `submission_part_scopes`與PostgreSQL/Supabase 025 artifact，舊submission零回填並保留scalar compatibility；建立、FFF scope、歷史搜尋與release改為多料號且原子rollback。固定3000真實操作確認3↔2選取、console error 0、overflow 0且未送出A0005。TypeScript、production build、atomic release 45/45、security、access repository 236/236、change control 62/62、Supabase mirror均PASS；production migration/deploy/release與commit未執行，DEV-054 protected files hash/範圍未更動。confirmed-impact多料號在逐料號替代契約完成前保持fail closed；舊mutation suite另有小數版release/nonBlockingHistory契約債，未以放寬正式政策處理。
- 2026-08-06: 修復`DEV-053`／圖面進版核准後狀態不同步缺口。根因為FFF影響審核核准已寫入`review_confirmation_events`並從審核工作台移除，但一般送審附件查詢只辨識候選號review companion，導致小數研發版仍顯示送審中。RD新增小數版effective `ReviewApproved`投影、送審明細狀態與Now What、整數版自動承接原approval/release workflow；未新增schema、未改既有A0005資料、未碰DEV-054。`qc:pdm-drawing-revision-package-model` 63/63、TypeScript、受影響檔ESLint與3000唯讀browser驗證通過；`qc:pdm-drawing-submission-review-only`與UI operation runner仍有既有測試契約／登入locator失敗，未以放寬產品政策處理。
- 2026-08-05: 使用者以引導決策`1A 2A 3A 4A 5B 6A`完成`DEV-053 Phase 1F`需求收斂。PM/RD preflight確認現有candidate file/evidence/attachment/revision資料模型足以實作，不需schema/migration；開發文件已補normal fixed-3000 hash-verified evidence、多檔與逐檔恢復、每圖至少一個主要受控檔blocker、缺格式warning、預設all且歷史toggle、Rejected correction、request/cursor/selection一致性、keyboard、controlled/reference attachment authority、共享revision drawer、exact permission/admin routing、affected files、四個sequential slices、stop conditions與F1 QA delta。狀態升級為`RD Implementation Ready / Awaiting Local RD`，下一步為`1F-1`；本輪只改文件，未修改產品、schema/migration、既有資料、DEV-054、commit、deploy或release。
- 2026-08-05: PM主管依使用者固定3000實際操作、Phase 1E前後程式與交付證據重審`DEV-053`，確認16組產品／交付缺口，將任務重啟為`Phase 1F Brief Ready / Current 3000 Not Accepted / Production Release Gated`。開發文件已補完整gap matrix、UX意圖、scope/out-of-scope、驗收方向、根因／CA／PA、AI真實操作F1-QA-01～11與QC reopen規則；先前27/27、50/50與獨立QC PASS全部降為歷史凍結快照，不得作目前驗收。下一成熟度為`RD Contract Ready`，本輪僅修改DEV-053文件，未修改產品、schema/migration、既有資料、DEV-054、commit、deploy或release。
- 2026-08-05: RD完成`DEV-053 Phase 1F`的1F-1～1F-4，AI QC以current source重跑`npm run qc:dev-053`並全數通過：schema 9/9、read 10/10、HTTP 13/13、UI 20/20、flow 7/7、real operation 27/27、TypeScript PASS；optimized build compile與122/122 static pages通過。固定3000只讀smoke確認新UI已載入，既有A0005未被寫入；隔離run cleanup removed且production writes false。DEV-054維持受保護。狀態更新為`Local RD / AI QC Passed / Commit Pending / Production Release Gated`。
- 2026-08-05（歷史Phase 1E紀錄，已被上方Phase 1F重啟取代）: `DEV-053`凍結commit `6ddd5759e22178b7004e5d5a9927b0dfbe11b706`完成獨立QC並判定PASS，P0/P1/P2皆為0。QC在短路徑、`npm ci`、乾淨detached worktree重跑focused 50/50、TypeScript、scoped lint與`npm run build:isolated`，全部通過；獨立真實Chromium run `DEV053-20260805-035048-local-isolated`為27/27、14張截圖，涵蓋舊reserved URL、既有保留號原地推進、真實上傳、送審/撤回/再送審、核准原子正式化、正式受控檔唯讀、四種viewport與reload冪等。`productionConnected=false`、`productionWrites=false`、cleanup=`removed`。commit未含DEV-054、DVT/phase-gate刪檔、023/024 migration或project-status removal；DEV-054仍保留在未暫存工作區。該次狀態曾更新為`Independent Local QC Passed / Production Release Gated`，未部署或修改production。
- 2026-08-05: `DEV-054`完成 QA 退回後的 RD 全鏈路修正與獨立 QA/QC。active PLM phase-gate schema/API/UI/approval blocker、DVT page/API、第三品質階段語意及舊註冊測試殘留已移除；品質階段只保留研發階段／技術移轉，變更管制為獨立維度。專項 gate 10/10、隔離 API 396/396、approval 125/125、access control 245/245、DB split 129/129、numbering core 232/232、submission gate 15/15、transfer 18/18、release 31/31、change control 62/62、Supabase migration 72/72、TypeScript、lint及122-route isolated build均通過。瀏覽器R12為3 viewports × 5 routes、15/15，browser error與非預期overflow為0；舊routes在slice-disabled隔離router均為404。狀態更新為`Local RD/QA/QC Passed / Production Release Gated`；未執行live migration、production data rewrite、deploy或release。
- 2026-08-05（歷史Phase 1E紀錄）: 完成`DEV-053 Phase 1E Regression Recovery`本機實作與AI QA證據凍結。單一`圖號工作台`恢復CAP-01～14：用途/資料狀態/系列/關鍵字篩選、關聯料號與治理摘要、圖面進版、上傳送審、完整圖料關係、製造影響、受控檔案摘要、發布不一致、Title block風險、送審完整性、同根料號、料號主資料編輯、標準成本與主要製造圖；生命週期primary CTA維持唯一，production-slice/權限限制維持可見且fail closed。focused contracts為schema 9/9、read model 8/8、HTTP 10/10、UI 16/16、flow 7/7；全`src` TypeScript與DEV-053 lint為0 error。乾淨 staged product snapshot隔離真實Chromium run `DEV053-20260805-033336-local-isolated`為27/27，含真實PDF上傳、送審/撤回/再送審、reviewer核准、原子正式化、正式附件readback、四種viewport、zero-write與reload冪等；`productionConnected=false`、`productionWrites=false`、cleanup=`removed`。共用檔採hunk級邊界，未修改、還原或提交DEV-054的DVT刪檔、023/024 migration、專案狀態移除程式與文件。當時狀態為`RD and AI QA Evidence Frozen / Independent QC Pending / Local Only`；production activation/deploy/release未授權。
- 2026-08-04: 依使用者「下一成熟度為RD Implementation Ready，請推進」，完成`DEV-053` Implementation Readiness Review並改為`☐ 可執行 / Awaiting Phase 1A Local Execution`。repo盤點發現現有append workspace只有source root，無法保存使用者指定的existing drawing/part；已建立並Accepted `ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001`，採server-side一致性投影及workspace三個nullable source-context欄位，既有rows保持NULL且不backfill。SPEC/QA/dev board已補exact files、PostgreSQL 022與Supabase mirror、relationship-only append、atomic cross-boundary relation、opaque keyset cursor、正式版次local-draft狀態限制、`PDM_UNIFIED_DRAWING_WORKBENCH_V1` default-off、Phase 1A-1D、focused commands、rollback與production release feasibility；P0/P1 open question為0。下一步只執行Phase 1A本機read foundation，本輪未修改產品、schema實體、資料、production、deploy或release。
- 2026-08-04: 依使用者「下一成熟度為RD Contract Ready，請執行」，將`DEV-053`由Brief Ready升級為`RD Contract Ready / Human Confirmed / Awaiting RD Implementation Readiness Review`。新增單一圖號工作台SPEC與「由AI執行的真實操作驗證計畫」，完成server-side unified read BFF、candidate bundle→formal drawing canonical row切換、多圖去重、state-to-primary-action、舊reserved URL zero-write相容、contextual append改走candidate workspace、controlled-file單一authority、permission交集、source failure fail-whole、feature flag與stop conditions。Spec preflight維持對DEV-052 `HD-052-04`的`Intentional replacement`；本輪只改文件，未修改product/schema/migration/production/deploy/release。
- 2026-08-04: 使用者確認不再以「圖號總表／保留號」兩頁呈現圖號生命週期；建立`DEV-053`單一圖號工作台`Brief Ready / Human Confirmed`。新方向把保留號改為生命週期狀態，以單一清單、統一drawer與每狀態唯一CTA承接建立、首版、審核、正式化、發行與進版；UI合併但底層workspace/master/revision/approval authority仍分離。Spec preflight判定為對DEV-052 `HD-052-04`的`Intentional replacement`，現有產品與DEV-052證據不回寫成新契約；本輪未修改product/schema/migration/production/deploy/release。
- 2026-08-05: 依使用者回報重新盤點並整理`DEV-053`。確認flag-on直接替換整頁，造成14組正式圖面管理能力退化；撤銷Phase 1B最小formal drawer與Phase 1D既有QA PASS，保留Phase 1A read foundation及Phase 1C candidate routing，新增`Phase 1E Regression Recovery`並補到`RD Implementation Ready / P0 / Local Only`。Human decision維持單一工作台，但單頁化不得降低圖、料、版次、附件、送審、關係、影響與治理能力。`DEV-054`明定為受保護並行任務，不恢復DVT/開發階段、不修改023 migration或其SPEC/ADR/QA/QC、不還原刪檔，也不得混入DEV-053 commit；本輪只改DEV-053文件，未修改產品、schema、migration、3000資料、production、deploy或release。
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
- 2026-08-07: 依使用者要求先建立 checkpoint commit `f4db2afb`，再執行 `DEV-057` 本機產品實作。圖號 Drawer 首屏改為沿用 server-derived `row.primaryAction` 的唯一主 CTA；`上傳與送審`、`圖料關係`、`製造圖影響分析` 不再並列競爭，關係／影響、受控檔案定位、附件管理、主資料／成本與新增／作廢入口改由「更多」及可折疊區承接；送審檢查補上直達修正／審核入口。`/numbering/search` 與 `/numbering/impact` 補安全 `returnTo` 消費，關係頁內嵌圖面也保留唯一主 CTA與進版返回上下文。authenticated browser 已驗證 A0005-M01 `等他人處理`、A0061-M01 `建立新版次`、關係／進版返回、行動版 Drawer 無水平溢位；`DEV053 UI 23/23`、TypeScript、affected-file ESLint 通過。實作變更目前留在 checkpoint 後的未提交工作樹，未改 schema、正式資料、production、deploy 或 release。
- 2026-08-08: 完成 `DEV-057` single drawing workspace intentional replacement。新增共用 `DrawingWorkspaceDrawer`，candidate/formal 直接使用同一元件與五段 DOM；candidate 首版 editor 同頁呈現，移除「準備首版圖面」第二層導航，readiness 完成後沿用 server-derived primary action。初次 QC 發現缺檔指示重複三次，回送 RD 後只保留 upload 鄰近提示；空 pending wrapper以 hidden 0×0保留骨架。最終 independent QC P0/P1/P2=0，typecheck、drawer 42/42、number-state UI 8/8、DEV-053 UI 23/23、scoped ESLint及真實 Chrome candidate 1440/390、formal 1440通過；證據 `output/qa/pdm-entity-detail-drawer-ai/20260808021459-single-workspace-recheck/`。未改 API/schema/data/permission/lifecycle authority，未 stage/commit/deploy/release；network response-status telemetry未充分驗證。
- 2026-08-07: 執行 2D SLDDRW 預覽卡住修正：Document Manager worker 支援常駐輪詢，本機啟動器分別管理 3D／2D worker；未被接手的 queued job 於 120 秒後自動轉為可重試的失敗狀態，UI 改以 `等待預覽服務` 與 `無法預覽` 清楚區分，不需手動重新整理。完成 tsc、lint、native preview QC 104/104、master attachments QC 103/103、redaction QC 68/68 與 local health；目前仍待設定 worker 可讀取的 SolidWorks Document Manager key 才能產生真實 2D 圖像。
- 2026-08-07: 執行「管理員 UI + Supabase Vault + Worker readiness」落地：設定中心回傳 secret 管理可用性；SolidWorks secret status 顯示 2D worker credential readiness；Supabase Vault 讀取僅由 server-side、token-gated worker credential route 執行；Document Manager worker 啟動前取得 key 並只保留於 worker process memory；local test double 僅保留 metadata，不誤報為可產生真實 2D 預覽。補齊 Postgres active secret partial unique index。證據：TypeScript、lint、`qc:pdm-settings-center-secret-lifecycle` 28/28、`qc:pdm-sw-native-preview-worker` 106/106、`qc:master-attachments` 103/103、redaction 68/68 與 `dev:local:check` 通過；目前本機因未開啟 Vault read gate／未提供環境 key，2D worker readiness 仍為 blocked，未執行 live Vault 寫入或生產部署。
- 2026-08-07: 建立 `DEV-058` Google Secret Manager 與 SolidWorks 2D worker 憑證整合開發合約。依現行 Google Cloud authority，正式取代前一筆 Supabase Vault provider 方向：Google Secret Manager 保存 key、Cloud SQL 只保存 exact version reference/lifecycle metadata、Cloud Run BFF 使用 ADC、Windows worker 透過 token-gated no-store broker 取得 active key。這筆紀錄代表開發前合約；後續本日已完成本機 Phase 1A～1D，live GCP、IAM、deploy 或 release 仍 gated。
 - 2026-08-09: 使用者 current-route 截圖顯示候選整包送審確認視窗無法由任何可見關閉動作解除，重新進入仍阻擋工作；因此 `DEV-057` 舊 QA-QC PASS 改為歷史基線並重啟驗證。完成 `DEV-059` product fix：確認明細抽屜 document-level pointerdown outside-click listener 先於 React delegated click 處理 modal，新增 native capture shield/click bridge；AI 以固定 3000 current route 實際驗證 X、返回、Escape、CUA physical click、reload、back/forward、candidate switch 與 1440/1024/390 viewport，並以 `DEV059-20260809-161835-isolated` 真實 UI 執行 disposable 建立、送審單一 request、planned 503、response-loss readback、撤回／取消與 cleanup。DEV-059 UI contract 9/9、real-operation 11/11、typecheck、affected-file lint、isolated flow 7/7、approval integration 27/27、HTTP 11/11 通過；production connection/write false、cleanup removed、正式主檔零污染。共享候選仍未執行 mutation；父 `DEV-057` 本機 QA/QC 恢復 PASS，commit、merge、PR、deploy 與 release 仍未授權。
- 2026-08-20（DEV-083 aggregate re-audit／歷史快照，已由後續evidence reconciliation取代）：重跑目前工作樹的`qc:dev-079:contract`與`typecheck:app`均PASS；重新執行`qc:dev-083`取得30 child／22 PASS／8 parent baseline FAIL／0非DEV-083歸因FAIL，affected lint（0 errors／14既有warnings）與isolated build亦PASS。當時aggregate mutation evidence=`output/qa/dev-083-mutation/DEV083-MUT-20260820T075229Z-a928db94/manifest.json`，browser evidence=`output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T075038Z-82d2ff50/manifest.json`，aggregate=`output/qa/dev-083-aggregate/DEV083-aggregate-20260820T075034Z-aaee8256/manifest.json`；本輪收斂DEV-067 UI、DEV-070 cursor contract、DEV-081 shared authority policy與entity-detail pending projection四個parent差異。QA-083-11/12/13/17/18維持PASS，QA-083-19仍為partial authority partition，QA-083-24與8個parent baseline findings保持open；當時completion audit為7/8，剩餘`DEV-065`與external blocked `DEV-PDM-ERP-GOOGLE-CLOUDSQL-001`不屬DEV-083；未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-083 evidence reconciliation／closure handoff升級）：focused `qc:dev-083:browser` 重跑通過22/22（含safe-return hydration wait），`qc:dev-070:legacy-owner`與`qc:dev-070:browser`重跑PASS；最新mutation `output/qa/dev-083-mutation/DEV083-MUT-20260820T092432Z-b85d5565/manifest.json`為PASS且cleanup=removed，最新完成aggregate `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T083246Z-a3490243/manifest.json`為30 child／26 PASS／2 parent baseline FAIL。兩個非baseline failure已完成focused reconciliation；DEV-067 browser candidate responsive marker與DEV-072 browser closed-review fixture FK／cleanup仍保留為parent disposition。aggregate後續重跑遇transient `next-env.d.ts` I/O lock而中止，未改expected或產品資料；`qc:dev-task-completion-audit`目前為6/8，失敗項為既有DEV-085／DEV-065與external blocked DEV-PDM-ERP-GOOGLE-CLOUDSQL-001，均不屬DEV-083；QA-083-19完整跨domain parity與QA-083-24 parent closure仍開放，DEV-083維持驗證中／Production Release Gated，未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-083 parity evidence／company-boundary security hardening）：`qc:dev-083:mutation`重跑 `output/qa/dev-083-mutation/DEV083-MUT-20260820T095122Z-8d49cbb9/manifest.json` 全部PASS且cleanup=removed；同一disposable fixture直接完成Part／Drawing／Relation Manager與Admin正向mutation、Manufacturing fail-closed、cross-company denial、route-intent denial、row/audit readback與exactly-once。Runner暴露Drawing revision upload與Part attachment POST原先只靠route/action authority、未先驗證resource company的真實缺口；補上同公司resource guard後cross-company upload／attachment皆回安全拒絕（Drawing 404、Part 400／Relation 404）並獲新matrix PASS。隨後`typecheck:app`、`qc:dev-083:contract`、`qc:dev-083:api`、`qc:doc-paths`與`qc:dev-task-evidence-sync`均PASS。文件同步升級為QA-083-19 expanded three-domain parity evidence；目前只剩Drawing／Relation owner identity direct path（或DEV-081既有owner evidence manifest/hash對帳）與QA-083-24 parent regression closure，仍不得宣稱QA/QC complete或release；未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-083 QA-083-19 owner/non-owner parity closure）：`qc:dev-083:mutation`重跑 `output/qa/dev-083-mutation/DEV083-MUT-20260820T101920Z-a1ceed38/manifest.json` 全部PASS且cleanup=removed；同一disposable fixture新增Engineer-owned Part／Drawing／Relation與Admin-owned非owner fixture，直接完成Engineer owner、Engineer non-owner、Manager、Admin同公司正向mutation與audit/readback，並保留Manufacturing fail-closed、cross-company／route-intent denial與三domain resource guard。QA-083-19因此由expanded evidence升為PASS；DEV-067 browser fresh baseline `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T102159Z-16051248/manifest.json`仍有3個responsive Part candidate wait timeout，DEV-072 browser fresh baseline `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T102540Z-e66f6a56/run-manifest.json`仍為disposable closed-review fixture FK failure＋cleanup EPERM，兩者保留parent owner disposition，QA-083-24與完整QA矩陣仍未關閉。失敗runner留下的task-owned temp root已精確清除；未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-083 focused evidence refresh／aggregate baseline honesty）：最新`qc:dev-083:browser` manifest `output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T113057Z-bc3ed6f9/manifest.json`完成22/22 checks，`browserErrors=0`、`failedResponses=0`、`mutationRequests=0`；最新`qc:dev-083:mutation` manifest `output/qa/dev-083-mutation/DEV083-MUT-20260820T113213Z-9ba0c00f/manifest.json`完成31/31 result rows PASS且cleanup=removed；DEV-067 parent browser `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T113330Z-000ca743/manifest.json`完成18/18、browserErrors=0、failedResponses=0。aggregate attempt `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T113055Z-4b8b7c30/manifest.json`保存18個child並在DEV-072 legacy browser的`next-env.d.ts` transient lock後中止，無final result；只清理task-owned runner，未把環境競態或DEV-079 replacement誤報成PASS。文件同步更新最新manifest與baseline disposition；QA-083-24仍待DEV-072 parent owner／獨立QC acceptance，未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-083 aggregate completion／runner boundedness）：完整`qc:dev-083`完成30個child，aggregate manifest `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為29 PASS、1 DEV-072 parent baseline FAIL，該baseline維持`accepted-superseded`，不被吞錯或誤報為綠燈。最新focused browser=`output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json` 22/22、mutation=`output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json` 31/31 PASS且cleanup=removed；DEV-067 parent browser=`output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json` 18/18、browserErrors=0、failedResponses=0；DEV-072 bounded manifest=`output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留fixture cleanup與obsolete marker觀測。為避免過時parent marker或transient I/O無界掛住，`qc-next-app-runner` readiness probe改為每次2秒可取消，DEV-072 legacy marker wait限縮5秒但保留原始assertion與expected；`typecheck:app`、affected lint、isolated build、parent regressions均完成。QA-083-24仍待DEV-072 parent owner／獨立QC acceptance，未stage/commit/merge/PR/deploy/release。
- 2026-08-20（DEV-083 parent disposition closure）：依最新aggregate非baseline failure=0、DEV-079 contract 22/22、layout 3/3、recognition layout 3/3、DEV-083 browser 22/22、mutation 31/31與DEV-067 browser 18/18 evidence，完成 DEV-072 legacy action-placement 的 independent evidence-level QC review。QC 文件 `.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md` 記錄 `accepted-superseded`：保留舊 runner、failure、fixture／cleanup provenance與expected，接受DEV-079 readonly drawer＋canonical full-page owner為現行replacement，不把舊runner改判為PASS。QA-083-24與QA-083-01～24 matrix因此關閉；DEV-083狀態更新為 `✓ / Local QA-QC Complete / Production Release Gated`。未stage/commit/merge/PR/deploy/release。
- 2026-08-23（DEV-087 scope rebaseline／QA-QC closure）：依產品缺口分析與最新決策，將本期 UI-only lifecycle gate 正式收斂為 `D01–D24`、`P01–P10`、`R01–R14` 共48 cases；`D25–D27`、`P11–P20`、`R15–R20` 明確移列後續能力／契約候選，不靜默縮小分母，也不以 seed／SQL／直接business API偽造歷史或終態。runner 新增隔離 lifecycle bundles，並在 C11 fault profiles 前先停止主 runtime，避免 `next-env.d.ts` 競態。最新 full evidence `output/qa/dev-087-ui-only-lifecycle/DEV087-ui-only-2026-08-22T16-03-21-109Z/`：`48/48 PASS`、`Blocked=0`、`NotRun=0`、`FAIL=0`、`C01–C11=11/11`、infrastructure `51/51`、supplemental `3/3`、console/failures `0`；DEV-087 本地 QA/QC 完成，Production Release Gated。權威 QA/QC 文件已同步至 `.ai-doc/qa/qa-dev-087-ui-only-lifecycle-operation-validation-plan-2026-08-22.md` §26 與 `.ai-doc/qc/qc-dev-087-ui-only-lifecycle-execution-2026-08-22.md` §26。
- 2026-08-23: 預覽能力恢復（DEV-087 相容增補）：三個工作臺的 full detail drawer 統一提供 3D／2D 預覽槽位；料號與圖料根號改由既有代表圖的受控附件讀取並沿用 `previewSlot`／保護檔案路徑，圖號既有預覽行為不改。此增補不開啟新的檔案權威、不改圖號獨立編輯器；驗收必須同時核對 detail API 的 `previews`、實際附件／衍生狀態與 UI 的 `data-drawing-detail-section`。
- 2026-08-23: 恢復 canonical 三工作臺的兩項既有互動能力：明細抽屜沿用各工作臺原有 localStorage key 記憶可拖曳寬度；清單接回共用 `useListKeyboardShortcuts`，支援上下鍵選取、Enter 開啟、Escape 關閉，且抽屜控制項取得焦點時仍可用上下鍵切換上一筆／下一筆。新增 QA-087-166～168，要求實際拖曳、reload 偏好、清單／抽屜鍵盤切換與 URL/detail API/UI rowKey 三方一致；未改 schema、工作流、檔案權威、圖號獨立編輯器或正式資料。後續已將 `qc:pdm-entity-detail-drawer` 從 DEV-039 舊搜尋頁／owner drawer 契約重寫為 current canonical 三工作臺 shell，補上切換明細 scroll reset，最新18/18與search-target runtime PASS。
- 2026-08-23: 修正 A0006-M01 研發候選版 3D／2D 預覽顯示缺口。根因為 canonical detail 仍產生候選附件 `readHref`，但 `candidate-revisions/[revisionId]/files/[fileId]` 的 GET 在整併時被誤退役，瀏覽器因此收到失敗回應；資料庫中的 source asset 與 ready derivative 均存在。恢復唯讀 GET，支援原檔下載、`preview=1` PDF 與 `previewDerivative` PNG，保留登入／公司／workspace／revision／active file／asset／review scope 檢查；POST／PATCH／remove command 仍維持 retired。新增 QA-087-169 候選附件預覽回歸，已用 UI 登入後實際驗證 A0006-M01 3D image `200 image/png`、2D PDF `200 application/pdf`，抽屜呈現兩個媒體且無新的 console error；未改 schema、正式資料或檔案權威，未 deploy/release。
- 2026-08-23：架構補充：本次 GET 恢復明確標記為相容讀取層，不是永久保留第二套檔案權威。candidate／released 可有不同業務關聯與生命週期，但 file asset、preview derivative、storage pointer 與讀取權限需收斂為單一 canonical file-read contract；在 caller=0、orphan relation=0、兩輪 fresh-session evidence 與 reconciliation manifest 完成前，不移除相容 GET，避免合法候選附件變成孤兒。此 retirement gate 已寫入 DEV-087 QA §21，作為後續清理的必要條件。
- 2026-08-23（DEV-087 QA-087-166～170／file-read retirement closure）：candidate／released／history／review 已收斂至單一 `/api/pdm/file-assets/{fileAssetId}` 讀取契約，舊 candidate GET route 與 adapter 已移除。最終 aggregate 的 `DEV087-file-read-2026-08-23T06-50-26-534Z` 為100/100 PASS：source/runtime caller=0、candidate/released orphan relation=0、兩輪 fresh-session、原檔／derivative hash、未登入／跨公司／錯 context-binding-asset、A0006 3D image＋2D PDF rendered UI、console/network=0，port 56585 released。三工作臺抽屜拖曳／偏好隔離／鍵盤快速切換在完整 aggregate 的 `DEV087-2026-08-23T06-51-18-167Z` 為103/103 PASS；首輪發現 Escape 焦點未回清單與冷啟動取消時自動辨識 POST 404 競態，均修正並保留失敗 manifest，取消後 recognition session／revision claim orphan=0、console/network=0，port 65420 released。其後補上 row 切換時 drawer body 捲動歸零，post-aggregate exact-delta `DEV087-2026-08-23T07-03-21-181Z` 為109/109 PASS、console/network=0、port 52712 released，並另重跑 typecheck與127頁 isolated build PASS。最終 `qc:dev-087` 完整 aggregate 9/9；canonical drawer 18/18＋search-target runtime及 DEV-053 UI 24/24 亦 PASS。DEV-087 local canonical QA/QC 與本項 retirement 已完成；production migration、deploy、release 仍 gated，未stage/commit/merge/PR/deploy/release。
- 2026-08-23（DEV-065 canonical Drawing gallery Brief Ready／已由下筆RD Implementation Ready升級取代）：依使用者要求，把舊架構「圖號工作台預覽圖模式」整理為新架構恢復的開發Brief，更新既有DEV-065／SPEC而未新增重複DEV。Current phase僅納入canonical Drawing的`清單／預覽圖`切換；一個`cw_<UUID>` row對應一張卡、綁定exact revision，preview metadata必須bounded bulk讀取，bytes沿用單一`/api/pdm/file-assets/{fileAssetId}` authority；Part保留為future phase capsule。舊實作契約與`PG-001`～`PG-014` QA僅作historical baseline，不得視為current PASS。當時成熟度為`Brief Ready / RD Not Requested`；未修改產品程式、測試、schema、資料、runtime、部署或release。
- 2026-08-23（DEV-065 RD Implementation Ready）：依使用者「繼續升級開發文件到RD可實作」，完成current code、Next.js 16.3、canonical DTO/repository/read snapshot、file-read、UI、QA與dirty boundary盤點。同一DEV/SPEC升為`☐ RD Implementation Ready / Human Confirmed / RD Not Started`；固定Drawing list additive`preview3dByRowKey`、same-snapshot兩個bulk statements、exact revision source、single file-read、Drawing-only URL/storage/gallery與request-race contract；不新增schema/migration/route/feature flag。QA同檔新增`CPG-001`～`CPG-024`及A0002 production/RD、multi-RD、state/security/query/four-viewport evidence gates；舊Part/lane/token/preview child route與`PG-*`保留historical且current caller須為0。同步amend DEV-087 additive DTO/file-read authority；ADR not required。此輪仍只修改開發文件，未修改產品／測試碼、schema/data、runtime、stage/commit/merge/PR/deploy/release。
- 2026-08-23（DEV-065 Local Phase 1A～1D 完成）：依使用者要求完成 canonical Drawing `清單／預覽圖`產品切片，落地 exact revision preview mapper、same-snapshot bounded list projection、Drawing-only layout URL／localStorage、gallery card states、drawer／keyboard／a11y／RWD與 request race／append guard；Part／Relation維持list-only。`qc:dev-065:contract` 24/24、authenticated browser 35/35；DEV-087 contract/repository/commands/file-read 31/29/39/193、canonical workbench browser 118/118、typecheck、受影響檔ESLint、isolated build 125/125與diff check均通過。舊 `qc:pdm-entity-detail-drawer` 因期待已退役 `src/lib/pdm-entity-detail.ts` 無法執行，已記錄為legacy runner disposition，不恢復舊source；current drawer由current canonical browser evidence覆蓋。未新增schema/migration/route/feature flag、未寫入primary／production、未stage/commit/merge/PR/deploy/release；後續正式環境另走deployment release gate。
- 2026-08-24（DEV-065 Phase 2 Part gallery Brief Ready）：依使用者確認，料號預覽語意固定代表「料號本身」；預設只連結direct unique primary manufacturing Drawing的canonical production exact 3D，並允許有權限者上傳PNG／JPEG作明確custom override。歷史root-min／最近附件／reference Drawing／其他revision／2D fallback均被拒絕；custom無法讀時不silent fallback，reset必須明確且可readback。因這會新增durable Part preview authority、file mutation、permission/audit與migration，總DEV狀態由完成改為`Phase 1 Local Complete / Phase 2 Brief Ready`；Phase 1全部PASS證據保留，Phase 2尚未建立exact schema/API/delete-recovery/query/file impact與正式QA cases，不計完成也不授權RD實作。本輪只更新SPEC、dev_task、documentation map與QA direction，未修改產品、測試、schema/data或release狀態。
- 2026-08-24（DEV-065 Phase 2 最小共用預覽架構裁決）：依使用者「系統盡量精簡、盡量共用元件」與RD主管審查，將end-state收斂為共用safe preview projection、protected media/state renderer、single/tabs/grid panel與entity-neutral gallery；Drawing保留thin compatibility adapter，Part只新增source-control mutation。Part gallery與drawer使用同一PartPreviewResolver/projection，drawer只保留一個`料號預覽`、source label與`查看主要製造圖`入口，不常駐重複3D／2D board。Current Part drawer雖已共用`DrawingDetailPreview`外殼，但`representativeDrawingRevisionId`未限定`primary_manufacturing`，列為source-quality intentional replacement。拒絕複製Part gallery、custom-as-Drawing-slot、entityType巨型元件、boolean-prop soup與list/detail雙SQL。本輪仍為`Brief Ready`文件更新，未修改產品、schema/data、tests或release狀態。
- 2026-08-24（DEV-065 Phase 2 RD Contract Ready）：依使用者要求繼續升級開發文件，完成current Part附件、file asset、canonical receipt、append-only audit、permission/write lock、file-read、workbench DTO/query與shared preview caller盤點。資料權威固定為persistent `part_preview_settings`（無row=初始auto；reset保留row避免ABA）與Part-owned `part_preview_image`；commands、row-version、idempotency、圖片10 MiB／64..8192限制、storage compensation、active delete 409 block、舊asset非破壞保留、neutral `previewByRowKey`、query目標與feature-off rollback均已封口。新增`ADR-PDM-PART-PREVIEW-AUTHORITY-001`，同步amend file ownership、DEV-087 read contract與QA `PPC-001..018`。Phase 2仍未達RD Implementation Ready且未修改產品、schema/data、tests、runtime、stage/commit/merge/PR/deploy/release。
- 2026-08-24（DEV-065 Phase 2 RD Implementation Ready）：依使用者「繼續升級開發文件」，完成repository-specific implementation assessment。固定SQLite marker／`ensureDev065PartPreviewSchema`與PostgreSQL `046_part_preview_settings.sql`、same-company/custom pointer與active soft-delete DB triggers；修正原contract對`file_assets.document_category`有DB allowlist的錯誤假設，將`part_preview_image`定為dedicated route保留write category。Image decoder固定direct pinned `sharp@0.35.3`與single-page／input-output 10 MiB／64..8192／orientation-metadata contract；rollout flag收斂為default-off `PDM_PART_PREVIEW_V1`並退役未實作暫名。SPEC新增service/storage compensation algorithm、exact add/modify/no-touch files、2A～2D估工/gates、focused commands與現況dirty ledger；QA §0.7新增stable fixtures、fault points、SQLite/PostgreSQL/browser runners、query instrumentation及evidence manifest。狀態升為`RD Implementation Ready / Local Implementation Eligible / RD Not Started`；本輪仍只修改開發文件，未修改產品／tests/schema/data/runtime，未stage/commit/merge/PR、套用migration、deploy或release。
- 2026-08-24（DEV-065 Phase 2 Local RD completion）：完成Part identity preview產品切片與runner。SQLite／PostgreSQL additive schema、DB guards、server-only image normalization、persistent setting、reserved Part image、idempotent set／replace／reset、active generic-delete 409、neutral `previewByRowKey`、same-snapshot bounded list hydration與shared media／panel／entity-neutral gallery均已落地；flag `PDM_PART_PREVIEW_V1`維持default off。Fresh evidence為contract 28/28、SQLite 30/30、Chromium 108 checks、Part list query 0/1/20/50=`2/7/7/7`、detail=13、DEV-087 31/29/30/193、DEV-088 40/29/15、typecheck／22-file lint／diff／isolated build 126/126 PASS。PostgreSQL runner因無explicit disposable shadow安全BLOCKED且productionWrites=false；標準build因非本任務port 3000 runtime被clean-next阻擋，isolated build已取代驗證；master-attachments failure可由before patch證明是既有Drawing route差異。DEV-065標為本機RD交付完成，但不宣稱full multi-provider QA、capability activation或release；未stage/commit/merge/PR、production migration、deploy或release。QC=`.ai-doc/qc/qc-dev-065-part-preview-local-execution-2026-08-24.md`。
- 2026-08-24（DEV-065 Part best-available preview amendment）：依使用者確認「多個RD branch仍顯示一張，功能只協助辨識」，將auto來源由production-only改為同一direct primary manufacturing Drawing內的`production ready > latest open active RD ready`；custom有效／失效的優先與no-silent-fallback不變。Repository同一bulk query讀production＋open active RD並保留linked-no-state identity，resolver以有效derivative／binding／revision／state更新時間、natural revision與stable row ID deterministic選擇；UI共用既有projection/gallery/panel/media，只新增`量產預覽／研發預覽`來源與精確空白文案，未新增table、API、permission、branch preference或Part專用元件。Fresh evidence：A0005-P01實際readback與1440/1024/768/390 Chromium均為`ready / 研發預覽 / A0005-M01 / 0.1`；SQLite 30/30含multi-RD、historical exclusion與production promotion，browser 112/112、contract 28/28、typecheck、affected lint PASS，query仍2/7/7/7與detail 13；ports 64346/58568均釋放。PostgreSQL shadow、capability activation、production migration、deploy/release gate不變，未stage/commit/merge/PR/deploy/release。
- 2026-08-24（DEV-096 RD Implementation Ready）：依使用者「繼續補齊細節」，完成組立件shared BOM repository-specific implementation assessment。同一SPEC固定`part_numbers.structure_type`、stable Definition、Definition/Draft Parent bindings、component node/candidate/exact selection、schema-v2 release parent/resolved projection及migration issue九表authority；SQLite initializer=`ensureDev096SharedAssemblyBomSchema`、PostgreSQL migration=`048_shared_assembly_bom.sql`、default-off flag=`PDM_ASSEMBLY_SHARED_BOM_V1`。API固定Part `bomContext`、唯一applicability candidate route＋strong ETag、single `POST /api/bom/drafts` writer、atomic component save與exact-parent export；where-used、change-control、技轉包、approval及AI consumer均有收斂責任。QA補contract/migration/repository/mutation/consumer/browser/aggregate runners、stable fixtures、named fault points、provider/isolation/evidence gates，後續second readiness audit再擴充為88 cases。workspace assessment時有709筆既有dirty entries，文件明定target hash/touched ledger且禁止清理或覆蓋。狀態升為`☐ RD Implementation Ready / Local Implementation Eligible / RD Not Started / Production Release Gated`；本輪仍只修改開發文件，未修改產品／schema/data/tests/runtime，未stage/commit/merge/PR、套用migration、啟用flag、deploy或release。
- 2026-08-24（DEV-096 second readiness audit）：依使用者再次要求「繼續補齊細節」，從現有lifecycle routes、permission、approval、migration與consumer反向檢查，補上server-only major revision、初版／下一版同writer及latest base clone、Parent superset、stable logical line diff、one-open/restorable Revision、archive／restore／whole-Definition obsolete、manual active退役、schema-v2 review snapshot/self-decision、Definition capability resolver、structured 404/403、canonical`bom_workbench` approval source、exact replacement reconfirm、list cardinality／bounds／no-N+1與完整UI state。更正BOM沒有外部side effect，不新增platform outbox；migration ID改為不依賴crosswalk的deterministic derivation。QA擴充`QA-096-069..088`，總分母88。狀態維持RD Implementation Ready；仍只修改文件，未改產品/schema/data/tests/runtime，未stage/commit/merge/PR、套用migration、啟用flag、deploy或release。
- 2026-08-25（DEV-098 Human Decision closure／RD Contract Ready）：使用者確認`1C-bounded／2A／3A`：一般RD可在exact non-stale source所屬整數主版次下只輸入向前且未占用的minor suffix，server固定major並與推薦值共用global tuple claim；production前進後stale branch一律freeze；Current Phase不做真正merge，major核准稱`採用為量產版`。新增配對ADR與完整API／UI／transaction／failure／Verification Integrity contract，並amend DEV-050／DEV-087。canonical history backfill、manual major、跨major minor、minor Released、真正CAD／BOM merge及production release均不在本期。DEV-098升為`RD Contract Ready / Human Confirmed / RD Not Requested`；本輪只修改文件，未改產品、QA、schema/data、runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-25（DEV-098 RD Implementation Ready，歷史初版；已由下一筆RD主管補完取代）：依使用者「繼續升級開發文件」，從現行Drawing revision service／route／repository、canonical modal、SQLite／PostgreSQL schema與DEV-087 runners完成file-level assessment。確認三項必修缺口為stale `2.3`混版、candidate button直接mutation／無manual parser，以及formalize覆寫policy snapshot。固定新增target policy module、v2 recommended token、strict discriminated POST、stale recovery second GET、server-only manual target resolver、typed snapshot read-merge-write、modal-local no-flash state與single primary；schema／migration/backfill=`none / not required / not authorized`。當時建立QA plan `QA-098-001..026`與四支focused runner契約、估工5.0～7.5 person-days；現行分母、runner與估工以DEV-098任務正文及下一筆紀錄為準。本輪仍只修改文件，未改產品／tests／schema/data/runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-25（DEV-098 RD主管補完）：依使用者要求補完前次readiness review缺口。2A freeze擴充至target建立後的owner／review／system狀態：stale owner同workspace唯讀只可cancel，stale review禁止approve只可return，unresolved system／blocked存在時其他branch不得major adoption；不自動刪除work、claim、files或audit。新增非persisted `basisState` projection、proactive stale action＋race fallback、pre-production base=null之`0.x → 1`、aggregate-first固定鎖序與PostgreSQL separate branch lock；implementation拆為shared target contract、server-only token、pure lifecycle policy三層。QA加入FMEA及`QA-098-027..031`，分母升為31，full QA需disposable PostgreSQL，估工調整為7.0～9.5 person-days。SPEC、ADR、DEV-087 amendment、dev_task與map同步後，P0/P1 planning gap重新收斂為0；本輪只改文件，未改產品／tests／schema/data/runtime，未stage/commit/merge/PR/deploy/release。
- 2026-08-25（DEV-098 Local RD implementation completion）：依本文件固定的`1C-bounded／2A／3A`契約完成 B1～B3 產品切片：新增 pure lifecycle policy、typed target contract、server-only v2 candidate token與strict discriminated create body；server以current production basis計算推薦／手動minor、拒絕stale／rollback／跨major／claim reuse，並保存typed policy snapshot。canonical workbench加入非persisted `basisState`與stale action projection；owner stale只可cancel、review stale只可return、major adoption遇未收斂system／blocked branch拒絕；file upload/remove、recognition user mutation、submit與review approve均在transaction內重驗basis，允許既有extract evidence但禁止回寫舊work。UI採modal-local error/recovery、single primary、current-production second GET、focus/Escape與非PDF定位不改變預覽焦點，避免整頁reload／preview remount。資料庫schema／migration／backfill未變更。證據：`npm run qc:dev-098:contract` 15/15 PASS、authenticated in-app browser smoke（圖號工作台50筆、A0002工作區、PDF／3D切換、console error 0）、`typecheck:app` PASS、`lint` 0 errors／9既有warnings、`build:isolated` PASS；isolated runtime primary SQLite hash before/after一致，3010 listener已釋放且task temp已清除。DEV-098狀態升為`Local RD Implemented / Focused QC PASS / Full QA Pending / PostgreSQL Provider Gate Pending / Production Release Gated`；QA-098-001..031不因focused證據縮小分母，尚未執行full PostgreSQL concurrency／independent QC，未stage/commit/merge/PR/deploy/release。
- 2026-08-27（DEV-087 FFF適用性文件矯正／RD Implementation Ready）：依使用者對A0006-M01研發首版0.1現場畫面的Human Confirmed決策，固定FFF只適用於存在exact predecessor的進版工作。server唯一判定為`predecessor_revision_id IS NOT NULL`；首版只顯示中性`relatedParts`且submit／review／approve全程zero FFF，進版才投影`changeImpactRequired=true`、`affectedParts`與三軸明確判定，缺值不得預設`no_impact`。同步修訂DEV-087、SPEC §15.3、主QA `QA-087-187..192`、UI-only `D01..D06`與documentation map；current分母維持94案＋3 Quality Gates，既有證據降為修正前回歸基線。ADR、schema、migration、backfill均不新增；本輪只修改開發文件，未修改產品／測試碼、資料或runtime，未stage／commit／merge／PR／deploy／release。
