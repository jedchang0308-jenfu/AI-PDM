# ADR-PDM-PROJECT-STATUS-BOUNDARY-001：專案狀態外部權威邊界

狀態：Accepted / Human Confirmed / Local Implementation Validated / Production Release Gated  
日期：2026-08-04  
對應任務：`DEV-054` / `DEV-PDM-PROJECT-STATUS-BOUNDARY-001`

## Context

AI PDM 目前把 `EVT / DVT / PVT / Release / ECR` 儲存在主根、料號與圖號的
`development_phase`，並把其中一部分用於篩選、DVT 晉升、審核規則與正式發行同步。
同時，系統另有 `research / technical_transfer` 品質送審流程。兩套階段在 UI 與規則中形成雙重權威，
而專案成熟度本應由專案管理軟體負責。

## Decision

1. AI PDM 不建立、保存、同步、推導或管制任何專案狀態。
2. `development_phase` 從主根、料號、圖號、API、read model、搜尋、UI 與規則中完整移除。
3. `approval_rules.phase` 一併移除；審核條件只依動作、資料狀態、料件類型與風險事實。
4. `EVTDisabled` 不再是資料狀態；既有資料遷移為 `Obsolete`。
5. DVT 晉升頁、API、權限、審核動作與相容 action 停用。正常使用者流程不再出現 EVT/DVT/PVT。
6. PDM 保留自己的權威：資料狀態、版次、審核、技術移轉、正式發行、作廢與設計變更。
7. `ECR / ECO / ECN` 作為設計變更單類型仍屬 PDM change control，不是專案狀態，不因本 ADR 移除。
8. 專案代碼或外部專案連結可作參考 metadata，但不得複製外部專案狀態或成為 PDM gate。
9. 既有不可變 audit、submission snapshot 與歷史 migration 中的舊字樣保留為當時事實；runtime 不得解析或依賴。
10. PDM 不提供 Concept/Design/Verification/Release 等 PLM phase-gate，不得由該類 gate 阻擋送審核准或發布；技術移轉與正式發布仍依 PDM 自身品質證據、資料完整性及審核規則管制。
11. 「變更管制」是發行後的 ECR/ECO/ECN workflow/control dimension，不是「研發階段 → 技術移轉」品質階段軸的第三個值。

## Options considered

- 保留欄位但從 UI 隱藏：拒絕。仍會保留雙重真相與規則漂移。
- 將 EVT/DVT/PVT 降級為 PDM 驗證標籤：拒絕。仍使 PDM 承擔專案狀態責任。
- 完整移除並由專案管理軟體單獨管制：採用。責任單一、效用最高。

## Consequences

- 現有 DVT promotion workflow 退役；舊 bookmark/API 不再提供該能力。
- 缺主要製造圖、材質、成本、採購確認等 PDM 條件須掛在技術移轉或正式發布，而非專案 phase。
- PostgreSQL/Supabase 需要 forward-only migration；正式環境套用仍需獨立 release/data migration gate。
- SQLite local runtime 需安全重建受影響表，保存 stable ID、資料狀態與關聯。

## Supersedes / amends

- 取代 `SPEC-PDM-STATUS-UX-003` 將「開發階段」列為 PDM 狀態軸的決策。
- 修正所有以 `developmentPhase` 作為主資料或工作台投影欄位的 active contract。
- 不改變 `DEV-050/052/053` 的版次、候選圖料、審核、正式化與發布 authority。
