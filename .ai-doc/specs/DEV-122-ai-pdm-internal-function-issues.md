# DEV-122：AI-PDM 內部自用功能契約

## 現行處置：舊階段結案，剩餘移交 DEV-125（2026-10-27）

<a id="dev122-closure-handoff-20261027"></a>

任務狀態：`CLOSED_PARTIAL_HANDOFF`；原功能整體驗收：`NOT_ACCEPTED`。依使用者「系統精簡、不雙系統並行、舊任務盡量結案、新架構移到新任務」指示，DEV-122 不再承接新開發或維護 active 工作排程。

既有七項矩陣證明 D122-01～04、06 為 `LOCAL_OUTCOME_VERIFIED`，其成果及失敗歷史保留；本次沒有重新執行或改判正式驗收。D122-05 的附件、PDF、原生預覽與完整 CAD，連同管理員辨識的未完責任，具名移交 [DEV-125 承接表](DEV-125-windows-solidworks-service-and-openswx-retirement.md#legacy-outcome-handoff)。D122-07 仍為 `DISABLED_DEFERRED`，不列功能通過。若要宣稱原七項整體通過，DEV-125 仍須保留並補足適用層級的驗收，不能因轉移縮減分母。

DEV-125 是唯一後續實作／驗收入口；DEV-124 取消 OpenSWX 修復並由 125 承接拆除。PR #499 已合併 Windows worker 單一路徑及 OpenSWX active source／release dependency 退役；尚未完成的是正式 Windows 裝置與 A0001 預覽驗收，以及 OpenSWX provider 資源退出，不是重新開發 DEV-122 預覽 UI。原 D122-05A／05B 與 29 個診斷 ID 保留來源對照，不另開平行施工。現行任務處置亦記於 [既有機器可讀契約](DEV-122-self-use-acceptance.v1.json)；私有七項矩陣是既有受測快照，不再被當作本輪 active 工作清單。

**以下為移交前契約與證據。** 下文的 CURRENT、ACTIVE、下一步及發布指示均保留當時語境，不是重新啟動 DEV-122 的命令；仍適用的資料、授權、來源完整性與失敗恢復契約由 DEV-125 重用。歷史已驗與未驗的結果不回寫。

## 歷史 COO amendment：七個 issue outcome（2026-10-23）

<a id="current-coo-outcome-closure-20261023"></a>

本節是 DEV-122 現行完成判定的權威修訂，取代下方及舊 `DEV-122-self-use-acceptance.v1.json` 中把「29 groups」各自當作獨立完成分母的語義；原文、ID、FAIL／UNKNOWN、原始 wrapper 與發布收據均保留，不回寫歷史。

**現行分母為原始七個 issue 的使用者結果：**

| Issue | 要交付的結果 |
|---|---|
| D122-01 | Part matrix 可正常載入、編輯與重載，JSON object／string 不造成 503。 |
| D122-02 | 儲存 B 後改回 A 仍真正儲存；reload 符合最後成功值，失敗不得假裝已儲存。 |
| D122-03 | Part 首次發行、退回與重送正確；核准才原子更新正式資料及 master，拒絕／故障不留部分結果。 |
| D122-04 | Drawing major／minor 正確承接 master、revision 與正式 pointer，不錯誤發行或覆蓋。 |
| D122-05 | 既有附件正常上傳、受保護讀取與下載；預覽有正確 ready／terminal／failure，完整原生 CAD 結果仍須實證。 |
| D122-06 | 內部採購清單可用，正確列出公司最新 Released 結果與 package；正常資料與依賴失敗均回可預期 JSON。 |
| D122-07 | 供應商入口維持 `DISABLED_DEFERRED`，不納入本次恢復，不算功能 PASS。 |

單一現況矩陣為 AI_PDM 既有私有證據根的 `output/qa/dev-122/openswx-phase2/owner-checks/DEV122-current7-outcome-matrix-20261023.json`。它分開記錄本機結果、正式驗收與暫緩處置；不以 PR、文件或 CI 綠燈代替使用者結果。`D122-QA-01`／`DQA01`、四項能力與十一個核心案例是共享檢查／施工視圖，不另增 issue 分母。

原 29 個 R／P／G／TX／F／I／UI ID 全數保留，作為診斷、歷史、證據標籤及 issue acceptance dimensions；不刪除、不改寫既有結果，也不再要求每個標籤各有 sidecar、獨立 QC、完整 source binding 或獨立 PR。同一 issue 的正常結果、風險與讀回可合併交付；未變且仍適用的證據直接重用，只有受影響責任、漂移或新失敗才補驗。

**每個 issue 的最低充分證據：**目前來源的正常結果；適用時一個重大 deny／fault；該結果必要的 route／DB／UI／provider readback。API-only 的 D122-06 不因此新增 UI。保留來源／環境／身分／資料的適用範圍，但不因 SHA、回合或無關文件變動重新綁定全部證據。

**必要安全不變條件仍有效：**authentication（含既有 Firebase、Email、Principal 撤銷與 authEpoch）、company boundary、data integrity／同交易及重試一致性、no-fake-ready、safe error，以及既有 required CI／migration／release control。此修訂不放寬權限或發布保護，不授權正式資料寫入，也不手動跳過執行器。

歷史首次失敗保留當時判定；目前 outcome 若已由有效證據證明，應記為該層已驗證，不因舊 wrapper `PARTIAL_NOT_ACCEPTED` 永久維持 current partial。本機通過不改標為 Production 通過；正式事件原因未知可維持 UNKNOWN，不自動成為新的開發 gate。

完整原生 CAD 維持 `USER_OWNED_PENDING_NOT_PASS`；未完成前，DEV-122 整體不可宣告 PASS。supplier 的明確暫緩不觸發恢復施工。DEV-123 完全排除：不得讀取、修改、協調、監控或觸碰其 worktree、branch、PR、文件或證據。

本次第一階段只交付本修訂、兩個 CURRENT 入口與單一矩陣；不改產品、runner、測試或 release，不開 PR。暫停中的 F-01E 工作樹、dirty 檔與 checkpoint／patch 原樣保留，待本階段核對後才進入 D122-06。這是一次性聚合修正，不新增常設 COO 簽核；效率改善尚未量測。

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
| `identity_roles` | 正常登入；管理員可智慧辨識；RD 可讀寫及送審；RD 不可核准 | `RD_PERMISSION_TEST_ACTOR_VERIFIED / ADMIN_RECOGNITION_PENDING` | 實際 actor 的 allow／deny 與拒絕零副作用 |
| `pdm_lifecycle` | Part 首次發行、Drawing major／minor、退回與重送保持一致 | `LOCAL_NATIVE_AND_UI_EVIDENCE_AVAILABLE` | 受影響交易、CAS、rollback／replay 通過 |
| `drawing_preview` | 目前版本 PDF 可閱讀；預覽任務有限且有終態 | `LOCAL_QC_PASS / PRODUCTION_ACCEPTANCE_FAIL_2026-10-27` | 正確版本 bytes、桌面可讀性、terminal／error 行為 |
| `operations` | 正確來源建置、候選 smoke、切換讀回與 rollback-ready | `NO_RELEASE_IN_THIS_CHANGE` | 只有實際發布時驗 exact source／image／revision／traffic |

能力可獨立標記 `PASS`、`FAIL`、`PENDING` 或 `NOT_APPLICABLE`。一項能力未完成，不改寫其他能力已成立的證據；DEV-122 整體結案仍需原始 7／29 全部有可接受結果。

<a id="current-delivery-handoff-20261027"></a>

### 現行交付切片（2026-10-27）

| Issue／切片 | 目前可證明狀態 | 下一個可驗收交付 |
|---|---|---|
| D122-01～04 | 既有本機交易／UI／API結果可重用；沒有新證據支持正式環境整組通過。 | 只有來源或行為受本輪修正影響才重驗；不重播無關完整套件。 |
| D122-05／3D F-01B | lease v2 source 已合併且目前正式 serving source 已包含該修正；`A0001-M01` 仍回 `preview_worker_unavailable`。歷史 D122-05A actor-independent 固定診斷已完成本機實作，後續責任已移交 DEV-125；正式 runner rollout／readback 尚未執行。 | DEV-125 先以固定唯讀診斷讀回 current file binding／hash、current-hash latest preview job 與兩個 stable worker identity heartbeat；heartbeat 不能冒充 OS process，process 維持 `unknown`。再依證據修正 runtime／資料責任，完成真實 `claim → heartbeat → complete`、current-hash 非 fake PNG、mounted UI 及 parent-lock mounted／refusal。 |
| D122-05／PDF | viewer 與 render liveness source 已合併且目前正式 serving source 已包含該修正；正式檔仍回 `unsupported_preview_source`。 | 先以固定唯讀診斷讀回 media type、current binding、source hash、job／derivative；只修實際 metadata／binding／derivative 責任，透過既有 writer 或必要 forward-only migration，不手改正式資料。以 canonical API、受保護 `%PDF-` bytes 或 current-hash derivative及 mounted viewer 可讀關閉。 |
| 管理員 recognition／worker | worker route放行與PDF browser-baseline source已合併；`ADMIN_RECOGNITION_PENDING`，尚不能證明CAD consumer或正常結果。 | 先讀回實際actor／grant、session／queue及consumer runtime；若確認CAD consumer缺位，建立獨立recognition runtime，禁止共用OpenSWX或preview credential。以管理員allow／deny零副作用及正常worker/result readback驗收。 |
| Part attachment | 正常入口與本機storage/UI證據已合併；正式受權上傳／重載／下載未完成。 | 確認serving source後，以專用受權actor驗正常上傳、清單重載、受保護下載bytes／hash、audit及一個拒絕零副作用案例。正式business mutation只能在明確執行該驗收時產生。 |
| D122-06 | 本機採購API結果已驗；相關修正已合併。 | 無新漂移時不重驗；不能把本機結果寫成正式驗收。 |
| D122-07 | `DISABLED_DEFERRED`。 | 不施工、不算PASS；未來需求成立才另行re-entry。 |
| F-01F native CAD | `USER_OWNED_PENDING_NOT_PASS`。 | 使用受控原生檔與native reader保留exact bytes／hash、版本及結果；PDF、合成fixture、OpenSWX或preview worker不能代替。 |

目前 DEV-122 可直接施工的程式變更，必須由上述 readback 指向具體責任後才選檔；主線已有 source 不等於正式 runtime／actor／data acceptance。D122-05 的 SolidWorks preview 與 DEV-124 的 OpenSWX metadata worker 是兩個獨立交付點；DEV-124 的[權威開發契約](DEV-124-openswx-worker-independent-repair.md)不得改寫本表狀態。

<a id="d122-05-production-preview-gap-20261027"></a>

### D122-05 正式預覽缺口（2026-10-27）

以公司 Google SSO 登入正式 `ai-pdm-prod`，在圖號工作台開啟 `A0001-M01` 後，畫面與 canonical file-preview API 讀回兩個不同的終態。3D 原檔 `D-0007-MA1.SLDPRT` 回覆 `PREVIEW_FAILED`／`preview_worker_unavailable`、`retryable=false`；這表示目前沒有可用 worker 接手該預覽工作，屬本 DEV 的 F-01B 正式 server／兩個 worker v2 process rollout 與 runtime 驗收缺口。2D 原檔 `D-0007-MA1.pdf` 回覆 `PREVIEW_UNSUPPORTED`／`unsupported_preview_source`、`retryable=false`；它不是 PDF viewer 尚未開發，因完整 PDF viewer 已由 PR #278 合併、PR #486 修正 render liveness 並通過 required CI，而是本筆正式 file asset 的 media type／來源分類／current binding／ready derivative 或 serving-source 適用性尚未讀回確認。

後續 provider readback 已確認目前正式 service revision `ai-pdm-prod-3092d00b3653`、image digest `sha256:d9c3f8b2267475969cd00dc6e68b0e24504d41f18ba830024c0b1033ff43b068` 與 source `ad74f179747cdd807c6bf8a4958dba81434b5074`，且該來源包含 Part attachment、preview lease v2、recognition worker middleware、採購、PDF browser baseline 與 PDF render liveness 的已合併修正。因此目前缺口不是「修正尚未部署」，而是正式 file asset／preview job／derivative／worker process 的實際狀態與資料綁定尚未讀回，或其後仍有 runtime 缺陷。

現行 canonical file-preview GET 不是安全的診斷入口：它可能執行 stale recovery／enqueue，並寫入 storage access audit。repository 目前也沒有可同時讀取 current file binding、latest preview job、derivative 與 worker process 的固定唯讀 API。因此移交前契約把正式修復拆成兩個可驗收切片；下列 D122-05A／05B 只保留來源 ID，現行施工、驗收與狀態更新一律歸 DEV-125，避免在根因未知時直接重送預覽或修表：

- `D122-05A 固定唯讀診斷`：以 task-owned operation 綁定 exact project／service／drawing／file 與 migration runner digest，透過 `REPEATABLE READ READ ONLY` transaction 輸出 current asset metadata、source hash、binding、current-hash latest job／derivative、兩個固定 worker identity 的精確 capability heartbeat，以及 bounded provider readback 所證明的唯一 100% serving revision／image／OpenSWX dispatch flag。heartbeat 只證明 stable identity 最近回報，明示 `processStatus=unknown`，不得冒充 OS process 或 revision。不得讀檔案內容／storage key、enqueue、recover、寫 audit 或更新 job。診斷本身會建立一個 Cloud Run Job execution，並 create-only 寫入 submission／database／final GCS receipts；這些 evidence side effects 與 business data／service configuration mutation 分開記錄。
- `D122-05B 最小修復與驗收`：由 DEV-125 只依 05A 證明的責任修改 source／runtime／受控資料契約；正式資料修正只能走既有 writer 或 forward-only migration。3D 與 PDF 可分別關閉，但 DEV-122 整體仍須符合七個 issue 的結案條件。

移交 DEV-125 後的 fixed readback 實作入口為 `scripts/lib/dev122-preview-openswx-runtime-readback.mjs`、`scripts/dev122-preview-openswx-runtime-readback.mjs`、`scripts/dev117-production-migration-runner.mjs` 及既有 stable diagnostics workflow；檔名保留歷史 D122 來源，不表示 DEV-122 重新啟動。固定 selector 只允許 `company-jenfu`、`A0001-M01`、`D-0007-MA1.SLDPRT`、`D-0007-MA1.pdf`、`windows-shell-thumbnail-worker／solidworks_3d_preview_png` 與 `solidworks-document-manager-preview-worker／solidworks_2d_preview_png`。兩檔 current binding 缺失／重複時仍保存唯讀結果，但 final status 必須是 `READBACK_COMPLETE_WITH_FINDINGS`，不得寫成 PASS；child runner 的 `database.json` 路徑必須由 operation hash 唯一決定。OpenSWX 部分只讀 DB active state 與 serving app dispatch flag，沒有完整 Job／Scheduler／execution inventory，故不得輸出 no-current-need 或 retirement PASS。實作已由 PR #500 合併並通過 required CI；正式執行前仍必須以受保護 release 將 exact main `b7b0f4e…` 的 migration-runner image 安裝到既有 Job。2026-10-27 的首次正式 attempt 使用較早 source，且在 activation 前因 Platform session smoke 失敗安全回滾，所以正式 runner 尚未含此 operation；舊 image 不得接受新 operation。

原始 authenticated browser／同 session API body 與當時證據限制保留於 [A0001 正式預覽缺口](../qa/DEV-122-A0001-preview-production-gap-2026-10-27.json)。不得把 3D 結果歸入 `DEV-124`；DEV-124 已取消，後續預覽與 OpenSWX 退出均依 DEV-125 的單一路徑處理。

關閉 D122-05 本缺口只需補受影響責任：

1. 以 `D122-05A` 核對兩個 file asset 的 media type／binding／source hash、current-hash latest preview job／derivative與兩個 preview worker stable identity heartbeat；正式 OS process／worker revision 若無獨立證據即保持 `unknown`。不呼叫有副作用的 canonical GET、不直接修表或把歷史 job 改為成功。
2. 3D 在服務已就緒後，以新工作或明確核准的 retry 證明真實 worker `claim → heartbeat → complete`，產出綁定 current source hash、非 fake generator 的 `image/png` derivative，canonical API 與 mounted UI 可讀；同時完成既有 parent-lock mounted／refusal 驗收。
3. PDF 證明 current binding 指向受保護的 `application/pdf` bytes（含 `%PDF-` header），或指向 current-hash 的有效 `drawing_pdf`／`sheet_png` derivative；canonical API 不再回 unsupported，mounted viewer 能顯示完整圖框、尺寸與註記。若根因只是 metadata／binding，仍須透過既有受控 writer 或 forward-only migration 修正，不手動修改正式資料。
4. 保留兩個原檔下載與 terminal safe error；不得以 fake PNG、舊版本 PDF、無來源 hash derivative、重複重新整理或擴張 IAM／Secret 取代正式修復。

本輪新增 D122-05A 固定唯讀診斷程式、接線與相鄰測試；沒有修改產品 route／worker、schema／migration、IAM／Secret、正式資料或服務。正式 runner rollout 與 readback 尚未執行，DEV-122 整體維持 `NOT_ACCEPTED`；PR #278／#486 的既有 PDF 實作與通過證據不回退。

### R-01A 辨識讀取錯誤回應（2026-10-23）

兩個實際 GET route 的合成回歸證實 `recognitionErrorResponse()` 在 domain 503 與 unknown 500 均未明確設定禁止快取標頭，四個原始 red 保留。修正只為這兩個共用錯誤分支補 `cache-control: private, no-store`；原有狀態碼、安全訊息、retryable、Principal／有效授權／公司／撤銷規則不變，required recognition CI 納入同一回歸。這不證明歷史 UI 500／missing-key 的根因，也不證明 Production 曾快取錯誤。

本地聚焦 22／22、型別與增量 lint、planner 17／17、release-core 220／220、isolated build（artifact／primary／cleanup）通過。隔離 native run `9b66a28d097f584a` 在正常空來源 Drawing，以同一合成 owner 登入狀態實測 latest-reader GET 200 → 精確暫停隔離表的有效 SELECT → 安全 500 → 恢復權限 → 同頁「重試」回到正常空資料。Next 實際標頭另有 `max-age=0`，仍包含 private／no-store；過度嚴格的初次 observer 字串比對及原回應保留。伺服器 29 筆請求皆 GET，165 張 `ai_pdm_core` 資料表前後相同，沒有 recognition session／preview job；ACL 另核對有效 SELECT 與 grantee／privilege／grantability，未宣稱逐欄 grantor 還原或未知寫入 recovery 已驗。原 fixture 欄位錯誤亦保留；runtime、PG、連接埠、暫存目錄與 task tab 均清理。證據在 `output/qa/dev122-recognition-reader/`，不是既有辨識 session 投影、worker、CAD 或正式 actor 驗收。

同日補齊的其他本地窄範圍證據保留各自來源：main `533834853e5af656f7d945901ed26a2bd806194d` 的 P-02C actual Part readiness HTTP／1440×900 畫面，確認正常 Draft 被阻擋、經正常首次發行審核的 Released 可送審；R-01A Part／Drawing 19 筆 HTTP 讀取與拒絕，以及 Part Matrix 授權到期 403／恢復後同頁重載。各自的 core 資料前後相同，authority fixture 的預期變動另列；它們不替代 Production、Dani 或使用者 A0002 檔案 lineage，P-02A 沿用 B52 的 save401 證據而不新增重複案例。上述 runner 均維持 `PARTIAL_NOT_ACCEPTED`；原始 7／29、歷史失敗及未驗責任不變。本切片無 DDL／migration，不部署、不切流、不改正式資料。

### 辨識 Production dispatch 缺口（2026-10-23）

B65 在正式 revision `ai-pdm-prod-18d3df5a0bfd` 觀察管理員的辨識 session GET 200／session null，隨後 create POST 403；原回應的 closed code／header 與同 snapshot effective grant 未擷取，不能把 catalog allow 當作 actor grant proof。Provider 確認該版本使用 `official-numbering-draft`，source 的 slice allowlist 卻沒有任何 recognition-session mutation；synthetic actual-middleware 回歸已在未修改實作時重現十個既有 command 均無法 dispatch。修正只補 [production slice amendment](SPEC-PDM-PRODUCTION-SLICE-001-official-numbering-draft-launch.md) 明列的 method／path，保留既有 Principal、有效授權、公司／資源、撤銷及交易守門；不修改角色指派或重送 085。此 source-level 根因不證明原 actor 通過後續 guard，也不證明 worker、辨識結果、CAD／PDF 預覽或管理員／RD 正式驗收成功。正式原失敗與 7／29 分母保留，部署與 actor 實測待各自取得證據。

### 辨識 worker Production dispatch（2026-10-23）

B68 綁定 serving source `ffb39b7ee4da1c8c8d88b655a8736aa8bfc51106`／revision `ai-pdm-prod-cd3221652faf`／100% traffic，實證專用 RD 測試帳號登入、有效 grant、圖號工作台與辨識讀取；現有 session 保持 queued、attempt 0，未重送／重排。指定 SDK 的正式 revision readback 確認 `PDM_PRODUCTION_SLICE_MODE=official-numbering-draft`；該 source 與後續 main 的 middleware 均拒絕 recognition worker 的 claim／heartbeat／complete。未改實作時的三個 actual-middleware 合成 red 均回 403，確立正式設定下的必經路徑缺口；但限定時段的 worker HTTP 日誌為零筆，不能聲稱已觀察該 worker 的 403、正式 host 停止，或單憑此點解釋所有 queued 原因。

修正只放行 amendment 明列的三個 POST worker 入口，保留 technical workload purpose、身分與 label、holder、source fingerprint、transaction 及終態 replay 規則；既有人類 Principal、Email、Firebase、grant 與撤銷入口不變。回歸涵蓋精確 middleware→route、未知 slice、錯方法／鄰近路徑、無／錯用途／已撤銷 credential、冒用 label 與無 command 副作用，並納入 required CI。無 schema／migration、worker 啟停、Scheduler、IAM／Secret 或正式資料手改。

已知舊有界線不作擴大主張：worker 以穩定 workerId 判 holder，沒有每次 claim 的 fencing token，不能把重疊同 ID 的舊 process 結果視為已防護；worker 不重驗 initiator Principal grant，該欄位保留為 provenance。正式 host、workload purposes、probe 前置請求、queue due/order 仍未知。source 修正、本地測試、正式發布與現有 session 的正常 claim→heartbeat→complete／內容品質各自記錄；未取得證據不得宣稱完整辨識或原 7 issues／29 groups 通過。

本地 164／164 聚焦回歸、app 型別、增量 lint 與隔離 build（artifact／primary／cleanup）通過。新增 35 案使用真實 middleware、route 與 workload authentication，command boundary 以 mock 驗證拒絕不呼叫 owner；這不是 native PostgreSQL 交易、正式 worker 執行或辨識結果驗收。三個原始 red 與唯讀 provider 診斷保存於 `output/qa/dev122-worker-readonly-20261023/`。此次 required CI 納入新 regression 及既有 settings／workload-auth，發布前仍需 exact reviewed merged source 與 provider required checks。

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

### RD 圖號工作台切片驗收（2026-10-23）

依[專用測試帳號驗證計畫](../qa/DEV-122-RD-permission-test-account-verification-plan-2026-10-17.md)，本切片已完成指定測試 actor 的正式環境唯讀 UI／API 驗證，不要求真人業務簽收。PR #453 的 exact main `c549271ab2ad906f41f369cd514e100d92211c21` 與 required CI run `39808042618` 均通過；owner run `39808504957` 已 `RELEASED`，image digest `sha256:b6874c13d99106e0105d74d3f1cfbd6b93797af2fc55f92c6690c3d90f397e8f`、revision `ai-pdm-prod-aa547dcb1a9a`、100% traffic 及前一 revision `ai-pdm-prod-1be8986b68ce` 可追溯。085 已套用，續跑重用 C95 migration receipt，未重送 migration。

發布後唯讀 run `39810618145` 證明 active catalog v7/hash 與唯一 `rd` grant（assignment v14）一致。同一 `DEV014 Free Google（JFS9014）` 經正常 Google popup／Platform SSO 登入；`/api/auth/me` 的 actor hashes 與該 readback 完全相符。圖號 UI／API 各讀取 50 筆，既有測試圖號 `A0061-M01` 明細可開啟；原始 `permission_not_granted` 不再出現在圖號頁。workspace view/create/update、review submit 為 true；review decide、approval batch decide、publish、admin matrix、approval inbox 為 false，審核 UI 與 GET API 均回 `permission_not_granted`。正式環境未執行核准、發行或 business mutation。

建立／檔案上傳／送審及 update 權限投影、RD 核准拒絕與未授權 QA 圖號拒絕／零副作用，重用 native PostgreSQL run `cf1dfefee3a72b74` 的原始 PASS；其來源為 `d54788cfb004b003e7a1baacda80d662be8791b3`，1,082 個受測應用與 migration 檔案的 hashes 與發布版本完全相同。這些仍屬隔離 fixture 證據，不改標為正式寫入測試，也不宣稱另有欄位編輯案例。完整層級、hash 與截圖索引見 `output/qa/dev-122/rd-permission-repair/rd-permission-acceptance-2026-10-23.json`；immutable ref 為 `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-RD-WIF-39808504957-1/post-release-acceptance/rd-permission-acceptance-2026-10-23.json#sha256=d098a6d9401b438ba9554bffae62f481f6618ceff3fd28dc2d20b30613e48ccb`。

登入查證曾錯用 Firebase password provider，兩次 `INVALID_LOGIN_CREDENTIALS` 不代表使用者提供的 Google 帳密失效；同一授權檔密碼已於正常 Google popup 成功登入。該診斷更正不修改任何帳密、grant 或 IAM。測試圖號仍顯示預覽失敗，按既有 drawing-preview／native-CAD 待辦保留，未納入 RD 權限阻擋。本次只關閉優先項目 2 的權限切片；管理員辨識、PDF、supplier、完整原生 CAD 與原 7 issues／29 groups 仍未完成。

<a id="f01b-preview-worker-lease-v2"></a>

### F-01B 共用 worker lease 與正常取消（2026-10-23，本地安全實作／受保護 source 交付切片）

本切片保留第一個 `output/qa/dev122-cancelled/red-route.json`（7 案中 6 個失敗）；其中缺憑證的原 oracle 401 已依既有 workload 契約校正為 403，不冒稱產品修正。原 cancellation-only 施工方向由以下共用 v2 協定取代；不把原 red 與後來擴充套件稱為同一分母的 red/green。根因涵蓋整個 lease-bound 介面：`locked_by` 為穩定 workload actor，不能區分同 actor 的前後兩次領取。現行正常 upsert／force reset 不重設 `attempt_count`，claim 才遞增；因此沿用此欄位及 `locked_at`，不新增 schema 或另一套資料治理。

最小共用協定為 `leaseProtocolVersion: 2`（JSON number）。claim 在呼叫 service／stale recovery 前確認版本；來源與 exact canonical owner 的鎖定／核對納入同一 claim transaction，失效不得留下 running；所有成功 JSON 回應（含 `job:null`、heartbeat `ok` 及 completion `accepted`）均 echo 此版本；binary content 回應以 `x-pdm-preview-lease-protocol-version: 2` echo。client 缺少／錯版 echo 必須停止，不能視為 idle、讀取 bytes 或啟動 renderer；內容協定不符亦不得送 failed 或其他 terminal。claim 回傳 **UPDATE 後** 的 server-owned `leaseBasis:{companyId,sourceFileAssetId,sourceContentHash,attemptCount,lockedAt}`：前兩欄為不含控制字元、無首尾空白、UTF-8 長度 1–256 bytes 的 ID（含 escaping 後整個 envelope 仍須符合總 byte 上限，claim UPDATE 前驗證可表達性）；hash 為 64 個小寫 hex；attempt 為 1–3 的整數、永不重設；lockedAt 為 claim 寫入的 UTC ISO 毫秒字串（`YYYY-MM-DDTHH:mm:ss.sssZ`，需 canonical round-trip）。heartbeat 及 succeeded／failed／skipped／cancelled completion body 均必須有版本與完整 basis。content GET 使用 `x-pdm-preview-lease`，內容為同一 `{leaseProtocolVersion,leaseBasis}` JSON 的 canonical 無 padding base64url，header 最長 2048 字元、解碼後最長 1536 bytes，拒絕非 canonical encoding、非法 UTF-8／JSON／欄位。所有介面先驗 workload actor／purpose；缺漏／非法版本、basis、未知 completion status 為 400。有效但舊 generation／非目前 running lease／來源或公司不符為 409，且不改 job、source、derivative 或 object。basis 只作 optimistic fence，不是瀏覽器提供的身分或權限來源。

共同 guard 核對 job ID、running、伺服器認定 actor、完整 basis、目前來源有效性及 heartbeat freshness（PostgreSQL 的 claim lockedAt／freshness／recovery cutoff／heartbeat／terminal 皆採 DB `statement_timestamp()`，與 DB updated_at trigger 同一權威；SQLite 才沿注入 app/test clock。age >= 30,000ms 即拒絕，lockedAt 不是 freshness）。source／owner 鎖取得後才觀察 freshness；claim／heartbeat 最終 UPDATE 以 PG statement／transaction timestamp 原子拒絕已耗滿 30 秒的交易，heartbeat 同時比較當下 job freshness，避免既有 now() trigger 寫入過期時間仍回報成功。不修改 production trigger 或延長租約。每個 heartbeat／終態 UPDATE 必須在最終 SQL 原子比較完整 basis、目前來源與 admission 的 updated_at，不能只 pre-SELECT 再 legacy UPDATE。終態一律清除 locked_by／locked_at、設 completed_at；取消原因只接受 `operator_shutdown` 並由 server 產生固定 code/message。force reset 保留 attempt_count；已達 3 次不得重排成永遠無法領取的 queued，拒絕且零 mutation。兩個 Windows callers 同步；local fake direct queued/running 接手及無 fence 寫入明確退役／拒絕，env 也不能放行歷史 fake 產物，claim／recovery／所有讀取均排除歷史 fake jobs／derivatives。已領取的 real job 若來源日後刪除／hash 或公司關聯失效，舊 worker callback 仍零副作用拒絕；獨立、已授權資源或 workload scope 的 stale recovery 只對 running age >= 30,000ms，以 status/attempt/locked_by/locked_at/heartbeat/company/source/hash/來源仍失效的 CAS 只將該 job 終結為 failed/preview_source_unavailable，避免永久 running；invalidSourceTerminated 計數與 valid-source recovered/queuedUnclaimed 分開，不重排失效來源、不碰 invalid queued、不寫業務檔或產物。

來源 read 在 storage 前後重驗；後驗須在 readonly repeatable-read 快照之外的新觀察，比較完整 basis 及來源完整性／指標（hash、size、ext、deleted、owner relation、provider/bucket/key/generation/legacy path），再回傳 bytes。成功 completion 在首次 storage write 前鎖定 job、file_assets 的完整 pointer 及由 linked_entity_type/id 解析的 exact canonical owner row（既有四種 type，驗 company），維持至 final CAS／commit；不得只鎖 asset 而留下 owner company 關係競態；storage 後重驗來源與 basis。freshness 於 admission 確認，不因自己持鎖阻塞 heartbeat 而誤判可被 recovery 奪取。含 storage 的 transaction 明確採 writable repeatable-read、callback 單次執行；禁止 serializable 自動重試。每次寫入使用不可跨 claim 覆寫的新 object key；現有 GCS create-only 及 local dedup 語意保留。GCS runtime 明確禁止 delete，local dedup 亦可能回傳共享物件，故不得以盲目補償 delete 偽造跨 DB/storage 原子性。put 失敗且已確認 DB rollback 時，不發布半套 derivative，可能的 orphan 保留不刪；若 COMMIT ack 遺失，不能推定 rollback 或物件不可見，須按 job/attempt/key 只讀 DB 與 storage 對帳。任一未知結果停止所有重送，仍未知就停並如實標示，不把未知寫入報成 failed/rollback；清理需另有既有明確授權，不新增 delete 能力。

正常取消事件限定操作員 graceful SIGINT／SIGTERM，停止新 claim 及 job heartbeat，取消自己持有的來源 I/O／renderer child，再沿既有 completion 回報 `cancelReason:operator_shutdown`。heartbeat 409、非成功或未知回應則中止當次 render、停止此 worker 且不得送任何 terminal；renderer error／timeout 仍是 failed。取消／其他 completion 結果未知時不重送，也不落入 generic catch 接著送 failed。與其他 completion／recovery 競爭只有一個 generation CAS 可成立。已取消保持 409 `PREVIEW_CANCELLED`、retryable=false、`x-pdm-preview-state=cancelled`、body 一致且無 Retry-After，重複 GET 不清終態；原檔 bytes/hash/download 仍成立，mounted UI 停止 timer、unmount 靜默。B73 `B73-F01BC-normal-producer-readonly-reconciliation.json` 已明載 parentLockMounted=NOT_RUN、normalPreviewCancelledProducer=NOT_FOUND，workCancel 並非 preview-job cancellation；這是兩個獨立缺口。SIGTERM producer 不能代替 parent-lock mounted/refusal，後者只有相符舊證據可採用，否則待驗。

驗證分為 route/service 拒絕、正常 native claim→worker stop→cancel、同 actor recovery/reclaim 的所有舊動作零副作用、storage 前後 race、fake bypass 拒絕，以及 terminal bytes/hash/download 與 mounted timer/unmount。native closed13 保持五組 freshness／stale／exhaustion／queue 分母，但以 28s/31s 與 118s/122s 觀察窗承受真實查詢耗時；精確 29,999/30,000 與 119,999/120,000ms 在 focused 注入 clock 回歸，真實 DB clock 另以 Node +31s skew 與正常 second lease cancellation 驗證，不混稱同一層級。只用 task-owned disposable PostgreSQL／repository，不以正式撤權、上傳、人工 UPDATE 或 seed terminal 狀態取得 producer PASS。舊 fixtures 與原始失敗保留原層級。

本協定是同專案 worker API 相容變更。正式 rollout 必須先停止舊 worker processes，發布 server、核對 v2 echo，再啟動並讀回兩個 v2 worker processes／實際呼叫；source hash 不是 process 證據。舊 client 在 claim/recovery 前 400 拒絕，不消耗工作；新 client 對 400 與 missing echo 為 configuration failure、不持續重試，遺留 lease 只由正常 stale recovery 處理。本地 source／CI 不代替 rollout 或正式業務驗收；這輪不部署、不改正式資源／資料，未證明前不宣稱 F-01B 或原 7／29 通過。

本地證據（不提升原 7／29）：focused route/service/client/mounted UI、materialization、typecheck、lint、DB boundary 與 isolated build 分別記錄於 `output/qa/dev122-cancelled/`。PostgreSQL 原選 5 案 `fa621f2fd87c7154` 與 closed13 `7b9d079d0997b08a` 全選定案例 passed，runner 維持 `PARTIAL_NOT_ACCEPTED`／非零退出以保留整體未驗收，不稱 full suite PASS；兩者 source-binding before/after 相同且 PG／port／children／temp 均清理。正常取消 producer 是共用 Node SIGTERM handler 經實際 route/native PG、signal 由 test EventEmitter 注入；不是 Windows OS signal、實體 CAD renderer 或 Production worker rollout。新租約 skew 案保留已驗 actor/attempt/locked_at、用既有 fixture ledger 建 stale-running 輸入，再以 Node +31s／DB real clock 驗 old 409／current 200，無 terminal seed。首敗 `fbae4f0a05424bc8` 與先前已過但時鐘 authority 不完整的 `27e57d875c294b89`／`17990ee2391169ad` 均保留，不覆寫或改標最終來源 PASS。第一輪 isolated build 缺少新 worker module/types 的 FAIL 保留，固定補入兩檔隔離輸入後第二輪 `artifact=true／primary=true／cleanup=true`。本切片沒有 DDL／migration；Production 部署、OS worker 升級與 parent-lock mounted/refusal 仍未執行。

最終 diff audit 補齊 heartbeat／complete JSON echo 與 binary header handshake；缺版／錯版停止，unknown terminal 不重送。真實 PG 新增第六案，以實際 source row lock 各等待超過 30 秒，核對 claim 無 mutation／heartbeat 409，再正常 recovery、reclaim／cancel；原五案及 closed13 案例保留。首次新案在既有 30s SQL timeout 安全拒絕，原 FAIL 保留；後續只於該隔離測試 transaction 以 SET LOCAL 將 statement timeout 設為 40s，以實際等待 31s 到達獨立 lease-age 守門，driver 35s limit 與 production 設定／schema 均不變。skew 案讀回實際 migration 安裝且啟用的 BEFORE UPDATE now() trigger，Node +31 秒持續到 accepted cancellation 與 terminal cancelled／locks null／completed_at／DB basis 斷言完成。結果依 `output/qa/dev122-cancelled/` 與各 native manifest 原始讀回，不將先前五案當新增鎖等待案。FULL gate 曾於既有 sealed READY-chain fixture 缺 `entrypointSnapshot` 首敗；只補 verifier 方法承接，不放寬 production transport 或 required gate，原 FAIL 保留。 最終本地 focused 174／174、materializer 8／8、typecheck／lint／DB boundary 通過；native `b3286b9c2da8a3f9` 六案及 `3ffd6f56208773da` closed13 全部選定案例 passed、firstFailure=null、cleanup 全 true。runner 仍為 PARTIAL_NOT_ACCEPTED；先前 `98a02d0e52225f16` SQL timeout 首敗不覆寫。兩份 native before/after source binding 各自相同；本段後補結果只改文件，server／worker／SQL 測試輸入未變，不當新 raw source binding。

### F-01A／F-01C／F-01E 附件讀回與預覽呈現（2026-10-23，本地切片）

從 protected main `b497b9c3` 分開承接檔案／UI correctness，不混 I-01 SQL 或驗收 runner 改動。DELETE／restore 的 2xx 與後續清單 GET 分開：接受後立即撤下舊清單／預覽，重載失敗明示操作已完成與 GET-only 重載；命令拒絕保持原拒絕，不把 GET 失敗變成新 mutation。2D 詳細預覽分別呈現 cancelled、skipped、succeeded 但無相符輸出的終態，保留 no retry 並在原 preview card 承接受控原檔下載，不新增預覽工作。

共用 media-type normalization 只移除參數、trim 與轉小寫，套用於 PDF selector、slot、asset resolver、OCR source／response guard、上傳分類與檔案標籤；保留 extension priority、PDF bytes／content-hash、Principal／company、來源 hash 與 fake derivative 拒絕。內部受控 derivative MIME union 不擴張。原 red、預覽卡缺下載與 metadata caller red 保留於 `output/qa/dev122-files-ui/`；聚焦回歸 120／120 是純函式、合成 DOM／SSR、mocked HTTP 及只載入 adapter 的原生 Node 子程序證據，不是 Production mounted UI／真實 OCR、worker 啟動或 RD actor 驗收。原生 import red 證實 Node 入口無法解析新增的 app alias，僅改為既有 TypeScript 設定允許的相對 `.ts` import；未變更 worker 入口／程序。附件成功與 GET 恢復皆核對有效／已刪除兩個清單及 mutation 只送一次。第一輪缺 import 及測試把已刪除區誤當有效清單的失敗亦保留，未改標 PASS。本切片無 DDL／migration，不部署或修改正式資料，原 7／29 與正式登入阻擋不變。

### 生命週期 runner 的選測與證據歸屬（2026-10-23，本地切片）

未修改來源的 native baseline `311f3ad3ff4ec162` 實跑 64 PASS／0 FAIL，但跨公司拒絕案例被 skip，靜態 coverage 仍列 P-03B；第一次缺 runtime 登記而在測試前停止的 `5616ca24a04002d7` 保留為 setup failure，不當成產品失敗。一般 `lifecycle/all + selection=suite` 現在同步建立 other fixture 並執行必要拒絕，以 group 對應的 exact fullName 恰一筆 PASS 守門；missing、skip、pending、failed、duplicate 均拒絕。原始 report、case 結果與 gate mismatch 先保存，既有 firstFailure 不被覆蓋；其他 suite 的預期 skip 不構成失敗，UI prerequisites 不擴張。

G-03B 原有 mapped-counter 案例確實已執行，原 object-each 名稱卻在 Vitest report 被截短；改用完整字串標題，保留 oracle，coverage 從實際 case 結果推導。窄 selector 只列真正執行的 partial attribution，不再照抄整套 lifecycle。P-02A 的保存失敗 UI 行為與 P-02C 的 Part readiness HTTP／mounted UI 均不由 native helper 證據冒稱完成。TX-01D 是既有 audit 的 bounded evidence attribution，沒有新增獨立契約 gate 的依據；原 Part rollback 案例仍由 TX-01A／B、Drawing rollback 由 TX-01A／C 保護，不新增分母或把稽核升格成整組 PASS。

最終完整 native `f7d8adeb85bda9e9` 為 65／65、other-company 窄選 `359ba2bcf564fb05` 為 1／1；兩者 sourceUnchanged 與 cleanup 均 true，helper 及其 unit test 一併綁定。gate regression 10／10、typecheck、增量 lint、planner／release-core／database 與 DB boundary 通過；基準 report 的 gate red 及各輪原始證據保留在 `output/qa/dev122-lifecycle-coverage/`。runner 仍為 `PARTIAL_NOT_ACCEPTED`（包含既有非零退出），原 7 issues／29 groups、正式 RD actor 與其他未執行責任不變。本切片只改測試工具、fixture 選取及直接文件，無產品邏輯／DDL／migration／部署／正式資料操作。

### I-01A／I-01C 採購讀取一致性（2026-10-23，本地切片）

以 protected main `06874f97` 為基準，隔離 PostgreSQL 重現同 item 的兩筆 Released 歷史在有效時間相等時同時進入 latest 清單；使用與既有排序相同的 `(COALESCE(released_at, updated_at, created_at), id)` 比較，時間相等只保留 ID 較大的一筆。公司、Released 狀態、submitter 與 200 筆上限不變。另以 route fixture 重現有效 `since=1970-01-01` 解析為 0 後被 truthiness 略過，改以 `since !== null` 套用原嚴格晚於語意；缺少／invalid since 的既有行為不變。

新增 native 案分別驗 released_at 同時與 released_at 為 null 時的 updated_at 同時，並核對較大 ID 的舊時間、未發行與其他公司資料不能取代當前合法結果，清單讀取不改 lifecycle。第一輪 fixture 違反既有版本唯一性限制的 FAIL `61898dc8317a55f5` 保留；改成不同合法 revision 後的真實 SQL red `9ed35dc04451157a` 與 route epoch red 保留。結果見 `output/qa/dev122-i01-consumer/` 及各 native manifest；這些是本地歷史讀取 fixture，不是正式資料影響、P/G 生命周期成功或 Production UI 驗收。本切片無 DDL／migration，不部署、不改正式資料；原 7／29 未驗收分母與其他延期範圍不變。

### P-03B／F-01A 決策拒絕與附件重載提示（2026-10-23）

修前 exact deployed tree `8a586471e5eb9b29a5ca53654468a35ab2e6dba5` 的決策 API 回覆 403 `{error:"permission_not_granted"}`，但審核包只解析 nested message，造成通用失敗提示。本切片只在決策回應對此 exact code 顯示請公司管理員確認有效工作區指派與 `approval.request.decide`、更新後重新整理的提示；留在原 `/approvals/:requestId`、保留選取與快照，不導向未證實的設定頁。API 拒絕及既有寫入前權限檢查不變。

同一切片修正附件 POST 成功後吞掉清單 GET 失敗的問題：只有重載成功才顯示上傳成功；重載失敗會提示「上傳已接收，但附件清單重新載入失敗，請重新整理後確認」、撤下舊清單與預覽，重新載入不重送 POST。隔離 DOM component 與 route 測試覆蓋這兩個原始失敗及成功／相容路徑；required CI 納入相同測試。此為本地修正與 PR 待交付狀態，不是正式上傳／下載、bytes／hash／audit 或 P-03B／F-01A／UI-01 整組 PASS。保留 B79 synthetic、hard-deadline／EBUSY 與原失敗，原 7／29、F-01F 使用者待驗及 supplier 延期不變；不透過正式撤權、上傳或 409 替代 403 製造案例。

### Part 附件正常入口（2026-10-23，修正待正式驗收）

正式 RD 正常料號抽屜仍顯示「管理附件」，但附件頁被早期 production slice 改寫為「未開放」；一般附件 GET 可讀，頁面及後續寫入入口不一致。此為原 D05／F-01A／UI-01 正常附件上傳、重載與下載範圍，不能以隱藏入口刪除驗收。

修正只讓 active slice 的 `/parts/:id/attachments`、附件 collection POST、item DELETE 與 item restore POST 抵達既有 owner。Principal、published `numbering.attachments.manage`、公司範圍、交易、稽核與撤銷檢查不變；未知 slice mode、其他方法、額外子路徑、Drive sync 與手動 preview regeneration 仍拒絕。修前 middleware 回歸已重現封鎖；修後本地測試不代表正式上傳、預覽、下載或整體 7／29 已通過，仍須發布後以專用測試帳號正常操作驗證。

Required CI 首次仍以舊靜態規則禁止附件 restore／DELETE；同一切片同步精確三條 owner 路由的靜態 allowlist，保留原失敗。該既有 runtime slice checker 歸 application／authorization 選測；未知腳本維持 FULL，不因修正正常入口重播無關 worker 或資料庫歷史。

### RD 圖號工作台歷史恢復點（2026-10-20 起）

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

PR #438 已以 exact main `78cdd4da82cbce04042076ba3761bfb56f54ee78` 合併，exact-main required CI run `39732218893` 兩項 required checks 均 SUCCESS。正式 run `39733602118` 通過 `readOwnerRun` 後，在 capsule refresh 以 raw `DENIED:403` 停止；所有 effective capsule 與 owner release stages 均 skipped，沒有 migration 085 重送、Job／DB／service／traffic mutation。raw provider 錯誤與可達呼叫鏈、repo IAM 及正式 prepare 的既有分流共同證明：refresh 把 Cloud Build list 錯送 deployer；該 read 應由 verifier，只有 exact migration Job／Execution read 應切 deployer。corrective 改為直接重用 verifier-primary + exact migration readback token 的共同 transport，保留 builder secondary proof 與 builder-only immutable writes，並刪除無獨立責任的 deployer transport instance；不新增 IAM、Secret、workflow、writer或平行 gate。正式發布須待 protected PR／required CI 後從 C110 continuation 續接；專用測試 actor UI／API 正負驗收與 DEV-122 原 7 issues／29 groups仍為 `NOT_ACCEPTED`。

同一切片的治理根因亦已收斂：舊 planner 將任何 release-control 變更視為跨產品 `FULL`，CI 再把 release-core 與 infrastructure、business storage、preview worker、Principal smoke、dependency audit、lint、DB與app build綁定。v3只有unknown path保留完整fail-closed；已分類release-control只驗source／receipt／續跑／provider routing／recovery，其他責任按實際changed path選擇。舊完整回歸466／466與abort 6／6保存為舊來源真實證據；新實際plan只選planner＋release-core，fresh 214／214 PASS（evidence SHA `ab1fd9c30d5740cb9201cf05ed7002d902960740f896ab5c39a90f2c8bcc3434`），未選gates不執行且其獨立缺陷改列各自修復，不阻擋或冒充本RD切片結果。required CI、來源保護、provider readback與正式rollback能力維持不變。

PR #439 合併 main `5da8c5a76144209eeaf9f04a9f7af9e787aa1b72` 後，PR與exact-main required CI均SUCCESS，且v3確實只執行release-core。正式diagnostics `39738097353`／`39738279784` SUCCESS；續接 `39738441291` 在所有owner stages前以`CONTROL_OWNER_RUN_READBACK_FAILED:403`停止、正式mutation為0。這證明先前Google provider路由已修復，下一個獨立邊界是GitHub owner-run API：refresh共同transport未持有GitHub專用token，principal workflow也未宣告`actions: read`。本修正於共同transport加入separate GitHub token並只在owner-run GET使用，workflow只增加GitHub read-only permission與capsule step token assembly；Google verifier／builder／deployer bearer仍不跨域，IAM／Secret／DB／service／traffic不變。

PR #440 合併 exact main `c93f250d004fadd14233b9c3b5be79501160f0c5` 且 required CI SUCCESS；正式run `39740283317`已成功刷新exact-main capsule，prepare首敗`RD_READBACK_PROFILE_DRIFT`，其後所有writer stages skipped。sealed producer profile與current raw profile canonical hash相同，35／34／33 probes亦相同；失敗只因principal-only executor把current `dataCutover.gateMode`投影為`HISTORICAL_ONLY`後，applied continuation又把整份mode-adjusted profile與歷史producer hash比較。corrective移除這個無關whole-profile gate，仍以sealed intent、083–085 exact probes、runner／Job／provider receipts、ledger35／085 APPLIED與no-mutation fail closed；並以實際失效形狀及probe drift負例回歸。production-slice routing亦解除database／worker／infrastructure對整套release-core的自動繼承；各功能缺陷只由自身affected slice處理，不能再阻擋本RD切片。正式發布與專用測試RD actor UI／API正負驗收仍未完成，原7 issues／29 groups仍為`NOT_ACCEPTED`。

PR #442 merge main `0face9e870d600d38c0730fb5e5d2e71aa347361` 的PR／exact-main required CI均SUCCESS，且非本切片關卡確實skipped。續跑`39746767600`已證實whole-profile gate移除有效，下一個首敗`REPAIR_DATA_CUTOVER_BASIS_INVALID`來自另一個同族過度治理：`profileForReleaseMode`已把非one-time-cutover路徑設為`HISTORICAL_ONLY`，prepare/build的repair call site仍無條件要求`NEUTRAL_AUTHORITY_LIVE`。本修正只在權威gate mode仍為`CUTOVER_OR_LIVE_AUTHORITY`時保留該阻擋；一次性cutover安全不變，日常RD continuation不再重消費已完成的cutover歷史證據。該run recovery SUCCESS且正式mutation為0；專用測試actor驗收及原7／29仍未完成。

PR #443 merge main `3d0e66bf95050b501f19a743c84f5be25d6acc3c` 的PR／exact-main required CI均SUCCESS。正式run `39752276582`未進入prepare或任何正式寫入，refresh首敗`DEV121_PREACTIVATION_CONTINUATION_INVALID`；直接原因是前次recovery已更新active control，C110模板baseline卻仍舊，且consumer要求跨attempt重播整段歷史。現行模型改以active control、failed owner run、live service／traffic、recovery proof及immutable applied-migration continuation組成唯一重試基線；prepare前失敗明確證明零build／零migration／零candidate，舊cutover、worker及receipt lineage不再成為後續consumer輸入。hash、source、service UID／image、rollback revision、unexpected stage與owner-run漂移仍拒絕。這是共用release state收斂，不是放寬RD授權或把其他功能缺陷改判PASS；專用測試actor驗收及原7／29仍未完成。

同一修正首次由 planner 誤判成 `FULL`：`preactivation-abort-continuation` 落入 unknown，`principal-owner-recovery` 因歷史檔名落入產品 authorization，導致 30 組全套檢查；完整真實 PASS 與 evidence SHA `17da2fb671b5089951cd7bfa7355013de3c8d443d3d0f6a8620707d2936ea6d5` 保留，未受影響 OpenSWX worker 單組約耗時 327.5 秒。分類器改以明確 release-state responsibility 優先，只選 planner＋release-core；catalog／grant／085／API／UI 的真正授權路徑仍依各自 changed path 選關卡，其他產品功能缺陷另立任務且不阻擋本 RD 切片。

PR #444 merged main `a563bd1b93be132227da2b884dd6e6ad5a673a1b` 的正式 run `39756624774` 在 fresh intent 建立後、任何 build／migration／candidate／traffic 前，以 `DEV121_OWNER_RELEASE_PROOF_REF_INVALID` 停止並成功 recovery。直接證據顯示 applied-migration continuation 仍呼叫完整 owner source proof，因 C95 歷史 intent 帶有 OpenSWX worker 而遞迴重播其 descriptor／profile／deadline／provider history；這不是 catalog、migration085、grant、API或UI 漂移。corrective改由唯一 migration evidence reader只驗 source lock、prepare／migrate、bundle、runner、ledger35／085及recovery；現存worker runtime binding原樣帶過但不再讀取、重建、執行或驗收，workerless continuation也合法。OpenSWX自身缺陷移至獨立`DEV-124`，不阻擋RD且不被改判PASS。planner只選documentation＋database＋release-control；fresh planner17／17、release-core214／214、database27／27、DB boundary及production-shaped C95唯讀replay PASS，worker reads=0。protected PR／required CI、fresh正式續跑與專用測試actor UI／API正負驗收尚未完成，DEV-122原7／29仍`NOT_ACCEPTED`。

PR #455 合併 exact main `bc79d9233ec9afa80151c570b7dd1c0aafdbf2f4` 後的正式 run `39837407032` 在 prepare 停止；build／migration／candidate／traffic均未執行，正式服務仍為 source `c549271ab2ad906f41f369cd514e100d92211c21`、revision `ai-pdm-prod-aa547dcb1a9a`、100% traffic，原失敗收據保留。直接根因是 applied-migration continuation 雖只把 Principal recovery 當歷史 migration provenance，prepare與 abort／retry path仍把該歷史 recovery revision誤當 current runtime、traffic及rollback權威。corrective將 active Principal-only runtime 與已套用 migration continuation 分類：後者一律以 fresh intent 的 `previousRevision` 綁定 current deployment／candidate／entrypoint／rollback與 live traffic；歷史 recovery proof仍完整驗證但不授予目前服務權威。既有 candidate-null／`NOT_APPLIED` sealed failure只保留窄相容讀取；已形成 `HISTORICAL_EVIDENCE_REUSED` candidate chain的 `ROLLED_BACK` 必經 applied-continuation reader驗完整 chain，禁止送入 Principal forward-repair。此修正尚待 protected PR／required CI／fresh正式續跑與發布後驗收，DEV-122原7／29仍`NOT_ACCEPTED`。RD工作台、附件及PDF驗收可使用專用RD測試帳號，不要求真人RD；管理員智慧辨識仍須獨立管理員actor證據，兩者不得互相替代。

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
| infrastructure | IaC／resource contract及其protected gate | 未受影響產品與release-control歷史 |
| release-control | source／receipt／續跑／provider routing／recovery的release-core gate | app、DB、worker、preview、recognition、infrastructure、abort、audit、lint、build；除非該責任也有變更 |
| unknown | protected full fallback | 無 |

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
