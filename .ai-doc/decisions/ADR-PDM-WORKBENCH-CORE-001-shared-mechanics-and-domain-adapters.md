# ADR-PDM-WORKBENCH-CORE-001：共用工作台機制與領域 Adapter 邊界

Status: `Accepted / Local Implemented / QA-QC Passed / Release Gated`
Date: 2026-08-10
Owner: Dev PM
Related DEV: `DEV-062`
Related SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`
Related QA: `.ai-doc/qa/qa-dev-062-unified-part-relation-workbench-validation-plan-2026-08-10.md`
Extends: `.ai-doc/decisions/ADR-PDM-UNIFIED-DRAWING-WORKBENCH-001-read-projection-and-source-context.md`

## 1. Context

`/numbering/drawings` 已證明 candidate workspace 與 formal master 可以透過 server-side read projection 在單頁安全呈現；但 `/parts` 與 `/numbering/search` 仍把正式資料與保留號拆成兩個可見頁籤。三個頁面目前又分別持有 URL、請求競態、選取、鍵盤、drawer 與 pagination 行為，形成重複機制。

直接複製 drawing workbench 會產生三套 read service；把所有欄位與畫面塞入 `UnifiedWorkbench<T>` 則會把料號、圖料樹與圖號版次的領域差異轉成泛型條件與 module switch。兩者都會提高耦合，且無法穩定驗證權限、cursor 與狀態投影是否一致。

本決策必須同時滿足：

1. 候選／正式資料在同一 snapshot 中投影，browser 不做雙 API join。
2. 跨模組機制真正共用，但料號與圖料的 row、detail、CTA 與樹狀關係仍由 owner domain 決定。
3. 不建立第二套 relation mutation authority，不改 candidate、approval、publication 或 material identity。
4. 可由 RD 分 Phase 實作與回歸，且能以靜態 architecture gate 防止日後重新分叉。

## 2. Decision

採用「小型 Workbench Core + server domain adapters + domain UI composition」：

- Workbench Core 只提供純契約、signed keyset cursor、read-only snapshot helper、URL/request/selection controller 與既有 UI primitives 的小幅擴充。
- Drawing、Part、Relation 各自擁有 server adapter；adapter 投影自己的 row/detail/filter/action，不把 domain 欄位塞進 core。
- Core 依 callback／opaque row contract 運作，不接受 `module` 參數，不出現 `parts/search/drawings` switch。
- Domain adapter 不得自行重做 cursor 簽章、URL canonicalization、AbortController/request sequence、selection reconciliation、actor/company scope 或 canonical lifecycle action projection。
- `/api/numbering/relations` 繼續是 relation read + mutation authority。單頁讀取使用同 route 的 `projection=workbench_v1`；detail 使用同 namespace 的 `GET /api/numbering/relations/[rowKey]`，不新增平行 mutation endpoint。既有 `POST /api/numbering/relations` 不變。
- 料號新增 `GET /api/parts/workbench` 與 `GET /api/parts/workbench/[rowKey]` 作 read-only BFF；既有 Part owner mutation/detail routes 不變。
- Drawing workbench 在 Phase 1A 改用共用 core，但輸出、row key、cursor payload、route、permission 與可見行為必須等價。

## 3. Stable Identity and Authority

| Domain | Candidate identity | Formal identity | Mutation authority |
|---|---|---|---|
| Drawing | `candidate:{workspaceId}` | `drawing:{drawingNumberId}` | existing workspace/drawing/revision/approval routes |
| Part | `candidate:{workspaceId}` | `part:{partNumberId}` | existing workspace and Part owner routes |
| Relation | source-less：`candidate:{workspaceId}`；source-root candidate 是 root overlay | `root:{partRootId}` | existing workspace routes and `POST /api/numbering/relations` |

規則：

- display code 不得作為 canonical row identity；只在 legacy unprefixed deep link resolver 中使用。
- published workspace 不得再以 candidate top-level row 出現。
- Part Number 是無版次物料身份；本決策不得新增 Part Revision 欄位、route 或 projection。
- Relation formal root 一頁只出現一次。有 source root 的 active candidate 只附著於該 root；沒有 source root 的 candidate 只能是明確標示不可正式使用的準根節點。
- row/detail/action 的 company、permission、human status、availability 與 viewer responsibility 全部由 server 推導；client 傳入的 company、owner、capability 或 raw state 不具 authority。

## 4. Read Consistency Decision

每個 list/detail adapter 在一個 bounded read snapshot 中完成 identity、hydrate 與 projection：

- PostgreSQL：`REPEATABLE READ READ ONLY`。
- SQLite：同 connection transaction，且 helper 不暴露任何 write method。
- cursor 排序固定 `updated_at DESC, row_key ASC`。
- cursor payload 固定 `{ version: 1, filterHash, updatedAt, rowKey }`；HMAC secret 沿用 `PDM_AUTH_SECRET || AUTH_SECRET`，production 缺 secret fail closed。
- `filterHash` 必須含 domain namespace、normalized filters、companyId、actorId；跨 domain、跨 actor、跨 company 或改 filter 的 cursor 一律 400。
- identity/hydration 任一來源失敗時整個 response 失敗，不回 partial rows。
- formalization 並行期間不得同時回 candidate 與其已發布 formal identity；下一次完整 read 才進行 candidate → formal replacement。

## 5. Options Considered

### A. 複製 Drawing Workbench 三次

Rejected。短期快，但會複製 cursor、permission、race recovery 與 URL 相容；修正一個跨模組不變量時需同步三套實作。

### B. 大型 `UnifiedWorkbench<T>` 與 module switch

Rejected。料號是 identity list，圖料是 root-centric relationship tree，圖號含 revision/file lifecycle；統一渲染會把真正領域差異變成大量 conditional props。

### C. Browser 分別載入 candidate/formal 再 merge

Rejected。無法保證 snapshot、去重、權限與 filter-before-limit，且在 formalization 期間會產生 duplicate/stale row。

### D. 小型 mechanics core + domain adapters

Chosen。共用的是可證明相同的機制；domain meaning 保持局部、可讀與可測。

### E. 新建 `/api/numbering/relation-workbench`

Rejected。會與 `/api/numbering/relations` 形成兩個 relation read authority，日後 health/matrix/mutation projection 容易漂移。

## 6. Feature Activation and Rollback

新增單一 umbrella flag `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1`：

- default `false`；只有值為 `1|true|on|enabled` 且 `PDM_NUMBER_STATE_FLOW_V1` 開啟時生效。
- status endpoint 新增 `partRelationWorkbench: { enabled, requested, flag, dependency, phase: "DEV-062" }`。
- flag off：`/parts`、`/numbering/search` 舊雙頁 UI 與 legacy GET response 保持可回復；新 Part read BFF、Relation workbench projection/detail回404。focused test必須明確開flag。
- flag on：兩個模組同時使用單頁工作台，legacy query 只 canonicalize，不顯示第二套 tabs。
- Phase 1B 或 1C 單獨完成時不得把 umbrella flag 標成可 release；兩個 adapter 與 Phase 1D gate 全過才可 activation。
- 本 ADR 不授權 staging/production flag 切換、deploy 或 release。

## 7. Consequences

Positive：

- 共用 URL、cursor、request race、keyboard/focus 與 selection recovery，而不犧牲 domain 可讀性。
- relation N+1 有明確 repository gate；Part/Relation client 不再各自拼 candidate/formal。
- owner-domain mutation 與既有 permission boundary 不變，回滾只需關閉 UI flag。
- Drawing 成為 core parity consumer，可防止「只為新頁面設計、舊頁漂移」。

Costs：

- Phase 1A 必須先做 drawing parity，不能直接從 Part UI 開始複製。
- 需新增兩個 domain repository 與 focused query-budget tests。
- 舊 UI 在 flag-off 期間暫時保留；刪除 legacy page code 必須延後到 activation 證據成立後，不能在 Phase 1B 提前移除 rollback path。

## 8. Re-entry Triggers

出現下列情況必須停止並回 Dev PM / ADR：

- 需要持久化新的 cross-domain row identity 或新增 schema/migration。
- 需要改 Part Number identity、Drawing/BOM revision authority、workspace lifecycle 或 approval action。
- 一個 relation candidate 需要同時附著多個 source roots，且現有 workspace source context 無法表達。
- 必須新增第二套 relation mutation endpoint 或 client-side join 才能完成。
- query budget 只能靠降低正確性、略過 permission/status projection 或讀 partial data 才能通過。
- 需要寫入、回填、修復或刪除既有正式資料。

## 9. Release Boundary

本 ADR 只讓 DEV-062 達到本機 RD 可開發。不得據此執行 schema、正式資料 mutation、commit/merge/PR、staging/production activation、deploy、smoke、rollback 或 release artifact；後續仍走既有 release gate。
