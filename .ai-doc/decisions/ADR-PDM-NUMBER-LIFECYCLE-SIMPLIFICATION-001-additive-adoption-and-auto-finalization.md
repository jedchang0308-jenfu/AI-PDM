# ADR-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001：既有保留號加法式導入與核准後自動正式化

Status: `Accepted / RD Implementation Ready / Not Implemented / Production Release Gated`
Date: 2026-08-03
Readiness reviewed: 2026-08-04
Owner: Dev PM
Related DEV: `DEV-052`
Related SPEC: `.ai-doc/specs/SPEC-PDM-NUMBER-LIFECYCLE-SIMPLIFICATION-001-efficiency-first-bundle-flow.md`

> Amendment 2026-08-04：`DEV-053` 已達RD Implementation Ready，採`.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`補充server-side一致性read projection與workspace nullable source drawing/part/link context。它不取代本ADR的single bundle review、outer transaction/savepoint、idempotency或recovery authority；既有workspace不backfill。

## 1. Context

現行流程把候選號核准、人工正式發布與首版圖面建立拆成多個人工節點。這保護了正式號邊界，但造成重複確認、跨頁等待，也讓「審了號碼卻還沒有可審圖面」成為常態。

正式環境已存在不同階段的 reservation、workspace、approval 與 formal master。使用者決定這些既有保留號要進入新流程並往前推進，同時不得破壞或改寫任何既有資料與稽核歷史。

此決策跨越 numbering、drawing revision、approval、file evidence、audit/outbox 與 production migration，且會取代 DEV-048／051 的部分長期流程規則，因此以 ADR 固化。

## 2. Decision

採用以下組合：

1. 所有非終結 reservation workspace 由同一新流程服務讀取，但以 compatibility projection 映射；不批次搬遷或回填既有 rows。
2. 候選階段新增獨立、additive 的 candidate revision aggregate；不把 revision 欄位塞進 reservation row。
3. 新建案件以圖料關係、候選首版與 finalized file evidence 組成單一 bundle review。
4. bundle approve apply 同一 outer transaction 內，以 savepoint 原子建立 formal masters、promote reservations、建立 physical `Pending` revision package與 immutable review-approval companion，再寫 audit／receipt／outbox；新版由兩者投影 effective `ReviewApproved`。
5. 舊 number-only approval 不擴大解讀：pending request 繼續原審核；approved request 只當號碼基線，圖面須經 addendum review 才能自動正式化。
6. 小數版 `ReviewApproved` 是受控研發結果，不是 production-effective `Released`。
7. rollout 採 feature flag + additive schema + production-like snapshot rehearsal；production migration／activation 另走 release gate。

## 3. Why This Decision

### 3.1 Efficiency

新案件只送審一次。核准後由系統執行可被規則完整驗證的機械式轉換，不再把 publication 當第二次人工確認。

### 3.2 Data protection

read-time projection 讓既有案件出現在同一 UI 與生命週期中，但不需要對 production rows 寫入 workflow version、重分類或重播 approval。真正新增資料只發生在使用者明確開始候選圖面工作之後。

### 3.3 Audit correctness

approval snapshot 必須真的包含被核准的圖料關係、版次與檔案。舊 number-only approval 沒有這些內容，因此不能直接授權新圖面正式化；addendum review 是最小且可稽核的補足。

### 3.4 Lifecycle correctness

「正式圖號已建立」與「版次已量產發行」是兩個不同事實。建立 formal drawing master 不代表小數研發版可以成為 `Released`；`ReviewApproved` 保留這個語意邊界。

## 4. Transaction Boundary

`pdm.numbering.decide_candidate_bundle_review` 是核准決議與正式化的唯一入口，`pdm.numbering.retry_candidate_bundle_apply` 只重試同一 approved snapshot。成功條件為以下資料在同一 outer transaction 的 `candidate_bundle_formalization` savepoint 全數完成：

- approval apply fact；
- formal root／part／drawing masters與 links；
- candidate reservations `promoted`；
- workspace `published`；
- physical formal revision package `Pending`、immutable evidence links與 review-approval companion；
- audit、command receipt、outbox。

immutable decision 在 savepoint 前寫入。外部通知、搜尋投影或 webhook 不進 transaction，改由 outbox 在 commit 後冪等處理。apply 失敗時 rollback savepoint，approval 保留決議與 `apply_failed` 診斷，但 formal master、promotion、package、file link與 success event 全部回到基線。

## 5. Compatibility Rules

- Existing database rows remain source facts; projection is derived, not persisted back into them.
- `numbering.candidate_publication_review` retains its current number-only snapshot/apply contract for already-created requests.
- New requests use versioned `numbering.candidate_bundle_review` snapshots.
- Existing manual publish command remains available only for untouched legacy/recovery paths during rollout; new bundle UI must not expose it as a normal second step.
- New effective `ReviewApproved` facts may only be created after new-code activation。既有 `drawing_revision_packages.status` 不擴張；舊版 reader 只會保守看見 physical `Pending`。schema deployment 必須 backward compatible，production activation 前仍需證明 rollback/read compatibility。
- A feature-flag rollback hides new write paths but never deletes candidate revisions, approval snapshots or formalization evidence already created.

## 6. Consequences

Positive:

- 移除新案件的號碼單獨送審與人工發布步驟。
- 既有案件可在同一 UI 往前走，不需要危險的資料搬遷。
- approval scope 與真正被正式化的內容一致。
- 原子／冪等邊界比前端串接「核准後再呼叫 publish API」更可靠。

Costs and constraints:

- 需要 additive candidate revision schema、versioned approval action與跨模組 transaction orchestration。
- 舊 pending/approved number-only request 需要兼容過渡節點，無法假裝已審過圖面。
- 新版 revision readers 要 additive join companion 才看見 effective `ReviewApproved`；既有 readers、released filters、reports與 exports 不需接受新 physical enum，但必須驗證不會把 `Pending` 當 manufacturing-effective。
- production drawing flow 仍受 finalized GCS evidence authority 阻擋；文件完成不等於可上線。

## 7. Alternatives Rejected

### A. 只有新建 workspace 使用新流程

拒絕：使用者明確要求既有保留號直接進入新流程；永久雙流程會增加操作與維護成本。

### B. 批次回填 workflow version 並轉換所有舊 rows

拒絕：會直接改寫 production 既有資料，且無法可靠推測舊 snapshot 是否涵蓋首版圖面。

### C. 舊 number-only 核准直接自動發布新圖面

拒絕：擴大核准範圍，破壞 audit correctness，可能發布從未被 approver 看過的內容。

### D. 核准後由前端再呼叫既有 publish endpoint

拒絕：會留下 approval 成功／publication 失敗的跨 command 部分狀態，也讓重試與權限歸屬模糊。

### E. 候選階段直接建立 formal drawing revision package

拒絕：在核准前提前建立正式權威，增加誤用與回收難度。候選 aggregate 與 formal package 必須分離。

### F. 把核准的 `0.1` 標為 `Released`

拒絕：違反 DEV-050 的量產發行閘門，也會讓 downstream manufacturing 誤用研發版。

### G. 直接擴張 `drawing_revision_packages.status` 為 `ReviewApproved`

拒絕：SQLite 既有 check constraint 需要 rebuild/copy 舊表，會擴大 production data 風險；舊版 TypeScript reader、filter與 rollback binary 也不認得新 enum。採 physical `Pending` + immutable companion 能以純 additive DDL 保存同一語意，舊版只會低估狀態，不會錯誤放行。

## 8. Rollout and Rollback Decision

1. Local：以既有／新建 fixtures 完成 schema parity、projection、transaction failure injection。
2. Staging：用 production-like sanitized snapshot rehearsal，驗證 migration 前後資料 hash/count 與舊版 read compatibility。
3. Production schema gate：只部署 additive DDL，feature flag 維持 off，確認 migration zero-DML 與 runtime read。
4. Activation gate：direct GCS finalized evidence、named approver、recovery owner與 rollback evidence 齊備後才開啟新 writes。
5. Rollback：關閉新 write paths；保留已建立的 candidate/review/formalization facts。舊版 app 不需解析新 physical package enum；若無法忽略 additive tables/response fields，停止 code rollback並改走 tested roll-forward recovery。

## 9. Superseded Rules

當且僅當 DEV-052 對應 code path 已啟用：

- DEV-048「approval 不得自動觸發 publication」對 `numbering.candidate_bundle_review` 不再適用；其他 action 仍維持原規則。
- DEV-051「publication/promotion 前首版 CTA 必須停用」不再適用；新 CTA 建立 candidate revision，而不是 formal revision。
- DEV-050 minor `Released` prohibition 不被 supersede。

## 10. Revisit Triggers

- candidate revision 需要跨 workspace 共用或多人 branching；
- approval platform 無法在同 transaction 使用 numbering/revision repository；
- production file authority 改變；
- effective `ReviewApproved` companion projection 無法與既有 report/export/current-pointer 相容；
- 法規或品質制度要求 approver 與 publisher 必須是不同自然人。

## 11. Implementation Binding

- Schema authority：`db/postgres/021_number_lifecycle_simplification.sql`、`db/schema.sql`、`supabase/migrations/20260804010000_number_lifecycle_simplification.sql`。
- Feature authority：`PDM_NUMBER_LIFECYCLE_V2` default off；local Phase 1A-1D 不修改 production-slice allowlist。
- Approval authority：新 `numbering.candidate_bundle_review` 由 numbering domain service special-case；不得落入 generic approval handler 的跨交易 apply path。
- Permission authority：重用 `numbering.draft.update`、`numbering.candidate.review.submit/withdraw/decide`；auto-finalization 不要求 approver 額外持有 `numbering.publish`。
- Physical/effective status authority：`drawing_revision_packages.status='Pending'` + matching immutable companion = effective `ReviewApproved`；只有 physical `Released` 可進 manufacturing current/handoff。
- Production data authority：migration 不得 alter/backfill/delete/update existing business rows；只允許 additive DDL與新 action control-plane insert。read/open/bootstrap 零寫入。

上述 binding 已於 2026-08-04 完成 feasibility/readiness review；ADR 不授權直接部署或啟用 production writes。
