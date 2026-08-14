# DEV-070 隱私告知執行期功能退役驗證計畫

Status: Local QC Passed / Production QC Pending
Date: 2026-08-14
Risk lane: Medium / Release Lane 2（登入、session、API authorization path）
Authoritative decision: `ADR-PDM-PRIVACY-NOTICE-002-retire-runtime-acknowledgement.md`

## 驗證範圍

- Firebase Google／密碼／工號登入的 session 交換。
- 所有使用 `requireAuthAsync`／`requireRoleAsync` 的受保護 API。
- 帳號邀請啟用、登入頁、全域 layout、側欄、帳號管理明細。
- `/privacy*` 與 `/api/privacy*` 退役、Production slice、artifact provenance、CI release gate。
- 歷史 privacy schema／migration 保留且無正式資料破壞。

不在範圍：刪除或更改正式 Cloud SQL 歷史告知資料；判定公司外部法遵是否充分。

## FMEA

| 失效模式 | 可能原因 | 使用者影響 | 偵測方式 | 優先級 | 對策 / 建議測試 |
|---|---|---|---|---|---|
| UI 已刪但 session route 仍查告知 | 只做前端刪除 | 登入仍顯示 503 或循環 | source scan、named-user canary、Cloud Run log | P0 | QC-001、QC-009 |
| API privacy gate 殘留 | `requireAuthAsync` 未同步 | 登入後 API 回 428/503 | source scan、authenticated route smoke | P0 | QC-002、QC-010 |
| 移除 privacy 時誤移除 auth／role guard | 共用函式修改過度 | 未授權使用者可讀寫資料 | unauth 401、角色 403、既有 auth QC | P0 | QC-003 |
| session 建立或 cookie 寫入退化 | session route 分支重構錯誤 | 登入成功後又回登入頁 | Phase 2B、named-user 重登 | P0 | QC-004、QC-009 |
| 邀請頁仍要求不存在的 checkbox | UI state／disabled 條件殘留 | 新帳號無法啟用 | DOM/source、邀請回歸 | P1 | QC-005 |
| Admin detail 仍查告知 repository | API type/UI 未完整刪除 | 帳號管理 500 | typecheck、source、UI smoke | P1 | QC-006 |
| 舊 route／側欄仍可見 | route、nav、slice allowlist 漏改 | 使用者進入 404 或失效頁 | build route manifest、UI sweep | P1 | QC-007 |
| 歷史表或 immutable evidence 被刪 | 將「刪功能」誤做成資料清除 | 稽核資料不可恢復 | schema／migration diff、無 DB action 證據 | P0 | QC-008 |
| CI 仍要求舊 route | preflight／artifact script 漏改 | main build/deploy 被阻擋 | Phase 2A、workflow QC | P1 | QC-011 |
| Production 仍載入舊 bundle/cache | artifact provenance 或 hosting promotion 異常 | 使用者仍見紅字 | exact commit、Level 4 hard reload、route 404 | P0 | QC-012 |

## QC 測試案例

| ID | 前置條件 / 操作 | 預期結果 | 證據 |
|---|---|---|---|
| QC-001 | 執行 `npm run qc:dev-070-privacy-removal` | 退役契約全數通過，無 UI/API/repository/gate 殘留 | 終端輸出 |
| QC-002 | 檢查 `requireAuthAsync` 與 Firebase session route | 無 privacy query、428、503 或 acknowledgement branch | source + QC script |
| QC-003 | 執行既有 auth／角色／邀請回歸 | 未登入仍 401、權限不足仍 403；正常邀請可用 | 測試輸出 |
| QC-004 | 執行 `qc:dev-046-phase2b` 與 typecheck | session v2、principal、account session 不退化 | 測試輸出 |
| QC-005 | 實際檢查 `/login`、`/account-invitation/firebase` | 無告知文字／連結／checkbox；主要 CTA 可用 | 3 viewport screenshot/DOM |
| QC-006 | 檢查 `/settings/accounts` | 無告知證據區；頁面無 500／可見錯誤 | UI + network/log |
| QC-007 | production build route manifest | `/privacy*`、`/api/privacy*` 不存在；側欄無入口 | build output + UI |
| QC-008 | 比對 schema/migration 與執行邊界 | 歷史表與 immutable trigger 保留；無 live DB mutation | diff + release log |
| QC-009 | Production named-user Google 登入 | 直接返回原 `returnTo`，不出現告知錯誤／循環 | Level 4 screenshot + URL |
| QC-010 | 登入後執行 permissions、numbering search、approvals inbox read-only smoke | 無 428/503/500；資料與權限合理 | network/log + screenshot |
| QC-011 | GitHub Production workflow exact commit | verify/build/candidate smoke/promotion/canonical smoke 全綠 | run ID / commit / image digest |
| QC-012 | 正式 URL hard reload 與舊 route 探測 | 新登入頁無紅字；舊 privacy route 為 404；正式 artifact 符合 release commit | Level 4 evidence |

## 通過標準與停止條件

- 必須通過 QC-001～QC-012；authenticated Production smoke 缺證據時只能判定「未充分驗證」。
- 任一可見錯誤、登入循環、auth 401/403 語意退化、受保護 API 428/503/500、正式資料 mutation、舊 artifact 或未知 dirty change，立即停止並回送 RD。
- Rollback reference：`5a52c189a75c28187823b43d70dcb69395662a8d`。
