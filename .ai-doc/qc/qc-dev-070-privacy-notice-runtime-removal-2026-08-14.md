# DEV-070 隱私告知執行期功能退役 QC 報告

Status: Local PASS / Production Release Pending
Date: 2026-08-14
Lane: Release Lane 2（authentication/session/authorization）
Decision: `ADR-PDM-PRIVACY-NOTICE-002-retire-runtime-acknowledgement.md`

## 結論

本機 RD、靜態回歸、正式建置與真實瀏覽器驗證均通過。登入、帳號啟用、session 與角色授權契約保留；執行期告知 UI、API、cookie、repository、全域 gate、Admin evidence 與舊 route 已退役。正式 Cloud SQL 歷史 schema、migration 與既有資料未刪除或改寫。

本報告尚不得宣稱 Production FINAL PASS；必須再完成 exact-commit GitHub release、正式 named-user 登入、read-only route smoke 與 10 分鐘 soak。

## 自動驗證結果

| 驗證 | 結果 |
|---|---|
| `qc:dev-070-privacy-removal` | PASS 14/14 |
| `qc:managed-auth` | PASS 21/21 |
| `qc:pdm-auth-persistent-session` | PASS 8/8 |
| `qc:pdm-account-invitations` | PASS 36/36 |
| `qc:dev-046-phase2a` | PASS 20/20 |
| `qc:dev-046-phase2b`（同 Production workflow 設定） | PASS 12/12 |
| `qc:production-deployment-pipeline` | PASS 17/17 |
| `npm audit --omit=dev --audit-level=high` | PASS，0 vulnerabilities |
| TypeScript | PASS |
| ESLint | PASS，0 error／13 個既有 warning |
| Next.js 16.3.0 production build | PASS，121 pages；無 `/privacy*`、`/api/privacy*` route |
| `git diff --check` | PASS；僅 Windows LF/CRLF 提示 |

Phase 2B 若不設定 Production workflow 的 `PDM_QC_PHASE2B_SKIP_STAGING_PREFLIGHT=true`，會刻意檢查 retired staging manifest 並失敗；依正式工作流程設定重跑為 12/12，並非 product regression。

## 真實瀏覽器與 HTTP 驗證

| 對象 | 尺寸／操作 | 結果 |
|---|---|---|
| `/login` | 390×844 | 無告知文字／連結、無可見錯誤、無水平溢位、保留忘記密碼；panel 358.4 px |
| `/login` | 1024×768 | 無告知連結、無可見錯誤、無水平溢位 |
| `/login` | 1440×900 | 無告知連結、無可見錯誤、無水平溢位 |
| `/account-invitation/firebase` | 390×844、Firebase BFF public config | checkbox=0、告知文字=0、啟用 CTA enabled、console error/warn=0、無水平溢位 |
| `/privacy` | Browser + HTTP | 404，畫面為標準 Not Found |
| `/privacy/acknowledgement` | HTTP | 404 |
| `/api/privacy/notice` | HTTP | 404 |
| `/api/privacy/acknowledgements/current` | HTTP | 404 |

首次 Production QC 發現 product route 已刪除，但既有 production-slice middleware 將未知頁面改寫成 `/production-slice-blocked` 並回 200。DEV-070 hotfix 改為在該 rewrite 前對 `/privacy` 與其子路徑直接回 `404`、`cache-control: no-store` 及 `x-ai-pdm-retired-route: privacy`；此 tombstone 不提供 UI、API 或資料存取能力。

本機畫面證據：`.tmp/dev-070-ui-qc/login-390x844-final.png`、`.tmp/dev-070-ui-qc/login-1024x768-final.png`、`.tmp/dev-070-ui-qc/login-1440x900-final.png`、`.tmp/dev-070-ui-qc/invitation-390x844-final.png`。

## 資料保護確認

- `db/schema.sql` 的 `privacy_notice_versions`／`privacy_notice_acknowledgements` 及 immutable trigger 保留。
- `db/postgres/015_employee_privacy_notice_acknowledgements.sql` 保留。
- 本次沒有 Cloud SQL migration、DML、資料修復或刪除。
- runtime 不再查詢或寫入上述歷史表。

## Production 待補證據

- release commit、GitHub Actions run、Cloud Run revision、image digest 與 100% traffic。
- 正式 Google named-user 登入直接返回原 `returnTo`。
- authenticated permissions、numbering search、approvals inbox 無 428／503／500。
- 10 分鐘 read-only soak 與 Cloud Run error log。
- 正式 `/privacy*` 與 `/api/privacy*` 404、登入頁無舊紅字。
