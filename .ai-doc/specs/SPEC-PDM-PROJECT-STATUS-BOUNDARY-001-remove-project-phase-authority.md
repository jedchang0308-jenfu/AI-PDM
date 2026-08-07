# SPEC-PDM-PROJECT-STATUS-BOUNDARY-001：移除 PDM 專案狀態權威

狀態：Implemented / Independent QA-QC Passed Locally / Production Release Gated  
日期：2026-08-05  
對應任務：`DEV-054` / `DEV-PDM-PROJECT-STATUS-BOUNDARY-001`

## 1. 目的

AI PDM 不管制專案狀態。專案管理軟體是 EVT/DVT/PVT 等專案成熟度的唯一權威；AI PDM 只管制工程資料、
版次、審核、技術移轉、正式發布、作廢與設計變更。

## 2. In scope

- 移除主根、料號、圖號的 `development_phase` schema、型別、I/O、查詢與顯示。
- 移除 `approval_rules.phase` 與設定頁 phase 條件。
- 移除 DVT promotion page、API、repository workflow、permission code、approval action 與正常 UI 文案。
- 移除開發階段 filter、badge、status scope/help 與 dashboard/task/detail 顯示。
- 移除 active `phase_gate_checks` current schema、Concept/Design/Verification/Release PLM gate API、runtime、UI 與 approval blocker；歷史 migration/QC evidence 保留。
- `EVTDisabled` 遷移為 `Obsolete`，並從 record status contract 移除。
- 正式發布只更新 `record_status = Released`；不再同步任何 project phase。
- 保留 `research / technical_transfer` 品質送審分流；必要資料完整性掛在該流程或正式發布 gate。
- UI 的品質階段只呈現「研發階段 / 技術移轉」；ECR/ECO/ECN 變更管制保留為獨立 workflow/control dimension，不得列為第三品質階段。
- 新增 SQLite compatibility rebuild 與 PostgreSQL/Supabase forward migration。
- 新增 deterministic absence/behavior QC 與代表性 UI smoke。

## 3. Out of scope

- 不建立專案管理軟體整合、雙向同步或外部專案狀態快取。
- 不操作 live Supabase、Cloud SQL、production schema 或正式資料。
- 不清除不可變 audit、歷史 submission snapshot、歷史 migration 或既有 QC evidence。
- 不移除 `project_code` 參考欄位。
- 不移除 PDM 的 `ECR / ECO / ECN` change request 類型。

## 4. Authoritative state model

| 狀態軸 | 權威 | 本 DEV 行為 |
|---|---|---|
| 專案狀態 | 外部專案管理軟體 | AI PDM 不儲存、不顯示、不判斷 |
| 品質流程 | AI PDM | `research / technical_transfer` |
| 主資料狀態 | AI PDM | `Draft / NeedInfo / Active / PendingReview / Released / Rejected / Obsolete / Merged / PendingAdminConfirm / MainDrawingInvalid` |
| 版次與發布 | AI PDM | 依 revision policy、approval、publication transaction |
| 設計變更 | AI PDM | ECR/ECO/ECN change control 與 revision workflow |

## 5. Migration contract

1. 將三張 master table 的 `EVTDisabled` 更新成 `Obsolete`。
2. 刪除 phase-dependent DVT approval rules；`Release` generic rules改由 action code或`record_status=Released`判斷。
3. 移除 `development_phase`、相關 index 與 `approval_rules.phase`。
4. 停用既有 DVT approval platform action；若已被歷史 package 引用，不刪除歷史 parent row。
5. 刪除 DVT page/action permissions；保留歷史 audit/payload。
6. migration 必須可在 fresh schema 與代表性既有 schema 上驗證，stable IDs、relations、revision、record status 不變。

## 6. API / UI contract

- list/search API 不再接受、回傳或套用 `developmentPhase`。
- create/update API 不再接受 project phase；多餘 legacy query parameter不產生 phase 行為。
- `/numbering/dvt` 與 `/api/numbering/dvt-candidates` 退役且無 mutation owner。
- `/parts`、`/numbering/drawings`、`/numbering/search`、task/dashboard/detail/workbench 不顯示開發階段。
- status scope/help 不列開發階段。
- dashboard/sidebar/detail 不顯示「專案 / 圖料」或「PLM 階段關卡」等使 PDM 看似擁有專案階段的入口與文案。
- 審核矩陣不顯示 phase 條件；release/正式資料控制仍可由 action、record status與risk判定。

## 7. Failure / recovery

- SQLite rebuild 任一步失敗時必須 rollback，不留下半套 master table。
- PostgreSQL migration 在 transaction 中執行；constraint/index/column 任一步失敗即整批 rollback。
- runtime 發現仍需 `development_phase` 的 SQL/型別/API 時視為 P0 contract failure，不以 synthetic default 補值。
- 正式 migration/deploy 仍需 target identity、backup、rollback與 post-migration smoke，不在本 DEV 自動執行。

## 8. Acceptance criteria

- active runtime source、fresh schema與正常 UI 沒有 `development_phase / developmentPhase / EVT / DVT / PVT / EVTDisabled` 專案狀態依賴。
- active runtime source、current schema、API、正常 UI 與核准流程沒有 `phase_gate_checks / phase-gates / PhaseGateCheck / PLM 階段關卡 / Concept Gate / Design Gate / Verification Gate / Release Gate / phase_gate_required` 語意等價依賴。
- ECR/ECO/ECN change request 仍可使用。
- 三張 master table 與 API 不再包含 project phase。
- DVT promotion route/page/permission/action不再可用於新流程。
- release workflow只更新資料狀態並保持歷史/最新版同步。
- research/technical transfer mode selector與technical-transfer package fail-closed行為通過回歸。
- TypeScript、focused QC、migration parity、lint、build與代表性 UI visible-error sweep通過。
- package.json 仍註冊的相關測試不得讀取已刪除的 DVT/phase-gate route、欄位或正向 fixture；語意型 absence gate 必須涵蓋同義名稱而非只掃 EVT/DVT/PVT。

## 9. 2026-08-05 implementation and evidence

- active PLM phase-gate schema、API、UI、permission 與 approval blocker 已移除；舊 phase-gate API 與 DVT page/API 在隔離 router 均回 404，build manifest 不含該 routes。
- 品質階段型別與畫面只保留「研發階段／技術移轉」；「變更管制」以獨立 control dimension 呈現。
- SQLite compatibility、PostgreSQL `023/024` forward migrations、Supabase mirrors、disabled historical action retention 與 enabled-only action catalog 已完成。
- 專項 gate 10/10、隔離 API 396/396、approval platform 125/125、核心與關聯 regression、TypeScript、lint、122-route isolated build 全數通過。
- 瀏覽器 R12 在 3 種 viewport、5 個代表性 routes 共 15/15 通過；console/network/visible error 與非預期水平 overflow 均為 0。證據見 `output/playwright/dev-054-project-status-removal/evidence.md`。
- 本地實作與 QA/QC 已完成；未執行 live migration、production data rewrite、deploy 或 release。
