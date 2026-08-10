# QA-PDM-ENTITY-DETAIL-DRAWER - Validation Plan

Date: 2026-07-09
Related DEV: `DEV-PDM-ENTITY-DETAIL-DRAWER-001` / `DEV-039`
Related SPEC: `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`
Status: Executed Locally through Phase 1C / Independent QC Passed / Release Not Authorized

## Validation Objective

Verify that root, drawing and part detail drawers follow one object-detail contract across entry pages, and that candidate/formal drawings render one `DrawingWorkspaceDrawer` without merging lifecycle write authority or adding a second preparation layer:

```text
click root code -> root detail
click drawing number -> drawing detail
click part number -> part detail
```

The same object opened from different entry pages must show the same core object information. Source context may change default focus only.

## Scope

In scope for Phase 1 validation:

- `/numbering/search` relation tree and matrix click targets.
- `/numbering/drawings` drawing drawer.
- Candidate drawing workspace drawer (`candidate_bundle`) and formal drawing drawer (`drawing_number`) header/section parity.
- `/parts` part drawer.
- Shared drawer shell behavior: width, close, resize, loading/error states and `data-*` entity attributes.
- Drawing detail consistency across `/numbering/search` and `/numbering/drawings`.
- Part detail consistency across `/numbering/search` and `/parts`.
- Root detail correctness from `/numbering/search`.
- Attachment/cost visibility parity under the same logged-in role.
- RWD/no-overlap evidence for affected drawers.

Out of scope:

- Merging `/numbering/search`, `/numbering/drawings` and `/parts`.
- DB schema migration.
- RLS or permission redesign.
- New cost workflow.
- New attachment workflow.
- Production deployment or release artifacts.

## Required Fixtures

Use disposable local fixtures or stable demo data. Do not mutate production or Supabase live data.

| Fixture | Required data |
|---|---|
| `ENTITY-ROOT-001` | Root with at least one manufacturing drawing, one reference drawing and two parts |
| `ENTITY-DRAWING-M` | Manufacturing drawing linked to at least one part and with attachment/readiness sections available |
| `ENTITY-DRAWING-R` | Reference drawing linked as reference-only |
| `ENTITY-CANDIDATE-CODED` | Candidate bundle with a primary reserved drawing code, product name and at least one first-revision file |
| `ENTITY-CANDIDATE-UNNUMBERED` | Candidate bundle whose root/part may exist but no drawing reservation exists; title must remain `尚未產生圖號` |
| `ENTITY-PART-LINKED` | Part linked to manufacturing and/or reference drawings, with material/color fields present or visibly missing |
| `ENTITY-PART-COST` | Part with standard cost status and permission-sensitive amount visibility |
| `ENTITY-NO-PERMISSION` | Actor lacking at least one write/action permission; read should still obey page permission |
| `ENTITY-NOT-FOUND` | Nonexistent root/drawing/part code for error-state checks |

## Acceptance Matrix

### Entity Target Correctness

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-TARGET-001 | P0 | Click root `A0001` in relation tree | Drawer has `data-entity-type="part_root"` and root identity/header |
| ENTITY-TARGET-002 | P0 | Click drawing `A0001-M01` in relation tree | Drawer has `data-entity-type="drawing_number"` and drawing identity/header |
| ENTITY-TARGET-003 | P0 | Click part `A0001-P01` in relation tree | Drawer has `data-entity-type="part_number"` and part identity/header |
| ENTITY-TARGET-004 | P0 | Click drawing column/header in matrix | Drawer opens drawing detail, not root detail |
| ENTITY-TARGET-005 | P0 | Click part row/identity in matrix | Drawer opens part detail, not root detail |

### Same-Object Consistency

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-CONSIST-001 | P0 | Open same drawing from `/numbering/drawings` and `/numbering/search` | Identity, root, purpose, status, phase, linked parts, attachment/readiness sections and primary actions are present in both |
| ENTITY-CONSIST-002 | P0 | Open same part from `/parts` and `/numbering/search` | Identity, root, status, phase, attributes, linked drawings, cost status and contextual actions are present in both |
| ENTITY-CONSIST-003 | P0 | Source context differs | Only default section/highlight changes; core object fields do not disagree |
| ENTITY-CONSIST-004 | P1 | Refresh data after selecting object | Selected entity type/code persists if still visible |
| ENTITY-CONSIST-005 | P1 | Switch selected object while drawer is open | Drawer updates content without close/reopen flicker or stale root-only detail |
| ENTITY-CONSIST-006 | P0 | Open drawing/part detail from `/numbering/search` | Drawer first screen does not show root aggregate metrics, full-root part list, full-root drawing list, relation maintenance, warnings/impact/audit sections |

### Drawing Detail Requirements

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-DRAW-001 | P0 | Manufacturing drawing detail | Shows drawing number, root, purpose, lifecycle, attachment library, readiness/submission check and linked parts |
| ENTITY-DRAW-002 | P0 | Reference drawing detail | Shows reference-only semantics and never labels it manufacturing basis |
| ENTITY-DRAW-003 | P1 | Missing attachments/readiness blockers | First visible sentence tells user the next action |
| ENTITY-DRAW-004 | P1 | Same-root part list | Shows same-root parts or a clear empty/blocked state |
| ENTITY-DRAW-005 | P0 | Compare candidate and formal drawing drawers | Both expose `data-detail-family="drawing_number"`, `data-drawing-detail-skeleton="true"` and the same header slots |
| ENTITY-DRAW-006 | P0 | Inspect section inventory in both variants | DOM order is `drawing-overview`, `drawing-revision-files`, `drawing-preview`, `drawing-pending`, `drawing-more` |
| ENTITY-DRAW-007 | P0 | Candidate has no primary drawing reservation | Header shows `尚未產生圖號`; root code is not used as drawing identity |
| ENTITY-DRAW-008 | P1 | Candidate preview data is unavailable | Preview shows a concise next step and does not fabricate a thumbnail or raw worker/API status |
| ENTITY-DRAW-009 | P0 | Inspect candidate/formal write surfaces | Candidate uses first-revision candidate actions; formal controlled attachments stay read-only and route changes through formal revision workflow |
| ENTITY-DRAW-010 | P1 | 5-second first-screen review | Reviewer can state drawing code, product name, status and next step without reading a duplicate identity/status card |
| ENTITY-DRAW-011 | P0 | Inspect candidate/formal render paths | Both directly render `DrawingWorkspaceDrawer` and the DOM publishes exactly one `data-component="drawing-workspace-drawer"` |
| ENTITY-DRAW-012 | P0 | Open an incomplete candidate | First-revision editor and missing requirements are available inline; no visible `準備首版圖面` navigation, duplicate CTA or extra `下一步` card exists |
| ENTITY-DRAW-013 | P0 | Candidate becomes ready | Existing server-derived `送交審核` action becomes available in the same open drawer without route change or drawer replacement |
| ENTITY-DRAW-014 | P0 | Compare incomplete/review/returned/controlled states | Same component stays mounted and each state exposes at most one primary CTA; lifecycle and permission authority remain unchanged |

### Part Detail Requirements

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-PART-001 | P0 | Linked part detail | Shows part number, root, item kind, attributes, linked drawings and lifecycle |
| ENTITY-PART-002 | P0 | Missing manufacturing drawing | Shows missing manufacturing drawing blocker and next action |
| ENTITY-PART-003 | P0 | Cost status visible to allowed role | Shows standard cost status and amount only if current role may view amounts |
| ENTITY-PART-004 | P0 | Cost status visible to restricted role | Redacts amount while keeping status/action guidance |
| ENTITY-PART-005 | P1 | Shared model / MA baseline sections exist in current part surface | Section is preserved when using shared part panel |

### Root Detail Requirements

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-ROOT-001 | P0 | Root detail opened | Shows root code, core name, counts, relationship health, child drawings/parts and contextual actions |
| ENTITY-ROOT-002 | P0 | Draft-only root | Shows draft cleanup action when policy allows and does not show formal obsolete wording as primary action |
| ENTITY-ROOT-003 | P0 | Formal root obsolete candidate | Shows impact-preview/approval style action, not direct mutation |

### Drawer Shell / UI Behavior

| ID | Priority | Scenario | Expected |
|---|---|---|---|
| ENTITY-SHELL-001 | P0 | Drawer close | Escape and close button work without mutating data |
| ENTITY-SHELL-002 | P0 | Drawer resize | Width clamps to viewport and persists per drawer type or shared shell policy |
| ENTITY-SHELL-003 | P0 | Loading state | Does not show stale object identity while loading a different entity |
| ENTITY-SHELL-004 | P0 | Error/not found/restricted state | Uses action-first Traditional Chinese, no raw backend text |
| ENTITY-SHELL-005 | P1 | Keyboard focus | Drawer controls are reachable; list keyboard behavior is not broken |
| ENTITY-SHELL-006 | P0 | Drawer opened | Shell is `complementary`, has no `aria-modal`, dark backdrop, focus trap or body lock |
| ENTITY-SHELL-007 | P0 | Drawer header | Exactly one inline `X`; no floating close or previous/next controls |
| ENTITY-SHELL-008 | P0 | Click another list row while open | Same drawer switches entity without flicker and content returns to top |
| ENTITY-SHELL-009 | P0 | Click non-row background | Drawer closes; clicking a list row does not close before switching |
| ENTITY-SHELL-010 | P0 | Open a confirmation dialog over drawer | Dialog remains modal and its `Escape` does not also close the drawer |

### Responsive / Visual

| ID | Priority | Viewport | Expected |
|---|---|---|---|
| ENTITY-RWD-001 | P0 | `1440x900` | Drawer and list have no overlap, clipped buttons or page-level horizontal overflow |
| ENTITY-RWD-002 | P0 | `1024x768` | Header/actions wrap or compress predictably; scroll ownership is clear |
| ENTITY-RWD-003 | P1 | narrow/current supported mobile sanity | Object identity, close button and primary sections remain usable without horizontal page scroll |

## Now What State Matrix

| State | User likely question | First visible answer | Next CTA |
|---|---|---|---|
| same drawing from two places | 哪邊才是正確圖號資料？ | Same drawing detail appears from both places | Continue in current drawer |
| same part from two places | 料號資料是不是不同步？ | Same part detail appears from both places | Continue in current drawer |
| relation source changed | 為什麼剛剛點的關係不見？ | `已開啟物件詳情，但來源關係不存在或已變更，請重新整理關係樹。` | `重新整理` |
| missing manufacturing drawing | 這個料能不能製造？ | `此料號尚未連到製造圖，請先建立圖料關係。` | open relationship action |
| reference drawing | 這張圖能當製造依據嗎？ | `參考圖不可作為製造依據。` | choose/create manufacturing drawing |
| restricted cost | 為什麼看不到金額？ | `目前角色只能查看成本狀態，不能查看金額。` | request role / contact Admin |

## Required Commands

Minimum gates after Phase 1 RD implementation:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-system-detail-drawer-ui
npm.cmd run qc:part-number-module
```

Focused QC to add:

```powershell
npm.cmd run qc:pdm-entity-detail-drawer
```

Focused QC must verify:

- root/drawing/part click targets set the correct entity type;
- same drawing opened from `/numbering/search` and `/numbering/drawings` has matching core sections;
- same part opened from `/numbering/search` and `/parts` has matching core sections;
- source context changes only focus/highlight;
- part cost redaction remains identical to `/parts`;
- drawing/part attachments remain permission-gated;
- drawer not found/restricted/error states do not show raw backend text;
- no page-level horizontal overflow or critical overlap at required viewport widths.

## Browser Evidence Required

Recommended screenshot paths:

- `output/playwright/pdm-entity-detail-drawer/search-root-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/search-drawing-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/drawings-drawing-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/search-part-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/parts-part-detail-desktop.png`
- `output/playwright/pdm-entity-detail-drawer/entity-detail-laptop.png`
- `output/playwright/pdm-entity-detail-drawer/entity-detail-narrow.png`

## No-Go Criteria

QC must fail if any occur:

- Clicking a drawing number from relation tree opens root-only detail.
- Clicking a part number from relation tree opens root-only or drawing-only detail.
- Clicking a drawing or part number from relation tree opens target detail but still shows root aggregate metrics, full-root lists, relation maintenance, warnings/impact/audit as first-screen content.
- Same drawing from two entry pages omits core sections in one path.
- Same part from two entry pages omits attributes, drawing links or cost status in one path.
- Source context changes status, permission, cost visibility or object identity.
- A reference drawing is labeled as manufacturing basis.
- A restricted role can see cost amount through relation-tree part detail when `/parts` redacts it.
- Drawer shows raw SQL, stack, route text, `Internal Server Error`, `Not Found` or untranslated backend JSON in normal visible UI.
- Implementation requires production/Supabase live change, direct data repair/deletion, merge, PR, rollback or release artifact without explicit authorization.

## Pass / Fail

Pass:

- All P0 target, consistency, drawing, part, root and shell cases pass.
- Same object from multiple entry points has one visible truth.
- Source context affects focus only.
- No raw visible errors or critical layout failures.

## Phase 1C Execution Result - 2026-08-08

- Independent QC result: `PASS`, P0/P1/P2 = `0/0/0` after one Visible Text Noise finding was returned to RD and rechecked.
- Candidate `A0006-M01` opens the inline first-revision editor with zero preparation navigation; visible `準備首版圖面` count is 0 and missing-file guidance appears once beside the upload work area.
- Candidate and formal `A0005-M01` each expose exactly one `data-component="drawing-workspace-drawer"` and the same five-section DOM order. Empty candidate pending content remains a hidden 0×0 node so the contract is stable without creating layout space.
- Final Chrome evidence covers candidate 1440×900 and 390×844 plus formal 1440×900; the earlier run covers both variants at 1024×768 and cancel-dialog isolation. Visible errors, console errors and horizontal overflow are 0.
- Static gates: typecheck PASS; drawer QC 42/42; number-state UI 8/8; DEV-053 UI 23/23; scoped ESLint 0 errors.
- Evidence: `output/qa/pdm-entity-detail-drawer-ai/20260808021459-single-workspace-recheck/`; initial finding and 1024/cancel evidence: `output/qa/pdm-entity-detail-drawer-ai/20260808020032-single-workspace/`.
- Browser response-status telemetry remains `Not Sufficiently Verified`; successful rendered data, visible-error sweep and console sweep are supporting evidence, not a replacement for session-level network logs.

## AI 執行驗證計畫 - 2026-08-07

### QA 角色與判定邊界

- 本節是 QA 設計的 AI-QC 執行契約；QA 不修改產品程式，也不把既有 RD 自測直接視為通過。
- AI 必須操作真實渲染頁面與真實本機 API；靜態檢查、lint、typecheck 只能作為輔助證據。
- 「UI 直覺」採可觀察的 AI UX proxy，不冒充真人認知研究；正式 release 若要求真人 UAT，需另行執行。
- 完整判定只能是 `通過`、`未通過`、`未充分驗證` 或 `阻塞`，不得使用模糊的「大致正常」。
- 規格收斂：`No conflict`。本計畫只補強既有 Phase 1B 驗收，不改 entity truth、生命週期、權限或 release 邊界；ADR 不需要。

### 執行安全邊界

| 項目 | 規則 |
|---|---|
| 執行環境 | 僅限確認為 local / disposable 的環境；先記錄 URL、branch、HEAD、登入角色與資料來源 |
| 既有資料 | `A0005-M01`、`A0001-P01`、`A0007-*` 等既有資料只讀，不編輯、不取消、不發布 |
| 真實寫入 | 只對本輪建立、名稱含 `QA_DRAWER_<runId>` 的 disposable candidate 執行 |
| 禁止操作 | 不正式發布、不核准、不作廢正式主檔、不刪正式附件、不操作 production / live provider |
| 清理 | disposable candidate 必須取消並驗證號碼釋出；保存 before/after 與 cleanup evidence |
| 停止條件 | 環境身分不明、無 disposable data boundary、意外碰到正式資料、出現跨公司資料或 cleanup 失敗時立即停止 |

若無法取得 disposable local data boundary，AI 不得用既有資料替代真實寫入；該項判定為 `未充分驗證`。

### AI 執行順序

1. `Gate 0 - Provenance`：記錄 HEAD、dirty files、local URL、登入角色、feature flags、時間與 viewport。
2. `Gate 1 - Static contract`：執行 typecheck、scoped lint 與 focused QC；任一失敗先記錄，不用瀏覽器成功掩蓋。
3. `Gate 2 - 真實唯讀操作`：逐頁開啟 root、drawing、part、candidate drawer，驗證 entity truth 與共用 shell。
4. `Gate 3 - 真實可逆操作`：只在 disposable candidate 建立、開啟確認 modal、取消與清理。
5. `Gate 4 - UI 缺口掃描`：三種 viewport、長內容、捲動、浮層、文字雜訊、狀態與 accessibility。
6. `Gate 5 - 直覺程度`：執行 5 秒理解、click prediction、操作成本與 AI UX scorecard。
7. `Gate 6 - 證據封存`：輸出 manifest、操作紀錄、截圖、DOM metrics、console/network、缺陷與 cleanup 結果。

Gate 2-5 必須在真實瀏覽器完成；只跑 Playwright source assertion 或 API probe 不算完成。

### 真實操作案例

| ID | 前置條件 | AI 操作 | 預期結果 | 必要證據 |
|---|---|---|---|---|
| AI-REAL-001 | 已登入、圖號清單有資料 | hard reload `/numbering/drawings?view=all`，點一筆正式圖號 | 開啟 `drawing_number` drawer；只有一個 inline `X`；清單未被遮罩鎖住 | URL、viewport、drawer screenshot、entity metadata |
| AI-REAL-002 | AI-REAL-001 drawer 開啟 | 先捲動 drawer，再直接點另一列 | 同一 drawer 更新，不先關閉重開；選取列與內容一致；新內容回到頂部 | 前後 entity code、drawer count、scrollTop、操作紀錄 |
| AI-REAL-003 | 料號清單有資料 | 開 `/parts`，點 `A0001-P01` 或同等 fixture | `part_number` drawer 顯示身分、狀態、圖號關聯、屬性、成本與附件；單一 `X` | screenshot、DOM section inventory |
| AI-REAL-004 | 圖料關係有 root/drawing/part | 開 `/numbering/search`，依序點 root、drawing、part | entity type 依點擊目標切換；drawing/part 核心內容與 owner module 一致；root 才顯示 aggregate | 三次 metadata、same-object comparison |
| AI-REAL-005 | 正式圖號與 candidate 均可見 | 在圖號工作台各開一筆正式圖與 candidate | 兩者皆為一個 `DrawingWorkspaceDrawer`、共用 shell/header/close/resize及五段 skeleton；只允許 lifecycle action/mutation authority 不同 | 對照截圖、`data-component` count、header control count、section key/order inventory |
| AI-REAL-005A | incomplete candidate 可見 | 開啟 candidate，不點任何準備入口 | 編輯器、缺項與檔案工作區已在同頁；可見文字沒有 `準備首版圖面` 導航或重複 CTA | 初始 drawer 截圖、可見文字掃描、URL/route、click count=0 |
| AI-REAL-006 | drawer 開啟 | 點非 drawer 且非清單列位置，再以 `Escape` 關閉 | 兩種方式皆關閉；點清單列時只切換、不閃爍 | drawer count、URL、操作紀錄 |
| AI-REAL-007 | drawer 開啟 | 拖曳寬度、reload、再次開啟 | 寬度 clamp 在 viewport，reload 後仍保留；清單仍可辨識 | width before/after/reload metrics |
| AI-REAL-008 | drawer 開啟 | 用 `Tab`、`Shift+Tab`、`Enter`、`Escape` 操作 | close/action 可聚焦；無 focus trap；輸入欄位不被全域快捷鍵破壞 | focus order、active element、keyboard log |
| AI-WRITE-001 | disposable local DB 與建立權限 | 建立 `QA_DRAWER_<runId>` candidate bundle | 真實建立成功，row 與 candidate drawer 一致；不產生正式 master | request/response、candidate ID、before/after count |
| AI-WRITE-002 | AI-WRITE-001 candidate 開啟 | 開啟「取消保留號」確認 modal，先按 `Escape` | modal 關閉但底層 drawer 保留；沒有取消或其他寫入 | modal/drawer count、row version unchanged |
| AI-WRITE-003 | 同一 disposable candidate | 再開確認並完成取消 | candidate 進入取消/歷史狀態，候選號釋出，未留下正式 root/drawing/part | UI result、API readback、cleanup manifest |

任何真實操作若實際結果與畫面提示不一致，判定 P0/P1；不得只以 API 成功判定通過。

### UI 缺口確認矩陣

每個受影響 route 至少驗證 `1440x900`、`1024x768`、`390x844`；另保留使用者當前 viewport 的 hard-reload 證據。

| ID | 檢查面向 | 可觀察通過標準 | 失敗條件 |
|---|---|---|---|
| AI-GAP-001 | 視覺一致性 | formal drawing、candidate、part、search drawer 的邊界、header、X、resize handle 與間距同一語言 | 相同操作位置、icon、文案或樣式不同 |
| AI-GAP-002 | 資訊層級 | 首屏只保留 identity、主要狀態、必要摘要與動作；完整規則降層 | 同一事實重複兩層以上，或可刪文字不影響決策 |
| AI-GAP-003 | 狀態語意 | `待你處理／等他人處理／系統處理中／可使用／已結束` 能回答責任與下一步 | 出現「建立中／準備中／草稿確認」等無法判斷完成與否的孤立詞 |
| AI-GAP-004 | 控制密度 | header 只有一個 close X；每個狀態至多一個 primary CTA | 浮動 X、上一/下一、重複關閉或多個 primary CTA |
| AI-GAP-005 | 覆蓋與切換 | backdrop 透明且不阻擋 list；點列可直接切換 | 清單不可點、drawer 先關再開、畫面閃爍或失去選取 |
| AI-GAP-006 | 捲動責任 | drawer body 垂直捲動；頁面與 drawer 無非預期 scroll chaining；主 body 無水平捲軸 | bottom horizontal scrollbar、body 誤捲、雙捲軸無法判斷 |
| AI-GAP-007 | RWD | identity、X、主要 CTA 與必要摘要均可讀可按 | overlap、裁切、破版、按鈕超出 viewport |
| AI-GAP-008 | 長內容 | 長圖號、料號、品名、檔名、狀態與中文可換行或合理截斷 | 容器撐破、重要識別被截到不可辨識 |
| AI-GAP-009 | Visible error | 無意外 alert、HTTP 4xx/5xx、Not Found、Internal Server Error、`/api/` route text | 任一使用者可見 runtime error 即 fail |
| AI-GAP-010 | Data sanity | 預期有資料的清單、關係數與附件數不會意外全為 0 | fixture 明明有資料卻顯示空或全 0 |
| AI-GAP-011 | Accessibility | heading、label、role、focus、contrast 與 keyboard path 可辨識 | icon-only 無 label、焦點不可見、Escape 行為衝突 |
| AI-GAP-012 | Modal 隔離 | modal 維持 `aria-modal=true`；drawer 維持 `complementary`；modal Escape 不連帶關 drawer | drawer 被誤設 modal，或一次 Escape 關兩層 |
| AI-GAP-013 | Drawing family 骨架 | candidate/formal 的 header hierarchy、五段 key/order相同；候選特有待辦/取消只在 pending/more | 兩者首屏重新分叉、candidate identity 重複、formal/candidate section order 不同 |
| AI-GAP-014 | Candidate identity | 有圖號顯示主要候選圖號；無圖號固定 `尚未產生圖號` | 以主根號冒充圖號，或 header/body 同時重複同一主要 identity/status |
| AI-GAP-015 | Single workspace | candidate/formal 各只有一個 `data-component="drawing-workspace-drawer"`；切換資料不產生第二 drawer/body | 候選/正式仍走不同 top-level 元件、重複 drawer 或二層頁面 |
| AI-GAP-016 | Preparation friction | incomplete candidate 開啟即能補資料；首屏零次額外導航 | 必須先按「準備首版圖面」、錨點跳轉或進另一頁才可編輯 |

### 狀態覆蓋

至少覆蓋 `loading`、`ready`、`empty`、`error`、`blocked/disabled`、`restricted`、`not_found`、`terminal/history`。若真實資料無法安全產生某狀態，可使用 isolated test server 或既有自動化 fixture，但報告必須標明不是 production data。

| State | 使用者問題 | 通過條件 |
|---|---|---|
| loading | 現在有在載入哪一筆嗎？ | 不顯示上一筆 stale identity；載入完成後 entity code 正確 |
| empty | 沒有資料時我要做什麼？ | 顯示建立、調整篩選或返回的明確下一步 |
| error | 我能重試或回安全頁嗎？ | 第一行是人類結論，提供重試/返回；不顯示 raw backend text |
| blocked/disabled | 為什麼不能做？ | 顯示責任角色、阻擋原因與替代下一步 |
| restricted | 我沒有權限時找誰？ | 說明不能查看/操作，提供角色或 Admin 路徑 |
| not_found | 這筆資料去哪了？ | 提供重新查詢/重新整理，不保留錯誤 entity truth |
| terminal/history | 已完成還要處理嗎？ | 明確說不用處理或改走新版/紀錄路徑 |

### UI 直覺程度確認

#### 5 秒理解測試

AI 只看首次 viewport 截圖，不捲動、不開 tooltip/help，必須能引用畫面文字回答：

1. 目前物件是 root、drawing、part 還是 candidate？
2. 物件識別碼與名稱是什麼？
3. 目前主要狀態是什麼，誰要處理？
4. 使用者最自然的下一步是什麼？
5. 如何關閉並繼續查下一筆？
6. 有沒有高風險動作；若有，是否明確區隔？

任一題只能靠猜測、工程知識或開啟說明才能回答，即判該題 fail。

#### 操作成本門檻

- 從清單開 drawer：1 次 click。
- drawer 開啟時切換另一筆：1 次 click，不需要先關閉。
- 關閉 drawer：1 次 click 或 1 次 `Escape`。
- 辨識主要狀態與 primary CTA：首屏完成，不要求捲動。
- 同一物件從不同入口開啟：identity/status/core sections 不要求使用者重新學習。

#### AI UX Scorecard

每項 `0=無法判斷/誤導`、`1=可完成但需停頓或猜測`、`2=首屏直接理解`。

| 維度 | 2 分條件 |
|---|---|
| 定位與身分 | 一眼知道模組、物件類型、識別碼與名稱 |
| 狀態語意 | 狀態包含完成性/責任，不使用孤立流程名詞 |
| 下一步 | 一個 primary CTA 或明確「不用處理／等誰處理」 |
| 連續查閱 | 清單可見可點，切換不關閉、不閃爍、不失去上下文 |
| 風險與復原 | 危險動作有區隔與確認；取消/返回結果可預測 |
| 資訊負荷 | 無重複事實、內部詞、無決策價值小字或多餘卡片 |

AI UX proxy 通過門檻：總分至少 `10/12`、不得有 `0`，且「狀態語意／下一步／風險與復原」必須各為 `2`。每一分都必須附 screenshot/DOM 引用；不得只寫主觀形容詞。

### FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| backdrop 阻擋清單 | drawer 誤用 modal overlay | 無法連續查圖料 | 點另一列、檢查 pointer-events | P0 | AI-REAL-002、AI-GAP-005 |
| 同物件資訊不同 | owner/search 各自渲染 | 不信任系統資料 | same-object section diff | P0 | AI-REAL-003/004 |
| modal Escape 關兩層 | keyboard handler 未隔離 | 使用者失去工作上下文 | nested modal Escape | P0 | AI-WRITE-002、AI-GAP-012 |
| 真實操作污染資料 | 使用既有正式資料測試 | 產生錯誤主檔或稽核紀錄 | before/after、fixture ownership | P0 | runId fixture、cleanup hard gate |
| 狀態詞看不出責任 | raw lifecycle 直接顯示 | 不知道是否要處理 | 5 秒測試、status wording scan | P1 | AI-GAP-003、UX scorecard |
| header 控制重複 | 各頁再加自己的 X/箭頭 | 視覺混亂、誤按 | header button count | P1 | AI-GAP-004 |
| 窄螢幕水平溢位 | grid min-content / 長檔名 | 主要操作被裁切 | 390px scroll metrics + screenshot | P1 | AI-GAP-006/007/008 |
| 可見 runtime error 被忽略 | 只相信 unit test/API | 使用者實際無法工作 | Visible Error Sweep | P1 | AI-GAP-009 hard fail |
| 正常畫面文字膨脹 | 共用元件顯示所有欄位 | 掃描變慢、認知疲勞 | 紅筆刪除測試 | P2 | AI-GAP-002、資訊負荷分數 |
| focus/keyboard 退化 | 非 modal drawer 沒有完整鍵盤契約 | 鍵盤使用者卡住 | focus order、Escape/Tab | P2 | AI-REAL-008、AI-GAP-011 |

### QC 指令

```powershell
npm.cmd run typecheck
npm.cmd run qc:pdm-entity-detail-drawer
npm.cmd run qc:dev-053:ui
npm.cmd run qc:dev-053:phase1h:ui
npm.cmd run qc:pdm-number-state-flow-ui
npm.cmd run qc:dev-055:contract
npx.cmd eslint src/components/pdm-detail-drawer.tsx src/components/pdm-entity-detail-drawer.tsx src/components/number-state-workspace.tsx src/components/drawing-workbench.tsx src/app/numbering/search/page.tsx src/app/numbering/drawings/page.tsx src/app/parts/page.tsx scripts/qc-pdm-entity-detail-drawer.mjs --quiet
```

如需 production build 證據，應在不破壞正在使用的 local `.next` 的隔離 workspace 執行；build 通過仍不能替代真實 UI 操作。

### 證據輸出契約

固定輸出根目錄：`output/qa/pdm-entity-detail-drawer-ai/<runId>/`

| 檔案 | 必要內容 |
|---|---|
| `run-manifest.json` | commit/dirty boundary、URL、browser、actor、fixture、viewport、開始結束時間 |
| `operation-log.md` | 每個 case 的前置、操作、預期、實際、判定 |
| `screenshots/` | route + entity + viewport + state 命名，不可只存漂亮的成功畫面 |
| `dom-metrics.json` | entity metadata、drawer/button count、scroll/overflow、ARIA、selected row、focus |
| `console-network.json` | console errors/warnings、failed requests、visible error sweep |
| `same-object-diff.json` | drawing/part 從不同入口的 identity/status/core section 比對 |
| `ux-scorecard.md` | 5 秒答案、操作成本、六維分數與引用證據 |
| `defects.md` | severity、route、viewport、重現步驟、expected/actual、證據 |
| `cleanup.json` | disposable candidate ID、取消結果、正式主檔零污染、殘留資料 |

### 缺陷分級與最終 Gate

| 等級 | 定義 | 行動 |
|---|---|---|
| P0 | entity truth 錯誤、正式資料被修改、跨公司資料、modal/drawer 導致高風險誤操作 | 立即停止，整體未通過 |
| P1 | 主要流程不可用、狀態/下一步不明、visible error、遮罩阻擋、關鍵 viewport overflow | 整體未通過，回送 RD |
| P2 | 可完成但有一致性、文字雜訊、keyboard 或資訊層級缺口 | 建立缺陷；不得宣稱「UI 完整通過」 |
| P3 | 不影響任務的細部 polish | 可列改善，不阻擋本地功能判定 |

完整 `通過` 必須同時符合：

- Gate 0-6 均有證據，真實可逆操作完成且 cleanup 通過。
- 所有 P0/P1 為 0；P2 必須有明確 disposition，不能隱藏。
- Visible Error Sweep 為 0 個可見錯誤；預期有資料的關鍵數值不意外全為 0。
- `1440x900`、`1024x768`、`390x844` 均無 page/drawer 主捲動區水平 overflow、重疊或裁切。
- drawing、part、root、candidate 共用 shell 契約與 same-object consistency 通過。
- AI UX score 至少 `10/12` 且三個關鍵維度皆為 2。
- 缺任何實際瀏覽器、viewport、截圖、真實操作或 cleanup 證據時，只能判定 `未充分驗證`。

## Execution Evidence - 2026-07-09

Executed local Phase 1A verification:

- `npm.cmd run qc:pdm-entity-detail-drawer`：9/9 passed。
- `npx.cmd tsc --noEmit --pretty false`：passed。
- `npm.cmd run lint -- --quiet`：passed。
- `npm.cmd run qc:pdm-numbering-search-ui`：30/30 passed on isolated copy server `http://127.0.0.1:3110` with disposable SQLite DB.
- `npm.cmd run qc:pdm-drawing-part-relation-view`：62/62 passed on isolated copy server; includes root/drawing/part click target drawer checks.
- `npm.cmd run qc:part-number-module`：83/83 passed.
- `npm.cmd run build`：passed in isolated workspace copy `output/qc-runtime/dev039-entity-drawer-copy-20260709-104336/workspace`.
- `npm.cmd run qc:pdm-system-detail-drawer-ui`：72/72 passed after approval platform redirect contract alignment; this QC now verifies `/numbering/approvals` as a legacy redirect into canonical `/approvals` rather than a stale independent drawer host.
- `npm.cmd run qc:pdm-approval-platform`：106/106 passed.

Follow-up for information-density parity:

- `npm.cmd run qc:pdm-entity-detail-drawer`：12/12 passed；新增非主根號 target 不顯示 root aggregate sections、owner-style action surface、圖號 section order 檢查。
- `npx.cmd eslint src/app/numbering/search/page.tsx scripts/qc-pdm-entity-detail-drawer.mjs --quiet`：passed。
- `npx.cmd tsc --noEmit --pretty false`：passed。
- Browser DOM smoke with a fresh Chrome session reached `/numbering/search` but was not logged in; logged-in screenshot evidence remains pending and should be captured with an authenticated browser/session.

Phase 1B shared-shell execution on 2026-08-07:

- `npm.cmd run qc:pdm-entity-detail-drawer`：19/19 passed。
- `npm.cmd run qc:dev-053:ui`：23/23 passed；`npm.cmd run qc:dev-053:phase1h:ui`：12/12 passed。
- `npm.cmd run qc:pdm-number-state-flow-ui`：8/8 passed；`npm.cmd run qc:dev-055:contract`：13/13 passed。
- `npm.cmd run typecheck` and affected-file ESLint：passed。
- Authenticated browser verified one non-modal drawer, transparent non-blocking backdrop, one inline `X`, no previous/next controls, row-to-row switching, content top reset, outside close and zero page-level horizontal overflow at `1280px`, `1024px` and `390px` viewports.
- No schema, migration, production data, deployment or release action was performed.

Resolved adjacent governance issue:

- The previous false blocker in `qc:pdm-system-detail-drawer-ui` was resolved under approval platform / system drawer governance. `src/app/numbering/approvals/page.tsx` remains a correct legacy redirect, and the QC validates the `/approvals` workbench detail panel contract plus compatibility message instead of requiring `PdmDetailDrawer` in the legacy page.

Conditional pass:

- Phase 1 may pass without the optional Phase 2 detail facade if frontend adapters are maintainable and parity QC passes.

Fail:

- Entity target correctness fails.
- Core object sections diverge by source page.
- Permission/redaction parity fails.
- Drawer remains root-only for drawing/part clicks.

## 2026-08-09 QA Reopen — Candidate Bundle Submit Modal

Status: `QA-QC Reopened by DEV-059 / Historical PASS Retained as Baseline Only`.

The user-provided current-route screenshot is first-class contradictory evidence: the candidate bundle-submit confirmation modal remains blocking and cannot be dismissed through the visible recovery actions. Therefore, the Phase 1B/1C PASS above must not be cited as proof that the current candidate submission surface is healthy.

Focused authority:

- SPEC: `.ai-doc/specs/SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001.md`
- QA plan: `.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md`
- Task: `.ai-doc/dev_task.md` (`DEV-059`)

Re-entry condition for parent PASS:

- AI operates the current route in a real browser and independently proves `X`, `返回檢查` and `Escape` close behavior with zero mutation.
- Hard reload, back/forward, bfcache, candidate switching and drawer close/unmount do not restore or leak the modal state.
- Runtime/API delay, server interruption, 503 and response-loss cases remain locally closable and provide safe retry/readback recovery.
- A disposable `QA_DEV059_<runId>` workspace completes actual submit, duplicate-activation guard, readback, withdraw/cancel and cleanup with before/after data sanity.
- Required desktop/tablet/mobile viewport evidence, console/network/server logs, screenshots/trace, click-through checks and visible-error sweep are present under `output/qa/pdm-candidate-submit-modal-recovery/<runId>/`.
- P0/P1/P2 are 0, or any retained P2 has an explicit accepted disposition. Missing any real-operation or cleanup evidence means `未充分驗證`, not PASS.
## 2026-08-09 QA Reopen — Candidate Bundle Submit Modal (DEV-059)

Focused current-route recovery is now verified by AI in the browser. The candidate drawer remains open while `X`, `返回檢查`, and `Escape` each remove only the topmost confirmation modal; hard reload, back/forward, candidate switching, and 1440×900 / 1024×768 / 390×844 viewport checks do not resurrect the modal or produce horizontal overflow. Evidence: `.ai-doc/qa/DEV-059-real-operation-evidence-2026-08-09.md` and `npm run qc:dev-059:candidate-submit-modal-ui` (7/7).

The parent delivery point remains release-gated because the shared candidate was intentionally not mutated. Isolated number-state flow/integration suites cover submit-lock, withdraw-unlock, rollback and idempotent replay; an isolated disposable UI mutation run is still required before restoring the parent `DEV-057` full QA/QC PASS.
