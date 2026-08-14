# ADR-PDM-PRIVACY-NOTICE-002：退役 AI PDM 執行期告知與確認功能

Status: Accepted / Production Deployed / Authenticated QC Pending
Decision date: 2026-08-14
Owner: `jedchang0308@jenfu.com.tw`
Source: 使用者明確指令「直接刪掉」
Related DEV: `DEV-070`, parent release gate `DEV-032`

## Context

Production 登入會在建立可用 session 前比對程式內告知內容與 Cloud SQL 已發布版本。正式資料庫保留的 Pilot v1.0 hash 與目前程式內容 hash 不同，系統因此 fail closed，使用者看到「隱私告知版本與系統內容不一致，帳號暫時無法啟用」。

這不是 Google 登入失敗，而是告知版本契約阻擋整個登入及後續受保護 API。使用者在得知可採新版告知、非阻擋告知或完整退役後，決定直接刪除該功能。

## Options considered

1. 發布 Pilot v1.0.1 並要求重新確認：保留完整告知證據，但仍有版本治理與登入阻擋成本。
2. 保留告知頁、改為不阻擋：降低登入風險，但仍維護內容、路由與顯示證據。
3. 完整退役執行期功能，保留既有歷史資料：符合使用者明確決策，並避免破壞已存在的稽核紀錄。

## Decision

採 Option 3：

- 移除 `/privacy`、`/privacy/acknowledgement`、相關 API、內容常數、repository、cookie、全域 gate 與 CSS。
- Firebase BFF session 交換只驗證身分、principal、帳號狀態、登入別名與 assurance；不再讀寫或比對告知版本。
- `requireAuthAsync` 保留 session、帳號與角色授權，不再回傳 privacy 428/503。
- 移除登入／邀請／側欄／帳號管理中的告知連結、checkbox 與確認證據 UI。
- 移除 preflight、artifact provenance 與 production workflow 對舊告知功能的正向要求，改以 `DEV-070` 退役回歸檢查防止殘留。
- 不刪除或改寫正式資料。`privacy_notice_versions`、`privacy_notice_acknowledgements` 與 migration 保留為歷史資料結構；runtime 不再存取。

## Consequences

- Production 登入不再因告知版本／hash 漂移而失敗。
- AI PDM 不再提供告知內容、確認流程、重新確認、永久查閱頁或管理員確認證據。
- 公司若仍有個資告知義務，須在 AI PDM 之外另行完成；本 ADR 不宣稱法遵義務已消失或已滿足。
- 若未來要恢復，必須建立新 DEV／SPEC、使用新版本識別、確認內容 owner／法務依據，並走 auth Lane 2 release gate；不得重新啟用舊 Pilot v1.0 runtime。

## Compatibility and rollback

- 無 schema migration、無正式資料寫入、無正式資料刪除。
- 舊 privacy pending cookie 最長只有 10 分鐘；新 runtime 不讀取，無須資料修復。
- 發布前 rollback reference：Production source commit `5a52c189a75c28187823b43d70dcb69395662a8d`。

## Production deployment evidence

- Exact source commit：`c736836b148791b0f35c7558af0a841658eaf37f`。
- GitHub Actions Production run：`31812034743`（run 13），conclusion `success`。
- Verify job `94804722365`、deploy／candidate smoke／promotion job `94805315658` 均成功。
- Release artifact：`9223661701`，`production-release-c736836b148791b0f35c7558af0a841658eaf37f-31812034743`，digest `sha256:4e8a25b17ca4445198b2536763cd96d854aa05d9d0307d1e3f88dc62ea961423`。
- Production `/privacy`、`/privacy/acknowledgement`、任意 `/privacy/*` 均為 404、`cache-control: no-store`、`x-ai-pdm-retired-route: privacy`；兩個 `/api/privacy/*` 為 404。
- 未登入 `/api/auth/me`、`/api/numbering/permissions`、`/api/approvals/inbox` 均維持 401。
- named-user authenticated smoke 與 10 分鐘 soak 尚未完成，因此本 ADR 尚不宣稱 QC FINAL PASS。
