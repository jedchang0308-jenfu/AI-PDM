# SPEC-PDM-SUPERVISOR-EDIT-SCOPE-001：主管與系統管理員跨負責人編輯權限

Status: `Local RD Implemented / Human Confirmed / Focused QA Passed / Disposable Mutation QC Pending / Production Release Gated`

Decision source: 2026-08-19 使用者明確要求「研發主管」與「系統管理員」即使不是負責人，也能編輯所有圖號、料號、圖料根號及 BOM；2026-08-20 追加要求所有工程師同公司跨負責人編輯。

## 1. 權限契約

- 產品角色 `Engineer`（工程師）、`R&D Manager`（研發主管）與 `Admin`（系統管理員）具有同公司範圍的 non-owner edit scope。
- 適用物件：編號草稿中的圖號、料號、圖料關聯／圖料根號，以及 `Draft`／`Rejected` BOM。
- supervisor work scope 移除「必須是負責人／原送審者」限制；既有 action permission、公司範圍、資料可見性、生命週期、必要資料、版本衝突與 idempotency gate 仍須通過。
- 編輯者以實際登入 actor 寫入 audit／updated-by；不得自動改寫、接管或隱藏原 `ownerId`／`createdBy`。
- `in_review`、`auto_finalizing`、`recovery_required`、released／terminal／history-only 等既有不可編輯狀態維持鎖定。
- 依 2026-08-19 使用者補充，主管角色也可跨負責人取消草稿、在尚未產生決策前撤回他人送審，並執行其 action permission 已授權的審核、正式化恢復與發行操作。
- 審核已產生決策後仍不可撤回；作廢、production deployment／release gate 與跨公司權限不因本契約放寬。

## 2. 單一 policy boundary

Server 與 read projection 必須共用 `pdm-edit-scope-policy`：

1. 同 owner：依既有 action permission 判定。
2. 非 owner 且角色為 `Engineer`／`R&D Manager`／`Admin`：視為可進入編輯範圍，再套 action permission 與 lifecycle gate。
3. 其他角色非 owner：維持 `owner required`。
4. 跨公司：一律不可因角色覆寫。

平台相容角色 `rd_manager`、`pdm_admin`、`system_admin` 只用於既有 server actor context；人員帳號的產品角色仍以 `R&D Manager`／`Admin` 為權威。

## 3. UI 與 API

- Drawing／Part／Relation 清單、唯讀明細與 canonical workspace 對主管／系統管理員顯示可用編輯入口，不得誤標為唯讀或「需由負責人處理」。
- 一般工程師查看同公司他人工作時也顯示可用編輯入口；原 owner／assignment 仍保留，不因協作編輯被改寫。
- `PdmEntityDetailResponse`、Drawing／Part／Relation workbench capability 與實際 mutation API 必須同源，不得出現 UI 可按但 API 403，或 API 可寫但 UI 無入口。
- BOM 沿用既有 `Draft`／`Rejected` 可編輯狀態與 company scope；本契約明確要求兩個主管角色可讀、建立、編輯及管理同公司任一 BOM 草稿。

## 4. Spec Impact

分類：`Intentional replacement + compatible preservation`。

- 有意取代 DEV-053／062／067／072／079 與相關 workbench 中「candidate mutation 僅限 owner」的舊解讀，以及 DEV-079 將 canonical full-page route 稱為 owner-only workspace 的權限語意。
- 保留 DEV-079 的 Drawer zero-write、full-page placement、OCR authority、return contract與視覺架構。
- 保留 DEV-078 的固定責任稱謂：主管可協作處理不代表原 assignment 或第一層責任名稱被改寫。
- BOM `SPEC-BOM-WORKBENCH-001` 原本已允許研發主管與 Admin 編輯 Draft，本規格只補上「不受負責人限制」的明確跨模組一致性。
- ADR not needed：這是既有 privileged workspace scope 的一致化與明確產品授權，不改 identity、schema、lifecycle 或外部 API authority。

## 5. Acceptance

- `R&D Manager`／`Admin` + same company + non-owner + mutable state + required action permission：圖號、料號、圖料關聯與 BOM 編輯入口及 API 均允許。
- `Engineer` + same company + non-owner + mutable state + required action permission：四領域均允許編輯。
- 任一角色 + cross-company：不得存取或編輯。
- 任一角色 + locked／terminal state：不得編輯。
- 主管編輯後 owner 不變，audit actor 為主管本人。
- 主管／Admin 可跨負責人取消、撤回未決案、審核與發行；每項仍須具備對應 action permission，且不得跨公司或旁路狀態鎖。
- 作廢與 production deployment／release gate 未被本契約旁路。
