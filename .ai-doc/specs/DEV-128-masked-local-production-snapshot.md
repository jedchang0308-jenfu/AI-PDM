# DEV-128 — 正式業務資料副本供 AI-PDM 1020 地端測試

狀態：owner-review 實作候選。2026-11-07 使用者授權完成 owner 審查、Terraform plan、限定 apply、正式業務資料匯出／地端匯入與驗證後切換 1020；執行不使用 overrides。使用者後續明確取消業務欄位假名化，改為原樣複製；credential、SSO、Principal、session、secret、正式角色指派與附件 bytes 仍排除。

## 1. 資料來源與範圍

依現行 AI-PDM 正式發布契約，資料來源為 GCP 專案 `jenfu-platform-prod`、區域 `asia-east1`、Cloud SQL `jenfu-platform-prod-pg`、資料庫 `jenfu_prod`，只讀 `ai_pdm_core`。2026-11-07 穩定正式診斷讀回 `ai-pdm-prod-90df406dea11` 承接 100% 流量且綁定上述 Cloud SQL。受審查 schema shape 為 170 張正式表、514 條 own-schema FK，hash `8acccc4ef32dfdbe5adf36a220c03ae42168a90693bd9f8cda2d59aa7243f76d`；Job 在讀取業務列前須以結構中繼資料完全比對。第一版原型沿用的 `jenfu-ai-pdm-prod / ai_pdm.public`、157 表基線及舊型別轉換已移除，不得作為本案來源或匯入依據。[現行正式發布契約 §7](SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md#7-exact-neutral-target-contract)

Job 以 `REPEATABLE READ READ ONLY`、非 superuser session 讀取固定清單，設列數、位元組及時間上限，在同一 Job 記憶體保留業務欄位原值、移除 credential 類欄位與附件 bytes，再以 RSA-OAEP-SHA256／AES-256-GCM 加密。認證、SSO、authentication session、secret、Principal assignment、角色 catalog／policy、遷移收據、外部 share／device 與正式角色指派不匯出；檔案名稱可保留，但 production bucket、URI、local path、object key 與 bytes 不匯入地端。地端副本供 1020 權限與業務流程開發，權限基線保留 source-bound local test-admin catalog，不複製正式 Principal／角色指派，依 DEV-012 §29.2 管理。

## 2. 變更範圍

| 主體 | 資源 | 申請權限 |
|---|---|---|
| GitHub OIDC 精確 builder subject | 既有 `aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com` | `roles/iam.workloadIdentityUser`，只綁 DEV-128 builder 專用 pool 的單一 subject、merged main SHA、固定 workflow 與最長 2 小時時窗；不新增 builder 角色 |
| GitHub OIDC 精確 subject | `aipdm-dev128-invoker-v8@jenfu-platform-prod.iam.gserviceaccount.com` | `roles/iam.workloadIdentityUser`，只綁 DEV-128 專用 pool 的單一 subject |
| DEV-128 invoker | `projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-masked-local-snapshot` | `roles/run.invoker`、`roles/run.viewer`，只綁此 Job，供執行及讀回該次 execution |
| DEV-128 invoker | `jenfu-platform-prod-aipdm-release` 下本次密文物件 | `roles/storage.objectViewer`，IAM condition 等於完整物件名，不能列出 bucket 或讀其他物件 |
| Job runtime `aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com` | 同一密文物件 | `roles/storage.objectCreator`，IAM condition 等於完整物件名，物件以 `ifGenerationMatch=0` 建立 |

暫存 prefix 固定為 `source/migration-bundles/data-cutover/masked-local-snapshots/`，單次 object 為該 prefix 下的 `<snapshotId>/snapshot.encrypted.json`。GCS condition 使用 `resource.type == "storage.googleapis.com/Object"` 和 `resource.name == "projects/_/buckets/jenfu-platform-prod-aipdm-release/objects/<完整物件名>"`。上述 binding 均限 owner plan 中同一個 UTC 時間窗，最長 2 小時，condition 為 `request.time >= timestamp("<UTC 起點>") && request.time < timestamp("<UTC 終點>")`。正式 owner 須讀回實際有效權限。[Cloud Run 角色](https://docs.cloud.google.com/iam/docs/roles-permissions/run) · [Cloud Storage IAM Conditions](https://docs.cloud.google.com/storage/docs/access-control/iam#conditions)

專用 WIF pool `aipdm-dev128-snapshot-v8` 只有 provider `github`，以 provider URL 為 audience，`google.subject` 固定映射到 `aipdm-dev128-snapshot-v8`，限以下 claims 同時符合。綁定的 member 為 `principal://iam.googleapis.com/projects/9536592944/locations/global/workloadIdentityPools/aipdm-dev128-snapshot-v8/subject/aipdm-dev128-snapshot-v8`。Cloud Run Admin API 由專用 SA impersonation 存取。現有發版 pool 的 repo-wide principal set 同時綁 builder、deployer、verifier，故本案不修改它；builder 另用 `aipdm-dev128-builder-v9` 專用 pool 的固定 subject，只在 source-bound build workflow 的 UTC 時窗內 impersonate 既有 builder，且完成 digest receipt 後即移除。先前使用過的 builder／snapshot pool、invoker 與 Job 都依機器驗證的精確 delete plan 回收；Google 保留期內不直接 undelete 或同名重建，故後續 owner attempt 使用新名稱。第一次正式 execution `ai-pdm-prod-masked-local-snapshot-6tf5b` 在 catalog shape 通過後因 identifying FK 的父子欄位各自假名化而 fail closed，錯誤為 `DEV128_FOREIGN_KEY_MASK_CONFLICT`，未建立密文物件；修正後 FK 等價類共用單一映射。第二次 execution `ai-pdm-prod-masked-local-snapshot-hln7h` 因將 PostgreSQL 預設 `MATCH SIMPLE` 的複合 FK 誤作逐欄 parent reference 驗證而 fail closed，錯誤為 `DEV128_FOREIGN_KEY_SOURCE_REFERENCE_MISSING`，亦未建立密文物件；現在只在所有 child components 皆非 NULL 時驗證完整 parent tuple。第三次 execution `ai-pdm-prod-masked-local-snapshot-r8kr5` 發現輸出表仍以必填 FK 依賴已排除的認證／Principal／share／action 資料，錯誤為 `DEV128_REQUIRED_REFERENCE_TO_EXCLUDED_TABLE`，仍未建立密文物件；9 張該類操作／暫存子表改為不匯出且地端清空，其他 `MATCH SIMPLE` 複合 FK 只清空一個 nullable component，並以 frozen catalog 測試禁止任何輸出表留下全必填的跨排除邊界。第四次 execution `ai-pdm-prod-masked-local-snapshot-cb7bm` 因泛化的 `session` 關鍵字將 drawing-recognition 業務工作階段欄位誤判為秘密而 fail closed，錯誤為 `DEV128_REQUIRED_SECRET_FIELD`，仍未建立密文物件；真正的 password／secret／token／credential 規則不變，業務 session ID 維持 FK 等價映射、purpose 假名化、version 保留數值。第五次 execution `ai-pdm-prod-masked-local-snapshot-vggpj` 因 PHONE 掃描把已驗證的 lossless numeric wrapper 與標準 UUID 誤判為格式化電話而 fail closed，錯誤為 `DEV128_PHONE_SCAN_FAILED`，仍未建立密文物件；掃描器現在只對這兩種結構化值豁免，普通格式化電話仍拒絕，遮罩 policy 升為 `dev128-pseudonymize-v3`。第六次 execution `ai-pdm-prod-masked-local-snapshot-47pgl` 仍因 PHONE 掃描 fail closed，未建立密文物件；所有 snapshot-v7 Job／WIF／IAM 已依 9-delete plan 回收。使用者隨後取消業務欄位假名化，改採 `dev128-raw-business-copy-v1`：業務 ID、名稱、描述、email、phone 與 JSON 業務內容原樣保留，但 password／secret／token／credential、認證資料表、正式 Principal／角色指派、production storage pointer 與附件 bytes 仍排除。另因帶 Job 條件的 viewer binding 無法讀取獨立 Operation resource，owner provider 改由固定 Job 的 execution list 找到唯一 execution，仍拒絕零筆超時或多筆歧義，不新增 Operation 權限。Cloud Run v2 REST 省略 proto-default `deletionProtection=false`；owner readback 僅接受欄位省略或 boolean `false`，任何其他值仍 fail closed。[Google WIF 服務限制](https://docs.cloud.google.com/iam/docs/federated-identity-supported-services) · [GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc)

| Claim | 必須符合 |
|---|---|
| `repository_id`／`repository_owner_id` | `1260972060`／`257207597` |
| `workflow_ref` | `jedchang0308-jenfu/AI-PDM/.github/workflows/export-ai-pdm-masked-local-snapshot.yml@refs/heads/main` |
| `ref`／`environment`／`event_name` | `refs/heads/main`／`production`／`workflow_dispatch` |
| `workflow_sha` | owner 審查及 required CI 通過的 merged main SHA |
| `run_attempt` | `1` |

既有 owner 建立、讀回及移除固定 Job 與 scoped bindings。invoker 不持有 Job 建立、更新、刪除、`run.jobs.runWithOverrides`、IAM 管理、部署身分 impersonation、runtime `actAs` 或資料庫連線權。Job 使用既有 Cloud SQL IAM 登入，限定同一 immutable image 與固定 SQL。這個 runtime 既有的遷移權限高於唯讀。審查須確認 workflow 無法變更 Job template 或取得 runtime token，並沿用既有正式 DB 連線方式。若既有 Cloud SQL 或 bucket 權限不足，停在 readback。

## 3. 執行與收尾

1. Owner 先 plan／apply builder 專用 pool、provider 與既有 builder SA 的單一 source／workflow／時窗 binding，共 3 個 create；不修改現有 release provider，也不新增 Artifact Registry 角色。專用 build workflow 只在受保護 main 與 required CI 後建立 digest-only image，輸出一天保留的 source／digest receipt；receipt 下載後立即 plan／apply 3 個 delete 回收 builder WIF。Owner 再於本次 Job template 固定 source SHA、digest、snapshot ID、地端一次性 RSA 公鑰與期限。私鑰只存於新的地端 profile 控制目錄。Job 為單 task、零 retry、最長 30 分鐘。未能確認 canonical source、catalog shape 或 Job template 時，不讀業務列。
2. Export workflow 使用單一 concurrency group 且不取消進行中 run，沒有 inputs。它讀回 Job UID、generation、etag、image、runtime、固定參數、空 execution history 與唯一密文位置；只送一次 `jobs.run`，body 只有新讀回的 `etag`。回覆不明時只查這個 Job 的 executions，確認結果前不重送。workflow 不具 Job create／update／delete、runtime impersonation 或 IAM writer，dispatch 無 project、DB、SQL、指令、路徑、公鑰或 overrides 欄位。[Cloud Run Run Job API](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.jobs/run)
3. 成功 execution 的密文依 generation 下載，以物件建立時寫入的密文 SHA-256、公鑰指紋、snapshot ID 與來源 SHA 核對本次 Job，並重算下載檔的 SHA-256，再上傳一天保留期的同 run artifact。Owner 先回收執行權限、確認 execution 已終止，再移除專用 Job／bindings 與 WIF 資源。既有具該 prefix 清理權限的 owner 以 `generation` 和 `ifGenerationMatch` 刪除本次 GCS 物件。若 bucket 有 soft delete，按 provider readback 記錄到期時間。artifact 在地端匯入完成後按 artifact ID 刪除。[Cloud Storage generation 刪除](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/delete)
4. 地端只匯入獨立 `test-admin-1020-masked-snapshot`／PostgreSQL 58421。先確認原 58420 資料不受影響，再用匯入收據核對資料列、canonical master 關聯、migration 與外鍵完整性。驗證測試超級管理員登入、無 SSO handoff 與頁面／操作權限後，才將 1020 接到新 profile。原 profile 保留為回復入口。

## 4. Owner 審查與放行條件

- Builder Terraform plan 只可新增專用 builder pool/provider 與既有 builder SA 的精確、會過期 workloadIdentityUser binding，共 3 個 create；digest receipt 完成後須以同 state 的 3 個 delete plan 回收。Snapshot Terraform plan 只可新增本次固定 Job、專用 snapshot pool/provider、invoker SA 與表列精確 bindings，共 9 個 create。Plan 必須列出實際 SHA、digest、Job 資源名、公鑰指紋、完整物件名與 UTC 時間窗。若出現現行 service／traffic、既有 migration runner、原 WIF provider、Cloud SQL、Secrets 或其他 IAM 的變更，拒絕套用。
- 在套用正式設定前，以隔離資料驗證 current core schema 的原樣業務資料複製、安全排除與匯入，以及 wrong workflow/ref/SHA、錯誤 Job／object、重送與 overrides 拒絕。正式套用後以 provider metadata 讀回權限與 Job template，通過才允許執行。歷史 DEV-012 收據與既有原型測試不替代本次來源與權限證明。
- 本機 owner-review 候選已通過 DEV-128 26/26、builder／snapshot Terraform 各 2 個 plan cases、DB boundary、typecheck 與 isolated build。獨立 58421 preparation receipt 驗證 174 張地端表、514 條 FK、loopback binding、一次性 RSA key 與測試超級管理員 user／principal 各 1；未匯入正式資料，1020 尚未切換。正式 plan／apply、匯出、匯入與切換仍以 merged main、required CI 及 provider readback 為前置。
