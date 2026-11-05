# DEV-127：平台與 AI-PDM 管理資格 consumer contract

建立：2026-11-05（Asia/Taipei）。Owner：`AIPDM/DEV-127`。來源：`JENFU/DEV-022#pdm-administration`。

**成熟度／狀態：`IMPLEMENTING / LOCAL_BRIDGE_SOURCE_SELF_CHECKED / NEW_REQUIRED_CI_PENDING / PERSISTENT_LOCAL_AND_REAL_ACTOR_ACCEPTANCE_NOT_RUN / PR_OPEN_DRAFT`。** 2026-11-05 人類授權涵蓋四專案開發至部署發布；本 owner consumer source 與隔離自查已有證據；本輪新增受控 local bridge source 見§8.6。AI-PDM #571 目前仍為 open draft；6d66ba5 required CI 已成功，新 bridge 的 required CI 尚待，GitHub CI 不代表正式雲端 provider 操作、持續地端資料庫或產品驗收。指定本人及兩個環境的驗收分母固定為同一個 Google 個人帳號 `jedchang0308@jenfu.com.tw`／張仕杰 `JFS0005`；需真實 AAL1，並保留有效 AAL2 相容性。持續地端 DB、正式 DB／runtime／traffic／IAM／Secret、本人 root/admin 任用及正常 UI 驗收均未執行；source 或 CI 通過不代表產品或發布完成。

新增 source：v5 effective grants consumer、manager eligibility v2、apply/lock v2、workspace v4、current catalog v3、protected 第十 profile 與 additive owner upgrade bridge。096 只安裝 v3/v2 database surface 並撤銷 runtime 對舊 v1 writer 的 `EXECUTE`；它不改 active catalog、不授予管理任用。隔離／升級前測試基線為 v1；persistent target 的目前狀態未知，正式動作前須 provider／PG readback。正式升級須先部署並正常驗證可雙讀 v1/v2 的 PDM consumer，再由 owner bridge 以 CAS／原 receipt 追加角色；九個 legacy profiles 與所有 custom permissions、identity、status、profile 均須保留。新 protected role 佔獨立一格，使既有 custom-role 容量保持不變（v3 total cap 65）。本機 CLI 僅提供 read-only plan/status；自由 DB URL 的 commit writer 已移除，loopback／DB 名稱不作 disposable 所有權證明；真正 primary-local database 不是 disposable，不可放寬 guard 連線，本輪新增受控 local bridge source（§8.6），source 自查通過，仍待獨立review／required CI及真實地端驗證；local 升級未執行。

原始自查摘要（2026-11-05，歷史 source baseline；RD，非獨立 QC）：19 個 focused test files `197/197 PASS`；PG18 task-owned disposable cluster 執行完整096及七組 proof PASS，包含 additive CAS／replay、逐列保留、實際 ACL、personal AAL1 apply、AAL2 replay、wrong identity／session／epoch／workload／非 READ COMMITTED 拒絕，以及 `pg_stat_activity` 觀察 apply 真實等候 authority fence 後撤權拒絕。PG producer 明示 `SYNTHETIC_CONTRACT`；跨 owner 真實044/045＋096由總控另驗，不能互代。驗證 cluster 均已停止；正常 runner 的暫存已清除。兩次早期 pg_ctl pipe-handle 問題所留 task-owned 暫存 `C:/Users/user/AppData/Local/Temp/aipdm-dev127-pg-vQYU1P` 與 `aipdm-dev127-pg-nYPEXs`，port 54701/50217 已釋放，exact-path 刪除遭自動安全審查拒絕（僅回 blocked by policy），故保留，未繞過。此分母不與2026-11-06 current-main或owner bridge／executor／runner批次合併。

`npm run typecheck:app`、registry `--check` 與 `npm run check:db-boundary` 已通過；production profile 已在原40筆後追加096為order41，原prefix不變，local-only091–095未帶入。正式 migration／catalog upgrade 尚未執行。最新 source、required CI 與驗收狀態見§8；正常 Google/browser UI、持續地端 DB、正式 provider／資料操作與本人升權仍未執行。隔離 PG 入口：`scripts/dev127-consumer-postgres.mjs`；persistent owner upgrade 只能走封閉 finalize Job bridge，不能以 local proof CLI 代替。

### 2026-11-06 current-main integration 自查（歷史 source baseline `a97524979`，未deploy）

- 當時的整合 source 位於 `C:/VIBE CODING/.worktrees/AI_PDM/dev127-platform-super-admin-20261105`，branch `codex/dev127-platform-super-admin-20261105`，HEAD `a97524979e4b89e03052be83b724d4818b15ad31`。只套本slice patch及分段合併DEV文件／package scripts；原next-env dirty未帶入，canonical依賴junction仍為`C:/VIBE CODING/AI_PDM/node_modules`。最新 HEAD 與本機 CLI writer 修正見§8。
- 所有新hash-bound package／registry／manifest／fixture與096已固定實體LF及Git attributes。初輪LF檢查保留1 FAIL／81 PASS；整形後release/LF82例通過。096 raw source SHA=`c5a064cffc6c5f9abef085e8ed14ff11ab11c2562ccaae41f19021e49f9bf9b1`；derived applied SHA=`36d53700ba87ea6aa278ff227aef33f1f203942b491f0d01e4af5de8b6087ffa`。Producer package SHA仍`df24e788a8509339eb1c81fbaa751eb403d51fcecbf638ca1ba30db6ecfff1c6`。
- Production profile已追加096為order41，舊40筆prefix逐項不變，local-only091–095未納入。Owner archive proof、historical prefix continuation與current source tests同步支援exact41；不擴張program-only執行資格。
- 新main 21個非DOM Vitest files共222 PASS；本機 affected slice 四組PASS：planner22、release-core246、database11、authorization50，共329，為LOCAL證據而非GitHub required CI。最新完整細項及新增bridge／executor／runner、PG proof數量見§8。Typecheck PASS、owned source ESLint 0 errors／1既有warning、diff check PASS。
- `/api/auth/me`只additive回`employee_name`。以同一verified Principal／Employee查OrgMaster042 display projection；失敗用savepoint隔離，實際PG readonly auth transaction仍可使用。sidebar只用該正式中文投影，否則「員工」，不以本app profile、Google中文暱稱、email、Win或EmployeeId代替；SSO wire／身份／業務approver姓名未改。
- DOM四例在本機`NOT_RUN`：canonical dependencies缺jsdom；只讀借用舊root exact27.4.0的有界overlay仍在Vitest初始化報`JSDOM is not a constructor`。未重裝、未改canonical junction，沒有臨時絕對路徑進產品或CI。該DOM4後於舊 SHA `e813d6137` 的 remote required CI 成功；最新 HEAD 的 exact-run 分母及 full candidate 跳過狀態見§8。正常 Google／browser UI仍須另驗，不能以DOM4或非DOM PASS替代。
- `scripts/lib/dev127-role-policy-release-gate.mjs`與closed post-finalize catalog bridge已接既有owner prepare/finalize/rollback：prepare綁dual-reader source及096後的policy-write pause窗口；finalize只在正常canonical SSO/auth/logout proof後記own-bucket immutable compatible-artifact receipt；正式upgrade須真FINALIZED control、100%相同artifact及protected workflow，先寫monotonic activation fence才進DB commit；其後普通rollback拒v1-only artifact。bridge source已完成並由隔離／source測試驗證，但provider Job、正式DB寫入及正常登入驗收未執行。既有Principal-only DB-free maintenance回復沿原exact proof路徑，無新增IAM／Secret／對外環境。

## 1. Owner 邊界與目前 source

2026-11-06 current-main整合 source baseline=`C:/VIBE CODING/.worktrees/AI_PDM/dev127-platform-super-admin-20261105`，branch=`codex/dev127-platform-super-admin-20261105`，當時 HEAD=`a97524979e4b89e03052be83b724d4818b15ad31`。舊`dev126-local-principal-sandbox-20261029`工作樹保留作source自查來源；原next-env dirty不遷入。初版197例／PG七組是歷史source證據，不覆蓋§8所列最新 HEAD 與驗證範圍。

正式順序：先有OrgMaster producer，再部署並以正常 canonical Principal session 驗明雙讀 v1/v2 的 PDM consumer，接著 owner additive catalog upgrade，最後由 OrgMaster 核准並授予 app-scoped grant。096 撤舊 v1 writer 後，policy write 必須暫停至雙讀 consumer 驗證和升級完成；096 本身不改 active catalog。隔離／升級前 source baseline 為 v1，persistent target 執行前須 readback，不能由 source 假定。v2 publication 提交後，v1-only 舊 revision 不具可用 rollback 資格；須事先有 v2-compatible own revision／相容維護或 forward-repair 回復基線，不能恢復 runtime v1 writer 或 down migration。詳 release spec §26.8。

- Platform 驗證 Google／Firebase 身分、SSO、Principal session、epoch 與撤銷。OrgMaster 唯一擁有平台 root 與 application administrator 任用資料及其版本化 projection。AI-PDM 消費 application-scoped 管理 grant、擁有 PDM 業務能力 policy；不讀寫 OrgMaster core、不複製管理 grant 到 PDM 的 `roleAssignments` 或舊 `managementGrants`。
- 跨 owner 前置是 Platform `JENFU/DEV-022` 整合入口，以及 producer／local-runtime 的 `OrgMaster/DEV-070`、`JF-FMS/DEV-070` 相依切片；各 owner 仍只操作自己的 source、schema、identity 與 runtime。此 AI-PDM slice 不代替兩個 DEV-070 owner 的 source、provider 或資料庫驗收。
- DEV-123 的現行 policy writer 在 `src/lib/role-policy-service.ts` 要求 active `human_privileged`、有效 AAL1／AAL2，並以 OrgMaster `v_ai_pdm_principal_effective_grants_v4` 查 exact `ai-pdm` direct global `role-system-admin / system_admin`；apply 另在 `src/lib/role-policy-apply-authorization.ts` 與 PostgreSQL 函式鎖後重驗。這些 v4/v1 gates 尚不支援本文件的新 app-admin grant。
- repo v7 source catalog 的靜態比較是 `pdm_admin=61`、`system_admin=66`、交集 61、system-only 5；它不是地端或正式 active publication／assignment readback。現行角色 policy editor registry 有 9 個 legacy profile，其中 `role-system-admin` 是 hidden-protected；`role-pdm-admin` 目前有 `settings.admin_matrix` 與 `pdm.shared_model.view`。保留九個既有角色 identity／permission 定義，不以預設 v7 template 重置目前 dynamic catalog。

直接 source：`src/lib/role-policy-service.ts`、`src/lib/role-policy-apply-authorization.ts`、`src/lib/repositories/jenfu-entitlement-repository.ts`、`src/lib/jenfu-entitlement-contract.ts`、`src/lib/ai-pdm-published-role-capability-workspace.ts`、`src/lib/ai-pdm-role-capability-service.ts`、`src/lib/role-policy-editor.ts`、`config/access-control/jenfu-role-catalog.v7.json`、`config/access-control/role-policy-editor-registry.v2.json`、`db/postgres/087_dev123_role_policy_candidate_validation.sql`。

## 2. 共用管理授權資料與 wire

### 2.1 OrgMaster 唯一寫入來源

在 OrgMaster `GovernancePolicyDataV3` 增加可選欄位：

```ts
administration?: {
  contractVersion: 'orgmaster.administration-policy.v1'
  version: number // positive safe integer
  initializedByCommandId: string | null // OrgMaster command UUID
  grants: AdministrativeGrantV1[]
}
```

讀取舊 snapshot 時，若缺少整個 `administration` 欄位，必須正規化為 `{ version: 0, initializedByCommandId: null, grants: [] }`；v0 沒有任何 admin authority，PDM 不得 fallback 到舊 role code、email、domain 或 v1 manager function。`initializedByCommandId` 記錄建立此 authority container 的 OrgMaster command；v0 為 null，初始化後固定保留該 command id。

`AdministrativeGrantV1` 的共用 wire：

```ts
type AdministrativeGrantV1 = {
  id: string // OrgMaster-generated UUID; stable for the grant lifecycle
  principalId: string
  employeeId: string
  roleCode: 'platform_super_admin' | 'application_system_admin'
  applicationId: null | string
  subjectKind: 'principal'
  basis: 'manual'
  scope: { kind: 'platform' | 'global' }
  status: 'active' | 'revoked'
  validFrom: string // ISO-8601 UTC
  validTo: string | null // half-open interval [validFrom, validTo)
  createdBy: { kind: 'principal' | 'owner_workload'; id: string }
  reason: string // NFC-normalized, nonblank, at most 240 Unicode code points
  catalogBinding: null | {
    catalogVersion: string
    contentSha256: string
    stableRoleId: 'role-application-system-admin'
    roleDefinitionHash: string
  }
}
```

Only these combinations are valid:

| 任用 | `applicationId` | `scope` | `catalogBinding` |
|---|---|---|---|
| Platform root | `null` | `{ kind: 'platform' }` | `null` |
| AI-PDM application administrator | `'ai-pdm'` | `{ kind: 'global' }`（只在 AI-PDM app 範圍有效） | 必填，且 stable role 固定為 `role-application-system-admin` |

`principalId` 與 `employeeId` 是同一 verified target；不以 Employee 為查詢／展開鍵。Grant `id` 是 OrgMaster 產生的 UUID，且在其生命週期內穩定：撤銷時更新同一 id 的 `status='revoked'`，不得以新 id 假裝撤銷；續期以同一 command 撤銷舊 grant 並新增新 grant UUID／validity。OrgMaster writer 使用 UUID `commandId`（PDM 自己的 role-policy apply API 仍使用獨立 UUID `requestId`），帶 `expected.administrationVersion` 與 idempotent command receipt；成功後 version 單調增加。相同 commandId／actor／payload replay 回原 receipt，commandId 綁不同 actor 或 payload 回 conflict。PDM 不執行此 writer。

### 2.2 OrgMaster producer contract

- Producer-owned package：`contracts/orgmaster-administration/v1/contract-manifest.json`，schema/version 為 `orgmaster.administration-policy.v1`。OrgMaster migration 預留 `db/migrations/044_dev070_administration_projection_v1.sql`、`db/migrations/045_dev070_administration_commands_v1.sql`；這兩檔由 OrgMaster owner 實作及發布，非 AI-PDM migration。
- Producer view：`orgmaster_contract.v_application_administrator_grants_v1`，只輸出已發布、active validity window 內、exact target Principal 的 direct application-admin grant。Root row（`applicationId IS NULL`）不出現在此 app view。通用含 reason 的 view 只授 OrgMaster runtime；Platform 讀其 Portal visibility 派生 view，AI-PDM runtime 只讀 app-limited v5／manager eligibility，不直接 SELECT 通用 view。
- View manifest 欄位：`contract_version, administration_version, grant_id, application_id, principal_id, employee_id, role_code, subject_kind, target_principal_id, basis, scope_kind, scope_key, status, valid_from, valid_until, created_by_kind, created_by_id, reason, catalog_version, catalog_content_sha256, stable_role_id, role_definition_hash, published_at`。Wire 內巢狀 `scope/createdBy/catalogBinding` 在 SQL view 扁平化；PDM 對 manifest version、row count、各欄位型別與 source hash 嚴格驗證。
- PDM 不直接讀通用 administration view；它只讀 app-limited v5 effective grants 並呼叫 eligibility v2。Producer-owned package 仍以 `contracts/orgmaster-administration/v1/contract-manifest.json` 綁 source hash；AI-PDM manager eligibility consumer manifest `config/access-control/orgmaster-role-policy-manager-v2.manifest.json` 綁 v2 eligibility / authority lock contract。`ai_pdm_role_policy_manager_eligible_v2(text,text,text,text)` 的參數為 Principal、Employee、issuer、subject；新 consumer 不以 `v1` eligibility 兜底。

### 2.3 Effective-grant v5

OrgMaster v4 contract manifest 實際有 **19 欄**：`contract_version, assignment_version_id, assignment_version, assignment_id, grant_kind, delegation_id, application_id, principal_id, employee_id, subject_kind, target_principal_id, stable_role_id, role_code, catalog_version, scope_kind, scope_key, valid_from, valid_until, published_at`。v5 保留這 19 欄原名／原語意，並且只新增 4 個不重名欄位 `source_assignment_id, source_grant_id, admin_catalog_sha256, role_definition_hash`，合計 23 欄。舊 assignment rows 原樣保留；管理 grant 派生列的 `source_assignment_id` 與 `source_grant_id` 都等於 `AdministrativeGrantV1.id`。

新 PDM 管理列必須同時符合：`application_id='ai-pdm'`、`role_code='application_system_admin'`、`stable_role_id='role-application-system-admin'`、`subject_kind='principal'`、`target_principal_id=principal_id`、row Principal／Employee 與已驗證 session 完全相同、direct／無 delegation、global／scope key NULL、active／validity window 生效。列的 `catalog_version/admin_catalog_sha256/role_definition_hash` 來自 grant issuance binding，代表授權當時的 catalog provenance；v5 新列保留授權時 provenance，並以 current canonical role 作目前 permission source，不把舊 permission blob 複製到 grant row。新任用命令須驗 binding 的 catalog version/content SHA 與當時 current catalog 完全一致，並核對同一 source-owned role 的 definition hash。AI-PDM 每次判權驗 grant 內的 immutable authoring provenance，再讀目前 PDM catalog 的 active canonical role；要求 stable role id/code 與 `role_definition_hash` 仍等於 grant binding。一般 role policy publication 可改變目前 catalog version/content hash，但只要 protected admin role definition hash 不變，既有 app grant 繼續有效；不得將 grant issuance 的 catalog version/hash 與目前整份 catalog version/hash 要求相等。Protected role definition hash 變更時才 fail closed，須由 OrgMaster 以新授權命令撤銷舊 grant 並授新 grant。絕不把 application grant fan-out 到同 Employee 的其他 Principal，也不 fallback 到 legacy permissions。

`ai_pdm_role_policy_manager_eligible_v2` 允許：

1. active `human_personal` 或 `human_privileged`，有 exact Principal／Employee、有效 session／epoch／issuer／subject，且具上述 direct active `ai-pdm` `application_system_admin` row；或
2. 明確相容的 legacy path：active `human_privileged` 加現有 exact direct global `role-system-admin / system_admin` grant。

兩條路徑都要求 AAL1 為最低 assurance；真實有效 AAL2 照常接受。v2 缺失或不符時不退回 v1。Platform root 本身不會產生 AI-PDM app-admin row；PDM app admin 也不會產生 root 或其他 application row。

## 3. PDM protected administrator role 與 catalog transition

### 3.1 Canonical role 和權限集合

新增 source-owned canonical role：

| 欄位 | 固定值 |
|---|---|
| `stableRoleId` / `roleCode` | `role-application-system-admin` / `application_system_admin` |
| `subjectKind` / `assignmentTier` | `principal` / `app_admin` |
| `allowedScopeKinds` | `['global']`，global 只在 app_id=`ai-pdm` 內有效 |
| `risk` / `assignable` / recommendation / delegation | `critical` / `false` / `false` / `false`；唯一管理任用由 OrgMaster administration grant 派生，不走普通 role assignment |
| policy profile | 第 10 個 `hidden-protected` profile；不得由 UI 直接建立、複製、停用、自授或編輯其 identity／permissions |

此 protected profile 固定只有管理入口及必要唯讀支援能力：

| kind | allow permission |
|---|---|
| action | `settings.admin_matrix` |
| action（現行 PDM read group） | `pdm.drawing.view`, `pdm.part.view`, `pdm.model.view`, `pdm.transfer.view` |
| legacy action（現行模型讀取路由） | `pdm.shared_model.view`，沿 registry 的 `model:view` legacy binding 對應，保留 `/api/parts/[partNumber]/shared-models` read path |
| legacy view support | `action:handoff.published.view`, `action:numbering.workspace.view`, `page:numbering.drawings.view`, `page:numbering.request`, `page:numbering.tasks` |

不允許 `pdm.*.download/edit/review/publish` 或相應 number-state create/update/approval/publish/download action。管理者若要做這些業務操作，仍須另行取得明示 PDM business profile/action/resource scope；protected role 不可把支援讀取擴成業務寫入。`role-pdm-admin / pdm_admin` 保留為普通「圖料業務管理」profile，既有九個 legacy role permission 與既有 dynamic grants 全數不重寫。`role-system-admin / system_admin` 保持 hidden legacy compatibility，僅符合 2.3 的 privileged legacy path 時保留舊權利，不新授任用、不升為 platform root。

### 3.2 v1 → v2 additive owner upgrade

- PDM policy source 新增 `config/access-control/role-policy-editor-registry.v3.json` 與 protected role definition；`scripts/dev127-build-role-policy-registry.mjs` 只驗證／生成新 v3 registry，不覆寫 v2 source。Consumer schema 升為 `ai-pdm.role-policy-integration.v3`，current catalog view 升為 `ai_pdm_contract.v_application_role_catalog_v3`，workspace/envelope 升為 `ai-pdm.role-policy-workspace.v4`，publication format 使用 `dynamic-policy-v2`。`ai_pdm_contract.v_role_policy_publications_v1` 的 v1 歷史仍可唯讀；舊 v1 publication 不被重寫。
- 第一次 v2 upgrade 由 source-protected policy owner command 完成，不能要求尚未持有新 app-admin grant 的人手動先建立此角色。命令先 CAS 鎖定 current catalog version/hash，從當前 active publication 讀取既有 9 個 legacy role profile、所有既有/custom role、bindings、permissions、status 和 identity hash，逐一保留；依 registry source 追加第 10 個 protected profile，輸出 v2 hashes/content hash。不得從靜態 v7 template 重建／歸零 dynamic catalog，不得刪除或降權 legacy/custom permissions。
- Upgrade 的 exact replay 不重複附加 role；相同 request／source hash 回原 receipt。active catalog version/hash 漂移回 `ACTIVE_CONFLICT`，既有 v2 角色定義與 source registry 不符回 fail-closed error。新 grant 的 `catalogBinding` 只能綁定 upgrade 後目前 catalog version/content SHA 與 canonical roleDefinitionHash；grant row 不直接供業務 permission evaluator 當 permission blob。
- 新 v2 consumer manifest：`config/access-control/ai-pdm-role-policy-contract-v3.manifest.json`。新 workspace `admission.read/edit/apply` 保持三段式；history reader 必須同時讀懂既有 v1 歷史與 v2 current publication，禁止把 v1 historical 當 current writer schema。

### 3.3 Forward-only PDM migration

`db/postgres` 實作前 latest 為 local-only `095_dev126_local_abandoned_registration.sql`；本次新增 `096_dev127_platform_super_admin_consumer.sql` 並在 disposable PG 驗證，production profile 已於原40筆後追加order41；096 尚未套持續地端／正式 DB。096 additive 建立 v3 current catalog view／v2 manager guard／v2 apply entrypoints 與 exact grants；同時撤銷 `jenfu_ai_pdm_runtime` 對既有 `role_policy_lock_apply_v1(uuid,uuid,text,text)` 與 `role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,char,text)` 的 `EXECUTE`，保留舊函式定義及歷史唯讀路徑。這不會升級或改寫 active v1 catalog，也不會授予管理任用；部署後先暫停 policy writes，直到雙讀 v1/v2 consumer 經正常登入驗證並完成 owner additive upgrade。不得修改已套用的 `087_dev123_role_policy_candidate_validation.sql`，不改 OrgMaster schema，不讀寫 sibling `*_core`。

v2 SQL entrypoints 保持 v1 既有 positional API shape：`ai_pdm_core.role_policy_lock_apply_v2(uuid,uuid,text,text)` 參數為 `p_request_id uuid, p_draft_id uuid, p_actor_principal_id text, p_session_id_hash text`；`ai_pdm_core.role_policy_apply_v2(uuid,text,text,text,text,uuid,integer,text,char,text)` 參數依序為 `p_request_id uuid, p_actor_principal_id text, p_session_id_hash text, p_identity_issuer text, p_identity_subject text, p_draft_id uuid, p_expected_revision integer, p_expected_catalog_version text, p_expected_catalog_sha256 char(64), p_reason text`（PostgreSQL identity signature 中 `char(64)` 顯示為 `char`）。Lock 維持 READ COMMITTED 同交易，先取得 OrgMaster v2 administration/manager authority fence，再鎖 Principal account/session、request idempotency row、active catalog/publication、draft；鎖後新快照核 exact principal/account/session/epoch、AAL1-or-AAL2、validity window 及 `ai_pdm_role_policy_manager_eligible_v2`。`apply_v2` 必須直接重驗，runtime 不能靠直接呼叫 SQL function 繞過 PDM manager gate。`create/save` 仍由 policy service 在寫前及 row/advisory lock wait 後重驗同一 v2 eligibility；不得只改 UI disabled。v2 eligibility 保留 active `human_privileged` 的 exact direct global legacy `role-system-admin / system_admin` 例外。

## 4. PDM active caller 與檔案改動面

### 4.1 Direct authority consumers

| 目前 caller | DEV-127 必要變更 |
|---|---|
| `src/lib/jenfu-entitlement-contract.ts` | 定義 grant v5 row type、contract id/version 與新 source provenance 欄位；v4 不被假裝成 v5 |
| `src/lib/repositories/jenfu-entitlement-repository.ts` | 主 permission evaluator 由 v4 切到 v5；驗 exact Principal／Employee、source ids、grant issuance provenance、current protected roleDefinitionHash、scope/validity；root-only 不成為 PDM entitlement |
| `src/lib/role-policy-service.ts` | workspace/read/edit projection 和 draft create/save/apply/receipt admission 使用 v2 eligibility；保留 current legacy exception；將新 protected role固定不可編輯 |
| `src/lib/role-policy-apply-authorization.ts` | 新鎖函式與鎖後 v2 revalidation，AAL1 minimum、接受 AAL2、session/account/grant freshness 同交易核對 |
| `src/lib/ai-pdm-published-role-capability-workspace.ts`、`src/lib/ai-pdm-role-capability-service.ts` | holder count／角色顯示辨認新 role；以 grant issuance provenance 對照 current protected roleDefinitionHash，不將 root 或舊 system_admin 顯示成新 root |
| `src/lib/role-policy-editor.ts`、`config/access-control/role-policy-editor-registry.v3.json`、`scripts/dev127-build-role-policy-registry.mjs` | 新 schema/catalog validator、protected role definition/hash、v2 additive upgrade/source inventory；不改 v2歷史來源 |
| `src/lib/role-policy-route.ts`、`src/lib/role-policy-http.ts` | workspace response version v4、讀取與管理 admission 分開、authority failure 安全回應 |
| `config/access-control/orgmaster-administration-v1.manifest.json`、`config/access-control/orgmaster-role-policy-manager-v2.manifest.json`、`config/access-control/ai-pdm-role-policy-contract-v3.manifest.json` | PDM vendored consumer manifests；逐項驗 producer source SHA／signature，禁止 runtime readiness flag 或 fallback |

一般 app request 的 v4 direct SQL callers（須按責任改 v5）：`src/lib/repositories/jenfu-entitlement-repository.ts:136`、`src/lib/role-policy-service.ts:142`、`src/lib/ai-pdm-published-role-capability-workspace.ts:31,47`，加上 contract type `src/lib/jenfu-entitlement-contract.ts:4,73`。其餘業務 API 經 principal/company permission wrappers 共用 entitlement repository；不在各 API 自行加 root bypass。`src/lib/jenfu-principal-owner-contract-manifest.ts` 目前是 Principal security owner-command source manifest，不是 role-policy caller；除非 owner command 在實作期也直接消費本 admin contract，否則不納入本 slice。

### 4.2 API routes / UI

現行 9 個 role-policy endpoints 維持 route surface，全部經 `src/lib/role-policy-route.ts` 的 `settings.admin_matrix` 基本 route guard 及 verified Principal header binding：

| 方法／路徑 | 用途 |
|---|---|
| GET `/api/settings/access/role-policies/workspace` | current catalog、selected draft、`admission.read/edit/apply` |
| GET／POST `/api/settings/access/role-policies/drafts` | 列草稿／建立草稿 |
| GET `/api/settings/access/role-policies/drafts/[draftId]` | 草稿 readback |
| POST `/api/settings/access/role-policies/drafts/[draftId]/save` | 保存 |
| GET `/api/settings/access/role-policies/drafts/[draftId]/preview?expectedRevision=` | diff/CAS preview |
| POST `/api/settings/access/role-policies/applications` | atomic apply |
| GET `/api/settings/access/role-policies/publications`、`/publications/[catalogVersion]` | 歷史 publication/detail |
| GET `/api/settings/access/role-policies/commands/[requestId]` | apply receipt/readback |

管理判斷不是 `settings.admin_matrix` 單一 action：目前 v7 `pdm_admin` 已有該 action，故 business-only profile 可依 route permission 讀取 workspace，但 `admission.edit/apply` 必須為 false、建立／保存／套用與他人 command read 必須 403。new app-admin grant 只給 protected admin role 的限定管理與 read support。正式 UI 是 `/settings/workflow` → `src/components/settings-screen.tsx` → `src/components/access-governance/role-capability-settings.tsx`。標籤須區分 `PDM 系統管理員` 與 `圖料業務管理`；矩陣內 `PDM 管理` 自授 checkbox 繼續 disabled。

圖號正常入口 `/numbering/drawings` 由 `numbering.drawings.view` 保護。讀取角色需要其餘 4 個 app read actions，並保留 registry 對 `pdm.shared_model.view` 的現有 legacy binding。業務 writer/approval/publish routes 照 `pdm.*.edit/review/publish`、numbering permission、resource、company/project scope 及原 domain guard 判斷；app admin read-only support 不作 allow shortcut。UI source 預期變更面：`src/components/access-governance/role-capability-settings.tsx`、`src/components/settings-screen.tsx`、`src/lib/numbering-permission-codes.ts`。

### 4.3 Response / error contract

- Role-policy success envelope 升為 `{ contractVersion: 'ai-pdm.role-policy-workspace.v4', data, correlationId }`，cache 為 `private, no-store`。Workspace 的 admission 明列 `{ read:boolean, edit:boolean, apply:boolean }`；只有 exact app-admin／legacy exception 及正常 session 才 `edit/apply=true`。UI 依 server projection，不能把 grant 身分或 `platform_super_admin` 暴露成通用業務權限。
- Error envelope 繼續 `{ code, correlationId }`／`private, no-store`。無 eligible app-admin / legacy manager：`ROLE_POLICY_MANAGER_REQUIRED` 403；v2 manifest/view/function unavailable、授權時 binding provenance 無法驗證或 current protected roleDefinitionHash mismatch：`ROLE_POLICY_AUTHORITY_UNAVAILABLE` 或既有 `ROLE_POLICY_DEPENDENCY_UNAVAILABLE` 503；一般 catalog version/content hash 更新本身不觸發此錯誤；request schema invalid 422；active catalog/draft/idempotency conflict 沿用既有 `ACTIVE_CONFLICT`／`DRAFT_CONFLICT`／`REQUEST_ID_REUSE` 409。不可對 v2 unknown 狀態降級讀 v1 並回 200。

## 5. 相容性、撤權與失敗處理

- v5 entitlement view 保留 v4 ordinary/legacy rows；新管理列只由 administration application grant 派生，不寫 PDM `roleAssignments`／legacy `managementGrants` 副本。v2 role catalog upgrade 從 current published dynamic catalog 起算，保留 9 legacy profiles、所有 custom profiles、既有 permissions／status／hash binding；舊 v1 publications 只讀，不改寫。
- 本人未取得 app admin grant時，只有 platform root 不足以進入 PDM manager path。只有 ordinary business role 時可以讀取其原本允許的 PDM 資料／policy workspace；不得建立、保存、套用角色政策。PDM app grant 撤銷不撤銷 root，root 撤銷不撤銷獨立 app grant。grant 到期／撤銷、Principal 停用、Employee link 變更、session/epoch 失效、grant issuance provenance 無法驗證、current protected roleDefinitionHash 不同或 producer v2 unavailable，下一次 read/write 依各 permission boundary deny/503；一般 catalog version/content hash 改版但 protected roleDefinitionHash 相同不撤銷管理資格；鎖等待後不得使用舊 cache/session。
- `role-system-admin` 舊權限不自動轉成 platform root；新管理者以 v2 protected profile 取得有限 admin/read 權限。所有 business write/approval/publish 要由明示 business profile/action/resource 另行准許。既有 `pdm_admin` business permission 不被偷偷收窄或重命名，UI 文字則清楚區分圖料業務管理與系統管理。
- PDM SQL 只修改 `ai_pdm_core`／`ai_pdm_contract`；OrgMaster 只由 OrgMaster owner 修改其 own core/contract。這份 consumer spec 不宣稱 producer migration/command 已實作或套用；消費前置為 OrgMaster v1 admin producer contract 及 role-policy manager v2 function/view 已發布並通過雙邊 manifest/source QC。

## 6. focused verification 與未完成驗收

### 6.1 Source tests（source-only 自查；2026-11-06）

測試批次分開記錄：早期 source baseline 是8 files／104例及相關caller共19 files／197例；2026-11-06 current-main 非DOM Vitest 是21 files／222 PASS。另一次本機 affected-slice 執行由planner22、release-core246、database11、authorization50組成，合計329 PASS，分母與前述Vitest不同。最新責任面自查另有 disposable PostgreSQL 10組 proof、bridge 37例、executor 34例、runner 11例 PASS。以上皆為 RD source／隔離測試，不是 provider 或產品驗收；既有 DEV-123 legacy vector 仍由凍結模組驗證，不以 v2 格式覆寫歷史。

TypeScript app檢查、registry check、DB boundary通過。ESLint 0 errors，`role-capability-settings.tsx` 的既有 `useEffect` dependency warning保留，非本次改動行。上述是RD自查，不是獨立QC或正常Google/UI驗收。

### 6.2 Isolated PostgreSQL test（已執行，synthetic producer）

固定入口 `npm run test:dev-127:postgres` → `scripts/dev127-consumer-postgres.mjs`。每次建立自己的PG18 cluster，執行完整096；PDM baseline fixture只含所需catalog、draft、command、identity及session schema，086/087所需catalog tables/views/canonicalizer取原source片段，不宣稱完整086–090重播。OrgMaster／Platform contract在此runner是明示synthetic，其真實migration由總控跨owner runner另驗；兩者證據不可互代。

最初七組 proof 已涵蓋完整096、owner-only additive CAS／exact receipt replay、九legacy＋一custom逐列保留、實際 ACL、personal AAL1／AAL2、wrong identity／session／epoch／workload／isolation 拒絕，以及 `pg_stat_activity` 可觀察的 authority lock 等候與撤權拒絕。最新擴展到10組 PostgreSQL proof PASS，含 closed post-finalize bridge 對096 ledger checksum、portable Job 候選與實際 owner domain core 一致、commit 後斷線以新連線讀原 receipt、readonly status/replay 等分支。OrgMaster／Platform 在 synthetic runner 仍明示為 synthetic；不能替代真 producer、正式 DB 或 provider。Portable helper `scripts/lib/dev127-consumer-postgres-fixture.mjs` 使用 task-owned disposable connection，不連持續地端、staging或production。

本 runner 不連 AI-PDM persistent local、staging 或 production，不以091–095作正式 ledger 證據。正常完成的 cluster 已停止清除；兩個早期已停止 cluster 的暫存保留原因見本文件開頭。persistent local 的直接升級 CLI 目前刻意 fail closed，不能將這些隔離結果寫成 local upgrade 完成。

### 6.3 Normal UI acceptance

UI runner 與 `npm run qc:dev-127:administration-ui` 目前只是規劃中的入口；本 HEAD 尚無對應 script/package command。以下列出需要覆蓋的 consumer 行為。若之後建 isolated runner，使用隔離 PDM runtime／synthetic Principal fixtures、桌面與既有核准窄版 viewport；fixture 結果不可作真實登入或指定本人驗收證據：

1. 以代表 active human_personal Google/Firebase Principal 與 AAL1 的 fixture 驗 `/settings/workflow`；v2 exact AI-PDM app grant 讓 policy 頁建立草稿、保存、確認差異、套用並在 reload 讀回 receipt。fixture不得把AAL1偽標成AAL2；真實登入由下方 actor acceptance 驗證。
2. `platform_super_admin` only、無 app grant 的 Principal 打開正常入口及直接 GET/POST policy routes仍拒；ordinary `pdm_admin` only 可 read其既有 workspace資料，但 policy write buttons disabled 且 direct create/save/apply 403；錯 Principal、已撤／過期 app grant reload 後同樣拒絕。
3. 新 app-admin profile 能進 `/numbering/drawings` 及讀取 policy-required support pages；無額外 business profile 時新增／編輯／審核／發布／下載仍依各 business permission/resource guard deny。加入普通 business profile 後只開啟該 profile 明示能力，無普遍 allow。
4. 畫面清楚呈現「PDM 系統管理員」與「圖料業務管理」兩項責任；`role-system-admin` 舊角色、PDM 管理 matrix 自授 checkbox仍 hidden/disabled；無 page-level 橫向溢出及 browser console error。證據記錄來源 revision、登入/fixture pseudonymous IDs、workspace admission、request status/correlation、UI route/result及cleanup；不得記錄 token/cookie。

上述 isolated runner／synthetic Principal cases 只驗 consumer 行為，不滿足正式 actor acceptance。整體驗收分母固定包含同一真實 Google 個人帳號 `jedchang0308@jenfu.com.tw`／張仕杰 `JFS0005`，以真實 AAL1 為最低並保留有效 AAL2；不可用 synthetic Principal、偽造 AAL、替代帳號或 CLI/SQL 寫入代替。需分別在持續地端環境與 production，經正常 Platform root/admin UI 驗證該 Principal 的平台 root 任用，再經正常 AI-PDM UI 驗證 app-scoped administrator grant、policy consumer read/write admission、reload 後身份與權限一致；並確認 app-admin 不授予 business write 或其他 app 權限。各環境需獨立記錄 exact source、環境、同一 pseudonymous actor、實際 AAL、正常 UI route/result 與安全 cleanup；兩環境任何一項未完成，產品 acceptance 仍未通過。

## 7. Stop conditions 與 execution boundary

- 任何 v2 contract missing、無法驗證 grant issuance provenance 或 current protected roleDefinitionHash、同一 grant對應多 Principal、root/app `applicationId`混淆、v4/v5 row重複衝突、migration ledger不符、active catalog CAS drift、session/epoch/grant撤權 race結果不明，立即 fail closed；一般 catalog version/content hash 更新本身不構成失效；unknown write outcome先使用 receipt/readback，不重寫原 request id。
- PDM migration 096 只有在 owner manifest/source order、migration profile、DB-boundary與 isolated PostgreSQL QC都明確後才可由 AI-PDM implementation/release work執行；人類已授權同範圍正式發布與本人任用；本RD切片先交source／隔離證據，正式migration、grant writer、provider及正常UI仍須沿各owner protected source／CI／release及已定身分前置執行，目前未執行。
- 本 slice 目前仍是 `IMPLEMENTING`，不得標成 `RD Implementation Ready`：primary-local wrapper 已補 source／mock 自查（§8.6），但尚未取得新required CI或證明真實 target／session 的實際完整串接。完成該 wrapper 的驗證後，OrgMaster 044/045 producer source/manifest、部署、正式 root/app grants、地端／正式 UI／formal administration PASS仍由各 owner 分別完成並回讀；文件標籤或 source-only測試不能替代它們。

## 8. PR #571 最新 source、CI 與 closed release bridge（2026-11-06）

PR #571 為 `OPEN / DRAFT`，目前 branch `codex/dev127-platform-super-admin-20261105` exact HEAD=`6d66ba5789169386da49f3d5941283386f318ffe`。此 HEAD 在 `a97524979` integration source 後持續收斂；正式profile從既有40筆僅追加096，未納入091–095。096 source LF SHA256=`c5a064cffc6c5f9abef085e8ed14ff11ab11c2562ccaae41f19021e49f9bf9b1`，applied SQL hash=`36d53700ba87ea6aa278ff227aef33f1f203942b491f0d01e4af5de8b6087ffa`。

`dev127-catalog-release-bridge.mjs`由既有finalize執行：先完成 dual-reader artifact 部署、正常 canonical Principal smoke、RELEASED terminal 及 FINALIZED control，fresh provider 確認100%同一 immutable image 後，建立保守 v2 rollback fence。相同 release capsule 經 own-bucket immutable basis 與 operation，沿既有 exact migration Job／WIF transport 執行 `plan → commit`；失敗或 unknown 先既有 provider execution readback，再以獨立 readonly `status` Job 讀 PG 原 command receipt。不得重送未知 writer、指定 actor／SQL／環境、偽造 GitHub 旗標或使用 user ADC。Job 以 metadata exact migrator identity、Cloud Run execution/task、sealed capsule／source／runner digest 與 fresh serving image 驗來源，核096 ledger checksum，候選由 image 內 source-protected registry 生成並與 current catalog CAS。既有 runner executable-input gate 包含新增模組與 registry，因此必須按原 rotation 流程建立相容 runner image，不可重用舊 image 冒稱可執行。以上是已實作並完成 source／隔離自查的受限 bridge，正式 provider Job 尚未執行。

App 已 finalized 後 catalog 失敗不改寫 RELEASED terminal、不自動回舊 v1 image；finalize 重入沿同 capsule 既有 immutable 結果續查。普通 rollback 依 v2 fence 拒絕無相容證據的舊 image；原 maintenance recovery 仍受其原 exact proof 約束。缺席／DENIED／UNKNOWN 不得互相混用。此為 source contract；正式 Job、provider、persistent DB、正常登入與 browser UI 均未執行。

latest source self-check 的明確分母為：disposable PG 10組、bridge 37例、executor 34例、runner 11例 PASS。封閉 bridge、metadata／image／source／99% traffic 拒絕、immutable operation 拒絕任意 actor／SQL、unknown 只 status 及舊 v1 rollback fence 均有 source coverage。這些是 RD 合成／隔離自查，不是正式 DB、Google登入或 browser 驗收。

Header只用verified exact Principal+Employee讀OrgMaster `v_principal_display_profiles_v1.employee_name`，按Han＋空格／middle-dot、最多120字規則顯示；投影不可用或非合法中文一律「員工」，不猜email／員編／Google暱稱或本app舊姓名。不變更SSO wire、身份、business approver或user寫回。普通登入在optional view失敗時以SAVEPOINT保留交易可用。本機 canonical jsdom 缺失使DOM4本機`NOT_RUN`；`e813d6137`／run `42075224808` 的 remote required CI 曾通過DOM4與isolated build，僅作該 exact SHA 證據；不得將其寫成最新 HEAD 的完整build或真實Google/UI acceptance。

Local CLI `dev127-upgrade-role-policy.mjs`僅提供 read-only plan/status（BEGIN READ ONLY）；commit 在 URL parsing／Client construction／connect 前無條件拒絕，沒有 SET ROLE 或 upgrade writer。現有 loopback／`dev127_*` 只限制唯讀範圍，不證明 disposable 所有權。真正 primary-local 不屬 disposable，也不可弱化 CLI guard 連線；本輪另新增受控 local bridge source（§8.6），尚待required CI／實際完整串接，不能記為 local catalog upgrade 或本地升權完成。persistent owner upgrade source 的唯一入口為上述 sealed finalize Job bridge，不另加 DB credential／Secret。既有 Principal-only maintenance 沿原 exact recovery proof，不執行 feature catalog upgrade／不製造 app-compatible artifact 證據。

Current-main app typecheck、owned新增release模組ESLint、DB boundary、diff check已PASS；affected CI-profile四組329 PASS，分母與§6.1其他source測試批次分開。隔離 build 未啟動：Governor operation `pdm-dev127-isolated-build-20261106` 因 C 容量保護條件不足而 BLOCKED，沒有取得 lease，亦未降低預留／繞過 gate／清理未知容量。這是本機 isolated build `BLOCKED / NOT_RUN`；不得和舊 SHA remote build 或最新 CI run 混寫。GitHub exact-HEAD CI、production provider、Google/browser UI 與 persistent local DB 分別見§8.4及缺口表述。正式profile含096僅為source profile狀態，不表示migration或catalog upgrade已完成；隔離／升級前source baseline為v1，persistent target catalog狀態未知，任何實際操作前需先readback，再依雙讀consumer正常驗證結果安排owner additive upgrade。

Source交付PR為AI-PDM #571。首輪GitHub run `42072326926`（source `0745ba2d2`）完整保留兩個獨立失敗：precision PG fixture缺current v3 view，以及DOM4誤把既有「登出」status也當姓名比較。前者以真096 v3 SQL投影＋synthetic additive v5普通列補fixture，保留native v1/v4；新的task-owned PG18重播同required測試2/2、precision22組PASS並清除cluster/DB/roles/temp。後者改驗實際姓名span及獨立logout status，不改產品UI或減少四例。這些修正後的後續CI狀態見§8.4；正式provider／Google/browser及受控persistent-local bridge不由這些測試替代。
第二輪CI run `42073734546`（source `e25369c8b`）的PG required check、affected contracts及含DOM4的role-policy step均PASS；後續inventory package檢查發現既有operator image缺新migration-runner import的protected JSON。inventory與cutover-preview Dockerfile現補精確JSON／module closure，不加IAM、資源或執行權限；原inventory import-closure檢查及新增preview closure共22例本機PASS。當時尚待 fresh lane；其後 exact-source CI 如§8.4所述，個別 run 範圍不得外推為未執行的 full candidate。
PR571獨立source review於 `e813d6137` 找到1項P2：loopback＋`dev127_*`名稱不能證明cluster disposable，原direct CLI writer可能連到persistent或tunnel同名DB。最小修正直接移除自由DBURL的commit writer，不新增旗標／lease假證明；CLI只保留BEGIN READ ONLY的plan/status，commit在URL解析／Client建構／connect前一律 `DEV127_DIRECT_CLI_WRITE_REMOVED`。六個pre-connect negative目標覆蓋loopback persistent、localhost同名、IPv6 tunnel、遠端同名、無效及缺少URL；contract5例PASS、owned ESLint／diff check PASS。正式sealed Job與owned native harness core未改，先前隔離SQL證據可重用；真正primary-local bridge與完整產品成果仍待後續實作，不因移除開發便利writer而縮減。其 exact-HEAD required CI 已成功，詳§8.4。

### 8.4 Exact-HEAD CI 與產品驗收狀態

- PR `https://github.com/jedchang0308-jenfu/AI-PDM/pull/571` 於本次讀回仍為 `OPEN / DRAFT`，head=`6d66ba5789169386da49f3d5941283386f318ffe`。GitHub run `42078884110` 對此 exact SHA 為 `completed / success`；`DEV-012 Isolated PostgreSQL Cutover` 與 `Production Slice QC` 兩項 required checks 均 success。QC 的 `Verify isolated application candidate` 成功；`Full isolated release candidate` 為 skipped。因此不得宣稱該最新 SHA 已完成 full isolated release build。
- 舊 run `42075224808` 對 exact SHA `e813d61376b904988c158fb9b92f49d60c4950a4` 為 `completed / success`，曾通過 remote DOM4 與 isolated build；它是較早 revision 的有效證據，不改綁成 `6d66ba5` 的完整build證明。最新 HEAD 上本機DOM4仍因 canonical `jsdom` 缺依賴而`NOT_RUN`；本機isolated build因 capacity guard blocked、未取得 lease。兩者是不同環境、不同證據。
- GitHub required CI成功只表明該 SHA 的 required lane 通過；不表示 PR merged、正式 provider Job／migration／catalog upgrade已執行，也不表示持續地端資料庫、正式環境或指定本人已完成正常登入／UI驗收。產品驗收仍須§6.3同一Google個人帳號在持續地端與production各自通過正常 Platform root/admin 與 AI-PDM app-admin UI。

### 8.5 Primary-local bridge：下一個工程交接

目前 source 的可重用執行 seam 是 `scripts/lib/dev127-role-policy-upgrade.mjs::executeDev127CatalogSql({ database, operation, plan, readAfterUnknown })`：它使用呼叫端傳入的既有 `database` session，於同一連線管理交易、`SET LOCAL ROLE jenfu_ai_pdm_migrator`、v3 catalog read／candidate validation，以及 commit/status；不負責建立或證明連線來源、登入身分、資料庫所有權或 postmaster 所有權。`scripts/dev127-consumer-postgres.mjs` 以 task-owned disposable PG client 呼叫；`scripts/lib/dev127-catalog-job.mjs::runDev127CatalogJob` 則以真正 Job OIDC token 建立 client，先由 `assertDev127InstalledMigration` 讀回 `ai-pdm-096` 名稱與 applied checksum，再呼叫相同 executor。commit 結果不明時，Job 以 fresh client 走 readonly command receipt readback，沒有 receipt 時回 unknown，不重送 writer。

`scripts/dev127-upgrade-role-policy.mjs` 的 `commit` 已在讀取 URL、建立 `pg.Client` 或 connect 前無條件回 `DEV127_DIRECT_CLI_WRITE_REMOVED`；`plan/status` 仍是唯讀便利入口。loopback、`dev127_*` 名稱、傳入 URL 或 CLI flag 都不能證明 primary-local target 可寫或可清理。這個拒絕是安全邊界，不代表 primary-local bridge 已完成。

後續若接通真正 primary-local catalog upgrade，wrapper 需先證明並綁定：canonical private profile 的有效性／hash；本任務所擁有 OS postmaster 的程序與 target 關聯；實際 non-production OIDC 身分；既有、授權的 NOLOGIN migrator session（不可由自由 DB URL 臨時造角色／credential）；096 migration ledger row、名稱與 applied hash；plan 的 active catalog version／hash CAS；以及 write outcome 不明後以新 session readonly 讀同一 command receipt 的處理。驗明後只把既有 session 交給 `executeDev127CatalogSql`，沿現有 owner upgrade contract 做 additive CAS；任何 binding、ledger、CAS 或 session 不符即 fail closed。不得使用 free DB URL、重設／清空資料庫、降成 disposable guard，或把此 wrapper 當成 Platform root／OrgMaster grant writer。這些handoff條件的source實作已補於§8.6，尚待新required CI、獨立review及primary實際串接；沒有local catalog upgrade／本地升權驗收。

完成上述 source 後仍須分開驗證 task-owned primary-local session／target、正常 AI-PDM consumer 與真實 actor；synthetic／isolated CI 不能替代它。產品接受分母仍是同一 Google 個人帳號 `jedchang0308@jenfu.com.tw`／張仕杰 `JFS0005`，地端與正式環境皆需正常 Platform root/admin 及 AI-PDM app-admin UI 流程、真 AAL1（保留有效 AAL2）；目前兩環境均 `NOT_RUN`。

### 8.6 Local owner alignment／096 bridge（source implementation；primary writes NOT_RUN）

2026-11-06 coordinator readonly readback 發現既有 primary-local 的 `jenfu_ai_pdm_migrator` 是 NOLOGIN、非 superuser，但兩個 PDM schema 均由 postgres 擁有且未給它 USAGE/CREATE；既有 ledger 53 rows、current v2 view 存在、v3 不存在。切 migrator 讀 ledger 回 42501。這是 owner 前置缺漏，不以 runtime 提權、任意 URL、postgres 直接執行096或修改 applied migration 補救。

唯一新 local entry 為 `scripts/dev127-local-owner.mjs`，core 為 `scripts/lib/dev127-local-owner-bridge.mjs`／`dev127-local-owner-sql.mjs`。先以 canonical/no-link private pointer、同次 raw bytes hashes、exact PDM checkout source 與 task-owned PostgreSQL OS/PID/startToken/-D/pidfile 綁定 target；neutral inspector 只取 pointer 的 Platform checkout 的 `inspectLocalPostgresCluster`，兩個 source files 固定 SHA256，禁止任意 module／SQL／role／DB URL。pointer 的 runtime realm 仍核 exact runtime email／SID；私有 authorized_user snapshot 只用於 impersonate 已有 nonprod PDM migrator `dev010-aipdm-migrator@jenfu-platform-nonprod.iam.gserviceaccount.com`／SID `100840550008830914692`、audience=`http://localhost:1020`，再經 Google signature verifier 核 exact issuer/audience/email/SID。coordinator 已有此 exact pair 的真 OIDC readonly PASS；stg migrator 不能替代。不新增 SA/IAM/credential，不輸出 token／password／URL。

`plan` 只用原 owned operator 進 BEGIN REPEATABLE READ READ ONLY 盤點：兩個 own schema；ledger；九個 exact own tables `role_catalog_publications, role_catalog_entries, active_role_catalog, role_policy_commands, role_policy_drafts, role_policy_role_identities, principal_accounts, principal_session_records, users`；舊 `role_policy_lock_apply_v1(uuid,uuid,text,text)`、`role_policy_apply_v1(uuid,text,text,text,text,uuid,integer,text,char,text)`；publication view `ai_pdm_contract.v_role_policy_publications_v1`；hash helpers `dev123_canonical_json_v1(jsonb)`、`dev123_json_sha256_v1(jsonb)`。計畫綁 OID/signature、owner、definition、ACL、source、全 ledger 與 database marker；commit 必須在 advisory lock 下重讀完全相同 snapshot，任何 drift fail closed。

local-only forward append `db/postgres/local/097_dev127_local_owner_alignment.sql` 不加入 formal profile。最窄 scope：只給既有 migrator 兩個 own schema USAGE/CREATE；只轉上述兩個舊 function 與 publication view owner 到 migrator；九個表分別給必要 SELECT／INSERT／UPDATE（無 DELETE），ledger SELECT/INSERT，兩個 hash helper EXECUTE。既有 table/schema owners、其他 ACL、業務 rows 不動。Org／Platform 三個 versioned function 的 USAGE/EXECUTE 只驗既有狀態，欠缺由其 owner 修；不跨 core 操作。

同輪TL另核准一個096實際必要的最窄grant option：只對`ai_pdm_contract`的USAGE給既有migrator WITH GRANT OPTION，讓原096:638能合法向既定Org migrator reader授namespace USAGE；core schema及所有CREATE均無grant option，schema owner仍postgres。安裝在ledger append之前機械查新function/view owner、Org namespace／兩view reader ACL、runtime v2 entry/read及v1/owner-writer拒絕，缺權限warning或錯SECURITY DEFINER owner一律整個transaction rollback，不能留下成功ledger。CI component另負向移除該grant option驗rollback，再以原097/096 source驗正常安裝。

`install` 在同一 transaction 先套 exact local097，再以 SET LOCAL ROLE migrator 套原096的既有 source-derived applied bytes，最後向 own ledger append local097 與 `ai-pdm-096`（exact name/checksum/source），一次 COMMIT；沒有中間可用的半套 ACL。local097 receipt 是 immutable own ledger row，version固定 `ai-pdm-local-dev127-owner-alignment-v1`，name固定格式 `dev127_local_owner_alignment_<planSHA256>`；兩筆 source_revision 都是真 source SHA40，不混用 plan hash。既有062 DDL的name/source_revision為text，actual inventory另要求這兩欄仍為text，足容prefix＋64字元。unknown commit 只用 fresh owned session readonly 查兩筆原 ledger，無完整一致 readback 一律 UNKNOWN，不重送。原 applied migration bytes 永不修改。此後 `catalog-plan → catalog-commit/catalog-status` 才沿既有 `executeDev127CatalogSql`、same source/target/migrator/096 ledger、active version/hash CAS 和原 command receipt；unknown 以新 session readonly 查原 receipt，不重寫。

每個入口重新核 runtime login 無 owner、migrator membership、database/schema CREATE 或 unsafe flags；operator/admin connection 不傳入 app runtime。source/mock 與 CI disposable SQL component 不代表 primary installation、local catalog upgrade、本人 Google/UI 或 production release。實際 primary writes 必須先取得此 source 的 review／required CI，由 coordinator 串接，這次未執行。

本輪新增17項Node自查PASS（RD，非獨立QC），含plan tamper／ledger與OID/definition/ACL/owner drift、外部owner ACL缺失、原子安裝順序、unknown只fresh receipt read、runtime database CREATE/migrator/unsafe權限、exactDEV migrator拒stg/runtime/Org替代、nonprod ADC quota、真private/control layout與bounded midread growth。Windows open-file rename fixture首敗為OS EPERM，已校準為明示接受reader inode拒絕或Windows實際阻擋；Linux CI另走實際rename/inode branch，不以Windows保護稱app branch已驗。既有required CI Linux disposable PostgreSQL lane已加入新component；本機未新建PG，source/隔離CI仍不代表primary commit或真本人UI。

首輪新source `0047925dc`：coordinator執行真primary-local readonly plan，OIDC／owned OS／actual runtime前置已通，停於 `DEV127_LOCAL_LEDGER_SHAPE_INVALID`，未DDL／業務寫入或產plan。owner再以原owned operator BEGIN READ ONLY/ROLLBACK查pg_catalog：name與source_revision實際均text/typeOID25/typmod-1，僅NOT NULL（另ledger有PKey/checksum check），足容plan前綴＋64；真正差異是OID經jsonb_build_object會成字串`"25"`，mock先前假設數字。inventory SQL已顯式`a.atttypid::integer`，仍strict25，不改private DB或放寬未知shape。required CI `42114586996` 的Linux新component首敗為 `DEV127_LOCAL_DATABASE_BOUNDARY_INVALID`：pg connectionString覆蓋另外傳入的database，故仍連CI service postgres；改為先改URL.pathname，讓target guard驗實際owned disposable DB。當時Windows獨立job繼續，沒有手動取消。本輪兩個首敗均保留，不能寫成primary install通過。

clean `e8554918f` 的真primary-local readonly plan已由coordinator產生`PLANNED`，private install-plan artifact SHA=`b203719321ceeb85d6b9bdce44305d27dcbe678863aa0197ad885d4bca891fe4`；未primary DDL／catalog commit。Org044/045/ACL或本輪source再變時必須重plan，不沿用舊CAS。其新CI `42116464483` Linux component仍在actual DB boundary拒絕，後續安裝／CAS案例blocked；不由猜測放寬127 guard。下一source只加whitelisted host/port/DB/role flags/marker hash的CI diagnostic，繼續fail closed取得真觀察，再收斂CI service transport。Windows獨立job保持完成。

`db40cd93`／CI `42118292436` 的safe diagnostic證實唯一差異是Docker服務實際host=`172.18.0.2`；port5432／PG18／session=current=postgres、runtime LOGIN/member=true，其餘全部runtime/owner/migrator/DDL/unsafe booleans均false。pure SQL component現在比對呼叫端已綁的`target.host`；真private wrapper仍只從pinned profile產生127.0.0.1:61312，沒有free host/DB URL或local auth/OS放寬。CI則限定既有GitHub job/service descriptor與固定postgres service credentials，先CREATE自己的隨機DB與nonce marker，再由readonly serverfacts綁實際Docker bridge host；它不是primary fixture。缺少CI前置、nonce或bridge地址均直接FAIL，不條件skip。原unknown/schema等SQLcases仍須在下一輪真component執行，不把先前host拒絕當那些case已PASS。

private wrapper另固定coordinator已讀回的expected DB comment `local-first-admin-corrected-genesis:16930fa3-b7cd-4c7c-947d-c3203e59178c`，不是自由input。共用component同時比對caller-bound host/marker；CI用其create-only nonce marker，真正primary用上述fixed marker。首次plan、重驗與status均拒絕missing/wrong marker，即使DB同名；不改private DBcomment，原e855只讀plan保留為當時證據，新source另replan。
