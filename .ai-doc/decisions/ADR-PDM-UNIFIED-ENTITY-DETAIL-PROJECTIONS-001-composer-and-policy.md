# ADR-PDM-UNIFIED-ENTITY-DETAIL-PROJECTIONS-001：共用明細 Composer、Domain Projection 與 Server Policy

Status: `Accepted / Human Confirmed / Local RD Implemented / Local QA-QC Passed / Production Release Gated`
Date: 2026-08-12
Owner: Dev PM
Related DEV: `DEV-PDM-UNIFIED-ENTITY-DETAIL-REVIEW-001` / `DEV-067`
Related SPEC: `.ai-doc/specs/SPEC-PDM-ENTITY-DETAIL-DRAWER-001-unified-object-detail-contract.md`

## Context

Drawing、Part、Relation 工作台目前共用部分 drawer shell，但 candidate、formal、relation target、reviewer 的 body、preview、section order 與 actions 仍由不同 composition 組裝。只把這些分支搬進一個 React component，會形成難以測試的巨型條件元件；維持三套 drawer 則會持續產生使用者肌肉記憶與審核內容漂移。

最新產品決策要求：三工作台共用同一抽屜架構；圖號不看料號細節，料號不看圖面檔案，圖料模組看完整關係，assigned reviewer 在受審範圍內看完整 Drawing／Part／Relation。送審期間所有可見 object facts 仍來自同一份受鎖 owner data。

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
