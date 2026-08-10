# QA Plan：DEV-062 料號／圖料單頁工作台與 Workbench Core

Status: `Executed / Fixed-3000 QA-QC Passed / Release Gated`
Date: 2026-08-10
Owner: QA
Independent verifier: QC
Related DEV: `DEV-062`
Related SPEC: `.ai-doc/specs/SPEC-PDM-WORKBENCH-CORE-001-shared-read-and-controller-contract.md`; `.ai-doc/specs/SPEC-PDM-NUMBER-STATE-FLOW-001-unified-numbering-draft-and-transfer-functional-spec.md`; `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
Related ADR: `.ai-doc/decisions/ADR-PDM-WORKBENCH-CORE-001-shared-mechanics-and-domain-adapters.md`
Execution report: `.ai-doc/qc/qc-dev-062-unified-part-relation-workbench-report-2026-08-10.md`

## 1. Objective and Risk Classification

驗證 `/parts` 與 `/numbering/search` 在 umbrella flag 開啟時，各自只剩一個可操作頁面，candidate/formal 能在同一 consistent read projection 中被找到、理解與完成下一步；同時證明抽出 Workbench Core 沒有改壞 Drawing workbench，也沒有遺失 Part owner、relation tree/matrix、workspace lifecycle、權限或資料隔離能力。

Risk: `Medium / P1`。

主要失敗模式：

- candidate/formal duplicate、漏列或 formal availability 被 candidate 冒充。
- Part capability/cost redaction/file/lifecycle 操作在單頁 replacement 中消失。
- Relation formal root 因 candidate overlay 重複，或 source-less candidate 無法到達。
- cursor/filter/actor/company 邊界錯誤造成越權或 stale response。
- 共用抽象層含 domain switch，或 domain adapter 再實作一套共用機制。
- relation N+1、先 limit 後 filter、client merge 或 partial response。
- legacy URL canonicalization 觸發寫入或形成第二套 UI。

## 2. Validation Boundary

In scope：

- Phase 1A Drawing parity / core architecture。
- Phase 1B Part list/detail/capability/owner actions。
- Phase 1C Relation root tree/candidate overlay/matrix/owner handoff。
- Phase 1D legacy URL、race/back-forward/reload、permission/company、responsive/accessibility與 aggregate regression。
- isolated disposable candidate/workspace/relation mutation only when a capability must be proven end-to-end。

Out of scope：

- schema/migration、existing formal data repair/backfill/delete。
- Part Revision、new status/permission/approval action、new relation mutation。
- DEV-057 drawing candidate/review drawer redesign。
- staging/production flag、deploy、release、production smoke/rollback artifact。

## 3. Entry Criteria

- Phase source complete and current source hash recorded。
- isolated local target can prove `productionConnected=false` and `productionWrites=false`。
- `PDM_NUMBER_STATE_FLOW_V1=true`；focused new UI runs set `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1=true`；rollback runs set it `false`。
- Test accounts: Part/workspace owner、reviewer、relation editor、read-only user、cost-redacted user、PDM Admin、second-company user。
- Disposable fixtures use a unique run prefix and cleanup manifest；existing representative formal rows are read-only and have before/after business hashes。
- Network/console/request timing, screenshots, accessibility snapshot, DB readback and query counts can be captured。
- If a required UI capability can only be simulated by direct mutation, result is `Blocked` for that UI acceptance; API/DB may only prepare fixture, inject fault, read back and cleanup。

## 4. Fixture Matrix

| ID | Facts | Expected Part row | Expected Relation row |
|---|---|---|---|
| P1 | active part-only workspace, one candidate Part | one `candidate:{workspaceId}` | source-less `candidate_root` |
| P2 | active workspace with 3 candidate Parts | one candidate bundle, count=3 | one candidate_root, 3 Part summaries |
| P3 | append Part to formal drawing/root | one candidate bundle | formal root once + one activeChanges overlay |
| P4 | bundle ready and owner can submit | candidate, CTA `送出審核` | source/root placement correct |
| P5 | in review, actor is reviewer | candidate, CTA `處理審核` | root status reflects viewer task; formal health unchanged |
| P6 | correction required | candidate, correction CTA | active change `退回修改` |
| P7 | formalization retry/recovery | recovery CTA | active change recovery; no partial formal child |
| P8 | cancelled workspace | hidden by default, history only | hidden by default, history only |
| P9 | published workspace + promoted Part(s) | candidate absent, formal Parts visible | candidate absent; formal root/children updated |
| F1 | active formal Part with drawing/cost/files | one `part:{partId}` | formal root tree contains child |
| F2 | Obsolete/Merged formal Part/root | history only | history only |
| F3 | formal root with 3 drawings/5 Parts/many-to-many links | corresponding Part rows | one root, correct tree/matrix |
| F4 | root with orphan Part/drawing and blocker | formal Part(s) | one root, health/blockers/next step correct |
| F5 | root with two active source workspaces | Part bundles each once | one root + two ordered activeChanges |
| S1 | same display codes in second company | invisible | invisible |
| S2 | user has `numbering.search` but no workspace view | formal only; no candidate hints | formal only; no overlay/count/hint |
| S3 | user lacks cost amount permission | redacted cost | owner Part drawer remains redacted |
| R1 | delayed old list/detail responses | last request wins | last request wins |
| R2 | tampered/cross-filter/cross-user cursor | HTTP 400 + first-page recovery | same |

每個 fixture 保存 workspace/root/part/drawing/link/reservation/approval IDs、company、owner、rowVersion、lifecycle、record status、updatedAt、hash 與 expected row keys。清單驗證不得只用 display code對照。

## 5. Phase 1A — Core and Drawing Parity

| ID | Test | Required evidence |
|---|---|---|
| CORE-01 | shared type/core files無 domain rendering/module switch | TypeScript AST report |
| CORE-02 | Drawing cursor wire format相容；namespace切換、tamper/filter/actor/company/domain invalid皆只單次400→第一頁 | deterministic fixtures + HTTP 400 + no-loop trace |
| CORE-03 | PostgreSQL snapshot issues `REPEATABLE READ READ ONLY` first；SQLite uses one transaction | counting/fake client trace |
| CORE-04 | any hydration failure returns whole error, never partial rows | fault injection response |
| CORE-05 | Drawing list/detail row output deep-equal before/after extraction | serialized fixture diff |
| CORE-06 | Drawing list URL, filters, deep links, primary action, permission and history behavior unchanged | browser/network comparison |
| CORE-07 | rapid query/filter/page and close/switch detail only commit final response | delayed-response browser run |
| CORE-08 | popstate/back/forward/reload rehydrate correctly; no mutation | URL + network log |
| CORE-09 | `PdmWorkbenchList` + existing keyboard hook preserve focus/shortcuts | accessibility snapshot + key log |
| CORE-10 | Drawing lifecycle batch overlay stays exactly 3 queries and deep-equal | counting client report |

Phase gate：CORE-01..10 全過才可讓 Part/Relation 使用新 core。Drawing 可見結果有任何非明示差異即回 RD，不以「新模組可用」豁免。

## 6. Phase 1B — Part Workbench

### 6.1 Read model and API

| ID | Test | Expected |
|---|---|---|
| PART-01 | active workspace contains 1/many Parts | one candidate row per workspace, correct count/items |
| PART-02 | formal Part identity | `part:{stableId}`; code is display only |
| PART-03 | publish transition in concurrent read | never candidate + promoted formal duplicate in one response |
| PART-04 | `mine/work/all/history` | exact server-defined membership before cursor/limit |
| PART-05 | query/series/itemKind/record/human filters | server result and next cursor remain stable |
| PART-06 | cursor malformed/tampered/cross actor/company/filter | 400, no information leak, controller first-page recovery |
| PART-07 | no workspace permission | candidate omitted; candidate detail 404; formal stays visible if allowed |
| PART-08 | cost-redacted role | list/detail contains no amount/tier inference |
| PART-09 | list/detail cache and error envelope | private no-store; canonical actionable errors |
| PART-10 | query budgets | list <=15, candidate detail <=13, formal detail <=6; zero per row/child |

### 6.2 Capability parity

| Capability | Candidate | Formal | Proof requirement |
|---|---:|---:|---|
| find/search/filter/select/deep link | yes | yes | real browser + URL |
| view identity/owner/status/availability | yes | yes | visible facts vs server payload |
| edit allowed Part candidate facts | yes | n/a | UI action + rowVersion readback |
| submit/review/progress/correction/retry/history | by capability | n/a | representative real UI transitions |
| drawing/file readiness when required | reuse existing editor | owner links/files | actual component/action, not link-count only |
| Part properties/variant | candidate fields | existing owner mutation | before/after and permission negative |
| compact Part documents | when applicable | existing file authority | file list/action parity |
| linked drawings/relation handoff | yes | yes | click, context, safe return |
| cost summary/detail/redaction/review | n/a or read-only context | yes | role matrix + amount redaction |
| obsolete/history actions | terminal rules | existing permission | confirmation/direct API negative |

`PART-CAP-FAIL`：legacy可執行能力在新頁只剩文字、disabled且無正確原因、錯誤 owner route、或必須切回 `tab=drafts` 才能完成，均判 P1 fail。

### 6.3 UX / failure

- 每 row只有一個 human status與最多一個 primary CTA；無 raw lifecycle/workspace ID/Part Revision。
- empty/error/401/403/404/409/5xx/cancelled/history 全部通過 Now What Test。
- 409保留未送出值並能 reload/compare；network abort不顯示錯誤。
- creation from Part header and contextual AddPart lands on `/parts?view=work&detail=candidate:...`，不受 drawing flag控制。
- formal Part drawer與 Relation entry使用同一 `PartDetailContent`，cost/file/permission內容一致。

## 7. Phase 1C — Relation Workbench

### 7.1 Projection and API

| ID | Test | Expected |
|---|---|---|
| REL-01 | formal root with many children | one `root:{id}`; correct tree/matrix/summary |
| REL-02 | source-root active candidate | no duplicate root; activeChanges overlay visible |
| REL-03 | two source-root candidates | one root; both ordered overlays, no snapshot merge |
| REL-04 | source-less active candidate | one explicit candidate_root; not formal/production available |
| REL-05 | candidate preparation/ready/review/correction | all reachable under `進行中的變更` |
| REL-06 | publish/cancel transition | overlay disappears atomically; formal facts/history correct |
| REL-07 | query/entityType/productSeries/series/record/human/view/history | filter before keyset/limit; matching child returns one full root |
| REL-08 | formal relationship health vs candidate task | formal health/availability unchanged; one viewer-task CTA |
| REL-09 | no workspace permission | formal root only; no candidate count/code/state/existence leak |
| REL-10 | `projection=workbench_v1` | new envelope; unknown projection 400; legacy flag-off response unchanged |
| REL-11 | relation detail row keys and legacy rootCode lookup | canonical detail and focused overlay; no code guessing after lookup |
| REL-12 | query budgets | list <=18, root detail <=10, candidate detail <=13; zero per root/child |

### 7.2 Capability parity

| Existing relation capability | Expected single-page behavior |
|---|---|
| root tree and expand/collapse | preserved, root unique |
| manufacturing/reference drawing semantics | preserved and visible |
| many-to-many drawing-Part links | tree + matrix agree |
| orphan/ambiguous/blocked/health/next step | preserved with one human status |
| drawing owner detail | same drawer shell + shared Drawing content |
| Part owner detail | same drawer shell + shared Part content |
| relation link/set primary/set reference/remove | same canonical POST, permission/confirmation/409 recovery |
| candidate view/edit/submit/progress/correction | available via focused active change and existing workspace commands |
| create root/drawing/Part work | correct owner destination, no drawing-flag coupling for search/Part |
| returnTo/back to same root/filter/detail | safe and deterministic |

`REL-CAP-FAIL`：tree/matrix/health任一只保留視覺但資料不一致、relation edit改走新 endpoint、candidate需回到 reserved tab、或 owner drawer內容分叉，均判 P1 fail。

## 8. Phase 1D — Compatibility, Security and Real Operation

### 8.1 Legacy URL zero-write matrix

逐一由 browser address bar開啟：

- `/parts?tab=drafts`
- `/parts?tab=reserved&detail={workspaceId}`
- `/numbering/part-drafts?detail={workspaceId}&returnTo=...`
- `/numbering/search?tab=reserved`
- `/numbering/search?tab=reserved&detail={workspaceId}`
- `/numbering/request?returnTo=...`
- `/parts?detail={legacyPartCode}`
- `/numbering/search?detail={legacyRootCode}`

驗證 canonical URL、同等 view/detail、safe returnTo、flag-off rollback與 network log。除使用者在 create/modal 明確 submit 外，整段只有 GET/HEAD；DB workspace/reservation/audit/event/business hashes不變。

### 8.2 Request-race matrix

對 list與detail注入可控 100/500/1000 ms 延遲、abort與 out-of-order response：

- search A → B → C only commits C。
- filter/page change clears invalid cursor history。
- open row A → B; A late response cannot replace/reopen B。
- close detail before response; late response cannot reopen。
- selected row leaves result; detail closes or reconciles to authoritative deep link。
- invalid cursor recovers exactly once，不形成 request loop。

### 8.3 Permission/company/security

- Same request under owner/reviewer/read-only/cost-redacted/admin yields server capability matrix; DOM hiding is not evidence。
- Direct candidate detail with no workspace permission returns 404; cross-company stable ID/code/cursor returns 404/400 without existence facts。
- Disabled action states include exact permission/contact role; only actual admin permission can use adminHref。
- Client-modified company/owner/capability/raw status does not change result。
- GET endpoints remain private no-store and no secrets/filter hashes/raw cursor payload appear in body/log。

### 8.4 Responsive/accessibility

Real Chromium viewports：1440×900、1024×768、768×1024、390×844。

Checks：

- no page-level horizontal overflow、CTA/status truncation、drawer outside viewport、double scroll trap or invisible close。
- Relation matrix may horizontally scroll only within labelled region。
- ArrowUp/Down、Home/End、PageUp/Down、Enter、Escape、Ctrl/Cmd+C；focus returns to originating row。
- tree expand buttons、filters、primary CTA、drawer heading/close有可理解 accessible name；status不只靠顏色。
- reduced motion、200% zoom與keyboard-only完成代表流程。

### 8.5 Isolated real-operation journey

AI QA uses real browser/UI to:

1. From Relation header create disposable source-less bundle; verify one candidate_root。
2. Add multiple candidate Parts; verify Part workbench one bundle row and detail count。
3. Complete allowed facts/readiness, submit, review/correction as fixture requires, and verify cross-role CTA。
4. Approve/finalize only in isolated target; verify candidate rows/overlay disappear and formal Part/root children appear without duplicate。
5. Use Part owner detail to change an allowed non-destructive fixture field; verify relation owner drawer parity。
6. Use canonical relation POST from UI on disposable links; verify tree/matrix/health refresh and 409 recovery injection。
7. Exercise back/forward/reload/legacy URL/race/viewport/keyboard flows。
8. Cleanup all disposable rows/files/events allowed by fixture harness and prove existing formal hashes unchanged。

API/DB calls may prepare account/fixture, inject deterministic fault, read back, hash and cleanup; they may not replace the visible create/edit/submit/relation actions being accepted.

## 9. Command Contract

RD must add these scripts to `package.json`:

```text
qc:dev-062:core
qc:dev-062:part
qc:dev-062:relation
qc:dev-062:compat
qc:dev-062:real-operation
qc:dev-062
```

Aggregate order：

```text
qc:dev-062:core
→ qc:dev-062:part
→ qc:dev-062:relation
→ qc:dev-062:compat
→ typecheck
→ affected-file lint
→ qc:dev-053 focused regressions
→ qc:pdm-number-state-flow-phase1d
→ qc:pdm-drawing-part-relation-view
→ qc:part-number-module
→ qc:pdm-entity-detail-drawer
→ qc:dev-055
→ isolated build
→ qc:dev-062:real-operation
```

任何會寫 fixture 的 existing regression 必須在 disposable target執行；protected local runtime guard不得被繞過。健康 dev server造成 build guard時，依專案既有隔離 build流程，不停止使用者程序。

## 10. Evidence Contract

Run root：`output/qa/dev-062-unified-part-relation-workbench/{runId}/`

必備：

- `manifest.json`：source hash、flags、target identity、production=false、accounts/roles、fixture IDs。
- `contract-results.json`：所有 CORE/PART/REL/compat case逐項 PASS/FAIL。
- `query-budget.json`：每 route/query group count與 row cardinality。
- `network.json`：method/status/route/timing/abort；敏感 header/cookie redacted。
- `console.json`：unexpected error/warning count。
- `before-after-hashes.json`：existing formal facts、disposable facts、cleanup。
- `capability-parity.md`：legacy → single-page逐項 mapping與實際操作證據。
- `screenshots/`：各 viewport + normal/empty/blocked/error/history/drawer。
- `accessibility/`：keyboard/focus/accessibility-name/zoom/reduced-motion結果。
- `verdict.md`：P0/P1/P2、known limitations、production/release未執行聲明。

不可用 source fragment存在、link count、HTTP 200或截圖單獨證明 capability完成；必須至少有 rendered behavior + network/server facts，mutation capability再加 before/after readback。

## 11. Exit and Stop Conditions

Local RD Implemented 最低門檻：

- Phase 1A～1D全過，P0/P1=0。
- Part與Relation capability parity無缺項。
- query hard budgets、architecture static gates、cross-company/permission、zero-write compatibility通過。
- existing formal data hashes unchanged，disposable cleanup完成。
- umbrella flag on/off皆有證據；Drawing parity回歸通過。
- typecheck、affected lint、isolated build、aggregate focused regressions通過。

停止並回 RD：implementation bug、test/evidence gap、capability loss、query budget/N+1、accessibility/responsive defect。

停止並回 Dev PM / ADR：需要 schema、new authority/status/permission/approval/mutation、client join/partial read、identity rewrite或擴大 scope。

停止並進 release gate：staging/production flag、live DB/data、deploy、production smoke、rollback或 release artifact。

## 12. Execution Result（2026-08-10）

Status：`PASS / Local Only / Release Gated`。

- Phase 1A～1D 完成，P0/P1=0。
- Canonical isolated aggregate/browser run：`DEV062-20260810-121012-local-isolated`，aggregate 15/15、contract 40/40、browser 33/33；production connection/write=false/false。
- Representative fixture：60 roots、每 root 3 drawings／5 parts；300 Part rows、180 drawings。
- Query budgets：Part 14/11/6；Relation 18/10/11，均在 hard gate內；小 fixture 與 50 Part rows／60 roots（每 root 3 drawings/5 parts）的 query count 完全相同，證明不隨 row/root/child 成長。
- Performance：warm BFF p95 38ms；browser search visible-update p95 125ms。
- Zero-write read navigation、flag on/off、legacy URL、safe returnTo、back/forward/reload、100/500/1000ms out-of-order list/detail、close-before-response、filtered selection reconciliation、完整 keyboard/focus、reduced-motion、200% zoom、8 viewport及empty/error/history/blocked/drawer screenshots、console/5xx sweep均通過。
- Focused regressions：Drawing、Number State Flow、Part owner、Relation tree/matrix/mutation、Entity Drawer、DEV-055、TypeScript、affected ESLint、isolated build均通過。

Canonical evidence root：`output/qa/dev-062-unified-part-relation-workbench/DEV062-20260810-121012-local-isolated/`。必備的`manifest.json`、`contract-results.json`、`query-budget.json`、`network.json`、`console.json`、`before-after-hashes.json`、`capability-parity.md`、`screenshots/`、`accessibility/`與`verdict.md`均已產出；isolated fixture cleanup完成。

完整結果與已知 release boundary見`.ai-doc/qc/qc-dev-062-unified-part-relation-workbench-report-2026-08-10.md`。本輪沒有 staging／production、live data、commit、deploy 或 release 行為。

## 13. Fixed 3000 Reopen and Acceptance Addendum（2026-08-10）

使用者提供固定 `127.0.0.1:3000` 截圖，證明當時仍顯示「總表／保留號」舊頁籤，因此先前 isolated PASS 不足以支持使用者可見完成，QC 依法重開。

新增不可省略的 fixed-runtime exit gate：

- `npm run dev:local:check` 必須驗證 `/api/numbering/state-flow/status` 的 `partRelationWorkbench.enabled=true`，不得只檢查 HTTP 200。
- 以現有登入 Chrome 對 `/parts`、`/numbering/search` 各做 hard reload；兩頁 heading 必須分別為「料號工作台／圖料工作台」，`.number-state-tabs`、精確文字「保留號」連結與可見 alert 必須為 0。
- Part 固定資料必須同頁出現 formal 與 candidate；Relation 必須同頁出現 formal root 與 candidate／進行中變更訊號。
- 舊 `?tab=reserved` 必須正規化為 `?view=work`，且不得恢復第二頁。
- 「建立保留號」保留為同頁 modal action；QC 只開啟／關閉，不 submit。
- 最終 hard-reload run window 的 app console、server unexpected error／5xx 與頁面級 horizontal overflow 必須為 0。

Fixed runtime run `DEV062-FIX-20260810124507-fixed3000` 為 10/10 PASS；證據位於 `output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/`。此 addendum 不取代 isolated aggregate 對 query、race、權限、zero-write、RWD 與 rollback 的證據；兩者共同構成 DEV-062 本機完成 gate。

## 14. UI Layout Amendment（2026-08-10）

使用者補充「圖料總表」版面參考圖，驗收重點為根號／名稱／狀態同列，展開後依序呈現「圖號」標題、圖號灰底列、「料號」標題與料號膠囊；不得因版面調整恢復「總表／保留號」雙頁或產生水平溢位。

- RD 修改 `src/components/relation-workbench.tsx`：根列改用既有 `pdm-relation-root-main`／`pdm-relation-root-meta` 共用結構；展開樹補上圖號／料號語意區塊與可操作列。
- RD 修改 `src/app/globals.css`：補上圖料樹標籤、圖號灰底列、料號膠囊與中小視窗換行規則；沿用既有 root、badge、chip 元件語言。
- QC fixed 3000 實際 Chrome：`/numbering/search?view=all`、1920×799；legacy tabs=0、精確「保留號」連結=0、visible alert=0、horizontal overflow=false、drawing rows=1、part chips=1。
- 證據截圖：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/screenshots/relation-ui-reference-layout-20260810.png`。
- TypeScript、`qc:dev-062:relation`、`dev:local:check` 與 lint 均通過；lint 僅保留既有 `drawing-detail-preview.tsx` `<img>` 一筆 Next.js warning。

## 15. Redline Text Removal Amendment（2026-08-10）

使用者標示的紅線區域定義為：圖號列的用途／數量輔助文字，以及料號膠囊中的品名。驗收只移除這些次要文字，保留圖號／料號代碼與既有導覽操作。

- `/numbering/search?view=all` 展開 `A0005` 後，圖號只顯示 `A0005-M01`；料號只顯示 `A0005-P01`、`A0005-P02`、`A0005-P03`。
- 展開樹文字不得包含 `製造圖`、`個料號` 或 `馬達_JF_2HP_B`；代碼按鈕仍存在且可導覽。
- Evidence：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/screenshots/relation-redline-removed-20260810.png`。

## 16. Drawing / Part Visual Parity Amendment（2026-08-10）

圖號項目須與料號膠囊共用相同視覺語言：白底、1px 邊框、8px 圓角、30px 最小高度、`4px 8px` 內距與代碼粗體；圖號仍維持整列可點擊範圍。

- QC 實測 `visualStyleMatch=true`；圖號 `A0005-M01` 與料號 `A0005-P01` 的背景、圓角、最小高度、內距與字重一致。
- Evidence：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/screenshots/relation-drawing-same-as-part-20260810.png`。

## 17. Drawing Detail Disclosure Amendment（2026-08-10）

使用者要求圖號明細抽屜除「歷史版本」外全部直接展開，並移除其他收合功能與箭頭。驗收範圍為 `/numbering/drawings?view=all&detail=...` 的正式圖號明細抽屜，包含「更多」、「附件管理」、「同根料號」、「資料維護」及附件面板內的新增、目前、已刪除資料區塊。

- RD 將 drawing detail 的非歷史 `<details>/<summary>` 改為固定 section；`MasterAttachmentPanel` 以 `alwaysExpandedExceptHistory` contract 供圖號抽屜使用，避免影響其他主檔頁面的既有 authority／版次行為。
- 歷史版本本體及其版次明細仍保留 `<details>`，可正常開啟與收合；非歷史區塊 `details` 數量必須為 0。
- 實際登入 Chrome hard reload 後驗證：`nonHistoryCount=0`、`historyCount=3`（歷史版本本體＋2 個版次）、歷史開啟／關閉 `true → false`、visible alert=0；截圖覆蓋抽屜上方、附件管理及下方同根料號／資料維護。
- Evidence：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/drawing-non-history-always-open-20260810.png`、`drawing-non-history-always-open-management-20260810.png`、`drawing-non-history-always-open-lower-20260810.png`。

## 18. Drawing Detail Redline Simplification Amendment（2026-08-10）

使用者進一步要求刪除圖號明細抽屜紅線區域並盡量精簡。驗收範圍為正式圖號 `A0005-M01` 明細抽屜：移除整段「更多」管理入口、參考附件／待處理／已刪除資料管理，以及同根料號卡片的「補成本／編輯」操作與狀態冗餘；保留受控檔案、歷史版本、料號識別／必要屬性及資料維護三個正式入口。

- RD 移除 drawing detail 的管理卡與 reference attachment section；`MasterAttachmentPanel` 僅保留受控檔案、上傳與歷史版本。
- RD 將同根料號卡片改為唯讀識別摘要，移除「已完成 · N 筆」、「補成本」、「編輯」及其不可達編輯狀態；資料維護標題移除右側說明文字。
- 固定 `127.0.0.1:3000` 實際 Chrome 驗證：禁止文字 0（`更多`、`附件管理`、`已刪除資料`、`補成本`、`編輯` 等）；保留文字包含 `圖面與附件`、`歷史版本`、`同根料號`、`資料維護` 與三個資料維護按鈕；`details` 仍為 3 且僅歷史版本本體／版次。
- Evidence：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/drawing-redline-simplified-20260810.png`、`drawing-redline-simplified-lower-20260810.png`、`drawing-redline-simplified-maintenance-20260810.png`。

## 19. Drawing Detail Header Layout Amendment（2026-08-10）

使用者提供頂端 UI 參考圖，要求正式圖號抽屜首屏只保留可辨識的主資料與主要 CTA：移除「正式圖號」小標，將圖號、品名與狀態徽章排成同一基線，右側保留「建立新版次」及關閉。

- RD 在正式圖號 drawer 套用既有 `drawing-workbench-inline-header` layout contract；不影響候選／審核 drawer。
- 預期 DOM：`A0005-M01`、`馬達_JF_2HP_B`、`研發可用` 同列；`建立新版次` 與 `關閉圖號明細` 可見；`正式圖號` eyebrow 不存在。
- 固定 `127.0.0.1:3000` 實際 Chrome 驗證：同列基線成立、visible alert=0、horizontal overflow=false、歷史版本 disclosure 仍為 3 個且可互動。
- Evidence：`output/qa/dev-062-unified-part-relation-workbench/DEV062-FIX-20260810124507-fixed3000/drawing-header-target-20260810.png`。
