# ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001：共用明細 Composer、Domain Projection 與 Server Policy

Status: `Accepted / Human Confirmed / DEV-067 Local RD Implemented + QA-QC Passed / DEV-083 RD Implemented Locally + Focused Contract/API + Authenticated Browser + Disposable Mutation + Typecheck + Affected Lint + Isolated Build Passed / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition / Production Release Gated`
Date: 2026-08-12; amended 2026-08-20
Owner: Dev PM
Related DEV: `DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001` / `DEV-067`; `DEV-PDM-PART-RELATION-READONLY-DRAWER-FULLPAGE-EDITOR-001` / `DEV-083`
Related SPEC: `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`

## 2026-08-20 DEV-083 Amendment - Read-only composer 與 canonical task workspace

Amendment status: `Accepted / RD Implemented Locally / Human Confirmed / Focused Contract+API+Authenticated Browser PASS / Disposable Mutation PASS / Typecheck + Affected Lint + Isolated Build PASS / Latest completed aggregate 29/30 PASS with one accepted-superseded parent baseline / QA-083-01～24 PASS / QA-083-24 Closed by QC disposition / Production Release Gated`.

### Context

DEV-067已證明一個shared composer可以在Drawing／Part／Relation／review情境提供一致的identity、projection、focus、return與action truth；DEV-079再證明Drawing的快速查閱與長時間mutation應分離。DEV-083要求Part／Relation採用相同task-mode boundary。若只新增full-page route但仍讓composer執行command，系統會同時保留drawer與page兩個write owner；若把所有domain editor塞進一個full-page元件，則會重現本ADR已拒絕的巨型條件元件。

### Options considered

1. **Drawer與full page並存write**：遷移快，但同一command有兩個placement，無法證明哪一個是canonical owner；拒絕。
2. **建立跨domain generic editor／action runner**：表面共用最多，實際把Part fields、Relation matrix、candidate lifecycle與approval decisions耦合；拒絕。
3. **Read-only drawer composer＋輕量page frame＋domain-owned editors**：共用穩定mechanics，write只存在canonical full page；採用。

### Amended decision

- `UnifiedPdmEntityDetailDrawer` 是covered surface的**唯讀composer**。它可顯示server-authorized projection、preview、download、copy、history、refresh、return與navigation CTA；不得掛載form、file input、domain maintenance state、confirmation dialog或command runner。
- Drawer的`ContextActionBar`仍是server-derived單一primary truth，但Part／Relation／Approval mutation intent只能產生`navigate`、locked或omitted execution。原ADR「實際command仍由server authority驗證」保留為domain truth，不再代表command可以從drawer發出。
- Full-page共用只到`PdmEditPageFrame`：safe return、identity/status header、loading/error/restricted states、unsaved guard、focus與action-dock placement。它不得知道domain fields、status machine或API route。
- Candidate aggregate只有一個`/numbering/workspaces/[workspaceId]`與一個`NumberingWorkspaceEditor`；formal Part與Relation使用各自stable-ID route與domain editor。
- `/approvals/[requestId]`是Drawing／Part／Relation exact reviewer的共用canonical workspace。Approval request、target receipt、decision API、company、eligibility、drift、idempotency與audit authority不變。
- Drawing現有workspace不在DEV-083改造範圍。未來若要採用page frame，須以不改Drawing behavior的獨立re-entry處理。

Implementation consequence：`PdmEditPageFrame`是mechanics-only slot frame；candidate、Part、Relation與reviewer分別由`NumberingWorkspaceEditor`、`PartWorkspaceEditor`、`RelationWorkspaceEditor`與`ApprovalRequestWorkspace`擁有。Relation可抽出domain-owned `RelationWorkspaceContent`供legacy唯讀與full-page兩種discriminated presentation使用，但不得把這種domain內容提升為core。`UnifiedPdmEntityDetailDrawer`移除command runner與write callback；server action truth仍存在，但mutation placement只能是canonical navigation、locked或omitted。

本amendment的Implementation Ready file/function/test inventory、dirty-worktree boundary與baseline以主SPEC的DEV-083 Implementation Contract為唯一執行權威。若實作需要在frame加入domain switch、把可寫candidate body複製到drawer、修改Drawing workspace、建立新write API或跨domain command bus，本決策失效並停止回ADR review。

Evidence boundary（2026-08-20）：focused contract/API、22-check authenticated browser、disposable mutation、typecheck、lint與isolated build均已取得PASS。最新browser=`output/qa/dev-083-part-relation-fullpage-workspaces/DEV083-20260820T115715Z-6b9c5ec8/manifest.json`，22/22 checks、browserErrors=0、failedResponses=0；最新mutation=`output/qa/dev-083-mutation/DEV083-MUT-20260820T115907Z-a9063105/manifest.json`，31/31 result rows passed且cleanup=removed，以disposable SQLite＋Chromium驗證candidate lifecycle/recovery、Part variant、Part／Drawing／Relation Engineer owner/non-owner與Manager／Admin同公司正向、Manufacturing fail-closed、cross-company authority、Relation五種操作與reviewer `needs_info`／reject／approve、unassigned／terminal／錯配target scope、snapshot drift與retry formalization的exactly-once/readback/audit，已直接關閉QA-083-11/12/13/17/18/19；並保留browser與aggregate manifests。DEV-067 parent browser最新=`output/playwright/dev-067-unified-entity-detail/DEV067-20260820T120043Z-e58ce7cb/manifest.json`，18/18、browserErrors=0、failedResponses=0，已將candidate readonly marker與canonical reviewer route納入現行runner。completed aggregate=`output/qa/dev-083-aggregate/DEV083-aggregate-20260820T115712Z-15206e0d/manifest.json`為30 child／29 PASS／1 DEV-072 parent baseline FAIL（`accepted-superseded`），不誤報aggregate PASS。DEV-072 bounded legacy runner=`output/qa/dev-072-pdm-action-discoverability/DEV072-20260820T120228Z-4a4dff7c/run-manifest.json`保留cleanup與obsolete unified marker timeout；現行DEV-079 contract 22/22、layout 3/3與recognition layout 3/3作replacement evidence，原始failure與expected均保留並標記`accepted-superseded`，不誤報舊runner PASS。DEV-083 browser與DEV-070 legacy-owner後續focused gate已PASS。本輪另在既有Part attachment與Drawing revision upload route補same-company resource guard，封住cross-company route intent寫入，未新增schema／permission／lifecycle／write API。`qc-next-app-runner` readiness probe現在每次2秒可取消、DEV-072 legacy marker wait限縮5秒；`typecheck:app`、affected lint、isolated build、DEV-070 browser與DEV-079 contract已重跑PASS；QA-083-24已由`.ai-doc/qc/qc-dev-072-pdm-action-discoverability-2026-08-14.md`的accepted-superseded QC disposition關閉。此邊界維持drawer read-only、domain-owned mutation與server authority不變。

### Consequences and compatibility

- Positive：drawer的操作風險與command surface下降；三工作台建立一致task mode；domain editor仍可獨立演進。
- Cost：Part／Relation list需精確return mechanics；legacy、unified與approval drawer必須同一cutover zero-write；review workspace需由Drawing-only projection擴為server owner-context projection。
- Compatibility：既有`PdmEntityDetailService`、projection policy、domain APIs、permission、lifecycle與approval authority保留；只改action placement、route ownership與read envelope的兼容欄位。
- 本amendment在衝突處取代下方DEV-067時期`ContextActionBar`可直接執行Part／Relation／Approval command的解讀；其餘composer／projection／server-policy決策不變。
- 不新增ADR。若需要cross-domain business editor、persistent shared draft、第二套relation/approval write API或新的global reviewer capability，停止並重新判定ADR。

## Context

Drawing、Part、Relation 工作台目前共用部分 drawer shell，但 candidate、formal、relation target、reviewer 的 body、preview、section order 與 actions 仍由不同 composition 組裝。只把這些分支搬進一個 React component，會形成難以測試的巨型條件元件；維持三套 drawer 則會持續產生使用者肌肉記憶與審核內容漂移。

最新產品決策要求：三工作台共用同一抽屜架構；圖號不看料號細節，料號不看圖面檔案，圖料工作台看完整關係，assigned reviewer 在受審範圍內看完整 Drawing／Part／Relation。送審期間所有可見 object facts 仍來自同一份受鎖 owner data。

## Options considered

1. **各 domain 維持獨立 drawer，只對齊 CSS**：局部風險低，但無法防止 section、preview、focus、return 與 review body 持續漂移。
2. **單一巨型條件元件**：表面上只有一個檔案，實際把 domain、status、role、route 分支集中，容易形成互相污染、重複 fetch、競爭 CTA 與不可控回歸。
3. **Shared composer + domain-owned projections + server-derived policy**：共用穩定互動骨架，domain 保留資料與命令 authority，server 只回當前情境允許的 projection。此方案被選定。

## Decision

採用 `UnifiedPdmEntityDetailDrawer` 作唯一 covered detail composer：

```text
UnifiedPdmEntityDetailDrawer
├─ SharedIdentityStatusHeader
├─ ProjectionComposer
│  ├─ DrawingProjection
│  ├─ PartProjection
│  ├─ RelationProjection
│  └─ ReviewContextProjection
│     └─ ApprovalSnapshotProjection
└─ ContextActionBar
```

- Composer 只治理 overlay geometry、shared header、固定 projection slot 相對順序、單一 scroll owner、focus/Escape、safe return 與單一 action bar。
- Drawing、Part、Relation projection 由各 domain 擁有；composer 不解讀 domain status，不持有跨 domain mutation authority。
- Server `DetailSurfacePolicy` 依 entity、surface、lifecycle、actor、company 與 active review context 決定每個 projection 的 `none | summary | full`，並只回允許欄位。Client 不得 fetch all 後隱藏。
- Drawing surface：Drawing full；Part/Relation summary。Part surface：Part full；Drawing summary但不回圖面檔案/版次；Relation summary。Relation surface：三者 full。
- Assigned active reviewer：只在 exact request targets、同公司及有效 reviewer eligibility 內取得三者 full；這是 ephemeral scoped capability，不是 reviewer role 的全域 bypass。缺必要 projection 時 decision fail closed。
- `ReviewContextProjection` 顯示 request scope、責任、狀態與 decision context。其 `ApprovalSnapshotProjection` 只顯示 target IDs、hash/diff/check與 mismatch evidence；不得複製 object fields/files/relations。Snapshot drift 不能用 snapshot body 取代 locked owner data。
- `ContextActionBar` 是唯一 primary CTA owner。各 projection 只提供 action descriptors；實際 command 仍由原 domain/approval server authority 驗證。

## Consequences

正面結果：

- 三工作台保有入口任務差異，但右側抽屜的層級、順序、返回、鍵盤與狀態肌肉記憶一致。
- 同一 projection 修正一次即可同步一般、關聯與審核情境，降低 preview/attachment/relation 漂移。
- Reviewer full view 有清楚 scope、期限與負面測試邊界，不需要 approval-only object detail。

成本與限制：

- 需要建立跨 domain projection model、server policy與bounded aggregate read，並驗證 query budget、partial failure及multi-target anchor。
- `full` 不代表所有內容預設展開；review 必須以決策必要章節優先，次要內容收合，否則抽屜會過長。
- Existing wrappers 只能漸進退役，遷移期間需用 DOM/network contract 防止第二 body 或未授權資料並存。

## Compatibility and migration

- `PdmEntityDetailDrawer` 可保留為低階 shell；`DrawingWorkspaceDrawer`、`WorkspaceDrawer` 可暫作 compatibility wrapper，但不得獨立組裝 covered body。
- `UnifiedDrawingDetailDrawer` 不再是最上層終局元件；其已確認六區行為成為 `DrawingProjection` 的內部契約。
- `/approvals` 維持單一 inbox；owner route、server lock、decision authority、audit與「哪裡來，哪裡去」不變。
- 2026-08-12 readiness review 已由同一 `DEV-067` 補齊 exact TypeScript envelope、server policy/API、single-snapshot read、review-scope receipt、multi-target owner resolver、transaction lock、preview parity、return-state、phase/file list 與 `UDD-001..050` QA evidence contract，因此本 ADR 對本機 Phase 1A～1D 已達 `RD Implementation Ready`。實作權威見 `SPEC-PDM-ENTITY-DETAIL-DRAWER-001` 的 DEV-067 RD Implementation Contract。
- 本 ADR 仍不授權 schema/migration、production/staging data、deploy、merge、PR或release；若需要這些動作或需推翻 composer/domain ownership/server policy，必須重新進入 Dev PM/ADR。
