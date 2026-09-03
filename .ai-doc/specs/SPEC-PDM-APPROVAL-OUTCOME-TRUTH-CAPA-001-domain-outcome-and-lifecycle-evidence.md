# SPEC-PDM-APPROVAL-OUTCOME-TRUTH-CAPA-001：核准結果、正式資料語意與生命週期證據一致性 CAPA

CAPA ID：`CAPA-001`
顯示名稱：`[CAPA-001] 核准結果、正式資料語意與生命週期證據一致性`
Register evidence：`.ai-doc/capa-register.md#capa-001`
狀態：`CAPA Registered / DEV-114 Assigned / Local RD Implemented / Local Effectiveness Verified / Data Repair Not Authorized / Production Release Gated`
日期：2026-09-02
建議 DEV：`DEV-114`／`DEV-PDM-APPROVAL-OUTCOME-TRUTH-001`
事件樣本：`A0001-P01`／current part id=`0a81c6e6-089c-4881-926c-819ff141734c`／canonical row=`cw_8604a438-de47-41a3-af98-3adad9d8d9f8`
關聯：`DEV-087`、`DEV-101`、`DEV-111`、`SPEC-PDM-APPROVAL-PLATFORM-001`、`SPEC-PDM-STATUS-DATA-REBUILD-001`、`SPEC-PDM-RELEASE-MASTER-STATUS-SYNC-001`

> **2026-09-01 RD 技術主管審查修訂**：本版補入 `part_formal -> available -> 可使用` 的直接 false-signal，取消新增第二套 approval outcome 真相，改為重用既有 `status/applyStatus`；`part_formal + Draft` 明確定義為可合法存在的 data-layer 組合，不得單獨列為資料異常或 repair candidate；A0001-P01 在 release authority 未開放前改列 `blocked_pending_release_authority`。正式事實須先凍結成可重現 evidence manifest，才能授權資料 disposition。

> **2026-09-02 DEV-114 completion receipt**：已落地 shared outcome projector、native apply postcondition、兩個 approval client 的 failure-aware feedback，以及 Part canonical layer/lifecycle neutral projection。Primary SQLite 以唯讀 scanner 凍結 exact identity；隔離 clone 完成 `apply_failed` fault path，兩個 approval UI 均顯示「核准已保存，正式化未完成」並保留重試；A0001-P01 維持 `blocked_pending_release_authority`。本地效果確認完成，production activation、data repair、deploy、release 仍未授權。

> **2026-09-02 exact local repair receipt**：使用者其後明確授權 A0001 正式資料修復；§15 以新的 CAPA corrective authority 覆寫 exact local primary-write gate，不補造舊 approval evidence。Dry-run、clone rehearsal、backup、transactional apply、NO_OP replay、post inventory與browser readback均PASS；A0001 root／part／drawing master=`Released`、unified drawing=`released`。Staging／cloud production、deploy、release與restore仍未授權。

## 1. CAPA 結論

本案是 `P1／系統性控制缺口`，不是單一錯誤文案，也不能歸因為使用者誤記。

系統同時使用三種不同事實，但 UI 與成功回饋沒有清楚分界：

1. `canonical_workbench_states.data_layer = part_formal`：代表 current canonical 主檔／導覽錨點。
2. `part_numbers.record_status = Draft | Active | Released | ...`：代表編號生命週期與使用資格。
3. approval request `decision` 與 `apply status`：分別代表主管決議及決議是否已成功套用到 domain data。

目前 `part_formal` 同時被顯示為「正式資料」，並由 canonical state query 無條件投影成 `available／可使用`；native approval 又可能在 `apply_failed` 時以 HTTP 200 回傳，而兩個前端直接顯示「已核准」。因此使用者可能合理地認為「資料已完成正式化／發行」，實際上只能證明主管決議已保存，甚至目前資料可能只是 Draft 主檔。

CAPA 目標不是把所有 `part_formal + Draft` 強制改成 `Released`，而是讓以下不變量成立：

> UI 所宣告的核准／套用／發行結果，必須與 exact request、exact canonical identity、domain postcondition、生命週期狀態及 audit evidence 一致；任何一項未成立，都不得顯示成已完整完成。

## 2. 不符合事實、證據與未知資料

### 2.1 已確認事實與證據等級

| ID | 事實 | 證據 | 證據等級 |
|---|---|---|---|
| F-01 | current A0001-P01 的 part、root、drawing master 均為 `Draft`；建立後沒有 lifecycle update。 | current SQLite read-only inventory；production create receipt | 已觀察；正式 manifest 待凍結 |
| F-02 | current A0001-P01 沒有 legacy/native approval request、decision、review trace、approved snapshot 或 `numbering.release.approved` audit。 | current SQLite 全表 identity inventory | 已觀察；正式 manifest 待凍結 |
| F-03 | A0001-P01 於 2026-07-16 由 `official-numbering-draft` production slice 建立；建立回執即為 Draft。 | `output/dev-032-production-slice-activation/hotfix-1936e93d-level4-ui.json` | 可重現 artifact |
| F-04 | 同一 production slice 的 approval mutation 未開放。 | `output/dev-032-production-slice-activation/hotfix-1936e93d-post-traffic-smoke.json`；DEV-111 production QC | 可重現 artifact |
| F-05 | DEV-087 migration 對沒有 active Part work 的每一筆 Part建立 `part_formal`；該列是 canonical navigation state，不等同 release evidence。 | `scripts/migrate-dev-087-canonical-workbench.mjs:851-857`；PostgreSQL equivalent `scripts/migrate-dev-087-postgres.mjs:276-278` | source fact |
| F-06 | Part workbench 把 `formal` layer 固定標示為「正式資料」，drawer badge 直接使用 layer label。 | `src/components/canonical-pdm-workbench.tsx:61-70,366-373` | source fact |
| F-07 | native approval apply 失敗時，service 保存 `apply_failed` 並回傳 request；decision route 仍回 HTTP 200。 | `src/lib/approval-platform.ts:156-199`；`src/app/api/approvals/requests/[requestId]/decisions/route.ts` | source fact |
| F-08 | `/approvals` 與 generic approval workspace 只用 HTTP success 判斷，沒有以回傳 `request.status/applyStatus` 決定成功訊息。 | `src/app/approvals/page.tsx:297-328`；`src/components/approval-request-workspace.tsx:89-108` | source fact |
| F-09 | DEV-111 已補 Part formalize 的 `formal=1/work=0` transaction postcondition，但沒有修正 generic approval UI outcome truth，也沒有定義 `part_formal` 與 numbering lifecycle 的可見語意。 | `src/lib/repositories/part-change-work-async-repository.ts:234-298`；DEV-111 QA/QC | source＋artifact fact |
| F-10 | 歷史資料中曾有另一個 UUID 的 A0001-P01；編號文字本身不足以證明是同一 identity 或同一資料環境。 | historical SQLite backup inventory | 已觀察；正式 manifest 待凍結 |
| F-11 | canonical state query 把 `drawing_production/part_formal` 無條件投影為 `available`，UI 再把它顯示為「可使用」，沒有以 Part `record_status` 判定使用資格。 | `src/lib/repositories/pdm-canonical-workbench-async-repository.ts:77-90`；`src/lib/pdm-canonical-workbench-contract.ts:204-208` | source fact |

### 2.2 尚未知／不得推定

- 無法由 current database 證明使用者當時按下的是哪一種核准、哪個 request id、哪個環境或哪個 A0001-P01 UUID。
- 無法把「使用者看到已核准」推定成 current A0001-P01 已完成 numbering release。
- 無法把 current A0001-P01 直接改為 `Released`；缺少可追溯的 release request、reviewer、decision basis 與 domain postcondition。
- 尚未完成全資料庫 affected-record scanner，因此本案影響筆數暫定為 `至少 1 個可見樣本，系統性風險範圍待盤點`。
- F-01、F-02、F-10 尚未凍結為可重現 artifact；在 evidence manifest 完成前，不得用它們授權 primary／production data repair。

### 2.3 Evidence freeze gate

RD 開始前，QC 必須以現行 source 產出唯讀 manifest：`output/qa/capa-001-approval-outcome/inventory/<run-id>/manifest.json`。本案最新產出：`output/qa/capa-001-approval-outcome/inventory/2026-09-02T06-45-19-969Z/manifest.json`。manifest 至少包含：

- database resolved path、provider、SHA-256、snapshot／query time、source revision與 query schema version；
- company、entity UUID、canonical row key、part/root/drawing code與 `record_status`；
- approval request／decision／review trace／approved snapshot／release audit 的 exact counts與 IDs；
- command receipt／outbox event引用、歷史同碼 identity列表及來源 snapshot SHA-256；
- read-only／zero-write宣告，以及 primary invariant、foreign-key check 與執行前後 fingerprint。

manifest 不得包含密碼、token、cookie或使用者秘密；沒有 manifest時 CAPA可進行 UI／contract RD，但不能做資料 disposition或 repair。

## 3. 影響與風險

### 3.1 使用者影響

- 使用者無法從「正式資料／可使用」判斷是否已正式發行。
- 使用者可能看到「已核准」後離開，但 domain data 實際為 `apply_failed`。
- 後續作廢、BOM、製造使用、修改與 release gate 可能依不同狀態得出矛盾結論。
- current evidence 無法回答「核准的是哪一筆、在哪個環境」，降低稽核可信度。

### 3.2 風險分級

| 維度 | 判定 | 理由 |
|---|---|---|
| 嚴重度 | High | 可能誤判正式化／發行，並影響高風險 lifecycle action。 |
| 發生可能性 | Medium-High | 缺陷位於共用 approval UI 與 canonical Part layer 命名，不限單一資料。 |
| 可偵測性 | Low | HTTP 200 與成功訊息會遮蔽 `apply_failed`；「可使用」又遮蔽 Draft lifecycle；一般畫面未顯示 exact lifecycle evidence。 |
| CAPA 優先級 | P1 | 必須在 approval production slice 開放前關閉；資料 repair 另受人工 gate。 |

## 4. 第一性與多層次根因分析

### 4.1 因果鏈

```text
master Part 存在
  -> DEV-087 migration 建立 part_formal canonical navigation state
  -> workbench 把 formal layer 顯示為「正式資料」
  -> canonical query 把 part_formal 投影為 available／「可使用」
  -> 使用者理解成「已正式發行」
  -> obsolete/release domain 仍依 record_status=Draft 判定
  -> UI 與 action 結果互相矛盾

approved decision
  -> domain apply 執行
  -> apply exception 被轉成 request.status=apply_failed
  -> route 仍回 HTTP 200
  -> client 只看 response.ok 並顯示「已核准」
  -> 使用者離開，正式化缺口未被當成當次失敗
```

### 4.2 根因層次

| 層次 | 根因 | 類型 | 證據狀態 | 反事實檢查 | 控制點 |
|---|---|---|---|---|---|
| RC-01 直接原因 | 前端把 transport success 當成 business completion，沒有判斷 `approved/applied/apply_failed`。 | 程式控制失效 | 已確認 | 若 client 依 domain outcome 顯示結果，即使 HTTP 200 仍不會出現假成功。 | API response contract、兩個 approval clients |
| RC-02 資料／語意原因 | `part_formal` 是 canonical data layer，卻使用「正式資料」這個會被理解為 Released 的名稱；畫面未同時呈現 master lifecycle。 | 模型與 UX 語意失效 | 已確認 | 若 data layer 與 lifecycle 分軸顯示，Draft 主檔不會被誤判為已發行。 | workbench DTO、badge/filter vocabulary |
| RC-03 狀態投影原因 | canonical query把 `part_formal` 無條件投影為 `available／可使用`，而 row DTO沒有把既有 `recordStatus/availability` 投影成可見生命週期。 | read-model控制失效 | 已確認 | 若「可使用」只由 lifecycle／availability決定，navigation anchor存在也不會宣告使用資格。 | canonicalDataStateSql、row DTO、list/detail presentation |
| RC-04 系統性原因 | 既有 `approved/applied/apply_failed` contract沒有被端到端落實：service可正確產生 `apply_failed`，但 clients不解讀；受影響 handler的 postcondition evidence也尚未成為 activation gate。 | 跨 domain contract落實缺口 | 已確認 | 若 client重用既有 status authority且 activation驗證 focused postcondition，任一步驟失敗都無法被 UI誤報完整完成。 | shared feedback projector、focused handler read-back、release gate |
| RC-05 稽核原因 | 使用者回執與 UI 沒有保留／顯示 exact request、entity UUID、company/environment、decision/apply 結果的可追溯組合。 | evidence／identity 缺口 | 已確認為控制缺口；本次歷史操作歸屬未知 | 若回執可依 exact identity 查詢，就能確認使用者核准的是哪一筆，而不是靠編號文字猜測。 | audit receipt、request detail、support inventory |

### 4.3 非根因

- 不是「使用者沒有看清楚」：現行詞彙與成功訊息本身會導致合理誤判。
- 不是只缺一個中文錯誤對照：即使把 `LIFE_OBSOLETE_NOT_FORMAL` 翻成中文，狀態矛盾仍存在。
- 不是只要把 A0001-P01 改成 Released：直接改值會製造沒有核准證據的正式資料。
- 不是 `part_formal` 或 DEV-087 migration 的存在本身有錯：它可以是合法 navigation anchor；錯誤是把 data layer投影成正式發行與使用資格。
- 不是 DEV-111 已完全解決：DEV-111 修的是 canonical navigation postcondition，本 CAPA 修的是 outcome truth 與 lifecycle evidence。

## 5. 立即圍堵與本次矯正

| ID | 措施 | Owner | 完成條件／證據 | 狀態 |
|---|---|---|---|---|
| IC-01 | A0001-P01 暫停直接 lifecycle repair、直接 SQL 改 Released 與正式作廢；只允許 read-only inventory。 | PM／PDM Admin | 無未授權 primary mutation；保留 before fingerprint。 | 立即生效 |
| IC-02 | 在修正前，`Draft` 或 evidence mismatch 的資料不得提供會假定 formal release 的 destructive action；API 必須 fail closed 並顯示繁中可恢復錯誤。 | RD | permission/lifecycle negative tests；真實 UI visible-error sweep。 | 待 RD 驗證現況並補齊 |
| IC-03 | 把 current A0001-P01 建立為受控 case，不以編號文字關聯歷史操作；case key 固定 company＋entity UUID＋environment。 | PM／QC | case inventory 包含 UUID、row key、record status、request/snapshot/audit counts。 | CAPA 執行時建立 |

## 6. 矯正措施（CA）

### CA-01：建立 approval domain outcome truth contract

對應：RC-01、RC-04。

- 不新增 persisted status、schema或第二套 wire-level outcome。直接重用既有 `ApprovalPlatformStatus` 與 `applyStatus`，建立純函式 `projectApprovalDecisionFeedback({ status, applyStatus, decision, actionCode })`。
- projector 只負責把既有 domain facts轉成互斥 UI feedback：
  - `status=approved` 且 `applyStatus=not_required`：決議已保存，該 action無 apply階段；
  - `status=applied` 且 `applyStatus=applied`：決議與 domain apply均成功；
  - `status=apply_failed` 或 `applyStatus=failed`：決議已保存，但 domain data尚未完成套用；
  - `rejected／needs_info`：維持既有語意。
- approval page 與 generic workspace 共用該純函式；`apply_failed` 必須顯示就地錯誤「核准決議已保存，正式化尚未完成」，保留 retry，禁止同時出現「已核准」成功訊息。
- retry 成功後才改為「已核准並完成正式化」；重試失敗保持原 request、comment、context 與 focus。
- 保留既有 idempotency；不得因錯誤處理重複 decision、snapshot、audit 或 domain effect。

驗收：pure projector exhaustive test、既有 route response contract test、兩個 client contract test、真實 `apply_failed -> retry -> applied` browser evidence；不得新增 DB欄位或平行 status authority。

### CA-02：分離 canonical data layer 與 numbering lifecycle 的可見語意

對應：RC-02、RC-03。

- 推薦保留兩軸模型，不把 Part 變更核准自動等同 numbering release：
  - canonical layer：`主檔`／`修改中`，只回答目前正在查看哪個資料層。
  - lifecycle：`草稿`／`研發可用`／`已發行`／`已作廢`，由 `record_status` 與既有 availability projector 決定。
- 「正式資料」不得繼續作為 `part_formal` 的第一層標籤；`canonicalDataState=available` 也不得在 Part UI顯示成使用資格「可使用」。正常畫面不新增常駐說明卡，只用最小雙狀態或主狀態＋次狀態呈現。
- 現行 repository已讀出 `recordStatus`；row DTO／presentation直接投影既有 lifecycle／availability label。內部 canonical `dataState` 可保留給工作流程，但不可再充當 Part的可見使用資格，亦不新增第二個 availability service。
- action resolver、obsolete modal、BOM readiness 與 production-use gate 一律使用 lifecycle／availability evidence，不使用 `part_formal` 名稱推定 Released。
- `part_formal + Draft` 是允許的組合時，必須顯示為「主檔／草稿（未發行）」；若產品決策不允許此組合，須另立 ADR 並把 first formal approval 與 numbering release 合併為同一 transaction，本 CAPA 不自行採用該高影響選項。

驗收：狀態矩陣 contract test；A0001-P01 不再顯示「正式資料」或「可使用」，而顯示可區分的「主檔／草稿（未發行）」；三 viewport 與鍵盤／screen reader狀態可辨識。

### CA-03：受影響 approval handler 的最小 domain postcondition gate

對應：RC-04。

- 延用既有 `applyApproved -> applied/apply_failed` contract，不為所有 handler新增 `postconditionVersion`、registry metadata或平行 framework。
- 只對本 CAPA觸及、且在 current activation surface可執行的 apply handler列出既有 domain postcondition與 focused read-back；Part formalize延用 DEV-111 的 `part_formal=1/work=0`，numbering release若於後續 slice開放，才驗證 root／part／drawing lifecycle、release audit及 protected terminal state。
- apply 成功只能在該 handler既有 transaction/read-back通過後寫成 `applied`；read-back失敗必須 rollback或進入可恢復 `apply_failed`，禁止回報完整成功。
- 只補足現有 audit 缺少的 exact request／entity／before-after outcome；若既有 event已包含，重用而不建立第二條 audit stream。

驗收：每個受影響 handler 的 mutation-sensitive test必須能殺死「略過 read-back仍回 success」mutant；只在該 handler支援 SQLite／PostgreSQL時要求 provider parity，不為不活躍 handler製造假測試。

### CA-04：建立受控 inventory 與 A0001 修復決策包

對應：RC-03、RC-05。

- Evidence freeze gate先完成，再做 read-only scanner。scanner至少分類：
  1. `part_formal + Draft` 且沒有任何 release宣告／audit矛盾：`no_action_data_layer_only`；
  2. terminal approved decision + non-applied domain state或 UI false-success：`apply_recovery_required`；
  3. `apply_failed`：`retry_or_blocked`；
  4. Released 但缺 release audit／request evidence：`blocked_evidence_gap`；
  5. 相同 code跨 lineage／environment：`blocked_identity_collision`。
- `part_formal + Draft` 本身不是 anomaly、release evidence或 repair candidate；只有 display/audit宣告與 domain postcondition矛盾時才列 P0/P1。
- 每列輸出 `no_action_data_layer_only | retry_required | resubmit_required | repairable | blocked` 與 reason code／evidence fingerprint，不以 code單獨配對。
- A0001-P01 現階段固定為 `blocked_pending_release_authority`。只有 legitimate numbering release route與 production slice開放後，才可轉為 `resubmit_required`；只有找到 immutable external approval evidence且 exact UUID／company／environment／action均相符時，才可轉為 `repairable`。
- repair apply 必須另經使用者明確授權、backup、scope fingerprint、plan hash、expected count、transaction read-back、audit 與 replay no-op；沒有證據時不得 repair，須維持 blocked，待 legitimate release authority開放後才可重新送審，不得補寫 Released。

驗收：scanner 對 primary DB零寫入；fixture涵蓋五類且 `part_formal + Draft/no contradiction`不得計入 anomaly；repair工具預設 dry-run，未帶完整 gate時拒絕執行。

## 7. 預防措施（PA）

| ID | 預防措施 | 對應根因 | Owner | 目標層 | 再觸發情境 | 驗證 |
|---|---|---|---|---|---|---|
| PA-01 | 以既有 `status/applyStatus` 建立 approval feedback state matrix 與 shared pure projector；新增 action 時必須選定 terminal/apply semantics。 | RC-01、RC-04 | RD／QA | Project SOP＋contract test | 新增 approval action、handler、client | compile-time exhaustiveness＋mutation-sensitive tests |
| PA-02 | migration/backfill 建立 navigation state時必須使用 neutral vocabulary，且不得讓 master existence／data layer被投影為 approval或 release；若 migration宣稱正式化才需要 immutable evidence。 | RC-02、RC-03 | RD／QA | migration checklist | schema migration、canonical rebuild、data sync | pre/post inventory、source fingerprint、projection matrix |
| PA-03 | production approval slice 開放前新增 authenticated E2E release gate，覆蓋 decision、apply、UI message、DB postcondition、audit、cleanup。 | RC-01～RC-05 | QA／QC／Release owner | release gate | approval slice enable、approval handler change、hotfix | exact revision＋fixture＋browser＋DB receipt |
| PA-04 | UI／support receipt 顯示可複製 request id 與 exact entity/environment trace；一般畫面不暴露 raw UUID，但可由稽核入口取得。 | RC-05 | RD／PDM Admin | product contract＋SOP | 使用者申訴核准／狀態不一致 | request-to-entity trace query 100% 可解析 |
| PA-05 | approval slice啟用後的每次相關 release執行 read-only invariant monitor：不得存在「UI 完成但 domain postcondition不成立」；P0/P1 anomaly阻擋 promotion。監控是持續 PA，不作為本 CAPA要求連續兩個 release cycle的結案前置。 | RC-04 | QC／Release owner | release gate | approval platform／handler／projection release | machine-readable zero-anomaly manifest |

教育訓練不作為主要 PA；系統必須先讓錯誤不易發生且可被自動偵測。

## 8. CA／PA 追溯矩陣與效用判斷

| 根因 | CA | PA | 效用判斷 | 驗證證據 | 建議流向 |
|---|---|---|---|---|---|
| RC-01 | CA-01 | PA-01、PA-03 | 高效益／低成本；重用既有 status authority並直接消除假成功，優先級 1。 | apply_failed UI、route、retry、idempotency evidence | dev_task＋QA plan＋release gate |
| RC-02 | CA-02 | PA-02 | 高效益／低至中成本；不改 domain authority，只修正 data-layer語意，優先級 1。 | status matrix＋A0001 UI＋RWD/a11y | dev_task＋QA plan |
| RC-03 | CA-02、CA-04 | PA-02、PA-05 | 高效益／中成本；移除「可使用」false-signal並以 zero-noise scanner防止誤修。 | projection matrix＋zero-write inventory | dev_task＋QC report＋release gate |
| RC-04 | CA-01、CA-03 | PA-01、PA-03、PA-05 | 高效益／低至中成本；沿用既有 completion contract，只補受影響 handler read-back與 client interpretation。 | focused postcondition＋mutant kill＋exact provider evidence | dev_task＋QA plan＋release gate |
| RC-05 | CA-04 | PA-04 | 中高效益／中成本；提升稽核與客服定位，不增加一般 UI 噪音，優先級 2。 | exact trace query＋support receipt | dev_task＋SOP/checklist |

## 9. QA 驗證計畫最低要求

### 9.1 FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策／測試 |
|---|---|---|---|---|---|
| HTTP 200 但 apply_failed 顯示已核准 | client 只看 response.ok | 誤以為完成正式化 | forced handler failure＋browser | P0 | CA-01 negative path |
| retry 重複 decision/snapshot/audit | idempotency scope 錯誤 | 重複套用、稽核污染 | double-click／response-loss retry | P0 | exact count invariant |
| part_formal + Draft 仍只顯示正式資料 | vocabulary 未分軸 | 誤判已發行 | A0001-like fixture | P1 | CA-02 status matrix |
| part_formal + Draft 仍顯示可使用 | canonical dataState被誤作使用資格 | 誤判可供研發／生產使用 | A0001-like fixture＋projection test | P1 | CA-02 lifecycle projection |
| Part change approval誤把資料自動 Released | 把 canonical approval混成 release | 未經 release gate 即可生產使用 | domain transition test | P0 | 保留兩軸 authority；未經 ADR 不合併 |
| migration navigation anchor再次被當成 release evidence | projection／vocabulary未保持 neutral | 大量歷史狀態失真 | migration mutant／projection inventory | P0 | PA-02 gate |
| 同編號不同 UUID 被錯誤修復 | code-only repair | 修錯業務資料 | lineage collision fixture | P0 | exact identity fingerprint |
| 錯誤訊息只顯示 raw code／英文 | error mapping 漏失 | 無法理解與恢復 | visible error sweep | P1 | 繁中 domain outcome copy |

### 9.2 固定驗收案例

1. Approved + apply success：只顯示一次「已核准並完成正式化」，DB postcondition與 audit 均成立。
2. Approved + apply failure：顯示 error，不顯示 success；request=`apply_failed`，domain data不被誤投影完成。
3. Retry apply success／failure／response loss：決議、snapshot、audit與 domain effect 保持 exactly-once。
4. Rejected／needs_info：既有語意與 owner return 不回歸。
5. `part_formal + Draft`、`part_formal + Active`、`part_formal + Released`、`part_work + Draft`：四種顯示與 actionability符合矩陣；Draft不得顯示「正式資料／可使用」。
6. migration fixture：無核准 Draft Part可保留 neutral canonical navigation state，但不得被宣稱為 Released／可使用，scanner必須分類為 `no_action_data_layer_only`而非 anomaly。
7. identity collision：相同 part number、不同 UUID／environment 不得交叉引用 request 或 repair。
8. 權限：Engineer、R&D Manager、PDM Manager、Admin 與 cross-company 均 fail closed，不洩漏 target evidence。
9. UI：1440×900、1024×768、390×844，normal/loading/error/apply_failed/retry/applied；無 visible raw code、overflow、focus loss 或競爭成功／錯誤訊號。
10. Provider：SQLite／PostgreSQL contract parity，primary invariant、FK、audit append-only、source snapshot before/after unchanged。

## 10. 效果確認與 CAPA 關閉門檻

CAPA 不得因文件完成、程式合併或單一 happy-path test 結案。必須同時具備：

- CA-01～CA-03 local RD complete，固定 QA cases全數執行且 P0/P1=0；不得新增第二套 approval status authority。
- independent QC 以 forced `apply_failed` 證明兩個 UI 都沒有假成功。
- §2.3 evidence freeze manifest完成後，read-only scanner才可輸出 primary affected inventory；`part_formal + Draft/no contradiction`不得計入 anomaly。
- A0001-P01在 current gate固定為 `blocked_pending_release_authority`；只有 authority或 immutable evidence改變時才重新 disposition。
- approval production slice開放時，在 exact release revision執行一次 authenticated E2E；slice未開放時CAPA只能標示 `Local Effectiveness Verified / Production Activation Gated`，不得冒充 production PASS。
- PA-05 monitor於相關 production activation後持續執行；任何 false-success anomaly立即 reopen CAPA並阻擋 promotion，不要求連續兩個 release cycle才可完成技術結案。
- production data repair、deploy、release 或 rollback 各自取得明確人類授權；本 CAPA 文件本身不構成授權。

## 11. 範圍與停止條件

範圍內：approval outcome contract、兩個 approval clients、handler postcondition、Part layer/lifecycle projection、read-only scanner、QA/QC/release gates、exact trace receipt。

範圍外：直接核准 A0001-P01、直接改 primary/production status、重設 numbering authority、合併 Part change approval與 numbering release、部署或 production slice activation。

停止並回 Dev PM／使用者決策：

- 需要把所有 `part_formal + Draft` 自動改為 Released。
- scanner 找到無法以 immutable evidence 唯一判定的 repair candidate。
- 需要 schema migration、新 permission、approval authority 變更或 destructive cleanup。
- 任何 primary／production data write、deploy、release 或 rollback。

## 12. Routing recommendation

- Suggested route：`dev_task + QA plan + QC report + release gate`。
- Reason：需要修改共用 approval 行為與 UI，並盤點資料風險；不是只補文件或 SOP。
- Required owner：PM（範圍／分期）、RD（CA-01～04）、QA（FMEA／固定案例）、QC（獨立事實驗證）、Release owner（production gate）、PDM Admin（資料 disposition）。
- Required evidence：existing-status feedback projector、focused transaction postcondition、browser forced-failure、applicable provider tests、§2.3 evidence manifest、zero-write inventory、exact identity trace、release manifest。Local evidence：`output/qa/capa-001-approval-outcome/`。
- Human decision needed：`yes`；「canonical layer／numbering lifecycle 兩軸分離」已由 DEV-114 實作採用。資料 repair 與 production work 仍需另行授權。

### DEV registration draft

- DEV ID：`DEV-114`／`DEV-PDM-APPROVAL-OUTCOME-TRUTH-001`（已由 Dev PM 登錄）。
- Type：`P1 CAPA / approval truth and lifecycle evidence`。
- Parent：`DEV-087`；相容承接 `DEV-101`、`DEV-111`。
- Scope：CA-01～CA-04；PA-01～PA-05 的產品與 gate 部分。
- Acceptance：§9 固定案例及 §10 關閉門檻。
- Stop conditions：§11。
- Evidence required：QA plan、independent QC report、§2.3 evidence freeze manifest、scanner manifest、browser receipts、release gate manifest。
- Owner：Dev PM → RD → QA → QC；production/data action 由使用者另行授權。

## 14. DEV-114 implementation contract and current evidence

- Implementation boundary：`src/lib/approval-outcome-feedback.ts` shared pure projector；`src/lib/approval-platform.ts` native apply postcondition；兩支 approval API route 回傳 outcome；`src/app/approvals/page.tsx` 與 `src/components/approval-request-workspace.tsx` 共用 failure-aware feedback；`src/lib/pdm-canonical-workbench-contract.ts`、`src/lib/pdm-canonical-workbench-state.ts`、`src/components/canonical-pdm-workbench.tsx` 修正 Part layer/lifecycle/data-state vocabulary；`scripts/qc-capa-001-readonly-inventory.mjs` 與 `scripts/qc-capa-001-approval-outcome.mjs` 提供 evidence。
- Explicit no-touch：無 schema/migration、無新 approval authority、無 permission model 變更、無 primary/production data repair、無 deploy/release。A0001-P01 不因 UI 語意修正而自動變成 `Released`。
- Current acceptance：focused contract QC `22/22 PASS`；isolated fault-path QC `7/7 PASS`；authenticated browser receipts 覆蓋 A0001-P01 Part lifecycle、`/approvals` inbox 與 `/approvals/[requestId]` workspace；primary read-only inventory `foreign_key_check=0` 且 disposition=`blocked_pending_release_authority`。
- Known external baseline：`typecheck:app` 已 PASS；`qc:pdm-approval-platform` 仍有既有 drawing-list compact pending signal 基線失敗。該 baseline 不在 DEV-114 scope，未改動其相關檔案。
- Closure routing：本地 correction 與 effectiveness 已完成；production activation 後仍需 exact release revision E2E、PA-05 monitor 與獨立 release/data authorization，故 Register 狀態保留 `Production Activation Gated`。

## 13. UX Intent

- 任務／結果：審核人按下核准後，立即知道是「決議已保存」、「正式化完成」或「正式化失敗可重試」；一般使用者查看 Part時能分辨「主檔」與「草稿／已發行」。
- 主物件／主焦點：exact approval request 與其 domain outcome。
- 預設刪除：常駐說明卡、重複成功 toast、raw internal status code、把 canonical `available`翻成使用資格的「可使用」、以「正式」重複包裝不同事實的多個 badge。
- 保留舉證：lifecycle status 與 apply failure 必須保留，否則會造成正式化／發行誤判；request trace 只放可展開稽核入口，不增加一般畫面噪音。
- 非語言修復：用狀態位置與單一 outcome signal 表達；錯誤僅保留最短原因與 retry。
- 風險與驗證：false-success、destructive action、focus recovery、screen reader live status、三 viewport。

## 15. 2026-09-02 人類授權增補：exact local A0001 正式資料修復

使用者在 CA-01～CA-04 local effectiveness完成後，明確下達「正式資料修復／授權執行」。此較新的決策只覆寫 §5 IC-01、§6 CA-04、§10、§11 對 exact local A0001 primary-write 的停止條件；不改變一般 `part_formal + Draft` 規則，也不授權 staging／cloud production、deploy、release 或 rollback。

決策語意：

- 本次是新的 CAPA corrective release authority，不是找到舊 approval request／decision，也不得補造一筆「先前已核准」歷史。
- Exact scope 固定 `company-jenfu`、root=`13a80f7e-bbeb-4da6-9e3a-ca1e21cafce1`、part=`0a81c6e6-089c-4881-926c-819ff141734c`、drawing number=`8298306b-2575-42a9-9de4-8edf44a9b864`、unified drawing=`drawing-formal-8298306b-2575-42a9-9de4-8edf44a9b864`。
- 允許的 state transition只有 root／part／drawing number `Draft -> Released` 與 unified drawing `rd_controlled -> released`；canonical `part_formal` row、approval tables、schema、permissions與其他 identity不得修改。
- 必須先建立 SQLite consistent backup，使用 scope fingerprint＋plan hash＋expected count，於`BEGIN IMMEDIATE`後重新驗證，再以單一transaction執行；只允許4個state update＋1筆append-only CAPA audit。
- Audit action固定`capa.formal_data_repair.applied`，且明示`historicalApprovalReconstructed=false`、`priorApprovalEvidenceFound=false`。
- Apply後必須 FK=0、quick-check=`ok`、schema version不變、非audit table counts不變、replay=`NO_OP`，並以真實 browser readback確認「主檔 · 已發布」與「申請作廢」。

執行結果：dry-run、clone rehearsal、local primary apply、NO_OP replay、post inventory與browser readback全數PASS；權威證據索引位於`.ai-doc/capa-register.md#capa-001-evidence-index`。Backup已保留；restore需另行授權。Production activation gate維持不變。
