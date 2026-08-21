# ADR-PDM-STATUS-UX-004：採用任務導向的人類狀態投影

狀態：Accepted
日期：2026-08-07
關聯：`DEV-055`、`DEV-078`、`SPEC-PDM-STATUS-UX-004`

> **2026-08-22 DEV-087 supersession**：三工作臺current-state部分由`ADR-PDM-STATUS-DATA-REBUILD-001`取代。新決策優先；activation後舊human/viewer/responsibility/availability projection chain與filter被拆除，只保留固定`none|owner|review_owner|system|system_admin|blocked`角色語意。本文保留為歷史決策與非衝突UX原則，不得作為fallback authority。

## Context

AI PDM 已有中央狀態字典與狀態軸，但清單仍把 domain model 的多個欄位逐一顯示為 badge。這讓資料模型的完整度直接變成 UI 的閱讀負擔，也讓「關聯完整／未發布／可作業／草稿確認」同時競爭主要結論。

使用者的任務不是閱讀全部狀態，而是快速判斷：能否使用、是否有問題、下一步是什麼。

## Options

### A. 維持一個資料欄位一個 badge

- 優點：實作直接，容易追溯 raw field。
- 缺點：每新增欄位就增加視覺負擔；使用者必須自行解讀優先序。

### B. 只擴充中央狀態字典

- 優點：文案一致，改動小。
- 缺點：只能改善「怎麼叫」，無法決定「此刻最重要的是哪一個」。

### C. Domain projector 產生唯一 human status view model

- 優點：資料層保留完整，UI 依任務輸出一個結論；list、drawer、filter 可共用同一結果。
- 缺點：必須建立明確優先序、完成證據與 domain-specific tests。

## Decision

採用 C。

架構固定為：

`Entity → status sources → domain projector → HumanStatusProjection → responsibility resolver → ViewerHumanStatusProjection → list/drawer/filter`

- 字典與狀態軸繼續存在，但不再直接決定一列要顯示幾個 badge。
- 每個 domain 有自己的 projector，不使用無 domain 的 generic projector。
- 主要狀態的優先序固定為：終止 → 失敗/阻擋 → 缺少條件 → 等待 → 可執行 → 可使用/完成。
- 完成語言必須有證據；不得由 `Draft`、`NeedInfo` 或「沒有 blocker」推論成「已確認」。
- human status 是 read projection，不寫回 domain status。
- projector 在 server/domain read path 執行；API additive 回傳 projection，client 只 render，不得自行由 raw status 推導。
- drawing／part owner module與圖料工作台共用同一 projection及 detail component；drawer外殼統一使用既有 `PdmDetailDrawer`。
- `HumanStatusProjection` 保留客觀業務結論；`ViewerHumanStatusProjection` 只回答「對目前登入者而言誰要動作」。兩者不得互相覆寫。
- 個人 assignee/reviewer 是第一責任證據；沒有個人指派模型時才使用 role capability。此為 deterministic rule engine，不使用生成式 AI 猜測。
- 所有 viewer-specific read API 使用 `private, no-store`；server filter 依 viewer category 執行。
- 可用範圍另以 `AvailabilityScopeProjection` 表示：`研發可用` 與 `生產可用` 是使用資格，不是新的 workflow status；只在 `usable` 的第一層 badge 中情境化呈現。
- `生產可用` 必須有正式發布與依賴證據；料號 `Active`、沒有 blocker 或存在 primary drawing number 都不能單獨推出生產資格。證據不足時 fail closed 為 `可用範圍待確認` 或不可用。

## Consequences

- 清單可維持一列一個主要狀態，drawer 只呈現同一結論與下一步。
- filters 若使用 human status，必須在完整結果集的 server/repository projection 上運作。
- 有 limit/cursor 的清單必須 scan → project → filter → fill page；禁止先截斷再做 client-only filter。
- 新 domain 需註冊 projector、priority matrix、fixtures 與 QC；不能只加 page-local label map。
- 狀態明細、raw values、audit 與技術證據仍可查閱，但預設降層。
- Phase 1 不需 schema migration；若未來新增獨立 relation confirmation，需另建 evidence model 與 migration contract。
- part/relation 尚無個人 assignee 欄位，因此 `role_capability` 表示共享工作佇列，不宣稱唯一負責人；若產品日後要求具名責任，必須另開 assignment schema／audit 變更。
- part/relation/drawing owner DTO 同時回傳客觀狀態、viewer 狀態與可用範圍；通用搜尋頁只用一個 badge，避免用兩個綠色 badge 造成重複判讀。

## Compatibility

- 保留 `SPEC-PDM-STATUS-UX-001～003` 的字典、context、axis 與 help 契約。
- 修正 `SPEC-PDM-DRAWING-PART-RELATION-VIEW-001` 的多 badge root summary。
- 延續 `SPEC-PDM-NEXT-STEP-UX-001` 的 actionable copy 與 recovery 原則。

## 2026-08-18 DEV-078 Decision Amendment

### Context

DEV-055以`ViewerHumanStatusProjection`把第一層狀態顯示為`待你處理／等他人處理`，對單一使用者直覺，但同一筆資料在不同帳號產生不同截圖，削弱跨角色溝通、主管追責與問題排查。只替換label會繼續把共享流程責任與viewer capability混在同一欄位。

### Decision

沿用domain projector與單一badge架構，將責任投影拆成：

`HumanStatusProjection → ResponsibilityStatusProjection + ViewerActionabilityProjection + AvailabilityScopeProjection`

- `ResponsibilityStatusProjection`是跨觀看者穩定的第一層authority，使用`負責人／審核負責人／系統／系統管理員`責任語彙。
- `ViewerActionabilityProjection`只回答目前actor是否為自己的待辦、能否操作與阻擋原因；保留`我的待辦`效用，但不得改寫主要status label。
- `DEV-052／053`現行統一整包流程正常核准後由系統自動正式化；只有verified failure與適用recovery action同時成立時，才將責任交給系統管理員。DEV-048 legacy number-only approval及其他approval domain不由本ADR amendment改寫。
- 組織角色、permission、assignment、approval/publication authority與DB不變；系統管理員是顯示責任，不是新增RBAC role。
- 新欄位採additive compatibility；既有`ViewerHumanStatusProjection`可暫留，但client不得再把其label當主要顯示來源。
- Repository implementation以新增`src/lib/responsibility-status-projection.ts`作唯一shared resolver；各workbench與detail只提供normalized evidence，不得各自複製label或permission判斷。正式圖面沿用exact reviewer，candidate bundle沿用既有RD主管role queue，不新增assignment schema。

### Consequences

- 同一entity/version在不同合法帳號的主要status與截圖一致；個人化差異保留在actions、popover與`view=mine`。
- stable responsibility filter與viewer-specific mine filter必須分離，兩者都在limit/cursor前由server處理。
- 回應仍維持`private, no-store`，因DTO及動作仍含viewer-specific資料。
- 既有DEV-055／DEV-073證據保留為歷史基線；新語彙必須另以DEV-078 cross-actor QA/QC證明，不得以舊截圖代替。
- DEV-078已完成Phase 1A projector → 1B DTO/filter → 1C UI → 1D rendered QC；focused gates、跨actor browser evidence與完整aggregate通過。DEV-073 browser以read-only fixture preflight及隔離source runner重現8 cases，production release仍gated。
- 未來移除`viewerStatus`需consumer inventory、雙欄位parity與另行要求，並非本次RD implementation範圍。

## 2026-08-19 DEV-078 Phase 2 Decision Amendment

### Context

Phase 1把viewer-relative的「你／他人」改成固定責任角色，解決了跨帳號截圖不一致；但把`負責人／審核負責人／系統／系統管理員`全部放在第一層，仍要求使用者先理解組織角色與自動化細節，工作狀態篩選也因此膨脹。列表的首要任務其實是判斷「目前處在哪個階段、是否需查核、可用到哪裡」，精確當責角色應在需要採取行動時才展開。

### Decision

- 保留`ResponsibilityStatusCategory`、`ViewerActionabilityProjection`與`AvailabilityScopeProjection`作資料／責任authority；不合併資料category，不改assignment、permission或lifecycle。
- 第一層UI改用唯一六項詞彙：`全部／編輯中／審核中／待確認／研發版可使用／量產版可使用`。`全部`只供filter；資料列只會顯示其餘五項之一。
- `owner→編輯中`；`review_owner`與正常`system→審核中`；`system_admin`、`unknown`與可用範圍不足`→待確認`；兩種usable依availability scope顯示。
- 責任角色不消失，而是移入canonical description、popover／drawer與action control。`system`說明必須表明自動發布且不需人工；`system_admin`說明必須指出由系統管理員恢復。
- `我的待辦`與`包含歷史`維持獨立scope；`歷史`不再是visible work-status option，terminal明細保留精確結果。
- terminal資料被`包含歷史`納入時，第一層顯示neutral/archive的精確`humanStatus.label`結果chip；它不是第七個work status，也不進visible filter。
- presentation projector同時擁有label、canonical description、tone與icon；固定為`editing=info/play`、`reviewing=info/clock`、`needs_confirmation=warning/alert`、兩種available=`success/check`、terminal result=`neutral/archive`。證據不完整時fail closed到`待確認`，不得用viewer permission補猜責任。
- URL authority維持`humanStatus`＋`history=include|exclude`；legacy值只能由shared normalizer轉成canonical state。五個filter host必須支援reload、deep link與back/forward，兩個legacy list API需明確接收history scope。
- 此決策對2026-08-18 amendment的可見label／filter部分構成`Intentional replacement`，但保留其責任證據、actionability、跨actor一致性與相容性架構。

### Consequences

- 使用者只需理解三個進行中／風險階段與兩個可用層級；跨角色截圖仍能直接溝通。
- 多個data category可共享UI名稱，因此所有consumer必須共用presentation projector與canonical description；不得用label反推責任或動作權限。
- Phase 1完整QC只能作回歸基線，不能單獨證明新六狀態已實作；Phase 2已重新通過filter grouping、legacy query、cross-actor copy與三viewport rendered QA/QC。
- 本amendment已完成repository inventory、產品實作與完整QC，狀態為`Local RD Implemented / Human Confirmed / Full Aggregate QC Passed`；production release繼續gated。
- UI presentation採新增`src/lib/work-status-presentation.ts`的純函式authority，不改Phase 1 DTO fields。既有責任／availability label留作compatibility與detail evidence，但primary badge、filter與drawer summary不得直接render。
- SQL filter-before-limit由sync／async numbering repository共同承擔；`includeHistory`為optional input以保留舊caller相容，受影響API則必須明確傳值。禁止route以固定抓100筆再篩選替代repository scope。
- 2026-08-19 QA re-audit後盤點基準為17個必改source、12個必改tests、`package.json`一檔，合計30個direct files，另有4個validation-only source；任何新增page-local map、未分類legacy query consumer或未進`qc:dev-078` aggregate的required regression都視為architecture drift。

### Execution Result — 2026-08-19

DEV-078 Phase 2 P2-A～P2-D已完成。`npm.cmd run qc:dev-078`完整聚合PASS（DEV-078 projection 42/42、contract 53/53；DEV-055／DEV-073／DEV-062／DEV-053／entity-detail regressions、typecheck與isolated build均通過）。新六狀態瀏覽器證據位於`output/qa/dev-078-responsibility-status/20260819041629-90ff3789/`；DEV-073 8-case證據位於`output/qa/dev-073-status-actionability/DEV073-20260819T041838Z-f6a83fac/`；DEV-053 15/15隔離實作證據位於`output/playwright/dev053-real-operation/DEV053-20260819-041911-local-isolated/`。無P0/P1，暫存runtime已清理。

## 2026-08-19 DEV-080 Decision Amendment — Surface-aware status visibility

### Context

六狀態投影已解決主要工作狀態的一致性，但relation、approval、account、BOM、transfer、attachment與recognition仍可能把正常完成、技術進度、原始狀態及例外一起放在第一層。單純「全部顯示」形成badge wall；單純「全部移到hover」則會隱藏阻擋與資安風險。

### Decision

- 保留domain status axes、六狀態primary、actionability、availability、permission與lifecycle authority；新增surface-aware `StatusVisibilityProjection`，只治理presentation layer。
- 第一層每個item固定為一個primary與最多一個最高嚴重度exception；其餘細節進可及的popover／drawer，重複正常訊號可隱藏。
- critical、security、blocking、failed、conflict、missing-required與會改變目前動作的例外不得hover-only。`缺製造圖`固定可見；`關聯完整`預設降層或隱藏。
- 多例外依穩定嚴重度排序並聚合；popover保留全部原因、責任與下一步。無法安全聚合的critical例外必須停止並回Dev PM。
- hover不是唯一互動：必須同時支援focus、click/touch與Escape。Public/read-only、page error、audit、history及法律／安全告知不適用隱藏規則。
- 所有page-local status map與custom chip須改用shared registry/policy，或在inventory中留下具體例外理由與測試。
- 圖面辨識不得借用資訊不足的通用`jobStatus`或維持多份local map；新增`recognitionStatus`與`recognitionReviewStatus`兩個display context，但仍映射既有task／approval／readiness axes，不新增domain status axis。

### Consequences

- 第一層可以精簡但不失去風險判斷；跨角色截圖仍保留穩定primary與最高風險例外。
- `StatusDefinition.terminal/abnormal/actionable`成為visibility輸入，而不是直接等同顯示層級。
- 現行20個status scope擴為22個，新增`bomCreate`與`drawingRecognition`；active `approvalInbox/accountList/invitationList`掛載缺口必須補齊，component-hosted route繼承canonical scope，歷史alias不重建舊頁。
- 2026-08-19 QA re-audit後以42-route disposition與inventory manifest治理範圍；當前派工基準為30 required source、27 required test/QC、`package.json`與43 validation-only source，不再以舊42-file固定數字作成功條件。
- DEV-080為Medium、無schema/migration/API/write/permission變更的跨系統presentation rollout；完整authority為`SPEC-PDM-STATUS-UX-005`與其QA計畫。

### Execution Result — 2026-08-19

DEV-080 focused implementation與rendered verification已完成：projection 15/15、contract 26/26、browser 240/240（7 routes × 3 viewports）、DEV-071 browser regression 56/56、typecheck與isolated build（124 pages）均通過。`qc:dev-080`完整aggregate仍受DEV-060 released-child fixture、DEV-068 recognition fixture與既有UX hierarchy QC退役API三項baseline finding阻塞；不改寫為DEV-080缺陷，production/release仍依既有gate管制。
