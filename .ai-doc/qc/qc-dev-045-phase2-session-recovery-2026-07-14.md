# QC DEV-045 Phase 2 - Provider Recovery Handoff and Session Visibility

日期：2026-07-14
任務：`DEV-045` / `DEV-PDM-ACCOUNT-LIFECYCLE-001`
範圍：本機 Phase 2 slice；不含 live Firebase/Cloud Identity 寄信、Cloud SQL live migration、staging、production、deploy 或 release。

## Result

QC 結論：通過。

- `npm run qc:dev-045-phase2`：14/14 passed
- `npm run qc:supabase-runtime-migrations`：66/66 passed
- `npx tsc --noEmit`：passed
- `npm run lint`：0 errors / 3 existing warnings

## Covered

- Firebase-managed action email adapter 使用 provider `PASSWORD_RESET` request shape，不產生 AI_PDM reset token。
- Public recovery handoff 使用 generic response，未知帳號／非 active 帳號不列舉。
- `account_session_records` 只保存 hashed session ID、hashed user agent、縮減 IP、issued/last-seen/expires/revoked metadata。
- 使用者可列出目前與其他 session；payload 不回傳 raw token 或完整 user-agent。
- 使用者不能在 session list 撤銷目前 session，需使用 logout。
- 使用者可撤銷其他 session；被撤銷 cookie 後續 `/api/auth/me` 回 401。
- logout 會同步撤銷 registry record；登出後 cookie 後續回 401。
- production-slice gate 已最小放行 account-safety 頁面與 mutation，不放行其他未開放模組。
- PostgreSQL/Supabase migration mirror 與 RLS deny-list 包含 `account_session_records`。

## Integration Finding

首輪 `npm run qc:dev-045-phase2` 在 current-session revoke negative test 收到 `feature_not_open_in_production_slice` 403。判定為 DEV-045 Phase 2 與既有正式領號 / 草稿 production-slice allowlist 的整合衝突，而不是 session revoke domain logic 失敗。

修正：將 `/account/security`、`/account-recovery/request`、`POST /api/account-recovery/handoff`、`POST /api/account/sessions/:sessionId/revoke` 作為 account-safety surface 加入 production-slice allowlist。重跑 focused QC 後 14/14 passed。

## Not Executed

- 未連 live Firebase/Cloud Identity，未送出真實 provider recovery email。
- 未完成 authorized domain、action-email template/quota、寄送責任或 privacy retention 的 live gate。
- 未建立 AI_PDM 自有 password/reset/MFA authority。
- 未建立第二套 session/token authority；registry 只作 DEV-046 `pdm_session` v2 / BFF session authority 的 additive visibility/revocation metadata。
- 未執行 Cloud SQL live migration、staging、production、merge、PR、deploy、rollback、production smoke 或 ProJED 修改。
