# QC Report: PDM Google Identity

日期: 2026-07-10
DEV: `DEV-PDM-GOOGLE-IDENTITY-001` / `DEV-043`
結論: **本地 QC 通過；尚未進入 live provider / migration / release gate。**

## 結果

| Evidence | Result |
|---|---|
| `npm.cmd run qc:pdm-google-identity` | PASS 19/19 |
| `npm.cmd run qc:pdm-account-invitations` | PASS 25/25 |
| `npm.cmd run qc:managed-auth` | PASS 21/21 |
| `npm.cmd run qc:supabase-runtime-migrations` | PASS 33/33 |
| `npm.cmd run qc:postgres-shadow` | PASS 26/26 |
| `npm.cmd exec tsc -- --noEmit` | PASS |
| `npm.cmd run lint` | PASS, 0 errors; 3 pre-existing warnings in `master-attachment-panel.tsx` |
| isolated Next production build | PASS; Google start/callback routes included |

## 事實確認

- Mock OIDC 已驗證 authorization code、state、nonce、PKCE S256、audience/signature/expiry 與 verified email。
- 未知 Google `sub` 不會依 email 或 domain 自動建立 PDM user。
- Google 邀請啟用保留原邀請 role/company，建立無 password hash 的 user，並寫入 `google_oauth` + `invite` identities。
- Email mismatch、同一 `sub` 綁第二 user、state tamper 均 fail closed，transaction 無殘留 user 或已消耗邀請。
- `suspended` user 不能重新登入，既有 HMAC PDM session 下一次解析回 401。
- DB/audit 未保存 access token、ID token、refresh token、client secret 或原始邀請 token。
- `auth_identities` PostgreSQL/Supabase migration 強制 RLS，撤銷 `anon`/`authenticated` 直接表權限；Supabase CLI 未安裝，因此未執行 migration history 或 live apply。
- UI 在 desktop 與 390x844 顯示 Google 控制；未設定 provider 時按鈕停用並標示「未開放」，無水平 overflow，browser console 無 errors/warnings。

## UI 證據

- `output/playwright/google-identity-login-desktop.png`
- `output/playwright/google-identity-login-mobile.png`
- `output/playwright/google-identity-invite-mobile.png`

## Release 邊界

本報告不證明 Google Cloud OAuth Web client、consent screen、正式 redirect URI、正式 secret、live Supabase migration、production provider enable 或部署已完成。這些項目必須由 `DEV-032` / deployment release gate 另行執行與驗證。
