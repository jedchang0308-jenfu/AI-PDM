# QA Plan: PDM Google Identity

日期: 2026-07-10
DEV: `DEV-PDM-GOOGLE-IDENTITY-001` / `DEV-043`
範圍: 本地實作與 production-like build；不包含 live Google Cloud/Supabase/production 操作。

## 驗證目標

- 有 Google 與無 Google 使用者都解析到穩定 PDM `users.id`。
- Google 初次綁定必須源自管理員邀請；未知 email、相同 domain 或相同顯示 email不能自動取得帳號或角色。
- OAuth state、nonce、PKCE、ID token audience/signature/expiry 與 verified email 在 server-side 驗證。
- 停用帳號、disabled identity、email mismatch、重複 Google `sub`、重複邀請與竄改 state 必須 fail closed。
- access/ID/refresh token、client secret、邀請 token 不得出現在 DB、API 清單或 audit。
- 既有本機密碼、邀請、managed auth 與 production-slice route 不得回歸。
- Google 未設定時 UI 保留停用控制及未開放提示；桌面與手機不得 overflow、裁切或重疊。

## 測試矩陣

| Gate | 案例 | 預期 |
|---|---|---|
| Identity | 本機密碼啟用 | 建立 `local_password` + `invite` identities，同一 PDM user ID |
| Identity | Google 邀請啟用 | 建立 `google_oauth` + `invite` identities，不建立 password hash |
| Negative | 未知 Google `sub` | 不能自助註冊，回 `google_account_not_linked` |
| Negative | 邀請 email mismatch | 不建立 user，邀請維持 pending |
| Negative | 相同 `sub` 綁第二 user | transaction rollback，回 identity conflict |
| Security | state tamper | token exchange 前拒絕 |
| Security | suspended user / existing session | 新登入與舊 session 都 401/fail closed |
| Security | token persistence | DB/audit 無 access/ID/refresh token 或 secret |
| Migration | SQLite/PostgreSQL/Supabase | schema parity、source hash、RLS、direct Data API deny |
| Regression | managed/local invitation | 現有登入、token、logout、邀請接受與撤銷皆通過 |
| UI | desktop + 390x844 | 控制可見、未開放提示清楚、無水平溢位、console 無錯誤 |

## 證據命令

- `npm.cmd run qc:pdm-google-identity`
- `npm.cmd run qc:pdm-account-invitations`
- `npm.cmd run qc:managed-auth`
- `npm.cmd run qc:supabase-runtime-migrations`
- `npm.cmd run qc:postgres-shadow`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run lint`
- isolated `next build` using `PDM_NEXT_DIST_DIR`

## 停止條件

- 需要真實 Google credential、consent screen、正式 redirect URI 或傳送真實公司帳號資料。
- 需要 live Supabase migration、provider enable、production smoke、deploy 或資料修復。
- 需求改成 Google 自助註冊、domain/group 自動授權或 Google 角色成為 PDM 權限權威。
