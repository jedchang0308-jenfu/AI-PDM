# SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001：圖號單一資料層與生命週期

Status: `Local RD Implemented / QA-QC Passed / Human Directed / Production Migration & Release Gated`
Date: 2026-08-11
Owner: Dev PM
Related DEV: `DEV-064`; `DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001` / `DEV-067`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-AGGREGATE-001-canonical-drawing-and-revision.md`
Related QA: `.ai-doc/qa/qa-dev-064-unified-drawing-aggregate-validation-plan-2026-08-11.md`; `.ai-doc/qa/qa-dev-067-unified-pdm-entity-detail-validation-plan-2026-08-12.md`
Supersedes in conflict:

- `.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`
- `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001-single-page-lifecycle-workbench.md`
- `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`

## 0. DEV-067 visible-detail amendment（2026-08-12）

Status: `RD Implementation Ready / Human Confirmed / RD not started / Local implementation eligible / Release gated`.

DEV-064 已建立單一 canonical Drawing／Revision／File identity，但目前 visible detail 仍只有 shell-level convergence：candidate、formal、reviewer及legacy fallback可由不同 section/preview adapters組出不同操作體驗。使用者先確認所有 Drawing 狀態須共用同一六區明細，最新決策再把最上層提升為`UnifiedPdmEntityDetailDrawer`；該六區行為成為同一`DrawingProjection`內部契約，並與`PartProjection`、`RelationProjection`、`ReviewContextProjection`依固定相對順序組合。

本 amendment 不改 canonical data authority。所有狀態與surface仍讀同一 Drawing aggregate；workspace/formal/approval資料只能hydrate同一`DrawingProjectionModel`的lifecycle adapter，不得成為第二個visible identity或另一個drawer body。狀態轉移後必須refresh同一stable Drawing ID/row key與同一drawer instance。Preview必須由單一derivative state resolver提供queued/running/ready/delayed/failed/unavailable/missing，禁止candidate以「檔案存在」直接宣告ready。Part一般surface的Drawing summary不得回傳圖面檔案/版次；assigned active review的Drawing full則只能在exact request/company scope內由server授權。

Spec Impact Preflight：`Intentional replacement`。取代本文件第5節僅要求共用`DrawingWorkspaceDrawer` frame即可完成的寬鬆解讀，也取代`UnifiedDrawingDetailDrawer`作為最上層終局元件的前版描述；完整驗收改以`SPEC-PDM-ENTITY-DETAIL-DRAWER-001`的DEV-067 amendment與`ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001`為準。產品實作、schema/migration、production data與release均未由本文件更新授權。

RD readiness update：`DrawingProjectionFull`固定由canonical Drawing/Revision/File row versions與derivative state產生；preview state union為`queued/running/ready/delayed/failed/unavailable/missing`。Candidate、formal、relation、review共用同一resolver與2.5秒single-flight detail refresh；檔案存在不得等同ready，review media仍走owner authority加request-scope驗證。Drawing owner aggregate hard budget`<=16`，1/20/50 linked items不得N+1。

## 1. Product decision

同一個圖號從建立、首版準備、送審、研發受控、發布、作廢到歷史，只能是一個 `Drawing` 業務物件。
狀態改變不得再建立第二個圖號 identity，也不得把候選版次檔案複製成另一套正式權威。

使用者點任何狀態的圖號時，皆進入同一個「圖號明細」入口與共用 drawer frame；畫面內容、CTA 與唯讀／可編輯能力由 `lifecycle state + actor permission` 決定。

## 2. Canonical aggregate

### 2.1 Drawing

`drawings` 是圖號身份與整體生命週期唯一權威：

- `id` 從 draft drawing 建立起保持不變；核准、正式化與發布不得換 ID。
- `drawing_number` 在號碼取得前可為 `NULL`，取得後於同公司內唯一且不得改號。
- `workspace_id` 只指向批次／整包流程容器，不是第二個圖面 identity。
- `drawing_draft_id`、`candidate_reservation_id`、`formal_drawing_number_id` 是相容投影指標，不是平行 authority。
- `lifecycle_state` 使用單一狀態機：`building`、`drawing_preparation`、`bundle_ready`、`in_review`、`auto_finalizing`、`recovery_required`、`rd_controlled`、`released`、`obsolete`、`merged`、`cancelled`。
- `drawing_number` 可由未取號的 `NULL` 首次賦值；一旦賦值即不可在同一 Drawing 上改號，需以另建／合併等受控流程處理。

### 2.2 DrawingRevision

`drawing_revisions` 是首版與後續版次唯一權威：

- 候選首版與核准後版次是同一列；核准只轉移狀態並補上 compatibility pointer。
- `lifecycle_state`：`preparing`、`in_review`、`correction_required`、`rd_controlled`、`released`、`superseded`、`cancelled`。
- 同一 Drawing 可有多個 revision；任何時點最多一個可編輯／送審中的 active revision。
- `source_candidate_revision_id` 與 `source_revision_package_id` 只連接舊 reader／writer。

### 2.3 DrawingRevisionFile

`drawing_revision_files` 是版次與檔案資產的唯一關係：

- 首版準備到發布沿用同一 `source_file_asset_id`；狀態轉移不得 copy bytes 或建立第二個 canonical file identity。
- `numbering_candidate_revision_files` 與 `drawing_revision_package_files` 在過渡期是相容投影。
- `rd_controlled`／`released` 版次禁止直接新增、替換、移除或改寫受控檔；變更必須建立新 revision。

## 3. State and capability policy

UI 只呈現 capability，不是安全邊界。所有 mutation 必須由 server/domain policy 再驗證：

| State | Typical capability | Server rule |
|---|---|---|
| `building` | 補資料、取得號碼 | owner + workspace update |
| `drawing_preparation` | 建立首版、上傳本版檔 | owner + draft update |
| `bundle_ready` | 送交審核 | 完整性 + submit permission |
| `in_review` | 查看進度；reviewer 決策 | exact reviewer + decision permission |
| `recovery_required` | 查看或重試 | publish/recovery permission |
| `rd_controlled` | 查看、建立新版 | 不得直接改受控 revision |
| `released` | 查看、建立新版 | 不得直接改已發布 revision |
| terminal | 唯讀追溯 | 禁止從原物件繼續 mutation |

任何只隱藏前端按鈕、但 API 可直接改受控資料的實作皆不合格。

## 4. Write contract

1. 建立 draft drawing 時立即建立 canonical `Drawing`，即使尚未取得圖號。
2. 取得圖號時更新同一 Drawing 的 `drawing_number` 與 reservation pointer。
3. 建立首版時在 `drawing_revisions` 建立 canonical revision；上傳檔案寫入 `drawing_revision_files`。
4. 送審／撤回／退回只改同一 revision 的狀態與 review pointer。
5. 核准時在原交易內：
   - 驗證 snapshot、檔案 evidence 與 reservation lock；
   - 將同一 Drawing／DrawingRevision 轉為 `rd_controlled`；
   - 建立或更新 legacy `drawing_numbers`／`drawing_revision_packages` projection；
   - legacy file rows只指向同一 file asset；
   - 不建立第二個 canonical Drawing／Revision／File。
6. 任何 dual-write 失敗必須整筆 rollback；不得 canonical 成功、legacy 失敗或反之。
7. 後續正式進版也必須同步 canonical aggregate，不得回到 package-only authority。

## 5. Read and detail contract

- 圖號工作台 identity page 只能從 `drawings` 讀取，不得再 UNION workspace 與 formal master 當成兩種 row。
- canonical row key 固定 `drawing:{drawingId}`，同一圖號狀態轉移後不得變更。
- 舊 `candidate:{workspaceId}` 與 `drawing:{formalDrawingNumberId}` deep link 只做 zero-write compatibility resolution。
- workspace 可用於 hydrate 整包操作；formal tables 可用於 hydrate 舊模組資料，但兩者都不是 workbench identity authority。
- 任一狀態共用 `DrawingWorkspaceDrawer` 與 Drawing detail hierarchy；adapter 只提供資料與可執行能力。

## 6. Migration and compatibility

- Canonical SQLite schema：`db/schema.sql`。
- PostgreSQL forward artifact：`db/postgres/030_unified_drawing_aggregate.sql`。
- 既有 candidate/formal rows 以 deterministic mapping 回填 canonical identity；重跑必須冪等。
- 已 promoted candidate 與 formal drawing 必須合併到同一 Drawing，禁止產生重複 canonical row。
- 舊 table 在過渡期維持 reader 相容；新功能不得再把它們視為兩套業務物件。
- Production migration、live backfill、flag activation、deploy 與 release 需獨立 release/data gate，本 DEV 不執行。

## 7. Invariants and failure behavior

- `(company_id, drawing_number)` 在非 NULL 時唯一。
- candidate reservation、drawing draft、formal drawing pointer 各自最多對應一個 Drawing。
- 受控／發布 revision 的內容與檔案關係不可就地改寫或刪除。
- illegal state transition、row-version conflict、snapshot drift、跨公司 pointer、partial dual-write 一律 fail closed。
- list/detail 是 read-only；不得靠開 drawer 做 read repair 或隱性 migration。
- audit 需記錄 Drawing ID、前後狀態、command scope 與 compatibility projection 結果，不以 UI label 作權威。

## 8. Acceptance criteria

1. 「待你處理」圖號可直接開啟與「研發可用」相同框架的圖號明細。
2. 同一圖號從準備到研發受控，API row key 與 canonical Drawing ID 不變。
3. 工作台 SQL 不再 UNION `numbering_draft_workspaces` 與 `drawing_numbers` 作 identity authority。
4. 核准前後 canonical Drawing／Revision／File row count 不因狀態轉移增加第二份。
5. 直接呼叫 API 嘗試修改 `rd_controlled`／`released` revision 或其 file relation，server／DB 拒絕。
6. 多圖 workspace 每張圖各自有 stable Drawing identity；workspace 只負責整包操作。
7. 舊 deep link、既有 formal reader 與原子整包審核仍可運作。
8. 1440×900、1024×768、390×844 無抽屜裁切、水平溢位、visible error 或 console/server 5xx。

## 9. Stop conditions

- 需要 production／staging migration、live data repair、deploy、release、merge 或 PR。
- 無法在單一 transaction 保證 canonical 與 compatibility projection 全成全退。
- 必須放寬編號唯一性、snapshot、permission 或受控版次不可竄改政策。
- 需修改 DEV-054 protected migration／spec／QA／QC 或刪除既有正式資料。
