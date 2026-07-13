# QC-PDM-ACCOUNT-LIFECYCLE-001 - 帳號生命週期與安全管理台驗證報告

日期：2026-07-13
DEV：`DEV-PDM-ACCOUNT-LIFECYCLE-001` / `DEV-045`
SPEC：`.ai-doc/specs/SPEC-PDM-ACCOUNT-LIFECYCLE-001-admin-account-security-console.md`
QA：`.ai-doc/qa/qa-pdm-account-lifecycle-validation-plan-2026-07-12.md`
結論：Phase 1 本機範圍通過。production、live provider、Supabase Auth/MFA、merge、PR、deploy 與 release gate 未執行。

## 驗證範圍

- 「帳號與權限」單一管理入口與 `/settings/accounts` 可由 Admin 開啟。
- Admin 帳號清單、明細、停權、復權、離職、session 撤銷、identity 停用、一次性密碼重設與 recovery API。
- reset token hash-only、一次性使用、重用拒絕、audit 不洩漏 raw token/reset URL。
- suspended account 拒絕新登入與舊 session；manual revoke 使舊 cookie 失效。
- disabled local identity 完成 password reset 後仍維持 disabled。
- 角色指派開始／到期區間在 permission path 生效，未生效與已到期角色不給權限。
- SQLite/PostgreSQL/Supabase migration mirror 與 recovery table RLS/default-deny。
- 邀請帳號、Google identity、production slice 與 TypeScript/lint 回歸。

## 命令證據

| 命令 | 結果 | 備註 |
|---|---:|---|
| `npm run qc:pdm-account-lifecycle` | 通過 26/26 | 覆蓋 Admin/non-Admin、session revoke、suspend/reactivate、identity disable、password reset、role time window、audit/token redaction |
| `npm run qc:pdm-account-invitations` | 通過 25/25 | 邀請流程、hash-only token、provider-neutral identity 回歸 |
| `npm run qc:pdm-google-identity` | 通過 19/19 | Google 邀請式綁定、suspended fail-closed、audit 不含 OAuth token |
| `npm run qc:pdm-production-slice-numbering-draft` | 通過 27/27 | 新增 account APIs 後 production slice 仍 default-deny，僅 allowlist DEV-045 明列 mutation |
| `npm run qc:supabase-runtime-migrations` | 通過 39/39 | 新增 `009_account_lifecycle` mirror、manifest hash、recovery token hash-only、RLS/default-deny |
| `npx tsc --noEmit` | 通過 | 清理 Next QC 暫存 include 後仍通過 |
| `npm run lint` | 0 errors / 3 existing warnings | 本輪新增帳號頁 hook warning 已修正；剩餘 warning 在 `src/components/master-attachment-panel.tsx`，非 DEV-045 修改範圍 |
| `npm run build` | 未完成 | `prebuild` guard 偵測 `127.0.0.1:3000` 已有 `node.exe` dev server，拒絕清除 `.next`；未停用 server、未使用 bypass |

## 重要觀察

- 帳號清單回傳內容未包含 password hash、token hash、raw secret 或 reset token。
- reset URL 只在建立 API 回傳一次；資料庫只存 SHA-256 token hash。
- reset token 重用回 `410`，不能再次完成。
- `AccountPasswordResetCreated` / `Completed` audit 只記錄 request ID、user ID 與 expiry，不記錄 raw token 或 reset URL。
- `session_invalid_before` 讓撤銷前 cookie 在下一請求回 `401`。
- 停權帳號無法登入，復權後必須重新登入，舊 session 不復活。
- disabled local identity reset 後仍為 `disabled`，不會因改密碼偷偷啟用。
- 未生效與已到期角色指派不授權；有效區間內才取得對應權限。

## 殘留風險與邊界

- `npm run build` 尚未取得完成證據，原因是本機 3000 port 有健康 dev server，專案 guard 禁止清 `.next`；後續 release gate 前需在可停止 server 或隔離 worktree 中補 build。
- Phase 1 本機完成不代表 production ready；正式 deploy、live Supabase migration、provider pointer、Supabase Auth/MFA、rollback、production smoke 仍需 `DEV-030` / `DEV-031` / `DEV-032` release gate。
- Phase 2 自助密碼、session device visibility 與 email delivery adapter 尚未執行。
- Phase 3 Supabase Auth、MFA 與中央 offboarding 尚未執行。
- 未修改 ProJED，未執行 production data migration 或 direct data repair。
