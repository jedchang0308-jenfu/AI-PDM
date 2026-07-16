# ADR-SW-LICENSE-PDM-001: 採用 Operational Shared 的 SW License / PDM 公司策略

日期：2026-06-18  
狀態：Accepted for planning  
關聯任務：`DEV-SW-LICENSE-PDM-001`  
關聯規格：`SPEC-SW-LICENSE-PDM-001`

## Context

AI_PDM 需要支援鉦富與久方兩家公司資料歸屬。使用者已取得兩家公司 SW API / license，但 SolidWorks license 切換有次數或操作限制，因此不希望在不同公司圖檔之間頻繁切換序號。

現有系統已有使用者、role、server API、SW Add-in、metadata detection 與 Document Manager adapter hook，但尚未建立公司 tenant / PDM company scope。原始問題是:

- 技術上允許用目前啟用的 SW license 操作 CAD。
- PDM 寫入時仍能把資料歸入正確公司。
- 一般員工不能跨 PDM 公司操作資料。
- Admin 需要能在同一套系統中選擇鉦富或久方作為 PDM 目標。

## Decision

採用 `operational_shared` 作為首版策略。

1. SW license profile 與 PDM 公司資料歸屬分離。
2. PDM 公司權限是資料存取與上傳的強制邊界。
3. SW license profile 不作為首版阻擋條件。
4. Admin 可指定 PDM 目標公司。
5. 一般員工只能操作自己所屬 PDM 公司。
6. SW license key 不存 DB、不回傳前端、不寫入 add-in setting、不寫入 log/report。
7. 若未來需要更嚴格策略，透過 `sw_license_policy` 切換為 `strict_match` 或 `admin_override`。

## Alternatives Considered

### A. Strict Match

要求 SW license 公司必須等於 PDM 公司。

不採用為首版。此方案邊界清楚，但會迫使用戶在鉦富與久方資料間頻繁切換 SW license，正好違反本次需求的主要限制。

### B. Admin Override

一般員工 strict match，Admin 可跨公司操作。

不採用為首版。它比 strict match 有彈性，但仍需在系統中判斷目前 SW license profile 的公司，會增加第一版實作範圍。此方案保留為第二階段策略。

### C. 完全不建公司 scope

只靠 Admin 帳號與人工流程決定資料放到哪裡。

不採用。這會使一般員工跨公司操作無法被系統阻擋，也會讓查詢、下載、numbering 與後續資料隔離失去可靠邊界。

## Consequences

正面:

- 不需要因 PDM 公司切換而頻繁切換 SW license。
- PDM 公司資料權限仍能被系統強制執行。
- Admin 可支援兩家公司資料作業。
- 保留未來切換到更嚴格 license policy 的空間。

代價:

- SW license profile 與 PDM 公司可能不一致，系統不得把 `operational_shared` 報表描述為授權合規證明。
- 核心 PDM tables 需要加入 company scope，牽涉 migration、repository、API 與 QC。
- Add-in token DTO 與上傳 payload 需新增 PDM 目標公司資訊。

## Implementation Notes

- `company_id` 應成為 PDM domain model 的一級邊界，不只存在於 UI。
- Client 傳來的 `pdm_company_code` 必須由 server 根據 session user membership 驗證。
- `sw_license_policy` 預設值為 `operational_shared`。
- 既有資料 migration 預設歸屬 `JENFU`。
- Supabase direct Data API 仍維持 deny-by-default；本功能經由 AI_PDM server API 執行。

## References

- `.ai-doc/specs/SPEC-SW-LICENSE-PDM-001-operational-shared-company-scope.md`
- `.ai-doc/dev_task.md`
- `src/lib/auth-async.ts`
- `src/app/api/submissions/route.ts`
- `src/lib/pdm-metadata-adapter.ts`
- `sw-addin/Services/AuthService.cs`
- `sw-addin/Views/SubmissionWindow.xaml.cs`

