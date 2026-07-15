# QA-PDM-NUMBER-STATE-FLOW-001：DEV-048 號碼、狀態與技轉整合驗證計畫

日期：2026-07-13
狀態：QA Plan Executed / Phase 1A-1D Local QC Passed / Release Gate Required
QA Owner：QA
QC Owner：獨立 QC
Related DEV：`DEV-PDM-NUMBER-STATE-FLOW-001` / `DEV-048`
Related SPEC：`.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`
Related ADR：`.ai-doc/decisions/ADR-PDM-NUMBER-STATE-FLOW-001-publish-boundary-and-candidate-reservation.md`
Platform authority：`DEV-046` ADR/SPEC/QA

## 1. QA Boundary

本文件定義驗證權威。Phase 1A、Phase 1B、Phase 1C及Phase 1D獨立本機QC均已通過；涵蓋candidate authority、owner UI、approval/explicit publish、逐寫入點rollback、aggregate transfer、published-only handoff、role/company、五種viewport與disposable data sanity。Live provider、staging與release evidence仍未執行。

驗證範圍：

- 未領號草稿、typed workspace items、候選號取得 / 鎖定 / 解鎖 / 回收 / promotion。
- root / part / drawing / relation bundle 的idempotency、unique、transaction、concurrency。
- approval platform immutable snapshot與`Approved != Published`。
- 技轉package準備、凍結、送審、核准待發布、explicit batch publish與published-only handoff。
- status projection、Now What、sidebar/route compatibility、desktop/tablet/mobile UI。
- SQLite/PostgreSQL schema/repository parity；Cloud SQL staging/live evidence只作future gate。
- permission/company scope、audit/outbox、visible error與data sanity。

不在本輪驗證：

- live Cloud SQL/Firebase/GCS、billing、credential、provider cutover。
- production clean seed、isolated restore、signed ledger實際KMS簽署、canary/waves。
- Pack-and-Go parser/baseline、full PDM/GCS restore、regional DR。
- merge、PR、deploy、production smoke、rollback或release report。

## 2. Required Fixtures

QA/RD 必須提供可重建 fixture；不得用唯一的日常工作資料做破壞性測試。

| Fixture | Minimum content |
|---|---|
| Company A | engineer A1/A2、RD manager、approver、publisher、manufacturing、PDM Admin；effective/expired roles各一。 |
| Company B | 至少一個同名/同code候選測試資料，用來驗證tenant isolation。 |
| Official set | Released root/part/drawing、Obsolete official、recovery non-reuse reservation、legacy Draft master各一。 |
| Candidate set | unnumbered、active candidate、review_locked、approved_locked、recycled各一。 |
| Approval set | pending、needs_info、rejected、approved、apply_failed、stale snapshot各一。 |
| Transfer set | empty Draft、ready Draft、InReview、ApprovedPendingPublish、ReleaseFailed、Published各一。 |
| Reference set | same-workspace internal relation、other-workspace/external relation、transfer package、approval snapshot各一；零外部引用對照組。 |
| File evidence | root-only與part-only `not_required` rule、drawing finalized controlled-object evidence（bucket/object/generation/hash/type/finalized_at/rule version）、drawing missing、hash/generation/rule stale、production verifier unavailable、preview unavailable但controlled evidence有效。 |
| Migration set | active `part_number_drafts`、voided/recycled、controlled legacy draft、Released/Obsolete master、ambiguous Draft master。 |

Fixture 中所有code、actor與company需使用測試namespace；不得消耗正常Jenfu production official sequence。

## 3. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 開表單就占號 | UI mount呼叫reserve API | 不必要斷號、使用阻力 | network/DB before-after | P0 | UI-001、API-001 |
| 同候選號配置給兩個草稿 | allocator無lock/unique或race | CAD/審核身份衝突 | 20-100 parallel acquire | P0 | CON-001..003 |
| Candidate先寫正式master | 沿用舊create service | 正式搜尋/交接污染 | DB assertion + official API | P0 | DB-006、PUB-001 |
| Approval直接發布 | handler重用舊release action | 跳過publisher/evidence | decision後DB diff | P0 | APR-006、PUB-002 |
| Publish部分成功 | root/part/drawing分散transaction | 孤兒master/關係斷裂 | injected failure每一步 | P0 | TX-001..005 |
| 回收仍有引用candidate | boundary漏查transfer/review/relation | 後續相同code雙重用途 | reference matrix | P0 | REC-003..007 |
| Reject後仍顯示審核中 | approval/candidate非同transaction | 使用者無法修改或重送 | state consistency query | P1 | APR-008 |
| Approved後資料被改仍可發布 | snapshot/version未比對 | 審錯內容被正式化 | mutate then publish | P0 | PUB-004 |
| Candidate輸出無watermark | download/print/export漏處理 | 製造誤用 | file/UI inspection | P0 | UI-018 |
| `已核准`被顯示成`已發布` | status欄混用 | 下游提前使用 | projection/UI assertions | P0 | STA-005..008 |
| Manufacturing看到candidate | role filter或handoff query錯 | 非正式依據被使用 | role/browser/API test | P0 | PERM-009、TRF-012 |
| Candidate污染official export | list union/filter錯 | ERP/報表誤用 | export fixture compare | P0 | REG-007 |
| Legacy Draft被自動回收 | migration classifier過度樂觀 | 已被溝通號碼重用 | dry-run goldens | P0 | MIG-006..009 |
| Rollback刪除已發布號 | destructive down migration | 重號/稽核失真 | rollback drill | P0 | MIG-012 |
| Outbox失敗使UI說未發布 | downstream/event誤作正式 authority | truth不一致 | worker failure injection | P1 | EVT-005 |
| visible 4xx/5xx/API raw text | UI錯誤處理遺漏 | 使用者無法復原/資訊洩漏 | visible-error sweep | P1 | UI-021 |
| 320/390px CTA消失或768px導航斷裂 | responsive boundary未設計 | 手機/窄版無法完成主流程 | screenshots/overflow measure | P1 | UI-024..031 |
| 空清單被當成功 | fixture/API載入失敗但顯示empty state | QC誤判 | data sanity counts | P0 | DATA-001..004 |
| 跨公司讀寫 | query/permission少company filter | 資料外洩/錯配號 | Company A/B negative tests | P0 | SEC-001..008 |
| Same actor被當成自動擁有三步權限 | 只檢查actor/角色名稱，未逐command驗permission | 未授權核准或發布 | 缺一permission逐步direct API test | P0 | SEC-005..012 |
| 具三項明示權限的same actor被硬編碼禁止 | 沿用強制不同自然人的舊policy | 小型pilot無法完成正式流程 | same-actor positive end-to-end | P1 | APR-010、SEC-011 |
| DB outage改用client號碼 | retry/fallback設計錯 | 恢復後重號 | provider unavailable test | P0 | FAIL-001 |

使用思考習慣：#可驗證性、#變數控制、#偏誤緩解

## 4. Gate Sequence

| Gate | Scope | Entry | Pass rule | Evidence |
|---|---|---|---|---|
| G0 Document/static | SPEC/ADR/QA/dev_task/map、schema/API/event names | docs prepared | links valid；no contradictory authority；no unclassified P0/P1 | doc validation output |
| G1 Migration/schema | SQLite/PostgreSQL DDL、constraints、indexes、rollback boundary | Phase 1A code | parity + clean install + upgrade + idempotent rerun pass | schema diff/receipts |
| G2 Domain/concurrency | workspace/reservation/allocator/recycle/idempotency | G1 pass | no double allocation；all state transitions deterministic | focused test logs |
| G3 API/security | BFF routes、permission/company/version/errors | G2 pass | UI/direct API bypass both denied；no mutation on fail | HTTP matrix |
| G4 Approval/publication | snapshot、lock/apply、explicit publish、atomic bundle | Phase 1B independent QC pass | approval never publishes；evidence matrix與same-actor explicit-permission規則成立；fault injection leaves zero partial master | transaction evidence |
| G5 Transfer/handoff | scope/readiness/freeze/invalidate/batch publish/published-only | Phase 1C independent QC pass | all-or-none；drawing evidence fail closed；candidate invisible as formal handoff | API + DB + browser |
| G6 UI/UX/a11y | navigation/create/status/Now What/confirmation/RWD | corresponding Phase 1B/1C/1D code ready | current-phase functional AC + visible-error/data sanity + 1440/1024/768/390/320 boundaries pass | screenshots/steps |
| G7 Regression | numbering/submission/release/approval/transfer/lifecycle | G1-G6 pass | no approved regression failure；legacy routes compatible | existing suites + focused |
| G8 Provider/staging | disposable PostgreSQL / Cloud SQL staging | explicit future instruction | DEV-046 least privilege/pool/migration/identity gates pass | staging receipts |
| G9 Production release | clean seed/ledger/restore/canary/smoke | release instruction | DEV-046/DEV-032/deployment-release-gate pass | release artifacts |

G8-G9不因local G0-G7通過而自動開始。

## 5. Detailed Test Cases

### 5.1 Draft and allocation

| ID | Preconditions / action | Expected |
|---|---|---|
| DFT-001 | Open each create mode then close without save | No workspace, reservation, audit or outbox row。 |
| DFT-002 | Save new-bundle draft | Stable workspace + typed root/part/drawing/relation；zero candidate/master rows。 |
| DFT-003 | Save append-drawing/part/combined draft | Correct source root FK/XOR；no duplicate master。 |
| DFT-004 | Repeat create with same idempotency key | Same workspace/result；no second audit/outbox business event。 |
| DFT-005 | Patch unlocked active workspace with current version | Material facts update；row version +1；server ignores client state fields。 |
| DFT-006 | Patch stale version / cancelled / locked / published | 409 stable code；zero mutation。 |
| NUM-001 | Explicit acquire after save | Exact required bundle candidates allocated atomically；watermark projection candidate。 |
| NUM-002 | Repeat acquire same idempotency | Same reservation IDs/codes。 |
| NUM-003 | Acquire new bundle | Root allocated first；part/drawing formatted from same candidate root/rule。 |
| NUM-004 | Used set含official、locked、promoted、recovery、recycled | Skips first four；may choose recycled gap。 |
| NUM-005 | Company B uses same candidate text | Allowed only if number policy is tenant-scoped；A/B never see each other。 |
| NUM-006 | DB unavailable | 503 `numbering_authority_unavailable`；no client/offline number。 |

### 5.2 Concurrency and idempotency

| ID | Action | Expected |
|---|---|---|
| CON-001 | 20 parallel workspaces acquire same root scope | 20 unique candidates；no duplicate/partial bundles。 |
| CON-002 | 20 parallel requests with one idempotency key | One allocation；all accepted responses resolve same receipt/result。 |
| CON-003 | Inject unique collision after used-set read | Bounded retry <=3 or controlled 409；no leaked reservation。 |
| CON-004 | Parallel cancel and submit-review same workspace | Exactly one transition wins；loser version/lock conflict；no cancelled+review_locked split。 |
| CON-005 | Parallel publish same approved workspace | One official bundle/event；other returns same receipt or stable already-published result。 |
| CON-006 | Two transfer packages attempt same workspace publish | One official bundle；other resolves published identity without second promotion or batch partial state。 |

### 5.3 Recycle and reference control

| ID | Action | Expected |
|---|---|---|
| REC-001 | Cancel unnumbered draft | Lifecycle cancelled；no candidate operation。 |
| REC-002 | Cancel active candidate with zero refs | Workspace cancelled + reservation recycled same transaction；same code immediately available。 |
| REC-003 | Same-workspace internal relation versus external relation | Internal relation随workspace取消且不阻擋；other-workspace/external independent relation阻擋並回visible ref/action。 |
| REC-004 | Candidate in transfer package Draft | Recycle blocked until scope item removed/cancelled according to rule。 |
| REC-005 | review_locked / approved_locked | Recycle blocked；Now What points review/publication。 |
| REC-006 | promoted / official / obsolete | Recycle endpoint returns controlled conflict；no state change。 |
| REC-007 | Reuse recycled code | New reservation ID/event；old row remains recycled/immutable。 |
| REC-008 | No 7-day wait | Same-turn valid recycle succeeds；no `recycle_available_at` gate in new service。 |

### 5.4 Approval and snapshot

| ID | Action | Expected |
|---|---|---|
| APR-001 | Submit review without candidates | 400/409 `candidate_required_before_review`；no approval row。 |
| APR-002 | Valid submit | Immutable snapshot/targets + all candidate locks in one transaction。 |
| APR-003 | Edit locked workspace | Blocked；no version change。 |
| APR-004 | Approve decision | Request approved/apply completed；reservation `approved_locked`；master count unchanged。 |
| APR-005 | Needs-info/reject | Request decision + candidate unlock `active` atomically；workspace editable。 |
| APR-006 | Inspect DB immediately after approval | Zero new official master；projection `已核准 / 待發布`。 |
| APR-007 | Withdraw pending by authorized owner | Request cancelled/withdrawn + unlock；snapshot retained immutable。 |
| APR-008 | Inject approval apply failure | `apply_failed`；candidate stays locked；projection不說approved pending publish。 |
| APR-009 | Approval target/impact snapshot UPDATE/DELETE | DB/repository rejects immutability violation。 |
| APR-010 | Reviewer cross-company，或同一submitter有/無explicit approval permission | Cross-company一律403/404且不洩漏；同一actor具明示approval permission時可獨立approve，缺permission時403；任一結果都不得自動publish。 |

### 5.5 Publication transaction

| ID | Action | Expected |
|---|---|---|
| PUB-001 | Publish unapproved/needs-info workspace | Blocked；master/reservation unchanged。 |
| PUB-002 | Valid approval but no explicit publish action | Time passes/refresh/outbox worker runs；still no master。 |
| PUB-003 | Valid explicit publish with finalized evidence | Full master bundle/relations + promotion + audit/receipt/outbox same commit。 |
| PUB-004 | Modify/rebuild facts after approved snapshot | `approval_snapshot_stale`；requires new review。 |
| PUB-005 | Evidence missing/stale/fake fail | `publication_evidence_not_ready`；approved lock retained；zero master。 |
| PUB-006 | Inject failure at root insert | Zero root/part/drawing/link/promotion。 |
| PUB-007 | Inject failure at part/drawing/link/promotion/audit/outbox insert | Entire transaction rollback for each point。 |
| PUB-008 | Official/recovery collision after approval | `official_number_collision`；no auto-renumber；PDM Admin blocker。 |
| PUB-009 | Retry identical publish | Same published result/IDs；one official event。 |
| PUB-010 | Outbox dispatch fails after commit | DB remains published；event pending/retry/DLQ；UI may show propagation warning, not unpublish。 |
| PUB-011 | Obsolete published master | Existing controlled obsolete approval/history flow；code remains non-reusable。 |
| PUB-012 | Root-only或part-only且server rule明確`not_required` | Explicit publish可成功；receipt/audit保存rule version與`not_required`結果，不接受client claim。 |
| PUB-013 | Drawing scope具finalized controlled GCS-like evidence | generation/hash/type/finalized_at/rule version一致時可發布；audit只存stable reference，不存signed URL/raw file。 |
| PUB-014 | Drawing scope缺evidence，或generation/hash/rule stale | `publication_evidence_not_ready`；approved lock retained；zero master。 |
| PUB-015 | Production direct GCS verifier unavailable，或preview unavailable | Verifier unavailable時所有需檔案publish鎖定；若verifier與controlled evidence有效，單純2D/3D preview失敗不得被誤判為evidence缺失。 |

### 5.6 Transfer package

| ID | Action | Expected |
|---|---|---|
| TRF-001 | Open `/technical-transfer` | Tabs與single primary CTA；does not create empty package。 |
| TRF-002 | Explicit create | Stable package ID/code + Draft event/idempotency。 |
| TRF-003 | Add official and draft workspace scope | Both retained through typed tables；no candidate-text lookup authority。 |
| TRF-004 | Required draft unnumbered | Readiness blocked；Now What -> acquire candidate。 |
| TRF-005 | Missing BOM/file/owner | Blocked with first owner module/action；not fake ready。 |
| TRF-006 | Valid submit | Frozen scope hash/version + aggregate approval；package InReview。 |
| TRF-007 | Change workspace/BOM/file/scope after snapshot | Old readiness/signoff stale；publish blocked/re-review required。 |
| TRF-008 | Approval complete | Package `ApprovedPendingPublish`；masters unchanged；not in published handoff。 |
| TRF-009 | Batch explicit publish all valid | All pending workspaces promoted; package Published; handoff visible。 |
| TRF-010 | One workspace fails mid-batch | All promotions rollback；package not Published；failure item visible。 |
| TRF-011 | Existing official released item in batch | Validate/preserve identity；do not reissue/re-publish duplicate number。 |
| TRF-012 | Manufacturing/procurement role | Only Published tab/data/downloads；candidate/draft invisible as formal evidence。 |
| TRF-013 | Publish N new workspaces in one package | One package receipt/event + N deterministic official publish events in same commit；each event links package/workspace/reservations/masters。 |
| TRF-014 | Batch rollback then failure recording | Zero promotion/events from main command；separate idempotent marker may set ReleaseFailed only when package version/state still match；otherwise ApprovedPendingPublish + correlation ID。 |
| TRF-015 | Package含root/part-only `not_required`與至少一個drawing workspace | `not_required`只適用符合rule的item；每個drawing/required file都需finalized evidence，任一缺漏整包不發布。 |

### 5.7 Permission, security and tenant isolation

| ID | Action | Expected |
|---|---|---|
| SEC-001 | Unauthenticated all new routes | 401/no mutation。 |
| SEC-002 | Browser spoofs company/role/email | Server actor context wins；403/404 without cross-company existence leak。 |
| SEC-003 | Engineer accesses Company B workspace/reservation/package | Denied and no target details。 |
| SEC-004 | Expired role attempts acquire/submit/publish | Denied according to effective interval。 |
| SEC-005 | Admin without publish permission | Cannot publish merely because system role=Admin。 |
| SEC-006 | Approver without publish permission | Approval works；publish denied。 |
| SEC-007 | Publisher without approval decision permission | Can publish approved assigned scope；cannot decide review。 |
| SEC-008 | Direct API bypass when UI disabled | Same denial/validation as UI。 |
| SEC-009 | Read responses/protected pages | `private, no-store`; no sensitive cache。 |
| SEC-010 | Error/log inspection | No token/session/email/file URL/SQL/stack/raw idempotency key。 |
| SEC-011 | Same actor具submit、approval decision與publish三項明示permission | 可依序完成三個獨立command；各自有confirmation、receipt、audit action，三個actor ID可相同；approval不自動publish。 |
| SEC-012 | Same actor缺任一permission，或嘗試由Admin/approver/publisher角色推定其他permission | 缺少的步驟403且零mutation；已有步驟不授予下一步，UI與direct API結果一致。 |

### 5.8 Migration and rollback

| ID | Action | Expected |
|---|---|---|
| MIG-001 | Fresh SQLite/PostgreSQL install | All tables/checks/FKs/indexes/triggers present。 |
| MIG-002 | Upgrade current fixture DB | Existing counts/FKs preserved；migration one-time/idempotent runner behavior。 |
| MIG-003 | Active simple `part_number_drafts` | Correct workspace/reservation mapping; actor/time/version traceable。 |
| MIG-004 | Voided/recycled draft | No active reservation；history retained。 |
| MIG-005 | Controlled legacy draft | Read-only mapping; no unlock/recycle。 |
| MIG-006 | Released/Obsolete master | Remains official/non-reusable。 |
| MIG-007 | Legacy Draft with refs | `legacy_official_reservation`; not candidate/published。 |
| MIG-008 | Ambiguous no-ref Draft master | Dry-run reports ambiguous；zero automatic mutation。 |
| MIG-009 | Classifier rerun | Same classification/hash；no duplicate mapping。 |
| MIG-010 | Write switch flag off/on | One write authority at a time；no dual-write divergence。 |
| MIG-011 | Transfer status constraint migration | All legacy rows/counts/checksum/FKs equal before-after。 |
| MIG-012 | Application rollback after publication | Published masters/ledger inputs remain readable/non-reusable；no destructive down。 |
| MIG-013 | Production clean-seed validator | Rejects candidate/local draft/demo/history；accepts minimum config + published/obsolete/recovery reservations only。 |

### 5.9 Events, audit and data sanity

| ID | Action | Expected |
|---|---|---|
| EVT-001 | Each command success | Exactly one business audit/receipt/outbox set with stable aggregate IDs。 |
| EVT-002 | Command rollback | No domain/audit/outbox partial rows；failure evidence only through approved non-transactional error audit path。 |
| EVT-003 | Event consumer replay | Same event ID ignored/idempotently applied。 |
| EVT-004 | Event payload scan | No PII/secrets/raw files；schema version/type correct。 |
| EVT-005 | Worker retry/DLQ | Published truth unchanged；delivery status/attempt/checkpoint observable。 |
| EVT-006 | Transfer batch event cardinality | Existing released item emits no new official event；each newly promoted workspace emits exactly one official event plus one package event。 |
| DATA-001 | Known fixture counts | UI/API counts match DB by dimension；not all zero。 |
| DATA-002 | Empty fixture intentionally selected | Empty state clearly states no data and primary create action。 |
| DATA-003 | Candidate versus official list | Candidate counts appear only draft projection；official counts unchanged until publish。 |
| DATA-004 | Handoff counts | Published package count matches formal publication facts；approved-pending excluded。 |

## 6. UI / UX Manual Validation

### 6.1 Required viewports

- Desktop：1440 x 900
- Tablet / narrow desktop：1024 x 768
- Collapsed navigation boundary：768 x 1024
- Mobile：390 x 844
- Minimum supported narrow boundary：320 x 568

每個viewport至少驗證：

- `/numbering/search`
- `/numbering/drawings`
- `/parts?tab=drafts`
- one draft workspace detail/create flow
- `/technical-transfer`三tabs
- one transfer package workbench
- `/approvals` candidate/transfer request detail
- published handoff view

### 6.2 Observable UI cases

| ID | Check | Pass standard |
|---|---|---|
| UI-001 | Open create then close | no network mutation / DB count change。 |
| UI-002 | Header CTAs | exact owner-module CTA visible and only one primary CTA。 |
| UI-003 | Sidebar roadmap / compatibility | Phase 1B flag開啟時`料號草稿 / 領號申請 / 上傳送審 / 製造交接`四項不可見；新owner-surface入口可到達，舊URL只redirect/guidance並保留query/`returnTo`，無第二套mutation。 |
| UI-004 | Draft tab discoverability | user can reach own drafts from料號模組without knowingold route。 |
| UI-005 | Candidate qualification | text + icon/badge, not color-only；never says official。 |
| UI-006 | Approved projection | simultaneously shows已核准、待發布、候選、不可正式使用。 |
| UI-007 | Now What | each nonterminal state has one action, owner role, blocker reason。 |
| UI-008 | Disabled reason | hover/focus/click accessible；not an active-looking dead button。 |
| UI-009 | Candidate acquire confirmation | shows affected root/part/drawing and nonformal warning。 |
| UI-010 | Cancel/recycle confirmation | shows code, refs, lock, consequence；blocked case links first fix。 |
| UI-011 | Publish confirmation | approval snapshot/evidence/mapping/nonreuse consequence visible。 |
| UI-012 | Approval inbox | reviewer decision only; no hidden direct publish action。 |
| UI-013 | Transfer tabs | Prepared/InReview/Published facts correctly partitioned。 |
| UI-014 | Snapshot stale | visible alert + rebuild/review action；no publish CTA。 |
| UI-015 | Old route | redirect/guidance preserves return context；no second mutation flow。 |
| UI-016 | Candidate official list isolation | candidate absent from正式料號/已發布交接。 |
| UI-017 | Obsolete label | `已作廢` only for formal history；draft uses `已取消`。 |
| UI-018 | Download/print candidate | visible watermark on first page/surface。 |
| UI-019 | Long code/name/reason | wraps without overlap/truncating primary action。 |
| UI-020 | Drawer/modal/sheet | keyboard close, focus trap/return, safe-area, no clipping。 |
| UI-021 | Visible-error sweep | no unexpected `.inline-error`, `[role=alert]`, 4xx/5xx, Not Found, Internal Server Error or raw `/api/` text。 |
| UI-022 | Intended error | controlled Chinese message + machine-code-free normal copy + recovery CTA。 |
| UI-023 | Data sanity | fixture expected nonzero counts are nonzero and reconcile。 |
| UI-024 | 1440px | no horizontal page overflow；table/detail usable。 |
| UI-025 | 1024px | primary CTA/status survive；secondary fields move to drawer。 |
| UI-026 | 390px | primary CTA in first screen/sticky safe action bar, not overflow menu。 |
| UI-027 | 390px | no horizontal overflow, overlap, clipped modal, squeezed buttons, text truncation。 |
| UI-028 | A11y | focus visible, tab order logical, labels/descriptions announced, AA contrast。 |
| UI-029 | 768px boundary | navigation collapse, tabs, CTA and drawer remain reachable with no dual-scroll confusion。 |
| UI-030 | 320px boundary | longest code/label wraps; no horizontal overflow, clipped sheet, squeezed icon button or hidden primary CTA。 |
| UI-031 | Five-second Now What | owner/denied/blocked users can identify current state, one primary next action and responsible role without opening audit details。 |

Visible Error Hard Gate：任何非預期visible alert、load failure、HTTP 4xx/5xx、Not Found、Internal Server Error、raw route/API error，或在known nonempty fixture下critical counts全為0，QC立即判`未通過`；build/test/API success不能覆蓋這個fail，必須回到同URL/viewport hard reload重驗。

## 7. Automation Contract

RD實作時應新增或對應下列package scripts；目前不存在的script不得在本文件宣稱pass：

```text
qc:pdm-number-state-flow-schema
qc:pdm-number-state-flow-domain
qc:pdm-number-state-flow-concurrency
qc:pdm-number-state-flow-api
qc:pdm-number-state-flow-routes
qc:pdm-number-state-flow-approval-integration
qc:pdm-number-state-flow-publication
qc:pdm-number-state-flow-transfer
qc:pdm-number-state-flow-compatibility
qc:pdm-number-state-flow-ui
qc:pdm-number-state-flow-regression
```

每個script需：

- fail fast但輸出案例ID/expected/actual；
- 使用isolated/copied DB或transaction rollback fixture；
- 支援Windows `npm.cmd`；
- 不依賴live credential/provider；
- 不寫正常Jenfu sequence或production data；
- 回傳nonzero exit code on failure。

仍需重跑的既有regression family，由RD依package.json現況確認後鎖定，至少涵蓋：

- numbering core/API/contextual entry/idempotency/sequence/gap reuse；
- part draft/change control；
- approval platform；
- submission release master sync/recovery；
- transfer package Phase 3A-0；
- lifecycle/controlled history；
- access control/company isolation；
- TypeScript/lint/build。

## 8. QC Execution Instructions

QC不得修改產品、測試、schema、fixture、文件或dev_task。執行順序：

1. Record exact commit/worktree status、runtime versions、DB copy/fixture hash、feature flags。
2. Run G0 document/path checks。
3. Create isolated clean DB + upgraded fixture DB；run G1。
4. Run domain/concurrency/API/approval/publication/transfer suites G2-G5。
5. Start fixed local dev entrypoint；用實際browser逐route/role/viewport執行G6。
6. Hard reload每個critical page，做visible-error/data-sanity sweep。
7. Run approved existing regressions G7。
8. Collect DB before/after queries、HTTP receipts、test logs、screenshots、console/network notes。
9. Report one of `通過 / 未通過 / 未充分驗證 / 阻塞`；不得把not executed項目寫成pass。

### Evidence naming

建議：

- `.ai-doc/qc/qc-pdm-number-state-flow-report-YYYY-MM-DD.md`
- `output/playwright/pdm-number-state-flow-<route>-<viewport>.png`
- `output/qc/pdm-number-state-flow/<commit-or-timestamp>/...`

QC report每個failed case要包含：case ID、role、company、URL/API、viewport、precondition、steps、expected、actual、screenshot/log/DB evidence、impact、retest status。

## 9. Pass / Fail Rules

### Pass

- G0-G7所有current-phase required checks通過。
- P0/P1 FMEA paths有direct negative/fault/concurrency evidence。
- UI有1440/1024/768/390/320實際browser或明確responsive boundary evidence，以及visible-error/data sanity evidence。
- Candidate/official/approval/publication/transfer facts在API、DB、UI一致。
- 無cross-company leak、partial publication、double allocation、candidate formal-export/handoff pollution。

### Fail

- 任一P0/P1 required case失敗。
- 任一visible error hard gate觸發。
- 缺少transaction rollback、concurrency、permission bypass或migration safety evidence。
- Approval造成master write，或published-only handoff含candidate/approved-pending資料。

### Not sufficiently verified

- 只有unit/build/lint，沒有DB/API/browser/viewport evidence。
- UI只有fresh page成功，沒有原失敗surface hard reload。
- 缺少fixture counts，無法判斷empty state是否合理。

### Blocked

- 無法啟動app、建立isolated DB、登入必要roles或取得implementation commit。
- 需要live provider/release evidence但未收到future instruction；此時只阻擋G8/G9，不否定已完成的local G0-G7。

## 10. Completion Boundary

本QA plan已達`QA Plan Ready`，Phase 1A RD implementation與self-verification已完成；`HD-048-01..03`已由使用者以`1C / 2C / 3C`關閉並轉成UI/evidence/same-actor permission案例。只有前置phase通過，且獨立QC收集對應phase的role/company/API/DB/browser/concurrency或fault evidence後，才可更新該phase為QC passed。

## 11. Phase 1A RD Handoff Evidence

- RD report：`.ai-doc/reports/rd/rd-dev-048-phase1a-number-state-flow-report-2026-07-13.md`
- Focused contract：`qc:pdm-number-state-flow-contract`，19/19。
- Isolated runtime：`qc:pdm-number-state-flow-runtime`，7/7；實際覆蓋create/replay/acquire/replay/cancel/reuse/rollback/classifier與audit/receipt/outbox。
- Provider artifacts：`qc:postgres-shadow` 26/26；`qc:supabase-runtime-migrations` 46/46。未連線live PostgreSQL/Supabase。
- Compile gates：TypeScript通過；lint 0 error（3個既有attachment warning）；isolated production build通過。
- Independent QC：2026-07-13 local Phase 1A通過；`qc:pdm-number-state-flow-phase1a` 47/47，包含disposable HTTP server、Company A/B、owner/manager/admin/denied roles、20-way distinct/same-key acquire、direct API bypass、reference blocker與503 no-offline error matrix。報告：`.ai-doc/qc/qc-pdm-number-state-flow-phase1a-report-2026-07-13.md`。G8/G9仍未開始。

## 12. Phase 1B-1D QA/QC Handoff Matrix

本矩陣是後續執行邊界；QC每次只執行一個phase的required set與必要regression，不因後續phase尚未實作而判目前phase失敗。

| Phase | Entry | Required functional/data cases | Required UI/role cases | Focused automation contract | Exit evidence |
|---|---|---|---|---|---|
| Phase 1B UI/Status | Phase 1A independent QC pass | `DFT-001..006`、`NUM-001..006`、`REC-001..008`、`DATA-001..004` | AC-NAV/NUM/STA適用案例；owner/manager/admin/denied + Company A/B；1440/1024/768/390/320 | `qc:pdm-number-state-flow-ui`、`qc:pdm-number-state-flow-routes` + numbering/navigation/access-control regressions | route/flag matrix、DB/API/UI counts、hard-reload screenshots、console/network notes |
| Phase 1C Review/Publish | Phase 1B independent QC pass | `APR-001..010`、`PUB-001..015`、`CON-004..006`、`SEC-004..012`、`EVT-001..005` | owner/approver/publisher/same-actor/denied + Company A/B；submit/withdraw/decision/publish/failed retry surfaces | `qc:pdm-number-state-flow-approval-integration`、`qc:pdm-number-state-flow-publication` + approval/release/lifecycle regressions | per-fault rollback facts、approve-zero-master、publish complete-bundle、evidence/permission/API/browser evidence |
| Phase 1D Transfer/Compatibility | Phase 1C independent QC pass | `TRF-001..015`、`CON-006`、`MIG-011..012`、`EVT-006`、`SEC-001..012`、`DATA-001..004` | engineer/RD manager/approver/publisher/same-actor/manufacturing/denied；old bookmarks；1440/1024/768/390/320 | `qc:pdm-number-state-flow-transfer`、`qc:pdm-number-state-flow-compatibility` + transfer/approval/numbering/lifecycle regressions | migration parity、batch/event/evidence all-or-none、published-only handoff、redirect/browser evidence |

### 12.1 Phase 1B execution notes

1. 使用known nonempty fixture先記錄workspace/candidate/master counts，再驗證正式料號與草稿tab不混authority。
2. flag off/on各跑一次route/CTA/direct API matrix；disabled或`未開放`只算UI evidence，server denial另行驗證。
3. create drawer open/close、save、acquire replay、cancel/recycle、409 reload與503 no-offline皆需實際browser + DB before/after。
4. 每個critical route在1440/1024/768/390/320做hard reload或明確responsive boundary檢查；不得只測client-side navigation。

Phase 1B fail-fast：candidate出現在正式tab、UI自行產生candidate、known data被錯誤顯示empty、舊route丟失query/return context、direct API在disabled UI下仍可繞過。

### 12.2 Phase 1C execution notes

1. 先證明approve apply後`part_roots/part_numbers/drawing_numbers/drawing_part_links`count不變，再進publish測試。
2. 對root、part、drawing、relation、promotion、workspace、audit、receipt、outbox每個write point做fault injection；每次都要獨立DB before/after。
3. snapshot UPDATE/DELETE、stale version、evidence `not_ready`、official/recovery collision、same-key publish replay與outbox post-commit failure均為hard gate。
4. approver without publish、publisher without decide、Admin without explicit permission、same actor具/缺三項明示permission、approval不自動publish與cross-company direct API必須分開驗證。

Phase 1C fail-fast：approval造成任何master write、publish出現partial bundle、collision自動換號、fake/missing evidence仍發布、相同receipt建立第二組master/event。

### 12.3 Phase 1D execution notes

1. Fresh與upgrade fixture都跑schema migration；比較package/status/scope row counts、FK check與checksum，legacy `Draft/Cancelled`不得改值。
2. readiness分別注入workspace、BOM、file、owner、adapter與state inconsistency blocker，確認first owner/action且不得fake ready。
3. batch含至少兩個workspace與一個existing released item；逐promotion fault injection證明outer transaction全rollback且released identity不重發。
4. manufacturing/procurement以UI、API、download/export四個surface驗證只有Published/formal-use資料；不得只檢查tab名稱。
5. `/handoff`、`/upload`、舊transfer bookmark保留ID/query/return context；無context upload只顯示guidance且無generic mutation。

Phase 1D fail-fast：package Approved即進handoff、batch部分成功、candidate可被製造/採購查詢或下載、migration遺失legacy row/FK、old bookmark導404/500或錯誤package。

Phase 1D execution result：首輪獨立QC發現3個P1、2個P2，涵蓋legacy API guard、draft scope idempotency、`ReleaseFailed` lock recovery、UI publish permission及PostgreSQL event immutability。修正後獨立重驗未留P0/P1/P2；focused aggregate 60/60，另通過Phase 1A/1B/1C 48/48、14/14、43/43 regressions。詳見`.ai-doc/qc/qc-pdm-number-state-flow-phase1d-report-2026-07-13.md`。

### 12.4 Required report boundary

每個phase各產生一份QC判定或在同一報告中使用獨立章節，至少記錄：

- exact commit/worktree、runtime、fixture hash、feature flags與server/data directory；
- required case IDs、commands、pass/fail/not-executed counts；
- DB/API/browser evidence paths與角色/公司/viewport；
- P0/P1 failure與retest；
- phase判定及下一個允許指令。

Phase 1A-1D QC已於2026-07-13依序通過，DEV-048 local product integration完成。後續不自動進入provider或release；只有明確指令才依DEV-046 / DEV-032與release gate執行live evidence。
