# DEV-117：AI_PDM 獨立正式部署 adapter

- 文件成熟度：`RD Implementation Complete`
- 狀態：`Human Confirmed / 117-S1 Implemented / Local QA-QC 12 of 12 PASS / Production Release Gated`
- 風險等級：High
- 日期：2026-09-07
- 來源 ID：`DEV-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001`
- 決策來源：使用者明確要求「AI_PDM 及 Jenfu-Platform 分開部署」並要求先完成可執行部署前的開發文件
- 父關卡：`DEV-116` Production Level 4 smoke tenant evidence
- 外部相容契約：[Platform DEV-011](../../../Jenfu-Platform/ai-doc/specs/DEV-011-independent-platform-production-deployment-contract.md)
  app-independent deployment、[Platform DEV-010](../../../Jenfu-Platform/ai-doc/specs/DEV-010-three-system-database-consolidation-contract.md)
  shared production foundation
- QA authority：[QA-DEV-117](../qa/qa-dev-117-ai-pdm-independent-production-deployment-validation-plan-2026-09-07.md)

## 1. 已確認決策

1. `AI_PDM` 與 `Jenfu-Platform` 是兩個獨立可部署單元；兩者各自擁有 source、artifact、service、
   hostname、environment／Secret binding、traffic、release receipt 與 rollback point。
2. 本 repository 只可建置、部署、驗證與回復 `AI_PDM`。不得建置、部署、切換或回復
   `Jenfu-Platform`。
3. Platform `DEV-010` 只供應 shared IAM、Cloud SQL、migration order、capacity、authority 與 compatibility
   evidence；不得因此取得 AI_PDM artifact、service traffic 或 rollback authority。
4. `DEV-116` 保留 `company-smoke` authenticated Level 4 證據責任，不擁有 deployment adapter；
   `DEV-117` 必須引用而不得重造或降低該證據。
5. 既有 [deploy-production.yml](../../.github/workflows/deploy-production.yml) 只指向 legacy
   `jenfu-ai-pdm-prod`，不得冒充 neutral `jenfu-platform-prod / ai-pdm-prod` 的獨立部署 lane。
6. 本階段只把開發契約寫到 RD 可直接實作；不建立新的 `REL-*`、不呼叫 GCP、不建 artifact、
   不寫正式資料庫、不建立 candidate、不改 DNS／authorized domain、不切流量。

## 2. Problem 與根因

目前存在兩套不同語意：

- legacy workflow 可對 `jenfu-ai-pdm-prod / ai-pdm-prod` 執行 prepare、candidate、promote；
- 現行 neutral production authority 要求 `jenfu-platform-prod / ai-pdm-prod`、獨立 runtime identity、
  shared Cloud SQL contract 與 `https://pdm.jenfu.com.tw`。

因此「legacy pipeline safety PASS」只證明舊 lane 本身可受控執行，不能證明 AI_PDM 已具備新架構下的
app-owned independent release capability。若直接沿用舊 workflow 進行 neutral release，會同時違反 target
identity、DEV-010 evidence prefix、numeric Secret version、first-revision 0% traffic、canonical origin 與
app receipt 契約，形成錯 target 仍可被標示為部署完成的 P0 false-PASS。

根因不是缺少另一份 runbook，而是 deploy authority 尚未被 machine contract 分離：舊 workflow 將 artifact、
migration、candidate、canonical hosting 與 legacy project 綁死；Platform 的三系統 producer 又只能協調 shared
foundation，不能成為 AI_PDM 的長期部署 owner。

## 3. 使用者／公司價值

- AI_PDM 可獨立發版或回復，不要求同步發布 Jenfu-Platform。
- Platform 可藉有效 `jenfu.app.release-receipt.v1` 判斷 AI_PDM 是否可啟動，不用取得 AI_PDM 部署權限。
- shared database 仍由 DEV-010 控制 migration／role／capacity，避免「應用獨立」被誤解成各自改資料庫。
- 每次 promotion 都可追溯 exact source、digest、revision、canonical smoke 與 rollback evidence。

## 4. Current baseline（2026-09-07）

| 項目 | 已驗證事實 | 對 DEV-117 的效力 |
|---|---|---|
| `origin/main` | `9840f201886bbda58d2b8c78b30b9c0e993b98be` | 可作規劃基線；正式 release 仍須重新 freeze clean source |
| legacy prepare | GitHub run `34097879524` success | 只證明 legacy prepare，不是 neutral candidate |
| app image | `sha256:9d114dfe7aa3654210801f6a1b09337f1594419ac6a12bca371b2a4068cd3b6a` | 可作 provenance 對照；除非 neutral provider receipt exact attested，不能直接算 QA-117 artifact PASS |
| migration image | `sha256:505fa8dd5620387bd0669b9d2ed7a7e67be9bd249ce0d287a311d3c0abe04bd4` | 只屬 legacy 063 lane；不得執行 DEV-010 062 |
| legacy migration 063 | backup、restore rehearsal、apply、rerun、readback均完成；ledger 54／highest 063 | 可證明 063 legacy prerequisite；不代表 neutral foundation 已完成 |
| legacy live service | `jenfu-ai-pdm-prod / ai-pdm-prod`，revision `ai-pdm-prod-gh-bb30682c-33729286511`，100% traffic | 保留為 rollback／continuity asset；不是新 neutral live target |
| neutral project | `jenfu-platform-prod` 為 active project，但 `billingEnabled=false` | 正式 provider execution hard blocker |
| local DEV-116 | `31/31 PASS`、claim=`local-foundation` | 支持隔離實作；不能冒充 Production Level 4 |
| neutral candidate／R02 | `NOT_RUN` | promotion hard blocker |

以上 snapshot 只供本次契約；任何 artifact、source、provider 或 billing 狀態變動，都必須由 fresh release
preflight 重新讀回，不得手動覆寫為 READY。

## 5. 範圍

### 5.1 Current Phase `117-S1`：independent release adapter implementation

RD 必須交付：

1. 一份 AI_PDM-owned neutral target machine profile，拒絕 legacy project／origin／identity。
2. 一個本機純驗證 adapter，產生 self-hashed source／target／evidence readiness report；預設無 provider、DB、
   filesystem write 或 credential access。
3. 一個新的 GitHub production workflow，明確拆成
   `prepare → candidate → level4-access → promote → rollback／finalize`，只控制 AI_PDM service。
4. exact digest、numeric Secret version、0% candidate、same-candidate Level 4、traffic-only rollback 與
   `jenfu.app.release-receipt.v1` 的 fail-closed validators。
5. 固定 12 案 QA registry／aggregate gate及 package scripts。
6. 文件、task board 與 cold-start map 同步。

### 5.2 Future Release `117-R1`

只有 `117-S1` 經 QC 全數通過、fresh source freeze 與所有 shared prerequisites READY，且使用者另行啟動
logical release 後，才建立 `REL-*` 並執行：provider artifact、必要時 holding revision、0% candidate、DEV-116
R02、promotion、canonical smoke、observation、rollback drill及 live receipt。

### 5.3 Out of Scope

- 修改或部署 Jenfu-Platform／OrgMaster。
- 由本 repo 建立 shared Cloud SQL、app schema owner、IAM DB user、DEV-010 migration 062 或跨 app role。
- 本階段執行 production migration、principal provisioning、Cloud Build、Artifact Registry push、Cloud Run deploy、
  DNS、authorized domain、traffic、Secret disable／destroy或 legacy retirement。
- 修改 `company-jenfu` 正式業務資料、刪除 legacy service、down migration或將 cleanup 當 rollback。
- 以現行 legacy workflow 直接改 target 來取代獨立 adapter；舊 lane 在 neutral live verified 前保留且唯讀治理。

## 6. Deployable-unit ownership

| Boundary | AI_PDM / DEV-117 owns | Platform / DEV-011 owns | DEV-010 coordinates |
|---|---|---|---|
| Source | AI_PDM clean frozen commit／tree | Platform clean frozen commit／tree | hash reference only |
| Artifact | AI_PDM immutable OCI digest | Platform immutable OCI digest | compatibility／provenance join |
| Runtime | `ai-pdm-prod` revision／config | Platform service revision／config | shared IAM／DB prerequisites |
| Public entry | `https://pdm.jenfu.com.tw` | `https://manage.jenfu.com.tw` | identity audience compatibility |
| Traffic | AI_PDM promotion／rollback | Platform promotion／rollback | ordering only |
| Evidence | AI_PDM app release receipt | Platform app release receipt | cross-app capsule only references |

任何 DEV-117 report 若顯示 Platform artifact、Platform service mutation、combined image 或 dual-app traffic change，
必須 `FAIL`。

## 7. Exact neutral target contract

| Field | Required value |
|---|---|
| GCP project | `jenfu-platform-prod` |
| Region | `asia-east1` |
| Cloud Run service | `ai-pdm-prod` |
| Container name | `ai-pdm` |
| Runtime identity | `aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com` |
| Cloud SQL connection | `jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg` |
| Database | `jenfu_prod` |
| IAM DB user | `aipdm-prod-runtime@jenfu-platform-prod.iam` |
| App schemas | `ai_pdm_core`, `ai_pdm_contract` |
| Role contract | `jenfu_ai_pdm_migrator`, `jenfu_ai_pdm_runtime` |
| Runtime | CPU `1`、memory `1Gi`、concurrency `20`、timeout `60s`、port `8080`、min `0`、max `1` |
| Startup probe | `/login` |
| Candidate | exact digest、revision traffic `0%`、no tag、no public invoker change |
| Canonical origin | `https://pdm.jenfu.com.tw` |

以下任一值出現即拒絕：project `jenfu-ai-pdm-prod`、canonical
`https://jenfu-ai-pdm-prod.web.app`、runtime identity `pdm-runtime@jenfu-ai-pdm-prod...`、Secret version
`latest`、mutable image tag、candidate traffic非0、candidate tag、combined Platform artifact。

## 8. Runtime environment／Secret contract

### 8.1 Fixed plain environment

- `NODE_ENV=production`
- `PDM_AUTH_MODE=firebase_bff`
- `PDM_PRODUCTION_SLICE_MODE=official-numbering-draft`
- `PDM_NUMBER_STATE_FLOW_V1=true`
- `PDM_NUMBER_LIFECYCLE_V2=true`
- `PDM_UNIFIED_DRAWING_WORKBENCH_V1=true`
- `PDM_DRAWING_RECOGNITION_V1=true`
- `PDM_REVIEW_PACKAGE_V2_WRITE=true`
- `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1=true`
- `PDM_UNIFIED_ENTITY_DETAIL_V1=true`
- `PDM_DRAWING_REVISION_LIFECYCLE_MODE=enforced`
- `PDM_SMOKE_GCS_WRITER=disabled`
- `PDM_SMOKE_OUTBOX_CONSUMER=disabled`
- `PDM_SMOKE_EXTERNAL_NOTIFICATION=disabled`
- `PDM_DB_PROVIDER=cloud_sql_postgres`
- `DEV010_N2_DATABASE_BOUNDARY=required`
- `PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME=jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg`
- `PDM_CLOUD_SQL_HOST=127.0.0.1`、`PDM_CLOUD_SQL_PORT=5432`、`PDM_CLOUD_SQL_DATABASE=jenfu_prod`
- `PDM_CLOUD_SQL_USER=aipdm-prod-runtime@jenfu-platform-prod.iam`
- pool／timeout：`8 / 10000 / 600000 / 30000 / 35000 ms`
- `PDM_CANDIDATE_CLOUD_RUN_SERVICE=ai-pdm-prod`
- `PDM_CANDIDATE_CLOUD_RUN_TAG=candidate` 只供 app 自我辨識；Cloud Run candidate tag仍禁止建立
- `PDM_COOKIE_SECURE=true`
- `PDM_TRUST_GOOGLE_WORKSPACE_MFA=false`
- `PDM_ALLOW_GOOGLE_WORKSPACE_AAL1_PRIVILEGED=false`
- `PDM_PUBLIC_BASE_URL=https://pdm.jenfu.com.tw`；candidate的受限tag只作驗證路由，不改寫app public origin

Firebase public metadata、identity issuer／audience、Workspace domains、session key IDs 等非固定值，必須由 reviewed
runtime manifest提供並以 provider readback比對；不得臨場手填來解除 blocker。

### 8.2 Secret bindings

| Environment | Secret resource |
|---|---|
| `PDM_SESSION_CURRENT_SECRET` | `aipdm-prod-session-current` |
| `PDM_SESSION_PREVIOUS_SECRET` | `aipdm-prod-session-previous` |
| `PDM_WORKBENCH_CONTRACT_SECRET` | `aipdm-prod-workbench-contract` |

每個 binding 必須是 exact numeric enabled version。Workflow、receipt、artifact與 logs 只能保存 resource name、version、
state與hash，不得讀出或落盤 payload。previous rollback version在 rollback window內不得被停用。

## 9. State machine 與權限分離

唯一正常路徑：

`UNASSESSED -> SOURCE_FROZEN -> CI_VERIFIED -> ARTIFACT_READY -> SHARED_GATE_VERIFIED -> CANDIDATE_READY -> LEVEL4_ACCESS_READY -> LEVEL4_VERIFIED -> PROMOTION_PENDING -> ACTIVATING -> LIVE_VERIFIED`

終止／恢復狀態：`BLOCKED`、`INVALIDATED`、`FAILED`、`ROLLED_BACK`。

- `117-S1` 最多只能產生 `CI_VERIFIED`，不得產生 production receipt。
- `prepare` 可建置一次 immutable artifact；`candidate` 只能使用 prepare receipt的 exact digest，不得 rebuild。
- `candidate` 不可切 canonical traffic；全新 service若不存在，必須先引用 DEV-010 R1-04F 503-only、no-role
  holding receipt，再由 digest-only candidate取代 latest ready revision並保持0%。
- `level4-access` 必須是candidate provider readback後的獨立dispatch與approval。它只可將固定tag綁到exact
  candidate revision，並引用identity／server-origin owner對exact host完成的authorized-domain／allowlist receipt；
  不得切canonical traffic、改image／env／Secret、使用wildcard或把tag access誤算成promotion。
- `promote` 必須是獨立 dispatch，要求 same-candidate DEV-116 R02 PASS、zero open P0/P1、rollback ready與
  Product Owner明確 GO；不得由 prepare／candidate自動觸發。
- 任一 post-promotion smoke失敗時，只回復 AI_PDM traffic到已驗證 previous neutral revision；不執行 down
  migration、不改 Platform traffic、不刪 candidate。

## 10. Machine-readable contracts

### 10.1 `IndependentReleaseProfile`

必要欄位：`schemaVersion=jenfu.ai-pdm.independent-release-profile.v1`、application／environment、exact target、
runtime identity、database contract、canonical origin、runtime limits、plain environment、numeric Secret refs、
forbidden legacy values、self-hash。

### 10.2 `SourceLockReceipt`

必要欄位：release ID、repository、branch／ref、full commit、tree、required file hashes、dirty／untracked required
source count、workflow hash、profile hash、createdAt、self-hash。只有 clean immutable commit可 `FROZEN`。

### 10.3 `ArtifactReceipt`

必要欄位：source lock hash、builder identity、registry repository、OCI digest、platform `linux/amd64`、SBOM、
provenance、secret scan、vulnerability counts、createdAt、self-hash。HIGH／CRITICAL非0或 digest不一致即 FAIL。

### 10.4 `SharedGateReceipt`

只引用 DEV-010 provider receipts：neutral project billing／API、database／roles／IAM、migration order、capacity、
runtime manifest、candidate prerequisite與各 receipt hash。DEV-117不得自行生成或修改這些 shared facts。

### 10.5 `CandidateReceipt`

必要欄位：source／artifact／shared gate hashes、service／revision、image digest、effective runtime config、Secret
version metadata、previous revision、traffic before／after、candidate percent、provider readback、mutation ledger、
self-hash。`candidatePercent`必須0且 Platform service mutation count必須0。

### 10.6 `Level4AccessReceipt`

必要欄位：candidate receipt hash、exact candidate revision、fixed tag／host、tag before／after、authorized-domain／
server-origin owner receipts、approval、canonical traffic before／after、expiresAt、self-hash。只有tag指向exact 0%
candidate、canonical traffic不變且無wildcard時可 `LEVEL4_ACCESS_READY`；R02完成或access window到期後依reviewed
plan移除tag／temporary allowlist，並以provider readback證明沒有改動canonical traffic。

### 10.7 `jenfu.app.release-receipt.v1`

必要欄位：`schemaVersion`、`applicationId`、`environment`、`releaseId`、`sourceRevision`、`sourceTree`、
`artifactDigest`、`serviceName`、`serviceRevision`、`canonicalOrigin`、`status`、`verifiedAt`、`expiresAt`、
`smokeEvidenceRef`、`rollbackEvidenceRef`、`credentialMaterialPresent`、`evidenceSha256`。

固定值：`applicationId=ai-pdm`、`environment=production`、`status=LIVE_VERIFIED`、
`canonicalOrigin=https://pdm.jenfu.com.tw`、`credentialMaterialPresent=false`。只有 canonical post-promotion smoke與
rollback readiness都綁 exact revision時可簽發；Platform只能驗證和引用，不得補值或代簽。

## 11. Exact file impact for `117-S1`

### Add

- `config/release/dev117-ai-pdm-independent-production.json`
- `scripts/lib/dev117-ai-pdm-independent-release.mjs`
- `scripts/dev117-ai-pdm-independent-release.mjs`
- `scripts/dev117-ai-pdm-independent-release.test.mjs`
- `scripts/qc-dev-117-ai-pdm-independent-release.mjs`
- `.github/workflows/deploy-ai-pdm-independent-production.yml`
- `.ai-doc/qa/dev-117-current-case-registry.json`（本文件階段已建立並凍結12案）

### Modify

- `package.json`
- `.ai-doc/dev_task.md`
- `.ai-doc/documentation_map.md`
- 本 SPEC 與 QA-DEV-117（只回寫實作、驗證結果和 evidence）
- DEV-116 SPEC／QA（只維持責任切分，不增加原分母）

### No-touch

- `.github/workflows/deploy-production.yml`：legacy rollback asset；不得改成 neutral workflow。
- `db/postgres/**`：本切片不新增或修改 DDL；shared migration由 DEV-010 管理。
- `infra/google-cloud/production/**`：legacy IaC不改 target；neutral foundation由 DEV-010 provider manifest供應。
- Platform／OrgMaster repositories、production data、DNS、Cloud Run／Cloud SQL／IAM／Secret resources。

## 12. Planned command interface

RD 必須加入：

```text
npm run test:dev-117:release-adapter
npm run qc:dev-117:release-adapter
npm run dev-117:release -- --stage=preflight --release-id=<REL-ID> --source-lock=<path> --output=<task-owned-dir>
```

`preflight` 預設只讀 repository與輸入 receipts，沒有 `--execute` 能力。正式 provider stages只存在新 workflow，
workflow dispatch inputs至少包含：`stage`、`release_id`、`release_commit`、`source_lock_sha256`、
`artifact_receipt_ref`、`shared_gate_receipt_ref`、`candidate_receipt_ref`、`level4_access_receipt_ref`、
`level4_receipt_ref`、`product_owner_decision`、`promotion_approval`。每一 stage 都須再次讀回 target identity和
前一 stage receipt。

`candidate`與`promote`不得接受自由文字 URL、project、service、identity、database或secret name；這些值只可來自
reviewed profile。`promote` approval固定為獨立、一次性 release-bound token，不得沿用 legacy
`AI-PDM-PRODUCTION-PROMOTION-APPROVED`來證明 neutral target approval。

## 13. DB、data 與 migration boundary

- DEV-117 runtime只可取得 `jenfu_ai_pdm_runtime` 的最小 DML／execute權限；不得有 owner、DDL、migrator或
  role-admin權限。
- 任何 DDL只可由 forward-only `db/postgres` artifact與 DEV-010 migration order執行；不得手動改 shared DB。
- 本 repo只可涉及 `ai_pdm_core`、`ai_pdm_contract`，不得引用其他 app 的 `*_core`。
- candidate建立前必須有 `npm run check:db-boundary` PASS與 DEV-010 provider receipt；本地 PASS不能替代正式
  schema placement／membership readback。
- DEV-116 R02只能以 `company-smoke`真實 COMMIT＋reload；`company-jenfu` before／after必須一致，外部副作用
  維持 disabled。該一筆 quarantined outbox evidence不得被 cleanup或consumer清除來換取 PASS。

## 14. Failure recovery 與 stop conditions

| Failure | Required result | Recovery |
|---|---|---|
| dirty／drifted source | `INVALIDATED`，artifact不得沿用 | 新 commit／tree重新 freeze及build |
| billing／API／IAM／DB prerequisite缺失 | `BLOCKED`，credential前停止 | DEV-010 fresh provider receipt後新 run |
| neutral service不存在 | 不直接宣稱0% candidate | 先執行R1-04F holding，再建立0% candidate |
| artifact／revision digest mismatch | `FAILED`，不 smoke／不 promote | 廢棄 candidate，以 exact digest新 revision |
| candidate traffic非0或有tag | `FAILED`，立即停止 | 恢復 service baseline並以新 run重建 |
| R02／P0-P1／rollback任一未PASS | `PROMOTION_PENDING`不得前進 | 修正後同candidate重驗或使舊evidence失效重建 |
| promotion後canonical smoke失敗 | `ROLLED_BACK` | AI_PDM traffic-only回 previous neutral revision，重新驗證 |
| provider outcome unknown | `BLOCKED / OUTCOME_UNKNOWN`，禁止盲目重跑 | 先readback provider state，再由新run收斂 |
| Platform state發生非預期diff | `FAILED` | 回復AI_PDM本次mutation；Platform由其owner處理，DEV-117不得修改 |

以下情況一律停止：legacy target被選中、Secret payload進 evidence、使用 `latest`、shared receipt過期／hash drift、
candidate rebuild、migration order不一致、DEV-116 R02跨candidate拼接、Product Owner未獨立 GO、canonical origin非
`pdm.jenfu.com.tw`、或 rollback target不是 same service的已驗證 neutral revision。

## 15. Acceptance Criteria

- [x] `117-S1` 的 12 個固定 QA cases全部 PASS，P0／P1=0。
- [x] 新 adapter預設 fail-closed且在 READY 前 provider／credential／DB／traffic mutation全為0。
- [x] config與 workflow只接受第7節 neutral target；所有 legacy mutant都被拒絕。
- [x] prepare一次建置；candidate不rebuild／不建tag；level4-access與promote各自獨立dispatch；rollback只改AI_PDM traffic。
- [x] first-revision lifecycle同時支援 existing service與missing service，不會把第一個revision誤報成0%。
- [x] runtime env、numeric Secret versions、least privilege與DB boundary可由 machine readback驗證。
- [x] DEV-116 R02和candidate receipt exact join；local／legacy／staging evidence不能形成 Production Level 4。
- [x] live receipt符合 `jenfu.app.release-receipt.v1`且 Platform可唯讀消費。
- [x] 現行 legacy workflow保持不變並被新 adapter列為 forbidden target，不造成 rollback capability退化。
- [x] `documentation_map.md`、`dev_task.md`、DEV-116與DEV-117指向同一下一步和同一 blocker。

## 16. RD slice 與 entry／exit

### `117-S1A` Profile／validator

- Entry：本 SPEC與QA為 current authority。
- Work：新增 target profile、schema validators、source／receipt self-hash、legacy mutants。
- Exit：QA-117-001～004 PASS，provider／credential access=0。

### `117-S1B` Workflow／candidate lifecycle

- Entry：S1A PASS。
- Work：新增 AI-only workflow，實作prepare-once、holding conditional、0% no-tag candidate、獨立
  level4-access、separate promotion、outcome-unknown ledger與traffic-only rollback。
- Exit：QA-117-005～009 PASS；workflow static／mutant gate PASS，remote mutation=0。

### `117-S1C` Receipt／aggregate／handoff

- Entry：S1B PASS。
- Work：加入 Level 4 exact join、canonical verification與app live receipt validator／aggregate；同步文件。
- Exit：QA-117-010～012 PASS，`npm run qc:dev-117:release-adapter`固定12/12且 release gate仍NOT_RUN。

## 17. Readiness 與 blockers

### RD readiness

- Scope／Out of Scope：明確。
- exact target、files、machine schema、commands、state transitions、stop／recovery：明確。
- P0／P1 implementation decision gap：0。
- 狀態：`117-S1 Local Implementation Complete / QA-QC 12 of 12 PASS`。三個slice已依序完成；下一步是
  在clean `origin/main`建立fresh release source lock並重跑preflight，不是直接切traffic。

### 2026-09-07 implementation／QC evidence

- 已新增reviewed profile、純函式validators、本機preflight CLI、固定12案tests／aggregate QC與獨立
  `prepare / candidate / level4-access / promote / rollback / finalize` workflow。
- `npm run test:dev-117:release-adapter`：`12/12 PASS`。
- `npm run qc:dev-117:release-adapter`：`12/12 PASS`、P0/P1=`0/0`、provider／cloud／DB／traffic／credential／
  sibling-repo counters均為0；provider execution=`NOT_RUN`。
- Final aggregate：`output/qa/dev-117-independent-release/20260907T132932Z/aggregate-manifest.json`，
  evidence SHA-256=`f3445b374d8ecd0a52c609892c25cb6d1dfaa80be45332ca497cf3bd624dcd3e`。
- 交叉驗證：legacy production pipeline=`25/25 PASS`、DB boundary=`PASS`、`typecheck:app=PASS`、
  `build:isolated=PASS`且primary invariant／cleanup均PASS。
- Current worktree並非clean main，故本機preflight如實為`sourceLock=INVALIDATED / status=BLOCKED`；這是
  release gate的正確結果，不影響S1程式契約PASS，也不得被改寫為production ready。

### Production release blockers

1. fresh clean `origin/main` source freeze與DEV-117 release preflight尚未完成；current dirty branch evidence不可沿用。
2. `jenfu-platform-prod` billing尚未啟用。
3. DEV-010 provider-attested shared gate、reviewed runtime manifest、foundation／migration／capacity與相關
   provider cases尚未完成。
4. neutral `ai-pdm-prod` candidate及 DEV-116 R01／R02尚未執行。
5. `pdm.jenfu.com.tw` hostname／authorized-domain／canonical readiness尚無 fresh provider evidence。
6. promotion仍需獨立 Product Owner GO；本文件不是 production mutation或 traffic授權。

## 18. Spec Impact Preflight

- 分類：`Intentional deployment-ownership separation + compatible amendment`。
- 本 SPEC 不取代 DEV-116 的 tenant隔離產品契約，也不取代 DEV-010 的 shared topology；它只補上 AI_PDM
  app-owned deployment lane，與 Platform DEV-011 對稱。
- ADR：`No New ADR`。使用者已明確確認獨立部署，Platform DEV-011已保存跨repo architecture decision；本 repo
  只落實對應 adapter。若未來改成跨app combined image／service、共享traffic owner、或AI_PDM自行建立shared DB，
  必須新 ADR並重開使用者決策。

## 19. Release Impact Note

- Artifact：新增 AI_PDM-only immutable OCI release contract。
- Runtime／hosting：新增 neutral service deployment lane與 `pdm.jenfu.com.tw` canonical contract。
- Migration：不新增DDL；只消費DEV-010與既有AI migration evidence。
- Rollback：AI_PDM traffic-only；不碰Platform traffic、不down migrate。
- Current release：`NOT_STARTED`。`117-S1`本機實作與QC已完成；本輪cloud／DB／traffic／DNS mutation皆為0，
  尚未建立neutral artifact、candidate或live receipt。

使用思考習慣：#風險優先、#可驗證性、#可回復性
