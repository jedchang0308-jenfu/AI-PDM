# AI PDM dev_task PM Control Board

更新日期：2026-07-12
Owner：Dev PM
用途：這份文件是 active DEV control board。未完成任務留在此處；已完成任務只保留摘要，完整索引在 `.ai-doc/archived/completed-dev-index-2026-06.md` 與 `.ai-doc/archived/completed-dev-index-2026-07.md`。

歷史快照：

- `.ai-doc/archived/dev_task_before_archive_sweep_2026-07-09.md`
- `.ai-doc/archived/dev_task_before_pm_governance_restructure_2026-06-30.md`
- `.ai-doc/archived/dev_task_legacy_before_pm_cleanup_2026-06-16.md`
- `.ai-doc/archived/documentation_map_before_pm_governance_restructure_2026-06-30.md`

## 總任務清單

這是目前 AI/PM 協作的標準快速掃描入口。`DEV-001` 這類短碼是溝通用別名；原本的語意來源 ID 仍是規格、QC 腳本、證據路徑與歷史引用的權威 ID。

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
- 目前沒有可直接正式部署的任務；若要開放內部人員使用，從 `DEV-032` release gate 恢復。
- `DEV-005` Phase 1 本地切片已完成；技轉包 Phase 3 已依使用者決策抽成 `○ DEV-041`。`DEV-041` Phase 3A-0 已達 RD Implementation Ready，但本輪只完成文件且未要求產品實作，因此不可由 RD 自動啟動。
- `DEV-044` 已建立 AI_PDM 作為未來 ERP 之 PDM 模組的架構契約。Phase 1 已達 `RD Implementation Ready / Not Requested This Turn`；本輪只寫文件，ProJED 不得被修改。
- CAD 原檔解析、SolidWorks Add-in、完整離線還原演練、正式現場測試與 live Supabase 資料工作都不是本輪自動可執行範圍；第一版 release readiness 只把正式領號 / 草稿 production slice 的必要 gate 列為 blocker。

### 目前派工任務清單

此段是 PM / RD 下一輪派工入口；完整 DEV 摘要與證據仍以後方 `### 任務索引` 為準。

- 已完成待上線：`DEV-040` 正式領號 / 草稿 production slice。
  - 任務：本地產品切片已完成；若要給內部人員正式使用，下一步不是再補本地功能，而是恢復 `DEV-032`。
  - 恢復條件：使用者提出 release 型指令，並確認 production target、smoke company / tenant、部署、rollback 與 post-deploy smoke。
  - 不做：不把送審、發行、CAD、BOM 或完整 PDM production ready 併入本 slice。

- 已完成待上線：`DEV-042` 內部帳號邀請與首次密碼設定。
  - 任務：管理員建立一次性邀請連結，內部人員自行設定密碼；邀請建立/接受/撤銷可稽核，且納入正式領號 / 草稿 slice 必要帳號入口。
  - 恢復條件：正式部署時設定 `PDM_PUBLIC_BASE_URL`；Google OAuth 本地切片已續接至 `DEV-043`，自動寄信、忘記密碼、停權/復權管理 UI 或 session 撤銷仍需後續切片。
  - 不做：本切片不宣稱完整 IAM，不接未選定的 SMTP/Outlook provider，不授權 live Supabase migration 或 production deploy。

- 已完成待上線：`DEV-043` Google 身分與 provider-neutral identity。
  - 任務：有 Google 的受邀者可用受邀帳號啟用並登入；無 Google 的使用者繼續使用本機密碼，兩者共用穩定 PDM User ID。
  - 恢復條件：release gate 設定 Google Cloud OAuth Web client、consent screen、正式 redirect URI、secret 與 `PDM_GOOGLE_OAUTH_ENABLED=true`，並套用核准的 schema migration。
  - 不做：不允許 Google 自助註冊、email/domain 自動授權、Google 群組主控 PDM 角色，不執行 live provider setup、migration 或 deploy。

- 待排可續接：`DEV-044` ERP-ready AI_PDM 模組基礎。
  - 任務：Phase 1 建立 server-derived actor/company context、versioned command boundary、route ownership inventory、client/server import guard 與 payload spoofing QC；不改現有登入體驗與 schema。
  - 恢復條件：使用者提出 `執行 DEV-044 Phase 1` 或等效產品實作指令。Phase 2 transactional outbox 必須等待 Phase 1 QC；Phase 3 shared IAM 必須重新確認 provider、組織/人員語意、MFA/offboarding 與 migration owner。
  - 不做：本輪不改產品、schema、Supabase/live data、登入 provider、正式網域、部署或 ProJED；不把 ERP 準備工作併入 `DEV-040` 第一版領號/草稿 release scope。

- 已完成父交付：`DEV-005` 研發 / 技術移轉送審關卡 Phase 1。
  - 任務：保留研發/技轉模式、readiness resolver、direct single-item fail-closed 與 package-context 入口的完成證據；後續技轉包交付改由 `DEV-041` 管理。
  - 恢復條件：若要做 research exception 或 parent rule admin，依 `DEV-005` parent SPEC 指定對應 phase。
  - 不做：不把 `DEV-041` 未實作範圍重新藏回已完成的 `DEV-005`。

- 待排可續接：`DEV-041` 技轉包工作台、Pack-and-Go Intake 與整數 Baseline。
  - 任務：Phase 3A-0 已達 RD Implementation Ready；第一切片建立明確按鈕後才持久化的 Draft、穩定 package ID、adapter cards、blocker 匯總與 return context。
  - 恢復條件：使用者提出 `執行 DEV-041 Phase 3A-0` 或等效產品實作指令；後續 phase 需依前一 phase QC evidence 進入。
  - 不做：本輪不實作產品、不解析 ZIP、不建立 baseline、不做 migration/deploy/release。

- 可恢復候選：`DEV-015` 圖面送審工作台第 2+ 階段交接包。
  - 任務：在主資料補完/寫回、附件上傳、協作、dashboard/todo 去噪中先選一個切片。
  - 恢復條件：切片選定後補 RD scope、out of scope、API/data boundary、QA gate 與 QC evidence required。
  - 不做：不處理 historical repair、production migration、direct DB mutation 或 release/cutover。

- 待產品上線決策：`DEV-033` 儲存治理與成本上線推廣。
  - 任務：盤點真實儲存量、成本、保留政策、備份責任與正式時程。
  - 恢復條件：確認儲存目標與費用責任後，才可拆成 RD / QA / QC。
  - 不做：不承諾 bucket/RLS production 變更、正式資料清理或 live migration。

- 正式環境關卡：`DEV-030`、`DEV-031`、`DEV-032`。
  - 任務：分別處理 Supabase provider 切換決策、資料一致性政策、正式部署 / cutover / smoke / release evidence。
  - 恢復條件：需要 release 型指令、高風險確認、target identity、rollback owner 與 smoke tenant。
  - 不做：尚未出現 release 型指令前，不產生 merge plan、PR checklist、deployment plan、rollback plan、production smoke plan 或 release report。

- 第一版外部 gate / 延後範圍：`DEV-034` 到 `DEV-038`。
  - 任務：`DEV-034` disposable Postgres shadow gate 已完成；第一版仍需 `DEV-038` 正式領號 / 草稿現場測試證據。
  - 延後：`DEV-035` CAD 2D 預覽 / native metadata、`DEV-036` SolidWorks Add-in、`DEV-037` 完整離線還原演練不列第一版 blocker。
  - 不做：不宣稱完整 PDM production ready，不把 CAD / Add-in / 完整備份演練混入正式領號 / 草稿 slice。

### 任務索引

以下保留每個 DEV 的摘要、來源 ID、證據、歸檔位置、批次發版指向與計入交付判定；使用者可直接用 `DEV-005` 這類短碼指定任務。

- ○ DEV-044 [開發點] [待排] [P0] [Phase 1 RD Implementation Ready / 本輪未要求實作] ERP-ready AI_PDM 模組基礎
  - 摘要：把 AI_PDM 固化為未來 ERP 的獨立 PDM 模組，先建立 server-authoritative actor/company/command 邊界，再分期加入 atomic audit/outbox、shared IAM adapter 與 ERP shell contract；不把現有 ProJED 架構升格成 ERP 母架構，也不在本任務修改 ProJED。
  - 來源 ID：`DEV-PDM-ERP-MODULE-FOUNDATION-001`
  - 父任務：未來 ERP platform program；現階段不計入 `DEV-040` 正式領號/草稿交付完成率。
  - 任務清單：
    - [x] Phase 0：建立 ADR、SPEC、QA、All-Phase Coverage Matrix、Deferred Scope Audit 與 PM 續接入口。
    - [ ] Phase 1：route ownership inventory、`PlatformActorContext`、versioned command/idempotency contract、selected P0 route boundary、client/server import guard、spoofing QC。
    - [ ] Phase 2：SQLite/PostgreSQL/Supabase parity transactional outbox、atomic mutation/audit/event、claim/ack/fail repository、RLS/default-deny、concurrency QC。
    - [ ] Phase 3：待人類確認 shared IAM provider、canonical person/organization model、MFA/offboarding、migration owner 與 timing 後，建立 mapping/collision migration child DEV。
    - [ ] Phase 4：待 ERP shell/consumer 決策後提供 versioned PDM integration contract；ProJED 需另外建立其 repository-owned DEV。
    - [ ] Phase 5：任何 production migration/deploy/cutover 續接既有 `DEV-030`、`DEV-031`、`DEV-032` release gate。
  - 執行範圍：本輪只有文件；下一個可執行切片為 Phase 1，狀態為 `RD Implementation Ready / Not Requested This Turn`。
  - 驗收標準：PDM controlled mutations 只能使用 server-derived actor/company context；browser 不得持有 privileged DB/provider secret；current PDM IDs/history 不被改寫；Phase 2 mutation/audit/outbox atomic；跨模組只能走 versioned command/read/event contract；ProJED 零修改。
  - 必讀文件：`.ai-doc/decisions/ADR-PDM-ERP-MODULE-FOUNDATION-001-integration-ready-boundary.md`、`.ai-doc/specs/SPEC-PDM-ERP-MODULE-FOUNDATION-001-platform-contract.md`、`.ai-doc/qa/qa-pdm-erp-module-foundation-validation-plan-2026-07-12.md`。
  - 停止條件：需要改登入 provider、canonical org/person 產品語意、stable ID/history、ProJED、live migration、production、外部成本、merge/PR/deploy/release 時停止並進對應 human/release gate。
  - 證據：Phase 0 為 AI_PDM `.ai-doc` diff；Phase 1 需 route inventory、focused QC、spoof/idempotency、typecheck/lint/build 與既有 numbering/draft/auth regression；後續 phase 依 SPEC/QA 累加。
  - 計入交付：否（平台開發點，不直接增加第一版使用者交付完成率）

- ✓ DEV-001 [交付點] [完成] [P0] [已歸檔] 全系統審核平台化
  - 摘要：建立共用審核平台核心、審核工作台、legacy reviewer redirect、跨模組審核 adapter 與圖號待審投影，讓 launch 前審核不再分散且不漏看受影響圖號。
  - 來源 ID：`DEV-PDM-APPROVAL-PLATFORM-001`
  - 父任務：編號、送審、BOM、成本與補件等審核流程
  - 證據：`.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`、`.ai-doc/qc/qc-pdm-approval-platform-report-2026-07-08.md`、`npm.cmd run qc:pdm-approval-platform` 125/125、`npm.cmd run qc:pdm-entity-detail-drawer` 14/14。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-001）
  - 批次發版：見 `DEV-030`、`DEV-032`；歷史實體遷移、Supabase live migration、production release 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-002 [交付點] [完成] [P1] [已歸檔] Supabase 核心檔案權威與 Google Drive 備份鏡像
  - 摘要：把 PDM 檔案權威轉向 Supabase Storage/Postgres metadata，Google Drive 降為 best-effort 備份鏡像，並保留 local fallback。
  - 來源 ID：`DEV-PDM-FILE-STORAGE-001`
  - 父任務：`DEV-SUPABASE-DB-001`、`DEV-STORAGE-COST-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-FILE-STORAGE-001-supabase-core-google-drive-backup.md`、`.ai-doc/qc/qc-pdm-file-storage-supabase-core-drive-backup-report-2026-07-08.md`、`qc:pdm-file-storage-supabase-core-drive-backup` 37/37。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-002）
  - 批次發版：見 `DEV-030`、`DEV-032`；bucket/RLS、一次性遷移、provider pointer、live Drive backup 與 production release 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-003 [交付點] [完成] [P0] [已歸檔] 使用者身分、組織範圍與權限架構
  - 摘要：完成鉦富單公司權限切片、角色/審核矩陣管理語言中文化、外部專員權限邊界與規則摘要防呆；審核矩陣控制項收斂為「是否需要審核 / 標示方式」，使用與發行控制改由系統推導。
  - 來源 ID：`DEV-PDM-ACCESS-CONTROL-001`
  - 父任務：`DEV-PDM-SETTINGS-CENTER-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-ACCESS-CONTROL-001-user-identity-permission-architecture.md`、`npm.cmd run qc:pdm-access-control-governance` 93/93、rule matrix screenshots。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-003）
  - 批次發版：見 `DEV-030`、`DEV-032`；無 Google 帳號邀請/首次密碼設定已由 `DEV-042` 完成，Google 身分/provider-neutral identity 已由 `DEV-043` 完成本地切片；完整帳號生命週期、完整路由權限盤點、live provider 與 Supabase migration 仍未進入 release 執行邊界。
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
  - 下一步：併入 `DEV-038` 的 3-5 人 field test；正式部署設定 canonical `PDM_PUBLIC_BASE_URL`。
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
  - 下一步：納入 `DEV-038` 3-5 人 field test；正式開放前由 `DEV-032` release gate 完成 provider credential、migration、HTTPS cookie 與 post-deploy smoke。
  - 計入交付：是

- ✓ DEV-004 [交付點] [完成] [P0] [已歸檔] 情境式編號生命週期入口
  - 摘要：在 root/drawing/part context 直接新增 M/R、P、obsolete request 與 aggregate approval package，並修正 APP 回饋的草稿與命名 UX。
  - 來源 ID：`DEV-PDM-NUMBERING-004`
  - 父任務：`DEV-PDM-NUMBERING-003`、`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-LIFECYCLE-ACTIONS-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`、`.ai-doc/qc/qc-pdm-numbering-004-contextual-entrypoints-report-2026-07-08.md`、focused QC 44/44。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-004）
  - 批次發版：見 `DEV-030`、`DEV-032`；production/Supabase cutover、provider pointer、merge/PR/deploy 需走 release gate 或高風險確認。
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

- ○ DEV-041 [交付點] [待排] [P1] [Phase 3A-0 RD Implementation Ready / 本輪未要求實作] 技轉包工作台、Pack-and-Go Intake 與整數 Baseline
  - 摘要：把技轉從 unsaved entry、明確建立的 persistent Draft、Pack-and-Go intake、人工分類/對應、完整 BOM、整數 package baseline、readiness、共用審核簽核一路管到 release-work-item handoff；不強迫所有零件同步進版。
  - 來源 ID：`DEV-PDM-TRANSFER-PACKAGE-INTAKE-001`
  - 父任務：`DEV-005` / `DEV-PDM-SUBMISSION-GATE-001`
  - 任務清單：
    - [ ] Phase 3A-0：實作明確建立後才持久化的 Draft、穩定 package ID、共用工作台、scope、adapter cards、blocker 匯總與 return context。
    - [ ] Phase 3A-1：實作 streaming ZIP safety、原始封包保存、manifest/hash、分類建議與人類 override。
    - [ ] Phase 3A-2：待 Q3/Q4 決策後，實作 controlled mapping、canonical BOM、package baseline、design-change delta 與完整有效配置基線。
    - [ ] Phase 3B：待 Q3/Q4 決策後，實作 root-scoped configuration/readiness、owner blocker、SolidWorks 實機開啟證據與 stale detection。
    - [ ] Phase 3C：待 Q3/Q4 決策後，整合多總組件共用審核、applicable sign-offs、ApprovedForTransfer 與 release-work-item handoff。
  - 執行範圍：本輪只有文件；下一個可請求切片為 Phase 3A-0。
  - 範圍外：本輪不改產品程式、schema/migration、正式資料、SolidWorks Add-in/Document Manager、production、merge/PR/deploy/release。
  - 必讀文件：`.ai-doc/specs/SPEC-PDM-TRANSFER-PACKAGE-INTAKE-001-pack-and-go-assembly-classification.md`、`.ai-doc/qa/qa-pdm-transfer-package-intake-pack-and-go-validation-plan-2026-07-10.md`、parent SPEC/ADR、BOM、approval、access-control 與 file-storage authority。
  - 驗收：各 phase 必須依 SPEC 保持 package baseline 與 item revision 分離、明確 Draft create、canonical owner 邊界、company/RLS 安全、不可變快照及 ApprovedForTransfer 不自動 release。
  - 停止條件：需要改變任何已確認 HCS 決策、繞過完整 BOM/controlled identity/實機開啟證據、複製 owner logic、缺 role/company 安全、要求 live migration/direct repair/deploy/release 時停止。Phase 3A-2 到 3C 在 Q3/Q4 未決前不得宣告 implementation ready。
  - 證據：Phase 3A-0 需 typecheck、lint、focused repository/API/idempotency/company-scope QC、`qc:pdm-submission-gate-phase1` regression 與 1440/1024/390 browser/visible-error evidence；後續 phase 依 QA plan 累加。
  - 下一步：使用者提出 `執行 DEV-041 Phase 3A-0` 後，由 RD 依 implementation-ready contract 開始；不得自動跨 phase。
  - 計入交付：是

- ✓ DEV-006 [交付點] [完成] [P1] [已歸檔] 圖料模組關係視圖
  - 摘要：將圖料模組從平面清單改為 root-grouped 關係樹與矩陣 review，並提供受控關係維護 API。
  - 來源 ID：`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`
  - 父任務：`DEV-PDM-DRAWING-PART-WORKBENCH-001`、`DEV-PDM-NUMBERING-002`
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`、`qc:pdm-drawing-part-relation-view` 56/56、relation-view screenshots。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-006）
  - 批次發版：見 `DEV-030`、`DEV-032`；正式環境、schema migration 與批次關係寫入需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-007 [交付點] [完成] [P2] [已歸檔] 全系統可行動狀態提示與下一步 UX
  - 摘要：讓錯誤、空狀態、生命週期、送審與附件狀態直接回答使用者現在要做什麼，減少只顯示 raw status。
  - 來源 ID：`DEV-PDM-NEXT-STEP-UX-001`
  - 父任務：`DEV-PDM-STATUS-UX-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-NEXT-STEP-UX-001-actionable-state-guidance.md`、status/search/DVT/report/master-attachment/drawing-submission QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-007）
  - 批次發版：見 `DEV-030`、`DEV-032`；Phase 2 scanner/checklist 未進入本輪執行邊界，production release 需走 release gate。
  - 計入交付：是

- ✓ DEV-039 [交付點] [完成] [P1] [已歸檔] 圖號 / 料號 / 主根號統一物件詳情抽屜
  - 摘要：統一 root/drawing/part detail drawer 契約，確保同一物件從不同入口打開時核心資訊與首屏密度一致。
  - 來源 ID：`DEV-PDM-ENTITY-DETAIL-DRAWER-001`
  - 父任務：`DEV-PDM-DRAWING-PART-RELATION-VIEW-001`、`DEV-PDM-NUMBERING-004`、主資料工作台
  - 證據：`.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`、`.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`、`qc:pdm-entity-detail-drawer` 12/12。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-039）
  - 批次發版：見 `DEV-030`、`DEV-032`；完整 shared shell 抽取未進入本輪執行邊界，merge/PR/deploy/release 需走 release gate。
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
  - 批次發版：見 `DEV-030`、`DEV-032`；DB enum/schema 改名、historical repair 與 production migration 需走 release gate 或高風險確認。
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
  - 批次發版：見 `DEV-030`、`DEV-032`；production/Supabase live cutover、provider pointer 與直接資料修復需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-012 [交付點] [完成] [P1] [已歸檔] 英數主根號身分 V3
  - 摘要：完成 A0001-Z9999 英數 root identity、v1/v2/v3 read compatibility、legacy numeric ordinal reservation 與本地 runtime v3 cutover。
  - 來源 ID：`DEV-PDM-NUMBERING-003`
  - 父任務：`DEV-PDM-NUMBERING-002`
  - 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-003-alphanumeric-root-identity.md`、`.ai-doc/qa/qa-pdm-numbering-003-alphanumeric-root-validation-plan-2026-07-07.md`、v3 formal cutover QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-012）
  - 批次發版：見 `DEV-030`、`DEV-032`；production/Supabase migration 與直接資料修復需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-013 [開發點] [完成] [P1] [已歸檔] QC 隔離、流水號完整性與本機修復
  - 摘要：阻止 QC 消耗正式 local runtime 流水號，補完整性偵測、transaction guard、duplicate submit guard 與本機測試資料修復。
  - 來源 ID：`DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`
  - 父任務：編號流水號完整性
  - 證據：`.ai-doc/specs/SPEC-PDM-NUMBERING-SEQUENCE-CAPA-001-qc-isolation-and-sequence-integrity.md`、`.ai-doc/qc/qc-pdm-numbering-sequence-capa-report-2026-07-07.md`、repair report。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-013）
  - 批次發版：見 `DEV-030`、`DEV-032`；Phase 4 production/Supabase rollout 或任何新資料修復需走 release gate 或高風險確認。
  - 計入交付：否

- ✓ DEV-014 [交付點] [完成] [P1] [已歸檔] 圖面送審工作台與發行未完成恢復流程
  - 摘要：完成 same-revision conflict 分類、release recovery、workbench API/page、retry/return-for-correction 與 disposable mutation QC。
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002`
  - 父任務：圖面送審權威
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md`、`.ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md`、mutation/recovery QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-014）
  - 批次發版：見 `DEV-030`、`DEV-032`；Phase 2+ 已另列 `DEV-015`，production/historical repair 需走 release gate 或高風險確認。
  - 計入交付：是

- ○ DEV-015 [開發點] [待排] [P1] [RD Contract Ready / Not Requested This Turn] 圖面送審工作台第 2+ 階段交接包
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
  - 下一步：指定第 2+ 階段切片後可進 RD；production/historical repair 另走 release gate 或高風險確認。
  - 計入交付：否

- ✓ DEV-016 [開發點] [完成] [P1] [已歸檔] 發行未完成 UI 自救流程
  - 摘要：補上 release-incomplete 的人可讀診斷、附件修正入口、submission detail recovery link 與 UI operation QC。
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003`
  - 父任務：圖面送審工作台
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md`、drawing submission UI/recovery QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-016）
  - 批次發版：見 `DEV-030`、`DEV-032`；正式環境修復、historical repair 與 data deletion 需走 release gate 或高風險確認。
  - 計入交付：否

- ✓ DEV-017 [交付點] [完成] [P1] [已歸檔] 圖面進版受控送審包第 1 階段
  - 摘要：讓圖面進版必須先選/上傳新版圖面並建立受控 Pending submission package，保留 FFF linkage 與失敗補償。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 父任務：圖面進版權威
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`、`.ai-doc/qa/qa-pdm-drawing-revision-submission-validation-plan-2026-07-03.md`、change-control QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-017）
  - 批次發版：見 `DEV-030`、`DEV-032`；production deploy、migration、direct repair 與 historical cleanup 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-018 [交付點] [完成] [P1] [已歸檔] 多檔版次包送審
  - 摘要：將單一版次送審擴充為多檔版次檔案包，支援 extension role auto-classification、role correction 與 warning-only completeness。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P2`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 2、revision submission QA、change-control QC 57/57。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-018）
  - 批次發版：無本任務專屬下一步；共用 release gate 見 `DEV-030`、`DEV-032`。
  - 計入交付：是

- ✓ DEV-019 [交付點] [完成] [P1] [已歸檔] 非依序進版與最新 / 歷史行為
  - 摘要：允許非依序但不重複的正式進版，重新計算 latest/history，讓低版次補登保留歷史、高版次升為最新。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P3`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md` Phase 3、`npm.cmd run qc:pdm-change-control` 61/61。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-019）
  - 批次發版：無本任務專屬下一步；共用 release gate 見 `DEV-030`、`DEV-032`。
  - 計入交付：是

- ✓ DEV-020 [交付點] [完成] [P1] [已歸檔] 一級版次附件包模型
  - 摘要：建立 stable packageId、package file membership、Released-core immutability 與補件 request/approval/補件標記。
  - 來源 ID：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001-P4`
  - 父任務：`DEV-PDM-DRAWING-REVISION-SUBMISSION-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`、`.ai-doc/qa/qa-pdm-drawing-revision-package-model-validation-plan-2026-07-06.md`、package QC 59/59。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-020）
  - 批次發版：見 `DEV-030`、`DEV-032`；若要補 browser 補件證據，應另開 QC/follow-up，不阻擋本 DEV 完成。
  - 計入交付：是

- ✓ DEV-021 [交付點] [完成] [P1] [已歸檔] 共用 3D 主檔與 MA 製造基準包
  - 摘要：完成 part/root 共享 3D 模型版本、MA model-basis API、required-MA resolver、manufacturing baseline draft/release 與 part-detail UI slice。
  - 來源 ID：`DEV-PDM-SHARED-3D-MA-BASELINE-001`
  - 父任務：進版包、圖料工作台與發行同步
  - 證據：`.ai-doc/specs/SPEC-PDM-SHARED-3D-MA-BASELINE-001-root-model-and-manufacturing-baseline.md`、`qc:pdm-shared-3d-ma-baseline` 20/20、browser screenshot。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-021）
  - 批次發版：見 `DEV-030`、`DEV-032`；production deploy/migration、CAD/OCR extraction 與 forced part/BOM/FFF changes 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-022 [交付點] [完成] [P2] [已歸檔] 系統設定中心與 Secret 生命週期治理
  - 摘要：建立 settings center、五個管理區、server-only secret lifecycle API、secret metadata tables、redacted UI 與 local test double。
  - 來源 ID：`DEV-PDM-SETTINGS-CENTER-001`
  - 父任務：CAD、Supabase 與設定權威
  - 證據：`.ai-doc/specs/SPEC-PDM-SETTINGS-CENTER-001-system-settings-center-secret-lifecycle.md`、`.ai-doc/qa/qa-pdm-settings-center-secret-lifecycle-validation-plan-2026-07-06.md`、settings secret QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-022）
  - 批次發版：見 `DEV-030`、`DEV-032`；Supabase Vault live write/smoke、真實 CAD 證據與 production cutover 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-023 [交付點] [完成] [P1] [已歸檔] Windows SolidWorks 原檔預覽衍生檔
  - 摘要：建立 preview job/derivative schema、fake PNG worker、Windows Shell worker、Document Manager SLDDRW worker path 與 derivative-aware preview cards。
  - 來源 ID：`DEV-PDM-SW-NATIVE-PREVIEW-WORKER-001`
  - 父任務：設定中心、CAD 讀取器與附件預覽
  - 證據：`.ai-doc/specs/SPEC-PDM-SW-NATIVE-PREVIEW-WORKER-001-windows-solidworks-preview-derivatives.md`、native-preview QC 90/90、redaction QC、master-attachments QC、API worker smoke。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-023）
  - 批次發版：見 `DEV-030`、`DEV-032`；真實 SLDDRW key、SLDASM evidence、Phase 2/3 與 production rollout 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-024 [交付點] [完成] [P1] [已歸檔] 送審發行後主檔生命週期同步
  - 摘要：在 submission release 成功時同步 source drawing、part、root master lifecycle，寫入 audit，並提供歷史 mismatch 可見 guard。
  - 來源 ID：`DEV-PDM-RELEASE-MASTER-STATUS-SYNC-001`
  - 父任務：圖面送審工作台
  - 證據：`.ai-doc/specs/SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001-submission-release-master-lifecycle.md`、`npm run qc:pdm-release-master-status-sync` 23/23、browser guard screenshot。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-024）
  - 批次發版：見 `DEV-030`、`DEV-032`；historical D-0014 repair、production migration 與 direct DB mutation 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-025 [開發點] [完成] [P2] [已歸檔] 重複進行中送審衝突分類
  - 摘要：將 duplicate active submission 改為 submission_conflict，於 readiness/submit/reviewer guard 阻擋並用中文 recovery 與 audit payload 留證。
  - 來源 ID：`DEV-PDM-SUBMISSION-CONFLICT-001`
  - 父任務：`DEV-PDM-DRAWING-PART-WORKBENCH-001`
  - 證據：`.ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md`、`.ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md`、duplicate conflict QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-025）
  - 批次發版：見 `DEV-030`、`DEV-032`；historical duplicate repair、production migration 與 direct cleanup 需走 release gate 或高風險確認。
  - 計入交付：否

- ✓ DEV-026 [交付點] [完成] [P1] [已歸檔] 圖料模組資料流與送審安全架構
  - 摘要：確立圖號/圖料 controlled drawing submission workbench、owner API edit path、immutable snapshot/hash、idempotency audit 與 generic upload retirement。
  - 來源 ID：`DEV-PDM-DRAWING-PART-WORKBENCH-001`
  - 父任務：圖面送審權威
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-PART-WORKBENCH-001-data-flow-security.md`、`.ai-doc/decisions/ADR-PDM-DRAWING-PART-WORKBENCH-001-data-ownership-and-submission-snapshot.md`、workbench security QC。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-026）
  - 批次發版：見 `DEV-030`、`DEV-032`；production deploy/migration、direct DB cleanup 與 existing-data repair 需走 release gate 或高風險確認。
  - 計入交付：是

- ✓ DEV-027 [交付點] [完成] [P2] [已歸檔] 圖面來源只送審流程
  - 摘要：讓圖面來源送審只負責 review-only submission，主資料必須在圖面/圖料模組先完成，不在送審中收 PDM master fields。
  - 來源 ID：`DEV-PDM-DRAWING-SUBMISSION-001`
  - 父任務：圖面模組主資料流程
  - 證據：`.ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-001-review-only-from-drawing.md`、`.ai-doc/qa/qa-pdm-drawing-submission-review-only-validation-plan-2026-06-30.md`、review-only QC/screenshots。
  - 歸檔：`.ai-doc/archived/completed-dev-index-2026-07.md`（DEV-027）
  - 批次發版：見 `DEV-030`、`DEV-032`；production deploy 需走 release gate。
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

- ↷ DEV-030 [關卡] [延後] [P0] [Release Gate Required] Supabase 執行期提供者與正式環境切換
  - 摘要：集中管理 SQLite/local provider 轉向 Supabase runtime provider 的正式切換決策，包含目標、成本、遷移、回復與責任邊界。
  - 來源 ID：`DEV-SUPABASE-DB-001`
  - 父任務：無
  - 任務清單：
    - [ ] 確認正式或準正式 Supabase target、費用承擔、資料保存責任與 fallback owner。
    - [ ] 確認 local SQLite、staging Supabase、production Supabase 的用途切分與 provider pointer 切換規則。
    - [ ] 確認 migration / rollback / smoke owner 後，才允許進入 `DEV-032` release gate。
  - 停止條件：缺 target identity、缺成本確認、缺 rollback owner、或要求直接切 live provider 時停止。
  - 下一步：PM 決定正式目標、成本、資料庫建議分流、遷移與回復負責人
  - 計入交付：否

- ! DEV-031 [QA/QC] [阻塞] [P0] [需高風險確認] Supabase 資料一致性政策執行
  - 摘要：定義正式遷移或資料比對前的資料一致性政策與 QC 邊界，避免未確認情況下直接比對、修復或清理 live data。
  - 來源 ID：`DEV-SUPABASE-DB-001-DATA-PARITY`
  - 父任務：`DEV-SUPABASE-DB-001`
  - 任務清單：
    - [ ] 確認要比對的資料表、時間點、來源快照、目標環境與一致性層級。
    - [ ] 先產出 read-only compare plan；任何 repair / cleanup 必須另走高風險確認。
    - [ ] QC 只可在確認的 disposable/staging target 上執行，且不得輸出 secrets。
  - 停止條件：要求 live data repair、資料刪除、資料覆寫、未確認 target compare 或缺憑證邊界時停止。
  - 下一步：確認一致性層級、來源快照、資料表範圍、目標與憑證邊界
  - 計入交付：否

- ↷ DEV-032 [關卡] [延後] [P0] [Release Gate Required] Supabase 正式環境關卡
  - 摘要：集中承接所有 production deploy、Supabase cutover、rollback、production smoke 與 release evidence；尚未進入 release gate 前只作為發版入口。
  - 來源 ID：`DEV-SUPABASE-DB-001-PROD-GATE`
  - 父任務：`DEV-SUPABASE-DB-001`
  - 任務清單：
    - [ ] 使用者提出 release 型指令後，套用 `deployment-release-gate`。
    - [ ] 確認 release scope：目前最小可上線範圍是 `DEV-040` 正式領號 / 草稿 production slice。
    - [ ] 確認 production target、smoke company / tenant、環境變數、migration plan、rollback owner 與 post-deploy smoke。
    - [ ] 完成 pre-build、build、production-like smoke、deploy evidence、post-deploy smoke 與 release report。
  - 停止條件：尚未明確要求 release、production target 不明、rollback 不明、migration/資料修復未確認或 smoke tenant 不明時停止。
  - 下一步：提出 release 型指令並完成高風險確認。
  - 計入交付：否

- ○ DEV-033 [交付點] [待排] [P2] [需產品上線決策] 儲存治理與成本上線推廣
  - 摘要：把儲存治理、成本控制、保留政策與真實儲存盤點轉成產品上線決策；目前不是 RD 可直接執行任務。
  - 來源 ID：`DEV-STORAGE-COST-001`
  - 父任務：儲存權威 / 成本控制
  - 任務清單：
    - [ ] 盤點目前檔案量、附件類型、保留年限、預期增長與備份需求。
    - [ ] 決定 Supabase Storage、Google Drive backup mirror 與離線備份的責任邊界。
    - [ ] 建立成本估算、保留政策與清理政策；未確認前不做 production rollout。
  - 驗收標準：上線前可說明儲存成本、保留策略、備份責任與不可自動清理的資料範圍。
  - 停止條件：需要外部費用承諾、正式資料刪除、bucket/RLS production 變更或 live migration 時停止。
  - 下一步：確認真實儲存盤點、目標、成本、保留政策與正式時程
  - 計入交付：是

- ✓ DEV-034 [關卡] [完成] [P0] [本機 disposable Postgres shadow gate 通過] SQLite 到 Postgres / Supabase 影子遷移
  - 摘要：已在 disposable local Postgres target 完成 shadow migration、RLS 與 schema/RLS compare 證據，避免直接碰正式資料或正式 schema。
  - 來源 ID：`DEV-IND-007`
  - 父任務：`DEV-SUPABASE-DB-001`
  - 任務清單：
    - [x] 準備 disposable Postgres target，不使用 production target。
    - [x] 跑 schema migration apply、RLS plan 與 shadow compare。
    - [x] 取得 `qc:postgres-shadow` 與 target guard 證據。
  - 證據：`data/quality/postgres-shadow/shadow-compare-1783676196559.json`；`npm.cmd run qc:postgres-shadow` 通過 26/26；`npm.cmd run qc:postgres-shadow-target-guard` 通過 11/11。
  - 停止條件：若未來改成正式 Supabase branch / project、正式資料遷移、direct repair 或 production schema 變更，必須回到 `DEV-030` / `DEV-032` release gate。
  - 下一步：第一版不再因 `DEV-IND-007` 阻塞；正式 Supabase target、provider pointer、advisor 與 production smoke 仍由 `DEV-030` / `DEV-032` 管控。
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

- ↷ DEV-036 [關卡] [延後] [P3] [未納入目前產品路線] SolidWorks Add-in 實機驗證
  - 摘要：目前第一版與技轉包方向改走 Web / Pack-and-Go / 等效上傳路線，沒有明確 SolidWorks Add-in 交付；不刪除歷史任務，但移出第一版 blocker。
  - 來源 ID：`DEV-SW-001`
  - 父任務：SolidWorks 整合
  - 任務清單：
    - [ ] 準備真實 Windows / SolidWorks 版本、安裝帳號、測試檔案與操作腳本。
    - [ ] 驗證 Add-in 安裝、登入/連線、讀取目前檔案、送出資料與錯誤復原。
    - [ ] 留存版本、截圖、log 與失敗情境證據。
  - 恢復條件：未來產品明確重新要求 SolidWorks Add-in 或 CAD workstation 內操作時再恢復。
  - 下一步：不列第一版 blocker；不可直接刪除歷史 ID。
  - 計入交付：否

- ↷ DEV-037 [關卡] [延後] [P2] [完整 PDM / 檔案保存階段] 離線單向備份與還原演練
  - 摘要：完整離線單向備份與隔離還原演練不列第一版正式領號 / 草稿 blocker；第一版正式上線前仍需在 `DEV-032` release gate 確認最小 DB snapshot / rollback owner。
  - 來源 ID：`DEV-BACKUP-001`
  - 父任務：儲存 / 發版準備
  - 任務清單：
    - [ ] 確認備份來源、離線目的地、保留週期、責任人與不可覆寫規則。
    - [ ] 執行一次備份與隔離還原演練，不碰 production 原始資料。
    - [ ] 留存 restore drill report、校驗值、耗時與失敗復原步驟。
  - 恢復條件：上線範圍包含正式 CAD 檔案保存、Google Drive mirror、Supabase Storage、完整 PDM production ready 或正式資料保存政策時恢復。
  - 下一步：第一版 release gate 只要求最小 snapshot / rollback owner；完整 restore drill 延後。
  - 計入交付：否

- ! DEV-038 [關卡] [阻塞] [P0] [需外部證據] 正式現場測試證據
  - 摘要：要求在正式或準正式現場取得端到端操作證據，作為 release / 上線判定前的外部驗證關卡。
  - 來源 ID：`DEV-FIELD-001`
  - 父任務：正式環境準備
  - 任務清單：
    - [ ] 選定 3-5 位內部 pilot 使用者、smoke company / tenant、測試資料與操作腳本。
    - [ ] 驗證正式領號、草稿建立、未開放功能 inert state、權限與錯誤復原。
    - [ ] 收集現場截圖、操作紀錄、問題清單與 go/no-go 判定。
  - 停止條件：未進入 `DEV-032` release gate、缺 pilot 範圍、缺測試資料隔離或要求宣稱完整 PDM production ready 時停止。
  - 下一步：取得正式現場測試證據
  - 計入交付：否

- ✓ DEV-040 [交付點] [本輪本地範圍已完成] [P0] [Release Gate Required for production use] 正式領號 / 草稿 production slice
  - 摘要：Web 正式領號與 `/numbering/part-drafts` 草稿 production slice 已完成 local product slice；未開放功能保留藍圖可見性，但 UI 與 API fail-closed。
  - 來源 ID：`DEV-PDM-PRODUCTION-SLICE-001`
  - 父任務：`DEV-PDM-NUMBERING-004`、`DEV-PDM-NUMBERING-SEQUENCE-CAPA-001`、`DEV-PDM-ACCESS-CONTROL-001`、`DEV-SUPABASE-DB-001-PROD-GATE`
  - 已完成任務清單：
    - ✓ 建立 central production-slice capability model 與 method-level allowlist / default-deny gate。
    - ✓ 新增 production-slice status API 與直接 URL blocked state。
    - ✓ Sidebar roadmap 保留可見，但未開放路由顯示 `未開放` 並導向 blocked page。
    - ✓ `/numbering/part-drafts` 在 production slice 下保留 create/edit/void/recycle，並將 `submit-review` / `reconfirm` / `restore` 做成 accessible inert action。
    - ✓ Direct API 對 `submit-review` / `reconfirm` / `restore` 回 stable `feature_not_open_in_production_slice`，且在 mutation 前停止。
    - ✓ Draft delete/recycle 仍使用既有 controlled-boundary predicate；正式 root/drawing/part 號碼不可回收。
    - ✓ `.env.example` 補上 `PDM_PRODUCTION_SLICE_MODE`。
    - ✓ Focused QC 與既有 numbering/UI/access-control regression 已通過。
  - 下一步：若要讓內部人員正式使用，先走 `DEV-032` release gate，確認 production target、smoke company / tenant、部署、rollback 與 post-deploy smoke；若要擴大到送審、發行、CAD、BOM 或完整 PDM，另開對應 DEV，不併入本 slice。
  - 阻塞 / 恢復條件：production release/deploy、live Supabase target、provider pointer、rollback、production smoke、資料恢復與直接資料修復仍由 `DEV-032` release gate / 高風險確認管控。
  - 證據：`.ai-doc/specs/SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md`、`.ai-doc/decisions/ADR-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch-boundary.md`、`.ai-doc/qa/qa-pdm-production-slice-numbering-draft-validation-plan-2026-07-09.md`、`.ai-doc/qc/qc-pdm-production-slice-numbering-draft-report-2026-07-10.md`
  - 批次發版：見 `DEV-032`；merge、PR、deploy、rollback、production smoke 與 release report 延後到 release 型指令或高風險確認。
  - 計入交付：是

## 1. 未完成任務與 release gate 明細

此 active board 只保留尚未完成、本輪可執行、需高風險確認、需外部證據、需產品上線決策，或本地已完成但仍需 release gate 的項目。已完成任務的完整歷史細節已歸檔到 2026-07 completed index 與 sweep 前快照；本節只作為派工與恢復條件的明細。

| 狀態 | DEV | 來源 ID | 類型 | 下一步 / 恢復條件 |
|---|---|---|---|---|
| ✓ 本輪本地範圍已完成 | `DEV-005` | `DEV-PDM-SUBMISSION-GATE-001` | 交付點 | Phase 1 local QC passed；Phase 2+ 需另指定，release/deploy 走 `DEV-032` |
| ○ 待排 | `DEV-015` | `DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-002-P2P` | 開發點 | 本輪未要求執行；指定第 2+ 階段切片後可進 RD |
| ↷ 延後 | `DEV-030` | `DEV-SUPABASE-DB-001` | 關卡 | PM 決定正式目標、成本、資料庫建議分流、遷移與回復負責人 |
| ! 阻塞 | `DEV-031` | `DEV-SUPABASE-DB-001-DATA-PARITY` | QA/QC | 確認一致性層級、來源快照、資料表範圍、目標與憑證邊界 |
| ↷ 延後 | `DEV-032` | `DEV-SUPABASE-DB-001-PROD-GATE` | 關卡 | 需要 release 型指令與高風險確認 |
| ○ 待排 | `DEV-033` | `DEV-STORAGE-COST-001` | 交付點 | 確認真實儲存盤點、目標、成本、保留政策與正式時程 |
| ✓ 完成 | `DEV-034` | `DEV-IND-007` | 關卡 | disposable local Postgres shadow gate 已通過；正式 Supabase release 仍走 `DEV-030` / `DEV-032` |
| ↷ 延後 | `DEV-035` | `DEV-CAD-001` | 關卡 | 3D 預覽人類實測 OK；2D 預覽 / native metadata 延後到完整 CAD 階段 |
| ↷ 延後 | `DEV-036` | `DEV-SW-001` | 關卡 | 目前無明確 Add-in 產品路線；保留歷史 ID，不列第一版 blocker |
| ↷ 延後 | `DEV-037` | `DEV-BACKUP-001` | 關卡 | 完整 restore drill 延後；第一版 release gate 只要求最小 snapshot / rollback owner |
| ! 阻塞 | `DEV-038` | `DEV-FIELD-001` | 關卡 | 取得正式現場測試證據 |
| ✓ 本輪本地範圍已完成 | `DEV-040` | `DEV-PDM-PRODUCTION-SLICE-001` | 交付點 | Phase 1 local product slice 已完成並驗證；正式部署、production smoke、release report 另走 `DEV-032` |

## 2. 批次發版與正式環境關卡

共用 release、production、Supabase、migration、provider pointer、rollback 與 production smoke 不掛在每個已完成 DEV 底下，集中由下列 active gate 管控：

- `DEV-030`：Supabase 執行期提供者與正式環境切換。
- `DEV-031`：Supabase 資料一致性政策執行。
- `DEV-032`：Supabase 正式環境關卡。
- `DEV-034`：SQLite 到 Postgres / Supabase 影子遷移已完成本機 disposable Postgres gate；正式 Supabase target 仍走 `DEV-030` / `DEV-032`。
- `DEV-040`：正式領號 / 草稿 production slice；Phase 1 local product slice 已完成並驗證，release/deploy 仍走 `DEV-032`。

尚未出現 release 型指令或高風險確認前，不得產生 merge plan、PR checklist、deployment plan、rollback plan、production smoke plan 或 release report。

## 3. External Blockers / Parked Scope（外部阻塞與暫停範圍）

這些項目沒有外部證據、高風險確認或 release-gate 指令時，不可交給 RD 直接執行。表格保留原始 task line，讓 `qc:dev-task-evidence-sync` 可以持續稽核已完成 gate 與延後範圍。

| 狀態 | ID | 範圍 | 阻塞原因 / 恢復條件 |
|---|---|---|---|
| [x] | DEV-IND-007 | SQLite to Postgres / Supabase shadow migration | Disposable local Postgres shadow gate passed with schema/RLS compare evidence; formal Supabase target/advisor work, if needed, remains in `DEV-030` / `DEV-032`. |
| [/] | DEV-CAD-001 | SolidWorks Document Manager or equivalent reader | Human test: SW upload OK and 3D preview OK; 2D preview/native metadata remains deferred to full CAD phase and is not a first-version blocker. |
| [ ] | DEV-SW-001 | SolidWorks Add-in real-machine validation | No current Add-in product route; task is retained as future optional integration, not deleted and not a first-version blocker. |
| [ ] | DEV-BACKUP-001 | Offline one-way backup and restore drill | Full restore drill deferred to full PDM/file-storage production readiness; first-version release gate only requires minimal snapshot / rollback owner. |
| [!] | DEV-FIELD-001 | Formal field-test evidence | Needs 正式現場測試 evidence. |
| [!] | DEV-STORAGE-COST-001 | Storage governance and cost rollout | Parked until real storage target, inventory, lifecycle policy, cost, and production timing are approved. |

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
