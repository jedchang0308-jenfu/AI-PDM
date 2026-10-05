# DEV-122：AI-PDM 內部功能缺陷與本地開發契約

本輪一次提交／自動啟用與動態進度已隨R03部署，PR／main required CI與owner RELEASED／FINALIZED通過；exact來源／migration／provider及層級限制依[新正式結案](../qa/DEV-122-secret-workflow-production-closure-2026-10-05.json)。真key／CAD由使用者正式驗證；使用者已指定 Cloud Run，現有 Windows Document Manager 不相容，免費 OpenSWX 已選定本地評估，8檔已讀出partial儲存屬性，Cloud Run 唯讀輔助結果本地實作中，整體DEV仍NOT_ACCEPTED。原始FAIL及[R02結案](../qa/DEV-122-settings-production-closure-2026-10-05.json)保留為歷史，未覆寫或升級mock驗收。

## Cloud Run 部署指示與解析器相容性（2026-10-05；CURRENT，優先於下方 Windows 啟動契約）

人類指定 worker 使用 Cloud Run，選免費 OpenSWX，要求測試已授權 CAD 及 Linux／Cloud Run 可行性。唯一專案 AI-PDM，canonical repository `C:/VIBE CODING/AI_PDM`；execution worktree `C:/Users/user/.codex/worktrees/dev122-internal-functions/AI_PDM`、branch `codex/dev122-share-metadata-closure`、source baseline `7cebdb376ef0a24cbe6bb6ee7e511323cf45b489`。禁止跨專案開發、採購／聯絡供應商、讀真 key／local ADC／外傳 CAD；新資源／IAM／Secret／production mutation 尚未建立或執行。原生 CAD 正式驗證 human-owned，不以本地 parsing 取代 F-01F。

真正問題是讀出檔案真實屬性並明示缺口；換 Linux 指令不能代替完整 metadata、授權與 Job lifecycle。**Phase 1 = LOCAL_LINUX_PARTIAL_OBSERVED／獨立 actual artifact QC 完成、12暫存測試檔／14容器／own映像／3build configs清理已驗；Phase 2 local = RD Implementation Ready／READONLY_AUXILIARY_IMPLEMENTATION，Phase 2 cloud = CONDITIONAL_RESOURCE_AUTHORIZATION_PENDING**。2026-10-05 人類明確選擇「先開發唯讀輔助結果（建議）」；這是新增輔助用途，沒有降低原完整 native properties 需求。Cloud Run build／deployment／business workload 未執行。

使用思考習慣：#限制條件、#變數控制、#可驗證性

### Phase 1 accepted RD package（Medium）

1. **來源**：固定 [OpenSWX commit](https://github.com/schwitters/openswx/tree/30bd63845d3532cdecfdf2654e9cc0871229c45a) `30bd63845d3532cdecfdf2654e9cc0871229c45a`；只導入未修改的必要 `libopenswx/include/openswx` headers、`libopenswx/src` 實作／internal headers及root MIT `LICENSE`。Own AI-PDM adapter/build負責呼叫library；不建立upstream checkout、不跑upstream app/tests/fixtures/top-level build。[Pinned library CMake](https://raw.githubusercontent.com/schwitters/openswx/30bd63845d3532cdecfdf2654e9cc0871229c45a/libopenswx/CMakeLists.txt)的編譯單元為 `document.cc`、`internal/decompressor.cc`、`modern_parser.cc`、`ole2_parser.cc`、`xml_readers.cc`、`sheet_name_reader.cc`；以actual includes核對必要headers。C++20、zlib、pugixml/toolchain/image版本及licenses入manifest；下載逐檔SHA256/URL/commit/bytes與own adapter/build SHA入evidence，hash manifest未完整不能算source binding PASS。
2. **API與忠實映射**：使用 `SwxDocument::Open`、先驗 `Result.ok()`、再讀 `doc()`。Pinned [document API](https://raw.githubusercontent.com/schwitters/openswx/30bd63845d3532cdecfdf2654e9cc0871229c45a/libopenswx/include/openswx/document.h)與[types API](https://raw.githubusercontent.com/schwitters/openswx/30bd63845d3532cdecfdf2654e9cc0871229c45a/libopenswx/include/openswx/types.h)只提供string maps，未提供propertyType／linkedExpression／evaluatedValue分離API；configuration map為global加cfg覆寫後的effective values，不能稱pure configuration-owned屬性。Type由extension推定、version是內部數值；不冒稱binary type validation／raw-evaluated等價／scope來源完整。Library會skip malformed streams後仍可open-success，空map／preview存在不足以證完整。
3. **Own輸出**：`aipdm.openswx-feasibility.v1`保存source hash/bytes、reader commit/library hashes、type與`extension_inferred` provenance、version、cfg index/name、global map、cfg effective map、outcome/coverage diagnostics。字串命名`storedValue`，scope明示`document_global`／`configuration_effective_merged`；不猜inherited來源。propertyType／linkedExpression／evaluatedValue明示`unsupported_by_public_api`，不得用null、空值或同字串冒充已讀；null需availability reason。Drawing config不適用與解析失敗區分；未知name/version不猜。首階段不輸出`solidworks-native-properties.v1`交現行normalizer寫正式欄位。
4. **資料／runtime**：只讀人類授權J:資料夾manifest的8檔（3PRT/1ASM/4DRW），先保存hash/bytes、複製own staging；只讀input mount交own temporary Linux/amd64容器。不得遞迴擴scope／開CAD引用檔／掛整host、J drive、workspace、Docker socket或credentials。Build依賴取得與CAD parsing分離；parsing network=none、非root、read-only rootfs、有限tmpfs/PID/CPU/memory/output。啟動前記project/purpose/image digest/ownerPID或containerID/port=none/timeout/cleanup；PDM_DATA_DIR與PDM_REPOSITORY_DIR只指own isolated paths，不初始化DB／寫primary。初始逐檔30s、512MiB memory、256MiB input、2MiB output；調整記原因與新bound，不能取消上限。Finally只清verified own process/container/temp，保留有限metadata/evidence，不commit/push CAD bytes。
5. **File allowlist／writer**：`scripts/lib/openswx-reader/` own adapter/build/manifest及未改vendor dependency/license；`scripts/dev122-openswx-feasibility.mjs`；直接mapping/runner tests；`.ai-doc/qa/DEV-122-openswx-*`；本CURRENT段及PM直接索引(root sole writer)。只授權本地評估package，不擴production worker/auth/UI/schema/infra；scope須追溯人類原始指示，不能用本文件自行增權。Root sole product writer，TL只寫本CURRENT段，保留PM dirty與歷史。
6. **順序**：核對manifest → own bounded isolated build → mapping負向tests → 8檔逐一native parse/hash → coverage matrix/cleanup receipt → TL按真結果收斂Phase2。Library不足仍交具體partial/unsupported結果；不改upstream parser／加第二reader補洞／降低完整需求。

2026-10-05 Phase 1 actual observation（依[真實解析收據](../qa/DEV-122-openswx-feasibility-2026-10-05.json)及[built-artifact manifest](../qa/DEV-122-openswx-built-artifact-2026-10-05.json)，不是 TL 重跑）：19 個 vendor 檔對 exact commit／bytes／SHA256／Git blob SHA1；R3 own Linux/amd64 image build/readback PASS，immutable local image ID `sha256:41ca13a8256349410a983f792a78dd0d5cd5d0eb91175cb3f82a6c00c62aeb97`，31 個 build-context source 檔零 drift、268 個 regular artifact 檔及 3 個 license aliases 入 manifest。Compiler GCC 12.2.0、CMake 3.25.1、pugixml 1.13、zlib 1.2.13 的 exact package versions／licenses 以 manifest 為準。此 local image ID 不是 registry artifact digest 或 Cloud Run 已部署 image。

| 樣本 | 真實觀察 | 尚未證明 |
| --- | --- | --- |
| 3 PRT：A0029、A0033、D-0007-MA1 | 各 9 global properties；前兩檔各一個「預設」effective cfg（各 9），D-0007-MA1「展開／彎折」各 9；皆 `partial`。 | 純 cfg-owned 來源、全部 properties、raw/linked/evaluated/type 與人類語意等價。 |
| 1 ASM：A0053 | 7 global properties；「預設」effective cfg 5；`partial`。 | Global/cfg 數量不相同的原因與完整性未知，不自行推成 inherited/missing。 |
| 4 DRW：A0029-M01、A0033-M01、A0053-M01、D-0007-MA1 | 各 6 global properties、cfg 空；皆 `partial`。 | Drawing cfg 不適用與 reader 未提供須以 provenance 區分，不能用空 cfg 證完整。 |
| 4 malformed/truncated fixtures | legacy.SLDPRT、malformed.SLDPRT、truncated.SLDDRW、zip.SLDASM 均 `failed`、exit 10、`library_open_rejected`，負向案例 `PASS_REJECTED`。 | 這四個拒絕不證明所有損毀 streams 都拒絕；silent skip/integrity 仍 UNKNOWN。 |

16 項 mapping/isolation tests PASS；八檔 source hash 前後一致，解析 network=none、非 root、read-only rootfs、30s／512MiB／256MiB input／2MiB output。真 values 不進 source-controlled 摘要，不 commit/push CAD bytes。受控收據記 8 positive、4 negative、2 artifact containers absent、無 ports；CAD staging/local image cleanup 仍 `PENDING_AFTER_INDEPENDENT_QC`，由 root／原 runtime owner 收斂，TL 不替其宣告完成。Primary SQLite 兩路徑 ABSENT、無 DB initialization，不宣稱執行 PRAGMA。R1 floating-input 取消、R2 missing-make build FAIL、首次 artifact symlink export FAIL 與 driver registration fingerprint FAIL 保留，不改成 native FAIL 或抹除。

公開 API 缺 rawValue／linkedExpression／evaluatedValue／propertyType；cfg 僅 `configuration_effective_merged`；stream integrity `unknown_silent_skip_possible`。Stored values 非空只證本次觀察；完整 metadata／semantic equivalence UNKNOWN，human F-01F NOT_RUN。獨立[Luna QC](../qa/DEV-122-openswx-independent-qc-2026-10-05.json)目前 scope/verdict 依收據原文，actual artifact/native/cleanup 最終 QC 尚待 root 收斂；RD tests 與 TL source review 不當獨立 QC。

### Phase 1 acceptance／QA／stop conditions

| Gate | 驗收與失敗證據 |
| --- | --- |
| Source/license | Exact commit、逐檔upstream/own SHA256、MIT notices、依賴版本可重現；drift/缺license停compile。 |
| 8檔真實解析 | 每檔hash/bytes/type/provenance/version/global/cfg map/diagnostics/elapsed/exit；unsupported/failed逐檔列。格式數與副檔名成功不代替屬性完整。 |
| 忠實mapping | Own tests覆蓋Unicode、空/缺值、global-cfg覆寫、不明cfg、type推定、malformed/unsupported、timeout/output bound；保存expected/actual差異，不能虛構raw/linked/evaluated/type/purecfg來源。 |
| 完整需求 | Required field/scope/value-kind皆有真來源；API不提供為PARTIAL/UNSUPPORTED。人類CAD ground truth未得則semantic equivalence UNKNOWN，本地可解析不等於完整相容。 |
| 隔離/恢復 | Source前後hash相同，無外傳/key/primarywrite，verified owner process/container/temp退出清理receipt、port none。保存首FAIL，重試不得覆寫空map/錯誤。 |

RD自驗不當independentQC；QC綁frozen own artifact。三格式可parse、完整metadata、CloudRun build、正式worker及human F-01F是不同結論。Source drift、越界input/host/network/key、crash/timeout、malformed空結果或required欄位缺口停止受影響成功宣告，保留證據；仍可獨立完成8檔相容性盤點。

### Phase 2 local Implementation Ready／唯讀輔助契約（High）

**已決產品語意**：只展示 OpenSWX 真實 `storedValue`、document global／configuration effective merged provenance、reader commit／source hash 與 coverage。所有原生樣本仍 `partial`；不虛構 raw／linked／evaluated／propertyType，不把部分結果映射成 DM，不因使用者選擇輔助用途將 F-01F 改為 PASS。輔助結果不能 accept/map/handoff/commit/formalize、自動寫入 part/drawing/revision 欄位或替代 native probe/ACK；原 R03 金鑰流程不重做。

使用思考習慣：#限制條件、#變數控制、#可驗證性

**已查明的耦合**：`scripts/run-drawing-recognition-worker.mjs` 正常模式 infinite polling，`--once` 仍先取 DM credential、claim probe、發 DM heartbeat；`worker-service-auth.ts` 的 recognition purpose 強制 DM；`recognition-workers/heartbeat` 只接受 DM。`solidworks-metadata-mapping.ts` 的 `valueOf()` 只接 evaluated/linked，結果固定 `solidworks-document-manager.v1`；現 repository `completeJob()` 將 observations 形成可審核／正式化候選。現 recognition lease 只綁 workerId、sourceSetFingerprint，無同一 worker 不同 attempt 的 completion fence／receipt replay。這些是不能直接換 CMD 或放寬 recognition purpose 的原因。

**最小架構**：保留原 recognition queue/DM worker；新用途沿既有 durable SQL queue 模式，只新增一張 purpose-specific `ai_pdm_core.openswx_metadata_jobs`，不新增 generic engine、broker、另一個 CAD reader 或 upstream 修改。每列綁一個既有 recognition session 與 immutable source snapshot（最多 8 個人類選定 source），同列保存有限結果 JSON、dispatch receipt 與 worker lease；兩種 lease 各有 generation，不用三張 queue/result/dispatch 表。輔助 queue 不取走／完成原 recognition session，不把 DM 的 `extracting` 改為輔助狀態。

| 責任 | 確定契約 |
| --- | --- |
| Human enqueue/read/cancel | `POST/GET /api/numbering/recognition-sessions/[sessionId]/openswx-metadata`；enqueue/cancel 以現有 `numbering.recognition.run`、read 以 `numbering.recognition.review`，沿 exact route policy＋verified Principal workspace guard，不新增 human role/grant。持久化 actor/company/initiator Principal/profileVersion/account lifecycle/authEpoch、原 session/source-set hash、每 source ID/hash/bytes。跨公司、失效 Principal、無 published permission、source 不屬 session、超上限一律拒絕；重複 enqueue 回同一 job。Cancel 使用 `POST .../openswx-metadata/cancel`，不使用 workload credential 代人類決策。 |
| Reader identity | Registry 只新增 `openswx_metadata_jobs` purpose＋`openswx_metadata` capability；server 綁固定 workload id、reader commit、schema `aipdm.openswx-auxiliary.v1`，worker body 的 capability/version 不作授權。新增 purpose 不移除現 recognition/probe/key 的 DM requirement。Reader token 對 preview、recognition、settings_secret_probe、solidworks_credential、DM heartbeat／applied ACK 都 403；DM token 沒有新 purpose 也不能 claim 輔助 job。 |
| Worker API | `POST /api/openswx-metadata-jobs/claim`、`POST /[jobId]/heartbeat`、`GET /[jobId]/sources/[sourceId]/content`、`POST /[jobId]/complete`、`GET /[jobId]`（completion readback）。每次檢查 purpose/capability、actor id、job company/reader binding、attempt generation、source fingerprint/current ownership、取消與 initiator 當下有效權限；content 僅回該 lease 選定 bytes/hash，不回原路徑／storage key／整個 bucket。 |
| Persistence | 一張表含 job/status、company/session/initiator/snapshot、reader binding、attempt/worker/lease expiry、dispatch state/generation/lease expiry/operation name/execution name、completion digest、bounded result JSON/bytes/hash、created/updated；唯一鍵 `(company_id, session_id, source_set_fingerprint, reader_commit)`。同公司 composite FK 到 session/Principal source ownership，不做由 legacy userId 猜 Principal 的 fallback。Source snapshot 與人類 initiator immutable；lease/dispatch 狀態 transaction＋CAS 更新。 |
| Normalizer | `storedValue` 保留字串及空/缺值 availability；scope 只允 `document_global`／`configuration_effective_merged`，type `extension_inferred`、version `internal_numeric`、cfg 名称來源明示。固定 coverage 七項與 diagnostics；總結果 JSON ≤2MiB／job，不能用 silent slice 遮超限。JSON 不借 `DrawingRecognitionObservationInput.rawValue` 或 DM adapter/version，不呼叫 `mapNativePropertiesToAdapterResult()`。結果只供唯讀 panel，console/log 不輸出值。 |
| Finite process | 專用 `scripts/run-openswx-metadata-job.mjs`，固定 entry、最多 1 job／execution、每 job ≤8 sources、每 source ≤256MiB／parse ≤30s、整體工作 deadline 270s、provider task timeout 300s、taskCount/parallelism=1、task retry=0、queue 最多 2 attempts。HTTP deadline／output bound／5s heartbeat／60s lease；empty claim 204 成功 exit。不得 shell/free command/env overrides／DM credential fallback；source 順序暫存／逐檔清理，parse 不連網、不 follow refs。 |
| UI | 在現 recognition panel 增一個「免費讀取的輔助結果」唯讀入口／收合明細；明示部分屬性、merged scope、缺項；configured/scheduled/executing/degraded/blocked/result 分開。Idle 無 heartbeat 不當 offline/ready，spinner 只綁活 lease，支援 reduced-motion/aria-live；沒有正式化／套用 CTA。 |

**Dispatch／恢復**：enqueue 先 commit durable row，app 然後呼叫固定 `projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata:run`，不接受 overrides。固定 global admission 由同表 dispatch lease 實現：PostgreSQL 使用一個 purpose-specific transaction advisory lock，確認無 active／unknown dispatch，再 CAS 最舊 due row 為 requested；SQLite 以 write transaction 等價序列化。同一 execution 只處理該 admission 的一列，worker claim 比對已保存的 provider execution name；啟動早於 dispatch receipt 持久化時只作有限重試，不能自行取另一列。Provider POST unknown outcome 先以 request-window/exact-job operations/executions readback 找到或確認未建立，不能按 lease 到期盲目重送；無法唯一判定即 `dispatch_unknown` 並停止新 execute。不得宣稱 provider run API 有自訂 idempotency key。

Scheduler 只呼叫固定 app `POST /api/openswx-metadata-dispatch/recover`（初始每 5 分鐘、有界重試），先看 durable queue，有 due 且 admission 無 active/unknown 才 execute；正常 idle 不跑空 Cloud Run Job。不依賴瀏覽器輪詢或 Cloud Run service 常駐 timer。此 endpoint 只接受 purpose-specific Scheduler OIDC：exact Google issuer、固定 scheduler SA subject/email、exact canonical audience、expiry/signature＋server allowlist；不接受 reader bearer、human cookie、可變 URL/target。Google API access token 只用 app runtime metadata identity取得，reader→app 仍是 purpose-scoped bearer，兩層不可互換，更不能讀 local ADC。

Completion 以 `(jobId, attempt, source-set hash, reader binding, completion digest)` transaction 寫 bounded result；相同 digest 重送回同一 receipt，不重複 audit；不同 digest／失效 lease／取消／撤權／source drift 回 409/403 不寫結果。Worker HTTP completion unknown 先 GET readback，再決定同一 fenced retry。Crash/timeout 只由已證 execution terminal 後的 recovery 重新排 due attempt，最多 2 次後 failed；禁止 unknown execution 與另一執行同時處理。Cancel/revoke 阻止下一次 content/heartbeat/complete，已下載 tmp bytes 終止並清理；不手改 production data。Rollback 先 pause dispatcher/Scheduler，停止驗明 own execution，再回 exact prior Job digest/template；若首版則保留 disabled Job/Secret/新表，不 drop/delete 或回寫舊 DM session。

使用思考習慣：#系統描繪、#限制條件、#可驗證性

### Phase 2 exact local file allowlist／順序／DB boundary

下列是人類新選擇支持的 AI-PDM 本地實作包，root 分配 writer；TL 本輪仍只改本 CURRENT 段。只建立直接責任檔案，沒有行為變更的既有檔案不碰。

- **Reader/finite runner**：`scripts/run-openswx-metadata-job.mjs`、`scripts/lib/openswx-reader/auxiliary-job.mjs`、`scripts/lib/openswx-reader/auxiliary-job.test.mjs`、既有 `normalize.mjs`／`reader.test.mjs`／`Dockerfile`／`README.md`（own integration，vendor bytes 不改）。
- **Purpose-specific product**：`src/lib/openswx-metadata.ts`、`src/lib/openswx-metadata-contract.ts`、`src/lib/repositories/openswx-metadata-async-repository.ts`、`src/lib/openswx-metadata-dispatch.ts`、`src/lib/openswx-metadata-dispatch-auth.ts`、`src/lib/worker-service-auth.ts` 與其 `worker-service-auth.test.ts`；新直接測試 `src/lib/openswx-metadata.test.ts`、`src/lib/openswx-metadata-dispatch.test.ts`、`src/lib/openswx-metadata-dispatch-auth.test.ts`、`src/lib/openswx-metadata.postgres-contract.test.ts`。
- **API exact files**：`src/app/api/numbering/recognition-sessions/[sessionId]/openswx-metadata/route.ts`、同下 `cancel/route.ts`；`src/app/api/openswx-metadata-jobs/claim/route.ts`、`[jobId]/route.ts`、`[jobId]/heartbeat/route.ts`、`[jobId]/complete/route.ts`、`[jobId]/sources/[sourceId]/content/route.ts`；`src/app/api/openswx-metadata-dispatch/recover/route.ts`。不能擴既有 recognition-jobs/probe/key endpoints。
- **UI/route wiring**：`src/components/drawing-recognition-workspace-panel.tsx`、`src/components/drawing-recognition-workspace-panel.module.css`；`config/access-control/jenfu-route-permission-map.v2.json`（只新增上述 human routes 的 exact run/review policy、同步 denominator；workload/recovery routes不得掛humanpermission）、`src/lib/jenfu-route-permission-map.test.ts`、`src/lib/principal-command-routes.test.ts`。`src/lib/jenfu-route-permission-map.ts`／`src/lib/principal-command-route-proof.ts` 已支援 exact dynamic routes，無需一般重構；測試若證直接缺口才在同一責任內修正。Published Principal permission/profile仍只驗既有run/review，不新增角色或假裝本地mapping是新publishedgrant。 `config/access-control/jenfu-active-capabilities.v1.json`只補既有run/review新route/caller evidence，保留66個capability的kind/code與v6 catalog；`scripts/qc-dev-121-route-classification.mjs`及其直接測試只增purpose-specific Scheduler OIDC recovery helper的分類，不以一般Bearer或名稱猜授權。
- **DB/manifest**：`db/postgres/082_dev122_openswx_auxiliary_jobs.sql` 是 fresh `origin/main=90b0d1dc0ba6f832d984938d2acbffb989c70e52` 已包含 `081_dev121_principal_role_catalog_v6.sql` 後的候選，不是已保留/已套用 ordinal；RD 開始／整合後再查 own index、db/postgres、owner profile，若被占用改下一個 own 空 ordinal，machine binding 更新不重問人類。只新增上述 `ai_pdm_core` table/index/check/FK/RLS/最小 runtime DML grant；`src/lib/db.ts` 僅加 equivalent isolated SQLite schema；`config/release/dev117-ai-pdm-independent-production-v3.json` 僅追加 exact migration hash/order，歷史 entries/078/079/080 不改。無 `ai_pdm_contract`／public／其他 schema DDL，無 primary/live migration。
- **治理/evidence**：本 CURRENT 段、`.ai-doc/dev_task.md`、`.ai-doc/documentation_map.md`（root only）；`.ai-doc/qa/DEV-122-openswx-phase2-*`、`output/qa/dev-122/openswx-phase2/`。Infra/owner Job deploy/Secret rotation workflow 實作不在此本地 product slice；依下列資源提案另收斂 exact source allowlist，尚未建／apply。

**下一最小 RD slice**：先完成 auxiliary schema/contract/normalizer、單表 repository、purpose deny rules與 isolated transaction tests（enqueue/claim/content/complete/readback/cancel），再 finite runner/dispatch stub、唯讀 UI；dispatch 預設 disabled，外部 API 用 bounded fake transport。最後以 real local Linux artifact 接 own isolated harness，驗 metadata coverage/cleanup。這些本地實作不需再次詢問已決產品語意；外部 resource binding 不阻斷本地 slice。Cloud Run Job image 要另包 runner／Node runtime，Phase 1 C++ CLI image本身不是完整 worker，重建後新 digest 正常更新 binding。

使用思考習慣：#拆解問題、#限制條件、#可驗證性

### 可一次審閱的 Cloud Run 資源方案（PROPOSED，尚未建立／部署）

Owner `AI-PDM / DEV-122`；target `jenfu-platform-prod / asia-east1`，專用 own state 候選 prefix `dev-122/openswx-worker/default.tfstate`；不讀 sibling，不改 Platform／其他 app/state／shared edge。以下確切資源/動作供 root 彙整單次人類授權，文件不是授權。App source仍沿 protected-main required CI/app-owned release，現 app release adapter不涵蓋新 Job lifecycle；Job own deploy須另有 source-frozen plan/readback/recovery receipt，不以 historical R03 代證。

| Target | Owner/actions/minimum authority | 成本／rollback |
| --- | --- | --- |
| Job `ai-pdm-prod-openswx-metadata`；SA `aipdm-prod-openswx-reader@jenfu-platform-prod.iam.gserviceaccount.com` | 建專用 identity／private Job、固定 own registry digest/entry、1 CPU/1Gi、1 task/parallelism、300s、retry 0；reader SA 無 DB/GCS/DM/Job-execute grants，僅下列單一 token Secret accessor。部署者只 exact Job lifecycle與 exact SA actAs，若 custom-role/project binding才能create須列 permissions/conditions 後核准，不能借 broad Run Admin。 | [Cloud Run usage](https://cloud.google.com/run/pricing)、image storage/build/logging；初版停用保留，更新回 exact prior digest/template，provider readback。 |
| Job-only IAM 給現 `aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com` | exact Job `roles/run.invoker`（run，無 overrides）；dispatch readback另列 `run.jobs.get`／`run.executions.get/list`／`run.operations.get` 所需最小 custom role、resource condition；須驗 provider role support，不給 run.jobs.runWithOverrides、任意 Job、project-wide Run Admin。Reader SA 不可反向 execute。 | IAM 本身不當免費 workload承諾；revoke only added exact binding，停 dispatch；未讀回 known terminal 不retry。 |
| 新 Secret `aipdm-prod-openswx-reader-token`＋既有 `aipdm-prod-workload-auth-credentials` 新 numeric version | owner credential lifecycle 產生單一 43-char reader token；新 Secret 只含 reader token，reader SA exact-secret accessor；app既有 registry新 numeric版保留原 entries並新增 reader id/purpose/capability。Job不可掛整份 registry（含 DM/probe credential）；不讀真 DM key/ADC、不把 token入Git/log/state；owner只 exact新增 Secret/version／metadata readback與綁定，不擴既有key權限。 | [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing) 的 versions/access operations；撤reader registry row並發新numeric版、停止job，再停用exact reader token version；不delete原Secret/歷史版本。 |
| Scheduler `aipdm-prod-openswx-dispatch`＋SA `aipdm-prod-openswx-dispatch@jenfu-platform-prod.iam.gserviceaccount.com` | 建私有固定 canonical endpoint/audience `https://ai-pdm-prod-9536592944.asia-east1.run.app`＋`/api/openswx-metadata-dispatch/recover`、每5分鐘、有界重試；SA無 Job/DB/GCS/Secret grants，僅exact dispatch OIDC identity；若需Invoker只service-scoped且app purpose仍驗證。Scheduler service-agent token權限須fresh最小讀回，不新grant broad Token Creator。 | [Scheduler monthly pricing](https://cloud.google.com/scheduler/pricing) 與app invocation；pause schedule＋撤新增exact identity mapping/binding，不清空durablequeue。 |
| Artifact/owner deployment | 僅 existing `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release` own worker image，own release evidence prefix、source-frozen Job plan；不新增bucket／project-wideartifact/storage權限／更換existing release state。建/更新Job與Secret numeric binding、fresh provider readback、bounded own workload smoke須明確資源授權。 | Artifact/build/log/egress按使用量；回priorimage/manifest，保留immutableevidence，不刪existingreleaseobjects。 |

MIT library沒有license費，不等於Cloud全免費。成本分Scheduler每月、Secret active-version/access operations、Artifact/build/storage、CloudRun execution/app/log/egress；[Scheduler](https://cloud.google.com/scheduler/pricing)每billingaccount每月共用3jobsfree，超額US$0.10/job/31days，paused仍計；[CloudRunJobs](https://cloud.google.com/run/pricing)每次instance-basedexecution最低計1分鐘，因此空queue由app先判斷；[ArtifactRegistry](https://cloud.google.com/artifact-registry/pricing)共用0.5GiBfree。Accountquota餘額UNKNOWN，不能報$0或借DEV-121 US$10目標作本Job批准。Root一次詢問應包含上述資源集合、動作/最小權限、使用量費用及stop/rollback；若IAM最小role尚不能精確綁定，先完成本地source/permission清單，不以泛化授權執行。ExactSHA/digest/numeric版本由owner執行前新綁並讀回，不因機器binding改變重問同一範圍。

### Phase 2 QA／stop／cleanup

Isolated SQLite/PostgreSQL fixture先驗未改snapshot的master/root/migration-residue/globalFK invariant；記fixture ledger，不seed/clean primary。核心測試：同公司Principal/publishedgrant與revoke；reader/DM互斥purpose及probe/key/ACK403；錯reader/source/fingerprint/attempt409；cancel/expiredlease/takeover；same-digestduplicate與different-digestreject；providerunknown先readback、ambiguous不execute；enqueuecommit後dispatchfail及Scheduler補償；finiteemptyexit/crash/timeout/maxattempt/resultbound；部分scope/value-kind不污染正式欄位／原DMqueue/R03回歸。正常測試不能作complete raw/type/full-cfg需求PASS。

Run focused own tests、`npm run check:db-boundary`、`npm run typecheck:app`與`npm run build:isolated`；涉及releaseprofile/adapter時加AGENTS規定releasechecks，不能用localtests證requiredCI/provider/production。UI最後freeze後做真browser兩viewport、visibleerror/counter/idleactivity/reducedmotion；不需重驗未改R03真key。每次temporaryruntime開始前登記AI-PDM/purpose/port/ownerPIDtree/image、PDM_DATA_DIR/PDM_REPOSITORY_DIR ownpaths、cleanupcondition；finally只停驗明task-ownedtree/container/tab、確認portsreleased、刪verifiedownCADtmp，保留boundedmetadataevidence。

以下stop受影響外部整合或成功宣告，仍可交付安全本地slice：source/vendor/license drift；primary mutation/unknown data ownership；capability或purpose越權；storedValue偽裝DM或full-native；lostattemptfence／unknownprovider被盲retry；token/whole-registry/值外洩；Job/Scheduler/IAM/Secret未經具體resource授權；沒有exactreader/version/provider/rollbackreadback；原生semantic或humanF-01F未證不能accept全DEV。Phase1 finalactualQC/cleanup由root更新綁定，不覆寫firstFAIL。

原7issues/29groups與整體NOT_ACCEPTED不變，F-01F NOT_RUN/human-owned。下方Windows常駐COM為R03歷史，不作現行續點、不改原FAIL與結案。[相容性續點](../qa/DEV-122-cloud-run-worker-feasibility-2026-10-05.json)由root依真證據同步。


文件角色：CURRENT_CONTRACT／CONTROLLED_ISSUE_LIST；成熟度：RD Implementation Ready；狀態：SETTINGS_ENTRY_DEPLOYED_PENDING_HUMAN_VALIDATION／原生屬性待使用者正式驗證、整體未驗收。架構定案：已定案（2026-10-04 source Closure Review）；RD 依本文件 allowlist、實作順序與 gate 開始本地開發。

## 現行追加契約：一次提交與自動金鑰流程（2026-10-05）

狀態：RD Implementation Ready／架構定案 PASS（2026-10-05 source review）；使用者已依改善方案明確要求修改。本節只延續 AI-PDM 設定入口 corrective cycle，優先於下方舊 file allowlist；R02 已部署結果與所有原失敗保留。架構 PASS 只代表以下實作契約已收斂，未執行產品或正式驗證。原生 CAD／真金鑰／正式 native probe 驗收仍由使用者執行，整體 7 issues／29 groups 不變、NOT_ACCEPTED。

- 使用者只提交一次「儲存並啟用」；伺服器持久化 exact-reference 自動啟用意圖，安全儲存後自動排原生 probe、通過後自動啟用、由原生服務確認精確版本套用。瀏覽器關閉／重新整理不取消既有工作；不能依賴前端輪詢觸發後續寫入。
- 舊 test-only 草稿／工作不能自動轉成已同意啟用；提供一次「繼續並啟用」以記錄新的 human intent 並接續原工作。重複排程回既有 typed job，保留原 probe initiator；同公司與權限驗證不省略。
- consent 與 probe initiator 分別保留。自動啟用前在 owner SQL transaction 重驗目前 human Principal、公司／profile／account／auth epoch 與已發布 settings.secret.manage；workload 只作 purpose-scoped 技術執行者，不能充當 human session。不得儲存 cookie、password、key 或 bearer token 作恢復資料。
- 使用最小 own-schema forward-only 080 migration 持久化意圖與 fencing；不改 078／079 已套用 bytes。只改 ai_pdm_core，無外部 contract／角色新增；profile 只追加下一 ordinal 並綁精確 SHA。預設舊呼叫保留 test-only 語意。
- 測試失敗、撤銷、被較新版本取代、權限撤回、過期或被接手 lease 都不得啟用該版本；新版本失败時原 active 保持可用。完成回報可安全重試、不得產生重複 audit／啟用或重新跑已完成工作；未知結果先讀回。
- 主畫面一個 primary action 與一條進度，細節收合，撤銷保留 explicit secondary action。狀態顯示等待服務、測試中、套用中、已啟用可使用、失敗／需處理；只以原生 Document Manager capability heartbeat、job lease／結果、active reference 與精確 ACK 判定。2D preview heartbeat 不能冒充 Document Manager ACK。
- 等待但服務在線可用呼吸提示；測試／套用中的已知活動用 spinner；離線／stale lease／API 讀取失敗停止進行動畫並顯示原因。不得虛構百分比或完成；支援 prefers-reduced-motion、aria-live、鍵盤與窄視窗。
- 沿用既有 Windows worker polling／reconnect，完成測試後從 active broker 重新取得精確版本再確認套用，不回報 draft 為 active。提供一次設定的安全常駐啟動支援；實際主機／既有 workload credential 尚需定位，不能新增廣域 IAM 或讀取真 key。未提供主機／授權配置時僅交付本專案 tooling 並明示服務未在線。
- 授權修改 surface：settings-secret lifecycle／repository／新背景意圖 authority、既有 draft/test/complete route 與必要 heartbeat；settings-screen／相關 CSS／進度 helper；drawing-recognition worker 與 Windows 啟動支援；新增080、release profile 的 migration SHA、own isolated fixture；直接相關 meaningful unit/API/native PG/browser tests與QC source assertions；本 spec／dev_task／documentation_map／新 QA evidence。production slice 只在新必要 exact 路由時增加，禁止 wildcard。Root 是 PM 文件 writer，TL 定案期間只寫本節架構，之後唯一 RD 產品 writer。
- 驗證：fresh Principal permission 正反、同公司、duplicate/replay、legacy opt-in、lease takeover/stale、new-version supersession/revoke、test fail 保留 old active、typed audit/no plaintext、real isolated PG commit/rollback/rerun、UI 真實正常入口＋兩 viewport＋動作和 reduced-motion、worker broker exact ACK/reconnect。mock／測試替身僅證實控制流程，不宣稱真 CAD/GCP PASS。受影響 typecheck／db boundary／isolated build／release profile checks 與 required CI；候選凍結後獨立 Luna QC。

### 架構定案

定案 PASS，採一張 purpose-specific intent table、既有 probe queue 與既有 worker，不新增 generic workflow engine、排程服務或授權 fallback。本次 routing 沿派工 gpt-6.1-sol／high；主流程平衡、有限 QA／CLI QC gpt-6-luna／max，模型為派工 binding，非產品契約。以下是唯一 RD task package；實作後仍須獨立驗證，不能將本 source review 計為案例 PASS。

#### A. 持久化同意與精確工作

- 新 forward-only `db/postgres/080_dev122_settings_secret_activation_intents.sql` 僅建立 `ai_pdm_core.settings_secret_activation_intents`。最小欄位：id、secret_reference_id、probe_job_id、kind、company_id、consent_principal_id、consent_employee_id、consent_pdm_user_id、identity_issuer、identity_subject、profile_version、account_lifecycle_version、auth_epoch、authenticated_at、session_issued_at、requested_at、state、safe_result_code、activated_at、activation_test_run_id、updated_at。state 精確為 pending/activated/blocked/superseded；safe code 不含任意 exception/message。id 由 owner 產生；requested_at 使用 owner SQL 時鐘。Secret reference/probe/test-run FK、同意者 `(company_id, consent_pdm_user_id, consent_principal_id)` 的 own principal_accounts FK 使用 RESTRICT；不得 cascade 刪除 audit 或原 probe。
- 同意欄位、reference/job/kind 關係為 immutable；INSERT 必須確認 exact reference、job 的 reference/kind、typed company 與本人 current company 相符。reference 原 creator company/securityActor 必須有可驗 provenance，不能從 email、歷史 UID 或 NULL metadata 補造。company 不一致或 provenance 缺失 typed 拒絕。intent consent 與 078 job initiator 分開：不同合法同公司 Principal 可明確接續，但不得 UPDATE 原 job 的 created_by/company/initiator/profile/purpose。
- 一個 reference 同時至多一筆 pending intent；相同 owner command idempotency key replay 回原 intent/job。不同 command 接續同一 pending 工作回既有 intent/job，不覆寫第一位同意者；blocked/superseded 後重新同意建立新 immutable intent，明示新同意者。既有 active reference 不建立重複啟用 effect。expired probe 要經明確新同意後建立下一個合法 job，舊 row 保留。
- `autoActivate` 是 strict boolean，缺省/false 保留歷史 test-only；不得 truthy coercion。draft 的 provider addVersion 仍在 SQL transaction 外，且在前後均沿 existing Principal owner preflight/recheck。SQL transaction 內一次提交 reference + typed probe job + intent + audit/outbox；其中任一失敗全回滾，provider 已建立但未提交的 exact version 仍是未引用版本，不能稱 provider 與 SQL 分散式原子。未知 provider write outcome 不盲重送，不記 key/body/value；不新增 provider lookup 或自動刪除版本。
- supersession 以相同 kind 中最高 reference.version 的**明確同意**為準。新 test-only draft 不取消原 intent；舊 reference 的較晚 resume 不能倒序覆蓋較新同意。較新 pending intent 使較舊 pending intent superseded，但新 probe/activation 失敗不 retire 原 active。只保留既有 kind-wide 單 active 範圍，不藉此擴張成另一套 per-company active registry。
- 不保存 cookie、password、Secret payload、bearer token 或可重放 session。authenticated_at/session_issued_at 只是已驗簽 claims 正規化後的安全 barrier 比較資料，不是恢復登入憑證。瀏覽器關閉及原 session 到期不取消明確持久化委派；新的 auth epoch／logout barrier／account invalid-before、撤權、停權、版本/公司/subject 漂移可使待執行 intent blocked。不得以伺服器時間 requested_at 冒充原 authentication 時間。

#### B. 當前權限與交易原子性

- 新 `src/lib/settings-secret-activation-authority.ts` 的 `requireCurrentSettingsSecretActivationAuthority(snapshot, intent)` 是 private server purpose-specific authority。使用原 `JenfuPrincipalAdmissionRepository.requireActiveTypedPrincipal(issuer, subject)`、`JenfuAuthEpochRepository.readCanonicalPrincipalState(principalId)`、`JenfuPrincipalAccountRepository.requireActive(principalId)`、同公司 owned profile JOIN、`validatePrincipalPublishedGrantSnapshot` 與原 published catalog/shared evaluator。要求 principal/employee/account type/company/pdmUser/profileVersion/accountLifecycleVersion/authEpoch 精確匹配；原 authenticated_at 必須晚於 current revokedBefore，原 session_issued_at 必須晚於 account.sessionInvalidBefore；目前 published `settings.secret.manage` 必須 allowed。
- 背景 authority 不呼叫登入 session registry、不組造 `VerifiedPrincipalRequest`／session claims、不讀舊 token。`jenfu-principal-request-guard.ts` 僅在既有驗簽/admission 成功 output 加 normalized authenticatedAt/accountLifecycleVersion；不改 admission、session validity 或 producer。`jenfu-principal-permission-service.ts` 可抽取既有 evaluator 的 admitted actor/snapshot core 供 request wrapper 與上述背景 authority 共用，permission code/company/catalog/rolePriority/transaction timestamp 全保留；不提供任意外部 actor bypass API，不新增 ACL。
- 所有可能配置或改變 kind/version/active/intent 的 owner write 使用同一固定 kind 的 transaction-scoped advisory lock，再依 job → reference/intent 的固定次序鎖 own rows；只鎖 own object，不鎖 sibling directory/grants。draft 的 MAX(version)+1、resume、manual activate/revoke、auto complete 共用此 lock。worker heartbeat 只更新 job，不在持有 job lock 時再取 kind lock。claim 使用 SKIP LOCKED；任何其後需要 kind lock 的 effect 必須先釋放 claim transaction，再按統一次序開始 owner transaction。不能先 lock job/reference 再補 kind lock。
- `completeSettingsSecretProbe` 在同一 serializable owner transaction 完成 exact lease CAS、唯一 testRun、mark tested、intent fresh authority、retire prior active + activate target、intent terminal update、lifecycle event/audit/outbox。自動與手動啟用共用 `activateTestedReferenceInSnapshot` 的 exact tested/native-proof/provider/state gate；return DTO 同時含原 testRun 與 nonsecret workflow。已通過 proof 不使用較新、其他 reference 的結果；歷史無 intent 的工作永遠只 mark tested。
- **暫時性依賴/未知錯誤**（DB unavailable、directory/auth-state/catalog 讀取失敗、serialization/deadlock等）不當作拒權：整個 completion transaction 回滾，safe retryable error，worker 保留同一實際 native result、持續 heartbeat，在原 lease 內 bounded retry。原生 probe 已運行但 owner 未提交不稱完成；lease 失去後按正常新 attempt 再執行，不能提交舊結果。
- **已確認業務拒絕**（權限撤回、停權、barrier/version/company 漂移、revoked reference、superseded intent、probe failed/blocked/expired）保存 probe 真實 terminal 結果與 intent blocked/superseded 的 safe code，old active 不變，不發 activation audit。新同意才可重試已拒絕的啟用；GET 不 repair、不重新排 job、不自動放寬 authority。拒絕與依賴 unavailable 必須按原 typed error 區分，不能 blanket catch → blocked。
- manual activate 同交易 supersede 所有衝突 pending intents，避免背景覆蓋剛選定的版本；revoke 同交易把該 exact reference 的 pending intents blocked。自動 gate 不 resurrect retired/revoked reference。新表只對既有 runtime 給 exact SELECT/INSERT/UPDATE，不給 DELETE、owner/DDL/migrator 或 general grants。completion summary/resultCode 使用 server safe taxonomy／固定摘要，不把 extractor stderr、任意 worker message、key 或 token 寫入 receipt/audit/outbox。
- audit 保留 human consent initiator 與原 probe initiator 各自 identity/company/profile、workload executor id/purpose/capability、exact reference/job/attempt/testRun；使用現有 activated/tested lifecycle event types，intent requested/blocked/superseded 另寫 existing audit/outbox safe detail，不擴大 legacy event enum。原 `activated_by` 為 consent 的 owned pdmUser，不能填 workload 或捏造 session actor。

#### C. 協定、lease fencing、replay 與 rolling compatibility

- 沿既有 claim POST 增 strict `protocolVersion: 2`。新 worker 在 credential GET query、heartbeat/complete POST 傳 `leaseAttempt`，必須為 claim 回傳正整數 attemptCount，且與目前 DB attempt_count、locked_by、running status、60s current lease 全匹配；claim/probecredential 回傳 exact reference/version/fingerprint binding。provider read 前後都重驗該 fence。v2 heartbeat/complete 的 request handler 缺欄位或錯型別拒絕，不由 current attempt 偷補。
- 無 protocolVersion 的舊 claim 只取**無 pending auto intent**的 typed test-only jobs；舊 credential/heartbeat/complete 只對無 auto intent 的歷史手動測試相容。opt-in 時若舊 worker 已持有 lease，無 v2 fencing 的進一步呼叫 typed `PROBE_PROTOCOL_UPGRADE_REQUIRED`，不啟用；相同 job 等 lease 正常過期由 v2 takeover，不重写原 initiator。舊服務 rollback 不讀 intent，因此最多留下 tested/pending、舊 active 不變，不得承諾舊服務也會自動啟用。
- 完成提交保存 attempt/worker/exact reference 的 safe canonical result digest 與 testRun 綁定，可放 existing job/test-run metadata（新增 job completion_digest/test_run_id 等必要 receipt 欄位由080 additive提供，非改078）。replay 必須先讀 terminal receipt：same worker + leaseAttempt + normalized status/resultCode/readerVersion/summary binding 回原 testRun/workflow，不再 test/audit/activate；任一 mismatch typed409。不能把已提交 passed 因後續 heartbeat/網路錯誤改送 blocked。
- v2 worker heartbeat 持續到 completion 已確認提交／安全 replay，不能如現 source 在 extractor 結束即先停 heartbeat。network unknown completion outcome 先重送同一 fenced result 讀回，不重新跑已提交 native probe；retry 有固定次數與上限，lease lost/已 terminal mismatch 停舊 attempt。restart/reconnect 透過既有持久化 queue 而非前端重送 key。
- 為 opt-in already-passed 及服務 rolling 回復的安全續點，`resumeSettingsSecretActivation` 和 v2 POST claim 共用一個 bounded `reconcilePendingSettingsSecretActivationInSnapshot`：每次至多一個 eligible pending intent，必須有同 reference 的最新 typed passed proof + persisted testRun、非撤销/較新supersession、完整 current authority，按同 kind lock/serializable activation gate 執行。沒有合法 proof 不假造 result、不啟用，讓正常 probe queue 接手。這不是 GET mutation／新 generic scheduler；POST claim 的 technical purpose 維持 settings_secret_probe，human authority 仍來自 immutable intent。known block可保存，transient回滾由下一正常 poll重試。manual/test-only 歷史沒有 opt-in 不進此路徑。

#### D. 端點、進度与 worker 套用

| 現有端點 | 最小變更／不變邊界 |
| --- | --- |
| POST /api/settings/secrets/solidworks_document_manager/draft | 可帶 autoActivate:true；201仍包含 redacted reference，另含 intent/job/workflow。沿 existing settings.secret.manage owner command/idempotency；不回 Secret 值。 |
| POST /api/settings/secrets/[referenceId]/test | 可帶 autoActivate:true 作一次「繼續並啟用」；reuse same-company active typed job，或處理 latest passed proof；沒有 flag 仍 test-only。新 command key/idempotent response綁 exact reference，不重写 probe provenance。 |
| GET /api/settings/secrets | 純讀，同 Principal capability/company boundary。新增 nonsecret workflow DTO，保留既有 legacy readiness fields但不能拿2D readiness作新的完成判定。 |
| POST /api/settings-secret-probe-jobs/claim、[jobId]/heartbeat、[jobId]/complete；GET [jobId]/credential | v2 claim/fence/completion replay/小型pending reconciliation，保留 existing settings_secret_probe + solidworks_document_manager guard；credential保持private no-store，值不進進度/audit。 |
| POST /api/recognition-workers/heartbeat | 原 recognition_heartbeat + exact solidworks_document_manager guard 保留。exact active kind/version/fingerprint、status ready、server lastSeenAt 才是 ACK 候選。 |
| GET /api/preview-workers/solidworks-document-manager-key；既有 activate/revoke POST | active broker、manual authority不變；必要共用 kind lock/exact activation gate與intent invalidation。無新路由，production-slice不擴張。 |

- workflow 狀態由 intent/job/reference/current active + Document Manager heartbeat 合成：waiting_worker、testing、activating、awaiting_worker_ack、ready、blocked、superseded；不是 DB 任意 progress 字串。GET 至少回 referenceId/version、intentId/state/safeCode、jobId/status/attempt、leaseFresh、nativeWorkerOnline、lastSeenAt、exactAck。畫面簡化為一個 primary action、一條進度與收合明細；新同意的「儲存並啟用」不得由 CSS 隱藏實際 consent 語意。
- DM ACK 必須 current active reference.kind/version/fingerprint 精確、worker capability=solidworks_document_manager/status=ready、server時鐘 0≤lastSeen age≤30s。stale/blocked/degraded/2D heartbeat或只有有key不算 ready。若 latest DM heartbeat 非matching不可自動採用別種capability；可讀取matching currentactive DM heartbeat證實至少一個合法實際worker可用，但必須保留workerId與讀回規則，不能 newestwrongversion覆蓋精確ACK。較新active切換後舊ready不可套新intent。
- `run-drawing-recognition-worker.mjs.processProbeJob` 完成後重新走 active broker，核 exact active version/fingerprint，載入 existing native reader後才 sendCapabilityHeartbeat；不能用 credential draft object 作 ACK，也不把 env fallback 當 exact版本確認。reader command未配置/不可用則 blocked。保留原 credential/probe/extractor與原生結果，不新增 converter、不假metadataPASS。
- worker startup/reconnect使用既有poll/reconnect；新增安全 Windows launcher僅啟同repo現有worker、固定原生readers，workload ID/credential從受保護本機配置讀入（不放 argv／啟動task正文／stdout）；沒有已配置host/合法credential則明示等待服务。可交付當前使用者 startup tooling，但實際註冊／提升常駐必須綁已授權 own host、明示ownership及停用/cleanup，未知機器不自動註冊、不中止其他worker、不新增 IAM／身份。沒有在線worker時持久化queue等待，不承諾伺服器代跑Windows COM。
- 真正在queued且DM服務在線才有低強度等待提示；native running且leaseFresh才spinner；啟用已提交而ACK未到顯示套用中，若worker離線/read失敗立即停止進行動畫并說明。ready不由動畫結束推定；保留reduced-motion、aria-live、不重複送key/工作、兩viewport/keyboard。API讀取錯誤不顯示歷史cache ready作目前可用。

#### E. RD exact file/method package 與驗證出口

| Surface | 唯一責任與必要實作 |
| --- | --- |
| src/lib/settings-secret-lifecycle.ts | createSettingsSecretDraft/enqueueSettingsSecretProbe optionalauto；resume/reconcile/sharedactivate；complete/credential v2fence/replay；listStatuses新增DM workflow；manual/revoke共用lock。 |
| src/lib/repositories/settings-secret-async-repository.ts | intent CRUD/CAS/immutable readback、kind lock、latestconsented/version、fenced claim/heartbeat/complete/receipt；不改078provenance。 |
| 新 src/lib/settings-secret-activation-authority.ts | currenttyped/account/epoch/barrier/company/profile/publishedpermission；typed known denial與dependency fail distinction，不製造session。 |
| src/lib/jenfu-principal-request-guard.ts；src/lib/jenfu-principal-permission-service.ts | 只normalizedverified claims output與原admittedactor evaluator core共用；admission/ACL不變。相應現有test fixtures只補合法新增欄位。 |
| src/app/api/settings/secrets/[kind]/draft/route.ts、[kind]/test/route.ts、route.ts；settings-secret-probe-jobs/claim/route.ts、[jobId]/credential/route.ts、heartbeat/route.ts、complete/route.ts | strictbody/lease/schema；private no-store response/typed error；GET只讀。既有 activate/revoke route只在response workflow确有必要時同步，原Principal/workloadguard不改。 |
| src/components/settings-screen.tsx；src/app/globals.css；新 src/lib/settings-secret-workflow.ts | nonsecret progress/readiness projection、一次submit/resume、減法UI/animation/reducedmotion；不開其他設定pages，不持久key。 |
| scripts/run-drawing-recognition-worker.mjs；新 scripts/start-drawing-recognition-worker.ps1 | v2fence、completion boundedretry/readback、activebroker reload/DM ACK、startup/reconnect安全本機tooling；不改原C# extractor/probe業務、不讀真key。 |
| 新080；config/release/dev117-ai-pdm-independent-production-v3.json；scripts/dev117-ai-pdm-continuous-release.test.mjs；scripts/lib/dev122-own-postgres-fixture.mjs | append080/order30在既有29-entry完整prefix後、exactSHA；fixture079後加080；release test原tail079/order29改currenttail080/order30，舊prefix逐byte保持。不修改已套用078/079、DB roles或general grants。 |
| src/lib/settings-secret-lifecycle.principal.test.ts；jenfu-principal-request-guard.test.ts；新 settings-secret-activation-authority.test.ts／settings-secret-workflow.test.ts；直接上述route *.test.ts | 實際故障機制unit/API與network noeffects；freshdenial/依賴差異/legacyoptin/不同initiator/fence/replay/ACK。不得僅mirrorimplementation。 |
| src/lib/dev122-native-business.postgres-contract.test.ts；scripts/qc-dev-122-native-postgres.mjs；scripts/qc-dev-122-native-browser.mjs；config/local/dev122-native-postgres.v1.json | narrow settings-automation fixture/source selection；actual ownPG constraint/claimrace/commitrollback/duplicategrant/typed audit及真正常settings入口兩viewport，固定snapshot/no fakebusiness/evaluator。seam仍只既有exacttemplates，必要binding補verifiedsource，不新增foreignobjects。 |
| 新 scripts/lib/drawing-recognition-secret-workflow.test.mjs；scripts/qc-pdm-settings-center-secret-lifecycle.mjs；scripts/qc-pdm-gcp-secret-manager.mjs | originalworker orchestration/retry/no draftACK meaningful transportcases；static QC只改obsolete主流程binding，原caseIDs/安全語意保留、不用source regex冒runtimePASS。 |

執行順序：先schema/immutableconsent+authority → atomicdraft/optin+lease/replay → worker/DM ACK → 減法UI → narrowmeaningfultests/隔離native/browser。Root凍結/派獨立QC、type/boundary/isolatedbuild/release requiredgates；每個runtime仍freshGov/ownports/PID/data/repo/finallycleanup。Root持PMdocs/evidence、單一RD持產品/測試/runner，禁止同檔並寫。驗證矩陣至少證明：不同initiator原provenance不變、legacy無consent不啟用、permission/currentepoch/barrier/account/company各拒绝noactivation、dependency rollback+retry、doubleclaim/takeover/stalecallback、twointent競爭/舊active保留、samecompletion replay零重複audit、matchingDMACK與2D/draftwrongACK反例、reload/close後持久進度、offline/error/reducedmotion及兩viewport。所有mock/fixture層明標，正式GCP/key/原生CAD由人類驗證保持NOT_RUN。沒有待決產品架構項；實際host/合法workload配置未定位只阻該主機上線，不擴權、不阻本專案可完成source。

## R02 正式部署結果與人工驗收（2026-10-05）

2026-10-05 現行正式發布結果：R02 已由 app-owned V3 owner run [37262598122](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37262598122) 完成 RELEASED／FINALIZED；正式 ai-pdm-prod-52f421cb8db9 接收 100% 流量、0 candidate tags。官方來源 602413097ef27a203fe1e2beccac3166c6e2351a 來自正常 PR209 合併，PR／main required CI 均 SUCCESS。人類在本機安全頁完成既有 Firebase 帳號重新驗證，own numeric 6→7 與既有 GitHub production smoke Secret 更新成功；候選及 canonical 正常 SSO／authenticated probe 通過，匿名／撤銷 session 回 401。B 配置保留 jenfu-platform-prod 並另核 expected number 9536592944；三項已授權 own Secret／IAM 於 R01 APPLIED，R02 只沿用來源相容回執，沒有 historical workflow rotation apply。079 在 R01 已 forward apply，R02 0 applied／29 replayed／ledger 29。正式設定 UI 因工具限制 NOT_RUN；登入與 provider 證據不替代 key draft/probe/activation 或原生 CAD 屬性。這些由使用者正式驗證；F-01F NOT_RUN，7 issues／29 groups、整體 NOT_ACCEPTED。R01 401／UNKNOWN／安全中止證據保留。

[正式結案與層級限制](../qa/DEV-122-settings-production-closure-2026-10-05.json)。本輪只更新本 QA JSON 與三份 DEV-122 PM 入口，未變更產品、未再發布文件。下方舊 pending／未套用描述僅為當時歷史，不作新的施工 gate。

## HISTORY_ONLY：正式 R01 中止後的續點（2026-10-05）

R01 已安全中止於 verify：PR 207 正常合併至 697be61d51d105ec940ba594b57dac1c8f255ee6，required CI 37256330647 PASS；人類已授權並建立 exact SolidWorks Secret、add/access custom role、Secret-only runtime binding，provider readback PASS。Owner run 37258147467 的 prepare/build/migrate/candidate/entrypoint PASS，079 forward-only 已套用（1 applied、28 replayed、ledger 29），verify 因既有 smoke 憑證 Portal session 401 失敗。Recovery PASS／PRE_ACTIVATION_ABORTED，R81 ai-pdm-prod-ec2ae6647962 維持 100%，沒有切流。人類已選擇在本機安全頁輸入既有 Firebase 密碼；本輪只修復 reauth CLI 接受 clean detached exact official main，保留 source/repository、同 issuer/subject、Principal、fresh auth、numeric 6→7 與 readback gate。安全頁、憑證更新與重試發布仍 PENDING；401 根因 UNKNOWN，不能以版本輪替成功冒稱恢復。只限 AI-PDM／jenfu-platform-prod／asia-east1／ai-pdm-prod 及自有發布資源，禁止跨專案開發。真 CAD key/probe/activation/property 由使用者正式驗證；F-01F NOT_RUN，7 issues／29 groups及整體未驗收不變。

本輪 corrective file surface：scripts/dev121-smoke-credential-reauth.mjs 的官方來源 gate、對應測試，以及三份 DEV-122 PM 入口與本次 checkpoint；不改 Portal、帳號、Principal guard、079 或其他 migration。

[機器 checkpoint](../qa/DEV-122-settings-release-reauth-checkpoint-2026-10-05.json)。下方「待三資源核准／未 merge／未 apply」為先前 source freeze 歷史，不再是現行 gate。

## 現行發布修正與人工驗證契約（2026-10-05；優先於下方歷史本地邊界）

人類已明確指示「先修好金鑰設定入口並上線」，並更正原生 CAD 屬性是「由我在正式環境驗證」。本節自該指示後生效，取代先前本地-only／未授權 deploy 的執行限制；不追溯改寫既有證據與當時授權。

- 唯一開發專案仍為 AI-PDM；沿用同一 DEV-122 branch/worktree。canonical、移交與其他 owner 修改保護不變；禁止跨專案開發與 sibling source/release input。
- 已授權主動作：完成本 DEV 既有候選，修復正常金鑰設定入口，依 protected-main PR/required CI 與 app-owned V3 owner release 發布 AI-PDM。目標固定 jenfu-platform-prod / asia-east1 / ai-pdm-prod；canonical entry 為 https://ai-pdm-prod-9536592944.asia-east1.run.app。
- 原生 CAD customproperties、真 Document Manager probe 與真金鑰輸入由使用者於正式環境驗證；F-01F 保留 PENDING_HUMAN_PRODUCTION_VALIDATION / NOT_RUN。7 issues／29 groups 分母不變；不以 page 200、filename、Shell thumbnail 或部署成功作此用途 PASS。
- 停止本機密碼輸入／DPAPI 實驗。三份原始失敗、實驗來源、自檢與清理證據完整保留；未收取／讀取任何真 key。過時 direct-module actorId provisioning 不進新正式發布來源，也不替代 Principal 工作流。
- 官方 main 528429913272ceb3e8d77bb0fcf30d450c6fb368 已包含 settings.secret.manage 的 verified Principal owner command／probe provenance 與 migration 078。先前 93b9 起點的 legacy-auth 診斷只適用當時 source，不能套到最新 main；整合時保留該修正。
- 發布來源需要可追溯的乾淨 PR merge 與 fresh profile/source binding。077 是本 DEV 尚未套用的 forward-only migration；與官方 078 整合前核對編號、依賴、schema ownership、apply/rerun 與相容性。不得改 applied migrations 或手工寫正式資料。
- 設定開放採 exact /settings 與 /settings/security，以及 secret draft/test/activate/revoke、既有 purpose-scoped probe-worker 必要 dispatch；不得 wildcard 開放其他 settings、整合或 worker mutations。dispatch 不授予權限，正常 page/action 仍經 verified Principal、published capability/company boundary、same pinned owner transaction；workload credential/provenance 仍必須成立。
- HISTORY_ONLY／修復前正式服務 provider readback 證實當時沒有 PDM_SETTINGS_SECRET_PROVIDER、PDM_GCP_PROJECT_ID、PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID、PDM_ENABLE_GCP_SECRET_READS/WRITES。AI-PDM aipdm-prod Secret 名稱盤點未見 Document Manager 保管庫；歷史示例 pdm-solidworks-document-manager-key provider NOT_FOUND。只核對 metadata／名稱，未讀版本內容。
- source 可準備既有 Google Secret Manager provider 的 exact project/secret env 與最小 own-resource provisioning plan。新增 Secret container／IAM 不從一般 release 授權自行擴張；具體 plan 與 affected checks 完成後才處理此新增資源 gate。不得 broad IAM、Secret Admin、key value 入 Terraform/state、secret destroy／disable 或 sibling mutation。
- QA：沿原有效證據的 source applicability，只重驗整合與設定受影響層。必須證明正常設定導航、允許／拒絕 Principal、精確 gate 正反例、非秘密狀態與 worker readiness、失敗訊息、無 key 洩漏；改 release adapter/profile 後跑專案必需六項檢查。不可提交假金鑰到正式 provider；真 key 操作與 native CAD properties 留人類。
- 正式驗證：Root 驗證 exact serving revision/canonical entry 及修復後設定入口；使用者輸入 key、查看 probe/activation 狀態並驗證 CAD properties。若正式 worker 未在線，UI 必須如實顯示，不宣称可用。新 runtime/UI 全部 task-owned、隔離且清理；未知 write outcome 先 provider readback 再重試。
### 設定入口／發布配置 RD 精確實作契約（latest-main 已整合）

Root 已將 latest main 整合至 7a8f156198f1628a86f91adbee1a22c8e8084f9a，dirty=0；原產品候選未被覆蓋。唯一產品寫入者 RD，可修改以下 surface，其他變更先回 TL：

- src/lib/production-slice.ts、新 src/lib/production-slice.settings.test.ts；必要的 src/components/settings-screen.tsx／其 targeted test、src/app/api/settings/route.ts。只開 /settings、/settings/security 與既有秘密四 POST（draft kind 固定 solidworks_document_manager；test/activate/revoke exact reference）、probe claim/job heartbeat/complete 與 recognition-workers heartbeat。錯 method/path、其他 settings、unknown slice 維持拒絕。Settings UI 若顯示仍 blocked 的其他分頁／整合 tile，利用既有 slice status 明示未開放或不提供可操作 CTA；不得擴放它們。
- src/lib/settings-secret-lifecycle.ts／既有相關 targeted tests：僅修正已配置 GCP 但尚無 reference 的誤導文案，區分配置／真金鑰版本／worker 在線；不改 owner Principal command、probe provenance、state machine、provider 寫入或授權。
- config/release/dev117-ai-pdm-independent-production-v3.json、scripts/lib/dev117-ai-pdm-continuous-release.mjs、scripts/dev117-ai-pdm-continuous-release.test.mjs：required/fixed plain env exact 新增 PDM_SETTINGS_SECRET_PROVIDER=google_secret_manager、PDM_GCP_PROJECT_ID=jenfu-platform-prod、PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID=aipdm-prod-solidworks-document-manager-key、PDM_ENABLE_GCP_SECRET_READS=true、PDM_ENABLE_GCP_SECRET_WRITES=true。它是 server-side exact-version lifecycle，不能把真 key 或 latest 注入 env、release receipt 或來源。
- 尚未套用的 db/postgres/077_dev121_canonical_review_lifecycle.sql 改名為 db/postgres/079_dev122_canonical_review_lifecycle.sql，bytes SHA256 08b4f287bc66a5ab48c8dcdcd45f064d49333fa32737c8d75400e51b0b836be6 不變。官方 profile 已以 078 結尾，migration runner 要求完整 applied-ledger prefix，因此禁止把 077 插入它前方或放寬 forward-only validator。新 profile 在完整既有 28-entry prefix 後追加 order29/079；原078 path/order/hash不改。scripts/lib/dev122-own-postgres-fixture.mjs 的新隔離執行順序為既有 baseline、065–076、078、079；077 舊名僅在歷史備份/收據保留。另允 scripts/qc-dev-122-native-postgres.mjs 的單一 active diagnostic source-binding path 077→079，以及 src/lib/dev122-native-business.postgres-contract.test.ts 的同一 CHECK 案例標題 077→079；測例查詢／驗收／case數不變。每個新 fixture 必須含 actual078；source bytes及apply/rerun另綁定。
- 新 infra/google-cloud/dev-117-production-release/solidworks-document-manager-secret.tf、既有 config/release/dev117-production-release-infra-plan.json 與 infra README：只準備 APP_INFRA_B 的三項 additional addresses，A 不变／不重跑。exact secret aipdm-prod-solidworks-document-manager-key（deletion protection、prevent_destroy、auto replication、既有own labels）；project custom role aipdmSolidworksDocumentManagerRuntime，permissions精確只有secretmanager.versions.add、secretmanager.versions.access；該 role 只綁此Secret到現有serviceAccount aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com。與既有 B 相同 incident_runtime_enabled gate。無版本/value、無 project-wide member、無 rotate/delete/destroy/admin、無 sibling。只寫 source／本地validate plan，不apply；native full-module provider plan須證其他地址read/no-op、只三項create，再取得新增資源授權。

### QA 缺口補正與設定 UI 實驗契約（2026-10-05）

- RD 可補 src/app/api/settings/route.principal.test.ts；一般 settings.manage 保留設定摘要，secretManagementAvailable 必須另核 verified Principal 的 settings.secret.manage，且與摘要同一 pinned snapshot/company。UI secret status 讀取失敗一律停用金鑰表單，不索取或提交使用者金鑰；不得改或擴張 authorization helper／role catalog。
- RD 可更新 scripts/qc-pdm-gcp-secret-manager.mjs 的 GSM-023/024：刪除已被官方 main 取代的 legacy Admin／requireRoleAsync 斷言，改核現行 exact Principal capability、owner command、redaction 與 no-store。保留 case IDs／其他驗收；另允 GSM-015 等同檔 UI source binding 由已抽離 wrapper 的 src/app/settings/page.tsx 改 actual src/components/settings-screen.tsx。scripts/qc-pdm-settings-center-secret-lifecycle.mjs 同樣可逐一將官方 main 已淘汰的 Admin／requireRoleAsync 與 wrapper UI source 綁定更新到 actual Principal capability／owner command／SettingsScreen，保留 case IDs 與其語意，不跳過或降低 gate。任何非 source binding 的驗收差异先回 Root。這是 source static QC，不冒稱 production secret write。
- harness RD 由既有 dev122_native_qc Agent 負責，專用 surface：scripts/qc-dev-122-native-postgres.mjs、scripts/qc-dev-122-native-browser.mjs、src/lib/dev122-native-business.postgres-contract.test.ts。產品 RD 完成 079 source-binding 後交出這三檔，兩者禁止同檔並行寫入。
- 僅新增固定 settings suite／flow。隔離 PG 先經未修改 migration source 的 baseline／foreign-key／root-count invariants，既有 catalog v5 的 pdm_admin 作 employee/workspace/company-jenfu 原始 grant，保留 version/id/time 同版本 published snapshot 與 producerBoundary FIXTURE/readback/ledger。不得以 system_admin principal/global 假作 employee、不得變更產品 catalog、不得補權限 fallback；拒絕 actor／另一公司要獨立且合法初始設定。既有 full/lifecycle/files flow 不改 grant 或 case semantics。
- settings prerequisites 只建立 lawful initial identities／signed sessions與 viewport fixtures，不建立 key/reference/probe結果、不建立 Part/Drawing發行結果、不 seed primary。實際 Next fixture只開 exact official-numbering-draft；GCP provider/write/read 在本機均不得呼叫，無真key。
- actual UI 在 1440×900／390×844，以正常側欄導航到 settings→security；核 password empty、可操作權限、未開放分頁／tile、無版本與 worker 未就緒文案、鍵盤／overflow、允許／拒絕Principal與company、正常GET statuses。全程不填 password、不送 secret draft/test/activate/revoke；status須來真 route/native PG，不攔截供給成功status。截圖/請求結果保留；僅計實際完成案例，skip非PASS。若本機 provider 關閉，只能驗該 blocked狀態，configured-GCP/no-version來源單元證據另列，不能假作GCP連線。
- 先做 harness source/static 收斂；Root 全來源 freeze 後才依 fresh容量lease、預宣告 own PG/Next/browser process/ports/data/repository，啟 task-owned bounded runtime並 finally 清理。人類正式 native驗證仍 NOT_RUN。
RD 可先 syntax/targeted static checks，完整 QC 在 freeze 後派出；每次 runtime 仍須標 own project/port/PID/data/repository、來源、fresh容量lease與finally清理。Release-adapter六項：test:dev-117:continuous、qc:dev-117:continuous、test:dev-117:abort、check:db-boundary、typecheck:app、build:isolated。qc:dev-117:continuous 已內建後四項，引用實際子命令結果即可，不能再無理由重跑build。新真金鑰／原生probe/property成功不由RD或QC執行；人工正式驗證仍 NOT_RUN。
### B 方案：文字請求 ID 與 canonical 專案編號分離（2026-10-05；本輪現行契約）

人類已明確更正「改採 B 方案：保留文字 ID，另設預期專案編號，provider 分開處理請求路徑與回傳版本驗證」。因此先前將 PDM_GCP_PROJECT_ID 改數字的 A 提案改列 HISTORY_ONLY／NOT_APPLIED；原兩次自動審查拒絕與收據保留，不套用 A patch。B 實作與必要 same-project 驗證、既有 PR207 更新已授權；三項新增正式 Secret／IAM 在該 B 指示當時仍待人類明確核准；後續人類另行核准並已由 R01 建立，見上方 R02 結案。

- 請求 ID：PDM_GCP_PROJECT_ID 固定 jenfu-platform-prod，Cloud target／Terraform／IAM／GCS 維持原目標；另新增 server plain env PDM_GCP_EXPECTED_PROJECT_NUMBER=9536592944，required/fixed profile 以既有 target.projectNumber 核對。不得用 request ID、API 回傳內容、ADC、任意 alias 或動態 metadata lookup 推導 expected number。
- Provider config 使用獨立 expectedProjectNumber。缺少或非 canonical 正整數的 expected number 必須 fail closed，constructor／env 設定拒絕先於 auth/fetch；不放寬 secret/version matcher。add 請求以 projects/jenfu-platform-prod/secrets/<exact-secret>:addVersion 發出，只接受 projects/9536592944/secrets/<same-secret>/versions/<canonical-positive-number>，保存該 canonical reference。
- access 先驗輸入 canonical reference；只取其中 exact version number，以 request ID 建 access URL。回傳 response.name 必須等於該輸入 canonical reference，核對成功才解碼 payload。wrong project（含 request named ID 作 reference）、wrong Secret、latest／其他 alias、0／leading-zero／缺失版本、wrong response version／缺失 response.name 均拒絕；無效輸入與 config 不發網路請求，不輸出秘密或 provider raw error。
- 唯一產品寫入者 RD；allowlist：src/lib/google-secret-manager.ts、新 src/lib/google-secret-manager.test.ts、config/release/dev117-ai-pdm-independent-production-v3.json、scripts/lib/dev117-ai-pdm-continuous-release.mjs、scripts/dev117-ai-pdm-continuous-release.test.mjs、scripts/qc-pdm-gcp-secret-manager-runtime.mjs、scripts/qc-pdm-gcp-secret-manager.mjs、.env.example、scripts/start-localhost-3000.ps1。後兩檔只同步 expected number 的設定／就緒判斷；static QC 保留原 IDs 與驗收語意。原 runtime 9 案例保留，新增 B 正反例，不增加 DEV-122 的 29 組分母。越界先回 Root，不改 settings UI／Principal guard／角色 catalog／schema／migration／infra／跨專案內容。
- QA/QC：真 provider 不可呼叫、真 key 不接收；mock transport 必須同時證明 named request URL、numeric canonical add reference、numeric input named access URL，以及 access response exact-name 核對。release positive 固定兩值，missing／foreign／named-as-number／invalid number／numeric-as-request ID profile 與 readback drift 均拒絕。對 getConfig／constructor 與 write/read gates、stable redacted provider faults 保留回歸。unit／mock 不冒充真 GCP、UI、native、正式 PASS。
- Root freeze 後執行 affected provider unit/mock/static 與六項專案 release 檢查（continuous QC 已實際覆蓋 abort／DB boundary／typecheck／isolated build 时不得重複 build）。每個 runtime 預宣告 own project／PID tree／ports／PDM_DATA_DIR／PDM_REPOSITORY_DIR、來源与 finally 清理；build 做 fresh capacity preflight，不清 primary。獨立 QC 維持 gpt-6-luna；既有 UI／native8 證據按未受影響 source／layer applicability 保留，F-01F 由使用者正式驗證／NOT_RUN。

### B實作與受影響層驗證收斂（2026-10-05）

B方案已完成：PDM_GCP_PROJECT_ID=jenfu-platform-prod保留，另設PDM_GCP_EXPECTED_PROJECT_NUMBER=9536592944；named請求／numeric canonical回傳分開嚴格核對。clean受測HEAD165a53f0bbcfbb9e54049c191505147936fcfaee已整合官方main46438028。unit83/83（Google57＋Principal26）、static36/36、mock27/27、release134/134及六項必要release檢查（QC97、abort6、boundary、typecheck、isolatedbuild）PASS；獨立gpt-6-luna QC為B_LOCAL_QC_PASS_REQUIRED_CI_PENDING_THREE_RESOURCES_PENDING_APPROVAL。新B required CI待同一草稿PR207刷新，舊b89 CI僅歷史。A未套用、不再待配置核准；僅三項新增正式Secret／IAM待明確資源授權，未merge／apply／deploy。真key/probe/activation及CAD properties由使用者正式驗證；F-01F NOT_RUN，7 issues／29 groups不變、整體未驗收。

[source freeze](../../output/qa/dev-122/DEV-122-gsm-b-source-freeze-2026-10-05.json)保留當時NOT_RUN_AT_FREEZE；[最後LunaQC](../../output/qa/dev-122/DEV-122-gsm-b-final-luna-qc-2026-10-05.json)由Root保存獨立Agent回覆，SHA256 628f6f88dda39ba883fb7adc145fa84d446f34fa39bea5bed8cf02891be31fc8。focused綁8項產品檔（.env.example不在該unit binding），完整freeze及release/checks另核九項hash；不補造unit binding。

父／子程序、own temp/build runtime及lease已清理，primary兩SQLite前後ABSENT只證absence不變。fresh2GiB lease允許並釋放；outer maxObserved bytes不能代表inner build完整峰值。六項local檢查對165來源有效；後續三份PM metadata不改產品/config/deps，freshHostedCI綁最終候選。舊UI/native8僅依未變source/layer沿用，101skip非PASS；mock不作真GCP/CAD證據。

[本輪唯一待核准三資源](../../output/qa/dev-122/DEV-122-gsm-b-production-resource-approval-plan-2026-10-05.md)為exact ownSecret、add/access customrole、該Secret-only runtime binding。既有owner正式發布授權延續，不重問。下方B前FAIL、A提案與當時pending狀態保留歷史，不作新gate或PASS。

### 歷史 A 提案／UI bounded 診斷（2026-10-05；A 已由 B 取代，未套用）

- Root 唯讀核對自有 aipdm-prod-session-current Secret 與 version1 metadata，正式 provider canonical name 均使用 projects/9536592944。目前 literal exact-version 比對搭配 named project env 會拒絕該合法 response；唯一最小修正為 PDM_GCP_PROJECT_ID=9536592944，validator 以既有 exact target.projectNumber 核對。這是尚未套用的具體修正提案：source 仍保留上方 named ID；兩次 auto-review 拒絕後須人類明確核准，再套用並通過 affected checks 才取代該 binding。Cloud target、Terraform、IAM、GCS projectId 仍為 jenfu-platform-prod。不得放寬 adapter resource matcher 或接受任意 project alias。
- 產品 RD 新增 scripts/qc-pdm-gcp-secret-manager-runtime.mjs allowlist：保留原9案例，追加 mock canonical numeric add/access 與 foreign project／foreign Secret／latest 拒絕，拒絕項不得發出 access request。其他 source surface 沿用原 exact allowlist。不可呼叫真 Secret provider、不可輸入真 key。
- 原 settings UI run5cbd7ab10f03e0b4 在 allowed state 後無進度；Root fingerprint-gated 只中止 own browser child，inner runner 正常 finally 已核 children／PG／ports／temp／lease 清理。此 run FAIL，browser原 RUNNING/0cases與raw保留；不能從 server403或截圖宣告 denied case PASS。
- harness RD 僅於 scripts/qc-dev-122-native-browser.mjs 增加 settings stage enter/done diagnostics、await／response body／context/browser close bounded 超時與 failure-before-cleanup 保存；必要 native runner own fingerprint cleanup 仍只限原3檔。保留實際 route、合法拒絕 Principal、company隔離、原 assertions／case IDs／分母，不可 mock、跳過、放寬 guard 或回填成功。其他 flow 行為不改。
- QA 僅刷新受影響 mock transport、release profile／validator與專案既定六項；現有 app/SQL未變 evidence 按檔案hash沿用，native8項root guard補驗 actual078/079。新的兩viewport設定UI須實際完成並清理才可記PASS。原生CAD／真key／probe由人類正式驗證仍NOT_RUN，29groups不變。
### 設定拒絕畫面與獨立 HTTP 回應對照（2026-10-05）

9419559377bbfde6 已證 native UI403 headers/拒絕DOM/無password，但Page CDP的response.text/json逾時；該FAIL與原body UNKNOWN保留，不推定產品body壞掉或成功。未修 product／actor／grant。Root定案最小harness測量方法：正常same-Principal reload核實403、application/json與private/no-store headers、拒絕DOM與password不存在；同browser context cookiejar另發real HTTP GET /api/settings（30s、禁止redirect）核完整rawText與原exact permission_not_granted。兩請求分開local evidence IDs、時間、actor／viewport／method／URL／headers及body來源；fresh body不得回填original Page Response，原UI bodyCapture明列NOT_REQUESTED_NOT_CONSUMED_BY_PRODUCT，原body code不宣已讀。

browser response observer僅explicit denied phase＋GET /api/settings＋403＋JSON/no-store此精確情境保存pending header-only observation；healthy只有成功獨立same-session HTTP＋actual拒絕DOM＋同viewport/actor/path各吻合才可接受對應console403。其他error照原full body/timeout/FAIL，不能任意接受403、不攔截供給body／status。改動僅原browser allowlist的observer、denied step、healthy分類，兩viewport／case IDs／company HTTP拒絕／zero-secretPOST／ownedPG rows before-after／cleanup不變。未獲新plan資源授權與numeric fix仍阻擋release；此測量修正不造成source/profile/infra／授權擴張。
### 本輪設定入口驗證結果（2026-10-05）

新 e1c041c4f1bba741 的正常 UI 在 1440×900／390×844 共2案例 PASS；prerequisite native 1／1。允許 settings／secret status GET200、拒絕UI403／DOM無password、獨立same-session HTTP403 permission_not_granted及other-company entitlement_scope_mismatch各自保留。password保持空、secret mutation request=0、鍵盤與overflow通過。本機 provider 沒有真配置／關閉reads與writes，此層只證本地blocked狀態，不證真GCP連線。163 own table rows相同；snapshot含nonce，before／after hash不同。source unchanged，所有ownbrowser／Next／PG／parent／port／temp／lease finally完成，[fresh OS cleanup readback](../../output/qa/dev-122/DEV-122-settings-ui-final-cleanup-readback-2026-10-05.json)另核exactPID全absent及三埠無listener。原5cbd與941的FAIL／UNKNOWN沒有回填或改寫。

078/079 root／rollback native regression ac875c398fb97ddc為8／8、101 skip不算PASS；focused85／85、release實際134／134、static/mock34+36+9與專案必要release checks以原來源hash沿用，原reporter wrapper FAIL保持。整體PARTIAL_NOT_ACCEPTED只表示DEV尚未完成，不能改成Production或CAD PASS。provider numeric修正與三項新資源仍待具體核准，F-01F保持PENDING_HUMAN_PRODUCTION_VALIDATION／NOT_RUN，由使用者於正式環境自行驗證。
### Required CI 的預覽夾具補正（2026-10-05）

草稿PR207／db8eb7832cccd3ab18f08043448a0213f5752a18的required CI run37232762876：DEV-012 Isolated PostgreSQL Cutover通過；Production Slice QC在原109-case batch有1FAIL（fa.content_hash missing）並略過後續owner artifact驗證。原raw與FAIL保存於output/qa/dev-122/ci-37232762876-original-failure，不回填成功。TL核實db/schema.sql本來有content_hash／file_ext；第一個principal preview :memory: fixture缺少兩欄，是縮減測試schema未同步合法source predicate。

首次fixture修正只補src/lib/preview-derivatives.principal-provenance.test.ts第一個SQLite DDL／seed：content_hash TEXT與file_ext TEXT NOT NULL DEFAULT ''，沿既有source常數。隔離補驗12案例為11PASS／1FAIL，missing-column已消失，新FAIL為舊wrong-company claim斷言期待failed，而現行guard拒絕且維持queued；原preview-fixture-focused-29a1dc558a32023b失敗／清理不改寫。

TL與獨立Luna核對：既有D05明文other-company／replacement-source不變，native `worker claim excludes native company source input without effects`也要求job:null／full owned rows unchanged；新SELECT與CAS source predicate在claim前拒絕wrong-company，因此舊failed mutation期待已失去source applicability。歷史native7ea77664127659d6確有該case PASS，但缺dirty-product hash完整綁定，只作歷史支持，不宣current native PASS。最小第二修正仍只同一test檔第一case：保留claim:null，在claim前取得完整preview_jobs row、核wrong-company queued input，claim後核整row equality；此檢查涵蓋status／attempt／locks／provenance等不變，強於舊兩欄檢查。其餘enqueue scope/conflict拒絕、foreign derivative null及invalid running completion exact fail均保留；5 case IDs/count不變，不改product/schema/migration或降低guard。再次補驗既有5＋7案例、Luna獨立QC、同一草稿PR required CI。全程task-owned隔離data／repository、port none、bounded5minutes與PID/temp finally清理。numeric provider補丁／新增Secret/IAM仍未核准，不merge／deploy；human native NOT_RUN／7 issues／29 groups不變。
第二修正ce6c29bf06b852eeaa829263effbbe26ee7374e320ad18490fa4bc9a0042f8b1已在preview-fixture-focused-85e07554830328b9實跑12／12、0FAIL／0pending，source before/after不變、primary兩路徑ABSENT不變；verified parent/child PID與own temp均已退出／移除，Governor runtime released。這只證focused unit regression，不替代native/current Production或原生CAD，仍待獨立final QC与provider required CI。

## 本輪目標、來源與執行邊界

本輪目標是完成 AI-PDM DEV-122 的本地開發與驗收：讓新 Part 能由正常 Principal 工作流申請首次發行，讓 Drawing major 核准的 canonical 與 master 狀態一致，修正原 native 測例並提供 AI-PDM 自有隔離 PG 驗證；附件／worker 與 procurement 500 同樣留在本 DEV，依 source 調查、必要修正及本地驗收收斂，不能在 lifecycle 局部 PASS 後任意延後並宣稱整個 DEV 完成。

- 唯一專案：AIPDM；canonical repository：C:/VIBE CODING/AI_PDM。
- 本輪 execution worktree：C:/Users/user/.codex/worktrees/dev122-internal-functions/AI_PDM；branch：codex/dev122-internal-functions；起點 HEAD：93b9b4cf67444d461aaa8934b8b1616537301b38。
- 人類來源：2026-10-03 指定 AI-PDM native DEV 集中一般功能問題；2026-10-04 授權獨立候選移交並接續完成 DEV-122 本地開發。此次範圍限 AI-PDM，禁止跨專案開發。
- 發現來源：AIPDM/DEV-121；JENFU/DEV-015、ORGMASTER/DEV-057 僅為歷史來源引用，不是本聊天的執行權限或 runner 入口。
- [移交紀錄](../reports/pm/DEV-122-worktree-transfer-2026-10-04.md)與[機器收據](../qa/DEV-122-worktree-transfer-2026-10-04.json)綁定 19 個程式／測試／未套用 077 候選，加 3 份直接文件及 2 份移交證據，共 24 dirty paths。保留其他人的候選；不移入 DEV-121 其餘工作。
- PM／TL 文件階段只寫本 spec、dev_task 的 DEV-122 與 documentation_map 的直接入口；不改程式／測試、不啟 runtime。RD 的 file surface 與 phase 進入條件已由下方 Closure Review 定案。
- 本地 lifecycle、跨層 API／UI 與隔離 migration 屬 Medium lane。Production、遠端 DB、IAM、deploy、正式資料修補及其他專案 source／tests／runner 不在本輪授權內。

本地 DEV 出口必須涵蓋全部 current issue，證據只支持實際執行層級。正式環境異常與 Production bytes L4 不因本地通過而改為 PASS；若其根因或必要功能在本地仍未收斂，DEV 保持執行中／驗證中或明列局部阻塞。文件 ready、候選移入、資源 readback 與測例修復不等於產品完成。

## Scope 與 out of scope

Scope：D122-03 Part first_release、D122-04 Drawing major master 同步、D122-QA-01 測例及自有 native PG runner；D122-05 現有附件／一般 worker 用途與功能缺口；D122-06 procurement release 列表可用性。D122-01／02 僅作回歸，除非新 source／正常入口出現新復現，不重開為 current 缺陷。

Out of scope：修改 OrgMaster／Jenfu-Platform 或其他 repo；讀 sibling checkout 作實作、migration 或 runner 輸入；修改 producer 身分／grant 契約；UID、email、profile role 授權 fallback；新增 Principal ACL；正式 migration、人工 SQL／資料改 Released、production release profile、雲端 mutation、worker 外部部署、採購 consumer 專案實作、無關重構與原不可達防禦性 guard。未套用的 077 保持本地候選，合併前重查 migration 編號，不追加 DEV-121 Production allowlist，不改 applied migration。

## Current Architecture Impact 與既有契約

受影響面是 Part work intent → immutable review package → owner approval transaction → formal／master lifecycle，以及 Drawing major revision → production pointer → legacy master read-model。UI/API 需呈現同一 intent 與 basis；readiness 下游讀到的是同交易已持久化結果。新首次發行不靠 formal anchor 或欄位 generation 推定。

[DEV-121 Principal-only 契約](DEV-121-target-authorization-boundary.md)仍是身分、安全與 shared evaluator 權威：verified Principal、published grants、company／resource scope、不同 Principal reviewer、same snapshot／pinned write transaction、current grant 重驗與 receipt／outbox／worker provenance 不變。本 DEV 新 lifecycle effect 沿用這些邊界；既有 effect 的 publish 防漏與可靠發布 validator 已合併來源仍留 DEV-121。Spec Impact Preflight 結論：Compatible exception，將該契約已交給 DEV-122 的一般功能恢復為本地 current phase；沒有取代身分契約，也沒有恢復歷史跨專案或 Production 指令。

| Issue | Current disposition 與完成責任 | 已知來源／證據及限制 |
| --- | --- | --- |
| D122-01 | resolved／regression-only；Part read-model owner。既有工作 matrix 載入、編輯及重載正常，JSON object 與字串解析均不發生 503。 | part-number-matrix-async-repository.ts；歷史 R25/R26，舊證據不作本 variant PASS。 |
| D122-02 | resolved／regression-only；Part UI owner。idle／blur 儲存後改回原值仍 PATCH，重載符合最後一次成功儲存。 | part-number-matrix-workspace.tsx；歷史 R26，失敗儲存不算 saved baseline。 |
| D122-03 | current／candidate retained，RD → native PG →正常 UI 驗收；Part owner。 | part-change-work.ts、part-change-work-async-repository.ts、matrix UI／repository；first_release、basis v2、CAS 與 same-tx Draft→Released 已有候選。舊 58 focused PASS 僅為舊 slice；原 5-case native partial FAIL／UI NOT_RUN 保留。 |
| D122-04 | current／candidate retained，RD → native PG →正常 major／minor UI 驗收；Drawing owner。 | drawing-revision-work.ts、drawing-revision-work-async-repository.ts；候選凍結 exact master link／status／hash。歷史 focused 37/37 為 agent 回報，major native／UI 尚未驗。 |
| D122-05 | current／bounded investigation →必要修正→本地驗收；file／worker owner。先列現有 caller、purpose、metadata／bytes／output 契約；不以沒有新復現宣稱完成或無儲存。 | file-storage.ts、google-cloud-file-storage.ts 及現有 caller；[R75 readback](../qa/DEV-121-business-storage-provider-readback-2026-10-03.json)只證 bucket／exact create-get IAM。application activation／Production bytes L4 NOT_RUN。歷史 CAD COM 0x8002802B／TYPE_E_ELEMENTNOTFOUND 是環境訊號，沒有產檔，非已定案產品根因。 |
| D122-QA-01 | current／test defect repair + AI-PDM native isolation，QA／runner owner。先核對測例與 domain failure envelope，再重驗 drift、fault rollback／replay。 | principal-work-review-owner-grant.postgres-contract.test.ts：readback SQL 字面值 dev087:review.decision 被 normalizer 誤讀 named parameter；fault 原預期 500／503、歷史實際 400。歷史當時未證產品 defect；本次 source trace 已定案未知 fault 的共同分類缺口，須修為 exact 500，不能只改成實際碼讓案例過。 |
| D122-06 | current／bounded source investigation →必要修正→真實 route／native PG 驗收；integration read-model owner。保留 schema_version=1、Released package links 與公司／權限邊界；不退役用途。 | GET /api/integrations/procurement/releases →handoff-async.ts／handoff-async-repository.ts →detail hydration。2026-10-04T00:28:01Z Jed 自有 query 正式回 500／非 JSON；MAXIMA 403 numbering_permission_denied 是預期拒絕。正式 source d55ceeaf67748663da3d107e2c904034e9f40bf4；根因及實際外部 caller 未核實。 |

## Current Phase RD Handoff Contract

### D122-03：Part first_release

1. 正常建立 Part 產生 Draft formal anchor；ordinary edit 核准只更新欄位／generation，保持 Draft，不把 anchor 當作 Released。
2. Draft、合法狀態、同 owner/company/root 且具 current grants 時，可在既有 Part 矩陣明確選取「申請首次發行」。intent 必須由 server 持久化為 edit／first_release，失敗不在 UI 假裝已儲存；release-only（欄位無差異）也可送審。
3. 送審凍結 basis v2 的 intent、exact master id/status/hash、formal/work row version 與 payload／package hash。reviewer 正常審核包能辨識「首次發行核准」，不能從當前 mutable row 重建送審事實。
4. 核准在 owner pinned transaction 重新驗 verified Principal、assigned reviewer、不同 Principal、current decide/publish grant、work/formal/master CAS。全部成立才同交易更新 formal／master Draft→Released、approval_context、terminal receipt 及既有 audit/outbox；非 first_release 不產生此 effect。
5. 退回修改不發行，重送使用新的 basis。撤權、錯公司／root、漂移、terminal／invalid、同 owner 自審、缺適格 reviewer 均明確拒絕，不能復活、fallback 或部分寫入。並行與相同 idempotency replay 最多一個發行 effect，fault 需證完整 rollback 及 fresh retry／terminal replay。

### D122-04：Drawing major master 同步

1. 保持既有 major／minor 語意：major 核准可產 released revision 與 production pointer；minor 不發行、不誤改 legacy master 為 Released。
2. major basis 凍結 exact canonical→legacy drawing_numbers master link、status/hash、revision／work version、company/root／Part 邊界。缺失、多義、不一致、terminal／invalid 或不可合法發行的映射需拒絕，不擴大搜尋範圍或改寫無關 master。
3. 核准沿既有 current publish 重驗，在同一 owner transaction 完成 revision、pointer、master Released、receipt/audit。任一 CAS／grant／basis 漂移拒絕且所有目標不變；故障 rollback、重播與並行都需 DB readback。
4. 正常重載的 canonical 與 master 狀態一致；合法本地發行資料能通過既有技轉 readiness，Draft／minor／不一致資料仍拒絕。不得靠合成 Active／Released seed 填補 lifecycle 結果。

### D122-05／06：本 DEV 的後續 bounded phase

D05 先用 AI-PDM source 建 caller→purpose→storage／worker output 清單，區分已落地能力、產品缺口、驗證環境限制與未知。現有附件正常上傳／重載／下載需證 metadata、bytes hash／size、company/purpose/initiator/generation 一致；worker 用途需證既有 enqueue／claim／completion 或明確失敗與恢復，不把 placeholder、resource-only readback、純 mock output 或沒有 CAD output 當成功。若完成用途依賴未授權遠端服務、外部 worker 或 CAD 環境，留下精確局部 blocker 與恢復條件；可修的 AI-PDM source 與本地案例繼續，D05 不因此自動 resolved。

D06 先追 list query、detail hydration、package/files/approvals mapping 及 PostgreSQL 相容性；以 AI-PDM 真實 route＋service＋native repository 重現，必要時修正 source。authorized company 應回 JSON schema_version=1、合理 count／entries、正確 Released package links；空白與 limit/since/partNumber filter 符合現有契約，跨公司與缺 integration.procurement.view 拒絕。依賴失敗的 status/code/envelope 依下方 TL 定案的既有 number-state error 契約，不能洩漏 stack 或把 500 變空列表掩蓋。若 source 尚不能解釋正式事件，保留 UNKNOWN；本地 PASS 不回寫正式 incident 為 resolved。

D05 最新只讀 source 查證（2026-10-04）：preview-derivatives.ts 的 previewRequestSupported 僅接受 native_thumbnail_png 的 SolidWorks source 或 drawing_pdf 的 slddrw；non-native Drawing upload（dwg/dxf/step）實際寫 skipped／unsupported_preview_source，不是真正 queued。現行 /api/pdm/file-assets/[fileAssetId] GET 在未取得 derivative 時卻一律回 202 PREVIEW_NOT_READY、retryable=true、Retry-After=2／pending，可能把 terminal unsupported／failed 誤報為可重試準備中；動態復現與正常 UI 尚未執行。此 D05 current 候選採最小修復：保留原檔下載與既有 upload，用真實 latest-job 狀態呈現 unsupported／failed；queued/running 才報 pending 與適用 retry，不新增 converter、不退役用途。驗收需正常 Drawing work upload→preview→可見終止原因／原檔下載，native PG readback 證實 skipped/status/code，確認 UI 不持續無效 polling。supported native purpose 仍需依實際可用 worker output 分層驗收。

master-attachment-panel.tsx 的 preview URL 用第二個 ? 拼接 query 是 static latent 候選；目前 source 搜尋沒有 current mount/import，不得稱正常入口產品缺陷，不優先為此擴大 RD surface。stale recover 只在 master-attachments-async 的舊入口見呼叫，是否抵達 current claim/list 仍需 TL 追蹤與動態驗證，未知不作已證根因。

D06 最新只讀 source 疑點：handoff-async-repository.ts 的 (:submittedBy IS NULL OR s.submitted_by = :submittedBy) 未做型別 cast，而 releases 列表傳 null；nullable PostgreSQL parameter inference 為待 native 復現候選，不是已定案 500 根因。真實 route 沒有 service/detail hydration failure catch；需 native fixture 逐層定位、保留原 error 及決定正常 JSON failure envelope，不能僅因懷疑就 broad rewrite。

### 正常入口與 evidence layer

| Actor／入口 | 正常操作與 observable result | 必要 evidence |
| --- | --- | --- |
| Part owner／正常料號清單→Part 編輯工作→矩陣 | Draft ordinary edit；last-saved 還原／重載；選首次發行→儲存→送審。Released 不提供首次發行控制，失敗儲存不能送出未保存 intent。 | 正常導航、實際鍵盤／點選、PATCH/submit、重載畫面；API/DB 補持久化。 |
| Assigned reviewer／正常審核清單→immutable review package | 首次發行核准／退回；重載狀態、intent、snapshot 不漂移。無適格 reviewer／拒絕情境有最短可恢復回饋。 | reviewer 身分／權限、正常導航、decision response、same-tx native readback；direct URL 只證 route 可達。 |
| Drawing owner→既有圖號工作台→合法 revision work；reviewer→審核清單 | major/minor 逐模式保存、送審、核准／退回；major canonical/master/pointer 一致，minor 不發行。 | 正常 UI→API→service→native PG；不能只驗 major 或從 UI fixture 推定交易完成。 |
| 現有附件／worker caller | D05 source 盤點後在相同既有入口上傳、重載、下載，或正常 job flow；結果由案例 delivery path 產生。 | caller/purpose／操作、metadata/bytes/output、error/recovery；無實際 worker output 的層級如實記 NOT_RUN。 |
| procurement consumer／GET releases API | D06 為既有 API-only 列表 slice；UI entry: Out of scope，來源為該 route 對外 JSON 契約，不新增採購前端。 | 真實 route/auth/service/native DB；外部 consumer 用途未知另記，未授權跨專案驗收。 |

UI 最終 Gate 在 RD 收斂、targeted tests 通過及 candidate freeze 後執行；AI/QC 收集正常／載入／空白／錯誤／permission-denied、desktop 1440×900 與 narrow 390×844、鍵盤流程、viewport、route、screenshots／必要量測。可見 inline-error、alert、4xx/5xx banner、Not Found／Internal Server Error 或非預期零資料即 FAIL／reopen；表格可用既有捲動邊界，但外層不得非預期水平溢出、重疊、文字／CTA 截斷。沿既有最小介面，首次發行 intent 與風險可見即可，不加入流程教學或無關摘要。

## Native PG isolation、fixture 與 QA/QC gate

- runner 必須完全位於此 AI-PDM source，不執行 OrgMaster／Jenfu-Platform runner、不讀 sibling migrations/source、不連遠端 DB、不使用 primary data。AI-PDM DDL 限 ai_pdm_core／ai_pdm_contract；已 applied migration 不改。077 只在 disposable own database 中 apply／rerun。
- 下方 Closure Review 已定案可由 AI-PDM 已提交 consumer source 追溯的 local versioned typed Principal／grants fixture 與 adapter；不得為方便驗證建立其他 app 的 *_core、改 producer 契約、或將 evaluator seam 稱真實 producer integration。fixture 必須保留 Principal／company／grant 版本與 current revoke 行為。
- 每個 build/test/app/browser/worker 開始前記 project、purpose、port、PID/process tree、cleanup condition、PDM_DATA_DIR／PDM_REPOSITORY_DIR、PG host/database／schema 與 mutation scope。兩個 data dir 均 task-owned，若不用仍記 unused；先確認可安全重用匹配 runtime，不清未知 port。
- fixture seed 前，以 unmodified source snapshot 執行 master-count、canonical root/reference、migration-residue、global FK invariants；失敗即 stop，不先修 seed 或刪資料。帳本記 base fixture/hash、seed rows、理由、來源與變更，父資料／grant 前置可 seed，首次發行與 major 核准結果必須由正常 action 產生。
- isolated build 前後證 primary SQLite schema、canonical root/part/drawing identities、migration-residue inventory、PRAGMA foreign_key_check 不變。所有 runtime／temp path 只清理 verified task-owned tree，記 port released；未清理不得無聲 handoff。
- QA 凍結 cases/source dirty boundary 後 QC 執行，不在 QC 改產品或 acceptance 取得 PASS；第一個有效失敗保留 raw response/query/readback，回送 RD，只重驗受影響案例及下游。

| Case gate | 操作與 pass／fail 條件 | Layer |
| --- | --- | --- |
| P-01／P-02 | ordinary edit 維持 Draft；first_release release-only 可保存／送審／核准，重載 formal/master Released、approval_context／receipt 一致。 | unit + true native PG + normal UI |
| P-03 | return→修改／重送→新 basis；撤 publish／self reviewer／zero reviewer／wrong company/root 拒絕且無發行 effect。 | native PG；適用 UI error |
| P-04 | 分別 work/formal/master 漂移、concurrent approve、同 key replay：最多一次 effect；拒絕時 formal/master/receipt/outbox 不部分寫入。 | native PG readback |
| G-01／G-02 | 正常 major 發行同步 master／pointer；正常 minor 不發行；重載與 readiness 一致。 | native PG + normal UI |
| G-03 | missing/ambiguous master、terminal/invalid、scope/basis drift 拒絕；無 unrelated master／Part 變更。 | native PG readback |
| TX-01 | 在核准 effect 中注入 fault；核對合法 failure envelope、rollback 的全部 owned rows、receipt/outbox，再 fresh retry／replay，不能只 assert HTTP。 | native PG |
| F-01 | 附件／worker purpose 正常入口的持久化／output、拒絕與恢復；non-native skipped/unsupported preview 呈現 terminal，下載可用，不持續 pending/retry；supported output 的缺環境與未完成實作分開判定。 | actual local route/storage/worker + native PG + normal UI，逐用途 |
| I-01 | authorized procurement list、empty/filter、package/files/approvals hydration；跨公司／缺權限；依賴異常透明且不回假空列表。 | actual route + native PG |
| UI-01 | Part/reviewer/Drawing 的正常導航、可見 error sweep、資料 sanity、desktop/narrow／鍵盤；fixture HTTP 僅提供 component visual evidence。 | actual browser/UI |
| R-01 | D122-01 JSON string/object 回歸與 D122-02 saved→還原→重載回歸；既有 Principal 安全測例無新增 fallback。 | targeted tests + applicable UI |

主要 fail-seeking／FMEA：intent 儲存失敗卻送審會造成錯誤發行（P-01/UI-01）；grant／CAS 漂移造成 unauthorized 或 stale 發行（P-03/P-04/G-03）；effect 中斷留下 pointer/master/receipt 不一致（TX-01）；component mock／seed 結果掩蓋壞 route/worker（F-01/I-01/UI-01）。這些都不能由 build 或平均測試通過數抵消。

## Architecture Closure Review：已定案（2026-10-04）

對照起點 HEAD 93b9b4cf67444d461aaa8934b8b1616537301b38＋移交 24 dirty paths 的 current source 完成工程 Closure Review；結論為 RD Implementation Ready／架構已定案，功能未驗收。Spec Impact 為 Compatible exception，沿用 DEV-121 Principal-only 安全契約；本地 fixture/seam 不取代 producer authority。ADR not needed：首次發行／major 同步已由本 DEV 與既有 canonical ADR 約束，本次選定局部修復與隔離驗證實作，沒有另立授權或 release 模型。RD 可立即在下列範圍修改 source；依賴精確安裝是 runtime 證據的進入條件，不能把錯版依賴結果計作 completion。

### 工程責任面與 code write allowlist

一位 RD 作為產品 writer；QA/QC 不改產品，TL 是本 spec 與 DEV-122 索引段落的 writer。允許面依 issue 限定，不等於全檔 stage 或授權修改無關 hunk。

| Slice | 可修改的實際檔案／模組 | 限定責任 |
| --- | --- | --- |
| D03／D04，共用 review | src/lib/part-change-work.ts；src/lib/drawing-revision-work.ts；src/lib/repositories/part-change-work-async-repository.ts；src/lib/repositories/drawing-revision-work-async-repository.ts；src/lib/pdm-review-package-contract.ts；src/lib/pdm-review-package.ts；src/lib/repositories/part-number-matrix-async-repository.ts；src/components/part-number-matrix-workspace.tsx；src/components/canonical-review-package-workspace.tsx；src/app/api/pdm/review-requests/[requestId]/route.ts | 整理已移交的 intent／basis／CAS／same-tx／review projection／首次發行控制；正常既有 Drawing major/minor 入口。不得新增產品狀態或 auth fallback。 |
| DQA01／unknown fault | src/lib/pdm-canonical-workbench-contract.ts；src/lib/pdm-dev087-route.ts（只有 classifier wiring 真有必要才改） | 在共同 error envelope 分類未知 server fault；保留已知 domain 和 Principal error。不得在每個 approval route 重複補丁。 |
| D05 | src/app/api/pdm/file-assets/[fileAssetId]/route.ts；src/lib/preview-derivatives.ts；src/components/canonical-preview-media.tsx；src/lib/pdm-canonical-preview.ts（terminal reason projection 需要才改）；src/components/canonical-preview-panel.tsx（同一 reason 可見需要才改） | 真實 latest job／hash 的 terminal response、讀取不洗掉 failure、有限 stale recovery、停止 terminal polling、保留原檔下載；不做 converter 或無 mount 附件面板修補。 |
| D06 | src/lib/repositories/handoff-async-repository.ts；src/lib/handoff-async.ts（只有 hydration 失效定位後必要修正）；src/app/api/integrations/procurement/releases/route.ts | native nullable query cast 與 list/hydration failure JSON envelope；success schema/filter/package links 與 existing auth 不變。 |
| 本地 schema | db/postgres/077_dev121_canonical_review_lifecycle.sql | own additive lifecycle_intent＋approval_context；當前唯一 077、已提交 own lane 至 076，移交顯示 077 未套用。首次 apply 前核對 hash/編號；若衝突改為下一可用編號並同步本 DEV，不動 applied migration。不得加入 production profile。 |
| 已移交 targeted tests | src/lib/part-change-work.principal.test.ts；src/lib/drawing-revision-work.principal.test.ts；src/lib/principal-work-review-owner-grant.postgres-contract.test.ts；src/app/api/pdm/review-requests/[requestId]/principal-review-detail.test.ts | lifecycle／review regression；readback colon 字面值與 fault 到達性、native readback。不保留誤稱 OrgMaster producer 的 describe/evidence label。 |
| 新增／既有最小 focused tests | src/lib/pdm-canonical-workbench-contract.error.test.ts；src/lib/repositories/handoff-async-repository.principal.test.ts；src/app/api/integrations/procurement/releases/principal-releases.test.ts；src/app/api/pdm/file-assets/[fileAssetId]/principal-review-file.test.ts；src/app/api/pdm/file-assets/[fileAssetId]/preview-status.test.ts；src/lib/preview-derivatives.dev122-recovery.test.ts；src/components/canonical-preview-media.dev122.test.tsx | 分類／nullable PG／terminal／recovery 的 fail-seeking 案例；真實 native 預期不能以 mock PASS 代替。命名以此 allowlist 為準。 |
| DEV-122 自有 runner／fixture | scripts/qc-dev-122-native-postgres.mjs；scripts/qc-dev-122-native-browser.mjs；scripts/lib/dev122-own-postgres-fixture.mjs；scripts/lib/dev122-contract-seam.mjs；scripts/lib/dev122-contract-seam-preload.mjs；config/local/dev122-native-postgres.v1.json；src/lib/dev122-native-business.postgres-contract.test.ts | 新 runner 只啟動 task-owned loopback PG／actual Next；fixture／契約映射／runtime manifest／ledger／evidence／cleanup。不呼叫舊 foreign runner。 |
| package scripts（可省略） | package.json 的 DEV-122 local script entries | 僅便利入口，exact 命令可直接 node；不改 dependencies/lock 或 production/release scripts。精確依賴安裝另依既有人類容量決策。 |

scripts/qc-dev-121-numbering-owner-grant-postgres.mjs 已移交 dirty hunk保留為 HISTORY_ONLY；不得作 DEV-122 runner、不修其 foreign input、不修改或發布 production release profile。任何新增責任面先回 TL 更新同一 spec，不能以一般授權順手改其他檔案。原移交 capture/hash 與歷史 FAIL 證據不可回寫。

### lifecycle 資料、相容與交易凍結

- Part update 的 lifecycleIntent 是 command metadata，edit／first_release 獨立於 validated attribute payload；GET/matrix 正確讀持久化值，沒有欄位差異的 first_release 可送審。existing works／舊 basis v1 預設 ordinary edit；不得替舊 pending request 補 first_release。basis v2 凍結 exact formal/master/work 和 package/hash，review 從 immutable package 讀 intent。
- work CAS 的工程定案：既有 immutable decisionBasis 新增 optional workRowVersion（positive integer）；新 Principal Part／Drawing revision submission 一律從同 transaction 已鎖 work.row_version 凍結，包含無 mapped master 的 minor。parser 僅允許既有 exact shape 或原 shape 加此單一欄位；hash 只在欄位存在時納入，既存 package bytes/hash 不重算、不補造。approve 在 same transaction 鎖 work 後，先精確比較 frozen counter，再執行 approval effect；repository formalize 的 expectedWorkRowVersion 與刪除 CAS 使用同一 frozen value，零 affected rows 拒絕並 rollback。新 basis 不得漏值；舊 lifecycle basis v2 漏值回 typed 409，return→重新送審取得新 basis。保留舊 decisionBasis v1 的 ordinary Part edit／無 lifecycle minor 相容（僅原非發行行為），不替舊包造 counter、不准用此相容路徑首次發行或 major production release；Drawing void 不涉及 work，不要求此欄位。這是落實原 exact work／CAS 與 P-04A／G-03B 的 compatible metadata closure，沒有新增 schema、permission、產品狀態或 API endpoint。
- Part first_release 只允許 Draft master＋Draft formal anchor；所有 terminal/invalid、非 Draft 或 scope/link 不一致拒絕，ordinary edit保持原合法生命週期。owner pinned serializable transaction 涵蓋 current grants、review assignment、work/formal/master CAS、formal/master update、approval_context、trace/audit、terminal receipt、command receipt/outbox 與 work/request cleanup。任何層拒絕不留下部分 effect。
- unmapped minor 的可達性：work basis helper 可保留無 legacy lifecycle 的 RD 相容，但 Principal submission 仍須有完整同公司／root 的 immutable review matrix 與 primary target。從正常 mapped Drawing 人工拆除 formal pointer、造成 primary 消失的 fixture 必須在 submit 回既有 typed 409，完整 readback 不變；此是 G-03A mapping 負例，不能冒稱已到 work-counter drift。mapped minor 的 native counter drift 與正常 major/minor 驗收保留；不為不合法 root/matrix 補 synthetic axis 或放寬 package integrity。
- Drawing major 用 exact drawings.formal_drawing_number_id→drawing_numbers.id，對 company/root/Part、master status/hash、basis/pointer/work 逐一驗；major 的 master allowlist 精確為 Draft／Released：Draft 首次 major發行或 Released 後續 major可同步；NeedInfo／Rejected／Active／PendingReview 不是本 DEV 的直接發行起點，須按既有生命週期處理後重新送審，回 typed 409 而不自動跳過舊制責任鏈。terminal/invalid master不復活。minor仍是 RD revision，不新建 released production pointer、不將 Draft master發行、不降級既有 Released master；它可凍結既有合法非終止 master 狀態（Draft／NeedInfo／Rejected／Active／PendingReview／Released）供 drift 檢查，PendingReview 有其他 pending／needs_info numbering request 仍拒絕。這是對 frozen Draft／Released 契約的局部 Closure 澄清：candidate 六狀態集合與其 Rejected 測例未驗收；numbering 舊制狀態機 Rejected→NeedInfo→Active→PendingReview→Released 不能推定為 canonical major 一次跨越的 authority。舊 basis缺凍結資料不補造，需退回／重送取得新 basis後才執行新 lifecycle effect。
- decide／publish 撤權的可達性定案：本 repo committed v1／v4／v5 catalogs 各九角色皆同有或同無這兩權限，無合法單權限 role/grant input。P-03B／G-03B 保留兩個 current guard 的個別 focused 拒絕／零 effect 證據，加上 actual native published-assignment coupled revoke→403／full rollback→exact restore→fresh approve/replay。兩個獨立撤單權的 native input 標 UNREACHABLE_UNDER_COMMITTED_CATALOG，不算 executed 或 N/A PASS；不得造角色、改 catalog/hash 或放寬 evaluator。這個分層等價證據只閉合不可達組合，其他 assigned reviewer／self／zero reviewer／company/root/link／terminal/invalid 等可達 variants 與全 29-group 分母保持。
- 同 request／相同 idempotency key 的 completed replay回既有 receipt，不能再次 effect；不同 payload/key 的 collision 與 concurrent approve照現行安全契約拒絕或安全重播，readback最多一次。current publish grant 在 effect前於同一 transaction重驗；不得改 selector/evaluator成角色 fallback。

### DQA01：colon 與 fault 的明確判定

source trace：review decisions route catch→dev087RouteError→canonicalErrorEnvelope；src/lib/pdm-canonical-workbench-contract.ts 的 unknown fallback目前是 WORKBENCH_BAD_REQUEST／400。post-formalize injected Error屬未知 server fault，400為共同分類缺口，不能把測例預期改400或接受任何4xx；歷史receipt仍保留「當時未證產品 defect」。

1. readback查詢將 command_name='dev087:review.decision'改為 command_name=:commandName，參數值保持精確 dev087:review.decision；同樣修所有本 slice receipt readback。保存原 SQL／POSTGRES_NAMED_PARAMETER_MISSING 首次失敗；不 broad rewrite db-async-provider normalizer，也不以刪 receipt assertion掩蓋。
2. canonicalErrorEnvelope 對已知 CanonicalWorkbenchError保留其status/code/message/correlation；dev087RouteError仍保留有效 If-Match 400、Principal／entitlement契約。未知 Error／非Error server throw回500，error.code=WORKBENCH_INTERNAL_ERROR、generic safe message、correlationId及private no-store，不洩漏stack／SQL／injected marker。必要新增 union/status 500；已知依賴503照既有typed error保留。
3. TX-01 必須assert formalize fault spy確實呼叫一次、original formalize完成後才throw；若被grant/basis/route前置拒絕，為fixture或產品failure，不算rollback PASS。fault profile保持空，不用PDM_DEV087_FAULT_PROFILE的terminal outcome代替本案例。
4. failure response exact500／safe JSON＋DB before/after：formal payload/version、master status/hash、work、pending request/status/version、canonical states、approved snapshot、terminal receipt、trace/audit、command receipt、outbox均完整回復。移除fault後fresh retry成功，再same-key terminal replay；readback只一個發行與approved snapshot／receipt／outbox effect。Drawing major另注入pointer／master effect後故障，證同等 rollback。只assert HTTP不充分。

### D05：preview terminal 與 bounded recovery 契約

先凍結 caller→purpose→metadata/bytes/job/output盤點，至少列現有 Drawing work files、Part attachment/preview、正常已mount的canonical file/read/review-package、preview workload claim/heartbeat/source/complete、drawing recognition與既有release-package file reader。只讀盤點其他 storage wrapper；無current caller標latent，不能順手改或據此退役功能。各用途記正常入口、initiator Principal/company、content hash/size/generation、storage provider、output與既有error/recovery能力。

current source確定：file-assets GET在derivative缺失時忽略enqueue回傳的state，一律202；preview-derivatives upsert會在再次enqueue時重設failed/skipped/cancelled。修復先依company＋asset＋source hash＋requested kind讀最新job/derivative；GET不自動重設已有terminal job。沒有匹配job時才建立，existing明示regenerate command可沿原權限重試；不新增無權限重試入口。

| 實際狀態 | file-assets preview response | UI／持久化規則 |
| --- | --- | --- |
| ready且source hash/generation符合 | 200，原bytes/MIME契約 | 顯示合法derivative；hash drift仍拒絕。 |
| queued／running | 202 PREVIEW_NOT_READY，retryable=true，Retry-After=2，x-pdm-preview-state=pending | 有限poll，保留現行30次上限；job具matching來源。 |
| skipped／unsupported_preview_source（DWG/DXF/STEP） | 422 PREVIEW_UNSUPPORTED，retryable=false，x-pdm-preview-state=unsupported；safe message說明可下載原檔 | 原job skipped/code不被GET洗掉；停止poll，原檔下載／hash/size可用；不新增converter。 |
| failed／cancelled或succeeded但derivative遺失 | 409 PREVIEW_FAILED／PREVIEW_CANCELLED／PREVIEW_OUTPUT_MISSING，retryable=false，x-pdm-preview-state=failed；附safe job errorCode／generic reason | 409不能僅按status重試；UI讀retryable與state，停止timer，顯示最短terminal原因／原檔操作。 |
| enqueue/DB/storage依賴異常 | 已知 typed 503或unknown safe JSON500 | 不回202偽queued、不回空成功；原檔storage依賴錯誤仍按原安全契約回報。 |

沒有匹配job且無法enqueue不可宣稱pending；一次GET/readback保留真實error。canonical-preview-media對terminal／202 body與header用同一contract；保留可見錯誤的短reason與可用下載，不新增說明面板。non-interactive/gallery也不能把terminal畫成永遠pending。

stale recovery動態進入條件：原source的canonical claim/read，使用matching fresh與stale jobs，固定clock分別超過既有previewHeartbeatStaleAfterMs／previewQueuedUnclaimedAfterMs，先保存「未recover」first failure，再修preview-derivatives共同入口。read recovery只處理已授權company/asset集合；workload claim只處理其supported kinds/extensions，保留CAS timestamp/status與attempt上限。fresh heartbeat、other-company／unsupported purpose、replacement source不變；recovered queued才可重新claim，exhausted或unclaimed逾時呈terminal。不可使每次GET恢復同一terminal，或全局無scope掃描混入讀入口。若original可恢復，保留PASS回歸而不改該slice。

supported native purpose：正常upload/enqueue/claim／heartbeat／source bytes／complete／download readback逐層驗；task fake output僅worker protocol/fixture證據，不能算真CAD產檔。真worker/CAD缺環境時記該purpose局部BLOCKED與恢復條件（受支援worker／SolidWorks COM註冊、合法原檔fixture及成功bytes），D05保持未完成；其餘terminal/read/storage本地修復繼續。Production storage activation／bytes L4本輪NOT_RUN。

### D06：原native復現與可見JSON failure

先以unmodified handoff SQL、submittedBy=null／非null及真native parameter binding執行，保留原query、values形狀、SQLSTATE（nullable疑點預期42P18，實際碼以native為準）、source/hash與first response；不可先CAST再稱root cause已復現。若原nullquery確實失敗，採repo既有dashboard相同CAST(:submittedBy AS text)的兩處型別穩定寫法；company/status/latest ordering、max200 scan、filter/limit語意不变。未復現則不投機CAST，native定位下一層list→getSubmission→files/approvals/package hydration。

route的access拒絕response保留401／403 numbering_permission_denied等契約；success保留integration=procurement、schema_version=1、generated_at/count/entries及Released package URL。service/list/hydration依賴throw由route以既有numberStateFlowErrorResponse(error, safe generic message)收斂：unknown500、error.code=number_state_internal、message不洩漏SQL/stack、retryable=false、private no-store；已知NumberStateFlowError維持typed status/code/retryable。不能catch後entries=[]／count=0／200。fixture中非空Released submission、files、approvals與release package須actual readback並normal下載；真正empty fixture另建empty case，非預期zero為FAIL。null hydration／company mismatch若掩蓋有權fixture的row需保存證據再局部修service，不擴展新資料模型。formal historical500根因仍UNKNOWN，local SQLSTATE與JSON修正只證local失效機制。

### Native PG lawful fixture 與 actual Next executor（凍結v1）

新增AI-PDM runner，而不改用scripts/qc-dev-121-numbering-owner-grant-postgres.mjs。exact local入口：node scripts/qc-dev-122-native-postgres.mjs --suite=lifecycle|files|procurement|ui|all；--plan-only僅source/target plan，不算驗收。每個suite可獨立fail seeking；all依序全套，phase failure保留raw證據。runner配套檔由上方allowlist新增，不能只回報「runner unavailable」而未實作。

- 選用已安裝本機PG17/18的initdb/pg_ctl；新task-owned cluster、127.0.0.1動態free port、dev122_<16hex> database與marker AIPDM_DEV122_LOCAL_V1。runtime login只具own業務DML/select/execute，不是postgres、owner、DDL或migrator；bootstrap與migration login分離。schema inventory除system/extension只有ai_pdm_core/ai_pdm_contract，zero foreign *_core、zero foreign schema、zero public app objects，拒絕任何遠端dsn與未標记data directory。
- fixture schema源自本repo已提交baseline own lane：001,003,042,047,048,049,050,051,052,053,055,056,063,062,064，再065–076，最後未套用077；054為retired，004–041/043–046已folded、002僅trace。manifest記每個source bytes/hash與compiled hash，077 apply＋rerun證additive default edit／context NULL、constraints與immutable triggers。不修改applied source或production profile/hash。
- baseline新local compiler直接把歷史public app namespace編譯到ai_pdm_core，不建立ai_pdm_legacy_stage。062的import_legacy_ledger、move_public_relations、move_public_functions三named DO blocks因fresh own namespace已到位而精確略過並記transform；保留catalog move、own functions/views、FK indexes、ownership、runtime grants與public-empty assertion。role名相容所需的historical placeholders只能在此disposable cluster建NOLOGIN，沒有其他app schema／資料／登入權。拒絕任何未宣告transform，編譯SQL保留審查artifact；不execute existingN1C遠端CLI。
- 055／066起catalog prerequisites只seed本repoconfig/access-control的committed catalog publication＋roles/active catalog，逐版hash ledger；077以077實際byte hash獨立記錄，不抄production migration allowlist。unmodified snapshot在任何case seed前通過master-count/root-reference/migration-residue/globalFK；再ledger寫入公司、Principal one-to-one account/profile、ownsession registry、versioned grant/identity前置。每個fault/drift種子另列mutation ledger。
- local versioned seam名稱ai-pdm.dev122.local-contract-seam.v1；own fixture objects為ai_pdm_contract.dev122_fixture_active_principal_accounts_v1、dev122_fixture_active_principal_mappings_v1、dev122_fixture_principal_effective_grants_v4、dev122_fixture_principal_auth_state_v3。欄位／version取自本repoconsumer契約；typed account、alias唯一、issuer/subject、employee、company、active lifecycle、authEpoch/profileVersion、assignmentVersion/hash/currentrevocation均具actualPG rows／readback。
- scripts/lib/dev122-contract-seam-preload.mjs僅test runner注入。只接受本repo已核對的exact read-only versioned-contract SELECT templates：orgmaster_contract.v_active_principal_accounts_v1、v_active_principal_mappings_v1、v_ai_pdm_principal_effective_grants_v4及platform_contract.read_principal_auth_state_v3；讀取模板hash allowlist映射到上述ownobjects，其餘SQLtext、parameters與同一pinnedPG client不变。不是泛replace schema；unknown foreign句、非SELECT/mutation或other *_core立即fail。若startup/API需其他contract模板，先回TL核對consumer用途更新v1allowlist，不能runtime自动扩權。storedownmigrations中的contract依賴不建立foreign objects，不執行不在此case用途的account manager流程。
- effective-grants fixture 的工程定案：唯一 private own base object ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4 保留 revoked／expired input，只有 bootstrap parent seed／exact CAS／readback 可存取。原 dev122_fixture_principal_effective_grants_v4 名稱為 SELECT-only view，投影 transaction_timestamp() 位於 [valid_from, valid_until) 的有效 rows；valid_until NULL 為無上界。runtime 僅具該 view SELECT，沒有 base grant。原 consumer SELECT／hash、seam template／mapped SQL／parameters／pinned client 不變，不新增 foreign template、role、permission、producer authority 或 runtime mutation grant。原 expired row 造成 source-invalid／503 的診斷保留；修後 actual consumer 無有效 assignment 應按既有契約回 typed permission denial，不改產品 validator 或接受任意503。
- seam只能在explicit task local env、loopbackPGmarker/readback、own runtime login、verifiedtask dirs下啟用；production/cloud/unknowntarget立即拒絕。正常mode不載入seam、不改產品requestguard／permissionevaluator／reviewerselector、不mock business repository、service、route、DB transaction或HTTPresponse。
- native readback 的工程定案：business runtime 仍沿原非 owner／非 DDL／非 migrator privileges，不為完整 rollback snapshot 擴 grant。既有 bootstrap parent 可提供 fixed-action、nonce-bound 的 owned-lifecycle-snapshot，只以 read-only repeatable-read transaction 列出 ai_pdm_core 自有 catalog 並讀全部 qualified／quoted tables；caller 不得提供 SQL、table、schema、credential 或任意資源參數。所有效應前後快照保留原完整 rows，含 runtime 無權讀的 migration metadata；observer 結果不作 business authorization 或 effect input。runner 明示並 preflight firebase_bff／platform on／entitlement enforce，禁止繼承缺漏 mode 造成無效案例。此為隔離驗證 harness closure，不改產品／producer／權限契約或驗收分母。
- actual Next UI executor使用同一isolatedPG與task-ownedPDM dirs。Next root metadata isolation：runner先以固定allowlist複製本execution worktree的package.json／next.config.mjs／tsconfig.json／tsconfig.app.json／tsconfig.next.json／next-env.d.ts及src／public／db／config／contracts到.tmp/dev122/<runId>/app-project，保存逐檔source/copy hash並確認相等；public若source不存在只記ABSENT且copy亦不存在；其餘required files／directories缺漏仍fail-closed。拒絕source symlink／非regular input，不複製.env、primary data、output、其他worktree或sibling。既有exact node_modules只建指向本worktree的verified junction，不複製／安裝依賴。node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port <reserved-local-port>以app-project為cwd；--webpack為installed Next16.3.8正式支援的executor mode，actualpages／API／service／businessSQL不替換。PDM_NEXT_DIST_DIR固定copy-relative .tmp/next-dist，PDM_NEXT_TSCONFIG_PATH固定copy-relative tsconfig.next.json，Next actual path.join／resolve readback須與app-project/.tmp/next-dist及app-project/tsconfig.next.json相等；不把Windows絕對path直接交給Next設定。只有Next child增加DEV122_NEXT_PROJECT_ROOT，seam驗其realpath精確等於runtimeRoot/app-project、該copy marker及process.cwd()；僅PDM_NEXT_DIST_DIR以此已驗copy root解析，PDM_DATA_DIR／PDM_REPOSITORY_DIR與其他native/browser children保持原ownroot範圍及guards。relative/escape/symlink mismatch立即拒絕；契約SELECT templates／source hashes／mappedSQL／parameters／provider／runtimeprivileges不變。metadata／typegen只能寫task copy，copy-only agentRules:false禁用額外Agent檔案生成並保存config唯一差異。copy及Next dist合計採2GiB硬上限監測，不follow node_modules junction，超限只停止fingerprint相符的ownNext tree並保留FAIL；readiness每次fetch最多5秒、overall120秒。每輪Next前以固定原session／C:\／lint_test／2GiB／operationId重新Governor check --reserve並保存ownrun原始JSON；只以當次matchingactivelease／policy／expiry執行，finally停止verified runtime並清理後釋放，不使用risk override或拿已released歷史receipt啟動。Vitest runner CLI明確排除**/.tmp/**及**/output/**，只執行既定source testcase而非runtime copy中的重複檔；不改全域vitestconfig。NODE_OPTIONS只在Next child注入本repo exact seam preload，其root／模板／privileges不變。正確signedfixture Principal cookie與ownsessionregistry用本reposessioncodec建立；不提供UIquickloginfallback。source worktree tracked config／next-env before/after hash相等；runtime child停止／port釋放／junction target再次核對後才刪除marker-bound task copy，cleanup包含browser/context。既有Vite qc-dev-121-canonical-lifecycle-browser.mjs僅componentvisual輔助，不作normalapp驗收。
- runner建fixture/querymapping自驗：unknown foreign句拒絕、mutating contract句拒絕、unsupported dsn/marker拒絕、denied/revoked/aliascollision確實拒絕；native business rollback不由seam處理。evidence標REAL_BUSINESS_NATIVE_PG_WITH_LOCAL_VERSIONED_CONTRACT_SEAM；identity/producer boundary=FIXTURE，producer integration/joint/Production=NOT_RUN。不稱真OrgMaster producerpublication。
- 一個case只seed合法開始條件；P/G預期Released／pointer／approvedsnapshot由normalaction產生。procurement可seed明示historicalReleased讀取前置，這只證D06readcontract；不得把此seed當D03/D04發行成果。F實際source bytes由normalupload產生；fakeoutput必須另標，不證CADconversion。
- project=AIPDM，purpose／port／ownerPID/process tree／cleanupcondition、PDM_DATA_DIR/PDM_REPOSITORY_DIR（unused也記）、PGdsn不含credential／database/schema/marker均在啟動前存manifest。runtime_root=.tmp/dev122/<runId>，evidence_root=output/qa/dev-122/<runId>；暫存cluster/files/dist/bootstrapkeys皆taskowned，evidence保留。finally只停止verifiedchildtree／pgcluster、確認portsreleased，再刪verifiedtaskpaths；不能關未知node／port或userownedUI。
- 精確dependency gate：有效測試前逐項比對 package-lock 與實際 installed packages，所有 nonoptional dependency 必須存在且版本一致；閱讀該實際 Next 的 node_modules/next/dist/docs 相關指南。精確安裝沿既有單次 5GiB 容量決策；新的高成長 operation 另核對容量。wrong-version runtime 不算 PASS；原版本 drift 與新 readback 各自保留，不回寫歷史。沒有 exact deps 只擋該 runtime 驗收，不改 scope。

### Browser native process identity closure

2026-10-04 的 run d0c875d7b36e22cc 證明 Chromium PID／creation FILETIME 相同，但 PowerShell Process.Path 與 QueryFullProcessImageNameW 回報 MSIX alias／native executable 兩個路徑。Browser harness 以 OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)、GetProcessTimes、QueryFullProcessImageNameW 取得的 exact PID／creation token／executable 作唯一 canonical identity，與 Governor 的原生 fingerprint 方法一致。PowerShell alias 與原始 raw 診斷保留；PID／creation token 必須完全相同，不接受 native mismatch、不刪 port argument、不修改 Governor 或放寬 runtime 登記。cleanup 使用同一 native identity，關閉 own browser/context 後須實際確認原 process 已退出與 websocket port 已釋放；任意 query error 不能當作 process dead，須有原生已退出或 PID 不存在的可核對證據。重新使用的 PID 必須辨識不同 creation token，不得停止新 process。

UI suite 可只選已存在的 actual Next UI prerequisites describe，以 actual signed codec/session registry、原生 schema/合法正常 API 產生必要 fixture。manifest 明列 selected／executed／skipped case 與 source applicability，不能聲稱本輪執行 P/G 全套；既有 source-compatible native receipts 可單獨引用。此分派不變更全 29 IDs、任何驗收變體、actual UI 正常入口、兩種 viewport 或完整 final candidate gate。
### UI Drawing lawful multi-role fixture closure

run d61448ac8265f886 的正常 Drawing 首頁入口／清單實際回 permission_not_granted／403，原 rd_manager-only input 與 first failure 保留；不得以 selector timeout、direct workspace URL 或接受 403 代替正常 UI。現行清單要求 page numbering.drawings.view；committed v5 manufacturing 已授予該 page，rd_manager 已授予正常編修／送審／發行 actions。Consumer 的 effective assignments 支援多筆，但同 Principal 必須屬同一 published assignment version/id/time。

僅 UI suite 的初始 lawful fixture 可為原 owner Principal 增加一筆既有 committed manufacturing role 的 direct employee workspace/company-jenfu assignment：不同固定 assignmentId、相同 grantVersionId/version/publishedAt、相同 typed employee／issuer／subject／company link。先核現行 consumer cardinality、catalog allowed scope/subject 與版本驗證；bootstrap 在 sessions／commands 前 seed，逐欄 ledger/readback，保持 exact catalog bytes/hash、producerBoundary=FIXTURE，不能聲稱 real producer integration。這是合法多角色 union，不創 permission/role、不修改 evaluator、API policy 或產品 guard。原 reviewer 單筆及 native lifecycle/files/procurement default fixture 不擴；single decide-only/publish-only 仍依 committed catalog 的原可達性界線處理。版本不一致／duplicate assignment／scope 或 identity mismatch 必須拒絕；未知 producer cardinality 或 actual validation failure 回 TL。

UI 必須保留原單角色 403 的狀態與 raw；新同公司多角色 fixture 以 actual Drawing list 200、非零 own row、正常首頁 click→列表→workspace action 驗證。Reviewer 由既有 Part submitted row→前往審核→返回審核清單→list→同一 immutable package，保留實際 route/CTA 序列；Drawing 由既有首頁 link。全 29 IDs、正常 permission denial、兩種 viewport 及 final frozen candidate gate 不變。
### Validation、正常入口與 evidence gate

| Layer | Exact entry／case gate | Pass條件與證據適用 |
| --- | --- | --- |
| source／DBboundary | git diff --check；npm run check:db-boundary | 記HEAD＋dirty path/hash；boundary靜態pass只證source。077／localcompiler變更後重新核對actualchangedSQL，不能只用stagedmode忽略unstaged。 |
| focused tests | npx vitest run src/lib/part-change-work.principal.test.ts src/lib/drawing-revision-work.principal.test.ts src/lib/pdm-review-package-lifecycle.test.ts src/lib/repositories/drawing-revision-work-async-repository.lifecycle.test.ts src/app/api/pdm/review-requests/[requestId]/principal-review-detail.test.ts src/lib/pdm-canonical-workbench-contract.error.test.ts src/lib/repositories/handoff-async-repository.principal.test.ts src/app/api/integrations/procurement/releases/principal-releases.test.ts src/app/api/pdm/file-assets/[fileAssetId]/principal-review-file.test.ts src/app/api/pdm/file-assets/[fileAssetId]/preview-status.test.ts src/lib/preview-derivatives.dev122-recovery.test.ts src/components/canonical-preview-media.dev122.test.tsx | exact deps＋taskownedenv；errorclass與terminal/current lifecycle回歸。未存在newtest由RD新增再執行，不因missingfile移除case。 |
| native lifecycle | node scripts/qc-dev-122-native-postgres.mjs --suite=lifecycle | P01–P04/G01–G03/TX01；true business PG、same TXreadback、grant revocation、work/formal/master/pointer drift、concurrency/replay＋colon測例。selectedsuite必須非zeroexecutedcases，skip不算PASS。 |
| files／worker | node scripts/qc-dev-122-native-postgres.mjs --suite=files | F01拆caller/purpose；actual routes/native PG/storagebytes、terminal poll/readback、bounded stale recovery、scope/provenance、native job claim/complete。real CAD output缺失另明列BLOCKED，不能用fakePASS抵消。 |
| procurement | node scripts/qc-dev-122-native-postgres.mjs --suite=procurement | I01含original null SQLSTATE／fixed native query、actualGET/auth/service/hydration、非空count/links/bytes、empty/filter/denied、list與每個hydration依賴faultJSON500。formalincidentrootcauseUNKNOWN另保留。 |
| actual UI | node scripts/qc-dev-122-native-postgres.mjs --suite=ui | UI01/R01：owner由正常/numbering/create建立Draft，/numbering/search→Partcontrol→matrix保存/還原→首次發行→送審；reviewer由/approvals清單→requestpackage核准/退回；Drawing由/numbering/drawings列表→workspace major/minor→upload→submit→review。actual NextAPI/services/native PG，不只direct URL；finalfrozen candidate收集desktop1440×900/narrow390×844、keyboard、loading/empty/error/permissiondeny、screenshots/network與DBreadback。 |
| type/build | npm run typecheck:app；npm run build:isolated | exact deps，taskowneddirs；existing build script 已有 cwd primary logical snapshot；本 DEV 額外由 caller 以 readonly/fileMustExist/query_only 工具對 canonical C:/VIBE CODING/AI_PDM/data/ai-pdm.sqlite 作 before/after snapshot，核對 schema、canonical root/part/drawing identities、migration residue、PRAGMA foreign_key_check 四類不變。這只讀 inventory 不作 build input、不啟 primary runtime；worktree absent 不替代 canonical primary 檢查。若 canonical path 亦不存在，記兩處 exact path absent before/after，不能冒稱查過 primary；不得讀 sibling source 作 build input。 |

QA依上方既有P/G/TX/F/I/UI/Rcase展開最小可執行計畫；case分母包含全部currentissue，D01/D02只regression。驗收故意觸發的expectederror可以PASS；正常畫面的inlineerror/alert/route4xx5xxbanner、NotFound/InternalServerError或非預期criticalzero為FAIL/reopen，不能用其他layer結果抹掉。沒有適格reviewer、intentsave失敗、stalegrant或terminalmapping均有短可恢復回饋；外層不新增overflow/overlap/CTAcutoff。正常action與API/DBevidence必須同source/fixture/variant。

首個有效failure保留rawresponse/query／SQLSTATE/readback；QC不得改test/acceptance，回RD後只重驗affectedcases與下游。artifact含sourceHEAD＋dirtyhash、exact deps/Nextversion、runner/fixture/seamversion、command/exit、case/role/company、seed ledger、route/method/viewport、screenshots、DBbefore/after/byteshashsizegeneration、PIDportsdirs与cleanup。unknown／NOT_RUN／BLOCKED不得平均成PASS。

執行順序：RD整理lifecycle/schema＋classifier/tests→own runner/fixture seam→originalD05/D06failseeking與必要修正→focused/native gates→candidate freeze→actualnormal UI→QA/QCaggregate/SpecDrift。D05/D06只讀調查与既定source修復可平行於依賴安裝等待；single product writer不重疊hunk。不得先做Vite UI PASS後宣稱native完成。

### Stop／re-entry與實作裁量

授權project/environment漂移、sibling/remote/production/primary mutation、dirty hunk不可分離、fixture baseline invariant失敗、mapping/schemaowner不明、unknown write outcome、existing security contract冲突立即停止受影響phase。runtimeexact deps不可得、Next/seam/worker不可啟動按該layerBLOCKED，記actualfailure及恢復條件，不縮scope。case/正常入口無法抵達、需要新增API/schema/state/permission/跨模組責任或allowlist之外檔案，先回TL重新ClosureReview；不得自補新架構／改acceptance以PASS。

RD可決定局部命名、無契約影響的寫法、測例組織／taskPID/port/runId和可追溯的fixturerows；不能改首次發行/major/minor語意、terminal不復活、immutable basis/version、current grants、same TX、realPG/actual Next驗收層、producer fixture標註或全issue分母。TL文件ready不表示functional PASS；DEV全部local completion需所有currentcase通過，未通過／未充分驗證／unknown仍保持執行中或相應局部BLOCKED。

Release impact note：維持旧review package相容、publishedgrants、forward-only migration與storage/runtime provenance；本轮沒有deploy／traffic／formal migration authority，不改production release profile。077不得偷偷進DEV-121release capsule。

使用思考習慣：#問題拆解、#可驗證性、#證據品質

### F-01F secure local credential prerequisite closure（2026-10-05；HISTORY_ONLY／已停止）

人類已確認持有 Document Manager key，但不知道設定位置；授權 J:/我的雲端硬碟/02_工作/00_雜項任務(進行中)/20260703 PDM開發 的檔案作測試資料。正式 /settings 截圖為 production-slice-blocked；現行 source 的 /settings/security 與 secrets mutation 未列入 production slice，且 secret routes 仍呼叫 legacy requireAuthAsync，在 Principal-on 模式回 principal_route_not_migrated。這是目前正常設定 UI 的不可達邊界，不可透過舊身份、permission fallback、修改 production gate 或換 demo mode來略過。正式設定 UI／production setup 不在本輪本地 native properties 驗收範圍；未驗收、未部署。

本 Closure Review 只補既有 F-01F native_metadata/customproperties 的 fixture provisioning。唯一 RD 可修改既有 DEV-122 runner、native business tests，並新增 scripts/lib/dev122-secure-credential-input.mjs 作 task-only loopback 密碼輸入 helper；不改產品 API/auth/catalog/schema/state、browser normal-flow tests、dependencies 或 frozen29case分母。這個 helper 必須明示 DEV-122 隔離測試用途及使用後刪除，以 single-use owner nonce、exact Host/Origin、CSRF、body limit、no-store 保護；只 bind loopback，不記輸入／request body、不可把 key放chat/log/argv/URL/plaintextfile/global env。輸入經記憶體／匿名 stdin 交 actual createSettingsSecretDraft 與 enqueueSettingsSecretProbe（DIRECT_MODULE_FIXTURE_PROVISIONING 層），明設 PDM_SETTINGS_SECRET_PROVIDER=windows_dpapi、PDM_WINDOWS_DPAPI_SECRET_DIR=task-owned credential-vault；encrypted blob只在此隔離根，讀取不跨入預設／primary secret-store。

Actual original recognition worker 先執行 native credential probe，probepassed後才用既有 activate function啟用隔離 reference；原 broker讀 active exact version，worker env fallback與breakglass禁用，Google Secret Manager／遠端零操作。接續三格式授權 CAD正常 enqueue→claim→heartbeat→source bytes→原 native reader→complete→persisted result/readback；真 native properties／extractor id／source hash與provenance為成功證據，filename/Shell不能替代。Key生命週期不冒稱正常Principal settingsUI PASS，native purpose也不能因 setup helper成功算PASS。若 key/probe/讀檔失敗保存安全 result code與first failure，不能偽造或手填 properties。

先 source freeze／helper empty-input smoke，再以已登記 own runtime等待人類私下輸入；記project、ports、owner PID tree、PDM_DATA_DIR/PDM_REPOSITORY_DIR／DPAPI mutation scope、cleanup條件／責任。只收受人類本輪主動輸入；不得讀其既有 primary secret。human等待期間helper與fixture的未清理義務由RD/Root持有，所有task-owned ports/processes/temp/UI於驗證完成或取消後清理。原CLI/UI/native/failure收據及其source綁定維持歷史原樣，新變更另綁before/after及既有證據applicability；只補此目的與受影響下游，不無條件重跑完整97/fullUI/build。預先確認baseline invariants及fixture mutation ledger，獨立QC保留驗收層與29分母。
## 歷史候選與證據保護（HISTORY_ONLY，非施工 queue）

下列原始範圍／source fence／跨專案 runner 描述保存歷史追溯，不能取代上方單一 AI-PDM 本地契約。原受控 JSON／FAIL／cleanup／provider readback 不改寫；此次升級只整理契約，不重新判其證據層級。

## D122-07：外部供應商回覆入口缺少已定義的 Principal／權限政策

2026-10-05 人類已明確決定「維持停用，另排後續開發」。本階段沿用停用政策；未開放不算功能 PASS，後續 actor／公司／回覆權限政策留 future capsule。

外部供應商回覆仍是待決的業務可用性項目。現行 `POST /api/public/shares/[token]/responses` 先要求已驗證的 AI-PDM Principal，再以 `503 supplier_reply_policy_unavailable` 和 `DEFERRED_DEV122_POLICY_NOT_RETIRED` 回覆；它不讀取 share token 或 body，也不建立回覆或稽核紀錄。這是安全收斂，不代表外部回覆功能通過或已退役。現有角色目錄沒有定義外部收件人 actor、公司範圍或回覆權限；不能把 share bearer token 當安全主體，也不能自行新增外部 grant。

證據與後續：`src/app/api/public/shares/[token]/responses/route.ts`、`src/lib/principal-readonly-share.ts` 及 `src/app/api/public/shares/[token]/principal-share-access.test.ts`；`scripts/qc-api-test.mjs` 保留 `SUPPLIER-001` 至 `SUPPLIER-011` 原有 case IDs，對本地 SQLite／cookie 模式標記 `NOT_RUN/DEFERRED_DEV122`，不把它們算 PASS。後續先由 AI-PDM 業務 owner 定義外部 actor、公司界線、可回覆用途及 revoke/expiry 行為，再以實際正常入口驗證。R81 中 `POST /api/settings-secret-probe-jobs/claim` 的 `403 feature_not_open` 是不同 worker route，不能作為本分享回覆入口的授權或可用性證據。

## D122-08 本地修復階段（2026-10-05；RD Implementation Ready）

窄修復已完成：actual native PG 17／17、focused 11／11（含實際 SQLite）、typecheck／選定 lint／DB boundary 通過；actual GET200只投影所选share responses，計數恰加一；撤權／過期 grant 與全部拒絕/故障路徑零副作用，exact fixture grant 回存已驗。原始query／HTTP503與fixture FAIL保留。[本地結果及層級限制](../qa/DEV-122-share-metadata-local-closure-2026-10-05.json)；獨立gpt-6-luna max QC無P1/P2；[PR213](https://github.com/jedchang0308-jenfu/AI-PDM/pull/213)／[required CI37296352232](https://github.com/jedchang0308-jenfu/AI-PDM/actions/runs/37296352232)通過並合併30b952d48b128ef50a04b4c1971914290c2df8ac；正式發布範圍待人類決定。正式 metadata NOT_RUN，原7 issues／29 groups及人類CAD缺口不變。

沿用人類「完成 DEV-122 開發／禁止跨專案開發」的 AI-PDM 本地開發授權，將下方已登記的 D122-08 窄 SQL 缺陷排入本地修復。此前 DEFERRED 與 42P08 為原始歷史，保留原始失敗；本階段不包含正式部署、外部供應商 actor 政策、真實 producer 或原生 CAD 驗收。唯一產品 writer 為 Root，QC 使用獨立 Luna。主分支來源為 7058b0139f7107cffda8356080c3e2f19759e2d1，工作分支 codex/dev122-share-metadata。

產品只允許 release-async-repository.ts 的 SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSES_SQL 對兩處可選 shareId 做 CAST(... AS text)，保留 submission/share 篩選與排序、binder、Principal/grant/company/resource 邊界及 schema。驗證允許既有 DEV-122 own native runner 增加 share-metadata 子集、native business test、既有 release-async-repository.share-audit.test.ts 的 actual in-memory SQLite 相容測例、既有 published-release-package contract test 的 D122-08 預期同步，以及本 spec／dev_task／documentation_map／一份結果證據；不新增依賴或 migration。

驗收：先以未改產品 SQL、actual named binder 與 disposable native PostgreSQL 留下 null／指定 shareId 的 42P08 和 actual GET 503 首發失敗；修正後 actual repository 兩分支正常且不跨 submission/share，排序不變；actual GET 200／private,no-store／資料投影正確／access_count 恰加一；同一實際 transaction 的原始 SQL fault、缺 session、跨公司、撤權/過期 grant、revoked/expired share、未發行 Pending/無 package 都不得留下計數或額外副作用。只使用已有 own schemas、明示 synthetic Principal／grant／歷史 Released 輸入與標記隔離 data/repository；source binding、fixture ledger、primary boundary、exact process/port/temp cleanup 必須保留。此追加 issue 與原 7 issues／29 groups 分母分開，成功只代表本地 native PG SQL／handler。

## D122-08：分享 metadata 業務 serializer 的 PostgreSQL 可選參數錯誤

2026-10-04 本機 disposable PostgreSQL、正式 R81 source `56ecb7a93b68140476cc2c913e4eca7e4308559a` 的 actual handler：`GET /api/public/shares/[token]` 在已驗 Principal、actual OrgMaster 029 v4 grant、same-company Released resource／package 核對後，於 metadata serializer 回503 `principal_dependency_unavailable`；底層 SQLSTATE `42P08`。同 phase 的分享 metadata list、package bytes delivery 與 canonical Principal persisted audit 已成功，不能將此 serializer 缺陷判成共同 grant 失敗。

實際因果 query 為 `src/lib/repositories/release-async-repository.ts` 的 `SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSES_SQL`（實際 query bytes SHA256 `d131f390d2e3c5e18f152fa8eeaf480ef415067a6aa922e0fe7322b7b102b3c8`），由 `readonly-share-async.ts:serializePublicShareAsync` 使用；nullable `:shareId IS NULL OR spr.share_id=:shareId` 經 actual named-parameter binder 成為重用 positional parameter，在 PostgreSQL 產生 ambiguous parameter 錯誤。初始 schema 與 disposable fixture 的 `share_id` 均為 TEXT；不是缺欄位或 bigint wire assertion造成。尚未修 product SQL，不改 parser、不擅自退役分享入口。

原始失敗／新增 SQLSTATE 診斷保留在 `JENFU/DEV-015 output/dev-012/inputs/dev121-share-read-pg-20261004-1791113052581-native-result.json`、`dev121-share-read-pg-20261004-1791113283694-native-result.json`；兩次各15 HTTP案例中14通過、public metadata positive 失敗，cleanup全true。後續 actual authorization wrapper＋token/resource resolver、package delivery/audit、撤權／scope 測例分层續驗；即使授權測例通過，public metadata 業務狀態仍是 `DEFERRED_KNOWN_BUSINESS_SQL_42P08 / NOT_PASS`。Verified session／business-detail schema／storage bytes 為明示合成 fixture，非 real-provider 或 Production L4。後續 AI-PDM 單專案功能排程再處理此 serializer 的窄 SQL typing 修正與正常 metadata 200驗收；本輪不擴張到其他 query／API。

## 已完成 local 檔案與證據保護

[QA 紀錄](../qa/DEV-122-canonical-lifecycle-deferred-2026-10-03.json)列出 18 個 Part/shared/UI/migration/runner 檔與 capture hashes、raw evidence、原始 FAIL、58 focused tests、較早 typecheck、UI NOT_RUN 及 cleanup。Drawing slice由同分支 owner 保留；這是記錄時的 local candidate，未合併、不是官方發布來源。`deferredFiles` 是完整 dirty file capture 與未發布功能的證據清單，不是 deployment allowlist／全檔 stage 清單；同一路徑可能混有延期功能與可分離的安全 hunk。`authOnlyCandidates` 只表示候選判定，不能直接全檔加入發布：root 必須由 exact HEAD `7b02d83d9f5a1ac76002f955f9c9f48939ec8c8d` 抽取選定 hunk，另以實際 variant／patch manifest、paths／hashes 與排除範圍建立 source fence；本 QA 的 capture hashes 不等於該發布來源。當前 owner profile 工作樹包含新增 077，此項屬本 DEV 延後候選；root 必須在 auth-only release source fence 排除這項，不能因 profile dirty path 可讀而誤發布。已套用的既有 migrations 不改寫。

安全 hunk 已完成抽取及合併：Drawing既有major effect的current `numbering.publish`重驗與shared selector `requirePublish`，及可靠發布validator，隨DEV-121 PR199進入官方main `c17b0a73dfaec5811857a373dbd38118731fd825`。上段capture／NOT_MERGED描述是抽取前歷史證據，不是當前待辦；一般077、basis v2、master lifecycle、Part首次發行及UI仍保留未合併候選，不撤回。R76 candidate verify失敗、安全中止且未切流，未算Production PASS；後續安全／可靠owner release／recovery由DEV-121續行，不能因一般功能延期豁免或移到本列表。

Part 額外 owner-Principal guard 判定為「未納入／防禦性候選延期」，不是已證漏洞的必要 mainline fix。r46 獨立查證及 source readback 確認既有 065 `principal_accounts.principal_id PRIMARY KEY`、`pdm_user_id UNIQUE` 保持 one-to-one；HEAD reviewer selector 已排除同 owner profile，decision 已綁 assigned reviewer profile。同 Principal／不同歷史 profile 的 mock 並未證明在既有約束下可到達的正式漏洞。保留 local hunk／原測試證據，但不得以該測例或全檔 path 將它升格為本輪已證必要修正。

native 命令是 OrgMaster existing `node scripts/qc-dev-047-postgres.mjs --suite=dev057`，consumer 指向 AI feature root；只有 disposable PostgreSQL 18.4、Org001–029 與 AI owner profile。它沒有改 OrgMaster producer source／API，沒有寫 primary／Production。fresh lease 與 PID、port50543、temp cluster、清理結果均在 QA；原始 output 先保存後刪除本任務 temp。

歷史 resolved 原證據來源為 [DEV-121 HISTORY_ONLY](DEV-121-target-authorization-boundary-history-2026-10-03.md) R25/R26 以及 `JENFU/DEV-015` 的 `output/dev-012/inputs/dev015-r26-jed-daily-edit-production.json`、`dev015-r26-owner-result-readback.json`、`dev015-r26-restored-work-read.log`。history 只取證，不恢復舊 UID／bridge／future phase 指令。

### Actual UI existing gallery flag closure (2026-10-04)

Run 27a5023151b6ef6d 已從正常首頁抵達 Drawing list 200／own row、workspace、terminal preview 409／停止輪詢及原檔下載，但 list 未投影 previewByRowKey、gallery 未掛載；原 FAIL 與 cleanup 原樣保留，不以 selector fallback 當 PASS。source number-state-flow-feature.ts 的 gallery guard 要求既有 PDM_WORKBENCH_PREVIEW_GALLERY_V1、PDM_UNIFIED_DRAWING_WORKBENCH_V1、PDM_NUMBER_LIFECYCLE_V2。為執行原 F-01C／UI-01 mounted gallery case，僅此 DEV own UI Next child 固定這三項為 true，並明設其既有 PDM_NUMBER_STATE_FLOW_V1=true；runner 保存 exact child env flags／preflight，actual list raw 必須有 previewByRowKey，正常 UI 才驗 gallery。不得改產品 default、global/User/Machine env、其他 child／非 UI fixture、grant／evaluator／schema／業務 SQL，也不啟用無關 flag或擴大 scope。所有 29 IDs、兩 viewport、正常入口、terminal quiet／download 與 permission negative gates 不變；已清理的原未啟 flag batch 不作 gallery PASS。此為既有驗收層的 executor prerequisite closure，未新增產品功能或 release authority。
