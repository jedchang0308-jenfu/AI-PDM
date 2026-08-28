# QA-DEV-035：SolidWorks 原生屬性讀取與辨識診斷驗證計畫

狀態：`Local RD/QA-QC Complete / Current Real A0002 Repeatability PASS / Production Release Gated`
日期：2026-08-19
Owner：QA
風險：Medium
關聯：`DEV-035 / DEV-CAD-001`
Implementation authority：`.ai-doc/specs/SPEC-PDM-SOLIDWORKS-METADATA-READER-001-native-property-extraction.md`
Parent regression authority：`.ai-doc/qa/qa-dev-068-drawing-recognition-validation-plan-2026-08-12.md`
Fixture expectation：`.ai-doc/qa/fixtures/dev-035-a0002-property-expectations.md`

## 1. QA Objective

驗證管理員只透過UI即可安全保存、真實測試、啟用與rotation SolidWorks Document Manager key，既有recognition worker不需人工設定PowerShell／`.env.local`或restart便能套用exact version；再驗證受控 SolidWorks file/configuration properties 能由 trusted Windows reader 轉成 DEV-068 observations/candidates。reader 缺席、授權錯誤、worker offline、version未套用、來源不可讀、逾時或單檔失敗都必須誠實投影，不得偽裝成「啟用完成」或「屬性數量0」。

QA 同時驗證四條不可妥協的邊界：

1. source bytes 只能由 token＋active worker lock取得；
2. Document Manager key、command、path、stack 不得外洩；
3. 原 CAD 與正式 PDM 在人類確認前零修改；
4. native reader 失敗不得破壞 filename／其他 adapter、上傳、版次或送審流程。
5. `local_test_double`、compile-only、fixture、mask/fingerprint與reference active均不可替代real provider／native probe／worker ack／A0002 evidence。

## 2. Entry Criteria

- DEV-035 authority與historical 22-file baseline、current 39-file implementation delta及實際unique manifest同步，沒有未記錄direct file。
- `PDM_DRAWING_RECOGNITION_V1=true` 只在 isolated local QA runtime啟用。
- disposable worker/service tokens；local gate使用使用者已由UI提供的合法Document Manager key與受控A0002來源，但禁止把key寫入evidence，禁止production DB／bucket／traffic或未授權正式worker。
- deterministic raw-property fixture與expected mapping已固定；fixture mode在 production必須 fail closed。
- RD 提供 affected-file list、038 additive migration／rollback判定、commands、known limitations與runtime cleanup owner。
- local/test provider必須是`windows_dpapi`或等效已核准secure provider；`local_test_double`只供negative／simulation cases。
- 合法Document Manager key、interop DLL、online recognition worker與受控A0002 FileAsset是DEV-035 completion entry condition；缺一時整體記`BLOCKED / DEV-035 remains open`，不可用mock宣稱PASS。

## 3. Risk Matrix

| ID | 風險 | 等級 | 必要證據 |
|---|---|---:|---|
| R-035-01 | reader 未執行仍顯示0屬性 | P1 | unavailable/empty對照 API＋browser evidence |
| R-035-02 | `j_drive` source沒有傳入reader | P1 | source-content success＋hash一致＋staged execution |
| R-035-03 | token/lock/company缺口造成CAD外洩 | P0 | negative API matrix，response零bytes／零存在性提示 |
| R-035-04 | key/path/command/stack外洩 | P0 | log/API/DB/DOM/evidence redaction scan |
| R-035-05 | configuration owner錯指到別的Part，或同碼正式／草稿row被誤判成多個owner | P0 | anchor／layer-dedupe／suffix／ambiguous matrix，wrong-owner=0 |
| R-035-06 | 空值被當成`無`或清除 | P0 | empty property blocked，formal table零clear |
| R-035-07 | identity draft input誤成canonical identity直接寫入 | P0 | draft candidate可預填＋impact exclusion＋canonical DB before/after hashes |
| R-035-08 | timeout留下child/temp或失鎖仍complete | P1 | exact PID tree／temp inventory／409 recovery evidence |
| R-035-09 | native failure導致整批結果消失 | P1 | two-source partial case，successful observations保留 |
| R-035-10 | `drawn_by_name`擴充造成正式化partial write | P0 | impact、atomic apply、forced rollback／idempotency |
| R-035-11 | 同一舊owner問題在每個欄位重複警告、或真實衝突被隱藏 | P1 | 單一batch recovery＋cross-source conflict對照＋3 viewport＋a11y＋DOM count |
| R-035-12 | A0005／OCR／filename／startup regression | P1 | parent aggregate regressions |
| R-035-13 | test double丟棄key卻顯示啟用成功 | P0 | activation deny＋rendered truth-state evidence |
| R-035-14 | UI後設key但worker需restart／env才生效 | P1 | pre-running worker hot-apply＋exact version ack |
| R-035-15 | rotation/revoke仍沿用process.env舊key | P0 | per-job version matrix＋global env 0 secret |
| R-035-16 | 2D preview online誤代替recognition worker ready | P1 | capability-separated heartbeat／UI projection |
| R-035-17 | DPAPI ciphertext、ACL或helper I/O洩密 | P0 | blob/ACL/stdin/args/log/redaction matrix |
| R-035-18 | static evidence再次被誤算為capability完成 | P1 | completion-gate QC必查real adapter row／observations |

## 4. Static Contract and Inventory Gate

`qc:dev-035-contract` 必須重新計算，不可硬信文件數字：

- historical 17 product＋5 QC baseline、current 26 product＋13 validation delta全部存在且出現在manifest；unique set依實際path去重。
- 新增 source-content route只有 GET，含 token、worker ID、session/source/lock/company/deleted/hash/size guards與`no-store/nosniff`。
- source route不得回 `originalPath/storageKey/storageProvider/signedUrl`。
- credential route沒有browser權限；DB沒有plaintext或ciphertext；local ciphertext只在DPAPI store且ACL符合SPEC。
- C# source不含 `Save(`、`SaveAs(`、`SetCustomProperty`、`AddCustomProperty`、`DeleteCustomProperty`、`ReplaceReference`。
- Next.js/React files不import SolidWorks interop或啟動 native process。
- production source不存在fixture enable-by-default或`PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK`放寬；local launcher不要求日常env key。
- `drawn_by_name`只新增於 drawing metadata read/write allowlist；identity keys可作draft input，仍由 impact exclusion排除直接canonical write。
- provider check、`settings_secret_probe_jobs`、`worker_capability_heartbeats`、SQLite initializer／base schema／PostgreSQL 001／038 migration同義；shadow migration、indexes與rollback rehearsal PASS。
- `local_test_double`不能被mark tested/active；Settings的ready projection是active＋real probe＋worker online＋exact-version ack AND gate。
- drawing worker不把key寫入global `process.env`，且無key仍啟動／heartbeat；metadata command readiness不再依key存在才設定。

## 5. Validation Matrix

### 5.1 Raw extractor and mapping

| ID | Scenario | PASS condition |
|---|---|---|
| QA-035-01 | A0002 deterministic raw fixture | 8個expected properties/value/category/key/owner/write policy逐字符合fixture |
| QA-035-02 | File-level properties | `locationKind=file_custom_property`、configuration null、source/hash/reader/version可追溯 |
| QA-035-03 | Configuration properties | 每筆保留exact configuration；不與document scope誤合併 |
| QA-035-04 | Linked expression/evaluated value | evidence保留兩者；candidate value採last-saved evaluated value，UI不宣稱即時值 |
| QA-035-05 | Empty value | property仍存在；raw/normalized null、candidate blocked，不轉`無`或clear |
| QA-035-06 | Unknown Chinese property | 原name/value/scope保留在unclassified，stable key無collision |
| QA-035-07 | Alias normalization | NFKC、全半形括號、英文case/space按spec匹配；同profile collision使QC fail |
| QA-035-08 | Exact part anchor | 同scope `料號=A0002-P01`把part fields指向唯一A0002-P01；正式與有效草稿同碼時去重為一個邏輯owner並優先正式ID |
| QA-035-09 | Configuration full/suffix match | full part number優先；唯一P01 suffix可用且confidence=medium/high依spec |
| QA-035-10 | Multi-part ambiguous | 無anchor／非唯一suffix且存在不同正規化料號時owner null、blocked；不得猜第一個邏輯part |
| QA-035-10A | Draft population review state | `candidate_revision/drawing_revision`的owner已解析非空值即使與正式值不同仍為proposed；`drawing_number`正式檢查仍為conflict，ambiguous owner仍blocked |
| QA-035-11 | Reader returns zero properties | adapter succeeded＋diagnostic `native_metadata_no_custom_properties`，health=`empty` |
| QA-035-12 | Malformed/oversized raw JSON | final validation failed、observation=0、無process crash／raw payload洩漏 |

### 5.2 Source bytes, worker and isolation

| ID | Scenario | PASS condition |
|---|---|---|
| QA-035-13 | Valid claimed `j_drive` source | canonical bytes下載成功、server＋worker hash/size一致、extractor收到staged path |
| QA-035-14 | Wrong/missing token | 401；response無bytes、path、provider、source metadata |
| QA-035-15 | Wrong worker/expired lock | 409；extractor未spawn、observation=0 |
| QA-035-16 | Cross-session/source/company | 404/409依contract；不得透露source是否存在 |
| QA-035-17 | Deleted/stale/oversize source | extractor前拒絕；stable code正確；無temp遺留 |
| QA-035-18 | Provider temporary failure | bounded retry，保留其他adapter；user API只見safe message |
| QA-035-19 | Heartbeat during slow source/reader | 5秒節奏維持lock；合法job不被60秒stale recovery重領 |
| QA-035-20 | Adapter timeout | exact child PID tree停止、temp清除、result timeout；未知node/SolidWorks process未受影響 |
| QA-035-21 | Retry policy | 只retry failed/timeout且不超過3次；validation/license/future-version不retry |
| QA-035-22 | Completion after lock loss | complete被拒絕，無adapter rows/observations；task-owned temp/child清理完成 |

### 5.3 Credential and redaction

| ID | Scenario | PASS condition |
|---|---|---|
| QA-035-23 | Existing env fallback allowed locally | key只進child environment；stdout/stderr/DB/API/DOM為0命中 |
| QA-035-24 | Existing broker exact version | metadata wrapper以preview worker token讀取；response no-store；key不持久化 |
| QA-035-25 | Broker 401/403/503 | `native_metadata_credential_broker_unavailable`，不回HTTP body/raw error |
| QA-035-26 | Broker 404/no-license/future version | stable unavailable/failed狀態與不同使用者copy；不盲目retry |
| QA-035-27 | Redaction sweep | key sentinel、project absolute path、storage key、command、stack在logs/DB/API/HTML/evidence命中=0 |

### 5.4 Projection, UI and recovery

| ID | Scenario | PASS condition |
|---|---|---|
| QA-035-28 | Ready with properties | 不新增成功banner；候選內容可見且health不搶主工作狀態 |
| QA-035-29 | Truly empty | 顯示「已完成讀取但沒有可用屬性」，不同於reader unavailable |
| QA-035-30 | Not configured/license missing | 嵌入式與完整頁都顯示reader尚未啟用＋affected files；不得只見分類0 |
| QA-035-31 | Two-source partial | session=`extraction_partial`；成功候選保留，banner只出現一次並列失敗檔 |
| QA-035-32 | Configured reader failure/timeout | `role=alert`、安全恢復文案、重新辨識可用，無raw code/path |
| QA-035-33 | Adapter health API sanitization | 只含allowlisted state/code/message/retryable/source id/name；raw diagnostics不出API |
| QA-035-34 | 1440×900 / 1024×768 / 390×844 | banner不裁切、不雙scroll、不遮CTA；affected list可讀且不形成warning wall |
| QA-035-35 | Accessibility | icon＋文字非color-only；status/alert語意、閱讀順序、keyboard、focus與live announcement正確 |
| QA-035-36 | Console/network sweep | unexpected console error、unhandled rejection、5xx、failed resource=0；受控failure fixture除外且UI已處理 |

### 5.5 Formalization and regression

| ID | Scenario | PASS condition |
|---|---|---|
| QA-035-37 | Identity impact | 品名/料號/3D圖號/版本全部`identity_evidence_only`，canonical tables零變更 |
| QA-035-38 | `drawn_by_name` impact/apply | impact只指向exact drawing revision；確認前0 write，確認後exact一筆metadata delta |
| QA-035-39 | Part attributes apply | material/surface_finish/heat_treatment只寫exact linked part，open definition受既有DEV-068治理 |
| QA-035-40 | Forced target failure | candidate/metadata/attribute/event/link/session terminal更新全數rollback |
| QA-035-41 | Idempotency/stale target | same key same payload不重複；mismatch/stale 409且零額外write |
| QA-035-42 | Native adapter partial semantics | filename/fixture/OCR既有成功結果不遺失；upload/revision/submission eligibility不變 |
| QA-035-43 | A0005 regression | DEV-068 fixture candidate counts、owner、baseline、impact、formalization仍PASS |
| QA-035-44 | DEV-079/startup regression | embedded panel、full review、local launcher、recognition worker health與2D worker獨立狀態正確 |

### 5.6 Required real A0002 gate

| ID | Scenario | PASS condition |
|---|---|---|
| QA-035-45 | Real licensed Document Manager read | 受控 A0002 source hashes符合fixture expectation，reader非fixture且raw contract成功 |
| QA-035-46 | Real A0002 values | 八欄值逐字符合；file/config scope與owner符合實際檔案 |
| QA-035-47 | Original-file immutability | reader前後 SHA-256、size、mtime evidence一致；無Save／CAD write |
| QA-035-48 | Real rerun repeatability | 同source hash連續兩次raw/mapped values一致；session/evidence IDs可不同但domain output一致 |

`QA-035-45～48` 缺合法key／interop／受控檔案時標`BLOCKED`，DEV-035維持open；不可把fixture結果填入45～48，也不可只因QA-035-01～44通過而稱本機實作完成。

### 5.7 UI-only secure activation、hot apply與truthful readiness

| ID | Scenario | PASS condition |
|---|---|---|
| QA-035-49 | Local UI secure save | 只由Settings UI輸入key；reference provider=`windows_dpapi`，DB無plaintext/ciphertext，DPAPI blob存在且ACL正確 |
| QA-035-50 | Test-double activation deny／legacy active | `local_test_double` test/activate皆blocked；Windows非automated-test runtime誤設provider時新draft強制用DPAPI；既有active reference也投影為模擬不可用；第一個real-provider activation原子retire舊reference且保留events，無綠色ready／啟用完成 |
| QA-035-51 | Real native credential probe | worker實際載入interop並取得Document Manager application；test run記exact version/reader與safe code，不含key |
| QA-035-52 | Invalid key | real probe failed；reference不能tested/active；UI就地顯示可恢復錯誤，舊active不中斷 |
| QA-035-53 | Worker started before key | worker先以no-key online/blocked啟動；worker-side command discovery即使launcher未帶metadata env也能找到wrapper；credential未ready時不得claim recognition job或產生`unsupported/0`；UI save/test/activate後30秒內轉ready，PID不變、無人工restart |
| QA-035-54 | No shell/env dependency | 啟用前後`PDM_*DOCUMENT_MANAGER_KEY`均未人工設定；`.env.local`不含key；辨識仍成功 |
| QA-035-55 | Restart persistence | 受控重啟web與task-owned worker後不重貼key即可重新online、ack同active version並辨識成功 |
| QA-035-56 | Exact-version AND gate | active、probe、online、ack四條逐一缺失時都不是ready；全滿足才顯示可用 |
| QA-035-57 | Capability separation | 2D preview online／recognition offline與反向case各自正確；一者不得替另一者背書 |
| QA-035-58 | Rotation without downtime | v1 active時建立/test v2不影響v1；activate v2後新job用v2，in-flight job保留v1，worker PID不變 |
| QA-035-59 | Revoke/rollback | revoke current後新job無key且blocked；由UI啟用上一個tested version後自動恢復，不restart |
| QA-035-60 | Child-only secret boundary | key只在provider read／broker response memory／當次native child env；global process env、args、stdin job JSON、DB/log/API/DOM/evidence 0命中 |
| QA-035-61 | Probe job isolation | wrong token/worker、stale lock、timeout、duplicate claim均fail closed；無orphan child/job lock，safe result only |
| QA-035-62 | Schema/migration parity | SQLite fresh/existing、PostgreSQL 001＋038 shadow apply、provider constraint/index/rollback rehearsal全部PASS |
| QA-035-63 | Settings rendered matrix | 1440/1024/390顯示missing/testing/failed/applying/ready/offline/revoked；keyboard/focus/touch/overflow/visible-error sweep PASS |
| QA-035-64 | Completion audit | completion script解析active`☐ DEV-035`且在未完成時不能回「no local open task」；結案時另直接查real A0002 session：native adapter succeeded、observation>0、八欄符合、worker ack exact version；mock/compile-only不能滿足 |

## 6. Actor, Tenant and Permission Matrix

- Settings draft/test/activate/revoke：只允許既有system/PDM Admin permission；RD、RD manager與read-only actor均403，且response不得透露reference是否存在。
- probe claim/heartbeat/complete與recognition capability heartbeat：只允許正確service token＋worker ID；browser session即使Admin也不可直接呼叫worker route。
- source-content API：只有正確worker token＋active lock；任何登入browser actor直接GET皆拒絕。
- session projection：RD owner/assigned、RD manager、PDM/system admin依既有DEV-068 scope；read-only actor不能run/review/formalize。
- cross-company actor：session、adapter health、source name、raw property、formal value都不可洩漏。
- 角色只影響actionability，不得改寫相同session的native metadata health事實。

## 7. Evidence Standard

Evidence root：`output/qa/dev-035-solidworks-metadata/<run-id>/`

至少包含：

- `run-manifest.json`：worktree identity、DB provider、feature flags、actor/company、commands、historical baseline＋reopen delta＋actual unique inventory；
- `mapping-matrix.json`：raw fixture→8 expected＋unknown/empty/config cases；
- `source-access-negative-matrix.json`：token/lock/company/hash/size results；
- `adapter-health-projection.json`：ready/empty/partial/unavailable/failed API snapshots；
- `redaction-scan.json`：key sentinel/path/command/stack的scan範圍與0命中；
- `process-cleanup.json`：spawn PID tree、timeout/exit、temp before/after、port/runtime owner；
- `formal-before-after.json`：identity/metadata/attribute/audit hashes與rollback/idempotency；
- `secure-provider.json`：provider ID、ciphertext blob ID／ACL結果、DB plaintext/ciphertext 0命中；不得含blob內容或key；
- `secret-probe-jobs.json`：valid/invalid/timeout/lock matrix、reader version、safe codes；
- `worker-capability-heartbeats.json`：online/blocked/applied version/fingerprint與rotation timeline；
- `hot-apply.json`：worker PID、UI action timestamps、v1/v2 job claim/apply evidence，證明未restart；
- `browser-matrix.json`、DOM snapshots、三viewport screenshots、console/network scan；
- 必須附 `a0002-real-reader.json`，只放hash、reader/version、secret version/fingerprint、scope/value結果，不放key或absolute path；
- runtime cleanup confirmation；歷史run不得覆寫。

## 8. Planned Commands

```powershell
npm.cmd run qc:dev-035:contract
npm.cmd run qc:dev-035:mapping
npm.cmd run qc:dev-035:worker
npm.cmd run qc:dev-035:browser
npm.cmd run qc:dev-035:secure-provider
npm.cmd run qc:dev-035:worker-hot-apply
npm.cmd run qc:dev-035:real-ui-activation-browser
npm.cmd run qc:dev-035:completion-gate
npm.cmd run qc:dev-035
npm.cmd run typecheck:app
npm.cmd run build:isolated
```

`qc:dev-035` 至少聚合：historical focused QC、四支reopen QC、DEV-068 schema/contract/API/formalization/browser aggregate、DEV-079 recognition embedded contract、master attachment/file-storage local regression、settings secret redaction/broker QC、local startup contract、migration shadow gate、affected ESLint、typecheck與isolated build。`completion-gate`必須是aggregate必要項；缺real provider／worker／A0002時整體明確`BLOCKED`，不得讓deterministic aggregate誤報PASS。

## 9. PASS / FAIL Gate

Local PASS 必須同時滿足：

- QA-035-01～64全部PASS；P0/P1 finding=0。
- wrong-owner、identity write、pre-confirmation write、partial write、secret/path leak、orphan process/temp皆為0。
- unavailable與empty可由API/UI清楚區分；兩個review surface文案一致。
- A0005、DEV-068 formalization、DEV-079 embedded UI、startup regressions通過。
- historical baseline、39-file delta、實際unique inventory、038 migration與evidence manifest一致。
- task-owned temporary runtime/process完成清理。
- UI-only secure save、real native probe、worker exact-version ack、restart persistence、rotation/revoke與real A0002 rerun全部PASS。

沒有QA-035-45～64 real evidence時，DEV-035只能記`Reopened / Partial Implementation Baseline / Real Runtime Evidence Missing`；不可記local complete。全部通過後才能記`Local RD Implemented / Real A0002 QA-QC Passed / Production Release Gated`；這仍不等於production-ready。

任一 P0/P1、cross-company leak、secret/path leak、original CAD mutation、wrong owner、identity mutation、失鎖後complete、orphan process/temp、未處理visible/console/network error即 FAIL並退回 RD；不得刪 assertion、改 expected fixture或降低severity掩蓋。

## 10. Independent QC Handoff

因本 DEV 風險為 Medium，獨立 QC 至少重跑：

- contract／inventory／redaction全量；
- valid source＋wrong token＋wrong worker＋cross-company＋stale hash；
- exact owner＋ambiguous owner＋empty＋unknown；
- unavailable／empty／partial／failed四種rendered states，三viewport至少各一張；
- identity zero-write、`drawn_by_name` exact write、forced rollback；
- timeout process/temp cleanup；
- UI-only local secure save、invalid-key、test-double deny、pre-running worker hot apply、rotation/revoke、restart persistence；
- 必跑real A0002 gate與completion audit；缺條件時確認DEV維持open／BLOCKED，不得簽PASS。

QC只能依rendered facts、DB before/after與artifact證據結案；RD self-check或mock reader不可單獨替代。

## 11. Stop Conditions

停止並回 Dev PM／使用者：

- 測試需要建立／修改production/staging secret resource、正式資料、正式worker部署、license採購／安裝或production deploy；使用者已在local UI提供的合法key與受控A0002不構成停止理由；
- 必須用 SOLIDWORKS desktop COM／Add-in 才能讀 required properties；
- 需要 schema migration、新canonical identity/relation write或放寬credential fallback；
- 原 CAD hash改變、任何secret/path leak、cross-company evidence、partial formal write、wrong-owner或無法清除task-owned process/temp。

## 12. Execution Record — 2026-08-19

以下為重開前的歷史partial baseline，不能再作DEV-035 completion evidence：

| 證據 | 結果 |
|---|---|
| `npm.cmd run qc:dev-035:contract` | PASS，16/16；含 source-content auth、pointer redaction、hash、heartbeat、process tree、cleanup、C# read-only contract、health projection。 |
| `npm.cmd run qc:dev-035:mapping` | PASS；A0002 八欄 mapping、unknown、empty、exact／ambiguous owner 與 ready／empty／partial／unavailable／failed health states。 |
| `npm.cmd run qc:dev-035:worker` | PASS；worker static contract 與 Windows Document Manager exporter compile probe。 |
| `npm.cmd run qc:dev-035:browser` | PASS；1440／1024／390 viewport matrix、embedded/full health banner、responsive/accessibility static checks。 |
| `npm.cmd run qc:dev-035` | PASS；以上四支 focused QC aggregate。 |
| `npm.cmd run typecheck:app` | PASS。 |
| Playwright rendered UI | PASS；已登入工作台與完整核對頁均顯示安全 native metadata health；390px 無水平溢位且 footer CTA 可見；console error=0。 |
| Document Manager compile-only | PASS；本機 interop DLL／C# compiler 可編譯 exporter。 |

Historical evidence artifacts：`output/playwright/dev-035-review-1440.png`、`output/playwright/dev-035-review-390.png`。上述run在當時只證明partial baseline與unavailable-state rendering，不能單獨作completion evidence；現行完成證據見§12.2。

### 12.1 Reopen evidence — 2026-08-19

| 事實 | 判定 |
|---|---|
| A0002-M01最新session三個native adapter均`unsupported`、0 observations，diagnostic為metadata command未設定 | 功能未完成；不是檔案真的0屬性 |
| active secret reference provider=`local_test_double`，metadata=`secret_material_not_persisted_by_local_test_double` | worker不可能由該reference取得key |
| 最近測試summary只驗證metadata lifecycle與redaction | 不是真實Document Manager probe；原PASS語意無效 |
| worker啟動時間早於key設定，且code把broker key放入process env | 不符合UI後設自動套用與rotation契約 |
| 035-E code已補上Windows DPAPI、real probe job、worker heartbeat/hot-apply與no-key不claim保護 | focused static／typecheck通過；仍須真實UI key、interop DLL與worker runtime證據 |
| `dev035-command-discovery-check-2` one-shot在未設定metadata/probe env下仍寫入blocked heartbeat，且未產生新的A0002 adapter result | worker-side command discovery與no-key queue guard通過；不等同real key/probe/A0002 PASS |
| completion gate已要求兩個獨立recognition session各自成功讀到A0002八欄且值／owner／scope可重現 | 重開當時為`BLOCKED`；active provider=`local_test_double`、probe=`null`、A0002=`unsupported/0` |

本節是重開時的historical failure record；後續Phase E→F完成事實與結案判定以§12.2為準。

### 12.2 Local completion evidence — 2026-08-19

| 驗證面 | 證據／結果 |
|---|---|
| UI-only secure activation | 管理員由Security UI建立、測試、啟用v3；provider=`windows_dpapi`。key未寫入PowerShell、`.env.local`、DB、log或evidence。 |
| Real native probe | `passed`；reader=`solidworks-document-manager-reader.v1`。 |
| Exact worker acknowledgment | recognition worker capability=`ready`，`applied_secret_version=3`且fingerprint與active reference一致。 |
| Controlled source | `A0002.SLDPRT`；495749 bytes；SHA-256=`15cd458b983e4dddd0836555dfa8eac0f4d3ac87c056403d4279ebbf3d3ec7f4`。 |
| Real run 1 | session=`recognition-7e08788c-9e47-4962-bebd-05f0fc4b29c3`；adapter=`solidworks-document-manager.v1`；status=`succeeded`；14 observations。 |
| Real run 2 | session=`recognition-376da831-c73e-4a86-bdaa-c6b41546b880`；adapter=`solidworks-document-manager.v1`；status=`succeeded`；14 observations。 |
| Eight-field acceptance | `品名=本體_BS_右_Xx5`、`3D圖號(主)=A0002`、`版次=0.1`、`製圖=朱宇鴻`、`料號=A0002-P01`、`材質=不鏽鋼SUS304`、`表面處理=無`、`熱處理=無`；missing/value/owner/scope mismatch均為0。 |
| Repeatability | 兩個獨立session使用相同source hash，non-empty normalized projection一致；`repeatable=true`。 |
| Empty semantics | document-level空`表面處理`observation仍保存且blocked，不被改寫為`無`；configuration-level明確`無`值滿足expected acceptance。 |
| File/adapter boundary | native reader只處理`.SLDPRT/.SLDASM/.SLDDRW`；PDF不再進native health，不產生誤導的SolidWorks partial warning。 |
| Browser fact | A0002智慧辨識頁已顯示上述八欄，沒有PDF native-reader假警告；Settings顯示v3 active、worker可使用。 |
| Aggregate QC | `npm.cmd run qc:dev-035` PASS：contract 16/16、mapping、worker compile、secure-provider 10/10、worker-hot-apply 12/12、real-UI 5/5、browser 3 viewport、completion gate全部PASS。 |
| Engineering gates | `typecheck:app`、isolated production build、`qc:doc-paths`、`qc:dev-task-evidence-sync`、`qc:source-boundary`與`git diff --check`均PASS；全專案completion audit僅因既有`DEV-065`維持7/8。 |

Focused automated gates與真實A0002 completion gate已滿足本機DEV-035結案條件。這不宣稱逐列人工重演QA-035-01～64，也不授權production migration／credential／worker deployment／release；這些仍由`DEV-032`與release gate管理。Sanitized evidence：`output/qa/dev-035-solidworks-native-reader/20260819T120907Z/a0002-real-reader.json`。

### 12.3 Draft population correction evidence — 2026-08-25

| 驗證面 | 證據／結果 |
|---|---|
| Root-cause fixture | Primary read-only snapshot中的同一`A0002-P01`同時存在canonical part與active draft part；舊session `recognition-dd5f0416-0b46-4ffa-b61c-06099f73f42c`因此有5筆非空part-owner blocked candidate。 |
| Mapping contract | `qc:dev-035:mapping` PASS；同碼canonical＋draft rows解析為一個邏輯owner並選canonical ID；distinct part numbers仍ambiguous。 |
| Review-state contract | `drawing_revision`的owner已解析非空值即使正式值不同仍=`proposed`；`drawing_number`差異仍=`conflict`；ambiguous owner仍=`blocked`。 |
| Static／type／lint | `qc:dev-035:contract` 16/16、`qc:dev-035:browser`、`typecheck:app`與affected ESLint PASS。 |
| Isolated real browser | `qc:dev-035:native-retry-browser` 24/24 PASS；full review與embedded workspace都只有一個layered-owner recovery入口，重複「需處理」已移除，舊批次整批接受被禁用，keyboard rerun建立queued successor。 |
| Responsive／runtime cleanup | Chromium 1440×900與390×844無水平溢位／console／page／network／HTTP failure；task port 57992 released，temp DB／repository／dist全清除，`next-env.d.ts`逐字恢復。 |
| Primary-data invariant | 主SQLite master counts、migration residue與global foreign key狀態的before／after hash完全相同：`5a4c3e06cab7d4474f87a6b0a90e812466df65a2d47e714400e714f3d8a866b1`。 |
| Evidence | `output/qa/dev-035-native-retry/DEV035-NATIVE-RETRY-2026-08-25T08-29-47-134Z/manifest.json`與screenshots。 |

Draft-population focused／isolated QA-QC已通過；2026-08-28再由canonical workspace正常「重新辨識」入口連續產生兩個採用現行mapper的真實A0002 session，兩者均為`solidworks-document-manager.v1 / succeeded / 14 observations`，八欄missing／value／owner／scope mismatch皆為0；相同495749-byte來源與SHA-256下，兩份現行projection hash一致。此repeatability只證明現行Reader＋Mapper evidence projection可重複；`configuration_name`／`applicability_scope`保留為provenance／review-scope evidence，不因SolidWorks組態存在就自動成為PDM正式主檔欄位，canonical formal state仍須通過欄位權威規則、業務用途與人工審查。Current closure evidence=`output/qa/dev-035-a0002-repeatability/DEV035-A0002-REPEATABILITY-2026-08-28T06-49-41-924Z/manifest.json`（21/21 PASS，含completion gate）；可重現命令=`npm run qc:dev-035:a0002-repeatability`。Production credential／worker deployment／release仍不在此授權內。
