# DEV-122：AI-PDM 內部自用功能契約

狀態：`ACTIVE_CAPABILITIES_PENDING`

適用產品：公司內部自用的 AI-PDM

主要裝置：桌面瀏覽器

機器可讀分母：[DEV-122-self-use-acceptance.v1.json](DEV-122-self-use-acceptance.v1.json)
歷史原文：[DEV-122 contract history](DEV-122-ai-pdm-internal-function-issues.history-through-2026-10-19.md)

## 1. 決策

DEV-122 保留原始 7 issues／29 groups 作為總驗收分母，不刪除、重排或把舊 FAIL 改成 PASS。現行施工與選測改以四項產品能力管理，讓各切片能獨立交付與重用證據；四項能力／11 個核心案例是優先工作視圖，不取代 7／29。

這個系統是單一公司內部工具，沒有 SaaS 多租戶銷售、外部客戶 SLA、行動裝置優先或供應商入口的現行需求。若未來需求成立，以獨立 DEV 加回其責任與驗收，不在本 DEV 預先維護未使用的控制。

## 2. 現行範圍

| 能力 | 目標 | 現況 | 結案條件 |
|---|---|---|---|
| `identity_roles` | 正常登入；管理員可智慧辨識；RD 可讀寫及送審；RD 不可核准 | `LOCAL_RD_PERMISSION_PASS / PRODUCTION_PENDING` | 實際 actor 的 allow／deny 與拒絕零副作用 |
| `pdm_lifecycle` | Part 首次發行、Drawing major／minor、退回與重送保持一致 | `LOCAL_NATIVE_AND_UI_EVIDENCE_AVAILABLE` | 受影響交易、CAS、rollback／replay 通過 |
| `drawing_preview` | 目前版本 PDF 可閱讀；預覽任務有限且有終態 | `LOCAL_QC_PASS / PRODUCTION_ACCEPTANCE_PENDING` | 正確版本 bytes、桌面可讀性、terminal／error 行為 |
| `operations` | 正確來源建置、候選 smoke、切換讀回與 rollback-ready | `NO_RELEASE_IN_THIS_CHANGE` | 只有實際發布時驗 exact source／image／revision／traffic |

能力可獨立標記 `PASS`、`FAIL`、`PENDING` 或 `NOT_APPLICABLE`。一項能力未完成，不改寫其他能力已成立的證據；DEV-122 整體結案仍需原始 7／29 全部有可接受結果。

## 3. 十一個核心案例

### 身分與角色

| ID | 可觀察結果 |
|---|---|
| `AUTH-01` | 既有正常帳號可登入、reload 維持同一身分，logout 後受保護入口為 401。 |
| `AUTH-02` | 具有目前有效管理員 grant 的 actor 可讀取並啟動智慧辨識。 |
| `AUTH-03` | 具有目前有效 RD grant 的 actor 可讀取圖號工作台、建立／編輯並送審。 |
| `AUTH-04` | 同一 RD actor 核准時拒絕，拒絕前後 lifecycle 資料與 queue 無副作用。 |

### PDM 生命週期

| ID | 可觀察結果 |
|---|---|
| `LIFE-01` | Part 首次發行於同一交易建立正式狀態與目前指標；一般編輯不發行。 |
| `LIFE-02` | Drawing major 核准後 canonical、master、revision pointer 與目前檔案一致。 |
| `LIFE-03` | Drawing minor 不錯誤發行或覆蓋 major 正式指標。 |
| `LIFE-04` | 退回、fresh 重送、grant 撤回、stale CAS、故障 rollback 與 replay 保持可預期且不重複套用。 |

### 圖面預覽

| ID | 可觀察結果 |
|---|---|
| `PREVIEW-01` | UI 顯示目前 revision 綁定的 PDF；桌面可翻頁、縮放並讀取尺寸與註記。 |
| `PREVIEW-02` | preview list／asset 輪詢有上限；ready、failed、delayed 與停止自動刷新均有明確終態及可恢復操作。 |

### 營運

| ID | 可觀察結果 |
|---|---|
| `OPS-01` | 實際發布綁定確切 source SHA、image digest、revision、traffic 讀回與前一 revision rollback 目標。 |

### RD 圖號工作台當前恢復點（2026-10-20）

PR #386 的 exact main 為 `21a1ba0b6a6f7a142e0c03a99d4461316bff711d`。C56 run `39192302084` 的 prepare／build與 Cloud Build `b24a3b7f-614e-451c-b3d2-23f924771d3d` 成功；migration 在任何新 Job execution 前以 `MIGRATION_JOB_READBACK_MISMATCH` 停止，terminal 為 `PRE_ACTIVATION_ABORTED / NOT_APPLIED`，正式 revision／traffic 未變，worker 為 `PAUSED_RECOVERED`。provider readback 證明 reuse receipt 的 runner digest／source 與 live `ai-pdm-prod-migration-runner` 不同，而 producer 重發舊 receipt 時沒有讀取 live Job。

R25 唯讀 run `39196373315` 證明 ledger 為 33，migration 084／085 均 `NOT_APPLIED`，判定為 `AUTHORIZED_CONDITION_085_ABSENT`；prepare／build／migrate 均未執行。當前 corrective 將 reuse receipt 升為 v2，先驗 live Job READY、identity、template、digest 與 runner source，並在 ordinary full35 分離 release source 與 runner source。恢復順序是完成本切片 required CI 與 protected merge，再由正常 app-owned APP_INFRA 路徑建立 provider 一致的新 runner receipt，之後以 fresh exact-main capsule 執行 full35；不得手動 patch Job。085、catalog v7、candidate、traffic及專用測試 RD 帳號的 UI／API 正負驗收仍未完成，原 7 issues／29 groups 與 DEV-122 整體維持 `NOT_ACCEPTED`。

後續 C67 owner run `39254333670` 在 prepare 以 `DATA_CUTOVER_AUTHORITY_REF_INVALID` 停止，build／migration／candidate／traffic 均未執行；C69 只有 exact-source 輸入準備，未派送。PR #394 已修正 live Cloud Run v2 Job readback 的 terminal／generation 契約，但未改變正式 service、ledger、catalog 或 traffic；這些失敗與未執行狀態不得因本次精簡而改判。

C70 的 prepare／build 已完成，但 migration outcome 為 `UNKNOWN`；其 immutable `prepare.json` 合法帶入 `ai-pdm.principal-postbuild-pre-migration-abort-basis.v1`。C77／C78 exact-main worker reuse 在任何新 evidence publication 前，由共用 continuation reader 以 `DEV121_PREACTIVATION_CONTINUATION_INVALID` 拒絕。直接證據顯示 reader 的 completed-build allowlist 只接受 prebuild／unpublished basis，卻漏掉同一模組本身產生的 postbuild-pre-migration basis；因此第二次 postbuild attempt 無法承接前一次 postbuild／UNKNOWN migration lineage。最小修正只把該具名 schema 加入 closed allowlist，既有 failed intent、previous revision、control SHA、source、hash、provider 與零重送守門不變；未知 schema 仍拒絕。production-shaped `postbuild → postbuild → UNKNOWN migration` fixture 與負例已加入。本機 planner 判定 `FULL`；focused 33／33、worker 108／108、required continuous QC 479／479、catalog v7 3／3、abort 6／6、DB boundary、typecheck 與 isolated build均通過。required CI、protected merge、新 exact-main immutable evidence、full35、migration 085、catalog v7 active readback、專用測試 RD actor 的 UI／API 正負驗收仍未完成，故 production acceptance 與 DEV-122 整體仍為 `NOT_ACCEPTED`。

PR #402 合併後的 exact main `1531fdec2c0c07a97c17a58c994b1b29d8652f21` 由 C82 full35 run `39377998500` 在 prepare 以 `REPAIR_CAPSULE_INVALID` 停止；build、migration、candidate 與 traffic 均未執行。provider readback 未找到 C82 capsule object，Cloud Run service 仍為 generation／observedGeneration `214`、100% traffic 指向 `ai-pdm-prod-1be8986b68ce`，因此沒有未知正式寫入。直接因果是 C70 的 `PRE_ACTIVATION_ABORTED` retry 必須同時攜帶 post-abort ledger readback、Principal fence 與 recovery 三聯證明，但 paused-repair stage／observer 將這些欄位一律視為「本次 Principal-only release」而拒絕；worker v5 已合法保存同一 continuation。corrective 只建立一個共用 exact join：release intent 與 worker input 的三聯證明完全一致才允許，缺漏、v2/v5 混用、錯誤資源或 hash 漂移仍拒絕；不放寬 migration、IAM、Secret、traffic 或重送邊界。新的 protected merge、fresh exact-main capsule、full35、085、catalog v7 與專用測試 RD actor 驗收仍未完成，production acceptance 與 DEV-122 整體維持 `NOT_ACCEPTED`。

PR #403 合併後的 exact main `7ce68d041ecf664931b0ded9447e6ff7e3187fca` 已在 C83 發布 exact source lock、76,625,920-byte worker source archive 與 current v5 worker input。兩次 artifact-reuse 只讀嘗試皆在任何 association／descriptor／request／output 發布前回傳 `OUTCOME_UNKNOWN`；provider readback 證明 input 以外的新物件為零，owner workflow 未 dispatch，Cloud Run service／traffic 未變。第一個有效失效邊界是共用 owner transport 對所有 GCS media 固定使用總計 120 秒、單次 60 秒；C83 同一物件的 provider download 實測需約 130～150 秒，因此每次都必然被本機單次 deadline 中止。C83 input deadline 已過，不得重送。corrective code `bc4d9358a11ec894d0a0b79449327683112281bd` 只依已驗 metadata size 產生 bounded read window，保留 generation、CRC32C、SHA、max-bytes、read-only retry 與 unknown-write readback；planner `FULL`，exact-source affected runner 27 groups、continuous QC 483／483及其 DB／typecheck／isolated build尾端均PASS。required CI 與 protected merge 完成後須以 fresh exact-main C84 續接。085、catalog v7、candidate／traffic及專用測試 RD actor UI／API 正負驗收仍未完成，正式 RD acceptance 與 DEV-122 整體維持 `NOT_ACCEPTED`。

PR #404 合併後的 exact main `7617cf426a64074bce686fd3dc1ed5b386b70e15` 已完成 C84／C85 exact-source evidence，但兩次 full35 都在 prepare、任何 build／migration／candidate／traffic 前停止。C84 run `39426562949` 的第一個有效失敗為缺漏既有 data-cutover completion authority；C85 已補入其 immutable ref，run `39430538929` 隨後以 `DEV121_PRINCIPAL_RECOVERY_INVALID` 停止。provider readback 證明 recovery receipt／revision／image／service UID、MANUAL0、generation 214、100% old-revision traffic 均一致；唯一不一致是 retained recovery artifact 的歷史 source `753d90c9285a0e37966c13f47cfa1c4dfdef06be` 不等於本次 forward release source `7617cf426a64074bce686fd3dc1ed5b386b70e15`。corrective 將兩個責任分開：本次 release 仍由自己的 source lock 約束，recovery proof 保留其建立時的合法 source，migration fence 必須與該 recovery source 精確相等；格式錯誤、hash、service、revision、image、traffic 或 fence source 漂移仍拒絕。新的 protected merge、fresh exact-main evidence、full35、085、catalog v7 與專用測試 RD actor 驗收仍未完成，production acceptance 與 DEV-122 整體維持 `NOT_ACCEPTED`。

PR #411 合併後的 exact main `02239aaeaac82702bbc8c4d58b38d47fca051afe` 由 C91 full35 run `39477631378` 完成 prepare／build，migration runner execution `ai-pdm-prod-migration-runner-85njg` 在任何 SQL 前以 `DEV121_MIGRATION_073_FENCE_INVALID` 停止；failure／recovery 完成，candidate／traffic 未執行。官方唯讀 ledger run `39484845437` 隨後證明 ledger count 仍為 33、084／085 均 `NOT_APPLIED`，可安全走 085 尚未套用分支。直接根因是 migration runner 把本次 release source `02239...` 錯當 retained fence source；prepare 與既有契約已正確要求 fence source 等於 recovery proof source `753d90c...`。corrective 因此只讓共用 fence validator 驗證 proof 自身來源，並由擁有 recovery authority 的 caller 明確 join expected fence source；migration runner 保留 current migration bundle／capsule source 綁定，但不再重標歷史 fence。錯誤 recovery source、proof hash、service drift、非 MANUAL0、tags 或 active writers 仍拒絕。planner 判定 `FULL`；focused 76／76、continuous 430／430 與 required QC 483／483（含 catalog v7 3／3、abort 6／6、DB boundary、typecheck、isolated build）均通過。required CI、protected merge、新 exact-main runner image／full35、085、catalog v7 active readback及專用測試 RD actor UI／API 正負驗收仍未完成，故 production acceptance 與 DEV-122 整體維持 `NOT_ACCEPTED`。

PR #413 合併後的 exact main `d3b78440d0b915d40e74fb00bb15c56d365a79dd` 由 C95 full35 run `39502207979` 完成 prepare／build；migration execution `ai-pdm-prod-migration-runner-9x7h5` 與 immutable `migrate.json` 均證明 migration 084／085 成功套用、`ledgerCount=35`、`applied=2`、`replayed=33`、database boundary `PASS`。其後 owner migrate 與 failure／recovery卻同以 `DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID` 停止，candidate／traffic 未執行，service 仍為 generation 214、MANUAL0、100% 舊 revision。官方唯讀 ledger run `39508556967` 以 `default_transaction_read_only=on` 再證明 ledger 35、084／085 `APPLIED`，決策為 `STOP_085_APPLIED_VERIFY_CATALOG_CONSISTENCY`，因此任何續跑不得重送 migration。直接根因是 migration runner 依法在 receipt 加入 `principalOnlyFence` 摘要，但共用 owner proof consumer 的 closed schema 未接納或驗證該 producer 欄位；這是 successful write 後的 receipt producer／consumer 契約缺口，不是資料庫失敗。corrective 只在共用 migration receipt validator 加入 exact fence summary schema、來源／generation／service／UID／drain／零 writer 驗證，並在擁有 intent 的 ordinary／repair caller 精確 join `principalOnlyFenceRef`；多餘欄位、錯 hash、錯來源、路徑穿越或擴權仍拒絕。planner 判定 `FULL`；focused owner proof 171／171、stage executor 25／25、continuous 432／432、catalog v7 3／3、abort 6／6、DB boundary 與 typecheck 已通過；本機 isolated build 因 C: 容量低於 Governor 保護底線尚未執行，完整 QC、required CI、protected merge、full35 receipt replay、catalog v7 active readback及專用測試 RD actor UI／API 正負驗收仍未完成，故 RD production acceptance 與 DEV-122 整體維持 `NOT_ACCEPTED`。

PR #414 已把上述 fenced receipt consumer 修正合併至 exact main `71a99f491051cc213ed4c8f23a09e9093a060787`；但重新 dispatch 舊 C95 capsule 依法以 `GITHUB_SOURCE_AUTHORITY_MISMATCH` 停止，且 C95 在 migration 成功後沒有 terminal／control receipt，不能以新 main 直接重播舊 attempt。當前 corrective 切片因此只新增 closed `aipdm.applied-migration-continuation.v1`：把 C95 exact prepare／migrate 與官方 ledger35 readback 綁入新的 paused-repair intent，分開保存「目前服務基線 C91」與「已套用資料庫來源 C95」。Owner 在任何後續 provider mutation 前必重驗 C95 migration-only source/build provider proof、Principal fence／recovery、read-only Job／execution／native receipt、runner source/digest 與 Git/input 相容性；只有 current full35 與已套用 35-entry prefix 完全等價時，才沿既有 `HISTORICAL_EVIDENCE_REUSED` 發布零 Job association。缺漏、別名、來源分歧、runner／grant 漂移或 ledger 非35皆拒絕，不得再次提交 085。此切片仍待 protected PR／required CI／merge及 fresh exact-main owner release；正式 RD 與 DEV-122 整體維持 `NOT_ACCEPTED`。

PR #416 合併後的 exact main `f18a6a74d07f12e0546ba3587522e1d4ec602ea7` 已通過 required CI。正式唯讀 permission-state run `39524495656` 證明 ledger 35、migration 085 `APPLIED`、active catalog v7/hash 一致，且專用測試 actor 具有 active `rd` grant；因此後續不得再提交 085。C97 已發布 exact-main source lock、17,779,362-byte immutable worker source archive及 source-bound input，但 artifact-reuse 在任何 association／descriptor／owner workflow dispatch 前以 `DEV121_OWNER_RELEASE_PROOF_ARCHIVE_DEADLINE` 停止。直接根因是 worker reuse 已使用 size-aware transport，來源證明 reader 卻仍對 sealed media GET 固定使用 60 秒，讓同一合法大物件在另一共同入口被拒絕。當前 corrective 把既有 finite size-aware window抽成單一 helper，owner runtime 與 source-proof reader共用相同規則；generation、CRC32C、SHA、size cap、兩次唯讀重試與原 deadline均保留。production-shaped 18 MiB reader回歸與既有 owner proof/runtime 210／210通過；worker history初跑保留 Windows深 TEMP失敗及新 helper未納入 synthetic source closure的真實結果，短 task-owned TEMP與補齊 fixture後原三案3／3通過。planner仍判定`FULL`，完整 required CI、protected merge、fresh exact-main artifact reuse、full35 candidate／activate及專用測試 RD actor UI／API正負驗收待完成；正式 RD acceptance與DEV-122整體維持`NOT_ACCEPTED`。

PR #420 將 app-owned workflow 的外部 job 由十一個收斂為五個責任階段加 failure recovery，保留十個 immutable stage receipt、required CI、零流量 candidate、canonical readback 與 rollback；owner／worker source packaging 改由實際 import closure 驗證，receipt validator 與 paused-repair continuation 改用共用入口。exact main `d10c6e196b617325337dce67e3e0bfb8c746ef84` 的 required CI 與 permission-state run `39552017653` 均 PASS；sealed readback 再確認 085 `APPLIED`、catalog v7/hash 一致、專用測試 actor 的 active `rd` grant。C100 僅建立 exact source-lock、worker archive與 immutable input，未 dispatch owner workflow、worker Job 或服務變更；artifact-reuse 在第一個新 receipt 前以 `DEV121_PREACTIVATION_CONTINUATION_INVALID` 停止。直接根因是共用 `assertMigration` 已保存 AI-PDM bootstrap／ledger floor policy，但 normal owner caller 又重複硬編碼，applied-migration continuation caller 則傳入不含這兩欄的 raw release profile，導致合法 C95 fenced migrate receipt 必然被拒絕。當前 corrective 在共用 validator 對缺漏欄位套用既有 owner policy、保留顯式矛盾拒絕，並刪除 normal owner caller 的重複常數；不放寬 receipt hash、fence、ledger35、085、execution、source、runner或 recovery join。正式 RD acceptance 與 DEV-122 整體仍為 `NOT_ACCEPTED`。

PR #421 合併為 exact main `b219f57293fb5c09fdfc8a255c4be7170f4dbfe3` 且 required CI PASS；C101 證明上一個 policy-shape failure 已越過，但在第一個 worker reuse receipt 前以 `APPLIED_MIGRATION_CONTINUATION_READBACK_INVALID` 停止。provider readback 證實 ledger result 的 successful attempt `completedAt` 依 producer 契約是 native read-only DB receipt 完成時間 `2026-10-20T22:36:19.096Z`，Cloud Run execution receipt 則在 `2026-10-20T22:36:23.303687Z` 完成；continuation consumer 錯把兩者要求為同一字串。修正改為將 attempt 時間綁定 native receipt，並驗證 native 執行區間包含於 provider execution 區間；receipt hash、execution identity/status、native ref、ledger35/085 與 source/runner joins 仍維持 fail-closed。C101 未建立 request、association、descriptor 或 owner release，正式 RD acceptance 與 DEV-122 整體仍為 `NOT_ACCEPTED`。

C102 以 exact main `31f6aa1086685c220ab537dc51ee344a95e5e3a5` 建立 fresh source-lock、worker archive/input 並通過 artifact-reuse；接續建立 prerequisite 時，`infra-reuse` 在第一個 C102 infra receipt 前以 `INFRA_REUSE_PROVIDER_JOB_MISMATCH` 停止。provider readback 證實既有 C95 infra receipt 的 `sourceRevision` 是應用來源 `d3b78440…`、`reusedSourceRevision` 是 migration-runner 來源 `c255b1df…`，而現行 `ai-pdm-prod-migration-runner` 的 `PDM_SOURCE_REVISION` 也是 `c255b1df…`；validator 卻將 runner env 錯接到 application `sourceRevision`。修正只改共同 provider join 為 `reusedSourceRevision`，新增分離來源 production-shaped regression；不放寬 runner digest、Job identity/status、manifest、receipt hash 或 application source lock。C102 未建立 infra receipt 以外的 owner stage、migration、candidate、traffic 或正式 RD acceptance，DEV-122 整體仍為 `NOT_ACCEPTED`。

PR #426 已合併至 exact main `72148b6d0998f7cc868d38a6f636f7a94b228091` 且 required CI PASS；它完成 special-mode 分類與離線 golden-chain，但 live owner executor 仍重複解讀 runtime、readiness、migration 與 failure history。PR #427 已合併至 exact main `432b63f8a37b4278dd95c0aa0c503871a438ebc0` 且 required CI PASS，直接收斂共同機制：prepare 封存唯一 `release-evidence.v1`，migrate 封存唯一 migration admission，candidate／verify／canonical／finalize／rollback 不再重解對應 raw receipt；daily workflow ref 缺漏／偽造與 special intent 在深度 continuation 解析前拒絕；stage error code由 workflow自動傳入 recovery 並寫入 terminal，移除未接線的 ambient failure-history JSON。其 follow-up 進一步限定 readiness 只保留已准入的 data-cutover refs／terminal-transition fact，且重複失敗只作 planner 的共同機制修正訊號，不新增 production prepare／rollback gate。正式發布持續暫停，未建立 C107 attempt；085 仍為已套用、不得重送，專用測試 RD actor 的 UI／API 正負驗收與 DEV-122 其餘 7／29 分母均仍 `NOT_ACCEPTED`。

PR #427 已合併至 exact main `432b63f8a37b4278dd95c0aa0c503871a438ebc0`；merge-main required CI run `39610543494` 的 DEV-012 與 Production Slice QC 均 SUCCESS，且尚未 dispatch 新正式 workflow。合併後查明最後缺口不是 migration 085、catalog 或 grant，而是 route responsibility：daily workflow 正確拒絕 special intent；既有 principal workflow 又只允許 `prepare／build／migrate`，因此已套用 migration 的合法 continuation 沒有 protected 路徑可完成 candidate／activate。當前 corrective 沿用同一 principal workflow、WIF、concurrency 與單一 capsule；普通 principal intent 仍止於 migrate，RD ledger readback 仍唯讀，只有經 executor 驗證含 `appliedMigrationContinuation` 的 capsule 才可續行 candidate／verify／activate／finalize及既有 rollback，不新增 workflow、IAM 或第二個 writer。同時將同類失敗第二次的 decision 由硬阻斷下一次 prepare 改為 `TRIGGER_AI_COO_REVIEW`；這只喚醒一次規則合理性審視，不取代來源、權限、資料一致性或 recovery 的 fail-closed gate。正式發布仍暫停；085 不得重送，專用測試 RD actor 的 UI／API 正負驗收及原 7 issues／29 groups 仍未完成。

PR #429 已合併至 exact main `d7a7c3323d776d5f8e72f505b35fe5a8883c3cf2`；merge-main required CI run `39618479656` 的 DEV-012 與 Production Slice QC 均 SUCCESS。合併後唯讀 permission-state run `39620912537` 證明 ledger 35、migration 085 `APPLIED`、active catalog `ai-pdm.role-catalog.2026-10-10.v7`／hash `4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9` 一致，且專用測試 actor 有一筆 active `rd` grant；service-state run `39621251451` 證明 generation 214、100% traffic 仍在 `ai-pdm-prod-1be8986b68ce`，沒有 runtime／database／traffic mutation。因此 085 不得重送，修正後 source 尚未 serving，專用測試 RD actor 的 UI／API 正向、同 actor approval/review 負向與未授權角色負向均仍 `NOT_RUN`。正式發布維持暫停，DEV-122 原 7 issues／29 groups 仍為 `NOT_ACCEPTED`。

PR #432／#433 後的 C110 與 diagnostics 證據已證明：migration 085 `APPLIED`、catalog v7/hash及專用測試 RD active grant一致，且正式 service／traffic沒有後續 writer。PR #435／#436及exact-main required CI已將attempt refresh移入既有WIF workflow並加入共用provider GET bounded retry；run `39723589561`仍在任何正式寫入前停止，第二次同類首錯依planner觸發AI-COO review。根因是refresh組裝器雖取得builder token，卻未把它傳入verifier transport既有的secondary `builderReadbackToken`，因此精確Cloud Build／Artifact Registry proof GET仍錯用verifier身分；CLI同時隱藏了`kind:status`detail。corrective只收斂這個WIF capability assembly與錯誤輸出，保持builder寫入、deployer mutation、verifier一般讀取、exact routes及fail-closed相互隔離；不新增workflow／IAM／Secret／writer，也不重送085。正式發布與專用測試actor UI／API正負驗收須待protected merge及required CI後續行；在完成前RD production acceptance與DEV-122原7 issues／29 groups仍為`NOT_ACCEPTED`。

PR #437已以exact main `1614054e08fbe6274c6a76070c9ef1f0a07516ff`合併，merge-main required CI run `39726772045`兩項required checks均SUCCESS。正式run `39727734796`已越過builder provider-proof讀取，接著在refresh真實pre-activation continuation路徑以`transport.readOwnerRun is not a function`停止；effective capsule selection與所有owner release stages均skipped，沒有Job／DB／service／traffic mutation。根因不是新的IAM或RD產品邏輯，而是refresh facade逐方法手寫角色路由時漏掉既有唯讀介面，且原focused producer stub與不完整PAUSED fixture未重現`routine-authority → readPreActivationAbortContinuation`。corrective將整份refresh介面收斂為單一、建構時fail-fast的角色映射，`readOwnerRun`固定由verifier執行，builder仍只寫immutable evidence、deployer仍只執行provider request；並以真實routine-authority failed-control fixture及完整route-map回歸封住同族逃逸。085維持已套用且不得重送；本修正尚待protected PR／required CI／fresh owner continuation及專用測試actor UI／API正負驗收，RD production acceptance與DEV-122原7 issues／29 groups仍為`NOT_ACCEPTED`。

### Release source authority 與 artifact transport 分離

Active owner release 的跨元件來源權威只由 protected release intent 的 exact `sourceRevision`／canonical source lock，以及 worker reuse association 的相同 `sourceRevision`／`sourceLockRef` 構成。app 與 worker 可由不同 OS、tar 或 gzip 實作產生來源物件；archive SHA、generation 與 CRC32C 只驗各自上傳物件，不得跨 build、attempt 或 descriptor 決定 source identity。worker artifact 另由逐檔 input manifest、effective recipe、provider build identity 與 image digest 驗證。

Reader 能否讀取已准入 revision、requested revision 應採 current 或 historical profile policy，以及 executable bytes 來自 current checkout 或 historical archive，是三個分離事實。既有 v1～v4 receipt 欄位維持 immutable legacy metadata；只有 provider readback 證明正式 rollback／recovery 不再引用時，才可另行移除相容 reader。本切片不執行正式發布，也不把本機或 CI 結果宣稱成 RD production acceptance。

## 4. 已刪除或縮減的額外要求

| 項目 | 處置 |
|---|---|
| 原始 7 issues／29 groups | 保留總驗收分母；不再要求每一組重跑同一套發布、DB、worker 與 UI 證據。 |
| 外部 supplier 回覆 | `DISABLED_DEFERRED`／`NOT_PASS`；端點維持 fail closed，本次不恢復施工。 |
| procurement 清單 | 縮為公司內部清單的既有案例；刪除外部 portal、SLA、規模化與未提出的流程要求。 |
| 完整原生 CAD 自訂屬性對等 | `USER_OWNED_PENDING_NOT_PASS`；本次不恢復施工或以 PDF 代替原結果。 |
| 390×844 全流程與每頁鍵盤證據 | 不屬預設驗收；只有明確行動情境或關鍵表單可達性受影響時執行。 |
| 每案完整 GET／POST／actor／grant／source／image／revision／traffic／截圖組合 | 刪除；只保存對應失敗機制的證據。 |
| 低風險 UI／文字修改的獨立 QC | 刪除；focused test、lint／typecheck 與 CI 足夠。 |

## 5. 變更責任與關卡

`scripts/plan-production-slice.mjs` 是唯一機械式選擇器。文件敘述不得額外展開一套平行 gate。

| 變更責任 | 必要檢查 | 不自動要求 |
|---|---|---|
| 純文件 | planner 與文件連結／JSON 解析 | app build、PostgreSQL、瀏覽器、發布 |
| 一般 application／UI | focused tests、lint／typecheck、isolated build、桌面 smoke | native PostgreSQL、migration、行動版、獨立 QC |
| authorization | focused allow／deny、實際 actor（正式驗收時）、consumer 相容 | DB gate；除非同時修改 schema／migration／repository |
| database／lifecycle | DB boundary、forward-only migration、native PostgreSQL、交易／rollback | 未受影響 worker／preview 歷史 |
| preview／file | current-version binding、bytes／hash、terminal job、桌面可讀性 | 授權或 DB 全套；除非路徑也受影響 |
| worker | job claim／complete、terminal、bytes、來源與 cleanup | 一般 UI 全套 |
| infrastructure／release-control／unknown | protected full gate | 無 |

授權程式碼不再因「authorization」分類自動觸發資料庫檢查；只有實際資料庫責任路徑才啟用 `database`、`dbBoundary`、`nativePostgres` 與 `migration`。

## 6. 證據最小集合

- 權限：actor、目前有效 grant、allow／deny、拒絕零副作用。
- 生命週期：輸入、交易結果、目前資料 readback、rollback／replay。
- PDF／檔案：revision 綁定、bytes hash／size、畫面可讀性。
- worker：source／job、claim／complete、terminal、錯誤與 cleanup。
- 發布：source SHA、image digest、revision、traffic、rollback revision。
- 純 UI：操作結果與必要畫面；非視覺變更不要求截圖。

本機、合成或 API PASS 只證對應層級。原始 FAIL、UNKNOWN、NOT_RUN 保持原狀；同一責任未變的既有證據可重用。

## 7. 發布流程

對產品與審查者只暴露五個邏輯階段：`preflight → build → migrate-if-needed → candidate-smoke → activate-readback`。既有 executor 的內部 jobs 與收據可維持相容實作，但不再是 DEV-122 的逐項人工驗收清單。

- GitHub owner workflow 亦以這五個 phase 執行；各 phase 只做一次 checkout／依賴安裝，身分與 proof token 維持 step-scope。原十個 immutable stage receipt 只作為 phase 內的續跑／復原邊界，不再各自複製工作樹、環境準備或人工關卡。
- operator image 的 `scripts/lib` 使用受測試約束的完整 runtime closure，不再逐檔維護容易遺漏 transitive import 的 COPY 清單；入口腳本與跨目錄程式仍明確列入映像。
- receipt schema 由共用權威 validator 驗證，續跑層只補當次 continuation 的額外 join；不得為每一條 recovery path 複製同一組 receipt 欄位檢查。
- `migration=true` 只由 database 或 full gate 產生。
- application／preview／recognition 變更不得因無 DB 變更而新增資料庫驗收要求。
- 正式發布仍使用不可變來源、required CI、provider readback 與既有 rollback。
- 本契約不授權正式發布、IAM／Secret、資料寫入或資源新增。
- 本輪流程收斂期間正式發布維持暫停；本機與 CI 結果不構成 RD 正式驗收。

## 8. 共同安全底線

- 實際 Principal 與有效 grant 必須 fail closed；不得以 UI 隱藏替代 server 授權。
- RD 不得核准自己送審的工作；撤權後不得沿用舊決策。
- 核准、正式狀態與目前指標必須同交易或完整回復。
- DB 變更只允許 `db/postgres` 的 forward-only migration，並執行 `npm run check:db-boundary`。
- 不手動修改正式資料庫；未知寫入先 provider readback，再決定是否重試。
- PDF／CAD／attachment 必須綁定目前 revision 的實際檔案。
- 只清理經驗明為本任務建立的 runtime、port、tab 與暫存路徑。

## 9. 歷史對照

| 原項目 | 現行去向 |
|---|---|
| `D122-01`、`D122-02` | 已修歷史回歸；只有受影響時重驗。 |
| `D122-03`、`D122-04` | `pdm_lifecycle`。 |
| `D122-05` | `drawing_preview` 與受影響 worker。 |
| `D122-QA-01` | 測試可信度要求；不是產品能力。 |
| `D122-06` | `operations`／內部 procurement 清單；保留在原 7／29 分母，僅刪除外部 portal、SLA 與規模化假設。 |
| `D122-07` | supplier `DISABLED_DEFERRED`。 |
| `D122-08` | 原 7／29 之外的追加修復；已完成歷史修復，按來源適用性重用，不改變原分母。 |

完整舊契約、B23～B54 續點、7／29 對照、原始正式失敗與 QA/QC 連結均保存在歷史原文及既有收據；歷史檔不能自行恢復已刪除的額外流程或擴張現行施工。

## 10. 結案

每項能力在其優先核心案例中沒有未處理 FAIL，且需要正式環境的案例取得對應正式證據後，可獨立標記完成並停止重跑未受影響責任。DEV-122 整體仍以原始 7 issues／29 groups 結案；supplier 維持 `DISABLED_DEFERRED / NOT_PASS`，完整原生 CAD 維持 `USER_OWNED_PENDING_NOT_PASS`，本次不恢復兩者施工。全流程窄 viewport、逐案完整證據包、無條件 DB／migration 與低風險獨立 QC 不是額外結案要求。
