# SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001：效率優先的圖料整包生命週期

Status: `Phase 1A-1D Implemented / Local QC Passed / Production Release Gated`
Date: 2026-08-03
Readiness reviewed: 2026-08-04
Owner: Dev PM
Related DEV: `DEV-052` / `DEV-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001`
Related ADR: `.ai-doc/decisions/ADR-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-additive-adoption-and-auto-finalization.md`
Related QA: `.ai-doc/qa/qa-pdm-number-lifecycle-simplification-validation-plan-2026-08-03.md`

Current execution boundary: DEV-052 Phase 1A-1D 已在本機完成；V2 feature flag 仍預設 off，production mutation allowlist 未開放。本文與本機證據不授權 production migration、既有資料修復、部署、release 或 production smoke。

> 2026-08-04 後續 UI 決策：使用者已以 `DEV-053` 確認未來改採單一「圖號工作台」，不再保留「圖號總表／保留號」雙分頁。此決策分類為對 `HD-052-04` 的 `Intentional replacement + additive source-context extension`，目前成熟度為 `RD Implementation Ready / Human Confirmed / Awaiting Phase 1A Local Execution`；authoritative契約、ADR與QA見 `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`、`.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`、`.ai-doc/qa/qa-pdm-unified-drawing-workbench-validation-plan-2026-08-04.md`。DEV-053只允許在workspace additive保存指定existing drawing/part/link context，既有rows維持NULL且不backfill。在DEV-053完成產品實作與QA/QC前，本文件第9節仍描述現行DEV-052本機實作；DEV-052候選aggregate、legacy compatibility、single bundle review、atomic auto-finalization、權限、冪等與release gate不因UI提案而改變。

Related authority:

- `.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`
- `.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`
- `.ai-doc/specs/SPEC-PDM-REVISION-TIMING-UX-001-reservation-first-drawing-revision-entry.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-SUBMISSION-001-controlled-revision-package.md`
- `.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-PACKAGE-002-first-class-attachment-package-model.md`
- `.ai-doc/specs/SPEC-PDM-APPROVAL-PLATFORM-001-system-approval-platform.md`

---

## 1. Human Decision Brief

2026-08-03 使用者確認效率優先，並關閉以下決策：

- `HD-052-01`：正式環境既有保留號也直接進入新流程並從目前狀態往前推進，不永久留在第二套 legacy UI。
- `HD-052-02`：候選圖號可以建立、編輯不可正式使用的首版圖面草稿；正式承諾在整包送審 snapshot 固化。
- `HD-052-03`：核准後由系統以冪等、原子方式自動正式化；證據不足或寫入失敗不得留下部分正式資料。
- `HD-052-04`：保留既有「保留號」頁籤與 `/numbering/drawings?tab=reserved` 入口，不建立第二套新版頁面；頁籤仍稱 `保留號`，頁面工作區標題改為 `保留號／首版準備`，角色由號碼審核／人工發布頁改為候選首版準備工作區。

「既有保留號進入新流程」的資料安全解讀如下：

1. 對既有 workspace 做 read-time compatibility projection，不批次更新原 row。
2. 開啟列表、抽屜或查詢 API 不得產生任何寫入。
3. 只有使用者明確建立／儲存候選首版圖面時，才新增 candidate-stage 資料。
4. 不改號、不 backfill workflow version、不重播舊審核、不把舊 number-only 核准冒充為圖面核准。
5. 已發布、已取消、已回收與資料矛盾案件只做安全映射，不猜測、不自動再發布。

## 2. Outcome

人工流程由五段縮成三段：

```text
建立料件
  → 完成首版圖面並一次送審
  → 核准
      └─ 系統原子完成正式圖料號、候選號提升與受控首版紀錄
```

系統自動承接：

- 建立 workspace 時配置候選圖料號。
- 提供 policy-derived 建議首版（預設常見情境為 `0.1`）。
- 將圖料關係、首版、檔案證據與版次決策組成同一審核 snapshot。
- 核准後執行正式化，不再要求使用者按第二次「正式發布」。
- 失敗時保留核准與錯誤證據，讓具權限者冪等重試。

### 2.1 Current vs DEV-052 lifecycle comparison

| 比較項目 | 現在 production runtime | DEV-052 target |
|---|---|---|
| 人工作業 | 保留候選號 → 號碼送審 → 核准 → 人工正式發布 → 建立首版圖面 | 建立料件 → 完成首版圖面並一次送審 → 核准；系統自動正式化 |
| 審核範圍 | 候選圖料號為主，尚未包含首版內容 | 圖料號、圖料關係、首版版次與檔案證據為同一bundle snapshot |
| 首版建立時點 | 正式發布／drawing reservation promoted後 | 候選圖號階段即可建立與編輯，但不可正式使用 |
| 核准效果 | 核准只鎖定號碼，仍需人工發布 | 核准後自動建立正式圖料master、提升候選號與建立受控首版紀錄 |
| 人工確認次數 | 號碼送審、號碼核准、人工發布，之後另有圖面作業 | 一次bundle送審、一次核准；沒有第二次人工發布 |
| 失敗邊界 | 審核與發布為不同commands，可能停在已核准未發布 | savepoint內全有或全無；失敗保留decision/diagnostic但不留部分正式資料 |
| 小數版效力 | 不因號碼核准成為受控首版，且不得 `Released` | 核准後effective `ReviewApproved`，仍不得 `Released`或進manufacturing current |
| 既有保留號 | 繼續現行number-only review/manual publication | 零寫入compatibility projection進同一頁往前推；舊核准缺圖面時走addendum |

此表描述產品契約差異，不表示新流程已上線；直到 DEV-052 implementation、QA/QC與release gate完成前，正式環境仍使用左欄行為。

## 3. Non-Negotiable Invariants

1. 正式圖料號唯一性、候選號排他鎖與正式號不可重用規則不變。
2. `0.x`、`1.x` 等小數版不得成為 production-effective `Released`。
3. 首版小數版整包核准後的 effective 受控狀態為 `ReviewApproved`；實體 `drawing_revision_packages.status` 保持 `Pending`，由不可變核准伴隨表投影此狀態。這代表設計內容已核准，不代表量產發行。
4. 正式圖號 master 與受控小數版可以同時建立，但 manufacturing current pointer、交接與正式下載不得指向 `ReviewApproved` 小數版。
5. 審核決議、正式化、audit、command receipt 與 outbox 必須具有同一交易邊界；無法同交易的外部副作用只能由 transactional outbox 在 commit 後處理。
6. 任一前置證據缺失、snapshot stale、號碼衝突、檔案未 finalized 或 policy 不符時，整筆 fail closed。
7. 所有 company、actor、permission 與 idempotency scope 由 server session 推導，client body 不得指定權威值。
8. 既有資料的 read/open/bootstrap 行為必須是零寫入；production migration 只允許 additive DDL，不允許 data backfill。

## 4. User-Visible Lifecycle

| Stage | 使用者看見 | Primary action | 系統責任 |
|---|---|---|---|
| `drawing_preparation` | 已保留候選號，首版圖面尚未完成 | `完成首版圖面` | 建立或開啟 candidate revision draft；顯示建議版次 |
| `bundle_ready` | 圖料、首版與必要證據已齊 | `送交審核` | 產生單一 immutable bundle snapshot 並鎖定內容 |
| `in_review` | 審核中 | `查看審核`；符合規則者可撤回 | 保持候選號、candidate revision 與檔案證據鎖定 |
| `auto_finalizing` | 已核准，系統處理中 | 無一般使用者 CTA | 原子建立正式 master、提升候選號、建立 `ReviewApproved` 版次 |
| `official_controlled` | 圖料號已正式建立；研發版已核准 | 進入後續進版／正式發行 | 不將小數版標示為 `Released` |
| `recovery_required` | 正式化未完成 | Admin：`重試正式化` | 只重試同一 approved snapshot，不重配號、不重建版 |
| `history_only` | 已取消／已回收 | 檢視紀錄 | 不提供恢復或發布捷徑 |

一般正常狀態不重複堆疊「下一步」說明卡；頁面只保留一個主要 CTA。只有 blocked、error 或轉換中的狀態顯示 `Now What` 指引。

## 5. Existing Reservation Adoption

既有 rows 不新增 `workflow_version` 回填。新服務依現有 workspace、reservation、approval 與 publication facts 產生 compatibility projection：

| Existing fact | 新流程映射 | 允許的往前動作 | 禁止行為 |
|---|---|---|---|
| workspace `active`，reservation `active` | `drawing_preparation` | 明確建立／儲存 candidate first revision | 開啟頁面即建立 row；改號；重配號 |
| candidate revision 已由新流程建立且可編輯 | `drawing_preparation` 或 `bundle_ready` | 繼續編輯或送交整包審核 | 將草稿當正式圖面使用 |
| reservation `review_locked` 且為既有 number-only pending review | `in_review`，標記 `legacy_number_review` | 繼續既有審核；若核准，轉 `drawing_addendum_required`；若撤回／退回，進 `drawing_preparation` 後送新 bundle | 核准時自動正式化；靜默擴大舊 snapshot 範圍 |
| reservation `approved_locked` 且舊 snapshot 無圖面 | `drawing_addendum_required` | 補齊首版圖面與檔案，只送差異 addendum review；核准後自動正式化 | 直接重用 number-only approval 發布圖面內容 |
| workspace `published` 且 reservation `promoted` | `official_controlled` | 進入既有後續進版／發行流程 | 再建立 candidate revision 或再次發布 |
| workspace `cancelled` 或 reservation `recycled` | `history_only` | 唯讀 | 復活、重新占用相同候選號 |
| 狀態互相矛盾、approval 缺失、同號多個 active claim | `recovery_required` | PDM Admin 檢視診斷；依獨立修復 gate 處置 | 推測狀態、批次修復、自動發布 |

`drawing_addendum_required` 是既有資料的過渡節點，不是新建案件的正常額外步驟。差異審核必須引用原 number-only approval request、其 snapshot hash 與目前 candidate drawing snapshot，才能保留完整證據鏈。

## 6. Candidate First-Revision Authority

候選號本身仍不是 drawing revision authority。新流程新增一個與 workspace／drawing draft 綁定的 candidate revision aggregate，至少包含：

- stable candidate revision ID；
- `company_id`、`workspace_id`、`drawing_draft_id`、reservation reference；
- normalized revision、workflow intent、policy suggestion與 override reason；
- `draft / review_locked / promoted / cancelled` persisted lifecycle；退回／補件回到 `draft`，歷史決議留在 approval platform，不在 candidate row 複製第二套審核歷史；
- row version、created/updated actor與時間；
- approval request、snapshot hash、legacy baseline approval reference；
- finalized file evidence references。

固定 additive tables：

- `numbering_candidate_revision_drafts`
- `numbering_candidate_revision_files`
- `drawing_revision_package_review_approvals`

必要 constraints：

- company-scoped FK；
- 每個 workspace + drawing draft 最多一個非終結 candidate revision；
- 同一 candidate revision 的 primary file role 唯一；
- review lock 後不可直接編輯；退回／撤回需產生新 row version 與新 snapshot；
- 不 cascade delete 既有 workspace、reservation、approval、file asset 或正式 master。

RD 必須依 Section 16.3 的三表契約實作；不得把 revision 欄位直接加到 reservation row、不得以既有 formal package 取代 candidate aggregate，也不得在 Phase 1A 改寫舊 rows。

## 7. Bundle Review Contract

### 7.1 Snapshot content

單一 canonical snapshot 至少包含：

- workspace、root／drawing／part candidates 與關係；
- reservation IDs、candidate codes、sequence/rule versions；
- candidate revision、revision kind、policy suggestion、override reason；
- finalized file evidence：provider、bucket/object、generation、hash、finalized state、rule version；
- submitter、company、row versions與 snapshot schema version；
- legacy number-only approval reference（只在 addendum path 出現）；
- expected formalization plan，不包含 client-generated master IDs。

snapshot stale、file evidence generation/hash 改變或 candidate claim 不再有效時不得決議套用。

### 7.2 Approval action

新整包 action code 為 `numbering.candidate_bundle_review`。既有 `numbering.candidate_publication_review` 保留處理已存在的 number-only request，不靜默改寫其 snapshot schema 或 apply semantics。

整包 approve apply 必須在單一 domain transaction 內：

1. 鎖定 workspace、candidate revisions、reservations與 approval request。
2. 驗證 decision、snapshot hash、row versions、permission與 finalized evidence。
3. 以現有 reservation codes 建立或確認 formal root／part／drawing masters與 links。
4. 將 reservations 提升為 `promoted`，workspace 轉為 `published`。
5. 建立 formal `drawing_revision_packages(status='Pending')`、相同 immutable file links 與一筆 `drawing_revision_package_review_approvals`；新版 reader 由兩者投影 effective `ReviewApproved`。
6. 寫入 approval apply、formalization audit、command receipt與 outbox events。
7. commit 後才處理通知或其他外部副作用。

decision command 使用 outer transaction + `candidate_bundle_formalization` savepoint。immutable decision 先寫入；步驟 2-6 位於 savepoint。若正式化失敗，rollback 至 savepoint，保留 decision，將 request 記為 `apply_failed`／`recovery_required` 並提交失敗診斷；不得留下任何部分 master、promotion、package 或 file link。重試使用原 request、approved snapshot 與新的 retry command idempotency key；第一次成功後的重送由 command receipt 回傳同一結果。

### 7.3 Formalization and release semantics

- 技術相容事件可延續 `pdm.numbering.official_number_published.v1`，但新增 event version 或 payload 必須能辨識 `formalizationSource=bundle_approval`。
- 另由 transactional outbox 發出 candidate revision promoted／review-approved event，供受控歷史與後續工作台投影；不擴張 `number_candidate_events.event_type` 的既有 check constraint。
- `ReviewApproved` 不是 `Released`；`current released revision`、量產交接與製造使用指標不得更新。
- 後續要量產發行，仍須依 `DEV-050` 建立符合 major revision 規則的正式 release workflow。

## 8. API and Command Boundary

| Endpoint / command | Permission | Contract |
|---|---|---|
| `GET /api/numbering/draft-workspaces/[id]` | `numbering.workspace.view` | 回傳 read-only lifecycle projection、next action與 compatibility reason；不得 lazy write |
| `POST /api/numbering/draft-workspaces/[id]/candidate-revisions` | `numbering.draft.update` | 使用者明確建立 candidate first revision；idempotent |
| `PATCH /api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]` | `numbering.draft.update` | 只允許 unlocked draft，要求 expected row version |
| `POST /api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files` | `numbering.draft.update` | multipart upload；建立 `file_assets` 與 candidate file link；production submission 仍要求 finalized GCS evidence |
| `POST /api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/[fileId]/remove` | `numbering.draft.update` | soft-remove association；不得刪除 object、evidence 或歷史 snapshot |
| `POST /api/numbering/draft-workspaces/[id]/submit-bundle-review` | `numbering.candidate.review.submit` | freeze canonical bundle snapshot、建立 approval request並鎖定全 bundle |
| `POST /api/numbering/draft-workspaces/[id]/withdraw-bundle-review` | `numbering.candidate.review.withdraw` | 只撤回 pending bundle request；解除 bundle lock但保留歷史 snapshot |
| approval decision/apply | `numbering.candidate.review.decide` + approval rule | approver 決議；system actor 執行 auto-finalization，保存實際 approver attribution |
| Admin retry apply | `numbering.candidate.review.decide` and explicit recovery capability | 只重試同一 approved snapshot；不得改內容或重新配號 |

人類 approver 不需額外持有 `numbering.publish` 才能讓已設定的整包規則自動正式化；`numbering.publish` 保留給既有流程／受控恢復，不成為新流程第二個人工作業。

## 9. UI Contract

### 9.1 Page identity and navigation

- 保留現有 `/numbering/drawings?tab=reserved` route、清單／drawer pattern與 `保留號` 頁籤，不新增 `/numbering/.../v2`、新版保留號頁或永久 legacy UI。
- `保留號` 頁籤是使用者熟悉的導覽名稱；進入後的工作區 H1／主標題固定為 `保留號／首版準備`，用途短句只說明「完成候選首版並送審，核准後由系統正式化」。
- 預設清單只呈現仍需使用者往前推進的 active／review／recovery 案件；核准且正式化成功後，該案離開預設進行中清單，轉入正式圖號頁，並可由歷史／全部篩選查回。
- V2 flag off 或 production activation 尚未通過時，現有 route與 V1 runtime 行為不變；不得以重新導向或開啟頁面觸發 candidate row 建立。

### 9.2 Current vs DEV-052 UI comparison

在 DEV-052 release 前，「現在流程」仍是 production runtime；V2 啟用後採下表右欄：

| UI surface | 現在流程 | DEV-052 新流程 |
|---|---|---|
| `保留號` 頁面 | 保留號碼、號碼送審與人工正式發布作業 | 保留同一頁面，改為候選圖料號＋首版圖面準備工作區 |
| 頁面標題 | 既有圖號模組／保留號脈絡 | 頁籤 `保留號`；工作區標題 `保留號／首版準備` |
| 清單判斷資訊 | 候選號、號碼審核／發布狀態 | 候選號、首版準備度、整包審核與正式化狀態 |
| 打開 drawer | 狀態、保留內容、版次預告與分散後續動作 | 直接看候選版次、圖面檔案、圖料關係與目前唯一下一步 |
| 第一個 primary CTA | `送交發布審核` | `完成首版圖面` |
| 首版入口 | 正式發布前 disabled，發布後導向 `/numbering/revisions` | 候選階段直接在 drawer 內建立／編輯，不需 formal drawing ID |
| 首版完成後 | 仍須完成號碼審核與人工發布 | 唯一 primary CTA 變為 `送交審核` |
| 送審內容 | 主要是候選圖料號 | 圖料號、圖料關係、首版、版次決策與檔案證據整包送審 |
| 審核中 | `查看審核`／`撤回審核`，後續仍保留人工發布 | primary 為 `查看審核`；符合規則才顯示 secondary `撤回審核` |
| 核准後 | 顯示 `正式發布`，等待第二次人工操作 | 顯示系統正式化狀態，不再出現人工 `正式發布` |
| 成功結果 | 正式發布後再開始首版圖面工作 | 顯示 `圖料號已正式建立`＋`研發版已核准`，並提供 `查看正式圖面` |
| `Now What` | 正常狀態也可能與後續動作重複 | 正常狀態不顯示；只在 legacy、blocked、recovery、terminal／empty 等分流狀態顯示 |
| 正式化後清單位置 | 仍可能停在保留號操作脈絡 | 離開預設進行中保留號清單，進正式圖號；歷史仍可查 |

### 9.3 State-to-primary-action contract

| Visible state | 主畫面必要資訊 | 唯一 primary action | Secondary / exception action |
|---|---|---|---|
| 尚未建立首版 | 候選圖料號、建議版次、`尚不可正式使用` | `完成首版圖面` | `編輯保留號`、`取消保留號` 不得與 primary 競爭 |
| 首版編輯中 | 版次、檔案、關係、尚缺項目 | `繼續完成首版` | soft-remove file 等內容內動作 |
| bundle ready | 送審摘要與將被鎖定的範圍 | `送交審核` | 編輯為 secondary；submit 必須有 confirmation summary |
| in review | 審核進度與 locked scope | `查看審核` | 符合規則時 `撤回審核` |
| auto finalizing | `核准完成，系統正在建立正式資料` | 無人工 CTA | loading status；不得顯示 disabled publish |
| official controlled | `圖料號已正式建立`、`研發版已核准` | `查看正式圖面` | 歷史／audit降層 |
| apply failed | `正式化未完成，沒有留下部分正式資料` | 有權限者 `重試正式化`；一般使用者 `查看處理狀態` | 顯示責任角色與安全返回 |
| legacy addendum | `需補齊首版圖面`或`需完成首版圖面差異審核` | 依 projection 顯示 `補齊首版圖面`／`送交差異審核` | 原 number-only approval放 history/detail |
| history only | `已取消／已回收，不需再處理` | `查看紀錄` | 不提供復活或發布捷徑 |

`完成首版圖面` 是建立 candidate aggregate 的明確寫入動作，需 loading防重與錯誤回復；單純搜尋、切頁籤、篩選、開 drawer、查看建議版次與關閉 drawer皆為零寫入。

### 9.4 UX intent, information hierarchy and visible text

- 使用者：研發工程師、研發主管與 PDM Admin；主要任務是在熟悉的保留號清單內把候選圖料內容推進到可審核，不必理解兩套 workflow。
- 心智模型：`保留號` 是「尚未正式但正在準備」的工作；正式化後自然回到正式圖號，不把保留號頁當永久歷史主檔。
- 5 秒成功標準：能回答「我在保留號／首版準備、目前是否完成首版、下一步是哪個按鈕、此版能否正式使用」。
- 首屏只保留頁名、短用途句、狀態、風險與一個 primary CTA；snapshot hash、row version、raw lifecycle、API／DEV代號進 detail/audit，不得出現在主畫面。
- `NowWhatPanel` 只保留在 empty、legacy、blocked、recovery、restricted、terminal等需要分流／免處理判斷的狀態；正常 preparation／ready／review／success使用狀態標題＋CTA即可。
- `送交審核` 是會鎖定內容的高風險動作，confirmation 必須摘要候選號、首版版次、檔案數與圖料關係；自動正式化不再要求第二次 confirmation。

### 9.5 Responsive and accessibility gates

- 1280x720、1440x900、1024x768、390x844 viewport 不得有 CTA 被 footer、drawer、鍵盤或水平捲軸遮蔽。
- desktop 保持清單＋drawer上下文；mobile 可使用 full-height drawer，但不可要求左右滑動完成首版或送審。
- keyboard focus、disabled reason、loading/error live region、drawer focus trap與 close focus recovery 必須可用。
- 5 秒掃描應只看到一個 primary next action；技術 metadata 收進次要區域，可見文字通過紅筆刪除與內部詞掃描。

## 10. Failure and Recovery

| Failure | Required behavior |
|---|---|
| snapshot stale | 拒絕 submit/apply，指出哪一類內容已變更；不建立部分正式資料 |
| file evidence missing/unfinalized | fail closed；production 不允許以本機假證據放行 |
| candidate number conflict | 整筆 rollback；保留原 claim 與診斷，不自動換號 |
| process crash before commit | 無正式化結果；相同 idempotency key 可安全重試 |
| process crash after commit before response | 重試回傳原 receipt；不產生第二組 master/package/event |
| outbox delivery failed | domain commit 保留；outbox 重送，不回滾已完成正式化 |
| legacy facts inconsistent | `recovery_required`；唯讀診斷，另立 data-repair gate |

## 11. Phased Delivery Contract

| Phase | Scope | Exit evidence |
|---|---|---|
| 1A | compatibility projection、additive candidate schema、zero-write read path、feature flag | migration parity、old-data snapshot invariants、repository/service tests |
| 1B | candidate first-revision workbench、file evidence binding、single primary CTA | focused UI/API tests、desktop/mobile browser evidence |
| 1C | bundle snapshot、approval action、atomic auto-finalization、idempotent recovery | transaction failure injection、duplicate retry、permission/audit/outbox tests |
| 1D | legacy pending/approved continuation、regression與 QC | production-like snapshot rehearsal、DEV-048/050/051 regression、QC report |
| Release gate | staging GCS authority、migration rehearsal、rollback/read compatibility、production target confirmation | separate deployment-release approval and signed evidence |

Phase 1A-1D 均尚未執行。DEV-052 已完成 implementation readiness；下一步只能明確派工 `DEV-052 Phase 1A`。Phase 1B-1D 必須依序以前一 phase 的 exit evidence 為 entry gate，不能把 production activation 混入本機 phase。

## 12. Acceptance Criteria

1. 新建案件的人工作業只剩建立料件、完成首版並送審、核准三步；核准後沒有第二個人工發布 CTA。
2. 既有 `active` 保留號在新 UI 直接顯示 `完成首版圖面`，開啟頁面時 database write count 為零。
3. 既有 `review_locked`／`approved_locked` number-only request 不會直接發布圖面；依映射完成原審核或差異審核後才能正式化。
4. 核准成功一次建立完整 formal masters、links、promoted reservations、physical `Pending` revision package與 immutable review-approval companion；新版 effective status 為 `ReviewApproved`。
5. 任一步驟注入失敗後，上述正式資料不是全有就是全無。
6. 同一 request／idempotency key 重送至少三次只產生一組 formal records、audit fact與 outbox event。
7. 小數版不會更新 `Released` current pointer，不會出現在量產有效下載／交接清單。
8. migration、app bootstrap、GET list/detail、drawer open 前後，既有 workspace/reservation/approval/formal master rows 的 count、主鍵、狀態、號碼與 snapshot hash 零變更。
9. 跨公司、無權限、client spoof actor/company/state、stale row version 全部 fail closed。
10. desktop/mobile visible-state、keyboard、overflow、loading/error與 recovery UI 通過 QA。
11. `/numbering/drawings?tab=reserved` 與 `保留號` 頁籤保留；V2 工作區標題為 `保留號／首版準備`，不得另建新版或 legacy 平行頁。
12. 正常 preparation／ready／review／success 狀態只有一個 primary CTA且不顯示重複 `Now What`；例外狀態先回答下一步，再顯示原因與 detail。
13. 正式化成功後案件離開預設進行中保留號清單，可由正式圖號頁與歷史／全部篩選找到；此切換不得刪除或改寫既有歷史資料。

## 13. Deferred Scope Audit

- production data repair、歷史 state normalization、workflow-version backfill；
- `ConditionalUse`、`TrialApproved` 或任何小數版量產例外；
- CAD 解析、SolidWorks Add-in、BOM／技轉包擴充；
- production GCS file authority 的實作與 migration；
- merge、PR、deploy、release、production smoke；
- 改號、正式號重編或回收已正式使用號碼。

## 14. Spec Governance Result

Classification: `Intentional replacement`。

- 對 DEV-052 新整包流程，取代 DEV-048「approval 永不自動 publication」；新規則是指定 action 的 approval apply 在同一交易內自動正式化。
- 取代 DEV-051「publication/promotion 前不可建立首版圖面」；候選階段可建立獨立 candidate revision draft，但仍不可正式使用。
- DEV-050「小數版不得 `Released`」完整保留並加強；整包核准結果為 `ReviewApproved`。
- 既有 DEV-048 number-only approval request 不改 snapshot 或 apply semantics；透過 compatibility projection 接續新流程。

直到 DEV-052 完成本機實作、QA/QC、staging migration rehearsal與獨立 release gate 前，正式環境 runtime 仍以 DEV-048／050／051 已發布行為為準。

## 15. Stop Conditions

遇到以下任一情況，RD 必須停止並回報 Dev PM：

- 需要 update/backfill/delete 任何既有 reservation/workspace/approval/master row；
- 無法以 additive migration 完成，或舊版 app 無法安全讀取新 schema/state；
- 正式化無法與 approval apply 保持原子與冪等；
- production file evidence authority 未就緒卻要求放行 drawing publication；
- 需要放寬 minor revision release gate；
- 需要 live credential、production target、data repair、merge、PR、deploy 或 release。

## 16. Implementation Architecture Contract

### 16.1 Backward-compatible read model

既有 `NumberingDraftWorkspaceRecord.projection` 保留不動；detail response additive 增加：

```ts
type NumberLifecycleProjectionV2 = {
  stage:
    | "drawing_preparation"
    | "bundle_ready"
    | "in_review"
    | "auto_finalizing"
    | "official_controlled"
    | "drawing_addendum_required"
    | "recovery_required"
    | "history_only";
  reasonCode:
    | "new_or_legacy_active"
    | "bundle_complete"
    | "bundle_review_pending"
    | "legacy_number_review"
    | "legacy_number_approved_without_drawing"
    | "bundle_apply_failed"
    | "published"
    | "terminal"
    | "inconsistent";
  primaryAction:
    | "complete_first_drawing"
    | "submit_bundle_review"
    | "view_review"
    | "retry_formalization"
    | "continue_formal_revision"
    | "view_history"
    | "none";
  exceptionKind: "none" | "legacy" | "blocked" | "recovery";
};
```

`GET` 在 V2 flag off 時回傳 `lifecycleV2: null`，不得寫入；flag on 時只以現有 facts + additive candidate rows 計算。既有 JSON fields 不刪除、不改名、不改 enum，因此舊 client 可忽略新欄位。

### 16.2 Feature and production-slice gates

- 在 `src/lib/number-state-flow-feature.ts` 新增 `PDM_NUMBER_LIFECYCLE_V2`；未設定時必須為 off，不能沿用 V1 的 default-on 行為。
- `/api/numbering/state-flow/status` 保留現有 top-level V1 response，additive 增加 `lifecycleV2: { enabled, flag, phase }`。
- 每一個 V2 mutation route 都必須 server-side 檢查 flag；不能只靠前端隱藏。
- Phase 1A-1D 不修改 `src/lib/production-slice.ts` 的 mutation allowlist。只要 `PDM_PRODUCTION_SLICE_MODE` 已配置，V2 writes 仍 fail closed；release gate 才能另案加入 production allowlist。
- 關閉 V2 只停止新 writes／隱藏新操作，不刪除已建立的 candidate、approval 或 formalization facts。

### 16.3 Additive database contract

`db/postgres/021_number_lifecycle_simplification.sql` 與 `db/schema.sql` 必須新增下列結構；不得 alter 既有 business table、不得 widen `drawing_revision_packages.status`、不得 backfill：

1. `numbering_candidate_revision_drafts`
   - IDs/FKs：`id` PK、`company_id`、`workspace_id`、`drawing_draft_id UNIQUE`、`candidate_reservation_id UNIQUE`；全部 `ON DELETE RESTRICT`。
   - authority：`revision`、`workflow_intent='rd_workspace'`、`policy_snapshot_json`、`override_reason`。
   - state：`lifecycle_status IN ('draft','review_locked','promoted','cancelled')`、`row_version >= 1`。
   - review/formal references：`approval_request_id`、`review_snapshot_hash`、`legacy_baseline_request_id`、`legacy_baseline_snapshot_hash`、`formal_drawing_number_id`、`formal_revision_package_id`。
   - audit：`created_by/at`、`updated_by/at`、`promoted_at`、`cancelled_at/by`。
   - checks：`review_locked` 必須有 request/hash 且無 formal IDs；`promoted` 必須同時有 request/hash、formal IDs 與 `promoted_at`；`draft/cancelled` 不得有 formal IDs。

2. `numbering_candidate_revision_files`
   - `id` PK、`company_id`、`candidate_revision_id`、`source_file_asset_id`、nullable `publication_evidence_id`，全部 `ON DELETE RESTRICT`。
   - metadata 對齊 formal package：`role`、`role_source`、`display_name`、`description`、`sort_order`、`is_primary`。
   - soft removal：`removed_at`、`removed_by`；API 不 hard delete object、asset、evidence 或 link row。
   - unique `(candidate_revision_id, source_file_asset_id)`；active primary role 使用 partial unique index。

3. `drawing_revision_package_review_approvals`
   - `package_id` PK FK、`company_id`、`candidate_revision_id UNIQUE`、`approval_request_id UNIQUE`、`snapshot_hash`、`approved_by`、`approved_at`、`created_at`。
   - update/delete 由 SQLite/PostgreSQL trigger 拒絕；RLS force-on 且撤銷 direct `anon/authenticated` access。
   - physical package 一律 `status='Pending'`；存在 matching immutable companion 才投影 effective `ReviewApproved`。

4. Approval registry
   - 新增 `numbering.candidate_bundle_review`、handler key `numbering.candidate-bundle`、high risk、requires impact snapshot。
   - migration 只可 `INSERT ... ON CONFLICT DO NOTHING` 此新 control-plane code；不更新既有 action rows。
   - 重用既有 `numbering.draft.update` 與 `numbering.candidate.review.*` permissions，不新增或改寫 production role grants。

PostgreSQL tables 必須 force RLS/revoke direct Data API access；SQLite 必須建立等價 constraints/indexes/immutability triggers。Supabase mirror 固定為 `supabase/migrations/20260804010000_number_lifecycle_simplification.sql`，並登錄 `scripts/sync-supabase-runtime-migrations.mjs`。`src/lib/db.ts` 不做 table rebuild；既有 SQLite 由每次 init 執行 additive `CREATE ... IF NOT EXISTS` 套用新結構。

### 16.4 Effective `ReviewApproved` reader rule

新版 revision reader 只能依以下 join 產生 effective status：

```text
drawing_revision_packages.status = 'Pending'
AND immutable companion.package_id = drawing_revision_packages.id
AND companion.snapshot_hash = candidate review snapshot hash
=> effectiveStatus = 'ReviewApproved'
```

任何 companion 缺失／hash 不符都維持 `Pending` 或進 `recovery_required`，不能推測為核准。Released-only query、manufacturing current pointer、handoff/export/download gate 仍只接受 physical `Released`。

## 17. File-by-File Delivery Plan

### Phase 1A — schema, projection, zero-write compatibility

| File | Change contract |
|---|---|
| `db/schema.sql` | 新增三個 additive tables、indexes、SQLite immutable triggers與新 action seed；不改既有 row/status constraint |
| `db/postgres/021_number_lifecycle_simplification.sql` | 同等 PostgreSQL DDL、RLS/revoke、immutable function/triggers與 control-plane insert |
| `supabase/migrations/20260804010000_number_lifecycle_simplification.sql` | 由 runtime migration mirror 產生且 hash parity |
| `scripts/sync-supabase-runtime-migrations.mjs` | 登錄 021 → 20260804010000 mirror |
| `src/lib/number-state-flow-feature.ts` | 新增 default-off V2 flag/status，不改 V1 default |
| `src/app/api/numbering/state-flow/status/route.ts` | additive 回傳 `lifecycleV2` status |
| `src/lib/number-lifecycle-simplification.ts` | 新增純函式 projection/types/readiness evaluator；不得寫 DB |
| `src/lib/repositories/number-state-flow-async-repository.ts` | detail read additive 查詢 candidate aggregate/companion並輸出 `lifecycleV2`；list/detail 不 lazy create |
| `scripts/qc-dev-052-number-lifecycle-schema.mjs` | schema parity、constraints、RLS、default-off flag、zero business-row DML 靜態 gate |
| `scripts/qc-dev-052-number-lifecycle-data-protection.mjs` | F2-F7 read/open/bootstrap before/after row-count/hash/change-counter gate |
| `package.json` | 登錄 `qc:dev-052-phase1a` 與 focused scripts |

Phase 1A 明確不修改 `src/lib/production-slice.ts`、不新增 mutation route、不呈現新 CTA、不連 production。

### Phase 1B — candidate revision and one-action UI

| File | Change contract |
|---|---|
| `src/lib/repositories/number-lifecycle-simplification-async-repository.ts` | 新增 candidate create/update/file-link/soft-remove methods；company scope、row version、lock state與 idempotency fail closed |
| `src/lib/number-lifecycle-simplification.ts` | 新增 `create/update/addFile/removeFile` commands，透過 `executePdmCommandWithOutbox` 寫 DB |
| `src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/route.ts` | POST create |
| `src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/route.ts` | PATCH edit |
| `src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts` | multipart POST upload/link |
| `src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/[fileId]/remove/route.ts` | POST soft-remove |
| `src/components/numbering-candidate-revision-editor.tsx` | drawer 內首版 editor；重用 `FileDropzone`，不導向需要 formal drawing ID 的 `/numbering/revisions` |
| `src/components/number-state-workspace.tsx` | 保留 `保留號` tab與 route；V2 H1改 `保留號／首版準備`、預設列出需推進案件、嵌入 candidate editor、normal state單一CTA；只在 empty/legacy/blocked/recovery/terminal顯示 `NowWhatPanel`；V1 flag-off fallback不變 |
| `src/app/numbering/drawings/page.tsx` | no-change route guard：仍由 `tab=reserved` 掛載同一 workbench，不新增 V2 route/page；focused test需鎖定此入口 |
| `src/app/globals.css` | drawer/editor responsive、focus、overflow與 disabled reason styles |
| `scripts/qc-dev-052-number-lifecycle-http.mjs` | candidate API、permission、company scope、stale row、duplicate key |
| `scripts/qc-dev-052-number-lifecycle-ui.mjs` | route/tab/H1、default active list、post-formalization destination、single CTA、Now What exception-only、visible text、keyboard與responsive structural gate |

上傳可重用 `src/lib/file-storage.ts` 的 provider adapter。外部 object 先 finalized，再在 DB transaction 建 `file_assets`/link；DB 失敗時做 best-effort object cleanup並留下 correlation/audit，orphan object 永遠不能成為 submit evidence。production direct GCS authority 仍屬 release gate。

### Phase 1C — bundle review and atomic formalization

| File | Change contract |
|---|---|
| `src/lib/repositories/number-lifecycle-simplification-async-repository.ts` | canonical snapshot、bundle lock/withdraw、decision savepoint、formal package/companion/file links、retry recovery |
| `src/lib/number-lifecycle-simplification.ts` | 新增 submit/withdraw/decide/retry commands與 outbox payload；重用 platform command transaction |
| `src/lib/repositories/number-state-flow-async-repository.ts` | 只抽取／重用現有 deterministic formal-master promotion path；不得改舊 action semantics |
| `src/lib/drawing-revision-package.ts` | 新增 effective status type/helper；physical status union 不加入 `ReviewApproved` |
| `src/lib/repositories/drawing-revision-package-async-repository.ts` | additive left join companion供新版 reader；released/current query仍只看 physical `Released` |
| `src/app/api/numbering/draft-workspaces/[id]/submit-bundle-review/route.ts` | POST freeze/submit |
| `src/app/api/numbering/draft-workspaces/[id]/withdraw-bundle-review/route.ts` | POST withdraw |
| `src/app/api/approvals/requests/[requestId]/decisions/route.ts` | special-case新 action到 bundle decide service |
| `src/app/api/approvals/requests/[requestId]/apply/route.ts` | special-case `apply_failed` retry；不走 generic two-step handler |
| `scripts/qc-dev-052-number-lifecycle-flow.mjs` | snapshot、savepoint failure injection、triple retry、package/companion、audit/receipt/outbox |
| `scripts/qc-dev-052-number-lifecycle-http.mjs` | submit/withdraw/decision/retry HTTP contract |

### Phase 1D — legacy continuation and regression

- 在同一 projection/service 中完成 `legacy_number_review` 與 `drawing_addendum_required`；不另建永久 legacy UI。
- addendum snapshot 必須帶 `legacyBaselineRequestId`、`legacyBaselineSnapshotHash` 與 current drawing delta；同一 submit endpoint依 server projection選擇 full bundle 或 addendum mode。
- 新增 F2-F7 production-like sanitized snapshot rehearsal，並重跑 DEV-048/050/051、approval platform、production slice、migration mirror與 drawing package regression。
- 產出 RD/QA/QC evidence 後才可請求 release gate；不得在 Phase 1D 直接改 production flag/allowlist。

## 18. Command, Transaction and Idempotency Contract

所有 mutation 要求 `Idempotency-Key`，由 `requireNumberingPlatformCommandAsync` 取得 server principal/company/permission metadata，並交給 `executePdmCommandWithOutbox`。command names 固定為：

- `pdm.numbering.create_candidate_revision`
- `pdm.numbering.update_candidate_revision`
- `pdm.numbering.add_candidate_revision_file`
- `pdm.numbering.remove_candidate_revision_file`
- `pdm.numbering.submit_candidate_bundle_review`
- `pdm.numbering.withdraw_candidate_bundle_review`
- `pdm.numbering.decide_candidate_bundle_review`
- `pdm.numbering.retry_candidate_bundle_apply`

同一 command + company + target + idempotency key + equivalent payload 回傳原 receipt；相同 key 不同 payload 回 `409 idempotency_payload_mismatch`。ID 由 server 產生；formal master IDs 延續 reservation-derived deterministic IDs，formal package ID 固定由 candidate revision ID 派生，companion unique constraints形成第二層防重。

approve path 順序固定：

1. outer transaction 鎖 request/workspace/reservations/candidate revisions，驗證 permission、decision與 snapshot。
2. insert immutable decision，建立 `candidate_bundle_formalization` savepoint。
3. 驗證 number facts hash、revision policy snapshot、active file links、GCS generation/hash與 legacy baseline。
4. 以 existing deterministic publication helper 建/確認 masters、relations、promotion與 workspace published。
5. 對每個 drawing 建 physical `Pending` package、file links與 immutable review-approval companion，再將 candidate revision 設 `promoted`。
6. 更新 request `approved/applied`，寫 approver + system actor audit、receipt與 outbox後 commit。
7. 任一步驟 3-6 失敗即 rollback savepoint，request 轉 `apply_failed`；正式資料 count 必須回到基線。

preflight 若發現同 company/drawing/revision 已有非終結且非本 candidate 所有的 package，回 `formal_revision_conflict`，不能覆蓋、合併或自動升版。

## 19. API Payload and Error Contract

| Request | Required client fields | Server-derived / ignored authority |
|---|---|---|
| create candidate revision | `drawingDraftId`, `expectedWorkspaceRowVersion` | company/actor/default suggestion/policy version/ID |
| update candidate revision | `revision`, `expectedRowVersion`; override時 `overrideReason` required | lifecycle/approval/formal IDs |
| add file | multipart `file`, `role`, `isPrimary`, `expectedRowVersion`; optional display metadata | storage pointer/hash/generation/uploader/company |
| soft-remove file | `expectedRowVersion`, optional reason | removedBy/company |
| submit bundle | `expectedWorkspaceRowVersion`, optional human reason | snapshot/hash/action/targets/submitter/company |
| withdraw bundle | `expectedWorkspaceRowVersion`, `reason` | request/action/company/actor |

成功 response 一律回傳更新後 `workspace`、`candidateRevisions`、`lifecycleV2` 與 command `receipt`；不得回傳 credential、signed URL、raw local path 或 storage secret。

| HTTP | Stable code examples | Meaning |
|---|---|---|
| 400 | `candidate_revision_invalid`, `override_reason_required`, `candidate_file_required` | request shape/normalization invalid |
| 403 | `numbering_permission_required` | authenticated但無 action permission |
| 404 | `workspace_not_found`, `candidate_revision_not_found`, `approval_request_not_found` | company-scoped not found；不洩漏跨公司 existence |
| 409 | `workspace_version_stale`, `candidate_revision_version_stale`, `candidate_revision_locked`, `bundle_not_ready`, `approval_snapshot_stale`, `formal_revision_conflict`, `idempotency_payload_mismatch` | state/concurrency conflict，零部分寫入 |
| 503 | `number_lifecycle_v2_not_enabled`, `publication_evidence_not_ready`, `direct_gcs_verifier_unavailable` | feature/provider gate fail closed |

## 20. RD Implementation Readiness Result

- [x] Human decisions and intentional spec replacements are closed.
- [x] Exact schema strategy avoids existing-table rebuild, business-row DML and enum widening.
- [x] Existing production reservations have a zero-write read projection and explicit legacy addendum path.
- [x] API, permission, state, snapshot, transaction, idempotency and recovery contracts are specified.
- [x] Phase-by-phase exact file impacts and focused tests are specified.
- [x] `ReviewApproved` cannot be confused with physical `Released` by old readers.
- [x] Production slice, GCS authority, migration/deploy/release and live-data work remain separately gated.
- [x] Product code/schema implemented for the local Phase 1A-1D slice.
- [x] Phase 1A-1D focused QA/QC evidence produced.

Implementation verdict: `Local implementation complete / production gated`。保留號頁、候選首版、整包送審、核准自動正式化、失敗重試、legacy addendum與 effective `ReviewApproved` 均已落地；feature flag、production GCS authority、live migration與 release 仍需獨立 gate，不得把本文件當成 production change authorization。

## 21. Local Implementation Evidence (2026-08-04)

- SQLite/PostgreSQL/Supabase 以 additive migration 新增 candidate revision、candidate file與 immutable review-approval companion；既有 business tables 無 rebuild/backfill，physical package status enum 未擴張。
- F2-F7 list/detail/bootstrap 的 isolated data-protection fixture 驗證 change counter、existing row hash、audit、receipt、outbox與 sequence 零增量；V2 off 時不查新表。
- 八個 V2 command 均使用 server-derived actor/company、explicit permission、optimistic version與 opt-in payload-aware idempotency；舊 command receipt 語意維持相容。
- bundle submit 固化 canonical snapshot；approval decision後以 outer transaction + formalization savepoint建立正式 master、file links、physical `Pending` package及 immutable companion。故障注入時正式資料零部分寫入，decision與 `apply_failed` 診斷保留，retry只套用原 approved snapshot。
- `/numbering/drawings?tab=reserved` 與 `保留號` tab 保留；V2 H1為 `保留號／首版準備`，正常狀態只有一個 primary action。真實瀏覽器驗證 desktop/mobile 無水平溢位且 console errors/warnings為0。
- 證據與已知基線偏差記錄於 `.ai-doc/qc/qc-dev-052-number-lifecycle-simplification-2026-08-04.md`。
