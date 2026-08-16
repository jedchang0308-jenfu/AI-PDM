# QA-DEV-072：PDM 明細動作可發現性與鎖定提示 AI 真實操作驗證計畫

Status: `Local RD/QA/QC Complete / AI Real-operation QC Passed / Human Confirmed / Production Release Gated`
Date: 2026-08-14
Owner: QA
Related DEV: `DEV-PDM-DETAIL-ACTION-DISCOVERABILITY-001` / `DEV-072`
Authority: `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`（2026-08-14 DEV-072 amendment）
Parent architecture: `DEV-067` / `UnifiedPdmEntityDetailDrawer`

## 1. 驗證目的與邊界

本計畫驗證圖號、料號、圖料根號及由審核工作台進入的 owner detail，在同一 `ContextActionBar` 中遵守以下契約：

1. 對目前 owner surface 與 lifecycle **適用**的動作固定可見；尚不能執行時以低色階鎖頭與 disabled 語意保留。
2. 不適用、永久終結或屬於其他 domain 的動作完全不渲染、不留空位、不放入「更多」。
3. disabled reason 不常駐佔用 drawer；桌面 hover、鍵盤 focus、觸控點擊鎖頭皆能開啟同一短提示。
4. 每個情境最多一個 primary CTA；解鎖只改變渲染與操作能力，不搬移按鈕位置。
5. client 不猜權限或生命週期；`pdm-entity-detail.v2` server action resolver 回傳 applicable actions、enabled、exact disabled reason、group/order 與 discriminated execution；locked action的execution必須為null。
6. disabled action 的滑鼠、鍵盤與 direct API 旁路均不得造成 navigation、request 或資料異動；enabled mutation 仍由 domain server authority 重新驗證。

這是本機 Medium-risk UI／contract 驗證。QC 不連 staging／production、不操作正式資料、不執行 live migration、deploy、merge、PR 或 release。

## 2. 角色與職責

- **RD**：依 DEV-072 契約實作 action catalog、server resolver、共用 action control／tooltip 與 responsive footer，先完成 focused self-check。
- **QA**：維護本計畫、fixtures、期望結果、FMEA 與 evidence schema；不得用 source scan 取代 UI 證據。
- **QC AI**：在真實 Chromium rendered surface 上逐案操作、hover、focus、touch、送審、撤回與審核決策；QC 階段只驗證與收證，不修改產品程式或文件。
- 任一 P0/P1 失敗回送 RD；修復後由新的 run ID 完整重跑受影響 case 與相鄰回歸。

## 3. 必要測試資料與 actor

所有可異動案例使用每次 run 建立、完成後清理的 disposable SQLite fixture；若補 PostgreSQL semantic evidence，也只能使用 disposable non-production database。

| Fixture / actor | 必要資料狀態 |
|---|---|
| `ACT-DRAW-BUILDING` | 圖號建立中，缺必要檔案，owner 可編輯但不可送審 |
| `ACT-DRAW-READY` | 圖號資料與必要檔案已齊，可送審 |
| `ACT-DRAW-REVIEW` | active review，owner data 已鎖定，submitter 可查看且依政策可撤回 |
| `ACT-DRAW-RELEASED` | 正式受控／已發布，可建立新版 |
| `ACT-PART-BUILDING` | 料號可編輯，圖面檔案與圖面新版動作不適用 |
| `ACT-ROOT-BUILDING` | 圖料根號可維護關係，具完整 Drawing／Part／Relation projection |
| `ACT-TERMINAL` | cancelled／history-only，mutation 永久不再適用 |
| `ACT-REVIEW-READY` | exact assigned reviewer 可核准、補充資料或退回修改 |
| `ACT-REVIEW-DRIFT` | snapshot drift，decision actions 適用但全部鎖定 |
| `ACT-NO-PERMISSION` | 可讀 detail、缺 exact mutation permission |
| `ACT-NOT-OWNER` | 可讀 detail，但 owner-only action 不可執行 |
| `ACT-CROSS-COMPANY` | 同碼不同公司，用於 fail-closed 與資料隔離 |

Fixture manifest 必須記錄 run ID、actor、company、typed entity key、state family、applicable action keys、expected enabled keys、expected omitted keys、before hash、cleanup result；不得記錄 cookie、credential、storage key 或原始檔 bytes。

## 4. FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| 適用但未就緒的動作仍被隱藏 | resolver 只回目前 primary | 使用者不知道後續流程 | action inventory 與 DOM 對照 | P0 | `ACT-001..004` |
| 不適用動作被全域 catalog 汙染 | client 顯示全部 kinds | 按鈕牆、跨 domain 誤導 | owner surface negative matrix | P1 | `ACT-005..008` |
| disabled button 只有 `title` | native disabled 無 hover/focus | 鍵盤／觸控不知道原因 | hover/focus/touch 真實操作 | P0 | `ACT-009..011`、`ACT-017..019` |
| disabled action 仍送出 request | 只做視覺灰化 | 意外送審或修改資料 | network interception + DB hash | P0 | `ACT-011..012`、`ACT-018..021` |
| client 自行推測 permission/state | server action catalog 不完整 | 權限繞過或 UI/Server 不一致 | contract scanner + direct API negative | P0 | `ACT-006..012`、`ACT-024` |
| 多個 primary 或按鈕解鎖後換位 | client 依 enabled 排序 | 肌肉記憶失效、誤按 | before/after bounding boxes | P1 | `ACT-013..015`、`ACT-020..021` |
| tooltip 超出 drawer 或遮住動作 | portal/placement 未受控 | 原因不可讀、操作被擋 | 四 viewport screenshot/geometry | P1 | `ACT-017..019`、`ACT-029` |
| 審核者看到第二套 action body | approvals 重新組明細 | owner/reviewer 操作漂移 | owner route DOM/component count | P0 | `ACT-006..008`、`ACT-027..028` |
| tooltip 文案洩漏 permission code／API | raw server error 直出 | 使用者困惑、內部資訊洩漏 | visible text/error sweep | P1 | `ACT-024`、`ACT-029` |
| terminal 仍顯示無法再解鎖的 mutation | applicability 與 enabled 混用 | 永久灰色噪音 | terminal action inventory | P1 | `ACT-030` |

## 5. 契約與自動化驗證案例

| ID | 操作／檢查 | 預期結果 | 證據 |
|---|---|---|---|
| `ACT-001` | 讀圖號 building detail API | 只回一個 `detail:drawing:edit`，label 為 `圖面維護`，依資料與附件維護能力共同判斷可用；`submit_review` 保留但鎖定；尚未存在 review request 時 `view_review/withdraw_review` 必須省略 | response fixture |
| `ACT-002` | 讀圖號 ready detail API | `submit_review` 原位置 enabled 且是唯一 primary | response diff |
| `ACT-003` | 讀料號 detail API | 不回 `manage_files/create_revision/manage_relation` | omitted-key assertion |
| `ACT-004` | 讀圖料根號 detail API | 回 `manage_relation` 與其 workflow catalog；不搬入 Drawing file mutation | response fixture |
| `ACT-005` | 讀 terminal/history detail | 永久不再適用的 mutation 不回傳；只保留 history／refresh／safe return | response fixture |
| `ACT-006` | 讀 exact review context | owner catalog 保留；owner mutation 因 review lock 鎖定；allowed decisions 另加入 review group | response fixture |
| `ACT-007` | 讀 snapshot drift | allowed decisions 存在但 disabled，reason 指向資料不一致與恢復方式 | response fixture |
| `ACT-008` | non-assigned/cross-company/tampered request | 不提升 full review scope；不可由 client 參數取得 enabled decision | HTTP/field negative |
| `ACT-009` | 掃描 v2 action descriptor | 每個 disabled applicable action有exact reason/reasonCode/group/order、execution=null；每個enabled action有typed execution | contract assertion |
| `ACT-010` | 掃描 composer/API contract | schema是`pdm-entity-detail.v2`；client不含state/role/domain catalog、不以CSS隱藏、不含`primaryContextAction` override | source contract |
| `ACT-011` | disabled action mouse／keyboard event | 不導覽、不呼叫 command、不產生 network request | event/network log |
| `ACT-012` | direct command 於 stale/permission/review lock | server 再驗證並 fail closed | HTTP + DB hash |
| `ACT-013` | 同一 detail building → ready | action IDs/order 不變；只改鎖頭、tone、enabled | response/DOM diff |
| `ACT-014` | busy/submitting refresh | button 原位顯示 spinner、`aria-busy`，不得重複 mutation | DOM/network count |
| `ACT-015` | action priority matrix | actionable recovery > assigned review decision > owner lifecycle > safe return；最多一個 primary | matrix assertion |

`ACT-010` 另須證明 `UnifiedPdmEntityDetailDrawer` public props 已無 `primaryContextAction`，Drawing／Part／Relation／Approval owner route 均未以 client action 覆蓋 `GET /api/pdm/entity-details/[entityKey]` 的 `actionBar`；Drawing 清單列 action 可獨立保留，但不得注入 drawer。

`package.json` 必須提供以下 exact commands：

```text
npm run qc:dev-072:contract
npm run qc:dev-072:api
npm run qc:dev-072:browser
npm run qc:dev-072
```

RD 應新增以下精確 script value；未經 Dev PM 更新本計畫不得縮減 regression chain：

```json
{
  "qc:dev-072:contract": "node scripts/qc-dev-072-action-contract.mjs",
  "qc:dev-072:api": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-072-action-api.mjs",
  "qc:dev-072:browser": "node scripts/qc-dev-072-browser.mjs",
  "qc:dev-072": "npm run qc:dev-072:contract && npm run qc:dev-072:api && npm run qc:dev-067:contract && npm run qc:dev-067:policy && npm run qc:dev-067:query && npm run qc:dev-067:ui && npm run qc:dev-067:preview && npm run qc:dev-067:review && npm run qc:dev-067:lock && npm run qc:dev-067:navigation && npm run qc:dev-072:browser && npm run typecheck:app && npm run build:isolated"
}
```

aggregate順序固定為：contract → API/DB mutation → DEV-067 contract/policy/query/UI/preview/review/lock/navigation regressions → browser → `typecheck:app` → `build:isolated`。RD self-check可分段執行；QC結案必須跑aggregate或留下每段同一commit/dirty-hash的等價manifest。

## 6. AI 真實瀏覽器操作矩陣

QC AI 必須真的操作 rendered UI，不能只呼叫 Playwright assertion 或讀測試報告。每個 case 都要記錄 route、actor、fixture、viewport、操作步驟、可見結果、DOM action inventory、network mutation count 與 screenshot path。

| ID | 真實操作 | 預期結果 |
|---|---|---|
| `ACT-016` | 1440×900 開圖號 building drawer | 適用 workflow buttons 可見；不可用按鈕有低色階鎖頭；無跨 domain action |
| `ACT-017` | hover 鎖定送審 | 約 300ms 出現「尚缺必要資料／檔案」短提示；footer 不位移 |
| `ACT-018` | Tab 到同一鎖定動作 | focus 可見並出現同一提示；Enter/Space 不送 request |
| `ACT-019` | 390×844 點低色階鎖頭 | touch popover 顯示同一原因；第二次點擊仍不執行 action；Escape／外點可關閉 |
| `ACT-020` | 真實完成 disposable 必要檔案／資料 | 同一 drawer、同一 action ID 與位置解鎖；`送交審核`成為唯一 primary |
| `ACT-021` | 先取消送審 confirmation，再真實送審 | 取消為零寫入；確認後只建立一筆 request，owner data 鎖定，按鈕原位更新 |
| `ACT-022` | 審核中 hover `圖面維護` | 顯示「送審中不可修改；如需變更應先撤回」；沒有常駐 helper paragraph；不另回 `manage_files` |
| `ACT-023` | submitter 真實撤回 disposable review | server 解除 lock；同一 drawer 重新載入，編輯重新可用，決策 action 消失 |
| `ACT-024` | 缺權限 actor 開相同資料 | 適用動作可見鎖定；tooltip 是人類化原因與聯絡角色，不顯示 raw API/stack |
| `ACT-025` | 料號 drawer 逐一盤點按鈕 | 沒有管理圖面附件、建立圖面新版、維護圖料關聯或摘要操作連結 |
| `ACT-026` | 圖料根號 drawer 逐一盤點 | 關聯維護適用；完整 projections 可讀，但不複製 Drawing／Part mutation catalog |
| `ACT-027` | 審核工作台點 Drawing／Part／Relation request | 進 canonical owner route；一個 unified drawer；Approval owner action bar 不重複顯示 `查看審核`、`撤回送審`，Relation 也不顯示 `維護圖料關聯`；保留 request decisions 與 safe return；無 approval-only body |
| `ACT-028` | exact reviewer 依各 domain policy 真實做 `return_for_correction`／`reject`／`approve` disposable cases | 只呈現且執行該 request 真正允許的 decision；各只送一次；成功後依 `returnTo` 回原 inbox filter/page/selection；三個 owner workflow entry 維持省略 |
| `ACT-029` | 1024×768、768×1024、390×844 逐一 hover/focus/touch | tooltip/popover 不超出 viewport、不遮 primary、無水平 overflow／裁切／重疊 |
| `ACT-030` | terminal/history record | mutation buttons 完全不存在；history/return 可操作；沒有無法再解鎖的灰色按鈕牆 |

至少保存下列畫面：Drawing building、Drawing ready、Drawing in-review、Part、Relation、review decision-ready、review drift、no-permission、terminal，以及 390×844 touch tooltip。

## 7. 真實 mutation 安全程序

1. runner 建立 `DEV072_<runId>` disposable company／actors／Drawing／Part／Root／review fixtures並記錄 before hash。
2. browser 使用真實登入 session 開啟固定 local URL，不 mock React component、不以靜態 HTML 取代。
3. disabled cases 開始 network recording；hover/focus/tap/Enter/Space 後 mutation request count 必須為 0，DB hash 不變。
4. enabled submit case先開 confirmation再取消，證明 0 write；第二次確認後驗證 exactly one active request、snapshot與lock。
5. withdraw、needs-info、reject、approve 分別使用獨立 disposable request，避免案例互相汙染。
6. 每個 mutation 後 hard reload owner route與 return route，驗證 server truth、button state、selected row及 safe return。
7. cleanup 刪除本 run fixture並輸出 removed count；清理失敗則整輪標記 `BLOCKED`，不得留下未分類測試資料。
8. manifest 必須明示 `productionConnection=false`、`productionWrite=false`。

## 8. Visible Error、資訊噪音與可及性 Gate

每個 critical route 與 viewport 都必須檢查：

- `.inline-error`、`[role=alert]` 非預期錯誤、可見 HTTP 4xx/5xx、`Not Found`、`Internal Server Error`、`/api/` route text皆為 0。
- console error、pageerror、failed request、非預期 4xx/5xx 為 0；預期 negative request需記錄 case ID與人類化 UI 結果。
- disabled reason 不常駐重複於 button 下方、狀態卡或 projection；同一原因只有 tooltip/popover 主位置。
- 鎖頭是低色階，但文字、邊框與 focus ring仍可讀；顏色不是唯一訊號。
- tooltip trigger 有 accessible name、`aria-disabled`／等效 disabled semantics與 `aria-describedby`；可由 hover、focus、touch取得。
- tooltip 最多兩行、無互動連結、Escape 可關閉；dialog／drawer focus 與原清單 focus restore 不回歸。
- 每個情境最多一個 `.primary-button` lifecycle action；danger action不與 primary 混淆。

## 9. 必要證據與輸出位置

固定輸出根目錄：

```text
output/qa/dev-072-pdm-action-discoverability/<runId>/
```

每輪至少包含：

- `run-manifest.json`：commit/dirty hash、run ID、route、viewport、actor、fixture、case result、production flags、cleanup。
- `action-contract.json`：每個 surface/state 的 expected/actual applicable、enabled、omitted、primary、order。
- `screenshots/`：初始、tooltip open、解鎖前後、review、terminal、responsive。
- `dom-metrics.json`：action IDs、labels、group/order、bounding boxes、lock icons、ARIA、overflow、scroll owner。
- `interaction-log.json`：hover/focus/touch/keyboard/click、confirmation、returnTo與 active element。
- `console-network.json`：console/page errors、all requests、mutation count、expected negative responses。
- `data-before-after.json`：hash、request count、lock state、decision、cleanup。
- `visible-error-sweep.json`：route/viewport/timestamp/error text與 PASS/FAIL。
- `defects.md`：只有觀察事實、重現、預期、影響、證據，不在 QC 階段直接修碼。

## 10. 通過、失敗與停止條件

**通過**：`ACT-001..030` 全部有可重跑證據；AI 真實 rendered-browser 親自操作完成；所有 disabled action 零 request／零 write；所有 enabled mutation經 server驗證且 exactly-once；四 viewport 無 overflow、裁切、重疊或 tooltip 越界；visible/console/network unexpected error為0；P0/P1 defect為0。

**未通過**：任一適用動作被隱藏、不適用動作顯示、tooltip無法由 hover/focus/touch取得、鎖定 action可觸發 request、primary超過一個、按鈕解鎖換位、review出現第二套 body、returnTo失真或主要 viewport破版。

**未充分驗證**：只有 unit/source/API/build evidence，缺真實 browser 操作、tooltip開啟截圖、disabled零 request證據、before/after資料或 viewport矩陣。

**停止並回 Dev PM**：實作需要 schema/migration、改變既有 permission/approval decision authority、讓 client 決定 applicability、建立跨 domain mutation service、把不適用 action payload 全回 client後以 CSS 隱藏、連 production/staging、或無法用 disposable fixture安全完成真實 mutation。

## 11. 2026-08-14 Final Execution Result

- Result：`PASS`；本機 Phase 1A～1D 完成，P0/P1=0，production release維持 gated。
- Aggregate final run：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T050039Z-113d57e2/run-manifest.json`；`source`含實際HEAD `cc393e048b251fb1ea3356204de56bc4c9eacc45`、branch、scoped dirty/content SHA-256與19個來源檔清單。
- Browser evidence：21/21 runner cases、13 screenshots、12/12 visible-error sweeps、0 console/page error、0 unexpected 4xx/5xx；1440×900、1024×768、768×1024、390×844 全通過。
- Negative authority evidence：stale direct submit回409、唯讀 Manufacturing direct submit回403；兩者各一個 expected-negative request且 domain state before/after相同。
- Mutation evidence：confirmation cancel=0 write；submit、withdraw、needs-info、reject、approve各 exactly once，決策各用獨立 disposable copy並依 `returnTo` 返回。
- Cleanup：8 個暫存目標移除，temporary root removed=true；manifest明示 `productionConnection=false`、`productionWrite=false`。
- Aggregate：`npm run qc:dev-072` PASS，包含 DEV-067 regressions、TypeScript及isolated production build。完整QC結論見 `.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`。
- Runner reliability：completion re-audit曾產生失敗run `DEV072-20260814T045044Z-aca7a0c1`，原因是Windows開啟Next自動管理的`next-env.d.ts`時發生transient lock；該次未被計為PASS。runner已只對此已知鎖檔錯誤做最多三次啟動重試，後續focused與aggregate run皆通過。

### 11.1 Approval owner drawer follow-up

- 變更：在 Approval owner context（server `review` receipt 存在）省略 `view_review`、`withdraw_review` 與 Relation `manage_relation`；保留 request decisions、`return`、projection、preview、snapshot 與既有 command authority。
- AI 真實瀏覽器證據：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T053707Z-e58c6459/run-manifest.json`；21/21 cases PASS，包含五個 action/display omission assertions、三種 decision exactly-once、四 viewport 與 cleanup。
- RD self-check：`npm run qc:dev-072:api`、`npm run qc:dev-072:contract`、`npm run typecheck:app` PASS；未連接 production/staging，未執行 release。

### 11.2 Drawing maintenance entry merge follow-up

- Decision：`編輯圖面資料` 與 `管理圖面檔案` 僅在 UI/action catalog 層合併為單一 `detail:drawing:edit`，可見 label 固定為 `圖面維護`。此入口進入同一 `DrawingProjection`，同時提供基本資料、自動 3D／2D 預覽、版本與附件、受控補檔表單及關聯料號。
- Authority boundary：主資料保存與附件上傳仍是兩個獨立 backend mutation boundary；任一 mutation 失敗不回滾另一者。附件類別仍由 server-side 自動偵測，UI 不提供人工 3D／2D 類別選擇。若資料或附件維護能力任一缺少，合併入口整體以低色階鎖定並以 tooltip 說明，避免進入後出現未授權控制。
- Implementation files：`src/lib/pdm-detail-action-resolver.ts`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/components/drawing-projection.tsx`、`src/components/master-attachment-panel.tsx`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-dev-072-browser.mjs`。
- Focused browser evidence：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T110623Z-5ad38d84/run-manifest.json`；AI Chromium 實際通過 desktop／laptop／tablet／mobile action inventory，確認圖面只出現 `detail:drawing:edit` 且不再輸出 `detail:drawing:manage_files`；`ACT-016-018-desktop` 進入維護入口並完成補檔表單可見斷言；`ACT-022` 確認審核中唯一入口顯示 `圖面維護` 並鎖定。
- Verification：`npm run qc:dev-072:contract`、`npm run qc:dev-072:api`、`npm run typecheck:app`、`git diff --check` PASS。完整 browser runner 後段既有 approval fixture 仍有 404／等待逾時，因此本 follow-up 不宣告新的 aggregate 21/21；既有已通過 baseline evidence 仍保留作為 DEV-072 原始交付證據。
