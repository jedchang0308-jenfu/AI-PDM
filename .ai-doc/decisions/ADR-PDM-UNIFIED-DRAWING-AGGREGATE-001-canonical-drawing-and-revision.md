# ADR-PDM-UNIFIED-DRAWING-AGGREGATE-001：以 Drawing／DrawingRevision 取代候選轉正式雙物件

Status: `Accepted by User Direction / Local Implemented / QA-QC Passed / Production Gated`
Date: 2026-08-11
Owner: Dev PM
Related DEV: `DEV-064`
Related SPEC: `.ai-doc/specs/SPEC-PDM-UNIFIED-DRAWING-AGGREGATE-001-single-data-layer.md`

## Context

目前首版圖面先寫入 `numbering_candidate_revision_*`，核准後再建立 `drawing_numbers`、`drawing_revision_packages`，並把 file asset 重新掛到正式物件。圖號工作台則將 candidate workspace 與 formal master UNION 成兩種 row。

這造成相同圖號在流程前後有不同 identity、不同 detail key、兩套 revision/file authority，以及正式化 copy／rollback／追溯複雜度。使用者明確要求所有狀態共用同一資料層。

## Decision

採用 canonical `drawings + drawing_revisions + drawing_revision_files`：

- Drawing 是穩定身份與生命週期容器。
- DrawingRevision 是可受控與不可變的內容版本。
- Workspace 是整包 transaction context，不是圖面資料層。
- legacy candidate/formal tables 在遷移期降級為 compatibility projections。
- 工作台與明細先讀 canonical identity，再依狀態 hydrate candidate workflow 或 formal module adapter。
- 權限與狀態轉換由 server policy 執行；UI 只投影 capability。

這是對 DEV-052／DEV-053 中「candidate aggregate 與 formal master 分離」的 `Intentional replacement`。既有編號 reservation、整包 snapshot、原子核准、formal reader 與 release gate 保留。

## Options

### A. 只共用 drawer，資料仍分開

Rejected。只能修正入口，無法消除 identity 換號、copy、雙 authority 與 API 權限漂移。

### B. 直接把 candidate rows 當 formal tables

Rejected。`drawing_numbers` 對 root/master foreign key 與既有 formal reader 有前置假設；直接提前插入會讓未受控資料被舊模組誤認為正式資料，且 SQLite 需破壞式 table rebuild。

### C. 新 canonical aggregate，舊表做相容投影

Chosen。可先以 additive schema 建立單一業務權威，維持既有 reader；所有新 mutation transactional dual-write，後續逐步移除 compatibility adapter。

### D. 僅在 UI／BFF 將兩套資料虛擬合併

Rejected。仍然有兩個 source of truth，且直接 API mutation 可繞過 UI。

## Consequences

Positive：stable ID、無 canonical copy、同一 detail key、統一 capability policy、較簡單的附件／關係／歷史追溯。

Cost：需要 additive migration、既有資料 deterministic backfill、過渡期 dual-write 與較完整 regression；legacy 表在完全退役前仍有維護成本。

## Immutability

`rd_controlled` 與 `released` revision 的 revision code、policy snapshot 與受控 file relation不可直接改寫或刪除。合法變更建立新 revision；狀態本身可依政策從 `rd_controlled -> released -> superseded` 前進。

Drawing 可在未取號階段維持 `drawing_number = NULL`，首次取號後由資料層鎖定，避免同一 identity 被靜默改成另一個圖號。

## Re-entry triggers

- 想讓 workspace 再次成為 drawing identity；
- 想移除 dual-write 前尚有 legacy reader；
- 想允許受控／發布 revision 就地改檔；
- 想對 production live data 執行 backfill、repair 或 cutover。
