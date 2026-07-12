# QA-PDM-ACCOUNT-INVITATION-001 驗證計畫

日期: 2026-07-10
對應 DEV: `DEV-PDM-ACCOUNT-INVITATION-001` / `DEV-042`

## 目的

驗證 Admin 可建立可寄送的一次性邀請，內部人員可自行設定密碼並登入；token、角色、公司範圍、production slice 與 audit 均 fail closed。

## 驗收矩陣

| 範圍 | 必要驗收 |
|---|---|
| 權限 | 只有 `Admin` 可建立、查看、撤銷邀請；非 Admin 回 403 |
| token | 32-byte 隨機 token，只存 SHA-256 hash；清單不回傳 token/hash；只能使用一次 |
| 狀態 | pending 可接受；accepted/revoked/expired/invalid 均拒絕並告知下一步 |
| 帳號 | 接受前不建立 user；接受後建立指定角色、JENFU membership、scrypt password 與 session |
| 密碼 | 10-128 字元，至少一個英文字母與一個數字；前後端均提示 |
| 稽核 | create/accept/revoke 寫入 audit，detail 不含 token |
| production slice | 管理頁、接受頁與必要 API 開放；其他設定 mutation 維持 default-deny |
| UI | managed login 不顯示 demo credentials；1440/390 無重疊、裁切、不可操作或可見 API error |
| Supabase | additive migration、RLS enabled/forced、`anon`/`authenticated` direct table access revoked |

## 證據命令

- `npm.cmd run qc:pdm-account-invitations`
- `npx.cmd tsc --noEmit --pretty false`
- `npm.cmd run qc:postgres-shadow`
- `npm.cmd run qc:supabase-runtime-migrations`
- `npm.cmd run qc:pdm-production-slice-numbering-draft`
- Playwright screenshots under `output/playwright/account-invitation*.png` and `managed-login-mobile.png`

## 範圍外

本 DEV 不包含 Google OAuth、MFA、自動寄信 provider、忘記密碼/重設、帳號停用/復權、離職、session 撤銷、live Supabase migration 與 production deploy；Google identity 本地實作另由 `DEV-PDM-GOOGLE-IDENTITY-001` / `DEV-043` 驗證。
