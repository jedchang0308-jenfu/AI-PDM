# ADR-PDM-NUMBER-STATE-FLOW-001：正式發布邊界與候選號保留模型

日期：2026-07-13
狀態：Accepted / Phase 1A-1D Local QC Passed / Release Gate Required
Owner：Dev PM
Related DEV：`DEV-PDM-NUMBER-STATE-FLOW-001` / `DEV-048`
Related SPEC：`.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`
Related QA：`.ai-doc/qa/qa-pdm-number-state-flow-validation-plan-2026-07-13.md`
Platform authority：`.ai-doc/decisions/ADR-PDM-ERP-PLATFORM-002-google-taiwan-cloud-sql-production.md`

## Context

AI_PDM 目前有三套彼此衝突的號碼語意：

1. `part_roots / part_numbers / drawing_numbers` 在建立時就寫入正式 master，即使 `record_status = Draft`，下游仍可能把它當官方 identity。
2. `part_number_drafts` 是獨立草稿，但建立時必須先提供 `reserved_part_number`，舊 domain rule又把送審視為永久受控邊界並安排固定 7 天回收冷卻。
3. 最新人類決策要求最低必要管制：草稿可先不領號；候選號可在未鎖定、無有效引用時立即回收；只有正式發布與後續已作廢的正式號永久不可重用。

若只改 UI 或狀態文字，候選 identity 仍會污染正式主檔、正式搜尋、handoff、recovery ledger與release lifecycle。真正要決定的是資料與交易的正式化邊界。

DEV-046 同時固定下列平台不變量：

- staging/production 正式關聯資料唯一權威是 Cloud SQL PostgreSQL；browser只經Next.js HTTP/BFF。
- 所有受控 mutation 必須把 domain state、audit、command receipt與outbox放在同transaction。
- production restore必須以signed/hash-chained numbering ledger對照issued number、sequence/high-water與non-reuse reservations。
- DB outage時不允許offline/manual number issuance或事後backfill。
- production採clean seed，不搬local draft/demo/test/history。

因此候選號模型必須同時滿足低摩擦草稿、併發排他、正式發布不可逆、restore不重號與既有approval/transfer/release相容。

## Decision

### 1. Permanent control begins at publication

永久不可重用邊界固定為正式 publication transaction commit，而不是：

- form open；
- preview；
- candidate顯示；
- draft save；
- submission；
- approval decision；
- transfer-package approval；
- file upload。

`Approved` 與 `Published` 必須是不同 facts、不同權限與不同command。

### 2. Three-layer identity model

採用三層模型：

1. **Draft workspace**：stable internal ID，可無號，承載root/part/drawing/relation草稿內容。
2. **Candidate reservation**：stable reservation ID + recyclable candidate code；提供排他鎖與review lock，但不是正式 master。
3. **Official master**：publication transaction成功後才寫入 `part_roots / part_numbers / drawing_numbers / drawing_part_links`。

Candidate code不是主鍵。回收後同一code可由新reservation ID取得；舊reservation/event保留作歷史。

### 3. Candidate lifecycle

Candidate reservation states：

`active -> review_locked -> approved_locked -> promoted`

Alternative transitions：

- `review_locked -> active`：withdraw、reject或needs-info apply成功。
- `active -> recycled`：workspace明確取消，且零有效引用、未review lock。
- `approved_locked -> active`：只在核准被正式撤銷且有可稽核decision policy時；不得由一般編輯直接解鎖。
- `promoted` terminal；不得回candidate或recycled。

第一版沒有固定回收冷卻，也沒有自動逾期回收。是否可回收由即時reference/lock facts決定。

### 4. Allocation algorithm

- Root/part/drawing候選號由server transaction配置。
- 最小可用序號演算法排除正式master、active/locked/promoted candidate與DEV-046 recovery non-reuse reservation。
- `numbering_sequences.next_value`只是high-water/hint，不是availability authority，也不因recycle直接倒退。
- PostgreSQL使用scope row/advisory lock + unique constraint；SQLite使用serialized write transaction；unique collision允許相同idempotent command內最多3次bounded retry。
- Preview/open form不配置；DB unavailable即fail closed。

### 5. Review is a temporary exclusive lock

- Review只透過既有approval platform與`/approvals` reviewer inbox。
- Submit review建立immutable snapshot/targets並把candidate設為`review_locked`。
- Approval handler apply成功只把candidate改為`approved_locked`；不建立master、不改Released。
- Reject/needs-info/withdraw須在同transaction把request state與candidate unlock對齊，避免orphan `審核中`。

### 6. Publication is explicit and atomic

`pdm.numbering.publish_draft_workspace`是唯一promotion command。它必須：

- 驗證actor/company/explicit publish permission；
- 驗證approved immutable snapshot與current workspace/reservation versions一致；
- 驗證required `PublicationEvidencePort` evidence finalized；
- 重新檢查official/candidate/recovery collision；
- 全有或全無寫入完整master bundle與relations；
- 將reservation設為`promoted`、workspace設為`published`；
- 同transaction寫audit、receipt與`pdm.numbering.official_number_published.v1` outbox event。

任何一步失敗都不得留下部分official rows。批准後collision不得自動換號，必須fail closed並由PDM Admin調查。

#### 6.1 Publication evidence applicability

`HD-048-02 / 2C`固定以下規則：

- root-only，以及沒有drawing或required-file obligation的part-only publication，可由版本化server rule明確回`not_required`。
- 任何建立或發布drawing的scope，都必須有finalized controlled-file evidence。
- 技轉包只要含drawing或declared required file，每一項必要evidence都必須finalized；任一缺漏整包fail closed。
- Production在direct GCS adapter/verifier可用前，所有需檔案的publication回`publication_evidence_not_ready`；browser不得以本機檔案、Firebase Storage、Shared Drive、signed URL或client claim代替。
- Evidence reference最少包含bucket、object key或stable object ID、GCS generation、content hash、media/type、`finalized_at`與rule version。Preview是derivative UX，不是publication evidence；2D/3D無法預覽不直接否定已驗證的controlled object evidence。

#### 6.2 Same-actor authorization

`HD-048-03 / 3C`不要求submitter、approver、publisher為不同自然人。同一actor可依序完成三步，但每一步都必須有獨立明示permission、獨立command/confirmation/receipt與獨立audit action。三個actor ID可以相同；approval handler仍不得呼叫publication，Admin或任何單一角色不隱含其他permission，跨公司與超出scope一律拒絕。

### 7. Transfer approval does not publish

- 技術移轉以case-scoped transfer package送審。
- `transfer.package_review` approval只把frozen scope設為`ApprovedPendingPublish`。
- 另由有`transfer.publish`與underlying number publish permission的actor執行explicit batch publication。
- Batch中任何一個pending workspace失敗，整批promotion rollback。
- `/technical-transfer?tab=published`與manufacturing/procurement handoff只讀已完成publication的正式資料。

### 8. Official non-reuse and recovery

- `promoted`、Released與Obsolete official code永久不可重用。
- DEV-048 official publish event是DEV-046 signed numbering ledger的輸入契約；DEV-048不建立第二套ledger authority。
- Restore後ledger有、master缺的official number要建立recovery non-reuse reservation，不可重新分配成candidate。
- Candidate不進clean production seed；candidate遺失不從screenshot/email猜號回填，owner重新取得candidate。

### 9. Legacy handling

- Released/Obsolete master維持official non-reusable。
- 舊制Draft/NeedInfo/PendingReview/Rejected master不得自動改成candidate或回收；先分類為`legacy_official_reservation`，顯示未發布/不可正式使用，另案處置。
- Active `part_number_drafts`若無formal master與controlled refs，可由migration classifier建立workspace + candidate reservation mapping。
- Production clean seed不搬local drafts或ambiguous legacy masters，因此新production不延續formal-create-immediately-official規則。

### 10. Platform and schema boundary

- New DEV-048 domain tables暫留locked PDM `public` schema；DEV-047擁有post-pilot legacy schema relocation。
- Browser不得直連DB；company/permission由server-resolved actor context決定。
- Phase 1正式檔案整合只用interface/fake/fail-close；live direct GCS adapter屬DEV-046 Phase 3B。
- 本ADR不授權live Cloud SQL/GCS/Firebase資源、data repair、migration execution或release。

## Options Considered

### Option A：號碼一顯示就永久占用

Rejected。

優點是規則簡單、幾乎不會重用；缺點是preview與誤操作會製造大量永久斷號，且UI顯示變成不可逆business event，效用過低、使用阻力過高。

### Option B：送審即永久不可回收

Rejected。

它能避免審核期間碰撞，但把temporary coordination誤當official publication。Reject/withdraw仍會留下永久斷號，且`Approved != Published`語意不成立。

### Option C：候選號獨立 reservation，發布時提升

Accepted。

它把排他性、審核鎖與正式不可逆分開；代價是需要新增workspace/reservation資料模型、migration與atomic promotion transaction，但能同時滿足低摩擦、併發安全、ISO比例管制與DEV-046 recovery。

### Option D：完全不保留candidate，只在發布瞬間領正式號

Rejected for v1。

它最省號，但無法支援CAD命名、跨人協作與送審前固定識別；使用者會另以Excel/檔名私自預留，反而產生shadow numbering。

### Option E：沿用正式master `record_status = Draft`，另加flag表示candidate

Rejected。

既有下游已把master row視為official identity；再加boolean會讓每個query/export/handoff/recovery都必須猜組合，維持第二套模糊權威。

## Consequences

### Positive

- 草稿可以先保存、不先占號。
- 候選號仍有DB-level exclusivity與idempotency，不依賴UI。
- Reject/withdraw後可繼續使用candidate，取消後可立即回收。
- Approval、publication、usage、obsolete各有單一語意。
- Master與signed ledger只承載真正official/non-reusable identity。
- 技轉流程能整批審核又不繞過正式發布。

### Costs

- 需要新增typed draft tables、candidate reservation/event與migration classifier。
- 既有create/append routes必須轉接，不能同時維持兩個write authority。
- Legacy Draft master需要保守分類與後續人工處置。
- Approval apply、publication與transfer batch需要額外transaction/concurrency tests。

### Risks and controls

| Risk | Control |
|---|---|
| Candidate雙重配置 | scope lock + partial unique + idempotency + bounded retry |
| Approval與candidate lock漂移 | same transaction request/snapshot/lock apply；orphan consistency gate |
| 部分master publish | root->part->drawing->relation single DB transaction |
| Approval被誤當publish | separate action/permission/CTA/command；handler禁止master write |
| 同一actor被誤當可跳過權限或自動串接 | 每步獨立permission/command/confirmation/receipt/audit；actor ID可相同但authorization不可合併 |
| Legacy row誤回收 | classifier dry-run；ambiguous default no mutation |
| Restore造成重號 | signed ledger + recovery non-reuse reservation + no-go reconciliation |
| File evidence失敗卻已發布 | finalize evidence before short DB transaction；fail-close port |

## Amendment / Supersession

本ADR自2026-07-13起取代下列未來語意，但不抹除其既有實作/QC歷史：

- `ADR-PDM-CHANGE-CONTROL-001`：「送審即永久受控」與固定7天冷卻。
- `SPEC-PDM-CHANGE-CONTROL-001`：同上；既有FFF/BOM/change-control evidence仍保留。
- `ADR/SPEC-PDM-PRODUCTION-SLICE-001`：新form一建立root/drawing/part即為永久official的future behavior。

仍然有效：

- 正式發布與已作廢official number不可回收。
- controlled-history、approval audit、BOM/replacement references與released evidence不可hard delete。
- DEV-046 Cloud SQL/BFF/GCS/signed-ledger/clean-seed/release gate不變。

## Re-entry Triggers

- 要把approval改為自動publication。
- 要讓published/obsolete official code可重用。
- 要加入固定冷卻、自動回收或跨公司共享號池。
- 要自動demote/recycle ambiguous legacy master。
- 要新增offline/manual numbering fallback。
- 要讓browser或外部client直接決定candidate/official uniqueness。
- 要執行live migration、data repair、provider cutover、deploy或release。

## Decision Outcome

本ADR的publication boundary、candidate lifecycle與official non-reuse決策維持Accepted。2026-07-13使用者以`1C / 2C / 3C`關閉SPEC登錄的`HD-048-01..03`：四個可見舊側欄項目退出，舊URL只保留redirect/guidance；drawing/required-file publication必須有finalized evidence，純root/part-only可由server rule回`not_required`；同一自然人可完成submit/approve/publish，但不得合併權限、command或audit。Phase 1A-1D本機RD與獨立QC均已通過；live provider與release仍走DEV-046 / DEV-032 gate。
