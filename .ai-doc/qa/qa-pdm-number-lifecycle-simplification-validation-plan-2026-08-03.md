# QA Plan：DEV-052 圖料生命週期效率優先簡化

Status: `Phase 1A-1D Focused Local QC Passed / Production Evidence Deferred`
Date: 2026-08-03
Readiness reviewed: 2026-08-04
AI real-operation plan added: 2026-08-04 (`Planned / Not Yet Executed`)
Owner: QA
Related DEV: `DEV-052`
Related SPEC: `.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-additive-adoption-and-auto-finalization.md`

## 1. Objective

驗證新流程確實減少人工步驟，同時證明：

- 正式環境既有 reservation/workspace/approval/master 不因 migration、bootstrap、read/open 或 projection 被改寫；
- 候選首版可在正式發布前安全編輯與送審；
- 核准後正式化是原子、冪等、可恢復；
- 小數研發版由 physical `Pending` package + immutable companion 投影為 effective `ReviewApproved`，永不成為 `Released`；
- legacy pending/approved number-only requests 不被錯誤擴大為圖面核准。

本計畫不授權讀寫 production。任何 production snapshot 必須為經核准的 sanitised/read-only evidence 或獨立 release gate 提供的受控 target。

## 2. Entry Criteria

- DEV-052 已由 Dev PM 升級為 `RD Implementation Ready`；執行者只跑本次已派工 phase，不跨 phase。
- migration artifact 為 additive-only，且 SQLite/PostgreSQL/Supabase mirror 三者一致。
- feature flag 預設 off；測試可在 isolated local/staging target 開啟。
- approval、file evidence、audit/outbox 與 revision policy fixtures 可控制成功／失敗。
- production-like snapshot 已去識別化，或由 read-only operator 在獨立 gate 執行 comparison script。

## 3. Test Data Matrix

至少建立下列 company-scoped fixtures：

| Fixture | Initial facts | Expected projection |
|---|---|---|
| F1 new root+drawing+part | no workspace | create → `drawing_preparation` |
| F2 legacy active | workspace active + active reservations, no candidate revision | `drawing_preparation`，read zero-write |
| F3 legacy pending | review_locked + pending number-only approval | `in_review / legacy_number_review` |
| F4 legacy approved | approved_locked + approved number-only snapshot | `drawing_addendum_required` |
| F5 published | workspace published + promoted reservations | `official_controlled`，no duplicate write |
| F6 cancelled/recycled | terminal history facts | `history_only` |
| F7 inconsistent | missing approval, conflicting claims or mixed impossible state | `recovery_required` |
| F8 cross-company twin codes | same display codes in separate companies | no leakage/collision across company scope |

所有 ID、號碼、snapshot hash 與 row counts 在測試前保存 baseline。

## 4. Production Data Protection Gates

### DP-01 Migration is zero-DML

- 靜態檢查 migration 不含針對既有 business rows 的 `UPDATE`、`DELETE`、`MERGE`、data-copy `INSERT ... SELECT` 或 workflow-version backfill。
- migration 可新增 tables、indexes、constraints與 immutable triggers，但不得 alter/rebuild既有 business tables或重寫既有 rows；不得擴張 `drawing_revision_packages.status`。
- 唯一允許的 DML 是 `numbering.candidate_bundle_review` 新 control-plane action 的 `INSERT ... ON CONFLICT DO NOTHING`；禁止 role grant update、business-row insert-select或 upsert existing action。
- migration up、立即重跑與 rollback rehearsal 均需保存 schema diff。

### DP-02 Read/open is zero-write

對 F2-F7 依序執行 list API、detail API、drawer open、refresh、tab switch、server restart/bootstrap：

- database change counter、audit、outbox、command receipt與 sequence 均不得增加；
- workspace/reservation/approval/master counts、PKs、states、codes、row versions、snapshot hashes 前後一致；
- 不得因 candidate revision 缺 row 就 lazy create。

### DP-03 Explicit-write boundary

只有使用者點擊 `完成首版圖面` 並通過 permission/idempotency gate 後，才新增 candidate revision rows。不得更新原 reservation code/state；同一 idempotency key 重送不新增第二 row。

### DP-04 Release target gate

正式 activation 前，需另有：target identity、backup/restore evidence、sanitized or read-only comparison evidence、migration owner、recovery owner、feature-flag rollback與 old/new app read compatibility。缺一即 no-go。

## 5. Functional Test Cases

| ID | Scenario | Expected result |
|---|---|---|
| QA-052-001 | 新建料件 | 原子建立 workspace + candidates；primary next step 為 `完成首版圖面` |
| QA-052-002 | F2 開啟詳情 | 不寫 DB；可進 candidate first-revision workbench |
| QA-052-003 | 建立候選 `0.1` | 保存 candidate aggregate與 policy suggestion；不建立 formal drawing revision package |
| QA-052-004 | 修改 candidate revision/file | expected row version 正確才成功；stale update 409/fail closed |
| QA-052-005 | bundle incomplete submit | 缺圖料關係、revision、required file或 finalized evidence 時拒絕 |
| QA-052-006 | bundle ready submit | 只建立一個 versioned approval request/snapshot；整包鎖定 |
| QA-052-007 | pending withdraw | 保存舊 snapshot，解鎖成可編輯 draft；重送建立新 snapshot version |
| QA-052-008 | bundle reject/needs-info | 不建立 formal records；回到安全可修正狀態 |
| QA-052-009 | bundle approve | 同交易建立完整 masters/links/promotions、physical `Pending` package、immutable review-approval companion、audit/receipt/outbox；effective `ReviewApproved` |
| QA-052-010 | F3 legacy review approve | 不自動發布；轉 `drawing_addendum_required` |
| QA-052-011 | F3 withdraw/reject | 進 `drawing_preparation`，之後送完整 bundle |
| QA-052-012 | F4 addendum submit/approve | 引用 legacy approval hash；只審新增圖面範圍；成功後完整正式化 |
| QA-052-013 | F5 open/retry | 唯讀；不得重建 candidate、master、package或 event |
| QA-052-014 | F6 terminal open | 只有歷史檢視，不提供復活／發布捷徑 |
| QA-052-015 | F7 inconsistent | 顯示 recovery guidance；不猜測、不寫入、不正式化 |
| QA-052-016 | 進入保留號頁 | `/numbering/drawings?tab=reserved` 保留；tab顯示 `保留號`、V2工作區顯示 `保留號／首版準備`；無第二套V2/legacy page |
| QA-052-017 | V2正常狀態切換 | preparation=`完成首版圖面`、editing=`繼續完成首版`、ready=`送交審核`、review=`查看審核`；每個狀態只有一個primary CTA |
| QA-052-018 | V2例外狀態 | empty/legacy/blocked/recovery/terminal才顯示 Now What，首句回答使用者下一步或免處理 |
| QA-052-019 | 正式化成功後重新載入 | 案件離開預設進行中保留號清單，在正式圖號頁及歷史／全部篩選仍可找到 |
| QA-052-020 | V2 flag off | 現有 route、tab、V1文案與操作維持不變；不得出現半套V2 CTA或candidate lazy write |

## 6. Atomicity and Idempotency Tests

在 apply transaction 的每一個 domain write 邊界注入 failure：

1. approval lock 後；
2. formal root 後；
3. formal part/drawing 後；
4. links 後；
5. reservation promotion 後；
6. revision package／file links 後；
7. audit/receipt/outbox 前。

每次都驗證：

- transaction rollback 後正式 rows 全無新增，原 candidate/approval facts 可診斷；
- approval 顯示 apply failure，不偽裝完成；
- 以相同 request + idempotency key 重試成功一次；
- 成功回應遺失後連續重試三次，只存在一組 master IDs、revision package、audit fact、receipt與每種 outbox event；
- 不自動換號、不跳 sequence、不建立 orphan file link。

## 7. Revision and Release Safety

- `0.1`、`0.2`、`1.1` bundle approval只可產生 physical `Pending` + matching immutable companion；新版 effective status 為 `ReviewApproved`。
- 舊版 reader 不讀 companion時只能看到 `Pending`，不得 crash，也不得誤列為 released/current。
- final approval、retry-release、release workflow與 repository direct call 均拒絕把 minor revision 轉為 `Released`。
- effective `ReviewApproved` 不更新 released/current manufacturing pointer，不出現在 production-effective download、handoff或 released-only report。
- major revision 的既有 release flow regression 必須通過。
- suggestion snapshot、manual override reason、stale basis與 normalization 沿用 DEV-050 規則。

## 8. Permission and Security Tests

- 無 `numbering.draft.update` 不得建立／修改 candidate revision。
- 無 `numbering.candidate.review.submit` 不得送審；無 withdrawal permission 不得撤回。
- 無 approval decision permission 不得核准；Admin 身分本身不隱含權限。
- cross-company workspace/revision/approval/file IDs 一律 404/403 且無資訊洩漏。
- client spoof `companyId`、actor、state、master IDs、approved flag、snapshot hash均被忽略或拒絕。
- approver attribution 與 system formalization actor 同時保留，不能只記 system。
- error、audit、outbox與 UI 不得輸出 credential、signed URL、raw secret或不必要檔案路徑。

## 9. UI/UX Validation

Browser matrix：Chromium desktop 1440x900、1280x720、1024x768、mobile 390x844；必要時補 Edge current。

### 9.1 Page retention and navigation

- 直接開啟及 hard reload `/numbering/drawings?tab=reserved` 均停留同一 route；不得跳到 `/numbering/revisions`、新 V2 route或 legacy page。
- 頁籤文字仍為 `保留號`；V2工作區 H1／主標題為 `保留號／首版準備`，首屏最多保留一句用途說明。
- 預設清單只顯示需推進案件；正式化成功後該列消失於預設進行中清單，但正式圖號頁與歷史／全部篩選可定位同一 business identity。
- list load、filter、tab switch、drawer open/close、hard reload 前後通過 DP-02 零寫入 gate。

### 9.2 Primary-action matrix

| State | Expected primary CTA | Forbidden duplicate |
|---|---|---|
| active, no candidate revision | `完成首版圖面` | `送交發布審核`、`正式發布` |
| candidate editing, incomplete | `繼續完成首版` | 第二個首版入口、formal `/numbering/revisions` handoff |
| bundle ready | `送交審核` | 號碼獨立送審、人工發布 |
| in review | `查看審核` | disabled submit/publish primary |
| auto finalizing | none | 任何人工 publish/confirm primary |
| official controlled | `查看正式圖面` | `正式發布`、`建立首版圖面` |
| apply failed | permission-based `重試正式化`／`查看處理狀態` | 重建候選號、重新送新snapshot |
| history only | `查看紀錄` | 復活、重新占號、發布 |

### 9.3 Information hierarchy and state language

- F2 第一眼只有一個主要動作 `完成首版圖面`；不再顯示「此階段尚未開放」。
- 完成 candidate content 後主要動作變為 `送交審核`；沒有第二個號碼審核入口。
- in-review、approved/finalizing、success、apply-failed、legacy addendum與history-only 文案可區分。
- 不把 `rowVersion` 顯示為 drawing version；`0.1` 不顯示為正式發行。
- 正常 preparation／ready／review／success 不渲染 `NowWhatPanel`；empty、legacy、blocked、recovery、restricted、terminal的首句必須回答「現在做什麼／是否不用處理」。
- 主畫面不得顯示 `DEV-052`、snapshot hash、API route、raw lifecycle/status、fixture或 storage path；完整技術資料只能在detail/audit。
- 紅筆刪除測試必須證明頁首副標、summary小字、section heading及table第二行都有當下決策價值，否則刪除或降層。

### 9.4 Interaction, responsive and evidence

- drawer/footer/scroll 不遮 CTA；mobile 無非預期水平 overflow。
- keyboard tab order、visible focus、modal/drawer focus trap與 close recovery 正確。
- loading 防重送、disabled reason、error live region與 retry feedback 可見。
- `送交審核` confirmation摘要候選號、首版版次、檔案數與圖料關係；核准後自動正式化不要求第二次人工 confirmation。

保存每個關鍵狀態的 screenshot、visible-error sweep、console error與 failed-request evidence；可見文字不得出現 uncaught error、undefined、NaN 或 raw state code。至少保存：

- `reserved-list-active-1440x900.png`
- `reserved-drawer-preparation-1280x720.png`
- `reserved-drawer-ready-1024x768.png`
- `reserved-drawer-recovery-1440x900.png`
- `reserved-drawer-mobile-390x844.png`
- `official-after-auto-finalization-1440x900.png`

AI 5 秒理解檢查必須以首次穩定畫面的 screenshot 為唯一輸入，逐一回答：所在頁面、頁面用途、目前狀態、唯一下一步、不可正式使用風險；缺一則 UI/UX 未通過。

## 10. Regression Suite

至少重跑：

- DEV-048 number state flow focused QC；
- DEV-050 revision suggestion/release gate QC；
- DEV-051 reservation revision timing UX QC，並依 DEV-052 amendment 更新預期；
- approval platform、entity detail drawer、production slice numbering draft；
- migration mirror、TypeScript、scoped lint、isolated production build；
- file evidence fail-closed tests。

不得為使 DEV-052 通過而刪除或弱化 minor-release、permission、cross-company、idempotency或 file-evidence assertions。

## 11. Phase Gates and Evidence Commands

### Phase 1A gate

Required changed-file scope is limited to schema/mirror, default-off feature status, pure projection/read repository, focused scripts and package script registration. Execute:

```text
npm run qc:dev-052-phase1a
npm run qc:supabase-runtime-migrations
npm run typecheck
npm run qc:doc-paths
```

`qc:dev-052-phase1a` must compose:

- `scripts/qc-dev-052-number-lifecycle-schema.mjs`：三 provider schema parity、constraints/indexes/triggers/RLS、new-action-only DML、V2 default off。
- `scripts/qc-dev-052-number-lifecycle-data-protection.mjs`：F2-F7 list/detail/bootstrap 反覆執行後，existing business rows count/PK/code/state/rowVersion/hash、audit、receipt、outbox與 change counter 全部不變。

Phase 1A no-go：任何 V2 mutation route/UI CTA被加入、`src/lib/production-slice.ts` 被放寬、existing table 被 rebuild/alter、或 baseline hash 改變。Phase 1A 通過只授權請求 Phase 1B，不代表 UI、approval或 production ready。

### Phase 1B gate

Execute `npm run qc:dev-052-phase1b`，由 `scripts/qc-dev-052-number-lifecycle-http.mjs` 的 candidate subset與 `scripts/qc-dev-052-number-lifecycle-ui.mjs` 組成，另跑 typecheck/scoped lint。必須將 Section 9.4 的六張狀態／viewport screenshots保存於 `output/playwright/dev052-number-lifecycle-simplification/`，並在同目錄建立 `browser-evidence.json`，記錄 route、tab/H1、state、visible primary CTA count/text、Now What presence、horizontal overflow、visible-error sweep、console errors/warnings與 failed requests。

允許 local `PDM_PUBLICATION_EVIDENCE_MODE=local_fake` fixture，但 fake evidence 仍需使用 structurally valid GCS pointer/hash/generation，且 `NODE_ENV=production` 必須 fail closed。

### Phase 1C gate

Execute `npm run qc:dev-052-phase1c`，包含：

- `scripts/qc-dev-052-number-lifecycle-flow.mjs` 全部 snapshot/decision/savepoint/package/companion tests；
- `scripts/qc-dev-052-number-lifecycle-http.mjs` bundle submit/withdraw/decision/retry subset；
- 每一個 Section 6 fault point；
- same command duplicate、lost-response retry、apply-failed retry各三次；
- approval request、decision、candidate rows、formal rows、audit、receipt、outbox的 exact-count assertions。

必須證明 failure savepoint rollback 後 decision/apply-failed 診斷存在，但 formal root/part/drawing/link/promotion/package/companion/file link與 success outbox皆為零增量。

### Phase 1D gate

Execute `npm run qc:dev-052-phase1d`，包含 F2-F7 compatibility/addendum rehearsal、DEV-048/050/051 regressions、approval platform、drawing package、production slice、migration mirror、typecheck、lint與 isolated production build。production-like snapshot 只能是 sanitised clone或 read-only operator evidence。

QA report 必須逐 phase列出 command、exit code、pass count、artifact path、known limitation與 deferred production gate，不得把結構檢查寫成 browser evidence，也不得把 local fake GCS 寫成 production authority。

## 12. Exit Criteria

- 所有 P0/P1 test cases 通過，零 open P0/P1 defect。
- DP-01..04 有可重現 evidence；production-like old-data comparison 為零 business-row mutation。
- atomic failure injection 與三次 duplicate retry 全數通過。
- legacy F2-F7 映射與 addendum 路徑通過，無 blind auto-publish。
- desktop/mobile UI、accessibility、typecheck、build與指定 regression 通過。
- QA report 明確區分 local/staging evidence 與尚未執行的 production evidence。

## 13. Stop / No-Go Conditions

- migration 需要既有 business-row DML/backfill；
- 任一 read/open path 產生 lazy write；
- apply failure 留下部分 master、promotion或 revision package；
- 舊 number-only approval 可直接發布未審圖面；
- minor revision 可成為 `Released` 或 manufacturing current；
- production file evidence authority 未就緒；
- old/new app read compatibility、rollback或 recovery owner 未證明；
- 測試要求 production credential、live mutation、deploy或 release，但沒有獨立授權。
- physical package status 被新增 `ReviewApproved`，或 migration 需 rebuild/copy `drawing_revision_packages`。
- V2 mutation 被加入目前 production-slice allowlist，或 flag default-on。

## 14. Local Execution Result (2026-08-04)

Verdict: `PASS for local implementation scope`；production migration、真實 GCS authority、deployment與 production smoke仍為 deferred release gate。

- Phase 1A：schema 12/12、data protection 4/4；migration僅新增 additive authority與新 approval action，read/open/bootstrap零寫入。
- Phase 1B：HTTP/idempotency 10/10、UI contract 9/9；保留原 route/tab，候選首版在同一 drawer完成，normal state單一primary CTA。
- Phase 1C：bundle/atomic flow 8/8；fault rollback、immutable decision、`apply_failed`、same-snapshot retry、legacy approved addendum與 `ReviewApproved` projection通過。
- Phase 1D focused regression：revision release gate 11/11、DEV-048 runtime 7/7、Supabase migration 69/69、TypeScript、scoped lint、production build通過。
- 真實瀏覽器：本機既有 A0005-M01 只做 read/open；顯示 `準備候選首版`、`尚不可正式使用`與唯一下一步，desktop/mobile無水平overflow，console errors/warnings為0；未對既有資料執行建立、更新、送審或取消。
- 完整命令、環境邊界與既有 baseline suite drift見 `.ai-doc/qc/qc-dev-052-number-lifecycle-simplification-2026-08-04.md`。baseline drift不以弱化 DEV-052 safety assertions處理。

## 15. 由 AI 執行的真實操作驗證計畫（QA 執行版）

本章把前述契約轉成由 AI QA 直接控制真實瀏覽器、隔離測試帳號與實際 rendered UI 的執行 runbook，再由獨立 AI QC 任務判讀證據。`Planned` 不代表已執行；只有 Section 15.13 的證據與簽核完整後，才可更新為實際結論。

「由 AI 執行」的必要定義：

- AI 必須以 in-app browser 或 Playwright 控制真實瀏覽器，實際導覽、點擊、輸入、上傳、確認、撤回、切換帳號、reload與截圖。
- 核心業務流程不得以直接呼叫 mutation API、直接改 DB、靜態讀 code、單元測試或預先寫死結果取代 UI 操作；API／SQL只可做前置fixture、唯讀查證與前後資料比對。
- 同一 AI QA 任務可依序控制多個browser contexts，但Operator、Approver、Viewer與Recovery必須使用不同test principals與隔離session。
- AI QA只執行並記錄，不因自己完成操作就宣告獨立QC通過；最終QC verdict由另一個AI任務或明確分離的QC執行階段依evidence重驗。
- 登入需要未知密碼、MFA、CAPTCHA、production授權或人類高風險確認時，AI標記`Blocked`並停止，不要求使用者把secret貼入對話，也不繞過控制。

### 15.1 驗證目標與硬邊界

AI真實操作驗證必須同時回答：

1. 新建案件能否以 `完成首版圖面 → 送交審核 → 核准後系統自動正式化` 完成，且沒有人工 `正式發布`。
2. 正式環境原有保留號能否依既有 facts 投影到新流程並繼續往前，而非另建、改號或遺失。
3. 搜尋、切頁、開關 drawer、refresh、hard reload 與 server bootstrap 是否為 business data 零寫入。
4. 送審、撤回、退回、核准與失敗重試的 UI、資料、audit、receipt、outbox 是否一致。
5. `0.x`／`1.x` 核准後是否只成為 effective `ReviewApproved`，不會成為 physical `Released` 或 manufacturing current。

環境邊界如下：

| Target | 允許操作 | 禁止操作 |
|---|---|---|
| A. isolated local | 專用 fixture 的完整新增、編輯、上傳、送審、撤回、決議、故障注入與重試 | 連線 production DB／bucket；使用真實員工或客戶資料 |
| B. approved staging / sanitised clone | AI以真實瀏覽器執行完整流程、真實 provider evidence、舊資料相容與 RWD 驗證 | 使用 `local_fake` evidence；把 production credential 複製到測試環境 |
| C. production read-only gate | 經 release owner 書面授權後，以既有部署做 list/detail/drawer/reload 唯讀觀察，並以 read-only replica／帳號比較既有資料 hash | 開 feature flag、migration、啟動連 production DB 的本機 server、建立 candidate、上傳、送審、撤回、決議、重試、取消或清理任何既有保留號 |

production 既有保留號不得被當 fixture。若需要驗證其「直接進入新流程」能力，先擷取經核准且去識別化的 snapshot 到 Target B；原始 production row 只做唯讀 baseline comparison。任何 production 寫入、deploy、migration 或 feature activation 都屬獨立 release gate，不由本 QA 計畫授權。

### 15.2 AI 執行身分、瀏覽器 context 與職責

至少準備兩個不同test principals與隔離browser contexts。可由同一個AI QA任務依序操作，但不得共用cookie、local storage或server session：

| AI身分／browser context | 必要權限 | AI執行責任 | 隔離規則 |
|---|---|---|---|
| AI-QA Operator／Context A | `numbering.workspace.view`、`numbering.draft.update`、`numbering.candidate.review.submit`、`numbering.candidate.review.withdraw` | 準備首版、上傳、送審、撤回、補件 | 不得成為同一request的approver |
| AI-QA Approver／Context B | `numbering.candidate.review.decide` 與 approval rule 指派 | 查看frozen snapshot、退回／核准 | principal、cookie與storage均不得和Context A共用 |
| AI-QA Viewer／Context C | view only，無 draft／submit／withdraw／decide | 驗證restricted與越權行為 | 不臨時加權限繞過案例 |
| AI-QA Recovery／Context D | `numbering.candidate.review.decide`；runtime recovery gate允許 | 只對原approved snapshot執行重試 | 不得編輯snapshot、換號或重建request |
| AI-QC Reviewer／獨立task | evidence唯讀；若重驗UI則使用viewer或專用QC帳號 | 重驗route、截圖、可見錯誤、DB diff與最終判定 | 不修改產品或補寫QA未取得的證據 |

執行前需匯出每個帳號的實際role、company與action permission；以runtime結果為證據，不以角色名稱推定。AI必須在manifest記錄context與principal的對應，但不得保存密碼、cookie、token或MFA recovery code。

### 15.3 專用測試資料

每一條會改變狀態的分支使用不同 workspace；命名建議 `QA-DEV052-<RUN_ID>-<CASE>`。禁止共用 production business code。

| Fixture | 初始狀態 | 用途 | 最終預期 |
|---|---|---|---|
| R01 | 新建 workspace | happy path | `official_controlled` |
| R02 | 新建 workspace | incomplete bundle／validation | 保持 candidate draft |
| R03 | 新建 workspace | withdraw → edit → resubmit | 新 snapshot version，舊 snapshot保留 |
| R04 | 新建 workspace | reject／needs-info | 無 formal records，可安全修正 |
| R05 | 新建 workspace | duplicate click／lost response | 每種 domain result exactly once |
| R06 | 新建 workspace | apply failure／retry；僅 Target A 故障注入 | 失敗零部分正式資料；重試成功一次 |
| R07 | sanitised legacy `active` | 既有保留號直接準備首版 | `drawing_preparation`；開啟零寫入 |
| R08 | sanitised legacy `review_locked` | 舊 number-only pending review | 核准後 `drawing_addendum_required`，不可直接正式化 |
| R09 | sanitised legacy `approved_locked` | drawing addendum | 差異審核後才正式化 |
| R10 | sanitised `published/promoted` | terminal compatibility | `official_controlled` 唯讀；無重建 |
| R11 | sanitised `cancelled/recycled` | history behavior | `history_only`；無復活 CTA |
| R12 | sanitised inconsistent facts | recovery behavior | `recovery_required`；不猜測、不寫入 |
| R13 | company B 同顯示碼 | company isolation | company A 查不到且不洩漏存在性 |

測試檔案至少準備一份可辨識內容的有效 drawing PDF；檔名不得含客戶、員工或機密專案資訊。Target A 可使用 structurally valid local fake provider fixture；Target B 必須使用真實 finalized provider evidence，且確認 `PDM_PUBLICATION_EVIDENCE_MODE` 不是 `local_fake`。

### 15.4 Run manifest 與執行前檢查

每次執行先建立 `RUN_ID=DEV052-YYYYMMDD-HHMM-<target>`，並在 evidence manifest 記錄：

- target名稱、base URL、environment banner、DB host/project identity、storage provider identity；
- Git commit SHA／build ID、browser/version、OS、timezone；
- feature flag值與 evidence mode；
- AI-QA task/thread ID、AI-QC task/thread ID、Operator/Approver/Viewer/Recovery principal識別與browser context對應（不保存密碼、cookie或token）；
- fixture IDs、candidate codes、approval request IDs；
- 測試起訖時間、AI執行task與中止／例外紀錄。

Preflight 順序：

1. AI以兩組獨立來源交叉核對：瀏覽器頁面環境標示／base URL，以及server health或唯讀runtime manifest中的DB／storage identity；任一指向production而本次不是C gate，立即停止。
2. Target A／B 備份專用 fixtures；保存 F2-F7 對照 snapshot 的 row count、PK、code、state、row version與 hash。
3. 確認沒有 local server、test runner、migration tool 或 SQL client 連到 production。
4. 驗證Operator與Approver是同company的不同principal與隔離sessions；Viewer確實無mutation permissions。
5. AI先用唯讀方式確認目前browser context的登入principal；若無法證明session隔離，立即停止。
6. 在正式操作前執行 `npm run qc:dev-052-number-lifecycle-data-protection`；失敗即 no-go。
7. 對 R07-R12 只做 list/detail/drawer/reload，重取baseline；任何audit、outbox、receipt、sequence或business row delta即停止，不開始mutation cases。

### 15.5 建議執行波次

| Wave | 時間盒 | 內容 | 進入下一波條件 |
|---|---:|---|---|
| W1 AI安全與理解 | 20-30 分鐘 | target identity、contexts、baseline、R07-R12零寫入、AI 5秒理解 | 零production mutation、零read-side write、無P0/P1 |
| W2 AI主流程與權限 | 60-90 分鐘 | R01-R05、送審／撤回／退回／核准、viewer與cross-company | 狀態、DB exact-count、畫面與audit一致 |
| W3 AI相容／復原／RWD | 45-60 分鐘 | R06、R08-R13、三viewport、鍵盤、visible-error sweep | recovery、legacy、responsive與證據包完整 |

R06 故障注入只在 Target A 執行。Target B 若沒有已核准且可回復的 fault switch，將此項標記為 `Not sufficiently validated`，不得用手動竄改 DB 取代。

### 15.6 AI 真實操作案例總表

每個案例都要由AI記錄`Actual UI`、`Actual data delta`、screenshot、request/response summary、console、visible error與executor verdict；只寫「符合預期」不算證據。

| ID | AI執行身分 | 操作摘要 | 畫面預期 | 資料／安全預期 | 必存證據 |
|---|---|---|---|---|---|
| RO-00 | AI-QA；AI-QC後驗 | 核對target、flag、contexts、principals、baseline | 清楚辨識非production mutation target | manifest與baseline完成 | target banner、manifest、permission dump |
| RO-01 | Operator | R07-R12 搜尋、篩選、開關drawer、refresh、hard reload | route仍為 `/numbering/drawings?tab=reserved` | candidate/audit/outbox/receipt/sequence零增量 | before/after hash、network與截圖 |
| RO-02 | Operator | 開R07；首次穩定後只看viewport screenshot，在5秒限制內回答頁面用途、狀態、下一步與風險 | `保留號／首版準備`、唯一 `完成首版圖面`、`尚不可正式使用` | 開啟零寫入 | 1440x900首次畫面、AI回答與時間戳 |
| RO-03 | Operator | 點 `完成首版圖面`；連點兩次 | 顯示loading防重，完成後進首版編輯 | candidate只新增一次；無formal package/master/promotion | command receipt、DB delta |
| RO-04 | Operator | R02 未上傳必要檔案即嘗試送審 | 缺項具體可見；不可送出 | 無approval request、無鎖定、無formal rows | 錯誤畫面、response code |
| RO-05 | Operator | 上傳 primary drawing、確認版次與關係；測試override reason | ready後唯一primary為 `送交審核` | finalized evidence有效；candidate仍非正式資料 | ready截圖、file evidence摘要 |
| RO-06 | Operator | 點 `送交審核`，先取消confirmation，再重新送出 | confirmation列候選號、版次、檔案數、圖料關係；取消不送出 | 最終只建立一個immutable request/snapshot | confirmation前後截圖、snapshot hash |
| RO-07 | Viewer/Operator | Viewer嘗試修改／送審；Operator送審後再嘗試編輯 | Viewer無主操作或顯示權限原因；review中顯示 `查看審核` | 403/disabled且零資料變化；bundle鎖定 | permission response、locked UI |
| RO-08 | Operator | R03 pending時點 `撤回審核`，修改後重送 | 回到可編輯；重送後再鎖定 | 舊snapshot保留，新snapshot version/hash不同 | request歷史、兩版hash |
| RO-09 | Approver | R04 退回／needs-info；Operator補正 | 不顯示人工發布；回到安全可修正狀態 | 無formal records；decision/audit保留 | decision畫面、zero-formal diff |
| RO-10 | Approver | R01 核准完整bundle | 顯示auto finalizing，不出現第二個confirmation或 `正式發布` | 同交易正式化；approver與system actor皆可追 | approval、audit、outbox、狀態截圖 |
| RO-11 | Operator/QC | 核准完成後reload與清單定位 | 原案離開預設進行中；正式圖號／歷史可查；CTA `查看正式圖面` | 每個snapshot物件exactly once | 正式頁截圖、final DB diff |
| RO-12 | QC | 檢查R01版次效力 | 顯示 `研發版已核准`，不得寫成已發行 | physical `Pending` + immutable companion；effective `ReviewApproved`；非manufacturing current | package/companion/pointer query |
| RO-13 | Operator | R05 送審或核准時模擬double click／response遺失後reload重試 | loading／回復訊息清楚，最終同一結果 | 同key同payload回原receipt；無第二組master/package/event | request IDs、exact-count diff |
| RO-14 | Recovery/QC | R06 在formalization fault point核准，檢查失敗後重試 | 顯示「沒有留下部分正式資料」與 `查看處理狀態`／有權限重試 | decision與apply_failed保留；formal delta=0；原snapshot重試成功一次 | fault log、rollback diff、retry receipt |
| RO-15 | Approver/Operator | R08 舊number-only pending核准；R09補首版差異審核 | R08轉 `drawing_addendum_required`；R09顯示addendum下一步 | 舊核准不可直接發布未審圖面；新snapshot引用舊baseline | legacy request/hash chain |
| RO-16 | Operator/QC | 開R10、R11、R12 | 正式／歷史／recovery文案與CTA各自正確 | 不重建、不復活、不自動修復 | 三狀態截圖、zero-write diff |
| RO-17 | Viewer | company A session查R13 company B ID/code | 403/404且不揭露company B名稱、狀態、檔案 | company B所有row零變化 | response摘要、DB diff |
| RO-18 | Operator/QC | 三viewport、鍵盤、drawer scroll、錯誤復原 | 單一primary、無遮擋/水平overflow、focus可見且返回正確 | 重複互動不產生額外commands | 三viewport screenshots、focus紀錄 |
| RO-19 | QC | 全站visible-error與敏感資訊掃描 | 無uncaught error、undefined、NaN、raw state/API/storage path | response/audit不含credential、signed URL、secret | console/failed requests/error sweep |
| RO-20 | AI-QA；AI-QC後驗 | final reconciliation與專用fixture清理判斷 | UI結果與資料一致 | 只清理專用fixture且依核准方法；production不清理 | final hash、cleanup log或保留理由 |

### 15.7 AI Browser Happy Path 逐步腳本（R01）

1. AI在Context A以Operator登入Target A/B，透過真實瀏覽器直接開啟`/numbering/drawings?tab=reserved`；不得先用API取得下一步答案。
2. 找到 R01，記錄 workspace ID、候選 root/drawing/part codes及初始 row versions；開 drawer 不得產生 DB delta。
3. 首次畫面穩定後立即截圖；AI在不查DOM、不展開detail、不讀spec的5秒限制內輸出：「我在保留號／首版準備；尚未完成首版；下一步是完成首版圖面；目前尚不可正式使用。」保存原始回答與起訖時間，不得事後改寫。
4. 點 `完成首版圖面` 一次後立刻再點；按鈕需loading／disabled，candidate aggregate只建立一次，建議版次預設常見情境為 `0.1`。
5. 上傳有效 primary drawing檔、確認圖料關係；如測版次override，改成policy允許值並輸入具體reason。畫面不得把rowVersion當版次。
6. 尚未ready時確認不能送審；補齊後確認畫面只剩一個primary `送交審核`。
7. 點 `送交審核`，核對confirmation中的候選號、版次、檔案數、圖料關係。第一次按取消，驗證零request；第二次確認送出。
8. 送出後畫面變為 `in_review`／`查看審核`，candidate與file association不可編輯；記錄request ID、snapshot hash與row versions。
9. AI切換到隔離Context B，以不同Approver principal開啟同request，逐項比對snapshot內容後從UI核准；核准頁與保留號drawer皆不得出現第二次人工`正式發布`。
10. 觀察 `auto_finalizing` 後進 `official_controlled`。若狀態長時間不動，保存時間與network evidence，不以refresh連點製造新command。
11. 點 `查看正式圖面`；確認candidate code成為相同正式code、圖料關係與檔案一致，小數版呈現 `研發版已核准` 而非 `Released`。
12. 回到保留號預設進行中清單，R01應消失；由正式圖號及歷史／全部篩選查回同一business identity。
13. AI-QA輸出final DB唯讀比對；獨立AI-QC再重驗：formal roots/parts/drawings/relations與snapshot拓撲一致；reservations全為promoted；每張drawing恰有一個physical `Pending` package與一個immutable approval companion；success audit、receipt、outbox各符合預期且無duplicate。

### 15.8 異常與復原逐步腳本（R06，只限 Target A）

1. 用專用fault switch在每個Section 6邊界分次建立獨立sub-fixture；禁止手動直接竄改正式domain rows模擬。
2. Operator準備並送出完整bundle；Approver核准。
3. 故障發生後，AI-QA立即取得transaction log、decision、request state與DB diff，交由獨立AI-QC重驗。
4. request必須為 `apply_failed`／projection為 `recovery_required`；immutable decision存在，但formal root/part/drawing/link/promotion/package/companion/file link與success outbox對baseline全為零增量。
5. Context A的一般Operator只能看到處理狀態與責任角色；只有Context D的AI-QA Recovery可重試。
6. 移除fault後，AI-QA切到Context D，由原request重試原approved snapshot；不得編輯內容、重配號或新建request。
7. 重試成功後再連續送出相同retry三次；所有回應需指向同一結果，domain objects、receipt與event count不可增加。

### 15.9 UI／可用性實測矩陣

| State | 5秒內必須知道 | 唯一 primary | 必查例外 |
|---|---|---|---|
| empty | 沒有待處理資料／如何建立 | 依既有入口 | 可顯示Now What，不虛構資料 |
| drawing_preparation | 尚未完成首版、不可正式使用 | `完成首版圖面`／已建立後 `繼續完成首版` | 不顯示號碼獨立送審或發布 |
| bundle_ready | 內容已齊、送出後會鎖定 | `送交審核` | confirmation摘要完整 |
| in_review | 審核中、內容被鎖 | `查看審核` | 符合規則才有secondary撤回 |
| auto_finalizing | 已核准、系統處理中 | 無 | 不顯示disabled publish |
| official_controlled | 圖料號正式、研發版已核准但未Released | `查看正式圖面` | 不再建立首版 |
| apply_failed | 沒有部分正式資料、由誰處理 | 依權限為 `查看處理狀態`／重試 | 不新建snapshot或換號 |
| legacy addendum | 只需補圖面或差異審核 | `補齊首版圖面`／`送交差異審核` | 原number-only核准降到history/detail |
| history_only | 已取消／回收、不需處理 | `查看紀錄` | 無復活、占號、發布 |
| restricted | 無權限及應找誰 | 無mutation primary | 不能只灰掉而不說原因 |

每一重要狀態至少在1440x900保存；核心工作流程另驗1024x768與390x844。390x844必須由AI實際完成開drawer、建立／編輯、查看confirmation、取消、錯誤返回與關閉；不得只縮放截圖。AI以screenshot＋visible-text inventory執行紅筆刪除，逐一檢查頁首副標、summary小字、section heading與table第二行，不能支援當下判斷者記為UI defect。

### 15.10 FMEA 與優先級

| Failure mode | 影響 | Detect | 等級 | 必要控制／判定 |
|---|---|---|---|---|
| 誤連production執行mutation | 既有保留號或正式資料受影響 | target/DB/storage identity交叉核對 | P0 | 立即停測；不得靠事後清理合理化 |
| read/open產生lazy write | 未授權改變production-like facts | before/after hash、audit/outbox counter | P0 | 任一delta即fail |
| 候選首版被當正式圖面 | 未審內容進正式使用 | UI文字、formal table/pointer查詢 | P0 | 正式化前formal delta必須為0 |
| incomplete bundle可送審 | 審核範圍不完整 | negative submit | P0 | fail closed且具體指出缺項 |
| 舊number-only核准直接發布圖面 | 審核範圍被靜默擴大 | R08/R09 chain | P0 | 必須走addendum |
| 核准失敗留下部分master/package | 資料不一致、重試衝突 | fault injection + exact-count | P0 | savepoint rollback為零delta |
| double click／lost response建立duplicate | 重號、重版、重複event | receipt/unique/count | P0 | exactly once |
| 小數版成為Released/current | 未受控量產使用 | package/companion/pointer | P0 | physical Pending、effective ReviewApproved |
| cross-company洩漏 | 隔離與機密性破壞 | R13 403/404 + response scan | P0 | 不洩漏existence或metadata |
| staging接受local fake evidence | 發布證據失真 | env/evidence provider manifest | P0 | Target B fail closed |
| primary CTA多個或被遮擋 | 人員誤操作／流程變慢 | viewport/5秒/overflow | P1 | 任一核心狀態不通過即no-go |
| error只出現在console | 使用者無法復原 | visible-error sweep | P1 | 真正錯誤需有可見、可行動回饋 |
| 技術字串／敏感資訊外露 | 誤解或資安風險 | visible text/response scan | P1/P0 | credential/secret為P0，其餘技術噪音P1 |

### 15.11 證據包規格

每次run集中保存於：

```text
output/playwright/dev052-real-operation/<RUN_ID>/
  run-manifest.json
  permissions.json
  baseline.json
  final.json
  db-diff.json
  case-results.md
  ai-5-second-assessment.md
  visible-error-sweep.json
  console-and-failed-requests.json
  screenshots/
  receipts/
  qc-verdict.md
```

檔名使用 `<CASE>-<state>-<viewport>.png`，例如 `RO-02-drawing-preparation-1440x900.png`。JSON可保存ID、status、count、hash與去識別化response摘要；不得保存password、cookie、bearer token、signed URL、credential、raw production file path或未去識別個資。若工具無法匯出HAR，至少記錄failed request的method、route pattern、status、stable error code與時間，不保存authority header。

### 15.12 缺陷分級與停測規則

- `P0`：production／跨公司風險、資料損毀、部分正式化、未審內容正式化、duplicate、minor released、credential洩漏。立即停測、隔離Target A/B、保存證據並通知Dev PM/RD；不得繼續跑會擴大影響的案例。
- `P1`：核心流程不可完成、主要CTA錯誤、權限繞過、錯誤不可見、核心viewport不可操作。該wave停止，修正後從baseline重跑受影響wave與回歸。
- `P2`：不影響正確性但降低理解或效率的文字／排序／細節。建立defect並由Dev PM判斷是否阻擋release；QA不可自行忽略。
- `Blocked`：target、帳號、provider、fixture或fault switch不可用；記錄缺少的具體條件，不以推測判通過。
- `Not sufficiently validated`：缺DB diff、必要viewport、關鍵狀態截圖、test principal／browser context隔離或可見錯誤證據。等同未通過release gate，不可寫成PASS。

發現異常時先保存當下route、state、request ID、時間、截圖、console與DB delta；不refresh洗掉畫面、不直接修DB、不用另一帳號重做後覆蓋原證據。

### 15.13 Exit criteria 與簽核表

真實操作驗證只在下列全部成立時判 `PASS`：

- RO-00..20中適用案例全部通過，P0/P1為0；不適用項有書面理由與替代證據。
- R07-R12 read/open與production read-only comparison為零business-row、audit、receipt、outbox、sequence delta。
- happy path由AI透過兩個不同test principals與隔離browser contexts完成，且核准後無人工正式發布步驟。
- approval、formalization、package/companion、pointer、audit、receipt與outbox exact-count一致。
- legacy pending／approved分別走number-only continuation與drawing addendum，沒有blind auto-publish。
- 1440x900、1024x768、390x844必要截圖、5秒理解、keyboard/focus、overflow與visible-error evidence完整。
- `npm run qc:dev-052`、`npm run typecheck`、`npm run lint`、`npm run build`在同一commit/build通過；API／unit／structural automation只能補強，不能取代本章AI真實瀏覽器操作證據。
- QC在`qc-verdict.md`明確判定 `Pass / Fail / Not sufficiently validated / Blocked`，並列出target、RUN_ID、commit、已知限制與production deferred gates。

| Sign-off | AI task／principal識別 | 時間 | 結論 | Evidence path／defect IDs |
|---|---|---|---|---|
| AI-QA executor | isolated local AI runner | 2026-08-06 | PASS | `output/playwright/dev052-real-operation/DEV052-20260806-015522-local-isolated/` |
| Operator／Approver contexts | disposable Engineer／R&D Manager principals | 2026-08-06 | PASS | `permissions.json`、`case-results.md`、screenshots與receipts |
| 獨立AI-QC reviewer | `independent_qc_final` | 2026-08-06 | PASS；P0=0、P1=0、P2=0 | `.ai-doc/qc/qc-dev-052-number-lifecycle-simplification-2026-08-04.md` |
| Human release owner（僅C gate授權，不執行測試） | 未指定 | 2026-08-06 | 未授權 | production release gate維持關閉 |

文件治理結論：本章只把既有SPEC/ADR契約展開為AI真實瀏覽器驗證步驟，分類為`No contract drift`；不改狀態機、API、權限、release semantics、DEV狀態或production授權，故不新增ADR、DEV或第二份QA plan。

### 15.14 2026-08-06 final execution record

獨立AI-QC在RD freeze後重跑`npm run qc:dev-052`：schema 12/12、data protection 4/4、HTTP 10/10、UI 16/16、flow 8/8與AI real-operation 41/41均為0 fail；revision policy、number-state runtime、Supabase migration與TypeScript附帶gate亦通過。run manifest證明`productionConnected=false`、`productionWrites=false`、cleanup=`removed`。本結果只解除local QC gate，不授權staging、production、migration、flag activation、deploy或release。
