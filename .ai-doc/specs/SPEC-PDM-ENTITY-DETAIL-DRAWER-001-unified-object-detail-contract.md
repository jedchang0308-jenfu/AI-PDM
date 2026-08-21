# SPEC-PDM-ENTITY-DETAIL-DRAWER-001 - 圖號 / 料號 / 圖料根號統一物件詳情抽屜

Status: Phase 1C Unified Drawing Workspace Implemented Locally / Independent QC Passed; `DEV-067 UnifiedPdmEntityDetailDrawer Local RD Implemented / Local QA-QC Passed`; `DEV-072 Local RD/QA/QC Complete / Human Confirmed`; `DEV-079 RD Implemented Locally / Focused Contract + Browser Evidence / Independent QC Pending`; `DEV-083 RD Implemented / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition`; Production Release Gated
Date: 2026-07-09; amended 2026-08-20
Owner: Dev PM
Related DEV: `DEV-PDM-ENTITY-DETAIL-DRAWER-001` / `DEV-039`; `DEV-PDM-DRAWING-WORKBENCH-SIMPLIFICATION-001` / `DEV-057`; `DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001` / `DEV-067`; `DEV-PDM-DETAIL-ACTION-DISCOVERABILITY-001` / `DEV-072`; `DEV-PDM-DRAWING-READONLY-DRAWER-FULLPAGE-EDITOR-001` / `DEV-079`; `DEV-PDM-PART-RELATION-READONLY-DRAWER-FULLPAGE-EDITOR-001` / `DEV-083`; `DEV-PDM-STATUS-DATA-REBUILD-001` / `DEV-087`
Related ADR: `.ai-doc/decisions/ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001-composer-and-policy.md`
Related QA: `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`; `.ai-doc/qa/qa-dev-067-unified-pdm-entity-detail-validation-plan-2026-08-12.md`; `.ai-doc/qa/qa-dev-072-pdm-action-discoverability-ai-real-operation-validation-plan-2026-08-14.md`; `.ai-doc/qa/qa-dev-079-drawing-readonly-drawer-fullpage-workspace-validation-plan-2026-08-19.md`; `.ai-doc/qa/qa-dev-083-part-relation-readonly-drawer-fullpage-workspace-validation-plan-2026-08-20.md`
Extends: `.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md`
Extends: `.ai-doc/specs/SPEC-PDM-MASTER-WORKBENCH-001-drawing-part-master-layout.md`
Extends: `.ai-doc/specs/SPEC-PDM-DRAWING-PART-RELATION-VIEW-001-root-drawing-part-relation-list.md`
Extends: `.ai-doc/specs/SPEC-PDM-NUMBERING-004-contextual-numbering-lifecycle-entrypoints.md`

## 2026-08-22 DEV-087 Target-State Amendment - 極簡唯讀抽屜與受控狀態動作

Status: `RD Implementation Ready (RD Supervisor Reviewed) / Human Confirmed / DEV-087 activation only`.

本節只在DEV-087 canonical state啟用時取代既有status/action composition；啟用前現有DEV-083 runtime仍是baseline。本節不重構Drawing現有full-page editor，也不新增角色／permission code。若舊drawer/status/action規則與本節衝突，以本節為主；activation時拆除舊composition與fallback，不保留雙軌相容。

### 固定資訊與章節

三domain drawer固定順序：`主識別／品名／處理狀態` → `主要內容／預覽` → `直接關聯` → `受阻資訊（條件式）` → `歷史版次（Drawing only）` → `動作區`。

- Drawing顯示exact revision、2D/3D、受控檔、直接關聯與歷史版次。Part沒有版次／歷史；Relation沒有root版次／歷史／共同檔案。
- 可見處理文字只可為`負責人處理／審核負責人處理／系統處理／系統管理員處理／受阻`，正常留空；不得依viewer改成你我他或姓名。
- `system_admin`只顯示`請系統管理員處理`；`blocked`只顯示一項人類原因。兩者都沒有恢復／處理假CTA。
- branch/source/predecessor、raw status、package/baseline/workflow/approval、人名與日期不進drawer、DOM accessible name、tooltip或popover。

### 主要 action、受控風險 action 與 server descriptor

| Row/state | Server-authorized action | 無權限或不適用 |
|---|---|---|
| Drawing production，open branch `<3` | `進版`→server target modal | 隱藏；達3個時停用並顯示`已有 3 個研發分支，請先完成其中一個` |
| Drawing RD mutable work | `進行編輯` | 唯讀、無action |
| Drawing RD review，exact reviewer | `前往審核` | 其他viewer唯讀、無action |
| Drawing RD idle | 主要 `進版`→同branch target modal；次要風險 `申請作廢`→確認後送審 | 隱藏 |
| Part formal／Relation formal，無work | `建立修改／建立調整` | 隱藏 |
| Part／Relation mutable work | `進行編輯` | 唯讀、無action |
| Part／Relation review，exact reviewer | `前往審核` | 其他viewer唯讀、無action |
| system／system_admin／blocked | 無 | 只顯示狀態／原因 |

open Drawing branch上限為3，包含active與approved-idle；這是server/transaction authority，不以UI count判定。Manufacturing可在同公司清單／drawer看到production與所有最多3個current RD rows，但沒有create/edit/submit/cancel/review action。Owner可依action permission處理自己的work；具`hasPdmNonOwnerEditScope`且通過action permission與lifecycle gate的同公司使用者可處理非本人work；exact reviewer只在canonical request route決定；其他non-owner唯讀；cross-company／未授權不得hydrate drawer或artifact。

### target modal、editor與return

- list/page只擁有開drawer；drawer通常只擁有一個主要navigation action。Drawing RD idle 是唯一例外：除主要`進版`外，可有一個視覺降階、與主要動作分離的風險 action `申請作廢`；target／confirmation modal擁有最後選擇與confirm，modal開啟時底層inert。
- production `M`由server提供`M+1`與最小未占用RD `M.n`；RD `M.n`提供大於`n`的最小未占用minor，且branch base仍current時才可提供`M+1`。stale branch只可續minor，顯示`量產基準已更新，這個研發分支只能繼續研發版`。
- server原子建立／沿用branch、claim、work、canonical row成功後才導航exact full-page editor。Drawing沿用現有獨立編輯器；Part／Relation維持各自domain editor。
- 操作超過5秒顯示進行中並防重送；失敗保留modal、focus error summary且無partial create。取消／Escape回原drawer row並恢復focus/scroll；drawer body與modal body各自是唯一scroll owner。
- reviewer route可與owner route不同，但必須使用相同domain editor components、data及layout的fully-readonly模式。Part review attachment依DEV-084保持live，附件區顯示`附件獨立維護，不屬於本次資料核准`；此note不進一般drawer。
- `申請作廢` 只在 open、idle、latest approved RD 且無active work／pending void request時顯示。確認文案為`核准後，研發版 {revision} 將不再有效，這一系列研發版會從目前清單移除，且無法復原`；核准並formalize後關閉整個branch、移除current row並釋放branch cap，不提供reopen或restore入口。退回修改則結束本次request並恢復idle open。

本節由DEV-087 `QA-087-048..054、078、080、082、083、085、093、094、101..107、110、115..120`驗收。

## 2026-08-20 DEV-083 RD Implementation Contract - 料號／圖料唯讀抽屜與完整 URL 編輯工作區

Status: `RD Implemented / Human Confirmed / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Affected Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition / Production Release Gated`.

Execution Boundary：本節已完成並在本機落實083-A～D；focused contract/API、isolated build、disposable authenticated browser與disposable mutation已取得PASS。最新browser evidence為22 runner checks／三viewport／zero-write network，manifest `output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`；最新mutation evidence `output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json` 以disposable SQLite＋Chromium完成31/31 result rows PASS、cleanup=removed，驗證candidate lifecycle／recovery、Part variant、Part／Drawing／Relation Engineer owner/non-owner與Manager／Admin同公司正向、Manufacturing fail-closed、cross-company denial、Relation五種操作與reviewer `needs_info`／reject／approve／scope denial／snapshot drift／retry的exactly-once、readback、audit，已直接關閉QA-083-11/12/13/17/18/19。另修正candidate cancel payload邊界、server actionBar gate封住Part unauthorized write controls、審核 retry request 的JSON content type、safe-return hydration wait、Windows disposable cleanup tolerance，並在既有Part attachment與Drawing revision upload route補same-company resource guard，封住cross-company route intent寫入。最新完整aggregate manifest `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為30 child／29 PASS／1 DEV-072 parent baseline FAIL（`accepted-superseded`）；DEV-072 runner另已將readiness probe每次2秒可取消、legacy marker wait限縮5秒，保留舊expected而避免過時基準無界掛住。DEV-067 parent browser最新manifest `output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json`為18/18、browserErrors=0、failedResponses=0，已解決responsive candidate marker baseline。DEV-072 bounded manifest `output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留fixture／cleanup與obsolete marker觀測；DEV-079 contract 22/22、layout 3/3與recognition layout 3/3承接現行readonly drawer／canonical full-page replacement，原始failure與expected均保留並標記`accepted-superseded`；2026-08-20 QC disposition 已接受該replacement並關閉QA-083-24。`typecheck:app`、affected lint、isolated build、DEV-070 browser與DEV-079 contract均已在目前工作樹重跑PASS。QA-083-01～24已具備closure evidence；不得自行 stage、commit、merge、PR、deploy、release、修改 production／shared data，或擴張到未列檔案、Drawing 重構、schema、permission、lifecycle 與新 write API。

### 問題、效用與核心流程

圖號工作台已把「清單中快速閱讀」與「完整編輯任務」分流，但料號與圖料工作台仍在 candidate、formal、legacy、unified 與 approval drawer 內保留寫入。這使三個工作台的使用者心智模型不一致，並讓 drawer 同時承擔查閱、表單、檔案、關聯維護、送審、撤回與審核決策，增加誤操作、長表單捲動、返回脈絡遺失與同一 command 多入口的成本。

```text
料號／圖料／審核清單 -> 右側唯讀 drawer -> 一個狀態導向 navigation CTA
                     -> 同分頁、可定址的 canonical full-page workspace
                     -> domain action owner／必要確認 -> 完成或取消
                     -> 安全返回原清單、篩選、頁次、選取與焦點
```

效用判斷：多一次可預期導覽的固定成本，換取一致肌肉記憶、完整編輯空間、可分享／reload／back-forward 的 URL、drawer zero-write 與單一 command placement。Part 主資料、Relation 關聯與 Approval decision 都是低頻、高投入或高風險任務，淨效用為正。批判性限制是：只統一**任務模式、頁面 mechanics 與 action ownership**，不統一 domain editor；若為此建立大型泛型工作台，方案即失去優雅性。

### Human-confirmed decisions 與契約解讀

1. Part／Relation drawer 以快速閱讀為唯一責任，必須 zero-write；只保留預覽、複製、下載、唯讀摘要與最多一個主要 navigation CTA。
2. 所有 Part／Relation 編輯使用同分頁完整 URL，支援 hard reload、browser back／forward、安全 `returnTo` 與未儲存離開保護；不用 fullscreen modal，也不自動開新分頁。
3. 同一 candidate aggregate 只有一個 canonical workspace URL：`/numbering/workspaces/[workspaceId]`。Part／Relation 入口可使用安全 anchor 聚焦不同區段，但不得建立兩個 candidate URL 或兩份 editor。
4. formal Part 使用 `/parts/[partId]/workspace`；formal Relation root 使用 `/numbering/relations/[rootId]/workspace`。route identity 使用穩定 ID，不使用可變 display code；query／anchor 只表達 intent、focus 與 return context，不解鎖權限。
5. Drawing 現行 `/numbering/drawings/[drawingId]/workspace` 不在本 DEV 重構範圍；先保護已完成且仍待獨立 QC 的工作面。
6. 契約解讀：`drawer zero-write` 包含由 `/approvals` 開啟的 Part／Relation 審核 drawer。否則 `UnifiedPdmEntityDetailDrawer` 仍須保留 command runner，會破壞單一 action owner；因此既有 `/approvals/[requestId]` 擴為 Drawing／Part／Relation 共用 reviewer workspace，但審核 API、exact reviewer、company、audit 與 decision authority 不變。

### Spec Impact 與 ADR 判定

Spec Impact Preflight：`Intentional replacement + compatible preservation`。

- 取代：`DEV-079` 將 Part／Relation drawer 全面唯讀列為 Out of Scope；`DEV-072` 允許 Part／Relation／Approval owner drawer 執行 `command`；`DEV-067` 將 `ContextActionBar` 同時視為 drawer command placement 的部分。
- 保留：`DEV-062` 小型 mechanics core＋domain adapters、`DEV-067` composer＋domain-owned projections＋server policy、`DEV-072` applicable／locked／omitted action truth、`DEV-081` supervisor/admin capability，以及既有 schema、資料 owner、command API、permission、lifecycle、approval、audit、concurrency 與 idempotency authority。
- ADR：不新增。修訂既有 `ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001`，把 composer 的終局責任收斂為 read-only drawer；full-page frame 是既有 `ADR-PDM-WORKBENCH-CORE-001` 的 compatible mechanics extension，不是新 data／command owner。若後續要求共用 domain editor、persistent cross-page draft state 或新的跨 domain command service，才重新進入新 ADR 判定。

### Current Architecture Impact（2026-08-20 repository audit）

1. `part-workbench.tsx` 與 `relation-workbench.tsx` 的 candidate detail 直接掛載 `WorkspaceDrawer`；drawer 內的 `NumberingCandidateRevisionEditor`、workspace edit form、送審、撤回、發布／取消與確認 modal 仍可寫入。
2. `UnifiedPdmEntityDetailDrawer` 對 Part／Relation navigation action 會原地打開 maintenance panel，並對 candidate lifecycle、approval decision、withdraw、cancel、retry 等 descriptor 執行 command；只有 Drawing 已 fail closed 為 navigation-only。
3. formal Part 的 unified path 由 `PartProjection` 直接 `PUT /api/parts/[partNumber]/variant`；legacy `PartDetailPanel` 另有附件、variant save 與 contextual lifecycle actions，形成兩個可寫 drawer branch。
4. formal Relation 的 unified `RelationProjection` 與 legacy `RelationMaintenancePanel` 都可呼叫 `POST /api/numbering/relations`；root／part／drawing contextual actions也仍掛在 drawer。
5. `/approvals` 對非 Drawing request 仍在 drawer 執行 approve／needs-info／reject；`/approvals/[requestId]` 目前只解析 Drawing target 與 Drawing projection。
6. `PdmEntityDetailService` 對 Part／Relation 的 `ownerHref` 仍回 list＋`detail` anchor；`normalizePdmSurfaceReturnTo` 只有 Drawing／Approval allowlist，Part／Relation 暫以 Approval fallback 處理。
7. Part／Relation workbench 已共用 `usePdmWorkbenchController`，但仍使用 memory-only cursor history，`readLocation`／`writeLocation` 未保存 cursor／page；離開到 full page 後不能保證回到同一頁次。
8. 現有 read BFF、entity detail projection、workspace、Part、Relation 與 Approval command routes足以承接本 DEV；預期不需要 schema、migration、新 permission、新 lifecycle 或新 write API。

9. legacy `NumberStateWorkspaceWorkbench` 也直接掛載同一個可寫 `WorkspaceDrawer`；只改 `PartWorkbench`／`RelationWorkbench` 會留下 flag-off candidate drawer write path。083-D 必須把這個 legacy mount 與新版兩個 mount 同次改為 read-only navigation。

### Implementation baseline 與 dirty-worktree boundary

以下表格保留實作前／早期回歸快照，供dirty-worktree與變更歸因追溯；current evidence reconciliation以本節後段與QA plan §5的最新manifest為準，不得把早期aggregate數字當作目前完成度。

Baseline captured at `2026-08-20 Asia/Taipei`，branch=`持續優化2`，HEAD=`050eedd4fe963d0f225820facec8d221a1df76ce`。本輪未啟動 app／test server，未建立臨時 runtime，未寫產品程式。

| Result | Pre-implementation command／finding |
|---|---|
| PASS | `typecheck:app`; `qc:dev-062:core`; `qc:dev-062:part`; `qc:dev-062:relation`; `qc:dev-062:compat`; `qc:dev-067:contract`; `qc:dev-067:ui`; `qc:dev-067:navigation`; `qc:dev-072:contract`; `qc:dev-072:api`; `qc:dev-079:contract`; `qc:master-attachments` |
| Existing FAIL | `qc:dev-067:review`：`review receipt matches target type/id pairs`; `qc:pdm-entity-detail-drawer`：Drawing pending approval projection assertion；`qc:pdm-approval-platform`：Phase 1C-C Drawing pending badge assertion |
| Correctly blocked | `qc:pdm-drawing-part-relation-view` 拒絕使用受保護的 `data/ai-pdm.sqlite`；最終驗證必須以 disposable `PDM_DATA_DIR` 與同一 isolated server 重跑 |
| PASS | `qc:dev-083:contract`; `qc:dev-083:api`; `qc:dev-083:mutation`; affected `lint`（0 errors／14既有warnings）；`build:isolated`；最新 authenticated Chromium disposable run 22/22 runner checks，browserErrors=0、failedResponses=0、mutationRequests=0，browser evidence=`output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`；mutation evidence=`output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`（31/31 result rows PASS、QA-083-11/12/13/17/18/19，含Engineer owner/non-owner與三domain Manager／Admin／non-editor／company partition） |
| Parent baseline / gate disposition | latest completed aggregate `output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為30 child／29 PASS／1 DEV-072 parent baseline FAIL；DEV-067 browser已由最新parent runner 18/18 PASS解決；DEV-072保留FK／cleanup與bounded obsolete marker的歷史failure，依DEV-079 contract 22/22、layout 3/3、recognition layout 3/3標記`accepted-superseded`，未改expected、不歸因DEV-083；`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`已記錄可追溯QC disposition，QA-083-24已關閉，不得把舊runner failure改寫成PASS |

`qc:dev-067:ui`目前通過的是「editable candidate drawer」歷史 expected；083-D 已以新 zero-write contract替換candidate mount，該歷史expected不得作為DEV-083證據。最新`qc:dev-067:browser`已改為接受現行candidate readonly marker與canonical reviewer route並18/18 PASS。DEV-072舊action-discoverability runner的FK fixture與obsolete marker failure仍須保留、重現與個別歸因；DEV-079 replacement evidence只能支援`accepted-superseded`，不得藉改expected把舊runner改成PASS。

工作樹已有大量使用者／其他DEV變更。下列direct-edit tracked檔目前已有pre-existing hunks：`package.json`、`src/app/api/pdm/entity-details/[entityKey]/route.ts`、`src/app/approvals/page.tsx`、`src/app/globals.css`、`src/app/numbering/search/page.tsx`、`src/components/number-state-workspace.tsx`、`src/components/part-detail-content.tsx`、`src/components/part-projection.tsx`、`src/components/part-workbench.tsx`、`src/components/relation-workbench.tsx`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/lib/part-workbench.ts`、`src/lib/pdm-approval-owner-route.ts`、`src/lib/pdm-detail-action-resolver.ts`、`src/lib/pdm-entity-detail.ts`、`src/lib/pdm-review-navigation.ts`、`src/lib/relation-workbench.ts`；`src/components/approval-request-workspace.tsx`為pre-existing untracked檔。test boundary另有dirty `scripts/qc-dev-062-relation-workbench.mjs`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-pdm-entity-detail-drawer.mjs`、`scripts/qc-pdm-numbering-approval-review-ui.mjs`，以及untracked `scripts/qc-dev-079-contract.mjs`。

RD在每個direct-edit檔第一個patch前必須保存`git diff -- <file>`或untracked全文作hunk ledger；只增加DEV-083可歸因hunk，不得格式化、回復、覆蓋或把pre-existing變更計入本DEV。若必要改動與既有hunk無法隔離、new path已被其他工作建立、或測試需要改動未列檔案，立即停止回Dev PM；不得用checkout/reset、whole-file rewrite或放寬測試解衝突。stage／commit未授權。

### Exact direct-edit source inventory（28 files）

新增8個source：

| File | Exact responsibility |
|---|---|
| `src/app/numbering/workspaces/[workspaceId]/page.tsx` | thin async route；解析stable ID／search params並掛載單一candidate editor |
| `src/app/parts/[partId]/workspace/page.tsx` | thin formal Part route；不在page組mutation |
| `src/app/numbering/relations/[rootId]/workspace/page.tsx` | thin formal Relation route；不在page組mutation |
| `src/components/pdm-edit-page-frame.tsx` | mechanics-only frame；return、identity/status、failure、unsaved guard、focus、responsive與action dock slots |
| `src/components/numbering-workspace-editor.tsx` | candidate唯一write owner；搬入既有edit/file/lifecycle/confirm邏輯，不複製command |
| `src/components/part-workspace-editor.tsx` | formal Part唯一write owner；stable-ID read、variant、attachment與contextual actions |
| `src/components/relation-workspace-editor.tsx` | formal Relation唯一write owner；stable-ID read、impact／relation commands與lock recovery |
| `src/components/relation-workspace-content.tsx` | 從2900+行route抽離domain-owned root/tree/matrix/read-only／workspace presentation；不是shared core |

修改20個既有source：

| File | Required delta |
|---|---|
| `src/components/number-state-workspace.tsx` | `WorkspaceDrawer`收斂／改名為`WorkspaceReadonlyDrawer`；移除editor、form、submit／withdraw／publish／cancel與confirm props；legacy workbench只read＋navigate；create完成導向single candidate URL |
| `src/components/part-workbench.tsx` | 移除candidate update/action/confirm owner；candidate/formal都只開read-only drawer；序列化cursor/page並使用bidirectional mode |
| `src/components/relation-workbench.tsx` | 移除candidate、relation、impact與contextual mutation owner；read-only drawer；序列化cursor/page並使用bidirectional mode |
| `src/components/part-detail-content.tsx` | `PartDetailPanel`改用discriminated presentation；drawer分支附件／variant／contextual全唯讀，workspace分支才掛write |
| `src/app/numbering/search/page.tsx` | legacy formal drawer使用抽出的read-only Relation content；移除drawer relation／contextual write callback |
| `src/components/part-projection.tsx` | 刪除local variant form、PUT與maintenance props，固定為read projection |
| `src/components/relation-projection.tsx` | 刪除POST、maintenance form與write callback，固定為read projection |
| `src/components/unified-pdm-entity-detail-drawer.tsx` | 刪除`PendingCommand`、command fetch/dialog、Part／Relation maintenance state與write callbacks；只執行read/local/navigate action |
| `src/app/approvals/page.tsx` | PDM owner row的drawer全面read-only且decision導向reviewer URL；非PDM approval既有detail authority不變 |
| `src/components/approval-request-workspace.tsx` | 由Drawing-only改為server owner context組合Drawing／Part／Relation full projections；projection成功前不hydrate；decision仍用既有API |
| `src/lib/pdm-review-navigation.ts` | 以closed pathname set建立candidate／Part／Relation／Drawing／Approval normalizer；保留既有export相容性 |
| `src/lib/pdm-approval-owner-route.ts` | 所有PDM owner approval統一產生`/approvals/[requestId]?returnTo=...`，保留target context resolver |
| `src/lib/pdm-detail-action-resolver.ts` | Part／Relation／review mutation descriptor改為canonical navigate／locked／omitted；每狀態最多投影一個主要mutation navigation；Drawing規則不改 |
| `src/lib/pdm-entity-detail.ts` | Part／Relation ownerHref改stable-ID canonical pages；candidate共用single route；review一律exact request route；surface fallback正確化 |
| `src/app/api/pdm/entity-details/[entityKey]/route.ts` | 傳入真實Part／Relation／review surface return context，不再把non-Drawing一律fallback到Approval |
| `src/lib/part-workbench.ts` | query增加signed cursor direction/pageIndex；response產生previous/next cursor與bounded pageIndex |
| `src/lib/repositories/part-workbench-async-repository.ts` | identity page支援before comparator/reverse canonical order並回first/last identity；不改hydrate authority |
| `src/lib/relation-workbench.ts` | 同Part的bidirectional service envelope；保留filter hash/company/actor/root uniqueness |
| `src/lib/repositories/relation-workbench-async-repository.ts` | 同Part的before/after identity scan；不改tree/matrix hydrate boundary |
| `src/app/globals.css` | 只新增／泛化page-frame、domain workspace與三viewport必要樣式；不得順帶重畫Drawing或全站 |

Validation-only、不預期direct edit：`src/components/use-pdm-workbench-controller.ts`、`src/components/pdm-workbench-pagination.tsx`、`src/lib/pdm-workbench-contract.ts`、`src/lib/pdm-workbench-cursor.ts`、既有workspace／Part／Relation／Approval write API routes、`src/app/approvals/[requestId]/page.tsx`與Drawing workspace。若這些檔需要改business contract，停止重做impact analysis；單純修正已存在且被DEV-083直接揭露的bug也必須先加入inventory與歸因。

### Exact component／function／type delta

1. `PdmEditPageFrameProps`只接受已正規化的`returnHref`、identity/status React slots、`loading | ready | restricted | not_found | conflict | error` page state、`isDirty`、retry／back callbacks、notice、children與actionDock；不得接受`domain`、API URL、command descriptor或在內部switch。所有return allowlist在domain editor／navigation helper完成。
2. `WorkspaceReadonlyDrawer` props只含workspace read model、presentation／overview、canonical `ownerHref`、geometry與close/focus；不得含`busy`、`editing`、`onUpdate`、`onSubmit`、`onWithdraw`、`onPublish`、`onCancel`、revision editor change callback或confirm state。原可寫body搬到`NumberingWorkspaceEditor`；不能複製一份留在drawer。
3. `PartDetailPanel`與`RelationWorkspaceContent`使用discriminated union：`{ presentation: "drawer-readonly" }`不接受mutation callback；`{ presentation: "workspace-editor"; ...domain callbacks }`才可接受write。禁止多個`showMaintenancePanel`／`readOnly` boolean組合造成非法狀態。
4. `PartProjection`／`RelationProjection`只接受projection與純顯示選項；移除`showMaintenancePanel`、`onMaintenanceChanged`、`onRelationChange`及內部fetch。`UnifiedPdmEntityDetailDrawerProps`同步移除`onCommandSuccess`、`onRelationChange`、`contextualActions`、`onContextualChanged`。
5. `readLocation`／`writeLocation`（Part、Relation）讀寫opaque `cursor`與bounded `pageIndex`；controller設`paginationMode: "server-bidirectional"`並以response `previousCursor`／`hasPreviousPage`導航。URL不得解碼／重簽cursor。
6. `NormalizedPartWorkbenchQuery`／`NormalizedRelationQuery`增加`direction: "after" | "before"`與pageIndex；service以signed cursor truth覆蓋client direction，repository before query反向比較／讀取後再恢復canonical順序，response簽署first/last identity。invalid／filter-mismatch cursor維持400與安全第一頁恢復。
7. `normalizePdmCandidateReturnTo`、`normalizePdmPartReturnTo`、`normalizePdmRelationReturnTo`新增且closed allowlist；`normalizePdmDrawingReturnTo`、`normalizePdmApprovalReturnTo`相容保留。所有helper拒絕absolute、scheme-relative、backslash、control character與錯誤pathname。
8. `buildPdmApprovalOwnerHref`與entity-detail composer產生canonical owner URL；`resolvePdmDetailActions`只保留server truth與placement，不再把Part／Relation／review mutation組成drawer command。`isPdmDetailMutationAction`保留作static gate。
9. `ApprovalRequestWorkspace`先讀request metadata並用`resolvePdmApprovalOwnerContext`取得target，再以exact `reviewRequestId`讀locked full projection；任何target receipt、company、assignment、active state或drift失敗都fail closed，不可先畫full projection再隱藏。

### Exact test／runner inventory

新增：`scripts/qc-dev-083-contract.mjs`、`scripts/qc-dev-083-api.mjs`、`scripts/qc-dev-083-browser.mjs`、`scripts/qc-dev-083-mutation.mjs`、`scripts/qc-dev-083-aggregate.mjs`。`package.json`新增且只新增`qc:dev-083:contract`、`:api`、`:browser`、`:mutation`、`qc:dev-083`五個command；aggregate保存每個child result，不可吞掉FAIL／BLOCKED。

Intentional-replacement expected必須同步修改：`scripts/qc-dev-062-part-workbench.mjs`、`scripts/qc-dev-062-relation-workbench.mjs`、`scripts/qc-dev-067-unified-drawer-ui.mjs`、`scripts/qc-dev-067-navigation.mjs`、`scripts/qc-dev-067-browser.mjs`、`scripts/qc-dev-070-contract.mjs`、`scripts/qc-dev-070-legacy-owner.mjs`、`scripts/qc-dev-070-browser.mjs`、`scripts/qc-dev-072-action-contract.mjs`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-dev-072-browser.mjs`、`scripts/qc-dev-079-contract.mjs`、`scripts/qc-pdm-entity-detail-drawer.mjs`、`scripts/qc-pdm-number-state-flow-phase1b.mjs`、`scripts/qc-pdm-numbering-approval-review-ui.mjs`。只改與canonical route／zero-write／bidirectional return直接衝突的assertion；保留projection、permission、scope、Drawing與資料一致性expected。

`qc:dev-083:contract`負責28-file boundary、route/stable-ID/safe-return、single candidate editor、drawer/frame source scan與schema/write-route negative diff；`:api`負責before/after cursor、owner resolver、action destination、actor/company/reviewer負向、existing payload與exactly-once；`:browser`負責legacy/unified三list四workspace、DOM/a11y/network zero-write、unsaved/focus/return與1440×900／1024×768／390×844；`:mutation`在disposable SQLite＋Chromium中負責candidate lifecycle／recovery、Part variant、角色／公司 authority、Relation五種操作與reviewer `needs_info`／reject／approve、scope denial、snapshot drift與retry formalization的exactly-once／readback／audit；aggregate依QA plan跑parent regressions、`typecheck:app`、affected lint與`build:isolated`。需要資料的runner只能使用disposable isolated directory與task-owned runtime，完成後依`AGENTS.md`精確停止並確認port釋放。

### UX Intent 與操作主權

- 使用者與情境：工程師／主管在 Part 或 Relation 清單快速掃描多筆資料，只有決定維護主資料、關聯、candidate aggregate 或審核案件時才進入完整工作面。
- 成功結果：5 秒內辨識物件、狀態與是否值得進入工作區；drawer 中不可能誤觸 write；full page 能完成一個明確任務並安全返回。
- 操作 owner 固定為 `List/Page -> Drawer(read/navigation) -> Full-page Form/Workspace -> Confirmation Modal`。每一層只保留最上層 active owner；modal 開啟時底層 action dock 必須 inert，關閉後回到原觸發控制項。
- Drawer 一個 primary navigation CTA；full-page 每個 active scope 一個 primary action，secondary／danger 由 domain editor決定。導覽 link 不混入 form action dock。
- 正常／成功狀態保持安靜；blocked、restricted、not-found、conflict 或 failed 才在受影響位置顯示人類影響與可發現恢復方式。不得把 DEV ID、API route、raw status、技術錯誤或 QA checklist 顯示在產品 UI。
- Drawer desktop 維持右側 overlay與單一 body scroll owner；mobile 為全寬 drawer。Full page 的 header、domain body與 action dock不得形成多個不清楚的垂直 scroll owner，固定列需為最後控制項保留淨空。

### Canonical route、stable identity 與 ownership

| Context | Canonical URL | Stable identity | 唯一 write owner |
|---|---|---|---|
| candidate aggregate owner | `/numbering/workspaces/[workspaceId]?intent=<intent>&returnTo=<encoded>` | `candidate:{workspaceId}` | `NumberingWorkspaceEditor`＋既有 workspace／candidate revision APIs |
| formal Part owner | `/parts/[partId]/workspace?intent=<intent>&returnTo=<encoded>` | `part:{partNumberId}` | Part domain editor＋既有 Part／attachment／contextual command APIs |
| formal Relation owner | `/numbering/relations/[rootId]/workspace?intent=<intent>&returnTo=<encoded>` | `root:{partRootId}` | Relation domain editor＋既有 relation／contextual command APIs |
| exact reviewer | `/approvals/[requestId]?returnTo=<encoded>` | approval request ID＋request target receipt | domain-aware `ApprovalRequestWorkspace`＋既有 decision/apply APIs |
| list／drawer | `/parts?...&detail=<entityKey>`、`/numbering/search?...&detail=<entityKey>`、`/approvals?...` | existing row/entity key | read、copy、download、preview、refresh、return、navigate only |
| Drawing owner／reviewer | 現有 `/numbering/drawings/[drawingId]/workspace`、`/approvals/[requestId]` | existing Drawing/request ID | `DEV-079` authority，不由 DEV-083 重構 |

允許 intent：candidate=`edit | submit_review | withdraw_review | cancel | recovery | view`；formal Part=`edit | manage_files | history | view`；formal Relation=`manage_relation | history | view`。unknown／inapplicable intent 必須由 server truth 正規化為 `view` 或 locked state並說明，不得只依 query string掛載表單。`#part-data-maintenance`、`#relation-maintenance` 等 anchor只控制初始 focus，不改 projection、capability 或 command scope。

### State／action destination contract

| State／action | Drawer behavior | Canonical destination／owner behavior |
|---|---|---|
| candidate building／drawing preparation／correction | `繼續建立／繼續修正` navigation | candidate workspace `edit`；沿用目前 aggregate editor與server capability |
| candidate bundle ready／submit | `檢查並送審` navigation | candidate workspace `submit_review`；實際 submit／confirmation只在full page |
| candidate in review／withdraw | `查看審核`或`查看工作` navigation | owner在candidate workspace唯讀／依既有capability撤回；reviewer在request workspace決策 |
| candidate recovery／cancel | `處理異常`／`繼續工作` navigation | candidate workspace `recovery`／`cancel`，由既有idempotency與server truth處理 |
| formal Part edit／files／contextual lifecycle | `編輯料號資料`或server-derived CTA navigation | Part workspace；active-review或terminal依既有policy鎖定／唯讀 |
| formal Relation maintenance／contextual lifecycle | `維護圖料關聯`或server-derived CTA navigation | Relation workspace；既有record lock與relation permission不變 |
| approve／needs-info／reject／retry apply | `前往審核工作區` navigation | `/approvals/[requestId]`；exact reviewer、target receipt、drift、idempotency與audit由server重驗 |
| history／terminal／readonly | 唯讀、history navigation或無primary | canonical workspace `view/history`；不得顯示假的可寫 control |

`PdmEntityDetailResponse.actionBar` 繼續是 drawer 的 server-derived action truth，但 Part／Relation／Approval mutation intent 的 `execution` 必須為 `navigate`、locked 或 omitted，不得是 `command`。Full-page domain editor直接使用既有 domain command contract；不得把 drawer action runner搬進 `PdmEditPageFrame` 形成跨 domain command bus。

### 最小共用元件與 domain boundary

- `PdmEditPageFrame`：只治理safe return、stable identity header、human status、loading／401／403／404／409／5xx state、unsaved guard、action-dock placement、responsive shell與focus restoration。它接受slots／callbacks，不得 import Part／Relation projection、domain status或API route，也不得出現`if (domain === ...)`。
- `NumberingWorkspaceEditor`：由現有 `WorkspaceDrawer` candidate可寫body抽出，僅掛載於單一candidate route；Part／Relation入口只決定安全return與初始anchor，不建立不同editor mode。
- `PartWorkspaceEditor`：domain-owned；復用Part projection、variant、attachments與contextual lifecycle primitives，且只有此full-page owner掛載其write controls。
- `RelationWorkspaceEditor`：domain-owned；復用root aggregate、tree／matrix、relation maintenance與contextual lifecycle primitives，且只有此full-page owner掛載relation commands。
- `ApprovalRequestWorkspace`：保留request／decision authority並改為依server owner context組合Drawing／Part／Relation projections；不得在shared frame建立domain switch式表單。
- `UnifiedPdmEntityDetailDrawer`：保留read composer、server projection policy、geometry、scroll、focus與單一navigation action bar；移除Part／Relation maintenance state、pending command runner與write callbacks。

禁止：`GenericWorkbench<T>`、schema-driven universal form、跨domain action runner、第二個candidate editor、client fetch-all後hide、把Part fields塞進core contract、把Relation tree強制渲染成Part表單，以及為DEV-083新增feature flag。

### Data、API、permission 與 consistency contract

- Schema／migration：無。Part Number identity、Relation root、workspace lifecycle、approval request／target／decision資料模型均不變。
- Read：復用 `GET /api/numbering/draft-workspaces/[id]`、`GET /api/parts/workbench/[rowKey]`、`GET /api/numbering/relations/[rowKey]`、`GET /api/pdm/entity-details/[entityKey]` 與 `GET /api/approvals/requests/[requestId]`；response維持`private, no-store`。Page若需要read adapter，只能薄包裝既有service，不建立第二份domain truth。
- Write：復用既有workspace／candidate revision、Part variant／attachments、`POST /api/numbering/relations`、contextual lifecycle與approval decision/apply APIs。不得新增平行write endpoint、改payload語意或複製command logic。
- Part／Relation list為精確返回可additive支援`previousCursor/pageIndex`與signed bidirectional cursor；既有cursor HMAC、filter hash、actor/company/domain隔離及400回第一頁規則不變。這是read envelope兼容擴充，不是新資料authority。
- Permission：沿用`numbering.workspace.view/update/cancel`、`numbering.draft.update`、candidate submit／withdraw、`numbering.attachments.manage`、`numbering.link_variant`、publication／contextual action、exact reviewer decision與`DEV-081` non-owner edit scope。Client route、intent或可見button不得放寬server判定。
- 每次read／write重驗authenticated actor、company與存在性；每次write另重驗owner／non-owner scope、lifecycle／active-review lock、exact reviewer、request target receipt、existing concurrency／rowVersion、idempotency與audit。DEV-083不補造目前domain沒有的rowVersion或transaction語意。

### Safe return、list freshness 與 navigation

- `returnTo`採closed allowlist：candidate只接受`/parts`或`/numbering/search`；Part只接受`/parts`；Relation只接受`/numbering/search`；reviewer只接受`/approvals`。拒絕absolute URL、scheme-relative、backslash、control character、cross-origin與不符pathname的值。
- Part／Relation list location需保存目前可序列化的view、query、filter、sort、layout、history、opaque cursor、bounded pageIndex、detail entity key與selected row；不得把HMAC payload解碼或寫入localStorage作authority。
- 進入workspace時可關閉drawer，但`returnTo`保留其detail key；完成／取消／browser back後回到原頁次並恢復列focus。若資料已離開filter、cursor失效或物件不存在，回最近可解釋list state、移除stale detail並顯示一次人類可理解notice。
- hard reload／direct URL以server truth重建，不依賴drawer snapshot、React state或client capability。已完成upload／command不算unsaved；只有尚未提交的form input觸發discard guard。

### Failure／recovery contract

- 401：導向login並保留workspace本身的safe return；登入後重新讀server truth。
- 403：保留唯讀identity與可返回入口；說明所缺能力／聯絡角色，不顯示disabled假表單。
- 404：顯示物件不存在或已移轉，提供回allowlisted list；不得留下空白workspace。
- 409／active-review drift：保留未送出input，要求refresh truth；不可自動覆寫。Relation／workspace既有lock與rowVersion語意不變。
- 5xx／network失敗：保留未送出input與最近成功read，提供retry；畫面不得顯示raw JSON、stack、API route或HTTP技術訊息。
- mutation response未知：不得自動重送非安全operation；以既有idempotency／PUT語意與readback確認結果。partial upload保留已完成檔案，不把成功upload誤列為unsaved。
- 離頁：route change、返回、關閉、browser back與切換entity都使用同一discard guard；confirmation modal接管時底層form action不可點擊／Tab／AT操作。

### Current phase DAG、entry／exit gate

| Phase | Scope | Entry | Exit evidence |
|---|---|---|---|
| `083-A Route／read contract` | 四canonical routes、stable ID、safe return、intent normalization、domain-aware reviewer owner resolver | 本Implementation Contract | route/action/security contract可證；unknown intent fail closed；Drawing snapshot不變 |
| `083-B Full-page owners` | page frame、single candidate editor、Part／Relation domain editors、三domain reviewer workspace | 083-A | direct URL／reload／permission／failure states可操作；無新write API或domain bus |
| `083-C Exact return mechanics` | Part／Relation bidirectional cursor、URL state、selected-row/focus recovery | 083-A | next/previous、back/forward、stale cursor、missing row、open redirect negative cases通過 |
| `083-D Atomic zero-write cutover` | candidate、formal、legacy、unified、approval drawer同次navigation-only | 083-B＋083-C | 所有flag branch／actor／state drawer DOM與network mutation=0；唯一workspace owner成立 |
| `083-E QA freeze` | focused contract/API/browser＋parent regressions | 083-D | QA-083完整gate、P0/P1=0、visible／console／network unexpected error=0 |

A～C可在本機分開實作與提交，但不是可release中間態；D必須與已完成的canonical pages同一application artifact。現有`PDM_UNIFIED_PART_RELATION_WORKBENCH_V1`只能切list／drawer renderer，不能決定是否允許drawer write；flag on/off兩支都必須zero-write。不新增DEV-083 feature flag，無DB rollback。

### Acceptance Criteria 與 QA/QC handoff

1. Part／Relation candidate、formal、legacy、unified與approval drawer的DOM、keyboard、accessibility tree及network均zero-write；無form、file input、save、relation mutation、submit、withdraw、cancel、approve、reject、retry或contextual mutation control。
2. candidate、formal Part、formal Relation與exact reviewer各有且只有一個canonical full-page owner；相同intent不存在drawer／page雙路徑或多個candidate URL。
3. Drawer只有read actions與最多一個primary navigation CTA；full-page與confirmation依層級各只有一個active action owner，底層owner在上層開啟時不可操作。
4. `PdmEditPageFrame`無domain import／switch／command href；Part與Relation editor保留domain差異、既有permission與server validation。
5. safe return完整保存Part／Relation清單脈絡；direct URL、reload、back／forward、完成、取消、stale cursor與missing row均有可解釋結果且無open redirect。
6. owner、R&D Manager、Admin、exact reviewer、readonly actor與cross-company actor覆蓋candidate／formal／review／terminal；未授權資料不hydrate，disabled reason與contact role保持server truth。
7. 既有workspace、Part、Relation、attachment與approval API的payload、audit、lifecycle、lock與idempotency回歸不變；repository diff不得出現schema／migration／新permission／新write route。
8. 1440×900、1024×768、390×844驗證Part、Relation、Approval list→drawer→workspace→return，包含loading／empty／error／blocked／not-found、focus、scroll owner、action dock clearance、mobile keyboard與horizontal overflow。
9. 每個critical route執行visible-error與information-noise sweep；可見UI無raw status、DEV ID、API route、HTTP/stack、重複identity／status、逐項教學CTA或被fixed bar遮住的最後欄位。
10. Drawing `/numbering/drawings/[drawingId]/workspace`與DEV-079 drawer contract保持等價；DEV-083不得以共用frame名義修改Drawing產品面。

 QA authority：`.ai-doc/qa/qa-dev-083-part-relation-readonly-drawer-fullpage-workspace-validation-plan-2026-08-20.md`。RD已建立`qc:dev-083:contract`、`:api`、`:browser`、`:mutation`與aggregate commands；focused contract/API、latest 22-check authenticated browser、最新disposable mutation、typecheck、lint與isolated build均有證據。aggregate仍逐child保存parent FAIL／BLOCKED與baseline標籤；DEV-083未刪舊expected取得可追溯closure。Mutation runner最新manifest為`output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`且31/31 result rows passed、cleanup=removed，已閉合QA-083-11/12/13/17/18/19，後者包含Engineer owner/non-owner與三domain Manager／Admin／non-editor／company partition；DEV-067 parent browser最新18/18 PASS，DEV-072則保留`accepted-superseded`及原始failure，並由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`的2026-08-20 QC disposition關閉QA-083-24。

### Deferred Scope Audit、future capsule 與 stop conditions

- `Future Phase Captured / Not Requested`：待DEV-083本機QA/QC穩定且Drawing獨立QC完成後，才評估讓Drawing workspace採用`PdmEditPageFrame`；只有能證明減少重複且不改Drawing DOM／behavior時才重進規劃。
- `Future Phase Captured / Not Requested`：legacy drawer compatibility code的物理刪除延後到flag on/off zero-write與rollback evidence穩定；current phase必須先unmount／fail closed，但不為清理擴大產品風險。
- `Release Gate Required`：staging／production activation、deploy、traffic、production smoke與application rollback artifact另走release gate；本文件不產生release操作表。

停止條件：需要universal editor、同一candidate無法使用單一URL、stable ID或safe return不成立、legacy／unified／approval branch無法同次zero-write、command authority無法唯一化、Part／Relation list只能client join才能恢復、reviewer route需全域權限繞過，或需改schema／permission／lifecycle／production。發生時回Dev PM；不得以duplicate page、client-only permission、hidden form、modal工作台或drawer暫留write繞過。

> **2026-08-11 Part-cost retirement amendment**
>
> The part-cost sections, cost status, cost redaction and cost-maintenance deep links are retired from the current drawer contract by `ADR-PDM-PART-COST-RETIREMENT-001`. This document's historical cost references must not be implemented or used as current acceptance criteria.

## 2026-08-19 DEV-079 Amendment - 圖號唯讀抽屜與全頁編輯工作區分流

Status: `RD Implemented Locally / Focused Contract + Browser Evidence / Independent QC Pending / Production Release Gated`.

### 2026-08-20 Density／layout amendment

依使用者在 owner workspace 的紅線標記，本輪只收斂 presentation density，不改本節既有資料、命令與權限 authority：

- 移除左側預覽的 `N 類`計數與預覽標題列，避免與 tab 重複傳達可用圖面數量。
- 移除右側候選版次 header 的重複圖號；完整圖號仍保留在工作區主標題與受控檔案清單。
- 2D／3D tab 同列顯示檔名；取消 tab 與大型預覽、task tab 與版次 editor 間的多餘 padding／gap。
- owner workspace 的大型預覽不再顯示下方重複檔名 footer；檔名由 2D／3D tab 與右側受控檔案清單承接，避免同一檔案在主視覺區重複呈現。
- owner workspace 的受控檔案列不顯示`主要受控檔／受控附件`與`已完成驗證／需要先驗證`輔助 metadata；檔案標題、預覽／下載／移除操作與驗證流程保留。
- 右側 candidate editor/card 以內容高度排列，保留版次儲存、受控檔案、上傳、智慧辨識與底部生命週期操作列；PNG 預覽維持 `object-fit: contain`，不裁切工程圖。
- 生命週期操作列只停駐在右側 task column 底部；不得再建立與左側等寬的空白 preview placeholder。左側 2D／3D 預覽須使用原 footer row 的高度並延伸到工作區底部；窄 viewport 仍依主視覺→task panel→sticky 操作列排列。
- 智慧辨識人工核對欄位採緊湊垂直節奏：標題、輸入值與來源控制保持相鄰，例外提示不另占大型區塊；mobile 仍保留可讀輸入高度與來源按鈕，最後的批次儲存按鈕須在 sticky 操作列上方保留安全間距。
- 智慧辨識 task panel 另移除 tab badge、`輔助工具`標籤、compact 送審前說明／狀態 chip、重複統計摘要與分類標題；`source_file_role` 屬內部 metadata，不列入人工核對候選或待處理計數。正常流程不顯示獨立「開始辨識」按鈕：檔案上傳完成即自動排程，進頁時自動補建缺少的相同來源工作並輪詢；處理中只顯示安靜狀態，完成後直接顯示候選。
- 候選欄位本身是證據定位入口；有圖面座標時 focus／click 即定位，沒有座標時顯示`來源不在圖面上，僅存在檔案屬性`。人工核對以單一`完成核對並儲存`提交全部接受／修正，已修改欄位以文字訊號標示；不保留逐欄`套用修正／接受`按鈕或常駐`待核對`文案。
- 候選卡的`辨識／修正值`、`目前值`與`可信度`僅屬可壓縮的輔助 metadata：可見 UI 不再顯示前兩者標籤或可信度文字；正式值為空時整列不渲染，已有值時僅顯示值本身。欄位名稱／例外狀態、輸入、欄位本身的圖面定位與單一批次儲存不得被此收斂移除；輸入欄位仍須有可及名稱。
- 窄 viewport 的底部生命週期列只在接近頁面底部時 sticky，避免遮住辨識處理狀態或候選欄位。

Focused browser evidence：`npm.cmd run qc:dev-079:layout-browser`，1440×900／1024×768／390×844 三 viewport PASS；證據位於 `output/qa/dev-079-layout/20260820020110-browser/`，並確認 owner preview footer 檔名與受控檔案 metadata 不存在。此 amendment 不改 schema、API、permission、lifecycle、recognition authority 或 submit gate，且不取代 QA-079-01～28 的完整獨立QC。

### 問題、效用與目標流程

現行圖號抽屜同時承擔「快速找資料」與「長時間編輯／上傳／送審」。前者需要保留清單上下文、快速切換與高資訊密度；後者需要穩定寬度、完整預覽、錯誤處理及清楚的任務順序。兩種任務共用右側窄欄時，編輯畫面被迫由上而下延伸，使用者必須頻繁捲動並反覆確認目前做到哪一步。

本 amendment 將兩種任務模式分開：

```text
圖號清單 -> 右側圖號明細抽屜（唯讀） -> 點擊狀態導向 CTA
         -> 同分頁、可由 URL 定址的全頁工作區 -> 完成或取消 -> 返回原清單脈絡
```

效用判斷：多一次明確導覽的固定成本，換取抽屜瀏覽效率、編輯空間、預覽可見性、錯誤恢復與送審前判斷品質。由於編輯是低頻但高投入、高風險任務，效益高於額外一次點擊；不應以 modal 疊加或新分頁把上下文與返回責任交給使用者自行管理。

### Human-confirmed decisions

1. `HD-079-01 / 1B`：整個 **Drawing／圖號明細抽屜全面唯讀**。抽屜不承載表單、上傳、刪除、儲存、送審、撤回、核准、退回、作廢或其他 mutation control；可保留下載、開啟預覽、複製圖號與導覽 CTA。Part、Relation 與非 Drawing drawer 不在本階段改造範圍。
2. `HD-079-02 / 2A`：編輯使用**同分頁、獨立 URL 的全頁工作區**；不是 fullscreen modal，也不自動開新分頁／視窗。必須支援重新整理、瀏覽器上一頁／下一頁與安全 `returnTo`。
3. `HD-079-03 / 3A`：桌面採**雙欄工作區＋底部固定操作列**。左欄處理版次與本次檔案，右欄顯示 3D／2D 預覽、檔案辨識與送審 readiness；窄 viewport 依同一資訊順序改為單欄，不另造第二套流程。
4. `HD-079-04 / Visual-first amendment`：保留 3A 的全頁雙欄與底部單一生命週期操作列，但**取代其欄位 placement**。桌面左欄改為 2D／3D 大型主視覺，右欄改為可切換的`版次與檔案／智慧辨識`任務面板；右欄擁有自己的內容捲動，圖面不隨長表單離開視線。智慧辨識沿用既有 recognition session／decision authority，以 candidate revision 的受控 file asset 為來源；辨識不是送審 hard gate，進階歸類與正式寫入仍由既有完整核對頁負責。

### 抽屜唯讀契約

Drawing drawer 的責任是「辨識物件、快速預覽、判斷狀態、決定要不要進入工作面」，不是完成 mutation。內容優先序固定為：

1. 完整圖號、名稱／用途、第一層狀態與必要責任說明；
2. 3D 模型與 2D 圖面的真實預覽／可理解缺件狀態；
3. 目前版次、受控檔案、關聯料號與必要摘要；
4. 一個依狀態與權限由 server 決定的主要**導覽** CTA；
5. 歷史、更多唯讀資料與低頻導覽入口。

主要 CTA 只負責前往 canonical owner workspace，不得在 drawer 內直接執行 domain command。狀態與目的地契約如下；canonical route 與 capability matrix 見本 amendment 的 RD Handoff Contract：

| 狀態／意圖 | Drawer CTA | 目的地語意 |
|---|---|---|
| 首版準備／修正中 | `編輯首版`／`繼續編輯` | 圖號版次全頁編輯工作區 |
| 本次必要檔案已就緒 | `檢查並送審` | 同一全頁工作區的預覽／送審區，不在 drawer 送審 |
| 審核中 | `查看審核` | 依 viewer capability 前往 owner 或 reviewer 的 canonical review workspace |
| 研發版／量產版可使用且可進版 | `建立新版次` | 正式版次全頁編輯工作區 |
| 唯讀、無權限或 terminal | `查看詳情`或無主要 CTA | 唯讀 canonical detail／history；不得顯示假的可寫控制項 |

同一情境最多一個 primary CTA。若 applicable action 尚不可執行，沿用 `DEV-072` 的 locked reason truth，但控制項仍只能導覽或唯讀；不得因 locked 顯示而把 mutation 表單重新放回 drawer。Drawing-surface Approval owner context 的核准／退回同樣不得直接寫入 drawer，必須進入 canonical review workspace；Part／Relation approval surface 維持原契約，不在本 DEV 改造範圍。

### 全頁版次編輯工作區契約

全頁工作區沿用 `DEV-064` 的 canonical Drawing／Revision／File identity，以及現行 server permission、lifecycle、idempotency、optimistic concurrency、submission 與 publication authority，不建立第二套資料或命令來源。

桌面資訊架構（以 `HD-079-04` 為現行 placement authority；下表取代 3A 的左右欄內容分配）：

| 區域 | 內容與順序 |
|---|---|
| 頂部 | 返回原清單、**完整圖號**、名稱／用途、目前狀態；不以「M 圖面」等分類名稱取代圖號。 |
| 左側主視覺 | 預設顯示 2D 圖面，與 3D 模型以 tab 切換；一次只顯示一個大型預覽。OCR 證據可在 2D 上疊加定位框與來源摘要；無法解析座標時仍顯示證據文字，不得顯示 raw geometry。 |
| 右側任務分頁 | `版次與檔案`承載建議版次、此次版次、`儲存版次`、`上傳此版次檔案`、逐檔狀態及必要／建議說明；上傳成功後由系統自動排程辨識。`智慧辨識`承載安靜的處理／異常狀態、可直接編輯與定位的候選欄位、單一批次儲存與完整核對入口，不顯示正常流程的手動啟動按鈕。右側內容獨立垂直捲動。 |
| 底部 | 單一生命週期 action bar：返回／取消與唯一 primary 下一步。送審只能由既有 readiness 與 permission server truth 啟用；OCR 狀態、待核對數或 feature flag 均不得加入 submit gate。 |

必要／建議檔案的精簡說明放入可鍵盤 focus、桌面 hover、觸控點擊的說明浮層：`必要｜主要 3D 模型、主要 2D 圖面`；`建議｜PDF、DWG／DXF`。主畫面不常駐「必要檔案齊全後即可送審」句子；實際 blocker 仍必須在相關控制項旁以短句指出缺少哪一類檔案。檔案必要性與 canonical reuse 仍以 `DEV-061` 為 authority。

窄 viewport 依 `頂部 -> 圖面主視覺 -> 右側任務分頁 -> 固定操作列` 排列；主視覺先於表單，任務分頁內仍維持`版次／上傳`或`辨識／核對`的各自順序。固定操作列不得遮住最後一個欄位、錯誤訊息或瀏覽器安全區。

### 導覽、返回與資料新鮮度

- 進入全頁工作區時，以 same-origin allowlisted `returnTo` 保存 keyword、filter、sort、layout、history、cursor／page、selected row、drawer detail 與可恢復 scroll anchor；不得接受任意外部 URL。
- 完成或取消後回到原結果與原列；若該列已離開結果或失效，回到可解釋的最近清單狀態並說明原因，不以空白畫面代替。
- browser back／forward、hard reload 與 direct URL 必須可用。工作區重新載入 server truth，不以 drawer 舊 snapshot 解鎖 mutation。
- 有未儲存輸入時，離開、返回清單或切換圖號前必須顯示可理解的 discard guard；已完成的逐檔上傳不得被錯誤宣稱為未儲存。
- 抽屜與全頁工作區可共用 read projection、preview component 與 action descriptor，但 mutation component 只掛載於 canonical full-page owner workspace。

### Scope、Out of Scope 與驗收方向

Scope：Drawing drawer 全面唯讀、狀態導向導覽 CTA、同分頁全頁版次／送審工作區、雙欄與 responsive layout、精確返回、未儲存保護，以及既有 Drawing mutation 由 drawer 遷移至 canonical owner workspace。

Out of Scope：Part／Relation drawer 全面唯讀化、生命週期或權限變更、新 schema／migration／API authority、production 資料修復、部署／release、自動開新分頁、fullscreen modal，以及以新頁複製既有 command logic。

Acceptance Criteria：

1. Drawing drawer DOM 中不存在 mutation form、file input／dropzone、save／submit／approve／reject／withdraw／obsolete control；唯讀預覽、下載、複製與導覽仍可用。
2. 所有 Drawing write intent 都前往明確 canonical workspace；不得同時保留 drawer 與 full page 兩套 mutation path。
3. 左側大型圖面與右側`版次與檔案／智慧辨識`任務切換可同時理解；`決定此次版次 -> 儲存版次草稿 -> 上傳此版次檔案 -> 送審`仍完整，儲存版次與 OCR 均不得被誤認為送審。
4. 1440×900、1024×768、390×844 驗證抽屜瀏覽、CTA 導覽、visual-first 雙欄／單欄切換、右欄獨立捲動、固定 action bar、keyboard focus、scroll／overflow 與未儲存保護。
5. 從含 keyword／filter／sort／layout／history／cursor／selected detail 的清單進入，完成、取消、browser back 與 hard reload 後均可安全返回；無 open redirect。
6. candidate、formal、reviewer、readonly 四類 actor/state 驗證 server capability、active-review write lock、stale rowVersion、重送 idempotency、401／403／404／409／5xx 與 retry/recovery，不得因 UI 分流放寬 authority。
7. 可見畫面不得出現 raw JSON、API error、stack、技術狀態碼、內容裁切或被 sticky bar 遮住的最後一項。
8. OCR 建立必須使用目前 candidate revision 與其未移除的受控 `source_file_asset_id`；每次上傳成功後自動 ensure，相同來源集合必須重用既有 session。進頁時若已有來源但沒有相符 session，必須自動補建並輪詢至可顯示結果。沒有辨識權限、功能未啟用或自動建立失敗時，版次與送審既有流程仍可使用；只有可處理的異常才顯示重試，不得出現失敗型假警報。
9. OCR 候選可在右欄接受／修正並在左側 2D 定位；歸類、不適用、忽略、延後、影響預覽與正式寫入沿用既有完整核對頁，不在 DEV-079 複製第二套 command authority。

### Spec Impact、ADR 與 re-entry

Spec Impact Preflight：`Intentional replacement + compatible preservation`。本 amendment 明確取代本文後段「candidate first-revision editor 必須 inline、submit 必須在同一 drawer、不得 route change 或 drawer replacement」以及 `DEV-053` 將高頻進版／送審留在 drawer 的 UI placement。舊段落保留為歷史基線，衝突時一律以 `DEV-079` 為準。

保留項：`DEV-064` Drawing／Revision／File 單一資料權威、`DEV-061` 檔案必要性與 canonical reuse、`DEV-067` server composer／projection、`DEV-072` applicable／locked action truth、既有 command route、permission、state machine、audit、submission、publication、idempotency 與 concurrency guard。

ADR 判定：目前不新增 ADR；這是同一 Drawing authority 下的 task-mode／navigation／component placement 變更。若後續要求所有 PDM drawer 全面唯讀、建立新的資料／命令 owner、改變 approval decision surface authority，或 full-page workspace 需要獨立持久化狀態，必須停止並回 Dev PM 重做 Spec Impact／ADR 判定。本次 repository inventory 已證明可沿用既有 Drawing／Revision／File、approval 與 command authority，無 schema／migration／新 domain API 必要；route、component、feature rollout、failure recovery 與 QA/QC case 已在下列 RD Contract 封口。

### Current Architecture Impact（RD Contract Upgrade）

079 implementation前盤點到四個會造成 Drawing mutation placement 分散的實作面；本輪已完成收斂，以下保留作差異歸因：

1. `src/components/drawing-workbench.tsx` 的 candidate／formal detail與legacy drawer曾直接承載workspace action。
2. `WorkspaceDrawer`曾內嵌`NumberingCandidateRevisionEditor`，形成drawer內更新、上傳、送審、撤回或取消路徑。
3. `src/components/unified-pdm-entity-detail-drawer.tsx`曾可執行server command descriptor，且projection可能掛載可寫附件能力。
4. formal revision全頁與`src/app/approvals/page.tsx`的Drawing review曾與drawer mutation並存。

本輪已把現有mutation component收斂到canonical full-page owner，並讓所有Drawing drawer分支同次轉成zero-write。`PdmDetailActionExecution`既有`navigate`型別足以承載導覽；不需要新增drawer command authority。`PDM_UNIFIED_ENTITY_DETAIL_V1`仍只決定哪一個**唯讀**drawer renderer，不再決定Drawing mutation是否留在drawer，亦未新增feature flag。

現有 `PdmEntityKey` 以 `drawing:<id>` 表示 canonical Drawing，legacy `candidate:<workspaceId>` 可由 workbench detail 解析到 canonical Drawing。新 canonical path 必須使用穩定 Drawing ID，不得使用可變圖號或 workspace ID 當 route identity。

### Canonical route、intent 與 ownership contract

| Surface | Canonical URL | Owner | Contract |
|---|---|---|---|
| 圖號 owner full-page workspace | `/numbering/drawings/[drawingId]/workspace?intent=<intent>&returnTo=<encoded>` | Drawing workspace route | candidate、formal revision、檔案、送審、撤回與 owner recovery 的唯一 UI placement；`drawingId` 為 canonical Drawing ID。 |
| Drawing reviewer full-page workspace | `/approvals/[requestId]?returnTo=<encoded>` | Approval request route | exact reviewer 的審核資料與核准／退回唯一 UI placement；由 request authority 重驗 actor。 |
| 現有 formal revision deep link | `/numbering/revisions?...` | compatibility adapter | 既有連結不得失效；解析 drawingNumber／revision 後 canonicalize 到 Drawing workspace，或薄包裝共用 full-page shell，不得保留第二套 command logic。 |
| 清單與 drawer | `/numbering/drawings?...&detail=drawing:<id>`、`/approvals?...` | list/read projection | 只讀與導覽；Drawing surface 不得送 mutation request。 |

允許的 `intent` 固定為 `edit_revision | submit_review | create_revision | manage_files | withdraw_review | recovery | view`。route 可依 server truth 正規化 intent：例如 active review 時將未允許的 `edit_revision` 轉為 `view` 並說明鎖定原因；不得只依 query string 解鎖表單。取消是頁面動作，不是 route intent；完成／取消均依安全 `returnTo` 返回。

### State × actor destination matrix

| Canonical state | Owner／可編輯 actor | Exact reviewer | Readonly／其他 actor |
|---|---|---|---|
| `building`／`drawing_preparation`／`correction` | Drawing workspace `edit_revision` | 無 review decision；依權限唯讀或無 CTA | `view` 或無 primary CTA |
| `bundle_ready` | Drawing workspace `submit_review` | 無 decision | `view` 或 locked reason |
| `in_review` | Drawing workspace `view`；具既有撤回權限者可在該頁撤回 | `/approvals/[requestId]`，決策只在全頁 review workspace | `view`，不得看見可執行 decision |
| `auto_finalizing` | Drawing workspace `view`／refresh | Approval page只讀處理進度 | `view` |
| `recovery` | 依既有 recovery capability 前往 Drawing workspace `recovery` 或 Approval request page | 只有 request authority允許的 recovery／decision | `view`與精確責任說明 |
| `rd_controlled`／`released`且可進版 | Drawing workspace `create_revision` | 無 review decision | `view` |
| terminal／history | 唯讀 history | 唯讀 history | 唯讀 history |

Drawer 每次最多回傳一個 server-derived primary navigation CTA。對 `surface=drawing`，`edit`、`submit_review`、`withdraw_review`、`cancel`、`approve`、`return_for_correction`、`reject`、`retry_apply`、`retry_cleanup`、`create_revision`、`manage_files` 等 mutation intent 的 descriptor 必須是 `type: "navigate"` 或 omitted／locked，不得是 `command`／`local`；`view_history`、preview、download、copy、refresh、return 可維持唯讀。Part／Relation resolver 行為不得因本 DEV 被改寫。

### Data、API、permission 與 concurrency contract

- 不新增 schema、migration、lifecycle state、permission 或 domain command。全頁 UI 沿用 `/api/numbering/drawings/workbench/[rowKey]`、`/api/pdm/entity-details/[entityKey]`、現有 revision／candidate file APIs、`/api/approvals/requests/[requestId]` 與 `/decisions`；若頁面整合需要 route-specific BFF，只能是 no-store read adapter，所有 write 仍呼叫既有 authority。
- read authority 至少保留 `numbering.drawings.view`／`numbering.workspace.view`；mutation 沿用 `numbering.workspace.update`、`numbering.draft.update`、`numbering.candidate.review.submit`、`numbering.candidate.review.withdraw`、`numbering.candidate.review.decide`、`numbering.publish`、`post_release_change`、`numbering.attachments.manage`，管理入口仍由 `settings.admin_matrix` 控制。
- exact reviewer、owner assignment、separation of duties、active-review write lock、company scope 必須由 server 於每次 write 重驗。可讀但不可寫時，全頁工作區以唯讀資料、精確 disabled reason 與應聯絡角色呈現；不能藉隱藏按鈕或 client query 代替授權。
- `rowVersion`／optimistic concurrency、Idempotency-Key、submission／publication 原子性與 audit 不變。409 必須刷新 server truth、保留可安全重填內容並要求使用者重新確認；未知 submit 結果先依 idempotency key 查詢／refresh，不得盲目重送。
- `NumberingCandidateRevisionEditor` 的必要檔案 gate 延用 `主要 3D 模型 + 主要 2D 圖面`；PDF、DWG／DXF 僅警告不阻擋。readiness 應收斂於右欄狀態／操作區，移除重複長句，不變更 server gate。

### Return、URL state 與 navigation contract

- Drawing workspace 的 `returnTo` 只接受 same-origin `/numbering/drawings`；review workspace 只接受 same-origin `/approvals`。拒絕外站、`//`、control characters 與不在 allowlist 的 path。現有 approval-only `normalizePdmApprovalReturnTo` 不得拿來正規化 Drawing list return；應抽出 surface-aware safe return helper。
- `readDrawingWorkbenchLocation`／`writeDrawingWorkbenchLocation` 必須納入 opaque signed cursor 與有界、非負的 page／pageIndex，並保存 keyword、view、stage、series、purpose、record／human status、history、sort、layout、detail 與 selected row。
- 返回時重新開啟原列 drawer，使該列可見並取得合理 focus；不要求還原像素級 scroll。cursor 過期時回第一個安全頁並顯示短說明；原列已離開結果或不存在時保留清單條件並說明，不能出現空白 drawer 或上一筆殘影。
- same-tab navigation、browser back／forward、hard reload、direct URL 都必須重抓 server truth。未儲存表單離開時顯示 discard guard；已成功上傳的檔案不是未儲存資料。

### Component boundary、responsive 與 duplicate-path prevention

- 新 route 負責 full-page shell；可抽出共用 owner editor，但 `NumberingCandidateRevisionEditor`、可寫 `CandidateDrawingFileUpload`、可寫 `MasterAttachmentPanel` 與 approval decision controls 只能掛載在對應 full-page route。
- `drawing-workbench.tsx`、`WorkspaceDrawer` 與 `UnifiedPdmEntityDetailDrawer` 的 Drawing 分支只保留 read projection／preview／download／navigation。resolver 是主要 truth；client drawer 再加 defense-in-depth：遇到 Drawing `command`／`local` descriptor 不執行並記錄可測錯誤，避免舊 payload 旁路。
- rollout 必須是單一 atomic placement change：legacy 與 unified Drawing drawer 同次變唯讀，新 full-page owner 同次可用。不可先新增 full-page editor卻保留 drawer write，也不可用既有 flag 讓其中一條 branch 繼續寫。
- 頁面 shell 固定於viewport：desktop左側visual可伸縮且`min-width:0`，右側task panel至少360px並擁有唯一內容scroll owner；左側圖面不隨右側長表單捲走。低於約900px改為主視覺→task panel單欄及一般page scroll。底部action bar須處理safe area且不遮內容；表單與預覽不得產生水平overflow。
- 頂部只保留一個 canonical status badge。底部包含返回／取消、儲存草稿與恰一個 primary；高風險最終送審可使用精簡 confirmation modal，但 editor 本體不可成為 fullscreen modal。

### Failure recovery、RD handoff 與 stop conditions

- 401：導向既有登入／session recovery 並保留安全 return；403：顯示缺少能力與應聯絡角色；404：回清單並說明物件不存在／已移除；409：依 server truth refresh；5xx／網路錯誤：保留已輸入但未送出的表單與逐檔成功結果，提供 retry，不顯示 raw JSON／stack／API body。
- 多檔上傳採逐檔結果；部分成功不得整批宣稱失敗或重傳已成功檔。送審結果不確定時禁止重複產生 request。
- RD 交付本輪新增 `scripts/qc-dev-079-contract.mjs` 與 package command `qc:dev-079:contract`；focused Playwright CLI evidence另保存owner／reviewer畫面。既有 DEV-053／067／072與entity-detail expected已依新zero-write／canonical route契約更新，不得刪除回歸來取得綠燈。
- RD Implementation Package 已在本機完成079-A～079-D與HD-079-04 visual-first/OCR placement；本輪再補齊候選唯讀抽屜的3D／2D同排預覽與歷史版次逐版展開；079-E仍交獨立QC收斂完整browser matrix與既有fixture blockers。不得把focused evidence冒充QA-079-01～28全PASS，亦不得因此操作staging／production。
- 停止條件：實作證明需要新 schema／permission／lifecycle／command owner、無法以 stable Drawing ID 定址、review request 無 canonical full-page authority、surface-aware return 不能安全完成、或無法同次移除兩條 drawer write path。遇到任一條應停止並回 Dev PM，不得以 duplicate form、modal、client-only permission 或放寬 expected 繞過。

QA 計畫：`.ai-doc/qa/qa-dev-079-drawing-readonly-drawer-fullpage-workspace-validation-plan-2026-08-19.md`。focused證據包含原079-A～D artifacts、本輪visual-first contract／browser量測，以及候選唯讀抽屜預覽／歷史版次收合證據；QA-079-01～28尚未宣告完整PASS。P0/P1 finding、Drawing drawer任一非預期write、OCR誤成submit gate、錯版來源、visible error、權限旁路、return open redirect、兩條mutation path或viewport遮擋均阻擋QA/QC PASS。

### RD Implementation Package（current authority）

本節記錄本輪實際可追溯的DEV-079責任檔案、元件、資料流與切片結果；成熟度是`RD Implemented Locally`，仍未宣告獨立QC完成。

#### Exact direct-edit inventory

原079-A～D attributable direct-edit inventory為`26 files = 20 source + 5 test scripts + package.json`。`HD-079-04`再納入3個原inventory外source：`drawing-detail-preview.tsx`、`drawing-recognition-pre-submit-panel.tsx`、新增`drawing-recognition-workspace-panel.tsx`；`drawing-owner-workspace.tsx`、`globals.css`與既有079 contract script屬原boundary內修訂。因此現行unique direct inventory為`29 files = 23 source + 5 test scripts + package.json`。工作樹另有既有使用者變更；未列入本數的dirty檔案不得被回溯計入DEV-079。

原079-A～D新增5個source（其中owner shell已由HD-079-04再修訂）：

| File | Responsibility |
|---|---|
| `src/app/numbering/drawings/[drawingId]/workspace/page.tsx` | canonical Drawing owner route；解析stable Drawing ID、intent與safe return，交給共用client workspace。 |
| `src/components/drawing-owner-workspace.tsx` | owner page shell、candidate／formal分流、server-truth refresh、visual-first兩欄／單欄、右側task tabs、OCR evidence bridge、底部actions與人類錯誤狀態。 |
| `src/components/use-unsaved-changes-guard.ts` | explicit return／cancel、browser back與`beforeunload`的dirty guard；已持久化upload不算dirty。 |
| `src/app/approvals/[requestId]/page.tsx` | canonical Drawing reviewer route；request ID定址與safe approval return。 |
| `src/components/approval-request-workspace.tsx` | 從既有Approval detail抽出可共用的request load、evidence／preview、exact decision／retry與error recovery。 |

原079-A～D修改source＋HD-079-04增量：

| File | Exact change |
|---|---|
| `src/app/globals.css` | DEV-079 viewport shell、左側大型preview、右側task content scroll、evidence overlay、固定action bar與約900px單欄規則；只改窄scope class。 |
| `src/components/drawing-detail-preview.tsx` | 向後相容新增grid／tabs layout、controlled active kind與overlay slot；既有consumer預設grid不變。 |
| `src/components/drawing-recognition-pre-submit-panel.tsx` | 向後相容新增source context override、compact／disabled與session callback；原drawing-number consumer不變。 |
| `src/components/drawing-recognition-workspace-panel.tsx` | 右側candidate OCR task：session status／poll、待處理／衝突篩選、接受／修正、2D evidence callback及canonical完整核對連結。 |
| `src/app/numbering/revisions/page.tsx` | 將`DrawingRevisionWorkbench`調整為canonical shell可重用、回報dirty；舊query解析後canonicalize或共用同一shell。 |
| `src/app/approvals/page.tsx` | 抽出共用request workspace；Drawing drawer只讀＋`前往審核`，非Drawing／歷史相容分支不變。 |
| `src/app/api/pdm/entity-details/[entityKey]/route.ts` | 依review request與Drawing surface選擇approval／drawing safe-return normalizer；維持no-store read。 |
| `src/components/drawing-workbench.tsx` | location納入cursor／page；candidate、formal與secondary action都改canonical navigate；Drawing drawers不再掛mutation。 |
| `src/components/numbering-candidate-revision-editor.tsx` | 提供dirty callback／canonical page integration；維持版次同列與`上傳此版次檔案`，移除主畫面重複長readiness句。 |
| `src/components/unified-pdm-entity-detail-drawer.tsx` | Drawing surface只執行navigate；永不開Drawing maintenance；收到Drawing command／local時fail closed，Part／Relation不變。 |
| `src/components/use-pdm-workbench-controller.ts` | 修正server-bidirectional cursorHistory以pageIndex定位、popstate初始化與invalid cursor URL清理。 |
| `src/lib/drawing-workbench.ts` | list query／response加入direction、pageIndex、previousCursor；Drawing row action href改stable owner／reviewer route。 |
| `src/lib/repositories/drawing-workbench-async-repository.ts` | 實作after／before keyset query；before反向掃描後恢復顯示順序，維持同一filter hash與company scope。 |
| `src/lib/pdm-detail-action-resolver.ts` | Drawing edit／submit／withdraw／retry／create revision／manage files與review decision改為canonical navigate／locked／omitted；Part／Relation command維持。 |
| `src/lib/pdm-entity-detail.ts` | 由canonical Drawing ID組owner href、保留surface-safe return；review request組reviewer href，其他surface維持現況。 |
| `src/lib/pdm-entity-detail-contract.ts` | navigation fallback／descriptor型別容納Drawing owner與Approval owner，不新增mutation execution種類。 |
| `src/lib/pdm-review-navigation.ts` | 抽出surface-aware same-origin allowlist；新增Drawing helper，保留approval helper相容wrapper。 |
| `src/lib/pdm-approval-owner-route.ts` | Drawing request owner指向`/approvals/[requestId]`；Part／Relation既有list-owner route不變。 |

測試／config direct edits：

| Kind | Files |
|---|---|
| New | `scripts/qc-dev-079-contract.mjs` |
| Update old expected／regression | `scripts/qc-dev-053-drawing-workbench-http.mjs`、`scripts/qc-dev-067-unified-entity-contract.mjs`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-pdm-numbering-approval-review-ui.mjs` |
| Commands | `package.json`新增`qc:dev-079:contract`；Playwright CLI focused evidence以本機runtime執行，未新增未可重現的fixture runner。 |

下列8個檔案是validation-only inventory，預設不得修改：`src/components/drawing-projection.tsx`、`src/components/drawing-workspace-drawer.tsx`、`src/components/pdm-workbench-list.tsx`、`src/lib/pdm-workbench-contract.ts`、`src/lib/pdm-workbench-cursor.ts`、`src/app/api/numbering/drawings/workbench/route.ts`、`src/app/api/approvals/requests/[requestId]/route.ts`、`src/app/api/approvals/requests/[requestId]/decisions/route.ts`。它們用來證明projection／container／list focus、cursor codec與既有read／decision authority可重用；若必須修改，視為inventory deviation。

#### Component and data-flow contract

```text
/numbering/drawings list
  -> Drawing readonly drawer
  -> server-derived navigate href
  -> /numbering/drawings/[drawingId]/workspace
       -> GET workbench detail: drawing:<stable-id>
       -> candidate: NumberingCandidateRevisionEditor
       -> formal: shared DrawingRevisionWorkbench
       -> existing revision/file/submit/withdraw APIs
       -> refresh server truth -> safe returnTo -> selected row

/approvals list -> Drawing readonly drawer -> /approvals/[requestId]
  -> existing GET request/evidence authority
  -> extracted ApprovalRequestWorkspace
  -> existing decision/retry API with exact-reviewer recheck
  -> refresh request truth -> safe approval returnTo
```

- Full-page元件只能組合現有write authority，不能複製repository／domain command、直接寫DB或新增proxy mutation。
- Drawing page以workbench detail中的`candidate`與formal revision truth決定editor，不以query intent決定資料種類。intent只選擇可見focus／primary；server state可降級成`view`或locked。
- Approval page先由request API重驗company、request kind、request state與exact reviewer；非Drawing request依既有owner route處理，不因動態route獲得Drawing decision UI。
- Drawing drawer只讀的防線有兩層：resolver不發command／local；client即使收到舊payload也不得發POST／PUT／PATCH／DELETE。

#### Return and bidirectional cursor implementation

1. `pdm-review-navigation.ts`保留`isSafePdmApprovalReturnTo`／`normalizePdmApprovalReturnTo`相容介面，新增Drawing allowlist介面；兩者都拒絕absolute URL、protocol-relative URL、control character與錯surface path。
2. Drawing location codec寫入keyword、view、stage、series、purpose、record／human status、history、sort、layout、detail、opaque cursor與bounded pageIndex；pageIndex不是DB offset，只是history／display identity。
3. repository接收`direction: after | before`。`before`使用相反比較與排序取得前頁，再於service response前reverse，確保畫面排序不跳動；response同時提供`previousCursor`與`nextCursor`。
4. controller的`cursorHistory[index]`必須與`pageIndex`對齊；next不得以`setCursorHistory([nextCursor])`後再讀index 1，previous／popstate亦同。invalid cursor時清除URL中的cursor／page，保留有效filters並顯示短notice。
5. 返回後以既有`PdmWorkbenchList.onRowRef`使selected row可見並取得合理focus；不新增像素scroll store。

#### Phase DAG、entry／exit gate

| Slice | Depends on | Direct implementation outcome | Exit gate |
|---|---|---|---|
| `079-A Route/action foundation` | 本SPEC、HD-079-01..04 | safe-return helpers、stable href、Drawing navigate resolver、entity-detail adapter | 新contract route／action／security matrix PASS；Part／Relation snapshot不變。 |
| `079-B Canonical full-page owners` | 079-A | 兩個dynamic routes、三個共用components/hooks、candidate／formal／reviewer UI與CSS | direct URL／reload、state×actor、required／recommended、dirty、401／403／404／409／5xx focused tests PASS。 |
| `079-C List-state recovery` | 079-A | after／before cursor、URL page state、history與selected-row restore | next／previous、back／forward、hard reload、expired cursor／missing row contract PASS。 |
| `079-D Atomic drawer cutover` | 079-B＋079-C | legacy、candidate、unified、approval Drawing drawer同次zero-write並導向canonical page | 兩flag branches × state × actor DOM/network mutation=0；Part／Relation回歸PASS；不得產生可release的半套狀態。 |
| `079-E QA freeze` | 079-D | focused contract、既有expected、browser evidence與fixture finding收斂 | QA-079-01～28、typecheck、focused regression、isolated build與cleanup evidence全部可追溯後交獨立QC；目前尚未完成全矩陣PASS。 |

RD每完成一個slice更新`.ai-doc/dev_task.md`為實際狀態與證據，不可預先標示後續slice完成。A～C可作本機reviewable commits，但整個DEV-079 application change只在D完成後才是可驗證artifact；任何中間commit均不可部署。

#### Dirty-worktree boundary and baseline

2026-08-19盤點到8個direct-edit files已dirty：`package.json`、`scripts/qc-dev-053-drawing-workbench-ui.mjs`、`src/app/globals.css`、`src/components/drawing-workbench.tsx`、`src/components/number-state-workspace.tsx`、`src/components/numbering-candidate-revision-editor.tsx`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/lib/pdm-entity-detail-contract.ts`。另有2個validation-only files dirty：`src/components/drawing-projection.tsx`、`src/lib/pdm-workbench-contract.ts`。

RD開始每個dirty direct file前先保存`git diff -- <file>`與scoped hash；只在目前working copy用窄hunk patch，禁止checkout／reset／整檔覆寫、整批stage或把無法歸屬的hunk算入DEV-079。若同一hunk無法安全分離，停止並回報Dev PM。

文件升級前的dirty baseline：

| Command | Result | Interpretation |
|---|---|---|
| `npm run qc:dev-053:ui` | FAIL 23/24 | formal filters／linked-part identity assertion失敗；既有baseline finding。 |
| `npm run qc:pdm-entity-detail-drawer` | FAIL | candidate identity assertion失敗；既有baseline finding。 |
| `npm run qc:dev-067:ui` | PASS | 舊editable-candidate expected仍成立，實作後必須有意改寫。 |
| `npm run qc:dev-067:navigation` | PASS | 舊approval-only fallback仍成立，實作後須擴為surface-aware。 |
| `npm run qc:dev-072:contract` | PASS | 舊action inventory baseline。 |
| `npm run qc:dev-072:api` | PASS | 舊Drawing command/decision baseline，實作後須改navigate。 |
| `npm run typecheck:app` | PASS | 文件升級前型別基線。 |

兩個既有FAIL不阻擋文件達到RD Implementation Ready，但會阻擋079-E PASS。RD／QA不得刪assertion、放寬expected或把它們誤報為DEV-079 regression；必須先重現、歸因並以修復或獨立owner/evidence關閉。

#### Rollout, rollback and Definition of Done

- 不新增DEV-079 feature flag。`PDM_UNIFIED_ENTITY_DETAIL_V1`只決定使用哪個唯讀renderer，不能決定Drawing是否可在drawer寫入。
- Local rollout順序固定A→B／C→D→E；B與C可在A後平行，但D必須同時依賴兩者。Production rollout未授權。
- Release artifact若未同時包含canonical owner/reviewer route與全部Drawing drawer zero-write，不得進staging／production。
- 無schema／migration／資料回填，故無DB rollback。P0、open redirect、permission旁路、重複mutation或任一drawer write發生時，回退整個DEV-079 application artifact／commit set至前一版本；不得只恢復單一legacy／unified branch。舊`/numbering/revisions`compatibility adapter保留作降級入口。
- DoD：原079-A～D direct edits可追溯；HD-079-04新增／修改檔案與本輪候選唯讀抽屜修正以scoped diff為準，visual-first contract與預覽／歷史版次focused contract、typecheck、affected lint與readonly browser evidence已取得。QA-079-01～28、四actor／三viewport完整matrix與既有fixture findings仍須由獨立QC結案。DoD不授權commit／merge／deploy／release或live data操作。

## 2026-08-14 DEV-072 Amendment - 可預期但不可旁路的明細動作列

Status: `Local RD/QA/QC Complete / Human Confirmed / Production Release Gated`.

### 2026-08-14 Approval owner drawer follow-up - 審核情境移除重複流程入口

在 `/approvals` 由送審項目進入的 `UnifiedPdmEntityDetailDrawer` 已經是審核者正在處理的明細，不再重複提供會把人帶回同一流程或改變受控資料的 owner workflow entry：

- `detail:<owner>:view_review`（`查看審核`）省略：目前已在審核工作台。
- `detail:<owner>:withdraw_review`（`撤回送審`）省略：撤回是送審者／owner 的送審流程操作，不是審核者決策操作。
- `detail:relation:manage_relation`（`維護圖料關聯`）省略：審核者只查閱送審快照與做 request 允許的決策，不在審核抽屜開啟關聯維護。

此規則只由 server resolver 在 `review` receipt 存在的 Approval owner context 套用；一般圖號、料號、圖料根號工作台，以及未帶 review receipt 的 owner detail 不變。審核決策 action 與「返回」保留，Projection data、3D／2D preview、snapshot 與 command authority 不變；審核者畫面只去除重複的人類狀態 badge 與 `自動預覽` 標題列。

### 2026-08-14 Visible detail cleanup - 預覽資訊去重

在所有 `UnifiedPdmEntityDetailDrawer` context 中，`DrawingProjection` 不再顯示重複的「預覽狀態／代表狀態」fact，也不顯示 `DrawingDetailPreview` 的 `自動預覽` 標題列；3D／2D preview card、檔案名稱、ready／missing／running 等卡片內狀態仍保留。預覽狀態只在實際 3D／2D 卡片內呈現，避免同一狀態在圖面資料摘要、區段標題與預覽卡重複。

### Human decision and problem statement

圖號、料號、圖料根號及審核 owner detail 現行只顯示「現在可按」或「現在主要」的動作，其他動作在不同狀態突然出現或消失。這讓使用者無法預先建立流程心智模型，也無法知道完成目前條件後可做什麼。人類已確認以下顯示原則：

1. 對目前 owner surface 與物件生命週期仍然**適用**的動作一律顯示；尚不可執行時顯示低色階鎖頭並禁止操作。
2. locked 原因不常駐佔版；桌面 hover、鍵盤 focus、觸控點擊鎖頭時顯示短提示。
3. 不屬於該 surface、跨 domain 的管理動作、或已永久終結且未來不可能執行的動作完全不顯示，也不放進「更多」。資料摘要仍依 projection policy 顯示，不因隱藏跨 domain 動作而消失。
4. 可執行動作以 primary／accent 渲染提示；同一動作由 locked 轉 enabled 時位置與文字不變。
5. 每個情境最多一個 primary CTA；審核情境在 owner action catalog 上增加精確允許的審核決策，送審期間 owner mutation 保持 locked。

此設計有意取代「只顯示當下 CTA」、「無權限時不顯示 disabled 假入口」及「disabled 原因必須常駐在控制項旁」在本共用 drawer action bar 的舊顯示規則；不取代 server permission、狀態機、separation of duties、domain command authority、active-review write lock、idempotency、audit 或 publication authority。Spec Impact Preflight：`Intentional replacement`。既有 DEV-067 composer／projection ADR 足以承載本變更，不新增架構 ADR。

### Applicability contract

server 必須先判定 action 是否適用，再判定現在能否執行：

```text
action definition
  -> applicable = false  => omit from payload and DOM
  -> applicable = true
       -> enabled = true  => render actionable control
       -> enabled = false => render locked control + accessible reason
```

- `applicable` 是 domain、surface、生命週期及永久終態的判定，不等同權限。client 不得以 CSS 隱藏 server 已回傳的不適用動作，也不得自行補出 server 未授權的動作。
- 因 prerequisite、processing、active review、actor permission、ownership 或 separation-of-duties 暫時不能執行，但未來仍可能執行的 action 保留並 locked。
- 已取消、作廢、純歷史、永遠不屬於該 owner surface，或沒有任何合法恢復路徑的 mutation action 必須省略；utility read action 只有仍有任務價值時保留。
- `disabledReason` 必須是人類可理解的一句原因與必要責任角色；machine reason 使用獨立 `disabledReasonCode`。UI 不得顯示 raw API error、stack、SQL 或內部例外。
- disabled control 的 click、Enter、Space、touch 及 direct API 旁路均不得導航、送 request 或造成資料異動；domain server authority 仍須對 enabled command 重新驗證，不能信任 client descriptor。

### Owner action inventory

以下是 action **種類清冊**，不是要求所有列同時渲染；resolver 仍依上節判斷 applicable。跨 domain 資料可以摘要顯示，但跨 domain 管理 action 完全省略。

| Owner surface | 可納入的 action catalog | 必須省略的跨 domain action |
|---|---|---|
| Drawing | `edit`（UI label：`圖面維護`，同一入口承載主資料與附件維護）、`submit_review`、`view_review`、`withdraw_review`、`create_revision`、`view_history`、`refresh`、`return` | Part 主資料編輯、Relation 管理 |
| Part | `edit`、`submit_review`、`view_review`、`withdraw_review`、`view_history`、`refresh`、`return` | Drawing 檔案／進版、Relation 管理 |
| Relation | `manage_relation`、`submit_review`、`view_review`、`withdraw_review`、`view_history`、`refresh`、`return` | Drawing 檔案／進版、Part 主資料編輯 |
| Assigned active review | request policy 精確允許的 `approve`、`return_for_correction`、`reject`，加上 `return`；Approval owner context 省略 `view_review`、`withdraw_review`，且 Relation 不提供 `manage_relation` | request scope 外、未指派、跨公司或該 domain 不支援的 decision，以及審核者不應在此處執行的 owner workflow entry |

`return` 可依「哪裡來，哪裡去」由 drawer close／back affordance 承擔，不要求在 footer 重複一顆按鈕；但 return contract 必須在 action model 或 shell contract 中可驗證。`refresh` 只在 delayed／processing／recoverable error 有任務價值時適用。

### Stable grouping, order and rendering

- 固定群組順序：`object -> workflow -> review -> utility`。同群組由 server `order` 排序；狀態切換不得改變同一 action 的相對位置。
- `primary` 只能有 0 或 1 個。當 prerequisite 尚未完成時，未來 primary 仍留在其固定位置但為 locked；目前可推進流程的 action 才使用 primary/accent。其他 action 為 secondary／tertiary。
- 本 contract 不提供「更多」作為 action 倉庫。不適用 action 完全省略；適用 action 必須在 action bar 可發現。
- locked control 使用低色階 lock icon、正常可讀標籤、`aria-disabled="true"` 與明確 focus style；不得只靠顏色，也不得使用不可 focus 的原生 disabled button 作為唯一 DOM。
- 原因提示使用同一 accessible tooltip／popover primitive：pointer hover 約 300ms、鍵盤 focus 立即、touch 點擊鎖頭開啟；最多兩行、不可包含互動連結；Escape、移出／失焦、點外關閉。native `title` 不得作為唯一提示機制。
- drawer action bar 必須維持單一 body scroll owner、sticky/footer 安全距離與 1440×900、1024×768、768×1024、390×844 可達性；不可遮住內容、產生水平 overflow 或讓 mobile touch target 小於既有設計系統下限。

### State expectations

| State family | Expected action behavior |
|---|---|
| 建立／準備中 | 編輯或補件可用；`送交審核`固定顯示但 locked，提示尚缺的最高優先 prerequisite |
| 可送審 | 同位置的`送交審核`解鎖並成為唯一 primary；不新增第二顆送審按鈕 |
| 送審／審核中（owner 工作台） | `查看審核`為主要可用動作；owner edit、檔案、關係等適用 mutation locked，提示`送審中不可修改`；撤回只在 policy 允許時 enabled，否則 locked 或在永久不適用時省略 |
| 審核者 Approval owner drawer | 不重複顯示 `查看審核`、`撤回送審`；Relation 也不顯示 `維護圖料關聯`；只顯示 request 允許的決策與安全返回，投影與審核快照仍完整可查閱 |
| 系統正式化／處理中 | mutation locked；有任務價值時顯示可用`重新整理`／`查看處理狀態`，不提供人工發布 |
| 退回補正 | owner 修正動作解鎖；重新送審保留但在 prerequisite 未完成前 locked |
| 已發布／受控 | Drawing 的`建立新版`依 authority 可用或 locked；首版送審、審核決策等已不適用 action 省略 |
| 已取消／作廢／純歷史 | mutation action 全部省略；只保留仍具任務價值的 history／return/read utility |

### Typed contract and API version

現行 `pdm-entity-detail.v1` 的 `primary` 必填、descriptor 欄位不足且 Drawing 可由 client override，無法安全表示本需求。這是 feature-gated、`private, no-store`、由同一部署的單一 drawer 消費的內部 API；RD 必須將 response 明確升為 `pdm-entity-detail.v2`，不得在同一 schema version 靜默改變 nullability 或 action semantics。endpoint 與 query parameters 不變：

```text
GET /api/pdm/entity-details/[entityKey]
  ?surface=drawing|part|relation
  &reviewRequestId=<optional exact request>
  &returnTo=<validated local path>
```

`src/lib/pdm-entity-detail-contract.ts` 的目標型別固定如下：

```ts
type PdmDetailActionKind =
  | "edit"
  | "submit_review"
  | "withdraw_review"
  | "approve"
  | "return_for_correction"
  | "reject"
  | "retry_apply"
  | "retry_cleanup"
  | "create_revision"
  | "view_review"
  | "manage_relation"
  | "view_history"
  | "refresh"
  | "return"
  | "manage_files";

type PdmDetailActionGroup = "object" | "workflow" | "review" | "utility";

type PdmDetailActionDisabledReasonCode =
  | "PDM_ACTION_PREREQUISITE_MISSING"
  | "PDM_ACTION_PERMISSION_REQUIRED"
  | "PDM_ACTION_OWNER_REQUIRED"
  | "PDM_ACTION_REVIEW_LOCKED"
  | "PDM_ACTION_REVIEW_SCOPE_REQUIRED"
  | "PDM_ACTION_REVIEW_DRIFT"
  | "PDM_ACTION_PROCESSING"
  | "PDM_ACTION_TARGET_UNAVAILABLE";

type PdmDetailActionExecution =
  | { type: "navigate"; href: string }
  | {
      type: "command";
      method: "POST";
      href: string;
      body: Record<string, string | number | boolean | null>;
      input: "none" | "optional_reason" | "required_comment";
      success: "refresh_detail" | "return_to_inbox";
    }
  | { type: "local"; command: "refresh" | "return" };

type PdmDetailActionDescriptor = {
  id: `detail:${"drawing" | "part" | "relation" | "approval" | "navigation"}:${string}`;
  kind: PdmDetailActionKind;
  owner: "drawing" | "part" | "relation" | "approval" | "navigation";
  label: string;
  tone: "primary" | "secondary" | "danger";
  placement: "primary" | "secondary";
  group: PdmDetailActionGroup;
  order: number;
  enabled: boolean;
  disabledReason: string | null;
  disabledReasonCode: PdmDetailActionDisabledReasonCode | null;
  permissionCode: string | null;
  contactRole: string | null;
  execution: PdmDetailActionExecution | null;
  requiresConfirmation: boolean;
  idempotencyRequired: boolean;
};

type ContextActionBarModel = {
  primary: PdmDetailActionDescriptor | null;
  secondary: PdmDetailActionDescriptor[];
};

type PdmEntityDetailResponse = {
  schemaVersion: "pdm-entity-detail.v2";
  // entity/header/projections/navigation stay compatible with v1
  actionBar: ContextActionBarModel;
};
```

不新增 `visible` 或 `applicable` 欄位：不適用即不回傳。`primary` 與 `secondary` 合計必須包含所有 applicable context actions，且 group/order 是穩定順序的唯一權威。enabled action 必須有非 null `execution`；locked action 必須 `execution=null`，避免 event guard 失效時仍保留可執行 target。`href`／`commandRef` 舊欄位由 v2 的 discriminated `execution` 取代，不保留兩份 action target truth。

`GET /api/pdm/entity-details/[entityKey]?surface=...&reviewRequestId=...&returnTo=...` 回傳的 `actionBar` 是 drawer 的唯一 action truth。現行 Drawing route 的 `primaryContextAction` client prop／override 必須自 `UnifiedPdmEntityDetailDrawer` public contract 移除；`drawing-workbench.tsx` 的 list-row `primaryAction` 可繼續服務清單列，但不得再注入或覆蓋 drawer action bar。Part、Relation 與 Approval owner route 同樣不得新增平行 override。

### Server action resolver contract

新增 `src/lib/pdm-detail-action-resolver.ts`，只接受已驗證的 server facts，不讀 request query 中的 role、enabled、action kind 或 permission。`PdmEntityDetailService.compose()` 在同一次 aggregate read 後傳入：

- canonical `entityKey`、requested owner `surface`、server-derived `stateFamily`；
- candidate workspace ID、owner ID、row version、lifecycle-v2 effective flag、active request ID、decision count；
- formal Drawing number、current lifecycle request／submitter／decision count；
- readiness blocker codes，依既有 owner service 的必要條件排序；
- exact review receipt、allowed decisions、snapshot drift 與 return path；
- server-resolved capability map及現有 canonical owner href。

新增 `src/lib/pdm-detail-action-capabilities.ts`，由 API route 對 authenticated user/company 一次取得本 surface 所需 capability。允許的既有 permission code 只有：

| Capability | Existing permission authority |
|---|---|
| workspace edit | `numbering.workspace.update` |
| formal/candidate Drawing data edit | `numbering.draft.update` |
| submit review | `numbering.candidate.review.submit` |
| withdraw review | `numbering.candidate.review.withdraw` |
| retry publication | `numbering.publish` |
| create Drawing revision | `post_release_change` |
| manage Drawing files | `numbering.attachments.manage` 或既有 revision owner authority |
| edit Part variant | `numbering.draft.update` |
| manage Drawing-Part relation | `numbering.link_variant` |
| show Admin permission link | `settings.admin_matrix` |

review decision 不以一般 role boolean 取代；仍以 DEV-067 exact request/company/target `PdmReviewScopeReceipt` 與 decision API 為權威。permission resolution 位於 read snapshot 外，aggregate projection 的 `16/16/24/28` query budget不變；capability checks 必須是固定集合，不得依附件／料號／關聯數量 N+1。

### Canonical action IDs, order and primary selection

stable ID/order 固定如下；不適用可省略，但不得重編號或把 enabled action移到前方：

| Action | Stable ID pattern | Group / order |
|---|---|---:|
| edit | `detail:<owner>:edit` | `object / 100` |
| manage_files | `detail:drawing:manage_files` | `object / 110` |
| manage_relation | `detail:relation:manage_relation` | `object / 120` |
| submit_review | `detail:<owner>:submit_review` | `workflow / 200` |
| view_review | `detail:<owner>:view_review` | `workflow / 210` |
| withdraw_review | `detail:<owner>:withdraw_review` | `workflow / 220` |
| retry_apply | `detail:<owner>:retry_apply` | `workflow / 230` |
| retry_cleanup | `detail:<owner>:retry_cleanup` | `workflow / 240` |
| create_revision | `detail:drawing:create_revision` | `workflow / 250` |
| view_history | `detail:<owner>:view_history` | `workflow / 260` |
| approve | `detail:approval:approve` | `review / 300` |
| return_for_correction | `detail:approval:return_for_correction` | `review / 310` |
| reject | `detail:approval:reject` | `review / 320` |
| refresh | `detail:navigation:refresh` | `utility / 900` |
| return | `detail:navigation:return` | `utility / 910` |

primary 選擇是純 server priority，不依 client array position：

1. exact assigned review 且可決策：`approve`；
2. correction/building：enabled `edit` 或 `manage_relation`；
3. ready：enabled `submit_review`；
4. in-review owner surface：`view_review`；
5. recovery：enabled `retry_apply` 或 `retry_cleanup`；
6. released Drawing：enabled `create_revision`；
7. processing、terminal、只有 locked actions或只有 utility read：`primary=null`。

locked future action不得以 primary tone 假裝可執行；它保留原 group/order並使用 secondary low-tone lock。當同一 action 解鎖時 ID/order/label不變，只改 `enabled`、reason、tone/placement、execution。

### Applicability and disabled-reason precedence

resolver 依下列順序選一個最可行的 locked reason，禁止 client拼接：

1. snapshot drift／exact review scope不成立；
2. active-review mutation lock；
3. system processing；
4. ownership／submitter條件；
5. permission；
6. readiness prerequisite；
7. canonical target 暫不可用。

狀態 inventory 固定為：

- Candidate building/preparation/correction：owner object actions + `submit_review`；尚缺必要條件時 submit locked。尚未存在 request 時不顯示 `view_review/withdraw_review`。
- Candidate ready：同一 `submit_review` 解鎖；object actions仍依 owner/permission可用。
- Candidate/formal in review（owner 工作台、未帶 review receipt）：object mutations保留但以 `PDM_ACTION_REVIEW_LOCKED` 鎖定；`view_review`可用；`withdraw_review`只要 request仍具可能撤回的語意即顯示，非 submitter、已有 decision或缺權限時 locked，request已 terminal則省略。
- Auto-finalizing：mutation locked；只有有任務價值的 `refresh`／processing view，不顯示人工 publish。
- Recovery：只顯示現有 owner authority真正支援的 retry/view/history；不得新造 publish command。
- Released/controlled Drawing：candidate submit/withdraw省略；`create_revision`依 `post_release_change` enabled或locked；history可用。
- Formal Part：Part-owned `edit`與history；Drawing file/revision及Relation管理省略。
- Formal Relation：Relation-owned `manage_relation`與history；Drawing file/revision及Part edit省略。
- Cancelled/obsolete/merged/history-only：mutation全部省略，只保留有資料可看的 history及 shell return。
- Assigned active review：Approval owner context 不套用 owner workflow entry 的重複入口；省略 `view_review`、`withdraw_review`，Relation 的 `manage_relation` 亦省略，只疊加 request真正允許的 decisions 與安全 return。未列於 `allowedDecisions` 的 decision省略，而不是顯示全域三顆按鈕。

### Existing command routing and payload

DEV-072 不新增 domain mutation API。server descriptor只可指向下列既有 owner authority；所有 command仍由 endpoint重新驗證 permission、company、state、ownership、row version、review lock與 idempotency：

| Action | Existing execution |
|---|---|
| candidate submit | `POST /api/numbering/draft-workspaces/{workspaceId}/submit-bundle-review` when lifecycle v2 effective，否則既有 `/submit-review`; body包含 server-read row version與 reason；Idempotency-Key必填 |
| candidate withdraw | `POST /api/numbering/draft-workspaces/{workspaceId}/withdraw-bundle-review` when lifecycle v2 effective，否則既有 `/withdraw-review`; body包含 server-read row version與 reason；Idempotency-Key必填 |
| formal Drawing review withdraw | `POST /api/approvals/requests/{requestId}/withdraw`; Idempotency-Key必填 |
| review approve/return/reject | `POST /api/approvals/requests/{requestId}/decisions`; body decision只能來自 descriptor kind mapping，非 approve需 `required_comment`; Idempotency-Key必填 |
| create revision | existing `/numbering/revisions?drawingNumber=...&returnTo=...` canonical navigation |
| edit/files/relation/history/view review | existing canonical owner href/anchor only；若目前沒有可完成任務的 owner target，該 action不得標 enabled，且不得新增平行 drawer或跨-domain write API |
| refresh/return | drawer local refresh與 validated `navigation.returnTo` |

command body內的 row version是當次 detail response 的 optimistic token；若 response在執行前已 stale，existing endpoint回409。client 顯示人類化訊息並重新讀取整個 v2 detail；不得自動以新 version重送。busy期間該輪所有 mutation controls設 `aria-busy`/locked且 exactly-once；navigation/read actions可依既有 UX保留。

### Shared control component and interaction contract

新增 `src/components/pdm-detail-action-control.tsx`，由 `UnifiedPdmEntityDetailDrawer` 的 primary/secondary actions共用：

- enabled navigate使用 `<a>`；enabled command/local使用 `<button>`。
- locked一律使用可聚焦的 `<button type="button" aria-disabled="true">`，不使用 native `disabled`，並在 click／Enter／Space handler第一行阻擋 execution。
- 每個 locked control渲染低色階 `LockKeyhole`、`aria-describedby=<stable-tooltip-id>`、`data-action-id/group/order/enabled`，供 a11y 與 QC盤點。
- tooltip state集中在 action control，不在 drawer page複製；hover 300ms timer、focus立即、touch點鎖頭開啟，Escape/blur/outside pointer關閉，unmount清 timer；使用 viewport-clamped fixed portal或等效現有 primitive。
- tooltip文字來自 server `disabledReason`，最多兩行；`permissionCode`可供支援證據，不得把 raw API/stack當主要文案。
- action busy不得把既有 permission/review reason永久覆蓋；busy只是一個本輪 UI狀態，完成後重新讀 server action truth。

`UnifiedPdmEntityDetailDrawer` 只執行 `execution` discriminated union，不依 entity state/role決定顯示。review comment UI可沿用現行最小互動，但 action kind到 decision payload mapping必須集中且 exhaustively typed；unknown kind/execution fail closed並觸發可見 generic refresh error。

### Exact implementation files

新增：

- `src/lib/pdm-detail-action-resolver.ts`：pure applicability、reason、order與primary resolver。
- `src/lib/pdm-detail-action-capabilities.ts`：固定 permission capability resolver。
- `src/components/pdm-detail-action-control.tsx`：共用 enabled/locked/tooltip control。
- `scripts/qc-dev-072-action-contract.mjs`：v2 schema、inventory、negative inventory、stable order、no client override、no CSS hiding。
- `scripts/qc-dev-072-action-api.mjs`：disposable fixture 的 disabled no-op、direct API fail-closed、submit/withdraw/decision/idempotency/data hash。
- `scripts/qc-dev-072-browser.mjs`：AI real-browser `ACT-016..030`、四 viewport與 evidence manifest。

修改：

- `src/lib/pdm-entity-detail-contract.ts`、`src/lib/pdm-entity-detail.ts`。
- `src/app/api/pdm/entity-details/[entityKey]/route.ts`：capability resolution與v2 response；不改 page-view gate/company isolation。
- `src/components/unified-pdm-entity-detail-drawer.tsx`：移除 `primaryContextAction`、只執行 v2 execution、nullable primary、busy/error/refresh。
- `src/components/drawing-workbench.tsx`：移除 `PdmDetailActionDescriptor` adapter與 `unifiedPrimaryAction` injection；list-row action維持。
- `src/app/globals.css`：scoped action bar、locked、tooltip、focus、touch與responsive styles。
- `scripts/qc-dev-067-unified-entity-contract.mjs`、`scripts/qc-dev-067-unified-drawer-ui.mjs`及必要的 `scripts/qc-dev-067-browser.mjs` assertions：接受v2並證明DEV-067 projection/review/return不回歸；歷史證據檔不改寫。
- `package.json`：新增 `qc:dev-072:contract`、`qc:dev-072:api`、`qc:dev-072:browser`、`qc:dev-072`。

`part-workbench.tsx`、`relation-workbench.tsx`、`app/approvals/page.tsx` 預期只需由現有 unified drawer自動取得 v2 action，無新 override；若實作必須修改，僅允許型別／selector／safe-return整合，不得加入 domain action catalog。無 schema/migration、fixture migration、新 dependency、env或feature flag；沿用 `PDM_UNIFIED_ENTITY_DETAIL_V1` 作 rollback gate，API payload schema本身為v2。

`package.json` script value 也是交付契約，不只是命名建議：

```json
{
  "qc:dev-072:contract": "node scripts/qc-dev-072-action-contract.mjs",
  "qc:dev-072:api": "node --experimental-transform-types --experimental-loader ./scripts/qc-ts-path-loader.mjs scripts/qc-dev-072-action-api.mjs",
  "qc:dev-072:browser": "node scripts/qc-dev-072-browser.mjs",
  "qc:dev-072": "npm run qc:dev-072:contract && npm run qc:dev-072:api && npm run qc:dev-067:contract && npm run qc:dev-067:policy && npm run qc:dev-067:query && npm run qc:dev-067:ui && npm run qc:dev-067:preview && npm run qc:dev-067:review && npm run qc:dev-067:lock && npm run qc:dev-067:navigation && npm run qc:dev-072:browser && npm run typecheck:app && npm run build:isolated"
}
```

### Phase sequence and exit gates

| Phase | RD scope | Exit gate |
|---|---|---|
| 1A Contract/server | v2 types、capability resolver、action resolver、route/service、Drawing override removal | `qc:dev-072:contract`、`qc:dev-067:contract`、`qc:dev-067:policy`、`qc:dev-067:query`、`qc:dev-067:navigation` PASS；ACT-001..010 static/fixture evidence |
| 1B Shared UI | action control、tooltip、nullable primary、stable layout、busy/no-op/a11y | focused component/DOM checks + affected lint/typecheck；ACT-011、013..015 PASS |
| 1C Command integration | existing submit/withdraw/decision/navigation execution、409/403 refresh、idempotency、exact review overlay | `qc:dev-072:api` + DEV-067 lock/review regressions PASS；ACT-012 and mutation evidence |
| 1D AI QC | disposable isolated app，AI真實操作ACT-016..030 | `qc:dev-072:browser`、四viewport、cleanup、P0/P1=0；aggregate `qc:dev-072` PASS |

RD每一 phase完成後才進下一 phase。若1A發現 action truth只能由 client workbench state取得，立即停止，不得先做 CSS/tooltip 製造表面完成。

### Implementation boundary and exact impact

本機 Phase 1A～1D 現在可由 RD 執行。禁止 schema/migration、新 dependency、環境變數、production/staging data、permission/state-machine改寫、第二套 drawer、直接改正式資料或 release。若實作發現必須改其中任一項，或無法由既有 server capability判定 applicability，立即停止回 Dev PM，不可在 client猜測。

Dirty worktree boundary：目前 branch已有大量既存修改，且 DEV-067相關產品檔亦為 dirty。RD 必須先記錄本任務開始時的 scoped diff，僅在上述 exact files上疊加最小變更；不得 reset、restore、重排或提交其他人的修改。若同一 hunk 無法安全分離，停止並回報衝突檔/hunk，不可覆寫。

### Acceptance and AI real-operation QC gate

- `ACT-001..015`：action inventory、applicability omission、stable group/order、唯一 primary、disabled no-op、server bypass、permission/company/request scope contract。
- `ACT-016..030`：AI 必須在真實 Chromium rendered page 操作四工作台 owner detail，覆蓋 hover、keyboard focus、touch tooltip、locked→enabled 同位置、真實 disposable 送審／撤回／決策、returnTo、四 viewport、visible error、console/network/5xx sweep。
- QC evidence authority：`.ai-doc/qa/qa-dev-072-pdm-action-discoverability-ai-real-operation-validation-plan-2026-08-14.md`。
- PASS 必須有可重跑 manifest、case result、before/after screenshots、DOM/ARIA snapshot、interaction trace、network/data mutation assertion與 cleanup 結果。單元測試、source scan、build 或「畫面看起來正確」均不能取代 AI 真實操作。
- DEV-072 本機 Phase 1A～1D 已完成；final AI real-browser evidence與aggregate均通過。DEV-067 歷史 PASS未被冒充為DEV-072證據，production release保持 gated。

### RD Readiness Review

- Architecture：沿用 DEV-067 composer/projection/server-policy ADR；新增的是 action resolver/control，不建立第二套 detail body。ADR not needed。
- API：同 endpoint 升為明示 v2；input/output、action execution、nullable primary與client override removal已固定。
- Data/schema/migration：無 persistent data change、無 migration、無 cache migration。
- Permissions：只讀取既有固定 capability；decision仍由 exact review receipt與既有 command API；不新增或放寬權限。
- State machine：不改 transition；applicability/state matrix、terminal omission與reason precedence已固定。
- Transaction/concurrency：read projection snapshot不變；write仍由既有 endpoint transaction/lock/idempotency/row version權威；409不自動重送。
- Failure recovery：unknown action fail closed、disabled零execution、403/409整體refresh、202 processing、tooltip失效不解鎖皆已定義。
- Backward compatibility/rollback：feature flag預設/現況邊界不變；同部署 client/server使用v2；關閉既有 unified detail flag回legacy，無資料回滾。
- QA/QC：ACT-001..030、phase gates、exact scripts、evidence/cleanup與AI真實操作已定義。
- Open P0/P1 readiness gap：0。高影響 deferred scope只有production release，維持既有 release gate；沒有新future phase或新DEV。

Result: `DEV-072 Local RD/QA/QC Complete / Human Confirmed / Production Release Gated`.

### 2026-08-14 DEV-072 Implementation and QC Result

- Server：`pdm-entity-detail.v2`、固定九項capability map、pure action resolver、typed execution、reason precedence、stable ID/group/order與nullable unique primary已落地。
- Client：四工作台共用同一`ContextActionBar`與`PdmDetailActionControl`；Drawing override、`primaryContextAction`、`showOwnerNavigation`與client decision mapping已退役。locked control支援hover/focus/touch、event guard、fixed portal與140px desktop stable slot；390px改為full-width。
- Command integration：沿用既有submit/withdraw/decision routes與server revalidation；403/409 fail closed，409不自動重送；`return_to_inbox`成功不再背景refresh失效detail。
- Final evidence：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T050039Z-113d57e2/`，21/21 browser cases、13 screenshots、12/12 visible-error sweeps、0 console/page error、0 unexpected 4xx/5xx、2 expected-negative、cleanup removed 8且temporary root removed。manifest含實際HEAD／branch、scoped dirty/content SHA-256與19個來源檔清單；runner只對已知Windows `next-env.d.ts` transient lock做最多三次啟動重試，其他錯誤仍fail closed。
- Mutation evidence：confirmation cancel=0 write；submit、withdraw、needs-info、reject、approve各exactly once；stale direct submit=409、permission direct submit=403，兩者domain state unchanged。
- Aggregate：`npm run qc:dev-072` PASS，包含DEV-067回歸、TypeScript與isolated production build。Focused QC conclusion：`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`。
- Boundary：無schema/migration、新permission code、domain mutation API、dependency、env或production data change；production release仍gated。

## 2026-08-12 DEV-067 Amendment - `UnifiedPdmEntityDetailDrawer`

Status: `Local RD Implemented / Local QA-QC Passed / Production release gated`.

### Fact finding and gap classification

The existing implementation has partial shell convergence, not one cross-state and cross-domain detail contract:

- Candidate and formal paths share `DrawingWorkspaceDrawer`, `DrawingDetailContent` and the low-level `PdmEntityDetailDrawer` shell.
- Candidate still composes `NumberingCandidateRevisionEditor`, `CandidateDrawingPreview`, `LifecycleV2PendingPanel` and `WorkspaceRelationsDetails`; formal composes `MasterAttachmentPanel`, `DrawingSubmissionPrerequisitePanel`, `SameRootPartPanel` and contextual entrypoints.
- Candidate preview currently maps file presence directly to `ready`, while formal preview uses the attachment/derivative queue, polling and richer ready/delayed/failed states. Sharing `DrawingDetailPreview` card markup does not make those behaviors equivalent.
- The flag-off branch in `src/app/numbering/drawings/page.tsx` still owns a separate `DrawingDetailDrawer` composition.
- Part candidate detail uses the shared workspace composition while formal Part detail directly composes `PdmEntityDetailDrawer` and `PartDetailContent`; the visible body still changes by source state.
- Relation root/candidate/child details use relation-specific composition and custom owner renderers. It reuses some owner content, but there is no single projection order or visibility contract shared with Drawing and Part.
- Existing static QC proves shared component references and a common section skeleton; it does not prove one preview orchestration, one section model or one real-browser behavior across every lifecycle state and reviewer role.

Therefore the earlier statement that all lifecycle variants use one visible detail module is only partially satisfied. A Drawing-only wrapper would also leave Part and Relation muscle memory split. `DEV-067` intentionally strengthens the contract below.

### Canonical visible component

Every covered Drawing, Part and Relation lifecycle state and actor context MUST mount one top-level `UnifiedPdmEntityDetailDrawer`:

```text
UnifiedPdmEntityDetailDrawer
├─ SharedIdentityStatusHeader
├─ ProjectionComposer（固定相對順序）
│  ├─ DrawingProjection
│  ├─ PartProjection
│  ├─ RelationProjection
│  └─ ReviewContextProjection
│     └─ ApprovalSnapshotProjection（scope/hash/diff evidence only）
└─ ContextActionBar
```

The fixed order is a sequence of available projection slots, not a requirement to render empty cards. A projection that is not applicable or not authorized is not hydrated and is omitted; the remaining slots keep their relative order. `PdmEntityDetailDrawer`, `DrawingWorkspaceDrawer` and `WorkspaceDrawer` may temporarily remain as low-level shell or compatibility wrappers, but they must not remain public APIs capable of independently assembling a covered domain body.

`UnifiedPdmEntityDetailDrawer` owns overlay geometry, shared header, one body scroll owner, focus/Escape behavior, safe return and one `ContextActionBar`. It MUST NOT contain a giant Drawing/Part/Relation status-role conditional render tree. A projection registry maps normalized projection models to domain-owned components. `DrawingProjection`, `PartProjection` and `RelationProjection` retain their domain data, preview and command authorities; they may consume facts, media identifiers, capabilities, disabled reasons and command references, but may not fetch or mutate a second object truth from inside the shared composer.

### Server-derived projection policy

The server derives `none | summary | full` for every projection from the canonical entity, surface, lifecycle state, actor capabilities, company and active review context. It returns only permitted projection data and fields. Fetching all data and hiding sections with client conditions or CSS is forbidden.

| Surface/context | DrawingProjection | PartProjection | RelationProjection | ReviewContextProjection |
|---|---|---|---|---|
| `/numbering/drawings` normal | `full`: shared 3D/2D, files/revisions, readiness | `summary`: linked part identity/summary only | `summary`: relation and traceability | `none` |
| `/parts` normal | `summary`: representative drawing identity/preview summary only; no drawing files or revision detail | `full`: part facts and permitted part documents | `summary`: linked drawings and traceability | `none` |
| `/numbering/search` relation | `full` | `full` | `full` | `none` |
| assigned active review | `full` inside exact request scope | `full` inside exact request scope | `full` inside exact request scope | `full` |

`full` means information is reachable, not that every section is expanded. Review opens decision-critical content first; secondary detail may be collapsed with a present-section navigation index. This prevents a full aggregate from becoming an unreadable long drawer.

Reviewer full visibility is an ephemeral, server-derived review-scope capability, not a global role bypass. It requires exact reviewer assignment/eligibility, active request, same company and target membership. Terminal, unassigned, tampered or cross-company context cannot obtain the full aggregate. If any required projection cannot be authorized or hydrated, decision commands fail closed and the drawer shows the recovery owner instead of silently omitting evidence.

### Projection ownership

1. **DrawingProjection** owns the existing Drawing six-section behavior in this internal order: identity/state context supplied by the shared header, automatic 3D/2D preview, attachments/revisions, readiness/next step, drawing-side relation/traceability, and its contribution to the context action model. Candidate, formal, review and history use the same preview resolver and section components.
2. **PartProjection** owns part identity facts, permitted part documents and part-side relation summaries. In Drawing context it is summary-only; in Part/Relation/review context policy may expose more. It never imports Drawing file mutation authority.
3. **RelationProjection** owns root/drawing/part topology, matrix/health/blockers and traceability. It does not duplicate Drawing or Part fields and forms that belong to their projections.
4. **ReviewContextProjection** owns request status, scope, reviewer responsibility, decision history/reason and integrity evidence. `ApprovalSnapshotProjection` is a narrow child that may show target IDs, scope, hash/diff/check result and mismatch status only. It MUST NOT render copied Drawing/Part/Relation facts, files or relationships. Snapshot drift fails closed; snapshot content never substitutes for locked owner data.
5. **ContextActionBar** is the sole primary-action owner. Projections contribute capability/action descriptors; they do not each render competing sticky footers. Candidate edit, controlled read, relation mutation and approval decision commands remain server-authorized by their existing domain owners.

### State and capability matrix

| State family | Same composer/projections | State-specific behavior allowed |
|---|---|---|
| `building`, `drawing_preparation` | same composer; policy-selected projections | editable draft facts/files; show missing requirements; one safe next action |
| `bundle_ready` | same composer; policy-selected projections | readiness complete; action bar exposes submit after risk/scope confirmation |
| `in_review`, `revision_in_review` | same composer; owner data locked | submitter may withdraw if permitted; exact reviewer gets scoped full projections and decision controls |
| `auto_finalizing` | same composer; read-only | action bar states progress/no action/retry destination |
| `correction_required` | same composer | editable only after returned state is effective; show correction reason and resubmit path |
| `recovery_required` | same composer; read-only evidence | explicit recovery owner/action |
| `rd_controlled`, `released` | same composer | controlled files remain immutable; action bar may offer revision/traceability actions |
| `history_only` / terminal | same composer; read-only | safe successor/return action; no mutation from terminal record |

This is **visible composition and interaction convergence**, not data-owner or command-authority convergence. The composer consumes server-derived projection models/capabilities and invokes domain commands without reimplementing policies.

### Shared behavior rules

1. **Identity/status**: one shared hierarchy for stable entity identity, human status, actor responsibility and validated return behavior. Domain labels may differ; header structure may not.
2. **Automatic preview**: one Drawing preview resolver/state vocabulary across every context. File presence alone is not `ready`; queued/running/ready/delayed/failed/unavailable/missing use the same polling/retry behavior.
3. **Projection order**: only present projections appear, always in canonical relative order. Surface context may set default expansion/focus but cannot create another body.
4. **Now What**: normal usable states avoid redundant teaching text; blocked/error/terminal states first identify next action and responsible owner.
5. **Action bar**: exactly one primary action. Secondary/destructive actions retain permission, impact preview, confirmation and disabled reason. Reviewer approve/return/reject is a capability in this bar, not a separate review body.

### UX and acceptance direction

- Status transitions refresh the same selected canonical entity and same drawer; they do not close one module and open another.
- The drawer body has one scroll owner. The action bar may be sticky but must not overlap preview/files/confirmation content or create a second ambiguous vertical scroll region.
- At 1440×900, 1024×768, 768×1024 and 390×844, validate every state family for overflow, crop, focus, Escape/nested-modal behavior and visible runtime errors.
- Real-browser evidence must compare Drawing, Part, Relation, candidate/formal/history, submitter and assigned-reviewer contexts at each supported viewport. Static source checks alone cannot close this brief.
- `data-component="unified-pdm-entity-detail-drawer"` (or the exact RD Contract equivalent) appears once for an open entity; legacy/candidate/formal/approval drawer body markers must not coexist.
- Network evidence proves omitted projections and prohibited fields are absent from responses, not merely hidden in the DOM. Review-scope elevation, expiry and cross-company denial require negative tests.

The implementation contract below closes the former readiness gaps. RD may execute Phase 1A through 1D locally in order without another product-design decision. Production/staging, live data, merge, PR, deploy and release remain separately gated.

## DEV-067 RD Implementation Contract（2026-08-12）

### 0. Readiness result and implementation invariant

`DEV-067` is `RD Implementation Ready`. This amendment is the executable contract for the next local implementation and intentionally replaces historical sections in this file wherever they still describe an optional read facade, an approval-owned detail body, lifecycle-specific visible bodies, or a frontend-only source-context projection.

The non-negotiable invariant is:

> One canonical entity key + one server-composed read snapshot + one `UnifiedPdmEntityDetailDrawer` + one domain projection implementation per domain + one context action bar.

The shared composer is not a new cross-domain data owner. Existing Drawing, Part, Relation and approval services remain authoritative for facts and commands. The new facade only resolves identity, authorizes projection depth, reads the existing authorities in one bounded snapshot and returns normalized view models.

No schema migration or backfill is required. Existing `approval_platform_requests`, `approval_platform_targets`, `approval_requests`, lifecycle reviewer rows and typed workbench row keys are sufficient. Existing indexes `idx_approval_platform_requests_status`, `idx_approval_platform_requests_action`, `idx_approval_platform_targets_request` and `idx_approval_platform_targets_target` are reused. If implementation requires a new table, global reviewer permission, RLS relaxation or data rewrite, RD must stop and return to Dev PM.

### 1. Exact public TypeScript contract

RD must create `src/lib/pdm-entity-detail-contract.ts` as a React/DB-free type module. The public envelope is versioned and discriminated; a `none` projection is represented by an omitted key, never by a hydrated payload that the client hides.

```ts
export type PdmEntityKey =
  | `candidate:${string}`
  | `drawing:${string}`
  | `part:${string}`
  | `root:${string}`;

export type PdmDetailSurface = "drawing" | "part" | "relation";
export type PdmProjectionLevel = "summary" | "full";
export type PdmDetailStateFamily =
  | "building" | "drawing_preparation" | "bundle_ready"
  | "in_review" | "auto_finalizing" | "correction_required"
  | "recovery_required" | "rd_controlled" | "released"
  | "history_only" | "terminal";

export type PdmProjectionEnvelope<Summary, Full> =
  | { level: "summary"; data: Summary }
  | { level: "full"; data: Full };

export type PdmEntityDetailResponse = {
  schemaVersion: "pdm-entity-detail.v1";
  entityKey: PdmEntityKey;
  surface: PdmDetailSurface;
  generatedAt: string;
  revisionToken: string;
  header: SharedIdentityStatusHeaderModel;
  projections: {
    drawing?: PdmProjectionEnvelope<DrawingProjectionSummary, DrawingProjectionFull>;
    part?: PdmProjectionEnvelope<PartProjectionSummary, PartProjectionFull>;
    relation?: PdmProjectionEnvelope<RelationProjectionSummary, RelationProjectionFull>;
    review?: PdmProjectionEnvelope<never, ReviewContextProjectionFull>;
  };
  actionBar: ContextActionBarModel;
  navigation: PdmDetailNavigationModel;
};
```

Required common models:

```ts
export type SharedIdentityStatusHeaderModel = {
  entityKind: "candidate" | "drawing" | "part" | "root";
  entityCode: string;
  displayName: string;
  humanStatus: HumanStatusProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  stateFamily: PdmDetailStateFamily;
  actorResponsibility: string;
  lockedByReview: boolean;
};

export type PdmDetailActionKind =
  | "edit" | "submit_review" | "withdraw_review"
  | "approve" | "return_for_correction" | "reject"
  | "retry_apply" | "retry_cleanup" | "create_revision"
  | "manage_relation" | "view_history" | "refresh" | "return";

export type PdmDetailActionDescriptor = {
  id: string;
  kind: PdmDetailActionKind;
  owner: "drawing" | "part" | "relation" | "approval" | "navigation";
  label: string;
  tone: "primary" | "secondary" | "danger";
  placement: "primary" | "secondary";
  enabled: boolean;
  disabledReason: string | null;
  href: string | null;
  commandRef: string | null;
  requiresConfirmation: boolean;
  idempotencyRequired: boolean;
};

export type ContextActionBarModel = {
  primary: PdmDetailActionDescriptor;
  secondary: PdmDetailActionDescriptor[];
};

export type PdmDetailNavigationModel = {
  ownerHref: string;
  returnTo: string;
  fallbackHref: "/approvals";
  targetAnchors: Array<{
    id: string;
    label: string;
    projection: "drawing" | "part" | "relation" | "review";
  }>;
};
```

Action priority is deterministic: actionable recovery first; assigned review decision second; owner lifecycle next step third; safe return last. Review context uses `approve` as the one primary action when decision-ready; return/reject/needs-information equivalents are secondary. If no mutation is legal, `return` is the primary action. Projection components may render local read links such as preview/download/section anchors, but may not render a second sticky footer or competing lifecycle CTA.

### 2. Exact domain projection fields

The domain models must not expose raw DB rows, `payload_json`, `snapshot_json`, storage keys, provider credentials, unscoped file IDs or arbitrary server errors.

`DrawingProjectionSummary` contains only `drawingId`, `rowKey`, `drawingNumber`, `displayName`, `purposeCode`, `purposeLabel`, `humanStatus`, `viewerStatus`, `availabilityScope`, `linkedPartCount` and a representative preview summary (`kind`, server state and non-download identity only). It contains no revision list, attachment list, source asset ID or file mutation capability.

`DrawingProjectionFull` contains the summary plus:

- canonical Drawing/revision identity and `stateFamily`;
- the same two-slot automatic preview model used by every context;
- current revision and allowed revision history summary;
- attachment/version rows, allowed media hrefs and per-row capabilities;
- readiness blockers and `Now What` owner;
- linked Part identity summaries and drawing-side traceability;
- command capabilities and disabled reasons, not callback functions.

The preview model is exact:

```ts
export type DrawingPreviewState =
  | "queued" | "running" | "ready" | "delayed"
  | "failed" | "unavailable" | "missing";

export type DrawingPreviewSlotModel = {
  kind: "three-d" | "two-d";
  title: string;
  fileName: string | null;
  state: DrawingPreviewState;
  stateTitle: string;
  stateText: string;
  mediaHref: string | null;
  downloadHref: string | null;
  retryCommandRef: string | null;
};
```

`PartProjectionSummary` contains `partId`, `rowKey`, `partNumber`, `rootCode`, `displayName`, `itemKind`, `humanStatus`, `viewerStatus`, `availabilityScope`, `linkedDrawingCount` and representative drawing identity only. `PartProjectionFull` adds allowed Part attributes, Part-owned documents, linked Drawing summaries, shared-model/variant summaries, lifecycle/readiness/traceability and Part command capabilities. Retired Part-cost fields remain absent.

`RelationProjectionSummary` contains `rootId`, `rowKey`, `rootCode`, relation health, counts, blockers and traceability summary. `RelationProjectionFull` adds batched Drawing/Part nodes, link topology/matrix, active changes, target anchors and relation command capabilities. It references Drawing/Part identities and anchors; it does not duplicate their file, revision, attribute or document bodies.

`ReviewContextProjectionFull` contains:

- `requestId`, source, action code/title, active status, requester, eligible reviewer responsibility and decision readiness;
- exact target index, target/section anchors and one atomic decision boundary;
- allowed decisions, reason policy, prior decisions allowed by the existing domain and recovery commands;
- `ApprovalSnapshotProjection` limited to `snapshotId`, target IDs, snapshot hash, current aggregate hash, check status, checked time, diff summary and mismatch reason;
- no copied Drawing/Part/Relation fields, file cards, raw JSON or snapshot body.

### 3. Server visibility policy and API

RD must create:

- `src/lib/pdm-entity-detail-policy.ts` for pure policy resolution;
- `src/lib/pdm-entity-detail.ts` for service orchestration;
- `src/lib/repositories/pdm-entity-detail-async-repository.ts` for one-snapshot reads;
- `src/app/api/pdm/entity-details/[entityKey]/route.ts` for the read facade.

Request:

```text
GET /api/pdm/entity-details/{encodeURIComponent(entityKey)}
    ?surface=drawing|part|relation
    [&reviewRequestId={requestId}]
```

The route requires authenticated user and company context and parses only the four typed entity-key prefixes. Without review context it requires the existing owner-page permission. With `reviewRequestId`, the server first resolves a valid `PdmReviewScopeReceipt`; that receipt is the only bounded alternative to normal owner-page read permission and exposes only its exact company/request/targets. `surface` and `reviewRequestId` are untrusted presentation inputs and never grant visibility by themselves. A failed receipt does not fall back to normal full-review data.

`resolveDetailSurfacePolicy()` takes canonical entity, requested surface, lifecycle state, company, actor capabilities and optional verified review receipt, and returns four levels. The hard matrix is:

| Effective context | Drawing | Part | Relation | Review |
|---|---:|---:|---:|---:|
| Drawing owner | full | summary | summary | omitted |
| Part owner | summary | full | summary | omitted |
| Relation owner | full | full | full | omitted |
| Verified active review | full | full | full | full |

The server serializes only fields allowed by the selected level. A summary serializer must be a separate allowlist mapper; it must not spread a full model and delete fields afterward. Network negative tests must prove that omitted fields are absent.

Response success is `200`, `Cache-Control: private, no-store`. `revisionToken` is a stable hash of canonical IDs, row versions, preview states and verified review status used to ignore stale client responses. The client must cancel/ignore superseded requests by entity key + request sequence.

### 4. One-snapshot read and query budget

`PdmEntityDetailService.detail()` owns exactly one `withPdmWorkbenchReadSnapshot()` boundary. PostgreSQL remains `REPEATABLE READ READ ONLY`; SQLite uses its transaction snapshot. The service must not call the three HTTP APIs or invoke repository methods that open nested snapshots.

RD must extract or add `...InClient(client, ...)` readers in:

- `src/lib/repositories/drawing-workbench-async-repository.ts`;
- `src/lib/repositories/part-workbench-async-repository.ts`;
- `src/lib/repositories/relation-workbench-async-repository.ts`;
- `src/lib/repositories/approval-platform-async-repository.ts`.

The new aggregate repository invokes those readers with the same snapshot client and performs batched `IN (...)` hydration for child Drawing, Part, relation, attachment and preview metadata. Projection React components do not fetch their own detail truth. Media bytes and explicit command calls are the only separate requests.

Hard local query budgets, excluding authentication/company lookup and binary media streaming:

| Context | Maximum queries | Growth rule |
|---|---:|---|
| Drawing owner detail | 16 | constant for 1/20/50 linked Parts/files |
| Part owner detail | 16 | constant for 1/20/50 linked Drawings/documents |
| Relation full detail | 24 | constant for 1/20/50 targets/nodes |
| Verified review full aggregate | 28 | constant for 1/20/50 targets; includes request, eligibility and evidence check |

No per-target, per-file or per-node query is allowed. Representative local fixture p95 is `<=500 ms` for normal owner detail and `<=800 ms` for verified review detail. These are focused local gates, not production SLOs.

All required projections are one logical response. A required full projection failure returns the aggregate failure; the server may not return partial success that looks complete. Preview derivative failure is represented in its slot and does not erase the verified original-file row. A missing or unreadable decision-required original evidence sets review decision readiness to false.

### 5. Review scope, exact owner route and multi-target aggregate

RD must create `src/lib/pdm-review-scope.ts`. It resolves a request-specific capability receipt by reusing the same domain decision authority, never by trusting a client role label:

```ts
export type PdmReviewScopeReceipt = {
  requestId: string;
  companyId: string;
  actionCode: string;
  actorId: string;
  entityKey: PdmEntityKey;
  ownerSurface: PdmDetailSurface;
  targetRefs: Array<{ type: string; id: string }>;
  allowedDecisions: Array<"approved" | "rejected" | "needs_info">;
  snapshotHash: string;
  currentAggregateHash: string;
  decisionReady: boolean;
};
```

Eligibility rules:

- drawing revision lifecycle uses the existing active workflow and `drawing_revision_lifecycle_reviewers` exact actor assignment;
- candidate bundle/publication uses existing `numbering.candidate.review.decide`, company and request-specific scope checks;
- legacy numbering actions use existing role/project/action/delegation decision eligibility;
- requester self-approval and separation-of-duties behavior remain whatever the existing decision command enforces; the read receipt cannot weaken it;
- request must be active for review (`pending`); `apply_failed` may expose recovery context only, not a new decision; terminal/unassigned/cross-company/tampered contexts never receive full-review projection data.

The owner resolver is keyed by `(source, actionCode, target type)`, not action label or the first target:

| Covered request | Canonical owner result |
|---|---|
| `numbering.candidate_bundle_review` | `/numbering/search`, `candidate:{workspaceId}` |
| existing `numbering.candidate_publication_review` | `/numbering/search`, `candidate:{workspaceId}` |
| `numbering.drawing_revision_lifecycle_review` | `/numbering/drawings`, `drawing:{drawingId}` resolved from package |
| `numbering.drawing_revision_impact_review` | `/numbering/drawings`, canonical `drawing:{drawingId}` |
| `numbering.same_drawing_variant_after_release` | `/numbering/search`, shared `root:{rootId}` resolved from Drawing/Part |
| `numbering.main_drawing_restore` | `/parts`, canonical `part:{partId}` |
| `numbering.obsolete_part_number` | `/parts`, canonical `part:{partId}` |
| `numbering.obsolete_ma_drawing` | `/numbering/drawings`, canonical `drawing:{drawingId}` |
| `numbering.obsolete_part_root` | `/numbering/search`, canonical `root:{rootId}` |
| `numbering.release` / `numbering.release_missing_ma_confirm` | route by stored primary entity type; root -> relation, drawing -> Drawing, part -> Part |

BOM, submission, drawing-package supplement, transfer-package and other approval domains remain out of DEV-067. Their inbox behavior stays unchanged.

Multi-target resolution follows this order: explicit workspace/root primary target; shared formal root of all Drawing/Part targets; single canonical Drawing; single canonical Part. Targets that span more than one root or cannot be joined to one canonical aggregate return `PDM_REVIEW_AGGREGATE_AMBIGUOUS` and are not actionable; the server never guesses the first target. Stable anchors use `target:{targetType}:{targetId}` and scroll within the same drawer. One request retains one atomic decision bar even when several targets are shown.

### 6. Active-review write lock and transaction boundary

RD must create `src/lib/pdm-review-lock.ts` with `lockPdmEntityScopeAsync(client, targetRefs)` and `assertPdmEntityWriteAllowedAsync(client, input)`. Both review submission and every covered mutation use the same coarse entity locks before reading/fixing the snapshot or changing reviewed content. PostgreSQL locks canonical rows with `FOR UPDATE`; SQLite uses the existing write transaction. The global lock order is `workspace -> root -> drawing -> part -> revision -> attachment/relation`, then lexical canonical ID inside each kind. Dependent rows are locked only after their canonical owner. Multi-target submit sorts/deduplicates the full target set first. This order is mandatory to prevent write-vs-submit races and cross-command deadlocks.

The write guard executes on the same transaction/client after `lockPdmEntityScopeAsync` and before any state/file-reference write. Review-request creation locks the same scope, recomputes the aggregate/hash in that transaction, then inserts the pending request/targets. A read-before-transaction check, inconsistent lock order or snapshot calculation before the common scope lock is insufficient.

Lock states:

- `pending`: reviewed fields are locked;
- `apply_failed`: approved scope remains locked; only existing retry/recovery commands are legal;
- `needs_info`, `rejected`, `cancelled`: candidate/editable scope is unlocked only after the existing domain command atomically transitions it to correction/draft state;
- `approved` / `applied`: review lock ends, but existing controlled/released immutability continues;
- drawing lifecycle follows its existing workflow state; `correction_required` is editable only through the current revision lifecycle contract.

The command matrix is:

| Command family | During active review | Integration point |
|---|---|---|
| workspace facts, candidate numbers, candidate revision metadata | reject `409 PDM_ENTITY_REVIEW_LOCKED` | number-state/lifecycle repository transaction |
| candidate file upload, verify, remove or replace | reject | candidate revision command transaction |
| Drawing/Part attachment upload, delete, restore or replace | reject | `master-attachments-async.ts` owner transaction |
| Drawing revision file/submission content change | reject | drawing revision/submission service transaction |
| Part variant/shared-model/document mutation | reject | Part/numbering repository transaction |
| Drawing-Part link, relation or root membership mutation | reject | numbering/relation repository transaction |
| preview derivative enqueue/poll/read/download | allow if source hash/owner link is unchanged | existing preview/media authority |
| Drive sync of unchanged bytes/hash | allow; reject if it changes reviewed content identity | master attachment service |
| withdraw, return/reject, approve, retry apply/cleanup | allow only through existing domain command | approval/lifecycle authority |
| audit, event, notification and read-only trace | allow | existing authority |

The UI disabled state mirrors the guard, but server rejection is the acceptance boundary. Direct HTTP tests must cover at least one route from every rejected family and concurrent `lock-vs-write` / `write-vs-submit` interleavings. No write may commit after the review snapshot hash has been fixed without causing the submit/decision transaction to fail.

### 7. Preview orchestration parity

`DrawingProjection` is the only visible owner of `DrawingDetailPreview`. Candidate, formal, relation and review adapters all produce `DrawingPreviewSlotModel`; none may translate file existence directly to `ready`.

Canonical behavior:

- server resolves `queued/running/ready/delayed/failed/unavailable/missing` from source hash, non-fake derivative and job heartbeat;
- while a slot is queued/running/delayed and the document is visible, the drawer controller revalidates the same unified detail endpoint every 2.5 seconds, with one in-flight request and cleanup on key change/unmount;
- media is fetched only when the slot is `ready`; an unexpected `409 PREVIEW_NOT_READY` keeps the existing two-second bounded media retry as race recovery;
- retry uses the existing owner preview command and then refreshes the same entity key;
- exact review media href carries `reviewRequestId`, and the existing owner file/preview route calls the same `PdmReviewScopeReceipt` validator before allowing scoped read; no approval-evidence preview body is used;
- `src/app/api/approvals/requests/[requestId]/evidence/[fileId]/route.ts` remains compatibility-only and is not called by enabled DEV-067 UI.

### 8. Navigation and return-state contract

`/approvals` inbox items receive a server-built `ownerHref`. The browser must not build it from title/action text. The href shape is:

```text
{ownerPath}?view={currentOwnerView}
  &detail={encodedEntityKey}
  &reviewRequestId={encodedRequestId}
  &returnTo={encodedSafeApprovalsPathAndQuery}
```

`returnTo` must start with one `/`, must not start with `//`, must contain no control characters and must resolve to `/approvals` for review entry. Put the validator in a shared exported helper; do not duplicate the current private helper. Invalid/missing values fall back to `/approvals`.

Close button and explicit return call `router.push(returnTo)`. Browser Back uses history naturally. After approve/return/reject/retry completion, the command result returns the safe destination; the owner route navigates there, and the inbox reloads while preserving status/domain/action/query and `requestId` selection if still present. A 401 routes to login with the current owner URL as login return; 403/404/stale review preserves a visible safe return without leaking cross-company identity.

### 9. Failure and recovery contract

| HTTP/code | Visible first answer | Required next action |
|---|---|---|
| 400 `PDM_ENTITY_KEY_INVALID` | 無法辨識這筆明細 | 回原清單重新選取 |
| 401 | 登入狀態已失效 | 重新登入後回目前 owner URL |
| 403 `PDM_REVIEW_NOT_ASSIGNED` | 你不是此案目前可處理的審核者 | 回審核工作台 |
| 404 `PDM_ENTITY_DETAIL_NOT_FOUND` | 找不到資料或目前無權查看 | 回來源清單；跨公司同樣回404 |
| 409 `PDM_REVIEW_NOT_ACTIVE` | 此案已不在待審狀態 | 回審核清單查看最新狀態 |
| 409 `PDM_REVIEW_AGGREGATE_AMBIGUOUS` | 此案範圍無法對應單一圖料明細 | 由 PDM Admin 修正送審範圍；禁止決策 |
| 409 `PDM_REVIEW_SNAPSHOT_DRIFT` | 送審完整性檢查不一致 | 禁止決策；撤回/退回後重新送審或交 Admin |
| 409 `PDM_ENTITY_REVIEW_LOCKED` | 此資料正在審核，現在不能修改 | 撤回/退回後再修改 |
| 409 `PDM_ENTITY_DETAIL_STALE` | 資料已更新 | 保留 entity key 並重新整理同一抽屜 |
| 503 `PDM_ENTITY_DETAIL_PROJECTION_FAILED` | 明細目前未完整載入 | 原地重試；禁止以部分 projection 決策 |

Raw SQL, stack trace, raw JSON, English transport error and `Failed to execute...` must never be the primary visible state. Every blocked/error/terminal state identifies the responsible owner and one next action.

### 10. Exact component ownership and compatibility retirement

RD must create:

- `src/components/unified-pdm-entity-detail-drawer.tsx`;
- `src/components/drawing-projection.tsx`;
- `src/components/part-projection.tsx`;
- `src/components/relation-projection.tsx`;
- `src/components/review-context-projection.tsx`.

`unified-pdm-entity-detail-drawer.tsx` owns the registry, header, fixed slot order, one body scroll owner, focus trap/restore, Escape, resize, safe return and action bar. It must contain no `actionCode === ...` or domain lifecycle render tree. Domain projection components receive only normalized models plus a closed command dispatcher supplied by their owner controller.

Existing components are migrated as follows:

- `pdm-entity-detail-drawer.tsx` remains the low-level non-modal overlay primitive;
- `drawing-workspace-drawer.tsx` becomes a compatibility wrapper/re-export that cannot accept arbitrary body section composition in the enabled path;
- `drawing-detail-content.tsx`, `DrawingDetailPreview` and relevant `MasterAttachmentPanel` presentation pieces move behind `DrawingProjection` without duplicating preview state resolution;
- `WorkspaceDrawer`, candidate editors and `PartDetailPanel` become section/command contributors, not top-level covered drawer owners;
- `RootDetailDrawer`, page-local Drawing/Part fallback drawers and `ApprovalDetailDrawer` are not mounted when DEV-067 is enabled;
- `/approvals` deletes the enabled-path `ApprovalImpactSummary`, `ApprovalResultBody`, `ApprovalDrawingPreview`, raw snapshot JSON and decision footer composition; it keeps inbox/filter/count plus owner navigation.

Open drawer DOM must contain exactly one `data-component="unified-pdm-entity-detail-drawer"`. No `approval-detail-drawer`, lifecycle-specific drawer body or second sticky action footer may coexist.

### 11. Exact implementation files

Required new product files are the contract/policy/service/repository/route and five components listed above, plus `src/lib/pdm-review-scope.ts`, `src/lib/pdm-review-lock.ts` and DEV-067 QC scripts.

Required existing product files to modify:

- feature/config: `src/lib/number-state-flow-feature.ts`, `src/app/api/numbering/state-flow/status/route.ts`, `.env.example`, `package.json`;
- read authority: Drawing/Part/Relation workbench services and their async repositories, `src/lib/repositories/approval-platform-async-repository.ts`, `src/lib/approval-platform.ts`;
- shared UI/controllers: `pdm-entity-detail-drawer.tsx`, `drawing-workspace-drawer.tsx`, `drawing-detail-content.tsx`, `drawing-workbench.tsx`, `part-workbench.tsx`, `relation-workbench.tsx`, `number-state-workspace.tsx`, `part-detail-content.tsx`, `master-attachment-panel.tsx`, `drawing-detail-preview.tsx`;
- owner pages: `src/app/numbering/drawings/page.tsx`, `src/app/parts/page.tsx` through `PartModule`, `src/app/numbering/search/page.tsx`;
- approval: `src/app/approvals/page.tsx`, inbox/request/decision routes and `src/lib/approval-workbench-legacy-redirect.ts` / drawing lifecycle owner href producers;
- scoped media: candidate revision file GET, Drawing/Part attachment GET and preview routes;
- lock integration: workspace/candidate revision commands, master attachment upload/delete/restore, Drawing revision file/submission, Part shared-model/variant/document and Drawing-Part/relation mutation service paths;
- style: `src/app/globals.css` for projection/index/action-bar/responsive states only.

RD must preserve unrelated dirty worktree changes and record the actual modified file list after every phase. Product implementation must use `apply_patch`; no live migration, stage, commit, merge, PR or release is part of this contract.

### 12. Feature flag and rollback

Add `PDM_UNIFIED_ENTITY_DETAIL_V1`. It defaults off and is effective only when both `PDM_UNIFIED_DRAWING_WORKBENCH_V1` and `PDM_UNIFIED_PART_RELATION_WORKBENCH_V1` are effective. `/api/numbering/state-flow/status` exposes requested/effective/dependencies and phase `DEV-067`.

Local RD/QA sets the flag on. Production remains off until a separate release gate. Turning it off restores existing owner/inbox paths without schema or data rollback. In the enabled path there is no dual render or fallback to a second visible body after a projection error; the unified drawer shows the controlled recovery state. Legacy code removal after production stabilization is a later cleanup, not a condition for safe local rollback.

### 13. Ordered implementation phases and exit gates

| Phase | Product work | Exit gate before next phase |
|---|---|---|
| 1A Contract/policy/read facade | types, policy, one-snapshot readers, unified API, feature status | TypeScript; policy/payload/query tests; 1/20/50 constant counts; no hidden fields or partial response |
| 1B Composer/domain projections | unified drawer, Drawing/Part/Relation projections, preview parity, owner workbenches | one DOM drawer; same projection component IDs; state transition retains key/selection; focused UI + preview QC |
| 1C Review routing/scope/lock | ownerHref registry, `/approvals` inbox-only path, review receipt, review projection, actions, transaction lock, safe return | assigned/denied/terminal/cross-company/drift tests; direct write bypass tests; decision idempotency; return-state browser evidence |
| 1D Compatibility/regression | enabled-path legacy body retirement, all states/viewports, aggregate regressions, isolated build | complete QA plan PASS; no open P0/P1; isolated build; handoff to independent QC |

RD may start 1A immediately and continue locally only after each exit gate passes. A phase failure remains `RD in progress`; it is not skipped by hiding the feature or marking a test blocked without evidence.

## Human Decision Brief

Confirmed decisions from APP feedback and follow-up discussion:

- The same drawing number, part number or root number must not show different object truth depending on the entry page.
- Keep separate entry pages because their primary tasks differ:
  - `/numbering/search` is the root/drawing/part relationship inspection surface.
  - `/numbering/drawings` is the drawing master workbench.
  - `/parts` is the part master workbench.
- Unify the right-side detail drawer contract:
  - click drawing number -> drawing detail;
  - click part number -> part detail;
  - click root number -> root detail.
- Apply the same rule to part numbers, not only drawing numbers.
- Entry context may change the default expanded section, scroll focus and server-authorized projection depth, but must not create a second object truth or a second domain component.
- Detail drawers remain overlay-style but non-modal: no dark backdrop, no focus trap or body lock, and the underlying list remains directly clickable for rapid inspection.
- The shared header owns one inline close `X`; entity pages must not add floating, previous/next or duplicate close controls.
- Modal confirmation dialogs remain separate and modal; opening one must prevent its `Escape` event from also closing the underlying detail drawer.

Rejected options:

- Maintain two separate drawing detail modules that show different sections for the same drawing number.
- Maintain two separate part detail modules that show different sections for the same part number.
- Merge `/numbering/search`, `/numbering/drawings` and `/parts` into one huge page. This would reduce task clarity and make scanning worse.
- Keep the relation-tree drawer as root-detail-only when a user clicks a drawing or part.
- Build one giant conditional component that mixes root, drawing and part logic in one render path.

AI assumptions:

- First implementation should use existing local data contracts where possible; no DB schema change is required for Phase 1.
- Existing owner pages and APIs remain authoritative:
  - root detail: `GET /api/numbering/roots/[rootCode]` and relation aggregation data;
  - drawing list/detail: `/numbering/drawings`, drawing attachment/readiness routes and existing same-root part data;
  - part list/detail: `GET /api/parts/[partNumber]`, permitted part-document and shared-model routes.
- `src/components/numbering-contextual-entrypoints.tsx` remains the shared action surface for root/drawing/part add and obsolete actions.
- Attachment/document permissions, lifecycle policy and company scope must follow existing server-side guards.
- `DEV-067` requires a server-derived projection policy/envelope before implementation; frontend adapters may normalize presentation only and may not fetch full data then hide it.

Re-entry triggers:

- User wants page-specific object truth or domain projection implementations to diverge beyond the confirmed `none/summary/full` policy.
- User wants to merge the three entry pages into one module.
- Implementation requires schema migration, RLS/policy changes, live Supabase migration, provider pointer change, direct data repair/deletion, production deployment, merge, PR, rollback or release artifacts.
- Existing APIs cannot expose enough drawing or part detail without introducing new product semantics.
- Server policy cannot omit restricted attachments/fields from summary/none responses, or review full visibility cannot be bounded to exact active request/company scope.

## Problem

The current UI can open the same drawing number from two places:

- `/numbering/drawings`: the drawer behaves like a drawing-governance detail surface with attachments, submission readiness, same-root parts and operational actions.
- `/numbering/search`: the drawer behaves like a relation/lifecycle summary for the selected target.

This creates a trust problem. A user sees the same object ID but receives different information depending on where they clicked. The mental model should be:

```text
Object code -> object detail
Entry page -> task context
```

The entry page may explain why the user arrived there, but it must not redefine what the object is.

## UX Intent

使用思考習慣: `#目的`, `#批判`, `#效用理論`, `#設計思考`, `#心理成因`, `#內容組織`, `#可驗證性`

- Primary users: RD, RD Manager, QA/QC, manufacturing preparation, purchasing preparation and PDM administrators.
- User mental model: a code represents one object. Clicking that code should open that object's canonical detail.
- Main task: inspect the current object, understand status/readiness/relationships, then continue with the correct next action.
- Success state: from any supported entry page, clicking `A0001-M01`, `A0001-P01` or `A0001` opens the same composer and domain projections; the server returns the confirmed task-appropriate depth without changing object truth.
- Natural next step:
  - drawing: inspect attachments/readiness/linked parts, then submit, revise, trace or impact-analyze;
  - part: inspect attributes/permitted documents/status/linked drawings, then update part data, shared model or lifecycle action;
  - root: inspect family relationship health, counts and add/obsolete actions.
- Most likely misunderstanding: users think two modules disagree about the same drawing or part record.
- Must not happen: a part click shows root-only details; a Drawing full projection hides its attachments/readiness; a source page silently returns stale data; or a summary/none surface receives restricted full payloads and only hides them client-side.

## End-State Architecture

Separate entry pages stay. Object detail becomes a shared contract.

```text
Entry page
  /numbering/search        relation-first task context
  /numbering/drawings      drawing-list task context
  /parts                   part-list task context

UnifiedPdmEntityDetailDrawer
  SharedIdentityStatusHeader
  ProjectionComposer
    DrawingProjection
    PartProjection
    RelationProjection
    ReviewContextProjection
  ContextActionBar

Domain adapters
  own projection models, preview/read authority and commands

Server DetailSurfacePolicy
  controls none/summary/full, allowed fields and review scope
```

### Object Identity Rule

| Click target | Required drawer entity type | Forbidden result |
|---|---|---|
| Root code, for example `A0001` | `part_root` | drawing-only or part-only detail |
| Drawing number, for example `A0001-M01` | `drawing_number` | root-only detail |
| Part number, for example `A0001-P01` | `part_number` | root-only or drawing-only detail |

### Source Context Rule (`DEV-067` amendment)

`sourceContext` never changes identity, domain truth or permission. Under the historical Phase 1 contract it affected only emphasis; `DEV-067` intentionally extends it with server-authorized projection depth:

| Source context | Allowed default focus/depth | Invariant |
|---|---|---|
| `relation_tree` | relation first; Drawing/Part/Relation full | canonical identity, owner data, domain permission/commands |
| `drawing_module` | Drawing full; Part/Relation summary | canonical Drawing truth; Part details are not returned |
| `part_module` | Part full; Drawing/Relation summary; no Drawing files/revisions | canonical Part truth; Drawing file authority is not imported |
| `active_review` | exact request aggregate full plus ReviewContext | locked owner data; exact reviewer/request/company scope |
| `request_fallback` | create/append context highlighted | existing object core truth |

Projection reduction is explicit task policy, not another version of the object. The server omits unauthorized/not-needed fields; client-only hiding is forbidden.

## Drawer Information Architecture

### Shared Shell

`EntityDetailDrawerShell` owns only common drawer behavior:

- right-side drawer layout, close button, width clamp and persisted width;
- resize handle;
- outside click and `Escape` close behavior;
- direct row-to-row switching without close/reopen flicker, with detail scroll reset to the top for the newly selected entity;
- loading, not found, restricted and error states;
- source context hint;
- keyboard-safe focus behavior;
- `data-entity-type`, `data-entity-code`, `data-source-context` attributes for QC.

The shell must not contain object-specific business rules except dispatching to the correct panel.

### Root Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | root code, core name, status, phase |
| Summary | drawing count, part count, manufacturing/reference counts, blockers |
| Relationship health | complete, missing manufacturing drawing, missing part, ambiguous, blocked, draft |
| Primary actions | `新增圖號`, `新增料號`, draft delete or root obsolete action when allowed |
| Relationship view | child drawings, parts, link health and orphan states |

Required sections:

- `關係摘要`: drawings, parts, links, blockers.
- `新增相關資料`: reuse `NumberingContextualEntrypoints` root mode.
- `生命週期`: draft delete, formal obsolete request, pending request state.
- `送審 / 製造可用性`: concise readiness blockers that answer "現在要做什麼".
- `Audit / history`: collapsed or lower priority.

### Drawing Detail Panel

Required first screen:

| Area | Required content |
|---|---|
| Identity | drawing number, root code, purpose `M/R`, core name/title if available |
| State | record status, development phase, lifecycle/readiness state |
| Primary actions | `進版`, `送審` or `檢查送審條件`, `追溯`, `影響分析`, contextual add/obsolete actions |
| Relationship summary | linked parts, same-root parts, manufacturing/reference semantics |
| Attachments | drawing-owned attachment library and deleted/recoverable data state |

Required sections:

- `Object lifecycle`: status, phase, why it can/cannot proceed.
- `圖號附件庫`: current attachments, deleted data section and refresh state.
- `送審檢查`: prerequisite blockers, missing attachment/data states and next CTA.
- `同根料號`: linked parts and same-root part cards.
- `關係 / 影響`: traceability and impact analysis entry.
- `新增相關資料`: drawing-context `NumberingContextualEntrypoints`.

The drawing detail panel must be the same whether opened from `/numbering/drawings` or `/numbering/search`. The relation page may default-scroll to `同根料號` or `關係 / 影響`, but it cannot omit attachments or readiness sections.

Candidate reservations that contain a drawing are members of the same `drawing_number` detail family, even though their canonical entity metadata remains `candidate_bundle`. Candidate and formal drawing drawers MUST therefore publish `data-detail-family="drawing_number"` and `data-drawing-detail-skeleton="true"`, and render this ordered section contract:

1. `drawing-overview`: purpose, linked-part summary and same-root/content summary;
2. `drawing-revision-files`: candidate first-revision editor or formal controlled revision files;
3. `drawing-preview`: real preview content, or a concise human empty state with the next step;
4. `drawing-pending`: review, missing-data, recovery or no-action guidance;
5. `drawing-more`: reference attachments, relationship/data maintenance, edit/cancel and other secondary actions.

Historical Phase 1C baseline (superseded by the 2026-08-12 `DEV-067` amendment wherever it is less strict): both lifecycle variants rendered `DrawingWorkspaceDrawer` and published `data-component="drawing-workspace-drawer"`. Candidate and formal adapters could provide different section content. The new authority is `UnifiedPdmEntityDetailDrawer` plus domain-owned projections; Drawing's six-section behavior is owned inside `DrawingProjection`, not an independently composed lifecycle body.

Candidate drawing preparation is an incomplete-data state inside the workspace, not a navigation destination. Opening a candidate MUST expose the existing first-revision editor, missing requirements and file work area inline. The visible UI MUST NOT render a `準備首版圖面` link/button that jumps to another layer, duplicate that action in header and body, or add a separate `下一步` card. When readiness becomes complete, the existing server-derived submit action becomes available in the same drawer; review, return and controlled states continue in the same component without a route change or drawer replacement.

This is component/view-model convergence, not lifecycle-authority convergence. Candidate mutation stays in `NumberingCandidateRevisionEditor` and candidate review/cancel actions; formal controlled files remain read-only in `MasterAttachmentPanel` and changes continue through the formal revision workflow. Candidate preview data is not invented. No API, schema, permission or lifecycle-authority change is introduced by this contract.

Historical Phase 1C content contract used `DrawingDetailContentModel`, `DrawingDetailSummary` and `DrawingDetailSection`, with the A0005 formal order. `DEV-067` intentionally places the human-confirmed Drawing six-section behavior inside `DrawingProjection` under the fixed cross-domain composer and further limits adapters to data/capability/command projection. These existing components may be reused internally only if they implement the new projection contract and cannot compose a second body.

Preview content is also a shared contract, not merely a shared shell. Candidate, formal and approval adapters MUST render `DrawingDetailPreview`. It always presents the same two cards—`3D 模型` and `2D 圖面`—in the same order and uses the adapter only for media, file identity, preview state and permitted actions. When a preview is unavailable, pending or missing, the same card remains visible with human-readable state and recovery guidance; a mode-specific preview grid or one-sided empty state is not permitted. Formal media may render directly, while candidate and approval may expose evidence preview/download actions, but the visual component and state vocabulary remain one source of truth.

Historical Phase 1C approval placement rendered the shared shell from `/approvals`. `DEV-067` intentionally replaces that placement: `/approvals` remains the inbox, selecting a covered request navigates to its canonical owner route and mounts `UnifiedPdmEntityDetailDrawer`. The assigned reviewer receives server-scoped full Drawing/Part/Relation projections plus decision capability and a safe return path. Approval snapshots remain integrity evidence inside `ReviewContextProjection`, not a separate visible body.

### Historical Part Detail Panel (`DEV-067` moves current behavior to `PartProjection`)

The following is retained as implemented Phase 1 history. Part-cost rows are retired by the 2026-08-11 amendment; current Part requirements are governed by the top-level `PartProjection` contract.

Required first screen:

| Area | Required content |
|---|---|
| Identity | part number, root code, part name/core name, item kind |
| State | record status, development phase, lifecycle/readiness state |
| Primary actions | part data update, cost action if permitted, shared model/MA baseline actions if applicable, contextual add/obsolete actions |
| Relationship summary | linked drawings, primary manufacturing drawing, reference-only links |
| Attributes | material, color, surface treatment, variant note |

Required sections:

- `Object lifecycle`: status, phase and action-first next step.
- `料號屬性`: material, color, surface treatment, variant note and missing-data state.
- `圖號關聯`: linked drawings, manufacturing/reference semantics, missing manufacturing blocker.
- `成本狀態`: standard cost status, pending cost request count and permitted amount visibility.
- `附件 / 模型`: part attachments, shared 3D model and MA baseline sections where current system supports them.
- `新增相關資料`: part-context `NumberingContextualEntrypoints`.

The part detail panel must be the same whether opened from `/parts` or `/numbering/search`. The relation page may default-scroll to `圖號關聯`; `/parts` may default-scroll to `料號屬性` or `成本狀態`.

## Data Contract

### Phase 1A-1B Implementation Note

The 2026-07-09 local implementation intentionally lands the user-visible parity first:

- `/numbering/search` keeps its relation-first drawer, but now dispatches by target entity and renders root/drawing/part core sections before the full relation context.
- Drawing targets reuse the existing drawing attachment component and expose drawing readiness / same-root part sections.
- Part targets load the existing part owner detail API for attributes, linked drawings and cost status.
- `/numbering/drawings` and `/parts` keep their owner workbench UI, but publish the same `data-detail-*`, `data-entity-*` and `data-source-context` metadata as the relation drawer.
- Phase 1B extracts `PdmEntityDetailDrawer` over the existing low-level `PdmDetailDrawer`. Drawing, part, relation-search and candidate/reservation details reuse the same non-modal shell, header, close control, width persistence, outside-click rule and entity metadata.
- Object-specific part/root bodies remain domain components. Candidate and formal drawing adapters both render `DrawingWorkspaceDrawer`; lifecycle-specific data and commands stay in adapters/child domain components so the shared workspace does not duplicate mutation authority.
- Human-status filters and drawer-width behavior now have shared sources instead of page-local copies.

### Historical Phase 1 Data Strategy (superseded for `DEV-067` composition/policy)

The following model records the implemented Phase 1 baseline. `DEV-067` replaces it with projection models and a server-derived `DetailSurfacePolicy`; frontend-only full-data normalization is not an allowed final contract.

```ts
type EntityDetailTarget = {
  entityType: "part_root" | "drawing_number" | "part_number";
  entityCode: string;
  rootCode?: string;
  sourceContext: "relation_tree" | "drawing_module" | "part_module" | "request_fallback";
  defaultSection?: "relationships" | "attachments" | "readiness" | "attributes" | "cost" | "actions";
  relationContext?: {
    drawingNumber?: string;
    partNumber?: string;
    relationType?: "primary_manufacturing" | "reference" | "none";
  };
};

type EntityDetailViewModel = {
  target: EntityDetailTarget;
  identity: {
    entityType: EntityDetailTarget["entityType"];
    entityCode: string;
    rootCode: string;
    displayName: string;
  };
  status: {
    recordStatus: string;
    developmentPhase: string;
    lifecycleMessage: string;
    nextStep: string;
  };
  sections: {
    relationships: boolean;
    attachments: boolean;
    readiness: boolean;
    attributes: boolean;
    cost: boolean;
    actions: boolean;
    audit: boolean;
  };
};
```

Existing sources:

| Entity | Existing source | Notes |
|---|---|---|
| Root | `GET /api/numbering/roots/[rootCode]`, relation view data | Must include drawings, parts, matrix/health where available |
| Drawing | `/numbering/drawings` list payload, drawing attachment/readiness APIs, relation data | Must include same-root parts and readiness sections from drawing module |
| Part | `GET /api/parts/[partNumber]`, part attachment/cost/shared-model APIs, relation data | Must preserve cost redaction rules |

### Historical Phase 2 Optional Data Facade（superseded by DEV-067）

This was the pre-DEV-067 option. It is retained only as history and must not be implemented as written. DEV-067 has made the unified, policy-enforced read facade mandatory and defines its exact route/types in the RD Implementation Contract above.

```text
GET /api/numbering/entities/[entityType]/[entityCode]/detail?sourceContext=
```

The facade must:

- be read-only;
- enforce existing page permission and company scope;
- reuse owner-domain services and redaction helpers;
- return no write side effects;
- avoid new identity semantics.

The optional decision is closed: `GET /api/pdm/entity-details/[entityKey]` is required in DEV-067 Phase 1A.

## Historical Phase 1A-1B Implementation Contract（implemented baseline; not DEV-067 handoff）

### Frontend

1. Create a shared shell component. Recommended path:
   - `src/components/pdm-entity-detail-drawer.tsx`
   - or a small folder under `src/components/entity-detail-drawer/`.
2. Extract object panels without changing product behavior first:
   - `RootNumberDetailPanel`
   - `DrawingNumberDetailPanel`
   - `PartNumberDetailPanel`
3. Move common drawer behavior out of page-local implementations:
   - width clamp and storage;
   - resize;
   - close/backdrop;
   - shell states;
   - QC `data-*` attributes.
4. Update `/numbering/search`:
   - relation-tree root click passes `entityType: "part_root"`;
   - drawing click passes `entityType: "drawing_number"`;
   - part click passes `entityType: "part_number"`;
   - matrix row/column identity clicks follow the same rule.
5. Update `/numbering/drawings`:
   - use the shared shell and `DrawingNumberDetailPanel`;
   - keep drawing-module source context.
6. Update `/parts`:
   - use the shared shell and `PartNumberDetailPanel`;
   - keep part-module source context.
7. Preserve `NumberingContextualEntrypoints` behavior and labels from `DEV-PDM-NUMBERING-004`.
8. Do not place cards inside cards. Drawer sections can use compact panels, rows and lists.
9. Use source context for default expanded section only.

### Backend / API

Phase 1:

- No schema migration.
- No write route required.
- Existing APIs remain owner-domain authority.
- Any new helper must be a read adapter or TypeScript view-model mapper.

Historical Phase 2 optional facade（superseded by the required DEV-067 facade）:

- Must be read-only.
- Must not bypass attachment or lifecycle permissions; historical cost references are retired.
- Must return 404/403 states in action-first Traditional Chinese when rendered.

### Permission Contract

| Data | Permission behavior |
|---|---|
| Root/drawing/part core identity | Existing page-level read permission |
| Drawing/part attachments | Existing master attachment permission path |
| Part cost amounts | Retired; no Part-cost projection or field is returned |
| Contextual add/obsolete actions | Existing `numbering.create`, `numbering.link_variant`, lifecycle/approval action guards |
| DEV-067 unified facade | Same or stricter than source APIs plus exact server summary/full allowlists |

## Failure And State Handling

| State | First visible answer |
|---|---|
| root not found | `找不到這個圖料根號，請重新查詢或確認權限。` |
| drawing not found | `找不到這個圖號，請重新查詢或確認是否已切換公司/資料範圍。` |
| part not found | `找不到這個料號，請重新查詢或確認是否已切換公司/資料範圍。` |
| restricted | `目前角色不能查看這項資料，請改用有權限的帳號或聯絡 Admin。` |
| partial relation context missing | `已開啟物件詳情，但來源關係不存在或已變更，請重新整理關係樹。` |
| API error | `明細讀取失敗，請重新整理；若仍失敗請請 Admin 檢查資料。` |

No drawer may show raw SQL, stack trace, `Internal Server Error`, route text, untranslated backend error or JSON payload as the primary visible state.

## Phase Roadmap

| Phase | Status | Purpose | Authorization |
|---|---|---|---|
| Phase 0 - Development documents | Complete | Capture UX decision, architecture, RD contract, QA and PM control entry | Authorized by user request to write development documents |
| Phase 1A - Target-aware parity implementation | Implemented locally / Release Not Authorized | Unify visible root/drawing/part detail behavior across `/numbering/search`, `/numbering/drawings` and `/parts` using existing APIs and drawer metadata | Authorized by user `完成DEV-039開發 /goal`; release not authorized |
| Phase 1B - Shared shell extraction | Implemented locally / Release Not Authorized | Reuse one non-modal shell and shared interaction/metadata contracts while preserving domain-specific panels | Authorized by user instruction on 2026-08-07; release not authorized |
| DEV-067 - Unified entity composer/projections | Local RD Implemented / Local QA-QC Passed | One composer, domain-owned projections, server `none/summary/full`, scoped review full view, one action bar and lock/return parity | Local Phase 1A～1D complete; production/schema/release gated |
| Historical Phase 2 - optional detail facade | Superseded by DEV-067 | Previous optional normalized read API | Replaced by required DEV-067 unified facade |
| Phase 3 - Release / production | Release Authorization Required | Merge/deploy/production smoke/rollback | Requires explicit release authorization and deployment-release-gate |

## RD Handoff Contract

### Historical Phase 1 - Shared Drawer Shell And Canonical Panels

This handoff records completed Phase 1A/1B behavior. Wherever it conflicts with the `DEV-067` amendment, the amendment and ADR are authoritative; it is not the implementation contract for the next delivery.

Scope:

- Build shared drawer shell.
- Extract drawing detail panel so `/numbering/drawings` and `/numbering/search` use the same drawing detail information architecture.
- Extract part detail panel so `/parts` and `/numbering/search` use the same part detail information architecture.
- Keep root detail panel as canonical root relationship detail for root clicks.
- Implement `EntityDetailTarget` and source-context default focus.
- Preserve existing drawer width/resize/keyboard behavior.
- Add focused QC for same-object consistency.

Out of scope:

- Merging the three entry pages.
- Changing identity format.
- DB schema migration.
- Permission/RLS changes.
- Production deploy, Supabase live cutover, provider pointer changes.
- Direct data repair/deletion.
- New cost workflow or attachment workflow.

Implementation contract:

- Shared shell must dispatch by `entityType`.
- Page-local code may adapt existing payloads into shared view models.
- Historical rule: source context did not hide core sections. `DEV-067` intentionally replaces this with server-authorized `none/summary/full` projection depth while preserving one domain truth.
- Drawing panel must include attachment/readiness/same-root part sections even when launched from relation tree.
- Candidate and formal render paths must directly use `DrawingWorkspaceDrawer`, publish `data-component="drawing-workspace-drawer"`, and share the header hierarchy and ordered five-section skeleton while retaining separate lifecycle actions and mutation authority.
- Candidate preparation must render inline; `準備首版圖面` cannot be a visible navigation CTA, duplicated action or second drawer/page.
- Part full projection must include current permitted attributes/documents/relationships when launched from Relation; retired cost sections are not restored.
- Root panel must include relation health, child counts and contextual add/lifecycle action sections.

Acceptance:

- Clicking `A0001-M01` from `/numbering/drawings` and `/numbering/search` opens the same DrawingProjection; the Relation context may expose the full aggregate while Drawing context keeps Part details at summary.
- Clicking `A0001-P01` from `/parts` and `/numbering/search` opens the same PartProjection; the Relation context may expose the full aggregate while Part context receives Drawing summary without files/revisions.
- Clicking `A0001` opens `part_root` detail, not drawing or part detail.
- Relation matrix row/column clicks preserve entity type.
- Source context changes default focus and server-authorized projection depth, never identity, domain truth or command authority.
- Candidate title uses the primary reserved drawing code or `尚未產生圖號`; it never substitutes a root code.
- Candidate and formal drawers expose `drawing-overview → drawing-revision-files → drawing-preview → drawing-pending → drawing-more` in DOM order; preview empty states state a human next step.
- Both candidate and formal paths expose exactly one `data-component="drawing-workspace-drawer"`; candidate first-revision editing is present without an intermediate click.
- The same drawer remains open while readiness/action state changes; each state exposes at most one primary CTA.
- No page-level horizontal overflow or drawer text overlap at desktop/laptop/mobile widths.

Evidence required:

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint -- --quiet
npm.cmd run build
npm.cmd run qc:pdm-numbering-search-ui
npm.cmd run qc:pdm-drawing-part-relation-view
npm.cmd run qc:pdm-system-detail-drawer-ui
npm.cmd run qc:part-number-module
npm.cmd run qc:pdm-entity-detail-drawer
```

Browser evidence:

- `/numbering/search` desktop `1440x900`, laptop `1024x768`, and current supported mobile/default narrow viewport.
- `/numbering/drawings` drawing drawer.
- `/parts` part drawer.
- Same drawing opened from two sources.
- Same part opened from two sources.

### Historical Phase 2 - Optional Read-Only Detail Facade（superseded）

This section is historical. DEV-067 Phase 1A now requires the normalized server-policy facade and its tests; do not wait for a new duplication-risk decision.

Historical scope:

- Add normalized read-only facade only if Phase 1 duplicates fetching or state mapping enough to create maintenance risk.
- Keep existing source APIs authoritative.
- Add facade QC for read-only/no-write-side-effect and redaction parity.

Out of scope:

- Write APIs.
- New data ownership.
- Schema/RLS changes unless separately authorized.

Acceptance:

- Facade response matches source APIs for identity/status/relationship/visibility.
- Unauthorized users do not see more through facade than through owner pages.
- Read call does not mutate audit, sequence, relation, attachment or cost records.

Evidence required:

- API facade no-write-side-effect QC.
- Cost redaction parity QC.
- Attachment permission parity QC.

## QA/QC Gate Summary

Primary QA plan:

- `.ai-doc/qa/qa-pdm-entity-detail-drawer-validation-plan-2026-07-09.md`

Minimum gates:

- 5-second object identity test: reviewer can identify whether drawer is root/drawing/part/candidate, its name, current status and next step.
- Drawing-family consistency test: candidate and formal variants share header/section grammar while candidate-only lifecycle work remains in `drawing-pending` / `drawing-more`.
- Same-projection consistency test: the same Drawing/Part projection implementation and owner data are reused across routes; only policy depth/focus/capabilities differ.
- Source-context test: server response contains only allowed `none/summary/full` data; DOM hiding cannot satisfy the gate.
- Visible error sweep.
- Keyboard and close/resize behavior regression.
- Responsive/no-overlap evidence.
- Permission/payload parity for attachments/documents and scoped reviewer full view.

## Stop Conditions

Stop and return to PM/user if:

- RD cannot reuse one Drawing/Part/Relation projection per domain without removing required full-projection content.
- Implementation needs schema migration, RLS changes, production/Supabase live changes or direct data repair.
- API sends full or restricted attachment/file data to a summary/none context and relies on client hiding.
- Assigned review full view cannot be bounded to exact active request, targets, eligibility and company, or remains accessible after terminal state.
- Source context changes data truth/command authority instead of only policy depth, focus and capability projection.
- Drawer implementation causes nested-card layout, text overlap, critical overflow or unclear scroll ownership.
- RD wants to merge entry pages or remove `/numbering/search`, `/numbering/drawings` or `/parts`.

## Deferred Scope Audit

| Deferred scope | Classification | Handling |
|---|---|---|
| Product implementation | Same Spec Phase 1 / Implemented Locally | Phase 1A parity and Phase 1B shared shell are implemented and locally verified; production release remains gated. |
| DEV-067 composer/projection implementation | Current Phase / Local RD Implemented / Local QA-QC Passed | Phase 1A～1D and focused QA/QC evidence completed under the exact contract above; no new product decision is required. |
| Optional read-only detail facade | Same Spec Phase 2 / Not Authorized | Implement only if Phase 1 leaves unsafe duplication. |
| Merging the three modules/pages | No Tracking | Rejected because entry pages serve different user tasks. |
| Schema/RLS migration | Blocked Human Re-entry | Not expected; requires explicit authorization if discovered. |
| Production deploy, merge, PR, rollback, production smoke | Blocked Human Re-entry / Release Authorization Required | No release artifacts are created in this document. |
| Dedicated phone UI beyond current supported surface | No Tracking | Current product guidance uses desktop/default surface; narrow viewport remains a sanity check only unless separately requested. |
| Retired Part-cost workflow | No Tracking | Current product authority keeps Part cost retired; DEV-067 must not reintroduce it. |
| Bulk relation editing from drawer | New DEV later | Existing controlled relation maintenance remains authoritative. |

## All-Phase Coverage Matrix

| Phase / DEV | Authorization | Document status | Scope | Out of scope | Entry condition | Acceptance | Evidence |
|---|---|---|---|---|---|---|---|
| Phase 0 / docs | Authorized | Complete | SPEC, QA, dev_task, documentation_map | product implementation | user asked `寫成開發文件` | files created and indexed | git diff / file review |
| Phase 1 / shared drawer | Authorized locally | Implemented Locally / Release Not Authorized | shared shell, canonical root/drawing/part/candidate panels, source context, QC | schema/RLS, page merge, release | user instruction on 2026-08-07 | same object from multiple entry points shows same core sections and one non-modal interaction contract | tsc, lint, focused QC, authenticated browser evidence |
| DEV-067 / unified entity composer | Local Phase 1A～1D authorized | Local RD Implemented / Local QA-QC Passed | Drawing/Part/Relation projections, server visibility, scoped review full view, lock/action/return parity | schema/RLS, production/staging, merge/PR/deploy/release | current exact contract and clean phase entry | one composer; no parallel body; no hidden restricted payload; review scope fail closed | focused contract/network/DB/query/PostgreSQL/multi-viewport browser evidence |
| Historical Phase 2 / optional detail facade | Superseded | Replaced by DEV-067 Phase 1A | historical read-only option | current implementation | none | do not implement separately | DEV-067 evidence applies |
| Phase 3 / release | Not authorized | Release Authorization Required | merge/deploy/production smoke/rollback | unapproved production work | explicit release authorization | deployment-release-gate pass | release gate evidence |

## RD Readiness Review

DEV-067 P0/P1 readiness:

- DB schema: no change required.
- Migration: no change required.
- API: required unified GET facade, exact envelope and summary/full field allowlists are defined.
- Permissions: existing page/command permissions are retained; exact request/company/target reviewer receipt is defined and client parameters never elevate.
- Transaction boundary: one repeatable-read detail snapshot plus same-transaction write-lock guard is defined; no nested read snapshots or pre-transaction-only locks.
- Failure recovery: exact 400/401/403/404/409/503 codes, action-first Traditional Chinese copy and safe return are defined.
- State machine: no lifecycle transition change.
- Data mapping: typed keys, header, four domain/review projection models, preview state, action and navigation models are exact.
- Multi-target: canonical owner precedence, stable anchors, one atomic decision boundary and ambiguous-root fail-closed are exact.
- Performance: hard Drawing/Part/Relation/review query budgets and 1/20/50 no-growth rule are exact.
- QA/QC: FMEA and `UDD-001..050` contract/network/DB/browser plan are defined.
- Release: not authorized; release artifacts deferred.

Result: historical Phase 1A-1B remains `Implemented Locally / Release Not Authorized`; DEV-067 is `Local RD Implemented / Local QA-QC Passed / Production Release Gated` with no open P0/P1 local implementation gap.

## Spec Governance

Cross-spec handling:

- Extends `SPEC-PDM-DETAIL-DRAWER-001` for shared drawer behavior.
- Extends `SPEC-PDM-MASTER-WORKBENCH-001` without changing the three-page responsibility split.
- Extends `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` by tightening click target semantics: root/drawing/part clicks must open matching entity detail.
- Extends `SPEC-PDM-NUMBERING-004` by preserving contextual add/obsolete entrypoints inside canonical object panels.
- Compatible with `SPEC-PDM-PART-COST-001`; part cost remains part-owned and redacted by permission.

ADR decision:

- New ADR is not required for Phase 1 because the decision is UI information architecture and shared component ownership, not identity, schema, lifecycle, audit, permission or release-gate policy.
- If Phase 2 introduces a cross-module backend detail facade that becomes an authoritative API surface, revisit ADR need before implementation.

Current authorization boundary:

- Documentation is complete.
- Product implementation is not authorized.
- Merge, PR, deploy, rollback, production smoke and release reports are deferred until explicit release authorization.

## 2026-08-09 Focused Amendment — DEV-059 QA-QC Reopen

This section supersedes only the previous PASS interpretation for the candidate bundle-submit confirmation layer; it does not repeal the shared `DrawingWorkspaceDrawer`, entity ownership, lifecycle, permission, schema or API contracts above.

- User field evidence on the current `/numbering/drawings` route shows `送交圖料與首版整包審核` cannot be dismissed by the visible `X`, `返回檢查` or re-entry, and the modal blocks the underlying workspace.
- The earlier Phase 1C browser evidence remains a historical baseline, but it does not prove current-route hard reload, back/forward or bfcache restore, runtime interruption, click-through prevention, and each close mechanism as an independent case.
- Parent status is therefore `Local RD Implemented / QA-QC Reopened by DEV-059 / Release Not Authorized` until focused AI real-operation evidence passes.

## 2026-08-10 Product Direction Amendment — A0005 Visual Baseline

The user has selected the A0005 formal drawing detail drawer as the only current visual baseline while the drawer family is redesigned. The candidate and approval detail drawer mounts are intentionally retired from the active UI, and their visible entry paths are paused. This amendment supersedes the active-rendering requirement for those two surfaces only; it does not delete or alter their API, data, lifecycle, permission, approval-command or evidence contracts. A future redevelopment task must explicitly reintroduce and validate the candidate/approval UI before those drawers are considered active again.
- The focused compatible-exception contract is `.ai-doc/specs/SPEC-PDM-CANDIDATE-BUNDLE-SUBMIT-MODAL-RECOVERY-001.md`; the executable validation authority is `.ai-doc/qa/qa-pdm-candidate-bundle-submit-modal-runtime-recovery-validation-plan-2026-08-09.md`.
- `DEV-059` may change local modal state ownership, focus/keyboard handling, navigation/runtime recovery and visible status copy. It may not change lifecycle/API/schema/permission/formal data or release scope without a new Spec Impact Preflight.
- No QA/QC PASS may be restored from static source inspection or old screenshots. The AI must operate the current route in a real browser, execute isolated fault cases and complete disposable mutation/readback/cleanup evidence.

Focused result (2026-08-09): DEV-059 completed the current-route modal recovery portion with AI browser evidence for X, 返回檢查, Escape, physical click, hard reload, back/forward, candidate switching and 1440/1024/390 viewport checks. The parent full PASS remains gated because the shared candidate was intentionally not mutated; isolated flow/integration evidence covers submit/withdraw/fault behavior, while an isolated disposable UI mutation run remains an extended gate.

## 2026-08-14 DEV-073 CAPA Amendment — Status/Action/Work-item Consistency

This amendment is authoritative for the A0005 formal drawer state inconsistency and intentionally replaces any owner-only responsibility interpretation.

- A published workspace is provenance only; it must not be passed to the action resolver as an active candidate or override formal lifecycle/action ownership.
- The action catalog is resolved before viewer responsibility. `current_user` requires an applicable domain responsibility action; history and navigation alone are insufficient.
- Formal `rd_controlled` renders usable status and formal actions such as create revision/history, subject to existing permission rules.
- `in_review` without a resolvable request/workflow renders `unknown / 負責人待確認` and a locked `view_review` gateway with `PDM_ACTION_TARGET_UNAVAILABLE` plus PDM administrator recovery wording.
- Acceptance and evidence are controlled by `SPEC-PDM-STATUS-ACTIONABILITY-CAPA-001`, QA-DEV-073 and QC-DEV-073. No schema, permission or decision-authority change is implied.

## 2026-08-14 Drawing maintenance entry merge amendment

- `編輯圖面資料` 與 `管理圖面檔案` 僅在 UI/action catalog 層合併為單一 `detail:drawing:edit`，可見 label 固定為 `圖面維護`。此入口進入同一 `DrawingProjection`，同時提供基本資料、自動 3D／2D 預覽、版本與附件、受控補檔表單及關聯料號。
- 主資料保存與附件上傳仍是兩個獨立 backend mutation boundary；任一 mutation 失敗不回滾另一者。附件類別仍由 server-side 自動偵測，UI 不提供人工 3D／2D 類別選擇。若資料或附件維護能力任一缺少，合併入口整體以低色階鎖定並以 tooltip 說明，避免進入後出現未授權控制。
- 影響檔案：`src/lib/pdm-detail-action-resolver.ts`、`src/components/unified-pdm-entity-detail-drawer.tsx`、`src/components/drawing-projection.tsx`、`src/components/master-attachment-panel.tsx`、`scripts/qc-dev-072-action-api.mjs`、`scripts/qc-dev-072-browser.mjs`。
- Focused browser evidence：`output/qa/dev-072-pdm-action-discoverability/DEV072-20260814T110623Z-5ad38d84/run-manifest.json`；AI Chromium 確認圖面只出現 `detail:drawing:edit` 且不再輸出 `detail:drawing:manage_files`，並通過補檔表單可見與審核中鎖定斷言。完整 browser runner 後段既有 approval fixture 仍有 404／等待逾時，因此本 amendment 不宣告新的 aggregate 21/21；既有 DEV-072 baseline PASS 不被覆寫。
